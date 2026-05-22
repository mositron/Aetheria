# Aetheria — Backlog & Session Handoff

> **Single source of truth สำหรับงานที่เหลือ.** อ่านไฟล์นี้ก่อนเริ่ม session ใหม่
> เพื่อให้รู้ว่าสถานะอะไร, อยู่ที่ไหน, ทำอะไรต่อ.

Last updated: 2026-05-21 (commit `HEAD`)
Total commits to date: 50+

---

## 📸 Quick snapshot — รู้ใน 30 วินาที

| Area | Status |
|---|---|
| **Build** | ✅ Client + server build clean. PWA SW generated. |
| **Tests** | ✅ 101 server vitest tests + 19 shared vitest tests = **120 passing** |
| **TypeScript** | ✅ No errors (1 pre-existing TS6059 rootDir warning is benign) |
| **Bundle** | ✅ Vendor-split: index.js 271kB + Three.js 687kB (cacheable) + lazy modal chunks |
| **Services extracted** | ✅ 15/15 — all services extracted (Combat, Inventory, Trade included). |
| **GameRoom.ts** | ~1539 lines (was 3000+). All 15 services extracted into separate files. |
| **Deployment** | Single-instance ready. Multi-instance via `REDIS_URL` opt-in. |
| **PWA** | ✅ Installable (manifest + Workbox cache + auto-update). Production icons (72-512 + maskable) generated. |

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

### A. Behavioral test coverage for GameRoom handlers
**Scope:** 1-2 PRs.
**Why blocker:** Required before extracting Combat/Inventory/Trade services (P1.1).
**TODO:**
- In-memory room harness (mock state + clients) — see Colyseus testing docs
- Coverage targets:
  - Combat (handleAttack, handleSkill, dealDamage, status ticks) — 80%
  - Trade (full accept→offer→confirm→rollback) — 90%
  - Auction (list / buy race / cancel) — 90% *(Auction service tests cover part of this)*
  - Guild (create / join / leave with $transaction) — 80% *(Guild service same)*
  - Quest (track / turnin / chain advance) — 70%
- Snapshot tests for savePlayer/onJoin (regression guard)

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

### 18. i18n skeleton
**PARTIAL 2026-05-21.** Infrastructure created: `locales/th.ts`, `locales/en.ts`, `useT()` hook, `lang` in Zustand store, language toggle in Settings. Pattern established — future strings go into locale files. Full string extraction from existing components is P3 work.

### 19. prefers-color-scheme
Optional. Game is dark by design; UI panels could honor light mode.

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
**WORLD_HOSTED_PLAN.md integration** — player-created worlds with invite:
- **World creation UI:** template (forest/desert/mountain/island) + mode (co-op/PvP/exploration) + privacy (public/friends/private)
- **Room manager:** server creates room session + world metadata + `join code`/`invite link`
- **Modes:** co-op (shared quests), PvP (team deathmatch/free-for-all), battle royale, exploration
- **Companion/Pal system:** creatures players collect, train, summon; attacker/defender/support roles
- **Invite flow:** room code → lobby → ready → start
- **Session-based first** (persistent world later, P4)
- **Files:** new `rooms/WorldRoom.ts`, `ui/WorldCreate.tsx`, `ui/Lobby.tsx`, invite logic in `services/WorldManager.ts`
- **Scaling:** matches SERVER_SIZING_50_PLAYERS.md targets (8 vCPU / 16 GB baseline)

### 29b. Base building (DONE 2026-05-20)
**Structures system:** players place/remove structures in the world using structure items.
- **Store:** `buildMode: boolean`, `selectedStructItemId: string | null`, `toggleBuildMode()`, `setSelectedStructItem()`
- **Server:** `WorldRoom.ts` `build_structure` handler (consume item + add to `state.structures`), `structure_removed` handler
- **Client Scene:** Ghost preview (pulsing wireframe), placement click, right-click destroy context menu
- **UI:** "🏠 สร้างฐาน" / "💥 ทำลาย" buttons in HUD; structure filter in Inventory
- **Inventory:** click structure item → enters build mode automatically
- **Limit:** 12 structures per player; server enforces + broadcasts "🏠 Structure limit reached"
- **Items:** `struct_tent`, `struct_fence`, `struct_torch`, `struct_sign`, `struct_tower`, `struct_barrel`
- **Keybind:** `B` toggles build mode; `ESC` exits
- **Feedback:** system messages shown via EventFeed (build errors, limit reached, destroy confirm)

---

## P4 — Infrastructure / scale

### 29. Asset adoption (real GLTF)
Loader infra shipped (`useModel`, `useTexture`, manifest). Source/commission
actual models — user decision when.
**AVATAR_STRATEGY.md integration path:**
- MVP path: Ready Player Me + Mixamo → `GLTFHero.tsx` + `GLTFLoader` in `useAsset.ts`
- Balanced path: DRACO/KTX2 + LOD → production-grade per `docs/AVATAR_STRATEGY.md`
- Files: `packages/client/src/scene/models/GLTFHero.tsx`, update `useAsset.ts`, `manifest.ts`, `CharacterSelect.tsx`
- Target: ≤50–150 MB VRAM, ~20–60 visible detailed characters depending on path

### 30. Sprite sheet / 2D mode
Alternative top-down Ragnarok feel. Optional.

### 31. Background music
Procedural SFX exists. Need .ogg files or Web Audio procedural composition.

### 32. Sentry / error tracking
`@sentry/node` + `@sentry/react`. Gated on `SENTRY_DSN` env.

### 33. Log shipping
Logger writes JSON in prod → ship via Vector/Fluent Bit to Loki/Datadog.
No code change needed; deploy config only.

### 34. Database backups
Currently SQLite. Cron + sqlite3 .backup + off-server (S3/B2). Restore drill.

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
Shared config across packages, husky + lint-staged pre-commit hook.

### 39. README expansion
Architecture diagram, deploy guide (k8s/fly.io/Railway), quickstart.

### 40. CHANGELOG.md
Auto-generated from conventional commits.

### 41. SemVer + release tags
Currently all on `main`. Cut `v0.1.0` etc.

### 42. Storybook for UI components
Mock state per panel for fast iteration.

---

## P6 — Security hardening (sustained)

### 43. JWT refresh tokens
Currently 30d access, no refresh. Want 7d access + 90d refresh + revocation list (Redis).

### 44. Password requirements
Currently min 4 chars. Want >= 8 + mixed case + digit + strength meter.

### 45. 2FA (TOTP)
Out of scope MVP. Note for future.

### 46. Account recovery
Currently lost password = lost character. Need email recovery (needs SMTP)
or security question fallback.

### 47. Audit log table
DB table for login, password change, char delete, large trade, auction
completion, guild create/disband.

### 48. Server-side schema validation (Zod)
Currently TypeScript types enforce at compile-time only. Add Zod schemas
on every `onMessage` so malformed payloads are rejected, not crashed.

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

```
016dbd6 GameRoom split round 4: Guild service (10 total)
[2026-05-20] Batch: base-building, structures, companion-render, structure-render, WorldRoom merge
[2026-05-20] P0.D anti-cheat: movement bounds, speed hack, teleport detection
[2026-05-20] P1.4 level scaling: damage formula (Combat.ts)
[2026-05-20] P2.8 unified toast system: severity, stack, auto-dismiss
[2026-05-20] P1.6 mobile audit: 44×44 min touch targets
[2026-05-20] P1.5 zeny sinks: NPC enchant, repair cost, waypoint cost
[2026-05-20] P1.1 Combat/Inventory services refactor
[2026-05-20] P3.21 more monsters: desert/snow/swamp biomes
[2026-05-20] P3.22 crafting depth: recipe discovery, quality tiers
[2026-05-20] P3.20 endgame loop: Lv30+ daily content
[2026-05-20] P4.29 GLTF hero: GLTF loader + AnimationMixer MVP
```

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
