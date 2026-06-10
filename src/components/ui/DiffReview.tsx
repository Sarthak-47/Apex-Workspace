import { useRef } from "react";
import { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { useAppStore, useToast } from "@/store";
import { registerAllThemes, getLang } from "@/components/editor/MonacoEditor";

export function DiffReview() {
  const { pendingDiffReview, setPendingDiffReview, setPendingFileEdit, editorTheme } = useAppStore();
  const { success } = useToast();
  const diffRef = useRef<MonacoEditorNS.IStandaloneDiffEditor | null>(null);

  if (!pendingDiffReview) return null;

  const { path, original, proposed, mode = 'review', originalLabel, modifiedLabel } = pendingDiffReview;
  const isCompare = mode === 'compare';
  const fileName = path.split(/[\\/]/).pop() ?? path;
  const lang     = getLang(path);
  const leftLabel  = originalLabel ?? (isCompare ? 'Original' : 'Current');
  const rightLabel = modifiedLabel ?? (isCompare ? 'Modified' : 'AI Suggested');

  const handleMount = (editor: MonacoEditorNS.IStandaloneDiffEditor) => {
    diffRef.current = editor;
  };

  const handleAccept = () => {
    // Take whatever is currently in the modified (right) pane — user may have
    // tweaked the AI suggestion before accepting
    const content = diffRef.current?.getModifiedEditor().getValue() ?? proposed;
    setPendingFileEdit({ path, content });
    setPendingDiffReview(null);
    success(`Applied to ${fileName} — Ctrl+S to save`);
  };

  const handleCancel = () => setPendingDiffReview(null);

  // Escape key to cancel
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleCancel();
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column',
        padding: '28px 32px',
      }}
      onMouseDown={handleCancel}
    >
      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: '#111118', border: '1px solid #252535',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 32px 100px rgba(0,0,0,0.9)',
          minHeight: 0,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{
          height: 48, background: '#0D0D16', borderBottom: '1px solid #252535',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
          flexShrink: 0,
        }}>
          {/* Diff icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M4 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5l-4-4H4z"/>
            <polyline points="9,1 9,5 14,5"/>
            <line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9" y2="11"/>
          </svg>

          <span style={{ fontSize: 13, color: '#E2E2EC', fontWeight: 500 }}>{isCompare ? 'Compare' : 'Review AI changes'}</span>
          <span style={{ fontSize: 12, color: '#4A4A65', fontFamily: '"JetBrains Mono",monospace' }}>
            {fileName}
          </span>

          {/* Column labels */}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: '#4A4A65', background: '#18181F', padding: '2px 8px', borderRadius: 3 }}>{leftLabel}</span>
          <span style={{ fontSize: 10, color: 'var(--accent)', background: '#1A1A3A', border: '1px solid #6366F130', padding: '2px 8px', borderRadius: 3 }}>{rightLabel}</span>
          <div style={{ width: 1, height: 20, background: '#252535', margin: '0 6px' }} />

          {/* Close / Cancel */}
          <button
            onClick={handleCancel}
            style={{ height: 30, padding: '0 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: '#1A1A28', border: '1px solid #252535', color: '#8888A8' }}
            className="hover:!bg-[#252535] hover:!text-[#E2E2EC] transition-colors"
          >
            {isCompare ? 'Close' : 'Cancel'}
          </button>

          {/* Accept (review mode only) */}
          {!isCompare && (
            <button
              onClick={handleAccept}
              style={{ height: 30, padding: '0 16px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', border: 'none', color: 'white' }}
              className="hover:!bg-[#7C7FFF] transition-colors"
            >
              ✓ Accept Changes
            </button>
          )}
        </div>

        {/* ── Monaco DiffEditor ────────────────────────────────────────── */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <DiffEditor
            original={original}
            modified={proposed}
            language={lang}
            theme={editorTheme}
            beforeMount={registerAllThemes}
            onMount={handleMount}
            options={{
              fontFamily: '"JetBrains Mono","Cascadia Code","Consolas",monospace',
              fontSize: 13,
              lineHeight: 21,
              renderSideBySide: true,
              readOnly: isCompare,             // compare = read-only view; review = editable right pane
              originalEditable: false,  // left pane is read-only
              scrollBeyondLastLine: false,
              minimap: { enabled: false },
              padding: { top: 10, bottom: 10 },
              lineNumbers: 'on',
              folding: false,
              diffWordWrap: 'on',
              renderOverviewRuler: false,
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              enableSplitViewResizing: true,
              renderMarginRevertIcon: false,
            }}
          />
        </div>

        {/* ── Footer hint ──────────────────────────────────────────────── */}
        <div style={{
          height: 30, background: '#0D0D16', borderTop: '1px solid #1A1A28',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16,
          flexShrink: 0,
        }}>
          {(isCompare
            ? [['Esc', 'close']]
            : [['Edit right pane', 'to adjust before accepting'], ['Esc', 'cancel']]
          ).map(([key, label]) => (
            <span key={key} style={{ fontSize: 10, color: '#4A4A65', display: 'flex', alignItems: 'center', gap: 4 }}>
              <kbd style={{ background: '#18181F', padding: '1px 5px', borderRadius: 3, fontFamily: '"JetBrains Mono",monospace', fontSize: 9 }}>{key}</kbd>
              {label}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4A4A65' }}>
            {isCompare ? 'Read-only comparison' : 'Changes are staged in editor — Ctrl+S to write to disk'}
          </span>
        </div>
      </div>
    </div>
  );
}
