# Changelog

All notable changes to APEX. This release covers Phases 1–4 of the build plan plus Phase 5 MCP + polish.

## [0.1.0] — 2026-06

### Phase 1 — Core IDE Shell
- Tauri 2 + React 19 + Vite + Tailwind v4 frameless desktop shell; 5-zone resizable layout
- Rust file-system commands (read/write/list/create/delete/rename) + recursive grep
- Monaco editor: 7 themes, file tabs with unsaved indicators, auto-save, language detection, word wrap / minimap / font controls, breadcrumb, status bar
- File explorer: recursive tree, keyboard nav, context menu (new/rename/delete/copy/reveal), inline creation, recent workspaces, open file/folder dialogs
- Real PTY terminal (portable-pty), multi-tab, shell detection, xterm.js + fit/web-links; rich browser mock shell
- Git panel: status, stage/unstage, commit, push/pull, log, per-file diff (Monaco DiffEditor), branch commands
- Web preview pane, settings dialog, Vim mode, command palette, keyboard shortcuts

### Phase 2 — AI Agent + Codebase Memory
- Ollama integration (health check, model selector, streaming chat, Plan mode)
- Vercel AI SDK agent tools: read/list/search/edit/write with diff-gated approval
- Approval-gated bash tool (Allow Once / Always / Deny) + custom-command whitelist
- 5 built-in agents + user-defined custom agents (prompt, tool subset, model, temperature)
- File watcher (`notify`); inline AI autocomplete (Monaco ghost text via Ollama)
- Codebase indexing: chunking + Ollama embeddings + local vector search; semantic context injection
- `@file` / `@folder` / `@symbol` mentions; auto-generated `WORKSPACE.md`

### Phase 3 — Knowledge Graph
- Obsidian-compatible Markdown vault (people/projects/orgs/decisions/meetings/topics) with YAML frontmatter, `[[wikilinks]]`, backlinks, live Markdown preview
- Gmail OAuth + raw thread sync; Google Calendar sync; Fireflies meeting-transcript sync
- Entity extraction pipeline (`generateObject` + strictness levels + fuzzy dedup/merge)
- Interactive d3-force knowledge graph (shapes by type, zoom/pan, focus mode, search, PNG export)
- Knowledge `@mentions` with context cards; unified search (Ctrl+K) across code + knowledge + git
- Vault management: note history, rebuild-links, zip export, clear vault

### Phase 4 — Background Agents
- Unified job scheduler + Background Tasks panel (status, last/next run, Run Now, enable/disable, logs); persisted across restarts with overdue rerun
- Live notes (objective-driven self-updating); meeting prep agent; weekly briefing agent
- Email draft grounding (COMMS panel) — replies grounded in knowledge graph; sending stays manual

### Phase 5 — Tools & Polish
- MCP client (Rust JSON-RPC over stdio) + server management; Exa + GitHub presets; tool registry UI
- Keyboard-shortcuts reference panel (Ctrl+/); first-launch onboarding flow
- All UI icons are inline SVG (no emoji)

### Privacy
- Local-first by default; OS-keychain token storage; no telemetry
