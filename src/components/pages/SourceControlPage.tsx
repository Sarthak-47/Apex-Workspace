import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { GitPanel } from "@/components/layout/GitPanel";
import { gitLog, gitStashSave, gitStashList, gitStashApply, gitStashPopIndex, gitStashDrop, ghAvailable, ghPrList, ghPrCreate, ghPrCheckout, type GitCommit, type PullRequest } from "@/lib/tauri";
import { HunkStaging } from "./HunkStaging";
import { PageShell } from "./PageShell";

// Strip "stash@{N}: " prefix and "WIP on <branch>: <hash>" noise for a clean label.
function stashLabel(raw: string): string {
  const afterIdx = raw.replace(/^stash@\{\d+\}:\s*/, "");
  return afterIdx.replace(/^(WIP on|On)\s+[^:]+:\s*/, "") || afterIdx;
}

function StashControl({ workspace }: { workspace: string }) {
  const [open, setOpen] = useState(false);
  const [stashes, setStashes] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => gitStashList(workspace).then(setStashes).catch(() => {});
  useEffect(() => { if (open) refresh(); /* eslint-disable-next-line */ }, [open]);

  const wrap = (fn: () => Promise<void>) => async () => { setBusy(true); try { await fn(); } catch { /* noop */ } finally { await refresh(); setBusy(false); } };
  const save  = wrap(async () => { await gitStashSave(workspace, msg.trim()); setMsg(""); });
  const apply = (i: number) => wrap(() => gitStashApply(workspace, i));
  const pop   = (i: number) => wrap(() => gitStashPopIndex(workspace, i));
  const drop  = (i: number) => wrap(() => gitStashDrop(workspace, i));

  const sbtn: React.CSSProperties = { height: 26, padding: '0 11px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', background: '#13131B', border: '1px solid #252535', color: '#9A9AB5' };
  const rowBtn: React.CSSProperties = { height: 20, padding: '0 7px', borderRadius: 4, fontSize: 10, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#9A9AB5' };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={sbtn}>Stashes{stashes.length ? ` (${stashes.length})` : ''} ▾</button>
      {open && (
        <div style={{ position: 'absolute', top: 32, right: 0, zIndex: 50, width: 320, background: '#13131B', border: '1px solid #252535', borderRadius: 8, boxShadow: '0 14px 36px rgba(0,0,0,0.5)', padding: 8 }}>
          {/* Create stash */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Stash message (optional)…"
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              style={{ flex: 1, height: 26, background: '#0E0E15', border: '1px solid #252535', borderRadius: 6, padding: '0 9px', fontSize: 11.5, color: '#E2E2EC', outline: 'none' }} />
            <button onClick={save} disabled={busy} style={{ ...sbtn, color: 'var(--accent)', borderColor: '#6366F140' }}>Stash</button>
          </div>
          <div style={{ fontSize: 10, letterSpacing: '0.06em', color: '#6A6A85', padding: '2px 4px 6px' }}>STASHES</div>
          {stashes.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4A4A65', padding: '4px 4px 6px' }}>No stashes — working tree changes you stash will appear here.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
              {stashes.map((s, i) => (
                <div key={i} title={s} className="group hover:bg-[#1A1A28]" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#8888A8" strokeWidth="1.3" style={{ flexShrink: 0 }}><path d="M2 4.5h8M2 4.5l1-2h6l1 2M2 4.5v4.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.5"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: '#D2D2E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stashLabel(s)}</div>
                    <div style={{ fontSize: 9, color: '#4A4A65', fontFamily: '"JetBrains Mono",monospace' }}>stash@{`{${i}}`}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} className="opacity-60 group-hover:!opacity-100">
                    <button onClick={apply(i)} disabled={busy} title="Apply (keep stash)" style={rowBtn} className="hover:!text-[#22C55E]">Apply</button>
                    <button onClick={pop(i)} disabled={busy} title="Pop (apply & remove)" style={rowBtn} className="hover:!text-[var(--accent)]">Pop</button>
                    <button onClick={drop(i)} disabled={busy} title="Drop (delete stash)" style={rowBtn} className="hover:!text-[#E2776A]">Drop</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LANE = "var(--accent)";

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

function PullRequests({ workspace }: { workspace: string }) {
  const { addToast } = useAppStore();
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [base, setBase] = useState("main");
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setLoading(true);
    ghAvailable(workspace).then((ok) => {
      setAvailable(ok);
      if (!ok) { setLoading(false); return; }
      ghPrList(workspace).then((p) => { setPrs(p); setLoading(false); }).catch(() => { setPrs([]); setLoading(false); });
    });
  };
  useEffect(refresh, [workspace]);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const url = await ghPrCreate(workspace, title.trim(), "", base.trim(), draft);
      addToast(`Created PR: ${url}`, "success");
      setTitle(""); setCreating(false); refresh();
    } catch (e) { addToast(`Could not create PR — ${e}`, "error"); }
    finally { setBusy(false); }
  };

  const checkout = async (n: number) => {
    try { await ghPrCheckout(workspace, n); addToast(`Checked out PR #${n}`, "success"); }
    catch (e) { addToast(`Checkout failed — ${e}`, "error"); }
  };

  if (!available) {
    return (
      <div style={{ padding: "20px", fontSize: 12, color: "#6A6A85", lineHeight: 1.7 }}>
        GitHub CLI not available. Install <code style={{ color: "#9A9AB5" }}>gh</code> and run{" "}
        <code style={{ color: "#9A9AB5" }}>gh auth login</code> to manage pull requests here.
      </div>
    );
  }

  const ibtn: React.CSSProperties = { height: 22, padding: "0 8px", borderRadius: 5, fontSize: 10.5, cursor: "pointer", background: "transparent", border: "1px solid #252535", color: "#9A9AB5" };

  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#6A6A85", flex: 1 }}>OPEN PULL REQUESTS</span>
        <button onClick={() => setCreating((c) => !c)} style={{ ...ibtn, color: "var(--accent)", borderColor: "#6366F140" }}>{creating ? "Cancel" : "+ New PR"}</button>
        <button onClick={refresh} style={ibtn}>Refresh</button>
      </div>

      {creating && (
        <div style={{ background: "#0E0E15", border: "1px solid #252535", borderRadius: 8, padding: 10, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pull request title"
            style={{ height: 30, background: "#13131B", border: "1px solid #252535", borderRadius: 6, padding: "0 10px", fontSize: 12, color: "#E2E2EC", outline: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 11, color: "#8888A8", display: "flex", alignItems: "center", gap: 6 }}>
              Base
              <input value={base} onChange={(e) => setBase(e.target.value)} style={{ width: 90, height: 24, background: "#13131B", border: "1px solid #252535", borderRadius: 5, padding: "0 8px", fontSize: 11, color: "#E2E2EC", outline: "none" }} />
            </label>
            <label style={{ fontSize: 11, color: "#8888A8", display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Draft
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={submit} disabled={busy || !title.trim()}
              style={{ height: 28, padding: "0 14px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: title.trim() ? "pointer" : "default", background: title.trim() ? "var(--accent)" : "#1A1A28", border: "none", color: title.trim() ? "#fff" : "#4A4A65" }}>
              Create
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: "#4A4A65", padding: "12px 2px" }}>Loading pull requests…</div>
      ) : prs.length === 0 ? (
        <div style={{ fontSize: 12, color: "#4A4A65", padding: "12px 2px" }}>No open pull requests.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {prs.map((pr) => (
            <div key={pr.number} className="group hover:bg-[#13131B]" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid #1A1A28" }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={pr.isDraft ? "#8888A8" : "#22C55E"} strokeWidth="1.4" style={{ flexShrink: 0 }}>
                <circle cx="4" cy="4" r="1.8"/><circle cx="4" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><path d="M4 5.8v4.4M12 10.2V8a3 3 0 0 0-3-3H6"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "#E2E2EC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pr.title}
                  {pr.isDraft && <span style={{ marginLeft: 8, fontSize: 9, color: "#8888A8", border: "1px solid #2A2A3A", borderRadius: 7, padding: "0 5px" }}>draft</span>}
                </div>
                <div style={{ fontSize: 10, color: "#5A5A75", fontFamily: '"JetBrains Mono",monospace', marginTop: 1 }}>
                  #{pr.number} · {pr.author.login} · {pr.headRefName} → {pr.baseRefName}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }} className="opacity-60 group-hover:!opacity-100">
                <button onClick={() => checkout(pr.number)} style={ibtn} className="hover:!text-[var(--accent)]" title="Checkout this PR's branch">Checkout</button>
                <a href={pr.url} target="_blank" rel="noreferrer" style={{ ...ibtn, display: "flex", alignItems: "center", textDecoration: "none" }} className="hover:!text-[#E2E2EC]" title="Open on GitHub">Open ↗</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SourceControlPage() {
  const { workspacePath, gitBranch } = useAppStore();
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [tab, setTab] = useState<'changes' | 'history' | 'prs'>('changes');

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
    <PageShell title="Source Control" subtitle={`${gitBranch || 'main'} · stage, commit & history`} actions={<StashControl workspace={workspacePath} />}>
      <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
        {/* Staging / commit */}
        <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid #1A1A28", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <GitPanel />
        </div>
        {/* Changes (hunk staging) / History (graph) */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", gap: 4, padding: "8px 12px 4px", flexShrink: 0, borderBottom: "1px solid #1A1A28" }}>
            {(['changes', 'history', 'prs'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer", textTransform: "capitalize",
                  background: tab === t ? "#1A1A3A" : "transparent", border: `1px solid ${tab === t ? "#6366F140" : "transparent"}`, color: tab === t ? "#A5B4FC" : "#8888A8" }}>
                {t === 'history' ? `History (${commits.length})` : t === 'prs' ? 'Pull Requests' : 'Changes'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {tab === 'changes' ? <HunkStaging workspace={workspacePath} />
              : tab === 'history' ? <CommitGraph commits={commits} />
              : <PullRequests workspace={workspacePath} />}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
