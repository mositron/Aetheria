<div align="center">

# 🌸 Aetheria — Cute Web MMORPG

**A blocky, anime-style MMORPG that runs entirely in your browser.**
Open world · Survival · Crafting · Pets · Farming · Fishing · Flying · Housing

🎮 Desktop + Mobile · 🧪 Local multiplayer · 🎨 100% procedural (no asset downloads)

[![Made with TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-000?style=flat&logo=three.js&logoColor=white)](https://threejs.org/)
[![Colyseus](https://img.shields.io/badge/Colyseus_0.16-1d2d44?style=flat)](https://www.colyseus.io/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-fde047?style=flat)](#-license)

</div>

---

## 🌈 What is Aetheria?

A solo-built MMORPG playable in the browser — built using **TypeScript everywhere**, **Three.js** procedural geometry, and a **Colyseus** server.
Designed cute / anime-style with pastel UI, chibi characters with blinking eyes, and angel-wing flight.

```
✨ Open world  ·  ⚔ Combat  ·  🌾 Survival
🐾 Pets       ·  🏡 Housing ·  🎣 Fishing
🪽 Flying     ·  🔨 Craft   ·  🏆 Achievements
```

> Built solo from scratch in a focused sprint with [Claude Code](https://claude.com/claude-code).
> No third-party game engine, no asset packs — all 3D models, sounds, and animations are generated procedurally in code.

---

## ⚡ Quick start

```bash
# 1. Clone
git clone https://github.com/mositron/Aetheria.git
cd Aetheria

# 2. Install (pnpm 10+ required — npm/yarn won't link workspaces)
pnpm install

# 3. Copy env + initialize SQLite database
cp packages/server/.env.example packages/server/.env
pnpm --filter @game/server exec prisma db push

# 4. Run everything
pnpm dev
```

Open **http://localhost:5173** → register → play.
Open another tab/browser → second account → both players see each other in real time.

> 💡 **Tip:** spawn AI bots to populate the world when playing solo:
> ```bash
> # PowerShell:  $env:DEV_BOTS = "3"; pnpm dev
> # bash/zsh:    DEV_BOTS=3 pnpm dev
> ```

---

## 🎮 Feature highlights

<table>
<tr><th width="50%">🌍 World</th><th>👤 Character</th></tr>
<tr><td>

- 200 × 200 open world with **9 biomes**
  - ทุ่งดอกไม้ · ป่ามหัศจรรย์ · ภูเขาหิน
  - ทะเลสาบ · บึง · หมู่บ้าน
  - ทะเลทราย · ดินแดนหิมะ · แดนลึกลับ
- Day/night cycle (8 min · stronger night mobs)
- Weather: ☀ sunny · ☁ cloudy · 🌧 rainy
- Seasonal events: 🎄 ฮาโลวีน · สงกรานต์
- Procedural environment + fluffy clouds
- Random procedural dungeon
- Boss world events every ~10 min

</td><td>

- 3 characters per account
- Custom **chibi appearance**: skin, hair (6 styles), eyes, shirt, pants
- 🎀 **Accessories**: hat, glasses, scarf (with color dyes)
- 6 stats (STR/AGI/VIT/INT/DEX/LUK) + statpoints
- 5 starter jobs → **5 second-class** advancements at Lv30
- Blinking eyes + cheek blush + bouncy animations
- Persistent across sessions (Prisma SQLite)

</td></tr>

<tr><th>⚔ Combat</th><th>🌾 Survival</th></tr>
<tr><td>

- Server-authoritative tick at 20 Hz
- Auto-target nearest hostile mob
- Skills with **cooldown sweep** visual
- Status effects: poison · burn · stun · freeze · slow · regen
- **Biome spells** (Ice Lance / Vine Root / Rock Throw / Poison Spore / Shadow Bolt)
- Critical hits + dodge formulas
- Weekly raid boss (×2 HP on Saturdays)

</td><td>

- Hunger / thirst / stamina bars
- **No starvation death** — only debuffs
  - Hungry → slower + weaker hits
  - Thirsty → hallucination + miss chance
  - Empty stamina → can't sprint/fly
- Drink water at lakes
- Eat food to restore
- Inventory weight off — 36-slot bag

</td></tr>

<tr><th>🐾 Pets & Mounts</th><th>🪽 Flying</th></tr>
<tr><td>

- Tame **chickens / pigs / cows** with berries
- Up to **8 pets** per character
- 5% chance for ✨ **rare golden** variants
- **Breed** 2 same-kind pets → offspring (200z)
- Active pet **follows trotting** beside you with 💗
- Tap 🐎 to **mount** → +55% speed

</td><td>

- Unlock at **Lv10** OR defeat the Dark Lord
- Tap 🪽 → angel wings + halo appear
- **Superman pose** — tilts forward at speed
- Banks left/right when turning
- Camera follows up high
- Drains stamina (`glider` cape halves cost)

</td></tr>

<tr><th>🏡 Housing</th><th>🎣 Fishing & 🌾 Farming</th></tr>
<tr><td>

- 8 house plots around the village
- Buy from **Carpenter Bren** (20 wood + 10 stone + 500z)
- 5 furniture types: bed · lamp · chair · plant · rug
- **Decorate** inside your house (12 max items)
- Visit other players' houses by tapping them
- Death → respawn at your house

</td><td>

- 🎣 Fish at the lake (3-8s wait)
  - 55% raw_fish · 25% seaweed · 15% double · 5% 🐠 rare_fish
- 🌱 Plant berry seeds (3 min grow)
- 4 visual growth stages
- Harvest → 2-4 berries + 1-2 new seeds
- Up to 8 plants per player

</td></tr>

<tr><th>🔨 Crafting & Economy</th><th>🏆 Progress</th></tr>
<tr><td>

- **17+ recipes** in 4 categories:
  - 🍖 Cooking · 🧪 Potions · ⚔ Weapons · 🛡 Armor
- Tools (🪓 axe / ⛏ pickaxe) gather 3× faster
- All items sellable at shop NPCs
- 🎁 Gacha box (rare boss drop) — 10 prize tiers
- Zeny + materials economy

</td><td>

- 13 **Achievements** with rewards + unlocked **titles**
- Weekly **Leaderboard** (top 10, resets Monday)
- 🎁 **Daily login** rewards (7-day streak)
- Real-time **quest tracker** (transparent panel)
- Auto-grant **starter quest** to new characters

</td></tr>

<tr><th>📱 UI & UX</th><th>🤝 Social</th></tr>
<tr><td>

- Mobile-first responsive layout
- 📲 **PWA install** to home screen
- Virtual joystick + screen-drag steering
- Layout-independent shortcuts (Thai/RU/AR)
- 🐣 Helpful hint mascot (collapsed by default)
- 👆 Interactive tutorial finger
- 📸 **Photo mode** — 5 filters + PNG export
- 🌗 Settings: graphics/sound/sensitivity

</td><td>

- 💬 Global chat with `/w name msg` whispers
- 📬 **Mailbox** — send zeny + items to anyone (persists offline)
- 👥 Party invites
- 🎭 **12 emotes** with floating bubbles
- 🤖 Auto-bot mode (combat + monster loot)
- ✋ Visit friend's house (teleport)

</td></tr>
</table>

---

## 🏗 Architecture

```
Aetheria/
├── packages/
│   ├── shared/              @game/shared
│   │   └── src/             Types, schemas, items, jobs, biomes, recipes, achievements
│   │
│   ├── server/              @game/server  →  port 2567
│   │   ├── prisma/          SQLite schema + dev.db
│   │   └── src/
│   │       ├── index.ts     Express + Colyseus boot
│   │       ├── auth.ts      /auth routes + JWT
│   │       ├── leaderboard.ts  Weekly in-memory scoring
│   │       └── rooms/GameRoom.ts  ⚡ all game logic (~2k lines)
│   │
│   └── client/              @game/client  →  port 5173
│       ├── public/          PWA manifest, sw.js, icons
│       └── src/
│           ├── App.tsx      Login → CharacterSelect → Game
│           ├── Game.tsx     Mounts Canvas + all UI overlays
│           ├── store.ts     Zustand (token, character, waypoint, bot mode)
│           ├── scene/       Three.js: Scene, Environment, models, particles
│           ├── ui/          30+ React panels (HUD, Inventory, Crafting, ...)
│           ├── sfx/sfx.ts   Procedural Web Audio
│           └── utils/keyMatch.ts  Layout-independent keyboard
│
└── docs/
    ├── SYSTEMS.md           📚 Every system explained — start here
    ├── ARCHITECTURE.md      Stack + data flow + perf decisions
    ├── DEVELOPMENT.md       Conventions + how to add content
    ├── FEATURES.md          Feature matrix
    ├── GAMEPLAY.md          Mechanics + balance numbers
    ├── CONTENT.md           Items, monsters, maps, quests, jobs
    ├── CONTROLS.md          Keybinds reference
    └── CHANGELOG.md         Build history
```

### Tech stack

| Layer | Choice |
|---|---|
| **Language** | TypeScript across all packages |
| **Monorepo** | pnpm workspaces (`shared` / `server` / `client`) |
| **Server** | Node.js + Colyseus 0.16 + Express + Prisma + SQLite + JWT |
| **Client** | Vite + React 19 + Three.js (via @react-three/fiber + drei) |
| **State** | Zustand (client) + Colyseus Schema 3.x (server) |
| **Style** | Tailwind CSS + custom GameFrame component |
| **Audio** | Web Audio API — fully procedural, no audio files |
| **3D models** | Pure Three.js box/sphere primitives — no GLB / sprites |
| **Hot reload** | tsx watch (server) + Vite HMR (client) |

> Server is authoritative for player position, combat, drops, inventory, quests.
> Client interpolates positions, renders, and emits intent messages.

---

## 🎮 Controls

<details>
<summary><b>🖥 Desktop (keyboard + mouse)</b></summary>

### Movement
| Key | Action |
|---|---|
| **WASD** / arrow keys | Move (works on any keyboard layout — Thai / Russian / Arabic / etc) |
| Mouse left-click ground | Walk-to-point |
| Right-click + drag | Orbit camera |
| Mouse wheel | Zoom in / out |

### Combat
| Key | Action |
|---|---|
| Click monster | Target / auto-engage |
| **Space** | Attack target |
| **1 / 2 / 3 / 4** | Cast job skills |
| **F** | Pickup nearby item · cast fishing line at water |
| **H** | Quick HP potion |
| **E** | Drink water at lake |

### Panels
| Key | Action |
|---|---|
| **I** | Inventory |
| **K** | Crafting |
| **C** | Stats |
| **Q** | Quest log |
| **T** | Emote wheel |
| **P** | Photo mode |
| **O** | Settings |
| **B** | Toggle auto-bot |
| **Enter** | Chat (`/w PlayerName message` for whisper) |
| **Esc** | Close panel · cancel waypoint |

</details>

<details>
<summary><b>📱 Mobile / touch</b></summary>

- **Drag anywhere on the game canvas** → virtual joystick steers character
- **Joystick (bottom-left)** → alternate steering ring (auto-shown on touch)
- **Tap minimap** → set waypoint · floating 3D trail shown
- **Action buttons (bottom-right)**:
  ⚔ attack · 🤚 pickup · 🧪 potion · 🪽 fly · 🌾 feed pet · 🐎 mount · 🤖 auto-bot
- **Menu icons (right column)**:
  กระเป๋า · คราฟต์ · สเตตัส · เควสต์ · เหรียญ · อันดับ · จดหมาย · สัตว์ · ปาร์ตี้ · แชต · อิโมท · ถ่ายภาพ · ตั้งค่า · ตัวละคร · ออก
- **Item hotbar (bottom-center)** → tap to use/equip (auto from inventory)
- **Skill hotbar (above)** → tap to cast 1-4

</details>

---

## 🧰 Requirements

| Tool | Version |
|---|---|
| Node.js | 18+ (recommended 20+) |
| pnpm | 10+ (`npm i -g pnpm`) |
| OS | Windows / macOS / Linux |
| Browser | Chrome / Edge / Firefox / Safari (latest) |
| RAM | 2 GB+ free |
| GPU | Any WebGL 2 capable (integrated is fine) |

---

## 📂 Scripts cheatsheet

```bash
# Run everything (server + client concurrently)
pnpm dev

# Individually
pnpm --filter @game/server dev
pnpm --filter @game/client dev

# Database
pnpm --filter @game/server exec prisma db push       # apply schema
pnpm --filter @game/server exec prisma generate      # regenerate client
pnpm --filter @game/server exec prisma studio        # GUI explorer

# Testing
pnpm --filter @game/client exec node smoketest.mjs   # auto-join smoke test

# Build (production)
pnpm --filter @game/server build
pnpm --filter @game/client build
```

---

## 📚 Documentation

| File | About |
|---|---|
| **[docs/SYSTEMS.md](docs/SYSTEMS.md)** | 🌟 **Start here.** Every system explained with files + extension points |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, monorepo, server/client flow |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Conventions + how to add content |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature matrix |
| [docs/GAMEPLAY.md](docs/GAMEPLAY.md) | Mechanics + formulas + balance |
| [docs/CONTENT.md](docs/CONTENT.md) | Items, monsters, maps, quests, jobs reference |
| [docs/CONTROLS.md](docs/CONTROLS.md) | Keybinds + UI panels |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | What was built when |
| [CLAUDE.md](CLAUDE.md) | Notes for Claude Code AI sessions |

---

## 🐛 Troubleshooting

<details>
<summary><b>"Cannot connect to server"</b></summary>

- The server must be running on port 2567. Run `pnpm dev` and wait for `[server] listening on http://localhost:2567`.
- If port 2567 is taken, change `PORT` in `packages/server/.env`.
</details>

<details>
<summary><b>"schema mismatch" / state sync timeout</b></summary>

After pulling code that changed `packages/shared/src/schema.ts`:
1. Stop the server (Ctrl+C)
2. `pnpm --filter @game/server exec prisma db push` (if Prisma schema changed)
3. `pnpm --filter @game/server exec prisma generate` to rebuild the Prisma client
4. Restart with `pnpm dev`
</details>

<details>
<summary><b>Prisma DLL locked on Windows</b></summary>

Stop the running server first (Ctrl+C) before running `prisma generate` or `prisma db push`. The DLL is held by the running Node process.
</details>

<details>
<summary><b>Inventory full / can't pick up loot</b></summary>

You've hit the 36-slot limit. Drop, sell, or use items to make room — the game shows "🎒 กระเป๋าเต็ม" when this happens.
</details>

<details>
<summary><b>Game loads but everything is black / invisible</b></summary>

- Browser may be blocking WebGL. Open `chrome://gpu` and confirm hardware acceleration is on.
- Try a different browser (Chrome / Edge work best).
- Turn graphics down in **Settings → Shadows off + High Quality off**.
</details>

---

## 🔒 Security & deployment notes

This is a **local development project**, not hardened for public deployment. Before shipping:

- ⚠ Replace the placeholder `JWT_SECRET` in `.env` with a **real random string**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- ⚠ Switch SQLite → PostgreSQL / MySQL for production
- ⚠ Put the server behind HTTPS (Nginx / Cloudflare)
- ⚠ Add rate limiting on `/auth/register` and `/auth/login`
- ⚠ Review bcrypt cost factor + JWT expiry
- ⚠ Never commit `packages/server/.env` or `packages/server/prisma/dev.db` — both are gitignored

The included `.env.example` is safe to commit; the actual `.env` is not.

---

## 🤝 Contributing

PRs and forks welcome — this is a learning + portfolio project.
Read **[docs/SYSTEMS.md](docs/SYSTEMS.md)** before adding features — chances are the foundation is already there.

**Quick reference for adding content:**

| Want to add | File to edit |
|---|---|
| Item | `packages/shared/src/items.ts` |
| Monster | `packages/shared/src/constants.ts` + drops in `items.ts` + spawn in `maps.ts` |
| Job / skill | `packages/shared/src/jobs.ts` |
| Quest | `packages/shared/src/quests.ts` |
| NPC | `packages/shared/src/npcs.ts` |
| Biome | `packages/shared/src/biomes.ts` |
| Achievement | `packages/shared/src/achievements.ts` |
| Recipe | `packages/shared/src/recipes.ts` |
| Particle/effect | `packages/client/src/scene/AmbientParticles.tsx` etc. |
| UI panel | `packages/client/src/ui/` |

**Coding conventions:**
- TypeScript everywhere — strict mode on
- Server-authoritative — never trust client values
- Add to `docs/CHANGELOG.md` when shipping significant work
- Follow existing UI tone: pastel, rounded, cute (use `GameFrame` component)

---

## 📜 License

**MIT** — Free to use, learn from, fork, and modify.
Procedurally generated assets included. Code authored by the project owner with AI assistance.

---

<div align="center">

Made with 💖 and a lot of `pnpm dev`.

If you find a bug or have an idea, open an issue or PR on GitHub.

</div>
