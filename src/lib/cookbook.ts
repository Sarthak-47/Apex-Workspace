/**
 * Model Cookbook (Odysseus-inspired): a curated catalog of local models with
 * approximate VRAM needs, plus VRAM-fit scoring against detected hardware.
 */
import type { HardwareInfo } from './tauri';

export type ModelRole = 'coding' | 'general' | 'embedding' | 'autocomplete' | 'vision';

export interface CatalogModel {
  name: string;        // ollama tag
  label: string;
  role: ModelRole;
  params: string;      // e.g. "7B"
  quant: string;       // e.g. "Q4_K_M"
  vramGb: number;      // approx VRAM to run fully on-GPU
  contextK: number;
  note: string;
}

export const MODEL_CATALOG: CatalogModel[] = [
  { name: 'qwen2.5-coder:7b',   label: 'Qwen 2.5 Coder 7B',  role: 'coding', params: '7B',  quant: 'Q4_K_M', vramGb: 5.5,  contextK: 32, note: 'Best all-round local coder; strong function calling' },
  { name: 'qwen2.5-coder:14b',  label: 'Qwen 2.5 Coder 14B', role: 'coding', params: '14B', quant: 'Q4_K_M', vramGb: 9.5,  contextK: 32, note: 'Stronger reasoning; fits 8GB with light CPU offload' },
  { name: 'qwen2.5-coder:3b',   label: 'Qwen 2.5 Coder 3B',  role: 'coding', params: '3B',  quant: 'Q4_K_M', vramGb: 2.6,  contextK: 32, note: 'Fast; good for modest GPUs' },
  { name: 'llama3.1:8b',        label: 'Llama 3.1 8B',       role: 'general', params: '8B', quant: 'Q4_K_M', vramGb: 5.8,  contextK: 128, note: 'General reasoning + tool use' },
  { name: 'deepseek-coder-v2:16b', label: 'DeepSeek Coder V2 16B', role: 'coding', params: '16B', quant: 'Q4_K_M', vramGb: 10.5, contextK: 128, note: 'Excellent coder; needs ~10GB+' },
  { name: 'qwen2.5:3b',         label: 'Qwen 2.5 3B',        role: 'autocomplete', params: '3B', quant: 'Q4_K_M', vramGb: 2.4, contextK: 32, note: 'Low-latency inline autocomplete' },
  { name: 'nomic-embed-text',   label: 'Nomic Embed Text',   role: 'embedding', params: '137M', quant: 'F16', vramGb: 0.5, contextK: 8, note: 'Codebase + vault embeddings' },
  { name: 'qwen2.5vl:7b',       label: 'Qwen 2.5 VL 7B',     role: 'vision',  params: '7B',  quant: 'Q4_K_M', vramGb: 6.5, contextK: 32, note: 'Vision — read screenshots/diagrams' },
];

export type Fit = 'fits' | 'tight' | 'cpu';

export interface Recommendation extends CatalogModel { fit: Fit; score: number }

/** Score the catalog against detected VRAM. Higher score = better fit + capability. */
export function recommend(hw: HardwareInfo | null): Recommendation[] {
  const vramGb = hw?.vram_mb ? hw.vram_mb / 1024 : null;
  return MODEL_CATALOG.map(m => {
    let fit: Fit;
    if (vramGb == null) fit = 'cpu';
    else if (m.vramGb <= vramGb - 0.8) fit = 'fits';
    else if (m.vramGb <= vramGb + 1.5) fit = 'tight';
    else fit = 'cpu';
    // prefer fully-fitting larger models; embeddings always recommended
    const fitScore = fit === 'fits' ? 100 : fit === 'tight' ? 60 : 20;
    const capScore = m.role === 'embedding' ? 50 : Math.min(40, m.vramGb * 4);
    return { ...m, fit, score: fitScore + capScore };
  }).sort((a, b) => b.score - a.score);
}

export const FIT_LABEL: Record<Fit, { label: string; color: string }> = {
  fits:  { label: 'Fits on GPU',  color: '#22C55E' },
  tight: { label: 'Tight / offload', color: '#F59E0B' },
  cpu:   { label: 'CPU / slow',   color: '#EF4444' },
};
