# Security

APEX is local-first: your code, prompts, models, and data stay on your machine.
Nothing is sent anywhere unless you explicitly connect an optional integration
(Gmail, Calendar, Fireflies, an MCP server, or a SearXNG instance you point it at).

## Trust model

| Surface | How it's handled |
|---|---|
| **Shell execution** (agent `run_bash`) | **Fail-closed** — a command never runs without an explicit approval prompt. If no approval handler is wired, execution is disabled. Timeouts are hard-capped at 300s; runs are cancellable. |
| **Secrets** (Gmail/Calendar tokens, Fireflies key) | Stored in the **OS keyring** (Windows Credential Manager via `keyring`), never in plaintext files or the repo. Not written to logs. |
| **File access** | Scoped to the workspace you open. |
| **MCP servers** | Launch **local commands you configure yourself** (e.g. `npx exa-mcp`). Treat adding an MCP server like installing software — only add servers you trust. |
| **Network** | Outbound only to endpoints you configure (Ollama localhost, GitHub for update checks, your SearXNG, OAuth providers you connect). No telemetry. |
| **Crash logs** | Stored locally in `localStorage["apex-crash-log"]`. Never transmitted. |

## Known limitations (pre-1.0)

- The installer is **unsigned**, so Windows SmartScreen warns on first launch. A
  code-signing certificate is planned (see `ROADMAP.md`).
- The agent can modify files and run approved commands. Review diffs and command
  prompts before approving — especially with less capable local models.

## Reporting a vulnerability

Found something? Please open a private report via GitHub Security Advisories on
[Sarthak-47/Apex-Workspace](https://github.com/Sarthak-47/Apex-Workspace/security/advisories/new),
or email **0906sarthak@gmail.com**. Please don't file public issues for security bugs.
