/**
 * DAOZHU POCKET - Built-in 8-Bit Mini-Game: 《促织跳跳乐 / Cricket Jump》
 * 100% 原生运行在 160x144 Game Boy 点阵液晶屏内的复古像素小游戏
 */

class CricketGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 160;
    this.height = 144;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Game Boy 4阶绿调调色板
    this.colors = {
      bg: '#8bac0f',
      light: '#9bbc0f',
      mid: '#306230',
      dark: '#0f380f'
    };

    this.state = 'TITLE'; // TITLE, PLAYING, GAMEOVER
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('daozhu_cricket_hi') || '0', 10);
    this.animationId = null;
    this.lastTime = 0;

    // 蓄力机制
    this.charging = false;
    this.chargePower = 0;
    this.maxCharge = 100;

    // 玩家促织
    this.player = {
      x: 30,
      y: 100,
      vx: 0,
      vy: 0,
      width: 10,
      height: 8,
      onGround: true,
      facing: 1
    };

    // 台阶与收集物
    this.platforms = [];
    this.items = [];
    this.cameraY = 0;

    this.initPlatforms();
  }

  initPlatforms() {
    this.platforms = [
      { x: 10, y: 120, w: 60, h: 10 },
      { x: 80, y: 95, w: 45, h: 8 },
      { x: 30, y: 65, w: 50, h: 8 },
      { x: 90, y: 35, w: 40, h: 8 },
      { x: 20, y: 5, w: 55, h: 8 },
      { x: 75, y: -25, w: 45, h: 8 },
      { x: 35, y: -55, w: 50, h: 8 }
    ];

    this.items = [
      { x: 95, y: 80, r: 3, collected: false },
      { x: 45, y: 50, r: 3, collected: false },
      { x: 105, y: 20, r: 3, collected: false }
    ];
  }

  start() {
    this.state = 'PLAYING';
    this.score = 0;
    this.cameraY = 0;
    this.player.x = 35;
    this.player.y = 110;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.onGround = true;
    this.initPlatforms();
    if (window.retroAudio) window.retroAudio.confirm();
  }

  handleButtonDown(btn) {
    if (this.state === 'TITLE') {
      if (btn === 'A' || btn === 'START') {
        this.start();
      }
      return;
    }

    if (this.state === 'GAMEOVER') {
      if (btn === 'A' || btn === 'START') {
        this.start();
      }
      return;
    }

    if (this.state === 'PLAYING') {
      if (btn === 'A') {
        if (this.player.onGround) {
          this.charging = true;
          this.chargePower = 0;
        }
      } else if (btn === 'LEFT') {
        this.player.vx = -1.8;
        this.player.facing = -1;
      } else if (btn === 'RIGHT') {
        this.player.vx = 1.8;
        this.player.facing = 1;
      }
    }
  }

  handleButtonUp(btn) {
    if (this.state === 'PLAYING') {
      if (btn === 'A' && this.charging) {
        this.charging = false;
        // 计算蓄力跳跃力度 (最小 4.2，最大 7.5)
        const powerRatio = Math.min(this.chargePower, this.maxCharge) / this.maxCharge;
        const jumpForce = 4.2 + powerRatio * 3.6;
        this.player.vy = -jumpForce;
        this.player.onGround = false;
        if (window.retroAudio) window.retroAudio.jump();
      } else if (btn === 'LEFT' || btn === 'RIGHT') {
        this.player.vx = 0;
      }
    }
  }

  update(dt) {
    if (this.state !== 'PLAYING') return;

    // 蓄力进度增加
    if (this.charging) {
      this.chargePower += dt * 140;
      if (this.chargePower > this.maxCharge) {
        this.chargePower = this.maxCharge;
      }
    }

    // 重力加速度
    if (!this.player.onGround) {
      this.player.vy += 0.22; // 重力
    }

    // 水平移动与阻尼
    this.player.x += this.player.vx;
    if (this.player.x < 0) this.player.x = 0;
    if (this.player.x > this.width - this.player.width) {
      this.player.x = this.width - this.player.width;
    }

    // 垂直位移
    this.player.y += this.player.vy;

    // 碰撞检测与台阶判定
    this.player.onGround = false;
    for (let plat of this.platforms) {
      // 只有在下落时踩中台阶顶部才算踩住
      if (this.player.vy >= 0 &&
          this.player.x + this.player.width > plat.x &&
          this.player.x < plat.x + plat.w &&
          this.player.y + this.player.height >= plat.y &&
          this.player.y + this.player.height <= plat.y + 6) {
        this.player.y = plat.y - this.player.height;
        this.player.vy = 0;
        this.player.onGround = true;
        break;
      }
    }

    // 镜头跟随上升 (只往上推，不往下落)
    const targetScreenY = 60;
    if (this.player.y < targetScreenY) {
      const diff = targetScreenY - this.player.y;
      this.player.y += diff;
      for (let p of this.platforms) p.y += diff;
      for (let item of this.items) item.y += diff;
      this.score += Math.floor(diff);
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('daozhu_cricket_hi', this.highScore);
      }
    }

    // 动态循环生成更高处的平台
    const topPlat = this.platforms.reduce((min, p) => p.y < min.y ? p : min, this.platforms[0]);
    if (topPlat.y > -20) {
      const newY = topPlat.y - (25 + Math.random() * 15);
      const newW = 35 + Math.random() * 25;
      const newX = 10 + Math.random() * (this.width - newW - 20);
      this.platforms.push({ x: newX, y: newY, w: newW, h: 8 });

      // 概率生成收集物 (朝露)
      if (Math.random() > 0.45) {
        this.items.push({ x: newX + newW / 2, y: newY - 12, r: 3, collected: false });
      }
    }

    // 清理掉出屏幕下方的平台
    this.platforms = this.platforms.filter(p => p.y < this.height + 20);
    this.items = this.items.filter(item => item.y < this.height + 20);

    // 收集物碰撞判定
    for (let item of this.items) {
      if (!item.collected &&
          Math.abs(this.player.x + 5 - item.x) < 8 &&
          Math.abs(this.player.y + 4 - item.y) < 8) {
        item.collected = true;
        this.score += 50;
        if (window.retroAudio) window.retroAudio.score();
      }
    }

    // 掉落死亡判定
    if (this.player.y > this.height) {
      this.state = 'GAMEOVER';
      if (window.retroAudio) window.retroAudio.hit();
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.state === 'TITLE') {
      this.drawTitle();
      return;
    }

    // 绘制平台 (像素竹石台阶)
    for (let p of this.platforms) {
      ctx.fillStyle = this.colors.dark;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.floor(p.w), p.h);
      ctx.fillStyle = this.colors.light;
      ctx.fillRect(Math.floor(p.x) + 1, Math.floor(p.y) + 1, Math.floor(p.w) - 2, 1);
    }

    // 绘制收集物 (晶莹朝露)
    for (let item of this.items) {
      if (!item.collected) {
        ctx.fillStyle = this.colors.dark;
        ctx.fillRect(Math.floor(item.x) - 2, Math.floor(item.y) - 2, 5, 5);
        ctx.fillStyle = this.colors.light;
        ctx.fillRect(Math.floor(item.x) - 1, Math.floor(item.y) - 1, 2, 2);
      }
    }

    // 绘制玩家 (促织 / 像素蟋蟀)
    this.drawCricket(this.player.x, this.player.y, this.player.facing);

    // 蓄力能量条
    if (this.charging) {
      const barW = 30;
      const barH = 4;
      const fillW = (this.chargePower / this.maxCharge) * barW;
      ctx.fillStyle = this.colors.dark;
      ctx.fillRect(this.player.x - 10, this.player.y - 8, barW, barH);
      ctx.fillStyle = this.colors.light;
      ctx.fillRect(this.player.x - 9, this.player.y - 7, fillW - 2, barH - 2);
    }

    // 顶部状态栏 (分数 & 记录)
    ctx.fillStyle = this.colors.dark;
    ctx.font = '8px monospace';
    ctx.fillText(`SCORE:${this.score}`, 4, 10);
    ctx.fillText(`HI:${this.highScore}`, 105, 10);

    if (this.state === 'GAMEOVER') {
      this.drawGameOver();
    }
  }

  // 像素促织绘制
  drawCricket(x, y, facing) {
    const ctx = this.ctx;
    const px = Math.floor(x);
    const py = Math.floor(y);

    ctx.fillStyle = this.colors.dark;
    // 躯干
    ctx.fillRect(px + 2, py + 2, 6, 4);
    // 头部
    ctx.fillRect(facing === 1 ? px + 7 : px, py + 1, 3, 3);
    // 触角
    if (facing === 1) {
      ctx.fillRect(px + 9, py - 2, 1, 3);
      ctx.fillRect(px + 10, py - 3, 1, 1);
    } else {
      ctx.fillRect(px, py - 2, 1, 3);
      ctx.fillRect(px - 1, py - 3, 1, 1);
    }
    // 后足 (大腿)
    ctx.fillRect(facing === 1 ? px + 1 : px + 6, py + 4, 3, 3);
    ctx.fillRect(facing === 1 ? px : px + 8, py + 6, 1, 2);

    // 眼睛高光
    ctx.fillStyle = this.colors.light;
    ctx.fillRect(facing === 1 ? px + 8 : px + 1, py + 1, 1, 1);
  }

  drawTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = this.colors.dark;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('CRICKET JUMP', 32, 38);
    ctx.font = '10px monospace';
    ctx.fillText('促织跳跳乐', 46, 54);

    ctx.font = '8px monospace';
    ctx.fillText('8-BIT MINI GAME', 38, 76);
    ctx.fillText('PRESS [A] TO JUMP', 30, 96);
    ctx.fillText('HOLD [A] FOR POWER', 26, 108);

    // 绘制可爱示范促织
    this.drawCricket(72, 120, 1);
  }

  drawGameOver() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(139, 172, 15, 0.85)';
    ctx.fillRect(20, 36, 120, 68);

    ctx.strokeStyle = this.colors.dark;
    ctx.strokeRect(20, 36, 120, 68);

    ctx.fillStyle = this.colors.dark;
    ctx.font = 'bold 11px monospace';
    ctx.fillText('GAME OVER', 46, 54);

    ctx.font = '9px monospace';
    ctx.fillText(`SCORE: ${this.score}`, 48, 70);
    ctx.fillText('PRESS [A] RESTART', 32, 88);
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    this.draw();

    this.animationId = requestAnimationFrame((t) => this.loop(t));
  }

  run() {
    if (!this.animationId) {
      this.lastTime = 0;
      this.animationId = requestAnimationFrame((t) => this.loop(t));
    }
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}

window.CricketGame = CricketGame;
