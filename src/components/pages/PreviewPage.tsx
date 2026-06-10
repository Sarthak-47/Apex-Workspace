import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";

const QUICK_PORTS = [3000, 5173, 8080, 4321, 5000, 8000, 4200, 1420];

/** A dev server is "live" if a no-cors fetch resolves (opaque) rather than rejecting. */
async function isPortLive(port: number, timeoutMs = 1200): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`http://localhost:${port}`, { mode: 'no-cors', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function PreviewPage() {
  const { previewUrl, setPreviewUrl } = useAppStore();
  const [draft, setDraft] = useState(previewUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const [livePorts, setLivePorts] = useState<Set<number>>(new Set());
  const [scanning, setScanning] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    const results = await Promise.all(QUICK_PORTS.map(async (p) => [p, await isPortLive(p)] as const));
    setLivePorts(new Set(results.filter(([, live]) => live).map(([p]) => p)));
    setScanning(false);
  }, []);

  // Auto-detect running dev servers on mount.
  useEffect(() => { scan(); }, [scan]);

  const go = (url: string) => {
    let u = url.trim();
    if (u && !/^https?:\/\//.test(u)) u = 'http://' + u;
    setDraft(u);
    setPreviewUrl(u);
    setReloadKey((k) => k + 1);
  };
  const setPort = (p: number) => go(`http://localhost:${p}`);
  const openExternal = () => { try { window.open(previewUrl, '_blank', 'noopener'); } catch { /* ignore */ } };

  const iconBtn: React.CSSProperties = { width: 30, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: '#13131B', border: '1px solid #252535', color: '#9A9AB5', cursor: 'pointer', flexShrink: 0 };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0A0A0F' }}>
      {/* URL bar */}
      <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px solid #1A1A28' }}>
        <button onClick={() => setReloadKey((k) => k + 1)} title="Reload" style={iconBtn}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7a5 5 0 1 1 1.5 3.5"/><polyline points="2,11 2,7.5 5.5,7.5"/></svg>
        </button>
        <form onSubmit={(e) => { e.preventDefault(); go(draft); }} style={{ flex: 1, display: 'flex' }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false}
            placeholder="http://localhost:3000"
            style={{ flex: 1, height: 28, background: '#13131B', border: '1px solid #252535', borderRadius: 6, padding: '0 10px', fontSize: 12, color: '#E2E2EC', outline: 'none', fontFamily: 'JetBrains Mono, monospace' }} />
        </form>
        <button onClick={openExternal} title="Open in browser" style={iconBtn}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v7A1.5 1.5 0 0 0 3.5 12h7a1.5 1.5 0 0 0 1.5-1.5V8"/><polyline points="9,2 12,2 12,5"/><line x1="6.5" y1="7.5" x2="12" y2="2"/></svg>
        </button>
      </div>

      {/* Quick ports + auto-detect */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderBottom: '1px solid #1A1A28', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: '#6A6A85', marginRight: 2 }}>Ports:</span>
        {QUICK_PORTS.map((p) => {
          const live = livePorts.has(p);
          const active = previewUrl.includes(`:${p}`);
          return (
            <button key={p} onClick={() => setPort(p)} title={live ? 'Dev server detected' : `localhost:${p}`}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '2px 9px', borderRadius: 5, background: active ? '#1A1A3A' : 'transparent', border: `1px solid ${live ? '#22C55E55' : '#252535'}`, color: active ? '#A5B4FC' : (live ? '#9AE6B4' : '#8888A8'), cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' }}>
              {live && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px #22C55E88' }} />}
              {p}
            </button>
          );
        })}
        <button onClick={scan} disabled={scanning} title="Re-scan for dev servers"
          style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 9px', borderRadius: 5, background: 'transparent', border: '1px solid #252535', color: scanning ? '#4A4A65' : '#8888A8', cursor: scanning ? 'default' : 'pointer' }}>
          {scanning ? 'Scanning…' : '⟳ Scan'}
        </button>
      </div>

      {/* Frame */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#fff' }}>
        <iframe
          key={reloadKey}
          ref={frameRef}
          src={previewUrl}
          title="Web Preview"
          style={{ width: '100%', height: '100%', border: 'none' }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
