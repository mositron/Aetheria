// Dismissible legend of the game's real current keybinds — pulled from the
// actual handlers (Scene.tsx, Inventory.tsx, CraftingPanel.tsx, etc.), not
// guessed. New players previously had to hover every icon (useless on touch)
// or guess entirely on mobile; this is a single reachable reference.

import { useT } from "../locales/useT";

const ROWS: Array<{ key: string; textKey: string }> = [
  { key: "WASD", textKey: "keybinds.move" },
  { key: "Space", textKey: "keybinds.jump" },
  { key: "I", textKey: "keybinds.inventory" },
  { key: "K", textKey: "keybinds.crafting" },
  { key: "Q", textKey: "keybinds.quests" },
  { key: "M", textKey: "keybinds.map" },
  { key: "C", textKey: "keybinds.stats" },
  { key: "O", textKey: "keybinds.settings" },
  { key: "T", textKey: "keybinds.emote" },
  { key: "P", textKey: "keybinds.photo" },
  { key: "V", textKey: "keybinds.viewMode" },
  { key: "F", textKey: "keybinds.pickup" },
  { key: "H", textKey: "keybinds.quickHeal" },
  { key: "B", textKey: "keybinds.autoBot" },
  { key: "Esc", textKey: "keybinds.close" },
];

export function KeybindLegend({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl p-4 w-[min(22rem,92vw)] max-h-[80vh] overflow-y-auto"
        style={{
          background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))",
          border: "1px solid rgba(34, 211, 238, 0.5)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.6), 0 0 16px rgba(34,211,238,0.25)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-cyan-300 font-bold text-sm">⌨ {t("keybinds.title")}</div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 text-sm font-bold"
            aria-label={t("common.close")}
          >✕</button>
        </div>
        <div className="grid grid-cols-1 gap-1">
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center gap-2 text-xs">
              <span
                className="shrink-0 min-w-[3rem] text-center px-1.5 py-0.5 rounded-md font-mono font-bold text-cyan-100"
                style={{ background: "rgba(34,211,238,0.14)", border: "1px solid rgba(34,211,238,0.35)" }}
              >{r.key}</span>
              <span className="text-white/80">{t(r.textKey)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
