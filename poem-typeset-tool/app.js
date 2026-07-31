/* ===== 诗笺 · 诗歌排版工具 逻辑 ===== */
'use strict';

/* 融合风格目录：诗歌 7 风 + 小红书通用卡片 12 风 */
const STYLES = [
  // —— 诗歌专属 ——
  { id: 'brush',      name: '手写诗展', group: '诗歌专属', layout: 'vertical', sw: '#a8312a' },
  { id: 'classical',  name: '古籍竖排', group: '诗歌专属', layout: 'vertical', sw: '#9a5b3a' },
  { id: 'card',       name: '极简诗卡', group: '诗歌专属', layout: 'card',    sw: '#c08a3e' },
  { id: 'journal',    name: '手账拼贴', group: '诗歌专属', layout: 'collage', sw: '#e08aa0' },
  { id: 'magazine',   name: '杂志编辑', group: '诗歌专属', layout: 'card',    sw: '#b08a3e' },
  { id: 'scroll',     name: '长卷目录', group: '诗歌专属', layout: 'scroll',  sw: '#b08a3e' },
  { id: 'imagetext',  name: '图文编辑', group: '诗歌专属', layout: 'poster',  sw: '#c2632f' },
  // —— 通用卡片（小红书风）——
  { id: 'warm',       name: '暖色',     group: '通用卡片', layout: 'card', sw: '#d98a3d' },
  { id: 'fresh',      name: '清新',     group: '通用卡片', layout: 'card', sw: '#3fae8e' },
  { id: 'macaron',    name: '马卡龙',   group: '通用卡片', layout: 'card', sw: '#e87aa6' },
  { id: 'retro',      name: '复古',     group: '通用卡片', layout: 'card', sw: '#9c5a2c' },
  { id: 'minimal',    name: '极简',     group: '通用卡片', layout: 'card', sw: '#888888' },
  { id: 'bold',       name: '粗体',     group: '通用卡片', layout: 'card', sw: '#e23b2e' },
  { id: 'cute',       name: '可爱',     group: '通用卡片', layout: 'card', sw: '#ff8fb3' },
  { id: 'chalkboard', name: '黑板',     group: '通用卡片', layout: 'card', sw: '#ffd76a' },
  { id: 'notion',     name: 'Notion',   group: '通用卡片', layout: 'card', sw: '#2f80ed' },
  { id: 'sketch',     name: '速写笔记', group: '通用卡片', layout: 'card', sw: '#d98a3d' },
  { id: 'study',      name: '学习笔记', group: '通用卡片', layout: 'card', sw: '#244a8c' },
  { id: 'screenprint',name: '丝网印',   group: '通用卡片', layout: 'poster', sw: '#d8332a' },
];

const $ = (id) => document.getElementById(id);
const card = $('card');

let currentStyle = 'magazine';

/* 渲染风格选择 */
function renderStyleChips() {
  const groups = {};
  STYLES.forEach(s => { (groups[s.group] ||= []).push(s); });
  const wrap = $('styleGroups');
  wrap.innerHTML = '';
  Object.entries(groups).forEach(([g, list]) => {
    const gt = document.createElement('div');
    gt.className = 'style-group-title';
    gt.textContent = g;
    const grid = document.createElement('div');
    grid.className = 'style-grid';
    list.forEach(s => {
      const chip = document.createElement('div');
      chip.className = 'style-chip' + (s.id === currentStyle ? ' active' : '');
      chip.dataset.id = s.id;
      chip.innerHTML = `<span class="sw" style="background:${s.sw}"></span>${s.name}`;
      chip.onclick = () => { currentStyle = s.id; updateActiveChips(); render(); };
      grid.appendChild(chip);
    });
    wrap.appendChild(gt);
    wrap.appendChild(grid);
  });
}
function updateActiveChips() {
  document.querySelectorAll('.style-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.id === currentStyle);
  });
}

/* 按长度自动推荐风格 */
function suggestStyle(bodyText) {
  const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
  const n = lines.length;
  if (n <= 8) return 'brush';
  if (n >= 25) return 'scroll';
  // 9–24 行：含古典词 → 古籍竖排，否则杂志
  const classical = /(古风|乐府|绝句|律诗|词牌|词|赋|辞|游园|禅|咏|怀古|拟古|古意|诗经|楚辞|唐诗|宋词)/;
  if (classical.test(bodyText)) return 'classical';
  return 'magazine';
}

/* 解析标题：优先输入；否则取正文首行 */
function resolveTitle() {
  const t = $('inTitle').value.trim();
  if (t) return t;
  const first = $('inBody').value.split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
  return first.replace(/^\d{1,3}[、.．\s]*/, '');
}

/* 生成卡片 */
function render() {
  const style = STYLES.find(s => s.id === currentStyle);
  const title = resolveTitle();
  const sign = $('inSign').value.trim();
  const date = $('inDate').value.trim();
  const body = $('inBody').value;
  const fs = $('inFs').value;
  const showMeta = $('inShowMeta').checked;
  const showTag = $('inShowTag').checked;
  const mark = $('inMark').value.trim();

  // 分段：空行分隔
  const stanzas = body.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

  card.className = `pc l-${style.layout} s-${style.id}`;
  card.style.setProperty('--fs', fs + 'px');

  let html = '<div class="pc-deco"></div><div class="pc-inner">';
  if (showTag) html += '<div class="pc-tag">岛主的诗歌</div>';
  if (title) html += `<h1 class="pc-title">${esc(title)}</h1>`;

  html += '<div class="pc-body">';
  stanzas.forEach(st => {
    const lines = st.split('\n').map(l => esc(l.trim())).filter(Boolean).join('<br>');
    html += `<p class="stanza">${lines}</p>`;
  });
  html += '</div>';

  if (showMeta && (sign || date)) {
    html += '<div class="pc-meta">';
    if (sign) html += `<span class="pc-sign">${esc(sign)}</span>`;
    if (date) html += `<span class="pc-date">${esc(date)}</span>`;
    html += '</div>';
  }
  html += '</div>';

  // 印章（手写 / 古籍）
  if (currentStyle === 'brush' || currentStyle === 'classical') {
    html += '<div class="pc-seal">島主</div>';
  }
  if (mark) html += `<div class="pc-watermark">${esc(mark)}</div>`;

  card.innerHTML = html;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 事件绑定 */
['inTitle', 'inSign', 'inDate', 'inBody', 'inFs', 'inShowMeta', 'inShowTag', 'inMark']
  .forEach(id => $(id).addEventListener('input', render));

$('inFs').addEventListener('input', () => { $('fsVal').textContent = $('inFs').value; });

$('btnRandom').addEventListener('click', () => {
  const pool = STYLES.filter(s => s.id !== currentStyle);
  currentStyle = pool[Math.floor(Math.random() * pool.length)].id;
  updateActiveChips();
  render();
});

$('btnExport').addEventListener('click', async () => {
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  const btn = $('btnExport');
  btn.textContent = '生成中…';
  try {
    const canvas = await html2canvas(card, {
      scale: 2,
      backgroundColor: null,
      useCORS: true,
      logging: false,
    });
    const a = document.createElement('a');
    const safe = (resolveTitle() || 'poem').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    a.download = `诗笺_${safe}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  } catch (e) {
    alert('导出失败：' + e.message);
  } finally {
    btn.textContent = '⬇ 导出 PNG';
  }
});

/* 初始化：自动建议一次 */
(function init() {
  renderStyleChips();
  const sug = suggestStyle($('inBody').value);
  if (sug && STYLES.some(s => s.id === sug)) {
    currentStyle = sug;
    $('hintSuggest').textContent = `（按长度推荐：${STYLES.find(s => s.id === sug).name}）`;
  }
  updateActiveChips();
  render();
})();
