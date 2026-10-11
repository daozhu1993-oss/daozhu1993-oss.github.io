/**
 * 《千里江山 · 山海入画》长卷游目引擎 (Panoramic Scroll Engine)
 * 纯 Canvas 2D 实时绘制宋代青绿山水移步换景长卷，支持视差层叠、印章定位与微动异象
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
    this.onProgressChange = options.onProgressChange || (() => {});

    // 长卷尺寸 (虚拟画布跨度)
    this.virtualWidth = 8400;
    this.virtualHeight = 1200;

    // 视口与滚动状态
    this.scrollX = 0;
    this.targetScrollX = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startScrollX = 0;
    this.velocity = 0;
    this.lastX = 0;

    // 异象悬停检测
    this.hoveredBeast = null;
    this.animTime = 0;

    // 唤醒状态映射
    this.awakenedMap = {};
    BEASTS.forEach(b => { this.awakenedMap[b.id] = false; });

    this._initEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._renderLoop();
  }

  setAwakened(beastId) {
    this.awakenedMap[beastId] = true;
  }

  getAwakenedCount() {
    return Object.values(this.awakenedMap).filter(Boolean).length;
  }

  scrollToProgress(p, smooth = true) {
    const maxScroll = Math.max(0, this.virtualWidth - this.width);
    const target = p * maxScroll;
    if (smooth) {
      this.targetScrollX = target;
    } else {
      this.targetScrollX = target;
      this.scrollX = target;
    }
  }

  _resize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  _initEvents() {
    // 鼠标滚轮横向推进
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      audio.ensureContext();
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.5;
      this.targetScrollX = Math.max(0, Math.min(this.virtualWidth - this.width, this.targetScrollX + delta));
      if (Math.abs(delta) > 30 && Math.random() < 0.08) {
        audio.playScrollWhoosh();
      }
    }, { passive: false });

    // 鼠标/触控拖拽
    const onStart = (clientX) => {
      audio.ensureContext();
      this.isDragging = true;
      this.startX = clientX;
      this.lastX = clientX;
      this.startScrollX = this.targetScrollX;
      this.velocity = 0;
    };

    const onMove = (clientX) => {
      // 鼠标悬停异象探测
      this._checkHover(clientX);
      if (!this.isDragging) return;
      const dx = clientX - this.startX;
      this.velocity = clientX - this.lastX;
      this.lastX = clientX;
      const maxScroll = Math.max(0, this.virtualWidth - this.width);
      this.targetScrollX = Math.max(0, Math.min(maxScroll, this.startScrollX - dx));
    };

    const onEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      // 惯性滑行
      this.targetScrollX = Math.max(0, Math.min(
        Math.max(0, this.virtualWidth - this.width),
        this.targetScrollX - this.velocity * 12
      ));
    };

    this.container.addEventListener('mousedown', (e) => onStart(e.clientX));
    window.addEventListener('mousemove', (e) => onMove(e.clientX));
    window.addEventListener('mouseup', onEnd);

    this.container.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX), { passive: true });
    window.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });
    window.addEventListener('touchend', onEnd);

    // 点击异象标记直接入画
    this.container.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const clickedBeast = this._hitTestBeast(mouseX, mouseY);
      if (clickedBeast) {
        audio.playEnterPaintingSound();
        this.onEnter3D(clickedBeast.id);
      }
    });
  }

  _checkHover(screenX) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseY = (window.event ? window.event.clientY : this.height / 2) - rect.top;
    const beast = this._hitTestBeast(screenX, mouseY);
    if (beast !== this.hoveredBeast) {
      this.hoveredBeast = beast;
      this.container.style.cursor = beast ? 'pointer' : (this.isDragging ? 'grabbing' : 'grab');
    }
  }

  _hitTestBeast(screenX, screenY) {
    const scale = this.height / this.virtualHeight;
    for (const beast of BEASTS) {
      const vx = beast.scrollProgress * this.virtualWidth;
      const vy = this.virtualHeight * 0.48;
      const sx = (vx - this.scrollX) * scale + (this.width - this.virtualWidth * scale) * 0;
      const sy = vy * scale;
      const dist = Math.hypot(screenX - (vx - this.scrollX), screenY - sy);
      if (dist < 55) {
        return beast;
      }
    }
    return null;
  }

  _renderLoop() {
    this.animTime += 0.016;

    // 平滑缓动插值
    this.scrollX += (this.targetScrollX - this.scrollX) * 0.085;
    const maxScroll = Math.max(1, this.virtualWidth - this.width);
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

    // 1. 宋代古绢底色 (温润微黄古绢底，含自然矿物微纹)
    const silkGradient = ctx.createLinearGradient(0, 0, 0, h);
    silkGradient.addColorStop(0, '#EFE4CD');
    silkGradient.addColorStop(0.5, '#E9DEC2');
    silkGradient.addColorStop(1, '#DFD0AE');
    ctx.fillStyle = silkGradient;
    ctx.fillRect(0, 0, w, h);

    // 绢纹质感微颗粒
    ctx.fillStyle = 'rgba(120, 95, 60, 0.035)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }

    const scale = h / this.virtualHeight;
    const currentVirtualX = this.scrollX;

    // 2. 远景群峰 (淡墨、烟岚、极远石青淡彩)
    this._drawMountainLayer(ctx, currentVirtualX * 0.35, h * 0.52, '#9BA8A4', '#B6C4BF', 0.25, 420);

    // 3. 中景千峰 (青绿重彩主峰，王希孟石青石绿层峦叠嶂)
    this._drawMountainLayer(ctx, currentVirtualX * 0.65, h * 0.68, '#266766', '#1F5352', 0.65, 580);

    // 4. 水系与长河浩渺 (江波琉璃，泥金水纹)
    this._drawRiverWater(ctx, currentVirtualX, h);

    // 5. 近景险石、古松、长桥、水榭、飞瀑
    this._drawForegroundDetails(ctx, currentVirtualX, h);

    // 6. 绘制神兽异象灵光点与宋代朱砂印章
    this._drawBeastAnomalies(ctx, currentVirtualX, h);

    // 7. 画面两端宋画装裱长卷边框与题跋引首
    this._drawScrollBorders(ctx, w, h);
  }

  // 绘制层峦叠嶂山脉
  _drawMountainLayer(ctx, offsetX, baseY, color1, color2, alpha, peakHeight) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(-100, this.height);

    const step = 80;
    const count = Math.ceil(this.width / step) + 4;
    const startIdx = Math.floor(offsetX / step);

    for (let i = -2; i <= count; i++) {
      const worldX = (startIdx + i) * step;
      const screenX = worldX - offsetX;
      // 叠加多重正弦波构建中国画峰峦起伏
      const n1 = Math.sin(worldX * 0.0018) * peakHeight;
      const n2 = Math.sin(worldX * 0.0054 + 1.2) * (peakHeight * 0.45);
      const n3 = Math.cos(worldX * 0.012) * (peakHeight * 0.2);
      const py = baseY - Math.abs(n1 + n2 + n3);

      if (i === -2) ctx.lineTo(screenX, py);
      else ctx.lineTo(screenX, py);
    }

    ctx.lineTo(this.width + 100, this.height);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, baseY - peakHeight, 0, this.height);
    grad.addColorStop(0, color1);
    grad.addColorStop(0.7, color2);
    grad.addColorStop(1, '#D8C7A5');
    ctx.fillStyle = grad;
    ctx.fill();

    // 斧劈皴金线勾勒
    ctx.strokeStyle = 'rgba(238, 204, 114, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  // 绘制长河烟波
  _drawRiverWater(ctx, offsetX, h) {
    const waterY = h * 0.65;
    ctx.save();
    const waterGrad = ctx.createLinearGradient(0, waterY, 0, h);
    waterGrad.addColorStop(0, 'rgba(164, 196, 188, 0.4)');
    waterGrad.addColorStop(0.5, 'rgba(102, 148, 142, 0.55)');
    waterGrad.addColorStop(1, 'rgba(216, 199, 165, 0.8)');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, waterY, this.width, h - waterY);

    // 泥金细密水纹涟漪
    ctx.strokeStyle = 'rgba(238, 208, 126, 0.22)';
    ctx.lineWidth = 1;
    const waveCount = 12;
    for (let i = 0; i < waveCount; i++) {
      const wy = waterY + (i + 1) * ((h - waterY) / waveCount);
      ctx.beginPath();
      for (let x = 0; x < this.width; x += 30) {
        const offsetWave = Math.sin((x + offsetX + i * 45) * 0.02 + this.animTime * 1.5) * 2.5;
        if (x === 0) ctx.moveTo(x, wy + offsetWave);
        else ctx.lineTo(x, wy + offsetWave);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 绘制近景长桥、松林、楼台
  _drawForegroundDetails(ctx, offsetX, h) {
    ctx.save();
    // 漫卷沿途根据 progress 绘制特色名胜地标
    SCENIC_SECTIONS.forEach(sec => {
      const secCenterWorldX = ((sec.range[0] + sec.range[1]) / 2) * this.virtualWidth;
      const screenX = secCenterWorldX - offsetX;
      if (screenX > -300 && screenX < this.width + 300) {
        this._drawScenicArchitecture(ctx, screenX, h * 0.72, sec.id);
      }
    });
    ctx.restore();
  }

  // 绘制特定桥榭
  _drawScenicArchitecture(ctx, x, y, secId) {
    ctx.save();
    ctx.fillStyle = '#6D5B45';
    ctx.strokeStyle = '#382D20';
    ctx.lineWidth = 1.5;

    if (secId === 0) {
      // 桃溪小桥与孤舟
      ctx.fillRect(x - 40, y - 8, 80, 5);
      ctx.beginPath();
      ctx.arc(x, y - 8, 16, Math.PI, 0);
      ctx.stroke();
    } else if (secId === 1) {
      // 绝壁飞瀑
      const grad = ctx.createLinearGradient(x - 10, y - 180, x + 10, y);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
      grad.addColorStop(1, 'rgba(117, 185, 190, 0.3)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 6, y - 160, 12, 160);
    } else if (secId === 2) {
      // 农家柴扉与层层梯田
      ctx.strokeStyle = '#A38D64';
      ctx.strokeRect(x - 25, y - 30, 50, 24);
    } else if (secId === 3) {
      // 关隘石桥与长亭
      ctx.fillRect(x - 50, y - 14, 100, 7);
      ctx.fillRect(x - 15, y - 38, 30, 24);
    } else if (secId === 4) {
      // 孤刹悬云塔影
      ctx.beginPath();
      ctx.moveTo(x, y - 120);
      ctx.lineTo(x + 14, y - 50);
      ctx.lineTo(x - 14, y - 50);
      ctx.closePath();
      ctx.fillStyle = '#45382B';
      ctx.fill();
    } else if (secId === 5) {
      // 水心百尺重檐高阁
      ctx.fillRect(x - 35, y - 55, 70, 48);
      ctx.beginPath();
      ctx.moveTo(x - 45, y - 55);
      ctx.lineTo(x, y - 75);
      ctx.lineTo(x + 45, y - 55);
      ctx.closePath();
      ctx.fillStyle = '#874C37';
      ctx.fill();
    }
    ctx.restore();
  }

  // 绘制神兽异象灵符与古玺印章
  _drawBeastAnomalies(ctx, offsetX, h) {
    BEASTS.forEach(beast => {
      const worldX = beast.scrollProgress * this.virtualWidth;
      const screenX = worldX - offsetX;
      const screenY = h * 0.48;

      if (screenX < -150 || screenX > this.width + 150) return;

      const isAwakened = this.awakenedMap[beast.id];
      const isHovered = this.hoveredBeast === beast;

      ctx.save();
      ctx.translate(screenX, screenY);

      if (isAwakened) {
        // 已唤醒：盖上宋代朱砂朱文大印 + 袅袅金烟
        this._drawCinnabarSeal(ctx, beast.sealText, isHovered);

        // 持续升腾的金光微尘
        ctx.fillStyle = 'rgba(244, 208, 104, 0.45)';
        for (let i = 0; i < 5; i++) {
          const pY = -35 - (this.animTime * 25 + i * 18) % 60;
          const pX = Math.sin(this.animTime * 2 + i) * 14;
          ctx.beginPath();
          ctx.arc(pX, pY, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // 未唤醒：神兽隐灵异象（金色呼吸光晕、八卦八角阵纹）
        const pulse = Math.sin(this.animTime * 2.8) * 0.2 + 0.8;
        const radius = (isHovered ? 36 : 28) * pulse;

        // 泥金灵气光晕
        const auraGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
        auraGrad.addColorStop(0, 'rgba(255, 230, 138, 0.85)');
        auraGrad.addColorStop(0.5, 'rgba(212, 175, 55, 0.4)');
        auraGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        // 旋转太极与星芒角
        ctx.save();
        ctx.rotate(this.animTime * 0.6);
        ctx.strokeStyle = 'rgba(244, 208, 104, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-12, -12, 24, 24);
        ctx.restore();

        // 中心光核
        ctx.fillStyle = '#FFF8DB';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        // 异象名牌标签
        ctx.font = '12px "Noto Serif SC", serif';
        ctx.fillStyle = '#483C2A';
        ctx.textAlign = 'center';
        ctx.fillText(beast.name, 0, 36);

        if (isHovered) {
          // 悬停时展现诗意提示
          ctx.font = 'bold 13px "Noto Serif SC", serif';
          ctx.fillStyle = '#A32929';
          ctx.fillText(`【点击入画寻访 · ${beast.name}】`, 0, -42);
        }
      }

      ctx.restore();
    });
  }

  // 绘制宋代朱砂印章
  _drawCinnabarSeal(ctx, text, isHovered) {
    const size = isHovered ? 42 : 36;
    ctx.save();
    // 朱砂红微泛印泥厚重感
    ctx.fillStyle = 'rgba(168, 38, 28, 0.9)';
    ctx.strokeStyle = 'rgba(138, 25, 18, 0.95)';
    ctx.lineWidth = 2;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    // 印文（仿九叠篆四字排布）
    ctx.font = `bold ${size * 0.32}px "Noto Serif SC", serif`;
    ctx.fillStyle = '#FFF5E6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const c1 = text[0] || '神';
    const c2 = text[1] || '兽';
    const c3 = text[2] || '之';
    const c4 = text[3] || '印';

    ctx.fillText(c1, -size * 0.22, -size * 0.22);
    ctx.fillText(c2, size * 0.22, -size * 0.22);
    ctx.fillText(c3, -size * 0.22, size * 0.22);
    ctx.fillText(c4, size * 0.22, size * 0.22);

    ctx.restore();
  }

  // 卷轴两端红木轴杆与锦缎包边
  _drawScrollBorders(ctx, w, h) {
    // 卷轴上下泥金绢边
    ctx.fillStyle = '#876D46';
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);

    ctx.fillStyle = 'rgba(238, 204, 114, 0.5)';
    ctx.fillRect(0, 6, w, 2);
    ctx.fillRect(0, h - 8, w, 2);
  }
}
