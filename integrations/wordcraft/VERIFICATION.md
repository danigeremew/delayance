# Wordcraft upgrade verification — 2026-10-22

Upstream: `8e986366c7a5a261e058644a9446d4c73aa8a063` (0.9.0).
Previous integration: `04f6f53b8a4d8140c7bb62f949b0a6099a473da1` (0.6.1).
The original custom commit `6822fa7f` remains on the local upstream clone's `delayance` branch.
The clone is now clean on upstream `main`.

| Check                                                                   | Result                                                                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm wordcraft:prepare`                                                | Passed; only the isolated snapshot was modified                                                                                        |
| `pnpm wordcraft:build --revision origin/main`                           | Passed with Rust 1.95.0, WASM target, wasm-bindgen 0.2.129; candidate not published                                                    |
| `pnpm wordcraft:test`                                                   | 6 passed: checkout preservation, pin isolation, incompatibility, output rollback, publication/concurrency gating, failed-build cleanup |
| Wordcraft Playwright suite against final staged assets                  | 10 passed                                                                                                                              |
| `pnpm wordcraft:build`                                                  | Passed; published WASM checksum matches the tested candidate and `build.json` matches the pin                                          |
| `pnpm typecheck`                                                        | Passed                                                                                                                                 |
| `pnpm lint`                                                             | Passed                                                                                                                                 |
| `pnpm test`                                                             | Passed, including all 6 build-isolation tests                                                                                          |
| Formatting of changed JavaScript, JSON, Markdown and TypeScript         | Passed                                                                                                                                 |
| Rust formatting of both integration modules                             | Passed                                                                                                                                 |
| `git diff --check`                                                      | Passed                                                                                                                                 |
| `pnpm format:check`                                                     | Fails on 39 pre-existing files, none changed by this upgrade                                                                           |
| `pnpm test:e2e`                                                         | 40 passed                                                                                                                              |
| Native `cargo test --locked -p wordcraft-ui-egui --lib embedded::tests` | 7 passed                                                                                                                               |

An additional browser check with an empty `PLAYWRIGHT_WORDCRAFT_ASSETS_DIR` passed, confirming
that it uses the published editor.

Browser coverage includes real Rust/WASM DOCX import/export, bold round-trip, stale selection
rejection, origin-scoped host requests, WOPI saves and retries, read-only mode, conflicting locks,
page-exit lock release, shared chrome/sidebar resizing, native menu layering, and explicit inline
AI preview acceptance. Workspace and preview screenshots were visually inspected. Tests use
synthetic documents and deterministic provider replies rather than live AI calls.

The Rust toolchain used for verification was installed temporarily under `/tmp`; normal local
builds still require the prerequisites documented in the integration guide. A copy of the previous
published assets is retained locally at `.wordcraft/before-upgrade-public`.

Pulling upstream no longer merges Delayance changes into the upstream checkout. Compatibility
is still verified per revision; upstream API changes can require porting the external hook patch
or bridge. The currently accepted revision stays pinned until a candidate is checked and promoted.
