/**
 * Tauri API compatibility layer.
 * In the browser (dev/preview), all window controls are no-ops or use browser APIs.
 * In Tauri, we use the real Tauri APIs.
 */

import * as webfs from "./webfs";

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ─── Window controls ──────────────────────────────────────────────────────────

export async function minimize() {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().minimize();
  }
}

export async function toggleMaximize() {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().toggleMaximize();
  }
}

export async function closeWindow() {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().close();
  }
}

// ─── File system commands ─────────────────────────────────────────────────────

export async function readFile(path: string): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('read_file', { path });
  }
  if (webfs.owns(path)) return webfs.readFile(path);
  const src = MOCK_SOURCE_FILES[path.replace(/\\/g, '/')];
  if (src !== undefined) return src;
  if (demoVault()) {
    const mock = MOCK_VAULT_FILES[path.replace(/\\/g, '/')];
    if (mock !== undefined) return mock;
  }
  throw new Error('File system not available in browser preview');
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('write_file', { path, content });
  }
  if (webfs.owns(path)) return webfs.writeFile(path, content);
  throw new Error('File system not available in browser preview');
}

export async function deletePath(path: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('delete_path', { path });
  }
  if (webfs.owns(path)) return webfs.deletePath(path);
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('rename_path', { oldPath, newPath });
  }
  if (webfs.owns(oldPath)) return webfs.renamePath(oldPath, newPath);
}

export async function createFile(path: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('write_file', { path, content: '' });
  }
  if (webfs.owns(path)) return webfs.createFile(path);
}

export async function createDir(path: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('create_dir', { path });
  }
  if (webfs.owns(path)) return webfs.createDir(path);
}

// ─── Git blame ────────────────────────────────────────────────────────────────

export interface BlameLine {
  line: number;
  hash: string;
  author: string;
  time: number; // epoch seconds
  summary: string;
}

/** Per-line git blame for a file. Empty in the browser build (needs the desktop app). */
export async function gitBlame(workspace: string, path: string): Promise<BlameLine[]> {
  if (!isTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  try { return await invoke<BlameLine[]>('git_blame', { workspace, path }); } catch { return []; }
}

export interface GitFileStatus { path: string; staged: string; unstaged: string }

export async function gitStatus(workspace: string): Promise<GitFileStatus[]> {
  if (!isTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  try { return await invoke<GitFileStatus[]>('git_status', { workspace }); } catch { return []; }
}

export async function gitDiffFile(workspace: string, path: string, staged: boolean): Promise<string> {
  if (!isTauri()) return '';
  const { invoke } = await import('@tauri-apps/api/core');
  try { return await invoke<string>('git_diff_file', { workspace, path, staged }); } catch { return ''; }
}

/** Apply a unified-diff patch to the index (stage a hunk; reverse=true unstages). */
export async function gitApplyCached(workspace: string, patch: string, reverse: boolean): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('git_apply_cached', { workspace, patch, reverse });
}

export async function gitStashSave(workspace: string, message: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('git_stash_save', { workspace, message });
}
export async function gitStashPop(workspace: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('git_stash_pop', { workspace });
}
export async function gitStashList(workspace: string): Promise<string[]> {
  if (!isTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  try { return await invoke<string[]>('git_stash_list', { workspace }); } catch { return []; }
}

export async function gitListBranches(workspace: string): Promise<string[]> {
  if (!isTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  try { return await invoke<string[]>('git_list_branches', { workspace }); } catch { return []; }
}

export async function gitSwitchBranch(workspace: string, branch: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('git_switch_branch', { workspace, branch });
}

export async function gitCreateBranch(workspace: string, branch: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('git_create_branch', { workspace, branch });
}

// ─── Language Server Protocol transport ───────────────────────────────────────

export async function lspStart(id: string, command: string, args: string[], cwd: string): Promise<void> {
  if (!isTauri()) throw new Error('LSP requires the desktop app');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('lsp_start', { id, command, args, cwd });
}

export async function lspSend(id: string, message: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('lsp_send', { id, message });
}

export async function lspStop(id: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('lsp_stop', { id });
}

/** Subscribe to framed messages from a language server. Returns an unlisten fn. */
export async function onLspMessage(id: string, cb: (raw: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  const un = await listen<string>(`lsp-message-${id}`, (e) => cb(e.payload));
  return un;
}

export async function revealInExplorer(path: string, _isDir: boolean): Promise<void> {
  if (isTauri()) {
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(path);
    } catch { /* no-op */ }
  }
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  ext: string | null;
}

// ─── Browser mock file tree ───────────────────────────────────────────────────
// Simulates a realistic project structure for web-first testing

// Demo source files readable in the browser preview (so Test Explorer etc.
// have something to discover without the desktop file system).
const MOCK_SOURCE_FILES: Record<string, string> = {
  '/demo-workspace/src/lib/format.test.ts':
    `import { describe, it, expect } from 'vitest';\n` +
    `import { formatBytes, slugify } from './format';\n\n` +
    `describe('formatBytes', () => {\n` +
    `  it('formats zero', () => { expect(formatBytes(0)).toBe('0 B'); });\n` +
    `  it('formats kilobytes', () => { expect(formatBytes(1024)).toBe('1 KB'); });\n` +
    `  it('formats megabytes', () => { expect(formatBytes(1048576)).toBe('1 MB'); });\n` +
    `});\n\n` +
    `describe('slugify', () => {\n` +
    `  it('lowercases and dashes', () => { expect(slugify('Hello World')).toBe('hello-world'); });\n` +
    `  it('strips punctuation', () => { expect(slugify('A, B & C')).toBe('a-b-c'); });\n` +
    `});\n`,
  '/demo-workspace/tests/test_utils.py':
    `import pytest\n` +
    `from utils import clamp, is_even\n\n` +
    `def test_clamp_low():\n    assert clamp(-5, 0, 10) == 0\n\n` +
    `def test_clamp_high():\n    assert clamp(99, 0, 10) == 10\n\n` +
    `def test_is_even():\n    assert is_even(4)\n    assert not is_even(3)\n`,
};

const MOCK_TREE: Record<string, DirEntry[]> = {
  '/demo-workspace': [
    { name: 'src',          path: '/demo-workspace/src',          is_dir: true,  size: 0,       ext: null },
    { name: 'public',       path: '/demo-workspace/public',       is_dir: true,  size: 0,       ext: null },
    { name: 'src-tauri',    path: '/demo-workspace/src-tauri',    is_dir: true,  size: 0,       ext: null },
    { name: 'package.json', path: '/demo-workspace/package.json', is_dir: false, size: 1280,    ext: 'json' },
    { name: 'tsconfig.json',path: '/demo-workspace/tsconfig.json',is_dir: false, size: 512,     ext: 'json' },
    { name: 'vite.config.ts',path:'/demo-workspace/vite.config.ts',is_dir:false, size: 800,     ext: 'ts' },
    { name: '.gitignore',   path: '/demo-workspace/.gitignore',   is_dir: false, size: 220,     ext: null },
    { name: 'README.md',    path: '/demo-workspace/README.md',    is_dir: false, size: 1024,    ext: 'md' },
    { name: 'tests',        path: '/demo-workspace/tests',        is_dir: true,  size: 0,       ext: null },
  ],
  '/demo-workspace/tests': [
    { name: 'test_utils.py', path: '/demo-workspace/tests/test_utils.py', is_dir: false, size: 420, ext: 'py' },
  ],
  // Second demo root — exercises multi-root workspaces in the browser preview.
  '/demo-shared-lib': [
    { name: 'src',          path: '/demo-shared-lib/src',          is_dir: true,  size: 0,    ext: null },
    { name: 'package.json', path: '/demo-shared-lib/package.json', is_dir: false, size: 360,  ext: 'json' },
    { name: 'README.md',    path: '/demo-shared-lib/README.md',    is_dir: false, size: 200,  ext: 'md' },
  ],
  '/demo-shared-lib/src': [
    { name: 'index.ts',  path: '/demo-shared-lib/src/index.ts',  is_dir: false, size: 480, ext: 'ts' },
    { name: 'format.ts', path: '/demo-shared-lib/src/format.ts', is_dir: false, size: 540, ext: 'ts' },
  ],
  '/demo-workspace/src': [
    { name: 'components',   path: '/demo-workspace/src/components', is_dir: true,  size: 0,     ext: null },
    { name: 'editor',       path: '/demo-workspace/src/editor',     is_dir: true,  size: 0,     ext: null },
    { name: 'lib',          path: '/demo-workspace/src/lib',        is_dir: true,  size: 0,     ext: null },
    { name: 'store',        path: '/demo-workspace/src/store',      is_dir: true,  size: 0,     ext: null },
    { name: 'App.tsx',      path: '/demo-workspace/src/App.tsx',    is_dir: false, size: 2048,  ext: 'tsx' },
    { name: 'main.tsx',     path: '/demo-workspace/src/main.tsx',   is_dir: false, size: 512,   ext: 'tsx' },
    { name: 'index.css',    path: '/demo-workspace/src/index.css',  is_dir: false, size: 4096,  ext: 'css' },
  ],
  '/demo-workspace/src/components': [
    { name: 'layout',       path: '/demo-workspace/src/components/layout',      is_dir: true,  size: 0,    ext: null },
    { name: 'ui',           path: '/demo-workspace/src/components/ui',          is_dir: true,  size: 0,    ext: null },
  ],
  '/demo-workspace/src/components/layout': [
    { name: 'CenterArea.tsx',   path: '/demo-workspace/src/components/layout/CenterArea.tsx',   is_dir: false, size: 8192,  ext: 'tsx' },
    { name: 'IntelPanel.tsx',   path: '/demo-workspace/src/components/layout/IntelPanel.tsx',   is_dir: false, size: 6144,  ext: 'tsx' },
    { name: 'LeftNav.tsx',      path: '/demo-workspace/src/components/layout/LeftNav.tsx',      is_dir: false, size: 3072,  ext: 'tsx' },
    { name: 'LeftPanel.tsx',    path: '/demo-workspace/src/components/layout/LeftPanel.tsx',    is_dir: false, size: 5120,  ext: 'tsx' },
    { name: 'ModeBar.tsx',      path: '/demo-workspace/src/components/layout/ModeBar.tsx',      is_dir: false, size: 2048,  ext: 'tsx' },
    { name: 'StatusBar.tsx',    path: '/demo-workspace/src/components/layout/StatusBar.tsx',    is_dir: false, size: 2560,  ext: 'tsx' },
    { name: 'TerminalPanel.tsx',path: '/demo-workspace/src/components/layout/TerminalPanel.tsx',is_dir: false, size: 2048,  ext: 'tsx' },
    { name: 'Titlebar.tsx',     path: '/demo-workspace/src/components/layout/Titlebar.tsx',     is_dir: false, size: 4096,  ext: 'tsx' },
  ],
  '/demo-workspace/src/components/ui': [
    { name: 'Toaster.tsx',  path: '/demo-workspace/src/components/ui/Toaster.tsx', is_dir: false, size: 2048, ext: 'tsx' },
  ],
  '/demo-workspace/src/editor': [
    { name: 'MonacoEditor.tsx', path: '/demo-workspace/src/editor/MonacoEditor.tsx', is_dir: false, size: 12288, ext: 'tsx' },
  ],
  '/demo-workspace/src/lib': [
    { name: 'tauri.ts', path: '/demo-workspace/src/lib/tauri.ts', is_dir: false, size: 3072, ext: 'ts' },
    { name: 'format.test.ts', path: '/demo-workspace/src/lib/format.test.ts', is_dir: false, size: 540, ext: 'ts' },
  ],
  '/demo-workspace/src/store': [
    { name: 'index.ts', path: '/demo-workspace/src/store/index.ts', is_dir: false, size: 6144, ext: 'ts' },
  ],
  '/demo-workspace/public': [
    { name: 'apex-logo.svg', path: '/demo-workspace/public/apex-logo.svg', is_dir: false, size: 2621440, ext: 'svg' },
  ],
  '/demo-workspace/src-tauri': [
    { name: 'src',            path: '/demo-workspace/src-tauri/src',            is_dir: true,  size: 0,    ext: null },
    { name: 'Cargo.toml',     path: '/demo-workspace/src-tauri/Cargo.toml',     is_dir: false, size: 512,  ext: 'toml' },
    { name: 'tauri.conf.json',path: '/demo-workspace/src-tauri/tauri.conf.json',is_dir: false, size: 1024, ext: 'json' },
  ],
  '/demo-workspace/src-tauri/src': [
    { name: 'lib.rs',  path: '/demo-workspace/src-tauri/src/lib.rs',  is_dir: false, size: 3072, ext: 'rs' },
    { name: 'main.rs', path: '/demo-workspace/src-tauri/src/main.rs', is_dir: false, size: 256,  ext: 'rs' },
  ],
};

export async function listDir(path: string): Promise<DirEntry[]> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('list_dir', { path });
  }
  // Web: a real folder opened via the File System Access API takes priority.
  if (webfs.owns(path)) return webfs.listDir(path);
  // Demo data only when explicitly opted in (apex-demo-vault flag).
  if (demoVault()) {
    return MOCK_TREE[path] ?? MOCK_VAULT_TREE[path] ?? [];
  }
  return [];
}

// ─── Browser preview demo vault (OPT-IN; off by default) ──────────────────────
// Only populates the Knowledge view / graph / email in the *web preview* when
// localStorage 'apex-demo-vault' === '1'. The real desktop app always reads the
// actual <workspace>/.apex/vault folder. By default the preview shows empty states.

function demoVault(): boolean {
  try { return localStorage.getItem('apex-demo-vault') === '1'; } catch { return false; }
}

const VR = '/demo-workspace/.apex/vault';
function vfile(cat: string, file: string, body: string): [string, string] {
  return [`${VR}/${cat}/${file}`, body];
}
const MOCK_VAULT_FILES: Record<string, string> = Object.fromEntries([
  vfile('people', 'Alex-Chen.md', `---\nname: Alex Chen\ntype: person\nrole: Backend Lead\nupdated: 2026-06-05\n---\n\n# Alex Chen\n\nBackend lead. Leads [[Auth v2 Project]] and attends [[Sprint 23 Standup]]. Dislikes over-engineered abstractions.`),
  vfile('people', 'Bob-Smith.md', `---\nname: Bob Smith\ntype: person\nrole: Frontend\nupdated: 2026-06-03\n---\n\n# Bob Smith\n\nFrontend engineer. Works with [[Alex Chen]] on [[Auth v2 Project]].`),
  vfile('projects', 'Auth-v2-Project.md', `---\nname: Auth v2 Project\ntype: project\nstatus: active\nupdated: 2026-06-06\n---\n\n# Auth v2 Project\n\nNew auth system. Owned by [[Alex Chen]]. Driven by [[Auth Decision]].`),
  vfile('decisions', 'Auth-Decision.md', `---\nname: Auth Decision\ntype: decision\nupdated: 2026-06-02\n---\n\n# Auth Decision\n\nChose Postgres over Mongo for [[Auth v2 Project]]. Made by [[Alex Chen]].`),
  vfile('meetings', 'Sprint-23-Standup.md', `---\nname: Sprint 23 Standup\ntype: meeting\nupdated: 2026-06-04\n---\n\n# Sprint 23 Standup\n\nAttendees: [[Alex Chen]], [[Bob Smith]]. Discussed [[Auth v2 Project]] progress.`),
  [`${VR}/raw/gmail/thread-001.md`, `---\nthread_id: 001\nsubject: Auth v2 timeline\nparticipants: Alex Chen <alex@x.com>, You <you@gmail.com>\ndate_range: 2026-06-05 — 2026-06-06\n---\n\n## Email 1 — From: Alex Chen <alex@x.com>\n\nCan we lock the Auth v2 ship date? I think end of month is realistic if we cut scope on SSO.`],
  [`${VR}/raw/gmail/thread-002.md`, `---\nthread_id: 002\nsubject: Postgres migration\nparticipants: Bob Smith <bob@x.com>, You <you@gmail.com>\ndate_range: 2026-06-04 — 2026-06-04\n---\n\n## Email 1 — From: Bob Smith <bob@x.com>\n\nThe Postgres migration script is ready for review. Want me to run it on staging?`],
]);
function ventry(cat: string, file: string): DirEntry {
  return { name: file, path: `${VR}/${cat}/${file}`, is_dir: false, size: 400, ext: 'md' };
}
const MOCK_VAULT_TREE: Record<string, DirEntry[]> = {
  [`${VR}/people`]: [ventry('people', 'Alex-Chen.md'), ventry('people', 'Bob-Smith.md')],
  [`${VR}/projects`]: [ventry('projects', 'Auth-v2-Project.md')],
  [`${VR}/decisions`]: [ventry('decisions', 'Auth-Decision.md')],
  [`${VR}/meetings`]: [ventry('meetings', 'Sprint-23-Standup.md')],
  [`${VR}/organizations`]: [],
  [`${VR}/topics`]: [],
  [`${VR}/raw/gmail`]: [
    { name: 'thread-001.md', path: `${VR}/raw/gmail/thread-001.md`, is_dir: false, size: 300, ext: 'md' },
    { name: 'thread-002.md', path: `${VR}/raw/gmail/thread-002.md`, is_dir: false, size: 300, ext: 'md' },
  ],
};

/** Recursively collect every file under rootPath (max 8 levels). */
export async function listAllFiles(rootPath: string): Promise<DirEntry[]> {
  if (isTauri()) {
    const result: DirEntry[] = [];
    const recurse = async (path: string, depth: number) => {
      if (depth > 8) return;
      try {
        for (const e of await listDir(path)) {
          if (e.is_dir) await recurse(e.path, depth + 1);
          else result.push(e);
        }
      } catch { /* ignore unreadable dirs */ }
    };
    await recurse(rootPath, 0);
    return result;
  }
  // Browser mock — flatten MOCK_TREE, skip dirs
  const result: DirEntry[] = [];
  for (const entries of Object.values(MOCK_TREE)) {
    for (const e of entries) {
      if (!e.is_dir) result.push(e);
    }
  }
  return result;
}

/** Open a native file picker for individual files. */
export async function openFileDialog(): Promise<string | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({ directory: false, multiple: false, title: 'Open File' });
      return typeof result === 'string' ? result : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Grep for a pattern across the workspace. Returns file:line:content strings. */
export async function grepFiles(workspace: string, pattern: string, dir?: string): Promise<string[]> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke<string[]>('grep_files', { workspace, pattern, dir: dir ?? null });
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Bash (approval-gated agent tool) ─────────────────────────────────────────

export interface BashResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
  killed?: boolean;
}

/** Run a shell command. The UI handles approval gating before this is called. */
export async function runBash(command: string, cwd?: string, timeout?: number, runId?: string): Promise<BashResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<BashResult>('run_bash', { command, cwd: cwd ?? null, timeout: timeout ?? null, runId: runId ?? null });
  }
  // Browser mock — simulate a few common commands for web-first testing
  await new Promise(r => setTimeout(r, 250));
  const c = command.trim();
  if (/^echo\s+/.test(c)) {
    return { stdout: c.replace(/^echo\s+/, '').replace(/^["']|["']$/g, '') + '\n', stderr: '', exit_code: 0, timed_out: false };
  }
  if (/^(ls|dir)\b/.test(c)) {
    return { stdout: 'src/\npublic/\npackage.json\nREADME.md\nvite.config.ts\n', stderr: '', exit_code: 0, timed_out: false };
  }
  if (/^pwd\b/.test(c)) {
    return { stdout: '/demo-workspace\n', stderr: '', exit_code: 0, timed_out: false };
  }
  if (/^node\s+-v/.test(c) || /^node\s+--version/.test(c)) {
    return { stdout: 'v20.11.0\n', stderr: '', exit_code: 0, timed_out: false };
  }
  if (/^git\s+status/.test(c)) {
    return { stdout: 'On branch main\nnothing to commit, working tree clean\n', stderr: '', exit_code: 0, timed_out: false };
  }
  return { stdout: `[browser preview] would run: ${c}\n`, stderr: '', exit_code: 0, timed_out: false };
}

/** Kill a running bash command by run_id. */
export async function killBash(runId: string): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('kill_bash', { runId });
    } catch { /* no-op */ }
  }
}

// ─── File watcher ─────────────────────────────────────────────────────────────

export interface FsChange {
  kind: string;
  paths: string[];
}

/** Start watching a workspace for external file changes. */
export async function startWatching(workspace: string): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('start_watching', { workspace });
    } catch { /* watcher optional */ }
  }
}

/** Stop the active file watcher. */
export async function stopWatching(): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_watching');
    } catch { /* no-op */ }
  }
}

/** Subscribe to `fs-changed` events. Returns an unsubscribe function. */
export async function onFsChange(handler: (change: FsChange) => void): Promise<() => void> {
  if (isTauri()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<FsChange>('fs-changed', e => handler(e.payload));
      return unlisten;
    } catch {
      return () => {};
    }
  }
  return () => {};
}

// ─── Gmail (OAuth + sync) ─────────────────────────────────────────────────────

export interface GmailStatus {
  connected: boolean;
  email: string | null;
  last_synced: number | null;
  thread_count: number | null;
}

export interface GmailSyncResult {
  thread_count: number;
  new_or_changed: number;
}

const GMAIL_MOCK_KEY = 'apex-gmail-mock';

function readGmailMock(): GmailStatus {
  try {
    const raw = localStorage.getItem(GMAIL_MOCK_KEY);
    if (raw) return JSON.parse(raw) as GmailStatus;
  } catch { /* ignore */ }
  return { connected: false, email: null, last_synced: null, thread_count: null };
}

export async function gmailStatus(workspace?: string): Promise<GmailStatus> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<GmailStatus>('gmail_status', { workspace: workspace ?? null });
  }
  return readGmailMock();
}

/** Begin OAuth. In Tauri: returns the consent URL and opens it in the browser. */
export async function gmailStartAuth(clientId: string, clientSecret: string): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const url = await invoke<string>('gmail_start_auth', { clientId, clientSecret });
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch { /* user can open manually */ }
    return url;
  }
  // Browser mock: simulate a successful connection
  const mock: GmailStatus = { connected: true, email: 'you@gmail.com', last_synced: null, thread_count: null };
  localStorage.setItem(GMAIL_MOCK_KEY, JSON.stringify(mock));
  return 'mock://connected';
}

export async function gmailSync(workspace: string, days: number): Promise<GmailSyncResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<GmailSyncResult>('gmail_sync', { workspace, days });
  }
  // Browser mock: pretend we synced a handful of threads
  const cur = readGmailMock();
  const count = 42;
  localStorage.setItem(GMAIL_MOCK_KEY, JSON.stringify({ ...cur, last_synced: Math.floor(Date.now() / 1000), thread_count: count }));
  return { thread_count: count, new_or_changed: count };
}

export async function gmailDisconnect(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('gmail_disconnect');
    return;
  }
  localStorage.removeItem(GMAIL_MOCK_KEY);
}

// ─── Google Calendar (shares the Gmail Google account) ────────────────────────

export async function calendarStatus(workspace?: string): Promise<GmailStatus> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<GmailStatus>('calendar_status', { workspace: workspace ?? null });
  }
  // Browser mock: connected iff Gmail mock connected
  const g = readGmailMock();
  try {
    const raw = localStorage.getItem('apex-calendar-mock');
    if (raw) return JSON.parse(raw) as GmailStatus;
  } catch { /* ignore */ }
  return { connected: g.connected, email: g.email, last_synced: null, thread_count: null };
}

export async function calendarSync(workspace: string): Promise<GmailSyncResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<GmailSyncResult>('calendar_sync', { workspace });
  }
  const g = readGmailMock();
  localStorage.setItem('apex-calendar-mock', JSON.stringify({ connected: g.connected, email: g.email, last_synced: Math.floor(Date.now() / 1000), thread_count: 18 }));
  return { thread_count: 18, new_or_changed: 18 };
}

// ─── Fireflies ────────────────────────────────────────────────────────────────

export interface FirefliesStatus {
  connected: boolean;
  last_synced: number | null;
  meeting_count: number | null;
}

const FF_MOCK_KEY = 'apex-fireflies-mock';

export async function firefliesStatus(workspace?: string): Promise<FirefliesStatus> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<FirefliesStatus>('fireflies_status', { workspace: workspace ?? null });
  }
  try { const raw = localStorage.getItem(FF_MOCK_KEY); if (raw) return JSON.parse(raw) as FirefliesStatus; } catch { /* ignore */ }
  return { connected: false, last_synced: null, meeting_count: null };
}

export async function firefliesSetKey(key: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('fireflies_set_key', { key });
    return;
  }
  localStorage.setItem(FF_MOCK_KEY, JSON.stringify({ connected: true, last_synced: null, meeting_count: null }));
}

export async function firefliesSync(workspace: string): Promise<{ meeting_count: number }> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<{ meeting_count: number }>('fireflies_sync', { workspace });
  }
  localStorage.setItem(FF_MOCK_KEY, JSON.stringify({ connected: true, last_synced: Math.floor(Date.now() / 1000), meeting_count: 7 }));
  return { meeting_count: 7 };
}

export async function firefliesDisconnect(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('fireflies_disconnect');
    return;
  }
  localStorage.removeItem(FF_MOCK_KEY);
}

/** Listen for the OAuth callback completing (Tauri only). */
export async function onGmailConnected(handler: (email: string) => void): Promise<() => void> {
  if (isTauri()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<string>('gmail-connected', e => handler(e.payload));
      return unlisten;
    } catch {
      return () => {};
    }
  }
  return () => {};
}

// ─── Document ingestion ───────────────────────────────────────────────────────

/** Extract plain text from a document (PDF/DOCX/PPTX/XLSX/EPUB/text). */
export async function extractDocument(path: string): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string>('extract_document', { path });
  }
  return `[browser preview] extracted text from ${path.split(/[\\/]/).pop()} would appear here.`;
}

/** Open a file picker filtered to ingestible document types. */
export async function openDocumentDialog(): Promise<string | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({
        multiple: false, title: 'Ingest a document',
        filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'pptx', 'xlsx', 'epub', 'md', 'txt', 'csv', 'html'] }],
      });
      return typeof result === 'string' ? result : null;
    } catch { return null; }
  }
  return '/demo-workspace/spec.pdf';
}

// ─── Hardware (Model Cookbook) ────────────────────────────────────────────────

export interface HardwareInfo {
  cpu: string;
  cores: number;
  ram_mb: number;
  gpu: string | null;
  vram_mb: number | null;
}

export async function hardwareInfo(): Promise<HardwareInfo> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<HardwareInfo>('hardware_info');
  }
  // Browser mock — the target dev profile (RTX 4070 Laptop, 8GB VRAM)
  return { cpu: 'Intel Core i7 (14th Gen)', cores: 20, ram_mb: 32 * 1024, gpu: 'NVIDIA GeForce RTX 4070 Laptop GPU', vram_mb: 8 * 1024 };
}

// ─── MCP (Model Context Protocol) ─────────────────────────────────────────────

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

const MCP_MOCK_TOOLS: Record<string, McpTool[]> = {
  exa: [
    { name: 'exa_search', description: 'Search the web; returns titles, URLs, snippets' },
    { name: 'exa_get_contents', description: 'Fetch full page content for a URL' },
  ],
  github: [
    { name: 'list_prs', description: 'List pull requests for a repo' },
    { name: 'get_pr', description: 'Get a pull request by number' },
    { name: 'list_issues', description: 'List issues for a repo' },
    { name: 'create_issue', description: 'Create an issue' },
    { name: 'list_commits', description: 'List recent commits' },
  ],
};

export async function mcpStart(cfg: McpServerConfig): Promise<{ name: string; tools: McpTool[] }> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('mcp_start', { name: cfg.name, command: cfg.command, args: cfg.args, env: cfg.env });
  }
  await new Promise(r => setTimeout(r, 300));
  return { name: cfg.name, tools: MCP_MOCK_TOOLS[cfg.name] ?? [{ name: `${cfg.name}_tool`, description: 'mock tool' }] };
}

export async function mcpStop(name: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('mcp_stop', { name });
  }
}

export async function mcpRunning(): Promise<string[]> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string[]>('mcp_running');
  }
  return [];
}

export async function mcpCallTool(name: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('mcp_call_tool', { name, tool, arguments: args });
  }
  return { content: [{ type: 'text', text: `[browser preview] ${name}.${tool}(${JSON.stringify(args)})` }] };
}

/** Read the persisted ntfy topic URL without importing the store (avoids a cycle). */
function ntfyTopicFromState(): string {
  try {
    const raw = localStorage.getItem('apex-app-state');
    return raw ? (JSON.parse(raw).state?.ntfyTopic ?? '') : '';
  } catch { return ''; }
}

/** Notify via the Web Notification API + (if configured) an ntfy topic for phone/browser push. */
export async function notify(title: string, body: string): Promise<void> {
  // Desktop notification
  try {
    if (typeof Notification !== 'undefined') {
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm === 'granted') new Notification(title, { body });
    } else {
      // eslint-disable-next-line no-console
      console.info(`[notify] ${title}: ${body}`);
    }
  } catch { /* ignore */ }

  // ntfy push (self-hostable, cross-device)
  const topic = ntfyTopicFromState();
  if (topic) {
    try {
      await fetch(topic, { method: 'POST', headers: { Title: title }, body });
    } catch { /* offline */ }
  }
}

export interface GitCommit { hash: string; author: string; message: string; date: string }

/** Recent git commits for unified search (browser returns a small mock). */
export async function gitLog(workspace: string, limit = 50): Promise<GitCommit[]> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<GitCommit[]>('git_log', { workspace, limit });
    } catch { return []; }
  }
  return [
    { hash: '6575fd7', author: 'Sarthak-47', message: 'knowledge graph visualizer + vault browser', date: '2026-06-08' },
    { hash: 'd03e777', author: 'Sarthak-47', message: 'Google Calendar + Fireflies sync', date: '2026-06-08' },
    { hash: '4852cfb', author: 'Sarthak-47', message: 'entity extraction pipeline', date: '2026-06-08' },
    { hash: 'bf7ba66', author: 'Sarthak-47', message: 'Gmail OAuth + raw thread sync', date: '2026-06-07' },
  ];
}

/** Read the current git branch from .git/HEAD (falls back to 'main'). */
export async function getGitBranch(workspacePath: string): Promise<string> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const head: string = await invoke('read_file', { path: `${workspacePath}/.git/HEAD` });
      const match = head.match(/ref: refs\/heads\/(.+)/);
      return match ? match[1].trim() : head.trim().slice(0, 7);
    } catch {
      return 'main';
    }
  }
  return 'main';
}

// ─── Folder picker dialog ─────────────────────────────────────────────────────

/**
 * Opens a native folder picker dialog.
 * In Tauri: uses @tauri-apps/plugin-dialog (requires plugin in Cargo.toml).
 * In browser: returns a demo workspace path for web-first testing.
 */
export async function openFolderDialog(): Promise<string | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({ directory: true, multiple: false, title: 'Open Workspace Folder' });
      return typeof result === 'string' ? result : null;
    } catch {
      return null;
    }
  }
  // Web: open a REAL folder via the File System Access API (Chrome/Edge).
  if (webfs.fsaSupported()) return webfs.pickDirectory();
  // Fallback for browsers without the API: a named, in-memory workspace.
  const name = window.prompt('Workspace name (your browser does not support opening local folders):');
  return name ? '/' + name.trim().replace(/^\/+/, '') : null;
}

/**
 * Create a brand-new folder and open it as the workspace.
 * Native: pick a location, then create the named folder inside it.
 * Web: pick a parent via the File System Access API, create the subfolder.
 */
export async function createWorkspaceFolder(): Promise<string | null> {
  const name = window.prompt('New folder name:')?.trim();
  if (!name) return null;
  if (isTauri()) {
    const parent = await openFolderDialog();
    if (!parent) return null;
    const path = parent.replace(/[\\/]+$/, '') + '/' + name;
    await createDir(path);
    return path;
  }
  if (webfs.fsaSupported()) return webfs.createSubfolder(name);
  return '/' + name.replace(/^\/+/, '');
}

/**
 * Ensure a workspace's underlying folder handle is active before switching to it.
 * Native: no-op (Rust reads the path directly). Web: restores the IndexedDB handle
 * (re-prompting for permission). Returns false if the folder can't be reopened.
 */
export async function activateWorkspace(path: string): Promise<boolean> {
  if (isTauri()) return true;
  if (webfs.owns(path)) return true;
  if (webfs.fsaSupported()) return webfs.setActiveRoot(path);
  return true; // virtual/named workspace — nothing to restore
}
