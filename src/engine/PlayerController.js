import * as THREE from 'three';

/**
 * Simple first-person player controller.
 * WASD movement + mouse look (pointer lock).
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

    // Pointer lock
    domElement.addEventListener('click', () => {
      domElement.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === domElement;
    });

    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Touch controls for mobile
    this.touchState = { active: false, startX: 0, startY: 0, moveX: 0, moveY: 0 };
    domElement.addEventListener('touchstart', (e) => this.onTouchStart(e));
    domElement.addEventListener('touchmove', (e) => this.onTouchMove(e));
    domElement.addEventListener('touchend', (e) => this.onTouchEnd(e));
  }

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

  onTouchStart(event) {
    const touch = event.touches[0];
    this.touchState.active = true;
    this.touchState.startX = touch.clientX;
    this.touchState.startY = touch.clientY;
    this.keys.forward = true;
  }

  onTouchMove(event) {
    if (!this.touchState.active) return;
    const touch = event.touches[0];
    const dx = touch.clientX - this.touchState.startX;
    const dy = touch.clientY - this.touchState.startY;

    // Rotate camera based on touch drag
    const sensitivity = 0.003;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= dx * sensitivity;
    this.euler.x -= dy * sensitivity;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);

    this.touchState.startX = touch.clientX;
    this.touchState.startY = touch.clientY;
  }

  onTouchEnd() {
    this.touchState.active = false;
    this.keys.forward = false;
  }

  update(delta) {
    // Deceleration
    this.velocity.x -= this.velocity.x * 10 * delta;
    this.velocity.z -= this.velocity.z * 10 * delta;

    // Direction from keys
    this.direction.z = Number(this.keys.forward) - Number(this.keys.backward);
    this.direction.x = Number(this.keys.right) - Number(this.keys.left);
    this.direction.normalize();

    if (this.keys.forward || this.keys.backward) {
      this.velocity.z -= this.direction.z * this.speed * delta;
    }
    if (this.keys.left || this.keys.right) {
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

    // Keep camera at a fixed height (basic — no terrain following yet)
    this.camera.position.y = 2;
  }
}
