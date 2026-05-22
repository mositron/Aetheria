import React from "react";
import { useT } from "../locales/useT";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

const SEVERITY_COLORS = {
  danger: {
    button: "bg-rose-600 hover:bg-rose-500 border-rose-400",
    border: "border-rose-400/60",
    icon: "text-rose-300",
  },
  warning: {
    button: "bg-amber-600 hover:bg-amber-500 border-amber-400",
    border: "border-amber-400/60",
    icon: "text-amber-300",
  },
  info: {
    button: "bg-cyan-600 hover:bg-cyan-500 border-cyan-400",
    border: "border-cyan-400/60",
    icon: "text-cyan-300",
  },
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  severity = "info",
  onConfirm,
  onCancel,
}: Props) {
  const t = useT();
  const resolvedConfirmLabel = confirmLabel ?? t("confirm.ok");
  const resolvedCancelLabel = cancelLabel ?? t("confirm.cancel");

  if (!open) return null;

  const colors = SEVERITY_COLORS[severity];

  return (
    <div
      data-no-screen-joy
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className={`w-[20rem] max-w-[90vw] rounded-2xl border-2 ${colors.border} bg-slate-900/90 backdrop-blur-md shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <span className={`text-2xl ${colors.icon}`}>
            {severity === "danger" ? "⚠️" : severity === "warning" ? "🔔" : "ℹ️"}
          </span>
          <h2 className="text-sm font-bold text-white">{title}</h2>
        </div>

        {/* Message */}
        <div className="px-5 pb-4">
          <p className="text-xs text-slate-300 leading-relaxed">{message}</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-xs font-bold border-2 border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:border-slate-500 transition"
          >
            {resolvedCancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 ${colors.button} text-white transition`}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}