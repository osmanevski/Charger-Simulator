/*
 * Devre şeması: IEC sembolleri, pafta çerçevesi (bölge A–D / 1–8), antet,
 * revizyon bulutları. Rev A = rapordaki devre, Rev B = önerilen devre.
 * Çıktı tek bir <svg>; canlı değerler id'li <text> düğümleri üzerinden güncellenir.
 */
(function (root) {
  'use strict';

  const VB = { w: 1120, h: 600 };
  const FRAME = { x: 24, y: 24, w: 1072, h: 552 };
  const COLS = 8, ROWS = 4;

  /** Bir noktanın pafta bölgesi, ör. "B3". */
  function zone(x, y) {
    const c = Math.min(COLS, Math.max(1, Math.floor((x - FRAME.x) / (FRAME.w / COLS)) + 1));
    const r = Math.min(ROWS, Math.max(1, Math.floor((y - FRAME.y) / (FRAME.h / ROWS)) + 1));
    return 'ABCD'[r - 1] + c;
  }

  // --- Sembol yardımcıları ---------------------------------------------------
  const W = (pts, cls = 'w') => `<polyline class="${cls}" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
  const dot = (x, y) => `<circle class="jn" cx="${x}" cy="${y}" r="3.2"/>`;
  const T = (x, y, s, cls = 'lbl', anchor = 'start', id = '') =>
    `<text ${id ? `id="${id}"` : ''} class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${s}</text>`;

  function resV(x, y1, y2, ref, val, side = 'r') {
    const m = (y1 + y2) / 2;
    const tx = side === 'r' ? x + 12 : x - 12, a = side === 'r' ? 'start' : 'end';
    return W([[x, y1], [x, m - 15]]) + `<rect class="sym" x="${x - 5}" y="${m - 15}" width="10" height="30"/>` + W([[x, m + 15], [x, y2]]) +
      T(tx, m - 2, ref, 'ref', a) + T(tx, m + 12, val, 'val', a);
  }
  function resH(x1, x2, y, ref, val, valId = '') {
    const m = (x1 + x2) / 2;
    return W([[x1, y], [m - 16, y]]) + `<rect class="sym" x="${m - 16}" y="${y - 5}" width="32" height="10"/>` + W([[m + 16, y], [x2, y]]) +
      `<text class="ref" x="${m}" y="${y - 11}" text-anchor="middle">${ref} <tspan class="val" ${valId ? `id="${valId}"` : ''}>${val}</tspan></text>`;
  }
  function capV(x, y1, y2, ref, val) {
    const m = (y1 + y2) / 2;
    return W([[x, y1], [x, m - 4]]) + `<line class="sym-l" x1="${x - 10}" y1="${m - 4}" x2="${x + 10}" y2="${m - 4}"/>` +
      `<line class="sym-l" x1="${x - 10}" y1="${m + 4}" x2="${x + 10}" y2="${m + 4}"/>` + W([[x, m + 4], [x, y2]]) +
      T(x + 14, m - 1, ref, 'ref') + T(x + 14, m + 12, val, 'val');
  }
  /** Yatay diyot; katot solda (akım sağdan sola). */
  function diodeL(x1, x2, y, ref, val) {
    const m = (x1 + x2) / 2;
    return W([[x1, y], [m - 8, y]]) + `<path class="sym-f" d="M${m + 8} ${y - 8} L${m - 8} ${y} L${m + 8} ${y + 8} Z"/>` +
      `<line class="sym-l" x1="${m - 8}" y1="${y - 8}" x2="${m - 8}" y2="${y + 8}"/>` + W([[m + 8, y], [x2, y]]) +
      `<text class="ref" x="${m}" y="${y - 13}" text-anchor="middle">${ref} <tspan class="val">${val}</tspan></text>`;
  }
  const gnd = (x, y) => W([[x, y - 8], [x, y]]) +
    `<line class="sym-l" x1="${x - 10}" y1="${y}" x2="${x + 10}" y2="${y}"/><line class="sym-l" x1="${x - 6}" y1="${y + 4}" x2="${x + 6}" y2="${y + 4}"/><line class="sym-l" x1="${x - 2}" y1="${y + 8}" x2="${x + 2}" y2="${y + 8}"/>`;
  /** Net etiketi (bayrak). dir: 'r' sağa, 'l' sola bakan. */
  function net(x, y, name, dir = 'r', id = '') {
    const w = 8 + name.length * 7.4, s = dir === 'r' ? 1 : -1;
    const p = `M${x} ${y} L${x + s * 6} ${y - 8} L${x + s * (w + 6)} ${y - 8} L${x + s * (w + 6)} ${y + 8} L${x + s * 6} ${y + 8} Z`;
    return `<path class="net" d="${p}"/>` + T(x + s * (w / 2 + 6), y + 4, name, 'netname', 'middle', id);
  }
  function fuseH(x1, x2, y, ref, val) {
    const m = (x1 + x2) / 2;
    return W([[x1, y], [m - 14, y]]) + `<rect class="sym" x="${m - 14}" y="${y - 5}" width="28" height="10"/><line class="sym-l" x1="${m - 14}" y1="${y}" x2="${m + 14}" y2="${y}"/>` +
      W([[m + 14, y], [x2, y]]) + `<text class="ref" x="${m}" y="${y - 11}" text-anchor="middle">${ref} <tspan class="val">${val}</tspan></text>`;
  }
  function switchNO(x1, x2, y, ref) {
    const a = x1 + 12, b = x2 - 12;
    return W([[x1, y], [a, y]]) + `<circle class="pin" cx="${a}" cy="${y}" r="2.5"/><circle class="pin" cx="${b}" cy="${y}" r="2.5"/>` +
      `<line id="k1blade" class="sym-l blade" x1="${a}" y1="${y}" x2="${b - 2}" y2="${y - 13}"/>` + W([[b, y], [x2, y]]) +
      T((x1 + x2) / 2, y + 22, ref, 'ref', 'middle');
  }
  /** Dikey hücre sembolü: + (uzun plaka) üstte. */
  function cellV(x, y1, y2, i) {
    const m = (y1 + y2) / 2;
    return `<g class="part cellsym" data-part="cell${i}" tabindex="0" role="button" aria-label="Hücre ${i}">` +
      `<rect class="hit" x="${x - 30}" y="${y1 + 6}" width="160" height="${y2 - y1 - 12}"/>` +
      W([[x, y1], [x, m - 6]]) +
      `<line class="plate plate-p" x1="${x - 18}" y1="${m - 6}" x2="${x + 18}" y2="${m - 6}"/>` +
      `<line class="plate plate-n" x1="${x - 9}" y1="${m + 4}" x2="${x + 9}" y2="${m + 4}"/>` +
      W([[x, m + 4], [x, y2]]) +
      T(x - 22, m - 10, '+', 'pm', 'middle') +
      T(x + 30, m - 12, `H${i}`, 'ref') +
      T(x + 30, m + 5, '—', 'val big', 'start', `cellV${i}`) +
      T(x + 30, m + 20, '—', 'val', 'start', `cellS${i}`) +
      `<g id="cellB${i}" class="baltag" opacity="0"><rect x="${x + 30}" y="${m + 26}" width="34" height="13" rx="2"/>${T(x + 47, m + 36, 'BAL', 'baltxt', 'middle')}</g>` +
      `</g>`;
  }
  function block(x, y, w, h, ref, name, part, extra = '') {
    return `<g class="part" data-part="${part}" tabindex="0" role="button" aria-label="${name}"><rect class="blk" x="${x}" y="${y}" width="${w}" height="${h}"/>` +
      T(x + 6, y + 14, ref, 'ref') + extra + `</g>`;
  }

  /** Revizyon bulutu: dikdörtgen çevresinde dışa taşan yaylar. */
  function cloud(x, y, w, h, n) {
    const r = 9, pts = [];
    const edge = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1), k = Math.max(1, Math.round(len / (r * 1.7)));
      for (let i = 1; i <= k; i++) pts.push([x1 + (x2 - x1) * i / k, y1 + (y2 - y1) * i / k]);
    };
    edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
    let d = `M${x} ${y}`;
    pts.forEach(([px, py]) => { d += ` A${r} ${r} 0 0 1 ${px.toFixed(1)} ${py.toFixed(1)}`; });
    const tri = `<g class="delta" data-delta="${n}"><path d="M${x + w + 4} ${y - 18} l11 20 h-22 z"/>${T(x + w + 4, y - 2, n, 'deltanum', 'middle')}</g>`;
    return `<g class="rev" data-delta="${n}"><path class="cloud" d="${d} Z" pathLength="1"/>${tri}</g>`;
  }

  // --- Revizyon listesi (Rev B'de değişenler) ---------------------------------
  const REVISIONS = [
    { n: 2, cloud: false, title: 'Seçilebilir şarj hızı ve Sony adaptör', box: [40, 230, 220, 80], part: 'adapter', text: '19.5 V / 4.7 A Sony; CC nominal 3.90 A, doğrulanacak +%2 üst sınır 3.978 A. Altı kademe 1.0–≤4.0 A. INA219 + R050 ≥2 W; 3×TMP36 + CD4051. A3 pot, D12 buton; Uno Vin için 7.5 V buck.' },
    { n: 1, cloud: false, title: 'XL4015 geri beslemesi: CV potu yerine sabit bölücü + diyotlu PWM enjeksiyonu', box: [250, 108, 196, 72], part: 'inject', text: 'CV potu yerine sabit R_üst (tavan 12.60 V, ölçülüp düzeltilir); PWM, R4-C1 + 1N4148 + R3 ile FB\'ye (TI SLVA861)' },
  ];

  /** Pafta: ızgara, çift çerçeve, bölge numaraları (A–D / 1–8), ok ucu tanımı. */
  function sheetFrame() {
    const s = [];
    s.push(`<defs><pattern id="grid5" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" class="gridline"/></pattern>` +
      `<marker id="iarrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L9 5 L0 9 z" class="arrowhead"/></marker></defs>`);
    // Pafta çerçevesi ve bölgeler
    s.push(`<rect class="paper" x="0" y="0" width="${VB.w}" height="${VB.h}"/>`);
    s.push(`<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" fill="url(#grid5)"/>`);
    s.push(`<rect class="frame-o" x="8" y="8" width="${VB.w - 16}" height="${VB.h - 16}"/><rect class="frame-i" x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}"/>`);
    for (let c = 0; c < COLS; c++) {
      const cx = FRAME.x + FRAME.w / COLS * (c + .5), bx = FRAME.x + FRAME.w / COLS * c;
      s.push(T(cx, 20, c + 1, 'zone', 'middle') + T(cx, VB.h - 11, c + 1, 'zone', 'middle'));
      if (c) s.push(`<line class="tick" x1="${bx}" y1="8" x2="${bx}" y2="${FRAME.y}"/><line class="tick" x1="${bx}" y1="${VB.h - 8}" x2="${bx}" y2="${VB.h - FRAME.y}"/>`);
    }
    for (let r = 0; r < ROWS; r++) {
      const cy = FRAME.y + FRAME.h / ROWS * (r + .5), by = FRAME.y + FRAME.h / ROWS * r;
      s.push(T(16, cy + 4, 'ABCD'[r], 'zone', 'middle') + T(VB.w - 16, cy + 4, 'ABCD'[r], 'zone', 'middle'));
      if (r) s.push(`<line class="tick" x1="8" y1="${by}" x2="${FRAME.x}" y2="${by}"/><line class="tick" x1="${VB.w - 8}" y1="${by}" x2="${VB.w - FRAME.x}" y2="${by}"/>`);
    }

    return s.join('');
  }

  /** Antet (başlık bloğu). f: { title, rev, state } */
  function titleBlock(meta, f) {
    const TB = { x: 736, y: 486, w: 360, h: 90 };
    return `<g class="titleblock"><rect x="${TB.x}" y="${TB.y}" width="${TB.w}" height="${TB.h}"/>` +
      `<line x1="${TB.x}" y1="${TB.y + 30}" x2="${TB.x + TB.w}" y2="${TB.y + 30}"/><line x1="${TB.x}" y1="${TB.y + 60}" x2="${TB.x + TB.w}" y2="${TB.y + 60}"/>` +
      `<line x1="${TB.x + 250}" y1="${TB.y}" x2="${TB.x + 250}" y2="${TB.y + TB.h}"/><line x1="${TB.x + 180}" y1="${TB.y + 60}" x2="${TB.x + 180}" y2="${TB.y + TB.h}"/>` +
      T(TB.x + 6, TB.y + 11, 'BAŞLIK', 'tbk') + T(TB.x + 6, TB.y + 25, f.title, 'tbv') +
      T(TB.x + 256, TB.y + 11, 'REV', 'tbk') + T(TB.x + 256, TB.y + 27, f.rev, 'tbrev', 'start', 'tbRev') +
      T(TB.x + 6, TB.y + 41, 'ÇİZEN', 'tbk') + T(TB.x + 6, TB.y + 55, meta.author, 'tbv') +
      T(TB.x + 256, TB.y + 41, 'PAFTA', 'tbk') + T(TB.x + 256, TB.y + 55, f.sheet || '1 / 1', 'tbv') +
      T(TB.x + 6, TB.y + 71, 'DANIŞMAN', 'tbk') + T(TB.x + 6, TB.y + 85, meta.advisor, 'tbv sm') +
      T(TB.x + 186, TB.y + 71, 'DURUM', 'tbk') + T(TB.x + 186, TB.y + 85, f.state, 'tbv sm', 'start', 'tbState') +
      T(TB.x + 256, TB.y + 71, 'TARİH', 'tbk') + T(TB.x + 256, TB.y + 85, meta.date, 'tbv sm') + `</g>`;
  }

  function build(meta) {
    const s = [];
    s.push(`<svg viewBox="0 0 ${VB.w} ${VB.h}" class="sheet-svg" role="img" aria-label="3S A28 şarj devresi şeması" xmlns="http://www.w3.org/2000/svg">`);
    s.push(sheetFrame());

    const TOP = 120, GND = 440;

    // Enerji akış katmanı (aktifken kesikli animasyon)
    s.push(`<g id="flow" class="flow">` +
      `<polyline class="flowline" points="60,256 60,${TOP} 110,${TOP}"/><polyline class="flowline" points="230,${TOP} 940,${TOP} 940,440"/>` +
      `<polyline class="flowline" points="940,440 60,440 60,304"/></g>`);
    s.push(`<g id="flowD" class="flow dsg"><polyline class="flowline" points="940,440 940,120 772,120 772,440 940,440"/></g>`);

    // V1 adaptör
    s.push(`<g class="part" data-part="adapter" tabindex="0" role="button" aria-label="Adaptör">` +
      `<rect class="hit" x="36" y="240" width="90" height="80"/>` +
      W([[60, 256], [60, TOP], [110, TOP]]) + `<circle class="sym" cx="60" cy="280" r="24"/>` +
      T(60, 276, '+', 'pm', 'middle') + T(60, 294, '−', 'pm', 'middle') + W([[60, 304], [60, GND]]) +
      T(92, 276, 'V1 · SONY', 'ref') + T(92, 292, '19.5 V', 'val', 'start', 'sAdapter') + T(92, 306, '4.7 A', 'val') + `</g>`);

    // U1 XL4015
    s.push(block(110, 88, 120, 104, 'U1', 'XL4015', 'xl',
      T(170, 130, 'XL4015', 'blkname', 'middle') + T(170, 147, 'buck · 180 kHz', 'val', 'middle') +
      T(118, 124, 'IN', 'pinl') + T(224, 124, 'OUT', 'pinl', 'end') + T(224, 174, 'FB', 'pinl', 'end') + T(170, 188, 'GND', 'pinl', 'middle') +
      T(170, 166, '—', 'val strong', 'middle', 'sXlMode')));
    s.push(W([[170, 192], [170, GND]]));
    s.push(W([[230, TOP], [300, TOP]]));   // U1 OUT → Vout düğümü (R_üst üst ucu, röle, paket)
    s.push(W([[230, 170], [300, 170]]));
    s.push(T(238, 84, '—', 'probe', 'start', 'sVout'));

    // Geri besleme bölücüsü: RV1 (pot) + R2
    s.push(`<g class="part" data-part="divider" tabindex="0" role="button" aria-label="Geri besleme bölücüsü">` +
      `<rect class="hit" x="236" y="${TOP + 4}" width="76" height="118"/>` +
      `<g data-rev="B">${resV(300, TOP, 170, 'R_üst', '9.1k*', 'l')}</g>` +
      resV(300, 170, 222, 'R_alt', 'modülde', 'l') + gnd(300, 230) + dot(300, 170) + `</g>`);
    s.push(dot(300, TOP));
    s.push(T(310, 214, '—', 'probe', 'start', 'sFb'));
    s.push(`<g data-rev="B">${T(236, 70, '—', 'probe', 'start', 'sCeil')}</g>`);

    // Enjeksiyon zinciri (Rev B) / doğrudan bağlantı (Rev A)
    s.push(`<g class="part" data-part="inject" tabindex="0" role="button" aria-label="PWM enjeksiyon devresi">` +
      `<rect class="hit" x="304" y="150" width="244" height="80"/>` +
      `<g data-rev="B">${W([[300, 170], [318, 170]])}${resH(318, 380, 170, 'R3', '5.1k*')}${diodeL(380, 436, 170, 'D1', '1N4148')}${W([[436, 170], [464, 170]])}` +
      `${capV(464, 170, 206, 'C1', '100µF')}${resH(464, 540, 170, 'R4', '1k')}</g>` +
      dot(464, 170) + gnd(464, 214) + W([[540, 170], [552, 170]]) + `</g>`);
    s.push(`<g class="part" data-part="pwm" tabindex="0" role="button" aria-label="PWM pini">${net(552, 170, 'D9')}</g>`);
    s.push(T(478, 226, '—', 'probe', 'start', 'sVpwm'));

    // K1 röle (NO)
    s.push(`<g class="part" data-part="relay" tabindex="0" role="button" aria-label="Röle K1">` +
      `<rect class="hit" x="440" y="44" width="96" height="100"/>` +
      W([[300, TOP], [460, TOP]]) + switchNO(460, 530, TOP, '') + T(495, TOP + 22, 'K1', 'ref', 'middle') +
      `<rect class="sym" x="480" y="56" width="30" height="18"/><line class="mech" x1="495" y1="74" x2="495" y2="112"/>` +
      W([[480, 65], [466, 65]]) + net(466, 65, 'D7', 'l') + `</g>`);

    // INA219 + şönt (Rev B) / düz hat (Rev A)
    s.push(`<g class="part" data-part="ina" tabindex="0" role="button" aria-label="Akım ölçümü">` +
      `<g data-rev="B" data-meas="disc">${W([[530, TOP], [690, TOP]])}</g>` +
      `<g data-rev="B" data-meas="ina"><rect class="hit" x="540" y="34" width="165" height="104"/>${W([[530, TOP], [610, TOP]])}${resH(610, 690, TOP, 'R5', '')}${T(650, TOP + 26, '0.05 Ω / ≥2 W', 'val', 'middle', 'sInaShunt')}` +
      `<rect class="blk" x="606" y="38" width="88" height="42"/>${T(650, 56, 'INA219', 'blkname sm', 'middle')}${T(650, 72, '—', 'val', 'middle', 'sIna')}${T(612, 50, 'U3', 'ref')}` +
      `${W([[626, 80], [610, 90], [610, TOP]], 'w thin')}${W([[674, 80], [690, 90], [690, TOP]], 'w thin')}${dot(610, TOP)}${dot(690, TOP)}` +
      `${W([[694, 52], [712, 52]], 'w thin')}${net(712, 52, 'SDA/SCL')}</g>` +
      `</g>`);

    // F1 sigorta (Rev B)
    s.push(`<g class="part" data-part="fuse" tabindex="0" role="button" aria-label="Sigorta F1">` +
      `${fuseH(790, 826, TOP, 'F1', '5 A')}</g>`);
    s.push(W([[690, TOP], [790, TOP]]) + W([[826, TOP], [940, TOP]]));

    // GND hattı
    // Ayrık ölçüm (Rev B, ölçüm = ayrık): paket bölücüsü → A3, 0.1 Ω low-side şönt → LM358 ×10 → A4
    s.push(`<g data-rev="B" data-meas="disc" class="part" data-part="meas-disc" tabindex="0" role="button" aria-label="Ayrık akım ve gerilim ölçümü">` +
      `<rect class="hit" x="664" y="${TOP + 6}" width="72" height="180"/><rect class="hit" x="572" y="420" width="180" height="62"/>` +
      dot(700, TOP) + resV(700, TOP, 205, 'R6', '10k') + dot(700, 205) + W([[700, 205], [638, 205]]) + net(638, 205, 'A3', 'l') +
      resV(700, 205, 290, 'R7', '4.7k') + gnd(700, 298) +
      resH(690, 740, GND, 'R5', '0.1 Ω / 3 W') + dot(740, GND) +
      W([[740, GND], [740, 456], [684, 456]]) +
      `<path class="sym" d="M684 448 L684 480 L656 464 Z"/>` + T(679, 461, '+', 'pm', 'middle') + T(679, 477, '−', 'pm', 'middle') +
      W([[684, 473], [694, 473]], 'w thin') + T(697, 477, '×10', 'val') +
      W([[656, 464], [622, 464]]) + net(622, 464, 'A4', 'l') + T(648, 457, 'U3', 'ref', 'end') + `</g>`);
    // GND hattı
    s.push(`<g data-rev="B" data-meas="ina">${W([[60, GND], [800, GND]])}</g>` +
      `<g data-rev="B" data-meas="disc">${W([[60, GND], [690, GND]])}${W([[740, GND], [800, GND]])}</g>`);
    s.push(dot(170, GND) + T(72, GND - 8, 'GND', 'netname plain'));

    // U4 BMS (MOSFET'ler eksi hatta: B− ↔ P−)
    s.push(`<g data-bms="yes">` + block(800, 150, 64, 312, 'U4', '3S BMS', 'bms',
      T(832, 282, '3S', 'blkname', 'middle') + T(832, 300, 'BMS', 'blkname', 'middle') +
      T(832, 386, '—', 'val strong', 'middle', 'sBms') + T(832, 402, '—', 'val', 'middle', 'sBms2') +
      T(858, 234, 'B2', 'pinl', 'end') + T(858, 334, 'B1', 'pinl', 'end') + T(858, 436, 'B−', 'pinl', 'end') + T(806, 436, 'P−', 'pinl') +
      T(832, 168, 'B+', 'pinl', 'middle')) +
      W([[832, TOP], [832, 150]]) + dot(832, TOP) + W([[864, 230], [895, 230]]) + W([[864, 330], [895, 330]]) + W([[864, GND], [940, GND]]) + `</g>`);
    // BMS yok: hücre yığınının eksi ucu doğrudan GND hattına (P− = B−)
    s.push(`<g data-bms="no">${W([[800, GND], [940, GND]])}${T(870, GND - 8, 'BMS yok', 'probe', 'middle')}</g>`);
    s.push(W([[895, 230], [940, 230]]) + W([[895, 330], [940, 330]]) + dot(940, 230) + dot(940, 330));
    s.push(`<g data-rev="B" class="part" data-part="taps" tabindex="0" role="button" aria-label="Hücre izleme uçları">` +
      dot(895, 230) + W([[895, 230], [895, 244]], 'w thin') + net(895, 252, 'A2') +
      dot(895, 330) + W([[895, 330], [895, 344]], 'w thin') + net(895, 352, 'A1') + `</g>`);
    // Üç ayrı hücre sıcaklığı; analog çoklayıcı Uno A0'a gider.
    s.push(`<g class="part" data-part="tmp" tabindex="0" role="button" aria-label="Üç TMP36 ve sıcaklık çoklayıcısı">` +
      [175, 275, 375].map((y, i) => `<rect class="blk" x="1038" y="${y - 15}" width="52" height="30"/>` +
        T(1064, y - 2, 'TMP36', 'pinl', 'middle') + T(1064, y + 10, 'U5' + ['C', 'B', 'A'][i], 'val', 'middle') +
        `<line class="thermal" x1="1038" y1="${y}" x2="1023" y2="${y}"/>` +
        T(1064, y + 26, '→ X' + (2 - i), 'val', 'middle')).join('') +
      T(1064, 417, 'U7 CD4051', 'ref', 'middle') + T(1064, 433, 'D2–4 → A0', 'val', 'middle') +
      T(1064, 453, '—', 'probe', 'middle', 'sTmp') + `</g>`);

    // Hücreler
    s.push(cellV(940, TOP, 230, 3) + cellV(940, 230, 330, 2) + cellV(940, 330, GND, 1));
    s.push(T(952, TOP - 8, '—', 'probe', 'start', 'sPack'));

    // Yük (P+ / P− uçlarına bağlı elektronik yük; test için)
    s.push(`<g class="part" data-part="load" tabindex="0" role="button" aria-label="Yük">` +
      `<rect class="hit" x="700" y="240" width="92" height="90"/>` +
      dot(772, TOP) + W([[772, TOP], [772, 262]]) +
      `<rect id="loadBox" class="sym load" x="760" y="262" width="24" height="46"/><line class="potarrow" x1="752" y1="304" x2="792" y2="266" marker-end="url(#iarrow)"/>` +
      W([[772, 308], [772, GND]]) + dot(772, GND) +
      T(752, 276, 'RL', 'ref', 'end') + T(752, 290, 'yük', 'val', 'end') + T(752, 322, '—', 'probe', 'end', 'sLoad') + `</g>`);

    // Akım oku
    s.push(`<g id="iArrow"><line class="iarrow" x1="560" y1="104" x2="596" y2="104" marker-end="url(#iarrow)"/>${T(560, 96, '—', 'probe strong', 'start', 'sI')}</g>`);

    // U2 Arduino Uno
    const unoPins = [
      ['A0', 'TMP36', 'pA0'], ['A1', 'H1+', 'pA1'], ['A2', 'H2+ ÷2', 'pA2'], ['A3', '—', 'pA3'], ['A4/A5', 'I²C', 'pA4'],
    ];
    const unoPinsR = [['D6', 'PWM', 'pD6'], ['D7', 'röle', 'pD7'], ['D9', 'PWM', 'pD9'], ['D12', 'mod', 'pD12']];
    let pins = '';
    unoPins.forEach((p, k) => {
      const y = 300 + k * 22;
      pins += `<line class="stub" x1="364" y1="${y - 4}" x2="380" y2="${y - 4}"/>` + T(386, y, p[0], 'pinl', 'start', 'pl' + p[2]) + T(430, y, p[1], 'val', 'start', p[2]);
    });
    unoPinsR.forEach((p, k) => {
      const y = 300 + k * 22;
      pins += `<line class="stub" x1="640" y1="${y - 4}" x2="656" y2="${y - 4}"/>` + T(634, y, p[0], 'pinl', 'end', 'pl' + p[2]) + T(588, y, p[1], 'val', 'end', p[2]);
    });
    s.push(block(380, 262, 260, 162, 'U2', 'Arduino Uno', 'uno',
      T(510, 280, 'ARDUINO UNO · ATmega328P', 'blkname sm', 'middle') + pins +
      `<rect class="fsmchip" x="470" y="392" width="170" height="24" rx="2"/>` + T(555, 409, '—', 'fsm', 'middle', 'sFsm')));
    s.push(W([[510, 424], [510, GND]]) + dot(510, GND));
    // Aynı adaptörden ikinci güç kolu: V1+ → U6 → Arduino Vin.
    // U1 GND hattının üzerinden köprüyle geçilir; burada elektriksel birleşim yoktur.
    s.push(`<g id="auxSupply">` + dot(60, 242) +
      W([[60, 242], [162, 242]]) + `<path class="w" d="M162 242 Q170 226 178 242"/>` +
      W([[178, 242], [205, 242], [205, 350], [220, 350]]) +
      block(220, 328, 120, 64, 'U6', 'Arduino besleme buck', 'aux',
        T(280, 353, 'BUCK', 'blkname', 'middle') +
        T(280, 375, '19.5 → 7.5 V', 'val', 'middle')) +
      W([[340, 350], [354, 350], [354, 246], [510, 246], [510, 262]]) +
      T(420, 239, '7.5 V → Vin', 'probe', 'middle') +
      W([[280, 392], [280, GND]]) + dot(280, GND) +
      T(280, 318, 'ARDUINO BESLEMESİ', 'ref', 'middle') +
      T(195, 467, 'SW1: D12 · şarj modu', 'val') +
      `<g data-meas="ina">${T(410, 467, 'LCD1: I²C A4/A5', 'val')}</g>` + `</g>`);

    // Revizyon bulutları (yalnız Rev B)
    s.push(`<g class="clouds" data-rev="B">` + REVISIONS.filter(r => r.cloud !== false).map(r => cloud(...r.box, r.n)).join('') + `</g>`);

    // Revizyon tablosu + antet
    s.push(titleBlock(meta, { title: '3S A28 CC/CV ŞARJ DEVRESİ', rev: 'B', state: 'önerilen', sheet: '1 / 2' }));

    // Revizyon listesi alt çekmecedeki "Revizyonlar" sekmesine taşındı; paftada yalnız yönlendirme notu
    s.push(`<g class="revtable">` + T(40, 494, 'REVİZYONLAR  final rapordaki devre → Rev B', 'tbk') +
      T(40, 510, 'Revizyon kaydı, karar ve bilgi notları: alttaki "Revizyonlar" sekmesi.', 'revtxt') + `</g>`);
    s.push('</svg>');
    return s.join('');
  }

  root.Schematic = {
    build, zone, REVISIONS, sheetFrame, titleBlock, VB,
    lib: { W, dot, T, resV, resH, capV, diodeL, gnd, net, fuseH, block, cloud },
  };
})(typeof self !== 'undefined' ? self : this);
