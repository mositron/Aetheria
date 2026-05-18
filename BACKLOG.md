# Aetheria — Backlog & Session Handoff

> **Single source of truth สำหรับงานที่เหลือ.** อ่านไฟล์นี้ก่อนเริ่ม session ใหม่
> เพื่อให้รู้ว่าสถานะอะไร, อยู่ที่ไหน, ทำอะไรต่อ.

Last updated: 2026-05-19 (commit `016dbd6`)
Total commits to date: 49 across 9 audit/refactor rounds

---

## 📸 Quick snapshot — รู้ใน 30 วินาที

| Area | Status |
|---|---|
| **Build** | ✅ Client + server build clean. PWA SW generated. |
| **Tests** | ✅ 54 server vitest tests + 19 shared vitest tests = **73 passing** |
| **TypeScript** | ✅ No errors (1 pre-existing TS6059 rootDir warning is benign) |
| **Bundle** | ✅ Vendor-split: index.js 271kB + Three.js 687kB (cacheable) + lazy modal chunks |
| **Services extracted** | 10/15 (Combat/Inventory/Trade/Spawn/Quest pending P0.A) |
| **GameRoom.ts** | ~2900 lines (was 3000). Will shrink further as remaining services extract. |
| **Deployment** | Single-instance ready. Multi-instance via `REDIS_URL` opt-in. |
| **PWA** | Installable (manifest + Workbox cache + auto-update). Icons = favicon only (P1.9). |

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
**Scope:** 1 PR.
**TODO:** `.github/workflows/ci.yml`
- pnpm install + cache
- build all packages
- vitest run on @game/shared + @game/server
- typecheck all packages
- Branch protection on `main` (require CI green)

### C. CORS + helmet + rate limit on HTTP routes
**Scope:** 1 PR.
**TODO:**
- Verify CORS_ORIGINS env documented + tested in prod
- Helmet.js middleware (CSP, HSTS, X-Frame-Options)
- express-rate-limit on `/auth/register` + `/auth/login`
- HTTPS enforcement middleware (refuse non-https in prod)

### D. Server-side anti-cheat: movement bounds
**Scope:** 1 PR. Audit found this; only partial fix shipped.
**Current:** AntiCheat service validates input magnitude (mx/mz range).
**Missing:**
- Server tracks last position; reject if delta > maxSpeed * dt * 1.5
- Speed-hack detection (sustained over N ticks)
- Anti-teleport (warp without portal trigger)
- Audit log table in DB (suspicious_events: sid, kind, value, ts)

---

## P1 — Production polish

### 1. GameRoom domain split *(10/15 done, 5 remaining)*

**Done** (in `packages/server/src/services/`, each with `.test.ts`):
- ✅ RateLimiter, SpatialHash, AntiCheat, DailyChallenge, Party, Achievements,
  Friend, Mailbox, Auction, Guild

**Remaining** — gated on P0.A behavioral tests:
- `Combat` — handleAttack/handleSkill/dealDamage/recalcStats/status ticks.
  Touches state.players + state.monsters in tick hot path. Highest risk.
- `Inventory` — addToInventory/addToInventoryOrMail/equip/unequip/useItem/drop.
  Shared with combat/quest/trade/auction. Touch everywhere.
- `Trade` — tradeSessions Map + atomic swap + snapshot/rollback.
  Regression-prone (we already had to fix item-dup bug here).
- `Spawn` — chunk monster + resource respawn. Many tunables.
- `Quest` — playerQuests Map + reward delivery. Couples to combat events
  (kill→bump) and inventory (reward grant).

**Pattern to follow** (from completed extractions):
1. Create `services/X.ts` with pure data + transitions (no I/O)
2. Add `services/X.test.ts` with unit tests covering invariants
3. GameRoom holds `xSvc = new X(...)` field
4. Handlers in GameRoom become thin: extract msg → call service → forward result
5. Delete the original inline state Maps + helpers from GameRoom

### 2. Real-time observability
**TODO:**
- Per-tick duration metric (log warn if > 40ms)
- Active player gauge in /health JSON
- Error rate counter per handler
- Optional: Prometheus `/metrics` endpoint

### 3. Redis path: integration smoke test
**TODO:**
- docker-compose with Redis 7 + 2 server replicas
- vitest spec: register player on instance 1, whisper from instance 2
- Verify pub/sub message arrives correctly

### 4. Damage formula: level scaling
**Audited but not applied.** Lv50 does same damage to slimes as Lv1.
In `GameRoom.handleAttack`:
```ts
const lvDelta = attacker.level - (target.level ?? attacker.level);
dmg *= 1 + Math.max(-0.3, Math.min(0.5, lvDelta * 0.03));
```
Same for skill damage. Add test in (eventual) `combat.test.ts`.

### 5. Zeny sinks — anti-inflation
**Audited.** Players hit 10k+ zeny by Lv20 with nothing to spend on.
Options (pick 1-2):
- NPC enchantment: item + 500z → +1 ATK/DEF (max +5)
- Pet breeding tier cost scaling (currently flat 200z)
- Fast-travel waypoint upkeep (e.g., 50z per teleport)
- Repair cost on death (weapon durability)

### 6. Mobile button audit (44×44 minimum)
**Files with `w-8 h-8` close buttons (touch-unfriendly):**
- `Inventory.tsx`
- `SettingsPanel.tsx`
- `AchievementsPanel.tsx`
**TODO:** change to `w-11 h-11` (or `min-w-[44px] min-h-[44px]`).

### 7. Loading states on async buttons
- `AuctionHouse` buy button — fire-and-forget; user may click multiple times
- `FriendList` add button — same
**Pattern:** local `busy` state + `disabled={busy}` + spinner / text swap.

### 8. Unified error toast system
**Current:** scattered `client.send("system", { text })` — no severity.
**TODO:**
- Define `Toast` channel: `{ severity: "info"|"warn"|"error", text, ttlMs }`
- Client toast manager component (top-of-screen stack, auto-dismiss)

### 9. PWA app icons (production-grade)
**Current:** manifest references `favicon.ico` only.
**TODO:**
- Generate 192×192, 512×512, maskable variants from logo
- Apple touch icons (180×180)
- Splash screens for iOS install

### 10. EXP curve playtesting
Lv30+ softcap shipped. Verify with real play data. Knob:
`base + (lv - 30) * 120` — bump the 120 if endgame still too long.

---

## P2 — UX / Accessibility

### 11. Focus traps on modals
`role="dialog"` + `aria-modal="true"` added (commit `246eda4`), but no
focus trap — Tab leaks to canvas. Use `focus-trap-react`.

### 12. Tooltip-on-tap for touch
`title` invisible on touch. Custom long-press 600ms → show, tap-elsewhere → dismiss.

### 13. Confirm dialogs (some still missing)
**Done:** friend remove, bulk-sell, auction cancel, drop item, guild leave.
**Still ad-hoc:**
- Pet release
- Achievement title change (silent)
- House decoration removal (silent)
- Unequip rare equipment

### 14. Color contrast audit
Some `text-cyan-200` on `bg-slate-900/50` near WCAG 4.5:1 threshold.

### 15. `:focus-visible` outline globally
For keyboard nav users.

### 16. Skip-to-content link
For screen readers / keyboard users.

### 17. Screen reader labels
`MenuBar` icon buttons use `title` — `aria-label` is more reliable.

### 18. i18n
Currently Thai hardcoded. Extract to `locales/{th,en}.ts` + `useT()` hook +
Settings language switcher + `<html lang>` dynamic.

### 19. prefers-color-scheme
Optional. Game is dark by design; UI panels could honor light mode.

---

## P3 — Game content / balance

### 20. Late-game content (Lv30+)
**Done:** Lv10→30 quest chain (q_orc → q_yeti → q_darklord).
**Open:**
- Lv30+ daily endgame loop
- Second job tier advancement (Knight2, Wizard2, ...)
- Lv40 raid: requires party of 3+
- Endless dungeon with leaderboard

### 21. More monsters per biome
**Done:** boar/spider/ghost/bat/golem/fox.
**Want:**
- Desert: sand_worm, scorpion_lord (boss)
- Snow: ice_wraith, snowman_giant
- Swamp: bog_witch, swamp_serpent

### 22. Crafting depth
- Recipe research / discovery system
- Quality tiers (normal / superior / masterwork)
- Bench tier requirements (basic → master forge)

### 23. Pet system depth
- Pet leveling visible in UI (XP gain currently hidden)
- Pet skills (passive bonuses while equipped)
- Pet evolution (rare combinations)

### 24. Skill tree per job
Branching tree (Wizard → Fire/Ice/Lightning) + skill point allocation UI.

### 25. Marriage / social bonds
Ring quest, shared house buff when both online, paired emotes.

### 26. Housing decoration sharing
`/visit` other houses, decoration gifting via mail, top-house leaderboard.

### 27. Achievement UI polish
Big banner animation on unlock, achievement screenshot button.

### 28. Seasonal events
Songkran water-throw, Christmas snow overlay, Loy Krathong lanterns.

---

## P4 — Infrastructure / scale

### 29. Asset adoption (real GLTF)
Loader infra shipped (`useModel`, `useTexture`, manifest). Source/commission
actual models — user decision when.

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
ec379a8 GameRoom split round 3: Auction service (9 total)
6f142bb GameRoom split round 2: Friend + Mailbox services (8 total)
3b614b9 GameRoom split round 1: 4 more services extracted (6 total)
e1104c7 Round 6: production foundations (SpatialHash, assets, PWA, Redis, RateLimiter)
246eda4 Round 5: vendor split + logger migration + a11y + anti-cheat
b0c8f9a Round 4: finish all deferred audit items
86435fd Pass 4-7 audit fixes: perf + UX + ops + balance
42d0bcb Pass 1-3 audit fixes: security + stability + memory
4480fe5 audit fixes: 18 issues across server/client/schema
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
