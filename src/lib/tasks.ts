/**
 * Tasks runner — reads a VS Code-compatible tasks.json from the workspace
 * (.vscode/tasks.json, falling back to .apex/tasks.json) and exposes the tasks
 * so they can be run in the integrated terminal.
 */
import { readFile } from "./tauri";

export interface ApexTask {
  label: string;
  command: string;
  cwd?: string;
}

/** Strip JSONC comments and trailing commas so tasks.json parses with JSON.parse. */
function stripJsonc(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")          // block comments
    .replace(/(^|[^:"])\/\/[^\n\r]*/g, "$1")  // line comments (skip http://)
    .replace(/,(\s*[}\]])/g, "$1");            // trailing commas
}

export async function loadTasks(workspace: string): Promise<ApexTask[]> {
  if (!workspace) return [];
  const sep = workspace.includes("\\") ? "\\" : "/";
  const candidates = [`.vscode${sep}tasks.json`, `.apex${sep}tasks.json`];
  for (const rel of candidates) {
    try {
      const raw = await readFile(`${workspace}${sep}${rel}`);
      const json = JSON.parse(stripJsonc(raw));
      const list = Array.isArray(json?.tasks) ? json.tasks : [];
      const out: ApexTask[] = [];
      for (const t of list) {
        const base = typeof t.command === "string" ? t.command : null;
        if (!base || !t.label) continue;
        const args = Array.isArray(t.args) ? " " + t.args.join(" ") : "";
        out.push({ label: String(t.label), command: base + args, cwd: t?.options?.cwd });
      }
      if (out.length) return out;
    } catch {
      /* try next candidate */
    }
  }
  return [];
}
