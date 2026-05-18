import { describe, it, expect } from "vitest";
import { AntiCheat } from "./AntiCheat";

describe("AntiCheat", () => {
  const ac = new AntiCheat();

  it("passes normal joystick input", () => {
    const v = ac.validateInput({ mx: 0.5, mz: -0.3, rotY: 1.2 });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.mx).toBeCloseTo(0.5);
      expect(v.mz).toBeCloseTo(-0.3);
    }
  });

  it("normalizes diagonal so |v| <= 1", () => {
    const v = ac.validateInput({ mx: 1, mz: 1, rotY: 0 });
    expect(v.ok).toBe(true);
    if (v.ok) expect(Math.hypot(v.mx, v.mz)).toBeCloseTo(1);
  });

  it("rejects non-finite", () => {
    expect(ac.validateInput({ mx: NaN, mz: 0, rotY: 0 }).ok).toBe(false);
    expect(ac.validateInput({ mx: Infinity, mz: 0, rotY: 0 }).ok).toBe(false);
  });

  it("rejects forged magnitude", () => {
    const v = ac.validateInput({ mx: 999, mz: 0, rotY: 0 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("magnitude");
  });

  it("rejects non-finite rotation too", () => {
    expect(ac.validateInput({ mx: 0, mz: 0, rotY: NaN }).ok).toBe(false);
  });
});
