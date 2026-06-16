// Extract TODO/FIXME-style markers from source text for the TODOs panel.

export type TodoKind = "TODO" | "FIXME" | "HACK" | "XXX" | "NOTE" | "BUG";
export interface Todo { line: number; kind: TodoKind; text: string }

const KINDS = "TODO|FIXME|HACK|XXX|NOTE|BUG";
// Match a marker that follows a comment opener (// # /* * <!-- ;) on the line.
const RE = new RegExp(`(?://|#|/\\*|\\*|<!--|;|--)\\s*(${KINDS})\\b[:\\s-]*(.*?)\\s*(?:\\*/|-->)?\\s*$`, "i");

export function extractTodos(text: string): Todo[] {
  const out: Todo[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = RE.exec(lines[i]);
    if (m) out.push({ line: i + 1, kind: m[1].toUpperCase() as TodoKind, text: m[2].trim() });
  }
  return out;
}

export const TODO_COLOR: Record<TodoKind, string> = {
  TODO: "#3B82F6", FIXME: "#EF4444", HACK: "#F59E0B", XXX: "#EF4444", NOTE: "#22C55E", BUG: "#EF4444",
};
