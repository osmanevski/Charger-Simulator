'use strict';
const assert = require('node:assert/strict');
const CA = require('../assets/charger-a');
const P = require('../assets/charge-planner');
const make = () => { const s = P.restore(P.snapshot(new CA.SystemA(CA.presetFor('improved')))); s.fw.zeroI = null; s.measure(); return s; };
let checks = 0;
function test(name, run) { run(); checks++; console.log('✓ ' + name); }

test('Canlı CC mod değişimi SOC, süre ve zamanlayıcıyı korur; 2.8 A ulaşılır', () => {
  const s = make(); s.run(600);
  const before = [s.t, s.fw.chargeTime, ...s.cells.map(c => c.soc)];
  s.setChargeCurrent(2.8);
  assert.deepEqual([s.t, s.fw.chargeTime, ...s.cells.map(c => c.soc)], before);
  s.run(60); assert.ok(s.hw.iPack > 2.7 && s.hw.iPack < 2.9);
  s.setChargeCurrent(1); s.run(30); assert.ok(s.hw.iPack > .9 && s.hw.iPack < 1.1);
});
test('CV içinde hız düşürme akımı sınırlar ve erken bitişe yol açmaz', () => {
  // Hücre tavanını düşürerek CV'yi henüz yüksek akımdayken tetikle.
  const s = make(); s.cfg.cellLimitV = 4.1; s.setChargeCurrent(2.8);
  while (s.fw.state === 'CC_MODE' && s.t < 10000) s.step(.05);
  assert.equal(s.fw.state, 'CV_MODE'); assert.ok(s.hw.iPack > 1.5);
  s.setChargeCurrent(1); s.run(30);
  assert.ok(s.hw.iPack <= 1.08); assert.notEqual(s.fw.state, 'CHARGE_DONE');
  s.runUntilDone(); assert.equal(s.fw.state, 'CHARGE_DONE'); assert.ok(s.stats.maxCellV <= 4.21);
});
test('Seçim sınırları ve kilitli arıza korunur', () => {
  const s = make(); s.fw.state = 'OV_FAULT'; s.hw.relay = false;
  assert.equal(s.setChargeCurrent(5), 4); assert.equal(s.setChargeCurrent(.1), 1);
  assert.throws(() => s.setChargeCurrent(NaN), RangeError);
  s.run(10); assert.equal(s.fw.state, 'OV_FAULT'); assert.equal(s.hw.iPack, 0);
});
test('CV sırasında termal akım sınırı da geçerlidir', () => {
  const s = make(); s.setChargeCurrent(2.8); s.run(120);
  s.fw.state = 'CV_MODE'; s.fw.meas.t = 43; s.fw.meas.i = 2.8;
  s.fw.meas.v = 11; s.fw.meas.cells = [3.6, 3.6, 3.8];
  const before = s.fw.dutyF; s.firmwareTick();
  assert.ok(s.fw.dutyF > before); assert.ok(s.ccTarget() < .6);
});
const s = make(); s.run(900); const snapshot = P.snapshot(s);
test('Tahmin canlı durumu değiştirmez ve aynı girdide tekrarlanır', () => {
  const first = P.forecastSync(snapshot, 2.1), second = P.forecastSync(snapshot, 2.1);
  assert.deepEqual(first, second); assert.deepEqual(P.snapshot(s), snapshot);
  const actual = P.restore(snapshot); actual.setChargeCurrent(2.1);
  while (actual.fw.state !== 'CHARGE_DONE' && actual.t < 18000) actual.step(.05);
  assert.equal(first.minutes, (actual.t - snapshot.t) / 60);
});
const rows = P.CURRENTS.map(amps => P.forecastSync(snapshot, amps));
test('31 akım seçeneği tamamlar; bitiş SOC farkı yavaş moda göre 0.5 yüzde puan içinde', () => {
  // Kesme ölçütü %100 SOC değil, CV + filtreli 140 mA; PWM/ADC kuantalaması bitişi küçük miktarda değiştirir.
  for (const r of rows) { assert.notEqual(r.minutes, null); assert.ok(r.peakV <= 4.21); assert.ok(Math.min(...r.finalSoc) >= Math.min(...rows[0].finalSoc) - .005); }
  assert.ok(rows.at(-1).minutes < rows[0].minutes);
});
test('Süre hedefi en düşük uygun akımı seçer; imkânsız süre uygulanmaz', () => {
  const chosen = P.chooseDeadline(rows, 90); assert.ok(chosen && chosen.minutes <= 90);
  assert.ok(rows.filter(r => r.amps < chosen.amps).every(r => r.minutes > 90));
  assert.equal(P.chooseDeadline(rows, 1), null); assert.equal(P.chooseDeadline(rows, NaN), null);
  assert.equal(P.chooseDeadline(rows, 300).amps, 1);
});
test('Kesik güç, sıcak/soğuk, bitmiş şarj ve zaman aşımı doğru raporlanır', () => {
  for (const condition of ['off', 'cold', 'hot', 'timeout', 'short', 'fuse']) {
    const z = make();
    if (condition === 'off') z.requestMode('REST');
    if (condition === 'cold') { z.cfg.ambientC = -5; z.reset(); }
    if (condition === 'hot') { z.cfg.ambientC = 45; z.reset(); }
    if (condition === 'timeout') z.fw.chargeTime = z.cfg.safetyTimerMin * 60;
    if (condition === 'short') z.bms.shortTrip = true;
    if (condition === 'fuse') z.hw.fuseBlown = true;
    assert.equal(P.forecastSync(P.snapshot(z), 2.8).minutes, null, condition);
  }
  const z = make(); z.fw.state = 'CHARGE_DONE';
  assert.equal(P.forecastSync(P.snapshot(z), 2.8).minutes, 0);
});
test('Dengesiz pakette süre tahmini tam doluluk iddia etmez', () => {
  const c = CA.presetFor('improved'); [.4, .25, .18].forEach((v, i) => c.cells[i].soc = v);
  const r = P.forecastSync(P.snapshot(new CA.SystemA(c)), 2.8);
  assert.notEqual(r.minutes, null); assert.equal(r.balanced, false);
});
test('Adaptörün akım kapasitesi güç katını sınırlar', () => {
  const z = make(); z.cfg.adapterMaxA = .5; z.setChargeCurrent(2.8); z.run(120);
  assert.ok(z.hw.vOut * z.hw.iCharge <= z.cfg.adapterV * .5 * z.cfg.converterEfficiency + .01);
});
console.log(`${checks} şarj planlama testi geçti.`);
