/**
 * Entity — A unique game object composed of data components.
 * 
 * An Entity is just an ID and a bag of components. It has no behavior.
 * Systems operate on entities that have specific component combinations.
 */
export class Entity {
  static _nextId = 1;

  constructor(prefabId = null) {
    this.id = `e_${Entity._nextId++}`;
    this.prefabId = prefabId;
    this.components = new Map();
    this.tags = new Set();
    this.active = true;
    this.mesh = null;     // Three.js mesh (set by EntityLoader)
    this.group = null;    // Parent group (cell group)
  }

  addComponent(type, data) {
    this.components.set(type, { ...data });
    return this;
  }

  get(type) { return this.components.get(type); }
  has(type) { return this.components.has(type); }
  hasAll(...types) { return types.every(t => this.components.has(t)); }
  removeComponent(type) { this.components.delete(type); }

  addTags(...newTags) {
    for (const t of newTags) this.tags.add(t);
    return this;
  }

  hasTag(tag) { return this.tags.has(tag); }

  serialize() {
    const components = {};
    for (const [type, data] of this.components) {
      components[type] = { ...data };
    }
    return { id: this.id, prefabId: this.prefabId, tags: [...this.tags], components, active: this.active };
  }

  static deserialize(data) {
    const entity = new Entity(data.prefabId);
    entity.id = data.id;
    entity.active = data.active !== false;
    if (data.tags) data.tags.forEach(t => entity.tags.add(t));
    if (data.components) {
      for (const [type, compData] of Object.entries(data.components)) {
        entity.addComponent(type, compData);
      }
    }
    return entity;
  }
}
