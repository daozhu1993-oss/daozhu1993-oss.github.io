/**
 * 别洒了，鹈鹕！(A MOUTHFUL OF FISH · THE SLOW CLUB)
 * 核心游戏逻辑与渲染引擎 - 优化版 (精准吸鱼判定 + 狂蹬加速冲刺系统)
 */

class PelicanGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = 800;
    this.height = 580;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.audio = new PelicanAudio();
    this.poster = new PelicanPoster();

    // 模式状态
    const urlParams = new URLSearchParams(window.location.search);
    this.isGbMode = urlParams.get('mode') === 'gb';
    this.isDarkMode = false;

    // 基础数值
    this.totalTime = 35; // 35秒到达码头
    this.timeLeft = this.totalTime;
    this.fishCount = 0;
    this.lostCount = 0;
    this.gameState = 'READY'; // READY, RUNNING, PAUSED, ARRIVED

    // 速度与加速系统 (狂蹬冲刺)
    this.baseSpeed = 3.8;
    this.sprintSpeed = 7.6;
    this.speed = this.baseSpeed;
    this.isSprinting = false;

    // 鹈鹕操控与物理
    this.isHolding = false;
    this.beakProgress = 0; // 0: 闭合护鱼, 1: 大嘴囊张开
    this.pedalAngle = 0;
    this.bikeYOffset = 0;
    this.bikeYVel = 0;
    this.shakeIntensity = 0;

    // 视差与背景
    this.scrollX = 0;
    this.windStreaks = [];
    for (let i = 0; i < 8; i++) {
      this.windStreaks.push({
        x: Math.random() * this.width,
        y: 80 + Math.random() * 320,
        len: 40 + Math.random() * 80,
        speed: 8 + Math.random() * 8
      });
    }

    // 实体队列
    this.fishList = [];
    this.bumpList = [];
    this.particleList = [];
    this.spilledFishList = [];
    this.toastList = [];

    // 定时生成器
    this.nextFishTime = 0.8;
    this.nextBumpTime = 4.0;
    this.lastTimestamp = 0;

    // DOM 引用
    this.timerValEl = document.getElementById('timer-val');
    this.fishValEl = document.getElementById('fish-val');
    this.lostValEl = document.getElementById('lost-val');
    this.topFillEl = document.getElementById('card-top-fill');
    this.holdBtn = document.getElementById('btn-hold');
    this.sprintBtn = document.getElementById('btn-sprint');
    this.pauseBtn = document.getElementById('btn-pause');
    this.hintBanner = document.getElementById('hint-banner');
    this.modalOverlay = document.getElementById('settle-modal');

    this.initModeUI();
    this.bindEvents();
    this.startLoop();
  }

  initModeUI() {
    if (this.isGbMode) {
      document.body.classList.add('gb-mode');
      const modeBtn = document.getElementById('btn-mode-toggle');
      if (modeBtn) modeBtn.innerHTML = '<span>🎨</span> 绘本模式';
      this.audio.setGbMode(true);
    }
  }

  toggleMode() {
    this.isGbMode = !this.isGbMode;
    document.body.classList.toggle('gb-mode', this.isGbMode);
    const modeBtn = document.getElementById('btn-mode-toggle');
    if (modeBtn) {
      modeBtn.innerHTML = this.isGbMode ? '<span>🎨</span> 绘本模式' : '<span>📟</span> GB像素';
    }
    this.audio.setGbMode(this.isGbMode);
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    document.body.classList.toggle('dark-mode', this.isDarkMode);
    const darkBtn = document.getElementById('btn-theme-toggle');
    if (darkBtn) {
      darkBtn.textContent = this.isDarkMode ? '☼' : '☾';
    }
  }

  setSprint(sprinting) {
    if (this.gameState === 'READY') {
      this.gameState = 'RUNNING';
      this.audio.startBgm();
      this.audio.ringBell();
    }
    this.isSprinting = sprinting;
    if (this.sprintBtn) {
      this.sprintBtn.classList.toggle('sprinting', sprinting);
    }
    if (this.hintBanner) {
      this.hintBanner.classList.toggle('sprinting', sprinting);
      if (sprinting) {
        this.hintBanner.textContent = '⚡ 狂蹬冲刺中！倒计时快速前进，小心颠簸！';
      } else {
        this.hintBanner.textContent = '松开时护鱼 · 想接鱼就按住';
      }
    }
    if (sprinting) {
      this.vibrate(18);
    }
  }

  bindEvents() {
    const setHold = (holding) => {
      if (this.gameState === 'READY') {
        this.gameState = 'RUNNING';
        this.audio.startBgm();
        this.audio.ringBell();
      }
      if (this.gameState !== 'RUNNING') return;

      this.isHolding = holding;
      if (this.holdBtn) {
        this.holdBtn.classList.toggle('holding', holding);
      }
      if (holding) {
        this.vibrate(12);
      }
    };

    // 1. 张嘴主按键
    if (this.holdBtn) {
      this.holdBtn.addEventListener('mousedown', (e) => { e.preventDefault(); setHold(true); });
      window.addEventListener('mouseup', () => setHold(false));
      this.holdBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setHold(true); }, { passive: false });
      window.addEventListener('touchend', () => setHold(false));
      window.addEventListener('touchcancel', () => setHold(false));
    }

    // 2. 狂蹬加速冲刺按键
    if (this.sprintBtn) {
      this.sprintBtn.addEventListener('mousedown', (e) => { e.preventDefault(); this.setSprint(true); });
      window.addEventListener('mouseup', () => this.setSprint(false));
      this.sprintBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.setSprint(true); }, { passive: false });
      window.addEventListener('touchend', () => this.setSprint(false));
      window.addEventListener('touchcancel', () => this.setSprint(false));
    }

    // 3. 画布触控分区：点击左侧张嘴，点击右侧狂蹬加速！
    const canvasWrap = document.querySelector('.canvas-wrapper');
    if (canvasWrap) {
      canvasWrap.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = canvasWrap.getBoundingClientRect();
        const touch = e.touches[0];
        if (touch.clientX - rect.left > rect.width * 0.6) {
          this.setSprint(true);
        } else {
          setHold(true);
        }
      }, { passive: false });

      canvasWrap.addEventListener('touchend', (e) => {
        setHold(false);
        this.setSprint(false);
      });

      canvasWrap.addEventListener('mousedown', (e) => {
        const rect = canvasWrap.getBoundingClientRect();
        if (e.clientX - rect.left > rect.width * 0.6) {
          this.setSprint(true);
        } else {
          setHold(true);
        }
      });
      window.addEventListener('mouseup', () => {
        setHold(false);
        this.setSprint(false);
      });
    }

    // 4. 键盘操作：空格/A/Enter 张嘴；右箭头/D/Shift 狂蹬加速
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (e.code === 'Space' || key === ' ' || key === 'a' || e.code === 'Enter') {
        e.preventDefault();
        setHold(true);
      } else if (e.code === 'ArrowRight' || key === 'd' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        this.setSprint(true);
      } else if (key === 'p') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (e.code === 'Space' || key === ' ' || key === 'a' || e.code === 'Enter') {
        setHold(false);
      } else if (e.code === 'ArrowRight' || key === 'd' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.setSprint(false);
      }
    });

    // 暂停
    if (this.pauseBtn) {
      this.pauseBtn.addEventListener('click', () => this.togglePause());
    }

    // 结算海报
    const btnPoster = document.getElementById('btn-export-poster');
    if (btnPoster) {
      btnPoster.addEventListener('click', () => {
        const stats = this.getStatsReport();
        this.poster.download(stats);
      });
    }

    // 再来一局
    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => this.restart());
    }
  }

  togglePause() {
    if (this.gameState === 'RUNNING') {
      this.gameState = 'PAUSED';
      this.pauseBtn.querySelector('.pause-text').textContent = '继续';
      this.audio.stopBgm();
    } else if (this.gameState === 'PAUSED') {
      this.gameState = 'RUNNING';
      this.pauseBtn.querySelector('.pause-text').textContent = '暂停';
      this.audio.startBgm();
    }
  }

  vibrate(ms) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  }

  addToast(text, color, x, y) {
    this.toastList.push({
      text,
      color,
      x: x || 340,
      y: y || 200,
      alpha: 1,
      vy: -1.4
    });
  }

  addSparkles(x, y, color = '#F2AF42') {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particleList.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 3 + Math.random() * 3,
        alpha: 1
      });
    }
  }

  restart() {
    this.modalOverlay.classList.remove('active');
    this.timeLeft = this.totalTime;
    this.fishCount = 0;
    this.lostCount = 0;
    this.speed = this.baseSpeed;
    this.isSprinting = false;
    this.gameState = 'RUNNING';
    this.fishList = [];
    this.bumpList = [];
    this.particleList = [];
    this.spilledFishList = [];
    this.toastList = [];
    this.nextFishTime = 0.8;
    this.nextBumpTime = 3.5;
    this.updateHUD();
    this.audio.startBgm();
    this.audio.ringBell();
  }

  updateHUD() {
    if (this.timerValEl) this.timerValEl.textContent = Math.ceil(this.timeLeft);
    if (this.fishValEl) this.fishValEl.textContent = this.fishCount;
    if (this.lostValEl) this.lostValEl.textContent = this.lostCount;
    if (this.topFillEl) {
      const progress = ((this.totalTime - this.timeLeft) / this.totalTime) * 100;
      this.topFillEl.style.width = `${progress}%`;
    }
  }

  startLoop() {
    const loop = (timestamp) => {
      if (!this.lastTimestamp) this.lastTimestamp = timestamp;
      const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
      this.lastTimestamp = timestamp;

      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ════════════════════════════════════════════════════════════
  // 核心状态更新与物理计算
  // ════════════════════════════════════════════════════════════
  update(dt) {
    if (this.gameState !== 'RUNNING') {
      this.pedalAngle += 0.8 * dt;
      return;
    }

    // 1. 速度过渡与狂蹬冲刺
    const targetSpeed = this.isSprinting ? this.sprintSpeed : this.baseSpeed;
    this.speed += (targetSpeed - this.speed) * 8 * dt;

    // 倒计时扣减 (加速时路程进度成倍递进！)
    this.timeLeft -= (this.speed / this.baseSpeed) * dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.gameState = 'ARRIVED';
      this.updateHUD();
      this.audio.reachDock();
      setTimeout(() => this.showSettlement(), 900);
    }
    this.updateHUD();

    // 2. 鹈鹕大嘴张开与闭合动画 (果冻柔和过渡)
    const targetBeak = this.isHolding ? 1.0 : 0.0;
    const lerpSpeed = this.isHolding ? 12.0 : 18.0;
    this.beakProgress += (targetBeak - this.beakProgress) * lerpSpeed * dt;

    // 3. 自行车踩踏与滚动视差
    this.pedalAngle += (this.speed * 3.6) * dt;
    this.scrollX += this.speed * 65 * dt;

    // 4. 车架悬挂弹性与路面反馈
    this.bikeYOffset += this.bikeYVel * dt;
    this.bikeYVel -= this.bikeYOffset * 45 * dt;
    this.bikeYVel *= 0.86;

    if (this.shakeIntensity > 0) {
      this.shakeIntensity -= dt * 20;
      if (this.shakeIntensity < 0) this.shakeIntensity = 0;
    }

    // 更新冲刺风线
    for (const w of this.windStreaks) {
      w.x -= (this.speed * 70 + w.speed * 20) * dt;
      if (w.x < -100) {
        w.x = this.width + Math.random() * 100;
        w.y = 80 + Math.random() * 320;
      }
    }

    // 5. 定时生成飞鱼 (频率提高，节奏更欢快)
    this.nextFishTime -= dt;
    if (this.nextFishTime <= 0) {
      this.spawnFish();
      this.nextFishTime = 1.0 + Math.random() * 1.6;
    }

    // 6. 生成路面颠簸
    this.nextBumpTime -= dt;
    if (this.nextBumpTime <= 0) {
      this.spawnBump();
      this.nextBumpTime = 3.8 + Math.random() * 3.0;
    }

    // 7. 【核心修复】飞鱼运动与吞食判定
    // 嘴部实际中心坐标：(px=220 + 125, py=395 - 180 + bikeYOffset + beakOffset)
    const mouthCenterX = 345;
    const mouthCenterY = 225 + this.bikeYOffset + this.beakProgress * 25;

    for (let i = this.fishList.length - 1; i >= 0; i--) {
      const f = this.fishList[i];

      // 水平运动
      f.x -= (this.speed * 48 + f.vx) * dt;
      // 垂直重力抛物线
      f.y += f.vy * dt;
      f.vy += f.gravity * dt;

      // 距离嘴部中心
      const dx = f.x - mouthCenterX;
      const dy = f.y - mouthCenterY;
      const dist = Math.hypot(dx, dy);

      // 磁吸效应 (如果玩家正按住张嘴，嘴部产生海风吸力！)
      if (this.beakProgress > 0.15 && f.x >= 240 && f.x <= 480 && Math.abs(dy) < 90) {
        f.x -= 100 * dt;
        f.y += (mouthCenterY - f.y) * 6.5 * dt;
      }

      // 【核心吞食判定范围】
      if ((dist < 65) || (f.x >= 260 && f.x <= 390 && Math.abs(dy) < 55)) {
        if (this.beakProgress > 0.15) {
          // 张嘴状态：吃到鱼了！
          const gain = f.type === 'golden' ? 2 : 1;
          this.fishCount += gain;
          this.audio.catchFish();
          this.vibrate(25);
          this.addSparkles(f.x, f.y, f.type === 'golden' ? '#FFD700' : '#4CA3D9');
          this.addToast(gain === 2 ? '+2 金鱼！' : '+1 鲜鱼', '#294A3E', mouthCenterX, mouthCenterY - 30);
          this.fishList.splice(i, 1);
          continue;
        } else {
          // 嘴闭着，鱼撞击上喙反弹！
          if (!f.bounced && f.x <= 370) {
            f.bounced = true;
            f.vx = -120;
            f.vy = -160;
            this.addToast('没张嘴！', '#847F75', f.x, f.y - 20);
          }
        }
      }

      if (f.x < -100 || f.y > this.height + 60) {
        this.fishList.splice(i, 1);
      }
    }

    // 8. 颠簸碾压与颠洒判定
    const bikeWheelX = 220;
    for (let i = this.bumpList.length - 1; i >= 0; i--) {
      const b = this.bumpList[i];
      b.x -= this.speed * 65 * dt;

      if (!b.hit && Math.abs(b.x - bikeWheelX) < 28) {
        b.hit = true;
        this.bikeYVel = this.isSprinting ? -220 : -160;
        this.shakeIntensity = this.isSprinting ? 12 : 8;
        this.audio.bump();

        // 核心判定：碾过时是否正张着嘴？
        if (this.beakProgress > 0.25) {
          const lostAmount = Math.min(this.fishCount > 4 ? 2 : 1, this.fishCount);
          if (lostAmount > 0) {
            this.fishCount -= lostAmount;
            this.lostCount += lostAmount;
            this.audio.spillFish();
            this.vibrate(50);
            this.triggerSpill(lostAmount, mouthCenterX - 20, mouthCenterY);
            this.addToast(`-${lostAmount} 颠洒了！`, '#DF714B', mouthCenterX + 20, mouthCenterY - 40);
            if (this.hintBanner) {
              this.hintBanner.classList.add('alert-bump');
              setTimeout(() => this.hintBanner.classList.remove('alert-bump'), 600);
            }
          }
        } else {
          this.addToast('稳住！', '#294A3E', mouthCenterX, mouthCenterY - 30);
          this.vibrate(10);
        }
      }

      if (b.x < -100) {
        this.bumpList.splice(i, 1);
      }
    }

    // 9. 更新粒子
    for (let i = this.particleList.length - 1; i >= 0; i--) {
      const p = this.particleList[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha -= dt * 2;
      if (p.alpha <= 0) {
        this.particleList.splice(i, 1);
      }
    }

    // 10. 更新颠飞的鱼粒子
    for (let i = this.spilledFishList.length - 1; i >= 0; i--) {
      const sp = this.spilledFishList[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 450 * dt;
      sp.rot += sp.vRot * dt;
      if (sp.y > 450) {
        this.spilledFishList.splice(i, 1);
      }
    }

    // 11. 更新飘字提示
    for (let i = this.toastList.length - 1; i >= 0; i--) {
      const t = this.toastList[i];
      t.y += t.vy;
      t.alpha -= dt * 1.6;
      if (t.alpha <= 0) {
        this.toastList.splice(i, 1);
      }
    }
  }

  /**
   * 【核心精修】生成保证飞向鹈鹕嘴部的飞鱼轨道
   */
  spawnFish() {
    const isLeap = Math.random() > 0.45;
    const isGolden = Math.random() < 0.2; // 20% 几率金鱼
    const type = isGolden ? 'golden' : (isLeap ? 'silver' : 'squid');

    const spawnX = this.width + 50;
    const targetX = 350;
    const targetY = 220 + (Math.random() - 0.5) * 30; // 鹈鹕大嘴高度

    let spawnY = 0;
    let vx = 160 + Math.random() * 40;
    let vy = 0;
    let gravity = 0;

    if (isLeap) {
      // 1. 海面飞跃鱼：从下部海面跃起，优美弧线直奔嘴部！
      spawnY = 320 + Math.random() * 50;
      gravity = 140;
      const speedX = this.speed * 48 + vx;
      const t = (spawnX - targetX) / speedX;
      vy = (targetY - spawnY - 0.5 * gravity * t * t) / t;
    } else {
      // 2. 迎风滑翔鱼：直接在嘴部高度水平滑行
      spawnY = 210 + (Math.random() - 0.5) * 40;
      gravity = 0;
      vy = (Math.random() - 0.5) * 20;
    }

    this.fishList.push({
      x: spawnX,
      y: spawnY,
      vx,
      vy,
      gravity,
      type,
      bounced: false
    });
  }

  spawnBump() {
    this.bumpList.push({
      x: this.width + 60,
      hit: false,
      type: Math.random() > 0.5 ? 'stone' : 'pothole'
    });
  }

  triggerSpill(count, x, y) {
    for (let i = 0; i < count; i++) {
      this.spilledFishList.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: 90 + Math.random() * 110,
        vy: -230 - Math.random() * 90,
        rot: Math.random() * Math.PI,
        vRot: 8 + Math.random() * 8
      });
    }
  }

  getStatsReport() {
    const total = this.fishCount + this.lostCount;
    const safeRateNum = total === 0 ? 100 : Math.round((this.fishCount / total) * 100);
    const safeRate = `${safeRateNum}%`;

    let title = '海边最稳的鸟';
    let rating = '特级送鲜员';
    let desc = '大嘴一张一合游刃有余，海风吹过纹丝不动！';

    if (this.lostCount === 0 && this.fishCount >= 10) {
      title = '特级绝鲜·大嘴护鱼宗师';
      rating = '绝品 5 星';
      desc = '滴水不漏！一整条海岸线都为你的大嘴鼓掌！';
    } else if (this.lostCount > this.fishCount) {
      title = '漏勺级鹈鹕·沿海喂鱼慈善家';
      rating = '随性游民';
      desc = '吃一条漏两条，沿海公路的小黄狗都吃饱了。';
    } else if (this.fishCount >= 6) {
      title = '海风稳健骑手';
      rating = '一级送鲜员';
      desc = '这一路海风虽急，但大部分鲜货已安全入港！';
    }

    return {
      fish: this.fishCount,
      lost: this.lostCount,
      safeRate,
      title,
      rating,
      desc
    };
  }

  showSettlement() {
    const report = this.getStatsReport();
    document.getElementById('settle-rating-title').textContent = `【${report.title}】`;
    document.getElementById('settle-rating-desc').textContent = report.desc;
    document.getElementById('settle-fish-count').textContent = report.fish;
    document.getElementById('settle-lost-count').textContent = report.lost;
    document.getElementById('settle-safe-rate').textContent = report.safeRate;

    this.modalOverlay.classList.add('active');
  }

  // ════════════════════════════════════════════════════════════
  // 画面渲染流水线
  // ════════════════════════════════════════════════════════════
  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.save();
    if (this.shakeIntensity > 0) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity;
      const sy = (Math.random() - 0.5) * this.shakeIntensity;
      ctx.translate(sx, sy);
    }

    if (this.isGbMode) {
      this.renderGb(ctx, w, h);
    } else {
      this.renderBook(ctx, w, h);
    }

    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════
  // 1. 法式绘本风渲染
  // ════════════════════════════════════════════════════════════
  renderBook(ctx, w, h) {
    // 天空
    ctx.fillStyle = this.isDarkMode ? '#172322' : '#CBE0DA';
    ctx.fillRect(0, 0, w, h);

    // 太阳 / 月亮
    ctx.fillStyle = this.isDarkMode ? '#F5EACF' : '#EAA958';
    ctx.beginPath();
    ctx.arc(580, 110, 48, 0, Math.PI * 2);
    ctx.fill();

    // 热气球吊篮
    const balloonOffset = Math.sin(this.scrollX * 0.005) * 12;
    ctx.fillStyle = this.isDarkMode ? '#9BA698' : '#294A3E';
    ctx.fillRect(572, 168 + balloonOffset, 16, 14);

    // 大海
    ctx.fillStyle = this.isDarkMode ? '#0F1C1B' : '#99BDB4';
    ctx.fillRect(0, h * 0.45, w, h * 0.25);

    // 远方红白灯塔
    const lightX = 660 - (this.scrollX * 0.2) % (w + 200);
    const lightY = h * 0.43;
    ctx.fillStyle = '#E8E3D7';
    ctx.fillRect(lightX, lightY, 18, 54);
    ctx.fillStyle = '#DF714B';
    ctx.fillRect(lightX, lightY + 16, 18, 12);
    ctx.fillRect(lightX, lightY + 38, 18, 12);

    // 沿海公路沙滩地面
    ctx.fillStyle = this.isDarkMode ? '#242C2A' : '#EDE8DC';
    ctx.fillRect(0, h * 0.68, w, h * 0.32);

    // 分界线
    ctx.strokeStyle = this.isDarkMode ? '#3A4542' : '#DCD5C6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.7);
    ctx.lineTo(w, h * 0.7);
    ctx.stroke();

    // 沿路小石子与草丛
    ctx.fillStyle = this.isDarkMode ? '#384844' : '#98B68C';
    for (let i = 0; i < 8; i++) {
      const decoX = ((i * 140 - this.scrollX) % (w + 140) + (w + 140)) % (w + 140) - 40;
      ctx.beginPath();
      ctx.arc(decoX, h * 0.7, 10, Math.PI, 0);
      ctx.fill();
    }

    // 渲染冲刺时的风速线
    if (this.isSprinting) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const st of this.windStreaks) {
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(st.x + st.len, st.y);
        ctx.stroke();
      }
    }

    // 渲染颠簸物
    this.renderBumps(ctx);

    // 渲染飞鱼
    this.renderFish(ctx);

    // 渲染主角：骑复古单车的鹈鹕
    this.renderPelican(ctx, 220, 395 + this.bikeYOffset);

    // 渲染吞食火花粒子
    this.renderParticles(ctx);

    // 渲染颠飞的鱼粒子
    this.renderSpilledFish(ctx);

    // 渲染浮动文字
    this.renderToasts(ctx);
  }

  // ════════════════════════════════════════════════════════════
  // 2. 8-Bit Game Boy 点阵像素风渲染
  // ════════════════════════════════════════════════════════════
  renderGb(ctx, w, h) {
    ctx.fillStyle = '#9BBC0F';
    ctx.fillRect(0, 0, w, h);

    // 海平面
    ctx.fillStyle = '#8BAC0F';
    ctx.fillRect(0, h * 0.48, w, h * 0.22);

    // 像素太阳
    ctx.fillStyle = '#306230';
    ctx.fillRect(560, 90, 48, 48);

    // 地面
    ctx.fillStyle = '#8BAC0F';
    ctx.fillRect(0, h * 0.7, w, h * 0.3);

    ctx.fillStyle = '#0F380F';
    ctx.fillRect(0, h * 0.7, w, 4);

    // 冲刺风线
    if (this.isSprinting) {
      ctx.fillStyle = '#306230';
      for (const st of this.windStreaks) {
        ctx.fillRect(st.x, st.y, st.len, 2);
      }
    }

    this.renderBumps(ctx, true);
    this.renderFish(ctx, true);
    this.renderPelican(ctx, 220, 395 + this.bikeYOffset, true);
    this.renderParticles(ctx, true);
    this.renderSpilledFish(ctx, true);
    this.renderToasts(ctx, true);
  }

  // 绘制鹈鹕与单车
  renderPelican(ctx, px, py, isGb = false) {
    ctx.save();
    const cMain = isGb ? '#0F380F' : '#2A2723';
    const cWhite = isGb ? '#9BBC0F' : '#FFFFFF';
    const cFrame = isGb ? '#306230' : '#DF714B';
    const cBeak = isGb ? '#306230' : '#F2AF42';
    const cPouch = isGb ? '#0F380F' : '#E79B2F';
    const cCap = isGb ? '#0F380F' : '#294A3E';

    // 1. 车轮
    const wheelR = 48;
    const frontX = px + 95;
    const backX = px - 75;
    const wheelY = py;

    const drawBikeWheel = (wx) => {
      ctx.strokeStyle = cMain;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(wx, wheelY, wheelR, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 8; i++) {
        const a = this.pedalAngle + (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(wx, wheelY);
        ctx.lineTo(wx + Math.cos(a) * (wheelR - 4), wheelY + Math.sin(a) * (wheelR - 4));
        ctx.stroke();
      }
    };

    drawBikeWheel(backX);
    drawBikeWheel(frontX);

    // 2. 车架
    ctx.strokeStyle = cFrame;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const crankX = px + 5;
    const crankY = wheelY - 2;
    const seatX = px - 28;
    const seatY = wheelY - 70;
    const handleX = px + 70;
    const handleY = wheelY - 85;

    ctx.beginPath();
    ctx.moveTo(backX, wheelY);
    ctx.lineTo(crankX, crankY);
    ctx.lineTo(seatX, seatY);
    ctx.lineTo(backX, wheelY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(crankX, crankY);
    ctx.lineTo(handleX, handleY);
    ctx.lineTo(frontX, wheelY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(seatX, seatY);
    ctx.lineTo(handleX, handleY);
    ctx.stroke();

    // 车座与车把手
    ctx.strokeStyle = cMain;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(seatX - 16, seatY - 4);
    ctx.lineTo(seatX + 16, seatY - 4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(handleX - 12, handleY - 10);
    ctx.lineTo(handleX + 22, handleY - 10);
    ctx.stroke();

    // 3. 鹈鹕大白身躯
    ctx.fillStyle = cWhite;
    ctx.strokeStyle = cMain;
    ctx.lineWidth = 3.5;

    ctx.beginPath();
    ctx.ellipse(px - 22, wheelY - 85, 60, 36, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 翘尾巴
    ctx.beginPath();
    ctx.moveTo(px - 72, wheelY - 88);
    ctx.lineTo(px - 95, wheelY - 105);
    ctx.lineTo(px - 78, wheelY - 80);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 颈部
    ctx.beginPath();
    ctx.moveTo(px + 10, wheelY - 95);
    ctx.quadraticCurveTo(px + 18, wheelY - 155, px + 30, wheelY - 175);
    ctx.lineTo(px + 62, wheelY - 175);
    ctx.quadraticCurveTo(px + 54, wheelY - 150, px + 48, wheelY - 90);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 头部
    const headX = px + 42;
    const headY = wheelY - 180;
    ctx.beginPath();
    ctx.arc(headX, headY, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 眼睛
    ctx.fillStyle = cMain;
    ctx.beginPath();
    ctx.arc(headX + 10, headY - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // 4. 【核心大嘴囊】
    const openOffset = this.beakProgress * 65;
    const pouchDrop = this.beakProgress * 75;

    // 上喙
    ctx.fillStyle = cBeak;
    ctx.beginPath();
    ctx.moveTo(headX + 15, headY - 8);
    ctx.lineTo(headX + 140, headY);
    ctx.lineTo(headX + 20, headY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 下喙与果冻嘴囊
    ctx.fillStyle = cPouch;
    ctx.beginPath();
    ctx.moveTo(headX + 20, headY + 8);
    ctx.quadraticCurveTo(
      headX + 75,
      headY + 12 + pouchDrop,
      headX + 140 - (1 - this.beakProgress) * 5,
      headY + openOffset
    );
    if (this.beakProgress > 0.15) {
      ctx.lineTo(headX + 140, headY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 嘴里的鱼尾巴
    if (this.fishCount > 0 && this.beakProgress > 0.25) {
      ctx.fillStyle = isGb ? '#306230' : '#4CA3D9';
      ctx.beginPath();
      ctx.moveTo(headX + 90, headY + 8);
      ctx.lineTo(headX + 115, headY - 8);
      ctx.lineTo(headX + 100, headY + 22);
      ctx.closePath();
      ctx.fill();
    }

    // 5. 骑行帽
    ctx.fillStyle = cCap;
    ctx.beginPath();
    ctx.arc(headX - 2, headY - 14, 22, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 帽檐
    ctx.beginPath();
    ctx.moveTo(headX + 12, headY - 14);
    ctx.lineTo(headX + 38, headY - 11);
    ctx.lineTo(headX + 18, headY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 6. 迎风长红围巾 (冲刺时摆动更剧烈)
    ctx.fillStyle = cFrame;
    ctx.strokeStyle = cMain;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(headX - 6, headY + 20);
    ctx.lineTo(headX + 22, headY + 21);
    ctx.lineTo(headX + 12, headY + 36);
    ctx.lineTo(headX - 10, headY + 33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const waveAmp = this.isSprinting ? 14 : 8;
    const waveFreq = this.isSprinting ? 0.12 : 0.08;
    const wave = Math.sin(this.scrollX * waveFreq) * waveAmp;

    ctx.beginPath();
    ctx.moveTo(headX - 10, headY + 26);
    ctx.quadraticCurveTo(headX - 55, headY + 8 + wave, headX - 110, headY + 16 + wave * 1.5);
    ctx.lineTo(headX - 105, headY + 36 + wave * 1.5);
    ctx.quadraticCurveTo(headX - 52, headY + 24 + wave, headX - 6, headY + 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 7. 大长腿蹬脚踏
    ctx.strokeStyle = isGb ? '#306230' : '#E6A756';
    ctx.lineWidth = 6;
    const pedalX = crankX + Math.cos(this.pedalAngle) * 16;
    const pedalY = crankY + Math.sin(this.pedalAngle) * 16;

    ctx.beginPath();
    ctx.moveTo(px - 8, wheelY - 70);
    ctx.lineTo(px + 28, wheelY - 40);
    ctx.lineTo(pedalX, pedalY);
    ctx.stroke();

    ctx.strokeStyle = cMain;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pedalX - 8, pedalY);
    ctx.lineTo(pedalX + 14, pedalY);
    ctx.stroke();

    ctx.restore();
  }

  // 渲染飞鱼
  renderFish(ctx, isGb = false) {
    ctx.save();
    for (const f of this.fishList) {
      ctx.save();
      ctx.translate(f.x, f.y);

      if (isGb) {
        ctx.fillStyle = '#0F380F';
        ctx.fillRect(-14, -7, 28, 14);
        ctx.fillRect(12, -4, 8, 8);
      } else {
        if (f.type === 'golden') {
          ctx.fillStyle = '#FFD700';
          ctx.strokeStyle = '#B8860B';
        } else if (f.type === 'squid') {
          ctx.fillStyle = '#E88B97';
          ctx.strokeStyle = '#2A2723';
        } else {
          ctx.fillStyle = '#4CA3D9';
          ctx.strokeStyle = '#2A2723';
        }
        ctx.lineWidth = 2.2;

        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 鱼尾
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(26, -9);
        ctx.lineTo(26, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 鱼眼
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-9, -2, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2A2723';
        ctx.beginPath();
        ctx.arc(-9, -2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  renderBumps(ctx, isGb = false) {
    ctx.save();
    for (const b of this.bumpList) {
      if (isGb) {
        ctx.fillStyle = '#0F380F';
        ctx.fillRect(b.x - 12, 400, 24, 10);
      } else {
        ctx.fillStyle = '#9C9488';
        ctx.strokeStyle = '#2A2723';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.arc(b.x - 6, 404, 8, Math.PI, 0);
        ctx.arc(b.x + 8, 405, 10, Math.PI, 0);
        ctx.fill();
        ctx.stroke();

        if (b.x > 320) {
          ctx.fillStyle = '#DF714B';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('⚠️', b.x - 8, 380);
        }
      }
    }
    ctx.restore();
  }

  renderParticles(ctx, isGb = false) {
    ctx.save();
    for (const p of this.particleList) {
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = isGb ? '#0F380F' : p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderSpilledFish(ctx, isGb = false) {
    ctx.save();
    for (const sp of this.spilledFishList) {
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.rot);
      ctx.fillStyle = isGb ? '#0F380F' : '#DF714B';
      ctx.fillRect(-12, -6, 24, 12);
      ctx.restore();
    }
    ctx.restore();
  }

  renderToasts(ctx, isGb = false) {
    ctx.save();
    for (const t of this.toastList) {
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = isGb ? '#0F380F' : t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}

// 启动
window.addEventListener('DOMContentLoaded', () => {
  window.game = new PelicanGame('pelican-canvas');
});
