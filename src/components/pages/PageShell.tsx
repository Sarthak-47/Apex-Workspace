import type { ReactNode } from "react";

/** Consistent full-page chrome: a header row + scrollable body. */
export function PageShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0A0A0F", minWidth: 0 }}>
      <div style={{ height: 52, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 22px", borderBottom: "1px solid #1A1A28" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#E6E6F0" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "#6A6A85", marginTop: 1 }}>{subtitle}</div>}
        </div>
        {actions}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>{children}</div>
    </div>
  );
}
