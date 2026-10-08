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

Set `GEMINI_API_KEY` in the API server's `.env` to enable the assistant. New projects use Gemini with `GEMINI_MODEL=gemini-2.5-flash` by default and need no AI setup at creation. The key stays on the server; project creation works without it, but AI requests fail with a clear configuration error.

`PUT /projects/:id/ai-settings` accepts a Gemini model, an optional project API key (encrypted at rest), and `policy: any | local_only`. Other providers and custom endpoints are rejected. Existing project provider settings and credentials remain stored for history, but AI requests use Gemini only. Projects that previously used `local_only` keep that policy; an editor must explicitly set `policy: any` before their document content can be sent to Gemini.

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
