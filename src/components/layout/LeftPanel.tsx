import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "@/store";
import { listDir, openFolderDialog, deletePath, renamePath, type DirEntry } from "@/lib/tauri";

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

// ─── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; entry: DirEntry }

function ContextMenu({ menu, onCopyPath, onCopyRel, onRename, onDelete, onClose }: {
  menu: CtxMenu;
  onCopyPath: () => void;
  onCopyRel: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click-outside or Escape
  useEffect(() => {
    const onKey  = (e: KeyboardEvent)  => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  // Keep menu on screen
  const menuW = 180, menuH = 120;
  const x = Math.min(menu.x, window.innerWidth  - menuW - 4);
  const y = Math.min(menu.y, window.innerHeight - menuH - 4);

  const Item = ({ label, danger, onClick }: { label: string; danger?: boolean; onClick: () => void }) => (
    <div
      onClick={onClick}
      style={{
        height: 28, display: 'flex', alignItems: 'center',
        padding: '0 12px', fontSize: 12, cursor: 'pointer',
        color: danger ? '#EF4444' : '#C0C0D0',
      }}
      className={danger ? 'hover:bg-red-950/40' : 'hover:bg-[#252535]'}
    >
      {label}
    </div>
  );

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed', left: x, top: y,
        background: '#18181F', border: '1px solid #252535',
        borderRadius: 7, padding: '3px 0', zIndex: 9999,
        minWidth: menuW,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Item label="Copy Path"          onClick={onCopyPath} />
      <Item label="Copy Relative Path" onClick={onCopyRel} />
      <div style={{ height: 1, background: '#1A1A28', margin: '3px 0' }} />
      <Item label="Rename"  onClick={onRename} />
      <Item label="Delete"  danger onClick={onDelete} />
    </div>
  );
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteDialog({ entry, onConfirm, onCancel }: {
  entry: DirEntry;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)', background: 'rgba(0,0,0,0.4)' }}
      onMouseDown={onCancel}
    >
      <div
        style={{ background: '#18181F', border: '1px solid #252535', borderRadius: 10, padding: '20px 24px', maxWidth: 340, width: '90vw', boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M3 6h14M8 6V4h4v2M19 6l-1 12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2L1 6"/>
            <line x1="10" y1="11" x2="10" y2="15"/><line x1="8" y1="11" x2="8" y2="15"/><line x1="12" y1="11" x2="12" y2="15"/>
          </svg>
          <div>
            <p style={{ fontSize: 13, color: '#E2E2EC', fontWeight: 600, marginBottom: 4 }}>Delete {entry.is_dir ? 'folder' : 'file'}?</p>
            <p style={{ fontSize: 12, color: '#8888A8', lineHeight: 1.5 }}>
              <code style={{ background: '#111118', padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono,monospace', color: '#EF4444' }}>{entry.name}</code>
              {' '}will be permanently deleted.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ height: 30, padding: '0 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: '#252535', border: '1px solid #252535', color: '#8888A8' }}
            className="hover:!bg-[#2E2E40] transition-colors">Cancel</button>
          <button onClick={onConfirm} style={{ height: 30, padding: '0 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}
            className="hover:!bg-[#3D1515] transition-colors">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── File tree node ────────────────────────────────────────────────────────────

// ─── Flat visible list builder (for keyboard nav) ─────────────────────────────

function buildVisibleList(
  parentPath: string,
  dirCache: Record<string, DirEntry[]>,
  openDirs: Set<string>,
): DirEntry[] {
  const result: DirEntry[] = [];
  for (const e of dirCache[parentPath] ?? []) {
    result.push(e);
    if (e.is_dir && openDirs.has(e.path)) {
      result.push(...buildVisibleList(e.path, dirCache, openDirs));
    }
  }
  return result;
}

// ─── File tree node ────────────────────────────────────────────────────────────

interface TreeNodeProps {
  entry: DirEntry;
  depth: number;
  dirCache: Record<string, DirEntry[]>;
  openDirs: Set<string>;
  loadingDirs: Set<string>;
  renamingPath: string | null;
  renameValue: string;
  focusedPath: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: (entry: DirEntry) => void;
  onRenameCancel: () => void;
  activeFile: string | null;
}

function TreeNode({
  entry, depth, dirCache, openDirs, loadingDirs,
  renamingPath, renameValue, focusedPath,
  onToggleDir, onOpenFile, onContextMenu,
  onRenameChange, onRenameSubmit, onRenameCancel,
  activeFile,
}: TreeNodeProps) {
  const indent    = depth * 12 + 10;
  const isOpen    = openDirs.has(entry.path);
  const isLoading = loadingDirs.has(entry.path);
  const isActive  = activeFile === entry.path;
  const isFocused = focusedPath === entry.path;
  const isRenaming = renamingPath === entry.path;

  const nameCell = isRenaming ? (
    <input
      autoFocus
      value={renameValue}
      onChange={(e) => onRenameChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter')  { e.preventDefault(); onRenameSubmit(entry); }
        if (e.key === 'Escape') { e.preventDefault(); onRenameCancel(); }
      }}
      onBlur={() => onRenameSubmit(entry)}
      onClick={(e) => e.stopPropagation()}
      style={{
        flex: 1, fontSize: 12, background: '#0A0A0F',
        border: '1px solid #6366F1', borderRadius: 3,
        color: '#E2E2EC', padding: '1px 4px', outline: 'none',
        fontFamily: 'inherit',
      }}
    />
  ) : (
    <span style={{ fontSize: 12, color: isActive ? '#E2E2EC' : (entry.is_dir && isOpen ? '#E2E2EC' : '#C0C0D0'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
      {entry.name}
    </span>
  );

  if (entry.is_dir) {
    const children = dirCache[entry.path];
    return (
      <>
        <div
          data-tree-path={entry.path}
          onClick={() => !isRenaming && onToggleDir(entry.path)}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
          style={{
            height: 26, display: 'flex', alignItems: 'center',
            paddingLeft: indent, paddingRight: 8, gap: 4,
            cursor: 'pointer',
            background: isFocused ? '#1E1E2E' : isOpen ? '#18181F' : 'transparent',
            outline: isFocused ? '1px solid #6366F130' : 'none',
            outlineOffset: -1,
            flexShrink: 0, userSelect: 'none',
          }}
          className={!isFocused ? 'hover:bg-[#18181F] transition-colors' : ''}
        >
          {isLoading ? (
            <div style={{ width: 10, height: 10, flexShrink: 0, border: '1.5px solid #252535', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          ) : (
            <Chevron open={isOpen} />
          )}
          <FolderIcon open={isOpen} />
          {nameCell}
        </div>
        {isOpen && children?.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            dirCache={dirCache}
            openDirs={openDirs}
            loadingDirs={loadingDirs}
            renamingPath={renamingPath}
            renameValue={renameValue}
            focusedPath={focusedPath}
            onToggleDir={onToggleDir}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
            onRenameChange={onRenameChange}
            onRenameSubmit={onRenameSubmit}
            onRenameCancel={onRenameCancel}
            activeFile={activeFile}
          />
        ))}
      </>
    );
  }

  return (
    <div
      data-tree-path={entry.path}
      onClick={() => !isRenaming && onOpenFile(entry.path)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
      style={{
        height: 26, display: 'flex', alignItems: 'center',
        paddingLeft: indent + 14, paddingRight: 8, gap: 5,
        cursor: 'pointer',
        background: isActive ? '#1A1A3A' : isFocused ? '#1E1E2E' : 'transparent',
        borderLeft: isActive ? '2px solid #6366F1' : isFocused ? '2px solid #6366F130' : '2px solid transparent',
        outline: 'none',
        flexShrink: 0,
      }}
      className={!isActive && !isFocused ? 'hover:bg-[#18181F] transition-colors' : ''}
    >
      <FileIcon ext={entry.ext} />
      {nameCell}
    </div>
  );
}

// ─── File tree root ────────────────────────────────────────────────────────────

function FileTree({ workspacePath, activeFile, onOpenFile }: {
  workspacePath: string;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
}) {
  const { closeFile } = useAppStore();
  const [dirCache, setDirCache]       = useState<Record<string, DirEntry[]>>({});
  const [openDirs, setOpenDirs]       = useState<Set<string>>(new Set([workspacePath]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());

  // Keyboard focus (separate from active file)
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll focused item into view
  useEffect(() => {
    if (!focusedPath) return;
    const el = containerRef.current?.querySelector(`[data-tree-path="${focusedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedPath]);

  // Context menu
  const [ctxMenu, setCtxMenu]       = useState<CtxMenu | null>(null);
  // Rename
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue]   = useState('');
  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<DirEntry | null>(null);

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

  useEffect(() => {
    setDirCache({});
    setOpenDirs(new Set([workspacePath]));
    loadDir(workspacePath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  const handleToggleDir = useCallback((path: string) => {
    setOpenDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else { next.add(path); loadDir(path); }
      return next;
    });
  }, [loadDir]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const visible = buildVisibleList(workspacePath, dirCache, openDirs);
    if (visible.length === 0) return;
    const idx = focusedPath ? visible.findIndex(v => v.path === focusedPath) : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = idx < visible.length - 1 ? idx + 1 : 0;
        setFocusedPath(visible[next].path);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = idx > 0 ? idx - 1 : visible.length - 1;
        setFocusedPath(visible[prev].path);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const entry = visible[idx];
        if (entry?.is_dir && !openDirs.has(entry.path)) handleToggleDir(entry.path);
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const entry = visible[idx];
        if (!entry) break;
        if (entry.is_dir && openDirs.has(entry.path)) {
          handleToggleDir(entry.path);
        } else {
          const parent = entry.path.substring(0, entry.path.lastIndexOf('/'));
          if (parent && parent !== workspacePath) setFocusedPath(parent);
        }
        break;
      }
      case 'Enter': case ' ': {
        e.preventDefault();
        const entry = visible[idx];
        if (!entry) break;
        if (entry.is_dir) handleToggleDir(entry.path);
        else onOpenFile(entry.path);
        break;
      }
      case 'Home': {
        e.preventDefault();
        setFocusedPath(visible[0].path);
        break;
      }
      case 'End': {
        e.preventDefault();
        setFocusedPath(visible[visible.length - 1].path);
        break;
      }
    }
  }, [workspacePath, dirCache, openDirs, focusedPath, handleToggleDir, onOpenFile]);

  // ── Context menu handlers ──────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: DirEntry) => {
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleCopyPath = useCallback(() => {
    if (!ctxMenu) return;
    navigator.clipboard.writeText(ctxMenu.entry.path);
    setCtxMenu(null);
  }, [ctxMenu]);

  const handleCopyRel = useCallback(() => {
    if (!ctxMenu) return;
    const rel = ctxMenu.entry.path.startsWith(workspacePath + '/')
      ? ctxMenu.entry.path.slice(workspacePath.length + 1)
      : ctxMenu.entry.path;
    navigator.clipboard.writeText(rel);
    setCtxMenu(null);
  }, [ctxMenu, workspacePath]);

  const handleStartRename = useCallback(() => {
    if (!ctxMenu) return;
    setRenamingPath(ctxMenu.entry.path);
    setRenameValue(ctxMenu.entry.name);
    setCtxMenu(null);
  }, [ctxMenu]);

  const handleStartDelete = useCallback(() => {
    if (!ctxMenu) return;
    setDeleteTarget(ctxMenu.entry);
    setCtxMenu(null);
  }, [ctxMenu]);

  // ── Rename submit ──────────────────────────────────────────────────────────
  const handleRenameSubmit = useCallback(async (entry: DirEntry) => {
    const newName = renameValue.trim();
    if (!newName || newName === entry.name) { setRenamingPath(null); return; }

    const parentPath = entry.path.substring(0, entry.path.lastIndexOf('/'));
    const newPath    = parentPath + '/' + newName;

    await renamePath(entry.path, newPath);

    // Update dirCache: replace the entry in its parent
    setDirCache(prev => {
      const updated = { ...prev };
      if (updated[parentPath]) {
        updated[parentPath] = updated[parentPath].map(e =>
          e.path === entry.path
            ? { ...e, name: newName, path: newPath, ext: newName.includes('.') ? newName.split('.').pop() ?? null : null }
            : e
        );
      }
      // If it was a directory and was in the cache, move its children
      if (entry.is_dir && updated[entry.path]) {
        updated[newPath] = updated[entry.path];
        delete updated[entry.path];
      }
      return updated;
    });
    // Update openDirs if renamed dir was open
    if (entry.is_dir) {
      setOpenDirs(prev => {
        if (prev.has(entry.path)) {
          const next = new Set(prev);
          next.delete(entry.path);
          next.add(newPath);
          return next;
        }
        return prev;
      });
    }
    setRenamingPath(null);
  }, [renameValue]);

  // ── Delete confirm ─────────────────────────────────────────────────────────
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deletePath(deleteTarget.path);

    const parentPath = deleteTarget.path.substring(0, deleteTarget.path.lastIndexOf('/'));
    setDirCache(prev => {
      const updated = { ...prev };
      if (updated[parentPath]) {
        updated[parentPath] = updated[parentPath].filter(e => e.path !== deleteTarget.path);
      }
      // Remove children from cache too
      for (const key of Object.keys(updated)) {
        if (key.startsWith(deleteTarget.path + '/') || key === deleteTarget.path) {
          delete updated[key];
        }
      }
      return updated;
    });
    // Close tab if file was open
    if (!deleteTarget.is_dir) closeFile(deleteTarget.path);
    setDeleteTarget(null);
  }, [deleteTarget, closeFile]);

  const rootEntries = dirCache[workspacePath];
  const rootLoading = loadingDirs.has(workspacePath);

  return (
    <>
      {/* Tree content — focusable for keyboard nav */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => setCtxMenu(null)}
        style={{ overflowY: 'auto', flex: 1, outline: 'none' }}
      >
        {rootLoading && (
          <div style={{ padding: '16px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, border: '1.5px solid #252535', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#4A4A65' }}>Loading…</span>
          </div>
        )}
        {!rootLoading && (!rootEntries || rootEntries.length === 0) && (
          <div style={{ padding: '12px', fontSize: 11, color: '#4A4A65' }}>Empty folder</div>
        )}
        {!rootLoading && rootEntries?.map(entry => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            dirCache={dirCache}
            openDirs={openDirs}
            loadingDirs={loadingDirs}
            renamingPath={renamingPath}
            renameValue={renameValue}
            focusedPath={focusedPath}
            onToggleDir={handleToggleDir}
            onOpenFile={onOpenFile}
            onContextMenu={handleContextMenu}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenamingPath(null)}
            activeFile={activeFile}
          />
        ))}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onCopyPath={handleCopyPath}
          onCopyRel={handleCopyRel}
          onRename={handleStartRename}
          onDelete={handleStartDelete}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          entry={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

// ─── Empty workspace state ────────────────────────────────────────────────────

function NoWorkspace({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 16px' }}>
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10a2 2 0 0 1 2-2h7.172a2 2 0 0 1 1.414.586L15 10.172A2 2 0 0 0 16.414 10.757H31a2 2 0 0 1 2 2V28a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10z"/>
      </svg>
      <p style={{ fontSize: 11, color: '#4A4A65', textAlign: 'center', lineHeight: 1.6 }}>No folder open</p>
      <button onClick={onOpen}
        style={{ height: 28, padding: '0 14px', borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#1A1A3A', border: '1px solid #6366F160', color: '#6366F1', transition: 'all 120ms' }}
        className="hover:!bg-[#252552] hover:!border-[#6366F1] transition-all">
        Open Folder
      </button>
      <p style={{ fontSize: 10, color: '#4A4A65', opacity: 0.6, textAlign: 'center' }}>Or drag a folder here</p>
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
    <div style={{ height: 30, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, cursor: 'pointer', flexShrink: 0 }}
      className="hover:bg-[#18181F] transition-colors group">
      <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{meta.svg}</span>
      <span style={{ fontSize: 12, color: '#8888A8', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        className="group-hover:!text-[#E2E2EC] transition-colors">{label}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#4A4A65" strokeWidth="1.5"
        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <line x1="2" y1="6" x2="10" y2="6"/><polyline points="7,3 10,6 7,9"/>
      </svg>
    </div>
  );
}

// ─── Left Panel ────────────────────────────────────────────────────────────────

export function LeftPanel() {
  const { leftPanelOpen, leftPanelWidth, setLeftPanelWidth, activeFile, workspacePath, setWorkspacePath, openFile } = useAppStore();
  if (!leftPanelOpen) return null;

  const folderName = workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() ?? workspacePath : null;

  const handleOpenFolder = async () => {
    const path = await openFolderDialog();
    if (path) setWorkspacePath(path);
  };

  // ── Drag resize (right edge) ───────────────────────────────────────────────
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftPanelWidth;
    document.body.classList.add('resizing');

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(160, Math.min(480, startW + ev.clientX - startX));
      setLeftPanelWidth(next);
    };
    const onUp = () => {
      document.body.classList.remove('resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className="app-left-panel flex flex-col"
      style={{ background: '#111118', borderRight: '1px solid #252535', overflow: 'hidden', flexShrink: 0, position: 'relative' }}
    >
      {/* Drag handle — right edge */}
      <div className="rh" onMouseDown={handleResizeMouseDown} />

      {/* ── Explorer header ────────────────────────────────────────────── */}
      <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 10px', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid #1A1A28' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#4A4A65', letterSpacing: '0.1em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {folderName ?? 'Explorer'}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={handleOpenFolder} title="Open Folder"
            style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
            className="hover:!text-[#E2E2EC] transition-colors">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4a1 1 0 0 1 1-1h2.586a1 1 0 0 1 .707.293L6.414 4.414A1 1 0 0 0 7.121 4.707H11a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z"/>
              <line x1="6.5" y1="6" x2="6.5" y2="9"/><line x1="5" y1="7.5" x2="8" y2="7.5"/>
            </svg>
          </button>
          <button onClick={() => workspacePath && setWorkspacePath(workspacePath + '')} title="Refresh"
            style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
            className="hover:!text-[#E2E2EC] transition-colors">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M11 6.5A4.5 4.5 0 0 1 2 6.5"/><polyline points="2,4 2,6.5 4.5,6.5"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── File tree or empty state ──────────────────────────────────── */}
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

      {/* ── Connected divider ──────────────────────────────────────────── */}
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '#252535' }} />
        <span style={{ fontSize: 9, fontWeight: 600, color: '#4A4A65', letterSpacing: '0.12em', textTransform: 'uppercase', background: '#111118', padding: '0 8px', position: 'relative', zIndex: 1, margin: '0 auto' }}>
          Connected
        </span>
      </div>

      {/* ── Knowledge nodes ────────────────────────────────────────────── */}
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
