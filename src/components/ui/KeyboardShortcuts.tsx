import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store";

interface Binding { command: string; keys: string; category: string }

// Full keybinding reference for APEX (mirrors the menu bar + editor commands).
const BINDINGS: Binding[] = [
  // General
  { command: "Command Palette / Quick Open", keys: "Ctrl K", category: "General" },
  { command: "Go to File", keys: "Ctrl P", category: "General" },
  { command: "Go to Symbol in Workspace", keys: "Ctrl T", category: "General" },
  { command: "Keyboard Shortcuts", keys: "Ctrl /", category: "General" },
  { command: "Settings", keys: "Ctrl ,", category: "General" },
  // File
  { command: "Open Folder", keys: "Ctrl O", category: "File" },
  { command: "Save", keys: "Ctrl S", category: "File" },
  { command: "Close Editor", keys: "Ctrl W", category: "File" },
  { command: "Reopen Closed Editor", keys: "Ctrl Shift T", category: "File" },
  // View / Panels
  { command: "Toggle Side Bar", keys: "Ctrl B", category: "View" },
  { command: "Show Explorer", keys: "Ctrl Shift E", category: "View" },
  { command: "Show Source Control", keys: "Ctrl Shift G", category: "View" },
  { command: "Search & Replace in Files", keys: "Ctrl Shift F", category: "View" },
  { command: "Toggle Terminal", keys: "Ctrl `", category: "View" },
  { command: "Toggle Problems", keys: "Ctrl Shift M", category: "View" },
  { command: "Command Palette (commands)", keys: "Ctrl Shift P", category: "View" },
  { command: "Split Editor", keys: "Ctrl \\", category: "View" },
  { command: "Zen Mode", keys: "Ctrl K Z", category: "View" },
  // Editor
  { command: "Find", keys: "Ctrl F", category: "Editor" },
  { command: "Replace", keys: "Ctrl H", category: "Editor" },
  { command: "Go to Line/Column", keys: "Ctrl G", category: "Editor" },
  { command: "Go to Symbol in Editor", keys: "Ctrl Shift O", category: "Editor" },
  { command: "Format Document", keys: "Shift Alt F", category: "Editor" },
  { command: "Toggle Line Comment", keys: "Ctrl /", category: "Editor" },
  { command: "Toggle Block Comment", keys: "Shift Alt A", category: "Editor" },
  { command: "Font Size Increase / Decrease", keys: "Ctrl = / Ctrl -", category: "Editor" },
  { command: "Toggle Word Wrap", keys: "Alt Z", category: "Editor" },
  // Selection / multi-cursor
  { command: "Select All", keys: "Ctrl A", category: "Selection" },
  { command: "Add Next Occurrence", keys: "Ctrl D", category: "Selection" },
  { command: "Select All Occurrences", keys: "Ctrl Shift L", category: "Selection" },
  { command: "Add Cursor Above", keys: "Ctrl Alt ↑", category: "Selection" },
  { command: "Add Cursor Below", keys: "Ctrl Alt ↓", category: "Selection" },
  { command: "Move Line Up", keys: "Alt ↑", category: "Selection" },
  { command: "Move Line Down", keys: "Alt ↓", category: "Selection" },
  { command: "Copy Line Up", keys: "Shift Alt ↑", category: "Selection" },
  { command: "Copy Line Down", keys: "Shift Alt ↓", category: "Selection" },
  { command: "Expand Selection", keys: "Shift Alt →", category: "Selection" },
  { command: "Shrink Selection", keys: "Shift Alt ←", category: "Selection" },
  // Code intelligence (LSP)
  { command: "Go to Definition", keys: "F12", category: "Code Intelligence" },
  { command: "Find All References", keys: "Shift F12", category: "Code Intelligence" },
  { command: "Rename Symbol", keys: "F2", category: "Code Intelligence" },
  { command: "Trigger Completion", keys: "Ctrl Space", category: "Code Intelligence" },
  { command: "Next Problem", keys: "F8", category: "Code Intelligence" },
  { command: "Previous Problem", keys: "Shift F8", category: "Code Intelligence" },
  // Chat
  { command: "Send Message", keys: "Enter", category: "Chat" },
  { command: "New Line", keys: "Shift Enter", category: "Chat" },
  { command: "Mention files / people / projects", keys: "@", category: "Chat" },
];

function KeyChips({ keys }: { keys: string }) {
  return (
    <span style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {keys.split(" ").map((part, i) =>
        part === "/" ? (
          <span key={i} style={{ color: "#4A4A65", alignSelf: "center" }}>/</span>
        ) : (
          <kbd key={i} style={{ fontSize: 10, color: "#C0C0D0", background: "#18181F", border: "1px solid #252535", borderRadius: 4, padding: "2px 6px", fontFamily: '"JetBrains Mono",monospace' }}>{part}</kbd>
        )
      )}
    </span>
  );
}

export function KeyboardShortcuts() {
  const { shortcutsOpen, setShortcutsOpen } = useAppStore();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShortcutsOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setShortcutsOpen]);

  useEffect(() => { if (shortcutsOpen) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 0); } }, [shortcutsOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BINDINGS;
    return BINDINGS.filter((b) =>
      b.command.toLowerCase().includes(q) ||
      b.keys.toLowerCase().replace(/\s+/g, " ").includes(q) ||
      b.category.toLowerCase().includes(q)
    );
  }, [query]);

  if (!shortcutsOpen) return null;

  return (
    <div onMouseDown={() => setShortcutsOpen(false)}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}>
      <div onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 620, maxHeight: "78vh", display: "flex", flexDirection: "column", background: "#111118", border: "1px solid #252535", borderRadius: 12, boxShadow: "0 28px 80px rgba(0,0,0,0.8)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 18px", borderBottom: "1px solid #1A1A28", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#E2E2EC" }}>Keyboard Shortcuts</span>
          <span style={{ flex: 1 }} />
          <kbd style={{ fontSize: 10, color: "#4A4A65", background: "#18181F", padding: "2px 6px", borderRadius: 3, fontFamily: '"JetBrains Mono",monospace' }}>ESC</kbd>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid #1A1A28" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 10px", background: "#18181F", border: "1px solid #252535", borderRadius: 7 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#4A4A65" strokeWidth="1.5" style={{ flexShrink: 0 }}><circle cx="5.5" cy="5.5" r="4" /><line x1="9" y1="9" x2="12" y2="12" /></svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by command, key, or category…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12.5, color: "#E2E2EC" }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "26px", textAlign: "center", fontSize: 12, color: "#4A4A65" }}>No shortcuts match "{query}"</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "#0E0E15" }}>
                  <th style={{ textAlign: "left", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "#4A4A65", padding: "7px 18px" }}>COMMAND</th>
                  <th style={{ textAlign: "left", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "#4A4A65", padding: "7px 14px", width: 200 }}>KEYBINDING</th>
                  <th style={{ textAlign: "left", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "#4A4A65", padding: "7px 18px", width: 150 }}>CATEGORY</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={b.command + b.keys} className="ks-row" style={{ borderTop: i === 0 ? "none" : "1px solid #15151E" }}>
                    <td style={{ fontSize: 12.5, color: "#D2D2E0", padding: "8px 18px" }}>{b.command}</td>
                    <td style={{ padding: "8px 14px" }}><KeyChips keys={b.keys} /></td>
                    <td style={{ fontSize: 11, color: "#6A6A85", padding: "8px 18px" }}>{b.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ height: 28, borderTop: "1px solid #1A1A28", display: "flex", alignItems: "center", padding: "0 18px" }}>
          <span style={{ fontSize: 10, color: "#4A4A65" }}>{filtered.length} of {BINDINGS.length} shortcuts</span>
        </div>
      </div>
    </div>
  );
}
