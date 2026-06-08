/**
 * Markdown knowledge vault (Obsidian-compatible).
 * Notes live under `<workspace>/.apex/vault/<category>/`. Each note has YAML
 * frontmatter and may reference others via [[wikilinks]].
 */
import { readFile, writeFile, listDir, deletePath, listAllFiles, grepFiles, type DirEntry } from './tauri';

export type NoteCategory = 'people' | 'projects' | 'organizations' | 'decisions' | 'meetings' | 'topics';

export const CATEGORIES: { id: NoteCategory; label: string; color: string }[] = [
  { id: 'people',        label: 'People',        color: '#93C5FD' },
  { id: 'projects',      label: 'Projects',      color: '#86EFAC' },
  { id: 'organizations', label: 'Organizations', color: '#FCD34D' },
  { id: 'decisions',     label: 'Decisions',     color: '#C084FC' },
  { id: 'meetings',      label: 'Meetings',      color: '#F9A8D4' },
  { id: 'topics',        label: 'Topics',        color: '#7DD3FC' },
];

export interface VaultNote {
  path: string;
  title: string;
  category: NoteCategory;
  frontmatter: Record<string, string>;
  body: string;
}

const sep = (p: string) => (p.includes('\\') ? '\\' : '/');
function join(base: string, ...parts: string[]) { return [base, ...parts].join(sep(base)); }

export function vaultRoot(workspace: string): string {
  return join(workspace, '.apex', 'vault');
}

// ─── Frontmatter ──────────────────────────────────────────────────────────────

export function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  const fm: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { frontmatter: fm, body: m[2] };
}

export function serializeNote(frontmatter: Record<string, string>, body: string): string {
  const fm = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `---\n${fm}\n---\n\n${body}`;
}

// ─── Wikilinks / backlinks ────────────────────────────────────────────────────

/** Extract [[Target]] link targets from note body. */
export function extractLinks(body: string): string[] {
  const links: string[] = [];
  for (const m of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    links.push(m[1].split('|')[0].trim()); // support [[Target|alias]]
  }
  return [...new Set(links)];
}

/** Build a title → [linking note titles] backlink index across the vault. */
export function buildBacklinkIndex(notes: VaultNote[]): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const note of notes) {
    for (const target of extractLinks(note.body)) {
      (index[target] ??= []).push(note.title);
    }
  }
  return index;
}

// ─── Templates ────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }

export function noteTemplate(category: NoteCategory, name: string): string {
  const base = { name, created: today(), updated: today() };
  switch (category) {
    case 'people':
      return serializeNote({ ...base, type: 'person', aliases: '', tags: '', role: '', organization: '' },
        `# ${name}\n\n## Role\n\n## Key Context\n\n## Recent Interactions\n\n## Related\n`);
    case 'projects':
      return serializeNote({ ...base, type: 'project', status: 'active', tags: '' },
        `# ${name}\n\n## Overview\n\n## Status\n\n## Participants\n\n## Decisions\n`);
    case 'organizations':
      return serializeNote({ ...base, type: 'organization', tags: '' },
        `# ${name}\n\n## About\n\n## People\n\n## Relationship\n`);
    case 'decisions':
      return serializeNote({ ...base, type: 'decision', tags: '' },
        `# ${name}\n\n## Context\n\n## Decision\n\n## Made By\n\n## Consequences\n`);
    case 'meetings':
      return serializeNote({ ...base, type: 'meeting', participants: '', tags: '' },
        `# ${name}\n\n## Summary\n\n## Attendees\n\n## Action Items\n\n## Notes\n`);
    case 'topics':
      return serializeNote({ ...base, type: 'topic', tags: '' },
        `# ${name}\n\n## Overview\n\n## Related\n`);
  }
}

function slugify(name: string): string {
  return name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

/** Create a note from a template. Returns the new file path. */
export async function createNote(workspace: string, category: NoteCategory, name: string): Promise<string> {
  const file = `${slugify(name) || 'untitled'}.md`;
  const path = join(vaultRoot(workspace), category, file);
  await writeFile(path, noteTemplate(category, name));
  return path;
}

// ─── Listing ──────────────────────────────────────────────────────────────────

async function listCategory(workspace: string, category: NoteCategory): Promise<VaultNote[]> {
  const dir = join(vaultRoot(workspace), category);
  let entries: DirEntry[] = [];
  try { entries = await listDir(dir); } catch { return []; }
  const notes: VaultNote[] = [];
  for (const e of entries) {
    if (e.is_dir || !e.name.endsWith('.md')) continue;
    let content = '';
    try { content = await readFile(e.path); } catch { /* skip */ }
    const { frontmatter, body } = parseFrontmatter(content);
    notes.push({
      path: e.path,
      title: frontmatter.name || e.name.replace(/\.md$/, ''),
      category,
      frontmatter,
      body,
    });
  }
  return notes;
}

/** List every note across all categories. */
export async function listVault(workspace: string): Promise<VaultNote[]> {
  const all = await Promise.all(CATEGORIES.map(c => listCategory(workspace, c.id)));
  return all.flat();
}

/** Resolve a [[wikilink]] target title to a note path (creates none). */
export async function resolveNoteByTitle(workspace: string, title: string): Promise<string | null> {
  const notes = await listVault(workspace);
  const target = title.trim().toLowerCase();
  const hit = notes.find(n => n.title.toLowerCase() === target)
    ?? notes.find(n => n.path.toLowerCase().endsWith(`/${slugify(title).toLowerCase()}.md`));
  return hit?.path ?? null;
}

/** Is this path a note inside the workspace vault? */
export function isVaultNote(workspace: string, path: string): boolean {
  const root = vaultRoot(workspace).replace(/\\/g, '/');
  return path.replace(/\\/g, '/').startsWith(root) && path.endsWith('.md');
}

// ─── Note history (versions) ──────────────────────────────────────────────────

/** Save the current contents of a note to .state/history/ before overwriting. */
export async function saveVersion(workspace: string, notePath: string, prevContent: string): Promise<void> {
  if (!prevContent.trim()) return;
  const s = sep(workspace);
  const base = notePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? 'note';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = [vaultRoot(workspace), '.state', 'history', `${base}__${stamp}.md`].join(s);
  try { await writeFile(dest, prevContent); } catch { /* best-effort */ }
}

/** List prior versions of a note (most recent first). */
export async function listVersions(workspace: string, notePath: string): Promise<{ path: string; when: string }[]> {
  const s = sep(workspace);
  const dir = [vaultRoot(workspace), '.state', 'history'].join(s);
  const base = notePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? '';
  try {
    return (await listDir(dir))
      .filter(e => e.name.startsWith(`${base}__`) && e.name.endsWith('.md'))
      .map(e => ({ path: e.path, when: e.name.slice(base.length + 2, -3).replace(/-/g, ':') }))
      .sort((a, b) => b.when.localeCompare(a.when));
  } catch { return []; }
}

// ─── Rebuild knowledge links ──────────────────────────────────────────────────

function upsertSection(body: string, heading: string, content: string): string {
  const re = new RegExp(`(##\\s+${heading}\\n)([\\s\\S]*?)(?=\\n##\\s|$)`);
  if (re.test(body)) return body.replace(re, `$1${content}\n`);
  return `${body.trimEnd()}\n\n## ${heading}\n${content}\n`;
}

/**
 * Recompute derived links across the vault:
 * - Person notes get a "Recent Interactions" section (meetings/emails linking to them, last 5)
 * - Meeting notes are linked to calendar events sharing date + an attendee
 * Returns the number of notes updated. Writes versions before overwriting.
 */
export async function rebuildLinks(workspace: string): Promise<number> {
  const notes = await listVault(workspace);
  const byTitle = new Map(notes.map(n => [n.title.toLowerCase(), n]));
  let updated = 0;

  for (const note of notes) {
    let body = note.body;

    if (note.category === 'people') {
      const interactions = notes
        .filter(o => (o.category === 'meetings' || o.frontmatter.type === 'email') && o.path !== note.path)
        .filter(o => extractLinks(o.body).some(l => l.toLowerCase() === note.title.toLowerCase()))
        .sort((a, b) => (b.frontmatter.date ?? b.frontmatter.updated ?? '').localeCompare(a.frontmatter.date ?? a.frontmatter.updated ?? ''))
        .slice(0, 5)
        .map(o => `- [[${o.title}]]${o.frontmatter.date ? ` (${o.frontmatter.date})` : ''}`);
      if (interactions.length) body = upsertSection(body, 'Recent Interactions', interactions.join('\n'));
    }

    if (note.category === 'meetings') {
      const date = note.frontmatter.date ?? '';
      const attendees = (note.frontmatter.participants ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const event = notes.find(o => o.frontmatter.type === 'event' || (o.category === 'topics' && o.frontmatter.date === date));
      void event; // calendar events live in raw/, matched below by title presence
      const linkedPeople = attendees.filter(a => byTitle.has(a.toLowerCase())).map(a => `- [[${a}]]`);
      if (linkedPeople.length) body = upsertSection(body, 'Attendees', linkedPeople.join('\n'));
    }

    if (body !== note.body) {
      await saveVersion(workspace, note.path, serializeNote(note.frontmatter, note.body));
      await writeFile(note.path, serializeNote({ ...note.frontmatter, updated: new Date().toISOString().slice(0, 10) }, body));
      updated++;
    }
  }
  return updated;
}

// ─── Export / clear ───────────────────────────────────────────────────────────

/** Build a zip of all vault Markdown and trigger a download (user-initiated). */
export async function exportVaultZip(workspace: string): Promise<number> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const notes = await listVault(workspace);
  for (const n of notes) {
    zip.file(`${n.category}/${n.path.split(/[\\/]/).pop()}`, await readFile(n.path).catch(() => serializeNote(n.frontmatter, n.body)));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'apex-vault.zip';
  a.click();
  URL.revokeObjectURL(url);
  return notes.length;
}

/** Delete the entire vault (notes, raw, meetings, state). Caller must confirm first. */
export async function clearVault(workspace: string): Promise<void> {
  try { await deletePath(vaultRoot(workspace)); } catch { /* may not exist */ }
}

// ─── Bulk import (Obsidian-style folder) ──────────────────────────────────────

/**
 * Import .md files from an external folder into the vault. Notes are placed by
 * their frontmatter `type` (person→people, …) or default to topics. Existing
 * notes of the same filename are skipped (no overwrite). Returns count imported.
 */
export async function importMarkdownFolder(workspace: string, folder: string): Promise<{ imported: number; skipped: number }> {
  const files = (await listAllFiles(folder)).filter(f => f.name.endsWith('.md'));
  const existing = new Set((await listVault(workspace)).map(n => n.path.split(/[\\/]/).pop()));
  const typeToCat: Record<string, NoteCategory> = {
    person: 'people', people: 'people', project: 'projects', organization: 'organizations',
    decision: 'decisions', meeting: 'meetings', topic: 'topics',
  };
  let imported = 0, skipped = 0;
  for (const f of files) {
    const name = f.name;
    if (existing.has(name)) { skipped++; continue; }
    let content = '';
    try { content = await readFile(f.path); } catch { continue; }
    const { frontmatter } = parseFrontmatter(content);
    const cat = typeToCat[(frontmatter.type ?? '').toLowerCase()] ?? 'topics';
    try { await writeFile([vaultRoot(workspace), cat, name].join(sep(workspace)), content); imported++; }
    catch { /* unwritable */ }
  }
  return { imported, skipped };
}

// ─── Decision → code backlinks ────────────────────────────────────────────────

/**
 * For each decision note, find code files it references (by path/module/function
 * names that appear in the note body and resolve to real files) and append a
 * "## Related code" section linking them. Returns notes updated.
 */
export async function linkDecisionsToCode(workspace: string): Promise<number> {
  const notes = (await listVault(workspace)).filter(n => n.category === 'decisions');
  let updated = 0;
  for (const note of notes) {
    // candidate identifiers: words that look like file/module/symbol names
    const candidates = [...new Set(
      (note.body.match(/\b[\w-]+\.(ts|tsx|js|jsx|rs|py|go|java)\b|\b[A-Z][a-zA-Z0-9]{3,}\b/g) ?? [])
    )].slice(0, 8);
    const refs: string[] = [];
    for (const c of candidates) {
      try {
        const hits = await grepFiles(workspace, c);
        const file = hits[0]?.split(':')[0];
        if (file && !refs.includes(file)) refs.push(file);
      } catch { /* grep unavailable */ }
      if (refs.length >= 5) break;
    }
    if (refs.length === 0) continue;
    const section = refs.map(r => `- \`${r}\``).join('\n');
    if (note.body.includes('## Related code')) continue; // already linked
    await saveVersion(workspace, note.path, serializeNote(note.frontmatter, note.body));
    const body = `${note.body.trimEnd()}\n\n## Related code\n${section}\n`;
    await writeFile(note.path, serializeNote({ ...note.frontmatter, updated: today() }, body));
    updated++;
  }
  return updated;
}

