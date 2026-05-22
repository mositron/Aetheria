import { Room, Client } from "@colyseus/core";
import { ArraySchema } from "@colyseus/schema";
import {
  WorldState, Player, Monster, GroundItem, PlantNode, plantStage, ItemStack, StatusEffect,
  GAME_CONFIG, MONSTERS, type MonsterKind,
  ITEMS, MONSTER_DROPS, GATHERED_RESOURCE_ITEMS,
  HOUSE_SLOTS, HOUSE_COST,
  RECIPES_BY_ID,
  ACHIEVEMENTS, emptyAchievementProgress, type AchievementProgress,
  JOBS, JOB_ADVANCEMENT, type JobId, maxMpFor,
  MAPS, biomeAt, type MapId,
  derived, STAT_POINTS_PER_LEVEL, type StatKey,
  NPCS, SELL_RATIO,
  QUESTS, emptyQuestState, type PlayerQuestState,
  STATUS_DEFS, type StatusKind,
  type InputMsg, type AttackMsg, type ChatMsg, type SkillMsg,
  type EquipMsg, type UnequipMsg, type UseItemMsg, type DropItemMsg,
  type PickupMsg, type ChangeJobMsg, type AllocStatMsg,
  type ShopBuyMsg, type ShopSellMsg,
  type QuestAcceptMsg, type QuestTurnInMsg,
} from "@game/shared";
import { prisma } from "../db.js";
import { verifyToken } from "../auth.js";
import { recordContribution } from "../leaderboard.js";
import { SpatialHash } from "../services/SpatialHash.js";
import { RateLimiter } from "../services/RateLimiter.js";
import { AntiCheat } from "../services/AntiCheat.js";
import { DailyChallenge } from "../services/DailyChallenge.js";
import { Party } from "../services/Party.js";
import { Achievements } from "../services/Achievements.js";
import { Friend } from "../services/Friend.js";
import { Mailbox } from "../services/Mailbox.js";
import { Auction } from "../services/Auction.js";
import { Guild } from "../services/Guild.js";
import { Combat } from "../services/Combat.js";
import { Inventory } from "../services/Inventory.js";
import { Trade } from "../services/Trade.js";
import { Quest } from "../services/Quest.js";
import { Spawn } from "../services/Spawn.js";


type Intent = { mx: number; mz: number; rotY: number };
type CharRow = {
  id: string; userId: string; name: string; job: string;
  level: number; exp: number; hp: number; maxHp: number; mp: number; maxMp: number;
  atk: number; def: number; weapon: string; armor: string; mapId: string;
  posX: number; posY: number; posZ: number; inventoryJson: string;
};

const INVENTORY_SIZE = 200;

export class GameRoom extends Room<WorldState> {
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
  inventorySvc!: Inventory;
  tradeSvc!: Trade;
  questSvc!: Quest;
  spawnSvc!: Spawn;
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
  bossEventAcc = 0;
  bossEventActive = false;
  weatherAcc = 0;
  botIds = new Set<string>();
  botState = new Map<string, { wander: { x: number; z: number; until: number }; nextActionAt: number }>();
  fishingState = new Map<string, { startedAt: number; resolveAt: number }>();
  tameProgress = new Map<string, number>(); // key = sid + ":" + monsterId
  statusTickAcc = new Map<string, number>(); // entityId+statusKind -> last tick time

  static async onAuth(_token: string, request: any) {
    const tokenStr = request?.headers?.token || request?.query?.token || "";
    // we accept token from `options` instead via per-instance check below
    return true;
  }

  onCreate(opts: { mapId?: MapId }) {
    require("fs").appendFileSync("debug.txt", "onCreate start\n");
    const mapId: MapId = (opts?.mapId ?? "field") as MapId;
    const state = new WorldState();
    require("fs").appendFileSync("debug.txt", "after new WorldState\n");
    this.setState(state);
    require("fs").appendFileSync("debug.txt", "after setState\n");
    this.state.mapId = mapId;

    require("fs").appendFileSync("debug.txt", "onCreate before combat\n");
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

    require("fs").appendFileSync("debug.txt", "onCreate before inv\n");
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

    require("fs").appendFileSync("debug.txt", "onCreate before trade\n");
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

    require("fs").appendFileSync("debug.txt", "onCreate before quest\n");
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

    require("fs").appendFileSync("debug.txt", "onCreate before spawn\n");
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
    require("fs").appendFileSync("debug.txt", "onCreate before map init\n");
    // Detect current season by month
    const month = new Date().getMonth() + 1;
    this.state.season =
      month === 12 ? "christmas" :
      month === 10 ? "halloween" :
      month === 4 ? "songkran" :
      "none";
    this.setPatchRate(1000 / 20);
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / GAME_CONFIG.TICK_RATE);

    require("fs").appendFileSync("debug.txt", "onCreate before dungeon check\n");
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

    this.onMessage("attack", (client, msg: AttackMsg) => this.handleAttack(client.sessionId, msg.targetId));
    this.onMessage("skill", (client, msg: SkillMsg) => this.handleSkill(client.sessionId, msg.skillId, msg.targetId));
    this.onMessage("equip", (client, msg: EquipMsg) => this.handleEquip(client.sessionId, msg.invIndex));
    this.onMessage("unequip", (client, msg: UnequipMsg) => this.handleUnequip(client.sessionId, msg.slot));
    this.onMessage("useItem", (client, msg: UseItemMsg) => this.handleUseItem(client.sessionId, msg.invIndex));
    this.onMessage("dropItem", (client, msg: DropItemMsg) => this.handleDrop(client.sessionId, msg.invIndex, msg.qty));
    this.onMessage("pickup", (client, msg: PickupMsg) => this.handlePickup(client.sessionId, msg.dropId));
    this.onMessage("changeJob", (client, msg: ChangeJobMsg) => this.handleChangeJob(client.sessionId, msg.job));
    this.onMessage("allocStat", (client, msg: AllocStatMsg) => this.handleAllocStat(client.sessionId, msg.stat));
    this.onMessage("shopBuy", (client, msg: ShopBuyMsg) => this.handleShopBuy(client, msg));
    this.onMessage("shopSell", (client, msg: ShopSellMsg) => this.handleShopSell(client, msg));
    // Bulk sell: { npcId, items: [{invIndex, qty}] }  OR  { npcId, sellAllMaterials: true }
    this.onMessage("shopSellMany", (client, msg: any) => this.handleShopSellMany(client, msg));
    this.onMessage("questAccept", (client, msg: QuestAcceptMsg) => this.handleQuestAccept(client, msg.questId));
    this.onMessage("questTurnIn", (client, msg: QuestTurnInMsg) => this.handleQuestTurnIn(client, msg.questId));
    this.onMessage("partyInvite", (client, msg: any) => this.handlePartyInvite(client, msg.targetName));
    this.onMessage("partyAccept", (client, msg: any) => this.handlePartyAccept(client, msg.fromId));
    this.onMessage("partyLeave", (client) => this.handlePartyLeave(client.sessionId));

    this.onMessage("drink", (client) => this.handleDrink(client.sessionId));
    this.onMessage("buildHouse", (client) => this.handleBuildHouse(client));
    this.onMessage("craft", (client, msg: any) => this.handleCraft(client, msg?.recipeId));
    this.onMessage("startFishing", (client) => this.handleStartFishing(client));
    this.onMessage("stopFishing", (client) => this.handleStopFishing(client));
    this.onMessage("plantSeed", (client) => this.handlePlantSeed(client));
    this.onMessage("harvestPlant", (client, msg: any) => this.handleHarvestPlant(client, msg?.plantId));
    this.onMessage("feedAnimal", (client, msg: any) => this.handleFeedAnimal(client, msg?.monsterId));
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
      if (!itemId.startsWith("furniture_")) return;
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

    this.onMessage("visitHouse", (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.dead) return;
      const targetName = String(msg?.name ?? "").trim();
      if (!targetName) return;
      for (const [, other] of this.state.players) {
        if (other.name === targetName && other.houseSlot >= 0 && other.houseSlot < HOUSE_SLOTS.length) {
          const slot = HOUSE_SLOTS[other.houseSlot];
          p.pos.x = slot.x;
          p.pos.z = slot.z + 1.5;
          client.send("system", { text: `🏠 ไปบ้าน ${targetName} แล้ว` });
          return;
        }
      }
      client.send("system", { text: "ไม่พบบ้านของผู้เล่นนี้" });
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
      const fromP = this.state.players.get(client.sessionId);
      if (!fromP) return;
      if (!this.checkRateLimit(client.sessionId, "whisper", 5, 5000)) {
        return client.send("system", { text: "⏸ ส่งช้าๆ" });
      }
      const text = String(msg?.text ?? "").slice(0, 200).trim();
      const to = String(msg?.to ?? "").trim();
      if (!text || !to) return;
      let targetClient: Client | null = null;
      for (const c of this.clients) {
        const p = this.state.players.get(c.sessionId);
        if (p?.name === to) { targetClient = c; break; }
      }
      if (!targetClient) {
        client.send("system", { text: `ไม่พบผู้เล่นชื่อ "${to}" ในแมพนี้` });
        return;
      }
      targetClient.send("whisper", { from: fromP.name, text, ts: Date.now() });
      client.send("whisper", { from: fromP.name + " → " + to, text, ts: Date.now() });
    });

    // ── Friend list: stored as JSON array of names on Character.friendsJson.
    //    Currently in-memory (per session) — persisted on disconnect.
    this.onMessage("friend:add", async (client, msg: any) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      const r = await this.friendSvc.add(charId, me.name, String(msg?.name ?? ""));
      if (!r.ok) {
        const reasonMsg = r.reason === "self" ? ""
          : r.reason === "missing" ? `ไม่พบตัวละครชื่อ "${msg?.name}"`
          : r.reason === "full" ? "เพื่อนเต็ม (สูงสุด 100 คน) — ลบบางคนออกก่อน"
          : "";
        if (reasonMsg) client.send("system", { text: reasonMsg });
        return;
      }
      client.send("friend:list", { friends: r.friends.map((n) => ({ name: n, online: this.isOnline(n) })) });
    });

    this.onMessage("friend:remove", async (client, msg: any) => {
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!charId) return;
      const r = await this.friendSvc.remove(charId, String(msg?.name ?? "").trim());
      if (r.ok) client.send("friend:list", { friends: r.friends.map((n) => ({ name: n, online: this.isOnline(n) })) });
    });

    this.onMessage("friend:list", async (client) => {
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!charId) return;
      const friends = await this.friendSvc.list(charId);
      client.send("friend:list", { friends: friends.map((n) => ({ name: n, online: this.isOnline(n) })) });
    });

    // ── Guild system: shared persistent groups with chat channel ─────────────
    this.onMessage("guild:create", async (client, msg: any) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      const r = await this.guildSvc.create(charId, me.name, String(msg?.name ?? ""), String(msg?.tag ?? ""));
      if (!r.ok) {
        const reasonMsg = r.reason === "name-empty" ? "ตั้งชื่อกิลด์ก่อน"
          : r.reason === "already-in-guild" ? "อยู่กิลด์อื่นแล้ว ออกก่อน"
          : r.reason === "name-taken" ? "ชื่อนี้ถูกใช้แล้ว"
          : "สร้างกิลด์ไม่สำเร็จ";
        return client.send("system", { text: reasonMsg });
      }
      client.send("guild:info", r.info);
    });

    this.onMessage("guild:join", async (client, msg: any) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      const r = await this.guildSvc.join(charId, me.name, String(msg?.name ?? ""));
      if (!r.ok) {
        const reasonMsg = r.reason === "not-found" ? `ไม่พบกิลด์ "${msg?.name}"`
          : r.reason === "already-in-guild" ? "อยู่กิลด์อื่นแล้ว ออกก่อน"
          : "";
        if (reasonMsg) client.send("system", { text: reasonMsg });
        return;
      }
      client.send("guild:info", r.info);
    });

    this.onMessage("guild:leave", async (client) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      const r = await this.guildSvc.leave(charId, me.name);
      if (r.ok) client.send("guild:info", null as any);
    });

    this.onMessage("guild:info", async (client) => {
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!charId) return;
      const info = await this.guildSvc.infoForChar(charId);
      client.send("guild:info", info as any); // null when not in a guild
    });

    this.onMessage("guild:chat", async (client, msg: any) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      if (!this.checkRateLimit(client.sessionId, "guild-chat", 5, 5000)) {
        return client.send("system", { text: "⏸ ส่งช้าๆ" });
      }
      const text = String(msg?.text ?? "").slice(0, 200).trim();
      if (!text) return;
      const members = await this.guildSvc.membersOf(charId);
      if (members.length === 0) return;
      // Broadcast to all online members in this room
      for (const cl of this.clients) {
        const p = this.state.players.get(cl.sessionId);
        if (p && members.includes(p.name)) {
          cl.send("guild:chat", { from: me.name, text, ts: Date.now() });
        }
      }
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

    // ── Auction house: persistent player-to-player marketplace ──────────────
    this.onMessage("auction:list", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const invIndex = msg?.invIndex | 0;
      if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return;
      const stack = p.inventory[invIndex];
      const qty = msg?.qty | 0;
      const pricePer = msg?.pricePer | 0;
      const v = this.auctionSvc.validateList(qty, pricePer);
      if (!v.ok) {
        const reasonMsg = v.reason === "qty" ? "จำนวนไม่ถูกต้อง (1-99)"
          : v.reason === "price" ? "ราคาเกินขีดสูงสุด (10M zeny)"
          : "ราคารวมสูงเกิน (เกินขีดสูงสุด 999M zeny)";
        return client.send("system", { text: reasonMsg });
      }
      if (!stack || stack.qty < qty) return client.send("system", { text: "ของไม่พอ" });
      if (p.zeny < v.fee) return client.send("system", { text: `ต้องมีเงิน ${v.fee}z สำหรับค่าธรรมเนียมประกาศ` });
      const created = await this.auctionSvc.create({ sellerName: p.name, itemId: stack.itemId, qty, pricePer });
      if (!created) return client.send("system", { text: "⚠ ลงประกาศไม่สำเร็จ" });
      p.zeny -= v.fee;
      stack.qty -= qty;
      if (stack.qty <= 0) p.inventory.splice(invIndex, 1);
      client.send("system", { text: `📢 ลงประกาศ ${qty} ชิ้น @${pricePer}z` });
    });

    this.onMessage("auction:browse", async (client, msg: any) => {
      const listings = await this.auctionSvc.browse(String(msg?.search ?? ""));
      client.send("auction:browse", { listings });
    });

    this.onMessage("auction:buy", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const r = await this.auctionSvc.claimForBuy(String(msg?.id ?? ""), p.name);
      if (!r.ok) {
        const reasonMsg = r.reason === "missing" ? "ของถูกซื้อหรือลบไปแล้ว"
          : r.reason === "self-buy" ? "ซื้อของตัวเองไม่ได้"
          : r.reason === "lost-race" ? "ของถูกคนอื่นซื้อไปแล้ว"
          : "⚠ เกิดข้อผิดพลาดในการซื้อ";
        return client.send("system", { text: reasonMsg });
      }
      if (p.zeny < r.total) {
        await this.auctionSvc.relist(r.listing);
        return client.send("system", { text: `เงินไม่พอ (ต้อง ${r.total}z)` });
      }
      const ok = this.addToInventory(p, r.listing.itemId, r.listing.qty);
      if (!ok) {
        await this.auctionSvc.relist(r.listing);
        return client.send("system", { text: "กระเป๋าเต็ม — ของถูก re-list" });
      }
      p.zeny -= r.total;
      await this.mailboxSvc.send({
        fromName: "AUCTION", toName: r.listing.sellerName,
        subject: `ขายแล้ว: ${r.listing.itemId} ×${r.listing.qty}`,
        body: `ขาย ${r.listing.itemId} ${r.listing.qty} ชิ้น ราคารวม ${r.total}z`,
        zeny: r.total,
      });
      client.send("system", { text: `✅ ซื้อ ${r.listing.itemId} ×${r.listing.qty} (-${r.total}z)` });
    });

    this.onMessage("auction:cancel", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const listing = await this.auctionSvc.cancel(String(msg?.id ?? ""), p.name);
      if (!listing) return;
      await this.mailboxSvc.send({
        fromName: "AUCTION", toName: p.name,
        subject: `ยกเลิก: ${listing.itemId} ×${listing.qty}`,
        body: "คุณยกเลิกการประกาศ",
        zeny: 0, itemId: listing.itemId, itemQty: listing.qty,
      });
      client.send("system", { text: "ยกเลิกประกาศแล้ว" });
    });

    // ── P2P Trading: A → B request, both add items/zeny, confirm, transfer ──
    this.onMessage("trade:request", (client, msg: any) => {
      this.tradeSvc.handleRequest(client.sessionId, msg?.toSid);
    });

    this.onMessage("trade:accept", (client, msg: any) => {
      this.tradeSvc.handleAccept(client.sessionId, msg?.fromSid);
    });

    this.onMessage("trade:offer", (client, msg: any) => {
      this.tradeSvc.handleOffer(client.sessionId, msg?.items, msg?.zeny);
    });

    this.onMessage("trade:confirm", (client) => {
      this.tradeSvc.handleConfirm(client.sessionId);
    });

    this.onMessage("trade:cancel", (client) => {
      this.tradeSvc.cancelTrade(client.sessionId);
    });

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
      if (target === attacker) return;
      const cooldown = GAME_CONFIG.ATTACK_COOLDOWN_MS;
      const now = Date.now();
      const last = this.lastAttack.get(attacker.id) ?? 0;
      if (now - last < cooldown) return;
      const dist = Math.hypot(target.pos.x - attacker.pos.x, target.pos.z - attacker.pos.z);
      const reach = ["mage", "archer", "sniper", "wizard"].includes(attacker.job) ? 8 : GAME_CONFIG.ATTACK_RANGE + 0.5;
      if (dist > reach) return;
      this.lastAttack.set(attacker.id, now);
      const d = derived({ str: attacker.str, agi: attacker.agi, vit: attacker.vit, int: attacker.int, dex: attacker.dex, luk: attacker.luk }, attacker.level);
      const def = derived({ str: target.str, agi: target.agi, vit: target.vit, int: target.int, dex: target.dex, luk: target.luk }, target.level);
      let dmg = Math.max(1, (attacker.atk + d.atkBonus) - target.def);
      if (Math.random() * 100 < d.crit) dmg = Math.floor(dmg * 1.6);
      // Lower damage in PvP to avoid one-shots
      dmg = Math.max(1, Math.floor(dmg * 0.6));
      target.hp = Math.max(0, target.hp - dmg);
      this.broadcast("damage", { targetId: target.id, amount: dmg, from: attacker.id });
      if (target.hp === 0) {
        target.dead = true;
        this.broadcast("system", { text: `⚔ ${attacker.name} เอาชนะ ${target.name}!` });
      }
    });

    this.onMessage("chat", (client, msg: ChatMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      // Rate limit: 5 messages per 5 sec per client
      if (!this.checkRateLimit(client.sessionId, "chat", 5, 5000)) {
        return client.send("system", { text: "⏸ ส่งช้าๆ หน่อย — รอสักครู่" });
      }
      const text = String(msg.text ?? "").slice(0, 200).trim();
      if (!text) return;
      // ── Slash commands ───────────────────────────────────────────────
      if (text.startsWith("/")) {
        const [cmd, ...args] = text.slice(1).split(/\s+/);
        switch (cmd.toLowerCase()) {
          case "help":
            client.send("system", { text: "📜 คำสั่ง: /help · /w ชื่อ ข้อความ · /pvp · /home · /who" });
            return;
          case "pvp":
            p.pvpFlag = !p.pvpFlag;
            client.send("system", { text: p.pvpFlag ? "⚔ PvP เปิดแล้ว" : "🕊 PvP ปิดแล้ว" });
            return;
          case "home": {
            // Spawn near center but offset slightly so we don't land inside the fountain/houses
            const a = Math.random() * Math.PI * 2;
            const r = 3 + Math.random() * 3;
            p.pos.x = Math.cos(a) * r;
            p.pos.z = Math.sin(a) * r;
            client.send("system", { text: "🏡 กลับสู่หมู่บ้าน" });
            return;
          }
          case "who": {
            const names: string[] = [];
            for (const [, q] of this.state.players) if (!this.botIds.has(q.id)) names.push(q.name);
            client.send("system", { text: `👥 ออนไลน์: ${names.join(", ")}` });
            return;
          }
          case "w":
            // Already handled via whisper handler — forward
            if (args.length >= 2) {
              const to = args[0]; const body = args.slice(1).join(" ");
              let target: Client | null = null;
              for (const c of this.clients) {
                const pp = this.state.players.get(c.sessionId);
                if (pp?.name === to) { target = c; break; }
              }
              if (!target) return client.send("system", { text: `ไม่พบ "${to}" ในแมพ` });
              target.send("whisper", { from: p.name, text: body, ts: Date.now() });
              client.send("whisper", { from: `${p.name} → ${to}`, text: body, ts: Date.now() });
            }
            return;
        }
      }
      this.broadcast("chat", { from: p.name, text, ts: Date.now() });
    });
  }

  async onJoin(client: Client, options: { token?: string; characterId?: string }) {
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
    this.recalcStats(p);
    this.state.players.set(client.sessionId, p);
    this.sessionToCharId.set(client.sessionId, c.id);
    this.playerUserId.set(client.sessionId, payload.uid);
    this.playerCharId.set(client.sessionId, c.id);
    console.log(`[room ${this.state.mapId}] ${c.name} joined`);
    // send quest state to this client
    const qs = this.playerQuests.get(client.sessionId)!;
    client.send("questUpdate", qs);
  }

  async onLeave(client: Client) {
    const sid = client.sessionId;
    // Cancel any in-flight trade so partner gets notified before save
    if (this.tradeSessions.has(sid)) this.cancelTrade(sid);
    await this.savePlayer(sid);
    this.handlePartyLeave(sid);
    this.state.players.delete(sid);
    this.intents.delete(sid);
    this.lastAttack.delete(sid);
    this.playerUserId.delete(sid);
    this.playerCharId.delete(sid);
    this.playerQuests.delete(sid);
    // Additional session-keyed maps (memory leak prevention)
    this.sessionToCharId.delete(sid);
    this.daily.forget(sid);
    this.fishingState.delete(sid);
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
  handlePartyInvite(client: Client, targetName: string) {
    const inviter = this.state.players.get(client.sessionId);
    if (!inviter) return;
    let target: Client | null = null;
    let targetPlayer: Player | null = null;
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (p?.name === targetName && p.id !== inviter.id) { target = c; targetPlayer = p; break; }
    }
    if (!target || !targetPlayer) return;
    if (!this.partySvc.invite(client.sessionId, target.sessionId)) return;
    target.send("partyInvite", { fromId: inviter.id, fromName: inviter.name });
  }

  handlePartyAccept(client: Client, fromId: string) {
    const sid = client.sessionId;
    // resolve inviter sid from fromId (id == sessionId in our schema)
    let inviterSid = "";
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (p?.id === fromId) { inviterSid = c.sessionId; break; }
    }
    if (!inviterSid) return;
    const change = this.partySvc.accept(sid, inviterSid);
    if (change.kind === "joined") this.broadcastPartyUpdate(change.pid);
  }

  handlePartyLeave(sid: string) {
    const change = this.partySvc.leave(sid);
    if (change.kind === "noop") return;
    if (change.kind === "disbanded") {
      for (const m of change.formerMembers) {
        const c = this.clients.find((c) => c.sessionId === m);
        c?.send("partyUpdate", { leaderId: "", members: [] });
      }
    } else if (change.kind === "left") {
      // Notify the leaver
      const leaver = this.clients.find((c) => c.sessionId === sid);
      leaver?.send("partyUpdate", { leaderId: "", members: [] });
      this.broadcastPartyUpdate(change.pid);
    }
  }

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
      let nearestMon: Monster | null = null;
      let nearestD = 30;
      for (const [, m] of this.state.monsters) {
        if (m.dead) continue;
        const cfg = (MONSTERS as any)[m.kind];
        if (!cfg || cfg.aggroRange <= 0) continue; // hostile mobs ONLY
        const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
        if (d < nearestD) { nearestD = d; nearestMon = m; }
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

  handleShopBuy(client: Client, msg: ShopBuyMsg) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const npc = NPCS.find((n) => n.id === msg.npcId);
    if (!npc || npc.kind !== "shop" || npc.mapId !== this.state.mapId) return;
    if (Math.hypot(p.pos.x - npc.x, p.pos.z - npc.z) > 4) {
      client.send("shopError", { reason: "too far" }); return;
    }
    const entry = npc.shop?.find((e) => e.itemId === msg.itemId);
    if (!entry) return;
    const qty = Math.max(1, Math.min(99, msg.qty | 0));
    const total = entry.price * qty;
    if (p.zeny < total) { client.send("shopError", { reason: "not enough zeny" }); return; }
    if (!this.addToInventory(p, msg.itemId, qty)) {
      client.send("shopError", { reason: "inventory full" }); return;
    }
    p.zeny -= total;
  }

  handleShopSell(client: Client, msg: ShopSellMsg) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const npc = NPCS.find((n) => n.id === msg.npcId);
    if (!npc || npc.kind !== "shop" || npc.mapId !== this.state.mapId) return;
    if (Math.hypot(p.pos.x - npc.x, p.pos.z - npc.z) > 4) return;
    const stack = p.inventory[msg.invIndex];
    if (!stack) return;
    const qty = Math.max(1, Math.min(stack.qty, msg.qty | 0));
    // base price: try shop entry first, else use slot default
    const entry = npc.shop?.find((e) => e.itemId === stack.itemId);
    const basePrice = entry?.price ?? defaultSellPrice(stack.itemId);
    const earned = Math.floor(basePrice * SELL_RATIO) * qty;
    stack.qty -= qty;
    if (stack.qty <= 0) p.inventory.splice(msg.invIndex, 1);
    p.zeny += earned;
  }

  // ── Bulk sell: array of stacks OR "sell all materials" convenience flag ────
  // msg = { npcId, items?: [{invIndex, qty}], sellAllMaterials?: bool, sellAllJunk?: bool }
  // sellAllMaterials: sells every stack whose item slot is "material"
  // sellAllJunk:      sells materials + low-value consumables (berry/apple)
  handleShopSellMany(client: Client, msg: any) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const npc = NPCS.find((n) => n.id === msg.npcId);
    if (!npc || npc.kind !== "shop" || npc.mapId !== this.state.mapId) return;
    if (Math.hypot(p.pos.x - npc.x, p.pos.z - npc.z) > 4) return;

    // Build list of indices to sell (descending so splice is safe)
    let entries: Array<{ invIndex: number; qty: number }> = [];
    if (Array.isArray(msg.items) && msg.items.length > 0) {
      entries = msg.items.map((it: any) => ({
        invIndex: it.invIndex | 0,
        qty: Math.max(1, it.qty | 0),
      }));
    } else if (msg.sellAllMaterials || msg.sellAllJunk) {
      const junkIds = new Set(["berry", "apple", "wood", "stone", "raw_meat", "feather"]);
      for (let i = 0; i < p.inventory.length; i++) {
        const stack = p.inventory[i];
        const def = ITEMS[stack.itemId];
        if (!def) continue;
        const isMaterial = def.slot === "material";
        const isJunk = msg.sellAllJunk && (isMaterial || junkIds.has(stack.itemId));
        if (msg.sellAllMaterials ? isMaterial : isJunk) {
          entries.push({ invIndex: i, qty: stack.qty });
        }
      }
    }

    // Process from highest index down so splice doesn't shift later targets
    entries.sort((a, b) => b.invIndex - a.invIndex);
    let totalEarned = 0;
    let totalCount = 0;
    for (const e of entries) {
      const stack = p.inventory[e.invIndex];
      if (!stack) continue;
      const sellQty = Math.min(stack.qty, e.qty);
      if (sellQty <= 0) continue;
      const shopEntry = npc.shop?.find((sh) => sh.itemId === stack.itemId);
      const basePrice = shopEntry?.price ?? defaultSellPrice(stack.itemId);
      totalEarned += Math.floor(basePrice * SELL_RATIO) * sellQty;
      totalCount += sellQty;
      stack.qty -= sellQty;
      if (stack.qty <= 0) p.inventory.splice(e.invIndex, 1);
    }
    p.zeny += totalEarned;
    // Optional confirmation to client
    if (totalCount > 0) {
      client.send("toast", { text: `ขายไป ${totalCount} ชิ้น ได้ ${totalEarned}z`, tone: "good" });
    }
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
    this.recalcStats(p);
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

  handleFeedAnimal(client: Client, monsterId: string) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    // limit collection to 8 pets
    let pets: any[] = [];
    try { pets = JSON.parse(p.petsJson || "[]"); } catch {}
    if (pets.length >= 8) {
      client.send("system", { text: "เลี้ยงสัตว์ได้สูงสุด 8 ตัว — ปล่อยบางตัวก่อน" });
      return;
    }
    const m = this.state.monsters.get(monsterId);
    if (!m || m.dead) return;
    const cfg = (MONSTERS as any)[m.kind];
    if (!cfg || cfg.aggroRange !== -1) {
      client.send("system", { text: "ให้อาหารได้แค่สัตว์เลี้ยง (ไก่/หมู/วัว)" });
      return;
    }
    if (Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) > 2.5) {
      client.send("system", { text: "เข้าใกล้สัตว์ก่อน" });
      return;
    }
    if (countItem(p, "berry") < 1) {
      client.send("system", { text: "ขาดเบอร์รี่" });
      return;
    }
    removeItem(p, "berry", 1);
    const key = sid + ":" + monsterId;
    const need = m.kind === "chicken" ? 3 : m.kind === "pig" ? 5 : 7; // cow takes longest
    const cur = (this.tameProgress.get(key) ?? 0) + 1;
    if (cur >= need) {
      // Tame!
      this.tameProgress.delete(key);
      const isRare = Math.random() < 0.05; // 5% chance golden variant
      const petId = "pet_" + Math.random().toString(36).slice(2, 8);
      pets.push({ id: petId, kind: m.kind, rare: isRare, tamedAt: Date.now() });
      p.petsJson = JSON.stringify(pets);
      // Make new pet active if no active pet
      if (!p.petKind) {
        p.petKind = m.kind;
        p.petRare = isRare;
      }
      m.dead = true;
      this.state.monsters.delete(monsterId);
      this.lastAttack.delete(monsterId);
      this.monsterSpawn.delete(monsterId);
      for (const k of this.statusTickAcc.keys()) if (k.endsWith(":" + monsterId)) this.statusTickAcc.delete(k);
      for (const k of this.tameProgress.keys()) if (k.endsWith(":" + monsterId)) this.tameProgress.delete(k);
      const rareText = isRare ? "✨ พิเศษ ✨ " : "";
      client.send("system", { text: `🎉 จับ ${rareText}${cfg.name} เป็นสัตว์เลี้ยงสำเร็จ!` });
      this.bumpAchievement(sid, "tames");
    } else {
      this.tameProgress.set(key, cur);
      client.send("system", { text: `🌾 ให้อาหาร ${cur}/${need}` });
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

  handlePlantSeed(client: Client) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (countItem(p, "berry_seed") < 1) {
      client.send("system", { text: "ขาดเมล็ดเบอร์รี่" });
      return;
    }
    // Limit each player to N plants alive at once
    let mine = 0;
    for (const [, pl] of this.state.plants) if (pl.ownerName === p.name) mine++;
    if (mine >= 8) {
      client.send("system", { text: "ปลูกได้สูงสุด 8 ต้น" });
      return;
    }
    // Can't plant inside water
    const mapDef = MAPS[this.state.mapId as MapId];
    for (const w of mapDef.waters ?? []) {
      if (Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < w.radius) {
        client.send("system", { text: "ปลูกในน้ำไม่ได้" });
        return;
      }
    }
    removeItem(p, "berry_seed", 1);
    const id = "plant_" + Math.random().toString(36).slice(2, 9);
    const node = new PlantNode();
    node.id = id;
    node.ownerName = p.name;
    node.pos.x = p.pos.x;
    node.pos.z = p.pos.z;
    node.plantedAt = Date.now();
    this.state.plants.set(id, node);
    client.send("system", { text: "🌱 ปลูกเมล็ดแล้ว — รอ 3 นาที" });
  }

  handleHarvestPlant(client: Client, plantId: string) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    const node = this.state.plants.get(plantId);
    if (!node) return;
    if (Math.hypot(p.pos.x - node.pos.x, p.pos.z - node.pos.z) > 2.5) {
      client.send("system", { text: "เข้าใกล้ต้นไม้ก่อน" });
      return;
    }
    const stage = plantStage(node.plantedAt, Date.now());
    if (stage < 3) {
      client.send("system", { text: "ยังโตไม่เต็มที่" });
      return;
    }
    // Yield: 2-4 berries + 1-2 seeds
    const berryQty = 2 + Math.floor(Math.random() * 3);
    const seedQty = 1 + Math.floor(Math.random() * 2);
    this.addToInventory(p, "berry", berryQty);
    this.addToInventory(p, "berry_seed", seedQty);
    this.state.plants.delete(plantId);
    client.send("system", { text: `🌾 เก็บเกี่ยว: 🫐 ×${berryQty} + 🌱 ×${seedQty}` });
    this.bumpAchievement(sid, "harvests");
  }

  handleStartFishing(client: Client) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (this.fishingState.has(sid)) return; // already fishing
    const mapDef = MAPS[this.state.mapId as MapId];
    const waters = mapDef.waters ?? [];
    let near = false;
    for (const w of waters) {
      if (Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < w.radius + 1) { near = true; break; }
    }
    if (!near) {
      client.send("system", { text: "ต้องอยู่ข้างน้ำเพื่อตกปลา" });
      return;
    }
    const waitMs = 3000 + Math.floor(Math.random() * 5000); // 3-8s
    this.fishingState.set(sid, { startedAt: Date.now(), resolveAt: Date.now() + waitMs });
    client.send("fishing", { state: "casting", remainingMs: waitMs });
  }

  handleStopFishing(client: Client) {
    const sid = client.sessionId;
    if (!this.fishingState.has(sid)) return;
    this.fishingState.delete(sid);
    client.send("fishing", { state: "cancelled" });
  }

  resolveFishingForAll() {
    const now = Date.now();
    for (const [sid, st] of this.fishingState) {
      if (now < st.resolveAt) continue;
      const p = this.state.players.get(sid);
      const client = this.clients.find((c) => c.sessionId === sid);
      this.fishingState.delete(sid);
      if (!p || !client) continue;
      // verify still near water
      const mapDef = MAPS[this.state.mapId as MapId];
      const waters = mapDef.waters ?? [];
      let near = false;
      for (const w of waters) {
        if (Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < w.radius + 1) { near = true; break; }
      }
      if (!near) {
        client.send("fishing", { state: "cancelled" });
        client.send("system", { text: "ห่างจากน้ำเกินไป ปลาหลุด" });
        continue;
      }
      // Roll outcome
      const r = Math.random();
      let itemId: string;
      let qty = 1;
      if (r < 0.55) { itemId = "raw_fish"; }
      else if (r < 0.80) { itemId = "seaweed"; }
      else if (r < 0.95) { itemId = "raw_fish"; qty = 2; }
      else { itemId = "rare_fish"; }
      if (this.addToInventory(p, itemId, qty)) {
        const def = ITEMS[itemId];
        client.send("fishing", { state: "done", itemId, qty });
        client.send("system", { text: `🎣 ตกได้ ${def?.icon ?? ""} ${def?.name ?? itemId} ×${qty}` });
        this.bumpAchievement(sid, "fishes");
      } else {
        client.send("fishing", { state: "cancelled" });
        client.send("system", { text: "กระเป๋าเต็ม ปลาหลุด" });
      }
    }
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
    for (const u of unlocked) {
      client?.send("system", { text: `🏅 ปลดล็อก: ${u.icon} ${u.name}` });
      if (u.reward?.zeny) p.zeny += u.reward.zeny;
      if (u.reward?.itemId) this.addToInventory(p, u.reward.itemId, u.reward.qty ?? 1);
    }
  }

  handleCraft(client: Client, recipeId: string) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    const recipe = RECIPES_BY_ID[recipeId];
    if (!recipe) { client.send("system", { text: "ไม่พบสูตร" }); return; }
    if (recipe.minLevel && p.level < recipe.minLevel) {
      client.send("system", { text: `ต้องเลเวล ${recipe.minLevel}` });
      return;
    }
    for (const inp of recipe.inputs) {
      if (countItem(p, inp.itemId) < inp.qty) {
        client.send("system", { text: `ขาด ${ITEMS[inp.itemId]?.name ?? inp.itemId} ${inp.qty}` });
        return;
      }
    }
    // Deduct inputs
    for (const inp of recipe.inputs) removeItem(p, inp.itemId, inp.qty);
    // Add output
    if (!this.addToInventory(p, recipe.output.itemId, recipe.output.qty)) {
      // refund on failure
      for (const inp of recipe.inputs) this.addToInventory(p, inp.itemId, inp.qty);
      client.send("system", { text: "กระเป๋าเต็ม" });
      return;
    }
    const out = ITEMS[recipe.output.itemId];
    client.send("system", { text: `🔨 ทำ ${out?.icon ?? ""} ${out?.name ?? recipe.output.itemId} ×${recipe.output.qty} สำเร็จ` });
    if (recipe.category === "cooking") this.bumpAchievement(sid, "cooks");
    else if (recipe.category === "weapon" || recipe.category === "armor") this.bumpAchievement(sid, "smiths");
  }

  handleBuildHouse(client: Client) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (p.houseSlot >= 0) {
      client.send("system", { text: "คุณมีบ้านอยู่แล้ว" });
      return;
    }
    // Must be near carpenter NPC
    const carp = NPCS.find((n) => n.id === "carpenter_field");
    if (!carp || carp.mapId !== this.state.mapId) {
      client.send("system", { text: "ไม่พบช่างไม้ที่นี่" });
      return;
    }
    if (Math.hypot(p.pos.x - carp.x, p.pos.z - carp.z) > 4) {
      client.send("system", { text: "เข้าใกล้ช่างไม้ก่อน" });
      return;
    }
    // Check resources
    if (countItem(p, "wood_log") < HOUSE_COST.wood_log) {
      client.send("system", { text: `ขาดไม้ ${HOUSE_COST.wood_log} ท่อน` });
      return;
    }
    if (countItem(p, "stone_chunk") < HOUSE_COST.stone_chunk) {
      client.send("system", { text: `ขาดหิน ${HOUSE_COST.stone_chunk} ก้อน` });
      return;
    }
    if (p.zeny < HOUSE_COST.zeny) {
      client.send("system", { text: `ขาดเงิน ${HOUSE_COST.zeny} zeny` });
      return;
    }
    // Find a free slot (not used by any currently online player)
    const taken = new Set<number>();
    for (const [, pp] of this.state.players) if (pp.houseSlot >= 0) taken.add(pp.houseSlot);
    let chosen = -1;
    for (let i = 0; i < HOUSE_SLOTS.length; i++) {
      if (!taken.has(i)) { chosen = i; break; }
    }
    if (chosen < 0) {
      client.send("system", { text: "ไม่มีที่ดินว่าง" });
      return;
    }
    // Deduct + assign
    removeItem(p, "wood_log", HOUSE_COST.wood_log);
    removeItem(p, "stone_chunk", HOUSE_COST.stone_chunk);
    p.zeny -= HOUSE_COST.zeny;
    p.houseSlot = chosen;
    client.send("system", { text: `🏠 สร้างบ้านสำเร็จ! (slot ${chosen})` });
    this.bumpAchievement(sid, "house");
  }

  handleDrink(sid: string) {
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    const mapDef = MAPS[this.state.mapId as MapId];
    const waters = mapDef.waters ?? [];
    let nearWater = false;
    for (const w of waters) {
      if (Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < w.radius) { nearWater = true; break; }
    }
    if (!nearWater) return;
    p.thirst = Math.min(100, p.thirst + 35);
  }

  handlePickup(sid: string, dropId: string) {
    this.inventorySvc.handlePickup(sid, dropId);
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
      this.recalcStats(p, true);
      return;
    }
    // 2nd class change at Lv30
    const adv = JOB_ADVANCEMENT[p.job] as string[] | undefined;
    if (adv && adv.includes(job) && p.level >= 30) {
      p.job = job;
      this.recalcStats(p, true);
      const client = this.clients.find((c) => c.sessionId === sid);
      client?.send("system", { text: `⭐ เลื่อนเป็น ${targetJob.name} สำเร็จ!` });
    }
  }

  recalcStats(p: Player, fullHeal = false) {
    const job = JOBS[p.job as JobId] ?? JOBS.novice;
    const d = derived({ str: p.str, agi: p.agi, vit: p.vit, int: p.int, dex: p.dex, luk: p.luk }, p.level);
    const baseHp = GAME_CONFIG.PLAYER_BASE_HP + job.hpPerLevel * (p.level - 1);
    const baseAtk = GAME_CONFIG.PLAYER_BASE_ATK + job.atkPerLevel * (p.level - 1);
    const wpn = ITEMS[p.weapon]?.atk ?? 0;
    const arm = ITEMS[p.armor]?.def ?? 0;
    p.maxHp = baseHp + d.hpFromVit;
    p.maxMp = maxMpFor(job.id, p.level) + d.mpFromInt;
    p.atk = baseAtk + wpn + d.atkBonus;
    p.def = arm + d.defFromVit;
    if (p.hp > p.maxHp || fullHeal) p.hp = p.maxHp;
    if (p.mp > p.maxMp || fullHeal) p.mp = p.maxMp;
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
        this.recalcStats(r, true);
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

  tickChunkSpawns(dt: number) {
    this.spawnSvc.tickChunkSpawns(dt);
  }

  spawnMonster(kind: MonsterKind, x: number, z: number) {
    this.spawnSvc.spawnMonster(kind, x, z);
  }

  // ---------- tick ----------
  tick(dtMs: number) {
    try {
      this.tickInner(dtMs);
    } catch (e) {
      console.error("[tick error]", e);
      // do NOT rethrow — keep the room alive so players don't get disconnected on a single bad tick
    }
  }

  tickInner(dtMs: number) {
    const dt = dtMs / 1000;
    const mapDef = MAPS[this.state.mapId as MapId];
    const world = mapDef.size / 2;

    this.tickStatuses();
    this.tickBots(Date.now());
    this.resolveFishingForAll();
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

    // Boss world event — every ~10 min spawn a roaming boss in field
    if (this.state.mapId === "field") {
      this.bossEventAcc += dt;
      if (!this.bossEventActive && this.bossEventAcc > 600) {
        this.bossEventAcc = 0;
        const a = Math.random() * Math.PI * 2;
        const r = (MAPS["field"].size / 2) * 0.6;
        const bx = Math.cos(a) * r;
        const bz = Math.sin(a) * r;
        this.spawnMonster("darklord", bx, bz);
        this.bossEventActive = true;
        this.broadcast("system", { text: `⚜ ผู้พิทักษ์เงา (Dark Lord) ปรากฏที่ (${bx.toFixed(0)}, ${bz.toFixed(0)})!` });
      }
      // Reset event flag when no darklord alive
      if (this.bossEventActive) {
        let alive = false;
        for (const [, m] of this.state.monsters) {
          if (m.kind === "darklord" && !m.dead) { alive = true; break; }
        }
        if (!alive) this.bossEventActive = false;
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
      if (moving && this.fishingState.has(sid)) {
        this.fishingState.delete(sid);
        const client = this.clients.find((c) => c.sessionId === sid);
        client?.send("fishing", { state: "cancelled" });
      }
      if (intent && !this.isStunned(p)) {
        // Survival speed penalties: hungry → 80%, very hungry → 65%, exhausted → 50%
        let speedMult = 1;
        if (p.hunger < 25) speedMult *= 0.8;
        if (p.hunger <= 0) speedMult *= 0.8;       // stacks: 64% when hunger 0
        if (p.stamina <= 0) speedMult *= 0.65;
        if (p.mounted && p.petKind) speedMult *= 1.55; // mount speed bonus
        if (p.flying) speedMult *= 2.4; // flying = clearly the fastest
        // Thirsty hallucination: slight stagger on movement direction
        let mx = intent.mx, mz = intent.mz;
        if (p.thirst <= 0) {
          // drunkard wobble — wave a sin into direction
          const wob = Math.sin(Date.now() * 0.005 + sid.charCodeAt(0)) * 0.35;
          const cos = Math.cos(wob), sin = Math.sin(wob);
          const rx = mx * cos - mz * sin;
          const rz = mx * sin + mz * cos;
          mx = rx; mz = rz;
        }
        const sp = GAME_CONFIG.PLAYER_SPEED * this.speedMultOf(p) * speedMult;
        p.pos.x = clamp(p.pos.x + mx * sp * dt, -world, world);
        p.pos.z = clamp(p.pos.z + mz * sp * dt, -world, world);
        p.rotY = intent.rotY;
      }
      // ---- Survival decay (gentle: about 25-30 min to empty from full) ----
      // Moving costs MORE hunger/thirst than standing still
      const moveMult = moving ? 1.6 : 1.0;
      p.hunger = Math.max(0, p.hunger - dt * (100 / (28 * 60)) * moveMult); // ~28 min idle, ~17 min running
      p.thirst = Math.max(0, p.thirst - dt * (100 / (22 * 60)) * moveMult); // ~22 min idle, ~14 min running
      // stamina: drain while moving/flying, regen while still — rainy weather restores faster
      const weatherStaminaBonus = this.state.weather === "rainy" ? 1.6 : 1;
      if (p.flying) {
        // Glider in inventory → halves stamina drain
        const hasGlider = countItem(p, "glider") > 0;
        p.stamina = Math.max(0, p.stamina - dt * (hasGlider ? 1 : 7));
        if (p.stamina <= 0 && !hasGlider) {
          p.flying = false;
          const c = this.clients.find((cc) => cc.sessionId === sid);
          c?.send("system", { text: "💨 Stamina หมด — ลงพื้นแล้ว" });
        }
      } else if (moving) {
        p.stamina = Math.max(0, p.stamina - dt * 4);
      } else {
        p.stamina = Math.min(p.maxStamina, p.stamina + dt * 18 * weatherStaminaBonus);
      }
      // NO STARVATION DEATH — hunger/thirst only DEBUFF, never kill.
      if (regen) {
        // Regen scales with how well-fed/hydrated you are:
        //  - both > 50: full regen (HP +1, MP +2)
        //  - both > 20: half regen (MP +1, no HP)
        //  - one at 0: no regen at all (but no damage either)
        const wellFed = p.hunger > 50 && p.thirst > 50;
        const okay = p.hunger > 20 && p.thirst > 20;
        if (wellFed) {
          if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + 2);
          if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1);
        } else if (okay) {
          if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + 1);
        }
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
    // Rebuild spatial hash for living players — O(P) instead of O(P*M) below
    this.playerSpatialHash.clear();
    for (const [sid, pp] of this.state.players) {
      if (pp.dead) continue;
      this.playerSpatialHash.update({ id: pp.id, sid, x: pp.pos.x, z: pp.pos.z, dead: false });
    }
    for (const [, m] of this.state.monsters) {
      if (m.dead) continue;
      const cfg = (MONSTERS as any)[m.kind];
      // resource nodes don't tick (no AI / no aggro)
      if (cfg?.aggroRange === 0) continue;
      const def = MONSTERS[m.kind as MonsterKind];

      // PASSIVE ANIMALS (aggroRange === -1): wander + flee when low HP
      if (cfg?.aggroRange === -1) {
        const hpRatio = m.hp / m.maxHp;
        // Find player who recently damaged this animal (use targetId set during attack)
        let threat: Player | null = null;
        if (m.targetId) {
          const t = this.state.players.get(m.targetId);
          if (t && !t.dead) {
            const d = Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
            if (d < 14 && hpRatio < 1) threat = t;
          }
        }
        const speed = def.speed * this.speedMultOf(m);
        if (threat) {
          // run away
          const dx = m.pos.x - threat.pos.x;
          const dz = m.pos.z - threat.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          m.pos.x += (dx / d) * speed * 1.4 * dt;
          m.pos.z += (dz / d) * speed * 1.4 * dt;
        } else {
          // gentle wander — pick new target every few seconds, stored in lastAttack map as next-change time
          const key = "wander:" + m.id;
          const nextAt = this.lastAttack.get(key as any) ?? 0;
          if (now >= nextAt) {
            this.lastAttack.set(key as any, now + 3000 + Math.random() * 5000);
            const a = Math.random() * Math.PI * 2;
            const stride = 2 + Math.random() * 4;
            m.pos.x += Math.cos(a) * stride;
            m.pos.z += Math.sin(a) * stride;
          }
        }
        // clamp to world
        m.pos.x = clamp(m.pos.x, -world, world);
        m.pos.z = clamp(m.pos.z, -world, world);
        continue;
      }

      // Use spatial hash — only scans players in nearby cells. With 30 mobs ×
      // 5 players this drops from 150 scans to ~5-15 per tick.
      const mh = estimateHeight(m.pos.x, m.pos.z);
      const hit = this.playerSpatialHash.findNearest(m.pos.x, m.pos.z, def.aggroRange, (cand) => {
        const ph = estimateHeight(cand.x, cand.z);
        return Math.abs(ph - mh) <= 3; // terrain LOS proxy
      });
      let nearest: Player | null = null;
      let nearestD = Infinity;
      if (hit) {
        nearest = this.state.players.get(hit.entity.sid) ?? null;
        nearestD = hit.distance;
      }
      if (nearest && nearestD < def.aggroRange && !this.isStunned(m)) {
        m.targetId = nearest.id;
        const mSpeed = def.speed * this.speedMultOf(m);
        if (nearestD > GAME_CONFIG.ATTACK_RANGE) {
          const dx = nearest.pos.x - m.pos.x;
          const dz = nearest.pos.z - m.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          m.pos.x += (dx / len) * mSpeed * dt;
          m.pos.z += (dz / len) * mSpeed * dt;
        } else {
          const last = this.lastAttack.get(m.id) ?? 0;
          if (now - last >= GAME_CONFIG.ATTACK_COOLDOWN_MS) {
            this.lastAttack.set(m.id, now);
            const nightMult = this.state.isNight ? 1.5 : 1;
            const dmg = Math.max(1, Math.floor((def.atk - nearest.def) * nightMult));
            nearest.hp = Math.max(0, nearest.hp - dmg);
            this.broadcast("damage", { targetId: nearest.id, amount: dmg, from: m.id });
            if (nearest.hp === 0) {
              nearest.dead = true;
              const deadId = nearest.id;
              this.clock.setTimeout(() => {
                const pp = this.state.players.get(deadId);
                if (!pp) return;
                pp.hp = pp.maxHp; pp.mp = pp.maxMp;
                pp.dead = false;
                // Respawn at house if owned, else village center
                if (pp.houseSlot >= 0 && pp.houseSlot < HOUSE_SLOTS.length) {
                  const h = HOUSE_SLOTS[pp.houseSlot];
                  pp.pos.x = h.x; pp.pos.z = h.z;
                } else {
                  pp.pos.x = 0; pp.pos.z = 0;
                }
              }, GAME_CONFIG.RESPAWN_MS);
            }
          }
        }
      } else {
        m.targetId = "";
      }
    }
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

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function defaultSellPrice(itemId: string): number {
  // Materials from gathering / monster parts
  const map: Record<string, number> = {
    // monster materials
    slime_jelly: 10,
    wolf_fang: 25,
    orc_tusk: 60,
    dark_crystal: 500,
    // gathered resources
    wood_log: 8,
    stone_chunk: 12,
    raw_meat: 15,
    // food / drink
    apple: 6,
    bread: 12,
    cooked_meat: 30,
    water_flask: 8,
    berry: 4,
    energy_tonic: 40,
    // consumables
    hp_potion: 25,
    mp_potion: 20,
    // gear (sell back at half via SELL_RATIO)
    wood_sword: 200,
    iron_sword: 1500,
    apprentice_staff: 400,
    leather_armor: 300,
    iron_armor: 2200,
    blade_of_dawn: 8000,
    dragon_plate: 7000,
  };
  return map[itemId] ?? 5;
}

// Lightweight terrain-height estimator for server-side LOS checks. Mirrors
// the client's chunkWorld.getHeight approximation via the same coarse
// noise pattern (deterministic). Not pixel-accurate — good enough to
// suppress aggro through cliffs.
function estimateHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  if (d < 18) return 0;                                              // flat spawn ring
  const n = (Math.sin(x * 0.05) * Math.cos(z * 0.05) +
             Math.sin(x * 0.11) * 0.3 + Math.cos(z * 0.09) * 0.3) * 0.5 + 0.5;
  const ramp = Math.min(1, (d - 18) / 10);
  let h = Math.pow(Math.max(0, n), 1.5) * 18 * ramp;
  h = Math.floor(h / 1.2) * 1.2;
  return h;
}

function countItem(p: Player, itemId: string): number {
  let n = 0;
  for (const s of p.inventory.values()) if (s.itemId === itemId) n += s.qty;
  return n;
}

function removeItem(p: Player, itemId: string, qty: number) {
  let need = qty;
  for (let i = p.inventory.length - 1; i >= 0 && need > 0; i--) {
    const s = p.inventory[i];
    if (s.itemId !== itemId) continue;
    const take = Math.min(s.qty, need);
    s.qty -= take;
    need -= take;
    if (s.qty <= 0) p.inventory.splice(i, 1);
  }
}
