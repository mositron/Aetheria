// Passive landscape hint — shows briefly when mobile + portrait is detected.
// Auto-dismisses after 4 seconds and remembers dismissal. Never blocks gameplay.

import { useEffect, useState } from "react";

export function OrientationHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isPortrait = h > w;
      const isSmallScreen = Math.min(w, h) < 540;
      const isTouch = matchMedia("(hover: none) and (pointer: coarse)").matches;
      const seen = localStorage.getItem("landscape-hint-seen") === "1";
      if (isPortrait && (isSmallScreen || isTouch) && !seen) {
        setShow(true);
        // Auto-hide after 4s; mark as seen so it doesn't pester again
        setTimeout(() => {
          setShow(false);
          localStorage.setItem("landscape-hint-seen", "1");
        }, 4000);
      }
    };
    compute();
    window.addEventListener("orientationchange", compute);
    return () => window.removeEventListener("orientationchange", compute);
  }, []);

  if (!show) return null;
  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto select-none"
      onClick={() => { setShow(false); localStorage.setItem("landscape-hint-seen", "1"); }}
    >
      <div className="bg-slate-900/95 border-2 border-cyan-400/60 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 backdrop-blur-md">
        <div className="text-3xl">📱➡</div>
        <div>
          <div className="text-sm font-bold text-cyan-300">เล่นแนวนอนดีกว่า</div>
          <div className="text-[10px] text-slate-300">หมุนเครื่องเพื่อ UX ที่ดีที่สุด · แตะเพื่อปิด</div>
        </div>
      </div>
    </div>
  );
}
