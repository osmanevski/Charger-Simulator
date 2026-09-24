# Şarj tezgâhı — 3S ASPİLSAN INR18650A28

3S Li-ion CC/CV şarj devresi için çevrimdışı simülasyon. Tarayıcıda `index.html` dosyasını açmak yeterli; internet ve kurulum gerekmez (fontlar `assets/fonts/` içinde gömülü).

## Sayfalar

| Sayfa | İçerik |
|---|---|
| `index.html` | **Şarj tezgâhı.** Rev B devresi canlı şema olarak (IEC sembolleri, pafta, antet). Şarj et / Kullan / Beklet, tezgâh güç kaynağı tarzı okuma şeridi, grafikler, senaryolar, bileşen denetçisi, Arduino görünümü, tasarım kontrolleri, revizyon kaydı. Ölçüm yöntemi (ayrık / INA219) ve BMS'in takılı olup olmadığı seçilebilir; çizim buna göre değişir. |
| `alternatif.html` | **Alternatif mimari: MOSFET matrisi.** Şarjda 1S3P, kullanımda 3S1P. Merdiven topolojisi (P1–P4, S12, S23, CHG, OUT + ön eşitleme), break-before-make, ΔV kontrolü, donanımsal kilitleme, hücre ölçüm modu, anahtar tabloları ve Rev B ile karşılaştırma. **Gate sürme modeli:** Arduino → 2× 74HC595 → grup beslemesi kilidi → 10× VOM1271 fotovoltaik sürücü → sırt sırta MOSFET çiftleri; sürücü tipi (PV / hızlı izoleli / Arduino pini doğrudan), gate yükü, ölü zaman ve kilitleme parametreleriyle açılma-kapanma zamanlaması, çakışma (≈ 85 A kısa devre) ve yetersiz Vgs arızaları hesaplanır. |
| `dogrulama.html` | **Doğrulama raporu.** Hücre modeli ↔ datasheet (şarj ve 2.9 A deşarj), Rev A ↔ Rev B, 10 senaryoluk matris, ablasyon tablosu, alternatif mimari özeti. Açılışta yeniden hesaplanır. |

## Sunum kısayolları (index.html)

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
assets/charger-a.js     Sistem modeli: adaptör, XL4015, ölçüm zinciri, firmware durum makinesi, BMS
assets/scenarios-a.js   Senaryo ve ablasyon tanımları (sayfalar ve testler ortak kullanır)
assets/reconfig-model.js  Alternatif mimari modeli (MOSFET matrisi, 1S3P/3S1P)
assets/schematic-c.js   Alternatif mimari paftası
assets/alt.js           Alternatif mimari arayüzü
assets/bom.js           Malzeme listeleri (Rev B ve alternatif); iki sayfadaki "Malzeme listesi" sekmesi
assets/schematic.js     Devre şeması (IEC sembolleri, pafta, antet, revizyon bulutları)
assets/bench.js         Şarj tezgâhı arayüzü
assets/charts.js        Grafik çizici
assets/bench.css        Tasarım tokenları ve stiller
tests/run-tests.js      38 regresyon testi:  node tests/run-tests.js
```

Model dosyaları (`a28-model.js`, `charger-a.js`, `scenarios-a.js`) hem tarayıcıda hem Node'da çalışır.

## Önemli

Kontrol mantığı ve sistem davranışı simülasyonudur; SPICE analizi veya gerçek güvenlik doğrulaması yerine geçmez. Model varsayımları `dogrulama.html` sayfasının son bölümünde.
