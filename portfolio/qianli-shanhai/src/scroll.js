/**
 * 《千里江山 · 山海入画》真迹长卷游目引擎 (Authentic Handscroll Panoramic Engine)
 * 采用故宫博物院藏北宋王希孟《千里江山图》真迹高清数字全卷（22,486 × 900 像素，分段无缝多级渲染）
 * 融合《山海经》六方祥瑞古灵真迹寻踪、宋代朱砂御印烙印、金碧微光、惯性拖拽、缩放游历与全景鸟瞰小地图
 */

import { BEASTS, SCENIC_SECTIONS } from './beasts.js';
import { audio } from './audio.js';

export class ScrollViewer {
  constructor(container, options = {}) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scroll-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.onEnter3D = options.onEnter3D || (() => {});
    this.onSelectBeast = options.onSelectBeast || (() => {});
    this.onProgressChange = options.onProgressChange || (() => {});

    // 真迹长卷真实比例与分段定义
    this.sections = [
      { id: 0, width: 1321, height: 900, startX: 0, src: 'assets/painting/section_0.jpg', thumb: 'assets/painting/thumb_0.jpg' },
      { id: 1, width: 4244, height: 900, startX: 1321, src: 'assets/painting/section_1.jpg', thumb: 'assets/painting/thumb_1.jpg' },
      { id: 2, width: 4301, height: 900, startX: 5565, src: 'assets/painting/section_2.jpg', thumb: 'assets/painting/thumb_2.jpg' },
      { id: 3, width: 4216, height: 900, startX: 9866, src: 'assets/painting/section_3.jpg', thumb: 'assets/painting/thumb_3.jpg' },
      { id: 4, width: 4216, height: 900, startX: 14082, src: 'assets/painting/section_4.jpg', thumb: 'assets/painting/thumb_4.jpg' },
      { id: 5, width: 4188, height: 900, startX: 18298, src: 'assets/painting/section_5.jpg', thumb: 'assets/painting/thumb_5.jpg' }
    ];

    this.virtualWidth = 22486;
    this.virtualHeight = 900;

    // 图片加载缓存
    this.sectionImages = new Map();
    this.thumbImages = new Map();
    this.loadedSectionsCount = 0;

    // 视口、平移与缩放
    this.scrollX = 0;
    this.targetScrollX = 0;
    this.scrollY = 0;
    this.zoom = 1.0;
    this.targetZoom = 1.0;
    this.minZoom = 0.75;
    this.maxZoom = 2.2;

    // 交互手势与惯性物理
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.startScrollX = 0;
    this.velocity = 0;
    this.lastX = 0;

    // 异象悬停与交互动画
    this.hoveredBeast = null;
    this.animTime = 0;
    this.waterRipples = [];
    this.goldSparks = [];

    // 唤醒状态映射
    this.awakenedMap = {};
    BEASTS.forEach(b => { this.awakenedMap[b.id] = false; });

    // 初始化小鸟与游禽
    this.birds = this._initBirds();

    this._preloadImages();
    this._initEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._renderLoop();
  }

  setAwakened(beastId) {
    this.awakenedMap[beastId] = true;
    const beast = BEASTS.find(b => b.id === beastId);
    if (beast) {
      // 触发金粉印章爆破粒子
      for (let i = 0; i < 45; i++) {
        this.goldSparks.push({
          x: beast.virtualX + (Math.random() - 0.5) * 80,
          y: beast.virtualY + (Math.random() - 0.5) * 80,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6 - 2,
          life: 1.0,
          color: Math.random() > 0.3 ? beast.goldColor : beast.themeColor,
          size: 2 + Math.random() * 4
        });
      }
    }
  }

  getAwakenedCount() {
    return Object.values(this.awakenedMap).filter(Boolean).length;
  }

  scrollToProgress(p, smooth = true) {
    const scale = this._getRenderScale();
    const maxScroll = Math.max(0, this.virtualWidth * scale - this.width);
    const target = p * maxScroll;
    if (smooth) {
      this.targetScrollX = target;
    } else {
      this.targetScrollX = target;
      this.scrollX = target;
    }
  }

  zoomBy(delta) {
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom + delta));
  }

  _getRenderScale() {
    return (this.height / this.virtualHeight) * this.zoom;
  }

  _preloadImages() {
    // 1. 优先瞬间加载全部 6 段低清缩略图（总共仅 ~150KB），首屏 0ms 闪现真迹全貌
    this.sections.forEach(sec => {
      const thumb = new Image();
      thumb.src = sec.thumb;
      thumb.onload = () => {
        this.thumbImages.set(sec.id, thumb);
      };
    });

    // 2. 依次加载 900px 高清真迹段落
    this.sections.forEach(sec => {
      const img = new Image();
      img.src = sec.src;
      img.onload = () => {
        this.sectionImages.set(sec.id, img);
        this.loadedSectionsCount++;
      };
    });
  }

  _initBirds() {
    const birds = [];
    for (let i = 0; i < 7; i++) {
      birds.push({
        x: 1800 + i * 2800 + Math.random() * 600,
        y: 120 + Math.random() * 220,
        speed: 0.8 + Math.random() * 0.7,
        size: 3 + Math.random() * 3,
        wingPhase: Math.random() * Math.PI * 2
      });
    }
    return birds;
  }

  resize() {
    this._resize();
  }

  _resize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  _initEvents() {
    // 滚轮横向巡游 & 双指缩放
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      audio.ensureContext();

      if (e.ctrlKey || e.metaKey) {
        // 滚轮缩放
        const zoomDelta = -e.deltaY * 0.002;
        this.zoomBy(zoomDelta);
      } else {
        // 横向游卷
        const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.8;
        const scale = this._getRenderScale();
        const maxScroll = Math.max(0, this.virtualWidth * scale - this.width);
        this.targetScrollX = Math.max(0, Math.min(maxScroll, this.targetScrollX + delta));
        if (Math.abs(delta) > 30 && Math.random() < 0.06) {
          audio.playScrollWhoosh();
        }
      }
    }, { passive: false });

    // 拖拽推进
    const onStart = (clientX, clientY) => {
      audio.ensureContext();
      this.isDragging = true;
      this.startX = clientX;
      this.startY = clientY;
      this.lastX = clientX;
      this.startScrollX = this.targetScrollX;
      this.velocity = 0;
    };

    const onMove = (clientX, clientY) => {
      this._checkHover(clientX, clientY);
      if (!this.isDragging) return;
      const dx = clientX - this.startX;
      this.velocity = clientX - this.lastX;
      this.lastX = clientX;
      const scale = this._getRenderScale();
      const maxScroll = Math.max(0, this.virtualWidth * scale - this.width);
      this.targetScrollX = Math.max(0, Math.min(maxScroll, this.startScrollX - dx));
    };

    const onEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      const scale = this._getRenderScale();
      const maxScroll = Math.max(0, this.virtualWidth * scale - this.width);
      this.targetScrollX = Math.max(0, Math.min(maxScroll, this.targetScrollX - this.velocity * 10));
    };

    this.container.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', onEnd);

    // 点击神兽寻访与入画
    this.container.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 1. 检查是否点击了底部全景鸟瞰小地图
      if (this._handleMinimapClick(mouseX, mouseY)) {
        return;
      }

      // 2. 检查是否点击了神兽印鉴标记
      const clickedBeast = this._hitTestBeast(mouseX, mouseY);
      if (clickedBeast) {
        audio.playBeastChime();
        this.onSelectBeast(clickedBeast);
      }
    });
  }

  _handleMinimapClick(x, y) {
    const mmW = Math.min(this.width * 0.72, 720);
    const mmH = 34;
    const mmX = (this.width - mmW) / 2;
    const mmY = this.height - mmH - 18;

    if (x >= mmX && x <= mmX + mmW && y >= mmY && y <= mmY + mmH) {
      const progress = (x - mmX) / mmW;
      this.scrollToProgress(progress, true);
      audio.playScrollWhoosh();
      return true;
    }
    return false;
  }

  _checkHover(screenX, screenY) {
    const beast = this._hitTestBeast(screenX, screenY);
    if (beast !== this.hoveredBeast) {
      this.hoveredBeast = beast;
      this.container.style.cursor = beast ? 'pointer' : (this.isDragging ? 'grabbing' : 'grab');
      if (beast) {
        audio.playWaterDrop();
      }
    }
  }

  _hitTestBeast(screenX, screenY) {
    const scale = this._getRenderScale();
    for (const beast of BEASTS) {
      const sx = beast.virtualX * scale - this.scrollX;
      const sy = beast.virtualY * scale;
      const dist = Math.hypot(screenX - sx, screenY - sy);
      if (dist < 46) {
        return beast;
      }
    }
    return null;
  }

  _renderLoop() {
    this.animTime += 0.016;

    // 缩放平滑过渡
    this.zoom += (this.targetZoom - this.zoom) * 0.08;

    // 滚动平滑插值
    this.scrollX += (this.targetScrollX - this.scrollX) * 0.09;

    const scale = this._getRenderScale();
    const maxScroll = Math.max(1, this.virtualWidth * scale - this.width);
    const progress = Math.max(0, Math.min(1, this.scrollX / maxScroll));
    this.onProgressChange(progress);

    this._draw();
    requestAnimationFrame(() => this._renderLoop());
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 1. 宋代古绢基底（模拟千年前宫廷生绢温润质感）
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#E8DCBF');
    bgGrad.addColorStop(0.5, '#DECFA7');
    bgGrad.addColorStop(1, '#D2C194');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const scale = this._getRenderScale();

    // 2. 渲染北宋王希孟《千里江山图》真迹段落（6段无缝拼接，视口裁剪优化）
    this._drawPaintingSections(ctx, scale);

    // 3. 动态水波与微光金雾（宋画留白处的仙灵流动）
    this._drawAtmosphereEffects(ctx, scale);

    // 4. 远天飞鸟与灵禽掠空
    this._drawBirds(ctx, scale);

    // 5. 渲染真迹上的《山海经》六方祥瑞古灵与朱砂御印
    this._drawBeastAnchors(ctx, scale);

    // 6. 绘制长卷装裱玉轴、云锦边饰与宋院印章
    this._drawScrollMounting(ctx, w, h);

    // 7. 绘制底部全景千里江山图鸟瞰微缩导航条 (Minimap)
    this._drawMinimap(ctx, w, h);
  }

  _drawPaintingSections(ctx, scale) {
    const viewLeft = this.scrollX;
    const viewRight = this.scrollX + this.width;

    ctx.save();
    // 开启高品质图片平滑插值
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (const sec of this.sections) {
      const secScreenX = sec.startX * scale - this.scrollX;
      const secScreenWidth = sec.width * scale;
      const secScreenHeight = sec.height * scale;

      // 仅渲染进入视口范围内的画作段落（留出 100px 缓冲）
      if (secScreenX + secScreenWidth < -100 || secScreenX > this.width + 100) {
        continue;
      }

      const fullImg = this.sectionImages.get(sec.id);
      const thumbImg = this.thumbImages.get(sec.id);

      if (fullImg && fullImg.complete && fullImg.naturalWidth > 0) {
        ctx.drawImage(fullImg, secScreenX, 0, secScreenWidth, secScreenHeight);
      } else if (thumbImg && thumbImg.complete && thumbImg.naturalWidth > 0) {
        // 若高清段落尚未加载完毕，先使用低清缩略图无缝过渡
        ctx.drawImage(thumbImg, secScreenX, 0, secScreenWidth, secScreenHeight);
      } else {
        // 底层预留宋绢微色
        ctx.fillStyle = '#D9CA9F';
        ctx.fillRect(secScreenX, 0, secScreenWidth, secScreenHeight);
      }
    }

    ctx.restore();
  }

  _drawAtmosphereEffects(ctx, scale) {
    ctx.save();

    // 1. 浮动的矿物金粉微光 (Gold Dust)
    for (let i = this.goldSparks.length - 1; i >= 0; i--) {
      const p = this.goldSparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 0.012;

      if (p.life <= 0) {
        this.goldSparks.splice(i, 1);
        continue;
      }

      const sx = p.x * scale - this.scrollX;
      const sy = p.y * scale;

      if (sx >= -20 && sx <= this.width + 20) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 0.85;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. 悬停祥瑞时的金纹水波涟漪
    if (this.hoveredBeast) {
      const bx = this.hoveredBeast.virtualX * scale - this.scrollX;
      const by = this.hoveredBeast.virtualY * scale;
      const radius = 28 + (Math.sin(this.animTime * 3.5) + 1) * 14;

      ctx.strokeStyle = this.hoveredBeast.goldColor;
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = this.hoveredBeast.themeColor;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(bx, by, radius * 1.35, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawBirds(ctx, scale) {
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 35, 25, 0.45)';
    ctx.lineWidth = 1.2;

    this.birds.forEach(b => {
      b.x += b.speed;
      if (b.x > this.virtualWidth + 200) {
        b.x = -100;
      }

      const sx = b.x * scale - this.scrollX;
      const sy = b.y * scale + Math.sin(this.animTime * 2 + b.wingPhase) * 6;

      if (sx >= -40 && sx <= this.width + 40) {
        const wingY = Math.sin(this.animTime * 6 + b.wingPhase) * (b.size * 0.8);
        ctx.beginPath();
        ctx.moveTo(sx - b.size, sy + wingY);
        ctx.quadraticCurveTo(sx, sy, sx + b.size, sy + wingY);
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  _drawBeastAnchors(ctx, scale) {
    ctx.save();

    BEASTS.forEach(beast => {
      const sx = beast.virtualX * scale - this.scrollX;
      const sy = beast.virtualY * scale;

      // 仅渲染视口周围
      if (sx < -120 || sx > this.width + 120) return;

      const isAwakened = this.awakenedMap[beast.id];
      const isHovered = this.hoveredBeast === beast;

      // 1. 底层金碧灵气光晕
      const pulse = Math.sin(this.animTime * 2.5 + beast.sectionIndex) * 0.25 + 0.75;
      const auraGrad = ctx.createRadialGradient(sx, sy, 4, sx, sy, isHovered ? 48 : 34);
      auraGrad.addColorStop(0, isAwakened ? 'rgba(244, 208, 104, 0.85)' : 'rgba(217, 74, 56, 0.7)');
      auraGrad.addColorStop(0.6, isAwakened ? 'rgba(217, 163, 80, 0.35)' : 'rgba(244, 208, 104, 0.25)');
      auraGrad.addColorStop(1, 'rgba(235, 215, 170, 0)');

      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, isHovered ? 48 : 34, 0, Math.PI * 2);
      ctx.fill();

      // 2. 传统北宋朱砂方印 / 椭圆御印章
      ctx.save();
      ctx.translate(sx, sy);

      // 印章尺寸
      const sealSize = isHovered ? 42 : 36;
      ctx.shadowColor = isAwakened ? 'rgba(244, 208, 104, 0.8)' : 'rgba(180, 40, 20, 0.6)';
      ctx.shadowBlur = isHovered ? 14 : 8;

      // 朱砂印泥底色
      ctx.fillStyle = isAwakened ? '#9C2518' : '#B83220';
      ctx.strokeStyle = isAwakened ? '#FFDF78' : '#FCE8BD';
      ctx.lineWidth = isAwakened ? 2.0 : 1.5;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize, 5);
      } else {
        ctx.rect(-sealSize / 2, -sealSize / 2, sealSize, sealSize);
      }
      ctx.fill();
      ctx.stroke();

      // 印文内双线框
      ctx.strokeStyle = isAwakened ? 'rgba(255, 223, 120, 0.75)' : 'rgba(252, 232, 189, 0.6)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-sealSize / 2 + 3, -sealSize / 2 + 3, sealSize - 6, sealSize - 6);

      // 印中文本（白文 / 朱文篆意）
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFF8EB';
      ctx.font = `bold ${isHovered ? 13 : 12}px "STSong", "Songti SC", "SimSun", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(beast.name, 0, 0);

      ctx.restore();

      // 3. 伴随印章的悬浮令签小标
      ctx.save();
      const badgeY = sy + (sealSize / 2) + 14;
      const text = isAwakened ? `【${beast.sealText}】` : `【寻访 · ${beast.name}】`;

      ctx.font = '11px "STSong", "Songti SC", "SimSun", serif';
      const tw = ctx.measureText(text).width;

      ctx.fillStyle = 'rgba(28, 22, 16, 0.82)';
      ctx.strokeStyle = isAwakened ? '#F4D068' : 'rgba(244, 208, 104, 0.5)';
      ctx.lineWidth = 1;

      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(sx - tw / 2 - 8, badgeY - 9, tw + 16, 18, 3);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(sx - tw / 2 - 8, badgeY - 9, tw + 16, 18);
        ctx.strokeRect(sx - tw / 2 - 8, badgeY - 9, tw + 16, 18);
      }

      ctx.fillStyle = isAwakened ? '#FFDF78' : '#FAF3DF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, sx, badgeY);

      // 若悬停，在上方显示文学线索小签
      if (isHovered) {
        const hintY = sy - (sealSize / 2) - 18;
        const hintText = beast.hint;
        ctx.font = '12px "STSong", "Songti SC", "SimSun", serif';
        const hw = ctx.measureText(hintText).width;

        ctx.fillStyle = 'rgba(23, 30, 28, 0.92)';
        ctx.strokeStyle = '#E8C547';
        ctx.lineWidth = 1.2;

        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(sx - hw / 2 - 10, hintY - 11, hw + 20, 22, 4);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(sx - hw / 2 - 10, hintY - 11, hw + 20, 22);
        }

        ctx.fillStyle = '#FFECA8';
        ctx.fillText(hintText, sx, hintY);
      }

      ctx.restore();
    });

    ctx.restore();
  }

  _drawScrollMounting(ctx, w, h) {
    ctx.save();

    // 1. 顶部天头与底部地脚宋代暗金花绫装裱纹
    const borderH = 8;
    const borderGrad = ctx.createLinearGradient(0, 0, 0, borderH);
    borderGrad.addColorStop(0, '#5C4426');
    borderGrad.addColorStop(0.5, '#A88448');
    borderGrad.addColorStop(1, '#6E502B');

    // 顶边天头
    ctx.fillStyle = borderGrad;
    ctx.fillRect(0, 0, w, borderH);

    // 底边地脚
    ctx.fillRect(0, h - borderH, w, borderH);

    // 细金线压边
    ctx.fillStyle = '#E5C070';
    ctx.fillRect(0, borderH, w, 1.5);
    ctx.fillRect(0, h - borderH - 1.5, w, 1.5);

    ctx.restore();
  }

  _drawMinimap(ctx, w, h) {
    const mmW = Math.min(w * 0.72, 720);
    const mmH = 34;
    const mmX = (w - mmW) / 2;
    const mmY = h - mmH - 18;

    ctx.save();

    // 1. 小地图古锦底框
    ctx.fillStyle = 'rgba(22, 20, 16, 0.88)';
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.65)';
    ctx.lineWidth = 1.5;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4, 6);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
      ctx.strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
    }

    // 2. 绘制连续微缩真迹画作条
    const scaleX = mmW / this.virtualWidth;
    for (const sec of this.sections) {
      const sx = mmX + sec.startX * scaleX;
      const sw = sec.width * scaleX;
      const thumb = this.thumbImages.get(sec.id) || this.sectionImages.get(sec.id);

      if (thumb && thumb.complete && thumb.naturalWidth > 0) {
        ctx.drawImage(thumb, sx, mmY, sw, mmH);
      } else {
        ctx.fillStyle = '#3A4D45';
        ctx.fillRect(sx, mmY, sw, mmH);
      }
    }

    // 3. 标记六方神兽在微缩图上的御印圆点
    BEASTS.forEach(b => {
      const bx = mmX + b.virtualX * scaleX;
      const isAwakened = this.awakenedMap[b.id];

      ctx.fillStyle = isAwakened ? '#FFE27A' : '#D9453B';
      ctx.beginPath();
      ctx.arc(bx, mmY + mmH / 2, isAwakened ? 5.0 : 3.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 4. 绘制当前可视区域滑块框 (Gold Viewport Window)
    const scale = this._getRenderScale();
    const vpW = Math.max(24, (w / (this.virtualWidth * scale)) * mmW);
    const vpX = mmX + (this.scrollX / (this.virtualWidth * scale)) * mmW;

    ctx.strokeStyle = '#FFE072';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 224, 114, 0.22)';

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(Math.max(mmX, Math.min(mmX + mmW - vpW, vpX)), mmY - 1, vpW, mmH + 2, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(Math.max(mmX, Math.min(mmX + mmW - vpW, vpX)), mmY - 1, vpW, mmH + 2);
      ctx.strokeRect(Math.max(mmX, Math.min(mmX + mmW - vpW, vpX)), mmY - 1, vpW, mmH + 2);
    }

    // 5. 提示语
    ctx.fillStyle = 'rgba(245, 230, 200, 0.75)';
    ctx.font = '10px "STSong", "Songti SC", "SimSun", serif';
    ctx.textAlign = 'left';
    ctx.fillText('千里江山全景鸟瞰 · 点击移步换景', mmX + 8, mmY - 6);

    ctx.restore();
  }
}
