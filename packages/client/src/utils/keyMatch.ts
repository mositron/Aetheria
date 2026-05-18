/**
 * Layout-independent keyboard key matching.
 *
 * Problem: `e.key` returns the *typed* character which depends on the OS layout.
 * Pressing W on a Thai keyboard gives `e.key = "ไ"`, not `"w"`. So shortcuts
 * checking `e.key === "w"` break for non-English users.
 *
 * Fix: use `e.code` for the physical key location (always "KeyW" regardless of
 * layout). Special keys like Enter, Escape, ArrowUp use `e.key` since the code
 * names match.
 */
export function keyEq(e: KeyboardEvent, key: string): boolean {
  // Single letter
  if (key.length === 1 && /[a-z]/i.test(key)) {
    return e.code === `Key${key.toUpperCase()}`;
  }
  // Single digit
  if (key.length === 1 && /\d/.test(key)) {
    return e.code === `Digit${key}`;
  }
  // Space
  if (key === " " || key.toLowerCase() === "space") {
    return e.code === "Space";
  }
  // Fallback: match e.key (works for "Enter", "Escape", "Arrow*", etc.)
  return e.key === key || e.key.toLowerCase() === key.toLowerCase();
}
