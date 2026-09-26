'use strict';
const assert = require('node:assert/strict');
const CA = require('../assets/charger-a'), P = require('../assets/charge-planner');
const INA = CA.INA219;
let checks = 0;
const make = (patch = {}) => {
  const c = Object.assign(CA.presetFor('improved'), patch);
  const s = P.restore(P.snapshot(new CA.SystemA(c))); s.measure(); return s;
};
const test = (name, run) => { run(); checks++; console.log('✓ ' + name); };
test('R050: CAL 4096, ±6.4 A range, 4 A = 200 mV = 0.8 W', () => {
  const s = make({ inaGainErrPct: 0, inaBusErrPct: 0 }), c = s.cfg;
  assert.equal(INA.calibration(c), 4096); assert.ok(Math.abs(INA.range(c) - 6.4) < 1e-10);
  const r = INA.read(c, 4, 12.6);
  assert.equal(r.valid, true); assert.equal(r.current, 4); assert.ok(Math.abs(r.shuntV - .2) < 1e-10);
  assert.equal(r.voltage, 12.6); assert.equal(16 * s.rShunt(), .8);
  assert.equal(INA.read(c, -4, 12.6).current, -4);
});
test('Offset, physical resistor tolerance and CAL affect the reported current', () => {
  const c = make({ inaGainErrPct: 0, inaShuntErrPct: 1, inaOffsetUv: 100 }).cfg;
  assert.ok(Math.abs(INA.read(c, 4, 12).current - 4.042) < .0003);
  c.inaShuntErrPct = 0; c.inaOffsetUv = 0; c.inaCalShuntR = .1;
  assert.equal(INA.read(c, 4, 12).current, 2); // wrong library calibration silently underreads
});
test('R100, PGA limit, current register overflow and 26 V input are detected', () => {
  const c = make({ inaGainErrPct: 0 }).cfg;
  assert.equal(INA.read({ ...c, inaShuntR: .1, inaCalShuntR: .1 }, 4, 12).valid, false);
  assert.equal(INA.read({ ...c, inaShuntRangeV: .16 }, 4, 12).overflow, true);
  assert.equal(INA.read({ ...c, inaCurrentLsbA: .0001 }, 4, 12).overflow, true);
  assert.equal(INA.read({ ...c, inaBusRangeV: 32 }, 1, 26).valid, false);
  assert.equal(INA.read({ ...c, inaCalShuntR: 0 }, 1, 12).valid, false);
  assert.equal(INA.read(c, NaN, 12).valid, false);
  assert.equal(INA.read(c, -4, .1).valid, false);
});
test('Invalid sensor at boot cannot energize the relay', () => {
  for (const patch of [{ inaConnected: false }, { inaCalShuntR: 0 }, { tempSensorFaultIndex: 0 }]) {
    const s = make(patch); assert.equal(s.hw.relay, false); s.setChargeCurrent(4); s.run(3);
    assert.equal(s.fw.state, 'SENSOR_FAULT'); assert.equal(s.stats.peakChargeA, 0);
  }
});
test('Overflow during charge latches off and cannot masquerade as completion', () => {
  const s = make(); s.setChargeCurrent(4); s.run(60); assert.ok(s.hw.iCharge > 3.8);
  s.cfg.inaShuntRangeV = .16; s.run(2);
  assert.equal(s.fw.state, 'SENSOR_FAULT'); assert.equal(s.hw.iCharge, 0);
  s.cfg.inaShuntRangeV = .32; s.setChargeCurrent(1); s.run(5);
  assert.equal(s.fw.state, 'SENSOR_FAULT'); assert.equal(s.stats.doneAt, null);
});
test('MAX nominal ceiling is 3.90 A; +2% accepted upper bound is 3.978 A', () => {
  for (const error of [0, 2]) {
    const s = make({ xlCcErrorPct: error }); s.setChargeCurrent(4); s.run(180);
    const bound = 3.9 * (1 + error / 100);
    assert.ok(s.hw.iCharge > 3.8); assert.ok(s.stats.peakChargeA <= bound + 1e-10);
    assert.ok(s.stats.peakChargeA < 4); assert.ok(s.stats.maxShuntW < .8);
  }
});
test('Out-of-budget hardware error is not silently clipped; measured OC latches', () => {
  const s = make({ xlCcErrorPct: 10, pwmBroken: true }); s.setChargeCurrent(4); s.run(5);
  assert.ok(s.stats.peakChargeA > 4); assert.equal(s.fw.state, 'OC_FAULT'); assert.equal(s.hw.iCharge, 0);
  s.setChargeCurrent(1); s.run(5); assert.equal(s.fw.state, 'OC_FAULT');
});
test('Every cell temperature participates in high-rate, hot and cold protection', () => {
  for (let i = 0; i < 3; i++) {
    const s = make(); s.setChargeCurrent(4); s.fw.sensorTs[i] = 10; s.measure();
    assert.equal(s.ccTarget(), 1.4);
    s.fw.sensorTs[i] = -5; s.measure(); s.firmwareTick(); assert.equal(s.fw.state, 'LOW_TEMP');
    s.fw.sensorTs[i] = 46; s.measure(); s.firmwareTick(); assert.equal(s.fw.state, 'TEMP_FAULT');
    const q = make(); q.setChargeCurrent(4); q.fw.sensorTs[i] = 40; q.measure();
    assert.ok(q.ccTarget() < 2.1 && q.ccTarget() > 1.5);
    q.cfg.tempSensorFaultIndex = i; q.run(1); assert.equal(q.fw.state, 'SENSOR_FAULT');
  }
  const s = make({ tempMux: false }); s.setChargeCurrent(4); assert.equal(s.ccTarget(), 1.4);
});
test('Legacy discrete path retains its 2.8 A software limit', () => {
  const s = make({ isense: 'discrete', tempMux: false }); s.setChargeCurrent(4); assert.equal(s.ccTarget(), 2.8);
});
test('Six mode definitions and 31 candidates share one source', () => {
  assert.deepEqual(P.MODES.map(x => x.amps), [1, 1.4, 2.1, 2.8, 3.5, 4]);
  assert.equal(P.CURRENTS.length, 31); assert.equal(P.CURRENTS.at(-1), 4);
});
test('CV current trough cannot terminate before filtered current decays', () => {
  const s = make(); s.run(60); s.fw.state = 'CV_MODE'; s.fw.meas.i = .05;
  s.fw.meas.v = 12.59; s.fw.meas.cells = [4.195, 4.195, 4.20]; s.fw.cutCurrent = .3;
  for (let i = 0; i < 20; i++) s.firmwareTick();
  assert.equal(s.fw.state, 'CV_MODE'); assert.equal(s.fw.doneTimer, 0);
  s.fw.cutCurrent = .10; s.fw.meas.v = 12; s.fw.meas.cells = [4, 4, 4];
  for (let i = 0; i < 20; i++) s.firmwareTick();
  assert.equal(s.fw.state, 'CV_MODE');
});
test('MAX result converges when physics step is halved', () => {
  const results = [.05, .025].map(dt => {
    const s = make(); s.setChargeCurrent(4);
    while (s.t < 10000 && s.fw.state !== 'CHARGE_DONE') s.step(dt);
    assert.equal(s.fw.state, 'CHARGE_DONE'); return { minutes: s.t / 60, soc: s.cells.map(c => c.soc), peak: s.stats.peakChargeA };
  });
  assert.ok(Math.abs(results[0].minutes - results[1].minutes) < 1);
  assert.ok(results.every(r => r.peak <= 3.9 && Math.min(...r.soc) >= .97));
  console.log('  dt 50/25 ms:', results.map(r => r.minutes.toFixed(2)).join(' / '), 'min');
});
console.log(`${checks} INA219 / high-current tests passed.`);
