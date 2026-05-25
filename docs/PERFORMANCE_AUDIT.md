# Aetheria — Performance Audit & Roadmap

Comprehensive audit by Explore agents + direct code review. 2026-05-26.

**TL;DR:**
- ✅ Architecture sound — spatial hash + lazy modals + vendor chunks + DPR cap + React.memo on heavy entity views all in place.
- ⚠ 4 concrete P0 fixes give the largest measurable win (~1 hour of work).
- 🟡 7 P1 fixes (memoization + unified intervals + script splits) for polish (~1 day).
- 🔵 3 P2 ideas for future scaling.

**Current numbers** (verified end-to-end):
- Bundle gzipped: ~460 kB initial (vendor split keeps Three.js cacheable across deploys).
- 50-bot stress test: tick p95 **49 ms**, p99 64 ms (target was <200 ms).
- 100-bot stress test: tick p95 **132 ms**, p99 221 ms (still under 200 ms p95 — borderline; 2× over target at p99).

---

## P0 — Quick wins (commit-and-go, ~1 h)

### 1. Hotbar polling 80 ms → 250 ms
**File:** `packages/client/src/ui/Hotbar.tsx:12`
Violates the CLAUDE.md "UI polling 250–500 ms" rule. 12.5 Hz React re-renders for cooldown display where 4 Hz is visually indistinguishable.

```diff
- const id = setInterval(() => setTick((t) => t + 1), 80);
+ const id = setInterval(() => setTick((t) => t + 1), 250);
```

### 2. Drop duplicate spatial-hash rebuild in CombatService
**File:** `packages/server/src/services/CombatService.ts:84-88`
`WorldRoom` already builds `playerSpatialHash` at the start of every tick. CombatService.tickMonsters then clears + rebuilds the SAME hash. Pure waste — O(P) extra per tick.

```ts
// remove the clear+rebuild loop inside tickMonsters — the hash arrives pre-built
```

### 3. Bot drop scan via SpatialHash
**File:** `packages/server/src/rooms/WorldRoom.ts:1338-1341`
Each dev bot iterates ALL `state.drops` per tick: `8 bots × 500 drops = 4000 ops/tick`. SpatialHash already exists for this exact pattern. Use `dropSpatialHash.findNearest(bot.pos, 2)` instead of the linear scan.

### 4. `botState` Map leak on disconnect
**File:** `packages/server/src/rooms/WorldRoom.ts:1228` (onLeave)
`botIds`, `lastAttack`, `intents`, `statusTickAcc` get cleaned up — but **`botState` is not deleted**. Restart cycle accumulates stale entries forever. Add `this.botState.delete(sid)` in onLeave.

---

## P1 — Should-fix this week (~1 day total)

### 5. Memoize damage-number CanvasTextures
**File:** `packages/client/src/scene/DamageNumbers.tsx:108`
Every damage event calls `makeText()` → new `CanvasTexture`. The component disposes on unmount but rapid fire (10+ hits/sec on crit chain) churns GPU textures. Memoize by `text + color + bold` key in a module-scope `Map<string, THREE.CanvasTexture>` with LRU eviction at ~50 entries.

### 6. Memoize NPC name labels
**File:** `packages/client/src/scene/Scene.tsx:863, 871`
Same pattern — every `NpcLabel` instance creates its own canvas texture. Use a shared `labelCache` keyed by `text`.

### 7. React.memo wrap on all `scene/models/*`
**Files:** `HeroModel.tsx`, `SlimeModel.tsx`, `WolfModel.tsx`, `OrcModel.tsx`, `DarklordModel.tsx`, `BogWitchModel.tsx`, `IceWraithModel.tsx`, `SandWormModel.tsx`, `ScorpionLordModel.tsx`, `SnowmanGiantModel.tsx`, `SwampSerpentModel.tsx`, `ChickenModel.tsx`, `PigModel.tsx`, `CowModel.tsx`, `ChestModel.tsx`
`MonsterView` IS memoized, but the model child components are not — so when MonsterView re-renders for any reason (state delta, parent re-render), all child models redo their JSX. Wrap each:

```tsx
export const SlimeModel = React.memo(function SlimeModel({ isDead, isAttacking }: Props) { ... }, () => true);
```

`() => true` is safe because all children read their changing state via ref-functions (`isDead()`, `isAttacking()`) — no actual prop changes trigger re-render.

### 8. Strip `castShadow` from tree leaves
**Files:** `ChunkedTerrain.tsx:221,225,229`, `Environment.tsx:377,382,386,403`
CLAUDE.md explicitly says "cast shadows only on torsos / bodies. Limbs and trees: no." Tree cones currently still cast shadows. Cuts shadowmap rasterization cost dramatically.

### 9. Unified UI pulse
Multiple panels each run their own `setInterval(setTick, 200ms)`: TargetDisplay, Inventory, NpcDialog (200ms), Mailbox (600ms), Hotbar (80→250ms), BossBar (400ms). Create one `usePulse(ms)` hook with a single shared interval + emitter. ~50 LOC change, reduces React reconciler load.

### 10. Boss-alive lookup via Set membership
**File:** `packages/server/src/rooms/WorldRoom.ts:1964-1991`
`for (const [, m] of state.monsters) if (m.kind === "darklord" && !m.dead)` scans every monster every 5 s. Maintain `livingMonsterKinds: Set<MonsterKind>` updated on spawn / death, check `.has("darklord")` in O(1).

### 11. Persistent JSON columns
**File:** `packages/server/src/rooms/WorldRoom.ts:464, 620, 646, 665, 722, 1302`
`petsJson`, `structuresJson`, `achievementsJson`, `unlockedSkillsJson` are parsed + stringified on every pet/structure mutation. Cache deserialized form on the Player schema and serialize only at `savePlayer`. Touches ~6 hot-path handlers.

---

## P2 — Worth-it later (week+)

### 12. Code-split monster model components
Currently all 18 monster mesh components compile into `index.js` (526 kB). Most are only needed when their kind is in view. Lazy-import them via dynamic `import()` keyed by `m.kind`, with a fallback proxy mesh. Trims ~80 kB off the initial chunk; first-render unaffected because field map mostly has slime / wolf / orc.

### 13. Loading screen + progress
Right now first-load is just "loading…" text. With the bundle gzipped at 460 kB on cold-start (no CF cache), people on slow connections see white screen for ~3-5 s. Add a deterministic progress bar driven by Vite manifest + Workbox cache stats. Optional: pre-warm `three.js` bundle via `<link rel=preload>` in `index.html`.

### 14. Interest-management for state deltas
Colyseus sends full state delta to every client on every state change. With 50 players × 1500 entities the wire grows. Colyseus's `setView` API + `room.view` (FoV-based filtering) would drop bandwidth ~3–10×. Touched lightly in `docs/SERVER_SIZING_50_PLAYERS.md` but not implemented.

---

## ✅ Already passing — don't touch

These were checked and confirmed correct:

| Area | Status | Notes |
|---|---|---|
| DPR cap `[1, 1.5]` on Canvas | ✅ | `Game.tsx` — correct per CLAUDE.md |
| Vendor chunks `three/drei/colyseus/react` | ✅ | `vite.config.ts:67-72` — clean split |
| `useFrame` setState violations | ✅ | NONE found — DayNight uses refs |
| Vector3 / Color pre-allocated as refs | ✅ | Verified in Scene.tsx + DamageNumbers + DayNight |
| `React.memo` on MonsterView, PlayerView, ChestView | ✅ | Strict equality `(a, b) => a.m === b.m && a.selected === b.selected` |
| Spatial hash service | ✅ | Used in CombatService + WorldRoom monster aggro |
| Workbox precache + CacheFirst for hashed assets | ✅ | `vite.config.ts` — correct |
| Auto-save throttling | ✅ | `WorldRoom.savePlayer` is async + queued |
| Graceful shutdown | ✅ | `server/index.ts` SIGTERM handler with 10 s timeout |

---

## How to verify after a fix

```bash
# Server stress (50-bot)
docker compose exec server pnpm test:harness

# Client perf trace (Chrome DevTools)
# 1. Open Performance tab
# 2. Record 10 s of gameplay
# 3. Look at: scripting < 6 ms/frame avg, GC < 200 ms total

# Bundle re-check after splits
cd packages/client && pnpm exec vite build
# Compare `dist/assets/index-*.js` size to ~526 kB baseline
```

---

## Order of attack (when you're ready to ship perf work)

1. Apply P0 #1–#4 as one commit — ~30 min, measurable tick reduction.
2. Run 50-bot harness, compare tick p95 to current 49 ms.
3. Apply P1 #5 + #6 + #7 in one commit — texture/render perf.
4. Apply P1 #8 — shadow audit. Verify no visual regression on close-up.
5. Re-bundle, check index.js delta vs 526 kB baseline.
6. Apply P1 #9–#11 if you still want gains. Otherwise stop here.
7. P2 #12–#14 only when player count justifies the work.
