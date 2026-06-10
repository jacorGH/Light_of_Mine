import * as THREE from 'three';
import { events } from '../engine/EventBus.js';

/**
 * SkySystem — Manages a continuous day/night cycle with smooth transitions
 * for lighting, fog, sky color, and a minimal HUD time indicator.
 *
 * timeOfDay ranges 0.0–1.0:
 *   0.00 = midnight
 *   0.25 = dawn
 *   0.50 = noon
 *   0.75 = dusk
 *
 * Lighting presets are interpolated (lerped) to produce seamless transitions.
 */
export class SkySystem {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;

    // --- Time state ---
    this.timeOfDay = 0.25; // start at dawn
    this.dayDuration = 600; // real seconds per full cycle (10 minutes)
    this.paused = false;

    // Throttle for time-changed event (~10 game-seconds)
    this._lastEmitTime = -1;
    this._emitInterval = 10 / this.dayDuration; // fraction of day equal to 10s

    // Throttle for HUD updates (every ~2 real seconds)
    this._hudTimer = 0;
    this._hudInterval = 2;

    // --- Lighting presets ---
    this.presets = [
      {
        time: 0.0,
        sunColor: '#000000',
        sunIntensity: 0.0,
        ambientColor: '#0a0a2a',
        ambientIntensity: 0.05,
        skyColor: '#0a0a1a',
        fogColor: '#050510',
        fogNear: 10,
        fogFar: 60,
        sunAngle: -30 // below horizon
      },
      {
        time: 0.22,
        sunColor: '#ffaa44',
        sunIntensity: 0.4,
        ambientColor: '#553322',
        ambientIntensity: 0.2,
        skyColor: '#ff8866',
        fogColor: '#cc7755',
        fogNear: 20,
        fogFar: 100,
        sunAngle: 5 // just above horizon east
      },
      {
        time: 0.3,
        sunColor: '#ffe8b0',
        sunIntensity: 0.8,
        ambientColor: '#8899aa',
        ambientIntensity: 0.35,
        skyColor: '#87ceeb',
        fogColor: '#aaccdd',
        fogNear: 40,
        fogFar: 180,
        sunAngle: 30
      },
      {
        time: 0.5,
        sunColor: '#ffffff',
        sunIntensity: 1.0,
        ambientColor: '#99aacc',
        ambientIntensity: 0.4,
        skyColor: '#7bafd4',
        fogColor: '#aabbcc',
        fogNear: 60,
        fogFar: 250,
        sunAngle: 90 // directly overhead
      },
      {
        time: 0.65,
        sunColor: '#ffeedd',
        sunIntensity: 0.9,
        ambientColor: '#8899bb',
        ambientIntensity: 0.35,
        skyColor: '#8ab4d0',
        fogColor: '#99aabb',
        fogNear: 50,
        fogFar: 220,
        sunAngle: 145
      },
      {
        time: 0.78,
        sunColor: '#ff6644',
        sunIntensity: 0.4,
        ambientColor: '#442222',
        ambientIntensity: 0.15,
        skyColor: '#ff6644',
        fogColor: '#cc5533',
        fogNear: 20,
        fogFar: 100,
        sunAngle: 170 // low on horizon west
      },
      {
        time: 0.85,
        sunColor: '#222244',
        sunIntensity: 0.08,
        ambientColor: '#1a1a3a',
        ambientIntensity: 0.1,
        skyColor: '#1a1a3a',
        fogColor: '#111122',
        fogNear: 15,
        fogFar: 80,
        sunAngle: 190 // below horizon
      },
      {
        time: 0.95,
        sunColor: '#334466',
        sunIntensity: 0.15,
        ambientColor: '#080818',
        ambientIntensity: 0.08,
        skyColor: '#080818',
        fogColor: '#060612',
        fogNear: 10,
        fogFar: 70,
        sunAngle: -20 // below horizon (moon-like)
      }
    ];

    // --- Cached THREE.Color objects for lerping ---
    this._colorA = new THREE.Color();
    this._colorB = new THREE.Color();
    this._colorResult = new THREE.Color();

    // --- Find or create scene lights ---
    this._sunLight = null;
    this._ambientLight = null;
    this._findOrCreateLights();

    // --- Fog setup ---
    if (!this.scene.fog) {
      this.scene.fog = new THREE.Fog(0x000000, 60, 250);
    }

    // --- HUD element ---
    this._hudEl = null;
    this._createHUD();

    // --- Event subscriptions ---
    events.on('game:paused', () => { this.paused = true; });
    events.on('game:resumed', () => { this.paused = false; });

    // Apply initial lighting state
    this._applyLighting();
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  /**
   * Returns the current hour (0–23) based on timeOfDay.
   */
  getHour() {
    return Math.floor(this.timeOfDay * 24) % 24;
  }

  /**
   * Returns a human-readable time label.
   */
  getTimeLabel() {
    const hour = this.getHour();
    if (hour >= 5 && hour < 7) return 'Dawn';
    if (hour >= 7 && hour < 10) return 'Morning';
    if (hour >= 10 && hour < 13) return 'Noon';
    if (hour >= 13 && hour < 17) return 'Afternoon';
    if (hour >= 17 && hour < 19) return 'Dusk';
    if (hour >= 19 && hour < 21) return 'Evening';
    if (hour >= 21 && hour < 24) return 'Night';
    return 'Late Night'; // 0–4
  }

  /**
   * Manually set the time of day and immediately apply lighting.
   * @param {number} t — value between 0.0 and 1.0
   */
  setTime(t) {
    this.timeOfDay = ((t % 1) + 1) % 1; // clamp to [0,1)
    this._applyLighting();
    this._updateHUD();
  }

  /**
   * Change the duration of a full day cycle.
   * @param {number} seconds — real seconds per full day
   */
  setDayDuration(seconds) {
    this.dayDuration = Math.max(1, seconds);
    this._emitInterval = 10 / this.dayDuration;
  }

  // ─────────────────────────────────────────────
  // Game loop
  // ─────────────────────────────────────────────

  /**
   * Called every frame by the engine.
   * @param {number} delta — seconds since last frame
   */
  update(delta) {
    if (this.paused) return;

    // Advance time
    const advance = delta / this.dayDuration;
    this.timeOfDay += advance;
    if (this.timeOfDay >= 1.0) {
      this.timeOfDay -= 1.0;
    }

    // Apply interpolated lighting
    this._applyLighting();

    // Emit time-changed event throttled (~10 game-seconds)
    if (
      this._lastEmitTime < 0 ||
      Math.abs(this.timeOfDay - this._lastEmitTime) >= this._emitInterval
    ) {
      this._lastEmitTime = this.timeOfDay;
      events.emit('world:time_changed', {
        timeOfDay: this.timeOfDay,
        hour: this.getHour(),
        label: this.getTimeLabel()
      });
    }

    // Update HUD every few real seconds
    this._hudTimer += delta;
    if (this._hudTimer >= this._hudInterval) {
      this._hudTimer = 0;
      this._updateHUD();
    }
  }

  // ─────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────

  /**
   * Serialize state for save files.
   */
  serialize() {
    return { timeOfDay: this.timeOfDay };
  }

  /**
   * Restore state from save data and immediately apply.
   */
  deserialize(data) {
    if (data && typeof data.timeOfDay === 'number') {
      this.timeOfDay = data.timeOfDay;
      this._applyLighting();
      this._updateHUD();
    }
  }

  // ─────────────────────────────────────────────
  // Internal: Lighting interpolation
  // ─────────────────────────────────────────────

  /**
   * Find the two nearest presets and lerp all values, then apply to scene.
   */
  _applyLighting() {
    const t = this.timeOfDay;
    const presets = this.presets;

    // Find surrounding presets (handles wrap-around)
    let lower = presets[presets.length - 1];
    let upper = presets[0];

    for (let i = 0; i < presets.length; i++) {
      if (presets[i].time <= t) {
        lower = presets[i];
        upper = presets[(i + 1) % presets.length];
      }
    }

    // Compute interpolation factor
    let range = upper.time - lower.time;
    if (range <= 0) range += 1.0; // wrap-around case
    let localT = t - lower.time;
    if (localT < 0) localT += 1.0;
    const alpha = range > 0 ? localT / range : 0;

    // Lerp colors
    const skyColor = this._lerpColor(lower.skyColor, upper.skyColor, alpha);
    const sunColor = this._lerpColor(lower.sunColor, upper.sunColor, alpha);
    const ambientColor = this._lerpColor(lower.ambientColor, upper.ambientColor, alpha);
    const fogColor = this._lerpColor(lower.fogColor, upper.fogColor, alpha);

    // Lerp scalars
    const sunIntensity = THREE.MathUtils.lerp(lower.sunIntensity, upper.sunIntensity, alpha);
    const ambientIntensity = THREE.MathUtils.lerp(lower.ambientIntensity, upper.ambientIntensity, alpha);
    const fogNear = THREE.MathUtils.lerp(lower.fogNear, upper.fogNear, alpha);
    const fogFar = THREE.MathUtils.lerp(lower.fogFar, upper.fogFar, alpha);
    const sunAngle = THREE.MathUtils.lerp(lower.sunAngle, upper.sunAngle, alpha);

    // Apply sky background
    if (!this.scene.background || !this.scene.background.isColor) {
      this.scene.background = new THREE.Color();
    }
    this.scene.background.copy(skyColor);

    // Apply directional (sun) light
    if (this._sunLight) {
      this._sunLight.color.copy(sunColor);
      this._sunLight.intensity = sunIntensity;
      this._setSunPosition(sunAngle);

      // Disable sun when below horizon
      this._sunLight.visible = sunAngle > 0 && sunAngle < 180;
    }

    // Apply ambient light
    if (this._ambientLight) {
      this._ambientLight.color.copy(ambientColor);
      this._ambientLight.intensity = ambientIntensity;
    }

    // Apply fog
    if (this.scene.fog) {
      this.scene.fog.color.copy(fogColor);
      this.scene.fog.near = fogNear;
      this.scene.fog.far = fogFar;
    }
  }

  /**
   * Position the sun directional light based on angle.
   * 0° = horizon east, 90° = overhead, 180° = horizon west.
   */
  _setSunPosition(angleDeg) {
    if (!this._sunLight) return;

    const angleRad = THREE.MathUtils.degToRad(angleDeg);
    const distance = 100;

    // Sun moves in an arc from east (+x) through up (+y) to west (-x)
    const x = Math.cos(angleRad) * distance;
    const y = Math.sin(angleRad) * distance;
    const z = 0; // sun travels east-west

    this._sunLight.position.set(x, y, z);
    this._sunLight.target.position.set(0, 0, 0);
    if (this._sunLight.target.parent === null) {
      this.scene.add(this._sunLight.target);
    }
  }

  /**
   * Lerp between two hex color strings, returns a THREE.Color.
   */
  _lerpColor(hexA, hexB, alpha) {
    this._colorA.set(hexA);
    this._colorB.set(hexB);
    this._colorResult.copy(this._colorA).lerp(this._colorB, alpha);
    return this._colorResult.clone();
  }

  // ─────────────────────────────────────────────
  // Internal: Scene light discovery/creation
  // ─────────────────────────────────────────────

  /**
   * Find the world sun directional light by name, or create one.
   * Also find/create ambient light.
   */
  _findOrCreateLights() {
    // Search for existing sun
    this.scene.traverse((obj) => {
      if (obj.isDirectionalLight && obj.name === '__world_sun') {
        this._sunLight = obj;
      }
      if (obj.isAmbientLight) {
        this._ambientLight = obj;
      }
    });

    // Create directional light if not found
    if (!this._sunLight) {
      this._sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
      this._sunLight.name = '__world_sun';
      this._sunLight.castShadow = true;
      this._sunLight.shadow.mapSize.set(2048, 2048);
      this._sunLight.shadow.camera.near = 0.5;
      this._sunLight.shadow.camera.far = 200;
      this._sunLight.shadow.camera.left = -60;
      this._sunLight.shadow.camera.right = 60;
      this._sunLight.shadow.camera.top = 60;
      this._sunLight.shadow.camera.bottom = -60;
      this.scene.add(this._sunLight);
    }

    // Create ambient light if not found
    if (!this._ambientLight) {
      this._ambientLight = new THREE.AmbientLight(0x404060, 0.3);
      this.scene.add(this._ambientLight);
    }
  }

  // ─────────────────────────────────────────────
  // Internal: HUD time indicator
  // ─────────────────────────────────────────────

  /**
   * Create a small fixed-position HUD element showing current time.
   */
  _createHUD() {
    this._hudEl = document.createElement('div');
    Object.assign(this._hudEl.style, {
      position: 'fixed',
      top: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: 'monospace',
      fontSize: '10px',
      color: 'rgba(255, 255, 255, 0.6)',
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      padding: '2px 8px',
      borderRadius: '3px',
      pointerEvents: 'none',
      zIndex: '9999',
      userSelect: 'none',
      letterSpacing: '0.5px'
    });
    document.body.appendChild(this._hudEl);
    this._updateHUD();
  }

  /**
   * Refresh the HUD text with current time label and icon.
   */
  _updateHUD() {
    if (!this._hudEl) return;

    const hour = this.getHour();
    const label = this.getTimeLabel();
    const icon = (hour >= 6 && hour < 19) ? '☀' : '☽';
    const hourStr = String(hour).padStart(2, '0');
    const minuteFraction = (this.timeOfDay * 24 - Math.floor(this.timeOfDay * 24));
    const minutes = String(Math.floor(minuteFraction * 60)).padStart(2, '0');

    this._hudEl.textContent = `${icon} ${hourStr}:${minutes} ${label}`;
  }
}
