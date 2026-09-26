# Altı kademeli şarj tasarımı — Rev B

26.09.2026 · 3S1P ASPİLSAN INR18650A28 · Sony VGP-AC19V14

Kullanıcı Yavaş **1,0 A**, SAFE **1,4 A**, Dengeli **2,1 A**, FAST **2,8 A**, BOOST **3,5 A**, MAX **≤4,0 A** seçer. Özel akım 0,1 A adımlarla 1–4 A aralığındadır. Açılış SAFE. Seri paketin nominal kapasitesi 2,8 Ah; aynı şarj akımı üç hücreden geçer. 4 A = 1,43C; 1,5C = 4,2 A bu tasarımın dışında kalır.

**Uygulanan kapsam:** tarayıcı simülasyonu, kontrol modeli, şema, parametreler ve BOM. Depoda gerçek Arduino firmware’i veya üretime hazır PCB yoktur. Aşağıdaki pin bağlantıları fiziksel uygulama hedefini tanımlar; simülasyon fiziksel kabul testinin yerine geçmez.

## Donanım ve tolerans kararı

XL4015 CC potu **3,90 A nominal** ayarlanır. Toplam pozitif ayar/ölçüm/sıcaklık/ripple hatası **%2 içinde doğrulanabilirse** üst sınır `3,90 × 1,02 = 3,978 A` olur. %2, XL4015 modülünün garanti edilmiş özelliği değildir; kabul bütçesidir. Ölçülen hata daha büyükse nominal ayar `4 / (1 + hata oranı)` değerinin altına indirilir. Modelde gerçek sapma `xlCcErrorPct`, kabul bütçesi `xlCcTolerancePct` ile ayrıdır; hatalı donanım gerçekte 4 A’yı aşabilir, model bunu gizlice kırpmaz. Ölçülen akım >4 A ise yazılım OC_FAULT ile röleyi açar; bu 500 ms yazılım döngüsü fiziksel akım tavanının yerine geçmez.

Sony adaptör etiketi 19,5 V / 4,7 A = 91,65 W. 4 A × 12,6 V = 50,4 W hücre gücü; 0,05 Ω şönt + 0,035 Ω yol ve %90 verim varsayımıyla yaklaşık **57,5 W giriş / 2,95 A adaptör akımı** gerekir. Kontrol beslemesi için de pay kalır. Modülün sürekli akım, bobin/diyot/MOSFET sıcaklığı ve soğutması ayrıca doğrulanmalıdır. U6 buck 19,5 V’u 7,5 V’a indirip Uno Vin’i besler.

## INA219 ve şönt

| Parametre | Değer |
|---|---|
| U3 / R5 | INA219 + R050, 0,050 Ω, ≥2 W, %1 veya daha iyi |
| Şönt bağlantısı | High-side; VIN+ şarj kaynağı, VIN− paket tarafı; ayrı Kelvin sense uçları |
| 4 A şönt gerilimi / kaybı | 200 mV / 0,80 W |
| PGA aralığı | ±320 mV |
| Bus aralığı | 16 V seçimi; yonganın gerçek giriş sınırı 26 V |
| CurrentLSB | 200 µA/bit |
| CAL | `0,04096 / (0,0002 × 0,05) = 4096 = 0x1000` |
| Nominal ölçüm aralığı | ±6,4 A; akım yazmacı sınırı da denetlenir |
| Bus / şönt LSB | 4 mV / 10 µV |

Modülün **R100 direnci değiştirilir**. R100 ile 4 A, 400 mV üretir ve INA219 aralığı aşılır. Hazır kütüphanenin R100 kalibrasyonu kullanılırsa R050 akımı yarım okunabilir. Sadece şöntü değiştirmek yetmez: modül PCB yolları ve klemensleri de ≥4 A sürekli yük için doğrulanır. Donanım sürücüsü CAL yazmacını yazıp geri okumalı, veri hazır/taşma durumunu ve I²C zaman aşımını denetlemelidir. Model kayıt ölçeklerini, taşmayı, şönt/kazanç/ofset/bus hatasını ve bağlantı kaybını içerir; I²C bit zamanlamasını simüle etmez.

[TI INA219 veri sayfası](https://www.ti.com/lit/ds/symlink/ina219.pdf), kalibrasyon denklemi ve 0–26 V giriş sınırının kaynağıdır.

## Sıcaklık ve kontrol

Her hücrede TMP36 bulunur; CD4051 ile sırayla A0’dan okunur. Üç sensörün maksimumu sıcaklık azaltma/kesme için, minimumu soğuk kontrolü için kullanılır. Sensör çıkışlarında 100 kΩ pull-down, kopuk hattın boşa yüzmesini önler. Fiziksel firmware, çoklayıcı değişiminden sonra yerleşme süresi bırakmalı, ilk ADC örneğini atıp 16 örnek almalıdır. Sensör beslemeleri dekuple edilir; hücreye temas elektriksel olarak yalıtılır.

- BOOST/MAX için bütün ölçülen hücreler ≥12 °C ve üçlü ölçüm etkin olmalı. Aksi durumda bu istekler 1,4 A ile sınırlandırılır. 12 °C, katalogdaki 10 °C alt sınırına seçilmiş ölçüm payıdır; sensör toleransı ve temas gecikmesi fiziksel kabulde doğrulanır.
- En sıcak ölçüm >35 °C: akım kademeli azalır. ≥45 °C: kesilir; <30 °C: devam eder.
- En soğuk ölçüm <0 °C: şarj durur; bütün hücreler ≥3 °C olunca devam eder.
- Sensör/INA219 hatası, taşma veya aşırı akım: röle açık, arıza kilitli. Hız seçimi kilidi temizlemez; açık yeniden başlatma gerekir.
- Röle açılışta açık kalır; ilk geçerli ölçüm ve koruma kontrolünden önce akım akmaz.
- CC ve CV boyunca istenen akım sınırı uygulanır. <3,0 V hücreye 140 mA ön şarj; ölçülen hücre tavanı 4,20 V, paket CV 12,60 V.
- Bitiş: CV gerilim bölgesinde, **5 s zaman sabitli filtrelenmiş akım ≤140 mA**, ayrıca **5 s onay**. Bu filtre, PWM kuantalama çukurlarından erken bitişi önler. Toplam şarj zamanlayıcısı 240 dk.

Üretici standart akımı 1,4 A, maksimum akımı 4 A olarak verir; katalog maksimum akım için 10–50 °C koşulunu belirtir. [ASPİLSAN ürün kataloğu](https://www.aspilsan.com/wp-content/uploads/2025/11/ASPILSAN_Product-Catalog.pdf), [A28 veri sayfası](https://www.aspilsan.com/wp-content/uploads/2025/05/A28_Public_Datasheet_.pdf).

## Pin planı

| Uno pini | Bağlantı |
|---|---|
| A0 | CD4051 ortak çıkış; X0/X1/X2 = H1/H2/H3 TMP36 |
| A1 | H1+ hücre izleme |
| A2 | H2+ → eşlenmiş 10k/10k bölücü |
| A3 | 10k kullanıcı potu orta ucu; uçlar 5 V/GND |
| A4/A5 | SDA/SCL: INA219 + I²C LCD; adresler ayrı olmalı |
| D2/D3/D4 | CD4051 S0/S1/S2; INH, VSS ve VEE GND; VDD 5 V |
| D7 | Röle sürücüsü; NO, açılışta kapalı olmayan güç yolu |
| D9 | Timer1 10-bit PWM → R4/C1 → D1/R3 → FB |
| D10 | Buzzer |
| D11/D13 | Durum LED’leri |
| D12 | Mod/ayar butonu → GND, dahili pull-up |

LCD I²C’ye geçtiği için D2–D4 sıcaklık çoklayıcısına ayrılabilir. Eski ayrık LM358 ölçümü karşılaştırma seçeneğidir; 2,8 A yazılım tavanıyla kalır ve ana BOM’a dahil değildir. Şemadaki sıcaklık bağlantıları X0–X2 net etiketleriyle gösterilir; sensör çıkışları birbirine bağlanmaz.

Fiziksel arayüz hedefi: kısa basış modları/özel akımı seçer; A3 pot özel akımı ayarlar. Uzun basış süre ekranını açar; pot dakika, kısa basış onay. Tam fizik modeli Uno’ya sığdırılmak yerine ölçülmüş süre tabloları/SOC kestirimiyle ayrı firmware’e aktarılmalıdır.

## Süre seçimi

“En geç N dakika sonra bitsin”, mevcut durumdan kalan süreyi ifade eder. **31 aday akım**, canlı SOC, RC polarizasyonu, sıcaklık sensör gecikmeleri, PWM, BMS ve zamanlayıcı durumunun kopyasında denenir. Süreye yetişen en düşük akım seçilir. Hesap sırasında simülasyon durur; koşullar değişirse eski sonuç uygulanmaz. Hedef imkânsızsa ayar korunur. Soğukta BOOST/MAX SAFE akımına indiğinden MAX her koşulda en hızlı seçenek değildir; adayların süreleri ayrı ayrı denenir. Seçim SOC’u, geçen süreyi veya arıza durumunu sıfırlamaz. Tam belirlenen dakikaya kadar bekletme yapılmaz.

**[Güncel deney tablosu ve 132 koşulun özeti](CHARGE_RESULTS.md)** · [ham veri](charge-sweep.json) · [parametreler](charge-config.json) · [malzeme listesi](BOM.md) · [BOM CSV](bom-revb.csv).

## Doğrulama bulguları ve sınırlar

Birim/regresyon testleri INA219 kalibrasyonu, taşma, bağlantı/sensör arızası, ilk açılış, canlı hız değişimi, CV akım sınırı, bitiş filtresi, süre planlama ve CC toleransını kapsar. 50 ms fizik adımı 25 ms’ye düşürülerek MAX sonucu da karşılaştırılır. Tarama başlangıç SOC’u, sıcaklık, kapasite/direnç farkı, şönt/kazanç/ofset/bus sapmaları ve yanlış R100 senaryolarını içerir. Beklenen koruma duruşları başarılı şarj gibi sunulmaz.

**Paket tavanı tek hücreyi garanti etmez:** PWM kopuk ve yazılım OVP kapalı deneyinde, ayarlı 12,60 V tavana rağmen en yüksek hücre yaklaşık 4,213 V olur. Gerilim denetimi A1/A2 ve INA219 ölçümlerinin farkına dayanır; bus hatasını üçe bölüp hücre doğruluğu saymak yanlıştır. ADC referansı, bölücüler ve bus birlikte kalibre edilmeli; gerçek eşik payı toplam hata bütçesine göre belirlenmelidir. BMS 4,25 V eşiği normal CV hedefi değildir.

Hücre modeli 0,5C verisine kalibre edilmiştir; BOOST/MAX süreleri deneysel yüksek akım şarj eğrisine kalibrasyon içermez. Modülün anahtarlama ripple’ı/ısısı, temas direnci yaşlanması, sensör yapışma hatası, BMS kapalıyken ADC üzerinden kaçak/backfeed yolları ve adaptör geçici cevabı modellenmez. Bu yüzden prototipte yüksek akım, tüm hücre gerilimleri/sıcaklıkları, röle/PCB/şönt ısınması ve arızada kapanma ölçülmeden donanım doğrulanmış sayılmaz.

Güç bileşeni referansı: [XL4015](https://www.xlsemi.com/datasheet/XL4015-EN.pdf). Adaptör bilgisi kullanıcının IMG_4261.HEIC fotoğrafındaki etiketten alınmıştır.
