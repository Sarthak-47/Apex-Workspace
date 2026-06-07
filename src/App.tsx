import { useEffect } from "react";
import { useAppStore } from "@/store";
import { checkOllama } from "@/lib/ollama";
import { getGitBranch, startWatching, stopWatching, onFsChange } from "@/lib/tauri";
import { indexFile } from "@/lib/codeindex";
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
