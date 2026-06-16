import * as THREE from 'three';
import { CellLoader } from './CellLoader.js';

/**
 * WorldGrid — Morrowind-style open world cell streaming.
 * 
 * The exterior world is divided into a grid of cells. Each cell is a square
 * (default 64x64 world units). As the player moves, cells within a view radius
 * are loaded, and cells outside that radius are unloaded.
 * 
 * Interiors (caves, buildings) are separate scenes loaded via door transitions.
 */
export class WorldGrid {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.cellSize = options.cellSize || 64;
    this.viewRadius = options.viewRadius || 2; // Load cells within N cells of player
    this.worldData = null; // Loaded from world_grid.json

    this.cellLoader = new CellLoader(engine, this.cellSize);

    // Track loaded cells: Map<"x,y" -> { group, data, state }>
    this.loadedCells = new Map();

    // Track which cell the player is currently in
    this.currentCell = { x: 0, y: 0 };

    // Interior mode flag
    this.isInterior = false;
    this.interiorGroup = null;
  }

  /**
   * Initialize — load the world grid manifest.
   */
  async init() {
    const base = import.meta.env.BASE_URL || '/';
    const response = await fetch(`${base}world/world_grid.json`);
    if (!response.ok) {
      console.error('Failed to load world_grid.json');
      return;
    }
    this.worldData = await response.json();

    // Setup global environment from world data
    this.setupEnvironment();

    // Determine starting cell from player position
    const startPos = this.engine.camera.position;
    this.currentCell = this.worldToCell(startPos.x, startPos.z);

    // Load initial cells around the player
    await this.updateLoadedCells();
  }

  /**
   * Setup the global environment (lighting, fog, sky) from world_grid.json.
   */
  setupEnvironment() {
    const env = this.worldData.environment;
    const scene = this.engine.scene;

    if (!env) return;

    // Ambient light
    if (env.ambientLight) {
      const ambient = new THREE.AmbientLight(env.ambientLight.color, env.ambientLight.intensity);
      ambient.name = '__world_ambient';
      scene.add(ambient);
    }

    // Directional light (sun)
    if (env.directionalLight) {
      const sun = new THREE.DirectionalLight(env.directionalLight.color, env.directionalLight.intensity);
      sun.position.set(...env.directionalLight.direction).multiplyScalar(-100);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 300;
      sun.shadow.camera.left = -80;
      sun.shadow.camera.right = 80;
      sun.shadow.camera.top = 80;
      sun.shadow.camera.bottom = -80;
      sun.name = '__world_sun';
      scene.add(sun);
      this.sun = sun;
    }

    // Fog
    if (env.fog) {
      scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    }

    // Sky
    scene.background = new THREE.Color(env.skyColor || (env.fog ? env.fog.color : '#87ceeb'));
  }

  /**
   * Convert world position to cell grid coordinates.
   */
  worldToCell(worldX, worldZ) {
    return {
      x: Math.floor(worldX / this.cellSize),
      y: Math.floor(worldZ / this.cellSize),
    };
  }

  /**
   * Convert cell grid coordinates to world position (cell origin corner).
   */
  cellToWorld(cellX, cellY) {
    return {
      x: cellX * this.cellSize,
      z: cellY * this.cellSize,
    };
  }

  /**
   * Called every frame — check if player has moved to a new cell.
   * Returns true if cells were loaded/unloaded.
   */
  update() {
    if (this.isInterior) return false;

    const pos = this.engine.camera.position;
    const newCell = this.worldToCell(pos.x, pos.z);

    if (newCell.x !== this.currentCell.x || newCell.y !== this.currentCell.y) {
      this.currentCell = newCell;
      this.updateLoadedCells();

      // Move shadow camera to follow player
      if (this.sun) {
        this.sun.position.set(pos.x - 30, 60, pos.z - 20);
        this.sun.target.position.set(pos.x, 0, pos.z);
        this.sun.target.updateMatrixWorld();
      }

      return true;
    }

    return false;
  }

  /**
   * Load/unload cells based on player's current cell position.
   */
  async updateLoadedCells() {
    const { x: cx, y: cy } = this.currentCell;
    const r = this.viewRadius;

    // Determine which cells should be loaded
    const shouldBeLoaded = new Set();
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        shouldBeLoaded.add(key);
      }
    }

    // Unload cells that are out of range
    for (const [key, cell] of this.loadedCells) {
      if (!shouldBeLoaded.has(key)) {
        this.unloadCell(key);
      }
    }

    // Load cells that need to be loaded
    const loadPromises = [];
    for (const key of shouldBeLoaded) {
      if (!this.loadedCells.has(key)) {
        loadPromises.push(this.loadCell(key));
      }
    }

    await Promise.all(loadPromises);
  }

  /**
   * Load a single cell by its grid key "x,y".
   */
  async loadCell(key) {
    const [cx, cy] = key.split(',').map(Number);

    // Check if this cell exists in the world data
    const cellRef = this.getCellRef(cx, cy);
    if (!cellRef) {
      // No cell defined at these coordinates — skip (empty space / ocean)
      return;
    }

    // Mark as loading
    this.loadedCells.set(key, { state: 'loading', group: null, data: null });

    try {
      const group = await this.cellLoader.loadCell(cellRef, cx, cy);
      if (group) {
        this.engine.scene.add(group);
        this.loadedCells.set(key, { state: 'loaded', group, data: cellRef });
      }
    } catch (err) {
      console.warn(`Failed to load cell ${key}:`, err);
      this.loadedCells.delete(key);
    }
  }

  /**
   * Unload a cell — remove from scene and free resources.
   */
  unloadCell(key) {
    const cell = this.loadedCells.get(key);
    if (!cell || !cell.group) {
      this.loadedCells.delete(key);
      return;
    }

    // Remove from scene
    this.engine.scene.remove(cell.group);

    // Dispose geometry and materials
    cell.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.loadedCells.delete(key);
  }

  /**
   * Get cell reference from the world data grid.
   */
  getCellRef(cx, cy) {
    if (!this.worldData || !this.worldData.cells) return null;
    return this.worldData.cells.find(
      (c) => c.x === cx && c.y === cy
    ) || null;
  }

  /**
   * Enter an interior (building, dungeon, cave).
   * Hides the exterior world and loads the interior scene.
   */
  async enterInterior(interiorId) {
    this.isInterior = true;
    this.currentInteriorId = interiorId;

    // Hide all exterior cells
    for (const [key, cell] of this.loadedCells) {
      if (cell.group) cell.group.visible = false;
    }

    // Hide world environment
    this.engine.scene.fog = null;

    // Load interior
    this.interiorGroup = await this.cellLoader.loadInterior(interiorId);
    if (this.interiorGroup) {
      this.engine.scene.add(this.interiorGroup);

      // Set interior bounds for player collision
      // Extract size from the interior geometry (box room)
      const size = this.interiorGroup.userData.roomSize || [10, 4, 10];
      this.engine.player.setInteriorBounds({
        minX: -size[0] / 2,
        maxX: size[0] / 2,
        minZ: -size[2] / 2,
        maxZ: size[2] / 2,
      });
    }
  }

  /**
   * Exit an interior — return to the exterior world.
   */
  exitInterior(exitPosition) {
    this.isInterior = false;
    this.currentInteriorId = null;

    // Clear interior bounds
    this.engine.player.setInteriorBounds(null);

    // Remove interior
    if (this.interiorGroup) {
      this.engine.scene.remove(this.interiorGroup);
      this.interiorGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.interiorGroup = null;
    }

    // Restore exterior visibility
    for (const [key, cell] of this.loadedCells) {
      if (cell.group) cell.group.visible = true;
    }

    // Restore fog
    if (this.worldData.environment && this.worldData.environment.fog) {
      const fog = this.worldData.environment.fog;
      this.engine.scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
    }

    // Move player to exit position
    if (exitPosition) {
      this.engine.camera.position.set(...exitPosition);
    }

    // Refresh cells around new position
    this.currentCell = this.worldToCell(
      this.engine.camera.position.x,
      this.engine.camera.position.z
    );
    this.updateLoadedCells();
  }

  /**
   * Get count of currently loaded cells (for debugging).
   */
  getLoadedCellCount() {
    return this.loadedCells.size;
  }
}
