/**
 * Per-workspace settings — reads a VS Code-compatible settings.json
 * (.vscode/settings.json, falling back to .apex/settings.json) and applies the
 * keys APEX understands. Workspace settings win over global preferences, matching
 * VS Code. Unknown keys are ignored.
 */
import { readFile } from "./tauri";
import { useAppStore } from "@/store";

function stripJsonc(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"])\/\/[^\n\r]*/g, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
}

type Json = Record<string, unknown>;

async function readSettings(workspace: string): Promise<Json | null> {
  const sep = workspace.includes("\\") ? "\\" : "/";
  for (const rel of [`.vscode${sep}settings.json`, `.apex${sep}settings.json`]) {
    try {
      const raw = await readFile(`${workspace}${sep}${rel}`);
      const json = JSON.parse(stripJsonc(raw));
      if (json && typeof json === "object") return json as Json;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Load and apply the workspace's settings.json (if any). */
export async function applyWorkspaceSettings(workspace: string): Promise<void> {
  if (!workspace) return;
  const s = await readSettings(workspace);
  if (!s) return;
  const st = useAppStore.getState();

  const num = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : undefined);
  const bool = (k: string) => (typeof s[k] === "boolean" ? (s[k] as boolean) : undefined);

  const fontSize = num("editor.fontSize");
  if (fontSize !== undefined) st.setEditorFontSize(fontSize);

  const wrap = s["editor.wordWrap"];
  if (typeof wrap === "string") st.setEditorWordWrap(wrap !== "off");
  else if (typeof wrap === "boolean") st.setEditorWordWrap(wrap);

  const minimap = bool("editor.minimap.enabled");
  if (minimap !== undefined) st.setEditorMinimap(minimap);

  const lineNumbers = s["editor.lineNumbers"];
  if (typeof lineNumbers === "string") st.setEditorLineNumbers(lineNumbers !== "off");
  else if (typeof lineNumbers === "boolean") st.setEditorLineNumbers(lineNumbers);

  const formatOnSave = bool("editor.formatOnSave");
  if (formatOnSave !== undefined) st.setFormatOnSave(formatOnSave);

  const autoSave = s["files.autoSave"];
  if (typeof autoSave === "string") st.setAutoSave(autoSave !== "off");
  else if (typeof autoSave === "boolean") st.setAutoSave(autoSave);
}
