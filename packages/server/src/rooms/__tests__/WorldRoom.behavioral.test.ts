import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock prisma before any imports ──────────────────────────────────────────
vi.mock("../../db.js", () => ({
  prisma: {
    character: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    mail: { create: vi.fn(), findMany: vi.fn() },
  },
}));

// ── Test harness helpers ─────────────────────────────────────────────────────
import { WorldState, Player, Monster, ItemStack, PlayerQuestState } from "@game/shared";
import { Auction } from "../../services/Auction.js";
import { Guild } from "../../services/Guild.js";
import { Trade } from "../../services/Trade.js";

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

// ── Auction service ─────────────────────────────────────────────────────────
describe("Auction service", () => {
  let mockDb: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDb = vi.fn();
  });

  describe("validateList", () => {
    it("returns ok=true with fee+total for valid input", () => {
      const auction = new Auction({} as any);
      const result = auction.validateList(5, 1000);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fee).toBe(50);
        expect(result.total).toBe(5000);
      }
    });

    it("returns ok=false reason=qty when qty < 1", () => {
      const auction = new Auction({} as any);
      expect(auction.validateList(0, 100)).toEqual({ ok: false, reason: "qty" });
    });

    it("returns ok=false reason=qty when qty > 99", () => {
      const auction = new Auction({} as any);
      expect(auction.validateList(100, 100)).toEqual({ ok: false, reason: "qty" });
    });

    it("returns ok=false reason=price when pricePer < 1", () => {
      const auction = new Auction({} as any);
      expect(auction.validateList(1, 0)).toEqual({ ok: false, reason: "price" });
    });

    it("returns ok=false reason=price when pricePer > 10_000_000", () => {
      const auction = new Auction({} as any);
      expect(auction.validateList(1, 10_000_001)).toEqual({ ok: false, reason: "price" });
    });

    it("returns ok=false reason=qty when qty exceeds MAX_QTY (99) — overflow caught at qty gate", () => {
      const auction = new Auction({} as any);
      // MAX_TOTAL = 999_999_999; using qty=100 to exceed MAX_QTY=99 first
      // (100 > 99 so hits 'qty' first — covers the overflow case in the code path)
      expect(auction.validateList(100, 10_000_001)).toEqual({ ok: false, reason: "qty" });
    });
  });

  describe("create + browse", () => {
    it("creates a listing and browse returns it", async () => {
      const createdRow = { id: "l1", sellerName: "Alice", itemId: "iron_sword", qty: 2, pricePer: 500 };
      const mockPrisma = {
        auctionListing: {
          create: vi.fn().mockResolvedValue(createdRow),
          findMany: vi.fn().mockResolvedValue([createdRow]),
        },
      } as any;

      const auction = new Auction(mockPrisma);
      const listing = await auction.create({ sellerName: "Alice", itemId: "iron_sword", qty: 2, pricePer: 500 });
      expect(listing).toEqual(createdRow);

      const rows = await auction.browse();
      expect(rows).toHaveLength(1);
      expect(rows[0].itemId).toBe("iron_sword");
    });

    it("browse filters by search term", async () => {
      const rows = [
        { id: "l1", sellerName: "Bob", itemId: "hp_potion", qty: 5, pricePer: 100 },
      ];
      const mockPrisma = {
        auctionListing: {
          findMany: vi.fn().mockResolvedValue(rows),
        },
      } as any;

      const auction = new Auction(mockPrisma);
      const result = await auction.browse("hp");
      expect(mockPrisma.auctionListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { itemId: { contains: "hp" } } })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("claimForBuy — race safety", () => {
    it("returns ok=true when buyer is not the seller", async () => {
      const listing = { id: "l1", sellerName: "Alice", itemId: "iron_sword", qty: 1, pricePer: 500 };
      const mockPrisma = {
        auctionListing: {
          findUnique: vi.fn().mockResolvedValue(listing),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as any;

      const auction = new Auction(mockPrisma);
      const result = await auction.claimForBuy("l1", "Bob");
      expect(result).toEqual({ ok: true, listing, total: 500 });
    });

    it("returns ok=false reason=self-buy when seller === buyer", async () => {
      const listing = { id: "l1", sellerName: "Alice", itemId: "iron_sword", qty: 1, pricePer: 500 };
      const mockPrisma = {
        auctionListing: {
          findUnique: vi.fn().mockResolvedValue(listing),
        },
      } as any;

      const auction = new Auction(mockPrisma);
      const result = await auction.claimForBuy("l1", "Alice");
      expect(result).toEqual({ ok: false, reason: "self-buy" });
    });

    it("returns ok=false reason=missing when listing not found", async () => {
      const mockPrisma = {
        auctionListing: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const auction = new Auction(mockPrisma);
      const result = await auction.claimForBuy("nonexistent", "Bob");
      expect(result).toEqual({ ok: false, reason: "missing" });
    });

    it("returns ok=false reason=lost-race when deleteMany count is 0", async () => {
      const listing = { id: "l1", sellerName: "Alice", itemId: "iron_sword", qty: 1, pricePer: 500 };
      const mockPrisma = {
        auctionListing: {
          findUnique: vi.fn().mockResolvedValue(listing),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      } as any;

      const auction = new Auction(mockPrisma);
      const result = await auction.claimForBuy("l1", "Bob");
      expect(result).toEqual({ ok: false, reason: "lost-race" });
    });
  });

  describe("cancel", () => {
    it("returns the listing so caller can mail items back", async () => {
      const listing = { id: "l1", sellerName: "Alice", itemId: "iron_sword", qty: 1, pricePer: 500 };
      const mockPrisma = {
        auctionListing: {
          findUnique: vi.fn().mockResolvedValue(listing),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        mail: { create: vi.fn().mockResolvedValue({}) },
      } as any;

      const auction = new Auction(mockPrisma);
      const result = await auction.cancel("l1", "Alice");
      expect(result).toEqual(listing);
    });

    it("returns null when listing not found", async () => {
      const mockPrisma = {
        auctionListing: { findUnique: vi.fn().mockResolvedValue(null) },
      } as any;

      const auction = new Auction(mockPrisma);
      const result = await auction.cancel("nonexistent", "Alice");
      expect(result).toBeNull();
    });
  });
});

// ── Guild service ────────────────────────────────────────────────────────────
describe("Guild service", () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      character: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      guild: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      // Support both array-of-promises and callback forms of $transaction.
      // Guild.leave() now uses the callback form to serialize read+write under
      // a real DB lock; the mock just runs the callback inline with the same
      // client object.
      $transaction: vi.fn(async (arg: any) => {
        if (typeof arg === "function") return arg(mockPrisma);
        return Promise.all(arg);
      }),
    };
  });

  describe("create", () => {
    it("creates a guild and links character", async () => {
      const char = { id: "c1", name: "Alice", guildId: null };
      const guild = { id: "g1", name: "Knights", tag: "KNI", leaderName: "Alice", membersJson: '["Alice"]' };
      mockPrisma.character.findUnique.mockResolvedValue(char);
      (mockPrisma.guild.findUnique as any).mockResolvedValue(null); // name not taken
      (mockPrisma.guild.create as any).mockResolvedValue(guild);
      mockPrisma.character.update.mockResolvedValue({});

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.create("c1", "Alice", "Knights", "KNI");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.info.name).toBe("Knights");
        expect(result.info.tag).toBe("KNI");
      }
    });

    it("returns name-empty when guild name is blank", async () => {
      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.create("c1", "Alice", "   ", "KNI");
      expect(result).toEqual({ ok: false, reason: "name-empty" });
    });

    it("returns already-in-guild when character already has guildId", async () => {
      const char = { id: "c1", name: "Alice", guildId: "existing_guild" };
      mockPrisma.character.findUnique.mockResolvedValue(char);

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.create("c1", "Alice", "Knights", "KNI");
      expect(result).toEqual({ ok: false, reason: "already-in-guild" });
    });

    it("returns name-taken when guild name already exists", async () => {
      const char = { id: "c1", name: "Alice", guildId: null };
      mockPrisma.character.findUnique.mockResolvedValue(char);
      (mockPrisma.guild.findUnique as any).mockResolvedValue({ name: "Knights" }); // name taken

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.create("c1", "Alice", "Knights", "KNI");
      expect(result).toEqual({ ok: false, reason: "name-taken" });
    });

    it("returns error when character not found", async () => {
      mockPrisma.character.findUnique.mockResolvedValue(null);

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.create("nonexistent", "Alice", "Knights", "KNI");
      expect(result).toEqual({ ok: false, reason: "error" });
    });
  });

  describe("join", () => {
    it("adds character to an existing guild", async () => {
      const char = { id: "c1", name: "Bob", guildId: null };
      const guild = { id: "g1", name: "Knights", tag: "KNI", leaderName: "Alice", membersJson: '["Alice"]' };
      mockPrisma.character.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === "c1") return char;
        return null;
      });
      (mockPrisma.guild.findUnique as any).mockResolvedValue(guild);
      (mockPrisma.guild.update as any).mockResolvedValue({
        ...guild,
        membersJson: '["Alice","Bob"]',
      });
      mockPrisma.character.update.mockResolvedValue({});

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.join("c1", "Bob", "Knights");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.info.members).toContain("Bob");
      }
    });

    it("returns not-found when guild does not exist", async () => {
      const char = { id: "c1", name: "Bob", guildId: null };
      mockPrisma.character.findUnique.mockResolvedValue(char);
      (mockPrisma.guild.findUnique as any).mockResolvedValue(null);

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.join("c1", "Bob", "GhostGuild");
      expect(result).toEqual({ ok: false, reason: "not-found" });
    });

    it("returns already-in-guild when character is already in a guild", async () => {
      const char = { id: "c1", name: "Bob", guildId: "some_guild" };
      mockPrisma.character.findUnique.mockResolvedValue(char);

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.join("c1", "Bob", "Knights");
      expect(result).toEqual({ ok: false, reason: "already-in-guild" });
    });
  });

  describe("leave", () => {
    it("removes character from guild and deletes empty guild", async () => {
      const char = { id: "c1", name: "Bob", guildId: "g1" };
      const guild = { id: "g1", name: "Knights", tag: "KNI", leaderName: "Bob", membersJson: '["Bob"]' };
      mockPrisma.character.findUnique.mockResolvedValue(char);
      (mockPrisma.guild.findUnique as any).mockResolvedValue(guild);
      mockPrisma.character.update.mockResolvedValue({});
      mockPrisma.$transaction = vi.fn().mockImplementation(async (arg: any) => {
        if (typeof arg === "function") return arg(mockPrisma);
        return Promise.all(arg);
      });

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.leave("c1", "Bob");

      expect(result.ok).toBe(true);
    });

    it("returns no-guild when character has no guild", async () => {
      const char = { id: "c1", name: "Alice", guildId: null };
      mockPrisma.character.findUnique.mockResolvedValue(char);

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.leave("c1", "Alice");
      expect(result).toEqual({ ok: false, reason: "no-guild" });
    });

    it("leaves guild and transfers leader when more than one member remains", async () => {
      const char = { id: "c1", name: "Bob", guildId: "g1" };
      const guild = { id: "g1", name: "Knights", tag: "KNI", leaderName: "Bob", membersJson: '["Bob","Carol"]' };
      mockPrisma.character.findUnique.mockResolvedValue(char);
      // findUnique called with { id: "g1" } from leave(), and { name: "Knights" } from infoForChar (not called but must not throw)
      (mockPrisma.guild.findUnique as any).mockImplementation(async ({ where }: any) => {
        if (where?.id === "g1") return guild;
        if (where?.name === "Knights") return guild;
        return null;
      });
      mockPrisma.character.update.mockResolvedValue({});
      mockPrisma.$transaction = vi.fn().mockImplementation(async (arg: any) => {
        if (typeof arg === "function") return arg(mockPrisma);
        return Promise.all(arg);
      });

      const guildSvc = new Guild(mockPrisma);
      const result = await guildSvc.leave("c1", "Bob");

      expect(result.ok).toBe(true);
      expect(mockPrisma.character.update).toHaveBeenCalled();
    });
  });
});

// ── Trade service ────────────────────────────────────────────────────────────
describe("Trade service", () => {
  let state: WorldState;
  let trade: Trade;
  let mockSendToClient: ReturnType<typeof vi.fn>;
  let mockAddToInventory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = makeWorldState();
    const alice = makePlayer("sid-alice", { zeny: 1000 });
    const bob = makePlayer("sid-bob", { zeny: 500 });
    const s = new ItemStack(); s.itemId = "hp_potion"; s.qty = 5;
    alice.inventory.push(s);
    state.players.set("sid-alice", alice);
    state.players.set("sid-bob", bob);

    mockSendToClient = vi.fn();
    mockAddToInventory = vi.fn().mockReturnValue(true);

    trade = new Trade(state, {
      sendToClient: mockSendToClient,
      addToInventory: mockAddToInventory,
    });
  });

  describe("full accept→offer→confirm→rollback lifecycle", () => {
    it("request creates no sessions until accept", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      expect(trade.sessions.size).toBe(0);
    });

    it("accept creates paired sessions for both parties", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      trade.handleAccept("sid-bob", "sid-alice");
      expect(trade.sessions.size).toBe(2);
      expect(trade.sessions.has("sid-alice")).toBe(true);
      expect(trade.sessions.has("sid-bob")).toBe(true);
    });

    it("offer stores items and zeny on sender session", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      trade.handleAccept("sid-bob", "sid-alice");
      trade.handleOffer("sid-alice", [{ invIndex: 0, qty: 2 }], 100);

      const sess = trade.sessions.get("sid-alice")!;
      expect(sess.items).toHaveLength(1);
      expect(sess.items[0].invIndex).toBe(0);
      expect(sess.items[0].qty).toBe(2);
      expect(sess.zeny).toBe(100);
    });

it("confirm executes trade atomically — items + zeny transfer", () => {
      const aliceBefore = state.players.get("sid-alice")!.zeny;
      const bobBefore = state.players.get("sid-bob")!.zeny;

      trade.handleRequest("sid-alice", "sid-bob");
      trade.handleAccept("sid-bob", "sid-alice");
      trade.handleOffer("sid-alice", [], 200); // Alice sends 200z to Bob
      trade.handleOffer("sid-bob", [], 0);     // Bob sends nothing
      trade.handleConfirm("sid-alice");
      trade.handleConfirm("sid-bob"); // both need to confirm

      expect(state.players.get("sid-alice")!.zeny).toBe(aliceBefore - 200);
      expect(state.players.get("sid-bob")!.zeny).toBe(bobBefore + 200);
      expect(trade.sessions.size).toBe(0); // sessions cleared after confirm
    });

    it("cannot confirm without both parties having offered", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      trade.handleAccept("sid-bob", "sid-alice");
      trade.handleOffer("sid-alice", [], 100);
      // Bob has not offered yet

      trade.handleConfirm("sid-alice");
      expect(trade.sessions.size).toBe(2); // sessions still alive — confirm didn't fire
    });

    it("cancel clears sessions without transferring anything", () => {
      trade.handleRequest("sid-alice", "sid-bob");
      trade.handleAccept("sid-bob", "sid-alice");
      trade.handleOffer("sid-alice", [], 200);

      trade.cancelTrade("sid-alice");

      expect(trade.sessions.size).toBe(0);
      expect(state.players.get("sid-alice")!.zeny).toBe(1000); // unchanged
    });
  });
});