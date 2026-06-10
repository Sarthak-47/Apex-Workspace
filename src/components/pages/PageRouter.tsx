import type { AppPage } from "@/store";
import { PageShell } from "./PageShell";
import { WelcomePage } from "./WelcomePage";
import { SourceControlPage } from "./SourceControlPage";
import { ModelsPage } from "./ModelsPage";
import { PreviewPage } from "./PreviewPage";

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <PageShell title={title} subtitle={subtitle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "#4A4A65" }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#3A3A4D" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><circle cx="12" cy="16" r="0.6" fill="#3A3A4D" />
        </svg>
        <div style={{ fontSize: 12 }}>This page is being built.</div>
      </div>
    </PageShell>
  );
}

export function PageRouter({ page }: { page: AppPage }) {
  switch (page) {
    case "welcome": return <WelcomePage />;
    case "source-control": return <SourceControlPage />;
    case "preview": return <PreviewPage />;
    case "agents": return <Placeholder title="AI Agents" subtitle="Create and manage custom agents" />;
    case "knowledge": return <Placeholder title="Knowledge" subtitle="Your knowledge vault & graph" />;
    case "models": return <ModelsPage />;
    case "settings": return <Placeholder title="Settings" subtitle="Workspace & editor preferences" />;
    default: return null;
  }
}
