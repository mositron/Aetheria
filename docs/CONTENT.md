# Game content reference

All defined in `packages/shared/src/`.

## Items (items.ts)

| ID | Name | Slot | Stats | Icon | Stack |
|---|---|---|---|---|---|
| wood_sword | Wooden Sword | weapon | ATK +3 | 🗡 | 1 |
| iron_sword | Iron Sword | weapon | ATK +8 | ⚔ | 1 |
| apprentice_staff | Apprentice Staff | weapon | ATK +5 | 🪄 | 1 |
| leather_armor | Leather Armor | armor | DEF +3 | 🥋 | 1 |
| iron_armor | Iron Armor | armor | DEF +8 | 🛡 | 1 |
| dragon_plate | Dragon Plate | armor | DEF +20 | 🐲 | 1 |
| blade_of_dawn | Blade of Dawn | weapon | ATK +25 | ⚜ | 1 |
| hp_potion | HP Potion | consumable | +40 HP | 🧪 | 99 |
| slime_jelly | Slime Jelly | material | — | 🟢 | 99 |
| wolf_fang | Wolf Fang | material | — | 🦷 | 99 |
| orc_tusk | Orc Tusk | material | — | 🦴 | 99 |
| dark_crystal | Dark Crystal | material | — | 🔮 | 99 |

## Drops (items.ts MONSTER_DROPS)

| Monster | Drop | Chance |
|---|---|---|
| slime | slime_jelly | 80% |
|       | hp_potion | 15% |
|       | wood_sword | 5% |
| wolf | wolf_fang | 70% |
|      | hp_potion | 25% |
|      | leather_armor | 8% |
|      | iron_sword | 3% |
| orc | orc_tusk | 60% |
|     | hp_potion | 30% |
|     | iron_sword | 10% |
|     | iron_armor | 5% |
| darklord | dark_crystal | 100% |
|          | blade_of_dawn | 50% |
|          | dragon_plate | 50% |
|          | hp_potion ×5-10 | 100% |

## Maps (maps.ts)

### field (Green Field)
- 100×100 units, ground color #1f6f3d (handled via Environment.tsx grass texture)
- Spawns: 4× Slime + 2× Wolf at fixed positions
- Portals: (20, 0) → dungeon at (-18, 0)

### dungeon (Dark Dungeon)
- 60×60, ground #2a1f3a (stone texture)
- Spawns: 3× Wolf, 3× Orc, 1× Dark Lord (at z=22)
- Portals: (-20, 0) → field at (18, 0)

## NPCs (npcs.ts)

| ID | Name | Map | Position | Type | Notes |
|---|---|---|---|---|---|
| merchant_field | Merchant Mira 🛒 | field | (-5, -2) | shop | Sells potions/swords/armor; gives Slime Slayer + Wolf Hunter quests |
| scholar_field | Scholar Reni 📚 | field | (4, -3) | info | Gives Sticky Business quest |
| guard_dungeon | Dungeon Guard 🛡 | dungeon | (-16, 2) | info | Just dialog about boss |

### Mira's shop
- HP Potion 50z
- Wooden Sword 200z
- Leather Armor 300z
- Iron Sword 1500z
- Iron Armor 2200z

## Quests (quests.ts)

| ID | Giver | Min Lv | Objective | Reward |
|---|---|---|---|---|
| q_slime_starter | merchant_field | 1 | Kill 5 slimes | 50xp, 150z, ×2 HP Potion |
| q_wolf_hunter | merchant_field | 3 | Kill 3 wolves | 200xp, 500z, ×1 Leather Armor |
| q_jelly_collect | scholar_field | 1 | Collect 5 slime_jelly | 80xp, 200z |

`q_slime_starter` has `next: "q_wolf_hunter"` chain hint (UI doesn't enforce yet).

## Jobs (jobs.ts)

See GAMEPLAY.md for stat tables. Skills per job:

### Swordsman ⚔
- **1 Bash** — 5 MP, 1.5s CD, range 2.5, ×1.8 dmg
- **2 Whirlwind** — 12 MP, 4s CD, range 3, AoE radius 3, ×1.2

### Mage 🪄
- **1 Firebolt** — 8 MP, 1.2s CD, range 8, ×2.2 + Burn 3s
- **2 Frost Nova** — 18 MP, 5s CD, range 6, AoE r3.5, ×1.6 + Freeze 1.5s

### Archer 🏹
- **1 Arrow Shot** — 4 MP, 0.8s CD, range 12, ×1.5
- **2 Double Strafe** — 10 MP, 2.5s CD, range 10, ×2.4

### Acolyte ✨
- **1 Heal** — 12 MP, 1.5s CD, self only, heals ATK × 2 + 10 + Regen 5s
- **2 Holy Smite** — 10 MP, 2s CD, range 6, ×1.8 + Stun 1s (50%)

### Thief 🗡
- **1 Envenom** — 5 MP, 1.2s CD, range 2.5, ×1.4 + Poison 5s
- **2 Back Slide** — 0 MP, 0.8s CD, range 2.5, ×2.5

Designed so Mage/Archer auto-engage at distance, others go melee.

## Status effects (status.ts)

See GAMEPLAY.md table.

## Maps + layout

```
                FIELD                            DUNGEON
        ┌──────────────────────┐         ┌──────────────────────┐
        │                      │         │                      │
        │    🐺                │         │   🐺  ⚜DARK LORD     │
        │   📚         🐺      │         │                      │
        │   Reni      Wolf     │         │       🐺  Orc        │
        │                      │         │  Orc                 │
        │  🛒 spawn 🐺 portal──┼────────►│──────portal     Orc  │
        │  Mira  (0,0)         │         │                      │
        │                      │         │       🛡 Guard       │
        │   🐌  🐌  🐌         │         │       🐺             │
        │   Slimes             │         │                      │
        │              🐺      │         │                      │
        └──────────────────────┘         └──────────────────────┘
              100×100                            60×60
```
