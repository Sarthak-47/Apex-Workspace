import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { listVault, type VaultNote, type NoteCategory } from "@/lib/vault";
import { GraphView } from "@/components/knowledge/GraphView";
import { CategoryIcon } from "@/components/ui/Icons";
import { PageShell } from "./PageShell";

export function KnowledgePage() {
  const { workspacePath, openFile, setAppPage } = useAppStore();
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!workspacePath) { setNotes([]); return; }
    let cancel = false;
    listVault(workspacePath).then((n) => { if (!cancel) setNotes(n); }).catch(() => {});
    return () => { cancel = true; };
  }, [workspacePath]);

  const open = (path: string) => { openFile(path); setAppPage('code'); };
  const grouped = useMemo(() => {
    const q = filter.toLowerCase();
    const m = new Map<string, VaultNote[]>();
    for (const n of notes) {
      if (q && !n.title.toLowerCase().includes(q)) continue;
      const k = n.category || 'note';
      (m.get(k) ?? m.set(k, []).get(k)!).push(n);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes, filter]);

  return (
    <PageShell title="Knowledge" subtitle={`${notes.length} note${notes.length === 1 ? '' : 's'} · graph & vault`}>
      {!workspacePath ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "#4A4A65" }}>
          <div style={{ fontSize: 12 }}>Open a folder to view its knowledge vault.</div>
        </div>
      ) : notes.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "#4A4A65" }}>
          <div style={{ fontSize: 12 }}>No notes yet — the vault lives in <code style={{ fontFamily: "JetBrains Mono, monospace" }}>.apex/vault/</code>.</div>
        </div>
      ) : (
        <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
          {/* Graph */}
          <div style={{ flex: 1, minWidth: 0, borderRight: "1px solid #1A1A28", position: "relative" }}>
            <GraphView notes={notes} onOpen={open} />
          </div>
          {/* Notes list */}
          <div style={{ width: 290, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: 10, flexShrink: 0 }}>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter notes…"
                style={{ width: "100%", background: "#0A0A0F", border: "1px solid #252535", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#E2E2EC", outline: "none" }} />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
              {grouped.map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#6A6A85", textTransform: "uppercase" }}>
                    <CategoryIcon cat={cat as NoteCategory} size={12} /> {cat} <span style={{ color: "#3A3A4D" }}>{items.length}</span>
                  </div>
                  {items.map((n) => (
                    <button key={n.path} onClick={() => open(n.path)} title={n.title}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 10px", fontSize: 12, color: "#C7C7D9", background: "none", border: "none", cursor: "pointer", borderRadius: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      className="hover:!bg-[#16161F]">
                      {n.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
