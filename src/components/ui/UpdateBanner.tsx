import { useEffect, useState } from "react";

const REPO = "Sarthak-47/Apex-Workspace";
const CURRENT = "0.1.0";

function cmpSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/** Checks GitHub releases on startup; shows a dismissible banner if a newer version exists. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { signal: AbortSignal.timeout(4000) })
      .then(r => (r.ok ? r.json() : null))
      .then((rel: { tag_name?: string; html_url?: string } | null) => {
        if (cancelled || !rel?.tag_name) return;
        if (cmpSemver(rel.tag_name, CURRENT) > 0) {
          setUpdate({ version: rel.tag_name.replace(/^v/, ''), url: rel.html_url ?? `https://github.com/${REPO}/releases` });
        }
      })
      .catch(() => { /* offline / no releases — silent */ });
    return () => { cancelled = true; };
  }, []);

  if (!update || dismissed) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 34, right: 14, zIndex: 9998,
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
      background: '#15151E', border: '1px solid #6366F140', borderRadius: 8,
      boxShadow: '0 12px 32px rgba(0,0,0,0.6)', maxWidth: 320,
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M8 11V3"/><polyline points="5 6 8 3 11 6"/><line x1="3" y1="13" x2="13" y2="13"/>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#E2E2EC', fontWeight: 600 }}>Update available — v{update.version}</div>
        <a href={update.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#6366F1', textDecoration: 'none' }}>View release →</a>
      </div>
      <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: '#4A4A65', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}
