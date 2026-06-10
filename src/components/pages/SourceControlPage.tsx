import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { GitPanel } from "@/components/layout/GitPanel";
import { gitLog, type GitCommit } from "@/lib/tauri";
import { HunkStaging } from "./HunkStaging";
import { PageShell } from "./PageShell";

const LANE = "#6366F1";

function CommitGraph({ commits }: { commits: GitCommit[] }) {
  if (commits.length === 0) {
    return <div style={{ padding: 20, fontSize: 12, color: "#4A4A65" }}>No commit history.</div>;
  }
  return (
    <div style={{ padding: "6px 0" }}>
      {commits.map((c, i) => {
        const last = i === commits.length - 1;
        return (
          <div key={c.hash + i} style={{ display: "flex", alignItems: "stretch" }} className="hover:bg-[#13131B]">
            {/* Graph lane */}
            <div style={{ width: 30, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
              <div style={{ width: 2, height: 14, background: i === 0 ? "transparent" : LANE, opacity: 0.5 }} />
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#0A0A0F", border: `2px solid ${LANE}`, flexShrink: 0 }} />
              <div style={{ width: 2, flex: 1, background: last ? "transparent" : LANE, opacity: 0.5 }} />
            </div>
            {/* Commit info */}
            <div style={{ flex: 1, minWidth: 0, padding: "8px 12px 8px 4px" }}>
              <div style={{ fontSize: 12.5, color: "#E2E2EC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message}</div>
              <div style={{ fontSize: 11, color: "#6A6A85", marginTop: 2, display: "flex", gap: 8 }}>
                <span>{c.author}</span>
                <span style={{ color: "#4A4A65" }}>·</span>
                <span>{c.date}</span>
                <span style={{ color: "#4A4A65", fontFamily: "JetBrains Mono, monospace" }}>{c.hash.slice(0, 7)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SourceControlPage() {
  const { workspacePath, gitBranch } = useAppStore();
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [tab, setTab] = useState<'changes' | 'history'>('changes');

  useEffect(() => {
    if (!workspacePath) { setCommits([]); return; }
    let cancel = false;
    gitLog(workspacePath, 50).then((c) => { if (!cancel) setCommits(c); }).catch(() => {});
    return () => { cancel = true; };
  }, [workspacePath, gitBranch]);

  if (!workspacePath) {
    return (
      <PageShell title="Source Control" subtitle="Stage, commit, and browse history">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "#4A4A65" }}>
          <svg width="30" height="30" viewBox="0 0 18 18" fill="none" stroke="#3A3A4D" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="14" r="1.5"/><circle cx="13" cy="4" r="1.5"/><line x1="5" y1="5.5" x2="5" y2="12.5"/><path d="M13 5.5v2a4 4 0 0 1-4 4H5"/></svg>
          <div style={{ fontSize: 12 }}>Open a folder to use source control.</div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Source Control" subtitle={`${gitBranch || 'main'} · stage, commit & history`}>
      <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
        {/* Staging / commit */}
        <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid #1A1A28", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <GitPanel />
        </div>
        {/* Changes (hunk staging) / History (graph) */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", gap: 4, padding: "8px 12px 4px", flexShrink: 0, borderBottom: "1px solid #1A1A28" }}>
            {(['changes', 'history'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer", textTransform: "capitalize",
                  background: tab === t ? "#1A1A3A" : "transparent", border: `1px solid ${tab === t ? "#6366F140" : "transparent"}`, color: tab === t ? "#A5B4FC" : "#8888A8" }}>
                {t === 'history' ? `History (${commits.length})` : 'Changes'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {tab === 'changes' ? <HunkStaging workspace={workspacePath} /> : <CommitGraph commits={commits} />}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
