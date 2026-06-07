import * as THREE from 'three';

/**
 * First-person player controller.
 * 
 * PC: WASD/Arrow movement + mouse look (pointer lock on click)
 * Mobile: Left virtual joystick (move) + Right side touch-drag (look)
 * 
 * Works on both platforms simultaneously.
 */
export class PlayerController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Movement state
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.speed = 8;
    this.keys = { forward: false, backward: false, left: false, right: false };

    // Mouse look
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.isLocked = false;

    // Detect mobile
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

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
    // Dual-touch: left half = movement joystick, right half = camera look
    this.moveTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    this.lookTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    this.moveInput = { x: 0, y: 0 }; // -1 to 1 joystick values

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

  // ─── MOBILE: Touch (dual-stick) ─────────────────────────────────

  onTouchStart(event) {
    event.preventDefault();
    const halfW = window.innerWidth / 2;

    for (const touch of event.changedTouches) {
      if (touch.clientX < halfW && this.moveTouch.id === null) {
        // Left side → movement joystick
        this.moveTouch.id = touch.identifier;
        this.moveTouch.startX = touch.clientX;
        this.moveTouch.startY = touch.clientY;
        this.moveTouch.currentX = touch.clientX;
        this.moveTouch.currentY = touch.clientY;
        this.updateJoystickVisual(touch.clientX, touch.clientY);
      } else if (touch.clientX >= halfW && this.lookTouch.id === null) {
        // Right side → camera look
        this.lookTouch.id = touch.identifier;
        this.lookTouch.startX = touch.clientX;
        this.lookTouch.startY = touch.clientY;
        this.lookTouch.currentX = touch.clientX;
        this.lookTouch.currentY = touch.clientY;
      }
    }
  }

  onTouchMove(event) {
    event.preventDefault();

    for (const touch of event.changedTouches) {
      if (touch.identifier === this.moveTouch.id) {
        // Movement joystick
        this.moveTouch.currentX = touch.clientX;
        this.moveTouch.currentY = touch.clientY;

        const dx = this.moveTouch.currentX - this.moveTouch.startX;
        const dy = this.moveTouch.currentY - this.moveTouch.startY;
        const maxRadius = 50; // pixels

        // Normalize to -1..1
        this.moveInput.x = Math.max(-1, Math.min(1, dx / maxRadius));
        this.moveInput.y = Math.max(-1, Math.min(1, dy / maxRadius));

        this.updateJoystickKnob(this.moveInput.x * maxRadius, this.moveInput.y * maxRadius);

      } else if (touch.identifier === this.lookTouch.id) {
        // Camera look
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
      }
    }
  }

  // ─── MOBILE UI ──────────────────────────────────────────────────

  createMobileUI() {
    // Joystick base (left side)
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

    // Joystick knob
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

    // Instructions overlay (tap to dismiss)
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(255,255,255,0.6)',
      fontFamily: 'monospace',
      fontSize: '14px',
      textAlign: 'center',
      zIndex: '999',
      pointerEvents: 'none',
    });
    hint.textContent = 'Left: Move | Right: Look';
    document.body.appendChild(hint);

    // Fade hint after 4 seconds
    setTimeout(() => {
      hint.style.transition = 'opacity 1s';
      hint.style.opacity = '0';
      setTimeout(() => hint.remove(), 1000);
    }, 4000);
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
      this.direction.z += -this.moveInput.y; // Up on joystick = forward = -z
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

    // Keep camera at a fixed height (basic — terrain following coming soon)
    this.camera.position.y = 2;
  }
}
