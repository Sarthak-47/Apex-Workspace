import type { AppPage } from "@/store";
import { WelcomePage } from "./WelcomePage";
import { SourceControlPage } from "./SourceControlPage";
import { ModelsPage } from "./ModelsPage";
import { PreviewPage } from "./PreviewPage";
import { AgentsPage } from "./AgentsPage";
import { MissionControlPage } from "./MissionControlPage";
import { KnowledgePage } from "./KnowledgePage";
import { SettingsPage } from "./SettingsPage";

export function PageRouter({ page }: { page: AppPage }) {
  switch (page) {
    case "welcome": return <WelcomePage />;
    case "source-control": return <SourceControlPage />;
    case "preview": return <PreviewPage />;
    case "agents": return <AgentsPage />;
    case "mission-control": return <MissionControlPage />;
    case "knowledge": return <KnowledgePage />;
    case "models": return <ModelsPage />;
    case "settings": return <SettingsPage />;
    default: return null;
  }
}
