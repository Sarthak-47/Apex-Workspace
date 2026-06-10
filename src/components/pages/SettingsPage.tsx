import { SettingsBody } from "@/components/ui/SettingsDialog";
import { PageShell } from "./PageShell";

export function SettingsPage() {
  return (
    <PageShell title="Settings" subtitle="Workspace, editor, AI & connections">
      <SettingsBody />
    </PageShell>
  );
}
