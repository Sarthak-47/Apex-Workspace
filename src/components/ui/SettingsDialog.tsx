import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { THEME_OPTIONS } from "@/components/editor/MonacoEditor";
import { BUILTIN_AGENTS, ALL_TOOLS, type AgentDef, type ToolName } from "@/lib/agents";

type Tab = 'general' | 'editor' | 'terminal' | 'ai' | 'themes' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general',  label: 'General'  },
  { id: 'editor',   label: 'Editor'   },
  { id: 'terminal', label: 'Terminal' },
  { id: 'ai',       label: 'AI'       },
  { id: 'themes',   label: 'Themes'   },
  { id: 'about',    label: 'About'    },
];

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 36, gap: 12 }}>
      <span style={{ fontSize: 12, color: '#8888A8', minWidth: 160, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative',
        background: value ? '#6366F1' : '#252535',
        border: 'none', cursor: 'pointer', transition: 'background 150ms',
        flexShrink: 0,
      }}>
      <span style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#E2E2EC', transition: 'left 150ms',
      }} />
    </button>
  );
}

function Select({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        height: 28, background: '#18181F', border: '1px solid #252535', borderRadius: 5,
        color: '#C0C0D0', fontSize: 12, padding: '0 8px', outline: 'none', cursor: 'pointer',
        minWidth: 160,
      }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function NumberInput({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <input type="number" value={value} min={min} max={max}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        width: 70, height: 28, background: '#18181F', border: '1px solid #252535', borderRadius: 5,
        color: '#C0C0D0', fontSize: 12, padding: '0 8px', outline: 'none', textAlign: 'right',
      }} />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1A1A28' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Tab panels ───────────────────────────────────────────────────────────────

function GeneralTab() {
  const { autoSave, setAutoSave } = useAppStore();
  return (
    <div>
      <Section title="Files">
        <Field label="Auto-save"><Toggle value={autoSave} onChange={setAutoSave} /></Field>
        <Field label="Confirm on delete">
          <Toggle value={true} onChange={() => {}} />
        </Field>
      </Section>
      <Section title="Startup">
        <Field label="Reopen last workspace">
          <Toggle value={true} onChange={() => {}} />
        </Field>
      </Section>
    </div>
  );
}

function EditorTab() {
  const { editorTheme, setEditorTheme } = useAppStore();
  const [tabSize, setTabSize]           = useState(2);
  const [fontSize, setFontSize]         = useState(13);
  const [wordWrap, setWordWrap]         = useState(false);
  const [minimap, setMinimap]           = useState(true);
  const [lineNums, setLineNums]         = useState(true);

  return (
    <div>
      <Section title="Appearance">
        <Field label="Editor theme">
          <Select value={editorTheme} options={THEME_OPTIONS} onChange={setEditorTheme} />
        </Field>
        <Field label="Font size">
          <NumberInput value={fontSize} min={10} max={24} onChange={setFontSize} />
        </Field>
        <Field label="Minimap"><Toggle value={minimap} onChange={setMinimap} /></Field>
        <Field label="Line numbers"><Toggle value={lineNums} onChange={setLineNums} /></Field>
      </Section>
      <Section title="Formatting">
        <Field label="Tab size">
          <NumberInput value={tabSize} min={1} max={8} onChange={setTabSize} />
        </Field>
        <Field label="Word wrap"><Toggle value={wordWrap} onChange={setWordWrap} /></Field>
      </Section>
    </div>
  );
}

function TerminalTab() {
  const [scrollback, setScrollback] = useState(10000);
  const shellOptions = [
    { value: 'auto',         label: 'Auto-detect' },
    { value: 'pwsh.exe',     label: 'PowerShell (pwsh)' },
    { value: 'powershell.exe', label: 'Windows PowerShell' },
    { value: 'cmd.exe',      label: 'Command Prompt' },
    { value: '/bin/zsh',     label: 'Zsh' },
    { value: '/bin/bash',    label: 'Bash' },
  ];
  const [shell, setShell] = useState('auto');

  return (
    <div>
      <Section title="Shell">
        <Field label="Default shell">
          <Select value={shell} options={shellOptions} onChange={setShell} />
        </Field>
      </Section>
      <Section title="Display">
        <Field label="Scrollback lines">
          <NumberInput value={scrollback} min={100} max={100000} onChange={setScrollback} />
        </Field>
        <Field label="Copy on select"><Toggle value={true} onChange={() => {}} /></Field>
      </Section>
    </div>
  );
}

const APP_THEMES = [
  { value: 'apex-dark',   label: 'APEX Dark (default)' },
  { value: 'apex-light',  label: 'APEX Light' },
  { value: 'tokyo-night', label: 'Tokyo Night' },
  { value: 'nord',        label: 'Nord' },
  { value: 'catppuccin',  label: 'Catppuccin Mocha' },
];

function ThemesTab() {
  const { editorTheme, setEditorTheme } = useAppStore();
  const [appTheme, setAppTheme] = useState('apex-dark');

  return (
    <div>
      <Section title="Application Theme">
        <Field label="App theme">
          <Select value={appTheme} options={APP_THEMES} onChange={setAppTheme} />
        </Field>
      </Section>
      <Section title="Editor Theme">
        <Field label="Editor theme">
          <Select value={editorTheme} options={THEME_OPTIONS} onChange={setEditorTheme} />
        </Field>
      </Section>
    </div>
  );
}

function AboutTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 24 }}>
      <img src="/apex-logo.svg" width={56} height={56} alt="APEX" />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#E2E2EC', marginBottom: 4 }}>APEX</div>
        <div style={{ fontSize: 12, color: '#8888A8' }}>Local-first AI-native developer workspace</div>
        <div style={{ fontSize: 11, color: '#4A4A65', marginTop: 4 }}>v0.1.0 · Tauri 2 + React 19</div>
      </div>
      <div style={{ width: '100%', maxWidth: 320, background: '#0A0A0F', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          ['Built with', 'Tauri 2, React 19, TypeScript'],
          ['Editor',     'Monaco (VS Code engine)'],
          ['Terminal',   'xterm.js + portable-pty'],
          ['AI',         'Ollama (local LLMs)'],
          ['Database',   'SQLite (Tauri plugin)'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', fontSize: 11 }}>
            <span style={{ color: '#4A4A65', minWidth: 80 }}>{k}</span>
            <span style={{ color: '#8888A8' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Tab (custom agents + bash whitelist) ─────────────────────────────────

const EMPTY_AGENT = (): AgentDef => ({
  id: `agent-${Date.now()}`,
  name: '',
  description: '',
  color: '#6366F1',
  icon: '🤖',
  systemPrompt: '',
  tools: [...ALL_TOOLS],
  temperature: 0.2,
  builtin: false,
});

function AgentForm({ draft, onChange }: { draft: AgentDef; onChange: (a: AgentDef) => void }) {
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#18181F', border: '1px solid #252535', borderRadius: 5,
    color: '#C0C0D0', fontSize: 12, padding: '6px 8px', outline: 'none',
  };
  const toggleTool = (t: ToolName) => {
    const has = draft.tools.includes(t);
    onChange({ ...draft, tools: has ? draft.tools.filter(x => x !== t) : [...draft.tools, t] });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inputStyle, width: 54, textAlign: 'center' }} value={draft.icon}
          onChange={e => onChange({ ...draft, icon: e.target.value })} placeholder="🤖" />
        <input style={inputStyle} value={draft.name}
          onChange={e => onChange({ ...draft, name: e.target.value })} placeholder="Agent name" />
      </div>
      <input style={inputStyle} value={draft.description}
        onChange={e => onChange({ ...draft, description: e.target.value })} placeholder="Short description" />
      <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        value={draft.systemPrompt}
        onChange={e => onChange({ ...draft, systemPrompt: e.target.value })}
        placeholder="System prompt — define this agent's role and behavior" />
      <div>
        <div style={{ fontSize: 11, color: '#8888A8', marginBottom: 6 }}>Allowed tools</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ALL_TOOLS.map(t => {
            const on = draft.tools.includes(t);
            return (
              <button key={t} onClick={() => toggleTool(t)}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  background: on ? '#1A1A3A' : 'transparent',
                  border: `1px solid ${on ? '#6366F140' : '#252535'}`,
                  color: on ? '#6366F1' : '#4A4A65', fontFamily: 'JetBrains Mono,monospace',
                }}>
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Temperature">
        <NumberInput value={draft.temperature ?? 0.2} min={0} max={2}
          onChange={v => onChange({ ...draft, temperature: v })} />
      </Field>
      <Field label="Model override (optional)">
        <input style={{ ...inputStyle, width: 180 }} value={draft.model ?? ''}
          onChange={e => onChange({ ...draft, model: e.target.value || undefined })}
          placeholder="e.g. qwen2.5-coder:7b" />
      </Field>
    </div>
  );
}

function AITab() {
  const { userAgents, addUserAgent, updateUserAgent, deleteUserAgent, bashAllowAlways } = useAppStore();
  const setState = useAppStore.setState;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDef | null>(null);

  const startNew = () => { const a = EMPTY_AGENT(); setDraft(a); setEditingId(a.id); };
  const startEdit = (a: AgentDef) => { setDraft({ ...a }); setEditingId(a.id); };
  const save = () => {
    if (!draft || !draft.name.trim()) return;
    const exists = userAgents.some(a => a.id === draft.id);
    if (exists) updateUserAgent(draft.id, draft);
    else addUserAgent(draft);
    setDraft(null); setEditingId(null);
  };
  const cancel = () => { setDraft(null); setEditingId(null); };

  const btn = (bg: string, border: string, color: string): React.CSSProperties => ({
    height: 26, padding: '0 12px', borderRadius: 5, fontSize: 11, fontWeight: 600,
    cursor: 'pointer', background: bg, border: `1px solid ${border}`, color,
  });

  return (
    <div>
      <Section title="Custom Agents">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {BUILTIN_AGENTS.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#0F0F16', borderRadius: 6, border: '1px solid #1A1A28' }}>
              <span style={{ fontSize: 14 }}>{a.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: a.color, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 10, color: '#4A4A65' }}>{a.description}</div>
              </div>
              <span style={{ fontSize: 9, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.08em' }}>built-in</span>
            </div>
          ))}
          {userAgents.map(a => (
            <div key={a.id}>
              {editingId === a.id && draft ? (
                <div style={{ padding: 10, background: '#0F0F16', borderRadius: 6, border: '1px solid #6366F130' }}>
                  <AgentForm draft={draft} onChange={setDraft} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                    <button onClick={cancel} style={btn('transparent', '#252535', '#8888A8')}>Cancel</button>
                    <button onClick={save} style={btn('#6366F1', '#6366F1', '#fff')}>Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#0F0F16', borderRadius: 6, border: '1px solid #1A1A28' }}>
                  <span style={{ fontSize: 14 }}>{a.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: a.color, fontWeight: 600 }}>{a.name || '(unnamed)'}</div>
                    <div style={{ fontSize: 10, color: '#4A4A65' }}>{a.description}</div>
                  </div>
                  <button onClick={() => startEdit(a)} style={btn('transparent', '#252535', '#8888A8')}>Edit</button>
                  <button onClick={() => deleteUserAgent(a.id)} style={btn('#2D1515', '#EF444440', '#EF4444')}>Delete</button>
                </div>
              )}
            </div>
          ))}

          {/* New agent form (when creating) */}
          {editingId && draft && !userAgents.some(a => a.id === editingId) && (
            <div style={{ padding: 10, background: '#0F0F16', borderRadius: 6, border: '1px solid #6366F130' }}>
              <AgentForm draft={draft} onChange={setDraft} />
              <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                <button onClick={cancel} style={btn('transparent', '#252535', '#8888A8')}>Cancel</button>
                <button onClick={save} style={btn('#6366F1', '#6366F1', '#fff')}>Create Agent</button>
              </div>
            </div>
          )}

          {!editingId && (
            <button onClick={startNew} style={{ ...btn('#1A1A3A', '#6366F140', '#6366F1'), height: 30, marginTop: 4 }}>
              + New Agent
            </button>
          )}
        </div>
      </Section>

      <Section title="Bash — Always-Allowed Commands">
        {bashAllowAlways.length === 0 ? (
          <div style={{ fontSize: 11, color: '#4A4A65' }}>
            No commands whitelisted. Use "Allow Always" when the agent asks to run a command.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {bashAllowAlways.map(p => (
              <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 8px', background: '#0A1A0A', border: '1px solid #22C55E30', borderRadius: 4, color: '#22C55E', fontFamily: 'JetBrains Mono,monospace' }}>
                {p}
                <button
                  onClick={() => setState(s => ({ bashAllowAlways: s.bashAllowAlways.filter(x => x !== p) }))}
                  style={{ background: 'none', border: 'none', color: '#22C55E', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
                  title="Remove">×</button>
              </span>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── SettingsDialog ───────────────────────────────────────────────────────────

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setSettingsOpen]);

  if (!settingsOpen) return null;

  return (
    <div
      ref={overlayRef}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)', background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={e => { if (e.target === overlayRef.current) setSettingsOpen(false); }}
    >
      <div style={{
        width: 700, maxHeight: '80vh', background: '#111118', border: '1px solid #252535',
        borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 96px rgba(0,0,0,0.8)',
      }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #1A1A28', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E2EC', flex: 1 }}>Settings</span>
          <kbd style={{ fontSize: 10, color: '#4A4A65', background: '#18181F', padding: '2px 6px', borderRadius: 3, fontFamily: 'JetBrains Mono,monospace', marginRight: 8 }}>ESC</kbd>
          <button onClick={() => setSettingsOpen(false)}
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A65', borderRadius: 4 }}
            className="hover:!text-[#E2E2EC] hover:!bg-[#18181F] transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Sidebar tabs */}
          <div style={{ width: 140, background: '#0A0A0F', borderRight: '1px solid #1A1A28', padding: '8px 0', flexShrink: 0 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{
                  width: '100%', height: 32, display: 'flex', alignItems: 'center', padding: '0 14px',
                  background: activeTab === tab.id ? '#18181F' : 'none',
                  borderLeft: `2px solid ${activeTab === tab.id ? '#6366F1' : 'transparent'}`,
                  border: 'none', cursor: 'pointer', color: activeTab === tab.id ? '#E2E2EC' : '#8888A8',
                  fontSize: 12, textAlign: 'left', transition: 'all 100ms',
                }}
                className={activeTab !== tab.id ? 'hover:!text-[#C0C0D0] hover:!bg-[#18181F]/50 transition-colors' : ''}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {activeTab === 'general'  && <GeneralTab />}
            {activeTab === 'editor'   && <EditorTab />}
            {activeTab === 'terminal' && <TerminalTab />}
            {activeTab === 'ai'       && <AITab />}
            {activeTab === 'themes'   && <ThemesTab />}
            {activeTab === 'about'    && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
