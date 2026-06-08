/**
 * Shared inline-SVG icon set. No emoji anywhere in the UI — these match the
 * app's hand-drawn icon style (currentColor stroke, ~1.4 strokeWidth).
 */
import type { NoteCategory } from '@/lib/vault';

interface IconProps { size?: number; color?: string }

const wrap = (size: number, color: string | undefined, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
    stroke={color ?? 'currentColor'} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    {children}
  </svg>
);

// ─── Category icons (people / projects / orgs / decisions / meetings / topics) ─

export const CategoryIcon = ({ cat, size = 14, color }: { cat: NoteCategory } & IconProps) => {
  switch (cat) {
    case 'people':        return wrap(size, color, <><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5"/></>);
    case 'projects':      return wrap(size, color, <><path d="M2 5.5a1 1 0 0 1 1-1h3.2a1 1 0 0 1 .7.3L8 6h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></>);
    case 'organizations': return wrap(size, color, <><rect x="3" y="2.5" width="7" height="11" rx="1"/><path d="M10 6h3v7.5H10"/><line x1="5" y1="5" x2="8" y2="5"/><line x1="5" y1="7.5" x2="8" y2="7.5"/><line x1="5" y1="10" x2="8" y2="10"/></>);
    case 'decisions':     return wrap(size, color, <><path d="M9.5 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><polyline points="9.5 2.5 9.5 6 13 6"/><polyline points="5.5 9 7 10.5 10.5 7.5"/></>);
    case 'meetings':      return wrap(size, color, <><rect x="2.5" y="3" width="11" height="10.5" rx="1"/><line x1="5.5" y1="1.5" x2="5.5" y2="4.5"/><line x1="10.5" y1="1.5" x2="10.5" y2="4.5"/><line x1="2.5" y1="6.5" x2="13.5" y2="6.5"/></>);
    case 'topics':        return wrap(size, color, <><path d="M2.5 8.5l5-5a1 1 0 0 1 .7-.3H12a1 1 0 0 1 1 1v3.3a1 1 0 0 1-.3.7l-5 5a1 1 0 0 1-1.4 0l-3.8-3.8a1 1 0 0 1 0-1.4z"/><circle cx="10" cy="6" r="0.8" fill="currentColor"/></>);
  }
};

// ─── Tool icons ───────────────────────────────────────────────────────────────

export const ToolIcon = ({ name, size = 13, color }: { name: string } & IconProps) => {
  switch (name) {
    case 'read_file':     return wrap(size, color, <><path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><polyline points="9 2 9 6 13 6"/></>);
    case 'list_directory':return wrap(size, color, <><path d="M2 5a1 1 0 0 1 1-1h3l1.2 1.2H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></>);
    case 'search_files':  return wrap(size, color, <><circle cx="7" cy="7" r="4"/><line x1="10" y1="10" x2="13.5" y2="13.5"/></>);
    case 'edit_file':     return wrap(size, color, <><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z"/></>);
    case 'write_file':    return wrap(size, color, <><path d="M3 3h7l3 3v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="5 3 5 6 10 6"/><line x1="5" y1="9.5" x2="11" y2="9.5"/></>);
    case 'run_bash':      return wrap(size, color, <><polyline points="3 4 6.5 7.5 3 11"/><line x1="8" y1="11" x2="13" y2="11"/></>);
    case 'web_search':    return wrap(size, color, <><circle cx="8" cy="8" r="5.5"/><line x1="2.5" y1="8" x2="13.5" y2="8"/><path d="M8 2.5c1.8 2 1.8 9 0 11M8 2.5c-1.8 2-1.8 9 0 11"/></>);
    default:              return wrap(size, color, <><circle cx="8" cy="8" r="5.5"/><path d="M8 5.5v2.5l1.8 1.8"/></>);
  }
};

// ─── Mention / source icons ───────────────────────────────────────────────────

export const MentionIcon = ({ kind, size = 12, color }: { kind: string } & IconProps) => {
  switch (kind) {
    case 'folder':   return wrap(size, color, <><path d="M2 5a1 1 0 0 1 1-1h3l1.2 1.2H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></>);
    case 'symbol':   return wrap(size, color, <><polyline points="5 3 2 8 5 13"/><polyline points="11 3 14 8 11 13"/></>);
    case 'person':   return wrap(size, color, <><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5"/></>);
    case 'project':  return wrap(size, color, <><path d="M2 5.5a1 1 0 0 1 1-1h3.2a1 1 0 0 1 .7.3L8 6h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></>);
    case 'decision': return wrap(size, color, <><path d="M9.5 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><polyline points="9.5 2.5 9.5 6 13 6"/></>);
    case 'meeting':  return wrap(size, color, <><rect x="2.5" y="3" width="11" height="10.5" rx="1"/><line x1="2.5" y1="6.5" x2="13.5" y2="6.5"/></>);
    case 'git':      return wrap(size, color, <><circle cx="4" cy="4" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="11" cy="7" r="1.6"/><path d="M4 5.6v4.8M5.5 4.2h2.4a2 2 0 0 1 2 2v.2"/></>);
    case 'knowledge':return wrap(size, color, <><path d="M6 10a3 3 0 0 1 0-4l1.5-1.5a3 3 0 0 1 4 4L10.5 9"/><path d="M10 6a3 3 0 0 1 0 4l-1.5 1.5a3 3 0 0 1-4-4L6 7"/></>);
    default:         return wrap(size, color, <><path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><polyline points="9 2 9 6 13 6"/></>);
  }
};

// ─── Bolt (live note) ─────────────────────────────────────────────────────────

export const BoltIcon = ({ size = 12, color }: IconProps) =>
  wrap(size, color, <polygon points="8.5 1.5 3.5 9 7.5 9 6.5 14.5 12 6.5 8 6.5" fill="currentColor" stroke="none"/>);

// ─── Agent icons ──────────────────────────────────────────────────────────────

export const AgentIcon = ({ kind, size = 14, color }: { kind: string } & IconProps) => {
  switch (kind) {
    case 'coder':       return wrap(size, color, <><polyline points="5 4 2 8 5 12"/><polyline points="11 4 14 8 11 12"/></>);
    case 'reviewer':    return wrap(size, color, <><circle cx="7" cy="7" r="4"/><line x1="10" y1="10" x2="13.5" y2="13.5"/></>);
    case 'explainer':   return wrap(size, color, <><path d="M5.5 6a2.5 2.5 0 0 1 5 0c0 1.7-2 2-2 3.5"/><circle cx="8" cy="12" r="0.6" fill="currentColor"/><circle cx="8" cy="8" r="6"/></>);
    case 'debugger':    return wrap(size, color, <><ellipse cx="8" cy="9" rx="3" ry="3.5"/><path d="M8 5.5V4M5 6L3.5 4.5M11 6l1.5-1.5M5 9H2.5M11 9h2.5M5 11.5l-1.5 1.5M11 11.5l1.5 1.5"/></>);
    case 'test-writer': return wrap(size, color, <><path d="M6 2v4l-2.5 6a1 1 0 0 0 1 1.5h7a1 1 0 0 0 1-1.5L10 6V2"/><line x1="5" y1="2" x2="11" y2="2"/><line x1="5.5" y1="9.5" x2="10.5" y2="9.5"/></>);
    default:            return wrap(size, color, <><rect x="3.5" y="4.5" width="9" height="7" rx="1.5"/><circle cx="6" cy="8" r="0.8" fill="currentColor"/><circle cx="10" cy="8" r="0.8" fill="currentColor"/><line x1="8" y1="2.5" x2="8" y2="4.5"/></>);
  }
};
