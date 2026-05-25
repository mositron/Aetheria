import { Room, Client } from "@colyseus/core";
import { ArraySchema } from "@colyseus/schema";
import { z } from 'zod';
import { schemas } from '../schemas.js';

function validate<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn('[WorldRoom] invalid payload:', result.error.message);
    return null;
  }
  return result.data;
}
import {
  WorldState, Player, Monster, GroundItem, PlantNode, plantStage, ItemStack, StatusEffect,
  CompanionSchema, COMPANIONS, type CompanionKind,
  GAME_CONFIG, MONSTERS, type MonsterKind,
  ITEMS, MONSTER_DROPS, GATHERED_RESOURCE_ITEMS,
  HOUSE_SLOTS, HOUSE_COST,
  RECIPES_BY_ID,
  ACHIEVEMENTS, emptyAchievementProgress, type AchievementProgress,
  JOBS, JOB_ADVANCEMENT, type JobId, maxMpFor,
  MAPS, biomeAt, type MapId,
  DUNGEONS,
  derived, STAT_POINTS_PER_LEVEL, type StatKey,
  NPCS, SELL_RATIO,
  QUESTS, emptyQuestState, type PlayerQuestState,
  STATUS_DEFS, type StatusKind,
  type InputMsg, type AttackMsg, type ChatMsg, type SkillMsg,
  type EquipMsg, type UnequipMsg, type UseItemMsg, type DropItemMsg,
  type PickupMsg, type ChangeJobMsg, type AllocStatMsg,
  type ShopBuyMsg, type ShopSellMsg,
  type QuestAcceptMsg, type QuestTurnInMsg,
  type EnterDungeonMsg,
  type ProposeMsg, type AcceptProposalMsg, type DeclineProposalMsg, type DivorceMsg,
} from "@game/shared";
import { prisma } from "../db.js";
import { verifyToken } from "../auth.js";
import { recordContribution } from "../leaderboard.js";
import { SpatialHash } from "../services/SpatialHash.js";
import { RateLimiter } from "../services/RateLimiter.js";
import { AntiCheat } from "../services/AntiCheat.js";
import { DailyChallenge } from "../services/DailyChallenge.js";
import { Party, registerPartyHandlers } from "../services/Party.js";
import { Achievements } from "../services/Achievements.js";
import { Friend } from "../services/Friend.js";
import { Mailbox } from "../services/Mailbox.js";
import { Auction } from "../services/Auction.js";
import { Guild } from "../services/Guild.js";
import { registerGuildHandlers } from "../services/Guild.js";
import { Combat } from "../services/Combat.js";
import { Inventory, countItem, removeItem } from "../services/Inventory.js";
import { Trade, registerTradeHandlers } from "../services/Trade.js";
import { Quest } from "../services/Quest.js";
import { Spawn } from "../services/Spawn.js";
import { NpcService } from "../services/NpcService.js";
import { FishingService } from "../services/FishingService.js";
import { FarmingService } from "../services/FarmingService.js";
import { SurvivalService } from "../services/SurvivalService.js";
import { CollisionService } from "../services/CollisionService.js";
import { CombatService } from "../services/CombatService.js";
import { CraftingService } from "../services/CraftingService.js";
import { HousingService } from "../services/HousingService.js";
import { estimateHeight, checkPortal, clamp } from "../services/MovementService.js";
import { AuditService, auditService } from "../services/AuditService.js";
import { getCurrentSeason } from "../services/Season.js";
import { tryWaypoint } from "../services/Waypoint.js";
import { parseCommand, routeCommand, randomHomeCoord } from "../services/ChatCommands.js";
import { BossEventScheduler } from "../services/BossEvent.js";
import { generateChestSpawns, tryOpenChest, tickChests, CHEST_OPEN_RADIUS } from "../services/ChestService.js";
import { ChestSchema } from "@game/shared";


type Intent = { mx: number; mz: number; rotY: number };
type CharRow = {
  id: string; userId: string; name: string; job: string;
  level: number; exp: number; hp: number; maxHp: number; mp: number; maxMp: number;
  atk: number; def: number; weapon: string; armor: string; mapId: string;
  posX: number; posY: number; posZ: number; inventoryJson: string;
};

const INVENTORY_SIZE = 200;

export class WorldRoom extends Room<WorldState> {
  intents = new Map<string, Intent>();
  lastAttack = new Map<string, number>();
  lastSkill = new Map<string, number>(); // key = sid+":"+skillId
  // Anti-spam rate limiter (token bucket per sid×key).
  rateLimiter = new RateLimiter();
  // Input validation / anti-cheat
  antiCheat = new AntiCheat();
  // Daily challenge progress + reward tracking
  daily = new DailyChallenge();
  // Spatial index for fast monster→player AI lookups. Rebuilt each tick.
  playerSpatialHash = new SpatialHash<{ id: string; x: number; z: number; sid: string; dead: boolean }>();
  monsterSpatialHash = new SpatialHash<{ id: string; x: number; z: number; kind: string; dead: boolean }>();
  playerUserId = new Map<string, string>();
  playerCharId = new Map<string, string>();
  playerQuests = new Map<string, PlayerQuestState>();
  // Party state machine (invites, formation, disband)
  partySvc = new Party();
  // Achievement progress + unlock detection
  achievementsSvc = new Achievements();
  // Friend list (DB-backed)
  friendSvc = new Friend(prisma);
  // Mailbox (send/claim/read, DB-backed, race-safe claim)
  mailboxSvc = new Mailbox(prisma);
  // Auction house (list / browse / buy / cancel)
  auctionSvc = new Auction(prisma);
  // Guild (create / join / leave / chat) with transactional integrity
  guildSvc = new Guild(prisma);
  combatSvc!: Combat;
  combatService!: CombatService;
  inventorySvc!: Inventory;
  tradeSvc!: Trade;
  questSvc!: Quest;
  spawnSvc!: Spawn;
  npcSvc!: NpcService;
  fishingSvc!: FishingService;
  farmingSvc!: FarmingService;
  survivalSvc!: SurvivalService;
  collisionSvc!: CollisionService;
  craftingSvc!: CraftingService;
  housingSvc!: HousingService;
  monsterSpawn = new Map<string, { x: number; z: number; kind: MonsterKind }>();
  sessionToCharId = new Map<string, string>(); // sid -> Character.id (for DB writes)
  chunkSpawnAcc = 0;                            // tick accumulator for chunk spawning
  spawnedChestChunks = new Set<string>();       // chunks that have already had a chest roll
  spawnedResourceChunks = new Set<string>();    // chunks that already have resource nodes
  get tradeSessions() {
    return this.tradeSvc.sessions;
  }
  mpRegenAcc = 0;
  autoSaveAcc = 0;
  bossEventSched = new BossEventScheduler();
  bossTimerAcc = 0;
  weatherAcc = 0;
  botIds = new Set<string>();
  botState = new Map<string, { wander: { x: number; z: number; until: number }; nextActionAt: number }>();
  tameProgress = new Map<string, number>(); // key = sid + ":" + monsterId
  statusTickAcc = new Map<string, number>(); // entityId+statusKind -> last tick time

  static async onAuth(_token: string, request: any) {
    const tokenStr = request?.headers?.token || request?.query?.token || "";
    // we accept token from `options` instead via per-instance check below
    return true;
  }

  onCreate(opts: { mapId?: MapId; worldId?: string; worldName?: string; worldMode?: string; worldTemplate?: string; maxPlayers?: number }) {
    const mapId: MapId = (opts?.mapId ?? "field") as MapId;
    const state = new WorldState();
    this.setState(state);
    this.state.mapId = mapId;
    this.state.worldId = opts.worldId ?? "";
    this.state.worldName = opts.worldName ?? "";
    this.state.worldMode = opts.worldMode ?? "adventure";
    this.state.worldTemplate = opts.worldTemplate ?? "forest";
    // Store maxPlayers from world metadata (default 8)
    (this as any)._maxPlayers = opts.maxPlayers ?? 8;
    (this as any)._worldId = opts.worldId ?? "";
    // Set Colyseus maxClients so the underlying engine enforces the cap
    this.maxClients = (this as any)._maxPlayers;

    this.combatSvc = new Combat(
      this.state,
      this.lastAttack,
      this.lastSkill,
      this.statusTickAcc,
      this.botIds,
      this.clock,
      {
        broadcast: (type, data) => this.broadcast(type, data),
        grantExp: (p, amount) => this.grantExp(p, amount),
        onMonsterKilled: (sid, kind) => this.questSvc.onMonsterKilled(sid, kind),
        bumpAchievement: (sid, counter, amount) => this.bumpAchievement(sid, counter, amount),
        bumpDailyChallenge: (sid, kind, amount) => this.bumpDailyChallenge(sid, kind, amount),
        dropLoot: (m) => this.dropLoot(m),
        monsterSpawn: this.monsterSpawn
      }
    );

    this.combatService = new CombatService(
      this.state,
      this.lastAttack,
      {
        broadcast: (type, data) => this.broadcast(type, data),
        sendToSid: (sid, type, data) => {
          const c = this.clients.find((cc) => cc.sessionId === sid);
          c?.send(type as any, data);
        },
      }
    );

    this.inventorySvc = new Inventory(
      this.state,
      this.lastAttack,
      this.botIds,
      prisma,
      {
        broadcast: (type, data) => this.broadcast(type, data),
        recalcStats: (p) => this.combatSvc.recalcStats(p),
        spawnGroundItem: (itemId, qty, x, z) => this.spawnGroundItem(itemId, qty, x, z),
        sendToClient: (sid, type, data) => {
          const c = this.clients.find((cl) => cl.sessionId === sid);
          c?.send(type as any, data);
        }
      }
    );

    this.tradeSvc = new Trade(
      this.state,
      {
        sendToClient: (sid, type, data) => {
          const c = this.clients.find((cl) => cl.sessionId === sid);
          c?.send(type as any, data);
        },
        addToInventory: (p, itemId, qty) => this.inventorySvc.addToInventory(p, itemId, qty)
      }
    );
    this.tradeSvc.setAuditLog((action, opts) => (auditService as any).log(action, opts));

    this.questSvc = new Quest(
      this.state,
      this.playerQuests,
      {
        sendToClient: (sid, type, data) => {
          const c = this.clients.find((cl) => cl.sessionId === sid);
          c?.send(type as any, data);
        },
        grantExp: (p, amount) => this.grantExp(p, amount),
        addToInventoryOrMail: (p, itemId, qty, source) => this.inventorySvc.addToInventoryOrMail(p, itemId, qty, source)
      }
    );

    this.spawnSvc = new Spawn(
      this.state,
      this.monsterSpawn,
      this.spawnedResourceChunks,
      this.spawnedChestChunks,
      this.botIds,
      this.lastAttack,
      this.statusTickAcc,
      this.tameProgress,
      {
        spawnGroundItem: (itemId, qty, x, z) => this.spawnGroundItem(itemId, qty, x, z)
      }
    );

    this.npcSvc = new NpcService();

    this.fishingSvc = new FishingService(
      this.state,
      (p, itemId, qty) => this.addToInventory(p, itemId, qty),
      (sid, counter, by) => this.bumpAchievement(sid, counter, by)
    );

    this.farmingSvc = new FarmingService(
      this.state,
      (p, itemId, qty) => this.addToInventory(p, itemId, qty),
      (sid, counter, by) => this.bumpAchievement(sid, counter, by),
      this.lastAttack,
      this.statusTickAcc,
      this.monsterSpawn,
      this.tameProgress
    );

    this.survivalSvc = new SurvivalService(
      this.state,
      (p) => this.isStunned(p),
      (p) => this.speedMultOf(p),
      (sid, type, data) => {
        const c = this.clients.find((cl) => cl.sessionId === sid);
        c?.send(type as any, data);
      }
    );

    this.collisionSvc = new CollisionService(mapId);

    this.craftingSvc = new CraftingService(
      this.state,
      (p, itemId, qty) => this.addToInventory(p, itemId, qty),
      (sid, counter, by) => this.bumpAchievement(sid, counter, by)
    );

    this.housingSvc = new HousingService(
      this.state,
      (p, itemId, qty) => removeItem(p, itemId, qty),
      (sid, counter, by) => this.bumpAchievement(sid, counter, by)
    );
    // ── Seasonal events ───────────────────────────────────────────────────────
    this.state.season = getCurrentSeason();
    this.setPatchRate(1000 / 20);
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / GAME_CONFIG.TICK_RATE);

    // Dungeon: randomize mob spawns + scatter treasure chests every visit
    if (mapId === "dungeon") {
      const def = MAPS[mapId];
      const half = def.size / 2;
      // Random hostile mobs (4-6 wolves, 3-5 orcs, 0-1 darklord)
      const wolfCount = 4 + Math.floor(Math.random() * 3);
      const orcCount = 3 + Math.floor(Math.random() * 3);
      const fixedSpawn = (kind: any) => {
        let x = (Math.random() - 0.5) * (def.size - 6);
        let z = (Math.random() - 0.5) * (def.size - 6);
        // keep away from entrance portal at (-20, 0)
        if (Math.hypot(x - -20, z - 0) < 8) { x += 15; z += 8; }
        this.spawnMonster(kind, x, z);
      };
      for (let i = 0; i < wolfCount; i++) fixedSpawn("wolf");
      for (let i = 0; i < orcCount; i++) fixedSpawn("orc");
      this.spawnMonster("darklord", (Math.random() - 0.5) * half, half * 0.7);
      // resources
      for (let i = 0; i < 5; i++) fixedSpawn("rock_node");
      for (let i = 0; i < 3; i++) fixedSpawn("ore_node");
      for (let i = 0; i < 2; i++) fixedSpawn("crystal_node");
      // Treasure chests as ground items
      const treasures = [
        { itemId: "hp_potion", qty: 5 },
        { itemId: "iron_sword", qty: 1 },
        { itemId: "crystal", qty: 2 },
        { itemId: "energy_tonic", qty: 3 },
      ];
      for (let i = 0; i < 4; i++) {
        const t = treasures[i % treasures.length];
        const x = (Math.random() - 0.5) * (def.size - 8);
        const z = (Math.random() - 0.5) * (def.size - 8);
        this.spawnGroundItem(t.itemId, t.qty, x, z);
      }
    } else {
      for (const sp of MAPS[mapId].spawns) this.spawnMonster(sp.kind, sp.x, sp.z);
      // Treasure chests — 2 per cave on the field map.
      for (const info of generateChestSpawns()) {
        const chest = new ChestSchema();
        chest.id = info.id;
        chest.x = info.x;
        chest.z = info.z;
        chest.theme = info.theme;
        this.state.chests.set(info.id, chest);
      }
    }

    // Dev bots: spawn fake players for solo multiplayer testing
    const botCount = Math.max(0, Math.min(8, parseInt(process.env.DEV_BOTS ?? "0", 10) || 0));
    if (botCount > 0 && mapId === "field") {
      for (let i = 0; i < botCount; i++) this.spawnBot(i);
      console.log(`[room ${mapId}] spawned ${botCount} dev bot(s)`);
    }

    this.onMessage("input", (client, msg: InputMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      const v = this.antiCheat.validateInput(msg);
      if (!v.ok) {
        if (this.checkRateLimit(client.sessionId, "anticheat-log", 1, 5000)) {
          console.warn("[anticheat] suspicious input", { sid: client.sessionId, name: p.name, reason: v.reason, mx: msg.mx, mz: msg.mz });
        }
        return;
      }
      this.intents.set(client.sessionId, { mx: v.mx, mz: v.mz, rotY: v.rotY });
    });

    this.onMessage("attack", (client, msg: AttackMsg) => {
      const payload = validate(schemas.attack, msg);
      if (!payload) return;
      this.handleAttack(client.sessionId, payload.targetId);
    });
    this.onMessage("skill", (client, msg: SkillMsg) => {
      const payload = validate(schemas.cast_skill, msg);
      if (!payload) return;
      this.handleSkill(client.sessionId, payload.skillId, payload.targetId);
    });
    this.onMessage("equip", (client, msg: EquipMsg) => {
      const payload = validate(schemas.equip, msg);
      if (!payload) return;
      this.handleEquip(client.sessionId, payload.slotIndex);
    });
    this.onMessage("unequip", (client, msg: UnequipMsg) => {
      const payload = validate(schemas.unequip, msg);
      if (!payload) return;
      this.handleUnequip(client.sessionId, payload.slot);
    });
    this.onMessage("useItem", (client, msg: UseItemMsg) => {
      const payload = validate(schemas.useItem, msg);
      if (!payload) return;
      this.handleUseItem(client.sessionId, payload.invIndex);
    });
    this.onMessage("dropItem", (client, msg: DropItemMsg) => this.handleDrop(client.sessionId, msg.invIndex, msg.qty));
    this.onMessage("pickup", (client, msg: PickupMsg) => this.handlePickup(client.sessionId, msg.dropId));
    this.onMessage("openChest", (client, msg: any) => this.handleOpenChest(client.sessionId, String(msg?.chestId ?? "")));
    this.onMessage("changeJob", (client, msg: ChangeJobMsg) => this.handleChangeJob(client.sessionId, msg.job));
    this.onMessage("allocStat", (client, msg: AllocStatMsg) => this.handleAllocStat(client.sessionId, msg.stat));
    this.onMessage("shopBuy", (client, msg: ShopBuyMsg) => this.npcSvc.handleShopBuy(this.state, client, msg, this.addToInventory.bind(this)));
    this.onMessage("shopSell", (client, msg: ShopSellMsg) => this.npcSvc.handleShopSell(this.state, client, msg));
    this.onMessage("shopSellMany", (client, msg: any) => this.npcSvc.handleShopSellMany(this.state, client, msg));
    this.onMessage("questAccept", (client, msg: QuestAcceptMsg) => this.handleQuestAccept(client, msg.questId));
    this.onMessage("questTurnIn", (client, msg: QuestTurnInMsg) => this.handleQuestTurnIn(client, msg.questId));
    // ── Party system (standalone function) ───────────────────────────────────
    const partyHandlers = registerPartyHandlers({
      state: this.state,
      getPlayer: (sid) => this.state.players.get(sid),
      sendToClient: (sid, type, data) => this.clients.find(c => c.sessionId === sid)?.send(type as any, data),
      getCharId: (sid) => this.sessionToCharId.get(sid),
      partySvc: this.partySvc,
      clients: this.clients,
    });
    for (const [type, handler] of Object.entries(partyHandlers)) {
      this.onMessage(type, handler as any);
    }

    // Endless Dungeon handlers
    this.onMessage("enterDungeon", (client, msg: EnterDungeonMsg) => this.enterDungeon(client.sessionId, msg.floor));
    this.onMessage("claimDungeonReward", (client) => this.claimFloorReward(client.sessionId));
    this.onMessage("descendDungeon", (client) => this.descendNextFloor(client.sessionId));

    this.onMessage("drink", (client) => this.survivalSvc.handleDrink(client.sessionId));

    // Waypoint fast-travel — service holds table + lookup, WorldRoom mutates state.
    this.onMessage("waypoint_travel", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const r = tryWaypoint(p.zeny, String(msg?.id ?? ""));
      if (!r.ok) {
        const text = r.reason === "no-zeny"
          ? "ไม่พอ... ต้องมีเงินอย่างน้อย 50z ถึงจะใช้ waypoint"
          : "ไม่พบจุด warp นี้";
        client.send("system", { text });
        return;
      }
      p.zeny -= r.cost;
      p.pos.x = r.x;
      p.pos.z = r.z;
      client.send("system", { text: `ไป ${r.name} แล้ว (${r.cost}z)` });
    });

    this.onMessage("buildHouse", (client) => this.housingSvc.handleBuildHouse(client));
    this.onMessage("craft", (client, msg: any) => {
      const payload = validate(schemas.craft, msg);
      if (!payload) return;
      this.craftingSvc.handleCraft(client, payload.recipeId, payload.benchTier ?? 0);
    });
    this.onMessage("startFishing", (client) => this.fishingSvc.handleStartFishing(client));
    this.onMessage("stopFishing", (client) => this.fishingSvc.handleStopFishing(client));
    this.onMessage("plantSeed", (client) => this.farmingSvc.handlePlantSeed(client));
    this.onMessage("harvestPlant", (client, msg: any) => {
      const payload = validate(schemas.harvest, msg);
      if (!payload) return;
      this.farmingSvc.handleHarvestPlant(client, payload.plantId);
    });
    this.onMessage("feedAnimal", (client, msg: any) => this.farmingSvc.handleFeedAnimal(client, msg?.monsterId));
    this.onMessage("mount", (client) => this.handleMount(client));
    this.onMessage("setActivePet", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const petId = String(msg?.petId ?? "");
      let pets: any[] = [];
      try { pets = JSON.parse(p.petsJson || "[]"); } catch {}
      if (!petId) {
        // unequip
        p.petKind = ""; p.petRare = false; p.mounted = false;
        return;
      }
      const found = pets.find((pt) => pt.id === petId);
      if (!found) return;
      p.petKind = found.kind;
      p.petRare = !!found.rare;
      p.mounted = false;
    });
    this.onMessage("placeFurniture", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      const itemId = String(msg?.itemId ?? "");
      const itemDef = ITEMS[itemId];
      if (!itemDef || itemDef.itemType !== "furniture") {
        client.send("system", { text: "ไม่พบไอเทมนี้" }); return;
      }
      if (p.houseSlot < 0) { client.send("system", { text: "ต้องมีบ้านก่อน" }); return; }
      const slot = HOUSE_SLOTS[p.houseSlot];
      if (!slot) return;
      // must be near own house (4m)
      if (Math.hypot(p.pos.x - slot.x, p.pos.z - slot.z) > 4) {
        client.send("system", { text: "เข้าใกล้บ้านของคุณก่อน" });
        return;
      }
      if (countItem(p, itemId) < 1) {
        client.send("system", { text: "ขาดของชิ้นนี้ในกระเป๋า" });
        return;
      }
      let decos: any[] = [];
      try { decos = JSON.parse(p.decorationsJson || "[]"); } catch {}
      if (decos.length >= 12) { client.send("system", { text: "วางเฟอร์นิเจอร์ได้สูงสุด 12 ชิ้น" }); return; }
      // Place at player's current position relative to house center
      const offX = p.pos.x - slot.x;
      const offZ = p.pos.z - slot.z;
      decos.push({ itemId, x: +offX.toFixed(2), z: +offZ.toFixed(2) });
      p.decorationsJson = JSON.stringify(decos);
      removeItem(p, itemId, 1);
      client.send("system", { text: `🪑 วาง ${ITEMS[itemId]?.name ?? itemId} แล้ว` });
    });

    this.onMessage("removeFurniture", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const idx = msg?.index | 0;
      let decos: any[] = [];
      try { decos = JSON.parse(p.decorationsJson || "[]"); } catch {}
      if (idx < 0 || idx >= decos.length) return;
      const furniture = decos[idx];
      if (furniture.ownerId && furniture.ownerId !== client.sessionId) {
        client.send("system", { text: "นี่ไม่ใช่ของคุณ" }); return;
      }
      const removed = decos.splice(idx, 1)[0];
      p.decorationsJson = JSON.stringify(decos);
      this.addToInventory(p, removed.itemId, 1);
      client.send("system", { text: `↩ เก็บ ${ITEMS[removed.itemId]?.name ?? removed.itemId} กลับ` });
    });

    this.onMessage("sendMail", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const zeny = Math.max(0, Math.min(9_999_999, msg?.zeny | 0));
      if (zeny > 0 && p.zeny < zeny) {
        client.send("system", { text: "เงินไม่พอ" });
        return;
      }
      // Resolve optional item-from-inventory payload
      let itemId = "", itemQty = 0;
      const itemInvIdx = msg?.itemInvIdx;
      if (typeof itemInvIdx === "number" && itemInvIdx >= 0 && itemInvIdx < p.inventory.length) {
        const stack = p.inventory[itemInvIdx];
        itemId = stack.itemId;
        itemQty = Math.max(1, Math.min(stack.qty, msg?.itemQty | 0 || 1));
      }
      const r = await this.mailboxSvc.send({
        fromName: p.name,
        toName: String(msg?.to ?? "").trim(),
        subject: String(msg?.subject ?? ""),
        body: String(msg?.body ?? ""),
        zeny, itemId, itemQty,
      });
      if (!r.ok) {
        if (r.reason === "target-missing") client.send("system", { text: `ไม่พบผู้เล่นชื่อ ${msg?.to}` });
        return;
      }
      if (zeny > 0) p.zeny -= zeny;
      if (itemId && itemQty > 0) removeItem(p, itemId, itemQty);
      client.send("system", { text: `📬 ส่งจดหมายถึง ${msg?.to} แล้ว` });
    });

    this.onMessage("claimMail", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const reward = await this.mailboxSvc.claim(String(msg?.id ?? ""), p.name);
      if (!reward) return; // race lost or invalid
      if (reward.zeny > 0) p.zeny += reward.zeny;
      if (reward.itemId && reward.itemQty > 0) this.addToInventory(p, reward.itemId, reward.itemQty);
      client.send("system", { text: "📦 รับของเรียบร้อย" });
      client.send("mailUpdated", {});
    });

    this.onMessage("readMail", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      await this.mailboxSvc.markRead(String(msg?.id ?? ""), p.name);
    });

    this.onMessage("toggleFly", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      // Unlock: level >= 10 OR defeated darklord
      let prog: any = { counters: {} };
      try { prog = JSON.parse(p.achievementsJson || "{}"); } catch {}
      const unlocked = p.level >= 10 || (prog.counters?.darklord ?? 0) >= 1;
      if (!unlocked && !p.flying) {
        client.send("system", { text: "✨ ต้องถึง Lv10 หรือชนะ Dark Lord ก่อนจึงจะบินได้" });
        return;
      }
      if (!p.flying && p.stamina < 20) {
        client.send("system", { text: "Stamina ไม่พอ — ต้องมี 20+" });
        return;
      }
      p.flying = !p.flying;
      if (p.flying) {
        p.mounted = false;
        client.send("system", { text: "🪽 บินขึ้น!" });
      } else {
        client.send("system", { text: "🚶 ลงพื้น" });
      }
    });

    this.onMessage("breedPets", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const a = String(msg?.aId ?? ""); const b = String(msg?.bId ?? "");
      if (!a || !b || a === b) return;
      let pets: any[] = [];
      try { pets = JSON.parse(p.petsJson || "[]"); } catch {}
      const aP = pets.find((pt) => pt.id === a);
      const bP = pets.find((pt) => pt.id === b);
      if (!aP || !bP) return;
      if (aP.kind !== bP.kind) {
        client.send("system", { text: "ต้องเป็นสัตว์ชนิดเดียวกัน" });
        return;
      }
      if (pets.length >= 8) { client.send("system", { text: "สัตว์เลี้ยงเต็ม (สูงสุด 8)" }); return; }
      if (p.zeny < 200) { client.send("system", { text: "ต้องใช้ 200 zeny ในการผสมพันธุ์" }); return; }
      // Cost
      p.zeny -= 200;
      // Offspring: rare if BOTH parents rare (75%), else rare 15% (vs 5% on tame)
      const bothRare = aP.rare && bP.rare;
      const isRare = bothRare ? Math.random() < 0.75 : Math.random() < 0.15;
      const newPet = { id: "pet_" + Math.random().toString(36).slice(2, 8), kind: aP.kind, rare: isRare, tamedAt: Date.now() };
      pets.push(newPet);
      p.petsJson = JSON.stringify(pets);
      client.send("system", { text: `🥚 ผสมพันธุ์สำเร็จ — ได้ ${isRare ? "✨พิเศษ✨ " : ""}${aP.kind} ตัวใหม่!` });
    });

    this.onMessage("releasePet", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const petId = String(msg?.petId ?? "");
      let pets: any[] = [];
      try { pets = JSON.parse(p.petsJson || "[]"); } catch {}
      const idx = pets.findIndex((pt) => pt.id === petId);
      if (idx < 0) return;
      const removed = pets.splice(idx, 1)[0];
      p.petsJson = JSON.stringify(pets);
      if (p.petKind === removed.kind && p.petRare === removed.rare) {
        // unequip if releasing active — pick another with same kind if exists, else clear
        const next = pets.find((pt) => pt.kind === removed.kind);
        if (next) { p.petKind = next.kind; p.petRare = !!next.rare; }
        else { p.petKind = ""; p.petRare = false; p.mounted = false; }
      }
      client.send("system", { text: `🕊 ปล่อย ${removed.kind} แล้ว` });
    });

    this.onMessage("evolvePet", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const petId = String(msg?.petId ?? "");
      let pets: any[] = [];
      try { pets = JSON.parse(p.petsJson || "[]"); } catch {}
      const pet = pets.find((pt) => pt.id === petId);
      if (!pet) return;
      if (p.zeny < 5000) { client.send("system", { text: "ต้องใช้ 5000 zeny ในการพัฒนา" }); return; }
      const EVOLUTIONS: Record<string, { chance: number; result: string; name: string }> = {
        chicken:  { chance: 0.05, result: "phoenix_chick",  name: "ลูกฟีนิกซ์" },
        pig:      { chance: 0.08, result: "truffle_pig",    name: "หมูทรัฟเฟิล" },
        cow:      { chance: 0.10, result: "golden_cow",      name: "วัวทอง" },
      };
      const evo = EVOLUTIONS[pet.kind];
      if (!evo) { client.send("system", { text: "สัตว์เลี้ยงนี้ไม่สามารถพัฒนาได้" }); return; }
      p.zeny -= 5000;
      if (Math.random() < evo.chance) {
        pet.kind = evo.result;
        pet.name = evo.name;
        p.petsJson = JSON.stringify(pets);
        client.send("system", { text: `✨ พัฒนาสำเร็จ! ได้ ${evo.name}!` });
      } else {
        client.send("system", { text: `💥 พัฒนาไม่สำเร็จ... ลองอีกครั้ง!` });
      }
    });

    this.onMessage("allocateSkill", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const skillId = String(msg?.skillId ?? "");
      if (!skillId) return;
      if (p.skillPoints < 1) { client.send("system", { text: "ไม่มีแต้มสกิล" }); return; }
      let unlocked: string[] = [];
      try { unlocked = JSON.parse(p.unlockedSkillsJson || "[]"); } catch {}
      if (unlocked.includes(skillId)) { client.send("system", { text: "มีสกิลนี้แล้ว" }); return; }
      unlocked.push(skillId);
      p.unlockedSkillsJson = JSON.stringify(unlocked);
      p.skillPoints -= 1;
      client.send("system", { text: `🌟 เรียนสกิล ${skillId} สำเร็จ! เหลือ ${p.skillPoints} แต้ม` });
    });

    this.onMessage("researchDiscover", async (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const { Research } = await import("../services/Research.js");
      const research = new Research();
      const found = research.attemptDiscovery(p);
      if (found) {
        client.send("system", { text: `📜 ค้นพบสูตรใหม่: ${found.name}!` });
      } else {
        client.send("system", { text: "ไม่มีสูตรให้ค้นพบ หรือแต้มวิจัยไม่พอ (ต้องการ 100 แต้ม)" });
      }
    });
    this.onMessage("biomeSpell", (client, msg: any) => this.handleBiomeSpell(client, msg?.targetId));
    this.onMessage("setTitle", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const title = String(msg?.title ?? "").slice(0, 40);
      // Validate: title must be one of unlocked achievement titles (or empty)
      if (title === "") { p.title = ""; return; }
      let prog: any = { unlocked: [] };
      try { prog = JSON.parse(p.achievementsJson || "{}"); } catch {}
      const allowed = new Set<string>();
      for (const a of ACHIEVEMENTS) {
        if (a.title && prog.unlocked?.includes(a.id)) allowed.add(a.title);
      }
      if (allowed.has(title)) p.title = title;
    });
    this.onMessage("emote", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const emote = String(msg?.emote ?? "").slice(0, 12);
      if (!emote) return;
      this.broadcast("emote", { playerId: p.id, emote, ts: Date.now() });
    });

    this.onMessage("whisper", (client, msg: any) => {
      const payload = validate(schemas.whisper, msg);
      if (!payload) return;
      const fromP = this.state.players.get(client.sessionId);
      if (!fromP) return;
      if (!this.checkRateLimit(client.sessionId, "whisper", 5, 5000)) {
        return client.send("system", { text: "⏸ ส่งช้าๆ" });
      }
      const text = String(payload.text ?? "").slice(0, 200).trim();
      const to = String(payload.to ?? "").trim();
      if (!text || !to) return;
      let targetClient: Client | null = null;
      for (const c of this.clients) {
        const p = this.state.players.get(c.sessionId);
        if (p?.name === to) { targetClient = c; break; }
      }
      if (!targetClient) {
        // Offline: queue as mailbox subject so target sees it on next login.
        this.mailboxSvc.send({
          fromName: fromP.name,
          toName: to,
          subject: `💬 ${fromP.name}`,
          body: text,
          zeny: 0,
        }).then((r) => {
          if (r.ok) {
            client.send("system", { text: `📬 ${to} ออฟไลน์ — ส่งเป็นจดหมายแทน` });
          } else if (r.reason === "target-missing") {
            client.send("system", { text: `ไม่พบผู้เล่นชื่อ "${to}"` });
          } else {
            client.send("system", { text: `ส่ง whisper ไม่สำเร็จ` });
          }
        });
        return;
      }
      targetClient.send("whisper", { from: fromP.name, text, ts: Date.now() });
      client.send("whisper", { from: fromP.name + " → " + to, text, ts: Date.now() });
    });

    // ── Friend list (delegated to FriendService) ──────────────────────────────
    const friendHandlers = this.friendSvc.registerHandlers(
      (name) => this.isOnline(name),
      (sid, type, data) => this.clients.find(c => c.sessionId === sid)?.send(type as any, data),
      (sid) => this.sessionToCharId.get(sid),
      (sid) => this.state.players.get(sid),
    );
    for (const [type, handler] of Object.entries(friendHandlers)) {
      this.onMessage(type, handler as any);
    }

    // ── Guild system (standalone function) ────────────────────────────────────
    const guildHandlers = registerGuildHandlers({
      prisma,
      state: this.state,
      getPlayer: (sid: string) => this.state.players.get(sid),
      sendToClient: (sid: string, type: string, data: any) => this.clients.find(c => c.sessionId === sid)?.send(type as any, data),
      getCharId: (sid: string) => this.sessionToCharId.get(sid),
      checkRateLimit: (sid: string, key: string, max: number, window: number) => this.checkRateLimit(sid, key, max, window),
      clients: this.clients,
    });
    for (const [type, handler] of Object.entries(guildHandlers)) {
      this.onMessage(type, handler as any);
    }

    // ── Marriage system ─────────────────────────────────────────────────────────
    this.onMessage("propose", (client, msg: ProposeMsg) => {
      const proposer = this.state.players.get(client.sessionId);
      if (!proposer) return;
      if (proposer.spouseId) { client.send("system", { text: "คุณแต่งงานแล้ว" }); return; }
      const target = Array.from(this.state.players.values()).find(p => p.name === msg.targetName);
      if (!target) { client.send("system", { text: "ไม่พบผู้เล่นนี้" }); return; }
      if (target.mapId !== proposer.mapId) { client.send("system", { text: "ผู้เล่นนี้ต้องอยู่แผนที่เดียวกับคุณ" }); return; }
      if (target.spouseId) { client.send("system", { text: "ผู้นี้แต่งงานแล้ว" }); return; }
      target.sessionId && this.clients.find(c => c.sessionId === target.sessionId)
        ?.send("proposal_received", { fromName: proposer.name, fromId: client.sessionId });
      client.send("system", { text: `ส่งคำขอแต่งงานไปหา ${target.name} แล้ว` });
    });

    this.onMessage("accept_proposal", (client, msg: AcceptProposalMsg) => {
      const payload = validate(schemas.accept_proposal, msg);
      if (!payload) return;
      const acceptor = this.state.players.get(client.sessionId);
      if (!acceptor) return;
      const proposer = Array.from(this.state.players.values()).find(p => p.name === payload.proposerName && p.spouseId === "");
      if (!proposer) { client.send("system", { text: "ไม่พบคำขอนี้" }); return; }
      const ts = Date.now();
      acceptor.spouseId = String(client.sessionId);
      acceptor.spouseName = proposer.name;
      acceptor.marriageDate = ts;
      const proposerClient = this.clients.find(c => c.sessionId === proposer.sessionId);
      if (proposerClient) {
        proposer.spouseId = client.sessionId;
        proposer.spouseName = acceptor.name;
        proposer.marriageDate = ts;
        proposerClient.send("system", { text: `💍 คุณแต่งงานกับ ${acceptor.name} แล้ว! ขอให้มีความสุขนะ!` });
      }
      client.send("system", { text: `💍 คุณแต่งงานกับ ${payload.proposerName} แล้ว!` });
      this.addToInventory(acceptor, "wedding_ring_f", 1);
      if (proposerClient) this.addToInventory(proposer as any, "wedding_ring_m", 1);
    });

    this.onMessage("decline_proposal", (client, msg: DeclineProposalMsg) => {
      const payload = validate(schemas.decline_proposal, msg);
      if (!payload) return;
      const decliner = this.state.players.get(client.sessionId);
      if (!decliner) return;
      const proposer = Array.from(this.state.players.values()).find(p => p.name === payload.proposerName);
      const proposerClient = proposer ? this.clients.find(c => c.sessionId === proposer.sessionId) : null;
      if (proposerClient) proposerClient.send("system", { text: `💔 ${decliner.name} ปฏิเสธคำขอแต่งงานของคุณ` });
      client.send("system", { text: `ปฏิเสธคำขอแต่งงานจาก ${payload.proposerName} แล้ว` });
    });

    this.onMessage("divorce", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (!p.spouseId) { client.send("system", { text: "คุณไม่ได้แต่งงาน" }); return; }
      const spouse = Array.from(this.state.players.values()).find(p2 => p2.sessionId === p.spouseId);
      p.spouseId = "";
      p.spouseName = "";
      p.marriageDate = 0;
      if (spouse) {
        spouse.spouseId = "";
        spouse.spouseName = "";
        spouse.marriageDate = 0;
        const spouseClient = this.clients.find(c => c.sessionId === spouse.sessionId);
        if (spouseClient) spouseClient.send("system", { text: "💔 คู่สมรสของคุณขอหย่า" });
      }
      client.send("system", { text: "💔 คุณหย่าขาดแล้ว" });
    });

    this.onMessage("advanceJob", async (client, msg: any) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      if (me.level < 30) return client.send("system", { text: "ต้องถึงเลเวล 30 ก่อนเปลี่ยนอาชีพ" });
      const newJob = String(msg?.job ?? "").trim();
      const options = (JOB_ADVANCEMENT as any)[me.job] as string[] | undefined;
      if (!options || !options.includes(newJob)) {
        return client.send("system", { text: "อาชีพนี้เปลี่ยนเป็น \"" + newJob + "\" ไม่ได้" });
      }
      const job = (JOBS as any)[newJob];
      if (!job) return;
      me.job = newJob;
      // Recalc HP/MP via the new job (keep current %)
      const hpPct = me.hp / me.maxHp;
      const mpPct = me.mp / me.maxMp;
      me.maxHp = job.hpPerLevel ? job.hpPerLevel * me.level + 100 : me.maxHp;
      me.maxMp = job.mpPerLevel ? job.mpPerLevel * me.level + (job.baseMaxMp ?? 20) : me.maxMp;
      me.hp = Math.floor(me.maxHp * hpPct);
      me.mp = Math.floor(me.maxMp * mpPct);
      try { await prisma.character.update({ where: { id: charId }, data: { job: newJob, maxHp: me.maxHp, maxMp: me.maxMp } }); } catch {}
      client.send("system", { text: `✨ เปลี่ยนอาชีพเป็น ${job.name}!` });
    });

    // ── Auction house (delegated to AuctionService) ────────────────────────────
    const auctionHandlers = this.auctionSvc.registerHandlers(
      (sid) => this.state.players.get(sid),
      (sid, type, data) => this.clients.find(c => c.sessionId === sid)?.send(type as any, data),
      this.addToInventory.bind(this),
      (input: any) => this.mailboxSvc.send(input).then(() => {}),
      (action, opts) => (auditService as any).log(action, opts),
    );
    for (const [type, handler] of Object.entries(auctionHandlers)) {
      this.onMessage(type, handler as any);
    }

    // ── P2P Trading (standalone function) ────────────────────────────────────
    const tradeHandlers = registerTradeHandlers({ tradeSvc: this.tradeSvc });
    for (const [type, handler] of Object.entries(tradeHandlers)) {
      this.onMessage(type, handler as any);
    }

    this.onMessage("togglePvp", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.pvpFlag = !p.pvpFlag;
      client.send("system", { text: p.pvpFlag ? "⚔ เปิด PvP — ผู้เล่นอื่นที่เปิด PvP ตีเราได้" : "🕊 ปิด PvP — ปลอดภัยจากผู้เล่นอื่น" });
    });

    // PvP attack — only succeeds if BOTH attacker and target have pvpFlag.
    this.onMessage("pvpAttack", (client, msg: any) => {
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || attacker.dead || !attacker.pvpFlag) return;
      const targetSid = String(msg?.targetSid ?? "");
      const target = this.state.players.get(targetSid);
      if (!target || target.dead || !target.pvpFlag) {
        return client.send("system", { text: target ? "เป้าหมายไม่เปิด PvP" : "ไม่พบเป้าหมาย" });
      }
      const result = this.combatService.handlePvpAttack(attacker, target, Date.now());
      if (!result || !result.hit) return;
      target.hp = Math.max(0, target.hp - result.dmg);
      this.broadcast("damage", { targetId: target.id, amount: result.dmg, from: attacker.id, crit: result.crit });
      if (target.hp === 0) {
        target.dead = true;
        this.broadcast("system", { text: `⚔ ${attacker.name} เอาชนะ ${target.name}!` });
        // Death recap for the victim
        const victimClient = this.clients.find((c) => this.state.players.get(c.sessionId) === target);
        victimClient?.send("death" as any, { killer: attacker.name, killerKind: "player" });
      }
    });

    this.onMessage("chat", (client, msg: ChatMsg) => {
      const payload = validate(schemas.chat, msg);
      if (!payload) return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      // Rate limit: 5 messages per 5 sec per client
      if (!this.checkRateLimit(client.sessionId, "chat", 5, 5000)) {
        return client.send("system", { text: "⏸ ส่งช้าๆ หน่อย — รอสักครู่" });
      }
      const text = String(payload.text ?? "").slice(0, 200).trim();
      if (!text) return;
      // ── Slash commands ───────────────────────────────────────────────
      const parsed = parseCommand(text);
      if (parsed) {
        const effect = routeCommand(parsed);
        if (effect) {
          switch (effect.kind) {
            case "help":
              client.send("system", { text: effect.text });
              return;
            case "togglePvp":
              p.pvpFlag = !p.pvpFlag;
              client.send("system", { text: p.pvpFlag ? "⚔ PvP เปิดแล้ว" : "🕊 PvP ปิดแล้ว" });
              return;
            case "warpHome": {
              const c = randomHomeCoord();
              p.pos.x = c.x; p.pos.z = c.z;
              client.send("system", { text: "🏡 กลับสู่หมู่บ้าน" });
              return;
            }
            case "listOnline": {
              const names: string[] = [];
              for (const [, q] of this.state.players) if (!this.botIds.has(q.id)) names.push(q.name);
              client.send("system", { text: `👥 ออนไลน์: ${names.join(", ")}` });
              return;
            }
            case "whisper": {
              const to = effect.to, body = effect.body;
              let target: Client | null = null;
              for (const c of this.clients) {
                const pp = this.state.players.get(c.sessionId);
                if (pp?.name === to) { target = c; break; }
              }
              if (!target) return client.send("system", { text: `ไม่พบ "${to}" ในแมพ` });
              target.send("whisper", { from: p.name, text: body, ts: Date.now() });
              client.send("whisper", { from: `${p.name} → ${to}`, text: body, ts: Date.now() });
              return;
            }
          }
        }
        // Unknown slash command: fall through to broadcast as plain text
      }
      this.broadcast("chat", { from: p.name, text, ts: Date.now() });
    });

    // ── Housing / visit system ──────────────────────────────────────────────────
    // ── Companions: summon / recall ──────────────────────────────────────────
    this.onMessage("summon_companion", (client, msg: { companionId: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const kind = String(msg?.companionId ?? "") as CompanionKind;
      const def = (COMPANIONS as any)[kind];
      if (!def) { client.send("system", { text: "ไม่พบคู่หูนี้" }); return; }
      // One companion per owner — recall any existing first.
      for (const [cid, c] of this.state.companions) {
        if (c.ownerId === p.id) this.state.companions.delete(cid);
      }
      const c = new CompanionSchema();
      c.id = `comp_${p.id}_${Date.now().toString(36)}`;
      c.ownerId = p.id;
      c.kind = kind;
      c.x = p.pos.x + 1.2;
      c.z = p.pos.z + 0.5;
      c.maxHp = def.maxHp ?? 100;
      c.hp = c.maxHp;
      c.state = "follow";
      this.state.companions.set(c.id, c);
      client.send("system", { text: `🐾 เรียก ${def.name ?? kind} ออกมาแล้ว` });
    });

    this.onMessage("recall_companion", (client, _msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      let removed = 0;
      for (const [cid, c] of this.state.companions) {
        if (c.ownerId === p.id) { this.state.companions.delete(cid); removed++; }
      }
      if (removed > 0) client.send("system", { text: "🏠 คู่หูกลับเข้ากระเป๋าแล้ว" });
    });

    this.onMessage("visitHouse", (client, msg: { ownerName: string }) => {
      const visitor = this.state.players.get(client.sessionId);
      if (!visitor) return;
      const owner = Array.from(this.state.players.values()).find(p => p.name === msg.ownerName);
      if (!owner) { client.send("system", { text: "ไม่พบผู้เล่นนี้" }); return; }
      if (owner.mapId !== visitor.mapId) { client.send("system", { text: "เจ้าของบ้านต้องอยู่ในแผนที่เดียวกัน" }); return; }
      if (!owner.houseOpen) { client.send("system", { text: "เจ้าของบ้านปิดรับเยี่ยมชม" }); return; }
      // Warp visitor to owner's house coordinates (offset slightly)
      const houseX = (owner as any).x ?? 50;
      const houseZ = (owner as any).z ?? 50;
      visitor.pos.x = houseX + 3;
      visitor.pos.z = houseZ;
      client.send("system", { text: `🚪 เยี่ยมชมบ้านของ ${owner.name} แล้ว` });
      // Notify owner
      const ownerClient = this.clients.find(c => c.sessionId === owner.sessionId);
      ownerClient?.send("system", { text: `👋 ${visitor.name} มาเยี่ยมบ้านคุณ!` });
    });

    this.onMessage("giftStructure", (client, msg: { structureId: string; targetName: string }) => {
      const sender = this.state.players.get(client.sessionId);
      if (!sender) return;
      const target = Array.from(this.state.players.values()).find(p => p.name === msg.targetName);
      if (!target) { client.send("system", { text: "ไม่พบผู้เล่นนี้" }); return; }
      const structures: any[] = JSON.parse(sender.structuresJson || "[]");
      const item = structures.find(s => s.id === msg.structureId);
      if (!item) { client.send("system", { text: "ไม่พบไอเทมนี้ในบ้านของคุณ" }); return; }
      // Remove from sender, add to target's structuresJson
      const filtered = structures.filter(s => s.id !== msg.structureId);
      sender.structuresJson = JSON.stringify(filtered);
      const targetStructures: any[] = JSON.parse(target.structuresJson || "[]");
      targetStructures.push({ ...item, ownerId: target.sessionId, ownerName: target.name });
      target.structuresJson = JSON.stringify(targetStructures);
      client.send("system", { text: `🎁 ส่งของขวัญ ${item.name ?? item.itemId} ให้ ${target.name} แล้ว` });
      const targetClient = this.clients.find(c => c.sessionId === target.sessionId);
      targetClient?.send("system", { text: `🎁 คุณได้รับ ${item.name ?? item.itemId} จาก ${sender.name}!` });
    });

    this.onMessage("toggleHouseOpen", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.houseOpen = !p.houseOpen;
      client.send("system", { text: p.houseOpen ? "🔓 เปิดบ้านรับเยี่ยมชมแล้ว" : "🔒 ปิดบ้านรับเยี่ยมชมแล้ว" });
    });
  }

  async onJoin(client: Client, options: { token?: string; characterId?: string; worldId?: string }) {
    // worldId routing: if the room has a worldId set, client must specify the matching one
    const expectedWorldId = (this as any)._worldId as string | undefined;
    if (expectedWorldId && options.worldId && options.worldId !== expectedWorldId) {
      throw new Error("worldId mismatch");
    }
    // Max players cap
    const max = (this as any)._maxPlayers as number ?? 8;
    if (this.state.players.size >= max) {
      throw new Error("world is full");
    }
    const token = options?.token;
    const characterId = options?.characterId;
    if (!token) throw new Error("missing token");
    if (!characterId) throw new Error("missing characterId");
    const payload = verifyToken(token);
    if (!payload) throw new Error("invalid token");
    const c = await prisma.character.findUnique({ where: { id: characterId } });
    if (!c) throw new Error("no character");
    if (c.userId !== payload.uid) throw new Error("unauthorized character");
    // If the same character is still in this room (lingering reconnect / second tab),
    // KICK the old session so the new connection can take over. This is what real MMOs do.
    for (const [sid, cid] of this.playerCharId) {
      if (cid === characterId && sid !== client.sessionId) {
        console.log(`[room ${this.state.mapId}] kicking old session ${sid} so ${c.name} can reconnect`);
        try { await this.savePlayer(sid); } catch {}
        const oldClient = this.clients.find((cc) => cc.sessionId === sid);
        try { oldClient?.leave(1000); } catch {}
        this.state.players.delete(sid);
        this.intents.delete(sid);
        this.lastAttack.delete(sid);
        this.playerUserId.delete(sid);
        this.playerCharId.delete(sid);
        this.playerQuests.delete(sid);
        break;
      }
    }
    const p = new Player();
    p.id = client.sessionId;
    p.name = c.name;
    p.job = c.job;
    p.pos.x = c.posX;
    p.pos.y = c.posY;
    p.pos.z = c.posZ;
    p.hp = c.hp;
    p.maxHp = c.maxHp;
    p.mp = c.mp;
    p.maxMp = c.maxMp;
    p.atk = c.atk;
    p.def = c.def;
    p.weapon = c.weapon;
    p.armor = c.armor;
    p.level = c.level;
    p.exp = c.exp;
    p.str = (c as any).str ?? 1;
    p.agi = (c as any).agi ?? 1;
    p.vit = (c as any).vit ?? 1;
    p.int = (c as any).intel ?? 1;
    p.dex = (c as any).dex ?? 1;
    p.luk = (c as any).luk ?? 1;
    p.statPoints = (c as any).statPoints ?? 0;
    p.zeny = (c as any).zeny ?? 0;
    p.appearance = (c as any).appearance ?? "{}";
    p.achievementsJson = (c as any).achievementsJson ?? "{}";
    p.pvpFlag = !!(c as any).pvpFlag;
    // Restore daily challenge state (service handles stale-date + corrupt-JSON cases)
    this.daily.restore(client.sessionId, (c as any).dailyJson);
    p.title = (c as any).title ?? "";

    // Daily login reward — check if first login today
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const lastDate = (c as any).lastLoginDate ?? "";
    if (lastDate !== today) {
      let streak = (c as any).loginStreak ?? 0;
      // Yesterday? continue streak. Otherwise reset to 1.
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);
      streak = lastDate === yesterday ? streak + 1 : 1;
      // Reward escalates over 7-day cycle
      const day = ((streak - 1) % 7) + 1;
      const rewards: Record<number, { zeny: number; items: { id: string; qty: number }[] }> = {
        1: { zeny: 50, items: [{ id: "apple", qty: 2 }] },
        2: { zeny: 80, items: [{ id: "hp_potion", qty: 2 }] },
        3: { zeny: 120, items: [{ id: "bread", qty: 2 }] },
        4: { zeny: 180, items: [{ id: "berry_seed", qty: 3 }] },
        5: { zeny: 250, items: [{ id: "cooked_meat", qty: 2 }] },
        6: { zeny: 350, items: [{ id: "energy_tonic", qty: 2 }] },
        7: { zeny: 600, items: [{ id: "rare_fish", qty: 1 }, { id: "hp_potion", qty: 5 }] },
      };
      const reward = rewards[day];
      p.zeny += reward.zeny;
      for (const it of reward.items) await this.addToInventoryOrMail(p, it.id, it.qty, "DAILY_LOGIN");
      // Persist via savePlayer's withExtras
      (p as any)._newLoginDate = today;
      (p as any)._newLoginStreak = streak;
      // Tell the client (popup)
      client.send("dailyReward", { day, streak, zeny: reward.zeny, items: reward.items });
    }
    p.hunger = (c as any).hunger ?? 100;
    p.thirst = (c as any).thirst ?? 100;
    p.stamina = (c as any).stamina ?? 100;
    p.maxStamina = (c as any).maxStamina ?? 100;
    p.houseSlot = (c as any).houseSlot ?? -1;
    p.petKind = (c as any).petKind ?? "";
    p.mounted = ((c as any).mounted ?? 0) === 1;
    p.petsJson = (c as any).petsJson ?? "[]";
    p.petRare = ((c as any).petRare ?? 0) === 1;
    p.decorationsJson = (c as any).decorationsJson ?? "[]";
    // mercy floor: returning players don't immediately starve. Min 40.
    if (p.hunger < 40) p.hunger = 40;
    if (p.thirst < 40) p.thirst = 40;
    p.stamina = p.maxStamina;
    try {
      this.playerQuests.set(client.sessionId, JSON.parse((c as any).questsJson || "{\"active\":{},\"completed\":[]}"));
    } catch {
      this.playerQuests.set(client.sessionId, emptyQuestState());
    }
    // Auto-accept starter quest for brand-new characters (no quests ever)
    const qs0 = this.playerQuests.get(client.sessionId)!;
    if (Object.keys(qs0.active).length === 0 && qs0.completed.length === 0) {
      qs0.active["q_slime_starter"] = 0;
      console.log(`[room ${this.state.mapId}] auto-granted starter quest to ${c.name}`);
    }
    try {
      const parsed: Array<{ itemId: string; qty: number }> = JSON.parse(c.inventoryJson || "[]");
      for (const it of parsed) {
        const s = new ItemStack();
        s.itemId = it.itemId;
        s.qty = it.qty;
        p.inventory.push(s);
      }
    } catch { /* ignore */ }
    this.combatSvc.recalcStats(p);
    p.sessionId = client.sessionId; // keep Colyseus sessionId on the Player schema
    this.state.players.set(client.sessionId, p);
    this.sessionToCharId.set(client.sessionId, c.id);
    this.playerUserId.set(client.sessionId, payload.uid);
    this.playerCharId.set(client.sessionId, c.id);
    console.log(`[room ${this.state.mapId}] ${c.name} joined`);
    auditService.log("player.join", { userId: payload.uid, characterId: c.id, metadata: { charName: c.name, mapId: this.state.mapId } });
    // send quest state to this client
    const qs = this.playerQuests.get(client.sessionId)!;
    client.send("questUpdate", qs);
  }

  async onLeave(client: Client) {
    const sid = client.sessionId;
    // Cancel any in-flight trade so partner gets notified before save
    if (this.tradeSessions.has(sid)) this.cancelTrade(sid);
    const userId = this.playerUserId.get(sid);
    const characterId = this.playerCharId.get(sid);
    await this.savePlayer(sid);
    this.partySvc.leave(sid);
    auditService.log("player.leave", { userId, characterId, metadata: { charName: this.state.players.get(sid)?.name } });
    // Recall any companions belonging to this player so they don't orphan.
    const leavingPlayer = this.state.players.get(sid);
    if (leavingPlayer) {
      for (const [cid, c] of this.state.companions) {
        if (c.ownerId === leavingPlayer.id) this.state.companions.delete(cid);
      }
    }
    this.state.players.delete(sid);
    this.intents.delete(sid);
    this.lastAttack.delete(sid);
    this.playerUserId.delete(sid);
    this.playerCharId.delete(sid);
    this.playerQuests.delete(sid);
    // Additional session-keyed maps (memory leak prevention)
    this.sessionToCharId.delete(sid);
    this.daily.forget(sid);
    this.fishingSvc.cancelFishingForSid(sid);
    this.tradeSessions.delete(sid);
    this.botIds.delete(sid);
    this.botState.delete(sid);
    this.rateLimiter.forget(sid);
    // Prune compound-keyed maps that include this session
    for (const k of this.tameProgress.keys()) if (k.startsWith(sid + ":")) this.tameProgress.delete(k);
    for (const k of this.statusTickAcc.keys()) if (k.startsWith(sid + ":")) this.statusTickAcc.delete(k);
    // Party service handles both its own invites and any sent BY this sid.
    this.partySvc.forget(sid);
  }

  // ---------- party (delegates to Party service) ----------
  // (inline handlers extracted to registerPartyHandlers)

  /** Broadcast party HP update to all members (called by grantExp). */
  broadcastPartyUpdate(pid: string) {
    const memberSids = this.partySvc.members(pid);
    if (memberSids.length === 0) return;
    const leader = this.state.players.get(memberSids[0]);
    const members = memberSids.map((sid) => {
      const p = this.state.players.get(sid);
      return p ? { id: p.id, name: p.name, hp: p.hp, maxHp: p.maxHp, level: p.level } : null;
    }).filter(Boolean);
    for (const sid of memberSids) {
      const c = this.clients.find((c) => c.sessionId === sid);
      c?.send("partyUpdate", { leaderId: leader?.id ?? "", members });
    }
  }

  spawnBot(idx: number) {
    const id = `bot_${this.state.mapId}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
    const p = new Player();
    p.id = id;
    p.name = `Bot${idx + 1}`;
    p.job = ["novice", "swordsman", "mage", "archer"][idx % 4];
    p.pos.x = (Math.random() - 0.5) * 16;
    p.pos.z = (Math.random() - 0.5) * 16;
    p.maxHp = 200; p.hp = 200;
    p.maxMp = 60; p.mp = 60;
    p.atk = 14; p.def = 5;
    p.level = 3 + idx;
    p.hunger = 100; p.thirst = 100; p.stamina = 100; p.maxStamina = 100;
    // randomize appearance
    const skinPalette = ["#f5d6b0", "#c98765", "#9e6a45", "#6e472b"];
    const hairPalette = ["#0f0f0f", "#7c4a1f", "#e9c46a", "#dc2626", "#7c3aed", "#22d3ee", "#f472b6"];
    const shirtPalette = ["#dc2626", "#0ea5e9", "#16a34a", "#a855f7", "#f59e0b"];
    const styles = ["short", "long", "ponytail", "spiky", "bun"];
    const bodies = ["slim", "normal", "wide"];
    p.appearance = JSON.stringify({
      skin: skinPalette[idx % skinPalette.length],
      hair: hairPalette[idx % hairPalette.length],
      eye: "#1f2937",
      shirt: shirtPalette[idx % shirtPalette.length],
      pants: "#1e293b",
      hairStyle: styles[idx % styles.length],
      body: bodies[idx % bodies.length],
    });
    this.state.players.set(id, p);
    this.botIds.add(id);
    this.botState.set(id, { wander: { x: 0, z: 0, until: 0 }, nextActionAt: 0 });
  }

  tickBots(now: number) {
    for (const sid of this.botIds) {
      const p = this.state.players.get(sid);
      const bs = this.botState.get(sid);
      if (!p || !bs || p.dead) continue;

      // BOTS ATTACK ONLY HOSTILE MOBS:
      //   - aggroRange > 0  → hostile (slime/wolf/orc/darklord)  ✓ valid target
      //   - aggroRange === 0 → resource node (tree/rock/bush)     ✗ humans only
      //   - aggroRange === -1 → passive animal (chicken/pig/cow)  ✗ food source, humans only
      // O(cells) via spatial hash instead of O(M) scan of every monster
      let nearestMon: Monster | null = null;
      let nearestD = 30;
      const hit = this.monsterSpatialHash.findNearest(p.pos.x, p.pos.z, 30, (e) => {
        const cfg = (MONSTERS as any)[e.kind];
        return !!cfg && cfg.aggroRange > 0; // hostile mobs ONLY
      });
      if (hit) {
        nearestMon = this.state.monsters.get(hit.entity.id) ?? null;
        nearestD = hit.distance;
      }
      // BOT PICKUP: only items that come from MONSTERS, never gathered resources.
      for (const [, g] of this.state.drops) {
        if (GATHERED_RESOURCE_ITEMS.has(g.itemId)) continue; // wood/stone/berry/raw_meat
        const d = Math.hypot(g.pos.x - p.pos.x, g.pos.z - p.pos.z);
        if (d < 2) { this.handlePickup(sid, g.id); break; }
      }

      let mx = 0, mz = 0;
      if (nearestMon) {
        const dx = nearestMon.pos.x - p.pos.x;
        const dz = nearestMon.pos.z - p.pos.z;
        if (nearestD > GAME_CONFIG.ATTACK_RANGE - 0.2) {
          mx = dx / nearestD; mz = dz / nearestD;
        } else if (now >= bs.nextActionAt) {
          this.handleAttack(sid, nearestMon.id);
          bs.nextActionAt = now + GAME_CONFIG.ATTACK_COOLDOWN_MS;
        }
      } else {
        // wander
        if (now > bs.wander.until || Math.hypot(p.pos.x - bs.wander.x, p.pos.z - bs.wander.z) < 1) {
          // Wander within current map bounds (open world has size ~200)
          const mapDef = MAPS[this.state.mapId as MapId];
          const range = mapDef.size * 0.35;
          bs.wander.x = (Math.random() - 0.5) * range * 2;
          bs.wander.z = (Math.random() - 0.5) * range * 2;
          bs.wander.until = now + 5000 + Math.random() * 8000;
        }
        const dx = bs.wander.x - p.pos.x;
        const dz = bs.wander.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) { mx = dx / d; mz = dz / d; }
      }

      this.intents.set(sid, {
        mx, mz,
        rotY: (mx || mz) ? Math.atan2(mx, mz) : p.rotY,
      });
    }
  }

  async savePlayer(sid: string) {
    if (this.botIds.has(sid)) return;
    const p = this.state.players.get(sid);
    const cid = this.playerCharId.get(sid);
    if (!p || !cid) return;
    const inv = Array.from(p.inventory.values()).map((s) => ({ itemId: s.itemId, qty: s.qty }));
    // Core fields (always persistable — match the original schema)
    const core: any = {
      job: p.job,
      hp: p.hp, maxHp: p.maxHp,
      mp: p.mp, maxMp: p.maxMp,
      atk: p.atk, def: p.def,
      level: p.level, exp: p.exp,
      weapon: p.weapon, armor: p.armor,
      mapId: this.state.mapId,
      posX: p.pos.x, posY: p.pos.y, posZ: p.pos.z,
      inventoryJson: JSON.stringify(inv),
      str: p.str, agi: p.agi, vit: p.vit,
      intel: p.int, dex: p.dex, luk: p.luk,
      statPoints: p.statPoints, zeny: p.zeny,
      questsJson: JSON.stringify(this.playerQuests.get(sid) ?? emptyQuestState()),
    };
    // New fields — may not exist in stale Prisma client; merged optimistically.
    const newLoginDate = (p as any)._newLoginDate;
    const newLoginStreak = (p as any)._newLoginStreak;
    const withExtras: any = {
      ...core,
      hunger: p.hunger, thirst: p.thirst, stamina: p.stamina, maxStamina: p.maxStamina,
      houseSlot: p.houseSlot, petKind: p.petKind, mounted: p.mounted ? 1 : 0,
      achievementsJson: p.achievementsJson, title: p.title,
      petsJson: p.petsJson, petRare: p.petRare ? 1 : 0,
      decorationsJson: p.decorationsJson,
      pvpFlag: p.pvpFlag ? 1 : 0,
      dailyJson: this.daily.serialize(p.id),
    };
    if (newLoginDate) withExtras.lastLoginDate = newLoginDate;
    if (newLoginStreak) withExtras.loginStreak = newLoginStreak;

    try {
      await prisma.character.update({ where: { id: cid }, data: withExtras });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // Prisma client out of date — retry with only core fields so EXP/pos/inventory still save
      if (msg.includes("Unknown arg") || msg.includes("Unknown argument") || msg.includes("hunger") || msg.includes("thirst")) {
        console.warn("[save] new fields not in Prisma client (run `prisma generate`). Falling back to core save.");
        try {
          await prisma.character.update({ where: { id: cid }, data: core });
        } catch (e2) {
          console.error("[save] core save failed:", e2);
        }
      } else {
        console.error("[save] failed:", e);
      }
    }
  }

  handleQuestAccept(client: Client, questId: string) {
    this.questSvc.handleQuestAccept(client.sessionId, questId);
  }

  handleQuestTurnIn(client: Client, questId: string) {
    this.questSvc.handleQuestTurnIn(client.sessionId, questId);
  }

  onMonsterKilled(killerSid: string, monsterKind: string) {
    this.questSvc.onMonsterKilled(killerSid, monsterKind);
  }

  

  handleAllocStat(sid: string, stat: StatKey) {
    const p = this.state.players.get(sid);
    if (!p || p.statPoints <= 0) return;
    // Explicit allowlist — prevents prototype pollution via crafted message
    // (e.g., stat="__proto__" or stat="constructor")
    const ALLOWED: ReadonlyArray<StatKey> = ["str", "agi", "vit", "int", "dex", "luk"];
    if (!ALLOWED.includes(stat)) return;
    if ((p as any)[stat] >= 99) return;
    (p as any)[stat] = (p as any)[stat] + 1;
    p.statPoints -= 1;
    this.combatSvc.recalcStats(p);
  }

  // ---------- combat ----------
  cancelTrade(sid: string) {
    const sess = this.tradeSessions.get(sid);
    if (!sess) return;
    const partnerSid = sess.partnerSid;
    this.tradeSessions.delete(sid);
    this.tradeSessions.delete(partnerSid);
    const c1 = this.clients.find((c) => c.sessionId === sid);
    const c2 = this.clients.find((c) => c.sessionId === partnerSid);
    c1?.send("trade:cancelled" as any, {}); c1?.send("system", { text: "🚫 ยกเลิกเทรด" });
    c2?.send("trade:cancelled" as any, {}); c2?.send("system", { text: "🚫 ยกเลิกเทรด" });
  }


  /** True if a player with this name is currently connected to the room. */
  isOnline(name: string): boolean {
    for (const [, p] of this.state.players) if (p.name === name) return true;
    return false;
  }

  handleAttack(attackerId: string, targetId: string) {
    // PvP enforcement: in co-op/adventure worlds, players cannot damage each other
    const attacker = this.state.players.get(attackerId);
    const target = this.state.players.get(targetId);
    if (attacker && target && this.state.worldMode !== "pvp") {
      // Neither player is a monster — this is a player-vs-player attack
      // Reject PvP in non-pvp worlds
      return;
    }
    this.combatSvc.handleAttack(attackerId, targetId);
  }

  handleSkill(attackerId: string, skillId: string, targetId?: string) {
    this.combatSvc.handleSkill(attackerId, skillId, targetId);
  }

  isStunned(p: Player | Monster): boolean {
    return this.combatSvc.isStunned(p);
  }

  speedMultOf(p: Player | Monster): number {
    return this.combatSvc.speedMultOf(p);
  }

  applyStatusToMonster(m: Monster, kind: StatusKind, durationMs: number, fromId = "") {
    this.combatSvc.applyStatusToMonster(m, kind, durationMs, fromId);
  }

  applyStatusToPlayer(p: Player, kind: StatusKind, durationMs: number, fromId = "") {
    this.combatSvc.applyStatusToPlayer(p, kind, durationMs, fromId);
  }

  tickStatuses() {
    this.combatSvc.tickStatuses();
  }

  dealDamageToMonster(target: Monster, attacker: Player, dmg: number, crit = false) {
    this.combatSvc.dealDamageToMonster(target, attacker, dmg, crit);
  }

  // ---------- drops / inventory ----------
  dropLoot(monster: Monster) {
    const table = MONSTER_DROPS[monster.kind as string] ?? [];
    for (const entry of table) {
      if (Math.random() < entry.chance) {
        const qty = entry.min && entry.max ? entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1)) : 1;
        this.spawnGroundItem(entry.itemId, qty, monster.pos.x + (Math.random() - 0.5), monster.pos.z + (Math.random() - 0.5));
      }
    }
  }

  spawnGroundItem(itemId: string, qty: number, x: number, z: number) {
    const id = `d_${Math.random().toString(36).slice(2, 9)}`;
    const g = new GroundItem();
    g.id = id; g.itemId = itemId; g.qty = qty;
    g.pos.x = x; g.pos.z = z;
    this.state.drops.set(id, g);
    this.clock.setTimeout(() => this.state.drops.delete(id), 60_000);
  }

  handleBiomeSpell(client: Client, targetId: string) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (p.mp < 12) {
      client.send("system", { text: "MP ไม่พอ" });
      return;
    }
    const target = this.state.monsters.get(targetId);
    if (!target || target.dead) return;
    if (Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z) > 6) {
      client.send("system", { text: "เป้าหมายอยู่ไกลเกินไป" });
      return;
    }
    const mapDef = MAPS[this.state.mapId as MapId];
    const biome = biomeAt(p.pos.x, p.pos.z, mapDef.size / 2);
    let baseDmg = p.atk + 8;
    let statusKind: string | null = null;
    let label = "✨";

    if (biome === "lake") { label = "❄ Ice Lance"; baseDmg += 5; statusKind = "freeze"; }
    else if (biome === "forest") { label = "🌿 Vine Root"; baseDmg += 3; statusKind = "stun"; }
    else if (biome === "mountains") { label = "🪨 Rock Throw"; baseDmg += 12; statusKind = "stun"; }
    else if (biome === "swamp") { label = "☠ Poison Spore"; baseDmg += 2; statusKind = "poison"; }
    else if (biome === "wilderness") { label = "🌑 Shadow Bolt"; baseDmg += 15; statusKind = "burn"; }
    else {
      client.send("system", { text: "เวทนี้ใช้ได้แค่ใน biome พิเศษ (ทะเลสาบ/ป่า/ภูเขา/บึง/wilderness)" });
      return;
    }

    p.mp -= 12;
    this.broadcast("skillCast", { skillId: "biome_spell", fromId: p.id, tx: target.pos.x, tz: target.pos.z, aoeRadius: 0 });
    client.send("system", { text: label });
    this.dealDamageToMonster(target, p, Math.floor(baseDmg), false);
    if (statusKind && !target.dead) {
      this.applyStatusToMonster(target, statusKind as any, 3500);
    }
  }

  handleMount(client: Client) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (!p.petKind) {
      client.send("system", { text: "ต้องมีสัตว์เลี้ยงก่อน" });
      return;
    }
    p.mounted = !p.mounted;
    client.send("system", { text: p.mounted ? `🐎 ขึ้นขี่ ${p.petKind}` : "🚶 ลงจากสัตว์" });
  }

  // ── Daily challenge tracker — delegates to DailyChallenge service.
  // Service handles goal thresholds + reward definitions. This wrapper
  // adapts the reward by depositing zeny + items + sending the toast.
  bumpDailyChallenge(sid: string, kind: "kills" | "harvest", by = 1) {
    const p = this.state.players.get(sid);
    if (!p || this.botIds.has(sid)) return;
    const reward = this.daily.bump(sid, kind, by);
    if (!reward) return;
    p.zeny += reward.zeny;
    this.addToInventory(p, reward.itemId, reward.itemQty);
    const c = this.clients.find((cl) => cl.sessionId === sid);
    c?.send("system", { text: reward.message });
  }

  bumpAchievement(sid: string, counter: string, by = 1) {
    const p = this.state.players.get(sid);
    if (!p) return;
    // Weekly leaderboard contribution (skip bots)
    if (!this.botIds.has(sid)) {
      const pts = this.achievementsSvc.contributionPoints(counter);
      recordContribution(p.name, pts * by, counter === "kills" ? by : 0, p.level);
    }
    const { unlocked, progress } = this.achievementsSvc.bump(p.achievementsJson, counter, by);
    p.achievementsJson = JSON.stringify(progress);
    if (unlocked.length === 0) return;
    const client = this.clients.find((c) => c.sessionId === sid);
    let bumpMeta = 0;
    for (const u of unlocked) {
      client?.send("system", { text: `🏅 ปลดล็อก: ${u.icon} ${u.name}` });
      if (u.reward?.zeny) p.zeny += u.reward.zeny;
      if (u.reward?.itemId) this.addToInventory(p, u.reward.itemId, u.reward.qty ?? 1);
      if (u.id.startsWith("cave_") && u.id.endsWith("_clear")) bumpMeta++;
    }
    if (bumpMeta > 0) {
      // recurse via the meta counter (bounded — meta itself doesn't bump anything)
      this.bumpAchievement(sid, "caves_cleared", bumpMeta);
    }
  }

  handlePickup(sid: string, dropId: string) {
    this.inventorySvc.handlePickup(sid, dropId);
  }

  handleOpenChest(sid: string, chestId: string) {
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    const chest = this.state.chests.get(chestId);
    if (!chest) return;
    if (Math.hypot(p.pos.x - chest.x, p.pos.z - chest.z) > CHEST_OPEN_RADIUS) return;
    const loot = tryOpenChest(chest, sid, Date.now());
    if (!loot) return; // already opened
    void this.inventorySvc.addToInventoryOrMail(p, loot.itemId, loot.qty, "CHEST");
    const def = ITEMS[loot.itemId];
    const c = this.clients.find((cl) => cl.sessionId === sid);
    c?.send("system", { text: `💎 หีบสมบัติ: ${def?.icon ?? ""} ${def?.name ?? loot.itemId} ×${loot.qty}` });
    this.broadcast("chestOpened", { chestId });
  }

  /**
   * Token-bucket rate limit. Delegates to RateLimiter service.
   * Kept here as a thin wrapper so existing call sites compile unchanged.
   */
  checkRateLimit(sid: string, key: string, maxEvents: number, windowMs: number): boolean {
    return this.rateLimiter.check(sid, key, maxEvents, windowMs);
  }

  /** Add items, falling back to mail delivery if inventory is full. Reward paths use this. */
  async addToInventoryOrMail(p: Player, itemId: string, qty: number, source = "REWARD") {
    await this.inventorySvc.addToInventoryOrMail(p, itemId, qty, source);
  }

  addToInventory(p: Player, itemId: string, qty: number): boolean {
    return this.inventorySvc.addToInventory(p, itemId, qty);
  }

  handleEquip(sid: string, invIndex: number) {
    this.inventorySvc.handleEquip(sid, invIndex);
  }

  handleUnequip(sid: string, slot: "weapon" | "armor") {
    this.inventorySvc.handleUnequip(sid, slot);
  }

  handleUseItem(sid: string, invIndex: number) {
    this.inventorySvc.handleUseItem(sid, invIndex);
  }

  handleDrop(sid: string, invIndex: number, qty?: number) {
    this.inventorySvc.handleDrop(sid, invIndex, qty);
  }

  handleChangeJob(sid: string, job: any) {
    const p = this.state.players.get(sid);
    if (!p) return;
    if (!JOBS[job as JobId]) return;
    const targetJob = JOBS[job as JobId];
    // First class change at Lv5 from novice
    if (p.job === "novice") {
      if (p.level < 5) return;
      const firstClassIds = ["swordsman", "mage", "archer", "acolyte", "thief"];
      if (!firstClassIds.includes(job)) return;
      p.job = job;
      this.combatSvc.recalcStats(p, true);
      return;
    }
    // 2nd class change at Lv30 (or 3rd class at Lv50)
    const adv = JOB_ADVANCEMENT[p.job] as string[] | undefined;
    if (adv && adv.includes(job)) {
      const levelReq = ["lord_knight","high_wizard","sniper_t2","high_priest","assassin_t2"].includes(job) ? 50 : 30;
      if (p.level >= levelReq) {
        p.job = job;
        this.combatSvc.recalcStats(p, true);
        const client = this.clients.find((c) => c.sessionId === sid);
        client?.send("system", { text: `⭐ เลื่อนเป็น ${targetJob.name} สำเร็จ!` });
      }
    }
  }

  recalcStats(p: Player, fullHeal = false) {
    this.combatSvc.recalcStats(p, fullHeal);
  }

  // ---------- progression ----------
  grantExp(p: Player, amount: number) {
    // share with nearby party members (within 30m)
    const pid = this.partySvc.partyOf(p.id);
    const recipients: Player[] = [p];
    if (pid) {
      for (const sid of this.partySvc.members(pid)) {
        if (sid === p.id) continue;
        const m = this.state.players.get(sid);
        if (!m || m.dead) continue;
        if (Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 30) recipients.push(m);
      }
    }
    const share = Math.ceil(amount / recipients.length);
    for (const r of recipients) {
      r.exp += share;
      while (r.exp >= GAME_CONFIG.EXP_PER_LEVEL(r.level)) {
        r.exp -= GAME_CONFIG.EXP_PER_LEVEL(r.level);
        r.level += 1;
        r.statPoints += STAT_POINTS_PER_LEVEL;
        r.skillPoints = (r.skillPoints ?? 0) + 1; // 1 skill point per level
        this.combatSvc.recalcStats(r, true);
        this.broadcast("levelup", { playerId: r.id, level: r.level, name: r.name });
      }
      // Active pet shares XP at 30% rate
      if (r.petKind) {
        try {
          const pets = JSON.parse(r.petsJson || "[]") as Array<any>;
          const active = pets.find((p) => p.kind === r.petKind);
          if (active) {
            active.xp = (active.xp ?? 0) + Math.ceil(share * 0.3);
            active.level = active.level ?? 1;
            const need = 50 + active.level * 25;
            while (active.xp >= need) {
              active.xp -= need;
              active.level += 1;
              const client = this.clients.find((c) => c.sessionId === r.id);
              if (client) client.send("system", { text: `🐾 ${r.petKind} Lv ${active.level}!` });
            }
            r.petsJson = JSON.stringify(pets);
          }
        } catch {}
      }
    }
    // refresh party HP for live displays
    if (pid) this.broadcastPartyUpdate(pid);
  }

  // ---------- map mgmt ----------
  /** Multiplier for monster HP based on current map + party — dungeons scale with player count. */
  monsterHpMultiplier(kind: MonsterKind): number {
    return this.spawnSvc.monsterHpMultiplier(kind);
  }

  // ── Endless Dungeon state ──
  dungeonState = new Map<string, { floor: number; cleared: boolean; rewardClaimed: boolean }>();

  enterDungeon(sid: string, floor: number) {
    const p = this.state.players.get(sid);
    if (!p) return;
    // Validate floor range
    if (floor < 1 || floor > 10) {
      const client = this.clients.find((c) => c.sessionId === sid);
      client?.send("system", { text: "ชั้นไม่ถูกต้อง" }); return;
    }
    // Floors > 1 require previous floor to be cleared
    if (floor > 1) {
      let cleared: number[] = [];
      try { cleared = JSON.parse(p.dungeonClearedJson || "[]"); } catch {}
      if (!cleared.includes(floor - 1)) {
        const client = this.clients.find((c) => c.sessionId === sid);
        client?.send("system", { text: "ต้องเคลียร์ชั้นก่อนก่อน" }); return;
      }
    }
    const dungeonId = `endless_${floor}`;
    // Spawn monsters for this floor
    const def = DUNGEONS[dungeonId];
    if (!def) return;
    this.state.mapId = dungeonId as any;
    // Clear existing monsters in this room's state
    this.state.monsters.clear();
    // Spawn from dungeon definition
    for (const spawn of def.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const x = (Math.random() - 0.5) * 60;
        const z = (Math.random() - 0.5) * 60;
        this.spawnMonster(spawn.kind, x, z);
      }
    }
    // Track dungeon progress
    this.dungeonState.set(sid, { floor, cleared: false, rewardClaimed: false });
    // Clear any existing dungeon state in the player
    const client = this.clients.find((c) => c.sessionId === sid);
    client?.send("system", { text: `🏰 Endless Tower - Floor ${floor}` });
  }

  onAllMonstersCleared(sid: string) {
    const ds = this.dungeonState.get(sid);
    if (!ds || ds.cleared) return;
    ds.cleared = true;
    const p = this.state.players.get(sid);
    if (!p) return;
    const client = this.clients.find((c) => c.sessionId === sid);
    client?.send("system", { text: `✅ Floor ${ds.floor} cleared! Claim your reward.` });
  }

  claimFloorReward(sid: string) {
    const ds = this.dungeonState.get(sid);
    const p = this.state.players.get(sid);
    if (!ds || !p || ds.rewardClaimed || !ds.cleared) return;
    const dungeonId = `endless_${ds.floor}`;
    const def = DUNGEONS[dungeonId];
    if (!def) return;
    ds.rewardClaimed = true;
    this.grantExp(p, def.reward.exp);
    p.zeny += def.reward.zeny;
    const client = this.clients.find((c) => c.sessionId === sid);
    client?.send("system", { text: `💰 +${def.reward.zeny}z  +${def.reward.exp}exp!` });
  }

  descendNextFloor(sid: string) {
    const ds = this.dungeonState.get(sid);
    if (!ds || !ds.cleared || ds.rewardClaimed) return;
    const nextFloor = ds.floor + 1;
    this.enterDungeon(sid, nextFloor);
  }

  tickChunkSpawns(dt: number) {
    this.spawnSvc.tickChunkSpawns(dt);
  }

  spawnMonster(kind: MonsterKind, x: number, z: number) {
    this.spawnSvc.spawnMonster(kind, x, z);
  }

  // ---------- tick ----------
  tick(dtMs: number) {
    const tickStart = Date.now();
    try {
      this.tickInner(dtMs);
    } catch (e) {
      console.error("[tick error]", e);
      // do NOT rethrow — keep the room alive so players don't get disconnected on a single bad tick
    }
    const tickMs = Date.now() - tickStart;
    this.tickTimes.push(tickMs);
    if (this.tickTimes.length > 100) this.tickTimes.shift();
    if (tickMs > 40) console.warn(`Tick slow: ${tickMs}ms`);
  }

  // Rolling tick duration stats (last 100 ticks)
  tickTimes: number[] = [];
  getTickStats() {
    if (this.tickTimes.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
    const sorted = [...this.tickTimes].sort((a, b) => a - b);
    const sum = this.tickTimes.reduce((a, b) => a + b, 0);
    const pct = (p: number) => sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
    return {
      avg: Math.round(sum / this.tickTimes.length),
      p50: Math.round(pct(0.5)),
      p95: Math.round(pct(0.95)),
      max: Math.round(Math.max(...this.tickTimes)),
    };
  }

  /** Companion follow AI — drift toward owner at idle speed, stay within 2.5m. */
  tickCompanions(dt: number) {
    if (this.state.companions.size === 0) return;
    // Build sid → player.id lookup
    const ownerById = new Map<string, Player>();
    for (const [, p] of this.state.players) ownerById.set(p.id, p);
    for (const [, c] of this.state.companions) {
      const owner = ownerById.get(c.ownerId);
      if (!owner) continue;
      const dx = owner.pos.x - c.x;
      const dz = (owner.pos.z + 0.6) - c.z;  // hover slightly behind
      const d = Math.hypot(dx, dz);
      if (d > 1.8) {
        const sp = 3.5;
        c.x += (dx / d) * sp * dt;
        c.z += (dz / d) * sp * dt;
      }
    }
  }

  tickInner(dtMs: number) {
    const dt = dtMs / 1000;
    const mapDef = MAPS[this.state.mapId as MapId];
    const world = mapDef.size / 2;

    this.tickStatuses();
    this.tickBots(Date.now());
    this.tickCompanions(dt);
    this.fishingSvc.resolveFishingForAll(
      new Map(this.clients.map(c => [c.sessionId, c]))
    );
    this.tickChunkSpawns(dt);

    // Periodic autosave — every 20s, save all real players. Prevents data loss on crash.
    this.autoSaveAcc += dt;
    if (this.autoSaveAcc >= 20) {
      this.autoSaveAcc = 0;
      for (const sid of this.playerCharId.keys()) {
        // don't await — fire and forget; savePlayer catches its own errors
        this.savePlayer(sid).catch((e) => console.error("[autosave]", e));
      }
    }

    // day/night cycle: full cycle every 8 minutes
    this.state.dayPhase = (this.state.dayPhase + dt / (8 * 60)) % 1;
    this.state.isNight = this.state.dayPhase < 0.18 || this.state.dayPhase > 0.78;

    // Weather — pick new weather every ~4 minutes
    this.weatherAcc += dt;
    if (this.weatherAcc > 240) {
      this.weatherAcc = 0;
      const r = Math.random();
      const next = r < 0.5 ? "sunny" : r < 0.8 ? "cloudy" : "rainy";
      if (next !== this.state.weather) {
        this.state.weather = next;
        const msgs: Record<string, string> = {
          sunny:  "☀ ฟ้าใส แดดจ้า — พืชจะโตเร็วขึ้น",
          cloudy: "☁ ฟ้าครึ้ม",
          rainy:  "🌧 ฝนตก — ปลาเยอะขึ้น stamina ฟื้นเร็ว",
        };
        this.broadcast("system", { text: msgs[next] });
      }
    }

    // Chest respawn — re-arm any chests whose timer elapsed
    if (this.state.mapId === "field") {
      tickChests(this.state.chests.values(), Date.now());
    }

    // Boss world event — pure scheduler decides when/where
    if (this.state.mapId === "field") {
      const decision = this.bossEventSched.tick(
        dt,
        MAPS["field"].size / 2,
        () => {
          for (const [, m] of this.state.monsters) {
            if (m.kind === "darklord" && !m.dead) return true;
          }
          return false;
        },
      );
      if (decision.kind === "spawn") {
        this.spawnMonster("darklord", decision.x, decision.z);
        this.broadcast("system", { text: decision.message });
        this.broadcast("bossSpawn", {
          name: "Dark Lord",
          x: decision.x,
          z: decision.z,
        });
        this.bossTimerAcc = 0;
      }
      // Broadcast countdown every 5s while waiting (no active boss)
      this.bossTimerAcc += dt;
      if (this.bossTimerAcc >= 5 && !this.bossEventSched.isActive()) {
        this.bossTimerAcc = 0;
        this.broadcast("bossTimer", { secondsLeft: Math.floor(this.bossEventSched.nextSpawnIn()) });
      }
    }

    this.mpRegenAcc += dt;
    const regen = this.mpRegenAcc >= 1;
    if (regen) this.mpRegenAcc = 0;

    for (const [sid, p] of this.state.players) {
      if (p.dead) continue;
      const intent = this.intents.get(sid);
      const moving = !!intent && (Math.abs(intent.mx) + Math.abs(intent.mz)) > 0.01;
      // Cancel fishing if player tries to move
      if (moving) {
        this.fishingSvc.cancelFishingForSid(sid);
        const client = this.clients.find((c) => c.sessionId === sid);
        client?.send("fishing", { state: "cancelled" });
      }
      // Delegate survival (movement speed, hunger/thirst decay, stamina drain) to SurvivalService
      this.survivalSvc.tickSurvival(
        sid, p, dt,
        intent?.mx ?? 0, intent?.mz ?? 0, intent?.rotY ?? 0,
        world,
        regen,
        this.state.weather,
      );
      // Server-side collision resolution: prevents walking through obstacles.
      // Runs after survival (which applies movement) so it pushes the player
      // out if they ended up inside a tree/rock/structure.
      if (moving && !p.flying) {
        const sp = GAME_CONFIG.PLAYER_SPEED * this.speedMultOf(p);
        // Save pre-movement position so resolve() can compute the delta properly
        const preX = p.pos.x - (intent!.mx * sp * dt);
        const preZ = p.pos.z - (intent!.mz * sp * dt);
        this.collisionSvc.resolve(
          p,
          preX, preZ,
          intent!.mx, intent!.mz,
          sp, dt,
        );
      }
      // portal check
      for (const portal of mapDef.portals) {
        if (Math.hypot(p.pos.x - portal.x, p.pos.z - portal.z) < 1.5) {
          this.movePlayerToMap(sid, portal.to, portal.tx, portal.tz);
          break;
        }
      }
    }

    const now = Date.now();
    // Rebuild spatial hashes for living players + monsters — O(P+M) instead of O(P*M)
    this.playerSpatialHash.clear();
    for (const [sid, pp] of this.state.players) {
      if (pp.dead) continue;
      this.playerSpatialHash.update({ id: pp.id, sid, x: pp.pos.x, z: pp.pos.z, dead: false });
    }
    this.monsterSpatialHash.clear();
    for (const [, m] of this.state.monsters) {
      if (m.dead) continue;
      this.monsterSpatialHash.update({ id: m.id, x: m.pos.x, z: m.pos.z, kind: m.kind, dead: false });
    }

    // Monster AI: passive wander/flee + hostile chase/attack
    this.combatService.tickMonsters(
      dt,
      world,
      now,
      this.playerSpatialHash,
      (e) => this.isStunned(e),
      (e) => this.speedMultOf(e)
    );
  }

  async movePlayerToMap(sid: string, to: MapId, tx: number, tz: number) {
    const client = this.clients.find((c) => c.sessionId === sid);
    const p = this.state.players.get(sid);
    if (!client || !p) return;
    p.pos.x = tx; p.pos.z = tz;
    await this.savePlayer(sid);
    client.send("warp", { mapId: to });
  }
}
