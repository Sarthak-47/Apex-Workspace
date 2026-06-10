import { useEffect, useRef } from "react";
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
import { KeyboardShortcuts } from "@/components/ui/KeyboardShortcuts";
import { Onboarding } from "@/components/ui/Onboarding";
import { Cookbook } from "@/components/ui/Cookbook";
import { Compare } from "@/components/ui/Compare";
import { UpdateBanner } from "@/components/ui/UpdateBanner";
import { Titlebar } from "@/components/layout/Titlebar";
import { ModeBar } from "@/components/layout/ModeBar";
import { LeftNav } from "@/components/layout/LeftNav";
import { LeftPanel } from "@/components/layout/LeftPanel";
import { CenterArea } from "@/components/layout/CenterArea";
import { IntelPanel } from "@/components/layout/IntelPanel";
import { TerminalPanel } from "@/components/layout/TerminalPanel";
import { StatusBar } from "@/components/layout/StatusBar";
import { ProblemsPanel } from "@/components/layout/ProblemsPanel";
import { Toaster } from "@/components/ui/Toaster";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { applyWorkspaceSettings } from "@/lib/workspaceSettings";
import { PageRouter } from "@/components/pages/PageRouter";

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
    setShortcutsOpen,
    embedModel,
    mode, toggleIntelPanel, setIntelTab,
  } = useAppStore();

  // ── Drop the legacy demo workspace (older builds set this mock path) ────────
  useEffect(() => {
    const wp = useAppStore.getState().workspacePath;
    if (wp === '/demo-workspace') useAppStore.getState().setWorkspacePath(null);
    const recents = useAppStore.getState().recentWorkspaces;
    if (recents.some((p) => p === '/demo-workspace')) {
      useAppStore.setState({ recentWorkspaces: recents.filter((p) => p !== '/demo-workspace') });
    }
  }, []);

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

  // Apply per-workspace settings.json (VS Code-compatible) when a folder opens.
  useEffect(() => {
    if (workspacePath) applyWorkspaceSettings(workspacePath).catch(() => {});
  }, [workspacePath]);

  // ── App mode → focus the relevant view ─────────────────────────────────────
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    if (!intelPanelOpen) toggleIntelPanel();
    if (mode === 'KNOWLEDGE') { setIntelTab('knowledge'); setLeftPanelView('explorer'); }
    else if (mode === 'CODE') { setIntelTab('chat'); }
    // COMMS renders the Email panel via an overlay in IntelPanel
  }, [mode, intelPanelOpen, toggleIntelPanel, setIntelTab, setLeftPanelView]);

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
      const runCount = (st?.runCount ?? 0) + 1;
      setJobRuntime(id, { status: 'running', startedAt: Date.now() });
      appendJobLog(id, 'started');
      try {
        const msg = await runFns[id]();
        // If the run was skipped because Ollama was offline, retry soon (queued) rather than waiting a full interval.
        const offline = /offline/i.test(msg);
        const nextRun = offline ? Date.now() + 5 * 60 * 1000 : nextRunFor(id, Date.now());
        setJobRuntime(id, { status: offline ? 'idle' : 'done', lastRun: Date.now(), nextRun, lastResult: msg, startedAt: null, runCount });
        appendJobLog(id, msg);
        if (!/not connected|No |automatically|Monday|offline|skipped/i.test(msg)) notify(jobDef(id).name, msg);
      } catch (e) {
        setJobRuntime(id, { status: 'error', lastRun: Date.now(), lastResult: String(e), startedAt: null, runCount });
        appendJobLog(id, `error: ${e}`);
      }
    };

    JOB_DEFS.forEach(def => registerRunner(def.id, () => runJob(def.id)));

    // Overdue rerun: if a job was due while the app was closed, run it shortly after startup (staggered).
    const overdueTimers: ReturnType<typeof setTimeout>[] = [];
    JOB_DEFS.forEach((def, i) => {
      if (!def.intervalMs) return;
      const st = useAppStore.getState().jobs[def.id];
      if (st?.enabled && st.nextRun && Date.now() >= st.nextRun) {
        appendJobLog(def.id, 'overdue (missed while closed) — running');
        overdueTimers.push(setTimeout(() => runJob(def.id), 4000 + i * 1500));
      }
    });

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
    return () => { clearInterval(id); overdueTimers.forEach(clearTimeout); };
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
      // Ctrl+T → workspace symbol search (command palette)
      if (ctrl && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      // Ctrl+Shift+T → reopen last closed editor
      if (ctrl && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        useAppStore.getState().reopenClosedFile();
        return;
      }
      // Ctrl+, → settings
      if (ctrl && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      // Ctrl+/ → keyboard shortcuts
      if (ctrl && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen(true);
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
      // Esc → exit Zen mode (when active and no overlay is open)
      if (e.key === 'Escape' && useAppStore.getState().zenMode
          && !useAppStore.getState().commandPaletteOpen && !useAppStore.getState().settingsOpen) {
        useAppStore.getState().toggleZen();
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setCommandPaletteOpen, setSettingsOpen, setShortcutsOpen, toggleTerminal, toggleLeftPanel, leftPanelOpen, leftPanelView, setLeftPanelView]);

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

  const zenMode = useAppStore((s) => s.zenMode);
  const appPage = useAppStore((s) => s.appPage);
  const cls = [
    'app-grid',
    !leftPanelOpen && 'lp-hidden',
    !intelPanelOpen && 'ip-hidden',
    !terminalOpen && 'trm-hidden',
    zenMode && 'zen',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <Titlebar />
      <ModeBar />
      <ErrorBoundary name="Navigation"><LeftNav /></ErrorBoundary>
      {appPage === 'code' ? (
        <>
          <ErrorBoundary name="Side Panel"><LeftPanel /></ErrorBoundary>
          <ErrorBoundary name="Editor"><CenterArea /></ErrorBoundary>
          <ErrorBoundary name="AI Panel"><IntelPanel /></ErrorBoundary>
          <ErrorBoundary name="Terminal" compact><TerminalPanel /></ErrorBoundary>
        </>
      ) : (
        <div className="app-page">
          <ErrorBoundary name="Page"><PageRouter page={appPage} /></ErrorBoundary>
        </div>
      )}
      <ErrorBoundary name="Problems" compact><ProblemsPanel /></ErrorBoundary>
      <ErrorBoundary name="Status Bar" compact><StatusBar /></ErrorBoundary>
      <Toaster />
      {commandPaletteOpen && <CommandPalette onClose={() => setCommandPaletteOpen(false)} />}
      {settingsOpen && <SettingsDialog />}
      <KeyboardShortcuts />
      <Onboarding />
      <Cookbook />
      <Compare />
      <UpdateBanner />
      <DiffReview />
    </div>
  );
}
