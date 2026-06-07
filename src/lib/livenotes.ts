/**
 * Live Notes (Day 29).
 * A live note is a vault note whose frontmatter carries `live: true`, an
 * `objective`, a `schedule`, and `sources`. On its schedule (or on demand) an
 * agent gathers context from the chosen sources and rewrites the note body to
 * satisfy the objective. Prior versions are kept (note history).
 */
import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { readFile, writeFile, listDir } from './tauri';
import {
  vaultRoot, parseFrontmatter, serializeNote, listVault, saveVersion,
  type VaultNote,
} from './vault';
import { searchIndex } from './codeindex';

export type LiveSource = 'vault' | 'codebase' | 'gmail' | 'github' | 'exa';

export interface LiveConfig {
  live: boolean;
  objective: string;
  schedule: string;          // preset key, see SCHEDULE_PRESETS
  sources: LiveSource[];
}

export const SCHEDULE_PRESETS: { value: string; label: string; cron: string }[] = [
  { value: 'morning', label: 'Every morning (9 AM)', cron: '0 9 * * *' },
  { value: 'hourly',  label: 'Every hour',           cron: '0 * * * *' },
  { value: 'evening', label: 'Every evening (6 PM)', cron: '0 18 * * *' },
  { value: 'weekly',  label: 'Every Monday (9 AM)',  cron: '0 9 * * 1' },
];

export function parseLiveConfig(note: VaultNote): LiveConfig | null {
  const fm = note.frontmatter;
  if (String(fm.live).toLowerCase() !== 'true') return null;
  return {
    live: true,
    objective: fm.objective ?? '',
    schedule: fm.schedule ?? 'morning',
    sources: (fm.sources ?? 'vault')
      .split(/[,\s]+/).map(s => s.trim()).filter(Boolean) as LiveSource[],
  };
}

export function findLiveNotes(notes: VaultNote[]): { note: VaultNote; config: LiveConfig }[] {
  return notes
    .map(note => ({ note, config: parseLiveConfig(note) }))
    .filter((x): x is { note: VaultNote; config: LiveConfig } => x.config !== null);
}

function sep(workspace: string) { return workspace.includes('\\') ? '\\' : '/'; }
function slug(name: string) { return name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'live-note'; }
function today() { return new Date().toISOString().slice(0, 10); }

/** Create a new live note in topics/. Returns its path. */
export async function createLiveNote(
  workspace: string, title: string, objective: string, schedule: string, sources: LiveSource[],
): Promise<string> {
  const s = sep(workspace);
  const path = [vaultRoot(workspace), 'topics', `${slug(title)}.md`].join(s);
  const fm = {
    name: title, type: 'live-note', live: 'true', objective,
    schedule, sources: sources.join(', '), created: today(), updated: today(),
  };
  const body = `# ${title}\n\n_Live note — auto-updates to satisfy: "${objective}". Run it from the Tasks panel or the ⚡ filter._\n\n## Current\n_(not yet run)_\n`;
  await writeFile(path, serializeNote(fm, body));
  return path;
}

// ─── Source gathering ─────────────────────────────────────────────────────────

async function gatherContext(workspace: string, config: LiveConfig, model: string): Promise<string> {
  const blocks: string[] = [];

  if (config.sources.includes('vault')) {
    const notes = await listVault(workspace).catch(() => [] as VaultNote[]);
    const terms = config.objective.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const relevant = notes
      .filter(n => terms.some(t => n.title.toLowerCase().includes(t) || n.body.toLowerCase().includes(t)))
      .slice(0, 8)
      .map(n => `- ${n.title} (${n.category}): ${n.body.replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 200)}`);
    if (relevant.length) blocks.push(`Vault notes:\n${relevant.join('\n')}`);
  }

  if (config.sources.includes('codebase')) {
    const hits = await searchIndex(config.objective, 5, undefined).catch(() => []);
    if (hits.length) {
      blocks.push('Codebase:\n' + hits.map(h => `// ${h.filePath.split(/[\\/]/).pop()}:${h.startLine}\n${h.text.slice(0, 300)}`).join('\n\n'));
    }
  }

  if (config.sources.includes('gmail')) {
    try {
      const dir = [vaultRoot(workspace), 'raw', 'gmail'].join(sep(workspace));
      const files = (await listDir(dir)).filter(e => e.name.endsWith('.md')).slice(0, 5);
      const threads = await Promise.all(files.map(f => readFile(f.path).catch(() => '')));
      const text = threads.filter(Boolean).map(t => t.slice(0, 600)).join('\n---\n');
      if (text) blocks.push(`Recent email:\n${text}`);
    } catch { /* none */ }
  }

  for (const ext of ['github', 'exa'] as LiveSource[]) {
    if (config.sources.includes(ext)) blocks.push(`(${ext}: requires an MCP server — not yet configured)`);
  }

  void model;
  return blocks.join('\n\n');
}

// ─── Run ──────────────────────────────────────────────────────────────────────

export interface LiveRunResult { updated: boolean; before: string; after: string }

export async function runLiveNote(
  workspace: string, note: VaultNote, model: string, signal?: AbortSignal,
): Promise<LiveRunResult> {
  const config = parseLiveConfig(note);
  if (!config) return { updated: false, before: note.body, after: note.body };

  const context = await gatherContext(workspace, config, model);
  const ollama = createOllama({ baseURL: 'http://localhost:11434/api' });

  const system = `You maintain a "live note" — a Markdown document with a standing objective. Rewrite the note body so it best satisfies the objective using ONLY the provided context. Keep it concise and well-structured with Markdown headings. Do not invent facts. Preserve the top-level "# title" heading.`;
  const prompt = `Objective: ${config.objective}\n\nCurrent note body:\n${note.body}\n\nContext from sources (${config.sources.join(', ')}):\n${context || '(no context found)'}\n\nRewrite the note body now:`;

  let after = note.body;
  try {
    const { text } = await generateText({ model: ollama(model), system, prompt, abortSignal: signal });
    if (text.trim()) after = text.trim();
  } catch {
    return { updated: false, before: note.body, after: note.body };
  }

  if (after !== note.body) {
    await saveVersion(workspace, note.path, serializeNote(note.frontmatter, note.body));
    await writeFile(note.path, serializeNote({ ...note.frontmatter, updated: today() }, after));
    return { updated: true, before: note.body, after };
  }
  return { updated: false, before: note.body, after };
}

/** Run every live note (used by the live-notes scheduled job). Returns count updated. */
export async function runAllLiveNotes(workspace: string, model: string, signal?: AbortSignal): Promise<number> {
  const notes = await listVault(workspace).catch(() => [] as VaultNote[]);
  const live = findLiveNotes(notes);
  let updated = 0;
  for (const { note } of live) {
    if (signal?.aborted) break;
    const r = await runLiveNote(workspace, note, model, signal);
    if (r.updated) updated++;
  }
  return updated;
}

// keep parseFrontmatter referenced (re-exported convenience)
export { parseFrontmatter };
