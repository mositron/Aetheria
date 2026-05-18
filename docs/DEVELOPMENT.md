# Development guide

## Setup

```bash
# Node 22+ recommended (tested on 24)
pnpm install
pnpm db:push           # creates packages/server/prisma/dev.db
pnpm dev               # runs server + client in parallel
```

Server: http://localhost:2567
Client: http://localhost:5173

## Common tasks

### Run server only
```bash
pnpm dev:server
```

### Run client only
```bash
pnpm dev:client
```

### Run smoketest (CI-style backend check)
```bash
cd packages/client && node smoketest.mjs
```

It registers a temp account, joins the field room, walks for 1s, picks the nearest monster, sends a chat, and verifies all checks. Exits 0 on success.

### Reset DB
```bash
rm packages/server/prisma/dev.db packages/server/prisma/dev.db-journal
pnpm db:push
```

### Open Prisma studio
```bash
pnpm --filter @game/server db:studio
```

## Build (for production-ish)

```bash
pnpm build
```

Not commonly used since this is local-only.

## Adding content

### New monster
1. `shared/src/constants.ts` → add to `MONSTERS` (hp/atk/exp/speed/aggroRange)
2. `shared/src/items.ts` → add drops to `MONSTER_DROPS`
3. `shared/src/maps.ts` → add spawn point
4. `client/src/scene/Scene.tsx` → MonsterView switch — pick existing model (SlimeModel/WolfModel/HeroModel) or create new one
5. Restart server

### New item
1. `shared/src/items.ts` → add to `ITEMS` (slot, stats, icon, color, stack)
2. Optionally add to `MONSTER_DROPS` or `NPCS[].shop`
3. For consumables, server handleUseItem already supports `hpRestore`; add new effect type if needed

### New job
1. `shared/src/jobs.ts` → add to `JOBS` (hpPerLevel/atkPerLevel/baseMaxMp/mpPerLevel/skills[])
2. `shared/src/messages.ts` → extend `ChangeJobMsg.job` union
3. `server/rooms/GameRoom.ts` → `handleChangeJob` already accepts via JOBS lookup
4. `client/src/ui/JobPicker.tsx` → add a JobBtn

### New skill
- Just add to a job's `skills` array in jobs.ts. Server skill handler is generic.
- Optional: add visual in `client/src/scene/SkillEffects.tsx` SKILL_KIND_MAP

### New quest
1. `shared/src/quests.ts` → add to `QUESTS` (giver/turnIn/objective/reward)
2. `QUESTS_BY_GIVER` rebuilds automatically
3. UI in NpcDialog finds quests via that map

### New NPC
1. `shared/src/npcs.ts` → add to `NPCS` (id/name/kind/mapId/x/z/color/icon/dialog/shop?)
2. Scene.tsx auto-renders all NPCs in current map
3. NpcDialog auto-shows shop/quest tabs based on `kind` and quest mapping

### New map
1. `shared/src/maps.ts` → add to `MAPS` with size/groundColor/spawns/portals
2. `server/src/index.ts` already loops `Object.keys(MAPS)` and creates rooms — restart and it just works
3. `client/src/scene/Environment.tsx` → if dungeon-like, add palette entry to `PALETTES`
4. Add portal entries in both directions

### New status effect
1. `shared/src/status.ts` → add to `STATUS_DEFS`
2. Server `tickStatuses()` handles tickDmg / preventAction / speedMult automatically
3. `client/src/ui/StatusBadges.tsx` will auto-render

## Conventions

- **TypeScript** strict mode in `tsconfig.base.json`. `experimentalDecorators: true` required for Colyseus schema in shared/server
- **Per-package tsconfig** must repeat `experimentalDecorators: true` (esbuild doesn't traverse extends across packages reliably)
- **ES modules** everywhere (`"type": "module"`), imports use `.js` extension even for `.ts` source (NodeNext-style)
- **Shared package** is consumed as source (no build step), thanks to `"main": "./src/index.ts"`
- **No client-side prediction** — server is authoritative. Client smooths via `lerp`.
- **MapSchema in v3.x** — listen with `getStateCallbacks(room).onAdd/onRemove`, NOT `state.players.onAdd` directly
- **All visuals in useFrame** — never setState inside useFrame (it's what caused the stutter)
- **Use React.memo on entity views** — they should never re-render from props; useFrame handles all updates

## Gotchas

- **Colyseus 0.16 onAuth** must be `static` — instance methods are ignored
- **pnpm 10** blocks build scripts by default; allowlist in root `package.json` `pnpm.onlyBuiltDependencies` (prisma, esbuild, msgpackr-extract)
- **Vite proxy** sends `/auth/*` to server but WebSocket connects directly to `ws://localhost:2567`
- **localStorage keys** in use:
  - `token`, `username` (login persistence)
  - `panel-pos-{id}` for each draggable window
  - `sfxVolume`
- **Schema field name conflict** — Prisma uses `intel` for INT (because `int` is reserved in some drivers). Server maps `c.intel ↔ p.int`
- **Browser cursor not resetting** — `Scene.tsx` returns a cleanup that restores cursor; if you add new hover handlers be sure to reset on out
- **Stale character data** if you change Prisma schema and forget `pnpm db:push` — re-run it after schema changes

## Performance tips (learned the hard way)

- **NEVER** setState inside useFrame — even just for "force re-render every X ms" — that creates a new render tree at 60fps. Use refs + mutate Three.js objects directly.
- **Pre-allocate `THREE.Vector3` / `Color` instances** in refs and reuse via `.set()` — avoids GC pressure.
- **Cast shadows are expensive** — restrict to important meshes only (torso, body). Leave limbs/small props off.
- **Lower DPR cap** for retina displays: `dpr={[1, 1.5]}` instead of default `[1, 2]`.
- **Toggle `visible` instead of mount/unmount** when something flips frequently (e.g. day/night Stars).
- **Batch DOM updates** — UI panels poll at 250–500ms is plenty. Don't poll at 100ms.
- **canvas-based panels** (like minimap) don't need 60fps. 5fps is fine.

## Testing checklist (manual)

After a substantive change:
1. `pnpm dev:server` — check banner prints + no `❌` warnings
2. `cd packages/client && node smoketest.mjs` — should print `[done] all smoke checks passed`
3. Open browser, login, check console for TypeErrors
4. Walk, attack, level up, change job, use skill, open inventory, equip, sell, accept quest, kill mob, turn in, use portal, fight boss
5. Open 2nd browser tab incognito, register another, party invite, share EXP

## File touch frequency

These files change most often:
- `shared/src/jobs.ts` — adding skills
- `shared/src/items.ts` — items + drops
- `shared/src/quests.ts` + `npcs.ts` — content
- `client/src/scene/Scene.tsx` — input loop + render switches
- `server/src/rooms/GameRoom.ts` — all server logic
