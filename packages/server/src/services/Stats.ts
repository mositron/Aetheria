/**
 * Stats service — player stat recalculation (HP/MP/ATK/DEF from job + stats).
 * Extracted from WorldRoom.ts. Also re-exported by Combat.ts for convenience.
 */
import {
  Player, JOBS, ITEMS, derived, GAME_CONFIG, type JobId, maxMpFor
} from "@game/shared";

export class Stats {
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
}
