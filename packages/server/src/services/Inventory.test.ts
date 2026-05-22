import { describe, it, expect } from "vitest";
import { Inventory } from "./Inventory";
import { Player, GroundItem, ItemStack } from "@game/shared";

describe("Inventory service unit tests", () => {
  const mockState = {
    players: new Map<string, Player>(),
    drops: new Map<string, GroundItem>()
  };
  const mockCallbacks = {
    broadcast: () => {},
    recalcStats: () => {},
    spawnGroundItem: () => {},
    sendToClient: () => {}
  };

  const inventory = new Inventory(
    mockState,
    new Map(),
    new Set(),
    {},
    mockCallbacks
  );

  it("adds items to inventory and respects stacking", () => {
    const p = new Player();
    expect(p.inventory.length).toBe(0);

    // hp_potion stacks up to 99
    const added = inventory.addToInventory(p, "hp_potion", 150);
    expect(added).toBe(true);
    expect(p.inventory.length).toBe(2);
    expect(p.inventory[0].itemId).toBe("hp_potion");
    expect(p.inventory[0].qty).toBe(99);
    expect(p.inventory[1].itemId).toBe("hp_potion");
    expect(p.inventory[1].qty).toBe(51);
  });

  it("handles equipping and unequipping weapons/armors", () => {
    const p = new Player();
    mockState.players.set("p1", p);

    const sword = new ItemStack();
    sword.itemId = "iron_sword";
    sword.qty = 1;
    p.inventory.push(sword);

    inventory.handleEquip("p1", 0);
    expect(p.weapon).toBe("iron_sword");
    expect(p.inventory.length).toBe(0);

    inventory.handleUnequip("p1", "weapon");
    expect(p.weapon).toBe("");
    expect(p.inventory.length).toBe(1);
    expect(p.inventory[0].itemId).toBe("iron_sword");
  });
});
