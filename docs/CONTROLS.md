# Controls & UI

## Keyboard

| Key | Action |
|---|---|
| **W / A / S / D** or **arrows** | Move (camera-relative) |
| **Click ground** | Walk to that point |
| **Click monster** | Target + auto-engage (walk into range + attack) |
| **Click item drop** | Walk to it + pickup |
| **Click NPC** | Walk to NPC + open dialog |
| **Space** | Single basic attack on current target |
| **1 / 2 / 3 / 4** | Use skill in hotbar slot N (needs target if damage skill) |
| **F** | Pick up nearest item in 2.5m |
| **H** | Use first HP Potion in inventory |
| **I** | Toggle Inventory |
| **C** | Toggle Stats panel |
| **Q** | Toggle Quest Log |
| **O** | Toggle Settings |
| **B** | Toggle Bot Mode (auto-pickup + auto-target + auto-attack) |
| **Enter** | Open chat input |
| **Esc** | Close most modals / chat |

## Mouse

| Action | Result |
|---|---|
| **Left-click** ground | Walk there |
| **Left-click** monster | Target + engage |
| **Left-click** item | Pickup |
| **Left-click** NPC | Open dialog |
| **Right-click drag** | Rotate camera (orbit yaw + pitch) |
| **Mouse wheel** | Zoom camera (6m – 40m distance) |
| **Hover monster** | Cursor → crosshair |
| **Hover item** | Cursor → grab |
| **Hover NPC** | Cursor → pointer |
| **Inventory left-click** | Equip/use item |
| **Inventory right-click** | Drop item |

## UI panels (all draggable + position saved to localStorage)

| Panel | Position (default) | Toggle | Contents |
|---|---|---|---|
| **Stats HUD** | top-left | always shown | Name, Lv, job, HP/MP/EXP bars, ATK/DEF, Zeny |
| **Menu (Controls)** | bottom-right | always shown | 8-button action grid + Bot toggle + Keybinds + Logout |
| **Minimap** | top-right | always shown | Map name + 130×130 canvas with portals/NPCs/mobs/players |
| **Chat** | bottom-left | always shown | Last messages + input via Enter |
| **Quest Log** | top-right (below minimap) | Q | Active quests with progress bars |
| **Inventory** | center modal | I | 24 slots + equipment + click-equip/use |
| **Stats panel** | center modal | C | 6 stats with + buttons + derived stats + zeny |
| **NPC Dialog** | bottom-center | click NPC | Buy/Sell/Quest tabs |
| **Party panel** | left, when in party | Form via Menu → Party | Members + HP bars |
| **Boss bar** | top-center | auto when near boss | Big HP bar for Dark Lord |
| **Cast bar** | center-bottom | auto when casting | Brief skill cooldown indicator |
| **Status badges** | left, below HUD | auto | Active poison/burn/stun/etc with countdown |
| **Settings** | center modal | O | SFX volume slider |
| **Event Feed** | top-center | auto | "Level up!", quest rewards (fade out) |
| **Low HP vignette** | screen edge | auto when HP<30% | Pulsing red border |

## Menu panel (Controls) — 8-button grid

Each button is `icon + label + hotkey badge`:

| 📦 Inv (I) | 📊 Stat (C) | 📜 Quest (Q) | 👥 Party |
|---|---|---|---|
| 🧪 Pot (H) | ⚙ Set (O) | 💬 Chat (↵) | 📍 Map |

Below the grid: Bot mode toggle, collapsible Keybinds reference, Logout button.

## Bot Mode (B)

When enabled:
1. **Priority 1: Loot** — picks up nearest drop within 8m
2. **Priority 2: Target mob** — selects nearest live monster within 20m
3. **Engage** — walks into skill/melee range, auto-uses primary skill or basic attack
4. **Manual override** — pressing WASD temporarily takes control

## Camera

- Default: 16m distance behind player, looking down
- Right-drag: yaw (horizontal) + pitch (vertical, clamped 0.15–1.3 rad)
- Wheel: clamps 6m – 40m distance

## Chat

- Press **Enter** to open input (auto-focus)
- Type up to 200 chars, Enter to send
- Esc to cancel
- Messages last 50 lines visible
