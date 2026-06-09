# VS Code Parity — Gap Tracker

Goal: make APEX feel like VS Code for daily work, **without** chasing the
impossible parts (full extension marketplace, every niche feature) that would
bury what makes APEX special — local-first + AI-native.

Legend: ✅ done · ◐ partial · ⬜ todo · 🔴 very large / may be intentionally out of scope

---

## Already in APEX ✅
- ✅ Monaco editor — multi-cursor, folding, minimap, bracket-pair colorization (built in)
- ✅ Editor tabs (single group) · unsaved indicators
- ✅ Breadcrumbs · Markdown preview
- ✅ 7 themes · Vim mode · inline AI autocomplete
- ✅ File explorer — open / create / rename / delete · **workspace switcher** (Open / New / Recent)
- ✅ Integrated terminal (xterm + portable-pty) — single instance
- ✅ Git panel (basic) · Command palette (Ctrl+K) · Quick file open (Ctrl+P)
- ✅ Settings dialog · Keyboard shortcuts · Status bar
- ➕ **Beyond VS Code:** AI agent, knowledge vault, codebase index, MCP servers

## Tier 1 — Core IDE parity (achievable, high value)
- ✅ **Global search & replace across files** — results tree (collapsible per file), match highlighting, click-to-open at line, case/whole-word/regex toggles, include/exclude globs, replace-all. Rust `search_files` backend; web build searches via the File System Access API.
- ◐ **Split editors** — side-by-side second editor group (split toggle in the tab bar, independent right pane with close) · **drag-to-reorder tabs** ✅ · **tab context menu** (Close / Close Others / Close to Right / Close All / Open to Side / Copy Path) ✅; drag *between* groups + pinned/preview tabs todo
- ◐ **Diff editor** — Monaco side-by-side compare with read-only **compare mode** (HEAD vs Working Tree from the Git panel) + AI-review mode; arbitrary file-to-file compare & merge-conflict resolution still todo
- ✅ **Problems panel** — live Monaco diagnostics (errors/warnings/info) for the open file, severity icons, click-to-jump; status-bar counts are live and toggle the panel
- ✅ **Outline / symbols** — Outline sidebar (Explorer section, click-to-jump) · Go-to-Symbol in file (Ctrl+Shift+O) · Go-to-Line (Ctrl+G) · **workspace symbol search (Ctrl+T)** via the command palette Symbols source (heuristic extractor for TS/JS/Py/Rust/Go/Java/C#/MD — LSP makes it precise in Tier 2)
- ✅ **Tasks runner** — reads `.vscode/tasks.json` (or `.apex/tasks.json`, JSONC-tolerant); "Run Task: …" entries in the command palette execute the command in the integrated terminal (via terminal command injection)
- ✅ **Format** — Format Document (Shift+Alt+F) + **Format-on-save** toggle · ✅ Auto-save · ✅ **Emmet** (HTML/CSS/JSX via emmet-monaco-es) · ✅ **Snippets** (built-in for TS/JS/React/Python/Rust/Go, Tab-expand)
- ◐ **Multiple terminals** — tabs (add / close / rename / switch, each its own pty) ✅ · **split-panes** (side-by-side, up to 3) ✅; shell profiles todo
- ✅ **Timeline / local file history** — every save snapshots the file into IndexedDB (deduped, capped at 50/file); Timeline section in the Explorer lists versions for the active file with compare-to-current and one-click restore

## Tier 2 — Language intelligence (the big subsystem) 🔶
- ◐ In-browser TS/JS/JSON/CSS intelligence via Monaco (free, already present)
- ◐ **LSP client** — Rust transport (`lsp.rs`: spawn + Content-Length framing + event forwarding) and frontend client (`lsp.ts`: handshake, request/notify correlation, document sync) **built & compiling**; server registry for typescript-language-server / pyright / rust-analyzer / gopls. *Runtime validation needs the desktop app + the servers on PATH (maintainer's machine).*
- ✅ **Hover · Go-to-definition · Find references · Completion · Signature help · Rename · Code actions** — all wired to the LSP client and **protocol-validated** against a real typescript-language-server (hover types, diagnostics, completion, signature, rename edits all return correctly)
- ✅ **Live diagnostics** — publishDiagnostics → Monaco markers → Problems panel (protocol-validated: both intentional type errors caught)
- ✅ **Server config** — opt-in toggle + per-server path overrides in Settings → Editor → Language Servers; Rust spawns npm `.cmd`/`.bat` shims correctly on Windows
- ⏳ End-to-end UI confirmation (tooltip renders in the live editor) — needs the desktop app + servers on the maintainer's machine

## Tier 3 — Debugging 🔶
- ⬜ **Debug Adapter Protocol (DAP)** client
- ⬜ Breakpoints · step in/over/out · variables · watch · call stack
- ⬜ Debug console · `launch.json`

## Tier 4 — Extensibility 🔴
- ⬜ Full extension API + marketplace — **intentionally out of scope** (Microsoft-owned, enormous surface)
- ◐ Substitute already present: **MCP servers** (AI-native equivalent of extensions)
- ⬜ Support a subset: custom themes, icon themes, snippets

## Tier 5 — SCM depth & the long tail
- ⬜ Stage/unstage **hunks** · inline **git blame** · branch / stash / PR UI · multiple SCM providers
- ◐ Graphical **settings editor** — Settings dialog now reads/writes persisted store values (font size, word wrap, minimap, line numbers actually apply + survive reload; LSP enable + server paths); per-workspace `settings.json` todo
- ⬜ **Keybindings editor**
- ⬜ **Test Explorer**
- ⬜ **Multi-root workspaces** (`.code-workspace`)
- ⬜ **Remote** — SSH / WSL / containers 🔴
- ⬜ **Notebooks** (Jupyter)
- ⬜ Zen mode · layout drag-drop · settings sync

---

## Recommended sequencing
1. **Tier 1** in full — gets "feels like VS Code for daily work."
2. **Tier 2 LSP** for the top 3–4 languages (Rust, Python, TS, Go).
3. Selected Tier 5 items (SCM hunks, settings editor, test explorer).
4. **Skip** full DAP and the extension marketplace; lean on the AI agent + MCP.
