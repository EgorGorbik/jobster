# Falcon Jobster backend (Node.js + SQLite)

This is a **working MVP backend**, wired to the existing English/Russian UI. The standalone browser-only build remains available through `npm run build` and `dist/index.html`. No live email, SMS, calendar invites, real AI matching, job posting, or notification delivery is implemented.

## Requirements

- Node.js **22.16+**; `node:sqlite` is built-in and displays an experimental feature warning in Node 22. Test against your production Node version before deployment.
- No npm dependencies or external database service.
- Store the database on a persistent local disk or mounted volume with restricted permissions.

## Start with a new workspace

```bash
cp .env.example .env
```

Edit `.env` and set **your own** `JOBSTER_ADMIN_EMAIL`, `JOBSTER_ADMIN_PASSWORD` (12+ strong characters), `JOBSTER_COMPANY`, and optionally `JOBSTER_ADMIN_NAME`. Never commit `.env` or place the password in frontend code. The example email is not an account until you initialize the database.

```bash
npm run backend:init
npm run backend:start
```

Open <http://127.0.0.1:4174> and sign in. The backend creates an **empty workspace**, not fabricated applicants. In the UI create a job first, then a candidate; data is saved to SQLite and survives refresh and a server restart. EN/RU remains switchable. UI record mutations synchronize through an atomic versioned snapshot endpoint. User-provided notes/names are not translated.

To migrate your previous frontend data, export a JSON backup from the old standalone app, sign in to the backend UI, and use **Settings > Data & privacy > Import JSON**. The import replaces the current workspace after confirmation. Back up server data before importing.

### Docker Compose (local/private server)

```bash
docker compose build
docker compose run --rm jobster node server/cli.mjs init
docker compose up -d
```

The example binds to `127.0.0.1:4174`, not the public internet. Add a tested HTTPS reverse proxy and harden hosting before external exposure. Compose persists SQLite in `jobster_data`. Do not put passwords directly in `compose.yaml`.

### Run tests

```bash
npm run test:all
npm run build
```

An optional Playwright smoke test `python tests/backend_browser.py` expects a running local backend and environment variables `JOBSTER_ADMIN_EMAIL`, `JOBSTER_ADMIN_PASSWORD`; it creates a test job. Run only against a throwaway workspace. Browser tests require Python Playwright + a permitted Chromium environment. The test browser in the current ChatGPT container blocked navigation by administrator policy; the API tests did run.

## REST endpoints

All URLs are relative to the same origin. Use a session cookie issued by `POST /api/auth/login`. Mutating methods accept only `Content-Type: application/json`. Cross-site requests and mismatched `Origin` are rejected. There is no CORS access.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/healthz` | Public health status (no records) |
| POST | `/api/auth/login` | `{email,password}`, issues HttpOnly SameSite=Strict cookie |
| GET | `/api/session` | Current session and role |
| POST | `/api/auth/logout` | Revoke current session |
| POST | `/api/auth/password` | `{currentPassword,newPassword}`, invalidates sessions |
| GET / PUT | `/api/state` | Snapshot `{revision,state}`; PUT requires current revision |
| GET / PUT | `/api/workspace/state` | Alias of `/api/state` |
| GET / PATCH | `/api/workspace` | Settings, partial updates |
| GET / POST | `/api/jobs` | List/create positions |
| GET / PATCH / DELETE | `/api/jobs/:id` | Read/update/delete unreferenced job |
| GET / POST | `/api/candidates` | Filter/create candidates |
| GET / PATCH | `/api/candidates/:id` | Read/modify candidate (no hard deletion) |
| POST | `/api/candidates/:id/stage` | `{stage}` and timestamped history |
| POST | `/api/candidates/:id/archive` | `{archived:true/false}` |
| POST | `/api/candidates/:id/notes` | `{notes}` |
| GET / POST | `/api/interviews` | Appointments, no invitations sent |
| GET / PATCH / DELETE | `/api/interviews/:id` | Appointment edits |
| GET / POST | `/api/messages` | Drafts only, no sends |
| GET / PATCH / DELETE | `/api/messages/:id` | Draft updates |
| GET / POST | `/api/campaigns` | Campaign definitions/simulation status only |
| GET / PATCH / DELETE | `/api/campaigns/:id` | Campaign updates |
| GET / POST | `/api/team` | UI directory entries; separate from login accounts |
| GET / PATCH / DELETE | `/api/team/:id` | UI directory management |
| GET | `/api/activity` | User-facing recent activity |
| GET | `/api/reports` | Server-derived counts only |
| GET | `/api/audit` | Security-relevant server-side mutation log (Owner/Admin) |
| GET / POST | `/api/users` | Actual login users; POST Owner only, `{email,name,password,role}` |

Lists are paginated with `?limit=50&offset=0` (max `limit=200`); filter candidates using `?jobId=...&stage=...&archived=false`, for example. **Backend roles**: Owner/Admin can use the full web UI and state sync. Recruiter can use allowed REST entity mutations, not the full snapshot UI; Viewer can use read-only REST endpoints. The UI *team directory* remains separate from authenticated `users`. Invitations and password reset emails are not implemented.

### Example (curl cookie jar)

```bash
curl -sS -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YOUR_STRONG_PASSWORD"}' \
  http://127.0.0.1:4174/api/auth/login
curl -sS -b cookies.txt http://127.0.0.1:4174/api/state
curl -sS -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"title":"CDL Driver","department":"Operations","location":"Chicago, IL","openings":1}' \
  http://127.0.0.1:4174/api/jobs
```

Do not use a shell command containing a production password; the snippet is an illustrative request only. Prefer a trusted client or password input method that avoids shell history. `cookies.txt` contains a live session secret; delete it and never check it into version control.

### Concurrency and snapshot integration

The frontend retains the original synchronous interaction model but queues API `PUT /api/state` writes. The server verifies the `revision`, validates all linked records, and commits atomically. If a write fails or another tab changed the server revision, the UI shows an **unsaved-changes warning** with export/reload controls; it never silently overwrites the newer revision. Before closing the tab with pending writes, the browser warns about potential data loss. Unconfirmed changes are held in memory only. Avoid concurrent editing in this MVP.

Direct resource routes mutate the latest workspace revision atomically. Clients can send an `If-Match: <revision>` header for additional optimistic concurrency.

## Security and operational notes

Implemented: scrypt password hashing, hashed random session tokens stored in SQLite, HttpOnly SameSite=Strict cookies (and Secure when configured), per-request auth, workspace scope, actual backend roles, strict Origin checks for modifying requests, JSON-only mutation API, max request size 4 MB, immutable database audit entries for writes, server-side validation and foreign-reference checks, safe HTML response CSP and security headers, SQLite WAL and 0600 DB file mode, and basic in-memory sign-in attempt limiting.

Not yet sufficient for production with personal applicant information: MFA/SSO, trusted ingress and distributed rate limiting, account invite/recovery flow, dedicated secrets manager, formal automated backup/restore rotation and restore drills, retention/deletion workflows, security monitoring, penetration testing, legal privacy/consent review, comprehensive RBAC UI, independent record-level auditing, HA/scaling and verified encrypted transport/storage are still needed. The service is not certified for any specific regulatory program.

For HTTPS deployment set `HOST=0.0.0.0`, `NODE_ENV=production`, `JOBSTER_COOKIE_SECURE=true`, and `JOBSTER_ORIGIN=https://your-domain.example` behind a trusted TLS reverse proxy. **Do not expose the HTTP-only development configuration publicly.** The basic login rate limiter is per Node process and should be supplemented at the ingress. Restrict access to the server, SQLite DB, WAL/SHM files and backups. Stop writes or take an SQLite-consistent backup; do not copy only the main database file while WAL changes may be pending.

Backups: you can export the JSON snapshot through the UI (requires Owner/Admin). Backups include candidate personal data and should be encrypted and access controlled. Password hashes/sessions are not part of the JSON export. Account and workspace security configuration stays on the server.
