/**
 * 《千里江山 · 借笔还魂》界面交互与典藏长卷生成器 (UI & Handscroll Lore Engine)
 * 升级特性：
 * 1. 四时控制器 (.season-controls：春·夏·秋·冬)
 * 2. 气象、夜景、乘舟巡游 (B 键一键登舟)、全景返回、声音、题记
 * 3. 山海司南方位罗盘（支持点击罗盘上的神兽徽章直接传送！）
 * 4. 画中故事画稿弹窗 (dialog#beastSketch)：内置高清北宋工笔泥金神兽立绘 + 少年画札 + 朱砂落印
 * 5. 多指隔离的移动端虚拟摇杆（绝不与视角旋转冲突）
 * 6. 全璧御览藏书票生成器
 */

import { BEASTS } from './beasts.js';
import { audio } from './audio.js';

export class UIManager {
  constructor(appEl, options = {}) {
    this.appEl = appEl;
    this.onAwakenAction = options.onAwakenAction || (() => {});
    this.onTeleport = options.onTeleport || (() => {});
    this.onReturnToAtlas = options.onReturnToAtlas || (() => {});
    this.onSeasonChange = options.onSeasonChange || (() => {});
    this.onWeatherChange = options.onWeatherChange || (() => {});
    this.onNightToggle = options.onNightToggle || (() => {});
    this.onBoatCruiseToggle = options.onBoatCruiseToggle || (() => {});
    this.onVirtualMove = options.onVirtualMove || (() => {});

    this.currentSeason = 'summer';
    this.isNight = false;
    this.isRain = false;
    this.isOnBoat = false;
    this.awakenedCount = 0;
    this.activeBeast = null;
    this.awakenedMap = {};
    BEASTS.forEach(b => { this.awakenedMap[b.id] = false; });

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.appEl.innerHTML = `
      <!-- ================= 1. 全景返回按钮 ================= -->
      <button id="atlasReturn" class="atlas-return-btn" aria-label="返回全景展卷" title="返回长卷全景 (Esc / M)">
        <span class="btn-seal-char">卷</span>
        <span>全景</span>
      </button>

      <!-- ================= 2. 四时控制器 ================= -->
      <nav class="season-controls" aria-label="四季景色">
        <span class="season-heading">四时</span>
        <button data-season="spring" aria-label="春季" aria-pressed="false">春</button>
        <button data-season="summer" aria-label="夏季" aria-pressed="true">夏</button>
        <button data-season="autumn" aria-label="秋季" aria-pressed="false">秋</button>
        <button data-season="winter" aria-label="冬季" aria-pressed="false">冬</button>
        <span id="seasonStatus" role="status" aria-live="polite">盛夏 · 叠翠</span>
      </nav>

      <!-- ================= 3. 3D 画中漫步主界面 HUD ================= -->
      <div class="sh-hud-layer" id="main-hud">
        <header class="sh-hud-top">
          <!-- 山海司南罗盘 -->
          <div class="hud-compass-bar" id="compass-bar" title="山海司南方位仪 · 循金光寻访六兽">
            <span class="compass-label">司南</span>
            <div class="compass-track" id="compass-track"></div>
          </div>

          <div class="hud-status-group">
            <div class="hud-seal-badge" id="hud-badge">
              <span class="badge-dot"></span>
              已唤醒神兽 <b id="awakened-num">0</b> / 6
            </div>

            <!-- 乘舟巡游按钮（路线 A 标志交互） -->
            <button class="hud-btn hud-btn-boat" id="boatCruiseBtn" aria-label="乘乌篷画舫游江" title="乘舟巡游 · 穿千步虹桥 (B)" aria-pressed="false">
              <span class="btn-icon">舟</span> <span id="boat-btn-text">乘舟巡游</span>
            </button>

            <!-- 时雨切换 -->
            <button class="hud-btn" id="weatherStart" aria-label="体验山间时雨" title="山间时雨" aria-pressed="false">
              <span class="btn-icon">雨</span> <span>时雨</span>
            </button>

            <!-- 夜景切换 -->
            <button class="hud-btn" id="nightToggle" aria-label="切换夜景" title="宣和夜景 · 万家灯火" aria-pressed="false">
              <span class="btn-icon">月</span> <span>夜景</span>
            </button>

            <!-- 声音开关 -->
            <button class="hud-btn" id="soundBtn" title="开启/静音背景古乐" aria-pressed="true">
              <span class="btn-icon">琴</span> <span id="audio-text">乐起</span>
            </button>

            <!-- 题记故事 -->
            <button class="hud-btn" id="guideBtn" title="查看借笔还魂题记">
              <span class="btn-icon">鉴</span> 题记
            </button>
          </div>
        </header>

        <!-- 屏幕中央准星与接近提笔提示 -->
        <div class="sh-reticle-wrap" id="reticle-wrap">
          <div class="center-crosshair"></div>
          <div class="beast-approach-prompt" id="approach-prompt" style="display:none;">
            <div class="prompt-seal-box">
              <span class="prompt-seal-icon">点睛</span>
              <div class="prompt-text-group">
                <div class="prompt-action">按 E 键 或 点击提笔连星唤醒</div>
                <div class="prompt-name" id="approach-beast-name">夫诸 · 水魄灵鹿</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作说明（含乘舟状态提示） -->
        <div class="sh-controls-dock">
          <div class="dock-pill" id="controls-dock-pill">
            <span class="key-tag">WASD</span> 漫步 ·
            <span class="key-tag">Shift</span> 疾行 ·
            <span class="key-tag">B</span> 乘舟巡游 ·
            <span class="key-tag">鼠标拖拽</span> 游目 ·
            <span class="key-tag">E</span> 借笔点睛 ·
            <span class="key-tag">Esc</span> 返回长卷
          </div>
        </div>

        <!-- 移动端虚拟摇杆与触屏交互按钮 -->
        <div class="sh-mobile-controls" id="mobile-controls">
          <div class="virtual-joystick" id="virtual-joystick">
            <div class="joystick-knob" id="joystick-knob"></div>
          </div>
          <button class="mobile-action-btn" id="mobile-e-btn">
            <span class="m-icon">笔</span>
            <span>借笔点睛</span>
          </button>
        </div>
      </div>

      <!-- ================= 4. 神兽唤醒【工笔画稿故事札记】 ================= -->
      <dialog id="beastSketch" class="sketch-dialog" aria-labelledby="sketchTitle">
        <div class="sketch-heading">
          <div class="sketch-heading-copy">
            <p id="sketchEyebrow">画中故事 · 北宋宣和工笔金线灵兽</p>
            <h1 id="sketchTitle">桃溪浅滩 · 鹿蜀和音</h1>
            <p id="sketchSubtitle">《山海经 · 南山经》</p>
          </div>
          <div class="sketch-actions">
            <button id="saveSketch" class="sketch-action-btn" aria-label="保存画稿" title="收存画札">
              <span>收存画札</span>
            </button>
            <button id="closeSketch" class="sketch-action-btn" aria-label="继续漫步" title="继续漫步">
              <span>✕</span>
            </button>
          </div>
        </div>

        <div class="sketch-stage">
          <div class="sketch-portrait-frame">
            <img id="sketchPortrait" src="" alt="北宋工笔泥金神兽立绘">
          </div>
          <div class="sketch-classic-quote" id="sketchQuote"></div>
          <div class="sketch-reflection-box">
            <div class="sketch-reflection-title">十八岁少年王希孟 · 借笔还魂画札</div>
            <p id="sketchReflection" class="sketch-reflection-body"></p>
          </div>
          <div class="sketch-mutation-info" id="sketchMutation"></div>
          <span class="sketch-seal-stamp" id="sketchSeal">希孟亲历</span>
        </div>

        <div class="sketch-footer">
          <button id="sketchRoamBtn" class="sketch-btn-roam">继续山河漫步</button>
          <button id="sketchAtlasBtn" class="sketch-btn-atlas">查看长卷全景</button>
        </div>
      </dialog>

      <!-- ================= 5. 终局《千里江山 · 全璧御览》藏书票弹窗 ================= -->
      <dialog id="certDialog" class="cert-dialog">
        <div class="cert-box">
          <div class="cert-modal-header">
            <h3>千里江山 · 山海神兽全璧御览</h3>
            <span class="cert-sub">北宋政和三年王希孟笔意 · 提笔知音借笔还魂大成典藏</span>
          </div>
          <div class="cert-canvas-wrap">
            <canvas id="cert-canvas" width="1200" height="440"></canvas>
          </div>
          <div class="cert-actions">
            <button class="cert-btn-primary" id="btn-download-cert">高清下载藏书长卷</button>
            <button class="cert-btn-sub" id="btn-close-cert">重温万里江山</button>
          </div>
        </div>
      </dialog>

      <!-- ================= 6. 题记故事弹窗 ================= -->
      <dialog id="guideDialog" class="guide-dialog">
        <div class="guide-box">
          <h2>《千里江山 · 借笔还魂》题记</h2>
          <p>北宋政和三年，十八岁的王希孟画出近十二米长卷《千里江山图》，随即悄然消逝于历史尘埃中。</p>
          <p>传说他将《山海经》六方神兽、山魂水魄，借石青石绿与泥金重彩封印于绢帛之中。如今你可漫步真三维青绿山水，更可乘乌篷画舫穿过千步虹桥，一笔连星点睛，唤回千年画魂。</p>
          <div class="guide-steps">
            <div class="step-item"><b>一 · 长卷展卷</b>：游目十二米故宫真迹全景，点击六大胜景即刻入画。</div>
            <div class="step-item"><b>二 · 提笔穿越</b>：万千石青石绿粒子化龙汇聚，与十八岁少年王希孟相逢。</div>
            <div class="step-item"><b>三 · 乘舟游江</b>：按 <b>B 键</b> 或点右上角【乘舟巡游】，乘乌篷画舫穿行千步虹桥、环游水心高阁。</div>
            <div class="step-item"><b>四 · 借笔点睛</b>：靠近工笔通灵神兽按 <b>E 键</b>，一笔划过三枚灵枢星点破封还魂！</div>
          </div>
          <button class="cert-btn-primary" id="btnCloseGuide" style="margin-top:20px; width:100%;">步入江山</button>
        </div>
      </dialog>
    `;
  }

  _bindEvents() {
    document.getElementById('atlasReturn').addEventListener('click', () => this.onReturnToAtlas());

    const seasonStatus = document.getElementById('seasonStatus');
    const seasonBtns = document.querySelectorAll('.season-controls button');
    const seasonLabels = {
      spring: '春和 · 轻衫',
      summer: '盛夏 · 叠翠',
      autumn: '秋水 · 澄碧',
      winter: '冬雪 · 寒江'
    };

    seasonBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const season = btn.dataset.season;
        this.currentSeason = season;
        seasonBtns.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        seasonStatus.textContent = seasonLabels[season] || '';
        audio.playGuqinPluck(330, 2.5);
        this.onSeasonChange(season);
      });
    });

    // 乘舟巡游按钮
    const boatBtn = document.getElementById('boatCruiseBtn');
    boatBtn.addEventListener('click', () => {
      this.onBoatCruiseToggle();
    });

    const weatherBtn = document.getElementById('weatherStart');
    weatherBtn.addEventListener('click', () => {
      this.isRain = !this.isRain;
      weatherBtn.setAttribute('aria-pressed', String(this.isRain));
      weatherBtn.querySelector('span:last-child').textContent = this.isRain ? '放晴' : '时雨';
      this.onWeatherChange(this.isRain ? 'rain' : 'clear');
    });

    const nightBtn = document.getElementById('nightToggle');
    nightBtn.addEventListener('click', () => {
      this.isNight = !this.isNight;
      document.body.classList.toggle('night', this.isNight);
      nightBtn.setAttribute('aria-pressed', String(this.isNight));
      nightBtn.querySelector('span:last-child').textContent = this.isNight ? '晨曦' : '夜景';
      this.onNightToggle(this.isNight);
    });

    const soundBtn = document.getElementById('soundBtn');
    soundBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      document.getElementById('audio-text').textContent = muted ? '寂然' : '乐起';
      soundBtn.setAttribute('aria-pressed', String(!muted));
    });

    const guideDialog = document.getElementById('guideDialog');
    document.getElementById('guideBtn').addEventListener('click', () => guideDialog.showModal());
    document.getElementById('btnCloseGuide').addEventListener('click', () => {
      guideDialog.close();
      audio.ensureContext();
      audio.playGuqinPluck(261.63, 3.0);
    });

    document.getElementById('approach-prompt').addEventListener('click', () => this.onAwakenAction());
    document.getElementById('mobile-e-btn').addEventListener('click', () => this.onAwakenAction());

    const sketchDialog = document.getElementById('beastSketch');
    document.getElementById('closeSketch').addEventListener('click', () => sketchDialog.close());
    document.getElementById('sketchRoamBtn').addEventListener('click', () => sketchDialog.close());
    document.getElementById('saveSketch').addEventListener('click', () => {
      audio.playGuqinPluck(440, 2.5);
      sketchDialog.close();
    });
    document.getElementById('sketchAtlasBtn').addEventListener('click', () => {
      sketchDialog.close();
      this.onReturnToAtlas();
    });

    const certDialog = document.getElementById('certDialog');
    document.getElementById('btn-close-cert').addEventListener('click', () => certDialog.close());
    document.getElementById('btn-download-cert').addEventListener('click', () => this._downloadCert());

    this._initMobileJoystick();
  }

  /**
   * 更新【乘舟巡游】HUD 视觉状态
   */
  setBoatState(isOnBoat) {
    this.isOnBoat = Boolean(isOnBoat);
    const btn = document.getElementById('boatCruiseBtn');
    const txt = document.getElementById('boat-btn-text');
    const dock = document.getElementById('controls-dock-pill');
    if (btn) btn.setAttribute('aria-pressed', String(this.isOnBoat));
    if (txt) txt.textContent = this.isOnBoat ? '靠岸漫步' : '乘舟巡游';
    if (dock) {
      dock.innerHTML = this.isOnBoat
        ? `<span class="key-tag">画舫游江中</span> · <span class="key-tag">W</span> 加速摇橹 · <span class="key-tag">S</span> 驻舟赏景 · <span class="key-tag">拖拽</span> 环顾两岸 · <span class="key-tag">B</span> 靠岸漫步`
        : `<span class="key-tag">WASD</span> 漫步 · <span class="key-tag">Shift</span> 疾行 · <span class="key-tag">B</span> 乘舟巡游 · <span class="key-tag">鼠标拖拽</span> 游目 · <span class="key-tag">E</span> 借笔点睛 · <span class="key-tag">Esc</span> 返回长卷`;
    }
  }

  // 多指独立追踪虚拟摇杆（彻底解决双指同时移动与转视角冲突）
  _initMobileJoystick() {
    const joystick = document.getElementById('virtual-joystick');
    const knob = document.getElementById('joystick-knob');
    if (!joystick || !knob) return;

    let activeTouchId = null;
    let baseRect = null;
    const maxRadius = 38;

    const updateKnob = (clientX, clientY) => {
      const cx = baseRect.left + baseRect.width / 2;
      const cy = baseRect.top + baseRect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const clamped = Math.min(dist, maxRadius);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      this.onVirtualMove({ x: kx / maxRadius, y: ky / maxRadius });
    };

    joystick.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (activeTouchId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        activeTouchId = t.identifier;
        baseRect = joystick.getBoundingClientRect();
        updateKnob(t.clientX, t.clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          updateKnob(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    }, { passive: true });

    const endTouch = (e) => {
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          activeTouchId = null;
          knob.style.transform = 'translate(0px, 0px)';
          this.onVirtualMove({ x: 0, y: 0 });
          break;
        }
      }
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);
  }

  setNearBeast(beast, dist) {
    const prompt = document.getElementById('approach-prompt');
    const nameEl = document.getElementById('approach-beast-name');
    if (beast) {
      prompt.style.display = 'flex';
      const doneTag = this.awakenedMap[beast.id] ? '（已还魂 · 重温画札）' : '';
      nameEl.textContent = `${beast.name} · ${beast.title} ${doneTag}`;
    } else {
      prompt.style.display = 'none';
    }
  }

  updateCompass(beastAngles, playerYaw) {
    const track = document.getElementById('compass-track');
    if (!track) return;
    track.innerHTML = '';

    beastAngles.forEach(item => {
      const deg = (item.relativeAngle * 180) / Math.PI;
      if (Math.abs(deg) <= 75) {
        const percent = 50 + (deg / 75) * 44;
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

  showBeastAwakened(beastData, isRevisit = false) {
    this.activeBeast = beastData;
    if (!this.awakenedMap[beastData.id]) {
      this.awakenedMap[beastData.id] = true;
      this.awakenedCount = Object.values(this.awakenedMap).filter(Boolean).length;
      document.getElementById('awakened-num').textContent = this.awakenedCount;
    }

    const dialog = document.getElementById('beastSketch');
    document.getElementById('sketchTitle').textContent = `${beastData.scenicSpot} · ${beastData.name}`;
    document.getElementById('sketchSubtitle').textContent = beastData.classicSource;
    document.getElementById('sketchQuote').textContent = `“${beastData.classicQuote}”`;
    document.getElementById('sketchReflection').textContent = beastData.reflection;
    document.getElementById('sketchMutation').innerHTML = `✨ <b>山川还魂</b>：${beastData.mutationDesc}`;

    const portrait = document.getElementById('sketchPortrait');
    if (portrait) {
      portrait.src = `./assets/beasts/${beastData.id}.webp`;
      portrait.alt = `${beastData.name} 北宋工笔泥金立绘`;
    }

    const sealEl = document.getElementById('sketchSeal');
    sealEl.textContent = beastData.sealText || '希孟亲历';
    sealEl.style.animation = 'none';
    void sealEl.offsetHeight;
    sealEl.style.animation = 'sealStampImpact 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards';

    dialog.showModal();

    setTimeout(() => {
      audio.playSealStampThud();
    }, 340);

    if (!isRevisit && this.awakenedCount >= 6) {
      setTimeout(() => {
        this.generateCertificate();
      }, 3600);
    }
  }

  generateCertificate() {
    const canvas = document.getElementById('cert-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#EAE0C7');
    grad.addColorStop(0.5, '#E5D8BC');
    grad.addColorStop(1, '#DCCDB0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(218, 165, 32, 0.25)';
    for (let i = 0; i < 240; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2.5 + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#9E7D46';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    ctx.fillStyle = '#221E19';
    ctx.font = 'bold 36px "Noto Serif SC", "STSong", serif';
    ctx.textAlign = 'center';
    ctx.fillText('千里江山 · 山海神兽全璧御览', w / 2, 74);

    ctx.font = '16px "Noto Serif SC", "STSong", serif';
    ctx.fillStyle = '#63533E';
    ctx.fillText('北宋政和三年王希孟笔意 · 借笔点睛六兽齐鸣大成典藏', w / 2, 108);

    const sealStartX = 165;
    const sealGap = (w - 330) / 5;
    BEASTS.forEach((beast, idx) => {
      const sx = sealStartX + idx * sealGap;
      const sy = 250;

      // 异步绘制工笔神兽缩略立绘于印章上方
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, sx - 52, sy - 115, 104, 104);
      };
      img.src = `./assets/beasts/${beast.id}.webp`;

      ctx.fillStyle = '#9C2518';
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 2;
      ctx.fillRect(sx - 30, sy + 6, 60, 60);
      ctx.strokeRect(sx - 30, sy + 6, 60, 60);

      ctx.fillStyle = '#FFF8EB';
      ctx.font = 'bold 15px "Noto Serif SC", "STSong", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(beast.name, sx, sy + 36);

      ctx.fillStyle = '#443A2E';
      ctx.font = '12px "Noto Serif SC", "STSong", serif';
      ctx.fillText(beast.sealText, sx, sy + 88);
    });

    const certDialog = document.getElementById('certDialog');
    if (certDialog) certDialog.showModal();
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
