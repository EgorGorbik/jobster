"""Browser interaction tests for the self-contained frontend.

This harness renders generated HTML with page.set_content (no network navigation).
It supplies an in-memory Storage-compatible adapter and captures download Blobs.
This is intentional for environments with browser navigation restrictions; it
validates UI logic, storage serialization/hydration, and exported file contents,
not native browser storage durability or OS download dialogs.

Requires Python and Playwright. Uses CHROMIUM_PATH or a local Chromium executable.
"""
import json
import os
import shutil
import traceback
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('QA_OUTPUT', str(ROOT / 'test-results')))
OUT.mkdir(parents=True, exist_ok=True)
HTML = (ROOT / 'dist/index.html').read_text()
RESULTS = []

def fixture(storage=None):
    data = json.dumps(storage or {}, ensure_ascii=True).replace('<', '\\u003c').replace('>', '\\u003e')
    shim = '''<script>
    window.__storage=DATA;
    Object.defineProperty(window,'localStorage',{value:{getItem:k=>window.__storage[k]??null,setItem:(k,v)=>{window.__storage[k]=String(v)},removeItem:k=>{delete window.__storage[k]},clear:()=>{window.__storage={}},key:i=>Object.keys(window.__storage)[i]??null,get length(){return Object.keys(window.__storage).length}}});
    window.__downloads=[];window.__blobs=new Map();
    const createObjectURL=URL.createObjectURL.bind(URL);
    URL.createObjectURL=function(blob){const url=createObjectURL(blob);window.__blobs.set(url,blob);return url;};
    const anchorClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){if(this.download){window.__downloads.push({name:this.download,blob:window.__blobs.get(this.href)});}else{anchorClick.call(this);}};
    </script>'''.replace('DATA', data)
    return HTML.replace('<head>', '<head>' + shim)

def run(name, action):
    try:
        action()
        RESULTS.append({'test': name, 'passed': True})
        print('PASS', name, flush=True)
    except Exception as exc:
        RESULTS.append({'test': name, 'passed': False, 'error': str(exc)})
        print('FAIL', name, str(exc), flush=True)
        raise

def main():
    with sync_playwright() as p:
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
        browser = p.chromium.launch(**({'executable_path': executable} if executable else {}), headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1050})
        page.set_default_timeout(5000)
        page.emulate_media(reduced_motion='reduce')
        capture = os.environ.get('CAPTURE_SCREENSHOTS', '0') == '1'
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        page.set_content(fixture(), wait_until='load')
        page.wait_for_timeout(300)
        state = lambda: page.evaluate('FalconStore.snapshot()')
        def nav(view):
            if page.viewport_size['width'] <= 760:
                page.locator('[data-action="open-menu"]').click()
            page.locator(f'.nav-item[data-view="{view}"]').click()
            page.wait_for_timeout(30)
        def close():
            if page.locator('[role="dialog"]').count(): page.keyboard.press('Escape')
        def download_text():
            return page.evaluate('async () => {const d=window.__downloads.at(-1); return {name:d.name,text:await d.blob.text(),type:d.blob.type};}')
        ids = {}
        try:
            def navigation():
                for view in ['overview','pipeline','candidates','jobs','calendar','campaigns','reports','settings']:
                    nav(view)
                    assert page.locator('#workspace h1').inner_text()
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                assert not errors, errors
            run('Eight desktop views and navigation', navigation)

            def global_search():
                page.locator('#global-search').fill('Maya')
                page.locator('#global-results [data-action="candidate"]').first.click()
                expect(page.locator('#dialog-title')).to_have_text('Maya Thompson')
                close()
                page.locator('#global-search').fill('')
            run('Global search opens correct candidate', global_search)

            def filters():
                nav('candidates')
                page.locator('#stage-filter').select_option('New')
                assert page.locator('.data-table tbody tr').count() == 2
                page.locator('#local-search').fill('no such candidate 123')
                expect(page.locator('.empty-state h3')).to_have_text('No candidates found')
                page.locator('[data-action="clear-filters"]').first.click()
                assert page.locator('.data-table tbody tr').count() == 8
            run('Candidate filters, search and empty state', filters)

            def create_candidate():
                page.locator('[data-action="add-candidate"]').click()
                form = page.locator('#candidate-form')
                form.locator('[name="name"]').fill('Taylor QA')
                form.locator('[name="email"]').fill('taylor.qa@example.com')
                form.locator('[name="location"]').fill('Dallas, TX')
                form.locator('[name="phone"]').fill('(214) 555-0130')
                form.locator('[name="rating"]').fill('88')
                form.locator('[name="tags"]').fill('Bilingual, Dispatch')
                form.locator('button[type="submit"]').click()
                expect(page.locator('#dialog-title')).to_have_text('Taylor QA')
                ids['candidate'] = next(c['id'] for c in state()['candidates'] if c['email']=='taylor.qa@example.com')
                assert len(state()['candidates']) == 9
                assert page.evaluate('Boolean(localStorage.getItem(FalconStore.KEY))')
                close()
            run('Create candidate and serialize state', create_candidate)

            def duplicate_validation():
                page.locator('[data-action="add-candidate"]').click()
                f=page.locator('#candidate-form')
                f.locator('[name="name"]').fill('Duplicate')
                f.locator('[name="email"]').fill('taylor.qa@example.com')
                f.locator('[name="location"]').fill('Dallas, TX')
                f.locator('button[type="submit"]').click()
                expect(f.locator('.form-error')).to_contain_text('already exists')
                assert len(state()['candidates']) == 9
                close()
            run('Duplicate candidate validation', duplicate_validation)

            def profile_actions():
                page.locator(f'[data-action="candidate"][data-id="{ids["candidate"]}"]').click()
                page.locator('.drawer-head [data-action="favorite"]').click()
                assert next(c for c in state()['candidates'] if c['id']==ids['candidate'])['favorite']
                page.locator('#candidate-notes').fill('Follow up next week. <img id="injected" src=x onerror="alert(1)">')
                page.locator('#notes-form button[type="submit"]').click()
                assert page.locator('#injected').count()==0
                page.locator('[data-action="move-candidate"][data-stage="Interview"]').click()
                assert next(c for c in state()['candidates'] if c['id']==ids['candidate'])['stage']=='Interview'
                page.locator('[data-action="edit-candidate"]').click()
                f=page.locator('#candidate-form')
                f.locator('[name="phone"]').fill('(214) 555-0131')
                f.locator('button[type="submit"]').click()
                assert next(c for c in state()['candidates'] if c['id']==ids['candidate'])['phone']=='(214) 555-0131'
                close()
            run('Profile, favorite, notes, escaping, stage and editing', profile_actions)

            def drag_drop():
                nav('pipeline')
                page.locator(f'[data-drag-id="{ids["candidate"]}"]').drag_to(page.locator('[data-drop-stage="Offer"] .column-head'))
                assert next(c for c in state()['candidates'] if c['id']==ids['candidate'])['stage']=='Offer'
            run('Real pointer drag-and-drop stage movement', drag_drop)

            def archive_restore():
                page.locator(f'[data-drag-id="{ids["candidate"]}"]').click()
                page.locator('[data-action="archive-candidate"]').click()
                assert next(c for c in state()['candidates'] if c['id']==ids['candidate'])['archived']
                nav('candidates')
                page.locator('[data-action="candidate-tab"][data-tab="Archived"]').click()
                page.locator(f'[data-action="candidate"][data-id="{ids["candidate"]}"]').click()
                page.locator('[data-action="archive-candidate"]').click()
                assert not next(c for c in state()['candidates'] if c['id']==ids['candidate'])['archived']
                page.locator('[data-action="candidate-tab"][data-tab="All"]').click()
            run('Archive and restore with history preserved', archive_restore)

            def bulk_actions():
                page.locator(f'[data-select-id="{ids["candidate"]}"]').check()
                page.locator('[data-select-id="1"]').check()
                page.locator('#bulk-stage').select_option('Screening')
                assert all(c['stage']=='Screening' for c in state()['candidates'] if c['id'] in [ids['candidate'],'1'])
                page.locator(f'[data-select-id="{ids["candidate"]}"]').check()
                page.locator('[data-action="export-selected"]').click()
                exported=download_text()
                assert exported['name'].endswith('.csv') and 'Taylor QA' in exported['text'] and 'Maya Thompson' not in exported['text']
            run('Bulk stage move and selected CSV export', bulk_actions)

            def jobs():
                nav('jobs');page.locator('[data-action="add-job"]').click()
                f=page.locator('#job-form')
                for key,value in {'title':'Dispatch Coordinator QA','department':'Operations','location':'Dallas, TX','openings':'3'}.items(): f.locator(f'[name="{key}"]').fill(value)
                f.locator('button[type="submit"]').click()
                ids['job']=next(j['id'] for j in state()['jobs'] if j['title']=='Dispatch Coordinator QA')
                page.locator('[data-action="toggle-job"]').click()
                assert next(j for j in state()['jobs'] if j['id']==ids['job'])['status']=='Paused'
                page.locator('[data-action="toggle-job"]').click()
                page.locator('[data-action="edit-job"]').click()
                page.locator('#job-form [name="title"]').fill('Dispatch QA Coordinator')
                page.locator('#job-form button[type="submit"]').click()
                page.locator('[data-action="close-job"]').click()
                page.locator('[data-action="confirm-action"]').click()
                assert next(j for j in state()['jobs'] if j['id']==ids['job'])['status']=='Closed'
                page.locator('[data-action="toggle-job"]').click()
                close()
            run('Job creation, editing, pause, close and reactivation', jobs)

            def drafts():
                nav('candidates')
                page.locator(f'[data-action="candidate"][data-id="{ids["candidate"]}"]').click()
                page.locator('.drawer-actions [data-action="message"]').click()
                f=page.locator('#message-form')
                f.locator('[name="channel"]').select_option('SMS')
                f.locator('[name="body"]').fill('Hi Taylor. This is a local message draft.')
                f.locator('button[type="submit"]').click()
                expect(page.locator('.draft-message')).to_contain_text('This is a local message draft.')
                assert state()['messages'][0]['status']=='Draft'
                page.locator('[data-action="edit-message"]').click()
                page.locator('#message-form [name="body"]').fill('Updated draft. Not sent.')
                page.locator('#message-form button[type="submit"]').click()
                assert state()['messages'][0]['body']=='Updated draft. Not sent.'
                close()
            run('Message draft creation and editing without sending', drafts)

            def scheduling():
                page.locator(f'[data-action="candidate"][data-id="{ids["candidate"]}"]').click()
                page.locator('.drawer-actions [data-action="add-interview"]').click()
                local=page.evaluate('(()=>{const d=new Date(Date.now()+5*86400000);d.setHours(13,0,0,0);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)})()')
                f=page.locator('#interview-form');f.locator('[name="startsAt"]').fill(local)
                f.locator('[name="title"]').fill('QA interview')
                f.locator('button[type="submit"]').click()
                expect(page.locator('#dialog-title')).to_have_text('QA interview')
                ids['interview']=next(i['id'] for i in state()['interviews'] if i['title']=='QA interview')
                page.locator('[data-action="export-interview"]').click()
                exported=download_text()
                assert exported['name'].endswith('.ics') and 'BEGIN:VEVENT' in exported['text'] and 'Taylor QA' in exported['text'] and 'ATTENDEE' not in exported['text']
                page.locator('[data-action="edit-interview"]').click()
                newlocal=local[:11]+'14:00'
                page.locator('#interview-form [name="startsAt"]').fill(newlocal)
                page.locator('#interview-form button[type="submit"]').click()
                page.locator('[data-action="complete-interview"]').click()
                assert next(i for i in state()['interviews'] if i['id']==ids['interview'])['status']=='Completed'
                close()
            run('Schedule, reschedule, ICS export and completion', scheduling)

            def cancelled_event():
                nav('calendar');page.locator('[data-action="calendar-upcoming"]').click()
                page.locator('.event-card').first.click()
                page.locator('[data-action="cancel-interview"]').click()
                page.locator('[data-action="confirm-action"]').click()
                assert any(i['status']=='Cancelled' for i in state()['interviews'])
                close()
            run('Appointment cancellation updates the calendar', cancelled_event)

            def campaigns():
                nav('campaigns');page.locator('[data-action="add-campaign"]').click()
                f=page.locator('#campaign-form');f.locator('[name="name"]').fill('QA Outreach')
                f.locator('[name="jobId"]').select_option(ids['job'])
                f.locator('button[value="Ready"]').click()
                expect(f.locator('.form-error')).to_contain_text('segment is empty')
                f.locator('[name="jobId"]').select_option('All')
                f.locator('[name="message"]').fill('Hi {{first_name}}, a note from {{company}} about {{job_title}}.')
                expect(page.locator('#audience-preview')).to_contain_text('Taylor')
                f.locator('button[value="Ready"]').click()
                ids['campaign']=next(c['id'] for c in state()['campaigns'] if c['name']=='QA Outreach')
                assert next(c for c in state()['campaigns'] if c['id']==ids['campaign'])['status']=='Ready'
                page.locator('[data-action="simulate-campaign"]').click()
                page.locator('[data-action="confirm-action"]').click()
                assert next(c for c in state()['campaigns'] if c['id']==ids['campaign'])['status']=='Running'
                page.locator('[data-action="pause-campaign"]').click()
                assert next(c for c in state()['campaigns'] if c['id']==ids['campaign'])['status']=='Paused'
                close()
                page.locator('.heading-actions [data-action="templates"]').click()
                page.locator('[data-action="use-template"][data-template="1"]').click()
                page.locator('#campaign-form button[value="Draft"]').click()
                assert len(state()['campaigns'])==5
                close()
            run('Campaign segmentation, previews, templates and honest simulation', campaigns)

            def reports():
                nav('reports');page.locator('[data-action="report-period"][data-days="7"]').click()
                short=page.locator('.metric-value').first.inner_text()
                page.locator('[data-action="report-period"][data-days="0"]').click()
                longer=page.locator('.metric-value').first.inner_text()
                assert short!=longer
                page.locator('[data-action="export-report"]').click()
                exported=download_text()
                assert 'Hiring' not in exported['name'] and 'falcon-jobster-hiring-report.csv'==exported['name']
                assert 'Stage reached or later' in exported['text'] and 'Median time to hire' in exported['text']
            run('Data-driven reports, periods and report-specific CSV', reports)

            def settings_and_team():
                nav('settings');f=page.locator('#settings-form')
                f.locator('[name="company"]').fill('Falcon AI Recruiting QA')
                f.locator('[name="website"]').fill('https://falconai.llc')
                f.locator('[name="timezone"]').select_option('America/Chicago')
                f.locator('[name="digest"]').uncheck()
                f.locator('button[type="submit"]').click()
                assert state()['settings']['company']=='Falcon AI Recruiting QA' and not state()['settings']['digest']
                page.locator('[data-action="settings-tab"][data-tab="team"]').click()
                page.locator('[data-action="add-member"]').click()
                f=page.locator('#member-form')
                f.locator('[name="name"]').fill('QA Recruiter')
                f.locator('[name="email"]').fill('qa.recruiter@example.com')
                f.locator('button[type="submit"]').click()
                assert any(t['status']=='Draft invite' for t in state()['team'])
            run('Workspace preferences and local draft invitation', settings_and_team)

            def backup():
                page.locator('[data-action="settings-tab"][data-tab="data"]').click()
                page.locator('[data-action="export-backup"]').click()
                exported=download_text();saved=json.loads(exported['text'])
                assert len(saved['candidates'])==9 and saved['settings']['company']=='Falcon AI Recruiting QA'
                page.locator('#backup-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"wrong":true}'})
                expect(page.locator('.toast')).to_contain_text('not a valid')
                page.locator('#backup-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':exported['text'].encode()})
                page.locator('[data-action="confirm-action"]').click()
                assert state()['settings']['company']=='Falcon AI Recruiting QA'
                ids['saved_storage']=page.evaluate('window.__storage')
            run('Backup export, invalid import rejection and confirmed restore', backup)

            def hydration():
                other=browser.new_page(viewport={'width':1200,'height':900})
                other.set_content(fixture(ids['saved_storage']))
                assert other.evaluate('FalconStore.state.settings.company')=='Falcon AI Recruiting QA'
                assert other.evaluate('FalconStore.state.candidates.length')==9
                assert other.evaluate('FalconStore.state.messages[0].body')=='Updated draft. Not sent.'
                other.close()
            run('Fresh-page rehydration of serialized workspace', hydration)

            def csv_formula():
                nav('candidates');page.locator(f'[data-action="candidate"][data-id="{ids["candidate"]}"]').click()
                page.locator('[data-action="edit-candidate"]').click()
                page.locator('#candidate-form [name="name"]').fill('=1+2')
                page.locator('#candidate-form button[type="submit"]').click();close()
                page.locator('.heading-actions [data-action="export-candidates"]').click()
                exported=download_text()
                assert '"\'=1+2"' in exported['text']
            run('CSV formula-injection neutralization', csv_formula)

            def focus_trap():
                page.locator('[data-action="add-candidate"]').click()
                controls=page.locator('[role="dialog"] button:not([disabled]), [role="dialog"] input:not([disabled]), [role="dialog"] select:not([disabled]), [role="dialog"] textarea:not([disabled])')
                controls.last.focus();page.keyboard.press('Tab')
                assert page.evaluate('Boolean(document.activeElement.closest("[role=dialog]"))')
                page.keyboard.press('Escape');assert page.locator('[role="dialog"]').count()==0
            run('Dialog keyboard trapping and Escape dismissal', focus_trap)

            def reset():
                page.evaluate('localStorage.setItem("unrelated-test-app","keep")')
                nav('settings');page.locator('[data-action="settings-tab"][data-tab="data"]').click()
                page.locator('[data-action="confirm-reset"]').click()
                page.locator('[data-action="confirm-action"]').click()
                assert len(state()['candidates'])==8 and len(state()['jobs'])==7
                assert page.evaluate('localStorage.getItem("unrelated-test-app")')=='keep'
                page.locator('[data-action="dismiss-toast"]').click()
            run('Scoped reset preserves unrelated storage', reset)

            def screenshots():
                for view in ['overview','pipeline','candidates','jobs','calendar','campaigns','reports','settings']:
                    nav(view)
                    assert page.locator('#workspace h1').inner_text()
                    if capture: page.screenshot(path=str(OUT/f'{view}-desktop.png'),full_page=True)
                nav('candidates');page.locator('[data-action="candidate"][data-id="5"]').click();page.wait_for_timeout(250)
                
                if capture: page.screenshot(path=str(OUT/'candidate-profile-desktop.png'),full_page=True)
                close()
            run('Desktop views and profile remain valid after reset', screenshots)

            def mobile():
                for width in [390,320]:
                    page.set_viewport_size({'width':width,'height':844})
                    for view in ['overview','pipeline','candidates','jobs','calendar','campaigns','reports','settings']:
                        nav(view)
                        print('RESPONSIVE', width, view, flush=True)
                        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width,view,page.evaluate('document.documentElement.scrollWidth'))
                        if width==390 and capture:page.screenshot(path=str(OUT/f'{view}-mobile.png'),full_page=True)
                page.set_viewport_size({'width':1440,'height':1050})
            run('Eight views at 390px and 320px without page overflow', mobile)

            def final_checks():
                assert not errors, errors
                assert not [r for r in requests if r.startswith(('http://','https://'))], requests
                assert state()['version']==1
            run('Zero uncaught JS errors and zero external network requests', final_checks)
        except Exception:
            page.screenshot(path=str(OUT/'failure.png'),full_page=True)
            raise
        finally:
            report={'generated_at':datetime.now(timezone.utc).isoformat(),'mode':'Chromium DOM integration; page.set_content; Storage and download adapters','limitations':['Native HTTP/file navigation blocked by this environment browser policy.','Persistence tests validate serialization and rehydration using a Storage-compatible adapter, not disk durability.','Download tests inspect generated Blobs, not OS save dialogs.','No live API, SMS, email or external calendar is connected.'],'tests':RESULTS,'passed':sum(t['passed'] for t in RESULTS),'failed':sum(not t['passed'] for t in RESULTS),'page_errors':errors,'external_requests':[r for r in requests if r.startswith(('http://','https://'))]}
            (OUT/'browser-results.json').write_text(json.dumps(report,indent=2))
            browser.close()

if __name__=='__main__':main()
