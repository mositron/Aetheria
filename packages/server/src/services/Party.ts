// Party state machine. Pure data + transitions — no client I/O.
//
// WorldRoom owns the "notify clients" side; this service owns the
// invariants: who's in which party, who invited whom, max-size cap,
// auto-disband when down to 1 member.

export type PartyId = string;
export type PartySid = string;

export type PartyChange =
  | { kind: "joined"; pid: PartyId; members: PartySid[] }    // someone joined → notify all
  | { kind: "left"; pid: PartyId; members: PartySid[] }      // member left, party still alive
  | { kind: "disbanded"; pid: PartyId; formerMembers: PartySid[] } // last member out
  | { kind: "noop" };

const MAX_PARTY_SIZE = 4;

export class Party {
  private parties = new Map<PartyId, Set<PartySid>>();
  private bySid = new Map<PartySid, PartyId>();
  private invites = new Map<PartySid, PartySid>(); // toSid -> fromSid

  private static newPid(): PartyId {
    return `party_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Returns true if invite recorded. False if target is already in a party. */
  invite(fromSid: PartySid, toSid: PartySid): boolean {
    if (fromSid === toSid) return false;
    if (this.bySid.has(toSid)) return false;
    this.invites.set(toSid, fromSid);
    return true;
  }

  /**
   * Accept an invite. Returns the change so caller can broadcast.
   * Validates the inviter is still the one who issued the most recent invite.
   */
  accept(toSid: PartySid, fromSid: PartySid): PartyChange {
    const pending = this.invites.get(toSid);
    if (!pending || pending !== fromSid) return { kind: "noop" };
    this.invites.delete(toSid);

    let pid = this.bySid.get(fromSid);
    if (!pid) {
      pid = Party.newPid();
      this.parties.set(pid, new Set([fromSid]));
      this.bySid.set(fromSid, pid);
    }
    const members = this.parties.get(pid)!;
    if (members.size >= MAX_PARTY_SIZE) return { kind: "noop" };
    members.add(toSid);
    this.bySid.set(toSid, pid);
    return { kind: "joined", pid, members: [...members] };
  }

  /**
   * Member leaves (explicit /partyleave or disconnect).
   * Disbands the party if size drops to <= 1.
   */
  leave(sid: PartySid): PartyChange {
    const pid = this.bySid.get(sid);
    if (!pid) return { kind: "noop" };
    const members = this.parties.get(pid);
    if (!members) {
      this.bySid.delete(sid);
      return { kind: "noop" };
    }
    members.delete(sid);
    this.bySid.delete(sid);
    if (members.size <= 1) {
      const former = [...members, sid];
      // Remove remaining solo member too
      for (const m of members) this.bySid.delete(m);
      this.parties.delete(pid);
      return { kind: "disbanded", pid, formerMembers: former };
    }
    return { kind: "left", pid, members: [...members] };
  }

  /** Get the party id for a member (or null). */
  partyOf(sid: PartySid): PartyId | null {
    return this.bySid.get(sid) ?? null;
  }

  /** Get all members of a party, leader-first (leader = first insertion). */
  members(pid: PartyId): PartySid[] {
    const set = this.parties.get(pid);
    return set ? [...set] : [];
  }

  /** Pending invite from-sid for this target, if any. */
  pendingInviteFor(toSid: PartySid): PartySid | null {
    return this.invites.get(toSid) ?? null;
  }

  /** Clear any pending invites that target OR were sent by this sid. */
  forget(sid: PartySid): void {
    this.invites.delete(sid);
    for (const [to, from] of this.invites) {
      if (from === sid) this.invites.delete(to);
    }
  }
}

// ─── Standalone message handlers ────────────────────────────────────────────

export function registerPartyHandlers(deps: {
  state: { players: Map<string, any> };
  getPlayer: (sid: string) => any;
  sendToClient: (sid: string, type: string, data: any) => void;
  getCharId: (sid: string) => string | undefined;
  partySvc: Party;
  clients: any[];
}) {
  const { state, getPlayer, sendToClient, partySvc, clients } = deps;

  function broadcastPartyUpdate(pid: string) {
    const memberSids = partySvc.members(pid);
    if (memberSids.length === 0) return;
    const leader = state.players.get(memberSids[0]);
    const members = memberSids.map((sid) => {
      const p = state.players.get(sid);
      return p ? { id: p.id, name: p.name, hp: p.hp, maxHp: p.maxHp, level: p.level } : null;
    }).filter(Boolean);
    for (const sid of memberSids) {
      const c = clients.find((c: any) => c.sessionId === sid);
      c?.send("partyUpdate", { leaderId: leader?.id ?? "", members });
    }
  }

  return {
    partyInvite: (client: any, msg: any) => {
      const inviter = getPlayer(client.sessionId);
      if (!inviter) return;
      let target: any = null;
      let targetPlayer: any = null;
      for (const c of clients) {
        const p = state.players.get(c.sessionId);
        if (p?.name === msg?.targetName && p.id !== inviter.id) { target = c; targetPlayer = p; break; }
      }
      if (!target || !targetPlayer) return;
      if (!partySvc.invite(client.sessionId, target.sessionId)) return;
      sendToClient(target.sessionId, "partyInvite", { fromId: inviter.id, fromName: inviter.name });
    },

    partyAccept: (client: any, msg: any) => {
      const sid = client.sessionId;
      let inviterSid = "";
      for (const c of clients) {
        const p = state.players.get(c.sessionId);
        if (p?.id === msg?.fromId) { inviterSid = c.sessionId; break; }
      }
      if (!inviterSid) return;
      const change = partySvc.accept(sid, inviterSid);
      if (change.kind === "joined") broadcastPartyUpdate(change.pid);
    },

    partyLeave: (client: any) => {
      const sid = client.sessionId;
      const change = partySvc.leave(sid);
      if (change.kind === "noop") return;
      if (change.kind === "disbanded") {
        for (const m of change.formerMembers) {
          const c = clients.find((c: any) => c.sessionId === m);
          c?.send("partyUpdate", { leaderId: "", members: [] });
        }
      } else if (change.kind === "left") {
        const leaver = clients.find((c: any) => c.sessionId === sid);
        leaver?.send("partyUpdate", { leaderId: "", members: [] });
        broadcastPartyUpdate(change.pid);
      }
    },
  };
}

export { MAX_PARTY_SIZE };
