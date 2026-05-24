// Achievement progress + unlock detection. Pure state machine.
//
// WorldRoom owns the side effects (toast to client, zeny/item rewards,
// leaderboard contribution); this service computes WHICH achievements
// unlocked and exposes the updated JSON blob for persistence.

import { ACHIEVEMENTS, emptyAchievementProgress, type AchievementProgress } from "@game/shared";

export type AchievementUnlock = {
  id: string;
  name: string;
  icon: string;
  reward?: { zeny?: number; itemId?: string; qty?: number };
};

export type BumpResult = {
  /** Achievements that just crossed their goal in this bump. */
  unlocked: AchievementUnlock[];
  /** Updated progress to persist (serialize to JSON). */
  progress: AchievementProgress;
};

export class Achievements {
  /**
   * Increment a counter and return any newly-unlocked achievements.
   * Parsing is defensive — corrupt JSON resets to empty rather than throw.
   */
  bump(rawJson: string | undefined, counter: string, by = 1): BumpResult {
    let prog: AchievementProgress;
    try { prog = JSON.parse(rawJson || "{}"); }
    catch { prog = emptyAchievementProgress(); }
    if (!prog.counters) prog.counters = {};
    if (!prog.unlocked) prog.unlocked = [];

    prog.counters[counter] = (prog.counters[counter] ?? 0) + by;
    const unlocked: AchievementUnlock[] = [];

    for (const def of ACHIEVEMENTS) {
      if (def.counter !== counter) continue;
      if (prog.unlocked.includes(def.id)) continue;
      if ((prog.counters[counter] ?? 0) >= def.goal) {
        prog.unlocked.push(def.id);
        unlocked.push({ id: def.id, name: def.name, icon: def.icon, reward: def.reward });
      }
    }

    return { unlocked, progress: prog };
  }

  /** Leaderboard contribution points for a counter type. */
  contributionPoints(counter: string): number {
    if (counter === "kills") return 3;
    if (counter === "darklord") return 100;
    return 1;
  }
}
