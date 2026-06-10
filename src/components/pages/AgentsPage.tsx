import { useState } from "react";
import { useAppStore } from "@/store";
import { BUILTIN_AGENTS, ALL_TOOLS, type AgentDef, type ToolName } from "@/lib/agents";
import { AgentIcon } from "@/components/ui/Icons";
import { PageShell } from "./PageShell";

export function AgentsPage() {
  const { userAgents, addUserAgent, updateUserAgent, deleteUserAgent, selectedAgentId, setSelectedAgentId } = useAppStore();
  const all = [...BUILTIN_AGENTS, ...userAgents];
  const [editId, setEditId] = useState<string | null>(null);
  const editing = userAgents.find((a) => a.id === editId) ?? null;

  const createAgent = () => {
    const id = 'agent-' + Date.now().toString(36);
    const agent: AgentDef = {
      id, name: 'New Agent', description: 'A custom agent', color: 'var(--accent)', icon: 'coder',
      systemPrompt: 'You are a helpful assistant embedded in a local-first IDE.',
      tools: ['read_file', 'list_directory', 'search_files'], temperature: 0.4,
    };
    addUserAgent(agent);
    setEditId(id);
    setSelectedAgentId(id);
  };

  const toggleTool = (t: ToolName) => {
    if (!editing) return;
    const has = editing.tools.includes(t);
    updateUserAgent(editing.id, { tools: has ? editing.tools.filter((x) => x !== t) : [...editing.tools, t] });
  };

  const actions = (
    <button onClick={createAgent} style={{ height: 28, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' }}>+ New Agent</button>
  );

  return (
    <PageShell title="AI Agents" subtitle={`${BUILTIN_AGENTS.length} built-in · ${userAgents.length} custom`} actions={actions}>
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        {/* List */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #1A1A28', overflowY: 'auto', padding: 10 }}>
          {all.map((a) => {
            const active = a.id === selectedAgentId;
            const isUser = !a.builtin;
            return (
              <div key={a.id}
                onClick={() => { setSelectedAgentId(a.id); setEditId(isUser ? a.id : null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: active ? '#1A1A3A' : 'transparent', border: `1px solid ${active ? '#6366F140' : 'transparent'}` }}
                className={active ? '' : 'hover:!bg-[#16161F]'}>
                <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${a.color}22` }}>
                  <AgentIcon kind={a.icon} size={15} color={a.color} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#E2E2EC', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.name}
                    {a.builtin && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, color: '#6A6A85', background: '#252535' }}>BUILT-IN</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6A6A85', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail / editor */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 26px' }}>
          {editing ? (
            <div style={{ maxWidth: 620 }}>
              <Field label="Name">
                <input value={editing.name} onChange={(e) => updateUserAgent(editing.id, { name: e.target.value })} style={inp} />
              </Field>
              <Field label="Description">
                <input value={editing.description} onChange={(e) => updateUserAgent(editing.id, { description: e.target.value })} style={inp} />
              </Field>
              <Field label="System prompt">
                <textarea value={editing.systemPrompt} onChange={(e) => updateUserAgent(editing.id, { systemPrompt: e.target.value })} rows={8} style={{ ...inp, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.5 }} />
              </Field>
              <Field label="Tools">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ALL_TOOLS.map((t) => {
                    const on = editing.tools.includes(t);
                    return (
                      <button key={t} onClick={() => toggleTool(t)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', background: on ? '#1A1A3A' : 'transparent', border: `1px solid ${on ? 'var(--accent)' : '#252535'}`, color: on ? '#A5B4FC' : '#6A6A85' }}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label={`Temperature: ${editing.temperature ?? 0.4}`}>
                <input type="range" min={0} max={1} step={0.05} value={editing.temperature ?? 0.4}
                  onChange={(e) => updateUserAgent(editing.id, { temperature: parseFloat(e.target.value) })}
                  style={{ width: 240, accentColor: 'var(--accent)' }} />
              </Field>
              <button onClick={() => { deleteUserAgent(editing.id); setEditId(null); }}
                style={{ marginTop: 12, height: 30, padding: '0 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid #C4422D60', color: '#E2776A' }}>
                Delete agent
              </button>
            </div>
          ) : (
            <div style={{ color: '#6A6A85', fontSize: 12, lineHeight: 1.7, maxWidth: 560 }}>
              {(() => {
                const a = all.find((x) => x.id === selectedAgentId);
                if (!a) return 'Select an agent.';
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${a.color}22` }}><AgentIcon kind={a.icon} size={18} color={a.color} /></span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#E6E6F0' }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: '#6A6A85' }}>{a.description}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: '#6A6A85', margin: '14px 0 6px' }}>SYSTEM PROMPT</div>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: '#9A9AB5', background: '#0D0D14', padding: 14, borderRadius: 8, border: '1px solid #1A1A28' }}>{a.systemPrompt}</pre>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: '#6A6A85', margin: '14px 0 6px' }}>TOOLS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {a.tools.length === 0 ? <span style={{ fontSize: 11, color: '#4A4A65' }}>No tools (reasoning only)</span> :
                        a.tools.map((t) => <span key={t} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 5, background: '#13131B', border: '1px solid #252535', color: '#9A9AB5', fontFamily: 'JetBrains Mono, monospace' }}>{t}</span>)}
                    </div>
                    {a.builtin && <div style={{ fontSize: 11, color: '#4A4A65', marginTop: 16 }}>Built-in agents are read-only. Click <b style={{ color: '#A5B4FC' }}>+ New Agent</b> to create a custom one.</div>}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

const inp: React.CSSProperties = { width: '100%', background: '#0A0A0F', border: '1px solid #252535', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#E2E2EC', outline: 'none' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#8888A8', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
