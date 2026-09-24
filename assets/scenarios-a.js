/*
 * Tasarım A senaryo matrisi. Doğrulama sayfası (dogrulama.html) ve Node testleri
 * (tests/run-tests.js) aynı tanımları kullanır.
 *
 * Her senaryo: apply(cfg) başlangıç koşulları; inject(sys) belirli bir anda arıza;
 * judge(summary, sys) → { level: 'ok'|'warn'|'bad', note }
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./charger-a.js') : root.ChargerA);
  if (isNode) module.exports = api; else root.ScenariosA = api;
})(typeof self !== 'undefined' ? self : this, function (CA) {
  'use strict';

  const socs = (cfg, a) => a.forEach((s, i) => { cfg.cells[i].soc = s; });
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const OVER = 4.21;   // 4.20 V + 10 mV ölçüm/ayrıklaştırma payı
  const maxSoc = r => Math.max(...r.finalSoc);
  /** Seri pakette en az bir hücre dolmalı; dolmadıysa şarj erken kesilmiştir. */
  const timeout = r => r.state === 'TIMEOUT' ? { level: 'warn', note: `SOC %${(avg(r.finalSoc) * 100).toFixed(1)} ama 240 dk güvenlik zamanlayıcısına takıldı` } : null;
  const early = r => maxSoc(r) < 0.95 ? { level: 'bad', note: `Erken bitti: en dolu hücre %${(maxSoc(r) * 100).toFixed(0)} (${r.state})` } : null;

  function safety(r) {
    if (r.maxCellV > 4.25 - 1e-6) return { level: 'bad', note: `Hücre ${r.maxCellV.toFixed(3)} V — yalnızca BMS OVP korudu` };
    if (r.maxCellV > OVER) return { level: 'bad', note: `Hücre ${r.maxCellV.toFixed(3)} V > 4.20 V (aşırı şarj)` };
    return null;
  }

  const SCENARIOS = [
    {
      id: 'normal', name: 'Normal şarj', desc: '3 hücre %20 SOC, 25 °C',
      apply: c => socs(c, [0.2, 0.2, 0.2]),
      judge: r => safety(r) || (avg(r.finalSoc) >= 0.97 ? timeout(r) || { level: 'ok', note: `Tam şarj, %${(avg(r.finalSoc) * 100).toFixed(1)}` }
        : { level: 'bad', note: `Eksik şarj: ortalama SOC %${(avg(r.finalSoc) * 100).toFixed(1)}` }),
    },
    {
      id: 'empty', name: 'Boş paket', desc: 'Hücreler %1 SOC (~3.0 V)',
      apply: c => socs(c, [0.01, 0.01, 0.01]),
      judge: r => safety(r) || (avg(r.finalSoc) >= 0.97 ? timeout(r) || { level: 'ok', note: 'Tam şarj' } : { level: 'bad', note: `Eksik şarj: %${(avg(r.finalSoc) * 100).toFixed(1)}` }),
    },
    {
      id: 'imbalance', name: 'Dengesiz hücreler', desc: 'SOC %40 / %25 / %18',
      apply: c => socs(c, [0.40, 0.25, 0.18]),
      judge: r => safety(r) || early(r) || (r.state === 'CHARGE_DONE' ? { level: 'warn', note: 'Güvenli bitti; zayıf hücreler dolmadı (pasif balans yetersiz)' }
        : { level: 'bad', note: `Bitmedi: ${r.state}` }),
    },
    {
      id: 'aged', name: 'Yaşlanmış hücre', desc: 'H3: %85 kapasite, 1.4× direnç',
      apply: c => { socs(c, [0.2, 0.2, 0.2]); c.cells[2].capacityScale = 0.85; c.cells[2].rScale = 1.4; },
      judge: r => safety(r) || early(r) || (r.state === 'CHARGE_DONE' ? { level: 'ok', note: 'Güvenli bitti; zayıf hücre en önce doldu' } : { level: 'bad', note: `Bitmedi: ${r.state}` }),
    },
    {
      id: 'hot', name: 'Sıcak ortam', desc: '38 °C ortam + 1.2 W dış ısı',
      apply: c => { socs(c, [0.2, 0.2, 0.2]); c.ambientC = 38; c.extraHeatW = 1.2; },
      judge: r => r.maxTemp > 60 ? { level: 'bad', note: `${r.maxTemp.toFixed(1)} °C > 60 °C (datasheet sınırı)` }
        : r.maxTemp > 47 ? { level: 'warn', note: `Maks. ${r.maxTemp.toFixed(1)} °C` }
          : r.state === 'CHARGE_DONE' ? { level: 'ok', note: `Maks. ${r.maxTemp.toFixed(1)} °C; akım azaltılarak bitti (${r.doneMin.toFixed(0)} dk)` }
            : { level: 'warn', note: `Maks. ${r.maxTemp.toFixed(1)} °C, güvenli; ama akım %20'ye indiği için şarj bitmedi (${r.state})` },
    },
    {
      id: 'cold', name: 'Soğuk ortam', desc: '−5 °C ortam',
      apply: c => { socs(c, [0.2, 0.2, 0.2]); c.ambientC = -5; },
      judge: r => r.chargedAh > 0.01 ? { level: 'bad', note: `0 °C altında ${(r.chargedAh * 1000).toFixed(0)} mAh şarj edildi (lityum kaplama riski)` }
        : { level: 'ok', note: 'Şarj engellendi' },
    },
    {
      id: 'vcc', name: 'Vcc +%4', desc: 'USB 5.20 V → ADC referansı hatalı',
      apply: c => { socs(c, [0.2, 0.2, 0.2]); c.vccErrPct = 4; },
      judge: r => safety(r) || (avg(r.finalSoc) >= 0.95 ? { level: 'ok', note: 'Ölçüm hatası etkisiz' } : { level: 'warn', note: `SOC %${(avg(r.finalSoc) * 100).toFixed(1)}` }),
    },
    {
      id: 'sensor', name: 'TMP36 kopuk', desc: 'Sensör 10. dk\'da kopar; 38 °C ortam + 2.5 W dış ısı paketi ~50 °C\'ye çıkarır',
      apply: c => { socs(c, [0.2, 0.2, 0.2]); c.ambientC = 38; c.extraHeatW = 2.5; },
      at: 600, inject: s => { s.cfg.tempSensorOk = false; },
      judge: (r, s) => r.state === 'SENSOR_FAULT' ? { level: 'ok', note: 'Arıza algılandı, şarj durdu' }
        : r.maxTemp > 45 ? { level: 'bad', note: `Arıza fark edilmedi; hücre ${r.maxTemp.toFixed(1)} °C'ye çıktı` }
          : { level: 'bad', note: 'Arıza fark edilmedi; termal koruma devre dışı kaldı' },
    },
    {
      id: 'capacity', name: 'Kapasite testi', desc: 'Şarj → 10 dk dinlenme → 2.9 A (≈1C) deşarj, BMS UVP\'ye kadar',
      apply: c => socs(c, [0.2, 0.2, 0.2]),
      steps: [
        { when: (s, x) => s.fw.state === 'CHARGE_DONE' || s.fw.state === 'TIMEOUT', act: (s, x) => { x.restAt = s.t; }, msg: 'Şarj bitti → 10 dk dinlenme' },
        { when: (s, x) => x.restAt != null && s.t - x.restAt >= 600, act: s => { s.cfg.adapterOn = false; s.cfg.loadA = 2.9; }, msg: 'Adaptör çekildi, 2.9 A yük bağlandı' },
      ],
      stop: s => s.stats.uvpTrips > 0,
      judge: r => {
        const q = r.dischargedAh, pct = q / 2.82 * 100;
        const note = `Kullanılabilir ${(q * 1000).toFixed(0)} mAh, ${r.dischargedWh.toFixed(1)} Wh (datasheet 2.9 A: ≈ 2820 mAh → %${pct.toFixed(0)})`;
        return q >= 2.6 ? { level: 'ok', note } : q >= 2.3 ? { level: 'warn', note } : { level: 'bad', note };
      },
    },
    {
      id: 'pwmBreak', name: 'PWM kablosu koptu', desc: '30. dk; tavan ölçülmeden takılmış ve bu modülde V_FB +%2 (tavan 12.88 V)',
      apply: c => { socs(c, [0.2, 0.2, 0.2]); c.vrefErrPct = 2; c.ceilTrim = false; },
      at: 1800, inject: s => { s.cfg.pwmBroken = true; },
      judge: r => safety(r) || (r.state === 'OV_FAULT' ? { level: 'ok', note: 'Yazılım OVP röleyi açtı (tavan yanlış ayarlıydı)' }
        : { level: 'ok', note: 'Donanım tavanı korudu' }),
    },
    {
      id: 'freeze', name: 'Arduino kilitlenmesi', desc: '60. dakikada firmware takılıyor',
      apply: c => socs(c, [0.2, 0.2, 0.2]),
      at: 3600, inject: s => { s.cfg.fwFrozen = true; },
      judge: r => safety(r) || { level: 'ok', note: 'Donanım sınırları paketi korudu' },
    },
  ];

  /** Çok adımlı senaryolar: sıradaki adımın koşulu sağlanınca eylemini uygular. */
  function stepProgram(sc, s, ctx) {
    const st = sc.steps[ctx.k];
    if (st && st.when(s, ctx)) { st.act(s, ctx); ctx.k++; if (st.msg) s.log(`Senaryo: ${st.msg}`, 'warn'); return true; }
    return false;
  }

  /** Bir senaryoyu verilen önayarla çalıştırır. */
  function runScenario(sc, preset, overrides) {
    const cfg = CA.presetFor(preset);
    sc.apply(cfg);
    if (overrides) overrides(cfg);
    const s = new CA.SystemA(cfg);
    if (sc.inject) { s.run(sc.at); sc.inject(s); }
    if (sc.steps) {
      const ctx = { k: 0 }, end = 10 * 3600;
      while (s.t < end && !sc.stop(s, ctx)) { s.run(5); stepProgram(sc, s, ctx); }
      s.run(30);
      const r = s.summary();
      return { r, s, verdict: sc.judge(r, s) };
    }
    const r = s.runUntilDone(5);
    return { r, s, verdict: sc.judge(r, s) };
  }

  /** Ablasyon: önerilen tasarımdan başlayıp rapordaki tek bir kararı geri al. */
  const ABLATIONS = [
    { id: 'base', name: 'Önerilen tasarım (referans)', mod: () => {} },
    { id: 'direct', name: 'XL4015 potu sökülü, PWM→FB', mod: c => { c.powerMethod = 'direct-fb'; c.xlCcA = 1.6; } },
    { id: 'shunt', name: '1 Ω low-side şönt (düzeltmeli)', mod: c => { c.isense = 'shunt1'; } },
    { id: 'shuntRaw', name: '1 Ω şönt, düşüm çıkarılmadan', mod: c => { c.isense = 'shunt1'; c.subtractShuntDrop = false; } },
    { id: 'pwm8', name: '8-bit PWM', mod: c => { c.pwmBits = 8; } },
    { id: 'nocell', name: 'Hücre bazlı izleme yok', mod: c => { c.cellMonitor = false; } },
    { id: 'nowdt', name: 'Watchdog yok', mod: c => { c.watchdog = false; } },
    { id: 'fwrep', name: 'Rapordaki firmware eşikleri', mod: c => Object.assign(c, CA.FIRMWARE_REPORT) },
    { id: 'report', name: 'Rapordaki tasarımın tamamı', preset: 'report', mod: () => {} },
  ];

  /**
   * Çevrim testi: şarj → 30 dk dinlenme → yükle kullanım (cihaz paket düzeyinde keser) → depolama.
   * Her çevrim için hücreler arası SOC farkı, kullanılabilir enerji ve en düşük hücre gerilimi döner.
   * Hücreler gerçekçi dağılımla (kapasite, kendi kendine boşalma, coulomb verimi) başlar.
   */
  function* cycleTest(opts = {}) {
    const o = Object.assign({ bms: true, cycles: 30, restDays: 7, loadA: 2.9, cutoffV: 9.0, dt: 0.1 }, opts);
    const cfg = CA.presetFor('improved');
    cfg.cells.forEach(x => { x.soc = 0.5; });
    cfg.bmsPresent = o.bms;
    const s = new CA.SystemA(cfg);
    const spread = () => { const v = s.cells.map(x => x.soc); return Math.max(...v) - Math.min(...v); };
    for (let n = 1; n <= o.cycles; n++) {
      // 1) şarj
      s.requestMode('CHARGE');
      let lim = s.t + 6 * 3600;
      s.run(5, o.dt);
      while (s.t < lim && !/CHARGE_DONE|TIMEOUT|OV_FAULT/.test(s.fw.state)) s.run(10, o.dt);
      const socFull = s.cells.map(x => x.soc), spreadFull = spread();
      // 2) dinlenme
      s.requestMode('REST'); s.run(1800, o.dt);
      // 3) kullanım: cihaz paket gerilimine bakarak keser; BMS (varsa) hücreye bakarak keser
      s.cfg.loadCutoffV = o.cutoffV; s.stats.minCellV = 9;
      const ah0 = s.stats.dischargedAh, wh0 = s.stats.dischargedWh, uvp0 = s.stats.uvpTrips;
      s.requestMode('USE', o.loadA);
      lim = s.t + 4 * 3600;
      while (s.t < lim && s.cfg.loadA > 0 && (o.bms ? s.stats.uvpTrips === uvp0 : !s.cells.some(x => x.soc <= -0.04))) s.run(10, o.dt);
      const r = {
        n, socFull, spreadFull, usedAh: s.stats.dischargedAh - ah0, usedWh: s.stats.dischargedWh - wh0,
        minCellV: s.stats.minCellV, cutBy: s.stats.uvpTrips > uvp0 ? 'BMS' : 'cihaz',
        socEmpty: s.cells.map(x => x.soc),
      };
      // 4) depolama
      s.requestMode('REST'); s.cfg.loadCutoffV = 0; s.storage(o.restDays);
      yield r;
    }
  }

  return { SCENARIOS, ABLATIONS, runScenario, stepProgram, cycleTest };
});
