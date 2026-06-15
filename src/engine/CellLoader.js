import * as THREE from 'three';

/**
 * CellLoader — loads individual cell JSON files and builds Three.js Groups
 * positioned at the correct world offset. Handles terrain generation,
 * object placement, NPC placement, items, and door markers.
 * 
 * Each cell is returned as a THREE.Group that can be added/removed from the
 * scene independently without affecting other cells.
 */
export class CellLoader {
  constructor(engine, cellSize) {
    this.engine = engine;
    this.cellSize = cellSize;

    // Shared materials cache (reduce draw calls across cells)
    this.materialCache = new Map();
  }

  /**
   * Load an exterior cell and return a positioned THREE.Group.
   * @param {Object} cellRef - Cell reference from world_grid.json { x, y, file, biome, name }
   * @param {number} cx - Cell grid X coordinate
   * @param {number} cy - Cell grid Y coordinate
   * @returns {THREE.Group|null}
   */
  async loadCell(cellRef, cx, cy) {
    const base = import.meta.env.BASE_URL || '/';
    const response = await fetch(`${base}world/${cellRef.file}`);
    if (!response.ok) {
      console.warn(`Cell file not found: ${cellRef.file}`);
      return null;
    }

    const cellData = await response.json();
    const group = new THREE.Group();
    group.name = `cell_${cx}_${cy}`;
    group.userData = { cellX: cx, cellY: cy, cellId: cellRef.id || cellRef.file, biome: cellRef.biome };

    // Position the group at the cell's world origin
    const worldX = cx * this.cellSize;
    const worldZ = cy * this.cellSize;
    group.position.set(worldX, 0, worldZ);

    // Build terrain
    this.buildTerrain(cellData, group);

    // Spawn grass
    this.spawnGrass(cellData, group);

    // Place objects
    if (cellData.objects) {
      cellData.objects.forEach((obj) => this.placeObject(obj, group));
    }

    // Place NPCs
    if (cellData.npcs) {
      cellData.npcs.forEach((npc) => this.placeNPC(npc, group));
    }

    // Place items
    if (cellData.items) {
      cellData.items.forEach((item) => this.placeItem(item, group));
    }

    // Place door markers
    if (cellData.doors) {
      cellData.doors.forEach((door) => this.placeDoor(door, group));
    }

    // Place trigger volumes (invisible, for debugging can visualize)
    if (cellData.triggers) {
      cellData.triggers.forEach((trigger) => this.placeTrigger(trigger, group));
    }

    return group;
  }

  /**
   * Load an interior scene. Interiors are not grid-positioned — they use their
   * own local coordinate system centered at origin.
   * @param {string} interiorId
   * @returns {THREE.Group|null}
   */
  async loadInterior(interiorId) {
    const base = import.meta.env.BASE_URL || '/';
    const response = await fetch(`${base}world/interiors/${interiorId}.json`);
    if (!response.ok) {
      console.warn(`Interior not found: ${interiorId}`);
      return null;
    }

    const data = await response.json();
    const group = new THREE.Group();
    group.name = `interior_${interiorId}`;
    group.userData = { type: 'interior', id: interiorId };

    // Interior environment (override global)
    if (data.environment) {
      this.setupInteriorEnvironment(data.environment, group);
    }

    // Floor/walls (if defined)
    if (data.geometry) {
      this.buildInteriorGeometry(data.geometry, group);
    }

    // Objects, NPCs, items
    if (data.objects) {
      data.objects.forEach((obj) => this.placeObject(obj, group));
    }
    if (data.npcs) {
      data.npcs.forEach((npc) => this.placeNPC(npc, group));
    }
    if (data.items) {
      data.items.forEach((item) => this.placeItem(item, group));
    }

    // Exit door (back to exterior)
    if (data.exits) {
      data.exits.forEach((exit) => this.placeExit(exit, group));
    }

    // Set spawn
    if (data.spawn) {
      this.engine.camera.position.set(...data.spawn.position);
    }

    return group;
  }

  // ─── TERRAIN ─────────────────────────────────────────────────────

  /**
   * Global terrain height function. Uses FIXED noise parameters regardless
   * of per-cell biome settings, so all cells produce identical heights at
   * shared edges. Per-cell settings only affect color/texture.
   * 
   * Includes island falloff — terrain slopes to sea level at world edges.
   */
  getTerrainHeight(worldX, worldZ) {
    const s = 0.06;
    const a = 4.0;
    const baseHeight =
      Math.sin(worldX * s) * Math.cos(worldZ * s) * a * 0.6 +
      Math.sin(worldX * s * 2.3 + 1.7) * Math.cos(worldZ * s * 1.9 + 0.8) * a * 0.3 +
      Math.sin(worldX * s * 4.1 + 3.2) * Math.cos(worldZ * s * 3.7 + 2.1) * a * 0.1;

    // Island falloff: smooth slope to sea level at edges
    // Island center is approximately at worldX=0, worldZ=-64 (cell 0,-1)
    const centerX = 0;
    const centerZ = -64;
    const dx = (worldX - centerX) / 110; // normalize to ~1 at island edge
    const dz = (worldZ - centerZ) / 110;
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);

    // Smooth falloff: 1.0 in center, slopes to 0 at edge, then below sea level
    const falloff = 1.0 - Math.pow(Math.max(0, Math.min(1, distFromCenter)), 2);
    const seaLevel = -1.5;

    // Blend between terrain height and sea level based on falloff
    return seaLevel + (baseHeight - seaLevel + 2) * falloff;
  }

  buildTerrain(cellData, group) {
    const terrain = cellData.terrain || {};
    const segments = 48;
    const geometry = new THREE.PlaneGeometry(this.cellSize, this.cellSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const baseColor = terrain.baseColor || '#5a8a3c';

    const positions = geometry.attributes.position;
    const colors = [];

    for (let i = 0; i < positions.count; i++) {
      const lx = positions.getX(i);
      const lz = positions.getZ(i);

      // World-space coords for continuous noise across ALL cells
      const wx = lx + group.position.x;
      const wz = lz + group.position.z;

      // Use global height function — guarantees matching edges between cells
      const height = this.getTerrainHeight(wx, wz);
      positions.setY(i, height);

      // Per-cell color (biome appearance) with height-based variation
      const heightFactor = (height / 4.0 + 1) * 0.5;
      const c = new THREE.Color(baseColor);
      c.lerp(new THREE.Color('#ffffff'), heightFactor * 0.15);
      c.lerp(new THREE.Color('#222222'), (1 - heightFactor) * 0.1);
      colors.push(c.r, c.g, c.b);
    }

    // Apply blend regions at cell edges for smooth color transitions
    if (terrain.blendRegions) {
      this.applyBlendRegions(terrain.blendRegions, positions, colors, geometry);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: terrain.roughness || 0.9,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    group.add(mesh);
  }

  applyBlendRegions(regions, positions, colors, geometry) {
    const halfSize = this.cellSize / 2;

    for (const region of regions) {
      const blendColor = new THREE.Color(region.color);
      const width = region.width || 10;

      for (let i = 0; i < positions.count; i++) {
        const lx = positions.getX(i);
        const lz = positions.getZ(i);
        let factor = 0;

        switch (region.edge) {
          case 'north': // -Z edge
            factor = Math.max(0, 1 - (lz + halfSize) / width);
            break;
          case 'south': // +Z edge
            factor = Math.max(0, 1 - (halfSize - lz) / width);
            break;
          case 'east': // +X edge
            factor = Math.max(0, 1 - (halfSize - lx) / width);
            break;
          case 'west': // -X edge
            factor = Math.max(0, 1 - (lx + halfSize) / width);
            break;
        }

        if (factor > 0) {
          const idx = i * 3;
          const c = new THREE.Color(colors[idx], colors[idx + 1], colors[idx + 2]);
          c.lerp(blendColor, factor * 0.7);
          colors[idx] = c.r;
          colors[idx + 1] = c.g;
          colors[idx + 2] = c.b;
        }
      }
    }
  }

  // ─── GRASS ───────────────────────────────────────────────────────

  /**
   * Spawn cuttable grass CLUMPS (Zelda-style bushes) across the cell.
   * Each clump is a small cluster of blades rendered as a single mesh.
   * When hit, the whole clump disappears with a poof animation.
   */
  spawnGrass(cellData, group) {
    const biome = cellData.biome || 'forest';

    // Clump count per biome
    const clumpCountMap = {
      beach: 10,
      coast: 8,
      forest: 60,
      village: 20,
      swamp: 25,
      mountain: 5,
      ruins: 12,
    };
    const clumpCount = clumpCountMap[biome] || 15;
    if (clumpCount === 0) return;

    const isForest = biome === 'forest';
    const grassColor = isForest ? '#2a7a1a' : (biome === 'swamp' ? '#3a6a2a' : '#4a9a2a');

    for (let i = 0; i < clumpCount; i++) {
      const clump = this.buildGrassClump(isForest, grassColor);

      // Random position within cell
      const lx = (Math.random() - 0.5) * (this.cellSize - 6);
      const lz = (Math.random() - 0.5) * (this.cellSize - 6);
      const wx = lx + group.position.x;
      const wz = lz + group.position.z;
      const height = this.getTerrainHeight(wx, wz);

      clump.position.set(lx, height, lz);
      clump.rotation.y = Math.random() * Math.PI * 2;

      clump.userData = {
        type: 'grass_clump',
        worldX: wx,
        worldZ: wz,
        cut: false,
      };

      group.add(clump);
    }
  }

  /**
   * Build a single grass clump (bushy cluster of triangles).
   */
  buildGrassClump(tall, color) {
    const clump = new THREE.Group();
    clump.name = 'grass_clump';

    const bladeCount = tall ? 12 : 8;
    const baseHeight = tall ? 1.0 : 0.6;
    const spread = tall ? 0.5 : 0.35;

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      flatShading: true,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < bladeCount; i++) {
      const h = baseHeight + Math.random() * 0.4;
      const w = 0.12 + Math.random() * 0.08;

      // Triangle blade
      const geo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        -w, 0, 0,
         w, 0, 0,
         0, h, 0,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.computeVertexNormals();

      const blade = new THREE.Mesh(geo, mat);
      blade.position.set(
        (Math.random() - 0.5) * spread * 2,
        0,
        (Math.random() - 0.5) * spread * 2
      );
      blade.rotation.y = Math.random() * Math.PI;
      blade.rotation.x = (Math.random() - 0.5) * 0.3;
      clump.add(blade);
    }

    // Add a low base sphere to give it volume
    const baseGeo = new THREE.SphereGeometry(spread, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const baseMesh = new THREE.Mesh(baseGeo, mat);
    baseMesh.scale.y = 0.4;
    clump.add(baseMesh);

    return clump;
  }

  // ─── OBJECTS ─────────────────────────────────────────────────────

  placeObject(obj, group) {
    let geometry, color;
    const asset = obj.asset || '';

    if (asset.includes('tree_palm')) {
      geometry = new THREE.ConeGeometry(1.2, 5, 6);
      color = '#1a8a2a';
    } else if (asset.includes('tree_pine')) {
      geometry = new THREE.ConeGeometry(1.5, 6, 6);
      color = '#1a5a1a';
    } else if (asset.includes('tree_ancient') || asset.includes('tree_oak')) {
      geometry = new THREE.ConeGeometry(2.5, 8, 8);
      color = '#2a6a1a';
    } else if (asset.includes('tree_dead') || asset.includes('dead_tree')) {
      geometry = new THREE.ConeGeometry(0.8, 5, 5);
      color = '#5a4a3a';
    } else if (asset.includes('rock_cliff')) {
      geometry = new THREE.DodecahedronGeometry(3);
      color = '#5a5a55';
    } else if (asset.includes('rock_coastal') || asset.includes('rock_boulder')) {
      geometry = new THREE.DodecahedronGeometry(1.5);
      color = '#6a6a60';
    } else if (asset.includes('rock_mossy')) {
      geometry = new THREE.DodecahedronGeometry(1.2);
      color = '#4a6a3a';
    } else if (asset.includes('house') || asset.includes('structure') || asset.includes('hut')) {
      geometry = new THREE.BoxGeometry(4, 3, 4);
      color = '#8b7355';
    } else if (asset.includes('ruin_wall')) {
      geometry = new THREE.BoxGeometry(5, 3, 0.6);
      color = '#7a7060';
    } else if (asset.includes('ruin_tower')) {
      geometry = new THREE.CylinderGeometry(2.5, 3, 6, 8);
      color = '#6a6055';
    } else if (asset.includes('ruin_pillar')) {
      geometry = new THREE.CylinderGeometry(0.4, 0.5, 4, 6);
      color = '#8a8070';
    } else if (asset.includes('torch')) {
      geometry = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6);
      color = '#5a3a1a';
      // Add point light for torches
      const light = new THREE.PointLight('#ff9944', 0.8, 8);
      light.position.set(...obj.position);
      light.position.y += 1.8;
      group.add(light);
    } else if (asset.includes('campfire')) {
      geometry = new THREE.ConeGeometry(0.5, 0.8, 6);
      color = '#aa3300';
      const light = new THREE.PointLight('#ff6622', 1.0, 12);
      light.position.set(...obj.position);
      light.position.y += 0.5;
      group.add(light);
    } else if (asset.includes('mushroom_glowing')) {
      geometry = new THREE.SphereGeometry(0.4, 6, 4);
      color = '#44ff88';
      const light = new THREE.PointLight('#44ff88', 0.4, 5);
      light.position.set(...obj.position);
      light.position.y += 0.3;
      group.add(light);
    } else if (asset.includes('mushroom')) {
      geometry = new THREE.SphereGeometry(0.3, 6, 4);
      color = '#aa4422';
    } else if (asset.includes('fallen_log')) {
      geometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 6);
      color = '#5a4030';
    } else if (asset.includes('boat')) {
      geometry = new THREE.BoxGeometry(2, 0.8, 4);
      color = '#6a5030';
    } else if (asset.includes('fence')) {
      geometry = new THREE.BoxGeometry(4, 1.2, 0.2);
      color = '#7a6040';
    } else if (asset.includes('barrel')) {
      geometry = new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8);
      color = '#6a4a2a';
    } else if (asset.includes('crate')) {
      geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      color = '#7a5a30';
    } else if (asset.includes('market_stall')) {
      geometry = new THREE.BoxGeometry(3, 2.5, 2);
      color = '#8a6a40';
    } else if (asset.includes('well')) {
      geometry = new THREE.CylinderGeometry(0.8, 0.8, 1, 8);
      color = '#6a6a6a';
    } else if (asset.includes('cobweb')) {
      geometry = new THREE.PlaneGeometry(2, 2);
      color = '#cccccc';
    } else if (asset.includes('swamp_water')) {
      geometry = new THREE.PlaneGeometry(12, 12);
      color = '#2a4a2a';
      // Water is flat on ground
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.7,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...obj.position);
      mesh.rotation.x = -Math.PI / 2;
      const s = obj.scale || 1;
      if (Array.isArray(s)) mesh.scale.set(...s);
      else mesh.scale.setScalar(s);
      group.add(mesh);
      return;
    } else if (asset.includes('lily_pad') || asset.includes('seaweed') || asset.includes('shell') || asset.includes('snow_patch') || asset.includes('driftwood')) {
      geometry = new THREE.PlaneGeometry(1.5, 1.5);
      color = asset.includes('snow') ? '#eeeeff' : asset.includes('lily') ? '#226633' : '#4a6a3a';
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...obj.position);
      mesh.rotation.x = -Math.PI / 2;
      const s = obj.scale || 1;
      if (Array.isArray(s)) mesh.scale.set(...s);
      else mesh.scale.setScalar(s);
      group.add(mesh);
      return;
    } else if (asset.includes('mining_node')) {
      geometry = new THREE.OctahedronGeometry(0.6);
      color = '#8a7a5a';
    } else {
      geometry = new THREE.BoxGeometry(1, 1, 1);
      color = '#aa8844';
    }

    const material = this.getMaterial(color);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...obj.position);

    // Snap object to terrain height
    const wx = obj.position[0] + group.position.x;
    const wz = obj.position[2] + group.position.z;
    const groundY = this.getTerrainHeight(wx, wz);
    mesh.position.y = groundY + (obj.position[1] || 0);

    if (obj.rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(obj.rotation[0]),
        THREE.MathUtils.degToRad(obj.rotation[1]),
        THREE.MathUtils.degToRad(obj.rotation[2])
      );
    }

    const s = obj.scale || 1;
    if (Array.isArray(s)) {
      mesh.scale.set(...s);
    } else {
      mesh.scale.setScalar(s);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Collision radius for solid objects (player can't walk through)
    let collisionRadius = 0;
    if (asset.includes('tree')) collisionRadius = 0.5 * (typeof s === 'number' ? s : 1);
    else if (asset.includes('rock_cliff')) collisionRadius = 2.5 * (typeof s === 'number' ? s : 1);
    else if (asset.includes('rock')) collisionRadius = 1.2 * (typeof s === 'number' ? s : 1);
    else if (asset.includes('house') || asset.includes('structure') || asset.includes('hut')) collisionRadius = 2.5 * (typeof s === 'number' ? s : 1);
    else if (asset.includes('ruin_tower')) collisionRadius = 2.5 * (typeof s === 'number' ? s : 1);
    else if (asset.includes('ruin_wall')) collisionRadius = 1.5 * (typeof s === 'number' ? s : 1);
    else if (asset.includes('well')) collisionRadius = 0.8;

    mesh.userData = { type: 'object', asset: obj.asset, collisionRadius };
    group.add(mesh);
  }

  // ─── NPCs ───────────────────────────────────────────────────────

  placeNPC(npc, group) {
    const asset = npc.asset || '';
    let color = '#cc8844';

    if (asset.includes('guard')) color = '#666688';
    else if (asset.includes('ghost')) color = '#88aacc';
    else if (asset.includes('witch')) color = '#6a2a6a';

    const geometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
    const material = this.getMaterial(color);
    const mesh = new THREE.Mesh(geometry, material);

    // Position NPC on terrain surface using global height function
    const wx = npc.position[0] + group.position.x;
    const wz = npc.position[2] + group.position.z;
    const groundY = this.getTerrainHeight(wx, wz);
    mesh.position.set(npc.position[0], groundY + 1, npc.position[2]);

    if (npc.rotation) {
      mesh.rotation.y = THREE.MathUtils.degToRad(npc.rotation[1] || 0);
    }

    mesh.castShadow = true;
    mesh.userData = {
      type: 'npc',
      id: npc.id,
      name: npc.name,
      behavior: npc.behavior,
      dialogue: npc.dialogue,
    };
    group.add(mesh);

    // Name indicator — small sphere above head
    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 4),
      new THREE.MeshBasicMaterial({ color: '#ffdd44' })
    );
    indicator.position.copy(mesh.position);
    indicator.position.y += 1.5;
    group.add(indicator);
  }

  // ─── ITEMS ──────────────────────────────────────────────────────

  placeItem(item, group) {
    const asset = item.asset || '';
    let geometry, color;

    if (asset.includes('chest_ornate')) {
      geometry = new THREE.BoxGeometry(1, 0.7, 0.7);
      color = '#bb8822';
    } else if (asset.includes('chest')) {
      geometry = new THREE.BoxGeometry(0.8, 0.6, 0.6);
      color = '#aa7722';
    } else if (asset.includes('herb')) {
      geometry = new THREE.SphereGeometry(0.2, 6, 4);
      color = '#33aa44';
    } else if (asset.includes('potion')) {
      geometry = new THREE.CylinderGeometry(0.15, 0.15, 0.4, 6);
      color = '#4444dd';
    } else if (asset.includes('ore')) {
      geometry = new THREE.OctahedronGeometry(0.4);
      color = '#8a6a4a';
    } else {
      geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      color = '#ddaa22';
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.15,
      roughness: 0.5,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...item.position);
    mesh.castShadow = true;
    mesh.userData = { type: 'item', id: item.id, contents: item.contents };
    group.add(mesh);
  }

  // ─── DOORS (to interiors) ────────────────────────────────────────

  placeDoor(door, group) {
    // Visual: archway/doorframe shape
    const geometry = new THREE.BoxGeometry(1.5, 2.5, 0.3);
    const material = new THREE.MeshStandardMaterial({
      color: '#3a2a1a',
      emissive: '#221100',
      emissiveIntensity: 0.2,
      roughness: 0.7,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...door.position);
    mesh.position.y += 1.25;

    if (door.rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(door.rotation[0] || 0),
        THREE.MathUtils.degToRad(door.rotation[1] || 0),
        THREE.MathUtils.degToRad(door.rotation[2] || 0)
      );
    }

    mesh.castShadow = true;
    mesh.userData = {
      type: 'door',
      id: door.id,
      target: door.target,
      exitPosition: door.exitPosition,
      label: door.label,
    };
    group.add(mesh);

    // Glow indicator above door
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 6, 4),
      new THREE.MeshBasicMaterial({ color: '#ffaa22' })
    );
    glow.position.set(...door.position);
    glow.position.y += 3;
    group.add(glow);
  }

  // ─── TRIGGERS ────────────────────────────────────────────────────

  placeTrigger(trigger, group) {
    // Triggers are invisible in gameplay, but we store them for the engine
    // to check player proximity each frame.
    const marker = new THREE.Object3D();
    marker.position.set(...trigger.position);
    marker.userData = {
      type: 'trigger',
      id: trigger.id,
      triggerType: trigger.type,
      shape: trigger.shape,
      radius: trigger.radius,
      event: trigger.event,
      data: trigger.data,
      fired: false,
    };
    group.add(marker);
  }

  // ─── INTERIOR HELPERS ────────────────────────────────────────────

  setupInteriorEnvironment(env, group) {
    if (env.ambientLight) {
      const ambient = new THREE.AmbientLight(env.ambientLight.color, env.ambientLight.intensity);
      group.add(ambient);
    }
    if (env.pointLights) {
      env.pointLights.forEach((pl) => {
        const light = new THREE.PointLight(pl.color, pl.intensity, pl.range || 10);
        light.position.set(...pl.position);
        group.add(light);
      });
    }
  }

  buildInteriorGeometry(geom, group) {
    // Simple box room for now
    const size = geom.size || [10, 4, 10];
    const floorGeo = new THREE.PlaneGeometry(size[0], size[2]);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: geom.floorColor || '#4a3a2a',
      roughness: 0.9,
      flatShading: true,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    group.add(floor);

    // Walls
    const wallColor = geom.wallColor || '#5a4a3a';
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.85,
      flatShading: true,
      side: THREE.BackSide,
    });

    const roomGeo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const room = new THREE.Mesh(roomGeo, wallMat);
    room.position.y = size[1] / 2;
    group.add(room);
  }

  placeExit(exit, group) {
    const geometry = new THREE.BoxGeometry(1.5, 2.5, 0.3);
    const material = new THREE.MeshStandardMaterial({
      color: '#4a4a6a',
      emissive: '#222244',
      emissiveIntensity: 0.3,
      roughness: 0.7,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...exit.position);
    mesh.position.y += 1.25;
    mesh.userData = {
      type: 'exit',
      id: exit.id,
      exitPosition: exit.exitPosition,
      label: exit.label || 'Exit',
    };
    group.add(mesh);
  }

  // ─── UTILITIES ───────────────────────────────────────────────────

  /**
   * Get or create a cached material for a given color.
   */
  getMaterial(color) {
    if (this.materialCache.has(color)) {
      return this.materialCache.get(color);
    }
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      flatShading: true,
    });
    this.materialCache.set(color, mat);
    return mat;
  }
}
