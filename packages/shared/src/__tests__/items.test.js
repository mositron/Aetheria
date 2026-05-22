import { describe, it, expect } from "vitest";
import { ITEMS, MONSTER_DROPS } from "../items";
describe("ITEMS catalog", () => {
    it("every itemId is self-consistent (key === id)", () => {
        for (const [key, def] of Object.entries(ITEMS)) {
            expect(def.id).toBe(key);
        }
    });
    it("every MONSTER_DROPS entry references a real item", () => {
        for (const [monster, drops] of Object.entries(MONSTER_DROPS)) {
            for (const drop of drops) {
                expect(ITEMS[drop.itemId], `${monster} drops unknown item ${drop.itemId}`).toBeDefined();
            }
        }
    });
    it("weapon ATK progression has no gap > 10", () => {
        const weapons = Object.values(ITEMS)
            .filter((i) => i.slot === "weapon" && typeof i.atk === "number")
            .map((i) => i.atk)
            .sort((a, b) => a - b);
        for (let i = 1; i < weapons.length; i++) {
            expect(weapons[i] - weapons[i - 1], `weapon gap ${weapons[i - 1]}→${weapons[i]} too large`).toBeLessThanOrEqual(10);
        }
    });
});
