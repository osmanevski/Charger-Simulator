#!/usr/bin/env node
/*
 * Model ve Tasarım A regresyon testleri.  Çalıştırma:  node tests/run-tests.js
 * Rastgelelik: ADC gürültüsü Math.random kullanır; eşikler bunu tolere edecek genişlikte.
 */
'use strict';
const A28 = require('../assets/a28-model.js');
const { SCENARIOS, ABLATIONS, runScenario } = require('../assets/scenarios-a.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { fail++; console.log(`  ✕ ${name}${detail ? '  (' + detail + ')' : ''}`); }
}

console.log('\n1) Hücre modeli ↔ ASPİLSAN A28 datasheet (0.5C CC/CV, 25 °C)');
const ref = A28.runReferenceCharge({ soc0: 0.015 });
const cvStart = ref.find(p => p.i < 1.399).t, end = ref[ref.length - 1];
let se = 0; A28.DATASHEET_CHARGE_05C.forEach(([t, v]) => {
  const p = ref.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a); se += (p.v - v) ** 2; });
const rmse = Math.sqrt(se / A28.DATASHEET_CHARGE_05C.length) * 1000;
check('Gerilim RMSE ≤ 15 mV', rmse <= 15, `${rmse.toFixed(1)} mV`);
check('CV geçişi 114.5 ± 4 dk', Math.abs(cvStart - 114.5) <= 4, `${cvStart.toFixed(1)} dk`);
check('Şarj bitişi 131 ± 4 dk', Math.abs(end.t - 131) <= 4, `${end.t.toFixed(1)} dk`);
check('Şarj kapasitesi 2.83 ± 0.08 Ah', Math.abs(end.q - 2.83) <= 0.08, `${end.q.toFixed(3)} Ah`);
const d1 = A28.runReferenceDischarge({ i: 2.8 });
check('1C deşarj kapasitesi ≥ 2.70 Ah (datasheet min.)', d1[d1.length - 1].q >= 2.7, `${d1[d1.length - 1].q.toFixed(3)} Ah`);
const d29 = A28.runReferenceDischarge({ i: 2.9 });
const dT = d29[d29.length - 1].T - 25;
check('2.9 A deşarj sonu ısınma 3–9 K (datasheet ≈ 6 K)', dT >= 3 && dT <= 9, `${dT.toFixed(1)} K`);

console.log('\n2) Önerilen tasarım — senaryolar');
const res = {};
for (const sc of SCENARIOS) {
  const { r, verdict } = runScenario(sc, 'improved');
  res[sc.id] = r;
  check(`${sc.name}: ${verdict.note}`, verdict.level !== 'bad');
}
// INA219/R050 varsayılanı: +%0.3 bus/ADC hatası ve 140 mA filtreli bitiş; süre model/kalibrasyon koşuluna bağlı.
check('Normal şarj R050/INA219 ile 95–120 dk', res.normal.doneMin > 95 && res.normal.doneMin < 120, `${res.normal.doneMin?.toFixed(1)} dk`);
check('Hiçbir senaryoda hücre > 4.21 V', Object.values(res).every(r => r.maxCellV <= 4.21),
  Object.entries(res).map(([k, r]) => `${k}:${r.maxCellV.toFixed(3)}`).join(' '));

console.log('\n3) Rapordaki tasarım — beklenen zafiyetler yeniden üretiliyor mu?');
const rep = id => runScenario(SCENARIOS.find(s => s.id === id), 'report').r;
const rn = rep('normal');
check('Normal şarj erken biter (SOC < %75)', rn.finalSoc[0] < 0.75, `SOC %${(rn.finalSoc[0] * 100).toFixed(1)}`);
check('Soğukta şarj engellenmez', rep('cold').chargedAh > 0.01);
check('TMP36 kopukluğu algılanmaz', rep('sensor').state !== 'SENSOR_FAULT');

console.log('\n3b) Deşarj');
const dis29 = A28.runReferenceDischarge({ i: 2.9 });
let sd = 0, nd = 0; A28.DATASHEET_DISCHARGE_29A.forEach(([q, v]) => { if (q > 2.6) return;
  const p = dis29.reduce((a, b) => Math.abs(b.q - q) < Math.abs(a.q - q) ? b : a); sd += (p.v - v) ** 2; nd++; });
const rmD = Math.sqrt(sd / nd) * 1000;
check('Hücre 2.9 A deşarj eğrisi RMSE ≤ 40 mV (0–2.6 Ah)', rmD <= 40, `${rmD.toFixed(1)} mV`);
check('Hücre 2.9 A deşarj kapasitesi 2.82 ± 0.1 Ah', Math.abs(dis29[dis29.length - 1].q - 2.82) <= 0.1, `${dis29[dis29.length - 1].q.toFixed(3)} Ah`);
const capB = runScenario(SCENARIOS.find(s => s.id === 'capacity'), 'improved').r;
const capA = runScenario(SCENARIOS.find(s => s.id === 'capacity'), 'report').r;
check('Rev B kapasite testi ≥ 2.6 Ah', capB.dischargedAh >= 2.6, `${capB.dischargedAh.toFixed(3)} Ah, ${capB.dischargedWh.toFixed(1)} Wh`);
check('Rev A kapasite testi < 2.0 Ah (erken biten şarj)', capA.dischargedAh < 2.0, `${capA.dischargedAh.toFixed(3)} Ah`);
check('Deşarj BMS UVP ile biter, hücre ≥ 2.45 V', capB.uvpTrips > 0 && capB.minCellV >= 2.45, `min ${capB.minCellV.toFixed(3)} V`);

console.log('\n4) Ablasyon — tek tek rapordaki kararlar');
const norm = SCENARIOS.find(s => s.id === 'normal');
const abl = id => { const a = ABLATIONS.find(x => x.id === id); return runScenario(norm, a.preset || 'improved', a.mod).r; };
const direct = runScenario(norm, 'improved', c => { ABLATIONS.find(x => x.id === 'direct').mod(c); c.swOvp = false; }).r;
check('Doğrudan FB (yazılım OVP kapalı): hücre 4.20 V\'u aşar', direct.maxCellV > 4.21, `${direct.maxCellV.toFixed(3)} V`);
const directSw = abl('direct');
check('Doğrudan FB + yazılım OVP: BMS eşiğine (4.25 V) varmadan kesilir, şarj yarıda kalır', directSw.state === 'OV_FAULT' && directSw.maxCellV < 4.24, `${directSw.state}, SOC %${(directSw.finalSoc[0] * 100).toFixed(0)}`);
const sh = abl('shunt');
check('1 Ω şönt: şarj ≥ 1.6× uzar veya zamanlayıcıya takılır', sh.state === 'TIMEOUT' || sh.doneMin > 1.6 * res.normal.doneMin,
  sh.state === 'TIMEOUT' ? '240 dk zamanlayıcı doldu' : `${sh.doneMin.toFixed(1)} dk`);
const imb = SCENARIOS.find(s => s.id === 'imbalance');
const nocell = runScenario(imb, 'improved', ABLATIONS.find(x => x.id === 'nocell').mod).r;
check('Hücre izleme yoksa dengesiz pakette BMS OVP devreye girer', nocell.ovpTrips > 0, `${nocell.ovpTrips} trip, ${nocell.state}`);

console.log('\n4b) PWM → FB arabirimi (XL4015 datasheet + TI SLVA861)');
const CA = require('../assets/charger-a.js');
const sB = new CA.SystemA(CA.presetFor('improved'));
const g = sB.injGain(), vmin = sB.ceilV() - g * (5 - sB.cfg.diodeV - 1.25);
check('Enjeksiyon kazancı R_üst/(R4+R3) filtre direncini içerir', Math.abs(g - sB.rTopEff() / 6100) < 1e-9, g.toFixed(3));
check('Ölçülüp ayarlanan tavan 12.60 V', Math.abs(sB.ceilV() - 12.6) < 1e-9, sB.ceilV().toFixed(3) + ' V');
const un = v => CA.ceilingOf({ ...sB.cfg, ceilTrim: false, vrefErrPct: v });
check('Ayarsız sabit dirençte tavan V_FB toleransıyla 12.37–12.88 V arasında kayar', un(-2) < 12.4 && un(2) > 12.85, `${un(-2).toFixed(2)}–${un(2).toFixed(2)} V`);
check('PWM ile çıkış ≤ 9 V\'a inebilir (derin deşarj ön şarjı)', vmin <= 9.0, `${vmin.toFixed(2)} V`);
sB.hw.vFilt = 0; check('PWM = 0 / pin boşta → çıkış = sabit bölücü tavanı (diyot tıkamada)', sB.converterSetpoint().vSet === sB.ceilV());
const ccRipple = db => { const c = CA.presetFor('improved'); c.ccDeadbandA = db; const s = new CA.SystemA(c);
  s.run(4200); const h = s.history.filter(x => x.t > 1200).map(x => x.ip); return Math.max(...h) - Math.min(...h); };
// R050 ile daha düşük seri direnç: bir 10-bit PWM adımı yaklaşık 42 mA; kabul 50 mA tepe-tepe.
const rip0 = ccRipple(0), rip2 = ccRipple(0.02);
check('CC ölü bandı (20 mA) PWM avlanmasını keser, akım dalgalanması azalır', rip2 < rip0 && rip2 < 0.05, `${(rip0 * 1000).toFixed(0)} → ${(rip2 * 1000).toFixed(0)} mA t-t`);
const brk = SCENARIOS.find(s => s.id === 'pwmBreak');
const bTrim = runScenario(brk, 'improved', c => { c.ceilTrim = true; c.swOvp = false; }).r;
check('PWM koptu, tavan ayarlı, yazılım OVP kapalı → paket tavanı tek hücre 4.20 V sınırını garanti etmez', bTrim.maxCellV > 4.205 && bTrim.maxCellV < 4.25, `maks. ${bTrim.maxCellV.toFixed(3)} V`);
const bRaw = runScenario(brk, 'improved', c => { c.swOvp = false; }).r;
check('PWM koptu, tavan ayarsız (+%2), yazılım OVP kapalı → BMS OVP\'ye kadar çıkar', bRaw.maxCellV >= 4.249, `maks. ${bRaw.maxCellV.toFixed(3)} V`);
const bSw = runScenario(brk, 'improved').r;
check('Aynı durumda yazılım OVP röleyi açar, hücre ≤ 4.21 V', bSw.state === 'OV_FAULT' && bSw.maxCellV <= 4.21, `${bSw.state}, maks. ${bSw.maxCellV.toFixed(3)} V`);
const worstA = CA.presetFor('report'); worstA.rBotA = 1000;
const wa = new CA.SystemA(worstA).runUntilDone(5);
check('Rev A, R_alt yerindeyse çıkış sürekli açık → hücre BMS OVP\'ye çıkar', wa.ovpTrips > 0 && wa.maxCellV >= 4.249, `maks. ${wa.maxCellV.toFixed(3)} V`);

console.log('\n4c) Ölçüm yöntemi: INA219 ↔ ayrık (0.1 Ω + op-amp + bölücü)');
const cap = SCENARIOS.find(s => s.id === 'capacity'), imbS = SCENARIOS.find(s => s.id === 'imbalance');
const dOk = runScenario(cap, 'improved', c => { c.isense = 'discrete'; }).r;
const iOk = runScenario(cap, 'improved', c => { c.isense = 'ina219'; c.lcdBus = 'i2c'; }).r;
check('Doğru yapılmış ayrık ölçüm INA219 ile aynı kapasiteyi verir (±%2)', Math.abs(dOk.dischargedAh / iOk.dischargedAh - 1) <= 0.02,
  `${dOk.dischargedAh.toFixed(3)} ↔ ${iOk.dischargedAh.toFixed(3)} Ah (en küçük hücre %97 → paket ≈ 2.74 Ah)`);
const dImb = runScenario(imbS, 'improved', c => { c.isense = 'discrete'; }).r;
check('Ayrık + kalibrasyon: dengesiz pakette hücre ≤ 4.21 V', dImb.maxCellV <= 4.21, `${dImb.maxCellV.toFixed(3)} V`);
const dNoCal = runScenario(imbS, 'improved', c => { c.isense = 'discrete'; c.vCal = false; c.vccCal = false; c.vccErrPct = 3; }).r;
check('Kalibrasyonsuz ayrık ölçüm (Vcc +%3): hücre uçları düşük okunur, hücre 4.20 V\'u aşar', dNoCal.maxCellV > 4.21, `${dNoCal.maxCellV.toFixed(3)} V`);

console.log('\n4d) BMS\'in etkisi: gerçekçi hücre dağılımıyla 30 çevrim');
const { cycleTest } = require('../assets/scenarios-a.js');
const cy = [...cycleTest({ bms: true, cycles: 30 })], cn = [...cycleTest({ bms: false, cycles: 30 })];
const lastY = cy[cy.length - 1], lastN = cn[cn.length - 1];
check('BMS var: hücreler arası fark 30 çevrimde < %1 kalır (balans)', lastY.spreadFull < 0.01, `%${(lastY.spreadFull * 100).toFixed(2)}`);
check('BMS yok: fark çevrimlerle büyür (30. çevrimde > %4)', lastN.spreadFull > 0.04, `%${(lastN.spreadFull * 100).toFixed(2)}`);
check('BMS yok: kullanılabilir enerji düşer (> %3)', lastN.usedWh < cn[0].usedWh * 0.97, `${cn[0].usedWh.toFixed(1)} → ${lastN.usedWh.toFixed(1)} Wh`);
check('BMS yok: paket düzeyindeki kesmeye rağmen zayıf hücre 2.5 V altına iner', cn.some(r => r.minCellV < 2.5) && cy.every(r => r.minCellV >= 2.5),
  `BMS yok en düşük ${Math.min(...cn.map(r => r.minCellV)).toFixed(2)} V · BMS var ${Math.min(...cy.map(r => r.minCellV)).toFixed(2)} V`);

console.log('\n5) Alternatif mimari — MOSFET matrisi (1S3P şarj / 3S1P kullanım)');
const RC = require('../assets/reconfig-model.js');
const imbC = RC.runCycle(c => { c.cells[0].soc = .4; c.cells[1].soc = .25; c.cells[2].soc = .18; });
check('Dengesiz paket paralel şarjla eşitlenir (tüm hücreler ≥ %97)', imbC.charged.finalSoc.every(x => x >= .97), imbC.charged.finalSoc.map(x => (x * 100).toFixed(1)).join('/'));
check('Paralele almada hücre akımı ≤ 4.0 A (datasheet maks. şarj)', imbC.s.stats.peakParI <= 4.0, `${imbC.s.stats.peakParI.toFixed(2)} A`);
const capImbB = runScenario({ ...SCENARIOS.find(s => s.id === 'capacity'), apply: c => { c.cells[0].soc = .4; c.cells[1].soc = .25; c.cells[2].soc = .18; } }, 'improved').r;
check('Dengesiz pakette matris, Rev B\'den ≥ %15 fazla enerji verir', imbC.used.stats.dischargedWh >= 1.15 * capImbB.dischargedWh,
  `${imbC.used.stats.dischargedWh.toFixed(1)} Wh ↔ ${capImbB.dischargedWh.toFixed(1)} Wh`);
const bigC = RC.runCycle(c => { c.cells[0].soc = .8; c.cells[1].soc = .3; c.cells[2].soc = .2; }, { chargeOnly: true });
check('Büyük fark önce ön eşitlemeden geçer, sonra dolar', bigC.s.stats.preS > 0 && bigC.charged.chg === 'DONE', `ön eşitleme ${(bigC.s.stats.preS / 60).toFixed(1)} dk`);
const hugeC = RC.runCycle(c => { c.cells[0].soc = 1; c.cells[1].soc = .05; c.cells[2].soc = .05; });
check('ΔV > 0.6 V paralele alınmaz', hugeC.s.fault === 'DELTA');
const shareS = new RC.SystemC(); shareS.requestMode('CHARGE'); shareS.run(600);
check('Paralel akım paylaşımı yol direncine göre H1 > H2 > H3', shareS.i[0] > shareS.i[1] && shareS.i[1] > shareS.i[2], shareS.i.map(x => x.toFixed(3)).join(' / ') + ' A');
const ilk = new RC.SystemC(); ilk.requestMode('CHARGE'); ilk.run(30); ilk.injectConflict();
check('Kilitleme açıkken gate çakışması engellenir', ilk.fault === 'CONFLICT_BLOCKED' && ilk.stats.shortA === 0);
const noIlk = new RC.SystemC(); noIlk.cfg.interlock = false; noIlk.requestMode('CHARGE'); noIlk.run(30); noIlk.injectConflict();
check('Kilitleme yokken çakışma kısa devreye yol açar (> 50 A)', noIlk.fault === 'SHORT' && noIlk.stats.shortA > 50, `${noIlk.stats.shortA.toFixed(0)} A`);
const seq = new RC.SystemC(); seq.requestMode('CHARGE');
check('Geçişte önce tüm anahtarlar kapanır (break-before-make)', seq.mode === 'DEAD' && Object.values(seq.gates()).every(v => !v));
seq.run(0.2);
check('Paralele almadan önce hücreler tek tek ölçülür (P1+P2 kapalı)', seq.meas.at != null && seq.meas.cells.every(v => Math.abs(v - seq.cells[0].terminalV(0)) < 0.05),
  seq.meas.cells.map(v => v.toFixed(3)).join(' / ') + ' V');

console.log('\n5b) Gate sürme');
const drv = (mod, req) => { const c = RC.defaultConfig(); mod(c); const s = new RC.SystemC(c); s.requestMode(req); s.run(req === 'USE' ? 60 : 30); return s; };
const pv0 = drv(c => { c.deadTimeS = 0; c.interlock = false; }, 'CHARGE');
check('Fotovoltaik sürücü: ölü zaman 0 olsa da çakışma yok (yavaş açılır, hızlı kapanır)', pv0.fault == null && pv0.lastTr.overlap === 0,
  `kapanma ${(pv0.lastTr.tOff * 1e3).toFixed(2)} ms, iletime geçiş ${(pv0.lastTr.onStart * 1e3).toFixed(2)} ms`);
const f0 = drv(c => { c.driver = 'fast'; c.deadTimeS = 0; c.interlock = false; c.cells.forEach(x => { x.soc = 0.9; }); }, 'USE');
check('Hızlı sürücü, ölü zaman 0, kilitleme yok → kısa devre (shoot-through)', f0.fault === 'SHOOT_THROUGH', f0.reason);
const f1 = drv(c => { c.driver = 'fast'; c.deadTimeS = 0; c.interlock = true; c.cells.forEach(x => { x.soc = 0.9; }); }, 'USE');
check('Aynısı donanım kilitlemesiyle güvenli (açma geciktirilir)', f1.fault == null && f1.mode === 'SER' && f1.lastTr.hw, `açma ${(f1.lastTr.cmdOn * 1e3).toFixed(1)} ms'de`);
const d0 = drv(c => { c.driver = 'direct'; }, 'CHARGE');
check('Arduino pini doğrudan: yüzen source\'lu anahtarlar açılamaz', d0.fault === 'GATE_DRIVE', d0.reason.slice(0, 60) + '…');

console.log(`\n${pass} geçti, ${fail} başarısız\n`);
process.exit(fail ? 1 : 0);
