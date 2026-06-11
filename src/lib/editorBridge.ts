// Bridge so chrome outside the editor (menu bar, etc.) can drive the
// currently-focused Monaco editor and trigger a save.
import type { editor as MonacoEditor } from "monaco-editor";

type Ed = MonacoEditor.IStandaloneCodeEditor;

let active: Ed | null = null;
let saver: (() => void) | null = null;

export function setActiveEditor(e: Ed | null) {
  active = e;
  // Debug handle (also lets the menu bar / tooling reach the live editor).
  (window as unknown as { __apexEditor?: Ed | null }).__apexEditor = e;
}
export function setSaver(fn: (() => void) | null) {
  saver = fn;
  (window as unknown as { __apexSave?: (() => void) | null }).__apexSave = fn;
}
export function getActiveEditor() { return active; }

/** Run a built-in Monaco editor action by id (undo, find, format, …). */
export function runEditorAction(id: string) {
  if (!active) return false;
  const action = active.getAction(id);
  active.focus();
  if (action) { action.run(); return true; }
  // Fall back to trigger for core commands like undo/redo.
  try { active.trigger("menu", id, null); return true; } catch { return false; }
}

export function saveActive() { saver?.(); }
export function hasEditor() { return active !== null; }

/** Current end-of-line sequence of the active editor's model. */
export function getEol(): "LF" | "CRLF" | null {
  const m = active?.getModel();
  if (!m) return null;
  return m.getEOL() === "\r\n" ? "CRLF" : "LF";
}

/** Set the active model's end-of-line sequence (0 = LF, 1 = CRLF). */
export function setEol(eol: "LF" | "CRLF") {
  const m = active?.getModel();
  if (!m) return;
  (m.setEOL as (e: number) => void)(eol === "CRLF" ? 1 : 0);
}
