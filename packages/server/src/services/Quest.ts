import {
  Player, PlayerQuestState, QUESTS
} from "@game/shared";

export class Quest {
  constructor(
    private state: { players: Map<string, Player> },
    private playerQuests: Map<string, PlayerQuestState>,
    private callbacks: {
      sendToClient: (sid: string, type: string, data: any) => void;
      grantExp: (p: Player, amount: number) => void;
      addToInventoryOrMail: (p: Player, itemId: string, qty: number, source?: string) => Promise<void>;
    }
  ) {}

  private countItem(p: Player, itemId: string): number {
    let n = 0;
    for (const s of p.inventory.values()) {
      if (s.itemId === itemId) n += s.qty;
    }
    return n;
  }

  private removeItem(p: Player, itemId: string, qty: number) {
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

  handleQuestAccept(sid: string, questId: string) {
    const q = QUESTS[questId];
    const p = this.state.players.get(sid);
    const qs = this.playerQuests.get(sid);
    if (!q || !p || !qs) return;
    if (qs.active[questId] !== undefined) return;
    if (qs.completed.includes(questId)) return;
    if (p.level < q.minLevel) return;
    qs.active[questId] = 0;
    if (q.objective.kind === "collect") {
      qs.active[questId] = this.countItem(p, q.objective.itemId);
    }
    this.callbacks.sendToClient(sid, "questUpdate", qs);
  }

  async handleQuestTurnIn(sid: string, questId: string) {
    const q = QUESTS[questId];
    const p = this.state.players.get(sid);
    const qs = this.playerQuests.get(sid);
    if (!q || !p || !qs) return;
    const prog = qs.active[questId];
    if (prog === undefined) return;
    const goal = q.objective.kind === "kill" ? q.objective.count : q.objective.count;
    let progress = prog;
    if (q.objective.kind === "collect") progress = this.countItem(p, q.objective.itemId);
    if (progress < goal) return;
    if (q.objective.kind === "collect") {
      this.removeItem(p, q.objective.itemId, q.objective.count);
    }
    p.zeny += q.reward.zeny;
    this.callbacks.grantExp(p, q.reward.exp);
    if (q.reward.itemId && q.reward.qty) {
      await this.callbacks.addToInventoryOrMail(p, q.reward.itemId, q.reward.qty, "QUEST");
    }
    delete qs.active[questId];
    if (!qs.completed.includes(questId)) qs.completed.push(questId);
    this.callbacks.sendToClient(sid, "questReward", { questId, ...q.reward });
    const nextId = (q as any).next as string | undefined;
    if (nextId && QUESTS[nextId] && !qs.completed.includes(nextId) && !(nextId in qs.active)) {
      qs.active[nextId] = 0;
      this.callbacks.sendToClient(sid, "system", { text: `📜 เควสต์ใหม่: ${QUESTS[nextId].name}` });
    }
    this.callbacks.sendToClient(sid, "questUpdate", qs);
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
      this.callbacks.sendToClient(killerSid, "questUpdate", qs);
    }
  }
}
