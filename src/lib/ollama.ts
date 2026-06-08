/**
 * Ollama local inference — health check and API utilities.
 * All calls are fire-and-forget safe; never throw to the caller.
 */

export const OLLAMA_BASE = 'http://localhost:11434';

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
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
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
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
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
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
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
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
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
export async function* streamChat(
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
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
