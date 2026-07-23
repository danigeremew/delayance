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

- Web: http://localhost:48721
- API / Swagger: http://localhost:48722/docs

Infrastructure (Docker Compose in `infra/`):

- Postgres: localhost:58433
- Redis: localhost:64380
- MinIO: localhost:59002 (API) / 59003 (console)

## Document engine tests

```bash
pnpm --filter @delayance/document-model test
pnpm --filter @delayance/document-engine test
```

## Monorepo layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
