import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store";
import { listDir, openFolderDialog, type DirEntry } from "@/lib/tauri";

// ─── File type icon helpers ────────────────────────────────────────────────────

const EXT_COLOR: Record<string, string> = {
  ts: '#3B82F6', tsx: '#06B6D4',
  js: '#F59E0B', jsx: '#F59E0B',
  py: '#22C55E', rs: '#F97316',
  go: '#06B6D4', java: '#EF4444',
  json: '#FACC15', md: '#94A3B8',
  css: '#A78BFA', scss: '#EC4899',
  html: '#F87171', toml: '#FB923C',
  yaml: '#34D399', yml: '#34D399',
  svg: '#FCD34D', sh: '#6EE7B7',
  rs2: '#F97316',
};

const EXT_LABEL: Record<string, string> = {
  ts: 'TS', tsx: 'TX', js: 'JS', jsx: 'JX',
  py: 'PY', rs: 'RS', go: 'GO', java: 'JV',
  json: '{}', md: 'MD', css: 'CS', scss: 'SC',
  html: 'HT', toml: 'TM', yaml: 'YM', yml: 'YM',
  svg: 'SV', sh: 'SH',
};

function FileIcon({ ext }: { ext: string | null }) {
  const e = ext?.toLowerCase() ?? '';
  const color = EXT_COLOR[e] ?? '#8888A8';
  const label = EXT_LABEL[e] ?? (e ? e.slice(0, 2).toUpperCase() : '?');
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
      <rect width="13" height="13" rx="1.5" fill={color} opacity="0.15"/>
      <text x="1.5" y="10" fontSize="7.5" fontWeight="700" fill={color} fontFamily="monospace">
        {label}
      </text>
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#F59E0B" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {open
        ? <path d="M1 4a1 1 0 0 1 1-1h2.586a1 1 0 0 1 .707.293L6.414 4.414A1 1 0 0 0 7.121 4.707H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z" fill="#F59E0B" fillOpacity="0.12"/>
        : <path d="M1 4a1 1 0 0 1 1-1h2.586a1 1 0 0 1 .707.293L6.414 4.414A1 1 0 0 0 7.121 4.707H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z"/>
      }
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
    >
      <polyline points="3,2 7,5 3,8"/>
    </svg>
  );
}

// ─── File tree node ────────────────────────────────────────────────────────────

interface TreeNodeProps {
  entry: DirEntry;
  depth: number;
  dirCache: Record<string, DirEntry[]>;
  openDirs: Set<string>;
  loadingDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  activeFile: string | null;
}

function TreeNode({ entry, depth, dirCache, openDirs, loadingDirs, onToggleDir, onOpenFile, activeFile }: TreeNodeProps) {
  const indent = depth * 12 + 10;
  const isOpen = openDirs.has(entry.path);
  const isLoading = loadingDirs.has(entry.path);
  const isActive = activeFile === entry.path;

  if (entry.is_dir) {
    const children = dirCache[entry.path];
    return (
      <>
        <div
          onClick={() => onToggleDir(entry.path)}
          style={{
            height: 26,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: indent,
            paddingRight: 8,
            gap: 4,
            cursor: 'pointer',
            background: isOpen ? '#18181F' : 'transparent',
            flexShrink: 0,
            userSelect: 'none',
          }}
          className="hover:bg-[#18181F] transition-colors"
        >
          {isLoading ? (
            <div style={{
              width: 10, height: 10, flexShrink: 0,
              border: '1.5px solid #252535', borderTopColor: '#6366F1',
              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
            }} />
          ) : (
            <Chevron open={isOpen} />
          )}
          <FolderIcon open={isOpen} />
          <span style={{
            fontSize: 12,
            color: isOpen ? '#E2E2EC' : '#C0C0D0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {entry.name}
          </span>
        </div>

        {isOpen && children?.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            dirCache={dirCache}
            openDirs={openDirs}
            loadingDirs={loadingDirs}
            onToggleDir={onToggleDir}
            onOpenFile={onOpenFile}
            activeFile={activeFile}
          />
        ))}
      </>
    );
  }

  // File row
  return (
    <div
      onClick={() => onOpenFile(entry.path)}
      style={{
        height: 26,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: indent + 14,
        paddingRight: 8,
        gap: 5,
        cursor: 'pointer',
        background: isActive ? '#1A1A3A' : 'transparent',
        borderLeft: isActive ? '2px solid #6366F1' : '2px solid transparent',
        flexShrink: 0,
      }}
      className={isActive ? '' : 'hover:bg-[#18181F] transition-colors'}
    >
      <FileIcon ext={entry.ext} />
      <span style={{
        fontSize: 12,
        color: isActive ? '#E2E2EC' : '#C0C0D0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {entry.name}
      </span>
    </div>
  );
}

// ─── File tree root ────────────────────────────────────────────────────────────

function FileTree({ workspacePath, activeFile, onOpenFile }: {
  workspacePath: string;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [dirCache, setDirCache]       = useState<Record<string, DirEntry[]>>({});
  const [openDirs, setOpenDirs]       = useState<Set<string>>(new Set([workspacePath]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());

  const loadDir = useCallback(async (path: string) => {
    if (dirCache[path] || loadingDirs.has(path)) return;
    setLoadingDirs(prev => new Set(prev).add(path));
    try {
      const entries = await listDir(path);
      setDirCache(prev => ({ ...prev, [path]: entries }));
    } catch {
      setDirCache(prev => ({ ...prev, [path]: [] }));
    } finally {
      setLoadingDirs(prev => { const s = new Set(prev); s.delete(path); return s; });
    }
  }, [dirCache, loadingDirs]);

  // Load root on mount / workspace change
  useEffect(() => {
    setDirCache({});
    setOpenDirs(new Set([workspacePath]));
    loadDir(workspacePath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  const handleToggleDir = useCallback((path: string) => {
    setOpenDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        loadDir(path);
      }
      return next;
    });
  }, [loadDir]);

  const rootEntries = dirCache[workspacePath];
  const rootLoading = loadingDirs.has(workspacePath);

  if (rootLoading) {
    return (
      <div style={{ padding: '16px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 12, height: 12,
          border: '1.5px solid #252535', borderTopColor: '#6366F1',
          borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0,
        }} />
        <span style={{ fontSize: 11, color: '#4A4A65' }}>Loading…</span>
      </div>
    );
  }

  if (!rootEntries || rootEntries.length === 0) {
    return (
      <div style={{ padding: '12px', fontSize: 11, color: '#4A4A65' }}>
        Empty folder
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {rootEntries.map(entry => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          dirCache={dirCache}
          openDirs={openDirs}
          loadingDirs={loadingDirs}
          onToggleDir={handleToggleDir}
          onOpenFile={onOpenFile}
          activeFile={activeFile}
        />
      ))}
    </div>
  );
}

// ─── Empty workspace state ────────────────────────────────────────────────────

function NoWorkspace({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: '0 16px',
    }}>
      {/* Folder icon */}
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10a2 2 0 0 1 2-2h7.172a2 2 0 0 1 1.414.586L15 10.172A2 2 0 0 0 16.414 10.757H31a2 2 0 0 1 2 2V28a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10z"/>
      </svg>

      <p style={{ fontSize: 11, color: '#4A4A65', textAlign: 'center', lineHeight: 1.6 }}>
        No folder open
      </p>

      <button
        onClick={onOpen}
        style={{
          height: 28,
          padding: '0 14px',
          borderRadius: 5,
          fontSize: 11,
          fontWeight: 500,
          cursor: 'pointer',
          background: '#1A1A3A',
          border: '1px solid #6366F160',
          color: '#6366F1',
          transition: 'all 120ms',
        }}
        className="hover:!bg-[#252552] hover:!border-[#6366F1] transition-all"
      >
        Open Folder
      </button>

      <p style={{ fontSize: 10, color: '#4A4A65', opacity: 0.6, textAlign: 'center' }}>
        Or drag a folder here
      </p>
    </div>
  );
}

// ─── Knowledge node row (keep from Day 1 design) ─────────────────────────────

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
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#4A4A65" strokeWidth="1.5"
        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <line x1="2" y1="6" x2="10" y2="6"/><polyline points="7,3 10,6 7,9"/>
      </svg>
    </div>
  );
}

// ─── Left Panel ────────────────────────────────────────────────────────────────

export function LeftPanel() {
  const { leftPanelOpen, activeFile, workspacePath, setWorkspacePath, openFile } = useAppStore();
  if (!leftPanelOpen) return null;

  const folderName = workspacePath
    ? workspacePath.split(/[\\/]/).filter(Boolean).pop() ?? workspacePath
    : null;

  const handleOpenFolder = async () => {
    const path = await openFolderDialog();
    if (path) setWorkspacePath(path);
  };

  return (
    <div
      className="app-left-panel flex flex-col"
      style={{ background: '#111118', borderRight: '1px solid #252535', overflow: 'hidden', flexShrink: 0 }}
    >
      {/* ── File Explorer header ──────────────────────────────── */}
      <div style={{
        height: 32, display: 'flex', alignItems: 'center',
        padding: '0 10px', justifyContent: 'space-between',
        flexShrink: 0, borderBottom: '1px solid #1A1A28',
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#4A4A65', letterSpacing: '0.1em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {folderName ?? 'Explorer'}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {/* Open folder */}
          <button
            onClick={handleOpenFolder}
            title="Open Folder"
            style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
            className="hover:!text-[#E2E2EC] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4a1 1 0 0 1 1-1h2.586a1 1 0 0 1 .707.293L6.414 4.414A1 1 0 0 0 7.121 4.707H11a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z"/>
              <line x1="6.5" y1="6" x2="6.5" y2="9"/><line x1="5" y1="7.5" x2="8" y2="7.5"/>
            </svg>
          </button>
          {/* Refresh */}
          <button
            onClick={() => workspacePath && setWorkspacePath(workspacePath + '')}
            title="Refresh"
            style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
            className="hover:!text-[#E2E2EC] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M11 6.5A4.5 4.5 0 0 1 2 6.5"/><polyline points="2,4 2,6.5 4.5,6.5"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── File tree or empty state ──────────────────────────── */}
      <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {workspacePath ? (
          <FileTree
            key={workspacePath}
            workspacePath={workspacePath}
            activeFile={activeFile}
            onOpenFile={openFile}
          />
        ) : (
          <NoWorkspace onOpen={handleOpenFolder} />
        )}
      </div>

      {/* ── Connected divider ─────────────────────────────────── */}
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

      {/* ── Knowledge nodes ───────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <NodeRow type="people"   label="Alex Chen" />
        <NodeRow type="decision" label="Auth Decision #12" />
        <NodeRow type="meeting"  label="Sprint 23 Standup" />
        <NodeRow type="question" label="2 open questions" />
        <NodeRow type="project"  label="Auth v2 Project" />
      </div>
    </div>
  );
}
