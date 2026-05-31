import { useAppStore } from "@/store";

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar() {
  const { openFiles, activeFile, setActiveFile, closeFile } = useAppStore();
  if (openFiles.length === 0) return null;

  return (
    <div style={{ height: 36, background: '#111118', borderBottom: '1px solid #252535', display: 'flex', alignItems: 'flex-end', flexShrink: 0 }}>
      {openFiles.map((path) => {
        const name = path.split('/').pop() ?? path;
        const active = path === activeFile;
        return (
          <div
            key={path}
            onClick={() => setActiveFile(path)}
            style={{
              height: 36,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px 0 9px',
              gap: 5,
              cursor: 'pointer',
              borderRight: '1px solid #252535',
              borderTop: active ? '2px solid #6366F1' : '2px solid transparent',
              borderBottom: active ? '1px solid #0A0A0F' : 'none',
              background: active ? '#0A0A0F' : '#111118',
              marginBottom: active ? -1 : 0,
              zIndex: active ? 2 : 1,
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
              <rect width="13" height="13" rx="1.5" fill="#3B82F6" opacity="0.15"/>
              <text x="1.5" y="10" fontSize="8" fontWeight="700" fill="#3B82F6" fontFamily="monospace">TS</text>
            </svg>
            <span style={{ fontSize: 12, color: active ? '#E2E2EC' : '#8888A8', whiteSpace: 'nowrap' }}>{name}</span>
            {/* Unsaved dot */}
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0, marginLeft: 3 }} />
            <button
              onClick={(e) => { e.stopPropagation(); closeFile(path); }}
              style={{ fontSize: 13, color: '#4A4A65', marginLeft: 3, lineHeight: 1, cursor: 'pointer' }}
              className="hover:!text-[#E2E2EC] transition-colors"
            >×</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
function Breadcrumb({ path }: { path: string }) {
  const parts = path.split('/').filter(Boolean);
  return (
    <div style={{ height: 26, background: '#111118', borderBottom: '1px solid #1A1A28', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 5, flexShrink: 0, overflow: 'hidden' }}>
      {parts.map((part, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: i === parts.length - 1 ? '#E2E2EC' : '#8888A8', cursor: 'pointer' }}
            className="hover:!text-[#E2E2EC] transition-colors">
            {part}
          </span>
          {i < parts.length - 1 && <span style={{ fontSize: 12, color: '#4A4A65' }}>/</span>}
        </span>
      ))}
    </div>
  );
}

// ─── Context Ribbon ───────────────────────────────────────────────────────────
const CHIPS = [
  {
    type: 'person', label: 'Alex Chen', bg: '#0D1929', color: '#93C5FD', border: '#1A2940',
    svg: <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="4.5" r="2.5"/><path d="M1.5 12.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"/></svg>,
  },
  {
    type: 'decision', label: 'Auth Decision #12', bg: '#150D29', color: '#C084FC', border: '#251A40',
    svg: <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5z"/><polyline points="8 1.5 8 5 11.5 5"/><polyline points="5 9 6.5 10.5 9.5 8"/></svg>,
  },
  {
    type: 'meeting', label: 'Sprint 23', bg: '#290D1F', color: '#F9A8D4', border: '#401A30',
    svg: <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F9A8D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="11" height="10" rx="1"/><line x1="4.5" y1="1" x2="4.5" y2="4"/><line x1="9.5" y1="1" x2="9.5" y2="4"/><line x1="1.5" y1="6" x2="12.5" y2="6"/></svg>,
  },
  {
    type: 'question', label: '2 questions', bg: '#291A0D', color: '#F59E0B', border: '#403010',
    svg: <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5"/><path d="M5.5 5.5A1.5 1.5 0 0 1 8.5 6c0 1.5-1.5 1.75-1.5 2.75"/><circle cx="7" cy="10.5" r="0.4" fill="#F59E0B"/></svg>,
  },
];

function ContextRibbon() {
  return (
    <div style={{ height: 32, background: '#0D0D16', borderBottom: '1px solid #252535', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, flexShrink: 0, overflow: 'hidden' }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: '#4A4A65', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 4, whiteSpace: 'nowrap' }}>↗ Context</span>
      {CHIPS.map((chip) => (
        <div
          key={chip.type}
          style={{
            height: 24, padding: '0 8px', borderRadius: 4,
            display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
            whiteSpace: 'nowrap', border: `1px solid ${chip.border}`,
            background: chip.bg, color: chip.color, flexShrink: 0,
          }}
        >
          {chip.svg}
          {chip.label}
        </div>
      ))}
    </div>
  );
}

// ─── Editor placeholder / fake code ──────────────────────────────────────────
function EditorCanvas() {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      {/* Gutter */}
      <div style={{
        width: 52, background: '#0A0A0F', padding: '12px 14px 12px 0',
        textAlign: 'right', fontFamily: 'JetBrains Mono,monospace',
        fontSize: 13, lineHeight: '1.6', flexShrink: 0, overflow: 'hidden', color: '#4A4A65',
      }}>
        {Array.from({ length: 25 }, (_, i) => (
          <span key={i} style={{ display: 'block', height: '20.8px', lineHeight: '20.8px', color: i === 6 ? '#8888A8' : '#4A4A65' }}>{i + 1}</span>
        ))}
      </div>
      {/* Code area — Monaco mounts here */}
      <div style={{
        flex: 1, padding: '12px 0 12px 8px', fontFamily: 'JetBrains Mono,monospace',
        fontSize: 13, lineHeight: '1.6', overflowY: 'auto', background: '#0A0A0F',
        minWidth: 0, whiteSpace: 'pre',
      }}>
        <span style={{ display: 'block', color: '#C084FC' }}>{'import'} <span style={{ color: '#E2E2EC' }}>React</span><span style={{ color: '#94A3B8' }}>,</span> <span style={{ color: '#94A3B8' }}>{'{ useState, useCallback, useMemo }'}</span> <span style={{ color: '#C084FC' }}>from</span> <span style={{ color: '#86EFAC' }}>'react'</span><span style={{ color: '#94A3B8' }}>;</span></span>
        <span style={{ display: 'block', color: '#C084FC' }}>{'import'} <span style={{ color: '#94A3B8' }}>{'{ Column, SortConfig, FilterConfig }'}</span> <span style={{ color: '#C084FC' }}>from</span> <span style={{ color: '#86EFAC' }}>'../types/table'</span><span style={{ color: '#94A3B8' }}>;</span></span>
        <span style={{ display: 'block', color: '#C084FC' }}>{'import'} <span style={{ color: '#94A3B8' }}>{'{ useTable }'}</span> <span style={{ color: '#C084FC' }}>from</span> <span style={{ color: '#86EFAC' }}>'../hooks/useTable'</span><span style={{ color: '#94A3B8' }}>;</span></span>
        <span style={{ display: 'block' }}>&nbsp;</span>
        <span style={{ display: 'block', color: '#4A4A65' }}>{'// Alex Chen owns the Auth v2 API spec this table consumes'}</span>
        <span style={{ display: 'block', color: '#C084FC' }}>{'interface'} <span style={{ color: '#F9A8D4' }}>DataTableProps</span><span style={{ color: '#94A3B8' }}>{'<T>'} {'{'}</span></span>
        <span style={{ display: 'block', paddingLeft: 20 }}><span style={{ color: '#E2E2EC' }}>columns</span><span style={{ color: '#94A3B8' }}>:</span> <span style={{ color: '#F9A8D4' }}>Column</span><span style={{ color: '#94A3B8' }}>{'<T>[]'}</span><span style={{ color: '#94A3B8' }}>;</span></span>
        <span style={{ display: 'block', paddingLeft: 20 }}><span style={{ color: '#E2E2EC' }}>data</span><span style={{ color: '#94A3B8' }}>:</span> <span style={{ color: '#F9A8D4' }}>T</span><span style={{ color: '#94A3B8' }}>[];</span></span>
        <span style={{ display: 'block', paddingLeft: 20 }}><span style={{ color: '#E2E2EC' }}>onRowClick</span><span style={{ color: '#94A3B8' }}>?:</span> <span style={{ color: '#94A3B8' }}>{'(row: '}</span><span style={{ color: '#F9A8D4' }}>T</span><span style={{ color: '#94A3B8' }}>{') => void;'}</span></span>
        <span style={{ display: 'block', color: '#94A3B8' }}>{'}'}</span>
        <span style={{ display: 'block' }}>&nbsp;</span>
        <span style={{ display: 'block', color: '#C084FC' }}>{'export'} {'function'} <span style={{ color: '#93C5FD' }}>DataTable</span><span style={{ color: '#94A3B8' }}>{'<T extends Record<string, unknown>>()'} {'{'}</span></span>
        <span style={{ display: 'block', paddingLeft: 20, color: '#C084FC' }}>{'const'} <span style={{ color: '#94A3B8' }}>[</span><span style={{ color: '#E2E2EC' }}>sort</span><span style={{ color: '#94A3B8' }}>, </span><span style={{ color: '#93C5FD' }}>setSort</span><span style={{ color: '#94A3B8' }}>]</span> {'='} <span style={{ color: '#93C5FD' }}>useState</span><span style={{ color: '#94A3B8' }}>{'<'}</span><span style={{ color: '#F9A8D4' }}>SortConfig</span> <span style={{ color: '#94A3B8' }}>| null{'>(null);'}</span></span>
        <span style={{ display: 'block' }}>&nbsp;</span>
        <span style={{ display: 'block', background: '#111118', paddingLeft: 20, color: '#94A3B8' }}>{'  ? { key, dir: prev.dir === \'asc\' ? \'desc\' : \'asc\' }'}</span>
        <span style={{ display: 'block', background: '#111118', paddingLeft: 20, color: '#94A3B8' }}>{'  : { key, dir: \'asc\' }'}</span>
        <span style={{ display: 'block', paddingLeft: 20, color: '#94A3B8' }}>{'); }'}</span>
      </div>
      {/* Minimap */}
      <div style={{ width: 72, background: '#0A0A0F', borderLeft: '1px solid #1A1A28', padding: '12px 5px', flexShrink: 0, overflow: 'hidden' }}>
        {[
          { w: '70%', c: '#C084FC' }, { w: '85%', c: '#8888A8' }, { w: '50%', c: '#8888A8' },
          { w: '35%', c: '#8888A8' }, { w: '0' }, { w: '60%', c: '#4A4A65' },
          { w: '55%', c: '#F9A8D4', o: 0.6 }, { w: '35%', c: '#8888A8' }, { w: '28%', c: '#8888A8' },
          { w: '25%', c: '#8888A8' }, { w: '0' }, { w: '76%', c: '#6366F1', o: 0.6 },
          { w: '64%', c: '#8888A8' }, { w: '45%', c: '#8888A8' }, { w: '55%', c: '#8888A8' },
          { w: '48%', c: '#8888A8' }, { w: '0' }, { w: '72%', c: '#8888A8' },
          { w: '70%', c: '#93C5FD', o: 0.6 }, { w: '62%', c: '#86EFAC', o: 0.55 },
        ].map((l, i) => (
          <div key={i} style={{ height: 2, borderRadius: 1, marginBottom: 1.8, opacity: l.o ?? 0.45, background: l.c, width: l.w || 0 }} />
        ))}
      </div>
    </div>
  );
}

// ─── Editor placeholder (no file open) ───────────────────────────────────────
function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <img
        src="/apex-logo.svg"
        width={110} height={110}
        alt=""
        style={{ objectFit: 'contain', mixBlendMode: 'lighten', opacity: 0.35, filter: 'brightness(1.4) saturate(0.9)' }}
      />
      <p style={{ fontSize: 12, color: '#4A4A65' }}>Open a file to start editing</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#4A4A65', opacity: 0.7 }}>
          <span style={{ background: '#18181F', border: '1px solid #252535', borderRadius: 3, padding: '1px 5px', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#4A4A65' }}>Ctrl+P</span>
          {' '}Quick Open
        </p>
      </div>
    </div>
  );
}

// ─── Center Area ──────────────────────────────────────────────────────────────
export function CenterArea() {
  const { activeFile } = useAppStore();

  return (
    <div className="app-center flex flex-col" style={{ background: '#0A0A0F', minWidth: 0 }}>
      <TabBar />
      {activeFile ? (
        <>
          <Breadcrumb path={activeFile} />
          <ContextRibbon />
          <EditorCanvas />
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
