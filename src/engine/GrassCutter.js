import * as THREE from 'three';

/**
 * GrassCutter — handles cutting grass clumps (Zelda-style).
 * 
 * Grass clumps are THREE.Groups with userData.type === 'grass_clump'.
 * When cut, they play a shrink+scatter animation and are removed.
 * Can optionally drop items.
 * 
 * PC: Left-click triggers slash.
 * Mobile: Combat gesture triggers slash via Engine callback.
 */
export class GrassCutter {
  constructor(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.scene = engine.scene;

    // Cutting parameters
    this.cutRadius = 3.0;

    // Animations in progress
    this.cutAnimations = []; // { clump, progress, particles }

    // Cached clump list
    this.grassClumps = [];
    this.grassCacheDirty = true;

    // Slash visual
    this.slashMesh = null;
    this.slashTimer = 0;
    this.cooldown = 0;
    this.cooldownTime = 0.3;

    this.setupPCInput();
    this.createSlashVisual();
  }

  setupPCInput() {
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement) {
        // Trigger weapon attack
        if (this.engine.weaponSystem) {
          this.engine.weaponSystem.attack({ type: 'slash_right', direction: 'right', power: 1 });
        }
        // Cut grass if melee
        if (this.engine.weaponSystem && this.engine.weaponSystem.currentWeapon.type === 'melee') {
          this.slash();
        }
      }
    });
  }

  createSlashVisual() {
    const curve = new THREE.ArcCurve(0, 0, 1.5, -Math.PI / 4, Math.PI / 4, false);
    const points = curve.getPoints(12);
    const geo = new THREE.BufferGeometry().setFromPoints(
      points.map(p => new THREE.Vector3(p.x, 0, p.y))
    );
    const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 });
    this.slashMesh = new THREE.Line(geo, mat);
    this.slashMesh.visible = false;
    this.scene.add(this.slashMesh);
  }

  /**
   * Cut all grass clumps within range in front of the player.
   */
  slash() {
    if (this.cooldown > 0) return;
    this.cooldown = this.cooldownTime;
    this.slashTimer = 0.2;

    this.updateSlashPosition();
    this.slashMesh.visible = true;
    this.slashMesh.material.opacity = 0.9;

    const playerPos = this.camera.position;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    this.refreshGrassCache();

    for (let i = this.grassClumps.length - 1; i >= 0; i--) {
      const clump = this.grassClumps[i];
      if (clump.userData.cut) continue;

      const dx = clump.userData.worldX - playerPos.x;
      const dz = clump.userData.worldZ - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > this.cutRadius) continue;

      // Angle check (120 degree arc in front)
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.1) {
        const dot = (dx * forward.x + dz * forward.z) / len;
        if (dot < Math.cos(Math.PI / 3)) continue;
      }

      // Cut this clump!
      clump.userData.cut = true;
      this.startCutAnimation(clump);

      // Random item drop
      this.rollDrop();
    }
  }

  startCutAnimation(clump) {
    // Create scatter particles
    const particles = [];
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.PlaneGeometry(0.15, 0.15);
      const mat = new THREE.MeshBasicMaterial({
        color: '#4a9a2a',
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      });
      const p = new THREE.Mesh(geo, mat);

      // Get clump world position
      const worldPos = new THREE.Vector3();
      clump.getWorldPosition(worldPos);

      p.position.set(
        worldPos.x + (Math.random() - 0.5) * 1,
        worldPos.y + 0.3 + Math.random() * 0.5,
        worldPos.z + (Math.random() - 0.5) * 1
      );
      p.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

      p.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        2 + Math.random() * 2,
        (Math.random() - 0.5) * 3
      );

      this.scene.add(p);
      particles.push(p);
    }

    this.cutAnimations.push({ clump, progress: 0, particles });
  }

  refreshGrassCache() {
    if (!this.grassCacheDirty) return;
    this.grassClumps = [];
    this.scene.traverse((obj) => {
      if (obj.name === 'grass_clump' && obj.userData.type === 'grass_clump') {
        this.grassClumps.push(obj);
      }
    });
    this.grassCacheDirty = false;
  }

  invalidateGrassCache() {
    this.grassCacheDirty = true;
  }

  updateSlashPosition() {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    this.slashMesh.position.copy(this.camera.position);
    this.slashMesh.position.addScaledVector(forward, 1.5);
    this.slashMesh.position.y -= 0.3;
    this.slashMesh.lookAt(
      this.slashMesh.position.x + forward.x,
      this.slashMesh.position.y,
      this.slashMesh.position.z + forward.z
    );
  }

  update(delta) {
    if (this.cooldown > 0) this.cooldown -= delta;

    // Slash visual fade
    if (this.slashTimer > 0) {
      this.slashTimer -= delta;
      this.updateSlashPosition();
      this.slashMesh.material.opacity = this.slashTimer / 0.2;
      if (this.slashTimer <= 0) this.slashMesh.visible = false;
    }

    // Animate cut clumps
    for (let i = this.cutAnimations.length - 1; i >= 0; i--) {
      const anim = this.cutAnimations[i];
      anim.progress += delta * 3;

      // Shrink the clump
      const shrink = Math.max(0, 1 - anim.progress);
      anim.clump.scale.set(shrink, shrink, shrink);

      // Animate particles
      for (const p of anim.particles) {
        p.position.addScaledVector(p.userData.velocity, delta);
        p.userData.velocity.y -= 8 * delta; // gravity
        p.material.opacity = Math.max(0, 1 - anim.progress);
        p.rotation.x += delta * 5;
      }

      // Done
      if (anim.progress >= 1) {
        // Remove clump from scene
        if (anim.clump.parent) anim.clump.parent.remove(anim.clump);
        // Remove particles
        for (const p of anim.particles) {
          this.scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        }
        this.cutAnimations.splice(i, 1);
        this.grassCacheDirty = true;
      }
    }

    // Walk cutting — cut clumps you step on
    const playerPos = this.camera.position;
    this.refreshGrassCache();
    for (const clump of this.grassClumps) {
      if (clump.userData.cut) continue;
      const dx = clump.userData.worldX - playerPos.x;
      const dz = clump.userData.worldZ - playerPos.z;
      if (dx * dx + dz * dz < 0.6 * 0.6) {
        clump.userData.cut = true;
        this.startCutAnimation(clump);
        this.rollDrop();
      }
    }
  }

  /**
   * Random chance to drop an item when grass is cut.
   */
  rollDrop() {
    if (!this.engine.inventory) return;
    const roll = Math.random();
    if (roll < 0.25) {
      // 25% chance: gold (1-5)
      this.engine.inventory.addItem({ id: 'gold', name: 'Gold', type: 'currency', icon: '●', quantity: Math.ceil(Math.random() * 5) });
    } else if (roll < 0.35) {
      // 10% chance: herb
      this.engine.inventory.addItem({ id: 'herb_healing', name: 'Healing Herb', type: 'consumable', icon: '♣', quantity: 1 });
    } else if (roll < 0.38) {
      // 3% chance: health potion
      this.engine.inventory.addItem({ id: 'potion_health_minor', name: 'Health Potion', type: 'consumable', icon: '❤', quantity: 1 });
    }
    // 62% chance: nothing
  }
}
