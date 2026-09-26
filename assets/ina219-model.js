/* TI INA219: shunt/bus conversion and current-register calibration.
 * Not an I2C timing emulator. The controller reads a completed conversion every 500 ms. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.INA219Model = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SHUNT_LSB = 10e-6, BUS_LSB = .004;
  function calibration(c) {
    const raw = .04096 / (c.inaCurrentLsbA * c.inaCalShuntR);
    return Number.isFinite(raw) && raw >= 2 && raw <= 65535 ? Math.floor(raw + 1e-9) & 0xfffe : 0;
  }
  function shuntResistance(c) { return c.inaShuntR * (1 + c.inaShuntErrPct / 100); }
  function range(c) {
    const cal = calibration(c);
    return cal ? Math.min(c.inaShuntRangeV / c.inaCalShuntR, 32767 * c.inaCurrentLsbA) : 0;
  }
  function read(c, currentA, busV) {
    const cal = calibration(c), r = shuntResistance(c);
    const shuntV = currentA * r * (1 + c.inaGainErrPct / 100) + c.inaOffsetUv * 1e-6;
    const busMeasured = busV * (1 + c.inaBusErrPct / 100);
    const validConfig = cal > 0 && r > 0 && Number.isFinite(shuntV) && Number.isFinite(busMeasured) &&
      [.04, .08, .16, .32].includes(c.inaShuntRangeV) && [16, 32].includes(c.inaBusRangeV);
    const limit = validConfig ? c.inaShuntRangeV : .32;
    const shuntRegister = Math.max(-32768, Math.min(32767, Math.round(Math.max(-limit, Math.min(limit, shuntV)) / SHUNT_LSB)));
    const currentRaw = Math.trunc(shuntRegister * cal / 4096);
    const overflow = Math.abs(shuntV) > limit || currentRaw > 32767 || currentRaw < -32768 || busMeasured >= c.inaBusRangeV;
    const commonModeInvalid = Math.min(busV, busV + currentA * r) < 0 || Math.max(busV, busV + currentA * r) > 26;
    const currentRegister = Math.max(-32768, Math.min(32767, currentRaw));
    const voltage = Math.round(Math.max(0, Math.min(c.inaBusRangeV, busMeasured)) / BUS_LSB) * BUS_LSB;
    const reason = !c.inaConnected ? 'INA219 yanıt vermiyor' : !validConfig ? 'INA219 kalibrasyonu/ayarları geçersiz'
      : commonModeInvalid ? 'INA219 0–26 V giriş sınırı aşıldı' : overflow ? 'INA219 ölçüm aralığı aşıldı' : null;
    return { valid: reason == null, reason, overflow, calibration: cal, shuntV: shuntRegister * SHUNT_LSB,
      currentRegister, voltage, current: currentRegister * c.inaCurrentLsbA, rangeA: range(c) };
  }
  return { calibration, shuntResistance, range, read, SHUNT_LSB, BUS_LSB };
});
