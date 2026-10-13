"""EN/RU interaction tests using the same offline harness as browser.py.

Browser navigation and native Storage are restricted in this runner.
Tests render the exact single-file bundle with page.set_content, use a Storage-
compatible adapter, and inspect generated download Blobs. A fresh page with the
serialized adapter tests hydration, not native disk durability.
"""
import json, os, re, shutil
from pathlib import Path
from datetime import date
from playwright.sync_api import sync_playwright, expect
from browser import fixture

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'
OUT.mkdir(exist_ok=True)
results=[]

def main():
    with sync_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
        b=p.chromium.launch(**({'executable_path':executable} if executable else {}),headless=True,args=['--no-sandbox'])
        page=b.new_page(viewport={'width':1440,'height':1000})
        page.set_default_timeout(5000)
        page.emulate_media(reduced_motion='reduce')
        errors=[]; requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        page.set_content(fixture(),wait_until='load')
        def run(name,fn):
            fn();results.append({'test':name,'passed':True});print('PASS',name,flush=True)
        def close():
            if page.locator('[role="dialog"]').count():page.keyboard.press('Escape')
        def nav(view):
            close()
            if page.viewport_size['width']<=760:
                page.locator('[data-action="open-menu"]').click()
            page.locator(f'.nav-item[data-view="{view}"]').click()
        def lang(code):
            page.locator(f'[data-language="{code}"]').click()
        def action(name):
            page.locator(f'[data-action="{name}"]').first.click()
        def state():return page.evaluate('FalconStore.snapshot()')
        def snapshot():return page.evaluate('JSON.stringify(FalconStore.snapshot())')
        def overflow():return page.evaluate('document.documentElement.scrollWidth > innerWidth')
        ids={}
        try:
            def default_and_toggle():
                expect(page.locator('html')).to_have_attribute('lang','en')
                before=snapshot()
                lang('ru')
                expect(page.locator('html')).to_have_attribute('lang','ru')
                expect(page.locator('#workspace h1')).to_have_text('Всё для вашего следующего найма.')
                expect(page.locator('[data-language="ru"]')).to_have_attribute('aria-pressed','true')
                assert page.evaluate('localStorage.getItem(FalconI18n.KEY)')=='ru'
                assert snapshot()==before
            run('Language switch, accessibility state, independent persistence and unchanged data',default_and_toggle)

            def russian_screens():
                names={'overview':'Обзор','pipeline':'Воронка','candidates':'Кандидаты','jobs':'Вакансии','calendar':'Календарь','campaigns':'Кампании','reports':'Отчёты','settings':'Настройки'}
                for view,name in names.items():
                    nav(view)
                    assert page.title()==name+' | Falcon Jobster'
                    assert re.search('[А-Яа-я]',page.locator('#workspace h1').inner_text())
                    assert not overflow(),view
            run('All eight Russian desktop views and document titles',russian_screens)

            def unsaved_settings():
                nav('settings')
                form=page.locator('#settings-form')
                form.locator('[name="company"]').fill('Unsaved New / Акме')
                form.locator('[name="website"]').fill('https://example.org')
                before=snapshot()
                page.locator('#workspace-language').select_option('en')
                expect(form.locator('[name="company"]')).to_have_value('Unsaved New / Акме')
                expect(form.locator('[name="website"]')).to_have_value('https://example.org')
                page.locator('#workspace-language').select_option('ru')
                expect(form.locator('[name="company"]')).to_have_value('Unsaved New / Акме')
                assert snapshot()==before
            run('Unsaved settings fields survive both language controls',unsaved_settings)

            def filter_persistence():
                nav('candidates');page.locator('#stage-filter').select_option('New')
                page.locator('#local-search').fill('Maya')
                page.locator('[data-select-id="1"]').check()
                lang('en')
                expect(page.locator('#stage-filter')).to_have_value('New')
                expect(page.locator('#local-search')).to_have_value('Maya')
                expect(page.locator('[data-select-id="1"]')).to_be_checked()
                lang('ru')
                expect(page.locator('#stage-filter option:checked')).to_have_text('Новый')
                expect(page.locator('[data-select-id="1"]')).to_be_checked()
            run('Filters, query and selection survive language changes',filter_persistence)

            def calendar_locale():
                nav('calendar')
                expect(page.locator('.calendar-weekdays span').first).to_have_text('Пн')
                first=page.locator('.calendar-day').first.get_attribute('data-date')
                assert date.fromisoformat(first).weekday()==0
                before=state()['interviews']
                lang('en')
                expect(page.locator('.calendar-weekdays span').first).to_have_text('Sun')
                assert date.fromisoformat(page.locator('.calendar-day').first.get_attribute('data-date')).weekday()==6
                lang('ru');assert state()['interviews']==before
                assert page.evaluate("FalconI18n.number(1.5,{minimumFractionDigits:1})")=='1,5'
            run('Russian Monday-first calendar and numeric locale; event timestamps unchanged',calendar_locale)

            def russian_validation_and_candidate():
                nav('candidates');action('add-candidate')
                form=page.locator('#candidate-form')
                form.locator('[type="submit"]').click()
                expect(form.locator('.form-error')).to_have_text('Заполните все обязательные поля.')
                form.locator('[name="name"]').fill('Алексей Тест')
                form.locator('[name="email"]').fill('bad-email')
                form.locator('[name="location"]').fill('Austin, TX')
                form.locator('[type="submit"]').click()
                expect(form.locator('.form-error')).to_have_text('Введите корректный адрес электронной почты.')
                form.locator('[name="email"]').fill('ru-test@example.com')
                form.locator('[name="source"]').select_option('Referral')
                expect(form.locator('[name="source"] option:checked')).to_have_text('Рекомендация')
                form.locator('[name="notes"]').fill('New, Interview, Active — не переводить <b>заметку</b>')
                form.locator('[type="submit"]').click()
                expect(page.locator('#dialog-title')).to_have_text('Алексей Тест')
                expect(page.locator('#toast-root')).to_contain_text('Кандидат добавлен')
                record=next(c for c in state()['candidates'] if c['email']=='ru-test@example.com')
                ids['candidate']=record['id']
                assert record['stage']=='New' and record['source']=='Referral'
                assert record['notes']=='New, Interview, Active — не переводить <b>заметку</b>'
                assert page.locator('#candidate-notes b').count()==0
                close()
            run('Russian required/email validation, candidate creation, canonical enums and safe Cyrillic notes',russian_validation_and_candidate)

            def profile_stage_and_notes():
                page.locator(f'[data-action="candidate"][data-id="{ids["candidate"]}"]').first.click()
                page.locator('[data-action="move-candidate"][data-stage="Interview"]').click()
                expect(page.locator('.profile-meta .stage-badge')).to_have_text('Интервью')
                expect(page.locator('#toast-root')).to_contain_text('этап: Интервью')
                page.locator('[data-action="drawer-tab"][data-tab="activity"]').click()
                expect(page.locator('.timeline')).to_contain_text('Переход на этап: Интервью')
                close()
                before=snapshot();lang('en');lang('ru')
                assert snapshot()==before
            run('Stage changes, toasts and historical activity translated without changing records',profile_stage_and_notes)

            def csv_localized():
                nav('candidates');action('export-candidates')
                csv=page.evaluate('async()=>await __downloads.at(-1).blob.text()')
                assert '"Имя","Вакансия"' in csv
                assert 'Алексей Тест' in csv and 'Интервью' in csv and 'Рекомендация' in csv
                lang('en');action('export-candidates')
                csv=page.evaluate('async()=>await __downloads.at(-1).blob.text()')
                assert '"Name","Job"' in csv and 'Алексей Тест' in csv
                lang('ru')
            run('Localized CSV headers and controlled values; names remain unchanged',csv_localized)

            def job_user_content():
                nav('jobs');action('add-job')
                form=page.locator('#job-form')
                form.locator('[name="title"]').fill('Interview')
                form.locator('[name="department"]').fill('New')
                form.locator('[name="location"]').fill('Remote')
                form.locator('[name="description"]').fill('Active, New — пользовательский текст')
                form.locator('[type="submit"]').click()
                expect(page.locator('#dialog-title')).to_have_text('Interview')
                expect(page.locator('.job-description')).to_contain_text('Active, New — пользовательский текст')
                expect(page.locator('#toast-root')).to_contain_text('Вакансия сохранена локально')
                ids['job']=next(j['id'] for j in state()['jobs'] if j['title']=='Interview')
                close();lang('en');lang('ru');nav('candidates');action('add-candidate')
                expect(page.locator(f'[name="jobId"] option[value="{ids["job"]}"]')).to_have_text('Interview')
                close()
            run('User-entered titles matching interface words are never translated',job_user_content)

            def message_draft():
                nav('candidates')
                page.locator(f'[data-action="candidate"][data-id="{ids["candidate"]}"]').first.click()
                action('message')
                body=page.locator('#message-form [name="body"]')
                assert body.input_value().startswith('Hi ')
                body.fill('Hello Алексей. Active is literal.')
                page.locator('#message-form [type="submit"]').click()
                expect(page.locator('#toast-root')).to_contain_text('Черновик сообщения сохранён')
                close();before=snapshot();lang('en');lang('ru');assert before==snapshot()
                assert any(m['body']=='Hello Алексей. Active is literal.' for m in state()['messages'])
            run('Russian message controls; English U.S. drafts and user text preserved',message_draft)

            def interview():
                nav('calendar');action('add-interview')
                form=page.locator('#interview-form')
                form.locator('[name="candidateId"]').select_option(ids['candidate'])
                form.locator('[name="title"]').fill('Тестовая встреча')
                future=page.evaluate("()=>{const d=new Date();d.setDate(d.getDate()+8);d.setHours(13,30,0,0);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}")
                form.locator('[name="startsAt"]').fill(future)
                form.locator('[name="format"]').select_option('Video')
                form.locator('[type="submit"]').click()
                expect(page.locator('#dialog-title')).to_have_text('Тестовая встреча')
                expect(page.locator('.interview-detail')).to_contain_text('Видеосвязь')
                expect(page.locator('#toast-root')).to_contain_text('Приглашение не отправлено')
                action('export-interview')
                ics=page.evaluate('async()=>await __downloads.at(-1).blob.text()')
                assert 'Тестовая' in ics and 'BEGIN:VEVENT' in ics and 'ATTENDEE' not in ics
                close()
            run('Russian interview scheduling, formats, notices and UTF-8 ICS export',interview)

            def campaign():
                nav('campaigns');action('templates')
                expect(page.locator('.modal')).to_contain_text('Шаблоны на английском')
                assert 'Hi {{first_name}}' in page.locator('.template-list').inner_text()
                close();action('add-campaign')
                form=page.locator('#campaign-form')
                form.locator('[name="name"]').fill('Тестовая кампания')
                form.locator('[name="message"]').fill('Hello {{first_name}}, your {{job_title}} role at {{company}}.')
                form.locator('button[value="Ready"]').click()
                expect(page.locator('#dialog-title')).to_have_text('Тестовая кампания')
                expect(page.locator('.modal .badge')).to_contain_text('Готово')
                expect(page.locator('.notice').last).to_contain_text('Провайдер не подключён')
                close()
            run('Russian campaign preparation with unchanged English templates and simulation disclosures',campaign)

            def settings_details():
                nav('settings')
                for tab in ['team','integrations','data']:
                    page.locator(f'[data-action="settings-tab"][data-tab="{tab}"]').click()
                    assert not overflow()
                    if tab=='team':
                        expect(page.locator('.team-list')).to_contain_text('Владелец')
                        expect(page.locator('.team-list')).to_contain_text('Участник демоверсии')
                    if tab=='integrations':
                        for service in ['api','sms','email','calendar']:
                            page.locator(f'[data-integration="{service}"]').click()
                            assert re.search('[А-Яа-я]',page.locator('.integration-requirements').inner_text())
                            close()
                action('export-backup')
                backup=json.loads(page.evaluate('async()=>await __downloads.at(-1).blob.text()'))
                assert backup==state()
                assert backup['version']==1
            run('All settings tabs, integration explanations and original backup compatibility',settings_details)

            def rehydrate():
                before=snapshot()
                storage=page.evaluate('window.__storage')
                fresh=b.new_page()
                fresh.set_content(fixture(storage),wait_until='load')
                expect(fresh.locator('html')).to_have_attribute('lang','ru')
                assert fresh.evaluate('JSON.stringify(FalconStore.snapshot())')==before
                fresh.close()
            run('Fresh-document hydration restores saved Russian locale and all records',rehydrate)

            def storage_failure():
                fresh=b.new_page()
                fresh.set_content(fixture(),wait_until='load')
                fresh.evaluate("()=>{localStorage.setItem=()=>{throw new Error('Quota')};}")
                fresh.locator('[data-language="ru"]').click()
                expect(fresh.locator('html')).to_have_attribute('lang','ru')
                expect(fresh.locator('#toast-root')).to_contain_text('Хранилище браузера недоступно')
                fresh.close()
            run('Blocked preference storage gracefully keeps Russian for the session',storage_failure)

            def mobile_and_screenshots():
                for width in [390,320]:
                    page.set_viewport_size({'width':width,'height':844})
                    for view in ['overview','pipeline','candidates','jobs','calendar','campaigns','reports','settings']:
                        nav(view);assert not overflow(),f'{width} {view}'
                        expect(page.locator('[data-language="ru"]')).to_be_visible()
                    nav('overview')
                    if width==390:page.screenshot(path=str(OUT/'ru-mobile.png'),full_page=True)
                    action('add-candidate');assert not overflow()
                    assert page.locator('.modal').bounding_box()['width']<=width
                    close()
                    lang('en');lang('ru');assert not overflow()
                page.set_viewport_size({'width':1440,'height':1000})
                nav('overview');page.screenshot(path=str(OUT/'ru-overview.png'),full_page=True)
                nav('pipeline');page.screenshot(path=str(OUT/'ru-pipeline.png'),full_page=True)
            run('Eight Russian views at 390/320 px, mobile controls and modal layout',mobile_and_screenshots)

            def clean_runtime():
                assert not errors,errors
                assert not requests,requests
            run('Zero uncaught JavaScript errors and zero external requests',clean_runtime)
            OUT.joinpath('language-results.json').write_text(json.dumps({'results':results,'missingKeys':page.evaluate('FalconI18n.missingKeys'),'errors':errors,'externalRequests':requests,'environment':'Offline bundle, set_content, Storage-compatible adapter'},ensure_ascii=False,indent=2))
        finally:
            if len(results)<17:
                page.screenshot(path=str(OUT/'language-failure.png'),full_page=True)
                OUT.joinpath('language-partial.json').write_text(json.dumps(results,indent=2))
            b.close()
if __name__=='__main__':main()
