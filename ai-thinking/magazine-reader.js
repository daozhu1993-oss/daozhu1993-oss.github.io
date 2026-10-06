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
