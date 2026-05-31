import { useState } from "react";
import { useAppStore } from "@/store";

type MessageRole = "assistant" | "user";
interface Message { role: MessageRole; content: string; code?: string; lang?: string; }

const INITIAL: Message[] = [
  {
    role: "user",
    content: "add error handling to the handleSort callback",
  },
  {
    role: "assistant",
    content: "I'll wrap it in a try/catch and pipe failures through handleError so they surface cleanly.",
    code: `const handleSort = useCallback((
  key: string
) => {
  try {
    setSort(prev =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  } catch (e) { handleError(e as Error, 'sort'); }
}, [handleError]);`,
    lang: "typescript",
  },
];

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (msg.code) {
      navigator.clipboard.writeText(msg.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (msg.role === "user") {
    return (
      <div style={{
        background: '#1A1A3A',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '8px 8px 2px 8px',
        padding: '10px 12px',
        fontSize: 13,
        color: '#E2E2EC',
        alignSelf: 'flex-end',
        maxWidth: '88%',
        lineHeight: 1.5,
      }}>
        {msg.content.includes('handleSort') ? (
          <>add error handling to the{' '}
            <span style={{ background: '#18181F', padding: '1px 6px', borderRadius: 3, color: '#6366F1', fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }}>handleSort</span>
            {' '}callback
          </>
        ) : msg.content}
      </div>
    );
  }

  return (
    <div style={{ borderLeft: '2px solid #6366F1', paddingLeft: 12, fontSize: 13, color: '#E2E2EC', lineHeight: 1.6 }}>
      <p style={{ marginBottom: msg.code ? 8 : 0 }}>
        I'll wrap it in a{' '}
        <span style={{ background: '#18181F', padding: '1px 6px', borderRadius: 3, color: '#6366F1', fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }}>try/catch</span>
        {' '}and pipe failures through{' '}
        <span style={{ background: '#18181F', padding: '1px 6px', borderRadius: 3, color: '#6366F1', fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }}>handleError</span>
        {' '}so they surface cleanly.
      </p>
      {msg.code && (
        <div style={{ background: '#090910', border: '1px solid #252535', borderRadius: 6, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ height: 28, background: '#111118', borderBottom: '1px solid #1A1A28', display: 'flex', alignItems: 'center', padding: '0 10px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '.05em', fontFamily: 'JetBrains Mono,monospace' }}>{msg.lang}</span>
            <button onClick={copy} style={{ fontSize: 12, color: '#4A4A65', cursor: 'pointer' }}
              className="hover:!text-[#E2E2EC] transition-colors">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre style={{ padding: '10px', fontSize: 11.5, lineHeight: 1.6, overflowX: 'auto', fontFamily: 'JetBrains Mono,monospace', color: '#8888A8' }}>
            {msg.code}
          </pre>
        </div>
      )}
      {/* Thinking indicator */}
      <div style={{ background: '#18181F', border: '1px solid #252535', borderRadius: 6, marginTop: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#4A4A65', fontFamily: 'JetBrains Mono,monospace', flex: 1 }}>Reading DataTable.tsx…</span>
        <span className="blink" />
      </div>
    </div>
  );
}

// ─── Intel Panel ─────────────────────────────────────────────────────────────
export function IntelPanel() {
  const { intelPanelOpen, intelTab, setIntelTab, toggleIntelPanel } = useAppStore();
  const [input, setInput] = useState("");
  const [messages] = useState<Message[]>(INITIAL);

  if (!intelPanelOpen) return null;

  return (
    <div
      className="app-intel flex flex-col"
      style={{ width: 300, background: '#111118', borderLeft: '1px solid #252535', overflow: 'hidden', flexShrink: 0 }}
    >
      {/* Animated gradient top line */}
      <div className="grad-line" />

      {/* Tabs */}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, borderBottom: '1px solid #252535', flexShrink: 0 }}>
        {(['chat', 'knowledge', 'context'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setIntelTab(tab as 'chat' | 'context' | 'history')}
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              border: intelTab === tab || (tab === 'chat' && intelTab === 'chat')
                ? '1px solid #6366F1'
                : '1px solid transparent',
              background: intelTab === tab ? '#1A1A3A' : 'transparent',
              color: intelTab === tab ? '#6366F1' : '#4A4A65',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
              transition: 'all 0.12s',
            }}
            className={intelTab !== tab ? 'hover:!text-[#8888A8] hover:!bg-[#18181F]' : ''}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        {/* Collapse */}
        <button
          onClick={toggleIntelPanel}
          style={{ marginLeft: 'auto', color: '#4A4A65', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          className="hover:!text-[#8888A8] transition-colors"
          title="Collapse panel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="14" height="14" rx="2"/>
            <line x1="10" y1="1" x2="10" y2="15"/>
          </svg>
        </button>
      </div>

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid #252535', background: '#111118', padding: 14, flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setInput(''); } }}
          placeholder="Ask APEX anything..."
          rows={2}
          style={{
            width: '100%',
            background: '#18181F',
            border: '1px solid #252535',
            borderRadius: 6,
            padding: '9px 11px',
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#E2E2EC',
            resize: 'none',
            minHeight: 42,
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {/* Action icons */}
          {[
            <svg key="at" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="6.5" strokeDasharray="3 2"/></svg>,
            <svg key="img" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><circle cx="5.5" cy="7" r="1.5"/><polyline points="1,13 5,9 8,12 11,9 15,13"/></svg>,
            <svg key="mic" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5.5" y="1" width="5" height="8" rx="2.5"/><path d="M3 8a5 5 0 0 0 10 0"/><line x1="8" y1="13" x2="8" y2="15"/></svg>,
          ].map((icon, i) => (
            <span key={i} style={{ color: '#4A4A65', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
              className="hover:!text-[#8888A8] transition-colors">{icon}</span>
          ))}
          {/* Send */}
          <button
            style={{
              marginLeft: 'auto',
              width: 30, height: 30,
              background: input.trim() ? '#6366F1' : '#1A1A3A',
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() ? 'pointer' : 'default',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={input.trim() ? 'white' : '#4A4A65'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="2" y2="12"/><polyline points="12,2 12,8 6,2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
