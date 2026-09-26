/*
 * Tasarım A — 3S ASPİLSAN A28 paket + XL4015 + ATmega328P + balanslı 3S BMS
 * Arayüzden bağımsız (headless) sistem modeli. Tarayıcıda window.ChargerA,
 * Node'da module.exports.
 *
 * Katmanlar:
 *   Fiziksel  : adaptör → XL4015 (CV/CC + düşüm) → [röle] → [şönt] → BMS → 3 hücre
 *   Ölçüm     : gerilim bölücü + 10-bit ADC (Vcc referanslı) | INA219, TMP36
 *   Firmware  : 500 ms döngü, durum makinesi (rapordaki veya geliştirilmiş profil)
 *   BMS       : hücre OVP/UVP (gecikmeli), pasif balans, kısa devre kilidi
 */
(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./a28-model.js') : root.A28,
    typeof require === 'function' ? require('./ina219-model.js') : root.INA219Model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChargerA = api;
})(typeof self !== 'undefined' ? self : this, function (A28, INA219) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const CHARGE_MODES = Object.freeze([
    { name: 'Yavaş', amps: 1 }, { name: 'SAFE', amps: 1.4 }, { name: 'Dengeli', amps: 2.1 },
    { name: 'FAST', amps: 2.8 }, { name: 'BOOST', amps: 3.5 }, { name: 'MAX', amps: 4 },
  ].map(Object.freeze));

  // ------------------------------------------------------------------------
  // Varsayılan konfigürasyonlar
  // ------------------------------------------------------------------------
  const HARDWARE_REPORT = {
    powerMethod: 'direct-fb',   // pot sökülü, filtrelenmiş PWM doğrudan FB'ye
    isense: 'shunt1',           // 1 Ω şönt → A3, bölücü → A2 (low-side şönt)
    lcdBus: 'i2c',              // I²C LCD (A4/A5)
    pwmBits: 8,                 // analogWrite(D6), Timer0
  };
  const HARDWARE_IMPROVED = {
    powerMethod: 'injection',   // CV potu yerine sabit R_üst (tavan 12.60 V); PWM diyot+R ile FB'ye enjekte edilir
    isense: 'ina219',           // 0.05 Ω high-side şönt; INA219 0x40, LCD 0x27 → A4/A5
    lcdBus: 'i2c',              // A3 kullanıcı potu, D2/D3/D4 sıcaklık çoklayıcı seçimi
    pwmBits: 10,                // Timer1 10-bit PWM (D9)
  };
  const FIRMWARE_REPORT = {
    profile: 'report',
    iSafe: 1.0, iFast: 1.0,     // rapor kodu simCurrent = 1.0 A
    vCv: 12.6, iCut: 0.10,
    tDerate: 35, tCut: 45, tResume: 30,
    lowTempInhibit: false, sensorCheck: false, safetyTimerMin: 0,
    doneDebounceS: 0, subtractShuntDrop: false,
    cellMonitor: false, vccCal: false, watchdog: false, adcAvg: 1, swOvp: false,
    preChargeV: 0, preChargeA: 0.14,
    tempMux: false,
  };
  const FIRMWARE_IMPROVED = {
    profile: 'improved',
    iSafe: 1.4, iFast: 2.8,     // 0.5C (datasheet standart) / 1C (≤ 4 A maks.)
    vCv: 12.6, iCut: 0.14,      // datasheet kesme akımı 140 mA
    tDerate: 35, tCut: 45, tResume: 30,
    lowTempInhibit: true,       // < 0 °C şarj yasak (datasheet şarj penceresi 0–60 °C)
    sensorCheck: true,          // TMP36 kopuk/kısa devre algılama
    safetyTimerMin: 240,        // toplam şarj süresi sınırı
    doneDebounceS: 5, subtractShuntDrop: true,
    cutFilterS: 5,             // bitiş akımında PWM kuantalama çukurlarını süz; 5 s onay ayrıca uygulanır
    ccDeadbandA: 0.02,          // CC ölü bandı: |hata| < 20 mA ise PWM'e dokunma (±1 LSB titremesini keser)
    cellMonitor: true,          // ölçülen hücre gerilimini sınırlar; gerçek sınır kalibrasyona bağlı
    cellLimitV: 4.20,
    vccCal: true,               // Vcc, dahili 1.1 V bandgap ile ölçülüp ADC dönüşümünde kullanılır
    watchdog: true,             // WDT 1 s: kilitlenmede MCU reset → röle bırakır, PWM güvenli
    adcAvg: 16,                 // her kanal 16 örnek ortalaması (gürültü /4)
    swOvp: true,                // ölçülen paket > CV+20 mV ya da hücre > 4.215 V, 0.5 s → röle açılır (kilitli)
    preChargeV: 3.0,            // bir hücre < 3.0 V ise önce 0.05C ön şarj (derin deşarj koruması)
    preChargeA: 0.14,
    tempMux: true,             // 3× TMP36 → CD4051 → A0; en sıcak ve en soğuk hücreye göre koruma
    highRateMinC: 12,          // >2.8 A: üreticinin 10 °C alt sınırına 2 °C ölçüm payı
  };

  function defaultConfig() {
    return {
      // Güç katı
      adapterV: 19.5, adapterOn: true, // Sony VGP-AC19V14 · 4.7 A / 91.65 W
      adapterMaxA: 4.7, converterEfficiency: 0.90,
      powerMethod: HARDWARE_IMPROVED.powerMethod,
      // Donanım tavanı (Rev B): CV potu sökülür, yerine sabit R_üst. V_tavan = V_FB·(1 + R_üst/R_alt).
      // XL4015 V_FB = 1.225–1.275 V (±%2) → tavan multimetreyle ölçülüp R_üst düzeltilir (ceilTrim).
      rBot: 1000,            // modülün FB–GND direnci (R_alt), ölçülür
      vrefErrPct: 0,         // bu modülün V_FB sapması (%), datasheet ±2
      ceilTrim: true,        // tavan ölçülüp trimTargetV'ye düzeltildi mi
      trimTargetV: 12.60,
      xlCcA: 3.90,           // MAX ≤4 A: pot/ölçüm/ripple toplam +%2 kabul bütçesiyle 3.978 A
      xlCcErrorPct: 0,       // gerçek sapma; tolerans deneyleri için (otomatik güvenlik kırpması yok)
      xlCcTolerancePct: 2,   // prototipte doğrulanması gereken toplam üst sapma bütçesi
      xlVref: 1.25,          // XL4015 FB referansı
      // Enjeksiyon (Rev B), TI SLVA861 Denk. 3 ile aynı yapı:
      //   Vout = Vtavan − R_üst · max(0, V_PWM − V_D − V_FB) / (R_filtre + R3)
      // Filtre kapasitörü DC'de açık devre olduğundan R_filtre de seri yola dahildir.
      rTop: 9100,            // sabit R_üst (hesap: 9.08·R_alt → E24 9.1 kΩ); ayarsızken bu değer kullanılır
      rInj: 5100,            // R3
      rFilt: 1000,           // R4 (PWM filtresi), C1 = 100 µF → τ = 0.1 s
      diodeV: 0.65,          // D1 = 1N4148 (düşük kaçak; Schottky'nin kaçağı tavanı kaydırır)
      rcTauS: 0.1,
      // Rev A: pot sökülü, filtre doğrudan FB'ye. Modülün alt bölücü direnci yerinde kalırsa
      // FB = V_PWM · R_alt / (R_filtreA + R_alt) olur. 0 = alt direnç yok (en iyi durum).
      rFiltA: 10000, rBotA: 0,
      pwmBits: HARDWARE_IMPROVED.pwmBits,
      rPathOhm: 0.035,       // kablo + konnektör + BMS MOSFET + röle kontağı
      // Ölçüm
      isense: HARDWARE_IMPROVED.isense,
      vccErrPct: 0,          // Arduino 5 V hattının sapması (ADC referansı = Vcc)
      divR1: 10000, divR2: 4700,
      // Ayrık ölçüm (isense = 'discrete'): 0.1 Ω low-side şönt + op-amp, bölücü, Uno ADC'si
      shuntR: 0.1, ampGain: 10,     // LM358 evirmeyen ×10 (Rf 9.1k / Rg 1k); 2.8 A → 2.8 V < LM358 çıkış sınırı
      ampOffsetMv: 3,               // op-amp giriş ofseti (LM358 tipik 2, maks. 7 mV) → ×10 → akımda 30 mA hata
      autoZero: true,               // röle açıkken (I = 0) ofset ölçülüp çıkarılır
      divErrPct: 1.2,               // %1'lik dirençlerle bölücü oranı hatası (en kötü ≈ ±2 %)
      vCal: true,                   // multimetreyle tek noktalı kalibrasyon: bölücü + Vcc hatası giderilir (kalan %0.1)
      lcdBus: HARDWARE_IMPROVED.lcdBus, // tek LCD: 'i2c' (A4/A5) ya da 'parallel' (D2–D6, D8); ayrık ölçümde paralel gerekir
      adcNoiseLsb: 0.5,
      inaGainErrPct: 0.3,
      inaBusErrPct: 0.3,
      inaShuntR: 0.05, inaCalShuntR: 0.05, inaShuntErrPct: 0,
      inaCurrentLsbA: 0.0002, inaShuntRangeV: 0.32, inaBusRangeV: 16,
      inaOffsetUv: 0, inaConnected: true,
      tempSensorOk: true,
      tempSensorCell: 1,     // TMP36 hangi hücreye yapışık (0..2)
      tempSensorFaultIndex: -1, // çoklayıcıda kopuk kanal; -1: hepsi sağlam
      // Firmware
      ...FIRMWARE_IMPROVED,
      fast: false,
      chargeCurrentA: null,  // null: SAFE/FAST; sayı: canlı kullanıcı ayarı (1.0–4.0 A)
      loopS: 0.5,
      // BMS (tipik 3S 20 A balanslı kart: HY2213 balans + koruma IC)
      bmsPresent: true,      // false: BMS yok, hücreler doğrudan bağlı (koruma yalnız firmware + sigorta)
      fuseA: 5,              // paket + ucundaki sigorta (F1)
      bmsOvp: 4.25, bmsOvpRel: 4.15, bmsOvpDelayS: 1.0,
      bmsUvp: 2.50, bmsUvpRel: 3.00,
      balV: 4.18, balA: 0.06, balanceOn: true,
      // Paket / ortam
      ambientC: 25, extraHeatW: 0, rthKW: 15,
      loadA: 0,
      fwFrozen: false,       // arıza enjeksiyonu: firmware döngüsü takıldı (çıkışlar son değerde)
      pwmBroken: false,      // arıza enjeksiyonu: PWM → FB kablosu koptu (enjeksiyon yok)
      // Gerçekçi üretim dağılımı (aynı parti A28 hücreleri): kapasite (datasheet min. 2700 mAh),
      // iç direnç, kendi kendine boşalma, coulomb verimi; ortadaki hücre daha zor soğur.
      cells: REALISTIC_CELLS.map(x => Object.assign({ soc: 0.2 }, x)),
      bmsQuA: [8, 5, 6],     // BMS'in hücre başına çektiği sükûnet akımı (µA)
      loadCutoffV: 0,        // cihazın paket düzeyindeki düşük gerilim kesmesi (0 = yok)
    };
  }
  const REALISTIC_CELLS = [
    { capacityScale: 1.000, rScale: 1.00, ce: 0.9998, sdPctMonth: 2.0, rthScale: 1.00 },
    { capacityScale: 0.985, rScale: 1.07, ce: 0.9994, sdPctMonth: 3.0, rthScale: 1.25 },
    { capacityScale: 0.970, rScale: 0.96, ce: 0.9996, sdPctMonth: 2.2, rthScale: 1.00 },
  ];
  const IDEAL_CELLS = [0, 1, 2].map(() => ({ capacityScale: 1, rScale: 1, ce: 1, sdPctMonth: 2.0, rthScale: 1 }));

  function vrefOf(c) { return c.xlVref * (1 + (c.vrefErrPct || 0) / 100); }
  function rTopEff(c) { return c.ceilTrim ? c.rBot * (c.trimTargetV / vrefOf(c) - 1) : c.rTop; }
  function ceilingOf(c) { return vrefOf(c) * (1 + rTopEff(c) / c.rBot); }
  function gainOf(c) { return rTopEff(c) / (c.rFilt + c.rInj); }

  function presetFor(kind) {
    const c = defaultConfig();
    // CC pot = 1.0 A: rapordaki hedef akım (en iyi durum varsayımı)
    if (kind === 'report') Object.assign(c, HARDWARE_REPORT, FIRMWARE_REPORT, { xlCcA: 1.0, adapterV: 15 });
    return c;
  }

  // ------------------------------------------------------------------------
  // Sistem
  // ------------------------------------------------------------------------
  class SystemA {
    constructor(cfg) {
      this.cfg = Object.assign(defaultConfig(), cfg || {});
      this.cfg.cells = (this.cfg.cells || defaultConfig().cells).map(c => Object.assign({}, c));
      this.reset();
    }

    reset() {
      const c = this.cfg;
      this.t = 0;
      this.cells = c.cells.map(x => new A28.Cell({
        soc: x.soc, tempC: c.ambientC, capacityScale: x.capacityScale, rScale: x.rScale,
        ce: x.ce, sdPctMonth: x.sdPctMonth, rthScale: x.rthScale,
        params: { rthKW: c.rthKW },
      }));
      this.hw = {
        duty: 0, vFilt: 0, vOut: 0, xlMode: 'OFF', relay: false,
        iCharge: 0, iPack: 0, vPack: this.packV(0), fuseBlown: false,
      };
      this.bms = {
        chgFet: true, dsgFet: true, reason: 'Hazır', shortTrip: false, ovpTimer: 0,
        bal: [false, false, false], trips: 0,
      };
      this.fw = {
        state: 'CC_MODE', dutyF: 0, loopAcc: 0, doneTimer: 0, chargeTime: 0,
        meas: { v: 0, i: 0, t: 25, a0: 0, a2: 0, a3: 0, cells: [0, 0, 0] },
        sensorT: c.ambientC, sensorTs: [c.ambientC, c.ambientC, c.ambientC], lastState: '', noCurrentTimer: 0,
      };
      this.events = [];
      this.stats = { maxCellV: 0, minCellV: 9, maxTemp: c.ambientC, chargedAh: 0, chargedWh: 0, dischargedAh: 0, dischargedWh: 0,
        ovpTrips: 0, uvpTrips: 0, doneAt: null, dsgStart: null, dsgEnd: null, peakChargeA: 0, maxShuntW: 0 };
      this.history = [];
      this._histAcc = 1e9;
      // İlk ölçüm, firmware başlangıç çıkışı
      this.measure();
      this.fw.dutyF = this.cfg.powerMethod === 'injection' ? this.pwmMax() : 0;
    }

    log(msg, kind = '') { this.events.push({ t: this.t, msg, kind }); }
    pwmMax() { return (1 << this.cfg.pwmBits) - 1; }
    vcc() { return 5 * (1 + this.cfg.vccErrPct / 100); }
    packV(i) { return this.cells.reduce((a, x) => a + x.terminalV(i), 0); }
    rShunt() { return this.cfg.isense === 'shunt1' ? 1.0 : this.cfg.isense === 'discrete' ? this.cfg.shuntR : INA219.shuntResistance(this.cfg); }
    hardwareCurrentLimit() { return Math.max(0, this.cfg.xlCcA * (1 + this.cfg.xlCcErrorPct / 100)); }

    // --- Güç katı: XL4015'in komut ettiği çıkış ---------------------------
    /** Etkin R_üst: tavan ölçülüp düzeltildiyse hedefe göre, değilse takılan sabit değer. */
    rTopEff() { return rTopEff(this.cfg); }
    ceilV() { return ceilingOf(this.cfg); }
    /** R_üst / (R_filtre + R3): PWM'deki 1 V'luk değişimin çıkışta yaptığı değişim (V/V). */
    injGain() { return gainOf(this.cfg); }
    /** Rev A'da FB pinindeki gerilim. */
    fbDirect() { const c = this.cfg, v = this.hw.vFilt; return c.rBotA > 0 ? v * c.rBotA / (c.rFiltA + c.rBotA) : v; }
    converterSetpoint() {
      const c = this.cfg, h = this.hw;
      if (!c.adapterOn) return { mode: 'OFF', vSet: 0 };
      if (c.powerMethod === 'injection') {
        // Vout = Vtavan − (R_üst/R_enj)·max(0, Vpwm − Vd − Vref)
        const inj = Math.max(0, h.vFilt - c.diodeV - c.xlVref);
        return { mode: 'CV', vSet: Math.max(0, this.ceilV() - this.injGain() * inj) };
      }
      // Doğrudan FB: Vout'tan FB'ye geri besleme yok. Hata yükseltecinin (integratör) tek
      // girdisi filtrelenmiş PWM → çıkış iki uca gider (datasheet: VFB = 0 V'ta duty %100).
      if (this.fbDirect() < c.xlVref) return { mode: 'FULL', vSet: Infinity };
      return { mode: 'OFF', vSet: 0 };
    }

    solveCurrent() {
      const c = this.cfg, h = this.hw, b = this.bms;
      const sp = this.converterSetpoint();
      const vb = this.cells.reduce((a, x) => a + x.vBehindR0, 0);
      const rc = this.cells.reduce((a, x) => a + x.r0, 0);
      const rext = c.rPathOhm + this.rShunt();
      // BMS yoksa yükü kesen bir şey yok; ancak bir hücre tamamen boşalınca gerilim çöker ve yük akım çekemez
      const empty = this.cells.some(x => x.soc <= -0.04);   // ≈ 0.5 V: hücre tükendi
      const dsgPath = c.bmsPresent ? (b.dsgFet && !b.shortTrip) : !empty;
      const load = h.fuseBlown ? 0 : (dsgPath ? c.loadA : 0);
      let i = 0, mode = sp.mode;
      const pathOk = !h.fuseBlown && c.adapterOn && h.relay && (!c.bmsPresent || (b.chgFet && !b.shortTrip)) && sp.mode !== 'OFF';
      if (pathOk) {
        // Paket düğümü: Vn = vb + (i − load)·rc ;  şarj akımı i = (Vout − Vn)/rext
        const iFor = vout => (vout - vb + load * rc) / (rext + rc);
        const vDropMax = c.adapterV - 0.4;                 // XL4015 düşüm (≈0.4 V + I·0.15 Ω)
        const iHead = (vDropMax - vb + load * rc) / (rext + rc + 0.15);
        const iCv = sp.vSet === Infinity ? Infinity : iFor(sp.vSet);
        const pAvailable = c.adapterV * c.adapterMaxA * c.converterEfficiency;
        const v0 = vb - load * rc, rTotal = rext + rc;
        const iPower = 2 * pAvailable / (Math.sqrt(v0 * v0 + 4 * rTotal * pAvailable) + v0);
        const iHardware = this.hardwareCurrentLimit();
        i = Math.min(iCv, iHead, iHardware, iPower);
        if (i === iPower) mode = 'POWER';
        else if (i === iHardware) mode = 'CC(pot)';
        else if (i === iHead) mode = 'DROPOUT';
        else mode = 'CV';
        i = Math.max(0, i);                                // asenkron buck akım çekemez
      } else mode = sp.mode === 'OFF' || !c.adapterOn ? 'OFF' : 'BLOCKED';
      h.xlMode = mode;
      h.iCharge = i;
      h.iPack = i - load;
      h.vPack = this.cells.reduce((a, x) => a + x.vBehindR0 + h.iPack * x.r0, 0);
      h.vOut = i > 0 ? h.vPack + i * rext : (sp.mode === 'OFF' ? 0 : Math.min(sp.vSet, c.adapterV - 0.4));
      return i;
    }

    // --- BMS -------------------------------------------------------------
    updateBms(dt) {
      const c = this.cfg, b = this.bms, h = this.hw;
      const vs = this.cells.map(x => x.terminalV(h.iPack));
      const mx = Math.max(...vs), mn = Math.min(...vs);
      if (!c.bmsPresent) {
        b.chgFet = true; b.dsgFet = true; b.bal = [false, false, false]; b.reason = h.fuseBlown ? 'BMS yok · sigorta attı' : 'BMS yok';
        const w = this.stats.warn || (this.stats.warn = {});
        const k = vs.indexOf(mx) + 1, j = vs.indexOf(mn) + 1;
        if (mx > c.bmsOvp && !w.ov) { w.ov = true; this.log(`BMS yok: Hücre ${k} ${mx.toFixed(3)} V > ${c.bmsOvp} V — kesen bir donanım yok (aşırı şarj)`, 'bad'); }
        if (mn < 2.5 && h.iPack < 0 && !w.ud) { w.ud = true; this.stats.overDischarge = true; this.log(`BMS yok: Hücre ${j} ${mn.toFixed(3)} V < 2.50 V (datasheet deşarj sonu) — yük kesilmedi, aşırı deşarj`, 'bad'); }
        if (mn < 2.0 && !w.dmg) { w.dmg = true; this.log(`Hücre ${j} 2.0 V altına indi: bakır çözünmesi ve kalıcı kapasite kaybı riski; bu hücre yeniden şarj edilmemeli`, 'bad'); }
        if (this.cells.some(x => x.soc <= -0.04) && !w.empty && h.iPack <= 0) { w.empty = true; this.log('Hücre tamamen boşaldı: gerilim çöktü, yük akım çekemiyor', 'bad'); }
        return vs;
      }
      if (b.shortTrip) { b.chgFet = false; b.dsgFet = false; b.reason = 'KISA DEVRE KİLİDİ'; return vs; }
      if (mx >= c.bmsOvp) {
        b.ovpTimer += dt;
        if (b.chgFet && b.ovpTimer >= c.bmsOvpDelayS) {
          b.chgFet = false; b.trips++; this.stats.ovpTrips++;
          b.reason = `Hücre ${vs.indexOf(mx) + 1} OVP`;
          this.log(`BMS: Hücre ${vs.indexOf(mx) + 1} ${mx.toFixed(3)} V ≥ ${c.bmsOvp} V → şarj MOSFET'i KAPALI`, 'bad');
        }
      } else b.ovpTimer = 0;
      if (!b.chgFet && Math.max(...this.cells.map(x => x.ocv)) <= c.bmsOvpRel) {
        b.chgFet = true; b.reason = 'Hazır';
        this.log(`BMS: tüm hücreler ≤ ${c.bmsOvpRel} V → şarj MOSFET'i tekrar AÇIK`, 'warn');
      }
      if (mn <= c.bmsUvp && b.dsgFet) {
        b.dsgFet = false; b.reason = 'UVP'; this.stats.uvpTrips++; this.stats.dsgEnd = this.t;
        this.log(`BMS: Hücre ${vs.indexOf(mn) + 1} ${mn.toFixed(3)} V ≤ ${c.bmsUvp} V → deşarj MOSFET'i KAPALI`, 'bad');
      } else if (!b.dsgFet && (mn >= c.bmsUvpRel || (c.adapterOn && h.iCharge > 0.01))) {
        // Tipik BMS: UVP kilidi, hücreler toparlanınca ya da şarj cihazı bağlanınca açılır
        b.dsgFet = true; if (b.chgFet) b.reason = 'Hazır';
        this.log('BMS: deşarj MOSFET\'i tekrar AÇIK', 'ok');
      }
      b.bal = vs.map(v => c.balanceOn && v >= c.balV);
      return vs;
    }

    /**
     * Depolama: adaptör ve yük yok, 'days' gün hızlı ileri sarılır. Hücreler kendi kendine boşalır;
     * BMS (varsa) ve paket bölücüsü (R6+R7, her zaman bağlı) akım çeker. Bölücü tüm hücrelerden eşit çeker.
     */
    storage(days) {
      const c = this.cfg, hours = days * 24;
      const iDiv = c.isense === 'discrete' ? this.hw.vPack / (c.divR1 + c.divR2) : 0;
      this.cells.forEach((x, k) => {
        const q = x.iSelfDischarge * hours + (c.bmsPresent && c.bmsQuA ? c.bmsQuA[k] * 1e-6 * hours : 0) + iDiv * hours;
        x.soc = Math.max(-0.045, x.soc - q / x.capacityAh); x.vrc = 0; x.tempC = c.ambientC;
      });
      this.stats.storedDays = (this.stats.storedDays || 0) + days;
      this.log(`${days} gün depolandı (kendi kendine boşalma${c.bmsPresent ? ' + BMS' : ''}${iDiv ? ` + bölücü ${(iDiv * 1000).toFixed(2)} mA` : ''}). SOC: ${this.cells.map(x => (Math.max(0, x.soc) * 100).toFixed(1)).join(' / ')} %`, '');
    }

    /** Paket çıkışında kısa devre: BMS varsa kısa devre kilidi, yoksa F1 sigortası. */
    shortCircuit() {
      const c = this.cfg;
      if (c.bmsPresent) { this.bms.shortTrip = true; this.log('Kısa devre → BMS kısa devre korumasıyla kilitlendi (µs mertebesinde).', 'bad'); return; }
      const vb = this.cells.reduce((a, x) => a + x.vBehindR0, 0), r = this.cells.reduce((a, x) => a + x.r0, 0) + 0.02;
      const I = vb / r;
      this.hw.fuseBlown = true; this.stats.shortA = I;
      this.log(`Kısa devre, BMS yok: ≈ ${I.toFixed(0)} A akar → F1 (${c.fuseA} A) attı; paket devreden ayrıldı. Sigorta olmasaydı hücreler ve kablolar aşırı ısınırdı.`, 'bad');
    }
    /** Kullanıcı isteği: 'CHARGE' şarj et, 'USE' yükü besle (adaptör çekili), 'REST' beklet. */
    requestMode(mode, loadA = 2.9) {
      const c = this.cfg, f = this.fw;
      if (mode === 'CHARGE') {
        c.loadA = 0;
        if (!c.adapterOn) c.adapterOn = true;
        else if (!/CC_MODE|CV_MODE/.test(f.state)) f.state = 'MCU_OFF';   // yeniden tak: setup() baştan başlar
        this.log('İstek: şarj et (adaptör takılı, yük yok).', 'ok');
      } else if (mode === 'USE') {
        c.adapterOn = false; c.loadA = loadA;
        this.log(`İstek: kullan — adaptör çekildi, ${loadA} A yük bağlandı.`, 'warn');
      } else {
        c.adapterOn = false; c.loadA = 0;
        this.log('İstek: beklet — adaptör ve yük yok.', '');
      }
    }
    currentMode() { const c = this.cfg; return c.adapterOn ? (c.loadA > 0 ? 'CHARGE+LOAD' : 'CHARGE') : (c.loadA > 0 ? 'USE' : 'REST'); }

    /** Hücreleri, süreyi ve koruma durumunu sıfırlamadan şarj hızını değiştir. */
    setChargeCurrent(amps) {
      if (!Number.isFinite(amps)) throw new RangeError('Şarj akımı sonlu bir sayı olmalı');
      const a = Math.round(clamp(amps, 1, 4) * 10) / 10;
      this.cfg.chargeCurrentA = a;
      this.cfg.fast = a > this.cfg.iSafe;
      this.log(`Şarj hedefi ${a.toFixed(1)} A (${(a / 2.8).toFixed(2)}C); doluluk ve şarj süresi korundu.`);
      return a;
    }

    requestedCurrent() {
      return this.cfg.chargeCurrentA ?? (this.cfg.fast ? this.cfg.iFast : this.cfg.iSafe);
    }

    // --- Ölçüm zinciri ---------------------------------------------------
    /** 10-bit ADC; adcAvg > 1 ise örnek ortalaması (sonuç kesirli kod). */
    adc(vPin) {
      const n = Math.max(1, this.cfg.adcAvg | 0);
      let sum = 0;
      for (let k = 0; k < n; k++) {
        const noise = ((this.random || Math.random)() * 2 - 1) * this.cfg.adcNoiseLsb;
        sum += clamp(Math.round(vPin / this.vcc() * 1023 + noise), 0, 1023);
      }
      return sum / n;
    }
    /** Firmware'in ADC kodunu gerilime çevirirken varsaydığı Vcc. */
    vccAssumed() { return this.cfg.vccCal ? this.vcc() * 1.003 : 5.0; }
    measure() {
      const c = this.cfg, h = this.hw, f = this.fw, m = f.meas;
      const k = this.vccAssumed() / 1023;
      // TMP36: seçilen hücrenin yüzeyinde, ~8 s ısıl gecikme
      const cellT = this.cells[c.tempSensorCell].tempC;
      const sensors = c.tempMux ? f.sensorTs : [f.sensorT];
      const tempCodes = sensors.map((t, i) => this.adc(c.tempSensorOk && (!c.tempMux || c.tempSensorFaultIndex !== i) ? .5 + t / 100 : 0));
      m.a0 = tempCodes[c.tempMux ? c.tempSensorCell : 0];
      m.temps = tempCodes.map(code => (code * k - .5) * 100);
      m.t = Math.max(...m.temps); m.minT = Math.min(...m.temps);
      m.sensorValid = m.temps.every(t => Number.isFinite(t) && t >= -30 && t <= 110);
      if (c.isense === 'shunt1') {
        // Low-side 1 Ω şönt: bölücü paket+ ile sistem GND arasını görür = Vpaket + I·Rş
        const vNode = h.vPack + h.iCharge * 1.0;
        m.a2 = this.adc(vNode * c.divR2 / (c.divR1 + c.divR2));
        m.a3 = this.adc(h.iCharge * 1.0);
        const vRead = m.a2 * k * (c.divR1 + c.divR2) / c.divR2;
        m.i = m.a3 * k;
        m.v = c.subtractShuntDrop ? vRead - m.i * 1.0 : vRead;
      } else if (c.isense === 'discrete') {
        // Low-side 0.1 Ω → ×G op-amp → ADC. Bölücü paket+ ile GND arasını görür = Vpaket + I·Rş.
        const rs = c.shuntR, G = c.ampGain, off = c.ampOffsetMv / 1000;
        m.a3 = this.adc(Math.max(0, (h.iCharge * rs + off) * G));
        let iRaw = m.a3 * k / G / rs;
        // setup(): röle kapanmadan önce (I = 0) 16 örnekle ofset ölçülür; sonra röle açıkken güncellenir
        if (f.zeroI == null) f.zeroI = this.adc(Math.max(0, off * G)) * k / G / rs;
        if (c.autoZero && !h.relay) f.zeroI = f.zeroI * 0.9 + iRaw * 0.1;
        m.i = Math.max(0, iRaw - (c.autoZero ? f.zeroI : 0));
        const ratio = c.divR2 / (c.divR1 + c.divR2) * (1 + c.divErrPct / 100);
        const vNode = h.vPack + h.iCharge * rs;
        m.a2 = this.adc(vNode * ratio);
        // Firmware nominal oranı kullanır; kalibrasyon varsa gerçek orana ve gerçek Vcc'ye göre düzeltilmiş katsayı
        const kv = c.vCal ? (this.vcc() / 1023) * (1 + 0.001) / ratio : k * (c.divR1 + c.divR2) / c.divR2;
        m.v = m.a2 * kv - (c.subtractShuntDrop ? m.i * rs : 0);
      } else {
        m.ina = INA219.read(c, h.iCharge, h.vPack);
        m.v = m.ina.voltage; m.i = m.ina.current;
        m.sensorValid = m.sensorValid && m.ina.valid;
        m.a2 = Math.round(m.v / .004); m.a3 = m.ina.currentRegister;
      }
      if (c.cellMonitor) {
        // Arduino Uno: A0 TMP36, A1/A2 balans uçları (H1+, H2+), A4/A5 I²C. Paket üstü (H3+)
        // INA219 kullanılıyorsa onun bus geriliminden, yoksa A2'deki paket bölücüsünden (şönt
        // modunda A1/A3 dolu olduğundan uçlar yine A1/A2'ye sığmaz — model yine de hesaplar).
        const gndOff = c.isense === 'ina219' ? 0 : h.iCharge * this.rShunt();
        const vs = this.cells.map(x => x.terminalV(h.iPack));
        const nodes = [vs[0], vs[0] + vs[1]].map(v => v + gndOff);
        const ratios = [1, 2];            // H1+ doğrudan (≤ 4.3 V), H2+ 10k/10k bölücü
        const corr = c.subtractShuntDrop && c.isense !== 'ina219' ? m.i * this.rShunt() : 0;
        // Ayrık yöntemde DMM kalibrasyonu gerçek ADC referansını belirler; aynı ADC'yi paylaşan tüm kanallara uygulanır
        const kTap = c.isense === 'discrete' && c.vCal ? this.vcc() * 1.001 / 1023 : k;
        const read = nodes.map((v, j) => this.adc(v / ratios[j]) * kTap * ratios[j] - corr);
        const top = m.v;                  // paket üstü: INA219 veya düzeltilmiş bölücü ölçümü
        m.cells = [read[0], read[1] - read[0], top - read[1]];
      }
      return cellT;
    }

    // --- Firmware (500 ms döngü) -----------------------------------------
    setState(s, msg, kind = '') {
      if (this.fw.state !== s) { this.fw.state = s; if (msg) this.log(msg, kind); }
    }
    ccTarget() {
      const c = this.cfg, T = this.fw.meas.t;
      let t = this.requestedCurrent();
      if (c.profile === 'improved') {
        t = clamp(t, 0, c.isense === 'ina219' ? 4 : 2.8);
        if (t > 2.8 && (!c.tempMux || this.fw.meas.minT < c.highRateMinC)) t = 1.4;
      }
      if (c.preChargeV > 0 && c.cellMonitor && Math.min(...this.fw.meas.cells) < c.preChargeV) return c.preChargeA;
      if (T >= c.tDerate && T < c.tCut) t *= Math.max(0.2, 1 - (T - c.tDerate) / (c.tCut - c.tDerate));
      return t;
    }
    firmwareTick() {
      const c = this.cfg, f = this.fw, m = f.meas, h = this.hw;
      // Arduino adaptörden beslenir: adaptör yoksa MCU kapalı, röle bırakır, PWM pini boşta.
      if (!c.adapterOn) {
        if (f.state !== 'MCU_OFF') {
          f.prevState = f.state;
          this.setState('MCU_OFF', c.bmsPresent ? 'Adaptör yok → Arduino kapandı; röle açık. Paketi yalnızca BMS koruyor.'
            : 'Adaptör yok → Arduino kapandı. BMS de yok: deşarjı sınırlayan hiçbir koruma yok.', c.bmsPresent ? 'warn' : 'bad');
        }
        h.relay = false; f.dutyF = this.pwmMax(); return;
      }
      if (f.state === 'MCU_OFF') {
        f.chargeTime = 0; f.doneTimer = 0; this.stats.doneAt = null;
        f.dutyF = this.pwmMax();
        this.setState('CC_MODE', 'Adaptör takıldı → Arduino açıldı, setup() → CC_MODE', 'ok');
      }
      const T = m.t;
      const charging = f.state === 'CC_MODE' || f.state === 'CV_MODE';
      const off = () => { h.relay = false; f.dutyF = c.powerMethod === 'injection' ? this.pwmMax() : this.pwmMax(); };

      // 1) Güvenlik kontrolleri (öncelik sırası)
      if (c.sensorCheck && !m.sensorValid) {
        this.setState('SENSOR_FAULT', c.isense === 'ina219' && !m.ina.valid ? m.ina.reason : 'Sıcaklık sensörü okuması geçersiz → şarj durduruldu', 'bad');
      }
      // Sensör hatası kilitlidir; sıfır/taşmış okuma şarj tamam koşuluna ulaşamaz.
      if (f.state === 'SENSOR_FAULT') { off(); return; }
      if (c.profile === 'improved' && m.i > 4.0) this.setState('OC_FAULT', 'Ölçülen şarj akımı 4 A üstünde → röle açıldı (kilitli)', 'bad');
      if (f.state === 'OC_FAULT') { off(); return; }
      if (c.swOvp) {
        const mc = c.cellMonitor ? Math.max(...m.cells) : 0;
        if (m.v > c.vCv + 0.02 || mc > 4.215) f.ovTimer = (f.ovTimer || 0) + c.loopS; else f.ovTimer = 0;
        if (f.ovTimer >= 0.5 && f.state !== 'OV_FAULT')
          this.setState('OV_FAULT', `Yazılım OVP: paket ${m.v.toFixed(2)} V${c.cellMonitor ? `, en yüksek hücre ${mc.toFixed(3)} V` : ''} → röle açıldı (kilitli)`, 'bad');
        if (f.state === 'OV_FAULT') { off(); return; }
      }
      if (T >= c.tCut) {
        this.setState('TEMP_FAULT', `${T.toFixed(1)} °C ≥ ${c.tCut} °C → TEMP_FAULT, röle açıldı`, 'bad');
      }
      if (f.state === 'TEMP_FAULT') {
        if (T < c.tResume) this.setState('CC_MODE', `Sıcaklık ${c.tResume} °C altına indi → CC_MODE`, 'ok');
        else { off(); return; }
      }
      if (c.lowTempInhibit) {
        if (m.minT < 0 && f.state !== 'LOW_TEMP') this.setState('LOW_TEMP', `${m.minT.toFixed(1)} °C < 0 °C → şarj yasak`, 'warn');
        if (f.state === 'LOW_TEMP') { if (m.minT >= 3) this.setState('CC_MODE', 'Tüm hücreler ≥ 3 °C → CC_MODE', 'ok'); else { off(); return; } }
      }
      if (f.state === 'TIMEOUT' || f.state === 'CHARGE_DONE') { off(); return; }
      if (c.safetyTimerMin > 0 && f.chargeTime > c.safetyTimerMin * 60) {
        this.setState('TIMEOUT', `Güvenlik zamanlayıcısı (${c.safetyTimerMin} dk) doldu → şarj durduruldu`, 'bad'); off(); return;
      }
      h.relay = true;

      // 2) CC/CV durum geçişleri
      const maxCell = c.cellMonitor ? Math.max(...m.cells) : 0;
      if (f.state === 'CC_MODE' && m.v >= c.vCv) this.setState('CV_MODE', `Ölçülen paket ${m.v.toFixed(2)} V ≥ ${c.vCv} V → CV_MODE`, 'ok');
      if (f.state === 'CC_MODE' && c.cellMonitor && maxCell >= c.cellLimitV)
        this.setState('CV_MODE', `Hücre ${m.cells.indexOf(maxCell) + 1} ${maxCell.toFixed(3)} V ≥ ${c.cellLimitV} V → CV_MODE (hücre sınırlı)`, 'ok');
      if (f.state === 'CV_MODE') {
        const nearCeiling = m.v >= c.vCv - .03 || (c.cellMonitor && maxCell >= c.cellLimitV - .01);
        const cutCurrent = c.profile === 'improved' ? f.cutCurrent : m.i;
        if (cutCurrent <= c.iCut && (c.profile !== 'improved' || nearCeiling)) f.doneTimer += c.loopS; else f.doneTimer = 0;
        if (f.doneTimer > c.doneDebounceS && f.chargeTime > 10) {
          this.setState('CHARGE_DONE', `${c.profile === 'improved' ? 'Filtreli akım' : 'Akım'} ${cutCurrent.toFixed(3)} A ≤ ${c.iCut} A → ŞARJ TAMAM`, 'ok');
          this.stats.doneAt = this.t; off(); return;
        }
      }

      // 3) Kontrol çıkışı (tam sayı PWM; kuantalama gerçek)
      const max = this.pwmMax();
      const scale = max / 255;
      // Her iki yöntemde de duty ↑ ⇒ çıkış ↓ (enjeksiyonda FB'ye akım basılır; doğrudan
      // FB'de eşik aşılınca çıkış kapanır). Doğrudan FB için bu "en iyi durum"dur:
      // firmware polaritesi doğru varsayılır.
      if (f.state === 'CC_MODE') {
        const err = this.ccTarget() - m.i;
        if (Math.abs(err) > (c.ccDeadbandA || 0)) f.dutyF -= 3.0 * scale * err;
      }
      else {
        let errV = c.vCv - m.v;
        if (c.cellMonitor) errV = Math.min(errV, 3 * (c.cellLimitV - maxCell));
        // CV sırasında da mod değişimi ve termal akım sınırı geçerlidir.
        // İki regülatörden çıkışı daha çok kısan kazanır; gerilim tavanı korunur.
        const excessI = m.i - this.ccTarget();
        const currentCorrection = Math.abs(excessI) > (c.ccDeadbandA || 0) ? 3 * scale * excessI : 0;
        f.dutyF += Math.max(-40 * scale * errV, currentCorrection);
      }
      f.dutyF = clamp(f.dutyF, 0, max);
    }

    // --- Ana adım ---------------------------------------------------------
    step(dt) {
      const c = this.cfg, h = this.hw, f = this.fw;
      this.t += dt;
      // PWM → RC filtresi
      h.duty = Math.round(f.dutyF);
      const vTarget = c.pwmBroken ? 0 : h.duty / this.pwmMax() * this.vcc();
      h.vFilt += (vTarget - h.vFilt) * (1 - Math.exp(-dt / c.rcTauS));

      const i = this.solveCurrent();
      const vs = this.updateBms(dt);
      if (!this.bms.chgFet && i > 0) this.solveCurrent();

      // Hücreleri ilerlet
      // Cihazın paket düzeyindeki düşük gerilim kesmesi (hücreleri tek tek görmez)
      if (c.loadCutoffV > 0 && c.loadA > 0 && h.iPack < 0 && h.vPack < c.loadCutoffV) {
        c.loadA = 0; this.stats.deviceCut = (this.stats.deviceCut || 0) + 1;
        this.log(`Cihaz düşük pil kesmesi: paket ${h.vPack.toFixed(2)} V < ${c.loadCutoffV} V (hücreler: ${vs.map(v => v.toFixed(2)).join(' / ')} V)`, 'warn');
      }
      this.cells.forEach((cell, k) => {
        const bleed = (this.bms.bal[k] ? c.balA : 0) + (c.bmsPresent ? (c.bmsQuA ? c.bmsQuA[k] : 0) * 1e-6 : 0);
        cell.step(h.iPack, dt, c.ambientC, bleed, c.extraHeatW / 3);
      });
      // TMP36 ısıl gecikmesi
      const cellT = this.cells[c.tempSensorCell].tempC;
      f.sensorT += (cellT - f.sensorT) * (1 - Math.exp(-dt / 8));
      f.sensorTs.forEach((t, k) => { f.sensorTs[k] += (this.cells[k].tempC - t) * (1 - Math.exp(-dt / 8)); });

      if (f.state === 'CC_MODE' || f.state === 'CV_MODE') f.chargeTime += dt;
      this.stats.chargedAh += Math.max(0, h.iPack) * dt / 3600;
      this.stats.peakChargeA = Math.max(this.stats.peakChargeA, h.iCharge);
      this.stats.maxShuntW = Math.max(this.stats.maxShuntW, h.iCharge ** 2 * this.rShunt());
      this.stats.chargedWh += Math.max(0, h.iPack) * h.vPack * dt / 3600;
      if (h.iPack < -1e-3) {
        if (this.stats.dsgStart == null) this.stats.dsgStart = this.t;
        this.stats.dischargedAh += -h.iPack * dt / 3600;
        this.stats.dischargedWh += -h.iPack * h.vPack * dt / 3600;
      }
      this.stats.minCellV = Math.min(this.stats.minCellV, ...vs);
      this.stats.maxCellV = Math.max(this.stats.maxCellV, ...vs);
      this.stats.maxTemp = Math.max(this.stats.maxTemp, ...this.cells.map(x => x.tempC));

      f.loopAcc += dt;
      while (f.loopAcc >= c.loopS - 1e-9) {
        f.loopAcc -= c.loopS;
        this.measure();
        f.cutCurrent = f.cutCurrent == null ? f.meas.i : f.cutCurrent +
          (f.meas.i - f.cutCurrent) * (1 - Math.exp(-c.loopS / Math.max(.001, c.cutFilterS || .001)));
        if (c.fwFrozen) {
          f.frozenFor = (f.frozenFor || 0) + c.loopS;
          if (c.watchdog && f.frozenFor >= 1.0) {
            // WDT reset: pinler yüksek empedans → röle bırakır, PWM kesilir; setup() yeniden başlar
            c.fwFrozen = false; f.frozenFor = 0;
            h.relay = false; f.dutyF = this.pwmMax(); f.state = 'CC_MODE'; f.doneTimer = 0;
            this.log('Watchdog: firmware 1 s yanıt vermedi → MCU reset, çıkışlar güvenli konumda, CC_MODE ile yeniden başladı', 'warn');
          }
          continue;
        }
        f.frozenFor = 0;
        this.firmwareTick();
      }

      this._histAcc += dt;
      if (this._histAcc >= this.histEvery()) { this._histAcc = 0; this.record(vs); }
    }
    histEvery() { return 5; }
    record(vs) {
      const h = this.hw;
      this.history.push({
        t: this.t, v: h.vPack, i: h.iCharge, iL: Math.max(0, -h.iPack), ip: h.iPack, vMeas: this.fw.state === 'MCU_OFF' ? null : this.fw.meas.v, iMeas: this.fw.meas.i,
        c1: vs[0], c2: vs[1], c3: vs[2], T: Math.max(...this.cells.map(x => x.tempC)), Ts: this.fw.meas.t,
        duty: h.duty / this.pwmMax() * 100, vOut: h.vOut,
        soc: this.cells.map(x => x.soc), state: this.fw.state, bal: this.bms.bal.slice(),
      });
      if (this.history.length > 6000) this.history = this.history.filter((_, k) => k % 2 === 0);
    }
    /** 'seconds' kadar ilerle. Sabit dt adımları; adıma tam bölünmeyen kalan süre bir sonraki çağrıya aktarılır. */
    run(seconds, dt = 0.05) {
      const total = seconds + (this._carry || 0);
      const n = Math.floor(total / dt + 1e-9);
      this._carry = total - n * dt;
      for (let k = 0; k < n; k++) this.step(dt);
    }
    runUntilDone(maxHours = 5, dt = 0.05) {
      const end = this.t + maxHours * 3600;
      while (this.t < end) {
        this.step(dt);
        const s = this.fw.state;
        if (s === 'CHARGE_DONE' || s === 'TIMEOUT') { this.run(60, dt); break; }
      }
      return this.summary();
    }
    summary() {
      const s = this.stats;
      return {
        state: this.fw.state,
        doneMin: s.doneAt != null ? s.doneAt / 60 : null,
        peakChargeA: s.peakChargeA, maxShuntW: s.maxShuntW,
        maxCellV: s.maxCellV, minCellV: s.minCellV, maxTemp: s.maxTemp, chargedAh: s.chargedAh, ovpTrips: s.ovpTrips,
        dischargedAh: s.dischargedAh, dischargedWh: s.dischargedWh, uvpTrips: s.uvpTrips,
        finalSoc: this.cells.map(x => x.soc),
        finalOcv: this.cells.map(x => x.ocv),
      };
    }
  }

  return { SystemA, defaultConfig, presetFor, REALISTIC_CELLS, IDEAL_CELLS, ceilingOf, gainOf, rTopEff, vrefOf, HARDWARE_REPORT, HARDWARE_IMPROVED, FIRMWARE_REPORT, FIRMWARE_IMPROVED, CHARGE_MODES, INA219 };
});
