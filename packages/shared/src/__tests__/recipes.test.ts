import { describe, it, expect } from "vitest";
import { RECIPES } from "../recipes";
import { ITEMS } from "../items";

describe("RECIPES catalog", () => {
  it("all recipe ids are unique (no duplicates)", () => {
    const ids = RECIPES.map((r) => r.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("every input item exists in ITEMS", () => {
    for (const r of RECIPES) {
      for (const inp of r.inputs) {
        expect(ITEMS[inp.itemId], `recipe ${r.id} requires unknown item ${inp.itemId}`).toBeDefined();
        expect(inp.qty).toBeGreaterThan(0);
      }
    }
  });

  it("every output item exists in ITEMS", () => {
    for (const r of RECIPES) {
      expect(ITEMS[r.output.itemId], `recipe ${r.id} produces unknown item ${r.output.itemId}`).toBeDefined();
      expect(r.output.qty).toBeGreaterThan(0);
    }
  });

  it("recipe ids follow recipe_<name> convention", () => {
    for (const r of RECIPES) {
      expect(r.id).toMatch(/^recipe_/);
    }
  });
});
