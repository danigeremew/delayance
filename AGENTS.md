# Delayance Agent Workspace Guidelines

This document provides context, core architectural rules, safety guidelines, and development workflows for AI agents working in the **Delayance** codebase.

---

## 1. Project Overview & Monorepo Architecture

Delayance is an AI Document Workspace built as a modular monolith in a **pnpm + Turborepo** monorepo (Node.js >= 22).

Before changing behavior, read the relevant source of truth:

- Product behavior: `docs/REQUIREMENTS.md`
- System boundaries and data flow: `docs/ARCHITECTURE.md`
- Local setup and service URLs: `docs/SETUP.md`
- Accepted constraints: `docs/ASSUMPTIONS.md` and `docs/LIMITATIONS.md`
- Deliberately deferred work: `docs/REMAINING_WORK.md`

Do not implement an item listed as deferred unless the user explicitly brings it into scope.

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

### D. Boundary and Data-Integrity Rules

- Treat browser, API, worker-job, AI-provider, WOPI, and uploaded-file payloads as untrusted input. Validate them before use.
- Enforce project/document authorization in the API, not only in the web UI. Any endpoint using a project or document ID must preserve tenant and role checks.
- Keep WOPI tokens short-lived and scoped. Preserve lock validation and version creation around save operations.
- Never log provider keys, JWTs, WOPI access tokens, stored-secret plaintext, or complete sensitive document contents.
- Schema changes require a new forward migration under `apps/api/drizzle/`; do not rewrite an already-applied migration.
- Keep queue payloads small and serializable. Pass object keys and record IDs to workers instead of document binaries or secrets.

---

## 3. Infrastructure & Services

Services run via Docker Compose in `infra/`:

- **PostgreSQL (+ pgvector, JSONB)**: Host port `58433` (DB: `delayance`)
- **Redis**: Host port `64380` (BullMQ queues, rate limiting, WOPI locks)
- **Keycloak**: Host port `58741` (localhost-only development identity provider)
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

- Use the repository-pinned pnpm version (`pnpm@9.15.0`) through Corepack when possible.
- Never commit `.env`, credentials, access tokens, or real customer documents. When adding configuration, update `.env.example` with a safe development placeholder and document it in `docs/SETUP.md`.
- Do not edit generated output in `dist/`, `.next/`, `.turbo/`, coverage directories, or package-local `node_modules/`.

### Execution Commands

- **Dev Servers**: `pnpm dev`
- **Build All**: `pnpm build`
- **Typecheck**: `pnpm typecheck`
- **Linting**: `pnpm lint`
- **Format Check**: `pnpm format:check`

### Testing Requirements

Run the smallest relevant checks while iterating, then the repository-wide checks before declaring a code change complete:

```bash
# Focused package/app check (replace the filter as needed)
pnpm --filter @delayance/api test
pnpm --filter @delayance/api typecheck

# Required repository-wide checks
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check

# Run when changing user flows, auth, API/web integration, WOPI launch, or export behavior
pnpm test:e2e
```

- Add or update tests with behavior changes. Prefer deterministic fixtures; never call live AI providers in the default test suite.
- For document conversion changes, cover malformed input, round-trip behavior, stable IDs, and fidelity/compatibility warnings as applicable.
- For API/schema changes, test validation, authorization, failure behavior, and the migration path.
- For UI changes, run the affected web tests and use Playwright for the changed user flow. Inspect screenshots or rendered PDFs when visual fidelity matters.
- If a required check cannot run because a service or dependency is unavailable, report the exact command and reason; do not describe the change as fully verified.

---

## 5. Coding Guidelines & Agent Rules

1. **Package Boundaries**: Always import from workspace packages using their package names (e.g., `@delayance/document-model`), using public module exports. Do not make cross-package relative imports (`../../packages/...`).
2. **Type Safety**: Maintain full TypeScript strictness. Avoid using `any` or loose type casts without explicit safety guards.
3. **Zod Validation**: Define input schemas in `packages/validation` or local Zod schemas for all external inputs and AI-generated outputs before consumption.
4. **Error Handling**: Use domain-specific error classes for document operations and API error responses.
5. **Dependency Direction**: Keep framework-independent domain logic in packages. API controllers, React components, workers, and provider adapters should orchestrate domain modules rather than duplicate their logic.
6. **Database Access**: Keep persistence behind API services/repositories. Web clients and AI/provider code must not access PostgreSQL, Redis, or MinIO directly.
7. **Public Contracts**: When changing a shared schema or exported type, update its package's public exports and every consumer in the same change. Maintain backward compatibility for stored analysis/version data or add an explicit migration/normalization path.
8. **Git Hygiene**: Preserve unrelated user changes and avoid destructive Git operations. Do not commit generated artifacts or secrets.
9. **Documentation**: Update relevant docs when commands, environment variables, architecture, public API behavior, or known limitations change.
10. **No Regressions**: Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check` before declaring a code change complete; add `pnpm test:e2e` when the change affects an end-to-end flow.

---

## 6. Repository Skills

Repo-scoped skills live in `.agents/skills/` and are automatically discoverable by Codex. Read the selected skill's complete `SKILL.md` before using it, and load only the references relevant to the current task.

- **`playwright`**: Browser automation, UI-flow debugging, screenshots, and interactive verification. Prefer the repository's normal `pnpm test:e2e` suite for repeatable regression coverage.
- **`pdf`**: PDF creation or review where rendering and layout matter, especially export fidelity checks.
- **`security-best-practices`**: Explicit secure-coding or security-review requests for the TypeScript/Next.js/NestJS application.
- **`security-threat-model`**: Explicit repository or feature threat-modeling requests. Follow its clarification and report workflow.
- **`openai-docs`**: OpenAI API, model, prompting, and adapter work that needs current official documentation.

Skills supplement this file; the architectural and safety constraints above remain mandatory. User instructions take precedence over a skill when they conflict.

---

## 7. Change Completion Checklist

Before handing off a code change:

1. Confirm the implementation respects the DOCX/LibreOffice source-of-truth and AI op-gating boundaries.
2. Review the diff for secrets, generated files, unrelated changes, and accidental API/schema breakage.
3. Run focused tests during development and the required repository-wide checks before completion.
4. Update tests, `.env.example`, migrations, and documentation when the change affects them.
5. Summarize changed files, verification commands/results, and any remaining risk or unverified path.
