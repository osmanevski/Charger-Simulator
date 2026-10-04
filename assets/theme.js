(function () {
  'use strict';
  const key = 'battery-lab-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const valid = value => value === 'dark' || value === 'light';
  let preference;
  try { preference = localStorage.getItem(key); } catch (_) { /* Yerel dosyalarda depolama kapalı olabilir. */ }

  function apply() {
    const theme = valid(preference) ? preference : system.matches ? 'dark' : 'light';
    root.dataset.theme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.title = theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç';
    });
    window.dispatchEvent(new Event('themechange'));
  }

  // İlk çizimden önce uygula; sayfa açılırken açık renk parlamasını önler.
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); } catch (_) { /* Tema bu sayfada çalışmaya devam eder. */ }
    apply();
  });
  system.addEventListener('change', () => { if (!valid(preference)) apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue;
    apply();
  });
})();
