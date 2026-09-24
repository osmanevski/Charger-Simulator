/*
 * ASPİLSAN INR18650A28 hücre modeli
 * Kaynak: ASPİLSAN A28 Public Datasheet (2022), Bitirme Proje/Kaynaklar/
 *
 * Model: 1RC Thevenin eşdeğer devresi + toplu (lumped) termal model
 *
 *     R0        R1
 *  ──/\/\/──┬──/\/\/──┬──(+OCV(SOC))── terminal
 *           └───||────┘
 *               C1
 *
 * Tarayıcıda window.A28, Node'da module.exports olarak kullanılır.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.A28 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // --- Datasheet değerleri (değiştirmeyin; kaynak tablo) --------------------
  const DATASHEET = {
    capacityNominalAh: 2.8,     // 2800 mAh nominal
    capacityMinAh: 2.7,         // 2700 mAh minimum
    nominalV: 3.65,
    chargeEndV: 4.2,
    chargeCutoffA: 0.14,        // 140 mA
    stdChargeA: 1.4,            // 0.5C
    maxChargeA: 4.0,            // maks. sürekli şarj
    stdDischargeA: 0.56,
    maxDischargeA: 14.0,
    dischargeEndV: 2.5,
    acirMaxOhm: 0.020,          // ≤ 20 mΩ (1 kHz AC)
    chargeTempC: [0, 60],
    dischargeTempC: [-30, 60],
    massG: 44.5,
    diameterMm: 18.3,
    heightMm: 65,
  };

  // Datasheet "0.5C CC-CV Charge at 25°C" grafiğinden sayısallaştırılmış noktalar.
  // [dakika, hücre gerilimi V, akım A, kümülatif kapasite Ah]
  const DATASHEET_CHARGE_05C = [
    [1.3, 3.418, 1.40, 0.030], [7.4, 3.474, 1.40, 0.173], [13.5, 3.526, 1.40, 0.315],
    [19.5, 3.572, 1.40, 0.462], [25.6, 3.612, 1.40, 0.607], [31.7, 3.640, 1.40, 0.752],
    [37.8, 3.664, 1.40, 0.890], [43.9, 3.690, 1.40, 1.030], [50.0, 3.716, 1.40, 1.172],
    [56.1, 3.750, 1.40, 1.317], [62.2, 3.793, 1.40, 1.455], [68.3, 3.836, 1.40, 1.593],
    [74.4, 3.888, 1.40, 1.738], [80.5, 3.931, 1.40, 1.883], [86.5, 3.974, 1.40, 2.021],
    [92.6, 4.017, 1.40, 2.166], [98.7, 4.073, 1.40, 2.303], [104.8, 4.129, 1.40, 2.448],
    [110.9, 4.177, 1.40, 2.593], [114.5, 4.200, 1.40, 2.670], [117.0, 4.207, 1.04, 2.724],
    [120.0, 4.207, 0.70, 2.770], [123.1, 4.207, 0.45, 2.800], [126.1, 4.207, 0.29, 2.815],
    [129.2, 4.207, 0.19, 2.828], [131.0, 4.207, 0.14, 2.832],
  ];

  // Datasheet "C-rate Dependency of Discharge Performance" grafiği, 2.9 A (≈1C) eğrisi.
  // [çekilen kapasite Ah, hücre gerilimi V]; 25 °C, 0.5C CC-CV ile doldurulmuş hücre.
  const DATASHEET_DISCHARGE_29A = [
    [0.05, 4.078], [0.1, 4.034], [0.2, 3.989], [0.3, 3.966], [0.4, 3.938], [0.5, 3.911], [0.6, 3.877],
    [0.7, 3.843], [0.8, 3.81], [0.9, 3.776], [1.0, 3.737], [1.1, 3.709], [1.2, 3.676], [1.3, 3.642],
    [1.4, 3.603], [1.5, 3.575], [1.6, 3.547], [1.7, 3.519], [1.8, 3.502], [1.9, 3.48], [2.0, 3.457],
    [2.1, 3.441], [2.2, 3.407], [2.3, 3.379], [2.4, 3.351], [2.5, 3.306], [2.6, 3.251], [2.65, 3.217],
    [2.7, 3.15], [2.75, 3.032], [2.82, 2.5],
  ];

  // --- Model parametreleri (25 °C) ------------------------------------------
  // R0+R1 = 50 mΩ: datasheet CC eğrisindeki IR yükselmesi ve CV sönüm süresi
  // (1.4 A → 0.14 A ≈ 16.5 dk) ile tutarlı. ACIR ≤ 20 mΩ; DC direnç 18650
  // hücrelerde tipik olarak ACIR'ın ~1.5–2.5 katıdır.
  const PARAMS = {
    capacityAh: 2.83,   // grafikteki 0.5C şarj kapasitesi
    r0: 0.030,          // ohmik direnç
    r1: 0.020,          // polarizasyon direnci
    tau1: 45,           // R1·C1 zaman sabiti (s)
    cpJgK: 1.0,         // özgül ısı (J/g·K), 18650 için 0.9–1.1 tipik
    rthKW: 15,          // yüzey→ortam ısıl direnç (K/W); datasheet 1C deşarj ısınmasına (≈+6 K) kalibre.
                        // Kapalı kutu içindeki pakette daha yüksektir (arayüzden ayarlanır).
    rTempCoef: 0.025,   // direncin sıcaklıkla üstel değişimi (1/K): 0 °C'de ≈1.9×
  };

  // OCV(SOC) tablosu. Üst bölge datasheet CC eğrisinden:
  //   OCV ≈ V_terminal − I·(R0+R1), SOC = Q_şarj / Q_toplam
  // Alt uç (SOC < %2), 2.5 V deşarj kesmesine inilebilsin diye diz eğrisiyle uzatıldı.
  const OCV_TABLE = [
    [0.000, 2.500], [0.004, 2.900], [0.009, 3.100], [0.020, 3.300], [0.061, 3.404], [0.111, 3.456],
    [0.163, 3.502], [0.215, 3.542], [0.266, 3.570], [0.315, 3.594], [0.364, 3.620],
    [0.414, 3.646], [0.465, 3.680], [0.514, 3.723], [0.563, 3.766], [0.614, 3.818],
    [0.665, 3.861], [0.714, 3.904], [0.765, 3.947], [0.814, 4.003], [0.865, 4.059],
    [0.916, 4.107], [0.944, 4.132], [0.970, 4.160], [1.000, 4.193],
  ];

  function ocvFromSoc(soc) {
    const t = OCV_TABLE;
    // 2.5 V altı (SOC < 0): çok az kapasite, gerilim hızla çöker. Normalde BMS UVP buraya inilmesini engeller.
    if (soc <= t[0][0]) return Math.max(0, t[0][1] + (soc - t[0][0]) * 50);
    if (soc >= 1) {
      // Aşırı şarj bölgesi (SOC>1): gerilim hızla yükselir; koruma testleri için.
      return t[t.length - 1][1] + (soc - 1) * 3.0;
    }
    for (let i = 1; i < t.length; i++) {
      if (soc <= t[i][0]) {
        const [x0, y0] = t[i - 1], [x1, y1] = t[i];
        return y0 + (y1 - y0) * (soc - x0) / (x1 - x0);
      }
    }
    return t[t.length - 1][1];
  }

  function socFromOcv(v) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (ocvFromSoc(mid) < v) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Direncin sıcaklık bağımlılığı (basit üstel/Arrhenius yaklaşımı)
  function rScale(tempC, coef) {
    return Math.exp(coef * (25 - clamp(tempC, -30, 80)));
  }

  /**
   * Tek hücre. Akım işareti: + şarj, − deşarj.
   * opts: { soc, tempC, capacityScale, rScale (üretim sapması) }
   */
  class Cell {
    constructor(opts = {}) {
      const p = Object.assign({}, PARAMS, opts.params || {});
      if (opts.rthScale) p.rthKW *= opts.rthScale;             // ör. paketin ortasındaki hücre daha zor soğur
      this.ce = opts.ce ?? 1;                                    // şarjda coulomb verimi (yan reaksiyonlar)
      this.sdPctMonth = opts.sdPctMonth ?? 0;                    // kendi kendine boşalma, %/ay
      this.p = p;
      this.capacityAh = p.capacityAh * (opts.capacityScale ?? 1);
      this.rMismatch = opts.rScale ?? 1;
      this.soc = clamp(opts.soc ?? 0.25, 0, 1.05);
      this.vrc = 0;
      this.tempC = opts.tempC ?? 25;
      this.current = 0;
      this.heatW = 0;
    }
    get ocv() { return ocvFromSoc(this.soc); }
    get r0() { return this.p.r0 * this.rMismatch * rScale(this.tempC, this.p.rTempCoef); }
    get r1() { return this.p.r1 * this.rMismatch * rScale(this.tempC, this.p.rTempCoef); }
    /** Akım uygulanmadan önceki "açık devre + RC" gerilimi (akım çözümü için). */
    get vBehindR0() { return this.ocv + this.vrc; }
    terminalV(i = this.current) { return this.ocv + this.vrc + i * this.r0; }

    /** dt saniye boyunca i akımı uygula (bleed: balans direncinden çekilen akım). */
    /** Kendi kendine boşalmanın eşdeğer sürekli akımı (A). */
    get iSelfDischarge() { return this.sdPctMonth / 100 * this.capacityAh / (30 * 24); }
    step(i, dt, ambientC, bleedA = 0, extraHeatW = 0) {
      const iCell = i - bleedA;
      this.current = i;
      const iSoc = (iCell > 0 ? iCell * this.ce : iCell) - this.iSelfDischarge;
      this.soc = clamp(this.soc + iSoc * dt / 3600 / this.capacityAh, -0.045, 1.05);
      // RC dalı: dVrc/dt = (i·R1 − Vrc)/τ   → kesin ayrık çözüm
      const a = Math.exp(-dt / this.p.tau1);
      this.vrc = this.vrc * a + iCell * this.r1 * (1 - a);
      // Isı: ohmik + polarizasyon kaybı
      this.heatW = iCell * iCell * this.r0 + (this.vrc * this.vrc) / this.r1;
      const cth = DATASHEET.massG * this.p.cpJgK;           // J/K
      const tempTarget = ambientC + (this.heatW + extraHeatW) * this.p.rthKW;
      const tau = cth * this.p.rthKW;                         // s
      this.tempC += (tempTarget - this.tempC) * (1 - Math.exp(-dt / tau));
    }
  }

  /**
   * Tek hücre için ideal CC/CV şarj testi (datasheet koşulları). Doğrulama
   * sayfası ve Node testleri kullanır. Dönen dizi: {t (dk), v, i, q (Ah)}
   */
  function runReferenceCharge(opts = {}) {
    const iCC = opts.iCC ?? DATASHEET.stdChargeA;
    const vCV = opts.vCV ?? DATASHEET.chargeEndV;
    const iCut = opts.iCut ?? DATASHEET.chargeCutoffA;
    const dt = opts.dt ?? 1;
    const cell = new Cell({ soc: opts.soc0 ?? 0.02, tempC: 25 });
    const out = [];
    let t = 0, q = 0, i = 0;
    const r0 = () => cell.r0;
    while (t < 6 * 3600) {
      // CV sınırı: terminal = vBehindR0 + i·R0  →  i = (vCV − vBehindR0)/R0
      const iCV = (vCV - cell.vBehindR0) / r0();
      i = Math.min(iCC, iCV);
      if (i <= iCut && t > 60) break;
      cell.step(i, dt, 25);
      q += i * dt / 3600;
      t += dt;
      if (t % 30 === 0) out.push({ t: t / 60, v: cell.terminalV(i), i, q, T: cell.tempC });
    }
    out.push({ t: t / 60, v: cell.terminalV(i), i, q, T: cell.tempC, end: true });
    return out;
  }

  /** Tek hücre sabit akım deşarj testi. Dönen: {q (Ah), v} dizisi. */
  function runReferenceDischarge(opts = {}) {
    const iD = opts.i ?? DATASHEET.capacityNominalAh;   // 1C
    const dt = opts.dt ?? 1;
    const cell = new Cell({ soc: 1.0, tempC: opts.tempC ?? 25 });
    const out = [];
    let q = 0, t = 0;
    while (t < 20 * 3600) {
      cell.step(-iD, dt, opts.ambientC ?? 25);
      q += iD * dt / 3600; t += dt;
      const v = cell.terminalV(-iD);
      if (t % 20 === 0) out.push({ q, v, T: cell.tempC });
      if (v <= DATASHEET.dischargeEndV) { out.push({ q, v, T: cell.tempC, end: true }); break; }
    }
    return out;
  }

  return {
    DATASHEET, DATASHEET_CHARGE_05C, DATASHEET_DISCHARGE_29A, PARAMS, OCV_TABLE,
    ocvFromSoc, socFromOcv, rScale, Cell, runReferenceCharge, runReferenceDischarge, clamp,
  };
});
