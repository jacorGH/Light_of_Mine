import { events } from '../engine/EventBus.js';
import { DialogueUI } from '../ui/DialogueUI.js';

/**
 * DialogueSystem — Loads and manages dialogue trees from JSON files.
 *
 * Listens for 'dialogue:start' events from InteractionSystem and displays
 * branching dialogue trees with choices. Handles dialogue actions like
 * quest starts, item purchases, and item gifts.
 *
 * Events consumed:
 *   dialogue:start  { npcId, npcName, dialogueFile }
 *
 * Events emitted:
 *   game:paused
 *   game:resumed
 *   quest:started       { questId }
 *   item:collected      { id, name, type, quantity }
 *   dialogue:ended      { npcId }
 */
export class DialogueSystem {
  constructor(engine) {
    this.engine = engine;
    this.dialogueUI = null;
    this.dialogueData = null;
    this.currentNodeId = null;
    this.currentNpcId = null;
    this.currentNpcName = null;
    this.isActive = false;

    // Cache loaded dialogue files
    this.cache = new Map();

    // Subscribe to dialogue start events
    events.on('dialogue:start', this.onDialogueStart, this);
  }

  // ─── EVENT HANDLER ──────────────────────────────────────────────

  async onDialogueStart({ npcId, npcName, dialogueFile }) {
    if (this.isActive) return;

    this.currentNpcId = npcId;
    this.currentNpcName = npcName || 'Unknown';

    // Pause the game
    events.emit('game:paused');

    // Load dialogue data
    const data = await this.loadDialogue(dialogueFile);

    if (!data) {
      // Show generic fallback and close
      this.showFallback(npcName);
      return;
    }

    this.startDialogue(npcName || data.npcName, data);
  }

  // ─── LOADING ────────────────────────────────────────────────────

  async loadDialogue(dialogueFile) {
    if (!dialogueFile) return null;

    // Check cache
    if (this.cache.has(dialogueFile)) {
      return this.cache.get(dialogueFile);
    }

    try {
      const basePath = import.meta.env.BASE_URL || '/';
      const url = `${basePath}world/${dialogueFile}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`[DialogueSystem] Failed to load dialogue: ${url} (${response.status})`);
        return null;
      }

      const data = await response.json();
      this.cache.set(dialogueFile, data);
      return data;
    } catch (err) {
      console.warn(`[DialogueSystem] Error loading dialogue file:`, err);
      return null;
    }
  }

  // ─── FALLBACK ───────────────────────────────────────────────────

  showFallback(npcName) {
    this.isActive = true;
    this.dialogueUI = new DialogueUI(this.engine);
    this.dialogueUI.show(npcName || '???', '...', []);
    this.dialogueUI.onContinue = () => {
      this.endDialogue();
    };
  }

  // ─── DIALOGUE FLOW ──────────────────────────────────────────────

  startDialogue(npcName, dialogueData) {
    this.isActive = true;
    this.dialogueData = dialogueData;
    this.currentNpcName = npcName;
    this.currentNodeId = 'start';

    // Create UI
    this.dialogueUI = new DialogueUI(this.engine);
    this.dialogueUI.onChoiceSelected = (choiceIndex) => {
      this.advanceDialogue(choiceIndex);
    };
    this.dialogueUI.onContinue = () => {
      this.endDialogue();
    };

    // Show first node
    this.showCurrentNode();
  }

  showCurrentNode() {
    const node = this.dialogueData.nodes[this.currentNodeId];

    if (!node) {
      this.endDialogue();
      return;
    }

    const choices = node.choices || [];
    this.dialogueUI.show(this.currentNpcName, node.text, choices);
  }

  advanceDialogue(choiceIndex) {
    const node = this.dialogueData.nodes[this.currentNodeId];
    if (!node || !node.choices) {
      this.endDialogue();
      return;
    }

    const choice = node.choices[choiceIndex];
    if (!choice) {
      this.endDialogue();
      return;
    }

    // Handle action on choice
    if (choice.action) {
      this.handleAction(choice.action);
    }

    // Navigate to next node or end
    if (choice.next === null || choice.next === undefined) {
      this.endDialogue();
    } else {
      this.currentNodeId = choice.next;
      this.showCurrentNode();
    }
  }

  endDialogue() {
    this.isActive = false;
    this.dialogueData = null;
    this.currentNodeId = null;

    // Destroy UI
    if (this.dialogueUI) {
      this.dialogueUI.hide(() => {
        if (this.dialogueUI) {
          this.dialogueUI.destroy();
          this.dialogueUI = null;
        }
      });
    }

    // Emit ended event
    events.emit('dialogue:ended', { npcId: this.currentNpcId });

    // Resume game
    events.emit('game:resumed');

    this.currentNpcId = null;
    this.currentNpcName = null;
  }

  // ─── ACTIONS ────────────────────────────────────────────────────

  handleAction(action) {
    switch (action.type) {
      case 'quest_start':
        events.emit('quest:started', { questId: action.questId });
        break;

      case 'give_item':
        events.emit('item:collected', {
          id: action.itemId,
          name: (action.itemId || '').replace(/_/g, ' '),
          type: action.itemType || 'misc',
          icon: action.icon || '■',
          quantity: action.quantity || 1,
        });
        break;

      case 'buy':
        // Emit purchase event — inventory/gold system handles validation
        events.emit('item:purchased', {
          itemId: action.itemId,
          cost: action.cost || 0,
        });
        events.emit('item:collected', {
          id: action.itemId,
          name: (action.itemId || '').replace(/_/g, ' '),
          type: 'consumable',
          icon: '🧪',
          quantity: 1,
        });
        break;

      case 'set_flag':
        events.emit('world:flag_set', {
          flag: action.flag,
          value: action.value !== undefined ? action.value : true,
        });
        break;

      default:
        console.warn(`[DialogueSystem] Unknown action type: ${action.type}`);
    }
  }
}
