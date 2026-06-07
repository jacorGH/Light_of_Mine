# Light of Mine — Development Log

> This log tracks key decisions, progress, and context from our development sessions so we can pick up where we left off.

---

## Project Overview

- **Genre:** 3D open-world RPG (inspired by Morrowind / Elder Scrolls)
- **Engine:** Three.js
- **Platforms:** Mobile & web browsers
- **Phase 1 Goal:** Develop an Island region/demo area with as many features and mechanics as possible
- **Core Architecture:** Morrowind-style seamless open world — exterior is a grid of streaming cells (64x64 units each), interiors load separately via doors. All content defined as JSON.

---

## Session Log

### Session 1 — June 7, 2026

**Status:** Project kickoff — vision, tech stack, scaffolding, and world system

**Key Points:**
- Clarified game concept: 3D open-world RPG like Morrowind (NOT a 2D side-scroller)
- Designed and documented the JSON world schema (see `docs/SCHEMA.md`)
- Scaffolded the project: Vite + Three.js
- Built core engine: renderer, first-person camera, WASD + mouse look + touch controls
- Built SceneLoader: reads area JSON → constructs 3D scene with placeholder geometry
- Created sample area: `island_beach.json` — beach with palm trees, rocks, NPCs, items, connections, triggers
- Created asset registry: `public/world/assets.json`
- Art style: **low-poly, flat-shaded**
- Build verified — compiles cleanly with Vite

**Decisions Made:**
- **Renderer:** Three.js
- **Bundler:** Vite
- **Game Style:** First-person 3D open-world RPG (Morrowind-inspired)
- **Art Style:** Low-poly, flat-shaded
- **World System:** JSON area definitions — one file per area, referencing assets by ID
- **Schema features:** Asset registry, prefabs, connections (world graph), triggers, spawns, NPCs, items
- **AI workflow:** Schema designed so an LLM can generate valid area JSON from a prompt + asset list
- **Phase 1 Scope:** Island demo area with core mechanics

**Project Structure:**
```
Light_of_Mine/
├── index.html
├── package.json
├── vite.config.js
├── docs/
│   └── SCHEMA.md              # World definition schema documentation
├── public/
│   └── world/
│       ├── assets.json         # Asset registry
│       ├── areas/
│       │   └── island_beach.json  # Sample area
│       └── prefabs/            # Reusable prefab definitions
└── src/
    ├── main.js                 # Entry point
    └── engine/
        ├── Engine.js           # Renderer, scene, camera, game loop
        ├── PlayerController.js # First-person controls (KB+M + touch)
        └── SceneLoader.js      # Loads area JSON → builds 3D scene
```

**Planned Mechanics (Morrowind-style):**
- Open-world exploration (first-person camera)
- NPC dialogue / quest system
- Inventory & items
- Combat (melee / magic / ranged)
- Terrain traversal (walking, swimming, possibly levitation)
- Interiors (entering buildings, dungeons)
- Day/night cycle, weather

**Next Steps:**
- Replace placeholder geometry with actual .glb models (low-poly assets)
- Heightmap terrain loading (currently procedural sine waves)
- NPC interaction system (click/approach → dialogue)
- Inventory UI
- Basic combat

---

### Session 2 — June 7, 2026

**Status:** Redesigned world from isolated areas to Morrowind-style seamless open world with cell streaming

**Key Points:**
- Completely replaced the old "one area at a time with portals" system
- New architecture: exterior world is a **grid of cells** that stream in/out seamlessly as the player moves (no loading screens outdoors)
- Only **interiors** (buildings, caves) trigger scene transitions via doors
- Built `WorldGrid.js` — tracks player cell, loads/unloads neighbors within a view radius (default: 2 cells = 5x5 loaded grid)
- Built `CellLoader.js` — constructs a THREE.Group per cell at the correct world offset, builds procedural terrain with noise + edge blending, places 20+ asset types as placeholder geometry
- Created 9 exterior cells forming the Island of Ashvael (3x3 grid): beach, tidepools, cliffs, forest, ruins, village, deep woods, swamp, mountain
- Each cell has unique biome terrain, objects, NPCs, items, doors, and triggers
- Terrain uses multi-octave sine noise with vertex colors and edge blend regions for smooth biome transitions
- Interior system designed (box-room geometry, local lighting, exits back to world)
- Removed old `SceneLoader.js` and `areas/` directory
- Rewrote `SCHEMA.md` with full documentation of the new system + AI generation prompt templates
- Build verified clean

**Decisions Made:**
- **World streaming:** Morrowind-style cell grid (64x64 unit cells, view radius 2)
- **No loading screens outdoors** — cells load/unload in background as player walks
- **Interiors are separate:** Doors transition to interior scenes (caves, buildings)
- **Coordinate system:** X = east(+)/west(-), Y = up(+)/down(-), Z = south(+)/north(-)
- **Terrain:** Procedural via multi-octave sine approximation, with blend regions at cell edges
- **Cell files:** One JSON per cell, all positions local to cell origin
- **World manifest:** `world_grid.json` registers all cells, interiors, global environment, player spawn
- **Material caching:** Shared materials across cells for performance

**Project Structure (Updated):**
```
Light_of_Mine/
├── index.html
├── package.json
├── vite.config.js
├── docs/
│   └── SCHEMA.md              # Full schema docs (updated for cell grid system)
├── public/
│   └── world/
│       ├── world_grid.json     # World manifest — cell registry + environment
│       ├── assets.json         # Asset registry
│       ├── cells/              # Exterior cell definitions (9 cells)
│       │   ├── 0_0_beach_south.json
│       │   ├── 1_0_beach_east.json
│       │   ├── -1_0_coast_west.json
│       │   ├── 0_-1_forest.json
│       │   ├── 1_-1_ruins.json
│       │   ├── -1_-1_village.json
│       │   ├── 0_-2_forest_deep.json
│       │   ├── -1_-2_swamp.json
│       │   └── 1_-2_mountain.json
│       ├── interiors/          # Interior scene definitions
│       └── prefabs/            # Reusable object arrangements
└── src/
    ├── main.js                 # Entry point (simplified)
    └── engine/
        ├── Engine.js           # Renderer, scene, camera, game loop + WorldGrid integration
        ├── PlayerController.js # First-person controls (KB+M + touch)
        ├── WorldGrid.js        # Cell streaming manager (load/unload based on player position)
        └── CellLoader.js       # Builds THREE.Group per cell (terrain, objects, NPCs, doors, triggers)
```

**World Map — Island of Ashvael:**
```
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
Player spawns at (32, 2, 32) in cell (0,0) — Southern Shore.
```

**Next Steps:**
- Replace placeholder geometry with .glb low-poly models
- Heightmap terrain (load grayscale PNG for precise sculpting)
- Door interaction (approach door → press key → enter interior)
- NPC interaction (approach → dialogue UI)
- Terrain-following for player (raycast down to terrain)
- Inventory UI
- Basic combat system
- Day/night cycle
- More cells to expand the island

---

*To add a new session, copy the template below:*

```
### Session — [DATE]

**Status:** [What we're working on]

**Key Points:**
- 

**Decisions Made:**
- 

**Open Questions / Next Steps:**
- 
```
