/*!
 * 岛主个站 · 分享组件（单文件、零依赖）
 * 注入到思维模型 / AI 思考 / 绘本 / 芽芽兽等单篇内容页，提供：
 *   1) 复制链接  2) 下载 HTML（离线可读单文件）  3) 导出长图（PNG，适合朋友圈/社群）
 * 用法：在 </body> 前加 <script src="../assets/share/share-widget.js"></script>
 */
(function () {
  'use strict';

  // 防止重复注入
  if (document.getElementById('share-fab')) return;

  /* ---------- 内联样式 ---------- */
  var css =
    '#share-fab{position:fixed;right:20px;bottom:22px;z-index:9998;display:inline-flex;align-items:center;gap:8px;' +
    'padding:11px 18px;border:none;border-radius:999px;cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;' +
    'color:#fff;background:linear-gradient(135deg,#b0492e,#8e3520);box-shadow:0 8px 22px rgba(120,40,20,.38);' +
    'transition:transform .2s ease,box-shadow .2s ease;}' +
    '#share-fab:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(120,40,20,.46);}' +
    '#share-fab svg{width:18px;height:18px;stroke:#fff;fill:none;stroke-width:1.9;}' +
    '#share-fab .lbl{letter-spacing:.06em;}' +
    '.share-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;' +
    'background:rgba(34,26,18,.5);}' +
    '.share-modal.open{display:flex;}' +
    '.share-sheet{width:min(360px,90vw);background:#fbf7ee;border:1px solid #e3d8c2;border-radius:18px;' +
    'padding:22px 20px 16px;box-shadow:0 24px 60px rgba(0,0,0,.3);font-family:inherit;color:#2c2620;}' +
    '.share-sheet h3{font-size:16px;font-weight:700;margin:0 0 4px;font-family:"Noto Serif SC",serif;}' +
    '.share-sheet .sub{font-size:12.5px;color:#8a8074;margin-bottom:16px;}' +
    '.share-opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1px solid #e3d8c2;' +
    'background:#fff;border-radius:12px;padding:13px 14px;margin-bottom:10px;cursor:pointer;font-family:inherit;' +
    'font-size:14.5px;color:#2c2620;transition:border-color .15s,background .15s;}' +
    '.share-opt:hover{border-color:#b0492e;background:#fdf3ec;}' +
    '.share-opt .ic{width:34px;height:34px;flex:0 0 auto;border-radius:9px;display:flex;align-items:center;justify-content:center;' +
    'background:#f3e3d6;color:#8e3520;}' +
    '.share-opt .ic svg{width:18px;height:18px;stroke:#8e3520;fill:none;stroke-width:1.8;}' +
    '.share-opt b{display:block;font-weight:600;}' +
    '.share-opt small{display:block;color:#8a8074;font-size:12px;margin-top:2px;}' +
    '.share-close{margin-top:2px;width:100%;border:none;background:transparent;color:#8a8074;font-size:13px;' +
    'padding:8px;cursor:pointer;font-family:inherit;}' +
    '.share-toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:10000;background:#2c2620;color:#fbf7ee;' +
    'padding:10px 18px;border-radius:999px;font-size:13.5px;opacity:0;transition:opacity .25s;pointer-events:none;font-family:inherit;}' +
    '.share-toast.show{opacity:1;}' +
    '@media(max-width:560px){#share-fab{bottom:16px;right:14px;padding:10px 15px;font-size:14px;}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- 浮动按钮 ---------- */
  var fab = document.createElement('button');
  fab.id = 'share-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', '分享');
  fab.innerHTML =
    '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
    '<line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>' +
    '<span class="lbl">分享</span>';
  document.body.appendChild(fab);

  /* ---------- 分享面板 ---------- */
  var modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.innerHTML =
    '<div class="share-sheet" role="dialog" aria-modal="true">' +
    '  <h3>分享这一篇</h3>' +
    '  <div class="sub">三种方式，挑你顺手的</div>' +
    '  <button class="share-opt" data-act="link"><span class="ic">' + iconLink() + '</span><span><b>复制链接</b><small>把当前页网址复制到剪贴板</small></span></button>' +
    '  <button class="share-opt" data-act="html"><span class="ic">' + iconHtml() + '</span><span><b>下载 HTML</b><small>导出单文件网页，可离线打开 / 转发</small></span></button>' +
    '  <button class="share-opt" data-act="img"><span class="ic">' + iconImg() + '</span><span><b>导出长图</b><small>生成整页 PNG 长图，适合发朋友圈 / 社群</small></span></button>' +
    '  <button class="share-close" data-act="close">取消</button>' +
    '</div>';
  document.body.appendChild(modal);

  /* ---------- 轻提示 ---------- */
  var toast = document.createElement('div');
  toast.className = 'share-toast';
  document.body.appendChild(toast);
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
  }

  function iconLink() {
    return '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';
  }
  function iconHtml() {
    return '<svg viewBox="0 0 24 24"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M8 13h8M8 17h6"/></svg>';
  }
  function iconImg() {
    return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  }

  /* ---------- 内容提取 ---------- */
  function getTitle() {
    var el = document.querySelector('.hero h1') || document.querySelector('article h1') ||
      document.querySelector('main h1') || document.querySelector('h1');
    return ((el && el.textContent) ? el.textContent : (document.title || '分享')).trim().replace(/\s+/g, ' ').slice(0, 60);
  }
  function getSub() {
    var el = document.querySelector('.hero .subtitle') || document.querySelector('.hero .kicker');
    if (el) return el.textContent.trim();
    var mb = document.querySelector('.meta-bar');
    if (mb) return mb.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
    return '';
  }
  function safeName(t) {
    return (t || 'share').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  }
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 1. 复制链接 ---------- */
  function copyLink() {
    var url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { showToast('链接已复制 ✓'); }, function () { fallbackCopy(url); });
    } else {
      fallbackCopy(url);
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('链接已复制 ✓'); }
    catch (e) { showToast('复制失败，请手动复制地址栏'); }
    document.body.removeChild(ta);
  }

  /* ---------- 2. 下载 HTML ---------- */
  function downloadHTML() {
    showToast('正在打包 HTML…');
    var clone = document.documentElement.cloneNode(true);
    var fabN = clone.querySelector('#share-fab'); if (fabN) fabN.remove();
    var modalN = clone.querySelector('.share-modal'); if (modalN) modalN.remove();
    var toastN = clone.querySelector('.share-toast'); if (toastN) toastN.remove();
    var ss = clone.querySelector('script[src*="share-widget.js"]'); if (ss) ss.remove();
    clone.querySelectorAll('style').forEach(function (s) {
      if (s.textContent.indexOf('#share-fab') > -1) s.remove();
    });
    var html = '<!DOCTYPE html>\n' + clone.outerHTML;
    inlineDesignCss(html).then(function (finalHtml) {
      var blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
      triggerDownload(blob, safeName(getTitle()) + '.html');
      showToast('HTML 已下载 ✓');
    });
  }
  function inlineDesignCss(html) {
    return new Promise(function (resolve) {
      var m = html.match(/url\('?(\.\.\/design-system\/[^')]+)'?\)/);
      if (!m) { resolve(html); return; }
      var href = m[1];
      fetch(href).then(function (r) { return r.text(); }).then(function (cssText) {
        var tag = '<style data-inlined-css>/* inlined ' + href + ' */\n' + cssText + '</style>';
        html = html
          .replace(/@import url\('?\.\.\/design-system\/[^')]+'?\);/g, '')
          .replace(/<link[^>]*design-system\/[^>]*>/gi, '')
          .replace('</head>', tag + '\n</head>');
        resolve(html);
      }).catch(function () { resolve(html); });
    });
  }
  function triggerDownload(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* ---------- 3. 导出长图 ---------- */
  var h2cLoading = false;
  function exportImage() {
    if (h2cLoading) return;
    // 正文容器优先级：main > .book(绘本) > article > .content > body
    var root = document.querySelector('main') ||
               document.querySelector('.book') ||
               document.querySelector('article') ||
               document.querySelector('.content') ||
               document.body;
    if (!root) { showToast('未找到正文，无法导出'); return; }
    showToast('正在生成长图…');
    loadH2C().then(function (h2c) {
      // 翻页式绘本：临时展开所有页面，整本导出；同时量出真实高度以自适应清晰度
      var pages = root.querySelectorAll ? root.querySelectorAll('.page') : [];
      var saved = [];
      pages.forEach(function (p) { saved.push(p.style.display); p.style.display = 'block'; });
      var est = root.scrollHeight || root.offsetHeight || (pages.length * 900) || 4000;
      var clone = root.cloneNode(true);
      pages.forEach(function (p, i) { p.style.display = saved[i] || ''; }); // 还原原始翻页状态

      clone.querySelectorAll('.site-header,.article-nav,.related-models,footer,.footer,nav,.nav-dots,.book-nav,.page-nav,.toolbar').forEach(function (n) { n.remove(); });
      clone.style.maxWidth = '100%';
      clone.style.margin = '0';
      clone.style.padding = '0';

      // 内容过高（如整本绘本）时降为 1 倍，规避浏览器画布尺寸上限
      var scale = est > 12000 ? 1 : 2;

      var wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;padding:0;background:#fbf7ee;';

      var isBook = !!document.querySelector('.book');
      var brand = isBook ? '给一一的成长绘本' : '岛主 · 思享';
      var head = document.createElement('div');
      var sub = getSub();
      head.style.cssText = 'padding:52px 52px 6px;background:#fbf7ee;font-family:"Noto Serif SC",serif;color:#2c2620;';
      head.innerHTML =
        '<div style="font-size:13px;letter-spacing:.18em;color:#9a6a32;margin-bottom:12px;">' + escapeHtml(brand) + '</div>' +
        '<div style="font-size:30px;font-weight:700;line-height:1.3;">' + escapeHtml(getTitle()) + '</div>' +
        (sub ? '<div style="font-size:15px;color:#8a8074;margin-top:10px;">' + escapeHtml(sub) + '</div>' : '');

      var body = document.createElement('div');
      body.style.cssText = 'padding:20px 52px 40px;background:#fbf7ee;';
      body.appendChild(clone);

      var credit = document.createElement('div');
      credit.style.cssText = 'padding:0 52px 44px;background:#fbf7ee;font-size:12px;color:#a89e90;text-align:center;font-family:"Noto Serif SC",serif;';
      credit.textContent = isBook ? '岛主 · 给一一的成长绘本' : '岛主 · daozhu1993-oss.github.io';

      wrapper.appendChild(head);
      wrapper.appendChild(body);
      wrapper.appendChild(credit);
      document.body.appendChild(wrapper);

      h2cLoading = true;
      h2c(wrapper, { backgroundColor: '#fbf7ee', scale: scale, useCORS: true, logging: false }).then(function (canvas) {
        document.body.removeChild(wrapper);
        h2cLoading = false;
        canvas.toBlob(function (blob) {
          triggerDownload(blob, safeName(getTitle()) + '-长图.png');
          showToast('长图已生成 ✓');
        }, 'image/png');
      }).catch(function (err) {
        if (wrapper.parentNode) document.body.removeChild(wrapper);
        h2cLoading = false;
        showToast('长图生成失败：' + (err && err.message ? err.message : '未知错误'));
      });
    }).catch(function () {
      showToast('长图组件加载失败，请检查网络');
    });
  }
  function loadH2C() {
    return new Promise(function (resolve, reject) {
      if (window.html2canvas) { resolve(window.html2canvas); return; }
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () { reject(); };
      document.head.appendChild(s);
    });
  }

  /* ---------- 事件 ---------- */
  fab.addEventListener('click', function () { modal.classList.add('open'); });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) { modal.classList.remove('open'); return; }
    var btn = e.target.closest('.share-opt, .share-close');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (act === 'link') { copyLink(); modal.classList.remove('open'); }
    else if (act === 'html') { downloadHTML(); modal.classList.remove('open'); }
    else if (act === 'img') { exportImage(); modal.classList.remove('open'); }
    else if (act === 'close') { modal.classList.remove('open'); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') modal.classList.remove('open');
  });
})();
