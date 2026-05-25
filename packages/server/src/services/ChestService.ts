// Chest spawn + open + respawn — race-safe via openedBy guard.
//
// Loot tables per cave theme. Two chests per cave, placed inside r*0.5
// at deterministic angles. Opened chests refill 5 minutes later.

import { CAVES, type CaveDef } from "@game/shared";
import type { ChestSchema } from "@game/shared";

export const CHEST_RESPAWN_MS = 5 * 60 * 1000;
export const CHEST_PER_CAVE = 2;
export const CHEST_OPEN_RADIUS = 2.5;

export type ChestLoot = { itemId: string; qty: number };

// Loot table per cave theme. Picked randomly on open.
export const CHEST_LOOT: Record<CaveDef["theme"], ChestLoot[]> = {
  shadow:     [{ itemId: "dark_crystal", qty: 1 }, { itemId: "hp_potion", qty: 5 }, { itemId: "dark_crystal", qty: 2 }],
  frost:      [{ itemId: "ice_crystal",  qty: 1 }, { itemId: "hp_potion", qty: 3 }, { itemId: "winter_essence", qty: 1 }],
  desert:     [{ itemId: "desert_pearl", qty: 1 }, { itemId: "hp_potion", qty: 4 }, { itemId: "stone_chunk", qty: 5 }],
  swamp:      [{ itemId: "swamp_herb",   qty: 3 }, { itemId: "serpent_scale", qty: 2 }, { itemId: "mp_potion", qty: 3 }],
  forest:     [{ itemId: "wood_log",     qty: 8 }, { itemId: "orc_tusk", qty: 2 }, { itemId: "hp_potion", qty: 3 }],
  wilderness: [{ itemId: "dark_crystal", qty: 2 }, { itemId: "gacha_box", qty: 1 }, { itemId: "blade_of_dawn", qty: 1 }],
};

export type ChestSpawnInfo = { id: string; x: number; z: number; theme: CaveDef["theme"] };

/** Deterministic chest spawn positions for all caves. */
export function generateChestSpawns(): ChestSpawnInfo[] {
  const out: ChestSpawnInfo[] = [];
  for (const cave of CAVES) {
    for (let i = 0; i < CHEST_PER_CAVE; i++) {
      // Deterministic angles offset around the cave center
      const angle = (i / CHEST_PER_CAVE) * Math.PI * 2 + (cave.x * 0.01);
      const r = cave.r * 0.5;
      out.push({
        id: `chest_${cave.id}_${i}`,
        x: cave.x + Math.cos(angle) * r,
        z: cave.z + Math.sin(angle) * r,
        theme: cave.theme,
      });
    }
  }
  return out;
}

/** Pick one random loot entry from the theme's table. */
export function rollChestLoot(theme: CaveDef["theme"]): ChestLoot {
  const table = CHEST_LOOT[theme];
  return table[Math.floor(Math.random() * table.length)];
}

/** Race-safe open: returns the loot if successful, null if already opened.
 *  Mutates `chest.openedBy`/`respawnAt` atomically (single-threaded Node).
 *  Caller is responsible for distance + auth checks. */
export function tryOpenChest(
  chest: ChestSchema,
  playerId: string,
  now: number,
): ChestLoot | null {
  if (chest.openedBy) return null;
  chest.openedBy = playerId;
  chest.respawnAt = now + CHEST_RESPAWN_MS;
  return rollChestLoot(chest.theme as CaveDef["theme"]);
}

/** Re-arm chests where respawnAt has elapsed. Call from room tick. */
export function tickChests(chests: Iterable<ChestSchema>, now: number): void {
  for (const c of chests) {
    if (c.openedBy && c.respawnAt > 0 && now >= c.respawnAt) {
      c.openedBy = "";
      c.respawnAt = 0;
    }
  }
}
