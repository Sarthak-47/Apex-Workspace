import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore, useToast } from "@/store";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import { readFile, listAllFiles } from "@/lib/tauri";
import { suggestMentions, buildCandidates, expandMentions, type MentionItem } from "@/lib/mentions";
import { generateWorkspaceMd, loadWorkspaceMd } from "@/lib/workspace";
import { listVault, createNote, buildBacklinkIndex, CATEGORIES, type VaultNote, type NoteCategory } from "@/lib/vault";
import { extractFromGmail, detectStrictness, type Strictness, type ExtractProgress } from "@/lib/extract";
import { GraphView } from "@/components/knowledge/GraphView";
import { getLang } from "@/components/editor/MonacoEditor";
import { createAgentStream, type ToolCallBlock, type PendingEdit, type BashDecision } from "@/lib/agent";
import { BUILTIN_AGENTS, getAgentById } from "@/lib/agents";
import { searchIndex, indexWorkspace, getStats, clearIndex, type SearchResult, type IndexStats } from "@/lib/codeindex";

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
    <div style={{ borderLeft: '2px solid #6366F1', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
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
                color: isDone ? '#22C55E' : '#6366F1',
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
          {streaming && <span className="blink" style={{ display: 'inline-block', width: 7, height: 13, background: '#6366F1', verticalAlign: 'text-bottom' }} />}
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
            style={{ fontSize: 10, color: applied ? '#22C55E' : '#6366F1', cursor: 'pointer', background: applied ? '#0A1F0A' : '#1A1A3A', border: `1px solid ${applied ? '#22C55E30' : '#6366F130'}`, borderRadius: 3, padding: '2px 7px', fontFamily: 'inherit', transition: 'all 0.15s' }}
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
      <div style={{ borderLeft: '2px solid #6366F1', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
        {hasCalls && msg.toolCalls!.map(tc => <ToolCallView key={tc.id} call={tc} />)}
        {msg.content && (looksLikePlan
          ? <PlanResponse content={msg.content} streaming />
          : <>
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
              <span className="blink" style={{ display: 'inline-block', width: 7, height: 13, background: '#6366F1', verticalAlign: 'text-bottom', marginLeft: 2 }} />
            </>
        )}
        {!msg.content && msg.streaming && !hasCalls && (
          <span className="blink" style={{ display: 'inline-block', width: 7, height: 13, background: '#6366F1', verticalAlign: 'text-bottom' }} />
        )}
      </div>
    );
  }

  // Completed plan response
  if (msg.isPlan || hasPlanStructure(msg.content)) {
    return (
      <div style={{ borderLeft: '2px solid #6366F1', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
        {hasCalls && msg.toolCalls!.map(tc => <ToolCallView key={tc.id} call={tc} />)}
        <PlanResponse content={msg.content} />
      </div>
    );
  }

  const activeLang = activeFile ? normLang(getLang(activeFile)) : null;
  const blocks = parseBlocks(msg.content);

  return (
    <div style={{ borderLeft: '2px solid #6366F1', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
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

const TOOL_ICONS: Record<string, string> = {
  read_file: '📄', list_directory: '📁', search_files: '🔍',
  edit_file: '✏️', write_file: '💾', run_bash: '▶️',
};

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
            border: '2px solid #6366F1', borderTopColor: 'transparent',
            animation: 'spin 0.6s linear infinite',
          }} />
        ) : call.status === 'error' ? (
          <span style={{ fontSize: 10, color: '#EF4444' }}>✕</span>
        ) : (
          <span style={{ fontSize: 10, color: '#22C55E' }}>✓</span>
        )}

        <span style={{ fontSize: 12 }}>{TOOL_ICONS[call.toolName] ?? '🔧'}</span>

        <span style={{ fontSize: 11, color: '#8888A8', fontFamily: '"JetBrains Mono",monospace' }}>
          {call.toolName}
        </span>
        {argSummary && (
          <span style={{
            fontSize: 11, color: '#6366F1',
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
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#6366F1', fontSize: 10, padding: 0 }}>
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
  const indexAbort = useRef<AbortController | null>(null);

  const refresh = useCallback(() => { getStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);

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
            <div style={{ height: '100%', background: '#6366F1', borderRadius: 2, transition: 'width 0.2s', width: `${indexProgress.total ? (indexProgress.done / indexProgress.total) * 100 : 0}%` }} />
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
            style={{ flex: 1, height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: ollamaOnline ? 'pointer' : 'not-allowed', background: ollamaOnline ? '#6366F1' : '#1A1A3A', border: 'none', color: ollamaOnline ? '#fff' : '#4A4A65' }}>
            {stats && stats.chunks > 0 ? 'Re-index' : 'Build Index'}
          </button>
        )}
        <button onClick={wipe}
          style={{ height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>
          Clear
        </button>
      </div>

      {/* Settings */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8888A8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Settings
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#C0C0D0' }}>Inject context into chat</span>
        <button onClick={() => setContextInjectionEnabled(!contextInjectionEnabled)}
          style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', background: contextInjectionEnabled ? '#6366F1' : '#252535', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
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

// ─── Knowledge tab — markdown vault browser ──────────────────────────────────

function KnowledgePanel() {
  const { workspacePath, activeFile, openFile, ollamaOnline, ollamaSelectedModel, ollamaModels } = useAppStore();
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
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
                background: kview === v ? '#1A1A3A' : 'transparent', border: 'none', color: kview === v ? '#6366F1' : '#4A4A65' }}>
              {v === 'list'
                ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="3" x2="11" y2="3"/><line x1="2" y1="6.5" x2="11" y2="6.5"/><line x1="2" y1="10" x2="11" y2="10"/></svg>
                : <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="3" cy="3.5" r="1.8"/><circle cx="10" cy="4" r="1.8"/><circle cx="6" cy="10" r="1.8"/><line x1="3.6" y1="4.8" x2="5.4" y2="8.7"/><line x1="4.6" y1="3.6" x2="8.4" y2="3.9"/><line x1="9.3" y1="5.5" x2="6.6" y2="8.6"/></svg>}
            </button>
          ))}
        </div>
        <button onClick={() => setPicker(p => !p)} title="New note"
          style={{ width: 28, height: 28, borderRadius: 5, cursor: 'pointer', background: '#1A1A3A', border: '1px solid #6366F140', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="6.5" y1="2" x2="6.5" y2="11"/><line x1="2" y1="6.5" x2="11" y2="6.5"/></svg>
        </button>
      </div>

      {/* Category tabs + sort (list view) */}
      {kview === 'list' && (
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 8px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          {(['all', ...CATEGORIES.map(c => c.id)] as const).map(c => (
            <button key={c} onClick={() => setCatFilter(c as NoteCategory | 'all')}
              style={{ height: 20, padding: '0 8px', borderRadius: 10, fontSize: 9, cursor: 'pointer', textTransform: 'capitalize',
                background: catFilter === c ? '#1A1A3A' : 'transparent', border: `1px solid ${catFilter === c ? '#6366F140' : '#252535'}`, color: catFilter === c ? '#6366F1' : '#8888A8' }}>
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
              <button onClick={submitNew} style={{ height: 28, padding: '0 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#6366F1', border: 'none', color: '#fff' }}>Create</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => { setCreating(c.id); setNewName(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 9px', borderRadius: 5, cursor: 'pointer', background: '#18181F', border: '1px solid #252535', color: c.color }}>
                  <span>{c.icon}</span>{c.label}
                </button>
              ))}
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
              style={{ height: 24, padding: '0 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: ollamaOnline ? 'pointer' : 'not-allowed', background: ollamaOnline ? '#6366F1' : '#1A1A3A', border: 'none', color: ollamaOnline ? '#fff' : '#4A4A65' }}>Extract</button>
          )}
        </div>
        {recommended && !extracting && (
          <div style={{ fontSize: 9, color: '#4A4A65', marginTop: 5 }}>
            Recommended <b style={{ color: '#6366F1' }}>{recommended.level}</b> ({recommended.humanSenders} human senders detected)
          </div>
        )}
        {exProgress && (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 3, background: '#252535', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#6366F1', borderRadius: 2, transition: 'width 0.2s', width: `${exProgress.totalBatches ? (exProgress.batch / exProgress.totalBatches) * 100 : 0}%` }} />
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
              <span>{g.cat.icon}</span>{g.cat.label}<span style={{ color: '#2A2A3D' }}>· {g.items.length}</span>
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
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{g.cat.icon}</span>
                  <span style={{ fontSize: 12, color: active ? '#E2E2EC' : '#C0C0D0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                  {bl > 0 && (
                    <span title={`${bl} backlink${bl > 1 ? 's' : ''}`}
                      style={{ fontSize: 9, color: '#6366F1', background: '#1A1A3A', borderRadius: 8, padding: '1px 6px', flexShrink: 0, fontFamily: '"JetBrains Mono",monospace' }}>
                      ↩ {bl}
                    </span>
                  )}
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
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke={ollamaOnline ? '#6366F1' : '#4A4A65'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="16" cy="16" r="13"/>
        <path d="M11 12a5 5 0 0 1 10 0c0 3-3 4-5 6"/>
        <circle cx="16" cy="23" r="0.8" fill={ollamaOnline ? '#6366F1' : '#4A4A65'}/>
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
  } = useAppStore();
  const { info } = useToast();

  const [input, setInput]         = useState('');
  const [messages, setMessages]   = useState<Message[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; path: string } | null>(null);
  const [planMode, setPlanMode]   = useState(false);
  const [toolsMode, setToolsMode] = useState(false);
  const pendingEditsRef = useRef<PendingEdit[]>([]);

  // Bash approval gating
  const [pendingBash, setPendingBash] = useState<{ command: string } | null>(null);
  const bashResolverRef = useRef<((d: BashDecision) => void) | null>(null);

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
  const vaultNotesRef = useRef<VaultNote[]>([]);

  // Load mention candidates + WORKSPACE.md + vault notes when workspace changes
  useEffect(() => {
    if (!workspacePath) { candidatesRef.current = []; workspaceMdRef.current = ''; vaultNotesRef.current = []; return; }
    listAllFiles(workspacePath)
      .then(files => { candidatesRef.current = buildCandidates(workspacePath, files); })
      .catch(() => {});
    loadWorkspaceMd(workspacePath)
      .then(md => { if (md) workspaceMdRef.current = md; })
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

  if (!intelPanelOpen) return null;

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
      + (workspaceMdRef.current ? `\n\nWorkspace overview (auto-generated):\n${workspaceMdRef.current.slice(0, 2500)}` : '')
      + contextBlock;

    setInput('');
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true, isPlan: planMode, toolCalls: [], contextSources }]);

    abortRef.current = new AbortController();
    const model = agentForRun.model || ollamaSelectedModel || ollamaModels[0] || 'llama3.2';

    if (toolsMode && workspacePath) {
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
      ollamaSelectedModel, ollamaModels, planMode, toolsMode, setPendingDiffReview,
      selectedAgentId, userAgents, requestBash, contextInjectionEnabled, embedModel]);

  const handleStop = () => {
    abortRef.current?.abort();
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
        {(['chat', 'knowledge', 'context', 'preview'] as const).map((tab) => (
          <button key={tab}
            onClick={() => setIntelTab(tab)}
            style={{
              height: 26, padding: '0 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              border: intelTab === tab ? '1px solid #6366F1' : '1px solid transparent',
              background: intelTab === tab ? '#1A1A3A' : 'transparent',
              color: intelTab === tab ? '#6366F1' : '#4A4A65',
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

      {/* ── Web Preview tab ──────────────────────────────────────────────── */}
      {intelTab === 'preview' && <WebPreviewPanel />}

      {/* ── Context tab (codebase index) ─────────────────────────────────── */}
      {intelTab === 'context' && <ContextPanel />}

      {/* ── Knowledge tab (markdown vault) ───────────────────────────────── */}
      {intelTab === 'knowledge' && <KnowledgePanel />}

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

          {/* Agent selector — only relevant in tools mode */}
          {toolsMode && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11 }}>{activeAgent.icon}</span>
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
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#6366F1" strokeWidth="1.5" style={{ flexShrink: 0 }}>
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
              const ICON: Record<string, string> = { folder: '📁', symbol: '🔣', file: '📄', person: '👤', project: '📦', decision: '⚖️', meeting: '📅' };
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
                    <span style={{ fontSize: 12 }}>{ICON[it.kind] ?? '📄'}</span>
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
              color: activeFile && !attachedFile ? '#6366F1' : '#4A4A65',
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
              color: planMode ? '#6366F1' : '#4A4A65',
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
                background: input.trim() && ollamaOnline ? '#6366F1' : '#1A1A3A',
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
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1A1A3A', border: '1px solid #6366F140', borderRadius: 4, cursor: 'pointer', color: '#6366F1', flexShrink: 0 }}>
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
              color: url.includes(`:${p}`) ? '#6366F1' : '#4A4A65',
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
