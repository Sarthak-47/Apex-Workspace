import { useAppStore } from "@/store";

function SbItem({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        fontSize: 11,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 8px',
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
      className={onClick ? 'hover:bg-white/10 transition-colors' : ''}
    >
      {children}
    </div>
  );
}

export function StatusBar() {
  const { mode, activeFile, terminalOpen, toggleTerminal, ollamaOnline, ollamaModels } = useAppStore();
  const fileName = activeFile?.split('/').pop() ?? null;

  return (
    <div
      className="app-statusbar flex items-center"
      style={{ height: 26, background: '#6366F1', flexShrink: 0 }}
    >
      {/* Left items */}
      <SbItem>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
          <polyline points="1,4 4,1 8,5"/><polyline points="4,1 4,8"/><polyline points="1,9 11,9"/>
        </svg>
        main
      </SbItem>

      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)' }} />

      <SbItem>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.8 }}>
          <circle cx="5" cy="5" r="4"/><line x1="5" y1="3" x2="5" y2="5"/><circle cx="5" cy="7" r="0.4" fill="white"/>
        </svg>
        0 errors
      </SbItem>

      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)' }} />

      <SbItem>
        <span style={{ opacity: 0.8 }}>{mode}</span>
      </SbItem>

      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)' }} />

      {/* Terminal toggle */}
      <SbItem onClick={toggleTerminal}>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: terminalOpen ? 1 : 0.6 }}
        >
          <rect x="1" y="1" width="10" height="10" rx="1.5"/>
          <polyline points="3,4.5 5.5,6 3,7.5"/>
          <line x1="6.5" y1="7.5" x2="9" y2="7.5"/>
        </svg>
        <span style={{ opacity: terminalOpen ? 1 : 0.65 }}>Terminal</span>
      </SbItem>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right items */}
      {fileName && (
        <>
          <SbItem>
            <span style={{ opacity: 0.75 }}>{fileName}</span>
          </SbItem>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)' }} />
        </>
      )}

      <SbItem>
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

      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)' }} />

      <SbItem>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" style={{ opacity: 0.8 }}>
          <polygon points="5,1 9,9 1,9"/>
        </svg>
        v0.1.0
      </SbItem>
    </div>
  );
}
