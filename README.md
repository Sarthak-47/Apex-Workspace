<div align="center">
  <img src="public/apex-logo.svg" width="96" height="96" alt="APEX" />
  <h1>APEX</h1>
  <p><strong>A local-first, AI-native developer workspace.</strong><br/>
  Part IDE, part coworker, all private. No subscription. No cloud. No cold start.</p>
</div>

---

APEX is a hybrid workspace that fuses a polished IDE, an agentic AI coding assistant, and a **living knowledge graph** of your code, people, and decisions — all running locally on your machine via [Ollama](https://ollama.com). The AI knows your project from day one and keeps itself current while you work.

Built with **Tauri 2 + Rust + React 19**. Small binary, native performance, nothing leaves your machine.

## Why APEX

Every other AI coding tool starts every session from zero. It doesn't know why you chose Postgres three months ago, what the client email changed last week, or that Alex is the backend lead who hates over-engineered abstractions. APEX builds a **self-updating memory layer** so it does.

| | Cursor | Claude Code | APEX |
|---|---|---|---|
| Local LLM (primary) | Partial | No | **Yes** |
| Persistent memory | Static `.md` | Static `.md` | **Living graph** |
| Auto-updating memory | No | No | **Yes** |
| Email / meeting context | No | No | **Yes** |
| Background agents | No | No | **Yes** |
| Monthly cost | $20–200 | $0–200 | **Free** |
| Fully local / private | Partial | Cloud | **Full local** |

## Features

**Core IDE** — Monaco editor (7 themes, Vim mode, inline AI autocomplete, live Markdown preview, deep editor settings — font/family, rulers, sticky scroll, guides, save behaviors…), VS Code-style **menu bar** + **command palette** (with keybinding hints, recent files & commands), **rebindable keyboard shortcuts**, Seti-style **file-icon theme**, **bookmarks**, **TODO/FIXME panel**, **navigation history**, breadcrumbs with current symbol, real PTY terminal (multi-tab, splits, shell profiles) + a **Workflow Library** of saved/parameterized commands, file explorer with **multi-root workspaces**, **Test Explorer** (vitest/jest/pytest/go/cargo), **user snippets**, LSP language intelligence, web preview pane, fully themeable.

**Source control** — Git panel with stage/commit/push/pull, per-hunk staging, inline blame, branch picker, commit graph, **merge-conflict resolution** (inline CodeLens), **arbitrary file-to-file diff**, full **stash UI** (apply/pop/drop), and a **GitHub Pull Request UI** (list/create/checkout via `gh`).

**AI agent** — chat with local models, Plan mode, 5 built-in agents (Coder / Reviewer / Explainer / Debugger / Test Writer) plus custom agents (per-agent model + tools), file read/write/edit/search tools with diff-gated approval, approval-gated bash, `@file` / `@folder` / `@symbol` / `@person` mentions.

**Mission Control** — launch agent tasks that stream in the **background**; multiple run **concurrently** with live status, streamed output, cancel, an optional **per-run model override**, and a running-count badge. Code blocks become **artifacts**: filename-aware **Apply** (when the block names a file it opens and targets it; otherwise the active file) staged through the diff-review modal — you approve before anything is written. Finished runs offer **Re-run**, **Edit** (load back into the launcher to tweak), and **Continue in chat** (hand the run off to the main AI panel to iterate).

**Terminal AI** — an **Ask / Explain / Fix** bar in the integrated terminal (also from the command palette): describe a task in natural language and get a single proposed command to approve and run (never auto-executed), paste a command for a plain-English **explanation**, or paste a failing command + its error to get a **fix**. Obviously destructive commands (rm -rf, git reset --hard / push --force, dd, DROP TABLE…) are held behind a two-step *Review → Run anyway* confirm. All local.

**Hybrid models** — local Ollama by default; an optional, off-by-default **cloud lane** (OpenRouter / OpenAI / Groq / Together / any OpenAI-compatible API) for chat and agent runs. API keys live in the **OS keyring**, never on disk; an amber status-bar indicator shows whenever a request would leave your machine.

**Living memory** — automatic codebase indexing (Ollama embeddings + local vector search), auto-generated `WORKSPACE.md`, semantic context injection into chat.

**Knowledge graph** — Obsidian-compatible Markdown vault, Gmail / Google Calendar / Fireflies sync → automatic entity extraction (people, projects, decisions, meetings), interactive force-directed graph, `[[wikilinks]]` + backlinks, unified search across code + knowledge + git.

**Background agents** — scheduler with a Background Tasks panel, **live notes** (objective-driven self-updating notes), **meeting prep** (briefs before calendar events), **weekly briefing**, **email draft grounding** (replies grounded in your knowledge graph).

**Extensible** — MCP (Model Context Protocol) tool servers (Exa web search, GitHub, any community server).

## Download

Grab the latest Windows build from the [**Releases**](https://github.com/Sarthak-47/Apex-Workspace/releases/latest) page:

| Installer | Notes |
|---|---|
| [`APEX_0.3.1_x64-setup.exe`](https://github.com/Sarthak-47/Apex-Workspace/releases/latest) | NSIS installer (recommended) |
| [`APEX_0.3.1_x64_en-US.msi`](https://github.com/Sarthak-47/Apex-Workspace/releases/latest) | MSI for managed/enterprise installs |

The app is unsigned, so Windows SmartScreen may warn on first launch — choose **More info → Run anyway**. APEX still needs [Ollama](https://ollama.com) running locally (see Prerequisites below).

## Getting started

### Prerequisites
- [Ollama](https://ollama.com) running locally (`ollama serve`)
- A coding model: `ollama pull qwen2.5-coder:7b`
- For codebase memory: `ollama pull nomic-embed-text`

### Run from source
```bash
npm install
npm run tauri dev      # desktop app
# or, for web-first development:
npm run dev            # http://localhost:5173 (FS/PTY/git fall back to mocks)
```

### Build a desktop installer
```bash
npm run tauri build    # native installer in src-tauri/target/release/bundle/
```

### Optional connections (Settings → Connections)
- **Gmail / Calendar** — a Google Cloud OAuth *Desktop app* client (allows loopback redirect)
- **Fireflies** — API key
- **MCP servers** — Exa (API key), GitHub (Personal Access Token)

## Tech stack

Tauri 2 · Rust · React 19 · TypeScript · Vite · Tailwind v4 · Zustand · Monaco · xterm.js + portable-pty · Vercel AI SDK + ollama-ai-provider · d3-force · `notify` (file watching) · `keyring` (OS keychain) · `reqwest` · `chrono`.

## Privacy & security

Everything is local by default. Models run on your GPU via Ollama. Tokens (Gmail, Fireflies) live in the OS keychain. No telemetry, ever. Cloud BYOK is optional. Shell commands are fail-closed (always approval-gated). See [`SECURITY.md`](SECURITY.md).

## Roadmap

Two parallel tracks:
- **Reliability** (0.1 → 1.0 hardening: CI, graceful failures, signing, beta) — [`ROADMAP.md`](ROADMAP.md)
- **Competitive features** (best of VS Code · Terax · Rowboat · Antigravity · Warp — hybrid models → Warp terminal → agent manager → agent builder) — [`PARITY_ROADMAP.md`](PARITY_ROADMAP.md), with the detailed editor checklist in [`VSCODE_PARITY.md`](VSCODE_PARITY.md).

## License

See repository. Built by [Sarthak-47](https://github.com/Sarthak-47).
