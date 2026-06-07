/**
 * Codebase semantic index.
 * Chunks workspace files, embeds them via Ollama (nomic-embed-text), and stores
 * vectors in IndexedDB for fast local cosine-similarity search. Fully local —
 * no cloud, no external service. (sqlite-vec is a future storage optimization;
 * IndexedDB keeps a single code path that runs in both browser and Tauri webview.)
 */
import { embed } from './ollama';
import { listAllFiles, readFile, type DirEntry } from './tauri';

const DB_NAME = 'apex-index';
const STORE = 'chunks';
const META = 'meta';

export interface CodeChunk {
  id: string;          // `${filePath}#${chunkIndex}`
  filePath: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  hash: string;
  startLine: number;
  endLine: number;
}

export interface SearchResult {
  filePath: string;
  text: string;
  startLine: number;
  endLine: number;
  score: number;
}

export interface IndexStats {
  files: number;
  chunks: number;
  lastIndexed: number | null;
}

const INDEXABLE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'rs', 'py', 'go', 'java', 'rb', 'c', 'cpp', 'h', 'hpp',
  'cs', 'swift', 'kt', 'php', 'json', 'md', 'toml', 'yaml', 'yml', 'css', 'scss',
  'html', 'vue', 'svelte', 'sql', 'sh', 'txt',
]);

const CHUNK_LINES = 60;
const CHUNK_OVERLAP = 10;
const MAX_FILE_BYTES = 100 * 1024; // skip files >100KB

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('filePath', 'filePath', { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

async function getAllChunks(db: IDBDatabase): Promise<CodeChunk[]> {
  return tx<CodeChunk[]>(db, STORE, 'readonly', s => s.getAll());
}

async function getFileChunks(db: IDBDatabase, filePath: string): Promise<CodeChunk[]> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const idx = t.objectStore(STORE).index('filePath');
    const req = idx.getAll(IDBKeyRange.only(filePath));
    req.onsuccess = () => resolve(req.result as CodeChunk[]);
    req.onerror = () => reject(req.error);
  });
}

async function putChunks(db: IDBDatabase, chunks: CodeChunk[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const c of chunks) s.put(c);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function deleteFileChunks(db: IDBDatabase, filePath: string): Promise<void> {
  const existing = await getFileChunks(db, filePath);
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const c of existing) s.delete(c.id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function setMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  await tx(db, META, 'readwrite', s => s.put({ key, value }));
}

async function getMeta<T>(db: IDBDatabase, key: string): Promise<T | null> {
  const r = await tx<{ key: string; value: T } | undefined>(db, META, 'readonly', s => s.get(key));
  return r ? r.value : null;
}

// ─── Chunking + hashing ───────────────────────────────────────────────────────

function hashString(s: string): string {
  // Lightweight FNV-1a — used only for change detection, not security.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

interface RawChunk { text: string; startLine: number; endLine: number }

function chunkContent(content: string): RawChunk[] {
  const lines = content.split('\n');
  const chunks: RawChunk[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES - CHUNK_OVERLAP) {
    const slice = lines.slice(i, i + CHUNK_LINES);
    const text = slice.join('\n').trim();
    if (text.length < 10) continue;
    chunks.push({ text, startLine: i + 1, endLine: Math.min(i + CHUNK_LINES, lines.length) });
    if (i + CHUNK_LINES >= lines.length) break;
  }
  return chunks;
}

function isIndexable(e: DirEntry): boolean {
  const ext = (e.ext ?? e.name.split('.').pop() ?? '').toLowerCase();
  return INDEXABLE_EXT.has(ext) && e.size <= MAX_FILE_BYTES;
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ProgressFn = (done: number, total: number, currentFile: string) => void;

/** Index (or re-index) a single file. Returns number of chunks embedded. */
export async function indexFile(filePath: string, embedModel = 'nomic-embed-text', signal?: AbortSignal): Promise<number> {
  const db = await openDb();
  let content: string;
  try { content = await readFile(filePath); } catch { return 0; }

  const hash = hashString(content);
  const existing = await getFileChunks(db, filePath);
  if (existing.length > 0 && existing[0].hash === hash) {
    return existing.length; // unchanged
  }

  const raw = chunkContent(content);
  const chunks: CodeChunk[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (signal?.aborted) break;
    const vec = await embed(raw[i].text, embedModel, signal);
    if (vec.length === 0) continue; // embeddings unavailable — skip silently
    chunks.push({
      id: `${filePath}#${i}`,
      filePath,
      chunkIndex: i,
      text: raw[i].text,
      embedding: vec,
      hash,
      startLine: raw[i].startLine,
      endLine: raw[i].endLine,
    });
  }

  await deleteFileChunks(db, filePath);
  if (chunks.length > 0) await putChunks(db, chunks);
  return chunks.length;
}

/** Full workspace index with progress reporting. */
export async function indexWorkspace(
  workspace: string,
  embedModel = 'nomic-embed-text',
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<IndexStats> {
  const db = await openDb();
  const all = await listAllFiles(workspace);
  const files = all.filter(isIndexable);
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) break;
    onProgress?.(i, total, files[i].name);
    await indexFile(files[i].path, embedModel, signal);
  }

  await setMeta(db, 'lastIndexed', Date.now());
  await setMeta(db, 'workspace', workspace);
  onProgress?.(total, total, '');
  return getStats();
}

/** Semantic search over the indexed codebase. */
export async function searchIndex(
  query: string,
  topK = 8,
  embedModel = 'nomic-embed-text',
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const db = await openDb();
  const qvec = await embed(query, embedModel, signal);
  if (qvec.length === 0) return [];

  const chunks = await getAllChunks(db);
  const scored = chunks.map(c => ({
    filePath: c.filePath,
    text: c.text,
    startLine: c.startLine,
    endLine: c.endLine,
    score: cosine(qvec, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0.2).slice(0, topK);
}

export async function getStats(): Promise<IndexStats> {
  const db = await openDb();
  const chunks = await getAllChunks(db);
  const files = new Set(chunks.map(c => c.filePath));
  const lastIndexed = await getMeta<number>(db, 'lastIndexed');
  return { files: files.size, chunks: chunks.length, lastIndexed };
}

export async function clearIndex(): Promise<void> {
  const db = await openDb();
  await tx(db, STORE, 'readwrite', s => s.clear());
  await tx(db, META, 'readwrite', s => s.clear());
}
