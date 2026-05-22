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
  targetPlayerId: string | null;
  inventoryOpen: boolean;
  activeNpcId: string | null;
  botMode: boolean;
  buildMode: boolean;
  selectedStructItemId: string | null;
  waypoint: Waypoint | null;
  dismissedHints: string[];
  lang: "th" | "en";
  musicEnabled: boolean;
  musicVolume: number;
  setLang: (lang: "th" | "en") => void;
  setMusicEnabled: (v: boolean) => void;
  setMusicVolume: (v: number) => void;
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
  toggleBuildMode: () => void;
  setSelectedStructItem: (itemId: string | null) => void;
};

export const useStore = create<S>((set, get) => ({
  // Token NEVER auto-loaded — user always sees login on refresh.
  // (Saved credentials pre-fill the form if "remember me" was checked.)
  token: null,
  username: null,
  characters: null,
  characterId: localStorage.getItem("characterId"),
  room: null,
  sessionId: null,
  chat: [],
  targetMonsterId: null,
  targetPlayerId: null,
  inventoryOpen: false,
  activeNpcId: null,
  botMode: false,
  buildMode: false,
  selectedStructItemId: null,
  waypoint: null,
  dismissedHints: (() => {
    try { return JSON.parse(localStorage.getItem("dismissedHints") || "[]"); }
    catch { return []; }
  })(),
  lang: "th" as "th" | "en",
  musicEnabled: localStorage.getItem("musicEnabled") !== "false",
  musicVolume: parseFloat(localStorage.getItem("musicVolume") ?? "0.4"),
  setLang: (lang: "th" | "en") => set({ lang }),
  setMusicEnabled: (v: boolean) => {
    try { localStorage.setItem("musicEnabled", String(v)); } catch {}
    set({ musicEnabled: v });
  },
  setMusicVolume: (v: number) => {
    try { localStorage.setItem("musicVolume", String(v)); } catch {}
    set({ musicVolume: v });
  },
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
    // Safari private-mode + quota-exceeded throw on setItem; degrade gracefully.
    try { localStorage.setItem("token", token); } catch {}
    try { localStorage.setItem("username", username); } catch {}
    set({ token, username, characters });
  },
  setCharacters: (characters) => set({ characters }),
  selectCharacter: (id) => {
    try {
      if (id) localStorage.setItem("characterId", id);
      else localStorage.removeItem("characterId");
    } catch {}
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
  setTarget: (id: string | null) => set({ targetMonsterId: id }),
  toggleInventory: () => set({ inventoryOpen: !get().inventoryOpen }),
  toggleBuildMode: () => set((s) => ({ buildMode: !s.buildMode, selectedStructItemId: s.buildMode ? null : s.selectedStructItemId })),
  setSelectedStructItem: (itemId: string | null) => set({ selectedStructItemId: itemId, buildMode: itemId ? true : get().buildMode }),
}));
