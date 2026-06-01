import { useEffect } from "react";
import { useAppStore } from "@/store";
import { checkOllama } from "@/lib/ollama";
import { getGitBranch } from "@/lib/tauri";
import { CommandPalette } from "@/components/ui/CommandPalette";
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
    intelPanelOpen, intelPanelWidth,
    terminalOpen, terminalHeight,
    setOllamaStatus,
    setGitBranch, workspacePath,
    commandPaletteOpen, setCommandPaletteOpen,
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

  // ── Git branch — re-read whenever workspace changes ────────────────────────
  useEffect(() => {
    if (!workspacePath) { setGitBranch(''); return; }
    getGitBranch(workspacePath).then(setGitBranch);
  }, [workspacePath, setGitBranch]);

  // ── Global Ctrl+K → open command palette ──────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setCommandPaletteOpen]);

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
    </div>
  );
}
