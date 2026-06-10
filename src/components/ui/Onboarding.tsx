import { useState } from "react";
import { useAppStore } from "@/store";
import { openFolderDialog } from "@/lib/tauri";

export function Onboarding() {
  const { onboarded, setOnboarded, workspacePath, setWorkspacePath, ollamaOnline, ollamaModels, setSettingsOpen } = useAppStore();
  const [step, setStep] = useState(0);

  if (onboarded) return null;

  const finish = () => setOnboarded(true);
  const next = () => setStep(s => Math.min(s + 1, 3));

  const openFolder = async () => {
    const p = await openFolderDialog();
    if (p) { setWorkspacePath(p); next(); }
  };

  const dot = (active: boolean) => ({
    width: 7, height: 7, borderRadius: '50%',
    background: active ? 'var(--accent)' : '#252535', transition: 'background 150ms',
  });

  const primaryBtn: React.CSSProperties = { height: 34, padding: '0 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' };
  const ghostBtn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' };

  const Status = ({ ok, label }: { ok: boolean; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ok ? '#E2E2EC' : '#8888A8' }}>
      {ok
        ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><polyline points="5 8 7 10 11 6"/></svg>
        : <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#F59E0B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="5" x2="8" y2="8.5"/><circle cx="8" cy="11" r="0.4" fill="#F59E0B"/></svg>}
      {label}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,5,9,0.85)', backdropFilter: 'blur(4px)' }}>
      <div style={{ width: 440, background: '#111118', border: '1px solid #252535', borderRadius: 14, boxShadow: '0 32px 100px rgba(0,0,0,0.85)', overflow: 'hidden' }}>
        <div style={{ padding: '28px 28px 20px', minHeight: 230 }}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
              <img src="/apex-logo.svg" width={56} height={56} alt="APEX" style={{ opacity: 0.95 }} />
              <div style={{ fontSize: 19, fontWeight: 700, color: '#E2E2EC' }}>Welcome to APEX</div>
              <p style={{ fontSize: 13, color: '#8888A8', lineHeight: 1.6, margin: 0 }}>
                A local-first, AI-native workspace. Your code, people, and decisions — all on your machine.
                Let's get you set up in a few steps.
              </p>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#E2E2EC' }}>Open a workspace</div>
              <p style={{ fontSize: 13, color: '#8888A8', lineHeight: 1.6, margin: 0 }}>
                Choose a project folder. APEX indexes it locally so the AI knows your codebase from day one.
              </p>
              <Status ok={!!workspacePath} label={workspacePath ? `Opened: ${workspacePath.split(/[\\/]/).pop()}` : 'No folder opened yet'} />
              <button onClick={openFolder} style={{ ...primaryBtn, alignSelf: 'flex-start', marginTop: 4 }}>Open Folder…</button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#E2E2EC' }}>Local AI (Ollama)</div>
              <p style={{ fontSize: 13, color: '#8888A8', lineHeight: 1.6, margin: 0 }}>
                APEX runs on local models via Ollama — nothing leaves your machine.
              </p>
              <Status ok={ollamaOnline} label={ollamaOnline ? `Ollama online · ${ollamaModels.length} model${ollamaModels.length === 1 ? '' : 's'}` : 'Ollama not detected'} />
              {!ollamaOnline && (
                <code style={{ fontSize: 12, background: '#0A0A0F', border: '1px solid #252535', borderRadius: 6, padding: '8px 12px', color: '#8888A8', fontFamily: '"JetBrains Mono",monospace' }}>
                  ollama serve
                </code>
              )}
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#E2E2EC' }}>Optional: connect your context</div>
              <p style={{ fontSize: 13, color: '#8888A8', lineHeight: 1.6, margin: 0 }}>
                Connect Gmail, Calendar or Fireflies to build a living knowledge graph of your people, projects and decisions. You can do this anytime in Settings.
              </p>
              <button onClick={() => { finish(); setSettingsOpen(true); }} style={{ ...ghostBtn, alignSelf: 'flex-start' }}>Open Connections…</button>
            </div>
          )}
        </div>

        <div style={{ height: 56, borderTop: '1px solid #1A1A28', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {[0, 1, 2, 3].map(i => <span key={i} style={dot(i === step)} />)}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={finish} style={ghostBtn}>Skip</button>
          {step < 3
            ? <button onClick={next} style={primaryBtn}>Next</button>
            : <button onClick={finish} style={primaryBtn}>Get started</button>}
        </div>
      </div>
    </div>
  );
}
