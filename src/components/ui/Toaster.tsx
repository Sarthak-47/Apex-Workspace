import { useAppStore, type Toast } from "@/store";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

// ─── Toast Item ───────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  info: {
    icon: <Info size={14} strokeWidth={1.8} />,
    color: "var(--accent)",
    bg: "#1A1A3A",
    border: "#6366F140",
  },
  success: {
    icon: <CheckCircle size={14} strokeWidth={1.8} />,
    color: "#22C55E",
    bg: "#0D1F14",
    border: "#22C55E40",
  },
  error: {
    icon: <AlertCircle size={14} strokeWidth={1.8} />,
    color: "#EF4444",
    bg: "#1F0D0D",
    border: "#EF444440",
  },
  warning: {
    icon: <AlertTriangle size={14} strokeWidth={1.8} />,
    color: "#F59E0B",
    bg: "#1F1A0D",
    border: "#F59E0B40",
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismissToast } = useAppStore();
  const config = TYPE_CONFIG[toast.type];

  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-[12px] shadow-lg animate-in slide-in-from-right-2 duration-200"
      style={{
        background: config.bg,
        borderColor: config.border,
        minWidth: "280px",
        maxWidth: "400px",
      }}
    >
      <span style={{ color: config.color }} className="flex-shrink-0 mt-0.5">
        {config.icon}
      </span>
      <p className="flex-1 text-[#E2E2EC] leading-relaxed">{toast.message}</p>
      <button
        onClick={() => dismissToast(toast.id)}
        className="flex-shrink-0 text-[#4A4A65] hover:text-[#8888A8] transition-colors mt-0.5"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

// ─── Toaster ──────────────────────────────────────────────────────────────────

export function Toaster() {
  const { toasts } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      style={{ zIndex: 9999 }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
}
