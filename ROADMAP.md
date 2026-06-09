# APEX Roadmap — 0.1 → 1.0

> v0.1 means "it builds and the happy path works." v1.0 means "a stranger can
> install it, point it at their own setup, and rely on it daily without
> surprises." The gap is **reliability and trust**, not more features.

Legend: ✅ done · ⬜ todo · 🔒 needs the maintainer (credentials / hardware / paid cert)

---

## 0.2 — Stabilize
The bar: a regression can't silently ship, and one broken panel can't kill the app.

- ✅ Per-panel **error boundaries** — a crash degrades to an inline fallback, not a blank screen. Local crash log in `localStorage["apex-crash-log"]`.
- ✅ **CI** — typecheck + build (frontend) and clippy + test (Rust) on every push/PR.
- ✅ **Release automation** — push a `vX.Y.Z` tag → installers built and published to GitHub Releases.
- ⬜ **Graceful failure states** for every external dependency: Ollama offline, model missing, OAuth expired/revoked, MCP server dead, no network. Each shows a clear, actionable message.
- ⬜ **Expand test coverage** — unit tests for the agent tool layer, vault parsing, semver/update logic, and the codebase chunker. Currently only a couple of Rust unit tests exist.
- 🔒 **Real-credential smoke test, once** — connect a real Google OAuth desktop client, a real Fireflies key, and one live MCP server; confirm the happy path end-to-end. *Only the maintainer can do this.*

## 0.5 — Beta
The bar: people who aren't the author run it for a week without hand-holding.

- ⬜ **Auto-update (silent)** — Tauri updater plugin + signed artifacts + `latest.json` feed. Scaffolding and docs landed in 0.2; flip on once the signing key secret is set. *(replaces today's notify-only banner)*
- 🔒 **Code-signing certificate** — removes the SmartScreen "unknown publisher" warning. Costs money, tied to maintainer identity.
- ⬜ **First-run experience** — a fresh install with no Ollama should be guided (detect Ollama, offer the Cookbook, pull a default model) rather than dropped into an empty editor.
- ⬜ **Performance at scale** — validate indexing + search on a 10k–50k file repo and a large vault; add cancellation, batching, and memory caps where needed.
- 🔒 **Real-world beta** — 5–10 users running APEX on their own machines for a week; triage what breaks.

## 0.9 / RC — Harden
The bar: no known crashes; nothing half-built is visible.

- ⬜ **Security pass** — audit command execution (injection), secret handling (keyring), MCP subprocess trust, and what the agent may do unprompted. Tracked in `SECURITY.md`.
- ⬜ **Finish or cut the half-done** — bash live-output streaming (kill works, streaming doesn't); native OS menu (skipped for the frameless titlebar); anything behind a demo flag. Each gets finished or removed from the 1.0 surface.
- ⬜ **Accessibility + keyboard-only** pass over the main flows.
- 🔒 **Cross-platform decision** — Windows-only for 1.0, or also macOS (Apple notarization) + Linux (AppImage/deb)? Each platform ~doubles validation.

## 1.0 — Ship
- ⬜ One week of RC with **zero new P0/P1 bugs**.
- ⬜ Docs complete: install, first-run, connections, troubleshooting, privacy.
- ⬜ Cross-platform scope locked and built.

---

### VS Code parity (parallel track)
Separate from the reliability work above, the editor-feature gap toward VS Code
is tracked with checkboxes in [`VSCODE_PARITY.md`](VSCODE_PARITY.md) — Tier 1
(core IDE parity) first, then LSP language intelligence; full debugging and the
extension marketplace are intentionally out of scope.

### The one rule
Don't add a new feature until the existing ones are proven with real data and guarded by CI. APEX is already feature-rich for a 0.1 — the road to 1.0 is making what's there trustworthy.
