/**
 * Web search via a self-hosted SearXNG instance (privacy-first, Odysseus B5).
 * SearXNG returns JSON at /search?format=json. Falls back to a mock in the
 * browser preview.
 */
import { isTauri } from './tauri';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string, instanceUrl: string, signal?: AbortSignal): Promise<SearchResult[]> {
  if (!isTauri()) {
    await new Promise(r => setTimeout(r, 200));
    return [
      { title: `${query} — overview`, url: 'https://example.com/a', snippet: '[browser preview] SearXNG results appear here in the desktop app.' },
      { title: `${query} — docs`, url: 'https://example.com/b', snippet: 'Connect a SearXNG instance (Settings → AI) to enable real web search.' },
    ];
  }
  const base = instanceUrl.replace(/\/$/, '');
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`SearXNG ${res.status} — is the instance running at ${base}?`);
  const data = await res.json() as { results?: { title?: string; url?: string; content?: string }[] };
  return (data.results ?? []).slice(0, 8).map(r => ({
    title: r.title ?? '', url: r.url ?? '', snippet: r.content ?? '',
  }));
}
