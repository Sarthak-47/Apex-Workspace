import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { isTauri, readFile } from "@/lib/tauri";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GitFileStatus {
  path: string;
  staged: string;
  unstaged: string;
}

interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
}

// ─── Git API wrapper ──────────────────────────────────────────────────────────

async function gitInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// ─── Status icon helpers ──────────────────────────────────────────────────────

function statusColor(code: string): string {
  switch (code) {
    case 'M': return '#F59E0B';
    case 'A': return '#22C55E';
    case 'D': return '#EF4444';
    case 'R': return '#06B6D4';
    case 'U': return '#A78BFA';
    case '?': return '#8888A8';
    default:  return '#8888A8';
  }
}

function StatusBadge({ code }: { code: string }) {
  const c = statusColor(code !== ' ' ? code : '');
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: c,
      background: c + '22',
      padding: '1px 4px', borderRadius: 3,
      fontFamily: 'JetBrains Mono, monospace',
      flexShrink: 0,
    }}>
      {code === '?' ? '?' : code}
    </span>
  );
}

// ─── Mock data for browser preview ───────────────────────────────────────────

const MOCK_STATUS: GitFileStatus[] = [
  { path: 'src/components/layout/TerminalPanel.tsx', staged: ' ', unstaged: 'M' },
  { path: 'src/components/layout/GitPanel.tsx',      staged: 'A', unstaged: ' ' },
  { path: 'src/store/index.ts',                      staged: 'M', unstaged: ' ' },
];

const MOCK_LOG: GitCommit[] = [
  { hash: 'e3ac196', short_hash: 'e3ac196', author: 'Sarthak-47', date: '2 minutes ago', message: 'feat: persist open tabs and active file across app restarts' },
  { hash: '1987f61', short_hash: '1987f61', author: 'Sarthak-47', date: '1 hour ago',   message: 'feat: file explorer gaps — New File/Folder, Reveal in Explorer' },
  { hash: 'ec288c1', short_hash: 'ec288c1', author: 'Sarthak-47', date: '2 hours ago',  message: 'feat: editor themes, auto-save, cursor tracking in status bar' },
];

// ─── File row ─────────────────────────────────────────────────────────────────

function FileRow({
  file, workspace, onRefresh,
}: {
  file: GitFileStatus;
  workspace: string;
  onRefresh: () => void;
}) {
  const { addToast, setPendingDiffReview } = useAppStore();
  const isStaged   = file.staged   !== ' ' && file.staged   !== '?';
  const isUnstaged = file.unstaged !== ' ';
  const filename   = file.path.split('/').pop() ?? file.path;
  const dir        = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';

  // Path separator: git always uses /, Rust read_file needs OS path
  const sep = workspace.includes('\\') ? '\\' : '/';
  const absolutePath = `${workspace}${sep}${file.path.replace(/\//g, sep)}`;

  const handleViewDiff = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTauri()) { addToast('Diff viewer requires Tauri mode', 'info'); return; }
    try {
      const [original, current] = await Promise.all([
        gitInvoke<string>('git_file_at_head', { workspace, path: file.path }),
        readFile(absolutePath).catch(() => ''),
      ]);
      setPendingDiffReview({
        path: absolutePath, original, proposed: current,
        mode: 'compare', originalLabel: 'HEAD', modifiedLabel: 'Working Tree',
      });
    } catch (e) { addToast(`Diff failed: ${e}`, 'error'); }
  };

  const handleStage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await gitInvoke('git_stage_file', { workspace, path: file.path });
      onRefresh();
    } catch (e) { addToast(`Stage failed: ${e}`, 'error'); }
  };

  const handleUnstage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await gitInvoke('git_unstage_file', { workspace, path: file.path });
      onRefresh();
    } catch (e) { addToast(`Unstage failed: ${e}`, 'error'); }
  };

  const handleDiscard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await gitInvoke('git_discard_file', { workspace, path: file.path });
      onRefresh();
    } catch (e) { addToast(`Discard failed: ${e}`, 'error'); }
  };

  return (
    <div
      onClick={handleViewDiff}
      style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', gap: 6, flexShrink: 0, cursor: 'pointer' }}
      className="hover:bg-[#18181F] transition-colors group"
      title={`Click to view diff: ${file.path}`}
    >
      {isStaged
        ? <StatusBadge code={file.staged} />
        : <StatusBadge code={file.unstaged !== ' ' ? file.unstaged : '?'} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: '#C0C0D0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {filename}
        </span>
        {dir && <span style={{ fontSize: 10, color: '#4A4A65', marginLeft: 6 }}>{dir}</span>}
      </div>
      {/* Action buttons — show on hover */}
      <div style={{ display: 'flex', gap: 2, opacity: 0 }} className="group-hover:!opacity-100 transition-opacity">
        {!isStaged && (
          <button onClick={handleStage} title="Stage" style={{ ...btnStyle, color: '#22C55E' }}>+</button>
        )}
        {isStaged && (
          <button onClick={handleUnstage} title="Unstage" style={{ ...btnStyle, color: '#F59E0B' }}>−</button>
        )}
        {isUnstaged && (
          <button onClick={handleDiscard} title="Discard changes" style={{ ...btnStyle, color: '#EF4444' }}>↩</button>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3, fontSize: 14, lineHeight: 1,
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, count, expanded, onToggle, action }: {
  label: string; count: number; expanded: boolean;
  onToggle: () => void; action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 24, padding: '0 8px', gap: 4, flexShrink: 0,
      cursor: 'pointer', userSelect: 'none' }}
      onClick={onToggle}
      className="hover:bg-[#18181F] transition-colors">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#4A4A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
        <polyline points="2,1 6,4 2,7"/>
      </svg>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#8888A8', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: '#4A4A65', background: '#1A1A28', padding: '1px 5px', borderRadius: 8 }}>{count}</span>
      {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
    </div>
  );
}

// ─── Commit log ───────────────────────────────────────────────────────────────

function CommitRow({ commit }: { commit: GitCommit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 8px', gap: 8, flexShrink: 0 }}
      className="hover:bg-[#18181F] transition-colors">
      <code style={{ fontSize: 10, color: '#F59E0B', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
        {commit.short_hash}
      </code>
      <span style={{ fontSize: 11, color: '#C0C0D0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {commit.message}
      </span>
      <span style={{ fontSize: 10, color: '#4A4A65', flexShrink: 0 }}>{commit.date}</span>
    </div>
  );
}

// ─── GitPanel ─────────────────────────────────────────────────────────────────

export function GitPanel() {
  const { workspacePath, addToast } = useAppStore();
  const [status, setStatus]         = useState<GitFileStatus[]>([]);
  const [log, setLog]               = useState<GitCommit[]>([]);
  const [loading, setLoading]       = useState(false);
  const [commitMsg, setCommitMsg]   = useState('');
  const [committing, setCommitting] = useState(false);
  const [stagedExp, setStagedExp]   = useState(true);
  const [changesExp, setChangesExp] = useState(true);
  const [historyExp, setHistoryExp] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    if (!workspacePath) return;
    setLoading(true);
    try {
      if (isTauri()) {
        const [s, l] = await Promise.all([
          gitInvoke<GitFileStatus[]>('git_status', { workspace: workspacePath }),
          gitInvoke<GitCommit[]>('git_log', { workspace: workspacePath }),
        ]);
        setStatus(s);
        setLog(l);
      } else {
        setStatus(MOCK_STATUS);
        setLog(MOCK_LOG);
      }
    } catch {
      setStatus(MOCK_STATUS);
      setLog(MOCK_LOG);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { refresh(); }, [refresh]);

  const staged   = status.filter(f => f.staged   !== ' ' && f.staged   !== '?');
  const unstaged = status.filter(f => (f.unstaged !== ' ' || f.staged === '?') && !staged.includes(f));

  const handleStageAll = async () => {
    if (!workspacePath) return;
    try {
      if (isTauri()) await gitInvoke('git_stage_all', { workspace: workspacePath });
      await refresh();
    } catch (e) { addToast(`Stage all failed: ${e}`, 'error'); }
  };

  const handleUnstageAll = async () => {
    if (!workspacePath) return;
    try {
      if (isTauri()) await gitInvoke('git_unstage_all', { workspace: workspacePath });
      await refresh();
    } catch (e) { addToast(`Unstage all failed: ${e}`, 'error'); }
  };

  const handleCommit = async () => {
    if (!commitMsg.trim() || !workspacePath || staged.length === 0) return;
    setCommitting(true);
    try {
      if (isTauri()) {
        await gitInvoke('git_commit', { workspace: workspacePath, message: commitMsg.trim() });
        addToast('Committed successfully', 'success');
        setCommitMsg('');
        await refresh();
      } else {
        addToast('Commit: Tauri mode required', 'info');
      }
    } catch (e) { addToast(`Commit failed: ${e}`, 'error'); }
    setCommitting(false);
  };

  const handlePush = async () => {
    if (!workspacePath) return;
    try {
      if (isTauri()) {
        await gitInvoke('git_push', { workspace: workspacePath });
        addToast('Pushed', 'success');
        await refresh();
      } else { addToast('Push: Tauri mode required', 'info'); }
    } catch (e) { addToast(`Push failed: ${e}`, 'error'); }
  };

  const handlePull = async () => {
    if (!workspacePath) return;
    try {
      if (isTauri()) {
        await gitInvoke('git_pull', { workspace: workspacePath });
        addToast('Pulled', 'success');
        await refresh();
      } else { addToast('Pull: Tauri mode required', 'info'); }
    } catch (e) { addToast(`Pull failed: ${e}`, 'error'); }
  };

  if (!workspacePath) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 16 }}>
        <span style={{ fontSize: 11, color: '#4A4A65', textAlign: 'center' }}>Open a folder to see git status</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 8px 0 10px', flexShrink: 0, borderBottom: '1px solid #1A1A28', gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1 }}>Source Control</span>
        <button onClick={refresh} title="Refresh" disabled={loading}
          style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3, color: '#4A4A65' }}
          className="hover:!text-[#E2E2EC] hover:!bg-white/5 transition-colors">
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }}>
            <path d="M11 6.5A4.5 4.5 0 0 1 2 6.5"/><polyline points="2,4 2,6.5 4.5,6.5"/>
          </svg>
        </button>
        <button onClick={handlePull} title="Pull"
          style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3, color: '#4A4A65' }}
          className="hover:!text-[#E2E2EC] hover:!bg-white/5 transition-colors">
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6.5" y1="2" x2="6.5" y2="10"/><polyline points="3,7 6.5,10.5 10,7"/>
          </svg>
        </button>
        <button onClick={handlePush} title="Push"
          style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3, color: '#4A4A65' }}
          className="hover:!text-[#E2E2EC] hover:!bg-white/5 transition-colors">
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6.5" y1="11" x2="6.5" y2="2"/><polyline points="3,5.5 6.5,2 10,5.5"/>
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* ── Staged changes ──────────────────────────────────────────────── */}
        <SectionHeader
          label="Staged"
          count={staged.length}
          expanded={stagedExp}
          onToggle={() => setStagedExp(s => !s)}
          action={staged.length > 0 ? (
            <button onClick={handleUnstageAll} title="Unstage all"
              style={{ fontSize: 10, color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: 3 }}
              className="hover:!text-[#E2E2EC] transition-colors">−</button>
          ) : undefined}
        />
        {stagedExp && staged.map(f => (
          <FileRow key={f.path} file={f} workspace={workspacePath} onRefresh={refresh} />
        ))}
        {stagedExp && staged.length === 0 && (
          <div style={{ padding: '4px 8px 4px 20px', fontSize: 11, color: '#4A4A65' }}>No staged changes</div>
        )}

        {/* ── Unstaged changes ─────────────────────────────────────────────── */}
        <SectionHeader
          label="Changes"
          count={unstaged.length}
          expanded={changesExp}
          onToggle={() => setChangesExp(s => !s)}
          action={unstaged.length > 0 ? (
            <button onClick={handleStageAll} title="Stage all"
              style={{ fontSize: 10, color: '#4A4A65', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: 3 }}
              className="hover:!text-[#E2E2EC] transition-colors">+</button>
          ) : undefined}
        />
        {changesExp && unstaged.map(f => (
          <FileRow key={f.path} file={f} workspace={workspacePath} onRefresh={refresh} />
        ))}
        {changesExp && unstaged.length === 0 && (
          <div style={{ padding: '4px 8px 4px 20px', fontSize: 11, color: '#4A4A65' }}>No unstaged changes</div>
        )}

        {/* ── Recent commits ───────────────────────────────────────────────── */}
        <SectionHeader
          label="History"
          count={log.length}
          expanded={historyExp}
          onToggle={() => setHistoryExp(s => !s)}
        />
        {historyExp && log.slice(0, 20).map(c => <CommitRow key={c.hash} commit={c} />)}
        {historyExp && log.length === 0 && (
          <div style={{ padding: '4px 8px 4px 20px', fontSize: 11, color: '#4A4A65' }}>No commits yet</div>
        )}
      </div>

      {/* ── Commit area ──────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #1A1A28', padding: '8px', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleCommit(); }}
          placeholder="Commit message (Ctrl+Enter to commit)"
          rows={2}
          style={{
            width: '100%', background: '#0A0A0F', border: '1px solid #252535', borderRadius: 5,
            color: '#E2E2EC', fontSize: 12, padding: '6px 8px', outline: 'none', resize: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
          className="focus:!border-[#6366F160] transition-colors"
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || staged.length === 0 || committing}
            style={{
              height: 28, padding: '0 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
              background: commitMsg.trim() && staged.length > 0 ? '#1A1A3A' : '#111118',
              border: `1px solid ${commitMsg.trim() && staged.length > 0 ? '#6366F160' : '#1A1A28'}`,
              color: commitMsg.trim() && staged.length > 0 ? 'var(--accent)' : '#4A4A65',
              transition: 'all 120ms',
            }}
            className={commitMsg.trim() && staged.length > 0 ? 'hover:!bg-[#252552] hover:!border-[var(--accent)] transition-all' : ''}
          >
            {committing ? 'Committing…' : `Commit ${staged.length > 0 ? `(${staged.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
