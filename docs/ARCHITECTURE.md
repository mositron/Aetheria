# Architecture

## Monorepo layout

```
game-v1/
├── package.json              # workspace root + pnpm onlyBuiltDependencies allowlist
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── shared/               # @game/shared — types + schemas + constants
│   │   └── src/
│   │       ├── index.ts      # re-exports everything
│   │       ├── constants.ts  # GAME_CONFIG, MONSTERS, ROOM_NAME
│   │       ├── schema.ts     # Colyseus Schema classes (Vec3, Player, Monster, ...)
│   │       ├── messages.ts   # Client↔Server message type definitions
│   │       ├── items.ts      # ITEMS + MONSTER_DROPS
│   │       ├── jobs.ts       # JOBS (novice→swordsman/mage/archer/acolyte/thief)
│   │       ├── stats.ts      # STR/AGI/VIT/INT/DEX/LUK + derived formulas
│   │       ├── maps.ts       # MAPS (field, dungeon) + portals
│   │       ├── npcs.ts       # NPCS array
│   │       ├── quests.ts     # QUESTS dict + QUESTS_BY_GIVER
│   │       └── status.ts     # STATUS_DEFS (poison, burn, stun, freeze, slow, regen)
│   │
│   ├── server/               # @game/server — Colyseus rooms + auth + db
│   │   ├── prisma/
│   │   │   ├── schema.prisma # User + Character models
│   │   │   └── dev.db        # SQLite (gitignored)
│   │   ├── .env              # JWT_SECRET, PORT
│   │   └── src/
│   │       ├── index.ts      # Express + Colyseus server boot
│   │       ├── auth.ts       # POST /auth/register + /auth/login + verifyToken
│   │       ├── db.ts         # Prisma client singleton
│   │       └── rooms/
│   │           └── GameRoom.ts  # the big one — see "GameRoom internals" below
│   │
│   └── client/               # @game/client — Vite + React + R3F
│       ├── index.html
│       ├── vite.config.ts    # proxy /auth to :2567
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── smoketest.mjs     # node script that joins the room and runs basic checks
│       └── src/
│           ├── main.tsx
│           ├── App.tsx       # if token → Game else Login
│           ├── Game.tsx      # connects to room, mounts Canvas + UI overlays
│           ├── index.css     # Tailwind + .panel/.btn-3d/.slot/.stat-pill
│           ├── store.ts      # Zustand: token, room, sessionId, chat, targetMonsterId, botMode, inventoryOpen, activeNpcId
│           ├── hooks/
│           │   ├── useQuests.ts     # subscribes to "questUpdate" messages
│           │   ├── useSfx.ts        # wires room events → SFX
│           │   └── useDraggable.ts  # generic drag + localStorage position
│           ├── sfx/sfx.ts           # procedural Web Audio synthesis
│           ├── scene/
│           │   ├── Scene.tsx              # main 3D scene + input loop + render players/monsters/drops/NPCs
│           │   ├── Environment.tsx        # ground texture + trees/rocks/bushes
│           │   ├── DayNight.tsx           # sun/moon/stars cycle
│           │   ├── SkillEffects.tsx       # listens "skillCast", spawns fire/ice/arrow/holy/poison/slash visuals
│           │   ├── DamageNumbers.tsx      # floating damage text
│           │   ├── useKeyboard.ts         # shared keys ref
│           │   └── models/
│           │       ├── HeroModel.tsx      # humanoid blocky character + walk/attack/cast anims
│           │       ├── SlimeModel.tsx
│           │       └── WolfModel.tsx
│           └── ui/
│               ├── Login.tsx
│               ├── HUD.tsx               # name/HP/MP/EXP stats + Menu panel (8 action buttons + bot + logout)
│               ├── Hotbar.tsx            # skill bar 1-4 with optimistic local-cast event
│               ├── Inventory.tsx         # 24-slot grid + equip/use/drop
│               ├── StatPanel.tsx         # 📊 character stats + stat point allocation
│               ├── Chat.tsx              # global chat with Enter to open
│               ├── NpcDialog.tsx         # shop (buy/sell) + quest tabs
│               ├── QuestLog.tsx          # active quests with progress
│               ├── PartyPanel.tsx        # invite/accept/members
│               ├── Minimap.tsx           # canvas 2D mini map
│               ├── CastBar.tsx           # brief skill bar at center bottom
│               ├── BossBar.tsx           # large boss HP at top when in fight
│               ├── LowHpVignette.tsx     # red screen edge when HP < 30%
│               ├── EventFeed.tsx         # "Level up!" notifications
│               ├── StatusBadges.tsx      # active status icons under HUD
│               ├── SettingsPanel.tsx     # SFX volume slider
│               └── JobPicker.tsx         # job change at Lv5
└── docs/                     # this folder
```

## Data flow

```
┌────────────────────┐    HTTP /auth/register|login     ┌──────────────────┐
│  Login.tsx (React) │ ───────────────────────────────▶ │ Express /auth    │
│                    │ ◀────── JWT token ─────────────── │ + Prisma User    │
└─────────┬──────────┘                                   └──────────────────┘
          │ token stored in localStorage
          ▼
┌────────────────────┐
│  Game.tsx          │
│  new Client(WS)    │   Colyseus.joinOrCreate("map_field" | "map_dungeon",
│  await joinOrCreate│         { token, mapId })
└─────────┬──────────┘
          │
          ▼ WebSocket
┌──────────────────────────────────────────────────────────────────────┐
│ GameRoom (one room per map, filterBy(["mapId"]))                     │
│  • onJoin verifies JWT, loads Character row, builds Player schema    │
│  • setSimulationInterval(tick, 50ms) — server-authoritative          │
│  • State (WorldState) auto-syncs via Colyseus delta encoding         │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ state sync ~20Hz + ad-hoc messages
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Client Scene.tsx                                                     │
│  • room.state.players/monsters/drops are MapSchema<...>              │
│  • Per-add/remove: getStateCallbacks(room).onAdd / onRemove          │
│  • Per-frame: useFrame reads schema directly, mutates Three refs     │
│  • Input loop (50ms setInterval): sends "input" with mx/mz/rotY      │
│  • Click events send "attack" / "skill" / "pickup" / "shopBuy" / ... │
└──────────────────────────────────────────────────────────────────────┘
```

## GameRoom internals (server)

`packages/server/src/rooms/GameRoom.ts` is the heart. It:

### State
- `WorldState` (a `Schema`) syncs to clients: `mapId`, `players: MapSchema<Player>`, `monsters: MapSchema<Monster>`, `drops: MapSchema<GroundItem>`
- Per-room private maps (not synced): `intents`, `lastAttack`, `lastSkill`, `playerUserId`, `playerQuests`, `parties`, `playerParty`, `partyInvites`, `monsterSpawn`, `statusTickAcc`

### Lifecycle
- `static onAuth` no-op (Colyseus 0.16 requires static; real auth happens in onJoin)
- `onJoin(client, { token })`: verifies JWT → loads Character → builds Player → sends `questUpdate`
- `onLeave`: saves to DB + clears party + cleans maps

### Message handlers
- `input` — sets per-player movement intent (server applies in tick)
- `attack` — basic melee on monster (range/cooldown/hit/crit/miss roll)
- `skill` — validates job skill + MP + cooldown + range, deals damage + applies status, broadcasts "skillCast"
- `equip/unequip/useItem/dropItem/pickup` — inventory mutations + stat recalc
- `shopBuy/shopSell` — NPC distance check + zeny transfer + inventory add/remove
- `questAccept/questTurnIn` — manages per-player `PlayerQuestState`
- `partyInvite/partyAccept/partyLeave` — party CRUD
- `allocStat` — spends statPoints
- `changeJob` — one-way at Lv5 from novice
- `chat` — broadcasts to room

### Tick loop (`setSimulationInterval`, 50ms / 20Hz)
1. `tickStatuses()` — poison/burn DoT, status expiry, regen heal
2. MP/HP regen every 1s (not in combat aware — flat)
3. For each player: apply movement intent (respects stun + speedMult), portal check
4. For each monster: aggro nearest player, chase/melee, attack on cooldown

### Combat math
- `derived(stats, level)` in `shared/stats.ts` computes hit, flee, aspd mult, crit %, atk bonus, etc.
- Attack hit chance: `clamp(0.8 + (hit - flee) * 0.03, 0.05, 0.99)`
- Crit: roll `Math.random()*100 < derived.crit` → dmg × 2
- ASPD: `cooldown = ATTACK_COOLDOWN_MS * aspdMult` where `aspdMult = max(0.4, 1 - agi*0.006)`

### Persistence (Prisma → SQLite)
- Saves on `onLeave` and on warp between maps
- Fields: job, hp/maxHp/mp/maxMp/atk/def, level/exp, weapon/armor, mapId, pos, inventoryJson, stats, statPoints, zeny, questsJson

### Multiple maps = multiple rooms
- `gameServer.define("map_field", GameRoom, { mapId: "field" }).filterBy(["mapId"])`
- One GameRoom instance per map, filtered so clients with `mapId: "field"` only match field rooms
- Warp = save → leave → client receives `warp` msg → joins different room

## Client rendering strategy (perf-critical)

The key insight is that Colyseus Schema instances **mutate in place** when state syncs. Reading `p.hp` always returns current value. So:

- **React renders Scene.tsx only on add/remove** (via `$(room.state).players.onAdd/onRemove`)
- **All dynamic visuals run in `useFrame`** — read schema fields directly, mutate Three.js refs
  - Position lerp: `ref.position.lerp(tmpVec.set(p.pos.x, 0, p.pos.z), 0.25)`
  - HP bar: `LiveBar` reads via `getValue` callback, scales mesh.scale.x in useFrame
  - Label text: only regen canvas texture when text actually changes
- **Component is wrapped in React.memo** with `() => true` (never re-render from props)
- **Pre-allocated tmp Vector3** to avoid GC pressure
- Status badges, BossBar, HUD use setInterval at 250-500ms (DOM updates are cheap)

This achieves 60fps with 6+ monsters + 3 players + decorations + skill effects.

## CSS theme

`packages/client/src/index.css` defines reusable design tokens:

- `.panel` — glassmorphism: rgba bg + backdrop-blur + cyan/violet neon edge
- `.panel-title` — title bar with bottom border + chip-like accent
- `.panel-corners::before/::after` — small glowing dots (cyan + violet)
- `.btn-3d` — gradient button (palettes: indigo/rose/amber/emerald/slate)
- `.slot` — inventory cell with hover glow
- `.stat-pill` — small bordered chip

Modern theme: cyan (#22d3ee) + violet (#a855f7) accents on translucent slate.

## Coordinate system

- `pos.x`, `pos.z` — horizontal plane (`y` axis up but unused for player position)
- World size: 100×100 (field) or 60×60 (dungeon)
- Player visually sits at y = 0 (model defines its own offset)
- Camera orbit: `cam = { yaw, pitch, dist }`, computed each frame

## Networking efficiency

- Colyseus 0.16 uses Schema 3.x with delta encoding — only changed fields go over the wire
- Patch rate set to 20Hz (`setPatchRate(50ms)`)
- Client input is sent every 50ms (mx/mz/rotY/seq)
- No client-side prediction — server is authoritative for player position
- Smoothing handled client-side via `position.lerp(target, 0.25)`
