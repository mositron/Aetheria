import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { RECIPES, ITEMS, CRAFTING_BENCHES, QUALITY_COLORS, QUALITY_NAMES, type Recipe, type Player, type WorldState, type ItemQuality } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { keyEq } from "../utils/keyMatch";
import { useT } from "../locales/useT";

const CATEGORIES = [
  { id: "cooking", label: () => t("craft.categoryCooking"),  icon: "🍖" },
  { id: "potion",  label: () => t("craft.categoryPotion"),   icon: "🧪" },
  { id: "weapon",  label: () => t("craft.categoryWeapon"),   icon: "⚔" },
  { id: "armor",   label: () => t("craft.categoryArmor"),    icon: "🛡" },
];

type Tab = "craft" | "research";

function qualityChanceBar(qc: Recipe["qualityChance"], benchBonus: number, t: ReturnType<typeof useT>): Array<{ label: string; pct: number; color: string }> {
  if (!qc) return [{ label: t("craft.common"), pct: 100, color: QUALITY_COLORS.normal }];
  const bars: Array<{ label: string; pct: number; color: string }> = [];
  const superior = (qc.superior ?? 0) + benchBonus * 0.25;
  const rare = (qc.rare ?? 0) + benchBonus * 0.15;
  const masterwork = (qc.masterwork ?? 0) + benchBonus * 0.1;
  const legendary = (qc.legendary ?? 0) + benchBonus * 0.05;
  const normal = Math.max(0, 1 - superior - rare - masterwork - legendary);
  if (legendary > 0) bars.push({ label: t("craft.legendary"), pct: legendary * 100, color: QUALITY_COLORS.legendary });
  if (masterwork > 0) bars.push({ label: t("craft.masterwork"), pct: masterwork * 100, color: QUALITY_COLORS.masterwork });
  if (rare > 0) bars.push({ label: t("craft.rare"), pct: rare * 100, color: QUALITY_COLORS.rare });
  if (superior > 0) bars.push({ label: t("craft.superior"), pct: superior * 100, color: QUALITY_COLORS.superior });
  if (normal > 0) bars.push({ label: t("craft.common"), pct: normal * 100, color: QUALITY_COLORS.normal });
  return bars;
}

export function CraftingPanel({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<Recipe["category"]>("cooking");
  const [benchIdx, setBenchIdx] = useState(0);
  const [tab, setTab] = useState<Tab>("craft");
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

  const have: Record<string, number> = {};
  for (const s of me.inventory.values()) {
    have[s.itemId] = (have[s.itemId] ?? 0) + s.qty;
  }

  const bench = CRAFTING_BENCHES[benchIdx];
  const benchBonus = bench?.qualityBonus ?? 0;
  const filtered = RECIPES.filter((r) => r.category === cat && r.discovered);
  const researchRecipes = RECIPES.filter((r) => !r.discovered && r.discoveryMethod === "research");
  const playerUnlocked: string[] = [];
  let skillPoints = 0;
  try { skillPoints = (me as any).skillPoints ?? 0; } catch {}

  return (
    <div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4" onClick={() => setOpen(false)}>
      <div className="w-[30rem] max-w-[94vw] flex flex-col min-h-0" style={{ maxHeight: "calc(100vh - 8rem)" }} onClick={(e) => e.stopPropagation()}>
        <GameFrame
          title={t("craft.title")}
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

          {/* Main tabs: Craft / Research */}
          <div className="grid grid-cols-2 gap-1 mt-1 mb-3 flex-shrink-0">
            <button
              onClick={() => setTab("craft")}
              className={`py-2 text-xs uppercase tracking-wider border-2 transition flex items-center justify-center gap-1 ${
                tab === "craft" ? "border-violet-400 bg-violet-500/20 text-white" : "border-slate-700 bg-slate-900/70 text-slate-300"
              }`}
            >
              🔨 คราฟต์
            </button>
            <button
              onClick={() => setTab("research")}
              className={`py-2 text-xs uppercase tracking-wider border-2 transition flex flex-col items-center ${
                tab === "research" ? "border-amber-400 bg-amber-500/20 text-white" : "border-slate-700 bg-slate-900/70 text-slate-300"
              }`}
            >
              <span>📜 วิจัย</span>
              <span className="text-[9px] opacity-70">({(me as any).researchPoints ?? 0} แต้ม)</span>
            </button>
          </div>

          {tab === "craft" ? (
            <>
              {/* Bench selector */}
              <div className="flex gap-1 mb-3 flex-shrink-0">
                {CRAFTING_BENCHES.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => setBenchIdx(i)}
                    className={`flex-1 py-1 px-1 rounded border text-[10px] text-center transition ${
                      benchIdx === i ? "border-amber-400 bg-amber-500/20 text-white" : "border-slate-700 bg-slate-900/60 text-slate-400"
                    }`}
                    title={`${b.nameTh} — quality +${Math.round(b.qualityBonus * 100)}%`}
                  >
                    {b.nameTh}
                  </button>
                ))}
              </div>

              {/* Category tabs */}
              <div className="grid grid-cols-4 gap-1 mb-3 flex-shrink-0">
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
                    <span>{c.label()}</span>
                  </button>
                ))}
              </div>

              {/* Recipe list */}
              <div className="space-y-2 overflow-y-auto game-scroll violet flex-1 pr-1" style={{ minHeight: 0 }}>
                {filtered.length === 0 && (
                  <div className="text-center text-slate-400 text-sm py-6">ไม่มีสูตรในหมวดนี้</div>
                )}
                {filtered.map((r) => {
                  const outDef = ITEMS[r.output.itemId];
                  const canMake = r.inputs.every((i) => (have[i.itemId] ?? 0) >= i.qty);
                  const levelOk = !r.minLevel || me.level >= r.minLevel;
                  const benchOk = (r.minBenchTier ?? 0) <= (bench?.minTier ?? 0);
                  const disabled = !canMake || !levelOk || !benchOk;
                  const bars = qualityChanceBar(r.qualityChance, benchBonus, t);
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

                      {/* Quality probability bars */}
                      {bars.length > 0 && bars.some(b => b.pct < 100) && (
                        <div className="flex gap-0.5 mb-2 h-1.5 rounded overflow-hidden">
                          {bars.map((b) => (
                            <div
                              key={b.label}
                              title={`${b.label}: ${b.pct.toFixed(1)}%`}
                              className="h-full rounded-sm transition-all"
                              style={{ width: `${b.pct}%`, background: b.color }}
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mb-2">
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
                      {!levelOk && <div className="text-[10px] text-rose-300 mb-1">ต้องเลเวล {r.minLevel}</div>}
                      {!benchOk && <div className="text-[10px] text-amber-300 mb-1">ต้องใช้เตาหลอม: {CRAFTING_BENCHES[r.minBenchTier ?? 0]?.nameTh}</div>}
                      <button
                        onClick={() => room.send("craft", { recipeId: r.id, benchTier: bench?.minTier ?? 0 })}
                        disabled={disabled}
                        className="w-full py-1.5 rounded font-bold text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {disabled ? (!levelOk ? `🔒 Lv ${r.minLevel}` : !benchOk ? `🔒 ${CRAFTING_BENCHES[r.minBenchTier ?? 0]?.nameTh}` : "ขาดวัตถุดิบ") : "🔨 สร้าง"}
                      </button>
                    </div>
                  );
                })}
              </div>
              </>
          ) : (
            /* Research tab */
            <div className="flex-1 overflow-y-auto game-scroll violet pr-1">
              <div className="mb-3 p-3 rounded-xl bg-amber-900/20 border border-amber-400/40 text-sm">
                <div className="text-amber-200 font-bold mb-1">📜 วิจัยสูตรใหม่</div>
                <div className="text-amber-100/70 text-xs">
                  ใช้ <span className="text-amber-300 font-bold">100 แต้มวิจัย</span> เพื่อค้นพบสูตรสุ่ม 1 ชุด<br />
                  แต้มวิจัยสะสม +10 ต่อชั่วโมง (แม้ออฟไลน์)
                </div>
                <div className="mt-2 text-amber-200 text-xs">
                  แต้มวิจัยปัจจุบัน: <span className="font-bold text-amber-300">{(me as any).researchPoints ?? 0}</span>
                </div>
                <button
                  onClick={() => room.send("researchDiscover")}
                  disabled={((me as any).researchPoints ?? 0) < 100}
                  className="mt-2 w-full py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm"
                >
                  🔍 ค้นพบสูตร (100 แต้ม)
                </button>
              </div>
              <div className="text-slate-400 text-xs mb-2">สูตรที่รอค้นพบ: {researchRecipes.length} ชุด</div>
              <div className="space-y-2">
                {researchRecipes.map((r) => (
                  <div key={r.id} className="border border-slate-700 bg-slate-900/60 rounded p-2 flex items-center gap-2 opacity-50">
                    <span className="text-xl">{r.icon}</span>
                    <div className="flex-1">
                      <div className="text-white text-sm">{r.name}</div>
                      <div className="text-slate-500 text-[10px]">{r.category}</div>
                    </div>
                    <span className="text-amber-400 text-xs">?</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-slate-400 text-center mt-2 pt-2 border-t border-violet-400/20 flex-shrink-0">
            กด K เพื่อเปิด/ปิด · Esc ปิด
          </div>
        </GameFrame>
      </div>
    </div>
  );
}