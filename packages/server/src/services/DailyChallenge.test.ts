import { describe, it, expect } from "vitest";
import { DailyChallenge } from "./DailyChallenge";

describe("DailyChallenge", () => {
  it("returns no reward until goal hit", () => {
    const d = new DailyChallenge();
    for (let i = 0; i < 19; i++) expect(d.bump("a", "kills")).toBeNull();
    const r = d.bump("a", "kills");
    expect(r?.goal).toBe("kills");
    expect(r?.zeny).toBe(300);
    expect(r?.itemId).toBe("hp_potion");
  });

  it("only awards each goal once per day", () => {
    const d = new DailyChallenge();
    for (let i = 0; i < 25; i++) d.bump("a", "kills");
    // We hit reward at 20; further kills must not re-trigger
    let extra = 0;
    for (let i = 0; i < 10; i++) if (d.bump("a", "kills")) extra++;
    expect(extra).toBe(0);
  });

  it("tracks kills and harvest independently", () => {
    const d = new DailyChallenge();
    for (let i = 0; i < 20; i++) d.bump("a", "kills");
    for (let i = 0; i < 14; i++) expect(d.bump("a", "harvest")).toBeNull();
    expect(d.bump("a", "harvest")?.goal).toBe("harvest");
  });

  it("per-sid isolation", () => {
    const d = new DailyChallenge();
    for (let i = 0; i < 20; i++) d.bump("a", "kills");
    expect(d.bump("b", "kills")).toBeNull(); // b's first kill
  });

  it("serialize/restore roundtrip preserves state", () => {
    const d1 = new DailyChallenge();
    for (let i = 0; i < 5; i++) d1.bump("a", "kills");
    const raw = d1.serialize("a");

    const d2 = new DailyChallenge();
    d2.restore("a", raw);
    expect(d2.status("a")?.kills).toBe(5);
  });

  it("restore drops state from a previous day", () => {
    const stale = JSON.stringify({ date: "2020-01-01", kills: 50, harvest: 0, rewards: ["kills"] });
    const d = new DailyChallenge();
    d.restore("a", stale);
    expect(d.status("a")).toBeNull();
  });

  it("restore handles corrupt JSON safely", () => {
    const d = new DailyChallenge();
    d.restore("a", "{not valid json}");
    expect(d.status("a")).toBeNull();
  });
});
