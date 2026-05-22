# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

_(No changes yet)_

---

## [v0.1.0] — 2026-05-22

### ฟีเจอร์ใหม่ (Features)

- **World/Collision**: Infinite procedural world with chunk streaming
- **World/Collision**: StepTerrain — visible mountains + cliffs + rivers + waterfalls
- **World/Collision**: Client-side collision — block walking through mountains, houses, trees
- **Terrain**: Tighten terrain collision — block climbing > 1 step without jumping
- **Terrain**: 5-biome procedural world (plains/forest/desert/snow/swamp)
- **Terrain**: Terrain-aware aggro LOS + chunked resource nodes + camera Y-track
- **World**: In-world signposts + sequential onboarding tutorial
- **World**: Biome-aware mob spawning per chunk (day/night tables)
- **World**: Chunk-aware mob spawning + day/night spawn tables + far-despawn
- **Combat**: PvP toggle + quest chains + Lv30 job advancement
- **Combat**: Actual player-vs-player damage (both players must have pvpFlag)
- **Combat**: Fall-off-ledge gravity — terrain Y physics now smoothly drops
- **Combat**: Mount speed boost + procedural treasure chests in chunks
- **Combat**: PvP toggle + Job Advancement UI
- **Combat**: Top-center target display (HP bar for mobs, info for NPCs/players)
- **Content**: Multi-waypoints + pet xp + dailies + P2P trade
- **Content**: +1 skill per base job, +6 monsters, +3 potion recipes
- **Content**: Friend markers + halo on minimap (cyan, distinct from strangers)
- **Content**: Click-to-target players + night ambient + minimap compass
- **Content**: Landing-dust VFX when player jumps onto the ground
- **Social**: Guild system — create/join/leave + persistent guild chat
- **Social**: Friend list panel (add/remove/whisper, online status)
- **Social**: Friend list server handlers + swim mode
- **Social**: Slash commands in chat — /help /pvp /home /who /w
- **Market**: Auction House — player-to-player marketplace
- **UI/SFX**: Global click SFX on every button tap (tactile UX)
- **UI/UX**: Mobile-first UI overhaul + auto-potion + bulk sell + ranged basic attack
- **UI/Polish**: Polish — tighten fog (40–90 m) to mask chunk pop-in
- **P4**: Sentry, background music, password strength, JWT refresh, DB backup scripts
- **P4**: ESLint + Prettier config with husky pre-commit hook
- **P4**: GLTFHero.tsx loader stub — integration point for 3D model adoption
- **P2/P3**: Combat, Inventory, Trade, Quest, Spawn, Research, Stats, Movement services + P2/P3 client UI + monster models + seasonal effects + companions

### แก้บัก (Bug Fixes)

- **P0**: CORS strict whitelist + helmet + dual-rate-limit + HTTPS redirect
- **Terrain**: Drops sit on terrain instead of floating above the spawn-plane

### ปรับปรุง (Refactor)

- **Architecture**: GameRoom.ts → WorldRoom.ts (service pattern, 1796 lines)
- **Audit**: 18 issues across server/client/schema
- **Audit**: Security + stability + memory fixes (Pass 1–3)
- **Audit**: Perf + UX + ops + balance fixes (Pass 4–7)
- **Audit**: Finish all deferred audit items (Round 4)
- **Architecture**: Vendor split + logger migration + a11y + anti-cheat (Round 5)
- **Infrastructure**: Production foundations — scale + perf + offline + extensibility (Round 6)

### งานอื่นๆ (Chore)

- Add CompanionModel, Inventory test, Room tests, Redis test, client packages
- Session handoff — P2/P3 polish (focus traps, mobile audit, i18n, seasonal effects, color contrast, tooltip, confirm dialogs)
- GameRoom split — Guild service (Round 4 of 4)
- GameRoom split — Auction service (Round 3 of 4)
- GameRoom split — Friend + Mailbox services (Round 2 of 4)
- GameRoom split — 4 more services extracted (Round 1 of 4)

### เอกสาร (Docs)

- BACKLOG.md — comprehensive session handoff (50 outstanding items across P0–P6)
- BACKLOG.md — P4 items DONE (Sentry, music, refresh, password, backup, ESLint, GLTF)
- README reflects infinite-world + new social systems
- Hero gameplay GIF + screenshot grid to README
- Update repo URL to Aetheria

---

_Generated from commit history — Aetheria MMORPG (game-v1)_