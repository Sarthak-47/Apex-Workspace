// Command workflows — a Warp Drive-style library of saved, parameterized
// commands that run in the integrated terminal. Persisted in the store.

export interface Workflow {
  id: string;
  name: string;
  command: string;          // may contain {{param}} placeholders
  description?: string;
  tags?: string[];
}

/** Distinct {{param}} names found in a command template, in first-seen order. */
export function workflowParams(command: string): string[] {
  const seen = new Set<string>();
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) seen.add(m[1]);
  return [...seen];
}

/** Substitute {{param}} placeholders with provided values. */
export function applyParams(command: string, values: Record<string, string>): string {
  return command.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (values[k] ?? `{{${k}}}`));
}

export function newWorkflowId(): string {
  try { return crypto.randomUUID(); } catch { return `wf_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
}

// Seed library so the panel is useful on first open.
export const DEFAULT_WORKFLOWS: Workflow[] = [
  { id: "wf-dev",      name: "Start dev server",   command: "npm run dev",            description: "Run the Vite/web dev server",        tags: ["dev"] },
  { id: "wf-build",    name: "Build",              command: "npm run build",          description: "Type-check and production build",    tags: ["build"] },
  { id: "wf-install",  name: "Install deps",       command: "npm install",            description: "Install package dependencies",       tags: ["setup"] },
  { id: "wf-test",     name: "Run tests",          command: "npm test",               description: "Run the test suite",                 tags: ["test"] },
  { id: "wf-tauri",    name: "Tauri dev",          command: "npm run tauri dev",       description: "Run the desktop app in dev mode",   tags: ["dev", "desktop"] },
  { id: "wf-gitpush",  name: "Git: push",          command: "git push",                description: "Push the current branch",            tags: ["git"] },
  { id: "wf-gitpull",  name: "Git: pull",          command: "git pull",                description: "Pull the current branch",            tags: ["git"] },
  { id: "wf-branch",   name: "Git: new branch",    command: "git checkout -b {{branch}}", description: "Create and switch to a branch",   tags: ["git"] },
  { id: "wf-grep",     name: "Search code",        command: "rg {{pattern}}",          description: "ripgrep across the workspace",       tags: ["search"] },
];
