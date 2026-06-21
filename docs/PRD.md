# Light of Mine — Product Requirements Document

> **Version:** 1.0  
> **Last Updated:** June 21, 2026  
> **Status:** Active Development — Phase 1 Complete, Phase 2 Beginning

---

## 1. Product Vision

**Light of Mine** is a first-person open-world RPG for mobile and web browsers that delivers a Morrowind-depth experience through modern touch controls and AI-assisted content generation.

**One-line pitch:** "Morrowind in your pocket — explore, fight, craft, and discover on a mysterious island, built with a content system that lets us create endless adventures."

**What makes this different:**
1. **Daggerfall-style directional combat** with touch gesture recognition
2. **Dual-wield hand system** — assign anything to either hand, touch-side determines attack
3. **Entity Component System** — every object in the world is composable, making content creation fast
4. **AI-generatable content** — dungeons, quests, NPCs, items all defined in JSON that LLMs can produce
5. **Deep crafting** — alchemy, spell creation, enchanting built on composable ingredient/effect systems

---

## 2. Current State (Phase 1 Complete)

### What Works
- Seamless open-world cell streaming (9 cells, 3x3 island)
- First-person controls (PC + mobile dual-stick + gesture combat)
- Hand-based combat (left/right touch side = left/right hand)
- Dual quickslot system (weapon + spell simultaneously)
- 7 enemy types with AI state machine
- 3 quests with auto-tracking objectives and auto turn-in
- NPC dialogue with branching trees
- Inventory with item collection
- Player stats (HP/Stamina/Magicka) with regen + leveling
- Day/night cycle
- Ocean water shader
- Interiors (tavern, grotto) with wall collision
- Save/load (localStorage)
- Minimap + full map with waypoints
- Radial pause menu
- Sneak system with visual feedback
- Sprint + zoom/aim
- Grass clumps with cutting + loot drops
- Two-handed weapon handling

### What Needs Refinement (Before Phase 2)
- Quick-assign weapon/spell needs better UX
- No death/respawn flow
- No enemy respawn after cell reload
- Interior objects not interactive (barrels, crates)
- Placeholder geometry needs ECS to make it meaningful
- Controls edge cases (cycling, hold behaviors)

---

## 3. Entity Component System (ECS)

### Why ECS

Every object in the game world needs to be **composable**. A torch is not just a mesh — it's a renderable + light source + wall attachment + optionally interactable. A barrel is a renderable + physics body + container + optionally breakable. This composability is what enables rapid content creation.

### Architecture

```
Entity = unique ID + collection of Components

Components (pure data):
  Transform: { position, rotation, scale }
  Renderable: { geometry, size, color, material }
  Physics: { collider_type, mass, is_static, standable }
  Light: { color, intensity, range, type, flicker }
  Container: { items[], slots, locked, key_id }
  Interactable: { type, label, action, state }
  Attachment: { face, offset, height, anchor_type }
  Health: { current, max, destructible, break_loot }
  AI: { behavior, state, patrol_points, detect_range }
  Dialogue: { file_path }
  Loot: { table_id, drop_chance }
  Door: { target, exit_position, locked, key_id, state }
  Ingredient: { effects[], rarity }
  Equipment: { slot, stats, element, durability, max_durability }
  SpellEffect: { type, magnitude, duration, cost, range }
  Projectile: { speed, gravity, damage, element, trail }

Systems (process entities with specific components):
  RenderSystem → [Transform, Renderable]
  PhysicsSystem → [Transform, Physics]
  LightSystem → [Transform, Light]
  AISystem → [Transform, AI, Health]
  InteractionSystem → [Transform, Interactable]
  ContainerSystem → [Transform, Container, Interactable]
  DoorSystem → [Transform, Door, Interactable]
  AttachmentSystem → [Transform, Attachment, Renderable]
```

### JSON Entity Definitions

```json
{
  "id": "wall_torch",
  "name": "Wall Torch",
  "components": {
    "renderable": { "geometry": "cylinder", "size": [0.08, 1.2], "color": "#5a3a1a" },
    "light": { "color": "#ff9944", "intensity": 0.8, "range": 8, "flicker": true },
    "attachment": { "face": "wall", "offset": 0.05, "height": 2.0 },
    "interactable": { "type": "toggle", "label": "Extinguish", "state": "lit" }
  }
}
```

```json
{
  "id": "barrel_01",
  "name": "Barrel",
  "components": {
    "renderable": { "geometry": "cylinder", "size": [0.4, 0.8], "color": "#6a4a2a" },
    "physics": { "collider": "cylinder", "mass": 20, "is_static": true, "standable": true },
    "container": { "slots": 4, "items": [], "locked": false },
    "interactable": { "type": "container", "label": "Open Barrel" },
    "health": { "max": 30, "destructible": true, "break_loot": "barrel_loot_table" }
  }
}
```

```json
{
  "id": "doorway_stone",
  "name": "Stone Doorway",
  "components": {
    "renderable": { "geometry": "doorframe", "size": [1.5, 2.5, 0.4], "color": "#5a5a55" },
    "physics": { "collider": "doorframe", "passable": true },
    "door": { "state": "open", "can_close": true }
  }
}
```

### Prefab Categories

```
Nature: tree_pine, tree_oak, rock_large, rock_small, bush, flower, mushroom_glow
Structure: wall_stone, wall_wood, doorway, window, pillar, stairs, arch
Furniture: table, chair, bed, shelf, wardrobe, rug
Containers: chest_wood, chest_iron, barrel, crate, sack, urn, bookshelf
Lighting: torch_wall, torch_stand, candle, chandelier, campfire, lantern
Mechanisms: lever, button, pressure_plate, trap_dart, trap_spike, portcullis
Crafting: alchemy_table, enchanting_altar, forge, workbench
```

---

## 4. Game Systems

### 4.1 Skills & Leveling

**18 Skills across 4 categories:**

| Combat | Magic | Stealth | Crafting |
|--------|-------|---------|----------|
| Blade | Destruction | Sneak | Alchemy |
| Blunt | Restoration | Lockpick | Enchanting |
| Hand-to-Hand | Alteration | Pickpocket | Smithing |
| Archery | Conjuration | Acrobatics | |
| Block | | | |

**Progression:** Use skill → gain skill XP → skill levels up → every 10 skill levels = character level → choose stat boost

### 4.2 Alchemy

Combine 2-3 ingredients with shared effects → create potions/poisons. Higher Alchemy skill reveals more ingredient effects.

### 4.3 Spell Creation

Combine spell effects at a creation altar. Choose magnitude, duration, range. Cost calculated from parameters. Higher Destruction/Restoration/etc skill = cheaper and more powerful spells.

### 4.4 Enchanting

Apply spell effects to weapons/armor using captured soul gems. Kill creatures to fill gems. Higher Enchanting skill = more charges and stronger effects.

### 4.5 Combat (Refined)

- **Blocking:** Hold without swiping in combat zone
- **Critical hits:** Based on skill + backstab bonus from sneak
- **Elemental triangle:** Fire > Ice > Lightning > Fire
- **Status effects:** Burning, Frozen, Shocked, Poisoned, Blessed
- **Weapon durability:** Degrades with use, repair at smithing stations
- **Elemental blending (unlockable):** Center-swipe with matching elements = combo attack

### 4.6 Interaction (Refined)

Types: Examine, Take, Open, Talk, Use, Read, Lock/Unlock, Steal
Lockpicking: timing minigame, skill-based difficulty
Crime: stealing = bounty if witnessed, guards respond

### 4.7 Dungeon Design

Room-based JSON with connections, entities, triggers, and loot. AI-generatable from theme + difficulty parameters.

---

## 5. Content Pipeline

### What AI Generates
1. **Exterior cells** — biome, objects, NPCs, triggers, blend regions
2. **Interiors/Dungeons** — rooms, connections, entities, triggers, loot
3. **Dialogue trees** — NPC personality, quest hooks, shop interactions
4. **Quests** — objectives, rewards, turn-in logic
5. **Entity prefabs** — new objects from component combinations
6. **Items** — weapons, armor, ingredients, consumables with stats
7. **Loot tables** — probability distributions for different contexts

### Validation (Pre-Deploy Checks)
- All entity prefab IDs exist in registry
- All dialogue node IDs are reachable
- All quest targets match actual world IDs
- All door targets reference registered interiors
- All loot table IDs exist
- Interior exit positions match exterior door positions

---

## 6. Development Phases

### Phase 2 — Systems Depth

| Priority | Feature |
|----------|---------|
| P0 | ECS foundation (Entity, Component, EntityManager, Prefab Registry) |
| P0 | Death/respawn screen |
| P0 | Enemy respawn on cell reload |
| P1 | Skills system (use = improve) |
| P1 | Item properties (weight, value, element, durability) |
| P1 | Lockpicking minigame |
| P1 | Blocking mechanic |
| P1 | More enemy types via ECS (bandits, mages) |
| P2 | Alchemy system |
| P2 | Spell creation |
| P2 | Status effects |
| P2 | Elemental blending (combo attacks) |
| P3 | Crime/bounty |
| P3 | NPC schedules |
| P3 | Merchants/shops |

### Phase 3 — Content Volume

- 20+ cells, 10+ interiors, 15+ quests, 30+ NPCs
- Procedural dungeon generation
- Books/lore, factions, weather

### Phase 4 — Production Polish

- Real 3D assets, animations, audio, music
- Performance optimization, PWA packaging
- Tutorial, balancing, cloud save

---

## 7. Design Principles

1. **Mobile-first** — Touch is primary input
2. **Data-driven** — Content in JSON, logic in systems
3. **Event-driven** — Systems communicate through EventBus
4. **Composable** — Objects built from components
5. **AI-friendly** — Schemas designed for LLM generation
6. **Incremental** — Placeholder geometry until real assets exist
7. **Always playable** — Never break the game with a commit

---

*This is the source of truth. Update when decisions change.*
