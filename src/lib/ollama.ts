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

/** Send a single chat message to Ollama (non-streaming). Day 5 will use streaming. */
export async function ollamaChat(model: string, prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = await res.json() as { response: string };
  return data.response ?? '';
}
