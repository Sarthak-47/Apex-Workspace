# VS Code Parity — Gap Tracker

Goal: make APEX feel like VS Code for daily work, **without** chasing the
impossible parts (full extension marketplace, every niche feature) that would
bury what makes APEX special — local-first + AI-native.

Legend: ✅ done · ◐ partial · ⬜ todo · 🔴 very large / may be intentionally out of scope

---

## Recently added ✅
- ✅ **Command palette — commands** (`>` prefix / Ctrl+Shift+P): View toggles (terminal, problems, sidebar, explorer/search/git, split), Preferences, editor toggles (wrap, minimap, auto-save, format-on-save, vim, AI autocomplete), Cookbook/Compare — alongside file/symbol/task/git search

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
- ◐ **Split editors** — side-by-side second editor group (split toggle in the tab bar, independent right pane with close) · **drag-to-reorder tabs** ✅ · **tab context menu** (Close / Close Others / Close to Right / Close All / Open to Side / Copy Path) ✅ · **pinned tabs** (pin glyph, render first, protected from bulk-close) ✅; drag *between* groups + preview tabs todo
- ◐ **Diff editor** — Monaco side-by-side compare with read-only **compare mode** (HEAD vs Working Tree from the Git panel) + AI-review mode; arbitrary file-to-file compare still todo. ✅ **Merge-conflict resolution** — detects `<<<<<<< / ======= / >>>>>>>` markers in any language, inline CodeLens (Accept Current / Incoming / Both / Compare Changes) + green/blue block decorations & gutter bars (`mergeConflict.ts`, verified: accept-current collapses the block to the chosen side)
- ✅ **Problems panel** — live Monaco diagnostics (errors/warnings/info) for the open file, severity icons, click-to-jump; status-bar counts are live and toggle the panel
- ✅ **Outline / symbols** — Outline sidebar (Explorer section, click-to-jump) · Go-to-Symbol in file (Ctrl+Shift+O) · Go-to-Line (Ctrl+G) · **workspace symbol search (Ctrl+T)** via the command palette Symbols source (heuristic extractor for TS/JS/Py/Rust/Go/Java/C#/MD — LSP makes it precise in Tier 2)
- ✅ **Tasks runner** — reads `.vscode/tasks.json` (or `.apex/tasks.json`, JSONC-tolerant); "Run Task: …" entries in the command palette execute the command in the integrated terminal (via terminal command injection)
- ✅ **Format** — Format Document (Shift+Alt+F) + **Format-on-save** toggle · ✅ Auto-save · ✅ **Emmet** (HTML/CSS/JSX via emmet-monaco-es) · ✅ **Snippets** (built-in for TS/JS/React/Python/Rust/Go, Tab-expand)
- ✅ **Multiple terminals** — tabs (add / close / rename / switch, each its own pty) · **split-panes** (side-by-side, up to 3) · **shell profiles** (Settings → Terminal: pwsh / PowerShell / cmd / zsh / bash, applied to new terminals)
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
- ◐ Support a subset: custom themes ✅, **icon theme** ✅ (`fileIcons.tsx` — shared Seti-style colored glyphs across Explorer, tabs, command palette & search; ~90 extensions + special filenames like package.json/tsconfig/Dockerfile/.gitignore/vite.config), snippets ✅

## Multi-page app (Terax-inspired) ✅
- ✅ Activity-bar page router; Code page = the IDE (unchanged), full pages for Welcome / Source Control / Web Preview / AI Agents / Knowledge / Models / Settings
- ✅ **Web Preview** with live **dev-server auto-detect** (no-cors port probe) + commit **graph** on Source Control

## Tier 5 — SCM depth & the long tail
- ✅ **Open Editors** view — Explorer section listing open tabs (switch, close, close-all, unsaved dot)
- ✅ **File explorer context menu** — New File/Folder, Rename, Delete, Copy Path, Reveal (already present)
- ◐ **inline git blame** — Rust `git_blame` (porcelain parser, validated against real git output) + status-bar "author, time ago" for the current line (desktop app only)
- ✅ **branch picker** — click the branch in the status bar → switch branches or create a new one (uses existing git backend)
- ✅ **Git hunk staging** — Rust `git_apply_cached` (patch → index via `git apply --cached --unidiff-zero`, mechanism validated in a temp repo: staging one hunk yields partial `MM` staging); `parseDiffHunks` splits a diff into per-hunk patches; Source Control page **Changes** tab shows each file's hunks with Stage/Unstage buttons (desktop app)
- ⬜ stash UI · PR UI · multiple SCM providers
- ✅ Graphical **settings editor** — Settings dialog reads/writes persisted store values (font size, word wrap, minimap, line numbers apply + survive reload; LSP enable + server paths) · **per-workspace `.vscode/settings.json`** applied on folder open (editor.fontSize/wordWrap/minimap/lineNumbers/formatOnSave, files.autoSave)
- ✅ **Keybindings editor** — searchable Keyboard Shortcuts editor (Ctrl+/ or Help menu): COMMAND / KEYBINDING / CATEGORY table, 47 bindings across General/File/View/Editor/Selection/Code-Intelligence/Chat, live filter by command·key·category with result count (rebind-to-custom-keymap still todo)
- ✅ **Test Explorer** — Testing view in the activity bar (`TestExplorer.tsx` + `tests.ts`): discovers vitest/jest, pytest, go test and cargo `#[test]` cases across the workspace; collapsible file→test tree with framework badges and a test count; Run-file / Run-test / Run-all inject the correct command into the integrated terminal (`npx vitest run "<f>" -t "<name>"`, `pytest <f>::<name>`, `go test -run`, `cargo test`); clicking a test opens the file at its line. Verified in preview (8 tests across vitest+pytest discovered, run command reaches the terminal)
- ⬜ **Multi-root workspaces** (`.code-workspace`)
- ⬜ **Remote** — SSH / WSL / containers 🔴
- ⬜ **Notebooks** (Jupyter)
- ✅ **Zen mode** (distraction-free: titlebar + editor only, Esc to exit, command-palette toggle) · ✅ **Reopen Closed Editor** (Ctrl+Shift+T) · layout drag-drop · settings sync todo

---

## Recommended sequencing
1. **Tier 1** in full — gets "feels like VS Code for daily work."
2. **Tier 2 LSP** for the top 3–4 languages (Rust, Python, TS, Go).
3. Selected Tier 5 items (SCM hunks, settings editor, test explorer).
4. **Skip** full DAP and the extension marketplace; lean on the AI agent + MCP.
