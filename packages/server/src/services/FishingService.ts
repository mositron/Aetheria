/**
 * FishingService — fishing minigame. Extracted from WorldRoom.ts.
 */
import { type Player, ITEMS, MAPS, type MapId } from "@game/shared";
import type { Client } from "@colyseus/core";

export class FishingService {
  private fishingState = new Map<string, { startedAt: number; resolveAt: number }>();

  constructor(
    private state: { players: Map<string, Player>; mapId: string; weather: string },
    private addToInventory: (p: Player, itemId: string, qty: number) => boolean,
    private bumpAchievement: (sid: string, counter: string, by?: number) => void,
  ) {}

  handleStartFishing(client: Client) {
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (this.fishingState.has(sid)) return;
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
    const waitMs = 3000 + Math.floor(Math.random() * 5000);
    this.fishingState.set(sid, { startedAt: Date.now(), resolveAt: Date.now() + waitMs });
    client.send("fishing", { state: "casting", remainingMs: waitMs });
  }

  handleStopFishing(client: Client) {
    const sid = client.sessionId;
    if (!this.fishingState.has(sid)) return;
    this.fishingState.delete(sid);
    client.send("fishing", { state: "cancelled" });
  }

  resolveFishingForAll(clients: Map<string, Client>) {
    const now = Date.now();
    for (const [sid, st] of this.fishingState) {
      if (now < st.resolveAt) continue;
      const p = this.state.players.get(sid);
      const client = clients.get(sid);
      this.fishingState.delete(sid);
      if (!p || !client) continue;
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

  cancelFishingForSid(sid: string) {
    this.fishingState.delete(sid);
  }
}