(function () {
  'use strict';
  const RC = window.Reconfig, CA = window.ChargerA;
  const $ = id => document.getElementById(id);
  const fmt = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hms = s => { s = Math.max(0, Math.floor(s)); return [s / 3600 | 0, (s % 3600) / 60 | 0, s % 60].map(v => String(v).padStart(2, '0')).join(':'); };
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const pct = x => fmt(clamp(x, 0, 1) * 100, 0);

  const META = { author: 'Osman Çekilmez · 233302006', advisor: 'Dr. Öğr. Üyesi Osman Özer', date: '24.09.2026' };
  $('sheet').innerHTML = SchematicC.build(META);
  const svg = $('sheet').querySelector('svg');
  const S = id => svg.getElementById(id);
  const setT = (id, s) => { const el = S(id); if (el && el.textContent !== s) el.textContent = s; };

  const MODE_TR = {
    OFF: ['Tümü kapalı', ''], DEAD: ['Geçiş (ölü zaman)', 'warn'], PRE: ['Ön eşitleme', 'warn'], MEAS: ['Hücre ölçümü', 'warn'],
    PAR: ['1S3P şarj', ''], SER: ['3S1P kullanım', ''], FAULT: ['Arıza', 'fault'],
  };

  let cfg = RC.defaultConfig(), sys, running = false, busy = false, last = performance.now(), lastSlow = 0, evShown = 0;
  let prog = null, activeScen = 'bal', plot2 = 'v', tab = 'scen';

  function fresh(note) {
    sys = new RC.SystemC(cfg); sys.cfg = cfg;
    evShown = 0; $('log').innerHTML = '';
    sys.log(note || 'Sıfırlandı: tüm anahtarlar kapalı.');
    render(true);
  }

  // --- Senaryolar ----------------------------------------------------------
  const socs = (c, a) => a.forEach((s, i) => { c.cells[i].soc = s; });
  const afterCharge = [
    { when: s => s.chg === 'DONE' || s.mode === 'FAULT', act: (s, x) => { x.rest = s.t; }, msg: 'Şarj bitti → 10 dk dinlenme' },
    { when: (s, x) => s.t - x.rest >= 600, act: s => s.requestMode('USE'), msg: 'Kullanım isteniyor (3S1P, 2.9 A)' },
  ];
  const useDone = s => s.mode === 'FAULT' || (s.stats.useEndAt != null && s.mode === 'OFF');
  const SCEN = [
    { id: 'bal', name: 'Dengeli paket, şarj', desc: '3 hücre %20 → 1S3P şarj', apply: c => socs(c, [.2, .2, .2]), start: s => s.requestMode('CHARGE'), stop: s => s.chg === 'DONE' || s.mode === 'FAULT' },
    { id: 'imb', name: 'Dengesiz paket, şarj', desc: '%40 / %25 / %18 — Rev B\'de 99/85/78\'de kalıyordu', apply: c => socs(c, [.4, .25, .18]), start: s => s.requestMode('CHARGE'), stop: s => s.chg === 'DONE' || s.mode === 'FAULT' },
    { id: 'big', name: 'Büyük fark: ön eşitleme', desc: '%80 / %30 / %20 (ΔV ≈ 0.46 V)', apply: c => socs(c, [.8, .3, .2]), start: s => s.requestMode('CHARGE'), stop: s => s.chg === 'DONE' || s.mode === 'FAULT' },
    { id: 'huge', name: 'Çok büyük fark: ret', desc: '%100 / %5 / %5 (ΔV ≈ 0.8 V)', apply: c => socs(c, [1, .05, .05]), start: s => s.requestMode('CHARGE'), stop: s => s.mode === 'FAULT' || s.chg === 'DONE' },
    { id: 'cycle', name: 'Dengesiz paket, tam döngü', desc: 'Şarj → 10 dk → 2.9 A kullanım', apply: c => socs(c, [.4, .25, .18]), start: s => s.requestMode('CHARGE'), steps: afterCharge, stop: useDone },
    { id: 'aged', name: 'Yaşlı hücre, tam döngü', desc: 'H3 %85 kapasite, 1.4× direnç', apply: c => { socs(c, [.2, .2, .2]); c.cells[2].capacityScale = .85; c.cells[2].rScale = 1.4; }, start: s => s.requestMode('CHARGE'), steps: afterCharge, stop: useDone },
    { id: 'use', name: 'Dolu paketi kullan', desc: '3S1P, 2.9 A, hücre 3.0 V\'a kadar', apply: c => socs(c, [1, 1, 1]), start: s => s.requestMode('USE'), stop: useDone },
  ];
  SCEN.push(
    { id: 'drvDirect', name: 'Sürücüsüz: Arduino pini doğrudan', desc: 'Yüzen source\'lu MOSFET\'ler açılabilir mi?', apply: c => { socs(c, [.4, .4, .4]); c.driver = 'direct'; }, start: s => s.requestMode('CHARGE'), stop: s => s.mode === 'FAULT' || s.chg === 'DONE' },
    { id: 'drvFast0', name: 'Hızlı sürücü, ölü zaman yok', desc: 'Kilitleme kapalı; şarjdan kullanıma geçiş', apply: c => { socs(c, [.9, .9, .9]); c.driver = 'fast'; c.deadTimeS = 0; c.interlock = false; }, start: s => s.requestMode('USE'), stop: s => s.mode === 'FAULT' || s.mode === 'SER' },
    { id: 'drvFastIlk', name: 'Aynısı + donanım kilitlemesi', desc: 'Kilitleme açmayı erteler', apply: c => { socs(c, [.9, .9, .9]); c.driver = 'fast'; c.deadTimeS = 0; c.interlock = true; }, start: s => s.requestMode('USE'), stop: s => s.mode === 'FAULT' || s.stats.useEndAt != null },
    { id: 'drvPv0', name: 'VOM1271, ölü zaman yok', desc: 'Kilitleme kapalı; yine de güvenli mi?', apply: c => { socs(c, [.9, .9, .9]); c.deadTimeS = 0; c.interlock = false; }, start: s => s.requestMode('USE'), stop: s => s.mode === 'FAULT' || s.stats.useEndAt != null },
  );
  const LIVE = [
    { id: 'conflict', name: 'Gate çakışması', desc: 'P1 ve S12\'ye aynı anda komut', act: () => sys.injectConflict() },
    { id: 'ilk', name: 'Kilitlemeyi kapat / aç', desc: 'Donanım interlock', act: () => { cfg.interlock = !cfg.interlock; sys.log(`Donanım kilitleme ${cfg.interlock ? 'AÇIK' : 'KAPALI'}.`, cfg.interlock ? 'ok' : 'bad'); } },
    { id: 'adapter', name: 'Adaptörü çek / tak', desc: 'Şarj katı beslemesi', act: () => { cfg.adapterOn = !cfg.adapterOn; sys.log(`Adaptör ${cfg.adapterOn ? 'takıldı' : 'çekildi'}.`, 'warn'); } },
    { id: 'reset', name: 'Arızayı sıfırla', desc: 'Kilitlenmiş arızayı temizle', act: () => sys.requestMode('RESET') },
  ];
  function renderScen() {
    $('scenList').innerHTML = `<div class="h4" style="grid-column:1/-1">Başlangıç koşulu — sıfırlar ve başlatır</div>` +
      SCEN.map(s => `<button class="sc ${activeScen === s.id ? 'active' : ''}" data-scen="${s.id}"><b>${s.name}</b><span>${s.desc}</span></button>`).join('') +
      `<div class="h4" style="grid-column:1/-1;margin-top:6px">Çalışırken müdahale et</div>` +
      LIVE.map(s => `<button class="sc fault" data-live="${s.id}"><b>${s.name}</b><span>${s.desc}</span></button>`).join('');
  }
  function startScen(sc) {
    activeScen = sc.id;
    cfg = RC.defaultConfig(); sc.apply(cfg);
    prog = { sc, ctx: { k: 0 } };
    fresh(`Senaryo: ${sc.name} — ${sc.desc}`);
    sc.start(sys);
    running = true; renderScen(); renderParams();
  }
  $('scenList').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.live) { LIVE.find(x => x.id === b.dataset.live).act(); return; }
    startScen(SCEN.find(x => x.id === b.dataset.scen));
  });
  function advance(simS) {
    sys.run(simS);
    if (prog && prog.sc.steps) {
      const st = prog.sc.steps[prog.ctx.k];
      if (st && st.when(sys, prog.ctx)) { st.act(sys, prog.ctx); prog.ctx.k++; sys.log(`Senaryo: ${st.msg}`, 'warn'); }
    }
  }

  // --- İstek düğmeleri ---------------------------------------------------
  document.querySelectorAll('[data-req]').forEach(b => b.addEventListener('click', () => { sys.requestMode(b.dataset.req); running = true; }));

  // --- Grafikler ---------------------------------------------------------
  const chI = new LineChart($('chI'), { xLabel: 'dk', minSpan: 30, left: { min: -3.5, max: 4.5, label: 'A' },
    series: [{ key: 'i1', color: cssv('--c1'), label: 'H1' }, { key: 'i2', color: cssv('--c2'), label: 'H2' }, { key: 'i3', color: cssv('--c3'), label: 'H3' },
      { key: 'it', color: cssv('--ink'), label: 'toplam', dash: [4, 4], width: 1.3 }],
    refLines: [{ axis: 'left', value: 0, color: cssv('--ink-3'), label: '0', right: true }] });
  const P2 = {
    v: { left: { min: 2.8, max: 4.4, label: 'V', step: 0.4 }, series: ['c1', 'c2', 'c3'], ref: [{ axis: 'left', value: 4.2, color: cssv('--cv'), label: '4.20 V', below: true }, { axis: 'left', value: 3.0, color: cssv('--fault'), label: 'kullanım kesme 3.0 V', right: true }] },
    soc: { left: { min: 0, max: 100, label: '%' }, series: ['soc1', 'soc2', 'soc3'], ref: [] },
  };
  const mk2 = k => new LineChart($('ch2'), { xLabel: 'dk', minSpan: 30, left: P2[k].left,
    series: P2[k].series.map((key, i) => ({ key, color: cssv('--c' + (i + 1)), label: 'H' + (i + 1), digits: k === 'soc' ? 1 : 3 })), refLines: P2[k].ref });
  let ch2 = mk2('v');
  document.querySelectorAll('[data-plot]').forEach(b => b.addEventListener('click', () => {
    plot2 = b.dataset.plot; document.querySelectorAll('[data-plot]').forEach(x => x.setAttribute('aria-pressed', x === b));
    ch2 = mk2(plot2); drawCharts();
  }));
  function drawCharts() {
    const xMax = Math.max(30, sys.t / 60);
    chI.draw(sys.history, { xScale: 1 / 60, xMax });
    ch2.draw(sys.history, { xScale: 1 / 60, xMax });
  }

  // --- Anahtar tabloları ----------------------------------------------------
  const ROWS = [['OFF', 'Tümü kapalı / ölü zaman'], ['MEAS', 'Hücre ölçümü'], ['PRE', 'Ön eşitleme'], ['PAR', '1S3P şarj'], ['PAR_IDLE', '1S3P bekleme'], ['SER', '3S1P kullanım']];
  const us = x => x >= 1e-3 ? `${(x * 1e3).toFixed(x >= 0.01 ? 1 : 2)} ms` : `${(x * 1e6).toFixed(x >= 1e-5 ? 0 : 2)} µs`;
  const DRV_NAME = { pv: 'VOM1271 fotovoltaik', fast: 'izoleli hızlı sürücü', direct: 'Arduino pini doğrudan' };
  function renderGates() {
    const cur = sys.modeKey() === 'DEAD' || sys.modeKey() === 'FAULT' ? 'OFF' : sys.modeKey();
    $('gateTable').innerHTML = '<tr><th>Mod</th>' + RC.GATES.map(g => `<th>${g}</th>`).join('') + '</tr>' +
      ROWS.map(([k, n]) => `<tr class="${k === cur ? 'cur' : ''}"><td>${n}</td>` + RC.GATES.map(g => `<td class="${RC.MODE_GATES[k].includes(g) ? 'on' : ''}">${RC.MODE_GATES[k].includes(g) ? '1' : '·'}</td>`).join('') + '</tr>').join('');
    // Anahtar başına: iletirken source potansiyeli ve Vgs; kapalıyken bloklaması gereken gerilim
    const nP = sys.nodes('PAR'), nS = sys.nodes('SER');
    const onMode = sw => (RC.MODE_GATES.SER.includes(sw) ? 'SER' : 'PAR');
    const across = (n, sw) => Math.abs(n[RC.TERM[sw][0]] - n[RC.TERM[sw][1]]);
    $('drvTable').innerHTML = '<tr><th>Anahtar</th><th>Grup</th><th>İletirken Vs</th><th>Vgs</th><th></th><th>1S3P\'de bloklar</th><th>3S1P\'de bloklar</th></tr>' +
      RC.GATES.map(sw => { const m = onMode(sw), gi = sys.gateInfo(sw, m);
        return `<tr><td>${sw}</td><td>${RC.GROUP[sw]}</td><td class="n">${fmt(gi.vs, 1)} V</td><td class="n">${fmt(gi.vgs, 1)} V</td><td class="${gi.ok ? 'okc' : 'badc'}">${gi.ok ? '✓' : '✕'}</td>` +
          `<td class="n">${RC.MODE_GATES.PAR.includes(sw) ? 'iletir' : fmt(across(nP, sw), 2) + ' V'}</td><td class="n">${RC.MODE_GATES.SER.includes(sw) ? 'iletir' : fmt(across(nS, sw), 2) + ' V'}</td></tr>`; }).join('');
    renderTiming();
  }
  /** Son grup geçişinin zamanlama diyagramı: eski grubun gate'i söner, ölü zaman, yeni grubun gate'i yükselir. */
  function renderTiming() {
    const tr = sys.lastTr, tm = sys.timing();
    if (!tr) { $('timing').innerHTML = '<p class="empty">Bir mod değişikliği yapın (Şarj et / Kullan).</p>'; $('timingNote').textContent = ''; return; }
    const W = 380, H = 168, L = 100, R = 12, T = Math.max(tr.onDone, tr.tOff) * 1.12 || 1e-3;
    const X = t => L + t / T * (W - L - R);
    const y1 = 44, y2 = 108, hi = 26;          // eski / yeni satır tabanları
    const vg = tm.vgs, thr = sys.cfg.vth / vg * hi;
    const old = `M${X(0) - 18} ${y1 - hi} L${X(0)} ${y1 - hi} L${X(tr.tOff)} ${y1} L${X(T)} ${y1}`;
    const nw = `M${X(0) - 18} ${y2} L${X(tr.cmdOn)} ${y2} L${X(tr.onDone)} ${y2 - hi} L${X(T)} ${y2 - hi}`;
    const band = tr.overlap > 0 ? `<rect class="tl-ovl" x="${X(tr.onStart)}" y="12" width="${Math.max(2, X(tr.tOff) - X(tr.onStart))}" height="${H - 42}"/>`
      : `<rect class="tl-gap" x="${X(tr.tOff)}" y="12" width="${Math.max(1, X(tr.onStart) - X(tr.tOff))}" height="${H - 42}"/>`;
    const names = a => a.length ? a.join(' ') : '—';
    $('timing').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Zamanlama diyagramı">${band}
      <line class="tl-axis" x1="${L}" y1="${H - 28}" x2="${W - R}" y2="${H - 28}"/>
      <text class="tl-lbl" x="4" y="${y1 - 8}">eski grup</text><text class="tl-num" x="4" y="${y1 + 4}">${names(tr.from).slice(0, 12)}</text>
      <text class="tl-lbl" x="4" y="${y2 - 8}">yeni grup</text><text class="tl-num" x="4" y="${y2 + 4}">${names(tr.to).slice(0, 12)}</text>
      <path class="tl-old" d="${old}"/><path class="tl-new" d="${nw}"/>
      <line class="tl-th" x1="${L}" y1="${y2 - thr}" x2="${W - R}" y2="${y2 - thr}"/>
      <text class="tl-lbl" x="${W - R}" y="${y2 - thr - 3}" text-anchor="end">Vth ${sys.cfg.vth} V</text>
      <text class="tl-num" x="${X(0)}" y="${H - 14}" text-anchor="middle">0</text>
      <text class="tl-num" x="${X(tr.tOff)}" y="${H - 2}" text-anchor="middle">kapandı ${us(tr.tOff)}</text>
      <text class="tl-num" x="${X(tr.onStart)}" y="9" text-anchor="${X(tr.onStart) > W - 90 ? 'end' : X(tr.onStart) < L + 40 ? 'start' : 'middle'}">iletim ${us(tr.onStart)}</text>
      <line class="tl-axis" x1="${X(tr.cmdOn)}" y1="${y2 + 4}" x2="${X(tr.cmdOn)}" y2="${y2 + 10}"/>
    </svg>`;
    const weak = tr.bad || [];
    $('timingNote').textContent = weak.length
      ? `GATE SÜRÜLEMEDİ: ${weak.map(([id, g]) => `${id} Vgs ${g.vgs.toFixed(1)} V`).join(', ')} (tam iletim için ≥ ${sys.cfg.vgsFull} V gerekir). Bu anahtarların source'u hücre gerilimlerinde yüzüyor; Arduino'nun 5 V'u toprağa göre olduğundan gate–source arası yetersiz kalır → izoleli sürücü şart.`
      : tr.overlap > 0
      ? `ÇAKIŞMA ${us(tr.overlap)}: eski grup kapanmadan yeni grup iletime geçti → kısa devre. Sürücü: ${DRV_NAME[tr.driver]}, ölü zaman ${us(tr.dead)}${sys.cfg.interlock ? '' : ', donanım kilitlemesi yok'}.`
      : `Güvenli boşluk ${us(tr.onStart - tr.tOff)}. Sürücü: ${DRV_NAME[tr.driver]} (açılma ${us(tm.tOn)}, kapanma ${us(tm.tOff)}); ölü zaman ${us(tr.dead)}${tr.hw ? ` → donanım kilitlemesi açmayı ${us(tr.cmdOn)}'ye erteledi` : ''}.`;
  }

  // --- Karşılaştırma (Rev B ↔ matris), arka planda hesaplanır ----------------
  let cmpDone = false;
  function runCompare() {
    if (cmpDone) return; cmpDone = true;
    const cases = [
      { n: 'Dengeli paket (%20)', m: c => socs(c, [.2, .2, .2]) },
      { n: 'Dengesiz paket (%40 / %25 / %18)', m: c => socs(c, [.4, .25, .18]) },
      { n: 'Yaşlı hücre (H3 %85, 1.4× R)', m: c => { socs(c, [.2, .2, .2]); c.cells[2].capacityScale = .85; c.cells[2].rScale = 1.4; } },
    ];
    const out = []; let k = 0;
    const revB = m => {
      const c = CA.presetFor('improved'); m(c); const s = new CA.SystemA(c); s.runUntilDone(5);
      const soc = s.cells.map(x => x.soc), done = s.stats.doneAt;
      s.run(600); s.cfg.adapterOn = false; s.cfg.loadA = 2.9; const lim = s.t + 3 * 3600;
      while (s.t < lim && s.bms.dsgFet) s.run(10);
      return { done, soc, ah: s.stats.dischargedAh, wh: s.stats.dischargedWh, peak: null };
    };
    const matC = m => { const { s, charged, used } = RC.runCycle(m); return { done: s.stats.doneAt, soc: charged.finalSoc, ah: used ? used.stats.dischargedAh : 0, wh: used ? used.stats.dischargedWh : 0, peak: s.stats.peakParI }; };
    const step = () => {
      const c = cases[k]; out.push({ n: c.n, b: revB(c.m), c: matC(c.m) }); k++;
      if (k < cases.length) return setTimeout(step, 0);
      const cell = (x, y, better) => `<td class="n ${better === 1 ? 'win' : better === -1 ? 'lose' : ''}">${x}</td><td class="n ${better === -1 ? 'win' : better === 1 ? 'lose' : ''}">${y}</td>`;
      const cmpv = (a, b, tol) => Math.abs(a - b) <= tol ? 0 : a > b ? 1 : -1;
      $('cmp').innerHTML = `<table class="cmp"><tr><th>Durum</th><th>Ölçüt</th><th>Rev B · seri + BMS</th><th>Matris · 1S3P / 3S1P</th></tr>` +
        out.map(r => `<tr><td rowspan="3"><b>${r.n}</b></td><td>Şarj sonrası SOC</td>${cell(r.b.soc.map(pct).join(' / ') + ' %', r.c.soc.map(pct).join(' / ') + ' %', cmpv(Math.min(...r.b.soc), Math.min(...r.c.soc), .01))}</tr>` +
          `<tr><td>Şarj süresi</td>${cell(r.b.done ? fmt(r.b.done / 60, 0) + ' dk' : '—', r.c.done ? fmt(r.c.done / 60, 0) + ' dk' : '—', 0)}</tr>` +
          `<tr><td>Kullanılabilir (2.9 A)</td>${cell(`${fmt(r.b.ah * 1000, 0)} mAh · ${fmt(r.b.wh, 1)} Wh`, `${fmt(r.c.ah * 1000, 0)} mAh · ${fmt(r.c.wh, 1)} Wh`, cmpv(r.b.ah, r.c.ah, .03))}</tr>`).join('') +
        `<tr><td rowspan="6"><b>Bedeli</b></td><td>Anahtar</td><td>1 röle</td><td class="lose">10 anahtar = 20 MOSFET (sırt sırta) + 10× VOM1271 + 2× 74HC595 + kilitleme mantığı</td></tr>` +
        `<tr><td>Arduino pini</td><td>1 (röle)</td><td>4 (74HC595: veri, saat, mandal, OE)</td></tr>` +
        `<tr><td>Şarj katı</td><td>12.6 V / 1.4 A</td><td>4.2 V / 4.2 A (düşük gerilim, yüksek akım)</td></tr>` +
        `<tr><td>Koruma</td><td class="win">hazır 3S BMS</td><td class="lose">özel tasarım (standart BMS kullanılamaz)</td></tr>` +
        `<tr><td>Akım paylaşımı</td><td>seri: eşit</td><td>paralel: yol direncine bağlı, H1 &gt; H2 &gt; H3</td></tr>` +
        `<tr><td>Kritik arıza</td><td>—</td><td class="lose">seri + paralel aynı anda → ≈ 85 A kısa devre (ölü zaman + kilitleme şart)</td></tr></table>` +
        `<p class="hint">Yeşil daha iyi, kırmızı daha kötü. Şarj ve kullanım aynı A28 modeli ve aynı 2.9 A yükle hesaplandı. Yaşlı hücre satırı: iki mimaride de seri kullanımda en zayıf hücre kapasiteyi sınırlar; matris bunu çözmez.</p>`;
    };
    setTimeout(step, 30);
  }

  // --- Parametreler ------------------------------------------------------
  const F = {
    chargerV: ['Şarj CV (bara)', 'V', .01], chargerI: ['Şarj CC (toplam)', 'A', .1], iCutTotal: ['Bitiş akımı (toplam)', 'A', .01],
    loadA: ['Yük akımı (3S1P)', 'A', .1], rds: ['MOSFET + bağlantı direnci', 'Ω', .001], deadTimeS: ['Dead-time', 's', .05],
    hardDeltaV: ['Doğrudan paralel sınırı', 'V', .01], maxPreDeltaV: ['Ön eşitleme üst sınırı', 'V', .01], rPre: ['Ön eşitleme direnci', 'Ω', .01],
    uvpSoft: ['Kullanım kesme (hücre)', 'V', .05], ambientC: ['Ortam', '°C', 1],
    interlock: ['Donanım kilitleme', 'chk'], adapterOn: ['Adaptör bağlı', 'chk'],
    driver: ['Gate sürücüsü', 'sel', null, [['pv', 'VOM1271 fotovoltaik'], ['fast', 'İzoleli hızlı sürücü'], ['direct', 'Arduino pini doğrudan']]],
    qgNc: ['MOSFET gate yükü', 'nC', 1], pvIscUa: ['PV sürücü kısa devre akımı', 'µA', 1], pvToffUs: ['PV kapanma süresi', 'µs', 10],
    hwDelayMs: ['Kilitleme açma gecikmesi', 'ms', 1],
  };
  const field = k => { const [l, u, st, opts] = F[k];
    if (u === 'sel') return `<label class="field"><span>${l}</span><select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}" ${cfg[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    return u === 'chk' ? `<label class="field"><span>${l}</span><input type="checkbox" data-k="${k}" ${cfg[k] ? 'checked' : ''}></label>`
      : `<label class="field"><span>${l}</span><span><input type="number" step="${st}" data-k="${k}" value="${cfg[k]}"> ${u}</span></label>`; };
  function renderParams() {
    $('params').innerHTML = `<fieldset><legend>Şarj ve kullanım</legend>${['chargerV', 'chargerI', 'iCutTotal', 'loadA', 'uvpSoft', 'adapterOn'].map(field).join('')}</fieldset>` +
      `<fieldset><legend>Anahtarlama</legend>${['rds', 'deadTimeS', 'hardDeltaV', 'maxPreDeltaV', 'rPre', 'interlock'].map(field).join('')}</fieldset>` +
      `<fieldset><legend>Gate sürücü</legend>${['driver', 'qgNc', 'pvIscUa', 'pvToffUs', 'hwDelayMs'].map(field).join('')}</fieldset>` +
      `<fieldset><legend>Başlangıç (Sıfırla ile)</legend><div class="init"><span></span><b>SOC %</b><b>Kap. %</b><b>R ×</b>` +
      cfg.cells.map((c, i) => `<span>H${i + 1}</span><input data-cell="${i}" data-f="soc" type="number" value="${Math.round(c.soc * 100)}"><input data-cell="${i}" data-f="cap" type="number" value="${Math.round(c.capacityScale * 100)}"><input data-cell="${i}" data-f="rs" type="number" step="0.1" value="${c.rScale}">`).join('') +
      `</div>${field('ambientC')}</fieldset>`;
  }
  document.addEventListener('change', e => {
    const d = e.target.dataset || {};
    if (d.k) { cfg[d.k] = e.target.type === 'checkbox' ? e.target.checked : e.target.tagName === 'SELECT' ? e.target.value : parseFloat(e.target.value);
      if (tab === 'gates') renderGates(); sys.log(`${F[d.k][0]}: ${e.target.type === 'checkbox' ? (cfg[d.k] ? 'açık' : 'kapalı') : cfg[d.k]}`); }
    if (d.cell != null) { const v = parseFloat(e.target.value), c = cfg.cells[+d.cell]; if (!Number.isFinite(v)) return;
      if (d.f === 'soc') c.soc = clamp(v / 100, 0, 1); else if (d.f === 'cap') c.capacityScale = clamp(v / 100, .3, 1.2); else c.rScale = clamp(v, .3, 5); }
  });

  // --- Tablar -------------------------------------------------------------
  let bomDone = false;
  function showTab(t) {
    tab = t;
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== t; });
    if (t === 'gates') renderGates();
    if (t === 'cmp') runCompare();
    if (t === 'params') renderParams();
    if (t === 'bom' && !bomDone) { bomDone = true; BOM.mount($('bom'), 'alt'); }
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // --- Görünüm ------------------------------------------------------------
  function flushLog() {
    while (evShown < sys.events.length) {
      const e = sys.events[evShown++], d = document.createElement('div');
      d.innerHTML = `<time>${hms(e.t)}</time><span class="${e.kind}"></span>`; d.lastChild.textContent = e.msg; $('log').prepend(d);
    }
  }
  function render(force) {
    const m = sys.mode, key = sys.modeKey(), g = sys.gates();
    const vs = sys.cells.map((x, k) => x.terminalV(sys.i[k]));
    const par = key === 'PAR' || key === 'PAR_IDLE' || key === 'PRE', ser = key === 'SER';
    const vPack = ser ? sys.vOut : par ? sys.vBus : null;
    $('rVtag').textContent = ser ? 'Paket gerilimi · 3S' : par ? 'Bara gerilimi · 1S3P' : 'Paket gerilimi';
    $('rV').innerHTML = vPack != null ? `${fmt(vPack, 3)}<small>V</small>` : '—<small>V</small>';
    $('rVs').textContent = `hücreler ${vs.map(v => fmt(v, 2)).join(' / ')} V`;
    const it = sys.iTotal;
    $('rI').innerHTML = `${it > 5e-4 ? '+' : it < -5e-4 ? '−' : ''}${fmt(Math.abs(it), 3)}<small>A</small>`;
    $('rItag').textContent = it < -5e-4 ? 'Paket akımı · yük' : 'Paket akımı · şarj';
    $('rIs').textContent = `H1 ${fmt(sys.i[0], 2)} · H2 ${fmt(sys.i[1], 2)} · H3 ${fmt(sys.i[2], 2)} A`;
    $('ledPar').classList.toggle('on', par); $('ledSer').classList.toggle('on', ser); $('ledFlt').classList.toggle('on', m === 'FAULT');
    const dV = sys.deltaV();
    $('rD').innerHTML = `${fmt(dV * 1000, 0)}<small>mV</small>`;
    $('rDs').textContent = dV <= cfg.hardDeltaV ? `≤ ${fmt(cfg.hardDeltaV * 1000, 0)} mV: doğrudan paralel` : dV <= cfg.maxPreDeltaV ? 'ön eşitleme gerekir' : 'paralele alınamaz';
    const soc = sys.cells.reduce((a, c) => a + c.soc, 0) / 3;
    $('rS').innerHTML = `${pct(soc)}<small>%</small>`;
    $('rSs').textContent = `${sys.cells.map(c => pct(c.soc)).join(' / ')} %`;
    $('rt').textContent = hms(sys.t); $('rts').textContent = `×${$('speed').value}${running ? '' : ' · duraklatıldı'}`;
    const [lbl, cls] = MODE_TR[m] || [m, ''];
    $('rState').textContent = m === 'PAR' ? (sys.chg === 'DONE' ? 'Şarj tamam' : cfg.adapterOn ? `1S3P · ${sys.chg}` : '1S3P · adaptör yok') : lbl;
    $('rStateBox').className = 'rd state ' + (m === 'PAR' && sys.chg === 'DONE' ? 'done' : cls);
    $('rStates').textContent = sys.reason;
    document.querySelectorAll('[data-req]').forEach(b => b.setAttribute('aria-pressed', b.dataset.req === sys.request));

    // Şema
    const keyNow = sys.modeKey(), setNow = RC.MODE_GATES[keyNow] || [], badSet = (sys.lastTr && sys.mode === 'FAULT' ? sys.lastTr.bad.map(b => b[0]) : []);
    RC.GATES.forEach(id => {
      const on = setNow.includes(id), bad = badSet.includes(id);
      if (on || bad) { const gi = sys.gateInfo(id, bad ? sys.lastTr.toMode : (keyNow === 'PAR_IDLE' ? 'PAR' : keyNow)); setT('swv-' + id, `Vgs ${fmt(gi.vgs, 1)} V${gi.ok ? '' : ' ✕'}`); }
      else setT('swv-' + id, '');
      const el0 = S('sw-' + id); if (el0) el0.classList.toggle('bad', bad);
    });
    setT('sDrv', cfg.driver === 'pv' ? '→ kilitleme → 10× VOM1271 (PV)' : cfg.driver === 'fast' ? '→ kilitleme → 10× izoleli hızlı sürücü' : 'sürücü yok: pin → gate (5 V)');
    RC.GATES.forEach(id => { const el = S('sw-' + id); if (el) { el.classList.toggle('on', g[id]); el.classList.toggle('bad', badSet.includes(id) || (m === 'FAULT' && ((sys.fault === 'SHORT' && (id === 'P1' || id === 'S12')) || (sys.fault === 'SHOOT_THROUGH' && sys.lastTr && sys.lastTr.pair && sys.lastTr.pair.includes(id))))); } });
    [0, 1, 2].forEach(k => {
      setT(`cV${k + 1}`, `${fmt(vs[k], 3)} V`); setT(`cS${k + 1}`, `%${pct(sys.cells[k].soc)} · ${fmt(sys.cells[k].tempC, 1)} °C`);
      const i = sys.i[k]; setT(`cI${k + 1}`, Math.abs(i) > 5e-4 ? `${i > 0 ? '+' : '−'}${fmt(Math.abs(i), 2)} A` : '0 A');
      svg.querySelector(`[data-part="cell${k + 1}"]`).classList.toggle('over', vs[k] > 4.205);
    });
    setT('sChg', !cfg.adapterOn ? 'adaptör yok' : key === 'PAR' ? `${sys.chg} · ${fmt(sys.iTotal, 2)} A` : 'bağlı değil');
    setT('sBus', par ? `bara ${fmt(sys.vBus, 3)} V` : '');
    setT('sOut', ser ? `${fmt(sys.vOut, 2)} V` : '');
    setT('sLoad', ser ? `${fmt(cfg.loadA, 2)} A` : '0 A');
    setT('sMode', m === 'FAULT' ? `ARIZA: ${sys.fault}` : m === 'DEAD' ? 'DEAD-TIME' : key);
    setT('sIlk', cfg.interlock ? 'donanım kilitleme: AÇIK' : 'donanım kilitleme: KAPALI');
    S('flowPar').classList.toggle('on', par && Math.abs(sys.iTotal) + Math.max(...sys.i.map(Math.abs)) > 0.01);
    S('flowSer').classList.toggle('on', ser);
    svg.querySelector('[data-part="load"]').classList.toggle('active', ser);

    flushLog();
    const now = performance.now();
    if (force || now - lastSlow > 300) { lastSlow = now; drawCharts(); if (tab === 'gates') renderGates(); }
    $('playIcon').textContent = running ? '⏸' : '▶'; $('playText').textContent = running ? 'Duraklat' : (sys.t > 0 ? 'Devam' : 'Başlat');
    $('toEnd').disabled = busy;
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (running && !busy) {
      advance(dt * (+$('speed').value || 1));
      if (prog && prog.sc.stop(sys)) { running = false; sys.log('Senaryo tamamlandı.', 'ok'); prog = { sc: { stop: () => false }, ctx: {} }; }
    }
    render(false);
    requestAnimationFrame(frame);
  }
  function toEnd() {
    busy = true; running = false;
    const end = sys.t + 12 * 3600;
    const stop = () => (prog && prog.sc.stop(sys)) || sys.mode === 'FAULT' ||
      (!(prog && prog.sc.steps) && ((sys.mode === 'PAR' && sys.chg === 'DONE') || (sys.mode === 'OFF' && sys.t > 1)));
    const chunk = () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 30 && sys.t < end && !stop()) advance(20);
      render(true);
      if (sys.t < end && !stop()) setTimeout(chunk, 0);
      else { busy = false; const st = sys.stats;
        sys.log(`Sona gidildi: ${MODE_TR[sys.mode] ? MODE_TR[sys.mode][0] : sys.mode}; şarj ${fmt(st.chargedAh * 1000, 0)} mAh, kullanılan ${fmt(st.dischargedAh * 1000, 0)} mAh / ${fmt(st.dischargedWh, 1)} Wh, paralel tepe akım ${fmt(st.peakParI, 2)} A.`, sys.mode === 'FAULT' ? 'bad' : 'ok');
        render(true); }
    };
    chunk();
  }

  $('play').addEventListener('click', () => { running = !running; });
  $('reset').addEventListener('click', () => { running = false; startScen(SCEN.find(x => x.id === activeScen)); running = false; });
  $('toEnd').addEventListener('click', toEnd);
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey) return;
    if (e.key === ' ' && !e.target.closest('button, .part')) { e.preventDefault(); $('play').click(); }
    else if (e.key === 'r' || e.key === 'R') $('reset').click();
    else if (e.key === 'e' || e.key === 'E') toEnd();
  });
  window.addEventListener('resize', drawCharts);

  SCEN[0].apply(cfg);
  prog = { sc: SCEN[0], ctx: { k: 0 } };
  renderScen(); renderParams();
  fresh('Dengeli paket hazır. "Şarj et · 1S3P" ya da boşluk tuşu.');
  SCEN[0].start(sys);
  requestAnimationFrame(frame);
})();
