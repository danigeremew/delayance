# Delayance Architecture

## Overview

Delayance is an AI Document Workspace built as a **modular monolith** in a pnpm + Turborepo monorepo.

Applications may run as separate processes but share one codebase with clear package boundaries.

## Applications

| App | Role |
| --- | --- |
| `apps/web` | Next.js UI |
| `apps/api` | NestJS REST API (+ WebSockets later) |
| `apps/worker` | BullMQ background jobs |
| `apps/collaboration` | Placeholder for future Yjs real-time editing |

## Packages

| Package | Role |
| --- | --- |
| `document-model` | Versioned document-analysis schema for AI, search, outline, and health |
| `document-engine` | Analysis traversal, citation/reference checks, health rules, and locations |
| `docx-engine` | DOCX analysis extraction, compatibility inspection, and blank-DOCX creation |
| `ai-core` | Provider-independent prompts, context packing, op validation |
| `provider-adapters` | OpenAI, Ollama, OpenAI-compatible (+ thin Anthropic/Gemini/OpenRouter stubs) |
| `design-system` | App theme tokens (separate from document template styles) |
| `shared-types` | Cross-cutting TypeScript types |
| `validation` | Shared Zod schemas |

## Data plane

- **PostgreSQL** (+ JSONB, pgvector) — relational metadata, analysis, and workflow state
- **Redis** — BullMQ queues, rate limiting
- **MinIO** — S3-compatible object storage for files

## Core rules

### Canonical document model

Editable documents are DOCX files in isolated, content-addressed MinIO storage. Collabora/LibreOffice Writer owns editing and formatting; PostgreSQL keeps only metadata and Delayance's extracted analysis representation.

### AI safety

AI providers must never write document content directly to the database.

Pipeline: text proposal → revision/permission validation → preview → accept/reject → editor bridge → WOPI save/version history.

### Deterministic document processing

Numbering, TOC, cross-references, DOCX/PDF, version history, and validation are handled by normal program logic — never by AI.

## Phase status

Phases 0–8 implemented for v1 exit criteria: document core, workspace editor, DOCX/PDF jobs, AI Ask/Edit/Write/Review with accept/reject, sources with FTS/pgvector/citations, health panel, contributor section workflows, Playwright E2E, and docs. Post-v1 items live in [REMAINING_WORK.md](./REMAINING_WORK.md).
