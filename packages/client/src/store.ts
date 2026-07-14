import { create } from "zustand";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";

type ChatEntry = { from: string; text: string; ts: number };

export type Waypoint = { x: number; z: number; label: string; icon?: string };

/** Single-active-modal registry. Add a new panel id here when wiring a new modal. */
export type PanelId =
  | "inventory" | "crafting" | "stats" | "questLog" | "achievements"
  | "auction" | "guild" | "friends" | "online" | "petbox" | "mailbox"
  | "skillTree" | "marriage" | "leaderboard" | "dailyReward"
  | "worldLobby" | "settings" | "photoMode" | "accountRecovery"
  | "dungeonUI" | "jobAdvancement" | "jobPicker" | "characterSelect"
  | "waypoints" | "worldCompanion" | "autoPotion" | "tradeWindow" | "worldMap";

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
  // Coordinates the 3 onboarding layers (TutorialFinger / Onboarding toasts /
  // HintSystem) so they never overlap on screen for a new player.
  // TutorialFinger takes priority; defaults true so the other two wait for
  // it to declare itself inactive (already-dismissed) on mount.
  tutorialFingerActive: boolean;
  lang: "th" | "en";
  musicEnabled: boolean;
  musicVolume: number;
  viewMode: "3d" | "2d";
  mailUnread: number;
  setMailUnread: (n: number) => void;
  hotbar: (string | null)[]; // length 5 — itemId or null per slot
  setHotbarSlot: (slot: number, itemId: string | null) => void;
  // Single-active-modal: only one full-screen panel can be open at a time.
  // null = no modal. Any side panel listens to this and closes when activeModal
  // changes to a different value.
  activeModal: PanelId | null;
  openModal: (id: PanelId) => void;
  closeModal: () => void;
  toggleModal: (id: PanelId) => void;
  setLang: (lang: "th" | "en") => void;
  setMusicEnabled: (v: boolean) => void;
  setMusicVolume: (v: number) => void;
  setWaypoint: (wp: Waypoint | null) => void;
  dismissHint: (id: string) => void;
  setTutorialFingerActive: (v: boolean) => void;
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
  toggleViewMode: () => void;
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
  tutorialFingerActive: true,
  lang: "th" as "th" | "en",
  musicEnabled: localStorage.getItem("musicEnabled") !== "false",
  musicVolume: parseFloat(localStorage.getItem("musicVolume") ?? "0.4"),
  viewMode: "3d",
  mailUnread: 0,
  setMailUnread: (n: number) => set({ mailUnread: Math.max(0, n | 0) }),
  hotbar: (() => {
    try {
      const raw = localStorage.getItem("hotbar");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length === 5) return arr.map((x) => (typeof x === "string" ? x : null));
      }
    } catch {}
    return [null, null, null, null, null];
  })(),
  setHotbarSlot: (slot: number, itemId: string | null) => set((s) => {
    if (slot < 0 || slot > 4) return s;
    const next = s.hotbar.slice();
    next[slot] = itemId;
    try { localStorage.setItem("hotbar", JSON.stringify(next)); } catch {}
    return { hotbar: next };
  }),
  activeModal: null,
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
  toggleModal: (id) => set((s) => ({ activeModal: s.activeModal === id ? null : id })),
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
  setTutorialFingerActive: (v) => set({ tutorialFingerActive: v }),
  setAuth: (token, username, characters) => {
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
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === "3d" ? "2d" : "3d" })),
}));