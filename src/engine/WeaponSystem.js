import * as THREE from 'three';

/**
 * WeaponSystem — manages equipped weapon viewmodel (first-person hand/weapon visible on screen),
 * weapon switching, and attack animations.
 * 
 * Weapons:
 * - Fist: quick punch, short range
 * - Sword: slash/sweep, medium range
 * - Fireball: ranged projectile (fire)
 * - Icicle: ranged projectile (ice)
 * - Bow: ranged projectile (physical)
 * 
 * PC: Scroll wheel or 1-5 keys to switch. Click to attack.
 * Mobile: Weapon switching via swipe-down in gesture zone.
 */
export class WeaponSystem {
  constructor(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.scene = engine.scene;

    // Weapon definitions
    this.weapons = [
      { id: 'fist', name: 'Fist', type: 'melee', range: 1.5, damage: 5, color: '#cc9966', cooldown: 0.25 },
      { id: 'sword', name: 'Iron Sword', type: 'melee', range: 2.8, damage: 15, color: '#aabbcc', cooldown: 0.4 },
      { id: 'fireball', name: 'Fireball', type: 'projectile', range: 40, damage: 25, color: '#ff4400', cooldown: 0.8 },
      { id: 'icicle', name: 'Icicle', type: 'projectile', range: 35, damage: 20, color: '#66ccff', cooldown: 0.6 },
      { id: 'bow', name: 'Bow & Arrow', type: 'projectile', range: 50, damage: 12, color: '#8b6914', cooldown: 0.5 },
    ];

    this.currentWeaponIndex = 1; // Start with sword
    this.cooldown = 0;
    this.attackTimer = 0;
    this.isAttacking = false;

    // Projectiles in flight
    this.projectiles = [];

    // Viewmodel group (attached to camera)
    this.viewmodelGroup = new THREE.Group();
    this.viewmodelGroup.name = '__viewmodel';
    this.camera.add(this.viewmodelGroup);
    this.scene.add(this.camera); // Camera must be in scene for children to render

    // Build weapon meshes
    this.weaponMeshes = {};
    this.buildWeaponMeshes();
    this.showCurrentWeapon();

    // HUD element for weapon name
    this.createHUD();

    // Input
    this.setupInput();
  }

  get currentWeapon() {
    return this.weapons[this.currentWeaponIndex];
  }

  // ─── WEAPON MESHES (viewmodels) ──────────────────────────────────

  buildWeaponMeshes() {
    const handMat = new THREE.MeshStandardMaterial({ color: '#cc9966', roughness: 0.7, flatShading: true });

    // ─── FIST ──────────────────────────────────
    const fist = new THREE.Group();
    const handGeo = new THREE.BoxGeometry(0.15, 0.12, 0.25);
    const hand = new THREE.Mesh(handGeo, handMat);
    fist.add(hand);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.1), handMat);
      finger.position.set(-0.05 + i * 0.035, -0.07, 0.05);
      fist.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.08), handMat);
    thumb.position.set(-0.08, -0.03, 0);
    thumb.rotation.z = 0.3;
    fist.add(thumb);
    this.weaponMeshes['fist'] = fist;

    // ─── SWORD ─────────────────────────────────
    const sword = new THREE.Group();
    const handleMat = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.9, flatShading: true });
    const swordHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.25, 6), handleMat);
    swordHandle.position.set(0, -0.1, 0);
    sword.add(swordHandle);
    const guardMat = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.5, metalness: 0.6, flatShading: true });
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.04), guardMat);
    guard.position.set(0, 0.02, 0);
    sword.add(guard);
    // Blade as extruded shape
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.03, 0);
    bladeShape.lineTo(0.03, 0);
    bladeShape.lineTo(0.02, 0.5);
    bladeShape.lineTo(0, 0.55);
    bladeShape.lineTo(-0.02, 0.5);
    bladeShape.closePath();
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.015, bevelEnabled: false });
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#c0c8d0', roughness: 0.3, metalness: 0.7, flatShading: true });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0.03, -0.007);
    sword.add(blade);
    this.weaponMeshes['sword'] = sword;

    // ─── FIREBALL ──────────────────────────────
    const fireball = new THREE.Group();
    const fireHand = hand.clone();
    fireball.add(fireHand);
    const fireOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#ff4400', emissive: '#ff2200', emissiveIntensity: 1.5, roughness: 0.2 })
    );
    fireOrb.position.set(0, 0.05, -0.15);
    fireball.add(fireOrb);
    for (let i = 0; i < 5; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 4, 3),
        new THREE.MeshBasicMaterial({ color: '#ffaa00' })
      );
      particle.position.set(
        (Math.random() - 0.5) * 0.1,
        0.05 + Math.random() * 0.1,
        -0.15 + (Math.random() - 0.5) * 0.06
      );
      fireball.add(particle);
    }
    this.weaponMeshes['fireball'] = fireball;

    // ─── ICICLE ────────────────────────────────
    const icicle = new THREE.Group();
    const iceHand = hand.clone();
    icicle.add(iceHand);
    const iceMat = new THREE.MeshStandardMaterial({ color: '#88ddff', emissive: '#2288cc', emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 });
    const iceShard = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 4), iceMat);
    iceShard.position.set(0, 0.02, -0.18);
    iceShard.rotation.x = -Math.PI / 2;
    icicle.add(iceShard);
    const shard2 = iceShard.clone();
    shard2.scale.set(0.6, 0.7, 0.6);
    shard2.position.set(0.04, 0.03, -0.13);
    shard2.rotation.z = 0.3;
    icicle.add(shard2);
    const shard3 = iceShard.clone();
    shard3.scale.set(0.5, 0.6, 0.5);
    shard3.position.set(-0.03, 0.01, -0.14);
    shard3.rotation.z = -0.2;
    icicle.add(shard3);
    this.weaponMeshes['icicle'] = icicle;

    // ─── BOW ───────────────────────────────────
    const bow = new THREE.Group();
    const bowCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, -0.3, 0),
      new THREE.Vector3(-0.12, 0, 0),
      new THREE.Vector3(0, 0.3, 0)
    );
    const bowTube = new THREE.TubeGeometry(bowCurve, 12, 0.015, 6, false);
    const bowMat = new THREE.MeshStandardMaterial({ color: '#8b6914', roughness: 0.8, flatShading: true });
    bow.add(new THREE.Mesh(bowTube, bowMat));
    // String
    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.3, 0),
      new THREE.Vector3(0, 0.3, 0),
    ]);
    bow.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#cccccc' })));
    // Arrow nocked
    const arrowShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: '#6a5030', flatShading: true })
    );
    arrowShaft.position.set(0, 0, -0.02);
    arrowShaft.rotation.x = Math.PI / 2;
    bow.add(arrowShaft);
    const arrowHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.02, 0.06, 4),
      new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.5, flatShading: true })
    );
    arrowHead.position.set(0, 0, -0.28);
    arrowHead.rotation.x = Math.PI / 2;
    bow.add(arrowHead);
    this.weaponMeshes['bow'] = bow;

    // Position all viewmodels in lower-right of view
    Object.values(this.weaponMeshes).forEach((mesh) => {
      mesh.position.set(0.25, -0.25, -0.5);
      mesh.visible = false;
      this.viewmodelGroup.add(mesh);
    });
  }

  showCurrentWeapon() {
    Object.values(this.weaponMeshes).forEach((m) => { m.visible = false; });
    const mesh = this.weaponMeshes[this.currentWeapon.id];
    if (mesh) {
      mesh.visible = true;
      mesh.rotation.set(0, 0, 0);
    }
    this.updateHUD();
  }

  // ─── INPUT ───────────────────────────────────────────────────────

  setupInput() {
    // PC: scroll wheel to cycle weapons
    document.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement) return;
      if (e.deltaY > 0) this.nextWeapon();
      else this.prevWeapon();
    });

    // PC: number keys 1-5
    document.addEventListener('keydown', (e) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= this.weapons.length) {
        this.currentWeaponIndex = num - 1;
        this.showCurrentWeapon();
      }
    });
  }

  nextWeapon() {
    this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
    this.showCurrentWeapon();
  }

  prevWeapon() {
    this.currentWeaponIndex = (this.currentWeaponIndex - 1 + this.weapons.length) % this.weapons.length;
    this.showCurrentWeapon();
  }

  // ─── ATTACK ─────────────────────────────────────────────────────

  attack(gesture) {
    if (this.cooldown > 0) return;

    const weapon = this.currentWeapon;
    this.cooldown = weapon.cooldown;
    this.isAttacking = true;
    this.attackTimer = 0;

    if (weapon.type === 'projectile') {
      this.projectileAttack();
    }
  }

  projectileAttack() {
    const weapon = this.currentWeapon;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    const startPos = this.camera.position.clone();
    startPos.addScaledVector(forward, 1);

    let projGeo, projMat, projLight;

    switch (weapon.id) {
      case 'fireball':
        projGeo = new THREE.SphereGeometry(0.2, 8, 6);
        projMat = new THREE.MeshStandardMaterial({ color: '#ff4400', emissive: '#ff2200', emissiveIntensity: 2.0 });
        projLight = new THREE.PointLight('#ff4400', 1.5, 8);
        break;
      case 'icicle':
        projGeo = new THREE.ConeGeometry(0.08, 0.4, 4);
        projMat = new THREE.MeshStandardMaterial({ color: '#88ddff', emissive: '#2288cc', emissiveIntensity: 1.5, transparent: true, opacity: 0.9 });
        projLight = new THREE.PointLight('#66ccff', 0.8, 5);
        break;
      case 'bow':
        projGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4);
        projMat = new THREE.MeshStandardMaterial({ color: '#6a5030', flatShading: true });
        projLight = null;
        break;
    }

    const projMesh = new THREE.Mesh(projGeo, projMat);
    projMesh.position.copy(startPos);

    if (weapon.id === 'icicle' || weapon.id === 'bow') {
      projMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forward);
    }

    this.scene.add(projMesh);
    if (projLight) {
      projLight.position.copy(startPos);
      this.scene.add(projLight);
    }

    this.projectiles.push({
      mesh: projMesh,
      light: projLight,
      velocity: forward.clone().multiplyScalar(30),
      lifetime: weapon.range / 30,
      age: 0,
      damage: weapon.damage,
    });
  }

  // ─── HUD ────────────────────────────────────────────────────────

  createHUD() {
    this.weaponHUD = document.createElement('div');
    Object.assign(this.weaponHUD.style, {
      position: 'fixed',
      bottom: '15px',
      right: '15px',
      color: 'rgba(255,255,255,0.7)',
      fontFamily: 'monospace',
      fontSize: '13px',
      textAlign: 'right',
      zIndex: '1000',
      pointerEvents: 'none',
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      lineHeight: '1.5',
    });
    document.body.appendChild(this.weaponHUD);
    this.updateHUD();
  }

  updateHUD() {
    const weapon = this.currentWeapon;
    const index = this.currentWeaponIndex + 1;
    this.weaponHUD.innerHTML = `<strong>${weapon.name}</strong><br><span style="font-size:11px;color:rgba(255,255,255,0.4)">[${index}/${this.weapons.length}] Scroll/1-5</span>`;
  }

  // ─── UPDATE ─────────────────────────────────────────────────────

  update(delta) {
    if (this.cooldown > 0) {
      this.cooldown -= delta;
    }

    // Weapon idle bob
    const mesh = this.weaponMeshes[this.currentWeapon.id];
    if (mesh && !this.isAttacking) {
      const t = performance.now() * 0.001;
      mesh.position.y = -0.25 + Math.sin(t * 2) * 0.008;
      mesh.rotation.z = Math.sin(t * 1.5) * 0.02;
    }

    // Attack animation
    if (this.isAttacking && mesh) {
      this.attackTimer += delta;
      const weapon = this.currentWeapon;
      const duration = weapon.cooldown * 0.7;
      const t = this.attackTimer / duration;

      if (t < 0.4) {
        const swing = t / 0.4;
        if (weapon.type === 'melee') {
          mesh.rotation.x = -swing * 1.2;
          mesh.position.z = -0.5 - swing * 0.2;
        } else {
          mesh.position.z = -0.5 + swing * 0.15;
          mesh.rotation.x = -swing * 0.3;
        }
      } else if (t < 1.0) {
        const ret = (t - 0.4) / 0.6;
        if (weapon.type === 'melee') {
          mesh.rotation.x = -(1 - ret) * 1.2;
          mesh.position.z = -0.5 - (1 - ret) * 0.2;
        } else {
          mesh.position.z = -0.5 + (1 - ret) * 0.15;
          mesh.rotation.x = -(1 - ret) * 0.3;
        }
      } else {
        mesh.rotation.x = 0;
        mesh.position.z = -0.5;
        this.isAttacking = false;
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.age += delta;
      proj.mesh.position.addScaledVector(proj.velocity, delta);
      if (proj.light) proj.light.position.copy(proj.mesh.position);

      // Gravity for arrows
      if (proj.mesh.geometry.type === 'CylinderGeometry') {
        proj.velocity.y -= 9.8 * delta;
        proj.mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          proj.velocity.clone().normalize()
        );
      }

      if (proj.age >= proj.lifetime) {
        this.scene.remove(proj.mesh);
        if (proj.light) this.scene.remove(proj.light);
        proj.mesh.geometry.dispose();
        proj.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }
}
