import { events } from '../engine/EventBus.js';

/**
 * RadialMenu — "Tumble Ring" pause menu.
 * 
 * Design:
 * - Opens from center with items tumbling/spinning outward (card-deal animation)
 * - Category ring: Weapons, Items, Spells, Equipment, Quests, Settings
 * - Swipe/tap INTO a category → sub-items tumble forward, categories tumble back
 * - Swipe OUT (toward edge or tap back) → sub-items tumble back, categories return
 * - Tap an item → equip/use, menu closes
 * - Closing reverses the opening animation
 * 
 * Input:
 * - PC: Tab or Esc to open/close
 * - Mobile: Two-finger tap or dedicated pause button
 */
export class RadialMenu {
  constructor(engine) {
    this.engine = engine;
    this.isOpen = false;
    this.currentLevel = 'categories'; // 'categories' or 'items'
    this.selectedCategory = null;
    this.animating = false;

    // Categories
    this.categories = [
      { id: 'weapons', label: 'Weapons', icon: '⚔' },
      { id: 'items', label: 'Items', icon: '🧪' },
      { id: 'spells', label: 'Spells', icon: '✨' },
      { id: 'equipment', label: 'Equip', icon: '🛡' },
      { id: 'quests', label: 'Quests', icon: '📋' },
      { id: 'settings', label: 'Settings', icon: '⚙' },
    ];

    // DOM
    this.createDOM();
    this.setupInput();
  }

  // ─── DOM STRUCTURE ──────────────────────────────────────────────

  createDOM() {
    // Backdrop (dim + blur the game)
    this.backdrop = document.createElement('div');
    Object.assign(this.backdrop.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(3px)',
      WebkitBackdropFilter: 'blur(3px)',
      zIndex: '5000',
      display: 'none',
      opacity: '0',
      transition: 'opacity 0.25s ease-out',
    });
    document.body.appendChild(this.backdrop);

    // Menu container (centered, holds ring items)
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '0', height: '0',
      zIndex: '5001',
      display: 'none',
    });
    document.body.appendChild(this.container);

    // Back button (for sub-menus)
    this.backBtn = document.createElement('div');
    Object.assign(this.backBtn.style, {
      position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '50px', height: '50px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.25)',
      display: 'none',
      alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.6)',
      fontFamily: 'monospace', fontSize: '18px',
      cursor: 'pointer', zIndex: '5002',
    });
    this.backBtn.textContent = '✕';
    this.backBtn.addEventListener('click', () => this.navigateBack());
    this.backBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.navigateBack(); });
    this.container.appendChild(this.backBtn);

    // Pause button (mobile, top-left corner)
    this.pauseBtn = document.createElement('div');
    Object.assign(this.pauseBtn.style, {
      position: 'fixed',
      top: '10px', left: '50%',
      transform: 'translateX(-50%)',
      width: '36px', height: '36px',
      borderRadius: '50%',
      border: '1px solid rgba(255,255,255,0.25)',
      background: 'rgba(0,0,0,0.35)',
      zIndex: '1001',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.6)',
      fontFamily: 'monospace', fontSize: '14px',
      cursor: 'pointer',
    });
    this.pauseBtn.textContent = '⏸';
    this.pauseBtn.addEventListener('click', () => this.toggle());
    this.pauseBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.toggle(); });
    document.body.appendChild(this.pauseBtn);

    // Node pool (reusable ring item elements)
    this.nodes = [];
  }

  // ─── INPUT ──────────────────────────────────────────────────────

  setupInput() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'Tab') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  // ─── OPEN / CLOSE ───────────────────────────────────────────────

  toggle() {
    if (this.animating) return;
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.isOpen = true;
    this.currentLevel = 'categories';
    this.selectedCategory = null;

    events.emit('game:paused');

    this.backdrop.style.display = 'block';
    this.container.style.display = 'block';
    this.pauseBtn.textContent = '▶';

    requestAnimationFrame(() => {
      this.backdrop.style.opacity = '1';
      this.showRing(this.categories, 'category');
    });
  }

  close() {
    this.animating = true;
    this.pauseBtn.textContent = '⏸';

    // Animate nodes back to center
    this.collapseRing(() => {
      this.backdrop.style.opacity = '0';
      setTimeout(() => {
        this.backdrop.style.display = 'none';
        this.container.style.display = 'none';
        this.clearNodes();
        this.backBtn.style.display = 'none';
        this.isOpen = false;
        this.animating = false;
        events.emit('game:resumed');
      }, 250);
    });
  }

  // ─── RING DISPLAY ───────────────────────────────────────────────

  showRing(items, type) {
    this.animating = true;
    this.clearNodes();

    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3;
    const count = items.length;

    items.forEach((item, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const node = this.createNode(item, type);
      this.container.appendChild(node);
      this.nodes.push(node);

      // Start from center, tumble outward
      node.style.transform = `translate(-50%, -50%) translate(0px, 0px) scale(0) rotate(${180 + i * 30}deg)`;
      node.style.opacity = '0';

      // Staggered tumble-out animation
      const delay = i * 50;
      setTimeout(() => {
        node.style.transition = `transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease-out`;
        node.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(1) rotate(0deg)`;
        node.style.opacity = '1';
      }, delay);
    });

    // Show back button if in sub-level
    if (type === 'item') {
      setTimeout(() => {
        this.backBtn.style.display = 'flex';
      }, count * 50 + 100);
    }

    setTimeout(() => { this.animating = false; }, count * 50 + 400);
  }

  collapseRing(callback) {
    const nodes = this.nodes;
    nodes.forEach((node, i) => {
      const delay = i * 30;
      setTimeout(() => {
        node.style.transition = `transform 0.3s cubic-bezier(0.55, 0, 1, 0.45), opacity 0.2s ease-in`;
        node.style.transform = `translate(-50%, -50%) translate(0px, 0px) scale(0) rotate(${-180 - i * 30}deg)`;
        node.style.opacity = '0';
      }, delay);
    });

    this.backBtn.style.display = 'none';
    setTimeout(callback, nodes.length * 30 + 350);
  }

  createNode(item, type) {
    const node = document.createElement('div');
    Object.assign(node.style, {
      position: 'absolute',
      top: '50%', left: '50%',
      width: '72px', height: '72px',
      borderRadius: '50%',
      background: 'rgba(30, 25, 20, 0.85)',
      border: '2px solid rgba(255, 200, 100, 0.35)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      userSelect: 'none',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    });

    const icon = document.createElement('div');
    Object.assign(icon.style, {
      fontSize: '22px',
      lineHeight: '1',
    });
    icon.textContent = item.icon || '■';
    node.appendChild(icon);

    const label = document.createElement('div');
    Object.assign(label.style, {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: 'rgba(255,255,255,0.7)',
      marginTop: '3px',
      textAlign: 'center',
      lineHeight: '1.1',
      maxWidth: '66px',
      overflow: 'hidden',
    });
    label.textContent = item.label || item.name || item.id;
    node.appendChild(label);

    // Hover/active state
    node.addEventListener('pointerenter', () => {
      node.style.border = '2px solid rgba(255, 200, 100, 0.8)';
      node.style.transform = node.style.transform.replace('scale(1)', 'scale(1.12)');
    });
    node.addEventListener('pointerleave', () => {
      node.style.border = '2px solid rgba(255, 200, 100, 0.35)';
      node.style.transform = node.style.transform.replace('scale(1.12)', 'scale(1)');
    });

    // Click/tap handler
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.animating) return;

      if (type === 'category') {
        this.navigateInto(item);
      } else if (type === 'item') {
        this.selectItem(item);
      }
    };
    node.addEventListener('click', handler);
    node.addEventListener('touchend', handler);

    return node;
  }

  clearNodes() {
    for (const node of this.nodes) {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    this.nodes = [];
  }

  // ─── NAVIGATION ─────────────────────────────────────────────────

  navigateInto(category) {
    this.animating = true;
    this.selectedCategory = category;
    this.currentLevel = 'items';

    // Collapse current ring, then show items
    this.collapseRing(() => {
      const items = this.getItemsForCategory(category.id);
      this.showRing(items, 'item');
    });
  }

  navigateBack() {
    if (this.currentLevel === 'categories') {
      this.close();
      return;
    }

    this.animating = true;
    this.currentLevel = 'categories';
    this.selectedCategory = null;

    this.collapseRing(() => {
      this.showRing(this.categories, 'category');
    });
  }

  selectItem(item) {
    // Flash the node
    events.emit('menu:item_selected', item);

    // Specific actions based on category
    switch (this.selectedCategory?.id) {
      case 'weapons':
        events.emit('player:equip_weapon', item);
        break;
      case 'items':
        events.emit('item:used', item);
        break;
      case 'spells':
        events.emit('player:equip_spell', item);
        break;
    }

    // Close menu
    this.close();
  }

  // ─── DATA ───────────────────────────────────────────────────────

  getItemsForCategory(categoryId) {
    const inv = this.engine.inventory;
    const wpn = this.engine.weaponSystem;

    switch (categoryId) {
      case 'weapons':
        return (wpn?.weapons || []).map(w => ({
          id: w.id,
          name: w.name,
          icon: this.getWeaponIcon(w.id),
          label: w.name,
          data: w,
        }));

      case 'items':
        const items = [];
        if (inv) {
          for (const [id, item] of inv.items) {
            if (item.type === 'consumable' || item.type === 'misc') {
              items.push({
                id: item.id,
                name: item.name,
                icon: item.icon,
                label: `${item.name} ×${item.quantity}`,
                data: item,
              });
            }
          }
        }
        if (items.length === 0) items.push({ id: 'empty', name: 'Empty', icon: '—', label: 'No items' });
        return items;

      case 'spells':
        return [
          { id: 'fireball', name: 'Fireball', icon: '🔥', label: 'Fireball' },
          { id: 'icicle', name: 'Icicle', icon: '❄', label: 'Icicle' },
          { id: 'heal', name: 'Heal', icon: '💚', label: 'Heal' },
        ];

      case 'equipment':
        return [
          { id: 'slot_weapon', name: 'Weapon', icon: '⚔', label: wpn?.currentWeapon?.name || 'None' },
          { id: 'slot_armor', name: 'Armor', icon: '🛡', label: 'None' },
          { id: 'slot_ring', name: 'Ring', icon: '💍', label: 'None' },
          { id: 'slot_amulet', name: 'Amulet', icon: '📿', label: 'None' },
        ];

      case 'quests':
        return [
          { id: 'no_quests', name: 'No Quests', icon: '—', label: 'No active quests' },
        ];

      case 'settings':
        return [
          { id: 'hand_right', name: 'Right Hand', icon: '🤚', label: 'Right-handed' },
          { id: 'hand_left', name: 'Left Hand', icon: '🤚', label: 'Left-handed' },
          { id: 'save', name: 'Save Game', icon: '💾', label: 'Save' },
          { id: 'load', name: 'Load Game', icon: '📂', label: 'Load' },
        ];

      default:
        return [];
    }
  }

  getWeaponIcon(id) {
    const icons = {
      fist: '👊',
      sword: '⚔',
      fireball: '🔥',
      icicle: '❄',
      bow: '🏹',
    };
    return icons[id] || '⚔';
  }
}
