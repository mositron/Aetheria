# Features (complete)

Format: **Feature** — what it does → server file → client file(s).

## Core / world

- **Account + character persistence** — JWT 365d, bcrypt, Prisma SQLite → `server/src/auth.ts` + `prisma/schema.prisma`
- **Multiplayer realtime sync** — Colyseus 0.16 schema 3.x, state delta @ 20Hz → `server/src/rooms/GameRoom.ts` + `client/src/scene/Scene.tsx`
- **Multiple maps** — separate Colyseus rooms per map, walk into portal to warp; state saved before warp → `shared/src/maps.ts` + GameRoom
- **Day/night cycle** — 5-min sun rotation in Field map, sky color lerps day→sunset→night, stars + moon at night → `client/src/scene/DayNight.tsx`
- **Environment** — procedural ground texture (grass/stone), 40+ trees/rocks/bushes scattered deterministically → `client/src/scene/Environment.tsx`
- **Fog** for depth → set inside Environment

## Combat

- **Click-to-target + auto-attack** — click monster to target, walks into range, attacks on cooldown → Scene.tsx input loop
- **Click-to-walk** — click ground to walk there (point-and-click style) → Scene.tsx
- **Click-to-pickup** — click loot to walk and grab → Scene.tsx
- **Basic attack with hit/miss/crit/ASPD** — hit roll vs flee, crit roll vs LUK-derived %, AGI lowers cooldown → server handleAttack + shared/stats.ts derived()
- **Floating damage numbers** — white normal, yellow crit (with !), gray "miss", green +heal → `client/src/scene/DamageNumbers.tsx`
- **Server-broadcast skillCast** triggers VFX on all clients → SkillEffects.tsx
- **Skill effects (procedural)** — fire bolt projectile + explode, frost burst ring, holy flash, arrow projectile, poison puff, heal ring, slash arc → SkillEffects.tsx
- **Casting animation** — both arms raised + glowing cyan orb above + spinning ring at feet + pulsing point light → HeroModel.tsx
- **Optimistic cast trigger** — local "local-cast" CustomEvent fires immediately when player sends skill → Hotbar.tsx + Scene.tsx
- **Ranged auto-engage** — Mage/Archer stop at skill range, auto-cast primary skill if MP allows → Scene.tsx input loop
- **Status effects** — poison/burn DoT, stun/freeze prevents action, slow halves speed, regen heals → shared/status.ts + GameRoom tickStatuses() + StatusBadges.tsx
- **Skill applies status** — e.g. Firebolt → Burn 3s, Frost Nova → Freeze 1.5s, Envenom → Poison 5s, Holy Smite → Stun (50% chance) → jobs.ts SkillDef.status
- **Self-status** — Heal applies Regen on self → jobs.ts SkillDef.selfStatus
- **Death animation** — entity fades + sinks + rotates over 1.5s → Scene.tsx MonsterView useFrame
- **Player death + respawn** — 5s respawn at (0,0), full heal, status cleared → GameRoom

## Jobs & progression

- **5 jobs** (after Lv5 from Novice):
  - **Swordsman** ⚔ — Bash (×1.8 single), Whirlwind (×1.2 AoE r3)
  - **Mage** 🪄 — Firebolt (range 8, ×2.2 + Burn 3s), Frost Nova (range 6, AoE r3.5 + Freeze 1.5s)
  - **Archer** 🏹 — Arrow Shot (range 12, ×1.5), Double Strafe (range 10, ×2.4)
  - **Acolyte** ✨ — Heal (self, ×2 + Regen 5s), Holy Smite (range 6, ×1.8 + Stun 1s 50%)
  - **Thief** 🗡 — Envenom (×1.4 + Poison 5s), Back Slide (×2.5, no MP)
- **Stat system** — STR/AGI/VIT/INT/DEX/LUK, 3 points per level → shared/stats.ts + StatPanel.tsx
- **Derived stats** — VIT→HP+DEF, INT→MP, AGI→ASPD&flee, DEX→hit, LUK→crit → shared/stats.ts derived()
- **EXP curve** — `25 + lv²×5`, easy early then steeper → shared/constants.ts EXP_PER_LEVEL
- **Level up** — full heal, stat points awarded, MaxHP/MP/ATK growth based on job → GameRoom grantExp + recalcStats
- **Job change UI** — modal at Lv5 when still novice → JobPicker.tsx

## Inventory & items

- **24-slot inventory** with stacking (consumables/materials up to 99) → shared/schema.ts Player.inventory
- **8 item types** — weapons, armor, consumables, materials; see CONTENT.md
- **Equip/unequip** — recomputes ATK/DEF, swaps previous → GameRoom handleEquip/handleUnequip
- **Use consumable** — HP potion restores 40 hp → handleUseItem
- **Drop on ground** — right-click in inventory, 60s lifetime → handleDrop + spawnGroundItem
- **Loot drops from monsters** — chance-based per monster kind → shared/items.ts MONSTER_DROPS
- **Quick-use potion** — H key uses first hp_potion in inventory → Scene.tsx keydown

## NPC, shop, quests, zeny

- **3 NPCs** with positions + dialog + shops/info → shared/npcs.ts NPCS
- **Click NPC** opens dialog panel (must be within 4m) → NpcDialog.tsx
- **Buy/Sell tabs** — shops list items + price, sell at 50% (SELL_RATIO) → GameRoom handleShopBuy/Sell + NpcDialog
- **Zeny currency** — start 500z, persists; shown in HUD + NPC dialog → schema + UI
- **Quest system** — 3 starter quests (kill 5 slimes, kill 3 wolves, collect 5 jellies) → shared/quests.ts
- **Quest tab in NPC dialog** — Accept (with level req) / Turn in / Completed → NpcDialog.tsx
- **Per-player quest state** — stored in DB as questsJson, sent via "questUpdate" → server + useQuests hook
- **Quest progress** — on monster kill (server onMonsterKilled) bumps counter for "kill" objectives → GameRoom
- **Quest log UI** — top-right, drag-able, collapsible, shows active quests with progress bars → QuestLog.tsx
- **Quest reward** — exp + zeny + optional item; uses grantExp (shares with party) → handleQuestTurnIn

## Party system

- **4-person max** — invite by player name → party panel
- **Invite UI** — modal popup at center, auto-focus input, Enter to send → PartyPanel.tsx
- **Invite request** — recipient sees "X invites you" modal with Accept/Decline → PartyPanel.tsx
- **Shared EXP** — when grantExp called, splits among party members within 30m → GameRoom grantExp
- **Member HP panel** — left side, shows each member's HP bar live → PartyPanel.tsx (polls via partyUpdate broadcast)
- **Auto-disband** — when last member leaves → handlePartyLeave

## UI / UX

- **Modern glassmorphism panels** — backdrop-blur + cyan/violet neon accent + small corner dots → index.css `.panel`
- **Draggable windows** — drag title bar to move, position saved to localStorage → useDraggable hook
- **8-button Menu panel** (Controls) — Inv/Stats/Quest/Party/Pot/Set/Chat/Map + Bot toggle + Keybinds collapsible → HUD.tsx
- **HUD** — name + Lv + job, HP/MP/EXP gradient bars, ATK/DEF/Zeny chips → HUD.tsx
- **Minimap** — 130×130 canvas, shows portals/NPCs/monsters/players + direction arrow → Minimap.tsx
- **Skill hotbar 1-4** — bottom center, MP cost + cooldown indicator → Hotbar.tsx
- **Stat panel** (C) — 6 stats with +/- buttons, badge for unspent points, derived stats summary → StatPanel.tsx
- **Inventory** (I) — 24 grid + equipment slots + click-equip/use, right-click drop → Inventory.tsx
- **Chat** (Enter) — global broadcast, last 50 lines → Chat.tsx
- **Quest Log** (Q) — collapsible, only shows active → QuestLog.tsx
- **Settings** (O) — SFX volume slider, stored in localStorage → SettingsPanel.tsx
- **Event Feed** — center-top, "⭐ {name} reached Lv X!", quest rewards → EventFeed.tsx
- **Boss HP banner** — appears center-top when near Dark Lord (25m) → BossBar.tsx
- **Low HP vignette** — red pulsing screen edge when HP < 30% or dead → LowHpVignette.tsx
- **Cast bar** — brief progress bar when own skill activates → CastBar.tsx
- **Status badges** — active effects icons under HUD with countdown → StatusBadges.tsx
- **Cursor hints** — crosshair on monster hover, grab on item hover, pointer on NPC → Scene.tsx setCursor
- **Selection ring** — yellow rotating ring under targeted monster → Scene.tsx MonsterView
- **Click marker** — yellow ring at click destination, fades out → Scene.tsx ClickMarker

## Camera

- **Orbit camera** — right-click drag to rotate (yaw + pitch), wheel to zoom → Scene.tsx
- **WASD relative to camera** — pressing W moves toward what camera faces, not world-fixed → Scene.tsx
- **Follow self** — smooth lerp behind player → Scene.tsx useFrame

## Sound

- **Procedural SFX (Web Audio)** — hit, crit, miss, heal, skillFire/Ice/Arrow/Holy, levelup arpeggio, pickup, potion, click, death, monster die → sfx/sfx.ts
- **Auto-wired** — useSfx() in Game.tsx listens to all room messages + state changes → hooks/useSfx.ts
- **Volume control** — Settings panel slider, persisted to localStorage → sfx.ts getSfxVolume/setSfxVolume

## Bot mode

- **Toggle (B)** — auto-pickup nearest drop (≤8m), auto-target nearest live monster (≤20m), auto-engage with primary skill → Scene.tsx input loop
- **Manual override** — pressing WASD pauses bot temporarily → Scene.tsx

## Models (procedural)

- **HeroModel** — head + torso + arms + legs blocky, walk swing, idle bob, attack lunge, casting raised arms + orb + ring + light, death fall → HeroModel.tsx
- **SlimeModel** — squashy ball + eyes, idle bounce, attack lunge with squash, death squash flat → SlimeModel.tsx
- **WolfModel** — 4 legs + body + snout + ears + tail, walk swing, attack pounce + head dip, death tip-over → WolfModel.tsx
- **Orc** — reuses HeroModel green 1.2x scale → Scene.tsx
- **Dark Lord** — reuses HeroModel purple 2.2x scale + purple point light → Scene.tsx
- **NPC** — uses HeroModel with NPC color + bouncing ! sphere above + name label → Scene.tsx NpcView
