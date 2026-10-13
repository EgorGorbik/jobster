# English / Russian localization — v1.1.0

## Design
`src/i18n.js` exposes `window.FalconI18n` and is loaded after the store and
before `app.js`. The dependency-free runtime uses readable English strings
as keys and a Russian catalog. Unknown keys fall back to the original
string. `dictionaryKeys` and `missingKeys` expose diagnostics.

The application translates explicit UI strings while rendering. It does
not traverse and replace arbitrary page text and does not send content to a
translation service. Record titles, names, locations, notes and message
bodies are escaped for display and are not passed through the UI dictionary.

`FalconI18n.t(key, values)` supports numeric placeholders `{0}`, `{1}`, etc.
Interpolation is a single pass: inserted values cannot recursively become
translation placeholders. The function returns text, not safe HTML. Use
`textContent` or the existing `esc()` helper at the HTML boundary.

Example for a DOM label:
```js
const I = window.FalconI18n;
button.textContent = I.t('Add candidate');
```

To add a string, add its English key and Russian value to the `RU` catalog,
then call `I.t()` at the corresponding display site. Avoid concatenating
translated sentence fragments; use a full sentence with numbered
placeholders. Do not translate stored IDs, URLs, action names or routes.

## Preference and compatibility
- Locale preference: `falcon-jobster:locale:v1`, values `en` or `ru`.
- Existing dataset: `falcon-jobster:interactive:v1`, unchanged schema.
- English is the default for an empty or invalid locale preference.
- Switching language does not update candidate, job, message or event data.
- The UI preserves its current search, filters, selection, view and unsaved
  workspace-settings fields while rebuilding translated chrome.
- Modal backdrops make the topbar inert; the language switch cannot discard
  an open dialog draft.
- Settings has the same immediate-switch language control as the topbar.
- The locale is a device/browser preference, not a server-side user profile.
  It is intentionally separate from the existing workspace JSON backup.
- Storage exceptions produce a session-only locale warning. The app remains
  usable, without promising disk persistence.
- The separate HTML filename may use different browser storage when opened
  via `file:`. Export JSON from the old copy and import it into the new copy
  when moving between filenames, browsers or hosting origins.

## Controlled labels versus records
Canonical stage values remain `New`, `Screening`, `Interview`, `Offer`,
`Hired`. Job status, source, interview type and campaign status identifiers
also retain their existing values. Option labels and badges translate at
render time; option `value` attributes do not.

Existing English system activity strings are localized using the catalog
and anchored rules for known event formats. These rules are used only for
system history/toast text. They are not applied to candidate notes or
message bodies.

English U.S. outreach template bodies remain English. Template controls and
explanations are localized. User-authored content remains as authored,
including a title such as "Interview" that happens to match a UI key.

## Locale-sensitive output
`Intl.DateTimeFormat` uses `en-US` or `ru-RU`, retaining the workspace
timezone. Calendar weeks start Sunday for English and Monday for Russian.
Underlying ISO dates and interview instants are unchanged.

`Intl.NumberFormat`, `Intl.PluralRules` and `Intl.RelativeTimeFormat`
handle numeric formatting, supported counted nouns and relative days.
Native form-validation popovers are replaced with localized inline errors,
including required, email, URL and range checks; existing business-level
validation remains in place.

CSV headers and controlled UI labels follow the selected locale; names and
user data remain unchanged. Existing formula-prefix neutralization remains.
JSON backup retains canonical values, allowing old backups to be restored.
ICS keeps standard field names, UTC timestamps and UTF-8 folding; explanatory
description text is localized. No invitation is sent.

## Build and tests
```bash
npm run build
npm test
npm run test:e2e
npm run test:i18n
```

The standalone build inlines the same source catalog and runtime. No network,
translation API or external package is required at runtime.

`tests/i18n.test.mjs` checks defaults, preference validation/persistence,
fallbacks, interpolation safety, plurals, dates/numbers, system messages and
storage errors. `tests/language_browser.py` checks both language controls,
all eight translated views, original data compatibility, form behavior,
exports and responsive layouts. See `QA.md` for exact environment limits.
