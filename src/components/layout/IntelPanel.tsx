import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore, useToast } from "@/store";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import { readFile } from "@/lib/tauri";
import { getLang } from "@/components/editor/MonacoEditor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  isPlan?: boolean;
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

  // Assistant streaming — show raw text
  if (msg.streaming) {
    const looksLikePlan = hasPlanStructure(msg.content);
    if (looksLikePlan) {
      return <PlanResponse content={msg.content} streaming />;
    }
    return (
      <div style={{ borderLeft: '2px solid #6366F1', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
        <span className="blink" style={{ display: 'inline-block', width: 7, height: 13, background: '#6366F1', verticalAlign: 'text-bottom', marginLeft: 2 }} />
      </div>
    );
  }

  // Completed plan response
  if (msg.isPlan || hasPlanStructure(msg.content)) {
    return <PlanResponse content={msg.content} />;
  }

  const activeLang = activeFile ? normLang(getLang(activeFile)) : null;
  const blocks = parseBlocks(msg.content);

  return (
    <div style={{ borderLeft: '2px solid #6366F1', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
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
  } = useAppStore();
  const { info } = useToast();

  const [input, setInput]         = useState('');
  const [messages, setMessages]   = useState<Message[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; path: string } | null>(null);
  const [planMode, setPlanMode]   = useState(false);

  const abortRef   = useRef<AbortController | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

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

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    // (We show only the display text in the UI; the file content is in the API payload)

    const sysPrompt = buildSystemPrompt(workspacePath, activeFile)
      + (planMode
        ? '\n\nPLAN MODE: Respond with a numbered step-by-step plan. Format each step as:\n1. Step title — Brief description of what this step does\n2. ...\nUse at least 3 steps. Be specific and actionable.'
        : '');

    const historyForApi: ChatMessage[] = [
      { role: 'system', content: sysPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userContent },
    ];

    setInput('');
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true, isPlan: planMode }]);

    abortRef.current = new AbortController();
    const model = ollamaSelectedModel || ollamaModels[0] || 'llama3.2';

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
    } finally {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, isStreaming, ollamaOnline, attachedFile, messages, workspacePath, activeFile, ollamaSelectedModel, ollamaModels]);

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
        {(['chat', 'knowledge', 'context'] as const).map((tab) => (
          <button key={tab}
            onClick={() => setIntelTab(tab as 'chat' | 'context' | 'history')}
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

      {/* ── Model selector ─────────────────────────────────────────────── */}
      {ollamaOnline && (
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
        </div>
      )}

      {/* ── Messages or empty state ──────────────────────────────────────── */}
      {messages.length === 0 ? (
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
      )}

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #252535', background: '#0F0F16', padding: '10px 12px', flexShrink: 0 }}>
        {/* Offline banner (inline, only when no messages) */}
        {!ollamaOnline && messages.length === 0 && <OfflineBanner />}

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
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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
      </div>
    </div>
  );
}
