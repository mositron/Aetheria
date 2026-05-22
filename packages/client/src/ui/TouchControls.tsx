import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { MONSTERS, MAPS, biomeAt, type Player, type WorldState, type MapId } from "@game/shared";
import { useStore } from "../store";
import { useT } from "../locales/useT";
import { AutoPotionPoller, useAutoPotionDialog, loadAutoPotion } from "./AutoPotion";

/** Virtual joystick + radial action buttons. Works for touch AND mouse. */
export function TouchControls({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const touch = matchMedia("(hover: none) and (pointer: coarse)").matches;
    setIsTouch(touch);
  }, []);

  return (
    <>
      <JoystickHint />
      {isTouch && <VirtualJoystick />}
      <ActionButtons room={room} />
      <AutoPotionPoller room={room} />
    </>
  );
}

/**
 * Subtle bottom-left circle hint that the player can drag finger there to move.
 * Doesn't intercept input (pointer-events: none) — purely visual indicator.
 * The actual whole-screen drag is handled by <ScreenJoystick/>.
 */
function JoystickHint() {
  const knobRef = useRef<HTMLDivElement>(null);
  // Knob follows BOTH (a) finger drag via "virtual-stick" events from
  // ScreenJoystick, AND (b) WASD / arrow keys via local keydown tracking.
  useEffect(() => {
    const KNOB_TRAVEL = 30;
    const stick = { x: 0, y: 0 };          // last drag value (from screen joystick)
    const keys: Record<string, boolean> = {};

    function applyVisual() {
      if (!knobRef.current) return;
      // Derive WASD vector
      let kx = 0, ky = 0;
      if (keys.left)  kx -= 1;
      if (keys.right) kx += 1;
      if (keys.up)    ky -= 1;
      if (keys.down)  ky += 1;
      if (kx || ky) {
        const m = Math.hypot(kx, ky) || 1;
        kx /= m; ky /= m;
      }
      // Combine drag + keys (drag wins if non-zero)
      const x = (stick.x || stick.y) ? stick.x : kx;
      const y = (stick.x || stick.y) ? stick.y : ky;
      knobRef.current.style.transform = `translate(calc(-50% + ${x * KNOB_TRAVEL}px), calc(-50% + ${y * KNOB_TRAVEL}px))`;
    }

    const onStick = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number }>).detail;
      stick.x = d.x; stick.y = d.y;
      applyVisual();
    };

    function keyForCode(code: string): keyof typeof keys | null {
      if (code === "KeyW" || code === "ArrowUp")    return "up";
      if (code === "KeyS" || code === "ArrowDown")  return "down";
      if (code === "KeyA" || code === "ArrowLeft")  return "left";
      if (code === "KeyD" || code === "ArrowRight") return "right";
      return null;
    }
    const onDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      const k = keyForCode(e.code);
      if (!k) return;
      keys[k] = true;
      applyVisual();
    };
    const onUp = (e: KeyboardEvent) => {
      const k = keyForCode(e.code);
      if (!k) return;
      keys[k] = false;
      applyVisual();
    };
    const onBlur = () => {
      keys.up = keys.down = keys.left = keys.right = false;
      applyVisual();
    };

    window.addEventListener("virtual-stick", onStick);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("virtual-stick", onStick);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  const stop = (e: React.PointerEvent | React.MouseEvent) => { e.stopPropagation(); };
  return (
    <div
      className="absolute select-none"
      onPointerDown={stop}
      onClick={stop}
      style={{
        // Mirror Attack button: same insets from corner (2.5rem from left + bottom)
        left: "2.5rem",
        bottom: "2.5rem",
        width: 110,
        height: 110,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.18) 70%, transparent 100%)",
        border: "1px dashed rgba(255,255,255,0.18)",
        boxShadow: "inset 0 0 24px rgba(0,0,0,0.3)",
        touchAction: "none",
      }}
    >
      <div
        ref={knobRef}
        className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{
          width: 40, height: 40,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: "1px dashed rgba(255,255,255,0.35)",
          background: "rgba(255,255,255,0.08)",
          transition: "transform 60ms linear",
        }}
      />
    </div>
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
  const potionDialog = useAutoPotionDialog();
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const on = () => forceRerender((n) => n + 1);
    window.addEventListener("autopotion-changed", on);
    return () => window.removeEventListener("autopotion-changed", on);
  }, []);

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

  // 3-zone right-side layout (no overlap):
  //   • bottom-[13rem]: utility row (Auto + บิน/เก็บ/โพชั่น) — far above Attack
  //   • arc around Attack (skills from Hotbar.tsx)
  //   • bottom-6 right-6: Attack alone
  return (
    <>
      {/* ── Utility row: bottom + shifted left (follows the Attack cluster shift) ── */}
      <div className="absolute flex flex-wrap gap-1.5 justify-end select-none touch-none max-w-[14rem] opacity-70" style={{ bottom: "2.5rem", right: "12rem" }} data-no-screen-joy>
        <ActionBtn
          label="🤖" name={botMode ? "ON" : "Auto"}
          hint={`Auto-Bot (B) ${botMode ? "ON" : "OFF"}`}
          size="sm" variant={botMode ? "bot-on" : "bot-off"}
          onClick={() => useStore.setState({ botMode: !useStore.getState().botMode })}
        />
        <ActionBtn
          label={me?.flying ? "🪂" : "🪽"} name={me?.flying ? t('touch.flyLand') : t('touch.fly')}
          hint={me?.flying ? t('touch.flyLandHint') : t('touch.flyHint')}
          size="sm" variant={me?.flying ? "bot-on" : undefined}
          onClick={() => room.send("toggleFly", {})}
        />
        <ActionBtn label="🤚" name={t('touch.pickup')} hint={t('touch.pickupHint')} size="sm" onClick={() => send("pickup")} />
        <ActionBtn
          label={loadAutoPotion().enabled ? "🧪" : "🚫"}
          name="auto-pot"
          hint={t('touch.autoPotionHint')}
          size="sm"
          variant={loadAutoPotion().enabled ? "bot-on" : undefined}
          onClick={potionDialog.open}
        />
        {potionDialog.render}
        {me?.petKind && (
          <ActionBtn
            label={me.mounted ? "🚶" : "🐎"} name={me.mounted ? t('touch.dismount') : t('touch.mount')}
            hint={me.mounted ? t('touch.dismountHint') : t('touch.mountHint')}
            size="sm" variant={me.mounted ? "bot-on" : undefined}
            onClick={() => room.send("mount", {})}
          />
        )}
        {nearAnimalId && (
          <ActionBtn
            label="🌾" name={t('touch.feed')} hint={t('touch.feedHint')}
            size="sm" variant="bot-on"
            onClick={() => room.send("feedAnimal", { monsterId: nearAnimalId })}
          />
        )}
        {biomeSpellIcon && targetId && (
          <ActionBtn
            label={biomeSpellIcon} name={t('touch.biomeSpell')} hint={t('touch.biomeSpellHint')}
            size="sm" variant="bot-on"
            onClick={() => room.send("biomeSpell", { targetId })}
          />
        )}
      </div>

      {/* ── Attack: shifted up-left from corner so thumb can reach comfortably ── */}
      <div className="absolute select-none touch-none" style={{ bottom: "2.5rem", right: "2.5rem" }} data-no-screen-joy>
        <ActionBtn label="⚔" name={t('touch.attack')} hint={t('touch.attackHint')} size="lg" primary onClick={() => send("attack")} />
      </div>
    </>
  );
}

function ActionBtn({ label, name, hint, size, primary, variant, disabled, onClick }: { label: string; name?: string; hint?: string; size?: "sm" | "md" | "lg"; primary?: boolean; variant?: "bot-on" | "bot-off"; disabled?: boolean; onClick: () => void }) {
  // Shrink on mobile (landscape OR portrait) — uses MIN of w/h
  const isMobile = true; // unified compact sizing across screen sizes
  const dim = isMobile
    ? (size === "lg" ? 76 : size === "sm" ? 36 : 44)   // Attack 76px (was 64)
    : (size === "lg" ? 80 : size === "sm" ? 44 : 56);

  let bg: string;
  let border: string;
  let glow: string;
  let pulse = false;

  if (primary) {
    // Translucent orange gradient (Attack) so the scene behind shows through
    bg = "radial-gradient(circle at 30% 30%, rgba(251,146,60,0.78) 0%, rgba(194,65,12,0.78) 60%, rgba(124,45,18,0.78) 100%)";
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
        border: primary ? `2px solid ${border}` : "1px solid #000",
        boxShadow: disabled
          ? "0 0 0 rgba(0,0,0,0)"
          : `0 0 12px ${glow}, inset 0 1px 0 rgba(255,255,255,0.15), 0 3px 8px rgba(0,0,0,0.5)`,
        color: "#fff",
        opacity: disabled ? 0.35 : 1,
        fontSize: isMobile ? (size === "lg" ? 26 : 18) : (size === "lg" ? 36 : 24),
        textShadow: "0 2px 4px rgba(0,0,0,0.6)",
      }}
      title={hint}
    >
      {label}
      {name && !primary && (
        <span
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-white/50 bg-black/20 px-1 rounded-full whitespace-nowrap pointer-events-none"
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            textShadow: "0 1px 1px rgba(0,0,0,0.6)",
          }}
        >
          {name}
        </span>
      )}
    </button>
  );
}
