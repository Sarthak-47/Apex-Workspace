import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Human-readable name of the wrapped region, e.g. "AI Panel". */
  name: string;
  children: ReactNode;
  /** Optional compact mode for small panels. */
  compact?: boolean;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Catches render/runtime errors in a subtree so one broken panel can't blank
 * the entire app (the Rules-of-Hooks class of crash). Shows an inline fallback
 * with a one-click recovery instead of an empty screen.
 *
 * NOTE: error boundaries must be class components — there is no hook equivalent
 * for componentDidCatch / getDerivedStateFromError.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Local-only logging — nothing leaves the machine.
    console.error(`[APEX] "${this.props.name}" crashed:`, error, info.componentStack);
    this.setState({ info });
    try {
      const log = JSON.parse(localStorage.getItem("apex-crash-log") || "[]");
      log.unshift({
        at: new Date().toISOString(),
        panel: this.props.name,
        message: error.message,
        stack: (error.stack || "").split("\n").slice(0, 8).join("\n"),
        component: (info.componentStack || "").split("\n").slice(0, 8).join("\n"),
      });
      localStorage.setItem("apex-crash-log", JSON.stringify(log.slice(0, 25)));
    } catch {
      /* storage full / unavailable — ignore */
    }
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;

    const { name, compact } = this.props;
    return (
      <div
        role="alert"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          height: "100%",
          minHeight: compact ? 80 : 160,
          padding: 20,
          textAlign: "center",
          color: "#C7C7D9",
          background: "#16161F",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <circle cx="12" cy="17" r="0.6" fill="#F59E0B" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#E6E6F0" }}>
          {name} hit an error
        </div>
        {!compact && (
          <div style={{ fontSize: 11, opacity: 0.75, maxWidth: 360, fontFamily: "JetBrains Mono, monospace", lineHeight: 1.4 }}>
            {this.state.error.message || "Unknown error"}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            onClick={this.reset}
            style={{
              fontSize: 11, color: "#fff", background: "#6366F1",
              border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer",
            }}
          >
            Reload this panel
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontSize: 11, color: "#C7C7D9", background: "transparent",
              border: "1px solid #3A3A4D", borderRadius: 6, padding: "5px 12px", cursor: "pointer",
            }}
          >
            Reload app
          </button>
        </div>
        <div style={{ fontSize: 10, opacity: 0.5 }}>
          The rest of APEX keeps running. Details saved locally for diagnostics.
        </div>
      </div>
    );
  }
}
