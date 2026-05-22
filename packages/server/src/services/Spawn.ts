import {
  Player, Monster, MonsterKind, MONSTERS
} from "@game/shared";

export class Spawn {
  private chunkSpawnAcc = 0;

  constructor(
    private state: { mapId: string; players: Map<string, Player>; monsters: Map<string, Monster>; isNight: boolean },
    private monsterSpawn: Map<string, { x: number; z: number; kind: MonsterKind }>,
    private spawnedResourceChunks: Set<string>,
    private spawnedChestChunks: Set<string>,
    private botIds: Set<string>,
    private lastAttack: Map<string, number>,
    private statusTickAcc: Map<string, number>,
    private tameProgress: Map<string, number>,
    private callbacks: {
      spawnGroundItem: (itemId: string, qty: number, x: number, z: number) => void;
    }
  ) {}

  monsterHpMultiplier(kind: MonsterKind): number {
    let mult = 1;
    if (this.state.mapId === "dungeon") {
      const realPlayers = this.state.players.size - this.botIds.size;
      mult *= Math.max(1, 1 + (realPlayers - 1) * 0.4);
    }
    if (kind === "darklord" && new Date().getDay() === 6) mult *= 2;
    return mult;
  }

  spawnMonster(kind: MonsterKind, x: number, z: number) {
    const def = MONSTERS[kind];
    if (!def) return;
    const id = `m_${Math.random().toString(36).slice(2, 9)}`;
    const m = new Monster();
    m.id = id; m.kind = kind;
    m.pos.x = x; m.pos.z = z;
    const hpMult = this.monsterHpMultiplier(kind);
    const scaledHp = Math.floor(def.hp * hpMult);
    m.hp = scaledHp; m.maxHp = scaledHp;
    this.state.monsters.set(id, m);
    this.monsterSpawn.set(id, { x, z, kind });
  }

  tickChunkSpawns(dt: number) {
    if (this.state.mapId !== "field") return;
    this.chunkSpawnAcc += dt;
    if (this.chunkSpawnAcc < 8) return;
    this.chunkSpawnAcc = 0;

    const CHUNK_SIZE = 32;
    const SPAWN_RADIUS = 18;
    const PLAYER_RADIUS = 60;
    const DESPAWN_RADIUS = 120;
    const CHUNK_MOB_CAP = 3;
    const isNight = this.state.isNight;

    const anchors: Array<{ x: number; z: number }> = [];
    for (const [sid, p] of this.state.players) {
      if (this.botIds.has(sid)) continue;
      anchors.push({ x: p.pos.x, z: p.pos.z });
    }
    if (anchors.length === 0) return;

    for (const [id, m] of this.state.monsters) {
      if (m.dead) continue;
      const cfg = (MONSTERS as any)[m.kind];
      if (!cfg || cfg.aggroRange === -2) continue;
      let nearest = Infinity;
      for (const a of anchors) {
        nearest = Math.min(nearest, Math.hypot(m.pos.x - a.x, m.pos.z - a.z));
      }
      if (nearest > DESPAWN_RADIUS) {
        this.state.monsters.delete(id);
        this.lastAttack.delete(id);
        this.monsterSpawn.delete(id);
        for (const k of this.statusTickAcc.keys()) {
          if (k.endsWith(":" + id)) this.statusTickAcc.delete(k);
        }
        for (const k of this.tameProgress.keys()) {
          if (k.endsWith(":" + id)) this.tameProgress.delete(k);
        }
      }
    }

    const chunkMobs = new Map<string, number>();
    for (const [, m] of this.state.monsters) {
      if (m.dead) continue;
      const cx = Math.floor(m.pos.x / CHUNK_SIZE);
      const cz = Math.floor(m.pos.z / CHUNK_SIZE);
      const k = `${cx},${cz}`;
      chunkMobs.set(k, (chunkMobs.get(k) ?? 0) + 1);
    }

    const candidates = new Set<string>();
    const cellsR = Math.ceil(PLAYER_RADIUS / CHUNK_SIZE);
    for (const a of anchors) {
      const pcx = Math.floor(a.x / CHUNK_SIZE);
      const pcz = Math.floor(a.z / CHUNK_SIZE);
      for (let dx = -cellsR; dx <= cellsR; dx++) {
        for (let dz = -cellsR; dz <= cellsR; dz++) {
          candidates.add(`${pcx + dx},${pcz + dz}`);
        }
      }
    }

    const TABLES: Record<string, { day: string[]; night: string[] }> = {
      plains:  { day: ["slime", "slime", "wolf", "fox"],     night: ["wolf", "wolf", "fox", "slime"] },
      forest:  { day: ["spider", "boar", "wolf", "slime"],   night: ["spider", "spider", "wolf", "bat"] },
      desert:  { day: ["scorpion", "scorpion", "slime"],     night: ["scorpion", "ghost", "bat"] },
      snow:    { day: ["yeti", "wolf", "wolf"],              night: ["yeti", "wolf", "ghost"] },
      swamp:   { day: ["spider", "orc", "slime"],            night: ["spider", "ghost", "ghost"] },
    };

    function biomeAtServer(x: number, z: number): keyof typeof TABLES {
      const n = (Math.sin(x * 0.013) + Math.cos(z * 0.011)) * 0.5 + 0.5;
      const d = Math.hypot(x, z);
      const far = Math.min(1, d / 250);
      if (n < 0.30) return far > 0.5 ? "snow" : "plains";
      if (n < 0.50) return "forest";
      if (n < 0.70) return "plains";
      if (n < 0.85) return far > 0.4 ? "desert" : "plains";
      return "swamp";
    }

    for (const k of candidates) {
      const have = chunkMobs.get(k) ?? 0;
      if (have >= CHUNK_MOB_CAP) continue;
      const [cx, cz] = k.split(",").map(Number);
      const sx = (cx + Math.random()) * CHUNK_SIZE;
      const sz = (cz + Math.random()) * CHUNK_SIZE;
      if (Math.hypot(sx, sz) < SPAWN_RADIUS + 4) continue;
      const biome = biomeAtServer(sx, sz);
      const tbl = TABLES[biome];
      const arr = isNight ? tbl.night : tbl.day;
      const kind = arr[Math.floor(Math.random() * arr.length)] as MonsterKind;
      if (Math.random() < 0.35) this.spawnMonster(kind, sx, sz);
    }

    for (const k of candidates) {
      if (this.spawnedResourceChunks.has(k)) continue;
      const [cx, cz] = k.split(",").map(Number);
      const chunkCx = (cx + 0.5) * CHUNK_SIZE;
      const chunkCz = (cz + 0.5) * CHUNK_SIZE;
      const distToOrigin = Math.hypot(chunkCx, chunkCz);
      if (distToOrigin < SPAWN_RADIUS + 6) {
        this.spawnedResourceChunks.add(k);
        continue;
      }
      const nodeCount = 2 + Math.floor(Math.random() * 3);
      const biome = biomeAtServer(chunkCx, chunkCz);
      const nodeKinds: MonsterKind[] = biome === "forest" ? ["tree_node", "tree_node", "berry_bush"]
        : biome === "snow" ? ["rock_node", "rock_node", "ore_node"]
        : biome === "desert" ? ["rock_node", "rock_node", "crystal_node"]
        : ["tree_node", "rock_node", "berry_bush"];
      for (let n = 0; n < nodeCount; n++) {
        const sx = (cx + 0.1 + Math.random() * 0.8) * CHUNK_SIZE;
        const sz = (cz + 0.1 + Math.random() * 0.8) * CHUNK_SIZE;
        if (Math.hypot(sx, sz) < SPAWN_RADIUS + 4) continue;
        const kind = nodeKinds[Math.floor(Math.random() * nodeKinds.length)];
        this.spawnMonster(kind, sx, sz);
      }
      this.spawnedResourceChunks.add(k);
    }

    for (const k of candidates) {
      if (this.spawnedChestChunks.has(k)) continue;
      const [cx, cz] = k.split(",").map(Number);
      const chunkCx = (cx + 0.5) * CHUNK_SIZE;
      const chunkCz = (cz + 0.5) * CHUNK_SIZE;
      const distToOrigin = Math.hypot(chunkCx, chunkCz);
      if (distToOrigin < SPAWN_RADIUS + 20) {
        this.spawnedChestChunks.add(k);
        continue;
      }
      if (Math.random() > 1 / 12) {
        this.spawnedChestChunks.add(k);
        continue;
      }
      const sx = (cx + 0.2 + Math.random() * 0.6) * CHUNK_SIZE;
      const sz = (cz + 0.2 + Math.random() * 0.6) * CHUNK_SIZE;
      const tier = Math.min(3, Math.floor(distToOrigin / 80));
      const loot = ["hp_potion", "mp_potion", tier > 0 ? "iron_sword" : "wood_sword", tier > 1 ? "crystal" : "wood"];
      const item = loot[Math.floor(Math.random() * loot.length)];
      const qty = tier > 0 ? 2 + Math.floor(Math.random() * 3) : 1;
      this.callbacks.spawnGroundItem(item, qty, sx, sz);
      this.spawnedChestChunks.add(k);
    }
  }
}
