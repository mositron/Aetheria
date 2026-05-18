// Anti-cheat input validation.
//
// Catches obvious cheating patterns BEFORE they mutate state. Currently:
//   - Joystick input magnitude check (legit is [-1, 1])
//   - Non-finite coordinates
//   - Per-tick movement delta check (TODO — needs prev position tracking)

export type InputSample = {
  mx: number;
  mz: number;
  rotY: number;
};

export type Verdict =
  | { ok: true; mx: number; mz: number; rotY: number }
  | { ok: false; reason: string };

export class AntiCheat {
  /**
   * Validate + normalize an input sample. Returns the clean values if OK,
   * or a rejection with reason. Caller should drop rejected samples and may
   * log them (throttled).
   */
  validateInput(raw: InputSample): Verdict {
    const { mx, mz, rotY } = raw;
    if (!Number.isFinite(mx) || !Number.isFinite(mz) || !Number.isFinite(rotY)) {
      return { ok: false, reason: "non-finite" };
    }
    // Legit joystick output is in [-1, 1]. Anything beyond 100 is a forged
    // packet (no UI produces it). Keep a generous threshold to avoid false
    // positives from float fuzz.
    if (Math.abs(mx) > 100 || Math.abs(mz) > 100) {
      return { ok: false, reason: "magnitude" };
    }
    // Normalize so diagonal isn't √2× faster
    const mag = Math.hypot(mx, mz);
    const nx = mag > 1 ? mx / mag : mx;
    const nz = mag > 1 ? mz / mag : mz;
    return { ok: true, mx: nx, mz: nz, rotY };
  }
}
