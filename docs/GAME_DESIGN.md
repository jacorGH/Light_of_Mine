# Light of Mine — Game Design Document

> This document defines the player experience, systems status, and development roadmap.
> For full technical specifications, see `PRD.md`. For content schemas, see `SCHEMA.md`.

---

## 1. Vision

A first-person open-world RPG (Morrowind/Daggerfall inspired) for mobile and web. The player explores, fights, crafts, and discovers on a mysterious island. Deep systems (alchemy, spell creation, skills) create emergent gameplay. AI-assisted content pipeline enables rapid world expansion.

**Core Fantasy:** "I washed ashore on a strange island. I explore ruins, learn magic, trade with villagers, delve into dungeons, and uncover the island's secrets — all from my phone."

---

## 2. Player Experience Pillars

| Pillar | Description |
|--------|-------------|
| **Discovery** | Finding hidden caves, secret items, lore. The joy of "what's over that hill?" |
| **Agency** | Play your way — warrior, mage, archer, thief, or any hybrid. No class restrictions. |
| **Tactile Combat** | Swipe direction = attack direction. Position matters. Both hands independent. |
| **Progression** | Skills improve by use. Loot gets better. Crafting unlocks new possibilities. |
| **Atmosphere** | Living world — NPCs have routines, day turns to night, weather changes. |

---

## 3. Systems Status

### ✅ Complete (Phase 1)

| System | Details |
|--------|---------|
| World streaming | 9 cells, seamless, island with ocean |
| Controls | Mobile 3-zone + PC WASD/mouse |
| Hand-based combat | Left/right touch → left/right hand, directional swipes |
| Dual quickslot | Weapon + spell in separate hands |
| Two-handed weapons | Bow takes both hands, proper handling |
| Enemy AI | 7 types, state machine (idle→alert→chase→attack→die) |
| Quests | 3 quests, auto-tracking, auto turn-in |
| Dialogue | Typewriter UI, branching trees, 3 NPCs |
| Inventory | Item collection, HUD display |
| Player stats | HP/Stamina/Magicka, regen, leveling |
| Day/night | 8 presets, smooth interpolation, sun arc |
| Water | Custom shader ocean with waves |
| Interiors | Tavern + grotto, wall collision, exit doors |
| Save/load | localStorage, auto-save, full state |
| Map | Minimap + full map with waypoints |
| Radial menu | Connected ring, tumble drill-in, categories |
| Sneak | Visual vignette, reduced detection, crouch height |
| Sprint | Toggle, double-tap joystick |
| Grass | Zelda-style clumps, cutting, particle scatter, loot drops |
| Terrain | Global height function, island falloff, biome colors |
| Collision | Object collision radii, interior bounds |

### 🔨 Phase 2 — Systems Depth (CURRENT)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **ECS Foundation** | Not started | Entity + Component + Prefab Registry. See PRD §3. |
| 2 | **Death/Respawn** | Not started | Death screen → respawn at last save |
| 3 | **Skills system** | Not started | 18 skills, use = improve. See PRD §4.1 |
| 4 | **Item properties** | Not started | Weight, value, element, durability |
| 5 | **Enemy respawn** | Not started | Respawn on cell reload (time-based) |
| 6 | **Blocking** | Not started | Hold in combat zone = block stance |
| 7 | **Lockpicking** | Not started | Timing minigame, skill-based |
| 8 | **Alchemy** | Not started | Combine ingredients → potions. See PRD §4.2 |
| 9 | **Spell creation** | Not started | Combine effects → custom spells. See PRD §4.3 |
| 10 | **Enchanting** | Not started | Soul gems + effects → enchanted gear. See PRD §4.4 |
| 11 | **Status effects** | Not started | Burn, freeze, shock, poison, bless |
| 12 | **Elemental blending** | Not started | Center-swipe combo (unlockable mid-game) |
| 13 | **More enemies** | Not started | Bandits, mages, animals (via ECS prefabs) |
| 14 | **Quick-assign UX** | Not started | Better weapon/spell hand assignment |
| 15 | **Merchants** | Not started | Buy/sell interface with NPCs |

### 📦 Phase 3 — Content Volume

| Feature | Notes |
|---------|-------|
| 20+ exterior cells | Expand island in all directions |
| 10+ interiors | Shops, dungeons, houses, caves |
| 15+ quests | Main story + side quests |
| 30+ NPCs | Unique dialogue, routines |
| 20+ enemy types | Via ECS prefabs, no code changes |
| Procedural dungeons | Room-based JSON generation |
| Books/lore | Scattered in world, grant skill XP |
| Factions | Reputation, exclusive quests/items |
| Weather | Rain, storms, fog — affect gameplay |
| NPC schedules | Time-based routines |
| Crime system | Stealing, bounties, guards |

### 🎨 Phase 4 — Production Polish

| Feature | Notes |
|---------|-------|
| Low-poly 3D models (.glb) | Replace all placeholder geometry |
| Character animations | Walk, attack, idle, die |
| UI art | Polished menus, icons, frames |
| Sound effects | Combat, environment, UI feedback |
| Music | Ambient + combat tracks |
| Performance optimization | LOD, frustum culling, instancing |
| PWA/native packaging | Installable on mobile |
| Tutorial | Guided first 5 minutes |
| Balance pass | Difficulty curve, economy tuning |

---

## 4. Controls (Current)

### Mobile Layout
```
┌───────────────────────────────────────────────┐
│                                               │
│  LEFT HAND      BOTH (combo)    RIGHT HAND    │
│  touch left     center 20%     touch right    │
│  40% = use      future blend    40% = use     │
│  left hand      attacks          right hand   │
│                                               │
│  Hold ranged = zoom+aim                       │
│  Hold melee = power attack                    │
│                                               │
├─────────────┬──────────────┬──────────────────┤ ← 70%
│   MOVE      │ [⚔][↑][✨]  │     LOOK         │
│  joystick   │  L  jmp  R   │     drag         │
│  dbl=sprint │  cycle slots  │  dbl=sneak      │
│  30%        │  hold=menu    │     30%         │
└─────────────┴──────────────┴──────────────────┘
```

### PC Controls
| Action | Key |
|--------|-----|
| Move | WASD / Arrows |
| Look | Mouse |
| Attack | Left-click |
| Zoom/Aim | Right-click hold |
| Jump | Space |
| Sprint toggle | Shift |
| Sneak toggle | Ctrl |
| Weapon cycle | Scroll / 1-3 |
| Spell cycle | Shift+Scroll / 4-6 |
| Menu | Tab / Esc |
| Map | M |
| Save | F5 |
| Load | F9 |

---

## 5. Content Creation (For Designers/AI)

All content is JSON-defined. See `SCHEMA.md` for full specifications and AI prompt templates.

| Content Type | File Location | Key Reference |
|---|---|---|
| Exterior cells | `public/world/cells/` | SCHEMA.md §2 |
| Interiors | `public/world/interiors/` | SCHEMA.md §3 |
| Dialogue | `public/world/dialogue/` | SCHEMA.md §4 |
| Quests | `public/world/quests/` | SCHEMA.md §5 |
| Entity prefabs | `public/world/prefabs/` | PRD.md §3 (ECS) |
| Dungeons | `public/world/dungeons/` | PRD.md §4.7 |

### Quick-Add Checklist

**New cell:** Create JSON → register in world_grid.json → add blend regions to neighbors
**New interior:** Create JSON → register in world_grid.json → add door in exterior cell
**New quest:** Create quest JSON → add quest_start action in NPC dialogue → verify targets
**New enemy:** Add to ENEMY_TYPES in EnemySystem (future: ECS prefab only)
**New item:** Add to loot tables / chest contents / shop inventories

---

## 6. World Map

```
        x=-1          x=0          x=1
       ────────────────────────────────────
y=-2   │  Swamp     │  Deep      │  Mountain  │
       │  Bogmire   │  Woods     │  Ashpeak   │
       ────────────────────────────────────
y=-1   │  Village   │  Forest    │  Ruins     │
       │  Driftwood │  Ashwood   │  Watchtower│
       ────────────────────────────────────
y=0    │  Cliffs    │  Beach     │  Tidepools │
       │  Western   │  South ★   │  Eastern   │
       ────────────────────────────────────

★ = Player spawn (0,0)
Interiors: The Salty Dog (village), Tidal Grotto (beach)
```

---

## 7. Immediate Next Steps (Priority Order)

1. **ECS Foundation** — Entity, Component, EntityManager, Prefab Registry, EntityLoader
2. **Death/Respawn** — Screen + respawn at last save point
3. **Skills** — Use-based progression for all 18 skills
4. **Item Properties** — Weight, value, element, durability on all items
5. **Enemy Respawn** — Enemies return when player leaves and returns to cell

These 5 features unblock everything else in Phase 2.

---

*This document is maintained alongside PRD.md and SCHEMA.md. Together they define the full game.*
