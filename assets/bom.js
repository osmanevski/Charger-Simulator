/*
 * Malzeme listeleri (BOM): Rev B ve alternatif MOSFET matrisi.
 * Referanslar paftalardaki etiketlerle aynıdır. Satır: [ref, parça, değer / model, adet, not]
 * Tarayıcıda window.BOM, Node'da module.exports.
 */
(function (root) {
  'use strict';

  const REVB = {
    id: 'revb', title: 'Rev B · seri 3S + BMS', sheet: 'Pafta 1 / 2',
    groups: [
      { g: 'Güç katı', items: [
        ['—', 'DC adaptör', '15 V / 2 A (FAST 2.8 A için 19 V / 3 A)', 1, '1.4 A şarjda 1.6 V başlık payı'],
        ['J1', 'DC jak', '5.5 × 2.1 mm, panel tipi', 1, ''],
        ['U1', 'Buck modülü', 'XL4015 5 A', 1, 'CV potu sökülür; CC potu en yükseğe alınır'],
        ['K1', 'Röle modülü', '5 V tek kanal, SRD-05VDC (sürücü transistörü + diyot dahil)', 1, 'NO kontak: güç kesilince paket ayrılır'],
        ['F1', 'Sigorta + yuva', '5 A hızlı, 5 × 20 mm', 1, 'Paket + ucunda; yük kısa devresini de korur'],
      ] },
      { g: 'Paket', items: [
        ['BT1–BT3', 'Li-ion hücre', 'ASPİLSAN INR18650A28 (2800 mAh)', 3, 'Aynı partiden, gerilimleri ±20 mV eşlenmiş'],
        ['—', 'Hücre yuvası', '3S 18650 (seri)', 1, 'ya da nikel şerit punta'],
        ['U4', '3S BMS', 'dengelemeli, ≥ 10 A (ör. HX-3S-JH20)', 1, 'OVP 4.25 V · UVP 2.5 V · balans ≈ 60 mA'],
        ['—', 'Balans kablosu', 'JST-XH 4 pin', 1, 'H1+ ve H2+ uçları Arduino\'ya da gider'],
      ] },
      { g: 'Kontrol ve arayüz', items: [
        ['U2', 'Mikrodenetleyici', 'Arduino Uno R3', 1, 'Adaptörden beslenir (Vin)'],
        ['—', 'LCD', '16×2 HD44780, paralel', 1, 'D2–D6, D8'],
        ['—', 'Kontrast trimpotu', '10 kΩ', 1, ''],
        ['—', 'Sıcaklık sensörü', 'TMP36 (TO-92)', 1, 'A0; H2 yüzeyine yapıştırılır'],
        ['—', 'Mod anahtarı', 'SPDT sürgülü', 1, 'D12 SAFE/FAST, dahili pull-up'],
      ] },
      { g: 'XL4015 tavan ve PWM enjeksiyonu', items: [
        ['R_alt', 'Direnç', '1.0 kΩ %1 metal film', 1, 'FB → GND'],
        ['R_üst', 'Direnç', '9.1 kΩ %1 (ya da 8.2 kΩ + 2 kΩ çok turlu trimpot)', 1, 'Tavan DMM ile 12.60–12.65 V\'a ayarlanır'],
        ['D1', 'Diyot', '1N4148', 1, 'BAT54 değil (kaçak akımı tavanı kaydırır)'],
        ['R3', 'Direnç', '5.1 kΩ %1', 1, 'R_üst / 1.5 − R4'],
        ['R4', 'Direnç', '1.0 kΩ', 1, 'PWM RC filtresi'],
        ['C1', 'Elektrolitik kondansatör', '100 µF 16 V', 1, 'τ = 0.1 s'],
      ] },
      { g: 'Ölçüm', items: [
        ['R5', 'Şönt direnci', '0.1 Ω 1 W %1', 1, 'Paket − (low-side)'],
        ['U3', 'Op-amp', 'LM358 (DIP-8)', 1, '×10 kazanç → A4'],
        ['Rf', 'Direnç', '9.1 kΩ %1', 1, 'Kazanç = 1 + Rf/Rg'],
        ['Rg', 'Direnç', '1.0 kΩ %1', 1, ''],
        ['R6', 'Direnç', '10 kΩ %1', 1, 'Paket bölücüsü üst → A3'],
        ['R7', 'Direnç', '4.7 kΩ %1', 1, 'Paket bölücüsü alt'],
        ['—', 'Direnç', '10 kΩ %1', 2, 'H2+ bölücüsü (÷2) → A2'],
        ['—', 'Seramik kondansatör', '100 nF', 5, 'A1–A4 filtre + LM358 dekuplaj'],
      ] },
      { g: 'Montaj', items: [
        ['—', 'Delikli pertinaks', '7 × 9 cm', 1, ''],
        ['—', 'Klemens', '2 pin, 5.08 mm', 4, 'adaptör, paket, yük'],
        ['—', 'Kablo', '18 AWG silikon (güç) + jumper', 1, 'takım'],
      ] },
    ],
  };

  const ALT = {
    id: 'alt', title: 'Alternatif · MOSFET matrisi 1S3P ⇄ 3S1P', sheet: 'Pafta 2 / 2',
    groups: [
      { g: 'Güç katı', items: [
        ['—', 'DC adaptör', '12–15 V / 2 A', 1, '4.2 V × 4.2 A ≈ 18 W çıkış'],
        ['J1', 'DC jak', '5.5 × 2.1 mm, panel tipi', 1, ''],
        ['U1', 'Buck modülü', 'XL4015 5 A + soğutucu', 1, 'CV potu yerine sabit bölücü; CC potu 4.2 A\'e ayarlanır'],
        ['R_alt', 'Direnç', '1.0 kΩ %1', 1, 'CV 4.20 V bölücüsü'],
        ['R_üst', 'Direnç', '2.37 kΩ %1 (ya da 2.2 kΩ + 500 Ω trimpot)', 1, 'V_FB toleransı ±%2 → DMM ile 4.20 V\'a ayarlanır'],
        ['F1', 'Sigorta + yuva', '6.3 A hızlı', 1, 'Şarj hattı (CHG öncesi)'],
        ['F2', 'Sigorta + yuva', '4 A hızlı', 1, 'Yük hattı (OUT sonrası)'],
      ] },
      { g: 'Paket', items: [
        ['BT1–BT3', 'Li-ion hücre', 'ASPİLSAN INR18650A28 (2800 mAh)', 3, ''],
        ['—', 'Hücre yuvası', '1S 18650 (tekli)', 3, 'Her hücrenin iki ucu matrise ayrı gider'],
        ['—', 'BMS', '— (standart 3S BMS kullanılamaz)', 0, 'Koruma: hücre ölçümü + yazılım + sigortalar'],
      ] },
      { g: 'Anahtar matrisi', items: [
        ['P1–P4, S12, S23, CHG, OUT, Q3r, Q4r', 'N-MOSFET', 'IRLB8721 (30 V, 62 A, ≈ 8.7 mΩ @ 4.5 V, Qg ≈ 7.6 nC)', 20, '10 anahtar × 2 (sırt sırta, ortak source)'],
        ['Rpre', 'Ön eşitleme direnci', '0.1 Ω 2 W (daha güvenli: 0.5 Ω)', 2, 'Q3r ve Q4r kollarında'],
        ['—', 'Direnç', '1 MΩ', 10, 'Gate–source (sürücü yokken kapalı tutar)'],
      ] },
      { g: 'Gate sürücü ve kilitleme', items: [
        ['—', 'Fotovoltaik MOSFET sürücü', 'Vishay VOM1271 (SOP-4)', 10, 'Her anahtara bir tane; ~8.4 V yalıtılmış gate'],
        ['—', 'Direnç', '330 Ω', 10, 'VOM1271 LED akımı ≈ 10 mA'],
        ['—', 'Kaydırma yazmacı', '74HC595', 2, '10 gate biti; LED\'ler 5 + 5 bölünür (yonga başına ≤ 70 mA)'],
        ['—', 'Direnç', '10 kΩ', 1, 'OE pull-up: reset anında tüm çıkışlar kapalı'],
        ['—', 'NAND kapısı', '74HC00', 1, 'PAR ⇄ SER çapraz kilit'],
        ['—', 'PNP transistör', 'BC327', 2, 'PAR ve SER grubunun LED besleme rayı'],
        ['—', 'Direnç', '1 kΩ', 2, 'BC327 baz'],
        ['—', 'Direnç + kondansatör', '10 kΩ + 470 nF', 2, '≈ 5 ms açma gecikmesi (RC)'],
        ['—', 'Seramik kondansatör', '100 nF', 3, '74HC595 ×2 + 74HC00 dekuplaj'],
      ] },
      { g: 'Kontrol ve arayüz', items: [
        ['U2', 'Mikrodenetleyici', 'Arduino Uno R3', 1, 'D2–D5 → 74HC595'],
        ['—', 'LCD', '16×2 HD44780, paralel', 1, 'D6–D8, D10–D12'],
        ['—', 'Kontrast trimpotu', '10 kΩ', 1, ''],
        ['—', 'Sıcaklık sensörü', 'TMP36 (TO-92)', 1, 'A0'],
        ['—', 'Mod anahtarı', 'SPDT sürgülü', 1, 'Şarj / Kullan · A5 dijital giriş'],
      ] },
      { g: 'Ölçüm', items: [
        ['—', 'Şönt direnci', '0.05 Ω 1 W %1', 1, 'Ortak − hattı: şarj ve yük akımı tek şöntten'],
        ['—', 'Op-amp', 'LM358 (DIP-8)', 1, '×21 kazanç → A4 (4.2 A → 4.4 V)'],
        ['—', 'Direnç', '20 kΩ %1', 1, 'Rf'],
        ['—', 'Direnç', '1.0 kΩ %1', 1, 'Rg'],
        ['—', 'Direnç', '10 kΩ %1', 3, 'H2 üst düğümü ÷2 (A2) + H3 üst düğümü bölücü üstü (A3)'],
        ['—', 'Direnç', '4.7 kΩ %1', 1, 'H3 üst düğümü bölücü altı'],
        ['—', 'Seramik kondansatör', '100 nF', 5, 'A1–A4 filtre + LM358 dekuplaj'],
      ] },
      { g: 'Montaj', items: [
        ['—', 'Delikli pertinaks', '10 × 15 cm', 1, 'Güç yolları kalın bakır / tel takviyeli'],
        ['—', 'Klemens', '2 pin, 5.08 mm', 4, 'adaptör, yük'],
        ['—', 'Kablo', '16 AWG silikon (güç) + jumper', 1, 'takım · paralel akım 4.2 A'],
      ] },
    ],
  };

  const LISTS = [REVB, ALT];

  function totals(list) {
    let lines = 0, pcs = 0;
    list.groups.forEach(g => g.items.forEach(r => { if (r[3] > 0) { lines++; pcs += r[3]; } }));
    return { lines, pcs };
  }

  function toCsv(list) {
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [['Grup', 'Ref', 'Parça', 'Değer / model', 'Adet', 'Not']];
    list.groups.forEach(g => g.items.forEach(r => rows.push([g.g, ...r])));
    return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  }

  function toMarkdown(list) {
    const t = totals(list), out = [`## ${list.title}`, '', `${t.lines} kalem, ${t.pcs} parça.`, ''];
    list.groups.forEach(g => {
      out.push(`### ${g.g}`, '', '| Ref | Parça | Değer / model | Adet | Not |', '|---|---|---|---:|---|');
      g.items.forEach(([ref, n, v, q, note]) => out.push(`| ${ref} | ${n} | ${v} | ${q} | ${note} |`));
      out.push('');
    });
    return out.join('\n');
  }

  /** Malzeme listesi panelini çizer. el: kapsayıcı, initial: 'revb' | 'alt' */
  function mount(el, initial) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let cur = initial;
    const draw = () => {
      const list = LISTS.find(l => l.id === cur), t = totals(list);
      const other = LISTS.find(l => l.id !== cur), to = totals(other);
      el.innerHTML = `<div class="bom-head">
          <div class="seg" role="group" aria-label="Malzeme listesi">${LISTS.map(l => `<button data-bom="${l.id}" aria-pressed="${l.id === cur}">${l.id === 'revb' ? 'Rev B' : 'Alternatif'}</button>`).join('')}</div>
          <span class="bom-sum"><b>${t.lines}</b> kalem · <b>${t.pcs}</b> parça <span class="hint">(${other.id === 'revb' ? 'Rev B' : 'Alternatif'}: ${to.lines} kalem · ${to.pcs} parça)</span></span>
          <button class="btn sm" data-bom-csv>CSV indir</button>
        </div>
        <table class="bom"><thead><tr><th>Ref</th><th>Parça</th><th>Değer / model</th><th class="n">Adet</th><th>Not</th></tr></thead>
        ${list.groups.map(g => `<tbody><tr class="grp"><th colspan="5">${esc(g.g)}</th></tr>` +
          g.items.map(([ref, n, v, q, note]) => `<tr class="${q ? '' : 'none'}"><td class="ref">${esc(ref)}</td><td>${esc(n)}</td><td>${esc(v)}</td><td class="n">${q || '—'}</td><td class="hint">${esc(note)}</td></tr>`).join('') + '</tbody>').join('')}
        </table>`;
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-bom]');
      if (b) { cur = b.dataset.bom; draw(); return; }
      if (e.target.closest('[data-bom-csv]')) {
        const list = LISTS.find(l => l.id === cur);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' }));
        a.download = `malzeme-listesi-${cur}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    });
    draw();
  }

  const api = { REVB, ALT, LISTS, totals, toCsv, toMarkdown, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BOM = api;
})(typeof self !== 'undefined' ? self : this);
