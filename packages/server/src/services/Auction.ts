// Auction service. DB-backed (prisma.auctionListing) with race-safe buy.
//
// Key invariants:
//   - list() validates qty/price ranges and total transaction cap
//   - buy() uses atomic deleteMany so two concurrent buyers can't both win
//   - On addToInventory failure post-claim, re-list (don't lose the item)
//   - cancel() returns item via mail (avoids inventory-full edge case)

import type { PrismaClient } from "@prisma/client";

const MAX_QTY = 99;
const MAX_PRICE = 10_000_000;
const MAX_TOTAL = 999_999_999;
const LIST_FEE_RATIO = 0.01;
const SEARCH_LIMIT = 100;

export type ListInput = { sellerName: string; itemId: string; qty: number; pricePer: number };
export type Listing = { id: string; sellerName: string; itemId: string; qty: number; pricePer: number };

export type ListValidation =
  | { ok: true; fee: number; total: number }
  | { ok: false; reason: "qty" | "price" | "total-too-large" };

export type ClaimResult =
  | { ok: true; listing: Listing; total: number }
  | { ok: false; reason: "missing" | "self-buy" | "lost-race" | "error" };

export class Auction {
  constructor(private prisma: PrismaClient) {}

  /** Validate price/qty pair. Returns the fee + total so caller can charge. */
  validateList(qty: number, pricePer: number): ListValidation {
    if (qty < 1 || qty > MAX_QTY) return { ok: false, reason: "qty" };
    if (pricePer < 1 || pricePer > MAX_PRICE) return { ok: false, reason: "price" };
    const total = qty * pricePer;
    if (total > MAX_TOTAL) return { ok: false, reason: "total-too-large" };
    return { ok: true, total, fee: Math.max(1, Math.floor(total * LIST_FEE_RATIO)) };
  }

  async create(input: ListInput): Promise<Listing | null> {
    try {
      const row = await (this.prisma as any).auctionListing.create({ data: input });
      return row as Listing;
    } catch (e) {
      console.error("[auction.create]", e);
      return null;
    }
  }

  async browse(search?: string): Promise<Listing[]> {
    try {
      const where = search ? { itemId: { contains: search.toLowerCase() } } : undefined;
      return await (this.prisma as any).auctionListing.findMany({
        where, orderBy: { pricePer: "asc" }, take: SEARCH_LIMIT,
      }) as Listing[];
    } catch (e) {
      console.error("[auction.browse]", e);
      return [];
    }
  }

  /**
   * Atomically claim a listing as buyer. Returns the listing details on
   * success so caller can grant items + transfer zeny. The atomic
   * deleteMany guarantees at most one buyer wins per listing.
   */
  async claimForBuy(id: string, buyerName: string): Promise<ClaimResult> {
    try {
      const listing = await (this.prisma as any).auctionListing.findUnique({ where: { id } });
      if (!listing) return { ok: false, reason: "missing" };
      if (listing.sellerName === buyerName) return { ok: false, reason: "self-buy" };

      const claim = await (this.prisma as any).auctionListing.deleteMany({
        where: { id, sellerName: { not: buyerName } },
      });
      if (claim.count === 0) return { ok: false, reason: "lost-race" };

      return { ok: true, listing, total: listing.pricePer * listing.qty };
    } catch (e) {
      console.error("[auction.claimForBuy]", e);
      return { ok: false, reason: "error" };
    }
  }

  /** Re-create a listing — used when the buyer's inventory was full so we can't deliver. */
  async relist(listing: Listing): Promise<void> {
    try {
      await (this.prisma as any).auctionListing.create({
        data: {
          sellerName: listing.sellerName, itemId: listing.itemId,
          qty: listing.qty, pricePer: listing.pricePer,
        },
      });
    } catch (e) {
      console.error("[auction.relist]", e);
    }
  }

  /**
   * Cancel a listing if owned by sellerName. Returns the listing so caller
   * can mail the item back. Returns null if listing missing or wrong owner.
   */
  async cancel(id: string, sellerName: string): Promise<Listing | null> {
    try {
      const listing = await (this.prisma as any).auctionListing.findUnique({ where: { id } });
      if (!listing || listing.sellerName !== sellerName) return null;
      const claim = await (this.prisma as any).auctionListing.deleteMany({
        where: { id, sellerName },
      });
      return claim.count > 0 ? (listing as Listing) : null;
    } catch (e) {
      console.error("[auction.cancel]", e);
      return null;
    }
  }
}

export { MAX_QTY, MAX_PRICE, MAX_TOTAL, LIST_FEE_RATIO };
