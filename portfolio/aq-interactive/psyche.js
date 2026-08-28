/**
 * 未庄 · 阿Q精神胜利法心理防御可视化系统 (Ah Q's Psychological Defense Visualizer)
 * 将鲁迅笔下阿Q“受辱 -> 心理受挫 -> 自欺转进 -> 精神胜利挺胸”的三段式心理过程完全视觉化与动效化。
 */

export class AhQPsycheEngine {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.actorEl = null;
    this.bubbleContainer = null;
    this.isAnimating = false;

    this.victoryQuotes = [
      {
        thought: "我总算被儿子打了，现在这世界真不像样……儿子打老子，反了反了！",
        banner: "儿子打老子！",
      },
      {
        thought: "我们先前——比你阔的多啦！你算是什么东西！",
        banner: "先前比你阔！",
      },
      {
        thought: "能自轻自贱的也是‘第一个’。除了自轻自贱不算，余下的不就是‘第一个’么！",
        banner: "状元也是第一！",
      },
      {
        thought: "杀！杀！把赵家、钱家、假洋鬼子全杀了！未庄的皮袍、箱子随我挑！",
        banner: "造反了！",
      },
      {
        thought: "得胜的猫儿欢似虎……这一回我又赢了！",
        banner: "精神全胜！",
      }
    ];
  }

  init() {
    this.actorEl = document.getElementById('paint-aq');
    this._createPsycheDOM();
  }

  _createPsycheDOM() {
    if (!this.actorEl) return;
    let overlay = this.actorEl.querySelector('.psyche-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'psyche-overlay';
      overlay.innerHTML = `
        <div class="psyche-halo" aria-hidden="true"></div>
        <div class="psyche-quote" id="psyche-quote-bubble" hidden>
          <span class="quote-text">儿子打老子！</span>
        </div>
      `;
      this.actorEl.appendChild(overlay);
    }
    this.bubbleContainer = overlay;
  }

  /**
   * 触发阿Q的精神胜利法三段式演化动效
   * @param {string} cause 触发诱因描述
   * @param {number} customIndex 指定语录索引
   */
  triggerVictory(cause = '被取笑', customIndex = -1) {
    if (this.isAnimating || !this.actorEl) return;
    this.isAnimating = true;

    const quote = customIndex >= 0 && customIndex < this.victoryQuotes.length
      ? this.victoryQuotes[customIndex]
      : this.victoryQuotes[Math.floor(Math.random() * this.victoryQuotes.length)];

    const bubble = this.actorEl.querySelector('#psyche-quote-bubble');
    const halo = this.actorEl.querySelector('.psyche-halo');
    const quoteText = this.actorEl.querySelector('.quote-text');

    // === 阶段一：受挫打击 (0ms ~ 600ms) ===
    this.actorEl.classList.add('is-shocked');
    if (this.audio) this.audio.playConflictHit();

    setTimeout(() => {
      // === 阶段二：心理转进，金色光晕扩散与浮空大字 (600ms ~ 2400ms) ===
      this.actorEl.classList.remove('is-shocked');
      this.actorEl.classList.add('is-triumphing');

      if (quoteText) quoteText.textContent = quote.banner;
      if (bubble) bubble.hidden = false;
      if (this.audio) this.audio.playPsycheVictory();

      // 展示全屏/视口原著内心独白飘带
      this._showNarrativeBanner(quote.thought);

      setTimeout(() => {
        // === 阶段三：彻底胜利，昂首挺胸 (2400ms ~ 3800ms) ===
        this.actorEl.classList.remove('is-triumphing');
        this.actorEl.classList.add('is-victorious');

        setTimeout(() => {
          // 恢复常态
          this.actorEl.classList.remove('is-victorious');
          if (bubble) bubble.hidden = true;
          this.isAnimating = false;
        }, 1400);

      }, 1800);

    }, 600);
  }

  _showNarrativeBanner(thoughtText) {
    let banner = document.getElementById('psyche-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'psyche-banner';
      banner.className = 'psyche-banner';
      banner.setAttribute('aria-live', 'polite');
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <span class="banner-seal">胜</span>
      <div class="banner-body">
        <strong>阿Q心想：</strong>
        <p>“${thoughtText}”</p>
      </div>
    `;
    banner.classList.add('is-active');

    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      banner.classList.remove('is-active');
    }, 3800);
  }
}
