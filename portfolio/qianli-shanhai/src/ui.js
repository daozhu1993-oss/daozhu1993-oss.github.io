/**
 * 《千里江山 · 山海入画》界面交互与典藏长卷生成器 (UI & Handscroll Ex-Libris Engine)
 * 纯代码实现：
 * 1. 【借笔还魂】序幕入画仪式 (Prologue Intro)
 * 2. 3D 漫步 HUD、山海司南罗盘 (Compass) 与神兽接近提笔交互
 * 3. 移动端虚拟摇杆与触控按键
 * 4. 【十八岁少年借笔还魂札记】诗笺弹窗
 * 5. 十二米真迹长卷全景画轴抽屉与神行传送 (Teleport)
 * 6. 终局大成藏书票 Canvas 生成器
 */

import { BEASTS, SCENIC_SECTIONS, STORY_PROLOGUE } from './beasts.js';
import { audio } from './audio.js';

export class UIManager {
  constructor(appEl, options = {}) {
    this.appEl = appEl;
    this.onAwakenAction = options.onAwakenAction || (() => {});
    this.onTeleport = options.onTeleport || (() => {});
    this.onToggleScroll = options.onToggleScroll || (() => {});
    this.onVirtualMove = options.onVirtualMove || (() => {});

    this.awakenedCount = 0;
    this.activeBeast = null;
    this.isScrollDrawerOpen = false;
    this.awakenedMap = {};
    BEASTS.forEach(b => { this.awakenedMap[b.id] = false; });

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.appEl.innerHTML = `
      <!-- ================= 1. 开屏序幕：【借笔还魂 · 展卷入画】 ================= -->
      <div class="sh-prologue-mask" id="prologue-mask">
        <div class="prologue-scroll-card">
          <div class="prologue-border"></div>
          <div class="prologue-header">
            <span class="prologue-seal">借笔还魂</span>
            <h2 class="prologue-title">${STORY_PROLOGUE.title}</h2>
            <span class="prologue-sub">${STORY_PROLOGUE.subheading}</span>
          </div>

          <div class="prologue-body">
            ${STORY_PROLOGUE.paragraphs.map(p => `<p class="prologue-p">${p}</p>`).join('')}
          </div>

          <div class="prologue-footer">
            <button class="prologue-start-btn" id="btn-start-game">
              <span class="btn-seal-icon">印</span> ${STORY_PROLOGUE.callToAction}
            </button>
            <span class="prologue-tip">点击展卷 · 佩戴耳机聆听古琴声景更佳</span>
          </div>
        </div>
      </div>

      <!-- ================= 2. 3D 画中漫步主界面 HUD ================= -->
      <div class="sh-hud-layer" id="main-hud">
        <!-- 顶栏古典 HUD -->
        <header class="sh-hud-top">
          <div class="hud-brand">
            <span class="hud-logo-seal">希孟</span>
            <div class="hud-title-group">
              <h1 class="hud-title">千里江山 · 借笔还魂</h1>
              <span class="hud-sub">漫步青绿画境 · 唤醒山海神兽</span>
            </div>
          </div>

          <!-- 山海司南罗盘 (指示六方神兽方向与步距) -->
          <div class="hud-compass-bar" id="compass-bar" title="山海司南方位仪">
            <span class="compass-label">司南</span>
            <div class="compass-track" id="compass-track">
              <!-- 动态指示当前视野内的神兽符号 -->
            </div>
          </div>

          <div class="hud-status-group">
            <div class="hud-seal-badge" id="hud-badge">
              <span class="badge-dot"></span>
              已唤醒神兽 <b id="awakened-num">0</b> / 6
            </div>

            <button class="hud-btn hud-btn-gold" id="btn-open-scroll" title="随时展开十二米故宫真迹长卷全图 (M)">
              <span class="btn-icon">卷</span> 展卷御览 (M)
            </button>

            <button class="hud-btn" id="btn-audio" title="静音/播放古乐">
              <span class="btn-icon">琴</span> <span id="audio-text">乐起</span>
            </button>

            <button class="hud-btn" id="btn-guide" title="重温借笔还魂故事">
              <span class="btn-icon">鉴</span> 题记
            </button>
          </div>
        </header>

        <!-- 屏幕中央准星与接近提笔提示 -->
        <div class="sh-reticle-wrap" id="reticle-wrap">
          <div class="center-crosshair"></div>
          <div class="beast-approach-prompt" id="approach-prompt" style="display:none;">
            <div class="prompt-seal-box">
              <span class="prompt-seal-icon">提笔</span>
              <div class="prompt-text-group">
                <div class="prompt-action">按 E 键 或 点击唤醒</div>
                <div class="prompt-name" id="approach-beast-name">夫诸 · 水魄灵鹿</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部轻提示与操作说明 -->
        <div class="sh-controls-dock">
          <div class="dock-pill">
            <span class="key-tag">WASD / 方向键</span> 漫步 ·
            <span class="key-tag">Shift</span> 疾行 ·
            <span class="key-tag">Space</span> 轻跃 ·
            <span class="key-tag">鼠标拖拽</span> 游目 ·
            <span class="key-tag">E</span> 提笔唤醒 ·
            <span class="key-tag">M</span> 展卷全景
          </div>
        </div>

        <!-- 移动端虚拟摇杆与触屏交互按钮 -->
        <div class="sh-mobile-controls" id="mobile-controls">
          <div class="virtual-joystick" id="virtual-joystick">
            <div class="joystick-knob" id="joystick-knob"></div>
          </div>
          <button class="mobile-action-btn" id="mobile-e-btn">
            <span class="m-icon">笔</span>
            <span>提笔唤醒</span>
          </button>
        </div>
      </div>

      <!-- ================= 3. 神兽唤醒【十八岁少年借笔还魂札记】诗笺弹窗 ================= -->
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
            <div class="reflection-label">十八岁少年王希孟 · 借笔还魂札记</div>
            <p class="reflection-text" id="modal-reflection"></p>
          </div>

          <div class="beast-mutation-badge" id="modal-mutation"></div>

          <div class="beast-card-footer">
            <button class="card-btn card-btn-roam" id="modal-btn-roam">继续山河漫步</button>
            <button class="card-btn card-btn-return" id="modal-btn-view-scroll">查验十二米长卷</button>
          </div>
        </div>
      </div>

      <!-- ================= 4. 十二米真迹画卷全景抽屉 (随时呼出/神行传送) ================= -->
      <div class="sh-scroll-drawer" id="scroll-drawer" style="display:none;">
        <div class="drawer-header">
          <div class="drawer-title-group">
            <h3>北宋故宫珍藏《千里江山图》十二米真迹全卷</h3>
            <span class="drawer-sub">点击画中已苏醒的神兽御印，可【神行传送】直抵胜境</span>
          </div>
          <button class="drawer-close-btn" id="btn-close-scroll">
            <span>✕</span> 出画还境 (ESC / M)
          </button>
        </div>
        <div class="drawer-canvas-container" id="drawer-canvas-container">
          <!-- 挂载长卷视口容器 -->
        </div>
        <div class="drawer-footer">
          <div class="drawer-seals-list" id="drawer-seals-list">
            <!-- 渲染 6 尊神兽印记状态与快速传送按钮 -->
          </div>
        </div>
      </div>

      <!-- ================= 5. 终局《千里江山 · 全璧御览》藏书票弹窗 ================= -->
      <div class="sh-modal-mask" id="certificate-modal" style="display:none;">
        <div class="cert-modal-box">
          <div class="cert-modal-header">
            <h3>千里江山 · 山海神兽全璧御览</h3>
            <span class="cert-sub">北宋政和三年王希孟笔意 · 提笔知音大成典藏</span>
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

      <!-- ================= 6. 题记故事弹窗 ================= -->
      <div class="sh-modal-mask" id="guide-modal" style="display:none;">
        <div class="guide-box">
          <h2>《千里江山 · 借笔还魂》题记</h2>
          <p>北宋政和三年，十八岁的王希孟画出近十二米长卷《千里江山图》，随即悄然消逝于历史尘埃中。</p>
          <p>传说他并非早夭，而是参透了天地大化——他将《山海经》里那些古老的神仙异兽、山魂水魄，尽数借着石青石绿的矿物重彩，封印在了这幅绵延千里的绢帛之间。</p>
          <div class="guide-steps">
            <div class="step-item"><b>一 · 漫步青绿</b>：在三维千里江山大境中自由游历，穿行于桃溪、飞瀑、长桥与水心高阁之间。</div>
            <div class="step-item"><b>二 · 寻访神灵</b>：抬头仰望金色冲天光柱，或查看顶栏山海司南罗盘辨识六方神兽方向。</div>
            <div class="step-item"><b>三 · 提笔唤醒</b>：靠近沉眠神兽按 E 键，使山川泛金还原重彩，品读十八岁王希孟写给你的亲笔札记。</div>
            <div class="step-item"><b>四 · 展卷全璧</b>：按 M 键随时查验十二米真迹全卷进度，集齐六兽共鸣，获赐御览宝玺藏书票。</div>
          </div>
          <button class="card-btn card-btn-return" id="btn-close-guide" style="margin-top:20px;">步入江山</button>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    // 1. 开屏序幕点击【提笔入画】
    const btnStart = document.getElementById('btn-start-game');
    btnStart.addEventListener('click', () => {
      audio.ensureContext();
      audio.playGuqinPluck(261.63, 4.0);
      const mask = document.getElementById('prologue-mask');
      mask.classList.add('prologue-fade-out');
      setTimeout(() => {
        mask.style.display = 'none';
      }, 700);
    });

    // 2. 音乐开关
    document.getElementById('btn-audio').addEventListener('click', () => {
      const muted = audio.toggleMute();
      document.getElementById('audio-text').textContent = muted ? '寂然' : '乐起';
    });

    // 3. 题记故事弹窗
    document.getElementById('btn-guide').addEventListener('click', () => {
      document.getElementById('guide-modal').style.display = 'grid';
    });
    document.getElementById('btn-close-guide').addEventListener('click', () => {
      document.getElementById('guide-modal').style.display = 'none';
      audio.ensureContext();
      audio.playGuqinPluck(261.63, 3.0);
    });

    // 4. 打开 / 关闭十二米长卷全景抽屉
    document.getElementById('btn-open-scroll').addEventListener('click', () => {
      this.toggleScrollDrawer(true);
    });
    document.getElementById('btn-close-scroll').addEventListener('click', () => {
      this.toggleScrollDrawer(false);
    });

    // 5. 准星提示与移动端提笔按键
    const promptEl = document.getElementById('approach-prompt');
    promptEl.addEventListener('click', () => {
      this.onAwakenAction();
    });
    document.getElementById('mobile-e-btn').addEventListener('click', () => {
      this.onAwakenAction();
    });

    // 6. 神兽诗笺弹窗按钮
    document.getElementById('modal-btn-roam').addEventListener('click', () => {
      document.getElementById('beast-modal').style.display = 'none';
    });
    document.getElementById('modal-btn-view-scroll').addEventListener('click', () => {
      document.getElementById('beast-modal').style.display = 'none';
      this.toggleScrollDrawer(true);
    });

    // 7. 终局藏书票弹窗
    document.getElementById('btn-close-cert').addEventListener('click', () => {
      document.getElementById('certificate-modal').style.display = 'none';
    });
    document.getElementById('btn-download-cert').addEventListener('click', () => {
      this._downloadCert();
    });

    // 8. 移动端虚拟摇杆
    this._initMobileJoystick();
  }

  _initMobileJoystick() {
    const joystick = document.getElementById('virtual-joystick');
    const knob = document.getElementById('joystick-knob');
    if (!joystick || !knob) return;

    let dragging = false;
    let baseRect = null;
    const maxRadius = 38;

    const onStart = (e) => {
      dragging = true;
      baseRect = joystick.getBoundingClientRect();
      onMove(e);
    };

    const onMove = (e) => {
      if (!dragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const centerX = baseRect.left + baseRect.width / 2;
      const centerY = baseRect.top + baseRect.height / 2;
      const dx = touch.clientX - centerX;
      const dy = touch.clientY - centerY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      const clampedDist = Math.min(dist, maxRadius);
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;

      knob.style.transform = `translate(${kx}px, ${ky}px)`;

      // 向外部派发移动向量 (-1 到 1)
      this.onVirtualMove({
        x: kx / maxRadius,
        y: ky / maxRadius
      });
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      knob.style.transform = `translate(0px, 0px)`;
      this.onVirtualMove({ x: 0, y: 0 });
    };

    joystick.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  // 接近神兽时显示/隐藏准星交互提示
  setNearBeast(beast, dist) {
    const prompt = document.getElementById('approach-prompt');
    const nameEl = document.getElementById('approach-beast-name');

    if (beast) {
      prompt.style.display = 'flex';
      nameEl.textContent = `${beast.name} · ${beast.title}`;
    } else {
      prompt.style.display = 'none';
    }
  }

  // 更新山海司南罗盘 (根据玩家视线渲染方向雷达指示器)
  updateCompass(beastAngles, playerYaw) {
    const track = document.getElementById('compass-track');
    if (!track) return;

    // 清空重绘
    track.innerHTML = '';

    beastAngles.forEach(item => {
      // 仅在前方 ±80 度范围内显示符号，越靠近中央越清晰
      const deg = (item.relativeAngle * 180) / Math.PI;
      if (Math.abs(deg) <= 75) {
        const percent = 50 + (deg / 75) * 44; // 映射到 6% ~ 94%
        const dot = document.createElement('div');
        dot.className = `compass-beast-mark ${item.isAwakened ? 'is-awakened' : ''}`;
        dot.style.left = `${percent}%`;
        dot.innerHTML = `
          <span class="mark-icon">${item.name[0]}</span>
          <span class="mark-dist">${item.dist}丈</span>
        `;
        track.appendChild(dot);
      }
    });
  }

  // 开关长卷全景抽屉
  toggleScrollDrawer(open) {
    this.isScrollDrawerOpen = open;
    const drawer = document.getElementById('scroll-drawer');
    drawer.style.display = open ? 'flex' : 'none';
    this.onToggleScroll(open);

    if (open) {
      this._renderDrawerSeals();
      audio.playScrollWhoosh();
    }
  }

  _renderDrawerSeals() {
    const container = document.getElementById('drawer-seals-list');
    if (!container) return;
    container.innerHTML = '';

    BEASTS.forEach(b => {
      const isAwakened = Boolean(this.awakenedMap && this.awakenedMap[b.id]);
      const item = document.createElement('button');
      item.className = `drawer-seal-btn ${isAwakened ? 'is-awakened' : ''}`;
      item.innerHTML = `
        <span class="d-seal-char">${b.name[0]}</span>
        <div class="d-seal-info">
          <b>${b.name} · ${b.scenicSpot}</b>
          <span class="d-seal-state">${isAwakened ? '已苏醒 · 点击神行入画' : '沉睡中 · 点击前往寻访'}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        this.toggleScrollDrawer(false);
        this.onTeleport(b.id);
      });

      container.appendChild(item);
    });
  }

  // 展现神兽唤醒札记弹窗
  showBeastAwakened(beastData) {
    this.activeBeast = beastData;
    this.awakenedMap[beastData.id] = true;
    this.awakenedCount = Math.min(6, this.awakenedCount + 1);
    document.getElementById('awakened-num').textContent = this.awakenedCount;

    // 填充内容
    document.getElementById('modal-seal').textContent = beastData.sealText;
    document.getElementById('modal-name').textContent = beastData.name;
    document.getElementById('modal-title').textContent = beastData.title;
    document.getElementById('modal-source').textContent = beastData.classicSource;
    document.getElementById('modal-quote').textContent = beastData.classicQuote;
    document.getElementById('modal-reflection').textContent = beastData.reflection;
    document.getElementById('modal-mutation').innerHTML = `✨ <b>山川还魂</b>：${beastData.mutationDesc}`;

    const modal = document.getElementById('beast-modal');
    modal.style.display = 'grid';

    // 若全部六方神兽苏醒，延迟触发大成藏书票
    if (this.awakenedCount >= 6) {
      setTimeout(() => {
        this.generateCertificate();
      }, 4000);
    }
  }

  // 生成全璧御览藏书票
  generateCertificate() {
    const canvas = document.getElementById('cert-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 1. 宋绢洒金底
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#EAE0C7');
    grad.addColorStop(0.5, '#E5D8BC');
    grad.addColorStop(1, '#DCCDB0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 金粉斑驳
    ctx.fillStyle = 'rgba(218, 165, 32, 0.25)';
    for (let i = 0; i < 220; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2.5 + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. 泥金勾边
    ctx.strokeStyle = '#9E7D46';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    // 3. 宣和院体书法题铭
    ctx.fillStyle = '#221E19';
    ctx.font = 'bold 36px "Noto Serif SC", "STSong", serif';
    ctx.textAlign = 'center';
    ctx.fillText('千里江山 · 山海神兽全璧御览', w / 2, 78);

    ctx.font = '16px "Noto Serif SC", "STSong", serif';
    ctx.fillStyle = '#63533E';
    ctx.fillText('北宋政和三年王希孟笔意 · 提笔知音借笔还魂典藏', w / 2, 114);

    // 4. 六方神兽印章并列
    const sealStartX = 180;
    const sealGap = (w - 360) / 5;
    BEASTS.forEach((beast, idx) => {
      const sx = sealStartX + idx * sealGap;
      const sy = 220;

      // 朱砂方印
      ctx.fillStyle = '#9C2518';
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 2;
      ctx.fillRect(sx - 32, sy - 32, 64, 64);
      ctx.strokeRect(sx - 32, sy - 32, 64, 64);

      // 印文
      ctx.fillStyle = '#FFF8EB';
      ctx.font = 'bold 15px "Noto Serif SC", "STSong", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(beast.name, sx, sy);

      // 下方释义
      ctx.fillStyle = '#443A2E';
      ctx.font = '12px "Noto Serif SC", "STSong", serif';
      ctx.fillText(beast.sealText, sx, sy + 48);
    });

    document.getElementById('certificate-modal').style.display = 'grid';
  }

  _downloadCert() {
    const canvas = document.getElementById('cert-canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = '千里江山·山海神兽全璧御览.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }
}
