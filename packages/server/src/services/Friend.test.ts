import { describe, it, expect } from "vitest";
import { Friend, MAX_FRIENDS } from "./Friend";

// Minimal Prisma mock — only the methods Friend touches.
function mockPrisma(initial: Record<string, { id: string; name: string; friendsJson: string }>) {
  const db = new Map(Object.entries(initial));
  return {
    character: {
      async findUnique({ where }: any) {
        if (where.id) return db.get(where.id) ?? null;
        if (where.name) {
          for (const c of db.values()) if (c.name === where.name) return c;
          return null;
        }
        return null;
      },
      async update({ where, data }: any) {
        const row = db.get(where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    },
  } as any;
}

describe("Friend service", () => {
  it("rejects self-add", async () => {
    const svc = new Friend(mockPrisma({ a: { id: "a", name: "Alice", friendsJson: "[]" } }));
    const r = await svc.add("a", "Alice", "Alice");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("self");
  });

  it("rejects when target does not exist", async () => {
    const svc = new Friend(mockPrisma({ a: { id: "a", name: "Alice", friendsJson: "[]" } }));
    const r = await svc.add("a", "Alice", "Nobody");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing");
  });

  it("adds + lists", async () => {
    const svc = new Friend(mockPrisma({
      a: { id: "a", name: "Alice", friendsJson: "[]" },
      b: { id: "b", name: "Bob", friendsJson: "[]" },
    }));
    const r = await svc.add("a", "Alice", "Bob");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.friends).toContain("Bob");
    expect(await svc.list("a")).toEqual(["Bob"]);
  });

  it("idempotent: adding same friend twice keeps single entry", async () => {
    const svc = new Friend(mockPrisma({
      a: { id: "a", name: "Alice", friendsJson: "[]" },
      b: { id: "b", name: "Bob", friendsJson: "[]" },
    }));
    await svc.add("a", "Alice", "Bob");
    await svc.add("a", "Alice", "Bob");
    expect(await svc.list("a")).toEqual(["Bob"]);
  });

  it("rejects when at MAX_FRIENDS cap", async () => {
    const initial: any = { a: { id: "a", name: "Alice", friendsJson: JSON.stringify(Array.from({ length: MAX_FRIENDS }, (_, i) => `F${i}`)) } };
    // Add target character "Extra"
    initial.x = { id: "x", name: "Extra", friendsJson: "[]" };
    const svc = new Friend(mockPrisma(initial));
    const r = await svc.add("a", "Alice", "Extra");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("full");
  });

  it("remove deletes the entry", async () => {
    const svc = new Friend(mockPrisma({
      a: { id: "a", name: "Alice", friendsJson: JSON.stringify(["Bob"]) },
    }));
    const r = await svc.remove("a", "Bob");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.friends).toEqual([]);
  });

  it("parses corrupt friendsJson as empty list", async () => {
    const svc = new Friend(mockPrisma({
      a: { id: "a", name: "Alice", friendsJson: "{garbage" },
    }));
    expect(await svc.list("a")).toEqual([]);
  });
});
