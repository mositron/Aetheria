// Daily challenge progress tracking + reward delivery.
//
// Goals (per UTC day):
//   - Kill 20 mobs → 300z + 5 HP potion
//   - Harvest 15 resource nodes → 200z + 5 MP potion
//
// Lv30+ players get 3 random challenges from ENDLESS_CHALLENGES instead.
//
// State persists in Character.dailyJson (string column) and is restored
// on player join if the date still matches today. Reward grants flow
// through callbacks so this service stays decoupled from inventory/zeny.

export type DailyChallengeDef = {
  id: string;
  type: "kill_boss" | "clear_dungeon" | "pvp_win" | "craft_item" | "gather" | "kills" | "harvest";
  desc: string;
  target: number;
  reward: { exp: number; zeny: number };
};

export type DailyChallengeData = {
  id: string;
  type: string;
  desc: string;
  target: number;
  progress: number;
  completed: boolean;
  reward: { exp: number; zeny: number };
};

export type DailyState = {
  date: string;
  kills: number;
  harvest: number;
  rewards: Set<string>;
  // Lv30+ endless challenges
  endlessChallenges?: DailyChallengeData[];
  lastDailyReset?: number; // timestamp of last midnight reset
};

export type DailyReward = {
  goal: "kills" | "harvest";
  zeny: number;
  itemId: string;
  itemQty: number;
  message: string;
};

const GOAL_KILLS = 20;
const GOAL_HARVEST = 15;

// Midnight UTC reset hour
export const DAILY_RESET_HOUR = 0;

const ENDLESS_CHALLENGES: DailyChallengeDef[] = [
  { id: "daily_boss_attack", type: "kill_boss",   desc: "โจมตีบอส 3 ตัว",          target: 3,  reward: { exp: 2000, zeny: 5000 } },
  { id: "daily_dungeon_clear", type: "clear_dungeon", desc: "Clear dungeon floor 5", target: 1, reward: { exp: 5000, zeny: 15000 } },
  { id: "daily_pvp_win",    type: "pvp_win",     desc: "ชนะ PvP 3 ครั้ง",           target: 3,  reward: { exp: 3000, zeny: 8000 } },
  { id: "daily_craft_epic", type: "craft_item",  desc: "Craft item ระดับ Rare",    target: 1,  reward: { exp: 1500, zeny: 5000 } },
  { id: "daily_gather",     type: "gather",      desc: "เก็บวัตถุดิบ 20 ชิ้น",     target: 20, reward: { exp: 800,  zeny: 2000 } },
];

const REWARDS: Record<"kills" | "harvest", DailyReward> = {
  kills:   { goal: "kills",   zeny: 300, itemId: "hp_potion", itemQty: 5, message: "🏆 Daily: ฆ่ามอน 20 ตัวสำเร็จ! +300z +5 HP Potion" },
  harvest: { goal: "harvest", zeny: 200, itemId: "mp_potion", itemQty: 5, message: "🏆 Daily: เก็บ 15 ทรัพยากร! +200z +5 MP Potion" },
};

export class DailyChallenge {
  private state = new Map<string, DailyState>();

  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Restore from persisted JSON (e.g. Character.dailyJson). Stale dates dropped. */
  restore(sid: string, raw: string | null | undefined): void {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        date?: string; kills?: number; harvest?: number; rewards?: string[];
        endlessChallenges?: DailyChallenge[]; lastDailyReset?: number;
      };
      if (parsed.date !== DailyChallenge.today()) return; // stale
      this.state.set(sid, {
        date: parsed.date ?? DailyChallenge.today(),
        kills: parsed.kills ?? 0,
        harvest: parsed.harvest ?? 0,
        rewards: new Set(parsed.rewards ?? []),
        endlessChallenges: (parsed.endlessChallenges as unknown as DailyChallengeData[] | undefined),
        lastDailyReset: parsed.lastDailyReset,
      });
    } catch {
      // corrupt JSON — skip silently, start fresh today
    }
  }

  /** Serialize for persistence. Returns "{}" if no state. */
  serialize(sid: string): string {
    const s = this.state.get(sid);
    if (!s) return "{}";
    return JSON.stringify({
      date: s.date, kills: s.kills, harvest: s.harvest,
      rewards: [...s.rewards],
      endlessChallenges: s.endlessChallenges,
      lastDailyReset: s.lastDailyReset,
    });
  }

  /**
   * Increment progress. Returns the unlocked reward (if any) so the caller
   * can grant zeny/items via its inventory service.
   */
  bump(sid: string, kind: "kills" | "harvest", by = 1): DailyReward | null {
    const today = DailyChallenge.today();
    let s = this.state.get(sid);
    if (!s || s.date !== today) {
      s = { date: today, kills: 0, harvest: 0, rewards: new Set() };
      this.state.set(sid, s);
    }
    if (kind === "kills") s.kills += by;
    else s.harvest += by;

    const goalMet =
      kind === "kills"   ? s.kills >= GOAL_KILLS :
      kind === "harvest" ? s.harvest >= GOAL_HARVEST :
      false;
    if (goalMet && !s.rewards.has(kind)) {
      s.rewards.add(kind);
      return REWARDS[kind];
    }
    return null;
  }

  /** Current progress snapshot (for client display). */
  status(sid: string): DailyState | null {
    return this.state.get(sid) ?? null;
  }

  /** Get the active daily challenges for a player.
   * Lv30+ → 3 random ENDLESS_CHALLENGES (regenerated each day at midnight UTC).
   * <Lv30 → empty (relies on old kill/harvest bump flow via status()).
   */
  getDailyChallenges(sid: string, playerLevel: number): DailyChallengeData[] {
    const today = DailyChallenge.today();
    let s = this.state.get(sid);
    if (!s || s.date !== today) {
      s = { date: today, kills: 0, harvest: 0, rewards: new Set() };
      this.state.set(sid, s);
    }
    if (playerLevel >= 30) {
      // Return cached challenges for today if already generated. Re-validate
      // each cached entry against the current ENDLESS_CHALLENGES definitions:
      // if a definition was rebalanced or removed in a server redeploy mid-day,
      // refresh target/reward in-place (and prune missing ones) so progress is
      // measured against the live numbers — not numbers frozen at the moment
      // the player first opened the panel today.
      if (s.endlessChallenges && s.endlessChallenges.length > 0) {
        const refreshed = s.endlessChallenges.flatMap((ch) => {
          const def = ENDLESS_CHALLENGES.find((d) => d.id === ch.id);
          if (!def) return [];
          return [{
            ...ch,
            type: def.type,
            desc: def.desc,
            target: def.target,
            reward: def.reward,
            completed: ch.progress >= def.target,
          }];
        });
        s.endlessChallenges = refreshed;
        return refreshed;
      }
      // Pick 3 random unique challenges from the pool
      const shuffled = [...ENDLESS_CHALLENGES].sort(() => Math.random() - 0.5);
      const chosen = shuffled.slice(0, 3);
      const challenges = chosen.map((def) => ({
        id: def.id,
        type: def.type,
        desc: def.desc,
        target: def.target,
        progress: 0,
        completed: false,
        reward: def.reward,
      }));
      s.endlessChallenges = challenges;
      return challenges;
    }
    return [];
  }

  /**
   * Bump progress on an endless-type challenge.
   * Returns the reward description if the challenge was just completed.
   */
  bumpEndless(sid: string, type: string, by = 1): { exp: number; zeny: number } | null {
    const today = DailyChallenge.today();
    let s = this.state.get(sid);
    if (!s || s.date !== today) {
      s = { date: today, kills: 0, harvest: 0, rewards: new Set() };
      this.state.set(sid, s);
    }
    if (!s.endlessChallenges) return null;
    const ch = s.endlessChallenges.find((c) => c.type === type);
    if (!ch || ch.completed) return null;
    ch.progress = Math.min(ch.progress + by, ch.target);
    if (ch.progress >= ch.target && !ch.completed) {
      ch.completed = true;
      return ch.reward;
    }
    return null;
  }

  forget(sid: string): void {
    this.state.delete(sid);
  }
}
