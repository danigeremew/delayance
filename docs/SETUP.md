# Local Setup

## Prerequisites

- Node.js 22+
- pnpm 9+ (Corepack: `corepack enable`)
- Docker and Docker Compose

If Docker Desktop’s socket is unavailable, use the system socket:

```bash
export DOCKER_HOST=unix:///var/run/docker.sock
```

## Quick start

```bash
# 1. Start infrastructure
cd infra
docker compose up -d

# 2. Install dependencies (from repo root)
cd ..
pnpm install

# 3. Environment
cp .env.example .env

# 4. Run database migrations
pnpm --filter @delayance/api db:migrate

# 5. (Optional) Install Playwright Chromium for PDF export + E2E
pnpm --filter @delayance/worker exec playwright install chromium
pnpm --filter @delayance/web exec playwright install chromium

# 6. Start apps
pnpm dev
```

## E2E

With API (+ worker for DOCX export jobs) running against Compose:

```bash
pnpm test:e2e
```

Uses Playwright. Set `PLAYWRIGHT_API_URL` / `PLAYWRIGHT_BASE_URL` if ports differ. Set `PLAYWRIGHT_SKIP_UI=1` to skip the UI smoke test.

## Services

| Service                      | URL                         |
| ---------------------------- | --------------------------- |
| Web                          | http://localhost:48721      |
| API                          | http://localhost:48722      |
| API docs (Swagger)           | http://localhost:48722/docs |
| Keycloak (local development) | http://localhost:58741      |
| MinIO console                | http://localhost:59003      |

Postgres is exposed on host port **58433**, Redis on **64380**, Keycloak on **58741**, and MinIO on **59002/59003** to avoid conflicts with local services. Keycloak is bound to localhost and uses its development-only `dev-file` database for now. The compose stack imports `infra/keycloak/delayance-realm.json` when the realm is first created; existing realms are skipped. Login, signup, and recovery forms are hosted by Delayance. The API checks passwords with Keycloak Direct Access Grants and uses a restricted service account for account creation and password resets. The access token stays in browser memory; the rotating refresh token is an HttpOnly cookie. Existing realms skip import; apply configuration changes through the Keycloak Admin API. Do not reset volumes to apply theme or client changes.

`pnpm reset:dev` removes local PostgreSQL, Redis, MinIO, and Keycloak volumes, recreates the stack, and applies migrations. It requires typing `RESET` and must never be run against production data.

## Gemini AI

Set `GEMINI_API_KEY` in the API server's `.env` to enable the assistant. New projects use Gemini with `GEMINI_MODEL=gemini-3.8-flash` by default and need no AI setup at creation. The key stays on the server; project creation works without it, but AI requests fail with a clear configuration error.

`PUT /projects/:id/ai-settings` accepts a Gemini model, an optional project API key (encrypted at rest), and `policy: any | local_only`. Other providers and custom endpoints are rejected. Existing project provider settings and credentials remain stored for history, but AI requests use Gemini only. Projects that previously used `local_only` keep that policy; an editor must explicitly set `policy: any` before their document content can be sent to Gemini.

Open the AI sidebar's settings gear to enter a project Gemini API key, select a model, and save. **Test saved connection** sends a small synthetic request using the saved key and model; it does not send document content. Leaving the key blank preserves it; removing a custom key falls back to the server key. Settings require an editor or owner role. New defaults do not overwrite existing project settings or an explicit `GEMINI_MODEL` in `.env`.

The model picker includes current text models such as `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`, and `gemini-3.1-flash-lite`. The custom model field accepts future Gemini model IDs without a code change. Use exact text-generation IDs from [Google's model catalog](https://ai.google.dev/gemini-api/docs/models); image, TTS and Live models are not document-writing models. Model access depends on the API key's Google project. Provider failures explain key/access, model availability and quota issues without exposing provider response bodies.

### AI and LibreOffice

Compose pins Collabora CODE 26.04.4.2.1, which provides `Action_Copy` / `Action_Copy_Resp` selection access and `Action_Paste` text insertion. This image is shell-free and receives configuration through command arguments. Apply the editor update with `docker compose -f infra/docker-compose.yml up -d --no-deps collabora`, then reopen the workspace.

The sidebar saves pending editor changes and waits for `Action_Save_Resp` before generating a proposal. Already saved files are not exported again, preserving their version for acceptance. The API reads the DOCX and its hash/version from one immutable snapshot so an autosave during intent classification does not create a false conflict. It deterministically extracts context independent of background analysis and the legacy JSON content. Ask answers questions; Review returns critique without changing the file. Write previews new text for insertion at a cursor; Edit requires selecting text in LibreOffice and previews the original and replacement. Auto classifies the instruction and follows the same permissions and preview requirements.

The API key field masks text without identifying itself as a login password and opts out of password-manager capture. LibreOffice launches with a light theme and white document background, overriding saved editor theme preferences and the browser's color preference.

Apply a proposal explicitly after placing the cursor (Write) or selecting the original text (Edit). The API verifies the current file hash/version, permissions and the user's writable WOPI session; the editor checks the selection again, pastes plain text, waits for `Doc_ModifiedStatus`, and saves through WOPI. Save verification retries briefly when the upload is still pending; it never repeats the paste. A proposal is marked accepted only after the saved file contains its text. Typing further changes before acceptance requires generating a new proposal. Legacy JSON operations cannot mutate office-backed documents. AI never writes DOCX XML or document records directly.

`POST /projects/:id/ai-settings/test` tests the saved Gemini configuration. `POST /projects/:id/documents/:documentId/office/ai` generates an office proposal. `POST /projects/:id/ai/proposals/:proposalId/office-accept` authorizes editor execution, and `office-complete` verifies the WOPI save.

## Tests

```bash
pnpm --filter @delayance/document-engine test
pnpm --filter @delayance/document-model test
pnpm --filter @delayance/docx-engine test
pnpm --filter @delayance/ai-core test
pnpm --filter @delayance/provider-adapters test
pnpm test:e2e
```

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Environment variables

See [`.env.example`](../.env.example) for the full list.

## Known limitations

See [ASSUMPTIONS.md](./ASSUMPTIONS.md), [LIMITATIONS.md](./LIMITATIONS.md), and [REMAINING_WORK.md](./REMAINING_WORK.md).

LibreOffice is optional for offline conversion checks and is **not** required on the happy path (Playwright PDF + OOXML export).

## Authentication and recovery

Set `KEYCLOAK_CLIENT_SECRET` and `KEYCLOAK_PROVISIONER_CLIENT_SECRET` to match the two clients in the `delayance` realm. The provisioner service account needs only the `realm-management` client roles `manage-users` and `view-users`. The built-in `keycloak` login theme is used for any direct Keycloak pages; Delayance hosts `/login`, `/register`, `/forgot-password`, and `/reset-password`. The API must never receive the bootstrap admin credentials.

Reset links require `SMTP_HOST` and `SMTP_FROM`. `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD` are optional. Without SMTP, recovery requests still return the generic response but no mail is delivered. Reset tokens expire after 15 minutes, are stored as hashes in Redis, and are consumed once.
