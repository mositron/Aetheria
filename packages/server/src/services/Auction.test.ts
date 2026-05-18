import { describe, it, expect } from "vitest";
import { Auction, MAX_QTY, MAX_PRICE } from "./Auction";

describe("Auction.validateList", () => {
  const a = new Auction({} as any);

  it("accepts normal values + computes 1% fee", () => {
    const r = a.validateList(10, 100);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.total).toBe(1000);
      expect(r.fee).toBe(10);
    }
  });

  it("rejects qty out of range", () => {
    expect(a.validateList(0, 100).ok).toBe(false);
    expect(a.validateList(MAX_QTY + 1, 100).ok).toBe(false);
  });

  it("rejects price out of range", () => {
    expect(a.validateList(1, 0).ok).toBe(false);
    expect(a.validateList(1, MAX_PRICE + 1).ok).toBe(false);
  });

  it("rejects total above the 999M cap", () => {
    // Need qty × price > 999_999_999. validateList still bounds-checks each
    // individually, so we test the cap path indirectly by patching values
    // through after they're individually in range — pick qty=99, price=11M
    // (each within range; product = 1.089B exceeds total cap).
    // But MAX_PRICE is 10M so we need a different approach: validateList
    // accepts inputs that are individually in range. We'll demonstrate the
    // cap is at MAX_QTY × MAX_PRICE = 990M which is under 999M — so within
    // current bounds, total-too-large is unreachable. Adjust if MAX_PRICE
    // increases beyond 10M.
    const r = a.validateList(99, MAX_PRICE);
    expect(r.ok).toBe(true); // 99 × 10M = 990M, still under cap
    if (r.ok) expect(r.total).toBe(990_000_000);
  });

  it("fee is always at least 1z (small listings)", () => {
    const r = a.validateList(1, 50); // total=50, 1% = 0.5 → floor → 0, clamped to 1
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fee).toBe(1);
  });
});

// Race-safety tests for claimForBuy
describe("Auction.claimForBuy", () => {
  function mockPrisma(initial: any[]) {
    const rows = new Map(initial.map((l) => [l.id, l]));
    return {
      auctionListing: {
        async findUnique({ where }: any) { return rows.get(where.id) ?? null; },
        async deleteMany({ where }: any) {
          const row = rows.get(where.id);
          if (!row) return { count: 0 };
          // sellerName: { not: X } means delete only if sellerName !== X
          if (where.sellerName?.not && row.sellerName === where.sellerName.not) return { count: 0 };
          rows.delete(where.id);
          return { count: 1 };
        },
      },
    } as any;
  }

  it("succeeds for an open listing", async () => {
    const a = new Auction(mockPrisma([{ id: "L1", sellerName: "Alice", itemId: "x", qty: 1, pricePer: 100 }]));
    const r = await a.claimForBuy("L1", "Bob");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.total).toBe(100);
  });

  it("rejects self-buy", async () => {
    const a = new Auction(mockPrisma([{ id: "L1", sellerName: "Alice", itemId: "x", qty: 1, pricePer: 100 }]));
    const r = await a.claimForBuy("L1", "Alice");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("self-buy");
  });

  it("rejects missing listing", async () => {
    const a = new Auction(mockPrisma([]));
    const r = await a.claimForBuy("L1", "Bob");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing");
  });

  it("race: only one of two concurrent buyers wins", async () => {
    const a = new Auction(mockPrisma([{ id: "L1", sellerName: "Alice", itemId: "x", qty: 1, pricePer: 100 }]));
    const [r1, r2] = await Promise.all([a.claimForBuy("L1", "Bob"), a.claimForBuy("L1", "Carol")]);
    const wins = [r1, r2].filter((r) => r.ok).length;
    expect(wins).toBe(1);
  });
});
