import { useEffect, useState } from "react";
import { keyEq } from "../utils/keyMatch";
import { useT } from "../locales/useT";
import { useExclusiveModal } from "../hooks/useExclusiveModal";

type Filter = "none" | "vintage" | "dream" | "anime" | "neon";

const FILTERS: Record<Filter, { icon: string; cssFilter: string }> = {
  none:    { icon: "🌈", cssFilter: "none" },
  vintage: { icon: "📷", cssFilter: "sepia(0.5) contrast(1.1) saturate(1.2)" },
  dream:   { icon: "☁",  cssFilter: "blur(0.4px) brightness(1.15) saturate(1.3) hue-rotate(-10deg)" },
  anime:   { icon: "🌸", cssFilter: "saturate(1.6) contrast(1.15) brightness(1.05)" },
  neon:    { icon: "💜", cssFilter: "saturate(2) contrast(1.3) hue-rotate(20deg)" },
};

/** Photo mode — hides UI overlays, applies a CSS filter, lets user save a screenshot. */
export function PhotoMode() {
  const t = useT();
  const [open, setOpen] = useState(false);
  useExclusiveModal("photoMode", open, setOpen);
  const [filter, setFilter] = useState<Filter>("anime");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (keyEq(e, "p")) setOpen((o) => !o);
      else if (e.key === "Escape" && open) setOpen(false);
    };
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("keydown", onKey);
    window.addEventListener("toggle-photo", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("toggle-photo", onToggle);
    };
  }, [open]);

  // When open, hide all other UI by toggling a body class
  useEffect(() => {
    if (open) document.body.classList.add("photo-mode");
    else document.body.classList.remove("photo-mode");
    return () => document.body.classList.remove("photo-mode");
  }, [open]);

  async function capture() {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const f = FILTERS[filter];
    // Render canvas with filter onto a temporary canvas
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d")!;
    ctx.filter = f.cssFilter;
    ctx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aetheria-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  if (!open) return null;

  return (
    <>
      {/* Filter the canvas (background scene) */}
      <style>{`
        canvas { filter: ${FILTERS[filter].cssFilter}; }
        body.photo-mode > #root > div > :not(.photo-toolbar):not(div:has(> canvas)) { display: none !important; }
        body.photo-mode .photo-toolbar { display: flex !important; }
      `}</style>

      <div className="photo-toolbar absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 select-none">
        <div className="text-white font-bold text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {t("photo.title")}
        </div>
        <div className="flex gap-2 p-2 rounded-full" style={{
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          border: "2px solid rgba(255,255,255,0.3)",
        }}>
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              onTouchStart={(e) => { e.preventDefault(); setFilter(f); }}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-full border-2 transition ${
                filter === f ? "border-amber-300 bg-amber-500/30 scale-110" : "border-white/30 bg-black/30 hover:border-white/60"
              }`}
            >
              <span className="text-lg">{FILTERS[f].icon}</span>
              <span className="text-[9px] text-white font-bold">{t(`photo.filter${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={capture} className="btn-game text-base">{t("photo.save")}</button>
          <button onClick={() => setOpen(false)} className="btn-game muted text-base">{t("photo.close")}</button>
        </div>
      </div>
    </>
  );
}
