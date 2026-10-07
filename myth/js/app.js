/* ==========================================================================
   MYTH MAGAZINE - FULL-BLEED IMMERSIVE MAGAZINE ENGINE
   画面排满整屏 · 全画幅沉浸体验 · 每篇配备专属神话艺术大插画
   ========================================================================== */

(function () {
  'use strict';

  // --- STATE DEFINITION ---
  const state = {
    articles: window.MYTH_ARTICLES || [],
    currentTheme: localStorage.getItem('myth_theme') || 'light',
    currentHeroIdx: 0,
    selectedCategory: 'all',
    searchQuery: '',
    bookmarks: JSON.parse(localStorage.getItem('myth_bookmarks') || '[]'),
    readProgress: JSON.parse(localStorage.getItem('myth_progress') || '{}'),
    soundEnabled: localStorage.getItem('myth_sound') !== 'false',
    
    // Reader State
    readerActive: false,
    currentArticle: null,
    currentPageIdx: 0,
    fontSizeLevel: parseInt(localStorage.getItem('myth_font_size') || '18', 10),
    tocOpen: false
  };

  // --- DOM CACHE ---
  const DOM = {
    html: document.documentElement,
    mastheadThemeBtn: document.getElementById('masthead-theme-btn'),
    mastheadBookshelfBtn: document.getElementById('masthead-bookshelf-btn'),
    bookshelfCountBadge: document.getElementById('bookshelf-count-badge'),
    bookshelfModal: document.getElementById('bookshelf-modal'),
    bookshelfCloseBtn: document.getElementById('bookshelf-close-btn'),
    bookshelfBookmarksGrid: document.getElementById('bookshelf-bookmarks-grid'),
    bookshelfRecentGrid: document.getElementById('bookshelf-recent-grid'),
    
    // Hero Slider
    heroPrevBtn: document.getElementById('hero-prev-btn'),
    heroNextBtn: document.getElementById('hero-next-btn'),
    heroIssueBadge: document.getElementById('hero-issue-badge'),
    heroTitle: document.getElementById('hero-title'),
    heroSubtitle: document.getElementById('hero-subtitle'),
    heroAuthorName: document.getElementById('hero-author-name'),
    heroOriginTag: document.getElementById('hero-origin-tag'),
    heroWordCount: document.getElementById('hero-word-count'),
    heroReadTime: document.getElementById('hero-read-time'),
    heroReadBtn: document.getElementById('hero-read-btn'),
    heroBgArt: document.getElementById('hero-bg-art'),
    heroCoverCard: document.getElementById('hero-cover-card'),
    heroCoverImg: document.getElementById('hero-cover-img'),
    heroCoverCaption: document.getElementById('hero-cover-caption'),

    // Magnetic Cursor
    cursorDot: document.getElementById('cursor-dot'),
    cursorRing: document.getElementById('cursor-ring'),
    cursorText: document.getElementById('cursor-text'),
    
    // Grid & Filter
    categoryTabs: document.getElementById('category-tabs'),
    searchInput: document.getElementById('search-input'),
    issuesGrid: document.getElementById('issues-grid'),
    
    // Full-Bleed Reader Shell
    readerContainer: document.getElementById('reader-container'),
    readerProgressBar: document.getElementById('reader-progress-bar'),
    readerCloseBtn: document.getElementById('reader-close-btn'),
    readerPageSlide: document.getElementById('reader-page-slide'),
    readerEdgePrev: document.getElementById('reader-edge-prev'),
    readerEdgeNext: document.getElementById('reader-edge-next'),
    
    // Floating Pills Controls
    btnFontDec: document.getElementById('btn-font-dec'),
    btnFontInc: document.getElementById('btn-font-inc'),
    btnReaderTheme: document.getElementById('btn-reader-theme'),
    btnTocToggle: document.getElementById('btn-toc-toggle'),
    btnPagePrev: document.getElementById('btn-page-prev'),
    btnSpreadInfo: document.getElementById('btn-spread-info'),
    btnPageNext: document.getElementById('btn-page-next'),
    btnReaderShare: document.getElementById('btn-reader-share'),
    btnReaderBookmark: document.getElementById('btn-reader-bookmark'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),
    btnFullscreenToggle: document.getElementById('btn-fullscreen-toggle'),
    
    // TOC Drawer
    readerTocDrawer: document.getElementById('reader-toc-drawer'),
    tocOverlay: document.getElementById('toc-overlay'),
    tocCloseBtn: document.getElementById('toc-close-btn'),
    tocItemsList: document.getElementById('toc-items-list')
  };

  // --- WEB AUDIO REALISTIC PAPER-TURN SOUND ---
  function playPageTurnSound() {
    if (!state.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const bufferSize = Math.floor(ctx.sampleRate * 0.16); // 160ms soft rustle
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.16);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch (e) {}
  }

  // --- AWWWARDS MAGNETIC CURSOR ENGINE ---
  function initMagneticCursor() {
    if (!DOM.cursorDot || !DOM.cursorRing) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      DOM.cursorDot.style.left = `${mouseX}px`;
      DOM.cursorDot.style.top = `${mouseY}px`;
      DOM.cursorDot.style.opacity = '1';
      DOM.cursorRing.style.opacity = '1';
    }, { passive: true });

    function renderCursor() {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.22;
      DOM.cursorRing.style.left = `${ringX}px`;
      DOM.cursorRing.style.top = `${ringY}px`;
      requestAnimationFrame(renderCursor);
    }
    requestAnimationFrame(renderCursor);

    // Contextual hover states
    document.addEventListener('mouseover', (e) => {
      const target = e.target;
      if (target.closest('.hero-cover-card') || target.closest('.issue-card') || target.closest('.magazine-full-cover')) {
        DOM.cursorRing.classList.add('hover-read');
        DOM.cursorRing.classList.remove('hover-action');
        DOM.cursorText.textContent = '翻阅';
      } else if (target.closest('button') || target.closest('a') || target.closest('.tab-btn') || target.closest('.pill-btn')) {
        DOM.cursorRing.classList.add('hover-action');
        DOM.cursorRing.classList.remove('hover-read');
        DOM.cursorText.textContent = '';
      } else {
        DOM.cursorRing.classList.remove('hover-action', 'hover-read');
        DOM.cursorText.textContent = '';
      }
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      DOM.cursorDot.style.opacity = '0';
      DOM.cursorRing.style.opacity = '0';
    });
  }

  // --- INITIALIZATION ---
  function init() {
    applyTheme(state.currentTheme);
    updateBookshelfBadge();
    updateSoundBtn();
    renderHero(state.currentHeroIdx);
    renderGrid();
    setupEventListeners();
    setupKeyboardNavigation();
    initMagneticCursor();
    handleHashRouting();
  }

  // --- THEME MANAGEMENT ---
  function applyTheme(theme) {
    state.currentTheme = theme;
    localStorage.setItem('myth_theme', theme);
    if (theme === 'night') {
      DOM.html.setAttribute('data-aifa-night', 'on');
      updateThemeIcons(true);
    } else {
      DOM.html.removeAttribute('data-aifa-night');
      updateThemeIcons(false);
    }
  }

  function toggleTheme() {
    applyTheme(state.currentTheme === 'light' ? 'night' : 'light');
  }

  function updateThemeIcons(isNight) {
    const sunIcon = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="3.1"></circle><path d="M8 1v1.7M8 13.3V15M1 8h1.7M13.3 8H15M3.05 3.05l1.2 1.2M11.75 11.75l1.2 1.2M3.05 12.95l1.2-1.2M11.75 4.25l1.2-1.2" stroke-linecap="round"></path></svg>`;
    const moonIcon = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M13.5 9.5a5.5 5.5 0 1 1-7-7 6.5 6.5 0 0 0 7 7z"></path></svg>`;
    if (DOM.mastheadThemeBtn) DOM.mastheadThemeBtn.innerHTML = isNight ? sunIcon : moonIcon;
    if (DOM.btnReaderTheme) DOM.btnReaderTheme.innerHTML = isNight ? sunIcon : moonIcon;
  }

  function updateSoundBtn() {
    if (DOM.btnSoundToggle) {
      DOM.btnSoundToggle.textContent = state.soundEnabled ? '🔊' : '🔇';
      DOM.btnSoundToggle.title = state.soundEnabled ? '真实翻页声音效 (开启)' : '真实翻页声音效 (已静音)';
    }
  }

  // --- BOOKMARKS & PROGRESS ---
  function isBookmarked(articleId) {
    return state.bookmarks.includes(articleId);
  }

  function toggleBookmark(articleId) {
    if (isBookmarked(articleId)) {
      state.bookmarks = state.bookmarks.filter(id => id !== articleId);
    } else {
      state.bookmarks.push(articleId);
    }
    localStorage.setItem('myth_bookmarks', JSON.stringify(state.bookmarks));
    updateBookshelfBadge();
    renderGrid();
    if (state.readerActive && state.currentArticle && state.currentArticle.id === articleId) {
      updateReaderBookmarkBtn();
    }
    if (DOM.bookshelfModal.classList.contains('open')) {
      renderBookshelf();
    }
  }

  function updateBookshelfBadge() {
    if (DOM.bookshelfCountBadge) {
      DOM.bookshelfCountBadge.textContent = state.bookmarks.length;
    }
  }

  function saveProgress(articleId, pageIdx) {
    state.readProgress[articleId] = {
      pageIdx: pageIdx,
      updatedAt: Date.now()
    };
    localStorage.setItem('myth_progress', JSON.stringify(state.readProgress));
  }

  // --- HERO SLIDER ---
  function renderHero(index) {
    if (!state.articles.length) return;
    state.currentHeroIdx = (index + state.articles.length) % state.articles.length;
    const item = state.articles[state.currentHeroIdx];

    const prevIdx = (state.currentHeroIdx - 1 + state.articles.length) % state.articles.length;
    const nextIdx = (state.currentHeroIdx + 1) % state.articles.length;
    const prevItem = state.articles[prevIdx];
    const nextItem = state.articles[nextIdx];

    DOM.heroPrevBtn.innerHTML = `<span>←</span> <span>${prevItem.issueNumber}</span>`;
    DOM.heroNextBtn.innerHTML = `<span>${nextItem.issueNumber}</span> <span>→</span>`;

    DOM.heroIssueBadge.textContent = `${item.issueNumber} · ${item.category}`;
    DOM.heroTitle.textContent = item.cleanTitle;
    DOM.heroSubtitle.textContent = item.subtitle;
    DOM.heroAuthorName.innerHTML = `${item.author} <span class="verified-mark">✓</span>`;
    DOM.heroOriginTag.textContent = item.originalMyth;
    DOM.heroWordCount.textContent = `${item.wordCount.toLocaleString()} 字`;
    DOM.heroReadTime.textContent = `${item.readMinutes} 分钟读完`;

    if (DOM.heroCoverImg) {
      DOM.heroCoverImg.src = item.coverImg;
      DOM.heroCoverImg.alt = item.cleanTitle;
    }
    if (DOM.heroBgArt) {
      DOM.heroBgArt.style.backgroundImage = `url('${item.coverImg}')`;
    }
    if (DOM.heroCoverCaption) {
      DOM.heroCoverCaption.textContent = `${item.category} · 特刊`;
    }

    DOM.heroReadBtn.onclick = () => openReader(item.id);
    DOM.heroTitle.onclick = () => openReader(item.id);
    if (DOM.heroCoverCard) {
      DOM.heroCoverCard.onclick = () => openReader(item.id);
    }
  }

  // --- GRID ARCHIVE WITH COVER ARTWORKS ---
  function renderGrid() {
    if (!DOM.issuesGrid) return;
    
    let filtered = state.articles;
    if (state.selectedCategory !== 'all') {
      filtered = filtered.filter(a => a.category.includes(state.selectedCategory) || a.category === state.selectedCategory);
    }
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a => 
        a.cleanTitle.toLowerCase().includes(q) ||
        a.subtitle.toLowerCase().includes(q) ||
        a.originalMyth.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      DOM.issuesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 0; color: var(--quiet);">
          <p style="font-family: var(--serif); font-size: 18px; margin-bottom: 8px;">未找到匹配的神话篇目</p>
          <p style="font-size: 13px;">请尝试更换检索关键词或分类</p>
        </div>
      `;
      return;
    }

    DOM.issuesGrid.innerHTML = filtered.map(item => {
      const saved = isBookmarked(item.id);
      return `
        <article class="issue-card" onclick="window.MythApp.openReader('${item.id}')">
          <img class="issue-card-cover-thumb" src="${item.coverImg}" alt="${item.cleanTitle}" loading="lazy" />
          <div class="issue-card-content">
            <div>
              <div class="issue-card-header">
                <span class="issue-number-badge">${item.issueNumber}</span>
                <span class="issue-category-tag">${item.category}</span>
              </div>
              <h3 class="issue-card-title">${item.cleanTitle}</h3>
              <div class="issue-card-origin">${item.originalMyth}</div>
              <p class="issue-card-summary">${item.subtitle}</p>
            </div>
            <div class="issue-card-footer" onclick="event.stopPropagation()">
              <span>${item.readMinutes} 分钟 · ${item.wordCount.toLocaleString()} 字</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <button class="card-bookmark-btn ${saved ? 'saved' : ''}" 
                        title="${saved ? '移出书架' : '收藏到书架'}" 
                        onclick="window.MythApp.toggleBookmark('${item.id}')">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
                <button class="card-action-btn" onclick="window.MythApp.openReader('${item.id}')">
                  翻开 <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // --- BOOKSHELF MODAL ---
  function openBookshelf() {
    renderBookshelf();
    DOM.bookshelfModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeBookshelf() {
    DOM.bookshelfModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderBookshelf() {
    const bookmarkedArticles = state.articles.filter(a => state.bookmarks.includes(a.id));
    
    if (bookmarkedArticles.length === 0) {
      DOM.bookshelfBookmarksGrid.innerHTML = `
        <div class="bookshelf-empty" style="grid-column: 1 / -1;">
          <p>暂无典藏期刊</p>
          <p style="font-size: 13px; margin-top: 8px; color: var(--quiet);">在浏览或阅读时点击书签徽标，喜欢的篇目将珍藏于此。</p>
        </div>
      `;
    } else {
      DOM.bookshelfBookmarksGrid.innerHTML = bookmarkedArticles.map(item => `
        <article class="issue-card" onclick="window.MythApp.openReader('${item.id}')">
          <img class="issue-card-cover-thumb" src="${item.coverImg}" alt="${item.cleanTitle}" loading="lazy" />
          <div class="issue-card-content">
            <div class="issue-card-header">
              <span class="issue-number-badge">${item.issueNumber}</span>
              <span class="issue-category-tag">${item.category}</span>
            </div>
            <h3 class="issue-card-title">${item.cleanTitle}</h3>
            <div class="issue-card-origin">${item.originalMyth}</div>
            <p class="issue-card-summary">${item.subtitle}</p>
            <div class="issue-card-footer" onclick="event.stopPropagation()">
              <span>${item.wordCount.toLocaleString()} 字</span>
              <button class="card-bookmark-btn saved" onclick="window.MythApp.toggleBookmark('${item.id}')" title="移出书架">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            </div>
          </div>
        </article>
      `).join('');
    }

    const progressEntries = Object.entries(state.readProgress)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, 6);

    if (progressEntries.length === 0) {
      DOM.bookshelfRecentGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 20px 0; color: var(--quiet); font-size: 14px;">
          暂无近期阅读记录，翻开任意一卷即可自动存取阅读足迹。
        </div>
      `;
    } else {
      DOM.bookshelfRecentGrid.innerHTML = progressEntries.map(([id, info]) => {
        const item = state.articles.find(a => a.id === id);
        if (!item) return '';
        const pageNum = (info.pageIdx || 0) + 1;
        const total = item.totalPages;
        const pct = Math.round((pageNum / total) * 100);
        return `
          <div class="issue-card" style="padding: 16px 20px;" onclick="window.MythApp.openReader('${item.id}', ${info.pageIdx})">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
              <span class="issue-number-badge">${item.issueNumber}</span>
              <span style="font-family: var(--mono); font-size: 11px; color: var(--gold-ink);">${pct}% 进度 (P.${pageNum}/${total})</span>
            </div>
            <h4 style="font-family: var(--serif); font-size: 16px; margin-bottom: 8px;">${item.cleanTitle}</h4>
            <div style="height: 3px; background: var(--line); border-radius: 2px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: var(--gold);"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // --- FULL-BLEED MAGAZINE READER ENGINE ---
  function openReader(articleId, pageIdx = null) {
    const article = state.articles.find(a => a.id === articleId);
    if (!article) return;

    state.currentArticle = article;
    state.readerActive = true;
    
    // Resume progress only if pageIdx was not explicitly requested
    if (pageIdx === null || pageIdx === undefined) {
      if (state.readProgress[articleId]) {
        state.currentPageIdx = state.readProgress[articleId].pageIdx || 0;
      } else {
        state.currentPageIdx = 0;
      }
    } else {
      state.currentPageIdx = Math.max(0, Math.min(article.totalPages - 1, pageIdx));
    }

    applyFontSize();
    updateReaderBookmarkBtn();
    renderPage(state.currentPageIdx, 0);
    renderTOC();

    DOM.readerContainer.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Update location hash
    history.pushState(null, '', `#reader=${article.id}&page=${state.currentPageIdx + 1}`);
  }

  function closeReader() {
    if (!state.readerActive) return;
    state.readerActive = false;
    DOM.readerContainer.classList.remove('active');
    closeToc();
    document.body.style.overflow = '';
    history.pushState(null, '', window.location.pathname);
  }

  function renderPage(pageIdx, direction = 0) {
    const article = state.currentArticle;
    if (!article) return;

    const page = article.pages[pageIdx];
    if (!page) return;

    saveProgress(article.id, pageIdx);

    if (DOM.readerProgressBar) {
      DOM.readerProgressBar.style.width = `${((pageIdx + 1) / article.totalPages) * 100}%`;
    }

    DOM.btnSpreadInfo.textContent = `${pageIdx + 1} / ${article.totalPages}`;
    DOM.btnPagePrev.disabled = (pageIdx === 0);
    DOM.btnPageNext.disabled = (pageIdx === article.totalPages - 1);
    if (DOM.readerEdgePrev) DOM.readerEdgePrev.disabled = (pageIdx === 0);
    if (DOM.readerEdgeNext) DOM.readerEdgeNext.disabled = (pageIdx === article.totalPages - 1);

    let html = '';

    if (page.type === 'cover') {
      DOM.readerContainer.setAttribute('data-theme-page', 'dark');
      html = `
        <div class="magazine-full-cover">
          <img class="cover-bg-image" src="${page.coverImg}" alt="${page.title}" loading="eager" />
          <div class="cover-masthead-row">
            <div class="cover-brand-tag">
              <span class="cover-brand-seal">神</span>
              <span>神话 · MYTHOS</span>
            </div>
            <div class="cover-issue-badge">${page.issueNumber}</div>
          </div>

          <div class="cover-hero-stack">
            <div class="cover-category-pill">
              <span>✦</span> <span>${page.category} · 特刊</span>
            </div>
            <h1 class="cover-headline">${page.title}</h1>
            <p class="cover-deck">${page.subtitle}</p>

            <div class="cover-byline-row">
              <span class="cover-byline-author">${page.author} · 著</span>
              <span>原典考据：${page.originalMyth}</span>
              <span>${page.readMinutes} 分钟 · ${page.wordCount.toLocaleString()} 字</span>
            </div>

            <div class="cover-read-cta-wrap">
              <button class="cover-read-cta-btn" onclick="window.MythApp.turnPage(1)">
                <span>翻开期刊 · 阅览原典与题记</span>
                <span class="cta-arrow">→</span>
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (page.type === 'inscription') {
      DOM.readerContainer.setAttribute('data-theme-page', 'light');
      let authorNoteHTML = '';
      if (page.authorNote) {
        authorNoteHTML = `
          <div class="inscription-manifesto-box">
            <div class="inscription-manifesto-title">【作者手记 · 创作阐述】</div>
            ${page.authorNote.split('\n\n').map(p => `<p style="margin-bottom: 8px;">${p}</p>`).join('')}
          </div>
        `;
      }

      html = `
        <div class="magazine-inscription-page">
          <div class="inscription-card-inner">
            <div class="inscription-seal-large">典</div>
            <div class="inscription-source-tag">${page.originalMyth}</div>
            <div class="inscription-giant-quote">
              ${page.quote}
            </div>
            <div class="inscription-colophon-note">
              —— 中华神话重构系列 ·《${page.title}》题记
            </div>
            ${authorNoteHTML}
            <div style="margin-top: 32px;">
              <button class="inscription-start-btn" onclick="window.MythApp.turnPage(1)">
                <span>翻入正文 · 开始阅读第一幕</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (page.type === 'content' || page.type === 'chapter') {
      DOM.readerContainer.setAttribute('data-theme-page', 'light');
      
      let artBannerHTML = '';
      if (page.inlineImg) {
        artBannerHTML = `
          <div class="editorial-art-frame">
            <img class="editorial-art-img" src="${page.inlineImg}" alt="${page.title}" />
            <div class="editorial-art-caption">${page.imgCaption || '神话场景原画'}</div>
          </div>
        `;
      }

      let chapterBadgeHTML = '';
      if (page.chapterTitle) {
        chapterBadgeHTML = `
          <div class="chapter-lead-badge">
            <span class="chapter-kicker">${page.chapterTitle}</span>
          </div>
        `;
      }

      let pullQuoteHTML = '';
      if (page.pullQuote) {
        pullQuoteHTML = `
          <div class="magazine-pull-quote">
            <span class="pull-quote-mark">“</span>
            <p class="pull-quote-text">${page.pullQuote}</p>
          </div>
        `;
      }

      const parasHTML = page.paragraphs.map((p, idx) => {
        const isLead = (idx === 0 && !page.inlineImg && !p.startsWith('“') && !p.startsWith('"'));
        return `<p class="editorial-para ${isLead ? 'chapter-lead-para' : ''}">${p}</p>`;
      }).join('');

      let navGuideHTML = '';
      if (page.nextChapterTitle) {
        navGuideHTML = `
          <div class="chapter-nav-guide" onclick="window.MythApp.turnPage(1)" title="点击翻阅下一幕">
            <div>
              <div class="nav-guide-sub">本幕读毕 · 继续阅读</div>
              <div class="nav-guide-title">${page.nextChapterTitle}</div>
            </div>
            <div class="nav-guide-arrow">→</div>
          </div>
        `;
      } else {
        navGuideHTML = `
          <div class="chapter-nav-guide" onclick="window.MythApp.turnPage(1)" title="点击查看卷终刊记">
            <div>
              <div class="nav-guide-sub">全卷正文读毕</div>
              <div class="nav-guide-title">翻至卷终 · 刊记与下期预告</div>
            </div>
            <div class="nav-guide-arrow">→</div>
          </div>
        `;
      }

      html = `
        <div class="magazine-editorial-page">
          <div class="editorial-inner-wrap">
            <div class="editorial-header-bar">
              <span>《${page.title}》 ${page.chapterTitle ? '· ' + page.chapterTitle : ''}</span>
              <span>${page.category}</span>
              <span>${page.issueNumber}</span>
            </div>

            <div class="editorial-reading-flow">
              ${chapterBadgeHTML}
              ${artBannerHTML}
              ${pullQuoteHTML}

              <div class="editorial-body-prose">
                ${parasHTML}
              </div>

              ${navGuideHTML}
            </div>
          </div>

          <div class="editorial-footer-bar">
            <span>第 ${page.pageNumber} 页 · 共 ${article.totalPages} 页</span>
            <span>中华神话重构系列 · GX 著</span>
          </div>
        </div>
      `;
    } else if (page.type === 'colophon') {
      DOM.readerContainer.setAttribute('data-theme-page', 'light');
      const nextIdx = (state.articles.findIndex(a => a.id === article.id) + 1) % state.articles.length;
      const nextArt = state.articles[nextIdx];

      html = `
        <div class="magazine-colophon-page">
          <div class="colophon-card">
            <div class="colophon-seal">完</div>
            <h2 class="colophon-title">《${page.title}》· 卷终</h2>
            <div class="colophon-meta-list">
              <div><strong>期号：</strong>${page.issueNumber}</div>
              <div><strong>篇目分类：</strong>${page.category}</div>
              <div><strong>全文字数：</strong>${page.wordCount.toLocaleString()} 字</div>
              <div><strong>文风定调：</strong>大白话打底，短句断得狠；叙述者冷、克制、却有体温。</div>
            </div>
            <button class="colophon-next-issue-btn" onclick="window.MythApp.openReader('${nextArt.id}');">
              翻开下一期：${nextArt.cleanTitle} (${nextArt.issueNumber}) <span>→</span>
            </button>
          </div>
        </div>
      `;
    }

    DOM.readerPageSlide.innerHTML = html;
    DOM.readerPageSlide.scrollTop = 0;

    // Apply animation classes
    DOM.readerPageSlide.classList.remove('slide-in-right', 'slide-in-left');
    if (direction === 1) {
      DOM.readerPageSlide.classList.add('slide-in-right');
    } else if (direction === -1) {
      DOM.readerPageSlide.classList.add('slide-in-left');
    }
  }

  function turnPage(direction) {
    if (!state.currentArticle) return;
    const targetIdx = state.currentPageIdx + direction;
    if (targetIdx < 0 || targetIdx >= state.currentArticle.totalPages) return;

    playPageTurnSound();
    state.currentPageIdx = targetIdx;
    renderPage(state.currentPageIdx, direction);
    history.replaceState(null, '', `#reader=${state.currentArticle.id}&page=${state.currentPageIdx + 1}`);
  }

  function applyFontSize() {
    DOM.readerContainer.style.setProperty('--reader-font-size', `${state.fontSizeLevel}px`);
    localStorage.setItem('myth_font_size', state.fontSizeLevel);
  }

  function adjustFontSize(delta) {
    state.fontSizeLevel = Math.max(15, Math.min(26, state.fontSizeLevel + delta));
    applyFontSize();
  }

  function updateReaderBookmarkBtn() {
    if (!state.currentArticle) return;
    const saved = isBookmarked(state.currentArticle.id);
    DOM.btnReaderBookmark.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    DOM.btnReaderBookmark.style.color = saved ? 'var(--gold)' : 'inherit';
  }

  // --- TOC DRAWER ---
  function toggleToc() {
    if (state.tocOpen) closeToc();
    else openToc();
  }

  function openToc() {
    state.tocOpen = true;
    DOM.readerTocDrawer.classList.add('open');
    DOM.tocOverlay.classList.add('open');
  }

  function closeToc() {
    state.tocOpen = false;
    DOM.readerTocDrawer.classList.remove('open');
    DOM.tocOverlay.classList.remove('open');
  }

  function renderTOC() {
    if (!state.currentArticle) return;
    const pages = state.currentArticle.pages;

    DOM.tocItemsList.innerHTML = pages.map((p, idx) => {
      let label = `第 ${idx + 1} 页`;
      if (p.type === 'cover') label = `封面 · ${p.title}`;
      else if (p.type === 'inscription') label = `题记 · 原典出处`;
      else if (p.type === 'colophon') label = `卷终 · 刊记与下期预告`;
      else if (p.chapterTitle) label = `${p.chapterTitle} ${p.inlineImg ? '🖼️' : ''}`;
      else if (p.inlineImg) label = `插画特写 (P.${idx + 1})`;

      const active = (idx === state.currentPageIdx);
      return `
        <li class="toc-item ${active ? 'active' : ''}" onclick="window.MythApp.jumpToPage(${idx})">
          <span>${label}</span>
          <span class="toc-item-page">P.${idx + 1}</span>
        </li>
      `;
    }).join('');
  }

  function jumpToPage(idx) {
    const dir = idx > state.currentPageIdx ? 1 : -1;
    state.currentPageIdx = idx;
    closeToc();
    renderPage(state.currentPageIdx, dir);
    history.replaceState(null, '', `#reader=${state.currentArticle.id}&page=${state.currentPageIdx + 1}`);
  }

  // --- KEYBOARD SHORTCUTS ---
  function setupKeyboardNavigation() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (state.readerActive) {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
          e.preventDefault();
          turnPage(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          turnPage(-1);
        } else if (e.key === 'Escape') {
          if (state.tocOpen) closeToc();
          else closeReader();
        } else if (e.key.toLowerCase() === 't') {
          toggleToc();
        } else if (e.key.toLowerCase() === 'd') {
          toggleTheme();
        }
      } else {
        if (e.key === 'ArrowLeft') {
          renderHero(state.currentHeroIdx - 1);
        } else if (e.key === 'ArrowRight') {
          renderHero(state.currentHeroIdx + 1);
        } else if (e.key === 'Escape' && DOM.bookshelfModal.classList.contains('open')) {
          closeBookshelf();
        }
      }
    });
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Theme toggle
    DOM.mastheadThemeBtn.onclick = toggleTheme;
    DOM.btnReaderTheme.onclick = toggleTheme;

    // Bookshelf
    DOM.mastheadBookshelfBtn.onclick = openBookshelf;
    DOM.bookshelfCloseBtn.onclick = closeBookshelf;

    // Hero navigation
    DOM.heroPrevBtn.onclick = () => renderHero(state.currentHeroIdx - 1);
    DOM.heroNextBtn.onclick = () => renderHero(state.currentHeroIdx + 1);

    // Filter tabs
    if (DOM.categoryTabs) {
      DOM.categoryTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        DOM.categoryTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedCategory = btn.dataset.category;
        renderGrid();
      });
    }

    // Live search
    if (DOM.searchInput) {
      DOM.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderGrid();
      });
    }

    // Click on empty margin gutters to turn page (点击左右外侧空白留白区翻页)
    DOM.readerPageSlide.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.reader-floating-bar') ||
          e.target.closest('.chapter-nav-guide') || e.target.closest('.editorial-inner-wrap') ||
          e.target.closest('.inscription-card-inner') || e.target.closest('.colophon-card') ||
          e.target.closest('.cover-hero-stack')) {
        return;
      }
      if (window.getSelection() && window.getSelection().toString().length > 0) return;
      const x = e.clientX;
      const w = window.innerWidth;
      if (x > w * 0.85) {
        turnPage(1);
      } else if (x < w * 0.15) {
        turnPage(-1);
      }
    });

    // Touch swipe gesture support
    let touchStartX = 0;
    DOM.readerPageSlide.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    DOM.readerPageSlide.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchEndX - touchStartX;
      if (Math.abs(diff) > 50) {
        if (diff < 0) turnPage(1); // Swipe left -> next page
        else turnPage(-1);        // Swipe right -> prev page
      }
    }, { passive: true });

    // Reader controls
    DOM.readerCloseBtn.onclick = closeReader;
    DOM.btnPagePrev.onclick = () => turnPage(-1);
    DOM.btnPageNext.onclick = () => turnPage(1);
    if (DOM.readerEdgePrev) DOM.readerEdgePrev.onclick = () => turnPage(-1);
    if (DOM.readerEdgeNext) DOM.readerEdgeNext.onclick = () => turnPage(1);
    DOM.btnFontDec.onclick = () => adjustFontSize(-1);
    DOM.btnFontInc.onclick = () => adjustFontSize(1);
    DOM.btnTocToggle.onclick = toggleToc;
    DOM.tocCloseBtn.onclick = closeToc;
    DOM.tocOverlay.onclick = closeToc;
    DOM.btnReaderBookmark.onclick = () => {
      if (state.currentArticle) toggleBookmark(state.currentArticle.id);
    };

    // Sound toggle
    DOM.btnSoundToggle.onclick = () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem('myth_sound', state.soundEnabled);
      updateSoundBtn();
    };

    // Share URL
    DOM.btnReaderShare.onclick = () => {
      navigator.clipboard.writeText(window.location.href);
      const originalText = DOM.btnReaderShare.innerHTML;
      DOM.btnReaderShare.innerHTML = `✓`;
      setTimeout(() => DOM.btnReaderShare.innerHTML = originalText, 1500);
    };

    // Fullscreen toggle
    DOM.btnFullscreenToggle.onclick = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };

    // Popstate (Back / Forward button)
    window.addEventListener('popstate', handleHashRouting);
  }

  function handleHashRouting() {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    let issueId = urlParams.get('reader');
    let pageStr = urlParams.get('page');

    if (!issueId && hash.startsWith('#reader=')) {
      const hashParams = new URLSearchParams(hash.substring(1));
      issueId = hashParams.get('reader');
      pageStr = hashParams.get('page');
    }

    if (issueId) {
      const page = parseInt(pageStr || '1', 10) - 1;
      openReader(issueId, Math.max(0, page));
      if (hash.includes('scroll=bottom') || urlParams.get('scroll') === 'bottom') {
        setTimeout(() => {
          if (DOM.readerPageSlide) DOM.readerPageSlide.scrollTop = DOM.readerPageSlide.scrollHeight;
        }, 150);
      }
    } else if (hash === '#bookshelf' || urlParams.get('view') === 'bookshelf') {
      openBookshelf();
    } else {
      if (state.readerActive) closeReader();
      if (DOM.bookshelfModal && DOM.bookshelfModal.classList.contains('open')) closeBookshelf();
    }
  }

  // --- EXPOSE GLOBAL API ---
  window.MythApp = {
    openReader,
    closeReader,
    turnPage,
    jumpToPage,
    toggleBookmark,
    toggleTheme,
    openBookshelf,
    closeBookshelf
  };

  // Launch app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
