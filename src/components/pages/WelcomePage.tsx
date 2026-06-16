import { useAppStore } from "@/store";
import { openFolderDialog, createWorkspaceFolder, activateWorkspace } from "@/lib/tauri";

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

function ActionCard({ title, desc, icon, onClick }: { title: string; desc: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 10, background: "#13131B", border: "1px solid #252535", cursor: "pointer", textAlign: "left", width: "100%" }}
      className="hover:!border-[var(--accent)] hover:!bg-[#16162a] transition-colors">
      <span style={{ flexShrink: 0, color: "var(--accent)", display: "flex" }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#E6E6F0" }}>{title}</span>
        <span style={{ display: "block", fontSize: 11, color: "#6A6A85", marginTop: 1 }}>{desc}</span>
      </span>
    </button>
  );
}

export function WelcomePage() {
  const { recentWorkspaces, setWorkspacePath, setAppPage, ollamaOnline, ollamaModels, removeRecentWorkspace, clearRecentWorkspaces, setLeftPanelView, leftPanelOpen, toggleLeftPanel } = useAppStore();

  const codeView = (view: 'tests' | 'workflows') => { setAppPage('code'); setLeftPanelView(view); if (!leftPanelOpen) toggleLeftPanel(); };
  const open = async () => { const p = await openFolderDialog(); if (p) { setWorkspacePath(p); setAppPage('code'); } };
  const create = async () => { const p = await createWorkspaceFolder(); if (p) { setWorkspacePath(p); setAppPage('code'); } };
  const switchTo = async (p: string) => { if (await activateWorkspace(p)) { setWorkspacePath(p); setAppPage('code'); } };

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "#0A0A0F" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "56px 28px 40px" }}>
        {/* Hero */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <img src="/apex-logo.svg" width={44} height={44} alt="APEX" style={{ objectFit: "contain", mixBlendMode: "lighten" }} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: "#E6E6F0", letterSpacing: "0.02em" }}>APEX</span>
              <span style={{ fontSize: 11, color: "var(--accent)", border: "1px solid #6366F140", borderRadius: 10, padding: "1px 8px" }}>v0.2.0</span>
            </div>
            <div style={{ fontSize: 12, color: "#6A6A85" }}>Local-first, AI-native developer workspace</div>
          </div>
        </div>

        {/* Ollama status pill */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, padding: "5px 11px", borderRadius: 20, background: "#13131B", border: "1px solid #252535", fontSize: 11, color: "#9A9AB5" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: ollamaOnline ? "#22C55E" : "#4A4A65", boxShadow: ollamaOnline ? "0 0 6px #22C55E88" : "none" }} />
          {ollamaOnline ? `Ollama online · ${ollamaModels.length} model${ollamaModels.length === 1 ? "" : "s"}` : "Ollama offline — run `ollama serve`"}
        </div>

        {/* Start */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 32 }}>
          <ActionCard title="Open Folder" desc="Open an existing project" onClick={open}
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/></svg>} />
          <ActionCard title="New Folder" desc="Create and open a new project" onClick={create}
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/><line x1="10" y1="9" x2="10" y2="13"/><line x1="8" y1="11" x2="12" y2="11"/></svg>} />
          <ActionCard title="AI Agents" desc="Create & manage custom agents" onClick={() => setAppPage('agents')}
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="7" r="3"/><path d="M4 17a6 6 0 0 1 12 0"/></svg>} />
          <ActionCard title="Models" desc="Recommend & pull local models" onClick={() => setAppPage('models')}
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="14" height="12" rx="2"/><line x1="3" y1="8" x2="17" y2="8"/></svg>} />
          <ActionCard title="Workflows" desc="Saved & parameterized commands" onClick={() => codeView('workflows')}
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2 5 11h4l-1 7 6-9H9l2-7z"/></svg>} />
          <ActionCard title="Testing" desc="Discover & run your tests" onClick={() => codeView('tests')}
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2h4M9 2v6L4.5 15A1.5 1.5 0 0 0 6 17.2h8A1.5 1.5 0 0 0 15.5 15L11 8V2"/><line x1="7" y1="12" x2="13" y2="12"/></svg>} />
        </div>

        {/* Recent */}
        <div style={{ marginTop: 36 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#6A6A85" }}>RECENT</div>
            {recentWorkspaces.length > 0 && (
              <button onClick={clearRecentWorkspaces}
                style={{ fontSize: 11, color: "#6A6A85", background: "none", border: "none", cursor: "pointer" }}
                className="hover:!text-[#C7C7D9]">Clear</button>
            )}
          </div>
          {recentWorkspaces.length === 0 ? (
            <div style={{ fontSize: 12, color: "#4A4A65" }}>No recent workspaces yet — open a folder to begin.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recentWorkspaces.map((p) => (
                <div key={p} onClick={() => switchTo(p)} title={p}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 6, cursor: "pointer", color: "#C7C7D9" }}
                  className="group hover:!bg-[#16161F]">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#F59E0B" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M1 3.5a.8.8 0 0 1 .8-.8h2.07a.8.8 0 0 1 .565.234L5.33 3.83A.8.8 0 0 0 5.9 4.063H10.2a.8.8 0 0 1 .8.8v4.837a.8.8 0 0 1-.8.8H1.8a.8.8 0 0 1-.8-.8V3.5z"/>
                  </svg>
                  <span style={{ fontSize: 13, color: "#E2E2EC", flexShrink: 0 }}>{baseName(p)}</span>
                  <span style={{ flex: 1, fontSize: 11, color: "#4A4A65", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeRecentWorkspace(p); }} title="Remove from recents"
                    style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#6A6A85", display: "flex", padding: 2, opacity: 0 }}
                    className="group-hover:!opacity-100 hover:!text-[#E2E2EC]">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="3.5" y1="3.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="3.5" x2="3.5" y2="10.5"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
