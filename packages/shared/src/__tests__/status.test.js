import { describe, it, expect } from "vitest";
import { STATUS_DEFS } from "../status";
describe("STATUS_DEFS catalog", () => {
    it("every key matches its id field", () => {
        for (const [key, def] of Object.entries(STATUS_DEFS)) {
            expect(def.id).toBe(key);
        }
    });
    it("preventAction statuses are stun/freeze only", () => {
        const blocking = Object.values(STATUS_DEFS).filter((s) => s.preventAction).map((s) => s.id);
        expect(blocking.sort()).toEqual(["freeze", "stun"]);
    });
    it("damage-over-time statuses have a positive tick + interval", () => {
        for (const s of Object.values(STATUS_DEFS)) {
            if (s.tickDmg !== undefined && s.tickDmg > 0) {
                expect(s.tickMs).toBeGreaterThan(0);
                expect(s.tickMs).toBeLessThanOrEqual(5000); // sanity: no 1-hour ticks
            }
        }
    });
    it("regen is the only heal-over-time", () => {
        const heals = Object.values(STATUS_DEFS).filter((s) => (s.tickDmg ?? 0) < 0);
        expect(heals.length).toBe(1);
        expect(heals[0].id).toBe("regen");
    });
    it("speedMult is in [0, 1] when present", () => {
        for (const s of Object.values(STATUS_DEFS)) {
            if (s.speedMult !== undefined) {
                expect(s.speedMult).toBeGreaterThanOrEqual(0);
                expect(s.speedMult).toBeLessThanOrEqual(1);
            }
        }
    });
});
