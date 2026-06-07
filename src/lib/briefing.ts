/**
 * Weekly Briefing agent (Day 31).
 * Gathers recent action items, upcoming meetings, live-note updates and
 * knowledge-graph changes from the vault and produces a Monday-morning briefing
 * at vault/briefings/week-of-YYYY-MM-DD.md.
 */
import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { writeFile, notify } from './tauri';
import { vaultRoot, serializeNote, listVault, type VaultNote } from './vault';
import { listCalendarEvents, upcomingWithin } from './meetingprep';

function sep(workspace: string) { return workspace.includes('\\') ? '\\' : '/'; }

/** Monday of the current week as YYYY-MM-DD. */
export function weekOf(now = new Date()): string {
  const d = new Date(now);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function daysAgo(dateStr: string, now = Date.now()): number {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return Infinity;
  return (now - t) / 86400000;
}

interface BriefingContext {
  actionItems: string[];
  recentDecisions: string[];
  newPeople: string[];
  liveUpdates: string[];
  upcomingMeetings: string[];
}

function gatherBriefingContext(notes: VaultNote[], events: { title: string; date: string; time: string }[]): BriefingContext {
  const recent = (n: VaultNote) => daysAgo(n.frontmatter.updated ?? n.frontmatter.created ?? '') <= 7;

  // Action items: lines under an "Action Items" heading in recently-updated meeting notes
  const actionItems: string[] = [];
  for (const n of notes.filter(n => n.category === 'meetings' && recent(n))) {
    const m = n.body.match(/##\s+Action Items\s*\n([\s\S]*?)(?=\n##\s|$)/i);
    if (m) {
      for (const line of m[1].split('\n')) {
        const t = line.replace(/^[-*]\s*/, '').trim();
        if (t && t !== '—') actionItems.push(`${t} (${n.title})`);
      }
    }
  }

  return {
    actionItems: actionItems.slice(0, 12),
    recentDecisions: notes.filter(n => n.category === 'decisions' && recent(n)).map(n => n.title).slice(0, 8),
    newPeople: notes.filter(n => n.category === 'people' && daysAgo(n.frontmatter.created ?? '') <= 7).map(n => n.title).slice(0, 8),
    liveUpdates: notes.filter(n => n.frontmatter.type === 'live-note' && recent(n)).map(n => n.title).slice(0, 8),
    upcomingMeetings: events.map(e => `${e.title} — ${e.date} ${e.time}`).slice(0, 8),
  };
}

const BRIEFING_SYSTEM = `You write a concise weekly briefing for a developer. Use ONLY the provided context. Output Markdown with sections: "## Last week" (summary of decisions/people/action items), "## This week priorities", "## Blockers to address", "## Key meetings". Keep it tight and skip empty sections with "—". Never invent facts.`;

export async function generateBriefing(workspace: string, model: string, signal?: AbortSignal): Promise<string> {
  const notes = await listVault(workspace).catch(() => [] as VaultNote[]);
  const events = upcomingWithin(await listCalendarEvents(workspace), 7 * 24 * 60); // next 7 days
  const ctx = gatherBriefingContext(notes, events);

  const ollama = createOllama({ baseURL: 'http://localhost:11434/api' });
  const prompt = `Context for the week:
Open action items:
${ctx.actionItems.map(a => `- ${a}`).join('\n') || '- none'}

Recent decisions: ${ctx.recentDecisions.join(', ') || 'none'}
New people: ${ctx.newPeople.join(', ') || 'none'}
Live notes updated: ${ctx.liveUpdates.join(', ') || 'none'}
Upcoming meetings:
${ctx.upcomingMeetings.map(m => `- ${m}`).join('\n') || '- none'}

Write the briefing:`;

  const { text } = await generateText({ model: ollama(model), system: BRIEFING_SYSTEM, prompt, abortSignal: signal });
  return text.trim();
}

/** Generate + write the weekly briefing. Returns its path (or null on failure). */
export async function runWeeklyBriefing(workspace: string, model: string, signal?: AbortSignal): Promise<string | null> {
  const body = await generateBriefing(workspace, model, signal).catch(() => '');
  if (!body) return null;
  const week = weekOf();
  const path = [vaultRoot(workspace), 'briefings', `week-of-${week}.md`].join(sep(workspace));
  const fm = { type: 'briefing', name: `Briefing — week of ${week}`, date: week, generated_at: new Date().toISOString() };
  await writeFile(path, serializeNote(fm, `# Weekly Briefing — week of ${week}\n\n${body}`));
  await notify('Weekly briefing ready', `Your briefing for the week of ${week} is ready`);
  return path;
}
