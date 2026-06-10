import { useEffect, useRef, useState } from "react";
import { useAppStore, useToast } from "@/store";
import { THEME_OPTIONS } from "@/components/editor/MonacoEditor";
import { BUILTIN_AGENTS, ALL_TOOLS, type AgentDef, type ToolName } from "@/lib/agents";
import { AgentIcon } from "@/components/ui/Icons";
import { gmailStatus, gmailStartAuth, gmailSync, gmailDisconnect, onGmailConnected, type GmailStatus,
  calendarStatus, calendarSync, firefliesStatus, firefliesSetKey, firefliesSync, firefliesDisconnect, type FirefliesStatus,
  mcpStart, mcpStop, type McpServerConfig, type McpTool } from "@/lib/tauri";

type Tab = 'general' | 'editor' | 'terminal' | 'ai' | 'connections' | 'themes' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general',     label: 'General'     },
  { id: 'editor',      label: 'Editor'      },
  { id: 'terminal',    label: 'Terminal'    },
  { id: 'ai',          label: 'AI'          },
  { id: 'connections', label: 'Connections' },
  { id: 'themes',      label: 'Themes'      },
  { id: 'about',       label: 'About'       },
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
        background: value ? 'var(--accent)' : '#252535',
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

const LSP_SERVERS: { id: string; label: string; placeholder: string }[] = [
  { id: 'typescript', label: 'TypeScript / JS', placeholder: 'typescript-language-server' },
  { id: 'pyright',    label: 'Python',          placeholder: 'pyright-langserver' },
  { id: 'rust',       label: 'Rust',            placeholder: 'rust-analyzer' },
  { id: 'gopls',      label: 'Go',              placeholder: 'gopls' },
];

function EditorTab() {
  const {
    editorTheme, setEditorTheme, lspEnabled, setLspEnabled, lspServerPaths, setLspServerPath,
    editorFontSize, setEditorFontSize, editorWordWrap, setEditorWordWrap,
    editorMinimap, setEditorMinimap, editorLineNumbers, setEditorLineNumbers,
  } = useAppStore();
  const [tabSize, setTabSize] = useState(2);

  const lspInp: React.CSSProperties = {
    width: '100%', background: '#0A0A0F', border: '1px solid #252535', borderRadius: 5,
    padding: '5px 8px', fontSize: 11, color: '#E2E2EC', outline: 'none',
    fontFamily: '"JetBrains Mono", monospace',
  };

  return (
    <div>
      <Section title="Appearance">
        <Field label="Editor theme">
          <Select value={editorTheme} options={THEME_OPTIONS} onChange={setEditorTheme} />
        </Field>
        <Field label="Font size">
          <NumberInput value={editorFontSize} min={10} max={24} onChange={setEditorFontSize} />
        </Field>
        <Field label="Minimap"><Toggle value={editorMinimap} onChange={setEditorMinimap} /></Field>
        <Field label="Line numbers"><Toggle value={editorLineNumbers} onChange={setEditorLineNumbers} /></Field>
      </Section>
      <Section title="Formatting">
        <Field label="Tab size">
          <NumberInput value={tabSize} min={1} max={8} onChange={setTabSize} />
        </Field>
        <Field label="Word wrap"><Toggle value={editorWordWrap} onChange={setEditorWordWrap} /></Field>
      </Section>
      <Section title="Language Servers (LSP)">
        <Field label="Enable language servers"><Toggle value={lspEnabled} onChange={setLspEnabled} /></Field>
        <p style={{ fontSize: 11, color: '#6A6A85', lineHeight: 1.5, margin: '2px 0 10px' }}>
          Real IDE intelligence (hover, go-to-definition, find references, rename, completion, diagnostics)
          via Language Server Protocol. Requires the desktop app and each server installed.
          Leave a path blank to use the default command on your PATH, or point it at a binary
          (e.g. a project-local <code style={{ fontFamily: '"JetBrains Mono",monospace' }}>node_modules/.bin/…</code> path).
        </p>
        {lspEnabled && LSP_SERVERS.map((s) => (
          <div key={s.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: '#8888A8', marginBottom: 3 }}>{s.label}</div>
            <input
              value={lspServerPaths[s.id] ?? ''}
              onChange={(e) => setLspServerPath(s.id, e.target.value)}
              placeholder={s.placeholder}
              style={lspInp}
              spellCheck={false}
            />
          </div>
        ))}
      </Section>
    </div>
  );
}

function TerminalTab() {
  const { terminalShell, setTerminalShell } = useAppStore();
  const [scrollback, setScrollback] = useState(10000);
  const shellOptions = [
    { value: 'auto',         label: 'Auto-detect' },
    { value: 'pwsh.exe',     label: 'PowerShell (pwsh)' },
    { value: 'powershell.exe', label: 'Windows PowerShell' },
    { value: 'cmd.exe',      label: 'Command Prompt' },
    { value: '/bin/zsh',     label: 'Zsh' },
    { value: '/bin/bash',    label: 'Bash' },
  ];

  return (
    <div>
      <Section title="Shell">
        <Field label="Default shell">
          <Select value={terminalShell} options={shellOptions} onChange={setTerminalShell} />
        </Field>
        <p style={{ fontSize: 11, color: '#6A6A85', margin: '2px 0 0' }}>
          Applies to newly opened terminals.
        </p>
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

const ACCENT_PRESETS = [
  { name: 'Indigo', color: '#6366F1' },
  { name: 'Blue', color: '#3B82F6' },
  { name: 'Violet', color: '#8B5CF6' },
  { name: 'Pink', color: '#EC4899' },
  { name: 'Rose', color: '#F43F5E' },
  { name: 'Orange', color: '#F97316' },
  { name: 'Amber', color: '#F59E0B' },
  { name: 'Emerald', color: '#10B981' },
  { name: 'Teal', color: '#14B8A6' },
  { name: 'Cyan', color: '#06B6D4' },
];

function ThemesTab() {
  const { editorTheme, setEditorTheme, accentColor, setAccentColor } = useAppStore();
  const [appTheme, setAppTheme] = useState('apex-dark');

  return (
    <div>
      <Section title="Accent Color">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {ACCENT_PRESETS.map((p) => {
            const active = accentColor.toLowerCase() === p.color.toLowerCase();
            return (
              <button key={p.color} onClick={() => setAccentColor(p.color)} title={p.name}
                style={{ width: 30, height: 30, borderRadius: 8, cursor: 'pointer', background: p.color, border: active ? '2px solid #fff' : '2px solid transparent', boxShadow: active ? `0 0 0 2px ${p.color}` : 'none' }} />
            );
          })}
        </div>
        <Field label="Custom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
              style={{ width: 36, height: 28, padding: 0, border: '1px solid #252535', borderRadius: 5, background: 'none', cursor: 'pointer' }} />
            <input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} spellCheck={false}
              style={{ width: 110, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#C0C0D0', fontSize: 12, padding: '5px 8px', outline: 'none', fontFamily: '"JetBrains Mono",monospace' }} />
          </div>
        </Field>
      </Section>
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
  color: 'var(--accent)',
  icon: 'custom',
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
      <input style={inputStyle} value={draft.name}
        onChange={e => onChange({ ...draft, name: e.target.value })} placeholder="Agent name" />
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
                  color: on ? 'var(--accent)' : '#4A4A65', fontFamily: 'JetBrains Mono,monospace',
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

function McpSection() {
  const { mcpServers, setMcpServers, setMcpRunningTools } = useAppStore();
  const { success, error } = useToast();
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<McpServerConfig>({ name: '', command: 'npx', args: [], env: {}, enabled: false });

  const toggle = async (cfg: McpServerConfig) => {
    setBusy(cfg.name);
    try {
      if (!cfg.enabled) {
        const r = await mcpStart(cfg);
        setTools(t => ({ ...t, [cfg.name]: r.tools }));
        setMcpRunningTools(cfg.name, r.tools);
        setMcpServers(mcpServers.map(s => s.name === cfg.name ? { ...s, enabled: true } : s));
        success(`${cfg.name} started — ${r.tools.length} tools`);
      } else {
        await mcpStop(cfg.name);
        setMcpRunningTools(cfg.name, null);
        setMcpServers(mcpServers.map(s => s.name === cfg.name ? { ...s, enabled: false } : s));
        setTools(t => { const n = { ...t }; delete n[cfg.name]; return n; });
      }
    } catch (e) { error(`${cfg.name}: ${(e as Error).message}`); }
    setBusy(null);
  };
  const remove = (name: string) => setMcpServers(mcpServers.filter(s => s.name !== name));
  const setEnv = (cfg: McpServerConfig, key: string, val: string) =>
    setMcpServers(mcpServers.map(s => s.name === cfg.name ? { ...s, env: { ...s.env, [key]: val } } : s));
  const addServer = () => {
    if (!draft.name.trim() || !draft.command.trim()) { error('Name and command required'); return; }
    setMcpServers([...mcpServers, draft]);
    setDraft({ name: '', command: 'npx', args: [], env: {}, enabled: false });
    setAdding(false);
  };

  const inputStyle: React.CSSProperties = { height: 26, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#C0C0D0', fontSize: 11, padding: '0 8px', outline: 'none', fontFamily: '"JetBrains Mono",monospace' };

  return (
    <Section title="MCP Servers">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mcpServers.map(cfg => (
          <div key={cfg.name} style={{ background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 6, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.enabled ? '#22C55E' : '#4A4A65', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#E2E2EC', fontWeight: 600 }}>{cfg.name}</div>
                <div style={{ fontSize: 9, color: '#4A4A65', fontFamily: '"JetBrains Mono",monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.command} {cfg.args.join(' ')}</div>
              </div>
              <button onClick={() => toggle(cfg)} disabled={busy === cfg.name}
                style={{ height: 24, padding: '0 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: cfg.enabled ? '#2D1515' : '#1A1A3A', border: `1px solid ${cfg.enabled ? '#EF444440' : '#6366F140'}`, color: cfg.enabled ? '#EF4444' : 'var(--accent)' }}>
                {busy === cfg.name ? '…' : cfg.enabled ? 'Stop' : 'Start'}
              </button>
              {!['exa', 'github'].includes(cfg.name) && (
                <button onClick={() => remove(cfg.name)} style={{ width: 22, height: 22, borderRadius: 4, cursor: 'pointer', background: 'transparent', border: 'none', color: '#4A4A65' }}>×</button>
              )}
            </div>
            {/* env keys (e.g. API keys) */}
            {Object.keys(cfg.env).length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {Object.entries(cfg.env).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, color: '#4A4A65', fontFamily: '"JetBrains Mono",monospace', minWidth: 90 }}>{k}</span>
                    <input type="password" value={v} onChange={e => setEnv(cfg, k, e.target.value)} placeholder="…" style={{ ...inputStyle, flex: 1 }} />
                  </div>
                ))}
              </div>
            )}
            {/* tools registry */}
            {tools[cfg.name] && tools[cfg.name].length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {tools[cfg.name].map(t => (
                  <span key={t.name} title={t.description} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: '#1A1A3A', border: '1px solid #6366F130', color: 'var(--accent)', fontFamily: '"JetBrains Mono",monospace' }}>{t.name}</span>
                ))}
              </div>
            )}
          </div>
        ))}

        {adding ? (
          <div style={{ background: '#0F0F16', border: '1px solid #6366F130', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="server name" style={inputStyle} />
            <input value={draft.command} onChange={e => setDraft({ ...draft, command: e.target.value })} placeholder="command (e.g. npx)" style={inputStyle} />
            <input value={draft.args.join(' ')} onChange={e => setDraft({ ...draft, args: e.target.value.split(/\s+/).filter(Boolean) })} placeholder="args (space-separated)" style={inputStyle} />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => setAdding(false)} style={{ height: 26, padding: '0 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>Cancel</button>
              <button onClick={addServer} style={{ height: 26, padding: '0 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' }}>Add</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ height: 28, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#1A1A3A', border: '1px solid #6366F140', color: 'var(--accent)' }}>+ Add MCP Server</button>
        )}
      </div>
      <p style={{ fontSize: 10, color: '#4A4A65', marginTop: 8, lineHeight: 1.5 }}>
        Exa needs an API key; GitHub needs a Personal Access Token. Started servers expose their tools to the agent (with approval gating).
      </p>
    </Section>
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
              <span style={{ display: 'flex', color: a.color }}><AgentIcon kind={a.icon} size={15} /></span>
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
                    <button onClick={save} style={btn('var(--accent)', 'var(--accent)', '#fff')}>Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#0F0F16', borderRadius: 6, border: '1px solid #1A1A28' }}>
                  <span style={{ display: 'flex', color: a.color }}><AgentIcon kind={a.icon} size={15} /></span>
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
                <button onClick={save} style={btn('var(--accent)', 'var(--accent)', '#fff')}>Create Agent</button>
              </div>
            </div>
          )}

          {!editingId && (
            <button onClick={startNew} style={{ ...btn('#1A1A3A', '#6366F140', 'var(--accent)'), height: 30, marginTop: 4 }}>
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

      <McpSection />
      <WebSearchSection />
    </div>
  );
}

function WebSearchSection() {
  const { searxngUrl, setSearxngUrl, ntfyTopic, setNtfyTopic } = useAppStore();
  const inp: React.CSSProperties = { flex: 1, maxWidth: 240, height: 28, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#C0C0D0', fontSize: 12, padding: '0 8px', outline: 'none', fontFamily: '"JetBrains Mono",monospace' };
  return (
    <>
      <Section title="Web Search (SearXNG)">
        <Field label="SearXNG instance">
          <input value={searxngUrl} onChange={e => setSearxngUrl(e.target.value)} placeholder="http://localhost:8080" style={inp} />
        </Field>
        <p style={{ fontSize: 10, color: '#4A4A65', marginTop: 6, lineHeight: 1.5 }}>
          Privacy-first web search. Run a local SearXNG (<code style={{ fontFamily: '"JetBrains Mono",monospace' }}>docker run searxng/searxng</code>) with JSON output enabled. The agent's <code style={{ fontFamily: '"JetBrains Mono",monospace' }}>web_search</code> tool uses this instance.
        </p>
      </Section>
      <Section title="Notifications (ntfy)">
        <Field label="ntfy topic URL">
          <input value={ntfyTopic} onChange={e => setNtfyTopic(e.target.value)} placeholder="https://ntfy.sh/your-topic" style={inp} />
        </Field>
        <p style={{ fontSize: 10, color: '#4A4A65', marginTop: 6, lineHeight: 1.5 }}>
          Background-agent results (meeting prep, weekly briefing, completed jobs) also push here — reaches your phone via the ntfy app. Leave blank to use desktop notifications only.
        </p>
      </Section>
    </>
  );
}

// ─── Connections Tab (Gmail) ──────────────────────────────────────────────────

const SYNC_SCOPES = [
  { value: 7,   label: 'Last 7 days'  },
  { value: 30,  label: 'Last 30 days' },
  { value: 90,  label: 'Last 90 days' },
  { value: 0,   label: 'All mail'     },
];

function ConnectionsTab() {
  const { workspacePath } = useAppStore();
  const { info, error, success } = useToast();
  const [status, setStatus] = useState<GmailStatus>({ connected: false, email: null, last_synced: null, thread_count: null });
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scope, setScope] = useState(30);
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => { gmailStatus(workspacePath ?? undefined).then(setStatus).catch(() => {}); };
  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    onGmailConnected(() => { refresh(); success('Gmail connected'); }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (!clientId.trim() || !clientSecret.trim()) { error('Enter your Google OAuth Client ID and Secret'); return; }
    setBusy(true);
    try {
      await gmailStartAuth(clientId.trim(), clientSecret.trim());
      info('Complete the consent in your browser…');
      setTimeout(refresh, 400); // browser mock connects immediately
    } catch (e) { error(`Auth failed: ${(e as Error).message}`); }
    setBusy(false);
  };

  const sync = async () => {
    if (!workspacePath) { error('Open a workspace first — threads are written into its vault'); return; }
    setBusy(true);
    try {
      const r = await gmailSync(workspacePath, scope);
      success(`Synced ${r.thread_count} threads (${r.new_or_changed} new/changed)`);
      refresh();
    } catch (e) { error(`Sync failed: ${(e as Error).message}`); }
    setBusy(false);
  };

  const disconnect = async () => { await gmailDisconnect(); refresh(); info('Gmail disconnected'); };

  const fmtDate = (t: number | null) => t ? new Date(t * 1000).toLocaleString() : 'never';
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 30, background: '#18181F', border: '1px solid #252535', borderRadius: 5,
    color: '#C0C0D0', fontSize: 12, padding: '0 8px', outline: 'none', fontFamily: '"JetBrains Mono",monospace',
  };

  return (
    <div>
      <Section title="Gmail">
        {/* Status card */}
        <div style={{ background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: status.connected ? 10 : 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: status.connected ? '#22C55E' : '#4A4A65', boxShadow: status.connected ? '0 0 6px #22C55E88' : 'none' }} />
            <span style={{ fontSize: 12, color: '#E2E2EC', fontWeight: 600 }}>
              {status.connected ? (status.email ?? 'Connected') : 'Not connected'}
            </span>
          </div>
          {status.connected && (
            <div style={{ fontSize: 11, color: '#8888A8', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#4A4A65' }}>Last synced</span><span>{fmtDate(status.last_synced)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#4A4A65' }}>Threads</span><span>{status.thread_count ?? 0}</span></div>
            </div>
          )}
        </div>

        {!status.connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setGuide(g => !g)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
              {guide ? '▾' : '▸'} How to get a Google OAuth Client ID
            </button>
            {guide && (
              <ol style={{ fontSize: 11, color: '#8888A8', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
                <li>Open <code style={{ color: '#93C5FD' }}>console.cloud.google.com</code> → create a project</li>
                <li>Enable the <b>Gmail API</b> (APIs &amp; Services → Library)</li>
                <li>OAuth consent screen → External → add your email as a test user</li>
                <li>Credentials → Create OAuth client ID → <b>Desktop app</b> (allows loopback redirect)</li>
                <li>Copy the Client ID and Client Secret below</li>
              </ol>
            )}
            <Field label="Client ID"><input style={inputStyle} value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" /></Field>
            <Field label="Client Secret"><input style={inputStyle} type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="GOCSPX-…" /></Field>
            <button onClick={connect} disabled={busy}
              style={{ height: 32, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', background: 'var(--accent)', border: 'none', color: '#fff', marginTop: 4 }}>
              {busy ? 'Connecting…' : 'Connect Gmail'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Sync window">
              <Select value={String(scope)} options={SYNC_SCOPES.map(s => ({ value: String(s.value), label: s.label }))} onChange={v => setScope(Number(v))} />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={sync} disabled={busy}
                style={{ flex: 1, height: 32, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' }}>
                {busy ? 'Syncing…' : 'Sync Now'}
              </button>
              <button onClick={disconnect}
                style={{ height: 32, padding: '0 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}>
                Disconnect
              </button>
            </div>
            <p style={{ fontSize: 10, color: '#4A4A65', lineHeight: 1.5, margin: 0 }}>
              Threads are written as Markdown to <code style={{ fontFamily: '"JetBrains Mono",monospace' }}>.apex/vault/raw/gmail/</code>. Auto-syncs every 6 hours while the app is open.
            </p>
          </div>
        )}
      </Section>

      <CalendarPanel />
      <FirefliesPanel />
    </div>
  );
}

function CalendarPanel() {
  const { workspacePath } = useAppStore();
  const { error, success } = useToast();
  const [status, setStatus] = useState<GmailStatus>({ connected: false, email: null, last_synced: null, thread_count: null });
  const [busy, setBusy] = useState(false);
  const refresh = () => { calendarStatus(workspacePath ?? undefined).then(setStatus).catch(() => {}); };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);
  const sync = async () => {
    if (!workspacePath) { error('Open a workspace first'); return; }
    setBusy(true);
    try { const r = await calendarSync(workspacePath); success(`Synced ${r.thread_count} calendar events`); refresh(); }
    catch (e) { error(`Calendar sync failed: ${(e as Error).message}`); }
    setBusy(false);
  };
  const fmtDate = (t: number | null) => t ? new Date(t * 1000).toLocaleString() : 'never';
  return (
    <Section title="Google Calendar">
      <div style={{ background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: status.connected ? 10 : 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: status.connected ? '#22C55E' : '#4A4A65' }} />
          <span style={{ fontSize: 12, color: '#E2E2EC', fontWeight: 600 }}>{status.connected ? 'Connected (Google account)' : 'Connect Gmail first'}</span>
        </div>
        {status.connected && (
          <div style={{ fontSize: 11, color: '#8888A8', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#4A4A65' }}>Last synced</span><span>{fmtDate(status.last_synced)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#4A4A65' }}>Events</span><span>{status.thread_count ?? 0}</span></div>
          </div>
        )}
      </div>
      {status.connected && (
        <button onClick={sync} disabled={busy} style={{ height: 30, width: '100%', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' }}>
          {busy ? 'Syncing…' : 'Sync Calendar'}
        </button>
      )}
      <p style={{ fontSize: 10, color: '#4A4A65', marginTop: 8, lineHeight: 1.5 }}>
        Pulls events (−60d to +14d) into <code style={{ fontFamily: '"JetBrains Mono",monospace' }}>.apex/vault/raw/calendar/</code>. Attendees link to people notes. Auto-syncs every 30 min.
      </p>
    </Section>
  );
}

function FirefliesPanel() {
  const { workspacePath } = useAppStore();
  const { error, success, info } = useToast();
  const [status, setStatus] = useState<FirefliesStatus>({ connected: false, last_synced: null, meeting_count: null });
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => { firefliesStatus(workspacePath ?? undefined).then(setStatus).catch(() => {}); };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);
  const connect = async () => {
    if (!apiKey.trim()) { error('Enter your Fireflies API key'); return; }
    setBusy(true);
    try { await firefliesSetKey(apiKey.trim()); success('Fireflies key saved'); setApiKey(''); refresh(); }
    catch (e) { error(`Failed: ${(e as Error).message}`); }
    setBusy(false);
  };
  const sync = async () => {
    if (!workspacePath) { error('Open a workspace first'); return; }
    setBusy(true);
    try { const r = await firefliesSync(workspacePath); success(`Synced ${r.meeting_count} meetings`); refresh(); }
    catch (e) { error(`Sync failed: ${(e as Error).message}`); }
    setBusy(false);
  };
  const disconnect = async () => { await firefliesDisconnect(); refresh(); info('Fireflies disconnected'); };
  const fmtDate = (t: number | null) => t ? new Date(t * 1000).toLocaleString() : 'never';
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 30, background: '#18181F', border: '1px solid #252535', borderRadius: 5,
    color: '#C0C0D0', fontSize: 12, padding: '0 8px', outline: 'none', fontFamily: '"JetBrains Mono",monospace',
  };
  return (
    <Section title="Fireflies">
      <div style={{ background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: status.connected ? 10 : 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: status.connected ? '#22C55E' : '#4A4A65' }} />
          <span style={{ fontSize: 12, color: '#E2E2EC', fontWeight: 600 }}>{status.connected ? 'Connected' : 'Not connected'}</span>
        </div>
        {status.connected && (
          <div style={{ fontSize: 11, color: '#8888A8', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#4A4A65' }}>Last synced</span><span>{fmtDate(status.last_synced)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#4A4A65' }}>Meetings</span><span>{status.meeting_count ?? 0}</span></div>
          </div>
        )}
      </div>
      {!status.connected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Field label="API key"><input style={inputStyle} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Fireflies API key (fireflies.ai → Settings)" /></Field>
          <button onClick={connect} disabled={busy} style={{ height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' }}>
            {busy ? 'Saving…' : 'Save Key'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={sync} disabled={busy} style={{ flex: 1, height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' }}>
            {busy ? 'Syncing…' : 'Sync Meetings'}
          </button>
          <button onClick={disconnect} style={{ height: 30, padding: '0 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}>Disconnect</button>
        </div>
      )}
      <p style={{ fontSize: 10, color: '#4A4A65', marginTop: 8, lineHeight: 1.5 }}>
        Meeting transcripts saved to <code style={{ fontFamily: '"JetBrains Mono",monospace' }}>.apex/vault/meetings/</code>. Entity extraction runs on meetings too.
      </p>
    </Section>
  );
}

// ─── SettingsDialog ───────────────────────────────────────────────────────────

/** The tabbed settings content — reused by the modal and the full Settings page. */
export function SettingsBody() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, height: '100%' }}>
      {/* Sidebar tabs */}
      <div style={{ width: 150, background: '#0A0A0F', borderRight: '1px solid #1A1A28', padding: '8px 0', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              width: '100%', height: 32, display: 'flex', alignItems: 'center', padding: '0 16px',
              background: activeTab === tab.id ? '#18181F' : 'none',
              borderLeft: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
              borderTop: 'none', borderRight: 'none', borderBottom: 'none',
              cursor: 'pointer', color: activeTab === tab.id ? '#E2E2EC' : '#8888A8',
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
        {activeTab === 'connections' && <ConnectionsTab />}
        {activeTab === 'themes'   && <ThemesTab />}
        {activeTab === 'about'    && <AboutTab />}
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useAppStore();
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

        <SettingsBody />
      </div>
    </div>
  );
}
