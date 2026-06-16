// Rebindable keymap for APEX's app-level shortcuts (the ones handled by the
// global keydown listener in App.tsx). Monaco editor commands keep their own
// keybindings and are shown read-only in the Keyboard Shortcuts editor.

export interface KeyCommand {
  id: string;
  label: string;
  category: string;
  defaultKeys: string;
}

// The single source of truth for rebindable commands. App.tsx dispatches on
// the command id; the Keyboard Shortcuts editor lets the user remap the chord.
export const APP_COMMANDS: KeyCommand[] = [
  { id: "commandPalette",     label: "Command Palette / Quick Open", category: "General", defaultKeys: "Ctrl+K" },
  { id: "goToFile",           label: "Go to File",                   category: "General", defaultKeys: "Ctrl+P" },
  { id: "commandPaletteP",    label: "Command Palette (commands)",   category: "General", defaultKeys: "Ctrl+Shift+P" },
  { id: "symbolSearch",       label: "Go to Symbol in Workspace",    category: "General", defaultKeys: "Ctrl+T" },
  { id: "settings",           label: "Settings",                     category: "General", defaultKeys: "Ctrl+," },
  { id: "keyboardShortcuts",  label: "Keyboard Shortcuts",           category: "General", defaultKeys: "Ctrl+/" },
  { id: "openFolder",         label: "Open Folder",                  category: "File",    defaultKeys: "Ctrl+O" },
  { id: "reopenClosed",       label: "Reopen Closed Editor",         category: "File",    defaultKeys: "Ctrl+Shift+T" },
  { id: "toggleTerminal",     label: "Toggle Terminal",              category: "View",    defaultKeys: "Ctrl+`" },
  { id: "showExplorer",       label: "Show Explorer",                category: "View",    defaultKeys: "Ctrl+Shift+E" },
  { id: "showSourceControl",  label: "Show Source Control",          category: "View",    defaultKeys: "Ctrl+Shift+G" },
  { id: "showSearch",         label: "Search in Files",              category: "View",    defaultKeys: "Ctrl+Shift+F" },
  { id: "navBack",            label: "Go Back",                      category: "Navigation", defaultKeys: "Alt+ArrowLeft" },
  { id: "navForward",         label: "Go Forward",                   category: "Navigation", defaultKeys: "Alt+ArrowRight" },
];

const MODS = new Set(["Control", "Shift", "Alt", "Meta"]);

/** Normalize a KeyboardEvent into a chord string like "Ctrl+Shift+E". */
export function eventToChord(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  let key = e.key;
  if (MODS.has(key)) return parts.join("+"); // modifier-only, no main key yet
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

/** A chord is bindable only if it has a non-typing modifier (Ctrl/Alt/Meta). */
export function isValidChord(chord: string): boolean {
  if (!chord) return false;
  const parts = chord.split("+");
  if (parts.length < 2) return false;            // needs a modifier + key
  if (!parts.some((p) => p === "Ctrl" || p === "Alt")) return false;
  return !MODS.has(parts[parts.length - 1]);     // must end in a real key
}

/** Effective binding for a command id, honoring user overrides. */
export function effectiveKeys(id: string, overrides: Record<string, string>, def: string): string {
  return overrides[id] ?? def;
}
