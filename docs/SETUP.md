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

| Service | URL |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:3001 |
| API docs (Swagger) | http://localhost:3001/docs |
| MinIO console | http://localhost:9003 |

Postgres is exposed on host port **5433**, Redis on **6380**, MinIO on **9002/9003** to avoid conflicts with local services.

## AI providers

Configure per project via `PUT /projects/:id/ai-settings`:

- `openai` — requires API key (encrypted at rest)
- `ollama` — local default; set `policy: local_only` to block external providers
- `openai-compatible` — custom `baseUrl`

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
