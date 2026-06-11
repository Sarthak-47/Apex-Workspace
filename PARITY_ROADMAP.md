# APEX Parity Roadmap — "Best of all five"

Goal: fuse the strengths of **VS Code** (editor/IDE), **Terax** (AI-native multi-page
shell), **Rowboat** (multi-agent builder + compounding memory), **Google Antigravity**
(agent-first IDE), and **Warp** (agentic terminal) — while staying local-first and private.

This is the **feature/competitive** track. The separate reliability track (0.1 → 1.0
hardening) lives in [`ROADMAP.md`](ROADMAP.md); the detailed editor tracker is
[`VSCODE_PARITY.md`](VSCODE_PARITY.md).

Legend: ✅ done · ◐ partial · ⬜ todo · 🔴 large / deferred · ❌ out of scope

---

## Where we are (2026-06-11 / commit 958a4cf)

The **editor + git + IDE half is essentially complete** — at parity with VS Code and Terax
minus a few deliberately-skipped pieces.

Shipped this cycle: VS Code menu bar · merge-conflict resolution · rebindable Keyboard
Shortcuts editor · Seti-style file-icon theme · Test Explorer · multi-root workspaces ·
arbitrary file-to-file diff · full git stash UI · GitHub PR UI — on top of the existing
Monaco editor, LSP, search/replace, tasks, multi-terminal, timeline, settings, and the
AI-native layer (custom agents, knowledge vault + graph, MCP, codebase index, @mentions,
inline autocomplete, Ollama model catalog, Gmail/Calendar sync).

**The remaining ~20% is almost entirely in two dimensions: agent orchestration and the
terminal.** That is the next phase of work.

---

## Phase 0 — The one strategic decision: hybrid models 🔑

Antigravity rides Gemini 3; Warp and Rowboat ride frontier APIs. Their "magic" is partly
model intelligence a 7B local model can't reproduce. APEX can match every **surface and UX
pattern** — but agent competence is capped by the model behind it.

Resolution: keep local-first, but make APEX **hybrid by design**.

- ⬜ **Local default, optional BYO-key lane** — Ollama/LM Studio private by default; an
  opt-in provider lane (Anthropic / Google / OpenRouter) for heavy agent runs. (Rowboat
  does this via the Vercel AI SDK with 5 providers.)
- ⬜ Per-agent / per-task model selection (cheap-local vs. frontier-cloud), with a clear
  privacy indicator when a request leaves the machine.
- ⬜ Prompt-caching + run logging for cloud providers (cost + visibility).

This unblocks Phases 1–3 punching above the local model ceiling.

---

## Phase 1 — Terminal → Warp parity (fastest wins; pty already exists)

- ⬜ **Block-based terminal** — group each command + its output into a collapsible,
  copyable, re-runnable block (jump between blocks, copy block, re-run).
- ⬜ **Agent mode in the terminal** — natural-language → proposed command → approve/run,
  reusing the existing tool-approval flow.
- ⬜ **Workflow library (Warp Drive equiv.)** — promote `.vscode/tasks.json` into saved,
  parameterized, searchable command workflows + prompt snippets.
- ◐ **AI command explain/fix** — explain a failed command / suggest a fix inline (builds on
  the AI panel).

Outcome: APEX *feels like* Warp.

---

## Phase 2 — Agent Manager → Antigravity parity (highest differentiation)

- ⬜ **Mission-control surface** — multiple agents running async/in parallel with status,
  an inbox, and an activity timeline (extends the existing background-task scaffolding).
- ⬜ **Artifacts** — agents emit verifiable outputs (task lists, diffs, screenshots, short
  walkthrough recordings) instead of just chat.
- ⬜ **Agent browser control** — let an agent drive the existing Web Preview to verify its
  own work and capture screenshots.
- ◐ **Trust / approval model** — tighten the per-action review flow (allowlist, dry-run,
  diff-before-apply) into a first-class agent trust surface.

Outcome: APEX stops being "VS Code + AI panel" and becomes **agent-first**.

---

## Phase 3 — Agent Builder → Rowboat parity (deepest moat)

- ⬜ **Visual multi-agent workflow builder** — a graph of agents with explicit hand-offs
  and sub-agents.
- ⬜ **"Build an agent with AI" copilot** — describe a job, it scaffolds the agent + tools
  (Rowboat's signature feature).
- ⬜ **Agent eval / test harness** — make workflows testable like code (fixtures,
  assertions, regression runs).
- ◐ **Background / scheduled agents** — cron-style live agents (partial scaffolding exists).
- ⬜ **Voice (STT / TTS)** — hands-free agent interaction (Deepgram/ElevenLabs-style, or a
  local equivalent for the private lane).

Outcome: the local-first moat — nobody private has Rowboat's visual agent builder.

---

## Phase 4 — VS Code long tail (carry-over parity gaps; do as users hit the wall)

Outstanding items from [`VSCODE_PARITY.md`](VSCODE_PARITY.md):

- 🔴 **DAP debugging** — the one genuinely large, genuinely worth-it gap. Breakpoints,
  step in/over/out, variables, watch, call stack, `launch.json`.
- ⬜ **Multiple SCM providers** — beyond git (niche; APEX is git-first).
- ◐ **Rebind Monaco-owned editor keys** — the app-level keymap is rebindable; extend
  remapping into Monaco's own keybinding service for full coverage.
- 🔴 **Notebooks** (Jupyter) — niche for a code IDE.
- 🔴 **Remote — SSH / WSL / containers** — large; revisit if demand appears.

---

## Out of scope (deliberate)

- ❌ **Extension marketplace** — Microsoft-owned, enormous surface. APEX's extension story
  is **MCP servers** (the AI-native equivalent) — already present.
- ❌ Cloud-only / account-required features that break the private-by-default promise
  (cloud sync stays opt-in).

---

## Suggested sequencing

1. **Phase 0** decision first (small) — it unblocks real agent quality everywhere else.
2. **Phase 1** (days of work) — immediately makes APEX feel like Warp.
3. **Phase 2** — the identity shift to agent-first; beats everyone on UX.
4. **Phase 3** — the durable moat.
5. **DAP** slotted in whenever a user actually hits the debugging wall.

Reliability work (CI, graceful failures, signing, beta) proceeds in parallel per
[`ROADMAP.md`](ROADMAP.md) — don't let new features outrun trust in the existing ones.
