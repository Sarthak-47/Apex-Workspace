import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { hardwareInfo, type HardwareInfo } from "@/lib/tauri";
import { pullModel } from "@/lib/ollama";
import { recommend, FIT_LABEL, type Recommendation } from "@/lib/cookbook";

export function Cookbook() {
  const { cookbookOpen, setCookbookOpen, ollamaModels, ollamaOnline } = useAppStore();
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [pulling, setPulling] = useState<Record<string, { pct: number; status: string }>>({});
  const abort = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    if (!cookbookOpen) return;
    hardwareInfo().then(h => { setHw(h); setRecs(recommend(h)); }).catch(() => setRecs(recommend(null)));
  }, [cookbookOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCookbookOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setCookbookOpen]);

  if (!cookbookOpen) return null;

  const installed = (name: string) => ollamaModels.some(m => m === name || m.startsWith(name.split(':')[0] + ':') && m.includes(name.split(':')[1] ?? ''));

  const pull = async (name: string) => {
    if (!ollamaOnline) return;
    const ac = new AbortController();
    abort.current[name] = ac;
    setPulling(p => ({ ...p, [name]: { pct: 0, status: 'starting' } }));
    try {
      await pullModel(name, (pct, status) => setPulling(p => ({ ...p, [name]: { pct, status } })), ac.signal);
      setPulling(p => { const n = { ...p }; delete n[name]; return n; });
    } catch {
      setPulling(p => ({ ...p, [name]: { pct: -1, status: 'failed' } }));
    }
  };

  const fmtGb = (mb: number | null) => mb ? `${(mb / 1024).toFixed(0)} GB` : '—';

  return (
    <div onMouseDown={() => setCookbookOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div onMouseDown={e => e.stopPropagation()}
        style={{ width: 640, maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: '#111118', border: '1px solid #252535', borderRadius: 14, boxShadow: '0 32px 90px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
        {/* Header + hardware */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1A1A28' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#E2E2EC', flex: 1 }}>Model Cookbook</span>
            <kbd style={{ fontSize: 10, color: '#4A4A65', background: '#18181F', padding: '2px 6px', borderRadius: 3, fontFamily: '"JetBrains Mono",monospace' }}>ESC</kbd>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11 }}>
            {[
              ['GPU', hw?.gpu ?? 'detecting…'],
              ['VRAM', fmtGb(hw?.vram_mb ?? null)],
              ['RAM', fmtGb(hw?.ram_mb ?? null)],
              ['CPU', hw ? `${hw.cores} cores` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 5 }}>
                <span style={{ color: '#4A4A65' }}>{k}</span>
                <span style={{ color: '#C0C0D0' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recs.map(m => {
            const fit = FIT_LABEL[m.fit];
            const inst = installed(m.name);
            const prog = pulling[m.name];
            return (
              <div key={m.name} style={{ background: '#0F0F16', border: '1px solid #1A1A28', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#E2E2EC', fontWeight: 600 }}>{m.label}</span>
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: `${fit.color}1A`, border: `1px solid ${fit.color}40`, color: fit.color }}>{fit.label}</span>
                      <span style={{ fontSize: 9, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.role}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#6C6C8A', marginTop: 2 }}>{m.note}</div>
                    <div style={{ fontSize: 9, color: '#4A4A65', marginTop: 3, fontFamily: '"JetBrains Mono",monospace' }}>
                      {m.params} · {m.quant} · ~{m.vramGb} GB · {m.contextK}K ctx · <span style={{ color: '#6C6C8A' }}>{m.name}</span>
                    </div>
                  </div>
                  {inst ? (
                    <span style={{ fontSize: 11, color: '#22C55E', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 7 6 11 12 3"/></svg>
                      Installed
                    </span>
                  ) : prog ? (
                    <button onClick={() => abort.current[m.name]?.abort()} style={{ fontSize: 10, color: '#EF4444', background: 'none', border: '1px solid #EF444440', borderRadius: 5, padding: '4px 9px', cursor: 'pointer', flexShrink: 0 }}>Cancel</button>
                  ) : (
                    <button onClick={() => pull(m.name)} disabled={!ollamaOnline}
                      style={{ fontSize: 11, fontWeight: 600, color: ollamaOnline ? '#fff' : '#4A4A65', background: ollamaOnline ? '#6366F1' : '#1A1A3A', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: ollamaOnline ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                      Pull
                    </button>
                  )}
                </div>
                {prog && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 4, background: '#252535', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: prog.pct < 0 ? '#EF4444' : '#6366F1', borderRadius: 2, width: `${Math.max(2, prog.pct)}%`, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 9, color: '#6C6C8A', marginTop: 3 }}>{prog.pct < 0 ? 'Pull failed' : `${prog.status} ${prog.pct}%`}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid #1A1A28', fontSize: 10, color: '#4A4A65' }}>
          {ollamaOnline ? 'Pulls run through your local Ollama. VRAM estimates are approximate (Q4 quant).' : 'Start Ollama to pull models.'}
        </div>
      </div>
    </div>
  );
}
