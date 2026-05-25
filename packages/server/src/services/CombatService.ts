/**
 * CombatService — extracted from WorldRoom.
 * Handles PvP attack and monster AI tick logic.
 */
import {
  Player, Monster, MonsterKind, MONSTERS, GAME_CONFIG, HOUSE_SLOTS,
} from "@game/shared";
import { estimateHeight, clamp } from "./MovementService.js";

export class CombatService {
  constructor(
    private state: { players: Map<string, Player>; monsters: Map<string, Monster>; isNight: boolean },
    private lastAttack: Map<string, number>,
    private callbacks: {
      broadcast: (type: string, data: any) => void;
      sendToSid?: (sid: string, type: string, data: any) => void;
      /** Room clock so respawn timeouts pause correctly with simulationInterval. */
      clock?: { setTimeout: (cb: () => void, ms: number) => any };
    }
  ) {}

  /** Schedule a respawn after GAME_CONFIG.RESPAWN_MS. Mirrors the status-
   *  effect death path in Combat.ts so any kill path produces a respawn. */
  private scheduleRespawn(sid: string) {
    const fire = () => {
      const pp = this.state.players.get(sid);
      if (!pp) return;
      pp.hp = pp.maxHp; pp.dead = false;
      if (pp.houseSlot >= 0 && pp.houseSlot < HOUSE_SLOTS.length) {
        const h = HOUSE_SLOTS[pp.houseSlot];
        pp.pos.x = h.x; pp.pos.z = h.z;
      } else { pp.pos.x = 0; pp.pos.z = 0; }
      pp.statuses.clear();
    };
    if (this.callbacks.clock) this.callbacks.clock.setTimeout(fire, GAME_CONFIG.RESPAWN_MS);
    else setTimeout(fire, GAME_CONFIG.RESPAWN_MS);
  }

  // ---------- PvP attack ----------

  handlePvpAttack(
    attacker: Player,
    target: Player,
    now: number
  ): { hit: boolean; dmg: number; crit: boolean } | null {
    if (attacker === target) return null;
    const last = this.lastAttack.get(attacker.id) ?? 0;
    if (now - last < GAME_CONFIG.ATTACK_COOLDOWN_MS) return null;

    const dist = Math.hypot(target.pos.x - attacker.pos.x, target.pos.z - attacker.pos.z);
    const reach = (attacker.job === "mage" || attacker.job === "archer" || attacker.job === "sniper" || attacker.job === "wizard")
      ? 8 : GAME_CONFIG.ATTACK_RANGE + 0.5;
    if (dist > reach) return null;

    this.lastAttack.set(attacker.id, now);

    const d = { str: attacker.str, agi: attacker.agi, vit: attacker.vit, int: attacker.int, dex: attacker.dex, luk: attacker.luk };
    const dt = { str: target.str, agi: target.agi, vit: target.vit, int: target.int, dex: target.dex, luk: target.luk };
    // Simple inline derived-like calcs (matches old inline code)
    const da = {
      atkBonus: Math.floor(d.str * 0.5 + d.dex * 0.3 + d.luk * 0.2),
      crit: Math.floor(d.dex * 0.5 + d.luk * 0.3 + attacker.level * 2),
    };
    let dmg = Math.max(1, (attacker.atk + da.atkBonus) - target.def);
    const crit = Math.random() * 100 < da.crit;
    if (crit) dmg = Math.floor(dmg * 1.6);
    dmg = Math.max(1, Math.floor(dmg * 0.6)); // PvP reduction

    return { hit: true, dmg, crit };
  }

  // ---------- monster AI tick ----------

  tickMonsters(
    dt: number,
    world: number,
    now: number,
    playerSpatialHash: { findNearest: (x: number, z: number, range: number, filter?: (cand: any) => boolean) => any; clear: () => void; update: (item: any) => void },
    isStunned: (e: Player | Monster) => boolean,
    speedMultOf: (e: Player | Monster) => number,
  ) {
    // Rebuild player spatial hash — caller should have already added players,
    // but we rebuild here so this function is self-contained
    playerSpatialHash.clear();
    for (const [sid, pp] of this.state.players) {
      if (pp.dead) continue;
      playerSpatialHash.update({ id: pp.id, sid, x: pp.pos.x, z: pp.pos.z, dead: false });
    }

    for (const [, m] of this.state.monsters) {
      if (m.dead) continue;
      const cfg = (MONSTERS as any)[m.kind];
      if (!cfg || cfg.aggroRange === 0) continue;
      const def = MONSTERS[m.kind as MonsterKind];

      // PASSIVE ANIMALS (aggroRange === -1): wander + flee
      if (cfg.aggroRange === -1) {
        const hpRatio = m.hp / m.maxHp;
        let threat: Player | null = null;
        if (m.targetId) {
          const t = this.state.players.get(m.targetId);
          if (t && !t.dead) {
            const d = Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
            if (d < 14 && hpRatio < 1) threat = t;
          }
        }
        const speed = def.speed * speedMultOf(m);
        if (threat) {
          const dx = m.pos.x - threat.pos.x;
          const dz = m.pos.z - threat.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          m.pos.x += (dx / d) * speed * 1.4 * dt;
          m.pos.z += (dz / d) * speed * 1.4 * dt;
        } else {
          const key = "wander:" + m.id;
          const nextAt = this.lastAttack.get(key as any) ?? 0;
          if (now >= nextAt) {
            this.lastAttack.set(key as any, now + 3000 + Math.random() * 5000);
            const a = Math.random() * Math.PI * 2;
            const stride = 2 + Math.random() * 4;
            m.pos.x += Math.cos(a) * stride;
            m.pos.z += Math.sin(a) * stride;
          }
        }
        m.pos.x = clamp(m.pos.x, -world, world);
        m.pos.z = clamp(m.pos.z, -world, world);
        continue;
      }

      // HOSTILE MOBS
      const hit = playerSpatialHash.findNearest(m.pos.x, m.pos.z, def.aggroRange, (cand) => {
        const ph = estimateHeight(cand.x, cand.z);
        return Math.abs(ph - estimateHeight(m.pos.x, m.pos.z)) <= 3;
      });
      let nearest: Player | null = null;
      let nearestD = Infinity;
      if (hit) {
        nearest = this.state.players.get(hit.entity.sid) ?? null;
        nearestD = hit.distance;
      }

      if (nearest && nearestD < def.aggroRange && !isStunned(m)) {
        m.targetId = nearest.id;
        const mSpeed = def.speed * speedMultOf(m);
        if (nearestD > GAME_CONFIG.ATTACK_RANGE) {
          const dx = nearest.pos.x - m.pos.x;
          const dz = nearest.pos.z - m.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          m.pos.x += (dx / len) * mSpeed * dt;
          m.pos.z += (dz / len) * mSpeed * dt;
        } else {
          const last = this.lastAttack.get(m.id) ?? 0;
          if (now - last >= GAME_CONFIG.ATTACK_COOLDOWN_MS) {
            this.lastAttack.set(m.id, now);
            const nightMult = this.state.isNight ? 1.5 : 1;
            const dmg = Math.max(1, Math.floor((def.atk - nearest.def) * nightMult));
            nearest.hp = Math.max(0, nearest.hp - dmg);
            this.callbacks.broadcast("damage", { targetId: nearest.id, amount: dmg, from: m.id });
            if (nearest.hp === 0 && !nearest.dead) {
              nearest.dead = true;
              // Death recap: notify the dying player so client can show killer name.
              // hit.entity.sid is the player's Colyseus session id (lookup target).
              if (hit) {
                this.callbacks.sendToSid?.(hit.entity.sid, "death", {
                  killer: def.name ?? m.kind,
                  killerKind: "monster",
                });
                this.scheduleRespawn(hit.entity.sid);
              }
            }
          }
        }
      } else {
        m.targetId = "";
      }
    }
  }
}