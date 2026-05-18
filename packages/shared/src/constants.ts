export const GAME_CONFIG = {
  TICK_RATE: 20,
  WORLD_SIZE: 100,
  PLAYER_SPEED: 5,
  PLAYER_BASE_HP: 100,
  PLAYER_BASE_ATK: 10,
  ATTACK_RANGE: 2,
  ATTACK_COOLDOWN_MS: 800,
  RESPAWN_MS: 5000,
  BOSS_RESPAWN_MS: 60_000,
  // Quadratic growth until Lv30, then linear softcap so endgame isn't a grind wall.
  // Lv 1→2: 30 ; Lv 5→6: 175 ; Lv 20→21: 2025 ; Lv 30→31: 4525 (cap) ; Lv 50→51: ~6925.
  EXP_PER_LEVEL: (lv: number) => {
    if (lv <= 30) return Math.floor(25 + lv * lv * 5);
    const base = 25 + 30 * 30 * 5;          // 4525
    return Math.floor(base + (lv - 30) * 120);
  },
} as const;

export const ROOM_NAME = "world";

export const MONSTERS = {
  slime: { name: "Slime", hp: 30, atk: 4, exp: 10, speed: 2, aggroRange: 6 },
  wolf: { name: "Wolf", hp: 60, atk: 8, exp: 25, speed: 3.5, aggroRange: 8 },
  orc: { name: "Orc Warrior", hp: 140, atk: 14, exp: 80, speed: 2.5, aggroRange: 7 },
  darklord: { name: "Dark Lord", hp: 400, atk: 18, exp: 800, speed: 1.8, aggroRange: 7 },
  scorpion: { name: "Scorpion",  hp: 80,  atk: 11, exp: 35, speed: 3.0, aggroRange: 6 },
  yeti:     { name: "Yeti",      hp: 200, atk: 16, exp: 110, speed: 2.0, aggroRange: 6 },
  // — more biome mobs —
  boar:     { name: "Wild Boar",  hp: 110, atk: 12, exp: 55, speed: 3.2, aggroRange: 6 },
  spider:   { name: "Spider",     hp: 50,  atk: 9,  exp: 22, speed: 3.0, aggroRange: 7 },
  ghost:    { name: "Ghost",      hp: 80,  atk: 13, exp: 45, speed: 2.4, aggroRange: 9 },
  bat:      { name: "Bat",        hp: 35,  atk: 6,  exp: 14, speed: 4.0, aggroRange: 8 },
  golem:    { name: "Stone Golem",hp: 320, atk: 20, exp: 240, speed: 1.5, aggroRange: 5 },
  fox:      { name: "Fox",        hp: 55,  atk: 7,  exp: 18, speed: 4.5, aggroRange: 7 },
  // resource nodes — static, no aggro, no damage; broken on click
  tree_node: { name: "Tree", hp: 40, atk: 0, exp: 2, speed: 0, aggroRange: 0 },
  rock_node: { name: "Rock", hp: 60, atk: 0, exp: 3, speed: 0, aggroRange: 0 },
  berry_bush: { name: "Berry Bush", hp: 12, atk: 0, exp: 1, speed: 0, aggroRange: 0 },
  ore_node:   { name: "Iron Ore",   hp: 100, atk: 0, exp: 6, speed: 0, aggroRange: 0 },
  crystal_node: { name: "Crystal Vein", hp: 180, atk: 0, exp: 12, speed: 0, aggroRange: 0 },
  // passive animals — wander, flee when attacked (negative aggroRange marker)
  chicken: { name: "Chicken", hp: 8, atk: 0, exp: 1, speed: 2.5, aggroRange: -1 },
  pig:     { name: "Pig",     hp: 24, atk: 0, exp: 3, speed: 2, aggroRange: -1 },
  cow:     { name: "Cow",     hp: 40, atk: 0, exp: 5, speed: 1.5, aggroRange: -1 },
} as const;

export const PASSIVE_ANIMAL_KINDS: ReadonlyArray<MonsterKind> = ["chicken", "pig", "cow"];
export function isPassiveAnimal(kind: string): boolean {
  return (PASSIVE_ANIMAL_KINDS as readonly string[]).includes(kind);
}

export type MonsterKind = keyof typeof MONSTERS;
export const RESOURCE_NODE_KINDS: ReadonlyArray<MonsterKind> = ["tree_node", "rock_node", "berry_bush"];
export function isResourceNode(kind: string): boolean {
  return (RESOURCE_NODE_KINDS as readonly string[]).includes(kind);
}
