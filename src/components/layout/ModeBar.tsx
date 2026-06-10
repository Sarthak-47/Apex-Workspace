import { useAppStore, type AppMode } from "@/store";

const MODES: { id: AppMode; label: string; icon: React.ReactNode }[] = [
  {
    id: "CODE",
    label: "CODE",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3,5 1,7 3,9"/><polyline points="11,5 13,7 11,9"/><line x1="8.5" y1="2.5" x2="5.5" y2="11.5"/>
      </svg>
    ),
  },
  {
    id: "KNOWLEDGE",
    label: "KNOWLEDGE",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="2"/><circle cx="7" cy="7" r="5.5"/>
        <line x1="7" y1="1.5" x2="7" y2="4.5"/><line x1="7" y1="9.5" x2="7" y2="12.5"/>
        <line x1="1.5" y1="7" x2="4.5" y2="7"/><line x1="9.5" y1="7" x2="12.5" y2="7"/>
      </svg>
    ),
  },
  {
    id: "COMMS",
    label: "COMMS",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="2.5" width="12" height="9" rx="1.5"/>
        <polyline points="1,3.5 7,8 13,3.5"/>
      </svg>
    ),
  },
];

export function ModeBar() {
  const { mode, setMode } = useAppStore();

  return (
    <div
      className="app-modebar flex items-center justify-center gap-2"
      style={{ height:36, background:'#111118', borderBottom:'1px solid #252535', flexShrink:0 }}
    >
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              height: 28,
              padding: '0 14px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              border: active ? '1px solid var(--accent)' : '1px solid transparent',
              background: active ? '#1A1A3A' : 'transparent',
              color: active ? 'var(--accent)' : '#4A4A65',
              transition: 'all 0.15s',
            }}
            className={!active ? 'hover:!text-[#8888A8]' : ''}
          >
            {m.icon}
            {m.label}
          </button>
        );
      })}

    </div>
  );
}
