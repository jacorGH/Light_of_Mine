import * as THREE from 'three';
import { events } from './EventBus.js';
import { PlayerController } from './PlayerController.js';
import { WorldGrid } from './WorldGrid.js';
import { GrassCutter } from './GrassCutter.js';
import { WeaponSystem } from './WeaponSystem.js';
import { Inventory } from './Inventory.js';
import { RadialMenu } from '../ui/RadialMenu.js';
import { MapUI } from '../ui/MapUI.js';
import { PlayerStats } from '../systems/PlayerStats.js';
import { EnemySystem } from '../systems/EnemySystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { SkySystem } from '../systems/SkySystem.js';
import { WaterSystem } from '../systems/WaterSystem.js';

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
    this.skySystem = new SkySystem(this);
    this.waterSystem = new WaterSystem(this);
    this.radialMenu = new RadialMenu(this);
    this.mapUI = new MapUI(this);

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
    // ─── COMBAT SLASH → grass cutter ──────────────────────────────
    events.on('combat:slash', () => {
      if (this.paused) return;
      this.grassCutter.slash();
    });

    // ─── CYCLING ──────────────────────────────────────────────────
    events.on('player:weapon_cycle', (data) => {
      if (this.paused) return;
      this.weaponSystem.cycleHand('right', data.direction);
    });
    events.on('player:spell_cycle', (data) => {
      if (this.paused) return;
      this.weaponSystem.cycleHand('left', data.direction);
    });

    // ─── ITEM / WORLD EVENTS ──────────────────────────────────────
    events.on('item:collected', (data) => { this.inventory.addItem(data); });
    events.on('world:cells_changed', () => { this.grassCutter.invalidateGrassCache(); });
    events.on('player:xp', (data) => { this.playerStats.addXP(data.amount); });

    // ─── GAME STATE ───────────────────────────────────────────────
    events.on('game:paused', () => { this.paused = true; });
    events.on('game:resumed', () => { this.paused = false; });

    // ─── RADIAL MENU ──────────────────────────────────────────────
    events.on('player:equip_weapon', (data) => { this.weaponSystem.equipWeaponById(data.id); });
    events.on('player:equip_spell', (data) => { this.weaponSystem.equipSpellById(data.id); });
    events.on('menu:item_selected', (data) => {
      if (data.id === 'hand_right') { this.weaponSystem.dominantHand = 'right'; this.weaponSystem.showActiveViewmodel(); }
      else if (data.id === 'hand_left') { this.weaponSystem.dominantHand = 'left'; this.weaponSystem.showActiveViewmodel(); }
    });

    // ─── PLAYER CONTROLLER CALLBACKS → EVENTS ─────────────────────
    this.player.onCombatGesture = (gesture) => {
      if (gesture.type === 'block') return;

      const hand = gesture.hand || 'right';
      const wpn = this.weaponSystem;
      const handItem = wpn.getHandItem(hand);
      const isTwoHanded = wpn.leftHand === wpn.rightHand && wpn.leftHand.twoHanded;

      // Hold+release: strong attack or ranged aim depending on what's in hand
      if (gesture.type === 'ranged_release') {
        // Only zoom/ranged if the hand has a ranged item
        if (handItem && handItem.type === 'projectile') {
          this.doHandAttack(hand, gesture);
        } else {
          // Strong strike (melee hold = power attack)
          gesture.power = 1.0;
          this.doHandAttack(hand, gesture);
        }
        return;
      }

      if (isTwoHanded) {
        // Two-handed: any hand triggers the weapon
        this.doHandAttack('right', gesture);
      } else if (hand === 'both') {
        // Center swipe: both hands (future combo placeholder)
        this.doHandAttack('left', gesture);
        this.doHandAttack('right', gesture);
      } else {
        // Use the specific hand that was swiped on
        this.doHandAttack(hand, gesture);
      }
    };

    this.player.onWeaponCycle = (direction) => {
      events.emit('player:weapon_cycle', { direction });
    };

    this.player.onSpellCycle = (direction) => {
      events.emit('player:spell_cycle', { direction });
    };

    this.player.onMenuOpen = () => {
      this.radialMenu.open();
    };

    this.player.onSneakChanged = (isSneaking) => {
      events.emit('player:sneak_changed', { sneaking: isSneaking });
    };

    // Tell PlayerController how to check if a hand is ranged (for zoom logic)
    this.player._isHandRanged = (hand) => {
      return this.weaponSystem.isHandRanged(hand);
    };
  }

  /**
   * Execute an attack with whatever is in the specified hand.
   * Handles resource costs, animations, and combat events.
   */
  doHandAttack(hand, gesture) {
    const item = this.weaponSystem.getHandItem(hand);
    if (!item) return;

    // Heal: special self-heal, no projectile
    if (item.id === 'heal') {
      if (this.playerStats.magicka >= (item.magickaCost || 20)) {
        this.playerStats.drainMagicka(item.magickaCost || 20);
        this.playerStats.heal(30);
        this.weaponSystem.useHand(hand, gesture);
      }
      return;
    }

    // Resource costs
    if (item.magickaCost) {
      if (this.playerStats.magicka < item.magickaCost) return;
      this.playerStats.drainMagicka(item.magickaCost);
      this.playerStats.drainStamina(3); // small stamina for casting
    } else {
      const staCost = item.type === 'melee' ? 8 : 5;
      if (this.playerStats.stamina < staCost) return;
      this.playerStats.drainStamina(staCost);
    }

    // Fire the attack
    this.weaponSystem.useHand(hand, gesture);

    // Melee = slash event (damages enemies in arc, cuts grass)
    if (item.type === 'melee') {
      events.emit('combat:slash', gesture);
    }
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
    this.skySystem.update(delta);
    this.waterSystem.update(delta);
    this.mapUI.update();
    this.renderer.render(this.scene, this.camera);
  }
}
