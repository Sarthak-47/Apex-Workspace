import { useAppStore } from "@/store";

// All icons as inline SVG matching the mockup's Lucide-style icons
const Icons = {
  folder: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5a1.5 1.5 0 0 1 1.5-1.5H7l1.5 2H14.5A1.5 1.5 0 0 1 16 7v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 14V5z"/>
    </svg>
  ),
  gitBranch: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="14" r="1.5"/><circle cx="13" cy="4" r="1.5"/>
      <line x1="5" y1="5.5" x2="5" y2="12.5"/>
      <path d="M13 5.5v2a4 4 0 0 1-4 4H5"/>
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5"/><line x1="12" y1="12" x2="16" y2="16"/>
    </svg>
  ),
  // AI / Intel panel icon (chat bubble with sparkle)
  aiChat: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 15 4v7a1.5 1.5 0 0 1-1.5 1.5H6l-3 2V4z"/>
      <path d="M7 7.5h0.01M9 7.5h0.01M11 7.5h0.01" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="2.2"/>
      <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"/>
    </svg>
  ),
};

function NavIcon({
  icon, active, badge, title, onClick,
}: {
  icon: React.ReactNode;
  active?: boolean;
  badge?: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        cursor: 'pointer',
        color: active ? '#6366F1' : '#4A4A65',
        background: active ? '#1A1A3A' : 'transparent',
        borderLeft: active ? '2px solid #6366F1' : '2px solid transparent',
        position: 'relative',
        transition: 'all 0.12s',
        flexShrink: 0,
      }}
      className={!active ? 'hover:!bg-[#18181F] hover:!text-[#8888A8]' : ''}
    >
      {icon}
      {badge && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#F59E0B',
          position: 'absolute', top: 7, right: 7,
        }} />
      )}
    </button>
  );
}

export function LeftNav() {
  const { leftPanelOpen, toggleLeftPanel, intelPanelOpen, toggleIntelPanel } = useAppStore();

  return (
    <div
      className="app-left-nav flex flex-col items-center py-2 gap-0.5"
      style={{ width: 48, background: '#111118', borderRight: '1px solid #1A1A28', flexShrink: 0 }}
    >
      <NavIcon icon={Icons.folder}    active={leftPanelOpen}   title="Explorer (toggle)"    onClick={toggleLeftPanel} />
      <NavIcon icon={Icons.gitBranch} title="Source Control"   badge />
      <NavIcon icon={Icons.search}    title="Search" />
      <NavIcon icon={Icons.aiChat}    active={intelPanelOpen}  title="AI Panel (toggle)"    onClick={toggleIntelPanel} />
      <div style={{ flex: 1 }} />
      <NavIcon icon={Icons.settings}  title="Settings" />
    </div>
  );
}
