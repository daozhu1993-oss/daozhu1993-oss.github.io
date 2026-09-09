/**
 * DAOZHU POCKET - Xiaohongshu Poster Generator (小红书高清海报生成器)
 * 纯原生 Canvas 2D 渲染 1116x2232 超清 Game Boy 拟物海报，一键下载分享
 */

class PosterGenerator {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = 1116;
    this.height = 2232;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  generatePoster() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. 底层环境暖灰阴影渐变背景
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#EDEBE6');
    bgGrad.addColorStop(1, '#DFDCD5');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. 掌机主体外壳 (Game Boy DMG-01 浅米灰外壳)
    const bodyX = 68;
    const bodyY = 120;
    const bodyW = 980;
    const bodyH = 1960;
    const radius = 64;

    // 主体柔和投影
    ctx.shadowColor = 'rgba(40, 35, 30, 0.28)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 30;

    // 掌机外壳圆角矩形
    this.roundRect(ctx, bodyX, bodyY, bodyW, bodyH, { tl: radius, tr: radius, bl: radius * 1.3, br: radius * 1.3 }, '#E7E4DC');
    ctx.shadowColor = 'transparent';

    // 掌机外壳质感微渐变与侧边高光
    const shellGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY);
    shellGrad.addColorStop(0, 'rgba(255,255,255,0.65)');
    shellGrad.addColorStop(0.04, 'rgba(255,255,255,0.1)');
    shellGrad.addColorStop(0.96, 'rgba(0,0,0,0.02)');
    shellGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = shellGrad;
    ctx.fill();

    // 顶部凹槽装饰线
    ctx.strokeStyle = '#D1CDC2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bodyX + 160, bodyY + 36);
    ctx.lineTo(bodyX + bodyW - 160, bodyY + 36);
    ctx.stroke();

    // 3. 屏幕外边框 (深灰紫镜面区域)
    const bezelX = bodyX + 70;
    const bezelY = bodyY + 110;
    const bezelW = bodyW - 140;
    const bezelH = 720;
    const bezelR = 24;

    // 边框倒角切角 (Game Boy 经典右上切角细节)
    this.roundRect(ctx, bezelX, bezelY, bezelW, bezelH, { tl: bezelR, tr: bezelR, bl: bezelR, br: 60 }, '#73737C');

    // 边框内陷投影
    ctx.strokeStyle = '#5E5E65';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 屏幕顶部装饰字
    ctx.fillStyle = '#1D1D23';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText('DOT MATRIX WITH STEREO SOUND', bezelX + 220, bezelY + 45);

    // 屏幕上方红蓝装饰线条
    ctx.strokeStyle = '#8E2841';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bezelX + 60, bezelY + 52);
    ctx.lineTo(bezelX + 200, bezelY + 52);
    ctx.stroke();

    ctx.strokeStyle = '#274272';
    ctx.beginPath();
    ctx.moveTo(bezelX + bezelW - 200, bezelY + 52);
    ctx.lineTo(bezelX + bezelW - 60, bezelY + 52);
    ctx.stroke();

    // BATTERY LED 指示灯
    const ledX = bezelX + 45;
    const ledY = bezelY + 280;
    ctx.fillStyle = '#FF3B30';
    ctx.beginPath();
    ctx.arc(ledX, ledY, 10, 0, Math.PI * 2);
    ctx.fill();

    // LED 高光与微弱发光
    ctx.shadowColor = 'rgba(255, 59, 48, 0.6)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFA19C';
    ctx.beginPath();
    ctx.arc(ledX - 2, ledY - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.fillStyle = '#C2C2C6';
    ctx.font = '14px sans-serif';
    ctx.fillText('BATTERY', ledX - 26, ledY + 28);

    // 4. LCD 液晶绿屏
    const lcdX = bezelX + 90;
    const lcdY = bezelY + 75;
    const lcdW = bezelW - 140;
    const lcdH = bezelH - 120;

    // 经典液晶黄绿渐变
    const lcdGrad = ctx.createLinearGradient(lcdX, lcdY, lcdX, lcdY + lcdH);
    lcdGrad.addColorStop(0, '#B3C875');
    lcdGrad.addColorStop(1, '#9CB45F');
    ctx.fillStyle = lcdGrad;
    this.roundRect(ctx, lcdX, lcdY, lcdW, lcdH, 12, lcdGrad);

    // LCD 点阵暗网格
    ctx.strokeStyle = 'rgba(60, 75, 30, 0.06)';
    ctx.lineWidth = 1;
    for (let lx = lcdX; lx < lcdX + lcdW; lx += 4) {
      ctx.beginPath();
      ctx.moveTo(lx, lcdY);
      ctx.lineTo(lx, lcdY + lcdH);
      ctx.stroke();
    }
    for (let ly = lcdY; ly < lcdY + lcdH; ly += 4) {
      ctx.beginPath();
      ctx.moveTo(lcdX, ly);
      ctx.lineTo(lcdX + lcdW, ly);
      ctx.stroke();
    }

    // LCD 内部像素文本与信息
    const darkGreen = '#1C3318';
    ctx.fillStyle = darkGreen;

    // 顶栏
    ctx.font = 'bold 22px monospace';
    ctx.fillText('PLAYER 01 · 岛主', lcdX + 30, lcdY + 45);
    ctx.fillText('♥♥♥', lcdX + lcdW - 110, lcdY + 45);

    // 个人卡片框
    ctx.strokeStyle = darkGreen;
    ctx.lineWidth = 2;
    ctx.strokeRect(lcdX + 30, lcdY + 65, lcdW - 60, 95);

    // 岛主头像与头衔
    ctx.font = '40px sans-serif';
    ctx.fillText('🐱', lcdX + 45, lcdY + 130);

    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('岛主', lcdX + 115, lcdY + 105);
    ctx.font = '20px sans-serif';
    ctx.fillText('全栈产品人 · 故事驱动器', lcdX + 115, lcdY + 138);

    // 菜单列表
    const menuY = lcdY + 195;
    const menuList = [
      { text: '▶  01 游戏匣子 · CARTRIDGE ARCADE', active: true },
      { text: '   02 掌机彩蛋 · 8-BIT 促织跳跳乐', active: false },
      { text: '   03 关于岛主 · 故事思维与理念', active: false },
      { text: '   04 作品示例 · 灵感库与绘本', active: false },
      { text: '   05 联络名片 · 微信与小红书 (989赞藏)', active: false }
    ];

    menuList.forEach((m, idx) => {
      const lineY = menuY + idx * 56;
      if (m.active) {
        ctx.fillStyle = darkGreen;
        ctx.fillRect(lcdX + 28, lineY - 32, lcdW - 56, 46);
        ctx.fillStyle = '#B3C875'; // 反色高亮
        ctx.font = 'bold 22px monospace';
        ctx.fillText(m.text, lcdX + 40, lineY);
      } else {
        ctx.fillStyle = darkGreen;
        ctx.font = '22px monospace';
        ctx.fillText(m.text, lcdX + 40, lineY);
      }
    });

    // 屏幕底部提示胶囊
    const pillY = lcdY + lcdH - 75;
    ctx.fillStyle = darkGreen;
    this.roundRect(ctx, lcdX + 30, pillY, lcdW - 60, 48, 8, darkGreen);
    ctx.fillStyle = '#B3C875';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('已经到家了 · SELECT 游戏列表 · A 确认', lcdX + 80, pillY + 32);

    // 5. 掌机品牌 LOGO 凹印
    const logoY = bezelY + bezelH + 60;
    ctx.fillStyle = '#2B3766';
    ctx.font = '900 48px "Arial Black", sans-serif';
    ctx.fillText('DAOZHU POCKET', bodyX + 70, logoY);

    ctx.fillStyle = '#78756E';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('口 袋 掌 机', bodyX + 70, logoY + 42);

    ctx.font = '16px monospace';
    ctx.fillText('PF-001 · DESIGNED FOR STORYTELLERS', bodyX + 70, logoY + 70);

    // 6. 十字键 (D-PAD)
    const dpadCenterX = bodyX + 220;
    const dpadCenterY = logoY + 330;
    const armW = 68;
    const armL = 190;

    // 十字键底座浅槽
    ctx.fillStyle = '#D9D5CC';
    ctx.beginPath();
    ctx.arc(dpadCenterX, dpadCenterY, 130, 0, Math.PI * 2);
    ctx.fill();

    // 黑色十字按键
    ctx.fillStyle = '#2B2B2F';
    // 横臂
    this.roundRect(ctx, dpadCenterX - armL / 2, dpadCenterY - armW / 2, armL, armW, 8, '#2B2B2F');
    // 竖臂
    this.roundRect(ctx, dpadCenterX - armW / 2, dpadCenterY - armL / 2, armW, armL, 8, '#2B2B2F');

    // 中心微凹圆盘
    ctx.fillStyle = '#202024';
    ctx.beginPath();
    ctx.arc(dpadCenterX, dpadCenterY, 26, 0, Math.PI * 2);
    ctx.fill();

    // 7. A / B 红色圆形按键
    const btnBaseX = bodyX + bodyW - 250;
    const btnBaseY = logoY + 310;

    // 倾斜胶囊底槽
    ctx.save();
    ctx.translate(btnBaseX, btnBaseY);
    ctx.rotate(-0.45);
    ctx.fillStyle = '#D9D5CC';
    this.roundRect(ctx, -60, -110, 120, 220, 60, '#D9D5CC');

    // B 键 (酒红/紫红)
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#8B264E';
    ctx.beginPath();
    ctx.arc(0, 48, 48, 0, Math.PI * 2);
    ctx.fill();

    // A 键 (酒红/紫红)
    ctx.beginPath();
    ctx.arc(0, -48, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.restore();

    // 按键字符 A 和 B
    ctx.fillStyle = '#2B3766';
    ctx.font = 'bold 32px "Arial Black", sans-serif';
    ctx.fillText('B', btnBaseX - 45, btnBaseY + 120);
    ctx.fillText('A', btnBaseX + 60, btnBaseY + 65);

    // 8. SELECT & START 胶囊橡胶按键
    const selX = bodyX + 380;
    const strX = bodyX + 530;
    const pillBtnY = bodyY + bodyH - 240;

    [selX, strX].forEach((px, i) => {
      ctx.save();
      ctx.translate(px, pillBtnY);
      ctx.rotate(-0.45);
      this.roundRect(ctx, -45, -14, 90, 28, 14, '#7F8782');
      ctx.restore();

      ctx.fillStyle = '#2B3766';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(i === 0 ? 'SELECT' : 'START', px - 40, pillBtnY + 58);
    });

    // 9. 底部立体出音孔槽 (Speaker slits)
    const spkX = bodyX + bodyW - 220;
    const spkY = bodyY + bodyH - 200;
    ctx.strokeStyle = '#353330';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    for (let si = 0; si < 6; si++) {
      ctx.beginPath();
      ctx.moveTo(spkX + si * 22, spkY);
      ctx.lineTo(spkX + si * 22 + 40, spkY + 80);
      ctx.stroke();
    }

    // 10. 底部小红书推广引导
    ctx.save();
    ctx.fillStyle = '#5A564F';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ 小红书关注 @岛主 (989次赞与收藏) · 在线试玩 pocket.daozhuai.cn ✦', bodyX + bodyW / 2, bodyY + bodyH + 70);
    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius, fill) {
    if (typeof radius === 'number') {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }

  download() {
    this.generatePoster();
    const dataUrl = this.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `DAOZHU_POCKET_POSTER_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

window.posterGenerator = new PosterGenerator();

document.addEventListener('DOMContentLoaded', () => {
  const exportBtn = document.getElementById('btn-export-poster');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (window.retroAudio) window.retroAudio.confirm();
      if (window.trackPocketEvent) {
        window.trackPocketEvent('export_poster', { size: '1116x2232' });
      }
      window.posterGenerator.download();
    });
  }
});
