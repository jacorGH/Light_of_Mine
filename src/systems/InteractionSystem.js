import * as THREE from 'three';
import { events } from '../engine/EventBus.js';

/**
 * InteractionSystem — detects proximity to interactable objects (doors, NPCs, items)
 * and handles player interaction via input events.
 * 
 * Shows a floating prompt when near an interactable. On interaction:
 * - Doors: triggers interior enter/exit via WorldGrid
 * - NPCs: emits 'dialogue:start' for DialogueSystem
 * - Items: emits 'item:collected' for Inventory
 * 
 * Events emitted:
 *   interaction:available  { type, id, label }
 *   interaction:triggered  { type, id, data }
 *   world:enter_interior   { interiorId }
 *   world:exit_interior    { exitPosition }
 *   dialogue:start         { npcId, dialogueFile }
 *   item:collected         { id, name, type, quantity }
 */
export class InteractionSystem {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;

    // Interaction range
    this.interactRange = 4.0;

    // Current nearby interactable (if any)
    this.currentTarget = null;

    // Cached interactables (refreshed on cell change)
    this.interactables = [];
    this.cacheDirty = true;

    // HUD prompt element
    this.createPromptUI();

    // Input
    this.setupInput();

    // Listen for cell changes AND interior transitions
    events.on('world:cells_changed', () => { this.cacheDirty = true; });
    events.on('world:enter_interior', () => {
      // Delay cache refresh to let interior load
      setTimeout(() => { this.cacheDirty = true; }, 200);
    });
    events.on('world:exit_interior', () => {
      setTimeout(() => { this.cacheDirty = true; }, 200);
    });
  }

  // ─── INPUT ──────────────────────────────────────────────────────

  setupInput() {
    // PC: E key to interact
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.currentTarget) {
        this.interact(this.currentTarget);
      }
    });

    // Mobile: tap the prompt to interact
    this.promptEl.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this.currentTarget) {
        this.interact(this.currentTarget);
      }
    });

    this.promptEl.addEventListener('click', () => {
      if (this.currentTarget) {
        this.interact(this.currentTarget);
      }
    });
  }

  // ─── PROMPT UI ──────────────────────────────────────────────────

  createPromptUI() {
    this.promptEl = document.createElement('div');
    Object.assign(this.promptEl.style, {
      position: 'fixed',
      bottom: '35%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      background: 'rgba(0, 0, 0, 0.7)',
      border: '1px solid rgba(255, 200, 100, 0.5)',
      borderRadius: '6px',
      color: '#ffdd88',
      fontFamily: 'monospace',
      fontSize: '13px',
      textAlign: 'center',
      zIndex: '1100',
      pointerEvents: 'auto',
      cursor: 'pointer',
      display: 'none',
      transition: 'opacity 0.2s',
      userSelect: 'none',
    });
    document.body.appendChild(this.promptEl);
  }

  showPrompt(label, type) {
    const isMobile = 'ontouchstart' in window;
    const key = isMobile ? 'Tap' : '[E]';
    const icons = { door: '🚪', npc: '💬', item: '✦', exit: '🚪' };
    const icon = icons[type] || '•';

    this.promptEl.textContent = `${icon} ${key} ${label}`;
    this.promptEl.style.display = 'block';
    this.promptEl.style.opacity = '1';
  }

  hidePrompt() {
    this.promptEl.style.opacity = '0';
    setTimeout(() => {
      if (this.promptEl.style.opacity === '0') {
        this.promptEl.style.display = 'none';
      }
    }, 200);
  }

  // ─── CACHE ──────────────────────────────────────────────────────

  refreshCache() {
    if (!this.cacheDirty) return;
    this.interactables = [];

    this.scene.traverse((obj) => {
      if (!obj.userData) return;
      const type = obj.userData.type;
      if (type === 'door' || type === 'npc' || type === 'item' || type === 'exit') {
        this.interactables.push(obj);
      }
    });

    this.cacheDirty = false;
  }

  // ─── UPDATE (called each frame) ─────────────────────────────────

  update() {
    this.refreshCache();

    const playerPos = this.camera.position;
    let closest = null;
    let closestDist = this.interactRange;

    for (const obj of this.interactables) {
      // Get world position
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);

      const dist = playerPos.distanceTo(worldPos);
      if (dist < closestDist) {
        closestDist = dist;
        closest = obj;
      }
    }

    if (closest && closest !== this.currentTarget) {
      this.currentTarget = closest;
      const data = closest.userData;
      const label = data.label || data.name || data.id || 'Interact';
      this.showPrompt(label, data.type);
      events.emit('interaction:available', { type: data.type, id: data.id, label });

    } else if (!closest && this.currentTarget) {
      this.currentTarget = null;
      this.hidePrompt();
    }
  }

  // ─── INTERACTION ────────────────────────────────────────────────

  interact(target) {
    const data = target.userData;

    events.emit('interaction:triggered', { type: data.type, id: data.id, data });

    switch (data.type) {
      case 'door':
        this.handleDoor(data);
        break;
      case 'exit':
        this.handleExit(data);
        break;
      case 'npc':
        this.handleNPC(data);
        break;
      case 'item':
        this.handleItem(target, data);
        break;
    }

    // Clear prompt after interaction
    this.currentTarget = null;
    this.hidePrompt();
  }

  handleDoor(data) {
    // Enter interior via WorldGrid
    events.emit('world:enter_interior', { interiorId: data.target });
    this.engine.worldGrid.enterInterior(data.target);
    this.cacheDirty = true;
  }

  handleExit(data) {
    // Exit interior, return to exterior at exit position
    events.emit('world:exit_interior', { exitPosition: data.exitPosition });
    this.engine.worldGrid.exitInterior(data.exitPosition);
    this.cacheDirty = true;
  }

  handleNPC(data) {
    // Start dialogue
    events.emit('dialogue:start', {
      npcId: data.id,
      npcName: data.name,
      dialogueFile: data.dialogue,
    });
  }

  handleItem(target, data) {
    // Collect item contents
    if (data.contents) {
      for (const itemId of data.contents) {
        events.emit('item:collected', {
          id: itemId,
          name: itemId.replace(/_/g, ' '),
          type: 'misc',
          icon: '■',
          quantity: 1,
        });
      }
    }

    // Remove item from scene
    if (target.parent) {
      target.parent.remove(target);
    }
    if (target.geometry) target.geometry.dispose();
    if (target.material) target.material.dispose();

    // Remove from cache
    const idx = this.interactables.indexOf(target);
    if (idx !== -1) this.interactables.splice(idx, 1);
  }
}
