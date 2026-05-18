import { useEffect } from "react";
import { useStore } from "../store";
import { Sfx } from "../sfx/sfx";

// global wiring of room messages -> SFX
export function useSfx() {
  const room = useStore((s) => s.room);
  useEffect(() => {
    if (!room) return;
    const sid = room.sessionId;
    const off1 = room.onMessage("damage" as any, (m: any) => {
      if (m.heal) { Sfx.heal(); return; }
      if (m.amount === 0) { if (m.targetId === sid || isMonster(room, m.targetId)) Sfx.miss(); return; }
      if (m.crit) Sfx.crit();
      else Sfx.hit();
    });
    const off2 = room.onMessage("levelup" as any, (m: any) => {
      if (m.playerId === sid) Sfx.levelup();
    });
    const off3 = room.onMessage("skillCast" as any, (m: any) => {
      switch (m.skillId) {
        case "firebolt": Sfx.skillFire(); break;
        case "frost_nova": Sfx.skillIce(); break;
        case "arrow_shot": case "double_strafe": Sfx.skillArrow(); break;
        case "heal": Sfx.heal(); break;
        case "holy_smite": Sfx.skillHoly(); break;
        default: Sfx.hit();
      }
    });
    // pickup detection: drops shrink when picked (we approximate by listening to state via interval)
    let lastDropCount = room.state.drops?.size ?? 0;
    let lastMonsterAlive = countAlive(room);
    const tickId = setInterval(() => {
      const drops = room.state.drops?.size ?? 0;
      if (drops < lastDropCount) Sfx.pickup();
      lastDropCount = drops;
      const aliveNow = countAlive(room);
      if (aliveNow < lastMonsterAlive) Sfx.monsterDie();
      lastMonsterAlive = aliveNow;
    }, 250);
    return () => { off1?.(); off2?.(); off3?.(); clearInterval(tickId); };
  }, [room]);
}

function isMonster(room: any, id: string) { return !!room.state.monsters.get(id); }
function countAlive(room: any) { let n = 0; for (const [, m] of room.state.monsters) if (!m.dead) n++; return n; }
