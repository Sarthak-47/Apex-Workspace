import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentDef } from "@/lib/agents";
import type { JobId, JobStatus } from "@/lib/jobs";
import type { McpServerConfig, McpTool } from "@/lib/tauri";
import { type Workflow, DEFAULT_WORKFLOWS, newWorkflowId } from "@/lib/workflows";

export interface JobRuntime {
  status: JobStatus;
  enabled: boolean;
  lastRun: number | null;
  nextRun: number | null;
  lastResult: string;
  logs: string[];
  startedAt: number | null;
  runCount: number;
}

export const DEFAULT_JOB: JobRuntime = {
  status: 'idle', enabled: true, lastRun: null, nextRun: null,
  lastResult: '', logs: [], startedAt: null, runCount: 0,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppMode = "CODE" | "KNOWLEDGE" | "COMMS";
export type AppPage = "code" | "source-control" | "preview" | "agents" | "knowledge" | "models" | "settings" | "welcome";
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
  reorderOpenFiles: (from: number, to: number) => void;
  closeOtherFiles: (keep: string) => void;
  closeFilesToRight: (path: string) => void;
  closeAllFiles: () => void;
  pinnedFiles: string[];
  togglePin: (path: string) => void;
  closedFiles: string[];
  reopenClosedFile: () => void;
  zenMode: boolean;
  toggleZen: () => void;
  // Top-level page (activity-bar navigation)
  appPage: AppPage;
  setAppPage: (p: AppPage) => void;
  previewUrl: string;
  setPreviewUrl: (u: string) => void;
  revealTarget: { path: string; line: number; column: number } | null;
  openFileAt: (path: string, line: number, column?: number) => void;
  clearRevealTarget: () => void;
  // Split editor (second group, right pane)
  rightPaneFile: string | null;
  setRightPaneFile: (path: string | null) => void;

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
  terminalShell: string; // 'auto' or a shell path/profile
  setTerminalShell: (v: string) => void;
  problemsOpen: boolean;
  toggleProblems: () => void;
  setProblemsOpen: (v: boolean) => void;
  // Send a command into the active terminal (used by the Tasks runner)
  terminalCommand: string | null;
  runInTerminal: (cmd: string) => void;
  clearTerminalCommand: () => void;

  toggleLeftPanel: () => void;
  toggleIntelPanel: () => void;
  toggleTerminal: () => void;
  setLeftPanelWidth: (w: number) => void;
  setIntelPanelWidth: (w: number) => void;
  setTerminalHeight: (h: number) => void;

  // Active workspace
  workspacePath: string | null;
  setWorkspacePath: (path: string | null) => void;

  // Multi-root workspaces: additional folder roots beyond the primary one.
  workspaceFolders: string[];
  addFolderToWorkspace: (path: string) => void;
  removeFolderFromWorkspace: (path: string) => void;

  // "Select for Compare" target for arbitrary file-to-file diff.
  compareSelection: string | null;
  setCompareSelection: (path: string | null) => void;

  // Rebindable keymap: commandId -> chord override (defaults live in keymap.ts).
  keymap: Record<string, string>;
  setKeybinding: (id: string, chord: string) => void;
  resetKeybinding: (id: string) => void;
  resetAllKeybindings: () => void;

  // Command workflows (Warp Drive-style saved commands).
  workflows: Workflow[];
  addWorkflow: (w: Omit<Workflow, "id">) => void;
  updateWorkflow: (id: string, patch: Partial<Workflow>) => void;
  removeWorkflow: (id: string) => void;

  // Toasts
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;

  // Intel panel active tab
  intelTab: "chat" | "knowledge" | "context" | "tasks" | "preview";
  setIntelTab: (tab: "chat" | "knowledge" | "context" | "tasks" | "preview") => void;

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
  leftPanelView: 'explorer' | 'git' | 'search' | 'tests' | 'workflows';
  setLeftPanelView: (view: 'explorer' | 'git' | 'search' | 'tests' | 'workflows') => void;

  // Settings dialog
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Keyboard shortcuts reference
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  // Model Cookbook
  cookbookOpen: boolean;
  setCookbookOpen: (open: boolean) => void;

  // Blind model compare
  compareOpen: boolean;
  setCompareOpen: (open: boolean) => void;
  compareWins: Record<string, number>;
  addCompareWin: (model: string) => void;

  // First-launch onboarding (persisted)
  onboarded: boolean;
  setOnboarded: (v: boolean) => void;

  // Pending AI file edit (not persisted)
  pendingFileEdit: { path: string; content: string } | null;
  setPendingFileEdit: (edit: { path: string; content: string } | null) => void;

  // Diff review before applying (not persisted)
  pendingDiffReview: { path: string; original: string; proposed: string; mode?: 'review' | 'compare'; originalLabel?: string; modifiedLabel?: string } | null;
  setPendingDiffReview: (r: { path: string; original: string; proposed: string; mode?: 'review' | 'compare'; originalLabel?: string; modifiedLabel?: string } | null) => void;

  // Editor preferences (persisted)
  editorTheme: string;
  setEditorTheme: (theme: string) => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
  editorFontSize: number;
  setEditorFontSize: (v: number) => void;
  editorWordWrap: boolean;
  setEditorWordWrap: (v: boolean) => void;
  editorMinimap: boolean;
  setEditorMinimap: (v: boolean) => void;
  editorLineNumbers: boolean;
  setEditorLineNumbers: (v: boolean) => void;
  autoSave: boolean;
  setAutoSave: (v: boolean) => void;
  formatOnSave: boolean;
  setFormatOnSave: (v: boolean) => void;
  // Language servers (LSP) — opt-in; per-server command overrides
  lspEnabled: boolean;
  setLspEnabled: (v: boolean) => void;
  lspServerPaths: Record<string, string>;
  setLspServerPath: (id: string, command: string) => void;

  // Cursor position + file size (not persisted)
  cursorLine: number;
  cursorCol: number;
  editorFileSize: number;
  setEditorCursor: (line: number, col: number) => void;
  setEditorFileSize: (bytes: number) => void;

  // Recent workspaces (persisted, max 10)
  recentWorkspaces: string[];
  removeRecentWorkspace: (path: string) => void;
  clearRecentWorkspaces: () => void;

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

  // Inline autocomplete (persisted)
  autocompleteEnabled: boolean;
  setAutocompleteEnabled: (v: boolean) => void;

  // Embedding model for codebase index (persisted)
  embedModel: string;
  setEmbedModel: (m: string) => void;

  // SearXNG instance for web search (persisted)
  searxngUrl: string;
  setSearxngUrl: (u: string) => void;

  // ntfy topic URL for push notifications (persisted)
  ntfyTopic: string;
  setNtfyTopic: (u: string) => void;

  // Codebase index progress (not persisted)
  indexProgress: { done: number; total: number; file: string } | null;
  setIndexProgress: (p: { done: number; total: number; file: string } | null) => void;

  // Context injection toggle (persisted)
  contextInjectionEnabled: boolean;
  setContextInjectionEnabled: (v: boolean) => void;

  // Background jobs (status not persisted; enabled persisted)
  jobs: Record<string, JobRuntime>;
  setJobRuntime: (id: JobId, patch: Partial<JobRuntime>) => void;
  toggleJobEnabled: (id: JobId) => void;
  appendJobLog: (id: JobId, line: string) => void;

  // MCP servers (persisted)
  mcpServers: McpServerConfig[];
  setMcpServers: (servers: McpServerConfig[]) => void;

  // MCP running tools (not persisted) — keyed by server name
  mcpRunningTools: Record<string, McpTool[]>;
  setMcpRunningTools: (server: string, tools: McpTool[] | null) => void;
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
      // Open a file and reveal a specific line (used by search results, go-to-symbol).
      revealTarget: null,
      openFileAt: (path, line, column) => {
        const { openFiles } = get();
        if (!openFiles.includes(path)) {
          set({ openFiles: [...openFiles, path] });
        }
        set({ activeFile: path, revealTarget: { path, line, column: column ?? 1 } });
      },
      clearRevealTarget: () => set({ revealTarget: null }),
      rightPaneFile: null,
      setRightPaneFile: (path) => set({ rightPaneFile: path }),
      reorderOpenFiles: (from, to) => {
        const files = [...get().openFiles];
        if (from < 0 || from >= files.length || to < 0 || to >= files.length || from === to) return;
        const [moved] = files.splice(from, 1);
        files.splice(to, 0, moved);
        set({ openFiles: files });
      },
      // Bulk close actions keep any unsaved OR pinned files open.
      closeOtherFiles: (keep) => {
        const { openFiles, unsavedFiles, pinnedFiles } = get();
        const keepers = (f: string) => f === keep || unsavedFiles.includes(f) || pinnedFiles.includes(f);
        const next = openFiles.filter(keepers);
        set({ openFiles: next, activeFile: keep });
      },
      closeFilesToRight: (path) => {
        const { openFiles, unsavedFiles, pinnedFiles, activeFile } = get();
        const idx = openFiles.indexOf(path);
        if (idx === -1) return;
        const next = openFiles.filter((f, i) => i <= idx || unsavedFiles.includes(f) || pinnedFiles.includes(f));
        set({ openFiles: next, activeFile: next.includes(activeFile ?? '') ? activeFile : path });
      },
      closeAllFiles: () => {
        const { openFiles, unsavedFiles, pinnedFiles, activeFile } = get();
        const next = openFiles.filter((f) => unsavedFiles.includes(f) || pinnedFiles.includes(f));
        set({ openFiles: next, activeFile: next.includes(activeFile ?? '') ? activeFile : (next[0] ?? null) });
      },
      pinnedFiles: [],
      togglePin: (path) => set((s) => ({
        pinnedFiles: s.pinnedFiles.includes(path)
          ? s.pinnedFiles.filter((p) => p !== path)
          : [...s.pinnedFiles, path],
      })),
      closeFile: (path) => {
        const { openFiles, activeFile, unsavedFiles, pinnedFiles, closedFiles } = get();
        const next = openFiles.filter((f) => f !== path);
        const newActive =
          activeFile === path ? (next[next.length - 1] ?? null) : activeFile;
        set({
          openFiles: next,
          activeFile: newActive,
          unsavedFiles: unsavedFiles.filter((f) => f !== path),
          pinnedFiles: pinnedFiles.filter((f) => f !== path),
          closedFiles: [path, ...closedFiles.filter((f) => f !== path)].slice(0, 20),
        });
      },
      closedFiles: [],
      reopenClosedFile: () => {
        const { closedFiles, openFile } = get();
        const [last, ...rest] = closedFiles;
        if (!last) return;
        set({ closedFiles: rest });
        openFile(last);
      },
      zenMode: false,
      toggleZen: () => set((s) => ({ zenMode: !s.zenMode })),
      appPage: 'code',
      setAppPage: (p) => set({ appPage: p }),
      previewUrl: 'http://localhost:3000',
      setPreviewUrl: (u) => set({ previewUrl: u }),

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
      terminalShell: 'auto',
      setTerminalShell: (v) => set({ terminalShell: v }),
      terminalOpen: true,
      terminalHeight: 220,

      toggleLeftPanel: () =>
        set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleIntelPanel: () =>
        set((s) => ({ intelPanelOpen: !s.intelPanelOpen })),
      toggleTerminal: () =>
        set((s) => ({ terminalOpen: !s.terminalOpen })),
      problemsOpen: false,
      toggleProblems: () => set((s) => ({ problemsOpen: !s.problemsOpen })),
      setProblemsOpen: (v) => set({ problemsOpen: v }),
      terminalCommand: null,
      runInTerminal: (cmd) => set({ terminalOpen: true, terminalCommand: cmd }),
      clearTerminalCommand: () => set({ terminalCommand: null }),
      setLeftPanelWidth: (w) => set({ leftPanelWidth: w }),
      setIntelPanelWidth: (w) => set({ intelPanelWidth: w }),
      setTerminalHeight: (h) => set({ terminalHeight: h }),

      // Workspace
      workspacePath: null,
      setWorkspacePath: (path) => {
        if (path) {
          const current = get().recentWorkspaces;
          const filtered = current.filter(p => p !== path);
          // Opening a fresh primary folder resets any extra roots.
          set({ workspacePath: path, workspaceFolders: [], recentWorkspaces: [path, ...filtered].slice(0, 10) });
        } else {
          set({ workspacePath: path, workspaceFolders: [] });
        }
      },

      // Multi-root workspaces
      workspaceFolders: [],
      addFolderToWorkspace: (path) => set((s) => {
        if (!path || path === s.workspacePath || s.workspaceFolders.includes(path)) return {};
        // First folder added with no primary becomes the primary.
        if (!s.workspacePath) return { workspacePath: path };
        return { workspaceFolders: [...s.workspaceFolders, path] };
      }),
      removeFolderFromWorkspace: (path) => set((s) => ({ workspaceFolders: s.workspaceFolders.filter((p) => p !== path) })),

      // Compare selection
      compareSelection: null,
      setCompareSelection: (path) => set({ compareSelection: path }),

      // Rebindable keymap
      keymap: {},
      setKeybinding: (id, chord) => set((s) => ({ keymap: { ...s.keymap, [id]: chord } })),
      resetKeybinding: (id) => set((s) => { const k = { ...s.keymap }; delete k[id]; return { keymap: k }; }),
      resetAllKeybindings: () => set({ keymap: {} }),

      // Command workflows
      workflows: DEFAULT_WORKFLOWS,
      addWorkflow: (w) => set((s) => ({ workflows: [...s.workflows, { ...w, id: newWorkflowId() }] })),
      updateWorkflow: (id, patch) => set((s) => ({ workflows: s.workflows.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      removeWorkflow: (id) => set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) })),

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
      intelTab: "chat" as "chat" | "knowledge" | "context" | "tasks" | "preview",
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
      leftPanelView: 'explorer' as 'explorer' | 'git' | 'search' | 'tests' | 'workflows',
      setLeftPanelView: (view) => set({ leftPanelView: view }),

      // Settings dialog
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),

      // Command palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // Keyboard shortcuts
      shortcutsOpen: false,
      setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

      // Model Cookbook
      cookbookOpen: false,
      setCookbookOpen: (open) => set({ cookbookOpen: open }),

      // Blind compare
      compareOpen: false,
      setCompareOpen: (open) => set({ compareOpen: open }),
      compareWins: {},
      addCompareWin: (model) => set((s) => ({ compareWins: { ...s.compareWins, [model]: (s.compareWins[model] ?? 0) + 1 } })),

      // Onboarding
      onboarded: false,
      setOnboarded: (v) => set({ onboarded: v }),

      // Pending AI file edit
      pendingFileEdit: null,
      setPendingFileEdit: (edit) => set({ pendingFileEdit: edit }),

      // Diff review
      pendingDiffReview: null,
      setPendingDiffReview: (r) => set({ pendingDiffReview: r }),

      // Editor preferences
      editorTheme: 'apex-dark',
      setEditorTheme: (theme) => set({ editorTheme: theme }),
      accentColor: '#6366F1',
      setAccentColor: (c) => set({ accentColor: c }),
      editorFontSize: 13,
      setEditorFontSize: (v) => set({ editorFontSize: Math.max(10, Math.min(24, v)) }),
      editorWordWrap: false,
      setEditorWordWrap: (v) => set({ editorWordWrap: v }),
      editorMinimap: true,
      setEditorMinimap: (v) => set({ editorMinimap: v }),
      editorLineNumbers: true,
      setEditorLineNumbers: (v) => set({ editorLineNumbers: v }),
      autoSave: false,
      setAutoSave: (v) => set({ autoSave: v }),
      formatOnSave: false,
      setFormatOnSave: (v) => set({ formatOnSave: v }),
      lspEnabled: false,
      setLspEnabled: (v) => set({ lspEnabled: v }),
      lspServerPaths: {},
      setLspServerPath: (id, command) => set((s) => ({ lspServerPaths: { ...s.lspServerPaths, [id]: command } })),

      // Cursor position + file size
      cursorLine: 1,
      cursorCol: 1,
      editorFileSize: 0,
      setEditorCursor: (line, col) => set({ cursorLine: line, cursorCol: col }),
      setEditorFileSize: (bytes) => set({ editorFileSize: bytes }),

      // Recent workspaces
      recentWorkspaces: [],
      removeRecentWorkspace: (path) => set((s) => ({ recentWorkspaces: s.recentWorkspaces.filter((p) => p !== path) })),
      clearRecentWorkspaces: () => set({ recentWorkspaces: [] }),

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

      // Inline autocomplete
      autocompleteEnabled: false,
      setAutocompleteEnabled: (v) => set({ autocompleteEnabled: v }),

      // Embedding model
      embedModel: 'nomic-embed-text',
      setEmbedModel: (m) => set({ embedModel: m }),

      // SearXNG
      searxngUrl: 'http://localhost:8080',
      setSearxngUrl: (u) => set({ searxngUrl: u }),

      // ntfy
      ntfyTopic: '',
      setNtfyTopic: (u) => set({ ntfyTopic: u }),

      // Index progress
      indexProgress: null,
      setIndexProgress: (p) => set({ indexProgress: p }),

      // Context injection
      contextInjectionEnabled: true,
      setContextInjectionEnabled: (v) => set({ contextInjectionEnabled: v }),

      // Background jobs
      jobs: {},
      setJobRuntime: (id, patch) =>
        set((s) => {
          const prev = s.jobs[id] ?? DEFAULT_JOB;
          return { jobs: { ...s.jobs, [id]: { ...prev, ...patch } } };
        }),
      toggleJobEnabled: (id) =>
        set((s) => {
          const prev = s.jobs[id] ?? DEFAULT_JOB;
          const enabled = !prev.enabled;
          return { jobs: { ...s.jobs, [id]: { ...prev, enabled, status: enabled ? 'idle' : 'disabled' } } };
        }),
      appendJobLog: (id, line) =>
        set((s) => {
          const prev = s.jobs[id] ?? DEFAULT_JOB;
          const stamp = new Date().toLocaleTimeString();
          return { jobs: { ...s.jobs, [id]: { ...prev, logs: [...prev.logs.slice(-99), `${stamp}  ${line}`] } } };
        }),

      // MCP servers (pre-configured Exa + GitHub, disabled until keys are set)
      mcpServers: [
        { name: 'exa', command: 'npx', args: ['-y', 'exa-mcp-server'], env: { EXA_API_KEY: '' }, enabled: false },
        { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' }, enabled: false },
      ] as McpServerConfig[],
      setMcpServers: (servers) => set({ mcpServers: servers }),

      mcpRunningTools: {},
      setMcpRunningTools: (server, tools) =>
        set((s) => {
          const next = { ...s.mcpRunningTools };
          if (tools === null) delete next[server]; else next[server] = tools;
          return { mcpRunningTools: next };
        }),
    }),
    {
      name: "apex-app-state",
      // Only persist layout preferences and workspace path, not transient state
      partialize: (s) => ({
        mode: s.mode,
        workspacePath: s.workspacePath,
        workspaceFolders: s.workspaceFolders,
        keymap: s.keymap,
        workflows: s.workflows,
        openFiles: s.openFiles,
        activeFile: s.activeFile,
        leftPanelOpen: s.leftPanelOpen,
        leftPanelView: s.leftPanelView,
        leftPanelWidth: s.leftPanelWidth,
        intelPanelOpen: s.intelPanelOpen,
        intelPanelWidth: s.intelPanelWidth,
        terminalOpen: s.terminalOpen,
        terminalHeight: s.terminalHeight,
        terminalShell: s.terminalShell,
        previewUrl: s.previewUrl,
        ollamaSelectedModel: s.ollamaSelectedModel,
        editorTheme: s.editorTheme,
        accentColor: s.accentColor,
        editorFontSize: s.editorFontSize,
        editorWordWrap: s.editorWordWrap,
        editorMinimap: s.editorMinimap,
        editorLineNumbers: s.editorLineNumbers,
        autoSave: s.autoSave,
        formatOnSave: s.formatOnSave,
        lspEnabled: s.lspEnabled,
        lspServerPaths: s.lspServerPaths,
        vimMode: s.vimMode,
        recentWorkspaces: s.recentWorkspaces,
        selectedAgentId: s.selectedAgentId,
        userAgents: s.userAgents,
        bashAllowAlways: s.bashAllowAlways,
        autocompleteEnabled: s.autocompleteEnabled,
        embedModel: s.embedModel,
        searxngUrl: s.searxngUrl,
        ntfyTopic: s.ntfyTopic,
        contextInjectionEnabled: s.contextInjectionEnabled,
        // Persist job schedule state (not transient status/logs) for overdue rerun across restarts
        jobs: Object.fromEntries(Object.entries(s.jobs).map(([k, v]) => [k, {
          ...DEFAULT_JOB,
          enabled: v.enabled, lastRun: v.lastRun, nextRun: v.nextRun, lastResult: v.lastResult, runCount: v.runCount,
        }])),
        mcpServers: s.mcpServers,
        onboarded: s.onboarded,
        compareWins: s.compareWins,
      }),
    }
  )
);

// Debug handle: lets tooling / preview drive the store from the console.
(window as unknown as { __apexStore?: typeof useAppStore }).__apexStore = useAppStore;

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
