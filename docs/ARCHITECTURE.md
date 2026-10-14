# Delayance Architecture

## Overview

Delayance is an AI Document Workspace built as a **modular monolith** in a pnpm + Turborepo monorepo.

Applications may run as separate processes but share one codebase with clear package boundaries.

## Applications

| App                  | Role                                         |
| -------------------- | -------------------------------------------- |
| `apps/web`           | Next.js UI                                   |
| `apps/api`           | NestJS REST API (+ WebSockets later)         |
| `apps/worker`        | BullMQ background jobs                       |
| `apps/collaboration` | Placeholder for future Yjs real-time editing |

## Packages

| Package             | Role                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `document-model`    | Versioned document-analysis schema for AI, search, outline, and health      |
| `document-engine`   | Analysis traversal, citation/reference checks, health rules, and locations  |
| `docx-engine`       | DOCX analysis extraction, compatibility inspection, and blank-DOCX creation |
| `ai-core`           | Provider-independent prompts, context packing, op validation                |
| `provider-adapters` | Gemini text, structured output, and streaming adapter                       |
| `design-system`     | App theme tokens (separate from document template styles)                   |
| `shared-types`      | Cross-cutting TypeScript types                                              |
| `validation`        | Shared Zod schemas                                                          |

## Data plane

- **PostgreSQL** (+ JSONB, pgvector) — relational metadata, analysis, and workflow state
- **Redis** — BullMQ queues, rate limiting
- **MinIO** — S3-compatible object storage for files
- **Local auth** — salted scrypt password hashes in PostgreSQL; 15-minute HS256 access tokens tied to revocable database sessions; opaque rotating refresh tokens in a persistent HttpOnly cookie with a fixed 24-hour session deadline. Accounts and sessions survive application restarts in PostgreSQL. No external identity service is required.

Protected routes return HTTP 401 when a bearer token is missing so the web client can restore its session using the refresh cookie. The home dashboard waits for this session check before requesting projects.

## Core rules

### Canonical document model

Editable documents are DOCX files in isolated, content-addressed MinIO storage. Collabora/LibreOffice Writer owns editing and formatting; PostgreSQL keeps only metadata and Delayance's extracted analysis representation.

The `experiment/wordcraft-editor` branch also offers a selectable Wordcraft Rust/WASM editor. Its host bridge uses the same authorized WOPI sessions, locks, immutable DOCX storage, version creation, analysis, and AI acceptance pipeline. Native range handles include Wordcraft's document revision and selection positions. The experiment adds no database document model and no direct provider writes. See [Wordcraft integration](../integrations/wordcraft/README.md) for the pinned source, build steps, and limitations.

### AI safety

AI providers must never write document content directly to the database.

Pipeline: text proposal → revision/permission validation → preview → accept/reject → editor bridge → WOPI save/version history.

The LibreOffice sidebar uses the office AI endpoint, which extracts context from the current immutable DOCX and stores validated `office-text` revisions in proposal metadata. Ask/Review generate answers without revisions; Edit/Write remain pending until explicit acceptance. Acceptance verifies a user-scoped writable WOPI session and the original file hash/version before Collabora executes a plain-text paste. Completion checks the newly saved DOCX before marking a proposal accepted. Legacy JSON operations are rejected for office-backed documents.

### Deterministic document processing

Numbering, TOC, cross-references, DOCX/PDF, version history, and validation are handled by normal program logic — never by AI.

## Phase status

Phases 0–8 implemented for v1 exit criteria: document core, workspace editor, DOCX/PDF jobs, AI Ask/Edit/Write/Review with accept/reject, sources with FTS/pgvector/citations, health panel, contributor section workflows, Playwright E2E, and docs. Post-v1 items live in [REMAINING_WORK.md](./REMAINING_WORK.md).
