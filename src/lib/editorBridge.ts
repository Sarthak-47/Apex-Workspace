// Bridge so chrome outside the editor (menu bar, etc.) can drive the
// currently-focused Monaco editor and trigger a save.
import type { editor as MonacoEditor } from "monaco-editor";

type Ed = MonacoEditor.IStandaloneCodeEditor;

let active: Ed | null = null;
let saver: (() => void) | null = null;

export function setActiveEditor(e: Ed | null) { active = e; }
export function setSaver(fn: (() => void) | null) { saver = fn; }
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
