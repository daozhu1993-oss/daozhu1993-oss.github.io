import { BEASTS, BAIZE } from '../data/beasts.js';
import { cnCount, formatDur } from '../util.js';

/**
 * 山海画札。一本绢页，不是仪表。进度写在页里，不写在画面上。
 */
export class Album {
  constructor(root, { art, onClose, onRetry, onReset }) {
    this.art = art;
    this.onClose = onClose;
    this.onRetry = onRetry;
    this.onReset = onReset;
    this.index = 2;
    this.save = null;
    this.el = document.createElement('div');
    this.el.id = 'album';
    this.el.hidden = true;
    root.appendChild(this.el);
    this._sx = 0;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
      this._sx = e.clientX;
    });
    this.el.addEventListener('pointerup', (e) => {
      const dx = e.clientX - this._sx;
      if (Math.abs(dx) > 48) this.turn(dx < 0 ? 1 : -1);
    });
  }

  get pages() {
    return [...BEASTS, BAIZE, { id: 'seals', name: '印谱' }];
  }

  open(save, index = 2) {
    this.save = save;
    this.index = index;
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.el.hidden = true;
    this.onClose?.();
  }

  get openNow() {
    return !this.el.hidden;
  }

  turn(dir) {
    const n = this.pages.length;
    this.index = (this.index + dir + n) % n;
    this.render();
  }

  render() {
    const page = this.pages[this.index];
    const row = page.id === 'seals' || page.id === 'baize' ? null : this.save.beast(page.id);
    this.el.innerHTML = `<div class="book" role="dialog" aria-label="山海画札">
      <div class="leaf leaf-art">${this._art(page, row)}</div>
      <div class="leaf leaf-text">${this._text(page, row)}</div>
    </div>`;
    const retry = this.el.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => this.onRetry?.());
    const reset = this.el.querySelector('[data-reset]');
    if (reset) {
      let timer = 0;
      const arm = () => {
        timer = window.setTimeout(() => this.onReset?.(), 2000);
      };
      const drop = () => window.clearTimeout(timer);
      reset.addEventListener('pointerdown', arm);
      reset.addEventListener('pointerup', drop);
      reset.addEventListener('pointerleave', drop);
    }
    this.el.querySelector('.book').addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width * 0.18) this.turn(-1);
      else if (x > rect.width * 0.82) this.turn(1);
    });
  }

  _art(page, row) {
    if (page.id === 'seals') {
      return `<p class="seal-grid" aria-hidden="true">${'<i></i>'.repeat(9)}</p><p class="leaf-name">希孟小印</p>`;
    }
    if (page.id === 'baize') {
      return `<p class="locked-name">白泽</p><p class="leaf-place">终章</p>`;
    }
    if (row?.woke && page.id === 'fuzhu') {
      const src = this.art.album?.src || this.art.resident?.src;
      return `<img alt="夫诸" src="${src}"><p class="leaf-place">${page.place}</p>`;
    }
    return `<p class="locked-name">${page.name}</p><p class="leaf-place">${page.place}</p>`;
  }

  _text(page, row) {
    if (page.id === 'seals') {
      return `<p class="classic">印位尚空。六兽之后，才去卷里找希孟的小印。</p>
        <button type="button" class="reset" data-reset>重新展卷</button>`;
    }
    if (page.id === 'baize') {
      return `<p class="classic">${page.quote}</p>`;
    }
    if (!row?.woke) {
      return `<h2>${page.name}</h2><p class="classic">${page.quote}</p><p class="source">${page.source}</p>`;
    }
    const grade = row.ghost && !row.grade ? '墨印' : (row.grade || '');
    const time = row.ms == null ? '' : formatDur(row.ms);
    const tries = row.tries ? `${cnCount(row.tries)}试` : '';
    const meta = [page.place, grade, time, tries].filter(Boolean).join(' · ');
    const seal = row.grade ? row.grade.slice(0, 1) : (row.ghost ? '墨' : '');
    const sealClass = row.grade ? 'seal cinnabar' : 'seal ink';
    return `<h2>${page.name}</h2>
      <p class="classic">${page.classic}</p>
      <p class="source">${page.source}</p>
      <p class="meta">${meta}</p>
      ${seal ? `<i class="${sealClass}">${seal}</i>` : ''}
      ${page.id === 'fuzhu' ? '<button type="button" class="retry" data-retry>再试</button>' : ''}`;
  }
}
