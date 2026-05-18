# Build log

Chronological notes from the build sessions (all on 2026-05-17).

## Phase 0 — Scaffold
- pnpm monorepo (shared/server/client)
- Colyseus 0.16 + Express + Prisma + SQLite + JWT
- Vite + React + Three.js (via `@react-three/fiber`) + Zustand + Tailwind
- Auth (register/login), character row, JWT 7d → later bumped to 365d
- Hello-world 3D scene with capsule players + box monsters
- WASD movement synced server-authoritatively
- 2 maps (field/dungeon) as separate Colyseus rooms with portal
- Initial smoketest mjs script

### Fixes from this phase
- `@colyseus/schema` v3.x: decorators broke under tsx/esbuild → added explicit `experimentalDecorators` per package tsconfig
- Colyseus 0.16 `onAuth` must be `static` — refactored auth into onJoin
- pnpm 10 blocks build scripts → added `onlyBuiltDependencies` allowlist

## Phase 1 — Combat Depth (M1–M3)
- **M1 Floating damage numbers** — normal white / crit yellow / miss gray / heal green, fade + rise
- **M2 Stat system** — STR/AGI/VIT/INT/DEX/LUK + stat points + derived formulas in shared/stats.ts
- **M3 Hit/Miss/Crit + ASPD** — full combat roll machinery, AGI lowers attack cooldown
- Added StatPanel UI with + buttons + derived stat readout
- Schema: added 6 stat fields + statPoints + zeny to Player

## Phase 2 — Economy & Content (M4–M5)
- **M4 NPC + Shop + Zeny**
  - 3 NPCs (Mira merchant, Reni scholar, Guard) with positions + dialog + shops
  - Shop dialog with Buy/Sell tabs (sell ratio 0.5)
  - Zeny currency, starting 500z
- **M5 Quest system + log**
  - 3 starter quests (kill 5 slimes / kill 3 wolves / collect 5 jellies)
  - NPC Quests tab — Accept/Turn-in/Completed states
  - QuestLog floating panel top-right with progress bars
  - Per-player questsJson stored in DB

## Phase 3 — Status + Jobs + Content + Polish (M6–M10)
- **M6 Status effects** — poison/burn/stun/freeze/slow/regen with tick + preventAction + speedMult
- **M7 Expanded jobs** — Archer, Acolyte, Thief added (5 jobs total now, each with 2 skills)
- **M9 More content** — Orc (mid-tier), Dark Lord boss (HP 400, drops Blade of Dawn / Dragon Plate / Dark Crystal); added 2 new materials + 2 endgame gear pieces
- **M10 Polish**
  - Minimap (canvas, shows portals/NPCs/mobs/players with direction arrow)
  - CastBar (brief skill activation indicator)

## Procedural assets pass
- Replaced capsule players with **HeroModel** (head+torso+arms+legs blocky, walk anim, idle bob, attack lunge, death fall, casting orb)
- Replaced box monsters with **SlimeModel** (squashy ball + eyes + squash anim) and **WolfModel** (4 legs + snout + ears + tail + pounce anim)
- Orc = green-tinted Hero 1.2× scale; Dark Lord = purple Hero 2.2× with point light
- NPCs use Hero model with NPC color + bouncing ! sphere above
- Procedural ground texture (grass via canvas+noise) + 40 trees + rocks + bushes
- Fog for depth

## QoL & UX
- **Click-to-walk + click-to-pickup + click-to-attack** point-and-click style (Ragnarok-feel)
- **Cursor changes** on hover (crosshair for mob, grab for item, pointer for NPC)
- **Bot mode** (B key) — auto pickup + auto target + auto engage
- **Orbit camera** (right-click drag) + zoom (wheel)
- **WASD relative to camera yaw**
- **Auto-retry on connection failure** (kept login persisted, JWT 365d)
- **Quick-use potion** (H)

## M8 Party + extras
- **M8 Party system** — 4 max, invite by name, shared EXP within 30m, live member HP
- **Procedural SFX** via Web Audio API (no audio files): hit/crit/miss/heal/skill variants/levelup/pickup/death
- **Boss HP banner** appears when near Dark Lord (25m)
- **Low HP vignette** pulsing red when HP<30% or dead
- **Event feed** for level-ups and quest rewards (top-center, fade out)
- **Quick-use potion** + **tooltips** on hotbar
- **Settings panel** (O) — SFX volume slider, stored to localStorage
- **Day/night cycle** in Field (5min loop), stars + moon at night

## UI redesign passes
- **Pass 1**: gradient + bevel + drop shadows (got "wrong, too fancy" feedback)
- **Pass 2**: compact + flat + no rounded (got "too dull" feedback)
- **Pass 3**: MMO ornate brass frame with title bar + corner diamonds (got "too old-school" feedback)
- **Pass 4 (final)**: **modern glassmorphism** — backdrop blur + cyan/violet neon edge + small corner dots + clean title bar
- Layout shuffled — Minimap top-right, Menu (Controls) bottom-right
- Menu redesigned with 8-button action grid + collapsible Keybinds
- Stats button removed (folded into Menu)
- Party button added to Menu

## Window UX
- **Draggable windows** with localStorage position persistence (`useDraggable` hook)
- Title bars become drag handles
- Each panel has a unique localStorage key

## Performance rounds
- Round 1: removed setInterval-based re-render in Scene, moved to refs + useFrame, React.memo entity views
- Round 2: pre-allocate Vector3, lower shadowmap, dpr cap, reduce HUD setInterval frequency
- Round 3: trees 80→40 + no shadow on trees, Minimap RAF→200ms timer, BossBar/Vignette 200→400ms
- Round 4: **fixed DayNight setState-in-useFrame** (was creating new `<Stars>` tree every frame). Mount once + toggle visibility via refs.

## Balance pass
- Dark Lord nerfed: HP 1200→400, ATK 35→18, speed slower, aggro shorter, respawn 60s
- EXP curve switched from linear `50+lv×25` to quadratic `25+lv²×5` (easier early, steeper late)

## Casting feel pass
- Mage/Archer now stop at skill range instead of running into melee
- Auto-cast primary skill when MP allows (fallback to basic attack)
- Casting animation: arms held up + bigger orb + spinning ring at feet + pulsing light
- 0.7s duration (was 0.06s, basically invisible)
- Optimistic local trigger (event) so the player sees their cast immediately, before server roundtrip

## Death animation
- Monsters fade + scale + sink + tilt over 1.5s instead of instant-disappear

## Documentation pass (this commit)
- README + 6 docs files in `docs/`
- CLAUDE.md for future Claude sessions
