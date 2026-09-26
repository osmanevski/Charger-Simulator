/* Pafta üstündeki altı mod; hücre durumu ve korumalar korunarak canlı seçim. */
window.ChargeControls = function (options) {
  'use strict';
  const { getSystem, onApply } = options;
  const $ = id => document.getElementById(id);
  const modes = window.ChargerA.CHARGE_MODES;
  const buttons = [...$('chargeModes').querySelectorAll('[data-charge]')];
  const number = (n, digits = 1) => n.toFixed(digits).replace('.', ',');
  buttons.forEach(button => button.addEventListener('click', () => {
    const amps = +button.dataset.charge;
    if (modes.some(mode => mode.amps === amps)) onApply(amps);
    this.update(true);
  }));
  let last = 0;
  this.update = (force = false) => {
    const now = performance.now(), s = getSystem();
    if (!s || (!force && now - last < 250)) return;
    last = now;
    const amps = s.requestedCurrent(), mode = modes.find(x => x.amps === amps);
    buttons.forEach(button => button.setAttribute('aria-pressed', +button.dataset.charge === amps));
    $('chargeAdapterLabel').textContent = `Sony · ${number(s.cfg.adapterV)} V / ${number(s.cfg.adapterMaxA)} A`;
    const limit = Math.min(s.ccTarget(), s.hardwareCurrentLimit());
    const name = mode ? mode.name : 'Parametre ayarı';
    $('chargeLimits').textContent = s.fw.state === 'CHARGE_DONE' ? `${name} · Şarj tamamlandı.`
      : s.currentMode() !== 'CHARGE' || /FAULT|LOW_TEMP|TIMEOUT/.test(s.fw.state) || s.bms.shortTrip || s.hw.fuseBlown ? `${name} · Şarj bekliyor.`
      : limit < amps - .05 ? `${name} · Etkin akım sınırı ${number(limit, 2)} A${amps === 4 && Math.abs(limit - 3.9) < .01 ? ' (donanım tolerans payı).' : '.'}`
      : `${name} · ${number(amps)} A · CV aşamasında akım azalır.`;
  };
};
