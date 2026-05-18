# Aetheria — Backlog

ทุกอย่างที่ยังไม่ได้ทำหลัง audit รวมศูนย์ที่ไฟล์นี้ จัดตามความสำคัญ + scope effort.
Items ที่อยู่ใน main แล้ว: ดู `git log --oneline`.

Last updated: 2026-05-19 (commit `e1104c7`)

---

## P0 — Blockers ก่อน production launch จริง

### A. Behavioral test coverage สำหรับ GameRoom handlers
**Scope:** ~1-2 PR.
**Why blocker:** ทุก refactor ของ GameRoom (P1.1) ต้องอาศัย tests เพื่อให้ปลอดภัย
**TODO:**
- In-memory room harness (mock state + clients)
- Coverage targets:
  - Combat (handleAttack, handleSkill, dealDamage, status ticks) — 80%
  - Trade (full accept→offer→confirm→rollback) — 90%
  - Auction (list / buy race / cancel) — 90%
  - Guild (create / join / leave with $transaction) — 80%
  - Quest (track / turnin / chain advance) — 70%
- Snapshot tests สำหรับ savePlayer/onJoin (regression guard)

### B. CI / GitHub Actions
**Scope:** 1 PR.
**TODO:**
- `.github/workflows/ci.yml`:
  - pnpm install + cache
  - build all packages
  - vitest run on @game/shared + @game/server
  - typecheck all packages
- Branch protection on `main` (require CI green)
- PR template (link to BACKLOG item if applicable)

### C. CORS allowlist + production hardening review
**Scope:** 1 PR.
**TODO:**
- Verify CORS_ORIGINS env documented + tested in prod
- Helmet.js middleware (CSP, HSTS, X-Frame-Options)
- Rate limit on `/auth/register` + `/auth/login` (express-rate-limit)
- HTTPS enforcement middleware (redirect or refuse non-https in prod)

### D. Server-side anti-cheat: movement bounds
**Scope:** 1 PR. **Audited but not fully fixed.**
**Current:** validates input mx/mz magnitude only.
**Missing:**
- Server tracks last position; if next-tick delta exceeds `maxSpeed * dt * 1.5`, reject + log
- Speed-hack detection (sustained over N ticks)
- Anti-teleport (warp without portal trigger)
- Audit log table in DB (suspicious_events: sid, kind, value, ts)

---

## P1 — Production polish (high value, medium effort)

### 1. GameRoom.ts full domain split *(in progress)*
**Status:** 8 services extracted with tests (45 tests passing).
  - ✅ `RateLimiter` — token bucket
  - ✅ `SpatialHash` — chunk-grid spatial index
  - ✅ `AntiCheat` — input validation
  - ✅ `DailyChallenge` — progress + reward
  - ✅ `Party` — state machine + invite tracking
  - ✅ `Achievements` — unlock detection + leaderboard pts
  - ✅ `Friend` — DB-backed friend list w/ validation
  - ✅ `Mailbox` — race-safe claim, send/read/list
  - ✅ `Auction` — list / browse / buy (race-safe) / cancel + relist on inv-full

**Remaining services to extract** (ordered by coupling difficulty — low first):
- `Quest` (playerQuests Map + reward delivery) — medium
- `Guild` ($transaction wrapped + chat broadcast) — medium
- `Inventory` (addToInventory, addToInventoryOrMail, equip/unequip) — high coupling
- `Trade` (tradeSessions + atomic swap + rollback) — high coupling
- `Combat` (handleAttack, handleSkill, dealDamage, status ticks) — highest coupling
- `Spawn` (chunk monster + resource respawn) — high coupling
**Blocked by:** P0.A only for Combat/Inventory/Trade — others are safe to extract now.

### 2. Real-time observability
**TODO:**
- Per-tick duration metric — `console.warn` if `> 40ms`
- Active player gauge (in /health JSON)
- Error rate counter per handler
- Optional: Prometheus `/metrics` endpoint
- Optional: Grafana dashboard config example

### 3. Redis path: integration smoke test
**TODO:**
- docker-compose with Redis 7 + 2 server replicas
- vitest spec: spin both, register player in inst#1, whisper from inst#2
- Verify pub/sub message arrives correctly

### 4. Damage formula: level scaling
**Audited but not applied.** Lv50 player does same damage to slime as Lv1.
**TODO in `GameRoom.handleAttack`:**
```ts
const lvDelta = attacker.level - (target.level ?? attacker.level);
dmg *= 1 + Math.max(-0.3, Math.min(0.5, lvDelta * 0.03));
```
Same for skill damage. Add test in `combat.test.ts`.

### 5. Zeny sinks — anti-inflation
**Audited.** Players hit 10k+ zeny by Lv20 with nothing to spend on.
**Options (pick 1-2):**
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
**Audited but not applied.**
- `AuctionHouse` buy button — fire-and-forget; user may click multiple times
- `FriendList` add button — same
**Pattern:** local `busy` state + `disabled={busy}` + spinner / text swap.

### 8. Unified error toast system
**Current:** scattered `client.send("system", { text })` — no severity.
**TODO:**
- Define `Toast` channel: `{ severity: "info"|"warn"|"error", text, ttlMs }`
- Client toast manager component (top-of-screen stack, auto-dismiss)
- Replace ad-hoc system sends in handlers

### 9. PWA app icons (production-grade)
**Current:** manifest references `favicon.ico` only.
**TODO:**
- Generate 192×192, 512×512, maskable variants from logo
- Apple touch icons (180×180)
- Splash screens for iOS install
- Test install on iOS Safari + Android Chrome

### 10. EXP curve playtesting
**Done:** Lv30+ softcap shipped.
**Open:** verify with real play data that curve feels right. Adjustment knob:
`base + (lv - 30) * 120` — bump the 120 if endgame still too long.

---

## P2 — UX accessibility (medium impact)

### 11. Focus traps on modals
**Audited.** `role="dialog"` + `aria-modal="true"` added (commit 246eda4), but
no focus trap — Tab can leak to canvas behind modal.
**TODO:** custom `<FocusTrap>` wrapper or use `focus-trap-react`.

### 12. Tooltip-on-tap for touch devices
**Current:** `title` attribute — invisible on touch.
**TODO:** custom tooltip component:
- Long-press 600ms → show
- Tap-elsewhere → dismiss
- Apply to HUD status chips, Hotbar, MenuBar icons.

### 13. Confirm dialogs for ALL destructive actions
**Done:** friend remove, bulk-sell, auction cancel, drop item, guild leave.
**Still ad-hoc / missing confirm:**
- Pet release
- Achievement title change (silent)
- House decoration removal (silent)
- Unequip rare equipment

### 14. Color contrast audit
**Audited.** Some `text-cyan-200` on `bg-slate-900/50` near WCAG threshold.
**TODO:** Lighthouse contrast audit + bump opacity where < 4.5:1.

### 15. Focus-visible outline
Add `:focus-visible` outline globally in `index.css` so keyboard nav users
can see where focus is.

### 16. Skip-to-content link
Hidden link visible on focus for screen readers / keyboard users.

### 17. Screen reader labels on icon buttons
`MenuBar` icon buttons use `title` — `aria-label` is more reliable for SR.

### 18. i18n
**Current:** Thai hardcoded everywhere.
**TODO:**
- Extract strings to `locales/th.ts` + `locales/en.ts`
- `useT()` hook returning current locale's value
- Language switcher in Settings
- `<html lang>` dynamic update

### 19. prefers-color-scheme
Optional. Game is dark-themed by design but could honor light mode for UI panels.

---

## P3 — Game content / balance (sustained engagement)

### 20. Late-game content (Lv30+)
**Done:** quest chain to Lv30 (q_orc → q_yeti → q_darklord).
**Open:**
- Lv30+ daily endgame loop
- Second job tier advancement (Knight2, Wizard2, ...)
- Lv40 raid: requires party of 3+
- Endless dungeon mode with leaderboard

### 21. More monsters per biome
**Done:** boar / spider / ghost / bat / golem / fox added.
**Want:**
- Desert: sand_worm, scorpion_lord (boss)
- Snow: ice_wraith, snowman_giant
- Swamp: bog_witch, swamp_serpent
- Underwater (future map): kraken, jellyfish

### 22. Crafting depth
**Current:** ~15 recipes.
**Want:**
- Recipe research / discovery system
- Quality tiers (normal / superior / masterwork) → stat bonus
- Bench tier requirements (basic → master forge)

### 23. Pet system depth
**Current:** breed at 200z flat, equip one pet at a time.
**Want:**
- Pet leveling visible UI (currently XP gain hidden)
- Pet skills (passive bonuses while equipped)
- Pet evolution (rare combinations)
- Pet PvP / racing minigame

### 24. Skill tree per job
**Current:** flat unlock per level.
**Want:**
- Branching tree (e.g., Wizard → Fire / Ice / Lightning specialist)
- Skill point allocation UI

### 25. Marriage / social bonds
**Current:** none.
**Want:** ring quest, shared house buff when both online, paired emotes.

### 26. Housing decoration sharing
**Current:** decorations are private.
**Want:**
- Friend can /visit a house slot
- Decoration "gifting" via mail
- Top-rated house leaderboard

### 27. Achievements UI polish
**Current:** unlocks but no celebration moment.
**Want:** big banner animation on unlock, achievement screenshot button.

### 28. Seasonal events
- Songkran event (water-throwing animation, free hp_potion)
- Christmas event (snow particles override on field map)
- Loy Krathong (water lanterns spawn on rivers)

---

## P4 — Infrastructure / scale

### 29. Asset adoption (production GLTF)
**Done:** loader infra shipped (`useModel`, `useTexture`, manifest).
**Open:** actually source / commission 3D models. User-decision when.

### 30. Sprite sheet / texture atlas
Beyond GLTF: 2D sprite mode for top-down classic Ragnarok feel as alternative
to 3D. Optional.

### 31. Background music
Procedural sfx exists. Add looping music tracks (need .ogg files or Web Audio
procedural generation).

### 32. Voice chat / proximity audio
Out of scope for v1. Note here so it doesn't get rebuilt accidentally.

### 33. Sentry / error tracking
**TODO:**
- `@sentry/node` on server, gated by `SENTRY_DSN` env
- `@sentry/react` on client
- Source maps uploaded on deploy

### 34. Structured log shipping
**Current:** logger writes to stdout (JSON in prod).
**Want:** ship to ELK / Loki / Datadog via Vector sidecar. No code change
needed if NODE_ENV=production output is JSON — just deploy config.

### 35. Database backups
**Current:** SQLite file `dev.db`.
**Want:**
- Cron job: `sqlite3 .backup` daily
- Off-server storage (S3 / B2)
- Restore drill documented

### 36. Postgres migration (when SQLite ceiling hit)
**Current:** SQLite fine for hundreds of players. Beyond ~1000 concurrent
the write-lock becomes a bottleneck.
**TODO when needed:**
- Switch datasource in `schema.prisma`
- Re-baseline migrations
- Connection pool config

### 37. Horizontal scale beyond Redis
**Done:** Colyseus redis-presence wired (single-region multi-instance).
**Open for global scale:**
- Region-locked rooms (currently 1 room per map)
- Sticky session routing
- CDN for static assets

### 38. Load testing harness
Spin up 100 concurrent bots vs server, measure:
- Tick duration
- Memory growth
- Network bandwidth per player

---

## P5 — Developer experience

### 39. ESLint + Prettier
**Current:** no lint/format configured.
**TODO:**
- ESLint shared config across packages
- Prettier with `printWidth: 100`
- pre-commit hook (husky + lint-staged)

### 40. README expansion
- Architecture diagram
- Local dev quickstart (already in CLAUDE.md, mirror to README)
- Deploy guide (k8s / fly.io / Railway examples)

### 41. CHANGELOG.md
Auto-generated from conventional commits. Currently no traceability of
breaking vs additive changes per release.

### 42. SemVer + release tags
Cut `v0.1.0` etc as the game stabilizes. Right now everything is on `main`.

### 43. Storybook for UI components
Each panel rendered in isolation with mock state. Speeds up UI iteration.

### 44. Hot reload guards
Server uses tsx watch (fine). Client Vite HMR fine. But schema changes
require full restart — should at least print a clear message.

---

## P6 — Security (sustained hardening)

### 45. JWT refresh tokens
**Current:** 30-day access token, no refresh path.
**TODO:**
- 7-day access + 90-day refresh
- Revocation list in Redis
- Logout invalidates refresh

### 46. Password requirements
**Current:** min 4 chars.
**TODO:** enforce >= 8 chars, mixed case + digit. Show strength meter on register.

### 47. 2FA (TOTP)
Out of scope for MVP. Note for future.

### 48. Account recovery
**Current:** none. Lost password = lost character.
**TODO:** email-based recovery (requires SMTP setup — out of scope) OR
security question fallback (weaker but works offline).

### 49. Audit log table
DB table for: login, password change, char delete, large trade,
auction completion, guild create/disband. For ops post-mortems.

### 50. Server-side schema validation
**Current:** message types declared in `@game/shared` but server trusts them.
**TODO:** Zod schemas validated on every `onMessage` — reject malformed
without crashing.

---

## Won't do — explicit non-goals

- **External asset downloads** — per CLAUDE.md, user wants procedural / local-only.
  Loader infra shipped; populating it is user's call when they have assets.
- **SMTP / email** — no transactional email provider configured.
- **In-app purchases / monetization** — out of scope for personal project.
- **Cheating tolerance** — no "fair fight" mode; server is authoritative.
- **Cross-platform mobile native app** — PWA covers this need.
- **WebRTC voice chat** — out of scope for v1.

---

## Snapshot: where we are right now

**Done (40 commits across 6 audit rounds):**
- Security: JWT hardening, prototype pollution, array bounds, rate limiting, anti-cheat input validation
- Concurrency: trade atomicity, auction race fix, guild transactions, monster despawn cleanup
- Performance: Three.js disposal, useFrame setState removal, spatial hash, code splitting, vendor chunks
- UX: prefers-reduced-motion, TEXTAREA keyboard guards, modal a11y, confirmations
- Ops: SIGTERM handler, /health endpoint, structured logger, port validation
- Content: EXP softcap, 6 intermediate items, 5-quest Lv10-30 chain
- Infra: Vitest (31 tests), Prisma migrations, PWA, Redis scale-out, asset loader
- Code quality: services/ directory, type-safety pass, dead code removal

**Snapshot stats:**
- 31 vitest tests passing (19 shared + 12 server)
- Client bundle: 271 kB app + cached vendor chunks (was 1376 kB monolith)
- Server: graceful shutdown + health + structured JSON logs in prod
- All audit P0/P1 from rounds 1-5 cleared
