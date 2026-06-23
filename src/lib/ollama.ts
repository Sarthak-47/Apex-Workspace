/**
 * Ollama local inference — health check and API utilities.
 * All calls are fire-and-forget safe; never throw to the caller.
 */

import { useAppStore } from '@/store';
import { getSecret } from '@/lib/tauri';

export const OLLAMA_BASE = 'http://localhost:11434';

export const CLOUD_KEY_NAME = 'cloud-api-key';

/** The configured Ollama/OpenAI-compatible host (remote Ollama, LM Studio, …). */
export function base(): string {
  try { return useAppStore.getState().ollamaBaseUrl?.trim().replace(/\/+$/, '') || OLLAMA_BASE; }
  catch { return OLLAMA_BASE; }
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaStatus {
  online: boolean;
  models: OllamaModel[];
}

/** Poll the Ollama daemon. Resolves within 2 s regardless. */
export async function checkOllama(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${base()}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { online: false, models: [] };
    const data = await res.json() as { models?: OllamaModel[] };
    return { online: true, models: data.models ?? [] };
  } catch {
    return { online: false, models: [] };
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Fill-in-the-middle code completion via Ollama /api/generate.
 * Returns the predicted continuation (ghost text). Never throws.
 */
export async function generateCompletion(
  model: string,
  prefix: string,
  suffix: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const res = await fetch(`${base()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: prefix,
        suffix,
        stream: false,
        options: { temperature: 0.1, num_predict: 96, stop: ['\n\n', '```'] },
      }),
      signal,
    });
    if (!res.ok) return '';
    const data = await res.json() as { response?: string };
    return data.response ?? '';
  } catch {
    return '';
  }
}

/**
 * Pull a model via Ollama /api/pull, streaming progress.
 * Calls onProgress with a 0–100 percentage (best-effort).
 */
export async function pullModel(
  model: string,
  onProgress: (pct: number, status: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${base()}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama pull ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const d = JSON.parse(t) as { status?: string; total?: number; completed?: number; error?: string };
        if (d.error) throw new Error(d.error);
        const pct = d.total && d.completed ? Math.round((d.completed / d.total) * 100) : 0;
        onProgress(pct, d.status ?? '');
      } catch { /* ignore malformed lines */ }
    }
  }
}

/**
 * Get an embedding vector for a text input via Ollama /api/embeddings.
 * Returns [] on failure. Default model: nomic-embed-text.
 */
export async function embed(
  text: string,
  model = 'nomic-embed-text',
  signal?: AbortSignal,
): Promise<number[]> {
  try {
    const res = await fetch(`${base()}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json() as { embedding?: number[] };
    return data.embedding ?? [];
  } catch {
    return [];
  }
}

/**
 * Stream a chat completion from Ollama token by token.
 * Yields each content fragment as it arrives.
 * Caller must handle AbortError when the signal fires.
 */
/** Stream a chat completion from an OpenAI-compatible endpoint (cloud BYO-key
 *  providers like OpenRouter/OpenAI, or Ollama's /v1 endpoint). */
export async function* streamChatOpenAI(
  baseUrl: string,
  apiKey: string | null,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Provider ${res.status}${text ? ': ' + text.slice(0, 140) : ''}`);
  }
  if (!res.body) throw new Error('Response body is null');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* ignore keep-alive / malformed */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Pull a single runnable command line out of a model reply — strips code
 *  fences, a leading `$` prompt marker, and any trailing extra lines. */
export function parseSingleCommand(out: string): string {
  let s = out.trim();
  const fence = s.match(/```[\w]*\n?([\s\S]*?)```/);
  if (fence) s = fence[1];
  return s.replace(/^\s*\$\s*/, '').trim().split('\n')[0].trim();
}

/** Turn a natural-language request into a single shell command (no execution). */
export async function suggestCommand(request: string, model: string, signal?: AbortSignal): Promise<string> {
  const sys = `You translate a natural-language request into ONE shell command.
Output ONLY the command — no explanation, no markdown, no backticks, no leading $.
If unsure, output the closest single command. One line only.`;
  let out = '';
  for await (const chunk of streamChat(model, [{ role: 'system', content: sys }, { role: 'user', content: request }], signal)) {
    out += chunk;
  }
  return parseSingleCommand(out);
}

/** Given a command that failed (and optionally its error output), propose a
 *  single corrected command. Output only — never executed. */
export async function fixCommand(command: string, error: string, model: string, signal?: AbortSignal): Promise<string> {
  const sys = `A shell command failed. Output ONE corrected command that fixes the problem.
Output ONLY the command — no explanation, no markdown, no backticks, no leading $.
Keep the user's intent; fix typos, wrong flags, missing args, or wrong tool. One line only.`;
  const user = error.trim()
    ? `Command:\n${command}\n\nError:\n${error}`
    : `Command:\n${command}`;
  let out = '';
  for await (const chunk of streamChat(model, [{ role: 'system', content: sys }, { role: 'user', content: user }], signal)) {
    out += chunk;
  }
  return parseSingleCommand(out);
}

/** Explain what a shell command does, in plain English. Streams the
 *  explanation so callers can render it as it arrives. Never executes anything. */
export async function* explainCommand(command: string, model: string, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
  const sys = `You explain shell commands in plain English, concisely.
Describe what the command does and flag anything destructive or irreversible.
No code fences. A few short sentences or bullet lines — no preamble.`;
  yield* streamChat(model, [{ role: 'system', content: sys }, { role: 'user', content: command }], signal);
}

export async function* streamChat(
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  // Optional cloud provider lane (BYO-key). Off by default — local stays default.
  const s = useAppStore.getState();
  if (s.cloudEnabled && s.cloudBaseUrl) {
    const key = await getSecret(CLOUD_KEY_NAME);
    yield* streamChatOpenAI(s.cloudBaseUrl, key, s.cloudModel || model, messages, signal);
    return;
  }
  const res = await fetch(`${base()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}${text ? ': ' + text.slice(0, 120) : ''}`);
  }
  if (!res.body) throw new Error('Response body is null');

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const data = JSON.parse(t) as { message?: { content: string }; done?: boolean };
          if (data.message?.content) yield data.message.content;
          if (data.done) return;
        } catch { /* ignore malformed NDJSON lines */ }
      }
    }
    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer) as { message?: { content: string } };
        if (data.message?.content) yield data.message.content;
      } catch {}
    }
  } finally {
    reader.releaseLock();
  }
}
