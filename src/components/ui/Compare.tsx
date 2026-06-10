import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { streamChat } from "@/lib/ollama";

type Side = 'A' | 'B';

export function Compare() {
  const { compareOpen, setCompareOpen, ollamaModels, ollamaOnline, compareWins, addCompareWin } = useAppStore();
  const [modelA, setModelA] = useState('');
  const [modelB, setModelB] = useState('');
  const [prompt, setPrompt] = useState('');
  const [out, setOut] = useState<{ A: string; B: string }>({ A: '', B: '' });
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Randomize which model is on which side so the test is blind
  const swapRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (ollamaModels.length && !modelA) {
      setModelA(ollamaModels[0]);
      setModelB(ollamaModels[1] ?? ollamaModels[0]);
    }
  }, [ollamaModels, modelA]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) setCompareOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setCompareOpen, running]);

  if (!compareOpen) return null;

  const sideModel = (s: Side) => (swapRef.current ? (s === 'A' ? modelB : modelA) : (s === 'A' ? modelA : modelB));

  const run = async () => {
    if (!prompt.trim() || !ollamaOnline) return;
    swapRef.current = Math.random() < 0.5;
    setOut({ A: '', B: '' });
    setRevealed(false);
    setRunning(true);
    abortRef.current = new AbortController();
    const sig = abortRef.current.signal;
    const stream = async (side: Side) => {
      try {
        for await (const tok of streamChat(sideModel(side), [{ role: 'user', content: prompt }], sig)) {
          setOut(o => ({ ...o, [side]: o[side] + tok }));
        }
      } catch { /* aborted / error */ }
    };
    await Promise.all([stream('A'), stream('B')]);
    setRunning(false);
  };

  const pick = (winner: Side | 'tie') => {
    if (winner !== 'tie') addCompareWin(sideModel(winner));
    setRevealed(true);
  };

  const Panel = ({ side }: { side: Side }) => (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#0A0A0F', border: '1px solid #1A1A28', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid #1A1A28', fontSize: 11, fontWeight: 600, color: revealed ? '#8888A8' : 'var(--accent)' }}>
        {revealed ? sideModel(side) : `Model ${side}`}
        {revealed && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#4A4A65' }}>{compareWins[sideModel(side)] ?? 0} wins</span>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, fontSize: 12, color: '#C0C0D0', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 180 }}>
        {out[side] || (running ? '…' : '')}
      </div>
    </div>
  );

  return (
    <div onMouseDown={() => !running && setCompareOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div onMouseDown={e => e.stopPropagation()}
        style={{ width: 720, maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: '#111118', border: '1px solid #252535', borderRadius: 14, boxShadow: '0 32px 90px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
        <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 18px', borderBottom: '1px solid #1A1A28', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#E2E2EC', flex: 1 }}>Blind Model Compare</span>
          <kbd style={{ fontSize: 10, color: '#4A4A65', background: '#18181F', padding: '2px 6px', borderRadius: 3, fontFamily: '"JetBrains Mono",monospace' }}>ESC</kbd>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
          {/* Model pickers */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: '#8888A8' }}>
            <span>Compare</span>
            <select value={modelA} onChange={e => setModelA(e.target.value)} style={selStyle}>{ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
            <span>vs</span>
            <select value={modelB} onChange={e => setModelB(e.target.value)} style={selStyle}>{ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4A4A65' }}>answers are shuffled & anonymized</span>
          </div>

          {/* Prompt */}
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter a prompt to test both models…" disabled={running}
            style={{ height: 56, background: '#18181F', border: '1px solid #252535', borderRadius: 6, color: '#E2E2EC', fontSize: 12, padding: 8, outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />

          {/* Panels */}
          <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
            <Panel side="A" /><Panel side="B" />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {running ? (
              <button onClick={() => abortRef.current?.abort()} style={{ ...btn, background: '#2D1515', border: '1px solid #EF444440', color: '#EF4444' }}>Stop</button>
            ) : (
              <button onClick={run} disabled={!ollamaOnline || !prompt.trim()} style={{ ...btn, background: ollamaOnline && prompt.trim() ? 'var(--accent)' : '#1A1A3A', border: 'none', color: ollamaOnline && prompt.trim() ? '#fff' : '#4A4A65' }}>Run both</button>
            )}
            {out.A && out.B && !running && !revealed && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button onClick={() => pick('A')} style={{ ...btn, background: '#1A1A3A', border: '1px solid #6366F140', color: 'var(--accent)' }}>A is better</button>
                <button onClick={() => pick('tie')} style={{ ...btn, background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>Tie</button>
                <button onClick={() => pick('B')} style={{ ...btn, background: '#1A1A3A', border: '1px solid #6366F140', color: 'var(--accent)' }}>B is better</button>
              </div>
            )}
            {revealed && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#22C55E' }}>Revealed — pick logged</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const selStyle: React.CSSProperties = { height: 24, background: '#18181F', border: '1px solid #252535', borderRadius: 5, color: '#C0C0D0', fontSize: 11, padding: '0 6px', outline: 'none', cursor: 'pointer', maxWidth: 180, fontFamily: '"JetBrains Mono",monospace' };
const btn: React.CSSProperties = { height: 30, padding: '0 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
