import { useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { workflowParams, applyParams, type Workflow } from "@/lib/workflows";

function RunIcon({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7-4.5z" /></svg>;
}

// Render a command with {{param}} placeholders highlighted.
function CommandPreview({ command }: { command: string }) {
  const parts = command.split(/(\{\{\w+\}\})/g);
  return (
    <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11 }}>
      {parts.map((p, i) =>
        /^\{\{\w+\}\}$/.test(p)
          ? <span key={i} style={{ color: "var(--accent)" }}>{p}</span>
          : <span key={i} style={{ color: "#9A9AB5" }}>{p}</span>
      )}
    </span>
  );
}

interface EditorState { id: string | null; name: string; command: string; description: string; tags: string }
const EMPTY: EditorState = { id: null, name: "", command: "", description: "", tags: "" };

export function Workflows() {
  const { workflows, addWorkflow, updateWorkflow, removeWorkflow, runInTerminal, addToast } = useAppStore();
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [runParams, setRunParams] = useState<{ id: string; values: Record<string, string> } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter((w) =>
      w.name.toLowerCase().includes(q) ||
      w.command.toLowerCase().includes(q) ||
      (w.description ?? "").toLowerCase().includes(q) ||
      (w.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [query, workflows]);

  const run = (w: Workflow) => {
    const params = workflowParams(w.command);
    if (params.length === 0) {
      runInTerminal(w.command);
      addToast(`Running: ${w.name}`, "info");
      return;
    }
    setRunParams({ id: w.id, values: Object.fromEntries(params.map((p) => [p, ""])) });
  };

  const confirmRun = (w: Workflow) => {
    const values = runParams?.values ?? {};
    runInTerminal(applyParams(w.command, values));
    addToast(`Running: ${w.name}`, "info");
    setRunParams(null);
  };

  const save = () => {
    if (!editor || !editor.name.trim() || !editor.command.trim()) return;
    const tags = editor.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const data = { name: editor.name.trim(), command: editor.command.trim(), description: editor.description.trim() || undefined, tags: tags.length ? tags : undefined };
    if (editor.id) updateWorkflow(editor.id, data);
    else addWorkflow(data);
    setEditor(null);
  };

  const sbtn: React.CSSProperties = { height: 22, padding: "0 8px", borderRadius: 5, fontSize: 10.5, cursor: "pointer", background: "transparent", border: "1px solid #252535", color: "#9A9AB5" };
  const field: React.CSSProperties = { height: 28, width: "100%", background: "#0E0E15", border: "1px solid #252535", borderRadius: 6, padding: "0 9px", fontSize: 12, color: "#E2E2EC", outline: "none" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <div style={{ height: 35, display: "flex", alignItems: "center", padding: "0 8px 0 12px", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#8888A8", flex: 1 }}>WORKFLOWS</span>
        <button onClick={() => setEditor(editor ? null : { ...EMPTY })} title="New workflow"
          style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 3, display: "flex" }} className="hover:bg-white/5">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="6.5" y1="2" x2="6.5" y2="11" /><line x1="2" y1="6.5" x2="11" y2="6.5" /></svg>
        </button>
      </div>

      <div style={{ padding: "0 10px 8px", flexShrink: 0 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workflows…" style={{ ...field, height: 26, fontSize: 11.5 }} />
      </div>

      {editor && (
        <div style={{ margin: "0 10px 10px", padding: 10, background: "#0E0E15", border: "1px solid #252535", borderRadius: 8, display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>
          <input autoFocus value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Name" style={field} />
          <input value={editor.command} onChange={(e) => setEditor({ ...editor, command: e.target.value })} placeholder="Command — use {{param}} for inputs" style={{ ...field, fontFamily: '"JetBrains Mono",monospace', fontSize: 11.5 }} />
          <input value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} placeholder="Description (optional)" style={field} />
          <input value={editor.tags} onChange={(e) => setEditor({ ...editor, tags: e.target.value })} placeholder="Tags, comma-separated" style={field} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => setEditor(null)} style={sbtn}>Cancel</button>
            <button onClick={save} disabled={!editor.name.trim() || !editor.command.trim()}
              style={{ ...sbtn, color: editor.name.trim() && editor.command.trim() ? "var(--accent)" : "#4A4A65", borderColor: "#6366F140" }}>
              {editor.id ? "Save" : "Add"}
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 8px 8px" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "14px 6px", fontSize: 12, color: "#4A4A65" }}>{query ? `No workflows match "${query}"` : "No workflows yet — add one."}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((w) => {
              const params = workflowParams(w.command);
              const running = runParams?.id === w.id;
              return (
                <div key={w.id} className="group" style={{ padding: "7px 8px", borderRadius: 7, border: "1px solid #1A1A28", background: "#0E0E15" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12.5, color: "#E2E2EC", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }} className="opacity-0 group-hover:!opacity-100 transition-opacity">
                      <button onClick={() => setEditor({ id: w.id, name: w.name, command: w.command, description: w.description ?? "", tags: (w.tags ?? []).join(", ") })} title="Edit" style={sbtn} className="hover:!text-[#E2E2EC]">Edit</button>
                      <button onClick={() => removeWorkflow(w.id)} title="Delete" style={sbtn} className="hover:!text-[#E2776A]">Del</button>
                    </div>
                    <button onClick={() => run(w)} title="Run in terminal" style={{ color: "#22C55E", background: "none", border: "none", cursor: "pointer", padding: "3px 4px", display: "flex", flexShrink: 0 }} className="hover:bg-white/5 rounded">
                      <RunIcon size={12} />
                    </button>
                  </div>
                  <div style={{ marginTop: 3 }}><CommandPreview command={w.command} /></div>
                  {w.description && <div style={{ fontSize: 10.5, color: "#5A5A75", marginTop: 3 }}>{w.description}</div>}
                  {(w.tags?.length || params.length > 0) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                      {w.tags?.map((t) => <span key={t} style={{ fontSize: 9, color: "#6A6A85", border: "1px solid #252535", borderRadius: 7, padding: "0 6px" }}>{t}</span>)}
                      {params.map((p) => <span key={p} style={{ fontSize: 9, color: "var(--accent)", border: "1px solid #6366F140", borderRadius: 7, padding: "0 6px" }}>{p}</span>)}
                    </div>
                  )}
                  {running && (
                    <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 5, paddingTop: 7, borderTop: "1px solid #1A1A28" }}>
                      {params.map((p) => (
                        <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#8888A8" }}>
                          <span style={{ minWidth: 60 }}>{p}</span>
                          <input autoFocus={p === params[0]} value={runParams!.values[p] ?? ""}
                            onChange={(e) => setRunParams({ id: w.id, values: { ...runParams!.values, [p]: e.target.value } })}
                            onKeyDown={(e) => { if (e.key === "Enter") confirmRun(w); }}
                            style={{ ...field, height: 24, fontSize: 11 }} />
                        </label>
                      ))}
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button onClick={() => setRunParams(null)} style={sbtn}>Cancel</button>
                        <button onClick={() => confirmRun(w)} style={{ ...sbtn, color: "#22C55E", borderColor: "#22C55E40" }}>Run ▸</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
