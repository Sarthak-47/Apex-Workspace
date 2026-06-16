import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { getLang } from "@/components/editor/MonacoEditor";
import { useMarkers } from "@/lib/useMarkers";
import { gitBlame, gitListBranches, gitSwitchBranch, gitCreateBranch, type BlameLine } from "@/lib/tauri";
import { runEditorAction, getEol, setEol } from "@/lib/editorBridge";
import { useRef } from "react";

function relTime(epochSec: number): string {
  if (!epochSec) return '';
  const s = Math.floor(Date.now() / 1000 - epochSec);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(epochSec * 1000).toLocaleDateString();
}

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript',
  python: 'Python', rust: 'Rust', go: 'Go', java: 'Java',
  json: 'JSON', markdown: 'Markdown', css: 'CSS', scss: 'SCSS',
  html: 'HTML', toml: 'TOML', yaml: 'YAML', shell: 'Shell',
  sql: 'SQL', xml: 'XML', c: 'C', cpp: 'C++', plaintext: 'Text',
};

function SbItem({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        fontSize: 11, color: '#fff',
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 8px', height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
      className={onClick ? 'hover:bg-white/10 transition-colors' : ''}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)' }} />;
}

function BranchPicker({ branch }: { branch: string }) {
  const { workspacePath, setGitBranch, addToast } = useAppStore();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (workspacePath) gitListBranches(workspacePath).then(setBranches).catch(() => {});
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, workspacePath]);

  const switchTo = async (b: string) => {
    setOpen(false);
    if (!workspacePath || b === branch) return;
    try { await gitSwitchBranch(workspacePath, b); setGitBranch(b); addToast(`Switched to ${b}`, 'success'); }
    catch (e) { addToast(`Checkout failed: ${e}`, 'error'); }
  };
  const create = async () => {
    setOpen(false);
    const name = window.prompt('New branch name:')?.trim();
    if (!name || !workspacePath) return;
    try { await gitCreateBranch(workspacePath, name); setGitBranch(name); addToast(`Created branch ${name}`, 'success'); }
    catch (e) { addToast(`Create failed: ${e}`, 'error'); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', height: '100%' }}>
      <SbItem onClick={() => setOpen((o) => !o)} title="Switch / create branch">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
          <polyline points="1,4 4,1 8,5"/><polyline points="4,1 4,8"/><polyline points="1,9 11,9"/>
        </svg>
        {branch}
      </SbItem>
      {open && (
        <div style={{ position: 'absolute', bottom: 26, left: 0, zIndex: 9999, width: 220, background: '#13131B', border: '1px solid #252535', borderRadius: 7, boxShadow: '0 -10px 30px rgba(0,0,0,0.5)', overflow: 'hidden', paddingBottom: 4, color: '#C7C7D9' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#6A6A85', padding: '8px 12px 4px' }}>BRANCHES</div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {branches.length === 0 ? (
              <div style={{ fontSize: 11, color: '#4A4A65', padding: '2px 12px 6px' }}>{workspacePath ? 'No branches' : 'Open a folder'}</div>
            ) : branches.map((b) => (
              <button key={b} onClick={() => switchTo(b)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '5px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: b === branch ? '#A5B4FC' : '#C7C7D9' }}
                className="hover:!bg-[#1E1E2E]">
                <span style={{ width: 8, color: 'var(--accent)' }}>{b === branch ? '●' : ''}</span>{b}
              </button>
            ))}
          </div>
          <div style={{ height: 1, background: '#1E1E2E', margin: '4px 0' }} />
          <button onClick={create}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#A5B4FC' }}
            className="hover:!bg-[#1E1E2E]">+ Create new branch…</button>
        </div>
      )}
    </div>
  );
}

export function StatusBar() {
  const {
    mode, activeFile, terminalOpen, toggleTerminal,
    ollamaOnline, ollamaModels, gitBranch,
    cursorLine, cursorCol, editorFileSize,
    vimMode, indexProgress, autocompleteEnabled,
    setCookbookOpen, setCompareOpen, toggleProblems,
    workspacePath, tabSize, insertSpaces, setInsertSpaces,
    selChars, selLines,
  } = useAppStore();
  const { errors, warnings } = useMarkers();
  const [, forceEol] = useState(0);

  // Inline git blame for the current line (desktop app only; empty in browser).
  const [blame, setBlame] = useState<BlameLine[]>([]);
  useEffect(() => {
    if (!activeFile || !workspacePath) { setBlame([]); return; }
    let cancel = false;
    gitBlame(workspacePath, activeFile).then((b) => { if (!cancel) setBlame(b); }).catch(() => {});
    return () => { cancel = true; };
  }, [activeFile, workspacePath]);
  const lineBlame = blame[cursorLine - 1];

  const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;

  const lang     = activeFile ? getLang(activeFile) : null;
  const langLabel = lang ? (LANG_LABELS[lang] ?? lang) : null;

  return (
    <div
      className="app-statusbar flex items-center"
      style={{ height: 26, background: 'var(--accent)', flexShrink: 0 }}
    >
      {/* ── Left ──────────────────────────────────────────────────────── */}
      <BranchPicker branch={gitBranch || 'main'} />

      <Divider />

      <SbItem onClick={toggleProblems} title="Toggle Problems panel">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
          <circle cx="6" cy="6" r="4.5"/><line x1="6" y1="3.5" x2="6" y2="6.5"/><circle cx="6" cy="8.5" r="0.4" fill="white"/>
        </svg>
        {errors}
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85, marginLeft: 4 }}>
          <path d="M6 1.5 11 10.5H1L6 1.5Z"/><line x1="6" y1="5" x2="6" y2="7.5"/><circle cx="6" cy="9" r="0.4" fill="white"/>
        </svg>
        {warnings}
      </SbItem>

      <Divider />

      <SbItem>
        <span style={{ opacity: 0.8 }}>{mode}</span>
      </SbItem>

      <Divider />

      {/* Terminal toggle */}
      <SbItem onClick={toggleTerminal} title="Toggle terminal">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: terminalOpen ? 1 : 0.6 }}>
          <rect x="1" y="1" width="10" height="10" rx="1.5"/>
          <polyline points="3,4.5 5.5,6 3,7.5"/>
          <line x1="6.5" y1="7.5" x2="9" y2="7.5"/>
        </svg>
        <span style={{ opacity: terminalOpen ? 1 : 0.65 }}>Terminal</span>
      </SbItem>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Indexing progress */}
      {indexProgress && indexProgress.total > 0 && (
        <>
          <SbItem title={indexProgress.file ? `Indexing ${indexProgress.file}` : 'Indexing codebase'}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"
              style={{ opacity: 0.85, animation: indexProgress.done < indexProgress.total ? 'spin 0.8s linear infinite' : 'none' }}>
              <path d="M11 6A5 5 0 1 1 6 1"/>
            </svg>
            {indexProgress.done < indexProgress.total
              ? `Indexing ${indexProgress.done}/${indexProgress.total}`
              : 'Index ready'}
          </SbItem>
          <Divider />
        </>
      )}

      {/* Autocomplete indicator */}
      {autocompleteEnabled && (
        <>
          <SbItem title="Inline AI autocomplete is on">
            <span style={{ fontSize: 10, letterSpacing: '0.03em' }}>✨ Suggest</span>
          </SbItem>
          <Divider />
        </>
      )}

      {/* ── Right ─────────────────────────────────────────────────────── */}

      {/* Inline git blame for the current line */}
      {lineBlame && lineBlame.author && (
        <>
          <SbItem title={`${lineBlame.summary} · ${lineBlame.hash}`}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" style={{ opacity: 0.8 }}>
              <circle cx="6" cy="4" r="2.2"/><path d="M2 10.5a4 4 0 0 1 8 0"/>
            </svg>
            {lineBlame.author}, {relTime(lineBlame.time)}
          </SbItem>
          <Divider />
        </>
      )}

      {/* Cursor position — click to go to line */}
      {activeFile && (
        <>
          <SbItem onClick={() => runEditorAction('editor.action.gotoLine')} title="Go to line/column">
            Ln {cursorLine}, Col {cursorCol}{selChars > 0 ? ` (${selChars} selected${selLines > 1 ? `, ${selLines} lines` : ''})` : ''}
          </SbItem>
          <Divider />
        </>
      )}

      {/* Vim mode indicator */}
      {vimMode && (
        <>
          <SbItem title="Vim mode active">
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.05em' }}>VIM</span>
          </SbItem>
          <Divider />
        </>
      )}

      {/* Language mode — click to go to symbol */}
      {langLabel && (
        <>
          <SbItem onClick={() => runEditorAction('editor.action.quickOutline')} title="Go to symbol in editor">
            {langLabel}
          </SbItem>
          <Divider />
        </>
      )}

      {/* Encoding + spaces + size */}
      {activeFile && (
        <>
          <SbItem title="File encoding">UTF-8</SbItem>
          <Divider />
          <SbItem onClick={() => setInsertSpaces(!insertSpaces)} title="Toggle spaces / tabs">
            {insertSpaces ? 'Spaces' : 'Tab Size'}: {tabSize}
          </SbItem>
          <Divider />
          <SbItem onClick={() => { setEol(getEol() === 'CRLF' ? 'LF' : 'CRLF'); forceEol((n) => n + 1); }} title="Toggle end of line sequence">
            {getEol() ?? 'LF'}
          </SbItem>
          <Divider />
          {editorFileSize > 0 && (
            <>
              <SbItem title="File size">{fmtSize(editorFileSize)}</SbItem>
              <Divider />
            </>
          )}
        </>
      )}

      {/* Ollama status — click to open the Model Cookbook */}
      <SbItem onClick={() => setCookbookOpen(true)} title="Model Cookbook — recommended models for your hardware">
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: ollamaOnline ? '#22C55E' : '#4A4A65',
          boxShadow: ollamaOnline ? '0 0 5px #22C55E88' : 'none',
          transition: 'all 0.4s',
        }} />
        <span style={{ opacity: ollamaOnline ? 1 : 0.6 }}>
          {ollamaOnline ? (ollamaModels[0]?.split(':')[0] ?? 'Ollama') : 'Ollama offline'}
        </span>
      </SbItem>

      <Divider />

      {/* Model Cookbook */}
      <SbItem onClick={() => setCookbookOpen(true)} title="Model Cookbook — recommend & pull models for your hardware">
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
          <rect x="2" y="2.5" width="10" height="9" rx="1.5"/><line x1="2" y1="5.5" x2="12" y2="5.5"/><circle cx="4.2" cy="4" r="0.4" fill="white"/>
        </svg>
        Cookbook
      </SbItem>

      <Divider />

      {/* Blind Compare */}
      <SbItem onClick={() => setCompareOpen(true)} title="Blind model compare">
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
          <line x1="7" y1="2" x2="7" y2="12"/><rect x="2" y="4" width="3.5" height="6" rx="0.6"/><rect x="8.5" y="4" width="3.5" height="6" rx="0.6"/>
        </svg>
        Compare
      </SbItem>

      <Divider />

      <SbItem>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" style={{ opacity: 0.8 }}>
          <polygon points="5,1 9,9 1,9"/>
        </svg>
        v0.2.0
      </SbItem>
    </div>
  );
}
