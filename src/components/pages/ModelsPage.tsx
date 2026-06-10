import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { hardwareInfo, type HardwareInfo } from "@/lib/tauri";
import { recommend, FIT_LABEL, MODEL_CATALOG } from "@/lib/cookbook";
import { PageShell } from "./PageShell";

export function ModelsPage() {
  const { ollamaOnline, ollamaModels, setCookbookOpen, setCompareOpen } = useAppStore();
  const [hw, setHw] = useState<HardwareInfo | null>(null);

  useEffect(() => { hardwareInfo().then(setHw).catch(() => {}); }, []);

  const recs = useMemo(() => recommend(hw), [hw]);
  const installed = (name: string) => ollamaModels.some((m) => m.split(':')[0] === name.split(':')[0]);

  const actions = (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => setCookbookOpen(true)} style={btn}>Cookbook</button>
      <button onClick={() => setCompareOpen(true)} style={btn}>Blind Compare</button>
    </div>
  );

  return (
    <PageShell title="Models" subtitle="Recommended local models for your hardware" actions={actions}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 24px 40px" }}>
        {/* Hardware + Ollama */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
          <Pill label={ollamaOnline ? `Ollama online · ${ollamaModels.length} installed` : "Ollama offline"} dot={ollamaOnline ? "#22C55E" : "#4A4A65"} />
          {hw && <Pill label={`${hw.gpu || "CPU only"}${hw.vram_mb ? ` · ${(hw.vram_mb / 1024).toFixed(0)} GB VRAM` : ""}`} />}
          {hw && <Pill label={`${(hw.ram_mb / 1024).toFixed(0)} GB RAM`} />}
        </div>

        <SectionTitle>RECOMMENDED</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recs.map((m) => {
            const fit = FIT_LABEL[m.fit];
            return (
              <div key={m.name} style={card}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#E6E6F0", display: "flex", alignItems: "center", gap: 8 }}>
                    {m.name}
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, color: fit.color, background: `${fit.color}22`, fontWeight: 600 }}>{fit.label}</span>
                    {installed(m.name) && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, color: "#22C55E", background: "#22C55E22", fontWeight: 600 }}>INSTALLED</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#6A6A85", marginTop: 2 }}>{m.role} · {m.params} · {m.vramGb} GB VRAM · {m.note}</div>
                </div>
              </div>
            );
          })}
        </div>

        <SectionTitle style={{ marginTop: 26 }}>FULL CATALOG</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {MODEL_CATALOG.map((m) => (
            <div key={m.name} style={{ ...card, padding: "9px 12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#C7C7D9" }}>{m.name}</div>
                <div style={{ fontSize: 10, color: "#6A6A85" }}>{m.role} · {m.params}</div>
              </div>
              {installed(m.name) && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

const btn: React.CSSProperties = { height: 28, padding: "0 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#1A1A3A", border: "1px solid #6366F140", color: "#A5B4FC" };
const card: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 9, background: "#13131B", border: "1px solid #252535" };

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "#6A6A85", marginBottom: 10, ...style }}>{children}</div>;
}
function Pill({ label, dot }: { label: string; dot?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 20, background: "#13131B", border: "1px solid #252535", fontSize: 11, color: "#9A9AB5" }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />}{label}
    </span>
  );
}
