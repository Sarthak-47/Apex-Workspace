/**
 * Markdown knowledge vault (Obsidian-compatible).
 * Notes live under `<workspace>/.apex/vault/<category>/`. Each note has YAML
 * frontmatter and may reference others via [[wikilinks]].
 */
import { readFile, writeFile, listDir, type DirEntry } from './tauri';

export type NoteCategory = 'people' | 'projects' | 'organizations' | 'decisions' | 'meetings' | 'topics';

export const CATEGORIES: { id: NoteCategory; label: string; icon: string; color: string }[] = [
  { id: 'people',        label: 'People',        icon: '👤', color: '#93C5FD' },
  { id: 'projects',      label: 'Projects',      icon: '📦', color: '#86EFAC' },
  { id: 'organizations', label: 'Organizations', icon: '🏢', color: '#FCD34D' },
  { id: 'decisions',     label: 'Decisions',     icon: '⚖️', color: '#C084FC' },
  { id: 'meetings',      label: 'Meetings',      icon: '📅', color: '#F9A8D4' },
  { id: 'topics',        label: 'Topics',        icon: '🏷️', color: '#7DD3FC' },
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
