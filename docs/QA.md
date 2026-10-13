# Quality checks — bilingual release 1.1.0

## Completed on the delivered build
- All five browser JavaScript source files passed `node --check` during build.
- 28 Node tests passed: 16 original data/store tests and 12 localization tests.
- 24 grouped original English browser regression checks passed.
- 17 grouped English/Russian browser checks passed.
- All eight screens were exercised in Russian on desktop and at widths of
  390 and 320 pixels, without document-level horizontal overflow.
- No uncaught JavaScript errors or external requests occurred in either
  completed browser suite.
- The bilingual suite reported no missing UI dictionary keys on the exercised
  paths. This is a diagnostic of covered paths, not an exhaustive proof over
  every possible record, error or browser behavior.
- Fresh-seed desktop Russian overview, pipeline, calendar and settings,
  mobile Russian overview and English overview were captured for visual review.
  Screenshots show fictional sample records, not customer results.

Recorded evidence:
- `unit-test-results.txt`
- `browser-results.json`
- `language-results.json`
- `screenshots/`

## Bilingual coverage
The additional suite checks immediate language switching, accessible button
states and document language, unchanged record snapshots, persisted locale
serialization, all eight page titles, unsaved settings, filters and selection,
Russian Monday-first and English Sunday-first calendars, numeric locales,
required/email validation, Cyrillic candidate creation, safe note rendering,
stage transitions, localized system history and notices, CSV headers,
unchanged user-entered titles, English U.S. message bodies, interview creation,
ICS content, campaign preparation, team/integration labels, compatible JSON
backups, storage failure behavior and mobile controls/dialogs.

## Retained application coverage
The original suite checks navigation, candidate creation/editing, duplicate
validation, drag-and-drop and direct stage changes, favorites, archive/restore,
notes, bulk actions, XSS escaping, jobs and status changes, drafts, appointments
and their lifecycle, campaign segmentation and demo states, reports, workspace
preferences, team records, JSON export/import and invalid backups, fresh-page
data hydration, CSV formula protection, dialog focus/Escape and scoped reset.

## Browser harness boundaries
The execution environment's managed Chromium blocks native HTTP and file
navigation. Both browser suites render the generated HTML using
`page.set_content`, without bypassing that policy.

The harness supplies an in-memory Storage-compatible adapter and captures
generated download Blobs. Tests establish serialization/rehydration and export
contents. They do **not** establish native localStorage disk durability,
per-file origin behavior, actual browser reload persistence, OS save dialogs,
or browser navigation through a deployed web server. Fresh-document hydration
means a new document with previously serialized adapter data.

The shipped app uses ordinary browser localStorage and standard Blob downloads,
not those test adapters. A normal launch and browser-specific storage check on
the destination machine remain advisable. No live accounts, backend, provider
callbacks, production deployment or cross-browser certification were tested.

`ARCHIVE-AUDIT.md` describes the original archive. `server-results.json` and
unprefixed older screenshots are retained from the earlier delivery; they are
not new bilingual browser test evidence.

## Reproduce
```bash
npm run build
npm test
npm run test:e2e
npm run test:i18n
```

Browser tests need Python, Playwright and Chromium. `CHROMIUM_PATH` selects
an installed executable. The original suite also accepts `QA_OUTPUT` and
`CAPTURE_SCREENSHOTS=1`. The bilingual suite writes to `test-results/`.
