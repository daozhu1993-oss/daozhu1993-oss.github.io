/**
 * 别洒了，鹈鹕！- 小红书专属 1116x2232 超清战绩海报生成器
 * 1:1 复刻法式慢调俱乐部排版，结合当局捕鱼战绩，一键生成高清竖屏图
 */

class PelicanPoster {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = 1116;
    this.height = 2232;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  roundRect(ctx, x, y, w, h, radius, fillStyle, strokeStyle, lineWidth = 1) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  generate(stats = { fish: 12, lost: 1, title: '海边最稳大嘴王', rating: '特级绝鲜' }) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. 底层纸质暖调纯净背景
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(0, 0, w, h);

    // 2. 顶部 The Slow Club 标志栏
    ctx.save();
    const topY = 160;
    
    // 车轮图标
    const wheelX = 90;
    const wheelY = topY;
    const wheelR = 34;
    ctx.strokeStyle = '#2A2723';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(wheelX, wheelY, wheelR, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(wheelX, wheelY);
      ctx.lineTo(wheelX + Math.cos(angle) * wheelR, wheelY + Math.sin(angle) * wheelR);
      ctx.stroke();
    }

    // THE SLOW CLUB 文字
    ctx.fillStyle = '#2A2723';
    ctx.font = 'bold 36px "SF Pro Display", -apple-system, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('THE SLOW CLUB', wheelX + 54, wheelY + 12);

    // 右上角两颗圆形按钮 (月亮与音符)
    const drawIconCircle = (cx, symbol) => {
      ctx.beginPath();
      ctx.arc(cx, wheelY, 60, 0, Math.PI * 2);
      ctx.fillStyle = '#EDE8DF';
      ctx.fill();
      ctx.strokeStyle = '#DCD6CA';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#2A2723';
      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(symbol, cx, wheelY + 12);
    };

    drawIconCircle(w - 220, '☾');
    drawIconCircle(w - 90, '♪');
    ctx.restore();

    // 分隔横线
    ctx.strokeStyle = '#DCD6CA';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 270);
    ctx.lineTo(w - 80, 270);
    ctx.stroke();

    // 3. 标题区 (A MOUTHFUL OF FISH & 别洒了，鹈鹕！)
    ctx.save();
    ctx.fillStyle = '#DF714B';
    ctx.font = 'bold 30px "SF Pro Text", sans-serif';
    ctx.letterSpacing = '8px';
    ctx.fillText('A  M O U T H F U L   O F   F I S H', 80, 350);

    ctx.fillStyle = '#2A2723';
    ctx.font = 'bold 92px "PingFang SC", "Songti SC", sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('别洒了，鹈鹕！', 80, 470);
    ctx.restore();

    // 4. 核心游戏卡片容器
    const cardX = 80;
    const cardY = 530;
    const cardW = w - 160;
    const cardH = 1040;
    const cardR = 32;

    this.roundRect(ctx, cardX, cardY, cardW, cardH, cardR, '#EDE8DF', '#DCD6CA', 3);

    // 卡片顶部橙色进度指示条
    this.roundRect(ctx, cardX, cardY, cardW * 0.45, 12, 6, '#DF714B');

    // HUD 仪表盘
    ctx.save();
    const hudY = cardY + 70;

    // 距码头还有
    ctx.fillStyle = '#847F75';
    ctx.font = '500 28px sans-serif';
    ctx.fillText('距码头还有', cardX + 45, hudY);
    ctx.fillStyle = '#2A2723';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('0', cardX + 45, hudY + 70);
    ctx.fillStyle = '#847F75';
    ctx.font = '500 30px sans-serif';
    ctx.fillText('秒', cardX + 90, hudY + 70);

    // 海货
    ctx.fillStyle = '#847F75';
    ctx.font = '500 28px sans-serif';
    ctx.fillText('海货', cardX + 220, hudY);
    ctx.fillStyle = '#294A3E';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(`${stats.fish}`, cardX + 220, hudY + 70);
    ctx.fillStyle = '#847F75';
    ctx.font = '500 30px sans-serif';
    ctx.fillText('份', cardX + 220 + (`${stats.fish}`.length * 40), hudY + 70);

    // 颠洒了
    ctx.fillStyle = '#847F75';
    ctx.font = '500 28px sans-serif';
    ctx.fillText('颠洒了', cardX + 390, hudY);
    ctx.fillStyle = '#DF714B';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(`${stats.lost}`, cardX + 390, hudY + 70);
    ctx.fillStyle = '#847F75';
    ctx.font = '500 30px sans-serif';
    ctx.fillText('份', cardX + 390 + (`${stats.lost}`.length * 40), hudY + 70);
    ctx.restore();

    // 5. 画面区域插画绘制 (海岸、灯塔、气球、骑单车的鹈鹕)
    const stageX = cardX;
    const stageY = cardY + 180;
    const stageW = cardW;
    const stageH = cardH - 180;

    this.drawIllustration(ctx, stageX, stageY, stageW, stageH, stats);

    // 画面右下角台词
    ctx.save();
    ctx.fillStyle = '#2F574E';
    ctx.font = 'bold 32px "Songti SC", "PingFang SC", serif';
    ctx.textAlign = 'right';
    ctx.fillText('海风不急，这一嘴要稳', cardX + cardW - 35, cardY + cardH - 35);
    ctx.restore();

    // 6. 提示横条 (松开时护鱼 · 想接鱼就按住)
    const hintY = cardY + cardH + 40;
    this.roundRect(ctx, cardX, hintY, cardW, 80, 24, '#EDE8DF', '#DCD6CA', 2);
    ctx.fillStyle = '#847F75';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('松开时护鱼 · 想接鱼就按住', w / 2, hintY + 52);

    // 7. 操作按键示意区
    const btnY = hintY + 115;
    const holdBtnW = cardW - 190;
    const pauseBtnW = 160;

    // 大绿色按住键
    this.roundRect(ctx, cardX, btnY, holdBtnW, 160, 30, '#294A3E');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('按住张嘴', cardX + holdBtnW / 2, btnY + 70);

    // 中间的小横条
    this.roundRect(ctx, cardX + holdBtnW / 2 - 60, btnY + 88, 120, 10, 5, 'rgba(255,255,255,0.25)');
    this.roundRect(ctx, cardX + holdBtnW / 2 - 60, btnY + 88, 60, 10, 5, '#E6A756');

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '26px sans-serif';
    ctx.fillText('松开护住这一嘴', cardX + holdBtnW / 2, btnY + 132);

    // 暂停键
    this.roundRect(ctx, cardX + holdBtnW + 30, btnY, pauseBtnW, 160, 30, '#EDE8DF', '#DCD6CA', 2);
    ctx.fillStyle = '#2A2723';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('||', cardX + holdBtnW + 30 + pauseBtnW / 2, btnY + 75);
    ctx.fillStyle = '#847F75';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('暂停', cardX + holdBtnW + 30 + pauseBtnW / 2, btnY + 125);

    // 8. 底部指引与岛主掌机出品水印
    const footerY = btnY + 220;
    ctx.fillStyle = '#847F75';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('画面也能按住 · 电脑可用空格键', w / 2, footerY);

    // 底部荣誉卡片 (结算称号)
    const badgeY = footerY + 45;
    this.roundRect(ctx, cardX, badgeY, cardW, 120, 24, 'rgba(41,74,62,0.08)', '#C9DCD6', 2);
    ctx.fillStyle = '#294A3E';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(`✦ 码头战绩：【${stats.title}】· 稳健护鱼率 ${stats.safeRate || '95%'} ✦`, w / 2, badgeY + 52);
    ctx.fillStyle = '#847F75';
    ctx.font = '24px sans-serif';
    ctx.fillText('在线试玩 · 掌机游戏匣子 pocket.daozhuai.cn', w / 2, badgeY + 92);

    return this.canvas.toDataURL('image/png');
  }

  // 绘制海滨风景与鹈鹕单车矢量插画
  drawIllustration(ctx, x, y, w, h, stats) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // 天空背景色
    ctx.fillStyle = '#D3E4DF';
    ctx.fillRect(x, y, w, h);

    // 远方大海
    ctx.fillStyle = '#9EBDB4';
    ctx.fillRect(x, y + h * 0.42, w, h * 0.3);

    // 金黄色热气球
    const balloonX = x + w * 0.68;
    const balloonY = y + h * 0.28;
    ctx.fillStyle = '#E9A859';
    ctx.beginPath();
    ctx.arc(balloonX, balloonY, 70, 0, Math.PI * 2);
    ctx.fill();

    // 气球小吊篮
    ctx.fillStyle = '#294A3E';
    ctx.fillRect(balloonX - 12, balloonY + 80, 24, 22);

    // 远方灯塔
    const lightX = x + w * 0.82;
    const lightY = y + h * 0.38;
    ctx.fillStyle = '#E4DFD3';
    ctx.fillRect(lightX - 14, lightY, 28, 70);
    ctx.fillStyle = '#DF714B';
    ctx.fillRect(lightX - 14, lightY + 20, 28, 16);
    ctx.fillRect(lightX - 14, lightY + 50, 28, 16);
    // 灯塔顶
    ctx.fillStyle = '#2A2723';
    ctx.beginPath();
    ctx.moveTo(lightX - 18, lightY);
    ctx.lineTo(lightX, lightY - 16);
    ctx.lineTo(lightX + 18, lightY);
    ctx.closePath();
    ctx.fill();

    // 沙滩与沿海公路
    ctx.fillStyle = '#EFE9DE';
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.68);
    ctx.lineTo(x + w, y + h * 0.68);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();

    // 沿海植被与小野花
    ctx.fillStyle = '#A3BE97';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x + 80 + i * 160, y + h * 0.69, 20 + (i % 3) * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 绘制主角：骑复古单车的鹈鹕
    const pelicanX = x + w * 0.38;
    const pelicanY = y + h * 0.72;

    this.drawPelicanBicycle(ctx, pelicanX, pelicanY, stats);

    ctx.restore();
  }

  // 绘制鹈鹕与复古单车主体
  drawPelicanBicycle(ctx, px, py, stats) {
    ctx.save();

    // 1. 自行车轮 (复古双轮)
    const wheelR = 75;
    const frontX = px + 150;
    const backX = px - 110;
    const wheelY = py;

    const drawWheel = (wx) => {
      ctx.strokeStyle = '#2A2723';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(wx, wheelY, wheelR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#435850';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(wx, wheelY, wheelR - 6, 0, Math.PI * 2);
      ctx.stroke();

      // 轮辐
      ctx.strokeStyle = '#847F75';
      ctx.lineWidth = 2;
      for (let a = 0; a < 12; a++) {
        const rad = (a * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(wx, wheelY);
        ctx.lineTo(wx + Math.cos(rad) * (wheelR - 12), wheelY + Math.sin(rad) * (wheelR - 12));
        ctx.stroke();
      }
    };

    drawWheel(backX);
    drawWheel(frontX);

    // 2. 自行车砖红车架
    ctx.strokeStyle = '#DF714B';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const crankX = px + 10;
    const crankY = wheelY - 5;
    const seatX = px - 40;
    const seatY = wheelY - 110;
    const handleX = px + 110;
    const handleY = wheelY - 130;

    // 三角车架连接
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

    // 车把与车座
    ctx.strokeStyle = '#2A2723';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(seatX - 25, seatY - 5);
    ctx.lineTo(seatX + 25, seatY - 5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(handleX - 15, handleY - 15);
    ctx.lineTo(handleX + 30, handleY - 15);
    ctx.stroke();

    // 3. 鹈鹕大白鹅式身躯
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#2A2723';
    ctx.lineWidth = 5;

    // 尾部与身体大弧线
    ctx.beginPath();
    ctx.ellipse(px - 30, wheelY - 130, 95, 55, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 尾羽小翘角
    ctx.beginPath();
    ctx.moveTo(px - 110, wheelY - 135);
    ctx.lineTo(px - 145, wheelY - 160);
    ctx.lineTo(px - 120, wheelY - 125);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 优雅的长脖子
    ctx.beginPath();
    ctx.moveTo(px + 20, wheelY - 145);
    ctx.quadraticCurveTo(px + 30, wheelY - 240, px + 50, wheelY - 270);
    ctx.lineTo(px + 95, wheelY - 270);
    ctx.quadraticCurveTo(px + 85, wheelY - 230, px + 75, wheelY - 140);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 头部
    const headX = px + 65;
    const headY = wheelY - 275;
    ctx.beginPath();
    ctx.arc(headX, headY, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 眼睛
    ctx.fillStyle = '#2A2723';
    ctx.beginPath();
    ctx.arc(headX + 16, headY - 8, 6, 0, Math.PI * 2);
    ctx.fill();

    // 4. 标志性的大嘴囊 (Beak Pouch)
    ctx.fillStyle = '#F2AF42';
    ctx.strokeStyle = '#2A2723';
    ctx.lineWidth = 5;

    // 上喙
    ctx.beginPath();
    ctx.moveTo(headX + 24, headY - 14);
    ctx.lineTo(headX + 210, headY - 2);
    ctx.lineTo(headX + 30, headY + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 大嘴囊兜兜 (装满海鱼时自然鼓起的大弧度)
    ctx.fillStyle = '#E79B2F';
    ctx.beginPath();
    ctx.moveTo(headX + 30, headY + 12);
    ctx.quadraticCurveTo(headX + 130, headY + 125, headX + 210, headY - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 嘴里的金黄小鱼尾巴探出
    ctx.fillStyle = '#4CA3D9';
    ctx.beginPath();
    ctx.moveTo(headX + 140, headY + 10);
    ctx.lineTo(headX + 175, headY - 10);
    ctx.lineTo(headX + 155, headY + 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. 绿色复古骑行帽 (Cap)
    ctx.fillStyle = '#294A3E';
    ctx.beginPath();
    ctx.arc(headX - 4, headY - 22, 34, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 帽檐
    ctx.beginPath();
    ctx.moveTo(headX + 18, headY - 22);
    ctx.lineTo(headX + 56, headY - 18);
    ctx.lineTo(headX + 26, headY - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 6. 随风飞舞的红色围巾 (Scarf)
    ctx.fillStyle = '#DF714B';
    ctx.strokeStyle = '#2A2723';
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(headX - 10, headY + 30);
    ctx.lineTo(headX + 35, headY + 32);
    ctx.lineTo(headX + 20, headY + 54);
    ctx.lineTo(headX - 15, headY + 50);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 飘在身后的长飘带
    ctx.beginPath();
    ctx.moveTo(headX - 15, headY + 40);
    ctx.quadraticCurveTo(headX - 90, headY + 10, headX - 170, headY + 25);
    ctx.lineTo(headX - 165, headY + 55);
    ctx.quadraticCurveTo(headX - 85, headY + 35, headX - 10, headY + 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 7. 骑车的大长细腿 (橘黄色鸟腿，蹬着脚踏)
    ctx.strokeStyle = '#E6A756';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';

    // 前腿
    ctx.beginPath();
    ctx.moveTo(px - 10, wheelY - 110);
    ctx.lineTo(px + 45, wheelY - 60);
    ctx.lineTo(crankX + 12, crankY + 18);
    ctx.stroke();

    // 脚掌与踏板
    ctx.strokeStyle = '#2A2723';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(crankX - 10, crankY + 18);
    ctx.lineTo(crankX + 34, crankY + 18);
    ctx.stroke();

    ctx.restore();
  }

  download(stats, filename = '别洒了鹈鹕-小红书战绩海报.png') {
    const dataUrl = this.generate(stats);
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
}

window.PelicanPoster = PelicanPoster;
