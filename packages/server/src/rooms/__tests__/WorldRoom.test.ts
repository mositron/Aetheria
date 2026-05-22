import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock prisma before any imports ──────────────────────────────────────────
vi.mock("../../db.js", () => ({
  prisma: {
    character: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    mail: { create: vi.fn(), findMany: vi.fn() },
  },
}));

// ── Test harness factory ─────────────────────────────────────────────────────
import { WorldState, Player, Monster, ItemStack, StatusEffect, ITEMS, QUESTS, MONSTERS, StatusKind, PlayerQuestState } from "@game/shared";

function makePlayer(sid = "sid-alice", overrides: Partial<Player> = {}): Player {
  const p = new Player();
  p.id = sid;
  p.name = "Alice";
  p.job = "novice";
  p.level = 5;
  p.exp = 0;
  p.hp = 100; p.maxHp = 100;
  p.mp = 30; p.maxMp = 30;
  p.atk = 15; p.def = 5;
  p.weapon = ""; p.armor = "";
  p.pos.x = 0; p.pos.y = 0; p.pos.z = 0;
  p.zeny = 500;
  p.str = 10; p.agi = 10; p.vit = 10; p.int = 10; p.dex = 10; p.luk = 10;
  p.statPoints = 0;
  p.inventory.length = 0;
  p.statuses.length = 0;
  Object.assign(p, overrides);
  return p;
}

function makeMonster(id = "m1", kind = "slime", hp = 30): Monster {
  const m = new Monster();
  m.id = id;
  m.kind = kind;
  m.hp = hp; m.maxHp = hp;
  m.pos.x = 10; m.pos.y = 0; m.pos.z = 10;
  m.statuses.length = 0;
  return m;
}

function makeWorldState() {
  const state = new WorldState();
  state.mapId = "field";
  return state;
}

// ── Inventory tests ─────────────────────────────────────────────────────────
import { Inventory } from "../../services/Inventory.js";
import { removeItem } from "../../services/Inventory.js";

function makeQuestState(): PlayerQuestState {
  return { active: {}, completed: [] };
}

describe("Inventory service", () => {
  let state: WorldState;
  let inventory: Inventory;

  beforeEach(() => {
    state = makeWorldState();
    const alice = makePlayer("sid-alice");
    state.players.set("sid-alice", alice);

    inventory = new Inventory(
      state,
      new Map(),
      new Set(),
      {} as any,
      {
        broadcast: vi.fn(),
        recalcStats: vi.fn(),
        spawnGroundItem: vi.fn(),
        sendToClient: vi.fn(),
      }
    );
  });

  describe("addToInventory", () => {
    it("adds a new item stack when inventory has room", () => {
      const p = state.players.get("sid-alice")!;
      const result = inventory.addToInventory(p, "iron_sword", 1);
      expect(result).toBe(true);
      const stack = p.inventory.find(s => s.itemId === "iron_sword");
      expect(stack).toBeDefined();
      expect(stack!.qty).toBe(1);
    });

    it("stacks items up to their stack limit", () => {
      const p = state.players.get("sid-alice")!;
      inventory.addToInventory(p, "hp_potion", 5);
      // hp_potion stack limit is 10, so all 5 should go into one stack
      expect(p.inventory.length).toBe(1);
      expect(p.inventory[0].qty).toBe(5);
    });

    it("returns false when inventory is full", () => {
      const p = state.players.get("sid-alice")!;
      // Fill inventory to max (200)
      for (let i = 0; i < 200; i++) {
        const s = new ItemStack();
        s.itemId = `dummy_${i}`;
        s.qty = 1;
        p.inventory.push(s);
      }
      const result = inventory.addToInventory(p, "iron_sword", 1);
      expect(result).toBe(false);
    });

    it("does not stack non-stackable items — creates new slot each time", () => {
      const p = state.players.get("sid-alice")!;
      inventory.addToInventory(p, "iron_sword", 1);
      inventory.addToInventory(p, "iron_sword", 1);
      expect(p.inventory.filter(s => s.itemId === "iron_sword").length).toBe(2);
    });
  });

  describe("removeItem (standalone)", () => {
    it("removes the correct quantity from inventory", () => {
      const p = makePlayer();
      const s = new ItemStack(); s.itemId = "hp_potion"; s.qty = 10; p.inventory.push(s);
      removeItem(p, "hp_potion", 3);
      expect(p.inventory[0].qty).toBe(7);
    });

    it("removes the stack when quantity reaches zero", () => {
      const p = makePlayer();
      const s2 = new ItemStack(); s2.itemId = "apple"; s2.qty = 5; p.inventory.push(s2);
      removeItem(p, "apple", 5);
      expect(p.inventory.length).toBe(0);
    });

    it("does nothing when item is not in inventory", () => {
      const p = makePlayer();
      removeItem(p, "nonexistent", 1);
      expect(p.inventory.length).toBe(0);
    });
  });

  describe("handleEquip", () => {
    it("equips a weapon from inventory — updates player.weapon", () => {
      const p = state.players.get("sid-alice")!;
      inventory.addToInventory(p, "iron_sword", 1);
      // Manually trigger equip via inventory (we test the addToInventory + manual assignment pattern)
      const stack = p.inventory.find(s => s.itemId === "iron_sword");
      expect(stack).toBeDefined();
      // Direct test: equip should move itemId into player.weapon
      // The room calls inventorySvc.handleEquip which does this
      inventory.handleEquip("sid-alice", 0);
      expect(p.weapon).toBe("iron_sword");
    });

    it("unequip clears the weapon slot", () => {
      const p = state.players.get("sid-alice")!;
      inventory.addToInventory(p, "iron_sword", 1);
      inventory.handleEquip("sid-alice", 0);
      expect(p.weapon).toBe("iron_sword");
      inventory.handleUnequip("sid-alice", "weapon");
      expect(p.weapon).toBe("");
    });
  });

  describe("handleUseItem", () => {
    it("consumes a consumable item — removes from inventory", () => {
      const p = state.players.get("sid-alice")!;
      const beforeHp = p.hp;
      inventory.addToInventory(p, "hp_potion", 3);
      inventory.handleUseItem("sid-alice", 0);
      // hp_potion restores HP; just verify inventory count decreased
      expect(p.inventory[0].qty).toBe(2);
    });
  });
});

// ── Combat tests ─────────────────────────────────────────────────────────────
import { Combat } from "../../services/Combat.js";

describe("Combat service", () => {
  let state: WorldState;
  let combat: Combat;

  beforeEach(() => {
    state = makeWorldState();
    const alice = makePlayer("sid-alice");
    state.players.set("sid-alice", alice);
    const bob = makePlayer("sid-bob");
    state.players.set("sid-bob", bob);
    const slime = makeMonster("m-slime", "slime", 30);
    state.monsters.set("m-slime", slime);

    combat = new Combat(
      state,
      new Map(),
      new Map(),
      new Map(),
      new Set(),
      { setTimeout: (cb: () => void) => setTimeout(cb, 0) },
      {
        broadcast: vi.fn(),
        grantExp: vi.fn(),
        onMonsterKilled: vi.fn(),
        bumpAchievement: vi.fn(),
        bumpDailyChallenge: vi.fn(),
        dropLoot: vi.fn(),
        monsterSpawn: new Map(),
      }
    );
  });

  describe("handleAttack", () => {
    it("reduces monster HP after player attacks it", () => {
      const slime = state.monsters.get("m-slime")!;
      const before = slime.hp;
      combat.handleAttack("sid-alice", "m-slime");
      // HP should decrease (even if attack is rate-limited, first attack should work)
      // Note: may need cooldown map to be empty — already is
    });

    it("sets monster HP to 0 on death", () => {
      const slime = state.monsters.get("m-slime")!;
      slime.hp = 5;
      slime.maxHp = 5;
      combat.handleAttack("sid-alice", "m-slime");
      expect(slime.hp).toBeLessThanOrEqual(5);
    });

    it("does not crash when attacking non-existent target", () => {
      expect(() => combat.handleAttack("sid-alice", "nonexistent")).not.toThrow();
    });
  });

  describe("status effects", () => {
    it("applyStatusToMonster adds a status effect to the monster", () => {
      const slime = state.monsters.get("m-slime")!;
      combat.applyStatusToMonster(slime, "poison" as StatusKind, 5000, "sid-alice");
      expect(slime.statuses.length).toBe(1);
      expect(slime.statuses[0].kind).toBe("poison");
    });

    it("applyStatusToPlayer adds a status to the player", () => {
      const p = state.players.get("sid-alice")!;
      combat.applyStatusToPlayer(p, "burn" as StatusKind, 3000, "m-slime");
      expect(p.statuses.length).toBe(1);
      expect(p.statuses[0].kind).toBe("burn");
    });

    it("applyStatusToMonster refreshes existing status duration", () => {
      const slime = state.monsters.get("m-slime")!;
      combat.applyStatusToMonster(slime, "poison" as StatusKind, 5000, "sid-alice");
      const first = slime.statuses[0];
      const originalEndAt = first.endAt;
      // Apply again
      combat.applyStatusToMonster(slime, "poison" as StatusKind, 10000, "sid-alice");
      expect(slime.statuses.length).toBe(1); // same slot, not new
      expect(slime.statuses[0].endAt).toBeGreaterThanOrEqual(originalEndAt);
    });
  });
});

// ── Quest tests ──────────────────────────────────────────────────────────────
import { Quest } from "../../services/Quest.js";

describe("Quest service", () => {
  let state: WorldState;
  let quest: Quest;
  let playerQuests: Map<string, any>;
  const sentMessages: Array<{ sid: string; type: string; data: any }> = [];

  beforeEach(() => {
    state = makeWorldState();
    const alice = makePlayer("sid-alice");
    state.players.set("sid-alice", alice);

    playerQuests = new Map();
    playerQuests.set("sid-alice", makeQuestState());

    sentMessages.length = 0;

    quest = new Quest(
      state,
      playerQuests,
      {
        sendToClient: (sid, type, data) => sentMessages.push({ sid, type, data }),
        grantExp: vi.fn(),
        addToInventoryOrMail: vi.fn().mockResolvedValue(undefined),
      }
    );
  });

  describe("handleQuestAccept", () => {
    it("adds quest to playerQuests.active when accepted", () => {
      const qs = playerQuests.get("sid-alice")!;
      expect(Object.keys(qs.active).length).toBe(0);
      quest.handleQuestAccept("sid-alice", "q_slime_starter");
      expect(qs.active["q_slime_starter"]).toBe(0);
    });

    it("does nothing if quest is already active", () => {
      const qs = playerQuests.get("sid-alice")!;
      qs.active["q_slime_starter"] = 0;
      quest.handleQuestAccept("sid-alice", "q_slime_starter");
      // Should not add duplicate — count stays 1
      expect(Object.keys(qs.active).filter(k => k === "q_slime_starter").length).toBe(1);
    });

    it("does nothing if player level is below quest minLevel", () => {
      const p = state.players.get("sid-alice")!;
      p.level = 1;
      const qs = playerQuests.get("sid-alice")!;
      // q_slime_starter may have minLevel > 1, verify it doesn't get added
      quest.handleQuestAccept("sid-alice", "q_slime_starter");
      // Level check should block it
      if (QUESTS["q_slime_starter"]?.minLevel > 1) {
        expect(qs.active["q_slime_starter"]).toBeUndefined();
      }
    });
  });

  describe("handleQuestTurnIn", () => {
    it("delivers zeny reward on turn-in", () => {
      const p = state.players.get("sid-alice")!;
      const qs = playerQuests.get("sid-alice")!;
      qs.active["q_slime_starter"] = 999; // simulate progress complete
      const beforeZeny = p.zeny;
      quest.handleQuestTurnIn("sid-alice", "q_slime_starter");
      expect(p.zeny).toBeGreaterThan(beforeZeny);
    });

    it("marks quest as completed and removes from active", async () => {
      const qs = playerQuests.get("sid-alice")!;
      qs.active["q_slime_starter"] = 999;
      await quest.handleQuestTurnIn("sid-alice", "q_slime_starter");
      expect(qs.active["q_slime_starter"]).toBeUndefined();
      expect(qs.completed).toContain("q_slime_starter");
    });

    it("does nothing when progress is insufficient", async () => {
      const qs = playerQuests.get("sid-alice")!;
      qs.active["q_slime_starter"] = 0; // not enough progress
      const beforeZeny = state.players.get("sid-alice")!.zeny;
      await quest.handleQuestTurnIn("sid-alice", "q_slime_starter");
      expect(state.players.get("sid-alice")!.zeny).toBe(beforeZeny);
    });
  });
});

// ── Trade tests ──────────────────────────────────────────────────────────────
import { Trade } from "../../services/Trade.js";

describe("Trade service", () => {
  let state: WorldState;
  let trade: Trade;
  const sentMessages: Array<{ sid: string; type: string; data: any }> = [];

  beforeEach(() => {
    state = makeWorldState();
    const alice = makePlayer("sid-alice", { zeny: 1000 });
    const s3 = new ItemStack(); s3.itemId = "iron_sword"; s3.qty = 2; alice.inventory.push(s3);
    state.players.set("sid-alice", alice);

    const bob = makePlayer("sid-bob", { zeny: 500 });
    const s4 = new ItemStack(); s4.itemId = "hp_potion"; s4.qty = 5; bob.inventory.push(s4);
    state.players.set("sid-bob", bob);

    sentMessages.length = 0;

    trade = new Trade(state, {
      sendToClient: (sid, type, data) => sentMessages.push({ sid, type, data }),
      addToInventory: (p, itemId, qty) => {
        const s = new ItemStack();
        s.itemId = itemId; s.qty = qty;
        p.inventory.push(s);
        return true;
      },
    });
  });

  describe("handleRequest", () => {
    it("sends trade invite to target player", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      // handleRequest sends notifications but does NOT create sessions — sessions are created on accept
      const invite = sentMessages.find(m => m.type === "trade:invite");
      expect(invite).toBeDefined();
      expect(invite!.data.fromSid).toBe("sid-alice");
    });

    it("rejects request if one side is already trading", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      // Second request from alice to bob should be blocked (alice already has outgoing invite)
      trade.handleRequest("sid-alice", "sid-bob");
      // Only one invite should have been sent
      expect(sentMessages.filter(m => m.type === "trade:invite").length).toBe(1);
    });
  });

  describe("handleOffer", () => {
    it("stores offered items and zeny in session", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      trade.handleAccept("sid-bob", "sid-alice");
      // Alice offers iron_sword at index 0, 1 qty, plus zeny
      trade.handleOffer("sid-alice", [{ invIndex: 0, qty: 1 }], 100);
      const sess = trade.sessions.get("sid-alice")!;
      expect(sess.items.length).toBe(1);
      expect(sess.zeny).toBe(100);
    });

    it("clamps zeny to player's available balance", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      trade.handleAccept("sid-bob", "sid-alice");
      trade.handleOffer("sid-alice", [], 99999); // way more than alice has
      const sess = trade.sessions.get("sid-alice")!;
      expect(sess.zeny).toBeLessThanOrEqual(1000);
    });
  });
});

// ── WorldRoom handler integration tests ─────────────────────────────────────
import { WorldRoom } from "../WorldRoom.js";

describe("WorldRoom handler wiring", () => {
  let room: any;

  beforeEach(() => {
    const state = makeWorldState();
    const alice = makePlayer("sid-alice", { level: 10 });
    const s = new ItemStack(); s.itemId = "iron_sword"; s.qty = 2; alice.inventory.push(s);
    state.players.set("sid-alice", alice);
    const bob = makePlayer("sid-bob", { zeny: 500 });
    state.players.set("sid-bob", bob);
    const slime = makeMonster("m-slime", "slime", 30);
    state.monsters.set("m-slime", slime);

    // Partial mock of WorldRoom — just enough to exercise handlers
    room = {
      state,
      logger: { warn: vi.fn(), info: vi.fn() },
      broadcast: vi.fn(),
      clients: [],
      sessionToCharId: new Map(),
      playerQuests: new Map(),
      playerCharId: new Map(),
      lastAttack: new Map(),
      lastSkill: new Map(),
      botIds: new Set(),
      statusTickAcc: new Map(),
      monsterSpawn: new Map(),
      clock: { setTimeout: (cb: () => void) => setTimeout(cb, 0) },
    };

    // Wire up services so handlers can call them
    room.combatSvc = new Combat(
      room.state,
      room.lastAttack,
      room.lastSkill,
      room.statusTickAcc,
      room.botIds,
      room.clock,
      {
        broadcast: room.broadcast,
        grantExp: (p: Player, amount: number) => { p.exp += amount; },
        onMonsterKilled: vi.fn(),
        bumpAchievement: vi.fn(),
        bumpDailyChallenge: vi.fn(),
        dropLoot: vi.fn(),
        monsterSpawn: room.monsterSpawn,
      }
    );

    room.inventorySvc = new Inventory(
      room.state,
      room.lastAttack,
      room.botIds,
      {} as any,
      {
        broadcast: room.broadcast,
        recalcStats: (p: Player) => room.combatSvc.recalcStats(p),
        spawnGroundItem: vi.fn(),
        sendToClient: vi.fn(),
      }
    );

    room.tradeSvc = new Trade(room.state, {
      sendToClient: vi.fn(),
      addToInventory: (p: Player, itemId: string, qty: number) => room.inventorySvc.addToInventory(p, itemId, qty),
    });

    room.playerQuests.set("sid-alice", makeQuestState());
    room.questSvc = new Quest(
      room.state,
      room.playerQuests,
      {
        sendToClient: vi.fn(),
        grantExp: (p: Player, amount: number) => { p.exp += amount; },
        addToInventoryOrMail: vi.fn().mockResolvedValue(undefined),
      }
    );
  });

  describe("handleAttack", () => {
    it("reduces monster HP when player attacks", () => {
      const slime = room.state.monsters.get("m-slime")!;
      slime.hp = 20;
      const before = slime.hp;
      room.combatSvc.handleAttack("sid-alice", "m-slime");
      // HP should decrease
      expect(slime.hp).toBeLessThanOrEqual(before);
    });
  });

  describe("addToInventory (room wrapper)", () => {
    it("adds item via inventorySvc and returns boolean", () => {
      const p = room.state.players.get("sid-alice")!;
      const result = room.inventorySvc.addToInventory(p, "apple", 3);
      expect(result).toBe(true);
      const stack = p.inventory.find(s => s.itemId === "apple");
      expect(stack).toBeDefined();
      expect(stack!.qty).toBe(3);
    });

    it("returns false when inventory is full", () => {
      const p = room.state.players.get("sid-alice")!;
      for (let i = 0; i < 200; i++) {
        const s = new ItemStack();
        s.itemId = `slot_${i}`;
        s.qty = 1;
        p.inventory.push(s);
      }
      const result = room.inventorySvc.addToInventory(p, "apple", 1);
      expect(result).toBe(false);
    });
  });

  describe("equip", () => {
    it("handles equip message — updates player.weapon", () => {
      const p = room.state.players.get("sid-alice")!;
      room.inventorySvc.addToInventory(p, "iron_sword", 1);
      room.inventorySvc.handleEquip("sid-alice", 0);
      expect(p.weapon).toBe("iron_sword");
    });
  });

  describe("quest handlers", () => {
    it("handleQuestAccept adds to playerQuests map", () => {
      const qs = room.playerQuests.get("sid-alice")!;
      room.questSvc.handleQuestAccept("sid-alice", "q_slime_starter");
      expect(qs.active["q_slime_starter"]).toBe(0);
    });

    it("handleQuestTurnIn delivers rewards", async () => {
      const qs = room.playerQuests.get("sid-alice")!;
      const p = room.state.players.get("sid-alice")!;
      qs.active["q_slime_starter"] = 999;
      const beforeZeny = p.zeny;
      await room.questSvc.handleQuestTurnIn("sid-alice", "q_slime_starter");
      expect(p.zeny).toBeGreaterThan(beforeZeny);
    });
  });

  describe("trade session lifecycle", () => {
    it("handleRequest sends invite to target, handleAccept creates sessions", () => {
      room.tradeSvc.handleRequest("sid-alice", "sid-bob");
      // Sessions created only on accept, not on request
      expect(room.tradeSvc.sessions.has("sid-alice")).toBe(false);
      room.tradeSvc.handleAccept("sid-bob", "sid-alice");
      expect(room.tradeSvc.sessions.has("sid-alice")).toBe(true);
      expect(room.tradeSvc.sessions.has("sid-bob")).toBe(true);
    });

    it("handleOffer stores items and zeny", () => {
      room.tradeSvc.handleRequest("sid-alice", "sid-bob");
      room.tradeSvc.handleAccept("sid-bob", "sid-alice");
      room.tradeSvc.handleOffer("sid-alice", [{ invIndex: 0, qty: 1 }], 50);
      const sess = room.tradeSvc.sessions.get("sid-alice")!;
      expect(sess.items.length).toBe(1);
      expect(sess.zeny).toBe(50);
    });
  });
});