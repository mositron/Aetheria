import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getStateCallbacks, type Room } from "colyseus.js";
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
import { AmbientParticles } from "./AmbientParticles";
import { Weather } from "./Weather";
import { HeroModel } from "./models/HeroModel";
import { SlimeModel } from "./models/SlimeModel";
import { WolfModel } from "./models/WolfModel";

const ATTACK_RANGE_BUFFER = 0.3;

const COLORS = {
  self: "#4ade80",
  other: "#60a5fa",
  slime: "#a3e635",
  wolf: "#9ca3af",
} as const;

export function Scene({ room }: { room: Room<WorldState> }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [drops, setDrops] = useState<GroundItem[]>([]);
  const [plants, setPlants] = useState<PlantNode[]>([]);
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
  const pickupTarget = useRef<string | null>(null);
  const botWanderTarget = useRef<{ x: number; z: number } | null>(null);
  const lastAutoPickupAt = useRef(0);
  const lastAutoAttack = useRef(0);
  const lastAutoSkill = useRef(new Map<string, number>());
  const [marker, setMarker] = useState<{ x: number; z: number; t: number } | null>(null);

  // cursor helper
  const setCursor = (c: string) => { document.body.style.cursor = c; };
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
    refreshPlayers(); refreshMonsters(); refreshDrops(); refreshPlants();
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
      if (usingKeys) walkTarget.current = null; // keyboard overrides click-to-walk

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
        if (!pickupTarget.current) {
          const cur = useStore.getState().targetMonsterId;
          const curMon = cur ? room.state.monsters.get(cur) : null;
          if (!curMon || curMon.dead) {
            let near: string | null = null, nd = 60;
            for (const [, mon] of room.state.monsters) {
              if (mon.dead) continue;
              const cfg = (MONSTERS as any)[mon.kind];
              if (!cfg || cfg.aggroRange <= 0) continue;
              const d = Math.hypot(mon.pos.x - me.pos.x, mon.pos.z - me.pos.z);
              if (d < nd) { nd = d; near = mon.id; }
            }
            if (near) {
              useStore.setState({ targetMonsterId: near });
              botWanderTarget.current = null;
            }
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

      // ranged players use their primary skill instead of melee
      const job = JOBS[me.job as JobId];
      const primary = job?.skills.find((s) => s.hotkey === 1 && s.range > 2.5 && (s.damageMult > 0));
      const engageRange = primary ? primary.range - 0.5 : (GAME_CONFIG.ATTACK_RANGE - ATTACK_RANGE_BUFFER);

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
          // in range: prefer ranged skill (if MP), else basic attack
          const now = Date.now();
          if (primary && me.mp >= primary.manaCost) {
            const key = primary.id;
            const last = lastAutoSkill.current.get(key) ?? 0;
            if (now - last >= primary.cooldownMs) {
              lastAutoSkill.current.set(key, now);
              // optimistic cast pulse so animation starts immediately
              castPulses.current.set(sessionId, performance.now());
              room.send("skill", { skillId: primary.id, targetId });
            }
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

      seq.current += 1;
      const rotY = (mx || mz) ? Math.atan2(mx, mz) : me.rotY;
      room.send("input", { mx, mz, rotY, seq: seq.current });
    }, 50);
    return () => clearInterval(id);
  }, [room, keys, targetId, sessionId]);

  // attack on space; pickup on F
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (keyEq(e, " ") && targetId) room.send("attack", { targetId });
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
    if (selfRef.current) {
      // smoothly lerp self position toward server-authoritative pos
      tmpVec.current.set(me.pos.x, 0, me.pos.z);
      selfRef.current.position.lerp(tmpVec.current, alpha);
      // rotation: shortest-path lerp
      const cur = selfRef.current.rotation.y;
      let delta = me.rotY - cur;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      selfRef.current.rotation.y = cur + delta * alpha;
    }
    // camera follows the *visual* (smoothed) position, not the raw server pos
    const visualX = selfRef.current?.position.x ?? me.pos.x;
    const visualZ = selfRef.current?.position.z ?? me.pos.z;
    const flyOffset = me.flying ? 5.0 : 0; // match new altitude
    const { yaw, pitch, dist } = cam.current;
    const target = tmpVec.current.set(visualX, 1 + flyOffset, visualZ);
    const desired = tmpVec2.current.set(
      visualX + Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist + flyOffset,
      visualZ + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    const camAlpha = 1 - Math.exp(-dt * 10);
    camera.position.lerp(desired, camAlpha);
    camera.lookAt(target);
  });

  const ground = mapDef.size;

  return (
    <group>
      <Environment mapId={mapDef.id} />
      <AmbientParticles room={room} />
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
      {marker && Date.now() - marker.t < 800 && <ClickMarker x={marker.x} z={marker.z} t0={marker.t} />}

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
          onHoverIn={() => setCursor("crosshair")}
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
        <HeroModel bodyColor={n.color} isMoving={() => false} />
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
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 64;
    const x = c.getContext("2d")!;
    x.font = "bold 30px sans-serif";
    x.fillStyle = "#fde68a";
    x.strokeStyle = "black"; x.lineWidth = 5;
    x.textAlign = "center"; x.textBaseline = "middle";
    x.strokeText(text, 256, 32); x.fillText(text, 256, 32);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }, [text]);
  return (
    <sprite ref={ref} position={[0, y, 0]} scale={[2.4, 0.4, 1]}>
      <spriteMaterial map={tex} transparent depthTest={false} />
    </sprite>
  );
}

function ClickMarker({ x, z, t0 }: { x: number; z: number; t0: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const age = (Date.now() - t0) / 800;
    const s = 1 + age * 2;
    ref.current.scale.set(s, 1, s);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - age);
  });
  return (
    <mesh ref={ref} position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.45, 24]} />
      <meshBasicMaterial color="#fde047" transparent />
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
  const tail = useRef<THREE.Mesh>(null);
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
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.7, 0.3, 0.5]} /><meshStandardMaterial color="#92400e" flatShading /></mesh>
      <mesh position={[0, 0.3, 0.3]}><boxGeometry args={[0.5, 0.25, 0.25]} /><meshStandardMaterial color="#b45309" flatShading /></mesh>
      {/* pincers */}
      <mesh position={[-0.35, 0.3, 0.4]}><boxGeometry args={[0.18, 0.12, 0.18]} /><meshStandardMaterial color="#92400e" flatShading /></mesh>
      <mesh position={[0.35, 0.3, 0.4]}><boxGeometry args={[0.18, 0.12, 0.18]} /><meshStandardMaterial color="#92400e" flatShading /></mesh>
      {/* tail with stinger */}
      <mesh ref={tail} position={[0, 0.5, -0.3]}>
        <boxGeometry args={[0.12, 0.6, 0.12]} />
        <meshStandardMaterial color="#92400e" flatShading />
      </mesh>
      <mesh position={[0, 0.85, -0.45]}><boxGeometry args={[0.1, 0.12, 0.1]} /><meshStandardMaterial color="#1f2937" flatShading /></mesh>
      {/* legs */}
      {[-0.3, -0.1, 0.1, 0.3].map((zx, i) => (
        <group key={i}>
          <mesh position={[-0.35, 0.12, zx]}><boxGeometry args={[0.06, 0.18, 0.06]} /><meshStandardMaterial color="#78350f" flatShading /></mesh>
          <mesh position={[0.35, 0.12, zx]}><boxGeometry args={[0.06, 0.18, 0.06]} /><meshStandardMaterial color="#78350f" flatShading /></mesh>
        </group>
      ))}
      {/* eyes (cute) */}
      <mesh position={[-0.1, 0.4, 0.42]}><boxGeometry args={[0.06, 0.06, 0.02]} /><meshBasicMaterial color="#fde047" /></mesh>
      <mesh position={[0.1, 0.4, 0.42]}><boxGeometry args={[0.06, 0.06, 0.02]} /><meshBasicMaterial color="#fde047" /></mesh>
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
      {/* big white body */}
      <mesh position={[0, 1.0, 0]}><boxGeometry args={[0.9, 1.0, 0.55]} /><meshStandardMaterial color="#f0f9ff" flatShading /></mesh>
      <mesh position={[0, 1.85, 0]}><boxGeometry args={[0.7, 0.7, 0.5]} /><meshStandardMaterial color="#f0f9ff" flatShading /></mesh>
      {/* horns */}
      <mesh position={[-0.22, 2.25, 0]}><boxGeometry args={[0.1, 0.25, 0.1]} /><meshStandardMaterial color="#94a3b8" flatShading /></mesh>
      <mesh position={[0.22, 2.25, 0]}><boxGeometry args={[0.1, 0.25, 0.1]} /><meshStandardMaterial color="#94a3b8" flatShading /></mesh>
      {/* face */}
      <mesh position={[-0.18, 1.9, 0.26]}><boxGeometry args={[0.12, 0.14, 0.02]} /><meshBasicMaterial color="#fff" /></mesh>
      <mesh position={[0.18, 1.9, 0.26]}><boxGeometry args={[0.12, 0.14, 0.02]} /><meshBasicMaterial color="#fff" /></mesh>
      <mesh position={[-0.18, 1.9, 0.27]}><boxGeometry args={[0.06, 0.08, 0.01]} /><meshBasicMaterial color="#1f2937" /></mesh>
      <mesh position={[0.18, 1.9, 0.27]}><boxGeometry args={[0.06, 0.08, 0.01]} /><meshBasicMaterial color="#1f2937" /></mesh>
      <mesh position={[0, 1.7, 0.27]}><boxGeometry args={[0.18, 0.04, 0.01]} /><meshBasicMaterial color="#1f2937" /></mesh>
      {/* arms */}
      <mesh ref={leftArm} position={[-0.55, 1.2, 0]}><boxGeometry args={[0.2, 0.8, 0.2]} /><meshStandardMaterial color="#e0f2fe" flatShading /></mesh>
      <mesh ref={rightArm} position={[0.55, 1.2, 0]}><boxGeometry args={[0.2, 0.8, 0.2]} /><meshStandardMaterial color="#e0f2fe" flatShading /></mesh>
      {/* legs */}
      <mesh position={[-0.2, 0.3, 0]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial color="#f0f9ff" flatShading /></mesh>
      <mesh position={[0.2, 0.3, 0]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial color="#f0f9ff" flatShading /></mesh>
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
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.4, 0.35, 0.5]} />
        <meshStandardMaterial color="#f8fafc" flatShading />
      </mesh>
      <mesh position={[0, 0.7, 0.12]}>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color="#f8fafc" flatShading />
      </mesh>
      <mesh position={[0, 0.72, 0.27]}>
        <boxGeometry args={[0.08, 0.06, 0.1]} />
        <meshStandardMaterial color="#fb923c" flatShading />
      </mesh>
      <mesh position={[0, 0.92, 0.08]}>
        <boxGeometry args={[0.1, 0.18, 0.06]} />
        <meshStandardMaterial color="#dc2626" flatShading />
      </mesh>
      <mesh position={[-0.1, 0.08, 0]}>
        <boxGeometry args={[0.06, 0.18, 0.06]} />
        <meshStandardMaterial color="#fb923c" flatShading />
      </mesh>
      <mesh position={[0.1, 0.08, 0]}>
        <boxGeometry args={[0.06, 0.18, 0.06]} />
        <meshStandardMaterial color="#fb923c" flatShading />
      </mesh>
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
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.65, 0.55, 0.95]} />
        <meshStandardMaterial color="#f9a8d4" flatShading />
      </mesh>
      <mesh position={[0, 0.7, 0.55]}>
        <boxGeometry args={[0.45, 0.45, 0.4]} />
        <meshStandardMaterial color="#f9a8d4" flatShading />
      </mesh>
      <mesh position={[0, 0.65, 0.78]}>
        <boxGeometry args={[0.18, 0.16, 0.1]} />
        <meshStandardMaterial color="#fb7185" flatShading />
      </mesh>
      {[[-0.22, 0, 0.32], [0.22, 0, 0.32], [-0.22, 0, -0.32], [0.22, 0, -0.32]].map(([x, y, z], i) => (
        <mesh key={i} position={[x as number, 0.13 + (y as number), z as number]}>
          <boxGeometry args={[0.14, 0.26, 0.14]} />
          <meshStandardMaterial color="#ec4899" flatShading />
        </mesh>
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
      {/* body */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[0.85, 0.7, 1.3]} />
        <meshStandardMaterial color="#f5f5f5" flatShading />
      </mesh>
      {/* spots */}
      <mesh position={[0.3, 1.05, 0.2]}>
        <boxGeometry args={[0.3, 0.35, 0.4]} />
        <meshStandardMaterial color="#171717" flatShading />
      </mesh>
      <mesh position={[-0.25, 0.95, -0.3]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#171717" flatShading />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.05, 0.75]}>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshStandardMaterial color="#f5f5f5" flatShading />
      </mesh>
      <mesh position={[0, 0.95, 1.05]}>
        <boxGeometry args={[0.25, 0.18, 0.12]} />
        <meshStandardMaterial color="#f9a8d4" flatShading />
      </mesh>
      {/* horns */}
      <mesh position={[-0.2, 1.4, 0.8]}>
        <boxGeometry args={[0.08, 0.18, 0.08]} />
        <meshStandardMaterial color="#fde047" flatShading />
      </mesh>
      <mesh position={[0.2, 1.4, 0.8]}>
        <boxGeometry args={[0.08, 0.18, 0.08]} />
        <meshStandardMaterial color="#fde047" flatShading />
      </mesh>
      {/* legs */}
      {[[-0.3, 0, 0.4], [0.3, 0, 0.4], [-0.3, 0, -0.4], [0.3, 0, -0.4]].map(([x, , z], i) => (
        <mesh key={i} position={[x as number, 0.25, z as number]}>
          <boxGeometry args={[0.16, 0.5, 0.16]} />
          <meshStandardMaterial color="#171717" flatShading />
        </mesh>
      ))}
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
      ref.current.position.lerp(tmp.current.set(p.pos.x, 0, p.pos.z), alpha);
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
    <group ref={(selfRef as any) ?? ref}>
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
  useFrame((_, dt) => {
    if (ref.current) {
      const alpha = 1 - Math.exp(-dt * 18);
      ref.current.position.lerp(tmp.current.set(m.pos.x, 0, m.pos.z), alpha);
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
      if (modelGroup.current) modelGroup.current.visible = true;
      if (billboardRef.current) billboardRef.current.visible = true;
      if (selectionRing.current) {
        selectionRing.current.visible = selected;
        selectionRing.current.rotation.z = performance.now() * 0.002;
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
          <group scale={1.2}>
            <HeroModel bodyColor="#5a8c3e" isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} hasWeapon={() => true} />
          </group>
        )}
        {m.kind === "darklord" && (
          <group scale={2.2}>
            <HeroModel bodyColor="#7c1d6f" isMoving={() => performance.now() - lastMoveAt.current < 200} isDead={() => m.dead} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} hasWeapon={() => true} />
            <pointLight position={[0, 2, 0]} color="#a855f7" intensity={3} distance={10} />
          </group>
        )}
        {m.kind === "tree_node" && <ResourceTree />}
        {m.kind === "rock_node" && <ResourceRock />}
        {m.kind === "berry_bush" && <ResourceBush />}
        {m.kind === "ore_node" && <ResourceOre />}
        {m.kind === "crystal_node" && <ResourceCrystal />}
        {m.kind === "chicken" && <ChickenModel isMoving={() => performance.now() - lastMoveAt.current < 250} />}
        {m.kind === "scorpion" && <ScorpionModel isMoving={() => performance.now() - lastMoveAt.current < 200} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "yeti" && <YetiModel isMoving={() => performance.now() - lastMoveAt.current < 200} isAttacking={() => { const t = attackPulses.get(m.id); return !!t && performance.now() - t < 60; }} />}
        {m.kind === "pig" && <PigModel isMoving={() => performance.now() - lastMoveAt.current < 250} />}
        {m.kind === "cow" && <CowModel isMoving={() => performance.now() - lastMoveAt.current < 250} />}
      </group>
      <mesh ref={selectionRing} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.7, 0.85, 24]} />
        <meshBasicMaterial color="#fde047" transparent opacity={0.8} />
      </mesh>
      <group ref={billboardRef}>
        <Billboard y={m.kind === "darklord" ? 5 : m.kind === "orc" ? 2.7 : m.kind === "wolf" ? 1.5 : 1.2}>
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
  return (
    <group position={[g.pos.x, 0, g.pos.z]}>
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
