import { useAppStore } from "@/store";

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
  tests: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2h4M8 2v5.2L4.2 13.4A1.4 1.4 0 0 0 5.4 15.5h7.2a1.4 1.4 0 0 0 1.2-2.1L10 7.2V2"/><line x1="6.4" y1="10.5" x2="11.6" y2="10.5"/>
    </svg>
  ),
  preview: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="14" height="10" rx="1.5"/><line x1="2" y1="6" x2="16" y2="6"/><line x1="6" y1="16" x2="12" y2="16"/><line x1="9" y1="13" x2="9" y2="16"/>
    </svg>
  ),
  agents: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="10" height="8" rx="2"/><line x1="9" y1="3" x2="9" y2="6"/><circle cx="9" cy="2.5" r="0.8"/><circle cx="7" cy="10" r="0.9" fill="currentColor"/><circle cx="11" cy="10" r="0.9" fill="currentColor"/>
    </svg>
  ),
  knowledge: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4a1 1 0 0 1 1-1h4.5a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0-1.5-1.5H4a1 1 0 0 1-1-1V4Z"/><path d="M15 4a1 1 0 0 0-1-1H9.5a2 2 0 0 0-2 2v9a1.5 1.5 0 0 1 1.5-1.5H14a1 1 0 0 0 1-1V4Z"/>
    </svg>
  ),
  models: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="8" height="8" rx="1.5"/><line x1="9" y1="2.5" x2="9" y2="5"/><line x1="9" y1="13" x2="9" y2="15.5"/><line x1="2.5" y1="9" x2="5" y2="9"/><line x1="13" y1="9" x2="15.5" y2="9"/>
    </svg>
  ),
  aiChat: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 15 4v7a1.5 1.5 0 0 1-1.5 1.5H6l-3 2V4z"/>
      <path d="M7 7.5h0.01M9 7.5h0.01M11 7.5h0.01" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  ),
  terminal: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="14" height="12" rx="1.5"/>
      <polyline points="5,7 8,9 5,11"/>
      <line x1="9" y1="11" x2="13" y2="11"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="2.2"/>
      <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"/>
    </svg>
  ),
};

function NavIcon({ icon, active, title, onClick }: { icon: React.ReactNode; active?: boolean; title: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 40, height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, cursor: onClick ? 'pointer' : 'default',
        color: active ? 'var(--accent)' : '#8888A8',
        background: active ? '#1A1A3A' : 'transparent',
        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        position: 'relative', transition: 'all 0.12s', flexShrink: 0,
      }}
      className={!active ? 'hover:!bg-[#18181F] hover:!text-[#E2E2EC]' : ''}
    >
      {icon}
    </button>
  );
}

function NavDivider() {
  return <div style={{ width: 22, height: 1, background: '#252535', margin: '4px 0', flexShrink: 0 }} />;
}

export function LeftNav() {
  const {
    leftPanelOpen, toggleLeftPanel,
    leftPanelView, setLeftPanelView,
    intelPanelOpen, toggleIntelPanel,
    terminalOpen, toggleTerminal,
    appPage, setAppPage,
  } = useAppStore();

  const onCode = appPage === 'code';

  // Explorer/Search switch to the Code page and reveal that sub-view; on Code, toggle.
  const codeView = (view: 'explorer' | 'git' | 'search' | 'tests') => {
    if (!onCode) { setAppPage('code'); setLeftPanelView(view); if (!leftPanelOpen) toggleLeftPanel(); return; }
    if (leftPanelView === view && leftPanelOpen) toggleLeftPanel();
    else { setLeftPanelView(view); if (!leftPanelOpen) toggleLeftPanel(); }
  };

  return (
    <div
      className="app-left-nav flex flex-col items-center py-2 gap-0.5"
      style={{ width: 48, background: '#111118', borderRight: '1px solid #1A1A28', flexShrink: 0, overflowY: 'auto' }}
    >
      {/* ── Pages ── */}
      <NavIcon icon={Icons.folder}    active={onCode && leftPanelOpen && leftPanelView === 'explorer'} title="Explorer (Ctrl+Shift+E)"    onClick={() => codeView('explorer')} />
      <NavIcon icon={Icons.search}    active={onCode && leftPanelOpen && leftPanelView === 'search'}   title="Search (Ctrl+Shift+F)"      onClick={() => codeView('search')} />
      <NavIcon icon={Icons.tests}     active={onCode && leftPanelOpen && leftPanelView === 'tests'}    title="Testing"                    onClick={() => codeView('tests')} />
      <NavIcon icon={Icons.gitBranch} active={appPage === 'source-control'} title="Source Control"      onClick={() => setAppPage('source-control')} />
      <NavIcon icon={Icons.preview}   active={appPage === 'preview'}        title="Web Preview"         onClick={() => setAppPage('preview')} />
      <NavIcon icon={Icons.agents}    active={appPage === 'agents'}         title="AI Agents"           onClick={() => setAppPage('agents')} />
      <NavIcon icon={Icons.knowledge} active={appPage === 'knowledge'}      title="Knowledge"           onClick={() => setAppPage('knowledge')} />
      <NavIcon icon={Icons.models}    active={appPage === 'models'}         title="Models"              onClick={() => setAppPage('models')} />

      <NavDivider />

      {/* ── Code-page tools ── */}
      <NavIcon icon={Icons.aiChat}   active={onCode && intelPanelOpen} title="AI Panel"        onClick={() => { setAppPage('code'); toggleIntelPanel(); }} />
      <NavIcon icon={Icons.terminal} active={onCode && terminalOpen}   title="Terminal (Ctrl+`)" onClick={() => { setAppPage('code'); toggleTerminal(); }} />

      <div style={{ flex: 1, minHeight: 8 }} />

      {/* ── Bottom ── */}
      <NavIcon icon={Icons.settings} active={appPage === 'settings'} title="Settings" onClick={() => setAppPage('settings')} />
    </div>
  );
}
