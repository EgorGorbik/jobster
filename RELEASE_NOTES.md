# Falcon Jobster 2.2.0 — Floating AI Assistant (Green EN/RU)

- Added fixed lower-right AI Assistant button and chat in English/Russian.
- Chat attaches to existing green frontend, including mobile view and server-login mode.
- Added server-side OpenAI Responses API proxy with `OPENAI_API_KEY` / `OPENAI_MODEL` environment variables.
- Session-only multi-turn chat, localized prompts, keyboard send, clear conversation.
- Optional opt-in aggregate workspace statistics (counts only, no applicant identifiers).
- Protected by existing session auth, same-origin checks, rate limits, input limits and timeout.
- No database schema changes; assistant is read-only; no message sending or candidate scoring.
- Standalone HTML displays a truthful setup/disabled-chat state; it never embeds the API key.
- Original green `src/styles.css` was not changed. EN/RU translations remain intact.
- Provider integration is testable with a stub, but live OpenAI calls require a customer-owned key.
- See [AI Assistant guide](docs/ASSISTANT.md).

---

# v2.1.1 — Restore v2.0.0 green theme

- Restored `src/styles.css` and the green favicon / browser theme / page title from 2.0.0.
- Removed Black & Gold styling from both frontend entry points and from the standalone build.
- Left the former theme URL available as an empty compatibility file so the backend code
  does not require any change.
- Retained all latest frontend JavaScript behavior, server/API/database/authentication code,
  language dictionaries (English and Russian), and test suites.
- No database migrations, API schema updates, nor behavior changes were introduced.

---

# v2.1.0 — Premium Black & Gold frontend

- Rebuilt the presentation layer around a charcoal, antique-gold and warm-ivory palette.
- Restyled navigation, brand monogram, overview hero, KPI cards, charts, hiring pipeline, candidate directory, jobs, calendar, campaigns, reports, settings, forms, dialogs, and authenticated sign-in.
- Extended CSS styling through `src/theme-black-gold.css`, layered on top of the dark base styles.
- Preserved offline single-file build, English/Russian locale switching, mobile layouts and existing application behavior.
- Updated favicon, page metadata and login-screen bilingual messaging.
- Updated full-stack asset server to serve the premium theme CSS.
- All 41 unit/API tests passed, plus 24 main browser scenarios and 17 bilingual browser scenarios in the test environment.
- No database migrations, API schema changes, messaging integrations, or production deployments.

---

# Falcon Jobster 2.0.0 - Backend MVP

Delivered: Node.js/SQLite server, first-admin initialization, password login and revocable HttpOnly sessions, workspace-scoped REST endpoints, atomic state revisions, candidate/job/interview/campaign/message-draft CRUD, candidate stage/archive/notes actions, derived reports, server-side audit log, role-gated API operations, and bilingual frontend authentication/sync.

The original offline bilingual demo is still available via `npm run build`. On backend startup, workspaces are empty unless the owner explicitly imports a prior JSON backup.

Security controls in MVP: scrypt password hashing, SameSite session cookies, optional Secure cookies, JSON-only writes, origin validation, record and relationship validation, SQLite disk permissions/WAL, request body caps, login attempt throttling, and no enabled delivery integrations.

Automated tests: 41 passing (28 original frontend, 11 backend API, 2 remote adapter). Live HTTP health, login, and state retrieval returned 200. Playwright browser navigation was blocked by the container administrator policy and was not counted as passing; a runnable smoke test is included for an authorized browser environment.

Limits: no real email/SMS, calendar invites, job board publishing, AI candidate scoring, production MFA/SSO, hosted deployment, external backups, or browser-level penetration/security review. Only Owner/Admin can use the full workspace UI; Recruiter and Viewer API permissions do not have a full role-specific UI yet.

See [docs/BACKEND.md](docs/BACKEND.md) for setup, API and production precautions.
