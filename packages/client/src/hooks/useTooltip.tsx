import { useEffect, useRef, useCallback, useState } from "react";

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: string;
}

/**
 * Touch-friendly tooltip hook.
 * On touch: long-press 600ms → show tooltip. Tap elsewhere → dismiss.
 * On mouse: hover → show after 200ms delay. Mouse-leave → dismiss.
 */
export function useTooltip(
  text: string,
  options: { delayMs?: number; longPressMs?: number } = {}
) {
  const { delayMs = 200, longPressMs = 600 } = options;
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, content: "" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouchRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (longPressRef.current) clearTimeout(longPressRef.current);
    timerRef.current = null;
    longPressRef.current = null;
  }, []);

  const showAt = useCallback((x: number, y: number, content: string) => {
    setTooltip({ visible: true, x, y: y - 40, content });
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    setTooltip((t) => ({ ...t, visible: false }));
  }, [clearTimers]);

  // Mouse events
  const onMouseEnter = useCallback(() => {
    isTouchRef.current = false;
    timerRef.current = setTimeout(() => {
      // We'll use a default position; the actual position comes from onMouseMove
    }, delayMs);
  }, [delayMs]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTouchRef.current && text) {
      showAt(e.clientX, e.clientY, text);
    }
  }, [text, showAt]);

  const onMouseLeave = useCallback(() => {
    clearTimers();
    setTooltip((t) => ({ ...t, visible: false }));
  }, [clearTimers]);

  // Touch events
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isTouchRef.current = true;
      clearTimers();
      const touch = e.touches[0];
      const x = touch.clientX;
      const y = touch.clientY;
      longPressRef.current = setTimeout(() => {
        showAt(x, y, text);
      }, longPressMs);
    },
    [text, longPressMs, clearTimers, showAt]
  );

  const onTouchMove = useCallback(() => {
    // Moving finger cancels long-press
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    clearTimers();
    setTooltip((t) => ({ ...t, visible: false }));
  }, [clearTimers]);

  // Global touch dismiss on tap outside
  useEffect(() => {
    const handler = () => hide();
    if (tooltip.visible) {
      document.addEventListener("touchstart", handler, { once: true });
    }
    return () => document.removeEventListener("touchstart", handler);
  }, [tooltip.visible, hide]);

  return {
    tooltip,
    handlers: {
      onMouseEnter: text ? onMouseEnter : undefined,
      onMouseMove: text ? onMouseMove : undefined,
      onMouseLeave: text ? onMouseLeave : undefined,
      onTouchStart: text ? onTouchStart : undefined,
      onTouchMove: text ? onTouchMove : undefined,
      onTouchEnd: text ? onTouchEnd : undefined,
    },
  };
}