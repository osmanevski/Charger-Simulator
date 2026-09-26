// node tests/sweep-charge.js > docs/charge-sweep.json
'use strict';
const CA = require('../assets/charger-a'), P = require('../assets/charge-planner');
const results = [];
function sweep(name, soc, temp, modify = () => {}) {
  const c = CA.presetFor('improved');
  c.cells.forEach(x => x.soc = soc); c.ambientC = temp; modify(c);
  const initial = P.restore(P.snapshot(new CA.SystemA(c)));
  initial.fw.zeroI = null; initial.measure(); // başlangıç ADC ölçümünü de sabit tohumla üret
  const data = P.snapshot(initial);
  for (const { amps } of P.MODES) results.push({ scenario: name, startSoc: soc, ambientC: temp, ...P.forecastSync(data, amps) });
}
for (const temp of [10, 25, 35]) for (const soc of [.01, .2, .5]) sweep('balanced', soc, temp);
sweep('aged', .2, 25, c => { c.cells[2].capacityScale = .85; c.cells[2].rScale = 1.4; });
sweep('imbalance', .2, 25, c => [.4, .25, .18].forEach((v, i) => c.cells[i].soc = v));
sweep('hot', .2, 38, c => c.extraHeatW = 1.2);
sweep('cold-5', .2, 5);
sweep('cold-inhibit', .2, -5);
sweep('high-rate-boundary', .2, 12);
sweep('hot-inhibit', .2, 45);
sweep('cc-upper-budget', .2, 25, c => c.xlCcErrorPct = 2);
sweep('sense-underread', .2, 25, c => Object.assign(c, {inaShuntErrPct: -1, inaGainErrPct: -.5, inaOffsetUv: -100}));
sweep('sense-overread', .2, 25, c => Object.assign(c, {inaShuntErrPct: 1, inaGainErrPct: .5, inaOffsetUv: 100}));
sweep('bus-underread', .2, 25, c => c.inaBusErrPct = -.5);
sweep('wrong-r100', .2, 25, c => Object.assign(c, {inaShuntR: .1, inaCalShuntR: .1}));
sweep('ina-disconnected', .2, 25, c => c.inaConnected = false);
const violations = results.filter(r => r.peakChargeA > 4.000001 ||
  (r.scenario === 'balanced' && (r.peakV > 4.21 || r.minutes == null)) ||
  (['cold-inhibit', 'hot-inhibit', 'ina-disconnected'].includes(r.scenario) && r.minutes != null));
console.log(JSON.stringify({ conditions: '19.5 V / 4.7 A; nominal CC ceiling 3.90 A, +2% budget 3.978 A; INA219 R050/CAL4096; 3 TMP36; dt 0.05 s; 16-sample ADC, seeded noise; realistic cell spread; measured CV/cell/thermal limits enabled',
  count: results.length, violations: violations.length, results }, null, 2));
if (violations.length) { console.error('Sweep violations', violations); process.exitCode = 1; }
