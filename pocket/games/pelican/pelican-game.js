/**
 * 别洒了，鹈鹕！(A Mouthful of Fish · The Slow Club)
 * 核心游戏逻辑与渲染引擎
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

    // 模式状态：book (绘本) 或 gb (Game Boy 8-Bit)
    const urlParams = new URLSearchParams(window.location.search);
    this.isGbMode = urlParams.get('mode') === 'gb';
    this.isDarkMode = false;

    // 核心数值状态
    this.totalTime = 35; // 35秒冲刺至码头
    this.timeLeft = this.totalTime;
    this.fishCount = 0;
    this.lostCount = 0;
    this.gameState = 'READY'; // READY, RUNNING, PAUSED, ARRIVED

    // 鹈鹕操控与物理
    this.isHolding = false;
    this.beakProgress = 0; // 0: 闭嘴护鱼, 1: 大嘴囊张开
    this.pedalAngle = 0;
    this.bikeYOffset = 0;
    this.bikeYVel = 0;
    this.shakeIntensity = 0;

    // 视差与移动背景
    this.scrollX = 0;
    this.speed = 3.8;

    // 实体队列
    this.fishList = [];
    this.bumpList = [];
    this.particleList = [];
    this.spilledFishList = [];
    this.toastList = [];

    // 定时生成器
    this.nextFishTime = 1.2;
    this.nextBumpTime = 4.5;
    this.lastTimestamp = 0;

    // DOM 引用
    this.timerValEl = document.getElementById('timer-val');
    this.fishValEl = document.getElementById('fish-val');
    this.lostValEl = document.getElementById('lost-val');
    this.topFillEl = document.getElementById('card-top-fill');
    this.holdBtn = document.getElementById('btn-hold');
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

  bindEvents() {
    // 1. 操作按键与触控绑定
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

    // 底部大按钮
    if (this.holdBtn) {
      this.holdBtn.addEventListener('mousedown', (e) => { e.preventDefault(); setHold(true); });
      window.addEventListener('mouseup', () => setHold(false));
      this.holdBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setHold(true); }, { passive: false });
      window.addEventListener('touchend', () => setHold(false));
      window.addEventListener('touchcancel', () => setHold(false));
    }

    // 画布触控点击也能张嘴
    const canvasWrap = document.querySelector('.canvas-wrapper');
    if (canvasWrap) {
      canvasWrap.addEventListener('mousedown', (e) => { e.preventDefault(); setHold(true); });
      canvasWrap.addEventListener('touchstart', (e) => { e.preventDefault(); setHold(true); }, { passive: false });
    }

    // 键盘操作 (空格键、Enter 或 A 键按住张嘴)
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'a' || e.key === 'A' || e.key === 'Enter') {
        e.preventDefault();
        setHold(true);
      } else if (e.key === 'p' || e.key === 'P') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.key === ' ' || e.key === 'a' || e.key === 'A' || e.key === 'Enter') {
        setHold(false);
      }
    });

    // 暂停按钮
    if (this.pauseBtn) {
      this.pauseBtn.addEventListener('click', () => this.togglePause());
    }

    // 结算海报导出
    const btnPoster = document.getElementById('btn-export-poster');
    if (btnPoster) {
      btnPoster.addEventListener('click', () => {
        const stats = this.getStatsReport();
        this.poster.download(stats);
      });
    }

    // 再来一局按钮
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
      x: x || 300,
      y: y || 240,
      alpha: 1,
      vy: -1.2
    });
  }

  restart() {
    this.modalOverlay.classList.remove('active');
    this.timeLeft = this.totalTime;
    this.fishCount = 0;
    this.lostCount = 0;
    this.gameState = 'RUNNING';
    this.fishList = [];
    this.bumpList = [];
    this.spilledFishList = [];
    this.toastList = [];
    this.nextFishTime = 1.0;
    this.nextBumpTime = 4.0;
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
      // 待机轻微呼吸
      this.pedalAngle += 0.8 * dt;
      return;
    }

    // 1. 倒计时与码头抵达
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.gameState = 'ARRIVED';
      this.updateHUD();
      this.audio.reachDock();
      setTimeout(() => this.showSettlement(), 900);
    }
    this.updateHUD();

    // 2. 鹈鹕大嘴张合物理 (果冻平滑插值)
    const targetBeak = this.isHolding ? 1.0 : 0.0;
    const lerpSpeed = this.isHolding ? 10.0 : 16.0;
    this.beakProgress += (targetBeak - this.beakProgress) * lerpSpeed * dt;

    // 3. 自行车踩踏动画
    this.pedalAngle += (this.speed * 2.8) * dt;
    this.scrollX += this.speed * 60 * dt;

    // 4. 车身悬挂阻尼弹性
    this.bikeYOffset += this.bikeYVel * dt;
    this.bikeYVel -= this.bikeYOffset * 40 * dt; // 弹簧回归
    this.bikeYVel *= 0.88; // 阻尼衰减

    // 屏幕微震
    if (this.shakeIntensity > 0) {
      this.shakeIntensity -= dt * 18;
      if (this.shakeIntensity < 0) this.shakeIntensity = 0;
    }

    // 5. 生成飞鱼
    this.nextFishTime -= dt;
    if (this.nextFishTime <= 0) {
      this.spawnFish();
      this.nextFishTime = 1.6 + Math.random() * 2.2;
    }

    // 6. 生成路面颠簸 (石子、减速带、突风)
    this.nextBumpTime -= dt;
    if (this.nextBumpTime <= 0) {
      this.spawnBump();
      this.nextBumpTime = 4.2 + Math.random() * 3.5;
    }

    // 7. 更新飞鱼飞行与吞食判定
    const pelicanMouthX = 260;
    const pelicanMouthY = 220 + this.bikeYOffset;

    for (let i = this.fishList.length - 1; i >= 0; i--) {
      const f = this.fishList[i];
      f.x -= (this.speed * 50 + f.vx) * dt;
      f.y += f.vy * dt;
      f.vy += 220 * dt; // 重力微落

      // 碰撞检测：飞入嘴部区域
      const dist = Math.hypot(f.x - pelicanMouthX, f.y - pelicanMouthY);
      if (dist < 46) {
        if (this.beakProgress > 0.35) {
          // 张嘴成功接住！
          this.fishCount++;
          this.audio.catchFish();
          this.addToast('+1 鲜鱼', '#294A3E', f.x, f.y - 20);
          this.vibrate(20);
          this.fishList.splice(i, 1);
          continue;
        } else {
          // 嘴闭着，被硬壳反弹！
          f.vx = -120;
          f.vy = -180;
          this.addToast('没张嘴！', '#847F75', f.x, f.y - 20);
        }
      }

      if (f.x < -80 || f.y > this.height + 50) {
        this.fishList.splice(i, 1);
      }
    }

    // 8. 更新颠簸碰撞与“颠洒”机制
    const bikeWheelX = 220;
    for (let i = this.bumpList.length - 1; i >= 0; i--) {
      const b = this.bumpList[i];
      b.x -= this.speed * 60 * dt;

      // 碾过颠簸
      if (!b.hit && Math.abs(b.x - bikeWheelX) < 25) {
        b.hit = true;
        this.bikeYVel = -160; // 剧烈弹跳
        this.shakeIntensity = 8;
        this.audio.bump();

        // 核心玩法判定：此时是否正张着大嘴？
        if (this.beakProgress > 0.35) {
          // 嘴张开，鱼颠飞洒出！
          const lostAmount = Math.min(this.fishCount > 4 ? 2 : 1, this.fishCount);
          if (lostAmount > 0) {
            this.fishCount -= lostAmount;
            this.lostCount += lostAmount;
            this.audio.spillFish();
            this.vibrate(50);
            this.triggerSpill(lostAmount, pelicanMouthX, pelicanMouthY);
            this.addToast(`-${lostAmount} 颠洒了！`, '#DF714B', pelicanMouthX + 20, pelicanMouthY - 30);
            if (this.hintBanner) {
              this.hintBanner.classList.add('alert-bump');
              setTimeout(() => this.hintBanner.classList.remove('alert-bump'), 600);
            }
          }
        } else {
          // 嘴闭着，完美护鱼！
          this.addToast('稳住！', '#294A3E', pelicanMouthX + 20, pelicanMouthY - 20);
          this.vibrate(10);
        }
      }

      if (b.x < -100) {
        this.bumpList.splice(i, 1);
      }
    }

    // 9. 更新被颠飞的鱼粒子
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

    // 10. 更新飘字提示
    for (let i = this.toastList.length - 1; i >= 0; i--) {
      const t = this.toastList[i];
      t.y += t.vy;
      t.alpha -= dt * 1.5;
      if (t.alpha <= 0) {
        this.toastList.splice(i, 1);
      }
    }
  }

  spawnFish() {
    const types = ['silver', 'golden', 'shrimp', 'squid'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.fishList.push({
      x: this.width + 40,
      y: 160 + Math.random() * 110,
      vx: 40 + Math.random() * 60,
      vy: -60 - Math.random() * 80,
      type
    });
  }

  spawnBump() {
    this.bumpList.push({
      x: this.width + 50,
      hit: false,
      type: Math.random() > 0.5 ? 'stone' : 'pothole'
    });
  }

  triggerSpill(count, x, y) {
    for (let i = 0; i < count; i++) {
      this.spilledFishList.push({
        x: x + (Math.random() - 0.5) * 15,
        y: y + (Math.random() - 0.5) * 15,
        vx: 80 + Math.random() * 120,
        vy: -220 - Math.random() * 100,
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
    // 震屏位移
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
  // 1. 法式绘本风渲染 (The Slow Club Book Mode)
  // ════════════════════════════════════════════════════════════
  renderBook(ctx, w, h) {
    // 天空
    ctx.fillStyle = this.isDarkMode ? '#172322' : '#CBE0DA';
    ctx.fillRect(0, 0, w, h);

    // 远处温暖太阳 / 月亮
    ctx.fillStyle = this.isDarkMode ? '#F5EACF' : '#EAA958';
    ctx.beginPath();
    ctx.arc(580, 110, 48, 0, Math.PI * 2);
    ctx.fill();

    // 热气球吊篮
    const balloonOffset = Math.sin(this.scrollX * 0.005) * 12;
    ctx.fillStyle = this.isDarkMode ? '#9BA698' : '#294A3E';
    ctx.fillRect(572, 168 + balloonOffset, 16, 14);

    // 大海与远景灯塔
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

    // 公路深色分界线
    ctx.strokeStyle = this.isDarkMode ? '#3A4542' : '#DCD5C6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.7);
    ctx.lineTo(w, h * 0.7);
    ctx.stroke();

    // 沿路小石子与草丛装饰 (视差流动)
    ctx.fillStyle = this.isDarkMode ? '#384844' : '#98B68C';
    for (let i = 0; i < 8; i++) {
      const decoX = ((i * 140 - this.scrollX) % (w + 140) + (w + 140)) % (w + 140) - 40;
      ctx.beginPath();
      ctx.arc(decoX, h * 0.7, 10, Math.PI, 0);
      ctx.fill();
    }

    // 渲染路面颠簸障碍物
    this.renderBumps(ctx);

    // 渲染飞鱼
    this.renderFish(ctx);

    // 渲染主角：骑复古单车的鹈鹕
    this.renderPelican(ctx, 220, 395 + this.bikeYOffset);

    // 渲染颠飞的鱼粒子
    this.renderSpilledFish(ctx);

    // 渲染浮动文字
    this.renderToasts(ctx);
  }

  // ════════════════════════════════════════════════════════════
  // 2. 8-Bit Game Boy 点阵像素风渲染
  // ════════════════════════════════════════════════════════════
  renderGb(ctx, w, h) {
    // 4阶调色盘: #9BBC0F, #8BAC0F, #306230, #0F380F
    ctx.fillStyle = '#9BBC0F';
    ctx.fillRect(0, 0, w, h);

    // 背景海平面
    ctx.fillStyle = '#8BAC0F';
    ctx.fillRect(0, h * 0.48, w, h * 0.22);

    // 像素太阳
    ctx.fillStyle = '#306230';
    ctx.fillRect(560, 90, 48, 48);

    // 地面公路
    ctx.fillStyle = '#8BAC0F';
    ctx.fillRect(0, h * 0.7, w, h * 0.3);

    ctx.fillStyle = '#0F380F';
    ctx.fillRect(0, h * 0.7, w, 4);

    // 渲染颠簸物 (像素方块)
    this.renderBumps(ctx, true);

    // 渲染像素飞鱼
    this.renderFish(ctx, true);

    // 渲染像素鹈鹕
    this.renderPelican(ctx, 220, 395 + this.bikeYOffset, true);

    // 颠飞粒子与文字
    this.renderSpilledFish(ctx, true);
    this.renderToasts(ctx, true);
  }

  // 绘制鹈鹕与复古单车
  renderPelican(ctx, px, py, isGb = false) {
    ctx.save();
    const cMain = isGb ? '#0F380F' : '#2A2723';
    const cWhite = isGb ? '#9BBC0F' : '#FFFFFF';
    const cFrame = isGb ? '#306230' : '#DF714B';
    const cBeak = isGb ? '#306230' : '#F2AF42';
    const cPouch = isGb ? '#0F380F' : '#E79B2F';
    const cCap = isGb ? '#0F380F' : '#294A3E';

    // 1. 车轮 (前后两轮)
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

      // 旋转辐条
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

    // 2. 经典砖红复古车架
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

    // 3. 鹈鹕大白鹅身躯
    ctx.fillStyle = cWhite;
    ctx.strokeStyle = cMain;
    ctx.lineWidth = 3.5;

    // 身体椭圆
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

    // 优雅长颈
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

    // 4. 【核心灵魂】弹性大嘴囊 (Beak Pouch)
    // 根据 this.beakProgress 实时动态张开下垂！
    const openOffset = this.beakProgress * 65; // 张开幅度
    const pouchDrop = this.beakProgress * 75; // 嘴囊下沉膨胀

    // 上喙 (固定在水平略微昂起)
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
    // 当张嘴时，下喙向下张开
    ctx.quadraticCurveTo(
      headX + 75,
      headY + 12 + pouchDrop,
      headX + 140 - (1 - this.beakProgress) * 5,
      headY + openOffset
    );
    if (this.beakProgress > 0.2) {
      // 张开时显示内腔大口
      ctx.lineTo(headX + 140, headY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 如果嘴里有鱼，且张嘴时，画一条活蹦乱跳的鱼尾巴
    if (this.fishCount > 0 && this.beakProgress > 0.3) {
      ctx.fillStyle = isGb ? '#306230' : '#4CA3D9';
      ctx.beginPath();
      ctx.moveTo(headX + 90, headY + 8);
      ctx.lineTo(headX + 115, headY - 8);
      ctx.lineTo(headX + 100, headY + 22);
      ctx.closePath();
      ctx.fill();
    }

    // 5. 绿色复古骑行帽
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

    // 6. 迎风飞扬的长红围巾
    ctx.fillStyle = cFrame;
    ctx.strokeStyle = cMain;
    ctx.lineWidth = 3;

    // 颈部围巾结
    ctx.beginPath();
    ctx.moveTo(headX - 6, headY + 20);
    ctx.lineTo(headX + 22, headY + 21);
    ctx.lineTo(headX + 12, headY + 36);
    ctx.lineTo(headX - 10, headY + 33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 飘扬的尾巾 (正弦波波动)
    const wave = Math.sin(this.scrollX * 0.08) * 8;
    ctx.beginPath();
    ctx.moveTo(headX - 10, headY + 26);
    ctx.quadraticCurveTo(headX - 55, headY + 8 + wave, headX - 110, headY + 16 + wave * 1.5);
    ctx.lineTo(headX - 105, headY + 36 + wave * 1.5);
    ctx.quadraticCurveTo(headX - 52, headY + 24 + wave, headX - 6, headY + 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 7. 橘黄色大长腿 (踩着脚踏旋转)
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

  // 渲染飞鱼实体
  renderFish(ctx, isGb = false) {
    ctx.save();
    for (const f of this.fishList) {
      ctx.save();
      ctx.translate(f.x, f.y);

      if (isGb) {
        ctx.fillStyle = '#0F380F';
        ctx.fillRect(-12, -6, 24, 12);
        ctx.fillRect(10, -4, 8, 8);
      } else {
        // 彩色绘本鱼
        ctx.fillStyle = f.type === 'golden' ? '#E9A859' : '#4CA3D9';
        ctx.strokeStyle = '#2A2723';
        ctx.lineWidth = 2;

        // 鱼身
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 鱼尾
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(24, -8);
        ctx.lineTo(24, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 鱼眼睛
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-8, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2A2723';
        ctx.beginPath();
        ctx.arc(-8, -2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // 渲染路面颠簸物
  renderBumps(ctx, isGb = false) {
    ctx.save();
    for (const b of this.bumpList) {
      if (isGb) {
        ctx.fillStyle = '#0F380F';
        ctx.fillRect(b.x - 10, 400, 20, 10);
      } else {
        // 石子堆或小坑洼
        ctx.fillStyle = '#9C9488';
        ctx.strokeStyle = '#2A2723';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.arc(b.x - 6, 404, 8, Math.PI, 0);
        ctx.arc(b.x + 8, 405, 10, Math.PI, 0);
        ctx.fill();
        ctx.stroke();

        // 预警小感叹号 (还在远方时)
        if (b.x > 320) {
          ctx.fillStyle = '#DF714B';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('⚠️', b.x - 8, 380);
        }
      }
    }
    ctx.restore();
  }

  // 渲染颠飞弹跳的鱼
  renderSpilledFish(ctx, isGb = false) {
    ctx.save();
    for (const sp of this.spilledFishList) {
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.rot);
      ctx.fillStyle = isGb ? '#0F380F' : '#DF714B';
      ctx.fillRect(-10, -5, 20, 10);
      ctx.restore();
    }
    ctx.restore();
  }

  // 渲染浮动提示文字
  renderToasts(ctx, isGb = false) {
    ctx.save();
    for (const t of this.toastList) {
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = isGb ? '#0F380F' : t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}

// 页面加载自动实例化
window.addEventListener('DOMContentLoaded', () => {
  window.game = new PelicanGame('pelican-canvas');
});
