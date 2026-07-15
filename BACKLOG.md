# Aetheria — Backlog & Session Handoff

> **Single source of truth สำหรับงานที่เหลือ.** อ่านไฟล์นี้ก่อนเริ่ม session ใหม่
> เพื่อให้รู้ว่าสถานะอะไร, อยู่ที่ไหน, ทำอะไรต่อ.

Last updated: 2026-07-15 — Fixed a death-causing bug in the new loading gate + found and fixed the real cause of the ground shimmer (spawn-plane z-fighting, not grass)
Total commits to date: 110+ (this session not yet committed)

## Session 2026-07-15 (part 7) — Loading-gate death bug + real ground-shimmer root cause

Two urgent follow-ups from part 6, reported live while playtesting.

**Death bug in the "preparing scene" gate.** User reported the game
stuttering so badly they couldn't walk, then dying the instant they
regained control because a monster had been hitting them the whole time.
Root cause: part 6's overlay reset (`setSceneReady(false)`) on *every*
reconnect and map warp, not just the very first world join — but the
server keeps simulating combat the whole time regardless of whether the
client is showing the overlay. A network hiccup or warp while near
monsters could leave the player blind and unable to react for up to
several seconds, mid-combat. Fixed by adding a `hasShownSceneOnceRef` in
`Game.tsx` — the gate now only ever arms once, on the very first
successful entry (spawn is a safe area); every later reconnect/warp skips
straight to the scene exactly like before this feature existed. Cosmetic
smoothing lost for those cases, safety gained — correct trade.

**Ground shimmer — actually found the cause this time.** The grass-blade
tweaks in part 6 (and the sway-shader tuning in part 3) never moved the
needle at all, per direct user feedback ("ไม่เคยดีขึ้นตั้งแต่ไหนแต่ไรแล้ว")
— a strong signal the diagnosis was wrong, not just incomplete. Re-examined
from scratch: `Environment.tsx` was drawing a flat circle mesh at exactly
`position={[0,0,0]}` covering the spawn area, layered directly on top of
`ChunkedTerrain` — which *already* renders real flat (y=0) geometry there
via `getHeight()`'s own SPAWN_RADIUS special-case (this circle predates
the terrain-mesh rewrite in part 2 and was never removed once redundant).
Two coincident, differently-colored, same-orientation surfaces (the
circle's flat `pal.groundC` vs. the terrain's per-biome vertex color)
z-fight every frame as the camera's view matrix shifts by float-precision
bits — reads as the ground flickering/strobing, worst right around spawn
where players spend the most time. Confirmed via zoomed screenshots
(visible banding) plus code inspection (colors provably differ). Removed
the redundant circle; chunked terrain alone covers the area, and the
part-6 loading gate already guarantees it's loaded before the scene is
ever revealed, so there's no risk of a visible gap.

Audited every other ground-hugging mesh in `scene/` for the same
coincident-surface pattern per explicit user request ("เช็คจุดอื่นด้วย"):
`WaterPatch` (+0.05), cave floor discs (+0.02/+0.04), every skill/cast/
selection ring (+0.01 to +0.1), the click-catcher plane (+0.01) — all
already use a small deliberate Y offset for exactly this reason. The
spawn plane was the one exception; no other instances found.

**Verification:** both fixes typecheck/build clean, `smoketest.mjs`
passes. Confirmed live in Chrome that the WebGL context-loss issue (see
part 2) is what's blocking final pixel-level confirmation of the shimmer
fix, not the code — this VM's browser tooling keeps losing its WebGL
context after repeated reloads across this session, independent of any
code change. Ask the user to confirm both fixes on their next playtest.

## Session 2026-07-15 (part 6) — "Preparing scene" loading gate + grass shimmer

User asked for a loading screen that waits for the world to actually finish
loading before revealing it, instead of the scene mounting immediately and
streaming/popping content in while visible. Mid-way through, a second report
came in that the grass field still reads as "ลายๆเหมือนจอสั่น" (a shimmering/
striped pattern, like the screen is unstable) even after the earlier
sway-shader tuning (part 3) — a distinct root cause, addressed in the same
pass.

**"Preparing scene" overlay.** Researched the actual mount flow first
(dedicated read-only agent, file:line citations) rather than guessing: the
existing `LoadingScreen` in `Game.tsx` already gates on the Colyseus room
join + first state sync, but unmounts the INSTANT that handshake finishes —
before `<Canvas>`/`<Scene>` has done any work. Everything after that (9
terrain chunks building geometry synchronously, every monster/player/NPC in
the initial state mounting its full model tree, first-draw shader compiles
for all of it) was happening live, in front of the player.

Fix: `Scene` now accepts an `onReady` callback. `ChunkedTerrain` reports
once its first chunk batch has actually mounted (`onInitialReady`); `Scene`
waits for that (or immediately, on non-"field" maps with no streaming) plus
`READY_FRAME_BUFFER` (10) more rendered frames — giving the GPU time to
actually draw and shader-compile everything that mounted synchronously —
before calling `onReady`. `Game.tsx` overlays a new `flat` variant of
`LoadingScreen` (skips the 3D `MenuScene` backdrop so it doesn't run a
second live WebGL scene on top of the game canvas it's covering) until then,
plus a 6s safety timeout so a stalled signal can never trap the player.

**Bug found via live browser testing, not by inspection:** the safety
timeout's `useEffect` only watched `[ready]`, so once `sceneReady` flipped
true through the legitimate path the stale 6s timer was never cancelled —
harmless as a same-cycle no-op, but on a map warp (which resets `ready`/
`sceneReady` to start a new loading cycle) a leftover timer from the
*previous* cycle could fire mid-new-cycle and force-reveal the scene early,
defeating the gate. Caught by instrumenting the three handoff points with
temporary console logging and actually driving a real login → character
create → enter-world → exit-to-select → re-enter loop in Chrome — the
`useFrame`/`useEffect` chain looked correct from reading it, and only the
live timing trace exposed the stale-timer bug. Fixed by adding `sceneReady`
to the effect's dependency array so its cleanup cancels the old timer.
Confirmed post-fix: `onReady` fires the natural way in ~500ms after terrain
mounts (~2.5s total from login), and the safety timeout no longer fires
redundantly.

**Grass shimmer.** Distinct from the sway-animation complaint fixed in part
3 — this is geometric aliasing: each blade is a single sub-pixel-thin
triangle pair (0.22m wide) with no MSAA-friendly silhouette, so at the
game's usual camera distance (~16 units, ~30° pitch) distant/thin blades
flicker between covered/uncovered per pixel on the normal per-frame camera
micro-adjustments, reading as a shimmering pattern across the whole field —
independent of wind sway, and would happen even with sway disabled.
Widened blades (0.22 → 0.34m) and tightened `GRASS_RADIUS` (46 → 30m, now
landing close to where fog already starts dulling contrast at 28m) so less
sub-pixel geometry is on screen at once. Could not be visually confirmed
live — this VM's known pre-existing WebGL context-loss issue (see part 2)
kicked in partway through this session's browser testing — worth a look
next playtest.

**Verification:** `tsc --noEmit` + `vite build` clean on every pass;
`smoketest.mjs` passes. The loading-gate feature was driven end-to-end in a
real Chrome tab (register → create character → enter world → exit to select
→ re-enter), including the debug-log trace that caught and confirmed the fix
for the stale-timer bug above — not just typecheck-and-hope.

## Session 2026-07-15 (part 5) — Mob-clustering fix + single-server simplification

Two requests: a concrete bug report (mobs visibly cluster together near the
origin on first map load, then "spread out" a moment later — feels stuttery)
and an architecture question (should the multi-world/room-creation system be
removed to make things leaner) that resolved to an explicit decision to
collapse to one shared server room for everyone.

**Root cause of the clustering, found via a dedicated read-only research
agent rather than guessed:** `MonsterView`/`PlayerView` in `Scene.tsx` are
`React.memo`'d groups whose `<group>` defaults to position `(0,0,0)` on
mount; the only place position was ever set was inside `useFrame`'s lerp.
When many monsters mount in one batch (e.g. everyone's first load, when the
whole map's monster list arrives at once), every one of them lerps in from
the origin over the next several frames — that's the "clump then spread"
look, and the mass mount+lerp is what made the moment feel stuttery. Ruled
out server-side staged spawning explicitly (no evidence of it — all monsters
are sent in the initial state sync, confirmed by reading `WorldRoom.ts`/
`MonsterService`). **Fix:** added a `useLayoutEffect` (empty deps, mount-only)
to both `MonsterView` and `PlayerView` that sets the true position
synchronously before first paint, so there's nothing left to lerp in from.

**Single-server simplification.** Removed the multi-world/room-creation
system entirely per explicit user decision. Confirmed low-risk beforehand via
a 3-way parallel research workflow: no DB relations depend on it, and it had
already-orphaned code paths (`WorldManager.setRoomId()` never called anywhere;
`WorldLobby`'s `onJoin` handler didn't actually wire into the connected
room). Bonus: this also fixes a latent bug for free — `Friend.ts`'s
`isOnline`/`getLocation` were already room-local-only, so friends on a
different world instance previously showed as incorrectly offline; with one
shared room that condition can't happen anymore.

Removed:
- `packages/server/src/services/WorldManager.ts` (deleted, 152 lines)
- `packages/client/src/ui/WorldCreate.tsx` / `WorldLobby.tsx` (deleted)
- `GET /api/worlds`, `POST /api/worlds/create`, `GET /api/worlds/by-code/:code`
  REST routes (`server/src/index.ts`)
- `WorldState.worldId/worldName/worldMode/worldTemplate` schema fields
  (`shared/src/schema.ts` — kept `mapId`)
- World-lobby menu entry, HUD world-info badge, `worldLobby` panel id,
  dead `world.*`/`worldCreate.*` locale keys (kept `worldLobby.moreQuests` —
  actively used by `QuestTracker.tsx`, unrelated feature sharing the prefix)

Kept: `WorldRoom` itself (now the one and only room, `maxClients=50` per the
already-validated 50-player sizing doc), all per-room gameplay logic.

**Verification:** `tsc --noEmit` clean on both `server` and `client`;
`vite build` clean; `smoketest.mjs` passes (167 monsters loaded, join/move/
chat all work). Did not re-verify live in-browser beyond the smoketest given
this VM's known pre-existing WebGL instability (see part 2 notes) — the
smoketest is a real Colyseus client/server round-trip, not a mock.

Optional follow-up, not done (flagging per project convention rather than
silently skipping): the now-unused `World` Postgres table/Prisma model was
left in place — dropping it would need a migration and isn't required for
correctness since nothing references it anymore.

## Session 2026-07-15 (part 4) — Voxel-look redesign phases 3b, 3c, 3d

Continuation of part 2/3 — completed the remaining phases of the
player/monster/NPC organic-model rollout.

**Phase 3b — `HeroModel.tsx` remaining hair styles + accessories.** Long/
ponytail/spiky/bun hair rebuilt on a shared rounded "scalp dome" (squashed
sphere) + style-specific extra (flowing back-hair, `RoundLimb` ponytail,
`RoundSpike` spikes, sphere bun). Crown/headband converted from box-stacks to
torus bands + `RoundSpike` points. Glasses "round" fixed to be actually round
(torus rings — was literally square boxes despite the name, per the earlier
survey's own finding). Scarf/sun-glasses use drei `RoundedBox` for a subtle
bevel where a literal box still makes sense.

**Phase 3c — monster models.** Ran as a 4-way parallel workflow (all touching
disjoint files except one agent that owns all of `Scene.tsx`'s inline models,
to avoid concurrent-edit conflicts):
- `WolfModel.tsx` / `OrcModel.tsx` — body mass converted to
  `RoundTorso`/`RoundLimb`/`RoundHead`, tusks/ears to `RoundSpike`.
- `DarklordModel.tsx` (boss) — body mass converted, kept cape/sword/crown/aura
  as their original curved primitives, deliberately did NOT round the cape's
  jagged tri-cone edges (would erase the "torn fabric" read).
- `ScorpionLordModel.tsx` (boss) — body/pincers/legs converted; agent
  correctly identified and worked around a `RoundTorso` orientation issue for
  horizontal (non-upright) bodies via a 90° group rotation.
- `Scene.tsx` inline models — fixed `ScorpionModel`/`YetiModel`/`ChickenModel`/
  `PigModel`/`CowModel` (all were 100% boxGeometry), then **built 12 brand-new
  monster models from scratch** for kinds that previously rendered as
  literally nothing (only a name+HP bar) — boar, spider, ghost, bat, golem,
  fox, shadow_lord, ice_giant, shadow_wolf, frost_spider, banshee,
  skeleton_captain — wired into `MonsterView`'s dispatch chain with a new
  `MONSTER_BILLBOARD_Y` lookup table for correct label height per kind.

**Bug found + fixed during review, not by the agents:** `organicPrimitives.tsx`'s
`RoundTorso` silently rendered ~50% taller than requested whenever `width` or
`depth` exceeded `height` (any wide/flat quadruped body) — the Y-axis scale
compensation only worked for the upright-humanoid case it was originally
designed for. Two agents (Wolf, ScorpionLord) independently discovered this
and worked around it per-callsite via a 90° rotation; the `Scene.tsx` agent's
farm animals (Chicken/Pig/Cow) did not. Fixed at the source in `RoundTorso`
itself (Y-scale now derived from actual native geometry extent, not assumed
to be 1) — retroactively correct for every existing and future caller,
verified backward-compatible with the rotation-workaround callsites (no-op
there since their case was never affected).

**Phase 3d — `NpcRoleProps.tsx`.** Confirmed via review this file was already
in good shape (hammers/staffs/shields/spears/wands already used
cylinder/sphere/torus/cone) — only the genuinely flat/blocky objects (aprons,
plank, book, hammer heads) got a `RoundedBox` bevel; anvils deliberately left
as sharp boxes since anvils are correctly blocky in real life.

**Verification:** `tsc --noEmit` + `vite build` clean after every phase and
after the `RoundTorso` fix. Live browser check: confirmed the converted Orc
renders correctly (rounded head/torso/arms, tusks/headband/belt still clearly
read as "orc", not a generic blob), no console errors, `smoketest.mjs`
passes. Did not visually confirm all 12 new monster kinds live (most are
dungeon/cave/Endless-Tower spawns, not reachable without extended navigation
in this session) — worth a look next time you're exploring caves/dungeons.

This closes out the full voxel-look redesign: terrain (part 2), player/NPC
body (part 2), and now monsters (part 4). Remaining lower-priority polish not
done: `PlayerJobProps.tsx` touch-ups where job props might visually clash
against the new rounder body (deferred — the survey's own assessment was
these already lean curved and are low-risk to leave as-is).

## Session 2026-07-15 (part 3) — Follow-on fixes to the terrain mesh rewrite

User playtested part 2's changes live and reported 3 issues, all traced back
to the terrain-mesh rewrite (part 2):

**Grass "constantly shifting" / dazzling ground texture** — root cause:
`GrassField.tsx`/`TreeInstanced`/`RockInstanced`/`BushInstanced` all placed
decor Y using raw `getHeight(x,z)`, a *discrete step function* (quantized by
`STEP`). The old box-column terrain was ALSO discretely stepped per cell, so
this mostly matched; the new smooth mesh *linearly interpolates* between
grid-vertex heights, so a discrete-height blade sitting on a ramped/sloped
triangle rarely lines up with the continuously-interpolated surface under it
— it floats or sinks, and the mismatch swims as the camera moves. Fix: new
`chunkWorld.ts` export `getSmoothHeight(x,z)` — bilinear interpolation on the
exact same lattice the terrain mesh samples (`TERRAIN_MESH_STEP`, also newly
exported so the two never drift apart). Wired into `GrassField.tsx`,
`LandDust.tsx`, and `TreeInstanced`/`RockInstanced`/`BushInstanced` in
`ChunkedTerrain.tsx`. `getHeight()` itself is untouched — collision/movement
step-gating in `Scene.tsx` still wants the discrete steps.

**Stutter / feels resource-heavy** — the new per-chunk terrain mesh was
sampling `getHeight`/`getBiome`/`bankFactor` (each a multi-octave noise call)
at every grid vertex (17×17=289/chunk) *in addition to* the pre-existing
256-cell water/decor loop — real added CPU cost per chunk, paid every time a
new chunk streams in as the player walks. Fixes, all in
`ChunkedTerrain.tsx`/`chunkWorld.ts`:
- Terrain mesh grid now samples at `TERRAIN_MESH_STEP` (4 units, was
  `CELL_SIZE`=2) → 9×9=81 vertices/chunk instead of 289 (~3.6× fewer noise
  evaluations), still smooth-looking since `getHeight`'s own `STEP`
  quantization already gives it a stylized terraced look at this resolution.
- `LOAD_RADIUS` 3→2, `UNLOAD_RADIUS` 4→3 (49→25 resident chunks max).
- New `DecorVisibility` wrapper — same throttled-distance-toggle pattern
  `GrassField.tsx` already used, now also applied to trees/rocks/bushes
  (`DECOR_RADIUS=70`), which previously had **no distance culling at all**
  and rendered in full for the entire loaded radius. Obstacle
  registration/collision is unaffected (separate effect, keyed off chunk
  mount not visibility).
- `Environment.tsx` fog retuned (field: near 55→45, far 165→100) to mask the
  now-closer streaming/decor-culling boundaries — directly per the user's
  own suggested fix ("use fog so the cutoff doesn't look like empty
  render-gap").

**Distant mountains "too tall, blocking the scenery"** — `DistantMountains.tsx`
peaks were 26-48 units tall (vs. terrain's own `MAX_HEIGHT=18`) at a fixed
175-unit follow radius — visually dominated the frame instead of reading as
a subtle horizon backdrop. Reduced to 9-18 units (matching terrain's own
peak scale) and pushed the ring out to 220 units; combined with the fog
retune above they now read as soft, distant, mostly-fogged silhouettes.

**Verification:** `tsc --noEmit` + `vite build` clean both times, live
browser check (day + night) — river/water shader, rounded player body,
terrain slopes all render correctly, no console errors, `smoketest.mjs`
passes. Could not run a sustained FPS profile in this sandboxed session (same
pre-existing WebGL-context-loss limitation as prior sessions), so the perf
fixes are verified by the underlying math (fewer chunks × fewer
vertices/chunk × distance-culled decor = strictly less work per frame) plus
a clean visual spot-check, not a measured before/after frame time — worth a
gut-check next time you're playing on your own machine.

## Session 2026-07-15 (part 2) — Music redesign + drop the voxel look (phase 1)

Same-day follow-up after the environment-polish pass below. Two fresh
complaints: bg music described as "อืดๆทุ้มๆ...ปวดหัว" (muffled/bassy/droning,
headache-inducing), and a request to move the whole game off the
Minecraft-voxel look — confirmed via AskUserQuestion to mean **everything**
(terrain + player/monster/NPC models), not terrain alone. Two research
Workflows ran first (diagnosis + full dependency/survey mapping) before any
code changed; see the approved plan for full findings —
`C:\Users\posit\.claude\plans\swirling-sparking-pretzel.md` (this file gets
overwritten by the next planning session, so key findings are captured here
too).

**Music (`sfx/music.ts`)** — root cause: 4 sustained unfiltered sine drones
packed into 32-131Hz, each doubled with a +0.3%-detuned unison (audible
0.2-0.4Hz beat) and each with its own uncorrelated LFO (3 stacking randomly)
— structurally muddy/droning, not an EQ problem. Rewrote: pad chord moved up
to G3/C4/E4 with per-voice stereo panning (no more detuned doubling), one
shared gentle LFO instead of 3, a quiet filtered G2 anchor replacing the raw
C1 sub-bass, master-bus highpass(40Hz)/lowpass(3.5kHz)/compressor added
(none existed before), melody gain raised + tightened spacing + a short
feedback-delay send for space.

**Terrain (`ChunkedTerrain.tsx`)** — replaced the stacked-unit-cube
`ColumnGroup` InstancedMesh voxel rendering with a real per-chunk
triangulated heightmap mesh (17×17 vertices, `computeVertexNormals()`,
continuous per-vertex color reusing the existing `BIOME_STOPS` gradient —
dropped the 14-bucket color-quantization cache since a single mesh draw call
doesn't need it). `chunkWorld.ts` is **completely untouched** — confirmed by
a full consumer trace that `getHeight`/`isWater`/etc. are pure `(x,z)→value`
functions with zero coupling to rendered geometry (click-to-walk raycasts a
separate invisible flat plane; server has no terrain-height dependency at
all). Net perf win: 1 draw call/chunk (289 verts/512 tris) vs. up to ~14
InstancedMesh draw calls/chunk before. New shared `scene/materials.ts`
exports the toon gradient texture (previously duplicated inline).

**Characters/NPCs — Phase 1 of a phased rollout** — discovered
`scene/models/HeroModel.tsx` is the **single shared body renderer** for both
real players and every humanoid NPC (`Scene.tsx:806` + `:1652`), 100%
`boxGeometry` (57 primitives). New `scene/models/organicPrimitives.tsx` kit
(`RoundLimb`/`RoundTorso`/`RoundHead`/`RoundSpike`, capsule/sphere/cone based,
low segment counts sized against the monster perf ceiling found in survey —
~15-20 concurrent fully-modeled instances in caves/dungeons) now used for
`HeroModel`'s core body (legs/torso/arms/head), the "short" hair style, and
the cap/wizard-hat accessories — switched those pieces from
`meshStandardMaterial` to `meshToonMaterial` + the shared gradient so
characters read as one visual language with terrain/trees. Verified live in
browser: body renders visibly rounded (capsule limbs, pill torso, sphere
head) with no console errors, shared by players and NPCs as expected.

**Bonus bug found (not yet fixed, deferred to the monster phase):** 12 of 27
monster kinds — including 2 dungeon bosses, `shadow_lord` and `ice_giant` —
have zero 3D geometry today and render completely invisible in-game (only a
name + HP bar). Confirmed live: a wild "spider" mob attacked the test
character with no visible model, matching the survey exactly.

**Deliberately stopped here for a checkpoint** (per the approved plan) before
touching hair variants 2-5, `Accessories()` crown/headband/glasses/scarf,
`PlayerJobProps.tsx`, or any of the ~13 monster model files —
applying an unproven look across ~15-20 more files blind was called out as
the wrong move even with the scope pre-approved. Remaining phases, in order:
- **3b:** remaining hair styles + `Accessories()` variants + job-prop touch-ups
- **3c:** monsters — fix the 12 invisible kinds first (free win), then
  `ScorpionModel`/`YetiModel`/Chicken/Pig/Cow/`OrcModel` (100% box today),
  then the two boxy bosses `DarklordModel`/`ScorpionLordModel`. Already-round
  models (`SlimeModel`/`SwampSerpentModel`/`SnowmanGiantModel`/`BogWitchModel`)
  need little/no work. **Watch for:** rounding everything indiscriminately
  risks monsters converging toward "generic blob" — combat-glance
  readability depends on today's angular silhouettes, preserve
  species-distinguishing proportions/spikes/color per monster.
- **3d:** `NpcRoleProps.tsx` polish (lowest urgency, 9 static NPCs total)

**Verification:** client+server `tsc --noEmit` clean, `vite build` clean,
`smoketest.mjs` passes. Live browser pass (fresh `visualtest01` character):
confirmed rounded player body renders correctly with no console errors,
terrain renders with no visible seams/artifacts, combat/HP/respawn systems
unaffected. Same known environment caveat as the prior session — this
sandboxed VM's WebGL context drops intermittently, pre-existing and
code-unrelated (re-confirmed, didn't need to re-run the A/B stash test this
time since the prior session's isolation already established it).

## Session 2026-07-15 (part 1) — Environment visual polish + onboarding/UX pass

Two-track pass: (A) elevate the voxel-toon field visuals (mountains/rivers/
grass/fields) without rewriting the terrain architecture, (B) reduce
first-time-player friction. Full plan + rationale:
`C:\Users\posit\.claude\plans\swirling-sparking-pretzel.md`.

**Track A — environment (kept the voxel-toon art direction, elevated it):**
- `ChunkedTerrain.tsx` `pickColor()` — hard 2-band elevation/biome color
  cliffs replaced with a 14-bucket continuous gradient (`BIOME_STOPS` +
  cached `THREE.Color.lerp`), still cheap to group into InstancedMesh draw
  calls.
- New soft "wet bank" ring around rivers (`chunkWorld.ts` `bankFactor()`,
  quantized tint blend) instead of a hard grass/water cutoff.
- `WaterPatch` — shared shader-patched `MeshToonMaterial` (uTime uniform,
  per-tile bob + flow shimmer via `onBeforeCompile`), replacing the flat
  static water box.
- New `GrassField.tsx` — per-chunk crossed-billboard grass blades (vertex-
  colored base→tip, `onBeforeCompile` wind sway), distance-culled to ~46m
  around the player with throttled (~220ms) visibility toggling (LOD
  hysteresis pattern, never touches `.visible` at frame rate).
- New `DistantMountains.tsx` — static 26-peak backdrop ring at ~175m radius
  that repositions (not per-frame) as the player travels, so the horizon
  always reads as mountains instead of empty fog.
- Fog retuned for the field map only (55→165 vs the old flat 40–90);
  dungeons unchanged.
- `DayNight.tsx` `FluffyClouds` — plain box clusters replaced with
  canvas-gradient sprite billboards (soft edges, same draw-call budget).
- `Environment.tsx` — deleted dead `buildField()` computation that ran for
  the field map every mount but was never rendered (ground
  patches/mountains/decor/lake blocks — field uses `ChunkedTerrain` +
  `DistantMountains` now); `biomeAt`/`BIOMES` import dropped, now unused here.

**Track B — onboarding / ease-of-play:**
- Fixed `TutorialFinger.tsx`'s locale-fragile targeting — was matching a
  Thai-only `title` regex for the attack step while other steps matched
  static English titles (broke silently under different locale wiring, and
  2 of 5 steps targeted buttons only reachable after opening a menu that
  was closed by default, blanking the whole tutorial). Now uses stable
  `data-tutorial-target` attributes on 3 always-mounted elements (minimap,
  attack button, burger-menu-open button) — 5 steps → 3, all reachable.
- Added a shared `tutorialFingerActive` flag (`store.ts`) so `Onboarding`'s
  toast sequence and `HintSystem`'s mascot no longer render on top of the
  guided `TutorialFinger` flow — previously all 3 could show at once.
- `MenuBar.tsx` — trimmed the flat 23-button grid: Inventory/Quests/Map/
  Settings/Close stay always visible, everything else (Crafting, Guild,
  Auction, Mail, etc.) moves behind a "More ▾" toggle. Also deleted the
  dead unreachable desktop-grid branch (`collapsed` was hardcoded `true`).
- New `KeybindLegend.tsx` — dismissible "❓" panel listing the real current
  keybinds (WASD/Space/I/K/Q/M/C/O/T/P/V/F/H/B/Esc, pulled from the actual
  handlers, not guessed).
- `Scene.tsx` — keyboard movement cancelling an in-flight click-to-walk now
  flashes a red shrinking marker at the abandoned target instead of
  silently stopping with no feedback.
- Corrected the stale `B toggles build mode` doc below (P3.29b) — `B` is
  bound to auto-bot toggle; build mode has no dedicated key today.

**Verification:** client+server `tsc --noEmit` clean, `vite build` clean,
`smoketest.mjs` → `[done] all smoke checks passed` (against local Docker
Postgres + dev server). Live browser pass via `claude-in-chrome`: confirmed
the onboarding-layer coordination fix (only `TutorialFinger` shows, spotlight
correctly locked onto the minimap with the new selector), confirmed
combat/death/respawn still work, confirmed terrain/trees/rocks render with
no console errors and no visual corruption. **Caveat:** this sandboxed
browser session hit a pre-existing, code-unrelated `THREE.WebGLRenderer:
Context Lost` issue (confirmed via `git stash`-isolated A/B test against
the unmodified baseline — happens either way) that made sustained 3D
viewing unreliable, so the grass/water-shader/mountain-silhouette/cloud
changes specifically were not each individually eyeballed live — worth a
quick look next time you're playing on your own machine.

---

## 📸 Quick snapshot — รู้ใน 30 วินาที

| Area | Status |
|---|---|
| **Build** | ✅ Client + server build clean. PWA SW generated. |
| **Tests** | ✅ 180 passing (server) + 19 (shared) = 199 total, 4 skipped. (Re-verified 2026-05-30 post-audit.) |
| **TypeScript** | ✅ Zero errors across shared/server/client. |
| **CI** | ✅ GitHub Actions: typecheck + tests + vite build + multi-arch Docker → GHCR on `v*` tag. |
| **Bundle** | ✅ Vendor-split: index.js 494kB + Three.js 687kB (cacheable) + lazy modal chunks |
| **Services extracted** | ✅ 27 — all domain services in `packages/server/src/services/`. |
| **Active room** | `WorldRoom.ts`. Old `GameRoom.ts` deleted as dead code. |
| **i18n** | ✅ Full string extraction — 60+ namespaces in `locales/en.ts` + `th.ts`. |
| **Mobile** | ✅ Responsive Login/CharacterSelect/CharacterCreator/HUD/TouchControls (portrait+landscape). |
| **Movement** | ✅ Server+client collision (slide along obstacles), auto-jump, dynamic target switching. |
| **Database** | ✅ **Postgres** (was sqlite). Re-baselined migration. Alpine `linux-musl-openssl-3.0.x` binaryTarget. |
| **Deployment** | ✅ **Docker prod-ready.** Local stack verified. `docs/DEPLOY.md` for VPS, `docs/RUNBOOK.md` for ops. |
| **TLS / proxy** | ✅ Caddy container (auto Let's Encrypt + HTTP/3 + WS upgrade) in `docker-compose.prod.yml`. |
| **CI deploy** | ✅ `docker-publish.yml` → GHCR. `scripts/deploy.sh` for zero-downtime SSH rollout. |
| **PWA** | ✅ Installable. Server serves client static when NODE_ENV=production (one-port deploy). |
| **Auth hardening** | ✅ JWT_SECRET ≥32 chars + known-bad reject. No plaintext password storage. hCaptcha hooks (env-gated). |
| **Backups** | ✅ `scripts/backup-pg.sh` — daily pg_dump rotate-7 + optional rclone to B2. |

---

## 🗂️ Where things live

### Server
```
packages/server/src/
├── index.ts                 — HTTP/WS bootstrap, /health, graceful shutdown, Redis opt-in
├── auth.ts                  — JWT login/register, bcrypt 12, dummy-hash timing equalizer
├── db.ts                    — Prisma client singleton
├── leaderboard.ts           — In-memory weekly leaderboard
├── logger.ts                — Structured logger (JSON in prod, pretty in dev)
├── rooms/GameRoom.ts        — Colyseus room (~2900 lines, shrinking)
└── services/                — Extracted domain services (each with .test.ts)
    ├── RateLimiter.ts        — token bucket
    ├── SpatialHash.ts        — chunk-grid spatial index
    ├── AntiCheat.ts          — input validation
    ├── DailyChallenge.ts     — daily quest progress + rewards
    ├── Party.ts              — invite/accept/leave state machine
    ├── Achievements.ts       — unlock detection + leaderboard pts
    ├── Friend.ts             — DB friend list w/ MAX_FRIENDS=100
    ├── Mailbox.ts            — race-safe atomic claim
    ├── Auction.ts            — list/browse/buy/cancel (race-safe)
    └── Guild.ts              — create/join/leave ($transaction) + chat
```

### Client
```
packages/client/src/
├── Game.tsx                 — Top-level room connect + UI mount. Lazy modals here.
├── App.tsx                  — Routes (Login / CharacterSelect / Game)
├── main.tsx                 — React bootstrap + PWA registerSW
├── store.ts                 — Zustand global state + localStorage persistence
├── index.css                — Tailwind base + glassmorphism panel + prefers-reduced-motion
├── scene/                   — R3F Three.js scene
│   ├── Scene.tsx             — Main scene composition + player input
│   ├── DayNight.tsx          — Sun/moon/sky (no setState in useFrame anymore)
│   ├── ChunkedTerrain.tsx    — Infinite procedural world
│   ├── chunkWorld.ts         — Noise + biome math
│   └── DamageNumbers.tsx     — Damage popups w/ texture dispose
├── ui/                      — 30+ panel components (mix of statically and lazy-loaded)
├── hooks/                   — useKeyboard, useDraggable, useSfx, useQuests
├── assets/                  — Asset loader infra
│   ├── manifest.ts           — Typed asset registry (models/textures/audio)
│   └── useAsset.ts           — useModel/useTexture hooks with proc fallback
└── sfx/sfx.ts               — Web Audio procedural SFX

packages/client/public/assets/  — Drop GLB/textures here, register in manifest.ts
packages/client/dist/             — Vite build output (PWA: sw.js + manifest)
```

### Shared
```
packages/shared/src/
├── index.ts                 — Re-exports everything
├── schema.ts                — Colyseus schemas (Player, Monster, etc.)
├── constants.ts             — GAME_CONFIG + MONSTERS + EXP_PER_LEVEL (Lv30+ softcap)
├── items.ts                 — ITEMS catalog + MONSTER_DROPS
├── jobs.ts                  — JOBS + JOB_ADVANCEMENT + skills
├── quests.ts                — QUESTS (incl. Lv10-30 chain)
├── recipes.ts               — Crafting recipes
├── status.ts                — Status effects (poison/burn/stun/freeze/slow/regen)
├── maps.ts                  — MAPS + biomeAt
├── npcs.ts                  — NPCS catalog
└── __tests__/               — vitest specs (exp, items, quests, recipes, status)
```

### Database
```
packages/server/prisma/
├── schema.prisma            — Source of truth. SQLite default.
├── dev.db                   — Local dev DB (gitignored)
└── migrations/              — Versioned migrations (baseline applied)
    ├── migration_lock.toml
    └── 20260519000000_baseline/migration.sql
```

---

## 🚀 How to verify (any session can paste these)

```bash
# Install
pnpm install

# Build
cd packages/client && pnpm exec vite build
cd packages/server && pnpm exec tsc --noEmit

# Tests
cd packages/server && pnpm test    # → 54 passing
cd packages/shared && pnpm test    # → 19 passing

# Dev
cd packages/server && pnpm dev     # tsx watch on :2567
cd packages/client && pnpm dev     # vite on :5173

# DB
cd packages/server && pnpm db:push    # quick dev sync
                      pnpm db:migrate # prod-style migration
                      pnpm db:deploy  # apply migrations only
```

---

## P0 — Blockers before production launch

### A. Behavioral test coverage for WorldRoom handlers
**DONE 2026-05-23.** `packages/server/src/rooms/__tests__/WorldRoom.test.ts` (580 lines) + `WorldRoom.behavioral.test.ts` (478 lines) cover Auction, Guild, Trade, Inventory, Combat, Quest. handleAttack, handleSkill, equip, quest accept/turn-in, party request/accept/offer, trade offer/zeny-clamp, status effects, monster HP on death.

### B. CI / GitHub Actions
**DONE 2026-05-21.** `.github/workflows/ci.yml` — pnpm install + cache, build all packages, vitest run, typecheck.

### C. CORS + helmet + rate limit on HTTP routes
**DONE 2026-05-22.** `packages/server/src/index.ts`:
- `cors()` whitelist: `localhost:5173`, `localhost:4173`, `127.0.0.1:5173`, `127.0.0.1:4173`
- `helmet()` CSP/HSTS/X-Frame enabled
- Global rate-limit: 200 req/15s (all routes)
- Auth rate-limit: 10 req/60s on `/api/auth/login` + `/api/auth/register`
- HTTPS redirect middleware (production only, respects `x-forwarded-proto`)

### D. Server-side anti-cheat: movement bounds
**DONE 2026-05-20.**
**Implementation:** `playerLastPos` Map (x, z, ts, speedFlag, teleportFlag) in WorldRoom fields.
**Teleport detection:** If distance moved > 10× max legitimate distance (`sp * dtSec * 10`) → roll back position + warn message. Rate-limited 3×/60s.
**Speed hack detection:** If distance moved > 1.5× max speed for 3+ consecutive ticks → console.warn. Rate-limited 3×/60s.
**Note:** `continue` removed — cheaters still get survival/portal processing to avoid detection timing leaks.

---

## P1 — Production polish

### 1. GameRoom domain split *(15/15 done ✅)*

**All services extracted** (in `packages/server/src/services/`, each with `.test.ts`):
- ✅ RateLimiter, SpatialHash, AntiCheat, DailyChallenge, Party, Achievements,
  Friend, Mailbox, Auction, Guild, Combat, Inventory, Trade, Spawn, Quest

**Pattern to follow** (from completed extractions):
1. Create `services/X.ts` with pure data + transitions (no I/O)
2. Add `services/X.test.ts` with unit tests covering invariants
3. GameRoom holds `xSvc = new X(...)` field
4. Handlers in GameRoom become thin: extract msg → call service → forward result
5. Delete the original inline state Maps + helpers from GameRoom

### 2. Real-time observability
**DONE 2026-05-21.** Tick duration metric: rolling 100-tick buffer in WorldRoom, `getTickStats()` returns `{avg, max}`, logs warn if >40ms. `/health` endpoint now returns `{ uptime, players, rooms }`.

### 3. Redis path: integration smoke test
**DONE 2026-05-21.** `packages/server/src/__tests__/redis.test.ts` — ioredis-mock tests (8 passing, run by default), real Redis tests with `TEST_REDIS_URL` env var. `docker-compose.yml` at root for manual multi-instance testing.

### 4. Damage formula: level scaling
**DONE 2026-05-20.**
**Applied to:** `Combat.ts` `handleAttack` (line ~117) and `handleSkill` (line ~159).
**Formula:** `dmg *= 1 + Math.max(-0.3, Math.min(0.5, lvDelta * 0.03))` where `lvDelta = attacker.level - target.level`.
**Effect:** Lv50 vs Lv1 monster: ×1.47 damage. Lv1 vs Lv50: ×0.70 damage. No level 30+ softcap issues.

### 5. Zeny sinks — anti-inflation
**DONE 2026-05-21.** Waypoint fast-travel cost: 50z per teleport (server-side flat, client shows tiered pricing in UI).

### 6. Mobile button audit (44×44 minimum)
**DONE 2026-05-20.**
**Files fixed:** Inventory.tsx, SettingsPanel.tsx, AchievementsPanel.tsx — close buttons updated to `min-w-[44px] min-h-[44px] w-11 h-11` with `flex items-center justify-center`.

### 7. Loading states on async buttons
**DONE 2026-05-21.** NpcDialog (Buy/Accept/Turn-in/Build), AuctionHouse (buy), FriendList (add) — all have `busy` state + `disabled` + `...` spinner.

### 8. Unified error toast system
**DONE 2026-05-20.**
**EventFeed.tsx:** Added `severity: "info"|"warn"|"error"` field to `Entry` type. Server sends `{ text, severity }` on the `system` channel. Client maps severity → color: cyan (info) / amber (warn) / red (error). Existing `levelup` and `questReward` channels unchanged. No new infrastructure needed.

### 9. PWA app icons (production-grade)
**DONE 2026-05-21.** SVG icon + sharp PNG generation for all sizes (72-512). Icons at `public/assets/icons/`, manifest + index.html updated.

### 10. EXP curve playtesting
**DONE 2026-05-21.** No adjustment needed — Lv50 at 32.7 hours casual play, well under 50hr threshold. Formula: `25 + lv²×5` (≤30), then `4525 + (lv-30)×120`.

---

## P2 — UX / Accessibility

### 11. Focus traps on modals
**DONE 2026-05-21.** `focus-trap-react` installed + wrapped all modals: NpcDialog, Inventory, AuctionHouse, PetBox, MenuBar. `allowOutsideClick: true` so clicking backdrop closes the modal.

### 12. Tooltip-on-tap for touch
**DONE 2026-05-22.** `useTooltip` hook at `hooks/useTooltip.tsx`. 600ms long-press touch = tooltip, 200ms hover mouse. IconBtn wired in MenuBar.

### 13. Confirm dialogs
**DONE 2026-05-21.** `ConfirmDialog` component at `ui/ConfirmDialog.tsx`. Wired to: pet release, achievement title change, unequip rare item.

### 14. Color contrast audit
**DONE 2026-05-22.** All `text-cyan-200` → `text-cyan-100` (HUD, InteractionPrompt, Login, Minimap, QuestTracker, SettingsPanel, NpcDialog, WorldCreate, WorldCompanionPanel, WorldLobby). `text-cyan-400` → `text-cyan-300` where used as text.

### 15. :focus-visible outline globally
**DONE 2026-05-21.** `*:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }` in `index.css`.

### 16. Skip-to-content link
**DONE 2026-05-22.** `id="game-canvas"` on root div + skip link in Game.tsx with `sr-only` / focus-visible cyan styling.

### 17. Screen reader labels
**DONE 2026-05-21.** `aria-label` added to all icon-only buttons (close buttons on modals, menu bar icons). `ariaLabel` prop on `IconBtn` component.

### 18. i18n full string extraction
**DONE 2026-05-23.** 540+ keys in `locales/en.ts` + `locales/th.ts`. Converted components: `AuctionHouse`, `AutoPotion`, `CharacterCreator`, `Chat`, `Login`, `MenuBar`, `SettingsPanel`. Remaining components (HUD, Inventory, SkillBar, WorldLobby, panels) follow same pattern — new strings add to locale files.

### 19. prefers-color-scheme
**DONE 2026-05-22.** `@media (prefers-color-scheme: light)` overrides in `index.css`. Neon cyan/violet accents preserved. All text contrast ≥ 4.5:1.

---

## P3 — Game content / balance

### 20. Late-game content (Lv30+)
**DONE 2026-05-22.** 5 new daily endgame challenges (boss_attack, dungeon_clear, pvp_win, craft_rare, gather). 3rd job tier added (lord_knight, high_wizard, sniper_t2, high_priest, assassin_t2) at Lv50. Endless Tower dungeon (floors 1-10, procedural). Dungeon portal + DungeonUI component.

### 21. More monsters per biome
**DONE 2026-05-22.** Desert: sand_worm, scorpion_lord. Snow: ice_wraith, snowman_giant. Swamp: bog_witch, swamp_serpent. All with procedural 3D models, drops, and spawn placements.

### 22. Crafting depth
**DONE 2026-05-22.** ItemQuality type + QUALITY_COLORS/NAMES. CRAFTING_BENCHES (workbench/forge/enchanter/master_forge). Quality chances on recipes. Research.ts service (grantResearchPoints, attemptDiscovery).

### 23. Pet system depth
**DONE 2026-05-22.** PET_SKILLS (guard_dog, farmhand, lucky_pet, warrior_pet, mage_pet). PET_EVOLUTIONS (phoenix_chick, truffle_pig, golden_cow). evolvePet handler in WorldRoom. PetBox shows evolve button (5000z) + breeding UI.

### 24. Skill tree per job
**DONE 2026-05-22.** SKILL_TREES data (swordsman/mage/archer/acolyte/thief branches). SkillNode type. SkillTreeUI component (grid layout, unlock on click). allocateSkill message. skillPoints on player. MenuBar button.

### 25. Marriage / social bonds
**DONE 2026-05-22.** spouseId + marriageDate in Player schema. propose/accept_proposal/decline_proposal/divorce handlers. MarriageUI component. wedding_ring_m/f items. proposal_received notification (browser confirm).

### 26. Housing decoration sharing
**DONE 2026-05-22.** structuresJson on Player. houseOpen flag. visitHouse handler (warp to owner's coords). giftStructure handler. VisitPanel in WorldCompanionPanel. toggleHouseOpen.

### 27. Achievement UI polish
**DONE 2026-05-22.** Achievement banner slide-down animation (slide-down keyframe). Seasonal event particles (Christmas snowfall, Songkran water splash, Halloween skulls, Loy Krathong lanterns). Screenshot save in PhotoMode.

### 28. Seasonal events
**DONE 2026-05-22.** getCurrentSeason() in WorldRoom (Songkran Apr 13-15, Loy Krathong Nov 20-25, Halloween Oct 31, Christmas Dec 24-26). SeasonalEffects.tsx with Snowfall, ParticleSplash, LanternFloat, FloatingSkulls. 6 seasonal items (songkran_water, xmas_ornament, candy_cane, pumpkin_lantern, halloween_candy, krathong).

### 29. Server-hosted world system
**DONE 2026-05-22.** Player-created worlds with invite codes, Co-op/PvP/Adventure modes:
- Prisma `World` model + `roomId` field for Colyseus room binding
- `WorldRoom` accepts `worldId/worldName/worldMode/worldTemplate/maxPlayers` options
- `maxClients` cap + onJoin full-check enforced
- `handleAttack` blocks PvP when `worldMode !== 'pvp'`
- `WorldManager` tracks invite codes + `setRoomId()`
- Colyseus room instantiated lazily on first join via `joinOrCreate("world", { worldId })`
- `WorldState` exposes world metadata to clients
- HUD: world info badge (name, mode badge, player count)

### 29b. Base building (DONE 2026-05-20)
**Structures system:** players place/remove structures in the world using structure items.
- **Store:** `buildMode: boolean`, `selectedStructItemId: string | null`, `toggleBuildMode()`, `setSelectedStructItem()`
- **Server:** `WorldRoom.ts` `build_structure` handler (consume item + add to `state.structures`), `structure_removed` handler
- **Client Scene:** Ghost preview (pulsing wireframe), placement click, right-click destroy context menu
- **UI:** "🏠 สร้างฐาน" / "💥 ทำลาย" buttons in HUD; structure filter in Inventory
- **Inventory:** click structure item → enters build mode automatically
- **Limit:** 12 structures per player; server enforces + broadcasts "🏠 Structure limit reached"
- **Items:** `struct_tent`, `struct_fence`, `struct_torch`, `struct_sign`, `struct_tower`, `struct_barrel`
- **Keybind:** HUD "🏠 สร้างฐาน" button toggles build mode; `ESC` exits.
  (`B` is bound to the auto-bot toggle, not build mode — corrected 2026-07-15,
  see `MenuBar.tsx`'s B-key handler. Build mode has no dedicated key today.)
- **Feedback:** system messages shown via EventFeed (build errors, limit reached, destroy confirm)

---

## P4 — Infrastructure / scale

### 29. Asset adoption (real GLTF)
`packages/client/src/scene/models/GLTFHero.tsx` — loader stub with integration docs.
Upgrade path: Ready Player Me + Mixamo → `GLTFHero.tsx` + `GLTFLoader` + `useAnimations()`.
Until models provided, procedural capsule/box via CharacterModel.tsx.
✅ DONE commit `b60ec07`

### 30. Sprite sheet / 2D top-down mode
**DONE 2026-05-22.** Toggle between 3D and 2D top-down view with `V` key or HUD button.
- `SpriteRenderer.tsx`: procedural 4-dir humanoid + monster sprites with walk animation
- `Sprite2DContext.tsx`: React context + `useSprite2D` hook
- `Sprite2DRenderer.tsx`: Canvas RAF loop, biome tiles, player-centered camera, minimap overlay
- `ViewModeToggle.tsx`: HUD toggle button + `V` shortcut
- `store.ts`: `viewMode: '3d' | '2d'` + `toggleViewMode`
- `Game.tsx`: conditional render `<Scene>` (R3F) / `<Sprite2DRenderer>` (Canvas 2D)

### 31. Background music
Procedural Web Audio API — `MusicController` class + `useMusic` hook.
`packages/client/src/sfx/music.ts` (187 lines) + `hooks/useMusic.ts` (22 lines).
Ambient pads (C2/G2/C3 drones + LFO) + generative pentatonic melody.
Lazy init on first user interaction (AudioContext policy).
✅ DONE commit `c747db8`

### 32. Sentry / error tracking
`@sentry/node` (server) + `@sentry/react` (client). Gated on `SENTRY_DSN` / `VITE_SENTRY_DSN`.
Server: `index.ts` init with `tracesSampleRate: 0.1`. Client: `Game.tsx` ErrorBoundary.
`SENTRY_DSN=... pnpm install @sentry/node @sentry/react`
✅ DONE commit `c747db8`

### 33. Log shipping
Logger writes JSON in prod → ship via Vector/Fluent Bit to Loki/Datadog.
No code change needed; deploy config only. `docs/CRON_BACKUP.md` for backup strategy.
✅ DONE — docs only, no code change needed

### 34. Database backups
`scripts/backup.sh` (keeps last 7 SQLite .backup rotations) + `scripts/restore.sh`.
`docs/CRON_BACKUP.md` with cron examples + S3/B2 off-server strategy.
✅ DONE commit `c747db8`

### 35. Postgres migration path
When SQLite ceiling hit (~1000 concurrent). Switch datasource, re-baseline.

### 36. Multi-region / horizontal scale
Redis presence wired (single-region multi-instance). For global:
region-locked rooms, sticky sessions, CDN for static.

### 37. Load testing harness
100 bots → measure tick duration, memory growth, network bandwidth.
**SERVER_SIZING_50_PLAYERS.md integration:**
- Per-room targets: 0.3–0.8 vCPU, 20–80 MB RAM, 10–15 Mbps outgoing
- Baseline VM: 8 vCPU / 16 GB / 1 Gbps NIC (supports 50 players/room)
- k6 WebSocket script: 50 concurrent clients, 20Hz position updates, p95 < 200ms
- Interest management + msgpack/protobuf to reduce bandwidth 3x–10x
- Metrics: CPU, RAM, network, latency, GC stalls, packet loss
- Acceptance: p95 < 200ms, CPU < 70%, memory stable, no packet loss

**✅ DONE (P4.37.1+2):**
- `tools/k6/loadtest-room.js` — k6 ESM WebSocket script, 50 clients @ 20Hz, p95 latency < 200ms, `pnpm loadtest`
- `packages/server/src/services/LoadTestHarness.ts` — in-process Node.js headless bot simulator (no k6 needed), `pnpm test:harness`
- `tools/harness-runner.ts` — CLI runner with env vars (ROOM_URL, BOT_COUNT, DURATION_MS, WARMUP_MS)
- `packages/server/src/services/LoadTestHarness.test.ts` — vitest suite (skipped by default, run manually against live server)

---

## P5 — Developer experience

### 38. ESLint + Prettier
Shared `eslint.config.mjs` (TS + React flat config) + `.prettierrc.json` + `.husky/pre-commit`.
Install: `pnpm add -D eslint prettier eslint-plugin-react eslint-plugin-react-hooks @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier`
✅ DONE commit `87e8da2`

### 39. README expansion
New sections: Architecture (ASCII diagram), Deploy (Railway/k8s/Fly.io), Quickstart,
Environment Variables table. Thai language throughout. README now 20K+ chars.
✅ DONE commit `f4db7cc` (README) + `de2a081` (BACKLOG update)

### 40. CHANGELOG.md
Auto-generated from conventional commits using commit patterns.
Thai headers: ฟีเจอร์ใหม่, แก้บัก, ปรับปรุง, งานอื่นๆ, เอกสาร.
✅ DONE commit `f4db7cc` (CHANGELOG.md)

### 41. SemVer + release tags
`v0.1.0` tag pushed to origin. package.json version → 0.1.0.
✅ DONE — tag created + pushed

### 42. Storybook for UI components
`packages/client/.storybook/main.ts` + `preview.tsx`. Example: `src/stories/Button.stories.tsx`.
Install: `cd packages/client && pnpm add -D @storybook/react @storybook/react-vite @storybook/addon-essentials storybook && pnpm storybook`
✅ DONE commit `f4db7cc`

---

## P6 — Security hardening (sustained)

### 43. JWT refresh tokens
90d refresh tokens with Redis revocation. `/api/auth/refresh` + `/api/auth/logout`.
`getRedis()`, `storeRefreshToken()`, `revokeRefreshToken()`, `generateRefreshToken()`.
No Redis? Graceful no-op (tokens still work, revocation disabled).
✅ DONE commit `c747db8`

### 44. Password requirements
Server: `validatePassword()` (>=8, upper, lower, digit) + wired to `/register`.
Client: `PasswordStrength` component (red/orange/yellow/green bars, 0-3 score).
✅ DONE commit `c747db8`

### 45. 2FA (TOTP)
Out of scope MVP. Note for future.

### 46. Account recovery
**DONE 2026-05-22.** Security questions fallback — 2 Q&A pairs stored on User (bcrypt hashed). `POST /api/auth/recovery/verify` → 15-min JWT recovery token. `POST /api/auth/recovery/reset-password` → new password. `AccountRecovery.tsx` 3-step flow. `recovery.test.ts` coverage.

### 47. Audit log table
Prisma `AuditLog` model (id, action, userId, characterId, targetId, metadata, ip).
`AuditService.log()` fire-and-forget wrapper. Wired: auth (login/register/delete),
WorldRoom (join/leave), Trade (complete/cancel), Auction (list/buy/cancel).
`GET /api/admin/audit?action=&limit=50` route.
✅ DONE commit `f4db7cc`

### 48. Server-side schema validation (Zod)
`packages/server/src/schemas.ts` — Zod schemas for all onMessage handlers.
WorldRoom: `validate()` helper (schema.safeParse → T | null, logs warning on invalid).
All handlers wrapped: drops bad payloads instead of crashing.
✅ DONE commit `f4db7cc`

---

## ❌ Won't do (explicit non-goals)

- **External asset downloads** — per CLAUDE.md, procedural / local-only.
- **SMTP / transactional email**
- **In-app purchases / monetization**
- **Cheating tolerance** ("fair fight" mode) — server is authoritative
- **Native mobile app** — PWA covers this
- **WebRTC voice chat**

---

## 📜 Recent commit log (for context-resume)

### Session 2026-05-30 — Multi-agent whole-repo audit (44 bugs fixed)

9 domain finders + adversarial verify pass → 80 candidates → 44 confirmed → 6 themed commits, all pushed to `origin/main`. Server tests 180/180 ✅, shared 19/19 ✅, smoketest ✅.

```
06792e9 perf(client/scene): Arrow Vec3 alloc, CaveLabel texture leak, selectionRing change-detect, AmbientParticles isNight cache, sfx ctx beforeunload
327cd30 fix(client/ui): Chat scrollRef + smart-scroll + composite key, AuctionHouse title literal + double-buy ref guard, Hotbar clear on job change, AchievementsPanel/JobAdvancement listener leak, CraftingPanel recipe:discovered overlay, Game.tsx joinOrCreate try/catch
e79b4e3 fix(server+shared): Combat respawn timer registry + Spawn cancelRespawn, statusTickAcc clear on kill, SurvivalService hunger else-if (no stack), Spawn getUTCDay, Leaderboard flush snapshot + tie-break, shared add magic_scroll/rare_ring/banshee/skeleton_captain
efed085 fix(social): Friend bidirectional in $transaction, Guild.leave interactive txn, Party stale-invite guard, /block /unblock /blocklist (in-memory), DailyChallenge endless re-validate
91e4448 fix(economy): CraftingService snapshot+rollback, Auction cancel fee refund + ITEMS validation, Trade itemId snapshot + bounds check, sendMail self-reject
8feedd8 fix(security): auth.ts /refresh redis-uid lookup + single-use rotation + crypto.randomBytes, /api/admin/audit ADMIN_USER_IDS gate, /metrics Bearer+cookie+URL-scrub redirect, CAPTCHA fail-closed prod, Redis required prod, trust proxy, AuditService DB-failure file fallback, HS256 pinned
```

**New prod env contract (see `.env.production.example` + `docs/DEPLOY.md`):**
- `REDIS_URL` — REQUIRED in prod (refresh-token storage). Server `process.exit(1)` without it.
- `ADMIN_USER_IDS` — comma-separated User.id list. `/api/admin/audit` returns 503 if unset.
- `CAPTCHA_SECRET` unset in prod → `/register` fail-closes (startup warning).
- `TRUST_PROXY` — number of upstream proxy hops (default 1 in prod). Required for rate-limit-by-IP.
- `AUDIT_FALLBACK_LOG` — optional. AuditService writes here when DB write fails.

**Known follow-up (not done this session):**
- `Character.blocklistJson` schema migration so /block persists across server restart. Current implementation is `WorldRoom.blocklist: Map<string, Set<string>>` (session-only).

```
947afdc fix(mobile): responsive gaps — GameFrame banner, corner gems, form inputs, detail panels
12df27b feat(auto-combat): dynamic target switching — switch to closer/attacking mobs mid-fight
ed60e76 feat(mobile): responsive game-screen UI for portrait/landscape
8d9142b fix(mobile): responsive CSS and TouchControls layout
ffb24bb feat(mobile): responsive Login, CharacterSelect, CharacterCreator
7b8165a fix(i18n): useT() in BuildModeButton/ActionButtons sub-components
e0f0498 fix(i18n): correct useT import path in QuestTracker and GuildPanel
0143bff feat(auto-jump): auto-mode triggers jump when target is higher than step
be2cb1d feat(collision): server+client collision system — slide along obstacles, wall-follow
f4d357a feat(i18n): TargetDisplay, TutorialFinger, WorldLobby, Chat, TouchControls i18n
3aa94d0 feat(i18n): WorldCompanionPanel full i18n + fix locale duplicate keys
7e59ae7 feat(i18n): CharacterSelect full i18n conversion
3e49748 feat(i18n): CraftingPanel i18n conversion
07bd8fa feat(i18n): AchievementsPanel, DailyReward, HUD, Inventory, PartyPanel
adebb22 feat: P2.19 light mode, P6.46 account recovery, P3.29 server-hosted worlds, P3.30 2D sprite view
f4db7cc feat(P6.47): audit log table + Zod schema validation
b60ec07 feat(P4.29): GLTFHero.tsx loader stub
87e8da2 feat(P4.38): ESLint + Prettier config with husky pre-commit hook
c747db8 feat(P4): Sentry, background music, password strength, JWT refresh, DB backup scripts
e36b993 fix(P0): CORS strict whitelist + helmet + dual-rate-limit + HTTPS redirect
```

### Cleanup pass — 2026-05-24 (commit `bb07343`)
- Deleted dead `GameRoom.ts` (2240 lines) — server only registers WorldRoom.
- Fixed `@game/shared` package emits `.d.ts` (declaration: true in tsconfig). Resolved TS7016 across server/client.
- Lifted `engageRange` computation in Scene.tsx to fix use-before-declaration.
- Fixed Sprite2D context/renderer to use `p.pos?.x/z` (matches schema, was reading non-existent `p.x/z`).
- Fixed CollisionService MapDef field names (`size` / `spawns`, not `worldSize` / `monsterSpawns`).
- Added `ioredis-mock` type shim (`packages/server/src/types/shims.d.ts`).
- CraftingPanel labels use translation keys instead of broken top-level `t()` calls.
- CI: added pnpm setup action + client typecheck step + shared build-before-typecheck.
- Extracted `Waypoint` + `Season` services from WorldRoom (+8 tests).
- Inventory.handlePickup now credits zeny currency drops directly to `p.zeny` (was failing to add a non-existent item).
- Added Dockerfile (multi-stage) + docker-compose (postgres + redis + 2 server) + POSTGRES_MIGRATION.md.

### Smoketest backlog (still owed, deferred from 2026-05-26 sessions)

Manual browser tests that need real player time to walk far enough — not
worth automating. Pick up when next playing:
- Recall stone end-to-end (buy from Mira 500z → bind hotbar → use → verify
  warp to village + cooldown overlay on slot).
- Cave entrance visuals (walk to forest_cave +78/-60 or swamp_cave 0/+85,
  screenshot torches flickering + pulsing name label).
- Chest interaction (walk into a cave, click chest → loot toast +
  lid animates open. Click again → "already opened" + respawn countdown).
- Mesh LOD verification — confirm tree/rock meshes pop in as player crosses
  the 60m radius (inferred working from billboard LOD using same code path,
  not directly observed).

### Unverified commits — landed 2026-05-26 with TC+tests only, NOT browser-verified

Honest accounting on user's "audit ที่แก้ไปทั้งหมดแล้วเหรอ" pushback.
All 6 below typecheck + tests green, but were NOT exercised in a real
browser before push. Drive each in `claude-in-chrome` next session
before considering them validated:

- `a30d15e fix(combat): respawn after mob kill` — verify by getting Tester01
  killed by a slime and watching `me.dead` flip back to false at ~5s.
- `d533547 fix(ui): stagger top-center HUD bars` — open game with
  BossBar visible + select a target + take a hit so EventFeed fires;
  confirm no visual overlap.
- `9cd456d i18n: inventory.searchPlaceholder` — open Inventory, confirm
  placeholder reads "🔍 ค้นหาของในกระเป๋า..." not the raw key.
- `4733bc8 perf P0: Hotbar 80→200, dup hash, bot bbox` — cast a skill,
  confirm cooldown sweep doesn't feel chunky. Watch a dev bot pick up
  loot to confirm bbox-reject didn't break the inner check.
- `6490b45 perf P1: text cache + tree shadow` — kill several mobs in
  rapid succession, confirm damage numbers still render (cache hit
  path). Look at trees in daylight — leaves should NOT cast shadows,
  trunks SHOULD.
- Optionally hit `/metrics?token=local-admin` after a few minutes of bot
  load to compare tick p50/p95 against the pre-perf baseline (49ms p95
  at 50 bots, 132ms p95 at 100 bots).

### Perf audit + UX polish pass — 2026-05-26 (11 commits)

Two big themes this session: (a) the user explicitly asked me to
**audit before implement** instead of jumping in, and (b) flagged
performance + UX issues spotted in the live Docker stack.

**Audit-first discipline paid off:**
- 4 P0 perf recs from `docs/PERFORMANCE_AUDIT.md` — verified each
  before touching code. #4 (botState delete) turned out to be a
  **false positive** — already at WorldRoom.ts:1256. The agent
  missed it.
- #3 (dropSpatialHash) — that hash didn't exist; downgraded scope to
  a cheap axis-aligned bbox-reject instead of building a new service.
- 7 P1 recs — 4 of them turned out to be micro-optimizations behind
  already-solved bottlenecks. Skipped with documented reasons.

**Shipped (perf):**
- `perf(P0)` Hotbar setInterval 80ms→200ms (-60% renders), dropped the
  duplicate spatial-hash rebuild in CombatService (O(P) savings/tick),
  bot drop-scan bbox pre-reject (skips hypot+sqrt on ~99% of drops).
- `perf(P1)` Shared text-texture LRU cache (`scene/textCache.ts`) —
  combat crit-spam no longer churns GPU textures; same NPC name → one
  texture across all instances. Stripped `castShadow` from tree leaves
  (CLAUDE.md violation) — trunks still cast for silhouette.
- `perf(scene)` Distance-LOD culling — `MOB_BILLBOARD_RADIUS=18`,
  `MOB_MODEL_RADIUS=60`, `MOB_MINIMAP_RADIUS=25`. Selected target
  always visible. Throttled to ~5Hz with hysteresis (only assign
  `.visible` when value actually changes — first pass dirtied scene
  graph 60×/sec which user immediately felt as "ค้างนานขึ้น").

**Shipped (UX bugs from live testing):**
- `fix(combat)` Player killed by mob regular attack never respawned
  — only the status-effect death path was scheduling respawn.
  CombatService.scheduleRespawn() mirrors the logic.
- `fix(ui)` NPC dialog draggable + z-30 (user screenshot showed Bren
  build dialog with chat input bleeding through; not draggable).
- `fix(ui)` Top-center HUD bars (5 components anchored at top-2
  left-1/2) staggered to top-14 / top-28 so BossBar/TargetDisplay/
  EventFeed don't overlap.
- `i18n` Added missing `inventory.searchPlaceholder` string (TH+EN)
  — caught by browser smoketest showing the raw key.
- `chore(docker)` Unpublish redis :6379 to host so it doesn't collide
  with other local redis containers.

**Verified via browser smoketest (6 audit rounds):**
- R1 typecheck + tests (all 3 packages, 180/180 server, 19/19 shared)
- R2 HP bar LOD — only nearby mobs labeled (verified)
- R3 mesh LOD — inferred from same code path (didn't walk far enough)
- R4 minimap radius — sparse dots, no longer dot soup
- R5 NPC dialog drag — title bar drag works, position persists via
  localStorage
- R6 perf — no console errors, scene smooth

**Docs:**
- `docs/PERFORMANCE_AUDIT.md` — comprehensive audit grouped by
  severity with file:line refs + concrete fix snippets + "already
  passing" matrix so nobody regresses correct work.

### Production-readiness pass — 2026-05-25 (16 tasks, 10 commits)

**Cleanup (3):**
- ChestService unit tests (+12, race-safe open + respawn + loot table coverage).
- BossEvent.nextSpawnIn tests (+5).
- vitest .env loading fixed (was the reason recovery.test.ts had 7 silent failures). Server suite went 156 → 180 passing.

**Polish (3):**
- Boss spawn toast extended to all cave bosses (snowman_giant, scorpion_lord, bog_witch, ice_giant, shadow_lord) via `BOSS_KINDS` set in Combat.ts.
- Recall stone now sends `recallCooldown { until }` to client; new `useRecallCooldown` hook drives a per-slot greyscale + countdown overlay in Inventory + ItemHotbar.
- Quest markers capped to nearest 5 spawns/quest in WorldMap (was dot soup for `kill 5 slime`).
- Chest click-while-opened or out-of-range now gets a system toast instead of silent reject.

**Polish — new UI:**
- **Item hotbar bound to keys 1-5** (`ItemHotbar.tsx`, persisted in localStorage). Shift+click a consumable in Inventory to bind. Right-click slot to clear. Recall cooldown overlay shared.
- **Inventory search bar** — substring match on name/itemId; bypasses the 200-slot grid view when actively searching.
- **Damage number juice** — CRIT! prefix at 2.0× scale, MISS uppercase shrunk 0.85×, heal slightly larger with leading +.

**Safety (7):**
- Plaintext password storage removed from localStorage. Legacy `savedCreds` blob auto-wiped on mount. Username-only "remember me".
- JWT_SECRET validator: prod refuses to start if missing / <32 chars / matches known dev defaults. `process.exit(1)` with helpful message.
- hCaptcha (env-gated) on `/register`. Client lazy-loads widget when `VITE_CAPTCHA_SITE_KEY` set; server verifies if `CAPTCHA_SECRET` set. No-op locally.
- CORS now `LAN regex + ALLOWED_ORIGINS env` (comma-separated). LAN dev unchanged.
- Helmet CSP tuned for PWA: allow self/data:/blob:/ws:/wss:/inline scripts (Vite + WebGL shaders).
- DEV_BOTS hard-gated to non-prod (logs + ignores in NODE_ENV=production).
- Dead `debug-schema.ts` removed.

**Infra (6):**
- `docker-compose.prod.yml` + `Caddyfile` — Caddy 80/443 (+HTTP/3) → server :2567, postgres + redis healthchecked, all restart unless-stopped. Required secrets enforced via `${...:?msg}`.
- `.github/workflows/docker-publish.yml` — multi-arch (amd64+arm64) GHCR push on tag `v*`. semver + latest tags + gha cache.
- `scripts/deploy.sh` — SSH + compose pull + `--no-deps server` zero-downtime restart + health wait.
- `scripts/backup-pg.sh` — pg_dump rotate-7 + optional rclone push.
- `docs/DEPLOY.md` — 90min VPS walkthrough (Hetzner CX22 in Singapore recommended). SSH harden + Docker install + DNS + first deploy + cron.
- `docs/RUNBOOK.md` — daily ops, rollback, restore drill, common-issue catalog.

**Local Docker stack verified end-to-end:**
- `docker compose up -d` → 3 containers healthy
- POST /api/auth/register → JWT + row persisted in postgres
- GET / → SPA index.html (Express serves client static)
- GET /health + /metrics?token=... → JSON dashboards work
- JWT_SECRET validator caught a too-short secret on first run (working as designed)

**Awaits user action to go live:** domain ($10/yr), VPS ($4.50/mo Hetzner), DNS A record, tag `v0.1.0`, run DEPLOY.md.

---

### Session pass — 2026-05-25 (shipped all 10 next-session items)
- **A. Quest markers on World Map** — `WorldMap.tsx` draws pulsing 🔴 dots at every kill-quest spawn coord, dashed pink line player→nearest objective, legend toggle chip.
- **B. Treasure chests in caves** — `ChestSchema` + `chests: MapSchema`, `ChestService.ts` (race-safe open, 5-min respawn, theme loot tables), 2 chests per cave spawned on `onCreate`, `openChest` message, `ChestModel.tsx` procedural mesh (wood + iron banding + lock + animated lid + sparkle when open + theme-colored gem glow).
- **C. Recall stone item** — `recall: true` flag on ITEMS, server `Inventory.handleUseItem` warps to village + 60s cooldown via `lastAttack` map, buy from Merchant Mira (500z).
- **D. Mount on minimap + worldmap** — `p.mounted && p.petKind` renders 🐔/🐷/🐮 emoji instead of dot in both views.
- **E. Boss respawn countdown UI** — `BossEventScheduler.nextSpawnIn()`, server broadcasts `bossTimer` every 5s while idle, `BossBar.tsx` shows "⚜ Dark Lord respawns in M:SS" with 1s local tick-down between server broadcasts.
- **F. Cave-cleared achievements + warp stone** — 6 per-cave + 1 meta `cave_master` achievements, detection in `Combat.dealDamageToMonster` via `caveAt()`, meta counter `caves_cleared` bumps recursively on each cave clear, `warp_stone` item.
- **G. /metrics dashboard** — inline-HTML page in `server/index.ts` polling `/health` every 2s, token-gated via `ADMIN_TOKEN` env var, bars for uptime/players/rooms/memory + per-room tick avg/p50/p95/max.
- **H. Pulsing cave label** — `CaveLabel` sprite scale + opacity sin pulse at 2Hz via `useFrame`.
- **I. Boss spawn server-wide toast** — `bossSpawn` broadcast, `BossSpawnToast.tsx` slide-down banner with "📍 View on Map" button (sets waypoint + opens M).
- **J. Friend → cave nav** — `Friend.registerHandlers` enriched with `getLocation` callback, `friend:list` entries include `cave/x/z`, `FriendList.tsx` shows "🕳 cave name · [📍 ไป]" for friends inside a cave.
- All packages typecheck clean. Client vite build green. Shared tests 19/19 pass. Server tests 156 pass (7 pre-existing recovery.test.ts DB-file failures, unrelated to this pass).

### 🎯 Next-session ideas (proposed 2026-05-25, not started)

Compiled at end of session 2026-05-25 after world map + 6 caves shipped.
Each item has: why · files to touch · approach · acceptance test.
Pick **A+B** first — that's the recommended next push.

---

#### A. Quest markers on World Map  · ~1-2h · 🔥 high

**Why:** Players have to wander to find quest mobs. Map already shows
caves; objective dots make navigation obvious.

**Files:**
- `packages/client/src/ui/WorldMap.tsx` (extend the draw loop)
- `packages/client/src/hooks/useQuests.ts` (already returns active quests)
- read `MAPS.field.spawns` (`packages/shared/src/maps.ts`) for kill-quest
  monster coords

**Approach:**
1. After drawing caves, loop over `quests.active`. For each active
   `q.objective`:
   - `kind === "kill"`: find all `MAPS.field.spawns.filter(s => s.kind === q.objective.monster)`. Draw a 🔴 dot at each. If the monster is in a cave, the cave is already visible — dot just inside.
   - `kind === "collect"`: drop a single dot at the cave / area the item is known to come from (use MONSTER_DROPS reverse lookup or just skip).
2. Show a thin connecting line from player → nearest objective dot, dashed pink (reuse waypoint dashed-line style).
3. Add legend chip top-right: "🔴 เควสต์" toggle.

**Acceptance:** Open M with "kill 5 slime" active → see ≥3 red dots on
the map matching slime spawn coords; close M → minimap unaffected.

---

#### B. Treasure chests in caves  · ~2h · 🔥 high

**Why:** Caves currently reward mob farming only. Chests give a tangible
loot loop + a reason to push to the back of each cave.

**Files:**
- `packages/shared/src/schema.ts` — add `ChestSchema` (id, x, z, theme, opened, respawnAt)
- `packages/shared/src/items.ts` — define cave loot tables per theme
  (shadow → dark_crystal + zeny; frost → ice_shard + hp_potion; etc.)
- `packages/server/src/services/` — new `ChestService.ts` (open + race-safe
  via lastAttack-style timestamp, schedule respawn)
- `packages/server/src/rooms/WorldRoom.ts` — onCreate spawns 2 chests per
  cave (use `CAVES` coords from shared/biomes), `onMessage("openChest")`,
  tick scheduler for respawn
- `packages/client/src/scene/ChestModel.tsx` — new procedural mesh (wood
  box + iron banding + lock; opened = lid rotated, glow)
- wire into `Scene.tsx` like CompanionModel (subscribe to `state.chests`)

**Approach:**
1. ChestSchema: `id`, `x`, `z`, `theme: CaveTheme`, `openedBy: string`,
   `respawnAt: number` (0 = available).
2. Server: place 2 chests per cave at random offsets inside `r * 0.5`.
   On `openChest({chestId})`: if not opened, mark openedBy = player.id,
   set respawnAt = now + 5min, grant theme loot to player (use existing
   `addToInventoryOrMail`), broadcast `chestOpened` for visual.
3. Tick (every 1s): reset chests where now >= respawnAt.
4. Client: chest mesh — closed (gold/wood) or opened (lid up, sparkle).
   Click to send `openChest`.

**Acceptance:** Walk into shadow_cave → see 2 closed chest meshes →
click → loot popup appears, chest mesh opens → after 5min refresh, chest
re-renders closed.

---

#### C. Recall stone item  · ~30m · medium

**Why:** `/home` chat command works but is buried. A clickable consumable
matches MMO convention and surfaces the feature.

**Files:**
- `packages/shared/src/items.ts` — add `recall_stone` consumable
- `packages/server/src/services/Inventory.ts` — handle useItem for recall:
  set p.pos.x/z near village (reuse `randomHomeCoord` from ChatCommands)
  + apply 60s cooldown via `lastAttack` map
- `packages/server/src/rooms/WorldRoom.ts` — already routes useItem

**Approach:**
1. ITEMS.recall_stone: { icon: "🪨", name: "หินอัญเชิญหมู่บ้าน",
   stack: 5, consumable: true, recall: true }.
2. Inventory.handleUseItem: when `def.recall === true`, check cooldown,
   warp, remove 1 stack.
3. Buy from Merchant Mira (500z) — add to her shop array.
4. Quest reward for "first cave cleared" → 3 free recall stones.

**Acceptance:** Buy from Mira → walk to wilderness cave → use stone →
warp back to village within 1s.

---

#### D. Mount visible on map  · ~15m · low

**Why:** Friends see your dot but can't tell you're mounted. Tiny polish.

**Files:**
- `packages/client/src/ui/Minimap.tsx` (the player loop)
- `packages/client/src/ui/WorldMap.tsx` (same)

**Approach:** In the player draw loop, check `p.mounted && p.petKind`.
If true, render the kind's emoji (🐔 / 🐷 / 🐮) at the dot position
instead of the circle.

**Acceptance:** Mount a chicken → minimap shows 🐔 instead of green dot.

---

#### E. Boss respawn UI  · half-day · medium

**Why:** `BossEventScheduler` runs every 600s but players don't know
when. Cooldown UI lets parties coordinate.

**Files:**
- `packages/server/src/services/BossEvent.ts` — add `nextSpawnIn()` getter
- `packages/server/src/rooms/WorldRoom.ts` — broadcast `bossTimer` every
  5s while waiting
- `packages/client/src/ui/BossBar.tsx` — already shows active boss HP;
  extend to show countdown when no boss alive

**Approach:**
1. BossEventScheduler.nextSpawnIn(): returns max(0, BOSS_INTERVAL_S - acc)
2. WorldRoom tick (every 5s): `broadcast("bossTimer", { secondsLeft })`
   when scheduler.isActive() is false
3. BossBar listens, shows "⚜ Dark Lord respawns in 4:23"

**Acceptance:** Kill Dark Lord → wait 10s → bar shows "respawn in 9:50"
counting down. When 0 → spawn → bar switches to HP display.

---

#### F. Cave-cleared achievements + key item  · half-day · medium

**Why:** Caves have bosses but no long-term goal. Chain into a meta
achievement that unlocks a unique reward (e.g. teleport-anywhere stone).

**Files:**
- `packages/shared/src/achievements.ts` — add 6 per-cave achievements +
  1 "all caves cleared" meta
- `packages/server/src/services/Achievements.ts` — detection on monster
  death: if monster is a cave boss + inside that cave radius → unlock
- `packages/server/src/rooms/WorldRoom.ts` — on monster kill, check
  `caveAt(m.pos.x, m.pos.z)` and pass to Achievements

**Approach:**
1. ACHIEVEMENTS push: "cave_shadow_clear" through "cave_wilderness_clear"
   (1pt each, 200z + cave-themed item), "cave_master" (all 6, gives
   `warp_stone` key item that pins waypoint anywhere on map).
2. Boss kinds per cave (from CAVES theme):
   shadow: darklord (wilderness cave's mini), frost: snowman_giant,
   desert: scorpion_lord, swamp: bog_witch, forest: orc (need a forest
   boss or count by orc-count threshold), wilderness: darklord.
3. On kill: if monster.kind matches the cave's boss + caveAt() matches,
   bump cave's achievement counter.

**Acceptance:** Kill scorpion_lord in desert cave → achievement toast
"🏆 ถ้ำทะเลทราย conquered" + reward delivered. Clear all 6 → meta
unlocks + special item in inventory.

---

#### G. Server `/metrics` dashboard  · half-day · low

**Why:** `/health` returns JSON; humans want a page. No external deploy
yet but useful for solo dev.

**Files:**
- `packages/server/src/index.ts` — new GET `/metrics`

**Approach:** Inline HTML string with a `<script>` polling `/health`
every 2s and rendering tick p50/p95/p99 + player count + memory as
simple bars. No framework. Auth-gate behind `?token=` env-configured
admin token to avoid public exposure.

**Acceptance:** Visit `/metrics?token=ADMIN_TOKEN` → live page with bars.

---

#### H. Pulsing cave label  · ~15m · polish

**Files:** `packages/client/src/scene/CaveZones.tsx` (CaveLabel function)

**Approach:** Wrap sprite in `useFrame` → set `sprite.scale.x/y` via
`base + Math.sin(clock.getElapsedTime() * 2) * 0.1`. Add per-frame
opacity pulse 0.8-1.0.

**Acceptance:** Label visibly pulses at ~2Hz from across the village.

---

#### I. Boss spawn toast (server-wide)  · ~30m · polish

**Files:**
- `packages/server/src/rooms/WorldRoom.ts` (boss spawn path already has
  broadcast — already done partially)

**Approach:** The current broadcast goes to "system" channel which lands
in EventFeed. Promote Dark Lord spawn to a centered slide-down toast
(reuse `LevelUpCelebration` styling). Add a new message type `bossSpawn`
with `{ name, x, z }` and a client component showing it for 6s with
"📍 View on Map" button.

**Acceptance:** Boss spawn → all online players see a top-of-screen
toast for 6s, click "View on Map" opens M centered on the cave.

---

#### J. Friend → cave nav  · ~30m · polish

**Files:**
- `packages/server/src/services/Friend.ts` (already returns
  `{name, online}`; extend to include `currentCave` if any)
- `packages/client/src/ui/FriendList.tsx` (show cave name + "Join" button)

**Approach:**
1. Friend service: on each list build, lookup the friend's player record
   and call `caveAt(p.pos.x, p.pos.z)` → include caveId (or null).
2. Client renders "🕳 ถ้ำเงา" badge next to online friend's name.
   Button "📍 ไป" sets waypoint to that cave's coords.

**Acceptance:** Friend walks into shadow cave → your FriendList shows
"Bob · 🕳 ถ้ำเงา · [📍 ไป]" → click → minimap pulses pin at (-80,-60).

---

#### Genuinely huge (days, not next session)

- **Multi-map seamless streaming** — chunk-based mesh streaming instead
  of discrete `field` / `dungeon_*` maps. Probably means replacing
  `state.mapId` with a single field-only design (all dungeons → caves
  on field, which is half-done already).
- **Replay highlights** — record key snapshots (kill streak ≥ 5, boss
  kill) into prisma `ReplayHighlight` rows with serialized state diffs.
  Playback panel renders from snapshot back-to-back.
- **Guild war / GvG** — opt-in match between 2 guilds, dedicated room,
  scoreboard. Probably needs a separate `arena` room type.

### Visual + close-out pass — 2026-05-24 (commits 871c644 → b613148)
- **NPCs all looked identical** — built `npcAppearance(id)` (hash → distinct skin/hair/body) + `NpcRoleProps` (carpenter hammer+apron, blacksmith anvil, scholar scroll+glasses, merchant scale, tutor glowing wand, waypoint orb staff, guard shield+spear).
- **Boss / Orc**: dedicated `DarklordModel` (horns, glowing eyes, cape, sword, aura) + `OrcModel` (green brute with club). Wired 6 pre-existing but unimported boss models (Bog Witch, Ice Wraith, Sand Worm, Scorpion Lord, Snowman Giant, Swamp Serpent).
- **Per-job player props** (`PlayerJobProps.tsx`) — swordsman shield, mage staff orb, archer bow+quiver, acolyte halo+mace, thief daggers + T2 variants (Knight cape, Wizard floating tomes, Sniper longbow, Priest wings, Assassin hood).
- **NPC click crash fixed** — `npc.shop!.map(...)` ran for all NPCs in default "buy" tab. Now smart-tab + guarded.
- **Sword cursor** on monster hover (inline SVG data URI).
- **Companion system wired end-to-end** — `summon_companion` / `recall_companion` server handlers, `tickCompanions(dt)` follow AI, CompanionModel rendered next to owner.
- **Quest chain UI** — "→ เควสต่อไป: {next}" hint in NpcDialog quest tab + QuestLog.
- **CLAUDE.md sync** — "What hasn't been built" rewritten (everything once listed there is built).
- **CI fixed twice**: removed pnpm `version: 10` (conflicted with packageManager field); added DATABASE_URL + JWT_SECRET + prisma generate/push to test step.

### Responsive pass — 2026-05-24 (commit `df67bc4`)
- **Single-active-modal guarantee**: `useExclusiveModal(id, open, setOpen)` hook + `PanelId` union in store. Wired into 13 modals (Inventory, Crafting, Stats-coverage via toggleInventory, AuctionHouse, GuildPanel, FriendList, Mailbox, PetBox, AchievementsPanel, Leaderboard, SkillTreeUI, MarriageUI, OnlinePlayers). Opening any modal auto-closes the previous one via window CustomEvent — no two modals can overlap visually.
- **Safe-zone CSS var system** in index.css: `--hud-top`, `--hud-side`, `--bottom-safe`, `--side-panel-top`. Media queries: phone (max-width:768px or max-height:540px) bumps bottom-safe to 9rem to clear joystick + action buttons; landscape (max-height:500px) shrinks. `@supports (padding: max(0px))` adds iOS safe-area-inset.
- **Reusable zone utilities**: `.zone-top-left`, `.zone-top-right`, `.zone-bottom-left`, `.zone-bottom-right`, `.zone-side-panel`, `.modal-overlay`.
- **Dialog safe-area override**: attribute selector `[role="dialog"][aria-modal="true"].absolute` injects `padding-bottom: var(--bottom-safe)` and `padding-top: var(--hud-top)` so existing modals stay clear of bottom bar/joystick without per-component refactor.
- **OnlinePlayers position fix**: `top-16 right-4` (which overlapped the minimap on small screens) → `.zone-side-panel` (anchors below HUD on every breakpoint).
- **Verified via DOM probe**: media queries (768/540/500), safe-area support, zone utilities, dialog override — all loaded correctly on production CSS.

### Improvement pass 2 — 2026-05-24 (commit `bc12ff7`)
- **100-bot stress test** in one room: p50/p95/p99 = **27/132/221 ms** (still PASS, 2× target). Recorded in SERVER_SIZING_50_PLAYERS.md.
- **Extracted services**: `ChatCommands` (parser + router, +9 tests) + `BossEvent` (scheduler, +4 tests). WorldRoom shrinks again.
- **New UI: `OnlinePlayers` panel** — draggable live list of players in room, quick-action whisper + party invite. Wired to MenuBar 🟢 + locale keys.
- **Death recap** — server sends `"death"` event with killer name; `DeathOverlay` shows "Killed by X" line.
- **Silence fishing warning** — early no-op handler in Game.tsx prevents lazy-mount spam.

### Improvement pass 1 — 2026-05-24 (commit `093a3d9`)
- **Cleanup**: removed stale `LoadTestHarness.ts` (raw-WS, didn't pass matchmaking) + tests. Removed Storybook scaffold (was not installed). Fixed AntiCheat TODO comment.
- **Load test infra**: `tools/seed-load-bots.ts` upserts N users+characters+JWT tokens to `.load-bots.json`. `harness-runner.ts` reads them and joins as real players. **Measured: 50 bots p50/p95/p99 = 10/49/64 ms** (target was p95 < 200ms ✅). Recorded in `docs/SERVER_SIZING_50_PLAYERS.md`.
- **Observability**: `/health` now exposes per-room tick stats (avg/p50/p95/max) + process memory. `getTickStats()` reports percentiles instead of just avg/max.
- **Whisper offline fallback**: when target is offline, whisper auto-queues to Mailbox so the message isn't lost. Player gets toast `"📬 X ออฟไลน์ — ส่งเป็นจดหมายแทน"`.
- **Perf**: bot aggro loop now uses `monsterSpatialHash.findNearest()` — O(cells) instead of O(M) scan per bot per tick.
- **Docs**: `docs/LOAD_TESTING.md` flow + `docs/SERVER_SIZING_50_PLAYERS.md` baseline numbers.

Run `git log --oneline -20` for the full local view.

---

## 🎯 Recommended next session

Pick one of these starting points (ranked by impact):

1. **P0.A — Behavioral tests for GameRoom** (unlocks Combat/Inventory/Trade refactor).
   Start with a minimal in-memory harness + 1 handler covered, then extend.
2. **P0.B — CI / GitHub Actions** (cheap, high value: catches regressions on every PR).
3. **P0.D — Anti-cheat movement bounds** (server-side teleport detection).
4. **P1.1 continued — extract Quest service** (medium coupling, doable without P0.A
   if scoped to track/turnin/chain — reward delivery stays in GameRoom for now).
5. **P3.20 — Lv30+ endgame loop** (game-side, not refactor; user-visible content).

Each is ~1 PR sized. Update this BACKLOG.md (move the item to Done section,
adjust counts in Snapshot) when complete.

---

## 🧠 Decisions & gotchas (so a fresh session doesn't re-litigate)

- **Colyseus 0.16, not 0.17** — Schema 3.x + ws-transport 0.16.5. Don't upgrade
  unless you also upgrade @colyseus/redis-presence / redis-driver to matching majors.
- **`(prisma as any).guild` / `.auctionListing`** — these models work at runtime
  but the generated Prisma client doesn't always know about them (build-time
  generation flake on Windows when DLL is locked). The `as any` cast is intentional.
- **JWT default secret falls back in dev** — production refuses to start without
  a real `JWT_SECRET`. Dev fallback is loud + clearly labeled insecure.
- **DPR cap `[1, 1.5]`** on Canvas — set in Game.tsx. Don't raise without testing
  on weak devices; user spots stutter immediately.
- **No `setState` inside `useFrame`** — was a stutter source before. DayNight.tsx
  used to do this; fixed in `246eda4`.
- **Procedural everything** — user does not want external asset downloads.
  Asset loader infra ships, but registering anything is the user's call.
- **localStorage "remember me" stores PLAINTEXT password** — flagged in audit.
  Not "fixed" because it's the documented UX trade-off; document risk in UI.
- **CRLF warnings in `git commit`** — Windows line-ending conversion. Benign.
- **Bots count is env-gated (`DEV_BOTS`)** — don't enable in prod.
