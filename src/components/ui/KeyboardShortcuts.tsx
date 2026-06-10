import { useEffect } from "react";
import { useAppStore } from "@/store";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: 'General', items: [
    ['Ctrl K / Ctrl P', 'Unified search / quick open'],
    ['Ctrl T', 'Go to symbol in workspace'],
    ['Ctrl ,', 'Settings'],
    ['Ctrl /', 'This shortcuts panel'],
    ['Ctrl `', 'Toggle terminal'],
  ]},
  { title: 'Panels', items: [
    ['Ctrl Shift E', 'Explorer'],
    ['Ctrl Shift G', 'Source control'],
    ['Ctrl Shift F', 'Search & replace'],
  ]},
  { title: 'Editor', items: [
    ['Ctrl S', 'Save file'],
    ['Ctrl G', 'Go to line'],
    ['Ctrl Shift O', 'Go to symbol in file'],
    ['Shift Alt F', 'Format document'],
    ['Ctrl = / Ctrl -', 'Font size'],
    ['Alt Z', 'Toggle word wrap'],
  ]},
  { title: 'Code intelligence', items: [
    ['F12', 'Go to definition (LSP)'],
    ['Shift F12', 'Find all references (LSP)'],
    ['F2', 'Rename symbol (LSP)'],
    ['Ctrl Space', 'Trigger completion'],
  ]},
  { title: 'Chat', items: [
    ['Enter', 'Send message'],
    ['Shift Enter', 'New line'],
    ['@', 'Mention files / people / projects'],
  ]},
];

export function KeyboardShortcuts() {
  const { shortcutsOpen, setShortcutsOpen } = useAppStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShortcutsOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setShortcutsOpen]);

  if (!shortcutsOpen) return null;

  const Key = ({ k }: { k: string }) => (
    <span style={{ display: 'flex', gap: 3 }}>
      {k.split(' ').map((part, i) => part === '/' ? (
        <span key={i} style={{ color: '#4A4A65', alignSelf: 'center' }}>/</span>
      ) : (
        <kbd key={i} style={{ fontSize: 10, color: '#C0C0D0', background: '#18181F', border: '1px solid #252535', borderRadius: 4, padding: '2px 6px', fontFamily: '"JetBrains Mono",monospace' }}>{part}</kbd>
      ))}
    </span>
  );

  return (
    <div onMouseDown={() => setShortcutsOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
      <div onMouseDown={e => e.stopPropagation()}
        style={{ width: 560, maxHeight: '76vh', overflowY: 'auto', background: '#111118', border: '1px solid #252535', borderRadius: 12, boxShadow: '0 28px 80px rgba(0,0,0,0.8)' }}>
        <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 18px', borderBottom: '1px solid #1A1A28', position: 'sticky', top: 0, background: '#111118' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E2EC', flex: 1 }}>Keyboard Shortcuts</span>
          <kbd style={{ fontSize: 10, color: '#4A4A65', background: '#18181F', padding: '2px 6px', borderRadius: 3, fontFamily: '"JetBrains Mono",monospace' }}>ESC</kbd>
        </div>
        <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 28px' }}>
          {GROUPS.map(g => (
            <div key={g.title}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{g.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {g.items.map(([k, label]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flexShrink: 0 }}><Key k={k} /></div>
                    <span style={{ fontSize: 11.5, color: '#8888A8' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
