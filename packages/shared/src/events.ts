// Tiny type-safe event bus — "signals" Godot-style, zero deps, zero coupling.
// Works on client AND server. Listeners get auto-cleaned on `off`.

export type GameEvents = {
  // Combat
  "monster:killed":   { monsterId: string; killerId: string; xp: number; kind: string };
  "monster:hit":      { monsterId: string; attackerId: string; damage: number; crit: boolean };
  "player:hit":       { playerId: string; attackerId: string; damage: number };
  "player:died":      { playerId: string; killerId: string };
  "player:revived":   { playerId: string };

  // Items / inventory
  "item:dropped":     { itemId: string; x: number; z: number; from: string };
  "item:picked":      { playerId: string; itemId: string; qty: number };
  "inventory:full":   { playerId: string };

  // Progression
  "player:levelup":   { playerId: string; level: number };
  "player:job":       { playerId: string; job: string };
  "quest:progress":   { playerId: string; questId: string; step: number };
  "quest:complete":   { playerId: string; questId: string };
  "achievement:earn": { playerId: string; achId: string };

  // World
  "weather:change":   { from: string; to: string };
  "daynight:change":  { phase: string };
  "boss:spawn":       { monsterId: string; kind: string };

  // Social
  "chat:message":     { playerId: string; text: string };
  "emote:play":       { playerId: string; emote: string };

  // UI feedback (client-only normally)
  "fx:flash":         { color?: string; duration?: number };
  "fx:shake":         { strength?: number; duration?: number };
  "sfx:play":         { id: string; volume?: number };
  "toast":            { text: string; tone?: "info" | "good" | "bad" | "warn" };
};

type Handler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Handler<any>>>();
  private debug = false;

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.listeners.get(event as string);
    if (!set) { set = new Set(); this.listeners.set(event as string, set); }
    set.add(handler as Handler<any>);
    return () => set!.delete(handler as Handler<any>);
  }

  once<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    const off = this.on(event, (p) => { off(); handler(p); });
    return off;
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    this.listeners.get(event as string)?.delete(handler as Handler<any>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    if (this.debug) console.log(`[bus] ${String(event)}`, payload);
    const set = this.listeners.get(event as string);
    if (!set) return;
    for (const h of set) {
      try { h(payload); } catch (err) { console.error(`[bus] handler error in ${String(event)}:`, err); }
    }
  }

  clear(): void { this.listeners.clear(); }
  setDebug(on: boolean): void { this.debug = on; }
}

// Default shared singleton — feel free to create scoped buses if needed.
export const bus = new EventBus();
