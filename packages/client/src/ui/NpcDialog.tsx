import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { ITEMS, NPCS, QUESTS, QUESTS_BY_GIVER, HOUSE_COST, type Player, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { useQuests } from "../hooks/useQuests";

export function NpcDialog({ room }: { room: Room<WorldState> }) {
  const npcId = useStore((s) => s.activeNpcId);
  const close = () => useStore.setState({ activeNpcId: null });
  const [tab, setTab] = useState<"buy" | "sell" | "quests">("buy");
  const [err, setErr] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const quests = useQuests(room);

  useEffect(() => {
    if (!npcId) return;
    setErr(null);
    setTab("buy");
    const off = room.onMessage("shopError", (m: any) => setErr(m.reason));
    return () => off?.();
  }, [npcId, room]);

  useEffect(() => {
    if (!npcId) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [npcId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
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
    <div className="panel absolute inset-x-0 bottom-32 mx-auto w-[28rem] space-y-2">
      <div className="panel-corners" />
      <div className="panel-title">
        <span>{npc.icon} {npc.name}</span>
        <span className="flex items-center gap-2">
          <span className="normal-case text-yellow-200">💰 {me?.zeny ?? 0}z</span>
          <button onClick={close}>✕</button>
        </span>
      </div>
      <div className="text-[11px] text-slate-300 italic">"{npc.dialog}"</div>

      {tooFar && <div className="text-rose-400 text-sm">Walk closer to interact.</div>}

      {!tooFar && npc.id === "carpenter_field" && me && <CarpenterPanel room={room} me={me} />}
      {!tooFar && npc.id === "tutor_field" && <TutorialPanel />}

      {!tooFar && (
        <>
          <div className="flex gap-1 text-sm">
            {npc.kind === "shop" && <button onClick={() => setTab("buy")} className={`px-3 py-1 rounded ${tab === "buy" ? "bg-amber-600" : "bg-slate-700"}`}>Buy</button>}
            {npc.kind === "shop" && <button onClick={() => setTab("sell")} className={`px-3 py-1 rounded ${tab === "sell" ? "bg-amber-600" : "bg-slate-700"}`}>Sell</button>}
            {npcQuestIds.length > 0 && <button onClick={() => setTab("quests")} className={`px-3 py-1 rounded ${tab === "quests" ? "bg-amber-600" : "bg-slate-700"}`}>Quests ({npcQuestIds.length})</button>}
            {err && <div className="ml-auto text-rose-400">{err}</div>}
          </div>

          {tab === "buy" && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {npc.shop!.map((e) => {
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
                      disabled={!canAfford}
                      onClick={() => { setErr(null); room.send("shopBuy", { npcId: npc.id, itemId: e.itemId, qty: 1 }); }}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-50 px-3 py-1 rounded text-xs"
                    >Buy</button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "sell" && me && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {/* Bulk-sell shortcuts (sit at top of the sell list) */}
              <div className="flex gap-1.5 mb-1.5 sticky top-0 bg-slate-900/90 backdrop-blur-sm py-1 z-10">
                <button
                  onClick={() => { setErr(null); room.send("shopSellMany", { npcId: npc.id, sellAllMaterials: true }); }}
                  className="flex-1 bg-amber-700/70 hover:bg-amber-600 border border-amber-400/40 rounded px-2 py-1.5 text-[11px] font-bold text-white"
                >
                  💼 ขาย material ทั้งหมด
                </button>
                <button
                  onClick={() => { setErr(null); room.send("shopSellMany", { npcId: npc.id, sellAllJunk: true }); }}
                  className="flex-1 bg-rose-700/70 hover:bg-rose-600 border border-rose-400/40 rounded px-2 py-1.5 text-[11px] font-bold text-white"
                >
                  🗑 ขายของรกๆ
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
                    <div>
                      {isDone && <span className="text-emerald-400 text-xs">✓ Completed</span>}
                      {!isDone && !isActive && (me?.level ?? 1) >= q.minLevel && (
                        <button onClick={() => room.send("questAccept", { questId: qid })} className="bg-emerald-600 hover:bg-emerald-500 px-2 py-0.5 rounded text-xs">Accept</button>
                      )}
                      {!isDone && !isActive && (me?.level ?? 1) < q.minLevel && (
                        <span className="text-slate-500 text-xs">Requires Lv {q.minLevel}</span>
                      )}
                      {isActive && !canTurnIn && <span className="text-slate-400 text-xs">In progress</span>}
                      {canTurnIn && (
                        <button onClick={() => room.send("questTurnIn", { questId: qid })} className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-2 py-0.5 rounded text-xs">Turn in</button>
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
  );
}

function TutorialPanel() {
  const tips = [
    { icon: "⚔", title: "การต่อสู้", body: "แตะปุ่ม ⚔ เพื่อโจมตี mob ใกล้สุดอัตโนมัติ" },
    { icon: "🪵", title: "เก็บทรัพยากร", body: "ตีต้นไม้ได้ไม้ · ตีหินได้หิน · พุ่มไม้ได้เบอร์รี่" },
    { icon: "🪓", title: "เครื่องมือ", body: "Craft ขวาน/อีเหล็ก → ตัดเร็วขึ้น 3 เท่า" },
    { icon: "💧", title: "น้ำ", body: "ไปทะเลสาบ (NE) → กดปุ่ม 💧 ดื่ม หรือ 🎣 ตกปลา" },
    { icon: "🌱", title: "ปลูกผัก", body: "เก็บ berry_seed → แตะในช่อง hotbar → ปลูก รอ 3 นาที" },
    { icon: "🏠", title: "บ้าน", body: "คุยช่างไม้ Bren → 20 ไม้ + 10 หิน + 500z" },
    { icon: "🐎", title: "เลี้ยงสัตว์", body: "ป้อน berry กับ ไก่/หมู/วัว 3-7 ครั้ง → จับเป็นสัตว์เลี้ยง → ขี่ได้" },
    { icon: "🔨", title: "Crafting", body: "กดปุ่ม 🔨 หรือ K → ทำของจากทรัพยากร" },
    { icon: "🌙", title: "กลางคืน", body: "มอนสเตอร์แรงขึ้น 1.5× → ระวังให้ดี" },
  ];
  return (
    <div className="bg-cyan-900/30 border border-cyan-400/40 rounded p-2 space-y-1.5 max-h-72 overflow-y-auto game-scroll">
      <div className="text-cyan-200 font-bold text-xs flex items-center gap-1">
        🎓 คู่มือผู้กล้า
      </div>
      <div className="space-y-1">
        {tips.map((t, i) => (
          <div key={i} className="flex gap-2 items-start text-[11px] py-1 border-b border-white/5 last:border-b-0">
            <span className="text-lg leading-none">{t.icon}</span>
            <div className="flex-1">
              <div className="font-bold text-amber-200">{t.title}</div>
              <div className="text-slate-300">{t.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CarpenterPanel({ room, me }: { room: Room<WorldState>; me: Player }) {
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
        🏠 คุณเป็นเจ้าของบ้านอยู่แล้ว (slot {me.houseSlot}) — ยินดีต้อนรับกลับ!
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-amber-400/30 rounded p-2 space-y-2 text-xs">
      <div className="text-amber-200 font-bold">🏠 สร้างบ้าน</div>
      <div className="grid grid-cols-3 gap-2">
        <CostRow icon="🪵" label="ไม้" have={wood} need={HOUSE_COST.wood_log} ok={haveWood} />
        <CostRow icon="🪨" label="หิน" have={stone} need={HOUSE_COST.stone_chunk} ok={haveStone} />
        <CostRow icon="💰" label="zeny" have={me.zeny} need={HOUSE_COST.zeny} ok={haveZeny} />
      </div>
      <button
        disabled={!canBuild}
        onClick={() => room.send("buildHouse", {})}
        className="w-full py-1.5 rounded bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
      >
        🔨 สร้างเลย
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
