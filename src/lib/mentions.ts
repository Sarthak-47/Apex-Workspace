/**
 * @mention support for chat: @file, @folder, @symbol (code) and
 * @person/@project/@decision/@meeting (knowledge vault).
 * Provides autocomplete candidates and expands mentions into prompt context
 * just before a message is sent.
 */
import { readFile, listDir, grepFiles, type DirEntry } from './tauri';
import { extractLinks, type VaultNote, type NoteCategory } from './vault';

export type MentionKind = 'file' | 'folder' | 'symbol' | 'person' | 'project' | 'decision' | 'meeting';

export interface MentionItem {
  kind: MentionKind;
  group: 'Code' | 'Knowledge';
  label: string;   // shown in dropdown
  detail: string;  // secondary text (path)
  insert: string;  // token inserted, e.g. "@file:src/App.tsx" or "@person:alex-chen"
}

function slugifyName(name: string): string {
  return name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'untitled';
}

const CAT_TO_KIND: Partial<Record<NoteCategory, MentionKind>> = {
  people: 'person', projects: 'project', decisions: 'decision', meetings: 'meeting',
};

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

/** Suggestions for the current @query — merges code (files/symbols) and knowledge (vault notes). */
export function suggestMentions(
  query: string,
  candidates: { rel: string; isDir: boolean }[],
  vaultNotes: VaultNote[] = [],
  limit = 8,
): MentionItem[] {
  const q = query.toLowerCase();
  // Explicit prefixes
  const prefixMatch = q.match(/^(file|folder|symbol|person|project|decision|meeting):(.*)$/);
  const kindFilter = prefixMatch ? prefixMatch[1] : null;
  const term = prefixMatch ? prefixMatch[2] : q;

  if (kindFilter === 'symbol') {
    const origTerm = query.slice(query.indexOf(':') + 1);
    return origTerm.length > 0
      ? [{ kind: 'symbol', group: 'Code', label: origTerm, detail: 'search definitions', insert: `@symbol:${origTerm}` }]
      : [];
  }

  // ── Knowledge mentions ─────────────────────────────────────────────────────
  const knowledgeKinds: MentionKind[] = ['person', 'project', 'decision', 'meeting'];
  const knowledge: MentionItem[] = [];
  if (!kindFilter || knowledgeKinds.includes(kindFilter as MentionKind)) {
    for (const n of vaultNotes) {
      const kind = CAT_TO_KIND[n.category];
      if (!kind) continue;
      if (kindFilter && kindFilter !== kind) continue;
      if (term && !n.title.toLowerCase().includes(term)) continue;
      knowledge.push({
        kind, group: 'Knowledge', label: n.title, detail: n.category,
        insert: `@${kind}:${slugifyName(n.title)}`,
      });
    }
  }

  // ── Code mentions ──────────────────────────────────────────────────────────
  let code: MentionItem[] = [];
  if (!kindFilter || kindFilter === 'file' || kindFilter === 'folder') {
    const scored = candidates
      .filter(c => (kindFilter === 'folder' ? c.isDir : kindFilter === 'file' ? !c.isDir : true))
      .filter(c => c.rel.toLowerCase().includes(term))
      .sort((a, b) => {
        const an = a.rel.split('/').pop()!.toLowerCase();
        const bn = b.rel.split('/').pop()!.toLowerCase();
        const as = an.startsWith(term) ? 0 : 1;
        const bs = bn.startsWith(term) ? 0 : 1;
        if (as !== bs) return as - bs;
        return a.rel.length - b.rel.length;
      });
    code = scored.map(c => ({
      kind: (c.isDir ? 'folder' : 'file') as MentionKind, group: 'Code' as const,
      label: c.rel.split('/').pop()!, detail: c.rel,
      insert: `${c.isDir ? '@folder:' : '@file:'}${c.rel}`,
    }));
  }

  // Knowledge first (higher signal), then code
  return [...knowledge, ...code].slice(0, limit);
}

/**
 * Expand @file/@folder/@symbol tokens in `text` into a context block.
 * Returns the original text plus a context prefix and the list of resolved sources.
 */
export async function expandMentions(
  text: string,
  workspace: string,
  vaultNotes: VaultNote[] = [],
): Promise<{ contextBlock: string; sources: string[] }> {
  const sources: string[] = [];
  const parts: string[] = [];

  // @person:/@project:/@decision:/@meeting: → inject a context card from the vault
  for (const m of text.matchAll(/@(person|project|decision|meeting):([^\s]+)/g)) {
    const [, kind, slug] = m;
    const note = vaultNotes.find(n => CAT_TO_KIND[n.category] === kind && slugifyName(n.title) === slug);
    if (!note) continue;
    const fm = note.frontmatter;
    const fields = ['role', 'organization', 'status', 'type', 'date', 'made_by']
      .filter(k => fm[k]).map(k => `${k}: ${fm[k]}`).join(' · ');
    // "recent interactions": notes that link to this one (meetings/emails)
    const linkers = vaultNotes
      .filter(o => o.path !== note.path && extractLinks(o.body).some(l => l.toLowerCase() === note.title.toLowerCase()))
      .slice(0, 3).map(o => o.title);
    const body = note.body.replace(/^#.*$/m, '').trim().slice(0, 800);
    parts.push(
      `${kind[0].toUpperCase() + kind.slice(1)} context — **${note.title}**${fields ? `\n${fields}` : ''}\n${body}` +
      (linkers.length ? `\nRecent interactions: ${linkers.join(', ')}` : '')
    );
    sources.push(`${kind}:${note.title}`);
  }

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
    .replace(/@symbol:([^\s]+)/g, '@$1')
    .replace(/@(?:person|project|decision|meeting):([^\s]+)/g, '@$1');
}
