# Requires Python Playwright + installed Chromium. Optional: CHROMIUM_EXECUTABLE.
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
import os
root = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, **({'executable_path': os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
    page = browser.new_page(viewport={'width':1440,'height':1080}, device_scale_factor=1)
    errors=[]
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto((root / 'index.html').as_uri())
    page.wait_for_load_state('networkidle')
    assert not errors, errors
    page.wait_for_function("document.querySelector('#chargeEta').textContent.includes('dk')",timeout=30000)
    print('Initial ETA',page.locator('#chargeEta').inner_text())
    page.screenshot(path='/private/tmp/battery-charge-desktop.png',full_page=True)
    assert page.locator('[data-charge]').count() == 6
    assert '0.05 Ω' in page.locator('#sInaShunt').text_content()
    page.locator('[data-charge="4"]').click()
    page.wait_for_function("document.querySelector('#chargeLimits').textContent.includes('3,90')")
    page.locator('[data-charge="2.8"]').click()
    page.wait_for_function("document.querySelector('[data-charge=\"2.8\"]').getAttribute('aria-pressed') === 'true'")
    page.locator('#chargeMinutes').fill('65')
    page.locator('#chargeByTime').click()
    page.wait_for_function("document.querySelector('#chargePlanStatus').textContent.includes('seçildi')",timeout=60000)
    print('Deadline',page.locator('#chargePlanStatus').inner_text())
    page.wait_for_function("Number(document.querySelector('#chargeAmps').value) > 2.8")
    assert float(page.locator('#chargeAmps').input_value()) > 2.8
    page.locator('#chargeAmps').evaluate("el => { el.value = 3.7; el.dispatchEvent(new Event('change', {bubbles:true})); }")
    page.wait_for_function("document.querySelector('#chargeAmpValue').textContent.includes('3,7')")
    page.locator('#chargeMinutes').fill('1')
    page.locator('#chargeByTime').click()
    page.wait_for_function("document.querySelector('#chargePlanStatus').textContent.includes('yetişmiyor')",timeout=60000)
    print('Impossible',page.locator('#chargePlanStatus').inner_text())
    page.locator('#play').click()
    page.wait_for_function("document.querySelector('#rt').textContent !== '00:00:00'")
    soc=page.locator('#rS').inner_text();t=page.locator('#rt').inner_text()
    page.locator('[data-charge="1.4"]').click()
    assert page.locator('#rt').inner_text() != '00:00:00'
    page.locator('#play').click()
    page.wait_for_function("document.querySelector('#chargeEta').textContent.includes('dk')",timeout=30000)
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
        page.goto((root / name).as_uri())
        page.wait_for_load_state('networkidle')
        if name == 'dogrulama.html':
            assert page.locator('#chargeValidation tbody tr').count() == 6
    assert not errors, errors
    print('PASS: six modes, MAX cap, custom current, deadline, fault latch, BOM, mobile and all pages')
    browser.close()
