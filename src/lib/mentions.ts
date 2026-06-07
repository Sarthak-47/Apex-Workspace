/**
 * @mention support for chat: @file, @folder, @symbol.
 * Provides autocomplete candidates and expands mentions into prompt context
 * just before a message is sent.
 */
import { readFile, listDir, grepFiles, type DirEntry } from './tauri';

export interface MentionItem {
  kind: 'file' | 'folder' | 'symbol';
  label: string;   // shown in dropdown
  detail: string;  // secondary text (path)
  insert: string;  // token inserted, e.g. "@file:src/App.tsx"
}

const sep = (workspace: string) => (workspace.includes('\\') ? '\\' : '/');

export function toRel(workspace: string, abs: string): string {
  if (abs.startsWith(workspace)) {
    return abs.slice(workspace.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
  }
  return abs.replace(/\\/g, '/');
}

export function toAbs(workspace: string, rel: string): string {
  const s = sep(workspace);
  return `${workspace}${s}${rel.replace(/\//g, s)}`;
}

/** Build file + folder candidate lists from a flat file listing. */
export function buildCandidates(workspace: string, files: DirEntry[]): { rel: string; isDir: boolean }[] {
  const out: { rel: string; isDir: boolean }[] = [];
  const folders = new Set<string>();
  for (const f of files) {
    const rel = toRel(workspace, f.path);
    out.push({ rel, isDir: false });
    // derive parent folders
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join('/'));
    }
  }
  for (const d of folders) out.push({ rel: d, isDir: true });
  return out;
}

/** Suggestions for the current @query. */
export function suggestMentions(
  query: string,
  candidates: { rel: string; isDir: boolean }[],
  limit = 8,
): MentionItem[] {
  const q = query.toLowerCase();
  // Allow explicit prefixes: file:, folder:, symbol:
  let kindFilter: 'file' | 'folder' | 'symbol' | null = null;
  let term = q;
  const m = q.match(/^(file|folder|symbol):(.*)$/);
  if (m) { kindFilter = m[1] as 'file' | 'folder' | 'symbol'; term = m[2]; }

  if (kindFilter === 'symbol') {
    // Preserve original case for the symbol token (grep itself is case-insensitive)
    const origTerm = query.slice(query.indexOf(':') + 1);
    return origTerm.length > 0
      ? [{ kind: 'symbol', label: origTerm, detail: 'search definitions', insert: `@symbol:${origTerm}` }]
      : [];
  }

  const scored = candidates
    .filter(c => (kindFilter === 'folder' ? c.isDir : kindFilter === 'file' ? !c.isDir : true))
    .filter(c => c.rel.toLowerCase().includes(term))
    .sort((a, b) => {
      // prefer matches on the basename, then shorter paths
      const an = a.rel.split('/').pop()!.toLowerCase();
      const bn = b.rel.split('/').pop()!.toLowerCase();
      const as = an.startsWith(term) ? 0 : 1;
      const bs = bn.startsWith(term) ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.rel.length - b.rel.length;
    })
    .slice(0, limit);

  return scored.map(c => ({
    kind: c.isDir ? 'folder' : 'file',
    label: c.rel.split('/').pop()!,
    detail: c.rel,
    insert: `${c.isDir ? '@folder:' : '@file:'}${c.rel}`,
  }));
}

/**
 * Expand @file/@folder/@symbol tokens in `text` into a context block.
 * Returns the original text plus a context prefix and the list of resolved sources.
 */
export async function expandMentions(
  text: string,
  workspace: string,
): Promise<{ contextBlock: string; sources: string[] }> {
  const sources: string[] = [];
  const parts: string[] = [];

  // @file:path
  for (const m of text.matchAll(/@file:([^\s]+)/g)) {
    const rel = m[1];
    try {
      const content = await readFile(toAbs(workspace, rel));
      const clipped = content.length > 12000 ? content.slice(0, 12000) + '\n…(truncated)' : content;
      parts.push(`File \`${rel}\`:\n\`\`\`\n${clipped}\n\`\`\``);
      sources.push(rel);
    } catch { /* unreadable */ }
  }

  // @folder:path → list files
  for (const m of text.matchAll(/@folder:([^\s]+)/g)) {
    const rel = m[1];
    try {
      const entries = await listDir(toAbs(workspace, rel));
      const list = entries.map(e => `- ${e.name}${e.is_dir ? '/' : ''}`).join('\n');
      parts.push(`Folder \`${rel}\` contents:\n${list}`);
      sources.push(rel + '/');
    } catch { /* unreadable */ }
  }

  // @symbol:name → grep for definition sites
  for (const m of text.matchAll(/@symbol:([^\s]+)/g)) {
    const name = m[1];
    try {
      const matches = await grepFiles(workspace, name);
      const top = matches.slice(0, 12).join('\n');
      if (top) {
        parts.push(`Symbol \`${name}\` references:\n\`\`\`\n${top}\n\`\`\``);
        sources.push(`symbol:${name}`);
      }
    } catch { /* grep unavailable */ }
  }

  return {
    contextBlock: parts.length ? '\n\n' + parts.join('\n\n') : '',
    sources,
  };
}

/** Strip mention tokens to a clean human-readable form for display. */
export function cleanMentionText(text: string): string {
  return text
    .replace(/@file:([^\s]+)/g, '@$1')
    .replace(/@folder:([^\s]+)/g, '@$1/')
    .replace(/@symbol:([^\s]+)/g, '@$1');
}
