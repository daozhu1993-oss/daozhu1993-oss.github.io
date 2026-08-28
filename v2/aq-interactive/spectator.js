/**
 * 未庄 · 看客行为与道德量化系统 (Spectator Agency & Moral System)
 * 记录玩家在未庄的每一次凝视、起哄、冷笑与沉默，赋予看客行为以沉重文学分量。
 */

export class SpectatorSystem {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.stats = {
      startTime: Date.now(),
      watchedCount: 0,
      cheerCount: 0,
      sneerCount: 0,
      silenceCount: 0,
      provokeCount: 0,
      dialogueCount: 0,
      placesVisited: new Set(['shrine']),
      witnessedEvents: [],
    };
    this.currentConfrontation = null;
    this.wheelElement = null;
    this.hudElement = null;
    this._listeners = new Set();
  }

  init() {
    this.hudElement = document.getElementById('watcher-hud');
    this.hudCount = document.getElementById('watcher-count');
    this._createReactionWheelDOM();
    this.updateHUD();
  }

  onAction(callback) {
    this._listeners.add(callback);
  }

  _notify(action, data) {
    this._listeners.forEach(cb => cb(action, data));
  }

  recordVisit(placeId) {
    this.stats.placesVisited.add(placeId);
  }

  recordDialogue() {
    this.stats.dialogueCount++;
  }

  _createReactionWheelDOM() {
    let container = document.getElementById('spectator-wheel');
    if (!container) {
      container = document.createElement('div');
      container.id = 'spectator-wheel';
      container.className = 'spectator-wheel';
      container.hidden = true;
      container.setAttribute('aria-label', '看客反应轮');
      container.innerHTML = `
        <div class="wheel-backdrop"></div>
        <div class="wheel-panel">
          <div class="wheel-header">
            <span class="wheel-kicker">看客立场 · 现场冲突</span>
            <strong class="wheel-title" id="wheel-confrontation-title">围观冲突</strong>
            <p class="wheel-sub" id="wheel-confrontation-sub">周围的人都在看着，你要……</p>
          </div>
          <div class="wheel-actions">
            <button type="button" class="wheel-btn btn-cheer" data-action="cheer">
              <span class="btn-icon">🗣️</span>
              <b>大声起哄</b>
              <small>叫好助威，激化场面</small>
            </button>
            <button type="button" class="wheel-btn btn-sneer" data-action="sneer">
              <span class="btn-icon">😏</span>
              <b>冷笑一声</b>
              <small>随声附和，轻蔑旁观</small>
            </button>
            <button type="button" class="wheel-btn btn-silence" data-action="silence">
              <span class="btn-icon">🤫</span>
              <b>别过头去</b>
              <small>置身事外，一声不吭</small>
            </button>
            <button type="button" class="wheel-btn btn-provoke" data-action="provoke">
              <span class="btn-icon">🔥</span>
              <b>添油加醋</b>
              <small>翻出旧账，戳人痛处</small>
            </button>
          </div>
          <button type="button" class="wheel-close" id="wheel-close-btn">走开</button>
        </div>
      `;
      document.body.appendChild(container);

      // Event binding
      container.querySelectorAll('.wheel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const action = btn.getAttribute('data-action');
          this.executeAction(action);
        });
      });

      const closeBtn = container.querySelector('#wheel-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          this.executeAction('silence');
        });
      }
    }
    this.wheelElement = container;
  }

  showReactionWheel(confrontation) {
    this.currentConfrontation = confrontation;
    if (!this.wheelElement) this._createReactionWheelDOM();

    const titleEl = document.getElementById('wheel-confrontation-title');
    const subEl = document.getElementById('wheel-confrontation-sub');

    if (titleEl) titleEl.textContent = confrontation.title || '街头龃龉';
    if (subEl) subEl.textContent = confrontation.description || '未庄的眼睛都聚了过来。';

    this.wheelElement.hidden = false;
    this.wheelElement.classList.add('is-active');
  }

  hideReactionWheel() {
    if (this.wheelElement) {
      this.wheelElement.classList.remove('is-active');
      this.wheelElement.hidden = true;
    }
    this.currentConfrontation = null;
  }

  executeAction(actionType) {
    const conf = this.currentConfrontation || { title: '街巷风波', target: 'aq' };
    this.stats.watchedCount++;

    let toastText = '';
    let logEntry = {
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      title: conf.title,
      action: actionType,
    };

    if (actionType === 'cheer') {
      this.stats.cheerCount++;
      toastText = '你大声叫了声好，街坊们哄堂大笑。';
      if (this.audio) this.audio.playTavernClink();
      logEntry.comment = '起哄喝彩，推波助澜';
    } else if (actionType === 'sneer') {
      this.stats.sneerCount++;
      toastText = '你从鼻子里冷哼了一声，阿Q扭头瞪了你一眼。';
      if (this.audio) this.audio.playBrushStroke();
      logEntry.comment = '冷眼旁观，不屑一顾';
    } else if (actionType === 'silence') {
      this.stats.silenceCount++;
      toastText = '你悄悄往后退了半步，假装看天。';
      logEntry.comment = '袖手旁观，明哲保身';
    } else if (actionType === 'provoke') {
      this.stats.provokeCount++;
      toastText = '你提起了他的痛处，场面顿时不可收拾！';
      if (this.audio) this.audio.playConflictHit();
      logEntry.comment = '揭人短处，火上浇油';
    }

    this.stats.witnessedEvents.push(logEntry);
    this.hideReactionWheel();
    this.updateHUD();

    // Trigger visual toast
    this._showSpectatorToast(toastText);

    // Notify listeners (such as psyche engine)
    this._notify('spectator-choice', {
      action: actionType,
      confrontation: conf,
      log: logEntry
    });
  }

  _showSpectatorToast(text) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = text;
      toast.hidden = false;
      toast.classList.add('is-visible');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
        toast.hidden = true;
      }, 3200);
    }
  }

  updateHUD() {
    if (!this.hudElement) {
      this.hudElement = document.getElementById('watcher-hud');
      this.hudCount = document.getElementById('watcher-count');
    }
    if (this.hudElement) {
      this.hudElement.hidden = false;
    }
    if (this.hudCount) {
      const parts = [];
      if (this.stats.cheerCount > 0) parts.push(`${this.stats.cheerCount}起哄`);
      if (this.stats.sneerCount > 0) parts.push(`${this.stats.sneerCount}冷笑`);
      if (this.stats.provokeCount > 0) parts.push(`${this.stats.provokeCount}添油`);
      if (this.stats.silenceCount > 0) parts.push(`${this.stats.silenceCount}沉默`);

      if (parts.length === 0) {
        this.hudCount.textContent = `你在看 · 0 次表态`;
      } else {
        this.hudCount.textContent = `你在看 · ${parts.join(' · ')}`;
      }
    }
  }

  getPersonaTitle() {
    const { cheerCount, sneerCount, silenceCount, provokeCount } = this.stats;
    const total = cheerCount + sneerCount + silenceCount + provokeCount;
    if (total === 0) return '初来乍到的生面孔';
    if (provokeCount >= cheerCount && provokeCount >= sneerCount && provokeCount >= silenceCount) {
      return '煽风点火的闲汉';
    }
    if (cheerCount >= sneerCount && cheerCount >= silenceCount) {
      return '喜闻乐见的起哄者';
    }
    if (sneerCount >= silenceCount) {
      return '自诩清醒的冷笑客';
    }
    return '事不关己的未庄看客';
  }

  getSummaryStats() {
    const minutes = Math.max(1, Math.round((Date.now() - this.stats.startTime) / 60000));
    return {
      ...this.stats,
      durationMinutes: minutes,
      persona: this.getPersonaTitle(),
    };
  }
}
