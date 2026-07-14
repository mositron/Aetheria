import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getStateCallbacks, type Room } from "colyseus.js";
import { getTextTexture } from "./textCache";
import {
  GAME_CONFIG, MAPS, ITEMS, NPCS, JOBS, MONSTERS, GATHERED_RESOURCE_ITEMS, HOUSE_SLOTS,
  plantStage,
  type NpcDef, type JobId,
  type WorldState, type Player, type Monster, type GroundItem, type PlantNode, type MapId,
  parseAppearance,
} from "@game/shared";
import { useStore } from "../store";
import { useKeyboard } from "./useKeyboard";
import { keyEq } from "../utils/keyMatch";
import { DamageNumbers } from "./DamageNumbers";
import { SkillEffects } from "./SkillEffects";
import { Environment } from "./Environment";
import { DistantMountains } from "./DistantMountains";
import { AmbientParticles } from "./AmbientParticles";
import { LandDust } from "./LandDust";
import { Weather } from "./Weather";
import { getHeight as terrainHeight, isWater as terrainIsWater, SPAWN_RADIUS, STEP as TERRAIN_STEP } from "./chunkWorld";
import { isBlocked as isObstacle } from "./obstacles";
const TERRAIN_CONFIG = { STEP: TERRAIN_STEP };
import { RoundedBox } from "@react-three/drei";
import { RoundLimb, RoundTorso, RoundHead, RoundSpike } from "./models/organicPrimitives";
import { toonGradient } from "./materials";
import { HeroModel } from "./models/HeroModel";
import { npcAppearance } from "./models/npcAppearance";
import { NpcRoleProps, roleFromNpcId, appearanceForRole } from "./models/NpcRoleProps";
import { SlimeModel } from "./models/SlimeModel";
import { WolfModel } from "./models/WolfModel";
import { BogWitchModel } from "./models/BogWitchModel";
import { IceWraithModel } from "./models/IceWraithModel";
import { SandWormModel } from "./models/SandWormModel";
import { ScorpionLordModel } from "./models/ScorpionLordModel";
import { SnowmanGiantModel } from "./models/SnowmanGiantModel";
import { SwampSerpentModel } from "./models/SwampSerpentModel";
import { DarklordModel } from "./models/DarklordModel";
import { OrcModel } from "./models/OrcModel";
import { PlayerJobProps } from "./models/PlayerJobProps";
import { CompanionModel } from "./models/CompanionModel";
import { ChestModel } from "./models/ChestModel";
import { CaveZones } from "./CaveZones";

const ATTACK_RANGE_BUFFER = 0.3;
// Distance beyond which a monster's name/HP billboard is hidden (alive only —
// selected target always shows). Mirrors the minimap's mob-visibility radius.
const MOB_BILLBOARD_RADIUS = 18;
// Distance beyond which the monster mesh itself is hidden (LOD-style culling).
// Selected target still renders so the player doesn't lose sight of their kill.
const MOB_MODEL_RADIUS = 60;
// Shared "where is the local player" — updated by the main Scene useFrame each
// frame, read by MonsterView (and minimap-via-export) to decide visibility.
// Module-scope so we don't trigger React re-renders.
export const sharedSelfPos = { x: 0, z: 0 };
export const MOB_MINIMAP_RADIUS = 25;

const COLORS = {
  self: "#4ade80",
  other: "#60a5fa",
  slime: "#a3e635",
  wolf: "#9ca3af",
} as const;

// Per-kind billboard (name/HP bar) height above the model's feet. Falls back
// to 1.2 for any kind not listed here — see MonsterView's Billboard usage.
const MONSTER_BILLBOARD_Y: Record<string, number> = {
  darklord: 5,
  orc: 2.7,
  wolf: 1.5,
  // — Part 2 additions —
  boar: 1.0,
  spider: 0.55,
  ghost: 1.3,
  bat: 1.3,
  golem: 2.9,
  fox: 0.95,
  shadow_lord: 3.6,
  ice_giant: 4.6,
  shadow_wolf: 1.4,
  frost_spider: 0.6,
  banshee: 1.5,
  skeleton_captain: 2.15,
};

export function Scene({ room }: { room: Room<WorldState> }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [drops, setDrops] = useState<GroundItem[]>([]);
  const [plants, setPlants] = useState<PlantNode[]>([]);
  const [companions, setCompanions] = useState<any[]>([]);
  const [chests, setChests] = useState<any[]>([]);
  const [chestVersion, setChestVersion] = useState(0);
  const sessionId = room.sessionId;
  const setTarget = useStore((s) => s.setTarget);
  const targetId = useStore((s) => s.targetMonsterId);
  const keys = useKeyboard();
  const { camera, gl } = useThree();
  const seq = useRef(0);
  const selfRef = useRef<THREE.Group>(null);
  const mapDef = MAPS[room.state.mapId as MapId];
  const cam = useRef({ yaw: 0, pitch: 0.55, dist: 16 });
  const tmpVec = useRef(new THREE.Vector3());
  const tmpVec2 = useRef(new THREE.Vector3());
  const walkTarget = useRef<{ x: number; z: number } | null>(null);
  // Y-physics: jump velocity + altitude. Y is purely client-side visual.
  const jumpVy = useRef(0);
  const jumpY = useRef(0);
  const lastGroundY = useRef(0);
  const flyAlt = useRef(5);   // current fly altitude when flying
  const pickupTarget = useRef<string | null>(null);
  const botWanderTarget = useRef<{ x: number; z: number } | null>(null);
  const lastAutoPickupAt = useRef(0);
  const lastAutoAttack = useRef(0);
  const lastAutoSkill = useRef(new Map<string, number>());
  const [marker, setMarker] = useState<{ x: number; z: number; t: number; cancelled?: boolean } | null>(null);

  // cursor helper — supports named cursors ("auto", "grab") and our custom
  // sword/loot/dialog images via short aliases.
  // Sword: 28×28 silver blade with gold guard, hot-spot at the tip (top-left).
  const SWORD_CURSOR =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>" +
    "<g transform='rotate(-45 16 16)'>" +
    "<rect x='15' y='3' width='2' height='20' fill='%23e2e8f0' stroke='%231e293b' stroke-width='0.8'/>" +
    "<polygon points='14,3 18,3 16,0' fill='%23f1f5f9' stroke='%231e293b' stroke-width='0.8'/>" +
    "<rect x='10' y='22' width='12' height='2.5' fill='%23fbbf24' stroke='%23713f12' stroke-width='0.6'/>" +
    "<rect x='14.5' y='24.5' width='3' height='5' fill='%23713f12'/>" +
    "<circle cx='16' cy='30' r='1.6' fill='%23fbbf24' stroke='%23713f12' stroke-width='0.5'/>" +
    "</g></svg>\") 4 4, crosshair";
  const setCursor = (c: string) => {
    if (c === "sword") document.body.style.cursor = SWORD_CURSOR;
    else document.body.style.cursor = c;
  };
  useEffect(() => () => setCursor("auto"), []);

  // attack pulse: any entity (player or monster) that deals damage flashes its attack animation
  const attackPulses = useRef(new Map<string, number>());
  const castPulses = useRef(new Map<string, number>());
  const emotePulses = useRef(new Map<string, { emote: string; at: number }>());
  useEffect(() => {
    const off = room.onMessage("damage", (m: any) => {
      attackPulses.current.set(m.from, performance.now());
    });
    const off2 = room.onMessage("skillCast" as any, (m: any) => {
      castPulses.current.set(m.fromId, performance.now());
    });
    const off3 = room.onMessage("emote" as any, (m: any) => {
      emotePulses.current.set(m.playerId, { emote: m.emote, at: performance.now() });
    });
    const onLocalCast = () => castPulses.current.set(room.sessionId, performance.now());
    window.addEventListener("local-cast", onLocalCast);
    return () => { off?.(); off2?.(); off3?.(); window.removeEventListener("local-cast", onLocalCast); };
  }, [room]);

  // right-click drag to orbit, wheel to zoom
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lx = 0, ly = 0;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      cam.current.yaw -= dx * 0.005;
      cam.current.pitch = Math.max(0.15, Math.min(1.3, cam.current.pitch + dy * 0.005));
    };
    const onUp = () => { dragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.dist = Math.max(6, Math.min(40, cam.current.dist + Math.sign(e.deltaY) * 1.5));
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onCtx);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onCtx);
    };
  }, [gl]);

  useEffect(() => {
    // re-render only on add/remove. Pos/hp updates happen via useFrame in each view.
    const refreshPlayers = () => setPlayers(Array.from(room.state.players.values()));
    const refreshMonsters = () => setMonsters(Array.from(room.state.monsters.values()));
    const refreshDrops = () => setDrops(Array.from(room.state.drops.values()));
    const refreshPlants = () => setPlants(Array.from(room.state.plants.values()));
    const refreshCompanions = () => setCompanions(Array.from((room.state as any).companions?.values?.() ?? []));
    const refreshChests = () => { setChests(Array.from((room.state as any).chests?.values?.() ?? [])); setChestVersion((v) => v + 1); };
    refreshPlayers(); refreshMonsters(); refreshDrops(); refreshPlants(); refreshCompanions(); refreshChests();
    const $ = getStateCallbacks(room);
    const offs = [
      $(room.state).players.onAdd(refreshPlayers),
      $(room.state).players.onRemove(refreshPlayers),
      $(room.state).monsters.onAdd(refreshMonsters),
      $(room.state).monsters.onRemove(refreshMonsters),
      $(room.state).drops.onAdd(refreshDrops),
      $(room.state).drops.onRemove(refreshDrops),
      $(room.state).plants.onAdd(refreshPlants),
      $(room.state).plants.onRemove(refreshPlants),
      $((room.state as any)).companions?.onAdd?.(refreshCompanions),
      $((room.state as any)).companions?.onRemove?.(refreshCompanions),
      $((room.state as any)).chests?.onAdd?.(refreshChests),
      $((room.state as any)).chests?.onRemove?.(refreshChests),
      room.onMessage("chestOpened" as any, refreshChests),
    ];
    return () => offs.forEach((o) => o && o());
  }, [room]);

  // virtual joystick input from TouchControls
  const stick = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onStick = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number }>).detail;
      stick.current.x = d.x; stick.current.y = d.y;
    };
    window.addEventListener("virtual-stick", onStick);
    return () => window.removeEventListener("virtual-stick", onStick);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const me = room.state.players.get(sessionId);
      if (!me) return;
      const k = keys.current;
      const botMode = useStore.getState().botMode;
      let fwd = 0, right = 0;
      if (k.has("w") || k.has("arrowup")) fwd -= 1;
      if (k.has("s") || k.has("arrowdown")) fwd += 1;
      if (k.has("a") || k.has("arrowleft")) right -= 1;
      if (k.has("d") || k.has("arrowright")) right += 1;
      // joystick contribution (y axis: up = -1 = forward to match WASD convention)
      const sx = stick.current.x;
      const sy = stick.current.y;
      if (Math.abs(sx) > 0.05 || Math.abs(sy) > 0.05) {
        right += sx;
        fwd += sy;
      }
      const usingKeys = fwd !== 0 || right !== 0;
      if (usingKeys && walkTarget.current) {
        // Keyboard overrides an in-flight click-to-walk — previously this
        // silently stopped the walk with no feedback ("why did I stop
        // moving?"). Flash a cancel marker at the abandoned target instead.
        setMarker({ x: walkTarget.current.x, z: walkTarget.current.z, t: Date.now(), cancelled: true });
        walkTarget.current = null;
      } else if (usingKeys) {
        walkTarget.current = null;
      }

      // Always clear stale dead-monster targets (regardless of bot mode) — otherwise
      // the player gets stuck with no movement: dead target blocks walk + wander logic.
      {
        const curId = useStore.getState().targetMonsterId;
        if (curId) {
          const cur = room.state.monsters.get(curId);
          if (!cur || cur.dead) useStore.setState({ targetMonsterId: null });
        }
      }

      // AUTO-PICKUP: walk past any drop within 2.3m and it auto-collects.
      // 2.3m gives some buffer below the server's 2.5m check.
      const nowMs = performance.now();
      if (!me.dead && nowMs - lastAutoPickupAt.current > 250) {
        for (const [, g] of room.state.drops) {
          const d = Math.hypot(g.pos.x - me.pos.x, g.pos.z - me.pos.z);
          if (d < 2.3) {
            room.send("pickup", { dropId: g.id });
            lastAutoPickupAt.current = nowMs;
            if (pickupTarget.current === g.id) pickupTarget.current = null;
            break;
          }
        }
      }

      // Compute engageRange up front — both bot-mode target switching and movement use it.
      const jobDef = JOBS[me.job as JobId];
      const offensiveSkills = (jobDef?.skills ?? []).filter((s) => s.damageMult > 0);
      const primarySkill = offensiveSkills.find((s) => s.hotkey === 1 && s.range > 2.5);
      const RANGED_JOBS_CLIENT = new Set(["mage", "archer", "sniper", "wizard"]);
      const basicReach = RANGED_JOBS_CLIENT.has(me.job) ? 7.5 : (GAME_CONFIG.ATTACK_RANGE - ATTACK_RANGE_BUFFER);
      const engageRange = (primarySkill && me.mp >= primarySkill.manaCost)
        ? primarySkill.range - 0.5
        : basicReach;

      // BOT MODE: auto-target HOSTILE mobs + auto-pickup MONSTER drops only.
      if (botMode && !usingKeys && !me.dead) {
        // Clear pickup target if drop disappeared (already picked up)
        if (pickupTarget.current && !room.state.drops.get(pickupTarget.current)) {
          pickupTarget.current = null;
        }
        // priority 1: pickup MONSTER drops — search wider (15m) so bot doesn't miss drops far from kill point
        if (!pickupTarget.current) {
          let nearestDrop: string | null = null, nd = 15;
          for (const [, g] of room.state.drops) {
            if (GATHERED_RESOURCE_ITEMS.has(g.itemId)) continue;
            const d = Math.hypot(g.pos.x - me.pos.x, g.pos.z - me.pos.z);
            if (d < nd) { nd = d; nearestDrop = g.id; }
          }
          if (nearestDrop) {
            pickupTarget.current = nearestDrop;
            useStore.setState({ targetMonsterId: null });
            botWanderTarget.current = null;
          }
        }
// priority 2: target nearest hostile mob within 60m
        // Always evaluate — switch target if a better option (closer OR being attacked by closer mob) appears.
        if (!pickupTarget.current) {
          const cur = useStore.getState().targetMonsterId;
          const curMon = cur ? room.state.monsters.get(cur) : null;
          const curDist = curMon ? Math.hypot(curMon.pos.x - me.pos.x, curMon.pos.z - me.pos.z) : Infinity;
          // Keep current target only if it's alive and still the best option.
          // Re-target if: current is dead, OR a mob is in attack range and closer than current, OR current is far and there's a closer mob.
          let near: string | null = null, nd = 60;
          let nearDist = curDist;
          for (const [, mon] of room.state.monsters) {
            if (mon.dead) continue;
            const cfg = (MONSTERS as any)[mon.kind];
            if (!cfg || cfg.aggroRange <= 0) continue;
            const d = Math.hypot(mon.pos.x - me.pos.x, mon.pos.z - me.pos.z);
            if (d < nd) { nd = d; near = mon.id; }
          }
          const shouldSwitch =
            !curMon || curMon.dead ||                                           // current dead → pick nearest
            (nd < curDist && nd <= engageRange * 1.5) ||                         // closer mob in range or approaching → switch
            (nd < curDist * 0.6) ||                                              // much closer mob (40%+ closer) → switch
            curDist > 60;                                                        // current target went out of range (>60m) → pick nearest
          if (near && shouldSwitch) {
            useStore.setState({ targetMonsterId: near });
            botWanderTarget.current = null;
          }
        }
        // priority 3: WANDER — only when truly idle (no live target, no pickup)
        const liveCur = useStore.getState().targetMonsterId;
        const liveMon = liveCur ? room.state.monsters.get(liveCur) : null;
        const stillIdle = !pickupTarget.current && (!liveMon || liveMon.dead);
        if (stillIdle) {
          const w = botWanderTarget.current;
          const needNew = !w || Math.hypot(w.x - me.pos.x, w.z - me.pos.z) < 1.5;
          if (needNew) {
            const a = Math.random() * Math.PI * 2;
            const r = 8 + Math.random() * 12;
            botWanderTarget.current = { x: me.pos.x + Math.cos(a) * r, z: me.pos.z + Math.sin(a) * r };
          }
        } else {
          botWanderTarget.current = null;
        }
      } else {
        botWanderTarget.current = null;
      }

      let mx = 0, mz = 0;
      const monTarget = targetId ? room.state.monsters.get(targetId) : null;
      const pickup = pickupTarget.current ? room.state.drops.get(pickupTarget.current) : null;

      // Auto-cast: alias for the lifted variables above.
      const job = jobDef;
      const offensive = offensiveSkills;
      const primary = primarySkill;

      if (!usingKeys && pickup) {
        const dx = pickup.pos.x - me.pos.x;
        const dz = pickup.pos.z - me.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.5) {
          mx = dx / dist;
          mz = dz / dist;
        } else {
          room.send("pickup", { dropId: pickup.id });
          pickupTarget.current = null;
        }
      } else if (!usingKeys && monTarget && !monTarget.dead) {
        const dx = monTarget.pos.x - me.pos.x;
        const dz = monTarget.pos.z - me.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > engageRange) {
          mx = dx / dist;
          mz = dz / dist;
        } else {
          // In range: cycle through ALL ready skills (highest hotkey first),
          // fall back to basic attack if nothing is ready / not enough MP.
          const now = Date.now();
          const ready = offensive
            .slice()
            .sort((a, b) => b.hotkey - a.hotkey)
            .find((s) => {
              if (me.mp < s.manaCost) return false;
              if (dist > s.range) return false;
              const last = lastAutoSkill.current.get(s.id) ?? 0;
              return now - last >= s.cooldownMs;
            });
          if (ready) {
            lastAutoSkill.current.set(ready.id, now);
            castPulses.current.set(sessionId, performance.now());
            // Dispatch local-cast so the Hotbar UI starts the cooldown sweep immediately
            window.dispatchEvent(new CustomEvent("local-cast", { detail: { skillId: ready.id } }));
            room.send("skill", { skillId: ready.id, targetId });
          } else if (now - lastAutoAttack.current >= GAME_CONFIG.ATTACK_COOLDOWN_MS) {
            lastAutoAttack.current = now;
            room.send("attack", { targetId });
          }
        }
      } else if (!usingKeys && walkTarget.current) {
        const dx = walkTarget.current.x - me.pos.x;
        const dz = walkTarget.current.z - me.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.25) {
          walkTarget.current = null;
        } else {
          mx = dx / dist;
          mz = dz / dist;
        }
      } else if (!usingKeys && botWanderTarget.current) {
        // Bot mode wander when no enemy/pickup nearby
        const dx = botWanderTarget.current.x - me.pos.x;
        const dz = botWanderTarget.current.z - me.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.5) {
          botWanderTarget.current = null;
        } else {
          mx = dx / dist;
          mz = dz / dist;
        }
      } else if (usingKeys) {
        const y = cam.current.yaw;
        const cos = Math.cos(y), sin = Math.sin(y);
        mx = right * cos + fwd * sin;
        mz = -right * sin + fwd * cos;
      }

// ── Auto-jump (grounded only): in auto-mode, auto-trigger jump when the
      // target point is higher than a normal step but within jump clearance.
      // Uses the same LOOKAHEAD / fromH from the collision block below.
      const autoJumpNeeded = (fromH: number): boolean => {
        if (usingKeys) return false;
        const dist = Math.hypot(mx, mz);
        if (dist < 0.01) return false;
        const nx = mx / dist, nz = mz / dist;
        const px = me.pos.x, pz = me.pos.z;
        const targetX = px + nx * 1.5, targetZ = pz + nz * 1.5;
        if (isObstacle(targetX, targetZ)) return false; // obstacle itself — slide handles it
        const toH = terrainHeight(targetX, targetZ);
        const delta = toH - fromH;
        if (delta <= 0.5 || delta < -0.5) return false; // can walk, no jump needed
        return jumpY.current <= 0.01; // only if grounded
      };
      if (autoJumpNeeded(terrainHeight(me.pos.x, me.pos.z))) {
        jumpVy.current = 9;
      }

      // ── Client-side collision (terrain cliffs + obstacle objects).
      //    Multi-sample: 5 points along path so fast speeds can't tunnel.
      //    Slide logic: full → X only → Z only → ±90° alternatives → full stop.
      if ((mx || mz) && !me.flying) {
        const LOOKAHEAD = 1.5;
        const SAMPLES = 5;
        const fromH = terrainHeight(me.pos.x, me.pos.z);

        function canStepTo(nx: number, nz: number): boolean {
          if (isObstacle(nx, nz)) return false;
          const toH = terrainHeight(nx, nz);
          const delta = toH - fromH;
          return delta <= 0.5 || jumpY.current >= delta - 0.5;
        }

        const px = me.pos.x, pz = me.pos.z;
        function pathClear(dirX: number, dirZ: number): boolean {
          const len = Math.hypot(dirX, dirZ);
          if (len < 0.01) return true;
          const nx = dirX / len, nz = dirZ / len;
          for (let i = 1; i <= SAMPLES; i++) {
            const t = (i / SAMPLES) * LOOKAHEAD;
            if (!canStepTo(px + nx * t, pz + nz * t)) return false;
          }
          return true;
        }

        if (!pathClear(mx, mz)) {
          // Slide along X
          if (mz !== 0 && pathClear(mx, 0)) mz = 0;
          // Slide along Z
          else if (mx !== 0 && pathClear(0, mz)) mx = 0;
          // Try ±90° perpendicular alternatives (wall-following steering)
          else {
            const len = Math.hypot(mx, mz);
            if (len > 0.01) {
              const nx = mx / len, nz = mz / len;
              // Rotate 90° clockwise and counter-clockwise
              const p1x = -nz, p1z = nx;   // +90°
              const p2x = nz, p2z = -nx;  // -90°
              if (pathClear(p1x, p1z)) { mx = p1x; mz = p1z; }
              else if (pathClear(p2x, p2z)) { mx = p2x; mz = p2z; }
              else { mx = 0; mz = 0; } // full stop
            } else {
              mx = 0; mz = 0;
            }
          }
        }
      }

      // Swim mode: when player is in water, halve speed via reduced input magnitude.
      if (terrainIsWater(me.pos.x, me.pos.z) && !me.flying) {
        mx *= 0.45;
        mz *= 0.45;
      }

      seq.current += 1;
      const rotY = (mx || mz) ? Math.atan2(mx, mz) : me.rotY;
      room.send("input", { mx, mz, rotY, seq: seq.current });
    }, 50);
    return () => clearInterval(id);
  }, [room, keys, targetId, sessionId]);

  // jump on Space; pickup on F; fly altitude on R/F (only while flying)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      // SPACE: jump (when grounded) — also still triggers attack if has target
      if (keyEq(e, " ")) {
        const me = room.state.players.get(sessionId);
        if (me?.flying) {
          // While flying, Space = ascend burst
          flyAlt.current = Math.min(30, flyAlt.current + 1.5);
        } else if (jumpY.current <= 0.01) {
          jumpVy.current = 9; // initial jump velocity (~1.6m peak)
        }
        if (targetId) room.send("attack", { targetId });
      }
      // R: ascend while flying (hold-friendly: re-fires on keydown repeat)
      if (keyEq(e, "r")) {
        const me = room.state.players.get(sessionId);
        if (me?.flying) flyAlt.current = Math.min(30, flyAlt.current + 1.0);
      }
      // C: descend while flying
      if (keyEq(e, "c")) {
        const me = room.state.players.get(sessionId);
        if (me?.flying) flyAlt.current = Math.max(2, flyAlt.current - 1.0);
      }
      if (keyEq(e, "f")) {
        const me = room.state.players.get(sessionId);
        if (!me) return;
        let nearestId: string | null = null;
        let nearestD = Infinity;
        for (const [, g] of room.state.drops) {
          const d = Math.hypot(g.pos.x - me.pos.x, g.pos.z - me.pos.z);
          if (d < nearestD && d < 2.5) { nearestD = d; nearestId = g.id; }
        }
        if (nearestId) room.send("pickup", { dropId: nearestId });
      }
      if (keyEq(e, "h")) {
        // quick-use first hp_potion in inventory
        const me = room.state.players.get(sessionId);
        if (!me) return;
        for (let i = 0; i < me.inventory.length; i++) {
          if (me.inventory[i].itemId === "hp_potion") {
            room.send("useItem", { invIndex: i });
            break;
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room, targetId, sessionId]);

  useFrame((_, dt) => {
    const me = room.state.players.get(sessionId);
    if (!me) return;
    // frame-rate-independent smoothing: ~75% catch-up over 100ms
    const alpha = 1 - Math.exp(-dt * 18);

    // ── Detect teleport / map switch: if server position jumped >30m
    //    in one frame, reset jump physics so we don't fall-through-ground.
    if (selfRef.current) {
      const dx = me.pos.x - selfRef.current.position.x;
      const dz = me.pos.z - selfRef.current.position.z;
      if (Math.hypot(dx, dz) > 30) {
        jumpY.current = 0; jumpVy.current = 0;
        lastGroundY.current = terrainHeight(me.pos.x, me.pos.z);
        // Snap visual position so the camera doesn't lurch
        selfRef.current.position.set(me.pos.x, lastGroundY.current, me.pos.z);
      }
    }

    // ── Y-physics (client-side only, server is XZ-authoritative).
    //    Falling: if player Y > terrain Y at current position, gravity pulls
    //    jumpY back toward 0 (i.e., the player falls onto the ground below).
    if (jumpY.current > 0.01 || jumpVy.current !== 0) {
      const wasFalling = jumpVy.current < 0;
      jumpVy.current -= 22 * dt;
      jumpY.current += jumpVy.current * dt;
      if (jumpY.current <= 0) {
        // Landing — emit a dust puff event for VFX
        if (wasFalling && jumpVy.current < -3) {
          window.dispatchEvent(new CustomEvent("player-land", {
            detail: { x: me.pos.x, z: me.pos.z, intensity: Math.min(1, -jumpVy.current / 10) },
          }));
        }
        jumpY.current = 0; jumpVy.current = 0;
      }
    } else {
      // Step-down: if we walked off a ledge (terrain dropped), feel gravity.
      // Compare last frame's terrainY vs now; if dropped, give us a gentle fall.
      const groundY = terrainHeight(me.pos.x, me.pos.z);
      if (lastGroundY.current > groundY + 0.05) {
        jumpY.current = lastGroundY.current - groundY;
        jumpVy.current = 0;
      }
      lastGroundY.current = groundY;
    }
    // Fly altitude: smoothly settle when flying, reset when grounded
    if (!me.flying) {
      flyAlt.current = 5; // default for next takeoff
    }

    if (selfRef.current) {
      // Y composition: terrain height + jump (grounded) OR flyAlt (flying)
      const terrainY = terrainHeight(me.pos.x, me.pos.z);
      const yVis = me.flying ? flyAlt.current : terrainY + jumpY.current;
      // smoothly lerp self position toward server-authoritative pos + custom Y
      tmpVec.current.set(me.pos.x, yVis, me.pos.z);
      selfRef.current.position.lerp(tmpVec.current, alpha);
      // rotation: shortest-path lerp
      const cur = selfRef.current.rotation.y;
      let delta = me.rotY - cur;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      selfRef.current.rotation.y = cur + delta * alpha;
    }
    // Publish player world pos for off-tree consumers (MonsterView billboards,
    // minimap mob-radius filter).
    sharedSelfPos.x = me.pos.x;
    sharedSelfPos.z = me.pos.z;
    // Camera follows visual (smoothed) position + terrain Y + altitude.
    const visualX = selfRef.current?.position.x ?? me.pos.x;
    const visualZ = selfRef.current?.position.z ?? me.pos.z;
    const terrainBaseY = terrainHeight(me.pos.x, me.pos.z);
    const flyOffset = me.flying ? flyAlt.current : jumpY.current * 0.6;
    const camY = terrainBaseY + 1 + flyOffset;
    const { yaw, pitch, dist } = cam.current;
    const target = tmpVec.current.set(visualX, camY, visualZ);
    const desired = tmpVec2.current.set(
      visualX + Math.sin(yaw) * Math.cos(pitch) * dist,
      camY + Math.sin(pitch) * dist,
      visualZ + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    const camAlpha = 1 - Math.exp(-dt * 10);
    camera.position.lerp(desired, camAlpha);
    camera.lookAt(target);
  });

  const ground = mapDef.size;

  return (
    <group>
      <Environment mapId={mapDef.id} room={room} />
      {mapDef.id === "field" && <CaveZones room={room} />}
      {mapDef.id === "field" && <DistantMountains room={room} />}
      <AmbientParticles room={room} />
      <LandDust />
      <Weather room={room} />
      {/* invisible click-catcher slightly above textured ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const p = e.point;
          walkTarget.current = { x: p.x, z: p.z };
          pickupTarget.current = null;
          setTarget(null);
          setMarker({ x: p.x, z: p.z, t: Date.now() });
        }}
        onPointerOver={() => setCursor("auto")}
      >
        <planeGeometry args={[ground, ground, 1, 1]} />
        <meshBasicMaterial visible={false} transparent opacity={0} />
      </mesh>
      {marker && Date.now() - marker.t < 800 && <ClickMarker x={marker.x} z={marker.z} t0={marker.t} cancelled={marker.cancelled} />}

      {mapDef.portals.map((p, i) => (
        <Portal key={i} x={p.x} z={p.z} />
      ))}

      {players.map((p) => (
        <PlayerView
          key={p.id}
          p={p}
          self={p.id === sessionId}
          selfRef={p.id === sessionId ? selfRef : undefined}
          attackPulses={attackPulses.current}
          castPulses={castPulses.current}
          emotePulses={emotePulses.current}
        />
      ))}

      {monsters.map((m) => (
        <MonsterView
          key={m.id}
          m={m}
          selected={targetId === m.id}
          onClick={() => { setTarget(m.id); walkTarget.current = null; pickupTarget.current = null; }}
          onHoverIn={() => setCursor("sword")}
          onHoverOut={() => setCursor("auto")}
          attackPulses={attackPulses.current}
        />
      ))}

      {drops.map((g) => (
        <DropView
          key={g.id}
          g={g}
          onClick={() => { pickupTarget.current = g.id; setTarget(null); walkTarget.current = null; }}
          onHoverIn={() => setCursor("grab")}
          onHoverOut={() => setCursor("auto")}
        />
      ))}

      {/* Waypoint trail — cute floating stars guiding to destination */}
      <WaypointTrail room={room} sessionId={sessionId} />

      {/* Treasure chests in caves */}
      {chests.map((c: any) => (
        <group key={c.id + ":" + chestVersion} position={[c.x, 0, c.z]}>
          <ChestModel
            theme={c.theme}
            opened={!!c.openedBy}
            onClick={() => room.send("openChest", { chestId: c.id })}
            onHoverIn={() => setCursor("pointer")}
            onHoverOut={() => setCursor("auto")}
          />
        </group>
      ))}

      {/* Companions — summoned pal floats next to its owner */}
      {companions.map((c) => (
        <group key={c.id} position={[c.x, 0.5, c.z]}>
          <CompanionModel
            kind={c.kind as any}
            isDead={() => c.hp <= 0}
            isAttacking={() => false}
          />
        </group>
      ))}

      {/* Plants — render at appropriate stage; click to harvest if ripe */}
      {plants.map((pl) => (
        <PlantView
          key={pl.id}
          plant={pl}
          onClick={() => room.send("harvestPlant", { plantId: pl.id })}
          onHoverIn={() => setCursor("pointer")}
          onHoverOut={() => setCursor("auto")}
        />
      ))}

      {/* Houses: render one for each online player with a slot */}
      {players.filter((p) => p.houseSlot >= 0 && p.houseSlot < HOUSE_SLOTS.length).map((p) => {
        const slot = HOUSE_SLOTS[p.houseSlot];
        return (
          <React.Fragment key={p.id + ":house"}>
            <PlayerHouse
              x={slot.x} z={slot.z} owner={p.name}
              accent={parseAppearance(p.appearance).shirt}
              onVisit={p.id === sessionId ? undefined : () => room.send("visitHouse", { name: p.name })}
            />
            <FurnitureLayer playerId={p.id} slotX={slot.x} slotZ={slot.z} decorationsJson={p.decorationsJson} />
          </React.Fragment>
        );
      })}

      {NPCS.filter((n) => n.mapId === mapDef.id).map((n) => (
        <NpcView
          key={n.id}
          n={n}
          onClick={() => {
            walkTarget.current = { x: n.x, z: n.z };
            useStore.setState({ activeNpcId: n.id });
          }}
          onHoverIn={() => setCursor("pointer")}
          onHoverOut={() => setCursor("auto")}
        />
      ))}

      <DamageNumbers room={room} />
      <SkillEffects room={room} />
    </group>
  );
}

function NpcView({ n, onClick, onHoverIn, onHoverOut }: { n: NpcDef; onClick: () => void; onHoverIn: () => void; onHoverOut: () => void }) {
  // Mark different NPC kinds with different bouncy icons.
  const markerIcon =
    n.kind === "shop" ? "🛒" :
    n.kind === "quest" ? "❗" :
    n.id === "tutor_field" ? "❓" :
    n.id === "carpenter_field" ? "🔨" :
    "💬";
  const markerColor =
    n.kind === "shop" ? "#fbbf24" :
    n.kind === "quest" ? "#f43f5e" :
    n.id === "tutor_field" ? "#22d3ee" :
    n.id === "carpenter_field" ? "#a16207" :
    "#a855f7";
  return (
    <group position={[n.x, 0, n.z]}>
      <group
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHoverIn(); }}
        onPointerOut={(e) => { e.stopPropagation(); onHoverOut(); }}
      >
        {(() => {
          const role = roleFromNpcId(n.id);
          const baseApp = npcAppearance(n.id, n.color);
          const app = appearanceForRole(role, baseApp);
          return (
            <>
              <HeroModel bodyColor={n.color} appearance={app} isMoving={() => false} />
              <NpcRoleProps role={role} />
            </>
          );
        })()}
      </group>
      <NpcQuestMarker icon={markerIcon} color={markerColor} />
      <NpcLabel text={`${n.icon} ${n.name}`} y={2.4} />
    </group>
  );
}

/** Bouncy "look at me" speech-bubble marker above NPC head. */
function NpcQuestMarker({ icon, color }: { icon: string; color: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const bubbleRef = useRef<THREE.Mesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  useFrame(() => {
    const t = performance.now() * 0.003;
    if (groupRef.current) {
      groupRef.current.position.y = 3.0 + Math.sin(t * 1.5) * 0.12;
      groupRef.current.rotation.z = Math.sin(t) * 0.08;
    }
    if (bubbleRef.current) {
      const s = 1 + Math.sin(t * 2) * 0.05;
      bubbleRef.current.scale.set(s, s, s);
    }
  });
  const tex = useMemo(() => makeIconTexture(icon), [icon]);
  return (
    <group ref={groupRef}>
      {/* white speech bubble base */}
      <mesh ref={bubbleRef}>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshStandardMaterial color="#fffbeb" emissive={color} emissiveIntensity={0.3} />
      </mesh>
      {/* small pointer triangle under */}
      <mesh position={[0, -0.3, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.12, 0.2, 4]} />
        <meshStandardMaterial color="#fffbeb" />
      </mesh>
      {/* the emoji floating in front */}
      <sprite ref={spriteRef} position={[0, 0, 0.34]} scale={[0.4, 0.4, 1]}>
        <spriteMaterial map={tex} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

function makeIconTexture(icon: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.font = "96px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function NpcLabel({ text, y }: { text: string; y: number }) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion as any);
  });
  // Shared LRU cache — same NPC name across components reuses one texture.
  const tex = useMemo(() => getTextTexture(text, { fill: "#fde68a", width: 512 }), [text]);
  return (
    <sprite ref={ref} position={[0, y, 0]} scale={[2.4, 0.4, 1]}>
      <spriteMaterial map={tex} transparent depthTest={false} />
    </sprite>
  );
}

function ClickMarker({ x, z, t0, cancelled }: { x: number; z: number; t0: number; cancelled?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const age = (Date.now() - t0) / 800;
    // Cancelled (keyboard override) shrinks + reads red — distinct from the
    // normal expanding yellow "go here" ping — so stopping a click-walk
    // looks intentional instead of a mystery halt.
    const s = cancelled ? Math.max(0.15, 1.3 - age * 1.6) : 1 + age * 2;
    ref.current.scale.set(s, 1, s);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - age);
  });
  return (
    <mesh ref={ref} position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.45, 24]} />
      <meshBasicMaterial color={cancelled ? "#f87171" : "#fde047"} transparent />
    </mesh>
  );
}

function WaypointTrail({ room, sessionId }: { room: Room<WorldState>; sessionId: string }) {
  const wp = useStore((s) => s.waypoint);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const destRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const arrived = useRef(false);

  useFrame(({ clock }) => {
    const me = room.state.players.get(sessionId);
    if (!me || !wp) return;
    const dx = wp.x - me.pos.x;
    const dz = wp.z - me.pos.z;
    const dist = Math.hypot(dx, dz);

    // auto-clear when player is within 1.5m of destination
    if (dist < 1.5) {
      if (!arrived.current) {
        arrived.current = true;
        useStore.setState({ waypoint: null });
      }
      return;
    } else {
      arrived.current = false;
    }

    const t = clock.getElapsedTime();
    const STEPS = 12;
    const minDist = 2;
    const maxDist = Math.min(dist - 1.2, STEPS * 2.5);
    const startD = Math.max(minDist, (t * 4) % 2.5);

    for (let i = 0; i < STEPS; i++) {
      const ref = refs.current[i];
      if (!ref) continue;
      const d = startD + i * 2.0;
      if (d > maxDist) { ref.visible = false; continue; }
      ref.visible = true;
      const ratio = d / dist;
      ref.position.set(me.pos.x + dx * ratio, 0.25 + Math.sin(t * 3 + i) * 0.1, me.pos.z + dz * ratio);
      ref.rotation.y = t * 1.5;
    }

    // destination pillar
    if (destRef.current) {
      destRef.current.position.set(wp.x, 0, wp.z);
      destRef.current.scale.y = 1 + Math.sin(t * 3) * 0.05;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.6;
      const s = 1.2 + Math.sin(t * 2) * 0.15;
      ringRef.current.scale.set(s, s, 1);
    }
  });

  if (!wp) return null;

  return (
    <group>
      {/* dashed trail markers (heart-shaped via small octahedron + flat below) */}
      {Array.from({ length: 12 }).map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <mesh>
            <octahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.9} />
          </mesh>
        </group>
      ))}

      {/* destination — tall pink crystal pillar + pulsing ring */}
      <group ref={destRef} position={[wp.x, 0, wp.z]}>
        {/* base disc */}
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.4, 24]} />
          <meshBasicMaterial color="#f472b6" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={ringRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.7, 32]} />
          <meshBasicMaterial color="#f9a8d4" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        {/* tall column of stacked colorful boxes */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.6, 1.0, 0.6]} />
          <meshStandardMaterial color="#f472b6" emissive="#ec4899" emissiveIntensity={0.4} flatShading />
        </mesh>
        <mesh position={[0, 1.3, 0]}>
          <boxGeometry args={[0.5, 0.6, 0.5]} />
          <meshStandardMaterial color="#fbcfe8" emissive="#f472b6" emissiveIntensity={0.5} flatShading />
        </mesh>
        <mesh position={[0, 1.9, 0]}>
          <octahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.8} flatShading />
        </mesh>
        <pointLight position={[0, 1, 0]} color="#f472b6" intensity={1.5} distance={6} />
        {/* floating label */}
        <Billboard y={2.6}>
          <SpriteText text={`${wp.icon ?? "📍"} ${wp.label}`} />
        </Billboard>
      </group>
    </group>
  );
}

function PlantView({ plant, onClick, onHoverIn, onHoverOut }: { plant: PlantNode; onClick: () => void; onHoverIn: () => void; onHoverOut: () => void }) {
  const stage = plantStage(plant.plantedAt, Date.now());
  // dimensions per stage
  const cfg = [
    { h: 0.15, w: 0.18, leaf: false, ripe: false }, // 0 seedling
    { h: 0.45, w: 0.28, leaf: true,  ripe: false }, // 1 sprout
    { h: 0.7,  w: 0.45, leaf: true,  ripe: false }, // 2 growing
    { h: 0.85, w: 0.6,  leaf: true,  ripe: true  }, // 3 ripe
  ][stage];

  return (
    <group position={[plant.pos.x, 0, plant.pos.z]}>
      {/* soil mound */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.5, 0.1, 0.5]} />
        <meshStandardMaterial color="#5b3a1e" flatShading />
      </mesh>
      {/* stem */}
      <mesh position={[0, 0.1 + cfg.h / 2, 0]}>
        <boxGeometry args={[cfg.w * 0.3, cfg.h, cfg.w * 0.3]} />
        <meshStandardMaterial color="#3b8e3f" flatShading />
      </mesh>
      {cfg.leaf && (
        <mesh position={[0, 0.1 + cfg.h, 0]}>
          <boxGeometry args={[cfg.w, cfg.w * 0.7, cfg.w]} />
          <meshStandardMaterial color="#4ea54c" flatShading />
        </mesh>
      )}
      {/* berries when ripe */}
      {cfg.ripe && (
        <>
          <mesh position={[cfg.w * 0.45, 0.1 + cfg.h, 0]}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
            <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[-cfg.w * 0.45, 0.1 + cfg.h - 0.1, 0.1]}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
            <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0, 0.1 + cfg.h + 0.1, -cfg.w * 0.45]}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
            <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.4} />
          </mesh>
        </>
      )}
      {/* invisible click area, slightly larger */}
      <mesh
        position={[0, 0.4, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHoverIn(); }}
        onPointerOut={(e) => { e.stopPropagation(); onHoverOut(); }}
      >
        <boxGeometry args={[0.7, 1.4, 0.7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* ripe sparkle marker */}
      {cfg.ripe && <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshBasicMaterial color="#fde047" />
      </mesh>}
    </group>
  );
}

function FurnitureLayer({ playerId, slotX, slotZ, decorationsJson }: { playerId: string; slotX: number; slotZ: number; decorationsJson: string }) {
  const decos = useMemo(() => {
    try { return JSON.parse(decorationsJson || "[]") as Array<{ itemId: string; x: number; z: number }>; }
    catch { return []; }
  }, [decorationsJson]);
  return (
    <>
      {decos.map((d, i) => (
        <Furniture key={playerId + ":" + i} itemId={d.itemId} x={slotX + d.x} z={slotZ + d.z} />
      ))}
    </>
  );
}

function Furniture({ itemId, x, z }: { itemId: string; x: number; z: number }) {
  if (itemId === "furniture_bed") return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.15, 0]}><boxGeometry args={[1.2, 0.3, 0.8]} /><meshStandardMaterial color="#fbcfe8" flatShading /></mesh>
      <mesh position={[0, 0.35, -0.3]}><boxGeometry args={[1.2, 0.1, 0.2]} /><meshStandardMaterial color="#f9a8d4" flatShading /></mesh>
      <mesh position={[-0.4, 0.4, 0.05]}><boxGeometry args={[0.3, 0.12, 0.4]} /><meshStandardMaterial color="#fef3c7" flatShading /></mesh>
    </group>
  );
  if (itemId === "furniture_lamp") return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.08, 0.7, 0.08]} /><meshStandardMaterial color="#6b4226" flatShading /></mesh>
      <mesh position={[0, 0.85, 0]}><boxGeometry args={[0.4, 0.3, 0.4]} /><meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.6} /></mesh>
      <pointLight position={[0, 0.85, 0]} color="#fde047" intensity={1.0} distance={4} />
    </group>
  );
  if (itemId === "furniture_chair") return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.45, 0.1, 0.45]} /><meshStandardMaterial color="#a16207" flatShading /></mesh>
      <mesh position={[0, 0.55, -0.18]}><boxGeometry args={[0.45, 0.5, 0.1]} /><meshStandardMaterial color="#a16207" flatShading /></mesh>
      {[[-0.18, 0, 0.18], [0.18, 0, 0.18], [-0.18, 0, -0.18], [0.18, 0, -0.18]].map(([fx, , fz], i) => (
        <mesh key={i} position={[fx as number, 0.1, fz as number]}><boxGeometry args={[0.08, 0.2, 0.08]} /><meshStandardMaterial color="#6b4226" flatShading /></mesh>
      ))}
    </group>
  );
  if (itemId === "furniture_plant") return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.15, 0]}><boxGeometry args={[0.35, 0.3, 0.35]} /><meshStandardMaterial color="#a16207" flatShading /></mesh>
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.45, 0.4, 0.45]} /><meshStandardMaterial color="#4ade80" flatShading /></mesh>
      <mesh position={[0, 0.78, 0]}><boxGeometry args={[0.3, 0.25, 0.3]} /><meshStandardMaterial color="#86efac" flatShading /></mesh>
      <mesh position={[0.15, 0.65, 0.05]}><boxGeometry args={[0.08, 0.08, 0.08]} /><meshStandardMaterial color="#f472b6" emissive="#ec4899" emissiveIntensity={0.5} /></mesh>
    </group>
  );
  if (itemId === "furniture_rug") return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]}><boxGeometry args={[1.4, 0.04, 1.0]} /><meshStandardMaterial color="#f472b6" flatShading /></mesh>
      <mesh position={[0, 0.045, 0]}><boxGeometry args={[1.0, 0.04, 0.7]} /><meshStandardMaterial color="#fbcfe8" flatShading /></mesh>
    </group>
  );
  return null;
}

function PlayerHouse({ x, z, owner, accent, onVisit }: { x: number; z: number; owner: string; accent: string; onVisit?: () => void }) {
  const labelTex = useMemo(() => makeLabelTexture(`🏠 ${owner}`, "#fde047"), [owner]);
  return (
    <group position={[x, 0, z]}>
      {/* base — clickable to visit */}
      <mesh
        position={[0, 1.2, 0]}
        onClick={(e) => { e.stopPropagation(); onVisit?.(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = "auto"; }}
      >
        <boxGeometry args={[3.4, 2.4, 3.4]} />
        <meshStandardMaterial color="#9a7e5c" flatShading />
      </mesh>
      {/* roof tiered */}
      <mesh position={[0, 2.8, 0]}>
        <boxGeometry args={[3.8, 0.4, 3.8]} />
        <meshStandardMaterial color={accent || "#7c2d12"} flatShading />
      </mesh>
      <mesh position={[0, 3.2, 0]}>
        <boxGeometry args={[3.0, 0.4, 3.0]} />
        <meshStandardMaterial color={accent || "#7c2d12"} flatShading />
      </mesh>
      <mesh position={[0, 3.55, 0]}>
        <boxGeometry args={[2.0, 0.35, 2.0]} />
        <meshStandardMaterial color={accent || "#7c2d12"} flatShading />
      </mesh>
      <mesh position={[0, 3.85, 0]}>
        <boxGeometry args={[1.0, 0.25, 1.0]} />
        <meshStandardMaterial color={accent || "#7c2d12"} flatShading />
      </mesh>
      {/* door */}
      <mesh position={[0, 0.8, 1.72]}>
        <boxGeometry args={[0.7, 1.4, 0.05]} />
        <meshStandardMaterial color="#3a2618" flatShading />
      </mesh>
      {/* window — emissive when night */}
      <mesh position={[1.1, 1.5, 1.72]}>
        <boxGeometry args={[0.5, 0.5, 0.05]} />
        <meshStandardMaterial color="#fde047" emissive="#fde047" emissiveIntensity={0.4} flatShading />
      </mesh>
      <mesh position={[-1.1, 1.5, 1.72]}>
        <boxGeometry args={[0.5, 0.5, 0.05]} />
        <meshStandardMaterial color="#fde047" emissive="#fde047" emissiveIntensity={0.4} flatShading />
      </mesh>
      {/* fence around */}
      {[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].map(([fx, fz], i) => (
        <mesh key={i} position={[fx as number, 0.4, fz as number]}>
          <boxGeometry args={[0.15, 0.8, 0.15]} />
          <meshStandardMaterial color="#6b4226" flatShading />
        </mesh>
      ))}
      {/* owner nameplate sprite */}
      <sprite position={[0, 4.5, 0]} scale={[3, 0.5, 1]}>
        <spriteMaterial map={labelTex} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

/** Pet that bounces slightly behind/beside the owner. Rendered in owner-local coords. */
function FollowingPet({ kind, ownerMoving }: { kind: string; ownerMoving: () => boolean }) {
  const ref = useRef<THREE.Group>(null);
  const heartTex = useMemo(() => makeIconTexture("💗"), []);
  // Smooth offset pet trails behind to the right
  useFrame((_, dt) => {
    if (!ref.current) return;
    const t = performance.now() * 0.003;
    const targetX = 0.9 + Math.sin(t) * 0.1;
    const targetZ = -0.8 + Math.cos(t * 1.3) * 0.15;
    const alpha = 1 - Math.exp(-dt * 5);
    ref.current.position.x += (targetX - ref.current.position.x) * alpha;
    ref.current.position.z += (targetZ - ref.current.position.z) * alpha;
    // little hop when owner is moving
    ref.current.position.y = ownerMoving() ? Math.abs(Math.sin(t * 6)) * 0.12 : Math.sin(t * 2) * 0.03;
    // face forward-ish
    ref.current.rotation.y = Math.sin(t) * 0.3;
  });
  // scale per pet kind
  const scale = kind === "cow" ? 0.55 : kind === "pig" ? 0.7 : 0.85;
  return (
    <group ref={ref} scale={scale}>
      {kind === "chicken" && <ChickenModel isMoving={ownerMoving} />}
      {kind === "pig" && <PigModel isMoving={ownerMoving} />}
      {kind === "cow" && <CowModel isMoving={ownerMoving} />}
      {/* love sparkle above pet head */}
      <sprite position={[0, 1.2, 0]} scale={[0.35, 0.35, 1]}>
        <spriteMaterial map={heartTex} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

function ScorpionModel({ isMoving, isAttacking }: { isMoving: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const attackPhase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    const t = performance.now() * 0.008;
    root.current.position.y = isMoving() ? Math.abs(Math.sin(t)) * 0.04 : 0;
    if (tail.current) tail.current.rotation.x = Math.sin(t * 2) * 0.3 - 0.6;
    if (isAttacking() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 4;
      const a = Math.max(0, attackPhase.current);
      const lunge = Math.sin((1 - a) * Math.PI);
      root.current.position.z = lunge * 0.3;
    }
  });
  return (
    <group ref={root}>
      <RoundTorso width={0.7} height={0.3} depth={0.5} color="#92400e" position={[0, 0.25, 0]} />
      <RoundHead radius={0.22} color="#b45309" position={[0, 0.3, 0.32]} />
      {/* pincers */}
      <RoundTorso width={0.2} height={0.14} depth={0.24} color="#92400e" position={[-0.36, 0.3, 0.42]} />
      <RoundTorso width={0.2} height={0.14} depth={0.24} color="#92400e" position={[0.36, 0.3, 0.42]} />
      {/* tail with stinger — grouped so the stinger tip arcs with the tail */}
      <group ref={tail} position={[0, 0.5, -0.3]} rotation={[0.15, 0, 0]}>
        <RoundLimb length={0.6} radius={0.09} color="#92400e" position={[0, 0.3, 0]} />
        <RoundSpike radius={0.07} height={0.16} color="#1f2937" position={[0, 0.68, 0]} />
      </group>
      {/* legs — 3 splayed pairs */}
      {[-0.25, 0, 0.25].map((zx, i) => (
        <group key={i}>
          <RoundLimb length={0.24} radius={0.045} color="#78350f" position={[-0.38, 0.11, zx]} rotation={[0, 0, 0.35]} />
          <RoundLimb length={0.24} radius={0.045} color="#78350f" position={[0.38, 0.11, zx]} rotation={[0, 0, -0.35]} />
        </group>
      ))}
      {/* eyes (cute) */}
      <mesh position={[-0.1, 0.4, 0.44]}><sphereGeometry args={[0.045, 6, 6]} /><meshBasicMaterial color="#fde047" /></mesh>
      <mesh position={[0.1, 0.4, 0.44]}><sphereGeometry args={[0.045, 6, 6]} /><meshBasicMaterial color="#fde047" /></mesh>
    </group>
  );
}

function YetiModel({ isMoving, isAttacking }: { isMoving: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  const attackPhase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    const t = performance.now() * 0.005;
    root.current.position.y = isMoving() ? Math.abs(Math.sin(t * 2)) * 0.1 : Math.sin(t) * 0.03;
    if (isAttacking() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 4;
      const a = Math.max(0, attackPhase.current);
      const swing = -Math.sin((1 - a) * Math.PI) * 1.5;
      if (leftArm.current) leftArm.current.rotation.x = swing;
      if (rightArm.current) rightArm.current.rotation.x = swing;
    } else {
      if (leftArm.current) leftArm.current.rotation.x = 0;
      if (rightArm.current) rightArm.current.rotation.x = 0;
    }
  });
  return (
    <group ref={root} scale={1.2}>
      {/* big white body + round head */}
      <RoundTorso width={0.9} height={1.0} depth={0.55} color="#f0f9ff" position={[0, 1.0, 0]} />
      <RoundHead radius={0.4} color="#f0f9ff" position={[0, 1.95, 0]} />
      {/* horns */}
      <RoundSpike radius={0.09} height={0.28} color="#94a3b8" position={[-0.24, 2.28, 0.02]} rotation={[0.3, 0, 0.25]} />
      <RoundSpike radius={0.09} height={0.28} color="#94a3b8" position={[0.24, 2.28, 0.02]} rotation={[0.3, 0, -0.25]} />
      {/* face */}
      <mesh position={[-0.15, 1.98, 0.34]}><sphereGeometry args={[0.08, 8, 8]} /><meshBasicMaterial color="#fff" /></mesh>
      <mesh position={[0.15, 1.98, 0.34]}><sphereGeometry args={[0.08, 8, 8]} /><meshBasicMaterial color="#fff" /></mesh>
      <mesh position={[-0.15, 1.98, 0.4]}><sphereGeometry args={[0.045, 6, 6]} /><meshBasicMaterial color="#1f2937" /></mesh>
      <mesh position={[0.15, 1.98, 0.4]}><sphereGeometry args={[0.045, 6, 6]} /><meshBasicMaterial color="#1f2937" /></mesh>
      {/* arms */}
      <RoundLimb ref={leftArm} length={0.85} radius={0.14} color="#e0f2fe" position={[-0.58, 1.15, 0]} />
      <RoundLimb ref={rightArm} length={0.85} radius={0.14} color="#e0f2fe" position={[0.58, 1.15, 0]} />
      {/* legs */}
      <RoundLimb length={0.65} radius={0.16} color="#f0f9ff" position={[-0.22, 0.32, 0]} />
      <RoundLimb length={0.65} radius={0.16} color="#f0f9ff" position={[0.22, 0.32, 0]} />
    </group>
  );
}

function ChickenModel({ isMoving }: { isMoving: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const t = performance.now() * 0.012;
    root.current.position.y = isMoving() ? Math.abs(Math.sin(t * 0.8)) * 0.05 : 0;
  });
  return (
    <group ref={root}>
      <RoundTorso width={0.4} height={0.35} depth={0.5} color="#f8fafc" position={[0, 0.35, 0]} />
      <RoundHead radius={0.15} color="#f8fafc" position={[0, 0.68, 0.16]} />
      {/* beak */}
      <RoundSpike radius={0.05} height={0.14} color="#fb923c" position={[0, 0.68, 0.32]} rotation={[Math.PI / 2, 0, 0]} />
      {/* comb */}
      <RoundSpike radius={0.05} height={0.16} color="#dc2626" position={[0, 0.86, 0.08]} />
      {/* thin legs */}
      <RoundLimb length={0.2} radius={0.035} color="#fb923c" position={[-0.1, 0.1, 0]} />
      <RoundLimb length={0.2} radius={0.035} color="#fb923c" position={[0.1, 0.1, 0]} />
    </group>
  );
}

function PigModel({ isMoving }: { isMoving: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const t = performance.now() * 0.01;
    root.current.position.y = isMoving() ? Math.abs(Math.sin(t)) * 0.04 : 0;
  });
  return (
    <group ref={root}>
      <RoundTorso width={0.65} height={0.55} depth={0.95} color="#f9a8d4" position={[0, 0.55, 0]} />
      <RoundHead radius={0.24} color="#f9a8d4" position={[0, 0.62, 0.52]} />
      {/* flat stubby snout */}
      <RoundedBox args={[0.2, 0.16, 0.1]} radius={0.04} smoothness={2} position={[0, 0.58, 0.75]}>
        <meshToonMaterial color="#fb7185" gradientMap={toonGradient} />
      </RoundedBox>
      {/* stout legs */}
      {[[-0.22, 0.32], [0.22, 0.32], [-0.22, -0.32], [0.22, -0.32]].map(([x, z], i) => (
        <RoundLimb key={i} length={0.24} radius={0.075} color="#ec4899" position={[x, 0.13, z]} />
      ))}
    </group>
  );
}

function CowModel({ isMoving }: { isMoving: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const t = performance.now() * 0.009;
    root.current.position.y = isMoving() ? Math.abs(Math.sin(t)) * 0.05 : 0;
  });
  return (
    <group ref={root}>
      {/* body — boxier-but-rounded proportions to distinguish from pig */}
      <RoundTorso width={0.85} height={0.7} depth={1.3} color="#f5f5f5" position={[0, 0.85, 0]} />
      {/* spots */}
      <mesh position={[0.3, 1.05, 0.2]} scale={[1.1, 1.3, 1.4]}><sphereGeometry args={[0.18, 8, 6]} /><meshToonMaterial color="#171717" gradientMap={toonGradient} /></mesh>
      <mesh position={[-0.25, 0.95, -0.3]} scale={[1.1, 1.1, 1.1]}><sphereGeometry args={[0.17, 8, 6]} /><meshToonMaterial color="#171717" gradientMap={toonGradient} /></mesh>
      {/* head */}
      <RoundHead radius={0.3} color="#f5f5f5" position={[0, 1.05, 0.82]} />
      <RoundedBox args={[0.26, 0.16, 0.12]} radius={0.04} smoothness={2} position={[0, 0.95, 1.08]}>
        <meshToonMaterial color="#f9a8d4" gradientMap={toonGradient} />
      </RoundedBox>
      {/* horns */}
      <RoundSpike radius={0.045} height={0.2} color="#fde047" position={[-0.2, 1.42, 0.85]} rotation={[0.2, 0, 0.3]} />
      <RoundSpike radius={0.045} height={0.2} color="#fde047" position={[0.2, 1.42, 0.85]} rotation={[0.2, 0, -0.3]} />
      {/* legs */}
      {[[-0.3, 0.4], [0.3, 0.4], [-0.3, -0.4], [0.3, -0.4]].map(([x, z], i) => (
        <RoundLimb key={i} length={0.5} radius={0.09} color="#171717" position={[x, 0.25, z]} />
      ))}
    </group>
  );
}

// ── Part 2: previously-invisible monster kinds ──────────────────────────
// boar, spider, ghost, bat, golem, fox, shadow_lord, ice_giant, shadow_wolf,
// frost_spider, banshee, skeleton_captain — all built from the organic
// primitive kit, sized/paletted to stay distinct from each other and from
// the mobs above.

function BoarModel({ isMoving, isDead, isAttacking }: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const fl = useRef<THREE.Mesh>(null);
  const fr = useRef<THREE.Mesh>(null);
  const bl = useRef<THREE.Mesh>(null);
  const br = useRef<THREE.Mesh>(null);
  const walkPhase = useRef(0);
  const attackPhase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, Math.PI / 2, 0.1); return; }
    root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, 0, 0.2);
    const moving = isMoving();
    if (moving) walkPhase.current += dt * 9; else walkPhase.current *= 0.85;
    const s = Math.sin(walkPhase.current) * (moving ? 0.5 : 0.05);
    if (fl.current) fl.current.rotation.x = s;
    if (br.current) br.current.rotation.x = s;
    if (fr.current) fr.current.rotation.x = -s;
    if (bl.current) bl.current.rotation.x = -s;
    root.current.position.y = moving ? Math.abs(Math.sin(walkPhase.current * 2)) * 0.04 : 0;
    if (isAttacking() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 4;
      const a = Math.max(0, attackPhase.current);
      root.current.position.z = Math.sin((1 - a) * Math.PI) * 0.4;
    }
  });
  const hide = "#57534e";
  return (
    <group ref={root}>
      <RoundTorso width={0.55} height={0.45} depth={0.75} color={hide} position={[0, 0.42, 0]} castShadow />
      <RoundHead radius={0.22} color={hide} position={[0, 0.48, 0.5]} />
      {/* small tusks */}
      <RoundSpike radius={0.035} height={0.14} color="#f5f5f4" position={[-0.12, 0.36, 0.66]} rotation={[1.2, 0, 0]} />
      <RoundSpike radius={0.035} height={0.14} color="#f5f5f4" position={[0.12, 0.36, 0.66]} rotation={[1.2, 0, 0]} />
      {/* bristled mane ridge */}
      <RoundSpike radius={0.05} height={0.16} color="#292524" position={[0, 0.7, 0.1]} rotation={[0.3, 0, 0]} />
      {/* legs */}
      <RoundLimb ref={fl} length={0.32} radius={0.075} color={hide} position={[-0.17, 0.16, 0.25]} />
      <RoundLimb ref={fr} length={0.32} radius={0.075} color={hide} position={[0.17, 0.16, 0.25]} />
      <RoundLimb ref={bl} length={0.32} radius={0.075} color={hide} position={[-0.17, 0.16, -0.25]} />
      <RoundLimb ref={br} length={0.32} radius={0.075} color={hide} position={[0.17, 0.16, -0.25]} />
      {/* eyes */}
      <mesh position={[-0.09, 0.52, 0.68]}><sphereGeometry args={[0.035, 6, 6]} /><meshBasicMaterial color="#1c1917" /></mesh>
      <mesh position={[0.09, 0.52, 0.68]}><sphereGeometry args={[0.035, 6, 6]} /><meshBasicMaterial color="#1c1917" /></mesh>
    </group>
  );
}

/** Shared body plan for spider / frost_spider — a round body + 6 splayed thin legs, palette-swapped per kind. */
function SpiderLikeModel({ isMoving, isDead, isAttacking, bodyColor, legColor, eyeColor, scale = 1 }: {
  isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean;
  bodyColor: string; legColor: string; eyeColor: string; scale?: number;
}) {
  const root = useRef<THREE.Group>(null);
  const legsGroup = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const attackPhase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, Math.PI / 2, 0.1); return; }
    root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, 0, 0.2);
    const moving = isMoving();
    if (moving) walkPhase.current += dt * 13; else walkPhase.current *= 0.8;
    root.current.position.y = moving ? Math.abs(Math.sin(walkPhase.current)) * 0.03 : 0;
    if (legsGroup.current) {
      legsGroup.current.children.forEach((leg, i) => {
        leg.rotation.x = Math.sin(walkPhase.current + i * 1.1) * 0.25;
      });
    }
    if (isAttacking() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 5;
      const a = Math.max(0, attackPhase.current);
      root.current.position.z = Math.sin((1 - a) * Math.PI) * 0.25;
    }
  });
  const legDefs = [
    { x: -0.18, z: 0.14, rz: 0.9, ry: 0.5 },
    { x: -0.2, z: 0, rz: 1.0, ry: 0 },
    { x: -0.18, z: -0.14, rz: 0.9, ry: -0.5 },
    { x: 0.18, z: 0.14, rz: -0.9, ry: -0.5 },
    { x: 0.2, z: 0, rz: -1.0, ry: 0 },
    { x: 0.18, z: -0.14, rz: -0.9, ry: 0.5 },
  ];
  return (
    <group ref={root} scale={scale}>
      <RoundTorso width={0.3} height={0.22} depth={0.38} color={bodyColor} position={[0, 0.18, 0]} />
      <RoundHead radius={0.13} color={bodyColor} position={[0, 0.2, 0.2]} />
      <group ref={legsGroup}>
        {legDefs.map((l, i) => (
          <RoundLimb key={i} length={0.3} radius={0.025} color={legColor} position={[l.x, 0.17, l.z]} rotation={[0, l.ry, l.rz]} />
        ))}
      </group>
      <mesh position={[-0.06, 0.24, 0.32]}><sphereGeometry args={[0.03, 6, 6]} /><meshBasicMaterial color={eyeColor} /></mesh>
      <mesh position={[0.06, 0.24, 0.32]}><sphereGeometry args={[0.03, 6, 6]} /><meshBasicMaterial color={eyeColor} /></mesh>
    </group>
  );
}

function SpiderModel(props: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  return <SpiderLikeModel {...props} bodyColor="#292524" legColor="#1c1917" eyeColor="#ef4444" />;
}

function FrostSpiderModel(props: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  return <SpiderLikeModel {...props} bodyColor="#e0f2fe" legColor="#7dd3fc" eyeColor="#0ea5e9" scale={1.05} />;
}

function GhostModel({ isDead, isAttacking }: { isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { const s = Math.max(0.05, root.current.scale.x - dt * 0.6); root.current.scale.set(s, s, s); return; }
    phase.current += dt;
    root.current.position.y = 0.7 + Math.sin(phase.current * 1.4) * 0.15;
    root.current.rotation.y += dt * 0.3;
    if (isAttacking()) root.current.scale.set(1.1, 0.95, 1.1);
    else root.current.scale.set(1, 1, 1);
  });
  return (
    <group ref={root}>
      {/* teardrop: round head + tapered tail, both translucent */}
      <mesh>
        <sphereGeometry args={[0.34, 10, 8]} />
        <meshToonMaterial color="#e0e7ff" gradientMap={toonGradient} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, -0.3, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.3, 0.5, 8]} />
        <meshToonMaterial color="#e0e7ff" gradientMap={toonGradient} transparent opacity={0.4} />
      </mesh>
      {/* glowing eyes */}
      <mesh position={[-0.1, 0.05, 0.28]}><sphereGeometry args={[0.05, 6, 6]} /><meshBasicMaterial color="#38bdf8" /></mesh>
      <mesh position={[0.1, 0.05, 0.28]}><sphereGeometry args={[0.05, 6, 6]} /><meshBasicMaterial color="#38bdf8" /></mesh>
    </group>
  );
}

function BatModel({ isDead, isAttacking }: { isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const lw = useRef<THREE.Mesh>(null);
  const rw = useRef<THREE.Mesh>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.visible = false; return; }
    root.current.visible = true;
    phase.current += dt * (isAttacking() ? 22 : 12);
    root.current.position.y = 0.9 + Math.sin(phase.current * 0.25) * 0.15;
    const flap = Math.sin(phase.current) * 0.6 + 0.5;
    if (lw.current) lw.current.rotation.z = 0.4 + flap * 0.7;
    if (rw.current) rw.current.rotation.z = -0.4 - flap * 0.7;
  });
  const skin = "#3f3f46";
  return (
    <group ref={root} scale={0.7}>
      <RoundTorso width={0.16} height={0.2} depth={0.2} color={skin} position={[0, 0, 0]} />
      <RoundHead radius={0.11} color={skin} position={[0, 0.06, 0.13]} />
      <RoundSpike radius={0.025} height={0.09} color={skin} position={[-0.06, 0.16, 0.09]} rotation={[0.2, 0, -0.15]} />
      <RoundSpike radius={0.025} height={0.09} color={skin} position={[0.06, 0.16, 0.09]} rotation={[0.2, 0, 0.15]} />
      {/* membranous wings — flat low-poly (radial=3) cones, same trick as the Dark Lord's cape edges */}
      <mesh ref={lw} position={[-0.14, 0.02, 0]} rotation={[Math.PI / 2, 0, 0.4]}>
        <coneGeometry args={[0.26, 0.02, 3]} />
        <meshToonMaterial color={skin} gradientMap={toonGradient} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={rw} position={[0.14, 0.02, 0]} rotation={[Math.PI / 2, 0, -0.4]}>
        <coneGeometry args={[0.26, 0.02, 3]} />
        <meshToonMaterial color={skin} gradientMap={toonGradient} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.04, 0.06, 0.22]}><sphereGeometry args={[0.02, 6, 6]} /><meshBasicMaterial color="#ef4444" /></mesh>
      <mesh position={[0.04, 0.06, 0.22]}><sphereGeometry args={[0.02, 6, 6]} /><meshBasicMaterial color="#ef4444" /></mesh>
    </group>
  );
}

function GolemModel({ isMoving, isDead, isAttacking }: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, Math.PI / 2, dt * 3); return; }
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0, dt * 3);
    const moving = isMoving();
    phase.current += dt * (moving ? 3.5 : 1);
    const sway = Math.sin(phase.current);
    if (leftLeg.current) leftLeg.current.rotation.x = moving ? sway * 0.35 : 0;
    if (rightLeg.current) rightLeg.current.rotation.x = moving ? -sway * 0.35 : 0;
    root.current.position.y = Math.abs(sway) * 0.05;
    const target = isAttacking() ? -1.6 : -0.15;
    if (leftArm.current) leftArm.current.rotation.x = THREE.MathUtils.lerp(leftArm.current.rotation.x, target, dt * 10);
    if (rightArm.current) rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, target, dt * 10);
  });
  const rock = "#78716c"; const rockDark = "#57534e";
  return (
    <group ref={root} scale={1.25}>
      {/* short thick legs */}
      <RoundLimb ref={leftLeg} length={0.55} radius={0.22} color={rockDark} position={[-0.26, 0.32, 0]} castShadow />
      <RoundLimb ref={rightLeg} length={0.55} radius={0.22} color={rockDark} position={[0.26, 0.32, 0]} castShadow />
      {/* wide torso — blocky silhouette via proportions, not literal boxes */}
      <RoundTorso width={1.15} height={0.85} depth={0.65} color={rock} position={[0, 1.05, 0]} castShadow />
      {/* rock-chunk chest accents */}
      <RoundSpike radius={0.12} height={0.16} color={rockDark} position={[-0.2, 1.25, 0.32]} rotation={[1.4, 0, 0.3]} />
      <RoundSpike radius={0.1} height={0.14} color={rockDark} position={[0.22, 1.0, 0.34]} rotation={[1.5, 0, -0.2]} />
      <RoundHead radius={0.32} color={rock} position={[0, 1.72, 0]} />
      {/* glowing core eyes */}
      <mesh position={[-0.12, 1.76, 0.28]}><sphereGeometry args={[0.055, 8, 8]} /><meshBasicMaterial color="#fbbf24" /></mesh>
      <mesh position={[0.12, 1.76, 0.28]}><sphereGeometry args={[0.055, 8, 8]} /><meshBasicMaterial color="#fbbf24" /></mesh>
      {/* boulder shoulders */}
      <mesh position={[-0.62, 1.35, 0]}><sphereGeometry args={[0.26, 8, 6]} /><meshToonMaterial color={rockDark} gradientMap={toonGradient} /></mesh>
      <mesh position={[0.62, 1.35, 0]}><sphereGeometry args={[0.26, 8, 6]} /><meshToonMaterial color={rockDark} gradientMap={toonGradient} /></mesh>
      <RoundLimb ref={leftArm} length={0.6} radius={0.19} color={rock} position={[-0.62, 1.0, 0]} />
      <RoundLimb ref={rightArm} length={0.6} radius={0.19} color={rock} position={[0.62, 1.0, 0]} />
    </group>
  );
}

function FoxModel({ isMoving, isDead, isAttacking }: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const fl = useRef<THREE.Mesh>(null);
  const fr = useRef<THREE.Mesh>(null);
  const bl = useRef<THREE.Mesh>(null);
  const br = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const attackPhase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, Math.PI / 2, 0.1); return; }
    root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, 0, 0.2);
    const moving = isMoving();
    if (moving) walkPhase.current += dt * 12; else walkPhase.current *= 0.85;
    const s = Math.sin(walkPhase.current) * (moving ? 0.6 : 0.05);
    if (fl.current) fl.current.rotation.x = s;
    if (br.current) br.current.rotation.x = s;
    if (fr.current) fr.current.rotation.x = -s;
    if (bl.current) bl.current.rotation.x = -s;
    if (tail.current) tail.current.rotation.z = Math.sin(performance.now() * 0.007) * 0.35;
    root.current.position.y = moving ? Math.abs(Math.sin(walkPhase.current * 2)) * 0.04 : 0;
    if (isAttacking() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 4;
      const a = Math.max(0, attackPhase.current);
      root.current.position.z = Math.sin((1 - a) * Math.PI) * 0.35;
    }
  });
  // Slimmer cousin of the wolf silhouette — same shape language, smaller + reddish.
  const fur = "#c2410c"; const belly = "#fed7aa";
  return (
    <group ref={root} scale={0.7}>
      <RoundTorso width={0.4} height={0.34} depth={0.75} color={fur} position={[0, 0.4, 0]} />
      <RoundHead radius={0.2} color={fur} position={[0, 0.5, 0.42]} />
      <RoundSpike radius={0.06} height={0.18} color={fur} position={[-0.11, 0.68, 0.36]} rotation={[0, 0, 0.15]} />
      <RoundSpike radius={0.06} height={0.18} color={fur} position={[0.11, 0.68, 0.36]} rotation={[0, 0, -0.15]} />
      <RoundLimb length={0.2} radius={0.08} color={belly} position={[0, 0.45, 0.6]} rotation={[Math.PI / 2, 0, 0]} />
      <RoundLimb ref={fl} length={0.32} radius={0.06} color={fur} position={[-0.14, 0.18, 0.26]} />
      <RoundLimb ref={fr} length={0.32} radius={0.06} color={fur} position={[0.14, 0.18, 0.26]} />
      <RoundLimb ref={bl} length={0.32} radius={0.06} color={fur} position={[-0.14, 0.18, -0.26]} />
      <RoundLimb ref={br} length={0.32} radius={0.06} color={fur} position={[0.14, 0.18, -0.26]} />
      {/* bushy tail */}
      <group ref={tail} position={[0, 0.42, -0.4]} rotation={[0.5, 0, 0]}>
        <RoundLimb length={0.4} radius={0.11} color={fur} position={[0, 0.15, 0]} />
        <RoundSpike radius={0.13} height={0.22} color="#fde68a" position={[0, 0.4, 0]} />
      </group>
      <mesh position={[-0.08, 0.53, 0.58]}><sphereGeometry args={[0.035, 6, 6]} /><meshBasicMaterial color="#1c1917" /></mesh>
      <mesh position={[0.08, 0.53, 0.58]}><sphereGeometry args={[0.035, 6, 6]} /><meshBasicMaterial color="#1c1917" /></mesh>
    </group>
  );
}

function ShadowWolfModel({ isMoving, isDead, isAttacking }: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const fl = useRef<THREE.Mesh>(null);
  const fr = useRef<THREE.Mesh>(null);
  const bl = useRef<THREE.Mesh>(null);
  const br = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Mesh>(null);
  const walkPhase = useRef(0);
  const attackPhase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, Math.PI / 2, 0.1); return; }
    root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, 0, 0.2);
    const moving = isMoving();
    if (moving) walkPhase.current += dt * 10; else walkPhase.current *= 0.85;
    const s = Math.sin(walkPhase.current) * (moving ? 0.6 : 0.05);
    if (fl.current) fl.current.rotation.x = s;
    if (br.current) br.current.rotation.x = s;
    if (fr.current) fr.current.rotation.x = -s;
    if (bl.current) bl.current.rotation.x = -s;
    if (tail.current) tail.current.rotation.z = Math.sin(performance.now() * 0.006) * 0.4;
    root.current.position.y = moving ? Math.abs(Math.sin(walkPhase.current * 2)) * 0.05 : 0;
    if (isAttacking() && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 4;
      const a = Math.max(0, attackPhase.current);
      root.current.position.z = Math.sin((1 - a) * Math.PI) * 0.5;
    }
  });
  // Elemental palette-swap of the wolf silhouette — same shape language, dark + glowing eyes.
  const fur = "#1e1b2e";
  return (
    <group ref={root}>
      <RoundTorso width={0.48} height={0.42} depth={0.95} color={fur} position={[0, 0.52, 0]} />
      <RoundHead radius={0.22} color={fur} position={[0, 0.65, 0.5]} />
      <RoundSpike radius={0.06} height={0.18} color={fur} position={[-0.12, 0.86, 0.44]} rotation={[0, 0, 0.2]} />
      <RoundSpike radius={0.06} height={0.18} color={fur} position={[0.12, 0.86, 0.44]} rotation={[0, 0, -0.2]} />
      <mesh position={[-0.1, 0.7, 0.68]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#a855f7" /></mesh>
      <mesh position={[0.1, 0.7, 0.68]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#a855f7" /></mesh>
      <RoundLimb ref={fl} length={0.48} radius={0.075} color={fur} position={[-0.17, 0.24, 0.32]} />
      <RoundLimb ref={fr} length={0.48} radius={0.075} color={fur} position={[0.17, 0.24, 0.32]} />
      <RoundLimb ref={bl} length={0.48} radius={0.075} color={fur} position={[-0.17, 0.24, -0.32]} />
      <RoundLimb ref={br} length={0.48} radius={0.075} color={fur} position={[0.17, 0.24, -0.32]} />
      <RoundLimb ref={tail} length={0.4} radius={0.08} color={fur} position={[0, 0.58, -0.5]} rotation={[0.4, 0, 0]} />
    </group>
  );
}

function BansheeModel({ isDead, isAttacking }: { isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const wailPhase = useRef(0);
  const gown = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { const s = Math.max(0.05, root.current.scale.x - dt * 0.6); root.current.scale.set(s, s, s); return; }
    wailPhase.current += dt * 1.6;
    root.current.position.y = 0.9 + Math.sin(wailPhase.current * 0.9) * 0.12;
    root.current.rotation.y = Math.sin(wailPhase.current * 0.3) * 0.3;
    if (gown.current) gown.current.scale.y = 1 + Math.sin(wailPhase.current * 1.3) * 0.06;
    if (isAttacking()) root.current.rotation.z = Math.sin(performance.now() * 0.05) * 0.05;
    else root.current.rotation.z = 0;
  });
  const pale = "#e9d5ff"; const gownColor = "#ddd6fe";
  return (
    <group ref={root}>
      <RoundTorso width={0.42} height={0.5} depth={0.28} color={pale} position={[0, 0.55, 0]} />
      <RoundHead radius={0.22} color={pale} position={[0, 1.02, 0]} />
      {/* hollow glowing eyes */}
      <mesh position={[-0.09, 1.05, 0.19]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#38bdf8" /></mesh>
      <mesh position={[0.09, 1.05, 0.19]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#38bdf8" /></mesh>
      {/* long ghostly hair trailing behind */}
      <RoundSpike radius={0.14} height={0.5} color="#c4b5fd" position={[0, 0.75, -0.12]} rotation={[Math.PI, 0, 0]} />
      {/* flowing lower half stands in for legs — banshees don't have visible feet */}
      <mesh ref={gown} position={[0, 0.15, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.32, 0.7, 10]} />
        <meshToonMaterial color={gownColor} gradientMap={toonGradient} transparent opacity={0.65} />
      </mesh>
      <RoundLimb length={0.4} radius={0.06} color={pale} position={[-0.32, 0.65, 0]} rotation={[0, 0, 0.5]} />
      <RoundLimb length={0.4} radius={0.06} color={pale} position={[0.32, 0.65, 0]} rotation={[0, 0, -0.5]} />
    </group>
  );
}

function SkeletonCaptainModel({ isMoving, isDead, isAttacking }: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const swordArm = useRef<THREE.Group>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, Math.PI / 2, dt * 4); return; }
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0, dt * 4);
    const moving = isMoving();
    phase.current += dt * (moving ? 5.5 : 1.5);
    const sway = Math.sin(phase.current);
    if (leftLeg.current) leftLeg.current.rotation.x = moving ? sway * 0.5 : 0;
    if (rightLeg.current) rightLeg.current.rotation.x = moving ? -sway * 0.5 : 0;
    root.current.position.y = Math.abs(sway) * 0.03;
    if (swordArm.current) {
      const target = isAttacking() ? -Math.PI * 0.65 : -0.3;
      swordArm.current.rotation.x = THREE.MathUtils.lerp(swordArm.current.rotation.x, target, dt * 13);
    }
  });
  // Bone-white, gaunt proportions (thin limbs, narrow torso) read as "skeleton" without extra bone-segment meshes.
  const bone = "#e7e5e4"; const boneShade = "#a8a29e";
  return (
    <group ref={root}>
      <RoundLimb ref={leftLeg} length={0.82} radius={0.09} color={bone} position={[-0.14, 0.42, 0]} />
      <RoundLimb ref={rightLeg} length={0.82} radius={0.09} color={bone} position={[0.14, 0.42, 0]} />
      <RoundTorso width={0.5} height={0.68} depth={0.28} color={bone} position={[0, 1.15, 0]} castShadow />
      {/* tattered captain's tabard */}
      <RoundedBox args={[0.42, 0.3, 0.3]} radius={0.03} smoothness={2} position={[0, 1.05, 0]}>
        <meshToonMaterial color="#7f1d1d" gradientMap={toonGradient} />
      </RoundedBox>
      <RoundHead radius={0.2} color={bone} position={[0, 1.72, 0]} />
      <mesh position={[-0.08, 1.75, 0.17]}><sphereGeometry args={[0.04, 8, 8]} /><meshBasicMaterial color="#0c0a09" /></mesh>
      <mesh position={[0.08, 1.75, 0.17]}><sphereGeometry args={[0.04, 8, 8]} /><meshBasicMaterial color="#0c0a09" /></mesh>
      {/* captain's helm spike */}
      <RoundSpike radius={0.05} height={0.2} color={boneShade} position={[0, 1.95, 0]} />
      <RoundLimb length={0.6} radius={0.07} color={bone} position={[-0.36, 0.95, 0]} />
      <group ref={swordArm} position={[0.36, 1.4, 0]}>
        <RoundLimb length={0.6} radius={0.07} color={bone} position={[0, -0.3, 0]} />
        <mesh position={[0, -0.62, 0]}><cylinderGeometry args={[0.025, 0.025, 0.18, 6]} /><meshStandardMaterial color="#57534e" flatShading /></mesh>
        <RoundedBox args={[0.08, 0.7, 0.02]} radius={0.01} smoothness={2} position={[0, -1.05, 0]}>
          <meshStandardMaterial color="#cbd5e1" metalness={0.7} flatShading />
        </RoundedBox>
      </group>
    </group>
  );
}

function ShadowLordModel({ isMoving, isDead, isAttacking }: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const armGroup = useRef<THREE.Group>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, Math.PI / 2, dt * 4); return; }
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0, dt * 4);
    const moving = isMoving();
    phase.current += dt * (moving ? 5 : 1.5);
    const sway = Math.sin(phase.current);
    if (leftLeg.current) leftLeg.current.rotation.x = moving ? sway * 0.45 : 0;
    if (rightLeg.current) rightLeg.current.rotation.x = moving ? -sway * 0.45 : 0;
    root.current.position.y = Math.abs(sway) * 0.04;
    if (armGroup.current) {
      const target = isAttacking() ? -1.4 : -0.2;
      armGroup.current.rotation.x = THREE.MathUtils.lerp(armGroup.current.rotation.x, target, dt * 12);
    }
  });
  // Dungeon boss — imposing wraith-lord frame, dark purple/black.
  const shade = "#1e1033"; const shadeDark = "#0d0616";
  return (
    <group ref={root} scale={1.35}>
      <RoundLimb ref={leftLeg} length={0.85} radius={0.13} color={shadeDark} position={[-0.17, 0.43, 0]} />
      <RoundLimb ref={rightLeg} length={0.85} radius={0.13} color={shadeDark} position={[0.17, 0.43, 0]} />
      <RoundTorso width={0.7} height={0.75} depth={0.4} color={shade} position={[0, 1.18, 0]} castShadow />
      <RoundHead radius={0.24} color={shade} position={[0, 1.85, 0]} />
      <mesh position={[-0.1, 1.9, 0.22]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#c084fc" /></mesh>
      <mesh position={[0.1, 1.9, 0.22]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#c084fc" /></mesh>
      {/* shoulder spikes */}
      <RoundSpike radius={0.09} height={0.32} color={shadeDark} position={[-0.42, 1.5, 0]} rotation={[0, 0, -0.9]} />
      <RoundSpike radius={0.09} height={0.32} color={shadeDark} position={[0.42, 1.5, 0]} rotation={[0, 0, 0.9]} />
      {/* crown-like head spikes */}
      <RoundSpike radius={0.05} height={0.28} color={shadeDark} position={[0, 2.14, 0]} />
      <RoundSpike radius={0.045} height={0.2} color={shadeDark} position={[-0.13, 2.08, 0]} rotation={[0, 0, 0.3]} />
      <RoundSpike radius={0.045} height={0.2} color={shadeDark} position={[0.13, 2.08, 0]} rotation={[0, 0, -0.3]} />
      <group ref={armGroup} position={[0, 1.55, 0]}>
        <RoundLimb length={0.7} radius={0.1} color={shade} position={[-0.45, -0.35, 0]} />
        <RoundLimb length={0.7} radius={0.1} color={shade} position={[0.45, -0.35, 0]} />
      </group>
      <pointLight position={[0, 1.4, 0.3]} color="#7c3aed" intensity={1.5} distance={6} />
    </group>
  );
}

function IceGiantModel({ isMoving, isDead, isAttacking }: { isMoving: () => boolean; isDead: () => boolean; isAttacking: () => boolean }) {
  const root = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const armGroup = useRef<THREE.Group>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (isDead()) { root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, Math.PI / 2, dt * 3); return; }
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0, dt * 3);
    const moving = isMoving();
    phase.current += dt * (moving ? 3 : 1);
    const sway = Math.sin(phase.current);
    if (leftLeg.current) leftLeg.current.rotation.x = moving ? sway * 0.35 : 0;
    if (rightLeg.current) rightLeg.current.rotation.x = moving ? -sway * 0.35 : 0;
    root.current.position.y = Math.abs(sway) * 0.05;
    if (armGroup.current) {
      const target = isAttacking() ? -1.5 : -0.15;
      armGroup.current.rotation.x = THREE.MathUtils.lerp(armGroup.current.rotation.x, target, dt * 10);
    }
  });
  // Dungeon boss — large bulky humanoid, icy blue-white.
  const ice = "#e0f2fe"; const iceDark = "#7dd3fc"; const skin = "#bae6fd";
  return (
    <group ref={root} scale={1.5}>
      <RoundLimb ref={leftLeg} length={0.95} radius={0.22} color={skin} position={[-0.26, 0.5, 0]} />
      <RoundLimb ref={rightLeg} length={0.95} radius={0.22} color={skin} position={[0.26, 0.5, 0]} />
      <RoundTorso width={1.05} height={0.95} depth={0.55} color={ice} position={[0, 1.5, 0]} castShadow />
      <RoundHead radius={0.34} color={skin} position={[0, 2.25, 0]} />
      <mesh position={[-0.13, 2.3, 0.28]}><sphereGeometry args={[0.05, 8, 8]} /><meshBasicMaterial color="#0ea5e9" /></mesh>
      <mesh position={[0.13, 2.3, 0.28]}><sphereGeometry args={[0.05, 8, 8]} /><meshBasicMaterial color="#0ea5e9" /></mesh>
      {/* ice-shard shoulder accents */}
      <RoundSpike radius={0.1} height={0.4} color={iceDark} position={[-0.58, 1.85, 0]} rotation={[0, 0, -0.5]} />
      <RoundSpike radius={0.08} height={0.3} color={iceDark} position={[-0.5, 1.7, 0.15]} rotation={[0.3, 0, -0.7]} />
      <RoundSpike radius={0.1} height={0.4} color={iceDark} position={[0.58, 1.85, 0]} rotation={[0, 0, 0.5]} />
      <RoundSpike radius={0.08} height={0.3} color={iceDark} position={[0.5, 1.7, 0.15]} rotation={[0.3, 0, 0.7]} />
      <RoundSpike radius={0.07} height={0.3} color={iceDark} position={[0, 2.55, 0]} />
      <group ref={armGroup} position={[0, 2.0, 0]}>
        <RoundLimb length={0.85} radius={0.17} color={ice} position={[-0.62, -0.42, 0]} />
        <RoundLimb length={0.85} radius={0.17} color={ice} position={[0.62, -0.42, 0]} />
      </group>
      <pointLight position={[0, 1.8, 0.4]} color="#7dd3fc" intensity={1.5} distance={7} />
    </group>
  );
}

function ResourceTree() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.4, 1.2, 0.4]} />
        <meshStandardMaterial color="#6b4226" flatShading />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[1.4, 1.0, 1.4]} />
        <meshStandardMaterial color="#3b8e3f" flatShading />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[0.9, 0.7, 0.9]} />
        <meshStandardMaterial color="#4ea54c" flatShading />
      </mesh>
      {/* axe-stuck-in-tree hint */}
      <mesh position={[0.3, 0.9, 0.25]} rotation={[0, 0, -0.4]}>
        <boxGeometry args={[0.08, 0.5, 0.08]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
    </group>
  );
}

function ResourceRock() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.9, 0.6, 0.9]} />
        <meshStandardMaterial color="#7d7f85" flatShading />
      </mesh>
      <mesh position={[0.18, 0.75, -0.1]}>
        <boxGeometry args={[0.55, 0.4, 0.55]} />
        <meshStandardMaterial color="#55575c" flatShading />
      </mesh>
      <mesh position={[-0.15, 1.0, 0.05]}>
        <boxGeometry args={[0.3, 0.25, 0.3]} />
        <meshStandardMaterial color="#9ca3af" flatShading />
      </mesh>
    </group>
  );
}

function ResourceOre() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.0, 0.6, 1.0]} />
        <meshStandardMaterial color="#5b5267" flatShading />
      </mesh>
      <mesh position={[0.25, 0.75, 0]}>
        <boxGeometry args={[0.45, 0.4, 0.45]} />
        <meshStandardMaterial color="#94a3b8" flatShading metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[-0.2, 0.95, 0.1]}>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color="#cbd5e1" flatShading metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

function ResourceCrystal() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.5;
  });
  return (
    <group>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.9, 0.5, 0.9]} />
        <meshStandardMaterial color="#3b3447" flatShading />
      </mesh>
      <group ref={ref} position={[0, 0.5, 0]}>
        <mesh position={[0, 0.5, 0]}>
          <octahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={1.2} flatShading />
        </mesh>
        <mesh position={[0.35, 0.3, 0]}>
          <octahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={1.0} flatShading />
        </mesh>
        <mesh position={[-0.3, 0.25, 0.2]}>
          <octahedronGeometry args={[0.18, 0]} />
          <meshStandardMaterial color="#d8b4fe" emissive="#a855f7" emissiveIntensity={0.8} flatShading />
        </mesh>
      </group>
      <pointLight position={[0, 1, 0]} color="#a855f7" intensity={1.5} distance={5} />
    </group>
  );
}

function ResourceBush() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.7, 0.5, 0.7]} />
        <meshStandardMaterial color="#4a7a3f" flatShading />
      </mesh>
      {/* berries as small purple cubes */}
      <mesh position={[0.2, 0.45, 0.2]}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[-0.2, 0.4, 0.15]}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.1, 0.5, -0.2]}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function Portal({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime();
  });
  return (
    <group position={[x, 0, z]}>
      <mesh ref={ref} position={[0, 1.2, 0]}>
        <torusGeometry args={[1, 0.18, 12, 32]} />
        <meshStandardMaterial color="#a855f7" emissive="#7c3aed" emissiveIntensity={1.5} />
      </mesh>
      <pointLight position={[0, 1.2, 0]} color="#a855f7" intensity={2} distance={6} />
    </group>
  );
}

const JOB_COLORS: Record<string, string> = {
  novice: "#64748b",
  swordsman: "#dc2626",
  mage: "#7c3aed",
};

const PlayerView = React.memo(function PlayerView({ p, self, selfRef, attackPulses, castPulses, emotePulses }: { p: Player; self: boolean; selfRef?: React.RefObject<THREE.Group>; attackPulses: Map<string, number>; castPulses: Map<string, number>; emotePulses: Map<string, { emote: string; at: number }> }) {
  const ref = useRef<THREE.Group>(null);
  const lastPos = useRef({ x: p.pos.x, z: p.pos.z });
  const lastMoveAt = useRef(0);
  const velocity = useRef(0);     // smoothed horizontal speed magnitude (m/s)
  const turnRate = useRef(0);     // smoothed turn rate (rad/s)
  const lastRotY = useRef(p.rotY);
  const lastSampleAt = useRef(performance.now());
  const labelRef = useRef<{ text: string }>({ text: "" });
  const labelSpriteRef = useRef<THREE.Sprite>(null);
  const tmp = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    if (!self && ref.current) {
      const alpha = 1 - Math.exp(-dt * 18);
      ref.current.position.lerp(tmp.current.set(p.pos.x, terrainHeight(p.pos.x, p.pos.z), p.pos.z), alpha);
      // shortest-path rotation
      const cur = ref.current.rotation.y;
      let delta = p.rotY - cur;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      ref.current.rotation.y = cur + delta * alpha;
    }
    // detect movement: bump timestamp when server pos actually changes
    const dx = p.pos.x - lastPos.current.x;
    const dz = p.pos.z - lastPos.current.z;
    if (Math.hypot(dx, dz) > 0.001) {
      lastMoveAt.current = performance.now();
      lastPos.current.x = p.pos.x;
      lastPos.current.z = p.pos.z;
    }

    // Velocity + turn rate for flying physics (smoothed)
    const now = performance.now();
    const sampleDt = Math.max(0.016, (now - lastSampleAt.current) / 1000);
    lastSampleAt.current = now;
    const instantSpeed = Math.hypot(dx, dz) / sampleDt;
    const speedNorm = Math.min(1, instantSpeed / 8); // normalize ~0..1
    velocity.current += (speedNorm - velocity.current) * 0.15;
    let dr = p.rotY - lastRotY.current;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    const instantTurn = dr / sampleDt;
    turnRate.current += (Math.max(-2, Math.min(2, instantTurn)) - turnRate.current) * 0.2;
    lastRotY.current = p.rotY;

    const newText = p.title
      ? `${p.title}\n${p.name} Lv${p.level}`
      : `${p.name} Lv${p.level} [${p.job}]`;
    if (labelRef.current.text !== newText && labelSpriteRef.current) {
      labelRef.current.text = newText;
      const mat = labelSpriteRef.current.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.map = makeLabelTexture(newText, self ? "#86efac" : "#ffffff");
      mat.needsUpdate = true;
    }
  });
  const appearance = useMemo(() => parseAppearance(p.appearance), [p.appearance]);
  const bodyColor = appearance.shirt || (self ? "#16a34a" : (JOB_COLORS[p.job] ?? "#60a5fa"));
  return (
    <group
      ref={(selfRef as any) ?? ref}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (self) return; // can't target self
        e.stopPropagation();
        useStore.setState({ targetPlayerId: p.id, targetMonsterId: null });
      }}
    >
      {/* Mount: render animal under player when mounted */}
      {p.mounted && p.petKind && (
        <group position={[0, 0, 0]}>
          {p.petKind === "chicken" && <ChickenModel isMoving={() => performance.now() - lastMoveAt.current < 200} />}
          {p.petKind === "pig" && <PigModel isMoving={() => performance.now() - lastMoveAt.current < 200} />}
          {p.petKind === "cow" && <CowModel isMoving={() => performance.now() - lastMoveAt.current < 200} />}
        </group>
      )}
      {/* Pet follows trotting beside player when NOT mounted */}
      {!p.mounted && !p.flying && p.petKind && (
        <FollowingPet kind={p.petKind} ownerMoving={() => performance.now() - lastMoveAt.current < 200} />
      )}
      {/* Wings appear when flying — flap behind back */}
      {p.flying && <PlayerWings />}
      {/* Sparkle trail when flying */}
      {p.flying && <FlySparkles />}
      <FlyLift
        flying={() => p.flying}
        getVelocity={() => velocity.current}
        getTurnRate={() => turnRate.current}
      >
      <group position={[0, p.mounted && p.petKind ? (p.petKind === "cow" ? 1.0 : p.petKind === "pig" ? 0.7 : 0.5) : 0, 0]}>
      <HeroModel
        bodyColor={bodyColor}
        appearance={appearance}
        isMoving={() => performance.now() - lastMoveAt.current < 200}
        isAttacking={() => {
          const t = attackPulses.get(p.id);
          return !!t && performance.now() - t < 60;
        }}
        isCasting={() => {
          const t = castPulses.get(p.id);
          return !!t && performance.now() - t < 700;
        }}
        isDead={() => p.dead}
        hasWeapon={() => !!p.weapon}
        isFlying={() => p.flying}
      />
      {!p.dead && <PlayerJobProps job={p.job} hasWeapon={!!p.weapon} />}
      </group>
      </FlyLift>
      <Billboard y={2.1}>
        <LiveLabel ref={labelSpriteRef} initial={`${p.name} Lv${p.level} [${p.job}]`} />
        <LiveBar getValue={() => p.hp / p.maxHp} color="#22c55e" y={-0.22} />
      </Billboard>
      <EmoteBubble pulses={emotePulses} playerId={p.id} />
    </group>
  );
}, () => true);

/**
 * Lifts children up when flying + adds realistic flight feel:
 *   - tilts FORWARD when moving (dive lean)
 *   - banks LEFT/RIGHT when turning
 *   - subtle vertical bob while gliding
 *   - inertia: lean lags slightly behind input
 */
function FlyLift({ children, flying, getVelocity, getTurnRate }: {
  children: React.ReactNode;
  flying: () => boolean;
  getVelocity?: () => number;
  getTurnRate?: () => number;
}) {
  const ref = useRef<THREE.Group>(null);
  const tilt = useRef({ x: 0, z: 0 });
  const liftBoost = useRef(0); // takeoff burst — initial extra height
  const wasFlying = useRef(false);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const isFlying = flying();
    // Takeoff burst: when transitioning false → true, give an extra 2m jolt that decays
    if (isFlying && !wasFlying.current) liftBoost.current = 2;
    wasFlying.current = isFlying;
    liftBoost.current = Math.max(0, liftBoost.current - dt * 1.5);

    const baseY = isFlying ? 5.0 : 0;                       // ↑ higher altitude
    const bob = isFlying ? Math.sin(performance.now() * 0.003) * 0.3 : 0;
    const target = baseY + bob + liftBoost.current;
    const alpha = 1 - Math.exp(-dt * 3.5);
    ref.current.position.y += (target - ref.current.position.y) * alpha;

    if (isFlying) {
      const vel = getVelocity?.() ?? 0;
      const turn = getTurnRate?.() ?? 0;
      // Tilt nearly horizontal when moving fast — superman pose
      // At rest (vel=0): 0.3 rad ~17° forward lean (anticipation)
      // At full vel (vel=1): up to PI/2 ~90° (full prone)
      const targetTiltX = 0.3 + vel * (Math.PI * 0.45);
      const targetTiltZ = -turn * 1.1;           // strong bank
      tilt.current.x += (targetTiltX - tilt.current.x) * alpha;
      tilt.current.z += (targetTiltZ - tilt.current.z) * alpha;
    } else {
      tilt.current.x += (0 - tilt.current.x) * alpha;
      tilt.current.z += (0 - tilt.current.z) * alpha;
    }
    ref.current.rotation.x = tilt.current.x;
    ref.current.rotation.z = tilt.current.z;
  });
  return <group ref={ref}>{children}</group>;
}

/** Big angel wings that flap and stay attached to the back. */
function PlayerWings() {
  const root = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = performance.now() * 0.014;
    const flap = Math.sin(t) * 0.9;
    if (left.current) left.current.rotation.z = 0.3 + flap;
    if (right.current) right.current.rotation.z = -0.3 - flap;
    if (root.current) root.current.position.y = 1.0 + Math.sin(t * 0.5) * 0.05;
  });
  return (
    <group ref={root} position={[0, 1.0, -0.2]}>
      {/* LEFT wing: layered feathers */}
      <group ref={left} position={[-0.1, 0, 0]}>
        <mesh position={[-0.5, 0, 0]}>
          <boxGeometry args={[1.0, 0.6, 0.08]} />
          <meshStandardMaterial color="#ffffff" emissive="#fbcfe8" emissiveIntensity={0.7} flatShading />
        </mesh>
        <mesh position={[-0.4, -0.25, 0.02]}>
          <boxGeometry args={[0.8, 0.3, 0.06]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.5} flatShading />
        </mesh>
        <mesh position={[-0.85, 0.15, 0]}>
          <boxGeometry args={[0.35, 0.5, 0.05]} />
          <meshStandardMaterial color="#ffffff" emissive="#fbcfe8" emissiveIntensity={0.7} flatShading />
        </mesh>
      </group>
      {/* RIGHT wing */}
      <group ref={right} position={[0.1, 0, 0]}>
        <mesh position={[0.5, 0, 0]}>
          <boxGeometry args={[1.0, 0.6, 0.08]} />
          <meshStandardMaterial color="#ffffff" emissive="#fbcfe8" emissiveIntensity={0.7} flatShading />
        </mesh>
        <mesh position={[0.4, -0.25, 0.02]}>
          <boxGeometry args={[0.8, 0.3, 0.06]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.5} flatShading />
        </mesh>
        <mesh position={[0.85, 0.15, 0]}>
          <boxGeometry args={[0.35, 0.5, 0.05]} />
          <meshStandardMaterial color="#ffffff" emissive="#fbcfe8" emissiveIntensity={0.7} flatShading />
        </mesh>
      </group>
      {/* halo above head */}
      <mesh position={[0, 0.9, 0.15]} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.32, 0.06, 10, 28]} />
        <meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={1.2} />
      </mesh>
      <pointLight position={[0, 0.5, 0]} color="#fbcfe8" intensity={1.6} distance={6} />
    </group>
  );
}

/** Glittery sparkles + wind streaks behind/below the player while flying. */
function FlySparkles() {
  const sparkleRef = useRef<THREE.Points>(null);
  const streakRef = useRef<THREE.Points>(null);
  const N = 28;
  const sparklePos = useMemo(() => {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      a[i * 3 + 0] = (Math.random() - 0.5) * 1.0;
      a[i * 3 + 1] = Math.random() * 4.0 - 2;
      a[i * 3 + 2] = (Math.random() - 0.5) * 1.0;
    }
    return a;
  }, []);
  const streakPos = useMemo(() => {
    const a = new Float32Array(40 * 3);
    for (let i = 0; i < 40; i++) {
      a[i * 3 + 0] = (Math.random() - 0.5) * 2.5;
      a[i * 3 + 1] = Math.random() * 3 + 1;
      a[i * 3 + 2] = -(Math.random() * 5);  // trail behind
    }
    return a;
  }, []);
  useFrame((_, dt) => {
    if (sparkleRef.current) {
      const attr = (sparkleRef.current.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i * 3 + 1] -= dt * 2.0;
        if (arr[i * 3 + 1] < -2) {
          arr[i * 3 + 1] = 3.5;
          arr[i * 3 + 0] = (Math.random() - 0.5) * 1.0;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 1.0;
        }
      }
      attr.needsUpdate = true;
    }
    if (streakRef.current) {
      const attr = (streakRef.current.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < 40; i++) {
        // streaks move backward and fade
        arr[i * 3 + 2] -= dt * 8;
        if (arr[i * 3 + 2] < -10) {
          arr[i * 3 + 2] = 1;
          arr[i * 3 + 0] = (Math.random() - 0.5) * 2.5;
          arr[i * 3 + 1] = Math.random() * 3 + 1;
        }
      }
      attr.needsUpdate = true;
    }
  });
  return (
    <>
      <points ref={sparkleRef}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[sparklePos, 3]} /></bufferGeometry>
        <pointsMaterial color="#fde047" size={0.18} transparent opacity={0.95} sizeAttenuation depthWrite={false} />
      </points>
      <points ref={streakRef}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[streakPos, 3]} /></bufferGeometry>
        <pointsMaterial color="#bae6fd" size={0.12} transparent opacity={0.7} sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
}

function EmoteBubble({ pulses, playerId }: { pulses: Map<string, { emote: string; at: number }>; playerId: string }) {
  const ref = useRef<THREE.Group>(null);
  const [visible, setVisible] = useState(false);
  const [emote, setEmote] = useState("");
  useFrame(({ camera }) => {
    if (!ref.current) return;
    const entry = pulses.get(playerId);
    if (entry) {
      const age = performance.now() - entry.at;
      if (age < 2800) {
        if (!visible || entry.emote !== emote) { setVisible(true); setEmote(entry.emote); }
        const t = age / 2800;
        // pop up + slight float
        const scale = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.85) / 0.15);
        ref.current.scale.set(scale, scale, scale);
        ref.current.position.y = 2.6 + Math.sin(performance.now() * 0.005) * 0.1;
        ref.current.quaternion.copy(camera.quaternion);
      } else if (visible) {
        setVisible(false);
      }
    } else if (visible) {
      setVisible(false);
    }
  });
  const tex = useMemo(() => (emote ? makeIconTexture(emote) : null), [emote]);
  if (!visible || !tex) return null;
  return (
    <group ref={ref} position={[0, 2.6, 0]}>
      <mesh>
        <sphereGeometry args={[0.35, 12, 10]} />
        <meshStandardMaterial color="#fffbeb" emissive="#fbcfe8" emissiveIntensity={0.3} />
      </mesh>
      <sprite position={[0, 0, 0.35]} scale={[0.45, 0.45, 1]}>
        <spriteMaterial map={tex} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

const MonsterView = React.memo(function MonsterView({ m, selected, onClick, onHoverIn, onHoverOut, attackPulses }: { m: Monster; selected: boolean; onClick: () => void; onHoverIn: () => void; onHoverOut: () => void; attackPulses: Map<string, number> }) {
  const ref = useRef<THREE.Group>(null);
  const modelGroup = useRef<THREE.Group>(null);
  const billboardRef = useRef<THREE.Group>(null);
  const selectionRing = useRef<THREE.Mesh>(null);
  const lastPos = useRef({ x: m.pos.x, z: m.pos.z });
  const lastMoveAt = useRef(0);
  const tmp = useRef(new THREE.Vector3());
  const deathStart = useRef(0);
  const DEATH_DURATION = 1500;
  // LOD throttle — distance + visibility toggle only ~5Hz so we don't
  // dirty the scene graph 60×/sec for every monster.
  const lodAcc = useRef(0);
  useFrame((_, dt) => {
    if (ref.current) {
      const alpha = 1 - Math.exp(-dt * 18);
      const my = terrainHeight(m.pos.x, m.pos.z);
      ref.current.position.lerp(tmp.current.set(m.pos.x, my, m.pos.z), alpha);
      const dx = m.pos.x - lastPos.current.x;
      const dz = m.pos.z - lastPos.current.z;
      if (Math.hypot(dx, dz) > 0.001) {
        const targetY = Math.atan2(dx, dz);
        let dr = targetY - ref.current.rotation.y;
        while (dr > Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        ref.current.rotation.y += dr * alpha;
        lastMoveAt.current = performance.now();
        lastPos.current.x = m.pos.x;
        lastPos.current.z = m.pos.z;
      }
    }
    // death fade/sink animation
    if (m.dead) {
      if (deathStart.current === 0) deathStart.current = performance.now();
      const elapsed = performance.now() - deathStart.current;
      const t = Math.min(1, elapsed / DEATH_DURATION);
      if (modelGroup.current) {
        modelGroup.current.visible = t < 1;
        const s = Math.max(0.01, 1 - t * t);
        modelGroup.current.scale.set(s, Math.max(0.05, 1 - t), s);
        modelGroup.current.position.y = -t * 0.6;
        modelGroup.current.rotation.y = t * Math.PI * 0.3;
      }
      if (billboardRef.current) billboardRef.current.visible = false;
      if (selectionRing.current) selectionRing.current.visible = false;
    } else {
      // alive — reset on respawn
      if (deathStart.current !== 0) {
        deathStart.current = 0;
        if (modelGroup.current) {
          modelGroup.current.scale.set(1, 1, 1);
          modelGroup.current.position.y = 0;
          modelGroup.current.rotation.y = 0;
        }
      }
      // Distance-based LOD: model hides at MOB_MODEL_RADIUS, billboard at
      // MOB_BILLBOARD_RADIUS. Selected target overrides both so the player
      // can keep tracking it from far away. Throttled to ~5Hz to avoid
      // dirtying the scene graph every frame.
      lodAcc.current += dt;
      if (lodAcc.current >= 0.2) {
        lodAcc.current = 0;
        const dx = m.pos.x - sharedSelfPos.x;
        const dz = m.pos.z - sharedSelfPos.z;
        const distSq = dx * dx + dz * dz;
        const modelVisible = selected || distSq <= MOB_MODEL_RADIUS * MOB_MODEL_RADIUS;
        const billboardVisible = selected || distSq <= MOB_BILLBOARD_RADIUS * MOB_BILLBOARD_RADIUS;
        if (modelGroup.current && modelGroup.current.visible !== modelVisible) modelGroup.current.visible = modelVisible;
        if (billboardRef.current && billboardRef.current.visible !== billboardVisible) billboardRef.current.visible = billboardVisible;
      }
      if (selectionRing.current) {
        // only-assign-on-change for .visible to avoid scene-graph dirtying
        // for off-target monsters (most of them, most of the time).
        if (selectionRing.current.visible !== selected) selectionRing.current.visible = selected;
        // Rotation is purely visual — only spin it while it's actually shown.
        if (selected) selectionRing.current.rotation.z = performance.now() * 0.002;
      }
    }
  });
  return (
    <group ref={ref}>
      <group
        ref={modelGroup}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); if (!m.dead) onHoverIn(); }}
        onPointerOut={(e) => { e.stopPropagation(); onHoverOut(); }}
      >
        {m.kind === "slime" && <SlimeModel isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "wolf" && <WolfModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "orc" && (
          <group scale={1.4}>
            <OrcModel
              isMoving={() => performance.now() - lastMoveAt.current < 200}
              isDead={() => m.dead}
              isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }}
            />
          </group>
        )}
        {m.kind === "darklord" && (
          <group scale={2.4}>
            <DarklordModel
              isMoving={() => performance.now() - lastMoveAt.current < 200}
              isDead={() => m.dead}
              isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }}
            />
          </group>
        )}
        {m.kind === "tree_node" && <ResourceTree />}
        {m.kind === "rock_node" && <ResourceRock />}
        {m.kind === "berry_bush" && <ResourceBush />}
        {m.kind === "ore_node" && <ResourceOre />}
        {m.kind === "crystal_node" && <ResourceCrystal />}
        {m.kind === "chicken" && <ChickenModel isMoving={() => performance.now() - lastMoveAt.current < 250} />}
        {m.kind === "scorpion" && <ScorpionModel isMoving={() => performance.now() - lastMoveAt.current < 200} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "scorpion_lord" && <ScorpionLordModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "sand_worm" && <SandWormModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "yeti" && <YetiModel isMoving={() => performance.now() - lastMoveAt.current < 200} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "ice_wraith" && <IceWraithModel isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "snowman_giant" && <SnowmanGiantModel isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "bog_witch" && <BogWitchModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "swamp_serpent" && <SwampSerpentModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "pig" && <PigModel isMoving={() => performance.now() - lastMoveAt.current < 250} />}
        {m.kind === "cow" && <CowModel isMoving={() => performance.now() - lastMoveAt.current < 250} />}
        {m.kind === "boar" && <BoarModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "spider" && <SpiderModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "ghost" && <GhostModel isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "bat" && <BatModel isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "golem" && <GolemModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "fox" && <FoxModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "shadow_lord" && <ShadowLordModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "ice_giant" && <IceGiantModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "shadow_wolf" && <ShadowWolfModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "frost_spider" && <FrostSpiderModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "banshee" && <BansheeModel isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "skeleton_captain" && <SkeletonCaptainModel isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
      </group>
      <mesh ref={selectionRing} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.7, 0.85, 24]} />
        <meshBasicMaterial color="#fde047" transparent opacity={0.8} />
      </mesh>
      <group ref={billboardRef}>
        <Billboard y={MONSTER_BILLBOARD_Y[m.kind] ?? 1.2}>
          <LiveLabel initial={m.kind === "darklord" ? "⚜ DARK LORD ⚜" : m.kind} />
          <LiveBar getValue={() => m.hp / m.maxHp} color={m.kind === "darklord" ? "#a855f7" : "#ef4444"} y={-0.22} />
        </Billboard>
      </group>
    </group>
  );
}, (a, b) => a.m === b.m && a.selected === b.selected);

function DropView({ g, onClick, onHoverIn, onHoverOut }: { g: GroundItem; onClick: () => void; onHoverIn: () => void; onHoverOut: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 0.4 + Math.sin(clock.getElapsedTime() * 3) * 0.1;
    ref.current.rotation.y = clock.getElapsedTime();
  });
  const def = ITEMS[g.itemId];
  const color = def?.color ?? "#fbbf24";
  const baseY = terrainHeight(g.pos.x, g.pos.z);
  return (
    <group position={[g.pos.x, baseY, g.pos.z]}>
      {/* larger invisible click target so tiny drops are easy to grab */}
      <mesh
        position={[0, 0.5, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHoverIn(); }}
        onPointerOut={(e) => { e.stopPropagation(); onHoverOut(); }}
      >
        <cylinderGeometry args={[0.6, 0.6, 1.2, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
      </mesh>
      <Billboard y={0.9}>
        <SpriteText text={`${def?.icon ?? "?"} ${def?.name ?? g.itemId}${g.qty > 1 ? ` x${g.qty}` : ""}`} />
      </Billboard>
    </group>
  );
}

function Billboard({ y, children }: { y: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });
  return <group ref={ref} position={[0, y, 0]}>{children}</group>;
}

function SpriteText({ text }: { text: string }) {
  const texture = useMemo(() => makeLabelTexture(text, "#ffffff"), [text]);
  return (
    <sprite scale={[2.2, 0.4, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function makeLabelTexture(text: string, color: string) {
  const lines = text.split("\n");
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = lines.length > 1 ? 96 : 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (lines.length > 1) {
    // first line: title (amber, smaller, slightly transparent)
    ctx.font = "bold 22px sans-serif";
    ctx.strokeStyle = "black"; ctx.lineWidth = 4;
    ctx.fillStyle = "#fde047";
    ctx.strokeText(lines[0], 256, 22);
    ctx.fillText(lines[0], 256, 22);
    // second line: name + level
    ctx.font = "bold 28px sans-serif";
    ctx.strokeStyle = "black"; ctx.lineWidth = 4;
    ctx.fillStyle = color;
    ctx.strokeText(lines[1], 256, 60);
    ctx.fillText(lines[1], 256, 60);
  } else {
    ctx.font = "bold 28px sans-serif";
    ctx.strokeStyle = "black"; ctx.lineWidth = 4;
    ctx.fillStyle = color;
    ctx.strokeText(text, 256, 32);
    ctx.fillText(text, 256, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const LiveLabel = React.forwardRef<THREE.Sprite, { initial: string }>(function LiveLabel({ initial }, ref) {
  const texture = useMemo(() => makeLabelTexture(initial, "#ffffff"), []);
  return (
    <sprite ref={ref} scale={[2.2, 0.4, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
});

function LiveBar({ getValue, color, y }: { getValue: () => number; color: string; y: number }) {
  const fillRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!fillRef.current) return;
    const v = Math.max(0, Math.min(1, getValue()));
    fillRef.current.scale.x = v;
    fillRef.current.position.x = -(1 - v) * 0.5;
  });
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <planeGeometry args={[1.0, 0.08]} />
        <meshBasicMaterial color="#111" transparent depthTest={false} />
      </mesh>
      <mesh ref={fillRef} position={[0, 0, 0.001]}>
        <planeGeometry args={[1.0, 0.08]} />
        <meshBasicMaterial color={color} transparent depthTest={false} />
      </mesh>
    </group>
  );
}
