/**
 * Email draft grounding (Day 31).
 * Lists synced Gmail threads from the vault, and drafts replies grounded in the
 * thread plus knowledge context (participant people-notes, related projects).
 * Sending is intentionally NOT implemented — the user copies/saves the draft.
 */
import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { readFile, writeFile, listDir } from './tauri';
import { vaultRoot, parseFrontmatter, serializeNote, listVault, type VaultNote } from './vault';

export interface EmailThread {
  path: string;
  subject: string;
  participants: string[];
  dateRange: string;
  body: string;
}

function sep(workspace: string) { return workspace.includes('\\') ? '\\' : '/'; }
function slug(s: string) { return s.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 40) || 'reply'; }

export async function listThreads(workspace: string): Promise<EmailThread[]> {
  const dir = [vaultRoot(workspace), 'raw', 'gmail'].join(sep(workspace));
  try {
    const files = (await listDir(dir)).filter(e => e.name.endsWith('.md'));
    const threads = await Promise.all(files.map(async f => {
      const content = await readFile(f.path).catch(() => '');
      const { frontmatter, body } = parseFrontmatter(content);
      return {
        path: f.path,
        subject: frontmatter.subject || f.name.replace(/\.md$/, ''),
        participants: (frontmatter.participants ?? '').split(',').map(s => s.trim()).filter(Boolean),
        dateRange: frontmatter.date_range ?? '',
        body,
      };
    }));
    return threads;
  } catch { return []; }
}

function participantNames(thread: EmailThread): string[] {
  // strip "Name <email>" → Name
  return thread.participants.map(p => p.replace(/<[^>]+>/, '').trim()).filter(Boolean);
}

const DRAFT_SYSTEM = `You draft a professional, concise email reply on the user's behalf. Use the thread and the provided knowledge context (who the people are, related projects, past commitments). Match a natural, direct tone. Output ONLY the reply body — no subject line, no "Send" — the user will review and send it themselves. Never invent commitments that aren't supported by context.`;

export async function draftReply(workspace: string, thread: EmailThread, model: string, signal?: AbortSignal): Promise<string> {
  const notes = await listVault(workspace).catch(() => [] as VaultNote[]);
  const names = participantNames(thread).map(n => n.toLowerCase());
  const people = notes.filter(n => n.category === 'people' && names.some(nm => nm.includes(n.title.toLowerCase()) || n.title.toLowerCase().includes(nm)));
  const projects = notes.filter(n => n.category === 'projects').slice(0, 3);

  const context = [
    people.length ? 'People:\n' + people.map(p => `- ${p.title}: ${p.body.replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 200)}`).join('\n') : '',
    projects.length ? 'Projects:\n' + projects.map(p => `- ${p.title}: ${p.frontmatter.status ?? ''}`).join('\n') : '',
  ].filter(Boolean).join('\n\n');

  const ollama = createOllama({ baseURL: 'http://localhost:11434/api' });
  const prompt = `Email thread (subject: ${thread.subject}):\n${thread.body.slice(0, 4000)}\n\nKnowledge context:\n${context || '(none)'}\n\nDraft a reply:`;
  const { text } = await generateText({ model: ollama(model), system: DRAFT_SYSTEM, prompt, abortSignal: signal });
  return text.trim();
}

/** Save a draft to vault/drafts/. Returns its path. */
export async function saveDraft(workspace: string, thread: EmailThread, draft: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const path = [vaultRoot(workspace), 'drafts', `${date}-reply-${slug(thread.subject)}.md`].join(sep(workspace));
  const fm = { type: 'draft', subject: `Re: ${thread.subject}`, to: thread.participants.join(', '), created: date };
  await writeFile(path, serializeNote(fm, `# Re: ${thread.subject}\n\n${draft}`));
  return path;
}
