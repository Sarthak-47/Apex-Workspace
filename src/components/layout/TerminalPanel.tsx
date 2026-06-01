import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useAppStore } from "@/store";

// ─── APEX xterm theme ─────────────────────────────────────────────────────────
const APEX_THEME = {
  background:          '#090910',
  foreground:          '#C0C0D0',
  cursor:              '#6366F1',
  cursorAccent:        '#090910',
  selectionBackground: '#25255280',
  black:               '#090910',
  brightBlack:         '#252535',
  red:                 '#EF4444',
  brightRed:           '#F87171',
  green:               '#22C55E',
  brightGreen:         '#4ADE80',
  yellow:              '#F59E0B',
  brightYellow:        '#FCD34D',
  blue:                '#3B82F6',
  brightBlue:          '#6366F1',
  magenta:             '#A78BFA',
  brightMagenta:       '#C084FC',
  cyan:                '#06B6D4',
  brightCyan:          '#67E8F9',
  white:               '#C0C0D0',
  brightWhite:         '#E2E2EC',
};

// ─── ANSI color helpers ───────────────────────────────────────────────────────
const C = {
  red:     (s: string) => `\x1b[38;2;239;68;68m${s}\x1b[0m`,
  green:   (s: string) => `\x1b[38;2;34;197;94m${s}\x1b[0m`,
  yellow:  (s: string) => `\x1b[38;2;245;158;11m${s}\x1b[0m`,
  blue:    (s: string) => `\x1b[38;2;99;102;241m${s}\x1b[0m`,
  cyan:    (s: string) => `\x1b[38;2;6;182;212m${s}\x1b[0m`,
  grey:    (s: string) => `\x1b[38;2;136;136;168m${s}\x1b[0m`,
  white:   (s: string) => `\x1b[38;2;226;226;236m${s}\x1b[0m`,
  dim:     (s: string) => `\x1b[2m${s}\x1b[22m`,
  dir:     (s: string) => `\x1b[1;38;2;6;182;212m${s}\x1b[0m`,
};

// ─── Mock file system ─────────────────────────────────────────────────────────
const MOCK_FS: Record<string, string[]> = {
  '/demo-workspace': [
    'src/', 'public/', 'src-tauri/',
    'package.json', 'tsconfig.json', 'vite.config.ts', '.gitignore', 'README.md',
  ],
  '/demo-workspace/src': [
    'components/', 'editor/', 'lib/', 'store/',
    'App.tsx', 'main.tsx', 'index.css',
  ],
  '/demo-workspace/src/components': ['layout/', 'ui/'],
  '/demo-workspace/src/components/layout': [
    'CenterArea.tsx', 'IntelPanel.tsx', 'LeftNav.tsx', 'LeftPanel.tsx',
    'ModeBar.tsx', 'StatusBar.tsx', 'TerminalPanel.tsx', 'Titlebar.tsx',
  ],
  '/demo-workspace/src/components/ui': ['Toaster.tsx'],
  '/demo-workspace/src/editor':    ['MonacoEditor.tsx'],
  '/demo-workspace/src/lib':       ['tauri.ts'],
  '/demo-workspace/src/store':     ['index.ts'],
  '/demo-workspace/public':        ['apex-logo.svg'],
  '/demo-workspace/src-tauri':     ['src/', 'Cargo.toml', 'tauri.conf.json'],
  '/demo-workspace/src-tauri/src': ['lib.rs', 'main.rs'],
};

const MOCK_FILES: Record<string, string> = {
  'package.json':  '{\n  "name": "apex",\n  "version": "0.1.0",\n  "type": "module"\n}',
  'README.md':     '# APEX\n\nLocal-first AI-native developer workspace.',
  '.gitignore':    'node_modules/\ndist/\ntarget/\n.env',
  'tsconfig.json': '{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "ESNext"\n  }\n}',
};

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(cwd: string): string {
  const display = cwd.replace('/demo-workspace', '~') || '~';
  return (
    `${C.blue('APEX')} ` +
    `${C.grey(display)} ` +
    `${C.green('main')}` +
    `\x1b[38;2;226;226;236m $\x1b[0m `
  );
}

// ─── Mock shell command executor ──────────────────────────────────────────────
function execCmd(
  raw: string,
  cwdRef: { current: string },
  term: Terminal,
): void {
  const parts = raw.trim().split(/\s+/);
  const cmd   = parts[0];
  const args  = parts.slice(1);
  const cwd   = cwdRef.current;
  const W = (s: string) => term.writeln(s);

  switch (cmd) {
    case '': return;

    case 'help':
      W('');
      W(`  \x1b[1;38;2;245;158;11mAPEX Mock Shell\x1b[0m  ${C.grey('— browser preview mode')}`);
      W('');
      W(`  ${C.cyan('ls')} ${C.grey('[-la]')}       list directory contents`);
      W(`  ${C.cyan('cd')} ${C.grey('<dir>')}        change directory`);
      W(`  ${C.cyan('pwd')}            print working directory`);
      W(`  ${C.cyan('clear')}          clear terminal  ${C.grey('Ctrl+L')}`);
      W(`  ${C.cyan('echo')} ${C.grey('<text>')}     print text`);
      W(`  ${C.cyan('cat')} ${C.grey('<file>')}      print file contents`);
      W(`  ${C.cyan('git')} ${C.grey('status|log|branch|diff|pull')}`);
      W(`  ${C.cyan('node')} ${C.grey('-v')}         Node.js version`);
      W(`  ${C.cyan('npm')} ${C.grey('-v')}          npm version`);
      W(`  ${C.cyan('rustc')} ${C.grey('-V')}        Rust compiler version`);
      W(`  ${C.cyan('cargo')} ${C.grey('-V')}        Cargo version`);
      W(`  ${C.cyan('date')}  ${C.cyan('whoami')}  ${C.cyan('uname')}`);
      W('');
      W(C.dim('  ↑/↓ history  ·  Tab complete  ·  Ctrl+C cancel  ·  Ctrl+L clear  ·  Ctrl+U erase line'));
      W('');
      return;

    case 'clear':
      term.clear();
      return;

    case 'pwd':
      W(cwd);
      return;

    case 'ls': {
      const isLong  = args.some(a => /^-[la]+$/.test(a));
      const dirArg  = args.find(a => !a.startsWith('-'));
      const target  = dirArg
        ? (dirArg.startsWith('/') ? dirArg : `${cwd}/${dirArg}`)
        : cwd;
      const entries = MOCK_FS[target];
      if (entries === undefined) { W(C.red(`ls: ${target}: No such file or directory`)); return; }
      if (entries.length === 0)  { W(C.grey('(empty directory)')); return; }
      if (isLong) {
        W(C.grey(`total ${entries.length}`));
        for (const e of entries) {
          const isDir = e.endsWith('/');
          const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
          const sz    = isDir ? '   4096' : '  12288';
          const dt    = C.grey('Jun  1 09:42');
          W(`${C.dim(perms)}  1 ${C.grey('user')}  ${sz} ${dt}  ${isDir ? C.dir(e) : C.white(e)}`);
        }
      } else {
        W(entries.map(e => e.endsWith('/') ? C.dir(e) : C.white(e)).join('  '));
      }
      return;
    }

    case 'cd': {
      const target = args[0] ?? '~';
      if (!target || target === '~') { cwdRef.current = '/demo-workspace'; return; }
      if (target === '.')            { return; }
      if (target === '..') {
        const segs = cwd.split('/').filter(Boolean);
        segs.pop();
        cwdRef.current = segs.length >= 2 ? '/' + segs.join('/') : '/demo-workspace';
        return;
      }
      const abs = target.startsWith('/')
        ? target
        : `${cwd}/${target}`.replace(/\/+/g, '/');
      if (MOCK_FS[abs] !== undefined) { cwdRef.current = abs; return; }
      W(C.red(`cd: ${target}: No such file or directory`));
      return;
    }

    case 'echo':
      W(args.join(' '));
      return;

    case 'cat': {
      const fname = args[0];
      if (!fname)            { W(C.red('cat: missing operand')); return; }
      const content = MOCK_FILES[fname];
      if (!content)          { W(C.red(`cat: ${fname}: No such file or directory`)); return; }
      for (const line of content.split('\n')) W(line);
      return;
    }

    case 'git': {
      const sub = args[0];
      switch (sub) {
        case 'status':
          W(`On branch ${C.green('main')}`);
          W(`Your branch is up to date with ${C.cyan("'origin/main'")}.`);
          W('');
          W(C.green('nothing to commit, working tree clean'));
          return;
        case 'log': {
          const oneline = args.includes('--oneline');
          const commits = [
            { h: '0cf68d7', m: 'fix: blend titlebar logo into dark background' },
            { h: '32eae2a', m: 'feat: show open workspace folder name in Titlebar' },
            { h: '4ba328f', m: 'feat: rewrite LeftPanel with real recursive file tree' },
            { h: 'cebe5a8', m: 'feat: add openFolderDialog and rich browser mock file tree' },
            { h: 'bc9d188', m: 'fix: make nav icons visible, add terminal toggle to left nav' },
          ];
          if (oneline) {
            for (const c of commits) W(`${C.yellow(c.h)} ${c.m}`);
          } else {
            for (const c of commits) {
              W('');
              W(`${C.yellow('commit ' + c.h)}`);
              W('Author: Sarthak-47 <0906sarthak@gmail.com>');
              W('Date:   Mon Jun 1 2026');
              W('');
              W(`    ${c.m}`);
            }
          }
          return;
        }
        case 'branch':
          W(`* ${C.green('main')}`);
          W(`  ${C.grey('dev')}`);
          return;
        case 'diff':
          W(C.grey('(no local changes)'));
          return;
        case 'stash':
          W(C.grey('No local changes to save'));
          return;
        case 'pull':
          W(`From https://github.com/Sarthak-47/Apex-Workspace`);
          W(`   0cf68d7..0cf68d7  main -> origin/main`);
          W('Already up to date.');
          return;
        default:
          W(C.grey(`git: '${sub ?? ''}' — try: status, log [--oneline], branch, diff, pull`));
          return;
      }
    }

    case 'node':
      if (args[0] === '--version' || args[0] === '-v') { W('v22.14.0'); return; }
      W(C.grey('node: interactive REPL not available in browser preview'));
      return;

    case 'npm':
      if (args[0] === '--version' || args[0] === '-v') { W('10.9.2'); return; }
      if (args[0] === 'run') {
        W(C.grey(`npm run ${args[1] ?? ''}: script execution requires Tauri shell`));
        return;
      }
      W(C.grey('npm: limited support in browser preview'));
      return;

    case 'rustc':
      if (args[0] === '--version' || args[0] === '-V') { W('rustc 1.83.0 (90b35a623 2024-11-26)'); return; }
      W(C.grey('rustc: compilation requires Tauri shell'));
      return;

    case 'cargo':
      if (args[0] === '--version' || args[0] === '-V') { W('cargo 1.83.0 (5ffbef321 2024-10-29)'); return; }
      W(C.grey('cargo: build commands require Tauri desktop shell'));
      return;

    case 'which':
      if (args[0]) W(`/usr/local/bin/${args[0]}`);
      return;

    case 'whoami':
      W('user');
      return;

    case 'date':
      W(new Date().toLocaleString());
      return;

    case 'uname':
      W(args.includes('-a') ? 'APEX-OS 0.1.0 Tauri/2.x x86_64' : 'APEX-OS');
      return;

    case 'exit':
      W(C.grey('exit: use the × button or Ctrl+` to toggle the terminal panel'));
      return;

    default:
      W(C.red(`${cmd}: command not found`) + C.dim(C.grey('  (browser mock — Tauri mode for real shell)')));
      return;
  }
}

// ─── Inner xterm component ────────────────────────────────────────────────────
function XtermTerminal() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Mutable shell state (plain objects, not React state — must not trigger re-renders)
    const cwdRef    = { current: '/demo-workspace' };
    let lineBuffer  = '';
    const cmdHistory: string[] = [];
    let histIdx     = -1;

    const term = new Terminal({
      theme:             APEX_THEME,
      fontFamily:        '"JetBrains Mono", "Cascadia Code", "Consolas", monospace',
      fontSize:          13,
      lineHeight:        1.6,
      cursorBlink:       true,
      cursorStyle:       'bar',
      scrollback:        5000,
      convertEol:        true,
      allowTransparency: false,
    });

    const fitAddon      = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(el);
    requestAnimationFrame(() => { try { fitAddon.fit(); } catch { /* ignore */ } });

    // ── Welcome banner ──────────────────────────────────────────────────────
    term.writeln(
      `${C.blue('▸')} \x1b[1;38;2;226;226;236mAPEX Terminal\x1b[0m  ` +
      C.grey('browser preview  ·  start in Tauri for real shell')
    );
    term.writeln(
      C.grey(`  Type ${C.yellow('help')} for commands`) +
      C.dim(C.grey('  ·  ↑/↓ history  ·  Tab complete  ·  Ctrl+L clear'))
    );
    term.write(buildPrompt(cwdRef.current));

    // ── Key handler ──────────────────────────────────────────────────────────
    term.onKey(({ key, domEvent }) => {
      const { key: k, ctrlKey, altKey, metaKey } = domEvent;

      // Ctrl combos (no alt/meta)
      if (ctrlKey && !altKey && !metaKey) {
        switch (k) {
          case 'c':
            term.write(`${C.grey('^C')}\r\n` + buildPrompt(cwdRef.current));
            lineBuffer = '';
            histIdx    = -1;
            return;
          case 'l':
            term.clear();
            term.write(buildPrompt(cwdRef.current));
            return;
          case 'u':
            lineBuffer = '';
            term.write('\r' + buildPrompt(cwdRef.current) + '\x1b[K');
            return;
          default:
            return;
        }
      }

      if (altKey || metaKey) return;

      // Special keys
      switch (k) {
        case 'Enter': {
          const cmd = lineBuffer.trim();
          term.write('\r\n');
          if (cmd) {
            cmdHistory.unshift(cmd);
            if (cmdHistory.length > 200) cmdHistory.pop();
            histIdx = -1;
            execCmd(cmd, cwdRef, term);
          }
          lineBuffer = '';
          term.write(buildPrompt(cwdRef.current));
          return;
        }

        case 'Backspace':
          if (lineBuffer.length > 0) {
            lineBuffer = lineBuffer.slice(0, -1);
            term.write('\b \b');
          }
          return;

        case 'Tab': {
          domEvent.preventDefault?.();
          if (!lineBuffer) return;
          const entries = MOCK_FS[cwdRef.current] ?? [];
          const word    = lineBuffer.split(/\s+/).pop() ?? '';
          const matches = entries.filter(e => e.startsWith(word));
          if (matches.length === 1) {
            const rest  = matches[0].slice(word.length);
            lineBuffer += rest;
            term.write(rest);
          } else if (matches.length > 1) {
            term.write('\r\n' + matches.map(m => m.endsWith('/') ? C.dir(m) : C.white(m)).join('  '));
            term.write('\r\n' + buildPrompt(cwdRef.current) + lineBuffer);
          }
          return;
        }

        case 'ArrowUp':
          if (cmdHistory.length === 0) return;
          histIdx    = Math.min(histIdx + 1, cmdHistory.length - 1);
          lineBuffer = cmdHistory[histIdx];
          term.write('\r' + buildPrompt(cwdRef.current) + '\x1b[K' + lineBuffer);
          return;

        case 'ArrowDown':
          if (histIdx <= 0) {
            histIdx    = -1;
            lineBuffer = '';
            term.write('\r' + buildPrompt(cwdRef.current) + '\x1b[K');
            return;
          }
          histIdx--;
          lineBuffer = cmdHistory[histIdx];
          term.write('\r' + buildPrompt(cwdRef.current) + '\x1b[K' + lineBuffer);
          return;

        // Ignore cursor-movement keys (no inline cursor movement in mock shell)
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'Home':
        case 'End':
        case 'PageUp':
        case 'PageDown':
        case 'Insert':
        case 'Delete':
        case 'Escape':
          return;
      }

      // Printable characters
      if (key.length === 1 && key.charCodeAt(0) >= 32) {
        lineBuffer += key;
        term.write(key);
      }
    });

    // ── Resize observer — refit when container changes size ─────────────────
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => { try { fitAddon.fit(); } catch { /* ignore */ } });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, []); // empty deps — mount once, no re-runs

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: APEX_THEME.background, padding: '4px 2px 2px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// ─── TerminalPanel (outer shell) ─────────────────────────────────────────────
export function TerminalPanel() {
  const { terminalOpen, toggleTerminal } = useAppStore();
  if (!terminalOpen) return null;

  return (
    <div
      className="app-terminal flex flex-col"
      style={{
        background: '#090910',
        borderTop: '1px solid #252535',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div style={{
        height: 32,
        background: '#111118',
        borderBottom: '1px solid #1A1A28',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 6,
        gap: 4,
        flexShrink: 0,
      }}>
        {/* Active tab */}
        <div style={{
          height: 26,
          padding: '0 10px',
          borderRadius: 4,
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: '#18181F',
          color: '#E2E2EC',
          border: '1px solid #252535',
          userSelect: 'none',
        }}>
          {/* Terminal icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="10" height="10" rx="1.5"/>
            <polyline points="3,4.5 5.5,6 3,7.5"/>
            <line x1="6.5" y1="7.5" x2="9" y2="7.5"/>
          </svg>
          <span>bash</span>
          <span style={{ color: '#4A4A65', fontSize: 9, marginLeft: 1 }}>mock</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        {([
          {
            title: 'New Terminal',
            icon: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
              </svg>
            ),
            onClick: undefined as (() => void) | undefined,
          },
          {
            title: 'Split Terminal',
            icon: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="12" height="12" rx="1"/>
                <line x1="7" y1="1" x2="7" y2="13"/>
              </svg>
            ),
            onClick: undefined as (() => void) | undefined,
          },
          {
            title: 'Collapse Panel',
            icon: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="3,9 7,5 11,9"/>
              </svg>
            ),
            onClick: toggleTerminal,
          },
        ] as const).map(({ title, icon, onClick }, i) => (
          <button
            key={i}
            title={title}
            onClick={onClick}
            style={{
              color: '#4A4A65',
              background: 'none',
              border: 'none',
              cursor: onClick ? 'pointer' : 'default',
              padding: 4,
              lineHeight: 1,
              borderRadius: 3,
            }}
            className={onClick ? 'hover:!text-[#8888A8] hover:!bg-[#18181F] transition-colors' : ''}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* ── xterm.js content ──────────────────────────────────────────────── */}
      <XtermTerminal />
    </div>
  );
}
