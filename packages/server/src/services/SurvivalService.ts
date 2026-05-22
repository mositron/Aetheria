/**
 * SurvivalService — hunger, thirst, stamina decay and regen.
 * Extracted from the tick loop in WorldRoom.ts.
 */
import { type Player, ITEMS, GAME_CONFIG, MAPS, type MapId } from "@game/shared";

function countItem(p: Player, itemId: string): number {
  let n = 0;
  for (const s of p.inventory) if (s.itemId === itemId) n += s.qty;
  return n;
}

export class SurvivalService {
  constructor(
    private state: { players: Map<string, Player>; weather: string; mapId: string },
    private isStunned: (p: Player) => boolean,
    private speedMultOf: (p: Player) => number,
    private sendToClient: (sid: string, type: string, data: unknown) => void,
  ) {}

  tickSurvival(
    sid: string,
    p: Player,
    dt: number,
    intentMx: number,
    intentMz: number,
    intentRotY: number,
    world: number,
    regen: boolean,
    weather: string,
  ) {
    if (p.dead) return;

    const moving = Math.abs(intentMx) + Math.abs(intentMz) > 0.01;

    // Cancel stamina if moving while stunned
    if (moving && this.isStunned(p)) return;

    // Survival speed penalties: hungry → 80%, very hungry → 65%, exhausted → 50%
    let speedMult = 1;
    if (p.hunger < 25) speedMult *= 0.8;
    if (p.hunger <= 0) speedMult *= 0.8;       // stacks: 64% when hunger 0
    if (p.stamina <= 0) speedMult *= 0.65;
    if (p.mounted && p.petKind) speedMult *= 1.55;
    if (p.flying) speedMult *= 2.4;

    // Thirsty wobble
    let mx = intentMx, mz = intentMz;
    if (p.thirst <= 0) {
      const wob = Math.sin(Date.now() * 0.005 + sid.charCodeAt(0)) * 0.35;
      const cos = Math.cos(wob), sin = Math.sin(wob);
      const rx = mx * cos - mz * sin;
      const rz = mx * sin + mz * cos;
      mx = rx; mz = rz;
    }

    const sp = GAME_CONFIG.PLAYER_SPEED * this.speedMultOf(p) * speedMult;
    p.pos.x = clamp(p.pos.x + mx * sp * dt, -world, world);
    p.pos.z = clamp(p.pos.z + mz * sp * dt, -world, world);
    p.rotY = intentRotY;

    // ---- Survival decay ----
    const moveMult = moving ? 1.6 : 1.0;
    p.hunger = Math.max(0, p.hunger - dt * (100 / (28 * 60)) * moveMult);
    p.thirst = Math.max(0, p.thirst - dt * (100 / (22 * 60)) * moveMult);

    // stamina: drain while moving/flying, regen while still
    const weatherStaminaBonus = weather === "rainy" ? 1.6 : 1;
    if (p.flying) {
      const hasGlider = countItem(p, "glider") > 0;
      p.stamina = Math.max(0, p.stamina - dt * (hasGlider ? 1 : 7));
      if (p.stamina <= 0 && !hasGlider) {
        p.flying = false;
        this.sendToClient(sid, "system", { text: "💨 Stamina หมด — ลงพื้นแล้ว" });
      }
    } else if (moving) {
      p.stamina = Math.max(0, p.stamina - dt * 4);
    } else {
      p.stamina = Math.min(p.maxStamina, p.stamina + dt * 18 * weatherStaminaBonus);
    }

    // NO STARVATION DEATH — hunger/thirst only DEBUFF, never kill.
    if (regen) {
      // Regen scales with how well-fed/hydrated you are:
      //  - both > 50: full regen (HP +1, MP +2)
      //  - both > 20: half regen (MP +1, no HP)
      //  - one at 0: no regen at all (but no damage either)
      const wellFed = p.hunger > 50 && p.thirst > 50;
      const okay = p.hunger > 20 && p.thirst > 20;
      if (wellFed) {
        if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + 2);
        if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1);
      } else if (okay) {
        if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + 1);
      }
    }
  }

  handleDrink(sid: string) {
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    const mapDef = MAPS[this.state.mapId as MapId];
    const waters = mapDef.waters ?? [];
    let nearWater = false;
    for (const w of waters) {
      if (Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < w.radius) { nearWater = true; break; }
    }
    if (!nearWater) return;
    p.thirst = Math.min(100, p.thirst + 35);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}