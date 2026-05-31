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
  // no-op in browser
}

export async function toggleMaximize() {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().toggleMaximize();
  }
  // no-op in browser
}

export async function closeWindow() {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().close();
  }
  // no-op in browser
}

// ─── File system commands ─────────────────────────────────────────────────────

export async function readFile(path: string): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('read_file', { path });
  }
  throw new Error('File system not available in browser preview');
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('write_file', { path, content });
  }
  throw new Error('File system not available in browser preview');
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  ext: string | null;
}

export async function listDir(path: string): Promise<DirEntry[]> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('list_dir', { path });
  }
  // Return mock data in browser
  return [
    { name: 'src', path: `${path}/src`, is_dir: true, size: 0, ext: null },
    { name: 'package.json', path: `${path}/package.json`, is_dir: false, size: 1024, ext: 'json' },
  ];
}
