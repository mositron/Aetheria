import {
  Player, ItemStack, ITEMS, GroundItem
} from "@game/shared";

const INVENTORY_SIZE = 200;

/** Count total quantity of itemId in player's inventory. */
export function countItem(p: Player, itemId: string): number {
  let n = 0;
  for (const s of p.inventory.values()) if (s.itemId === itemId) n += s.qty;
  return n;
}

/** Remove qty of itemId from player's inventory (from end for stack order). */
export function removeItem(p: Player, itemId: string, qty: number): void {
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

export class Inventory {
  constructor(
    private state: { players: Map<string, Player>; drops: Map<string, GroundItem> },
    private lastAttack: Map<string, number>,
    private botIds: Set<string>,
    private prisma: any,
    private callbacks: {
      broadcast: (type: string, data: any) => void;
      recalcStats: (p: Player) => void;
      spawnGroundItem: (itemId: string, qty: number, x: number, z: number) => void;
      sendToClient: (sid: string, type: string, data: any) => void;
    }
  ) {}

  async addToInventoryOrMail(p: Player, itemId: string, qty: number, source = "REWARD") {
    if (this.addToInventory(p, itemId, qty)) return;
    try {
      await this.prisma.mail.create({
        data: {
          toName: p.name, fromName: source,
          subject: `${itemId} ×${qty}`,
          body: `กระเป๋าเต็ม — รางวัลถูกส่งไปไว้ในจดหมาย`,
          zeny: 0, itemId, itemQty: qty,
        },
      });
      this.callbacks.sendToClient(p.id, "system", { text: `📬 ${itemId} ×${qty} ส่งเป็นจดหมาย (กระเป๋าเต็ม)` });
    } catch (e) {
      console.error("[addToInventoryOrMail] mail failed", e);
    }
  }

  addToInventory(p: Player, itemId: string, qty: number, quality?: string): boolean {
    const def = ITEMS[itemId];
    if (!def) return false;
    const stackable = (def.stack ?? 1) > 1;
    if (stackable) {
      for (const s of p.inventory.values()) {
        if (s.itemId === itemId && s.qty < (def.stack ?? 1)) {
          const room = (def.stack ?? 1) - s.qty;
          const add = Math.min(room, qty);
          s.qty += add;
          qty -= add;
          if (qty <= 0) return true;
        }
      }
    }
    while (qty > 0) {
      if (p.inventory.length >= INVENTORY_SIZE) return false;
      const stack = new ItemStack();
      stack.itemId = itemId;
      stack.qty = stackable ? Math.min(qty, def.stack ?? 1) : 1;
      p.inventory.push(stack);
      qty -= stack.qty;
    }
    return true;
  }

  handleEquip(sid: string, invIndex: number) {
    const p = this.state.players.get(sid);
    if (!p) return;
    if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return;
    const stack = p.inventory[invIndex];
    if (!stack) return;
    const def = ITEMS[stack.itemId];
    if (!def) return;
    if (def.slot !== "weapon" && def.slot !== "armor") return;
    const slot = def.slot;
    const prevId = slot === "weapon" ? p.weapon : p.armor;
    if (slot === "weapon") p.weapon = stack.itemId;
    else p.armor = stack.itemId;
    p.inventory.splice(invIndex, 1);
    if (prevId) this.addToInventory(p, prevId, 1);
    this.callbacks.recalcStats(p);
  }

  handleUnequip(sid: string, slot: "weapon" | "armor") {
    const p = this.state.players.get(sid);
    if (!p) return;
    const id = slot === "weapon" ? p.weapon : p.armor;
    if (!id) return;
    if (!this.addToInventory(p, id, 1)) return;
    if (slot === "weapon") p.weapon = "";
    else p.armor = "";
    this.callbacks.recalcStats(p);
  }

  handleUseItem(sid: string, invIndex: number) {
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return;
    const stack = p.inventory[invIndex];
    if (!stack) return;
    const def = ITEMS[stack.itemId];
    if (!def) return;
    if (def.slot !== "consumable") return;
    if (def.hpRestore) p.hp = Math.min(p.maxHp, p.hp + def.hpRestore);
    if (def.mpRestore) p.mp = Math.min(p.maxMp, p.mp + def.mpRestore);
    if (def.hungerRestore) p.hunger = Math.min(100, p.hunger + def.hungerRestore);
    if (def.thirstRestore) p.thirst = Math.min(100, p.thirst + def.thirstRestore);
    if (def.staminaRestore) p.stamina = Math.min(p.maxStamina, p.stamina + def.staminaRestore);
    if (stack.itemId === "gacha_box") {
      const rolls = [
        { id: "hp_potion", qty: 10, weight: 30 },
        { id: "cooked_meat", qty: 5, weight: 20 },
        { id: "energy_tonic", qty: 3, weight: 15 },
        { id: "wood_log", qty: 20, weight: 15 },
        { id: "stone_chunk", qty: 15, weight: 12 },
        { id: "iron_sword", qty: 1, weight: 4 },
        { id: "leather_armor", qty: 1, weight: 4 },
        { id: "glider", qty: 1, weight: 1 },
        { id: "blade_of_dawn", qty: 1, weight: 0.5 },
        { id: "dragon_plate", qty: 1, weight: 0.5 },
      ];
      const total = rolls.reduce((a, r) => a + r.weight, 0);
      let r = Math.random() * total;
      for (const roll of rolls) {
        r -= roll.weight;
        if (r <= 0) {
          this.addToInventory(p, roll.id, roll.qty);
          const idef = ITEMS[roll.id];
          this.callbacks.sendToClient(p.id, "system", { text: `🎁 ได้ ${idef?.icon ?? ""} ${idef?.name ?? roll.id} ×${roll.qty}!` });
          break;
        }
      }
    }
    stack.qty -= 1;
    if (stack.qty <= 0) p.inventory.splice(invIndex, 1);
  }

  handleDrop(sid: string, invIndex: number, qty?: number) {
    const p = this.state.players.get(sid);
    if (!p) return;
    if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return;
    const stack = p.inventory[invIndex];
    if (!stack) return;
    const dropQty = Math.max(1, Math.min(stack.qty, qty ?? stack.qty));
    this.callbacks.spawnGroundItem(stack.itemId, dropQty, p.pos.x + (Math.random() - 0.5), p.pos.z + (Math.random() - 0.5));
    stack.qty -= dropQty;
    if (stack.qty <= 0) p.inventory.splice(invIndex, 1);
  }

  handlePickup(sid: string, dropId: string) {
    const p = this.state.players.get(sid);
    const g = this.state.drops.get(dropId);
    if (!p || !g) return;
    if (Math.hypot(p.pos.x - g.pos.x, p.pos.z - g.pos.z) > 2.5) return;
    if (!this.addToInventory(p, g.itemId, g.qty)) {
      const key = "invfull:" + sid;
      const last = this.lastAttack.get(key) ?? 0;
      const now = Date.now();
      if (now - last > 3000 && !this.botIds.has(sid)) {
        this.lastAttack.set(key, now);
        this.callbacks.sendToClient(sid, "system", { text: "🎒 กระเป๋าเต็ม — ใช้/ขาย/ทิ้งของบางอย่างก่อน" });
      }
      return;
    }
    this.state.drops.delete(dropId);
  }
}
