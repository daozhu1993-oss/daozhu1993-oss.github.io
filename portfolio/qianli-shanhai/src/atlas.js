/**
 * 《千里江山 · 借笔还魂》长卷全景展卷引擎 (Scroll Atlas Mode)
 * 对标 https://xianxie6.github.io/qingming-riverside/ 全景展卷架构
 * 
 * 功能特性：
 * 1. 采用北宋王希孟《千里江山图》十二米真迹无缝超宽全景长卷
 * 2. 6 大胜景寻踪热点（01 桃溪浅滩 · 02 飞瀑幽涧 · 03 麦陇晚烟 · 04 关隘长桥 · 05 孤刹悬云 · 06 水心高阁）
 * 3. 悬浮点景赏析卡片与【走入胜境 ↗】
 * 4. 头部【提笔穿越 ↗】仪式入口
 * 5. 惯性拖拽、平移、滚轮缩放与键盘巡览
 */

import { BEASTS } from './beasts.js';

export const ATLAS_PLACES = [
  {
    id: 'lushu',
    index: 1,
    name: '桃溪浅滩',
    beast: '鹿蜀',
    subtitle: '卷一 · 桃溪清流 · 鹿蜀和音',
    description: '烟霭初醒，浅滩苇草间有灵兽其状如马而白首，其音如谣，为千里江山奏响第一声生生不息之序曲。',
    u: 0.147,
    worldCoord: { x: -45, y: 1.5, z: 28 },
    box: [2600, 180, 1500, 650]
  },
  {
    id: 'fuzhu',
    index: 2,
    name: '飞瀑幽涧',
    beast: '夫诸',
    subtitle: '卷二 · 雄峰叠翠 · 夫诸水魄',
    description: '双叠百丈飞瀑激荡深潭，四角灵鹿踏波汲水，洗涤尘寰气脉，令九百年江河元气奔涌不绝。',
    u: 0.334,
    worldCoord: { x: -18, y: 3.2, z: -35 },
    box: [6800, 120, 1500, 700]
  },
  {
    id: 'dangkang',
    index: 3,
    name: '麦陇晚烟',
    beast: '当康',
    subtitle: '卷三 · 麦陇晚烟 · 当康穰岁',
    description: '竹篱掩映层叠梯田与草舍，青麦随晚烟荡漾，地灵当康伏于陇亩，祈愿天下大穰、岁稔年丰。',
    u: 0.494,
    worldCoord: { x: 12, y: 2.1, z: 42 },
    box: [10400, 200, 1400, 650]
  },
  {
    id: 'bo',
    index: 4,
    name: '关隘长桥',
    beast: '驳',
    subtitle: '卷四 · 关隘长桥 · 驳兽辟兵',
    description: '飞渡两座危峰之千步编木长拱桥，苍松虬枝间玄兽镇守天堑，以鼓音辟兵止戈，撑起不折之山河脊骨。',
    u: 0.587,
    worldCoord: { x: 38, y: 8.5, z: -15 },
    box: [12500, 140, 1600, 700]
  },
  {
    id: 'qingniao',
    index: 5,
    name: '孤刹悬云',
    beast: '青鸟',
    subtitle: '卷五 · 凌云高插 · 青鸟飞信',
    description: '直插云霄之险绝孤峰与悬空古寺，瑶池青鸟穿云翱翔，携十八岁少年最轻盈辽阔之遐想去往长空。',
    u: 0.738,
    worldCoord: { x: 62, y: 16.0, z: 10 },
    box: [15900, 80, 1500, 750]
  },
  {
    id: 'baize',
    index: 6,
    name: '水心高阁',
    beast: '白泽',
    subtitle: '卷六 · 万壑归海 · 白泽灵明',
    description: '烟波浩渺万壑归海之百尺水榭，通晓万物灵性之圣兽镇守画卷终极，天地在此借笔还魂、终成大圆满。',
    u: 0.898,
    worldCoord: { x: 88, y: 4.8, z: -8 },
    box: [19400, 180, 1600, 680]
  }
];

export class AtlasManager {
  constructor(options = {}) {
    this.onEnterCrossing = options.onEnterCrossing || (() => {});
    this.onEnterScene = options.onEnterScene || (() => {});
    this.onPlaceSelect = options.onPlaceSelect || (() => {});

    this.container = document.getElementById('atlas');
    this.frame = document.getElementById('atlasFrame');
    this.content = document.getElementById('atlasContent') || this.frame;
    this.image = document.getElementById('atlasImage');
    this.placesNav = document.getElementById('atlasPlaces');
    this.hintMessage = document.getElementById('atlasMessage');

    this.isDragging = false;
    this.startX = 0;
    this.scrollLeft = 0;
    this.selectedPlace = null;

    this._buildPlaces();
    this._bindEvents();

    // 默认预选第一个胜景 (卷一 · 桃溪浅滩)
    setTimeout(() => {
      if (ATLAS_PLACES && ATLAS_PLACES[0]) {
        this.selectPlace(ATLAS_PLACES[0]);
      }
    }, 150);
  }

  _buildPlaces() {
    if (!this.placesNav || !this.frame) return;

    // 清空重构
    this.placesNav.innerHTML = '';
    
    // 移除原有标记
    const existingMarkers = this.content.querySelectorAll('.atlas-scene-marker, .atlas-hotspot');
    existingMarkers.forEach(el => el.remove());

    // 动态生成 6 个胜景标签与画中热点
    ATLAS_PLACES.forEach((p, idx) => {
      // 1. 底部导航药丸按钮
      const btn = document.createElement('button');
      btn.className = 'atlas-place-pill';
      btn.dataset.placeId = p.id;
      btn.setAttribute('aria-label', `浏览 ${p.name} · ${p.beast}`);
      btn.innerHTML = `<small>0${idx + 1}</small><span>${p.name} · ${p.beast}</span>`;
      btn.addEventListener('click', () => {
        this.selectPlace(p);
      });
      this.placesNav.appendChild(btn);

      // 2. 长卷画中悬浮互动标记
      const marker = document.createElement('button');
      marker.className = 'atlas-scene-marker';
      marker.dataset.placeId = p.id;
      marker.style.left = `${(p.u * 100).toFixed(2)}%`;
      marker.setAttribute('aria-label', `${p.name}，点击入画`);
      marker.innerHTML = `
        <span class="marker-seal">${p.beast[0]}</span>
        <span class="marker-name">${p.name}</span>
        <i class="marker-arrow" aria-hidden="true">↗</i>
      `;

      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showPlaceCard(p);
      });

      this.content.appendChild(marker);
    });

    // 3. 构建长卷悬浮赏析卡片 (Atlas Card)
    let card = document.getElementById('atlasCard');
    if (!card) {
      card = document.createElement('article');
      card.id = 'atlasCard';
      card.className = 'atlas-card';
      card.hidden = true;
      card.innerHTML = `
        <div class="atlas-card-close" id="atlasCardClose" title="收起">✕</div>
        <span class="atlas-kicker" id="atlasCardKicker">千里江山 · 胜景寻踪</span>
        <h2 class="atlas-card-title" id="atlasCardTitle">桃溪浅滩</h2>
        <span class="atlas-card-beast" id="atlasCardBeast">鹿蜀和音</span>
        <p class="atlas-card-desc" id="atlasCardDesc"></p>
        <div class="atlas-card-actions">
          <button class="atlas-card-enter-btn" id="atlasCardEnter">
            <span>走入胜境</span> <i aria-hidden="true">↗</i>
          </button>
        </div>
      `;
      this.container.appendChild(card);

      card.querySelector('#atlasCardClose').addEventListener('click', () => {
        this.hidePlaceCard();
      });

      card.querySelector('#atlasCardEnter').addEventListener('click', () => {
        if (this.selectedPlace) {
          this.onEnterScene(this.selectedPlace);
        }
      });
    }
  }

  _bindEvents() {
    // 头部【提笔穿越 ↗】主入口
    const crossingBtn = document.getElementById('crossingEntry');
    if (crossingBtn) {
      crossingBtn.addEventListener('click', () => {
        this.onEnterCrossing();
      });
    }

    // 长卷鼠标与触控平移滚动
    if (this.frame) {
      // 鼠标拖拽
      this.frame.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, #atlasCard')) return;
        this.isDragging = true;
        this.startX = e.pageX - this.frame.offsetLeft;
        this.scrollLeft = this.frame.scrollLeft;
        this.frame.style.cursor = 'grabbing';
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
        if (this.frame) this.frame.style.cursor = 'grab';
      });

      this.frame.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        e.preventDefault();
        const x = e.pageX - this.frame.offsetLeft;
        const walk = (x - this.startX) * 1.6;
        this.frame.scrollLeft = this.scrollLeft - walk;
      });

      // 滚轮横向滚动
      this.frame.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          this.frame.scrollLeft += e.deltaY * 1.2;
        }
      }, { passive: false });
    }

    // 键盘左右箭头巡览
    window.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('in-atlas')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (this.frame) this.frame.scrollLeft += 220;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (this.frame) this.frame.scrollLeft -= 220;
      }
    });
  }

  selectPlace(place) {
    this.selectedPlace = place;
    this.onPlaceSelect(place);

    // 平滑滚动至该景点
    const doScroll = () => {
      if (this.frame && this.image) {
        const imgWidth = this.image.scrollWidth || this.image.clientWidth || 8000;
        const targetScroll = (imgWidth * place.u) - (this.frame.clientWidth / 2);
        this.frame.scrollTo({
          left: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      }
    };

    if (this.image && !this.image.complete) {
      this.image.addEventListener('load', doScroll, { once: true });
    } else {
      doScroll();
    }

    // 高亮药丸
    const pills = this.placesNav.querySelectorAll('.atlas-place-pill');
    pills.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.placeId === place.id);
    });

    this.showPlaceCard(place);
  }

  showPlaceCard(place) {
    this.selectedPlace = place;
    const card = document.getElementById('atlasCard');
    if (!card) return;

    card.querySelector('#atlasCardKicker').textContent = place.subtitle;
    card.querySelector('#atlasCardTitle').textContent = place.name;
    card.querySelector('#atlasCardBeast').textContent = `${place.beast} · 镇守古灵`;
    card.querySelector('#atlasCardDesc').textContent = place.description;
    card.hidden = false;

    if (this.hintMessage) {
      this.hintMessage.textContent = `当前浏览：${place.name} · 点击“走入胜境”开启画境漫步`;
    }
  }

  hidePlaceCard() {
    const card = document.getElementById('atlasCard');
    if (card) card.hidden = true;
    if (this.hintMessage) {
      this.hintMessage.textContent = '移笔游目，点景入画';
    }
  }

  scrollToProgress(u) {
    if (this.frame && this.image) {
      const imgWidth = this.image.scrollWidth || this.image.clientWidth;
      const targetScroll = (imgWidth * u) - (this.frame.clientWidth / 2);
      this.frame.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
    }
  }
}
