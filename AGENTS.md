# Delayance Agent Workspace Guidelines

This document provides context, core architectural rules, safety guidelines, and development workflows for AI agents working in the **Delayance** codebase.

---

## 1. Project Overview & Monorepo Architecture

Delayance is an AI Document Workspace built as a modular monolith in a **pnpm + Turborepo** monorepo (Node.js >= 22).

### Applications (`apps/`)

- **`apps/web`**: Next.js workspace UI with Collabora/LibreOffice Writer as the central editing surface.
- **`apps/api`**: NestJS REST API and OpenAPI/Swagger docs (`http://localhost:48722/docs`).
- **`apps/worker`**: BullMQ background worker for asynchronous jobs (e.g., DOCX extraction, export, embedding generation).
- **`apps/collaboration`**: Placeholder for real-time document editing (Yjs / WebSockets).

### Core Packages (`packages/`)

- **`packages/document-model`**: Versioned document-analysis schema for AI, search, outline, and health.
- **`packages/document-engine`**: Deterministic analysis traversal, citation/reference checks, health rules, and locations.
- **`packages/docx-engine`**: DOCX analysis extraction, compatibility inspection, and blank-DOCX creation.
- **`packages/ai-core`**: Provider-independent prompts, context packing, proposed operation generation, and validation.
- **`packages/provider-adapters`**: Provider adapters (OpenAI, Ollama, OpenAI-compatible, plus stubs for Anthropic, Gemini, OpenRouter).
- **`packages/design-system`**: UI design tokens and component primitives.
- **`packages/shared-types`**: Monorepo-wide shared TypeScript interfaces and types.
- **`packages/validation`**: Shared Zod schemas for request validation, environment configuration, and document operations.

---

## 2. Mandatory Architectural Constraints & Principles

### A. Office File Source of Truth
- **DOCX in isolated object storage**: Editable files are immutable, content-addressed DOCX objects in MinIO. PostgreSQL stores their metadata, version pointers, analysis, and workflow state; it never stores document binaries.
- **LibreOffice owns editing**: Collabora/LibreOffice owns formatting, pagination, tables, comments, printing, keyboard shortcuts, and DOCX compatibility. Delayance owns AI and document intelligence.

### B. Deterministic Engines (No AI Hallucination in Logic)
- **Programmatic operations**: DOCX extraction, analysis, citations, references, health rules, and version metadata MUST be deterministic. Delayance does not reproduce an office formatting model.
- **Never Delegate Structural Logic to AI**: AI models must never generate section numbers, derive TOCs, or update cross-references directly.

### C. AI Safety & Mandatory Op-Gating Pipeline
- **No Direct Database Writes by AI**: AI providers (LLMs) MUST NEVER mutate document records or write directly to PostgreSQL.
- **Strict Operations Pipeline**:
  1. **Prompt & Context Packing** (`packages/ai-core`)
  2. **Text proposals** returned by AI.
  3. **Proposal/revision validation** (`packages/validation`).
  4. **Permissions & WOPI session verification** (`apps/api`).
  5. **User Preview UI** (`apps/web`).
  6. **User Acceptance / Rejection** (Explicit user action).
  7. **Editor bridge execution** (the editor applies text; AI never writes DOCX XML directly).
  8. **WOPI save and file version creation**.

---

## 3. Infrastructure & Services

Services run via Docker Compose in `infra/`:

- **PostgreSQL (+ pgvector, JSONB)**: Host port `58433` (DB: `delayance`)
- **Redis**: Host port `64380` (BullMQ queues, rate limiting, WOPI locks)
- **MinIO (S3-compatible)**: Host API port `59002`, Console port `59003` (Bucket: `delayance`)
- **Collabora CODE (LibreOffice Online)**: Host port `9980` (WOPI client for Writer editing)

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
