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

## Production deployment

**Aetheria is Docker-prod-ready** as of 2026-05-25. The full stack runs locally
via `docker compose up -d` (postgres + redis + server, all healthchecked) and a
production VPS deploy is documented end-to-end.

Key infra files (read before changing any of them):
- `Dockerfile` — multi-stage, non-root, prisma migrate-deploy entrypoint. Alpine + `linux-musl-openssl-3.0.x` Prisma binaryTarget.
- `docker-compose.yml` — **local** prod-like stack (1 server, internal postgres + redis, http on :2567).
- `docker-compose.prod.yml` — **VPS** stack (Caddy 80/443 reverse proxy + auto-TLS + HTTP/3 → server :2567, image pulled from GHCR).
- `Caddyfile` — TLS termination, WebSocket upgrade, HSTS.
- `.github/workflows/docker-publish.yml` — tag `v*` push → multi-arch GHCR image.
- `scripts/deploy.sh` — SSH + zero-downtime restart of server container only.
- `scripts/backup-pg.sh` — daily pg_dump rotate-7 + optional rclone push.
- `docs/DEPLOY.md` — 90-minute first-time VPS walkthrough (Hetzner CX22 recommended).
- `docs/RUNBOOK.md` — daily ops, rollback, restore drill.

**Schema is postgres** (not sqlite). Migration baseline lives in `packages/server/prisma/migrations/`. For local dev without docker, you'd need to either run a postgres locally or temporarily switch `schema.prisma` provider back to sqlite — but the canonical path is `docker compose up -d postgres`.

**Vitest needs explicit dotenv loading** (it doesn't auto-load .env unlike Vite). `vitest.config.ts` walks both `packages/server/.env` and root `.env` — keep at least one of them in sync with the schema provider or Prisma will fail with "URL must start with postgresql://".

**Required prod env vars:** `JWT_SECRET` (≥32 chars random, blocked dev defaults), `DATABASE_URL`, `POSTGRES_PASSWORD`, `ADMIN_TOKEN`, `ALLOWED_ORIGINS`, `ENFORCE_HTTPS=true`. Optional: `SENTRY_DSN`, `CAPTCHA_SECRET` + `VITE_CAPTCHA_SITE_KEY`, `REDIS_URL`.

## What the user is like

- Excited about progress, wants forward momentum
- Asks for "everything" or "all of it" — but expects pragmatic chunks, not silently doing nothing for hours. Check in between milestones.
- Cares about polish (UI, animation, feel) as much as features
- Spots stutter immediately — performance matters
- Wants positions remembered, settings persisted, no re-login
- Doesn't want me to download external assets (it's local-only solo project)
- OK with procedural everything (3D models, sounds, textures all generated in code)

## What hasn't been built (yet)

Out-of-scope per CLAUDE.md / explicit MVP cut:
- 2FA (TOTP) — explicit non-goal
- WoE / Guild war (basic guild + chat exists; war system not built)
- Sprite/3D GLTF model asset loading — procedural-only per "no asset downloads"
- Multi-region / global horizontal scale (Redis presence is single-region multi-instance)

What's actually built and in-game (don't re-implement):
- Whisper / DM — `/w name msg` works, offline auto-queues to mailbox
- Friend list — `Friend.ts` service + `FriendList.tsx` UI
- Guild — create / join / leave / chat (no war)
- PvP toggle — `/pvp` command, opt-in
- Crafting from materials — `CraftingPanel` + benches (workbench/forge/enchanter/master_forge)
- Auction house — list / browse / buy / cancel, race-safe
- 2nd-class job advancement at Lv30 + skill trees per job + `PlayerJobProps` visuals
- 3rd-class tier (lord_knight/high_wizard/sniper_t2/high_priest/assassin_t2) at Lv50
- Pets (chickens/pigs/cows, breeding, rare golden variants) + mounts
- Achievements (13) with titles + leaderboard contribution
- Per-NPC visual variety (hash-derived appearance + role props) + dedicated boss models
- Single-active-modal UI + responsive safe-zones for all viewport sizes
- World map (`M`) with quest objective markers + dashed line to nearest, mount emoji, 6 themed caves
- Treasure chests in caves (2/cave, themed loot, 5min respawn, race-safe)
- Recall stone consumable (60s server cooldown + client greyscale countdown)
- Cave-clear achievement chain (6 + meta `cave_master` → `warp_stone`)
- Boss respawn countdown UI + server-wide boss spawn toast (Dark Lord + cave bosses)
- Pulsing cave labels + twin entrance torches (warm flicker)
- Friend list shows current cave + "📍 ไป" waypoint button
- Mailbox unread badge on menu-bar 📬 icon (real-time push)
- Item hotbar bound to keys 1-5 (shift+click consumable in Inventory to bind, right-click slot to clear, persists in localStorage)
- Inventory search bar (filters by item name or itemId substring)
- Damage number juice (CRIT! 2× scale, MISS uppercase shrunk, heal +leading)
- Pet auto-pickup loot within 3m (skips gathered resources)
- `/metrics` admin HTML dashboard (token-gated, polls /health every 2s)

Genuinely still open:
- Companion system — UI panel + locale exists but Player schema has no `companionKind`
  field and no server summon handler. Either wire end-to-end or remove the dead UI.
- Hotbar bind via mobile UI (right now needs keyboard shift+click — mobile users can press 1-5 if bound, but binding requires desktop).

If asked to build any of these, refer to `docs/DEVELOPMENT.md` for the add-content patterns.

## When in doubt

- Check git: `git log --oneline` (if initialized) or `git status` for unstaged changes
- Run smoketest first to baseline
- Don't make sweeping changes without restating intent
- Prefer narrow patches with verification over big rewrites
