/**
 * HousingService — house building. Extracted from WorldRoom.ts.
 */
import { type Player, NPCS, HOUSE_SLOTS, HOUSE_COST } from "@game/shared";
import { countItem, removeItem } from "./Inventory.js";
import type { Client } from "@colyseus/core";

export class HousingService {
  constructor(
    private state: { players: Map<string, Player>; mapId: string },
    private removeItemFromPlayer: (p: Player, itemId: string, qty: number) => void,
    private bumpAchievement: (sid: string, counter: string, by?: number) => void,
  ) {}

  handleBuildHouse(client: Client) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (p.houseSlot >= 0) { client.send("system", { text: "คุณมีบ้านอยู่แล้ว" }); return; }
    // Must be near carpenter NPC
    const carp = NPCS.find((n) => n.id === "carpenter_field");
    if (!carp || carp.mapId !== this.state.mapId) { client.send("system", { text: "ไม่พบช่างไม้ที่นี่" }); return; }
    if (Math.hypot(p.pos.x - carp.x, p.pos.z - carp.z) > 4) { client.send("system", { text: "เข้าใกล้ช่างไม้ก่อน" }); return; }
    // Check resources
    if (countItem(p, "wood_log") < HOUSE_COST.wood_log) { client.send("system", { text: `ขาดไม้ ${HOUSE_COST.wood_log} ท่อน` }); return; }
    if (countItem(p, "stone_chunk") < HOUSE_COST.stone_chunk) { client.send("system", { text: `ขาดหิน ${HOUSE_COST.stone_chunk} ก้อน` }); return; }
    if (p.zeny < HOUSE_COST.zeny) { client.send("system", { text: `ขาดเงิน ${HOUSE_COST.zeny} zeny` }); return; }
    // Find a free slot (not used by any currently online player)
    const taken = new Set<number>();
    for (const [, pp] of this.state.players) if (pp.houseSlot >= 0) taken.add(pp.houseSlot);
    let chosen = -1;
    for (let i = 0; i < HOUSE_SLOTS.length; i++) { if (!taken.has(i)) { chosen = i; break; } }
    if (chosen < 0) { client.send("system", { text: "ไม่มีที่ดินว่าง" }); return; }
    // Deduct + assign
    this.removeItemFromPlayer(p, "wood_log", HOUSE_COST.wood_log);
    this.removeItemFromPlayer(p, "stone_chunk", HOUSE_COST.stone_chunk);
    p.zeny -= HOUSE_COST.zeny;
    p.houseSlot = chosen;
    client.send("system", { text: `🏠 สร้างบ้านสำเร็จ! (slot ${chosen})` });
    this.bumpAchievement(sid, "house");
  }
}
