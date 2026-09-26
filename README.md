# Şarj tezgâhı — 3S ASPİLSAN INR18650A28

3S Li-ion CC/CV şarj devresi için çevrimdışı simülasyon. Tarayıcıda `index.html` dosyasını açmak yeterli; internet ve kurulum gerekmez (fontlar `assets/fonts/` içinde gömülü).

## Sayfalar

| Sayfa | İçerik |
|---|---|
| `index.html` | **Şarj tezgâhı.** Rev B devresi canlı şema olarak (IEC sembolleri, pafta, antet). Şarj et / Kullan / Beklet, tezgâh güç kaynağı tarzı okuma şeridi, grafikler, senaryolar, bileşen denetçisi, Arduino görünümü, tasarım kontrolleri, revizyon kaydı. Ölçüm yöntemi (ayrık / INA219) ve BMS'in takılı olup olmadığı seçilebilir; çizim buna göre değişir. |
| `alternatif.html` | **Alternatif mimari: MOSFET matrisi.** Şarjda 1S3P, kullanımda 3S1P. Merdiven topolojisi (P1–P4, S12, S23, CHG, OUT + ön eşitleme), break-before-make, ΔV kontrolü, donanımsal kilitleme, hücre ölçüm modu, anahtar tabloları ve Rev B ile karşılaştırma. **Gate sürme modeli:** Arduino → 2× 74HC595 → grup beslemesi kilidi → 10× VOM1271 fotovoltaik sürücü → sırt sırta MOSFET çiftleri; sürücü tipi (PV / hızlı izoleli / Arduino pini doğrudan), gate yükü, ölü zaman ve kilitleme parametreleriyle açılma-kapanma zamanlaması, çakışma (≈ 85 A kısa devre) ve yetersiz Vgs arızaları hesaplanır. |
| `dogrulama.html` | **Doğrulama raporu.** Hücre modeli ↔ datasheet (şarj ve 2.9 A deşarj), Rev A ↔ Rev B, 10 senaryoluk matris, ablasyon tablosu, alternatif mimari özeti. Açılışta yeniden hesaplanır. |

## Sunum kısayolları (index.html)

**Şarj modu:** Şemanın hemen üzerindeki altı düğmeden Yavaş (1.0 A), SAFE (1.4 A), Dengeli (2.1 A), FAST (2.8 A), BOOST (3.5 A), MAX (≤4.0 A) seçilir. Özel akım kaydırıcısı ve süre girişi kaldırılmıştır. Şarj sırasında seçim değiştirilebilir; SOC, geçen süre ve koruma durumları sıfırlanmaz. **300× gibi oynatma hızları şarj akımını değiştirmez.**

Şemada adaptör iki kola ayrılır: U1 XL4015 → pil şarj devresi; U6 buck (19.5 → 7.5 V) → Arduino Vin. U6 tıklanınca bağlantı ve besleme açıklaması açılır. İkinci adaptör gerekmez.

Varsayılan kaynak **Sony VGP-AC19V14, 19.5 V / 4.7 A**; XL4015 CC tavanı **3.90 A nominal**, doğrulanacak +%2 hata bütçesiyle **3.978 A**. Varsayılan ölçüm **INA219 + R050 ≥2 W**, sıcaklık **3×TMP36 + CD4051**; LCD I²C, ayar potu A3. [Deney sonuçları ve güncel donanım tasarımı](docs/CHARGE_DESIGN.md).

| Tuş | İşlev |
|---|---|
| `Boşluk` | Başlat / duraklat |
| `C` / `K` / `W` | Şarj et / Kullan (2.9 A yük, adaptör çekili) / Beklet |
| `E` | Sona git |
| `R` | Sıfırla |

**Şarj ↔ deşarj:** şarjın ortasında "Kullan"a basınca adaptör çekilir (Arduino adaptörden beslendiği için kapanır) ve yük bağlanır; "Şarj et" ile Arduino yeniden açılır ve CC'den devam eder.

**BMS'siz çalışma:** Parametreler → BMS → "BMS takılı" ya da Senaryolar → "BMS'i çıkar / tak". BMS çıkınca şemadan kalkar; şarjda firmware ve sabit tavan korur, ama deşarjda alt gerilim sınırı yoktur (hücre 2.5 V altına iner), kısa devrede tek koruma F1 sigortasıdır, balans yoktur.

Şemadaki bir bileşene tıklayınca görevi, anlık değerleri ve açıklaması "Bileşen" sekmesinde görünür.

## Dosyalar

```
assets/a28-model.js     A28 hücre modeli (1RC Thevenin + termal), datasheet sabitleri, sayısallaştırılmış şarj eğrisi
assets/ina219-model.js  INA219 yazmaç ölçekleri, CAL, taşma, şönt/ölçüm hataları
assets/charger-a.js     Sistem modeli: adaptör, XL4015, ölçüm zinciri, firmware durum makinesi, BMS
assets/charge-planner.js Canlı durumdan şarj süresi tahmini ve süreye uygun akım seçimi
assets/charge-controls.js Şemanın üstündeki altı mod seçimi
assets/scenarios-a.js   Senaryo ve ablasyon tanımları (sayfalar ve testler ortak kullanır)
assets/reconfig-model.js  Alternatif mimari modeli (MOSFET matrisi, 1S3P/3S1P)
assets/schematic-c.js   Alternatif mimari paftası
assets/alt.js           Alternatif mimari arayüzü
assets/bom.js           Malzeme listeleri (Rev B ve alternatif); iki sayfadaki "Malzeme listesi" sekmesi
assets/schematic.js     Devre şeması (IEC sembolleri, pafta, antet, revizyon bulutları)
assets/bench.js         Şarj tezgâhı arayüzü
assets/charts.js        Grafik çizici
assets/bench.css        Tasarım tokenları ve stiller
tests/run-tests.js      62 regresyon testi:  node tests/run-tests.js
tests/ina219.test.js    12 ölçüm / yüksek akım / sıcaklık / sayısal yakınsama testi
tests/charge-planner.test.js Canlı seçim / CV / tahmin / süre hedefi testleri
tests/sweep-charge.js   132 koşullu şarj taraması → docs/charge-sweep.json
```

Model dosyaları (`a28-model.js`, `charger-a.js`, `scenarios-a.js`) hem tarayıcıda hem Node'da çalışır.

Kontroller: `node tests/run-tests.js`, `node tests/ina219.test.js` ve `node tests/charge-planner.test.js`.
Tarama: `node tests/sweep-charge.js > docs/charge-sweep.json`; ardından `node scripts/export-charge-design.js`.

[Deney tablosu](docs/CHARGE_RESULTS.md) · [BOM](docs/BOM.md) · [CSV](docs/bom-revb.csv) · [Parametreler](docs/charge-config.json).

25 °C, %20 başlangıç için yaklaşık süreler: **143 / 108 / 80 / 67 / 60 / 57 dakika**. Değerler model tahmini; 35 °C üzerinde termal azaltma, soğuk hücrede BOOST/MAX sınırı ve CV kuyruğu süreyi değiştirir. Bitiş, filtrelenmiş 140 mA + gerilim koşulu + 5 s onay ile belirlenir. Gerçek Arduino firmware’i ve PCB bu depoda bulunmaz; güncelleme simülasyon ve elektriksel tasarıma uygulanmıştır.

## Önemli

Kontrol mantığı ve sistem davranışı simülasyonudur; SPICE analizi veya gerçek güvenlik doğrulaması yerine geçmez. Model varsayımları `dogrulama.html` sayfasının son bölümünde.
