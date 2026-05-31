import { useState } from "react";
import { useAppStore } from "@/store";
import { MonacoEditor } from "@/components/editor/MonacoEditor";

// ─── Tab bar ──────────────────────────────────────────────────────────────────

interface TabBarProps {
  onRequestClose: (path: string) => void;
}

function TabBar({ onRequestClose }: TabBarProps) {
  const { openFiles, activeFile, unsavedFiles, setActiveFile } = useAppStore();
  if (openFiles.length === 0) return null;

  return (
    <div style={{
      height: 36,
      background: '#111118',
      borderBottom: '1px solid #252535',
      display: 'flex',
      alignItems: 'flex-end',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {openFiles.map((path) => {
        const name      = path.split('/').pop() ?? path;
        const ext       = name.split('.').pop()?.toLowerCase() ?? '';
        const active    = path === activeFile;
        const unsaved   = unsavedFiles.includes(path);
        const iconColor = getIconColor(ext);

        return (
          <div
            key={path}
            onClick={() => setActiveFile(path)}
            style={{
              height: 36,
              display: 'flex',
              alignItems: 'center',
              padding: '0 10px 0 9px',
              gap: 5,
              cursor: 'pointer',
              borderRight: '1px solid #252535',
              borderTop: active ? '2px solid #6366F1' : '2px solid transparent',
              borderBottom: active ? '1px solid #0A0A0F' : 'none',
              background: active ? '#0A0A0F' : '#111118',
              marginBottom: active ? -1 : 0,
              zIndex: active ? 2 : 1,
              position: 'relative',
              flexShrink: 0,
              maxWidth: 180,
            }}
          >
            {/* File type icon */}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
              <rect width="13" height="13" rx="1.5" fill={iconColor} opacity="0.15"/>
              <text x="1.5" y="10" fontSize="7.5" fontWeight="700" fill={iconColor} fontFamily="monospace">
                {getIconLabel(ext)}
              </text>
            </svg>

            {/* Filename */}
            <span style={{
              fontSize: 12,
              color: active ? '#E2E2EC' : '#8888A8',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
            }}>
              {name}
            </span>

            {/* Unsaved amber dot — only when dirty */}
            {unsaved && (
              <span style={{
                width: 6, height: 6,
                borderRadius: '50%',
                background: '#F59E0B',
                flexShrink: 0,
                marginLeft: 1,
              }} />
            )}

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRequestClose(path);
              }}
              title={unsaved ? 'Close (unsaved changes)' : 'Close'}
              style={{
                fontSize: 14,
                color: '#4A4A65',
                marginLeft: unsaved ? 2 : 4,
                lineHeight: 1,
                cursor: 'pointer',
                flexShrink: 0,
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 3,
              }}
              className="hover:!text-[#E2E2EC] hover:bg-white/5 transition-colors"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Map extension → accent color & short label
function getIconColor(ext: string): string {
  const map: Record<string, string> = {
    ts: '#3B82F6', tsx: '#06B6D4',
    js: '#F59E0B', jsx: '#F59E0B',
    py: '#22C55E', rs: '#F97316',
    go: '#06B6D4', java: '#EF4444',
    json: '#FACC15', md: '#94A3B8',
    css: '#A78BFA', scss: '#EC4899',
    html: '#F87171', toml: '#FB923C',
    yaml: '#34D399', yml: '#34D399',
    sh: '#6EE7B7',
  };
  return map[ext] ?? '#8888A8';
}

function getIconLabel(ext: string): string {
  const map: Record<string, string> = {
    ts: 'TS', tsx: 'TX', js: 'JS', jsx: 'JX',
    py: 'PY', rs: 'RS', go: 'GO', java: 'JV',
    json: '{}', md: 'MD', css: 'CS', scss: 'SC',
    html: 'HT', toml: 'TM', yaml: 'YM', yml: 'YM',
    sh: 'SH',
  };
  return map[ext] ?? (ext.slice(0, 2).toUpperCase() || '??');
}

// ─── Discard dialog ───────────────────────────────────────────────────────────

interface DiscardDialogProps {
  path: string;
  onDiscard: () => void;
  onCancel: () => void;
}

function DiscardDialog({ path, onDiscard, onCancel }: DiscardDialogProps) {
  const name = path.split('/').pop() ?? path;

  return (
    // Backdrop
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      {/* Dialog card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          background: '#111118',
          border: '1px solid #252535',
          borderRadius: 8,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid #1A1A28',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Warning icon */}
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: '#291A0D', border: '1px solid #403010',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 1.5L12.5 11.5H1.5L7 1.5Z"/>
                <line x1="7" y1="5.5" x2="7" y2="8.5"/>
                <circle cx="7" cy="10" r="0.4" fill="#F59E0B"/>
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E2EC' }}>
              Unsaved changes
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 20px 18px' }}>
          <p style={{ fontSize: 12, color: '#8888A8', lineHeight: 1.6 }}>
            Do you want to discard your changes to{' '}
            <span style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11, color: '#E2E2EC',
              background: '#1A1A28', padding: '1px 5px', borderRadius: 3,
            }}>
              {name}
            </span>
            ? This action cannot be undone.
          </p>

          {/* Actions */}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                height: 30, padding: '0 14px', borderRadius: 5,
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: 'transparent',
                border: '1px solid #252535',
                color: '#8888A8',
                transition: 'all 120ms',
              }}
              className="hover:!border-[#4A4A65] hover:!text-[#E2E2EC] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={onDiscard}
              style={{
                height: 30, padding: '0 14px', borderRadius: 5,
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: '#291A0D',
                border: '1px solid #F59E0B60',
                color: '#F59E0B',
                transition: 'all 120ms',
              }}
              className="hover:!bg-[#F59E0B20] transition-all"
            >
              Discard changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
function Breadcrumb({ path }: { path: string }) {
  const parts = path.split('/').filter(Boolean);
  return (
    <div style={{
      height: 26,
      background: '#0D0D16',
      borderBottom: '1px solid #1A1A28',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 5,
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {parts.map((part, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              color: i === parts.length - 1 ? '#E2E2EC' : '#8888A8',
              cursor: i < parts.length - 1 ? 'pointer' : 'default',
            }}
            className={i < parts.length - 1 ? 'hover:!text-[#E2E2EC] transition-colors' : ''}
          >
            {part}
          </span>
          {i < parts.length - 1 && (
            <span style={{ fontSize: 11, color: '#4A4A65' }}>›</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Context Ribbon ───────────────────────────────────────────────────────────
const CHIPS = [
  {
    type: 'person', label: 'Alex Chen', bg: '#0D1929', color: '#93C5FD', border: '#1A2940',
    svg: <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="4.5" r="2.5"/><path d="M1.5 12.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"/></svg>,
  },
  {
    type: 'decision', label: 'Auth Decision #12', bg: '#150D29', color: '#C084FC', border: '#251A40',
    svg: <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5z"/><polyline points="8 1.5 8 5 11.5 5"/><polyline points="5 9 6.5 10.5 9.5 8"/></svg>,
  },
  {
    type: 'meeting', label: 'Sprint 23', bg: '#290D1F', color: '#F9A8D4', border: '#401A30',
    svg: <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F9A8D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="11" height="10" rx="1"/><line x1="4.5" y1="1" x2="4.5" y2="4"/><line x1="9.5" y1="1" x2="9.5" y2="4"/><line x1="1.5" y1="6" x2="12.5" y2="6"/></svg>,
  },
  {
    type: 'question', label: '2 questions', bg: '#291A0D', color: '#F59E0B', border: '#403010',
    svg: <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5"/><path d="M5.5 5.5A1.5 1.5 0 0 1 8.5 6c0 1.5-1.5 1.75-1.5 2.75"/><circle cx="7" cy="10.5" r="0.4" fill="#F59E0B"/></svg>,
  },
];

function ContextRibbon() {
  return (
    <div style={{
      height: 32,
      background: '#0D0D16',
      borderBottom: '1px solid #252535',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 6,
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <span style={{
        fontSize: 9, fontWeight: 600,
        color: '#4A4A65', letterSpacing: '0.1em',
        textTransform: 'uppercase', marginRight: 4, whiteSpace: 'nowrap',
      }}>
        ↗ Context
      </span>
      {CHIPS.map((chip) => (
        <div
          key={chip.type}
          style={{
            height: 24, padding: '0 8px', borderRadius: 4,
            display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer', fontSize: 11, fontWeight: 500,
            whiteSpace: 'nowrap', border: `1px solid ${chip.border}`,
            background: chip.bg, color: chip.color, flexShrink: 0,
          }}
          className="hover:brightness-110 transition-all"
        >
          {chip.svg}
          {chip.label}
        </div>
      ))}
    </div>
  );
}

// ─── Empty state (no file open) ───────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      background: '#0A0A0F',
    }}>
      <img
        src="/apex-logo.svg"
        width={110} height={110}
        alt=""
        style={{
          objectFit: 'contain',
          mixBlendMode: 'lighten',
          opacity: 0.35,
          filter: 'brightness(1.4) saturate(0.9)',
        }}
      />
      <p style={{ fontSize: 12, color: '#4A4A65' }}>Open a file to start editing</p>
      <p style={{ fontSize: 11, color: '#4A4A65', opacity: 0.7 }}>
        <span style={{
          background: '#18181F', border: '1px solid #252535',
          borderRadius: 3, padding: '1px 5px',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, color: '#4A4A65',
        }}>
          Ctrl+P
        </span>
        {' '}Quick Open &nbsp;·&nbsp;{' '}
        <span style={{
          background: '#18181F', border: '1px solid #252535',
          borderRadius: 3, padding: '1px 5px',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, color: '#4A4A65',
        }}>
          Ctrl+S
        </span>
        {' '}Save
      </p>
    </div>
  );
}

// ─── Center Area ──────────────────────────────────────────────────────────────
export function CenterArea() {
  const { activeFile, unsavedFiles, closeFile } = useAppStore();
  const [closeTarget, setCloseTarget] = useState<string | null>(null);

  const handleRequestClose = (path: string) => {
    if (unsavedFiles.includes(path)) {
      setCloseTarget(path);     // show discard dialog
    } else {
      closeFile(path);          // close immediately if clean
    }
  };

  const handleDiscard = () => {
    if (closeTarget) {
      closeFile(closeTarget);
      setCloseTarget(null);
    }
  };

  return (
    <div
      className="app-center flex flex-col"
      style={{ background: '#0A0A0F', minWidth: 0, overflow: 'hidden' }}
    >
      <TabBar onRequestClose={handleRequestClose} />

      {activeFile ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <Breadcrumb path={activeFile} />
          <ContextRibbon />
          {/* Monaco remounts cleanly on path change via key={path} inside component */}
          <MonacoEditor path={activeFile} />
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Discard confirmation dialog */}
      {closeTarget && (
        <DiscardDialog
          path={closeTarget}
          onDiscard={handleDiscard}
          onCancel={() => setCloseTarget(null)}
        />
      )}
    </div>
  );
}
