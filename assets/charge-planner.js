/* Şarj süresi: canlı fizik/firmware durumunun kopyasını aynı 50 ms modelde ilerletir.
 * SOC'den basit Ah/I hesabı yapmaz; CV, ısı, balans ve mevcut zamanlayıcı dahildir.
 * Tarayıcı generator'ı dilimleyerek çalıştırır: file:// dahil worker gerektirmez. */
(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./charger-a.js') : root.ChargerA);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChargePlanner = api;
})(typeof self !== 'undefined' ? self : this, function (CA) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const CURRENTS = Array.from({ length: 31 }, (_, k) => (10 + k) / 10);
  const MODES = CA.CHARGE_MODES;
  const faults = /^(OV_FAULT|OC_FAULT|SENSOR_FAULT|TIMEOUT)$/;

  function snapshot(s) {
    return copy({ cfg: s.cfg, cells: s.cells, hw: s.hw, bms: s.bms, fw: s.fw, stats: s.stats, t: s.t });
  }
  function restore(data) {
    const d = copy(data), s = new CA.SystemA(d.cfg);
    s.cells.forEach((cell, i) => Object.assign(cell, d.cells[i]));
    for (const key of ['hw', 'bms', 'fw', 'stats', 't']) s[key] = d[key];
    // ADC gürültüsü, 16 örnek ortalamasında alt-LSB çözünürlük sağlar.
    // Gürültüyü kaldırmak modeli değiştirir; yalnız PRNG'yi yerel/sabit tohumlu yap.
    let seed = 4261;
    s.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    s.history = []; s.events = []; s.record = () => {}; s.log = () => {};
    return s;
  }
  function* forecast(data, amps) {
    const s = restore(data), start = s.t;
    s.setChargeCurrent(amps);
    let reason = null;
    if (!s.cfg.adapterOn || s.cfg.loadA > 0) reason = 'Şarj et modunu seçin';
    else if (s.hw.fuseBlown || s.bms.shortTrip) reason = 'Güç yolu kesik';
    else if (faults.test(s.fw.state)) reason = s.fw.state;
    let peakTemp = Math.max(...s.cells.map(c => c.tempC)), peakV = 0, steps = 0;
    while (!reason && s.fw.state !== 'CHARGE_DONE' && s.t - start < 5 * 3600) {
      s.step(0.05);
      peakTemp = Math.max(peakTemp, ...s.cells.map(c => c.tempC));
      peakV = Math.max(peakV, ...s.cells.map(c => c.terminalV(s.hw.iPack)));
      if (faults.test(s.fw.state)) reason = s.fw.state;
      if (s.fw.state === 'LOW_TEMP' && s.cfg.ambientC < 3) reason = 'Soğuk: şarj bekliyor';
      if (s.fw.state === 'TEMP_FAULT' && s.cfg.ambientC >= s.cfg.tResume) reason = 'Sıcaklık koruması: bekliyor';
      if (++steps % 4096 === 0) yield { amps, elapsedMin: (s.t - start) / 60 };
    }
    const done = !reason && s.fw.state === 'CHARGE_DONE';
    const soc = s.cells.map(c => c.soc);
    return { amps, minutes: done ? (s.t - start) / 60 : null, reason: reason || (done ? null : '5 saatte tamamlanmıyor'),
      peakTemp, peakV, peakChargeA: s.stats.peakChargeA, maxShuntW: s.stats.maxShuntW,
      finalSoc: soc, balanced: Math.min(...soc) >= .97, state: s.fw.state };
  }
  function forecastSync(data, amps) {
    const g = forecast(data, amps); let r;
    do { r = g.next(); } while (!r.done);
    return r.value;
  }
  // "En geç N dakika": süreyi sağlayan en düşük akım; imkânsız süre otomatik uygulanmaz.
  function chooseDeadline(results, minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return results.filter(r => r.minutes != null && r.minutes <= minutes)
      .sort((a, b) => a.amps - b.amps)[0] || null;
  }
  return { CURRENTS, MODES, snapshot, restore, forecast, forecastSync, chooseDeadline };
});
