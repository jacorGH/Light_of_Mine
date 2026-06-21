import { Entity } from './Entity.js';
import { events } from '../engine/EventBus.js';

/**
 * EntityManager — Creates, destroys, and queries entities.
 * Central registry of all active entities in the game world.
 */
export class EntityManager {
  constructor() {
    this.entities = new Map();
  }

  create(definition = {}) {
    const entity = new Entity(definition.prefabId || null);
    if (definition.tags) entity.addTags(...definition.tags);
    if (definition.components) {
      for (const [type, data] of Object.entries(definition.components)) {
        entity.addComponent(type, data);
      }
    }
    this.entities.set(entity.id, entity);
    events.emit('entity:created', { entity });
    return entity;
  }

  destroy(entityOrId) {
    const id = typeof entityOrId === 'string' ? entityOrId : entityOrId.id;
    const entity = this.entities.get(id);
    if (!entity) return;
    entity.active = false;
    this.entities.delete(id);
    events.emit('entity:destroyed', { entity });
  }

  get(id) { return this.entities.get(id); }

  query(...componentTypes) {
    const results = [];
    for (const entity of this.entities.values()) {
      if (entity.active && entity.hasAll(...componentTypes)) results.push(entity);
    }
    return results;
  }

  queryByTag(tag) {
    const results = [];
    for (const entity of this.entities.values()) {
      if (entity.active && entity.hasTag(tag)) results.push(entity);
    }
    return results;
  }

  queryByPrefab(prefabId) {
    const results = [];
    for (const entity of this.entities.values()) {
      if (entity.active && entity.prefabId === prefabId) results.push(entity);
    }
    return results;
  }

  get count() { return this.entities.size; }

  clear() {
    for (const entity of this.entities.values()) events.emit('entity:destroyed', { entity });
    this.entities.clear();
  }

  serialize() {
    const data = [];
    for (const entity of this.entities.values()) data.push(entity.serialize());
    return data;
  }

  deserialize(dataArray) {
    this.clear();
    if (!dataArray) return;
    for (const data of dataArray) {
      const entity = Entity.deserialize(data);
      this.entities.set(entity.id, entity);
    }
  }
}
