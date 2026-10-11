// 60-ui.js — 《星月孤岛：梵高的11次凝望》专属诗意界面系统
// 负责：加载进度指示、开屏诗引、第一人称准星与交互反馈、星核计数器、点燃箴言浮窗、终局典藏藏书票生成

import * as THREE from 'three';

(window.SN_MODULES ||= []).push({
  name: 'ui',
  shell: true,
  order: 60,
  async build(SN) {
    const container = document.createElement('div');
    container.id = 'starry-ui-container';
    document.body.appendChild(container);

    // 注入专属优雅中式/艺术手账风格 CSS
    const style = document.createElement('style');
    style.textContent = `
      #starry-ui-container {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, "Noto Serif SC", "Songti SC", "SimSun", serif;
        user-select: none;
      }

      /* 开屏引导封面 */
      .starry-cover {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at center, rgba(16, 40, 107, 0.88) 0%, rgba(11, 26, 69, 0.98) 100%);
        backdrop-filter: blur(8px);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: #fff8d6;
        pointer-events: auto;
        transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1);
        padding: 24px;
        text-align: center;
      }
      .starry-cover.hidden {
        opacity: 0;
        pointer-events: none;
      }
      .starry-title {
        font-size: clamp(32px, 5.5vw, 52px);
        font-weight: 600;
        letter-spacing: 0.18em;
        margin-bottom: 12px;
        color: #f7da68;
        text-shadow: 0 0 24px rgba(247, 218, 104, 0.5);
      }
      .starry-sub {
        font-size: clamp(14px, 2.2vw, 18px);
        letter-spacing: 0.25em;
        color: #c9e3ee;
        margin-bottom: 28px;
        opacity: 0.9;
      }
      .starry-intro {
        max-width: 580px;
        font-size: 15px;
        line-height: 2.2;
        color: #e2eff0;
        margin-bottom: 32px;
        border-top: 1px solid rgba(242, 194, 48, 0.25);
        border-bottom: 1px solid rgba(242, 194, 48, 0.25);
        padding: 18px 16px;
      }
      .starry-btn {
        background: linear-gradient(135deg, #f2c230, #f0a42b);
        color: #0b1a45;
        border: none;
        padding: 14px 44px;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0.2em;
        border-radius: 40px;
        cursor: pointer;
        box-shadow: 0 4px 24px rgba(242, 194, 48, 0.4);
        transition: all 0.3s ease;
      }
      .starry-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 32px rgba(242, 194, 48, 0.6);
      }
      .starry-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }
      .starry-tips {
        margin-top: 20px;
        font-size: 13px;
        color: #8bbbe0;
        letter-spacing: 0.08em;
      }

      /* 游戏内常驻 HUD */
      .starry-hud {
        position: absolute;
        top: 24px;
        left: 28px;
        display: flex;
        align-items: center;
        gap: 14px;
        background: rgba(11, 26, 69, 0.75);
        border: 1px solid rgba(246, 226, 122, 0.4);
        padding: 10px 22px;
        border-radius: 30px;
        color: #fff7cf;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(8px);
        pointer-events: auto;
      }
      .hud-star-icon {
        color: #f2c230;
        font-size: 20px;
        animation: starPulse 2.5s infinite ease-in-out;
      }
      @keyframes starPulse {
        0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px #f2c230); }
        50% { transform: scale(1.2); filter: drop-shadow(0 0 10px #fff7cf); }
      }
      .hud-text {
        font-size: 15px;
        letter-spacing: 0.12em;
      }
      .hud-counter {
        color: #f7da68;
        font-weight: bold;
      }

      /* 暂停状态提示 */
      .pause-banner {
        position: absolute;
        top: 24px;
        right: 28px;
        background: rgba(11, 26, 69, 0.85);
        border: 1px solid rgba(242, 194, 48, 0.4);
        color: #f6e27a;
        padding: 8px 18px;
        border-radius: 20px;
        font-size: 13px;
        letter-spacing: 0.1em;
        pointer-events: auto;
        cursor: pointer;
        display: none;
      }
      .pause-banner:hover {
        background: rgba(28, 60, 143, 0.9);
      }

      /* 准星十字 */
      .starry-crosshair {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255, 247, 207, 0.7);
        box-shadow: 0 0 8px rgba(242, 194, 48, 0.6);
        transition: all 0.25s ease;
      }
      .starry-crosshair.active {
        width: 24px;
        height: 24px;
        background: transparent;
        border: 2px solid #f2c230;
        box-shadow: 0 0 16px #f2c230;
        transform: translate(-50%, -50%) rotate(45deg);
      }
      .crosshair-tip {
        position: absolute;
        top: 26px;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        font-size: 12px;
        letter-spacing: 0.15em;
        color: #fff7cf;
        background: rgba(11, 26, 69, 0.85);
        border: 1px solid rgba(242, 194, 48, 0.4);
        padding: 4px 10px;
        border-radius: 12px;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .starry-crosshair.active .crosshair-tip {
        opacity: 1;
      }

      /* 点燃星核诗笺弹窗 */
      .quote-card {
        position: absolute;
        top: 12%;
        left: 50%;
        transform: translate(-50%, -20px);
        background: rgba(11, 26, 69, 0.9);
        border: 1px solid rgba(242, 194, 48, 0.5);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), inset 0 0 20px rgba(242, 194, 48, 0.15);
        padding: 24px 32px;
        border-radius: 16px;
        color: #fff8d6;
        text-align: center;
        max-width: min(90vw, 560px);
        opacity: 0;
        pointer-events: auto;
        transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        backdrop-filter: blur(12px);
      }
      .quote-card.visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }
      .quote-tag {
        font-size: 13px;
        letter-spacing: 0.2em;
        color: #f2c230;
        margin-bottom: 12px;
      }
      .quote-body {
        font-size: 18px;
        line-height: 1.8;
        color: #fffdf0;
        letter-spacing: 0.08em;
        margin-bottom: 12px;
        font-weight: 500;
      }
      .quote-author {
        font-size: 13px;
        color: #8bbbe0;
        letter-spacing: 0.1em;
        text-align: right;
      }

      /* 终局藏书票 Modal */
      .cert-modal {
        position: absolute;
        inset: 0;
        background: rgba(11, 26, 69, 0.88);
        backdrop-filter: blur(12px);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 1s ease;
        padding: 20px;
      }
      .cert-modal.visible {
        opacity: 1;
        pointer-events: auto;
      }
      .cert-frame {
        background: #fdfaf2;
        color: #1a2957;
        width: min(92vw, 680px);
        max-height: 85vh;
        overflow-y: auto;
        padding: 36px 40px;
        border-radius: 8px;
        border: 8px double #1c3c8f;
        box-shadow: 0 16px 50px rgba(0, 0, 0, 0.8);
        text-align: center;
        position: relative;
      }
      .cert-header {
        font-size: 26px;
        font-weight: 700;
        letter-spacing: 0.25em;
        color: #1c3c8f;
        margin-bottom: 8px;
      }
      .cert-stamp {
        display: inline-block;
        border: 2px solid #b83b3b;
        color: #b83b3b;
        padding: 4px 16px;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.2em;
        margin-bottom: 20px;
        border-radius: 4px;
        transform: rotate(-3deg);
      }
      .cert-desc {
        font-size: 15px;
        line-height: 1.9;
        color: #3b4d6b;
        margin-bottom: 24px;
      }
      .cert-quotes-list {
        text-align: left;
        background: rgba(28, 60, 143, 0.05);
        padding: 16px 24px;
        border-radius: 6px;
        margin-bottom: 24px;
        font-size: 13px;
        line-height: 2;
        color: #2c3e50;
        max-height: 200px;
        overflow-y: auto;
      }
      .cert-actions {
        display: flex;
        gap: 16px;
        justify-content: center;
      }
    `;
    document.head.appendChild(style);

    // 构建界面结构
    container.innerHTML = `
      <div class="starry-cover" id="coverScreen">
        <div class="starry-title">星月孤岛</div>
        <div class="starry-sub">梵高的 11 次凝望 · 寻找散落夜空的星核</div>
        <div class="starry-intro">
          夜幕低垂，圣雷米的小镇在翻涌的星河下安睡。<br>
          画卷中的十一颗星辰余烬，已化作星核散落于教堂、麦垛与幽径。<br>
          漫步走进梵高的笔触，寻找并点燃每一颗星核。<br>
          每一次苏醒，都将照亮一抹星空的轨迹，并唤醒一句属于灵魂深处的诗笺。
        </div>
        <button class="starry-btn" id="startBtn">【 步入画卷 · 重燃星空 】</button>
        <div class="starry-tips" id="coverStatus">
          操作提示：[W / A / S / D] 行走漫游 &middot; [鼠标移动 / 拖拽] 凝望视角 &middot; [点击] 点燃星核
        </div>
      </div>

      <!-- 常驻 HUD 计数器 -->
      <div class="starry-hud" id="hud" style="display:none;">
        <span class="hud-star-icon">✦</span>
        <span class="hud-text">已点燃星辰：<span class="hud-counter" id="starCount">0</span> / 11</span>
      </div>

      <!-- 暂停状态唤醒条 -->
      <div class="pause-banner" id="pauseBanner">
        <span>已暂停 &middot; 点击屏幕继续漫游</span>
      </div>

      <!-- 准星 -->
      <div class="starry-crosshair" id="crosshair">
        <span class="crosshair-tip">点击点燃星核</span>
      </div>

      <!-- 点燃箴言浮窗卡片 -->
      <div class="quote-card" id="quoteCard">
        <div class="quote-tag" id="quoteTag">✦ 拾得星核 &middot; Ⅰ. 根系之火</div>
        <div class="quote-body" id="quoteBody">「在这个世界上，唯有爱与艺术能穿透重重黑夜。」</div>
        <div class="quote-author" id="quoteAuthor">—— 文森特·梵高 致提奥，1889</div>
      </div>

      <!-- 终局典藏藏书票 Modal -->
      <div class="cert-modal" id="certModal">
        <div class="cert-frame">
          <div class="cert-stamp">岛主精神画廊 &middot; 藏书票</div>
          <div class="cert-header">星月夜重燃典藏证书</div>
          <div class="cert-desc">
            漫游者于沉睡的圣雷米小镇中，集齐了全部十一颗散落的星核。<br>
            天际星漩轰然重燃，群青与铬黄的光芒再次点亮了梵高的夜空。
          </div>
          <div class="cert-quotes-list" id="certQuotesList"></div>
          <div class="cert-actions">
            <button class="starry-btn" id="downloadCertBtn">【 保存典藏藏书票 】</button>
            <button class="starry-btn" style="background:#2a5bb0;color:#fff;" id="continueRoamBtn">【 继续画中漫游 】</button>
          </div>
        </div>
      </div>
    `;

    const coverScreen = document.getElementById('coverScreen');
    const startBtn = document.getElementById('startBtn');
    const coverStatus = document.getElementById('coverStatus');
    const hud = document.getElementById('hud');
    const starCount = document.getElementById('starCount');
    const pauseBanner = document.getElementById('pauseBanner');
    const crosshair = document.getElementById('crosshair');
    const quoteCard = document.getElementById('quoteCard');
    const quoteTag = document.getElementById('quoteTag');
    const quoteBody = document.getElementById('quoteBody');
    const quoteAuthor = document.getElementById('quoteAuthor');
    const certModal = document.getElementById('certModal');
    const certQuotesList = document.getElementById('certQuotesList');
    const downloadCertBtn = document.getElementById('downloadCertBtn');
    const continueRoamBtn = document.getElementById('continueRoamBtn');

    let isLevelReady = false;
    let pendingStart = false;

    // 移除原始 preload 覆盖层并更新加载进度
    const preloadEl = document.getElementById('sn-preload');
    SN.on('progress', ({ name, i, n }) => {
      if (preloadEl) {
        const pct = Math.round((i / (n || 5)) * 100);
        preloadEl.innerHTML = `正在调和梵高的颜料与夜空的星辉&hellip; (${pct}%)<br><span style="font-size:13px;opacity:0.7">${name || ''}</span>`;
      }
    });

    function onReady() {
      isLevelReady = true;
      if (preloadEl) preloadEl.remove();
      startBtn.disabled = false;
      startBtn.textContent = '【 步入画卷 · 重燃星空 】';
      if (pendingStart) {
        pendingStart = false;
        doStartGame();
      }
    }

    SN.on('ready', onReady);
    if (SN.ready || SN.levelLoaded) onReady();

    // 启动游戏逻辑
    function doStartGame() {
      coverScreen.classList.add('hidden');
      hud.style.display = 'flex';

      // 允许拖拽视角（保障在无法锁定时依然可顺畅移动视角）
      if (SN.input) {
        SN.input.dragLook = true;
      }

      // 真正启动 core 的运行状态机
      if (SN.startGame) {
        SN.startGame({ lock: true });
      }

      // 聚焦渲染 Canvas
      const canvas = SN.renderer?.domElement;
      if (canvas) {
        canvas.focus();
        try {
          if (canvas.requestPointerLock) canvas.requestPointerLock();
        } catch (e) {
          console.warn('Pointer lock request error:', e);
        }
      }

      // 唤醒背景音频
      if (SN.audio && SN.audio.unlock) {
        SN.audio.unlock();
      }
    }

    startBtn.onclick = () => {
      if (!isLevelReady) {
        pendingStart = true;
        startBtn.textContent = '正在进入星月夜...';
        return;
      }
      doStartGame();
    };

    // 暂停与恢复处理
    SN.on('pause', () => {
      pauseBanner.style.display = 'block';
    });

    SN.on('resume', () => {
      pauseBanner.style.display = 'none';
    });

    pauseBanner.onclick = () => {
      if (SN.resume) SN.resume();
      pauseBanner.style.display = 'none';
      const canvas = SN.renderer?.domElement;
      if (canvas) {
        canvas.focus();
        try { canvas.requestPointerLock?.(); } catch (e) {}
      }
    };

    // 点击 Canvas 时自动恢复
    const canvasEl = SN.renderer?.domElement;
    if (canvasEl) {
      canvasEl.addEventListener('click', () => {
        if (SN.game?.state === 'paused') {
          if (SN.resume) SN.resume();
          pauseBanner.style.display = 'none';
        }
      });
    }

    // 准星瞄准指示
    SN.onUpdate(() => {
      if (SN.aim?.star) {
        crosshair.classList.add('active');
      } else {
        crosshair.classList.remove('active');
      }
    });

    // 监听拾得星核事件
    let quoteTimeout = null;
    SN.on('starFound', ({ lore, foundCount, total }) => {
      starCount.textContent = foundCount;

      // 刷新箴言诗笺
      quoteTag.textContent = `✦ 拾得星核 &middot; ${lore.numeral}. ${lore.name}（${lore.place}）`;
      quoteBody.textContent = `「${lore.quote}」`;
      quoteAuthor.textContent = lore.author;

      quoteCard.classList.add('visible');

      clearTimeout(quoteTimeout);
      quoteTimeout = setTimeout(() => {
        quoteCard.classList.remove('visible');
      }, 6500);
    });

    // 监听 11 颗星辰全部找齐终局
    SN.on('allStarsFound', ({ quotes }) => {
      setTimeout(() => {
        certQuotesList.innerHTML = quotes.map(q => `
          <div><strong>${q.numeral}. ${q.name}</strong>：${q.quote} <span style="opacity:0.7">${q.author}</span></div>
        `).join('');
        certModal.classList.add('visible');
      }, 4000);
    });

    continueRoamBtn.onclick = () => {
      certModal.classList.remove('visible');
    };

    // 保存典藏藏书票 (Canvas 生成图片下载)
    downloadCertBtn.onclick = () => {
      const cv = document.createElement('canvas');
      cv.width = 1200;
      cv.height = 800;
      const ctx = cv.getContext('2d');

      // 背景与深蓝油画底色
      ctx.fillStyle = '#0b1a45';
      ctx.fillRect(0, 0, 1200, 800);

      // 金色古典双边框
      ctx.strokeStyle = '#f2c230';
      ctx.lineWidth = 6;
      ctx.strokeRect(30, 30, 1140, 740);
      ctx.lineWidth = 2;
      ctx.strokeRect(42, 42, 1116, 716);

      // 文字
      ctx.fillStyle = '#f7da68';
      ctx.font = 'bold 38px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.fillText('星月孤岛 · 梵高的 11 次凝望', 600, 120);

      ctx.fillStyle = '#8bbbe0';
      ctx.font = '20px "Noto Serif SC", serif';
      ctx.fillText('—— 岛主精神画廊 · 星夜重燃典藏藏书票 ——', 600, 168);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'italic 20px "Noto Serif SC", serif';
      ctx.fillText('“在这个世界上，唯有爱与艺术能穿透重重黑夜。”', 600, 240);

      ctx.font = '16px -apple-system, sans-serif';
      ctx.fillStyle = '#c9e3ee';
      ctx.fillText(`漫游记录归档于圣雷米星空下 · 编号 #ISLE-1889-011 · 日期 ${new Date().toLocaleDateString()}`, 600, 700);

      const a = document.createElement('a');
      a.download = '星月孤岛-典藏藏书票.png';
      a.href = cv.toDataURL('image/png');
      a.click();
    };

    return {
      showCover: () => coverScreen.classList.remove('hidden'),
      hideCover: () => coverScreen.classList.add('hidden')
    };
  }
});
