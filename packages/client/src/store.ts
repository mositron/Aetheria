import { create } from "zustand";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

type ChatEntry = { from: string; text: string; ts: number };

export type Waypoint = { x: number; z: number; label: string; icon?: string };

export type CharacterSummary = {
  id: string;
  name: string;
  job: string;
  level: number;
  mapId: string;
  appearance: string;
  createdAt?: string;
};

type S = {
  token: string | null;
  username: string | null;
  characters: CharacterSummary[] | null;
  characterId: string | null;
  room: Room<WorldState> | null;
  sessionId: string | null;
  chat: ChatEntry[];
  targetMonsterId: string | null;
  inventoryOpen: boolean;
  activeNpcId: string | null;
  botMode: boolean;
  waypoint: Waypoint | null;
  dismissedHints: string[];
  setWaypoint: (wp: Waypoint | null) => void;
  dismissHint: (id: string) => void;
  setAuth: (token: string, username: string, characters: CharacterSummary[]) => void;
  setCharacters: (characters: CharacterSummary[]) => void;
  selectCharacter: (id: string | null) => void;
  logout: () => void;
  exitToSelect: () => void;
  setRoom: (room: Room<WorldState> | null) => void;
  pushChat: (e: ChatEntry) => void;
  setTarget: (id: string | null) => void;
  toggleInventory: () => void;
};

export const useStore = create<S>((set, get) => ({
  token: localStorage.getItem("token"),
  username: localStorage.getItem("username"),
  characters: null,
  characterId: localStorage.getItem("characterId"),
  room: null,
  sessionId: null,
  chat: [],
  targetMonsterId: null,
  inventoryOpen: false,
  activeNpcId: null,
  botMode: false,
  waypoint: null,
  dismissedHints: (() => {
    try { return JSON.parse(localStorage.getItem("dismissedHints") || "[]"); }
    catch { return []; }
  })(),
  setWaypoint: (wp) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("waypoint-changed"));
    }
    set({ waypoint: wp });
  },
  dismissHint: (id) => set((s) => {
    const next = [...s.dismissedHints, id].slice(-30);
    try { localStorage.setItem("dismissedHints", JSON.stringify(next)); } catch {}
    return { dismissedHints: next };
  }),
  setAuth: (token, username, characters) => {
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
    set({ token, username, characters });
  },
  setCharacters: (characters) => set({ characters }),
  selectCharacter: (id) => {
    if (id) localStorage.setItem("characterId", id);
    else localStorage.removeItem("characterId");
    set({ characterId: id });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("characterId");
    set({ token: null, username: null, characters: null, characterId: null, room: null, sessionId: null });
  },
  exitToSelect: () => {
    localStorage.removeItem("characterId");
    set({ characterId: null, room: null, sessionId: null });
  },
  setRoom: (room) => set({ room, sessionId: room?.sessionId ?? null }),
  pushChat: (e) => set((s) => ({ chat: [...s.chat.slice(-50), e] })),
  setTarget: (id) => set({ targetMonsterId: id }),
  toggleInventory: () => set({ inventoryOpen: !get().inventoryOpen }),
}));
