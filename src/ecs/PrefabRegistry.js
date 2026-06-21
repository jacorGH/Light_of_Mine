/**
 * PrefabRegistry — Loads and stores entity prefab templates.
 * 
 * Prefabs are JSON definitions describing default components.
 * stamp() creates a new definition from a template with overrides.
 */
export class PrefabRegistry {
  constructor() {
    this.prefabs = new Map();
  }

  register(definition) {
    if (!definition.id) return;
    this.prefabs.set(definition.id, definition);
  }

  registerAll(definitions) {
    for (const def of definitions) this.register(def);
  }

  get(id) { return this.prefabs.get(id); }
  has(id) { return this.prefabs.has(id); }
  getAll() { return [...this.prefabs.keys()]; }

  getByTag(tag) {
    const results = [];
    for (const p of this.prefabs.values()) {
      if (p.tags && p.tags.includes(tag)) results.push(p);
    }
    return results;
  }

  /**
   * Stamp a new entity definition from a prefab with overrides.
   * @param {string} prefabId
   * @param {object} overrides - { position?, rotation?, scale?, components?: { type: partial } }
   * @returns {object|null}
   */
  stamp(prefabId, overrides = {}) {
    const template = this.prefabs.get(prefabId);
    if (!template) return null;

    const definition = {
      prefabId,
      tags: [...(template.tags || [])],
      components: {},
    };

    for (const [type, data] of Object.entries(template.components || {})) {
      definition.components[type] = JSON.parse(JSON.stringify(data));
    }

    // Transform overrides
    if (overrides.position || overrides.rotation || overrides.scale) {
      if (!definition.components.transform) definition.components.transform = {};
      if (overrides.position) definition.components.transform.position = overrides.position;
      if (overrides.rotation) definition.components.transform.rotation = overrides.rotation;
      if (overrides.scale) definition.components.transform.scale = overrides.scale;
    }

    // Component-level overrides (merge)
    if (overrides.components) {
      for (const [type, data] of Object.entries(overrides.components)) {
        if (!definition.components[type]) definition.components[type] = {};
        Object.assign(definition.components[type], data);
      }
    }

    if (overrides.tags) definition.tags.push(...overrides.tags);
    return definition;
  }

  async loadFromFile(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data)) this.registerAll(data);
      else if (data.prefabs) this.registerAll(data.prefabs);
    } catch (err) {
      console.warn('[PrefabRegistry] Load failed:', err);
    }
  }
}
