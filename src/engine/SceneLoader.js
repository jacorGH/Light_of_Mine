import * as THREE from 'three';

/**
 * Loads area JSON definitions and constructs the Three.js scene.
 */
export class SceneLoader {
  constructor(engine) {
    this.engine = engine;
  }

  async loadArea(areaId) {
    const response = await fetch(`/world/areas/${areaId}.json`);
    if (!response.ok) {
      console.warn(`Area "${areaId}" not found, loading placeholder scene.`);
      this.loadPlaceholder();
      return;
    }

    const area = await response.json();
    this.engine.clearScene();
    this.buildScene(area);
  }

  buildScene(area) {
    const scene = this.engine.scene;

    // Environment — lighting
    if (area.environment) {
      this.setupEnvironment(area.environment, scene);
    }

    // Terrain
    if (area.terrain) {
      this.buildTerrain(area.terrain, scene);
    }

    // Static objects (placeholder geometry until real assets exist)
    if (area.objects) {
      area.objects.forEach((obj) => this.placeObject(obj, scene));
    }

    // NPCs (placeholder)
    if (area.npcs) {
      area.npcs.forEach((npc) => this.placeNPC(npc, scene));
    }

    // Items
    if (area.items) {
      area.items.forEach((item) => this.placeItem(item, scene));
    }

    // Connections (visual markers)
    if (area.connections) {
      area.connections.forEach((conn) => this.placeConnection(conn, scene));
    }

    // Set player spawn
    if (area.spawns && area.spawns.default) {
      const spawn = area.spawns.default;
      this.engine.camera.position.set(...spawn.position);
    }
  }

  setupEnvironment(env, scene) {
    // Ambient light
    if (env.ambientLight) {
      const ambient = new THREE.AmbientLight(
        env.ambientLight.color,
        env.ambientLight.intensity
      );
      scene.add(ambient);
    }

    // Directional light (sun)
    if (env.directionalLight) {
      const dir = new THREE.DirectionalLight(
        env.directionalLight.color,
        env.directionalLight.intensity
      );
      dir.position.set(...env.directionalLight.direction).multiplyScalar(-50);
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      dir.shadow.camera.near = 0.5;
      dir.shadow.camera.far = 200;
      dir.shadow.camera.left = -50;
      dir.shadow.camera.right = 50;
      dir.shadow.camera.top = 50;
      dir.shadow.camera.bottom = -50;
      scene.add(dir);
    }

    // Fog
    if (env.fog) {
      scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    }

    // Sky color
    scene.background = new THREE.Color(env.fog ? env.fog.color : '#87ceeb');
  }

  buildTerrain(terrain, scene) {
    // For now: flat plane as terrain placeholder
    // TODO: Load heightmap texture and displace geometry
    const size = terrain.size || [100, 100];
    const geometry = new THREE.PlaneGeometry(size[0], size[1], 64, 64);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: '#5a8a3c',
      roughness: 0.9,
      flatShading: true,
    });

    // Add some random vertex displacement for interest
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      // Gentle hills
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const height = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2 +
                     Math.sin(x * 0.05 + z * 0.03) * 1.5;
      positions.setY(i, height);
    }
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  placeObject(obj, scene) {
    // Placeholder: colored box/cone based on asset name
    let geometry, color;

    if (obj.asset.includes('tree')) {
      geometry = new THREE.ConeGeometry(1, 4, 6);
      color = '#2d6b30';
    } else if (obj.asset.includes('rock')) {
      geometry = new THREE.DodecahedronGeometry(1.5);
      color = '#666666';
    } else if (obj.asset.includes('house') || obj.asset.includes('structure')) {
      geometry = new THREE.BoxGeometry(4, 3, 4);
      color = '#8b7355';
    } else {
      geometry = new THREE.BoxGeometry(1, 1, 1);
      color = '#aa8844';
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...obj.position);
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
    scene.add(mesh);
  }

  placeNPC(npc, scene) {
    // Placeholder: capsule shape for NPCs
    const geometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
    const material = new THREE.MeshStandardMaterial({
      color: '#cc8844',
      roughness: 0.7,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...npc.position);
    mesh.position.y += 1; // Stand on ground
    mesh.castShadow = true;

    // Add a name label (could be replaced with HTML overlay later)
    mesh.userData = { type: 'npc', name: npc.name, id: npc.id };
    scene.add(mesh);
  }

  placeItem(item, scene) {
    // Placeholder: small glowing box
    const geometry = new THREE.BoxGeometry(0.8, 0.6, 0.6);
    const material = new THREE.MeshStandardMaterial({
      color: '#ddaa22',
      emissive: '#443300',
      roughness: 0.5,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...item.position);
    mesh.castShadow = true;
    mesh.userData = { type: 'item', id: item.id, contents: item.contents };
    scene.add(mesh);
  }

  placeConnection(conn, scene) {
    // Placeholder: glowing ring/portal marker
    const geometry = new THREE.TorusGeometry(1.5, 0.2, 8, 16);
    const material = new THREE.MeshStandardMaterial({
      color: '#4488ff',
      emissive: '#2244aa',
      roughness: 0.3,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...conn.position);
    mesh.rotation.x = Math.PI / 2; // Stand upright
    mesh.userData = { type: 'connection', target: conn.target, label: conn.label };
    scene.add(mesh);
  }

  /**
   * Fallback scene when no area JSON is found.
   */
  loadPlaceholder() {
    const scene = this.engine.scene;
    scene.background = new THREE.Color('#87ceeb');

    // Ambient
    scene.add(new THREE.AmbientLight('#ffffff', 0.4));

    // Sun
    const sun = new THREE.DirectionalLight('#fff4e0', 1.0);
    sun.position.set(-10, 20, -5);
    sun.castShadow = true;
    scene.add(sun);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: '#5a8a3c', flatShading: true })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Marker cube
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: '#ff4444', flatShading: true })
    );
    cube.position.set(0, 1, -5);
    cube.castShadow = true;
    scene.add(cube);
  }
}
