/**
 * 《千里江山 · 山海入画》界面交互与典藏长卷生成器 (UI & Ex-Libris Certificate)
 * 支持：双模 HUD 切换、神兽诗笺弹窗、宋代印章震鸣动效、全璧御览长卷 Canvas 导出
 */

import { BEASTS, SCENIC_SECTIONS } from './beasts.js';
import { audio } from './audio.js';

export class UIManager {
  constructor(appEl, options = {}) {
    this.appEl = appEl;
    this.onModeChange = options.onModeChange || (() => {});
    this.onJumpSection = options.onJumpSection || (() => {});
    this.onAwakenAction = options.onAwakenAction || (() => {});

    this.currentMode = 'scroll'; // 'scroll' | '3d'
    this.awakenedCount = 0;
    this.activeBeast = null;

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.appEl.innerHTML = `
      <!-- 顶栏古典 HUD -->
      <header class="sh-hud-top">
        <div class="hud-brand">
          <span class="hud-logo-seal">千里</span>
          <div class="hud-title-group">
            <h1 class="hud-title">千里江山 · 山海入画</h1>
            <span class="hud-sub">游目十二米青绿长卷 · 步入山河唤醒六方神兽</span>
          </div>
        </div>

        <div class="hud-status-group">
          <div class="hud-seal-badge" id="hud-badge">
            <span class="badge-dot"></span>
            已唤醒山海神兽 <b id="awakened-num">0</b> / 6
          </div>
          <button class="hud-btn hud-btn-mode" id="btn-mode-toggle" style="display:none;">
            <span class="btn-icon">卷</span> 出画还卷 (ESC)
          </button>
          <button class="hud-btn" id="btn-audio" title="静音/播放">
            <span class="btn-icon">琴</span> <span id="audio-text">乐起</span>
          </button>
          <button class="hud-btn" id="btn-guide" title="游历指引">
            <span class="btn-icon">鉴</span> 题记
          </button>
        </div>
      </header>

      <!-- 游目长卷底部进度导览轨 (Scroll Mode 专属) -->
      <nav class="sh-scroll-nav" id="scroll-nav">
        <div class="scroll-nav-track" id="nav-track">
          <div class="scroll-nav-thumb" id="nav-thumb"></div>
        </div>
        <div class="scroll-nav-seals" id="nav-seals">
          <!-- 动态渲染六段分卷与神兽印章节点 -->
        </div>
      </nav>

      <!-- 3D 漫步操作指引与准星 (3D Mode 专属) -->
      <div class="sh-3d-hud" id="hud-3d" style="display:none;">
        <div class="reticle-hint" id="reticle-hint">
          <div class="hint-key">E</div>
          <span class="hint-text">唤醒近旁神兽</span>
        </div>
        <div class="hud-scenic-title" id="scenic-title">卷一 · 桃溪浅滩</div>
        <div class="hud-controls-tip">
          <span>WASD / 方向键 移步</span> · <span>鼠标拖拽 游目四顾</span> · <span>ESC 出画还卷</span>
        </div>
        <button class="mobile-action-btn" id="mobile-e-btn">唤醒神兽 (E)</button>
      </div>

      <!-- 神兽唤醒诗笺弹窗 -->
      <div class="sh-modal-mask" id="beast-modal" style="display:none;">
        <div class="beast-card">
          <div class="beast-card-border"></div>
          <div class="beast-card-header">
            <span class="beast-seal-stamp" id="modal-seal">夫诸水魄</span>
            <div class="beast-name-wrap">
              <h2 class="beast-name" id="modal-name">夫诸</h2>
              <span class="beast-title" id="modal-title">飞瀑灵鹿 · 兆水之神</span>
            </div>
          </div>

          <div class="beast-quote-box">
            <div class="quote-source" id="modal-source">《山海经 · 中次三经》</div>
            <p class="quote-text" id="modal-quote"></p>
          </div>

          <div class="beast-reflection-box">
            <div class="reflection-label">岛主重构札记</div>
            <p class="reflection-text" id="modal-reflection"></p>
          </div>

          <div class="beast-mutation-badge" id="modal-mutation"></div>

          <div class="beast-card-footer">
            <button class="card-btn card-btn-roam" id="modal-btn-roam">继续画中漫步</button>
            <button class="card-btn card-btn-return" id="modal-btn-return">出画还卷 (看全貌)</button>
          </div>
        </div>
      </div>

      <!-- 终局全璧御览长卷藏书票弹窗 -->
      <div class="sh-modal-mask" id="certificate-modal" style="display:none;">
        <div class="cert-modal-box">
          <div class="cert-modal-header">
            <h3>千里江山 · 山海神兽全璧御览</h3>
            <span class="cert-sub">北宋政和三年王希孟笔意 · 岛主精神画廊典藏</span>
          </div>
          <div class="cert-canvas-wrap">
            <canvas id="cert-canvas" width="1200" height="420"></canvas>
          </div>
          <div class="cert-actions">
            <button class="card-btn card-btn-return" id="btn-download-cert">高清下载藏书长卷</button>
            <button class="card-btn card-btn-roam" id="btn-close-cert">重温万里江山</button>
          </div>
        </div>
      </div>

      <!-- 题记指引弹窗 -->
      <div class="sh-modal-mask" id="guide-modal" style="display:none;">
        <div class="guide-box">
          <h2>《千里江山 · 山海入画》题记</h2>
          <p>北宋政和三年，十八岁的王希孟作《千里江山图》，随即悄然隐没于岁月深处。后世盛赞其青绿重彩，却少有人知，他将《山海经》里那些古老灵兽封入万峰绝壁之间。</p>
          <div class="guide-steps">
            <div class="step-item"><b>一 · 游目长卷</b>：横向卷动十二米青绿山河，探寻隐于松涧云崖处的金色异象。</div>
            <div class="step-item"><b>二 · 推门入画</b>：点击异象无缝坠入三维青绿仙境，漫步于长桥、飞瀑与孤松之下。</div>
            <div class="step-item"><b>三 · 唤醒神灵</b>：靠近神兽按 E 键将其唤醒，使山川泛金，解锁山海原本与哲学札记。</div>
            <div class="step-item"><b>四 · 全璧长卷</b>：集齐六大神兽，天地共鸣，赐盖御览玺印并生成专属典藏长卷。</div>
          </div>
          <button class="card-btn card-btn-return" id="btn-close-guide" style="margin-top:20px;">展卷入画</button>
        </div>
      </div>
    `;

    this._renderNavSeals();
  }

  _renderNavSeals() {
    const sealsContainer = document.getElementById('nav-seals');
    sealsContainer.innerHTML = '';

    BEASTS.forEach((beast, idx) => {
      const item = document.createElement('div');
      item.className = 'nav-seal-node';
      item.dataset.beastId = beast.id;
      item.dataset.progress = beast.scrollProgress;
      item.style.left = `${beast.scrollProgress * 100}%`;

      item.innerHTML = `
        <span class="nav-seal-box">${beast.name[0]}</span>
        <span class="nav-seal-label">${beast.name}</span>
      `;

      item.addEventListener('click', () => {
        this.onJumpSection(beast.scrollProgress, beast.id);
      });

      sealsContainer.appendChild(item);
    });
  }

  _bindEvents() {
    // 静音切换
    document.getElementById('btn-audio').addEventListener('click', () => {
      const muted = audio.toggleMute();
      document.getElementById('audio-text').textContent = muted ? '寂然' : '乐起';
    });

    // 模式切换
    document.getElementById('btn-mode-toggle').addEventListener('click', () => {
      this.setMode('scroll');
      this.onModeChange('scroll');
    });

    // 题记指引
    document.getElementById('btn-guide').addEventListener('click', () => {
      document.getElementById('guide-modal').style.display = 'grid';
    });
    document.getElementById('btn-close-guide').addEventListener('click', () => {
      document.getElementById('guide-modal').style.display = 'none';
      audio.ensureContext();
      audio.playGuqinPluck(261.63, 3.5);
    });

    // 诗笺弹窗按钮
    document.getElementById('modal-btn-roam').addEventListener('click', () => {
      document.getElementById('beast-modal').style.display = 'none';
    });
    document.getElementById('modal-btn-return').addEventListener('click', () => {
      document.getElementById('beast-modal').style.display = 'none';
      this.setMode('scroll');
      this.onModeChange('scroll');
    });

    // 移动端唤醒按钮
    document.getElementById('mobile-e-btn').addEventListener('click', () => {
      this.onAwakenAction();
    });

    // 藏书票弹窗
    document.getElementById('btn-close-cert').addEventListener('click', () => {
      document.getElementById('certificate-modal').style.display = 'none';
    });
    document.getElementById('btn-download-cert').addEventListener('click', () => {
      this._downloadCert();
    });
  }

  setMode(mode, scenicTitle = '') {
    this.currentMode = mode;
    const btnToggle = document.getElementById('btn-mode-toggle');
    const scrollNav = document.getElementById('scroll-nav');
    const hud3D = document.getElementById('hud-3d');
    const scenicEl = document.getElementById('scenic-title');

    if (mode === '3d') {
      btnToggle.style.display = 'inline-flex';
      scrollNav.style.display = 'none';
      hud3D.style.display = 'block';
      if (scenicTitle) scenicEl.textContent = scenicTitle;
    } else {
      btnToggle.style.display = 'none';
      scrollNav.style.display = 'block';
      hud3D.style.display = 'none';
    }
  }

  updateScrollThumb(progress) {
    const thumb = document.getElementById('nav-thumb');
    if (thumb) {
      thumb.style.left = `${progress * 100}%`;
    }
  }

  // 显示神兽唤醒诗笺
  showBeastAwakened(beastData) {
    this.activeBeast = beastData;
    this.awakenedCount = Math.min(6, this.awakenedCount + 1);
    document.getElementById('awakened-num').textContent = this.awakenedCount;

    // 更新底部印章节点样式
    const sealNode = document.querySelector(`.nav-seal-node[data-beast-id="${beastData.id}"]`);
    if (sealNode) {
      sealNode.classList.add('is-awakened');
    }

    // 填充弹窗内容
    document.getElementById('modal-seal').textContent = beastData.sealText;
    document.getElementById('modal-name').textContent = beastData.name;
    document.getElementById('modal-title').textContent = beastData.title;
    document.getElementById('modal-source').textContent = beastData.classicSource;
    document.getElementById('modal-quote').textContent = beastData.classicQuote;
    document.getElementById('modal-reflection').textContent = beastData.reflection;
    document.getElementById('modal-mutation').innerHTML = `✨ <b>山川异变</b>：${beastData.mutationDesc}`;

    const modal = document.getElementById('beast-modal');
    modal.style.display = 'grid';

    // 若全部 6 尊神兽均已苏醒，延时弹出终极大成藏书票
    if (this.awakenedCount >= 6) {
      setTimeout(() => {
        this.generateCertificate();
      }, 3500);
    }
  }

  // 终局《千里江山 · 山海神兽全璧御览长卷》Canvas 生成
  generateCertificate() {
    const canvas = document.getElementById('cert-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 1. 宋代温润洒金绢底
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#EAE0C7');
    grad.addColorStop(0.5, '#E5D8BC');
    grad.addColorStop(1, '#DCCDB0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 金粉斑驳微点
    ctx.fillStyle = 'rgba(218, 165, 32, 0.25)';
    for (let i = 0; i < 180; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2.5 + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. 边框泥金勾边
    ctx.strokeStyle = '#9E7D46';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    // 3. 仿宋宣和长卷布局书法
    ctx.fillStyle = '#221E19';
    ctx.font = 'bold 36px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('千里江山 · 山海神兽全璧御览', w / 2, 78);

    ctx.font = '16px "Noto Serif SC", serif';
    ctx.fillStyle = '#63533E';
    ctx.fillText('北宋政和三年王希孟笔意 · 岛主精神画廊重构', w / 2, 114);

    // 4. 六方神兽印记并列
    const sealStartX = 180;
    const sealGap = (w - 360) / 5;
    BEASTS.forEach((beast, idx) => {
      const sx = sealStartX + idx * sealGap;
      const sy = 210;

      // 朱砂印
      ctx.fillStyle = '#A32924';
      ctx.fillRect(sx - 34, sy - 34, 68, 68);
      ctx.strokeStyle = '#7D1A16';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 34, sy - 34, 68, 68);

      ctx.font = 'bold 15px "Noto Serif SC", serif';
      ctx.fillStyle = '#FFF8EB';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(beast.sealText.slice(0, 2), sx, sy - 10);
      ctx.fillText(beast.sealText.slice(2, 4), sx, sy + 12);

      // 神兽名注
      ctx.font = '13px "Noto Serif SC", serif';
      ctx.fillStyle = '#42372A';
      ctx.fillText(beast.name, sx, sy + 58);
    });

    // 5. 天干地支与岛主私印
    const now = new Date();
    const dateStr = `岁次乙巳 · 金秋吉日 · 入画通神 · 岛主游戏匣子典藏`;
    ctx.font = '14px "Noto Serif SC", serif';
    ctx.fillStyle = '#78644D';
    ctx.textAlign = 'center';
    ctx.fillText(dateStr, w / 2, 360);

    // 双龙与岛主双印
    ctx.fillStyle = '#9C251F';
    ctx.fillRect(55, 45, 50, 50);
    ctx.font = 'bold 14px "Noto Serif SC", serif';
    ctx.fillStyle = '#FFF';
    ctx.fillText('御书', 80, 70);

    ctx.fillStyle = '#9C251F';
    ctx.fillRect(w - 105, h - 95, 52, 52);
    ctx.fillText('岛主', w - 79, h - 70);

    document.getElementById('certificate-modal').style.display = 'grid';
  }

  _downloadCert() {
    const canvas = document.getElementById('cert-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `千里江山_山海神兽全璧御览_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}
