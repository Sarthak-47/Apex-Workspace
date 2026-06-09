import { useEffect, useState } from "react";
import { useMonaco } from "@monaco-editor/react";
import type { editor as Mon } from "monaco-editor";

/**
 * Live access to Monaco's diagnostic markers (errors/warnings/info) for the
 * currently open model. Monaco's built-in TS/JS/JSON/CSS workers produce these;
 * with the Tier 2 LSP work, language-server diagnostics will flow here too.
 */
export function useMarkers() {
  const monaco = useMonaco();
  const [markers, setMarkers] = useState<Mon.IMarker[]>([]);

  useEffect(() => {
    if (!monaco) return;
    const refresh = () => setMarkers(monaco.editor.getModelMarkers({}));
    refresh();
    const d = monaco.editor.onDidChangeMarkers(() => refresh());
    return () => d.dispose();
  }, [monaco]);

  const errors = markers.filter((m) => m.severity === 8).length;   // MarkerSeverity.Error
  const warnings = markers.filter((m) => m.severity === 4).length; // MarkerSeverity.Warning
  const infos = markers.filter((m) => m.severity <= 2).length;     // Info + Hint

  return { markers, errors, warnings, infos };
}
