import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store";

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageRole = "assistant" | "user";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  code?: string;
  lang?: string;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function Code({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ background: '#090910', border: '1px solid #252535', borderRadius: 6, marginTop: 8, overflow: 'hidden' }}>
      <div style={{ height: 28, background: '#111118', borderBottom: '1px solid #1A1A28', display: 'flex', alignItems: 'center', padding: '0 10px', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '.05em', fontFamily: 'JetBrains Mono,monospace' }}>{lang}</span>
        <button onClick={copy} style={{ fontSize: 11, color: '#4A4A65', cursor: 'pointer', background: 'none', border: 'none' }}
          className="hover:!text-[#E2E2EC] transition-colors">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ padding: '10px', fontSize: 11.5, lineHeight: 1.6, overflowX: 'auto', fontFamily: 'JetBrains Mono,monospace', color: '#8888A8', margin: 0 }}>
        {code}
      </pre>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div style={{
        background: '#1A1A3A', border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '8px 8px 2px 8px', padding: '10px 12px',
        fontSize: 13, color: '#E2E2EC', alignSelf: 'flex-end',
        maxWidth: '88%', lineHeight: 1.5,
      }}>
        {msg.content}
      </div>
    );
  }
  return (
    <div style={{ borderLeft: '2px solid #6366F1', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
      <p style={{ marginBottom: msg.code ? 8 : 0 }}>{msg.content}</p>
      {msg.code && msg.lang && <Code lang={msg.lang} code={msg.code} />}
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
      <p style={{ fontSize: 12, color: '#4A4A65', textAlign: 'center', lineHeight: 1.6 }}>
        {ollamaOnline
          ? 'Ask anything about your code,\narchitecture, or decisions.'
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
    <div style={{
      margin: '0 12px 10px', padding: '7px 10px', borderRadius: 6,
      background: '#1A120A', border: '1px solid #F59E0B30',
      display: 'flex', alignItems: 'center', gap: 7,
    }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M7 2l5.5 10H1.5z"/><line x1="7" y1="6" x2="7" y2="9"/><circle cx="7" cy="11" r="0.5" fill="#F59E0B"/>
      </svg>
      <span style={{ fontSize: 11, color: '#F59E0B', opacity: 0.8 }}>
        Ollama offline — run <code style={{ fontFamily: 'JetBrains Mono,monospace', opacity: 0.9 }}>ollama serve</code>
      </span>
    </div>
  );
}

// ─── Intel Panel ──────────────────────────────────────────────────────────────

export function IntelPanel() {
  const { intelPanelOpen, intelPanelWidth, setIntelPanelWidth, intelTab, setIntelTab, toggleIntelPanel, ollamaOnline, ollamaModels } = useAppStore();

  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!intelPanelOpen) return null;

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    // Day 5: wire up Ollama streaming response here
    // For now, show a placeholder assistant reply
    if (ollamaOnline) {
      setTimeout(() => {
        const model = ollamaModels[0]?.split(':')[0] ?? 'Ollama';
        const reply: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `[${model}] Response coming in Day 5 — Ollama streaming not yet wired up.`,
        };
        setMessages(prev => [...prev, reply]);
      }, 400);
    }
  };

  // ── Drag resize (left edge) ────────────────────────────────────────────────
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = intelPanelWidth;
    document.body.classList.add('resizing');

    const onMove = (ev: MouseEvent) => {
      // Dragging LEFT (negative delta) = wider panel
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

  const modelLabel = ollamaOnline
    ? (ollamaModels[0] ?? 'connected')
    : null;

  return (
    <div
      className="app-intel flex flex-col"
      style={{ background: '#111118', borderLeft: '1px solid #252535', overflow: 'hidden', flexShrink: 0, position: 'relative' }}
    >
      {/* Drag handle — left edge */}
      <div className="rh-left" onMouseDown={handleResizeMouseDown} />

      {/* Animated gradient top line */}
      <div className="grad-line" />

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, borderBottom: '1px solid #252535', flexShrink: 0 }}>
        {(['chat', 'knowledge', 'context'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setIntelTab(tab as 'chat' | 'context' | 'history')}
            style={{
              height: 26, padding: '0 10px', borderRadius: 6,
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              border: intelTab === tab ? '1px solid #6366F1' : '1px solid transparent',
              background: intelTab === tab ? '#1A1A3A' : 'transparent',
              color: intelTab === tab ? '#6366F1' : '#4A4A65',
              textTransform: 'capitalize', whiteSpace: 'nowrap',
              transition: 'all 0.12s',
            }}
            className={intelTab !== tab ? 'hover:!text-[#8888A8] hover:!bg-[#18181F]' : ''}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <button onClick={toggleIntelPanel}
          style={{ marginLeft: 'auto', color: '#4A4A65', cursor: 'pointer', lineHeight: 1, background: 'none', border: 'none' }}
          className="hover:!text-[#8888A8] transition-colors" title="Collapse panel">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="14" height="14" rx="2"/>
            <line x1="10" y1="1" x2="10" y2="15"/>
          </svg>
        </button>
      </div>

      {/* ── Model badge ─────────────────────────────────────────────────── */}
      {modelLabel && (
        <div style={{ padding: '6px 12px 0', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px #22C55E88', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#4A4A65', fontFamily: 'JetBrains Mono,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {modelLabel}
          </span>
        </div>
      )}

      {/* ── Offline banner ───────────────────────────────────────────────── */}
      {!ollamaOnline && messages.length > 0 && <OfflineBanner />}

      {/* ── Messages or empty state ──────────────────────────────────────── */}
      {messages.length === 0 ? (
        <EmptyState ollamaOnline={ollamaOnline} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #252535', background: '#111118', padding: 12, flexShrink: 0 }}>
        {!ollamaOnline && messages.length === 0 && <OfflineBanner />}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={ollamaOnline ? 'Ask APEX anything… (Enter to send)' : 'Start Ollama to enable AI…'}
          rows={2}
          disabled={!ollamaOnline}
          style={{
            width: '100%', background: ollamaOnline ? '#18181F' : '#111118',
            border: `1px solid ${ollamaOnline ? '#252535' : '#1A1A28'}`,
            borderRadius: 6, padding: '9px 11px',
            fontSize: 12, fontFamily: 'inherit',
            color: ollamaOnline ? '#E2E2EC' : '#4A4A65',
            resize: 'none', minHeight: 42, outline: 'none', lineHeight: 1.5,
            opacity: ollamaOnline ? 1 : 0.6,
            cursor: ollamaOnline ? 'text' : 'not-allowed',
          }}
          className="focus:!border-[#6366F140]"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {/* Attach / Image / Voice */}
          {[
            <svg key="at" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="6.5" strokeDasharray="3 2"/></svg>,
            <svg key="img" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><circle cx="5.5" cy="7" r="1.5"/><polyline points="1,13 5,9 8,12 11,9 15,13"/></svg>,
            <svg key="mic" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5.5" y="1" width="5" height="8" rx="2.5"/><path d="M3 8a5 5 0 0 0 10 0"/><line x1="8" y1="13" x2="8" y2="15"/></svg>,
          ].map((icon, i) => (
            <span key={i} style={{ color: '#4A4A65', cursor: 'pointer', lineHeight: 1 }}
              className="hover:!text-[#8888A8] transition-colors">{icon}</span>
          ))}
          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || !ollamaOnline}
            style={{
              marginLeft: 'auto', width: 30, height: 30,
              background: input.trim() && ollamaOnline ? '#6366F1' : '#1A1A3A',
              borderRadius: 6, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && ollamaOnline ? 'pointer' : 'default',
              flexShrink: 0, transition: 'background 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
              stroke={input.trim() && ollamaOnline ? 'white' : '#4A4A65'}
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="2" y2="12"/><polyline points="12,2 12,8 6,2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
