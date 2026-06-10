/**
 * PlayerStats — Manages player health, stamina, and magicka for a first-person RPG.
 *
 * Handles regen, level/XP progression, combat drain, and HUD bar rendering.
 * Communicates entirely through the EventBus (pub/sub).
 *
 * Events consumed:
 *   'player:damaged'    → { amount }
 *   'player:healed'     → { amount }
 *   'player:attack'     → { weaponType, spell }
 *   'player:sprint_tick'→ { delta }
 *
 * Events emitted:
 *   'player:stats_changed' → { health, maxHealth, stamina, maxStamina, magicka, maxMagicka }
 *   'player:died'
 *   'player:stamina_empty'
 *   'player:magicka_empty'
 *   'player:leveled_up'    → { level }
 */

import { events } from '../engine/EventBus.js';

// ---------- Constants ----------

/** Regen rates (per second) */
const REGEN_STAMINA = 8;
const REGEN_MAGICKA = 3;
const REGEN_HEALTH = 0.5;

/** Health regen is paused for this many seconds after taking damage */
const COMBAT_COOLDOWN = 5;

/** Stamina cost per weapon type */
const STAMINA_COST = {
  melee: 8,
  projectile: 5,
};

/** Magicka cost for spell-type weapons */
const MAGICKA_COST = {
  fireball: 15,
  icicle: 12,
};

/** Stamina drain while sprinting (per second) */
const SPRINT_DRAIN = 12;

/** XP required to level up: level * XP_PER_LEVEL */
const XP_PER_LEVEL = 100;

/** Stat increases on level-up */
const LEVEL_BONUS_HEALTH = 5;
const LEVEL_BONUS_STAMINA = 5;
const LEVEL_BONUS_MAGICKA = 3;

// ---------- Class ----------

export class PlayerStats {
  /**
   * @param {object} engine - Engine reference (reserved for future use)
   */
  constructor(engine) {
    this.engine = engine;

    // --- Core stats ---
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.magicka = 50;
    this.maxMagicka = 50;

    // --- Level / XP ---
    this.level = 1;
    this.xp = 0;

    // --- Combat state ---
    this.lastCombatTime = -Infinity;

    // --- Death flag ---
    this.isDead = false;

    // --- Build HUD ---
    this._createHUD();

    // --- Subscribe to events ---
    events.on('player:damaged', (data) => this.damage(data.amount), this);
    events.on('player:healed', (data) => this.heal(data.amount), this);
    events.on('player:attack', (data) => this._handleAttack(data), this);
    events.on('player:sprint_tick', (data) => this._handleSprint(data), this);
  }

  // =====================================================================
  //  PUBLIC METHODS
  // =====================================================================

  /**
   * Apply damage to the player.
   * @param {number} amount - Raw damage value (positive)
   */
  damage(amount) {
    if (this.isDead) return;

    this.health = Math.max(0, this.health - amount);
    this.lastCombatTime = performance.now() / 1000;

    this._emitChanged();

    if (this.health <= 0) {
      this.isDead = true;
      events.emit('player:died');
    }
  }

  /**
   * Heal the player.
   * @param {number} amount - Heal value (positive)
   */
  heal(amount) {
    if (this.isDead) return;

    this.health = Math.min(this.maxHealth, this.health + amount);
    this._emitChanged();
  }

  /**
   * Drain stamina by a flat amount.
   * @param {number} amount
   */
  drainStamina(amount) {
    this.stamina = Math.max(0, this.stamina - amount);
    this._emitChanged();

    if (this.stamina <= 0) {
      events.emit('player:stamina_empty');
    }
  }

  /**
   * Drain magicka by a flat amount.
   * @param {number} amount
   */
  drainMagicka(amount) {
    this.magicka = Math.max(0, this.magicka - amount);
    this._emitChanged();

    if (this.magicka <= 0) {
      events.emit('player:magicka_empty');
    }
  }

  /**
   * Fully restore all stats to max.
   */
  restore() {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.magicka = this.maxMagicka;
    this.isDead = false;
    this._emitChanged();
  }

  /**
   * Returns true if the player has enough stamina (and magicka if spell)
   * to perform an attack with the given weapon data.
   * @param {object} [weaponData] - { weaponType, spell }
   * @returns {boolean}
   */
  canAttack(weaponData = {}) {
    const { weaponType = 'melee', spell } = weaponData;
    const staminaNeeded = STAMINA_COST[weaponType] || STAMINA_COST.melee;

    if (this.stamina < staminaNeeded) return false;

    // Spell weapons also require magicka
    if (spell && MAGICKA_COST[spell]) {
      if (this.magicka < MAGICKA_COST[spell]) return false;
    }

    return true;
  }

  /**
   * Award XP to the player. Triggers level-up when threshold exceeded.
   * @param {number} amount
   */
  addXP(amount) {
    this.xp += amount;

    const threshold = this.level * XP_PER_LEVEL;
    if (this.xp >= threshold) {
      this.xp -= threshold;
      this.level += 1;

      // Increase max stats on level-up
      this.maxHealth += LEVEL_BONUS_HEALTH;
      this.maxStamina += LEVEL_BONUS_STAMINA;
      this.maxMagicka += LEVEL_BONUS_MAGICKA;

      // Also fill current stats to new max
      this.health = this.maxHealth;
      this.stamina = this.maxStamina;
      this.magicka = this.maxMagicka;

      events.emit('player:leveled_up', { level: this.level });
      this._emitChanged();
    }
  }

  /**
   * Per-frame update. Handles regen ticks.
   * @param {number} delta - Time elapsed since last frame (seconds)
   */
  update(delta) {
    if (this.isDead) return;

    const now = performance.now() / 1000;

    // --- Stamina regen ---
    if (this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + REGEN_STAMINA * delta);
    }

    // --- Magicka regen ---
    if (this.magicka < this.maxMagicka) {
      this.magicka = Math.min(this.maxMagicka, this.magicka + REGEN_MAGICKA * delta);
    }

    // --- Health regen (only out of combat) ---
    if (this.health < this.maxHealth && (now - this.lastCombatTime) >= COMBAT_COOLDOWN) {
      this.health = Math.min(this.maxHealth, this.health + REGEN_HEALTH * delta);
    }

    // --- Update HUD ---
    this._updateHUD();
  }

  /**
   * Serialize player stats for save/load.
   * @returns {object}
   */
  serialize() {
    return {
      health: this.health,
      maxHealth: this.maxHealth,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      magicka: this.magicka,
      maxMagicka: this.maxMagicka,
      level: this.level,
      xp: this.xp,
    };
  }

  /**
   * Restore player stats from saved data.
   * @param {object} data
   */
  deserialize(data) {
    if (!data) return;

    this.health = data.health ?? this.health;
    this.maxHealth = data.maxHealth ?? this.maxHealth;
    this.stamina = data.stamina ?? this.stamina;
    this.maxStamina = data.maxStamina ?? this.maxStamina;
    this.magicka = data.magicka ?? this.magicka;
    this.maxMagicka = data.maxMagicka ?? this.maxMagicka;
    this.level = data.level ?? this.level;
    this.xp = data.xp ?? this.xp;

    this.isDead = this.health <= 0;
    this._emitChanged();
    this._updateHUD();
  }

  // =====================================================================
  //  PRIVATE — Event Handlers
  // =====================================================================

  /**
   * Handle 'player:attack' — drain stamina and optionally magicka for spells.
   * @param {object} data - { weaponType, spell }
   */
  _handleAttack(data) {
    if (this.isDead) return;

    const { weaponType = 'melee', spell } = data;

    // Stamina drain based on weapon type
    const staminaCost = STAMINA_COST[weaponType] || STAMINA_COST.melee;
    this.drainStamina(staminaCost);

    // Magicka drain for spell-type weapons
    if (spell && MAGICKA_COST[spell]) {
      this.drainMagicka(MAGICKA_COST[spell]);
    }
  }

  /**
   * Handle 'player:sprint_tick' — drain stamina proportional to delta.
   * @param {object} data - { delta }
   */
  _handleSprint(data) {
    if (this.isDead) return;

    const delta = data.delta || 0;
    this.drainStamina(SPRINT_DRAIN * delta);
  }

  // =====================================================================
  //  PRIVATE — Event Emission
  // =====================================================================

  /**
   * Emit the canonical stats-changed event (used by HUD, AI, etc.).
   */
  _emitChanged() {
    events.emit('player:stats_changed', {
      health: this.health,
      maxHealth: this.maxHealth,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      magicka: this.magicka,
      maxMagicka: this.maxMagicka,
    });

    this._updateHUD();
  }

  // =====================================================================
  //  PRIVATE — HUD Rendering
  // =====================================================================

  /**
   * Create the DOM elements for the stat bars overlay.
   */
  _createHUD() {
    // Container
    this._container = document.createElement('div');
    Object.assign(this._container.style, {
      position: 'fixed',
      top: '40px',
      left: '10px',
      width: '180px',
      padding: '6px 8px',
      background: 'rgba(0, 0, 0, 0.45)',
      borderRadius: '4px',
      zIndex: '1000',
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    });

    // Health bar
    this._healthBar = this._createBar('#cc3333', 'HP');
    // Stamina bar
    this._staminaBar = this._createBar('#33aa33', 'SP');
    // Magicka bar
    this._magickaBar = this._createBar('#3366cc', 'MP');

    this._container.appendChild(this._healthBar.wrapper);
    this._container.appendChild(this._staminaBar.wrapper);
    this._container.appendChild(this._magickaBar.wrapper);

    document.body.appendChild(this._container);
    this._updateHUD();
  }

  /**
   * Create a single stat bar element group.
   * @param {string} color - Hex color for the fill
   * @param {string} label - Short label (HP, SP, MP)
   * @returns {{ wrapper, fill, text }}
   */
  _createBar(color, label) {
    // Wrapper row
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    });

    // Track (background)
    const track = document.createElement('div');
    Object.assign(track.style, {
      flex: '1',
      height: '6px',
      background: '#333',
      borderRadius: '3px',
      overflow: 'hidden',
      position: 'relative',
    });

    // Fill (colored portion)
    const fill = document.createElement('div');
    Object.assign(fill.style, {
      height: '100%',
      width: '100%',
      background: color,
      borderRadius: '3px',
      transition: 'width 0.25s ease',
    });

    track.appendChild(fill);

    // Text label (current/max), shown only when not full
    const text = document.createElement('span');
    Object.assign(text.style, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ddd',
      minWidth: '0',
      whiteSpace: 'nowrap',
      opacity: '0',
      transition: 'opacity 0.2s ease',
    });

    wrapper.appendChild(track);
    wrapper.appendChild(text);

    return { wrapper, fill, text, label };
  }

  /**
   * Refresh HUD bar widths and labels based on current stat values.
   */
  _updateHUD() {
    this._updateBar(this._healthBar, this.health, this.maxHealth);
    this._updateBar(this._staminaBar, this.stamina, this.maxStamina);
    this._updateBar(this._magickaBar, this.magicka, this.maxMagicka);
  }

  /**
   * Update a single bar element.
   * @param {{ fill, text, label }} bar
   * @param {number} current
   * @param {number} max
   */
  _updateBar(bar, current, max) {
    const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    bar.fill.style.width = `${(pct * 100).toFixed(1)}%`;

    // Show text only when not at full
    const isFull = current >= max;
    bar.text.style.opacity = isFull ? '0' : '1';
    bar.text.textContent = isFull ? '' : `${Math.ceil(current)}/${Math.round(max)}`;
  }
}
