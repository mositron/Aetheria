import { useEffect } from "react";
import { useStore } from "../store";

/** Floating cancel button + ESC handler for the active waypoint. */
export function WaypointControls() {
  const waypoint = useStore((s) => s.waypoint);
  const setWaypoint = useStore((s) => s.setWaypoint);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape" && waypoint) {
        setWaypoint(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [waypoint, setWaypoint]);

  if (!waypoint) return null;

  return (
    <button
      onClick={() => setWaypoint(null)}
      onTouchStart={(e) => { e.preventDefault(); setWaypoint(null); }}
      className="absolute z-30 left-1/2 -translate-x-1/2 select-none touch-none active:scale-90 transition"
      style={{
        top: "3.5rem",
        background: "linear-gradient(180deg, #f472b6 0%, #ec4899 60%, #be185d 100%)",
        border: "2px solid #ffffff",
        borderRadius: "999px",
        padding: "6px 14px",
        color: "#ffffff",
        fontSize: 12,
        fontWeight: 700,
        boxShadow: "0 0 0 2px rgba(244,114,182,0.4), 0 4px 0 rgba(190,24,93,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
        textShadow: "0 1px 2px rgba(0,0,0,0.4)",
      }}
      title="ยกเลิกเส้นทาง (Esc)"
    >
      ✕ ยกเลิกนำทาง · {waypoint.icon} {waypoint.label}
    </button>
  );
}
