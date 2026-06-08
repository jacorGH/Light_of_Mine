import * as THREE from 'three';

/**
 * GrassCutter — handles grass cutting interaction.
 * 
 * PC: Left-click while pointer is locked triggers a slash.
 * Mobile: Combat gesture zone triggers slash (via Engine wiring).
 * Walk: Grass at your feet gets trampled automatically.
 * 
 * Cut grass shrinks to the ground with a quick animation, then stays cut.
 */
export class GrassCutter {
  constructor(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.scene = engine.scene;

    // Cutting parameters
    this.cutRadius = 2.5;
    this.cutAngle = Math.PI / 2; // 90 degree arc in front of player
    this.walkCutRadius = 0.8;

    // Animation state
    this.cuttingAnimations = [];

    // Slash visual
    this.slashMesh = null;
    this.slashTimer = 0;
    this.isSlashing = false;

    // Cooldown
    this.cooldown = 0;
    this.cooldownTime = 0.3;

    // Cached grass meshes (refreshed when cells load/unload)
    this.grassMeshes = [];
    this.grassCacheDirty = true;

    // PC input only (mobile goes through gesture callback)
    this.setupPCInput();
    this.createSlashVisual();
  }

  setupPCInput() {
    // PC: left click to slash (only when pointer locked)
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement) {
        this.slash();
      }
    });
  }

  createSlashVisual() {
    const curve = new THREE.ArcCurve(0, 0, 1.5, -Math.PI / 4, Math.PI / 4, false);
    const points = curve.getPoints(12);
    const slashGeo = new THREE.BufferGeometry().setFromPoints(
      points.map(p => new THREE.Vector3(p.x, 0, p.y))
    );

    const slashMat = new THREE.LineBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.8,
    });

    this.slashMesh = new THREE.Line(slashGeo, slashMat);
    this.slashMesh.visible = false;
    this.scene.add(this.slashMesh);
  }

  /**
   * Perform a slash — cuts grass in an arc in front of the player.
   * Called by PC click or mobile gesture callback.
   */
  slash() {
    if (this.cooldown > 0) return;
    this.cooldown = this.cooldownTime;
    this.isSlashing = true;
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
    for (const grassMesh of this.grassMeshes) {
      this.cutGrassInRange(grassMesh, playerPos, forward);
    }
  }

  /**
   * Refresh cached list of grass InstancedMeshes from scene.
   * Only recomputes when flagged dirty (cells loaded/unloaded).
   */
  refreshGrassCache() {
    if (!this.grassCacheDirty) return;
    this.grassMeshes = [];
    this.scene.traverse((obj) => {
      if (obj.isInstancedMesh && obj.name === 'grass') {
        this.grassMeshes.push(obj);
      }
    });
    this.grassCacheDirty = false;
  }

  /**
   * Mark grass cache as needing refresh (call when cells load/unload).
   */
  invalidateGrassCache() {
    this.grassCacheDirty = true;
  }

  cutGrassInRange(grassMesh, playerPos, forward) {
    const blades = grassMesh.userData.blades;
    if (!blades) return;

    for (let i = 0; i < blades.length; i++) {
      const blade = blades[i];
      if (blade.cut) continue;

      const dx = blade.worldX - playerPos.x;
      const dz = blade.worldZ - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > this.cutRadius) continue;

      // Angle check
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.01) continue;
      const dot = (dx * forward.x + dz * forward.z) / len;

      if (dot < Math.cos(this.cutAngle / 2)) continue;

      blade.cut = true;
      this.cuttingAnimations.push({ grassMesh, index: i, progress: 0 });
    }
  }

  updateWalkCutting() {
    const playerPos = this.camera.position;

    this.refreshGrassCache();
    for (const grassMesh of this.grassMeshes) {
      const blades = grassMesh.userData.blades;
      if (!blades) continue;

      for (let i = 0; i < blades.length; i++) {
        const blade = blades[i];
        if (blade.cut) continue;

        const dx = blade.worldX - playerPos.x;
        const dz = blade.worldZ - playerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < this.walkCutRadius) {
          blade.cut = true;
          this.cuttingAnimations.push({ grassMesh, index: i, progress: 0 });
        }
      }
    }
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
    if (this.cooldown > 0) {
      this.cooldown -= delta;
    }

    // Slash visual fade
    if (this.slashTimer > 0) {
      this.slashTimer -= delta;
      this.updateSlashPosition();
      this.slashMesh.material.opacity = this.slashTimer / 0.2;
      if (this.slashTimer <= 0) {
        this.slashMesh.visible = false;
        this.isSlashing = false;
      }
    }

    // Walk cutting
    this.updateWalkCutting();

    // Animate cut grass
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    for (let i = this.cuttingAnimations.length - 1; i >= 0; i--) {
      const anim = this.cuttingAnimations[i];
      anim.progress += delta * 4;

      if (anim.progress >= 1) {
        anim.grassMesh.getMatrixAt(anim.index, matrix);
        matrix.decompose(pos, quat, scl);
        scl.set(scl.x, 0.05, scl.z);
        matrix.compose(pos, quat, scl);
        anim.grassMesh.setMatrixAt(anim.index, matrix);
        anim.grassMesh.instanceMatrix.needsUpdate = true;
        this.cuttingAnimations.splice(i, 1);
      } else {
        anim.grassMesh.getMatrixAt(anim.index, matrix);
        matrix.decompose(pos, quat, scl);
        const t = anim.progress;
        scl.y = scl.x * (1 - t * 0.95);
        const tiltQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(t * 0.8, quat.y, 0)
        );
        matrix.compose(pos, tiltQuat, scl);
        anim.grassMesh.setMatrixAt(anim.index, matrix);
        anim.grassMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
