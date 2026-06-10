import { useAppStore } from "@/store";
import { GitPanel } from "@/components/layout/GitPanel";
import { PageShell } from "./PageShell";

export function SourceControlPage() {
  const { workspacePath, gitBranch } = useAppStore();

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
      <div style={{ maxWidth: 720, margin: "0 auto", height: "100%", display: "flex", flexDirection: "column" }}>
        {/* GitPanel is self-contained (status, stage/unstage, commit, log). */}
        <GitPanel />
      </div>
    </PageShell>
  );
}
