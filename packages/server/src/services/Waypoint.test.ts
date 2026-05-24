import { describe, it, expect } from "vitest";
import { tryWaypoint, WAYPOINT_COST } from "./Waypoint.js";

describe("Waypoint service", () => {
  it("returns ok with cost+coords for a known waypoint and enough zeny", () => {
    const r = tryWaypoint(100, "wp_prontera");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cost).toBe(WAYPOINT_COST);
      expect(r.name).toBe("Prontera");
      expect(r.x).toBe(155);
    }
  });
  it("returns no-zeny when below cost", () => {
    expect(tryWaypoint(10, "wp_prontera")).toEqual({ ok: false, reason: "no-zeny" });
  });
  it("returns unknown-waypoint for missing id", () => {
    expect(tryWaypoint(1000, "wp_nope")).toEqual({ ok: false, reason: "unknown-waypoint" });
  });
});
