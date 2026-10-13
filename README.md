# Falcon Jobster — Green Theme + AI Assistant (v2.2.0)

Bilingual **EN / RU** recruiting workspace, with the original forest-green and sage visual design
from full-stack version **2.0.0** restored. All functionality and the authenticated Node.js +
SQLite backend from the previous project have been preserved. A read-only AI assistant
is now available in the lower-right corner when configured with a server-side key.

## 1. Standalone HTML (offline demo)

Open `dist/index.html` directly in your browser (or use the separately supplied
`Falcon-Jobster-Green.html`). All JavaScript and CSS are bundled into that file.
It uses **sample data stored in this browser**, not the server. The AI button opens
a setup panel, but live AI chat requires backend mode to keep the API key private. Click **EN** / **RU** in the
header or change the setting under workspace preferences.

## 2. Run full-stack app with backend

Requirements: **Node.js 22.16+**. No npm dependency installation is required.

```bash
cp .env.example .env
```

Set `JOBSTER_ADMIN_EMAIL` and `JOBSTER_ADMIN_PASSWORD` to your own secure values in `.env`.
To enable the AI assistant, also set `OPENAI_API_KEY` in the **server-only** `.env`
(optional `OPENAI_MODEL`, default `gpt-4.1-mini`). Never put API keys in HTML,
JS files, a Git commit, or the AI chat. See [AI assistant guide](docs/ASSISTANT.md).
Then run:

```bash
npm run backend:init
npm run backend:start
```

Open `http://127.0.0.1:4174`. The login page also uses the restored green visual theme.
Workspace data is stored in SQLite; the backend exposes authenticated REST endpoints.
See [backend documentation](docs/BACKEND.md) for API and deployment details.

## 3. Frontend development / build

```bash
npm run dev              # frontend preview, typically http://127.0.0.1:4173
npm run build            # regenerate the standalone dist/index.html
npm run test:all         # frontend, localization, REST/API and sync unit tests
```

Additional browser interaction checks (Playwright + Chromium, if available):

```bash
python tests/browser.py
python tests/language_browser.py
```

## What's included

- Candidate pipeline, notes, archive, filters, bulk actions, CSV exports and search
- Jobs, interviews, calendar/ICS, message drafts, campaigns, reports and workspace settings
- English/Russian UI with persisted language preference, localized labels and dates
- Authenticated backend with SQLite persistence, role-gated REST endpoints and revision checks
- Lower-right AI assistant: bilingual chat, opt-in anonymous totals, server-side OpenAI Responses API
- Dockerfile, compose configuration, tests and technical documentation

## Theme rollback details

- `src/styles.css` is restored **byte-for-byte** from the 2.0.0 package.
- `index.html` has the original green favicon and browser theme and loads a single stylesheet.
- The Black & Gold theme is no longer applied or bundled.
- `src/theme-black-gold.css` is an empty compatibility placeholder to preserve the
  existing static route in the **unchanged** backend source.
- Existing recruiting functionality, backend data model, EN/RU translations and original tests remain intact.
- New assistant integration is isolated in `src/assistant.js`, `src/assistant.css` and `server/assistant.mjs`; only minimal mounting/routing changes were needed.
- The latest login-screen RU notice and the non-functional `data-view` attribute remain.

## Limitations

The standalone HTML is a **local demo**. Server mode is an **MVP**, not a hardened production
SaaS; it has no real email/SMS delivery, calendar invitations, automated AI candidate scoring, or
external integration. Review security, privacy, backups and deployment before storing real
applicant personal data. This task did not deploy a website or push code to GitHub.

More: [design system](docs/DESIGN_SYSTEM.md) · [QA results](docs/QA-GREEN-ROLLBACK.md) ·
[architecture](docs/ARCHITECTURE.md) · [localization](docs/LOCALIZATION.md).
