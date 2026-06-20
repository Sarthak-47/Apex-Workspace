import { useState } from "react";
import { useAppStore } from "@/store";
import { BUILTIN_AGENTS } from "@/lib/agents";
import { launchAgentRun, cancelAgentRun, type RunStatus } from "@/lib/agentRunner";
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

export function MissionControlPage() {
  const { agentRuns, userAgents, removeAgentRun, clearAgentRuns, ollamaOnline } = useAppStore();
  const allAgents = [...BUILTIN_AGENTS, ...userAgents];
  const [agentId, setAgentId] = useState(allAgents[0]?.id ?? "coder");
  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const launch = () => {
    if (!prompt.trim()) return;
    launchAgentRun(agentId, prompt.trim());
    setPrompt("");
  };
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the task for this agent…"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) launch(); }}
            rows={6} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
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
                            <button onClick={() => launchAgentRun(r.agentId, r.prompt)} title="Re-run" style={{ fontSize: 10.5, color: "#9A9AB5", background: "none", border: "1px solid #252535", borderRadius: 5, padding: "3px 8px", cursor: "pointer", flexShrink: 0 }} className="hover:!text-[var(--accent)]">Re-run</button>
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
