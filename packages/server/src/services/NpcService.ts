/**
 * NpcService — shop buy/sell handlers + inventory helpers. Extracted from WorldRoom.ts.
 * These are stateless handlers that operate purely on state + client.
 */
import type { Client } from "@colyseus/core";
import type { WorldState, Player } from "@game/shared";
import { NPCS, ITEMS, SELL_RATIO } from "@game/shared";

export function countItem(p: Player, itemId: string): number {
  let n = 0;
  for (const s of p.inventory.values()) if (s.itemId === itemId) n += s.qty;
  return n;
}

export function removeItem(p: Player, itemId: string, qty: number) {
  let need = qty;
  for (let i = p.inventory.length - 1; i >= 0 && need > 0; i--) {
    const s = p.inventory[i];
    if (s.itemId !== itemId) continue;
    const take = Math.min(s.qty, need);
    s.qty -= take;
    need -= take;
    if (s.qty <= 0) p.inventory.splice(i, 1);
  }
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function defaultSellPrice(itemId: string): number {
  const map: Record<string, number> = {
    slime_jelly: 10, wolf_fang: 25, orc_tusk: 60, dark_crystal: 500,
    wood_log: 8, stone_chunk: 12, raw_meat: 15,
    apple: 6, bread: 12, cooked_meat: 30, water_flask: 8, berry: 4,
    energy_tonic: 40,
    hp_potion: 25, mp_potion: 20,
    wood_sword: 200, iron_sword: 1500, apprentice_staff: 400,
    leather_armor: 300, iron_armor: 2200, blade_of_dawn: 8000, dragon_plate: 7000,
  };
  return map[itemId] ?? 5;
}

export class NpcService {
  handleShopBuy(
    state: WorldState,
    client: Client,
    msg: { npcId: string; itemId: string; qty?: number },
    addToInventory: (p: any, itemId: string, qty: number) => boolean,
  ) {
    const p = state.players.get(client.sessionId);
    if (!p) return;
    const npc = (NPCS as any).find((n: any) => n.id === msg.npcId);
    if (!npc || (npc as any).kind !== "shop" || (npc as any).mapId !== state.mapId) return;
    if (dist(p.pos.x, p.pos.z, npc.x, npc.z) > 4) {
      client.send("shopError", { reason: "too far" }); return;
    }
    const entry = ((npc as any).shop as any[])?.find((e: any) => e.itemId === msg.itemId);
    if (!entry) return;
    const qty = Math.max(1, Math.min(99, (msg.qty ?? 1) | 0));
    const total = entry.price * qty;
    if (p.zeny < total) { client.send("shopError", { reason: "not enough zeny" }); return; }
    const added = addToInventory(p, msg.itemId, qty);
    if (!added) { client.send("shopError", { reason: "inventory full" }); return; }
    p.zeny -= total;
    client.send("shopBuyOk", {});
  }

  handleShopSell(state: WorldState, client: Client, msg: { npcId: string; invIndex: number; qty?: number }) {
    const p = state.players.get(client.sessionId);
    if (!p) return;
    const npc = (NPCS as any).find((n: any) => n.id === msg.npcId);
    if (!npc || (npc as any).kind !== "shop" || (npc as any).mapId !== state.mapId) return;
    if (dist(p.pos.x, p.pos.z, npc.x, npc.z) > 4) return;
    const stack = p.inventory[msg.invIndex] as any;
    if (!stack) return;
    const qty = Math.max(1, Math.min(stack.qty, (msg.qty ?? 1) | 0));
    const entry = ((npc as any).shop as any[])?.find((e: any) => e.itemId === stack.itemId);
    const basePrice = entry?.price ?? defaultSellPrice(stack.itemId);
    const earned = Math.floor(basePrice * SELL_RATIO) * qty;
    stack.qty -= qty;
    if (stack.qty <= 0) p.inventory.splice(msg.invIndex, 1);
    p.zeny += earned;
  }

  handleShopSellMany(state: WorldState, client: Client, msg: {
    npcId: string;
    items?: Array<{ invIndex: number; qty: number }>;
    sellAllMaterials?: boolean;
    sellAllJunk?: boolean;
  }) {
    const p = state.players.get(client.sessionId);
    if (!p) return;
    const npc = (NPCS as any).find((n: any) => n.id === msg.npcId);
    if (!npc || (npc as any).kind !== "shop" || (npc as any).mapId !== state.mapId) return;
    if (dist(p.pos.x, p.pos.z, npc.x, npc.z) > 4) return;

    const junkIds = ["berry", "apple", "wood", "stone", "raw_meat", "feather"];
    let entries: Array<{ invIndex: number; qty: number }> = [];

    if (Array.isArray(msg.items) && msg.items.length > 0) {
      entries = msg.items.map((it: any) => ({ invIndex: it.invIndex | 0, qty: Math.max(1, it.qty | 0) }));
    } else if (msg.sellAllMaterials || msg.sellAllJunk) {
      for (let i = 0; i < p.inventory.length; i++) {
        const stack = p.inventory[i] as any;
        const def = ITEMS[stack.itemId];
        if (!def) continue;
        const isMaterial = def.slot === "material";
        const isJunk = msg.sellAllJunk && (isMaterial || junkIds.indexOf(stack.itemId) >= 0);
        if (msg.sellAllMaterials ? isMaterial : isJunk) {
          entries.push({ invIndex: i, qty: stack.qty });
        }
      }
    }

    // Deduplicate invIndex to prevent same slot being sold multiple times
    const seenIndices = new Set<number>();
    const validEntries: typeof entries = [];
    for (const entry of entries) {
      if (seenIndices.has(entry.invIndex)) continue;
      seenIndices.add(entry.invIndex);
      validEntries.push(entry);
    }
    validEntries.sort((a, b) => b.invIndex - a.invIndex);
    let totalEarned = 0;
    let totalCount = 0;
    for (const e of validEntries) {
      const stack = p.inventory[e.invIndex] as any;
      if (!stack) continue;
      const sellQty = Math.min(stack.qty, e.qty);
      if (sellQty <= 0) continue;
      const shopEntry = ((npc as any).shop as any[])?.find((sh: any) => sh.itemId === stack.itemId);
      const basePrice = shopEntry?.price ?? defaultSellPrice(stack.itemId);
      totalEarned += Math.floor(basePrice * SELL_RATIO) * sellQty;
      totalCount += sellQty;
      stack.qty -= sellQty;
      if (stack.qty <= 0) p.inventory.splice(e.invIndex, 1);
    }
    p.zeny += totalEarned;
    if (totalCount > 0) {
      client.send("toast", { text: `ขายไป ${totalCount} ชิ้น ได้ ${totalEarned}z`, tone: "good" });
    }
  }
}