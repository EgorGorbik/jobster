"""End-to-end smoke test. Requires a running backend with test credentials."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL=os.getenv('JOBSTER_TEST_URL','http://127.0.0.1:4174')
EMAIL=os.getenv('JOBSTER_ADMIN_EMAIL','admin@example.com')
PASSWORD=os.getenv('JOBSTER_ADMIN_PASSWORD','')
assert PASSWORD, 'JOBSTER_ADMIN_PASSWORD must be set'
output=Path(os.getenv('JOBSTER_SCREENSHOT_DIR','/tmp/jobster-backend-shots'))
output.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'), args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':950})
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(URL,wait_until='networkidle')
    assert page.locator('#remote-login').is_visible(), 'login not shown'
    page.locator('[data-remote-lang="ru"]').click()
    assert 'Вход' in page.locator('h1').inner_text()
    page.locator('[data-remote-lang="en"]').click()
    page.locator('#remote-login [name=email]').fill(EMAIL)
    page.locator('#remote-login [name=password]').fill(PASSWORD)
    page.locator('#remote-login button[type=submit]').click()
    page.locator('.sidebar .main-nav',timeout=15000).wait_for()
    page.screenshot(path=str(output/'backend-overview.png'),full_page=True)
    page.locator('[data-view="jobs"].nav-item').click()
    page.locator('[data-action="add-job"]').first.click()
    page.locator('#job-form [name=title]').fill('CDL Driver QA')
    page.locator('#job-form [name=department]').fill('Operations')
    page.locator('#job-form [name=location]').fill('Chicago, IL')
    page.locator('#job-form button[type=submit]').click()
    page.locator('[data-action="close-overlay"]').first.click()
    page.wait_for_function("document.querySelector('#jobster-remote-banner').hidden",timeout=15000)
    assert 'CDL Driver QA' in page.locator('.jobs-list').inner_text()
    page.locator('[data-view="candidates"].nav-item').click()
    print('Candidate actions:', page.locator('button[data-action]').all_text_contents()[:12])
    page.screenshot(path=str(output/'backend-jobs.png'),full_page=True)
    page.reload(wait_until='networkidle')
    page.locator('.sidebar .main-nav',timeout=15000).wait_for()
    page.locator('[data-view="jobs"].nav-item').click()
    assert 'CDL Driver QA' in page.locator('.jobs-list').inner_text(), 'Job not persisted after reload'
    page.locator('[data-language="ru"]').first.click()
    assert page.locator('html').get_attribute('lang')=='ru'
    page.screenshot(path=str(output/'backend-ru-jobs.png'),full_page=True)
    page.locator('[data-action="remote-logout"]').click()
    page.locator('#remote-login',timeout=15000).wait_for()
    assert not errors, 'browser JS errors: '+str(errors)
    print('Browser smoke passed: RU/EN login, job creation, SQLite sync, reload, sign-out; no JS page errors')
    browser.close()
