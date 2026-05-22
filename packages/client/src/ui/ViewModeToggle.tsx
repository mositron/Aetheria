import { useEffect } from "react";
import { useStore } from "../store";

/** Small icon button in the HUD to toggle between 3D and 2D view modes. */
export function ViewModeToggle() {
  const viewMode = useStore((s) => s.viewMode);
  const toggleViewMode = useStore((s) => s.toggleViewMode);

  // Keyboard shortcut: V key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "v" || e.key === "V") toggleViewMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleViewMode]);

  return (
    <button
      onClick={toggleViewMode}
      title={`Switch to ${viewMode === "3d" ? "2D" : "3D"} view (V)`}
      className={`
        flex items-center gap-1 px-2 py-1 rounded text-xs font-bold border transition-all
        ${viewMode === "3d"
          ? "bg-slate-700/60 border-slate-500/50 text-slate-200 hover:border-slate-400"
          : "bg-cyan-600/30 border-cyan-500/50 text-cyan-300 hover:border-cyan-400"
        }
      `}
    >
      <span>{viewMode === "3d" ? "👁 3D" : "👁 2D"}</span>
      <span className="text-[10px] opacity-60">V</span>
    </button>
  );
}