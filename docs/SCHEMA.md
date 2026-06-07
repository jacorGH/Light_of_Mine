# Light of Mine — World Definition Schema

## Philosophy

The world is built from **Areas** (cells). Each area is a self-contained JSON file that describes everything needed to render and interact with that space. An AI (or a human with a text editor) can generate new areas by producing valid JSON following this schema.

### Design Principles

1. **One file = one area** — A dungeon room, a town square, a forest clearing
2. **Assets are referenced, not embedded** — JSON points to .glb/.gltf model files by ID
3. **Prefabs for reuse** — Common arrangements (a table with chairs, a guard post) are defined once and stamped
4. **Connections between areas** — Doors/portals link areas together, forming the world graph
5. **AI-generatable** — Clear, flat structure that LLMs can produce without hallucinating nested complexity

---

## Schema Overview

```
world/
├── assets.json          # Asset registry (model paths, metadata)
├── prefabs/             # Reusable object arrangements
│   ├── guard_post.json
│   └── tavern_table.json
└── areas/               # Individual area definitions
    ├── island_beach.json
    ├── island_village.json
    └── island_cave_01.json
```

---

## Asset Registry (`assets.json`)

Defines all available 3D assets the system knows about.

```json
{
  "assets": {
    "tree_pine_01": {
      "model": "models/nature/tree_pine_01.glb",
      "tags": ["nature", "tree", "forest"],
      "scale": 1.0,
      "collider": "cylinder"
    },
    "house_stone_01": {
      "model": "models/structures/house_stone_01.glb",
      "tags": ["structure", "building", "village"],
      "scale": 1.0,
      "collider": "box",
      "interior": "house_stone_01_interior"
    },
    "npc_guard": {
      "model": "models/characters/guard.glb",
      "tags": ["npc", "humanoid", "guard"],
      "scale": 1.0,
      "animations": ["idle", "walk", "attack"]
    }
  }
}
```

---

## Area Definition (e.g., `areas/island_beach.json`)

```json
{
  "id": "island_beach",
  "name": "Sunlit Shore",
  "description": "A sandy beach on the southern coast of the island.",
  "environment": {
    "ambientLight": { "color": "#ffffff", "intensity": 0.4 },
    "directionalLight": {
      "color": "#fff4e0",
      "intensity": 1.0,
      "direction": [-0.5, -1, -0.3]
    },
    "fog": { "color": "#c8ddf0", "near": 50, "far": 200 },
    "skybox": "sky_clear_day"
  },
  "terrain": {
    "type": "heightmap",
    "heightmap": "terrain/island_beach_height.png",
    "texture": "terrain/island_beach_diffuse.png",
    "size": [100, 100],
    "maxHeight": 10
  },
  "objects": [
    {
      "asset": "tree_palm_01",
      "position": [12, 0, -5],
      "rotation": [0, 45, 0],
      "scale": 1.2
    },
    {
      "asset": "rock_coastal_01",
      "position": [25, 0, 3],
      "rotation": [0, 120, 0],
      "scale": 1.0
    },
    {
      "asset": "boat_small_01",
      "position": [5, 0, -20],
      "rotation": [0, -30, 0],
      "scale": 1.0
    }
  ],
  "npcs": [
    {
      "id": "fisherman_01",
      "asset": "npc_villager_male",
      "name": "Old Harren",
      "position": [8, 0, -18],
      "rotation": [0, 90, 0],
      "behavior": "idle",
      "dialogue": "dialogue/fisherman_01.json"
    }
  ],
  "items": [
    {
      "id": "beach_chest_01",
      "asset": "chest_wooden",
      "position": [30, 0.5, -8],
      "contents": ["potion_health_minor", "gold_5"]
    }
  ],
  "connections": [
    {
      "id": "to_village",
      "type": "path",
      "position": [50, 0, 0],
      "target": "island_village",
      "spawn": "from_beach",
      "label": "Path to Village"
    },
    {
      "id": "to_cave",
      "type": "door",
      "position": [40, 2, 15],
      "target": "island_cave_01",
      "spawn": "entrance",
      "label": "Dark Cave"
    }
  ],
  "triggers": [
    {
      "id": "ambush_trigger",
      "type": "once",
      "shape": "sphere",
      "position": [20, 0, 5],
      "radius": 5,
      "event": "spawn_enemies",
      "data": {
        "enemies": [
          { "asset": "enemy_crab_01", "position": [22, 0, 7] },
          { "asset": "enemy_crab_01", "position": [18, 0, 3] }
        ]
      }
    }
  ],
  "spawns": {
    "default": { "position": [5, 1, 0], "rotation": [0, 0, 0] },
    "from_village": { "position": [48, 1, 0], "rotation": [0, 180, 0] },
    "from_cave": { "position": [38, 1, 15], "rotation": [0, 180, 0] }
  }
}
```

---

## Prefab Definition (e.g., `prefabs/guard_post.json`)

Prefabs are mini-scenes that can be stamped into any area at a given position/rotation.

```json
{
  "id": "guard_post",
  "description": "A small guard station with a torch and a patrolling guard",
  "objects": [
    { "asset": "structure_guard_booth", "position": [0, 0, 0] },
    { "asset": "torch_wall", "position": [1.5, 2, 0], "light": { "color": "#ff9944", "intensity": 0.8, "range": 8 } }
  ],
  "npcs": [
    { "asset": "npc_guard", "position": [0, 0, 2], "behavior": "patrol", "patrol_points": [[0,0,2],[5,0,2],[5,0,-2],[0,0,-2]] }
  ]
}
```

### Using a prefab in an area:

```json
{
  "prefab": "guard_post",
  "position": [30, 0, 10],
  "rotation": [0, 45, 0]
}
```

---

## AI Generation Prompt Template

When asking an AI to generate a new area, provide this context:

```
Generate a JSON area definition for Light of Mine.
Available assets: [list from assets.json]
Available prefabs: [list from prefabs/]
Requirements: [describe the area — "a foggy swamp with ruins and hostile creatures"]
Follow the schema in SCHEMA.md exactly.
```

---

## Key Types Reference

| Field | Type | Description |
|-------|------|-------------|
| position | [x, y, z] | World coordinates (y = up) |
| rotation | [x, y, z] | Euler angles in degrees |
| scale | number or [x,y,z] | Uniform or per-axis scale |
| color | "#rrggbb" | Hex color string |
| intensity | 0.0 - 1.0+ | Light brightness |

---

## Future Extensions (Phase 2+)

- **Quests:** Separate quest JSON files that reference areas and NPCs
- **Weather system:** Per-area weather definitions with transitions
- **LOD system:** Multiple model variants per asset for distance
- **Procedural placement:** Rules-based object scattering (forests, rocks)
- **Time-of-day:** Lighting presets that cycle
- **Audio:** Ambient sounds and music per area
