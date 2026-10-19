# Local Setup

## Prerequisites

- Node.js 22+
- pnpm 9+ (Corepack: `corepack enable`)
- Local PostgreSQL with pgvector installed for its major version
- Docker and Docker Compose (Redis only)
- Rust 1.95+, the WASM target, and wasm-bindgen-cli 0.2.129 for the Wordcraft editor

If Docker Desktop’s socket is unavailable, use the system socket:

```bash
export DOCKER_HOST=unix:///var/run/docker.sock
```

## Quick start

```bash
# 1. Start Redis (PostgreSQL runs as a local service)
docker compose -f infra/docker-compose.yml up -d

# 2. Install dependencies (from repo root)
pnpm install

# 3. Environment
cp .env.example .env

# 4. Prepare local PostgreSQL as described below, then run migrations
pnpm --filter @delayance/api db:migrate

# 5. (Optional) Install Playwright Chromium for PDF export + E2E
pnpm --filter @delayance/worker exec playwright install chromium
pnpm --filter @delayance/web exec playwright install chromium

# 6. Build Wordcraft, then start apps
pnpm wordcraft:build
pnpm dev
```

## E2E

With API (+ worker for DOCX export jobs) running against local PostgreSQL and Redis:

```bash
pnpm test:e2e
```

Uses Playwright. Set `PLAYWRIGHT_API_URL` / `PLAYWRIGHT_BASE_URL` if ports differ. Set `PLAYWRIGHT_SKIP_UI=1` to skip the UI smoke test.

## Services

| Service            | URL                         |
| ------------------ | --------------------------- |
| Web                | http://localhost:48721      |
| API                | http://localhost:48722      |
| API docs (Swagger) | http://localhost:48722/docs |

PostgreSQL runs as a local service on **5432** by default. Set `DATABASE_URL` to your local database credentials. Redis remains in Compose on **64380**. Delayance hosts login, signup, and recovery pages and authenticates directly against local user records. Access tokens stay in browser memory; rotating refresh tokens are stored in an HttpOnly cookie. No Keycloak service or credentials are needed.

`pnpm reset:dev` removes only the Redis volume, including queued jobs, WOPI locks and password reset tokens, restarts Redis, and applies migrations to the configured local PostgreSQL database. PostgreSQL data and files in `STORAGE_DIR` are preserved. It requires typing `RESET` and must never be run against production data.

## Local PostgreSQL

Install PostgreSQL and the pgvector extension matching its major version using your operating system's package manager. Start the native PostgreSQL service. On a Linux installation with a `postgres` administrator, create the development role/database once:

```sh
sudo -u postgres createuser --login --pwprompt delayance
sudo -u postgres createdb --owner=delayance delayance
sudo -u postgres psql --dbname=delayance --file=infra/postgres/init.sql
```

Use your chosen password in `DATABASE_URL` (`postgresql://delayance:YOUR_PASSWORD@localhost:5432/delayance`). URL-encode reserved characters in the password. If the role/database already exists, reuse it and run the extension setup against that database. The administrator enables `vector` and `pgcrypto`; the application role owns the database so migrations can create its schema. Then run `pnpm --filter @delayance/api db:migrate`.

Existing Docker PostgreSQL data is not transferred automatically. Back it up and restore it into the local database before switching an existing installation. Preserve old containers and volumes until the restored accounts and projects have been verified. The reset script never drops local databases.

## Redis

Redis backs BullMQ import/export, analysis and source-processing jobs, WOPI editing locks, and one-time password reset tokens. It is required by both API and worker. Login sessions live in PostgreSQL; authentication rate limits currently use the API process's memory. Removing Redis requires replacing these queue, lock, and token operations.

## Local file storage

The API and worker create `storage/` at the repository root automatically. Set `STORAGE_DIR` in `.env` to another folder (relative to the repository root or an absolute path). Both processes must use the same directory and have read/write access. Files are private, ignored by Git, and persist across application restarts. Keep this folder outside any static web root. PostgreSQL stores metadata and file keys, not file bytes.

Set `API_PUBLIC_URL` to the browser-reachable API origin for downloads (default: `http://localhost:48722`). Downloads use expiring, signed API links generated after project authorization. DOCX saves retain immutable content-addressed keys; writes are atomic and never overwrite a different existing file.

Existing MinIO files are not migrated automatically. Before switching an existing installation, copy its objects into `STORAGE_DIR`, retaining their full object keys as relative paths. Existing database bucket values remain historical metadata and do not need a schema migration. Back up the folder together with PostgreSQL. The former MinIO container and volume may remain on an existing machine; preserve the volume until its files have been copied and verified.

This folder backend is intended for local use. API and worker processes on different machines require a shared filesystem or a future storage adapter. `pnpm reset:dev` preserves the folder even when database records are reset.

## Gemini AI

Set `GEMINI_API_KEY` in the API server's `.env` to enable the assistant. New projects use Gemini with `GEMINI_MODEL=gemini-3.8-flash` by default and need no AI setup at creation. The key stays on the server; project creation works without it, but AI requests fail with a clear configuration error.

`PUT /projects/:id/ai-settings` accepts a Gemini model, an optional project API key (encrypted at rest), and `policy: any | local_only`. Other providers and custom endpoints are rejected. Existing project provider settings and credentials remain stored for history, but AI requests use Gemini only. Projects that previously used `local_only` keep that policy; an editor must explicitly set `policy: any` before their document content can be sent to Gemini.

Open the AI sidebar's settings gear to enter a project Gemini API key, select a model, and save. **Test saved connection** sends a small synthetic request using the saved key and model; it does not send document content. Leaving the key blank preserves it; removing a custom key falls back to the server key. Settings require an editor or owner role. New defaults do not overwrite existing project settings or an explicit `GEMINI_MODEL` in `.env`.

The model picker includes current text models such as `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`, and `gemini-3.1-flash-lite`. The custom model field accepts future Gemini model IDs without a code change. Use exact text-generation IDs from [Google's model catalog](https://ai.google.dev/gemini-api/docs/models); image, TTS and Live models are not document-writing models. Model access depends on the API key's Google project. Provider failures explain key/access, model availability and quota issues without exposing provider response bodies.

### AI and Wordcraft

Wordcraft is the sole browser document editor. Build it with `pnpm wordcraft:build` before opening a document. Its native ribbon owns formatting, pagination, comments, and DOCX import/export. Collabora discovery and its Docker service are no longer used.

The sidebar saves pending editor changes before generating a proposal. Ask and Review do not change files. Edit and Write preview proposed text, then require explicit acceptance. Acceptance verifies project permissions, the WOPI session, and the saved file version. Wordcraft validates native selection handles and document revisions before applying text; WOPI saves retain locks, immutable DOCX versions, and completion verification. Providers never write document records or DOCX XML directly.

`POST /projects/:id/documents/:documentId/office/session` defaults to Wordcraft and accepts only `editor: "wordcraft"`. Removed editor values are rejected. `OFFICE_ENABLED=false` disables document editing sessions. The existing `/office/ai`, `/office-accept`, and `/office-complete` endpoints remain in use.

## Tests

### Wordcraft build

Install Rust 1.95+, the `wasm32-unknown-unknown` target, and `wasm-bindgen-cli` 0.2.129, then run `pnpm wordcraft:build`. See [the integration guide](../integrations/wordcraft/README.md) for exact commands and the pinned source revision. The source checkout and compiled assets are ignored build inputs. Opening a document always uses Wordcraft.

`WORDCRAFT_BROWSER_URL` is the browser editor URL (default `http://localhost:48721/wordcraft/index.html`). `WORDCRAFT_WOPI_BASE_URL` must be browser-reachable (default `http://localhost:48722`).

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

Wordcraft is an alpha editor; review DOCX fidelity on representative copies before relying on it.

## Authentication and recovery

Set `AUTH_JWT_SECRET` to a private random signing key of at least 32 characters. The placeholder in `.env.example` is only for isolated development; production startup rejects it. For example, generate a key locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and save it in `.env`. Never commit the real key.

Registration stores a randomly salted scrypt password hash. Login returns a 15-minute access token backed by a database session. Sessions last 24 hours from sign-in. Their HttpOnly cookie survives browser restarts, and the web app restores login automatically. Refresh tokens rotate atomically without extending that 24-hour deadline; replayed tokens are rejected. Signing in after expiry reuses the existing account; signup is only needed once. Logout and password resets revoke sessions immediately, including outstanding access tokens. Existing project/document authorization is unchanged.

Migration `0009_session_one_day` caps existing active sessions at 24 hours. Migration `0008_local_auth` preserves accounts, their UUIDs, project ownership and memberships. It revokes prior sessions and adds case-insensitive email uniqueness. Historical migrations and the unused legacy identity-subject column are retained; application code no longer reads or writes it. The checked-in migration journal allows fresh installations to apply the full forward migration sequence. The old Keycloak volume can be retained for archival purposes; do not reset project data to switch auth.

Passwords cannot be recovered from accounts created only through Keycloak. For an existing development account, set a new local password privately in your terminal:

```sh
pnpm auth:password your-email@example.com
```

The command prompts without echo, asks for confirmation, preserves the user ID/projects and revokes old sessions. It refuses production mode. Do not pass passwords as command-line arguments or commit them. New users can simply use **Create account**.

Reset links require `SMTP_HOST` and `SMTP_FROM`. `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD` are optional. Without SMTP, recovery requests still return the generic response but no mail is delivered. Reset tokens expire after 15 minutes, are stored as hashes in Redis, and are consumed once. Old identity-provider reset tokens are not accepted by local auth.
