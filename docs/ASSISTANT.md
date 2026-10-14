# Falcon Jobster — AI Assistant (v2.2.0)

## Overview

The assistant appears in the **lower-right corner** on every page after the main workspace loads. The green EN/RU interface, candidate pipeline, SQLite database and existing application features are preserved.

The integration uses OpenAI's **Responses API** from the **Node.js backend**. The API key never appears in HTML, JavaScript, browser storage, cookies, or the assistant's HTTP responses.

**No OpenAI key was available in the delivery environment.** The live provider connection therefore requires one configuration step by the server owner. The standalone HTML intentionally does not call OpenAI and shows a disabled chat with setup guidance. Do not paste your API key into the chat or frontend.

## Connect your key

1. Use Node.js **22.16+**.
2. Copy `.env.example` to `.env` and configure your Jobster admin credentials as described in the main README.
3. Add these settings to the **server's** `.env`:

   ```dotenv
   OPENAI_API_KEY=your_real_secret_key_here
   OPENAI_MODEL=gpt-4.1-mini

   # OpenRouter also works: paste sk-or-v1-... into OPENAI_API_KEY
   # (or OPENROUTER_API_KEY) and use an OpenRouter model id:
   # OPENAI_MODEL=openai/gpt-4o-mini
   ```

4. Start the server:

   ```bash
   npm run backend:init    # first time only
   npm run backend:start
   ```

5. Open `http://127.0.0.1:4174`, sign in as Owner/Admin, click **AI Assistant / ИИ-ассистент** in the lower right and send a question.

If deploying with Docker Compose, set `OPENAI_API_KEY` only inside the host `.env` (already loaded through `env_file`); restart/redeploy the `jobster` service. For Render, put `OPENAI_API_KEY` and optional `OPENAI_MODEL` in the **service environment variables**, not the GitHub repository. Always keep `.env` uncommitted.

An OpenAI API subscription/usage billing may be required. **ChatGPT subscription access does not automatically supply a server API key.**

## User-facing behaviors

- Status `Key configured / Ключ настроен` means the server key is present. It is **not a live credentials validation**; an invalid key is reported after sending a message.
- Status `API key required / Нужен API-ключ` means the server key is absent or rejected. The chat input is disabled until configured.
- Offline standalone HTML: the button and local setup guide are visible, but live chat is disabled to avoid exposing a secret in the browser.
- Prompt suggestions and multi-turn dialogue are available in server mode.
- Languages: Russian and English follow the existing interface language switcher without clearing the conversation.
- `New conversation / Новый диалог` clears session-only chat history and the summary permission. No chat history is written to the Jobster SQLite database or to localStorage.
- The assistant is **read-only**: it cannot move candidates, send SMS/email, create interviews, or change workspace records.
- When `Include aggregate workspace statistics / Включить сводную статистику` is enabled, the server sends only numerical totals (candidate counts by stage, active/paused jobs, scheduled interviews and campaign drafts) to OpenAI. This is **off by default**. No candidate names, emails, phone numbers, notes, interview details or individual job titles are sent automatically.
- Questions typed directly into the chat are sent to OpenAI. Users must avoid sensitive applicant information and secrets in their messages.

## API

All routes require a valid `jobster_session` HttpOnly SameSite cookie from a signed-in Owner/Admin. Endpoints enforce the existing same-origin check and never return the API key.

`GET /api/assistant/status`

```json
{
  "configured": true,
  "provider": "OpenAI",
  "model": "gpt-4.1-mini",
  "readOnly": true
}
```

`POST /api/assistant/chat`

```json
{
  "message": "Draft fair interview questions for a CDL driver",
  "history": [{"role":"user","content":"Hello"}, {"role":"assistant","content":"Hi!"}],
  "language": "en",
  "includeSummary": false
}
```

Successful response:

```json
{"reply":"...", "model":"gpt-4.1-mini", "summaryShared":false}
```

Failures: `401` unauthenticated; `403` forbidden/cross-origin; `405` wrong method; `413/415/422` invalid body; `429` rate limit; `502/504` upstream error/timeout; `503` missing API key. The backend returns sanitized upstream errors without leaking server secrets.

## Operational and security details

- OpenAI endpoint: `https://api.openai.com/v1/responses` (keys `sk-...`).
- OpenRouter endpoint: `https://openrouter.ai/api/v1/chat/completions` (keys `sk-or-...` or `OPENROUTER_API_KEY`).
- Default OpenAI model: `gpt-4.1-mini`. Bare model names are auto-prefixed with `openai/` on OpenRouter.
- Model override: `OPENAI_MODEL`.
- Responses are requested with `store:false`; no tools/action permissions are granted.
- Conversation input: one new user message (1–3000 characters) and up to 12 previous user/assistant messages (bounded to 10,000 characters overall).
- Maximum output request: 700 tokens; upstream timeout: 25 seconds.
- Per-user rate limit: 10 assistant requests per 60 seconds, held in server memory.
- No transcript database is implemented; conversation context is stored only in page memory and transmitted with each question.
- Explicit `Content-Type: application/json` and `Origin` / `Sec-Fetch-Site` controls.
- API key is never logged, persisted in SQLite, included in HTML, returned in an API response, or stored in the browser.
- Model output is inserted via `textContent` (not `innerHTML`) to prevent script injection.

This is a **server-integrated MVP**. Before using real applicant data, perform a security, privacy, retention, and procurement review. Avoid sharing PII in AI chat, even if you're signed in.

## Checks

- `npm test` includes tests for auth, origin checks, input validation, context minimization, provider failure handling, rate limiting and unchanged core Jobster features.
- Chromium in the QA container blocks local/file URL navigation administratively, so visual checks loaded the built HTML in Chromium using `page.set_content`. EN/RU dialog, prompt suggestions, mocked provider chat, opt-in control, resetting, keyboard submit and responsive 1440/390/320 widths were checked. Mocked provider tests **do not prove that a real OpenAI key works**.
- All preview images using a configured key are mock-ups driven by a **simulated API response**, not evidence of a live model call.
