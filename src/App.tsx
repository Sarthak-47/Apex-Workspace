import { useEffect } from "react";
import { useAppStore } from "@/store";
import { checkOllama } from "@/lib/ollama";
import { getGitBranch, startWatching, stopWatching, onFsChange, gmailStatus, gmailSync, calendarStatus, calendarSync, notify } from "@/lib/tauri";
import { indexFile } from "@/lib/codeindex";
import { JOB_DEFS, nextRunFor, registerRunner, jobDef, type JobId } from "@/lib/jobs";
import { runAllLiveNotes } from "@/lib/livenotes";
import { runMeetingPrep } from "@/lib/meetingprep";
import { runWeeklyBriefing } from "@/lib/briefing";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { DiffReview } from "@/components/ui/DiffReview";
import { SettingsDialog } from "@/components/ui/SettingsDialog";
import { Titlebar } from "@/components/layout/Titlebar";
import { ModeBar } from "@/components/layout/ModeBar";
import { LeftNav } from "@/components/layout/LeftNav";
import { LeftPanel } from "@/components/layout/LeftPanel";
import { CenterArea } from "@/components/layout/CenterArea";
import { IntelPanel } from "@/components/layout/IntelPanel";
import { TerminalPanel } from "@/components/layout/TerminalPanel";
import { StatusBar } from "@/components/layout/StatusBar";
import { Toaster } from "@/components/ui/Toaster";

export default function App() {
  const {
    leftPanelOpen, leftPanelWidth,
    leftPanelView, setLeftPanelView,
    toggleLeftPanel,
    intelPanelOpen, intelPanelWidth,
    terminalOpen, terminalHeight, toggleTerminal,
    setOllamaStatus, ollamaOnline, ollamaModels,
    ollamaSelectedModel, setOllamaSelectedModel,
    setGitBranch, workspacePath,
    commandPaletteOpen, setCommandPaletteOpen,
    settingsOpen, setSettingsOpen,
    embedModel,
  } = useAppStore();

  // ── Ollama health polling (every 5 s) ──────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      const { online, models } = await checkOllama();
      setOllamaStatus(online, models.map(m => m.name));
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [setOllamaStatus]);

  // ── Auto-select first available model when Ollama comes online ────────────
  useEffect(() => {
    if (ollamaOnline && ollamaModels.length > 0) {
      if (!ollamaSelectedModel || !ollamaModels.includes(ollamaSelectedModel)) {
        setOllamaSelectedModel(ollamaModels[0]);
      }
    }
  }, [ollamaOnline, ollamaModels, ollamaSelectedModel, setOllamaSelectedModel]);

  // ── Git branch — re-read whenever workspace changes ────────────────────────
  useEffect(() => {
    if (!workspacePath) { setGitBranch(''); return; }
    getGitBranch(workspacePath).then(setGitBranch);
  }, [workspacePath, setGitBranch]);

  // ── File watcher: start on workspace open, re-index changed files (Tauri) ──
  useEffect(() => {
    if (!workspacePath) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Set<string>();

    const flush = () => {
      const files = [...pending];
      pending.clear();
      // Re-index changed files incrementally (no-op without Ollama / index)
      for (const f of files) indexFile(f, embedModel).catch(() => {});
    };

    startWatching(workspacePath);
    onFsChange((change) => {
      for (const p of change.paths) {
        if (/\.(ts|tsx|js|jsx|rs|py|go|java|md|json|css|scss|html|toml|yaml|yml)$/i.test(p)) pending.add(p);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 2000);
    }).then(fn => { if (cancelled) fn(); else unlisten = fn; });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unlisten?.();
      stopWatching();
    };
  }, [workspacePath, embedModel]);

  // ── Background job runner (unified scheduler while app is open) ────────────
  useEffect(() => {
    if (!workspacePath) return;
    const { setJobRuntime, appendJobLog } = useAppStore.getState();

    // Seed runtimes
    for (const def of JOB_DEFS) {
      const existing = useAppStore.getState().jobs[def.id];
      if (!existing) {
        setJobRuntime(def.id, { status: 'idle', enabled: true, lastRun: null, nextRun: nextRunFor(def.id, null), lastResult: '', logs: [], startedAt: null });
      }
    }

    // Run functions per job
    const runFns: Record<JobId, () => Promise<string>> = {
      'sync-gmail': async () => {
        const s = await gmailStatus(workspacePath);
        if (!s.connected) return 'Gmail not connected';
        const r = await gmailSync(workspacePath, 30);
        return `Synced ${r.thread_count} threads (${r.new_or_changed} new)`;
      },
      'sync-calendar': async () => {
        const s = await calendarStatus(workspacePath);
        if (!s.connected) return 'Calendar not connected';
        const r = await calendarSync(workspacePath);
        return `Synced ${r.thread_count} events`;
      },
      'index-workspace': async () => 'Indexing runs automatically on file changes',
      'live-notes': async () => {
        const model = useAppStore.getState().ollamaSelectedModel || 'llama3.1';
        if (!useAppStore.getState().ollamaOnline) return 'Ollama offline — skipped';
        const n = await runAllLiveNotes(workspacePath, model);
        return n > 0 ? `Updated ${n} live note${n === 1 ? '' : 's'}` : 'No live notes to update';
      },
      'meeting-prep': async () => {
        const model = useAppStore.getState().ollamaSelectedModel || 'llama3.1';
        if (!useAppStore.getState().ollamaOnline) return 'Ollama offline — skipped';
        const n = await runMeetingPrep(workspacePath, model);
        return n > 0 ? `Prepared ${n} meeting brief${n === 1 ? '' : 's'}` : 'No meetings starting soon';
      },
      'weekly-briefing': async () => {
        const model = useAppStore.getState().ollamaSelectedModel || 'llama3.1';
        if (!useAppStore.getState().ollamaOnline) return 'Ollama offline — skipped';
        const path = await runWeeklyBriefing(workspacePath, model);
        return path ? `Briefing written: ${path.split(/[\\/]/).pop()}` : 'Briefing skipped';
      },
    };

    const runJob = async (id: JobId) => {
      const st = useAppStore.getState().jobs[id];
      if (st?.status === 'running') return;
      setJobRuntime(id, { status: 'running', startedAt: Date.now() });
      appendJobLog(id, 'started');
      try {
        const msg = await runFns[id]();
        setJobRuntime(id, { status: 'done', lastRun: Date.now(), nextRun: nextRunFor(id, Date.now()), lastResult: msg, startedAt: null });
        appendJobLog(id, msg);
        if (!/not connected|No |automatically|Monday/.test(msg)) notify(jobDef(id).name, msg);
      } catch (e) {
        setJobRuntime(id, { status: 'error', lastRun: Date.now(), lastResult: String(e), startedAt: null });
        appendJobLog(id, `error: ${e}`);
      }
    };

    JOB_DEFS.forEach(def => registerRunner(def.id, () => runJob(def.id)));

    // Ticker: run due, enabled timer jobs (checks every 60s)
    const tick = () => {
      const now = Date.now();
      for (const def of JOB_DEFS) {
        if (!def.intervalMs) continue;
        const st = useAppStore.getState().jobs[def.id];
        if (!st || !st.enabled) continue;
        if (st.nextRun && now >= st.nextRun && st.status !== 'running') runJob(def.id);
      }
    };
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [workspacePath]);

  // Report indexing activity into the job runtime when files change
  useEffect(() => {
    if (!workspacePath) return;
    let unlisten: (() => void) | undefined;
    onFsChange(() => {
      const { setJobRuntime, appendJobLog } = useAppStore.getState();
      setJobRuntime('index-workspace', { status: 'running', startedAt: Date.now() });
      appendJobLog('index-workspace', 'file change detected — re-indexing');
      setTimeout(() => setJobRuntime('index-workspace', { status: 'done', lastRun: Date.now(), startedAt: null, lastResult: 'incremental index updated' }), 2500);
    }).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, [workspacePath]);

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      // Ctrl+K or Ctrl+P → command palette
      if (ctrl && !e.shiftKey && (e.key === 'k' || e.key === 'p')) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      // Ctrl+Shift+P → command palette
      if (ctrl && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      // Ctrl+, → settings
      if (ctrl && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      // Ctrl+` → toggle terminal
      if (ctrl && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
        return;
      }
      // Ctrl+Shift+E → Explorer
      if (ctrl && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        if (leftPanelView === 'explorer' && leftPanelOpen) toggleLeftPanel();
        else { setLeftPanelView('explorer'); if (!leftPanelOpen) toggleLeftPanel(); }
        return;
      }
      // Ctrl+Shift+G → Source Control
      if (ctrl && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        if (leftPanelView === 'git' && leftPanelOpen) toggleLeftPanel();
        else { setLeftPanelView('git'); if (!leftPanelOpen) toggleLeftPanel(); }
        return;
      }
      // Ctrl+Shift+F → Search
      if (ctrl && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        if (leftPanelView === 'search' && leftPanelOpen) toggleLeftPanel();
        else { setLeftPanelView('search'); if (!leftPanelOpen) toggleLeftPanel(); }
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setCommandPaletteOpen, setSettingsOpen, toggleTerminal, toggleLeftPanel, leftPanelOpen, leftPanelView, setLeftPanelView]);

  // Keep CSS vars in sync with store (for future drag-to-resize)
  useEffect(() => {
    document.documentElement.style.setProperty('--left-panel-width', `${leftPanelWidth}px`);
  }, [leftPanelWidth]);

  useEffect(() => {
    document.documentElement.style.setProperty('--intel-panel-width', `${intelPanelWidth}px`);
  }, [intelPanelWidth]);

  useEffect(() => {
    document.documentElement.style.setProperty('--terminal-height', `${terminalHeight}px`);
  }, [terminalHeight]);

  const cls = [
    'app-grid',
    !leftPanelOpen && 'lp-hidden',
    !intelPanelOpen && 'ip-hidden',
    !terminalOpen && 'trm-hidden',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <Titlebar />
      <ModeBar />
      <LeftNav />
      <LeftPanel />
      <CenterArea />
      <IntelPanel />
      <TerminalPanel />
      <StatusBar />
      <Toaster />
      {commandPaletteOpen && <CommandPalette onClose={() => setCommandPaletteOpen(false)} />}
      {settingsOpen && <SettingsDialog />}
      <DiffReview />
    </div>
  );
}
