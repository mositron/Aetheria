import { describe, it, expect } from "vitest";
import { RateLimiter } from "./RateLimiter";

describe("RateLimiter", () => {
  it("allows up to maxEvents per window", () => {
    const r = new RateLimiter();
    for (let i = 0; i < 5; i++) expect(r.check("a", "chat", 5, 1000, 0)).toBe(true);
    expect(r.check("a", "chat", 5, 1000, 0)).toBe(false);
  });

  it("slides the window — events older than windowMs expire", () => {
    const r = new RateLimiter();
    for (let i = 0; i < 5; i++) r.check("a", "chat", 5, 1000, 0);
    expect(r.check("a", "chat", 5, 1000, 0)).toBe(false);
    // 1001ms later, the oldest event has fallen out
    expect(r.check("a", "chat", 5, 1000, 1001)).toBe(true);
  });

  it("buckets are independent per sid", () => {
    const r = new RateLimiter();
    for (let i = 0; i < 5; i++) expect(r.check("a", "chat", 5, 1000, 0)).toBe(true);
    expect(r.check("b", "chat", 5, 1000, 0)).toBe(true);
    expect(r.check("a", "chat", 5, 1000, 0)).toBe(false);
  });

  it("buckets are independent per key (same sid)", () => {
    const r = new RateLimiter();
    for (let i = 0; i < 5; i++) r.check("a", "chat", 5, 1000, 0);
    expect(r.check("a", "chat", 5, 1000, 0)).toBe(false);
    expect(r.check("a", "skill", 5, 1000, 0)).toBe(true);
  });

  it("forget(sid) wipes the entry", () => {
    const r = new RateLimiter();
    r.check("a", "chat", 5, 1000, 0);
    r.forget("a");
    expect(r.size()).toBe(0);
  });
});
