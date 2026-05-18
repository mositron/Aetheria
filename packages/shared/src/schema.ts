import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class StatusEffect extends Schema {
  @type("string") kind = "";       // StatusKind
  @type("number") endAt = 0;       // absolute timestamp
  @type("string") fromId = "";
}

export class Vec3 extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
}

export class ItemStack extends Schema {
  @type("string") itemId = "";
  @type("number") qty = 1;
}

export class Player extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") job = "novice";
  @type(Vec3) pos = new Vec3();
  @type("number") rotY = 0;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("number") mp = 20;
  @type("number") maxMp = 20;
  @type("number") atk = 10;
  @type("number") def = 0;
  @type("number") level = 1;
  @type("number") exp = 0;
  @type("boolean") dead = false;
  @type("string") weapon = "";
  @type("string") armor = "";
  @type([ItemStack]) inventory = new ArraySchema<ItemStack>();
  @type("string") appearance = "{}"; // JSON-encoded Appearance (see shared/appearance.ts)
  // survival stats (0-100)
  @type("number") hunger = 100;
  @type("number") thirst = 100;
  @type("number") stamina = 100;
  @type("number") maxStamina = 100;
  @type("number") houseSlot = -1; // -1 = no house, 0..7 = slot index
  @type("string") petKind = "";    // active pet kind ("" if none)
  @type("boolean") mounted = false;
  @type("boolean") petRare = false; // is active pet a rare variant
  @type("string") petsJson = "[]";  // full collection [{id, kind, rare, tamedAt}]
  @type("boolean") flying = false;
  @type("boolean") pvpFlag = false;  // opt-in PvP — can only damage other pvp-flagged players
  @type("string") decorationsJson = "[]"; // [{itemId, x, z}] — placed near owned house
  @type("string") achievementsJson = "{}";
  @type("string") title = "";
  // stats
  @type("number") str = 1;
  @type("number") agi = 1;
  @type("number") vit = 1;
  @type("number") int = 1;
  @type("number") dex = 1;
  @type("number") luk = 1;
  @type("number") statPoints = 0;
  @type("number") zeny = 0;
  @type([StatusEffect]) statuses = new ArraySchema<StatusEffect>();
}

export class Monster extends Schema {
  @type("string") id = "";
  @type("string") kind = "slime";
  @type(Vec3) pos = new Vec3();
  @type("number") hp = 30;
  @type("number") maxHp = 30;
  @type("boolean") dead = false;
  @type("string") targetId = "";
  @type([StatusEffect]) statuses = new ArraySchema<StatusEffect>();
}

export class GroundItem extends Schema {
  @type("string") id = "";
  @type("string") itemId = "";
  @type("number") qty = 1;
  @type(Vec3) pos = new Vec3();
}

export class PlantNode extends Schema {
  @type("string") id = "";
  @type("string") ownerName = "";
  @type(Vec3) pos = new Vec3();
  @type("number") plantedAt = 0; // server timestamp ms
}

export const PLANT_GROW_MS = 3 * 60 * 1000; // 3 minutes to fully ripen
export function plantStage(plantedAt: number, now: number): 0 | 1 | 2 | 3 {
  const t = now - plantedAt;
  if (t < PLANT_GROW_MS * 0.25) return 0;
  if (t < PLANT_GROW_MS * 0.6) return 1;
  if (t < PLANT_GROW_MS) return 2;
  return 3;
}

export class WorldState extends Schema {
  @type("string") mapId = "field";
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Monster }) monsters = new MapSchema<Monster>();
  @type({ map: GroundItem }) drops = new MapSchema<GroundItem>();
  @type({ map: PlantNode }) plants = new MapSchema<PlantNode>();
  @type("number") dayPhase = 0.25; // 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk
  @type("boolean") isNight = false;
  @type("string") weather = "sunny"; // "sunny" | "cloudy" | "rainy"
  @type("string") season = "none";   // "none" | "songkran" | "halloween" | "christmas"
}
