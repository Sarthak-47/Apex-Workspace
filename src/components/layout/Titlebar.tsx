import { minimize, toggleMaximize, closeWindow, openFolderDialog, createWorkspaceFolder, activateWorkspace } from "@/lib/tauri";
import { useAppStore } from "@/store";
import { useEffect, useRef, useState } from "react";

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

// ─── Window Controls ──────────────────────────────────────────────────────────
function WindowControls() {
  return (
    <div className="no-drag flex items-stretch flex-shrink-0">
      <button onClick={() => minimize()}
        style={{ width:46, height:38, display:'flex', alignItems:'center', justifyContent:'center', color:'#4A4A65', fontSize:13, cursor:'pointer' }}
        className="hover:bg-[#18181F] hover:text-[#E2E2EC] transition-colors"
      >–</button>
      <button onClick={() => toggleMaximize()}
        style={{ width:46, height:38, display:'flex', alignItems:'center', justifyContent:'center', color:'#4A4A65', fontSize:13, cursor:'pointer' }}
        className="hover:bg-[#18181F] hover:text-[#E2E2EC] transition-colors"
      >□</button>
      <button onClick={() => closeWindow()}
        style={{ width:46, height:38, display:'flex', alignItems:'center', justifyContent:'center', color:'#4A4A65', fontSize:13, cursor:'pointer' }}
        className="hover:bg-[#C42B1C] hover:text-white transition-colors"
      >×</button>
    </div>
  );
}

// ─── Workspace switcher (VS Code-style) ───────────────────────────────────────
function MenuRow({ icon, label, onClick, sub }: { icon: React.ReactNode; label: string; onClick: () => void; sub?: string }) {
  return (
    <button
      onClick={onClick}
      className="no-drag w-full text-left hover:bg-[#1E1E2E] transition-colors"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#C7C7D9' }}
    >
      <span style={{ flexShrink: 0, display: 'flex', color: '#8888A8' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: '#4A4A65', fontFamily: 'JetBrains Mono, monospace' }}>{sub}</span>}
    </button>
  );
}

function WorkspaceMenu() {
  const { workspacePath, setWorkspacePath, recentWorkspaces, addToast, removeRecentWorkspace, clearRecentWorkspaces, setAppPage } = useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onCloseFolder = () => { setOpen(false); setWorkspacePath(null); setAppPage('welcome'); };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const switchTo = async (path: string) => {
    setOpen(false);
    if (path === workspacePath) return;
    const ok = await activateWorkspace(path);
    if (!ok) { addToast('Could not reopen that folder — open it again.', 'error'); return; }
    setWorkspacePath(path);
    addToast(`Switched to ${baseName(path)}`, 'success');
  };

  const onOpenFolder = async () => {
    setOpen(false);
    const path = await openFolderDialog();
    if (path) { setWorkspacePath(path); addToast(`Opened ${baseName(path)}`, 'success'); }
  };

  const onNewFolder = async () => {
    setOpen(false);
    const path = await createWorkspaceFolder();
    if (path) { setWorkspacePath(path); addToast(`Created ${baseName(path)}`, 'success'); }
  };

  const name = workspacePath ? baseName(workspacePath) : 'Open Folder';
  const recents = recentWorkspaces.filter((p) => p !== workspacePath);

  return (
    <div ref={ref} style={{ position: 'relative' }} className="no-drag">
      <button
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-[#18181F] transition-colors"
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: workspacePath ? '#C7C7D9' : '#8888A8', background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 5 }}
        title="Manage workspace"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M1.5 4.2c0-.6.4-1 1-1h3l1.2 1.3h4.6c.6 0 1 .4 1 1v5.3c0 .6-.4 1-1 1H2.5c-.6 0-1-.4-1-1V4.2Z"/>
        </svg>
        <span>{name}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="2,3.5 5,6.5 8,3.5"/>
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 30, left: 0, zIndex: 9999, width: 280,
            background: '#13131B', border: '1px solid #252535', borderRadius: 8,
            boxShadow: '0 16px 40px rgba(0,0,0,0.6)', overflow: 'hidden', paddingBottom: 4,
          }}
        >
          {workspacePath && (
            <div style={{ padding: '9px 12px', borderBottom: '1px solid #1E1E2E', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, background: 'color-mix(in srgb, var(--accent) 18%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 4.2c0-.6.4-1 1-1h3l1.2 1.3h4.6c.6 0 1 .4 1 1v5.3c0 .6-.4 1-1 1H2.5c-.6 0-1-.4-1-1V4.2Z"/></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#E2E2EC', fontWeight: 600 }}>{baseName(workspacePath)}</div>
                <div style={{ fontSize: 10, color: '#4A4A65', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspacePath}</div>
              </div>
            </div>
          )}

          <div style={{ paddingTop: 4 }}>
            <MenuRow
              onClick={onOpenFolder}
              label="Open Folder…"
              sub="Ctrl+O"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 4c0-.6.4-1 1-1h3l1.2 1.3h4.6c.6 0 1 .4 1 1v5c0 .6-.4 1-1 1H2.5c-.6 0-1-.4-1-1V4Z"/></svg>}
            />
            <MenuRow
              onClick={onNewFolder}
              label="New Folder…"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 4c0-.6.4-1 1-1h3l1.2 1.3h4.6c.6 0 1 .4 1 1v5c0 .6-.4 1-1 1H2.5c-.6 0-1-.4-1-1V4Z"/><line x1="7" y1="6" x2="7" y2="10"/><line x1="5" y1="8" x2="9" y2="8"/></svg>}
            />
            {workspacePath && (
              <MenuRow
                onClick={onCloseFolder}
                label="Close Folder"
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 4c0-.6.4-1 1-1h3l1.2 1.3h4.6c.6 0 1 .4 1 1v5c0 .6-.4 1-1 1H2.5c-.6 0-1-.4-1-1V4Z"/><line x1="5.5" y1="6.5" x2="8.5" y2="9.5"/><line x1="8.5" y1="6.5" x2="5.5" y2="9.5"/></svg>}
              />
            )}
          </div>

          {recents.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', borderTop: '1px solid #1E1E2E', marginTop: 4 }}>
                <span style={{ fontSize: 9, letterSpacing: '0.08em', color: '#4A4A65', flex: 1 }}>RECENT</span>
                <button onClick={() => clearRecentWorkspaces()} className="hover:!text-[#E2776A]" style={{ fontSize: 9, color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {recents.map((p) => (
                  <div key={p} className="no-drag group hover:bg-[#1E1E2E] transition-colors" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 12px', cursor: 'pointer' }}
                    onClick={() => switchTo(p)} title={p}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8888A8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="7" cy="7" r="5.5"/><polyline points="7,4 7,7 9,8.5"/></svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#C7C7D9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{baseName(p)}</div>
                      <div style={{ fontSize: 9.5, color: '#4A4A65', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeRecentWorkspace(p); }} title="Remove from recent"
                      className="group-hover:!opacity-100 hover:!text-[#E2776A]" style={{ opacity: 0, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#4A4A65', padding: 0, display: 'flex' }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="2" y1="2" x2="9" y2="9"/><line x1="9" y1="2" x2="2" y2="9"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ollama live status dot ───────────────────────────────────────────────────
function OllamaStatusDot() {
  const { ollamaOnline, ollamaModels } = useAppStore();
  // Pulse animation triggers once when transitioning to online
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (ollamaOnline) { setPulse(true); setTimeout(() => setPulse(false), 800); }
  }, [ollamaOnline]);

  const label = ollamaOnline
    ? (ollamaModels[0]?.split(':')[0] ?? 'Ollama')
    : 'Ollama offline';

  return (
    <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: ollamaOnline ? '#8888A8' : '#4A4A65', paddingRight: 8, transition: 'color 0.4s' }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: ollamaOnline ? '#22C55E' : '#4A4A65',
        boxShadow: ollamaOnline ? '0 0 6px #22C55E88' : 'none',
        transition: 'all 0.4s',
        transform: pulse ? 'scale(1.4)' : 'scale(1)',
      }} />
      <span>{label}</span>
    </div>
  );
}

// ─── Titlebar ─────────────────────────────────────────────────────────────────
export function Titlebar() {
  const { setCommandPaletteOpen } = useAppStore();
  return (
    <div
      className="app-titlebar drag"
      style={{ height:38, background:'#0A0A0F', borderBottom:'1px solid #1A1A28', display:'flex', alignItems:'center', flexShrink:0 }}
    >
      {/* ── LEFT GROUP (flex:1, left-aligned) ── */}
      <div className="no-drag flex items-center gap-2 flex-shrink-0" style={{ flex:1, paddingLeft:12 }}>
        <button onClick={() => useAppStore.getState().setAppPage('welcome')} title="Welcome"
          className="no-drag flex items-center gap-2" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
          <img src="/apex-logo.svg" width={28} height={28} alt="APEX" style={{ objectFit:'contain', flexShrink:0, mixBlendMode:'lighten' }} />
          <span style={{ fontSize:13, fontWeight:700, color:'#E2E2EC', letterSpacing:'0.04em' }}>APEX</span>
        </button>
        <div style={{ width:1, height:14, background:'#252535', flexShrink:0, margin:'0 4px' }} />
        <WorkspaceMenu />
      </div>

      {/* ── CENTER — Search bar (always truly centered) ── */}
      <div
        className="no-drag"
        onClick={() => setCommandPaletteOpen(true)}
        style={{ width:280, height:26, background:'#18181F', border:'1px solid #252535', borderRadius:6, display:'flex', alignItems:'center', padding:'0 9px', gap:6, flexShrink:0, cursor:'pointer' }}
        title="Search files and commands (Ctrl+K)"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#4A4A65" strokeWidth="1.5">
          <circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/>
        </svg>
        <span style={{ fontSize:12, color:'#4A4A65', flex:1, whiteSpace:'nowrap', overflow:'hidden' }}>
          Search files, commands, knowledge...
        </span>
        <span style={{ background:'#1E1E2E', color:'#4A4A65', fontSize:10, padding:'1px 5px', borderRadius:3, fontFamily:'JetBrains Mono,monospace', flexShrink:0 }}>Ctrl</span>
        <span style={{ background:'#1E1E2E', color:'#4A4A65', fontSize:10, padding:'1px 5px', borderRadius:3, fontFamily:'JetBrains Mono,monospace', flexShrink:0 }}>K</span>
      </div>

      {/* ── RIGHT GROUP (flex:1, right-aligned) ── */}
      <div className="no-drag flex items-center justify-end" style={{ flex:1 }}>
        <OllamaStatusDot />
        <div style={{ width:1, height:14, background:'#252535' }} />
        <WindowControls />
      </div>
    </div>
  );
}
