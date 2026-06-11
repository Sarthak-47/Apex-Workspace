import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { discoverTests, buildRunCommand, buildRunAllCommand, type TestFile, type Framework } from "@/lib/tests";

const FW_COLOR: Record<Framework, string> = {
  vitest: "#FCC72B", jest: "#C2185B", pytest: "#3776AB", go: "#00ADD8", cargo: "#F97316",
};

function RunIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7-4.5z" /></svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#6A6A85" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>
      <polyline points="3.5,2 6.5,5 3.5,8" />
    </svg>
  );
}

export function TestExplorer() {
  const { workspacePath, runInTerminal, openFileAt, addToast } = useAppStore();
  const root = workspacePath ?? "/demo-workspace";
  const [files, setFiles] = useState<TestFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setLoading(true);
    discoverTests(root).then((f) => { setFiles(f); setLoading(false); }).catch(() => { setFiles([]); setLoading(false); });
  }, [root]);

  useEffect(() => { refresh(); }, [refresh]);

  const total = useMemo(() => files.reduce((n, f) => n + f.tests.length, 0), [files]);
  const frameworks = useMemo(() => Array.from(new Set(files.map((f) => f.framework))), [files]);

  const runFile = (f: TestFile) => { runInTerminal(buildRunCommand(root, f)); addToast(`Running ${f.name}`, "info"); };
  const runTest = (f: TestFile, name: string) => { runInTerminal(buildRunCommand(root, f, name)); addToast(`Running ${name}`, "info"); };
  const runAll = () => {
    if (frameworks.length === 0) return;
    for (const fw of frameworks) runInTerminal(buildRunAllCommand(fw));
    addToast("Running all tests", "info");
  };
  const toggle = (path: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* Header */}
      <div style={{ height: 35, display: "flex", alignItems: "center", padding: "0 8px 0 12px", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#8888A8", flex: 1 }}>TESTING</span>
        <button onClick={runAll} title="Run All Tests" disabled={total === 0}
          style={{ color: total === 0 ? "#33333F" : "#22C55E", background: "none", border: "none", cursor: total === 0 ? "default" : "pointer", padding: 3, borderRadius: 3, display: "flex" }}
          className={total === 0 ? "" : "hover:bg-white/5"}>
          <RunIcon size={12} />
        </button>
        <button onClick={refresh} title="Refresh Tests"
          style={{ color: "#4A4A65", background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 3, display: "flex" }}
          className="hover:!text-[#E2E2EC] hover:bg-white/5 transition-colors">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M11 6.5A4.5 4.5 0 0 1 2 6.5" /><polyline points="2,4 2,6.5 4.5,6.5" /></svg>
        </button>
      </div>

      {/* Summary */}
      {!loading && total > 0 && (
        <div style={{ padding: "0 12px 6px", fontSize: 10.5, color: "#5A5A75", display: "flex", alignItems: "center", gap: 8 }}>
          <span>{total} test{total === 1 ? "" : "s"} · {files.length} file{files.length === 1 ? "" : "s"}</span>
          <span style={{ display: "flex", gap: 4 }}>
            {frameworks.map((fw) => (
              <span key={fw} style={{ fontSize: 9, color: FW_COLOR[fw], border: `1px solid ${FW_COLOR[fw]}40`, borderRadius: 8, padding: "0 6px" }}>{fw}</span>
            ))}
          </span>
        </div>
      )}

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "#4A4A65" }}>Discovering tests…</div>
        ) : total === 0 ? (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "#4A4A65", lineHeight: 1.6 }}>
            No tests found.<br />
            <span style={{ fontSize: 11 }}>Add <code style={{ color: "#8888A8" }}>*.test.ts</code>, <code style={{ color: "#8888A8" }}>test_*.py</code>, <code style={{ color: "#8888A8" }}>*_test.go</code> or <code style={{ color: "#8888A8" }}>#[test]</code> files.</span>
          </div>
        ) : (
          files.map((f) => {
            const isCollapsed = collapsed.has(f.path);
            return (
              <div key={f.path}>
                {/* File row */}
                <div onClick={() => toggle(f.path)}
                  style={{ height: 24, display: "flex", alignItems: "center", gap: 5, padding: "0 8px 0 10px", cursor: "pointer" }}
                  className="group hover:bg-[#18181F]">
                  <Chevron open={!isCollapsed} />
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={FW_COLOR[f.framework]} strokeWidth="1.3" style={{ flexShrink: 0 }}>
                    <path d="M2.5 2h7M6 2v6M3.5 8.5l2.5 2 2.5-2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontSize: 12, color: "#C7C7D9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{baseName(f.path)}</span>
                  <span style={{ fontSize: 9.5, color: "#4A4A65", flexShrink: 0 }}>{f.tests.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); runFile(f); }} title="Run file"
                    className="opacity-0 group-hover:!opacity-100 hover:!text-[#22C55E]"
                    style={{ color: "#6A6A85", background: "none", border: "none", cursor: "pointer", padding: "2px 3px", display: "flex", flexShrink: 0 }}>
                    <RunIcon />
                  </button>
                </div>
                {/* Test rows */}
                {!isCollapsed && f.tests.map((t) => (
                  <div key={t.name + t.line} onClick={() => openFileAt(f.path, t.line, 1)}
                    style={{ height: 22, display: "flex", alignItems: "center", gap: 6, padding: "0 8px 0 32px", cursor: "pointer" }}
                    className="group hover:bg-[#18181F]" title={`${t.name} (line ${t.line})`}>
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#5A5A75" strokeWidth="1.4" style={{ flexShrink: 0 }}><circle cx="5" cy="5" r="3.5" /></svg>
                    <span style={{ fontSize: 11.5, color: "#9A9AB5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); runTest(f, t.name); }} title="Run test"
                      className="opacity-0 group-hover:!opacity-100 hover:!text-[#22C55E]"
                      style={{ color: "#6A6A85", background: "none", border: "none", cursor: "pointer", padding: "2px 3px", display: "flex", flexShrink: 0 }}>
                      <RunIcon />
                    </button>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
