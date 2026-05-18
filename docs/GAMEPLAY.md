# Gameplay & balance

## Stats and formulas

Defined in `packages/shared/src/stats.ts` and `constants.ts`.

### Base
- Player base HP: **100**
- Player base ATK: **10**
- Move speed: **5 units/sec**
- Attack range: **2 units**
- Attack cooldown: **800ms** (modified by ASPD)
- Respawn: **5s** (mobs), **60s** (boss)

### Per-level growth (by job)
| Job | HP/lv | ATK/lv | Base MP | MP/lv |
|---|---|---|---|---|
| Novice    | 20 | 3 | 20 | 2 |
| Swordsman | 30 | 5 | 30 | 2 |
| Mage      | 12 | 2 | 60 | 8 |
| Archer    | 18 | 4 | 40 | 3 |
| Acolyte   | 22 | 3 | 55 | 6 |
| Thief     | 16 | 4 | 30 | 2 |

### Derived stats (from STR/AGI/VIT/INT/DEX/LUK)
- MaxHP += VIT × 5
- MaxMP += INT × 3
- DEF += floor(VIT / 2)
- ATK += STR (flat bonus on top of weapon ATK)
- Hit = level + DEX
- Flee = level + AGI
- ASPD multiplier = max(0.4, 1 − AGI × 0.006)  → lower = faster
- Crit chance % = min(60, LUK × 0.3 + 1)
- 3 stat points awarded per level-up

### Hit / Crit
- Hit chance = clamp(0.05, 0.99, 0.8 + (hit − flee) × 0.03)
- Crit roll: `Math.random() × 100 < critChance` → damage × 2

### EXP curve
`EXP to next level = floor(25 + lv² × 5)`

| Level | EXP needed | Slimes (10xp each) |
|---|---|---|
| 1→2 | 30 | 3 |
| 2→3 | 45 | 5 |
| 3→4 | 70 | 7 |
| 4→5 | 105 | 11 |
| 5→6 | 150 | 15 |
| 6→7 | 205 | 21 |
| 10→11 | 525 | 53 |
| 15→16 | 1150 | 115 |
| 20→21 | 2025 | 203 |

Designed to feel snappy at low levels, gradually requiring quests/party/boss farming at high levels.

## Combat loop

1. Click monster → set as target (or bot mode auto-targets)
2. Walk into engage range (skill range for ranged jobs, melee range for others)
3. Server validates and resolves:
   - basic attack: hit roll → crit roll → damage = (atk + STR) [× 2 if crit]
   - skill: MP check → cooldown check → range check → damage = atk × multiplier; optionally apply status to target
4. If monster HP = 0 → grant EXP to attacker (shared if in party), spawn loot drop, schedule respawn
5. Auto-attack continues until cooldown allows next swing

## Status effects

| Status | Effect | Tick | Source examples |
|---|---|---|---|
| Poison ☠ | 3 dmg/sec | 1s | Envenom (Thief) |
| Burn 🔥 | 5 dmg/0.8s | 0.8s | Firebolt (Mage) |
| Stun 💫 | Prevent all actions | — | Holy Smite (Acolyte, 50%) |
| Freeze ❄ | Prevent action + speed×0 | — | Frost Nova (Mage) |
| Slow 🐌 | speed × 0.5 | — | (reserved) |
| Regen ✨ | Heal 5 / sec | 1s | Heal (Acolyte self) |

## Monsters (by map)

### Green Field
- Slime — HP 30, ATK 4, EXP 10, speed 2, aggro 6m
- Wolf — HP 60, ATK 8, EXP 25, speed 3.5, aggro 8m

### Dark Dungeon
- Wolf — same as above (3 spawns)
- Orc Warrior — HP 140, ATK 14, EXP 80, speed 2.5, aggro 7m (3 spawns)
- **Dark Lord** (boss, 1 spawn) — HP 400, ATK 18, EXP 800, speed 1.8, aggro 7m, respawn 60s
  - 100% Dark Crystal
  - 50% Blade of Dawn (+25 ATK)
  - 50% Dragon Plate (+20 DEF)
  - 5-10× HP Potion (always)

## Economy

- Starting Zeny: **500**
- Shop sell ratio: **0.5** (sell back for half price)
- Default sell prices for materials: slime_jelly 10z, wolf_fang 25z, others 10z

### Quests rewards
- Slime Slayer: +50 xp, +150z, ×2 HP Potion
- Wolf Hunter: +200 xp, +500z, ×1 Leather Armor
- Sticky Business: +80 xp, +200z

## Party play

- Max 4 members
- EXP shared equally among members within **30m** of the killer
- Party HP visible in real-time
- Useful for boss farming since boss has 400 HP × ~30 swings to kill solo

## PvP

Currently no PvP — attack messages only target monsters. PvP toggle is on the future roadmap.

## Win condition

None — it's a sandbox MMO scaffold. Progression goals:
1. Reach Lv5 → pick a job
2. Build up zeny via quests/farming
3. Get iron sword + iron armor
4. Solo or party Orc Warriors in dungeon
5. Attempt Dark Lord for endgame loot
6. Max out stat points (99 cap per stat)
