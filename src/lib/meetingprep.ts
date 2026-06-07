/**
 * Meeting Prep Agent (Day 30).
 * Polls synced calendar events; 60 min before an event with attendees (and no
 * existing prep note) it gathers context — attendee people-notes, recent
 * meetings together, related projects, recent email — and writes a prep brief
 * to vault/meetings/prep-*.md.
 */
import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { readFile, writeFile, listDir, notify } from './tauri';
import {
  vaultRoot, parseFrontmatter, serializeNote, listVault, extractLinks,
  type VaultNote,
} from './vault';

export interface CalEvent {
  path: string;
  title: string;
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM
  attendees: string[];
  startsAt: number;    // unix ms (0 if unknown)
  description: string;
}

function sep(workspace: string) { return workspace.includes('\\') ? '\\' : '/'; }
function slug(s: string) { return s.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'event'; }

export function parseEvent(path: string, content: string): CalEvent {
  const { frontmatter, description } = (() => {
    const p = parseFrontmatter(content);
    return { frontmatter: p.frontmatter, description: p.body };
  })();
  const date = frontmatter.date ?? '';
  const time = frontmatter.time ?? '';
  const attendees = (frontmatter.attendees ?? '').split(',').map(s => s.trim()).filter(Boolean);
  let startsAt = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const t = /^\d{2}:\d{2}$/.test(time) ? time : '09:00';
    const ms = Date.parse(`${date}T${t}:00`);
    if (!Number.isNaN(ms)) startsAt = ms;
  }
  return { path, title: frontmatter.title ?? frontmatter.name ?? '(untitled)', date, time, attendees, startsAt, description };
}

export async function listCalendarEvents(workspace: string): Promise<CalEvent[]> {
  const dir = [vaultRoot(workspace), 'raw', 'calendar'].join(sep(workspace));
  try {
    const files = (await listDir(dir)).filter(e => e.name.endsWith('.md'));
    const events = await Promise.all(files.map(async f => parseEvent(f.path, await readFile(f.path).catch(() => ''))));
    return events.sort((a, b) => a.startsAt - b.startsAt);
  } catch { return []; }
}

/** Events starting within `withinMin` minutes from `now` (and not already past). */
export function upcomingWithin(events: CalEvent[], withinMin: number, now = Date.now()): CalEvent[] {
  const horizon = now + withinMin * 60 * 1000;
  return events.filter(e => e.startsAt > 0 && e.startsAt >= now && e.startsAt <= horizon && e.attendees.length > 0);
}

export function prepNotePath(workspace: string, event: CalEvent): string {
  const hhmm = event.time.replace(':', '-') || '00-00';
  return [vaultRoot(workspace), 'meetings', `prep-${event.date}-${hhmm}-${slug(event.title)}.md`].join(sep(workspace));
}

// ─── Context ──────────────────────────────────────────────────────────────────

function gatherPrepContext(event: CalEvent, notes: VaultNote[]): string {
  const attLower = event.attendees.map(a => a.toLowerCase());
  const matchesAttendee = (n: VaultNote) =>
    extractLinks(n.body).some(l => attLower.includes(l.toLowerCase())) ||
    attLower.some(a => n.title.toLowerCase().includes(a) || a.includes(n.title.toLowerCase()));

  const blocks: string[] = [];

  const people = notes.filter(n => n.category === 'people' && attLower.some(a => a.includes(n.title.toLowerCase()) || n.title.toLowerCase().includes(a)));
  if (people.length) blocks.push('Attendee notes:\n' + people.map(p => `### ${p.title}\n${p.body.replace(/^#.*$/m, '').trim().slice(0, 400)}`).join('\n\n'));

  const pastMeetings = notes.filter(n => n.category === 'meetings' && !n.path.includes('prep-') && matchesAttendee(n))
    .sort((a, b) => (b.frontmatter.date ?? '').localeCompare(a.frontmatter.date ?? '')).slice(0, 3);
  if (pastMeetings.length) blocks.push('Recent meetings together:\n' + pastMeetings.map(m => `- ${m.title} (${m.frontmatter.date ?? '?'}): ${m.body.replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 200)}`).join('\n'));

  const decisions = notes.filter(n => n.category === 'decisions' && matchesAttendee(n)).slice(0, 3);
  if (decisions.length) blocks.push('Past decisions:\n' + decisions.map(d => `- ${d.title}`).join('\n'));

  const projects = notes.filter(n => n.category === 'projects' && matchesAttendee(n)).slice(0, 3);
  if (projects.length) blocks.push('Related projects:\n' + projects.map(p => `- ${p.title}: ${p.frontmatter.status ?? ''}`).join('\n'));

  return blocks.join('\n\n');
}

// ─── Generate ─────────────────────────────────────────────────────────────────

const PREP_SYSTEM = `You prepare a concise pre-meeting brief. Use ONLY the provided context. Output Markdown with these sections: "## Quick context (who's who)", "## Past decisions together", "## Open questions to address", "## Action items from last meeting", "## Talking points", "## Key commitments made". Keep each section short and skip a section (write "—") if there's nothing relevant. Never invent facts.`;

export async function generatePrep(event: CalEvent, notes: VaultNote[], model: string, signal?: AbortSignal): Promise<string> {
  const context = gatherPrepContext(event, notes);
  const ollama = createOllama({ baseURL: 'http://localhost:11434/api' });
  const prompt = `Meeting: ${event.title}\nWhen: ${event.date} ${event.time}\nAttendees: ${event.attendees.join(', ')}\nDescription: ${event.description.replace(/^#.*$/m, '').trim().slice(0, 500)}\n\nContext:\n${context || '(no prior context found)'}\n\nWrite the brief:`;
  const { text } = await generateText({ model: ollama(model), system: PREP_SYSTEM, prompt, abortSignal: signal });
  return text.trim();
}

/** Generate + write a prep note for a single event. Returns the note path (or null). */
export async function prepForEvent(workspace: string, event: CalEvent, model: string, signal?: AbortSignal): Promise<string | null> {
  const notes = await listVault(workspace).catch(() => [] as VaultNote[]);
  const body = await generatePrep(event, notes, model, signal).catch(() => '');
  if (!body) return null;
  const path = prepNotePath(workspace, event);
  const fm = {
    type: 'meeting-prep', name: `Prep — ${event.title}`,
    event: event.title, attendees: event.attendees.join(', '),
    date: event.date, generated_at: new Date().toISOString(),
  };
  await writeFile(path, serializeNote(fm, `# Prep — ${event.title}\n\n*${event.date} ${event.time} · ${event.attendees.join(', ')}*\n\n${body}`));
  await notify('Meeting prep ready', `Your prep for "${event.title}" is ready`);
  return path;
}

/** Scheduled run: prep all upcoming (≤60 min) events lacking a prep note. */
export async function runMeetingPrep(workspace: string, model: string, signal?: AbortSignal): Promise<number> {
  const events = await listCalendarEvents(workspace);
  const upcoming = upcomingWithin(events, 60);
  if (upcoming.length === 0) return 0;

  // existing prep notes to avoid duplicates
  const meetingDir = [vaultRoot(workspace), 'meetings'].join(sep(workspace));
  const existing = new Set<string>();
  try { for (const e of await listDir(meetingDir)) if (e.name.startsWith('prep-')) existing.add(e.name); } catch { /* none */ }

  let made = 0;
  for (const ev of upcoming) {
    if (signal?.aborted) break;
    const fname = prepNotePath(workspace, ev).split(/[\\/]/).pop()!;
    if (existing.has(fname)) continue;
    const path = await prepForEvent(workspace, ev, model, signal);
    if (path) made++;
  }
  return made;
}
