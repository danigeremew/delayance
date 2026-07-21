# Remaining Work (post-v1)

Explicitly deferred from Delayance v1. Do not treat these as incomplete bugs of the current release.

## Collaboration

- Real-time Yjs multiplayer (`apps/collaboration` remains a scaffold only)
- Presence, live cursors, conflict-free concurrent section editing

## AI modes

- Full Agent mode (multi-step tool use / autonomous ops)
- Research mode with live web search and conflict detection UI
- Interview and Transform modes

## Document / Word fidelity

- Equation OMML round-trip perfection; complex footnote edge cases
- SmartArt, macros, embedded Excel, complex floating layouts
- Pixel-perfect Word pagination parity for PDF

## Platform

- Advanced template designer UI
- Full tracked changes / suggestions track
- Org billing, SSO, mobile apps
- True large-model embeddings (current: deterministic local hash into pgvector)
- Image OCR for source uploads
- SSE streaming for AI tokens (REST + proposals are the v1 path)

## Optional ops tooling

- LibreOffice Compose sidecar for offline conversion checks (not on the happy path; Playwright PDF + OOXML export are primary)
