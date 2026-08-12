/* 《拾遗》创作案卷 · 渲染函数（读者展示页与作家工坊共用）
 * 用法： renderShiyiCasefile(targetEl, data)
 */
window.renderShiyiCasefile = function (el, data) {
  if (!el || !data) return;
  var esc = function (s) {
    return (s == null ? '' : String(s)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var mono = function (c) {
    var n = c && c.name ? c.name.trim() : '';
    return n ? n[0] : '?';
  };
  var html = '<div class="cf-panel">';
  html += '<div class="cf-stamp">创作案卷<small>DOSSIER · ' + esc(data.meta.title) + '</small></div>';
  html += '<div class="cf-meta">' + esc(data.meta.status) + ' ｜ ' + esc(data.meta.wordcount) + ' ｜ 基调 ' + esc(data.meta.tone) + '</div>';
  html += '<div class="cf-one">' + esc(data.meta.one_line) + '</div>';

  // 人物小传
  html += '<div class="cf-h">人物小传</div><div class="cf-chars">';
  (data.characters || []).forEach(function (c) {
    html += '<div class="cf-card">';
    html += '<div class="cf-avatar">' + esc(mono(c)) + '</div>';
    html += '<div class="cf-name">' + esc(c.name) + '</div>';
    html += '<div class="cf-role">' + esc(c.role) + '</div>';
    html += '<div class="cf-tags">' + (c.tags || []).map(function (t) { return '<span class="cf-tag">' + esc(t) + '</span>'; }).join('') + '</div>';
    html += '<div class="cf-bio">' + esc(c.bio) + '</div>';
    if (c.status) html += '<div class="cf-status">状态 · ' + esc(c.status) + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // 人物线索
  html += '<div class="cf-h">人物线索</div><div class="cf-wall">';
  (data.relationships || []).forEach(function (r) {
    html += '<div class="cf-clue"><div class="rel"><b>' + esc(r.from) + '</b> → <b>' +
      esc(r.to) + '</b><span class="type">' + esc(r.type) + '</span></div><div class="note">' + esc(r.note) + '</div></div>';
  });
  html += '</div>';

  // 剧情走向
  html += '<div class="cf-h">剧情走向</div><div class="cf-time">';
  (data.timeline || []).forEach(function (t) {
    html += '<div class="cf-beat"><div class="cf-phase">' + esc(t.phase) + '</div><div class="cf-sum">' +
      esc(t.summary) + '</div>' + (t.beat ? '<div class="cf-hook">◦ ' + esc(t.beat) + '</div>' : '') + '</div>';
  });
  html += '</div>';

  // 主题
  if (data.themes && data.themes.length) {
    html += '<div class="cf-h">主题</div><div class="cf-themes">' +
      data.themes.map(function (t) { return '<span class="cf-theme">' + esc(t) + '</span>'; }).join('') + '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
};
