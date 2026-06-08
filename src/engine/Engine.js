import * as THREE from 'three';
import { PlayerController } from './PlayerController.js';
import { WorldGrid } from './WorldGrid.js';
import { GrassCutter } from './GrassCutter.js';
import { WeaponSystem } from './WeaponSystem.js';

/**
 * Core engine — manages renderer, camera, scene, game loop, and world streaming.
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
    this.camera.position.set(32, 2, 32);

    // Player controller (first-person)
    this.player = new PlayerController(this.camera, this.renderer.domElement);

    // World grid (streaming open world)
    this.worldGrid = new WorldGrid(this, {
      cellSize: 64,
      viewRadius: 2,
    });

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

  /**
   * Initialize the world — loads the grid manifest and initial cells.
   */
  async init() {
    // Give player controller access to scene for terrain raycasting
    this.player.setScene(this.scene);

    // Grass cutting system
    this.grassCutter = new GrassCutter(this);

    // Weapon system
    this.weaponSystem = new WeaponSystem(this);

    // Wire combat input — mobile gesture only (PC goes through GrassCutter click)
    this.player.onCombatGesture = (gesture) => {
      if (gesture.type === 'block') return;

      // Trigger weapon attack animation + projectile
      this.weaponSystem.attack(gesture);

      // Melee weapons also cut grass
      const weapon = this.weaponSystem.currentWeapon;
      if (weapon.type === 'melee') {
        this.grassCutter.slash();
      }
    };

    // Wire weapon cycling from player controller
    this.player.onWeaponCycle = (direction) => {
      if (direction > 0) this.weaponSystem.nextWeapon();
      else this.weaponSystem.prevWeapon();
    };

    await this.worldGrid.init();

    // Invalidate grass cache after initial load
    this.grassCutter.invalidateGrassCache();
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.update());
  }

  update() {
    const delta = this.clock.getDelta();
    this.player.update(delta);

    // Check if cells changed (WorldGrid returns true if cells loaded/unloaded)
    const cellsChanged = this.worldGrid.update();
    if (cellsChanged) {
      this.grassCutter.invalidateGrassCache();
    }

    this.grassCutter.update(delta);
    this.weaponSystem.update(delta);
    this.renderer.render(this.scene, this.camera);
  }
}
