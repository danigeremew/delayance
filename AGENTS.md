# Delayance Agent Workspace Guidelines

> This file mirrors `.agents/AGENTS.md` for tool discovery. See [.agents/AGENTS.md](file:///.agents/AGENTS.md) for full context.

## 1. Project Overview & Monorepo Architecture

Delayance is an AI Document Workspace built as a modular monolith in a **pnpm + Turborepo** monorepo (Node.js >= 22).

- **`apps/web`**: Next.js frontend UI (React, TailwindCSS, Tiptap editor).
- **`apps/api`**: NestJS REST API and OpenAPI/Swagger docs (`http://localhost:3001/docs`).
- **`apps/worker`**: BullMQ background worker for export and asynchronous jobs.
- **`apps/collaboration`**: Placeholder for real-time collaboration.
- **`packages/document-model`**: Canonical structured document schema & stable IDs.
- **`packages/document-engine`**: Deterministic numbering, cross-references, TOC, structural ops, validation, snapshots.
- **`packages/docx-engine`**: OOXML import/export, print HTML, MD/HTML serializers.
- **`packages/ai-core`**: Provider-independent prompts, context packing, proposed ops validation.
- **`packages/provider-adapters`**: OpenAI, Ollama, OpenAI-compatible, Anthropic/Gemini stubs.
- **`packages/editor-schema`**: Tiptap ↔ canonical `document-model` mapping.
- **`packages/design-system`**, **`packages/shared-types`**, **`packages/validation`**.

---

## 2. Core Architectural Constraints

1. **Canonical Document Model**: Documents are stored as structured JSON nodes with stable IDs in PostgreSQL—never raw unparsed HTML/Markdown/DOCX as source of truth.
2. **Deterministic Engines**: Dynamic numbering, cross-references, TOC, structural edits, OOXML conversion, and snapshots MUST be executed by programmatic logic (`document-engine`, `docx-engine`), never hallucinated by AI.
3. **AI Safety Gating Pipeline**: AI MUST NEVER mutate document DB state directly.
   Pipeline: `Proposed Ops` → `Validation` → `Permissions/Lock Check` → `User Preview UI` → `User Accept/Reject` → `Document Engine Execution` → `Snapshot`.

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
