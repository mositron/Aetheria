import { describe, it, expect } from "vitest";
import { Spawn } from "./Spawn";
import { Monster, Player } from "@game/shared";

describe("Spawn service unit tests", () => {
  const mockState = {
    mapId: "field",
    players: new Map<string, Player>(),
    monsters: new Map<string, Monster>(),
    isNight: false
  };
  const mockMonsterSpawn = new Map();
  const mockSpawnedResourceChunks = new Set<string>();
  const mockSpawnedChestChunks = new Set<string>();
  const mockCallbacks = {
    spawnGroundItem: () => {}
  };

  const spawnSvc = new Spawn(
    mockState,
    mockMonsterSpawn,
    mockSpawnedResourceChunks,
    mockSpawnedChestChunks,
    new Set(),
    new Map(),
    new Map(),
    new Map(),
    mockCallbacks
  );

  it("calculates monster Hp multiplier correctly", () => {
    expect(spawnSvc.monsterHpMultiplier("slime")).toBe(1.0);
  });

  it("spawns a monster into state map", () => {
    spawnSvc.spawnMonster("slime", 10, 20);
    expect(mockState.monsters.size).toBe(1);
    const m = Array.from(mockState.monsters.values())[0];
    expect(m.kind).toBe("slime");
    expect(m.pos.x).toBe(10);
    expect(m.pos.z).toBe(20);
  });
});
