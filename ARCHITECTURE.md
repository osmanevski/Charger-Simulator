# Mimari Notları

## 1. Katmanlar

```
a28-model.js    Cell sınıfı: step(i, dt, ortam, bleed, ekIsı) → SOC, Vrc, sıcaklık
      ▲
charger-a.js    SystemA: step(dt) = PWM/RC → güç katı akım çözümü → BMS → hücreler
      ▲                  → (her 0.5 s) measure() → firmwareTick()
scenarios-a.js  SCENARIOS / ABLATIONS / runScenario()
      ▲
schematic.js + bench.js (index.html), dogrulama.html, tests/run-tests.js
```

Fizik adımı 50 ms. Firmware döngüsü `loopS` (500 ms) aralıklarla çalışır. RC dalı ve termal model kesin üstel ayrıklaştırma kullanır, bu yüzden büyük adımlarda da kararlıdır.

## 2. Tasarım A

### Akım çözümü (`solveCurrent`)

```
vb  = Σ (OCV + Vrc)          hücrelerin R0 arkasındaki gerilim
rc  = Σ R0                   rext = R_hat + R_şönt
i   = min( (Vset − vb)/(rext+rc),          XL4015 CV
           (Vin−0.4 − vb)/(rext+rc+0.15),  düşüm sınırı
           I_CCpot )                        XL4015 CC
i   ≥ 0 (asenkron buck akım çekemez)
```

### XL4015 kontrol yöntemleri

- `injection` (önerilen): CV potu Vtavan'da kalır. `Vset = Vtavan − k·max(0, Vpwm − Vd − Vref)`. Firmware gerilimi yalnızca **düşürebilir**, dolayısıyla donanım tavanı her durumda korunur.
- `direct-fb` (rapordaki): pot sökülü olduğu için Vout'tan FB'ye geri besleme yok. `Vpwm < 1.25 V` ise çıkış tam açık, aksi halde kapalı.

### Firmware durum makinesi

```
CC_MODE ──(ölçülen V ≥ Vcv  veya  hücre ≥ 4.20 V)──► CV_MODE ──(I ≤ Icut, onay süresi)──► CHARGE_DONE
Her durumda öncelik: SENSOR_FAULT > TEMP_FAULT (≥45 °C, <30 °C'de döner) > LOW_TEMP (<0 °C, ≥3 °C'de döner) > TIMEOUT
```

Kontrol: tamsayı PWM üzerinde integral (artımlı) kontrolcü. `duty ↑ ⇒ Vout ↓`.

### Profiller

`charger-a.js` içinde `HARDWARE_REPORT / HARDWARE_IMPROVED` ve `FIRMWARE_REPORT / FIRMWARE_IMPROVED` tanımlıdır. `presetFor('report' | 'improved')` bunları birleştirir. Her alan arayüzden tek tek değiştirilebilir.

### Yeni senaryo eklemek

`assets/scenarios-a.js` → `SCENARIOS` dizisine `{id, name, desc, apply(cfg), at?, inject?(sys), judge(r, sys)}` eklenir. Doğrulama sayfası ve testler senaryoyu otomatik olarak alır.

---

## 2b. Alternatif mimari (`reconfig-model.js`)

- Anahtarlar ideal değil: her biri `rds` dirençli sırt sırta MOSFET çifti. Modlar `MODE_GATES` tablosunda (PAR, PAR_IDLE, SER, PRE, MEAS, DEAD).
- Mod değişimi daima `DEAD → MEAS → (PAR | PRE | SER)` üzerinden: önce hepsi kapanır, hücreler tek tek ölçülür, ΔV'ye göre karar verilir.
- `transition()` her geçişte sürücü zamanlamasını hesaplar: PV sürücüde `tOn ≈ Qg·Vgs/Isc` (30 nC, 15 µA → ≈ 2 ms), `tOff` ≈ 100 µs. Eski grup kapanmadan yeni grup Vth'yi geçerse `SHOOT_THROUGH` (≈ 85 A). Kilitleme açıksa yeni grubun açılması `tOff + hwDelay`'e ertelenir.
- `gateInfo()` her anahtarın o moddaki source gerilimini bulur; `direct` sürücüde Vgs = 5 V − Vs < `vgsFull` olursa `GATE_DRIVE` arızası.

## 3. Arayüz

- `schematic.js` şemayı tek bir SVG olarak üretir. Rev'e özgü parçalar `data-rev="A"` / `data-rev="B"` ile işaretlidir; kök elemandaki `.revA` / `.revB` sınıfı görünürlüğü belirler. Canlı değerler id'li `<text>` düğümlerine yazılır. Revizyon listesi (`REVISIONS`) hem bulutları hem antetteki tabloyu besler; bölge kodu (ör. B3) koordinattan hesaplanır.
- `bench.js` simülasyonu `requestAnimationFrame` içinde gerçek zaman × hız kadar ilerletir. Grafikler, denetçi ve Arduino paneli ~300 ms'de bir yenilenir.
- Tasarım B (MOSFET ile yeniden yapılandırılabilir paket) bu sürümden çıkarıldı; `../Arsiv/` altında duruyor.

## 4. Sonraki adımlar

1. Gerçek BMS kartının eşiklerini (OVP/UVP/balans) kartın datasheet'inden girmek.
2. Prototip kurulduğunda ölçülen şarj eğrisini `DATASHEET_CHARGE_05C` biçiminde ekleyip modelle karşılaştırmak.
3. Firmware'i `firmware/` altında yazmak ve eşikleri `FIRMWARE_IMPROVED` ile ortak bir başlık dosyasından üretmek.
4. Web Serial ile gerçek Arduino telemetrisini aynı grafiklere bağlamak.
