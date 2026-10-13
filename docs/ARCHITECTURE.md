# Architecture and extension guide

## Runtime

`index.html` loads `styles.css`, `icons.js`, `seed.js`, `store.js`, `i18n.js`, and then `app.js`. Script order is explicit. The app is plain browser JavaScript without a dependency manager or framework runtime.

The standalone build inlines the same files in the same order. There are no network API calls.

## Localization boundary

`FalconI18n` handles English/Russian UI text, locale-sensitive formatting and a separate browser language preference. It does not mutate the store schema or translate record content. See `LOCALIZATION.md` for the display/data boundary and extension rules.

## Relationships

```text
Workspace settings + local team directory
                |
Jobs <--- Candidate.jobId
                |
Candidates -----+---- Interview.candidateId
                +---- MessageDraft.candidateId
                +---- Per-candidate activity history
                |
                +---- Campaign audience: job + stage + favorites filters
                |
                +---- Overview and reports: derived counts and cohorts

All collections -> validated store -> localStorage / JSON backup
```

Candidate archive is a reversible flag, not deletion. Notes, messages and appointments remain associated with archived records. Job changes retain the job ID, so linked candidates immediately display the new title. Team name edits update owner/interviewer labels in related local records.

## Code boundaries

- `FalconSeed()` returns a fresh fictional workspace with timestamps relative to initialization.
- `FalconStore.state` provides the current read model.
- `FalconStore.update(mutator)` clones, applies a mutation, validates the result, then replaces the state and attempts storage persistence.
- `FalconStore.log()` records a local workspace event, capped at 200 entries.
- `restore()` validates all collections and key foreign references before replacing state.
- `app.js` renders views and uses delegated actions for navigation, dialogs, forms, filters, selection and downloads.
- Hash routes are `#/overview`, `#/pipeline`, `#/candidates`, `#/jobs`, `#/calendar`, `#/campaigns`, `#/reports`, `#/settings`; candidate deep links can use `#/candidates/<id>`.

## Suggested implementation order for a real product

1. Define tenant, user and permission models, and implement authentication outside this local demo.
2. Add persistent jobs, candidates, candidate-history, interview and draft-message endpoints. Preserve entity IDs and explicit archive behavior.
3. Introduce an asynchronous API adapter and loading/error/concurrency states at the store boundary. The present store is synchronous; changing the adapter alone is not a complete backend integration.
4. Add server-side audit history, validation, pagination, filtered exports and optimistic concurrency control.
5. Connect messaging/calendar providers on the server. Replace simulation controls only after the relevant authorization and delivery flows exist.
6. Implement applicant-data privacy/security requirements and review before introducing real records.
7. Exercise real authentication, tenant isolation, browser storage behavior, actual provider callbacks, rate limits, backups and deployment controls in staging.

## Proposed endpoints, not implemented APIs

| Resource | Example route | Responsibility |
|---|---|---|
| Session | `/api/session` | Authenticated user, tenant and capabilities |
| Jobs | `/api/jobs`, `/api/jobs/:id` | CRUD/status with server validation |
| Candidates | `/api/candidates`, `/api/candidates/:id` | Filtered records, edits, archive |
| Stage events | `/api/candidates/:id/stage` | Stage transition with audit history |
| Notes | `/api/candidates/:id/notes` | Timestamped author-attributed notes |
| Drafts | `/api/message-drafts` | Draft content without sending |
| Interviews | `/api/interviews` | Timezone-aware appointments and availability |
| Campaigns | `/api/campaigns` | Audience definition, preview, review and lifecycle |
| Reports | `/api/reports/hiring` | Clearly defined cohort calculations |
| Workspace | `/api/workspace` | Settings, team membership and permissions |

These are development suggestions, not routes served by this package. The demo CSP deliberately sets `connect-src 'none'`.

## Current limits

The local store provides no cross-device synchronization, encryption boundary, authentication or authorization. Multiple tabs use last-write-wins updates, not collaborative concurrency control. Raw candidate ratings are manual inputs, not validated assessments. Interview conflict checking covers only the local interviewer schedule, not external calendar availability. Scheduling uses the browser's date interpretation; comprehensive DST ambiguity handling and external timezone tests remain production work.
