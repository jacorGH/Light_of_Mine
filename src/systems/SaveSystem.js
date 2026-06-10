import { events } from '../engine/EventBus.js';

/**
 * SaveSystem — Handles saving and loading full game state to/from localStorage.
 *
 * Persists player position, stats, inventory, quests, weapon state, world flags,
 * and fired trigger state. Supports quick-save (F5), quick-load (F9), and
 * auto-save when the player moves to a new world cell.
 *
 * Events consumed:
 *   'world:cells_changed'   → auto-save
 *   'world:flag_set'        → track world flags { flag, value }
 *   'menu:item_selected'    → save/load from menu
 *
 * Events emitted:
 *   'game:saved'
 *   'game:loaded'
 */

const SAVE_KEY = 'light_of_mine_save';

export class SaveSystem {
  /**
   * @param {object} engine - Engine reference (camera, systems, scene, etc.)
   */
  constructor(engine) {
    this.engine = engine;

    // World flags set by dialogue/quest events
    this.flags = new Map();

    // ─── Event Subscriptions ────────────────────────────────────────

    // Auto-save when player moves to a new cell
    events.on('world:cells_changed', () => this.save(), this);

    // Track world flags set by dialogue or scripts
    events.on('world:flag_set', (data) => {
      if (data && data.flag !== undefined) {
        this.flags.set(data.flag, data.value);
      }
    }, this);

    // Menu-driven save/load
    events.on('menu:item_selected', (data) => {
      if (data.id === 'save') this.save();
      else if (data.id === 'load') this.load();
    }, this);

    // ─── Keyboard Input ─────────────────────────────────────────────

    this._setupInput();
  }

  // =====================================================================
  //  PUBLIC METHODS
  // =====================================================================

  /**
   * Collect all game state, serialize to JSON, and store in localStorage.
   * Emits 'game:saved' on success.
   */
  save() {
    const { engine } = this;
    const camera = engine.camera;

    // --- Player position & rotation ---
    const position = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    };

    // Convert camera quaternion to euler angles for serialization
    const euler = new engine.camera.rotation.constructor(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    const rotation = {
      x: euler.x,
      y: euler.y,
      z: euler.z,
    };

    // --- Player stats ---
    const stats = engine.playerStats.serialize();

    // --- Inventory ---
    const inventory = this._serializeInventory();

    // --- Quests ---
    const quests = engine.questSystem.serialize();

    // --- Weapon state ---
    const weapon = {
      currentIndex: engine.weaponSystem.currentWeaponIndex,
      dominantHand: engine.weaponSystem.dominantHand,
    };

    // --- World state ---
    const firedTriggers = this._collectFiredTriggers();
    const currentInterior = engine.currentInterior || null;

    // --- Flags ---
    const flags = {};
    for (const [key, value] of this.flags) {
      flags[key] = value;
    }

    // --- Build save object ---
    const saveData = {
      version: 1,
      timestamp: Date.now(),
      player: {
        position,
        rotation,
        stats,
      },
      inventory,
      quests,
      world: {
        firedTriggers,
        currentInterior,
      },
      weapon,
      flags,
    };

    // --- Write to localStorage ---
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
      events.emit('game:saved');
      this._showNotification('Game Saved', '#44cc66');
    } catch (err) {
      console.error('[SaveSystem] Failed to save:', err);
      this._showNotification('Save Failed!', '#cc4444');
    }
  }

  /**
   * Read save data from localStorage, restore all systems.
   * Emits 'game:loaded' on success.
   */
  load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      this._showNotification('No Save Found', '#cc8844');
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error('[SaveSystem] Failed to parse save data:', err);
      this._showNotification('Load Failed!', '#cc4444');
      return;
    }

    const { engine } = this;

    // --- Restore player position ---
    if (data.player && data.player.position) {
      const { x, y, z } = data.player.position;
      engine.camera.position.set(x, y, z);
    }

    // --- Restore player rotation ---
    if (data.player && data.player.rotation) {
      const { x, y, z } = data.player.rotation;
      engine.camera.rotation.set(x, y, z, 'YXZ');
    }

    // --- Restore player stats ---
    if (data.player && data.player.stats) {
      engine.playerStats.deserialize(data.player.stats);
    }

    // --- Restore inventory ---
    if (data.inventory) {
      this._deserializeInventory(data.inventory);
    }

    // --- Restore quests ---
    if (data.quests) {
      engine.questSystem.deserialize(data.quests);
    }

    // --- Restore weapon state ---
    if (data.weapon) {
      engine.weaponSystem.currentWeaponIndex = data.weapon.currentIndex ?? 0;
      engine.weaponSystem.dominantHand = data.weapon.dominantHand ?? 'right';
      engine.weaponSystem.showCurrentWeapon();
    }

    // --- Restore world flags ---
    this.flags.clear();
    if (data.flags) {
      for (const [key, value] of Object.entries(data.flags)) {
        this.flags.set(key, value);
      }
    }

    // --- Restore fired triggers ---
    if (data.world && data.world.firedTriggers) {
      this._restoreFiredTriggers(data.world.firedTriggers);
    }

    // --- Re-enter interior if player was inside one ---
    if (data.world && data.world.currentInterior) {
      events.emit('world:enter_interior', { interiorId: data.world.currentInterior });
    }

    events.emit('game:loaded');
    this._showNotification('Game Loaded', '#4488cc');
  }

  /**
   * Check if a save exists in localStorage.
   * @returns {boolean}
   */
  hasSave() {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  /**
   * Delete the save from localStorage.
   */
  deleteSave() {
    localStorage.removeItem(SAVE_KEY);
  }

  /**
   * Get basic info from the save without performing a full load.
   * @returns {{ timestamp: number, level: number } | null}
   */
  getLastSaveInfo() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      return {
        timestamp: data.timestamp,
        level: data.player?.stats?.level ?? 1,
      };
    } catch {
      return null;
    }
  }

  // =====================================================================
  //  FLAG METHODS
  // =====================================================================

  /**
   * Get the value of a world flag.
   * @param {string} flag - Flag name
   * @returns {*} The flag value, or undefined if not set
   */
  getFlag(flag) {
    return this.flags.get(flag);
  }

  /**
   * Check whether a world flag is set.
   * @param {string} flag - Flag name
   * @returns {boolean}
   */
  hasFlag(flag) {
    return this.flags.has(flag);
  }

  // =====================================================================
  //  PRIVATE — Serialization Helpers
  // =====================================================================

  /**
   * Serialize inventory. Uses engine.inventory.serialize() if available,
   * otherwise iterates the items Map manually.
   * @returns {object}
   */
  _serializeInventory() {
    const inventory = this.engine.inventory;

    // Use built-in serialize if the Inventory class provides one
    if (typeof inventory.serialize === 'function') {
      return inventory.serialize();
    }

    // Fallback: manually serialize the items Map
    const items = {};
    for (const [id, item] of inventory.items) {
      items[id] = {
        id: item.id,
        name: item.name,
        type: item.type,
        icon: item.icon,
        quantity: item.quantity,
        stats: item.stats || null,
      };
    }

    return {
      items,
      equipment: { ...inventory.equipment },
    };
  }

  /**
   * Restore inventory from saved data.
   * Clears existing items and re-adds each saved item.
   * @param {object} data - Serialized inventory data
   */
  _deserializeInventory(data) {
    const inventory = this.engine.inventory;

    // Clear current inventory
    inventory.items.clear();

    // Re-add all saved items
    const items = data.items || {};
    for (const [id, item] of Object.entries(items)) {
      inventory.items.set(id, {
        id: item.id,
        name: item.name,
        type: item.type,
        icon: item.icon || '■',
        quantity: item.quantity || 1,
        stats: item.stats || null,
      });
    }

    // Restore equipment slots
    if (data.equipment) {
      inventory.equipment = { ...data.equipment };
    }

    // Refresh the HUD
    if (typeof inventory.updateHUD === 'function') {
      inventory.updateHUD();
    }
  }

  /**
   * Collect IDs of all triggers that have been fired in the current scene.
   * Traverses scene children looking for userData.fired === true.
   * @returns {string[]}
   */
  _collectFiredTriggers() {
    const fired = [];
    this.engine.scene.traverse((obj) => {
      if (obj.userData && obj.userData.fired && obj.userData.triggerId) {
        fired.push(obj.userData.triggerId);
      }
    });
    return fired;
  }

  /**
   * Mark trigger objects in the scene as fired based on saved IDs.
   * @param {string[]} triggerIds - Array of trigger IDs to mark as fired
   */
  _restoreFiredTriggers(triggerIds) {
    if (!triggerIds || triggerIds.length === 0) return;

    const idSet = new Set(triggerIds);
    this.engine.scene.traverse((obj) => {
      if (obj.userData && obj.userData.triggerId && idSet.has(obj.userData.triggerId)) {
        obj.userData.fired = true;
      }
    });
  }

  // =====================================================================
  //  PRIVATE — Input
  // =====================================================================

  /**
   * Set up keyboard shortcuts for quick save/load.
   * F5 = Quick Save, F9 = Quick Load
   */
  _setupInput() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'F5') {
        e.preventDefault();
        this.save();
      } else if (e.code === 'F9') {
        e.preventDefault();
        this.load();
      }
    });
  }

  // =====================================================================
  //  PRIVATE — Notification UI
  // =====================================================================

  /**
   * Show a floating notification in the center of the screen that fades out.
   * @param {string} message - Text to display
   * @param {string} color - CSS color for the text
   */
  _showNotification(message, color) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      top: '30%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: color,
      fontFamily: 'monospace',
      fontSize: '18px',
      fontWeight: 'bold',
      textShadow: '0 2px 6px rgba(0,0,0,0.8)',
      zIndex: '7000',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'opacity 1.5s ease, transform 1.5s ease',
    });
    el.textContent = message;
    document.body.appendChild(el);

    // Fade out after a brief delay
    requestAnimationFrame(() => {
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -60%)';
      }, 500);
    });

    // Remove from DOM after animation completes
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 2000);
  }
}
