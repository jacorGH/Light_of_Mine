/**
 * EventBus — Simple pub/sub system for decoupled communication.
 * 
 * All game systems emit and listen to events through this single bus.
 * No system needs a direct reference to another system.
 * 
 * Usage:
 *   events.on('player:attack', (data) => { ... });
 *   events.emit('player:attack', { direction: 'up', power: 0.8 });
 *   events.off('player:attack', handler);
 * 
 * Event naming convention: "system:action"
 *   player:attack, player:damaged, player:died
 *   enemy:damaged, enemy:killed
 *   item:collected, item:used, item:equipped
 *   quest:started, quest:objective_complete, quest:finished
 *   world:cell_loaded, world:cell_unloaded, world:door_entered
 *   ui:menu_opened, ui:menu_closed
 *   game:paused, game:resumed, game:saved
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event - Event name (e.g., 'player:attack')
   * @param {Function} callback - Handler function
   * @param {object} [context] - Optional `this` context for the callback
   * @returns {Function} The bound callback (use for off() if context provided)
   */
  on(event, callback, context) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const bound = context ? callback.bind(context) : callback;
    this.listeners.get(event).push({ original: callback, bound, context });
    return bound;
  }

  /**
   * Subscribe to an event, but only fire once then auto-unsubscribe.
   */
  once(event, callback, context) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback.apply(context, args);
    };
    this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event - Event name
   * @param {Function} callback - The original callback passed to on()
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event);
    const idx = list.findIndex(entry => entry.original === callback || entry.bound === callback);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) this.listeners.delete(event);
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} event - Event name
   * @param {*} data - Payload (any type)
   */
  emit(event, data) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event);
    for (let i = 0; i < list.length; i++) {
      list[i].bound(data);
    }
  }

  /**
   * Remove all listeners for an event, or all listeners entirely.
   * @param {string} [event] - If provided, clear only this event's listeners
   */
  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Debug: list all registered events and listener counts.
   */
  debug() {
    const info = {};
    for (const [event, list] of this.listeners) {
      info[event] = list.length;
    }
    return info;
  }
}

// Singleton instance — import this everywhere
export const events = new EventBus();
