# Uploaded archive audit

Source: `falcon-jobster-us-frontend.zip`.

The archive contained five files and one explicit directory entry, with 62,250 uncompressed file bytes:

| Original file | Bytes | Role |
|---|---:|---|
| `app.js` | 33,762 | Monolithic vanilla-JavaScript recruiting UI, sample fixtures, rendering, events and persistence |
| `src/styles.css` | 26,568 | Forest/teal desktop and responsive UI styles |
| `README.md` | 938 | Claimed frontend features and local-run instructions |
| `index.html` | 799 | Root mount, absolute asset paths and remote Google Fonts references |
| `package.json` | 183 | Python static-server dev command and JS syntax-only build command |

## Likely purpose

A U.S. recruiting/ATS frontend prototype for high-volume hiring. Its original seven navigation screens were Overview, Pipeline, Candidates, Jobs, Campaigns, Reports, and Settings. It was not a backend service or an installed application framework.

## Important findings

- The whole application was in one 68-line JavaScript file with long template strings and embedded sample data.
- Candidate movement and candidate/job creation existed; many other controls only displayed toasts or had no handler.
- Campaign data was a constant and new campaigns were not actually stored.
- Messaging and scheduling controls only displayed placeholder notifications.
- Favorites, archive, several settings sections, and job action controls were not fully implemented.
- Overview/report figures mixed real demo record counts with fixed illustrative metrics.
- Candidates were matched to jobs by title strings, not stable job references. Two candidate roles lacked corresponding job fixtures.
- Candidate/job state used localStorage. Loading used unguarded JSON parsing, so malformed saved content could stop initialization.
- Reset called `localStorage.clear()`, which could clear unrelated same-origin application data.
- The build script checked only JavaScript syntax; there was no compiled distribution, automated test suite, authentication, database, API, or deployment configuration.
- Absolute `/app.js` and `/src/styles.css` paths were inconvenient for opening the unpacked files directly.
- Remote fonts introduced a network dependency.

## Changes in this delivery

The linked data model now uses stable IDs. Two matching role fixtures were added to resolve the original role references without inventing compensation figures. Placeholder interactions were replaced with local workflows. Sample metrics were replaced with record-derived calculations. Unsafe unescaped record output was replaced with consistent escaping. Reset is app-scoped, storage loading is guarded, and backups are schema-validated. The build creates a standalone file with no external font or library dependency.

Start with `README.md`, then `src/seed.js`, `src/store.js`, and `app.js`. For backend work, start at the store boundary and the contracts in `ARCHITECTURE.md` rather than replacing the visual layer first.
