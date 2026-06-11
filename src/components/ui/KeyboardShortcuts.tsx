import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { APP_COMMANDS, eventToChord, isValidChord, effectiveKeys } from "@/lib/keymap";

interface Row { id?: string; command: string; keys: string; category: string; rebindable: boolean; overridden?: boolean }

// Monaco / editor / chat bindings — shown for reference, not rebindable here
// (they live in Monaco's own keybinding service).
const STATIC: Omit<Row, "rebindable">[] = [
  { command: "Save", keys: "Ctrl S", category: "Editor" },
  { command: "Close Editor", keys: "Ctrl W", category: "Editor" },
  { command: "Find", keys: "Ctrl F", category: "Editor" },
  { command: "Replace", keys: "Ctrl H", category: "Editor" },
  { command: "Go to Line/Column", keys: "Ctrl G", category: "Editor" },
  { command: "Go to Symbol in Editor", keys: "Ctrl Shift O", category: "Editor" },
  { command: "Format Document", keys: "Shift Alt F", category: "Editor" },
  { command: "Toggle Line Comment", keys: "Ctrl /", category: "Editor" },
  { command: "Toggle Block Comment", keys: "Shift Alt A", category: "Editor" },
  { command: "Font Size Increase / Decrease", keys: "Ctrl = / Ctrl -", category: "Editor" },
  { command: "Toggle Word Wrap", keys: "Alt Z", category: "Editor" },
  { command: "Split Editor", keys: "Ctrl \\", category: "Editor" },
  { command: "Zen Mode", keys: "Ctrl K Z", category: "Editor" },
  { command: "Select All", keys: "Ctrl A", category: "Selection" },
  { command: "Add Next Occurrence", keys: "Ctrl D", category: "Selection" },
  { command: "Select All Occurrences", keys: "Ctrl Shift L", category: "Selection" },
  { command: "Add Cursor Above", keys: "Ctrl Alt ↑", category: "Selection" },
  { command: "Add Cursor Below", keys: "Ctrl Alt ↓", category: "Selection" },
  { command: "Move Line Up / Down", keys: "Alt ↑ / Alt ↓", category: "Selection" },
  { command: "Go to Definition", keys: "F12", category: "Code Intelligence" },
  { command: "Find All References", keys: "Shift F12", category: "Code Intelligence" },
  { command: "Rename Symbol", keys: "F2", category: "Code Intelligence" },
  { command: "Trigger Completion", keys: "Ctrl Space", category: "Code Intelligence" },
  { command: "Send Message", keys: "Enter", category: "Chat" },
  { command: "New Line", keys: "Shift Enter", category: "Chat" },
  { command: "Mention files / people / projects", keys: "@", category: "Chat" },
];

function KeyChips({ keys }: { keys: string }) {
  return (
    <span style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
      {keys.split(/[\s+]/).filter(Boolean).map((part, i) =>
        part === "/" ? (
          <span key={i} style={{ color: "#4A4A65", alignSelf: "center" }}>/</span>
        ) : (
          <kbd key={i} style={{ fontSize: 10, color: "#C0C0D0", background: "#18181F", border: "1px solid #252535", borderRadius: 4, padding: "2px 6px", fontFamily: '"JetBrains Mono",monospace' }}>{part}</kbd>
        )
      )}
    </span>
  );
}

function IconBtn({ title, onClick, color = "#6A6A85", children }: { title: string; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      className="hover:bg-white/5"
      style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "none", border: "none", cursor: "pointer", color }}>
      {children}
    </button>
  );
}

export function KeyboardShortcuts() {
  const { shortcutsOpen, setShortcutsOpen, keymap, setKeybinding, resetKeybinding, resetAllKeybindings, addToast } = useAppStore();
  const [query, setQuery] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (recordingId) return; // Esc cancels recording, handled separately
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShortcutsOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setShortcutsOpen, recordingId]);

  useEffect(() => { if (shortcutsOpen) { setQuery(""); setRecordingId(null); setTimeout(() => inputRef.current?.focus(), 0); } }, [shortcutsOpen]);

  // Capture-phase listener that records the next chord for the editing row.
  useEffect(() => {
    if (!recordingId) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecordingId(null); return; }
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return; // wait for the real key
      const chord = eventToChord(e);
      if (!isValidChord(chord)) { addToast("Use a Ctrl or Alt combination", "error"); return; }
      // Reject collisions with another app command.
      const clash = APP_COMMANDS.find((c) => c.id !== recordingId && effectiveKeys(c.id, keymap, c.defaultKeys) === chord);
      if (clash) { addToast(`${chord} is already used by "${clash.label}"`, "error"); return; }
      setKeybinding(recordingId, chord);
      setRecordingId(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [recordingId, keymap, setKeybinding, addToast]);

  const rows = useMemo<Row[]>(() => {
    const app: Row[] = APP_COMMANDS.map((c) => ({
      id: c.id, command: c.label, category: c.category, rebindable: true,
      keys: effectiveKeys(c.id, keymap, c.defaultKeys), overridden: keymap[c.id] !== undefined,
    }));
    const stat: Row[] = STATIC.map((s) => ({ ...s, rebindable: false }));
    return [...app, ...stat];
  }, [keymap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.command.toLowerCase().includes(q) ||
      r.keys.toLowerCase().replace(/[\s+]/g, " ").includes(q) ||
      r.category.toLowerCase().includes(q)
    );
  }, [query, rows]);

  if (!shortcutsOpen) return null;

  const overrideCount = Object.keys(keymap).length;

  return (
    <div onMouseDown={() => !recordingId && setShortcutsOpen(false)}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}>
      <div onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 660, maxHeight: "80vh", display: "flex", flexDirection: "column", background: "#111118", border: "1px solid #252535", borderRadius: 12, boxShadow: "0 28px 80px rgba(0,0,0,0.8)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 18px", borderBottom: "1px solid #1A1A28", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#E2E2EC" }}>Keyboard Shortcuts</span>
          <span style={{ flex: 1 }} />
          {overrideCount > 0 && (
            <button onClick={resetAllKeybindings} title="Reset all custom keybindings"
              style={{ fontSize: 10.5, color: "#9A9AB5", background: "#18181F", border: "1px solid #252535", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}
              className="hover:!text-[#E2776A]">Reset all ({overrideCount})</button>
          )}
          <kbd style={{ fontSize: 10, color: "#4A4A65", background: "#18181F", padding: "2px 6px", borderRadius: 3, fontFamily: '"JetBrains Mono",monospace' }}>ESC</kbd>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid #1A1A28" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 10px", background: "#18181F", border: "1px solid #252535", borderRadius: 7 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#4A4A65" strokeWidth="1.5" style={{ flexShrink: 0 }}><circle cx="5.5" cy="5.5" r="4" /><line x1="9" y1="9" x2="12" y2="12" /></svg>
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by command, key, or category…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12.5, color: "#E2E2EC" }} />
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
                  <th style={{ textAlign: "left", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "#4A4A65", padding: "7px 14px", width: 220 }}>KEYBINDING</th>
                  <th style={{ textAlign: "left", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "#4A4A65", padding: "7px 18px", width: 140 }}>CATEGORY</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const recording = recordingId === r.id;
                  return (
                    <tr key={(r.id ?? r.command) + r.keys} className="ks-row" style={{ borderTop: i === 0 ? "none" : "1px solid #15151E" }}>
                      <td style={{ fontSize: 12.5, color: "#D2D2E0", padding: "8px 18px" }}>
                        {r.command}
                        {r.overridden && <span style={{ marginLeft: 8, fontSize: 9, color: "var(--accent)", border: "1px solid #6366F140", borderRadius: 7, padding: "0 5px" }}>custom</span>}
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {recording
                            ? <span style={{ fontSize: 11, color: "var(--accent)", fontStyle: "italic" }}>Press keys… (Esc to cancel)</span>
                            : <KeyChips keys={r.keys} />}
                          {r.rebindable && !recording && (
                            <span style={{ display: "flex", gap: 2, marginLeft: "auto" }} className="ks-actions">
                              <IconBtn title="Change keybinding" onClick={() => setRecordingId(r.id!)} color="var(--accent)">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5l2.5 2.5L4 10.5 1.5 11l.5-2.5L8 1.5z"/></svg>
                              </IconBtn>
                              {r.overridden && (
                                <IconBtn title="Reset to default" onClick={() => resetKeybinding(r.id!)}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M10 6A4 4 0 1 1 8 2.5"/><polyline points="8,1 8,2.7 6.3,2.7"/></svg>
                                </IconBtn>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: 11, color: "#6A6A85", padding: "8px 18px" }}>{r.category}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ height: 28, borderTop: "1px solid #1A1A28", display: "flex", alignItems: "center", padding: "0 18px", gap: 14 }}>
          <span style={{ fontSize: 10, color: "#4A4A65" }}>{filtered.length} of {rows.length} shortcuts</span>
          <span style={{ fontSize: 10, color: "#4A4A65" }}>· {APP_COMMANDS.length} rebindable</span>
        </div>
      </div>
    </div>
  );
}
