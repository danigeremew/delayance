# Delayance Agent Workspace Guidelines

This document provides context, core architectural rules, safety guidelines, and development workflows for AI agents working in the **Delayance** codebase.

---

## 1. Project Overview & Monorepo Architecture

Delayance is an AI Document Workspace built as a modular monolith in a **pnpm + Turborepo** monorepo (Node.js >= 22).

### Applications (`apps/`)

- **`apps/web`**: Next.js frontend UI (React, TailwindCSS, Tiptap editor integration).
- **`apps/api`**: NestJS REST API and OpenAPI/Swagger docs (`http://localhost:3001/docs`).
- **`apps/worker`**: BullMQ background worker for asynchronous jobs (e.g., DOCX/PDF export, embedding generation).
- **`apps/collaboration`**: Placeholder for real-time document editing (Yjs / WebSockets).

### Core Packages (`packages/`)

- **`packages/document-model`**: Canonical structured document schema, node types, and stable ID generation.
- **`packages/document-engine`**: Deterministic numbering engine, cross-reference resolver, structural operations, TOC generation, validation, and version snapshots.
- **`packages/docx-engine`**: OOXML import/export, print HTML generation, and Markdown/HTML serializers.
- **`packages/ai-core`**: Provider-independent prompts, context packing, proposed operation generation, and validation.
- **`packages/provider-adapters`**: Provider adapters (OpenAI, Ollama, OpenAI-compatible, plus stubs for Anthropic, Gemini, OpenRouter).
- **`packages/editor-schema`**: Mapping between Tiptap / ProseMirror editor state and the canonical `document-model`.
- **`packages/design-system`**: UI design tokens and component primitives.
- **`packages/shared-types`**: Monorepo-wide shared TypeScript interfaces and types.
- **`packages/validation`**: Shared Zod schemas for request validation and document operations.

---

## 2. Mandatory Architectural Constraints & Principles

### A. Canonical Structured Document Model
- **No Raw Formats as Source of Truth**: Documents are stored in PostgreSQL as structured JSON nodes (sections, headings, paragraphs, figures, tables, cross-references, citations), NOT as unparsed HTML, Markdown, or DOCX XML.
- **Stable IDs & Dynamic Numbering**: Every node has a permanent, stable ID. Section/figure/table numbers are dynamic and derived deterministically from document structure by `document-engine`. Cross-references link to target node IDs, never hardcoded strings.

### B. Deterministic Engines (No AI Hallucination in Logic)
- **Programmatic Operations**: Numbering, TOC calculation, cross-reference updating, structural node manipulation, schema validation, OOXML parsing/rendering, and snapshot creation MUST be executed by deterministic code inside `packages/document-engine` and `packages/docx-engine`.
- **Never Delegate Structural Logic to AI**: AI models must never generate section numbers, derive TOCs, or update cross-references directly.

### C. AI Safety & Mandatory Op-Gating Pipeline
- **No Direct Database Writes by AI**: AI providers (LLMs) MUST NEVER mutate document records or write directly to PostgreSQL.
- **Strict Operations Pipeline**:
  1. **Prompt & Context Packing** (`packages/ai-core`)
  2. **Structured Proposed Operations** returned by AI.
  3. **Op Validation** (`packages/validation` + `document-engine`).
  4. **Permissions & Lock Verification** (`apps/api`).
  5. **User Preview UI** (`apps/web`).
  6. **User Acceptance / Rejection** (Explicit user action).
  7. **Engine Execution** (`document-engine` mutates document model).
  8. **Version History Snapshot Created**.

---

## 3. Infrastructure & Services

Services run via Docker Compose in `infra/`:

- **PostgreSQL (+ pgvector, JSONB)**: Host port `5433` (DB: `delayance`)
- **Redis**: Host port `6380` (BullMQ queues, rate limiting)
- **MinIO (S3-compatible)**: Host API port `9002`, Console port `9003` (Bucket: `delayance-files`)

---

## 4. Development & Verification Workflow

### Environment Setup
```bash
cd infra && docker compose up -d && cd ..
cp .env.example .env
pnpm install
pnpm --filter @delayance/api db:migrate
```

### Execution Commands
- **Dev Servers**: `pnpm dev`
- **Build All**: `pnpm build`
- **Typecheck**: `pnpm typecheck`
- **Linting**: `pnpm lint`
- **Format Check**: `pnpm format:check`

### Testing Requirements
Whenever modifying code, run relevant unit and integration tests:

```bash
# Package Unit Tests
pnpm --filter @delayance/document-engine test
pnpm --filter @delayance/document-model test
pnpm --filter @delayance/docx-engine test
pnpm --filter @delayance/ai-core test
pnpm --filter @delayance/provider-adapters test

# Run all package unit tests
pnpm test

# E2E Tests (Playwright)
pnpm test:e2e
```

---

## 5. Coding Guidelines & Agent Rules

1. **Package Boundaries**: Always import from workspace packages using their package names (e.g., `@delayance/document-model`), using public module exports. Do not make cross-package relative imports (`../../packages/...`).
2. **Type Safety**: Maintain full TypeScript strictness. Avoid using `any` or loose type casts without explicit safety guards.
3. **Zod Validation**: Define input schemas in `packages/validation` or local Zod schemas for all external inputs and AI-generated outputs before consumption.
4. **Error Handling**: Use domain-specific error classes for document operations and API error responses.
5. **No Regressions**: Always run `pnpm typecheck`, `pnpm lint`, and unit tests (`pnpm test`) before declaring a task completed.
