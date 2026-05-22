import { describe, it, expect } from "vitest";
import { Combat } from "./Combat";
import { Player, StatusEffect, Monster } from "@game/shared";

describe("Combat service unit tests", () => {
  const mockState = {
    players: new Map<string, Player>(),
    monsters: new Map<string, Monster>()
  };
  const mockCallbacks = {
    broadcast: () => {},
    grantExp: () => {},
    onMonsterKilled: () => {},
    bumpAchievement: () => {},
    bumpDailyChallenge: () => {},
    dropLoot: () => {},
    monsterSpawn: new Map()
  };
  const mockClock = {
    setTimeout: (cb: () => void) => cb()
  };

  const combat = new Combat(
    mockState,
    new Map(),
    new Map(),
    new Map(),
    new Set(),
    mockClock,
    mockCallbacks
  );

  it("isStunned detects prevention status", () => {
    const p = new Player();
    expect(combat.isStunned(p)).toBe(false);

    const stun = new StatusEffect();
    stun.kind = "stun";
    stun.endAt = Date.now() + 10000;
    p.statuses.push(stun);

    expect(combat.isStunned(p)).toBe(true);
  });

  it("speedMultOf checks mount, hunger, and status modifications", () => {
    const p = new Player();
    p.mounted = false;
    p.hunger = 100;
    expect(combat.speedMultOf(p)).toBe(1.0);

    // Mount
    p.mounted = true;
    expect(combat.speedMultOf(p)).toBe(1.3);

    // Mount + Hunger
    p.hunger = 10;
    expect(combat.speedMultOf(p)).toBeCloseTo(1.3 * 0.75, 4);
  });

  it("recalcStats handles novice scaling", () => {
    const p = new Player();
    p.level = 1;
    p.job = "novice";
    p.str = 1; p.agi = 1; p.vit = 1; p.int = 1; p.dex = 1; p.luk = 1;
    p.weapon = "";
    p.armor = "";

    combat.recalcStats(p, true);

    expect(p.maxHp).toBeGreaterThan(0);
    expect(p.maxMp).toBeGreaterThan(0);
    expect(p.hp).toBe(p.maxHp);
    expect(p.mp).toBe(p.maxMp);
  });
});
