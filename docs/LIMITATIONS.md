# Known Limitations (v1)

- No real-time multiplayer editing (collaboration app is a scaffold only).
- DOCX import/export covers headings, paragraphs, tables, basic styles, numbering, and Word field instructions for TOC/PAGE/REF — not SmartArt, macros, or embedded workbooks.
- Equations render in the editor; DOCX equation OMML round-trip is best-effort / flagged in compatibility reports.
- PDF uses Playwright print HTML; pagination will not match Word pixel-for-pixel.
- AI Edit/Write/Review require a configured provider; without one, requests fail clearly instead of mocking success.
- Source embeddings use a deterministic local hash stored in pgvector(32) — not a commercial embedding model.
- Image source uploads store placeholders; OCR is deferred.
- Advanced Agent / Research / Interview / Transform modes are deferred.

See [REMAINING_WORK.md](./REMAINING_WORK.md) for the full post-v1 list.
