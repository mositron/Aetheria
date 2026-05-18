# Backlog

Outstanding work, prioritized. Items that need real time, design, or external dependencies
get parked here so the main branch stays shippable.

## High priority — production polish

### 1. GameRoom.ts full domain split  *(#215)*
**Status:** scaffolding done, full split outstanding.
**Done:** `RateLimiter`, `SpatialHash` extracted with tests. Wrapper kept in `GameRoom`
so call sites compile unchanged.
**Remaining:**
- Extract `CombatService` (handleAttack, handleSkill, dealDamage, status ticks)
- Extract `InventoryService` (addToInventory, addToInventoryOrMail, equip/unequip)
- Extract `TradeService` (the whole trade:* flow + snapshot/rollback)
- Extract `AuctionService` (list / browse / buy / cancel + mail)
- Extract `GuildService` (create/join/leave/chat with transactional integrity)
- Extract `QuestService` (track/turnin/progress)
- Extract `SpawnService` (chunk-based monster + resource spawning)

**Why parked:** ~3000 lines of shared state. Production-grade split requires
behavioral test coverage first (Vitest scenarios per handler) so refactor is
safe to verify. Estimated effort: 2-3 PRs of ~500 lines each.

### 2. Behavioral test coverage for GameRoom message handlers
Required before #1 can land safely. Spin up an in-memory room + mock state and
exercise each handler. Target: 60%+ coverage on combat / trade / auction paths.

### 3. Real-time observability
- Per-tick duration metric (warn if > 40ms)
- Active player gauge (Prometheus or just /health JSON)
- Error rate counter per handler

### 4. Smoke tests for Redis scale-out path
Requires Redis in CI. Docker-compose or testcontainers.

## Medium priority

### 5. Mobile button audit (44×44 minimum)
Several close buttons still `w-8 h-8` (32×32). Apple HIG recommends 44×44.
Files: `Inventory.tsx`, `SettingsPanel.tsx`, `AchievementsPanel.tsx` close buttons.

### 6. Tooltip-on-tap for touch
`title` attribute doesn't fire on touch. Need a custom tooltip component that
shows on long-press → 1s timeout, dismisses on next tap.

### 7. Loading states on async buttons
- `AuctionHouse` buy button (currently fires & forgets)
- `FriendList` add button
- `CharacterCreator` already correct — pattern to copy.

### 8. Unified error toast system
Replace `client.send("system", { text })` ad-hoc pattern with a typed
`Toast` channel: `{ severity: "info"|"warn"|"error", text, ttlMs }`.

### 9. Anti-cheat: server-side movement bounds
Currently only validates input magnitude. Should also check max delta-x/z per
tick against server-tracked position to catch teleport-injection.

### 10. Damage formula: level scaling
Currently `dmg = atk + str`. Add `dmg *= 1 + (attackerLv - targetLv) * 0.03`
so higher levels feel impactful against same-tier mobs.

## Low priority — scope expansion

### 11. PWA app icons
Generate proper 192×192 / 512×512 / maskable icons from a logo.
Right now manifest references favicon.ico only.

### 12. Asset adoption
Drop real GLTF models for hero / common mobs. Wire them via `useModel()` hook
already shipped in `assets/useAsset.ts`. Procedural fallback already handles
missing files.

### 13. i18n
Currently Thai-hardcoded. Extract to `locales/{th,en}.ts` and add language
switcher in Settings.

### 14. Sentry / error tracking
Wire `@sentry/node` (server) + `@sentry/react` (client) for production error
visibility. Gated on `SENTRY_DSN` env so dev is unaffected.

### 15. CI: GitHub Actions
- pnpm install + build on PR
- run vitest in shared + server
- type-check all packages

## Won't do (explicit no)

- **External asset downloads** — per CLAUDE.md, user wants local-only / procedural.
  Loader infra ships; populating it is user's call.
- **Account verification email** — no SMTP available.
- **Payment integration** — out of scope.
