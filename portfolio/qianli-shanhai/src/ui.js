/**
 * 《千里江山 · 借笔还魂》界面交互与典藏长卷生成器 (UI & Handscroll Lore Engine)
 * 对标 https://xianxie6.github.io/qingming-riverside/ 的控制面板与画稿弹窗
 * 
 * 核心组件：
 * 1. 四时控制器 (.season-controls：春·夏·秋·冬)
 * 2. 气象与时态控制器 (时雨、夜景、全景返回、声音、题记)
 * 3. 司南方位罗盘 (指示六方神兽方向与步距)
 * 4. 画中故事画稿弹窗 (dialog#beastSketch：真迹长卷切片、少年画札、朱砂亲历印章)
 * 5. 全璧御览藏书票生成器 (Canvas 自动绘制宣和院体题铭与六方宝玺)
 */

import { BEASTS, SCENIC_SECTIONS, STORY_PROLOGUE } from './beasts.js';
import { audio } from './audio.js';

/**
 * Map a finger offset into a normalized stick vector.
 * x/y are in [-1, 1] after a deadzone; +y points down the screen (backward).
 * kx/ky are the clamped knob translation in pixels.
 */
export function shapeStickVector(dx, dy, maxRadius, deadzone = 0.14) {
  if (!(maxRadius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { x: 0, y: 0, kx: 0, ky: 0 };
  }
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(dist, maxRadius);
  const nx = dist > 0 ? (dx / dist) * (clamped / maxRadius) : 0;
  const ny = dist > 0 ? (dy / dist) * (clamped / maxRadius) : 0;
  const mag = Math.hypot(nx, ny);
  let x = 0;
  let y = 0;
  if (mag > deadzone) {
    const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
    x = (nx / mag) * scaled;
    y = (ny / mag) * scaled;
  }
  return { x, y, kx: nx * maxRadius, ky: ny * maxRadius };
}

export class UIManager {
  constructor(appEl, options = {}) {
    this.appEl = appEl;
    this.onAwakenAction = options.onAwakenAction || (() => {});
    this.onTeleport = options.onTeleport || (() => {});
    this.onReturnToAtlas = options.onReturnToAtlas || (() => {});
    this.onSeasonChange = options.onSeasonChange || (() => {});
    this.onWeatherChange = options.onWeatherChange || (() => {});
    this.onNightToggle = options.onNightToggle || (() => {});
    this.onVirtualMove = options.onVirtualMove || (() => {});
    this.onVirtualLook = options.onVirtualLook || (() => {});
    this.onPinchZoom = options.onPinchZoom || (() => {});

    this.currentSeason = 'summer';
    this.isNight = false;
    this.isRain = false;
    this.awakenedCount = 0;
    this.activeBeast = null;
    this.awakenedMap = {};
    BEASTS.forEach(b => { this.awakenedMap[b.id] = false; });

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.appEl.innerHTML = `
      <!-- ================= 1. 全景返回按钮 (对标清明上河图 #atlasReturn) ================= -->
      <button id="atlasReturn" class="atlas-return-btn" aria-label="返回全景展卷" title="返回长卷全景 (Esc / M)">
        <span class="btn-seal-char">卷</span>
        <span>全景</span>
      </button>

      <!-- ================= 2. 四时控制器 (.season-controls) ================= -->
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
        <!-- 顶栏古典信息栏与功能按钮 -->
        <header class="sh-hud-top">
          <!-- 山海司南罗盘 (指示六方神兽方向与步距) -->
          <div class="hud-compass-bar" id="compass-bar" title="山海司南方位仪">
            <span class="compass-label">司南</span>
            <div class="compass-track" id="compass-track"></div>
          </div>

          <div class="hud-status-group">
            <div class="hud-seal-badge" id="hud-badge">
              <span class="badge-dot"></span>
              已唤醒神兽 <b id="awakened-num">0</b> / 6
            </div>

            <!-- 时雨切换按钮 -->
            <button class="hud-btn" id="weatherStart" aria-label="体验山间时雨" title="山间时雨" aria-pressed="false">
              <span class="btn-icon">雨</span> <span>时雨</span>
            </button>

            <!-- 夜景切换按钮 -->
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
            <span class="key-tag">Esc / M</span> 返回全景
          </div>
        </div>

        <!-- 移动端双司南：左盘漫步，右盘游目 -->
        <div class="sh-mobile-controls" id="mobile-controls">
          <div class="virtual-joystick joystick-move" id="joystick-move" role="slider" aria-label="司南漫步摇杆" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0">
            <span class="joystick-caption">漫步</span>
            <div class="compass-plate" aria-hidden="true">
              <span class="compass-ticks"></span>
              <span class="compass-cross"></span>
              <span class="compass-dir dir-n">北</span>
              <span class="compass-dir dir-e">东</span>
              <span class="compass-dir dir-s">南</span>
              <span class="compass-dir dir-w">西</span>
            </div>
            <div class="joystick-knob" id="joystick-move-knob"><i class="knob-needle"></i></div>
          </div>
          <div class="virtual-joystick joystick-look" id="joystick-look" role="slider" aria-label="司南游目摇杆" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0">
            <span class="joystick-caption">游目</span>
            <div class="compass-plate" aria-hidden="true">
              <span class="compass-ticks"></span>
              <span class="compass-cross"></span>
              <span class="compass-dir dir-n">北</span>
              <span class="compass-dir dir-e">东</span>
              <span class="compass-dir dir-s">南</span>
              <span class="compass-dir dir-w">西</span>
            </div>
            <div class="joystick-knob" id="joystick-look-knob"><i class="knob-needle"></i></div>
          </div>
          <button class="mobile-action-btn" id="mobile-e-btn" type="button" aria-label="提笔唤醒">
            <span class="m-icon">笔</span>
            <span>提笔</span>
          </button>
        </div>
      </div>

      <!-- ================= 4. 神兽唤醒【画稿故事札记】(对标清明上河图 dialog#bridgeSketch) ================= -->
      <dialog id="beastSketch" class="sketch-dialog" aria-labelledby="sketchTitle">
        <div class="sketch-heading">
          <div class="sketch-heading-copy">
            <p id="sketchEyebrow">画中故事 · 山海经六方神兽</p>
            <h1 id="sketchTitle">桃溪浅滩 · 鹿蜀和音</h1>
            <p id="sketchSubtitle">《山海经 · 南山经》</p>
          </div>
          <div class="sketch-actions">
            <button id="saveSketch" class="sketch-action-btn" aria-label="保存画稿" title="保存画稿">
              <span>收存画札</span>
            </button>
            <button id="closeSketch" class="sketch-action-btn" aria-label="继续漫步" title="继续漫步">
              <span>✕</span>
            </button>
          </div>
        </div>

        <div class="sketch-stage">
          <div class="sketch-classic-quote" id="sketchQuote">
            “杻阳之山，有兽焉，其状如马而白首，其文如虎而赤尾，其音如谣，其名曰鹿蜀，佩之宜子孙。”
          </div>
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
            <canvas id="cert-canvas" width="1200" height="420"></canvas>
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
          <p>传说他并非早夭，而是参透了天地大化——他将《山海经》里那些古老的神仙异兽、山魂水魄，尽数借着石青石绿的矿物重彩，封印在了这幅绵延千里的绢帛之间。</p>
          <div class="guide-steps">
            <div class="step-item"><b>一 · 长卷展卷</b>：从十二米真迹全景出发，细品桃溪、飞瀑、长桥与水心高阁。</div>
            <div class="step-item"><b>二 · 提笔穿越</b>：化万千石青石绿粒子拔地而起，与十八岁少年王希孟相逢对语。</div>
            <div class="step-item"><b>三 · 漫步青绿</b>：在三维千里江山中自由漫游，体验春·夏·秋·冬四时与时雨夜景。</div>
            <div class="step-item"><b>四 · 借笔还魂</b>：靠近沉眠神兽按 E 键唤醒，收集六方神兽画札与亲历朱砂御印。</div>
          </div>
          <button class="cert-btn-primary" id="btnCloseGuide" style="margin-top:20px; width:100%;">步入江山</button>
        </div>
      </dialog>
    `;
  }

  _bindEvents() {
    // 1. 全景返回按钮
    const atlasReturnBtn = document.getElementById('atlasReturn');
    atlasReturnBtn.addEventListener('click', () => {
      this.onReturnToAtlas();
    });

    // 2. 四时控制器
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

    // 3. 时雨切换
    const weatherBtn = document.getElementById('weatherStart');
    weatherBtn.addEventListener('click', () => {
      this.isRain = !this.isRain;
      weatherBtn.setAttribute('aria-pressed', String(this.isRain));
      weatherBtn.querySelector('span:last-child').textContent = this.isRain ? '放晴' : '时雨';
      this.onWeatherChange(this.isRain ? 'rain' : 'clear');
    });

    // 4. 夜景切换
    const nightBtn = document.getElementById('nightToggle');
    nightBtn.addEventListener('click', () => {
      this.isNight = !this.isNight;
      document.body.classList.toggle('night', this.isNight);
      nightBtn.setAttribute('aria-pressed', String(this.isNight));
      nightBtn.querySelector('span:last-child').textContent = this.isNight ? '晨曦' : '夜景';
      this.onNightToggle(this.isNight);
    });

    // 5. 声音开关
    const soundBtn = document.getElementById('soundBtn');
    soundBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      document.getElementById('audio-text').textContent = muted ? '寂然' : '乐起';
      soundBtn.setAttribute('aria-pressed', String(!muted));
    });

    // 6. 题记弹窗
    const guideBtn = document.getElementById('guideBtn');
    const guideDialog = document.getElementById('guideDialog');
    guideBtn.addEventListener('click', () => {
      guideDialog.showModal();
    });
    document.getElementById('btnCloseGuide').addEventListener('click', () => {
      guideDialog.close();
      audio.ensureContext();
      audio.playGuqinPluck(261.63, 3.0);
    });

    // 7. 准星提示与移动端提笔按键
    const promptEl = document.getElementById('approach-prompt');
    promptEl.addEventListener('click', () => {
      this.onAwakenAction();
    });
    document.getElementById('mobile-e-btn').addEventListener('click', () => {
      this.onAwakenAction();
    });

    // 8. 神兽故事画稿弹窗
    const sketchDialog = document.getElementById('beastSketch');
    document.getElementById('closeSketch').addEventListener('click', () => {
      sketchDialog.close();
    });
    document.getElementById('sketchRoamBtn').addEventListener('click', () => {
      sketchDialog.close();
    });
    document.getElementById('saveSketch').addEventListener('click', () => {
      audio.playGuqinPluck(440, 2.5);
      sketchDialog.close();
    });
    document.getElementById('sketchAtlasBtn').addEventListener('click', () => {
      sketchDialog.close();
      this.onReturnToAtlas();
    });

    // 9. 终局藏书票弹窗
    const certDialog = document.getElementById('certDialog');
    document.getElementById('btn-close-cert').addEventListener('click', () => {
      certDialog.close();
    });
    document.getElementById('btn-download-cert').addEventListener('click', () => {
      this._downloadCert();
    });

    // 10. 移动端双司南与双指视野
    this._stickReleasers = [];
    this._initMobileTouch();
  }

  _shouldShowMobileControls() {
    const narrow = window.innerWidth < 768;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const touchPoints = (navigator.maxTouchPoints || 0) > 0;
    const touchCapable = coarse || touchPoints || ('ontouchstart' in window);
    return narrow || touchCapable;
  }

  _walkInputBlocked() {
    if (document.body.classList.contains('in-atlas')) return true;
    const ids = ['beastSketch', 'certDialog', 'guideDialog', 'crossingDialog'];
    return ids.some((id) => {
      const el = document.getElementById(id);
      return !!(el && el.open);
    });
  }

  _syncMobileControlMode() {
    const show = this._shouldShowMobileControls();
    document.body.classList.toggle('show-mobile-controls', show);
    const action = document.querySelector('#approach-prompt .prompt-action');
    if (action) {
      action.textContent = show ? '轻点提笔唤醒' : '按 E 键 或 点击唤醒';
    }
    if (!show && this._stickReleasers) {
      this._stickReleasers.forEach((release) => release());
    }
  }

  _initMobileTouch() {
    this._syncMobileControlMode();
    const refresh = () => this._syncMobileControlMode();
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    if (coarseQuery.addEventListener) coarseQuery.addEventListener('change', refresh);

    const moveRelease = this._bindCompassStick('joystick-move', 'joystick-move-knob', (vec) => {
      this.onVirtualMove(this._walkInputBlocked() ? { x: 0, y: 0 } : vec);
    });
    const lookRelease = this._bindCompassStick('joystick-look', 'joystick-look-knob', (vec) => {
      this.onVirtualLook(this._walkInputBlocked() ? { x: 0, y: 0 } : vec);
    });
    if (moveRelease) this._stickReleasers.push(moveRelease);
    if (lookRelease) this._stickReleasers.push(lookRelease);
    this._bindPinchZoom();
  }

  _bindCompassStick(stickId, knobId, onVec) {
    const stick = document.getElementById(stickId);
    const knob = document.getElementById(knobId);
    if (!stick || !knob) return null;

    let pointerId = null;
    let centerX = 0;
    let centerY = 0;
    let maxRadius = 40;

    const emitFromPoint = (clientX, clientY) => {
      const shaped = shapeStickVector(clientX - centerX, clientY - centerY, maxRadius);
      const rot = (shaped.kx === 0 && shaped.ky === 0)
        ? 0
        : Math.atan2(shaped.ky, shaped.kx) + Math.PI / 2;
      knob.style.transform = `translate(${shaped.kx}px, ${shaped.ky}px) rotate(${rot}rad)`;
      stick.setAttribute('aria-valuenow', shaped.x.toFixed(2));
      stick.setAttribute('aria-valuetext', `${shaped.x.toFixed(2)}, ${shaped.y.toFixed(2)}`);
      onVec({ x: shaped.x, y: shaped.y });
    };

    const reset = () => {
      if (pointerId === null) return;
      pointerId = null;
      stick.classList.remove('is-active');
      knob.style.transform = 'translate(0px, 0px) rotate(0rad)';
      stick.setAttribute('aria-valuenow', '0');
      stick.setAttribute('aria-valuetext', '静止');
      onVec({ x: 0, y: 0 });
    };

    stick.addEventListener('pointerdown', (e) => {
      if (pointerId !== null || e.button > 0) return;
      pointerId = e.pointerId;
      const rect = stick.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      maxRadius = Math.max(24, rect.width * 0.34);
      stick.classList.add('is-active');
      try { stick.setPointerCapture(e.pointerId); } catch (err) { /* untrusted or unsupported */ }
      emitFromPoint(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });

    const onMove = (e) => {
      if (e.pointerId !== pointerId) return;
      emitFromPoint(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onEnd = (e) => {
      if (e.pointerId !== pointerId) return;
      reset();
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return reset;
  }

  _bindPinchZoom() {
    const active = new Map();
    let lastDist = 0;
    const viewport = document.getElementById('viewport-3d');

    const isViewTouch = (touch) => {
      return !!(viewport && touch.target && viewport.contains(touch.target));
    };

    const remember = (touch) => {
      active.set(touch.identifier, {
        x: touch.clientX,
        y: touch.clientY,
        onView: isViewTouch(touch)
      });
    };

    window.addEventListener('touchstart', (e) => {
      for (const touch of e.changedTouches) remember(touch);
      lastDist = 0;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      for (const touch of e.changedTouches) {
        const prev = active.get(touch.identifier);
        if (prev) {
          prev.x = touch.clientX;
          prev.y = touch.clientY;
        } else {
          remember(touch);
        }
      }
      if (this._walkInputBlocked()) {
        lastDist = 0;
        return;
      }
      const fingers = [];
      active.forEach((point) => {
        if (point.onView) fingers.push(point);
      });
      if (fingers.length < 2) {
        lastDist = 0;
        return;
      }
      const dist = Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y);
      if (lastDist > 0 && dist > 0) {
        const scale = dist / lastDist;
        if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.002) {
          this.onPinchZoom(scale);
        }
      }
      lastDist = dist;
    }, { passive: true });

    const forget = (e) => {
      for (const touch of e.changedTouches) active.delete(touch.identifier);
      if (active.size < 2) lastDist = 0;
    };
    window.addEventListener('touchend', forget);
    window.addEventListener('touchcancel', forget);
  }

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

  showBeastAwakened(beastData) {
    this.activeBeast = beastData;
    this.awakenedMap[beastData.id] = true;
    this.awakenedCount = Math.min(6, this.awakenedCount + 1);
    document.getElementById('awakened-num').textContent = this.awakenedCount;

    // 填充画中故事画稿 (dialog#beastSketch)
    const dialog = document.getElementById('beastSketch');
    document.getElementById('sketchTitle').textContent = `${beastData.scenicSpot} · ${beastData.name}`;
    document.getElementById('sketchSubtitle').textContent = beastData.classicSource;
    document.getElementById('sketchQuote').textContent = `“${beastData.classicQuote}”`;
    document.getElementById('sketchReflection').textContent = beastData.reflection;
    document.getElementById('sketchMutation').innerHTML = `✨ <b>山川还魂</b>：${beastData.mutationDesc}`;

    const sealEl = document.getElementById('sketchSeal');
    sealEl.textContent = beastData.sealText || '希孟亲历';

    // 重新触发印章高空蓄力砸落动画与 80Hz 低频木印击纸音效
    sealEl.style.animation = 'none';
    void sealEl.offsetHeight;
    sealEl.style.animation = 'sealStampImpact 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards';

    dialog.showModal();

    setTimeout(() => {
      audio.playSealStampThud();
    }, 360);

    if (this.awakenedCount >= 6) {
      setTimeout(() => {
        this.generateCertificate();
      }, 4000);
    }
  }

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

    // 2. 泥金双勾边
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
