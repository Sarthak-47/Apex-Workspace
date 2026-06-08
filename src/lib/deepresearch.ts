/**
 * Deep Research mode (Odysseus backlog B2).
 * A structured multi-step run: derive sub-queries from the objective, gather
 * from web (SearXNG) + codebase index + vault, then synthesize a cited report.
 * Sibling to Plan mode; not the same as the single-shot agent.
 */
import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { webSearch } from './websearch';
import { searchIndex } from './codeindex';
import { listVault, type VaultNote } from './vault';

export interface ResearchProgress { phase: string; step: number; total: number }
export interface ResearchSource { kind: 'web' | 'code' | 'vault'; title: string; ref: string }
export interface ResearchResult { report: string; sources: ResearchSource[] }

export interface DeepResearchOpts {
  model: string;
  workspace?: string;
  searxngUrl?: string;
  onProgress?: (p: ResearchProgress) => void;
  signal?: AbortSignal;
}

function ollama() { return createOllama({ baseURL: 'http://localhost:11434/api' }); }

/** Ask the model for 3–4 focused sub-queries. */
async function deriveQueries(objective: string, model: string, signal?: AbortSignal): Promise<string[]> {
  const { text } = await generateText({
    model: ollama()(model),
    system: 'You break a research objective into 3-4 specific search queries. Output ONLY the queries, one per line, no numbering or commentary.',
    prompt: objective,
    abortSignal: signal,
  });
  return text.split('\n').map(l => l.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 4);
}

export async function runDeepResearch(objective: string, opts: DeepResearchOpts): Promise<ResearchResult> {
  const { model, workspace, searxngUrl, onProgress, signal } = opts;
  const sources: ResearchSource[] = [];
  const evidence: string[] = [];

  onProgress?.({ phase: 'Planning queries', step: 0, total: 4 });
  const queries = await deriveQueries(objective, model, signal).catch(() => [objective]);

  onProgress?.({ phase: 'Gathering sources', step: 1, total: 4 });
  for (const q of queries) {
    if (signal?.aborted) break;
    // Web
    if (searxngUrl) {
      try {
        const web = await webSearch(q, searxngUrl, signal);
        for (const r of web.slice(0, 3)) {
          sources.push({ kind: 'web', title: r.title, ref: r.url });
          evidence.push(`[web] ${r.title} (${r.url})\n${r.snippet}`);
        }
      } catch { /* searxng offline */ }
    }
    // Codebase
    try {
      const hits = await searchIndex(q, 3);
      for (const h of hits) {
        const ref = `${h.filePath.split(/[\\/]/).pop()}:${h.startLine}`;
        sources.push({ kind: 'code', title: ref, ref });
        evidence.push(`[code] ${ref}\n${h.text.slice(0, 300)}`);
      }
    } catch { /* no index */ }
    // Vault
    if (workspace) {
      try {
        const notes = await listVault(workspace).catch(() => [] as VaultNote[]);
        const term = q.toLowerCase();
        for (const n of notes.filter(n => n.title.toLowerCase().includes(term) || n.body.toLowerCase().includes(term)).slice(0, 2)) {
          sources.push({ kind: 'vault', title: n.title, ref: n.title });
          evidence.push(`[vault] ${n.title}\n${n.body.replace(/^#.*$/m, '').slice(0, 300)}`);
        }
      } catch { /* none */ }
    }
  }

  onProgress?.({ phase: 'Synthesizing report', step: 3, total: 4 });
  const { text: report } = await generateText({
    model: ollama()(model),
    system: 'You write a concise research report in Markdown from the provided evidence ONLY. Structure: a short summary, then "## Findings" with bullet points that cite sources inline (by their [web]/[code]/[vault] label), then "## Open questions". Never invent facts beyond the evidence.',
    prompt: `Objective: ${objective}\n\nEvidence:\n${evidence.join('\n\n').slice(0, 16000) || '(no sources found)'}\n\nWrite the report:`,
    abortSignal: signal,
  });

  onProgress?.({ phase: 'Done', step: 4, total: 4 });
  return { report: report.trim(), sources };
}
