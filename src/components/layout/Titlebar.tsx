import { minimize, toggleMaximize, closeWindow } from "@/lib/tauri";
import { useAppStore } from "@/store";

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

// ─── Workspace name breadcrumb ────────────────────────────────────────────────
function WorkspaceName() {
  const { workspacePath } = useAppStore();
  const name = workspacePath
    ? workspacePath.split(/[\\/]/).filter(Boolean).pop() ?? workspacePath
    : 'no folder';
  return (
    <div className="flex items-center gap-1" style={{ fontSize: 12, color: '#8888A8' }}>
      <span style={{ color: workspacePath ? '#8888A8' : '#4A4A65' }}>{name}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#4A4A65" strokeWidth="1.4">
        <polyline points="2,3.5 5,6.5 8,3.5"/>
      </svg>
    </div>
  );
}

// ─── Titlebar ─────────────────────────────────────────────────────────────────
export function Titlebar() {
  return (
    <div
      className="app-titlebar drag"
      style={{ height:38, background:'#0A0A0F', borderBottom:'1px solid #1A1A28', display:'flex', alignItems:'center', flexShrink:0 }}
    >
      {/* ── LEFT GROUP (flex:1, left-aligned) ── */}
      <div className="no-drag flex items-center gap-2 flex-shrink-0" style={{ flex:1, paddingLeft:12 }}>
        <img src="/apex-logo.svg" width={28} height={28} alt="APEX" style={{ objectFit:'contain', flexShrink:0 }} />
        <span style={{ fontSize:13, fontWeight:700, color:'#E2E2EC', letterSpacing:'0.04em' }}>APEX</span>
        <div style={{ width:1, height:14, background:'#252535', flexShrink:0, margin:'0 4px' }} />
        <WorkspaceName />
      </div>

      {/* ── CENTER — Search bar (always truly centered) ── */}
      <div
        className="no-drag"
        style={{ width:280, height:26, background:'#18181F', border:'1px solid #252535', borderRadius:6, display:'flex', alignItems:'center', padding:'0 9px', gap:6, flexShrink:0 }}
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
        <div className="flex items-center gap-1.5" style={{ fontSize:11, color:'#8888A8', paddingRight:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#4A4A65', flexShrink:0 }} />
          <span>Ollama offline</span>
        </div>
        <div style={{ width:1, height:14, background:'#252535' }} />
        <WindowControls />
      </div>
    </div>
  );
}
