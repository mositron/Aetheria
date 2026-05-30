import {
  Player, Monster, StatusEffect, StatusKind, STATUS_DEFS, MONSTERS, MonsterKind, GAME_CONFIG, JOBS, JobId, derived, maxMpFor, ITEMS, HOUSE_SLOTS, STAT_POINTS_PER_LEVEL,
  caveAt, ACHIEVEMENTS,
} from "@game/shared";

// Which monster kind counts toward each cave's clear achievement.
// Keys are CaveDef.id from shared/biomes.ts.
const CAVE_BOSS: Record<string, MonsterKind> = {
  shadow_cave: "orc",
  frost_cave: "snowman_giant",
  desert_cave: "scorpion_lord",
  swamp_cave: "bog_witch",
  forest_cave: "orc",
  wilderness_cave: "darklord",
};
const CAVE_COUNTER: Record<string, string> = {
  shadow_cave: "cave_shadow",
  frost_cave: "cave_frost",
  desert_cave: "cave_desert",
  swamp_cave: "cave_swamp",
  forest_cave: "cave_forest",
  wilderness_cave: "cave_wilderness",
};

// Monster kinds that count as "boss-tier" — longer respawn + spawn toast.
export const BOSS_KINDS: Set<MonsterKind> = new Set<MonsterKind>([
  "darklord", "snowman_giant", "scorpion_lord", "bog_witch",
  "ice_giant", "shadow_lord",
]);

const BOSS_DISPLAY_NAME: Partial<Record<MonsterKind, string>> = {
  darklord: "Dark Lord",
  snowman_giant: "Snowman Giant",
  scorpion_lord: "Scorpion Lord",
  bog_witch: "Bog Witch",
  ice_giant: "Ice Giant",
  shadow_lord: "Shadow Lord",
};

export class Combat {
  /**
   * Pending respawn timers, keyed by monster id. Despawn paths can cancel
   * these to release the closure references over the monster + spawn objects.
   */
  respawnTimers = new Map<string, { clear?: () => void } | null>();

  constructor(
    private state: { players: Map<string, Player>; monsters: Map<string, Monster> },
    private lastAttack: Map<string, number>,
    private lastSkill: Map<string, number>,
    private statusTickAcc: Map<string, number>,
    private botIds: Set<string>,
    private clock: { setTimeout: (cb: () => void, ms: number) => any },
    private callbacks: {
      broadcast: (type: string, data: any) => void;
      grantExp: (p: Player, amount: number) => void;
      onMonsterKilled: (sid: string, kind: string) => void;
      bumpAchievement: (sid: string, counter: string, amount?: number) => void;
      bumpDailyChallenge: (sid: string, kind: "kills" | "harvest", amount?: number) => void;
      dropLoot: (m: Monster) => void;
      monsterSpawn: Map<string, { kind: MonsterKind; x: number; z: number }>;
    }
  ) {}

  isStunned(p: Player | Monster): boolean {
    const now = Date.now();
    for (const s of p.statuses.values()) {
      if (s.endAt > now && STATUS_DEFS[s.kind as StatusKind]?.preventAction) return true;
    }
    return false;
  }

  speedMultOf(p: Player | Monster): number {
    let mult = 1;
    const now = Date.now();
    for (const s of p.statuses.values()) {
      if (s.endAt <= now) continue;
      const def = STATUS_DEFS[s.kind as StatusKind];
      if (def?.speedMult !== undefined) mult *= def.speedMult;
    }
    if ("mounted" in p && (p as any).mounted) mult *= 1.3;
    if ("hunger" in p && (p as any).hunger < 25) mult *= 0.75;
    return mult;
  }

  applyStatusToMonster(m: Monster, kind: StatusKind, durationMs: number, fromId = "") {
    const existing = m.statuses.find((s) => s.kind === kind);
    const endAt = Date.now() + durationMs;
    if (existing) { existing.endAt = Math.max(existing.endAt, endAt); existing.fromId = fromId; return; }
    const eff = new StatusEffect();
    eff.kind = kind; eff.endAt = endAt; eff.fromId = fromId;
    m.statuses.push(eff);
  }

  applyStatusToPlayer(p: Player, kind: StatusKind, durationMs: number, fromId = "") {
    const existing = p.statuses.find((s) => s.kind === kind);
    const endAt = Date.now() + durationMs;
    if (existing) { existing.endAt = Math.max(existing.endAt, endAt); existing.fromId = fromId; return; }
    const eff = new StatusEffect();
    eff.kind = kind; eff.endAt = endAt; eff.fromId = fromId;
    p.statuses.push(eff);
  }

  recalcStats(p: Player, fullHeal = false) {
    const job = JOBS[p.job as JobId] ?? JOBS.novice;
    const d = derived({ str: p.str, agi: p.agi, vit: p.vit, int: p.int, dex: p.dex, luk: p.luk }, p.level);
    const baseHp = GAME_CONFIG.PLAYER_BASE_HP + job.hpPerLevel * (p.level - 1);
    const baseAtk = GAME_CONFIG.PLAYER_BASE_ATK + job.atkPerLevel * (p.level - 1);
    const wpn = ITEMS[p.weapon]?.atk ?? 0;
    const arm = ITEMS[p.armor]?.def ?? 0;
    p.maxHp = baseHp + d.hpFromVit;
    p.maxMp = maxMpFor(job.id, p.level) + d.mpFromInt;
    p.atk = baseAtk + wpn + d.atkBonus;
    p.def = arm + d.defFromVit;
    if (p.hp > p.maxHp || fullHeal) p.hp = p.maxHp;
    if (p.mp > p.maxMp || fullHeal) p.mp = p.maxMp;
  }

  handleAttack(attackerId: string, targetId: string) {
    const attacker = this.state.players.get(attackerId);
    if (!attacker || attacker.dead) return;
    const d = derived({ str: attacker.str, agi: attacker.agi, vit: attacker.vit, int: attacker.int, dex: attacker.dex, luk: attacker.luk }, attacker.level);
    const cooldown = GAME_CONFIG.ATTACK_COOLDOWN_MS * d.aspdMult;
    const now = Date.now();
    const last = this.lastAttack.get(attackerId) ?? 0;
    if (now - last < cooldown) return;

    const target = this.state.monsters.get(targetId);
    if (!target || target.dead) return;
    // Bots may NEVER damage resource nodes or passive animals — gathering is for humans only.
    if (this.botIds.has(attackerId)) {
      const tcfg = (MONSTERS as any)[target.kind];
      if (!tcfg || tcfg.aggroRange <= 0) return;
    }
    const dx = target.pos.x - attacker.pos.x;
    const dz = target.pos.z - attacker.pos.z;
    const RANGED_JOBS = new Set(["mage", "archer", "sniper", "wizard"]);
    const isRangedJob = RANGED_JOBS.has(attacker.job);
    const attackReach = isRangedJob ? 8 : GAME_CONFIG.ATTACK_RANGE + 0.5;
    if (Math.hypot(dx, dz) > attackReach) return;

    this.lastAttack.set(attackerId, now);
    const flee = 5 + Math.floor(MONSTERS[target.kind as MonsterKind].speed * 2);
    let hitChance = Math.max(0.05, Math.min(0.99, 0.8 + (d.hit - flee) * 0.03));
    if (attacker.thirst <= 0) hitChance *= 0.55;
    else if (attacker.thirst < 25) hitChance *= 0.85;
    if (attacker.hunger <= 0) hitChance *= 0.75;
    if (Math.random() > hitChance) {
      this.callbacks.broadcast("damage", { targetId: target.id, amount: 0, from: attacker.id });
      return;
    }
    const isCrit = Math.random() * 100 < d.crit;
    let dmg = attacker.atk + d.atkBonus;
    if (attacker.hunger < 25) dmg = Math.floor(dmg * 0.85);
    if (attacker.hunger <= 0) dmg = Math.floor(dmg * 0.65);
    if (attacker.weapon === "wood_axe" && target.kind === "tree_node") dmg = Math.floor(dmg * 3);
    if (attacker.weapon === "iron_pickaxe" && (target.kind === "rock_node" || target.kind === "ore_node" || target.kind === "crystal_node")) dmg = Math.floor(dmg * 3);
    if (isCrit) dmg = Math.floor(dmg * 2);
    // Level scaling: +3% per level delta (cap +50%, floor -30%)
    // Monster "level" derived from maxHp/100 as proxy since Monster schema has no level field
    const monsterLv = Math.max(1, Math.floor((target.maxHp || 100) / 100));
    const lvDelta = attacker.level - monsterLv;
    dmg = Math.floor(dmg * (1 + Math.max(-0.3, Math.min(0.5, lvDelta * 0.03))));

    this.dealDamageToMonster(target, attacker, dmg, isCrit);
  }

  handleSkill(attackerId: string, skillId: string, targetId?: string) {
    const attacker = this.state.players.get(attackerId);
    if (!attacker || attacker.dead) return;
    if (this.isStunned(attacker)) return;
    const job = JOBS[attacker.job as JobId];
    const skill = job.skills.find((s) => s.id === skillId);
    if (!skill) return;
    if (attacker.mp < skill.manaCost) return;
    const key = attackerId + ":" + skillId;
    const now = Date.now();
    const last = this.lastSkill.get(key) ?? 0;
    if (now - last < skill.cooldownMs) return;

    if (skill.healMult && skill.range === 0) {
      this.lastSkill.set(key, now);
      attacker.mp = Math.max(0, attacker.mp - skill.manaCost);
      this.callbacks.broadcast("skillCast", { skillId: skill.id, fromId: attacker.id, tx: attacker.pos.x, tz: attacker.pos.z, aoeRadius: 0 });
      const heal = Math.floor(attacker.atk * (skill.healMult ?? 1) + 10);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      this.callbacks.broadcast("damage", { targetId: attacker.id, amount: heal, from: attacker.id, heal: true });
      if (skill.selfStatus) this.applyStatusToPlayer(attacker, skill.selfStatus.kind as StatusKind, skill.selfStatus.durationMs);
      return;
    }

    if (!targetId) return;
    const target = this.state.monsters.get(targetId);
    if (!target || target.dead) return;
    const dx = target.pos.x - attacker.pos.x;
    const dz = target.pos.z - attacker.pos.z;
    if (Math.hypot(dx, dz) > skill.range + 0.5) return;

    this.lastSkill.set(key, now);
    attacker.mp = Math.max(0, attacker.mp - skill.manaCost);
    this.callbacks.broadcast("skillCast", { skillId: skill.id, fromId: attacker.id, tx: target.pos.x, tz: target.pos.z, aoeRadius: skill.aoeRadius ?? 0 });

    const dmgRaw = Math.max(1, Math.floor(attacker.atk * skill.damageMult));
    // Level scaling on skill damage too
    const monsterLv = Math.max(1, Math.floor((target.maxHp || 100) / 100));
    const lvDelta = attacker.level - monsterLv;
    const dmg = Math.floor(dmgRaw * (1 + Math.max(-0.3, Math.min(0.5, lvDelta * 0.03))));
    this.dealDamageToMonster(target, attacker, dmg);
    if (skill.status && (skill.status.chance ?? 1) > Math.random()) {
      this.applyStatusToMonster(target, skill.status.kind as StatusKind, skill.status.durationMs);
    }
    if (skill.selfStatus) this.applyStatusToPlayer(attacker, skill.selfStatus.kind as StatusKind, skill.selfStatus.durationMs);

    if (skill.aoeRadius) {
      for (const [, m] of this.state.monsters) {
        if (m.id === target.id || m.dead) continue;
        if (Math.hypot(m.pos.x - target.pos.x, m.pos.z - target.pos.z) <= skill.aoeRadius) {
          this.dealDamageToMonster(m, attacker, Math.floor(dmg * 0.7));
          if (skill.status && (skill.status.chance ?? 1) > Math.random()) {
            this.applyStatusToMonster(m, skill.status.kind as StatusKind, skill.status.durationMs);
          }
        }
      }
    }
  }

  dealDamageToMonster(target: Monster, attacker: Player, dmg: number, crit = false) {
    target.hp = Math.max(0, target.hp - dmg);
    target.targetId = attacker.id;
    this.callbacks.broadcast("damage", { targetId: target.id, amount: dmg, from: attacker.id, crit });
    if (target.hp === 0 && !target.dead) {
      target.dead = true;
      // Clear any stale status-tick accumulators for this monster — without
      // this, entries keep accruing memory until the monster is despawned.
      for (const key of this.statusTickAcc.keys()) {
        if (key.endsWith(":" + target.id)) this.statusTickAcc.delete(key);
      }
      const def = MONSTERS[target.kind as MonsterKind];
      this.callbacks.grantExp(attacker, def.exp);
      this.callbacks.onMonsterKilled(attacker.id, target.kind);
      const sid = attacker.id;
      const tcfg = (MONSTERS as any)[target.kind];
      if (tcfg?.aggroRange > 0) {
        this.callbacks.bumpAchievement(sid, "kills");
        this.callbacks.bumpDailyChallenge(sid, "kills");
      }
      if (target.kind === "tree_node") { this.callbacks.bumpAchievement(sid, "trees"); this.callbacks.bumpDailyChallenge(sid, "harvest"); }
      if (target.kind === "rock_node" || target.kind === "ore_node" || target.kind === "crystal_node") { this.callbacks.bumpAchievement(sid, "rocks"); this.callbacks.bumpDailyChallenge(sid, "harvest"); }
      if (target.kind === "darklord") this.callbacks.bumpAchievement(sid, "darklord");
      // Cave-clear detection: if monster is the cave's tracked kind + inside that cave radius
      {
        const cid = caveAt(target.pos.x, target.pos.z);
        if (cid && CAVE_BOSS[cid] === (target.kind as MonsterKind)) {
          this.callbacks.bumpAchievement(sid, CAVE_COUNTER[cid]);
        }
      }
      this.callbacks.dropLoot(target);
      const spawn = this.callbacks.monsterSpawn.get(target.id);
      const isBoss = spawn ? BOSS_KINDS.has(spawn.kind) : false;
      const delay = isBoss ? GAME_CONFIG.BOSS_RESPAWN_MS : GAME_CONFIG.RESPAWN_MS;
      const monsterId = target.id;
      const timer = this.clock.setTimeout(() => {
        this.respawnTimers.delete(monsterId);
        const mon = this.state.monsters.get(monsterId);
        if (!mon || !spawn) return;
        const md = MONSTERS[spawn.kind];
        mon.hp = md.hp; mon.maxHp = md.hp; mon.dead = false;
        mon.pos.x = spawn.x; mon.pos.z = spawn.z; mon.targetId = "";
        // Server-wide spawn toast for any boss-tier monster respawn.
        // (Dark Lord world-event spawn has its own broadcast in WorldRoom.)
        if (isBoss && spawn.kind !== "darklord") {
          this.callbacks.broadcast("bossSpawn", {
            name: BOSS_DISPLAY_NAME[spawn.kind] ?? spawn.kind,
            x: spawn.x,
            z: spawn.z,
          });
        }
      }, delay);
      this.respawnTimers.set(monsterId, timer);
    }
  }

  /** Cancel any pending respawn timer for a monster (use on despawn). */
  cancelRespawn(monsterId: string): void {
    const t = this.respawnTimers.get(monsterId);
    if (t && typeof (t as any).clear === "function") {
      try { (t as any).clear(); } catch { /* best effort */ }
    }
    this.respawnTimers.delete(monsterId);
  }

  tickStatuses() {
    const now = Date.now();
    for (const [sid, p] of this.state.players) {
      for (let i = p.statuses.length - 1; i >= 0; i--) {
        const s = p.statuses[i];
        if (s.endAt <= now) { p.statuses.splice(i, 1); continue; }
        const def = STATUS_DEFS[s.kind as StatusKind];
        if (!def?.tickMs || def.tickDmg === undefined) continue;
        const key = sid + ":" + s.kind;
        const last = this.statusTickAcc.get(key) ?? now;
        if (now - last >= def.tickMs) {
          this.statusTickAcc.set(key, now);
          if (def.tickDmg > 0) {
            p.hp = Math.max(0, p.hp - def.tickDmg);
            this.callbacks.broadcast("damage", { targetId: p.id, amount: def.tickDmg, from: s.fromId || s.kind });
            if (p.hp === 0 && !p.dead) {
              p.dead = true;
              this.clock.setTimeout(() => {
                const pp = this.state.players.get(sid);
                if (!pp) return;
                pp.hp = pp.maxHp; pp.dead = false;
                if (pp.houseSlot >= 0 && pp.houseSlot < HOUSE_SLOTS.length) {
                  const h = HOUSE_SLOTS[pp.houseSlot];
                  pp.pos.x = h.x; pp.pos.z = h.z;
                } else { pp.pos.x = 0; pp.pos.z = 0; }
                pp.statuses.clear();
              }, GAME_CONFIG.RESPAWN_MS);
            }
          } else {
            p.hp = Math.min(p.maxHp, p.hp - def.tickDmg);
            this.callbacks.broadcast("damage", { targetId: p.id, amount: -def.tickDmg, from: s.fromId || s.kind, heal: true });
          }
        }
      }
    }
    for (const [, m] of this.state.monsters) {
      for (let i = m.statuses.length - 1; i >= 0; i--) {
        const s = m.statuses[i];
        if (s.endAt <= now) { m.statuses.splice(i, 1); continue; }
        const def = STATUS_DEFS[s.kind as StatusKind];
        if (!def?.tickMs || def.tickDmg === undefined || def.tickDmg <= 0) continue;
        const key = m.id + ":" + s.kind;
        const last = this.statusTickAcc.get(key) ?? now;
        if (now - last >= def.tickMs) {
          this.statusTickAcc.set(key, now);
          m.hp = Math.max(0, m.hp - def.tickDmg);
          this.callbacks.broadcast("damage", { targetId: m.id, amount: def.tickDmg, from: s.fromId || s.kind });
          if (m.hp === 0 && !m.dead) {
            m.dead = true;
            m.statuses.clear();
            // Clear stale status-tick keys for this monster (same as primary kill path).
            for (const k of this.statusTickAcc.keys()) {
              if (k.endsWith(":" + m.id)) this.statusTickAcc.delete(k);
            }
            const killer = this.state.players.get(s.fromId);
            if (killer) {
              const mdef = MONSTERS[m.kind as MonsterKind];
              this.callbacks.grantExp(killer, mdef.exp);
              this.callbacks.onMonsterKilled(killer.id, m.kind);
            }
            this.callbacks.dropLoot(m);
            const spawn = this.callbacks.monsterSpawn.get(m.id);
            const monsterId2 = m.id;
            const t2 = this.clock.setTimeout(() => {
              this.respawnTimers.delete(monsterId2);
              const mon = this.state.monsters.get(monsterId2);
              if (!mon || !spawn) return;
              const md = MONSTERS[spawn.kind];
              mon.hp = md.hp; mon.maxHp = md.hp; mon.dead = false;
              mon.pos.x = spawn.x; mon.pos.z = spawn.z; mon.targetId = "";
              mon.statuses.clear();
            }, GAME_CONFIG.RESPAWN_MS);
            this.respawnTimers.set(monsterId2, t2);
          }
        }
      }
    }
  }
}
