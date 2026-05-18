import { describe, it, expect } from "vitest";
import { Achievements } from "./Achievements";
import { ACHIEVEMENTS } from "@game/shared";

describe("Achievements service", () => {
  const svc = new Achievements();

  it("increments counters", () => {
    // Use "trees" since first_kill achievement is goal=1 (any kill unlocks it).
    const r = svc.bump("{}", "trees", 1);
    expect(r.progress.counters.trees).toBe(1);
  });

  it("unlocks achievement when counter crosses goal", () => {
    const killsAch = ACHIEVEMENTS.find((a) => a.counter === "kills");
    expect(killsAch).toBeDefined();
    const r = svc.bump("{}", "kills", killsAch!.goal);
    expect(r.unlocked.map((u) => u.id)).toContain(killsAch!.id);
  });

  it("does not unlock the same achievement twice", () => {
    const killsAch = ACHIEVEMENTS.find((a) => a.counter === "kills")!;
    const r1 = svc.bump("{}", "kills", killsAch.goal);
    const r2 = svc.bump(JSON.stringify(r1.progress), "kills", killsAch.goal);
    expect(r2.unlocked).toEqual([]);
  });

  it("handles corrupt JSON gracefully", () => {
    const r = svc.bump("{not json", "kills", 1);
    expect(r.progress.counters.kills).toBe(1);
  });

  it("scoring: kills=3pts, darklord=100pts, default=1pt", () => {
    expect(svc.contributionPoints("kills")).toBe(3);
    expect(svc.contributionPoints("darklord")).toBe(100);
    expect(svc.contributionPoints("trees")).toBe(1);
  });
});
