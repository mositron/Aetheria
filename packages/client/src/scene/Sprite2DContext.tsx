import { createContext, useContext, useRef, useEffect, type ReactNode } from "react";
import type { Room } from "colyseus.js";
import type { WorldState, Player } from "@game/shared";
import { useStore } from "../store";

/** Sprite state for a single visible entity */
export type SpriteState = {
  sessionId: string;
  name: string;
  x: number;
  z: number;
  direction: "down" | "up" | "left" | "right";
  animFrame: 0 | 1;
  isPlayer: boolean;
  color: string;
};

type Sprite2DCtx = {
  ctx: CanvasRenderingContext2D;
  camera: { x: number; z: number };
  sprites: Map<string, SpriteState>;
  canvasWidth: number;
  canvasHeight: number;
};

const Sprite2DContext = createContext<Sprite2DCtx | null>(null);

export function Sprite2DProvider({
  room,
  children,
}: {
  room: Room<WorldState>;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<Map<string, SpriteState>>(new Map());
  const cameraRef = useRef({ x: 0, z: 0 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const sessionId = useStore((s) => s.sessionId);

  // Sync sprite state from room on every state change — no React re-renders needed
  useEffect(() => {
    const sync = () => {
      const me = sessionId ? room.state.players.get(sessionId) : undefined;
      if (me) {
        cameraRef.current.x = me.pos?.x ?? 0;
        cameraRef.current.z = me.pos?.z ?? 0;
      }

      const newSprites = new Map<string, SpriteState>();
      room.state.players.forEach((p, sid) => {
        if (sid === sessionId) return; // skip self
        const color = stringToColor(p.name ?? sid);
        newSprites.set(sid, {
          sessionId: sid,
          name: p.name ?? "???",
          x: p.pos?.x ?? 0,
          z: p.pos?.z ?? 0,
          direction: (p as any).direction ?? "down",
          animFrame: ((p as any).animFrame ?? 0) as 0 | 1,
          isPlayer: true,
          color,
        });
      });

      // Also add monsters from room.state.monsters if it exists
      const monsters = (room.state as any).monsters as Map<string, any> | undefined;
      monsters?.forEach?.((m: any, mid: string) => {
        newSprites.set(mid, {
          sessionId: mid,
          name: m.name ?? "Monster",
          x: m.pos?.x ?? 0,
          z: m.pos?.z ?? 0,
          direction: "down",
          animFrame: ((m as any).animFrame ?? 0) as 0 | 1,
          isPlayer: false,
          color: stringToColor(mid),
        });
      });

      spritesRef.current = newSprites;
    };

    sync();
    room.onStateChange(sync);
    return () => room.onStateChange.remove(sync);
  }, [room, sessionId]);

  if (!canvasRef.current) return null;
  const ctx = canvasRef.current.getContext("2d");
  if (!ctx) return null;

  return (
    <Sprite2DContext.Provider
      value={{
        ctx,
        camera: cameraRef.current,
        sprites: spritesRef.current,
        canvasWidth: canvasRef.current?.width ?? 800,
        canvasHeight: canvasRef.current?.height ?? 600,
      }}
    >
      {children}
    </Sprite2DContext.Provider>
  );
}

/** Hook to access the 2D sprite context */
export function useSprite2D(): Sprite2DCtx {
  const ctx = useContext(Sprite2DContext);
  if (!ctx) throw new Error("useSprite2D must be used inside Sprite2DProvider");
  return ctx;
}

// ── Utilities ────────────────────────────────────────────────────────────────

/** Generate a consistent color from a string (player name / monster id) */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}