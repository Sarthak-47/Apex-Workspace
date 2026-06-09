/**
 * Local file history (VS Code "Timeline"). Snapshots a file's contents on every
 * save into IndexedDB so you can review or restore previous versions — entirely
 * local, nothing transmitted. Works in both the web and native builds.
 */

export interface HistoryEntry {
  ts: number;     // epoch ms
  size: number;   // bytes (UTF-8)
  content: string;
}

const DB_NAME = "apex-history";
const STORE = "snapshots";
const MAX_PER_FILE = 50;
const MIN_INTERVAL_MS = 30_000; // don't snapshot more than once per 30s per file

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function get(path: string): Promise<HistoryEntry[]> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(path);
    r.onsuccess = () => res((r.result as HistoryEntry[]) ?? []);
    r.onerror = () => rej(r.error);
  });
}

async function put(path: string, entries: HistoryEntry[]): Promise<void> {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entries, path);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** Record a snapshot for `path`. No-ops if content is unchanged or too soon after the last one. */
export async function saveSnapshot(path: string, content: string): Promise<void> {
  if (!path || content == null) return;
  try {
    const entries = await get(path);
    const last = entries[0];
    if (last) {
      if (last.content === content) return;
      if (Date.now() - last.ts < MIN_INTERVAL_MS) {
        // Replace the most recent entry rather than spamming snapshots.
        entries[0] = { ts: Date.now(), size: new TextEncoder().encode(content).length, content };
        await put(path, entries.slice(0, MAX_PER_FILE));
        return;
      }
    }
    entries.unshift({ ts: Date.now(), size: new TextEncoder().encode(content).length, content });
    await put(path, entries.slice(0, MAX_PER_FILE));
  } catch {
    /* storage unavailable — history is best-effort */
  }
}

/** List history for a file, newest first (metadata + content). */
export async function listHistory(path: string): Promise<HistoryEntry[]> {
  try { return await get(path); } catch { return []; }
}

export async function clearHistory(path: string): Promise<void> {
  try { await put(path, []); } catch { /* ignore */ }
}
