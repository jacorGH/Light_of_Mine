import * as THREE from 'three';

/**
 * First-person player controller.
 * 
 * PC: WASD/Arrow movement + mouse look (pointer lock) + Space=jump + Click=attack
 * Mobile: 3-zone touch layout:
 *   - Left side (lower): Movement joystick
 *   - Upper center: Combat gesture zone (swipe = attack type)
 *   - Right side (lower): Camera look drag
 *   - Bottom center: Action buttons (jump, interact)
 */
export class PlayerController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Movement state
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.speed = 8;
    this.keys = { forward: false, backward: false, left: false, right: false, jump: false };

    // Jump state
    this.isGrounded = true;
    this.jumpVelocity = 0;
    this.jumpForce = 8;
    this.gravity = -20;

    // Mouse look
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.isLocked = false;

    // Detect mobile
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Combat gesture callback (set by GrassCutter or combat system)
    this.onCombatGesture = null;

    // ─── PC CONTROLS ───────────────────────────────────────────────
    if (!this.isMobile) {
      domElement.addEventListener('click', () => {
        domElement.requestPointerLock();
      });

      document.addEventListener('pointerlockchange', () => {
        this.isLocked = document.pointerLockElement === domElement;
      });

      document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));

    // ─── MOBILE CONTROLS ───────────────────────────────────────────
    // Touch tracking per zone
    this.moveTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    this.lookTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    this.gestureTouch = { id: null, startX: 0, startY: 0, startTime: 0 };
    this.moveInput = { x: 0, y: 0 };

    if (this.isMobile) {
      domElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
      domElement.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
      domElement.addEventListener('touchend', (e) => this.onTouchEnd(e));
      domElement.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
      this.createMobileUI();
    }
  }

  // ─── PC: Mouse Look ─────────────────────────────────────────────

  onMouseMove(event) {
    if (!this.isLocked) return;
    const sensitivity = 0.002;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= event.movementX * sensitivity;
    this.euler.x -= event.movementY * sensitivity;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  // ─── PC: Keyboard ───────────────────────────────────────────────

  onKeyDown(event) {
    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = true; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = true; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = true; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
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

  // ─── MOBILE: 3-zone touch ───────────────────────────────────────

  /**
   * Determine which zone a touch point belongs to:
   * - 'move': left 35% of screen, bottom 65%
   * - 'look': right 35% of screen, bottom 65%
   * - 'gesture': upper center (top 40%, middle 50% width)
   * - 'action': bottom center strip (jump/interact buttons)
   */
  getTouchZone(clientX, clientY) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const xRatio = clientX / w;
    const yRatio = clientY / h;

    // Upper center band: combat gestures
    if (yRatio < 0.4 && xRatio > 0.25 && xRatio < 0.75) {
      return 'gesture';
    }

    // Bottom center: action buttons area
    if (yRatio > 0.85 && xRatio > 0.35 && xRatio < 0.65) {
      return 'action';
    }

    // Left side: movement
    if (xRatio < 0.4) {
      return 'move';
    }

    // Right side: look
    return 'look';
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
            this.moveTouch.currentX = touch.clientX;
            this.moveTouch.currentY = touch.clientY;
            this.updateJoystickVisual(touch.clientX, touch.clientY);
          }
          break;

        case 'look':
          if (this.lookTouch.id === null) {
            this.lookTouch.id = touch.identifier;
            this.lookTouch.startX = touch.clientX;
            this.lookTouch.startY = touch.clientY;
            this.lookTouch.currentX = touch.clientX;
            this.lookTouch.currentY = touch.clientY;
          }
          break;

        case 'gesture':
          if (this.gestureTouch.id === null) {
            this.gestureTouch.id = touch.identifier;
            this.gestureTouch.startX = touch.clientX;
            this.gestureTouch.startY = touch.clientY;
            this.gestureTouch.startTime = performance.now();
            this.showGestureIndicator(touch.clientX, touch.clientY);
          }
          break;

        case 'action':
          // Jump on tap in bottom center
          if (this.isGrounded) {
            this.jumpVelocity = this.jumpForce;
            this.isGrounded = false;
            this.flashJumpButton();
          }
          break;
      }
    }
  }

  onTouchMove(event) {
    event.preventDefault();

    for (const touch of event.changedTouches) {
      if (touch.identifier === this.moveTouch.id) {
        this.moveTouch.currentX = touch.clientX;
        this.moveTouch.currentY = touch.clientY;

        const dx = this.moveTouch.currentX - this.moveTouch.startX;
        const dy = this.moveTouch.currentY - this.moveTouch.startY;
        const maxRadius = 50;

        this.moveInput.x = Math.max(-1, Math.min(1, dx / maxRadius));
        this.moveInput.y = Math.max(-1, Math.min(1, dy / maxRadius));

        this.updateJoystickKnob(this.moveInput.x * maxRadius, this.moveInput.y * maxRadius);

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

      } else if (touch.identifier === this.gestureTouch.id) {
        // Update gesture trail visual
        this.updateGestureIndicator(touch.clientX, touch.clientY);
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

      } else if (touch.identifier === this.gestureTouch.id) {
        // Resolve the gesture
        this.resolveGesture(touch.clientX, touch.clientY);
        this.gestureTouch.id = null;
        this.hideGestureIndicator();
      }
    }
  }

  // ─── GESTURE RECOGNITION ────────────────────────────────────────

  /**
   * Analyze the swipe and determine the attack/action type:
   * - Short center-up tap: Jab (quick thrust)
   * - Swipe up-right: Slash right
   * - Swipe up-left: Slash left
   * - Swipe down: Overhead/power attack
   * - Swipe left: Sweep left
   * - Swipe right: Sweep right
   * - Swipe up: Uppercut
   * - Short tap (no movement): Block/parry
   */
  resolveGesture(endX, endY) {
    const dx = endX - this.gestureTouch.startX;
    const dy = endY - this.gestureTouch.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - this.gestureTouch.startTime;

    let gesture = null;

    if (dist < 15) {
      // Tap — no significant movement
      if (elapsed < 200) {
        gesture = { type: 'jab', label: 'Jab' };
      } else {
        gesture = { type: 'block', label: 'Block' };
      }
    } else {
      // Swipe — determine direction
      const angle = Math.atan2(-dy, dx); // -dy because screen Y is inverted
      const deg = ((angle * 180 / Math.PI) + 360) % 360;

      // Speed factor — faster swipes = more power
      const speed = dist / Math.max(elapsed, 1);
      const power = Math.min(1, speed / 2);

      if (deg >= 60 && deg < 120) {
        // Up
        gesture = { type: 'uppercut', label: 'Uppercut', power };
      } else if (deg >= 30 && deg < 60) {
        // Up-right
        gesture = { type: 'slash_right', label: 'Slash →', power };
      } else if (deg >= 120 && deg < 150) {
        // Up-left
        gesture = { type: 'slash_left', label: '← Slash', power };
      } else if (deg >= 240 && deg < 300) {
        // Down
        gesture = { type: 'power_attack', label: 'Power ↓', power };
      } else if (deg >= 330 || deg < 30) {
        // Right
        gesture = { type: 'sweep_right', label: 'Sweep →', power };
      } else if (deg >= 150 && deg < 210) {
        // Left
        gesture = { type: 'sweep_left', label: '← Sweep', power };
      } else if (deg >= 210 && deg < 240) {
        // Down-left
        gesture = { type: 'slash_left', label: '← Slash ↓', power };
      } else {
        // Down-right
        gesture = { type: 'slash_right', label: 'Slash ↓→', power };
      }
    }

    if (gesture) {
      this.showGestureLabel(gesture.label);

      // Fire callback for combat system
      if (this.onCombatGesture) {
        this.onCombatGesture(gesture);
      }
    }
  }

  // ─── MOBILE UI ──────────────────────────────────────────────────

  createMobileUI() {
    // ─── Joystick (left side) ──────────────────
    this.joystickBase = document.createElement('div');
    Object.assign(this.joystickBase.style, {
      position: 'fixed',
      width: '120px',
      height: '120px',
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.3)',
      background: 'rgba(255,255,255,0.08)',
      display: 'none',
      zIndex: '1000',
      pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
    });
    document.body.appendChild(this.joystickBase);

    this.joystickKnob = document.createElement('div');
    Object.assign(this.joystickKnob.style, {
      position: 'absolute',
      width: '50px',
      height: '50px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.5)',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    });
    this.joystickBase.appendChild(this.joystickKnob);

    // ─── Combat gesture zone indicator (upper center) ──────
    this.gestureZone = document.createElement('div');
    Object.assign(this.gestureZone.style, {
      position: 'fixed',
      top: '5%',
      left: '25%',
      width: '50%',
      height: '35%',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '12px',
      background: 'rgba(255,255,255,0.03)',
      zIndex: '999',
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    // Zone label
    const zoneLabel = document.createElement('div');
    Object.assign(zoneLabel.style, {
      color: 'rgba(255,255,255,0.2)',
      fontFamily: 'monospace',
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '2px',
    });
    zoneLabel.textContent = 'combat';
    this.gestureZone.appendChild(zoneLabel);
    document.body.appendChild(this.gestureZone);

    // ─── Gesture trail dot ─────────────────────
    this.gestureDot = document.createElement('div');
    Object.assign(this.gestureDot.style, {
      position: 'fixed',
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      background: 'rgba(255,100,50,0.7)',
      boxShadow: '0 0 10px rgba(255,100,50,0.5)',
      display: 'none',
      zIndex: '1001',
      pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
    });
    document.body.appendChild(this.gestureDot);

    // ─── Gesture label (shows attack name briefly) ─────────
    this.gestureLabel = document.createElement('div');
    Object.assign(this.gestureLabel.style, {
      position: 'fixed',
      top: '42%',
      left: '50%',
      transform: 'translateX(-50%)',
      color: '#ff8844',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      fontSize: '16px',
      textShadow: '0 0 8px rgba(255,100,50,0.8)',
      zIndex: '1002',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.3s',
    });
    document.body.appendChild(this.gestureLabel);

    // ─── Jump button (bottom center) ───────────
    this.jumpBtn = document.createElement('div');
    Object.assign(this.jumpBtn.style, {
      position: 'fixed',
      bottom: '3%',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.35)',
      background: 'rgba(255,255,255,0.08)',
      zIndex: '1000',
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.5)',
      fontFamily: 'monospace',
      fontSize: '11px',
    });
    this.jumpBtn.textContent = 'JUMP';
    document.body.appendChild(this.jumpBtn);

    // ─── Instructions ──────────────────────────
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position: 'fixed',
      bottom: '75px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(255,255,255,0.5)',
      fontFamily: 'monospace',
      fontSize: '11px',
      textAlign: 'center',
      zIndex: '999',
      pointerEvents: 'none',
      lineHeight: '1.6',
    });
    hint.innerHTML = 'Left: Move | Right: Look<br>Top: Swipe to Attack | Center: Jump';
    document.body.appendChild(hint);

    setTimeout(() => {
      hint.style.transition = 'opacity 1s';
      hint.style.opacity = '0';
      setTimeout(() => hint.remove(), 1000);
    }, 6000);

    // Fade the zone outline after 10s
    setTimeout(() => {
      this.gestureZone.style.transition = 'opacity 2s';
      this.gestureZone.style.opacity = '0.3';
    }, 10000);
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

  showGestureIndicator(x, y) {
    this.gestureDot.style.display = 'block';
    this.gestureDot.style.left = x + 'px';
    this.gestureDot.style.top = y + 'px';
  }

  updateGestureIndicator(x, y) {
    this.gestureDot.style.left = x + 'px';
    this.gestureDot.style.top = y + 'px';
  }

  hideGestureIndicator() {
    this.gestureDot.style.display = 'none';
  }

  showGestureLabel(text) {
    this.gestureLabel.textContent = text;
    this.gestureLabel.style.opacity = '1';
    setTimeout(() => {
      this.gestureLabel.style.opacity = '0';
    }, 600);
  }

  flashJumpButton() {
    this.jumpBtn.style.background = 'rgba(255,255,255,0.3)';
    setTimeout(() => {
      this.jumpBtn.style.background = 'rgba(255,255,255,0.08)';
    }, 150);
  }

  // ─── TERRAIN FOLLOWING ────────────────────────────────────────────

  setScene(scene) {
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 50;
    this.groundHeight = 0;
    this.playerHeight = 1.7;
    this.heightSmoothing = 10;

    // Cached terrain meshes (refreshed periodically)
    this.terrainMeshes = [];
    this.terrainCacheTimer = 0;
  }

  refreshTerrainCache() {
    this.terrainMeshes = [];
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.name === 'terrain') {
        this.terrainMeshes.push(obj);
      }
    });
  }

  getGroundHeight() {
    if (!this.scene || !this.raycaster) return this.groundHeight;

    // Refresh terrain cache every ~1 second (cells load/unload)
    this.terrainCacheTimer -= 1;
    if (this.terrainCacheTimer <= 0 || this.terrainMeshes.length === 0) {
      this.refreshTerrainCache();
      this.terrainCacheTimer = 60; // ~60 frames
    }

    const origin = this.camera.position.clone();
    origin.y += 20;

    this.raycaster.set(origin, new THREE.Vector3(0, -1, 0));

    const hits = this.raycaster.intersectObjects(this.terrainMeshes, false);
    if (hits.length > 0) {
      return hits[0].point.y;
    }

    return this.groundHeight;
  }

  // ─── UPDATE ─────────────────────────────────────────────────────

  update(delta) {
    // Deceleration
    this.velocity.x -= this.velocity.x * 10 * delta;
    this.velocity.z -= this.velocity.z * 10 * delta;

    // Direction from keyboard
    this.direction.z = Number(this.keys.forward) - Number(this.keys.backward);
    this.direction.x = Number(this.keys.right) - Number(this.keys.left);

    // Add mobile joystick input
    if (this.isMobile) {
      this.direction.x += this.moveInput.x;
      this.direction.z += -this.moveInput.y;
    }

    this.direction.normalize();

    if (Math.abs(this.direction.z) > 0.01) {
      this.velocity.z -= this.direction.z * this.speed * delta;
    }
    if (Math.abs(this.direction.x) > 0.01) {
      this.velocity.x += this.direction.x * this.speed * delta;
    }

    // Move camera in its local space
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    this.camera.position.addScaledVector(forward, -this.velocity.z);
    this.camera.position.addScaledVector(right, this.velocity.x);

    // Terrain following + jump physics
    const targetGroundY = this.getGroundHeight();
    this.groundHeight += (targetGroundY - this.groundHeight) * Math.min(1, this.heightSmoothing * delta);

    // Apply jump
    if (!this.isGrounded) {
      this.jumpVelocity += this.gravity * delta;
      this.camera.position.y += this.jumpVelocity * delta;

      // Check if landed
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
