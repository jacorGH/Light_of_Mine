import * as THREE from 'three';
import { PlayerController } from './PlayerController.js';

/**
 * Core engine — manages renderer, camera, scene, and game loop.
 */
export class Engine {
  constructor(canvas) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );
    this.camera.position.set(0, 5, 10);

    // Player controller (first-person)
    this.player = new PlayerController(this.camera, this.renderer.domElement);

    // Clock for delta time
    this.clock = new THREE.Clock();

    // Handle resize
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.update());
  }

  update() {
    const delta = this.clock.getDelta();
    this.player.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Clear the current scene (when loading a new area).
   */
  clearScene() {
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
  }
}
