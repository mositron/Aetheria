# CLAUDE.md

Instructions and context for future Claude sessions working on this project.

## What this is

`game-v1` is a **web-based MMORPG (Ragnarok-inspired)** built solo with Claude Code. It runs entirely on `localhost` with multiplayer support (open multiple browsers/incognito).

Read `README.md` and the `docs/` folder before making changes. In particular:
- `docs/ARCHITECTURE.md` — file layout + data flow + critical perf decisions
- `docs/DEVELOPMENT.md` — gotchas + conventions + how to add content
- `docs/FEATURES.md` — what already exists (don't rebuild)
- **`BACKLOG.md` ← READ THIS FIRST** — current state, what's done, what's next,
  priorities (P0–P6), gotchas/decisions, recent commit log. Updated every session.

## Stack reminders

- TypeScript everywhere
- pnpm workspaces — never `npm` or `yarn`
- Colyseus 0.16 + schema 3.x — listeners use `getStateCallbacks(room).onAdd/onRemove`, NOT `state.players.onAdd`
- `experimentalDecorators: true` is required in every package's tsconfig that touches Colyseus schemas (esbuild won't traverse extends reliably)
- Colyseus 0.16 requires `static onAuth` — instance method is ignored
- Prisma 5.x — schema uses `intel` for INT (reserved word)
- pnpm 10 blocks build scripts → allowlist in root `package.json` `pnpm.onlyBuiltDependencies`

## Critical performance rules (learned from stutter incidents)

- **NEVER** setState inside `useFrame`. Use refs + mutate Three.js objects directly. (DayNight was doing this once and made the whole scene stutter; refactoring to refs fixed it.)
- React.memo entity components with `() => true` (Scene re-renders only on add/remove)
- Pre-allocate `Vector3` / `Color` in `useRef` and reuse via `.set()` to avoid GC
- Cast shadows only on important meshes (torsos / bodies). Limbs and trees: no.
- UI polling intervals: 250–500ms. Not 100ms.
- Canvas-based UI (minimap): 200ms timer. Not RAF.
- DPR cap: `dpr={[1, 1.5]}` for retina

## Don't recreate these — they exist

| Need | Where |
|---|---|
| Add a stat | shared/src/stats.ts |
| Add an item | shared/src/items.ts |
| Add a monster | constants.ts + items.ts (drops) + maps.ts (spawn) |
| Add an NPC | shared/src/npcs.ts |
| Add a quest | shared/src/quests.ts |
| Add a job | shared/src/jobs.ts + JobPicker.tsx |
| Add a skill | jobs.ts skill array (server handles generically) |
| Add a skill VFX | client/src/scene/SkillEffects.tsx SKILL_KIND_MAP |
| Add a status effect | shared/src/status.ts |
| Add a map | shared/src/maps.ts + server reads all keys |
| Procedural sound | client/src/sfx/sfx.ts (Web Audio synth) |
| New draggable window | useDraggable hook — see HUD.tsx pattern |

## UI theme

Modern glassmorphism with cyan (#22d3ee) + violet (#a855f7) accents on translucent slate. See `index.css`:
- `.panel` — base glass + corner dots + neon top edge
- `.panel-title` — drag handle (cursor: move)
- `.panel-corners` — `<div className="panel-corners" />` inside panel adds bottom corner dots (TODO: currently has top dots via ::before/::after)
- `.btn-3d` — gradient button (variants: indigo/rose/amber/emerald/slate)
- `.slot` — inventory cell with cyan hover glow

User has gone through 4 UI iterations — they want **clean modern game UI**, not retro brass, not flat dull, not glossy 3D buttons. Glassmorphism with neon accent is the agreed-upon style. Don't redesign without asking.

## Authentication

- JWT 365 days, stored in localStorage
- Token auto-loaded on app start, no re-login needed
- Auto-retry connection on network errors (don't logout)
- Logout only on explicit user action OR auth-specific error (invalid/missing token)

## Smoketest

After substantive changes, run:
```bash
cd packages/client && node smoketest.mjs
```

Expect `[done] all smoke checks passed`. If schema changes, also run `pnpm db:push`.

## What the user is like

- Excited about progress, wants forward momentum
- Asks for "everything" or "all of it" — but expects pragmatic chunks, not silently doing nothing for hours. Check in between milestones.
- Cares about polish (UI, animation, feel) as much as features
- Spots stutter immediately — performance matters
- Wants positions remembered, settings persisted, no re-login
- Doesn't want me to download external assets (it's local-only solo project)
- OK with procedural everything (3D models, sounds, textures all generated in code)

## What hasn't been built (yet)

- Whisper / DM
- Friend list
- Guild
- PvP toggle / WoE
- Crafting from materials
- Auction house
- More job tiers (2nd-class advancement)
- Pets / mounts
- Achievements
- Quest chains (next field exists in QuestDef but UI doesn't show)
- Sprite/3D model asset loading (loader infra not built; would need user to source files)

If asked to build any of these, refer to `docs/DEVELOPMENT.md` for the add-content patterns.

## When in doubt

- Check git: `git log --oneline` (if initialized) or `git status` for unstaged changes
- Run smoketest first to baseline
- Don't make sweeping changes without restating intent
- Prefer narrow patches with verification over big rewrites
