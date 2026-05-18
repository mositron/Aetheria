import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { MONSTERS, MAPS, biomeAt, type Player, type WorldState, type MapId } from "@game/shared";
import { useStore } from "../store";

/** Virtual joystick + radial action buttons. Works for touch AND mouse. */
export function TouchControls({ room }: { room: Room<WorldState> }) {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const touch = matchMedia("(hover: none) and (pointer: coarse)").matches;
    setIsTouch(touch);
  }, []);

  return (
    <>
      {isTouch && <VirtualJoystick />}
      <ActionButtons room={room} />
    </>
  );
}

/** Reports stick direction via a window event the input loop listens to. */
function VirtualJoystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const center = useRef({ x: 0, y: 0 });
  const radius = 60;

  useEffect(() => {
    const base = baseRef.current!;
    const knob = knobRef.current!;

    function start(clientX: number, clientY: number) {
      const r = base.getBoundingClientRect();
      center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      active.current = true;
      move(clientX, clientY);
    }
    function move(clientX: number, clientY: number) {
      if (!active.current) return;
      let dx = clientX - center.current.x;
      let dy = clientY - center.current.y;
      const d = Math.hypot(dx, dy);
      if (d > radius) { dx = (dx / d) * radius; dy = (dy / d) * radius; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / radius; // -1 .. 1
      const ny = dy / radius;
      window.dispatchEvent(new CustomEvent("virtual-stick", { detail: { x: nx, y: ny } }));
    }
    function end() {
      active.current = false;
      knob.style.transform = "translate(-50%, -50%)";
      window.dispatchEvent(new CustomEvent("virtual-stick", { detail: { x: 0, y: 0 } }));
    }

    const onTS = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; start(t.clientX, t.clientY); };
    const onTM = (e: TouchEvent) => { if (!active.current) return; e.preventDefault(); const t = e.touches[0]; if (t) move(t.clientX, t.clientY); };
    const onTE = (e: TouchEvent) => { e.preventDefault(); end(); };
    const onMD = (e: MouseEvent) => { start(e.clientX, e.clientY); };
    const onMM = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onMU = () => end();

    base.addEventListener("touchstart", onTS, { passive: false });
    base.addEventListener("touchmove", onTM, { passive: false });
    base.addEventListener("touchend", onTE, { passive: false });
    base.addEventListener("mousedown", onMD);
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", onMU);
    return () => {
      base.removeEventListener("touchstart", onTS);
      base.removeEventListener("touchmove", onTM);
      base.removeEventListener("touchend", onTE);
      base.removeEventListener("mousedown", onMD);
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mouseup", onMU);
    };
  }, []);

  return (
    <div
      ref={baseRef}
      data-no-screen-joy
      className="absolute bottom-6 left-6 w-36 h-36 rounded-full select-none touch-none"
      style={{
        background: "radial-gradient(circle, rgba(34,211,238,0.15) 0%, rgba(0,0,0,0.45) 70%)",
        border: "2px solid rgba(34, 211, 238, 0.35)",
        boxShadow: "0 0 30px rgba(34, 211, 238, 0.15), inset 0 0 20px rgba(0,0,0,0.4)",
      }}
    >
      <div
        ref={knobRef}
        className="absolute top-1/2 left-1/2"
        style={{
          width: 56, height: 56,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle at 30% 30%, #67e8f9 0%, #0891b2 70%, #164e63 100%)",
          border: "2px solid #22d3ee",
          boxShadow: "0 0 15px rgba(34,211,238,0.6), inset 0 2px 4px rgba(255,255,255,0.3)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/** Bottom-right action buttons. Big = Attack. Small fan = pickup/potion/skills. */
function ActionButtons({ room }: { room: Room<WorldState> }) {
  const targetId = useStore((s) => s.targetMonsterId);
  const setTarget = useStore((s) => s.setTarget);
  const botMode = useStore((s) => s.botMode);
  const sessionId = room.sessionId;
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, []);

  const me: Player | undefined = room.state.players.get(sessionId);

  // Detect biome spell availability
  let biomeSpellIcon: string | null = null;
  if (me && targetId) {
    const mapDef = MAPS[room.state.mapId as MapId];
    const biome = biomeAt(me.pos.x, me.pos.z, mapDef.size / 2);
    const map: Record<string, string> = {
      lake: "❄", forest: "🌿", mountains: "🪨", swamp: "☠", wilderness: "🌑",
    };
    biomeSpellIcon = map[biome] ?? null;
  }

  // Detect nearby tame-able animal (within 2.5m)
  let nearAnimalId: string | null = null;
  if (me && !me.petKind) {
    let nd = 2.5;
    for (const [, m] of room.state.monsters) {
      if (m.dead) continue;
      const cfg = (MONSTERS as any)[m.kind];
      if (cfg?.aggroRange !== -1) continue;
      const d = Math.hypot(m.pos.x - me.pos.x, m.pos.z - me.pos.z);
      if (d < nd) { nd = d; nearAnimalId = m.id; }
    }
  }

  function send(action: "attack" | "pickup" | "potion") {
    const me: Player | undefined = room.state.players.get(sessionId);
    if (!me) return;
    if (action === "attack") {
      // If current target invalid (dead or none), auto-pick nearest live monster
      let tid = targetId;
      const cur = tid ? room.state.monsters.get(tid) : null;
      const needNewTarget = !cur || cur.dead;
      if (needNewTarget) {
        let near: string | null = null, nd = 30;
        for (const [, m] of room.state.monsters) {
          if (m.dead) continue;
          const d = Math.hypot(m.pos.x - me.pos.x, m.pos.z - me.pos.z);
          if (d < nd) { nd = d; near = m.id; }
        }
        if (near) {
          setTarget(near);
          tid = near;
        }
      }
      // Scene's input loop auto-walks to target + auto-attacks once in range.
      // We still send a manual attack here in case we're already in range (instant response).
      if (tid) room.send("attack", { targetId: tid });
    } else if (action === "pickup") {
      let nearestId: string | null = null;
      let nearestD = Infinity;
      for (const [, g] of room.state.drops) {
        const d = Math.hypot(g.pos.x - me.pos.x, g.pos.z - me.pos.z);
        if (d < nearestD && d < 2.5) { nearestD = d; nearestId = g.id; }
      }
      if (nearestId) room.send("pickup", { dropId: nearestId });
    } else if (action === "potion") {
      for (let i = 0; i < me.inventory.length; i++) {
        if (me.inventory[i].itemId === "hp_potion") {
          room.send("useItem", { invIndex: i });
          break;
        }
      }
    }
  }

  return (
    <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2 select-none touch-none">
      <div className="flex gap-2">
        {biomeSpellIcon && targetId && (
          <ActionBtn
            label={biomeSpellIcon} name="เวท" hint="Biome spell (12 MP)"
            size="md" variant="bot-on"
            onClick={() => room.send("biomeSpell", { targetId })}
          />
        )}
        {nearAnimalId && (
          <ActionBtn
            label="🌾" name="ป้อน" hint="ให้อาหาร (จับเป็นสัตว์เลี้ยง)"
            size="md" variant="bot-on"
            onClick={() => room.send("feedAnimal", { monsterId: nearAnimalId })}
          />
        )}
        {me?.petKind && (
          <ActionBtn
            label={me.mounted ? "🚶" : "🐎"} name={me.mounted ? "ลง" : "ขี่"}
            hint={me.mounted ? "ลงจากสัตว์" : "ขึ้นขี่"}
            size="md" variant={me.mounted ? "bot-on" : undefined}
            onClick={() => room.send("mount", {})}
          />
        )}
        <ActionBtn
          label={me?.flying ? "🪂" : "🪽"} name={me?.flying ? "ลง" : "บิน"}
          hint={me?.flying ? "ลงพื้น" : "บิน (Lv10+ หรือชนะ Dark Lord)"}
          size="md" variant={me?.flying ? "bot-on" : undefined}
          onClick={() => room.send("toggleFly", {})}
        />
        <ActionBtn label="🤚" name="เก็บ" hint="หยิบ" size="md" onClick={() => send("pickup")} />
        <ActionBtn label="🧪" name="โพชั่น" hint="พอชั่น" size="md" onClick={() => send("potion")} />
      </div>
      <div className="flex items-end gap-2">
        <ActionBtn
          label="🤖" name={botMode ? "ON" : "Auto"}
          hint={`Auto-Bot (B) ${botMode ? "ON" : "OFF"}`}
          size="md" variant={botMode ? "bot-on" : "bot-off"}
          onClick={() => useStore.setState({ botMode: !useStore.getState().botMode })}
        />
        <ActionBtn label="⚔" name="โจมตี" hint="โจมตี (เลือก mob ใกล้สุดอัตโนมัติ)" size="lg" primary onClick={() => send("attack")} />
      </div>
    </div>
  );
}

function ActionBtn({ label, name, hint, size, primary, variant, disabled, onClick }: { label: string; name?: string; hint?: string; size?: "md" | "lg"; primary?: boolean; variant?: "bot-on" | "bot-off"; disabled?: boolean; onClick: () => void }) {
  const dim = size === "lg" ? 80 : 56;

  let bg: string;
  let border: string;
  let glow: string;
  let pulse = false;

  if (primary) {
    bg = "radial-gradient(circle at 30% 30%, #fb923c 0%, #c2410c 60%, #7c2d12 100%)";
    border = "#fb923c";
    glow = "rgba(251,146,60,0.5)";
  } else if (variant === "bot-on") {
    bg = "radial-gradient(circle at 30% 30%, #34d399 0%, #047857 60%, #064e3b 100%)";
    border = "#34d399";
    glow = "rgba(52,211,153,0.7)";
    pulse = true;
  } else if (variant === "bot-off") {
    bg = "radial-gradient(circle at 30% 30%, #334155 0%, #1e293b 60%, #0f172a 100%)";
    border = "#475569";
    glow = "rgba(100,116,139,0.2)";
  } else {
    bg = "radial-gradient(circle at 30% 30%, #475569 0%, #1e293b 60%, #0f172a 100%)";
    border = "#64748b";
    glow = "rgba(100,116,139,0.3)";
  }

  return (
    <button
      onClick={onClick}
      onTouchStart={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      className={`relative active:scale-95 transition-transform ${pulse ? "animate-pulse" : ""}`}
      style={{
        width: dim, height: dim,
        borderRadius: "50%",
        background: bg,
        border: `2px solid ${border}`,
        boxShadow: disabled
          ? "0 0 0 rgba(0,0,0,0)"
          : `0 0 18px ${glow}, inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.4)`,
        color: "#fff",
        opacity: disabled ? 0.35 : 1,
        fontSize: size === "lg" ? 36 : 24,
        textShadow: "0 2px 4px rgba(0,0,0,0.6)",
      }}
      title={hint}
    >
      {label}
      {name && (
        <span
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-black/70 px-1.5 rounded-full whitespace-nowrap pointer-events-none"
          style={{
            border: "1px solid rgba(255,255,255,0.3)",
            textShadow: "0 1px 1px rgba(0,0,0,0.8)",
          }}
        >
          {name}
        </span>
      )}
    </button>
  );
}
