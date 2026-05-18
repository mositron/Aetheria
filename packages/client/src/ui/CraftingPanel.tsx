import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { RECIPES, ITEMS, type Recipe, type Player, type WorldState } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { keyEq } from "../utils/keyMatch";

const CATEGORIES: Array<{ id: Recipe["category"]; label: string; icon: string }> = [
  { id: "cooking", label: "ปรุง",  icon: "🍖" },
  { id: "potion",  label: "ยา",    icon: "🧪" },
  { id: "weapon",  label: "อาวุธ", icon: "⚔" },
  { id: "armor",   label: "ชุด",   icon: "🛡" },
];

export function CraftingPanel({ room }: { room: Room<WorldState> }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<Recipe["category"]>("cooking");
  const [, setTick] = useState(0);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-craft", onToggle);
    return () => window.removeEventListener("toggle-craft", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape" && open) setOpen(false);
      if (keyEq(e, "k") && !open) setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;

  // Build count map of player's inventory
  const have: Record<string, number> = {};
  for (const s of me.inventory.values()) {
    have[s.itemId] = (have[s.itemId] ?? 0) + s.qty;
  }

  const filtered = RECIPES.filter((r) => r.category === cat);

  return (
    <div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4" onClick={() => setOpen(false)}>
      <div className="w-[28rem] max-w-[94vw] flex flex-col min-h-0" style={{ maxHeight: "calc(100vh - 8rem)" }} onClick={(e) => e.stopPropagation()}>
        <GameFrame
          title="ห้องช่างไม้-เตาตี"
          variant="violet"
          className="flex flex-col min-h-0"
          innerClassName="flex flex-col flex-1 min-h-0"
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10"
          >
            ✕
          </button>

          {/* Category tabs — fixed at top */}
          <div className="grid grid-cols-4 gap-1 mt-1 mb-3 flex-shrink-0">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`py-2 text-xs uppercase tracking-wider border-2 transition flex flex-col items-center ${
                  cat === c.id
                    ? "border-violet-400 bg-violet-500/20 text-white"
                    : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-violet-400/50"
                }`}
              >
                <span className="text-lg">{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Recipe list — scrollable */}
          <div className="space-y-2 overflow-y-auto game-scroll violet flex-1 pr-1" style={{ minHeight: 0 }}>
            {filtered.length === 0 && (
              <div className="text-center text-slate-400 text-sm py-6">ยังไม่มีสูตรในหมวดนี้</div>
            )}
            {filtered.map((r) => {
              const outDef = ITEMS[r.output.itemId];
              const canMake = r.inputs.every((i) => (have[i.itemId] ?? 0) >= i.qty);
              const levelOk = !r.minLevel || me.level >= r.minLevel;
              const disabled = !canMake || !levelOk;
              return (
                <div
                  key={r.id}
                  className="border-2 border-slate-700 bg-slate-900/70 p-2.5 rounded"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{r.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{r.name}</div>
                      <div className="text-[10px] text-slate-400">{r.desc}</div>
                    </div>
                    <span className="text-xs text-amber-200">
                      → {outDef?.icon} ×{r.output.qty}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {r.inputs.map((inp, i) => {
                      const def = ITEMS[inp.itemId];
                      const has = have[inp.itemId] ?? 0;
                      const ok = has >= inp.qty;
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${
                            ok ? "border-emerald-400/50 bg-emerald-900/20 text-emerald-200" : "border-rose-400/50 bg-rose-900/20 text-rose-200"
                          }`}
                        >
                          <span>{def?.icon}</span>
                          <span className="font-bold tabular-nums">{has}/{inp.qty}</span>
                        </div>
                      );
                    })}
                  </div>
                  {!levelOk && (
                    <div className="text-[10px] text-rose-300 mb-1">ต้องเลเวล {r.minLevel}</div>
                  )}
                  <button
                    onClick={() => room.send("craft", { recipeId: r.id })}
                    disabled={disabled}
                    className="w-full py-1.5 rounded font-bold text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {disabled ? (!levelOk ? `🔒 Lv ${r.minLevel}` : "ขาดวัตถุดิบ") : "🔨 สร้าง"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-slate-400 text-center mt-2 pt-2 border-t border-violet-400/20 flex-shrink-0">
            กด K เพื่อเปิด/ปิด · Esc ปิด
          </div>
        </GameFrame>
      </div>
    </div>
  );
}
