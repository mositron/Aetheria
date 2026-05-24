import { describe, it, expect } from "vitest";
import { getCurrentSeason } from "./Season.js";

describe("Season detector", () => {
  it("songkran covers Apr 13-15", () => {
    expect(getCurrentSeason(new Date(2026, 3, 13))).toBe("songkran");
    expect(getCurrentSeason(new Date(2026, 3, 15))).toBe("songkran");
    expect(getCurrentSeason(new Date(2026, 3, 16))).toBe("none");
  });
  it("halloween only Oct 31", () => {
    expect(getCurrentSeason(new Date(2026, 9, 31))).toBe("halloween");
    expect(getCurrentSeason(new Date(2026, 9, 30))).toBe("none");
  });
  it("christmas Dec 24-26", () => {
    expect(getCurrentSeason(new Date(2026, 11, 25))).toBe("christmas");
    expect(getCurrentSeason(new Date(2026, 11, 27))).toBe("none");
  });
  it("loy krathong Nov 20-25", () => {
    expect(getCurrentSeason(new Date(2026, 10, 22))).toBe("loy_krathong");
    expect(getCurrentSeason(new Date(2026, 10, 26))).toBe("none");
  });
  it("regular day returns none", () => {
    expect(getCurrentSeason(new Date(2026, 5, 15))).toBe("none");
  });
});
