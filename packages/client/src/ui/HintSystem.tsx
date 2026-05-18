import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { Player, WorldState } from "@game/shared";
import { useStore } from "../store";

type Hint = {
  id: string;
  icon: string;
  text: string;
  waypoint?: { x: number; z: number; label: string; icon: string };
  /** Higher priority shows first */
  priority: number;
};

function evaluateHints(me: Player, achievements: { counters?: Record<string, number>; unlocked?: string[] }): Hint[] {
  const have = (id: string) => {
    let n = 0;
    for (const s of me.inventory.values()) if (s.itemId === id) n += s.qty;
    return n;
  };

  const counters = achievements.counters ?? {};
  const wood = have("wood_log");
  const stone = have("stone_chunk");
  const berry = have("berry");
  const seeds = have("berry_seed");
  const kills = counters.kills ?? 0;
  const trees = counters.trees ?? 0;
  const fishes = counters.fishes ?? 0;
  const harvests = counters.harvests ?? 0;
  const tames = counters.tames ?? 0;

  const hints: Hint[] = [];

  // ── First-time / Tutorial ──
  if (me.level <= 2 && kills === 0) {
    hints.push({
      id: "meet_tutor", priority: 90,
      icon: "🎓", text: "ยินดีต้อนรับสู่ Aetheria! ไปคุยกับ Sera เพื่อเรียนรู้พื้นฐาน",
      waypoint: { x: 0, z: -4, label: "Sera ผู้นำทาง", icon: "🎓" },
    });
  }

  // ── Survival ──
  if (me.thirst < 30) {
    hints.push({
      id: "drink_water", priority: 88,
      icon: "💧", text: "กระหายน้ำแล้ว! ไปดื่มน้ำที่ทะเลสาบ",
      waypoint: { x: 40, z: 35, label: "ทะเลสาบ", icon: "🌊" },
    });
  }
  if (me.hunger < 30 && have("apple") + have("bread") + have("cooked_meat") + have("berry") === 0) {
    hints.push({
      id: "find_food", priority: 87,
      icon: "🍗", text: "หิวแล้ว! หาเบอร์รี่/เนื้อจากพุ่ม/สัตว์ หรือไปซื้อที่ร้าน",
    });
  }

  // ── Gather basics ──
  if (wood < 3 && trees < 3) {
    hints.push({
      id: "chop_tree", priority: 80,
      icon: "🪵", text: "ลองตัดต้นไม้รอบหมู่บ้าน → จะได้ไม้สำหรับ craft",
    });
  }
  if (stone < 3 && wood >= 3) {
    hints.push({
      id: "mine_rock", priority: 78,
      icon: "🪨", text: "ทุบหินสีเทาเพื่อให้ได้ก้อนหิน",
    });
  }

  // ── Crafting progression ──
  if (wood >= 3 && have("wood_axe") === 0 && trees < 10) {
    hints.push({
      id: "craft_axe", priority: 75,
      icon: "🪓", text: "Craft ขวานไม้ (กดปุ่ม 🔨) → ตัดต้นไม้เร็วขึ้น 3 เท่า",
    });
  }
  if (wood >= 2 && stone >= 4 && have("iron_pickaxe") === 0 && me.level >= 2) {
    hints.push({
      id: "craft_pickaxe", priority: 73,
      icon: "⛏", text: "Craft อีเหล็ก → ทุบหิน/แร่เร็วขึ้น 3 เท่า",
    });
  }

  // ── House ──
  if (wood >= 20 && stone >= 10 && me.zeny >= 500 && me.houseSlot < 0) {
    hints.push({
      id: "build_house", priority: 85,
      icon: "🏠", text: "พร้อมสร้างบ้านแล้ว! → ไปหา Bren ช่างไม้",
      waypoint: { x: 4, z: 3, label: "Bren ช่างไม้", icon: "🔨" },
    });
  } else if (me.houseSlot < 0 && me.level >= 3) {
    if (wood < 20) {
      hints.push({
        id: "house_wood", priority: 50,
        icon: "🏠", text: `อยากมีบ้านไหม? ต้องการไม้อีก ${20 - wood} ท่อน (ตัดต้นไม้)`,
      });
    } else if (stone < 10) {
      hints.push({
        id: "house_stone", priority: 50,
        icon: "🏠", text: `อยากมีบ้านไหม? ต้องการหินอีก ${10 - stone} ก้อน (ทุบหิน)`,
      });
    }
  }

  // ── Activities ──
  if (me.level >= 2 && fishes === 0) {
    hints.push({
      id: "try_fishing", priority: 60,
      icon: "🎣", text: "เคยลองตกปลาไหม? ไปทะเลสาบ → ปุ่ม 🎣",
      waypoint: { x: 40, z: 35, label: "ทะเลสาบ (ตกปลา)", icon: "🎣" },
    });
  }
  if (seeds > 0 && harvests === 0) {
    hints.push({
      id: "plant_seed", priority: 58,
      icon: "🌱", text: "แตะ 🌱 ในช่องของ → ปลูกเบอร์รี่ของตัวเอง รอ 3 นาที",
    });
  }
  if (me.level >= 3 && berry >= 5 && !me.petKind && tames === 0) {
    hints.push({
      id: "tame_pet", priority: 55,
      icon: "🐔", text: "หาไก่/หมู/วัว → ป้อนเบอร์รี่ → จับเป็นสัตว์เลี้ยง → ขี่ได้!",
      waypoint: { x: -30, z: 30, label: "ฟาร์มสัตว์ (ทุ่ง SW)", icon: "🐮" },
    });
  }

  // ── Dungeon ──
  if (me.level >= 5 && (counters.darklord ?? 0) === 0) {
    hints.push({
      id: "go_dungeon", priority: 50,
      icon: "⚜", text: "เลเวลถึงแล้ว! ลองท้าทาย Dungeon ที่ปากถ้ำมุม NE",
      waypoint: { x: 84, z: -84, label: "ปากถ้ำ Dungeon", icon: "🕳" },
    });
  }

  // ── Idle exploration prompt ──
  if (hints.length === 0 && kills < 50) {
    hints.push({
      id: "explore", priority: 10,
      icon: "🗺", text: "สำรวจ biome ต่างๆ — ป่า, ภูเขา, ทะเลสาบ, บึง! แตะ minimap ปักหมุด",
    });
  }

  return hints.sort((a, b) => b.priority - a.priority);
}

export function HintSystem({ room }: { room: Room<WorldState> }) {
  const [hint, setHint] = useState<Hint | null>(null);
  // Start collapsed by default — only expand when user clicks the mascot.
  // No auto-expand on game load.
  const [collapsed, setCollapsed] = useState(true);
  const dismissed = useStore((s) => s.dismissedHints);
  const dismissHint = useStore((s) => s.dismissHint);
  const setWaypoint = useStore((s) => s.setWaypoint);

  useEffect(() => {
    const tick = () => {
      const me: Player | undefined = room.state.players.get(room.sessionId);
      if (!me) return setHint(null);
      let achievements: any = { counters: {}, unlocked: [] };
      try { achievements = JSON.parse(me.achievementsJson || "{}"); } catch {}
      const all = evaluateHints(me, achievements);
      const next = all.find((h) => !dismissed.includes(h.id));
      setHint(next ?? null);
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, [room, dismissed]);

  if (!hint) return null;

  // Collapsed: just the bouncing mascot icon — click to expand
  // Positioned bottom-LEFT above chat to avoid conflict with right-side menu bar.
  if (collapsed) {
    return (
      <div className="absolute z-30 select-none pointer-events-auto" style={{ bottom: "24rem", left: "0.75rem" }}>
        <button
          onClick={() => setCollapsed(false)}
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl relative"
          style={{
            background: "radial-gradient(circle at 30% 30%, #fef3c7 0%, #fbbf24 70%, #b45309 100%)",
            border: "3px solid #fcd34d",
            boxShadow: "0 0 14px rgba(251,191,36,0.6), 0 4px 8px rgba(0,0,0,0.4)",
            animation: "hintBob 2s ease-in-out infinite",
          }}
          title="ดูคำใบ้"
        >
          🐣
          {/* Notification dot */}
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 border border-white animate-pulse" />
        </button>
        <style>{`
          @keyframes hintBob {
            0%, 100% { transform: translateY(0) rotate(-3deg); }
            50% { transform: translateY(-4px) rotate(3deg); }
          }
        `}</style>
      </div>
    );
  }

  // Expanded
  return (
    <div className="absolute z-30 pointer-events-none select-none" style={{ bottom: "24rem", left: "0.75rem", maxWidth: "min(15rem, 50vw)" }}>
      <div className="pointer-events-auto relative">
        {/* Cute mascot avatar */}
        <div
          className="absolute -top-3 -left-3 w-11 h-11 rounded-full flex items-center justify-center text-xl"
          style={{
            background: "radial-gradient(circle at 30% 30%, #fef3c7 0%, #fbbf24 70%, #b45309 100%)",
            border: "3px solid #fcd34d",
            boxShadow: "0 0 12px rgba(251,191,36,0.5), 0 4px 8px rgba(0,0,0,0.4)",
            animation: "hintBob 2s ease-in-out infinite",
          }}
        >
          <span style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>🐣</span>
        </div>
        {/* Speech bubble — narrower, lighter background */}
        <div
          className="relative pl-10 pr-1.5 py-2 rounded-2xl"
          style={{
            background: "linear-gradient(180deg, rgba(255, 251, 235, 0.88) 0%, rgba(254, 243, 199, 0.88) 100%)",
            border: "2px solid #fbbf24",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          <div className="flex items-start gap-1 mb-1">
            <span className="text-base leading-none">{hint.icon}</span>
            <span className="text-[11px] font-semibold text-amber-900 leading-tight flex-1">
              {hint.text}
            </span>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => setCollapsed(true)}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-200 hover:bg-amber-300 text-amber-900 text-[10px] leading-none font-bold"
                title="ย่อ"
              >−</button>
              <button
                onClick={() => dismissHint(hint.id)}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-rose-200 hover:bg-rose-300 text-rose-900 text-[10px] leading-none font-bold"
                title="ไม่เอาแล้ว"
              >×</button>
            </div>
          </div>
          {hint.waypoint && (
            <button
              onClick={() => setWaypoint(hint.waypoint!)}
              className="w-full py-1 px-2 rounded-full text-[11px] font-bold text-white transition active:scale-95"
              style={{
                background: "linear-gradient(135deg, #f472b6, #ec4899)",
                boxShadow: "0 2px 6px rgba(236,72,153,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
              }}
            >
              📍 พาฉันไป
            </button>
          )}
        </div>
      </div>
      <style>{`
        @keyframes hintBob {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-4px) rotate(3deg); }
        }
      `}</style>
    </div>
  );
}
