import * as THREE from 'three';
import { events } from './EventBus.js';

/**
 * WeaponSystem — Dual quickslot system.
 * 
 * Two independent slots:
 *   - Weapon slot (physical): Fist, Sword, Bow
 *   - Spell slot (magic): Fireball, Icicle, Heal
 * 
 * Both are always "equipped" simultaneously. Normal attack uses weapon,
 * hold-cast uses spell. Player can cycle each independently.
 * 
 * The viewmodel shows whichever was last used (weapon by default).
 * When casting, it briefly shows the spell hand then returns to weapon.
 */
export class WeaponSystem {
  constructor(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.scene = engine.scene;

    // ─── SEPARATE WEAPON AND SPELL LISTS ──────────────────────────
    this.physicalWeapons = [
      { id: 'fist', name: 'Fist', type: 'melee', range: 1.5, damage: 5, cooldown: 0.25 },
      { id: 'sword', name: 'Iron Sword', type: 'melee', range: 2.8, damage: 15, cooldown: 0.4 },
      { id: 'bow', name: 'Bow & Arrow', type: 'projectile', range: 50, damage: 12, cooldown: 0.5 },
    ];

    this.spells = [
      { id: 'fireball', name: 'Fireball', type: 'projectile', range: 40, damage: 25, cooldown: 0.8, magickaCost: 15 },
      { id: 'icicle', name: 'Icicle', type: 'projectile', range: 35, damage: 20, cooldown: 0.6, magickaCost: 12 },
      { id: 'heal', name: 'Heal', type: 'spell', range: 0, damage: 0, cooldown: 1.0, magickaCost: 20 },
    ];

    // Combined list for viewmodel building (kept for mesh lookup)
    this.allItems = [...this.physicalWeapons, ...this.spells];

    // Current indices (independent cycling)
    this.weaponIndex = 1; // sword
    this.spellIndex = 0;  // fireball

    // Active display mode: 'weapon' or 'spell'
    this.activeSlot = 'weapon';

    // State
    this.cooldown = 0;
    this.attackTimer = 0;
    this.isAttacking = false;
    this.attackDirection = 'right';

    // Handedness
    this.dominantHand = 'right';

    // Projectiles
    this.projectiles = [];

    // Viewmodel
    this.viewmodelGroup = new THREE.Group();
    this.viewmodelGroup.name = '__viewmodel';
    this.camera.add(this.viewmodelGroup);
    if (!this.camera.parent) {
      this.scene.add(this.camera);
    }

    this.weaponMeshes = {};
    this.buildWeaponMeshes();
    this.createHUD();
    this.showActiveViewmodel();
    this.setupInput();
  }

  // ─── GETTERS ────────────────────────────────────────────────────

  get currentWeapon() {
    return this.physicalWeapons[this.weaponIndex];
  }

  get currentSpell() {
    return this.spells[this.spellIndex];
  }

  /** Returns whichever is currently "active" for display/attack purposes */
  get activeItem() {
    return this.activeSlot === 'weapon' ? this.currentWeapon : this.currentSpell;
  }

  // ─── CYCLING ────────────────────────────────────────────────────

  nextWeapon() {
    this.weaponIndex = (this.weaponIndex + 1) % this.physicalWeapons.length;
    this.activeSlot = 'weapon';
    this.showActiveViewmodel();
    events.emit('weapon:changed', { weapon: this.currentWeapon, spell: this.currentSpell });
  }

  prevWeapon() {
    this.weaponIndex = (this.weaponIndex - 1 + this.physicalWeapons.length) % this.physicalWeapons.length;
    this.activeSlot = 'weapon';
    this.showActiveViewmodel();
    events.emit('weapon:changed', { weapon: this.currentWeapon, spell: this.currentSpell });
  }

  nextSpell() {
    this.spellIndex = (this.spellIndex + 1) % this.spells.length;
    this.activeSlot = 'spell';
    this.showActiveViewmodel();
    events.emit('weapon:changed', { weapon: this.currentWeapon, spell: this.currentSpell });
  }

  prevSpell() {
    this.spellIndex = (this.spellIndex - 1 + this.spells.length) % this.spells.length;
    this.activeSlot = 'spell';
    this.showActiveViewmodel();
    events.emit('weapon:changed', { weapon: this.currentWeapon, spell: this.currentSpell });
  }

  equipWeaponById(id) {
    const idx = this.physicalWeapons.findIndex(w => w.id === id);
    if (idx !== -1) { this.weaponIndex = idx; this.activeSlot = 'weapon'; this.showActiveViewmodel(); }
  }

  equipSpellById(id) {
    const idx = this.spells.findIndex(s => s.id === id);
    if (idx !== -1) { this.spellIndex = idx; this.activeSlot = 'spell'; this.showActiveViewmodel(); }
  }

  // ─── VIEWMODEL ──────────────────────────────────────────────────

  showActiveViewmodel() {
    const handOffset = this.dominantHand === 'right' ? 0.22 : -0.22;
    const item = this.activeItem;
    const isTwoHanded = item.id === 'bow';
    const xOffset = isTwoHanded ? handOffset * 0.4 : handOffset;

    Object.values(this.weaponMeshes).forEach((m) => { m.visible = false; });
    const mesh = this.weaponMeshes[item.id];
    if (mesh) {
      mesh.visible = true;
      mesh.rotation.set(0, 0, 0);
      mesh.position.set(xOffset, -0.3, -0.6);
    }
    this.updateHUD();
  }

  // Kept for backward compat
  showCurrentWeapon() { this.showActiveViewmodel(); }

  // ─── ATTACK ─────────────────────────────────────────────────────

  /**
   * Physical weapon attack (from normal swipe).
   */
  attackWeapon(gesture) {
    const weapon = this.currentWeapon;
    if (this.cooldown > 0) return false;
    this.cooldown = weapon.cooldown;
    this.isAttacking = true;
    this.attackTimer = 0;
    this.attackDirection = gesture.direction || 'right';
    this.activeSlot = 'weapon';
    this.showActiveViewmodel();

    if (weapon.type === 'projectile') {
      this.fireProjectile(weapon);
    }
    return true;
  }

  /**
   * Spell cast (from hold-release or spell-specific trigger).
   */
  castSpell(gesture) {
    const spell = this.currentSpell;
    if (this.cooldown > 0) return false;
    this.cooldown = spell.cooldown;
    this.isAttacking = true;
    this.attackTimer = 0;
    this.attackDirection = gesture.direction || 'center';
    this.activeSlot = 'spell';
    this.showActiveViewmodel();

    if (spell.type === 'projectile') {
      this.fireProjectile(spell);
    }
    // Heal is handled by Engine (no projectile)
    return true;
  }

  /** Legacy: route to correct method based on activeSlot */
  attack(gesture) {
    if (this.activeSlot === 'spell') return this.castSpell(gesture);
    return this.attackWeapon(gesture);
  }

  fireProjectile(item) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const startPos = this.camera.position.clone();
    startPos.addScaledVector(forward, 1);

    let projGeo, projMat, projLight;

    switch (item.id) {
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
      default: return;
    }

    const projMesh = new THREE.Mesh(projGeo, projMat);
    projMesh.position.copy(startPos);
    if (item.id === 'icicle' || item.id === 'bow') {
      projMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forward);
    }

    this.scene.add(projMesh);
    if (projLight) { projLight.position.copy(startPos); this.scene.add(projLight); }

    this.projectiles.push({
      mesh: projMesh, light: projLight,
      velocity: forward.clone().multiplyScalar(30),
      lifetime: item.range / 30, age: 0, damage: item.damage,
    });
  }

  // ─── INPUT (PC) ─────────────────────────────────────────────────

  setupInput() {
    document.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement) return;
      // Shift+scroll = cycle spells, normal scroll = cycle weapons
      if (e.shiftKey) {
        if (e.deltaY > 0) this.nextSpell(); else this.prevSpell();
      } else {
        if (e.deltaY > 0) this.nextWeapon(); else this.prevWeapon();
      }
    });

    document.addEventListener('keydown', (e) => {
      // 1-3 = weapons, 4-6 = spells
      const num = parseInt(e.key);
      if (num >= 1 && num <= 3 && num <= this.physicalWeapons.length) {
        this.weaponIndex = num - 1;
        this.activeSlot = 'weapon';
        this.showActiveViewmodel();
      } else if (num >= 4 && num <= 6) {
        const spellIdx = num - 4;
        if (spellIdx < this.spells.length) {
          this.spellIndex = spellIdx;
          this.activeSlot = 'spell';
          this.showActiveViewmodel();
        }
      }
    });
  }

  // ─── HUD ────────────────────────────────────────────────────────

  createHUD() {
    // Remove old HUD if exists
    if (this.weaponHUD && this.weaponHUD.parentNode) this.weaponHUD.parentNode.removeChild(this.weaponHUD);

    this.weaponHUD = document.createElement('div');
    Object.assign(this.weaponHUD.style, {
      position: 'fixed', bottom: '12px', right: '12px',
      display: 'flex', gap: '8px', alignItems: 'flex-end',
      zIndex: '1000', pointerEvents: 'none',
      fontFamily: 'monospace', fontSize: '11px',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
    });
    document.body.appendChild(this.weaponHUD);
    this.updateHUD();
  }

  updateHUD() {
    const w = this.currentWeapon;
    const s = this.currentSpell;
    const wIcon = { fist: '👊', sword: '⚔', bow: '🏹' }[w.id] || '⚔';
    const sIcon = { fireball: '🔥', icicle: '❄', heal: '💚' }[s.id] || '✨';
    const wActive = this.activeSlot === 'weapon' ? 'border-color:rgba(255,200,100,0.8)' : 'border-color:rgba(255,255,255,0.2)';
    const sActive = this.activeSlot === 'spell' ? 'border-color:rgba(100,200,255,0.8)' : 'border-color:rgba(255,255,255,0.2)';

    this.weaponHUD.innerHTML = `
      <div style="text-align:center;padding:4px 8px;border:1.5px solid;border-radius:6px;background:rgba(0,0,0,0.5);${wActive}">
        <div style="font-size:18px">${wIcon}</div>
        <div style="color:rgba(255,255,255,0.6);margin-top:2px">${w.name}</div>
      </div>
      <div style="text-align:center;padding:4px 8px;border:1.5px solid;border-radius:6px;background:rgba(0,0,0,0.5);${sActive}">
        <div style="font-size:18px">${sIcon}</div>
        <div style="color:rgba(255,255,255,0.6);margin-top:2px">${s.name}</div>
      </div>
    `;
  }

  // ─── WEAPON MESHES ──────────────────────────────────────────────

  buildWeaponMeshes() {
    const handMat = new THREE.MeshStandardMaterial({ color: '#cc9966', roughness: 0.7, flatShading: true });
    const handGeo = new THREE.BoxGeometry(0.15, 0.12, 0.25);
    const hand = new THREE.Mesh(handGeo, handMat);

    // Fist
    const fist = new THREE.Group();
    fist.add(hand.clone());
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.1), handMat);
      f.position.set(-0.05 + i * 0.035, -0.07, 0.05); fist.add(f);
    }
    this.weaponMeshes['fist'] = fist;

    // Sword
    const sword = new THREE.Group();
    const hMat = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.9, flatShading: true });
    sword.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.25, 6), hMat));
    sword.children[0].position.y = -0.1;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.04), new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.5, metalness: 0.6, flatShading: true }));
    guard.position.y = 0.02; sword.add(guard);
    const bs = new THREE.Shape(); bs.moveTo(-0.03,0); bs.lineTo(0.03,0); bs.lineTo(0.02,0.5); bs.lineTo(0,0.55); bs.lineTo(-0.02,0.5); bs.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bs, { depth: 0.015, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#c0c8d0', roughness: 0.3, metalness: 0.7, flatShading: true }));
    blade.position.set(0, 0.03, -0.007); sword.add(blade);
    this.weaponMeshes['sword'] = sword;

    // Bow
    const bow = new THREE.Group();
    const bc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,-0.3,0), new THREE.Vector3(-0.12,0,0), new THREE.Vector3(0,0.3,0));
    bow.add(new THREE.Mesh(new THREE.TubeGeometry(bc, 12, 0.015, 6, false), new THREE.MeshStandardMaterial({ color: '#8b6914', roughness: 0.8, flatShading: true })));
    bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-0.3,0), new THREE.Vector3(0,0.3,0)]), new THREE.LineBasicMaterial({ color: '#ccc' })));
    const arr = new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.5,4), new THREE.MeshStandardMaterial({ color: '#6a5030', flatShading: true }));
    arr.position.set(0,0,-0.02); arr.rotation.x = Math.PI/2; bow.add(arr);
    this.weaponMeshes['bow'] = bow;

    // Fireball
    const fb = new THREE.Group(); fb.add(hand.clone());
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6), new THREE.MeshStandardMaterial({ color: '#ff4400', emissive: '#ff2200', emissiveIntensity: 1.5, roughness: 0.2 }));
    orb.position.set(0, 0.05, -0.15); fb.add(orb);
    this.weaponMeshes['fireball'] = fb;

    // Icicle
    const ice = new THREE.Group(); ice.add(hand.clone());
    const im = new THREE.MeshStandardMaterial({ color: '#88ddff', emissive: '#2288cc', emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 });
    const is1 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 4), im);
    is1.position.set(0, 0.02, -0.18); is1.rotation.x = -Math.PI/2; ice.add(is1);
    const is2 = is1.clone(); is2.scale.set(0.6,0.7,0.6); is2.position.set(0.04, 0.03, -0.13); ice.add(is2);
    this.weaponMeshes['icicle'] = ice;

    // Heal
    const hl = new THREE.Group(); hl.add(hand.clone());
    const ho = new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6), new THREE.MeshStandardMaterial({ color: '#44ff88', emissive: '#22cc44', emissiveIntensity: 1.5, roughness: 0.2, transparent: true, opacity: 0.8 }));
    ho.position.set(0, 0.05, -0.15); hl.add(ho);
    this.weaponMeshes['heal'] = hl;

    // Position all
    const handOffset = this.dominantHand === 'right' ? 0.22 : -0.22;
    Object.values(this.weaponMeshes).forEach((m) => {
      m.position.set(handOffset, -0.3, -0.6);
      m.visible = false;
      this.viewmodelGroup.add(m);
    });
  }

  // ─── UPDATE ─────────────────────────────────────────────────────

  update(delta) {
    if (this.cooldown > 0) this.cooldown -= delta;

    const item = this.activeItem;
    const mesh = this.weaponMeshes[item.id];
    const handOffset = this.dominantHand === 'right' ? 0.22 : -0.22;

    // Idle bob
    if (mesh && !this.isAttacking) {
      const t = performance.now() * 0.001;
      mesh.position.x = handOffset;
      mesh.position.y = -0.3 + Math.sin(t * 2) * 0.008;
      mesh.position.z = -0.6;
      mesh.rotation.set(0, 0, Math.sin(t * 1.5) * 0.015);
    }

    // Attack animation
    if (this.isAttacking && mesh) {
      this.attackTimer += delta;
      const duration = item.cooldown * 0.7;
      const t = this.attackTimer / duration;
      const dir = this.attackDirection || 'right';

      let swingX = 0, swingY = 0, swingZ = 0, thrustZ = 0;
      if (item.type === 'melee') {
        switch (dir) {
          case 'up': swingX = -1.4; break;
          case 'down': swingX = 1.4; break;
          case 'left': swingZ = 1.2; swingY = 0.4; break;
          case 'right': swingZ = -1.2; swingY = -0.4; break;
          case 'up-left': swingX = -1.0; swingZ = 0.8; break;
          case 'up-right': swingX = -1.0; swingZ = -0.8; break;
          case 'down-left': swingX = 0.8; swingZ = 0.8; break;
          case 'down-right': swingX = 0.8; swingZ = -0.8; break;
          case 'center': thrustZ = -0.3; break;
          default: swingZ = -1.2; break;
        }
      }

      if (t < 0.35) {
        const s = t / 0.35;
        if (item.type === 'melee') {
          mesh.rotation.set(s * swingX, s * swingY, s * swingZ);
          mesh.position.z = -0.6 + s * thrustZ;
        } else {
          mesh.position.z = -0.6 + s * 0.15;
          mesh.rotation.x = -s * 0.3;
        }
      } else if (t < 1.0) {
        const r = (t - 0.35) / 0.65;
        if (item.type === 'melee') {
          mesh.rotation.set((1-r)*swingX, (1-r)*swingY, (1-r)*swingZ);
          mesh.position.z = -0.6 + (1-r) * thrustZ;
        } else {
          mesh.position.z = -0.6 + (1-r) * 0.15;
          mesh.rotation.x = -(1-r) * 0.3;
        }
      } else {
        mesh.rotation.set(0, 0, 0);
        mesh.position.z = -0.6;
        this.isAttacking = false;
      }
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.age += delta;
      proj.mesh.position.addScaledVector(proj.velocity, delta);
      if (proj.light) proj.light.position.copy(proj.mesh.position);

      if (proj.mesh.geometry.type === 'CylinderGeometry') {
        proj.velocity.y -= 9.8 * delta;
        proj.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), proj.velocity.clone().normalize());
      }

      let hit = false;
      if (this.engine.enemySystem) {
        for (const enemy of this.engine.enemySystem.enemies) {
          if (enemy.dead) continue;
          if (proj.mesh.position.distanceTo(enemy.mesh.position) < 1.5) {
            events.emit('combat:projectile_hit', { position: proj.mesh.position.clone(), damage: proj.damage });
            hit = true; break;
          }
        }
      }
      if (proj.mesh.position.y < -2) hit = true;

      if (hit || proj.age >= proj.lifetime) {
        this.scene.remove(proj.mesh);
        if (proj.light) this.scene.remove(proj.light);
        proj.mesh.geometry.dispose(); proj.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }
}
