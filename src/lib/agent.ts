/**
 * Vercel AI SDK agent tools wired to Tauri backend.
 * Used by IntelPanel when tools mode is enabled.
 */
import { streamText, tool } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { z } from 'zod';
import type { CoreMessage } from 'ai';
import { readFile, listDir, grepFiles } from './tauri';

export interface PendingEdit {
  path: string;
  original: string;
  proposed: string;
}

export interface ToolCallBlock {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'calling' | 'done' | 'error';
}

export interface AgentStreamEvent {
  type: 'text-delta';
  textDelta: string;
}
export interface AgentToolCallEvent {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}
export interface AgentToolResultEvent {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
}
export interface AgentFinishEvent {
  type: 'finish';
}

export type AgentEvent =
  | AgentStreamEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentFinishEvent;

export interface AgentStreamOptions {
  model: string;
  messages: CoreMessage[];
  workspacePath: string;
  signal?: AbortSignal;
  onPendingEdit?: (edit: PendingEdit) => void;
}

export type { CoreMessage };

// ─── Path helpers ─────────────────────────────────────────────────────────────

function resolvePath(workspacePath: string, p: string): string {
  if (!p || p === '.') return workspacePath;
  if (p.startsWith('/') || /^[A-Z]:/i.test(p)) return p;
  const sep = workspacePath.includes('\\') ? '\\' : '/';
  return `${workspacePath}${sep}${p.replace(/\//g, sep)}`;
}

function relPath(workspacePath: string, p: string): string {
  if (p.startsWith(workspacePath)) {
    return p.slice(workspacePath.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
  }
  return p;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

function buildTools(workspacePath: string, onPendingEdit?: (e: PendingEdit) => void) {
  return {
    read_file: tool({
      description: 'Read the full contents of a file. Use paths relative to the workspace root.',
      parameters: z.object({
        path: z.string().describe('File path relative to workspace root (e.g. src/App.tsx)'),
      }),
      execute: async ({ path }) => {
        try {
          const content = await readFile(resolvePath(workspacePath, path));
          return content.length > 12000
            ? content.slice(0, 12000) + '\n\n...(file truncated at 12000 chars)'
            : content;
        } catch (e) {
          return `Error: ${e}`;
        }
      },
    }),

    list_directory: tool({
      description: 'List files and subdirectories in a folder. Use "." for workspace root.',
      parameters: z.object({
        path: z.string().describe('Directory path (use "." for workspace root)'),
        recursive: z.boolean().optional().describe('List recursively (max 4 levels deep)'),
      }),
      execute: async ({ path, recursive }) => {
        try {
          const dir = resolvePath(workspacePath, path);
          if (recursive) {
            const lines: string[] = [];
            const walk = async (d: string, depth: number) => {
              if (depth > 4 || lines.length > 300) return;
              const entries = await listDir(d).catch(() => []);
              for (const e of entries) {
                if (['node_modules', 'target', '.git', 'dist', 'build'].includes(e.name)) continue;
                lines.push(relPath(workspacePath, e.path) + (e.is_dir ? '/' : ''));
                if (e.is_dir) await walk(e.path, depth + 1);
              }
            };
            await walk(dir, 0);
            return lines.join('\n') || '(empty)';
          }
          const entries = await listDir(dir);
          return entries.map(e => e.name + (e.is_dir ? '/' : '')).join('\n') || '(empty)';
        } catch (e) {
          return `Error: ${e}`;
        }
      },
    }),

    search_files: tool({
      description: 'Search for text in workspace files. Returns file:line:content matches (case-insensitive, up to 100).',
      parameters: z.object({
        pattern: z.string().describe('Text pattern to search for'),
        dir: z.string().optional().describe('Subdirectory to limit search (optional)'),
      }),
      execute: async ({ pattern, dir }) => {
        const matches = await grepFiles(workspacePath, pattern, dir);
        return matches.length ? matches.join('\n') : 'No matches found';
      },
    }),

    edit_file: tool({
      description: 'Replace an exact string in a file. The edit is queued for user review — the user must accept it before it is saved.',
      parameters: z.object({
        path: z.string().describe('File path relative to workspace root'),
        old_string: z.string().describe('Exact text to replace (must match character-for-character)'),
        new_string: z.string().describe('Replacement text'),
      }),
      execute: async ({ path, old_string, new_string }) => {
        const fullPath = resolvePath(workspacePath, path);
        try {
          const original = await readFile(fullPath);
          if (!original.includes(old_string)) {
            return `String not found in ${path}. Verify the exact text including whitespace and indentation.`;
          }
          const proposed = original.replace(old_string, new_string);
          onPendingEdit?.({ path: fullPath, original, proposed });
          return `Edit queued for your review in ${path}. The user will accept or reject the change.`;
        } catch (e) {
          return `Error: ${e}`;
        }
      },
    }),

    write_file: tool({
      description: 'Write complete new contents to a file. The change is queued for user review before saving.',
      parameters: z.object({
        path: z.string().describe('File path relative to workspace root'),
        content: z.string().describe('Complete new file contents'),
      }),
      execute: async ({ path, content }) => {
        const fullPath = resolvePath(workspacePath, path);
        let original = '';
        try { original = await readFile(fullPath); } catch { /* new file */ }
        onPendingEdit?.({ path: fullPath, original, proposed: content });
        return `File ${path} queued for your review. The user will accept or reject the change.`;
      },
    }),
  };
}

// ─── Stream factory ───────────────────────────────────────────────────────────

export async function* createAgentStream(opts: AgentStreamOptions): AsyncGenerator<AgentEvent> {
  const { model, messages, workspacePath, signal, onPendingEdit } = opts;

  const ollama = createOllama({ baseURL: 'http://localhost:11434/api' });
  const tools = buildTools(workspacePath, onPendingEdit);

  const result = streamText({
    model: ollama(model),
    messages,
    tools,
    maxSteps: 8,
    abortSignal: signal,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      yield { type: 'text-delta', textDelta: part.textDelta };
    } else if (part.type === 'tool-call') {
      yield {
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: part.args as Record<string, unknown>,
      };
    } else if (part.type === 'tool-result') {
      yield {
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        result: part.result,
      };
    } else if (part.type === 'finish') {
      yield { type: 'finish' };
    }
  }
}
