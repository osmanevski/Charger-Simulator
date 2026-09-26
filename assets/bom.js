/*
 * Malzeme listeleri (BOM): Rev B ve alternatif MOSFET matrisi.
 * Referanslar paftalardaki etiketlerle aynıdır. Satır: [ref, parça, değer / model, adet, not]
 * Tarayıcıda window.BOM, Node'da module.exports.
 */
(function (root) {
  'use strict';

  const REVB = {
  "id": "revb",
  "title": "Rev B · 3S + INA219 · altı şarj kademesi",
  "sheet": "Pafta 1 / 2",
  "groups": [
    {
      "g": "Güç katı",
      "items": [
        [
          "V1",
          "DC adaptör",
          "Sony VGP-AC19V14 · 19.5 V / 4.7 A",
          1,
          "91.65 W; merkez pozitif; çıkış ve polarite ölçülür"
        ],
        [
          "J1",
          "DC giriş bağlantısı",
          "Sony fişine uygun, ≥5 A DC",
          1,
          "Fiş ölçüsü fiziksel olarak doğrulanır; 5.5 × 2.1 mm varsayılmaz"
        ],
        [
          "U1",
          "Buck modülü ve soğutucu",
          "XL4015 CC/CV · 4 A sürekli yük için doğrulanmış",
          1,
          "CC nominal 3.90 A; toplam +%2 hata/ripple bütçesinde ≤3.978 A. Isıl kabul testi ve gerekirse fan; 5 A etiketi yeterli değil"
        ],
        [
          "U6",
          "Kontrol beslemesi",
          "19.5 V → 7.5 V buck, ≥0.5 A",
          1,
          "Giriş dayanımı ≥24 V; çıkış Uno Vin; ortak GND"
        ],
        [
          "K1",
          "Röle modülü",
          "5 V, NO kontak ≥5 A @ en az 15 V DC",
          1,
          "Sürücü + flyback diyodu; açılış/reset/besleme kaybında röle açık kalmalı"
        ],
        [
          "F1",
          "Sigorta + yuva",
          "5 A, uygun DC kesme kapasiteli",
          1,
          "Paket + ucuna yakın; kablo ve kısa devre hesabıyla seçilir"
        ]
      ]
    },
    {
      "g": "Paket",
      "items": [
        [
          "BT1–BT3",
          "Li-ion hücre",
          "ASPİLSAN INR18650A28 · 2800 mAh",
          3,
          "3S1P; aynı parti ve eşlenmiş kapasite/direnç; max şarj 4 A (10–50 °C üretici koşulu)"
        ],
        [
          "—",
          "Hücre bağlantıları",
          "Puntalı nikel / ≥4 A sürekli akım için doğrulanmış yuva",
          1,
          "Ucuz yaylı yuva ve breadboard güç yolu olarak kullanılmaz"
        ],
        [
          "U4",
          "Balanslı 3S BMS",
          "Şarj akımı ≥4 A; deşarj ≥10 A",
          1,
          "Gerçek ürün şarj sınırı doğrulanır; simülasyon OVP 4.25 V, UVP 2.50 V, balans 60 mA varsayar"
        ],
        [
          "—",
          "Balans kablosu",
          "JST-XH 4 pin",
          1,
          "H1+ / H2+ ayrıca hücre izleme devresine"
        ]
      ]
    },
    {
      "g": "Kontrol ve arayüz",
      "items": [
        [
          "U2",
          "Mikrodenetleyici",
          "Arduino Uno R3",
          1,
          "U6 ile 7.5 V → Vin; 19.5 V doğrudan verilmez"
        ],
        [
          "LCD1",
          "LCD + I²C adaptörü",
          "16×2 HD44780 + PCF8574",
          1,
          "SDA A4 / SCL A5; INA219 ile ortak hat; adres çakışması kontrol edilir"
        ],
        [
          "U5A–C",
          "Sıcaklık sensörü",
          "TMP36",
          3,
          "Her hücre yüzeyine elektriksel yalıtımlı termal temas; +5 V, ortak GND"
        ],
        [
          "U7",
          "Analog çoklayıcı",
          "CD4051B",
          1,
          "X0–X2 sensörler → ortak A0; S0/S1/S2 D2/D3/D4; INH,VSS,VEE GND; VDD 5 V"
        ],
        [
          "RTA–C",
          "Sensör hat çekme direnci",
          "100 kΩ",
          3,
          "Her TMP36 çıkışı / çoklayıcı girişi → GND; kopuk hat tanılama"
        ],
        [
          "SW1",
          "Mod düğmesi",
          "Anlık buton",
          1,
          "D12–GND, dahili pull-up; altı kademe / özel akım / süre seçimi"
        ],
        [
          "RV2",
          "Kullanıcı ayarı",
          "10 kΩ lineer pot",
          1,
          "5 V–GND, orta uç A3; akım 1.0–4.0 A / süre seçimi"
        ],
        [
          "BZ1",
          "Aktif buzzer modülü",
          "5 V, sürücü transistörü dahil",
          1,
          "Sinyal D10; besleme 5 V/GND"
        ],
        [
          "LED1",
          "Durum LED’i",
          "Yeşil LED + 330 Ω seri direnç",
          1,
          "D11; D13 için Uno üzerindeki LED kullanılır"
        ]
      ]
    },
    {
      "g": "XL4015 tavan ve PWM enjeksiyonu",
      "items": [
        [
          "R_alt",
          "Direnç",
          "1.0 kΩ %1",
          1,
          "FB → GND"
        ],
        [
          "R_üst",
          "Direnç + ayar",
          "8.2 kΩ + 2 kΩ çok turlu trimpot",
          1,
          "DMM ile 12.60 V tavan; 12.65 V hedeflenmez. Paket tavanı tek hücre koruması değildir"
        ],
        [
          "D1",
          "Diyot",
          "1N4148",
          1,
          "Düşük kaçaklı; PWM yalnızca tavanı aşağı çekebilir"
        ],
        [
          "R3",
          "Direnç",
          "5.1 kΩ %1",
          1,
          "R_üst / 1.5 − R4; gerçek kalibrasyon değerine göre kontrol"
        ],
        [
          "R4",
          "Direnç",
          "1.0 kΩ",
          1,
          "D9 10-bit PWM filtresi"
        ],
        [
          "C1",
          "Elektrolitik kondansatör",
          "100 µF 16 V",
          1,
          "τ = 0.1 s"
        ]
      ]
    },
    {
      "g": "Ölçüm",
      "items": [
        [
          "U3",
          "Akım / bus gerilim ölçümü",
          "INA219",
          1,
          "High-side; ±320 mV / 16 V bus; CurrentLSB 200 µA; CAL 4096 (0x1000); modül PCB yolu ≥4 A için doğrulanır"
        ],
        [
          "R5",
          "Şönt",
          "R050 · 0.050 Ω ≥2 W %1 veya daha iyi",
          1,
          "Modüldeki R100 sökülüp değiştirilir; Kelvin bağlantı. 4 A → 200 mV / 0.80 W. Gerçek direnç DMM/yük ile kalibre edilir"
        ],
        [
          "RT2a/b",
          "H2+ bölücü",
          "10 kΩ %0.1 eşlenmiş",
          2,
          "H2+ ÷2 → A2; H1+ → A1; girişler ve INA bus birlikte kalibre edilir"
        ],
        [
          "C2–C8",
          "Seramik kondansatör",
          "100 nF",
          7,
          "TMP36 ×3, CD4051, INA219 dekuplaj; A1/A2 filtre. MUX çıkışına büyük filtre konmaz"
        ]
      ]
    },
    {
      "g": "Montaj",
      "items": [
        [
          "—",
          "PCB / prototip kart",
          "4 A güç yolları için tasarlanmış",
          1,
          "Kelvin sense ayrı; güç yolları kalın bakır/tel takviyeli; izolasyon ve BMS bağlantıları kontrol edilir"
        ],
        [
          "—",
          "Klemens",
          "2 pin, ≥5 A DC",
          4,
          "Adaptör, paket, yük; kontak ısınması ölçülür"
        ],
        [
          "—",
          "Kablo",
          "18 AWG silikon güç + sinyal kabloları",
          1,
          "Takım; sinyaller güç yollarından ayrı"
        ]
      ]
    }
  ]
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
