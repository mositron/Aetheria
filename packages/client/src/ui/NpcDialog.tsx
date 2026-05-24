import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import FocusTrap from "focus-trap-react";
import { ITEMS, NPCS, QUESTS, QUESTS_BY_GIVER, HOUSE_COST, type Player, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { useQuests } from "../hooks/useQuests";
import { useT } from "../locales/useT";

export function NpcDialog({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const npcId = useStore((s) => s.activeNpcId);
  const close = () => useStore.setState({ activeNpcId: null });
  const [tab, setTab] = useState<"buy" | "sell" | "quests">("buy");
  const [err, setErr] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const quests = useQuests(room);

const [buying, setBuying] = useState<string | null>(null);
  const [turningIn, setTurningIn] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (!npcId) return;
    setBuying(null); setTurningIn(null); setBuilding(false);
    setErr(null);
    // Pick first applicable tab so non-shop NPCs don't render an empty buy view.
    const n = NPCS.find((x) => x.id === npcId);
    const giverQuests = n ? (QUESTS_BY_GIVER[n.id] ?? []) : [];
    setTab(n?.kind === "shop" ? "buy" : giverQuests.length > 0 ? "quests" : "buy");
    const off = room.onMessage("shopError", (m: any) => setErr(m.reason));
    const offBuyOk = room.onMessage("shopBuyOk" as any, () => { setBuying(null); setErr(null); });
    const offQuestOk = room.onMessage("questReward" as any, () => { setTurningIn(null); });
    return () => { off?.(); offBuyOk?.(); offQuestOk?.(); };
  }, [npcId, room]);

  useEffect(() => {
    if (!npcId) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [npcId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape" && npcId) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [npcId]);

  if (!npcId) return null;
  const npc = NPCS.find((n) => n.id === npcId);
  if (!npc) return null;
  const me: Player | undefined = room.state.players.get(room.sessionId);
  const tooFar = me && Math.hypot(me.pos.x - npc.x, me.pos.z - npc.z) > 4;
  const npcQuestIds = QUESTS_BY_GIVER[npc.id] ?? [];

return (
    <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
    <div data-no-screen-joy className="panel absolute inset-x-0 bottom-32 mx-auto w-[20rem] sm:w-[24rem] md:w-[28rem] space-y-2">
      <div className="panel-corners" />
      <div className="panel-title">
        <span>{npc.icon} {npc.name}</span>
        <span className="flex items-center gap-2">
          <span className="normal-case text-yellow-200">💰 {me?.zeny ?? 0}z</span>
          <button onClick={close} aria-label={t("npc.close")}>✕</button>
        </span>
      </div>
      <div className="text-[11px] text-slate-300 italic">"{npc.dialog}"</div>

      {tooFar && <div className="text-rose-400 text-sm">Walk closer to interact.</div>}

      {!tooFar && npc.id === "carpenter_field" && me && <CarpenterPanel room={room} me={me} building={building} setBuilding={setBuilding} />}
      {!tooFar && npc.id === "tutor_field" && <TutorialPanel />}
      {!tooFar && npc.id === "blacksmith_field" && me && <EnchantPanel room={room} me={me} />}
      {!tooFar && npc.id === "waypoint_npc_field" && me && <WaypointPanel room={room} me={me} />}
      {!tooFar && npc.kind === "warp" && (
        <div className="space-y-2">
          <button
            onClick={() => {
              const target = npc.id === "warp_shadow" ? "dungeon" : npc.id === "warp_frost" ? "dungeon" : "dungeon";
              room.send("enterDungeon" as any, { floor: 1 });
              close();
            }}
            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold py-2 rounded"
          >
            🌀 {t("npc.enter") || "เข้าสู่ดันเจี้ยน"}
          </button>
        </div>
      )}

      {!tooFar && (
        <>
          <div className="flex gap-1 text-sm">
            {npc.kind === "shop" && <button onClick={() => setTab("buy")} className={`px-3 py-1 rounded ${tab === "buy" ? "bg-amber-600" : "bg-slate-700"}`}>Buy</button>}
            {npc.kind === "shop" && <button onClick={() => setTab("sell")} className={`px-3 py-1 rounded ${tab === "sell" ? "bg-amber-600" : "bg-slate-700"}`}>Sell</button>}
            {npcQuestIds.length > 0 && <button onClick={() => setTab("quests")} className={`px-3 py-1 rounded ${tab === "quests" ? "bg-amber-600" : "bg-slate-700"}`}>Quests ({npcQuestIds.length})</button>}
            {err && <div className="ml-auto text-rose-400">{err}</div>}
          </div>

          {tab === "buy" && npc.kind === "shop" && npc.shop && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {npc.shop.map((e) => {
                const def = ITEMS[e.itemId];
                const canAfford = (me?.zeny ?? 0) >= e.price;
                return (
                  <div key={e.itemId} className="flex items-center gap-2 bg-slate-800 rounded p-2 text-sm">
                    <span className="text-xl w-8 text-center">{def?.icon}</span>
                    <div className="flex-1">
                      <div>{def?.name}</div>
                      <div className="text-xs text-slate-400">
                        {def?.atk ? `+${def.atk} ATK` : def?.def ? `+${def.def} DEF` : def?.hpRestore ? `+${def.hpRestore} HP` : ""}
                      </div>
                    </div>
                    <div className="text-yellow-300 text-sm">{e.price}z</div>
                    <button
                      disabled={!canAfford || buying === e.itemId}
                      onClick={() => { setErr(null); setBuying(e.itemId); room.send("shopBuy", { npcId: npc.id, itemId: e.itemId, qty: 1 }); }}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-50 px-3 py-1 rounded text-xs"
                    >{buying === e.itemId ? "..." : "Buy"}</button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "sell" && me && npc.kind === "shop" && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {/* Bulk-sell shortcuts (sit at top of the sell list) */}
              <div className="flex gap-1.5 mb-1.5 sticky top-0 bg-slate-900/90 backdrop-blur-sm py-1 z-10">
                <button
onClick={() => {
                    if (!confirm(t("npc.confirmSellMaterials"))) return;
                    setErr(null); room.send("shopSellMany", { npcId: npc.id, sellAllMaterials: true });
                  }}
                  className="flex-1 bg-amber-700/70 hover:bg-amber-600 border border-amber-400/40 rounded px-2 py-1.5 text-[11px] font-bold text-white"
                >
                  💼 {t("npc.sellAllMaterials")}
                </button>
                <button
onClick={() => {
                    if (!confirm(t("npc.confirmSellJunk"))) return;
                    setErr(null); room.send("shopSellMany", { npcId: npc.id, sellAllJunk: true });
                  }}
                  className="flex-1 bg-rose-700/70 hover:bg-rose-600 border border-rose-400/40 rounded px-2 py-1.5 text-[11px] font-bold text-white"
                >
                  🗑 {t("npc.sellAllJunk")}
                </button>
              </div>
              {Array.from(me.inventory.values()).length === 0 && <div className="text-slate-500 text-sm">Inventory is empty.</div>}
              {Array.from(me.inventory.values()).map((stack, i) => {
                const def = ITEMS[stack.itemId];
                return (
                  <div key={i} className="flex items-center gap-2 bg-slate-800 rounded p-2 text-sm">
                    <span className="text-xl w-8 text-center">{def?.icon}</span>
                    <div className="flex-1">{def?.name} <span className="text-slate-500">x{stack.qty}</span></div>
                    <button
                      onClick={() => { setErr(null); room.send("shopSell", { npcId: npc.id, invIndex: i, qty: 1 }); }}
                      className="bg-rose-600 hover:bg-rose-500 px-3 py-1 rounded text-[11px]"
                    >×1</button>
                    {stack.qty > 1 && (
                      <button
                        onClick={() => { setErr(null); room.send("shopSell", { npcId: npc.id, invIndex: i, qty: stack.qty }); }}
                        className="bg-rose-700 hover:bg-rose-600 px-2 py-1 rounded text-[11px]"
                      >×{stack.qty}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "quests" && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {npcQuestIds.map((qid) => {
                const q = QUESTS[qid];
                if (!q) return null;
                const isActive = quests.active[qid] !== undefined;
                const isDone = quests.completed.includes(qid);
                const progress = quests.active[qid] ?? 0;
                const goal = q.objective.count;
                const canTurnIn = isActive && progress >= goal;
                return (
                  <div key={qid} className="bg-slate-800 rounded p-2 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{q.name}</span>
                      <span className="text-xs text-amber-300">+{q.reward.exp}xp +{q.reward.zeny}z</span>
                    </div>
                    <div className="text-xs text-slate-400">{q.desc}</div>
                    <div className="text-xs">
                      {q.objective.kind === "kill" ? `Kill ${q.objective.count} ${q.objective.monster}` : `Collect ${q.objective.count} ${q.objective.itemId}`}
                      {isActive && <span className="ml-2 text-amber-300">{progress}/{goal}</span>}
                    </div>
                    {/* Chain hint — if this quest has a `next` field, show it
                        so players see what comes next. */}
                    {(q as any).next && QUESTS[(q as any).next] && (
                      <div className="text-[10px] text-cyan-300 italic">
                        → {t("quest.nextChain") || "เควสต่อไป"}: {QUESTS[(q as any).next].name}
                      </div>
                    )}
                    <div>
                      {isDone && <span className="text-emerald-400 text-xs">✓ Completed</span>}
{!isDone && !isActive && (me?.level ?? 1) >= q.minLevel && (
                        <button
                          onClick={() => { setTurningIn(qid); room.send("questAccept", { questId: qid }); }}
                          disabled={turningIn !== null}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-50 px-2 py-0.5 rounded text-xs"
                        >{turningIn !== null ? "..." : "Accept"}</button>
                      )}
                      {!isDone && !isActive && (me?.level ?? 1) < q.minLevel && (
                        <span className="text-slate-500 text-xs">Requires Lv {q.minLevel}</span>
                      )}
                      {isActive && !canTurnIn && <span className="text-slate-400 text-xs">In progress</span>}
{canTurnIn && (
                        <button
                          onClick={() => { setTurningIn(qid); room.send("questTurnIn", { questId: qid }); }}
                          disabled={turningIn !== null}
                          className="bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:opacity-50 text-black font-bold px-2 py-0.5 rounded text-xs"
                        >{turningIn !== null ? "..." : "Turn in"}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
</>
      )}
    </div>
    </FocusTrap>
  );
}

function TutorialPanel() {
  const t = useT();
  const tips = [
    { icon: "⚔", titleKey: "npc.tipCombat", bodyKey: "npc.tipCombatBody" },
    { icon: "🪵", titleKey: "npc.tipGather", bodyKey: "npc.tipGatherBody" },
    { icon: "🪓", titleKey: "npc.tipTools", bodyKey: "npc.tipToolsBody" },
    { icon: "💧", titleKey: "npc.tipWater", bodyKey: "npc.tipWaterBody" },
    { icon: "🌱", titleKey: "npc.tipFarm", bodyKey: "npc.tipFarmBody" },
    { icon: "🏠", titleKey: "npc.tipHouse", bodyKey: "npc.tipHouseBody" },
    { icon: "🐎", titleKey: "npc.tipPets", bodyKey: "npc.tipPetsBody" },
    { icon: "🔨", titleKey: "npc.tipCrafting", bodyKey: "npc.tipCraftingBody" },
    { icon: "🌙", titleKey: "npc.tipNight", bodyKey: "npc.tipNightBody" },
  ];
  return (
    <div className="bg-cyan-900/30 border border-cyan-400/40 rounded p-2 space-y-1.5 max-h-72 overflow-y-auto game-scroll">
      <div className="text-cyan-100 font-bold text-xs flex items-center gap-1">
        🎓 {t("npc.tutorial")}
      </div>
      <div className="space-y-1">
        {tips.map((tip, i) => (
          <div key={i} className="flex gap-2 items-start text-[11px] py-1 border-b border-white/5 last:border-b-0">
            <span className="text-lg leading-none">{tip.icon}</span>
            <div className="flex-1">
              <div className="font-bold text-amber-200">{t(tip.titleKey)}</div>
              <div className="text-slate-300">{t(tip.bodyKey)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CarpenterPanel({ room, me, building, setBuilding }: { room: Room<WorldState>; me: Player; building: boolean; setBuilding: (v: boolean) => void }) {
  const t = useT();
  let wood = 0, stone = 0;
  for (const s of me.inventory.values()) {
    if (s.itemId === "wood_log") wood += s.qty;
    if (s.itemId === "stone_chunk") stone += s.qty;
  }
  const hasHouse = me.houseSlot >= 0;
  const haveWood = wood >= HOUSE_COST.wood_log;
  const haveStone = stone >= HOUSE_COST.stone_chunk;
  const haveZeny = me.zeny >= HOUSE_COST.zeny;
  const canBuild = !hasHouse && haveWood && haveStone && haveZeny;

if (hasHouse) {
    return (
      <div className="bg-emerald-900/40 border border-emerald-400/40 rounded p-2 text-xs">
        🏠 {t("npc.alreadyHaveHouse", { slot: me.houseSlot })}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-amber-400/30 rounded p-2 space-y-2 text-xs">
      <div className="text-amber-200 font-bold">🏠 {t("npc.carpenterTitle")}</div>
      <div className="grid grid-cols-3 gap-2">
        <CostRow icon="🪵" label={t("npc.costWood")} have={wood} need={HOUSE_COST.wood_log} ok={haveWood} />
        <CostRow icon="🪨" label={t("npc.costStone")} have={stone} need={HOUSE_COST.stone_chunk} ok={haveStone} />
        <CostRow icon="💰" label={t("npc.zeny")} have={me.zeny} need={HOUSE_COST.zeny} ok={haveZeny} />
      </div>
<button
        disabled={!canBuild || building}
        onClick={() => { setBuilding(true); room.send("buildHouse", {}); }}
        className="w-full py-1.5 rounded bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
      >
        {building ? t("npc.building") : "🔨 " + t("npc.buildNow")}
      </button>
    </div>
  );
}

function CostRow({ icon, label, have, need, ok }: { icon: string; label: string; have: number; need: number; ok: boolean }) {
  return (
    <div className={`flex flex-col items-center p-1 rounded border ${ok ? "border-emerald-400/40 bg-emerald-900/20" : "border-rose-400/40 bg-rose-900/20"}`}>
      <div className="text-lg">{icon}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-xs font-bold tabular-nums ${ok ? "text-emerald-300" : "text-rose-300"}`}>
        {have}/{need}
      </div>
    </div>
  );
}

const ENCHANT_COST = 500;

function EnchantPanel({ room, me }: { room: Room<WorldState>; me: Player }) {
  const t = useT();
  const [enchanting, setEnchanting] = useState<{ slot: number; itemId: string } | null>(null);
  const [paying, setPaying] = useState(false);

  const equippable = me.inventory
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => {
      const def = ITEMS[s.itemId];
      return def && (def.slot === "weapon" || def.slot === "armor");
    });

  const startEnchant = (slot: number, itemId: string) => {
    setEnchanting({ slot, itemId });
    room.send("enchant_start", { slot, itemId });
  };

  const payEnchant = () => {
    if (!enchanting) return;
    setPaying(true);
    room.send("enchant_pay", {});
    setTimeout(() => { setEnchanting(null); setPaying(false); }, 500);
  };

  return (
    <div className="bg-slate-900/60 border border-orange-400/30 rounded p-2 space-y-2 text-xs">
      <div className="text-orange-300 font-bold">{t("npc.enchantTitle")}</div>
      {enchanting ? (
        <div className="space-y-1">
          <div className="text-slate-300">🔮 {ITEMS[enchanting.itemId]?.name} — {t("npc.enchantWaiting", { item: ITEMS[enchanting.itemId]?.name ?? "", cost: ENCHANT_COST })}</div>
          <button
            onClick={payEnchant}
            disabled={paying || me.zeny < ENCHANT_COST}
            className="w-full py-1.5 rounded bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:opacity-40 font-bold text-white"
          >
            {paying ? t("npc.enchanting") : t("npc.enchantPay", { cost: ENCHANT_COST })}
          </button>
          <button onClick={() => setEnchanting(null)} className="w-full py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">{t("npc.enchantCancel")}</button>
        </div>
      ) : (
        <div className="space-y-1">
          {equippable.length === 0 && <div className="text-slate-500 italic">{t("npc.enchantNoGear")}</div>}
          {equippable.map(({ s, i }) => {
            const def = ITEMS[s.itemId];
            return (
              <div key={i} className="flex items-center gap-2 bg-slate-800 rounded p-1.5">
                <span className="text-base">{def?.icon}</span>
                <span className="flex-1 text-slate-200 truncate">{def?.name}</span>
                <span className="text-slate-400 text-[10px]">{def?.slot === "weapon" ? `ATK ${def.atk ?? 0}` : `DEF ${def.def ?? 0}`}</span>
                <button
                  onClick={() => startEnchant(i, s.itemId)}
                  disabled={me.zeny < ENCHANT_COST}
                  className="min-w-[44px] min-h-[32px] px-2 py-1 rounded bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white text-[10px] font-bold"
                >
                  {t("npc.enchant")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tiered waypoint warp cost — based on distance from player
function getWaypointCost(wx: number, wz: number, px: number, pz: number): number {
  const dist = Math.hypot(wx - px, wz - pz);
  if (dist <= 50) return 50;      // same region
  if (dist <= 150) return 100;    // cross region
  return 200;                      // remote / dungeon
}

function WaypointPanel({ room, me }: { room: Room<WorldState>; me: Player }) {
  const t = useT();
  const [wptList, setWptList] = useState<Array<{ id: string; x: number; z: number; label: string; icon: string }>>([]);
  const [using, setUsing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aetheria.waypoints");
      if (raw) setWptList(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const travel = (wpt: typeof wptList[0], cost: number) => {
    if (me.zeny < cost) {
      room.send("system", { text: t("npc.notEnoughZeny", { cost }), severity: "error" });
      return;
    }
    setUsing(true);
    const payload = btoa(JSON.stringify({ x: wpt.x, z: wpt.z }));
    room.send("waypoint_travel", { id: payload });
    setTimeout(() => setUsing(false), 1000);
  };

  const myX = me.pos.x;
  const myZ = me.pos.z;

  return (
    <div className="bg-slate-900/60 border border-cyan-400/30 rounded p-2 space-y-2 text-xs">
      <div className="text-cyan-300 font-bold">🏛️ {t("npc.waypointTitle")}</div>
      {wptList.length === 0 && <div className="text-slate-500 italic">{t("npc.waypointNoMarkers")}</div>}
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {wptList.map((w) => {
          const cost = getWaypointCost(w.x, w.z, myX, myZ);
          const costLabel = cost === 50 ? t("npc.waypointFree") : `${cost}z`;
          return (
            <div key={w.id} className="flex items-center gap-2 bg-slate-800 rounded p-1.5">
              <span>{w.icon}</span>
              <span className="flex-1 text-slate-200 truncate">{w.label}</span>
              <span className="text-[9px] text-slate-400">{costLabel}</span>
              <button
                onClick={() => travel(w, cost)}
                disabled={using || me.zeny < cost}
                className="min-w-[52px] min-h-[32px] px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-[10px] font-bold"
              >
                {using ? "..." : t("npc.warp", { cost })}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
