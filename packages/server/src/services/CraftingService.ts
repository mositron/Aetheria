/**
 * CraftingService — recipe crafting. Extracted from WorldRoom.ts.
 */
import { type Player, ITEMS, RECIPES_BY_ID, QUALITY_COLORS, QUALITY_NAMES, type ItemQuality, type Recipe } from "@game/shared";
import { countItem, removeItem } from "./Inventory.js";
import type { Client } from "@colyseus/core";

function rollQuality(recipe: Recipe, benchBonus: number): ItemQuality {
  const qc = recipe.qualityChance;
  if (!qc) return "normal";
  const roll = Math.random();
  let cumulative = 0;
  cumulative += qc.legendary ?? 0;
  if (roll < cumulative + benchBonus * 0.05) return "legendary";
  cumulative += qc.masterwork ?? 0;
  if (roll < cumulative + benchBonus * 0.1) return "masterwork";
  cumulative += qc.rare ?? 0;
  if (roll < cumulative + benchBonus * 0.15) return "rare";
  cumulative += qc.superior ?? 0;
  if (roll < cumulative + benchBonus * 0.25) return "superior";
  return "normal";
}

export class CraftingService {
  constructor(
    private state: { players: Map<string, Player> },
    private addToInventory: (p: Player, itemId: string, qty: number, quality?: ItemQuality) => boolean,
    private bumpAchievement: (sid: string, counter: string, by?: number) => void,
  ) {}

  handleCraft(client: Client, recipeId: string, benchTier = 0) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    const recipe = RECIPES_BY_ID[recipeId];
    if (!recipe) { client.send("system", { text: "ไม่พบสูตร" }); return; }
    if (!recipe.discovered) { client.send("system", { text: "ยังไม่ค้นพบสูตรนี้" }); return; }
    if (recipe.minBenchTier !== undefined && recipe.minBenchTier > benchTier) {
      client.send("system", { text: "ต้องใช้เตาหลอมที่ดีกว่า" }); return;
    }
    if (recipe.minLevel && p.level < recipe.minLevel) {
      client.send("system", { text: `ต้องเลเวล ${recipe.minLevel}` }); return;
    }
    for (const inp of recipe.inputs) {
      if (countItem(p, inp.itemId) < inp.qty) {
        client.send("system", { text: `ขาด ${ITEMS[inp.itemId]?.name ?? inp.itemId} ${inp.qty}` }); return;
      }
    }
    // Deduct inputs
    for (const inp of recipe.inputs) removeItem(p, inp.itemId, inp.qty);
    // Roll quality
    const quality = rollQuality(recipe, benchTier * 0.1);
    const qualityColor = QUALITY_COLORS[quality];
    const qualityName = QUALITY_NAMES[quality];
    // Add output
    if (!this.addToInventory(p, recipe.output.itemId, recipe.output.qty, quality)) {
      // refund on failure
      for (const inp of recipe.inputs) this.addToInventory(p, inp.itemId, inp.qty);
      client.send("system", { text: "กระเป๋าเต็ม" }); return;
    }
    const out = ITEMS[recipe.output.itemId];
    const qualityPrefix = quality === "normal" ? "" : `[${qualityName}] `;
    client.send("system", { text: `🔨 ทำ ${out?.icon ?? ""} ${qualityPrefix}${out?.name ?? recipe.output.itemId} ×${recipe.output.qty} สำเร็จ` });
    if (recipe.category === "cooking") this.bumpAchievement(sid, "cooks");
    else if (recipe.category === "weapon" || recipe.category === "armor") this.bumpAchievement(sid, "smiths");
  }
}
