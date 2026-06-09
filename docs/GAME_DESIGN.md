# Light of Mine — Game Design Document

> This document defines the player experience, core systems, and development strategy.
> All implementation decisions should reference this document.

---

## 1. Vision Statement

**Light of Mine** is a first-person open-world RPG for mobile and web browsers, inspired by *The Elder Scrolls III: Morrowind* and *Daggerfall*. The player explores a mysterious island, interacts with NPCs, collects items, casts spells, and fights enemies — all through an intuitive touch/mouse interface with Daggerfall-style directional combat.

**Core Fantasy:** "I washed ashore on a strange island. I explore ruins, learn magic, trade with villagers, delve into dungeons, and uncover the island's secrets — all from my phone."

---

## 2. Player Experience Pillars

These are the feelings we optimize for. Every feature must serve at least one:

| Pillar | Description |
|--------|-------------|
| **Discovery** | The joy of exploring an unfamiliar world. Finding hidden caves, secret items, lore. |
| **Agency** | The player chooses how to play — melee warrior, spell caster, archer, thief, or hybrid. |
| **Tactile Combat** | Fighting feels physical and skill-based. Swipe direction matters. Positioning matters. |
| **Progression** | Getting stronger through loot, skills, and knowledge. The RPG loop. |
| **Atmosphere** | The world feels alive — weather, day/night, ambient sound, NPC routines. |

---

## 3. Core Systems

### 3.1 World

| Feature | Description | Priority |
|---------|-------------|----------|
| Cell streaming | Seamless exterior (no loading screens) | ✅ Done |
| Interiors | Separate scenes via doors | ✅ Designed |
| Terrain | Unified global height, per-cell biome colors | ✅ Done |
| Day/night cycle | Lighting changes over time, affects gameplay | P1 |
| Weather | Rain, fog, storms — affect visibility and mood | P2 |
| Water | Ocean boundary, rivers, swimming | P1 |
| Doors/transitions | Enter buildings, caves, dungeons | P1 |
| NPC schedules | NPCs move between locations based on time | P3 |

### 3.2 Player

| Feature | Description | Priority |
|---------|-------------|----------|
| First-person camera | Done | ✅ Done |
| Terrain following | Raycast to ground | ✅ Done |
| Jump | Physics-based arc | ✅ Done |
| Sprint | Hold to move faster, drains stamina | P1 |
| Swim | Water traversal | P2 |
| Sneak | Reduced detection, bonus damage | P2 |
| Stats | Health, Stamina, Magicka | P1 |
| Leveling | XP from combat, exploration, quests → level up → stat increases | P1 |

### 3.3 Combat

| Feature | Description | Priority |
|---------|-------------|----------|
| Directional melee | Daggerfall-style: swipe direction = attack direction | ✅ Done |
| Weapon types | One-handed (sword, axe, dagger), Two-handed (greatsword, staff), Ranged (bow) | P1 |
| Handedness | Dominant hand determines weapon offset | ✅ Done |
| Blocking | Hold/tap gesture = raise shield/weapon to block | P1 |
| Projectile spells | Fireball, icicle — fly through world | ✅ Done |
| Arrows | Gravity arc, limited ammo | ✅ Done |
| Enemy AI | Patrol, detect player, chase, attack, die | P1 |
| Damage numbers | Visual feedback when hitting/being hit | P2 |
| Death/respawn | Player dies → respawn at last save point | P1 |

### 3.4 Items & Inventory

| Feature | Description | Priority |
|---------|-------------|----------|
| Item pickup | Walk near + interact, or auto-collect (grass drops) | ✅ Partial |
| Inventory grid | Full item list with categories, quantities | ✅ Done |
| Equipment slots | Weapon, Shield, Armor, Ring, Amulet | P1 |
| Consumables | Potions (health, stamina, magicka), food | P1 |
| Loot drops | Enemies and containers drop items | P1 |
| Item rarity | Common, Uncommon, Rare, Legendary (color-coded) | P2 |
| Shops | Buy/sell with NPCs | P2 |

### 3.5 Magic

| Feature | Description | Priority |
|---------|-------------|----------|
| Spell slots | Player equips known spells to quick-slots | P1 |
| Spell types | Destruction (damage), Restoration (heal), Alteration (utility) | P1 |
| Magicka cost | Each spell drains magicka, regens over time | P1 |
| Spell discovery | Find spell scrolls/books in the world | P2 |

### 3.6 NPCs & Dialogue

| Feature | Description | Priority |
|---------|-------------|----------|
| Dialogue trees | JSON-defined conversations with choices | P1 |
| Quests | Accept, track, complete quests from NPCs | P1 |
| Shops | Buy/sell interface | P2 |
| Factions | Reputation system | P3 |

### 3.7 UI / Controls

| Feature | Description | Priority |
|---------|-------------|----------|
| Radial pause menu | Category ring → swipe in → sub-items → swipe out | **P0 (next)** |
| HUD | Health/Stamina/Magicka bars, compass, gold | P1 |
| Mobile combat zone | Top 70% = swipe to attack | ✅ Done |
| Mobile movement | Bottom-left joystick | ✅ Done |
| Mobile look | Bottom-right drag | ✅ Done |
| Mobile action wheel | Bottom-center: jump, cycle weapon | ✅ Done |
| PC controls | WASD + Mouse + Number keys + Scroll | ✅ Done |
| Minimap/compass | Direction indicator at top | P2 |

---

## 4. Radial Pause Menu — Design Specification

The signature UI element. Pauses the game, gives full access to inventory/equipment/spells.

### Concept: "Tumble Ring"

**Opening:** Hold two fingers (mobile) or press Tab/Esc (PC).
- Time freezes (game pauses)
- A ring of **category nodes** appears, spinning out from center with a tumble/card-flip animation
- Each node is a circle with an icon + label

**Categories (outer ring):**
- ⚔ Weapons
- 🛡 Equipment
- 🧪 Items
- ✨ Spells
- 📋 Quests
- ⚙ Settings

**Navigating IN:** Swipe/drag toward a category (or tap it)
- The outer ring tumbles backward (shrinks + rotates away)
- The selected category's items tumble forward from center, forming a new ring
- e.g., "Weapons" shows: Iron Sword, Fist, Fireball, Icicle, Bow...

**Navigating OUT:** Swipe outward from center (or tap back/edge)
- Current ring tumbles backward
- Category ring tumbles back in

**Selecting:** Tap an item in the inner ring
- Equips/uses it
- Brief flash of confirmation
- Menu closes, game resumes

**Visual Style:**
- Dark semi-transparent backdrop (world still visible but dimmed + blurred)
- Items arranged in a circle, evenly spaced
- Selected item scales up slightly with a glow
- Smooth spring-physics animation on the tumble transitions
- Items show: icon, name, and quick stats on hover/select

---

## 5. Architecture Strategy

### Principles

1. **System separation** — Each system (Combat, Inventory, UI, World) is its own module with clean interfaces
2. **Data-driven** — Game content lives in JSON (world, items, spells, dialogues, quests)
3. **Event-based communication** — Systems communicate through an event bus, not direct coupling
4. **Mobile-first** — Touch is the primary input; PC is the bonus (not the other way around)
5. **AI-content-ready** — Schemas designed so an LLM can generate valid content

### Module Structure (target)

```
src/
├── main.js                  # Entry, init
├── engine/
│   ├── Engine.js            # Renderer, loop, system orchestration
│   ├── EventBus.js          # Pub/sub for system communication
│   ├── PlayerController.js  # Input + movement (no game logic)
│   ├── WorldGrid.js         # Cell streaming
│   └── CellLoader.js        # Cell → Three.js scene builder
├── systems/
│   ├── CombatSystem.js      # Damage calc, hit detection, enemy AI
│   ├── InventorySystem.js   # Item storage, equipment, drops
│   ├── MagicSystem.js       # Spells, magicka, effects
│   ├── QuestSystem.js       # Quest tracking, objectives, rewards
│   ├── NPCSystem.js         # Dialogue, behavior, schedules
│   └── PlayerStats.js       # HP, Stamina, Magicka, XP, Level
├── ui/
│   ├── RadialMenu.js        # Pause menu (tumble ring)
│   ├── HUD.js               # Health bars, compass, gold
│   ├── DialogueUI.js        # NPC conversation display
│   └── NotificationUI.js    # Pickup/damage/quest notifications
├── rendering/
│   ├── WeaponViewmodel.js   # First-person weapon display + animation
│   ├── GrassSystem.js       # Grass clumps, cutting, particles
│   ├── SkySystem.js         # Day/night, weather, sky colors
│   └── WaterSystem.js       # Ocean, rivers, reflections
└── data/
    └── ItemDatabase.js      # Item definitions, stats, rarities
```

### Event Bus Pattern

Instead of systems directly calling each other:
```js
// Bad (tight coupling):
grassCutter → engine.weaponSystem.attack()
weaponSystem → engine.inventory.addItem()

// Good (event bus):
events.emit('player:attack', { direction, power, weapon })
events.emit('item:collected', { id: 'gold', quantity: 5 })
events.emit('enemy:damaged', { enemyId, damage, type })
events.emit('player:damaged', { amount, source })
events.emit('quest:objective_complete', { questId, objectiveId })
```

Systems subscribe to events they care about. No system knows about other systems directly.

---

## 6. Development Phases

### Phase 0 — Foundation (current state)
- [x] Three.js + Vite setup
- [x] Cell streaming world
- [x] First-person controls (PC + mobile)
- [x] Terrain following
- [x] Placeholder combat (directional swipes)
- [x] Grass clumps + cutting
- [x] Basic inventory
- [x] Weapon viewmodel
- [ ] **Radial pause menu**
- [ ] **Event bus (decouple systems)**

### Phase 1 — Core Loop (playable demo)
- [ ] Player stats (HP, Stamina, Magicka bars)
- [ ] Enemy spawning + basic AI (chase, attack, die)
- [ ] Damage system (player hits enemy, enemy hits player)
- [ ] Death/respawn
- [ ] Item pickup from world (walk near + interact)
- [ ] Door transitions (enter interiors)
- [ ] 1 full interior (tavern or cave)
- [ ] NPC dialogue (basic text tree)
- [ ] 1 simple quest (talk → fetch → return)
- [ ] Day/night cycle (lighting changes)
- [ ] Save/load (localStorage)

### Phase 2 — Depth
- [ ] Multiple enemy types
- [ ] Spell system (3-4 spells)
- [ ] Equipment stats (armor, damage bonuses)
- [ ] Shops (buy/sell)
- [ ] More interiors (3-5 buildings)
- [ ] Quest journal UI
- [ ] Weather system
- [ ] Water/swimming
- [ ] Sound effects + ambient audio

### Phase 3 — Content
- [ ] Expand island (more cells)
- [ ] Multiple quest lines
- [ ] Boss encounters
- [ ] Factions/reputation
- [ ] Procedural dungeons
- [ ] AI-generated content pipeline
- [ ] Real 3D assets (replace placeholders)

---

## 7. Content Pipeline (AI-Assisted)

The JSON schema is designed for LLM generation:

1. **World cells** — Describe a biome + requirements → AI outputs valid cell JSON
2. **Interior layouts** — Describe building type → AI outputs room + furniture + NPCs
3. **Quests** — Describe story beats → AI outputs quest JSON with objectives + dialogue
4. **Item definitions** — Describe theme → AI outputs balanced item stats
5. **NPC dialogue trees** — Describe personality + quest role → AI outputs dialogue JSON

Each schema is documented in `docs/SCHEMA.md` with examples and generation prompts.

---

## 8. Open Design Questions

- What's the death penalty? (Respawn at last save? Lose some gold? Soulslike?)
- How fast should leveling be? (Quick for mobile sessions? Long for depth?)
- PvP / multiplayer ever? (Probably not for Phase 1, but affects architecture)
- Monetization? (Free with cosmetics? One-time purchase? Ads?)
- Save system: localStorage only, or cloud sync?
- Controller support? (Gamepad API for mobile controllers)

---

## 9. Immediate Next Steps (Priority Order)

1. **Radial Pause Menu** — The "tumble ring" UI. This is the most impactful single feature for player experience.
2. **Event Bus** — Decouple all systems. Required before adding more systems cleanly.
3. **Player Stats + HUD** — HP/Stamina/Magicka bars. Foundation for combat.
4. **Enemy AI** — A simple enemy that chases + attacks. Makes combat meaningful.
5. **Door Interaction** — Enter the tavern. First real "exploration discovery" moment.

---

*This document is the source of truth. Update it when decisions change.*
