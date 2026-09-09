/**
 * DAOZHU POCKET (岛主口袋掌机) - DAOZHU OS 1.0
 * 驱动掌机屏幕渲染、视图切换、按键映射与卡带加载
 */

document.addEventListener('DOMContentLoaded', () => {
  // 判断是否为本地开发环境 (支持本地卡丁车服务端口 7788)
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // 核心数据：岛主 4 大核心卡带 (全部使用 daozhuai.cn 专属国内免翻墙高速域名)
  const CARTRIDGES = [
    {
      id: 'aq',
      rom: 'ROM 01',
      title: '阿Q正传 · 未庄',
      source: '鲁迅《阿Q正传》',
      year: '1918 · WEIZHUANG',
      tags: ['可行走叙事', 'AI实时对话', '角色代入'],
      desc: '你不是读者，是未庄的看客。走进未庄街头，每一次开口与沉默，都会照见自己。阿Q会真的接你的话。',
      cover: 'assets/covers/aq.jpg',
      url: 'https://aq.daozhuai.cn',
      fallbackUrl: 'https://daozhu1993-oss.github.io/v2/aq-interactive/',
      tip: '支持 AI 自由对话 · 单击 A 键开玩'
    },
    {
      id: 'cuzhi',
      rom: 'ROM 02',
      title: '促织 · 斗蟋蟀',
      source: '蒲松龄《聊斋志异》',
      year: '宣德 · THE CRICKET',
      tags: ['互动书', '六折戏', '斗虫', '音游'],
      desc: '一个孩子化作一只促织，替全家斗赢了整个天下。听声辨位抓虫、四场斗虫、金銮殿五音音游。',
      cover: 'assets/covers/cuzhi.jpg',
      url: 'https://cuzhi.daozhuai.cn',
      fallbackUrl: 'https://daozhu1993-oss.github.io/portfolio/cuzhi-interactive/',
      tip: '含斗蟋蟀与宫廷音游 · 单击 A 键开玩'
    },
    {
      id: 'fogg',
      rom: 'ROM 03',
      title: 'Fogg 的赌约',
      source: '凡尔纳《八十天环游地球》',
      year: '1872 · 80 DAYS',
      tags: ['叙事探险', '蒸汽快艇', '跑酷', '牌局'],
      desc: '八十天，两万英镑，一秒不容差池的环球狂澜。主线11关，误了班轮？重金包下蒸汽快艇破浪前行！',
      cover: 'assets/covers/fogg.jpg',
      url: 'https://me.daozhuai.cn/foggs-bet/',
      fallbackUrl: 'https://daozhu1993-oss.github.io/foggs-bet/',
      tip: '11关探险游乐场 · 单击 A 键开玩'
    },
    {
      id: 'kart',
      rom: 'ROM 04',
      title: '蘑菇卡丁车 · 赛道冒险',
      source: 'Three.js 3D 竞速 · 岛主出品',
      year: '2026 · TURBO SPEED',
      tags: ['3D竞速', '经典漂移', '道具对决', '多人在线'],
      desc: '驾驶马里奥与伙伴们的卡丁车，在蘑菇王国体验多赛道极速狂飙、漂移集气与8类道具对决。',
      cover: 'assets/covers/kart.jpg',
      url: isLocal ? 'http://localhost:7788/' : 'https://kart.daozhuai.cn',
      fallbackUrl: 'https://kart.daozhuai.cn',
      tip: '极速飞驰漂移 · 单击 A 键开玩'
    }
  ];

  // 状态管理
  const state = {
    currentView: 'HOME', // HOME, GAMES, ABOUT, WORKS, MINIGAME, CONTACT
    menuIndex: 0,
    gameIndex: 0,
    worksIndex: 0,
    minigameInstance: null
  };

  // DOM 节点引用
  const screenContent = document.getElementById('screen-content');
  const soundIcon = document.getElementById('sound-status');
  const batteryLed = document.getElementById('battery-led');
  const bottomHint = document.getElementById('bottom-hint');

  function vibrate(ms = 12) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  }

  // 埋点监测辅助函数 (51.la 自定义事件，国内免翻墙极速上报)
  function trackPocketEvent(eventName, eventData = {}) {
    try {
      if (window.LA && typeof window.LA.track === 'function') {
        window.LA.track(eventName, eventData);
      }
    } catch (e) {}
  }
  window.trackPocketEvent = trackPocketEvent;

  // 关闭弹窗辅助函数
  function closeModal() {
    const modal = document.getElementById('game-launcher-modal');
    if (modal) {
      modal.classList.remove('active');
      const iframe = document.getElementById('modal-game-iframe');
      if (iframe) iframe.src = 'about:blank';
      if (window.retroAudio) window.retroAudio.cancel();
    }
  }

  // 启动游戏逻辑
  function launchGame(cart) {
    if (!cart) cart = CARTRIDGES[state.gameIndex];
    if (window.retroAudio) window.retroAudio.cartridge();
    vibrate(30);

    // 上报开始玩游戏事件
    trackPocketEvent('play_game', {
      rom: cart.rom,
      title: cart.title,
      url: cart.url
    });

    const modal = document.getElementById('game-launcher-modal');
    const modalTitle = document.getElementById('modal-game-title');
    const modalIframe = document.getElementById('modal-game-iframe');

    if (modal && modalIframe) {
      modalTitle.textContent = `${cart.rom}: ${cart.title}`;
      modalIframe.src = cart.url;
      modal.classList.add('active');
    }
  }

  // 1. 渲染函数：主菜单
  function renderHome() {
    state.currentView = 'HOME';
    const menuItems = [
      { id: 'games', label: '游戏匣子', code: '01', sub: '4款经典游戏卡带' },
      { id: 'minigame', label: '掌机彩蛋', code: '02', sub: '8-Bit 促织跳跳乐' },
      { id: 'about', label: '关于岛主', code: '03', sub: '故事驱动器与理念' },
      { id: 'works', label: '作品示例', code: '04', sub: '灵感库/绘本/工具' },
      { id: 'contact', label: '联络名片', code: '05', sub: '微信/小红书/日报' }
    ];

    let itemsHtml = menuItems.map((item, idx) => `
      <div class="menu-row ${idx === state.menuIndex ? 'active' : ''}" data-idx="${idx}" onclick="window.pocketNav(${idx})">
        <div class="cursor">${idx === state.menuIndex ? '▶' : '&nbsp;'}</div>
        <div class="label-box">
          <span class="m-label">${item.label}</span>
          <span class="m-sub">${item.sub}</span>
        </div>
        <div class="m-code">${item.code}</div>
      </div>
    `).join('');

    screenContent.innerHTML = `
      <div class="view-home">
        <div class="profile-card">
          <div class="avatar-box">
            <span class="avatar-pixel">🐱</span>
          </div>
          <div class="profile-info">
            <div class="name-row">
              <span class="name">岛主</span>
              <span class="badge">PROD</span>
            </div>
            <div class="role-desc">全栈产品人 · 故事驱动器</div>
            <div class="quote">“用故事思维驱动用户价值”</div>
          </div>
        </div>

        <div class="menu-list">
          ${itemsHtml}
        </div>
      </div>
    `;

    bottomHint.textContent = '方向键选择 · 按 A 键进入 · SELECT 游戏库';
  }

  window.pocketNav = (idx) => {
    state.menuIndex = idx;
    handleInput('A', true);
  };

  // 2. 渲染函数：卡带列表 (GAMES)
  function renderGames() {
    state.currentView = 'GAMES';
    const currentCart = CARTRIDGES[state.gameIndex];

    const cardsHtml = CARTRIDGES.map((cart, idx) => `
      <div class="cart-pill ${idx === state.gameIndex ? 'selected' : ''}" data-cart-idx="${idx}" onclick="window.selectCart(${idx})">
        ${cart.rom}
      </div>
    `).join('');

    screenContent.innerHTML = `
      <div class="view-games">
        <div class="sub-header">
          <span>◆ CARTRIDGE ARCADE ◆</span>
          <span>${state.gameIndex + 1}/${CARTRIDGES.length}</span>
        </div>

        <div class="cartridge-selector">
          ${cardsHtml}
        </div>

        <div class="cartridge-card" onclick="window.launchCurrentGame()" style="cursor:pointer;" title="点击或按 A 键立即开玩">
          <div class="cart-img-wrap">
            <img src="${currentCart.cover}" alt="${currentCart.title}" onerror="this.src='assets/covers/aq.jpg'">
            <div class="cart-stamp">${currentCart.year}</div>
          </div>
          <div class="cart-detail">
            <div class="cart-title">${currentCart.title}</div>
            <div class="cart-source">${currentCart.source}</div>
            <div class="cart-tags">
              ${currentCart.tags.map(t => `<span class="cart-tag">${t}</span>`).join('')}
            </div>
            <p class="cart-desc">${currentCart.desc}</p>
          </div>
        </div>

        <div class="cart-actions" style="display:flex;gap:6px;justify-content:center;">
          <button class="screen-btn play-btn" id="btn-play-game" onclick="window.launchCurrentGame()">
            <span class="btn-icon">▶</span> 插入卡带 · 立即开玩 (A)
          </button>
          <button class="screen-btn ext-btn" id="btn-open-ext" onclick="window.openCurrentGameFull()" style="background:var(--lcd-mid);">
            <span>↗</span> 全屏新标签
          </button>
        </div>
      </div>
    `;

    bottomHint.textContent = '左右切卡带 · 按 A 立即开玩 · 按 B 返回';
  }

  window.selectCart = (idx) => {
    state.gameIndex = idx;
    if (window.retroAudio) window.retroAudio.cursor();
    renderGames();
  };

  window.launchCurrentGame = () => {
    launchGame(CARTRIDGES[state.gameIndex]);
  };

  window.openCurrentGameFull = () => {
    const cart = CARTRIDGES[state.gameIndex];
    if (window.retroAudio) window.retroAudio.cartridge();
    if (cart && cart.url) {
      window.open(cart.url, '_blank');
    }
  };

  // 3. 渲染函数：关于岛主 (ABOUT)
  function renderAbout() {
    state.currentView = 'ABOUT';
    screenContent.innerHTML = `
      <div class="view-about">
        <div class="sub-header">
          <span>◆ 岛主档案 · DOSSIER ◆</span>
          <span>03/05</span>
        </div>
        <div class="about-scroll">
          <div class="about-block">
            <h3>【关于岛主】</h3>
            <p>你好，我是岛主。一个相信<strong>“故事是最高效沟通算法”</strong>的全栈产品人与独立探索者。</p>
          </div>
          <div class="about-block">
            <h3>【产品信条】</h3>
            <p>1. <strong>把读过的书，做成能走进去的地方</strong>：鲁迅的未庄、聊斋的蟋蟀、凡尔纳的环球、马里奥的赛道，都能变成指尖直接漫游的世界。</p>
            <p>2. <strong>单文件，零门槛</strong>：不逼用户安装、不强制注册。点开链接就能玩，手机横过来也能畅行。</p>
            <p>3. <strong>一人公司与超级个体</strong>：AI 把系统构建的门槛压到了个人级，一个人也能做出一座丰富的小岛。</p>
          </div>
          <div class="about-block">
            <h3>【当前状态】</h3>
            <p>持续更新个人海岛站、每日资讯策展 (Daily Curator)、互动叙事游戏与思维工具。</p>
          </div>
        </div>
      </div>
    `;
    bottomHint.textContent = '上下滑动阅读 · B 键返回主菜单';
  }

  // 4. 渲染函数：代表作品 (WORKS)
  function renderWorks() {
    state.currentView = 'WORKS';
    const works = [
      {
        title: '灵感库 (DAOZHU INSPO)',
        tag: '产品灵感 · 知识系统',
        desc: '沉淀产品设计、一人公司、美学与交互的前沿灵感。',
        link: 'https://daozhu1993-oss.github.io/daozhu-inspo/'
      },
      {
        title: '给女儿的绘本 (Picturebook)',
        tag: 'AI 创作 · 叙事温度',
        desc: '用童心与 AI 技术，为女儿绘制的温情童话世界。',
        link: 'https://daozhu1993-oss.github.io/picturebook/'
      },
      {
        title: '诗歌排版工具 (Poem Typeset)',
        tag: '中文排版 · 极简美学',
        desc: '让中文诗歌在屏幕上拥有呼吸感与古典韵律的排版神器。',
        link: 'https://daozhu1993-oss.github.io/poem-typeset-tool/'
      },
      {
        title: '战略思维模型库 (Models)',
        tag: '思维框架 · 决策辅助',
        desc: 'MECE 分析法、BLM 业务领先模型、战略推演地图。',
        link: 'https://daozhu1993-oss.github.io/v2/#models'
      }
    ];

    screenContent.innerHTML = `
      <div class="view-works">
        <div class="sub-header">
          <span>◆ FEATURED WORKS ◆</span>
          <span>${works.length} 个项目</span>
        </div>
        <div class="works-list">
          ${works.map((w) => `
            <div class="work-card" onclick="window.open('${w.link}', '_blank')">
              <div class="work-top">
                <span class="work-title">${w.title}</span>
                <span class="work-tag">${w.tag}</span>
              </div>
              <p class="work-desc">${w.desc}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    bottomHint.textContent = '点击卡片直接查看 · B 键返回主菜单';
  }

  // 5. 渲染函数：内置 8-Bit 像素游戏 (MINIGAME)
  function renderMinigame() {
    state.currentView = 'MINIGAME';
    trackPocketEvent('play_cricket_minigame', { title: '促织跳跳乐' });
    screenContent.innerHTML = `
      <div class="view-minigame">
        <canvas id="cricket-canvas"></canvas>
      </div>
    `;
    bottomHint.textContent = '按住 [A] 蓄力起跳 · 左右键微调 · B 返回';

    const canvas = document.getElementById('cricket-canvas');
    if (canvas && window.CricketGame) {
      if (state.minigameInstance) {
        state.minigameInstance.stop();
      }
      state.minigameInstance = new CricketGame(canvas);
      state.minigameInstance.run();
    }
  }

  // 6. 渲染函数：联络名片 (CONTACT)
  function renderContact() {
    state.currentView = 'CONTACT';
    screenContent.innerHTML = `
      <div class="view-contact">
        <div class="sub-header">
          <span>◆ 扫码联络 · CONNECT ◆</span>
          <span>05/05</span>
        </div>
        <div class="contact-box">
          <div class="qr-frame" onclick="trackPocketEvent('click_wechat_card'); window.open('assets/wechat-card.png', '_blank')" style="cursor:pointer;" title="点击查看大图名片">
            <img src="assets/wechat.png" alt="微信二维码：岛主王仙客" onerror="this.src='assets/covers/aq.jpg'">
          </div>
          <div class="contact-info">
            <div class="c-title">微信扫码：@岛主王仙客</div>
            <div class="c-item">✦ 个人小岛：daozhuai.cn</div>
            <a class="c-item xhs-item" href="https://xhslink.cn/o/6qUqpAyzrP3" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation(); trackPocketEvent('click_xiaohongshu', { pos: 'screen' }); window.open('https://xhslink.cn/o/6qUqpAyzrP3', '_blank')">
              ✦ 小红书：@岛主 <span class="xhs-badge">989赞藏</span> ↗
            </a>
            <div class="c-item">✦ 探讨：AI、故事、游戏化</div>
          </div>
        </div>
      </div>
    `;
    bottomHint.textContent = '扫码添加 · 按 A 键直达小红书 · B 键返回';
  }

  // 掌机按键操作总分发
  function handleInput(action, isDown = true) {
    if (!isDown) {
      if (state.currentView === 'MINIGAME' && state.minigameInstance) {
        state.minigameInstance.handleButtonUp(action);
      }
      return;
    }

    if (window.retroAudio) {
      window.retroAudio.resume();
    }

    // 模态弹窗打开状态下的按键拦截
    const modal = document.getElementById('game-launcher-modal');
    if (modal && modal.classList.contains('active')) {
      if (action === 'B') {
        closeModal();
        return;
      }
      if (action === 'A') {
        const cart = CARTRIDGES[state.gameIndex];
        if (cart && cart.url) window.open(cart.url, '_blank');
        return;
      }
    }

    // 小游戏运行状态拦截
    if (state.currentView === 'MINIGAME' && state.minigameInstance) {
      if (action === 'B') {
        state.minigameInstance.stop();
        state.minigameInstance = null;
        if (window.retroAudio) window.retroAudio.cancel();
        renderHome();
        return;
      }
      state.minigameInstance.handleButtonDown(action);
      return;
    }

    // 全局功能键
    if (action === 'SELECT') {
      if (window.retroAudio) window.retroAudio.cursor();
      renderGames();
      return;
    }

    if (action === 'START') {
      const posterBtn = document.getElementById('btn-export-poster');
      if (posterBtn) posterBtn.click();
      return;
    }

    // HOME 视图按键
    if (state.currentView === 'HOME') {
      if (action === 'UP') {
        state.menuIndex = (state.menuIndex - 1 + 5) % 5;
        if (window.retroAudio) window.retroAudio.cursor();
        renderHome();
      } else if (action === 'DOWN') {
        state.menuIndex = (state.menuIndex + 1) % 5;
        if (window.retroAudio) window.retroAudio.cursor();
        renderHome();
      } else if (action === 'A') {
        if (window.retroAudio) window.retroAudio.confirm();
        switch (state.menuIndex) {
          case 0: renderGames(); break;
          case 1: renderMinigame(); break;
          case 2: renderAbout(); break;
          case 3: renderWorks(); break;
          case 4: renderContact(); break;
        }
      }
      return;
    }

    // GAMES 视图按键
    if (state.currentView === 'GAMES') {
      if (action === 'LEFT') {
        state.gameIndex = (state.gameIndex - 1 + CARTRIDGES.length) % CARTRIDGES.length;
        if (window.retroAudio) window.retroAudio.cursor();
        renderGames();
      } else if (action === 'RIGHT') {
        state.gameIndex = (state.gameIndex + 1) % CARTRIDGES.length;
        if (window.retroAudio) window.retroAudio.cursor();
        renderGames();
      } else if (action === 'A') {
        // 直接开玩游戏！
        launchGame(CARTRIDGES[state.gameIndex]);
      } else if (action === 'B') {
        if (window.retroAudio) window.retroAudio.cancel();
        renderHome();
      }
      return;
    }

    // CONTACT 视图按键：A 键直达小红书
    if (state.currentView === 'CONTACT') {
      if (action === 'A') {
        if (window.retroAudio) window.retroAudio.confirm();
        trackPocketEvent('click_xiaohongshu', { pos: 'gamepad_a_button' });
        window.open('https://xhslink.cn/o/6qUqpAyzrP3', '_blank');
        return;
      }
      if (action === 'B') {
        if (window.retroAudio) window.retroAudio.cancel();
        renderHome();
        return;
      }
      return;
    }

    // 其余子视图 B 键统一返回
    if (action === 'B') {
      if (window.retroAudio) window.retroAudio.cancel();
      renderHome();
    }
  }

  // 绑定实体按键
  const bindButton = (selector, action) => {
    const el = document.querySelector(selector);
    if (!el) return;

    const start = (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      vibrate(15);
      handleInput(action, true);
    };

    const end = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
      handleInput(action, false);
    };

    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  };

  bindButton('#dpad-up', 'UP');
  bindButton('#dpad-down', 'DOWN');
  bindButton('#dpad-left', 'LEFT');
  bindButton('#dpad-right', 'RIGHT');
  bindButton('#btn-a', 'A');
  bindButton('#btn-b', 'B');
  bindButton('#btn-select', 'SELECT');
  bindButton('#btn-start', 'START');

  // ════════════════════════════════════════════════════════════
  // 键盘映射优化：彻底解决“按 A 键无法打开游戏”
  // 键盘 A 键和 B 键直接映射为掌机 A 确认 / B 返回！
  // ════════════════════════════════════════════════════════════
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const key = e.key;

    // 方向导航：方向键 ArrowUp / ArrowDown / ArrowLeft / ArrowRight，以及 W / S
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      handleInput('UP', true);
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      handleInput('DOWN', true);
    } else if (key === 'ArrowLeft') {
      handleInput('LEFT', true);
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      handleInput('RIGHT', true);
    } 
    // 【核心修复】字母 A 直接对应掌机 A 确认键！空格、回车、K、Z 也作为备用 A 键
    else if (key === 'a' || key === 'A' || key === ' ' || key === 'Enter' || key === 'k' || key === 'K' || key === 'z' || key === 'Z') {
      handleInput('A', true);
    } 
    // 【核心修复】字母 B 直接对应掌机 B 返回键！Esc、Backspace、J、X 也作为备用 B 键
    else if (key === 'b' || key === 'B' || key === 'Escape' || key === 'Backspace' || key === 'j' || key === 'J' || key === 'x' || key === 'X') {
      handleInput('B', true);
    } 
    else if (key === 'Shift' || key === 'Tab') {
      handleInput('SELECT', true);
    } 
    else if (key === 'm' || key === 'M') {
      const isMuted = window.retroAudio.toggleMute();
      soundIcon.textContent = isMuted ? '🔇' : '🔊';
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key;
    if (key === 'ArrowUp' || key === 'w' || key === 'W') handleInput('UP', false);
    else if (key === 'ArrowDown' || key === 's' || key === 'S') handleInput('DOWN', false);
    else if (key === 'ArrowLeft') handleInput('LEFT', false);
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') handleInput('RIGHT', false);
    else if (key === 'a' || key === 'A' || key === ' ' || key === 'Enter' || key === 'k' || key === 'K' || key === 'z' || key === 'Z') handleInput('A', false);
    else if (key === 'b' || key === 'B' || key === 'Escape' || key === 'Backspace' || key === 'j' || key === 'J' || key === 'x' || key === 'X') handleInput('B', false);
  });

  // 音频切换按钮
  soundIcon.addEventListener('click', () => {
    const isMuted = window.retroAudio.toggleMute();
    soundIcon.textContent = isMuted ? '🔇' : '🔊';
  });

  // 弹窗关闭与全屏
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-fullscreen-btn').addEventListener('click', () => {
    const cart = CARTRIDGES[state.gameIndex];
    if (cart && cart.url) {
      window.open(cart.url, '_blank');
    }
  });

  // 首次交互开机
  let hasBooted = false;
  const triggerBoot = () => {
    if (!hasBooted) {
      hasBooted = true;
      if (window.retroAudio) window.retroAudio.boot();
      batteryLed.classList.add('on');
    }
  };
  window.addEventListener('click', triggerBoot, { once: true });
  window.addEventListener('touchstart', triggerBoot, { once: true });
  window.addEventListener('keydown', triggerBoot, { once: true });

  // 启动初始渲染
  renderHome();
});
