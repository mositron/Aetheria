import { useEffect, useRef } from "react";

/**
 * Returns a Set of currently held keys.
 *
 * Uses `event.code` (physical key location, layout-independent) so that
 * pressing the physical W key works regardless of whether the OS keyboard
 * layout is set to English, Thai, Russian, Arabic, etc.
 *
 * The set stores both:
 *   - `e.key.toLowerCase()` (e.g. "w", "arrowup")
 *   - and the same identifier derived from `e.code` (e.g. "KeyW" → "w")
 * so existing call sites like `keys.has("w")` keep working.
 */
function normalizeCode(code: string): string | null {
  // Letter keys: "KeyW" → "w"
  if (code.startsWith("Key") && code.length === 4) return code[3].toLowerCase();
  // Digits: "Digit1" → "1"
  if (code.startsWith("Digit") && code.length === 6) return code[5];
  // Arrow keys + special: "ArrowUp" → "arrowup"
  if (code.startsWith("Arrow")) return code.toLowerCase();
  // Space, Enter, Escape, Tab, Backspace, etc.
  const direct: Record<string, string> = {
    Space: " ",
    Enter: "enter",
    Escape: "escape",
    Tab: "tab",
    Backspace: "backspace",
    ShiftLeft: "shift",
    ShiftRight: "shift",
    ControlLeft: "control",
    ControlRight: "control",
    AltLeft: "alt",
    AltRight: "alt",
  };
  return direct[code] ?? null;
}

export function useKeyboard() {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      keys.current.add(e.key.toLowerCase());
      const normalized = normalizeCode(e.code);
      if (normalized) keys.current.add(normalized);
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
      const normalized = normalizeCode(e.code);
      if (normalized) keys.current.delete(normalized);
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return keys;
}
