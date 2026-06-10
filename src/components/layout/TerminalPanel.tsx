import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useAppStore } from "@/store";
import { isTauri } from "@/lib/tauri";

// ─── xterm theme ──────────────────────────────────────────────────────────────
const APEX_THEME = {
  background:          '#090910',
  foreground:          '#C0C0D0',
  cursor:              'var(--accent)',
  cursorAccent:        '#090910',
  selectionBackground: '#25255280',
  black:               '#090910', brightBlack:   '#252535',
  red:                 '#EF4444', brightRed:     '#F87171',
  green:               '#22C55E', brightGreen:   '#4ADE80',
  yellow:              '#F59E0B', brightYellow:  '#FCD34D',
  blue:                '#3B82F6', brightBlue:    'var(--accent)',
  magenta:             '#A78BFA', brightMagenta: '#C084FC',
  cyan:                '#06B6D4', brightCyan:    '#67E8F9',
  white:               '#C0C0D0', brightWhite:   '#E2E2EC',
};

const TERM_OPTIONS = {
  theme:             APEX_THEME,
  fontFamily:        '"JetBrains Mono", "Cascadia Code", "Consolas", monospace',
  fontSize:          13,
  lineHeight:        1.6,
  cursorBlink:       true,
  cursorStyle:       'bar' as const,
  scrollback:        10000,
  convertEol:        true,
  allowTransparency: false,
};

// ─── ANSI color helpers ───────────────────────────────────────────────────────
const C = {
  red:    (s: string) => `\x1b[38;2;239;68;68m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[38;2;34;197;94m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[38;2;245;158;11m${s}\x1b[0m`,
  blue:   (s: string) => `\x1b[38;2;99;102;241m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[38;2;6;182;212m${s}\x1b[0m`,
  grey:   (s: string) => `\x1b[38;2;136;136;168m${s}\x1b[0m`,
  white:  (s: string) => `\x1b[38;2;226;226;236m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[22m`,
  dir:    (s: string) => `\x1b[1;38;2;6;182;212m${s}\x1b[0m`,
};

// ─── Mock shell ───────────────────────────────────────────────────────────────
const MOCK_FS: Record<string, string[]> = {
  '/demo-workspace': ['src/', 'public/', 'src-tauri/', 'package.json', 'tsconfig.json', 'vite.config.ts', '.gitignore', 'README.md'],
  '/demo-workspace/src': ['components/', 'editor/', 'lib/', 'store/', 'App.tsx', 'main.tsx', 'index.css'],
  '/demo-workspace/src/components': ['layout/', 'ui/'],
  '/demo-workspace/src/components/layout': ['CenterArea.tsx', 'IntelPanel.tsx', 'LeftNav.tsx', 'LeftPanel.tsx', 'ModeBar.tsx', 'StatusBar.tsx', 'TerminalPanel.tsx', 'Titlebar.tsx'],
  '/demo-workspace/src/components/ui': ['CommandPalette.tsx', 'Toaster.tsx'],
  '/demo-workspace/src/lib': ['tauri.ts', 'ollama.ts'],
  '/demo-workspace/src/store': ['index.ts'],
  '/demo-workspace/public': ['apex-logo.svg'],
  '/demo-workspace/src-tauri': ['src/', 'Cargo.toml', 'tauri.conf.json'],
  '/demo-workspace/src-tauri/src': ['lib.rs', 'main.rs', 'terminal.rs', 'git.rs'],
};

function buildPrompt(cwd: string) {
  const display = cwd.replace('/demo-workspace', '~') || '~';
  return `${C.blue('APEX')} ${C.grey(display)} ${C.green('main')}\x1b[38;2;226;226;236m $\x1b[0m `;
}

function execMockCmd(raw: string, cwdRef: { current: string }, term: Terminal) {
  const parts = raw.trim().split(/\s+/);
  const cmd = parts[0], args = parts.slice(1);
  const cwd = cwdRef.current;
  const W = (s: string) => term.writeln(s);

  switch (cmd) {
    case '': return;
    case 'help':
      W(''); W(`  \x1b[1mAPEX Mock Shell\x1b[0m  ${C.grey('browser mode')}`); W('');
      W(`  ${C.cyan('ls')} ${C.cyan('cd')} ${C.cyan('pwd')} ${C.cyan('clear')} ${C.cyan('echo')} ${C.cyan('cat')} ${C.cyan('git')} ${C.cyan('node')} ${C.cyan('npm')} ${C.cyan('rustc')} ${C.cyan('cargo')}`);
      W(''); W(C.dim(C.grey('  ↑/↓ history  ·  Tab complete  ·  Ctrl+C  ·  Ctrl+L clear'))); W(''); return;
    case 'clear': term.clear(); return;
    case 'pwd': W(cwd); return;
    case 'ls': {
      const target = args.find(a => !a.startsWith('-'))
        ? (args.find(a => !a.startsWith('-'))!.startsWith('/') ? args.find(a => !a.startsWith('-'))! : `${cwd}/${args.find(a => !a.startsWith('-'))}`)
        : cwd;
      const entries = MOCK_FS[target];
      if (!entries) { W(C.red(`ls: ${target}: No such file or directory`)); return; }
      W(entries.map(e => e.endsWith('/') ? C.dir(e) : C.white(e)).join('  '));
      return;
    }
    case 'cd': {
      const t = args[0] ?? '~';
      if (!t || t === '~') { cwdRef.current = '/demo-workspace'; return; }
      if (t === '.') return;
      if (t === '..') {
        const segs = cwd.split('/').filter(Boolean); segs.pop();
        cwdRef.current = segs.length >= 2 ? '/' + segs.join('/') : '/demo-workspace'; return;
      }
      const abs = t.startsWith('/') ? t : `${cwd}/${t}`.replace(/\/+/g, '/');
      if (MOCK_FS[abs] !== undefined) { cwdRef.current = abs; return; }
      W(C.red(`cd: ${t}: No such file or directory`)); return;
    }
    case 'echo': W(args.join(' ')); return;
    case 'git': {
      const sub = args[0];
      if (sub === 'status') { W(`On branch ${C.green('main')}`); W(C.green('nothing to commit, working tree clean')); }
      else if (sub === 'log') W(`${C.yellow('e3ac196')} feat: persist open tabs`);
      else if (sub === 'branch') W(`* ${C.green('main')}`);
      else W(C.grey(`git: '${sub}' — try: status, log, branch`));
      return;
    }
    case 'node': W(args[0] === '-v' || args[0] === '--version' ? 'v22.14.0' : C.grey('node: use Tauri mode for REPL')); return;
    case 'npm':  W(args[0] === '-v' || args[0] === '--version' ? '10.9.2'   : C.grey('npm: limited in browser mode'));  return;
    case 'rustc': W(args[0] === '-V' ? 'rustc 1.83.0' : C.grey('rustc: needs Tauri mode')); return;
    case 'cargo': W(args[0] === '-V' ? 'cargo 1.83.0' : C.grey('cargo: needs Tauri mode')); return;
    case 'whoami': W('user'); return;
    case 'date':   W(new Date().toLocaleString()); return;
    case 'exit':   W(C.grey('exit: use × to close this tab')); return;
    default: W(C.red(`${cmd}: command not found`) + C.dim(C.grey('  (browser mock)')));
  }
}

function setupMockShell(term: Terminal, fitAddon: FitAddon, writer?: Writer): () => void {
  const cwdRef = { current: '/demo-workspace' };
  let line = '';
  if (writer) writer.current = (data: string) => {
    const cmd = data.replace(/[\r\n]+$/, '').trim();
    term.write('\r\n'); if (cmd) execMockCmd(cmd, cwdRef, term); term.write(buildPrompt(cwdRef.current));
  };
  const history: string[] = [];
  let histIdx = -1;

  fitAddon.fit();

  term.writeln(`${C.blue('▸')} \x1b[1mAPEX Terminal\x1b[0m  ${C.grey('browser preview · start in Tauri for real shell')}`);
  term.writeln(C.grey(`  Type ${C.yellow('help')} for commands`) + C.dim(C.grey('  ·  ↑/↓ history  ·  Ctrl+L clear')));
  term.write(buildPrompt(cwdRef.current));

  const disposable = term.onKey(({ key, domEvent: ev }) => {
    if (ev.ctrlKey && !ev.altKey && !ev.metaKey) {
      if (ev.key === 'c') { term.write(`${C.grey('^C')}\r\n` + buildPrompt(cwdRef.current)); line = ''; histIdx = -1; return; }
      if (ev.key === 'l') { term.clear(); term.write(buildPrompt(cwdRef.current)); return; }
      if (ev.key === 'u') { line = ''; term.write('\r' + buildPrompt(cwdRef.current) + '\x1b[K'); return; }
      return;
    }
    if (ev.altKey || ev.metaKey) return;
    switch (ev.key) {
      case 'Enter': {
        const cmd = line.trim();
        term.write('\r\n');
        if (cmd) { history.unshift(cmd); if (history.length > 200) history.pop(); histIdx = -1; execMockCmd(cmd, cwdRef, term); }
        line = '';
        term.write(buildPrompt(cwdRef.current));
        return;
      }
      case 'Backspace':
        if (line.length > 0) { line = line.slice(0, -1); term.write('\b \b'); } return;
      case 'Tab': {
        ev.preventDefault?.();
        if (!line) return;
        const entries = MOCK_FS[cwdRef.current] ?? [];
        const word = line.split(/\s+/).pop() ?? '';
        const m = entries.filter(e => e.startsWith(word));
        if (m.length === 1) { const rest = m[0].slice(word.length); line += rest; term.write(rest); }
        else if (m.length > 1) { term.write('\r\n' + m.join('  ') + '\r\n' + buildPrompt(cwdRef.current) + line); }
        return;
      }
      case 'ArrowUp':
        if (history.length === 0) return;
        histIdx = Math.min(histIdx + 1, history.length - 1);
        line = history[histIdx];
        term.write('\r' + buildPrompt(cwdRef.current) + '\x1b[K' + line); return;
      case 'ArrowDown':
        if (histIdx <= 0) { histIdx = -1; line = ''; term.write('\r' + buildPrompt(cwdRef.current) + '\x1b[K'); return; }
        histIdx--;
        line = history[histIdx];
        term.write('\r' + buildPrompt(cwdRef.current) + '\x1b[K' + line); return;
      case 'ArrowLeft': case 'ArrowRight': case 'Home': case 'End':
      case 'PageUp': case 'PageDown': case 'Insert': case 'Delete': case 'Escape': return;
    }
    if (key.length === 1 && key.charCodeAt(0) >= 32) { line += key; term.write(key); }
  });

  return () => { disposable.dispose(); };
}

type Writer = { current: ((data: string) => void) | null };

async function setupRealPty(
  term: Terminal,
  fitAddon: FitAddon,
  cwd: string,
  writer?: Writer,
): Promise<() => void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen }  = await import('@tauri-apps/api/event');

  let ptyId: string | null = null;
  let cancelled = false;
  const unlisteners: Array<() => void> = [];

  try {
    const shellPref = useAppStore.getState().terminalShell;
    ptyId = await invoke<string>('create_pty', { shell: shellPref && shellPref !== 'auto' ? shellPref : null, cwd });
    if (cancelled) { await invoke('close_pty', { ptyId }); return () => {}; }

    unlisteners.push(
      await listen<string>(`pty-output-${ptyId}`, e => term.write(e.payload)),
      await listen(`pty-exit-${ptyId}`, () => {
        term.writeln('\r\n\x1b[38;2;100;100;130m[Process completed]\x1b[0m');
      }),
    );

    term.onData(data => {
      if (ptyId) invoke('write_pty', { ptyId, data }).catch(() => {});
    });

    term.onResize(({ cols, rows }) => {
      if (ptyId) invoke('resize_pty', { ptyId, cols, rows }).catch(() => {});
    });

    fitAddon.fit();
    invoke('resize_pty', { ptyId, cols: term.cols, rows: term.rows }).catch(() => {});

    if (writer) writer.current = (data: string) => { if (ptyId) invoke('write_pty', { ptyId, data }).catch(() => {}); };

  } catch (err) {
    term.writeln(`\r\n\x1b[31mFailed to start PTY: ${err}\x1b[0m`);
  }

  return () => {
    cancelled = true;
    for (const u of unlisteners) u();
    if (ptyId) import('@tauri-apps/api/core').then(({ invoke: inv }) => inv('close_pty', { ptyId }).catch(() => {}));
  };
}

// ─── Single terminal pane ─────────────────────────────────────────────────────

function XtermPane({ visible, workspacePath }: { visible: boolean; workspacePath: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef       = useRef<FitAddon | null>(null);
  const writerRef    = useRef<((data: string) => void) | null>(null);
  const [ready, setReady] = useState(false);
  const { terminalCommand, clearTerminalCommand } = useAppStore();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term        = new Terminal(TERM_OPTIONS);
    const fitAddon    = new FitAddon();
    const linksAddon  = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(linksAddon);
    term.open(el);
    fitRef.current = fitAddon;

    let cleanupFn: (() => void) | null = null;

    if (isTauri()) {
      setupRealPty(term, fitAddon, workspacePath ?? '.', writerRef).then(fn => { cleanupFn = fn; setReady(true); });
    } else {
      cleanupFn = setupMockShell(term, fitAddon, writerRef);
      setReady(true);
    }

    return () => {
      cleanupFn?.();
      writerRef.current = null;
      term.dispose();
      fitRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Consume a queued task/command — only the active (visible) pane runs it.
  useEffect(() => {
    if (visible && ready && terminalCommand && writerRef.current) {
      writerRef.current(terminalCommand.replace(/[\r\n]+$/, '') + '\r');
      clearTerminalCommand();
    }
  }, [visible, ready, terminalCommand, clearTerminalCommand]);

  // Fit when this pane becomes visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => { try { fitRef.current?.fit(); } catch {} });
    }
  }, [visible]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => { try { fitRef.current?.fit(); } catch {} });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{
      flex: 1, display: visible ? 'flex' : 'none',
      flexDirection: 'column', minHeight: 0,
      background: APEX_THEME.background, padding: '4px 2px 2px',
    }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// ─── Tab close button ─────────────────────────────────────────────────────────

function CloseBtn({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      onClick={onClick}
      style={{ marginLeft: 4, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 3, flexShrink: 0, color: '#4A4A65' }}
      className="hover:!bg-[#252535] hover:!text-[#E2E2EC] transition-colors"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/>
      </svg>
    </span>
  );
}

// ─── Tab types ────────────────────────────────────────────────────────────────

interface TermTab { id: string; label: string; panes: number }

// ─── TerminalPanel ────────────────────────────────────────────────────────────

export function TerminalPanel() {
  const { terminalOpen, toggleTerminal, terminalHeight, setTerminalHeight, workspacePath } = useAppStore();

  const [tabs, setTabs]         = useState<TermTab[]>([{ id: 'tab-0', label: isTauri() ? 'shell' : 'mock', panes: 1 }]);
  const [activeTabId, setActive] = useState('tab-0');
  const counter = useRef(1);

  const addTab = useCallback(() => {
    const id    = `tab-${counter.current++}`;
    const label = isTauri() ? 'shell' : 'mock';
    setTabs(prev => [...prev, { id, label, panes: 1 }]);
    setActive(id);
  }, []);

  // Split the active terminal into side-by-side panes (toggle 1 ↔ 2, max 3).
  const splitActive = useCallback(() => {
    setTabs(prev => prev.map(t => t.id === activeTabId
      ? { ...t, panes: t.panes >= 3 ? 1 : t.panes + 1 }
      : t));
  }, [activeTabId]);

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      if (prev.length === 1) return prev; // keep at least one tab
      const next = prev.filter(t => t.id !== id);
      setActive(cur => cur === id ? next[next.length - 1].id : cur);
      return next;
    });
  }, []);

  // Rename tab on double click
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [renameVal, setRenameVal]     = useState('');

  const startRename = (tab: TermTab) => { setRenamingId(tab.id); setRenameVal(tab.label); };
  const submitRename = () => {
    if (renamingId && renameVal.trim()) {
      setTabs(prev => prev.map(t => t.id === renamingId ? { ...t, label: renameVal.trim() } : t));
    }
    setRenamingId(null);
  };

  if (!terminalOpen) return null;

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY, startH = terminalHeight;
    document.body.classList.add('resizing');
    const onMove = (ev: MouseEvent) => setTerminalHeight(Math.max(80, Math.min(600, startH - (ev.clientY - startY))));
    const onUp   = () => { document.body.classList.remove('resizing'); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="app-terminal flex flex-col" style={{ background: '#090910', borderTop: '1px solid #252535', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      <div className="rh-top" onMouseDown={handleResizeMouseDown} />

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{ height: 32, background: '#111118', borderBottom: '1px solid #1A1A28', display: 'flex', alignItems: 'center', paddingLeft: 6, paddingRight: 6, gap: 2, flexShrink: 0, overflowX: 'auto' }}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActive(tab.id)}
              onDoubleClick={() => startRename(tab)}
              style={{
                height: 26, padding: '0 8px', borderRadius: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                background: isActive ? '#18181F' : 'transparent',
                color: isActive ? '#E2E2EC' : '#4A4A65',
                border: isActive ? '1px solid #252535' : '1px solid transparent',
                cursor: 'pointer', userSelect: 'none', flexShrink: 0,
              }}
              className={!isActive ? 'hover:!text-[#8888A8] transition-colors' : ''}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={isActive ? 'var(--accent)' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="10" height="10" rx="1.5"/>
                <polyline points="3,4.5 5.5,6 3,7.5"/><line x1="6.5" y1="7.5" x2="9" y2="7.5"/>
              </svg>
              {renamingId === tab.id
                ? <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                    onBlur={submitRename}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 60, fontSize: 11, background: '#0A0A0F', border: '1px solid var(--accent)', borderRadius: 3, color: '#E2E2EC', padding: '1px 4px', outline: 'none' }} />
                : <span>{tab.label}</span>
              }
              {tabs.length > 1 && <CloseBtn onClick={e => closeTab(tab.id, e)} />}
            </div>
          );
        })}

        {/* Add tab button */}
        <button onClick={addTab} title="New Terminal"
          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A65', flexShrink: 0 }}
          className="hover:!text-[#E2E2EC] hover:!bg-[#18181F] transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="5" y1="1" x2="5" y2="9"/><line x1="1" y1="5" x2="9" y2="5"/>
          </svg>
        </button>

        <div style={{ flex: 1 }} />

        {/* Split terminal */}
        <button onClick={splitActive} title="Split terminal (side by side)"
          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A65', flexShrink: 0 }}
          className="hover:!text-[#E2E2EC] hover:!bg-[#18181F] transition-colors">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="2" width="11" height="10" rx="1.5"/><line x1="7" y1="2" x2="7" y2="12"/>
          </svg>
        </button>

        {/* Collapse */}
        <button onClick={toggleTerminal} title="Collapse terminal"
          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A65', flexShrink: 0 }}
          className="hover:!text-[#8888A8] hover:!bg-[#18181F] transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="2,8 6,4 10,8"/>
          </svg>
        </button>
      </div>

      {/* ── Terminal panes (all mounted, show/hide with CSS) ───────────────── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {tabs.map(tab => (
          <div key={tab.id}
            style={{
              position: 'absolute', inset: 0,
              display: tab.id === activeTabId ? 'flex' : 'none',
              flexDirection: 'row',
            }}>
            {Array.from({ length: tab.panes }).map((_, i) => (
              <div key={i} style={{ flex: 1, minWidth: 0, borderLeft: i > 0 ? '1px solid #1A1A28' : 'none', position: 'relative' }}>
                <XtermPane visible={tab.id === activeTabId} workspacePath={workspacePath} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
