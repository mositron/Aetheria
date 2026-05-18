import { useEffect } from "react";

/**
 * Whole-screen virtual joystick: press-and-drag anywhere on the game canvas
 * (not on UI controls) to steer the character. Quick taps still pass through
 * to the click-to-walk handler in Scene.tsx.
 *
 * Stick output emitted via the same "virtual-stick" CustomEvent the input loop
 * already listens to, so no extra wiring is needed.
 */
export function ScreenJoystick() {
  useEffect(() => {
    let active = false;
    let pointerId: number | null = null;
    let startX = 0, startY = 0;
    let dragging = false;
    const RADIUS = 90;          // distance after which stick is "full"
    const DRAG_THRESHOLD = 14;  // px move before we consider it a drag

    // Helper: should we ignore this pointer because the user is interacting with UI?
    function shouldIgnore(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false;
      // Skip buttons, inputs, sliders, anchors
      if (target.closest("button, input, textarea, select, a")) return true;
      // Skip elements that opt-out via data attribute
      if (target.closest("[data-no-screen-joy]")) return true;
      return false;
    }

    const onDown = (e: PointerEvent) => {
      // primary pointer only
      if (pointerId !== null) return;
      if (e.button !== 0 && e.pointerType === "mouse") return; // mouse: only left button
      if (shouldIgnore(e.target)) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      active = true;
      dragging = false;
    };

    const onMove = (e: PointerEvent) => {
      if (!active || e.pointerId !== pointerId) return;
      let dx = e.clientX - startX;
      let dy = e.clientY - startY;
      const d = Math.hypot(dx, dy);
      if (!dragging && d < DRAG_THRESHOLD) return; // still a tap
      dragging = true;
      // Clamp to radius
      let nx = dx, ny = dy;
      if (d > RADIUS) { nx = dx / d * RADIUS; ny = dy / d * RADIUS; }
      window.dispatchEvent(new CustomEvent("virtual-stick", { detail: { x: nx / RADIUS, y: ny / RADIUS } }));
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      active = false;
      pointerId = null;
      // ALWAYS reset stick on release — even quick taps — to clear any stale state
      window.dispatchEvent(new CustomEvent("virtual-stick", { detail: { x: 0, y: 0 } }));
      dragging = false;
    };

    // Also reset stick if the window loses focus (e.g. user switches tab while holding)
    const onBlur = () => {
      if (active) {
        active = false;
        pointerId = null;
        dragging = false;
        window.dispatchEvent(new CustomEvent("virtual-stick", { detail: { x: 0, y: 0 } }));
      }
    };
    window.addEventListener("blur", onBlur);

    // Use capture so we catch the gesture even if Scene's pointerdown stopped propagation
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return null;
}
