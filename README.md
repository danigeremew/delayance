# Delayance

AI Document Workspace — structured documents with deterministic numbering/references and safe AI assistance.

## Documentation

- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Assumptions](docs/ASSUMPTIONS.md)
- [Setup](docs/SETUP.md)

## Quick start

```bash
cd infra && docker compose up -d && cd ..
cp .env.example .env
pnpm install
pnpm --filter @delayance/api db:migrate
pnpm dev
```

- Web: http://localhost:3000
- API / Swagger: http://localhost:3001/docs

Infrastructure (Docker Compose in `infra/`):

- Postgres: localhost:5433
- Redis: localhost:6380
- MinIO: localhost:9002 (API) / 9003 (console)

## Document engine tests

```bash
pnpm --filter @delayance/document-model test
pnpm --filter @delayance/document-engine test
```

## Monorepo layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
