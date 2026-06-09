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

**Core IDE** — Monaco editor (7 themes, Vim mode, inline AI autocomplete, live Markdown preview), real PTY terminal (multi-tab), file explorer, Git panel with diff review, web preview pane, command palette, fully themeable.

**AI agent** — chat with local models, Plan mode, 5 built-in agents (Coder / Reviewer / Explainer / Debugger / Test Writer) plus custom agents, file read/write/edit/search tools with diff-gated approval, approval-gated bash, `@file` / `@folder` / `@symbol` / `@person` mentions.

**Living memory** — automatic codebase indexing (Ollama embeddings + local vector search), auto-generated `WORKSPACE.md`, semantic context injection into chat.

**Knowledge graph** — Obsidian-compatible Markdown vault, Gmail / Google Calendar / Fireflies sync → automatic entity extraction (people, projects, decisions, meetings), interactive force-directed graph, `[[wikilinks]]` + backlinks, unified search across code + knowledge + git.

**Background agents** — scheduler with a Background Tasks panel, **live notes** (objective-driven self-updating notes), **meeting prep** (briefs before calendar events), **weekly briefing**, **email draft grounding** (replies grounded in your knowledge graph).

**Extensible** — MCP (Model Context Protocol) tool servers (Exa web search, GitHub, any community server).

## Download

Grab the latest Windows build from the [**Releases**](https://github.com/Sarthak-47/Apex-Workspace/releases/latest) page:

| Installer | Size | Notes |
|---|---|---|
| [`APEX_0.1.0_x64-setup.exe`](https://github.com/Sarthak-47/Apex-Workspace/releases/latest) | ~6.7 MB | NSIS installer (recommended) |
| [`APEX_0.1.0_x64_en-US.msi`](https://github.com/Sarthak-47/Apex-Workspace/releases/latest) | ~8.5 MB | MSI for managed/enterprise installs |

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

The path from 0.1 to 1.0 is reliability and trust, not more features — see [`ROADMAP.md`](ROADMAP.md).

## License

See repository. Built by [Sarthak-47](https://github.com/Sarthak-47).
