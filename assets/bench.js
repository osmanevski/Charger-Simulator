(function () {
  'use strict';
  const CA = window.ChargerA, A28 = window.A28, SC = window.ScenariosA;
  const $ = id => document.getElementById(id);
  const fmt = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hms = s => { s = Math.max(0, Math.floor(s)); return [s / 3600 | 0, (s % 3600) / 60 | 0, s % 60].map(v => String(v).padStart(2, '0')).join(':'); };
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const app = $('app');

  const META = { author: 'Osman Çekilmez · 233302006', advisor: 'Dr. Öğr. Üyesi Osman Özer', date: '24.09.2026' };
  $('sheet').innerHTML = Schematic.build(META);
  const svg = $('sheet').querySelector('svg');
  const S = id => svg.getElementById ? svg.getElementById(id) : document.getElementById(id);
  const setT = (id, s) => { const el = S(id); if (el && el.textContent !== s) el.textContent = s; };

  const STATE_TR = {
    CC_MODE: ['Sabit akım', ''], CV_MODE: ['Sabit gerilim', ''], CHARGE_DONE: ['Şarj tamam', 'done'],
    TEMP_FAULT: ['Sıcaklık hatası', 'fault'], LOW_TEMP: ['Soğuk: bekliyor', 'warn'],
    SENSOR_FAULT: ['Sensör hatası', 'fault'], TIMEOUT: ['Zaman aşımı', 'fault'], MCU_OFF: ['Arduino kapalı', 'warn'], OV_FAULT: ['Aşırı gerilim', 'fault'],
  };

  // --- Durum -----------------------------------------------------------------
  let rev = 'B';
  let cfg = CA.presetFor('improved');
  let sys, running = false, busy = false, last = performance.now(), lastSlow = 0, evShown = 0;
  let selPart = null, plot2 = 'cells', activeScen = 'normal', prog = null, dsgSoc0 = null;
  const presetOf = () => 'improved';

  function fresh(note) {
    dsgSoc0 = null;
    sys = new CA.SystemA(cfg);
    sys.cfg = cfg;
    evShown = 0; $('log').innerHTML = '';
    sys.log(note || `Sıfırlandı — Rev ${rev}.`);
    renderAll(true);
  }

  // --- Parametre alanları ----------------------------------------------------
  const F = {
    iSafe: ['SAFE akımı', 'A', 0.1], iFast: ['FAST akımı', 'A', 0.1], vCv: ['CV hedefi', 'V', 0.01], iCut: ['Bitiş akımı', 'A', 0.01],
    tDerate: ['Akım azaltma başlangıcı', '°C', 1], tCut: ['Sıcaklık kesme', '°C', 1], tResume: ['Yeniden başlama', '°C', 1],
    safetyTimerMin: ['Güvenlik zamanlayıcısı', 'dk', 10], doneDebounceS: ['Bitiş onay süresi', 's', 1],
    xlCcA: ['CC potu (akım tavanı)', 'A', 0.1],
    rBot: ['R_alt (modülde ölçülen FB–GND)', 'Ω', 10], rTop: ['Takılan sabit R_üst', 'Ω', 100],
    vrefErrPct: ['Bu modülün V_FB sapması', '%', 0.5], ceilTrim: ['Tavan multimetreyle 12.60 V\'a ayarlandı', 'chk'], trimTargetV: ['Ayar hedefi', 'V', 0.01],
    swOvp: ['Yazılım OVP (röle açar)', 'chk'], rInj: ['R3 enjeksiyon direnci', 'Ω', 100], rFilt: ['R4 filtre direnci', 'Ω', 100],
    diodeV: ['D1 iletim gerilimi', 'V', 0.05], bmsPresent: ['BMS takılı', 'chk'], fuseA: ['F1 sigorta', 'A', 1],
    vccErrPct: ['5 V hattı sapması', '%', 0.5], bmsOvp: ['Hücre OVP', 'V', 0.01], bmsOvpRel: ['OVP bırakma', 'V', 0.01],
    bmsUvp: ['Hücre UVP', 'V', 0.01], balV: ['Balans başlangıcı', 'V', 0.01], balA: ['Balans akımı', 'A', 0.01],
    ambientC: ['Ortam sıcaklığı', '°C', 1], extraHeatW: ['Dış ısı yükü', 'W', 0.5], loadA: ['Yük akımı', 'A', 0.1], rthKW: ['Isıl direnç', 'K/W', 1],
    adapterV: ['Adaptör', '', null, [['12', '12 V'], ['15', '15 V'], ['19', '19 V']]],
    powerMethod: ['XL4015 kontrolü', '', null, [['injection', 'Sabit bölücü + diyotlu enjeksiyon']]],
    isense: ['Akım/gerilim ölçümü', '', null, [['discrete', 'Ayrık: 0.1 Ω + op-amp + bölücü'], ['ina219', 'INA219, 0.1 Ω']]],
    shuntR: ['Şönt direnci', 'Ω', 0.01], ampGain: ['Op-amp kazancı', '×', 1], ampOffsetMv: ['Op-amp ofseti', 'mV', 0.5],
    lcdBus: ['LCD bağlantısı', '', null, [['i2c', 'I²C (A4/A5)'], ['parallel', 'Paralel (D2–D6, D8)']]],
    autoZero: ['Açılışta ofset sıfırlama', 'chk'], divErrPct: ['Bölücü oran hatası', '%', 0.1], vCal: ['Multimetreyle tek nokta kalibrasyon', 'chk'],
    pwmBits: ['PWM çözünürlüğü', '', null, [['8', '8-bit (D6)'], ['10', '10-bit (D9)']]],
    fast: ['Şarj modu (D12)', '', null, [['false', 'SAFE'], ['true', 'FAST']]],
    adapterOn: ['Adaptör bağlı', 'chk'], tempSensorOk: ['TMP36 bağlı', 'chk'], balanceOn: ['BMS balansı', 'chk'],
    cellMonitor: ['Hücre bazlı izleme', 'chk'], vccCal: ['Vcc kalibrasyonu (bandgap)', 'chk'], subtractShuntDrop: ['Şönt düşümünü çıkar', 'chk'],
    lowTempInhibit: ['0 °C altında şarjı engelle', 'chk'], sensorCheck: ['Sensör arızası denetimi', 'chk'], watchdog: ['Watchdog (1 s)', 'chk'],
  };
  function field(k) {
    const [label, unit, step, opts] = F[k];
    if (unit === 'chk') return `<label class="field"><span>${label}</span><input type="checkbox" data-k="${k}" ${cfg[k] ? 'checked' : ''}></label>`;
    if (opts) return `<label class="field"><span>${label}</span><select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(cfg[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    return `<label class="field"><span>${label}</span><span><input type="number" step="${step}" data-k="${k}" value="${cfg[k]}"> ${unit}</span></label>`;
  }
  /** Ölçüm yöntemi değişti: tek LCD ayrık yöntemde paralel olmak zorunda (A4/A5 analog girişe lazım). */
  function onMeasChange() {
    const want = cfg.isense === 'discrete' ? 'parallel' : 'i2c';
    if (cfg.lcdBus !== want) {
      cfg.lcdBus = want;
      sys.log(want === 'parallel' ? 'Ayrık ölçüm: LCD paralel bağlandı (D2–D6, D8); A4 akım girişi oldu, A5 boş.' : 'LCD I²C\'ye döndü (A4/A5, INA219 ile aynı hat).', 'warn');
      if (tab === 'params') renderParams();
    }
    if (tab === 'rev') renderRevisions();
    if (selPart === 'ina' || selPart === 'meas-disc') { selPart = cfg.isense === 'discrete' ? 'meas-disc' : 'ina'; renderInspector(); }
  }
  document.addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.k; if (!k) return;
    const el = e.target;
    if (el.type === 'checkbox') cfg[k] = el.checked;
    else if (F[k][3]) cfg[k] = k === 'fast' ? el.value === 'true' : (k === 'adapterV' || k === 'pwmBits') ? +el.value : el.value;
    else { const v = parseFloat(el.value); if (Number.isFinite(v)) cfg[k] = v; }
    sys.log(`${F[k][0]}: ${el.type === 'checkbox' ? (cfg[k] ? 'açık' : 'kapalı') : (el.options ? el.options[el.selectedIndex].text : cfg[k] + ' ' + F[k][1])}`);
    if (k === 'isense') onMeasChange();
    renderChecks();
  });
  document.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.k;
    if (k && e.target.type === 'number') { const v = parseFloat(e.target.value); if (Number.isFinite(v)) cfg[k] = v; }
  });

  function renderParams() {
    const g = (t, keys) => `<fieldset><legend>${t}</legend>${keys.map(field).join('')}</fieldset>`;
    const init = `<fieldset><legend>Hücreler (Sıfırla ile)</legend><div class="init init4"><span></span><b>SOC %</b><b>Kap. %</b><b>R ×</b><b>Boşalma %/ay</b>` +
      cfg.cells.map((c, i) => `<span>H${i + 1}</span><input data-cell="${i}" data-f="soc" type="number" value="${Math.round(c.soc * 100)}"><input data-cell="${i}" data-f="cap" type="number" step="0.5" value="${+(c.capacityScale * 100).toFixed(1)}"><input data-cell="${i}" data-f="rs" type="number" step="0.01" value="${c.rScale}"><input data-cell="${i}" data-f="sd" type="number" step="0.1" value="${c.sdPctMonth ?? 0}">`).join('') +
      `</div><div class="actions" style="margin:6px 0"><button class="btn sm" data-cells="real">Gerçekçi dağılım</button><button class="btn sm" data-cells="ideal">Özdeş hücreler</button></div>${field('rthKW')}</fieldset>`;
    $('params').innerHTML =
      g('Şarj', ['fast', 'iSafe', 'iFast', 'vCv', 'iCut', 'safetyTimerMin', 'doneDebounceS']) +
      g('Sıcaklık', ['tDerate', 'tCut', 'tResume', 'lowTempInhibit', 'sensorCheck']) +
      g('Güç katı ve ölçüm', ['powerMethod', 'xlCcA', 'adapterV', 'isense', 'pwmBits', 'vccErrPct']) +
      g('Sabit bölücü (tavan)', ['rBot', 'rTop', 'vrefErrPct', 'ceilTrim', 'trimTargetV']) +
      g('Ayrık ölçüm (ölçüm = Ayrık iken)', ['shuntR', 'ampGain', 'ampOffsetMv', 'autoZero', 'divErrPct', 'vCal', 'lcdBus']) +
      g('PWM → FB arabirimi', ['rInj', 'rFilt', 'diodeV']) +
      g('Firmware', ['cellMonitor', 'vccCal', 'subtractShuntDrop', 'watchdog', 'swOvp']) +
      g('BMS', ['bmsPresent', 'bmsOvp', 'bmsOvpRel', 'bmsUvp', 'balV', 'balA', 'balanceOn', 'fuseA']) +
      g('Ortam', ['ambientC', 'extraHeatW', 'loadA', 'adapterOn', 'tempSensorOk']) + init;
  }
  document.addEventListener('change', e => {
    const i = e.target.dataset && e.target.dataset.cell; if (i == null) return;
    const v = parseFloat(e.target.value); if (!Number.isFinite(v)) return;
    const c = cfg.cells[+i], f = e.target.dataset.f;
    if (f === 'soc') c.soc = clamp(v / 100, 0, 1); else if (f === 'cap') c.capacityScale = clamp(v / 100, 0.3, 1.2);
    else if (f === 'sd') c.sdPctMonth = clamp(v, 0, 20); else c.rScale = clamp(v, 0.3, 5);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cells]'); if (!b) return;
    const src = b.dataset.cells === 'ideal' ? CA.IDEAL_CELLS : CA.REALISTIC_CELLS;
    cfg.cells = cfg.cells.map((c, i) => Object.assign({ soc: c.soc }, src[i]));
    renderParams(); fresh(b.dataset.cells === 'ideal' ? 'Hücreler özdeş: kapasite, direnç, kendi kendine boşalma ve verim aynı.' : 'Hücreler gerçekçi dağılımla: kapasite %100/98.5/97, R 1.00/1.07/0.96, boşalma 2.0/3.0/2.2 %/ay.');
  });

  // --- Bileşen denetçisi -------------------------------------------------------
  const cellV = i => sys.cells[i].terminalV(sys.hw.iPack);
  const PARTS = {
    adapter: () => ({ t: 'Adaptör', r: 'V1', d: 'Sistemi besleyen DC adaptör. XL4015\'in 12.6 V çıkış verebilmesi için giriş, çıkışın ve yol düşümlerinin üstünde olmalı.',
      kv: [['Gerilim', `${cfg.adapterV} V`], ['Durum', cfg.adapterOn ? 'bağlı' : 'çıkarıldı']], f: ['adapterOn', 'adapterV'] }),
    xl: () => ({ t: 'XL4015 buck dönüştürücü', r: 'U1', d: 'FB pinini 1.25 V\'ta tutacak şekilde duty ayarlar (datasheet: 1.225–1.275 V, VFB = 0 V\'ta duty %100). Modülün CC potu donanım akım tavanıdır.',
      why: 'CV potunun yerine takılan sabit R_üst, çıkıştan FB\'ye geri beslemeyi korur: dönüştürücü kapalı çevrimde çalışır ve çıkış bölücünün belirlediği tavanı (12.60 V) geçemez.',
      whyA: 'Pot sökülünce FB yalnızca Arduino\'nun PWM gerilimini görür. 1.25 V\'un altında duty %100 (çıkış ≈ giriş), üstünde %0. Dönüştürücü açık çevrimde, iki konumlu çalışır.',
      kv: [['Mod', sys.hw.xlMode], ['Vout', `${fmt(sys.hw.vOut, 3)} V`], ['Çıkış akımı', `${fmt(sys.hw.iCharge, 3)} A`]], f: ['powerMethod', 'xlCcA'] }),
    divider: () => ({ t: 'Geri besleme bölücüsü', r: rev === 'B' ? 'R_üst (sabit) + R_alt (modülün)' : 'RV1 sökülü + R_alt', d: rev === 'B'
        ? 'CV potu sökülür, yerine sabit R_üst takılır: V_tavan = V_FB · (1 + R_üst / R_alt). R_üst = 9.08 × R_alt ile hesaplanır (R_alt 1 kΩ → 9.1 kΩ, E24). XL4015\'in V_FB\'si 1.225–1.275 V olduğundan tavan multimetreyle ölçülür; yüksekse R_üst\'e paralel, düşükse seri küçük bir direnç eklenir.'
        : 'Final raporda CV potu sökülmüş ve yerine bir şey konmamış.',
      why: `Arduino bu tavanın altında çalışır, üstüne çıkamaz. Arduino resetlense, kilitlense ya da PWM kablosu kopsa bile çıkış en fazla ${fmt(sys.ceilV(), 2)} V. Ayarsız bırakılırsa aynı dirençlerle tavan ${fmt(CA.ceilingOf({ ...cfg, ceilTrim: false, vrefErrPct: -2 }), 2)}–${fmt(CA.ceilingOf({ ...cfg, ceilTrim: false, vrefErrPct: 2 }), 2)} V arasında kayabilir.`,
      whyA: 'Vout\'tan FB\'ye bağlantı kalmıyor: donanımda gerilim sınırı yok. Tek sınır BMS OVP (4.25 V/hücre).',
      kv: [['V_FB (bu modül)', `${fmt(CA.vrefOf(cfg), 3)} V`], ['Etkin R_üst', `${fmt(CA.rTopEff(cfg), 0)} Ω`], ['Tavan', cfg.powerMethod === 'injection' ? `${fmt(sys.ceilV(), 3)} V (${fmt(sys.ceilV() / 3, 3)} V/hücre)` : 'yok']],
      f: rev === 'B' ? ['rBot', 'rTop', 'vrefErrPct', 'ceilTrim'] : ['rBotA'] }),
    inject: () => ({ t: 'PWM → FB arabirimi', r: rev === 'B' ? 'R4 1k · C1 100µF · D1 1N4148 · R3' : 'R4 10k · C1 10µF', d: rev === 'B'
        ? 'R4·C1 (τ = 0.1 s) PWM\'i DC\'ye çevirir. D1 yalnızca FB düğümüne akım basmaya izin verir. TI SLVA861\'deki "yalnız akım basan DAC" yapısının aynısı: bölücü tavanı belirler, DAC/PWM çıkışı yalnızca aşağı çeker. Modülün kendi CC devresi de FB\'yi bir LED (diyot) üzerinden aynı şekilde yukarı çeker.'
        : 'Filtre çıkışı doğrudan FB pinine. XL4015\'in hata yükselteci bir integratördür (dahili 20 kΩ + 3.3 nF); Vout geri beslemesi olmadan FB\'yi 1.25 V\'ta tutamaz ve duty %0 ya da %100\'e gider.',
      why: `Vout = V_tavan − R_üst · max(0, V_PWM − V_D − 1.25) / (R4 + R3). Kondansatör DC\'de açık devre olduğundan R4 de seri yola girer. R3 = R_üst / 1.5 − R4 seçilir: şu an kazanç ${fmt(sys.injGain(), 2)}, en düşük çıkış ${fmt(sys.ceilV() - sys.injGain() * (5 - cfg.diodeV - 1.25), 2)} V. D1 düşük kaçaklı olmalı (1N4148 ≈ 25 nA; BAT54 2 µA\'e kadar): kaçak akım R_üst üzerinden tavanı yukarı kaydırır.`,
      whyA: `FB gerilimi arttıkça çıkış DÜŞER (datasheet: VFB = 0 V\'ta duty %100); raporda anlatılan yön terstir. Modülün alt direnci R_alt yerinde kalırsa FB = V_PWM · R_alt / (10k + R_alt) olur. R_alt = 1 kΩ ise FB en fazla ${fmt(5 * 1000 / 11000, 2)} V'a çıkar, 1.25 V\'a hiç ulaşamaz ve çıkış sürekli tam açık kalır (Parametreler → R_alt ile deneyin).`,
      kv: [['PWM', `${sys.hw.duty} / ${sys.pwmMax()}`], ['V_PWM (ortalama)', `${fmt(sys.hw.vFilt, 3)} V`], ['FB\'ye giden', rev === 'B' ? `${fmt(Math.max(0, sys.hw.vFilt - cfg.diodeV - 1.25) / (cfg.rFilt + cfg.rInj) * 1000, 3)} mA` : `${fmt(sys.fbDirect(), 3)} V`]],
      f: rev === 'B' ? ['pwmBits', 'rInj', 'rFilt', 'diodeV'] : ['pwmBits', 'rBotA'] }),
    pwm: () => ({ t: 'PWM çıkışı', r: rev === 'B' ? 'D9 · Timer1' : 'D6 · Timer0', d: 'Arduino Uno\'da D9/D10 Timer1\'e bağlıdır ve 10-bit PWM verebilir; analogWrite() D6\'da 8-bit\'tir.',
      why: 'Bir PWM adımı 10-bit\'te ≈ 35 mA, 8-bit\'te ≈ 140 mA akım değişimine denk gelir. Kontrolcü iki adım arasında gidip geldiğinden CC akımında kuantalama dalgalanması oluşur: simülasyonda 10-bit ≈ 60 mA, 8-bit ≈ 260 mA tepe-tepe (1.4 A\'in %4\'ü ve %19\'u).',
      whyA: '8-bit PWM: CC akımı ≈ 260 mA tepe-tepe dalgalanır (Parametreler\'den 10-bit seçip karşılaştırın).',
      kv: [['Çözünürlük', `${cfg.pwmBits}-bit`], ['Duty', `${sys.hw.duty} / ${sys.pwmMax()}`]], f: ['pwmBits'] }),
    relay: () => ({ t: 'Röle', r: 'K1 · D7', d: 'NO kontak: Arduino\'nun beslemesi kesilirse kontak açılır ve paket şarj devresinden ayrılır. Hata durumlarında firmware röleyi bırakır.',
      kv: [['Kontak', sys.hw.relay ? 'kapalı (iletiyor)' : 'açık']], f: [] }),
    ina: () => ({ t: 'Akım ve gerilim ölçümü', r: rev === 'B' ? 'U3 INA219 · R5 0.1 Ω' : 'R5 1 Ω · A3',
      d: 'INA219: high-side şönt, I²C. Bus LSB 4 mV, şönt LSB 10 µV (0.1 Ω\'da 0.1 mA). Kendi referansını kullandığı için 5 V hattındaki sapmadan etkilenmez.',
      why: '0.1 Ω\'da 1.4 A için kayıp 0.2 W, düşüm 0.14 V.', whyA: '1 Ω\'da 1.4 A için kayıp 1.96 W, düşüm 1.4 V. Low-side olduğundan paket ölçümü I·1 Ω kadar yüksek çıkar.',
      kv: [['Gerçek akım', `${fmt(sys.hw.iCharge, 4)} A`], ['Ölçülen', `${fmt(sys.fw.meas.i, 4)} A`], ['Şönt kaybı', `${fmt(sys.hw.iCharge ** 2 * sys.rShunt(), 2)} W`]], f: ['isense', 'subtractShuntDrop'] }),
    'sense-a': () => PARTS.ina(),
    'meas-disc': () => ({ t: 'Ayrık akım ve gerilim ölçümü', r: 'R5 0.1 Ω · U3 LM358 ×10 → A4 · R6/R7 10k/4.7k → A3',
      d: 'Şönt eksi hatta (low-side). Şönt gerilimi (1.4 A\'de 0.14 V) op-amp ile ×10 büyütülür: 1 ADC adımı ≈ 4.9 mA. LM358 5 V beslemede ~3.5 V\'a kadar çıkabildiği için 3.5 A\'e kadar ölçer. Bölücü paket+ ile GND arasını görür: firmware V_paket = V_bölücü − I·R5 hesaplar.',
      why: 'Olmazsa olmazlar: (1) açılışta röle açıkken op-amp ofseti ölçülüp çıkarılır (LM358 2–7 mV → ×10 → 20–70 mA hata), (2) multimetreyle tek nokta kalibrasyon: paket gerilimi DMM ile ölçülür, katsayı EEPROM\'a yazılır. Kalibrasyonsuz hücre uçları da yanlış okunur; simülasyonda dengesiz pakette bir hücre 4.25 V\'a çıkıyor. Tek LCD paralel bağlanır (D2–D6, D8), A4 akım girişi olur, A5 boş kalır.',
      kv: [['Gerçek akım', `${fmt(sys.hw.iCharge, 3)} A`], ['Ölçülen', `${fmt(sys.fw.meas.i, 3)} A`], ['Gerçek paket', `${fmt(sys.hw.vPack, 3)} V`], ['Ölçülen', `${fmt(sys.fw.meas.v, 3)} V`],
        ['Şönt kaybı', `${fmt(sys.hw.iCharge ** 2 * cfg.shuntR, 2)} W`], ['Ofset tahmini', sys.fw.zeroI != null ? `${fmt(sys.fw.zeroI * 1000, 0)} mA` : '—']],
      f: ['isense', 'shuntR', 'ampGain', 'ampOffsetMv', 'autoZero', 'divErrPct', 'vCal', 'lcdBus'] }),
    load: () => ({ t: 'Yük', r: 'RL · elektronik yük (test)', d: 'Paketin P+ / P− uçlarına bağlanan sabit akımlı yük. Deşarj testinde kullanılır; datasheet deşarj eğrisiyle karşılaştırma 2.9 A (≈1C) içindir.',
      why: 'Adaptör yokken Arduino beslemesizdir: deşarjı izleyen ve kesen tek katman BMS\'tir (hücre UVP 2.50 V = datasheet deşarj sonu). INA219 şarj yolunda olduğu için yük akımını görmez.',
      whyA: 'Adaptör yokken Arduino beslemesizdir: deşarjı yalnızca BMS UVP (2.50 V) sınırlar.',
      kv: [['Ayar', cfg.loadA > 0 ? `${fmt(cfg.loadA, 2)} A` : 'bağlı değil'], ['Paket akımı', `${fmt(sys.hw.iPack, 3)} A`], ['Güç', `${fmt(Math.max(0, -sys.hw.iPack) * sys.hw.vPack, 1)} W`],
        ['Çekilen', `${fmt(sys.stats.dischargedAh * 1000, 0)} mAh · ${fmt(sys.stats.dischargedWh, 2)} Wh`], ['BMS deşarj MOSFET\'i', sys.bms.dsgFet ? 'açık' : 'KAPALI (UVP)']],
      f: ['loadA', 'adapterOn', 'bmsUvp'] }),
    fuse: () => ({ t: 'Sigorta', r: 'F1 · 5 A', d: 'BMS kısa devre korumasına ek, bağımsız ve pasif bir koruma. Paketin + ucuna mümkün olduğunca yakın konur.', kv: [], f: [] }),
    bms: () => ({ t: '3S balanslı BMS', r: 'U4', d: 'Hücre başına aşırı şarj (OVP), aşırı deşarj (UVP) ve kısa devre koruması; ≥ balans eşiğindeki hücreden direnç üzerinden akım çeker. MOSFET\'ler eksi hattadır (B− ↔ P−).',
      kv: [['Şarj MOSFET\'i', sys.bms.chgFet ? 'açık' : 'KAPALI'], ['Neden', sys.bms.reason], ['OVP tetiklenme', `${sys.stats.ovpTrips}×`], ['Balans', sys.bms.bal.map((b, i) => b ? 'H' + (i + 1) : '').filter(Boolean).join(', ') || '—']],
      f: ['bmsOvp', 'bmsOvpRel', 'bmsUvp', 'balV', 'balA', 'balanceOn'] }),
    taps: () => ({ t: 'Hücre izleme uçları', r: 'A1 · A2', d: `H1+ doğrudan A1\'e, H2+ 10k/10k bölücüyle A2\'ye; H3+ ${cfg.isense === 'ina219' ? 'INA219 bus geriliminden' : 'paket bölücüsünden (A3)'}. Uno\'da A6/A7 yok; plan A0–A4\'e sığdırıldı.`,
      why: 'Firmware hiçbir hücrenin 4.20 V\'u aşmasına izin vermez. Dengesiz pakette BMS OVP\'ye ulaşılmaz.',
      kv: sys.fw.meas.cells.map((v, i) => [`H${i + 1} ölçülen`, `${fmt(v, 3)} V (gerçek ${fmt(cellV(i), 3)})`]), f: ['cellMonitor', 'vccCal'] }),
    tmp: () => ({ t: 'Sıcaklık sensörü', r: 'U5 TMP36 · A0', d: 'H2 yüzeyine yapıştırılır. 0 °C\'de 0.5 V, +10 mV/°C. 10-bit ADC\'de 1 LSB ≈ 0.49 °C.',
      why: 'Kopuk sensör −50 °C okur; firmware bunu arıza sayar ve şarjı durdurur.',
      kv: [['Hücre', `${fmt(sys.cells[1].tempC, 1)} °C`], ['Okunan', `${fmt(sys.fw.meas.t, 1)} °C`]], f: ['tempSensorOk', 'sensorCheck', 'lowTempInhibit'] }),
    uno: () => ({ t: 'Arduino Uno', r: 'U2 · ATmega328P', d: '500 ms döngü: ölç → güvenlik kontrolleri → CC/CV kararı → PWM. Firmware değişiklikleri devre çiziminde görünmediği için burada listelenir.',
      why: 'Rev B firmware: 0 °C altında şarj yok · sensör arızası denetimi · 5 s bitiş onayı · 240 dk güvenlik zamanlayıcısı · watchdog · 16 örnek ADC ortalaması · SAFE 1.4 A / FAST 2.8 A · bitiş 140 mA.',
      whyA: 'Rev A firmware: 1.0 A, bitiş 100 mA; soğuk, sensör ve kilitlenme denetimi yok; bitiş koşulu tek okumayla tetiklenir.',
      kv: [['Durum', sys.fw.state], ['Döngü', '500 ms']], f: ['fast', 'iSafe', 'iFast', 'watchdog', 'doneDebounceS'] }),
  };
  [1, 2, 3].forEach(i => { PARTS['cell' + i] = () => ({ t: `Hücre ${i}`, r: 'ASPİLSAN INR18650A28', d: '2800 mAh, 3.65 V nominal, şarj sonu 4.20 V, kesme 140 mA, ACIR ≤ 20 mΩ. Model: 1RC Thevenin, datasheet 0.5C eğrisine kalibre.',
    kv: [['Uç gerilimi', `${fmt(cellV(i - 1), 3)} V`], ['OCV', `${fmt(sys.cells[i - 1].ocv, 3)} V`], ['SOC', `${fmt(sys.cells[i - 1].soc * 100, 1)} %`], ['Sıcaklık', `${fmt(sys.cells[i - 1].tempC, 1)} °C`], ['Kapasite', `${fmt(sys.cells[i - 1].capacityAh * 1000, 0)} mAh`]], f: [] }); });

  function renderInspector() {
    if (!selPart) { $('inspector').innerHTML = '<p class="empty">Şemada bir bileşene tıklayın: görevi, anlık değerleri ve Rev A ile Rev B arasındaki farkı burada görünür.</p>'; return; }
    const p = PARTS[selPart]();
    const why = rev === 'B' ? (p.why ? `<p class="why">${p.why}</p>` : '') : (p.whyA ? `<p class="why a">${p.whyA}</p>` : '');
    $('inspector').innerHTML = `<div class="insp"><div><h3>${p.t}</h3><div class="ref">${p.r}</div><p>${p.d}</p>${why}</div>` +
      `<div><dl class="kv">${p.kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>${p.f.length ? '<div style="margin-top:8px">' + p.f.map(field).join('') + '</div>' : ''}</div></div>`;
  }
  function refreshInspectorValues() {
    if (!selPart || document.activeElement && document.activeElement.closest && document.activeElement.closest('#inspector')) return;
    const p = PARTS[selPart](), dds = $('inspector').querySelectorAll('dd');
    p.kv.forEach(([, v], i) => { if (dds[i] && dds[i].textContent !== v) dds[i].textContent = v; });
  }
  function selectPart(id) {
    selPart = id;
    svg.querySelectorAll('.part').forEach(g => g.classList.toggle('sel', g.dataset.part === id));
    showTab('part'); renderInspector();
  }
  svg.addEventListener('click', e => {
    const rv = e.target.closest('.rev');
    if (rv) return openRevision(+rv.dataset.delta);
    const g = e.target.closest('.part'); if (g) selectPart(g.dataset.part);
  });
  svg.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.part')) { e.preventDefault(); e.stopPropagation(); selectPart(e.target.closest('.part').dataset.part); } });
  svg.addEventListener('mouseover', e => {
    const rv = e.target.closest('[data-delta]'); const n = rv ? rv.dataset.delta : null;
    svg.querySelectorAll('.rev').forEach(x => x.classList.toggle('hot', x.dataset.delta === n));
  });

  // --- Revizyonlar ---------------------------------------------------------------
  // Rev B'de her değişikliğin nedeni; kararlar tarihiyle kayıtlı.
  const REV_DETAIL = {
    1: {
      why: 'Final raporda CV potu sökülüp filtrelenmiş PWM doğrudan FB\'ye verilmişti; Vout\'tan FB\'ye geri besleme kalmadığı için XL4015 regüle edemiyordu.',
      notes: [{
        date: '24.09.2026',
        title: 'Karar: OUT ile FB arasındaki bölücü korunur; Arduino FB\'yi doğrudan sürmez',
        decision: 'CV potu sökülür, yerine sabit R_üst takılır. XL4015 OUT (Vout) → R_üst → FB → R_alt → GND bölücüsü korunur. Arduino\'nun PWM\'i yalnızca R4–C1 + 1N4148 + R3 üzerinden FB\'ye akım basarak XL4015\'in hedefini aşağı çeker. Tavan (12.60 V) multimetreyle ölçülerek ayarlanır.',
        info: [
          '<b>Neden OUT ile FB bağlı:</b> XL4015 geri beslemeli bir regülatördür. İçindeki hata yükselteci duty\'yi, FB tam 1.25 V olana kadar ayarlar. FB, bölücü üzerinden Vout\'un küçültülmüş kopyası olduğunda bu ancak Vout = 12.6 V iken sağlanır. Yük ya da adaptör gerilimi değişirse Vout kayar, FB de kayar ve XL4015 bunu mikrosaniyeler içinde düzeltir (kapalı çevrim). Bölücü, XL4015\'in "gözü"dür.',
          '<b>Neden yalnız PWM ile FB kontrolü mantıksız:</b> FB\'yi yalnızca Arduino sürerse XL4015 duty\'yi ne kadar değiştirirse değiştirsin FB kıpırdamaz, çünkü FB\'nin çıkışla bağı yoktur. Hata yükselteci (integratör) doyuma gider: FB &lt; 1.25 V ise duty %100 olur (çıkış ≈ adaptör gerilimi, akımı yalnızca CC potu sınırlar), FB &gt; 1.25 V ise %0 olur. Arada duramaz: açık çevrim, regülasyon yok. Datasheet de bunu doğrular: maks. duty "VFB = 0 V", sessiz akım "VFB = Vin" koşulunda.',
          '<b>Arduino neden bu işi üstlenemez:</b> XL4015 saniyede 180 000 kez anahtarlar ve mikrosaniyelerde tepki verir. Arduino döngüsü 500 ms\'dir. İki karar arasında çıkış çoktan tam açığa ya da sıfıra gitmiş olur; Arduino ancak yarım saniyelik aç/kapa darbeleri üretebilir.',
          '<b>İki ayrı "PWM":</b> Arduino\'nun PWM\'i (D9), RC ile düz DC\'ye çevrilen yavaş bir <i>ayar sinyalidir</i> ("hedefi söyler"). Güç MOSFET\'ini 180 kHz\'de anahtarlayan asıl PWM her zaman XL4015\'indir ("hedefe ulaşır").',
          '<b>İki katmanlı kontrol:</b> İç döngü XL4015 + bölücü: hızlı, gerilimi sabit tutar, Arduino dursa bile tavanı garanti eder. Dış döngü Arduino: yavaş ama akıllı, akım, sıcaklık ve hücreleri izler, iç döngünün hedefini gerektiği kadar aşağı çeker (hız sabitleyici benzetmesi: sürücü hedefi belirler, motor kontrol ünitesi hızı tutar).',
          '<b>Tolerans:</b> V_FB = 1.225–1.275 V (±%2). Ayarsız sabit dirençle tavan 12.37–12.88 V arasında kayabilir; 12.88 V hücre başına 4.29 V, yani BMS OVP\'nin üstü. Bu yüzden tavan ölçülerek 12.60 V\'a düzeltilir.',
        ],
        src: 'XL4015 datasheet (blok diyagram, elektriksel karakteristikler) · TI SLVA861 "How to Dynamically Adjust Power Module Output Voltage"',
      }],
    },
  };
  function renderRevisions(focus) {
    const zone = r => Schematic.zone(r.box[0] + r.box[2] / 2, r.box[1] + r.box[3] / 2);
    const items = Schematic.REVISIONS.map(r => {
      const d = REV_DETAIL[r.n] || {};
      const notes = (d.notes || []).map(nt => `<div class="revnote"><div class="revnote-h"><span class="eyebrow">Karar · ${nt.date}</span><b>${nt.title}</b></div>` +
        `<p>${nt.decision}</p><div class="h4">Bilgi notu</div><ul>${nt.info.map(x => `<li>${x}</li>`).join('')}</ul><p class="hint">Kaynak: ${nt.src}</p></div>`).join('');
      return `<article class="revitem ${focus === r.n ? 'focus' : ''}" id="rev-${r.n}" data-delta="${r.n}">` +
        `<div class="revhead"><svg class="dmark" viewBox="0 0 24 21" width="24" height="21" aria-label="Δ${r.n}"><path d="M12 1.5 L22.5 19.5 H1.5 Z"/><text x="12" y="17" text-anchor="middle">${r.n}</text></svg><span class="rz">${zone(r)}</span><b>${r.title}</b>` +
        `<button class="btn sm" data-goto="${r.part}">Şemada göster</button></div>` +
        `<p class="rtext">${r.text}</p>${d.why ? `<p class="rwhy"><span class="h4">Neden</span> ${d.why}</p>` : ''}${notes}</article>`;
    }).join('');
    $('revList').innerHTML = `<div class="h4">Revizyonlar — final rapordaki devreden bu tasarıma</div>${items}`;
    if (focus) { const el = $('rev-' + focus); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }
  function openRevision(n) { showTab('rev'); renderRevisions(n); }
  $('revList').addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if (b) selectPart(b.dataset.goto); });
  $('revList').addEventListener('mouseover', e => {
    const it = e.target.closest('.revitem'); const n = it ? it.dataset.delta : null;
    svg.querySelectorAll('.rev').forEach(x => x.classList.toggle('hot', x.dataset.delta === n));
  });

  // --- Senaryolar ----------------------------------------------------------------
  // Yalnız tezgâhta: dolu paketten deşarj (doğrulama matrisine girmez; iki revizyonda aynıdır)
  const UI_SCEN = [
    { id: 'noBmsWeak', name: 'BMS yok: zayıf hücreli paketi kullan', desc: 'H3 2700 mAh (datasheet min.), dolu, 2.9 A yük',
      apply: c => { c.cells.forEach(x => { x.soc = 1; }); c.cells[2].capacityScale = 0.965; c.adapterOn = false; c.loadA = 2.9; c.bmsPresent = false; },
      stop: s => s.cells.some(x => x.soc <= -0.04) },
    { id: 'bmsWeak', name: 'BMS var: zayıf hücreli paketi kullan', desc: 'Aynı paket, BMS takılı: karşılaştırma için',
      apply: c => { c.cells.forEach(x => { x.soc = 1; }); c.cells[2].capacityScale = 0.965; c.adapterOn = false; c.loadA = 2.9; },
      stop: s => s.stats.uvpTrips > 0 },
    { id: 'noBmsDsg', name: 'BMS yok: dolu paketi kullan', desc: 'Adaptör yok, 2.9 A yük; alt gerilim sınırı yok', inject: null,
      apply: c => { c.cells.forEach(x => { x.soc = 1; }); c.adapterOn = false; c.loadA = 2.9; c.bmsPresent = false; }, stop: s => s.cells.some(x => x.soc <= -0.04) },
    { id: 'dsgFull', name: 'Dolu paketten deşarj', desc: 'Adaptör yok, 2.9 A (≈1C) yük; BMS UVP\'ye kadar',
      apply: c => { c.cells.forEach(x => { x.soc = 1; }); c.adapterOn = false; c.loadA = 2.9; }, stop: s => s.stats.uvpTrips > 0 },
  ];
  const findScen = id => SC.SCENARIOS.find(x => x.id === id) || UI_SCEN.find(x => x.id === id);
  const newProg = sc => (sc ? { sc, ctx: { k: 0 }, injected: !sc.inject } : null);
  /** Senaryo olaylarını işler; dt kadar ilerlemeden önce enjeksiyon anına kadar koşar. */
  function advance(simS) {
    if (prog && !prog.injected && sys.t + simS >= prog.sc.at) {
      const pre = Math.max(0, prog.sc.at - sys.t); sys.run(pre); simS -= pre;
      prog.sc.inject(sys); prog.injected = true; sys.log(`Senaryo olayı: ${prog.sc.name}`, 'bad');
    }
    sys.run(simS);
    if (prog && prog.sc.steps) SC.stepProgram(prog.sc, sys, prog.ctx);
  }
  const LOAD_A = 2.9;
  const LIVE = [
    { id: 'load', name: 'Yük bağla / çıkar', desc: `${LOAD_A} A elektronik yük (≈1C)`, act: () => { cfg.loadA = cfg.loadA > 0 ? 0 : LOAD_A; sys.log(cfg.loadA ? `${LOAD_A} A yük bağlandı.` : 'Yük çıkarıldı.', 'warn'); } },
    { id: 'sensor', name: 'TMP36 kopsun', desc: 'A0 ≈ 0 V → −50 °C okunur', act: () => { cfg.tempSensorOk = false; sys.log('Arıza: TMP36 bağlantısı koptu.', 'bad'); } },
    { id: 'freeze', name: 'Arduino kilitlensin', desc: 'PWM ve röle son değerinde kalır', act: () => { cfg.fwFrozen = true; sys.log('Arıza: firmware döngüsü takıldı.', 'bad'); } },
    { id: 'pwmcut', name: 'PWM kablosu kopsun', desc: 'Enjeksiyon yok → çıkış donanım tavanına çıkar', act: () => { cfg.pwmBroken = true; sys.log('Arıza: PWM → FB kablosu koptu.', 'bad'); } },
    { id: 'unplug', name: 'Adaptörü çek / tak', desc: 'Giriş gerilimi kesilir', act: () => { cfg.adapterOn = !cfg.adapterOn; sys.log(`Adaptör ${cfg.adapterOn ? 'takıldı' : 'çekildi'}.`, 'warn'); } },
    { id: 'short', name: 'Kısa devre', desc: 'BMS varsa BMS keser, yoksa F1 sigortası', act: () => sys.shortCircuit() },
    { id: 'bms', name: 'BMS\'i çıkar / tak', desc: 'Hücreler doğrudan bağlanır; koruma yalnız firmware + sigorta', act: () => { cfg.bmsPresent = !cfg.bmsPresent; sys.log(cfg.bmsPresent ? 'BMS takıldı.' : 'BMS çıkarıldı: hücre OVP/UVP, kısa devre koruması ve balans yok.', cfg.bmsPresent ? 'ok' : 'bad'); if (tab === 'params') renderParams(); } },
  ];
  function renderScenarios() {
    $('scenList').innerHTML = `<div class="h4" style="grid-column:1/-1">Başlangıç koşulu — sıfırlar ve başlatır</div>` +
      [...SC.SCENARIOS, ...UI_SCEN].map(s => `<button class="sc ${activeScen === s.id ? 'active' : ''} ${s.inject ? 'fault' : ''}" data-scen="${s.id}"><b>${s.name}</b><span>${s.desc}</span></button>`).join('') +
      `<div class="h4" style="grid-column:1/-1;margin-top:6px">Çalışırken müdahale et</div>` +
      LIVE.map(s => `<button class="sc fault" data-live="${s.id}"><b>${s.name}</b><span>${s.desc}</span></button>`).join('');
  }
  $('scenList').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.live) { LIVE.find(x => x.id === b.dataset.live).act(); renderChecks(); return; }
    const sc = findScen(b.dataset.scen);
    activeScen = sc.id;
    const keep = { fast: cfg.fast };
    cfg = Object.assign(CA.presetFor(presetOf(rev)), keep);
    sc.apply(cfg);
    prog = newProg(sc);
    fresh(`Senaryo: ${sc.name} — ${sc.desc}`);
    running = true; renderScenarios(); renderParams(); renderChecks();
  });

  // --- Mod isteği: şarj et / kullan / beklet --------------------------------------
  let useLoad = 2.9;
  function request(mode) {
    if (mode === 'USE' && cfg.loadA > 0) useLoad = cfg.loadA;
    sys.requestMode(mode, useLoad);
    running = true;
    if (tab === 'params') renderParams();
  }
  document.querySelectorAll('[data-req]').forEach(b => b.addEventListener('click', () => request(b.dataset.req)));

  // --- Grafikler ---------------------------------------------------------------
  // Gerilim ve akım aynı zaman eksenini paylaşan iki panel; kenar boşlukları eşit → dikey ızgaralar hizalı
  const PAD = { l: 46, r: 16 };
  const chV = new LineChart($('chV'), {
    xLabel: 'dk', minSpan: 30, pad: PAD, hideX: true,
    left: { min: 9, max: 13.4, label: 'V', color: cssv('--ink') },
    series: [
      { key: 'v', color: cssv('--ink'), label: 'V gerçek' },
      { key: 'vMeas', color: cssv('--fault'), label: 'V ölçülen', dash: [4, 4], width: 1.4 },
    ],
    refLines: [{ axis: 'left', value: 12.6, color: cssv('--ink-3'), label: '12.60 V', right: true }],
  });
  const chI = new LineChart($('chI'), {
    xLabel: 'dk', minSpan: 30, pad: PAD,
    left: { min: -3, max: 2, label: 'A', color: cssv('--ink-2') },
    series: [
      { key: r => (r.ip >= -0.002 ? r.ip : null), color: cssv('--a28'), label: '+ şarj', width: 1.6 },
      { key: r => (r.ip <= 0.002 ? r.ip : null), color: cssv('--cc'), label: '− deşarj', width: 1.6 },
    ],
    refLines: [{ axis: 'left', value: 0, color: cssv('--ink-3'), label: '' }],
  });
  const PLOT2 = {
    cells: {
      opts: { xLabel: 'dk', minSpan: 30, left: { min: 2.4, max: 4.5, label: 'V', step: 0.5 },
        series: [{ key: 'c1', color: cssv('--c1'), label: 'H1' }, { key: 'c2', color: cssv('--c2'), label: 'H2' }, { key: 'c3', color: cssv('--c3'), label: 'H3' }],
        refLines: [{ axis: 'left', value: 4.2, color: cssv('--cv'), label: '4.20 V', below: true }, { axis: 'left', value: 4.25, color: cssv('--fault'), label: 'BMS OVP', right: true },
          { axis: 'left', value: 2.5, color: cssv('--fault'), label: 'BMS UVP 2.50 V', right: true }] },
      keys: `<span><i style="color:var(--c1)"></i>H1</span><span><i style="color:var(--c2)"></i>H2</span><span><i style="color:var(--c3)"></i>H3</span><span><i class="dash" style="color:var(--cv)"></i>4.20 V sınırı</span>`,
    },
    temp: {
      opts: { xLabel: 'dk', minSpan: 30, left: { min: -10, max: 60, label: '°C', color: cssv('--cc') }, right: { min: 0, max: 100, label: 'PWM %', color: cssv('--ink-3') },
        series: [{ key: 'T', color: cssv('--cc'), label: 'Hücre', digits: 1 }, { key: 'Ts', color: cssv('--fault'), label: 'TMP36', dash: [4, 4], width: 1.4, digits: 1 },
          { key: 'duty', color: cssv('--ink-3'), axis: 'right', label: 'PWM', width: 1.1, digits: 0 }],
        refLines: [{ axis: 'left', value: 45, color: cssv('--fault'), label: 'kesme 45 °C', right: true }, { axis: 'left', value: 0, color: cssv('--a28'), label: '0 °C', right: true }] },
      keys: `<span><i style="color:var(--cc)"></i>hücre sıcaklığı</span><span><i class="dash" style="color:var(--fault)"></i>TMP36 okuması</span><span><i style="color:var(--ink-3)"></i>PWM duty</span>`,
    },
  };
  let ch2 = new LineChart($('ch2'), PLOT2.cells.opts);
  $('keys2').innerHTML = PLOT2.cells.keys;
  document.querySelectorAll('[data-plot]').forEach(b => b.addEventListener('click', () => {
    plot2 = b.dataset.plot;
    document.querySelectorAll('[data-plot]').forEach(x => x.setAttribute('aria-pressed', x === b));
    ch2 = new LineChart($('ch2'), PLOT2[plot2].opts); $('keys2').innerHTML = PLOT2[plot2].keys; drawCharts();
  }));
  function dsOverlay() {
    const s0 = cfg.cells.reduce((a, c) => a + c.soc, 0) / 3;
    const shift = (s0 - 0.015) * A28.PARAMS.capacityAh / 1.4 * 60;
    const pts = A28.DATASHEET_CHARGE_05C.map(([t, v, i]) => [t - shift, v * 3, i]).filter(p => p[0] >= 0);
    const col = cssv('--cc');
    return [{ points: pts.map(p => [p[0], p[1]]), axis: 'left', color: col, hollow: true }, { points: pts.map(p => [p[0], p[2]]), axis: 'left', color: col, hollow: true }];
  }
  /** Datasheet 2.9 A deşarj eğrisi, deşarjın başladığı ana ve başlangıç SOC'una hizalı. */
  function dsgOverlay() {
    const t0 = sys.stats.dsgStart / 60, q0 = (1 - dsgSoc0) * A28.PARAMS.capacityAh, col = cssv('--cc');
    const pts = A28.DATASHEET_DISCHARGE_29A.filter(([q]) => q >= q0).map(([q, v]) => [t0 + (q - q0) / 2.9 * 60, v * 3]);
    return [{ points: pts, axis: 'left', color: col, hollow: true }];
  }
  function drawCharts() {
    const I = cfg.fast ? cfg.iFast : cfg.iSafe;
    const socs = cfg.cells.map(c => c.soc), caps = cfg.cells.map(c => c.capacityScale);
    // Datasheet eğrisi tek hücre içindir: paket yaklaşık dengeliyse (SOC farkı < %2, kapasite farkı < %5) üst üste çizilir
    const balanced = Math.max(...socs) - Math.min(...socs) < 0.02 && Math.max(...caps) - Math.min(...caps) < 0.05;
    const chgOk = Math.abs(I - 1.4) < 0.05 && balanced && sys.stats.dsgStart == null;
    const dsgOk = sys.stats.dsgStart != null && dsgSoc0 != null && dsgSoc0 > 0.9 && Math.abs(cfg.loadA - 2.9) < 0.05 && balanced;
    $('dsNote').textContent = dsgOk ? '2.9 A deşarj' : chgOk ? '0.5C şarj' : (sys.stats.dsgStart != null ? '(deşarjda: dolu, dengeli paket ve 2.9 A)' : Math.abs(I - 1.4) >= 0.05 ? '(yalnız 1.4 A\'de)' : '(yalnız dengeli pakette)');
    // Eksenler kayıttaki gerçek değerlerden: hiçbir değer kırpılmaz
    const H = sys.history;
    let vMin = 12, iMax = I, iMin = 0;
    for (const r of H) { if (r.v < vMin) vMin = r.v; if (r.ip > iMax) iMax = r.ip; if (r.ip < iMin) iMin = r.ip; }
    if (cfg.loadA > 0) iMin = Math.min(iMin, -cfg.loadA);
    chV.o.left.min = Math.max(0, Math.min(9, Math.floor(vMin - 0.3)));
    chI.o.left.max = Math.max(1, Math.ceil(iMax * 1.15 * 2) / 2);
    chI.o.left.min = iMin < -0.01 ? Math.floor(iMin * 1.15 * 2) / 2 : -0.5;
    const xMax = Math.max(30, sys.t / 60);
    const ov = !$('showDs').checked ? [] : dsgOk ? dsgOverlay() : chgOk ? dsOverlay() : [];
    chV.draw(H, { xScale: 1 / 60, xMax, overlays: ov.slice(0, 1) });
    chI.draw(H, { xScale: 1 / 60, xMax, overlays: ov.slice(1) });
    if (plot2 === 'cells') ch2.o.left.min = cfg.bmsPresent && sys.stats.minCellV > 2.4 ? 2.4 : 0;
    ch2.draw(sys.history, { xScale: 1 / 60, xMax });
  }
  $('showDs').addEventListener('change', drawCharts);

  // --- Tasarım kontrolleri -----------------------------------------------------
  function checks() {
    const c = cfg, out = [], I = c.fast ? c.iFast : c.iSafe, rsh = c.isense === 'shunt1' ? 1 : c.isense === 'discrete' ? c.shuntR : 0.1;
    const add = (n, v, l, note) => out.push({ n, v, l, note });
    const head = c.adapterV - (c.vCv + I * (rsh + c.rPathOhm + 0.15) + 0.4);
    add('Adaptör başlık payı', `${fmt(head, 2)} V`, head > 0.8 ? 'ok' : head > 0 ? 'warn' : 'bad', `${c.adapterV} V giriş; 12.60 V + yol düşümleri + XL4015 düşümü karşılanmalı`);
    if (c.powerMethod === 'injection') {
      const cv = CA.ceilingOf(c), d = cv - 12.6;
      add('Donanım gerilim tavanı', `${fmt(cv, 3)} V · ${fmt(cv / 3, 3)} V/hücre`, Math.abs(d) <= 0.05 ? 'ok' : (d > 0.12 ? 'bad' : 'warn'),
        c.ceilTrim ? 'Sabit R_üst multimetreyle ayarlandı: PWM yalnızca aşağı çekebilir' :
          d > 0.12 ? 'Ayarsız: tavan BMS OVP sınırına yakın/üstünde. Arduino devre dışı kalırsa hücreler aşırı şarj olur' :
          d < -0.05 ? 'Ayarsız: tavan 12.60 V\'un altında, paket tam dolmaz' : 'Ayarsız ama bu modülde tolerans içinde');
    } else add('Donanım gerilim tavanı', 'yok', 'bad', 'Pot sökülü, yerine bölücü yok: XL4015 açık çevrim; tek sınır BMS OVP');
    add('Yazılım OVP', c.swOvp ? 'var' : 'yok', c.swOvp ? 'ok' : 'warn', 'Ölçülen paket > 12.62 V ya da hücre > 4.215 V, 0.5 s → röle açılır');
    const psh = I * I * rsh;
    add('Şönt kaybı', `${fmt(psh, 2)} W`, psh < .5 ? 'ok' : psh < 2 ? 'warn' : 'bad', rsh === 1 ? `1 Ω'da ${fmt(I, 1)} V düşüm; ≥ ${Math.ceil(psh * 2)} W direnç gerekir` : c.isense === 'discrete' ? `${rsh} Ω şönt: ≥ ${Math.max(0.5, Math.ceil(psh * 4) / 2)} W direnç yeterli` : 'INA219 0.1 Ω');
    if (c.isense === 'shunt1') add('Low-side şönt ölçüm hatası', c.subtractShuntDrop ? 'düzeltiliyor' : `+${fmt(I, 2)} V`, c.subtractShuntDrop ? 'warn' : 'bad', 'Bölücü V_paket + I·R ölçer; CV erken başlar');
    const vErr = c.isense === 'ina219' ? 0.5 : (c.vccCal ? 0.3 : Math.max(Math.abs(c.vccErrPct), 5));
    add('Gerilim ölçüm belirsizliği', `±${fmt(12.6 * vErr / 300 * 1000, 0)} mV/hücre`, vErr <= 0.5 ? 'ok' : vErr <= 1.2 ? 'warn' : 'bad',
      c.isense === 'ina219' ? 'INA219 bus hatası 25 °C\'de ±0.5 % maks.' : 'ADC referansı 5 V hattı (USB: 4.75–5.25 V)');
    // Uno: A0–A5; I²C LCD varsa A4/A5 dolu
    // Uno: A0–A5. Tek LCD var; I²C ise A4/A5'i kullanır (INA219 de aynı I²C hattında).
    const i2c = c.isense === 'ina219' || c.lcdBus === 'i2c';
    const need = 1 + (c.cellMonitor ? 2 : 0) + (c.isense === 'ina219' ? 0 : 2) + (i2c ? 2 : 0);
    add('Uno analog pin bütçesi', `${need} / 6`, need <= 6 ? 'ok' : 'bad',
      c.isense === 'ina219' ? 'A0 TMP36 · A1/A2 hücre uçları · A4/A5 I²C (INA219 + LCD aynı hatta) · A3 boş'
        : c.lcdBus === 'parallel' ? 'A0 TMP36 · A1/A2 hücre uçları · A3 paket bölücü · A4 akım (op-amp) · A5 boş. LCD paralel: D2–D6, D8 (ikinci LCD olmadığı için dijital pinler yetiyor)'
        : `TMP36 + ${c.cellMonitor ? '2 hücre ucu + ' : ''}paket bölücü + akım + I²C LCD (A4/A5) = ${need}: sığmıyor. LCD\'yi paralel bağla`);
    if (c.isense !== 'ina219' && c.lcdBus === 'parallel')
      add('Uno dijital pin bütçesi', '12 / 12', 'warn', 'D2–D6, D8 LCD · D7 röle · D9 PWM · D10 buzzer · D11/D13 LED · D12 mod anahtarı. Tamamı dolu; yeni çıkış için A5 dijital olarak kullanılabilir.');
    add('Hücre bazlı izleme', c.cellMonitor ? 'var' : 'yok', c.cellMonitor ? 'ok' : 'bad', 'Dengesiz pakette bir hücre 4.25 V\'a çıkar ve BMS keser');
    add('0 °C altında şarj', c.lowTempInhibit ? 'engelli' : 'serbest', c.lowTempInhibit ? 'ok' : 'bad', 'Datasheet şarj penceresi 0–60 °C');
    add('Sensör arızası denetimi', c.sensorCheck ? 'var' : 'yok', c.sensorCheck ? 'ok' : 'bad', 'Kopuk TMP36 −50 °C okur; sıcaklık koruması sessizce devre dışı kalır');
    add('Bitiş onayı', `${c.doneDebounceS} s`, c.doneDebounceS >= 2 ? 'ok' : 'bad', 'Tek okumayla bitiş, anlık sıfır akımda yanlış "tamam" verir');
    add('BMS', c.bmsPresent ? 'takılı' : 'YOK', c.bmsPresent ? 'ok' : 'bad', c.bmsPresent ? 'Hücre OVP/UVP, kısa devre koruması ve balans' :
      'Şarjda firmware (hücre izleme + yazılım OVP) ve sabit tavan korur; ama deşarjda Arduino kapalı olduğundan alt gerilim sınırı yok, kısa devrede tek koruma F1. Balans da yok.');
    add('Watchdog', c.watchdog ? 'var' : 'yok', c.watchdog ? 'ok' : 'warn', 'Kilitlenmede röle bırakılır');
    add('Şarj akımı', `${fmt(I, 2)} A · ${fmt(I / 2.8, 2)}C`, I <= 4 ? (I <= 1.4 ? 'ok' : 'warn') : 'bad', 'Datasheet: standart 1.4 A, maks. 4.0 A');
    add('Bitiş akımı', `${fmt(c.iCut * 1000, 0)} mA`, Math.abs(c.iCut - .14) < .03 ? 'ok' : 'warn', 'Datasheet: 140 mA');
    const gain = c.powerMethod === 'injection' ? CA.gainOf(c) : 1;
    const pwmStep = 5 / ((1 << c.pwmBits) - 1) * gain / (0.09 + rsh + c.rPathOhm);
    if (c.powerMethod === 'injection') {
      const vmin = CA.ceilingOf(c) - CA.gainOf(c) * (5 - c.diodeV - 1.25);
      add('PWM ile ulaşılan en düşük çıkış', `${fmt(vmin, 2)} V`, vmin <= 9.0 ? 'ok' : vmin <= 10.5 ? 'warn' : 'bad',
        `Kazanç R_üst/(R4+R3) = ${fmt(gain, 2)}. Derin deşarjlı paketi (≈ 9 V) 140 mA ile ön şarj edebilmek için ≤ 9 V gerekir.`);
    } else {
      const fbMax = c.rBotA > 0 ? 5 * c.rBotA / (c.rFiltA + c.rBotA) : 5;
      add('FB\'ye ulaşabilen gerilim', `${fmt(fbMax, 2)} V`, fbMax > 1.25 ? 'warn' : 'bad',
        fbMax > 1.25 ? 'PWM FB\'yi 1.25 V\'un üstüne çıkarabiliyor: çıkış iki konumlu (açık/kapalı)' : 'R_alt yerinde: FB 1.25 V\'a hiç ulaşamaz, çıkış sürekli tam açık — Arduino\'nun kontrolü yok');
    }
    add('PWM adımı', `${fmt(pwmStep * 1000, 0)} mA`, pwmStep < .05 * I ? 'ok' : 'warn', `${c.pwmBits}-bit`);
    add('BMS OVP marjı', `${fmt((c.bmsOvp - 4.2) * 1000, 0)} mV`, c.bmsOvp - 4.2 >= .03 ? 'ok' : 'bad', 'OVP 4.20 V\'ta olursa her şarj sonunda BMS keser');
    return out;
  }
  function renderChecks() {
    const cs = checks(), bad = cs.filter(x => x.l === 'bad').length;
    $('checkCnt').hidden = !bad; $('checkCnt').textContent = bad;
    const ic = { ok: '✓', warn: '!', bad: '✕' };
    $('checks').innerHTML = '<tr><th></th><th>Kontrol</th><th>Değer</th><th>Neden önemli</th></tr>' +
      cs.map(r => `<tr><td class="lv ${r.l}">${ic[r.l]}</td><td>${r.n}</td><td class="n">${r.v}</td><td class="note">${r.note}</td></tr>`).join('');
  }

  // --- Arduino paneli ------------------------------------------------------------
  const FSM = ['CC_MODE', 'CV_MODE', 'CHARGE_DONE', 'TEMP_FAULT', 'LOW_TEMP', 'SENSOR_FAULT', 'OV_FAULT', 'TIMEOUT', 'MCU_OFF'];
  function renderArduino() {
    const m = sys.fw.meas, h = sys.hw, st = sys.fw.state;
    const short = st === 'CHARGE_DONE' ? 'TAMAM' : /FAULT|TIMEOUT/.test(st) ? 'HATA' : st === 'LOW_TEMP' ? 'SOGUK' : st.replace('_MODE', '');
    const off = st === 'MCU_OFF';
    $('lcd1').textContent = off ? ''.padEnd(16) : `V:${fmt(m.v, 2)} I:${fmt(m.i, 2)}`.padEnd(16).slice(0, 16);
    $('lcd2').textContent = off ? ''.padEnd(16) : `${fmt(m.t, 1)}C ${short} ${cfg.fast ? 'F' : 'S'}`.padEnd(16).slice(0, 16);
    $('lcd1').parentElement.classList.toggle('dark', off);
    const rows = [['Paket', fmt(h.vPack, 3) + ' V', fmt(m.v, 3) + ' V', fmt((m.v - h.vPack) * 1000, 0) + ' mV'],
      ['Akım', fmt(h.iCharge, 3) + ' A', fmt(m.i, 3) + ' A', fmt((m.i - h.iCharge) * 1000, 0) + ' mA'],
      ['Sıcaklık', fmt(sys.cells[1].tempC, 1) + ' °C', fmt(m.t, 1) + ' °C', fmt(m.t - sys.cells[1].tempC, 1) + ' °C']];
    if (cfg.cellMonitor) m.cells.forEach((v, i) => rows.push([`H${i + 1}`, fmt(cellV(i), 3) + ' V', fmt(v, 3) + ' V', fmt((v - cellV(i)) * 1000, 0) + ' mV']));
    $('measTable').innerHTML = '<tr><th></th><th>Gerçek</th><th>Arduino</th><th>Fark</th></tr>' + rows.map(r => `<tr><td>${r[0]}</td>${r.slice(1).map(x => `<td class="n">${x}</td>`).join('')}</tr>`).join('');
    $('fsm').innerHTML = FSM.map(x => `<span class="${x === st ? 'on' : ''} ${/FAULT|TIMEOUT/.test(x) ? 'bad' : ''}">${x}</span>`).join('');
    let why;
    if (cfg.fwFrozen) why = 'Firmware kilitli: PWM ve röle son değerinde.';
    else if (st === 'CC_MODE') why = `CC hedefi ${fmt(sys.ccTarget(), 2)} A, ölçülen ${fmt(m.i, 3)} A.\nCV'ye geçiş: paket ≥ ${fmt(cfg.vCv)} V${cfg.cellMonitor ? ' veya bir hücre ≥ 4.20 V' : ''}.`;
    else if (st === 'CV_MODE') why = `CV: ölçülen ${fmt(m.v, 3)} V.\nBitiş: I ≤ ${fmt(cfg.iCut)} A, ${cfg.doneDebounceS} s boyunca. Şu an ${fmt(m.i, 3)} A.`;
    else if (off) why = 'Adaptör yok: Arduino beslemesiz. Röle açık; deşarjda paketi yalnızca BMS (UVP 2.50 V) korur.';
    else why = 'Çıkış kapalı, röle açık.';
    $('whyNow').textContent = why + `\nPWM ${h.duty}/${sys.pwmMax()} → ${fmt(h.vFilt, 2)} V`;
  }

  // --- Günlük -----------------------------------------------------------------
  function flushLog() {
    while (evShown < sys.events.length) {
      const e = sys.events[evShown++], d = document.createElement('div');
      d.innerHTML = `<time>${hms(e.t)}</time><span class="${e.kind}"></span>`;
      d.lastChild.textContent = e.msg;
      $('log').prepend(d);
    }
  }

  // --- Çevrim testi (BMS var ↔ yok) ----------------------------------------------
  const cycOpts = (ro) => ({ xLabel: 'çevrim', xKey: 'n', minSpan: 5, pad: { l: 40, r: 12 }, left: ro,
    series: [], refLines: [] });
  const chSpread = new LineChart($('cycSpread'), cycOpts({ min: 0, max: 8, label: '%' }));
  const chMin = new LineChart($('cycMin'), cycOpts({ min: 2.0, max: 3.0, label: 'V' }));
  let cycData = { yes: [], no: [] }, cycBusy = false;
  function drawCyc() {
    const N = Math.max(5, +$('cycN').value || 30);
    const mk = (key, digits) => [
      { key, rows: cycData.yes, color: cssv('--cv'), label: 'BMS var', width: 2, digits },
      { key, rows: cycData.no, color: cssv('--fault'), label: 'BMS yok', width: 2, digits }];
    chSpread.o.series = mk('spread', 2);
    const all = [...cycData.yes, ...cycData.no];
    chSpread.o.left.max = Math.max(2, Math.ceil(Math.max(0, ...all.map(r => r.spread)) + 0.5));
    chMin.o.series = mk('minV', 2);
    chMin.o.left.min = Math.min(2.3, Math.floor((Math.min(3, ...all.map(r => r.minV)) - 0.05) * 10) / 10);
    chMin.o.refLines = [{ axis: 'left', value: 2.5, color: cssv('--fault'), label: '2.50 V datasheet deşarj sonu', right: true }];
    chSpread.draw([{ n: 0 }], { xKey: 'n', xMin: 1, xMax: N });
    chMin.draw([{ n: 0 }], { xKey: 'n', xMin: 1, xMax: N });
  }
  function cycSummary() {
    const y = cycData.yes, n = cycData.no; if (!y.length) return '';
    const L = a => a[a.length - 1], F = a => a[0];
    const under = n.filter(r => r.minV < 2.5).length;
    return `<p><span class="yes"><b>BMS var:</b></span> fark %${fmt(L(y).spread, 2)}, enerji ${fmt(F(y).wh, 1)} → ${fmt(L(y).wh, 1)} Wh, en düşük hücre ${fmt(Math.min(...y.map(r => r.minV)), 2)} V.</p>` +
      (n.length ? `<p><span class="no"><b>BMS yok:</b></span> fark %${fmt(L(n).spread, 2)}, enerji ${fmt(F(n).wh, 1)} → ${fmt(L(n).wh, 1)} Wh (−%${fmt((1 - L(n).wh / F(n).wh) * 100, 1)}), ${under} çevrimde bir hücre 2.5 V'un altına indi — cihazın paket düzeyindeki kesmesi (${$('cycCut').value} V) zayıf hücreyi görmüyor.</p>` : '');
  }
  $('cycRun').addEventListener('click', () => {
    if (cycBusy) return; cycBusy = true; $('cycRun').disabled = true;
    const N = Math.max(2, Math.min(100, +$('cycN').value || 30)), rest = Math.max(0, +$('cycRest').value || 0), cut = +$('cycCut').value || 9;
    cycData = { yes: [], no: [] };
    const gens = [['yes', SC.cycleTest({ bms: true, cycles: N, restDays: rest, cutoffV: cut })], ['no', SC.cycleTest({ bms: false, cycles: N, restDays: rest, cutoffV: cut })]];
    let g = 0;
    const step = () => {
      const t0 = performance.now();
      while (g < gens.length && performance.now() - t0 < 60) {
        const it = gens[g][1].next();
        if (it.done) { g++; continue; }
        const r = it.value; cycData[gens[g][0]].push({ n: r.n, spread: r.spreadFull * 100, minV: r.minCellV, wh: r.usedWh });
      }
      $('cycProg').style.width = ((cycData.yes.length + cycData.no.length) / (2 * N) * 100) + '%';
      drawCyc(); $('cycSum').innerHTML = cycSummary();
      if (g < gens.length) setTimeout(step, 0); else { cycBusy = false; $('cycRun').disabled = false; }
    };
    step();
  });

  // --- Tablar --------------------------------------------------------------------
  let tab = 'scen';
  let bomDone = false;
  function showTab(t) {
    tab = t;
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== t; });
    if (t === 'part') renderInspector();
    if (t === 'params') renderParams();
    if (t === 'ard') renderArduino();
    if (t === 'rev') renderRevisions();
    if (t === 'cyc') drawCyc();
    if (t === 'bom' && !bomDone) { bomDone = true; BOM.mount($('bom'), 'revb'); }
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // --- Görünüm ---------------------------------------------------------------
  function renderAll(force) {
    const h = sys.hw, m = sys.fw.meas, st = sys.fw.state, vs = [0, 1, 2].map(cellV);
    // Okuma şeridi
    $('rV').innerHTML = `${fmt(h.vPack, 3)}<small>V</small>`;
    $('rVs').textContent = st === 'MCU_OFF' ? 'Arduino kapalı: ölçüm yok' : `Arduino ${fmt(m.v, 3)} V · hata ${fmt((m.v - h.vPack) * 1000, 0)} mV`;
    const ip = h.iPack, dsg = ip < -0.005;
    $('rI').innerHTML = `${ip > 0.0005 ? '+' : ip < -0.0005 ? '−' : ''}${fmt(Math.abs(ip), 3)}<small>A</small>`;
    $('rItag').textContent = dsg ? 'Paket akımı · deşarj' : ip > 0.005 ? 'Paket akımı · şarj' : 'Paket akımı';
    $('rIs').textContent = dsg ? `yük ${fmt(-ip, 2)} A · ${fmt(-ip * h.vPack, 1)} W` : `hedef ${fmt(sys.ccTarget(), 2)} A · XL4015 ${h.xlMode}`;
    const Tm = Math.max(...sys.cells.map(c => c.tempC));
    $('rT').innerHTML = `${fmt(Tm, 1)}<small>°C</small>`; $('rTs').textContent = st === 'MCU_OFF' ? 'TMP36 okunmuyor' : `TMP36 ${fmt(m.t, 1)} °C`;
    const soc = sys.cells.reduce((a, c) => a + Math.max(0, c.soc), 0) / 3;   // 2.5 V altı bölge %0 sayılır
    $('rS').innerHTML = `${fmt(soc * 100, 1)}<small>%</small>`;
    $('rSs').textContent = sys.stats.dischargedAh > 0.0005 ? `+${fmt(sys.stats.chargedAh * 1000, 0)} / −${fmt(sys.stats.dischargedAh * 1000, 0)} mAh · ${fmt(sys.stats.dischargedWh, 1)} Wh` : `${fmt(sys.stats.chargedAh * 1000, 0)} mAh yüklendi`;
    if (sys.stats.dsgStart != null && dsgSoc0 == null) dsgSoc0 = soc;
    $('rt').textContent = hms(sys.t); $('rts').textContent = `×${$('speed').value}${running ? '' : ' · duraklatıldı'}`;
    const [lbl, cls] = STATE_TR[st] || [st, ''];
    $('rState').textContent = cfg.fwFrozen ? 'Kilitlendi' : st === 'MCU_OFF' && dsg ? 'Deşarj' : lbl;
    $('rStateBox').className = 'rd state ' + (cfg.fwFrozen ? 'fault' : st === 'MCU_OFF' && !sys.bms.dsgFet ? 'fault' : cls);
    $('rStates').textContent = st === 'MCU_OFF' ? `Arduino kapalı · BMS: ${sys.bms.reason}` : `${st} · BMS: ${sys.bms.reason}`;
    const flowing = h.iCharge > 0.005;
    $('ledCC').classList.toggle('on', flowing && st === 'CC_MODE');
    $('ledCV').classList.toggle('on', flowing && st === 'CV_MODE');
    $('ledDSG').classList.toggle('on', dsg);

    // Şema
    setT('sAdapter', cfg.adapterOn ? `${cfg.adapterV} V` : 'çıkarıldı');
    setT('sXlMode', h.xlMode);
    setT('sVout', h.vOut > 0.05 ? `Vout ${fmt(h.vOut, 2)} V` : 'Vout 0 V');
    setT('sFb', cfg.powerMethod === 'injection' ? `FB ${fmt(h.vOut > 0.1 ? CA.vrefOf(cfg) : 0, 2)} V` : `FB ${fmt(sys.fbDirect(), 2)} V`);
    setT('sCeil', `tavan ${fmt(sys.ceilV(), 2)} V${cfg.ceilTrim ? '' : ' (ayarsız)'}`);
    setT('sVpwm', `${fmt(h.vFilt, 2)} V`);
    setT('sI', `I ${fmt(h.iCharge, 3)} A`);
    setT('sIna', `${fmt(m.i, 3)} A`);
    setT('sPack', `${fmt(h.vPack, 3)} V`);
    setT('sBms', sys.bms.shortTrip ? 'KİLİT' : sys.bms.chgFet ? 'CHG açık' : 'CHG KAPALI');
    setT('sBms2', sys.bms.reason);
    setT('sTmp', `${fmt(m.t, 1)} °C`);
    setT('sFsm', cfg.fwFrozen ? 'KİLİTLENDİ' : st === 'MCU_OFF' ? 'BESLEME YOK' : st);
    setT('pA0', `TMP36 ${m.a0.toFixed(0)}`); setT('pA1', cfg.cellMonitor ? `H1+ ${fmt(m.cells[0], 2)} V` : '—');
    setT('pA2', rev === 'A' ? `bölücü ${m.a2.toFixed(0)}` : (cfg.cellMonitor ? `H2+ ${fmt(m.cells[0] + m.cells[1], 2)} V` : '—'));
    const discB = rev === 'B' && cfg.isense === 'discrete';
    app.classList.toggle('measDisc', cfg.isense === 'discrete');
    app.classList.toggle('noBms', !cfg.bmsPresent);
    const cm = sys.currentMode();
    document.querySelectorAll('[data-req]').forEach(b => b.setAttribute('aria-pressed', b.dataset.req === cm || (cm === 'CHARGE+LOAD' && b.dataset.req === 'CHARGE')));
    setT('plpA4', discB && cfg.lcdBus === 'parallel' ? 'A4 · A5' : 'A4/A5');
    setT('pA3', rev === 'A' ? `şönt ${m.a3.toFixed(0)}` : discB ? `paket ${fmt(m.v, 2)} V` : '—');
    setT('pA4', rev === 'A' ? 'LCD' : discB ? (cfg.lcdBus === 'parallel' ? `akım ${fmt(m.i, 2)} A · boş` : 'akım + LCD ✕') : 'INA219 + LCD');
    setT('pD6', rev === 'A' ? `PWM ${h.duty}` : discB && cfg.lcdBus === 'parallel' ? 'LCD (D2–D6, D8)' : '—'); setT('pD9', rev === 'B' ? `PWM ${h.duty}` : '—');
    setT('pD7', h.relay ? 'röle 1' : 'röle 0'); setT('pD12', cfg.fast ? 'FAST' : 'SAFE');
    vs.forEach((v, i) => {
      const n = i + 1, c = sys.cells[i];
      setT('cellV' + n, `${fmt(v, 3)} V`);
      setT('cellS' + n, c.soc < 0 ? `aşırı deşarj · ${fmt(c.tempC, 1)} °C` : `%${fmt(c.soc * 100, 0)} · ${fmt(c.tempC, 1)} °C`);
      S('cellB' + n).setAttribute('opacity', sys.bms.bal[i] ? 1 : 0);
      svg.querySelector(`[data-part="cell${n}"]`).classList.toggle('over', v > 4.205);
    });
    svg.querySelector('[data-part="relay"]').classList.toggle('relay-on', h.relay && cfg.adapterOn);
    S('flow').classList.toggle('on', flowing && !dsg);
    S('flowD').classList.toggle('on', dsg);
    const iLoad = Math.max(0, h.iCharge - h.iPack);   // gerçekte yükten geçen akım
    setT('sLoad', cfg.loadA > 0 ? `${fmt(iLoad, 2)} A` : 'bağlı değil');
    svg.querySelector('[data-part="load"]').classList.toggle('active', dsg || (cfg.loadA > 0 && sys.bms.dsgFet));
    svg.querySelector('[data-part="uno"]').classList.toggle('mcuoff', st === 'MCU_OFF');
    S('iArrow').style.opacity = flowing ? 1 : .25;

    flushLog();
    const now = performance.now();
    if (force || now - lastSlow > 300) {
      lastSlow = now;
      drawCharts();
      if (tab === 'ard') renderArduino();
      if (tab === 'part') refreshInspectorValues();
    }
    const done = /CHARGE_DONE|TIMEOUT/.test(st);
    $('playIcon').textContent = running ? '⏸' : '▶';
    $('playText').textContent = running ? 'Duraklat' : (sys.t > 0 && !done ? 'Devam' : 'Başlat');
    $('toEnd').disabled = busy;
  }

  // --- Döngü -------------------------------------------------------------------
  function frame(now) {
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (running && !busy) {
      advance(dt * (+$('speed').value || 1));
      if (prog && prog.sc.stop && prog.sc.stop(sys)) { running = false; sys.log('Senaryo tamamlandı.', 'ok'); }
    }
    renderAll(false);
    requestAnimationFrame(frame);
  }

  function toEnd() {
    busy = true; running = false;
    const multi = prog && prog.sc.steps;
    const end = sys.t + (multi ? 10 : 5) * 3600, uvp0 = sys.stats.uvpTrips; let doneAt = null;
    // Bitiş: senaryonun kendi koşulu; yoksa BMS UVP (deşarj) ya da şarjın bitmesi
    const finished = () => (prog && prog.sc.stop) ? prog.sc.stop(sys) :
      sys.stats.uvpTrips > uvp0 || (!(cfg.loadA > 0 && !cfg.adapterOn) && /CHARGE_DONE|TIMEOUT/.test(sys.fw.state));
    const chunk = () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 30 && sys.t < end) {
        advance(20);
        if (finished()) { doneAt ??= sys.t; if (sys.t - doneAt > 60) break; }
      }
      renderAll(true);
      if (sys.t < end && !(doneAt && sys.t - doneAt > 60)) setTimeout(chunk, 0);
      else {
        busy = false;
        const st = sys.stats, dsgTxt = st.dischargedAh > 0.001 ? `, çekilen ${fmt(st.dischargedAh * 1000, 0)} mAh / ${fmt(st.dischargedWh, 1)} Wh` : '';
        sys.log(`Sona gidildi: ${sys.fw.state}, yüklenen ${fmt(st.chargedAh * 1000, 0)} mAh${dsgTxt}, hücre aralığı ${fmt(st.minCellV, 3)}–${fmt(st.maxCellV, 3)} V.`,
          st.maxCellV > 4.21 ? 'bad' : (sys.fw.state === 'CHARGE_DONE' || st.uvpTrips > uvp0) ? 'ok' : 'warn');
        renderAll(true);
      }
    };
    chunk();
  }

  $('play').addEventListener('click', () => { running = !running; sys.log(running ? 'Başlatıldı.' : 'Duraklatıldı.'); });
  $('reset').addEventListener('click', () => {
    running = false; cfg.fwFrozen = false; cfg.pwmBroken = false; cfg.tempSensorOk = true; cfg.adapterOn = true; cfg.loadA = 0;
    const sc = findScen(activeScen);
    if (sc) sc.apply(cfg);
    prog = newProg(sc);
    fresh();
  });
  $('toEnd').addEventListener('click', toEnd);
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey) return;
    if (e.key === ' ' && !e.target.closest('.part, button')) { e.preventDefault(); $('play').click(); }
    else if (e.key === 'r' || e.key === 'R') $('reset').click();
    else if (e.key === 'e' || e.key === 'E') toEnd();
    else if (e.key === 'c' || e.key === 'C') request('CHARGE');
    else if (e.key === 'k' || e.key === 'K') request('USE');
    else if (e.key === 'w' || e.key === 'W') request('REST');
  });
  window.addEventListener('resize', drawCharts);

  // --- Başlat ------------------------------------------------------------------
  SC.SCENARIOS.find(x => x.id === 'normal').apply(cfg);
  prog = newProg(SC.SCENARIOS.find(x => x.id === 'normal'));
  renderScenarios(); renderParams(); renderChecks();
  fresh('Rev B (önerilen devre) · Normal şarj senaryosu hazır. Başlatmak için boşluk tuşu.');
  requestAnimationFrame(frame);
})();
