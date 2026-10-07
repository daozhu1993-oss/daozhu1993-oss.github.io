/**
 * DAOZHU POCKET (岛主口袋掌机) - DAOZHU OS 2.0 (AWWWARDS / SOTD EDITION)
 * 驱动 3D 拟态视差、物理电源开关、实体卡带插拔卡槽、六大调色板与五大外壳系统、
 * Web Gamepad 手柄接入、科乐美秘技引擎及 8-Bit 像素操作系统
 */

document.addEventListener('DOMContentLoaded', () => {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // 核心数据：岛主 7 大核心卡带
  const CARTRIDGES = [
    {
      id: 'aq',
      rom: 'ROM 01',
      code: 'DMG-AQ-CHN',
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
      code: 'DMG-CRK-CHN',
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
      code: 'DMG-80D-CHN',
      title: 'Fogg 的赌约',
      source: '凡尔纳《八十天环游地球》',
      year: '1872 · 80 DAYS',
      tags: ['叙事探险', '蒸汽快艇', '跑酷', '牌局'],
      desc: '八十天，两万英镑，一秒不容差池的环球狂澜。主线11关，误了班轮？重金包下蒸汽快艇破浪前行！',
      cover: 'assets/covers/fogg.jpg',
      url: 'https://fogg.daozhuai.cn',
      fallbackUrl: 'https://daozhu1993-oss.github.io/foggs-bet/?v=96',
      tip: '11关探险游乐场 · 单击 A 键开玩'
    },
    {
      id: 'kart',
      rom: 'ROM 04',
      code: 'DMG-KRT-CHN',
      title: '蘑菇卡丁车 · 赛道冒险',
      source: 'Three.js 3D 竞速 · 岛主出品',
      year: '2026 · TURBO SPEED',
      tags: ['3D竞速', '经典漂移', '道具对决', '多人在线'],
      desc: '驾驶马里奥与伙伴们的卡丁车，在蘑菇王国体验多赛道极速狂飙、漂移集气与8类道具对决。',
      cover: 'assets/covers/kart.jpg',
      url: isLocal ? 'http://localhost:7788/' : 'https://kart.daozhuai.cn',
      fallbackUrl: 'https://kart.daozhuai.cn',
      tip: '极速飞驰漂移 · 单击 A 键开玩'
    },
    {
      id: 'tetris',
      rom: 'ROM 05',
      code: 'DMG-TET-CHN',
      title: 'GB 俄罗斯方块 1989',
      source: '任天堂 Game Boy 封神之作',
      year: '1989 · TETRIS',
      tags: ['经典消除', '喀秋莎BGM', '幽灵阴影', '一键硬降'],
      desc: '原汁原味 1989 初代点阵绿调、7大经典骨牌、Web Audio 原生合成喀秋莎芯片音乐，支持暂存与打榜记分。',
      cover: 'assets/covers/tetris.jpg',
      url: 'games/tetris/index.html',
      fallbackUrl: 'games/tetris/index.html',
      tip: '经典点阵消除 · 单击 A 键开玩'
    },
    {
      id: 'shanhai',
      rom: 'ROM 06',
      code: 'DMG-SHH-CHN',
      title: '山海灵感图鉴',
      source: '《山海经》× 宝可梦 8-Bit 复刻',
      year: '1996 · POKÉDEX',
      tags: ['像素大地图', '草丛遇怪', '回合对战', '全图鉴收服'],
      desc: '漫步山海海岛大地图，踩草丛遭遇九尾狐、饕餮、毕方与心魔异兽，压低血量投掷收妖葫芦，点亮全套山海图鉴！',
      cover: 'assets/covers/shanhai.jpg',
      url: 'games/shanhai/index.html',
      fallbackUrl: 'games/shanhai/index.html',
      tip: '像素冒险遇怪 · 单击 A 键开玩'
    },
    {
      id: 'pelican',
      rom: 'ROM 07',
      code: 'DMG-PLC-CHN',
      title: '海风信使 · 3D单车漫游',
      source: 'Three.js 程序化3D · 昼夜流转',
      year: '2026 · ISLAND COURIER 3D',
      tags: ['实时3D', '双骨骼IK', '布料物理', '自由漫游'],
      desc: '一只头戴复古骑行盔、系暖阳围巾的白鹈鹕信使，踩着单车沿海岛海岸线漫游捕鱼。落日晚霞、动态海浪、电影运镜与生成音乐，尽享海风慢时光。',
      cover: 'assets/covers/pelican.jpg',
      url: 'games/pelican/index.html',
      fallbackUrl: 'games/pelican/index.html',
      tip: '3D 海滨单车漫游 · 单击 A 键开玩'
    }
  ];

  // 状态管理
  const state = {
    currentView: 'HOME', // HOME, GAMES, ABOUT, WORKS, MINIGAME, CONTACT
    menuIndex: 0,
    gameIndex: 0,
    worksIndex: 0,
    minigameInstance: null,
    isPoweredOn: true,
    shell: 'classic',
    palette: 'dmg',
    contrast: 1.0,
    isBooting: false
  };

  // DOM 节点引用
  const screenContent = document.getElementById('screen-content');
  const soundIcon = document.getElementById('sound-status');
  const bottomHint = document.getElementById('bottom-hint');
  const powerSlider = document.getElementById('power-slider');
  const bootOverlay = document.getElementById('boot-overlay');
  const consoleStage = document.getElementById('console-stage');
  const specularGlare = document.getElementById('specular-glare');
  const insertedCartTitle = document.getElementById('inserted-cart-title');
  const insertedCartridge = document.getElementById('inserted-cartridge');
  const cartridgeShelf = document.getElementById('cartridge-shelf');
  const btnToggleBgm = document.getElementById('btn-toggle-bgm');
  const gamepadStatusBadge = document.getElementById('gamepad-status-badge');
  const screenGamepadIcon = document.getElementById('screen-gamepad-icon');

  function vibrate(ms = 14) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  }

  // 51.la 埋点辅助
  function trackPocketEvent(eventName, eventData = {}) {
    try {
      if (window.LA && typeof window.LA.track === 'function') {
        window.LA.track(eventName, eventData);
      }
    } catch (e) {}
  }
  window.trackPocketEvent = trackPocketEvent;

  // ─────────────────────────────────────────────────────────────
  // 1. 3D 拟态视差悬浮与流光引擎 (3D Interactive Tilt & Glare)
  // ─────────────────────────────────────────────────────────────
  let targetRotateX = 0;
  let targetRotateY = 0;
  let currentRotateX = 0;
  let currentRotateY = 0;

  function init3DTilt() {
    if (!consoleStage) return;

    window.addEventListener('mousemove', (e) => {
      if (window.innerWidth < 860) return; // 移动端保持平稳
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;

      targetRotateY = dx * 10; // 左右倾斜 ±10度
      targetRotateX = -dy * 10; // 上下倾斜 ±10度

      // 动态高光光斑位置
      if (specularGlare) {
        const px = (e.clientX / window.innerWidth) * 100;
        const py = (e.clientY / window.innerHeight) * 100;
        specularGlare.style.background = `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,0.35) 0%, transparent 60%)`;
      }
    });

    // 手机陀螺仪支持 (Device Orientation)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma !== null && e.beta !== null) {
          targetRotateY = Math.max(-12, Math.min(12, e.gamma * 0.4));
          targetRotateX = Math.max(-12, Math.min(12, (e.beta - 45) * 0.4));
        }
      });
    }

    function renderTiltLoop() {
      currentRotateX += (targetRotateX - currentRotateX) * 0.1;
      currentRotateY += (targetRotateY - currentRotateY) * 0.1;
      consoleStage.style.transform = `rotateX(${currentRotateX.toFixed(2)}deg) rotateY(${currentRotateY.toFixed(2)}deg)`;
      requestAnimationFrame(renderTiltLoop);
    }
    renderTiltLoop();
  }

  // ─────────────────────────────────────────────────────────────
  // 2. 硬件电源开关与经典 DMG 开机动画 (Power Switch & Boot Flow)
  // ─────────────────────────────────────────────────────────────
  function triggerBootSequence() {
    if (state.isBooting) return;
    state.isBooting = true;
    bootOverlay.classList.add('active');
    bootOverlay.classList.remove('animating');

    // 播放经典封神开机音
    if (window.retroAudio) {
      window.retroAudio.boot();
    }

    requestAnimationFrame(() => {
      bootOverlay.classList.add('animating');
    });

    setTimeout(() => {
      bootOverlay.classList.remove('active');
      bootOverlay.classList.remove('animating');
      state.isBooting = false;
      renderCurrentView();
    }, 1400);
  }

  function setPower(isOn, playSound = true) {
    state.isPoweredOn = isOn;
    document.body.classList.toggle('powered-on', isOn);
    if (playSound && window.retroAudio) {
      window.retroAudio.powerSwitch(isOn);
    }
    if (isOn) {
      triggerBootSequence();
    } else {
      if (window.retroAudio) window.retroAudio.stopBgm();
      document.body.classList.remove('bgm-active');
    }
  }

  if (powerSlider) {
    powerSlider.addEventListener('click', () => {
      setPower(!state.isPoweredOn, true);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. 实体卡带典藏架渲染与插拔交互 (Cartridge Vault & Ejection)
  // ─────────────────────────────────────────────────────────────
  function updateInsertedCartridgeUI() {
    const currentCart = CARTRIDGES[state.gameIndex];
    if (insertedCartTitle && currentCart) {
      insertedCartTitle.textContent = `${currentCart.rom} · ${currentCart.code}`;
    }
    // 更新侧边栏高亮
    document.querySelectorAll('.phys-cartridge').forEach((el, idx) => {
      el.classList.toggle('active-inserted', idx === state.gameIndex);
    });
  }

  function renderCartridgeShelf() {
    if (!cartridgeShelf) return;
    cartridgeShelf.innerHTML = CARTRIDGES.map((cart, idx) => `
      <div class="phys-cartridge ${idx === state.gameIndex ? 'active-inserted' : ''}" data-idx="${idx}" title="点击取出并推入掌机卡槽">
        <div class="cart-thumb">
          <img src="${cart.cover}" alt="${cart.title}" onerror="this.src='assets/covers/aq.jpg'">
        </div>
        <div class="cart-meta">
          <div class="cart-rom-tag">${cart.rom} · ${cart.code}</div>
          <div class="cart-name">${cart.title}</div>
          <div class="cart-subtext">${cart.year}</div>
        </div>
      </div>
    `).join('');

    // 绑定点击推入卡槽事件
    cartridgeShelf.querySelectorAll('.phys-cartridge').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        insertCartridge(idx);
      });
    });
  }

  function insertCartridge(idx) {
    if (state.gameIndex === idx && state.currentView === 'GAMES') {
      launchGame(CARTRIDGES[idx]);
      return;
    }

    state.gameIndex = idx;
    if (window.retroAudio) window.retroAudio.cartridge();
    vibrate(25);

    // 卡带卡槽机械下潜跳动动效
    if (insertedCartridge) {
      insertedCartridge.classList.add('ejecting');
      setTimeout(() => {
        updateInsertedCartridgeUI();
        insertedCartridge.classList.remove('ejecting');
      }, 180);
    }

    // 切换至 GAMES 视图
    renderGames();
  }

  // 弹出当前卡带
  const btnEject = document.getElementById('btn-eject-cart');
  if (btnEject) {
    btnEject.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.retroAudio) window.retroAudio.cartridgeEject();
      vibrate(20);
      if (insertedCartridge) {
        insertedCartridge.classList.add('ejecting');
        setTimeout(() => {
          insertedCartridge.classList.remove('ejecting');
        }, 300);
      }
      renderHome();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 4. 外壳皮肤与调色板切换系统 (Shell & Palette Engine)
  // ─────────────────────────────────────────────────────────────
  function setShell(shellName) {
    state.shell = shellName;
    document.body.classList.remove('shell-classic', 'shell-atomic-purple', 'shell-stealth', 'shell-gold', 'shell-teal');
    document.body.classList.add(`shell-${shellName}`);
    try { localStorage.setItem('daozhu_pocket_shell', shellName); } catch (e) {}

    document.querySelectorAll('.capsule-chip[data-shell]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.shell === shellName);
    });

    if (window.retroAudio) window.retroAudio.dialTick();
  }

  function setPalette(paletteName) {
    state.palette = paletteName;
    document.body.classList.remove('palette-dmg', 'palette-pocket', 'palette-light', 'palette-color', 'palette-virtual', 'palette-island');
    document.body.classList.add(`palette-${paletteName}`);
    try { localStorage.setItem('daozhu_pocket_palette', paletteName); } catch (e) {}

    document.querySelectorAll('.palette-chip[data-palette]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.palette === paletteName);
    });

    if (window.retroAudio) window.retroAudio.dialTick();
  }

  // 绑定外壳按钮
  document.querySelectorAll('[data-shell]').forEach(btn => {
    btn.addEventListener('click', () => setShell(btn.dataset.shell));
  });

  // 绑定调色板按钮
  document.querySelectorAll('[data-palette]').forEach(btn => {
    btn.addEventListener('click', () => setPalette(btn.dataset.palette));
  });

  // 恢复保存的外壳与调色板
  try {
    const savedShell = localStorage.getItem('daozhu_pocket_shell');
    if (savedShell) setShell(savedShell);
    const savedPalette = localStorage.getItem('daozhu_pocket_palette');
    if (savedPalette) setPalette(savedPalette);
  } catch (e) {}

  // ─────────────────────────────────────────────────────────────
  // 5. 侧边物理滚轮交互 (CONTRAST & VOLUME Knurled Wheels)
  // ─────────────────────────────────────────────────────────────
  const wheelContrast = document.getElementById('wheel-contrast');
  const wheelVolume = document.getElementById('wheel-volume');

  if (wheelContrast) {
    wheelContrast.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      state.contrast = Math.max(0.6, Math.min(1.5, state.contrast + delta));
      document.documentElement.style.setProperty('--lcd-contrast', state.contrast);
      if (window.retroAudio) window.retroAudio.dialTick();
    });
    wheelContrast.addEventListener('click', () => {
      state.contrast = state.contrast >= 1.4 ? 0.8 : state.contrast + 0.15;
      document.documentElement.style.setProperty('--lcd-contrast', state.contrast);
      if (window.retroAudio) window.retroAudio.dialTick();
    });
  }

  if (wheelVolume) {
    wheelVolume.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      if (window.retroAudio) {
        const v = window.retroAudio.setVolume(window.retroAudio.volume + delta);
        window.retroAudio.dialTick();
        if (soundIcon) soundIcon.textContent = v > 0.05 ? '🔊' : '🔇';
      }
    });
    wheelVolume.addEventListener('click', () => {
      if (window.retroAudio) {
        const muted = window.retroAudio.toggleMute();
        if (soundIcon) soundIcon.textContent = muted ? '🔇' : '🔊';
      }
    });
  }

  // 8-Bit BGM 切换
  if (btnToggleBgm) {
    btnToggleBgm.addEventListener('click', () => {
      if (window.retroAudio) {
        const isPlaying = window.retroAudio.toggleBgm();
        btnToggleBgm.classList.toggle('active', isPlaying);
        document.body.classList.toggle('bgm-active', isPlaying);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 6. 游戏启动与弹窗 (Game Launch Modal)
  // ─────────────────────────────────────────────────────────────
  function closeModal() {
    const modal = document.getElementById('game-launcher-modal');
    if (modal) {
      modal.classList.remove('active');
      const iframe = document.getElementById('modal-game-iframe');
      if (iframe) iframe.src = 'about:blank';
      if (window.retroAudio) window.retroAudio.cancel();
    }
  }

  function launchGame(cart) {
    if (!cart) cart = CARTRIDGES[state.gameIndex];
    if (window.retroAudio) window.retroAudio.cartridge();
    vibrate(30);

    trackPocketEvent('play_game', {
      rom: cart.rom,
      title: cart.title,
      url: cart.url
    });

    const modal = document.getElementById('game-launcher-modal');
    const modalTitle = document.getElementById('modal-game-title');
    const modalRom = document.getElementById('modal-cart-rom');
    const modalIframe = document.getElementById('modal-game-iframe');

    if (modal && modalIframe) {
      if (modalRom) modalRom.textContent = cart.rom;
      if (modalTitle) modalTitle.textContent = cart.title;
      modalIframe.src = cart.url;
      modal.classList.add('active');
    }
  }

  const modalCloseBtn = document.getElementById('modal-close-btn');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

  const modalFullscreenBtn = document.getElementById('modal-fullscreen-btn');
  if (modalFullscreenBtn) {
    modalFullscreenBtn.addEventListener('click', () => {
      const cart = CARTRIDGES[state.gameIndex];
      if (cart && cart.url) window.open(cart.url, '_blank');
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 7. 视图渲染引擎 (View Renderers)
  // ─────────────────────────────────────────────────────────────
  function renderCurrentView() {
    switch (state.currentView) {
      case 'HOME': renderHome(); break;
      case 'GAMES': renderGames(); break;
      case 'ABOUT': renderAbout(); break;
      case 'WORKS': renderWorks(); break;
      case 'MINIGAME': renderMinigame(); break;
      case 'CONTACT': renderContact(); break;
      default: renderHome(); break;
    }
  }

  // 1. HOME 视图
  function renderHome() {
    state.currentView = 'HOME';
    const menuItems = [
      { id: 'games', label: '游戏匣子', code: '01', sub: '7款经典卡带' },
      { id: 'minigame', label: '促织跳跳乐', code: '02', sub: '8-Bit 原生掌机小游戏' },
      { id: 'about', label: '关于岛主', code: '03', sub: '故事驱动器与理念' },
      { id: 'works', label: '代表作品', code: '04', sub: '灵感库/绘本/工具' },
      { id: 'contact', label: '扫码联络', code: '05', sub: '微信/小红书/海岛' }
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

    bottomHint.textContent = '十字键选择 · 按 A 进入 · SELECT 换卡带';
  }

  window.pocketNav = (idx) => {
    state.menuIndex = idx;
    handleInput('A', true);
  };

  // 2. GAMES 视图
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

    updateInsertedCartridgeUI();
    bottomHint.textContent = '左右切卡带 · 按 A 立即开玩 · 按 B 返回';
  }

  window.selectCart = (idx) => {
    insertCartridge(idx);
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

  // 3. ABOUT 视图
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

  // 4. WORKS 视图
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

  // 5. MINIGAME 视图 (促织跳跳乐)
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

  // 6. CONTACT 视图
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
              ✦ 小红书：@岛主 ↗
            </a>
            <div class="c-item">✦ 探讨：AI、故事、游戏化</div>
          </div>
        </div>
      </div>
    `;
    bottomHint.textContent = '扫码添加 · 按 A 直达小红书 · B 返回';
  }

  // ─────────────────────────────────────────────────────────────
  // 8. 掌机按键总分发与触感声学 (Input Dispatcher)
  // ─────────────────────────────────────────────────────────────
  function handleInput(action, isDown = true) {
    if (!state.isPoweredOn && action !== 'POWER') {
      if (isDown && window.retroAudio) window.retroAudio.mechanicalClick(0.06);
      return;
    }

    if (!isDown) {
      if (state.currentView === 'MINIGAME' && state.minigameInstance) {
        state.minigameInstance.handleButtonUp(action);
      }
      return;
    }

    if (window.retroAudio) {
      window.retroAudio.resume();
    }

    // 模态弹窗拦截
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

    // 小游戏拦截
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

    // 全局快捷键
    if (action === 'SELECT') {
      if (window.retroAudio) window.retroAudio.pillButton();
      renderGames();
      return;
    }

    if (action === 'START') {
      if (window.retroAudio) window.retroAudio.pillButton();
      const posterBtn = document.getElementById('btn-export-poster');
      if (posterBtn) posterBtn.click();
      return;
    }

    // HOME 视图
    if (state.currentView === 'HOME') {
      if (action === 'UP') {
        state.menuIndex = (state.menuIndex - 1 + 5) % 5;
        if (window.retroAudio) window.retroAudio.dpad();
        renderHome();
      } else if (action === 'DOWN') {
        state.menuIndex = (state.menuIndex + 1) % 5;
        if (window.retroAudio) window.retroAudio.dpad();
        renderHome();
      } else if (action === 'A') {
        if (window.retroAudio) window.retroAudio.actionA();
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

    // GAMES 视图
    if (state.currentView === 'GAMES') {
      if (action === 'LEFT') {
        const nextIdx = (state.gameIndex - 1 + CARTRIDGES.length) % CARTRIDGES.length;
        if (window.retroAudio) window.retroAudio.dpad();
        insertCartridge(nextIdx);
      } else if (action === 'RIGHT') {
        const nextIdx = (state.gameIndex + 1) % CARTRIDGES.length;
        if (window.retroAudio) window.retroAudio.dpad();
        insertCartridge(nextIdx);
      } else if (action === 'A') {
        if (window.retroAudio) window.retroAudio.actionA();
        launchGame(CARTRIDGES[state.gameIndex]);
      } else if (action === 'B') {
        if (window.retroAudio) window.retroAudio.actionB();
        renderHome();
      }
      return;
    }

    // CONTACT 视图
    if (state.currentView === 'CONTACT') {
      if (action === 'A') {
        if (window.retroAudio) window.retroAudio.actionA();
        trackPocketEvent('click_xiaohongshu', { pos: 'gamepad_a_button' });
        window.open('https://xhslink.cn/o/6qUqpAyzrP3', '_blank');
        return;
      }
      if (action === 'B') {
        if (window.retroAudio) window.retroAudio.actionB();
        renderHome();
        return;
      }
      return;
    }

    // 通用子视图 B 返回
    if (action === 'B') {
      if (window.retroAudio) window.retroAudio.actionB();
      renderHome();
    }
  }

  // 实体按键交互绑定
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

  // ─────────────────────────────────────────────────────────────
  // 9. 物理手柄集成 (Web Gamepad API Integration)
  // ─────────────────────────────────────────────────────────────
  let connectedGamepads = 0;
  let lastGamepadButtonState = {};

  window.addEventListener('gamepadconnected', (e) => {
    connectedGamepads++;
    if (gamepadStatusBadge) gamepadStatusBadge.classList.add('connected');
    if (screenGamepadIcon) screenGamepadIcon.hidden = false;
    if (window.retroAudio) window.retroAudio.confirm();
  });

  window.addEventListener('gamepaddisconnected', (e) => {
    connectedGamepads = Math.max(0, connectedGamepads - 1);
    if (connectedGamepads === 0) {
      if (gamepadStatusBadge) gamepadStatusBadge.classList.remove('connected');
      if (screenGamepadIcon) screenGamepadIcon.hidden = true;
    }
  });

  function pollGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp) continue;

      const checkBtn = (btnIndex, action) => {
        const isPressed = gp.buttons[btnIndex] && gp.buttons[btnIndex].pressed;
        const key = `${gp.index}_${btnIndex}`;
        if (isPressed && !lastGamepadButtonState[key]) {
          handleInput(action, true);
          if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
            gp.vibrationActuator.playEffect('dual-rumble', {
              startDelay: 0,
              duration: 35,
              weakMagnitude: 0.6,
              strongMagnitude: 0.4
            }).catch(() => {});
          }
        } else if (!isPressed && lastGamepadButtonState[key]) {
          handleInput(action, false);
        }
        lastGamepadButtonState[key] = isPressed;
      };

      // 标准手柄按键映射
      checkBtn(12, 'UP');    // Dpad Up
      checkBtn(13, 'DOWN');  // Dpad Down
      checkBtn(14, 'LEFT');  // Dpad Left
      checkBtn(15, 'RIGHT'); // Dpad Right
      checkBtn(0, 'A');      // A / Cross
      checkBtn(1, 'B');      // B / Circle
      checkBtn(8, 'SELECT'); // Select / Share
      checkBtn(9, 'START');  // Start / Options

      // 左摇杆死区轴映射
      const axisX = gp.axes[0];
      const axisY = gp.axes[1];
      const axisKeyX = `${gp.index}_axisX`;
      const axisKeyY = `${gp.index}_axisY`;

      if (axisX < -0.5 && !lastGamepadButtonState[axisKeyX]) {
        handleInput('LEFT', true);
        lastGamepadButtonState[axisKeyX] = 'LEFT';
      } else if (axisX > 0.5 && !lastGamepadButtonState[axisKeyX]) {
        handleInput('RIGHT', true);
        lastGamepadButtonState[axisKeyX] = 'RIGHT';
      } else if (Math.abs(axisX) < 0.2 && lastGamepadButtonState[axisKeyX]) {
        lastGamepadButtonState[axisKeyX] = null;
      }

      if (axisY < -0.5 && !lastGamepadButtonState[axisKeyY]) {
        handleInput('UP', true);
        lastGamepadButtonState[axisKeyY] = 'UP';
      } else if (axisY > 0.5 && !lastGamepadButtonState[axisKeyY]) {
        handleInput('DOWN', true);
        lastGamepadButtonState[axisKeyY] = 'DOWN';
      } else if (Math.abs(axisY) < 0.2 && lastGamepadButtonState[axisKeyY]) {
        lastGamepadButtonState[axisKeyY] = null;
      }
    }
    requestAnimationFrame(pollGamepad);
  }
  pollGamepad();

  // ─────────────────────────────────────────────────────────────
  // 10. 科乐美秘技引擎 (Konami Code Easter Egg)
  // ─────────────────────────────────────────────────────────────
  const KONAMI_CODE = ['UP', 'UP', 'DOWN', 'DOWN', 'LEFT', 'RIGHT', 'LEFT', 'RIGHT', 'B', 'A'];
  let konamiProgress = 0;

  function checkKonamiCode(action) {
    if (action === KONAMI_CODE[konamiProgress]) {
      konamiProgress++;
      if (konamiProgress === KONAMI_CODE.length) {
        triggerKonamiReward();
        konamiProgress = 0;
      }
    } else {
      konamiProgress = action === KONAMI_CODE[0] ? 1 : 0;
    }
  }

  function triggerKonamiReward() {
    if (window.retroAudio) {
      window.retroAudio.secretUnlock();
    }
    vibrate([50, 50, 100, 50, 150]);
    // 切换至 24K 黄金限量版机身与金色调色板
    setShell('gold');
    setPalette('island');

    bottomHint.textContent = '★ 24K 黄金限量版掌机已解锁！★';
    setTimeout(() => {
      renderCurrentView();
    }, 2500);
  }

  // 键盘全局按键监听
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    let action = null;
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        action = 'UP'; break;
      case 'ArrowDown':
      case 'KeyS':
        action = 'DOWN'; break;
      case 'ArrowLeft':
      case 'KeyA':
        action = 'LEFT'; break;
      case 'ArrowRight':
      case 'KeyD':
        action = 'RIGHT'; break;
      case 'KeyJ':
      case 'Space':
      case 'Enter':
        action = 'A'; break;
      case 'KeyK':
      case 'Escape':
      case 'Backspace':
        action = 'B'; break;
      case 'ShiftLeft':
      case 'ShiftRight':
        action = 'SELECT'; break;
      case 'KeyM':
        if (btnToggleBgm) btnToggleBgm.click();
        return;
    }

    if (action) {
      e.preventDefault();
      checkKonamiCode(action);
      handleInput(action, true);
    }
  });

  window.addEventListener('keyup', (e) => {
    let action = null;
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': action = 'UP'; break;
      case 'ArrowDown': case 'KeyS': action = 'DOWN'; break;
      case 'ArrowLeft': case 'KeyA': action = 'LEFT'; break;
      case 'ArrowRight': case 'KeyD': action = 'RIGHT'; break;
      case 'KeyJ': case 'Space': case 'Enter': action = 'A'; break;
      case 'KeyK': case 'Escape': case 'Backspace': action = 'B'; break;
    }
    if (action) handleInput(action, false);
  });

  // 音效图标点击切换静音
  if (soundIcon) {
    soundIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.retroAudio) {
        const muted = window.retroAudio.toggleMute();
        soundIcon.textContent = muted ? '🔇' : '🔊';
      }
    });
  }

  // 移动端卡带抽屉开关
  const btnMobileShelf = document.getElementById('btn-mobile-shelf');
  if (btnMobileShelf) {
    btnMobileShelf.addEventListener('click', () => {
      renderGames();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 11. 初始化系统启动
  // ─────────────────────────────────────────────────────────────
  init3DTilt();
  renderCartridgeShelf();
  updateInsertedCartridgeUI();
  renderHome();
});
