# Light of Mine — Content Authoring Reference

> **This is the single definitive document for creating ALL game content.**
> Use this whether you are a human designer or an AI generating content.

---

## 1. Overview

### Architecture

Light of Mine uses a **cell-based open world** inspired by Morrowind. The world is a seamless grid of exterior cells the player walks between without loading screens. Only **interiors** (buildings, caves, dungeons) use scene transitions.

All systems communicate via a central **EventBus** — no system holds direct references to another. Content files (JSON) drive everything: cells define the world, dialogue files drive conversations, quest files track objectives, and the asset registry maps IDs to models.

### How the World Works

1. `world_grid.json` defines all cells, interiors, and global environment
2. **WorldGrid** tracks the player's cell position and streams nearby cells
3. Cells within a **view radius** (default: 2 = 5×5 grid) are loaded
4. Cells outside the radius are unloaded (geometry disposed)
5. Each cell is a `THREE.Group` positioned at `(cellX × cellSize, 0, cellY × cellSize)`
6. All positions within a cell are **local to cell origin**

### File Structure

```
public/world/
├── world_grid.json              # World manifest — cell registry + environment
├── assets.json                  # Asset registry (model paths, metadata)
├── cells/                       # Exterior cell definitions
│   ├── 0_0_beach_south.json
│   ├── 1_0_beach_east.json
│   ├── -1_0_coast_west.json
│   ├── 0_-1_forest.json
│   ├── 1_-1_ruins.json
│   ├── -1_-1_village.json
│   ├── 0_-2_forest_deep.json
│   ├── -1_-2_swamp.json
│   └── 1_-2_mountain.json
├── interiors/                   # Interior scene definitions
│   ├── village_tavern.json
│   ├── watchtower_interior.json
│   └── beach_cave.json
├── dialogue/                    # NPC dialogue trees
│   ├── fisherman_01.json
│   ├── guard_village.json
│   └── tavern_keeper.json
├── quests/                      # Quest definitions
│   ├── swamp_bounty.json
│   ├── watchtower_mystery.json
│   └── tidal_grotto_treasure.json
└── prefabs/                     # Reusable object arrangements (future)
```

### Coordinate System

| Axis | Direction |
|------|-----------|
| X | East (+) / West (−) |
| Y | Up (+) / Down (−) |
| Z | South (+) / North (−) |

- **Cell grid:** `x` increases east, `y` increases south
- **Cell size:** 64 world units
- **Cell world origin:** `(cellX × 64, 0, cellY × 64)`
- **Player height:** Y=2 (camera)

---

## 2. World Cells (`public/world/cells/`)

Each cell is a 64×64 world-unit area. Positions are **local** — `[0,0,0]` is cell center, ranging from `[-32,_,-32]` to `[32,_,32]`.

### Full Schema

```json
{
  "id": "x_y_name",
  "name": "Display Name",
  "biome": "beach|forest|swamp|mountain|ruins|village|coast",
  "terrain": {
    "type": "procedural",
    "baseColor": "#hex",
    "roughness": 0.0-1.0,
    "noiseScale": 0.08,
    "noiseAmplitude": 2.0,
    "blendRegions": [
      { "edge": "north|south|east|west", "color": "#hex", "width": 10 }
    ]
  },
  "objects": [
    { "asset": "asset_id", "position": [x, y, z], "rotation": [rx, ry, rz], "scale": 1.0 }
  ],
  "npcs": [
    {
      "id": "unique_npc_id",
      "asset": "npc_asset_id",
      "name": "Display Name",
      "position": [x, y, z],
      "rotation": [0, degrees, 0],
      "behavior": "idle|patrol|wander",
      "dialogue": "dialogue/filename.json"
    }
  ],
  "items": [
    {
      "id": "unique_item_id",
      "asset": "chest_wooden|herb_01|ore_iron",
      "position": [x, y, z],
      "contents": ["item_id_1", "gold_50"]
    }
  ],
  "doors": [
    {
      "id": "door_id",
      "position": [x, y, z],
      "rotation": [0, degrees, 0],
      "target": "interior_id",
      "exitPosition": [world_x, world_y, world_z],
      "label": "Enter Building Name"
    }
  ],
  "triggers": [
    {
      "id": "trigger_id",
      "type": "once|repeatable|toggle",
      "shape": "sphere|box",
      "position": [x, y, z],
      "radius": 6,
      "event": "spawn_enemies|start_dialogue",
      "data": { }
    }
  ]
}
```

### Terrain Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"procedural"` — height from global noise function |
| `baseColor` | hex | Ground color for this biome |
| `roughness` | 0–1 | PBR material roughness |
| `noiseScale` | number | Terrain noise frequency (higher = more hills) |
| `noiseAmplitude` | number | Max terrain height variation |
| `blendRegions` | array | Color blending at edges for biome transitions |

### Blend Region

| Field | Type | Description |
|-------|------|-------------|
| `edge` | string | `"north"`, `"south"`, `"east"`, `"west"` |
| `color` | hex | Color to blend toward at this edge |
| `width` | number | Blend distance in world units from edge |

### Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `asset` | string | Asset name recognized by CellLoader |
| `position` | [x,y,z] | Local position within cell |
| `rotation` | [x,y,z] | Euler angles in degrees |
| `scale` | number or [x,y,z] | Uniform or per-axis scale |

### NPC Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (used by quests/dialogue) |
| `asset` | string | Character model ID |
| `name` | string | Display name shown to player |
| `position` | [x,y,z] | Local position |
| `rotation` | [x,y,z] | Facing direction (Y is most common) |
| `behavior` | string | `"idle"`, `"patrol"`, `"wander"` |
| `patrol_points` | array | For patrol: array of [x,y,z] waypoints |
| `wander_radius` | number | For wander: max distance from spawn |
| `dialogue` | string | Path to dialogue file (relative to `world/`) |

### Item Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `asset` | string | Visual asset ID |
| `position` | [x,y,z] | Local position |
| `contents` | array | Item IDs contained (for chests/containers) |

### Door Fields (Exterior → Interior)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `position` | [x,y,z] | Local position of the door |
| `rotation` | [x,y,z] | Door facing |
| `target` | string | Interior ID to load (matches `interiors[].id` in world_grid) |
| `exitPosition` | [x,y,z] | **World** position to place player when exiting back |
| `label` | string | Interaction prompt text (e.g., "Enter Tavern") |

### Trigger Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `type` | string | `"once"` (fires once per game), `"repeatable"`, `"toggle"` |
| `shape` | string | `"sphere"` or `"box"` |
| `position` | [x,y,z] | Center of trigger volume |
| `radius` | number | Detection radius (for sphere shape) |
| `event` | string | Event to fire: `"spawn_enemies"`, `"start_dialogue"` |
| `data` | object | Event-specific payload |

#### Trigger Data for `spawn_enemies`

```json
{
  "enemies": [
    { "asset": "enemy_crab_01", "position": [40, 0, 7] },
    { "asset": "enemy_wolf_01", "position": [36, 0, 3] }
  ]
}
```

### Available Asset Names (CellLoader)

The CellLoader recognizes these asset name patterns for procedural geometry:

| Asset Pattern | Rendered As | Notes |
|---------------|-------------|-------|
| `tree_palm_*` | Green cone (h:5) | Tropical tree |
| `tree_pine_*` | Dark green cone (h:6) | Conifer |
| `tree_ancient_*`, `tree_oak_*` | Large green cone (h:8) | Big deciduous tree |
| `tree_dead_*`, `dead_tree_*` | Brown cone (h:5) | Leafless dead tree |
| `rock_cliff_*` | Large dodecahedron | Cliff face |
| `rock_coastal_*`, `rock_boulder_*` | Medium dodecahedron | Boulder |
| `rock_mossy_*` | Green-tinted dodecahedron | Mossy rock |
| `house_*`, `structure_*`, `hut_*` | Brown box (4×3×4) | Building |
| `ruin_wall_*` | Flat box (5×3×0.6) | Ruined wall segment |
| `ruin_tower_*` | Cylinder (r:2.5, h:6) | Tower ruin |
| `ruin_pillar_*` | Thin cylinder (h:4) | Stone pillar |
| `torch_standing` | Thin cylinder + point light | Emits orange light |
| `campfire` | Small cone + point light | Emits warm light |
| `mushroom_glowing_*` | Sphere + green light | Bioluminescent |
| `mushroom_*` | Small sphere | Regular mushroom |
| `fallen_log_*` | Horizontal cylinder | Fallen tree |
| `boat_*` | Brown box (2×0.8×4) | Small boat |
| `fence_*` | Long thin box | Fence section |
| `barrel_*` | Short cylinder | Barrel |
| `crate_*` | Small box | Storage crate |
| `market_stall_*` | Medium box | Market booth |
| `well_*` | Medium cylinder | Stone well |
| `cobweb_*` | Flat plane | Spider web |
| `swamp_water_*` | Transparent green plane | Water surface |
| `lily_pad_*` | Flat green plane | Water plant |
| `driftwood_*` | Flat plane | Beach debris |
| `mining_node_*` | Octahedron | Ore deposit |
| `snow_patch_*` | White flat plane | Snow |

### Available Enemy Types for Triggers

Seven enemy types are available (see Section 9 for full stats):

1. `enemy_crab_01` — Beach crabs (weak, slow)
2. `enemy_wolf_01` — Forest wolves (fast, medium)
3. `enemy_spider_01` — Small spiders (fast, fragile)
4. `enemy_spider_large` — Giant spiders (tough, slow)
5. `enemy_skeleton_01` — Melee skeletons (balanced)
6. `enemy_skeleton_archer` — Ranged skeletons (long range, fragile)
7. `enemy_bog_creature` — Swamp beasts (tanky, slow, hard-hitting)

---

## 3. Interiors (`public/world/interiors/`)

Interiors use their own local coordinate system centered at origin. They completely replace the exterior view when entered.

### Full Schema

```json
{
  "id": "interior_id",
  "name": "Display Name",
  "environment": {
    "ambientLight": { "color": "#hex", "intensity": 0.3 },
    "pointLights": [
      { "position": [x, y, z], "color": "#hex", "intensity": 0.8, "range": 10 }
    ]
  },
  "geometry": {
    "size": [width, height, depth],
    "floorColor": "#hex",
    "wallColor": "#hex"
  },
  "spawn": {
    "position": [x, y, z],
    "rotation": [0, 0, 0]
  },
  "objects": [
    { "asset": "table_wooden", "position": [x, y, z], "rotation": [rx, ry, rz], "scale": 1.0 }
  ],
  "npcs": [
    {
      "id": "npc_id",
      "asset": "npc_villager_male",
      "name": "NPC Name",
      "position": [x, y, z],
      "rotation": [0, degrees, 0],
      "behavior": "idle",
      "dialogue": "dialogue/file.json"
    }
  ],
  "items": [
    {
      "id": "item_id",
      "asset": "chest_wooden",
      "position": [x, y, z],
      "contents": ["item_1", "item_2"]
    }
  ],
  "exits": [
    {
      "id": "exit_id",
      "position": [x, y, z],
      "exitPosition": [world_x, world_y, world_z],
      "label": "Exit to Area Name"
    }
  ]
}
```

### Field Details

| Field | Type | Description |
|-------|------|-------------|
| `environment.ambientLight` | object | Base fill light for the room |
| `environment.pointLights` | array | Individual light sources (torches, candles) |
| `geometry.size` | [w,h,d] | Room dimensions in world units |
| `geometry.floorColor` | hex | Floor material color |
| `geometry.wallColor` | hex | Wall material color |
| `spawn.position` | [x,y,z] | Where the player appears on entry |
| `exits[].exitPosition` | [x,y,z] | **World** coordinates to return player to exterior |

### How Exits Connect to Exteriors

The `exitPosition` in an interior's exit must match the `exitPosition` in the corresponding exterior door entry. When a player exits, the camera is placed at `exitPosition` in world space, and the exterior cells reload around that location.

**Example flow:**
1. Cell `[-1,-1]` has a door: `{ target: "village_tavern", exitPosition: [-39, 2, -37] }`
2. Interior `village_tavern` has exit: `{ exitPosition: [-39, 2, -37] }`
3. Player enters door → interior loads, player spawns at interior's `spawn.position`
4. Player uses exit → exterior reloads, player placed at `[-39, 2, -37]` (world space)

---

## 4. Dialogue (`public/world/dialogue/`)

Dialogue files define branching conversation trees with NPC text and player choices.

### Full Schema

```json
{
  "id": "dialogue_id",
  "npcName": "NPC Display Name",
  "nodes": {
    "start": {
      "text": "NPC's spoken text goes here.",
      "choices": [
        { "text": "Player choice text", "next": "node_id" },
        { "text": "Choice with action", "next": "node_id", "action": { "type": "...", ... } },
        { "text": "End conversation", "next": null }
      ]
    },
    "node_id": {
      "text": "More NPC text...",
      "choices": [
        { "text": "Goodbye.", "next": null }
      ]
    }
  }
}
```

### Rules

- Every dialogue **must** have a `"start"` node — this is always the entry point
- `"next": null` ends the conversation
- `"next": "node_id"` advances to another node
- Each node must have at least one choice (even if it's just "Goodbye")

### Choice Actions

Actions fire when the player selects a choice (before navigating to `next`):

| Action Type | Fields | Effect |
|-------------|--------|--------|
| `quest_start` | `questId` | Starts a quest (loads quest JSON, begins tracking) |
| `buy` | `itemId`, `cost` | Player purchases an item (deducts gold) |
| `give_item` | `itemId`, `itemType`, `icon`, `quantity` | Gives item to player |
| `set_flag` | `flag`, `value` (optional, default: true) | Sets a world flag |

### Action Examples

```json
{ "type": "quest_start", "questId": "swamp_bounty" }
{ "type": "buy", "itemId": "potion_health_minor", "cost": 10 }
{ "type": "give_item", "itemId": "key_cellar", "itemType": "key", "icon": "🔑", "quantity": 1 }
{ "type": "set_flag", "flag": "knows_deep_woods_danger" }
```

### Best Practices for AI-Generated Dialogue

1. **Keep nodes focused** — each node should convey one idea/topic
2. **Always provide 2–4 choices** per node
3. **Always offer an exit** — at least one choice with `"next": null`
4. **Use natural language** — write as the character would speak
5. **Gate quests behind information** — let the player learn context before accepting
6. **Use `set_flag` for future content hooks** — flags can gate content later
7. **Shop nodes should loop** — let players buy multiple items before leaving
8. **Node IDs should be descriptive** — `"swamp_info"` not `"node_3"`

---

## 5. Quests (`public/world/quests/`)

Quests are standalone JSON files that define objectives, rewards, and turn-in conditions. The QuestSystem auto-tracks progress via events.

### Full Schema

```json
{
  "id": "quest_id",
  "title": "Quest Display Title",
  "description": "Full quest description shown in journal.",
  "giver": "npc_id",
  "objectives": [
    {
      "id": "objective_id",
      "type": "kill|collect|talk|explore",
      "target": "target_id",
      "count": 5,
      "current": 0,
      "label": "Human-readable objective text"
    }
  ],
  "rewards": {
    "gold": 50,
    "items": [
      {
        "id": "item_id",
        "name": "Item Display Name",
        "type": "weapon|armor|accessory|consumable",
        "icon": "emoji"
      }
    ],
    "xp": 100
  },
  "turnIn": "npc_id",
  "completionDialogue": "Text shown when quest is turned in."
}
```

### Objective Types

| Type | `target` Value | Tracked Via Event | Description |
|------|---------------|-------------------|-------------|
| `kill` | enemy asset name (e.g., `"enemy_bog_creature"`) | `enemy:killed` | Kill N enemies of this type |
| `collect` | item ID (e.g., `"ancient_relic"`) | `item:collected` | Collect N of this item |
| `talk` | NPC ID (e.g., `"tavern_keeper"`) | `dialogue:ended` | Talk to this NPC |
| `explore` | interior ID (e.g., `"watchtower_interior"`) | `world:enter_interior` | Enter this location |

### How Auto-Tracking Works

The QuestSystem listens to game events and automatically increments matching objective counters:

- `enemy:killed { asset }` → increments `kill` objectives where `target === asset`
- `item:collected { id }` → increments `collect` objectives where `target === id`
- `dialogue:ended { npcId }` → increments `talk` objectives where `target === npcId`
- `world:enter_interior { interiorId }` → increments `explore` objectives where `target === interiorId`

When all objectives reach their `count`, the quest becomes **ready to turn in**. The player must talk to the `turnIn` NPC to receive rewards.

### Reward Types

| Field | Type | Description |
|-------|------|-------------|
| `gold` | number | Currency awarded |
| `items` | array | Items given to player inventory |
| `xp` | number | Experience points awarded |

### Quest Design Rules

1. `id` must match the filename (e.g., `swamp_bounty.json` → `"id": "swamp_bounty"`)
2. `giver` should match an NPC `id` that has a dialogue action `quest_start` for this quest
3. `turnIn` is usually the same as `giver` but can be different
4. `current` should always start at `0`
5. Kill objectives use enemy **asset names** (e.g., `"enemy_crab_01"`)
6. Explore objectives use **interior IDs** as registered in `world_grid.json`

---

## 6. World Grid Manifest (`world_grid.json`)

The top-level file that registers all cells and interiors.

### Schema

```json
{
  "name": "World Name",
  "description": "World description.",
  "cellSize": 64,
  "environment": {
    "ambientLight": { "color": "#ffffff", "intensity": 0.35 },
    "directionalLight": {
      "color": "#fff4e0",
      "intensity": 1.0,
      "direction": [-0.5, -1, -0.3]
    },
    "fog": { "color": "#b8ccdd", "near": 80, "far": 250 },
    "skyColor": "#7bafd4"
  },
  "playerSpawn": {
    "position": [32, 2, 32],
    "rotation": [0, 0, 0]
  },
  "cells": [
    { "x": 0, "y": 0, "file": "cells/0_0_beach_south.json", "biome": "beach", "name": "Southern Shore" }
  ],
  "interiors": [
    { "id": "village_tavern", "file": "interiors/village_tavern.json", "name": "The Salty Dog" }
  ]
}
```

### Registering a New Cell

Add an entry to the `cells` array:
```json
{ "x": 2, "y": 0, "file": "cells/2_0_desert.json", "biome": "desert", "name": "Eastern Sands" }
```

### Registering a New Interior

Add an entry to the `interiors` array:
```json
{ "id": "blacksmith_shop", "file": "interiors/blacksmith_shop.json", "name": "Iron & Ember" }
```

### Environment Fields

| Field | Description |
|-------|-------------|
| `ambientLight` | Fill light for all exterior scenes |
| `directionalLight` | Sun/moon (color, intensity, direction vector) |
| `fog` | Distance fog (near/far in world units) |
| `skyColor` | Background sky color |

---

## 7. Asset Registry (`assets.json`)

Maps asset IDs to model paths and metadata. Currently the CellLoader uses **procedural geometry** (no .glb files loaded), so this serves as documentation and future-proofing.

### Schema

```json
{
  "assets": {
    "asset_id": {
      "model": "models/category/file.glb",
      "tags": ["tag1", "tag2"],
      "scale": 1.0,
      "collider": "box|cylinder|convex",
      "interior": "optional_interior_id",
      "light": { "color": "#hex", "intensity": 0.8, "range": 8 },
      "animations": ["idle", "walk", "attack"]
    }
  }
}
```

### Current Registered Assets

| ID | Tags | Notes |
|----|------|-------|
| `tree_palm_01` | nature, tree, tropical | Standard palm |
| `tree_palm_02` | nature, tree, tropical | Variant palm |
| `rock_coastal_01` | nature, rock, coastal | Small coastal rock |
| `rock_coastal_02` | nature, rock, coastal | Large coastal rock |
| `boat_small_01` | prop, vehicle, boat | Beached boat |
| `house_wood_01` | structure, building, village | Wooden house |
| `chest_wooden` | prop, container, loot | Loot chest |
| `npc_villager_male` | npc, humanoid, villager | Male villager model |
| `npc_guard` | npc, humanoid, guard | Guard model |
| `enemy_crab_01` | enemy, creature, beach | Beach crab |
| `torch_standing` | prop, light, fire | Standing torch |
| `campfire` | prop, light, fire | Campfire with light |

---

## 8. AI Content Generation Prompts

Copy-paste these prompts to generate valid content with any LLM.

### Cell Prompt

```
Generate a JSON exterior cell for the game "Light of Mine".

SCHEMA:
{
  "id": "X_Y_name", "name": "...", "biome": "...",
  "terrain": { "type": "procedural", "baseColor": "#hex", "roughness": 0-1, "noiseScale": 0.08, "noiseAmplitude": 2.0, "blendRegions": [...] },
  "objects": [{ "asset": "...", "position": [x,y,z], "rotation": [0,deg,0], "scale": 1.0 }],
  "npcs": [{ "id": "...", "asset": "npc_*", "name": "...", "position": [...], "rotation": [...], "behavior": "idle", "dialogue": "dialogue/file.json" }],
  "items": [{ "id": "...", "asset": "chest_wooden", "position": [...], "contents": ["item_id"] }],
  "doors": [{ "id": "...", "position": [...], "rotation": [...], "target": "interior_id", "exitPosition": [world_x, world_y, world_z], "label": "..." }],
  "triggers": [{ "id": "...", "type": "once", "shape": "sphere", "position": [...], "radius": 6, "event": "spawn_enemies", "data": { "enemies": [{ "asset": "enemy_*", "position": [...] }] } }]
}

AVAILABLE ASSETS: tree_palm_01, tree_palm_02, tree_pine_01, tree_oak_01, tree_ancient_01, tree_dead_01, rock_cliff_01, rock_coastal_01, rock_coastal_02, rock_boulder_01, rock_mossy_01, house_wood_01, hut_01, ruin_wall_01, ruin_tower_01, ruin_pillar_01, torch_standing, campfire, mushroom_01, mushroom_glowing_01, fallen_log_01, boat_small_01, fence_01, barrel_01, crate_01, market_stall_01, well_01, cobweb_01, swamp_water_01, lily_pad_01, driftwood_01, mining_node_01, snow_patch_01

AVAILABLE ENEMIES: enemy_crab_01, enemy_wolf_01, enemy_spider_01, enemy_spider_large, enemy_skeleton_01, enemy_skeleton_archer, enemy_bog_creature

REQUIREMENTS: [Describe what this cell should contain]

RULES:
- Cell is 64×64 units. Object positions range roughly -30 to +30 on X and Z.
- Y=0 is ground level. Terrain noise handles actual elevation.
- Include 8-15 objects for visual interest.
- Include blendRegions to match adjacent cells.
- Biomes: beach, forest, swamp, mountain, ruins, village, coast.
- Use the naming pattern: X_Y_biome for the id (e.g., "2_0_desert").
```

### Interior Prompt

```
Generate a JSON interior for the game "Light of Mine".

SCHEMA:
{
  "id": "interior_id", "name": "...",
  "environment": { "ambientLight": { "color": "#hex", "intensity": 0.3 }, "pointLights": [{ "position": [x,y,z], "color": "#hex", "intensity": 0.8, "range": 10 }] },
  "geometry": { "size": [width, height, depth], "floorColor": "#hex", "wallColor": "#hex" },
  "spawn": { "position": [0, 1, z], "rotation": [0, 0, 0] },
  "objects": [{ "asset": "...", "position": [...], "rotation": [...], "scale": 1.0 }],
  "npcs": [{ "id": "...", "asset": "npc_*", "name": "...", "position": [...], "rotation": [...], "behavior": "idle", "dialogue": "dialogue/file.json" }],
  "items": [{ "id": "...", "asset": "chest_wooden", "position": [...], "contents": [...] }],
  "exits": [{ "id": "...", "position": [0, 0, z], "exitPosition": [world_x, world_y, world_z], "label": "Exit to ..." }]
}

INTERIOR ASSETS: table_wooden, chair_wooden, barrel_01, crate_01, torch_standing, chest_wooden, chest_ornate

REQUIREMENTS: [Describe what this interior should contain]

RULES:
- Coordinates are local, centered at origin.
- Spawn should be near the exit (the player enters from the exit).
- Place exit at one edge of the room (typically +Z wall).
- exitPosition must match the corresponding door's exitPosition in the exterior cell.
- Include 2-3 point lights for atmosphere.
- Room sizes typically range from [8,3,8] (small) to [16,5,14] (large).
```

### Dialogue Prompt

```
Generate NPC dialogue JSON for the game "Light of Mine".

SCHEMA:
{
  "id": "dialogue_id", "npcName": "...",
  "nodes": {
    "start": { "text": "...", "choices": [{ "text": "...", "next": "node_id|null", "action": { "type": "quest_start|buy|give_item|set_flag", ... } }] },
    "node_id": { "text": "...", "choices": [...] }
  }
}

AVAILABLE ACTIONS:
- { "type": "quest_start", "questId": "quest_file_id" }
- { "type": "buy", "itemId": "item_id", "cost": 10 }
- { "type": "give_item", "itemId": "item_id", "itemType": "misc", "icon": "emoji", "quantity": 1 }
- { "type": "set_flag", "flag": "flag_name" }

REQUIREMENTS: [Describe the NPC personality and what they should discuss]

RULES:
- Must have a "start" node.
- "next": null ends the conversation.
- Include 2-4 choices per node.
- Always offer a way to leave the conversation.
- Write dialogue in character voice.
- Use descriptive node IDs (e.g., "shop", "quest_info", "farewell").
- Keep NPC text under 200 characters for readability.
```

### Quest Prompt

```
Generate a quest JSON for the game "Light of Mine".

SCHEMA:
{
  "id": "quest_id", "title": "...", "description": "...", "giver": "npc_id",
  "objectives": [{ "id": "obj_id", "type": "kill|collect|talk|explore", "target": "...", "count": N, "current": 0, "label": "..." }],
  "rewards": { "gold": N, "items": [{ "id": "item_id", "name": "...", "type": "weapon|armor|accessory|consumable", "icon": "emoji" }], "xp": N },
  "turnIn": "npc_id",
  "completionDialogue": "Turn-in text from NPC."
}

AVAILABLE KILL TARGETS: enemy_crab_01, enemy_wolf_01, enemy_spider_01, enemy_spider_large, enemy_skeleton_01, enemy_skeleton_archer, enemy_bog_creature

OBJECTIVE TYPES:
- kill: target = enemy asset name, tracked via enemy:killed events
- collect: target = item ID, tracked via item:collected events
- talk: target = NPC ID, tracked via dialogue:ended events
- explore: target = interior ID, tracked via world:enter_interior events

REQUIREMENTS: [Describe what the quest should involve]

RULES:
- id must match the filename (quest_id.json).
- giver should reference an existing NPC id.
- current must always be 0.
- Keep kill counts reasonable (3-8).
- XP rewards: easy=50, medium=100-150, hard=200+
- Gold rewards: easy=25-50, medium=50-100, hard=100-200
- turnIn is usually the same as giver.
```

---

## 9. Enemy Types Reference

All enemy types defined in `EnemySystem.js`:

| Asset Name | HP | Damage | Speed | Attack Range | Detect Range | Cooldown | Shape | Recommended Biome |
|---|---|---|---|---|---|---|---|---|
| `enemy_crab_01` | 30 | 5 | 3 | 1.8 | 12 | 1.5s | Box (0.8×0.5×0.8) | Beach, Coast |
| `enemy_wolf_01` | 45 | 8 | 5 | 2.0 | 18 | 1.2s | Capsule (r:0.3, h:0.8) | Forest |
| `enemy_spider_01` | 25 | 6 | 4 | 1.5 | 14 | 1.0s | Sphere (r:0.5) | Forest, Ruins |
| `enemy_spider_large` | 60 | 12 | 3 | 2.5 | 16 | 1.8s | Sphere (r:0.9) | Deep Forest, Caves |
| `enemy_skeleton_01` | 50 | 10 | 3.5 | 2.2 | 15 | 1.3s | Capsule (r:0.35, h:1.2) | Ruins, Mountains |
| `enemy_skeleton_archer` | 35 | 8 | 2.5 | 15.0 | 20 | 2.0s | Capsule (r:0.35, h:1.2) | Ruins, Mountains |
| `enemy_bog_creature` | 70 | 14 | 2 | 2.5 | 10 | 2.5s | Sphere (r:1.2) | Swamp |

### Difficulty Guidelines

- **Easy encounters (beach/starting areas):** 2-3 crabs
- **Medium encounters (forest/village outskirts):** 2 wolves or 3-4 small spiders
- **Hard encounters (ruins/mountains):** 2 skeletons + 1 archer, or 1 large spider + 2 small
- **Boss-tier encounters (deep areas):** 3 bog creatures or 2 large spiders + 2 archers

### Loot Drops

All enemies drop loot on death:
- 50% chance: Gold (5–15)
- 20% chance: Health Potion
- 20% chance: XP Orb
- 10% chance: Nothing

XP per kill: 15–30 (random)

---

## 10. Event Reference

All events in the system that content can trigger or interact with:

### Player Events

| Event | Payload | Description |
|-------|---------|-------------|
| `player:damaged` | `{ amount }` | Player takes damage |
| `player:xp` | `{ amount }` | Player gains XP |
| `player:died` | `{}` | Player health reached 0 |

### Combat Events

| Event | Payload | Description |
|-------|---------|-------------|
| `combat:slash` | `{ power }` | Player melee attack (0–1 power) |
| `combat:projectile_hit` | `{ position, damage }` | Projectile impacts |

### Enemy Events

| Event | Payload | Description |
|-------|---------|-------------|
| `enemy:spawned` | `{ id, asset, position }` | Enemy appeared |
| `enemy:damaged` | `{ id, amount, remaining }` | Enemy took damage |
| `enemy:killed` | `{ id, asset, position }` | Enemy died |

### Item Events

| Event | Payload | Description |
|-------|---------|-------------|
| `item:collected` | `{ id, name, type, quantity }` | Item picked up |
| `item:used` | `{ id }` | Item consumed |
| `item:equipped` | `{ id }` | Item equipped |
| `item:purchased` | `{ itemId, cost }` | Item bought from shop |

### Quest Events

| Event | Payload | Description |
|-------|---------|-------------|
| `quest:started` | `{ questId }` | Quest activated |
| `quest:added` | `{ quest }` | Quest loaded and tracking |
| `quest:objective_updated` | `{ questId, objectiveId, label, current, count }` | Progress incremented |
| `quest:ready` | `{ questId, quest }` | All objectives complete |
| `quest:completed` | `{ questId, quest }` | Quest turned in, rewards given |

### World Events

| Event | Payload | Description |
|-------|---------|-------------|
| `world:cells_changed` | `{}` | Player moved to new cell |
| `world:cell_loaded` | `{ cellX, cellY }` | Cell streamed in |
| `world:cell_unloaded` | `{ cellX, cellY }` | Cell streamed out |
| `world:enter_interior` | `{ interiorId }` | Player entered interior |
| `world:exit_interior` | `{ exitPosition }` | Player left interior |
| `world:door_entered` | `{ target }` | Door interaction |
| `world:flag_set` | `{ flag, value }` | World flag changed |

### Dialogue Events

| Event | Payload | Description |
|-------|---------|-------------|
| `dialogue:start` | `{ npcId, npcName, dialogueFile }` | Conversation begun |
| `dialogue:ended` | `{ npcId }` | Conversation finished |

### Interaction Events

| Event | Payload | Description |
|-------|---------|-------------|
| `interaction:available` | `{ type, id, label }` | Player near interactable |
| `interaction:triggered` | `{ type, id, data }` | Player interacted |

### Game State Events

| Event | Payload | Description |
|-------|---------|-------------|
| `game:paused` | `{}` | Game paused (dialogue, menu) |
| `game:resumed` | `{}` | Game unpaused |
| `game:saved` | `{}` | Game state saved |

---

## 11. Quick Start: Adding a New Cell

### Step-by-step

**1. Choose grid coordinates**
Pick an unoccupied `[x, y]` position. Check `world_grid.json` cells array for existing positions. Extend the map logically (e.g., `[2, 0]` is east of `[1, 0]`).

**2. Create the cell file**
Create `public/world/cells/X_Y_name.json` (e.g., `2_0_desert.json`).

**3. Write cell JSON**
Use the schema from Section 2. At minimum you need:
```json
{
  "id": "2_0_desert",
  "name": "Eastern Sands",
  "biome": "beach",
  "terrain": {
    "type": "procedural",
    "baseColor": "#d4b896",
    "roughness": 0.95,
    "blendRegions": [
      { "edge": "west", "color": "#c2a86b", "width": 10 }
    ]
  },
  "objects": [],
  "npcs": [],
  "items": [],
  "doors": [],
  "triggers": []
}
```

**4. Register in world_grid.json**
Add to the `cells` array:
```json
{ "x": 2, "y": 0, "file": "cells/2_0_desert.json", "biome": "beach", "name": "Eastern Sands" }
```

**5. Add blend regions to adjacent cells**
Update the neighboring cell (e.g., `1_0_beach_east.json`) to add a blend region on its `east` edge matching your new cell's base color:
```json
{ "edge": "east", "color": "#d4b896", "width": 10 }
```

**6. Populate with content**
Add objects (8–15 recommended), optional NPCs, items, doors to interiors, and enemy triggers.

**7. Test**
Run the game and walk to the new cell. Verify terrain blends smoothly and objects render.

---

## 12. Quick Start: Adding a New Quest

### Step-by-step

**1. Design the quest**
Decide: What does the player do? Who gives it? What's the reward?

**2. Create the quest file**
Create `public/world/quests/quest_id.json`:
```json
{
  "id": "forest_wolves",
  "title": "Wolf Pack",
  "description": "A pack of wolves has been attacking travelers on the forest road. Thin their numbers.",
  "giver": "guard_village",
  "objectives": [
    {
      "id": "kill_wolves",
      "type": "kill",
      "target": "enemy_wolf_01",
      "count": 4,
      "current": 0,
      "label": "Kill wolves in the forest"
    }
  ],
  "rewards": {
    "gold": 60,
    "items": [
      { "id": "cloak_wolf", "name": "Wolfskin Cloak", "type": "armor", "icon": "🧥" }
    ],
    "xp": 120
  },
  "turnIn": "guard_village",
  "completionDialogue": "Four wolves down? The road should be safer now. Take this cloak — made from the last pack we dealt with."
}
```

**3. Add quest start to NPC dialogue**
Edit (or create) the giver NPC's dialogue file. Add a choice with `quest_start` action:
```json
{ "text": "I'll deal with the wolves.", "next": null, "action": { "type": "quest_start", "questId": "forest_wolves" } }
```

**4. Ensure enemies exist in the world**
Make sure the target enemies can actually be encountered. Either:
- Add trigger volumes in the relevant cell(s) that spawn `enemy_wolf_01`
- Or verify existing triggers already spawn the needed enemy type

**5. Verify the turn-in NPC exists**
The `turnIn` NPC must be accessible in the world with a matching `id`.

**6. Test the full loop**
1. Talk to giver NPC → accept quest
2. Kill/collect/explore as required
3. Return to turn-in NPC → receive rewards
4. Verify quest appears in journal and objectives update

### Common Mistakes to Avoid

- ❌ Quest `id` doesn't match filename
- ❌ `target` in kill objective doesn't match exact enemy asset name
- ❌ `turnIn` NPC doesn't exist in any cell
- ❌ `current` set to non-zero value
- ❌ Missing `quest_start` action in giver's dialogue
- ❌ Explore objective targets a non-existent interior ID

---

## World Map (Island of Ashvael)

```
Grid layout (north is up):

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

★ = Player spawn cell (0,0)
North = -Y (walking north decreases Z in world space)
```
