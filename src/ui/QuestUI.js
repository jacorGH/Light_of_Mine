import { events } from '../engine/EventBus.js';

/**
 * QuestUI — Displays quest tracker (top-right) and notification banners.
 *
 * Tracker shows up to 3 active quests with objective progress.
 * Notifications appear for quest added, objective updated, and quest completed.
 */
export class QuestUI {
  constructor(engine) {
    this.engine = engine;
    this.activeQuests = [];

    this.createTracker();
    this.createNotificationContainer();

    // Subscribe to quest events
    events.on('quest:added', this.onQuestAdded, this);
    events.on('quest:objective_updated', this.onObjectiveUpdated, this);
    events.on('quest:ready', this.onQuestReady, this);
    events.on('quest:completed', this.onQuestCompleted, this);
  }

  /* ─── DOM Setup ──────────────────────────────────────────────────── */

  createTracker() {
    // Toggle button
    this.trackerToggle = document.createElement('div');
    Object.assign(this.trackerToggle.style, {
      position: 'fixed', top: '90px', left: '10px',
      width: '24px', height: '24px', borderRadius: '4px',
      background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,200,100,0.3)',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      zIndex: '801', cursor: 'pointer', fontSize: '12px',
    });
    this.trackerToggle.textContent = '📋';
    this.trackerToggle.addEventListener('click', () => { this.trackerVisible = !this.trackerVisible; this.tracker.style.display = this.trackerVisible ? 'block' : 'none'; });
    this.trackerToggle.addEventListener('touchend', (e) => { e.preventDefault(); this.trackerVisible = !this.trackerVisible; this.tracker.style.display = this.trackerVisible ? 'block' : 'none'; });
    document.body.appendChild(this.trackerToggle);

    this.trackerVisible = true;
    this.tracker = document.createElement('div');
    this.tracker.id = 'quest-tracker';
    Object.assign(this.tracker.style, {
      position: 'fixed',
      top: '90px',
      left: '38px',
      maxWidth: '180px',
      padding: '8px 10px',
      backgroundColor: 'rgba(10, 10, 20, 0.85)',
      border: '1px solid rgba(255, 200, 100, 0.2)',
      borderRadius: '6px',
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#e0e0e0',
      lineHeight: '1.4',
      zIndex: '800',
      pointerEvents: 'auto',
      display: 'none',
      cursor: 'pointer',
    });
    this.tracker.addEventListener('click', () => { this.trackerVisible = false; this.tracker.style.display = 'none'; });
    document.body.appendChild(this.tracker);
  }

  createNotificationContainer() {
    this.notifContainer = document.createElement('div');
    this.notifContainer.id = 'quest-notifications';
    Object.assign(this.notifContainer.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      zIndex: '900',
      pointerEvents: 'none'
    });
    document.body.appendChild(this.notifContainer);
  }

  /* ─── Event Handlers ─────────────────────────────────────────────── */

  onQuestAdded({ quest }) {
    // Add to active list (most recent first)
    this.activeQuests.unshift(quest);
    this.update();
    this.showNotification(`NEW QUEST: ${quest.title}`, '#ffd700', 3000);
  }

  onObjectiveUpdated({ questId, label, current, count }) {
    this.update();
    this.showNotification(`Objective updated: ${label} (${current}/${count})`, '#ffffff', 2000);
  }

  onQuestReady({ questId, quest }) {
    this.update();
    this.showNotification(`Quest ready to turn in: ${quest.title}`, '#87ceeb', 3000);
  }

  onQuestCompleted({ questId, quest }) {
    // Remove from active list
    this.activeQuests = this.activeQuests.filter(q => q.id !== questId);
    this.update();
    this.showNotification(`QUEST COMPLETE: ${quest.title}`, '#00ff88', 3000);
  }

  /* ─── Display Methods ────────────────────────────────────────────── */

  /**
   * Refresh the tracker display with current quest data.
   */
  update() {
    // Show max 3 quests
    const visible = this.activeQuests.slice(0, 3);

    if (visible.length === 0) {
      this.tracker.style.display = 'none';
      this.trackerToggle.style.display = 'none';
      return;
    }

    this.trackerToggle.style.display = 'flex';
    this.tracker.style.display = this.trackerVisible ? 'block' : 'none';

    let html = '';
    for (const quest of visible) {
      html += `<div style="margin-bottom: 8px;">`;
      html += `<div style="color: #ffd700; font-weight: bold; font-size: 14px;">${quest.title}</div>`;
      for (const obj of quest.objectives) {
        const complete = obj.current >= obj.count;
        const icon = complete ? '✓' : '○';
        const color = complete ? '#00ff88' : '#cccccc';
        html += `<div style="color: ${color}; margin-left: 8px;">  ${icon} ${obj.label} (${obj.current}/${obj.count})</div>`;
      }
      html += `</div>`;
    }

    this.tracker.innerHTML = html;
  }

  /**
   * Show a notification banner that fades out.
   * @param {string} text
   * @param {string} color
   * @param {number} duration - ms before fade
   */
  showNotification(text, color = '#ffffff', duration = 3000) {
    const notif = document.createElement('div');
    Object.assign(notif.style, {
      padding: '8px 20px',
      backgroundColor: 'rgba(10, 10, 20, 0.85)',
      border: `1px solid ${color}`,
      borderRadius: '4px',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '14px',
      fontWeight: 'bold',
      color: color,
      textAlign: 'center',
      whiteSpace: 'nowrap',
      opacity: '1',
      transition: 'opacity 0.5s ease-out'
    });
    notif.textContent = text;
    this.notifContainer.appendChild(notif);

    // Fade out and remove
    setTimeout(() => {
      notif.style.opacity = '0';
      setTimeout(() => {
        if (notif.parentNode) {
          notif.parentNode.removeChild(notif);
        }
      }, 500);
    }, duration);
  }
}
