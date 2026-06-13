import * as THREE from 'three';

/**
 * First-person player controller.
 * 
 * PC: WASD movement + mouse look (pointer lock) + Space=jump + Click=attack
 * Mobile layout (Daggerfall-inspired):
 *   - Bottom-left 25%: Movement joystick
 *   - Bottom-right 25%: Camera look
 *   - Center (middle 50% of screen): Combat swipe zone (Daggerfall directional)
 *   - Bottom center strip: Action wheel (swipe up=jump, swipe left/right=cycle weapon)
 */
export class PlayerController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Movement
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.walkSpeed = 3.5;
    this.sprintSpeed = 7;
    this.speed = this.walkSpeed;
    this.isSprinting = false;
    this.keys = { forward: false, backward: false, left: false, right: false };

    // Zoom/aim state
    this.defaultFov = 60;
    this.zoomFov = 30;
    this.isZooming = false;
    this.currentFov = this.defaultFov;

    // Jump
    this.isGrounded = true;
    this.jumpVelocity = 0;
    this.jumpForce = 8;
    this.gravity = -20;

    // Mouse look
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.isLocked = false;

    // Detect mobile
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Callbacks (set by Engine)
    this.onCombatGesture = null;
    this.onWeaponCycle = null;
    this.onMenuOpen = null; // long-press action button opens radial menu

    // ─── PC CONTROLS ───────────────────────────────────────────────
    if (!this.isMobile) {
      domElement.addEventListener('click', () => {
        domElement.requestPointerLock();
      });
      document.addEventListener('pointerlockchange', () => {
        this.isLocked = document.pointerLockElement === domElement;
      });
      document.addEventListener('mousemove', (e) => this.onMouseMove(e));

      // Right-click to zoom/aim (for bow/projectiles)
      document.addEventListener('mousedown', (e) => {
        if (e.button === 2 && this.isLocked) { this.isZooming = true; }
      });
      document.addEventListener('mouseup', (e) => {
        if (e.button === 2) { this.isZooming = false; }
      });
      domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));

    // ─── MOBILE CONTROLS ───────────────────────────────────────────
    this.moveTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    this.lookTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    this.combatTouch = { id: null, startX: 0, startY: 0, startTime: 0 };
    this.actionTouch = { id: null, startX: 0, startY: 0, startTime: 0 };
    this.moveInput = { x: 0, y: 0 };

    if (this.isMobile) {
      domElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
      domElement.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
      domElement.addEventListener('touchend', (e) => this.onTouchEnd(e));
      domElement.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
      this.createMobileUI();
    }
  }

  // ─── PC ──────────────────────────────────────────────────────────

  onMouseMove(event) {
    if (!this.isLocked) return;
    const sensitivity = 0.002;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= event.movementX * sensitivity;
    this.euler.x -= event.movementY * sensitivity;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  onKeyDown(event) {
    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = true; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = true; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = true; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
      case 'ShiftLeft': case 'ShiftRight':
        this.isSprinting = !this.isSprinting;
        this.speed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;
        break;
      case 'Space':
        event.preventDefault();
        if (this.isGrounded) {
          this.jumpVelocity = this.jumpForce;
          this.isGrounded = false;
        }
        break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = false; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = false; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = false; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
    }
  }

  // ─── MOBILE ZONES ───────────────────────────────────────────────
  //
  // Layout:
  //  ┌───────────────────────────────────┐
  //  │                                   │
  //  │         COMBAT SWIPE ZONE         │  top 75% center 60%
  //  │        (Daggerfall swipes)        │
  //  │                                   │
  //  ├───────────┬───────────┬───────────┤  ← 75% down
  //  │   MOVE    │  ACTION   │   LOOK    │  bottom 25%
  //  │ (joystick)│(jump/cycle)│  (drag)   │
  //  └───────────┴───────────┴───────────┘

  getTouchZone(clientX, clientY) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const xRatio = clientX / w;
    const yRatio = clientY / h;

    // Bottom 30% strip (wider action zone)
    if (yRatio > 0.70) {
      if (xRatio < 0.30) return 'move';
      if (xRatio > 0.70) return 'look';
      return 'action'; // center bottom — wider area
    }

    // Everything else is combat zone
    return 'combat';
  }

  onTouchStart(event) {
    event.preventDefault();
    for (const touch of event.changedTouches) {
      const zone = this.getTouchZone(touch.clientX, touch.clientY);

      switch (zone) {
        case 'move':
          if (this.moveTouch.id === null) {
            this.moveTouch.id = touch.identifier;
            this.moveTouch.startX = touch.clientX;
            this.moveTouch.startY = touch.clientY;
            this.updateJoystickVisual(touch.clientX, touch.clientY);
          }
          break;
        case 'look':
          if (this.lookTouch.id === null) {
            this.lookTouch.id = touch.identifier;
            this.lookTouch.currentX = touch.clientX;
            this.lookTouch.currentY = touch.clientY;
          }
          break;
        case 'combat':
          if (this.combatTouch.id === null) {
            this.combatTouch.id = touch.identifier;
            this.combatTouch.startX = touch.clientX;
            this.combatTouch.startY = touch.clientY;
            this.combatTouch.startTime = performance.now();
            this.showSwipeTrail(touch.clientX, touch.clientY);
          }
          break;
        case 'action':
          if (this.actionTouch.id === null) {
            this.actionTouch.id = touch.identifier;
            this.actionTouch.startX = touch.clientX;
            this.actionTouch.startY = touch.clientY;
            this.actionTouch.startTime = performance.now();
            // Start long-press timer for menu
            this.actionLongPressTimer = setTimeout(() => {
              if (this.actionTouch.id !== null) {
                this.actionTouch.id = null; // consume the touch
                this.flashActionBtn('≡ Menu');
                if (this.onMenuOpen) this.onMenuOpen();
              }
            }, 500);
          }
          break;
      }
    }
  }

  onTouchMove(event) {
    event.preventDefault();
    for (const touch of event.changedTouches) {
      if (touch.identifier === this.moveTouch.id) {
        const dx = touch.clientX - this.moveTouch.startX;
        const dy = touch.clientY - this.moveTouch.startY;
        const maxR = 50;
        this.moveInput.x = Math.max(-1, Math.min(1, dx / maxR));
        this.moveInput.y = Math.max(-1, Math.min(1, dy / maxR));
        this.updateJoystickKnob(this.moveInput.x * maxR, this.moveInput.y * maxR);

      } else if (touch.identifier === this.lookTouch.id) {
        const dx = touch.clientX - this.lookTouch.currentX;
        const dy = touch.clientY - this.lookTouch.currentY;
        const sensitivity = 0.004;
        this.euler.setFromQuaternion(this.camera.quaternion);
        this.euler.y -= dx * sensitivity;
        this.euler.x -= dy * sensitivity;
        this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
        this.camera.quaternion.setFromEuler(this.euler);
        this.lookTouch.currentX = touch.clientX;
        this.lookTouch.currentY = touch.clientY;

      } else if (touch.identifier === this.combatTouch.id) {
        this.updateSwipeTrail(touch.clientX, touch.clientY);

      }
    }
  }

  onTouchEnd(event) {
    for (const touch of event.changedTouches) {
      if (touch.identifier === this.moveTouch.id) {
        this.moveTouch.id = null;
        this.moveInput.x = 0;
        this.moveInput.y = 0;
        this.hideJoystick();

      } else if (touch.identifier === this.lookTouch.id) {
        this.lookTouch.id = null;

      } else if (touch.identifier === this.combatTouch.id) {
        this.resolveCombatSwipe(touch.clientX, touch.clientY);
        this.combatTouch.id = null;
        this.hideSwipeTrail();

      } else if (touch.identifier === this.actionTouch.id) {
        // Cancel long-press timer (they released before 500ms)
        clearTimeout(this.actionLongPressTimer);
        this.resolveAction(touch.clientX, touch.clientY);
        this.actionTouch.id = null;
      }
    }
  }

  // ─── DAGGERFALL COMBAT ──────────────────────────────────────────
  // Swipe direction = attack direction. The sword swings the way you swipe.

  resolveCombatSwipe(endX, endY) {
    const dx = endX - this.combatTouch.startX;
    const dy = endY - this.combatTouch.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - this.combatTouch.startTime;

    if (dist < 12) {
      // Tap = jab/thrust
      if (this.onCombatGesture) {
        this.onCombatGesture({ type: 'thrust', direction: 'center', label: 'Thrust', power: 0.5 });
      }
      this.showCombatLabel('Thrust');
      return;
    }

    // Determine swipe direction (screen-space = attack direction)
    const angle = Math.atan2(-dy, dx); // -dy so up = positive
    const deg = ((angle * 180 / Math.PI) + 360) % 360;
    const speed = dist / Math.max(elapsed, 1);
    const power = Math.min(1, speed / 1.5);

    let type, direction, label;

    if (deg >= 60 && deg < 120) {
      type = 'slash_up'; direction = 'up'; label = '↑ Slash Up';
    } else if (deg >= 120 && deg < 165) {
      type = 'slash_up_left'; direction = 'up-left'; label = '↖ Slash';
    } else if (deg >= 15 && deg < 60) {
      type = 'slash_up_right'; direction = 'up-right'; label = '↗ Slash';
    } else if (deg >= 240 && deg < 300) {
      type = 'slash_down'; direction = 'down'; label = '↓ Slash Down';
    } else if (deg >= 195 && deg < 240) {
      type = 'slash_down_left'; direction = 'down-left'; label = '↙ Slash';
    } else if (deg >= 300 && deg < 345) {
      type = 'slash_down_right'; direction = 'down-right'; label = '↘ Slash';
    } else if (deg >= 165 && deg < 195) {
      type = 'slash_left'; direction = 'left'; label = '← Sweep';
    } else {
      type = 'slash_right'; direction = 'right'; label = '→ Sweep';
    }

    this.showCombatLabel(label);

    if (this.onCombatGesture) {
      this.onCombatGesture({ type, direction, label, power });
    }
  }

  // ─── ACTION WHEEL (bottom center) ──────────────────────────────
  // Swipe up = jump, swipe left = prev weapon, swipe right = next weapon, tap = interact

  resolveAction(endX, endY) {
    const dx = endX - this.actionTouch.startX;
    const dy = endY - this.actionTouch.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 15) {
      // Tap = interact (future)
      return;
    }

    const angle = Math.atan2(-dy, dx);
    const deg = ((angle * 180 / Math.PI) + 360) % 360;

    if (deg >= 45 && deg < 135) {
      // Swipe up = jump
      if (this.isGrounded) {
        this.jumpVelocity = this.jumpForce;
        this.isGrounded = false;
        this.flashActionBtn('JUMP');
      }
    } else if (deg >= 135 && deg < 225) {
      // Swipe left = prev weapon
      if (this.onWeaponCycle) this.onWeaponCycle(-1);
      this.flashActionBtn('◀ Prev');
    } else if (deg >= 315 || deg < 45) {
      // Swipe right = next weapon
      if (this.onWeaponCycle) this.onWeaponCycle(1);
      this.flashActionBtn('Next ▶');
    } else {
      // Swipe down = (reserved, maybe crouch later)
    }
  }

  // ─── MOBILE UI ──────────────────────────────────────────────────

  createMobileUI() {
    // Joystick
    this.joystickBase = document.createElement('div');
    Object.assign(this.joystickBase.style, {
      position: 'fixed', width: '100px', height: '100px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)',
      display: 'none', zIndex: '1000', pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
    });
    document.body.appendChild(this.joystickBase);

    this.joystickKnob = document.createElement('div');
    Object.assign(this.joystickKnob.style, {
      position: 'absolute', width: '44px', height: '44px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.45)', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)', pointerEvents: 'none',
    });
    this.joystickBase.appendChild(this.joystickKnob);

    // Combat label (center, fades)
    this.combatLabel = document.createElement('div');
    Object.assign(this.combatLabel.style, {
      position: 'fixed', top: '45%', left: '50%', transform: 'translateX(-50%)',
      color: '#ffaa44', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '18px',
      textShadow: '0 0 10px rgba(255,150,50,0.8)', zIndex: '1002', pointerEvents: 'none',
      opacity: '0', transition: 'opacity 0.2s',
    });
    document.body.appendChild(this.combatLabel);

    // Swipe trail dot
    this.swipeTrail = document.createElement('div');
    Object.assign(this.swipeTrail.style, {
      position: 'fixed', width: '16px', height: '16px', borderRadius: '50%',
      background: 'rgba(255,200,100,0.6)', boxShadow: '0 0 8px rgba(255,150,50,0.4)',
      display: 'none', zIndex: '1001', pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
    });
    document.body.appendChild(this.swipeTrail);

    // Action button area indicator — BIGGER for easier touch
    this.actionBtn = document.createElement('div');
    Object.assign(this.actionBtn.style, {
      position: 'fixed', bottom: '3%', left: '50%', transform: 'translateX(-50%)',
      width: '100px', height: '54px', borderRadius: '27px',
      border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)',
      zIndex: '999', pointerEvents: 'none', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: '10px',
      flexDirection: 'column', gap: '2px', lineHeight: '1.2',
    });
    this.actionBtn.innerHTML = '↑ Jump ←→ Wpn<br><span style="font-size:8px;opacity:0.5">Hold: Menu</span>';
    document.body.appendChild(this.actionBtn);

    // Zone divider line (subtle)
    const divider = document.createElement('div');
    Object.assign(divider.style, {
      position: 'fixed', bottom: '25%', left: '0', width: '100%', height: '1px',
      background: 'rgba(255,255,255,0.08)', zIndex: '998', pointerEvents: 'none',
    });
    document.body.appendChild(divider);

    // Instructions (fades)
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
      color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: '10px',
      textAlign: 'center', zIndex: '999', pointerEvents: 'none', lineHeight: '1.5',
    });
    hint.innerHTML = 'Swipe center to attack | Bottom: Move · Action · Look';
    document.body.appendChild(hint);
    setTimeout(() => { hint.style.transition = 'opacity 1.5s'; hint.style.opacity = '0'; setTimeout(() => hint.remove(), 1500); }, 5000);
  }

  updateJoystickVisual(x, y) {
    this.joystickBase.style.display = 'block';
    this.joystickBase.style.left = x + 'px';
    this.joystickBase.style.top = y + 'px';
  }
  updateJoystickKnob(dx, dy) {
    this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  hideJoystick() {
    this.joystickBase.style.display = 'none';
    this.joystickKnob.style.transform = 'translate(-50%, -50%)';
  }
  showSwipeTrail(x, y) {
    this.swipeTrail.style.display = 'block';
    this.swipeTrail.style.left = x + 'px';
    this.swipeTrail.style.top = y + 'px';
  }
  updateSwipeTrail(x, y) {
    this.swipeTrail.style.left = x + 'px';
    this.swipeTrail.style.top = y + 'px';
  }
  hideSwipeTrail() { this.swipeTrail.style.display = 'none'; }
  showCombatLabel(text) {
    this.combatLabel.textContent = text;
    this.combatLabel.style.opacity = '1';
    setTimeout(() => { this.combatLabel.style.opacity = '0'; }, 500);
  }
  flashActionBtn(text) {
    const orig = this.actionBtn.textContent;
    this.actionBtn.textContent = text;
    this.actionBtn.style.background = 'rgba(255,255,255,0.15)';
    setTimeout(() => { this.actionBtn.textContent = orig; this.actionBtn.style.background = 'rgba(255,255,255,0.05)'; }, 400);
  }

  // ─── TERRAIN FOLLOWING ────────────────────────────────────────────

  setScene(scene) {
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 50;
    this.groundHeight = 0;
    this.playerHeight = 1.7;
    this.heightSmoothing = 10;
    this.terrainMeshes = [];
    this.terrainCacheTimer = 0;
  }

  refreshTerrainCache() {
    this.terrainMeshes = [];
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.name === 'terrain') this.terrainMeshes.push(obj);
    });
  }

  getGroundHeight() {
    if (!this.scene || !this.raycaster) return this.groundHeight;
    this.terrainCacheTimer -= 1;
    if (this.terrainCacheTimer <= 0 || this.terrainMeshes.length === 0) {
      this.refreshTerrainCache();
      this.terrainCacheTimer = 60;
    }
    const origin = this.camera.position.clone();
    origin.y += 20;
    this.raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    const hits = this.raycaster.intersectObjects(this.terrainMeshes, false);
    if (hits.length > 0) return hits[0].point.y;
    return this.groundHeight;
  }

  // ─── COLLISION DETECTION ────────────────────────────────────────

  /**
   * Check player position against nearby solid objects and push back if overlapping.
   * Uses simple cylinder-vs-cylinder approach (XZ plane only).
   */
  resolveCollisions() {
    if (!this.scene) return;

    const playerX = this.camera.position.x;
    const playerZ = this.camera.position.z;
    const playerRadius = 0.4; // player collision radius

    // Only check objects within a reasonable range (8 units)
    this.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.userData || obj.userData.collisionRadius <= 0) return;

      const cr = obj.userData.collisionRadius;
      if (!cr) return;

      // Get object world position
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);

      const dx = playerX - wp.x;
      const dz = playerZ - wp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = playerRadius + cr;

      if (dist < minDist && dist > 0.01) {
        // Push player out
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        this.camera.position.x += nx * overlap;
        this.camera.position.z += nz * overlap;
      }
    });
  }

  // ─── UPDATE ─────────────────────────────────────────────────────

  update(delta) {
    this.velocity.x -= this.velocity.x * 10 * delta;
    this.velocity.z -= this.velocity.z * 10 * delta;

    this.direction.z = Number(this.keys.forward) - Number(this.keys.backward);
    this.direction.x = Number(this.keys.right) - Number(this.keys.left);

    if (this.isMobile) {
      this.direction.x += this.moveInput.x;
      this.direction.z += -this.moveInput.y;
    }
    this.direction.normalize();

    if (Math.abs(this.direction.z) > 0.01) this.velocity.z -= this.direction.z * this.speed * delta;
    if (Math.abs(this.direction.x) > 0.01) this.velocity.x += this.direction.x * this.speed * delta;

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    this.camera.position.addScaledVector(forward, -this.velocity.z);
    this.camera.position.addScaledVector(right, this.velocity.x);

    // ─── COLLISION: push player away from solid objects ──────────
    this.resolveCollisions();

    // ─── SPRINT stamina drain ──────────────────────────────────────
    if (this.isSprinting && (this.keys.forward || this.keys.backward || this.keys.left || this.keys.right || Math.abs(this.moveInput.x) > 0.1 || Math.abs(this.moveInput.y) > 0.1)) {
      if (typeof events !== 'undefined') {
        // Import events at module level won't work here, so use window dispatch
      }
    }

    // ─── ZOOM FOV interpolation ────────────────────────────────────
    const targetFov = this.isZooming ? this.zoomFov : this.defaultFov;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, 8 * delta);
    if (Math.abs(this.currentFov - this.camera.fov) > 0.1) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // Terrain + jump
    const targetGroundY = this.getGroundHeight();
    this.groundHeight += (targetGroundY - this.groundHeight) * Math.min(1, this.heightSmoothing * delta);

    if (!this.isGrounded) {
      this.jumpVelocity += this.gravity * delta;
      this.camera.position.y += this.jumpVelocity * delta;
      const groundLevel = this.groundHeight + this.playerHeight;
      if (this.camera.position.y <= groundLevel) {
        this.camera.position.y = groundLevel;
        this.jumpVelocity = 0;
        this.isGrounded = true;
      }
    } else {
      this.camera.position.y = this.groundHeight + this.playerHeight;
    }
  }
}
