import { useCallback, useEffect, useState } from "react";
import { gitStatus, gitDiffFile, gitApplyCached, type GitFileStatus } from "@/lib/tauri";
import { parseDiffHunks, type Hunk } from "@/lib/hunks";

function HunkBody({ lines }: { lines: string[] }) {
  return (
    <pre style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 11, lineHeight: 1.45, overflowX: "auto" }}>
      {lines.map((l, i) => {
        const add = l.startsWith("+") && !l.startsWith("+++");
        const del = l.startsWith("-") && !l.startsWith("---");
        const hdr = l.startsWith("@@");
        return (
          <div key={i} style={{
            padding: "0 10px", whiteSpace: "pre",
            color: hdr ? "#6A6A85" : add ? "#9AE6B4" : del ? "#E2776A" : "#9A9AB5",
            background: hdr ? "transparent" : add ? "#0e1b12" : del ? "#1d1011" : "transparent",
          }}>{l || " "}</div>
        );
      })}
    </pre>
  );
}

function FileHunks({ workspace, file, staged, onChanged }: { workspace: string; file: string; staged: boolean; onChanged: () => void }) {
  const [hunks, setHunks] = useState<Hunk[]>([]);
  const [open, setOpen] = useState(true);

  const load = useCallback(() => {
    gitDiffFile(workspace, file, staged).then((d) => setHunks(parseDiffHunks(d))).catch(() => setHunks([]));
  }, [workspace, file, staged]);
  useEffect(() => { load(); }, [load]);

  const apply = async (h: Hunk) => {
    try { await gitApplyCached(workspace, h.patch, /* reverse = unstage */ staged); onChanged(); }
    catch { /* surfaced by refresh */ }
  };

  if (hunks.length === 0) return null;
  const name = file.split("/").pop() ?? file;

  return (
    <div style={{ border: "1px solid #1A1A28", borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", cursor: "pointer", background: "#13131B" }}>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#6A6A85" strokeWidth="1.4" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.1s" }}><polyline points="3.5,2 6.5,5 3.5,8" /></svg>
        <span style={{ fontSize: 12, color: "#E2E2EC", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file}>{name}</span>
        <span style={{ fontSize: 10, color: "#6A6A85" }}>{hunks.length} hunk{hunks.length === 1 ? "" : "s"}</span>
      </div>
      {open && hunks.map((h) => (
        <div key={h.id} style={{ borderTop: "1px solid #1A1A28" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", background: "#0D0D14" }}>
            <span style={{ fontSize: 10, color: "#6A6A85", flex: 1, fontFamily: "JetBrains Mono, monospace" }}>{h.header}</span>
            <span style={{ fontSize: 10, color: "#9AE6B4" }}>+{h.added}</span>
            <span style={{ fontSize: 10, color: "#E2776A" }}>-{h.removed}</span>
            <button onClick={() => apply(h)}
              style={{ fontSize: 10.5, padding: "2px 9px", borderRadius: 5, cursor: "pointer", background: staged ? "#2D1515" : "#13251A", border: `1px solid ${staged ? "#EF444440" : "#22C55E40"}`, color: staged ? "#E2776A" : "#9AE6B4" }}>
              {staged ? "Unstage hunk" : "Stage hunk"}
            </button>
          </div>
          <HunkBody lines={h.lines} />
        </div>
      ))}
    </div>
  );
}

export function HunkStaging({ workspace }: { workspace: string }) {
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    gitStatus(workspace).then(setFiles).catch(() => setFiles([]));
  }, [workspace, tick]);

  const refresh = () => setTick((t) => t + 1);
  const unstaged = files.filter((f) => f.unstaged !== " " && f.unstaged !== "?");
  const staged = files.filter((f) => f.staged !== " " && f.staged !== "?");

  if (files.length === 0) {
    return <div style={{ padding: 20, fontSize: 12, color: "#4A4A65" }}>No changes — working tree clean.</div>;
  }

  return (
    <div style={{ padding: "10px 14px" }}>
      {staged.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "#22C55E", margin: "2px 0 8px" }}>STAGED</div>
          {staged.map((f) => <FileHunks key={"s" + f.path} workspace={workspace} file={f.path} staged onChanged={refresh} />)}
        </>
      )}
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "#6A6A85", margin: "10px 0 8px" }}>CHANGES</div>
      {unstaged.length === 0 ? <div style={{ fontSize: 11, color: "#4A4A65" }}>Nothing unstaged.</div> :
        unstaged.map((f) => <FileHunks key={"u" + f.path} workspace={workspace} file={f.path} staged={false} onChanged={refresh} />)}
    </div>
  );
}
