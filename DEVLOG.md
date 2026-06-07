# Light of Mine — Development Log

> This log tracks key decisions, progress, and context from our development sessions so we can pick up where we left off.

---

## Project Overview

- **Genre:** 3D open-world RPG (inspired by Morrowind / Elder Scrolls)
- **Engine:** Three.js
- **Platforms:** Mobile & web browsers
- **Phase 1 Goal:** Develop an Island region/demo area with as many features and mechanics as possible
- **Core Architecture:** JSON-driven world system — areas, terrain, structures, NPCs, items, and triggers are defined as JSON objects that arrange 3D assets into scenes

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
- Area transitions (walk into connection → load new area)
- NPC interaction system (click/approach → dialogue)
- Inventory UI
- Basic combat

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
