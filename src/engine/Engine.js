import * as THREE from 'three';
import { events } from './EventBus.js';
import { PlayerController } from './PlayerController.js';
import { WorldGrid } from './WorldGrid.js';
import { GrassCutter } from './GrassCutter.js';
import { WeaponSystem } from './WeaponSystem.js';
import { Inventory } from './Inventory.js';
import { RadialMenu } from '../ui/RadialMenu.js';
import { PlayerStats } from '../systems/PlayerStats.js';
import { EnemySystem } from '../systems/EnemySystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';

/**
 * Core engine — manages renderer, camera, scene, game loop, and system orchestration.
 * 
 * Systems communicate ONLY through the EventBus. Engine wires up the initial
 * subscriptions but systems can also subscribe to events directly.
 * 
 * Key events:
 *   player:attack { type, direction, power }
 *   player:weapon_cycle { direction: 1|-1 }
 *   player:jump
 *   combat:slash  (melee hit in front of player)
 *   item:collected { id, name, type, quantity }
 *   world:cells_changed
 *   game:paused
 *   game:resumed
 */
export class Engine {
  constructor(canvas) {
    this.paused = false;

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

    // Clock
    this.clock = new THREE.Clock();

    // ─── SYSTEMS ──────────────────────────────────────────────────
    this.player = new PlayerController(this.camera, this.renderer.domElement);
    this.worldGrid = new WorldGrid(this, { cellSize: 64, viewRadius: 2 });
    this.grassCutter = new GrassCutter(this);
    this.weaponSystem = new WeaponSystem(this);
    this.inventory = new Inventory(this);
    this.playerStats = new PlayerStats(this);
    this.enemySystem = new EnemySystem(this);
    this.interactionSystem = new InteractionSystem(this);
    this.dialogueSystem = new DialogueSystem(this);
    this.questSystem = new QuestSystem(this);
    this.saveSystem = new SaveSystem(this);
    this.radialMenu = new RadialMenu(this);

    // ─── EVENT WIRING ─────────────────────────────────────────────
    this.setupEvents();

    // Handle resize
    window.addEventListener('resize', () => this.onResize());
  }

  /**
   * Wire up event subscriptions between systems.
   * This is the ONLY place systems connect to each other.
   */
  setupEvents() {
    // Player attack → weapon animation + grass cutting + stats drain
    events.on('player:attack', (data) => {
      if (this.paused) return;

      // Enrich attack data with current weapon info for stats system
      const weapon = this.weaponSystem.currentWeapon;
      data.weaponType = weapon.type;
      data.spell = (weapon.type === 'projectile') ? weapon.id : null;

      // Check if player has enough stamina/magicka
      if (!this.playerStats.canAttack(data)) {
        return; // Can't attack — not enough resources
      }

      this.weaponSystem.attack(data);

      if (weapon.type === 'melee') {
        events.emit('combat:slash', data);
      }
    });

    // Combat slash → grass cutter responds
    events.on('combat:slash', () => {
      if (this.paused) return;
      this.grassCutter.slash();
    });

    // Weapon cycling
    events.on('player:weapon_cycle', (data) => {
      if (this.paused) return;
      if (data.direction > 0) this.weaponSystem.nextWeapon();
      else this.weaponSystem.prevWeapon();
    });

    // Item collected → inventory
    events.on('item:collected', (data) => {
      this.inventory.addItem(data);
    });

    // World cells changed → invalidate caches
    events.on('world:cells_changed', () => {
      this.grassCutter.invalidateGrassCache();
    });

    // Game pause/resume
    events.on('game:paused', () => { this.paused = true; });
    events.on('game:resumed', () => { this.paused = false; });

    // XP from enemy kills → player stats
    events.on('player:xp', (data) => {
      this.playerStats.addXP(data.amount);
    });

    // Radial menu: equip weapon from menu selection
    events.on('player:equip_weapon', (data) => {
      const idx = this.weaponSystem.weapons.findIndex(w => w.id === data.id);
      if (idx !== -1) {
        this.weaponSystem.currentWeaponIndex = idx;
        this.weaponSystem.showCurrentWeapon();
      }
    });

    // Radial menu: settings (handedness)
    events.on('menu:item_selected', (data) => {
      if (data.id === 'hand_right') {
        this.weaponSystem.dominantHand = 'right';
        this.weaponSystem.showCurrentWeapon();
      } else if (data.id === 'hand_left') {
        this.weaponSystem.dominantHand = 'left';
        this.weaponSystem.showCurrentWeapon();
      }
    });

    // ─── PLAYER CONTROLLER CALLBACKS → EVENTS ─────────────────────
    // Bridge the PlayerController callbacks into the event bus
    this.player.onCombatGesture = (gesture) => {
      if (gesture.type === 'block') return;
      events.emit('player:attack', gesture);
    };

    this.player.onWeaponCycle = (direction) => {
      events.emit('player:weapon_cycle', { direction });
    };
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Initialize — load world, set up systems.
   */
  async init() {
    this.player.setScene(this.scene);
    await this.worldGrid.init();
    this.grassCutter.invalidateGrassCache();
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.update());
  }

  update() {
    const delta = this.clock.getDelta();

    // When paused, still render (menu visible) but don't update game systems
    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.player.update(delta);

    const cellsChanged = this.worldGrid.update();
    if (cellsChanged) {
      events.emit('world:cells_changed');
    }

    this.grassCutter.update(delta);
    this.weaponSystem.update(delta);
    this.playerStats.update(delta);
    this.enemySystem.update(delta);
    this.interactionSystem.update();
    this.renderer.render(this.scene, this.camera);
  }
}
