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
  // Anti-spam rate limiters: sid → [bucket of recent timestamps]
  rateLimitBuckets = new Map<string, Map<string, number[]>>();
  playerUserId = new Map<string, string>();
  playerCharId = new Map<string, string>();
  playerQuests = new Map<string, PlayerQuestState>();
  parties = new Map<string, Set<string>>(); // partyId -> sids
  playerParty = new Map<string, string>();   // sid -> partyId
  partyInvites = new Map<string, string>();  // toSid -> fromSid (last invite)
  monsterSpawn = new Map<string, { x: number; z: number; kind: MonsterKind }>();
  sessionToCharId = new Map<string, string>(); // sid -> Character.id (for DB writes)
  chunkSpawnAcc = 0;                            // tick accumulator for chunk spawning
  spawnedChestChunks = new Set<string>();       // chunks that have already had a chest roll
  spawnedResourceChunks = new Set<string>();    // chunks that already have resource nodes
  dailyState = new Map<string, { date: string; kills: number; harvest: number; rewards: Set<string> }>();
  tradeSessions = new Map<string, { partnerSid: string; items: Array<{ invIndex: number; qty: number }>; zeny: number; confirmed: boolean }>();
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
    const mapId: MapId = (opts?.mapId ?? "field") as MapId;
    this.setState(new WorldState());
    this.state.mapId = mapId;
    // Detect current season by month
    const month = new Date().getMonth() + 1;
    this.state.season =
      month === 12 ? "christmas" :
      month === 10 ? "halloween" :
      month === 4 ? "songkran" :
      "none";
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
      // Anti-cheat: any input value > 100 is suspicious (legitimate joystick is [-1,1])
      const abnormal = Math.abs(msg.mx) > 100 || Math.abs(msg.mz) > 100 || !Number.isFinite(msg.mx) || !Number.isFinite(msg.mz);
      if (abnormal) {
        // Throttle the alerts so a single bad client can't flood logs
        if (this.checkRateLimit(client.sessionId, "anticheat-log", 1, 5000)) {
          console.warn("[anticheat] suspicious input", { sid: client.sessionId, name: p.name, mx: msg.mx, mz: msg.mz });
        }
        return; // drop the message — don't update intent
      }
      const mag = Math.hypot(msg.mx, msg.mz);
      const mx = mag > 1 ? msg.mx / mag : msg.mx;
      const mz = mag > 1 ? msg.mz / mag : msg.mz;
      this.intents.set(client.sessionId, {
        mx: Number.isFinite(mx) ? mx : 0,
        mz: Number.isFinite(mz) ? mz : 0,
        rotY: Number.isFinite(msg.rotY) ? msg.rotY : 0,
      });
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
      const to = String(msg?.to ?? "").trim();
      const subject = String(msg?.subject ?? "").slice(0, 60).trim() || "(ไม่มีหัวข้อ)";
      const body = String(msg?.body ?? "").slice(0, 500).trim();
      const zeny = Math.max(0, Math.min(9999999, msg?.zeny | 0));
      const itemInvIdx = msg?.itemInvIdx;
      let itemId = "", itemQty = 0;
      if (zeny > 0 && p.zeny < zeny) {
        client.send("system", { text: "เงินไม่พอ" });
        return;
      }
      if (typeof itemInvIdx === "number" && itemInvIdx >= 0 && itemInvIdx < p.inventory.length) {
        const stack = p.inventory[itemInvIdx];
        itemId = stack.itemId;
        itemQty = Math.max(1, Math.min(stack.qty, msg?.itemQty | 0 || 1));
      }
      if (!to || (!body && zeny === 0 && !itemId)) return;
      // Check target exists
      const target = await prisma.character.findUnique({ where: { name: to } });
      if (!target) { client.send("system", { text: `ไม่พบผู้เล่นชื่อ ${to}` }); return; }
      // Deduct from sender
      if (zeny > 0) p.zeny -= zeny;
      if (itemId && itemQty > 0) removeItem(p, itemId, itemQty);
      // Persist
      await prisma.mail.create({
        data: { toName: to, fromName: p.name, subject, body, zeny, itemId, itemQty },
      });
      client.send("system", { text: `📬 ส่งจดหมายถึง ${to} แล้ว` });
    });

    this.onMessage("claimMail", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const id = String(msg?.id ?? "");
      const mail = await prisma.mail.findUnique({ where: { id } });
      if (!mail || mail.toName !== p.name || mail.claimed) return;
      if (mail.zeny > 0) p.zeny += mail.zeny;
      if (mail.itemId && mail.itemQty > 0) this.addToInventory(p, mail.itemId, mail.itemQty);
      await prisma.mail.update({ where: { id }, data: { read: 1, claimed: 1 } });
      client.send("system", { text: "📦 รับของเรียบร้อย" });
      // Notify client to refresh
      client.send("mailUpdated", {});
    });

    this.onMessage("readMail", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const id = String(msg?.id ?? "");
      const mail = await prisma.mail.findUnique({ where: { id } });
      if (!mail || mail.toName !== p.name) return;
      await prisma.mail.update({ where: { id }, data: { read: 1 } });
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
      if (!me) return;
      const name = String(msg?.name ?? "").trim().slice(0, 24);
      if (!name || name === me.name) return;
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!charId) return;
      try {
        // Validate target exists
        const target = await prisma.character.findUnique({ where: { name } });
        if (!target) {
          return client.send("system", { text: `ไม่พบตัวละครชื่อ "${name}"` });
        }
        const c = await prisma.character.findUnique({ where: { id: charId } });
        if (!c) return;
        const friends: string[] = JSON.parse(((c as any).friendsJson) ?? "[]");
        if (friends.length >= 100) {
          return client.send("system", { text: "เพื่อนเต็ม (สูงสุด 100 คน) — ลบบางคนออกก่อน" });
        }
        if (!friends.includes(name)) {
          friends.push(name);
          await prisma.character.update({
            where: { id: charId },
            data: { friendsJson: JSON.stringify(friends) } as any,
          });
        }
        client.send("friend:list", { friends: friends.map((n) => ({ name: n, online: this.isOnline(n) })) });
      } catch (e) { console.error("[friend:add] error", e); }
    });

    this.onMessage("friend:remove", async (client, msg: any) => {
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!charId) return;
      const name = String(msg?.name ?? "").trim();
      try {
        const c = await prisma.character.findUnique({ where: { id: charId } });
        if (!c) return;
        const friends: string[] = JSON.parse(((c as any).friendsJson) ?? "[]");
        const next = friends.filter((n) => n !== name);
        await prisma.character.update({
          where: { id: charId },
          data: { friendsJson: JSON.stringify(next) } as any,
        });
        client.send("friend:list", { friends: next.map((n) => ({ name: n, online: this.isOnline(n) })) });
      } catch {}
    });

    this.onMessage("friend:list", async (client) => {
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!charId) return;
      try {
        const c = await prisma.character.findUnique({ where: { id: charId } });
        if (!c) return;
        const friends: string[] = JSON.parse(((c as any).friendsJson) ?? "[]");
        client.send("friend:list", { friends: friends.map((n) => ({ name: n, online: this.isOnline(n) })) });
      } catch {}
    });

    // ── Guild system: shared persistent groups with chat channel ─────────────
    this.onMessage("guild:create", async (client, msg: any) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      const name = String(msg?.name ?? "").trim().slice(0, 24);
      const tag = String(msg?.tag ?? "").trim().slice(0, 4).toUpperCase();
      if (!name) return client.send("system", { text: "ตั้งชื่อกิลด์ก่อน" });
      try {
        const c = await prisma.character.findUnique({ where: { id: charId } });
        if (!c) return;
        if (((c as any).guildId) && (c as any).guildId !== "") {
          return client.send("system", { text: "อยู่กิลด์อื่นแล้ว ออกก่อน" });
        }
        // ensure no duplicate name
        const dup = await (prisma as any).guild.findUnique({ where: { name } }).catch(() => null);
        if (dup) return client.send("system", { text: "ชื่อนี้ถูกใช้แล้ว" });
        const g = await (prisma as any).guild.create({
          data: { name, tag, leaderName: me.name, membersJson: JSON.stringify([me.name]) },
        });
        await prisma.character.update({ where: { id: charId }, data: { guildId: g.id } as any });
        client.send("guild:info", { id: g.id, name: g.name, tag: g.tag, leader: g.leaderName, members: [me.name] });
      } catch (e: any) {
        client.send("system", { text: "สร้างกิลด์ไม่สำเร็จ: " + (e.message ?? "?") });
      }
    });

    this.onMessage("guild:join", async (client, msg: any) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      const guildName = String(msg?.name ?? "").trim();
      if (!guildName) return;
      try {
        const c = await prisma.character.findUnique({ where: { id: charId } });
        if (!c) return;
        if (((c as any).guildId) && (c as any).guildId !== "") {
          return client.send("system", { text: "อยู่กิลด์อื่นแล้ว ออกก่อน" });
        }
        const g = await (prisma as any).guild.findUnique({ where: { name: guildName } });
        if (!g) return client.send("system", { text: "ไม่พบกิลด์ \"" + guildName + "\"" });
        const members: string[] = JSON.parse(g.membersJson ?? "[]");
        if (!members.includes(me.name)) members.push(me.name);
        await (prisma as any).guild.update({ where: { id: g.id }, data: { membersJson: JSON.stringify(members) } });
        await prisma.character.update({ where: { id: charId }, data: { guildId: g.id } as any });
        client.send("guild:info", { id: g.id, name: g.name, tag: g.tag, leader: g.leaderName, members });
      } catch {}
    });

    this.onMessage("guild:leave", async (client) => {
      const me = this.state.players.get(client.sessionId);
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!me || !charId) return;
      try {
        const c = await prisma.character.findUnique({ where: { id: charId } });
        if (!c) return;
        const gid = (c as any).guildId;
        if (!gid) return;
        const g = await (prisma as any).guild.findUnique({ where: { id: gid } });
        if (g) {
          const members: string[] = JSON.parse(g.membersJson ?? "[]");
          const next = members.filter((n: string) => n !== me.name);
          // Disband entirely if alone — also clear ALL remaining members' guildId
          if (next.length === 0) {
            await prisma.$transaction([
              (prisma as any).guild.delete({ where: { id: gid } }),
              prisma.character.update({ where: { id: charId }, data: { guildId: "" } as any }),
            ]);
          } else {
            // Single-member transfer + clear my guildId
            const newLeader = g.leaderName === me.name ? next[0] : g.leaderName;
            await prisma.$transaction([
              (prisma as any).guild.update({
                where: { id: gid },
                data: { membersJson: JSON.stringify(next), leaderName: newLeader },
              }),
              prisma.character.update({ where: { id: charId }, data: { guildId: "" } as any }),
            ]);
          }
        } else {
          // Guild was already deleted — just clear my stale guildId
          await prisma.character.update({ where: { id: charId }, data: { guildId: "" } as any });
        }
        client.send("guild:info", null as any);
      } catch (e) {
        console.error("[guild:leave] error", e);
      }
    });

    // ── Periodic stale-guildId reconciliation: when fetching guild:info, if
    //    Character.guildId points to a nonexistent Guild row, clear it.
    // (Already implicitly handled by guild:info handler — improved below.)

    this.onMessage("guild:info", async (client) => {
      const charId = this.sessionToCharId.get(client.sessionId);
      if (!charId) return;
      try {
        const c = await prisma.character.findUnique({ where: { id: charId } });
        if (!c) return;
        const gid = (c as any).guildId;
        if (!gid) { client.send("guild:info", null as any); return; }
        const g = await (prisma as any).guild.findUnique({ where: { id: gid } });
        if (!g) {
          // Stale guildId — guild was deleted, clear the reference
          await prisma.character.update({ where: { id: charId }, data: { guildId: "" } as any }).catch(() => {});
          client.send("guild:info", null as any);
          return;
        }
        client.send("guild:info", {
          id: g.id, name: g.name, tag: g.tag, leader: g.leaderName,
          members: JSON.parse(g.membersJson ?? "[]"),
        });
      } catch (e) { console.error("[guild:info] error", e); }
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
      try {
        const c = await prisma.character.findUnique({ where: { id: charId } });
        if (!c) return;
        const gid = (c as any).guildId;
        if (!gid) return;
        const g = await (prisma as any).guild.findUnique({ where: { id: gid } });
        if (!g) return;
        const members: string[] = JSON.parse(g.membersJson ?? "[]");
        // Broadcast to all online members
        for (const cl of this.clients) {
          const p = this.state.players.get(cl.sessionId);
          if (p && members.includes(p.name)) {
            cl.send("guild:chat", { from: me.name, text, ts: Date.now() });
          }
        }
      } catch {}
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
      // List my own item for sale. Removes it from inventory immediately.
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const invIndex = msg?.invIndex | 0;
      const qty = Math.max(1, Math.min(99, msg?.qty | 0));
      const pricePer = Math.max(1, Math.min(10_000_000, msg?.pricePer | 0));
      if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return;
      const stack = p.inventory[invIndex];
      if (!stack || stack.qty < qty) return client.send("system", { text: "ของไม่พอ" });
      // Cap total transaction at safe integer range
      const total = pricePer * qty;
      if (total > 999_999_999) return client.send("system", { text: "ราคารวมสูงเกิน (เกินขีดสูงสุด 999M zeny)" });
      // Charge a small listing fee (1%) — anti-spam
      const fee = Math.max(1, Math.floor(total * 0.01));
      if (p.zeny < fee) return client.send("system", { text: `ต้องมีเงิน ${fee}z สำหรับค่าธรรมเนียมประกาศ` });
      try {
        await (prisma as any).auctionListing.create({
          data: { sellerName: p.name, itemId: stack.itemId, qty, pricePer },
        });
        p.zeny -= fee;
        stack.qty -= qty;
        if (stack.qty <= 0) p.inventory.splice(invIndex, 1);
        client.send("system", { text: `📢 ลงประกาศ ${qty} ชิ้น @${pricePer}z` });
      } catch (e) {
        console.error("[auction:list] create failed", e);
        client.send("system", { text: "⚠ ลงประกาศไม่สำเร็จ" });
      }
    });

    this.onMessage("auction:browse", async (client, msg: any) => {
      const search = String(msg?.search ?? "").trim().toLowerCase();
      try {
        const listings = await (prisma as any).auctionListing.findMany({
          where: search ? { itemId: { contains: search } } : undefined,
          orderBy: { pricePer: "asc" },
          take: 100,
        });
        client.send("auction:browse", { listings });
      } catch {}
    });

    this.onMessage("auction:buy", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const id = String(msg?.id ?? "");
      try {
        // Atomically claim the listing — only one concurrent buyer wins.
        // deleteMany returns count = 0 if already gone OR if it's the seller's own listing.
        const listing = await (prisma as any).auctionListing.findUnique({ where: { id } });
        if (!listing) return client.send("system", { text: "ของถูกซื้อหรือลบไปแล้ว" });
        if (listing.sellerName === p.name) return client.send("system", { text: "ซื้อของตัวเองไม่ได้" });
        const total = listing.pricePer * listing.qty;
        if (p.zeny < total) return client.send("system", { text: `เงินไม่พอ (ต้อง ${total}z)` });

        // Atomic delete-with-condition — if another buyer already claimed it, count = 0
        const claim = await (prisma as any).auctionListing.deleteMany({
          where: { id, sellerName: { not: p.name } },
        });
        if (claim.count === 0) return client.send("system", { text: "ของถูกคนอื่นซื้อไปแล้ว" });

        // We own the claim; now try to give item + deduct zeny atomically on player state
        const ok = this.addToInventory(p, listing.itemId, listing.qty);
        if (!ok) {
          // Re-list it so item isn't lost (best effort)
          try {
            await (prisma as any).auctionListing.create({ data: { sellerName: listing.sellerName, itemId: listing.itemId, qty: listing.qty, pricePer: listing.pricePer } });
          } catch {}
          return client.send("system", { text: "กระเป๋าเต็ม — ของถูก re-list" });
        }
        p.zeny -= total;
        // Mail proceeds to seller (offline-friendly)
        try {
          await prisma.mail.create({
            data: {
              toName: listing.sellerName,
              fromName: "AUCTION",
              subject: `ขายแล้ว: ${listing.itemId} ×${listing.qty}`,
              body: `ขาย ${listing.itemId} ${listing.qty} ชิ้น ราคารวม ${total}z`,
              zeny: total, itemId: "", itemQty: 0,
            },
          });
        } catch (e) {
          console.error("[auction] mail to seller failed", e);
        }
        client.send("system", { text: `✅ ซื้อ ${listing.itemId} ×${listing.qty} (-${total}z)` });
      } catch (e) {
        console.error("[auction:buy] error", e);
        client.send("system", { text: "⚠ เกิดข้อผิดพลาดในการซื้อ" });
      }
    });

    this.onMessage("auction:cancel", async (client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const id = String(msg?.id ?? "");
      try {
        const listing = await (prisma as any).auctionListing.findUnique({ where: { id } });
        if (!listing || listing.sellerName !== p.name) return;
        // Return item via mail (avoids inventory-full edge case)
        await prisma.mail.create({
          data: {
            toName: p.name, fromName: "AUCTION",
            subject: `ยกเลิก: ${listing.itemId} ×${listing.qty}`,
            body: "คุณยกเลิกการประกาศ",
            zeny: 0, itemId: listing.itemId, itemQty: listing.qty,
          },
        });
        await (prisma as any).auctionListing.delete({ where: { id } });
        client.send("system", { text: "ยกเลิกประกาศแล้ว" });
      } catch {}
    });

    // ── P2P Trading: A → B request, both add items/zeny, confirm, transfer ──
    this.onMessage("trade:request", (client, msg: any) => {
      const a = this.state.players.get(client.sessionId);
      if (!a) return;
      const targetSid = String(msg?.toSid ?? "");
      const b = this.state.players.get(targetSid);
      if (!b || a === b) return;
      if (this.tradeSessions.has(client.sessionId) || this.tradeSessions.has(targetSid)) {
        return client.send("system", { text: "ฝั่งใดฝั่งหนึ่งกำลังเทรดอยู่" });
      }
      const targetClient = this.clients.find((c) => c.sessionId === targetSid);
      if (!targetClient) return;
      targetClient.send("trade:invite" as any, { fromSid: client.sessionId, fromName: a.name });
      client.send("system", { text: `📩 ส่งคำขอเทรดให้ ${b.name}` });
    });

    this.onMessage("trade:accept", (client, msg: any) => {
      const b = this.state.players.get(client.sessionId);
      if (!b) return;
      const fromSid = String(msg?.fromSid ?? "");
      const a = this.state.players.get(fromSid);
      if (!a) return;
      // Open the session
      this.tradeSessions.set(client.sessionId, { partnerSid: fromSid, items: [], zeny: 0, confirmed: false });
      this.tradeSessions.set(fromSid,            { partnerSid: client.sessionId, items: [], zeny: 0, confirmed: false });
      const sendBoth = () => {
        const s1 = this.tradeSessions.get(fromSid); const s2 = this.tradeSessions.get(client.sessionId);
        if (!s1 || !s2) return;
        const c1 = this.clients.find((c) => c.sessionId === fromSid);
        const c2 = client;
        c1?.send("trade:state" as any, { meItems: s1.items, meZeny: s1.zeny, meConfirmed: s1.confirmed, themItems: s2.items, themZeny: s2.zeny, themConfirmed: s2.confirmed, partner: b.name });
        c2.send("trade:state" as any, { meItems: s2.items, meZeny: s2.zeny, meConfirmed: s2.confirmed, themItems: s1.items, themZeny: s1.zeny, themConfirmed: s1.confirmed, partner: a.name });
      };
      sendBoth();
    });

    this.onMessage("trade:offer", (client, msg: any) => {
      const me = this.state.players.get(client.sessionId);
      const sess = this.tradeSessions.get(client.sessionId);
      if (!me || !sess) return;
      // Validate items belong to me (not already offered double)
      const items: Array<{ invIndex: number; qty: number }> = Array.isArray(msg?.items) ? msg.items : [];
      const zeny = Math.max(0, Math.min(me.zeny, msg?.zeny | 0));
      const cleaned: typeof items = [];
      for (const it of items) {
        const stack = me.inventory[it.invIndex];
        if (!stack) continue;
        const qty = Math.max(1, Math.min(stack.qty, it.qty));
        cleaned.push({ invIndex: it.invIndex, qty });
      }
      sess.items = cleaned;
      sess.zeny = zeny;
      sess.confirmed = false; // any change unlocks
      const partner = this.tradeSessions.get(sess.partnerSid);
      if (partner) partner.confirmed = false;
      // Re-broadcast both sides
      const me2 = me; const partnerSid = sess.partnerSid;
      const partnerPlayer = this.state.players.get(partnerSid);
      const c1 = client;
      const c2 = this.clients.find((c) => c.sessionId === partnerSid);
      c1.send("trade:state" as any, { meItems: sess.items, meZeny: sess.zeny, meConfirmed: sess.confirmed, themItems: partner?.items ?? [], themZeny: partner?.zeny ?? 0, themConfirmed: partner?.confirmed ?? false, partner: partnerPlayer?.name ?? "?" });
      if (c2 && partner) c2.send("trade:state" as any, { meItems: partner.items, meZeny: partner.zeny, meConfirmed: partner.confirmed, themItems: sess.items, themZeny: sess.zeny, themConfirmed: sess.confirmed, partner: me2.name });
    });

    this.onMessage("trade:confirm", (client) => {
      const sess = this.tradeSessions.get(client.sessionId);
      if (!sess) return;
      sess.confirmed = true;
      const partner = this.tradeSessions.get(sess.partnerSid);
      if (!partner) return;
      // Both confirmed → execute trade atomically
      if (sess.confirmed && partner.confirmed) {
        const a = this.state.players.get(client.sessionId);
        const b = this.state.players.get(sess.partnerSid);
        if (!a || !b) { this.cancelTrade(client.sessionId); return; }
        // Validate balances + inventory
        if (a.zeny < sess.zeny || b.zeny < partner.zeny) { this.cancelTrade(client.sessionId); return; }
        // Collect items to transfer (process from highest index)
        function takeFrom(p: Player, list: Array<{ invIndex: number; qty: number }>) {
          const taken: Array<{ itemId: string; qty: number }> = [];
          const sorted = list.slice().sort((x, y) => y.invIndex - x.invIndex);
          for (const it of sorted) {
            const stack = p.inventory[it.invIndex];
            if (!stack || stack.qty < it.qty) throw new Error("invalid");
            taken.push({ itemId: stack.itemId, qty: it.qty });
            stack.qty -= it.qty;
            if (stack.qty <= 0) p.inventory.splice(it.invIndex, 1);
          }
          return taken;
        }
        // Pre-flight: validate inventory caps so we can refuse before
        // mutating either side. INVENTORY_SIZE = 200. After A gives N items
        // away, A's free slots grow by however many stacks fully empty.
        // Conservative check: each player must have room for partner's
        // unique items (assuming no merge).
        const aFreeAfter = (INVENTORY_SIZE - a.inventory.length) + sess.items.length;
        const bFreeAfter = (INVENTORY_SIZE - b.inventory.length) + partner.items.length;
        if (aFreeAfter < partner.items.length || bFreeAfter < sess.items.length) {
          this.cancelTrade(client.sessionId);
          const c1 = this.clients.find((c) => c.sessionId === client.sessionId);
          const c2 = this.clients.find((c) => c.sessionId === sess.partnerSid);
          c1?.send("system", { text: "⚠ ฝั่งใดฝั่งหนึ่งกระเป๋าจะเต็ม — เทรดถูกยกเลิก" });
          c2?.send("system", { text: "⚠ ฝั่งใดฝั่งหนึ่งกระเป๋าจะเต็ม — เทรดถูกยกเลิก" });
          return;
        }
        // Snapshot inventory + zeny in case we need to roll back
        const aSnapshot = a.inventory.map((s) => ({ itemId: s.itemId, qty: s.qty }));
        const bSnapshot = b.inventory.map((s) => ({ itemId: s.itemId, qty: s.qty }));
        const aZenyPre = a.zeny;
        const bZenyPre = b.zeny;
        try {
          const aGives = takeFrom(a, sess.items);
          const bGives = takeFrom(b, partner.items);
          // Items first (so we know if either side overflows)
          for (const it of bGives) {
            if (!this.addToInventory(a, it.itemId, it.qty)) throw new Error("inv-full-a");
          }
          for (const it of aGives) {
            if (!this.addToInventory(b, it.itemId, it.qty)) throw new Error("inv-full-b");
          }
          // Zeny swap only after items succeed
          a.zeny = aZenyPre - sess.zeny + partner.zeny;
          b.zeny = bZenyPre - partner.zeny + sess.zeny;
          const c1 = this.clients.find((c) => c.sessionId === client.sessionId);
          const c2 = this.clients.find((c) => c.sessionId === sess.partnerSid);
          c1?.send("trade:done" as any, {}); c1?.send("system", { text: "✅ เทรดสำเร็จ" });
          c2?.send("trade:done" as any, {}); c2?.send("system", { text: "✅ เทรดสำเร็จ" });
        } catch (err: any) {
          // Roll back both inventories + zeny to pre-trade snapshot
          a.inventory.splice(0, a.inventory.length);
          for (const s of aSnapshot) a.inventory.push({ itemId: s.itemId, qty: s.qty } as any);
          b.inventory.splice(0, b.inventory.length);
          for (const s of bSnapshot) b.inventory.push({ itemId: s.itemId, qty: s.qty } as any);
          a.zeny = aZenyPre; b.zeny = bZenyPre;
          const c1 = this.clients.find((c) => c.sessionId === client.sessionId);
          const c2 = this.clients.find((c) => c.sessionId === sess.partnerSid);
          // Don't leak internal error codes — translate to user-safe message
          const safeMsg = err?.message === "inv-full-a" || err?.message === "inv-full-b"
            ? "กระเป๋าของฝ่ายใดฝั่งหนึ่งเต็ม"
            : "ของไม่พอ หรือสถานะเปลี่ยน";
          console.error("[trade] failed", err);
          c1?.send("system", { text: `⚠ เทรดล้มเหลว: ${safeMsg}` });
          c2?.send("system", { text: `⚠ เทรดล้มเหลว: ${safeMsg}` });
        } finally {
          this.tradeSessions.delete(client.sessionId);
          this.tradeSessions.delete(sess.partnerSid);
        }
      } else {
        // Only one side confirmed — notify
        const c2 = this.clients.find((c) => c.sessionId === sess.partnerSid);
        c2?.send("trade:partner-confirmed" as any, {});
      }
    });

    this.onMessage("trade:cancel", (client) => this.cancelTrade(client.sessionId));

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
    // Restore daily challenge state (only if today's date matches)
    try {
      const daily = JSON.parse((c as any).dailyJson || "{}");
      const today = new Date().toISOString().slice(0, 10);
      if (daily.date === today) {
        this.dailyState.set(client.sessionId, {
          date: daily.date,
          kills: daily.kills | 0,
          harvest: daily.harvest | 0,
          rewards: new Set(daily.rewards ?? []),
        });
      }
    } catch {}
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
      for (const it of reward.items) this.addToInventoryOrMail(p, it.id, it.qty, "DAILY_LOGIN");
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
    this.partyInvites.delete(sid);
    // Additional session-keyed maps (memory leak prevention)
    this.sessionToCharId.delete(sid);
    this.dailyState.delete(sid);
    this.fishingState.delete(sid);
    this.tradeSessions.delete(sid);
    this.botIds.delete(sid);
    this.botState.delete(sid);
    this.rateLimitBuckets.delete(sid);
    // Prune compound-keyed maps that include this session
    for (const k of this.tameProgress.keys()) if (k.startsWith(sid + ":")) this.tameProgress.delete(k);
    for (const k of this.statusTickAcc.keys()) if (k.startsWith(sid + ":")) this.statusTickAcc.delete(k);
    // Remove party invites SENT BY this player to others
    for (const [toSid, fromSid] of this.partyInvites.entries()) {
      if (fromSid === sid) this.partyInvites.delete(toSid);
    }
  }

  // ---------- party ----------
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
    if (this.playerParty.get(target.sessionId)) return; // already in party
    this.partyInvites.set(target.sessionId, client.sessionId);
    target.send("partyInvite", { fromId: inviter.id, fromName: inviter.name });
  }

  handlePartyAccept(client: Client, fromId: string) {
    const sid = client.sessionId;
    const invFrom = this.partyInvites.get(sid);
    if (!invFrom) return;
    // resolve inviter sid from fromId (id == sessionId in our schema)
    let inviterSid = "";
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (p?.id === fromId) { inviterSid = c.sessionId; break; }
    }
    if (!inviterSid || inviterSid !== invFrom) return;
    this.partyInvites.delete(sid);
    // get or create party for inviter
    let pid = this.playerParty.get(inviterSid);
    if (!pid) {
      pid = `party_${Math.random().toString(36).slice(2, 8)}`;
      this.parties.set(pid, new Set([inviterSid]));
      this.playerParty.set(inviterSid, pid);
    }
    const party = this.parties.get(pid)!;
    if (party.size >= 4) return; // max 4
    party.add(sid);
    this.playerParty.set(sid, pid);
    this.broadcastPartyUpdate(pid);
  }

  handlePartyLeave(sid: string) {
    const pid = this.playerParty.get(sid);
    if (!pid) return;
    const party = this.parties.get(pid);
    party?.delete(sid);
    this.playerParty.delete(sid);
    const leaver = this.clients.find((c) => c.sessionId === sid);
    leaver?.send("partyUpdate", { leaderId: "", members: [] });
    if (!party || party.size <= 1) {
      // disband
      if (party) for (const m of party) {
        this.playerParty.delete(m);
        const c = this.clients.find((c) => c.sessionId === m);
        c?.send("partyUpdate", { leaderId: "", members: [] });
      }
      this.parties.delete(pid);
    } else {
      this.broadcastPartyUpdate(pid);
    }
  }

  broadcastPartyUpdate(pid: string) {
    const party = this.parties.get(pid);
    if (!party) return;
    const leaderSid = party.values().next().value as string;
    const leader = this.state.players.get(leaderSid);
    const members = Array.from(party).map((sid) => {
      const p = this.state.players.get(sid);
      return p ? { id: p.id, name: p.name, hp: p.hp, maxHp: p.maxHp, level: p.level } : null;
    }).filter(Boolean);
    for (const sid of party) {
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
      dailyJson: JSON.stringify(this.serializedDailyState(p.id)),
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
    const q = QUESTS[questId];
    const p = this.state.players.get(client.sessionId);
    const qs = this.playerQuests.get(client.sessionId);
    if (!q || !p || !qs) return;
    if (qs.active[questId] !== undefined) return;
    if (qs.completed.includes(questId)) return;
    if (p.level < q.minLevel) return;
    qs.active[questId] = 0;
    // pre-fill collect progress
    if (q.objective.kind === "collect") {
      qs.active[questId] = countItem(p, q.objective.itemId);
    }
    client.send("questUpdate", qs);
  }

  handleQuestTurnIn(client: Client, questId: string) {
    const q = QUESTS[questId];
    const p = this.state.players.get(client.sessionId);
    const qs = this.playerQuests.get(client.sessionId);
    if (!q || !p || !qs) return;
    const prog = qs.active[questId];
    if (prog === undefined) return;
    const goal = q.objective.kind === "kill" ? q.objective.count : q.objective.count;
    let progress = prog;
    if (q.objective.kind === "collect") progress = countItem(p, q.objective.itemId);
    if (progress < goal) return;
    // remove collected items
    if (q.objective.kind === "collect") {
      removeItem(p, q.objective.itemId, q.objective.count);
    }
    // grant reward
    p.zeny += q.reward.zeny;
    this.grantExp(p, q.reward.exp);
    if (q.reward.itemId && q.reward.qty) {
      this.addToInventoryOrMail(p, q.reward.itemId, q.reward.qty, "QUEST");
    }
    delete qs.active[questId];
    if (!qs.completed.includes(questId)) qs.completed.push(questId);
    client.send("questReward", { questId, ...q.reward });
    // Quest chain: if this quest has a `next`, auto-start it.
    const nextId = (q as any).next as string | undefined;
    if (nextId && QUESTS[nextId] && !qs.completed.includes(nextId) && !(nextId in qs.active)) {
      qs.active[nextId] = 0;
      client.send("system", { text: `📜 เควสต์ใหม่: ${QUESTS[nextId].title}` });
    }
    client.send("questUpdate", qs);
  }

  onMonsterKilled(killerSid: string, monsterKind: string) {
    const qs = this.playerQuests.get(killerSid);
    if (!qs) return;
    let dirty = false;
    for (const questId of Object.keys(qs.active)) {
      const q = QUESTS[questId];
      if (!q || q.objective.kind !== "kill") continue;
      if (q.objective.monster !== monsterKind) continue;
      if (qs.active[questId] < q.objective.count) {
        qs.active[questId] += 1;
        dirty = true;
      }
    }
    if (dirty) {
      const client = this.clients.find((c) => c.sessionId === killerSid);
      client?.send("questUpdate", qs);
    }
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

  /** Serialize daily state to a plain JSON-safe object (Sets become arrays). */
  serializedDailyState(sid: string) {
    const st = this.dailyState.get(sid);
    if (!st) return {};
    return { date: st.date, kills: st.kills, harvest: st.harvest, rewards: Array.from(st.rewards) };
  }

  /** True if a player with this name is currently connected to the room. */
  isOnline(name: string): boolean {
    for (const [, p] of this.state.players) if (p.name === name) return true;
    return false;
  }

  handleAttack(attackerId: string, targetId: string) {
    const attacker = this.state.players.get(attackerId);
    if (!attacker || attacker.dead) return;
    const d = derived({ str: attacker.str, agi: attacker.agi, vit: attacker.vit, int: attacker.int, dex: attacker.dex, luk: attacker.luk }, attacker.level);
    const cooldown = GAME_CONFIG.ATTACK_COOLDOWN_MS * d.aspdMult;
    const now = Date.now();
    const last = this.lastAttack.get(attackerId) ?? 0;
    if (now - last < cooldown) return;

    const target = this.state.monsters.get(targetId);
    if (!target || target.dead) return;
    // Bots may NEVER damage resource nodes or passive animals — gathering is for humans only.
    if (this.botIds.has(attackerId)) {
      const tcfg = (MONSTERS as any)[target.kind];
      if (!tcfg || tcfg.aggroRange <= 0) return;
    }
    const dx = target.pos.x - attacker.pos.x;
    const dz = target.pos.z - attacker.pos.z;
    // Ranged jobs (mage, archer, sniper, wizard) use a longer auto-attack
    // range — basic shot/bolt is free (no MP), just slower than skills.
    const RANGED_JOBS = new Set(["mage", "archer", "sniper", "wizard"]);
    const isRangedJob = RANGED_JOBS.has(attacker.job);
    const attackReach = isRangedJob ? 8 : GAME_CONFIG.ATTACK_RANGE + 0.5;
    if (Math.hypot(dx, dz) > attackReach) return;

    this.lastAttack.set(attackerId, now);
    // hit roll vs flee — thirsty/hungry players have worse accuracy
    const flee = 5 + Math.floor(MONSTERS[target.kind as MonsterKind].speed * 2);
    let hitChance = Math.max(0.05, Math.min(0.99, 0.8 + (d.hit - flee) * 0.03));
    if (attacker.thirst <= 0) hitChance *= 0.55;   // see double, miss a lot
    else if (attacker.thirst < 25) hitChance *= 0.85;
    if (attacker.hunger <= 0) hitChance *= 0.75;
    if (Math.random() > hitChance) {
      this.broadcast("damage", { targetId: target.id, amount: 0, from: attacker.id });
      return;
    }
    const isCrit = Math.random() * 100 < d.crit;
    let dmg = attacker.atk + d.atkBonus;
    if (attacker.hunger < 25) dmg = Math.floor(dmg * 0.85);
    if (attacker.hunger <= 0) dmg = Math.floor(dmg * 0.65);   // weak from hunger
    // Tool bonus: axe vs wood, pickaxe vs stone
    if (attacker.weapon === "wood_axe" && target.kind === "tree_node") dmg = Math.floor(dmg * 3);
    if (attacker.weapon === "iron_pickaxe" && (target.kind === "rock_node" || target.kind === "ore_node" || target.kind === "crystal_node")) dmg = Math.floor(dmg * 3);
    if (isCrit) dmg = Math.floor(dmg * 2);
    this.dealDamageToMonster(target, attacker, dmg, isCrit);
  }

  handleSkill(attackerId: string, skillId: string, targetId?: string) {
    const attacker = this.state.players.get(attackerId);
    if (!attacker || attacker.dead) return;
    if (this.isStunned(attacker)) return;
    const job = JOBS[attacker.job as JobId];
    const skill = job.skills.find((s) => s.id === skillId);
    if (!skill) return;
    if (attacker.mp < skill.manaCost) return;
    const key = attackerId + ":" + skillId;
    const now = Date.now();
    const last = this.lastSkill.get(key) ?? 0;
    if (now - last < skill.cooldownMs) return;

    // Self-targeting heal
    if (skill.healMult && skill.range === 0) {
      this.lastSkill.set(key, now);
      attacker.mp = Math.max(0, attacker.mp - skill.manaCost);
      this.broadcast("skillCast", { skillId: skill.id, fromId: attacker.id, tx: attacker.pos.x, tz: attacker.pos.z, aoeRadius: 0 });
      const heal = Math.floor(attacker.atk * (skill.healMult ?? 1) + 10);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      this.broadcast("damage", { targetId: attacker.id, amount: heal, from: attacker.id, heal: true });
      if (skill.selfStatus) this.applyStatusToPlayer(attacker, skill.selfStatus.kind as StatusKind, skill.selfStatus.durationMs);
      return;
    }

    if (!targetId) return;
    const target = this.state.monsters.get(targetId);
    if (!target || target.dead) return;
    const dx = target.pos.x - attacker.pos.x;
    const dz = target.pos.z - attacker.pos.z;
    if (Math.hypot(dx, dz) > skill.range + 0.5) return;

    this.lastSkill.set(key, now);
    attacker.mp = Math.max(0, attacker.mp - skill.manaCost);
    this.broadcast("skillCast", { skillId: skill.id, fromId: attacker.id, tx: target.pos.x, tz: target.pos.z, aoeRadius: skill.aoeRadius ?? 0 });

    const dmg = Math.max(1, Math.floor(attacker.atk * skill.damageMult));
    this.dealDamageToMonster(target, attacker, dmg);
    if (skill.status && (skill.status.chance ?? 1) > Math.random()) {
      this.applyStatusToMonster(target, skill.status.kind as StatusKind, skill.status.durationMs);
    }
    if (skill.selfStatus) this.applyStatusToPlayer(attacker, skill.selfStatus.kind as StatusKind, skill.selfStatus.durationMs);

    if (skill.aoeRadius) {
      for (const [, m] of this.state.monsters) {
        if (m.id === target.id || m.dead) continue;
        if (Math.hypot(m.pos.x - target.pos.x, m.pos.z - target.pos.z) <= skill.aoeRadius) {
          this.dealDamageToMonster(m, attacker, Math.floor(dmg * 0.7));
          if (skill.status && (skill.status.chance ?? 1) > Math.random()) {
            this.applyStatusToMonster(m, skill.status.kind as StatusKind, skill.status.durationMs);
          }
        }
      }
    }
  }

  // ---------- status effects ----------
  isStunned(p: Player | Monster): boolean {
    const now = Date.now();
    for (const s of p.statuses.values()) {
      if (s.endAt > now && STATUS_DEFS[s.kind as StatusKind]?.preventAction) return true;
    }
    return false;
  }

  speedMultOf(p: Player | Monster): number {
    let mult = 1;
    const now = Date.now();
    for (const s of p.statuses.values()) {
      if (s.endAt <= now) continue;
      const def = STATUS_DEFS[s.kind as StatusKind];
      if (def?.speedMult !== undefined) mult *= def.speedMult;
    }
    // Mount bonus: +30% speed when riding a pet
    if ("mounted" in p && (p as any).mounted) mult *= 1.3;
    // Hunger penalty: -25% when hungry
    if ("hunger" in p && (p as any).hunger < 25) mult *= 0.75;
    return mult;
  }

  applyStatusToMonster(m: Monster, kind: StatusKind, durationMs: number, fromId = "") {
    const existing = m.statuses.find((s) => s.kind === kind);
    const endAt = Date.now() + durationMs;
    if (existing) { existing.endAt = Math.max(existing.endAt, endAt); existing.fromId = fromId; return; }
    const eff = new StatusEffect();
    eff.kind = kind; eff.endAt = endAt; eff.fromId = fromId;
    m.statuses.push(eff);
  }

  applyStatusToPlayer(p: Player, kind: StatusKind, durationMs: number, fromId = "") {
    const existing = p.statuses.find((s) => s.kind === kind);
    const endAt = Date.now() + durationMs;
    if (existing) { existing.endAt = Math.max(existing.endAt, endAt); existing.fromId = fromId; return; }
    const eff = new StatusEffect();
    eff.kind = kind; eff.endAt = endAt; eff.fromId = fromId;
    p.statuses.push(eff);
  }

  tickStatuses() {
    const now = Date.now();
    // players
    for (const [sid, p] of this.state.players) {
      for (let i = p.statuses.length - 1; i >= 0; i--) {
        const s = p.statuses[i];
        if (s.endAt <= now) { p.statuses.splice(i, 1); continue; }
        const def = STATUS_DEFS[s.kind as StatusKind];
        if (!def?.tickMs || def.tickDmg === undefined) continue;
        const key = sid + ":" + s.kind;
        const last = this.statusTickAcc.get(key) ?? now;
        if (now - last >= def.tickMs) {
          this.statusTickAcc.set(key, now);
          if (def.tickDmg > 0) {
            p.hp = Math.max(0, p.hp - def.tickDmg);
            this.broadcast("damage", { targetId: p.id, amount: def.tickDmg, from: s.fromId || s.kind });
            if (p.hp === 0 && !p.dead) {
              p.dead = true;
              this.clock.setTimeout(() => {
                const pp = this.state.players.get(sid);
                if (!pp) return;
                pp.hp = pp.maxHp; pp.dead = false;
                if (pp.houseSlot >= 0 && pp.houseSlot < HOUSE_SLOTS.length) {
                  const h = HOUSE_SLOTS[pp.houseSlot];
                  pp.pos.x = h.x; pp.pos.z = h.z;
                } else { pp.pos.x = 0; pp.pos.z = 0; }
                pp.statuses.clear();
              }, GAME_CONFIG.RESPAWN_MS);
            }
          } else {
            p.hp = Math.min(p.maxHp, p.hp - def.tickDmg); // negative = heal
            this.broadcast("damage", { targetId: p.id, amount: -def.tickDmg, from: s.fromId || s.kind, heal: true });
          }
        }
      }
    }
    // monsters
    for (const [, m] of this.state.monsters) {
      for (let i = m.statuses.length - 1; i >= 0; i--) {
        const s = m.statuses[i];
        if (s.endAt <= now) { m.statuses.splice(i, 1); continue; }
        const def = STATUS_DEFS[s.kind as StatusKind];
        if (!def?.tickMs || def.tickDmg === undefined || def.tickDmg <= 0) continue;
        const key = m.id + ":" + s.kind;
        const last = this.statusTickAcc.get(key) ?? now;
        if (now - last >= def.tickMs) {
          this.statusTickAcc.set(key, now);
          m.hp = Math.max(0, m.hp - def.tickDmg);
          this.broadcast("damage", { targetId: m.id, amount: def.tickDmg, from: s.fromId || s.kind });
          if (m.hp === 0 && !m.dead) {
            m.dead = true;
            m.statuses.clear();
            const killer = this.state.players.get(s.fromId);
            if (killer) {
              const mdef = MONSTERS[m.kind as MonsterKind];
              this.grantExp(killer, mdef.exp);
              this.onMonsterKilled(killer.id, m.kind);
            }
            this.dropLoot(m);
            const spawn = this.monsterSpawn.get(m.id);
            this.clock.setTimeout(() => {
              const mon = this.state.monsters.get(m.id);
              if (!mon || !spawn) return;
              const md = MONSTERS[spawn.kind];
              mon.hp = md.hp; mon.maxHp = md.hp; mon.dead = false;
              mon.pos.x = spawn.x; mon.pos.z = spawn.z; mon.targetId = "";
              mon.statuses.clear();
            }, GAME_CONFIG.RESPAWN_MS);
          }
        }
      }
    }
  }

  dealDamageToMonster(target: Monster, attacker: Player, dmg: number, crit = false) {
    target.hp = Math.max(0, target.hp - dmg);
    target.targetId = attacker.id;
    this.broadcast("damage", { targetId: target.id, amount: dmg, from: attacker.id, crit });
    if (target.hp === 0 && !target.dead) {
      target.dead = true;
      const def = MONSTERS[target.kind as MonsterKind];
      this.grantExp(attacker, def.exp);
      this.onMonsterKilled(attacker.id, target.kind);
      // Achievement tracking
      const sid = attacker.id;
      const tcfg = (MONSTERS as any)[target.kind];
      if (tcfg?.aggroRange > 0) {
        this.bumpAchievement(sid, "kills");
        this.bumpDailyChallenge(sid, "kills");
      }
      if (target.kind === "tree_node") { this.bumpAchievement(sid, "trees"); this.bumpDailyChallenge(sid, "harvest"); }
      if (target.kind === "rock_node" || target.kind === "ore_node" || target.kind === "crystal_node") { this.bumpAchievement(sid, "rocks"); this.bumpDailyChallenge(sid, "harvest"); }
      if (target.kind === "darklord") this.bumpAchievement(sid, "darklord");
      this.dropLoot(target);
      const spawn = this.monsterSpawn.get(target.id);
      const delay = spawn?.kind === "darklord" ? GAME_CONFIG.BOSS_RESPAWN_MS : GAME_CONFIG.RESPAWN_MS;
      this.clock.setTimeout(() => {
        const mon = this.state.monsters.get(target.id);
        if (!mon || !spawn) return;
        const md = MONSTERS[spawn.kind];
        mon.hp = md.hp; mon.maxHp = md.hp; mon.dead = false;
        mon.pos.x = spawn.x; mon.pos.z = spawn.z; mon.targetId = "";
      }, delay);
    }
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

  // ── Daily challenge tracker (in-memory per session — resets on day change).
  // Goals: kill 20 mobs → 300z + 5 HP potion. Harvest 15 nodes → 200z + 5 MP potion.
  // (Buffed in v2 — dailies should beat passive farming, not match it.)
  bumpDailyChallenge(sid: string, kind: "kills" | "harvest", by = 1) {
    const p = this.state.players.get(sid);
    if (!p || this.botIds.has(sid)) return;
    const today = new Date().toISOString().slice(0, 10);
    let st = this.dailyState.get(sid);
    if (!st || st.date !== today) {
      st = { date: today, kills: 0, harvest: 0, rewards: new Set() };
      this.dailyState.set(sid, st);
    }
    if (kind === "kills") st.kills += by;
    if (kind === "harvest") st.harvest += by;
    if (st.kills >= 20 && !st.rewards.has("kills")) {
      st.rewards.add("kills");
      p.zeny += 300;
      this.addToInventory(p, "hp_potion", 5);
      const c = this.clients.find((cl) => cl.sessionId === sid);
      c?.send("system", { text: "🏆 Daily: ฆ่ามอน 20 ตัวสำเร็จ! +300z +5 HP Potion" });
    }
    if (st.harvest >= 15 && !st.rewards.has("harvest")) {
      st.rewards.add("harvest");
      p.zeny += 200;
      this.addToInventory(p, "mp_potion", 5);
      const c = this.clients.find((cl) => cl.sessionId === sid);
      c?.send("system", { text: "🏆 Daily: เก็บ 15 ทรัพยากร! +200z +5 MP Potion" });
    }
  }

  bumpAchievement(sid: string, counter: string, by = 1) {
    const p = this.state.players.get(sid);
    if (!p) return;
    // Weekly leaderboard contribution (skip bots)
    if (!this.botIds.has(sid)) {
      const pts = counter === "kills" ? 3 : counter === "darklord" ? 100 : 1;
      recordContribution(p.name, pts * by, counter === "kills" ? by : 0, p.level);
    }
    let prog: AchievementProgress;
    try { prog = JSON.parse(p.achievementsJson || "{}"); } catch { prog = emptyAchievementProgress(); }
    if (!prog.counters) prog.counters = {};
    if (!prog.unlocked) prog.unlocked = [];
    prog.counters[counter] = (prog.counters[counter] ?? 0) + by;
    // Check for newly unlocked
    for (const def of ACHIEVEMENTS) {
      if (def.counter !== counter) continue;
      if (prog.unlocked.includes(def.id)) continue;
      if ((prog.counters[counter] ?? 0) >= def.goal) {
        prog.unlocked.push(def.id);
        const client = this.clients.find((c) => c.sessionId === sid);
        client?.send("system", { text: `🏅 ปลดล็อก: ${def.icon} ${def.name}` });
        if (def.reward) {
          if (def.reward.zeny) p.zeny += def.reward.zeny;
          if (def.reward.itemId) this.addToInventory(p, def.reward.itemId, def.reward.qty ?? 1);
        }
      }
    }
    p.achievementsJson = JSON.stringify(prog);
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
    const p = this.state.players.get(sid);
    const g = this.state.drops.get(dropId);
    if (!p || !g) return;
    if (Math.hypot(p.pos.x - g.pos.x, p.pos.z - g.pos.z) > 2.5) return;
    if (!this.addToInventory(p, g.itemId, g.qty)) {
      // Inventory full — tell the player (throttled by client-side spam by checking last time)
      const client = this.clients.find((c) => c.sessionId === sid);
      // Throttle inv-full messages via map key
      const key = "invfull:" + sid;
      const last = this.lastAttack.get(key) ?? 0;
      const now = Date.now();
      if (now - last > 3000 && client && !this.botIds.has(sid)) {
        this.lastAttack.set(key, now);
        client.send("system", { text: "🎒 กระเป๋าเต็ม — ใช้/ขาย/ทิ้งของบางอย่างก่อน" });
      }
      return;
    }
    this.state.drops.delete(dropId);
  }

  /**
   * Token-bucket rate limiter. Returns true if action is allowed.
   * `key` is a bucket name (e.g., "chat", "trade-invite"). Independent per client.
   */
  checkRateLimit(sid: string, key: string, maxEvents: number, windowMs: number): boolean {
    let buckets = this.rateLimitBuckets.get(sid);
    if (!buckets) { buckets = new Map(); this.rateLimitBuckets.set(sid, buckets); }
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) { bucket = []; buckets.set(key, bucket); }
    // Drop timestamps outside the window
    while (bucket.length > 0 && bucket[0] < now - windowMs) bucket.shift();
    if (bucket.length >= maxEvents) return false;
    bucket.push(now);
    return true;
  }

  /** Add items, falling back to mail delivery if inventory is full. Reward paths use this. */
  async addToInventoryOrMail(p: Player, itemId: string, qty: number, source = "REWARD") {
    if (this.addToInventory(p, itemId, qty)) return;
    // Inventory full — mail it instead
    try {
      await prisma.mail.create({
        data: {
          toName: p.name, fromName: source,
          subject: `${itemId} ×${qty}`,
          body: `กระเป๋าเต็ม — รางวัลถูกส่งไปไว้ในจดหมาย`,
          zeny: 0, itemId, itemQty: qty,
        },
      });
      const cli = this.clients.find((c) => c.sessionId === p.id);
      cli?.send("system", { text: `📬 ${itemId} ×${qty} ส่งเป็นจดหมาย (กระเป๋าเต็ม)` });
    } catch (e) {
      console.error("[addToInventoryOrMail] mail failed", e);
    }
  }

  addToInventory(p: Player, itemId: string, qty: number): boolean {
    const def = ITEMS[itemId];
    if (!def) return false;
    const stackable = (def.stack ?? 1) > 1;
    if (stackable) {
      for (const s of p.inventory.values()) {
        if (s.itemId === itemId && s.qty < (def.stack ?? 1)) {
          const room = (def.stack ?? 1) - s.qty;
          const add = Math.min(room, qty);
          s.qty += add;
          qty -= add;
          if (qty <= 0) return true;
        }
      }
    }
    while (qty > 0) {
      if (p.inventory.length >= INVENTORY_SIZE) return false;
      const stack = new ItemStack();
      stack.itemId = itemId;
      stack.qty = stackable ? Math.min(qty, def.stack ?? 1) : 1;
      p.inventory.push(stack);
      qty -= stack.qty;
    }
    return true;
  }

  handleEquip(sid: string, invIndex: number) {
    const p = this.state.players.get(sid);
    if (!p) return;
    if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return;
    const stack = p.inventory[invIndex];
    if (!stack) return;
    const def = ITEMS[stack.itemId];
    if (!def) return;
    if (def.slot !== "weapon" && def.slot !== "armor") return;
    const slot = def.slot;
    const prevId = slot === "weapon" ? p.weapon : p.armor;
    if (slot === "weapon") p.weapon = stack.itemId;
    else p.armor = stack.itemId;
    // remove from inventory
    p.inventory.splice(invIndex, 1);
    // put previous back
    if (prevId) this.addToInventory(p, prevId, 1);
    this.recalcStats(p);
  }

  handleUnequip(sid: string, slot: "weapon" | "armor") {
    const p = this.state.players.get(sid);
    if (!p) return;
    const id = slot === "weapon" ? p.weapon : p.armor;
    if (!id) return;
    if (!this.addToInventory(p, id, 1)) return; // inventory full
    if (slot === "weapon") p.weapon = "";
    else p.armor = "";
    this.recalcStats(p);
  }

  handleUseItem(sid: string, invIndex: number) {
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return;
    const stack = p.inventory[invIndex];
    if (!stack) return;
    const def = ITEMS[stack.itemId];
    if (!def) return;
    if (def.slot !== "consumable") return;
    if (def.hpRestore) p.hp = Math.min(p.maxHp, p.hp + def.hpRestore);
    if (def.mpRestore) p.mp = Math.min(p.maxMp, p.mp + def.mpRestore);
    if (def.hungerRestore) p.hunger = Math.min(100, p.hunger + def.hungerRestore);
    if (def.thirstRestore) p.thirst = Math.min(100, p.thirst + def.thirstRestore);
    if (def.staminaRestore) p.stamina = Math.min(p.maxStamina, p.stamina + def.staminaRestore);
    // Gacha box: roll random cosmetic / useful drop
    if (stack.itemId === "gacha_box") {
      const rolls = [
        { id: "hp_potion", qty: 10, weight: 30 },
        { id: "cooked_meat", qty: 5, weight: 20 },
        { id: "energy_tonic", qty: 3, weight: 15 },
        { id: "wood_log", qty: 20, weight: 15 },
        { id: "stone_chunk", qty: 15, weight: 12 },
        { id: "iron_sword", qty: 1, weight: 4 },
        { id: "leather_armor", qty: 1, weight: 4 },
        { id: "glider", qty: 1, weight: 1 }, // rare!
        { id: "blade_of_dawn", qty: 1, weight: 0.5 },
        { id: "dragon_plate", qty: 1, weight: 0.5 },
      ];
      const total = rolls.reduce((a, r) => a + r.weight, 0);
      let r = Math.random() * total;
      const sid = (p as any).id;
      const cli = this.clients.find((c) => c.sessionId === sid);
      for (const roll of rolls) {
        r -= roll.weight;
        if (r <= 0) {
          this.addToInventory(p, roll.id, roll.qty);
          const idef = ITEMS[roll.id];
          cli?.send("system", { text: `🎁 ได้ ${idef?.icon ?? ""} ${idef?.name ?? roll.id} ×${roll.qty}!` });
          break;
        }
      }
    }
    stack.qty -= 1;
    if (stack.qty <= 0) p.inventory.splice(invIndex, 1);
  }

  handleDrop(sid: string, invIndex: number, qty?: number) {
    const p = this.state.players.get(sid);
    if (!p) return;
    if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return;
    const stack = p.inventory[invIndex];
    if (!stack) return;
    const dropQty = Math.max(1, Math.min(stack.qty, qty ?? stack.qty));
    this.spawnGroundItem(stack.itemId, dropQty, p.pos.x + (Math.random() - 0.5), p.pos.z + (Math.random() - 0.5));
    stack.qty -= dropQty;
    if (stack.qty <= 0) p.inventory.splice(invIndex, 1);
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
    const pid = this.playerParty.get(p.id);
    const recipients: Player[] = [p];
    if (pid) {
      const party = this.parties.get(pid);
      if (party) {
        for (const sid of party) {
          if (sid === p.id) continue;
          const m = this.state.players.get(sid);
          if (!m || m.dead) continue;
          if (Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 30) recipients.push(m);
        }
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
    let mult = 1;
    if (this.state.mapId === "dungeon") {
      const realPlayers = this.state.players.size - this.botIds.size;
      mult *= Math.max(1, 1 + (realPlayers - 1) * 0.4); // +40% HP per extra player
    }
    // Weekly raid: Saturday → darklord HP × 2
    if (kind === "darklord" && new Date().getDay() === 6) mult *= 2;
    return mult;
  }

  // Periodic chunk-aware spawner: every 8 seconds, look at chunks around all
  // active (non-bot) players. If a chunk has fewer than CHUNK_MOB_CAP mobs,
  // try to spawn 1 mob inside it. Mobs far from any player are despawned.
  // Also: night doubles spawn pressure; spawn area (origin) stays mob-free.
  tickChunkSpawns(dt: number) {
    if (this.state.mapId !== "field") return;
    this.chunkSpawnAcc += dt;
    if (this.chunkSpawnAcc < 8) return;
    this.chunkSpawnAcc = 0;

    const CHUNK_SIZE = 32;
    const SPAWN_RADIUS = 18;
    const PLAYER_RADIUS = 60;          // spawn within this distance of any player
    const DESPAWN_RADIUS = 120;        // mobs further than this from all players despawn
    const CHUNK_MOB_CAP = 3;           // max mobs per chunk
    const isNight = this.state.isNight;

    // Live player positions (real humans only — bots don't anchor spawns)
    const anchors: Array<{ x: number; z: number }> = [];
    for (const [sid, p] of this.state.players) {
      if (this.botIds.has(sid)) continue;
      anchors.push({ x: p.pos.x, z: p.pos.z });
    }
    if (anchors.length === 0) return;

    // Despawn distant mobs
    for (const [id, m] of this.state.monsters) {
      if (m.dead) continue;
      // Resource nodes are persistent — never despawn
      const cfg = (MONSTERS as any)[m.kind];
      if (!cfg || cfg.aggroRange === -2) continue;
      let nearest = Infinity;
      for (const a of anchors) nearest = Math.min(nearest, Math.hypot(m.pos.x - a.x, m.pos.z - a.z));
      if (nearest > DESPAWN_RADIUS) {
        this.state.monsters.delete(id);
        // Clean up per-monster session state to prevent leaks
        this.lastAttack.delete(id);
        this.monsterSpawn.delete(id);
        for (const k of this.statusTickAcc.keys()) if (k.endsWith(":" + id)) this.statusTickAcc.delete(k);
        for (const k of this.tameProgress.keys()) if (k.endsWith(":" + id)) this.tameProgress.delete(k);
      }
    }

    // Count mobs per chunk
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

    // Per-biome spawn tables. Distance from origin scales danger.
    const TABLES: Record<string, { day: string[]; night: string[] }> = {
      plains:  { day: ["slime", "slime", "wolf", "fox"],     night: ["wolf", "wolf", "fox", "slime"] },
      forest:  { day: ["spider", "boar", "wolf", "slime"],   night: ["spider", "spider", "wolf", "bat"] },
      desert:  { day: ["scorpion", "scorpion", "slime"],     night: ["scorpion", "ghost", "bat"] },
      snow:    { day: ["yeti", "wolf", "wolf"],              night: ["yeti", "wolf", "ghost"] },
      swamp:   { day: ["spider", "orc", "slime"],            night: ["spider", "ghost", "ghost"] },
    };
    function biomeAtServer(x: number, z: number): keyof typeof TABLES {
      // Mirror chunkWorld.getBiome simplified — same noise classification.
      // Since server doesn't import client code, use coarse banding by xz.
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
      // Random point inside the chunk
      const sx = (cx + Math.random()) * CHUNK_SIZE;
      const sz = (cz + Math.random()) * CHUNK_SIZE;
      // Keep spawn area clear
      if (Math.hypot(sx, sz) < SPAWN_RADIUS + 4) continue;
      const biome = biomeAtServer(sx, sz);
      const tbl = TABLES[biome];
      const arr = isNight ? tbl.night : tbl.day;
      const kind = arr[Math.floor(Math.random() * arr.length)] as MonsterKind;
      // Only spawn occasionally — keeps density low and feels natural
      if (Math.random() < 0.35) this.spawnMonster(kind, sx, sz);
    }

    // ── Procedural resource nodes: each chunk gets a few harvestable
    //    tree/rock/berry_bush nodes, one-time spawn. They auto-respawn via
    //    the monsterSpawn map after RESPAWN_MS just like init resources.
    for (const k of candidates) {
      if (this.spawnedResourceChunks.has(k)) continue;
      const [cx, cz] = k.split(",").map(Number);
      const chunkCx = (cx + 0.5) * CHUNK_SIZE;
      const chunkCz = (cz + 0.5) * CHUNK_SIZE;
      const distToOrigin = Math.hypot(chunkCx, chunkCz);
      if (distToOrigin < SPAWN_RADIUS + 6) { this.spawnedResourceChunks.add(k); continue; }
      // 2-4 nodes per chunk depending on biome
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

    // ── Procedural treasure chests: spawn once per chunk for chunks beyond
    //    the spawn radius. Better loot the further the chunk is from origin.
    for (const k of candidates) {
      if (this.spawnedChestChunks.has(k)) continue;
      const [cx, cz] = k.split(",").map(Number);
      const chunkCx = (cx + 0.5) * CHUNK_SIZE;
      const chunkCz = (cz + 0.5) * CHUNK_SIZE;
      const distToOrigin = Math.hypot(chunkCx, chunkCz);
      if (distToOrigin < SPAWN_RADIUS + 20) { this.spawnedChestChunks.add(k); continue; }
      // 1/12 chance per chunk
      if (Math.random() > 1 / 12) { this.spawnedChestChunks.add(k); continue; }
      const sx = (cx + 0.2 + Math.random() * 0.6) * CHUNK_SIZE;
      const sz = (cz + 0.2 + Math.random() * 0.6) * CHUNK_SIZE;
      const tier = Math.min(3, Math.floor(distToOrigin / 80));
      const loot = ["hp_potion", "mp_potion", tier > 0 ? "iron_sword" : "wood_sword", tier > 1 ? "crystal" : "wood"];
      const item = loot[Math.floor(Math.random() * loot.length)];
      const qty = tier > 0 ? 2 + Math.floor(Math.random() * 3) : 1;
      this.spawnGroundItem(item, qty, sx, sz);
      this.spawnedChestChunks.add(k);
    }
  }

  spawnMonster(kind: MonsterKind, x: number, z: number) {
    const def = MONSTERS[kind];
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

      let nearest: Player | null = null;
      let nearestD = Infinity;
      for (const [, p] of this.state.players) {
        if (p.dead) continue;
        const d = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
        // Terrain LOS proxy: if estimated heights differ by more than 3m,
        // assume cliff blocks line-of-sight and don't aggro. Uses the same
        // coarse trig-noise as biome classification — cheap, deterministic.
        const heightDiff = Math.abs(estimateHeight(p.pos.x, p.pos.z) - estimateHeight(m.pos.x, m.pos.z));
        if (heightDiff > 3) continue;
        if (d < nearestD) { nearestD = d; nearest = p; }
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
