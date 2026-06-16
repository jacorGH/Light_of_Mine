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
      { id: 'fist', name: 'Fist', type: 'melee', range: 1.5, damage: 5, cooldown: 0.25, twoHanded: false },
      { id: 'sword', name: 'Iron Sword', type: 'melee', range: 2.8, damage: 15, cooldown: 0.4, twoHanded: false },
      { id: 'bow', name: 'Bow & Arrow', type: 'projectile', range: 50, damage: 12, cooldown: 0.5, twoHanded: true },
    ];

    this.spells = [
      { id: 'fireball', name: 'Fireball', type: 'projectile', range: 40, damage: 25, cooldown: 0.8, magickaCost: 15 },
      { id: 'icicle', name: 'Icicle', type: 'projectile', range: 35, damage: 20, cooldown: 0.6, magickaCost: 12 },
      { id: 'heal', name: 'Heal', type: 'spell', range: 0, damage: 0, cooldown: 1.0, magickaCost: 20 },
    ];

    // ─── HAND SLOTS (fully flexible — anything in either hand) ─────
    // Player assigns items to left/right hand freely.
    this.leftHand = this.spells[0];          // fireball default
    this.rightHand = this.physicalWeapons[1]; // sword default

    // All available items for cycling/assignment
    this.allItems = [...this.physicalWeapons, ...this.spells];

    // State
    this.cooldownLeft = 0;
    this.cooldownRight = 0;
    this.attackTimer = 0;
    this.isAttacking = false;
    this.attackDirection = 'right';
    this.attackingHand = 'right';

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
    // Returns whichever hand has a physical weapon (for backward compat)
    if (this.rightHand && this.rightHand.type === 'melee') return this.rightHand;
    if (this.leftHand && this.leftHand.type === 'melee') return this.leftHand;
    return this.rightHand || this.physicalWeapons[0];
  }

  get currentSpell() {
    // Returns whichever hand has a spell
    if (this.leftHand && (this.leftHand.type === 'spell' || this.leftHand.magickaCost)) return this.leftHand;
    if (this.rightHand && (this.rightHand.type === 'spell' || this.rightHand.magickaCost)) return this.rightHand;
    return this.spells[0];
  }

  get activeItem() {
    return this.rightHand;
  }

  getHandItem(hand) {
    return hand === 'left' ? this.leftHand : this.rightHand;
  }

  // ─── HAND ASSIGNMENT ────────────────────────────────────────────

  assignToHand(hand, item) {
    if (item.twoHanded) {
      // Two-handed takes both slots
      this.leftHand = item;
      this.rightHand = item;
    } else {
      // One-handed: assign to the specified hand
      if (hand === 'left') {
        this.leftHand = item;
        // If right hand was a two-handed item, clear it to default
        if (this.rightHand.twoHanded) this.rightHand = this.physicalWeapons[0];
      } else {
        this.rightHand = item;
        // If left hand was a two-handed item, clear it to default
        if (this.leftHand.twoHanded) this.leftHand = this.spells[0];
      }
    }

    this.showActiveViewmodel();
    events.emit('weapon:changed', { leftHand: this.leftHand, rightHand: this.rightHand });
  }

  // ─── CYCLING (per hand) ─────────────────────────────────────────

  cycleHand(hand, direction) {
    const current = hand === 'left' ? this.leftHand : this.rightHand;
    const currentIdx = this.allItems.findIndex(i => i.id === current.id);
    let newIdx = currentIdx;

    // Skip items that would cause invalid combos (two-handed in one slot while other has something)
    for (let attempt = 0; attempt < this.allItems.length; attempt++) {
      newIdx = (newIdx + direction + this.allItems.length) % this.allItems.length;
      const candidate = this.allItems[newIdx];

      // If candidate is two-handed, it takes both slots — always valid
      if (candidate.twoHanded) {
        this.assignToHand(hand, candidate);
        return;
      }

      // If the OTHER hand has a two-handed item, we need to clear it first
      // (cycling away from two-handed state = put one-handed in this slot)
      this.assignToHand(hand, candidate);
      return;
    }
  }

  nextWeapon() { this.cycleHand('right', 1); }
  prevWeapon() { this.cycleHand('right', -1); }
  nextSpell() { this.cycleHand('left', 1); }
  prevSpell() { this.cycleHand('left', -1); }

  equipWeaponById(id) {
    const item = this.allItems.find(i => i.id === id);
    if (item) this.assignToHand('right', item);
  }

  equipSpellById(id) {
    const item = this.allItems.find(i => i.id === id);
    if (item) this.assignToHand('left', item);
  }

  // ─── VIEWMODEL ──────────────────────────────────────────────────

  showActiveViewmodel() {
    Object.values(this.weaponMeshes).forEach((m) => { m.visible = false; m.scale.set(1,1,1); });

    const lItem = this.leftHand;
    const rItem = this.rightHand;
    const isTwoHanded = lItem === rItem && lItem.twoHanded;

    if (isTwoHanded) {
      // Two-handed: single centered viewmodel
      const mesh = this.weaponMeshes[lItem.id];
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(0, -0.3, -0.6);
        mesh.rotation.set(0, 0, 0);
      }
    } else {
      // Show left hand item on left, right hand item on right
      const lMesh = this.weaponMeshes[lItem.id];
      const rMesh = this.weaponMeshes[rItem.id];

      if (lMesh) {
        lMesh.visible = true;
        lMesh.position.set(-0.22, -0.35, -0.65);
        lMesh.rotation.set(0, 0, 0);
        lMesh.scale.set(0.85, 0.85, 0.85);
      }
      if (rMesh && rMesh !== lMesh) {
        rMesh.visible = true;
        rMesh.position.set(0.22, -0.3, -0.6);
        rMesh.rotation.set(0, 0, 0);
      }
    }

    this.updateHUD();
  }

  showCurrentWeapon() { this.showActiveViewmodel(); }

  // ─── ATTACK (hand-based) ──────────────────────────────────────

  /**
   * Use whatever is in the specified hand.
   * @param {string} hand - 'left' or 'right'
   * @param {object} gesture - attack gesture data
   */
  useHand(hand, gesture) {
    const item = this.getHandItem(hand);
    if (!item) return false;

    const cd = hand === 'left' ? 'cooldownLeft' : 'cooldownRight';
    if (this[cd] > 0) return false;
    this[cd] = item.cooldown;

    this.isAttacking = true;
    this.attackTimer = 0;
    this.attackDirection = gesture.direction || 'right';
    this.attackingHand = hand;

    if (item.type === 'projectile') {
      this.fireProjectile(item);
    }
    return true;
  }

  /** Legacy wrapper */
  attackWeapon(gesture) { return this.useHand('right', gesture); }
  castSpell(gesture) { return this.useHand('left', gesture); }
  attack(gesture) { return this.useHand(gesture.hand || 'right', gesture); }

  /**
   * Whether an item in a hand is ranged (for zoom logic).
   */
  isHandRanged(hand) {
    const item = this.getHandItem(hand);
    return item && item.type === 'projectile';
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
    if (this.weaponHUD && this.weaponHUD.parentNode) this.weaponHUD.parentNode.removeChild(this.weaponHUD);

    // Left hand HUD (center-left of screen)
    this.leftHUD = document.createElement('div');
    Object.assign(this.leftHUD.style, {
      position: 'fixed', bottom: '55%', left: '8px',
      textAlign: 'center', padding: '4px 6px',
      border: '1.5px solid rgba(100,180,255,0.5)', borderRadius: '8px',
      background: 'rgba(0,0,0,0.4)',
      zIndex: '1000', pointerEvents: 'none',
      fontFamily: 'monospace', fontSize: '10px',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      opacity: '0.8',
    });
    document.body.appendChild(this.leftHUD);

    // Right hand HUD (center-right of screen)
    this.rightHUD = document.createElement('div');
    Object.assign(this.rightHUD.style, {
      position: 'fixed', bottom: '55%', right: '8px',
      textAlign: 'center', padding: '4px 6px',
      border: '1.5px solid rgba(255,200,100,0.5)', borderRadius: '8px',
      background: 'rgba(0,0,0,0.4)',
      zIndex: '1000', pointerEvents: 'none',
      fontFamily: 'monospace', fontSize: '10px',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      opacity: '0.8',
    });
    document.body.appendChild(this.rightHUD);

    // Keep old reference for compat (hidden)
    this.weaponHUD = document.createElement('div');
    this.weaponHUD.style.display = 'none';
    document.body.appendChild(this.weaponHUD);

    this.updateHUD();
  }

  updateHUD() {
    const lItem = this.leftHand;
    const rItem = this.rightHand;
    const isTwoHanded = lItem === rItem && lItem.twoHanded;

    const getIcon = (id) => ({ fist:'👊', sword:'⚔', bow:'🏹', fireball:'🔥', icicle:'❄', heal:'💚' }[id] || '•');

    if (isTwoHanded) {
      this.leftHUD.style.display = 'none';
      this.rightHUD.innerHTML = `<div style="font-size:18px">${getIcon(rItem.id)}</div><div style="color:rgba(255,200,100,0.6);font-size:8px">${rItem.name} (2H)</div>`;
      this.rightHUD.style.left = '50%';
      this.rightHUD.style.right = 'auto';
      this.rightHUD.style.transform = 'translateX(-50%)';
    } else {
      this.leftHUD.style.display = 'block';
      this.rightHUD.style.left = 'auto';
      this.rightHUD.style.right = '8px';
      this.rightHUD.style.transform = 'none';
      this.leftHUD.innerHTML = `<div style="font-size:16px">${getIcon(lItem.id)}</div><div style="color:rgba(100,180,255,0.6);font-size:8px">${lItem.name}</div>`;
      this.rightHUD.innerHTML = `<div style="font-size:16px">${getIcon(rItem.id)}</div><div style="color:rgba(255,200,100,0.6);font-size:8px">${rItem.name}</div>`;
    }
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
    if (this.cooldownLeft > 0) this.cooldownLeft -= delta;
    if (this.cooldownRight > 0) this.cooldownRight -= delta;

    const item = this.getHandItem(this.attackingHand);
    const mesh = item ? this.weaponMeshes[item.id] : null;
    const handOffset = this.dominantHand === 'right' ? 0.22 : -0.22;

    // Idle bob — animate ALL visible meshes
    if (!this.isAttacking) {
      const t = performance.now() * 0.001;
      Object.values(this.weaponMeshes).forEach((m) => {
        if (!m.visible) return;
        m.position.y = m.position.y * 0.95 + (-0.3 + Math.sin(t * 2) * 0.006) * 0.05;
        m.rotation.z = Math.sin(t * 1.5) * 0.012;
      });
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
