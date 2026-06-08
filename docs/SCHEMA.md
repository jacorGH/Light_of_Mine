# Light of Mine — World Schema Documentation

## Architecture: Morrowind-Style Open World

The world is a **seamless, streaming open landscape** divided into a grid of cells. The player walks freely between cells with no loading screens. Only **interiors** (buildings, caves, dungeons) use scene transitions.

### How It Works

1. The **world grid manifest** (`world_grid.json`) defines all cells and their grid coordinates
2. The **WorldGrid** engine tracks the player's current cell position
3. Cells within a **view radius** (default: 2 cells) are loaded into the scene
4. Cells outside the radius are **unloaded** (geometry disposed, removed from scene)
5. Each cell is a **THREE.Group** positioned at `(cellX * cellSize, 0, cellY * cellSize)` in world space
6. Object positions within a cell are **local to the cell origin**

```
View radius = 2 means a 5x5 grid of cells loaded around the player:

    [ ][ ][ ][ ][ ]
    [ ][ ][ ][ ][ ]
    [ ][ ][P][ ][ ]   P = Player's current cell
    [ ][ ][ ][ ][ ]
    [ ][ ][ ][ ][ ]
```

---

## File Structure

```
public/world/
├── world_grid.json              # World manifest — cell registry + global environment
├── assets.json                  # Asset registry (model paths, metadata)
├── cells/                       # Exterior cell definitions (one file per cell)
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
└── prefabs/                     # Reusable object arrangements
    └── guard_post.json
```

---

## World Grid Manifest (`world_grid.json`)

The top-level file that defines the world.

```json
{
  "name": "Island of Ashvael",
  "description": "A volcanic island with beaches, forests, ruins, and a small fishing village.",
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
    { "x": 0, "y": 0, "file": "cells/0_0_beach_south.json", "biome": "beach", "name": "Southern Shore" },
    { "x": 1, "y": 0, "file": "cells/1_0_beach_east.json", "biome": "beach", "name": "Eastern Tidepools" }
  ],
  "interiors": [
    { "id": "village_tavern", "file": "interiors/village_tavern.json", "name": "The Salty Dog" }
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | World/region name |
| `cellSize` | number | Width/depth of each cell in world units (default 64) |
| `environment` | object | Global lighting, fog, sky (applies to all exterior cells) |
| `playerSpawn` | object | Default spawn position and rotation for new game |
| `cells` | array | List of all exterior cells with grid coords and file paths |
| `interiors` | array | List of all interior scenes with IDs and file paths |

### Cell Reference

| Field | Type | Description |
|-------|------|-------------|
| `x` | integer | Grid X coordinate (east = positive) |
| `y` | integer | Grid Y coordinate (south = positive) |
| `file` | string | Path to cell JSON file (relative to `/world/`) |
| `biome` | string | Biome tag for the cell |
| `name` | string | Display name of the area |

---

## Exterior Cell Definition (e.g., `cells/0_0_beach_south.json`)

Each cell is a 64x64 world-unit area with its own terrain, objects, NPCs, items, doors, and triggers.

**All positions within a cell are LOCAL** — `[0,0,0]` is the cell center, ranging from `[-32,-,−32]` to `[32,-,32]`.

```json
{
  "id": "0_0_beach_south",
  "name": "Southern Shore",
  "biome": "beach",
  "terrain": {
    "type": "procedural",
    "baseColor": "#c2a86b",
    "roughness": 0.95,
    "noiseScale": 0.08,
    "noiseAmplitude": 2.0,
    "blendRegions": [
      { "edge": "north", "color": "#5a8a3c", "width": 10 }
    ]
  },
  "objects": [
    { "asset": "tree_palm_01", "position": [12, 0, -5], "rotation": [0, 45, 0], "scale": 1.2 }
  ],
  "npcs": [
    {
      "id": "fisherman_01",
      "asset": "npc_villager_male",
      "name": "Old Harren",
      "position": [22, 0, 8],
      "rotation": [0, 180, 0],
      "behavior": "idle",
      "dialogue": "dialogue/fisherman_01.json"
    }
  ],
  "items": [
    {
      "id": "beach_chest_01",
      "asset": "chest_wooden",
      "position": [50, 0.3, -12],
      "contents": ["potion_health_minor", "gold_5"]
    }
  ],
  "doors": [
    {
      "id": "cave_entrance",
      "position": [58, 1, -18],
      "rotation": [0, 90, 0],
      "target": "beach_cave",
      "exitPosition": [58, 2, -16],
      "label": "Tidal Grotto"
    }
  ],
  "triggers": [
    {
      "id": "crab_ambush",
      "type": "once",
      "shape": "sphere",
      "position": [38, 0, 5],
      "radius": 6,
      "event": "spawn_enemies",
      "data": {
        "enemies": [
          { "asset": "enemy_crab_01", "position": [40, 0, 7] }
        ]
      }
    }
  ]
}
```

### Terrain Object

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"procedural"` (generated) or `"heightmap"` (future: texture-based) |
| `baseColor` | hex string | Ground color for the cell |
| `roughness` | 0-1 | PBR roughness of terrain material |
| `noiseScale` | number | Frequency of terrain noise (higher = more hills per unit) |
| `noiseAmplitude` | number | Max height of terrain features |
| `blendRegions` | array | Color blending at cell edges for smooth biome transitions |

### Blend Region

| Field | Type | Description |
|-------|------|-------------|
| `edge` | string | `"north"`, `"south"`, `"east"`, `"west"` |
| `color` | hex string | Color to blend toward at this edge |
| `width` | number | How far (in units) the blend extends from the edge |

### Object

| Field | Type | Description |
|-------|------|-------------|
| `asset` | string | Asset ID from `assets.json` |
| `position` | [x, y, z] | Local position within cell |
| `rotation` | [x, y, z] | Euler angles in degrees |
| `scale` | number or [x,y,z] | Uniform or per-axis scale |

### NPC

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique NPC identifier |
| `asset` | string | Character model asset ID |
| `name` | string | Display name |
| `position` | [x, y, z] | Local position |
| `rotation` | [x, y, z] | Facing direction |
| `behavior` | string | `"idle"`, `"patrol"`, `"wander"` |
| `patrol_points` | array | For patrol behavior: array of [x,y,z] waypoints |
| `wander_radius` | number | For wander behavior: max distance from spawn |
| `dialogue` | string | Path to dialogue JSON file |

### Item

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique item identifier |
| `asset` | string | Visual model asset ID |
| `position` | [x, y, z] | Local position |
| `contents` | array | List of item IDs contained (for chests/containers) |

### Door (Exterior → Interior transition)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique door identifier |
| `position` | [x, y, z] | Local position of the door |
| `rotation` | [x, y, z] | Door facing |
| `target` | string | Interior ID to load (matches `interiors[].id` in world_grid.json) |
| `exitPosition` | [x, y, z] | World position to place player when exiting this interior |
| `label` | string | Display text (e.g., "Enter Tavern") |

### Trigger

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique trigger identifier |
| `type` | string | `"once"` (fires once), `"repeatable"`, `"toggle"` |
| `shape` | string | `"sphere"`, `"box"` |
| `position` | [x, y, z] | Center of trigger volume |
| `radius` | number | For sphere triggers |
| `event` | string | Event type to fire (e.g., `"spawn_enemies"`, `"start_dialogue"`) |
| `data` | object | Event-specific payload |

---

## Interior Definition (e.g., `interiors/village_tavern.json`)

Interiors use their own local coordinate system (origin at center). They replace the exterior view when entered.

```json
{
  "id": "village_tavern",
  "name": "The Salty Dog",
  "environment": {
    "ambientLight": { "color": "#ffddaa", "intensity": 0.3 },
    "pointLights": [
      { "position": [0, 3, 0], "color": "#ff9944", "intensity": 0.8, "range": 10 },
      { "position": [4, 3, -3], "color": "#ff8833", "intensity": 0.5, "range": 6 }
    ]
  },
  "geometry": {
    "size": [12, 4, 10],
    "floorColor": "#4a3a2a",
    "wallColor": "#5a4a3a"
  },
  "spawn": {
    "position": [0, 1, 4],
    "rotation": [0, 0, 0]
  },
  "objects": [
    { "asset": "table_wooden", "position": [2, 0, -1], "rotation": [0, 0, 0], "scale": 1.0 },
    { "asset": "chair_wooden", "position": [3, 0, -1], "rotation": [0, 90, 0], "scale": 1.0 },
    { "asset": "chair_wooden", "position": [1, 0, -1], "rotation": [0, -90, 0], "scale": 1.0 },
    { "asset": "barrel_01", "position": [-4, 0, -3], "rotation": [0, 0, 0], "scale": 1.0 },
    { "asset": "barrel_01", "position": [-4, 0, -2], "rotation": [0, 30, 0], "scale": 1.0 }
  ],
  "npcs": [
    {
      "id": "tavern_keeper",
      "asset": "npc_villager_male",
      "name": "Burl Deepcup",
      "position": [-2, 0, -3],
      "rotation": [0, 0, 0],
      "behavior": "idle",
      "dialogue": "dialogue/tavern_keeper.json"
    }
  ],
  "items": [
    {
      "id": "tavern_lockbox",
      "asset": "chest_wooden",
      "position": [-5, 0.5, -4],
      "contents": ["gold_50", "key_cellar"]
    }
  ],
  "exits": [
    {
      "id": "tavern_exit",
      "position": [0, 0, 4.5],
      "exitPosition": [-39, 2, -39],
      "label": "Exit to Village"
    }
  ]
}
```

---

## Asset Registry (`assets.json`)

All 3D assets the system knows about. Models are referenced by ID throughout the cell/interior files.

```json
{
  "assets": {
    "tree_palm_01": {
      "model": "models/nature/tree_palm_01.glb",
      "tags": ["nature", "tree", "tropical"],
      "scale": 1.0,
      "collider": "cylinder"
    },
    "house_wood_01": {
      "model": "models/structures/house_wood_01.glb",
      "tags": ["structure", "building"],
      "scale": 1.0,
      "collider": "box",
      "interior": "house_wood_01_interior"
    },
    "npc_guard": {
      "model": "models/characters/guard.glb",
      "tags": ["npc", "humanoid"],
      "scale": 1.0,
      "animations": ["idle", "walk", "attack"]
    }
  }
}
```

---

## Prefab Definition (e.g., `prefabs/guard_post.json`)

Reusable arrangements that can be stamped into any cell.

```json
{
  "id": "guard_post",
  "description": "A guard station with a torch and patrolling guard",
  "objects": [
    { "asset": "structure_guard_booth", "position": [0, 0, 0] },
    { "asset": "torch_standing", "position": [1.5, 0, 0] }
  ],
  "npcs": [
    {
      "asset": "npc_guard",
      "position": [0, 0, 2],
      "behavior": "patrol",
      "patrol_points": [[0,0,2],[5,0,2],[5,0,-2],[0,0,-2]]
    }
  ]
}
```

### Using a prefab in a cell:
```json
{ "prefab": "guard_post", "position": [30, 0, 10], "rotation": [0, 45, 0] }
```

---

## Coordinate System

| Axis | Direction |
|------|-----------|
| X | East (+) / West (-) |
| Y | Up (+) / Down (-) |
| Z | South (+) / North (-) |

- **Cell grid:** `x` increases eastward, `y` increases southward
- **Cell size:** 64 world units (configurable in `world_grid.json`)
- **Cell world origin:** `(cellX * 64, 0, cellY * 64)`
- **Player height:** Fixed at Y=2 (until terrain following is implemented)

---

## AI Content Generation

The schema is designed so an LLM can generate valid cells and interiors.

### Prompt Template for Generating a New Cell

```
Generate a JSON exterior cell definition for Light of Mine.
Grid position: [x, y]
Biome: [beach / forest / swamp / mountain / ruins / village / coast]
Adjacent cells: [describe neighbors for blend regions]
Available assets: [paste from assets.json]

Requirements: [describe the area]

Rules:
- Cell is 64x64 units. Object positions range roughly -30 to +30 on X and Z.
- Y=0 is ground level. Terrain noise handles elevation.
- Include terrain, objects, NPCs, items, doors (if buildings), and triggers.
- Follow the schema in SCHEMA.md exactly.
```

### Prompt Template for Generating an Interior

```
Generate a JSON interior definition for Light of Mine.
Interior ID: [id matching world_grid.json]
Type: [tavern / cave / dungeon / house / shop]
Available assets: [paste from assets.json]

Requirements: [describe the interior]

Rules:
- Interiors use local coordinates centered at origin.
- Include environment (lighting), geometry (room size), spawn point, objects, NPCs, items, and exits.
- Follow the interior schema in SCHEMA.md exactly.
```

---

## World Map (Current: Island of Ashvael)

```
Grid layout (looking down, north is up):

        West (-x)    Center    East (+x)
        ─────────────────────────────────
North   │ Swamp    │ Deep    │ Mountain │   y = -2
(-y)    │ Bogmire  │ Woods   │ Ashpeak  │
        ─────────────────────────────────
        │ Village  │ Forest  │ Ruins    │   y = -1
        │ Drift.   │ Ashwood │ Tower    │
        ─────────────────────────────────
South   │ Cliffs   │ Beach   │ Tidepools│   y = 0
(+y)    │ Western  │ South   │ Eastern  │
        ─────────────────────────────────

Player spawns in cell (0,0) — Southern Shore.
Walking north (Z decreasing) takes you through forest, then to deep woods/village/mountains.
```

---

## Key Types Reference

| Field | Type | Description |
|-------|------|-------------|
| position | [x, y, z] | Coordinates (y = up) |
| rotation | [x, y, z] | Euler angles in degrees |
| scale | number or [x,y,z] | Uniform or per-axis scale |
| color | "#rrggbb" | Hex color string |
| intensity | 0.0 - 1.0+ | Light brightness |

---

## Future Extensions

- **Heightmap terrain:** Load grayscale PNG for precise terrain sculpting
- **LOD system:** Distant cells render simplified geometry
- **Quests:** Separate quest JSON files referencing cells, NPCs, and items
- **Weather:** Per-cell or global weather system with transitions
- **Day/night cycle:** Lighting presets that animate over time
- **Procedural scattering:** Rules-based object placement (forests, rocks)
- **Audio:** Ambient soundscapes per biome/cell
- **Water system:** Ocean/rivers/lakes with shader-based rendering
- **NPC schedules:** Time-based NPC behavior (Morrowind-style)
