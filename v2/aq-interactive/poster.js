/**
 * 未庄 · 《未庄看客档案》宣纸水墨长图海报生成器 (Xuan Paper Ink Archive Poster)
 * 基于 HTML5 Canvas 动态绘制高精细度宣纸古籍风长图，直击鲁迅文学精髓，支持多端长按保存与一键下载。
 */

export class ArchivePosterGenerator {
  constructor(spectatorSystem, audioEngine) {
    this.spectator = spectatorSystem;
    this.audio = audioEngine;
  }

  showPosterModal() {
    if (this.audio) this.audio.playSealStamp();
    const stats = this.spectator.getSummaryStats();

    let modal = document.getElementById('archive-poster-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'archive-poster-modal';
      modal.className = 'archive-poster-modal';
      modal.innerHTML = `
        <div class="poster-backdrop"></div>
        <div class="poster-container">
          <div class="poster-canvas-wrap">
            <canvas id="poster-canvas" width="800" height="1350"></canvas>
            <img id="poster-result-img" alt="未庄看客档案" hidden />
          </div>
          <div class="poster-actions">
            <button type="button" class="poster-btn btn-save" id="poster-download-btn">保存/下载海报</button>
            <button type="button" class="poster-btn btn-close" id="poster-close-btn">返回未庄</button>
          </div>
          <p class="poster-tip">手机端可长按上方图片直接存储或发送给朋友</p>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#poster-close-btn').addEventListener('click', () => {
        modal.classList.remove('is-active');
        modal.hidden = true;
      });

      modal.querySelector('#poster-download-btn').addEventListener('click', () => {
        const img = modal.querySelector('#poster-result-img');
        if (img && img.src) {
          const a = document.createElement('a');
          a.download = `未庄看客档案_${Date.now()}.png`;
          a.href = img.src;
          a.click();
        }
      });
    }

    modal.hidden = false;
    modal.classList.add('is-active');

    // Draw canvas
    const canvas = modal.querySelector('#poster-canvas');
    const resultImg = modal.querySelector('#poster-result-img');
    this._renderPoster(canvas, stats, (dataUrl) => {
      if (resultImg) {
        resultImg.src = dataUrl;
        resultImg.hidden = false;
        canvas.style.display = 'none';
      }
    });
  }

  _renderPoster(canvas, stats, callback) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // 1. 宣纸底色与墨晕微噪
    ctx.fillStyle = '#f3ebd9';
    ctx.fillRect(0, 0, W, H);

    // 绘制宣纸纤维与做旧渐变
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, 'rgba(215, 195, 160, 0.35)');
    grad.addColorStop(0.5, 'rgba(245, 237, 220, 0.1)');
    grad.addColorStop(1, 'rgba(198, 175, 140, 0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 2. 双层古典木刻边框
    ctx.strokeStyle = '#2b231d';
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    ctx.lineWidth = 1;
    ctx.strokeRect(46, 46, W - 92, H - 92);

    // 3. 顶部木刻横额
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2b231d';
    ctx.font = 'bold 18px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText('魯迅先生原著 ·《阿Ｑ正傳》現場記錄', W / 2, 86);

    ctx.font = '900 46px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText('未 莊 看 客 檔 案', W / 2, 148);

    // 4. 朱砂红印
    this._drawSeal(ctx, W - 120, 92, '未莊', 54);

    // 5. 分割线与装饰
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, 175);
    ctx.lineTo(W - 80, 175);
    ctx.stroke();

    // 6. 看客评定身分牌 (Persona Badge)
    ctx.fillStyle = '#2b231d';
    ctx.font = '20px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText('【 你 在 未 莊 的 身 份 】', W / 2, 226);

    ctx.fillStyle = '#9e3b2b';
    ctx.font = 'bold 36px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText(`“ ${stats.persona} ”`, W / 2, 280);

    // 评语短句
    ctx.fillStyle = '#534439';
    ctx.font = '17px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    let commentary = '“你走遍了未庄的石板路，在人声鼎沸处站过，在门帘落下前听过。”';
    if (stats.persona.includes('起哄')) {
      commentary = '“酒馆的哄笑声里有你的一份，阿Q的涨红脸也有你的一份。”';
    } else if (stats.persona.includes('冷笑')) {
      commentary = '“你以为自己看得比谁都透，可你的冷笑，未庄听了也只是抹平。”';
    } else if (stats.persona.includes('闲汉')) {
      commentary = '“冲突因你而起，规矩因你而动，未庄从不缺挑火的手。”';
    } else if (stats.persona.includes('看客')) {
      commentary = '“凡是愚弱的国民，即使体格如何健全，也只能做毫无意义的看客。”';
    }
    ctx.fillText(commentary, W / 2, 320);

    // 7. 行为量化表格 (Data Grid)
    ctx.fillStyle = '#faf4e8';
    ctx.fillRect(80, 360, W - 160, 230);
    ctx.strokeRect(80, 360, W - 160, 230);

    ctx.fillStyle = '#2b231d';
    ctx.font = 'bold 18px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText('未 莊 行 跡 考', W / 2, 396);

    const items = [
      { label: '漫步时长', val: `${stats.durationMinutes} 刻钟` },
      { label: '踏足处所', val: `${stats.placesVisited ? stats.placesVisited.size : 3} 处现场` },
      { label: '见证风波', val: `${stats.watchedCount || stats.witnessedEvents.length} 次冲突` },
      { label: '起哄喝彩', val: `${stats.cheerCount} 声` },
      { label: '冷眼相待', val: `${stats.sneerCount} 回` },
      { label: '避席沉默', val: `${stats.silenceCount} 次` },
      { label: '火上浇油', val: `${stats.provokeCount} 笔` },
      { label: '搭话探询', val: `${stats.dialogueCount || 2} 番` }
    ];

    ctx.font = '16px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    items.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = col === 0 ? 120 : W / 2 + 30;
      const y = 440 + row * 34;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#6e5d50';
      ctx.fillText(item.label + '：', x, y);
      ctx.fillStyle = '#2b231d';
      ctx.font = 'bold 17px "Songti SC", "Noto Serif CJK SC", STSong, serif';
      ctx.fillText(item.val, x + 92, y);
      ctx.font = '16px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    });

    // 8. 经典原著复刻：阿Q未画合缝的墨圆
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2b231d';
    ctx.font = '20px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText('【 押 供 畫 圓 】', W / 2, 645);

    this._drawAhQCircle(ctx, W / 2, 770, 85);

    ctx.fillStyle = '#534439';
    ctx.font = '16px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText('“他使尽平生的力气画圆，竭力要合缝，', W / 2, 890);
    ctx.fillText('却向外一耸，成了瓜子模样。”', W / 2, 918);

    // 9. 鲁迅金句警语
    ctx.fillStyle = '#2b231d';
    ctx.fillRect(80, 960, W - 160, 160);

    ctx.fillStyle = '#f3ebd9';
    ctx.font = 'italic 18px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText('“群众，尤其是中国的——', W / 2, 1010);
    ctx.fillText('永远是戏剧的看客。', W / 2, 1045);
    ctx.fillText('牺牲上场，如果显出悲壮，他们便跟着喝采；', W / 2, 1075);
    ctx.fillText('倘或显出滑稽，他们便跟着嬉笑。”', W / 2, 1105);

    // 10. 底部水印与印记
    ctx.fillStyle = '#8b7a6c';
    ctx.font = '14px "Songti SC", "Noto Serif CJK SC", STSong, serif';
    ctx.fillText('未庄可行走叙事世界 · Web交互实验', W / 2, 1170);
    ctx.fillText('daozhu1993-oss.github.io/v2/aq-interactive', W / 2, 1195);

    this._drawSeal(ctx, W / 2, 1260, '看客', 46);

    // Export image URL
    setTimeout(() => {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (callback) callback(dataUrl);
      } catch (e) {
        console.warn('Canvas export failed:', e);
      }
    }, 100);
  }

  _drawSeal(ctx, cx, cy, text, size) {
    ctx.save();
    ctx.strokeStyle = '#9e3b2b';
    ctx.fillStyle = '#9e3b2b';
    ctx.lineWidth = 3;

    const r = size / 2;
    ctx.strokeRect(cx - r, cy - r, size, size);

    ctx.font = `bold ${Math.round(size * 0.44)}px "Songti SC", "Noto Serif CJK SC", STSong, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  _drawAhQCircle(ctx, cx, cy, radius) {
    ctx.save();
    ctx.strokeStyle = '#2b231d';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    // 故意画出一个缺口、向外耸出去的“瓜子型墨圆”
    ctx.arc(cx, cy, radius, -Math.PI * 0.45, Math.PI * 1.35, false);
    ctx.bezierCurveTo(cx - radius * 0.9, cy + radius * 1.25, cx + radius * 0.3, cy + radius * 1.3, cx + radius * 0.85, cy + radius * 0.3);
    ctx.stroke();
    ctx.restore();
  }
}
