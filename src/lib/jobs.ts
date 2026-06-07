/**
 * Background job registry (Day 28).
 * Jobs run while the app is open via the JobRunner (App.tsx). Definitions are
 * static; live state (status/lastRun/logs/enabled) lives in the store.
 *
 * Note: the sprint plan specifies a Rust tokio-cron-scheduler with SQLite
 * persistence for cross-restart survival. We run the in-app jobs as JS timers
 * (the "while the app is open" jobs) and persist enable/lastRun in the store;
 * an OS-level scheduler is a backend follow-up.
 */

export type JobId =
  | 'sync-gmail'
  | 'sync-calendar'
  | 'index-workspace'
  | 'live-notes'
  | 'meeting-prep'
  | 'weekly-briefing';

export type JobStatus = 'idle' | 'running' | 'done' | 'error' | 'disabled';

export interface JobDef {
  id: JobId;
  name: string;
  type: string;
  schedule: string;       // human-readable
  intervalMs?: number;    // for timer jobs; absent = event-driven
}

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

export const JOB_DEFS: JobDef[] = [
  { id: 'sync-gmail',      name: 'Sync Gmail',       type: 'sync',     schedule: 'every 6 hours',  intervalMs: 6 * HOUR },
  { id: 'sync-calendar',   name: 'Sync Calendar',    type: 'sync',     schedule: 'every 30 min',   intervalMs: 30 * MIN },
  { id: 'index-workspace', name: 'Index Workspace',  type: 'index',    schedule: 'on file change' /* event-driven */ },
  { id: 'live-notes',      name: 'Live Notes',       type: 'agent',    schedule: 'hourly check',   intervalMs: HOUR },
  { id: 'meeting-prep',    name: 'Meeting Prep',     type: 'agent',    schedule: 'every 5 min poll', intervalMs: 5 * MIN },
  { id: 'weekly-briefing', name: 'Weekly Briefing',  type: 'agent',    schedule: 'Mon 8:00 AM',    intervalMs: HOUR },
];

export function jobDef(id: JobId): JobDef {
  return JOB_DEFS.find(j => j.id === id) ?? JOB_DEFS[0];
}

/** Next Monday 08:00 local time, as a unix ms timestamp. */
export function nextMonday8am(from = new Date()): number {
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setHours(8);
  // days until Monday (1)
  const day = d.getDay();
  let add = (1 - day + 7) % 7;
  if (add === 0 && from.getTime() >= d.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}

// ─── Runner registry (App registers run fns; the Tasks panel triggers them) ──

const runners: Partial<Record<JobId, () => Promise<void>>> = {};
export function registerRunner(id: JobId, fn: () => Promise<void>) { runners[id] = fn; }
export async function runJobNow(id: JobId): Promise<void> { await runners[id]?.(); }
export function hasRunner(id: JobId): boolean { return !!runners[id]; }

/** Compute the next run time for a job given its last run. */
export function nextRunFor(id: JobId, lastRun: number | null, now = Date.now()): number | null {
  const def = jobDef(id);
  if (id === 'weekly-briefing') return nextMonday8am(new Date(now));
  if (id === 'index-workspace') return null; // event-driven
  if (!def.intervalMs) return null;
  return (lastRun ?? now) + def.intervalMs;
}
