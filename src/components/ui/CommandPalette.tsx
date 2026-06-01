import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "@/store";
import { listAllFiles, type DirEntry } from "@/lib/tauri";

// ─── File icon (compact badge) ────────────────────────────────────────────────

const EXT_COLOR: Record<string, string> = {
  ts: '#3B82F6', tsx: '#06B6D4', js: '#F59E0B', jsx: '#F59E0B',
  py: '#22C55E', rs: '#F97316', go: '#06B6D4', java: '#EF4444',
  json: '#FACC15', md: '#94A3B8', css: '#A78BFA', scss: '#EC4899',
  html: '#F87171', toml: '#FB923C', yaml: '#34D399', yml: '#34D399',
  svg: '#FCD34D', sh: '#6EE7B7',
};
const EXT_LABEL: Record<string, string> = {
  ts: 'TS', tsx: 'TX', js: 'JS', jsx: 'JX', py: 'PY', rs: 'RS',
  go: 'GO', java: 'JV', json: '{}', md: 'MD', css: 'CS', scss: 'SC',
  html: 'HT', toml: 'TM', yaml: 'YM', yml: 'YM', svg: 'SV', sh: 'SH',
};

function FileIcon({ ext }: { ext: string | null }) {
  const e = ext?.toLowerCase() ?? '';
  const color = EXT_COLOR[e] ?? '#8888A8';
  const label = EXT_LABEL[e] ?? (e ? e.slice(0, 2).toUpperCase() : '?');
  return (
    <svg width="15" height="15" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
      <rect width="13" height="13" rx="1.5" fill={color} opacity="0.15"/>
      <text x="1.5" y="10" fontSize="7.5" fontWeight="700" fill={color} fontFamily="monospace">{label}</text>
    </svg>
  );
}

// ─── Highlight matched chars ──────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <span>{text}</span>;
  return (
    <>
      <span>{text.slice(0, idx)}</span>
      <span style={{ color: '#6366F1', fontWeight: 700 }}>{text.slice(idx, idx + query.length)}</span>
      <span>{text.slice(idx + query.length)}</span>
    </>
  );
}

// ─── Command Palette ──────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function CommandPalette({ onClose }: Props) {
  const { workspacePath, openFile } = useAppStore();
  const [query, setQuery]         = useState('');
  const [files, setFiles]         = useState<DirEntry[]>([]);
  const [selectedIdx, setSelected] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  // Load file list once
  useEffect(() => {
    const root = workspacePath ?? '/demo-workspace';
    listAllFiles(root).then(setFiles);
  }, [workspacePath]);

  // Focus input on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Filter + score results
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return files.slice(0, 30);
    return files
      .filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .sort((a, b) => {
        // Prefer name matches over path-only matches
        const an = a.name.toLowerCase().includes(q);
        const bn = b.name.toLowerCase().includes(q);
        if (an && !bn) return -1;
        if (!an && bn) return  1;
        // Prefer matches closer to the start of the name
        return a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q);
      })
      .slice(0, 30);
  }, [query, files]);

  // Reset selection when results change
  useEffect(() => { setSelected(0); }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // Keyboard handling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelected(i => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelected(i => Math.max(i - 1, 0));
          break;
        case 'Enter': {
          e.preventDefault();
          const entry = results[selectedIdx];
          if (entry) { openFile(entry.path); onClose(); }
          break;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [results, selectedIdx, onClose, openFile]);

  const relPath = (path: string) => {
    const root = workspacePath ?? '/demo-workspace';
    return path.startsWith(root + '/') ? path.slice(root.length + 1) : path;
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onMouseDown={onClose}
    >
      {/* Card */}
      <div
        style={{
          width: 620, maxHeight: '60vh',
          background: '#111118', border: '1px solid #252535',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
          display: 'flex', flexDirection: 'column',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid #1A1A28', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#4A4A65" strokeWidth="1.5" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="15" y2="15"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Go to file…"
            style={{
              flex: 1, height: 44, background: 'transparent', border: 'none',
              outline: 'none', fontSize: 14, color: '#E2E2EC',
              fontFamily: 'inherit',
            }}
          />
          <kbd style={{ fontSize: 10, color: '#4A4A65', background: '#18181F', padding: '2px 6px', borderRadius: 3, flexShrink: 0, fontFamily: 'JetBrains Mono,monospace' }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: '#4A4A65' }}>
              No files match <span style={{ color: '#8888A8' }}>"{query}"</span>
            </div>
          )}
          {results.map((entry, i) => {
            const rel = relPath(entry.path);
            const isSelected = i === selectedIdx;
            return (
              <div
                key={entry.path}
                data-idx={i}
                onMouseEnter={() => setSelected(i)}
                onClick={() => { openFile(entry.path); onClose(); }}
                style={{
                  height: 44, display: 'flex', alignItems: 'center',
                  padding: '0 14px', gap: 10, cursor: 'pointer',
                  background: isSelected ? '#1A1A3A' : 'transparent',
                  borderLeft: isSelected ? '2px solid #6366F1' : '2px solid transparent',
                  transition: 'background 60ms',
                }}
              >
                <FileIcon ext={entry.ext} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#E2E2EC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Highlight text={entry.name} query={query} />
                  </div>
                  <div style={{ fontSize: 10, color: '#4A4A65', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {rel}
                  </div>
                </div>
                {isSelected && (
                  <kbd style={{ fontSize: 10, color: '#6366F1', background: '#1A1A3A', padding: '2px 6px', borderRadius: 3, flexShrink: 0, border: '1px solid #6366F130', fontFamily: 'JetBrains Mono,monospace' }}>
                    ↵
                  </kbd>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ height: 28, borderTop: '1px solid #1A1A28', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 12 }}>
          {[
            ['↑↓', 'navigate'],
            ['↵', 'open'],
            ['esc', 'close'],
          ].map(([key, label]) => (
            <span key={key} style={{ fontSize: 10, color: '#4A4A65', display: 'flex', alignItems: 'center', gap: 4 }}>
              <kbd style={{ background: '#18181F', padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono,monospace', fontSize: 9 }}>{key}</kbd>
              {label}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4A4A65' }}>
            {results.length} {results.length === 1 ? 'file' : 'files'}
          </span>
        </div>
      </div>
    </div>
  );
}
