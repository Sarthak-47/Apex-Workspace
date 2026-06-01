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
