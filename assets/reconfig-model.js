/*
 * Alternatif mimari: MOSFET matrisiyle yeniden yapılandırılabilir 3 hücreli paket.
 *   Şarj  : 1S3P (paralel), tek hücreli CC/CV şarj katı (4.20 V, 3 × 1.4 A)
 *   Kullan: 3S1P (seri), yük OUT anahtarı üzerinden
 *
 * Merdiven (ladder) topolojisi, hücreler soldan sağa H1, H2, H3:
 *   Paralel  : P1 (H1− ↔ H2−), P2 (H2− ↔ H3−), P3 (H1+ ↔ H2+), P4 (H2+ ↔ H3+)
 *   Seri     : S12 (H1+ ↔ H2−), S23 (H2+ ↔ H3−)
 *   Bağlantı : CHG (şarj katı ↔ H1), OUT (H3+ ↔ yük +; yük − = H1−)
 *   Ön eşitleme: R3/R4 dalları P3/P4'e paralel (Q3r, Q4r) — P1, P2 kapalıyken
 *
 * Tarayıcıda window.Reconfig, Node'da module.exports.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./a28-model.js') : root.A28);
  if (isNode) module.exports = api; else root.Reconfig = api;
})(typeof self !== 'undefined' ? self : this, function (A28) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function defaultConfig() {
    return {
      chargerV: 4.20, chargerI: 4.2, iCutTotal: 0.42,    // 3 × 1.4 A CC, 3 × 140 mA bitiş
      adapterOn: true,
      loadA: 2.9,
      rds: 0.010,                  // anahtar başına (sırt sırta iki MOSFET + bağlantı) iletim direnci (Ω)
      deadTimeS: 0.02,             // firmware ölü zamanı: eski grup kapatılır, bu süre sonra yeni grup açılır
      // --- Gate sürme ---
      // 'pv'    : her anahtar = sırt sırta 2 N-MOSFET + fotovoltaik optik sürücü (Vishay VOM1271: Voc 8.4 V, Isc 15 µA)
      // 'fast'  : izoleli hızlı gate sürücüsü + izole DC-DC (µs mertebesinde açılır/kapanır)
      // 'direct': Arduino pini doğrudan gate'e (yalnız source'u GND'de olan anahtarlar açılabilir)
      driver: 'pv',
      qgNc: 15,                    // MOSFET başına toplam gate yükü (nC); anahtar başına 2 MOSFET
      pvIscUa: 15, pvVoc: 8.4,     // VOM1271 datasheet (IF = 10 mA)
      pvToffUs: 100,               // entegre hızlı kapatma devresiyle (datasheet 65 µs @ 200 pF; 30 nC için tahmin)
      fastTonUs: 0.2, fastToffUs: 0.5, fastVgs: 12,
      vth: 2.0, vgsFull: 4.5,      // mantık seviyeli MOSFET: 4.5 V'ta tam iletim
      hwDelayMs: 5,                // donanım kilitlemesi: bir grubun beslemesi, diğeri söndükten 5 ms sonra açılır
      measS: 0.1,                  // ölçüm durumu (yalnız P1+P2 kapalı) süresi
      // A28'in OCV eğrisi orta bölgede düz: 0.1 V fark ≈ %15–20 SOC. Bu yüzden eşitleme
      // "küçük akımla" değil, akım sınırlı ama güçlü yapılmalı.
      hardDeltaV: 0.25,            // doğrudan paralele alma sınırı (ani akım ≈ 3 A < 4 A maks. şarj)
      maxPreDeltaV: 0.60,          // üstünde paralele alma reddedilir
      rPre: 0.10,                  // ön eşitleme dal direnci (Ω), ani akımı ≈ 3 A ile sınırlar
      preDoneV: 0.20,
      interlock: true,             // donanımsal kilitleme (seri ↔ paralel çakışmasını engeller)
      uvpSoft: 3.0, uvpHard: 2.5, ovpHard: 4.25, tCut: 45,
      fuseA: 10,                   // paket sigortası
      ambientC: 25, rthKW: 15, extraHeatW: 0,
      cells: [
        { soc: 0.2, capacityScale: 1, rScale: 1 },
        { soc: 0.2, capacityScale: 1, rScale: 1 },
        { soc: 0.2, capacityScale: 1, rScale: 1 },
      ],
    };
  }

  // Mod → anahtar durumları
  const GATES = ['P1', 'P2', 'P3', 'P4', 'S12', 'S23', 'CHG', 'OUT', 'Q3r', 'Q4r'];
  // Her anahtarın bağladığı iki düğüm (a: hücre −, b: hücre +; a1 = GND)
  const TERM = { P1: ['a1', 'a2'], P2: ['a2', 'a3'], P3: ['b1', 'b2'], P4: ['b2', 'b3'], S12: ['b1', 'a2'], S23: ['b2', 'a3'],
    CHG: ['chg', 'b1'], OUT: ['b3', 'out'], Q3r: ['b1', 'b2'], Q4r: ['b2', 'b3'] };
  // Donanım kilitlemesindeki besleme grupları: aynı anda yalnız biri enerjili olabilir
  const GROUP = { P1: 'PAR', P2: 'PAR', P3: 'PAR', P4: 'PAR', CHG: 'PAR', Q3r: 'PAR', Q4r: 'PAR', S12: 'SER', S23: 'SER', OUT: 'SER' };
  // Bir paralel ve bir seri anahtar birlikte iletirse kısa devre olan hücre
  const SHORTS = [['P1', 'S12', 1], ['P3', 'S12', 2], ['P2', 'S23', 2], ['P4', 'S23', 3]];
  const MODE_GATES = {
    OFF: [], DEAD: [], FAULT: [], MEAS: ['P1', 'P2'],
    PRE: ['P1', 'P2', 'Q3r', 'Q4r'],
    PAR: ['P1', 'P2', 'P3', 'P4', 'CHG'],
    PAR_IDLE: ['P1', 'P2', 'P3', 'P4'],
    SER: ['S12', 'S23', 'OUT'],
  };

  class SystemC {
    constructor(cfg) {
      this.cfg = Object.assign(defaultConfig(), cfg || {});
      this.cfg.cells = (this.cfg.cells || defaultConfig().cells).map(c => Object.assign({}, c));
      this.reset();
    }
    reset() {
      const c = this.cfg;
      this.t = 0;
      this.cells = c.cells.map(x => new A28.Cell({ soc: x.soc, tempC: c.ambientC, capacityScale: x.capacityScale, rScale: x.rScale, params: { rthKW: c.rthKW } }));
      this.mode = 'OFF';            // anahtar topolojisi
      this.request = 'IDLE';        // kullanıcı isteği
      this.target = null;           // dead-time sonrası gidilecek mod
      this.timer = 0;
      this.chg = 'IDLE';            // CC | CV | DONE
      this.doneTimer = 0;
      this.reason = 'Tüm anahtarlar kapalı';
      this.fault = null;
      this.i = [0, 0, 0]; this.iTotal = 0; this.vBus = 0; this.vOut = 0;
      this.events = []; this.history = []; this._h = 1e9;
      this.meas = { cells: [null, null, null], at: null };
      this.lastTr = null;
      this.prevSet = [];
      this.stats = { chargedAh: 0, dischargedAh: 0, dischargedWh: 0, peakCellI: 0, maxCellV: 0, minCellV: 9, maxTemp: c.ambientC,
        transitions: 0, doneAt: null, useEndAt: null, shortA: 0, peakParI: 0, preS: 0 };
    }
    log(msg, kind = '') { this.events.push({ t: this.t, msg, kind }); }
    gates() { const g = {}; GATES.forEach(k => { g[k] = false; }); (MODE_GATES[this.modeKey()] || []).forEach(k => { g[k] = true; }); return g; }
    modeKey() { return this.mode === 'PAR' && (!this.cfg.adapterOn || this.chg === 'DONE') ? 'PAR_IDLE' : this.mode; }
    /** Şu an enerjili gate sayısı ve sürücü LED akımı (VOM1271: 10 mA/LED). */
    driveLoad() { const n = (MODE_GATES[this.modeKey()] || []).length; return { n, ledMa: this.cfg.driver === 'pv' ? n * 10 : 0 }; }
    ocvs() { return this.cells.map(x => x.ocv); }
    deltaV() { const v = this.cells.map(x => x.terminalV(0)); return Math.max(...v) - Math.min(...v); }
    /** Her hücreden paralel bara kadar yol direnci (merdiven: H2 iki, H3 dört anahtar). */
    pathR(k, pre = false) {
      const c = this.cfg, n = [0, 2, 4][k];
      if (pre) return this.cells[k].r0 + n * c.rds + [0, 1, 2][k] * c.rPre;
      return this.cells[k].r0 + n * c.rds;
    }

    // --- Gate sürme -------------------------------------------------------------
    /** Düğüm potansiyelleri (a1 = 0) — verilen modda, hücrelerin açık devre gerilimleriyle. */
    nodes(mode) {
      const v = this.cells.map(x => x.terminalV(0)), bus = Math.max(...v), c = this.cfg;
      if (mode === 'SER') return { a1: 0, b1: v[0], a2: v[0], b2: v[0] + v[1], a3: v[0] + v[1], b3: v[0] + v[1] + v[2], chg: 0, out: v[0] + v[1] + v[2] };
      if (mode === 'MEAS') return { a1: 0, a2: 0, a3: 0, b1: v[0], b2: v[1], b3: v[2], chg: 0, out: 0 };
      return { a1: 0, a2: 0, a3: 0, b1: bus, b2: bus, b3: bus, chg: c.adapterOn ? bus : 0, out: 0 };   // PAR / PRE
    }
    /** Sürücü zamanlamaları (s). tOnStart: gate Vth'e ulaşıp iletimin başladığı an. */
    timing() {
      const c = this.cfg;
      if (c.driver === 'pv') { const tOn = 2 * c.qgNc * 1e-9 / (c.pvIscUa * 1e-6); return { tOn, tOnStart: tOn * c.vth / c.pvVoc, tOff: c.pvToffUs * 1e-6, vgs: c.pvVoc }; }
      if (c.driver === 'fast') return { tOn: c.fastTonUs * 1e-6, tOnStart: c.fastTonUs * 1e-6 * c.vth / c.fastVgs, tOff: c.fastToffUs * 1e-6, vgs: c.fastVgs };
      const tOn = 2 * c.qgNc * 1e-9 / 0.02;   // Arduino pini ~20 mA
      return { tOn, tOnStart: tOn * c.vth / 5, tOff: tOn, vgs: 5 };
    }
    /** Anahtar 'mode' modunda iletime geçmesi gerekirken gate-source gerilimi. */
    gateInfo(sw, mode) {
      const c = this.cfg, n = this.nodes(mode), [x, y] = TERM[sw];
      const vs = Math.min(n[x], n[y]);                       // N-MOSFET source'u alt potansiyelde
      const vgs = c.driver === 'direct' ? 5 - vs : this.timing().vgs;   // izoleli sürücü source'a göre sürer
      return { vs, vgs, ok: vgs >= c.vgsFull };
    }
    /** Grup geçişi: eski setten yeni sete. Ölü zaman, sürücü zamanlaması ve kilitlemeyle çakışma kontrolü. */
    transition(fromSet, toSet, toMode) {
      const c = this.cfg, tm = this.timing();
      const bad = toSet.map(sw => [sw, this.gateInfo(sw, toMode)]).filter(([, g]) => !g.ok);
      const fromG = new Set(fromSet.map(s => GROUP[s])), toG = new Set(toSet.map(s => GROUP[s]));
      const cross = [...fromG].some(g => ![...toG].includes(g)) && fromSet.length && toSet.length;
      let cmdOn = c.deadTimeS, hw = false;
      if (cross && c.interlock && cmdOn < tm.tOff + c.hwDelayMs / 1000) { cmdOn = tm.tOff + c.hwDelayMs / 1000; hw = true; }
      const onStart = cmdOn + tm.tOnStart, onDone = cmdOn + tm.tOn;
      const overlap = cross ? Math.max(0, tm.tOff - onStart) : 0;
      const pair = overlap > 0 ? SHORTS.find(([p, q]) => (fromSet.includes(p) && toSet.includes(q)) || (fromSet.includes(q) && toSet.includes(p))) : null;
      this.lastTr = { from: fromSet.slice(), to: toSet.slice(), toMode, tOff: tm.tOff, cmdOn, onStart, onDone, overlap, pair, hw, driver: c.driver, dead: c.deadTimeS, bad };
      return this.lastTr;
    }
    /** Yeni moda geç (geçiş analiziyle). false dönerse geçiş yapılamadı. */
    enter(mode) {
      const toSet = MODE_GATES[mode === 'PAR' && !this.cfg.adapterOn ? 'PAR_IDLE' : mode];
      const tr = this.transition(this.prevSet, toSet, mode);
      if (tr.bad.length) {
        const g = tr.bad.map(([sw, x]) => `${sw} (Vs ${x.vs.toFixed(1)} V → Vgs ${x.vgs.toFixed(1)} V)`).join(', ');
        this.setFault('GATE_DRIVE', `${g} açılamıyor: Vgs < ${this.cfg.vgsFull} V. Source yüzen potansiyelde; izoleli sürücü gerekir.`);
        return false;
      }
      if (tr.pair) {
        const k = tr.pair[2], cell = this.cells[k - 1], I = cell.vBehindR0 / (cell.r0 + 2 * this.cfg.rds);
        this.stats.shortA = I;
        this.setFault('SHOOT_THROUGH', `${tr.pair[0]} kapanmadan ${tr.pair[1]} iletime geçti (${(tr.overlap * 1e6).toFixed(1)} µs çakışma) → H${k} kısa devre, ≈ ${I.toFixed(0)} A`);
        return false;
      }
      this.prevSet = toSet.slice();
      this.mode = mode;
      return true;
    }
    /** Arduino'nun hücre ölçümü: b1, b2, b3 düğümleri bölücülerle (1, 1/2, 1/3.13) ADC'ye; 16 örnek ortalama. */
    measureCells(mode) {
      const n = this.nodes(mode), ratio = [1, 2, 14.7 / 4.7];
      const adc = v => { let s = 0; for (let k = 0; k < 16; k++) s += Math.max(0, Math.min(1023, Math.round(v / 5 * 1023 + (Math.random() - 0.5)))); return s / 16 * 5 / 1023; };
      const b = ['b1', 'b2', 'b3'].map((k, j) => adc(n[k] / ratio[j]) * ratio[j]);
      return mode === 'SER' ? [b[0], b[1] - b[0], b[2] - b[1]] : b;
    }

    // --- Kullanıcı istekleri --------------------------------------------------
    requestMode(req) {
      if (this.mode === 'FAULT' && req !== 'RESET') { this.log('Önce arızayı sıfırlayın.', 'warn'); return; }
      if (req === 'RESET') { this.fault = null; this.prevSet = []; this.mode = 'OFF'; this.request = 'IDLE'; this.reason = 'Arıza sıfırlandı'; this.log('Arıza sıfırlandı; tüm anahtarlar kapalı.', 'ok'); return; }
      this.request = req;
      if (req === 'IDLE') { this.goDead(null, 'Kullanıcı: tümünü kapat'); return; }
      const want = req === 'CHARGE' ? 'PAR' : 'SER';
      if (this.mode === want || this.target === want) return;
      this.goDead(want, `İstek: ${req === 'CHARGE' ? 'şarj (1S3P)' : 'kullanım (3S1P)'}`);
    }
    goDead(target, why) {
      if (this.mode !== 'DEAD' && this.mode !== 'FAULT') this.prevSet = (MODE_GATES[this.modeKey()] || []).slice();
      this.mode = 'DEAD'; this.target = target; this.timer = 0; this.stats.transitions++;
      this.reason = `Break-before-make: tüm anahtarlar KAPALI, ${(this.cfg.deadTimeS * 1000).toFixed(0)} ms ölü zaman`;
      this.log(`${why} → tüm gate'ler kapatıldı (dead-time)`, 'warn');
    }
    setFault(code, msg) {
      this.mode = 'FAULT'; this.fault = code; this.target = null; this.reason = msg;
      this.log(`ARIZA: ${msg}`, 'bad');
    }
    /** Arıza enjeksiyonu: P1 ve S12'ye aynı anda gate komutu. */
    injectConflict() {
      const c = this.cfg;
      if (c.interlock) {
        this.setFault('CONFLICT_BLOCKED', 'P1 ve S12 aynı anda komut aldı → kilitleme devresi engelledi, tüm gate\'ler kapalı');
        return;
      }
      // H1 uçları S12 + P1 üzerinden kısa devre: I = V_H1 / (R0 + 2·Rds)
      const I = this.cells[0].vBehindR0 / (this.cells[0].r0 + 2 * c.rds);
      this.stats.shortA = I; this.stats.peakCellI = Math.max(this.stats.peakCellI, I);
      this.cells[0].step(-Math.min(I, c.fuseA * 20), 0.02, c.ambientC, 0, 0);   // sigorta atana kadar kısa süre
      this.setFault('SHORT', `Kilitleme yok: P1 + S12 aynı anda iletimde → H1 kısa devre, ≈ ${I.toFixed(0)} A (MOSFET SOA ve ${c.fuseA} A sigorta aşıldı)`);
    }

    // --- Kontrol (her adım) --------------------------------------------------
    control(dt) {
      const c = this.cfg;
      const vs = this.cells.map((x, k) => x.terminalV(this.i[k]));
      const T = Math.max(...this.cells.map(x => x.tempC));
      if (this.mode !== 'FAULT') {
        if (Math.max(...vs) >= c.ovpHard) return this.setFault('OVP', `Hücre ${vs.indexOf(Math.max(...vs)) + 1} ≥ ${c.ovpHard} V (donanım OVP)`);
        if (Math.min(...vs) <= c.uvpHard) return this.setFault('UVP', `Hücre ${vs.indexOf(Math.min(...vs)) + 1} ≤ ${c.uvpHard} V (donanım UVP)`);
        if (T >= c.tCut) return this.setFault('TEMP', `${T.toFixed(1)} °C ≥ ${c.tCut} °C`);
      }
      if (this.mode === 'DEAD') {
        this.timer += dt;
        if (this.timer < c.deadTimeS) return;
        const tgt = this.target;
        if (tgt === 'PAR' || tgt === 'SER') {
          // Önce ölç: yalnız P1+P2 kapalı → eksiler ortak, artılar açık; her hücre ayrı ölçülür, akım yolu yok
          if (!this.enter('MEAS')) return;
          this.measFor = tgt; this.timer = 0; this.target = null;
          this.reason = 'Ölçüm: P1+P2 kapalı, hücreler ayrı ayrı okunuyor';
          return;
        }
        if (tgt === 'SER_GO') {
          if (!this.enter('SER')) return;
          this.target = null; this.reason = '3S1P: seri kullanım'; this.log('S12, S23 ve OUT açıldı → 3S1P kullanım', 'ok'); return;
        }
        this.prevSet = []; this.mode = 'OFF'; this.reason = 'Tüm anahtarlar kapalı'; this.target = null;
        return;
      }
      if (this.mode === 'MEAS') {
        this.timer += dt;
        if (this.timer < c.measS) return;
        const m = this.measureCells('MEAS'); this.meas = { cells: m, at: this.t };
        const d = Math.max(...m) - Math.min(...m), mv = x => (x * 1000).toFixed(0);
        this.log(`Ölçüm: ${m.map(v => v.toFixed(3)).join(' / ')} V (ΔV ${mv(d)} mV)`, '');
        if (this.measFor === 'PAR') {
          if (d > c.maxPreDeltaV) return this.setFault('DELTA', `Hücre farkı ${mv(d)} mV > ${mv(c.maxPreDeltaV)} mV: paralele alma reddedildi`);
          if (d > c.hardDeltaV) {
            if (!this.enter('PRE')) return;
            this.reason = `ΔV ${mv(d)} mV: dirençli ön eşitleme`; this.log(`ΔV ${mv(d)} mV > ${mv(c.hardDeltaV)} mV → ön eşitleme (R ${c.rPre} Ω)`, 'warn'); return;
          }
          if (!this.enter('PAR')) return;
          this.chg = 'CC'; this.doneTimer = 0; this.reason = '1S3P: paralel şarj';
          this.log(`ΔV ${mv(d)} mV → P3, P4 ve CHG de açıldı: 1S3P şarj`, 'ok');
        } else {
          const mn = Math.min(...m);
          if (mn <= c.uvpSoft) { this.prevSet = MODE_GATES.MEAS.slice(); this.mode = 'OFF'; this.prevSet = []; this.request = 'IDLE'; this.reason = `En düşük hücre ${mn.toFixed(2)} V ≤ ${c.uvpSoft} V: kullanım reddedildi`; this.log(this.reason, 'warn'); return; }
          this.goDead('SER_GO', 'Ölçüm tamam, seri bağlantıya geçiş');   // P1/P2 ile S12/S23 aynı anda iletemez
        }
        return;
      }
      if (this.mode === 'PRE' && this.deltaV() <= c.preDoneV) {
        this.log(`Eşitleme tamam (ΔV ${(this.deltaV() * 1000).toFixed(0)} mV) → dirençli dallar kapatıldı, P3/P4 + CHG açıldı`, 'ok');
        if (this.enter('PAR')) { this.chg = 'CC'; this.doneTimer = 0; this.reason = '1S3P: paralel şarj'; }
      }
      if (this.mode === 'PAR' && c.adapterOn && this.chg !== 'DONE') {
        if (this.chg === 'CC' && this.vBus >= c.chargerV - 1e-3) { this.chg = 'CV'; this.log(`Bara ${c.chargerV.toFixed(2)} V → CV`, 'ok'); }
        if (this.chg === 'CV') {
          this.doneTimer = this.iTotal <= c.iCutTotal ? this.doneTimer + dt : 0;
          if (this.doneTimer >= 5) { this.chg = 'DONE'; this.stats.doneAt = this.t; this.reason = 'Şarj tamam; hücreler paralel, CHG kapalı'; this.log(`Toplam akım ≤ ${c.iCutTotal} A → ŞARJ TAMAM`, 'ok'); }
        }
      }
      if (this.mode === 'SER') {
        const mn = Math.min(...vs);
        if (mn <= c.uvpSoft) { this.stats.useEndAt = this.t; this.log(`Hücre ${vs.indexOf(mn) + 1} yük altında ${mn.toFixed(3)} V ≤ ${c.uvpSoft} V → kullanım kesildi`, 'warn'); this.request = 'IDLE'; this.goDead(null, 'Düşük gerilim'); }
      }
    }

    // --- Fizik ---------------------------------------------------------------
    solve() {
      const c = this.cfg, cells = this.cells;
      const vb = cells.map(x => x.vBehindR0);
      let i = [0, 0, 0], vBus = 0, vOut = 0;
      const key = this.modeKey();
      if (key === 'PAR' || key === 'PAR_IDLE' || key === 'PRE') {
        const pre = key === 'PRE';
        const R = [0, 1, 2].map(k => this.pathR(k, pre));
        const G = R.map(r => 1 / r), sG = G[0] + G[1] + G[2], sVG = vb[0] * G[0] + vb[1] * G[1] + vb[2] * G[2];
        let Ich = 0;
        if (key === 'PAR') {
          // Şarj katı: bara geriliminde CV 4.20 V, CC chargerI (asenkron: akım çekemez)
          const iCv = c.chargerV * sG - sVG;
          Ich = clamp(iCv, 0, c.chargerI);
        }
        vBus = (Ich + sVG) / sG;
        i = [0, 1, 2].map(k => (vBus - vb[k]) * G[k]);
        this.iTotal = Ich;
      } else if (key === 'SER') {
        const I = c.loadA;
        i = [-I, -I, -I];
        vOut = vb.reduce((a, v) => a + v, 0) - I * (cells.reduce((a, x) => a + x.r0, 0) + 3 * c.rds);
        this.iTotal = -I;
      } else this.iTotal = 0;
      this.i = i; this.vBus = vBus; this.vOut = vOut;
    }
    step(dt) {
      const c = this.cfg;
      this.t += dt;
      this.solve();
      this.stats.peakCellI = Math.max(this.stats.peakCellI, ...this.i.map(Math.abs));
      if (this.mode === 'PAR' || this.mode === 'PRE') this.stats.peakParI = Math.max(this.stats.peakParI, ...this.i.map(Math.abs));
      if (this.mode === 'PRE') this.stats.preS += dt;
      this.cells.forEach((x, k) => x.step(this.i[k], dt, c.ambientC, 0, c.extraHeatW / 3));
      if (this.iTotal > 0) this.stats.chargedAh += this.iTotal * dt / 3600;
      if (this.iTotal < 0) { this.stats.dischargedAh += -this.iTotal * dt / 3600; this.stats.dischargedWh += -this.iTotal * this.vOut * dt / 3600; }
      const vs = this.cells.map((x, k) => x.terminalV(this.i[k]));
      this.stats.maxCellV = Math.max(this.stats.maxCellV, ...vs); this.stats.minCellV = Math.min(this.stats.minCellV, ...vs);
      this.stats.maxTemp = Math.max(this.stats.maxTemp, ...this.cells.map(x => x.tempC));
      this.control(dt);
      this._h += dt;
      if (this._h >= 5 || this.mode === 'DEAD') { this._h = 0; this.record(vs); }
    }
    record(vs) {
      this.history.push({ t: this.t, c1: vs[0], c2: vs[1], c3: vs[2], i1: this.i[0], i2: this.i[1], i3: this.i[2],
        it: this.iTotal, vb: this.mode === 'SER' ? this.vOut : null, soc1: this.cells[0].soc * 100, soc2: this.cells[1].soc * 100, soc3: this.cells[2].soc * 100, mode: this.mode });
      if (this.history.length > 6000) this.history = this.history.filter((_, k) => k % 2 === 0);
    }
    run(seconds, dt = 0.05) {
      const total = seconds + (this._carry || 0), n = Math.floor(total / dt + 1e-9);
      this._carry = total - n * dt;
      for (let k = 0; k < n; k++) this.step(dt);
    }
    summary() {
      return { mode: this.mode, chg: this.chg, fault: this.fault, finalSoc: this.cells.map(x => x.soc), stats: Object.assign({}, this.stats) };
    }
  }

  /** Şarj et → dinlen → seri kullan (UVP'ye kadar). Karşılaştırma ve testler için. */
  function runCycle(cfgMod, opts = {}) {
    const cfg = defaultConfig(); if (cfgMod) cfgMod(cfg);
    const s = new SystemC(cfg);
    s.requestMode('CHARGE');
    let lim = s.t + 8 * 3600;
    while (s.t < lim && s.chg !== 'DONE' && s.mode !== 'FAULT') s.run(5);
    const charged = s.summary();
    if (opts.chargeOnly || s.mode === 'FAULT') return { s, charged, used: null };
    s.run(600);
    s.requestMode('USE');
    lim = s.t + 6 * 3600;
    while (s.t < lim && s.mode !== 'OFF' && s.mode !== 'FAULT') s.run(5);
    return { s, charged, used: s.summary() };
  }

  return { SystemC, defaultConfig, GATES, MODE_GATES, TERM, GROUP, SHORTS, runCycle };
});
