// Godot-style _physics_process: deterministic fixed-rate updates regardless
// of render FPS. Smooths out movement/collision when FPS drops.
//
//   useFixedStep(60, (dt) => {
//     // dt is constant (1/60), no frame-rate dependence
//   });

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export function useFixedStep(hz: number, fn: (dt: number) => void) {
  const step = 1 / hz;
  const accum = useRef(0);
  useFrame((_, dt) => {
    accum.current += Math.min(dt, 0.25);  // clamp huge frames (tab switch)
    let safety = 8;  // cap catch-up steps
    while (accum.current >= step && safety-- > 0) {
      fn(step);
      accum.current -= step;
    }
  });
}

// Convenience for "visual + physics" pattern.
export function useDualStep(
  visual: (dt: number) => void,
  physics: (dt: number) => void,
  hz = 60,
) {
  const step = 1 / hz;
  const accum = useRef(0);
  useFrame((_, dt) => {
    visual(dt);
    accum.current += Math.min(dt, 0.25);
    let safety = 8;
    while (accum.current >= step && safety-- > 0) {
      physics(step);
      accum.current -= step;
    }
  });
}
