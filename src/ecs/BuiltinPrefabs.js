/**
 * BuiltinPrefabs — All core archetype prefab definitions.
 * These are registered at startup. More can be loaded from JSON files.
 */
export const BUILTIN_PREFABS = [
  // ─── LIGHT SOURCES ──────────────────────────────────────────────
  {
    id: 'wall_torch',
    name: 'Wall Torch',
    tags: ['light', 'interactable', 'dungeon', 'interior'],
    components: {
      renderable: { geometry: 'cylinder', size: [0.08, 1.2, 0.08], color: '#5a3a1a' },
      anchor: { type: 'wall', face: 'auto', offset: 0.05, height: 2.0 },
      light: { color: '#ff9944', intensity: 0.8, range: 8, flicker: true },
      interactable: { type: 'toggle', label: 'Extinguish', state: 'on', affects: ['light'] },
    },
  },
  {
    id: 'campfire',
    name: 'Campfire',
    tags: ['light', 'exterior'],
    components: {
      renderable: { geometry: 'cone', size: [0.5, 0.8, 0.5], color: '#aa3300' },
      anchor: { type: 'floor' },
      light: { color: '#ff6622', intensity: 1.0, range: 12, flicker: true },
      physics: { collider: 'cylinder', radius: 0.6, static: true },
    },
  },

  // ─── CONTAINERS ─────────────────────────────────────────────────
  {
    id: 'barrel_01',
    name: 'Barrel',
    tags: ['container', 'furniture', 'breakable'],
    components: {
      renderable: { geometry: 'cylinder', size: [0.4, 0.8, 0.4], color: '#6a4a2a' },
      anchor: { type: 'floor' },
      physics: { collider: 'cylinder', radius: 0.4, height: 0.8, static: true, standable: true },
      container: { slots: 4, items: [], locked: false },
      interactable: { type: 'container', label: 'Search Barrel' },
      health: { max: 30, current: 30, destructible: true },
    },
  },
  {
    id: 'chest_wooden',
    name: 'Wooden Chest',
    tags: ['container', 'loot'],
    components: {
      renderable: { geometry: 'box', size: [0.8, 0.6, 0.6], color: '#aa7722' },
      anchor: { type: 'floor' },
      physics: { collider: 'box', static: true },
      container: { slots: 8, items: [], locked: false },
      interactable: { type: 'container', label: 'Open Chest' },
    },
  },
  {
    id: 'chest_locked',
    name: 'Locked Chest',
    tags: ['container', 'loot', 'locked'],
    components: {
      renderable: { geometry: 'box', size: [0.8, 0.6, 0.6], color: '#8b6914' },
      anchor: { type: 'floor' },
      physics: { collider: 'box', static: true },
      container: { slots: 8, items: [], locked: true, key_id: null, lock_difficulty: 25 },
      interactable: { type: 'container', label: 'Locked', label_locked: 'Pick Lock' },
    },
  },

  // ─── FURNITURE ──────────────────────────────────────────────────
  {
    id: 'table_wooden',
    name: 'Wooden Table',
    tags: ['furniture', 'interior', 'surface'],
    components: {
      renderable: { geometry: 'box', size: [1.2, 0.75, 0.8], color: '#7a5a30' },
      anchor: { type: 'floor' },
      physics: { collider: 'box', static: true, standable: true },
      surface: { height: 0.75, slots: 4 },
    },
  },
  {
    id: 'chair_wooden',
    name: 'Wooden Chair',
    tags: ['furniture', 'interior'],
    components: {
      renderable: { geometry: 'box', size: [0.4, 0.9, 0.4], color: '#6a4a28' },
      anchor: { type: 'floor' },
      physics: { collider: 'box', static: true },
    },
  },

  // ─── MECHANISMS ─────────────────────────────────────────────────
  {
    id: 'lever_wall',
    name: 'Wall Lever',
    tags: ['mechanism', 'interactable', 'dungeon'],
    components: {
      renderable: { geometry: 'cylinder', size: [0.05, 0.5, 0.05], color: '#666666' },
      anchor: { type: 'wall', height: 1.2 },
      interactable: { type: 'toggle', label: 'Pull Lever', state: 'off' },
      mechanism: { targets: [], action: 'toggle', delay: 0.5 },
    },
  },
  {
    id: 'pressure_plate',
    name: 'Pressure Plate',
    tags: ['mechanism', 'trap', 'dungeon', 'hidden'],
    components: {
      renderable: { geometry: 'box', size: [1.0, 0.05, 1.0], color: '#5a5a55' },
      anchor: { type: 'floor' },
      mechanism: { targets: [], action: 'trigger', trigger_type: 'step', one_shot: false },
    },
  },

  // ─── DOORS/PASSAGES ─────────────────────────────────────────────
  {
    id: 'doorway_stone',
    name: 'Stone Doorway',
    tags: ['structure', 'passage', 'dungeon'],
    components: {
      renderable: { geometry: 'doorframe', size: [1.5, 2.5, 0.4], color: '#5a5a55' },
      anchor: { type: 'wall', face: 'auto' },
      door: { state: 'open', locked: false, key_id: null },
      physics: { collider: 'doorframe', passable_when: 'open' },
      interactable: { type: 'door', label: 'Enter' },
    },
  },

  // ─── NATURE ─────────────────────────────────────────────────────
  {
    id: 'tree_pine_01',
    name: 'Pine Tree',
    tags: ['nature', 'exterior', 'tree'],
    components: {
      renderable: { geometry: 'cone', size: [1.5, 6, 1.5], color: '#1a5a1a' },
      anchor: { type: 'floor' },
      physics: { collider: 'cylinder', radius: 0.5, static: true },
    },
  },
  {
    id: 'rock_large',
    name: 'Large Rock',
    tags: ['nature', 'exterior'],
    components: {
      renderable: { geometry: 'dodecahedron', size: [1.5], color: '#6a6a60' },
      anchor: { type: 'floor' },
      physics: { collider: 'sphere', radius: 1.5, static: true },
    },
  },

  // ─── CRAFTING STATIONS ──────────────────────────────────────────
  {
    id: 'alchemy_table',
    name: 'Alchemy Table',
    tags: ['crafting', 'interior', 'interactable'],
    components: {
      renderable: { geometry: 'box', size: [1.4, 0.9, 0.8], color: '#4a5a3a' },
      anchor: { type: 'floor' },
      physics: { collider: 'box', static: true },
      interactable: { type: 'use', label: 'Use Alchemy Table', action: 'open_alchemy' },
    },
  },
  {
    id: 'enchanting_altar',
    name: 'Enchanting Altar',
    tags: ['crafting', 'interior', 'interactable'],
    components: {
      renderable: { geometry: 'cylinder', size: [0.8, 1.0, 0.8], color: '#3a3a5a' },
      anchor: { type: 'floor' },
      physics: { collider: 'cylinder', radius: 0.8, static: true },
      light: { color: '#8844ff', intensity: 0.4, range: 4 },
      interactable: { type: 'use', label: 'Use Enchanting Altar', action: 'open_enchanting' },
    },
  },
  {
    id: 'forge',
    name: 'Forge',
    tags: ['crafting', 'interior', 'interactable'],
    components: {
      renderable: { geometry: 'box', size: [1.5, 1.0, 1.2], color: '#4a3020' },
      anchor: { type: 'floor' },
      physics: { collider: 'box', static: true },
      light: { color: '#ff4400', intensity: 0.6, range: 6 },
      interactable: { type: 'use', label: 'Use Forge', action: 'open_smithing' },
    },
  },
];
