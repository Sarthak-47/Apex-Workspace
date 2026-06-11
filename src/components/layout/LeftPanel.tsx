import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAppStore } from "@/store";
import { searchWorkspace, replaceAll, totalMatches, type SearchFileResult } from "@/lib/search";
import {
  listDir, openFolderDialog, openFileDialog, deletePath, renamePath,
  createFile, createDir, revealInExplorer, activateWorkspace, readFile,
  type DirEntry,
} from "@/lib/tauri";
import { listHistory, type HistoryEntry } from "@/lib/history";
import { extractSymbols, type CodeSymbol, type SymbolKind } from "@/lib/symbols";
import { getLang } from "@/components/editor/MonacoEditor";
import { GitPanel } from "@/components/layout/GitPanel";
import { listVault, type VaultNote, type NoteCategory } from "@/lib/vault";
import { CategoryIcon } from "@/components/ui/Icons";
import { FileGlyph } from "@/lib/fileIcons";
import { TestExplorer } from "@/components/layout/TestExplorer";

// ─── File type icon ────────────────────────────────────────────────────────────

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
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}>
      <polyline points="3,2 7,5 3,8"/>
    </svg>
  );
}

// ─── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; entry: DirEntry }

function ContextMenu({ menu, onNewFile, onNewFolder, onCopyPath, onCopyRel, onReveal, onRename, onDelete, onClose }: {
  menu: CtxMenu;
  onNewFile: () => void;
  onNewFolder: () => void;
  onCopyPath: () => void;
  onCopyRel: () => void;
  onReveal: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey   = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent)   => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [onClose]);

  const menuW = 190, menuH = 230;
  const x = Math.min(menu.x, window.innerWidth  - menuW - 4);
  const y = Math.min(menu.y, window.innerHeight - menuH - 4);

  const Item = ({ label, danger, dim, onClick }: { label: string; danger?: boolean; dim?: boolean; onClick: () => void }) => (
    <div onClick={onClick}
      style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 12, cursor: 'pointer',
        color: danger ? '#EF4444' : dim ? '#6868A8' : '#C0C0D0' }}
      className={danger ? 'hover:bg-red-950/40' : 'hover:bg-[#252535]'}>
      {label}
    </div>
  );
  const Sep = () => <div style={{ height: 1, background: '#1A1A28', margin: '3px 0' }} />;

  return (
    <div ref={menuRef}
      style={{ position: 'fixed', left: x, top: y, background: '#18181F', border: '1px solid #252535',
        borderRadius: 7, padding: '3px 0', zIndex: 9999, minWidth: menuW,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
      onClick={e => e.stopPropagation()}>
      <Item label="New File"   onClick={onNewFile} />
      <Item label="New Folder" onClick={onNewFolder} />
      <Sep />
      <Item label="Copy Path"          onClick={onCopyPath} />
      <Item label="Copy Relative Path" onClick={onCopyRel} />
      <Item label="Reveal in Explorer" onClick={onReveal} dim />
      <Sep />
      <Item label="Rename" onClick={onRename} />
      <Item label="Delete" danger onClick={onDelete} />
    </div>
  );
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteDialog({ entry, onConfirm, onCancel }: { entry: DirEntry; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)', background: 'rgba(0,0,0,0.4)' }} onMouseDown={onCancel}>
      <div style={{ background: '#18181F', border: '1px solid #252535', borderRadius: 10, padding: '20px 24px',
        maxWidth: 340, width: '90vw', boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M3 6h14M8 6V4h4v2M19 6l-1 12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2L1 6"/>
            <line x1="10" y1="11" x2="10" y2="15"/><line x1="8" y1="11" x2="8" y2="15"/><line x1="12" y1="11" x2="12" y2="15"/>
          </svg>
          <div>
            <p style={{ fontSize: 13, color: '#E2E2EC', fontWeight: 600, marginBottom: 4 }}>
              Delete {entry.is_dir ? 'folder' : 'file'}?
            </p>
            <p style={{ fontSize: 12, color: '#8888A8', lineHeight: 1.5 }}>
              <code style={{ background: '#111118', padding: '1px 5px', borderRadius: 3, fontFamily: 'JetBrains Mono,monospace', color: '#EF4444' }}>{entry.name}</code>
              {' '}will be permanently deleted.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ height: 30, padding: '0 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: '#252535', border: '1px solid #252535', color: '#8888A8' }}
            className="hover:!bg-[#2E2E40] transition-colors">Cancel</button>
          <button onClick={onConfirm}
            style={{ height: 30, padding: '0 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}
            className="hover:!bg-[#3D1515] transition-colors">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Flat visible list builder (for keyboard nav) ─────────────────────────────

function buildVisibleList(parentPath: string, dirCache: Record<string, DirEntry[]>, openDirs: Set<string>): DirEntry[] {
  const result: DirEntry[] = [];
  for (const e of dirCache[parentPath] ?? []) {
    result.push(e);
    if (e.is_dir && openDirs.has(e.path)) result.push(...buildVisibleList(e.path, dirCache, openDirs));
  }
  return result;
}

// ─── Inline creation input ────────────────────────────────────────────────────

function CreatingInput({ depth, type, value, onChange, onSubmit, onCancel }: {
  depth: number; type: 'file' | 'dir'; value: string;
  onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      height: 26, display: 'flex', alignItems: 'center',
      paddingLeft: depth * 12 + 24, paddingRight: 8, gap: 5, flexShrink: 0,
      background: '#1A1A3A', borderLeft: '2px solid var(--accent)',
    }}>
      {type === 'file'
        ? <FileGlyph name={value || 'x'} />
        : <FolderIcon open={false} />
      }
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); onSubmit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        onBlur={onCancel}
        placeholder={type === 'file' ? 'filename.ext' : 'folder name'}
        style={{
          flex: 1, fontSize: 12, background: 'transparent',
          border: 'none', color: '#E2E2EC', padding: '1px 0',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    </div>
  );
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
  activeFile: string | null;
  creatingIn: { parentPath: string; type: 'file' | 'dir' } | null;
  creatingName: string;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: (entry: DirEntry) => void;
  onRenameCancel: () => void;
  onCreatingChange: (v: string) => void;
  onCreatingSubmit: () => void;
  onCreatingCancel: () => void;
}

function TreeNode({
  entry, depth, dirCache, openDirs, loadingDirs,
  renamingPath, renameValue, focusedPath, activeFile,
  creatingIn, creatingName,
  onToggleDir, onOpenFile, onContextMenu,
  onRenameChange, onRenameSubmit, onRenameCancel,
  onCreatingChange, onCreatingSubmit, onCreatingCancel,
}: TreeNodeProps) {
  const indent     = depth * 12 + 10;
  const isOpen     = openDirs.has(entry.path);
  const isLoading  = loadingDirs.has(entry.path);
  const isActive   = activeFile === entry.path;
  const isFocused  = focusedPath === entry.path;
  const isRenaming = renamingPath === entry.path;

  const nameCell = isRenaming ? (
    <input autoFocus value={renameValue} onChange={e => onRenameChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); onRenameSubmit(entry); }
        if (e.key === 'Escape') { e.preventDefault(); onRenameCancel(); }
      }}
      onBlur={() => onRenameSubmit(entry)}
      onClick={e => e.stopPropagation()}
      style={{ flex: 1, fontSize: 12, background: '#0A0A0F', border: '1px solid var(--accent)', borderRadius: 3,
        color: '#E2E2EC', padding: '1px 4px', outline: 'none', fontFamily: 'inherit' }} />
  ) : (
    <span style={{ fontSize: 12, color: isActive ? '#E2E2EC' : (entry.is_dir && isOpen ? '#E2E2EC' : '#C0C0D0'),
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
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
          onContextMenu={e => { e.preventDefault(); onContextMenu(e, entry); }}
          style={{
            height: 26, display: 'flex', alignItems: 'center',
            paddingLeft: indent, paddingRight: 8, gap: 4, cursor: 'pointer',
            background: isFocused ? '#1E1E2E' : isOpen ? '#18181F' : 'transparent',
            outline: isFocused ? '1px solid #6366F130' : 'none', outlineOffset: -1,
            flexShrink: 0, userSelect: 'none',
          }}
          className={!isFocused ? 'hover:bg-[#18181F] transition-colors' : ''}>
          {isLoading
            ? <div style={{ width: 10, height: 10, flexShrink: 0, border: '1.5px solid #252535', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            : <Chevron open={isOpen} />
          }
          <FolderIcon open={isOpen} />
          {nameCell}
        </div>

        {isOpen && (
          <>
            {children?.map(child => (
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
                activeFile={activeFile}
                creatingIn={creatingIn}
                creatingName={creatingName}
                onToggleDir={onToggleDir}
                onOpenFile={onOpenFile}
                onContextMenu={onContextMenu}
                onRenameChange={onRenameChange}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
                onCreatingChange={onCreatingChange}
                onCreatingSubmit={onCreatingSubmit}
                onCreatingCancel={onCreatingCancel}
              />
            ))}
            {/* Inline creation input at end of this dir's children */}
            {creatingIn?.parentPath === entry.path && (
              <CreatingInput
                depth={depth + 1}
                type={creatingIn.type}
                value={creatingName}
                onChange={onCreatingChange}
                onSubmit={onCreatingSubmit}
                onCancel={onCreatingCancel}
              />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div
      data-tree-path={entry.path}
      onClick={() => !isRenaming && onOpenFile(entry.path)}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, entry); }}
      style={{
        height: 26, display: 'flex', alignItems: 'center',
        paddingLeft: indent + 14, paddingRight: 8, gap: 5, cursor: 'pointer',
        background: isActive ? '#1A1A3A' : isFocused ? '#1E1E2E' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : isFocused ? '2px solid #6366F130' : '2px solid transparent',
        outline: 'none', flexShrink: 0,
      }}
      className={!isActive && !isFocused ? 'hover:bg-[#18181F] transition-colors' : ''}>
      <FileGlyph name={entry.name} />
      {nameCell}
    </div>
  );
}

// ─── File tree root ────────────────────────────────────────────────────────────

function FileTree({
  workspacePath, activeFile, onOpenFile,
  collapseAllSignal, expandAllSignal,
}: {
  workspacePath: string;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
  collapseAllSignal: number;
  expandAllSignal: number;
}) {
  const { closeFile } = useAppStore();
  const [dirCache, setDirCache]       = useState<Record<string, DirEntry[]>>({});
  const [openDirs, setOpenDirs]       = useState<Set<string>>(new Set([workspacePath]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Rename
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue]   = useState('');
  // Context menu
  const [ctxMenu, setCtxMenu]         = useState<CtxMenu | null>(null);
  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<DirEntry | null>(null);
  // Inline creation
  const [creatingIn, setCreatingIn]   = useState<{ parentPath: string; type: 'file' | 'dir' } | null>(null);
  const [creatingName, setCreatingName] = useState('');

  // Scroll focused item into view
  useEffect(() => {
    if (!focusedPath) return;
    const el = containerRef.current?.querySelector(`[data-tree-path="${focusedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedPath]);

  // ── Collapse / expand all signals ────────────────────────────────────────
  useEffect(() => {
    if (collapseAllSignal > 0) setOpenDirs(new Set([workspacePath]));
  }, [collapseAllSignal, workspacePath]);

  useEffect(() => {
    if (expandAllSignal > 0) {
      setOpenDirs(new Set([workspacePath, ...Object.keys(dirCache)]));
    }
  }, [expandAllSignal, workspacePath, dirCache]);

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

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const visible = buildVisibleList(workspacePath, dirCache, openDirs);
    if (visible.length === 0) return;
    const idx = focusedPath ? visible.findIndex(v => v.path === focusedPath) : -1;

    switch (e.key) {
      case 'ArrowDown': { e.preventDefault(); const n = idx < visible.length - 1 ? idx + 1 : 0; setFocusedPath(visible[n].path); break; }
      case 'ArrowUp':   { e.preventDefault(); const p = idx > 0 ? idx - 1 : visible.length - 1; setFocusedPath(visible[p].path); break; }
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
        if (entry.is_dir && openDirs.has(entry.path)) { handleToggleDir(entry.path); }
        else {
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
      case 'Home': { e.preventDefault(); setFocusedPath(visible[0].path); break; }
      case 'End':  { e.preventDefault(); setFocusedPath(visible[visible.length - 1].path); break; }
    }
  }, [workspacePath, dirCache, openDirs, focusedPath, handleToggleDir, onOpenFile]);

  // ── Context menu handlers ─────────────────────────────────────────────────
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

  const handleReveal = useCallback(() => {
    if (!ctxMenu) return;
    revealInExplorer(ctxMenu.entry.path, ctxMenu.entry.is_dir);
    setCtxMenu(null);
  }, [ctxMenu]);

  const handleNewFile = useCallback(() => {
    if (!ctxMenu) return;
    const normalized = ctxMenu.entry.path.replace(/\\/g, '/');
    const parentPath = ctxMenu.entry.is_dir
      ? ctxMenu.entry.path
      : normalized.substring(0, normalized.lastIndexOf('/'));
    if (!openDirs.has(parentPath)) {
      setOpenDirs(prev => new Set(prev).add(parentPath));
      loadDir(parentPath);
    }
    setCreatingIn({ parentPath, type: 'file' });
    setCreatingName('');
    setCtxMenu(null);
  }, [ctxMenu, openDirs, loadDir]);

  const handleNewFolder = useCallback(() => {
    if (!ctxMenu) return;
    const normalized = ctxMenu.entry.path.replace(/\\/g, '/');
    const parentPath = ctxMenu.entry.is_dir
      ? ctxMenu.entry.path
      : normalized.substring(0, normalized.lastIndexOf('/'));
    if (!openDirs.has(parentPath)) {
      setOpenDirs(prev => new Set(prev).add(parentPath));
      loadDir(parentPath);
    }
    setCreatingIn({ parentPath, type: 'dir' });
    setCreatingName('');
    setCtxMenu(null);
  }, [ctxMenu, openDirs, loadDir]);

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

  // ── Inline creation submit ────────────────────────────────────────────────
  const handleCreatingSubmit = useCallback(async () => {
    if (!creatingIn || !creatingName.trim()) { setCreatingIn(null); return; }
    const newPath = creatingIn.parentPath + '/' + creatingName.trim();
    try {
      if (creatingIn.type === 'file') {
        await createFile(newPath);
        // Add to dirCache
        const newEntry: DirEntry = { name: creatingName.trim(), path: newPath, is_dir: false, size: 0, ext: creatingName.includes('.') ? creatingName.split('.').pop() ?? null : null };
        setDirCache(prev => ({ ...prev, [creatingIn.parentPath]: [...(prev[creatingIn.parentPath] ?? []), newEntry] }));
        onOpenFile(newPath);
      } else {
        await createDir(newPath);
        const newEntry: DirEntry = { name: creatingName.trim(), path: newPath, is_dir: true, size: 0, ext: null };
        setDirCache(prev => ({ ...prev, [creatingIn.parentPath]: [...(prev[creatingIn.parentPath] ?? []), newEntry] }));
      }
    } catch { /* silently fail in browser */ }
    setCreatingIn(null);
    setCreatingName('');
  }, [creatingIn, creatingName, onOpenFile]);

  const handleCreatingCancel = useCallback(() => {
    setCreatingIn(null);
    setCreatingName('');
  }, []);

  // ── Rename submit ─────────────────────────────────────────────────────────
  const handleRenameSubmit = useCallback(async (entry: DirEntry) => {
    const newName = renameValue.trim();
    if (!newName || newName === entry.name) { setRenamingPath(null); return; }
    const parentPath = entry.path.substring(0, entry.path.lastIndexOf('/'));
    const newPath    = parentPath + '/' + newName;
    await renamePath(entry.path, newPath);
    setDirCache(prev => {
      const updated = { ...prev };
      if (updated[parentPath]) {
        updated[parentPath] = updated[parentPath].map(e =>
          e.path === entry.path
            ? { ...e, name: newName, path: newPath, ext: newName.includes('.') ? newName.split('.').pop() ?? null : null }
            : e
        );
      }
      if (entry.is_dir && updated[entry.path]) {
        updated[newPath] = updated[entry.path];
        delete updated[entry.path];
      }
      return updated;
    });
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

  // ── Delete confirm ────────────────────────────────────────────────────────
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deletePath(deleteTarget.path);
    const parentPath = deleteTarget.path.substring(0, deleteTarget.path.lastIndexOf('/'));
    setDirCache(prev => {
      const updated = { ...prev };
      if (updated[parentPath]) updated[parentPath] = updated[parentPath].filter(e => e.path !== deleteTarget.path);
      for (const key of Object.keys(updated)) {
        if (key.startsWith(deleteTarget.path + '/') || key === deleteTarget.path) delete updated[key];
      }
      return updated;
    });
    if (!deleteTarget.is_dir) closeFile(deleteTarget.path);
    setDeleteTarget(null);
  }, [deleteTarget, closeFile]);

  const rootEntries = dirCache[workspacePath];
  const rootLoading = loadingDirs.has(workspacePath);

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => setCtxMenu(null)}
        style={{ overflowY: 'auto', flex: 1, outline: 'none' }}>
        {rootLoading && (
          <div style={{ padding: '16px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, border: '1.5px solid #252535', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#4A4A65' }}>Loading…</span>
          </div>
        )}
        {!rootLoading && (!rootEntries || rootEntries.length === 0) && !creatingIn && (
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
            activeFile={activeFile}
            creatingIn={creatingIn}
            creatingName={creatingName}
            onToggleDir={handleToggleDir}
            onOpenFile={onOpenFile}
            onContextMenu={handleContextMenu}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenamingPath(null)}
            onCreatingChange={setCreatingName}
            onCreatingSubmit={handleCreatingSubmit}
            onCreatingCancel={handleCreatingCancel}
          />
        ))}
        {/* Creation at root level */}
        {creatingIn?.parentPath === workspacePath && (
          <CreatingInput
            depth={0}
            type={creatingIn.type}
            value={creatingName}
            onChange={setCreatingName}
            onSubmit={handleCreatingSubmit}
            onCancel={handleCreatingCancel}
          />
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onCopyPath={handleCopyPath}
          onCopyRel={handleCopyRel}
          onReveal={handleReveal}
          onRename={handleStartRename}
          onDelete={handleStartDelete}
          onClose={() => setCtxMenu(null)}
        />
      )}

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

// ─── Empty workspace / Recent workspaces state ────────────────────────────────

// One collapsible root in a multi-root workspace: a folder-name header
// (with a remove action for non-primary roots) wrapping its own FileTree.
function RootSection({
  root, isPrimary, activeFile, onOpenFile, onRemove, collapseAllSignal, expandAllSignal,
}: {
  root: string;
  isPrimary: boolean;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
  onRemove?: () => void;
  collapseAllSignal: number;
  expandAllSignal: number;
}) {
  const [open, setOpen] = useState(true);
  const name = root.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? root;
  return (
    <div>
      <div onClick={() => setOpen((o) => !o)} title={root}
        style={{ height: 24, display: 'flex', alignItems: 'center', gap: 5, padding: '0 6px 0 8px', cursor: 'pointer', position: 'sticky', top: 0, background: '#0E0E15', zIndex: 1 }}
        className="group hover:bg-[#18181F]">
        <Chevron open={open} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#C7C7D9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{name}</span>
        {isPrimary && <span style={{ fontSize: 8.5, color: '#4A4A65', border: '1px solid #2A2A3A', borderRadius: 7, padding: '0 5px', flexShrink: 0 }}>ROOT</span>}
        {onRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove Folder from Workspace"
            className="opacity-0 group-hover:!opacity-100 hover:!text-[#E2776A]"
            style={{ color: '#6A6A85', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', display: 'flex', flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="2" y1="2" x2="9" y2="9"/><line x1="9" y1="2" x2="2" y2="9"/></svg>
          </button>
        )}
      </div>
      {open && (
        <div style={{ minHeight: 0 }}>
          <FileTree
            key={root}
            workspacePath={root}
            activeFile={activeFile}
            onOpenFile={onOpenFile}
            collapseAllSignal={collapseAllSignal}
            expandAllSignal={expandAllSignal}
          />
        </div>
      )}
    </div>
  );
}

function NoWorkspace({ onOpen }: { onOpen: () => void }) {
  const { recentWorkspaces, setWorkspacePath } = useAppStore();
  const folderName = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Open button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '24px 16px 16px' }}>
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10a2 2 0 0 1 2-2h7.172a2 2 0 0 1 1.414.586L15 10.172A2 2 0 0 0 16.414 10.757H31a2 2 0 0 1 2 2V28a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10z"/>
        </svg>
        <p style={{ fontSize: 11, color: '#4A4A65', textAlign: 'center', lineHeight: 1.6 }}>No folder open</p>
        <button onClick={onOpen}
          style={{ height: 28, padding: '0 14px', borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: 'pointer',
            background: '#1A1A3A', border: '1px solid #6366F160', color: 'var(--accent)', transition: 'all 120ms' }}
          className="hover:!bg-[#252552] hover:!border-[var(--accent)] transition-all">
          Open Folder
        </button>
      </div>

      {/* Recent workspaces */}
      {recentWorkspaces.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #1A1A28' }}>
          <div style={{ padding: '8px 10px 4px', fontSize: 9, fontWeight: 600, color: '#4A4A65', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Recent
          </div>
          {recentWorkspaces.map(path => (
            <div key={path}
              onClick={async () => { if (await activateWorkspace(path)) setWorkspacePath(path); }}
              title={path}
              style={{ height: 30, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 7, cursor: 'pointer', flexShrink: 0 }}
              className="hover:bg-[#18181F] transition-colors group">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#F59E0B" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M1 3.5a.8.8 0 0 1 .8-.8h2.07a.8.8 0 0 1 .565.234L5.33 3.83A.8.8 0 0 0 5.9 4.063H10.2a.8.8 0 0 1 .8.8v4.837a.8.8 0 0 1-.8.8H1.8a.8.8 0 0 1-.8-.8V3.5z"/>
              </svg>
              <span style={{ fontSize: 11, color: '#8888A8', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                className="group-hover:!text-[#E2E2EC] transition-colors">
                {folderName(path)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Knowledge node row (live vault data) ─────────────────────────────────────

const CAT_COLOR: Record<NoteCategory, string> = {
  people: '#93C5FD', projects: '#86EFAC', organizations: '#FCD34D',
  decisions: '#C084FC', meetings: '#F9A8D4', topics: '#7DD3FC',
};

function NodeRow({ note, onClick }: { note: VaultNote; onClick: () => void }) {
  return (
    <div onClick={onClick}
      style={{ height: 30, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, cursor: 'pointer', flexShrink: 0 }}
      className="hover:bg-[#18181F] transition-colors group">
      <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: CAT_COLOR[note.category] }}>
        <CategoryIcon cat={note.category} size={14} />
      </span>
      <span style={{ fontSize: 12, color: '#8888A8', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        className="group-hover:!text-[#E2E2EC] transition-colors">{note.title}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#4A4A65" strokeWidth="1.5" className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <line x1="2" y1="6" x2="10" y2="6"/><polyline points="7,3 10,6 7,9"/>
      </svg>
    </div>
  );
}

/** The "Knowledge" section under the file tree — recent vault notes, loaded live. */
function ConnectedNodes({ workspacePath, onOpen }: { workspacePath: string; onOpen: (path: string) => void }) {
  const [notes, setNotes] = useState<VaultNote[]>([]);
  useEffect(() => {
    let cancelled = false;
    listVault(workspacePath)
      .then(all => {
        if (cancelled) return;
        const recent = [...all].sort((a, b) =>
          (b.frontmatter.updated ?? b.frontmatter.created ?? '').localeCompare(a.frontmatter.updated ?? a.frontmatter.created ?? '')
        ).slice(0, 6);
        setNotes(recent);
      })
      .catch(() => setNotes([]));
    return () => { cancelled = true; };
  }, [workspacePath]);

  return (
    <>
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '#252535' }} />
        <span style={{ fontSize: 9, fontWeight: 600, color: '#4A4A65', letterSpacing: '0.12em', textTransform: 'uppercase',
          background: '#111118', padding: '0 8px', position: 'relative', zIndex: 1, margin: '0 auto' }}>
          Knowledge
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {notes.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 10, color: '#4A4A65', lineHeight: 1.5 }}>
            No notes yet. Build a knowledge graph by creating notes or syncing Gmail in the Knowledge panel.
          </div>
        ) : notes.map(n => <NodeRow key={n.path} note={n} onClick={() => onOpen(n.path)} />)}
      </div>
    </>
  );
}

// ─── Search & Replace view (VS Code-style) ────────────────────────────────────

function ToggleBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
        background: active ? '#6366F133' : 'transparent',
        border: active ? '1px solid var(--accent)' : '1px solid transparent',
        color: active ? '#A5B4FC' : '#6A6A85',
      }}
      className={active ? '' : 'hover:!bg-[#1E1E2E]'}>
      {children}
    </button>
  );
}

function MatchLine({ text, start, end, onClick }: { text: string; start: number; end: number; onClick: () => void }) {
  // Trim leading whitespace for display, shifting the highlight range to match.
  const trimmed = text.replace(/^\s+/, '');
  const shift = text.length - trimmed.length;
  const s = Math.max(0, start - shift);
  const e = Math.max(s, end - shift);
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', padding: '2px 8px 2px 26px', cursor: 'pointer', fontSize: 11, whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis', color: '#9A9AB5' }}
      className="hover:bg-[#18181F]">
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {trimmed.slice(0, s)}
        <span style={{ background: '#6366F155', color: '#E2E2EC', borderRadius: 2 }}>{trimmed.slice(s, e)}</span>
        {trimmed.slice(e, e + 200)}
      </span>
    </div>
  );
}

function SearchView() {
  const { workspacePath, openFileAt, addToast } = useAppStore();
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [includes, setIncludes] = useState('');
  const [excludes, setExcludes] = useState('');
  const [results, setResults] = useState<SearchFileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const opts = useMemo(
    () => ({ query, caseSensitive, wholeWord, isRegex, includes, excludes }),
    [query, caseSensitive, wholeWord, isRegex, includes, excludes],
  );

  useEffect(() => {
    if (!workspacePath || !query) { setResults([]); setError(null); setBusy(false); return; }
    let cancel = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchWorkspace(workspacePath, opts);
        if (!cancel) { setResults(r); setError(null); }
      } catch (e) {
        if (!cancel) { setResults([]); setError(e instanceof Error ? e.message : String(e)); }
      } finally { if (!cancel) setBusy(false); }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [opts, workspacePath, query]);

  const fileCount = results.length;
  const matchCount = totalMatches(results);
  const relPath = (p: string) => (workspacePath ? p.replace(workspacePath, '').replace(/^[\\/]/, '') : p);

  const toggleFile = (p: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const doReplaceAll = async () => {
    if (!results.length || !workspacePath) return;
    const n = await replaceAll(results, opts, replace);
    addToast(`Replaced ${n} occurrence${n === 1 ? '' : 's'} across ${results.length} file${results.length === 1 ? '' : 's'}`, 'success');
    try { setResults(await searchWorkspace(workspacePath, opts)); } catch { /* noop */ }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ padding: '8px 8px 6px', flexShrink: 0, display: 'flex', gap: 4 }}>
        {/* Expand/collapse replace row */}
        <button onClick={() => setShowReplace((v) => !v)} title="Toggle Replace"
          style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#6A6A85' }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4"
            style={{ transform: showReplace ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
            <polyline points="3.5,2 6.5,5 3.5,8"/>
          </svg>
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Search input + toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0A0A0F', border: `1px solid ${error ? '#C4422D' : '#252535'}`, borderRadius: 5, padding: '0 6px', height: 28 }}>
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#E2E2EC', fontFamily: 'inherit' }} />
            <ToggleBtn active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title="Match Case">Aa</ToggleBtn>
            <ToggleBtn active={wholeWord} onClick={() => setWholeWord((v) => !v)} title="Match Whole Word">\b</ToggleBtn>
            <ToggleBtn active={isRegex} onClick={() => setIsRegex((v) => !v)} title="Use Regular Expression">.*</ToggleBtn>
          </div>

          {/* Replace input */}
          {showReplace && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#0A0A0F', border: '1px solid #252535', borderRadius: 5, padding: '0 6px', height: 28 }}>
                <input value={replace} onChange={(e) => setReplace(e.target.value)}
                  placeholder="Replace"
                  style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#E2E2EC', fontFamily: 'inherit' }} />
              </div>
              <button onClick={doReplaceAll} disabled={!results.length} title="Replace All"
                style={{ width: 26, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: results.length ? 'pointer' : 'default', background: results.length ? '#1A1A3A' : 'transparent', border: '1px solid #252535', color: results.length ? '#A5B4FC' : '#4A4A65' }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7a5 5 0 0 1 8.5-3.5L12 5"/><polyline points="12,2 12,5 9,5"/><line x1="5" y1="10" x2="11" y2="10"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters toggle */}
      <div style={{ padding: '0 8px 4px 24px', flexShrink: 0 }}>
        <button onClick={() => setShowFilters((v) => !v)}
          style={{ fontSize: 10, color: '#6A6A85', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          className="hover:!text-[#A5B4FC]">
          {showFilters ? '▾' : '▸'} files to include / exclude
        </button>
        {showFilters && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <input value={includes} onChange={(e) => setIncludes(e.target.value)} placeholder="include e.g. *.ts, src/**"
              style={{ background: '#0A0A0F', border: '1px solid #252535', borderRadius: 5, padding: '4px 8px', fontSize: 11, color: '#E2E2EC', outline: 'none' }} />
            <input value={excludes} onChange={(e) => setExcludes(e.target.value)} placeholder="exclude e.g. *.test.ts"
              style={{ background: '#0A0A0F', border: '1px solid #252535', borderRadius: 5, padding: '4px 8px', fontSize: 11, color: '#E2E2EC', outline: 'none' }} />
          </div>
        )}
      </div>

      {/* Summary */}
      <div style={{ padding: '2px 10px 6px', fontSize: 10, color: '#6A6A85', flexShrink: 0 }}>
        {!workspacePath ? 'Open a folder to search'
          : error ? <span style={{ color: '#E2776A' }}>{error}</span>
          : busy ? 'Searching…'
          : query ? `${matchCount} result${matchCount === 1 ? '' : 's'} in ${fileCount} file${fileCount === 1 ? '' : 's'}`
          : 'Type to search across files'}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {results.map((file) => {
          const isCollapsed = collapsed.has(file.path);
          return (
            <div key={file.path}>
              <div onClick={() => toggleFile(file.path)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', cursor: 'pointer', position: 'sticky', top: 0, background: '#0D0D14' }}
                className="hover:bg-[#16161F]">
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#6A6A85" strokeWidth="1.4"
                  style={{ flexShrink: 0, transform: isCollapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.1s' }}>
                  <polyline points="3.5,2 6.5,5 3.5,8"/>
                </svg>
                <FileGlyph name={file.path.split('/').pop() ?? ''} />
                <span style={{ fontSize: 11, color: '#C7C7D9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.path.split('/').pop()}
                </span>
                <span style={{ fontSize: 10, color: '#6A6A85', flexShrink: 0 }} title={relPath(file.path)}>{file.matches.length}</span>
              </div>
              {!isCollapsed && file.matches.map((m, i) => (
                <MatchLine key={i} text={m.text} start={m.start} end={m.end}
                  onClick={() => openFileAt(file.path, m.line, m.start + 1)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Open Editors (currently open tabs) ───────────────────────────────────────

function OpenEditors() {
  const { openFiles, activeFile, unsavedFiles, setActiveFile, closeFile, closeAllFiles } = useAppStore();
  const [open, setOpen] = useState(true);
  if (openFiles.length === 0) return null;

  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid #1A1A28', display: 'flex', flexDirection: 'column', maxHeight: 160, overflow: 'hidden' }}>
      <div onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}
        className="hover:bg-[#16161F] group">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#6A6A85" strokeWidth="1.4"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s' }}>
          <polyline points="3.5,2 6.5,5 3.5,8" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#6A6A85', letterSpacing: '0.1em' }}>OPEN EDITORS</span>
        <span style={{ fontSize: 10, color: '#4A4A65', marginLeft: 'auto' }}>{openFiles.length}</span>
        <button onClick={(e) => { e.stopPropagation(); closeAllFiles(); }} title="Close all editors"
          style={{ opacity: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#6A6A85', padding: 0, display: 'flex' }}
          className="group-hover:!opacity-100">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="2" y1="2" x2="9" y2="9" /><line x1="9" y1="2" x2="2" y2="9" /></svg>
        </button>
      </div>
      {open && (
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {openFiles.map((path) => {
            const name = path.split(/[\\/]/).pop() ?? path;
            const active = path === activeFile;
            const unsaved = unsavedFiles.includes(path);
            return (
              <div key={path} onClick={() => setActiveFile(path)} title={path}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px 2px 22px', cursor: 'pointer', background: active ? '#1A1A3A' : 'transparent' }}
                className="hover:bg-[#18181F] group/oe">
                <FileGlyph name={name} />
                <span style={{ fontSize: 11, color: active ? '#E2E2EC' : '#9A9AB5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                {unsaved && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />}
                <button onClick={(e) => { e.stopPropagation(); closeFile(path); }} title="Close"
                  style={{ opacity: unsaved ? 0 : 0, background: 'none', border: 'none', cursor: 'pointer', color: '#6A6A85', padding: 0, display: 'flex', width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}
                  className="group-hover/oe:!opacity-100">
                  <svg width="9" height="9" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="2" x2="9" y2="9" /><line x1="9" y1="2" x2="2" y2="9" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Outline (symbols for the active file) ────────────────────────────────────

const SYMBOL_COLOR: Record<SymbolKind, string> = {
  class: '#EE9D28', interface: 'var(--accent)', function: '#B180D7', method: '#B180D7',
  type: '#4EC9B0', enum: '#EE9D28', struct: '#EE9D28', trait: 'var(--accent)',
  constant: '#4FC1FF', heading: '#8888A8',
};
const SYMBOL_GLYPH: Record<SymbolKind, string> = {
  class: 'C', interface: 'I', function: 'ƒ', method: 'm', type: 'T',
  enum: 'E', struct: 'S', trait: 'R', constant: 'K', heading: '#',
};

function Outline({ activeFile }: { activeFile: string | null }) {
  const { unsavedFiles, openFileAt } = useAppStore();
  const [open, setOpen] = useState(true);
  const [symbols, setSymbols] = useState<CodeSymbol[]>([]);
  const [filter, setFilter] = useState('');
  const saved = !unsavedFiles.includes(activeFile ?? '');

  useEffect(() => {
    if (!activeFile) { setSymbols([]); return; }
    let cancel = false;
    readFile(activeFile)
      .then((text) => { if (!cancel) setSymbols(extractSymbols(text, getLang(activeFile))); })
      .catch(() => { if (!cancel) setSymbols([]); });
    return () => { cancel = true; };
  }, [activeFile, saved]);

  if (!activeFile) return null;
  const q = filter.toLowerCase();
  const shown = q ? symbols.filter((s) => s.name.toLowerCase().includes(q)) : symbols;

  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid #1A1A28', display: 'flex', flexDirection: 'column', maxHeight: 220, overflow: 'hidden' }}>
      <div onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}
        className="hover:bg-[#16161F]">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#6A6A85" strokeWidth="1.4"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s' }}>
          <polyline points="3.5,2 6.5,5 3.5,8" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#6A6A85', letterSpacing: '0.1em' }}>OUTLINE</span>
        <span style={{ fontSize: 10, color: '#4A4A65', marginLeft: 'auto' }}>{symbols.length || ''}</span>
      </div>
      {open && (
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {symbols.length === 0 ? (
            <div style={{ fontSize: 10, color: '#4A4A65', padding: '4px 10px 8px 24px' }}>No symbols found.</div>
          ) : (
            <>
              {symbols.length > 8 && (
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter symbols…"
                  style={{ margin: '2px 10px 4px 24px', width: 'calc(100% - 40px)', background: '#0A0A0F', border: '1px solid #252535', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#E2E2EC', outline: 'none' }} />
              )}
              {shown.map((s, i) => (
                <div key={i}
                  onClick={() => openFileAt(activeFile, s.line, 1)}
                  title={`${s.kind} · line ${s.line}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 10px 2px 24px', cursor: 'pointer', fontSize: 11 }}
                  className="hover:bg-[#18181F]">
                  <span style={{ width: 13, height: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: SYMBOL_COLOR[s.kind], background: `${SYMBOL_COLOR[s.kind]}22`, borderRadius: 2 }}>
                    {SYMBOL_GLYPH[s.kind]}
                  </span>
                  <span style={{ color: '#C7C7D9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ color: '#3A3A4D', fontSize: 9 }}>{s.line}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Timeline / local file history ────────────────────────────────────────────

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function Timeline({ activeFile }: { activeFile: string | null }) {
  const { unsavedFiles, setPendingDiffReview, setPendingFileEdit, addToast } = useAppStore();
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const saved = !unsavedFiles.includes(activeFile ?? '');

  useEffect(() => {
    if (!activeFile) { setEntries([]); return; }
    let cancel = false;
    listHistory(activeFile).then((h) => { if (!cancel) setEntries(h); });
    return () => { cancel = true; };
  }, [activeFile, saved]);

  if (!activeFile) return null;
  const fileName = activeFile.split(/[\\/]/).pop() ?? activeFile;

  const compare = async (e: HistoryEntry) => {
    const current = await readFile(activeFile).catch(() => e.content);
    setPendingDiffReview({
      path: activeFile, original: e.content, proposed: current,
      mode: 'compare', originalLabel: relTime(e.ts), modifiedLabel: 'Current',
    });
  };
  const restore = (e: HistoryEntry, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setPendingFileEdit({ path: activeFile, content: e.content });
    addToast(`Restored version from ${relTime(e.ts)} — Ctrl+S to save`, 'success');
  };

  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid #1A1A28', display: 'flex', flexDirection: 'column', maxHeight: 180, overflow: 'hidden' }}>
      <div onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', cursor: 'pointer', flexShrink: 0 }}
        className="hover:bg-[#16161F]">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#6A6A85" strokeWidth="1.4"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s' }}>
          <polyline points="3.5,2 6.5,5 3.5,8" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#6A6A85', letterSpacing: '0.1em' }}>TIMELINE</span>
        <span style={{ fontSize: 10, color: '#4A4A65', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }} title={fileName}>{fileName}</span>
      </div>
      {open && (
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {entries.length === 0 ? (
            <div style={{ fontSize: 10, color: '#4A4A65', padding: '4px 10px 8px 24px' }}>No saved versions yet.</div>
          ) : entries.map((e, i) => (
            <div key={e.ts}
              onClick={() => compare(e)}
              title="Compare with current"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 24px', cursor: 'pointer', fontSize: 11 }}
              className="hover:bg-[#18181F] group">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
                <circle cx="7" cy="7" r="5.5" /><polyline points="7,4 7,7 9.5,8.5" />
              </svg>
              <span style={{ color: '#C7C7D9', flex: 1 }}>{i === 0 ? 'Latest' : relTime(e.ts)}</span>
              <span style={{ color: '#4A4A65', fontSize: 9 }}>{(e.size / 1024).toFixed(1)}K</span>
              <button onClick={(ev) => restore(e, ev)} title="Restore this version"
                style={{ opacity: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#6A6A85', padding: 0, display: 'flex' }}
                className="group-hover:!opacity-100">
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7a5 5 0 1 1 1.5 3.5" /><polyline points="2,11 2,7.5 5.5,7.5" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Left Panel ────────────────────────────────────────────────────────────────

export function LeftPanel() {
  const {
    leftPanelOpen, leftPanelWidth, setLeftPanelWidth,
    leftPanelView,
    activeFile, workspacePath, setWorkspacePath, openFile,
    workspaceFolders, addFolderToWorkspace, removeFolderFromWorkspace,
  } = useAppStore();
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandSignal, setExpandSignal]     = useState(0);

  if (!leftPanelOpen) return null;

  const folderName = workspacePath ? workspacePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? workspacePath : null;

  const handleOpenFolder = async () => {
    const path = await openFolderDialog();
    if (path) setWorkspacePath(path);
  };

  const handleOpenFile = async () => {
    const path = await openFileDialog();
    if (path) openFile(path);
  };

  const handleAddFolder = async () => {
    const path = await openFolderDialog();
    if (path) addFolderToWorkspace(path);
  };

  const roots = workspacePath ? [workspacePath, ...workspaceFolders] : [];
  const multiRoot = roots.length > 1;

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
    <div className="app-left-panel flex flex-col"
      style={{ background: '#111118', borderRight: '1px solid #252535', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
      <div className="rh" onMouseDown={handleResizeMouseDown} />

      {/* ── View-specific header ──────────────────────────────────────── */}
      {leftPanelView === 'explorer' && (
        <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 6px 0 10px', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid #1A1A28' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#4A4A65', letterSpacing: '0.1em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            {folderName ?? 'Explorer'}
          </span>
          <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <button title="Expand all" onClick={() => setExpandSignal(s => s + 1)}
              style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 3, lineHeight: 1, borderRadius: 3 }}
              className="hover:!text-[#E2E2EC] hover:bg-white/5 transition-colors">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3,1 1,3 3,5"/><polyline points="10,1 12,3 10,5"/>
                <polyline points="3,8 1,10 3,12"/><polyline points="10,8 12,10 10,12"/>
              </svg>
            </button>
            <button title="Collapse all" onClick={() => setCollapseSignal(s => s + 1)}
              style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 3, lineHeight: 1, borderRadius: 3 }}
              className="hover:!text-[#E2E2EC] hover:bg-white/5 transition-colors">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="3" x2="11" y2="3"/>
                <line x1="2" y1="6.5" x2="11" y2="6.5"/>
                <line x1="2" y1="10" x2="11" y2="10"/>
              </svg>
            </button>
            <button onClick={() => workspacePath && setWorkspacePath(workspacePath + '')} title="Refresh"
              style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 3, lineHeight: 1, borderRadius: 3 }}
              className="hover:!text-[#E2E2EC] hover:bg-white/5 transition-colors">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M11 6.5A4.5 4.5 0 0 1 2 6.5"/><polyline points="2,4 2,6.5 4.5,6.5"/>
              </svg>
            </button>
            <button onClick={handleOpenFile} title="Open File"
              style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 3, lineHeight: 1, borderRadius: 3 }}
              className="hover:!text-[#E2E2EC] hover:bg-white/5 transition-colors">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 1H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.5z"/>
                <polyline points="7.5,1 7.5,4.5 11,4.5"/>
              </svg>
            </button>
            <button onClick={handleOpenFolder} title="Open Folder"
              style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 3, lineHeight: 1, borderRadius: 3 }}
              className="hover:!text-[#E2E2EC] hover:bg-white/5 transition-colors">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4a1 1 0 0 1 1-1h2.586a1 1 0 0 1 .707.293L6.414 4.414A1 1 0 0 0 7.121 4.707H11a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z"/>
                <line x1="6.5" y1="6" x2="6.5" y2="9"/><line x1="5" y1="7.5" x2="8" y2="7.5"/>
              </svg>
            </button>
            {workspacePath && (
              <button onClick={handleAddFolder} title="Add Folder to Workspace"
                style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 3, lineHeight: 1, borderRadius: 3 }}
                className="hover:!text-[#E2E2EC] hover:bg-white/5 transition-colors">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4a1 1 0 0 1 1-1h2.586a1 1 0 0 1 .707.293L6.414 4.414A1 1 0 0 0 7.121 4.707H11"/>
                  <line x1="10.5" y1="6" x2="10.5" y2="11"/><line x1="8" y1="8.5" x2="13" y2="8.5"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Git view ──────────────────────────────────────────────────── */}
      {leftPanelView === 'git' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <GitPanel />
        </div>
      )}

      {/* ── Search view ───────────────────────────────────────────────── */}
      {leftPanelView === 'search' && <SearchView />}

      {/* ── Testing view ──────────────────────────────────────────────── */}
      {leftPanelView === 'tests' && <TestExplorer />}

      {/* ── Explorer view ─────────────────────────────────────────────── */}
      {leftPanelView === 'explorer' && (
        <>
          <OpenEditors />
          <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {roots.length === 0 ? (
              <NoWorkspace onOpen={handleOpenFolder} />
            ) : multiRoot ? (
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {roots.map((root, i) => (
                  <RootSection
                    key={root}
                    root={root}
                    isPrimary={i === 0}
                    activeFile={activeFile}
                    onOpenFile={openFile}
                    onRemove={i === 0 ? undefined : () => removeFolderFromWorkspace(root)}
                    collapseAllSignal={collapseSignal}
                    expandAllSignal={expandSignal}
                  />
                ))}
              </div>
            ) : (
              <FileTree
                key={roots[0]}
                workspacePath={roots[0]}
                activeFile={activeFile}
                onOpenFile={openFile}
                collapseAllSignal={collapseSignal}
                expandAllSignal={expandSignal}
              />
            )}
          </div>

          {/* Knowledge nodes — live vault data */}
          {workspacePath && <ConnectedNodes workspacePath={workspacePath} onOpen={openFile} />}

          {/* Outline — symbols for the active file */}
          <Outline activeFile={activeFile} />

          {/* Timeline — local file history for the active file */}
          <Timeline activeFile={activeFile} />
        </>
      )}
    </div>
  );
}
