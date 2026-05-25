import { describe, it, expect, vi } from "vitest";
import {
  generateChestSpawns,
  tryOpenChest,
  tickChests,
  rollChestLoot,
  CHEST_PER_CAVE,
  CHEST_RESPAWN_MS,
  CHEST_LOOT,
} from "./ChestService.js";
import { CAVES, ChestSchema } from "@game/shared";

function makeChest(theme: string): ChestSchema {
  const c = new ChestSchema();
  c.id = "test_chest";
  c.x = 0;
  c.z = 0;
  c.theme = theme;
  return c;
}

describe("ChestService", () => {
  describe("generateChestSpawns", () => {
    it("produces CHEST_PER_CAVE chests for every cave", () => {
      const spawns = generateChestSpawns();
      expect(spawns.length).toBe(CAVES.length * CHEST_PER_CAVE);
    });

    it("places chests inside cave radius (r*0.5)", () => {
      for (const s of generateChestSpawns()) {
        const cave = CAVES.find((c) => s.id.startsWith(`chest_${c.id}_`));
        expect(cave).toBeTruthy();
        const d = Math.hypot(s.x - cave!.x, s.z - cave!.z);
        expect(d).toBeLessThanOrEqual(cave!.r * 0.5 + 0.0001);
      }
    });

    it("is deterministic across calls", () => {
      const a = generateChestSpawns();
      const b = generateChestSpawns();
      expect(a).toEqual(b);
    });

    it("each chest id is unique", () => {
      const ids = new Set(generateChestSpawns().map((s) => s.id));
      expect(ids.size).toBe(CAVES.length * CHEST_PER_CAVE);
    });
  });

  describe("tryOpenChest", () => {
    it("returns loot on first open and marks openedBy", () => {
      const c = makeChest("shadow");
      const loot = tryOpenChest(c, "player1", 1000);
      expect(loot).not.toBeNull();
      expect(c.openedBy).toBe("player1");
      expect(c.respawnAt).toBe(1000 + CHEST_RESPAWN_MS);
    });

    it("returns null on second open (race-safe)", () => {
      const c = makeChest("shadow");
      tryOpenChest(c, "player1", 1000);
      const loot = tryOpenChest(c, "player2", 1500);
      expect(loot).toBeNull();
      expect(c.openedBy).toBe("player1"); // unchanged
    });

    it("loot comes from the theme's table", () => {
      const c = makeChest("frost");
      const loot = tryOpenChest(c, "p", Date.now())!;
      const tableIds = new Set(CHEST_LOOT.frost.map((l) => l.itemId));
      expect(tableIds.has(loot.itemId)).toBe(true);
    });
  });

  describe("tickChests", () => {
    it("re-arms chests whose respawn has elapsed", () => {
      const c = makeChest("desert");
      tryOpenChest(c, "p", 1000);
      tickChests([c], 1000 + CHEST_RESPAWN_MS);
      expect(c.openedBy).toBe("");
      expect(c.respawnAt).toBe(0);
    });

    it("leaves chests not yet due", () => {
      const c = makeChest("desert");
      tryOpenChest(c, "p", 1000);
      tickChests([c], 1000 + CHEST_RESPAWN_MS - 1);
      expect(c.openedBy).toBe("p");
    });

    it("ignores already-available chests", () => {
      const c = makeChest("forest");
      tickChests([c], Date.now());
      expect(c.openedBy).toBe("");
      expect(c.respawnAt).toBe(0);
    });
  });

  describe("rollChestLoot", () => {
    it("always returns an entry from the theme table", () => {
      for (const theme of Object.keys(CHEST_LOOT) as Array<keyof typeof CHEST_LOOT>) {
        for (let i = 0; i < 20; i++) {
          const loot = rollChestLoot(theme);
          expect(CHEST_LOOT[theme].some((l) => l.itemId === loot.itemId && l.qty === loot.qty)).toBe(true);
        }
      }
    });

    it("uses Math.random for selection (mockable)", () => {
      const spy = vi.spyOn(Math, "random").mockReturnValue(0);
      const loot = rollChestLoot("shadow");
      expect(loot).toEqual(CHEST_LOOT.shadow[0]);
      spy.mockRestore();
    });
  });
});
