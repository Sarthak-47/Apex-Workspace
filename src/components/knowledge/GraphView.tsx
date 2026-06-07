import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide,
  type Simulation,
} from 'd3-force';
import { buildGraph, neighbourhood, CATEGORY_STYLE, type GraphNode } from '@/lib/graph';
import { CATEGORIES, type VaultNote, type NoteCategory } from '@/lib/vault';

interface SimNode extends GraphNode { x?: number; y?: number; fx?: number | null; fy?: number | null }
interface SimLink { source: SimNode | string; target: SimNode | string }

function shapePath(shape: string, cx: number, cy: number, r: number): { el: 'circle' | 'rect' | 'polygon'; props: Record<string, string | number> } {
  switch (shape) {
    case 'square':
      return { el: 'rect', props: { x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: 2 } };
    case 'diamond':
      return { el: 'polygon', props: { points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}` } };
    case 'hexagon': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      }).join(' ');
      return { el: 'polygon', props: { points: pts } };
    }
    default:
      return { el: 'circle', props: { cx, cy, r } };
  }
}

interface Props {
  notes: VaultNote[];
  onOpen: (path: string) => void;
}

export function GraphView({ notes, onOpen }: Props) {
  const graph = useMemo(() => buildGraph(notes), [notes]);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const [, setTick] = useState(0);

  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [hidden, setHidden] = useState<Set<NoteCategory>>(new Set());
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<{ node: SimNode; x: number; y: number } | null>(null);

  const W = 600, H = 460;

  // (Re)build simulation when the graph changes
  useEffect(() => {
    simRef.current?.stop();
    const nodes: SimNode[] = graph.nodes.map(n => ({ ...n }));
    const links: SimLink[] = graph.links.map(l => ({ source: l.source, target: l.target }));
    nodesRef.current = nodes;
    linksRef.current = links;

    const sim = forceSimulation<SimNode>(nodes)
      .force('charge', forceManyBody().strength(-200))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .force('link', forceLink<SimNode, any>(links).id(d => d.id).distance(75).strength(0.6))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide(24))
      .on('tick', () => setTick(t => (t + 1) % 1000000));
    simRef.current = sim;
    return () => { sim.stop(); };
  }, [graph]);

  const visible = (n: SimNode) => {
    if (hidden.has(n.category)) return false;
    if (focus) { const nb = neighbourhood(graph, focus, 2); return nb.has(n.id); }
    return true;
  };
  const matchesQuery = (n: SimNode) => query.length > 0 && n.id.toLowerCase().includes(query.toLowerCase());

  // ── Zoom / pan ─────────────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setTransform(t => ({ ...t, k: Math.min(3, Math.max(0.3, t.k * (1 + delta))) }));
  };
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const onBgDown = (e: React.MouseEvent) => { panRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y }; };
  const onMove = (e: React.MouseEvent) => {
    if (panRef.current) setTransform(t => ({ ...t, x: e.clientX - panRef.current!.x, y: e.clientY - panRef.current!.y }));
  };
  const onUp = () => { panRef.current = null; };

  // ── Export PNG (user-initiated) ────────────────────────────────────────────
  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W * 2; canvas.height = H * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.fillStyle = '#0A0A0F'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'knowledge-graph.png';
      a.click();
    };
    img.src = url;
  };

  const nodes = nodesRef.current;
  const links = linksRef.current;

  if (graph.nodes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p style={{ fontSize: 12, color: '#4A4A65', textAlign: 'center', lineHeight: 1.6 }}>
          No notes to graph yet.<br />Create notes and link them with <code style={{ fontFamily: '"JetBrains Mono",monospace' }}>[[Name]]</code>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flexShrink: 0, flexWrap: 'wrap' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Highlight…"
          style={{ height: 24, width: 110, background: '#0A0A0F', border: '1px solid #252535', borderRadius: 4, color: '#E2E2EC', fontSize: 11, padding: '0 7px', outline: 'none' }} />
        {focus && (
          <button onClick={() => setFocus(null)} style={{ height: 24, padding: '0 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', background: '#1A1A3A', border: '1px solid #6366F140', color: '#6366F1' }}>Exit focus</button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setTransform({ x: 0, y: 0, k: 1 })} title="Reset view" style={{ height: 24, padding: '0 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>Reset</button>
        <button onClick={exportPng} title="Export as PNG" style={{ height: 24, padding: '0 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', background: 'transparent', border: '1px solid #252535', color: '#8888A8' }}>PNG</button>
      </div>

      {/* Legend / type filters */}
      <div style={{ display: 'flex', gap: 4, padding: '0 10px 6px', flexWrap: 'wrap', flexShrink: 0 }}>
        {CATEGORIES.filter(c => graph.nodes.some(n => n.category === c.id)).map(c => {
          const off = hidden.has(c.id);
          return (
            <button key={c.id} onClick={() => setHidden(h => { const s = new Set(h); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })}
              style={{ display: 'flex', alignItems: 'center', gap: 4, height: 20, padding: '0 7px', borderRadius: 10, fontSize: 9, cursor: 'pointer', opacity: off ? 0.4 : 1, background: '#0F0F16', border: '1px solid #1A1A28', color: '#8888A8' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: CATEGORY_STYLE[c.id].color }} />{c.label}
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
          onWheel={onWheel} onMouseDown={onBgDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          style={{ background: '#0A0A0F', cursor: panRef.current ? 'grabbing' : 'grab', display: 'block' }}>
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Links */}
            {links.map((l, i) => {
              const s = typeof l.source === 'string' ? null : l.source;
              const t = typeof l.target === 'string' ? null : l.target;
              if (!s || !t || !visible(s) || !visible(t)) return null;
              return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#252540" strokeWidth={1} />;
            })}
            {/* Nodes */}
            {nodes.map(n => {
              if (!visible(n) || n.x == null) return null;
              const style = CATEGORY_STYLE[n.category];
              const r = 8 + Math.min(6, n.degree * 1.5);
              const isMatch = matchesQuery(n);
              const sh = shapePath(style.shape, n.x, n.y!, r);
              const common = {
                fill: style.color, fillOpacity: 0.85,
                stroke: isMatch ? '#fff' : focus === n.id ? '#6366F1' : '#0A0A0F',
                strokeWidth: isMatch || focus === n.id ? 2.5 : 1.5,
                style: { cursor: 'pointer' as const },
                onClick: () => { onOpen(n.path); },
                onDoubleClick: () => setFocus(n.id),
                onMouseEnter: () => setHover({ node: n, x: n.x!, y: n.y! }),
                onMouseLeave: () => setHover(null),
              };
              return (
                <g key={n.id}>
                  {sh.el === 'circle' && <circle {...sh.props} {...common} />}
                  {sh.el === 'rect' && <rect {...sh.props} {...common} />}
                  {sh.el === 'polygon' && <polygon {...sh.props} {...common} />}
                  <text x={n.x} y={n.y! + r + 9} textAnchor="middle" fontSize={7} fill="#8888A8" style={{ pointerEvents: 'none' }}>
                    {n.id.length > 16 ? n.id.slice(0, 15) + '…' : n.id}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hover && (
          <div style={{
            position: 'absolute', left: 10, bottom: 10, pointerEvents: 'none',
            background: '#15151E', border: '1px solid #2A2A3D', borderRadius: 6, padding: '6px 9px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 12, color: '#E2E2EC', fontWeight: 600 }}>{hover.node.id}</div>
            <div style={{ fontSize: 10, color: '#8888A8', marginTop: 2 }}>
              {hover.node.category} · {hover.node.degree} connection{hover.node.degree === 1 ? '' : 's'}
            </div>
            <div style={{ fontSize: 9, color: '#4A4A65', marginTop: 3 }}>click to open · double-click to focus</div>
          </div>
        )}
      </div>
    </div>
  );
}
