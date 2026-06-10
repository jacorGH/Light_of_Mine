import { events } from '../engine/EventBus.js';

/**
 * DialogueUI — DOM-based dialogue display overlay.
 *
 * Shows an NPC dialogue panel at the bottom of the screen with:
 * - NPC name in gold text
 * - Typewriter text effect (~30 chars/sec)
 * - Choice buttons with gold borders
 * - Slide-up/slide-down CSS transitions
 * - Click/tap to skip typewriter
 * - Mobile-friendly sizing
 */
export class DialogueUI {
  constructor(engine) {
    this.engine = engine;
    this.isVisible = false;
    this.isTyping = false;
    this.typewriterTimer = null;
    this.fullText = '';
    this.currentCharIndex = 0;
    this.choices = [];

    // Callbacks
    this.onChoiceSelected = null; // (choiceIndex) => {}
    this.onContinue = null;      // () => {}

    // Typewriter config
    this.charsPerSecond = 30;

    // Create DOM
    this.createDOM();
  }

  // ─── DOM CREATION ───────────────────────────────────────────────

  createDOM() {
    // Backdrop (top portion dims slightly)
    this.backdrop = document.createElement('div');
    Object.assign(this.backdrop.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.3)',
      zIndex: '6000',
      opacity: '0',
      transition: 'opacity 0.3s ease-out',
      pointerEvents: 'none',
    });
    document.body.appendChild(this.backdrop);

    // Main panel (bottom of screen)
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      right: '0',
      height: '35vh',
      minHeight: '200px',
      maxHeight: '320px',
      background: 'rgba(26, 21, 16, 0.92)',
      borderTop: '2px solid rgba(255, 204, 102, 0.4)',
      zIndex: '6001',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 20px 12px',
      boxSizing: 'border-box',
      transform: 'translateY(100%)',
      transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      fontFamily: "'Courier New', monospace",
      overflow: 'hidden',
    });
    document.body.appendChild(this.panel);

    // NPC Name
    this.nameEl = document.createElement('div');
    Object.assign(this.nameEl.style, {
      color: '#ffcc66',
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '8px',
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
      flexShrink: '0',
    });
    this.panel.appendChild(this.nameEl);

    // Text area (holds dialogue text, clickable to skip typewriter)
    this.textArea = document.createElement('div');
    Object.assign(this.textArea.style, {
      color: '#e8dcc8',
      fontSize: '15px',
      lineHeight: '1.5',
      flex: '1',
      overflow: 'auto',
      cursor: 'pointer',
      userSelect: 'none',
      paddingRight: '8px',
      minHeight: '40px',
    });
    this.textArea.addEventListener('click', () => this.onTextClick());
    this.textArea.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onTextClick();
    });
    this.panel.appendChild(this.textArea);

    // Choices container
    this.choicesContainer = document.createElement('div');
    Object.assign(this.choicesContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      marginTop: '10px',
      flexShrink: '0',
      maxHeight: '45%',
      overflowY: 'auto',
    });
    this.panel.appendChild(this.choicesContainer);
  }

  // ─── SHOW / HIDE ───────────────────────────────────────────────

  show(npcName, text, choices) {
    this.fullText = text;
    this.choices = choices || [];
    this.currentCharIndex = 0;
    this.isVisible = true;

    // Set NPC name
    this.nameEl.textContent = npcName;

    // Clear previous
    this.textArea.textContent = '';
    this.clearChoices();
    this.stopTypewriter();

    // Slide panel up
    this.backdrop.style.opacity = '1';
    this.panel.style.transform = 'translateY(0)';

    // Start typewriter after panel slides in
    setTimeout(() => {
      this.startTypewriter();
    }, 100);
  }

  hide(callback) {
    this.isVisible = false;
    this.stopTypewriter();

    // Slide panel down
    this.panel.style.transform = 'translateY(100%)';
    this.backdrop.style.opacity = '0';

    setTimeout(() => {
      if (callback) callback();
    }, 350);
  }

  destroy() {
    this.stopTypewriter();

    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }

    this.backdrop = null;
    this.panel = null;
    this.nameEl = null;
    this.textArea = null;
    this.choicesContainer = null;
    this.onChoiceSelected = null;
    this.onContinue = null;
  }

  // ─── TYPEWRITER EFFECT ──────────────────────────────────────────

  startTypewriter() {
    this.isTyping = true;
    this.currentCharIndex = 0;
    this.textArea.textContent = '';

    const msPerChar = 1000 / this.charsPerSecond;
    let lastTime = performance.now();

    const tick = (now) => {
      if (!this.isTyping) return;

      const elapsed = now - lastTime;

      if (elapsed >= msPerChar) {
        const charsToAdd = Math.floor(elapsed / msPerChar);
        const end = Math.min(this.currentCharIndex + charsToAdd, this.fullText.length);

        this.textArea.textContent = this.fullText.substring(0, end);
        this.currentCharIndex = end;
        lastTime = now - (elapsed % msPerChar);

        if (this.currentCharIndex >= this.fullText.length) {
          this.finishTypewriter();
          return;
        }
      }

      this.typewriterTimer = requestAnimationFrame(tick);
    };

    this.typewriterTimer = requestAnimationFrame(tick);
  }

  stopTypewriter() {
    this.isTyping = false;
    if (this.typewriterTimer) {
      cancelAnimationFrame(this.typewriterTimer);
      this.typewriterTimer = null;
    }
  }

  skipTypewriter() {
    this.stopTypewriter();
    this.textArea.textContent = this.fullText;
    this.currentCharIndex = this.fullText.length;
    this.finishTypewriter();
  }

  finishTypewriter() {
    this.isTyping = false;
    this.showChoices();
  }

  // ─── TEXT CLICK ─────────────────────────────────────────────────

  onTextClick() {
    if (this.isTyping) {
      // Skip to full text
      this.skipTypewriter();
    } else if (this.choices.length === 0) {
      // No choices — treat as "continue" / end
      if (this.onContinue) {
        this.onContinue();
      }
    }
  }

  // ─── CHOICES ────────────────────────────────────────────────────

  showChoices() {
    this.clearChoices();

    if (this.choices.length === 0) {
      // Show a "Continue..." prompt
      const continueBtn = this.createChoiceButton('Continue...', -1);
      this.choicesContainer.appendChild(continueBtn);
      return;
    }

    this.choices.forEach((choice, index) => {
      const btn = this.createChoiceButton(`${index + 1}. ${choice.text}`, index);
      this.choicesContainer.appendChild(btn);
    });
  }

  createChoiceButton(text, index) {
    const btn = document.createElement('div');
    Object.assign(btn.style, {
      padding: '10px 14px',
      border: '1px solid rgba(255, 204, 102, 0.4)',
      borderRadius: '4px',
      color: '#ffcc66',
      fontSize: '13px',
      fontFamily: "'Courier New', monospace",
      cursor: 'pointer',
      userSelect: 'none',
      transition: 'background 0.15s, border-color 0.15s',
      background: 'rgba(255, 204, 102, 0.05)',
    });

    btn.textContent = text;

    // Hover styles
    btn.addEventListener('pointerenter', () => {
      btn.style.background = 'rgba(255, 204, 102, 0.15)';
      btn.style.borderColor = 'rgba(255, 204, 102, 0.8)';
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.background = 'rgba(255, 204, 102, 0.05)';
      btn.style.borderColor = 'rgba(255, 204, 102, 0.4)';
    });

    // Click/tap handler
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (index === -1) {
        // Continue button
        if (this.onContinue) {
          this.onContinue();
        }
      } else {
        // Choice selected
        if (this.onChoiceSelected) {
          this.onChoiceSelected(index);
        }
      }
    };

    btn.addEventListener('click', handler);
    btn.addEventListener('touchend', handler);

    return btn;
  }

  clearChoices() {
    while (this.choicesContainer && this.choicesContainer.firstChild) {
      this.choicesContainer.removeChild(this.choicesContainer.firstChild);
    }
  }
}
