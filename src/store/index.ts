import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentDef } from "@/lib/agents";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppMode = "CODE" | "KNOWLEDGE" | "COMMS";
export type ToastType = "info" | "success" | "error" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

// ─── State Shape ─────────────────────────────────────────────────────────────

interface AppState {
  // Mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // Active file
  activeFile: string | null;
  setActiveFile: (path: string | null) => void;

  // Open files (tabs)
  openFiles: string[];
  openFile: (path: string) => void;
  closeFile: (path: string) => void;

  // Unsaved file tracking (not persisted)
  unsavedFiles: string[];
  markFileUnsaved: (path: string) => void;
  markFileSaved: (path: string) => void;

  // Panel visibility & dimensions
  leftPanelOpen: boolean;
  leftPanelWidth: number;
  intelPanelOpen: boolean;
  intelPanelWidth: number;
  terminalOpen: boolean;
  terminalHeight: number;

  toggleLeftPanel: () => void;
  toggleIntelPanel: () => void;
  toggleTerminal: () => void;
  setLeftPanelWidth: (w: number) => void;
  setIntelPanelWidth: (w: number) => void;
  setTerminalHeight: (h: number) => void;

  // Active workspace
  workspacePath: string | null;
  setWorkspacePath: (path: string | null) => void;

  // Toasts
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;

  // Intel panel active tab
  intelTab: "chat" | "knowledge" | "context" | "history" | "preview";
  setIntelTab: (tab: "chat" | "knowledge" | "context" | "history" | "preview") => void;

  // Vim mode
  vimMode: boolean;
  setVimMode: (v: boolean) => void;

  // Ollama live status (not persisted)
  ollamaOnline: boolean;
  ollamaModels: string[];
  setOllamaStatus: (online: boolean, models: string[]) => void;

  // Selected model (persisted)
  ollamaSelectedModel: string;
  setOllamaSelectedModel: (model: string) => void;

  // Git branch (not persisted)
  gitBranch: string;
  setGitBranch: (branch: string) => void;

  // Left panel view (which tab is shown)
  leftPanelView: 'explorer' | 'git' | 'search';
  setLeftPanelView: (view: 'explorer' | 'git' | 'search') => void;

  // Settings dialog
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Pending AI file edit (not persisted)
  pendingFileEdit: { path: string; content: string } | null;
  setPendingFileEdit: (edit: { path: string; content: string } | null) => void;

  // Diff review before applying (not persisted)
  pendingDiffReview: { path: string; original: string; proposed: string } | null;
  setPendingDiffReview: (r: { path: string; original: string; proposed: string } | null) => void;

  // Editor preferences (persisted)
  editorTheme: string;
  setEditorTheme: (theme: string) => void;
  autoSave: boolean;
  setAutoSave: (v: boolean) => void;

  // Cursor position + file size (not persisted)
  cursorLine: number;
  cursorCol: number;
  editorFileSize: number;
  setEditorCursor: (line: number, col: number) => void;
  setEditorFileSize: (bytes: number) => void;

  // Recent workspaces (persisted, max 10)
  recentWorkspaces: string[];

  // Custom agents (persisted)
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  userAgents: AgentDef[];
  addUserAgent: (agent: AgentDef) => void;
  updateUserAgent: (id: string, patch: Partial<AgentDef>) => void;
  deleteUserAgent: (id: string) => void;

  // Bash "Allow Always" command-prefix whitelist (persisted)
  bashAllowAlways: string[];
  addBashAllowAlways: (prefix: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Mode
      mode: "CODE",
      setMode: (mode) => set({ mode }),

      // Active file
      activeFile: null,
      setActiveFile: (path) => set({ activeFile: path }),

      // Open files
      openFiles: [],
      openFile: (path) => {
        const { openFiles } = get();
        if (!openFiles.includes(path)) {
          set({ openFiles: [...openFiles, path] });
        }
        set({ activeFile: path });
      },
      closeFile: (path) => {
        const { openFiles, activeFile, unsavedFiles } = get();
        const next = openFiles.filter((f) => f !== path);
        const newActive =
          activeFile === path ? (next[next.length - 1] ?? null) : activeFile;
        set({
          openFiles: next,
          activeFile: newActive,
          unsavedFiles: unsavedFiles.filter((f) => f !== path),
        });
      },

      // Unsaved tracking
      unsavedFiles: [],
      markFileUnsaved: (path) =>
        set((s) => ({
          unsavedFiles: s.unsavedFiles.includes(path)
            ? s.unsavedFiles
            : [...s.unsavedFiles, path],
        })),
      markFileSaved: (path) =>
        set((s) => ({ unsavedFiles: s.unsavedFiles.filter((f) => f !== path) })),

      // Panels
      leftPanelOpen: true,
      leftPanelWidth: 250,
      intelPanelOpen: true,
      intelPanelWidth: 320,
      terminalOpen: true,
      terminalHeight: 220,

      toggleLeftPanel: () =>
        set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleIntelPanel: () =>
        set((s) => ({ intelPanelOpen: !s.intelPanelOpen })),
      toggleTerminal: () =>
        set((s) => ({ terminalOpen: !s.terminalOpen })),
      setLeftPanelWidth: (w) => set({ leftPanelWidth: w }),
      setIntelPanelWidth: (w) => set({ intelPanelWidth: w }),
      setTerminalHeight: (h) => set({ terminalHeight: h }),

      // Workspace
      workspacePath: null,
      setWorkspacePath: (path) => {
        if (path) {
          const current = get().recentWorkspaces;
          const filtered = current.filter(p => p !== path);
          set({ workspacePath: path, recentWorkspaces: [path, ...filtered].slice(0, 10) });
        } else {
          set({ workspacePath: path });
        }
      },

      // Toasts
      toasts: [],
      addToast: (message, type = "info") => {
        const toast: Toast = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          message,
          type,
          createdAt: Date.now(),
        };
        set((s) => ({ toasts: [...s.toasts, toast] }));
        // Auto-dismiss after 4s
        setTimeout(() => {
          get().dismissToast(toast.id);
        }, 4000);
      },
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      // Intel tab
      intelTab: "chat" as "chat" | "knowledge" | "context" | "history" | "preview",
      setIntelTab: (tab) => set({ intelTab: tab }),

      // Vim mode
      vimMode: false,
      setVimMode: (v) => set({ vimMode: v }),

      // Ollama status (live, not persisted)
      ollamaOnline: false,
      ollamaModels: [],
      setOllamaStatus: (online, models) => set({ ollamaOnline: online, ollamaModels: models }),

      // Selected model (persisted)
      ollamaSelectedModel: '',
      setOllamaSelectedModel: (model) => set({ ollamaSelectedModel: model }),

      // Git branch (live, not persisted)
      gitBranch: 'main',
      setGitBranch: (branch) => set({ gitBranch: branch }),

      // Left panel view
      leftPanelView: 'explorer' as 'explorer' | 'git' | 'search',
      setLeftPanelView: (view) => set({ leftPanelView: view }),

      // Settings dialog
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),

      // Command palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // Pending AI file edit
      pendingFileEdit: null,
      setPendingFileEdit: (edit) => set({ pendingFileEdit: edit }),

      // Diff review
      pendingDiffReview: null,
      setPendingDiffReview: (r) => set({ pendingDiffReview: r }),

      // Editor preferences
      editorTheme: 'apex-dark',
      setEditorTheme: (theme) => set({ editorTheme: theme }),
      autoSave: false,
      setAutoSave: (v) => set({ autoSave: v }),

      // Cursor position + file size
      cursorLine: 1,
      cursorCol: 1,
      editorFileSize: 0,
      setEditorCursor: (line, col) => set({ cursorLine: line, cursorCol: col }),
      setEditorFileSize: (bytes) => set({ editorFileSize: bytes }),

      // Recent workspaces
      recentWorkspaces: [],

      // Custom agents
      selectedAgentId: 'coder',
      setSelectedAgentId: (id) => set({ selectedAgentId: id }),
      userAgents: [],
      addUserAgent: (agent) => set((s) => ({ userAgents: [...s.userAgents, agent] })),
      updateUserAgent: (id, patch) =>
        set((s) => ({ userAgents: s.userAgents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      deleteUserAgent: (id) =>
        set((s) => ({
          userAgents: s.userAgents.filter((a) => a.id !== id),
          selectedAgentId: s.selectedAgentId === id ? 'coder' : s.selectedAgentId,
        })),

      // Bash allow-always whitelist
      bashAllowAlways: [],
      addBashAllowAlways: (prefix) =>
        set((s) => (s.bashAllowAlways.includes(prefix) ? s : { bashAllowAlways: [...s.bashAllowAlways, prefix] })),
    }),
    {
      name: "apex-app-state",
      // Only persist layout preferences and workspace path, not transient state
      partialize: (s) => ({
        mode: s.mode,
        workspacePath: s.workspacePath,
        openFiles: s.openFiles,
        activeFile: s.activeFile,
        leftPanelOpen: s.leftPanelOpen,
        leftPanelView: s.leftPanelView,
        leftPanelWidth: s.leftPanelWidth,
        intelPanelOpen: s.intelPanelOpen,
        intelPanelWidth: s.intelPanelWidth,
        terminalOpen: s.terminalOpen,
        terminalHeight: s.terminalHeight,
        ollamaSelectedModel: s.ollamaSelectedModel,
        editorTheme: s.editorTheme,
        autoSave: s.autoSave,
        vimMode: s.vimMode,
        recentWorkspaces: s.recentWorkspaces,
        selectedAgentId: s.selectedAgentId,
        userAgents: s.userAgents,
        bashAllowAlways: s.bashAllowAlways,
      }),
    }
  )
);

// ─── Convenience hook for toasts ─────────────────────────────────────────────

export const useToast = () => {
  const addToast = useAppStore((s) => s.addToast);
  return {
    toast: addToast,
    info: (msg: string) => addToast(msg, "info"),
    success: (msg: string) => addToast(msg, "success"),
    error: (msg: string) => addToast(msg, "error"),
    warn: (msg: string) => addToast(msg, "warning"),
  };
};
