import * as THREE from 'three';
import { events } from '../engine/EventBus.js';

/**
 * EnemySystem — manages enemy spawning, AI state machines, damage, and death.
 *
 * Enemies are spawned via trigger volumes placed in cell data. Each enemy runs
 * a simple state machine (idle → alert → chase → attack) and emits events
 * for damage dealt/received. No direct references to other systems.
 *
 * Events emitted:
 *   enemy:spawned   { id, asset, position }
 *   enemy:damaged   { id, amount, remaining }
 *   enemy:killed    { id, asset, position }
 *   player:damaged  { amount }
 *   player:xp       { amount }
 *   item:collected  { id, name, type, quantity }
 */

const ENEMY_TYPES = {
  enemy_crab_01: {
    health: 30,
    damage: 5,
    speed: 3,
    attackRange: 1.8,
    detectRange: 12,
    color: '#cc4422',
    geometry: 'box',
    size: [0.8, 0.5, 0.8],
    attackCooldown: 1.5,
  },
  enemy_wolf_01: {
    health: 45,
    damage: 8,
    speed: 5,
    attackRange: 2.0,
    detectRange: 18,
    color: '#555555',
    geometry: 'capsule',
    size: [0.3, 0.8],
    attackCooldown: 1.2,
  },
  enemy_spider_01: {
    health: 25,
    damage: 6,
    speed: 4,
    attackRange: 1.5,
    detectRange: 14,
    color: '#2a2a2a',
    geometry: 'sphere',
    size: [0.5],
    attackCooldown: 1.0,
  },
  enemy_spider_large: {
    health: 60,
    damage: 12,
    speed: 3,
    attackRange: 2.5,
    detectRange: 16,
    color: '#1a1a1a',
    geometry: 'sphere',
    size: [0.9],
    attackCooldown: 1.8,
  },
  enemy_skeleton_01: {
    health: 50,
    damage: 10,
    speed: 3.5,
    attackRange: 2.2,
    detectRange: 15,
    color: '#ddddaa',
    geometry: 'capsule',
    size: [0.35, 1.2],
    attackCooldown: 1.3,
  },
  enemy_skeleton_archer: {
    health: 35,
    damage: 8,
    speed: 2.5,
    attackRange: 15,
    detectRange: 20,
    color: '#cccc99',
    geometry: 'capsule',
    size: [0.35, 1.2],
    attackCooldown: 2.0,
  },
  enemy_bog_creature: {
    health: 70,
    damage: 14,
    speed: 2,
    attackRange: 2.5,
    detectRange: 10,
    color: '#3a5a2a',
    geometry: 'sphere',
    size: [1.2],
    attackCooldown: 2.5,
  },
};

export class EnemySystem {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;

    this.enemies = [];
    this.nextId = 1;
    this.playerSneaking = false;

    // Subscribe to events
    events.on('combat:slash', (data) => this.handlePlayerAttack(data));
    events.on('combat:projectile_hit', (data) => this.handleProjectileHit(data));
    events.on('world:cells_changed', () => this.checkTriggers());
    events.on('player:sneak_changed', (data) => { this.playerSneaking = data.sneaking; });

    // Initial trigger check after a short delay (scene needs to be populated)
    setTimeout(() => this.checkTriggers(), 100);
  }

  // ─── GROUND HEIGHT ────────────────────────────────────────────────

  /**
   * Same terrain height formula as CellLoader.getTerrainHeight
   * so enemies walk on the actual terrain surface.
   */
  getGroundHeight(wx, wz) {
    const s = 0.06, a = 4.0;
    const baseHeight =
      Math.sin(wx * s) * Math.cos(wz * s) * a * 0.6 +
      Math.sin(wx * s * 2.3 + 1.7) * Math.cos(wz * s * 1.9 + 0.8) * a * 0.3 +
      Math.sin(wx * s * 4.1 + 3.2) * Math.cos(wz * s * 3.7 + 2.1) * a * 0.1;

    // Island falloff (must match CellLoader)
    const centerX = 0, centerZ = -64;
    const dx = (wx - centerX) / 110;
    const dz = (wz - centerZ) / 110;
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);
    const falloff = 1.0 - Math.pow(Math.max(0, Math.min(1, distFromCenter)), 2);
    const seaLevel = -1.5;
    return seaLevel + (baseHeight - seaLevel + 2) * falloff;
  }

  // ─── TRIGGER DETECTION ────────────────────────────────────────────

  /**
   * Walk the scene graph looking for unfired spawn triggers
   * within range of the player.
   */
  checkTriggers() {
    const playerPos = this.camera.position;

    this.scene.traverse((obj) => {
      if (
        obj.userData &&
        obj.userData.type === 'trigger' &&
        obj.userData.event === 'spawn_enemies' &&
        obj.userData.fired === false
      ) {
        // Calculate world position of the trigger (accounting for parent group offset)
        const triggerWorldPos = new THREE.Vector3();
        obj.getWorldPosition(triggerWorldPos);

        const dist = playerPos.distanceTo(triggerWorldPos);

        if (dist <= obj.userData.radius) {
          obj.userData.fired = true;

          // Get parent group world position (cell offset)
          const parentWorldPos = new THREE.Vector3();
          if (obj.parent) {
            obj.parent.getWorldPosition(parentWorldPos);
          }

          this.spawnEnemies(obj.userData.data.enemies, parentWorldPos);
        }
      }
    });
  }

  // ─── SPAWNING ─────────────────────────────────────────────────────

  /**
   * Spawn a group of enemies from trigger data.
   * @param {Array} enemyList - [{asset, position}, ...]
   * @param {THREE.Vector3} cellWorldPos - World position of the parent cell group
   */
  spawnEnemies(enemyList, cellWorldPos) {
    for (const def of enemyList) {
      const typeDef = ENEMY_TYPES[def.asset];
      if (!typeDef) {
        console.warn(`Unknown enemy type: ${def.asset}`);
        continue;
      }

      const id = `enemy_${this.nextId++}`;

      // Create mesh based on geometry type
      const mesh = this.createEnemyMesh(typeDef);
      mesh.name = id;

      // Position: cell world offset + local enemy position
      const wx = cellWorldPos.x + def.position[0];
      const wz = cellWorldPos.z + def.position[2];
      const wy = this.getGroundHeight(wx, wz);

      // Offset Y so the mesh sits on the ground
      const meshHeight = this.getMeshHeight(typeDef);
      mesh.position.set(wx, wy + meshHeight / 2, wz);

      // Create health bar sprite
      const healthBar = this.createHealthBar();
      healthBar.position.set(wx, wy + meshHeight + 0.3, wz);

      this.scene.add(mesh);
      this.scene.add(healthBar);

      const enemy = {
        id,
        asset: def.asset,
        mesh,
        healthBar,
        position: mesh.position.clone(),
        health: typeDef.health,
        maxHealth: typeDef.health,
        damage: typeDef.damage,
        speed: typeDef.speed,
        attackRange: typeDef.attackRange,
        detectRange: typeDef.detectRange,
        attackCooldown: typeDef.attackCooldown,
        lastAttackTime: 0,
        state: 'idle',
        stateTimer: 0,
        dead: false,
      };

      this.enemies.push(enemy);
      events.emit('enemy:spawned', { id, asset: def.asset, position: mesh.position.clone() });
    }
  }

  /**
   * Create a mesh for the given enemy type definition.
   */
  createEnemyMesh(typeDef) {
    let geometry;

    switch (typeDef.geometry) {
      case 'box':
        geometry = new THREE.BoxGeometry(typeDef.size[0], typeDef.size[1], typeDef.size[2]);
        break;
      case 'capsule':
        geometry = new THREE.CapsuleGeometry(typeDef.size[0], typeDef.size[1], 8, 12);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(typeDef.size[0], 12, 8);
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const material = new THREE.MeshStandardMaterial({
      color: typeDef.color,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Get the effective height of an enemy mesh for positioning.
   */
  getMeshHeight(typeDef) {
    switch (typeDef.geometry) {
      case 'box':
        return typeDef.size[1];
      case 'capsule':
        return typeDef.size[0] * 2 + typeDef.size[1]; // radius*2 + height
      case 'sphere':
        return typeDef.size[0] * 2;
      default:
        return 1;
    }
  }

  // ─── HEALTH BAR ──────────────────────────────────────────────────

  /**
   * Create a health bar sprite using a canvas texture.
   */
  createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 8;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(0, 0, 64, 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1, 0.12, 1);

    // Store canvas + context for later updates
    sprite.userData.canvas = canvas;
    sprite.userData.ctx = ctx;

    return sprite;
  }

  /**
   * Update the health bar canvas to reflect current health.
   */
  updateHealthBar(enemy) {
    const sprite = enemy.healthBar;
    const ctx = sprite.userData.ctx;
    const canvas = sprite.userData.canvas;
    const ratio = Math.max(0, enemy.health / enemy.maxHealth);

    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(0, 0, Math.round(64 * ratio), 8);

    sprite.material.map.needsUpdate = true;
  }

  // ─── UPDATE LOOP ──────────────────────────────────────────────────

  /**
   * Main update — called each frame from Engine.
   * @param {number} delta - Time since last frame in seconds
   */
  update(delta) {
    // Check triggers every frame (cheap: just distance checks)
    this.checkTriggers();

    const now = performance.now() / 1000;
    const playerPos = this.camera.position;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // ── DEAD: sink animation then remove ──
      if (enemy.dead) {
        enemy.stateTimer += delta;
        // Sink into ground over 2 seconds
        enemy.mesh.position.y -= delta * 0.5;
        enemy.mesh.material.opacity = Math.max(0, 1 - enemy.stateTimer / 2);
        enemy.mesh.material.transparent = true;
        enemy.healthBar.visible = false;

        if (enemy.stateTimer >= 2) {
          // Remove from scene and array
          this.scene.remove(enemy.mesh);
          this.scene.remove(enemy.healthBar);
          if (enemy.mesh.geometry) enemy.mesh.geometry.dispose();
          if (enemy.mesh.material) enemy.mesh.material.dispose();
          if (enemy.healthBar.material) {
            if (enemy.healthBar.material.map) enemy.healthBar.material.map.dispose();
            enemy.healthBar.material.dispose();
          }
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // ── DISTANCE TO PLAYER ──
      const dist = enemy.mesh.position.distanceTo(playerPos);

      // ── STATE MACHINE ──
      switch (enemy.state) {
        case 'idle':
          // Sneaking reduces detection range by 60%
          const effectiveDetectRange = this.playerSneaking ? enemy.detectRange * 0.4 : enemy.detectRange;
          if (dist <= effectiveDetectRange) {
            enemy.state = 'alert';
            enemy.stateTimer = 0.5;
          }
          break;

        case 'alert':
          this.facePlayer(enemy, playerPos);
          enemy.stateTimer -= delta;
          if (enemy.stateTimer <= 0) {
            enemy.state = 'chase';
          }
          break;

        case 'chase':
          this.facePlayer(enemy, playerPos);
          this.moveTowardPlayer(enemy, playerPos, delta);
          if (dist <= enemy.attackRange) {
            enemy.state = 'attack';
          } else if (dist > enemy.detectRange * 1.5) {
            enemy.state = 'idle';
          }
          break;

        case 'attack':
          this.facePlayer(enemy, playerPos);
          if (now - enemy.lastAttackTime >= enemy.attackCooldown) {
            // Deal damage to player
            events.emit('player:damaged', { amount: enemy.damage });
            enemy.lastAttackTime = now;
          }
          // If player moves out of attack range, chase
          if (dist > enemy.attackRange) {
            enemy.state = 'chase';
          }
          break;

        case 'hurt':
          enemy.stateTimer -= delta;
          if (enemy.stateTimer <= 0) {
            enemy.state = 'chase';
            // Reset emissive from hurt flash
            enemy.mesh.material.emissive.setHex(0x000000);
          }
          break;
      }

      // ── UPDATE HEALTH BAR POSITION ──
      const typeDef = ENEMY_TYPES[enemy.asset];
      const meshHeight = this.getMeshHeight(typeDef);
      enemy.healthBar.position.set(
        enemy.mesh.position.x,
        enemy.mesh.position.y + meshHeight / 2 + 0.3,
        enemy.mesh.position.z
      );

      // ── UPDATE HEALTH BAR CANVAS ──
      this.updateHealthBar(enemy);

      // ── SYNC POSITION REFERENCE ──
      enemy.position.copy(enemy.mesh.position);
    }
  }

  /**
   * Rotate enemy mesh to face the player on the Y axis.
   */
  facePlayer(enemy, playerPos) {
    const dx = playerPos.x - enemy.mesh.position.x;
    const dz = playerPos.z - enemy.mesh.position.z;
    enemy.mesh.rotation.y = Math.atan2(dx, dz);
  }

  /**
   * Move enemy toward player on the XZ plane, snapping Y to terrain.
   */
  moveTowardPlayer(enemy, playerPos, delta) {
    const dx = playerPos.x - enemy.mesh.position.x;
    const dz = playerPos.z - enemy.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.1) return;

    const nx = dx / dist;
    const nz = dz / dist;

    const moveX = nx * enemy.speed * delta;
    const moveZ = nz * enemy.speed * delta;

    const newX = enemy.mesh.position.x + moveX;
    const newZ = enemy.mesh.position.z + moveZ;
    const newY = this.getGroundHeight(newX, newZ);

    const typeDef = ENEMY_TYPES[enemy.asset];
    const meshHeight = this.getMeshHeight(typeDef);

    enemy.mesh.position.set(newX, newY + meshHeight / 2, newZ);
  }

  // ─── COMBAT ───────────────────────────────────────────────────────

  /**
   * Handle melee attack from the player (combat:slash event).
   * Checks cone in front of camera for enemies in range.
   */
  handlePlayerAttack(data) {
    const playerPos = this.camera.position.clone();
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    forward.normalize();

    // Get weapon damage
    let weaponDamage = 15; // fallback
    if (this.engine.weaponSystem && this.engine.weaponSystem.currentWeapon) {
      weaponDamage = this.engine.weaponSystem.currentWeapon.damage;
    }

    const power = data.power !== undefined ? data.power : 1;
    const totalDamage = Math.round(weaponDamage * power);
    const meleeRange = 3.0;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;

      const toEnemy = new THREE.Vector3().subVectors(enemy.mesh.position, playerPos);
      toEnemy.y = 0;
      const dist = toEnemy.length();

      if (dist > meleeRange) continue;

      // Check angle: dot product with forward direction (within 90 degree arc → cos(45°) = ~0.707)
      toEnemy.normalize();
      const dot = forward.dot(toEnemy);

      if (dot > 0) {
        // Enemy is in front of player (within 180 degree cone, tighten to 90 using dot > 0)
        this.damageEnemy(enemy, totalDamage);
      }
    }
  }

  /**
   * Handle projectile hit (combat:projectile_hit event).
   * Damages enemies within a blast radius of the hit position.
   */
  handleProjectileHit(data) {
    const hitPos = data.position instanceof THREE.Vector3
      ? data.position
      : new THREE.Vector3(data.position.x, data.position.y, data.position.z);
    const damage = data.damage || 10;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;

      const dist = enemy.mesh.position.distanceTo(hitPos);
      if (dist < 1.5) {
        this.damageEnemy(enemy, damage);
      }
    }
  }

  /**
   * Apply damage to an enemy and handle state changes / death.
   */
  damageEnemy(enemy, amount) {
    enemy.health -= amount;

    // Enter hurt state
    enemy.state = 'hurt';
    enemy.stateTimer = 0.3;

    // Flash emissive red
    enemy.mesh.material.emissive.setHex(0xff0000);
    setTimeout(() => {
      if (!enemy.dead) {
        enemy.mesh.material.emissive.setHex(0x000000);
      }
    }, 150);

    events.emit('enemy:damaged', {
      id: enemy.id,
      amount,
      remaining: enemy.health,
    });

    if (enemy.health <= 0) {
      enemy.health = 0;
      enemy.state = 'dead';
      enemy.dead = true;
      enemy.stateTimer = 0;

      events.emit('enemy:killed', {
        id: enemy.id,
        asset: enemy.asset,
        position: enemy.mesh.position.clone(),
      });

      // Drop loot
      this.dropLoot(enemy);

      // Award XP
      const xpAmount = 15 + Math.floor(Math.random() * 16); // 15-30
      events.emit('player:xp', { amount: xpAmount });
    }
  }

  /**
   * Random loot drops on enemy kill.
   * 50% gold (5-15), 20% potion, 20% XP orb, 10% nothing.
   */
  dropLoot(enemy) {
    const roll = Math.random();

    if (roll < 0.5) {
      // Gold
      const goldAmount = 5 + Math.floor(Math.random() * 11); // 5-15
      events.emit('item:collected', {
        id: `gold_${enemy.id}`,
        name: 'Gold',
        type: 'gold',
        quantity: goldAmount,
      });
    } else if (roll < 0.7) {
      // Potion
      events.emit('item:collected', {
        id: `potion_${enemy.id}`,
        name: 'Health Potion',
        type: 'potion',
        quantity: 1,
      });
    } else if (roll < 0.9) {
      // XP orb
      events.emit('item:collected', {
        id: `xp_orb_${enemy.id}`,
        name: 'XP Orb',
        type: 'xp_orb',
        quantity: 1,
      });
    }
    // 10%: nothing
  }

  // ─── UTILITY ──────────────────────────────────────────────────────

  /**
   * Returns the number of alive enemies currently tracked.
   */
  getEnemyCount() {
    return this.enemies.filter((e) => !e.dead).length;
  }
}
