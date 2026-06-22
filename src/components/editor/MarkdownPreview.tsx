import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { useAppStore } from '@/store';
import { extractLinks, listVault, resolveNoteByTitle, parseFrontmatter } from '@/lib/vault';

// Render markdown with [[wikilinks]] turned into clickable spans, plus a
// backlinks footer when the note lives in the vault.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Replace [[Target]] / [[Target|alias]] with anchor placeholders before markdown render. */
function wikilinkify(md: string): string {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const [target, alias] = inner.split('|');
    const label = (alias ?? target).trim();
    const t = escapeHtml(target.trim());
    return `<a href="#" data-wikilink="${t}" class="apex-wikilink">${escapeHtml(label)}</a>`;
  });
}

interface Props {
  path: string;
  content: string;
  onNavigate: (path: string) => void;
}

export function MarkdownPreview({ path, content, onNavigate }: Props) {
  const { workspacePath } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [backlinks, setBacklinks] = useState<{ title: string; path: string }[]>([]);

  // Strip frontmatter from the preview body
  const { body } = parseFrontmatter(content);

  const html = useMemo(() => {
    const withLinks = wikilinkify(body);
    // marked v14: disable raw HTML passthrough is not built-in; our own content is local,
    // but we still guard against <script> injection from note text.
    const raw = marked.parse(withLinks, { async: false, gfm: true, breaks: true }) as string;
    const slug = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      // anchor ids for headings (simple text headings)
      .replace(/<(h[1-4])>([^<]+)<\/\1>/g, (_m, tag, text) => `<${tag} id="${slug(text)}">${text}</${tag}>`)
      // copy button as the first child of every <pre> (handled via event delegation)
      .replace(/<pre>/g, '<pre class="apex-pre"><button type="button" class="apex-copy-btn">Copy</button>');
  }, [body]);

  // Compute backlinks for this note across the vault
  useEffect(() => {
    let cancelled = false;
    if (!workspacePath) { setBacklinks([]); return; }
    listVault(workspacePath).then(notes => {
      if (cancelled) return;
      const me = notes.find(n => n.path === path);
      const myTitle = (me?.title ?? path.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? '').toLowerCase();
      const linkers = notes
        .filter(n => n.path !== path && extractLinks(n.body).some(l => l.toLowerCase() === myTitle))
        .map(n => ({ title: n.title, path: n.path }));
      setBacklinks(linkers);
    }).catch(() => setBacklinks([]));
    return () => { cancelled = true; };
  }, [workspacePath, path, content]);

  // Click handler — wikilinks + code-block copy buttons (event delegation).
  const handleClick = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const copyBtn = target.closest('.apex-copy-btn') as HTMLElement | null;
    if (copyBtn) {
      e.preventDefault();
      const pre = copyBtn.parentElement;
      const code = pre?.querySelector('code')?.textContent ?? '';
      navigator.clipboard?.writeText(code).catch(() => {});
      copyBtn.textContent = 'Copied'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
      return;
    }
    const el = target.closest('[data-wikilink]') as HTMLElement | null;
    if (!el || !workspacePath) return;
    e.preventDefault();
    const title = el.getAttribute('data-wikilink') ?? '';
    const resolved = await resolveNoteByTitle(workspacePath, title);
    if (resolved) onNavigate(resolved);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="apex-md-preview"
      style={{
        flex: 1, minHeight: 0, overflowY: 'auto', background: '#0A0A0F',
        padding: '20px 28px', color: '#C8C8D8', fontSize: 14, lineHeight: 1.7,
      }}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />

      {backlinks.length > 0 && (
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #1A1A28' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#4A4A65', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h5a2 2 0 0 0 0-4H6"/><polyline points="6,1 4,3 6,5"/>
            </svg>
            {backlinks.length} Backlink{backlinks.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {backlinks.map(b => (
              <div key={b.path} onClick={() => onNavigate(b.path)}
                style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', padding: '4px 8px', borderRadius: 5, background: '#0F0F16', border: '1px solid #1A1A28' }}
                className="hover:!bg-[#1A1A3A] transition-colors">
                ↩ {b.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
