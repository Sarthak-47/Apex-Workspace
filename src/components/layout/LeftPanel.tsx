import { useAppStore } from "@/store";

// ─── File row ─────────────────────────────────────────────────────────────────
function FileRow({ name, active, modified, added }: {
  name: string; active?: boolean; modified?: boolean; added?: boolean;
}) {
  const { openFile } = useAppStore();
  return (
    <div
      onClick={() => openFile(`/src/${name}`)}
      style={{
        height: 28,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 7,
        cursor: 'pointer',
        background: active ? '#1E1E2E' : 'transparent',
        borderLeft: active ? '2px solid #6366F1' : '2px solid transparent',
        flexShrink: 0,
        position: 'relative',
      }}
      className="hover:bg-[#18181F] transition-colors"
    >
      {/* File type icon — TS blue */}
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
        <rect width="13" height="13" rx="1.5" fill="#3B82F6" opacity="0.15"/>
        <text x="1.5" y="10" fontSize="8" fontWeight="700" fill="#3B82F6" fontFamily="monospace">TS</text>
      </svg>
      <span style={{
        fontSize: 12,
        color: added ? '#22C55E' : active ? '#F59E0B' : '#E2E2EC',
        flex: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{name}</span>
      {modified && !added && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
      )}
      {added && (
        <span style={{ background: '#052A14', color: '#22C55E', fontSize: 10, padding: '0 4px', borderRadius: 3, flexShrink: 0, fontWeight: 500 }}>U</span>
      )}
    </div>
  );
}

// ─── Knowledge node row ───────────────────────────────────────────────────────
const NODE_ICONS: Record<string, { svg: React.ReactNode; color: string }> = {
  people: {
    color: '#93C5FD',
    svg: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5"/></svg>,
  },
  decision: {
    color: '#C084FC',
    svg: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><polyline points="9 2 9 6 13 6"/><polyline points="6 10 7.5 11.5 10 9"/></svg>,
  },
  meeting: {
    color: '#F9A8D4',
    svg: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#F9A8D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="11" rx="1"/><line x1="5" y1="1.5" x2="5" y2="4.5"/><line x1="11" y1="1.5" x2="11" y2="4.5"/><line x1="2" y1="7" x2="14" y2="7"/></svg>,
  },
  question: {
    color: '#F59E0B',
    svg: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M6 6a2 2 0 0 1 4 0c0 1.5-2 2-2 3"/><circle cx="8" cy="12" r="0.5" fill="#F59E0B"/></svg>,
  },
  project: {
    color: '#86EFAC',
    svg: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#86EFAC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5a1 1 0 0 1 1-1h3.586a1 1 0 0 1 .707.293L8.414 5.414A1 1 0 0 0 9.121 5.707H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/></svg>,
  },
};

function NodeRow({ type, label }: { type: keyof typeof NODE_ICONS; label: string }) {
  const meta = NODE_ICONS[type];
  return (
    <div
      style={{ height: 30, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, cursor: 'pointer', flexShrink: 0 }}
      className="hover:bg-[#18181F] transition-colors group"
    >
      <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {meta.svg}
      </span>
      <span style={{ fontSize: 12, color: '#8888A8', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        className="group-hover:!text-[#E2E2EC] transition-colors">
        {label}
      </span>
      {/* Arrow on hover */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#4A4A65" strokeWidth="1.5"
        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <line x1="2" y1="6" x2="10" y2="6"/><polyline points="7,3 10,6 7,9"/>
      </svg>
    </div>
  );
}

// ─── Left Panel ───────────────────────────────────────────────────────────────
export function LeftPanel() {
  const { leftPanelOpen, activeFile } = useAppStore();
  if (!leftPanelOpen) return null;

  return (
    <div
      className="app-left-panel flex flex-col"
      style={{ width: 220, background: '#111118', borderRight: '1px solid #252535', overflow: 'hidden', flexShrink: 0 }}
    >
      {/* ── ACTIVE FILES section ──────────────────────────────────── */}
      <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 12px', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#4A4A65', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Active
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              <svg key="fp" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="1" width="9" height="11" rx="1"/><line x1="6.5" y1="4" x2="6.5" y2="9"/><line x1="4" y1="6.5" x2="9" y2="6.5"/></svg>,
              <svg key="dp" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8V5a1 1 0 0 1 1-1h2l1.5 2H10a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/><line x1="9" y1="2" x2="9" y2="1"/><line x1="11" y1="3" x2="11" y2="2"/></svg>,
              <svg key="rf" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round"><path d="M11 6.5A4.5 4.5 0 0 1 2 6.5"/><polyline points="2,4 2,6.5 4.5,6.5"/></svg>,
            ].map((icon, i) => (
              <span key={i} style={{ fontSize: 14, color: '#4A4A65', cursor: 'pointer', lineHeight: 1 }}
                className="hover:!text-[#E2E2EC] transition-colors">
                {icon}
              </span>
            ))}
          </div>
        </div>

        {/* Files */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <FileRow name="DataTable.tsx" active={activeFile === '/src/DataTable.tsx'} modified />
          <FileRow name="useTable.ts" active={activeFile === '/src/useTable.ts'} />
          <FileRow name="useFetch.ts" active={activeFile === '/src/useFetch.ts'} modified />
          <FileRow name="FilterBar.tsx" active={activeFile === '/src/FilterBar.tsx'} added />
          <FileRow name="Modal.tsx" active={activeFile === '/src/Modal.tsx'} />
          <FileRow name="api.ts" active={activeFile === '/src/api.ts'} />
        </div>
      </div>

      {/* ── CONNECTED divider ─────────────────────────────────────── */}
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '#252535' }} />
        <span style={{
          fontSize: 9, fontWeight: 600, color: '#4A4A65',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          background: '#111118', padding: '0 8px', position: 'relative', zIndex: 1, margin: '0 auto',
        }}>
          Connected
        </span>
      </div>

      {/* ── KNOWLEDGE NODES section ───────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <NodeRow type="people" label="Alex Chen" />
        <NodeRow type="decision" label="Auth Decision #12" />
        <NodeRow type="meeting" label="Sprint 23 Standup" />
        <NodeRow type="question" label="2 open questions" />
        <NodeRow type="project" label="Auth v2 Project" />
      </div>
    </div>
  );
}
