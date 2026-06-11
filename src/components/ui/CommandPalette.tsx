import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore, useToast } from "@/store";
import { listAllFiles, gitLog, type DirEntry, type GitCommit } from "@/lib/tauri";
import { listVault, type VaultNote } from "@/lib/vault";
import { loadTasks, type ApexTask } from "@/lib/tasks";
import { loadWorkspaceSymbols, type WorkspaceSymbol } from "@/lib/symbols";
import { THEME_OPTIONS } from "@/components/editor/MonacoEditor";
import { ensureProjectMemory } from "@/lib/workspace";
import { openFolderDialog, createWorkspaceFolder } from "@/lib/tauri";
import { workflowParams } from "@/lib/workflows";
import { runEditorAction } from "@/lib/editorBridge";
import { MentionIcon } from "@/components/ui/Icons";
import { FileGlyph } from "@/lib/fileIcons";

type Source = 'Commands' | 'Files' | 'Knowledge' | 'Git' | 'Tasks' | 'Symbols';

interface AppCommand { id: string; title: string; run: () => void }
interface UResult {
  source: Source;
  id: string;
  title: string;
  detail: string;
  ext?: string | null;
  action: () => void;
}

// ─── Highlight matched chars ──────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <span>{text}</span>;
  return (
    <>
      <span>{text.slice(0, idx)}</span>
      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{text.slice(idx, idx + query.length)}</span>
      <span>{text.slice(idx + query.length)}</span>
    </>
  );
}

// ─── Command Palette ──────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function CommandPalette({ onClose }: Props) {
  const store = useAppStore();
  const { workspacePath, openFile, openFileAt, runInTerminal } = store;
  const { info } = useToast();
  const [query, setQuery]         = useState('');
  const [files, setFiles]         = useState<DirEntry[]>([]);
  const [notes, setNotes]         = useState<VaultNote[]>([]);
  const [commits, setCommits]     = useState<GitCommit[]>([]);
  const [tasks, setTasks]         = useState<ApexTask[]>([]);
  const [symbols, setSymbols]     = useState<WorkspaceSymbol[]>([]);
  const [enabled, setEnabled]     = useState<Record<Source, boolean>>({ Commands: true, Files: true, Knowledge: true, Git: true, Tasks: true, Symbols: true });

  // Executable commands (VS Code's ">" command palette).
  const commands = useMemo<AppCommand[]>(() => {
    const run = (fn: () => void) => () => { fn(); onClose(); };
    const edRun = (id: string) => () => { onClose(); runEditorAction(id); };
    return [
      // ── Editor actions (run on the active editor) ──
      { id: 'e:foldall', title: 'Editor: Fold All', run: edRun('editor.foldAll') },
      { id: 'e:unfoldall', title: 'Editor: Unfold All', run: edRun('editor.unfoldAll') },
      { id: 'e:upper', title: 'Editor: Transform to Uppercase', run: edRun('editor.action.transformToUppercase') },
      { id: 'e:lower', title: 'Editor: Transform to Lowercase', run: edRun('editor.action.transformToLowercase') },
      { id: 'e:title', title: 'Editor: Transform to Title Case', run: edRun('editor.action.transformToTitlecase') },
      { id: 'e:sortasc', title: 'Editor: Sort Lines Ascending', run: edRun('editor.action.sortLinesAscending') },
      { id: 'e:sortdesc', title: 'Editor: Sort Lines Descending', run: edRun('editor.action.sortLinesDescending') },
      { id: 'e:join', title: 'Editor: Join Lines', run: edRun('editor.action.joinLines') },
      { id: 'e:duplicate', title: 'Editor: Duplicate Selection', run: edRun('editor.action.duplicateSelection') },
      { id: 'e:delline', title: 'Editor: Delete Line', run: edRun('editor.action.deleteLines') },
      { id: 'e:indent', title: 'Editor: Indent Lines', run: edRun('editor.action.indentLines') },
      { id: 'e:outdent', title: 'Editor: Outdent Lines', run: edRun('editor.action.outdentLines') },
      { id: 'e:trim', title: 'Editor: Trim Trailing Whitespace', run: edRun('editor.action.trimTrailingWhitespace') },
      { id: 'e:fold', title: 'Editor: Toggle Fold', run: edRun('editor.toggleFold') },
      { id: 'e:organizeimports', title: 'Editor: Organize Imports', run: edRun('editor.action.organizeImports') },
      { id: 'c:terminal', title: 'View: Toggle Terminal', run: run(() => store.toggleTerminal()) },
      { id: 'c:problems', title: 'View: Toggle Problems Panel', run: run(() => store.toggleProblems()) },
      { id: 'c:explorer', title: 'View: Show Explorer', run: run(() => { store.setLeftPanelView('explorer'); if (!store.leftPanelOpen) store.toggleLeftPanel(); }) },
      { id: 'c:search', title: 'View: Show Search', run: run(() => { store.setLeftPanelView('search'); if (!store.leftPanelOpen) store.toggleLeftPanel(); }) },
      { id: 'c:git', title: 'View: Show Source Control', run: run(() => { store.setLeftPanelView('git'); if (!store.leftPanelOpen) store.toggleLeftPanel(); }) },
      { id: 'c:tests', title: 'View: Show Testing', run: run(() => { store.setAppPage('code'); store.setLeftPanelView('tests'); if (!store.leftPanelOpen) store.toggleLeftPanel(); }) },
      { id: 'c:workflows', title: 'View: Show Workflows', run: run(() => { store.setAppPage('code'); store.setLeftPanelView('workflows'); if (!store.leftPanelOpen) store.toggleLeftPanel(); }) },
      ...store.workflows.filter((w) => workflowParams(w.command).length === 0).map((w) => ({ id: 'wf:' + w.id, title: `Run Workflow: ${w.name}`, run: run(() => { store.runInTerminal(w.command); info(`Running: ${w.name}`); }) })),
      { id: 'c:sidebar', title: 'View: Toggle Side Bar', run: run(() => store.toggleLeftPanel()) },
      { id: 'c:zen', title: 'View: Toggle Zen Mode', run: run(() => store.toggleZen()) },
      { id: 'c:split', title: 'View: Split Editor', run: run(() => store.activeFile && store.setRightPaneFile(store.activeFile)) },
      { id: 'c:reopen', title: 'File: Reopen Closed Editor', run: run(() => store.reopenClosedFile()) },
      { id: 'c:openfolder', title: 'File: Open Folder…', run: () => { (async () => { const p = await openFolderDialog(); if (p) { store.setWorkspacePath(p); store.setAppPage('code'); } })(); onClose(); } },
      { id: 'c:newfolder', title: 'File: New Folder…', run: () => { (async () => { const p = await createWorkspaceFolder(); if (p) { store.setWorkspacePath(p); store.setAppPage('code'); } })(); onClose(); } },
      { id: 'c:addfolder', title: 'File: Add Folder to Workspace…', run: () => { (async () => { const p = await openFolderDialog(); if (p) { store.addFolderToWorkspace(p); store.setAppPage('code'); store.setLeftPanelView('explorer'); if (!store.leftPanelOpen) store.toggleLeftPanel(); } })(); onClose(); } },
      { id: 'c:closefolder', title: 'File: Close Folder', run: run(() => { store.setWorkspacePath(null); store.setAppPage('welcome'); }) },
      { id: 'c:settings', title: 'Preferences: Open Settings', run: run(() => store.setSettingsOpen(true)) },
      { id: 'c:shortcuts', title: 'Help: Keyboard Shortcuts', run: run(() => store.setShortcutsOpen(true)) },
      { id: 'c:wrap', title: 'Editor: Toggle Word Wrap', run: run(() => store.setEditorWordWrap(!store.editorWordWrap)) },
      { id: 'c:minimap', title: 'Editor: Toggle Minimap', run: run(() => store.setEditorMinimap(!store.editorMinimap)) },
      { id: 'c:sticky', title: 'Editor: Toggle Sticky Scroll', run: run(() => store.setStickyScroll(!store.stickyScroll)) },
      { id: 'c:guides', title: 'Editor: Toggle Bracket Pair Guides', run: run(() => store.setBracketPairGuides(!store.bracketPairGuides)) },
      { id: 'c:ligatures', title: 'Editor: Toggle Font Ligatures', run: run(() => store.setFontLigatures(!store.fontLigatures)) },
      { id: 'c:whitespace', title: 'Editor: Toggle Render Whitespace', run: run(() => store.setRenderWhitespace(store.renderWhitespace === 'none' ? 'all' : 'none')) },
      { id: 'c:autosave', title: 'Editor: Toggle Auto Save', run: run(() => store.setAutoSave(!store.autoSave)) },
      { id: 'c:formatsave', title: 'Editor: Toggle Format On Save', run: run(() => store.setFormatOnSave(!store.formatOnSave)) },
      { id: 'c:trimws', title: 'Editor: Toggle Trim Trailing Whitespace On Save', run: run(() => store.setTrimTrailingWhitespace(!store.trimTrailingWhitespace)) },
      { id: 'c:finalnl', title: 'Editor: Toggle Insert Final Newline On Save', run: run(() => store.setInsertFinalNewline(!store.insertFinalNewline)) },
      { id: 'c:vim', title: 'Editor: Toggle Vim Mode', run: run(() => store.setVimMode(!store.vimMode)) },
      { id: 'c:autocomplete', title: 'Editor: Toggle Inline AI Autocomplete', run: run(() => store.setAutocompleteEnabled(!store.autocompleteEnabled)) },
      { id: 'c:memory', title: 'AI: Edit Project Memory (APEX.md)', run: () => { (async () => { const ws = store.workspacePath; if (ws) { try { const p = await ensureProjectMemory(ws); store.openFile(p); store.setAppPage('code'); } catch { /* ignore */ } } })(); onClose(); } },
      { id: 'c:cookbook', title: 'Models: Open Cookbook', run: run(() => store.setCookbookOpen(true)) },
      { id: 'c:compare', title: 'Models: Blind Compare', run: run(() => store.setCompareOpen(true)) },
      ...THEME_OPTIONS.map((t) => ({ id: 'theme:' + t.value, title: `Color Theme: ${t.label}`, run: run(() => store.setEditorTheme(t.value)) })),
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  const [selectedIdx, setSelected] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  // Load all sources once
  useEffect(() => {
    const root = workspacePath ?? '/demo-workspace';
    listAllFiles(root).then(setFiles);
    listVault(root).then(setNotes).catch(() => {});
    gitLog(root).then(setCommits).catch(() => {});
    loadTasks(root).then(setTasks).catch(() => {});
    loadWorkspaceSymbols(root).then(setSymbols).catch(() => {});
  }, [workspacePath]);

  // Focus input on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  const relPath = (path: string) => {
    const root = workspacePath ?? '/demo-workspace';
    return path.startsWith(root + '/') ? path.slice(root.length + 1) : path;
  };

  // Unified, grouped results
  const results = useMemo<UResult[]>(() => {
    const raw = query.trim();
    const commandMode = raw.startsWith('>');
    const q = (commandMode ? raw.slice(1) : raw).toLowerCase().trim();
    const out: UResult[] = [];

    // Commands: shown first. In ">" mode, ONLY commands (filtered by the rest).
    if (enabled.Commands && (commandMode || q)) {
      let c = commands.filter((c) => c.title.toLowerCase().includes(q));
      // Empty command mode → surface recently-used commands first (MRU).
      if (commandMode && !q && store.recentCommands.length) {
        const rank = new Map(store.recentCommands.map((id, i) => [id, i]));
        c = [...c].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
      }
      c = c.slice(0, commandMode ? 50 : 8);
      for (const e of c) {
        const recent = commandMode && !q && store.recentCommands.includes(e.id);
        out.push({ source: 'Commands', id: e.id, title: e.title, detail: recent ? 'recently used' : 'command', action: () => { store.pushRecentCommand(e.id); e.run(); } });
      }
    }
    if (commandMode) return out;

    if (enabled.Files) {
      const f = (q ? files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) : files)
        .slice(0, q ? 15 : 25);
      for (const e of f) out.push({ source: 'Files', id: 'f:' + e.path, title: e.name, detail: relPath(e.path), ext: e.ext, action: () => { openFile(e.path); onClose(); } });
    }
    if (enabled.Knowledge && q) {
      const n = notes.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)).slice(0, 10);
      for (const e of n) out.push({ source: 'Knowledge', id: 'k:' + e.path, title: e.title, detail: e.category, action: () => { openFile(e.path); onClose(); } });
    }
    if (enabled.Git && q) {
      const c = commits.filter(c => c.message.toLowerCase().includes(q) || c.hash.startsWith(q)).slice(0, 8);
      for (const e of c) out.push({ source: 'Git', id: 'g:' + e.hash, title: e.message, detail: `${e.hash} · ${e.author}`, action: () => { navigator.clipboard?.writeText(e.hash).catch(() => {}); info(`Copied ${e.hash}`); onClose(); } });
    }
    if (enabled.Tasks) {
      const t = (q ? tasks.filter(t => t.label.toLowerCase().includes(q) || t.command.toLowerCase().includes(q)) : tasks).slice(0, 10);
      for (const e of t) out.push({ source: 'Tasks', id: 't:' + e.label, title: `Run Task: ${e.label}`, detail: e.command, action: () => { runInTerminal(e.command); info(`Running task: ${e.label}`); onClose(); } });
    }
    if (enabled.Symbols && q) {
      const s = symbols.filter(s => s.name.toLowerCase().includes(q)).slice(0, 20);
      for (const e of s) out.push({ source: 'Symbols', id: `s:${e.file}:${e.line}:${e.name}`, title: e.name, detail: `${e.kind} · ${relPath(e.file)}:${e.line}`, action: () => { openFileAt(e.file, e.line, 1); onClose(); } });
    }
    return out;
  }, [query, files, notes, commits, tasks, symbols, commands, enabled, workspacePath]); // eslint-disable-line react-hooks/exhaustive-deps

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
          results[selectedIdx]?.action();
          break;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [results, selectedIdx, onClose, openFile]);

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
            placeholder="Search files, notes, commits…"
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

        {/* Source toggles */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #1A1A28' }}>
          {(['Commands', 'Files', 'Knowledge', 'Git', 'Tasks', 'Symbols'] as Source[]).map(s => (
            <button key={s} onClick={() => setEnabled(e => ({ ...e, [s]: !e[s] }))}
              style={{ height: 20, padding: '0 9px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
                background: enabled[s] ? '#1A1A3A' : 'transparent', border: `1px solid ${enabled[s] ? '#6366F140' : '#252535'}`,
                color: enabled[s] ? 'var(--accent)' : '#4A4A65' }}>
              {s}
            </button>
          ))}
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: '#4A4A65' }}>
              {query ? <>No results for <span style={{ color: '#8888A8' }}>"{query}"</span></> : 'Type to search files, notes and commits'}
            </div>
          )}
          {results.map((entry, i) => {
            const isSelected = i === selectedIdx;
            const showHeader = i === 0 || results[i - 1].source !== entry.source;
            return (
              <div key={entry.id}>
                {showHeader && (
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 14px 3px' }}>{entry.source}</div>
                )}
                <div
                  data-idx={i}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => entry.action()}
                  style={{
                    height: 42, display: 'flex', alignItems: 'center',
                    padding: '0 14px', gap: 10, cursor: 'pointer',
                    background: isSelected ? '#1A1A3A' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'background 60ms',
                  }}
                >
                  {entry.source === 'Files'
                    ? <FileGlyph name={entry.title} size={15} />
                    : <span style={{ width: 15, display: 'flex', justifyContent: 'center', flexShrink: 0, color: entry.source === 'Git' ? '#8888A8' : 'var(--accent)' }}><MentionIcon kind={entry.source === 'Git' ? 'git' : 'knowledge'} size={13} /></span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#E2E2EC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Highlight text={entry.title} query={query} />
                    </div>
                    <div style={{ fontSize: 10, color: '#4A4A65', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {entry.detail}
                    </div>
                  </div>
                  {isSelected && (
                    <kbd style={{ fontSize: 10, color: 'var(--accent)', background: '#1A1A3A', padding: '2px 6px', borderRadius: 3, flexShrink: 0, border: '1px solid #6366F130', fontFamily: 'JetBrains Mono,monospace' }}>
                      ↵
                    </kbd>
                  )}
                </div>
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
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>
  );
}
