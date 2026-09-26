# Şarj deney sonuçları

26.09.2026 · otomatik üretilir: `node scripts/export-charge-design.js`

25 °C, dengeli başlangıç SOC, gerçekçi kapasite/direnç dağılımı. Süreler şarj bitişine kadardır; bütün hücrelerin %100 olması anlamına gelmez. MAX isteği ≤4 A, gerçek nominal donanım tavanı 3,90 A.

| Mod | İstek | C oranı | %1’den | %20’den | %50’den | %20 tepe sıcaklık |
|---|---:|---:|---:|---:|---:|---:|
| Yavaş | 1,0 A | 0,36C | 173,0 dk | 142,5 dk | 92,5 dk | 26,0 °C |
| SAFE | 1,4 A | 0,50C | 129,5 dk | 107,8 dk | 72,2 dk | 26,9 °C |
| Dengeli | 2,1 A | 0,75C | 94,3 dk | 80,5 dk | 56,6 dk | 28,9 °C |
| FAST | 2,8 A | 1,00C | 77,4 dk | 67,3 dk | 49,6 dk | 31,3 °C |
| BOOST | 3,5 A | 1,25C | 67,8 dk | 60,2 dk | 46,2 dk | 33,8 °C |
| MAX | ≤4,0 A | 1,43C | 63,8 dk | 56,8 dk | 44,7 dk | 35,2 °C |

## Tarama kapsamı

132 koşul, 0 kabul ölçütü ihlali. Arıza enjeksiyonlarında şarjın durması beklenen sonuçtur. Kabul ölçütleri: tüm koşullarda tepe şarj akımı ≤4 A; dengeli nominal koşullar tamamlanmalı ve tepe hücre gerilimi ≤4,21 V; −5 °C, 45 °C ve INA219 kopukken bitiş tahmini üretilmemeli. Bu ölçütler fiziksel güvenlik sertifikasyonu değildir.

| Senaryo | Biten / toplam | En yüksek gerçek hücre V | Tepe şarj A | Son durumlar |
|---|---:|---:|---:|---|
| balanced | 54/54 | 4.1929 | 3.900 | CHARGE_DONE |
| aged | 6/6 | 4.1925 | 3.900 | CHARGE_DONE |
| imbalance | 5/6 | 4.2021 | 3.900 | CHARGE_DONE, OV_FAULT |
| hot | 0/6 | 3.6399 | 2.658 | TEMP_FAULT |
| cold-5 | 6/6 | 4.1918 | 2.802 | CHARGE_DONE |
| cold-inhibit | 0/6 | 3.5305 | 0.000 | LOW_TEMP |
| high-rate-boundary | 6/6 | 4.1919 | 3.900 | CHARGE_DONE |
| hot-inhibit | 0/6 | 3.5305 | 0.000 | TEMP_FAULT |
| cc-upper-budget | 6/6 | 4.1922 | 3.978 | CHARGE_DONE |
| sense-underread | 6/6 | 4.1921 | 3.900 | CHARGE_DONE |
| sense-overread | 6/6 | 4.1922 | 3.900 | CHARGE_DONE |
| bus-underread | 6/6 | 4.2021 | 3.900 | CHARGE_DONE |
| wrong-r100 | 4/6 | 4.1916 | 3.249 | CHARGE_DONE, SENSOR_FAULT |
| ina-disconnected | 0/6 | 3.5305 | 0.000 | SENSOR_FAULT |

Ham veri ve bütün başlangıç/son SOC değerleri: [charge-sweep.json](charge-sweep.json). Model, bitiş akımında 5 s süzgeç + 5 s onay kullanır; PWM akım çukurları tek başına erken bitiş oluşturmaz.

## Yeniden üretim

```sh
node tests/run-tests.js
node tests/ina219.test.js
node tests/charge-planner.test.js
node tests/sweep-charge.js > docs/charge-sweep.json
node scripts/export-charge-design.js
python3 tests/ui-charge.py
```

UI testi için Python Playwright ve Chromium gerekir; isteğe bağlı `CHROMIUM_EXECUTABLE` ortam değişkeni desteklenir.
