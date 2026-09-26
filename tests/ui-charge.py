# Requires Python Playwright + installed Chromium. Optional: CHROMIUM_EXECUTABLE.
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
import os
root = Path(__file__).resolve().parents[1]
base = os.environ.get('SITE_URL')
def url(name): return base.rstrip('/') + '/' + name if base else (root / name).as_uri()
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, **({'executable_path': os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
    page = browser.new_page(viewport={'width':1440,'height':1080}, device_scale_factor=1)
    errors=[]
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto(url('index.html'))
    page.wait_for_load_state('networkidle')
    assert not errors, errors
    assert page.locator('[data-charge]').count() == 6
    assert page.locator('#chargeAmps, #chargeMinutes, #chargeByTime, #chargeEta').count() == 0
    assert page.locator('.schematic-panel #chargeModes').count() == 1
    assert '19.5 → 7.5 V' in page.locator('#auxSupply').text_content()
    assert '7.5 V → Vin' in page.locator('#auxSupply').text_content()
    for amps in ['1', '1.4', '2.1', '2.8', '3.5', '4']:
        page.locator(f'[data-charge="{amps}"]').click()
        assert page.locator(f'[data-charge="{amps}"]').get_attribute('aria-pressed') == 'true'
        assert page.locator('[data-charge][aria-pressed="true"]').count() == 1
    assert '3,90' in page.locator('#chargeLimits').inner_text()
    page.screenshot(path='/private/tmp/battery-charge-desktop.png',full_page=True)
    page.locator('[data-part="aux"]').click()
    assert 'İkinci adaptör gerekmez' in page.locator('#inspector').inner_text()
    page.locator('#play').click()
    page.wait_for_function("document.querySelector('#rt').textContent !== '00:00:00'")
    soc=page.locator('#rS').inner_text();t=page.locator('#rt').inner_text()
    page.locator('[data-charge="1.4"]').click()
    assert page.locator('#rt').inner_text() != '00:00:00'
    page.locator('#play').click()
    page.locator('[data-tab="bom"]').click()
    assert 'R050' in page.locator('[data-panel="bom"]').inner_text()
    assert 'LM358' not in page.locator('[data-panel="bom"]').inner_text()
    page.locator('[data-tab="params"]').click()
    assert page.locator('[data-k="inaShuntR"]').input_value() == '0.05'
    assert page.locator('[data-k="tempMux"]').is_checked()
    page.locator('[data-k="inaConnected"]').uncheck()
    page.locator('#play').click()
    page.wait_for_function("document.querySelector('#rStates').textContent.includes('SENSOR_FAULT')")
    page.locator('[data-charge="4"]').click()
    assert 'SENSOR_FAULT' in page.locator('#rStates').inner_text()
    page.locator('#reset').click()
    page.locator('[data-charge="1.4"]').click()
    page.locator('[data-tab="scen"]').click()
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/private/tmp/battery-charge-mobile.png',full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'mobile overflow'
    print('Live switch', t, soc, 'errors',errors)
    assert not errors, errors
    for name in ['alternatif.html', 'dogrulama.html']:
        page.goto(url(name))
        page.wait_for_load_state('networkidle')
        if name == 'dogrulama.html':
            assert page.locator('#chargeValidation tbody tr').count() == 6
    assert not errors, errors
    print('PASS: six modes above schematic, no custom/time inputs, power split, live switching, fault latch, mobile and all pages')
    browser.close()
