// Daily challenge progress tracking + reward delivery.
//
// Goals (per UTC day):
//   - Kill 20 mobs → 300z + 5 HP potion
//   - Harvest 15 resource nodes → 200z + 5 MP potion
//
// State persists in Character.dailyJson (string column) and is restored
// on player join if the date still matches today. Reward grants flow
// through callbacks so this service stays decoupled from inventory/zeny.

export type DailyState = {
  date: string;
  kills: number;
  harvest: number;
  rewards: Set<string>;
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
      const parsed = JSON.parse(raw) as { date?: string; kills?: number; harvest?: number; rewards?: string[] };
      if (parsed.date !== DailyChallenge.today()) return; // stale
      this.state.set(sid, {
        date: parsed.date,
        kills: parsed.kills ?? 0,
        harvest: parsed.harvest ?? 0,
        rewards: new Set(parsed.rewards ?? []),
      });
    } catch {
      // corrupt JSON — skip silently, start fresh today
    }
  }

  /** Serialize for persistence. Returns "{}" if no state. */
  serialize(sid: string): string {
    const s = this.state.get(sid);
    if (!s) return "{}";
    return JSON.stringify({ date: s.date, kills: s.kills, harvest: s.harvest, rewards: [...s.rewards] });
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

  forget(sid: string): void {
    this.state.delete(sid);
  }
}
