/**
 * Tauri API compatibility layer.
 * In the browser (dev/preview), all window controls are no-ops or use browser APIs.
 * In Tauri, we use the real Tauri APIs.
 */

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
  const mock = MOCK_VAULT_FILES[path.replace(/\\/g, '/')];
  if (mock !== undefined) return mock;
  throw new Error('File system not available in browser preview');
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('write_file', { path, content });
  }
  throw new Error('File system not available in browser preview');
}

export async function deletePath(path: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('delete_path', { path });
  }
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('rename_path', { oldPath, newPath });
  }
}

export async function createFile(path: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('write_file', { path, content: '' });
  }
}

export async function createDir(path: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('create_dir', { path });
  }
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
  // Browser mock: simulate realistic project tree
  await new Promise(r => setTimeout(r, 60)); // tiny latency to test loading states
  return MOCK_TREE[path] ?? MOCK_VAULT_TREE[path] ?? [];
}

// ─── Browser mock vault (demoable Knowledge view + graph) ─────────────────────

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
}

/** Run a shell command. The UI handles approval gating before this is called. */
export async function runBash(command: string, cwd?: string, timeout?: number): Promise<BashResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<BashResult>('run_bash', { command, cwd: cwd ?? null, timeout: timeout ?? null });
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

/** Show a desktop notification via the Web Notification API (works in the Tauri webview too). */
export async function notify(title: string, body: string): Promise<void> {
  try {
    if (typeof Notification === 'undefined') {
      // eslint-disable-next-line no-console
      console.info(`[notify] ${title}: ${body}`);
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm === 'granted') new Notification(title, { body });
  } catch {
    // eslint-disable-next-line no-console
    console.info(`[notify] ${title}: ${body}`);
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
  // Browser preview — return the mock workspace
  return '/demo-workspace';
}
