/**
 * MovementService — pure movement helpers extracted from WorldRoom.ts.
 * Handles player movement, portal detection, terrain height estimation.
 * All functions are stateless — pass state as parameters.
 */
import type { WorldState, Player } from "@game/shared";
import type { MapId } from "@game/shared";
import { GAME_CONFIG } from "@game/shared";

// ---------- util ----------

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------- terrain ----------

/** Deterministic server-side terrain height (mirrors client chunkWorld.getHeight). */
export function estimateHeight(x: number, z: number): number {
  const d = Math.sqrt(x * x + z * z);
  if (d < 18) return 0; // flat spawn ring
  const n = (Math.sin(x * 0.05) * Math.cos(z * 0.05) +
             Math.sin(x * 0.11) * 0.3 + Math.cos(z * 0.09) * 0.3) * 0.5 + 0.5;
  const ramp = Math.min(1, (d - 18) / 10);
  let h = Math.pow(Math.max(0, n), 1.5) * 18 * ramp;
  h = Math.floor(h / 1.2) * 1.2;
  return h;
}

// ---------- portal ----------

/** Check if player stepped on a portal; call onPortal if so. Returns true if warped. */
export function checkPortal(
  p: Player,
  portals: Array<{ x: number; z: number; to: MapId; tx: number; tz: number }>,
  onPortal: (to: MapId, tx: number, tz: number) => void,
): boolean {
  for (const portal of portals) {
    if (Math.sqrt(Math.pow(p.pos.x - portal.x, 2) + Math.pow(p.pos.z - portal.z, 2)) < 1.5) {
      onPortal(portal.to, portal.tx, portal.tz);
      return true;
    }
  }
  return false;
}

// ---------- survival wobble ----------

/** Returns modified movement direction when player is dehydrated. */
export function applyThirstWobble(mx: number, mz: number, sid: string): { mx: number; mz: number } {
  if (mx === 0 && mz === 0) return { mx, mz };
  const wob = Math.sin(Date.now() * 0.005 + sid.charCodeAt(0)) * 0.35;
  const cos = Math.cos(wob), sin = Math.sin(wob);
  return {
    mx: mx * cos - mz * sin,
    mz: mx * sin + mz * cos,
  };
}

// ---------- movement ----------

export type Intent = { mx: number; mz: number; rotY: number };

/**
 * Apply player movement for one tick.
 * Returns true if player is moving.
 */
export function applyMovement(
  state: WorldState,
  p: Player,
  sid: string,
  intent: Intent | undefined,
  dt: number,
  worldSize: number,
  speedMult: number = 1,
): boolean {
  if (!intent || p.dead) return false;

  const sp = GAME_CONFIG.PLAYER_SPEED * speedMult;
  const moving = intent.mx !== 0 || intent.mz !== 0;

  let mx = intent.mx, mz = intent.mz;

  // Thirst wobble (drunkard effect)
  if (p.thirst <= 0) {
    const w = applyThirstWobble(mx, mz, sid);
    mx = w.mx; mz = w.mz;
  }

  p.pos.x = clamp(p.pos.x + mx * sp * dt, -worldSize, worldSize);
  p.pos.z = clamp(p.pos.z + mz * sp * dt, -worldSize, worldSize);
  p.rotY = intent.rotY;

  return moving;
}