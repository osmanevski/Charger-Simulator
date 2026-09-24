/*
 * Alternatif mimari paftası: MOSFET matrisli (merdiven) 3 hücreli paket.
 * schematic.js'deki pafta, antet ve sembol yardımcılarını kullanır.
 */
(function (root) {
  'use strict';
  const { W, dot, T, net, block } = root.Schematic.lib;

  // Hücre konumları ve düğümler
  const X = [420, 610, 800], YB = 180, YM = 290, YA = 400, NEG = 455;

  /** İki nokta arasında anahtar; ortada kontak boşluğu, bıçak açık/kapalı. */
  function sw(id, x1, y1, x2, y2, label, grp, lx = 0, ly = -12) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, g = 13;
    const a = [mx - ux * g, my - uy * g], b = [mx + ux * g, my + uy * g];
    // açık bıçak: a'dan, doğrultuya göre 28° döndürülmüş
    const ang = -28 * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const ox = a[0] + (ux * ca - uy * sa) * 2 * g, oy = a[1] + (ux * sa + uy * ca) * 2 * g;
    return `<g class="swc part ${grp}" id="sw-${id}" data-part="sw-${id}" tabindex="0" role="button" aria-label="Anahtar ${label}">` +
      `<line class="hit-l" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
      W([[x1, y1], a]) + W([b, [x2, y2]]) +
      `<circle class="pin" cx="${a[0]}" cy="${a[1]}" r="2.6"/><circle class="pin" cx="${b[0]}" cy="${b[1]}" r="2.6"/>` +
      `<line class="blade-open" x1="${a[0]}" y1="${a[1]}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}"/>` +
      `<line class="blade-closed" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>` +
      T(mx + lx, my + ly, label, 'ref swlabel', 'middle') + T(mx + lx, my + ly + 12, '', 'val swv', 'middle', `swv-${id}`) + `</g>`;
  }

  function cellH(k) {
    const x = X[k], n = k + 1;
    return `<g class="part cellsym" data-part="cell${n}" tabindex="0" role="button" aria-label="Hücre ${n}">` +
      `<rect class="hit" x="${x - 88}" y="${YB + 20}" width="110" height="${YA - YB - 40}"/>` +
      W([[x, YB], [x, YM - 6]]) +
      `<line class="plate plate-p" x1="${x - 18}" y1="${YM - 6}" x2="${x + 18}" y2="${YM - 6}"/>` +
      `<line class="plate plate-n" x1="${x - 9}" y1="${YM + 4}" x2="${x + 9}" y2="${YM + 4}"/>` +
      W([[x, YM + 4], [x, YA]]) + T(x + 24, YM - 10, '+', 'pm', 'middle') +
      T(x - 26, YM - 22, `H${n}`, 'ref', 'end') +
      T(x - 26, YM - 6, '—', 'val big', 'end', `cV${n}`) +
      T(x - 26, YM + 9, '—', 'val', 'end', `cS${n}`) +
      T(x - 26, YM + 25, '—', 'probe', 'end', `cI${n}`) + `</g>`;
  }

  function build(meta) {
    const s = [];
    s.push(`<svg viewBox="0 0 ${root.Schematic.VB.w} ${root.Schematic.VB.h}" class="sheet-svg" role="img" aria-label="MOSFET matrisli paket şeması" xmlns="http://www.w3.org/2000/svg">`);
    s.push(root.Schematic.sheetFrame());

    // Akış katmanları
    s.push(`<g id="flowPar" class="flow"><polyline class="flowline" points="190,${YB} ${X[2]},${YB}"/>` +
      X.map(x => `<polyline class="flowline" points="${x},${YB} ${x},${YA}"/>`).join('') +
      `<polyline class="flowline" points="${X[2]},${YA} ${X[0]},${YA} ${X[0]},${NEG} 125,${NEG} 125,250"/></g>`);
    s.push(`<g id="flowSer" class="flow dsg"><polyline class="flowline" points="${X[0]},${NEG} ${X[0]},${YA} ${X[0]},${YB} ${X[1]},${YA} ${X[1]},${YB} ${X[2]},${YA} ${X[2]},${YB} 1000,${YB} 1000,260"/>` +
      `<polyline class="flowline" points="1000,340 1000,${NEG} ${X[0]},${NEG}"/></g>`);

    // Şarj katı (tek hücreli CC/CV)
    s.push(block(60, 150, 130, 100, 'U1', 'Şarj katı', 'charger',
      T(125, 186, 'XL4015', 'blkname', 'middle') + T(125, 203, 'CV 4.20 V · CC 4.2 A', 'val', 'middle') + T(125, 222, '—', 'val strong', 'middle', 'sChg') +
      T(184, 176, '+', 'pm', 'end') + T(184, 244, '−', 'pm', 'end')));
    s.push(W([[190, YB], [215, YB]]) + sw('CHG', 215, YB, 300, YB, 'CHG', 'g-par') + W([[300, YB], [X[0], YB]]));
    s.push(W([[125, 250], [125, NEG], [X[0], NEG]]) + dot(X[0], NEG));
    s.push(T(66, 272, '—', 'probe', 'start', 'sBus'));

    // Hücreler
    s.push(cellH(0) + cellH(1) + cellH(2));
    X.forEach(x => s.push(dot(x, YB) + dot(x, YA)));
    s.push(W([[X[0], YA], [X[0], NEG]]));

    // Paralel anahtarlar (merdiven)
    s.push(sw('P3', X[0], YB, X[1], YB, 'P3', 'g-par'));
    s.push(sw('P4', X[1], YB, X[2], YB, 'P4', 'g-par'));
    s.push(sw('P1', X[0], YA, X[1], YA, 'P1', 'g-par', 0, 22));
    s.push(sw('P2', X[1], YA, X[2], YA, 'P2', 'g-par', 0, 22));
    // Seri anahtarlar (çapraz)
    s.push(sw('S12', X[0], YB, X[1], YA, 'S12', 'g-ser', -34, 30));
    s.push(sw('S23', X[1], YB, X[2], YA, 'S23', 'g-ser', -34, 30));

    // Ön eşitleme dalları: P3/P4'e paralel direnç + anahtar
    const pre = (id, x1, x2) => {
      const y = 120, m = (x1 + x2) / 2;
      return `<g class="swc part g-pre" id="sw-${id}" data-part="sw-${id}" tabindex="0" role="button" aria-label="Ön eşitleme ${id}">` +
        W([[x1, YB], [x1, y], [m - 58, y]]) + `<rect class="sym" x="${m - 58}" y="${y - 5}" width="30" height="10"/>` +
        W([[m - 28, y], [m - 14, y]]) +
        `<circle class="pin" cx="${m - 14}" cy="${y}" r="2.4"/><circle class="pin" cx="${m + 12}" cy="${y}" r="2.4"/>` +
        `<line class="blade-open" x1="${m - 14}" y1="${y}" x2="${m + 9}" y2="${y - 12}"/><line class="blade-closed" x1="${m - 14}" y1="${y}" x2="${m + 12}" y2="${y}"/>` +
        W([[m + 12, y], [x2, y], [x2, YB]]) + T(m - 43, y - 10, 'R 0.1 Ω', 'val', 'middle') + T(m, y - 10, id, 'ref swlabel', 'start') + `</g>`;
    };
    s.push(pre('Q3r', X[0], X[1]) + pre('Q4r', X[1], X[2]));

    // Çıkış anahtarı ve yük
    s.push(W([[X[2], YB], [880, YB]]) + sw('OUT', 880, YB, 960, YB, 'OUT', 'g-ser') + W([[960, YB], [1000, YB], [1000, 260]]));
    s.push(`<g class="part" data-part="load" tabindex="0" role="button" aria-label="Yük"><rect class="hit" x="970" y="250" width="100" height="100"/>` +
      `<rect id="loadBox" class="sym load" x="988" y="260" width="24" height="80"/><line class="potarrow" x1="980" y1="336" x2="1020" y2="266" marker-end="url(#iarrow)"/>` +
      T(1020, 290, 'RL', 'ref') + T(1020, 304, 'yük', 'val') + T(1020, 322, '—', 'probe', 'start', 'sLoad') + `</g>`);
    s.push(W([[1000, 340], [1000, NEG], [X[0], NEG]]));
    s.push(T(1004, YB - 8, '—', 'probe', 'start', 'sOut'));

    // Denetim: Arduino + kilitlemeli gate sürücü
    s.push(block(60, 300, 230, 120, 'U2', 'Arduino ve gate sürücü', 'ctrl',
      T(175, 324, 'ARDUINO UNO → 2× 74HC595', 'blkname sm', 'middle') + T(175, 340, '—', 'val', 'middle', 'sDrv') +
      T(175, 356, 'donanım kilitleme (interlock)', 'val', 'middle', 'sIlk') +
      `<rect class="fsmchip" x="70" y="370" width="210" height="24" rx="2"/>` + T(175, 387, '—', 'fsm', 'middle', 'sMode') +
      T(175, 412, 'G1…G10 → tüm anahtarlar', 'val', 'middle')));
    s.push(net(290, 330, 'G1…G10'));

    // Notlar + antet
    const NX = 40, NY = 486;
    s.push(`<g class="revtable">` + T(NX, NY + 8, 'ALTERNATİF MİMARİ — MERDİVEN TOPOLOJİSİ', 'tbk') +
      T(NX, NY + 26, 'Şarj 1S3P: P1–P4 + CHG iletimde · Kullanım 3S1P: S12, S23 + OUT iletimde · Geçişte önce hepsi kapanır (dead-time).', 'revtxt') +
      T(NX, NY + 40, 'ΔV ≤ 0.25 V doğrudan paralel; 0.25–0.60 V dirençli ön eşitleme (Q3r/Q4r); daha büyük fark reddedilir.', 'revtxt') +
      T(NX, NY + 54, 'H2 yolu 2, H3 yolu 4 MOSFET\'ten geçer → paralel akım paylaşımı eşit değildir. Standart 3S BMS kullanılamaz.', 'revtxt') +
      T(NX, NY + 68, '10 anahtar (8 ana + 2 ön eşitleme), her biri sırt sırta 2 MOSFET = 20 MOSFET · her anahtara 1 VOM1271 izoleli gate sürücü.', 'revtxt') + `</g>`);
    s.push(root.Schematic.titleBlock(meta, { title: 'ANAHTARLI 3S ⇄ 3P A28 PAKETİ', rev: 'ALT', state: 'alternatif', sheet: '2 / 2' }));
    s.push('</svg>');
    return s.join('');
  }

  root.SchematicC = { build };
})(typeof self !== 'undefined' ? self : this);
