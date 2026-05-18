import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { emptyQuestState, type PlayerQuestState, type WorldState } from "@game/shared";

const cache = new WeakMap<Room<WorldState>, PlayerQuestState>();

export function useQuests(room: Room<WorldState>): PlayerQuestState {
  const [state, setState] = useState<PlayerQuestState>(() => cache.get(room) ?? emptyQuestState());
  useEffect(() => {
    const off1 = room.onMessage("questUpdate", (m: any) => {
      const s: PlayerQuestState = { active: m.active ?? {}, completed: m.completed ?? [] };
      cache.set(room, s);
      setState(s);
    });
    const off2 = room.onMessage("questReward", (_m: any) => { /* could show toast */ });
    return () => { off1?.(); off2?.(); };
  }, [room]);
  return state;
}
