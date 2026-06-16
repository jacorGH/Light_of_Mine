import { events } from '../engine/EventBus.js';
import { QuestUI } from '../ui/QuestUI.js';

const BASE_URL = import.meta.env.BASE_URL;

/**
 * QuestSystem — Tracks active quests, objectives, and completion state.
 *
 * Fully event-driven. Listens for quest:started to load and activate quests,
 * then tracks objective progress via enemy:killed, item:collected,
 * dialogue:ended, and world:enter_interior events.
 *
 * Emits: quest:added, quest:objective_updated, quest:ready, quest:completed
 */
export class QuestSystem {
  constructor(engine) {
    this.engine = engine;
    this.quests = new Map();          // active quests by id
    this.completedQuests = new Set(); // completed quest ids
    this.visitedInteriors = new Set(); // track all interiors player has entered

    // Create the quest UI
    this.ui = new QuestUI(engine);

    // Subscribe to events
    events.on('quest:started', this.onQuestStarted, this);
    events.on('enemy:killed', this.onEnemyKilled, this);
    events.on('item:collected', this.onItemCollected, this);
    events.on('dialogue:ended', this.onDialogueEnded, this);
    events.on('world:enter_interior', this.onEnterInterior, this);
  }

  /* ─── Event Handlers ─────────────────────────────────────────────── */

  async onQuestStarted({ questId }) {
    if (this.quests.has(questId) || this.completedQuests.has(questId)) return;

    const quest = await this.loadQuest(questId);
    if (!quest) return;

    this.quests.set(questId, quest);
    events.emit('quest:added', { quest });

    // Retroactively check if any explore objectives are already satisfied
    for (const obj of quest.objectives) {
      if (obj.type === 'explore' && this.visitedInteriors.has(obj.target) && obj.current < obj.count) {
        this.updateObjective(questId, obj.id, 1);
      }
    }
  }

  onEnemyKilled({ asset }) {
    for (const [questId, quest] of this.quests) {
      for (const obj of quest.objectives) {
        if (obj.type === 'kill' && obj.target === asset && obj.current < obj.count) {
          this.updateObjective(questId, obj.id, 1);
        }
      }
    }
  }

  onItemCollected({ id }) {
    for (const [questId, quest] of this.quests) {
      for (const obj of quest.objectives) {
        if (obj.type === 'collect' && obj.target === id && obj.current < obj.count) {
          this.updateObjective(questId, obj.id, 1);
        }
      }
    }
  }

  onDialogueEnded({ npcId }) {
    for (const [questId, quest] of this.quests) {
      // Check talk objectives
      for (const obj of quest.objectives) {
        if (obj.type === 'talk' && obj.target === npcId && obj.current < obj.count) {
          this.updateObjective(questId, obj.id, 1);
        }
      }

      // Auto turn-in: if quest is ready and we just talked to the turnIn NPC
      if (quest.readyToTurnIn && quest.turnIn === npcId) {
        this.turnInQuest(questId);
      }
    }
  }

  onEnterInterior({ interiorId }) {
    // Track that this interior has been visited (for retroactive quest completion)
    this.visitedInteriors.add(interiorId);

    for (const [questId, quest] of this.quests) {
      for (const obj of quest.objectives) {
        if (obj.type === 'explore' && obj.target === interiorId && obj.current < obj.count) {
          this.updateObjective(questId, obj.id, 1);
        }
      }
    }
  }

  /* ─── Core Methods ───────────────────────────────────────────────── */

  /**
   * Fetch quest JSON from public/world/quests/.
   * @param {string} questId
   * @returns {object|null} Quest data or null on failure
   */
  async loadQuest(questId) {
    try {
      const response = await fetch(`${BASE_URL}world/quests/${questId}.json`);
      if (!response.ok) throw new Error(`Quest not found: ${questId}`);
      const quest = await response.json();
      // Ensure current counters are initialized
      for (const obj of quest.objectives) {
        if (obj.current === undefined) obj.current = 0;
      }
      return quest;
    } catch (err) {
      console.error(`[QuestSystem] Failed to load quest "${questId}":`, err);
      return null;
    }
  }

  /**
   * Increment objective progress.
   * @param {string} questId
   * @param {string} objectiveId
   * @param {number} amount
   */
  updateObjective(questId, objectiveId, amount = 1) {
    const quest = this.quests.get(questId);
    if (!quest) return;

    const obj = quest.objectives.find(o => o.id === objectiveId);
    if (!obj) return;

    obj.current = Math.min(obj.current + amount, obj.count);

    events.emit('quest:objective_updated', {
      questId,
      objectiveId,
      label: obj.label,
      current: obj.current,
      count: obj.count
    });

    this.checkCompletion(questId);
  }

  /**
   * Check if all objectives for a quest are met. If so, mark ready-to-turn-in.
   * @param {string} questId
   */
  checkCompletion(questId) {
    const quest = this.quests.get(questId);
    if (!quest || quest.readyToTurnIn) return;

    const allMet = quest.objectives.every(obj => obj.current >= obj.count);
    if (allMet) {
      quest.readyToTurnIn = true;
      events.emit('quest:ready', { questId, quest });
    }
  }

  /**
   * Turn in a completed quest — award rewards and move to completedQuests.
   * @param {string} questId
   */
  turnInQuest(questId) {
    const quest = this.quests.get(questId);
    if (!quest || !quest.readyToTurnIn) return;

    const { rewards } = quest;

    // Award gold
    if (rewards.gold) {
      events.emit('item:collected', { id: 'gold', name: 'Gold', type: 'currency', quantity: rewards.gold });
    }

    // Award items
    if (rewards.items) {
      for (const item of rewards.items) {
        events.emit('item:collected', { id: item.id, name: item.name, type: item.type, quantity: 1, icon: item.icon });
      }
    }

    // Award XP
    if (rewards.xp) {
      events.emit('player:xp', { amount: rewards.xp });
    }

    // Move to completed
    this.quests.delete(questId);
    this.completedQuests.add(questId);

    events.emit('quest:completed', { questId, quest });
  }

  /* ─── Utility Methods ────────────────────────────────────────────── */

  /**
   * Get array of all active quest data.
   * @returns {Array}
   */
  getActiveQuests() {
    return Array.from(this.quests.values());
  }

  /**
   * Serialize quest state for save system.
   * @returns {object}
   */
  serialize() {
    const activeQuests = {};
    for (const [id, quest] of this.quests) {
      activeQuests[id] = {
        ...quest,
        objectives: quest.objectives.map(obj => ({ ...obj }))
      };
    }
    return {
      activeQuests,
      completedQuests: Array.from(this.completedQuests),
      visitedInteriors: Array.from(this.visitedInteriors)
    };
  }

  /**
   * Restore quest state from saved data.
   * @param {object} data
   */
  deserialize(data) {
    this.quests.clear();
    this.completedQuests.clear();
    this.visitedInteriors.clear();

    if (data.activeQuests) {
      for (const [id, quest] of Object.entries(data.activeQuests)) {
        this.quests.set(id, quest);
      }
    }

    if (data.completedQuests) {
      for (const id of data.completedQuests) {
        this.completedQuests.add(id);
      }
    }

    if (data.visitedInteriors) {
      for (const id of data.visitedInteriors) {
        this.visitedInteriors.add(id);
      }
    }

    // Refresh UI after deserialize
    this.ui.update();
  }
}
