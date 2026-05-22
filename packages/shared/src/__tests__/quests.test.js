import { describe, it, expect } from "vitest";
import { QUESTS } from "../quests";
import { ITEMS } from "../items";
import { MONSTERS } from "../constants";
describe("QUESTS catalog", () => {
    it("every quest's next field points to a real quest", () => {
        for (const q of Object.values(QUESTS)) {
            if (q.next) {
                expect(QUESTS[q.next], `${q.id}.next → ${q.next} not found`).toBeDefined();
            }
        }
    });
    it("every kill objective references a real monster", () => {
        for (const q of Object.values(QUESTS)) {
            if (q.objective.kind === "kill") {
                expect(MONSTERS[q.objective.monster]).toBeDefined();
            }
        }
    });
    it("every collect objective + reward references a real item", () => {
        for (const q of Object.values(QUESTS)) {
            if (q.objective.kind === "collect") {
                expect(ITEMS[q.objective.itemId]).toBeDefined();
            }
            if (q.reward.itemId) {
                expect(ITEMS[q.reward.itemId]).toBeDefined();
            }
        }
    });
    it("min level is positive integer", () => {
        for (const q of Object.values(QUESTS)) {
            expect(q.minLevel).toBeGreaterThan(0);
            expect(Number.isInteger(q.minLevel)).toBe(true);
        }
    });
});
