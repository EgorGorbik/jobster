# QA — Green theme rollback (v2.1.1)

## Scope

The v2.0.0 green stylesheet was copied back **byte-for-byte** and the original
HTML color metadata and build pipeline were restored. The latest JavaScript,
REST backend, SQLite, session logic, and language dictionary are unchanged.
The Black & Gold override is not loaded or inlined.

## Results

- `npm run build`: **PASS** — single-file `dist/index.html`, 268,679 bytes.
- `npm run test:all`: **41/41 PASS** — frontend data, EN/RU i18n, API/backend, remote sync.
- `python tests/browser.py`: **24/24 PASS** — navigation, forms, calendar, campaigns,
  kanban drag-and-drop, export/import, keyboard controls, 390px and 320px layouts.
- `python tests/language_browser.py`: **17/17 PASS** — EN/RU forms, dates, calendar,
  candidate actions, exports, templates and mobile layouts.
- Playwright screenshots: overview EN and RU, mobile RU and backend login EN and RU.
- Computed CSS: workspace background `rgb(245, 246, 242)`; sidebar
  `rgb(24, 63, 53)`; `--dark: #183f35`.
- No uncaught JS page errors or external requests in interactive browser tests.
- SHA/byte comparison: backend source, app logic, sync adapter, seed/store, icons
  and EN/RU dictionaries **identical** to the Black & Gold input version.
- Style byte comparison: `src/styles.css` **identical** to full-stack v2.0.0.

## Caveats

Automated browser tests use Playwright `set_content()` with in-memory localStorage
because direct Chromium navigation is limited in this execution environment.
They verify UI interactions and serialization but not a production deployment,
remote browser storage durability, or a full server-authenticated browser journey.
Backend REST/auth tests are exercised by Node tests; login screenshots use a
simulated unauthenticated response **only for visual inspection**.

This build has not been deployed publicly or committed to GitHub. The backend
remains an MVP, with no enabled SMS/email sending or calendar invitation services.
