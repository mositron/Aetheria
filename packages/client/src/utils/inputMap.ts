// Godot-style InputMap: action → multiple bindings (keyboard / mouse / gamepad),
// fully remappable, layout-independent. Persists to localStorage.
//
//   useAction("attack", () => doAttack());
//   if (Input.isActionPressed("forward")) ...
//   Input.getAxis("moveX")   // -1..1 from gamepad/keyboard

import { useEffect } from "react";

// ── Binding types ───────────────────────────────────────────────────────────
type KeyBinding =     { type: "key"; code: string };          // e.g. "KeyW", "Space"
type MouseBinding =   { type: "mouse"; button: 0 | 1 | 2 };   // 0=L, 1=M, 2=R
type GamepadButton =  { type: "pad"; button: number };        // standard gamepad button index
type GamepadAxis =    { type: "axis"; axis: number; dir: 1 | -1; deadzone?: number };
export type Binding = KeyBinding | MouseBinding | GamepadButton | GamepadAxis;

export type ActionMap = Record<string, Binding[]>;

// ── Defaults (Aetheria) ─────────────────────────────────────────────────────
export const DEFAULT_ACTIONS: ActionMap = {
  forward:  [{ type: "key", code: "KeyW" }, { type: "key", code: "ArrowUp" }],
  back:     [{ type: "key", code: "KeyS" }, { type: "key", code: "ArrowDown" }],
  left:     [{ type: "key", code: "KeyA" }, { type: "key", code: "ArrowLeft" }],
  right:    [{ type: "key", code: "KeyD" }, { type: "key", code: "ArrowRight" }],
  jump:     [{ type: "key", code: "Space" }, { type: "pad", button: 0 }],   // A
  attack:   [{ type: "mouse", button: 0 }, { type: "pad", button: 2 }],     // X
  pickup:   [{ type: "key", code: "KeyE" }, { type: "pad", button: 3 }],    // Y
  interact: [{ type: "key", code: "KeyF" }, { type: "pad", button: 1 }],    // B
  inventory:[{ type: "key", code: "KeyI" }, { type: "pad", button: 8 }],
  map:      [{ type: "key", code: "KeyM" }],
  chat:     [{ type: "key", code: "Enter" }],
  bot:      [{ type: "key", code: "KeyB" }],
  fly:      [{ type: "key", code: "KeyG" }],
  emote:    [{ type: "key", code: "KeyT" }],
  photo:    [{ type: "key", code: "KeyP" }],
  cancel:   [{ type: "key", code: "Escape" }],
  skill1:   [{ type: "key", code: "Digit1" }],
  skill2:   [{ type: "key", code: "Digit2" }],
  skill3:   [{ type: "key", code: "Digit3" }],
  skill4:   [{ type: "key", code: "Digit4" }],
};

// ── State ───────────────────────────────────────────────────────────────────
class InputManager {
  private actions: ActionMap = { ...DEFAULT_ACTIONS };
  private pressed = new Set<string>();         // active key codes
  private mouseButtons = new Set<number>();
  private justPressed = new Set<string>();     // actions pressed THIS frame
  private justReleased = new Set<string>();
  private lastState = new Map<string, boolean>();
  private listeners = new Map<string, Set<() => void>>();
  private gamepadIndex: number | null = null;

  load(): void {
    try {
      const stored = localStorage.getItem("aetheria.actions");
      if (stored) this.actions = { ...DEFAULT_ACTIONS, ...JSON.parse(stored) };
    } catch {}
  }

  save(): void {
    try { localStorage.setItem("aetheria.actions", JSON.stringify(this.actions)); } catch {}
  }

  rebind(action: string, bindings: Binding[]): void {
    this.actions[action] = bindings;
    this.save();
  }

  getBindings(action: string): Binding[] { return this.actions[action] ?? []; }

  attach(): () => void {
    const keydown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      this.pressed.add(e.code);
    };
    const keyup = (e: KeyboardEvent) => this.pressed.delete(e.code);
    const mdown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-no-input]")) return;
      this.mouseButtons.add(e.button);
    };
    const mup = (e: MouseEvent) => this.mouseButtons.delete(e.button);
    const blur = () => { this.pressed.clear(); this.mouseButtons.clear(); };
    const padConn = (e: GamepadEvent) => { this.gamepadIndex = e.gamepad.index; };
    const padDisc = () => { this.gamepadIndex = null; };

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("mousedown", mdown);
    window.addEventListener("mouseup", mup);
    window.addEventListener("blur", blur);
    window.addEventListener("gamepadconnected", padConn);
    window.addEventListener("gamepaddisconnected", padDisc);

    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("mousedown", mdown);
      window.removeEventListener("mouseup", mup);
      window.removeEventListener("blur", blur);
      window.removeEventListener("gamepadconnected", padConn);
      window.removeEventListener("gamepaddisconnected", padDisc);
    };
  }

  private gamepad(): Gamepad | null {
    if (this.gamepadIndex == null) return null;
    return navigator.getGamepads?.()?.[this.gamepadIndex] ?? null;
  }

  isActionPressed(action: string): boolean {
    const bindings = this.actions[action];
    if (!bindings) return false;
    const pad = this.gamepad();
    for (const b of bindings) {
      if (b.type === "key" && this.pressed.has(b.code)) return true;
      if (b.type === "mouse" && this.mouseButtons.has(b.button)) return true;
      if (pad) {
        if (b.type === "pad" && pad.buttons[b.button]?.pressed) return true;
        if (b.type === "axis") {
          const v = pad.axes[b.axis] ?? 0;
          const dz = b.deadzone ?? 0.2;
          if (b.dir === 1 && v > dz) return true;
          if (b.dir === -1 && v < -dz) return true;
        }
      }
    }
    return false;
  }

  // axis: returns value from -1..1, combining keys and gamepad axes.
  getAxis(negAction: string, posAction: string): number {
    let v = 0;
    if (this.isActionPressed(negAction)) v -= 1;
    if (this.isActionPressed(posAction)) v += 1;
    return Math.max(-1, Math.min(1, v));
  }

  getMoveVector(): { x: number; y: number } {
    const pad = this.gamepad();
    if (pad) {
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const dz = 0.15;
      const ax = Math.abs(x) > dz ? x : 0;
      const ay = Math.abs(y) > dz ? y : 0;
      if (ax || ay) return { x: ax, y: ay };
    }
    return { x: this.getAxis("left", "right"), y: this.getAxis("forward", "back") };
  }

  // Called once per frame from app root to compute "just pressed/released".
  tick(): void {
    this.justPressed.clear();
    this.justReleased.clear();
    for (const action of Object.keys(this.actions)) {
      const now = this.isActionPressed(action);
      const was = this.lastState.get(action) ?? false;
      if (now && !was) {
        this.justPressed.add(action);
        const ls = this.listeners.get(action);
        if (ls) for (const fn of ls) { try { fn(); } catch (e) { console.error(e); } }
      }
      if (!now && was) this.justReleased.add(action);
      this.lastState.set(action, now);
    }
  }

  isActionJustPressed(action: string): boolean { return this.justPressed.has(action); }
  isActionJustReleased(action: string): boolean { return this.justReleased.has(action); }

  onPress(action: string, fn: () => void): () => void {
    const set = this.listeners.get(action) ?? this.listeners.set(action, new Set()).get(action)!;
    set.add(fn);
    return () => set.delete(fn);
  }
}

export const Input = new InputManager();
Input.load();

// ── React hooks ─────────────────────────────────────────────────────────────
export function useInputAttach() {
  useEffect(() => Input.attach(), []);
}

export function useAction(action: string, fn: () => void) {
  useEffect(() => Input.onPress(action, fn), [action, fn]);
}

// Pretty-print a binding for the keybind UI.
export function describeBinding(b: Binding): string {
  if (b.type === "key") return b.code.replace(/^Key/, "").replace(/^Digit/, "").replace("Arrow", "↑↓←→ "[0]);
  if (b.type === "mouse") return ["LMB", "MMB", "RMB"][b.button] ?? `M${b.button}`;
  if (b.type === "pad") return `Pad ${b.button}`;
  if (b.type === "axis") return `Axis ${b.axis}${b.dir > 0 ? "+" : "-"}`;
  return "?";
}
