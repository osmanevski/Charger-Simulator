/* Şarj seçim paneli; fizik modeli ve tezgâhın oynatma kontrollerinden bağımsız. */
window.ChargeControls = function (options) {
  'use strict';
  const { getSystem, onApply, onPause } = options;
  const P = window.ChargePlanner, $ = id => document.getElementById(id);
  const number = (v, n = 1) => v.toFixed(n).replace('.', ',');
  const ampText = a => `${number(a)} A · ${number(a / 2.8, 2)}C`;
  $('chargeModes').innerHTML = P.MODES.map(m => `<button data-charge="${m.amps}" aria-pressed="false"><strong>${m.name}</strong><span>${m.amps === 4 ? '≤ ' : ''}${ampText(m.amps)}</span><small id="etaMode${Math.round(m.amps * 10)}">—</small></button>`).join('');
  let owner, signature, epoch = 0, calculating = false, timePlanning = false;
  let results = [], anchor = 0, lastForecast = -Infinity, lastCheck = 0;
  const minuteText = m => m <= 0 ? 'Tamamlandı' : `≈ ${Math.max(1, Math.ceil(m))} dk`;
  const apply = a => { onApply(a); signature = null; };
  document.querySelectorAll('[data-charge]').forEach(b => b.addEventListener('click', () => apply(+b.dataset.charge)));
  $('chargeAmps').addEventListener('input', e => { $('chargeAmpValue').textContent = ampText(+e.target.value); });
  $('chargeAmps').addEventListener('change', e => apply(+e.target.value));

  async function evaluate(data, currents, token, progress) {
    const rows = [];
    for (const amps of currents) {
      const generator = P.forecast(data, amps);
      let step;
      do {
        if (token !== epoch) return null;
        step = generator.next();
        if (!step.done) await new Promise(resolve => setTimeout(resolve, 0));
      } while (!step.done);
      rows.push(step.value);
      if (progress) progress(rows.length, currents.length);
    }
    return token === epoch ? rows : null;
  }

  async function estimate(s) {
    const token = ++epoch, data = P.snapshot(s);
    calculating = true; anchor = s.t; lastForecast = performance.now();
    const currents = [...new Set([...P.MODES.map(m => m.amps), s.requestedCurrent()])];
    try {
      const rows = await evaluate(data, currents, token);
      if (rows) results = rows;
    } catch (e) {
      if (token === epoch) $('chargeEta').textContent = 'Tahmin hesaplanamadı';
      console.error('Şarj tahmini', e);
    } finally { if (token === epoch) calculating = false; }
  }

  $('chargeByTime').addEventListener('click', async () => {
    const minutes = +$('chargeMinutes').value;
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 300) {
      $('chargePlanStatus').textContent = '1–300 dakika arasında bir süre girin.'; return;
    }
    onPause();
    const s = getSystem(), data = P.snapshot(s), token = ++epoch;
    owner = s; signature = JSON.stringify(s.cfg);
    calculating = true; timePlanning = true;
    $('chargeByTime').disabled = true;
    try {
      const rows = await evaluate(data, P.CURRENTS, token, (n, total) => {
        $('chargePlanStatus').textContent = `Süreler deneniyor… ${n}/${total}`;
      });
      if (!rows) return;
      if (getSystem() !== s || s.t !== data.t || JSON.stringify(s.cfg) !== JSON.stringify(data.cfg) || +$('chargeMinutes').value !== minutes) {
        $('chargePlanStatus').textContent = 'Hesap sırasında durum veya süre değişti. Akım uygulanmadı; yeniden hesaplayın.';
        return;
      }
      results = rows; anchor = s.t; lastForecast = performance.now();
      const selected = P.chooseDeadline(rows, minutes);
      if (selected) {
        onApply(selected.amps);
        signature = JSON.stringify(s.cfg);
        $('chargePlanStatus').textContent = `${number(selected.amps)} A seçildi: ${minuteText(selected.minutes)}. Devam ile şarjı sürdürün.${selected.balanced ? '' : ' Hücre farkı nedeniyle bazı hücreler tam dolmayabilir.'}`;
      } else {
        const possible = rows.filter(r => r.minutes != null);
        $('chargePlanStatus').textContent = possible.length
          ? `Bu süreye yetişmiyor. Mevcut durumda en kısa tahmin ${minuteText(Math.min(...possible.map(r => r.minutes)))}. Akım değiştirilmedi.`
          : `Şarj sonu tahmin edilemiyor: ${rows[0].reason}. Akım değiştirilmedi.`;
      }
    } catch (e) {
      if (token === epoch) $('chargePlanStatus').textContent = 'Hesaplama tamamlanamadı; akım değiştirilmedi.';
      console.error('Süre seçimi', e);
    } finally {
      if (token === epoch) { calculating = false; timePlanning = false; $('chargeByTime').disabled = false; }
    }
  });

  this.update = function (force = false) {
    const now = performance.now();
    if (!force && now - lastCheck < 250) return;
    lastCheck = now;
    const s = getSystem(), sig = JSON.stringify(s.cfg), amps = s.requestedCurrent();
    $('chargeAdapterLabel').textContent = `${number(s.cfg.adapterV)} V / ${number(s.cfg.adapterMaxA)} A adaptör`;
    if (s !== owner || sig !== signature) {
      ++epoch; owner = s; signature = sig; calculating = false; timePlanning = false;
      results = []; lastForecast = -Infinity;
      $('chargeByTime').disabled = false; $('chargePlanStatus').textContent = '';
    }
    if (document.activeElement !== $('chargeAmps')) {
      $('chargeAmps').value = amps; $('chargeAmpValue').textContent = ampText(amps);
    }
    document.querySelectorAll('[data-charge]').forEach(b => b.setAttribute('aria-pressed', Math.abs(+b.dataset.charge - amps) < .01));
    const done = s.fw.state === 'CHARGE_DONE';
    const blocked = s.currentMode() !== 'CHARGE' || /FAULT|LOW_TEMP|TIMEOUT/.test(s.fw.state) || s.bms.shortTrip || s.hw.fuseBlown;
    if (!done && !blocked && !calculating && (results.length === 0 || (now - lastForecast > 10000 && s.t - anchor > 60))) estimate(s);
    const elapsed = Math.max(0, (s.t - anchor) / 60);
    P.MODES.forEach(mode => {
      const r = results.find(r => r.amps === mode.amps);
      $(`etaMode${Math.round(mode.amps * 10)}`).textContent = done ? 'Tamamlandı' : blocked ? 'Bekliyor' : r && r.minutes != null ? minuteText(Math.max(.01, r.minutes - elapsed)) : calculating ? 'Hesaplanıyor…' : '—';
    });
    const row = results.find(r => Math.abs(r.amps - amps) < .01);
    $('chargeEta').textContent = done ? 'Şarj tamamlandı' : blocked ? 'Şarj bekliyor' : row ? (row.minutes == null ? 'Tamamlanma öngörülmüyor' : minuteText(Math.max(.01, row.minutes - elapsed))) : 'Hesaplanıyor…';
    const actual = Math.min(s.ccTarget(), s.hardwareCurrentLimit());
    $('chargeLimits').textContent = done ? `Ortalama doluluk %${number(s.cells.reduce((a, c) => a + c.soc, 0) / 3 * 100)}.`
      : blocked ? 'Şarj modu ve koruma durumunu kontrol edin.'
      : row && row.reason ? row.reason
      : actual < amps - .05 ? `Etkin sınır ${number(actual, 2)} A · ${amps > 2.8 && s.fw.meas.minT < s.cfg.highRateMinC ? 'Soğuk hücre: SAFE akımına indirildi.' : 'Sıcaklık, ön şarj veya donanım tolerans payı.'}`
      : row && !row.balanced ? 'Hücre farkı: şarj bittiğinde tüm hücreler tam dolmayabilir.'
      : `Anlık ${ampText(Math.max(0, s.hw.iPack))} · CV aşamasında akım azalır.`;
    if (timePlanning) $('chargeByTime').disabled = true;
  };
};
