# QA — AI Assistant, v2.2.0

- `npm test`: **50/50 pass** (41 previously existing tests, 9 new AI-assistant tests).
- `npm run build`: passing, self-contained `dist/index.html`.
- Browser UI via Chromium `page.set_content`: **6/6 scenario groups pass**, no JavaScript page exceptions.
- Standalone 1440x900, 390x844, 320x720: button visible; panel aligned and fits viewport; disabled offline input; close works.
- EN/RU switch: existing UI and new assistant labels update; the open panel retains chat messages.
- Stub-provider browser tests: configured status, question submission with Enter/button, short multi-turn conversation, opt-in aggregate summary switch, reset to a new conversation.
- `tests/assistant.test.mjs`: requires auth, checks origin and method, validates history/size, ensures server key never reaches browser responses, provider error sanitization, read-only anonymous summary, rate limiting, and missing-key mode.
- `src/styles.css` SHA-256 matches v2.1.1 green release byte-for-byte. Original tests and recruitment features pass unchanged.

**Limitations:** This environment has no customer OpenAI key, so tests use simulated provider responses; these are not proof of production connectivity. Chromium browser navigation to `127.0.0.1` and `file://` is blocked by administrator policy in the test container, so visual testing loaded exactly the generated standalone HTML with `page.set_content` rather than actual navigation. User-space browser storage was mocked only to produce cleaner screenshots. Live auth/database integration was covered by Node HTTP tests.

**OpenAI key must be set server-side** before chat can provide real model answers.
