import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  intelTab: "chat" | "knowledge" | "context" | "history";
  setIntelTab: (tab: "chat" | "knowledge" | "context" | "history") => void;
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
        const { openFiles, activeFile } = get();
        const next = openFiles.filter((f) => f !== path);
        const newActive =
          activeFile === path ? (next[next.length - 1] ?? null) : activeFile;
        set({ openFiles: next, activeFile: newActive });
      },

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
      setWorkspacePath: (path) => set({ workspacePath: path }),

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
      intelTab: "chat" as "chat" | "knowledge" | "context" | "history",
      setIntelTab: (tab) => set({ intelTab: tab }),
    }),
    {
      name: "apex-app-state",
      // Only persist layout preferences and workspace path, not transient state
      partialize: (s) => ({
        mode: s.mode,
        workspacePath: s.workspacePath,
        leftPanelOpen: s.leftPanelOpen,
        leftPanelWidth: s.leftPanelWidth,
        intelPanelOpen: s.intelPanelOpen,
        intelPanelWidth: s.intelPanelWidth,
        terminalOpen: s.terminalOpen,
        terminalHeight: s.terminalHeight,
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
