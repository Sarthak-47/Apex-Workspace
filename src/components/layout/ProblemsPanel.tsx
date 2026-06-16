import { useState } from "react";
import { useAppStore } from "@/store";
import { useMarkers } from "@/lib/useMarkers";

function sevKey(severity: number): 'error' | 'warning' | 'info' {
  return severity === 8 ? 'error' : severity === 4 ? 'warning' : 'info';
}

function SeverityIcon({ severity }: { severity: number }) {
  if (severity === 8) {
    // Error
    return (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F14C4C" strokeWidth="1.4" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="5.5" /><line x1="7" y1="4" x2="7" y2="8" /><circle cx="7" cy="10" r="0.5" fill="#F14C4C" />
      </svg>
    );
  }
  if (severity === 4) {
    // Warning
    return (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#CCA700" strokeWidth="1.4" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M7 1.5 13 12H1L7 1.5Z" /><line x1="7" y1="5.5" x2="7" y2="8.5" /><circle cx="7" cy="10.3" r="0.5" fill="#CCA700" />
      </svg>
    );
  }
  // Info / hint
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#3794FF" strokeWidth="1.4" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.5" /><line x1="7" y1="6.5" x2="7" y2="10" /><circle cx="7" cy="4.2" r="0.5" fill="#3794FF" />
    </svg>
  );
}

/** Bottom panel listing Monaco diagnostics for the active file. Click to jump. */
export function ProblemsPanel() {
  const { problemsOpen, setProblemsOpen, activeFile, openFileAt } = useAppStore();
  const { markers, errors, warnings } = useMarkers();
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState({ error: true, warning: true, info: true });

  if (!problemsOpen) return null;

  const fileName = activeFile ? activeFile.split(/[\\/]/).pop() : null;
  const q = query.trim().toLowerCase();
  const sorted = [...markers]
    .filter((m) => enabled[sevKey(m.severity)] && (!q || m.message.toLowerCase().includes(q)))
    .sort((a, b) => b.severity - a.severity || a.startLineNumber - b.startLineNumber);

  const SevToggle = ({ sev, count }: { sev: 'error' | 'warning' | 'info'; count: number }) => (
    <button onClick={() => setEnabled((e) => ({ ...e, [sev]: !e[sev] }))} title={`Toggle ${sev}s`}
      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, background: "none", border: "none", cursor: "pointer", padding: 0, opacity: enabled[sev] ? 1 : 0.4, color: "#9A9AB5" }}>
      <SeverityIcon severity={sev === 'error' ? 8 : sev === 'warning' ? 4 : 2} /> {count}
    </button>
  );

  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 26, height: 220, zIndex: 50, background: "#0B0B12", borderTop: "1px solid #252535", boxShadow: "0 -8px 24px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ height: 30, display: "flex", alignItems: "center", padding: "0 10px", gap: 10, borderBottom: "1px solid #1A1A28", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#C7C7D9", letterSpacing: "0.04em" }}>PROBLEMS</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SevToggle sev="error" count={errors} />
          <SevToggle sev="warning" count={warnings} />
          <SevToggle sev="info" count={markers.filter((m) => sevKey(m.severity) === 'info').length} />
        </span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter problems…"
          style={{ width: 160, height: 22, background: "#13131B", border: "1px solid #252535", borderRadius: 5, padding: "0 8px", fontSize: 11, color: "#E2E2EC", outline: "none" }} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setProblemsOpen(false)} title="Close panel"
          style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "#6A6A85" }}
          className="hover:!text-[#E2E2EC]">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="2" y1="2" x2="9" y2="9" /><line x1="9" y1="2" x2="2" y2="9" /></svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {sorted.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "#4A4A65" }}>
            No problems detected in the open file.
          </div>
        ) : (
          <>
            {fileName && (
              <div style={{ padding: "5px 10px", fontSize: 11, color: "#9A9AB5", display: "flex", alignItems: "center", gap: 6, position: "sticky", top: 0, background: "#0D0D14" }}>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#6A6A85" strokeWidth="1.3"><path d="M4 1h5l3 3v9H2V1Z" /><polyline points="9,1 9,4 12,4" /></svg>
                {fileName}
              </div>
            )}
            {sorted.map((m, i) => (
              <div key={i}
                onClick={() => activeFile && openFileAt(activeFile, m.startLineNumber, m.startColumn)}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 10px 4px 24px", cursor: "pointer", fontSize: 12 }}
                className="hover:bg-[#16161F]">
                <span style={{ marginTop: 1 }}><SeverityIcon severity={m.severity} /></span>
                <span style={{ flex: 1, minWidth: 0, color: "#C7C7D9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.message}
                </span>
                <span style={{ flexShrink: 0, color: "#6A6A85", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>
                  [{m.startLineNumber}:{m.startColumn}]
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
