# Aetheria — Backlog & Session Handoff

> **Single source of truth สำหรับงานที่เหลือ.** อ่านไฟล์นี้ก่อนเริ่ม session ใหม่
> เพื่อให้รู้ว่าสถานะอะไร, อยู่ที่ไหน, ทำอะไรต่อ.

Last updated: 2026-05-24 (commit `947afdc`)
Total commits to date: 70+

---

## 📸 Quick snapshot — รู้ใน 30 วินาที

| Area | Status |
|---|---|
| **Build** | ✅ Client + server build clean. PWA SW generated. |
| **Tests** | ✅ 139 passing (server 120 + shared 19), 8 skipped (Redis/load-test gated). |
| **TypeScript** | ✅ Zero errors across shared/server/client (TS7016 wave fixed via shared `.d.ts` emit). |
| **CI** | ✅ GitHub Actions runs typecheck (all 3 packages) + tests + vite build. |
| **Bundle** | ✅ Vendor-split: index.js 271kB + Three.js 687kB (cacheable) + lazy modal chunks |
| **Services extracted** | ✅ 25+ — all domain services in `packages/server/src/services/`. |
| **Active room** | `WorldRoom.ts` (~1896 lines). Old `GameRoom.ts` (2240 lines) **deleted** as dead code. |
| **i18n** | ✅ Full string extraction across UI components — 60+ namespaces in `locales/en.ts` + `th.ts`. |
| **Mobile** | ✅ Responsive Login/CharacterSelect/CharacterCreator/HUD/TouchControls (portrait+landscape). |
| **Movement** | ✅ Server+client collision (slide along obstacles), auto-jump on step-up, dynamic target switching. |
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
- **Keybind:** `B` toggles build mode; `ESC` exits
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

### Cleanup pass — 2026-05-24
- Deleted dead `GameRoom.ts` (2240 lines) — server only registers WorldRoom.
- Fixed `@game/shared` package emits `.d.ts` (declaration: true in tsconfig). Resolved TS7016 across server/client.
- Lifted `engageRange` computation in Scene.tsx to fix use-before-declaration.
- Fixed Sprite2D context/renderer to use `p.pos?.x/z` (matches schema, was reading non-existent `p.x/z`).
- Fixed CollisionService MapDef field names (`size` / `spawns`, not `worldSize` / `monsterSpawns`).
- Added `ioredis-mock` type shim (`packages/server/src/types/shims.d.ts`).
- CraftingPanel labels use translation keys instead of broken top-level `t()` calls.
- CI: added pnpm setup action + client typecheck step + shared build-before-typecheck.

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
