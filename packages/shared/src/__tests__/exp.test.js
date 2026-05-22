import { describe, it, expect } from "vitest";
import { GAME_CONFIG } from "../constants";
describe("EXP_PER_LEVEL", () => {
    it("scales quadratically until Lv30", () => {
        expect(GAME_CONFIG.EXP_PER_LEVEL(1)).toBe(30);
        expect(GAME_CONFIG.EXP_PER_LEVEL(5)).toBe(150);
        expect(GAME_CONFIG.EXP_PER_LEVEL(10)).toBe(525);
        expect(GAME_CONFIG.EXP_PER_LEVEL(20)).toBe(2025);
        expect(GAME_CONFIG.EXP_PER_LEVEL(30)).toBe(4525);
    });
    it("softcaps linearly past Lv30 — no more grind wall", () => {
        expect(GAME_CONFIG.EXP_PER_LEVEL(31)).toBe(4645);
        expect(GAME_CONFIG.EXP_PER_LEVEL(40)).toBe(5725);
        expect(GAME_CONFIG.EXP_PER_LEVEL(50)).toBe(6925);
        // Without softcap, Lv50 would require 12525; we cut it ~45%.
        expect(GAME_CONFIG.EXP_PER_LEVEL(50)).toBeLessThan(7000);
    });
    it("is monotonically increasing", () => {
        let prev = 0;
        for (let lv = 1; lv <= 60; lv++) {
            const cur = GAME_CONFIG.EXP_PER_LEVEL(lv);
            expect(cur).toBeGreaterThan(prev);
            prev = cur;
        }
    });
});
