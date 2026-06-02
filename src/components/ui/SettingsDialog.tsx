import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { THEME_OPTIONS } from "@/components/editor/MonacoEditor";

type Tab = 'general' | 'editor' | 'terminal' | 'themes' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general',  label: 'General'  },
  { id: 'editor',   label: 'Editor'   },
  { id: 'terminal', label: 'Terminal' },
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
            {activeTab === 'themes'   && <ThemesTab />}
            {activeTab === 'about'    && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
