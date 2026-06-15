import { events } from '../engine/EventBus.js';

/**
 * RadialMenu — Connected ring pause menu with rotating drill-in animation.
 * 
 * Visual: Nodes arranged in a circle, connected by lines forming a ring.
 * Interaction:
 *   - Long-press action button (mobile) or Tab/Esc (PC) to open
 *   - Tap/click a category → ring rotates and zooms as sub-items drill in
 *   - Tap center or swipe out → ring rotates back to categories
 *   - Tap an item → equip/use, menu closes
 * 
 * Animation: "Tumble ring" — nodes spin in from center on open,
 * drill-in rotates the ring 180° on Z while scaling categories down
 * and scaling items up from center.
 */
export class RadialMenu {
  constructor(engine) {
    this.engine = engine;
    this.isOpen = false;
    this.currentLevel = 'categories';
    this.selectedCategory = null;
    this.animating = false;

    this.categories = [
      { id: 'weapons', label: 'Weapons', icon: '⚔' },
      { id: 'items', label: 'Items', icon: '🧪' },
      { id: 'spells', label: 'Spells', icon: '✨' },
      { id: 'equipment', label: 'Equip', icon: '🛡' },
      { id: 'quests', label: 'Quests', icon: '📋' },
      { id: 'settings', label: 'Settings', icon: '⚙' },
    ];

    this.createDOM();
    this.setupInput();
  }

  // ─── DOM ────────────────────────────────────────────────────────

  createDOM() {
    // Backdrop
    this.backdrop = document.createElement('div');
    Object.assign(this.backdrop.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      zIndex: '5000', display: 'none', opacity: '0',
      transition: 'opacity 0.3s ease-out',
    });
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        if (this.currentLevel === 'items') this.navigateBack();
        else this.close();
      }
    });
    document.body.appendChild(this.backdrop);

    // Ring container (holds SVG ring + nodes)
    this.ringContainer = document.createElement('div');
    Object.assign(this.ringContainer.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%) scale(0) rotate(180deg)',
      width: '0', height: '0', zIndex: '5001',
      transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    document.body.appendChild(this.ringContainer);

    // SVG for connecting lines (ring segments)
    this.ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(this.ringSvg.style, {
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      overflow: 'visible', pointerEvents: 'none', zIndex: '5001',
    });
    this.ringSvg.setAttribute('width', '1');
    this.ringSvg.setAttribute('height', '1');
    this.ringContainer.appendChild(this.ringSvg);

    // Center back button
    this.centerBtn = document.createElement('div');
    Object.assign(this.centerBtn.style, {
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '44px', height: '44px', borderRadius: '50%',
      background: 'rgba(255,200,100,0.1)', border: '1.5px solid rgba(255,200,100,0.3)',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,200,100,0.7)', fontFamily: 'monospace', fontSize: '16px',
      cursor: 'pointer', zIndex: '5003',
    });
    this.centerBtn.textContent = '✕';
    this.centerBtn.addEventListener('click', () => this.navigateBack());
    this.centerBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.navigateBack(); });
    this.ringContainer.appendChild(this.centerBtn);

    // Pause button (top center, smaller — menu is now primarily via long-press)
    this.pauseBtn = document.createElement('div');
    Object.assign(this.pauseBtn.style, {
      position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
      width: '28px', height: '28px', borderRadius: '50%',
      border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)',
      zIndex: '1001', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: '12px',
      cursor: 'pointer',
    });
    this.pauseBtn.textContent = '⏸';
    this.pauseBtn.addEventListener('click', () => this.toggle());
    this.pauseBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.toggle(); });
    document.body.appendChild(this.pauseBtn);

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
    this.pauseBtn.textContent = '▶';

    requestAnimationFrame(() => {
      this.backdrop.style.opacity = '1';
      this.ringContainer.style.transform = 'translate(-50%, -50%) scale(1) rotate(0deg)';
      this.showRing(this.categories, 'category');
    });
  }

  close() {
    this.animating = true;
    this.pauseBtn.textContent = '⏸';

    // Collapse: scale down + rotate out
    this.ringContainer.style.transform = 'translate(-50%, -50%) scale(0) rotate(-180deg)';
    this.backdrop.style.opacity = '0';

    setTimeout(() => {
      this.backdrop.style.display = 'none';
      this.clearRing();
      this.centerBtn.style.display = 'none';
      this.isOpen = false;
      this.animating = false;
      events.emit('game:resumed');
    }, 400);
  }

  // ─── RING DISPLAY ───────────────────────────────────────────────

  showRing(items, type) {
    this.animating = true;
    this.clearRing();

    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.28;
    const count = items.length;

    // Draw connecting ring lines (SVG)
    this.drawRingLines(items, radius);

    // Create nodes
    items.forEach((item, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const node = this.createNode(item, type, x, y, i, count);
      this.ringContainer.appendChild(node);
      this.nodes.push(node);
    });

    // Show center back button on item level
    this.centerBtn.style.display = type === 'item' ? 'flex' : 'none';

    setTimeout(() => { this.animating = false; }, count * 60 + 350);
  }

  drawRingLines(items, radius) {
    // Clear existing lines
    while (this.ringSvg.firstChild) this.ringSvg.removeChild(this.ringSvg.firstChild);

    const count = items.length;
    for (let i = 0; i < count; i++) {
      const a1 = (i / count) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 1) / count) * Math.PI * 2 - Math.PI / 2;

      const x1 = Math.cos(a1) * radius;
      const y1 = Math.sin(a1) * radius;
      const x2 = Math.cos(a2) * radius;
      const y2 = Math.sin(a2) * radius;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', 'rgba(255, 200, 100, 0.25)');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4 4');

      // Animate line drawing
      line.style.opacity = '0';
      line.style.transition = `opacity 0.3s ease ${i * 40}ms`;
      this.ringSvg.appendChild(line);

      requestAnimationFrame(() => { line.style.opacity = '1'; });
    }
  }

  createNode(item, type, x, y, index, total) {
    const node = document.createElement('div');
    Object.assign(node.style, {
      position: 'absolute', top: '50%', left: '50%',
      width: '66px', height: '66px', borderRadius: '50%',
      background: 'rgba(25, 20, 15, 0.9)',
      border: '2px solid rgba(255, 200, 100, 0.35)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', userSelect: 'none',
      boxShadow: '0 2px 12px rgba(0,0,0,0.5), inset 0 0 8px rgba(255,200,100,0.05)',
      // Start from center, animate out
      transform: `translate(-50%, -50%) translate(0px, 0px) scale(0.3)`,
      opacity: '0',
      transition: `transform 0.35s cubic-bezier(0.34, 1.4, 0.64, 1) ${index * 50}ms, opacity 0.25s ease ${index * 50}ms, border-color 0.15s`,
    });

    const icon = document.createElement('div');
    icon.style.fontSize = '20px';
    icon.style.lineHeight = '1';
    icon.textContent = item.icon || '■';
    node.appendChild(icon);

    const label = document.createElement('div');
    Object.assign(label.style, {
      fontSize: '8px', fontFamily: 'monospace',
      color: 'rgba(255,255,255,0.65)', marginTop: '2px',
      textAlign: 'center', maxWidth: '60px', overflow: 'hidden',
      whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    });
    label.textContent = item.label || item.name || item.id;
    node.appendChild(label);

    // Animate to final position
    requestAnimationFrame(() => {
      node.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(1)`;
      node.style.opacity = '1';
    });

    // Hover
    node.addEventListener('pointerenter', () => {
      node.style.borderColor = 'rgba(255, 200, 100, 0.9)';
      node.style.boxShadow = '0 2px 16px rgba(255,180,50,0.3), inset 0 0 12px rgba(255,200,100,0.1)';
    });
    node.addEventListener('pointerleave', () => {
      node.style.borderColor = 'rgba(255, 200, 100, 0.35)';
      node.style.boxShadow = '0 2px 12px rgba(0,0,0,0.5), inset 0 0 8px rgba(255,200,100,0.05)';
    });

    // Click/tap
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.animating) return;
      if (type === 'category') this.navigateInto(item);
      else this.selectItem(item);
    };
    node.addEventListener('click', handler);
    node.addEventListener('touchend', handler);

    return node;
  }

  clearRing() {
    for (const node of this.nodes) {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    this.nodes = [];
    while (this.ringSvg.firstChild) this.ringSvg.removeChild(this.ringSvg.firstChild);
  }

  // ─── NAVIGATION (rotating drill-in) ─────────────────────────────

  navigateInto(category) {
    this.animating = true;
    this.selectedCategory = category;
    this.currentLevel = 'items';

    // Rotate the ring container 180° as it transitions
    this.ringContainer.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    this.ringContainer.style.transform = 'translate(-50%, -50%) scale(0.3) rotate(180deg)';

    setTimeout(() => {
      this.clearRing();
      // Reset rotation for new ring, then animate in
      this.ringContainer.style.transition = 'none';
      this.ringContainer.style.transform = 'translate(-50%, -50%) scale(0.3) rotate(-90deg)';

      requestAnimationFrame(() => {
        this.ringContainer.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.4, 0.64, 1)';
        this.ringContainer.style.transform = 'translate(-50%, -50%) scale(1) rotate(0deg)';
        const items = this.getItemsForCategory(category.id);
        this.showRing(items, 'item');
      });
    }, 500);
  }

  navigateBack() {
    if (this.currentLevel === 'categories') {
      this.close();
      return;
    }

    this.animating = true;
    this.currentLevel = 'categories';
    this.selectedCategory = null;

    // Reverse rotation
    this.ringContainer.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    this.ringContainer.style.transform = 'translate(-50%, -50%) scale(0.3) rotate(-180deg)';

    setTimeout(() => {
      this.clearRing();
      this.ringContainer.style.transition = 'none';
      this.ringContainer.style.transform = 'translate(-50%, -50%) scale(0.3) rotate(90deg)';

      requestAnimationFrame(() => {
        this.ringContainer.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.4, 0.64, 1)';
        this.ringContainer.style.transform = 'translate(-50%, -50%) scale(1) rotate(0deg)';
        this.showRing(this.categories, 'category');
      });
    }, 500);
  }

  selectItem(item) {
    events.emit('menu:item_selected', item);

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

    this.close();
  }

  // ─── DATA ───────────────────────────────────────────────────────

  getItemsForCategory(categoryId) {
    const inv = this.engine.inventory;
    const wpn = this.engine.weaponSystem;

    switch (categoryId) {
      case 'weapons':
        // Physical weapons only (fist, sword, bow)
        return (wpn?.physicalWeapons || []).map(w => ({
          id: w.id, name: w.name, icon: this.getWeaponIcon(w.id), label: w.name, data: w,
        }));
      case 'items': {
        const items = [];
        if (inv) {
          for (const [id, item] of inv.items) {
            if (item.type === 'consumable' || item.type === 'misc') {
              items.push({ id: item.id, name: item.name, icon: item.icon, label: `${item.name} ×${item.quantity}`, data: item });
            }
          }
        }
        return items.length ? items : [{ id: 'empty', name: 'Empty', icon: '—', label: 'No items' }];
      }
      case 'spells':
        // Magic spells only (fireball, icicle, heal)
        return (wpn?.spells || []).map(s => ({
          id: s.id, name: s.name, icon: this.getWeaponIcon(s.id), label: s.name, data: s,
        }));
      case 'equipment':
        return [
          { id: 'slot_weapon', name: 'Weapon', icon: '⚔', label: wpn?.currentWeapon?.name || 'None' },
          { id: 'slot_spell', name: 'Spell', icon: '✨', label: wpn?.currentSpell?.name || 'None' },
          { id: 'slot_armor', name: 'Armor', icon: '🛡', label: 'None' },
          { id: 'slot_ring', name: 'Ring', icon: '💍', label: 'None' },
        ];
      case 'quests': {
        const qs = this.engine.questSystem;
        if (qs && qs.quests.size > 0) {
          const list = [];
          for (const [id, q] of qs.quests) {
            list.push({ id, name: q.title, icon: '📜', label: q.title });
          }
          return list;
        }
        return [{ id: 'no_quests', name: 'No Quests', icon: '—', label: 'No active quests' }];
      }
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
    return { fist: '👊', sword: '⚔', fireball: '🔥', icicle: '❄', bow: '🏹', heal: '💚' }[id] || '⚔';
  }
}
