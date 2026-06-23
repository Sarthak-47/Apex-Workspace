import { useState, useRef } from "react";
import { useAppStore } from "@/store";
import { BUILTIN_AGENTS } from "@/lib/agents";
import { launchAgentRun, cancelAgentRun, type RunStatus } from "@/lib/agentRunner";
import { readFile } from "@/lib/tauri";
import { AgentIcon } from "@/components/ui/Icons";
import { PageShell } from "./PageShell";

const STATUS_STYLE: Record<RunStatus, { label: string; color: string; bg: string }> = {
  running:   { label: "running",   color: "#A5B4FC", bg: "#1A1A3A" },
  done:      { label: "done",      color: "#22C55E", bg: "#0E1F14" },
  error:     { label: "error",     color: "#EF4444", bg: "#220E0E" },
  cancelled: { label: "cancelled", color: "#8888A8", bg: "#16161F" },
};

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// A path-like token: has an extension, no spaces, optional dirs. e.g. src/foo.ts
const PATH_RE = /^[\w./@-]+\/[\w.-]+\.\w+$|^[\w.-]+\.\w+$/;

// Detect a target file path for an artifact, from the fence info string
// (```ts src/foo.ts  /  ```ts:src/foo.ts) or a leading path comment in the code
// (// src/foo.ts  /  # path  /  <!-- path -->).
export function detectArtifactPath(info: string, code: string): string | undefined {
  const infoTokens = info.trim().split(/[\s:]+/).filter(Boolean);
  for (const tok of infoTokens) if (PATH_RE.test(tok)) return tok;
  const first = code.split("\n")[0].trim();
  const cm = first.match(/^(?:\/\/|#|;|--)\s*(.+?)\s*$|^<!--\s*(.+?)\s*-->$|^\/\*\s*(.+?)\s*\*\/$/);
  const cand = cm && (cm[1] || cm[2] || cm[3]);
  if (cand && PATH_RE.test(cand.trim())) return cand.trim();
  return undefined;
}

// Fenced code blocks in an agent's output become copyable "artifacts".
function extractCodeBlocks(output: string): { lang: string; code: string; path?: string }[] {
  const out: { lang: string; code: string; path?: string }[] = [];
  const re = /```([^\n]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output))) {
    const info = m[1] || "";
    const code = m[2].replace(/\n$/, "");
    if (!code.trim()) continue;
    const tok0 = info.trim().split(/[\s:]+/)[0] || "";
    const lang = tok0 && !PATH_RE.test(tok0) ? tok0 : "text";
    out.push({ lang, code, path: detectArtifactPath(info, code) });
  }
  return out;
}

export function MissionControlPage() {
  const { agentRuns, userAgents, removeAgentRun, clearAgentRuns, ollamaOnline, activeFile, setPendingDiffReview, setAppPage, addToast, openFile, setIntelTab, setPendingChatInput, intelPanelOpen, toggleIntelPanel } = useAppStore();
  const allAgents = [...BUILTIN_AGENTS, ...userAgents];
  const [agentId, setAgentId] = useState(allAgents[0]?.id ?? "coder");
  const [prompt, setPrompt] = useState("");
  const [modelOverride, setModelOverride] = useState("");
  const [includeFile, setIncludeFile] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const activeName = activeFile ? activeFile.split(/[\\/]/).pop() : null;

  // Load a past run back into the launcher to tweak before relaunching.
  const editAndReRun = (r: { agentId: string; prompt: string; model: string }) => {
    setAgentId(r.agentId);
    setPrompt(r.prompt);
    setModelOverride(r.model);
    requestAnimationFrame(() => {
      const el = promptRef.current;
      if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); el.scrollIntoView({ block: "nearest" }); }
    });
  };

  const launch = async () => {
    if (!prompt.trim()) return;
    let p = prompt.trim();
    if (includeFile && activeFile) {
      const content = await readFile(activeFile).catch(() => "");
      if (content) p = `File \`${activeFile}\`:\n\n\`\`\`\n${content}\n\`\`\`\n\n${p}`;
    }
    launchAgentRun(agentId, p, modelOverride);
    setPrompt("");
  };
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Apply an artifact through the diff-review approval modal. Targets the
  // artifact's detected file path when present (opening it first), otherwise the
  // active file. Switches to the editor so the staged edit lands when accepted.
  const applyArtifact = async (code: string, targetPath?: string) => {
    const path = targetPath || activeFile;
    if (!path) { addToast("Open a file in the editor to apply an artifact", "error"); return; }
    const original = await readFile(path).catch(() => "");
    if (targetPath) openFile(targetPath);
    setAppPage("code");
    setPendingDiffReview({ path, original, proposed: code, mode: "review", originalLabel: "Current", modifiedLabel: "Agent artifact" });
  };

  // Hand a finished run off to the main AI chat to iterate further. Switches to
  // the editor, opens the AI panel on the chat tab, and prefills the input.
  const continueInChat = (r: { prompt: string; output: string; agentName: string }) => {
    const prefill = `Earlier task for ${r.agentName}:\n${r.prompt}\n\nIts response:\n${r.output}\n\nFollow-up: `;
    setAppPage("code");
    if (!intelPanelOpen) toggleIntelPanel();
    setIntelTab("chat");
    setPendingChatInput(prefill);
  };

  const running = agentRuns.filter((r) => r.status === "running").length;
  const inp: React.CSSProperties = { width: "100%", background: "#0A0A0F", border: "1px solid #252535", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#E2E2EC", outline: "none" };

  return (
    <PageShell title="Mission Control" subtitle={`${running} running · ${agentRuns.length} total`}
      actions={agentRuns.some((r) => r.status !== "running") ? <button onClick={clearAgentRuns} style={{ height: 28, padding: "0 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#13131B", border: "1px solid #252535", color: "#9A9AB5" }}>Clear finished</button> : undefined}>
      <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
        {/* Launcher */}
        <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid #1A1A28", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "#6A6A85" }}>LAUNCH A TASK</div>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={inp}>
            {allAgents.map((a) => <option key={a.id} value={a.id} style={{ background: "#13131B" }}>{a.name}{a.builtin ? "" : " (custom)"}</option>)}
          </select>
          <input value={modelOverride} onChange={(e) => setModelOverride(e.target.value)} placeholder="Model (optional — overrides the agent's)" style={{ ...inp, fontFamily: '"JetBrains Mono",monospace', fontSize: 11 }} />
          <textarea ref={promptRef} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the task for this agent…"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) launch(); }}
            rows={6} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
          {activeName && (
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "#8888A8", cursor: "pointer" }}>
              <input type="checkbox" checked={includeFile} onChange={(e) => setIncludeFile(e.target.checked)} />
              Include active file <code style={{ fontFamily: '"JetBrains Mono",monospace', color: "#9A9AB5" }}>{activeName}</code> as context
            </label>
          )}
          <button onClick={launch} disabled={!prompt.trim()}
            style={{ height: 32, borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: prompt.trim() ? "pointer" : "default", background: prompt.trim() ? "var(--accent)" : "#1A1A28", border: "none", color: prompt.trim() ? "#fff" : "#4A4A65" }}>
            Launch agent ▸
          </button>
          <p style={{ fontSize: 10.5, color: "#5A5A75", lineHeight: 1.6, margin: "2px 0 0" }}>
            Runs stream in the background — launch several at once. Agents respond with reasoning;
            file edits and shell commands stay in the main chat (with approval).
          </p>
          {!ollamaOnline && (
            <div style={{ fontSize: 10.5, color: "#E2776A", background: "#1F0E0E", border: "1px solid #3A1A1A", borderRadius: 6, padding: "7px 9px", lineHeight: 1.5 }}>
              Ollama offline — runs will fail until <code style={{ fontFamily: '"JetBrains Mono",monospace' }}>ollama serve</code> is running.
            </div>
          )}
        </div>

        {/* Runs */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 16 }}>
          {agentRuns.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#4A4A65", fontSize: 12 }}>
              No runs yet — launch a task to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
              {agentRuns.map((r) => {
                const st = STATUS_STYLE[r.status];
                const isOpen = expanded.has(r.id);
                const preview = r.output.slice(0, isOpen ? undefined : 240);
                return (
                  <div key={r.id} style={{ border: "1px solid #1A1A28", borderRadius: 10, background: "#0D0D14", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                      <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: `${r.agentColor}22` }}>
                        <AgentIcon kind={r.agentIcon} size={15} color={r.agentColor} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: "#E2E2EC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.prompt}</div>
                        <div style={{ fontSize: 10, color: "#5A5A75", fontFamily: '"JetBrains Mono",monospace', marginTop: 1 }}>{r.agentName} · {r.model} · {relTime(r.startedAt)}</div>
                      </div>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: st.color, background: st.bg, border: `1px solid ${st.color}30`, borderRadius: 10, padding: "2px 9px", flexShrink: 0 }}>
                        {r.status === "running" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color, animation: "spin 0.8s linear infinite" }} />}
                        {st.label}
                      </span>
                      {r.status === "running"
                        ? <button onClick={() => cancelAgentRun(r.id)} style={{ fontSize: 10.5, color: "#8888A8", background: "none", border: "1px solid #252535", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }} className="hover:!text-[#E2776A]">Cancel</button>
                        : <>
                            <button onClick={() => launchAgentRun(r.agentId, r.prompt)} title="Re-run with the same prompt" style={{ fontSize: 10.5, color: "#9A9AB5", background: "none", border: "1px solid #252535", borderRadius: 5, padding: "3px 8px", cursor: "pointer", flexShrink: 0 }} className="hover:!text-[var(--accent)]">Re-run</button>
                            <button onClick={() => editAndReRun(r)} title="Load into the launcher to edit and relaunch" style={{ fontSize: 10.5, color: "#9A9AB5", background: "none", border: "1px solid #252535", borderRadius: 5, padding: "3px 8px", cursor: "pointer", flexShrink: 0 }} className="hover:!text-[var(--accent)]">Edit</button>
                            {r.output && r.status === "done" && <button onClick={() => continueInChat(r)} title="Continue this in the AI chat" style={{ fontSize: 10.5, color: "#9A9AB5", background: "none", border: "1px solid #252535", borderRadius: 5, padding: "3px 8px", cursor: "pointer", flexShrink: 0 }} className="hover:!text-[var(--accent)]">Continue in chat</button>}
                            {r.output && <button onClick={() => navigator.clipboard?.writeText(r.output).catch(() => {})} title="Copy output" style={{ color: "#6A6A85", background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 }} className="hover:!text-[#E2E2EC]"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M2.5 9.5V2.5h7"/></svg></button>}
                            <button onClick={() => removeAgentRun(r.id)} title="Remove" style={{ color: "#6A6A85", background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 }} className="hover:!text-[#E2776A]"><svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/></svg></button>
                          </>}
                    </div>
                    {(r.output || r.error) && (
                      <div onClick={() => toggle(r.id)} style={{ borderTop: "1px solid #16161F", padding: "10px 12px", cursor: "pointer" }}>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: '"JetBrains Mono",monospace', fontSize: 11.5, lineHeight: 1.6, color: r.error ? "#E2776A" : "#9A9AB5", maxHeight: isOpen ? undefined : 120, overflow: "hidden" }}>
                          {r.error ? `Error: ${r.error}` : preview}{!isOpen && r.output.length > 240 ? "…" : ""}
                        </pre>
                        {(r.output.length > 240 || r.error) && <div style={{ fontSize: 10, color: "var(--accent)", marginTop: 6 }}>{isOpen ? "Show less" : "Show more"}</div>}
                      </div>
                    )}
                    {(() => {
                      const blocks = r.error ? [] : extractCodeBlocks(r.output);
                      if (blocks.length === 0) return null;
                      return (
                        <div style={{ borderTop: "1px solid #16161F", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", color: "#5A5A75" }}>ARTIFACTS</div>
                          {blocks.map((b, bi) => (
                            <div key={bi} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#9A9AB5" }}>
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.3" style={{ flexShrink: 0 }}><polyline points="4,3 1.5,7 4,11"/><polyline points="10,3 12.5,7 10,11"/></svg>
                              <span style={{ flex: 1, fontFamily: '"JetBrains Mono",monospace', fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {b.path
                                  ? <><span style={{ color: "var(--accent)" }}>{b.path}</span> · {b.code.split("\n").length} line{b.code.split("\n").length === 1 ? "" : "s"}</>
                                  : <>{b.lang} · {b.code.split("\n").length} line{b.code.split("\n").length === 1 ? "" : "s"}</>}
                              </span>
                              {(b.path || activeFile) && <button onClick={() => applyArtifact(b.code, b.path)} title={b.path ? `Apply to ${b.path} (review first)` : `Apply to ${activeName} (review first)`} style={{ fontSize: 10, color: "var(--accent)", background: "#1A1A3A", border: "1px solid #6366F130", borderRadius: 5, padding: "2px 8px", cursor: "pointer", flexShrink: 0 }} className="hover:!bg-[#252550]">{b.path ? "Apply" : "Apply to file"}</button>}
                              <button onClick={() => navigator.clipboard?.writeText(b.code).catch(() => {})} style={{ fontSize: 10, color: "#9A9AB5", background: "none", border: "1px solid #252535", borderRadius: 5, padding: "2px 8px", cursor: "pointer", flexShrink: 0 }} className="hover:!text-[var(--accent)]">Copy</button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
