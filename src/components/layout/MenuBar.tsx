import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { openFolderDialog, createWorkspaceFolder, activateWorkspace } from "@/lib/tauri";
import { runEditorAction, saveActive } from "@/lib/editorBridge";

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

type Item =
  | { sep: true }
  | { header: string }
  | { label: string; key?: string; run: () => void; disabled?: boolean };

interface Menu { label: string; items: () => Item[] }

// ─── Menu dropdown ────────────────────────────────────────────────────────────
function MenuPanel({ items, onClose }: { items: Item[]; onClose: () => void }) {
  return (
    <div
      style={{
        position: "absolute", top: 26, left: 0, zIndex: 9999, minWidth: 240, maxWidth: 340,
        background: "#15151D", border: "1px solid #2A2A3A", borderRadius: 7,
        boxShadow: "0 18px 48px rgba(0,0,0,0.65)", overflow: "hidden", padding: "4px 0",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => {
        if ("sep" in it) return <div key={i} style={{ height: 1, background: "#23232F", margin: "4px 0" }} />;
        if ("header" in it) return (
          <div key={i} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "#4A4A65", padding: "6px 12px 3px" }}>{it.header}</div>
        );
        return (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => { if (!it.disabled) { it.run(); onClose(); } }}
            className={it.disabled ? "" : "hover:bg-[#23233A]"}
            style={{
              display: "flex", alignItems: "center", gap: 16, width: "100%", textAlign: "left",
              padding: "5px 12px", background: "transparent", border: "none",
              cursor: it.disabled ? "default" : "pointer",
              color: it.disabled ? "#4A4A65" : "#D2D2E0", fontSize: 12.5,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
            {it.key && <span style={{ fontSize: 10.5, color: "#5A5A75", fontFamily: "JetBrains Mono, monospace", flexShrink: 0 }}>{it.key}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function MenuBar() {
  const store = useAppStore();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const ed = (id: string) => () => runEditorAction(id);
  const showPanel = (view: "explorer" | "git" | "search") => () => {
    store.setAppPage("code");
    store.setLeftPanelView(view);
    if (!store.leftPanelOpen) store.toggleLeftPanel();
  };
  const openFolder = async () => { const p = await openFolderDialog(); if (p) { store.setWorkspacePath(p); store.setAppPage("code"); } };
  const newFolder = async () => { const p = await createWorkspaceFolder(); if (p) { store.setWorkspacePath(p); store.setAppPage("code"); } };
  const addFolder = async () => { const p = await openFolderDialog(); if (p) { store.addFolderToWorkspace(p); store.setAppPage("code"); store.setLeftPanelView("explorer"); if (!store.leftPanelOpen) store.toggleLeftPanel(); } };
  const openRecent = (p: string) => async () => { if (await activateWorkspace(p)) { store.setWorkspacePath(p); store.setAppPage("code"); } };

  const recents = store.recentWorkspaces.filter((p) => p !== store.workspacePath).slice(0, 8);

  const menus: Menu[] = [
    {
      label: "File",
      items: () => [
        { label: "Open Folder…", key: "Ctrl+O", run: openFolder },
        { label: "New Folder…", run: newFolder },
        { label: "Add Folder to Workspace…", run: addFolder },
        ...(recents.length
          ? [{ header: "OPEN RECENT" } as Item, ...recents.map((p) => ({ label: baseName(p), run: openRecent(p) }) as Item)]
          : []),
        { sep: true },
        { label: "Save", key: "Ctrl+S", run: saveActive, disabled: !store.activeFile },
        { label: "Auto Save", key: store.autoSave ? "On" : "Off", run: () => store.setAutoSave(!store.autoSave) },
        { sep: true },
        { label: "Close Editor", key: "Ctrl+W", run: () => store.activeFile && store.closeFile(store.activeFile), disabled: !store.activeFile },
        { label: "Reopen Closed Editor", key: "Ctrl+Shift+T", run: () => store.reopenClosedFile() },
        { label: "Close All Editors", run: () => store.closeAllFiles(), disabled: store.openFiles.length === 0 },
        { sep: true },
        { label: "Preferences: Settings", key: "Ctrl+,", run: () => store.setSettingsOpen(true) },
        { label: "Close Folder", run: () => { store.setWorkspacePath(null); store.setAppPage("welcome"); }, disabled: !store.workspacePath },
      ],
    },
    {
      label: "Edit",
      items: () => [
        { label: "Undo", key: "Ctrl+Z", run: ed("undo") },
        { label: "Redo", key: "Ctrl+Y", run: ed("redo") },
        { sep: true },
        { label: "Cut", key: "Ctrl+X", run: ed("editor.action.clipboardCutAction") },
        { label: "Copy", key: "Ctrl+C", run: ed("editor.action.clipboardCopyAction") },
        { label: "Paste", key: "Ctrl+V", run: ed("editor.action.clipboardPasteAction") },
        { sep: true },
        { label: "Find", key: "Ctrl+F", run: ed("actions.find") },
        { label: "Replace", key: "Ctrl+H", run: ed("editor.action.startFindReplaceAction") },
        { label: "Find in Files", key: "Ctrl+Shift+F", run: showPanel("search") },
        { sep: true },
        { label: "Toggle Line Comment", key: "Ctrl+/", run: ed("editor.action.commentLine") },
        { label: "Toggle Block Comment", key: "Shift+Alt+A", run: ed("editor.action.blockComment") },
        { label: "Format Document", key: "Shift+Alt+F", run: ed("editor.action.formatDocument") },
      ],
    },
    {
      label: "Selection",
      items: () => [
        { label: "Select All", key: "Ctrl+A", run: ed("editor.action.selectAll") },
        { label: "Expand Selection", key: "Shift+Alt+→", run: ed("editor.action.smartSelect.expand") },
        { label: "Shrink Selection", key: "Shift+Alt+←", run: ed("editor.action.smartSelect.shrink") },
        { sep: true },
        { label: "Copy Line Up", key: "Shift+Alt+↑", run: ed("editor.action.copyLinesUpAction") },
        { label: "Copy Line Down", key: "Shift+Alt+↓", run: ed("editor.action.copyLinesDownAction") },
        { label: "Move Line Up", key: "Alt+↑", run: ed("editor.action.moveLinesUpAction") },
        { label: "Move Line Down", key: "Alt+↓", run: ed("editor.action.moveLinesDownAction") },
        { sep: true },
        { label: "Add Cursor Above", key: "Ctrl+Alt+↑", run: ed("editor.action.insertCursorAbove") },
        { label: "Add Cursor Below", key: "Ctrl+Alt+↓", run: ed("editor.action.insertCursorBelow") },
        { label: "Add Next Occurrence", key: "Ctrl+D", run: ed("editor.action.addSelectionToNextFindMatch") },
        { label: "Select All Occurrences", key: "Ctrl+Shift+L", run: ed("editor.action.selectHighlights") },
      ],
    },
    {
      label: "View",
      items: () => [
        { label: "Command Palette…", key: "Ctrl+Shift+P", run: () => store.setCommandPaletteOpen(true) },
        { sep: true },
        { label: "Explorer", key: "Ctrl+Shift+E", run: showPanel("explorer") },
        { label: "Search", key: "Ctrl+Shift+F", run: showPanel("search") },
        { label: "Source Control", key: "Ctrl+Shift+G", run: showPanel("git") },
        { label: "Toggle Side Bar", key: "Ctrl+B", run: () => store.toggleLeftPanel() },
        { label: "Toggle AI Panel", run: () => store.toggleIntelPanel() },
        { label: "Toggle Panel (Terminal)", key: "Ctrl+`", run: () => store.toggleTerminal() },
        { label: "Toggle Problems", key: "Ctrl+Shift+M", run: () => store.toggleProblems() },
        { sep: true },
        { label: store.zenMode ? "Leave Zen Mode" : "Zen Mode", key: "Ctrl+K Z", run: () => store.toggleZen() },
        { label: "Toggle Word Wrap", key: "Alt+Z", run: () => store.setEditorWordWrap(!store.editorWordWrap) },
        { label: "Toggle Minimap", run: () => store.setEditorMinimap(!store.editorMinimap) },
        { label: "Split Editor", key: "Ctrl+\\", run: () => store.activeFile && store.setRightPaneFile(store.activeFile), disabled: !store.activeFile },
      ],
    },
    {
      label: "Go",
      items: () => [
        { label: "Go to File…", key: "Ctrl+P", run: () => store.setCommandPaletteOpen(true) },
        { label: "Go to Symbol in Editor…", key: "Ctrl+Shift+O", run: ed("editor.action.quickOutline") },
        { label: "Go to Line/Column…", key: "Ctrl+G", run: ed("editor.action.gotoLine") },
        { sep: true },
        { label: "Go to Definition", key: "F12", run: ed("editor.action.revealDefinition") },
        { label: "Go to References", key: "Shift+F12", run: ed("editor.action.goToReferences") },
        { label: "Next Problem", key: "F8", run: ed("editor.action.marker.next") },
        { label: "Previous Problem", key: "Shift+F8", run: ed("editor.action.marker.prev") },
      ],
    },
    {
      label: "Run",
      items: () => [
        { label: "Show Testing", run: () => { store.setAppPage("code"); store.setLeftPanelView("tests"); if (!store.leftPanelOpen) store.toggleLeftPanel(); } },
        { label: "Run Task…", run: () => store.setCommandPaletteOpen(true) },
        { sep: true },
        { label: "Open Preview", run: () => store.setAppPage("preview") },
        { label: "Open Source Control", run: () => store.setAppPage("source-control") },
      ],
    },
    {
      label: "Terminal",
      items: () => [
        { label: "New Terminal", key: "Ctrl+`", run: () => { if (!store.terminalOpen) store.toggleTerminal(); } },
        { label: "Toggle Terminal", key: "Ctrl+`", run: () => store.toggleTerminal() },
        { sep: true },
        { label: "Run Task…", run: () => store.setCommandPaletteOpen(true) },
      ],
    },
    {
      label: "Help",
      items: () => [
        { label: "Welcome", run: () => store.setAppPage("welcome") },
        { label: "Keyboard Shortcuts", run: () => store.setShortcutsOpen(true) },
        { sep: true },
        { label: "Command Palette…", key: "Ctrl+Shift+P", run: () => store.setCommandPaletteOpen(true) },
        { label: "Settings", key: "Ctrl+,", run: () => store.setSettingsOpen(true) },
      ],
    },
  ];

  return (
    <div ref={ref} className="no-drag" style={{ display: "flex", alignItems: "center", height: "100%" }}>
      {menus.map((m) => (
        <div key={m.label} style={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
          <button
            onClick={() => setOpen((o) => (o === m.label ? null : m.label))}
            onMouseEnter={() => { if (open) setOpen(m.label); }}
            className="hover:bg-[#18181F] transition-colors"
            style={{
              height: 24, padding: "0 8px", fontSize: 12.5, borderRadius: 5,
              background: open === m.label ? "#1E1E2E" : "transparent", border: "none",
              cursor: "pointer", color: open === m.label ? "#FFFFFF" : "#C7C7D9",
            }}
          >
            {m.label}
          </button>
          {open === m.label && <MenuPanel items={m.items()} onClose={() => setOpen(null)} />}
        </div>
      ))}
    </div>
  );
}
