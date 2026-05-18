import { describe, it, expect } from "vitest";
import { SpatialHash, type SpatialEntity } from "./SpatialHash";

type E = SpatialEntity & { kind: string };

describe("SpatialHash", () => {
  it("inserts and queries by radius", () => {
    const h = new SpatialHash<E>();
    h.update({ id: "a", x: 0, z: 0, kind: "p" });
    h.update({ id: "b", x: 5, z: 0, kind: "p" });
    h.update({ id: "c", x: 100, z: 0, kind: "p" });
    const near = h.queryRadius(0, 0, 10);
    expect(near.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("findNearest respects radius", () => {
    const h = new SpatialHash<E>();
    h.update({ id: "a", x: 0, z: 0, kind: "p" });
    h.update({ id: "b", x: 3, z: 4, kind: "p" }); // distance 5
    h.update({ id: "c", x: 20, z: 0, kind: "p" });
    const r = h.findNearest(0, 0, 10, (e) => e.id !== "a");
    expect(r?.entity.id).toBe("b");
    expect(r?.distance).toBeCloseTo(5);
  });

  it("returns null when no entity within radius", () => {
    const h = new SpatialHash<E>();
    h.update({ id: "a", x: 100, z: 100, kind: "p" });
    expect(h.findNearest(0, 0, 50)).toBeNull();
  });

  it("update on existing id moves it between cells", () => {
    const h = new SpatialHash<E>();
    h.update({ id: "a", x: 0, z: 0, kind: "p" });
    expect(h.queryRadius(0, 0, 5).length).toBe(1);
    h.update({ id: "a", x: 100, z: 100, kind: "p" });
    expect(h.queryRadius(0, 0, 5).length).toBe(0);
    expect(h.queryRadius(100, 100, 5).length).toBe(1);
  });

  it("remove deletes from index", () => {
    const h = new SpatialHash<E>();
    h.update({ id: "a", x: 0, z: 0, kind: "p" });
    h.remove("a");
    expect(h.size()).toBe(0);
    expect(h.queryRadius(0, 0, 100).length).toBe(0);
  });

  it("predicate filters entities in findNearest", () => {
    const h = new SpatialHash<E>();
    h.update({ id: "a", x: 0, z: 0, kind: "mob" });
    h.update({ id: "b", x: 5, z: 0, kind: "player" });
    h.update({ id: "c", x: 10, z: 0, kind: "mob" });
    const r = h.findNearest(0, 0, 50, (e) => e.kind === "player");
    expect(r?.entity.id).toBe("b");
  });

  it("scales: 1000 entities, queryRadius stays cheap", () => {
    const h = new SpatialHash<E>();
    for (let i = 0; i < 1000; i++) {
      h.update({ id: `e${i}`, x: Math.random() * 1000, z: Math.random() * 1000, kind: "p" });
    }
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) h.queryRadius(Math.random() * 1000, Math.random() * 1000, 10);
    const dt = Date.now() - t0;
    expect(dt).toBeLessThan(50); // 100 queries on 1000 entities under 50ms
  });
});
