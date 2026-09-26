# Güncel malzeme listesi

Kaynak: `assets/bom.js`; CSV: [bom-revb.csv](bom-revb.csv).

## Rev B · 3S + INA219 · altı şarj kademesi

32 kalem, 48 parça.

### Güç katı

| Ref | Parça | Değer / model | Adet | Not |
|---|---|---|---:|---|
| V1 | DC adaptör | Sony VGP-AC19V14 · 19.5 V / 4.7 A | 1 | 91.65 W; merkez pozitif; çıkış ve polarite ölçülür |
| J1 | DC giriş bağlantısı | Sony fişine uygun, ≥5 A DC | 1 | Fiş ölçüsü fiziksel olarak doğrulanır; 5.5 × 2.1 mm varsayılmaz |
| U1 | Buck modülü ve soğutucu | XL4015 CC/CV · 4 A sürekli yük için doğrulanmış | 1 | CC nominal 3.90 A; toplam +%2 hata/ripple bütçesinde ≤3.978 A. Isıl kabul testi ve gerekirse fan; 5 A etiketi yeterli değil |
| U6 | Kontrol beslemesi | 19.5 V → 7.5 V buck, ≥0.5 A | 1 | Giriş dayanımı ≥24 V; çıkış Uno Vin; ortak GND |
| K1 | Röle modülü | 5 V, NO kontak ≥5 A @ en az 15 V DC | 1 | Sürücü + flyback diyodu; açılış/reset/besleme kaybında röle açık kalmalı |
| F1 | Sigorta + yuva | 5 A, uygun DC kesme kapasiteli | 1 | Paket + ucuna yakın; kablo ve kısa devre hesabıyla seçilir |

### Paket

| Ref | Parça | Değer / model | Adet | Not |
|---|---|---|---:|---|
| BT1–BT3 | Li-ion hücre | ASPİLSAN INR18650A28 · 2800 mAh | 3 | 3S1P; aynı parti ve eşlenmiş kapasite/direnç; max şarj 4 A (10–50 °C üretici koşulu) |
| — | Hücre bağlantıları | Puntalı nikel / ≥4 A sürekli akım için doğrulanmış yuva | 1 | Ucuz yaylı yuva ve breadboard güç yolu olarak kullanılmaz |
| U4 | Balanslı 3S BMS | Şarj akımı ≥4 A; deşarj ≥10 A | 1 | Gerçek ürün şarj sınırı doğrulanır; simülasyon OVP 4.25 V, UVP 2.50 V, balans 60 mA varsayar |
| — | Balans kablosu | JST-XH 4 pin | 1 | H1+ / H2+ ayrıca hücre izleme devresine |

### Kontrol ve arayüz

| Ref | Parça | Değer / model | Adet | Not |
|---|---|---|---:|---|
| U2 | Mikrodenetleyici | Arduino Uno R3 | 1 | U6 ile 7.5 V → Vin; 19.5 V doğrudan verilmez |
| LCD1 | LCD + I²C adaptörü | 16×2 HD44780 + PCF8574 | 1 | SDA A4 / SCL A5; INA219 ile ortak hat; adres çakışması kontrol edilir |
| U5A–C | Sıcaklık sensörü | TMP36 | 3 | Her hücre yüzeyine elektriksel yalıtımlı termal temas; +5 V, ortak GND |
| U7 | Analog çoklayıcı | CD4051B | 1 | X0–X2 sensörler → ortak A0; S0/S1/S2 D2/D3/D4; INH,VSS,VEE GND; VDD 5 V |
| RTA–C | Sensör hat çekme direnci | 100 kΩ | 3 | Her TMP36 çıkışı / çoklayıcı girişi → GND; kopuk hat tanılama |
| SW1 | Mod düğmesi | Anlık buton | 1 | D12–GND, dahili pull-up; altı kademe / özel akım / süre seçimi |
| RV2 | Kullanıcı ayarı | 10 kΩ lineer pot | 1 | 5 V–GND, orta uç A3; akım 1.0–4.0 A / süre seçimi |
| BZ1 | Aktif buzzer modülü | 5 V, sürücü transistörü dahil | 1 | Sinyal D10; besleme 5 V/GND |
| LED1 | Durum LED’i | Yeşil LED + 330 Ω seri direnç | 1 | D11; D13 için Uno üzerindeki LED kullanılır |

### XL4015 tavan ve PWM enjeksiyonu

| Ref | Parça | Değer / model | Adet | Not |
|---|---|---|---:|---|
| R_alt | Direnç | 1.0 kΩ %1 | 1 | FB → GND |
| R_üst | Direnç + ayar | 8.2 kΩ + 2 kΩ çok turlu trimpot | 1 | DMM ile 12.60 V tavan; 12.65 V hedeflenmez. Paket tavanı tek hücre koruması değildir |
| D1 | Diyot | 1N4148 | 1 | Düşük kaçaklı; PWM yalnızca tavanı aşağı çekebilir |
| R3 | Direnç | 5.1 kΩ %1 | 1 | R_üst / 1.5 − R4; gerçek kalibrasyon değerine göre kontrol |
| R4 | Direnç | 1.0 kΩ | 1 | D9 10-bit PWM filtresi |
| C1 | Elektrolitik kondansatör | 100 µF 16 V | 1 | τ = 0.1 s |

### Ölçüm

| Ref | Parça | Değer / model | Adet | Not |
|---|---|---|---:|---|
| U3 | Akım / bus gerilim ölçümü | INA219 | 1 | High-side; ±320 mV / 16 V bus; CurrentLSB 200 µA; CAL 4096 (0x1000); modül PCB yolu ≥4 A için doğrulanır |
| R5 | Şönt | R050 · 0.050 Ω ≥2 W %1 veya daha iyi | 1 | Modüldeki R100 sökülüp değiştirilir; Kelvin bağlantı. 4 A → 200 mV / 0.80 W. Gerçek direnç DMM/yük ile kalibre edilir |
| RT2a/b | H2+ bölücü | 10 kΩ %0.1 eşlenmiş | 2 | H2+ ÷2 → A2; H1+ → A1; girişler ve INA bus birlikte kalibre edilir |
| C2–C8 | Seramik kondansatör | 100 nF | 7 | TMP36 ×3, CD4051, INA219 dekuplaj; A1/A2 filtre. MUX çıkışına büyük filtre konmaz |

### Montaj

| Ref | Parça | Değer / model | Adet | Not |
|---|---|---|---:|---|
| — | PCB / prototip kart | 4 A güç yolları için tasarlanmış | 1 | Kelvin sense ayrı; güç yolları kalın bakır/tel takviyeli; izolasyon ve BMS bağlantıları kontrol edilir |
| — | Klemens | 2 pin, ≥5 A DC | 4 | Adaptör, paket, yük; kontak ısınması ölçülür |
| — | Kablo | 18 AWG silikon güç + sinyal kabloları | 1 | Takım; sinyaller güç yollarından ayrı |
