import { events } from './EventBus.js';

/**
 * Inventory — manages player items, equipment, and HUD display.
 * 
 * Items are stored as objects with id, name, type, quantity, and optional stats.
 * The HUD shows a compact bar at the top-left that can be expanded.
 */
export class Inventory {
  constructor(engine) {
    this.engine = engine;

    // Item storage: Map<id, { id, name, type, icon, quantity, stats }>
    this.items = new Map();
    this.gold = 25; // Currency stored separately

    // Equipment slots
    this.equipment = {
      weapon: null,   // currently equipped weapon id
      armor: null,
      ring: null,
      amulet: null,
    };

    // HUD state
    this.isOpen = false;

    // Create HUD
    this.createHUD();

    // Start with some default items
    this.addItem({ id: 'potion_health_minor', name: 'Health Potion', type: 'consumable', icon: '❤', quantity: 3 });

    // Input
    this.setupInput();

    // Global item use handler (for inventory panel buttons)
    window._useItem = (itemId) => {
      this.useItem(itemId);
    };
  }

  // ─── ITEM MANAGEMENT ────────────────────────────────────────────

  addItem(item) {
    // Gold/currency is a counter, not an inventory item
    if (item.id === 'gold' || item.type === 'currency' || item.type === 'gold') {
      this.gold += (item.quantity || 1);
      this.updateHUD();
      this.showPickupNotification('Gold', item.quantity || 1);
      return;
    }

    if (this.items.has(item.id)) {
      const existing = this.items.get(item.id);
      existing.quantity += (item.quantity || 1);
    } else {
      this.items.set(item.id, {
        id: item.id,
        name: item.name || item.id,
        type: item.type || 'misc',
        icon: item.icon || '■',
        quantity: item.quantity || 1,
        stats: item.stats || null,
      });
    }
    this.updateHUD();
    this.showPickupNotification(item.name || item.id, item.quantity || 1);
  }

  removeItem(id, quantity = 1) {
    if (id === 'gold') {
      if (this.gold < quantity) return false;
      this.gold -= quantity;
      this.updateHUD();
      return true;
    }
    if (!this.items.has(id)) return false;
    const item = this.items.get(id);
    item.quantity -= quantity;
    if (item.quantity <= 0) {
      this.items.delete(id);
    }
    this.updateHUD();
    return true;
  }

  hasItem(id, quantity = 1) {
    if (!this.items.has(id)) return false;
    return this.items.get(id).quantity >= quantity;
  }

  getItemCount(id) {
    if (id === 'gold') return this.gold;
    if (!this.items.has(id)) return 0;
    return this.items.get(id).quantity;
  }

  // ─── INPUT ──────────────────────────────────────────────────────

  setupInput() {
    // PC: I key to toggle inventory (Tab reserved for radial menu)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyI') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.inventoryPanel.style.display = this.isOpen ? 'block' : 'none';
    this.updateInventoryPanel();
  }

  // ─── HUD ────────────────────────────────────────────────────────

  createHUD() {
    // Quick bar (always visible, top-left)
    this.quickBar = document.createElement('div');
    Object.assign(this.quickBar.style, {
      position: 'fixed',
      top: '10px',
      left: '10px',
      display: 'flex',
      gap: '6px',
      zIndex: '1000',
      pointerEvents: 'none',
    });
    document.body.appendChild(this.quickBar);

    // Gold display
    this.goldDisplay = document.createElement('div');
    Object.assign(this.goldDisplay.style, {
      color: '#ffdd44',
      fontFamily: 'monospace',
      fontSize: '13px',
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    });
    this.quickBar.appendChild(this.goldDisplay);

    // Health potions display
    this.potionDisplay = document.createElement('div');
    Object.assign(this.potionDisplay.style, {
      color: '#ff6666',
      fontFamily: 'monospace',
      fontSize: '13px',
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      marginLeft: '12px',
    });
    this.quickBar.appendChild(this.potionDisplay);

    // Inventory toggle button (mobile)
    this.invButton = document.createElement('div');
    Object.assign(this.invButton.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      width: '36px',
      height: '36px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.3)',
      background: 'rgba(0,0,0,0.4)',
      zIndex: '1001',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.7)',
      fontFamily: 'monospace',
      fontSize: '16px',
      cursor: 'pointer',
    });
    this.invButton.textContent = '≡';
    this.invButton.addEventListener('click', () => this.toggle());
    this.invButton.addEventListener('touchend', (e) => { e.preventDefault(); this.toggle(); });
    document.body.appendChild(this.invButton);

    // Full inventory panel (hidden by default)
    this.inventoryPanel = document.createElement('div');
    Object.assign(this.inventoryPanel.style, {
      position: 'fixed',
      top: '50px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '300px',
      maxWidth: '90vw',
      maxHeight: '70vh',
      background: 'rgba(20, 15, 10, 0.92)',
      border: '1px solid rgba(255,200,100,0.3)',
      borderRadius: '8px',
      padding: '16px',
      zIndex: '2000',
      display: 'none',
      overflowY: 'auto',
      fontFamily: 'monospace',
      color: '#ddd',
      fontSize: '13px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    });
    document.body.appendChild(this.inventoryPanel);

    // Pickup notification
    this.notification = document.createElement('div');
    Object.assign(this.notification.style, {
      position: 'fixed',
      top: '60px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: '#ffdd88',
      fontFamily: 'monospace',
      fontSize: '14px',
      textShadow: '0 1px 4px rgba(0,0,0,0.8)',
      zIndex: '1500',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.3s, top 0.3s',
    });
    document.body.appendChild(this.notification);

    this.updateHUD();
  }

  updateHUD() {
    this.goldDisplay.textContent = `● ${this.gold} gold`;
    const potions = this.getItemCount('potion_health_minor');
    this.potionDisplay.textContent = potions > 0 ? `❤ ×${potions}` : '';
  }

  updateInventoryPanel() {
    if (!this.isOpen) return;

    let html = '<div style="color:#ffcc66;font-size:14px;margin-bottom:10px;border-bottom:1px solid rgba(255,200,100,0.2);padding-bottom:6px"><strong>Inventory</strong> <span style="color:#ffdd44;font-size:11px">● ' + this.gold + ' gold</span></div>';

    const items = [...this.items.values()].filter(i => i.type !== 'currency');
    if (items.length === 0) {
      html += '<div style="color:#666">No items</div>';
    } else {
      for (const item of items) {
        const typeColor = this.getTypeColor(item.type);
        const canUse = item.type === 'consumable';
        html += '<div style="display:flex;align-items:center;gap:6px;padding:8px;background:rgba(255,255,255,0.03);border-radius:4px;border:1px solid rgba(255,255,255,0.06);margin-bottom:4px">';
        html += '<span style="font-size:16px">' + item.icon + '</span>';
        html += '<span style="flex:1;color:' + typeColor + ';font-size:12px">' + item.name + '</span>';
        html += '<span style="color:#888;font-size:11px">×' + item.quantity + '</span>';
        if (canUse) {
          html += '<button onclick="window._useItem(\'' + item.id + '\')" style="background:rgba(100,200,100,0.2);border:1px solid rgba(100,200,100,0.5);border-radius:4px;color:#88ff88;padding:3px 8px;font-size:10px;font-family:monospace;cursor:pointer">Use</button>';
        }
        html += '</div>';
      }
    }

    html += '<div style="margin-top:10px;text-align:center;color:#555;font-size:10px">Tap ≡ to close</div>';
    this.inventoryPanel.innerHTML = html;
  }

  getTypeColor(type) {
    switch (type) {
      case 'weapon': return '#aabbff';
      case 'armor': return '#88cc88';
      case 'consumable': return '#ff8888';
      case 'spell': return '#cc88ff';
      case 'currency': return '#ffdd44';
      case 'quest': return '#ffaa44';
      default: return '#cccccc';
    }
  }

  showPickupNotification(name, qty) {
    const text = qty > 1 ? `+ ${name} ×${qty}` : `+ ${name}`;
    this.notification.textContent = text;
    this.notification.style.opacity = '1';
    this.notification.style.top = '60px';

    setTimeout(() => {
      this.notification.style.opacity = '0';
      this.notification.style.top = '50px';
    }, 1500);
  }

  useItem(id) {
    const item = this.items.get(id);
    if (!item || item.type !== 'consumable') return;

    // Use the consumable
    if (id === 'potion_health_minor' || id.includes('health')) {
      events.emit('player:healed', { amount: 30 });
      this.showPickupNotification('Used ' + item.name, 0);
    } else if (id.includes('stamina')) {
      // Future: restore stamina
      this.showPickupNotification('Used ' + item.name, 0);
    } else if (id.includes('magicka')) {
      // Future: restore magicka
      this.showPickupNotification('Used ' + item.name, 0);
    } else {
      this.showPickupNotification('Used ' + item.name, 0);
    }

    this.removeItem(id, 1);
    this.updateInventoryPanel();
  }
}
