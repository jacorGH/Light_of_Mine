import * as THREE from 'three';

/**
 * GrassCutter — handles grass cutting interaction.
 * 
 * The player can cut grass in two ways:
 * 1. Click/tap to slash — cuts all grass within a radius in front of the player
 * 2. Walk through — grass near feet gets trampled (optional, lighter effect)
 * 
 * Cut grass shrinks to the ground with a quick animation, then stays cut.
 * Occasionally drops items (herbs, rupees-style rewards).
 */
export class GrassCutter {
  constructor(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.scene = engine.scene;

    // Cutting parameters
    this.cutRadius = 2.5;        // How far the slash reaches
    this.cutAngle = Math.PI / 2; // 90 degree arc in front of player
    this.walkCutRadius = 0.8;    // Grass cut just by walking over it

    // Animation state
    this.cuttingAnimations = []; // { grassMesh, index, progress }

    // Slash visual
    this.slashMesh = null;
    this.slashTimer = 0;
    this.isSlashing = false;

    // Slash cooldown
    this.cooldown = 0;
    this.cooldownTime = 0.3; // seconds between slashes

    // Input bindings
    this.setupInput();
    this.createSlashVisual();
  }

  setupInput() {
    // PC: left click or spacebar to slash
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement) {
        this.slash();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.slash();
      }
    });

    // Mobile: double-tap right side to slash (single tap reserved for look)
    this.lastTapTime = 0;
    const canvas = this.engine.renderer.domElement;
    canvas.addEventListener('touchstart', (e) => {
      const halfW = window.innerWidth / 2;
      for (const touch of e.changedTouches) {
        if (touch.clientX >= halfW) {
          const now = performance.now();
          if (now - this.lastTapTime < 300) {
            this.slash();
          }
          this.lastTapTime = now;
        }
      }
    });
  }

  createSlashVisual() {
    // Arc shape that appears briefly when slashing
    const curve = new THREE.ArcCurve(0, 0, 1.5, -Math.PI / 4, Math.PI / 4, false);
    const points = curve.getPoints(12);
    const slashGeo = new THREE.BufferGeometry().setFromPoints(
      points.map(p => new THREE.Vector3(p.x, 0, p.y))
    );

    const slashMat = new THREE.LineBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.8,
      linewidth: 2,
    });

    this.slashMesh = new THREE.Line(slashGeo, slashMat);
    this.slashMesh.visible = false;
    this.scene.add(this.slashMesh);
  }

  /**
   * Perform a slash attack — cuts grass in an arc in front of the player.
   */
  slash() {
    if (this.cooldown > 0) return;
    this.cooldown = this.cooldownTime;
    this.isSlashing = true;
    this.slashTimer = 0.2; // slash visual duration

    // Show slash visual
    this.updateSlashPosition();
    this.slashMesh.visible = true;
    this.slashMesh.material.opacity = 0.9;

    // Find and cut grass in front of player
    const playerPos = this.camera.position;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    // Get all grass meshes in scene
    this.scene.traverse((obj) => {
      if (obj.isInstancedMesh && obj.name === 'grass') {
        this.cutGrassInRange(obj, playerPos, forward);
      }
    });
  }

  /**
   * Cut grass blades within the slash arc.
   */
  cutGrassInRange(grassMesh, playerPos, forward) {
    const blades = grassMesh.userData.blades;
    if (!blades) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const parentPos = new THREE.Vector3();

    // Get grass mesh world position (from cell group)
    grassMesh.parent.getWorldPosition(parentPos);

    for (let i = 0; i < blades.length; i++) {
      const blade = blades[i];
      if (blade.cut) continue;

      // Get blade world position
      const bladeWorldX = blade.worldX;
      const bladeWorldZ = blade.worldZ;

      // Distance check
      const dx = bladeWorldX - playerPos.x;
      const dz = bladeWorldZ - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > this.cutRadius) continue;

      // Angle check — is the grass in front of us?
      const toGrass = new THREE.Vector2(dx, dz).normalize();
      const forwardDir = new THREE.Vector2(forward.x, forward.z).normalize();
      const dot = toGrass.dot(forwardDir);

      if (dot < Math.cos(this.cutAngle / 2)) continue;

      // Cut this blade!
      blade.cut = true;
      this.cuttingAnimations.push({
        grassMesh,
        index: i,
        progress: 0,
      });
    }
  }

  /**
   * Check for grass trampling when walking (lighter cut mechanic).
   */
  updateWalkCutting() {
    const playerPos = this.camera.position;

    this.scene.traverse((obj) => {
      if (obj.isInstancedMesh && obj.name === 'grass') {
        const blades = obj.userData.blades;
        if (!blades) return;

        for (let i = 0; i < blades.length; i++) {
          const blade = blades[i];
          if (blade.cut) continue;

          const dx = blade.worldX - playerPos.x;
          const dz = blade.worldZ - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist < this.walkCutRadius) {
            blade.cut = true;
            this.cuttingAnimations.push({
              grassMesh: obj,
              index: i,
              progress: 0,
            });
          }
        }
      }
    });
  }

  /**
   * Update slash visual position to be in front of camera.
   */
  updateSlashPosition() {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    this.slashMesh.position.copy(this.camera.position);
    this.slashMesh.position.addScaledVector(forward, 1.5);
    this.slashMesh.position.y -= 0.3;

    // Rotate to face forward
    this.slashMesh.lookAt(
      this.slashMesh.position.x + forward.x,
      this.slashMesh.position.y,
      this.slashMesh.position.z + forward.z
    );
  }

  /**
   * Called every frame — animate cutting grass and handle timers.
   */
  update(delta) {
    // Cooldown
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

    // Walk cutting (always active)
    this.updateWalkCutting();

    // Animate cut grass (shrink to ground)
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    for (let i = this.cuttingAnimations.length - 1; i >= 0; i--) {
      const anim = this.cuttingAnimations[i];
      anim.progress += delta * 4; // speed of shrink animation

      if (anim.progress >= 1) {
        // Final state: flattened
        anim.grassMesh.getMatrixAt(anim.index, matrix);
        matrix.decompose(pos, quat, scl);
        scl.set(scl.x, 0.05, scl.z); // nearly flat
        matrix.compose(pos, quat, scl);
        anim.grassMesh.setMatrixAt(anim.index, matrix);
        anim.grassMesh.instanceMatrix.needsUpdate = true;
        this.cuttingAnimations.splice(i, 1);
      } else {
        // Interpolate scale Y toward 0
        anim.grassMesh.getMatrixAt(anim.index, matrix);
        matrix.decompose(pos, quat, scl);
        const t = anim.progress;
        scl.y = scl.x * (1 - t * 0.95); // shrink Y, keep X/Z
        // Tilt forward as it falls
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
