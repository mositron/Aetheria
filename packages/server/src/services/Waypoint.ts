// Waypoint fast-travel — pure data + a stateless handler.
//
// WorldRoom wires the message; this service holds the warp table and the
// transition rules (cost, lookup, mutate position). No client I/O — caller
// receives a result describing what to do.

export type WaypointId =
  | "wp_prontera" | "wp_geffen" | "wp_morocc"
  | "wp_payon" | "wp_alberta" | "wp_izlude";

export type Waypoint = { x: number; z: number; name: string };

export const WAYPOINTS: Record<WaypointId, Waypoint> = {
  wp_prontera: { x: 155, z: 185, name: "Prontera" },
  wp_geffen:   { x: 120, z: 65,  name: "Geffen" },
  wp_morocc:   { x: 80,  z: 120, name: "Morocc" },
  wp_payon:    { x: 160, z: 90,  name: "Payon" },
  wp_alberta:  { x: 100, z: 140, name: "Alberta" },
  wp_izlude:   { x: 130, z: 100, name: "Izlude" },
};

export const WAYPOINT_COST = 50;

export type WaypointResult =
  | { ok: true; cost: number; name: string; x: number; z: number }
  | { ok: false; reason: "no-zeny" | "unknown-waypoint" };

/** Resolve a waypoint travel request. Caller mutates player.zeny + pos and notifies client. */
export function tryWaypoint(zeny: number, id: string): WaypointResult {
  if (zeny < WAYPOINT_COST) return { ok: false, reason: "no-zeny" };
  const wp = (WAYPOINTS as Record<string, Waypoint>)[id];
  if (!wp) return { ok: false, reason: "unknown-waypoint" };
  return { ok: true, cost: WAYPOINT_COST, name: wp.name, x: wp.x, z: wp.z };
}
