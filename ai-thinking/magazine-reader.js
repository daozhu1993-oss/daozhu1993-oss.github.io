(function() {
  // 1. Theme sync
  function initTheme() {
    const currentAttr = document.documentElement.getAttribute('data-theme');
    const saved = localStorage.getItem('daozhu_theme') || currentAttr || 'light';
    document.documentElement.setAttribute('data-theme', saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('daozhu_theme', next); } catch(_) {}
  }

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // 2. Font size adjustment
  let currentFs = parseFloat(localStorage.getItem('daozhu_reader_fs')) || 17.5;
  function updateFs(delta) {
    currentFs = Math.max(14, Math.min(24, currentFs + delta));
    document.documentElement.style.setProperty('--body-fs', currentFs + 'px');
    try { localStorage.setItem('daozhu_reader_fs', currentFs); } catch(_) {}
  }

  const smallerBtn = document.getElementById('fontSmallerBtn');
  const largerBtn = document.getElementById('fontLargerBtn');
  if (smallerBtn) smallerBtn.addEventListener('click', () => updateFs(-1));
  if (largerBtn) largerBtn.addEventListener('click', () => updateFs(1));

  if (currentFs !== 17.5) {
    document.documentElement.style.setProperty('--body-fs', currentFs + 'px');
  }

  // 3. Scroll progress & title display
  const progressBar = document.getElementById('readerProgressBar');
  const navTitle = document.getElementById('navArticleTitle');
  const h1 = document.querySelector('article h1');
  const paragraphs = [...document.querySelectorAll('article p')].filter(p => p.textContent.trim());
  const key = 'daozhu-journal-position:' + location.pathname;
  paragraphs.forEach((p, i) => { if (!p.id) p.id = 'p-' + (i + 1); });
  function visiblePassage() {
    return paragraphs.find(p => p.getBoundingClientRect().bottom > 95) || paragraphs[paragraphs.length - 1];
  }
  const actions = document.querySelector('.nav-actions');
  if (actions && paragraphs.length) {
    const menu = document.createElement('details');
    menu.className = 'journal-tools';
    const title = document.createElement('summary');
    title.textContent = '阅读工具';
    const panel = document.createElement('div');
    const saved = document.createElement('a');
    let bookmark;
    try { bookmark = localStorage.getItem(key); } catch (_) {}
    if (bookmark && paragraphs.some(p => p.id === bookmark)) {
      saved.href = '#' + bookmark;
      saved.textContent = '回到上次读的段落';
      saved.onclick = () => { menu.open = false; };
      panel.appendChild(saved);
    }
    const source = document.createElement('textarea');
    source.readOnly = true;
    source.hidden = true;
    source.setAttribute('aria-label', '可复制的段落和出处');
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '引用当前段落';
    copy.onclick = async () => {
      const p = visiblePassage(), url = new URL(location.href);
      url.hash = p.id;
      const quote = p.textContent.trim() + '\n—— 岛主《' + (h1?.textContent.trim() || document.title) + '》\n' + url;
      try { await navigator.clipboard.writeText(quote); status.textContent = '段落与出处已复制'; }
      catch (_) { source.value = quote; source.hidden = false; source.focus(); source.select(); status.textContent = '可选中复制下方引用'; }
    };
    const bookmarkButton = document.createElement('button');
    const returnLink = document.createElement('a');
    const favoriteKey = key + ':bookmark';
    bookmarkButton.type = 'button';
    bookmarkButton.textContent = '收藏当前段落';
    returnLink.textContent = '打开收藏的段落';
    function showBookmark(id) {
      returnLink.hidden = !paragraphs.some(p => p.id === id);
      if (!returnLink.hidden) returnLink.href = '#' + id;
    }
    try { showBookmark(localStorage.getItem(favoriteKey)); } catch (_) { returnLink.hidden = true; }
    returnLink.onclick = () => { menu.open = false; };
    bookmarkButton.onclick = () => {
      const id = visiblePassage().id;
      try { localStorage.setItem(favoriteKey, id); showBookmark(id); status.textContent = '已在此设备收藏'; }
      catch (_) { status.textContent = '浏览器暂时无法保存，可复制段落链接'; }
    };
    panel.append(copy, bookmarkButton, returnLink, source, status);
    panel.append(...actions.children);
    menu.append(title, panel);
    actions.appendChild(menu);
    window.addEventListener('pagehide', () => {
      try { localStorage.setItem(key, visiblePassage().id); } catch (_) {}
    });
    const target = paragraphs.find(p => '#' + p.id === location.hash);
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  }

  window.addEventListener('scroll', () => {
    const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if (progressBar && height > 0) {
      const scrolled = (winScroll / height) * 100;
      progressBar.style.width = scrolled + '%';
    }

    if (navTitle && h1) {
      const rect = h1.getBoundingClientRect();
      if (rect.bottom < 64) {
        navTitle.classList.add('is-visible');
      } else {
        navTitle.classList.remove('is-visible');
      }
    }
  }, { passive: true });

  initTheme();
})();
