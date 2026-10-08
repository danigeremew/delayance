# Known Limitations (v1)

- Email/password login is brokered by the Delayance API through Keycloak Direct Access Grants. Browser-only Keycloak required actions, broker login, and SSO are not available in these forms.
- Password-recovery mail is unavailable until SMTP is configured.

- No real-time multiplayer editing (collaboration app is a scaffold only).
- DOCX import/export covers headings, paragraphs, tables, basic styles, numbering, and Word field instructions for TOC/PAGE/REF — not SmartArt, macros, or embedded workbooks.
- Equations render in the editor; DOCX equation OMML round-trip is best-effort / flagged in compatibility reports.
- PDF uses Playwright print HTML; pagination will not match Word pixel-for-pixel.
- AI Ask/Edit/Write/Review require a Gemini API key; without one, requests fail with a configuration error. Existing projects with a `local_only` policy require an editor to enable external AI before using Gemini.
- Source embeddings use a deterministic local hash stored in pgvector(32) — not a commercial embedding model.
- Image source uploads store placeholders; OCR is deferred.
- Advanced Agent / Research / Interview / Transform modes are deferred.

See [REMAINING_WORK.md](./REMAINING_WORK.md) for the full post-v1 list.
