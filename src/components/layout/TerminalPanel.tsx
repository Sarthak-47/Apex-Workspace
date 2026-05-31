import { useAppStore } from "@/store";

export function TerminalPanel() {
  const { terminalOpen, toggleTerminal } = useAppStore();
  if (!terminalOpen) return null;

  return (
    <div
      className="app-terminal flex flex-col"
      style={{ background: '#090910', borderTop: '1px solid #252535', flexShrink: 0 }}
    >
      {/* Tab bar */}
      <div style={{
        height: 32,
        background: '#111118',
        borderBottom: '1px solid #1A1A28',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 4,
        flexShrink: 0,
      }}>
        {/* Active tab */}
        <div style={{
          height: 26,
          padding: '0 12px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#18181F',
          color: '#E2E2EC',
        }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="2,10 5,7 7,9 10,4"/>
            <polyline points="1,12 12,12"/>
          </svg>
          bash
        </div>

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {[
            // New terminal
            <svg key="plus" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>,
            // Split terminal
            <svg key="split" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="14" height="12" rx="1"/><line x1="8" y1="2" x2="8" y2="14"/></svg>,
            // Collapse
            <svg key="chev" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="4,10 8,6 12,10"/></svg>,
          ].map((icon, i) => (
            <button
              key={i}
              onClick={i === 2 ? toggleTerminal : undefined}
              style={{ fontSize: 16, color: '#4A4A65', padding: 4, cursor: 'pointer', lineHeight: 1 }}
              className="hover:!text-[#8888A8] transition-colors"
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal output — xterm.js mounts here */}
      <div
        id="terminal-container"
        style={{
          flex: 1,
          padding: '10px 14px',
          fontSize: 13,
          lineHeight: 1.65,
          overflow: 'hidden',
          fontFamily: 'JetBrains Mono, Cascadia Code, monospace',
          color: '#8888A8',
        }}
      >
        <div>
          <span style={{ color: '#6366F1' }}>APEX</span>
          <span style={{ color: '#8888A8' }}> ~/apex </span>
          <span style={{ color: '#22C55E' }}>main</span>
          <span style={{ color: '#E2E2EC' }}> $ </span>
          <span className="blink" />
        </div>
      </div>
    </div>
  );
}
