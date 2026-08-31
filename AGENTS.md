# Delayance Agent Workspace Guidelines

> This file mirrors `.agents/AGENTS.md` for tool discovery. See [.agents/AGENTS.md](file:///.agents/AGENTS.md) for full context.

## 1. Project Overview & Monorepo Architecture

Delayance is an AI Document Workspace built as a modular monolith in a **pnpm + Turborepo** monorepo (Node.js >= 22).

- **`apps/web`**: Next.js workspace UI with Collabora/LibreOffice Writer as its central editing surface.
- **`apps/api`**: NestJS REST API and OpenAPI/Swagger docs (`http://localhost:48722/docs`).
- **`apps/worker`**: BullMQ background worker for export and asynchronous jobs.
- **`apps/collaboration`**: Placeholder for real-time collaboration.
- **`packages/document-model`**: Versioned document-analysis schema used for AI, search, outline, and health.
- **`packages/document-engine`**: Deterministic analysis traversal, citation/reference checks, health rules, and locations.
- **`packages/docx-engine`**: DOCX analysis extraction, compatibility inspection, and blank-DOCX creation.
- **`packages/ai-core`**: Provider-independent prompts, context packing, proposed ops validation.
- **`packages/provider-adapters`**: OpenAI, Ollama, OpenAI-compatible, Anthropic/Gemini stubs.
- **`packages/design-system`**, **`packages/shared-types`**, **`packages/validation`**.

---

## 2. Core Architectural Constraints

1. **Office File Source of Truth**: DOCX bytes are immutable, content-addressed MinIO objects. PostgreSQL stores file metadata, version pointers, analysis, and workflow state; it never stores document binaries.
2. **LibreOffice Owns Editing**: Collabora/LibreOffice provides formatting, pagination, tables, comments, shortcuts, printing, and DOCX compatibility. Delayance provides intelligence around it.
3. **AI Safety Gating Pipeline**: AI MUST NEVER mutate document DB state directly.
   Pipeline: `Proposal` → `Validation` → `Permissions/Revision Check` → `User Preview` → `User Accept/Reject` → `Editor Bridge` → `WOPI Save/Version`.

---

## 3. Key Commands & Verification

```bash
# Infrastructure
cd infra && docker compose up -d

# Development
pnpm dev

# Verification
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```
