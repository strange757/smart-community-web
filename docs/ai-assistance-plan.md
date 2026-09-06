# AI assistance implementation

Scope: add optional AI drafting to the existing repair and notice forms. No database writes, assignments, payments, or publishing are performed by the AI routes.

## Contract

- `POST /api/v1/ai/repair-draft`, OWNER only: `{description}` -> `{category, description, priority, missingInfo}`.
- `POST /api/v1/ai/notice-draft`, PROPERTY only: `{title, content}` -> `{title, content, missingInfo}`.
- Responses use the existing `{data, requestId}` envelope; failures use `{code, message, requestId}`.
- Repair categories remain public facilities, water/electrical repair, doors/windows, and other problems (the existing Chinese enum values). Priority remains `NORMAL` or `URGENT`.
- Suggestions are previews. Only the explicit apply action fills the existing form. Existing submit/publish commands remain necessary.

## Model connection

Use a server-side, configurable chat-completions-compatible endpoint, model, API key, enable switch, and bounded timeout. A local compatible model is supported via configuration. Never send app JWTs, passwords, or database records to the model. Only the input text for the selected drafting action is sent. Never return or log provider keys or raw upstream error bodies.

Disabled/unconfigured AI returns a clear unavailable error; no simulated answer is represented as a live model result. Automated tests use controlled model HTTP responses and do not spend paid API credit.

## Tasks

1. Add bounded request/output schemas, role-protected routes, provider adapter, configuration example, and focused backend tests.
2. Add compact AI actions and editable suggestion previews to both forms; preserve manual input on failure, stale response, close/reopen, or declined suggestion.
3. Verify normal business flows, role denial, disabled service, invalid model output, provider failure/timeout, and explicit apply/no-auto-submit.
4. Document configuration and privacy boundaries. Build and inspect the dialogs at tablet width. Live model acceptance remains pending until a provider is configured.

The first implementation adds no vector database, generic chat interface, voice stack, or new persistence tables.

## Verification status

2026-09-06: Tasks 1-4 implemented locally. Backend 99 tests, frontend 51 tests, build/typecheck, and 3 browser flows passed. An independent review identified the distinction between HTTP inactivity and total request timeouts; the provider now has a total deadline and a slow-response regression test. Live cloud-model acceptance is pending provider configuration; AI remains disabled by default.
