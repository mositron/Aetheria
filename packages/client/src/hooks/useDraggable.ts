import { useEffect, useRef, useState } from "react";

type Pos = { x: number; y: number };

export function useDraggable(id: string, initial?: Pos) {
  const KEY = `panel-pos-${id}`;
  const [pos, setPos] = useState<Pos | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return initial ?? null;
  });
  const dragging = useRef<{ ox: number; oy: number; startX: number; startY: number } | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pos) return;
    try { localStorage.setItem(KEY, JSON.stringify(pos)); } catch {}
  }, [pos, KEY]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragging.current = {
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top,
      startX: rect.left,
      startY: rect.top,
    };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragging.current.ox));
      const y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - dragging.current.oy));
      setPos({ x, y });
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // returned style: if pos is set, use absolute pixel position (overriding any tailwind top/left)
  const style: React.CSSProperties | undefined = pos
    ? { position: "absolute", left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : undefined;
  return { style, elRef, titleProps: { onMouseDown, style: { cursor: "move" as const } } };
}
