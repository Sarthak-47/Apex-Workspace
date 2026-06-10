import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore, useToast } from "@/store";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import { readFile, listAllFiles } from "@/lib/tauri";
import { suggestMentions, buildCandidates, expandMentions, type MentionItem } from "@/lib/mentions";
import { generateWorkspaceMd, loadWorkspaceMd, loadProjectMemory } from "@/lib/workspace";
import { listVault, createNote, buildBacklinkIndex, rebuildLinks, exportVaultZip, clearVault, importMarkdownFolder, linkDecisionsToCode, listVersions, saveVersion, serializeNote, CATEGORIES, type VaultNote, type NoteCategory } from "@/lib/vault";
import { openFolderDialog, writeFile as fsWriteFile, extractDocument, openDocumentDialog, killBash } from "@/lib/tauri";
import { extractFromGmail, detectStrictness, type Strictness, type ExtractProgress } from "@/lib/extract";
import { GraphView } from "@/components/knowledge/GraphView";
import { JOB_DEFS, runJobNow, type JobId } from "@/lib/jobs";
import { runDeepResearch } from "@/lib/deepresearch";
import { createLiveNote, runLiveNote, parseLiveConfig, SCHEDULE_PRESETS, type LiveSource } from "@/lib/livenotes";
import { listThreads, draftReply, saveDraft, type EmailThread } from "@/lib/emaildraft";
import { listCalendarEvents, prepForEvent, type CalEvent } from "@/lib/meetingprep";
import { CategoryIcon, ToolIcon, MentionIcon, BoltIcon, AgentIcon } from "@/components/ui/Icons";
import { getLang } from "@/components/editor/MonacoEditor";
import { createAgentStream, type ToolCallBlock, type PendingEdit, type BashDecision } from "@/lib/agent";
import { BUILTIN_AGENTS, getAgentById } from "@/lib/agents";
import { searchIndex, indexWorkspace, indexFile, getStats, clearIndex, type SearchResult, type IndexStats } from "@/lib/codeindex";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  isPlan?: boolean;
  toolCalls?: ToolCallBlock[];
  contextSources?: SearchResult[];
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; lang: string; code: string };

interface PlanStep {
  number: number;
  title: string;
  detail: string;
}

// ─── Plan parser + renderer ───────────────────────────────────────────────────

function parsePlanSteps(content: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const lines = content.split('\n');
  let current: PlanStep | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    const match = line.match(/^(\d+)\.\s+(.+)/);
    if (match) {
      if (current) steps.push(current);
      const rest = match[2];
      // Split on first " — " or " - " for optional detail
      const sep = rest.indexOf(' — ') >= 0 ? ' — ' : rest.indexOf(' - ') >= 0 ? ' - ' : null;
      if (sep) {
        const idx = rest.indexOf(sep);
        current = { number: parseInt(match[1]), title: rest.slice(0, idx).trim(), detail: rest.slice(idx + sep.length).trim() };
      } else {
        current = { number: parseInt(match[1]), title: rest, detail: '' };
      }
    } else if (current && line && !line.startsWith('```')) {
      // Append continuation text as detail
      if (!current.detail) current.detail = line;
    }
  }
  if (current) steps.push(current);
  return steps;
}

function hasPlanStructure(content: string): boolean {
  const numbered = content.split('\n').filter(l => /^\d+\.\s+\S/.test(l.trim()));
  return numbered.length >= 3;
}

function PlanResponse({ content, streaming }: { content: string; streaming?: boolean }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const steps = parsePlanSteps(content);

  // Extract text before the numbered list as intro
  const firstStepIdx = content.search(/^\d+\.\s/m);
  const intro = firstStepIdx > 0 ? content.slice(0, firstStepIdx).trim() : '';

  const toggle = (n: number) => setChecked(prev => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });

  const done = checked.size;

  return (
    <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
      {/* Intro text */}
      {intro && <p style={{ marginBottom: 10, color: '#C0C0D0' }}>{intro}</p>}

      {/* Step cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map(step => {
          const isDone = checked.has(step.number);
          return (
            <div
              key={step.number}
              onClick={() => toggle(step.number)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                background: isDone ? '#0A1A0A' : '#18181F',
                border: `1px solid ${isDone ? '#22C55E20' : '#252535'}`,
                transition: 'all 0.15s',
              }}
              className="hover:!border-[#6366F130]"
            >
              {/* Checkbox */}
              <div style={{
                width: 16, height: 16, borderRadius: 3, flexShrink: 0, marginTop: 1,
                border: `1.5px solid ${isDone ? '#22C55E' : '#4A4A65'}`,
                background: isDone ? '#22C55E' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {isDone && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg>}
              </div>

              {/* Step number badge */}
              <span style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                background: isDone ? '#22C55E20' : '#1A1A3A',
                border: `1px solid ${isDone ? '#22C55E40' : '#6366F130'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700,
                color: isDone ? '#22C55E' : 'var(--accent)',
              }}>
                {step.number}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 500,
                  color: isDone ? '#4A4A65' : '#E2E2EC',
                  textDecoration: isDone ? 'line-through' : 'none',
                  transition: 'all 0.15s',
                }}>
                  {step.title}
                </div>
                {step.detail && (
                  <div style={{ fontSize: 11, color: isDone ? '#4A4A65' : '#8888A8', marginTop: 1 }}>
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress + streaming cursor */}
      {steps.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 3, background: '#252535', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#22C55E', borderRadius: 2, transition: 'width 0.3s', width: `${(done / steps.length) * 100}%` }} />
          </div>
          <span style={{ fontSize: 10, color: done === steps.length ? '#22C55E' : '#4A4A65' }}>
            {done === steps.length ? '✓ all done' : `${done}/${steps.length}`}
          </span>
          {streaming && <span className="blink" style={{ display: 'inline-block', width: 7, height: 13, background: 'var(--accent)', verticalAlign: 'text-bottom' }} />}
        </div>
      )}
    </div>
  );
}

// ─── Content parser ───────────────────────────────────────────────────────────

function parseBlocks(content: string): ContentBlock[] {
  const result: ContentBlock[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    const before = content.slice(last, m.index).trim();
    if (before) result.push({ type: 'text', text: before });
    result.push({ type: 'code', lang: m[1] || 'text', code: m[2].trimEnd() });
    last = m.index + m[0].length;
  }

  const tail = content.slice(last).trim();
  if (tail) result.push({ type: 'text', text: tail });
  return result.length > 0 ? result : [{ type: 'text', text: content }];
}

// ─── Language normaliser (handles ts/typescript, sh/bash/shell etc.) ─────────

const LANG_NORM: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python',
  rs: 'rust',
  sh: 'shell', bash: 'shell', zsh: 'shell', console: 'shell',
};
const normLang = (l: string) => LANG_NORM[l.toLowerCase()] ?? l.toLowerCase();
const isShellLang = (l: string) => ['shell', 'bash', 'sh', 'zsh', 'console'].includes(normLang(l));

// ─── Code block ───────────────────────────────────────────────────────────────

function Code({
  lang, code,
  onApply, onRun,
}: {
  lang: string;
  code: string;
  onApply?: () => void;
  onRun?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const apply = () => {
    onApply?.();
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  return (
    <div style={{ background: '#090910', border: '1px solid #252535', borderRadius: 6, marginTop: 6, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ minHeight: 28, background: '#111118', borderBottom: '1px solid #1A1A28', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '.05em', fontFamily: 'JetBrains Mono,monospace', flex: 1 }}>{lang || 'text'}</span>

        {/* Apply to file — shown for non-shell code when a file is active */}
        {onApply && (
          <button onClick={apply}
            style={{ fontSize: 10, color: applied ? '#22C55E' : 'var(--accent)', cursor: 'pointer', background: applied ? '#0A1F0A' : '#1A1A3A', border: `1px solid ${applied ? '#22C55E30' : '#6366F130'}`, borderRadius: 3, padding: '2px 7px', fontFamily: 'inherit', transition: 'all 0.15s' }}
            className="hover:!bg-[#252552] transition-colors">
            {applied ? '✓ Applied' : 'Apply to file'}
          </button>
        )}

        {/* Run in terminal — shown for shell code */}
        {onRun && (
          <button onClick={onRun}
            style={{ fontSize: 10, color: '#22C55E', cursor: 'pointer', background: '#0A1F0A', border: '1px solid #22C55E30', borderRadius: 3, padding: '2px 7px', fontFamily: 'inherit' }}
            className="hover:!bg-[#0D2A0D] transition-colors">
            ▶ Run
          </button>
        )}

        <button onClick={copy}
          style={{ fontSize: 10, color: '#4A4A65', cursor: 'pointer', background: 'none', border: 'none', padding: '2px 4px' }}
          className="hover:!text-[#E2E2EC] transition-colors">
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
      <pre style={{ padding: '10px 12px', fontSize: 11.5, lineHeight: 1.65, overflowX: 'auto', fontFamily: '"JetBrains Mono",monospace', color: '#8888A8', margin: 0, whiteSpace: 'pre' }}>
        {code}
      </pre>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  msg: Message;
  activeFile: string | null;
  onApplyCode: (code: string) => void;
  onRunCommand: (cmd: string) => void;
}

function MessageBubble({ msg, activeFile, onApplyCode, onRunCommand }: BubbleProps) {
  if (msg.role === 'user') {
    return (
      <div style={{
        background: '#1A1A3A', border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '8px 8px 2px 8px', padding: '10px 12px',
        fontSize: 13, color: '#E2E2EC', alignSelf: 'flex-end',
        maxWidth: '88%', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    );
  }

  // Tool calls (rendered before text content)
  const hasCalls = msg.toolCalls && msg.toolCalls.length > 0;

  // Assistant streaming — show raw text
  if (msg.streaming) {
    const looksLikePlan = hasPlanStructure(msg.content);
    return (
      <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
        {hasCalls && msg.toolCalls!.map(tc => <ToolCallView key={tc.id} call={tc} />)}
        {msg.content && (looksLikePlan
          ? <PlanResponse content={msg.content} streaming />
          : <>
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
              <span className="blink" style={{ display: 'inline-block', width: 7, height: 13, background: 'var(--accent)', verticalAlign: 'text-bottom', marginLeft: 2 }} />
            </>
        )}
        {!msg.content && msg.streaming && !hasCalls && (
          <span className="blink" style={{ display: 'inline-block', width: 7, height: 13, background: 'var(--accent)', verticalAlign: 'text-bottom' }} />
        )}
      </div>
    );
  }

  // Completed plan response
  if (msg.isPlan || hasPlanStructure(msg.content)) {
    return (
      <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
        {hasCalls && msg.toolCalls!.map(tc => <ToolCallView key={tc.id} call={tc} />)}
        <PlanResponse content={msg.content} />
      </div>
    );
  }

  const activeLang = activeFile ? normLang(getLang(activeFile)) : null;
  const blocks = parseBlocks(msg.content);

  return (
    <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
      {msg.contextSources && msg.contextSources.length > 0 && <ContextSources sources={msg.contextSources} />}
      {hasCalls && msg.toolCalls!.map(tc => <ToolCallView key={tc.id} call={tc} />)}
      {blocks.map((block, i) => {
        if (block.type === 'code') {
          const blockLang = normLang(block.lang);
          const canApply = !!activeFile && !!activeLang && blockLang === activeLang && !isShellLang(block.lang);
          const canRun   = isShellLang(block.lang);
          return (
            <Code
              key={i}
              lang={block.lang}
              code={block.code}
              onApply={canApply ? () => onApplyCode(block.code) : undefined}
              onRun={canRun ? () => onRunCommand(block.code) : undefined}
            />
          );
        }
        return (
          <p key={i} style={{ margin: i === 0 ? 0 : '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

// ─── Tool call block ──────────────────────────────────────────────────────────

function ToolCallView({ call }: { call: ToolCallBlock }) {
  const [expanded, setExpanded] = useState(false);

  const argSummary = (() => {
    const { path, pattern } = call.args as { path?: string; pattern?: string };
    return path ?? pattern ?? Object.values(call.args)[0] as string ?? '';
  })();

  return (
    <div style={{
      margin: '4px 0', borderRadius: 5, overflow: 'hidden',
      border: `1px solid ${call.status === 'error' ? '#EF444430' : '#252535'}`,
      background: '#0D0D16',
    }}>
      <div
        onClick={() => call.result && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 10px', cursor: call.result ? 'pointer' : 'default',
        }}
        className={call.result ? 'hover:bg-white/5 transition-colors' : ''}
      >
        {/* Status indicator */}
        {call.status === 'calling' ? (
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            border: '2px solid var(--accent)', borderTopColor: 'transparent',
            animation: 'spin 0.6s linear infinite',
          }} />
        ) : call.status === 'error' ? (
          <span style={{ fontSize: 10, color: '#EF4444' }}>✕</span>
        ) : (
          <span style={{ fontSize: 10, color: '#22C55E' }}>✓</span>
        )}

        <span style={{ display: 'flex', color: '#8888A8' }}><ToolIcon name={call.toolName} size={12} /></span>

        <span style={{ fontSize: 11, color: '#8888A8', fontFamily: '"JetBrains Mono",monospace' }}>
          {call.toolName}
        </span>
        {argSummary && (
          <span style={{
            fontSize: 11, color: 'var(--accent)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            fontFamily: '"JetBrains Mono",monospace',
          }}>
            {String(argSummary).replace(/\\/g, '/')}
          </span>
        )}
        {call.result && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#4A4A65" strokeWidth="1.5"
            style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}>
            <polyline points="2,1 6,4 2,7"/>
          </svg>
        )}
      </div>
      {expanded && call.result && (
        <pre style={{
          margin: 0, padding: '6px 10px 8px',
          borderTop: '1px solid #1A1A28',
          fontSize: 10.5, fontFamily: '"JetBrains Mono",monospace',
          color: '#6C6C8A', lineHeight: 1.55, overflowX: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          maxHeight: 200, overflowY: 'auto',
        }}>
          {String(call.result).slice(0, 3000)}
        </pre>
      )}
    </div>
  );
}

// ─── Context sources (injected codebase chunks) ──────────────────────────────

function ContextSources({ sources }: { sources: SearchResult[] }) {
  const [open, setOpen] = useState(false);
  const rel = (p: string) => p.split(/[\\/]/).slice(-2).join('/');
  return (
    <div style={{ margin: '2px 0 6px' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 10, padding: 0 }}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}>
          <polyline points="2,1 6,4 2,7"/>
        </svg>
        <span style={{ fontFamily: '"JetBrains Mono",monospace' }}>{sources.length} context source{sources.length > 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sources.map((s, i) => (
            <div key={i} style={{ fontSize: 10, color: '#6C6C8A', fontFamily: '"JetBrains Mono",monospace', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 6px', background: '#0D0D16', borderRadius: 3 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rel(s.filePath)}:{s.startLine}-{s.endLine}</span>
              <span style={{ color: '#4A4A65', flexShrink: 0 }}>{(s.score * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Context tab — codebase index management ──────────────────────────────────

function ContextPanel() {
  const {
    workspacePath, ollamaOnline, embedModel, setEmbedModel,
    indexProgress, setIndexProgress,
    contextInjectionEnabled, setContextInjectionEnabled,
  } = useAppStore();
  const { info, error, success } = useToast();
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const indexAbort = useRef<AbortController | null>(null);

  const refresh = useCallback(() => { getStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const ingestDoc = async () => {
    if (!workspacePath) { info('Open a workspace first'); return; }
    if (!ollamaOnline) { error('Ollama must be running to index a document'); return; }
    const path = await openDocumentDialog();
    if (!path) return;
    setIngesting(true);
    try {
      const text = await extractDocument(path);
      if (!text.trim()) { error('No text extracted from that document'); setIngesting(false); return; }
      const name = (path.split(/[\\/]/).pop() ?? 'document').replace(/\.[^.]+$/, '');
      const sep = workspacePath.includes('\\') ? '\\' : '/';
      const dest = [workspacePath, '.apex', 'docs', `${name}.md`].join(sep);
      await fsWriteFile(dest, `# ${name}\n\n${text}`);
      await indexFile(dest, embedModel);
      success(`Ingested ${name} into the index`);
      refresh();
    } catch (e) { error(`Ingest failed: ${(e as Error).message}`); }
    setIngesting(false);
  };

  const runIndex = async () => {
    if (!workspacePath) { info('Open a workspace first'); return; }
    if (!ollamaOnline) { error('Ollama must be running to build the index'); return; }
    indexAbort.current = new AbortController();
    try {
      await indexWorkspace(workspacePath, embedModel,
        (done, total, file) => setIndexProgress({ done, total, file }),
        indexAbort.current.signal);
      // Refresh the auto-generated workspace overview
      await generateWorkspaceMd(workspacePath).catch(() => {});
      success('Codebase index built');
    } catch (e) {
      error(`Index failed: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setIndexProgress(null), 1500);
      refresh();
    }
  };

  const cancelIndex = () => { indexAbort.current?.abort(); setIndexProgress(null); };

  const wipe = async () => { await clearIndex(); refresh(); info('Index cleared'); };

  const fmtDate = (t: number | null) => t ? new Date(t).toLocaleString() : 'never';
  const busy = !!indexProgress && indexProgress.done < indexProgress.total;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8888A8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Codebase Memory
      </div>

      {/* Stats card */}
      <div style={{ background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        {[
          ['Indexed files', stats ? String(stats.files) : '—'],
          ['Chunks', stats ? String(stats.chunks) : '—'],
          ['Last indexed', stats ? fmtDate(stats.lastIndexed) : '—'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
            <span style={{ color: '#4A4A65' }}>{k}</span>
            <span style={{ color: '#C0C0D0' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Progress */}
      {indexProgress && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 4, background: '#252535', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.2s', width: `${indexProgress.total ? (indexProgress.done / indexProgress.total) * 100 : 0}%` }} />
          </div>
          <div style={{ fontSize: 10, color: '#6C6C8A', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {indexProgress.file || 'Finalizing…'} ({indexProgress.done}/{indexProgress.total})
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {busy ? (
          <button onClick={cancelIndex}
            style={{ flex: 1, height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}>
            Cancel
          </button>
        ) : (
          <button onClick={runIndex} disabled={!ollamaOnline}
            style={{ flex: 1, height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: ollamaOnline ? 'pointer' : 'not-allowed', background: ollamaOnline ? 'var(--accent)' : '#1A1A3A', border: 'none', color: ollamaOnline ? '#fff' : '#4A4A65' }}>
            {stats && stats.chunks > 0 ? 'Re-index' : 'Build Index'}
          </button>
        )}
        <button onClick={wipe}
          style={{ height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>
          Clear
        </button>
      </div>

      {/* Ingest document */}
      <button onClick={ingestDoc} disabled={ingesting || !ollamaOnline}
        style={{ width: '100%', height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: ingesting || !ollamaOnline ? 'default' : 'pointer', background: 'transparent', border: '1px dashed #2A2A3D', color: '#8888A8', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5z"/><polyline points="8 1.5 8 5 11.5 5"/><line x1="7" y1="11" x2="7" y2="7"/><polyline points="5 9 7 7 9 9"/></svg>
        {ingesting ? 'Ingesting…' : 'Ingest document (PDF, DOCX…)'}
      </button>

      {/* Settings */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8888A8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Settings
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#C0C0D0' }}>Inject context into chat</span>
        <button onClick={() => setContextInjectionEnabled(!contextInjectionEnabled)}
          style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', background: contextInjectionEnabled ? 'var(--accent)' : '#252535', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: 2, left: contextInjectionEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#E2E2EC', transition: 'left 150ms' }} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#C0C0D0', flexShrink: 0 }}>Embedding model</span>
        <input value={embedModel} onChange={e => setEmbedModel(e.target.value)}
          style={{ flex: 1, maxWidth: 170, height: 26, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#C0C0D0', fontSize: 11, padding: '0 8px', outline: 'none', fontFamily: '"JetBrains Mono",monospace' }} />
      </div>
      <p style={{ fontSize: 10, color: '#4A4A65', marginTop: 10, lineHeight: 1.5 }}>
        Pull the embedding model first: <code style={{ fontFamily: '"JetBrains Mono",monospace', color: '#6C6C8A' }}>ollama pull {embedModel}</code>. The index is stored locally and never leaves your machine.
      </p>
    </div>
  );
}

// ─── Email panel (COMMS mode) ─────────────────────────────────────────────────

function EmailPanel() {
  const { workspacePath, ollamaOnline, ollamaSelectedModel, ollamaModels, openFile } = useAppStore();
  const { info, error, success } = useToast();
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selected, setSelected] = useState<EmailThread | null>(null);
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [prepping, setPrepping] = useState<string | null>(null);

  useEffect(() => {
    if (!workspacePath) { setThreads([]); setEvents([]); return; }
    listThreads(workspacePath).then(setThreads).catch(() => setThreads([]));
    listCalendarEvents(workspacePath).then(evs => {
      const now = Date.now();
      setEvents(evs.filter(e => e.startsAt >= now).slice(0, 4)); // upcoming few
    }).catch(() => setEvents([]));
  }, [workspacePath]);

  const prep = async (ev: CalEvent) => {
    if (!workspacePath) return;
    if (!ollamaOnline) { error('Ollama must be running for meeting prep'); return; }
    setPrepping(ev.path);
    try {
      const path = await prepForEvent(workspacePath, ev, ollamaSelectedModel || ollamaModels[0] || 'llama3.1');
      if (path) { openFile(path); success('Meeting prep ready'); }
      else error('Prep produced no output');
    } catch (e) { error(`Prep failed: ${(e as Error).message}`); }
    setPrepping(null);
  };

  const doDraft = async () => {
    if (!selected || !workspacePath) return;
    if (!ollamaOnline) { error('Ollama must be running'); return; }
    setDrafting(true);
    try {
      const text = await draftReply(workspacePath, selected, ollamaSelectedModel || ollamaModels[0] || 'llama3.1');
      setDraft(text);
    } catch (e) { error(`Draft failed: ${(e as Error).message}`); }
    setDrafting(false);
  };
  const copyDraft = () => { navigator.clipboard?.writeText(draft).catch(() => {}); info('Draft copied'); };
  const saveDraftNote = async () => {
    if (!selected || !workspacePath || !draft.trim()) return;
    try { await saveDraft(workspacePath, selected, draft); success('Draft saved to vault/drafts/'); }
    catch { info('Saving requires the desktop app'); }
  };

  if (!workspacePath) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <p style={{ fontSize: 12, color: '#4A4A65', textAlign: 'center' }}>Open a workspace and sync Gmail to draft replies.</p>
    </div>;
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Upcoming meetings with per-event prep */}
      {events.length > 0 && (
        <div style={{ flexShrink: 0, padding: '8px 12px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8888A8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Upcoming meetings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {events.map(ev => (
              <div key={ev.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#E2E2EC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                  <div style={{ fontSize: 9, color: '#4A4A65' }}>{ev.date} {ev.time} · {ev.attendees.length} attendee{ev.attendees.length === 1 ? '' : 's'}</div>
                </div>
                <button onClick={() => prep(ev)} disabled={prepping === ev.path || !ollamaOnline} title="Generate a meeting prep brief"
                  style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: ollamaOnline ? 'var(--accent)' : '#4A4A65', background: '#1A1A3A', border: '1px solid #6366F140', borderRadius: 5, padding: '3px 9px', cursor: ollamaOnline ? 'pointer' : 'default' }}>
                  {prepping === ev.path ? '…' : 'Prep'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: '#8888A8', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 12px 6px', flexShrink: 0 }}>Email · {threads.length} threads</div>
      {threads.length === 0 ? (
        <div style={{ padding: '16px', fontSize: 12, color: '#4A4A65', lineHeight: 1.6 }}>No synced threads. Connect Gmail in Settings → Connections.</div>
      ) : !selected ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {threads.map(t => (
            <div key={t.path} onClick={() => { setSelected(t); setDraft(''); }}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, background: '#0F0F16', border: '1px solid #1A1A28' }}
              className="hover:!bg-[#18181F] transition-colors">
              <div style={{ fontSize: 12, color: '#E2E2EC', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div>
              <div style={{ fontSize: 10, color: '#4A4A65', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.participants.map(p => p.replace(/<[^>]+>/, '').trim()).join(', ')} · {t.dateRange}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <button onClick={() => { setSelected(null); setDraft(''); }}
            style={{ alignSelf: 'flex-start', margin: '4px 12px', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', padding: 0 }}>← All threads</button>
          <div style={{ padding: '0 12px', flexShrink: 0 }}>
            <div style={{ fontSize: 13, color: '#E2E2EC', fontWeight: 600 }}>{selected.subject}</div>
            <div style={{ fontSize: 10, color: '#4A4A65', margin: '2px 0 8px' }}>{selected.participants.join(', ')}</div>
          </div>
          <div style={{ flex: '0 0 auto', maxHeight: 160, overflowY: 'auto', margin: '0 12px 8px', padding: 8, background: '#0A0A0F', border: '1px solid #1A1A28', borderRadius: 6, fontSize: 11, color: '#8888A8', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {selected.body.replace(/^#.*$/m, '').trim().slice(0, 1200)}
          </div>
          <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
            <button onClick={doDraft} disabled={drafting || !ollamaOnline}
              style={{ height: 28, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: drafting || !ollamaOnline ? 'default' : 'pointer', background: ollamaOnline ? 'var(--accent)' : '#1A1A3A', border: 'none', color: ollamaOnline ? '#fff' : '#4A4A65' }}>
              {drafting ? 'Drafting…' : 'Draft Reply'}
            </button>
          </div>
          {draft && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 12px 12px' }}>
              <textarea value={draft} onChange={e => setDraft(e.target.value)}
                style={{ flex: 1, minHeight: 100, background: '#18181F', border: '1px solid #252535', borderRadius: 6, color: '#E2E2EC', fontSize: 12, padding: 8, outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button onClick={copyDraft} style={{ flex: 1, height: 26, borderRadius: 5, fontSize: 11, cursor: 'pointer', background: '#1A1A3A', border: '1px solid #6366F140', color: 'var(--accent)' }}>Copy</button>
                <button onClick={saveDraftNote} style={{ flex: 1, height: 26, borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>Save draft</button>
              </div>
              <p style={{ fontSize: 9, color: '#4A4A65', marginTop: 6 }}>Sending is not automated — copy into Gmail to send.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tasks tab — background jobs ──────────────────────────────────────────────

const JOB_STATUS_COLOR: Record<string, string> = {
  idle: '#4A4A65', running: 'var(--accent)', done: '#22C55E', error: '#EF4444', disabled: '#4A4A65',
};

function relTime(t: number | null): string {
  if (!t) return 'never';
  const d = Date.now() - t;
  if (d < 0) { // future (next run)
    const f = -d;
    if (f < 60000) return `in ${Math.round(f / 1000)}s`;
    if (f < 3600000) return `in ${Math.round(f / 60000)}m`;
    if (f < 86400000) return `in ${Math.round(f / 3600000)}h`;
    return `in ${Math.round(f / 86400000)}d`;
  }
  if (d < 60000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.round(d / 3600000)}h ago`;
  return `${Math.round(d / 86400000)}d ago`;
}

function BackgroundTasksPanel() {
  const { jobs, toggleJobEnabled, setJobRuntime } = useAppStore();
  const [expanded, setExpanded] = useState<JobId | null>(null);
  const [, force] = useState(0);
  // tick the relative times every 10s
  useEffect(() => { const id = setInterval(() => force(x => x + 1), 10000); return () => clearInterval(id); }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#8888A8', textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1 }}>
          Background Tasks
        </span>
        {(() => {
          const running = JOB_DEFS.filter(d => jobs[d.id]?.status === 'running').length;
          return running > 0 ? (
            <span style={{ fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />
              {running} running
            </span>
          ) : null;
        })()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {JOB_DEFS.map(def => {
          const rt = jobs[def.id] ?? { status: 'idle', enabled: true, lastRun: null, nextRun: null, lastResult: '', logs: [], startedAt: null };
          const open = expanded === def.id;
          const running = rt.status === 'running';
          return (
            <div key={def.id} style={{ background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px' }}>
                {/* status dot / spinner */}
                {running ? (
                  <div style={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: rt.enabled ? JOB_STATUS_COLOR[rt.status] : '#2A2A3D' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: rt.enabled ? '#E2E2EC' : '#4A4A65', fontWeight: 500 }}>{def.name}</div>
                  <div style={{ fontSize: 9, color: '#4A4A65' }}>
                    {def.schedule} · last {relTime(rt.lastRun)}{def.intervalMs && rt.enabled ? ` · next ${relTime(rt.nextRun)}` : ''}{rt.runCount > 0 ? ` · ${rt.runCount} run${rt.runCount === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                {/* Run now */}
                <button onClick={() => runJobNow(def.id)} disabled={running} title="Run now"
                  style={{ width: 24, height: 24, borderRadius: 4, cursor: running ? 'default' : 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><polygon points="1,0 9,4.5 1,9"/></svg>
                </button>
                {/* enable toggle */}
                <button onClick={() => toggleJobEnabled(def.id)} title={rt.enabled ? 'Disable' : 'Enable'}
                  style={{ width: 30, height: 18, borderRadius: 9, position: 'relative', background: rt.enabled ? 'var(--accent)' : '#252535', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: rt.enabled ? 14 : 2, width: 14, height: 14, borderRadius: '50%', background: '#E2E2EC', transition: 'left 150ms' }} />
                </button>
                {/* expand logs */}
                <button onClick={() => setExpanded(open ? null : def.id)} title="Logs"
                  style={{ width: 20, height: 20, borderRadius: 4, cursor: 'pointer', background: 'transparent', border: 'none', color: '#4A4A65', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}><polyline points="2,1 6,4.5 2,8"/></svg>
                </button>
              </div>
              {rt.lastResult && !open && (
                <div style={{ fontSize: 10, color: rt.status === 'error' ? '#EF4444' : '#6C6C8A', padding: '0 10px 8px 27px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rt.lastResult}</div>
              )}
              {open && (
                <div style={{ borderTop: '1px solid #1A1A28', padding: '6px 10px', maxHeight: 140, overflowY: 'auto' }}>
                  {rt.logs.length === 0 ? (
                    <div style={{ fontSize: 10, color: '#4A4A65' }}>No logs yet.</div>
                  ) : rt.logs.slice(-100).map((l, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#6C6C8A', fontFamily: '"JetBrains Mono",monospace', lineHeight: 1.5 }}>{l}</div>
                  ))}
                  {rt.logs.length > 0 && (
                    <button onClick={() => setJobRuntime(def.id, { logs: [] })}
                      style={{ marginTop: 4, fontSize: 9, color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>clear logs</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 9, color: '#4A4A65', marginTop: 12, lineHeight: 1.5 }}>
        Jobs run while APEX is open. Sync jobs need their connection active. (OS-level scheduling that survives restart is a backend follow-up.)
      </p>
    </div>
  );
}

// ─── Note history viewer ──────────────────────────────────────────────────────

function NoteHistory({ note, workspace, onClose, onRestored }: { note: VaultNote; workspace: string; onClose: () => void; onRestored: () => void }) {
  const { openFile } = useAppStore();
  const { success, error } = useToast();
  const [versions, setVersions] = useState<{ path: string; when: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listVersions(workspace, note.path).then(setVersions).catch(() => setVersions([])).finally(() => setLoading(false));
  }, [workspace, note.path]);

  const restore = async (versionPath: string) => {
    try {
      const content = await readFile(versionPath);
      await saveVersion(workspace, note.path, serializeNote(note.frontmatter, note.body)); // snapshot current first
      await fsWriteFile(note.path, content);
      success('Note restored from history');
      onRestored(); onClose();
    } catch (e) { error(`Restore failed: ${(e as Error).message}`); }
  };

  return (
    <div onMouseDown={onClose} style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 280, maxHeight: '80%', display: 'flex', flexDirection: 'column', background: '#15151E', border: '1px solid #2A2A3D', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #1A1A28', fontSize: 12, fontWeight: 600, color: '#E2E2EC' }}>
          History · {note.title}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loading ? <div style={{ fontSize: 11, color: '#4A4A65', padding: 8 }}>Loading…</div>
            : versions.length === 0 ? <div style={{ fontSize: 11, color: '#4A4A65', padding: 8, lineHeight: 1.5 }}>No prior versions yet. Versions are saved automatically when a note changes.</div>
            : versions.map(v => (
              <div key={v.path} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 5, background: '#0F0F16', border: '1px solid #1A1A28', marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 10, color: '#8888A8', fontFamily: '"JetBrains Mono",monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.when.replace('T', ' ').slice(0, 16)}
                </span>
                <button onClick={() => openFile(v.path)} style={{ fontSize: 9, color: '#8888A8', background: 'transparent', border: '1px solid #252535', borderRadius: 4, padding: '2px 7px', cursor: 'pointer' }}>View</button>
                <button onClick={() => restore(v.path)} style={{ fontSize: 9, color: 'var(--accent)', background: '#1A1A3A', border: '1px solid #6366F140', borderRadius: 4, padding: '2px 7px', cursor: 'pointer' }}>Restore</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─── Knowledge tab — markdown vault browser ──────────────────────────────────

function KnowledgePanel() {
  const { workspacePath, activeFile, openFile, ollamaOnline, ollamaSelectedModel, ollamaModels, setPendingDiffReview } = useAppStore();
  const { info, error, success } = useToast();
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<NoteCategory | null>(null);
  const [newName, setNewName] = useState('');
  const [picker, setPicker] = useState(false);

  // View mode + filters (Day 22)
  const [kview, setKview] = useState<'list' | 'graph'>('list');
  const [catFilter, setCatFilter] = useState<NoteCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');

  // Vault management (Day 24)
  const [manage, setManage] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busyMgmt, setBusyMgmt] = useState(false);

  // Live notes (Day 29)
  const [liveForm, setLiveForm] = useState<{ title: string; objective: string; schedule: string; sources: LiveSource[] } | null>(null);
  const [runningLive, setRunningLive] = useState<string | null>(null);

  // Note history viewer
  const [historyFor, setHistoryFor] = useState<VaultNote | null>(null);

  // Entity extraction (Day 20)
  const [strictness, setStrictness] = useState<Strictness>('medium');
  const [recommended, setRecommended] = useState<{ level: Strictness; humanSenders: number } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [exProgress, setExProgress] = useState<ExtractProgress | null>(null);
  const extractAbort = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (!workspacePath) { setNotes([]); return; }
    setLoading(true);
    listVault(workspacePath).then(setNotes).catch(() => setNotes([])).finally(() => setLoading(false));
  }, [workspacePath]);
  useEffect(() => { refresh(); }, [refresh]);

  // Auto-detect strictness from synced raw threads (first open)
  useEffect(() => {
    if (!workspacePath) return;
    detectStrictness(workspacePath).then(r => {
      if (r.humanSenders > 0) { setRecommended(r); setStrictness(r.level); }
    }).catch(() => {});
  }, [workspacePath]);

  const runExtract = async () => {
    if (!workspacePath) { info('Open a workspace first'); return; }
    if (!ollamaOnline) { error('Ollama must be running for extraction'); return; }
    const model = ollamaSelectedModel || ollamaModels[0] || 'llama3.1';
    extractAbort.current = new AbortController();
    setExtracting(true);
    try {
      const sum = await extractFromGmail(workspacePath, strictness, model,
        p => setExProgress(p), extractAbort.current.signal);
      success(`Extracted: ${sum.created} new, ${sum.updated} updated from ${sum.threads} threads${sum.errors ? ` (${sum.errors} errors)` : ''}`);
      refresh();
    } catch (e) { error(`Extraction failed: ${(e as Error).message}`); }
    setExtracting(false);
    setTimeout(() => setExProgress(null), 1500);
  };

  const cancelExtract = () => { extractAbort.current?.abort(); setExtracting(false); setExProgress(null); };

  // Vault management
  const doRebuild = async () => {
    if (!workspacePath) return;
    setBusyMgmt(true);
    try { const n = await rebuildLinks(workspacePath); success(`Rebuilt links — ${n} note${n === 1 ? '' : 's'} updated`); refresh(); }
    catch (e) { error(`Rebuild failed: ${(e as Error).message}`); }
    setBusyMgmt(false); setManage(false);
  };
  const doExport = async () => {
    if (!workspacePath) return;
    setBusyMgmt(true);
    try { const n = await exportVaultZip(workspacePath); success(`Exported ${n} notes to apex-vault.zip`); }
    catch (e) { error(`Export failed: ${(e as Error).message}`); }
    setBusyMgmt(false); setManage(false);
  };
  const doClear = async () => {
    if (!workspacePath) return;
    try { await clearVault(workspacePath); info('Vault cleared'); refresh(); }
    catch (e) { error(`Clear failed: ${(e as Error).message}`); }
    setConfirmClear(false); setManage(false);
  };
  const doImport = async () => {
    if (!workspacePath) return;
    setManage(false);
    const folder = await openFolderDialog();
    if (!folder) return;
    setBusyMgmt(true);
    try { const r = await importMarkdownFolder(workspacePath, folder); success(`Imported ${r.imported} notes (${r.skipped} skipped)`); refresh(); }
    catch (e) { error(`Import failed: ${(e as Error).message}`); }
    setBusyMgmt(false);
  };
  const doLinkCode = async () => {
    if (!workspacePath) return;
    setBusyMgmt(true);
    try { const n = await linkDecisionsToCode(workspacePath); success(`Linked code in ${n} decision note${n === 1 ? '' : 's'}`); refresh(); }
    catch (e) { error(`Link failed: ${(e as Error).message}`); }
    setBusyMgmt(false); setManage(false);
  };

  // Live notes
  const submitLiveNote = async () => {
    if (!workspacePath || !liveForm || !liveForm.title.trim() || !liveForm.objective.trim()) { setLiveForm(null); return; }
    try {
      const path = await createLiveNote(workspacePath, liveForm.title.trim(), liveForm.objective.trim(), liveForm.schedule, liveForm.sources);
      openFile(path); success('Live note created');
    } catch { info('Live note creation requires the desktop app'); }
    setLiveForm(null); setPicker(false); setTimeout(refresh, 200);
  };
  const runLive = async (note: VaultNote) => {
    if (!ollamaOnline) { error('Ollama must be running'); return; }
    const model = ollamaSelectedModel || ollamaModels[0] || 'llama3.1';
    setRunningLive(note.path);
    try {
      const r = await runLiveNote(workspacePath!, note, model);
      if (r.updated) { setPendingDiffReview({ path: note.path, original: r.before, proposed: r.after }); success('Live note updated — review the diff'); }
      else info('No changes from this run');
      refresh();
    } catch (e) { error(`Live run failed: ${(e as Error).message}`); }
    setRunningLive(null);
  };

  const backlinks = buildBacklinkIndex(notes);

  const filtered = notes
    .filter(n => catFilter === 'all' || n.category === catFilter)
    .filter(n => !query || n.title.toLowerCase().includes(query.toLowerCase()) || n.body.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sortBy === 'name'
      ? a.title.localeCompare(b.title)
      : (b.frontmatter.updated ?? '').localeCompare(a.frontmatter.updated ?? ''));

  const grouped = CATEGORIES.map(c => ({ cat: c, items: filtered.filter(n => n.category === c.id) }))
    .filter(g => g.items.length > 0);

  const submitNew = async () => {
    if (!workspacePath || !creating || !newName.trim()) { setCreating(null); setNewName(''); return; }
    try {
      const path = await createNote(workspacePath, creating, newName.trim());
      openFile(path);
      info(`Created ${newName.trim()}`);
    } catch { info('Note creation requires the desktop app'); }
    setCreating(null); setNewName(''); setPicker(false);
    setTimeout(refresh, 200);
  };

  if (!workspacePath) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p style={{ fontSize: 12, color: '#4A4A65', textAlign: 'center', lineHeight: 1.6 }}>
          Open a workspace to use the<br />knowledge vault.
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
      {/* Note history viewer */}
      {historyFor && workspacePath && (
        <NoteHistory note={historyFor} workspace={workspacePath} onClose={() => setHistoryFor(null)} onRestored={refresh} />
      )}

      {/* Clear-vault confirm */}
      {confirmClear && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={() => setConfirmClear(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 260, background: '#15151E', border: '1px solid #EF444440', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E2EC', marginBottom: 6 }}>Clear the entire vault?</div>
            <p style={{ fontSize: 11, color: '#8888A8', lineHeight: 1.5, marginBottom: 12 }}>
              Deletes all notes, raw syncs and meetings under <code style={{ fontFamily: '"JetBrains Mono",monospace' }}>.apex/vault</code>. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmClear(false)} style={{ height: 28, padding: '0 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>Cancel</button>
              <button onClick={doClear} style={{ height: 28, padding: '0 12px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}>Clear vault</button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ padding: '8px 12px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: '#0A0A0F', border: '1px solid #252535', borderRadius: 5, padding: '0 8px', height: 28 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#4A4A65" strokeWidth="1.5" style={{ flexShrink: 0 }}>
            <circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="11" y2="11"/>
          </svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search vault…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#E2E2EC', fontFamily: 'inherit' }} />
        </div>
        {/* List / Graph toggle */}
        <div style={{ display: 'flex', borderRadius: 5, overflow: 'hidden', border: '1px solid #252535', flexShrink: 0 }}>
          {(['list', 'graph'] as const).map(v => (
            <button key={v} onClick={() => setKview(v)} title={v === 'list' ? 'List view' : 'Graph view'}
              style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                background: kview === v ? '#1A1A3A' : 'transparent', border: 'none', color: kview === v ? 'var(--accent)' : '#4A4A65' }}>
              {v === 'list'
                ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="3" x2="11" y2="3"/><line x1="2" y1="6.5" x2="11" y2="6.5"/><line x1="2" y1="10" x2="11" y2="10"/></svg>
                : <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="3" cy="3.5" r="1.8"/><circle cx="10" cy="4" r="1.8"/><circle cx="6" cy="10" r="1.8"/><line x1="3.6" y1="4.8" x2="5.4" y2="8.7"/><line x1="4.6" y1="3.6" x2="8.4" y2="3.9"/><line x1="9.3" y1="5.5" x2="6.6" y2="8.6"/></svg>}
            </button>
          ))}
        </div>
        <button onClick={() => setPicker(p => !p)} title="New note"
          style={{ width: 28, height: 28, borderRadius: 5, cursor: 'pointer', background: '#1A1A3A', border: '1px solid #6366F140', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="6.5" y1="2" x2="6.5" y2="11"/><line x1="2" y1="6.5" x2="11" y2="6.5"/></svg>
        </button>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setManage(m => !m)} title="Vault management"
            style={{ width: 28, height: 28, borderRadius: 5, cursor: 'pointer', background: manage ? '#1A1A3A' : 'transparent', border: '1px solid #252535', color: manage ? 'var(--accent)' : '#4A4A65', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="7" cy="7" r="2"/><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M11.2 2.8l-1.4 1.4M4.2 9.8l-1.4 1.4"/></svg>
          </button>
          {manage && (
            <div style={{ position: 'absolute', top: 32, right: 0, zIndex: 60, width: 180, background: '#15151E', border: '1px solid #2A2A3D', borderRadius: 8, boxShadow: '0 12px 32px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
              {[
                { label: 'Rebuild links', fn: doRebuild, color: '#C0C0D0' },
                { label: 'Link decisions → code', fn: doLinkCode, color: '#C0C0D0' },
                { label: 'Import folder…', fn: doImport, color: '#C0C0D0' },
                { label: 'Export vault (.zip)', fn: doExport, color: '#C0C0D0' },
                { label: 'Clear vault…', fn: () => { setConfirmClear(true); setManage(false); }, color: '#EF4444' },
              ].map(item => (
                <button key={item.label} onClick={item.fn} disabled={busyMgmt}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, cursor: busyMgmt ? 'default' : 'pointer', background: 'transparent', border: 'none', color: item.color }}
                  className="hover:!bg-[#1A1A3A] transition-colors">
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category tabs + sort (list view) */}
      {kview === 'list' && (
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 8px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          {(['all', ...CATEGORIES.map(c => c.id)] as const).map(c => (
            <button key={c} onClick={() => setCatFilter(c as NoteCategory | 'all')}
              style={{ height: 20, padding: '0 8px', borderRadius: 10, fontSize: 9, cursor: 'pointer', textTransform: 'capitalize',
                background: catFilter === c ? '#1A1A3A' : 'transparent', border: `1px solid ${catFilter === c ? '#6366F140' : '#252535'}`, color: catFilter === c ? 'var(--accent)' : '#8888A8' }}>
              {c}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'date')}
            title="Sort" style={{ height: 20, background: '#18181F', border: '1px solid #252535', borderRadius: 4, color: '#8888A8', fontSize: 9, padding: '0 4px', outline: 'none', cursor: 'pointer' }}>
            <option value="name">By name</option>
            <option value="date">By date</option>
          </select>
        </div>
      )}

      {/* Template picker */}
      {picker && (
        <div style={{ margin: '0 12px 8px', padding: 8, background: '#0F0F16', border: '1px solid #252535', borderRadius: 8 }}>
          {creating ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setCreating(null); setNewName(''); } }}
                placeholder={`New ${creating} name…`}
                style={{ flex: 1, height: 28, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#E2E2EC', fontSize: 12, padding: '0 8px', outline: 'none' }} />
              <button onClick={submitNew} style={{ height: 28, padding: '0 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' }}>Create</button>
            </div>
          ) : liveForm ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: '#F59E0B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5 }}><BoltIcon size={11} color="#F59E0B" />New Live Note</div>
              <input autoFocus value={liveForm.title} onChange={e => setLiveForm({ ...liveForm, title: e.target.value })} placeholder="Title (e.g. Open PRs blocking v2)"
                style={{ height: 28, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#E2E2EC', fontSize: 12, padding: '0 8px', outline: 'none' }} />
              <textarea value={liveForm.objective} onChange={e => setLiveForm({ ...liveForm, objective: e.target.value })} placeholder="Objective — what should this note always reflect?"
                style={{ minHeight: 48, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#E2E2EC', fontSize: 12, padding: '6px 8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
              <select value={liveForm.schedule} onChange={e => setLiveForm({ ...liveForm, schedule: e.target.value })}
                style={{ height: 26, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#C0C0D0', fontSize: 11, padding: '0 6px', outline: 'none', cursor: 'pointer' }}>
                {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(['vault', 'codebase', 'gmail', 'github', 'exa'] as LiveSource[]).map(src => {
                  const on = liveForm.sources.includes(src);
                  return (
                    <button key={src} onClick={() => setLiveForm({ ...liveForm, sources: on ? liveForm.sources.filter(s => s !== src) : [...liveForm.sources, src] })}
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: on ? '#1A1A3A' : 'transparent', border: `1px solid ${on ? '#6366F140' : '#252535'}`, color: on ? 'var(--accent)' : '#4A4A65' }}>
                      {src}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => setLiveForm(null)} style={{ height: 26, padding: '0 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>Cancel</button>
                <button onClick={submitLiveNote} style={{ height: 26, padding: '0 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#F59E0B', border: 'none', color: '#0A0A0F' }}>Create live note</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => { setCreating(c.id); setNewName(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 9px', borderRadius: 5, cursor: 'pointer', background: '#18181F', border: '1px solid #252535', color: c.color }}>
                  <CategoryIcon cat={c.id} size={12} />{c.label}
                </button>
              ))}
              <button onClick={() => setLiveForm({ title: '', objective: '', schedule: 'morning', sources: ['vault', 'codebase'] })}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 9px', borderRadius: 5, cursor: 'pointer', background: '#1A140A', border: '1px solid #F59E0B40', color: '#F59E0B' }}>
                <BoltIcon size={11} />Live Note
              </button>
            </div>
          )}
        </div>
      )}

      {/* Graph view */}
      {kview === 'graph' && <GraphView notes={filtered} onOpen={openFile} />}

      {/* Entity extraction bar */}
      {kview === 'list' && <div style={{ margin: '0 12px 8px', padding: 8, background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>Extract from Gmail</span>
          <select value={strictness} onChange={e => setStrictness(e.target.value as Strictness)} disabled={extracting}
            title="Note-creation strictness"
            style={{ height: 24, background: '#18181F', border: '1px solid #252535', borderRadius: 4, color: '#C0C0D0', fontSize: 10, padding: '0 4px', outline: 'none', cursor: 'pointer' }}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {extracting ? (
            <button onClick={cancelExtract} style={{ height: 24, padding: '0 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}>Stop</button>
          ) : (
            <button onClick={runExtract} disabled={!ollamaOnline}
              style={{ height: 24, padding: '0 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: ollamaOnline ? 'pointer' : 'not-allowed', background: ollamaOnline ? 'var(--accent)' : '#1A1A3A', border: 'none', color: ollamaOnline ? '#fff' : '#4A4A65' }}>Extract</button>
          )}
        </div>
        {recommended && !extracting && (
          <div style={{ fontSize: 9, color: '#4A4A65', marginTop: 5 }}>
            Recommended <b style={{ color: 'var(--accent)' }}>{recommended.level}</b> ({recommended.humanSenders} human senders detected)
          </div>
        )}
        {exProgress && (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 3, background: '#252535', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.2s', width: `${exProgress.totalBatches ? (exProgress.batch / exProgress.totalBatches) * 100 : 0}%` }} />
            </div>
            <div style={{ fontSize: 9, color: '#6C6C8A', marginTop: 3 }}>
              {exProgress.phase} · batch {exProgress.batch}/{exProgress.totalBatches}
            </div>
          </div>
        )}
      </div>}

      {/* Note list */}
      {kview === 'list' && <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 8px 12px' }}>
        {loading ? (
          <div style={{ padding: 16, fontSize: 11, color: '#4A4A65' }}>Loading vault…</div>
        ) : grouped.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#4A4A65', lineHeight: 1.6 }}>
              {query ? 'No matching notes.' : 'Your vault is empty. Create your first note with the + button.'}
            </p>
          </div>
        ) : grouped.map(g => (
          <div key={g.cat.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 8px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CategoryIcon cat={g.cat.id} size={11} />{g.cat.label}<span style={{ color: '#2A2A3D' }}>· {g.items.length}</span>
            </div>
            {g.items.map(n => {
              const bl = backlinks[n.title]?.length ?? 0;
              const active = activeFile === n.path;
              return (
                <div key={n.path} onClick={() => openFile(n.path)}
                  title={n.body.replace(/^#.*$/m, '').replace(/[#*`>[\]]/g, '').trim().slice(0, 200)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 5, cursor: 'pointer',
                    background: active ? '#1A1A3A' : 'transparent', borderLeft: `2px solid ${active ? g.cat.color : 'transparent'}` }}
                  className={!active ? 'hover:bg-[#18181F] transition-colors' : ''}>
                  <span style={{ display: 'flex', flexShrink: 0, color: parseLiveConfig(n) ? '#F59E0B' : g.cat.color }}>{parseLiveConfig(n) ? <BoltIcon size={12} /> : <CategoryIcon cat={g.cat.id} size={12} />}</span>
                  <span style={{ fontSize: 12, color: active ? '#E2E2EC' : '#C0C0D0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                  {parseLiveConfig(n) && (
                    <button onClick={e => { e.stopPropagation(); runLive(n); }} disabled={runningLive === n.path} title="Run live note now"
                      style={{ flexShrink: 0, fontSize: 9, color: '#F59E0B', background: '#1A140A', border: '1px solid #F59E0B40', borderRadius: 8, padding: '1px 7px', cursor: 'pointer' }}>
                      {runningLive === n.path ? '…' : 'run'}
                    </button>
                  )}
                  {bl > 0 && (
                    <span title={`${bl} backlink${bl > 1 ? 's' : ''}`}
                      style={{ fontSize: 9, color: 'var(--accent)', background: '#1A1A3A', borderRadius: 8, padding: '1px 6px', flexShrink: 0, fontFamily: '"JetBrains Mono",monospace' }}>
                      ↩ {bl}
                    </span>
                  )}
                  <button onClick={e => { e.stopPropagation(); setHistoryFor(n); }} title="Version history"
                    style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A65', display: 'flex', padding: 0 }}
                    className="hover:!text-[#8888A8]">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7a5 5 0 1 0 1.5-3.5"/><polyline points="2 2 2 4 4 4"/><polyline points="7 4.5 7 7 9 8.5"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ ollamaOnline }: { ollamaOnline: boolean }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 20px' }}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke={ollamaOnline ? 'var(--accent)' : '#4A4A65'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="16" cy="16" r="13"/>
        <path d="M11 12a5 5 0 0 1 10 0c0 3-3 4-5 6"/>
        <circle cx="16" cy="23" r="0.8" fill={ollamaOnline ? 'var(--accent)' : '#4A4A65'}/>
      </svg>
      <p style={{ fontSize: 12, color: '#4A4A65', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
        {ollamaOnline
          ? <>Ask anything about your code,<br/>architecture, or decisions.</>
          : 'Start Ollama to enable AI features.'}
      </p>
      {!ollamaOnline && (
        <code style={{ fontSize: 11, background: '#111118', border: '1px solid #252535', padding: '4px 10px', borderRadius: 4, color: '#8888A8', fontFamily: 'JetBrains Mono,monospace' }}>
          ollama serve
        </code>
      )}
    </div>
  );
}

// ─── Offline banner ───────────────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <div style={{ margin: '0 12px 8px', padding: '7px 10px', borderRadius: 6, background: '#1A120A', border: '1px solid #F59E0B30', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M7 2l5.5 10H1.5z"/><line x1="7" y1="6" x2="7" y2="9"/><circle cx="7" cy="11" r="0.5" fill="#F59E0B"/>
      </svg>
      <span style={{ fontSize: 11, color: '#F59E0B', opacity: 0.8 }}>
        Ollama offline — run <code style={{ fontFamily: 'JetBrains Mono,monospace' }}>ollama serve</code>
      </span>
    </div>
  );
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(workspacePath: string | null, activeFile: string | null): string {
  let p = `You are APEX, an AI coding assistant embedded in a local-first developer workspace.
Help developers write, understand, debug, and improve code.
Be concise and direct. Format code in markdown code blocks with the language specified (e.g. \`\`\`typescript).
When suggesting changes, show the complete updated function or block.`;

  if (workspacePath) {
    const name = workspacePath.split(/[\\/]/).pop() ?? workspacePath;
    p += `\n\nProject: ${name} (${workspacePath})`;
  }
  if (activeFile) {
    const name = activeFile.split(/[\\/]/).pop() ?? activeFile;
    p += `\nActive file: ${name}`;
  }
  return p;
}

// ─── Intel Panel ──────────────────────────────────────────────────────────────

export function IntelPanel() {
  const {
    intelPanelOpen, intelPanelWidth, setIntelPanelWidth,
    intelTab, setIntelTab, toggleIntelPanel,
    ollamaOnline, ollamaModels,
    ollamaSelectedModel, setOllamaSelectedModel,
    workspacePath, activeFile,
    setPendingDiffReview,
    terminalOpen, toggleTerminal,
    selectedAgentId, setSelectedAgentId, userAgents,
    bashAllowAlways, addBashAllowAlways,
    contextInjectionEnabled, embedModel,
    mode,
  } = useAppStore();
  const { info } = useToast();

  const [input, setInput]         = useState('');
  const [messages, setMessages]   = useState<Message[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; path: string } | null>(null);
  const [planMode, setPlanMode]   = useState(false);
  const [toolsMode, setToolsMode] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const pendingEditsRef = useRef<PendingEdit[]>([]);

  // Per-agent conversation threads: the default chat + one thread per agent (tools mode)
  const convKey = toolsMode ? `agent:${selectedAgentId}` : 'default';
  const convStore = useRef<Record<string, Message[]>>({});
  const prevConvKey = useRef(convKey);
  useEffect(() => {
    if (prevConvKey.current !== convKey && !isStreaming) {
      convStore.current[prevConvKey.current] = messages;   // save outgoing thread
      setMessages(convStore.current[convKey] ?? []);         // load incoming thread
      prevConvKey.current = convKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convKey]);

  // Bash approval gating
  const [pendingBash, setPendingBash] = useState<{ command: string } | null>(null);
  const bashResolverRef = useRef<((d: BashDecision) => void) | null>(null);
  const activeBashRunId = useRef<string | null>(null);

  const activeAgent = getAgentById(selectedAgentId, userAgents);
  const allAgents = [...BUILTIN_AGENTS, ...userAgents];

  // Called by the agent before run_bash executes
  const requestBash = useCallback((command: string): Promise<BashDecision> => {
    const prefix = command.trim().split(/\s+/)[0];
    if (bashAllowAlways.some(p => command.startsWith(p) || prefix === p)) {
      return Promise.resolve('once');
    }
    return new Promise<BashDecision>(resolve => {
      bashResolverRef.current = resolve;
      setPendingBash({ command });
    });
  }, [bashAllowAlways]);

  const resolveBash = useCallback((decision: BashDecision) => {
    if (decision === 'always' && pendingBash) {
      addBashAllowAlways(pendingBash.command.trim().split(/\s+/)[0]);
    }
    bashResolverRef.current?.(decision);
    bashResolverRef.current = null;
    setPendingBash(null);
  }, [pendingBash, addBashAllowAlways]);

  const abortRef   = useRef<AbortController | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // @mention autocomplete
  const [mention, setMention] = useState<{ items: MentionItem[]; index: number; start: number; queryLen: number } | null>(null);
  const candidatesRef = useRef<{ rel: string; isDir: boolean }[]>([]);
  const workspaceMdRef = useRef<string>('');
  const projectMemoryRef = useRef<string>('');
  const vaultNotesRef = useRef<VaultNote[]>([]);

  // Load mention candidates + WORKSPACE.md + APEX.md + vault notes when workspace changes
  useEffect(() => {
    if (!workspacePath) { candidatesRef.current = []; workspaceMdRef.current = ''; projectMemoryRef.current = ''; vaultNotesRef.current = []; return; }
    listAllFiles(workspacePath)
      .then(files => { candidatesRef.current = buildCandidates(workspacePath, files); })
      .catch(() => {});
    loadWorkspaceMd(workspacePath)
      .then(md => { if (md) workspaceMdRef.current = md; })
      .catch(() => {});
    loadProjectMemory(workspacePath)
      .then(md => { projectMemoryRef.current = md ?? ''; })
      .catch(() => {});
    listVault(workspacePath)
      .then(notes => { vaultNotesRef.current = notes; })
      .catch(() => {});
  }, [workspacePath]);

  const updateMentionState = (value: string, caret: number) => {
    const upto = value.slice(0, caret);
    const m = upto.match(/@([\w./:-]*)$/);
    if (m && workspacePath) {
      const items = suggestMentions(m[1], candidatesRef.current, vaultNotesRef.current);
      setMention(items.length ? { items, index: 0, start: caret - m[0].length, queryLen: m[1].length } : null);
    } else {
      setMention(null);
    }
  };

  const applyMention = (item: MentionItem) => {
    if (!mention) return;
    const before = input.slice(0, mention.start);
    const after = input.slice(mention.start + 1 + mention.queryLen);
    setInput(`${before}${item.insert} ${after}`);
    setMention(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'instant' : 'smooth' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // ── @file attachment ───────────────────────────────────────────────────────
  const handleAttachFile = () => {
    if (!activeFile) return;
    const name = activeFile.split(/[\\/]/).pop() ?? activeFile;
    setAttachedFile({ name, path: activeFile });
  };

  // ── Send / stream ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || !ollamaOnline) return;

    let userContent = text;

    // Prepend attached file content
    if (attachedFile) {
      try {
        const content = await readFile(attachedFile.path);
        const lang    = getLang(attachedFile.path);
        userContent   = `File \`${attachedFile.name}\`:\n\`\`\`${lang}\n${content}\n\`\`\`\n\n${text}`;
      } catch {
        userContent = `[File \`${attachedFile.name}\` attached — content unavailable in browser preview]\n\n${text}`;
      }
      setAttachedFile(null);
    }

    // Expand @file/@folder/@symbol mentions into context
    if (workspacePath && /@(file|folder|symbol):/.test(userContent)) {
      try {
        const { contextBlock } = await expandMentions(userContent, workspacePath, vaultNotesRef.current);
        if (contextBlock) userContent = userContent + contextBlock;
      } catch { /* expansion best-effort */ }
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };

    // Codebase context injection — semantic search over the local index
    let contextBlock = '';
    let contextSources: SearchResult[] = [];
    if (contextInjectionEnabled && workspacePath) {
      try {
        contextSources = await searchIndex(text, 6, embedModel);
        if (contextSources.length > 0) {
          contextBlock = '\n\nRelevant code from the workspace (retrieved automatically — cite file paths when you use it):\n'
            + contextSources.map(s => {
                const rel = s.filePath.startsWith(workspacePath)
                  ? s.filePath.slice(workspacePath.length).replace(/^[\\/]/, '')
                  : s.filePath;
                return `// ${rel}:${s.startLine}-${s.endLine}\n${s.text}`;
              }).join('\n\n');
        }
      } catch { /* index not built or embeddings unavailable */ }
    }

    const agentForRun = getAgentById(selectedAgentId, userAgents);
    const sysPrompt = (toolsMode
        ? `${agentForRun.systemPrompt}\n\n${buildSystemPrompt(workspacePath, activeFile)}`
        : buildSystemPrompt(workspacePath, activeFile))
      + (planMode
        ? '\n\nPLAN MODE: Respond with a numbered step-by-step plan. Format each step as:\n1. Step title — Brief description of what this step does\n2. ...\nUse at least 3 steps. Be specific and actionable.'
        : '')
      + (projectMemoryRef.current ? `\n\nProject memory (APEX.md — author's instructions, follow these):\n${projectMemoryRef.current.slice(0, 4000)}` : '')
      + (workspaceMdRef.current ? `\n\nWorkspace overview (auto-generated):\n${workspaceMdRef.current.slice(0, 2500)}` : '')
      + contextBlock;

    setInput('');
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true, isPlan: planMode, toolCalls: [], contextSources }]);

    abortRef.current = new AbortController();
    const model = agentForRun.model || ollamaSelectedModel || ollamaModels[0] || 'llama3.2';

    if (researchMode) {
      // ── Deep Research mode: gather → synthesize → report ───────────────
      try {
        const { report, sources } = await runDeepResearch(text, {
          model,
          workspace: workspacePath ?? undefined,
          searxngUrl: useAppStore.getState().searxngUrl,
          signal: abortRef.current.signal,
          onProgress: p => setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: `_Researching — ${p.phase} (${p.step}/${p.total})…_` } : m)),
        });
        const srcLine = sources.length
          ? `\n\n---\n**Sources (${sources.length}):** ` + sources.map(s => `${s.title}`).slice(0, 12).join(' · ')
          : '';
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: report + srcLine } : m));
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name !== 'AbortError') {
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `⚠️ Research failed: ${err.message}` } : m));
        }
      }
    } else if (toolsMode && workspacePath) {
      // ── Tools mode: Vercel AI SDK with tool calling ────────────────────
      pendingEditsRef.current = [];

      const coreMessages: import('ai').CoreMessage[] = [
        { role: 'user' as const, content: `System: ${sysPrompt}\n\n${userContent}` },
        ...messages.slice(-20).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content || '…',
        })),
        { role: 'user' as const, content: userContent },
      ];
      // Remove the first fake-system message if there's history
      const apiMessages: import('ai').CoreMessage[] = messages.length === 0
        ? [{ role: 'user' as const, content: `${sysPrompt}\n\n${userContent}` }]
        : [
            { role: 'user' as const, content: sysPrompt },
            { role: 'assistant' as const, content: 'Understood. How can I help?' },
            ...messages.slice(-16).map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content || '…',
            })),
            { role: 'user' as const, content: userContent },
          ];
      void coreMessages; // suppress unused warning

      try {
        // Gather tools from running MCP servers so the agent can call them (approval-gated)
        const mcpRunningTools = useAppStore.getState().mcpRunningTools;
        const mcpToolRefs = Object.entries(mcpRunningTools).flatMap(([server, tools]) =>
          tools.map(t => ({ server, name: t.name, description: t.description, inputSchema: t.inputSchema as never })));

        const stream = createAgentStream({
          model,
          messages: apiMessages,
          workspacePath,
          tools: agentForRun.tools,
          temperature: agentForRun.temperature,
          signal: abortRef.current.signal,
          onPendingEdit: (edit: PendingEdit) => {
            pendingEditsRef.current.push(edit);
          },
          onRequestBash: requestBash,
          mcpTools: mcpToolRefs,
          searxngUrl: useAppStore.getState().searxngUrl,
          onBashRun: (id) => { activeBashRunId.current = id; },
        });

        for await (const event of stream) {
          if (event.type === 'text-delta') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + event.textDelta } : m
            ));
          } else if (event.type === 'tool-call') {
            const newCall: ToolCallBlock = {
              id: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              status: 'calling',
            };
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, toolCalls: [...(m.toolCalls ?? []), newCall] }
                : m
            ));
          } else if (event.type === 'tool-result') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map(tc =>
                      tc.id === event.toolCallId
                        ? { ...tc, result: String(event.result), status: 'done' as const }
                        : tc
                    ),
                  }
                : m
            ));
          }
        }

        // After stream: show first pending edit in DiffReview
        if (pendingEditsRef.current.length > 0) {
          const first = pendingEditsRef.current[0];
          setPendingDiffReview({ path: first.path, original: first.original, proposed: first.proposed });
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name !== 'AbortError') {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: (m.content || '') + `\n\n⚠️ Tools error: ${err.message}\n\nFallback: try disabling the Tools toggle.` }
              : m
          ));
        }
      }
    } else {
      // ── Standard mode: raw Ollama streaming ────────────────────────────
      const historyForApi: ChatMessage[] = [
        { role: 'system', content: sysPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: userContent },
      ];

      try {
        for await (const token of streamChat(model, historyForApi, abortRef.current.signal)) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + token } : m
          ));
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name !== 'AbortError') {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: (m.content || '') + `\n\n⚠️ ${err.message}` }
              : m
          ));
        }
      }
    }

    setMessages(prev => prev.map(m =>
      m.id === assistantId ? { ...m, streaming: false } : m
    ));
    setStreaming(false);
    abortRef.current = null;
    inputRef.current?.focus();
  }, [input, isStreaming, ollamaOnline, attachedFile, messages, workspacePath, activeFile,
      ollamaSelectedModel, ollamaModels, planMode, toolsMode, researchMode, setPendingDiffReview,
      selectedAgentId, userAgents, requestBash, contextInjectionEnabled, embedModel]);

  const handleStop = () => {
    abortRef.current?.abort();
    // Also terminate any bash command still running (invokes don't honor the abort signal)
    if (activeBashRunId.current) { killBash(activeBashRunId.current); activeBashRunId.current = null; }
  };

  // ── Open diff review for AI code suggestion ───────────────────────────────
  const handleApplyCode = useCallback(async (code: string) => {
    if (!activeFile) return;
    let original = '';
    try { original = await readFile(activeFile); } catch { /* browser mock */ }
    setPendingDiffReview({ path: activeFile, original, proposed: code });
  }, [activeFile, setPendingDiffReview]);

  // ── Run shell command: open terminal + copy to clipboard ──────────────────
  const handleRunCommand = useCallback((cmd: string) => {
    navigator.clipboard.writeText(cmd).catch(() => {});
    if (!terminalOpen) toggleTerminal();
    info('Command copied — paste in terminal (Ctrl+V)');
  }, [terminalOpen, toggleTerminal, info]);

  // ── Drag resize (left edge) ────────────────────────────────────────────────
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = intelPanelWidth;
    document.body.classList.add('resizing');
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(200, Math.min(560, startW - (ev.clientX - startX)));
      setIntelPanelWidth(next);
    };
    const onUp = () => {
      document.body.classList.remove('resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Collapsed: render nothing (placed AFTER all hooks to respect the Rules of Hooks)
  if (!intelPanelOpen) return null;

  return (
    <div
      className="app-intel flex flex-col"
      style={{ background: '#111118', borderLeft: '1px solid #252535', overflow: 'hidden', flexShrink: 0, position: 'relative' }}
    >
      {/* Drag handle */}
      <div className="rh-left" onMouseDown={handleResizeMouseDown} />

      {/* Gradient top line */}
      <div className="grad-line" />

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 4, borderBottom: '1px solid #252535', flexShrink: 0 }}>
        {(['chat', 'knowledge', 'context', 'tasks', 'preview'] as const).map((tab) => (
          <button key={tab}
            onClick={() => setIntelTab(tab)}
            style={{
              height: 26, padding: '0 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              border: intelTab === tab ? '1px solid var(--accent)' : '1px solid transparent',
              background: intelTab === tab ? '#1A1A3A' : 'transparent',
              color: intelTab === tab ? 'var(--accent)' : '#4A4A65',
              textTransform: 'capitalize', whiteSpace: 'nowrap', transition: 'all 0.12s',
            }}
            className={intelTab !== tab ? 'hover:!text-[#8888A8] hover:!bg-[#18181F]' : ''}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        {/* Clear conversation */}
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            style={{ marginLeft: 'auto', color: '#4A4A65', cursor: 'pointer', lineHeight: 1, background: 'none', border: 'none' }}
            className="hover:!text-[#EF4444] transition-colors" title="Clear conversation">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,4 4,14 12,14 13,4"/><line x1="2" y1="4" x2="14" y2="4"/>
              <path d="M6 4V2h4v2"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/>
            </svg>
          </button>
        )}

        <button onClick={toggleIntelPanel}
          style={{ marginLeft: messages.length > 0 ? '4px' : 'auto', color: '#4A4A65', cursor: 'pointer', lineHeight: 1, background: 'none', border: 'none' }}
          className="hover:!text-[#8888A8] transition-colors" title="Collapse panel">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="14" height="14" rx="2"/>
            <line x1="10" y1="1" x2="10" y2="15"/>
          </svg>
        </button>
      </div>

      {/* ── COMMS mode → Email panel (overlays the tab content) ──────────── */}
      {mode === 'COMMS' && (
        <div style={{ position: 'absolute', top: 40, left: 0, right: 0, bottom: 0, background: '#111118', zIndex: 30, display: 'flex', flexDirection: 'column' }}>
          <EmailPanel />
        </div>
      )}

      {/* ── Web Preview tab ──────────────────────────────────────────────── */}
      {intelTab === 'preview' && <WebPreviewPanel />}

      {/* ── Context tab (codebase index) ─────────────────────────────────── */}
      {intelTab === 'context' && <ContextPanel />}

      {/* ── Knowledge tab (markdown vault) ───────────────────────────────── */}
      {intelTab === 'knowledge' && <KnowledgePanel />}

      {/* ── Tasks tab (background jobs) ──────────────────────────────────── */}
      {intelTab === 'tasks' && <BackgroundTasksPanel />}

      {/* ── Chat tab content ─────────────────────────────────────────────── */}
      {intelTab === 'chat' && ollamaOnline && (
        <div style={{ padding: '5px 12px 0', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px #22C55E88', flexShrink: 0 }} />
          {ollamaModels.length > 1 ? (
            <select
              value={ollamaSelectedModel}
              onChange={e => setOllamaSelectedModel(e.target.value)}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: '#4A4A65', fontSize: 10, cursor: 'pointer',
                fontFamily: '"JetBrains Mono",monospace',
              }}
            >
              {ollamaModels.map(m => <option key={m} value={m} style={{ background: '#18181F' }}>{m}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 10, color: '#4A4A65', fontFamily: '"JetBrains Mono",monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ollamaSelectedModel || ollamaModels[0] || 'Ollama'}
            </span>
          )}

          {/* Model Cookbook trigger */}
          <button onClick={() => useAppStore.getState().setCookbookOpen(true)} title="Model Cookbook — recommended models for your hardware"
            style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: toolsMode ? 6 : 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A65', fontSize: 10, padding: 0 }}
            className="hover:!text-[#8888A8]">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2.5" width="10" height="9" rx="1.5"/><line x1="2" y1="5.5" x2="12" y2="5.5"/><circle cx="4.2" cy="4" r="0.4" fill="currentColor"/></svg>
            Cookbook
          </button>

          {/* Blind Compare trigger */}
          <button onClick={() => useAppStore.getState().setCompareOpen(true)} title="Blind model compare"
            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A65', fontSize: 10, padding: 0 }}
            className="hover:!text-[#8888A8]">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="2" x2="7" y2="12"/><rect x="2" y="4" width="3.5" height="6" rx="0.6"/><rect x="8.5" y="4" width="3.5" height="6" rx="0.6"/></svg>
            Compare
          </button>

          {/* Agent selector — only relevant in tools mode */}
          {toolsMode && (
            <div style={{ marginLeft: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'flex', color: activeAgent.color }}><AgentIcon kind={activeAgent.icon} size={12} /></span>
              <select
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
                title={activeAgent.description}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  color: activeAgent.color, fontSize: 10, cursor: 'pointer', fontWeight: 600,
                  fontFamily: '"JetBrains Mono",monospace',
                }}
              >
                {allAgents.map(a => (
                  <option key={a.id} value={a.id} style={{ background: '#18181F', color: '#E2E2EC' }}>
                    {a.name}{a.builtin ? '' : ' (custom)'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ── Messages or empty state ──────────────────────────────────────── */}
      {intelTab === 'chat' && (messages.length === 0 ? (
        <EmptyState ollamaOnline={ollamaOnline} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              activeFile={activeFile}
              onApplyCode={handleApplyCode}
              onRunCommand={handleRunCommand}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      ))}

      {/* ── Input area (chat only) ───────────────────────────────────────── */}
      {intelTab === 'chat' && <div style={{ borderTop: '1px solid #252535', background: '#0F0F16', padding: '10px 12px', flexShrink: 0 }}>
        {/* Offline banner (inline, only when no messages) */}
        {!ollamaOnline && messages.length === 0 && <OfflineBanner />}

        {/* Bash approval gate */}
        {pendingBash && (
          <div style={{ marginBottom: 8, padding: '9px 10px', borderRadius: 6, background: '#15110A', border: '1px solid #F59E0B40' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M7 2l5.5 10H1.5z"/><line x1="7" y1="6" x2="7" y2="9"/><circle cx="7" cy="11" r="0.5" fill="#F59E0B"/>
              </svg>
              <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>Agent wants to run a command</span>
            </div>
            <pre style={{
              margin: '0 0 8px', padding: '6px 8px', borderRadius: 4,
              background: '#090910', border: '1px solid #252535',
              fontSize: 11, fontFamily: '"JetBrains Mono",monospace', color: '#E2E2EC',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 90, overflowY: 'auto',
            }}>
              $ {pendingBash.command}
            </pre>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => resolveBash('once')}
                style={{ flex: 1, height: 26, borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#0A1A0A', border: '1px solid #22C55E40', color: '#22C55E' }}
                className="hover:!bg-[#0D2A0D] transition-colors">
                Allow Once
              </button>
              <button onClick={() => resolveBash('always')}
                style={{ flex: 1, height: 26, borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#0A140A', border: '1px solid #22C55E25', color: '#7FCD8E' }}
                className="hover:!bg-[#0D2A0D] transition-colors"
                title={`Always allow "${pendingBash.command.trim().split(/\s+/)[0]}" commands`}>
                Allow Always
              </button>
              <button onClick={() => resolveBash('deny')}
                style={{ flex: 1, height: 26, borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}
                className="hover:!bg-[#3D1515] transition-colors">
                Deny
              </button>
            </div>
          </div>
        )}

        {/* Attached file badge */}
        {attachedFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', marginBottom: 6, background: '#18181F', border: '1px solid #252535', borderRadius: 4 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
              <path d="M7 1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4z"/><polyline points="7,1 7,4 10,4"/>
            </svg>
            <span style={{ fontSize: 10, color: '#8888A8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"JetBrains Mono",monospace' }}>
              {attachedFile.name}
            </span>
            <button onClick={() => setAttachedFile(null)}
              style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, fontSize: 13, padding: '0 2px' }}
              className="hover:!text-[#EF4444] transition-colors">×</button>
          </div>
        )}

        {/* Textarea */}
        {/* @mention autocomplete dropdown */}
        {mention && mention.items.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 78, left: 12, right: 12, zIndex: 50,
            background: '#15151E', border: '1px solid #2A2A3D', borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
          }}>
            {mention.items.map((it, i) => {
              const showHeader = i === 0 || mention.items[i - 1].group !== it.group;
              return (
                <div key={it.insert}>
                  {showHeader && (
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '5px 10px 2px' }}>{it.group}</div>
                  )}
                  <div
                    onMouseDown={e => { e.preventDefault(); applyMention(it); }}
                    onMouseEnter={() => setMention(mm => mm && ({ ...mm, index: i }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
                      background: i === mention.index ? '#1A1A3A' : 'transparent',
                    }}>
                    <span style={{ display: 'flex', color: it.group === 'Knowledge' ? 'var(--accent)' : '#8888A8' }}><MentionIcon kind={it.kind} size={12} /></span>
                    <span style={{ fontSize: 12, color: '#E2E2EC', fontFamily: it.group === 'Knowledge' ? 'inherit' : '"JetBrains Mono",monospace' }}>{it.label}</span>
                    <span style={{ fontSize: 10, color: '#4A4A65', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{it.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <textarea
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); updateMentionState(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
          onKeyDown={e => {
            if (mention && mention.items.length > 0) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMention(mm => mm && ({ ...mm, index: (mm.index + 1) % mm.items.length })); return; }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setMention(mm => mm && ({ ...mm, index: (mm.index - 1 + mm.items.length) % mm.items.length })); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mention.items[mention.index]); return; }
              if (e.key === 'Escape')    { e.preventDefault(); setMention(null); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={
            !ollamaOnline
              ? 'Start Ollama to enable AI…'
              : isStreaming
              ? 'Generating…'
              : 'Ask APEX anything… (Enter to send, Shift+Enter for newline)'
          }
          rows={2}
          disabled={!ollamaOnline || isStreaming}
          style={{
            width: '100%',
            background: ollamaOnline && !isStreaming ? '#18181F' : '#111118',
            border: `1px solid ${ollamaOnline && !isStreaming ? '#252535' : '#1A1A28'}`,
            borderRadius: 6, padding: '8px 10px', fontSize: 12,
            fontFamily: 'inherit', color: ollamaOnline ? '#E2E2EC' : '#4A4A65',
            resize: 'none', minHeight: 40, outline: 'none', lineHeight: 1.5,
            opacity: !ollamaOnline ? 0.5 : 1,
            cursor: !ollamaOnline || isStreaming ? 'not-allowed' : 'text',
            transition: 'border-color 0.15s',
          }}
          className={ollamaOnline && !isStreaming ? 'focus:!border-[#6366F140]' : ''}
        />

        {/* Actions row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
          {/* Attach current file */}
          <button
            onClick={handleAttachFile}
            disabled={!activeFile || !!attachedFile}
            title={activeFile ? `Attach ${activeFile.split(/[\\/]/).pop()}` : 'Open a file to attach'}
            style={{
              color: activeFile && !attachedFile ? 'var(--accent)' : '#4A4A65',
              background: 'none', border: 'none', cursor: activeFile && !attachedFile ? 'pointer' : 'default',
              padding: 2, lineHeight: 1, opacity: !activeFile || !!attachedFile ? 0.4 : 1,
            }}
            className={activeFile && !attachedFile ? 'hover:!text-[#7C7FFF]' : ''}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 8l-5.5 5.5a4 4 0 0 1-5.657-5.657l6-6a2.5 2.5 0 0 1 3.536 3.536l-6.071 6.07a1 1 0 0 1-1.414-1.414l5.5-5.5"/>
            </svg>
          </button>

          {/* Plan mode toggle */}
          <button
            onClick={() => setPlanMode(p => !p)}
            title={planMode ? 'Plan mode on — click to disable' : 'Plan mode — AI generates a step-by-step plan'}
            style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px',
              borderRadius: 3, border: `1px solid ${planMode ? '#6366F130' : 'transparent'}`,
              background: planMode ? '#1A1A3A' : 'none',
              color: planMode ? 'var(--accent)' : '#4A4A65',
              cursor: 'pointer', fontSize: 10, fontWeight: planMode ? 600 : 400,
              transition: 'all 0.15s',
            }}
            className={!planMode ? 'hover:!text-[#8888A8]' : ''}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="3" x2="10" y2="3"/>
              <line x1="2" y1="6" x2="7" y2="6"/>
              <line x1="2" y1="9" x2="8" y2="9"/>
              <circle cx="10" cy="6" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="10" cy="9" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
            Plan
          </button>

          {/* Deep Research mode toggle */}
          <button
            onClick={() => setResearchMode(r => !r)}
            title={researchMode ? 'Research mode on — gathers web + codebase + vault, writes a cited report' : 'Deep Research — multi-step gather & synthesize'}
            style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px',
              borderRadius: 3, border: `1px solid ${researchMode ? '#7DD3FC30' : 'transparent'}`,
              background: researchMode ? '#0D2329' : 'none',
              color: researchMode ? '#7DD3FC' : '#4A4A65',
              cursor: 'pointer', fontSize: 10, fontWeight: researchMode ? 600 : 400,
              transition: 'all 0.15s',
            }}
            className={!researchMode ? 'hover:!text-[#8888A8]' : ''}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5.5" cy="5.5" r="3.5"/><line x1="8" y1="8" x2="10.5" y2="10.5"/>
            </svg>
            Research
          </button>

          {/* Tools mode toggle */}
          {workspacePath && (
            <button
              onClick={() => setToolsMode(t => !t)}
              title={toolsMode
                ? 'Tools active — AI can read/edit files (requires tool-capable model like qwen2.5-coder)'
                : 'Enable tools — AI can read files, search, and edit code'}
              style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px',
                borderRadius: 3, border: `1px solid ${toolsMode ? '#22C55E30' : 'transparent'}`,
                background: toolsMode ? '#0A1A0A' : 'none',
                color: toolsMode ? '#22C55E' : '#4A4A65',
                cursor: 'pointer', fontSize: 10, fontWeight: toolsMode ? 600 : 400,
                transition: 'all 0.15s',
              }}
              className={!toolsMode ? 'hover:!text-[#8888A8]' : ''}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3L3 9M3.5 3.5L8.5 3.5L8.5 8.5"/>
                <circle cx="3" cy="9" r="1.5"/>
                <circle cx="9" cy="3" r="1.5"/>
              </svg>
              Tools
            </button>
          )}

          {/* Voice (placeholder) */}
          <button style={{ color: '#4A4A65', background: 'none', border: 'none', cursor: 'default', padding: 2, lineHeight: 1, opacity: 0.4 }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5.5" y="1" width="5" height="8" rx="2.5"/><path d="M3 8a5 5 0 0 0 10 0"/><line x1="8" y1="13" x2="8" y2="15"/>
            </svg>
          </button>

          {/* Token / char count */}
          {input.length > 0 && (
            <span style={{ fontSize: 10, color: '#4A4A65', fontVariantNumeric: 'tabular-nums' }}>
              {input.length}
            </span>
          )}

          {/* Stop / Send */}
          {isStreaming ? (
            <button
              onClick={handleStop}
              title="Stop generating"
              style={{
                marginLeft: 'auto', width: 30, height: 30,
                background: '#2D1515', border: '1px solid #EF444440',
                borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
              className="hover:!bg-[#3D1515] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#EF4444">
                <rect x="1" y="1" width="8" height="8" rx="1"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !ollamaOnline}
              title="Send (Enter)"
              style={{
                marginLeft: 'auto', width: 30, height: 30,
                background: input.trim() && ollamaOnline ? 'var(--accent)' : '#1A1A3A',
                borderRadius: 6, border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() && ollamaOnline ? 'pointer' : 'default',
                flexShrink: 0, transition: 'background 0.15s',
              }}
              className={input.trim() && ollamaOnline ? 'hover:!bg-[#7C7FFF]' : ''}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                stroke={input.trim() && ollamaOnline ? 'white' : '#4A4A65'}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="2" x2="2" y2="12"/><polyline points="12,2 12,8 6,2"/>
              </svg>
            </button>
          )}
        </div>
      </div>}
    </div>
  );
}

// ─── Web Preview Panel ────────────────────────────────────────────────────────

const DEV_PORTS = [3000, 3001, 4000, 5173, 8080, 8000, 8888];

function WebPreviewPanel() {
  const [url, setUrl]         = useState('http://localhost:5173');
  const [input, setInput]     = useState('http://localhost:5173');
  const [reloadKey, setReload] = useState(0);

  const navigate = () => {
    let target = input.trim();
    if (!target.startsWith('http')) target = 'http://' + target;
    setUrl(target);
    setInput(target);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* URL bar */}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4, borderBottom: '1px solid #1A1A28', flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') navigate(); }}
          style={{
            flex: 1, height: 26, background: '#0A0A0F', border: '1px solid #252535',
            borderRadius: 4, color: '#E2E2EC', fontSize: 11, padding: '0 8px',
            outline: 'none', fontFamily: '"JetBrains Mono", monospace',
          }}
          className="focus:!border-[#6366F160]"
        />
        <button onClick={navigate}
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1A1A3A', border: '1px solid #6366F140', borderRadius: 4, cursor: 'pointer', color: 'var(--accent)', flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="5" x2="9" y2="5"/><polyline points="6,2 9,5 6,8"/>
          </svg>
        </button>
        <button onClick={() => setReload(k => k + 1)} title="Reload"
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#4A4A65', flexShrink: 0 }}
          className="hover:!text-[#E2E2EC] hover:!bg-[#18181F] transition-colors">
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M11 6.5A4.5 4.5 0 0 1 2 6.5"/><polyline points="2,4 2,6.5 4.5,6.5"/>
          </svg>
        </button>
        <button onClick={() => window.open(url, '_blank')} title="Open in browser"
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#4A4A65', flexShrink: 0 }}
          className="hover:!text-[#E2E2EC] hover:!bg-[#18181F] transition-colors">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7"/>
            <polyline points="8,1 11,1 11,4"/><line x1="5.5" y1="6.5" x2="11" y2="1"/>
          </svg>
        </button>
      </div>

      {/* Quick port buttons */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', flexShrink: 0, flexWrap: 'wrap' }}>
        {DEV_PORTS.map(p => (
          <button key={p} onClick={() => { const u = `http://localhost:${p}`; setUrl(u); setInput(u); }}
            style={{
              height: 20, padding: '0 7px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
              background: url.includes(`:${p}`) ? '#1A1A3A' : 'none',
              border: `1px solid ${url.includes(`:${p}`) ? '#6366F140' : '#252535'}`,
              color: url.includes(`:${p}`) ? 'var(--accent)' : '#4A4A65',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
            :{p}
          </button>
        ))}
      </div>

      {/* iframe */}
      <div style={{ flex: 1, minHeight: 0, background: '#fff' }}>
        <iframe
          key={`${url}-${reloadKey}`}
          src={url}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Web Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
