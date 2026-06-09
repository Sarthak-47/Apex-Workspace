/**
 * Real local-folder access for the WEB build via the File System Access API
 * (Chrome/Edge). This is what makes the browser version behave like VS Code for
 * Web: open an actual folder, read/write real files, create folders — no mocks.
 *
 * Directory handles are persisted in IndexedDB so "recent workspaces" can be
 * reopened across reloads (re-prompting for permission on a user gesture).
 *
 * In the native Tauri app none of this is used — the Rust FS commands handle it.
 */

import type { DirEntry } from "./tauri";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DirHandle = any; // FileSystemDirectoryHandle (not in default TS lib)

let rootHandle: DirHandle | null = null;
let rootName = "";

export function fsaSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** True if a real folder is currently open and `path` lives inside it. */
export function owns(path: string): boolean {
  if (!rootHandle) return false;
  const p = norm(path);
  return p === "/" + rootName || p.startsWith("/" + rootName + "/");
}

export function activeRootPath(): string {
  return rootName ? "/" + rootName : "";
}

function norm(path: string): string {
  return "/" + path.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
}

function segments(path: string): string[] {
  const segs = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segs[0] === rootName) segs.shift();
  return segs;
}

// ─── IndexedDB handle persistence ─────────────────────────────────────────────
const DB_NAME = "apex-webfs";
const STORE = "handles";

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function idbPut(key: string, val: DirHandle): Promise<void> {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function idbGet(key: string): Promise<DirHandle | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function ensurePermission(h: DirHandle): Promise<boolean> {
  const opts = { mode: "readwrite" } as const;
  try {
    if ((await h.queryPermission(opts)) === "granted") return true;
    return (await h.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}

// ─── Open / create / switch ───────────────────────────────────────────────────

/** Native folder picker. Returns the workspace path (e.g. "/my-project"), or null if cancelled. */
export async function pickDirectory(): Promise<string | null> {
  if (!fsaSupported()) return null;
  try {
    const handle: DirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
    rootHandle = handle;
    rootName = handle.name;
    const path = "/" + handle.name;
    await idbPut(path, handle);
    return path;
  } catch {
    return null; // user cancelled
  }
}

/** Pick a parent location, create `name` inside it, and open it as the workspace. */
export async function createSubfolder(name: string): Promise<string | null> {
  if (!fsaSupported()) return null;
  try {
    const parent: DirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
    const sub: DirHandle = await parent.getDirectoryHandle(name, { create: true });
    rootHandle = sub;
    rootName = sub.name;
    const path = "/" + sub.name;
    await idbPut(path, sub);
    return path;
  } catch {
    return null;
  }
}

/** Re-activate a previously opened workspace by path (restores its handle). Must run from a user gesture. */
export async function setActiveRoot(path: string): Promise<boolean> {
  const key = norm(path);
  const h = await idbGet(key);
  if (!h) return false;
  if (!(await ensurePermission(h))) return false;
  rootHandle = h;
  rootName = h.name;
  return true;
}

// ─── Path resolution ──────────────────────────────────────────────────────────

async function dirHandleFor(path: string): Promise<DirHandle | null> {
  if (!rootHandle) return null;
  let dir = rootHandle;
  for (const s of segments(path)) {
    dir = await dir.getDirectoryHandle(s);
  }
  return dir;
}

async function resolveParent(
  path: string,
  createDirs = false,
): Promise<{ parent: DirHandle; name: string } | null> {
  if (!rootHandle) return null;
  const segs = segments(path);
  if (segs.length === 0) return { parent: rootHandle, name: "" };
  let dir = rootHandle;
  for (let i = 0; i < segs.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segs[i], { create: createDirs });
  }
  return { parent: dir, name: segs[segs.length - 1] };
}

// ─── FS operations (mirror tauri.ts signatures) ───────────────────────────────

export async function listDir(path: string): Promise<DirEntry[]> {
  const dir = await dirHandleFor(path);
  if (!dir) return [];
  const base = norm(path);
  const out: DirEntry[] = [];
  for await (const [name, h] of (dir as any).entries()) {
    const p = (base === "/" ? "" : base) + "/" + name;
    if (h.kind === "directory") {
      out.push({ name, path: p, is_dir: true, size: 0, ext: null });
    } else {
      let size = 0;
      try { size = (await h.getFile()).size; } catch { /* ignore */ }
      const ext = name.includes(".") ? name.split(".").pop()! : null;
      out.push({ name, path: p, is_dir: false, size, ext });
    }
  }
  out.sort((a, b) => (a.is_dir === b.is_dir ? a.name.localeCompare(b.name) : a.is_dir ? -1 : 1));
  return out;
}

export async function readFile(path: string): Promise<string> {
  const r = await resolveParent(path);
  if (!r) throw new Error("No workspace open");
  const fh = await r.parent.getFileHandle(r.name);
  return (await fh.getFile()).text();
}

export async function writeFile(path: string, content: string): Promise<void> {
  const r = await resolveParent(path, true);
  if (!r) throw new Error("No workspace open");
  const fh = await r.parent.getFileHandle(r.name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export async function createFile(path: string): Promise<void> {
  await writeFile(path, "");
}

export async function createDir(path: string): Promise<void> {
  const r = await resolveParent(path, true);
  if (!r || !r.name) return;
  await r.parent.getDirectoryHandle(r.name, { create: true });
}

export async function deletePath(path: string): Promise<void> {
  const r = await resolveParent(path);
  if (!r || !r.name) return;
  await (r.parent as any).removeEntry(r.name, { recursive: true });
}

/** Rename a file within the same directory (copy + delete). Directories are not supported. */
export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  const content = await readFile(oldPath);
  await writeFile(newPath, content);
  await deletePath(oldPath);
}
