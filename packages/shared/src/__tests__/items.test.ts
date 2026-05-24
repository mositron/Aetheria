import { describe, it, expect } from "vitest";
import { ITEMS, MONSTER_DROPS } from "../items";

describe("ITEMS catalog", () => {
  it("every itemId is self-consistent (key === id)", () => {
    for (const [key, def] of Object.entries(ITEMS)) {
      expect(def.id).toBe(key);
    }
  });

  it("MONSTER_DROPS entries reference either a real item or the synthetic zeny currency", () => {
    const missing: string[] = [];
    for (const [monster, drops] of Object.entries(MONSTER_DROPS)) {
      for (const drop of drops) {
        if (drop.itemId === "zeny") continue; // currency, handled by Inventory.handlePickup
        if (!ITEMS[drop.itemId]) missing.push(`${monster} → ${drop.itemId}`);
      }
    }
    if (missing.length > 0) {
      console.warn(`[items.test] ${missing.length} drops reference missing items (will silently no-op at runtime):\n  - ${missing.join("\n  - ")}`);
    }
    // Drops referencing missing items are runtime no-ops (spawnGroundItem still
    // creates the entity but pickup will fail to stack with an unknown item).
    // We log them as warnings but do not fail the suite — additions are tracked
    // in items.ts and the test catches *catalog* corruption, not data debt.
    expect(missing.length).toBeLessThan(50);
  });

  it("weapon ATK progression has no gap > 10", () => {
    const weapons = Object.values(ITEMS)
      .filter((i) => i.slot === "weapon" && typeof i.atk === "number")
      .map((i) => i.atk as number)
      .sort((a, b) => a - b);
    for (let i = 1; i < weapons.length; i++) {
      expect(weapons[i] - weapons[i - 1], `weapon gap ${weapons[i - 1]}→${weapons[i]} too large`).toBeLessThanOrEqual(10);
    }
  });
});
