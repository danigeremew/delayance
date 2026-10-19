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
# Prepare local PostgreSQL + pgvector first (see docs/SETUP.md)
pnpm --filter @delayance/api db:migrate
pnpm wordcraft:build
pnpm dev
```

- Web: http://localhost:48721
- API / Swagger: http://localhost:48722/docs

Local services (Docker Compose in `infra/` runs only Redis):

- PostgreSQL: localhost:5432 (native service)
- Redis: localhost:64380
- Files: repository `storage/` folder (`STORAGE_DIR`)

## Document engine tests

```bash
pnpm --filter @delayance/document-model test
pnpm --filter @delayance/document-engine test
```

## Monorepo layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
