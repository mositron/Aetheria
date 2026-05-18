# 🧩 Systems Reference

Everything that's already built. Read this before adding a feature — chances are the foundation already exists.

> 📁 = file location · ⚡ = where it ticks/runs · 🔌 = how to extend

---

## Table of contents

1. [Core architecture](#1-core-architecture)
2. [Combat](#2-combat)
3. [Survival (hunger/thirst/stamina)](#3-survival)
4. [Movement & input](#4-movement--input)
5. [World & biomes](#5-world--biomes)
6. [Day/night & weather](#6-daynight--weather)
7. [Resources & gathering](#7-resources--gathering)
8. [Inventory & items](#8-inventory--items)
9. [Crafting](#9-crafting)
10. [Shops & economy](#10-shops--economy)
11. [Quests](#11-quests)
12. [Achievements & titles](#12-achievements--titles)
13. [Pets & mounts](#13-pets--mounts)
14. [Flying](#14-flying)
15. [Fishing](#15-fishing)
16. [Farming](#16-farming)
17. [Housing & decoration](#17-housing--decoration)
18. [NPC dialog & interaction](#18-npc-dialog--interaction)
19. [Mail system](#19-mail-system)
20. [Leaderboard](#20-leaderboard)
21. [Daily login & seasonal events](#21-daily-login--seasonal-events)
22. [Bot AI](#22-bot-ai)
23. [Hint & tutorial](#23-hint--tutorial)
24. [Waypoint / navigation](#24-waypoint--navigation)
25. [Emotes & social](#25-emotes--social)
26. [Photo mode](#26-photo-mode)
27. [PWA / mobile](#27-pwa--mobile)
28. [Persistence](#28-persistence)
29. [Auth & multi-character](#29-auth--multi-character)
30. [Audio](#30-audio)
31. [UI layout map](#31-ui-layout-map)

---

## 1. Core architecture

| Layer | Tech | Files |
|---|---|---|
| Networking | Colyseus 0.16 (WebSocket + Schema delta sync) | `packages/server/src/rooms/GameRoom.ts` |
| State | `WorldState` schema (Player, Monster, GroundItem, PlantNode + scalars) | `packages/shared/src/schema.ts` |
| Server tick | 20 Hz `setSimulationInterval` in GameRoom | `GameRoom.tick()` |
| Authority | Server-authoritative: position, combat, drops, quests, inventory | — |
| Client | Vite + React + R3F + Zustand + Tailwind | `packages/client/src/` |
| Build hot-reload | tsx watch (server) + Vite HMR (client) | root `package.json` `pnpm dev` |
| Encoder buffer | `Encoder.BUFFER_SIZE = 64 * 1024` (room for many fields) | `packages/server/src/index.ts` |

> All client→server messages go through `room.send("name", payload)`; handlers registered in `GameRoom.onCreate`. Message types live in `packages/shared/src/messages.ts`.

---

## 2. Combat

- 📁 server: `GameRoom.handleAttack`, `handleSkill`, `dealDamageToMonster`, `applyStatusToMonster`
- 📁 shared: `jobs.ts` (skills), `stats.ts` (derived stats), `status.ts` (poison/burn/stun/freeze/slow/regen)
- ⚡ Combat loop: client sends `attack` or `skill` → server validates cooldown/MP/range → rolls hit/crit → applies dmg + status → broadcasts `damage` + `skillCast`
- 🎯 Auto-target: client picks nearest hostile mob when attack pressed with no target

**Damage formula:**
```
hitChance = clamp(0.8 + (hit - flee) * 0.03, 0.05, 0.99)
       × hunger penalty (×0.75 if hunger=0)
       × thirst penalty (×0.55 if thirst=0)
       × night penalty (×1.5 mob damage)
```

🔌 **Add a skill:** push into a job's `skills` array in `jobs.ts`. Hotkey 1-4. Field `range > 2.5` = ranged. Server handles generically.

---

## 3. Survival

- 📁 server: `tickInner` (hunger/thirst decay, regen, debuffs)
- 📁 client: `HUD.tsx` (bars), `SurvivalEffects.tsx` (screen tint)
- ⚡ Hunger drops at 100/(28×60) per second when idle, ×1.6 when moving (~28 min idle, ~17 min running)
- ⚡ Thirst drops at 100/(22×60) per second (~22 min idle, ~14 min running)
- ⚡ Stamina drains 4/s while moving, regens 18/s (rain +60% bonus); 7/s drain while flying (no-drain if glider equipped)

**Debuffs (no death — just weaker):**
- Hunger < 25 → speed -20%, damage -15%; = 0 → -36% speed, -35% dmg, -25% hit
- Thirst < 25 → -15% hit, purple screen tint; = 0 → drunkard wobble, hue shift, -45% hit
- Stamina = 0 → -35% speed

Drinking water restores +35 thirst (must be near `waters` in maps.ts).

🔌 **Add a food item:** set `hungerRestore` / `thirstRestore` / `staminaRestore` in `items.ts`. `handleUseItem` reads these.

---

## 4. Movement & input

- 📁 client: `Scene.tsx` input loop (50ms `setInterval` sends `input` with mx/mz/rotY)
- 📁 client: `useKeyboard.ts` (layout-independent — uses `e.code`)
- 📁 client: `ScreenJoystick.tsx` (drag anywhere) + `TouchControls.tsx` (visible joystick + action buttons)
- 📁 utils: `keyMatch.ts` — `keyEq(e, "w")` works on Thai/RU/AR/etc

**Input priorities (Scene.tsx):**
1. Pickup target (auto-walk to drop) →
2. Monster target (auto-engage in range) →
3. Walk target (click-to-walk) →
4. Bot wander target →
5. Keys/joystick

**Smoothing:**
- Self position: `position.lerp(target, 1 - exp(-dt × 18))` — frame-rate independent
- Other players: same lerp factor for smooth visuals

---

## 5. World & biomes

- 📁 shared: `maps.ts` (MAPS.field 200×200, MAPS.dungeon 80×80) + `biomes.ts`
- 📁 client: `Environment.tsx` (procedural blocky ground/mountains/lake/village/decor)
- 📁 client: `AmbientParticles.tsx` (fireflies/petals per biome)

**9 biomes** computed by `biomeAt(x, z, halfSize)`:
plains · forest · mountains · lake · swamp · village · wilderness · **desert** · **snow**

Each biome has its own ground/accent/trim colors (`BIOMES[id]`).
Monster spawns + decor density are biome-aware.

🔌 **Add a biome:** add to `BiomeId` union, `BIOMES`, and a check in `biomeAt`. Add spawns via `generateFieldSpawns` in maps.ts.

---

## 6. Day/night & weather

- 📁 server: `tickInner` updates `state.dayPhase` (8-min cycle) + `state.isNight` (when phase < 0.18 or > 0.78)
- 📁 server: weather rotates every 4 min (`sunny` / `cloudy` / `rainy`)
- 📁 server: `state.season` set on room create from current month (Christmas/Halloween/Songkran)
- 📁 client: `DayNight.tsx` (light + sky + clouds), `Weather.tsx` (rain particles)
- ⚡ Night: mob damage ×1.5
- ⚡ Rain: stamina regen ×1.6
- ⚡ Saturday: Dark Lord raid bosses get ×2 HP

---

## 7. Resources & gathering

Resources are implemented as static monsters with `aggroRange === 0`:
- `tree_node` (40 HP → wood_log + apple/berry chance)
- `rock_node` (60 HP → stone_chunk)
- `berry_bush` (12 HP → berry + seed)
- `ore_node` (100 HP → iron_ore, dungeon only)
- `crystal_node` (180 HP → crystal + dark_crystal chance, dungeon only)

Passive animals (aggroRange === -1, flee when hit):
- `chicken` / `pig` / `cow` → drop `raw_meat`

**Tools** (`wood_axe` / `iron_pickaxe`) multiply damage ×3 vs matching node type (server `handleAttack`).

🔌 Bots never attack resource nodes or passive animals — see `aggroRange <= 0` filter in `tickBots` and `handleAttack` guard.

---

## 8. Inventory & items

- 📁 shared: `items.ts` defines all `ITEMS` + `MONSTER_DROPS` + `GATHERED_RESOURCE_ITEMS` set
- 📁 server: `addToInventory`, `removeItem`, `countItem`, `handlePickup`, `handleUseItem`
- Slot count: **36** per character
- Item slots: `weapon` | `armor` | `consumable` | `material`
- Stackable items have `stack: 99` (or `9` for furniture)
- Auto-pickup at **2.3m** range; server enforces 2.5m + inventory-full warning

🔌 **Add an item:** add to `ITEMS` record in `items.ts`. Set relevant `slot`, `stack`, restore amounts.

---

## 9. Crafting

- 📁 shared: `recipes.ts` (17+ recipes with category cooking/potion/weapon/armor)
- 📁 server: `handleCraft` validates inputs, level, deducts, gives output
- 📁 client: `CraftingPanel.tsx` (tabs by category)
- Recipes have `inputs`, `output`, `category`, `minLevel`, `desc`

🔌 **Add a recipe:** push into `RECIPES` array. Server resolves via `RECIPES_BY_ID`.

---

## 10. Shops & economy

- 📁 shared: `npcs.ts` (`shop` kind NPCs with `shop: ShopEntry[]`)
- 📁 server: `handleShopBuy`, `handleShopSell` — must be within 4m of NPC
- 📁 utils: `defaultSellPrice(itemId)` — covers every item (50% of base price)
- Sell ratio: `SELL_RATIO = 0.5`

🔌 **Add a shop:** new NPC entry in `npcs.ts` with `kind: "shop"` and `shop` array.

---

## 11. Quests

- 📁 shared: `quests.ts` (definitions + `QUESTS_BY_GIVER` index)
- 📁 server: `handleQuestAccept`, `handleQuestTurnIn`, `onMonsterKilled` (auto-progresses kill quests)
- 📁 client: `QuestTracker.tsx` (transparent top-left panel) + `NpcDialog.tsx` (accept/turn-in)
- 📁 hook: `useQuests` subscribes to `questUpdate` messages

**Auto-grant:** brand-new characters get `q_slime_starter` automatically on first login.

Quest types: `kill` (target monster kind + count) | `collect` (item + count).

🔌 **Add a quest:** add to `QUESTS` record. Set `giver`/`turnIn` to NPC id, define `objective` + `reward`. Optional `next` chains.

---

## 12. Achievements & titles

- 📁 shared: `achievements.ts` (13 medals, each with `counter` key + `title` reward)
- 📁 server: `bumpAchievement(sid, counter, n)` — called on kills, gathering, crafting, fishing, taming, harvest, house-build, darklord defeat
- 📁 client: `AchievementsPanel.tsx` (progress bars + title equipper)
- Titles render above name in 3D label

Counters: `kills`, `trees`, `rocks`, `fishes`, `cooks`, `smiths`, `house`, `tames`, `harvests`, `biomes`, `darklord`

---

## 13. Pets & mounts

- Pets stored in `Player.petsJson` (JSON array `[{id, kind, rare, tamedAt}]`)
- Active pet: `Player.petKind` + `Player.petRare`
- Capacity: 8 pets per character
- Tame by feeding berries to chicken/pig/cow (3/5/7 berries respectively)
- 5% chance new pet is **rare** (golden tint, breeding bonus)
- 📁 server: `handleFeedAnimal`, `handleMount`, `handleBreedPets`, `setActivePet`, `releasePet`
- 📁 client: `PetBox.tsx` (swap/release/breed UI)

**Breeding:** combine 2 same-kind pets → 200 zeny → new offspring. If both parents rare → 75% rare; else 15%.

**Mount:** if `petKind` set and `mounted=true`, +55% speed.

---

## 14. Flying

- Unlock: `level >= 10` OR `darklord >= 1` in achievement counters
- 📁 server: `toggleFly` handler + stamina drain (7/s, halved with `glider` item)
- 📁 client: `FlyLift` in Scene wraps the player model
  - Lifts to Y=5m
  - Tilts forward (vel × π × 0.45) up to ~85° superman pose
  - Banks left/right (turn × 1.1)
  - Takeoff burst +2m
- 📁 client: `PlayerWings` (flap geometry) + `FlySparkles` (sparkle + wind streaks) + camera lift +5
- Speed multiplier: ×2.4 while flying

`glider` item (rare drop from Dark Lord): halves stamina cost, no auto-land on empty.

---

## 15. Fishing

- 📁 server: `handleStartFishing` (validates near water + sets timer), `resolveFishingForAll` in tick (random 3-8s wait, rolls outcome)
- 📁 client: `InteractionPrompt.tsx` shows 🎣 button when near water; progress bar + cancel
- Outcomes weighted: raw_fish (55%) / seaweed (25%) / raw_fish×2 (15%) / rare_fish (5%)
- Cancels if player moves

---

## 16. Farming

- 📁 shared: `PlantNode` schema + `plantStage(plantedAt, now)` (4 stages over 3 minutes)
- 📁 server: `handlePlantSeed` (deducts seed, creates PlantNode at player pos), `handleHarvestPlant` (yields berries + seeds when ripe)
- 📁 client: `Scene.tsx` `PlantView` renders 4 visual stages
- Limit: 8 plants per character

---

## 17. Housing & decoration

- House: `Player.houseSlot` (0-7) — one slot per character
- Buy from Carpenter Bren: 20 wood + 10 stone + 500 zeny
- House plots: 8 fixed positions around village (`HOUSE_SLOTS` in maps.ts)
- Houses are visible to all players (sync via Player schema)
- Respawn on death → at owned house if any

**Decoration:**
- 5 furniture types (bed/lamp/chair/plant/rug) crafted from wood/stone/berries
- Place via inventory hotbar tap → server records offset relative to house slot
- `Player.decorationsJson` = `[{itemId, x, z}]`, max 12 items
- 📁 client: `FurnitureLayer` + `Furniture` components in Scene

---

## 18. NPC dialog & interaction

- 📁 shared: `npcs.ts` (NPCS array with kind: shop / quest / info)
- 📁 client: `NpcDialog.tsx` — context-aware panel with tabs (Buy / Sell / Quests)
  - Carpenter NPC → `CarpenterPanel` (house build)
  - Tutor NPC → `TutorialPanel` (9 hint cards)
- Each NPC has a floating speech-bubble marker rendered in 3D (`NpcQuestMarker`)

---

## 19. Mail system

- 📁 prisma: `Mail` model (toName, fromName, subject, body, zeny, itemId, itemQty, read, claimed, createdAt)
- 📁 server: `sendMail`, `claimMail`, `readMail` + REST `GET /auth/mailbox/:name`
- 📁 client: `Mailbox.tsx` with inbox + compose tabs
- Recipients identified by character name (unique)

---

## 20. Leaderboard

- 📁 server: `leaderboard.ts` (in-memory Map, resets weekly on Monday) + REST `GET /leaderboard`
- Score = (kills ×3) + (darklord ×100) + (other counters ×1)
- 📁 client: `Leaderboard.tsx` polls `/leaderboard` every 8s, shows top 10 with 🥇🥈🥉

---

## 21. Daily login & seasonal events

**Daily login:**
- Tracked via `Character.lastLoginDate` (YYYY-MM-DD) + `loginStreak`
- 7-day reward cycle: zeny + items escalating each day
- 📁 client: `DailyReward.tsx` (popup on login)

**Seasonal:**
- `WorldState.season` set on room create from current month
- Currently: December = christmas · October = halloween · April = songkran
- 📁 client: HUD shows season badge

🔌 **Add a season:** add month → name mapping in `GameRoom.onCreate`. Add badge mapping in `HUD.tsx`.

---

## 22. Bot AI

**Dev bots (server-side):**
- Spawned when env `DEV_BOTS=N` (max 8) — fake players in `state.players`
- 📁 server: `spawnBot`, `tickBots`
- AI: find nearest hostile mob within 30m → walk + attack. Wander if no target. Auto-pickup nearby drops.
- Bots **never** attack resource nodes or passive animals (enforced via `aggroRange > 0` filter + `handleAttack` guard)

**Auto-bot (client-side, owned by player):**
- Toggle: B key or 🤖 button
- 📁 client: bot logic in `Scene.tsx` input loop
- Same restrictions as dev bots: hostile only, no resource gather
- Wanders 8-20m when no target found

---

## 23. Hint & tutorial

**Hint mascot (🐣):**
- 📁 client: `HintSystem.tsx`
- Starts **collapsed** on every load (no popup). Click 🐣 icon to expand.
- 11+ contextual hints based on player state (level, inventory, achievements)
- Dismissed hints persisted in localStorage (`dismissedHints` key)

**Interactive tutorial finger:**
- 📁 client: `TutorialFinger.tsx`
- 5 steps point at: minimap → attack button → inventory → crafting → menu
- Skip/next buttons; auto-advances when objective met (e.g. 1 kill)
- Dismissal persisted

---

## 24. Waypoint / navigation

- Click anywhere on minimap → set waypoint
- 📁 client: `Scene.tsx` `WaypointTrail` (12 floating star markers + destination pillar)
- 📁 client: `WaypointControls.tsx` — floating cancel button + ESC clear
- 📁 client: hints can set waypoint via "📍 พาฉันไป" button
- Auto-clears when player arrives within 1.5m

---

## 25. Emotes & social

- 12 emote types (👋 💖 😂 😭 😮 😴 💃 🙏 📸 👍 👎 🎵)
- 📁 client: `EmoteWheel.tsx` (T key or menu button)
- 📁 server: `emote` message broadcasts to all players in room
- 📁 client: `EmoteBubble` renders floating speech bubble above player

**Whisper:** type `/w PlayerName message` in chat → server routes to target only

---

## 26. Photo mode

- 📁 client: `PhotoMode.tsx`
- 5 CSS filters: vintage / dream / anime / neon / none
- Hides all UI overlays via body class `photo-mode`
- Capture: composites canvas + filter → PNG download

---

## 27. PWA / mobile

- 📁 `packages/client/public/manifest.webmanifest` (name, icons, theme)
- 📁 `packages/client/public/sw.js` (network-first, cache fallback for static assets)
- 📁 `packages/client/public/icon-192.svg` + `icon-512.svg` (cute SVG mascot)
- 📁 `packages/client/index.html` meta tags + `<link rel="manifest">`
- Touch detection in `Game.tsx` — disables shadows, lowers DPR

---

## 28. Persistence

**Per character (Prisma SQLite):**
- All Player schema fields persisted on `onLeave` + autosave every 20s
- Robust save: falls back to core fields if new fields aren't in Prisma client yet
- Mail persists offline (separate Mail table)

**Per client (localStorage):**
- `token` — JWT (1-year TTL)
- `characterId` — last selected character
- `dismissedHints` — hints user closed
- `settings` — graphics/sound toggles
- `drag:*` — draggable panel positions

---

## 29. Auth & multi-character

- 📁 server: `auth.ts` — Express router with `/auth/register`, `/auth/login`, `/auth/characters` (GET/POST/DELETE)
- JWT signed with `JWT_SECRET` env (1-year expiry)
- Max **3 characters per account**, each with unique name
- 📁 client: `Login.tsx` → `CharacterSelect.tsx` → `Game.tsx` flow
- Server kicks old session if same character connects again (no "already in game" errors)

---

## 30. Audio

All procedural — no audio files. 📁 `packages/client/src/sfx/sfx.ts`

**Action SFX:** hit / crit / miss / heal / skill (fire/ice/arrow/holy) / levelup / pickup / click / potion / death / monsterDie / footstep × 3 surfaces / fish / craft / achievement

**Ambient drones (per biome):**
- 7 chord presets — different sine frequencies + filtered noise bed
- `setAmbientBiome(biome)` switches; called from `BiomeWidgets.tsx`
- Volume controlled by SFX volume slider + ambient toggle

---

## 31. UI layout map

```
┌──────────────────────────────────────────────────┐
│  [HUD HP/SP card]              [Map][Minimap]   │ ← top-left + top-right
│  [hunger pills]                [gold + badges]   │
│                                                   │
│  [Quest Tracker]                                  │ ← top-11rem
│                                                   │
│              (3D scene + waypoint trail)          │
│                                                   │
│                       [Cancel waypoint]           │ ← top-3.5rem center (when set)
│                                                   │
│                                       [📦🔨📊]  │
│                                       [📜🏅🏆]  │ ← MenuBar
│                                       [📬🐾👥]  │   bottom-12rem
│                                       [💬😊📸]  │   right-3
│                                       [⚙👤⏻]   │
│                                                   │
│   [🐣 Hint mascot]                                │ ← bottom-24rem (collapsed)
│   [Chat panel + input]                            │ ← bottom-14rem left
│                                                   │
│                  [skill 1-4 hotbar]               │ ← bottom-[4.5rem] center
│                                                   │
│ [virtual                    [🌾🐎🪽🤚🧪]        │
│  joystick]   [item hotbar 1-8]  [🤖 ⚔ attack]   │ ← bottom-6
│                                                   │
│ ════════════ EXP bar (full width) ═══════════════ │ ← bottom-0
└──────────────────────────────────────────────────┘
```

All modal panels (Inventory, Crafting, Mailbox, etc.) cover full screen as transparent overlays with `data-no-screen-joy` attribute so background drags don't move the character.

---

## 🛣 Roadmap (not yet built)

Things explicitly designed for but not implemented — good first-PR opportunities:

- Guild / Crew system (shared chat + crest)
- More job advancement tiers (Lv50+)
- Player trade window (face-to-face)
- Auction house
- More NPC story quests + dialog trees
- Save replay highlights
- Server-persisted leaderboard (currently in-memory)
- Anti-cheat sanity checks (speed hack detection)
- Localization (i18n) — currently mixed Thai + English
- Larger world / multi-map streaming
