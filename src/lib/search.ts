/**
 * Workspace-wide search & replace (VS Code-style).
 * Native: delegates to the Rust `search_files` command (fast).
 * Web: walks the open folder via listDir + readFile (File System Access API).
 * Replace is performed on the frontend (read → replace → write) so it works in
 * both modes uniformly.
 */
import { isTauri, listDir, readFile, writeFile, type DirEntry } from "./tauri";

export interface SearchMatch {
  line: number;   // 1-based
  text: string;   // full line text (capped)
  start: number;  // match start (char offset within line)
  end: number;    // match end
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  isRegex: boolean;
  includes?: string; // comma-separated globs
  excludes?: string;
}

const SKIP_DIRS = new Set([
  "node_modules", "target", "dist", "build", ".git",
  "__pycache__", ".next", ".nuxt", "out", "coverage",
]);
const TEXT_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "rb",
  "c", "cpp", "h", "hpp", "cs", "swift", "kt", "json", "md",
  "toml", "yaml", "yml", "css", "scss", "html", "txt", "sh",
  "bash", "zsh", "fish", "env", "gitignore", "lock", "xml",
]);

const MAX_TOTAL = 5000;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a RegExp from the search options (global, multi-match per line). */
export function buildRegex(opts: SearchOptions): RegExp {
  let pat = opts.isRegex ? opts.query : escapeRegex(opts.query);
  if (opts.wholeWord) pat = `\\b${pat}\\b`;
  const flags = opts.caseSensitive ? "g" : "gi";
  return new RegExp(pat, flags);
}

function globToRegex(glob: string): RegExp {
  let r = "";
  for (const ch of glob) {
    if (ch === "*") r += ".*";
    else if (ch === "?") r += ".";
    else if (ch === "/" || ch === "\\") r += "[\\\\/]";
    else r += escapeRegex(ch);
  }
  return new RegExp(r, "i");
}

function parseGlobs(s?: string): RegExp[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map(globToRegex);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchWorkspace(
  workspace: string,
  opts: SearchOptions,
): Promise<SearchFileResult[]> {
  if (!opts.query) return [];
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<SearchFileResult[]>("search_files", {
      workspace,
      query: opts.query,
      caseSensitive: opts.caseSensitive,
      wholeWord: opts.wholeWord,
      isRegex: opts.isRegex,
      includes: opts.includes || null,
      excludes: opts.excludes || null,
    });
  }
  // Web: validate the regex up front so a bad pattern surfaces as an error.
  const re = buildRegex(opts);
  const inc = parseGlobs(opts.includes);
  const exc = parseGlobs(opts.excludes);
  const out: SearchFileResult[] = [];
  const counter = { total: 0 };
  await walkWeb(workspace, workspace, re, inc, exc, out, counter);
  return out;
}

async function walkWeb(
  dir: string,
  workspace: string,
  re: RegExp,
  inc: RegExp[],
  exc: RegExp[],
  out: SearchFileResult[],
  counter: { total: number },
): Promise<void> {
  if (counter.total >= MAX_TOTAL) return;
  let entries: DirEntry[] = [];
  try { entries = await listDir(dir); } catch { return; }
  for (const e of entries) {
    if (counter.total >= MAX_TOTAL) return;
    if (e.name.startsWith(".") && e.name !== ".env") continue;
    if (e.is_dir) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walkWeb(e.path, workspace, re, inc, exc, out, counter);
    } else {
      const ext = (e.ext ?? "").toLowerCase();
      if (!TEXT_EXTS.has(ext)) continue;
      const rel = e.path.replace(workspace, "").replace(/^[\\/]/, "");
      if (inc.length && !inc.some((g) => g.test(rel))) continue;
      if (exc.some((g) => g.test(rel))) continue;
      let content = "";
      try { content = await readFile(e.path); } catch { continue; }
      const matches = matchContent(content, re, counter);
      if (matches.length) out.push({ path: e.path, matches });
    }
  }
}

function matchContent(content: string, re: RegExp, counter: { total: number }): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (counter.total >= MAX_TOTAL) break;
    const line = lines[i];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      matches.push({ line: i + 1, text: line.slice(0, 400), start: m.index, end: m.index + m[0].length });
      counter.total++;
      if (m[0].length === 0) re.lastIndex++; // avoid infinite loop on empty match
      if (counter.total >= MAX_TOTAL) break;
    }
  }
  return matches;
}

// ─── Replace ──────────────────────────────────────────────────────────────────

/** Replace all matches in a single file. Returns the number of replacements. */
export async function replaceInFile(
  path: string,
  opts: SearchOptions,
  replacement: string,
): Promise<number> {
  const re = buildRegex(opts);
  const content = await readFile(path);
  let count = 0;
  const next = content.replace(re, () => { count++; return replacement; });
  if (count > 0) await writeFile(path, next);
  return count;
}

/** Replace across many files. Returns total replacements made. */
export async function replaceAll(
  results: SearchFileResult[],
  opts: SearchOptions,
  replacement: string,
): Promise<number> {
  let total = 0;
  for (const r of results) {
    try { total += await replaceInFile(r.path, opts, replacement); } catch { /* skip */ }
  }
  return total;
}

export function totalMatches(results: SearchFileResult[]): number {
  return results.reduce((n, r) => n + r.matches.length, 0);
}
