/**
 * Entity extraction pipeline (Day 20).
 * Reads raw Gmail thread Markdown from the vault, batches threads, and uses the
 * Vercel AI SDK `generateObject()` with a JSON schema to extract people,
 * organizations, projects, decisions, open questions and action items. Results
 * are merged into vault notes (dedup by email / fuzzy name). Runs as a
 * non-blocking background task; never touches the UI thread beyond progress.
 */
import { generateObject } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { z } from 'zod';
import { readFile, writeFile, listDir } from './tauri';
import {
  vaultRoot, parseFrontmatter, serializeNote, listVault, saveVersion,
  type VaultNote, type NoteCategory,
} from './vault';

export type Strictness = 'high' | 'medium' | 'low';

// ─── Extraction schema ────────────────────────────────────────────────────────

const ExtractionSchema = z.object({
  people: z.array(z.object({
    name: z.string(),
    email: z.string().optional().default(''),
    role: z.string().optional().default(''),
    organization: z.string().optional().default(''),
    relationship_to_user: z.string().optional().default(''),
    key_info: z.string().optional().default(''),
  })).default([]),
  organizations: z.array(z.object({
    name: z.string(),
    type: z.string().optional().default(''),
    relationship: z.string().optional().default(''),
  })).default([]),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string().optional().default(''),
    status: z.string().optional().default(''),
    participants: z.array(z.string()).optional().default([]),
  })).default([]),
  decisions: z.array(z.object({
    title: z.string(),
    summary: z.string().optional().default(''),
    context: z.string().optional().default(''),
    made_by: z.string().optional().default(''),
    date: z.string().optional().default(''),
  })).default([]),
  open_questions: z.array(z.object({
    question: z.string(),
    context: z.string().optional().default(''),
    urgency: z.string().optional().default(''),
  })).default([]),
  action_items: z.array(z.object({
    task: z.string(),
    owner: z.string().optional().default(''),
    due_date: z.string().optional().default(''),
  })).default([]),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

// ─── Strictness prompts ───────────────────────────────────────────────────────

const BASE_PROMPT = `You extract structured knowledge from email threads. Identify people, organizations, projects, decisions, open questions and action items. Only include entities that genuinely appear. Use empty arrays when nothing applies. Never invent details.`;

export function strictnessPrompt(level: Strictness): string {
  switch (level) {
    case 'high':
      return `${BASE_PROMPT}\nSTRICTNESS: HIGH. Only extract people you are highly confident are real human contacts the user personally knows. Ignore newsletters, automated senders, and mass mail entirely. Prefer fewer, high-quality entities.`;
    case 'medium':
      return `${BASE_PROMPT}\nSTRICTNESS: MEDIUM. Extract people from personalized business correspondence. Skip consumer/marketing/mass mail. A real human writing directly to the user counts.`;
    case 'low':
      return `${BASE_PROMPT}\nSTRICTNESS: LOW. Extract any identifiable human sender. Only skip obviously automated mail (no-reply, system notifications).`;
  }
}

// ─── Strictness auto-detection ────────────────────────────────────────────────

const AUTOMATED_RE = /no-?reply|do-?not-?reply|notification|mailer-daemon|newsletter|updates@|noreply/i;

/** Extract sender email addresses from a raw thread's markdown frontmatter. */
function sendersFromThread(content: string): string[] {
  const { frontmatter } = parseFrontmatter(content);
  const participants = frontmatter.participants ?? '';
  const emails: string[] = [];
  for (const m of participants.matchAll(/<([^>]+@[^>]+)>/g)) emails.push(m[1].toLowerCase());
  // also bare emails
  for (const m of participants.matchAll(/([\w.+-]+@[\w.-]+\.\w+)/g)) emails.push(m[1].toLowerCase());
  return [...new Set(emails)];
}

export function recommendStrictness(humanSenderCount: number): Strictness {
  if (humanSenderCount > 100) return 'high';
  if (humanSenderCount >= 30) return 'medium';
  return 'low';
}

/** Analyse the first ~100 raw threads and recommend a strictness level. */
export async function detectStrictness(workspace: string): Promise<{ level: Strictness; humanSenders: number }> {
  const dir = `${vaultRoot(workspace)}/raw/gmail`.replace(/\//g, workspace.includes('\\') ? '\\' : '/');
  let files: { path: string; name: string }[] = [];
  try { files = (await listDir(dir)).filter(e => e.name.endsWith('.md')).map(e => ({ path: e.path, name: e.name })); }
  catch { return { level: 'low', humanSenders: 0 }; }

  const senders = new Set<string>();
  for (const f of files.slice(0, 100)) {
    let content = '';
    try { content = await readFile(f.path); } catch { continue; }
    for (const email of sendersFromThread(content)) {
      if (!AUTOMATED_RE.test(email)) senders.add(email);
    }
  }
  return { level: recommendStrictness(senders.size), humanSenders: senders.size };
}

// ─── Fuzzy matching / dedup ───────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Find an existing note that matches by email (frontmatter) or fuzzy name. */
export function findMatch(notes: VaultNote[], name: string, email?: string): VaultNote | undefined {
  const e = (email ?? '').toLowerCase();
  if (e) {
    const byEmail = notes.find(n => (n.frontmatter.email ?? '').toLowerCase() === e);
    if (byEmail) return byEmail;
  }
  return notes.find(n => levenshtein(n.title, name) <= 2);
}

// ─── Note merge / create ──────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }
function slug(name: string): string { return name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-') || 'untitled'; }
function notePath(workspace: string, cat: NoteCategory, name: string): string {
  const sep = workspace.includes('\\') ? '\\' : '/';
  return [vaultRoot(workspace), cat, `${slug(name)}.md`].join(sep);
}

interface MergeStats { created: number; updated: number }

async function upsertNote(
  workspace: string,
  cat: NoteCategory,
  existing: VaultNote[],
  name: string,
  email: string | undefined,
  frontmatterPatch: Record<string, string>,
  appendSection: string,
  sourceFile: string,
  stats: MergeStats,
) {
  const match = findMatch(existing.filter(n => n.category === cat), name, email);
  if (match) {
    // merge: update frontmatter fields (fill blanks), append section + source backlink
    const fm = { ...match.frontmatter };
    for (const [k, v] of Object.entries(frontmatterPatch)) {
      if (v && !fm[k]) fm[k] = v;
    }
    fm.updated = today();
    const sources = new Set((fm.sources ?? '').split(',').map(s => s.trim()).filter(Boolean));
    sources.add(sourceFile);
    fm.sources = [...sources].join(', ');
    const body = `${match.body.trimEnd()}\n\n## Update ${today()}\n${appendSection}\n`;
    // Save the prior version before overwriting (note history)
    await saveVersion(workspace, match.path, serializeNote(match.frontmatter, match.body));
    await writeFile(match.path, serializeNote(fm, body));
    stats.updated++;
  } else {
    const fm: Record<string, string> = {
      name, type: cat === 'people' ? 'person' : cat.replace(/s$/, ''),
      created: today(), updated: today(), sources: sourceFile,
      ...frontmatterPatch,
    };
    const body = `# ${name}\n\n${appendSection}\n`;
    await writeFile(notePath(workspace, cat, name), serializeNote(fm, body));
    stats.created++;
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface ExtractProgress { batch: number; totalBatches: number; phase: string }
export interface ExtractSummary { threads: number; created: number; updated: number; errors: number }

const BATCH = 20;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function extractFromGmail(
  workspace: string,
  level: Strictness,
  model: string,
  onProgress?: (p: ExtractProgress) => void,
  signal?: AbortSignal,
): Promise<ExtractSummary> {
  const sep = workspace.includes('\\') ? '\\' : '/';
  const gmailDir = [vaultRoot(workspace), 'raw', 'gmail'].join(sep);
  const meetingsDir = [vaultRoot(workspace), 'meetings'].join(sep);
  let files: { path: string }[] = [];
  // Meetings first — they always carry high-signal entities, regardless of strictness.
  try { files.push(...(await listDir(meetingsDir)).filter(e => e.name.endsWith('.md')).map(e => ({ path: e.path }))); } catch { /* none */ }
  try { files.push(...(await listDir(gmailDir)).filter(e => e.name.endsWith('.md')).map(e => ({ path: e.path }))); } catch { /* none */ }
  if (files.length === 0) return { threads: 0, created: 0, updated: 0, errors: 0 };

  const ollama = createOllama({ baseURL: 'http://localhost:11434/api' });
  const batches = chunk(files, BATCH);
  const stats: MergeStats = { created: 0, updated: 0 };
  let errors = 0;

  for (let i = 0; i < batches.length; i++) {
    if (signal?.aborted) break;
    onProgress?.({ batch: i, totalBatches: batches.length, phase: 'reading' });

    const contents: string[] = [];
    const sourceNames: string[] = [];
    for (const f of batches[i]) {
      try { contents.push(await readFile(f.path)); sourceNames.push(f.path.split(/[\\/]/).pop() ?? f.path); }
      catch { /* skip */ }
    }
    if (contents.length === 0) continue;

    onProgress?.({ batch: i, totalBatches: batches.length, phase: 'extracting' });
    let result: Extraction;
    try {
      const { object } = await generateObject({
        model: ollama(model),
        schema: ExtractionSchema,
        system: strictnessPrompt(level),
        prompt: `Extract knowledge from these ${contents.length} email threads:\n\n${contents.join('\n\n---THREAD---\n\n').slice(0, 24000)}`,
        abortSignal: signal,
      });
      result = object;
    } catch { errors++; continue; }

    // Re-list vault each batch so dedup sees prior batches' notes
    const existing = await listVault(workspace).catch(() => [] as VaultNote[]);
    const src = sourceNames.join(', ');

    for (const p of result.people) {
      await upsertNote(workspace, 'people', existing, p.name, p.email,
        { email: p.email, role: p.role, organization: p.organization },
        `**Role:** ${p.role || '—'}\n**Org:** ${p.organization || '—'}\n**Relationship:** ${p.relationship_to_user || '—'}\n\n${p.key_info || ''}`,
        src, stats).catch(() => { errors++; });
    }
    for (const o of result.organizations) {
      await upsertNote(workspace, 'organizations', existing, o.name, undefined,
        { type: o.type }, `**Type:** ${o.type || '—'}\n**Relationship:** ${o.relationship || '—'}`, src, stats).catch(() => { errors++; });
    }
    for (const pr of result.projects) {
      await upsertNote(workspace, 'projects', existing, pr.name, undefined,
        { status: pr.status }, `${pr.description || ''}\n\n**Status:** ${pr.status || '—'}\n**Participants:** ${(pr.participants || []).join(', ') || '—'}`, src, stats).catch(() => { errors++; });
    }
    for (const d of result.decisions) {
      await upsertNote(workspace, 'decisions', existing, d.title, undefined,
        {}, `${d.summary || ''}\n\n**Context:** ${d.context || '—'}\n**Made by:** ${d.made_by || '—'}\n**Date:** ${d.date || '—'}`, src, stats).catch(() => { errors++; });
    }
  }

  onProgress?.({ batch: batches.length, totalBatches: batches.length, phase: 'done' });
  return { threads: files.length, created: stats.created, updated: stats.updated, errors };
}
