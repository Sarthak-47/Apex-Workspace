import { useAppStore } from "@/store";
import { getLang } from "@/components/editor/MonacoEditor";
import { useMarkers } from "@/lib/useMarkers";

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

export function StatusBar() {
  const {
    mode, activeFile, terminalOpen, toggleTerminal,
    ollamaOnline, ollamaModels, gitBranch,
    cursorLine, cursorCol, editorFileSize,
    vimMode, indexProgress, autocompleteEnabled,
    setCookbookOpen, setCompareOpen, toggleProblems,
  } = useAppStore();
  const { errors, warnings } = useMarkers();

  const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;

  const lang     = activeFile ? getLang(activeFile) : null;
  const langLabel = lang ? (LANG_LABELS[lang] ?? lang) : null;

  return (
    <div
      className="app-statusbar flex items-center"
      style={{ height: 26, background: '#6366F1', flexShrink: 0 }}
    >
      {/* ── Left ──────────────────────────────────────────────────────── */}
      <SbItem>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
          <polyline points="1,4 4,1 8,5"/><polyline points="4,1 4,8"/><polyline points="1,9 11,9"/>
        </svg>
        {gitBranch || 'main'}
      </SbItem>

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

      {/* Cursor position */}
      {activeFile && (
        <>
          <SbItem title="Cursor position">
            Ln {cursorLine}, Col {cursorCol}
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

      {/* Language mode */}
      {langLabel && (
        <>
          <SbItem title="Language mode">
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
          <SbItem title="Indentation">Spaces: 2</SbItem>
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
        v0.1.0
      </SbItem>
    </div>
  );
}
