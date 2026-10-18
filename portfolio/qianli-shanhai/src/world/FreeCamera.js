import { clamp, screenToWorld } from '../util.js';

/**
 * 正交镜头。zoom 1 = 画高撑满屏。
 * 全卷层把整卷收进一屏（设计稿里的 0.15×，实际值随视口算，桌面大约 0.07–0.12）。
 * 游观 1×（竖屏改为 0.62，天头地脚留白）。入景 2.4×。
 * 松手后柔性吸到这三档。focusTo 从当前镜头补间，不从原点飞。
 */
export class FreeCamera {
  constructor() {
    this.worldW = 25;
    this.worldH = 1;
    this.x = 20;
    this.y = 0.5;
    this.zoom = 1;
    this.vx = 0;
    this.vy = 0;
    this.aspect = 1;
    this.viewPxW = 1;
    this.viewPxH = 1;
    this.portrait = false;
    this.dragging = false;
    this.pinching = false;
    this.idle = 10;
    this.enabled = true;
    this.focus = null;
    this._pointers = new Map();
    this._lastTap = 0;
    this._holdTimer = 0;
    this._moved = 0;
    this._pinchStart = 0;
    this._pinchZoom = 1;
    this.holding = false;
    this.onTap = () => {};
    this.onDouble = () => {};
    this.onHoldChange = () => {};
  }

  setWorld(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  resize(pxW, pxH) {
    this.viewPxW = Math.max(1, pxW);
    this.viewPxH = Math.max(1, pxH);
    this.aspect = this.viewPxW / this.viewPxH;
    this.portrait = this.viewPxH > this.viewPxW * 1.05;
    if (this.zoom < this.overviewZoom()) this.zoom = this.overviewZoom();
  }

  /** 整卷一屏。 */
  overviewZoom() {
    const fitW = this.aspect / this.worldW;
    const fitH = 1 / this.worldH;
    return Math.min(fitW, fitH) * 0.94;
  }

  roamZoom() {
    return this.portrait ? 0.62 : 1;
  }

  enterZoom() {
    return 2.4;
  }

  levels() {
    return [this.overviewZoom(), this.roamZoom(), this.enterZoom()];
  }

  visibleHeight() {
    return 1 / this.zoom;
  }

  visibleWidth() {
    return this.visibleHeight() * this.aspect;
  }

  worldPerPx() {
    return this.visibleWidth() / this.viewPxW;
  }

  verticalFree() {
    return this.zoom >= 1.6;
  }

  attach(el) {
    this.el = el;
    const start = (id, x, y) => {
      this._pointers.set(id, { x, y, lx: x, ly: y });
      if (this._pointers.size === 1) {
        this.dragging = true;
        this.vx = 0;
        this.vy = 0;
        this._moved = 0;
        this._holdTimer = 0;
        this.holding = false;
        this.idle = 0;
      }
      if (this._pointers.size === 2) {
        this.pinching = true;
        this.dragging = false;
        this._pinchStart = this._span();
        this._pinchZoom = this.zoom;
        this.holding = false;
        this.onHoldChange(false);
      }
    };
    const move = (id, x, y) => {
      const p = this._pointers.get(id);
      if (!p || !this.enabled || this.focus) return;
      if (this._pointers.size >= 2 && this.pinching) {
        p.x = x;
        p.y = y;
        const span = this._span();
        if (this._pinchStart > 8) {
          const next = clamp(this._pinchZoom * (span / this._pinchStart), this.overviewZoom(), this.enterZoom());
          const mid = this._mid();
          this._zoomAt(next, mid.x, mid.y);
        }
        this.idle = 0;
        return;
      }
      const dx = x - p.x;
      const dy = y - p.y;
      p.x = x;
      p.y = y;
      this._moved += Math.hypot(dx, dy);
      if (this._moved > 8) {
        this._holdTimer = 0;
        if (this.holding) {
          this.holding = false;
          this.onHoldChange(false);
        }
      }
      const scale = this.worldPerPx();
      this._pan(-dx * scale, this.verticalFree() ? dy * scale : 0);
      const dt = 1 / 60;
      this.vx = (-dx * scale) / dt * 0.18;
      if (this.verticalFree()) this.vy = (dy * scale) / dt * 0.18;
      this.idle = 0;
    };
    const end = (id, x, y) => {
      const wasPinch = this.pinching;
      this._pointers.delete(id);
      if (this._pointers.size < 2) this.pinching = false;
      if (this._pointers.size === 0) {
        this.dragging = false;
        if (this.holding) {
          this.holding = false;
          this.onHoldChange(false);
        }
        if (!wasPinch && this._moved < 7 && this.enabled && !this.focus) {
          const now = performance.now();
          const world = screenToWorld(x, y, this, this.viewPxW, this.viewPxH);
          if (this._tapWait && now - this._tapWait.t < 280) {
            this._tapWait = null;
            this._stepZoom(world.x, world.y);
            this.onDouble(world);
          } else {
            this._tapWait = { x, y, world, t: now };
          }
        }
      }
    };

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      start(e.pointerId, e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', (e) => move(e.pointerId, e.clientX, e.clientY));
    el.addEventListener('pointerup', (e) => end(e.pointerId, e.clientX, e.clientY));
    el.addEventListener('pointercancel', (e) => end(e.pointerId, e.clientX, e.clientY));
    el.addEventListener('wheel', (e) => {
      if (!this.enabled || this.focus) return;
      e.preventDefault();
      this.idle = 0;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0016);
        this._zoomAt(this.zoom * factor, e.clientX, e.clientY);
      } else {
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        this.vx += dx * this.worldPerPx() * 2.2;
      }
    }, { passive: false });

    this._keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) this._keys.add(e.code);
      else this._keys.add(e.code);
      if (!this.enabled || this.focus) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this._zoomAt(this.zoom * 1.08, this.viewPxW / 2, this.viewPxH / 2);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this._zoomAt(this.zoom / 1.08, this.viewPxW / 2, this.viewPxH / 2);
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
  }

  _span() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  _mid() {
    const pts = [...this._pointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  _pan(dx, dy) {
    const hw = this.visibleWidth() / 2;
    const minX = hw;
    const maxX = this.worldW - hw;
    if (this.x <= minX && dx < 0) dx *= 0.28;
    if (this.x >= maxX && dx > 0) dx *= 0.28;
    this.x += dx;
    this.y += dy;
    if (!this.verticalFree()) this.y = 0.5;
  }

  _zoomAt(next, sx, sy) {
    const before = screenToWorld(sx, sy, this, this.viewPxW, this.viewPxH);
    this.zoom = clamp(next, this.overviewZoom(), this.enterZoom());
    const after = screenToWorld(sx, sy, this, this.viewPxW, this.viewPxH);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this._clampHard();
  }

  _stepZoom(wx, wy) {
    const levels = this.levels();
    let target = levels[levels.length - 1];
    if (this.zoom > this.enterZoom() * 0.82) target = this.roamZoom();
    else {
      const higher = levels.find((level) => level > this.zoom * 1.08);
      if (higher) target = higher;
    }
    this.focusTo(wx, wy, target, 0.55);
  }

  _clampHard() {
    const hw = this.visibleWidth() / 2;
    const hh = this.visibleHeight() / 2;
    const minX = hw;
    const maxX = Math.max(minX, this.worldW - hw);
    if (minX >= maxX) this.x = this.worldW / 2;
    else this.x = clamp(this.x, minX, maxX);
    if (!this.verticalFree()) this.y = 0.5;
    else this.y = clamp(this.y, hh, Math.max(hh, this.worldH - hh));
  }

  /**
   * 补间到一个卷面位置。起点是当前镜头，第 0 帧就离开当前位置，不会从 (0,0) 穿过去。
   */
  focusTo(x, y, zoom, duration = 1.6, onDone = null) {
    this.focus = {
      sx: this.x,
      sy: this.y,
      sz: this.zoom,
      tx: x,
      ty: y,
      tz: clamp(zoom, this.overviewZoom(), this.enterZoom()),
      t0: performance.now(),
      duration: Math.max(0.05, duration),
      onDone,
    };
    this.vx = 0;
    this.vy = 0;
  }

  update(dt) {
    if (this.focus) {
      const t = clamp((performance.now() - this.focus.t0) / (this.focus.duration * 1000), 0, 1);
      const e = t * t * (3 - 2 * t);
      const f = this.focus;
      this.x = f.sx + (f.tx - f.sx) * e;
      this.y = f.sy + (f.ty - f.sy) * e;
      this.zoom = f.sz + (f.tz - f.sz) * e;
      this._clampHard();
      if (t >= 1) {
        const done = f.onDone;
        this.focus = null;
        if (done) done();
      }
      return;
    }

    if (this.enabled && !this.dragging && !this.pinching) {
      const speed = this.worldPerPx() * 520;
      let kx = 0;
      let ky = 0;
      if (this._keys?.has('ArrowLeft') || this._keys?.has('KeyA')) kx -= 1;
      if (this._keys?.has('ArrowRight') || this._keys?.has('KeyD')) kx += 1;
      if (this.verticalFree()) {
        if (this._keys?.has('ArrowUp') || this._keys?.has('KeyW')) ky += 1;
        if (this._keys?.has('ArrowDown') || this._keys?.has('KeyS')) ky -= 1;
      }
      if (kx || ky) {
        this.x += kx * speed * dt;
        this.y += ky * speed * dt;
        this.vx = 0;
        this.vy = 0;
        this.idle = 0;
      }
    }

    if (this.enabled && this.dragging && this._pointers.size === 1 && this._moved < 8) {
      this._holdTimer += dt;
      if (this._holdTimer >= 1.2 && !this.holding) {
        this.holding = true;
        this.onHoldChange(true);
      }
    }

    if (this._tapWait && performance.now() - this._tapWait.t > 280) {
      const tap = this._tapWait;
      this._tapWait = null;
      this.onTap(tap);
    }

    if (this.enabled && !this.dragging && !this.pinching) {
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      const decay = Math.exp(-2.8 * dt);
      this.vx *= decay;
      this.vy *= decay;
      if (Math.abs(this.vx) < 0.00002) this.vx = 0;
      if (Math.abs(this.vy) < 0.00002) this.vy = 0;
      this.idle += dt;
      if (this.idle > 0.22) this._springZoom(dt);
    }

    if (!this.dragging) this._clampHard();
  }

  _springZoom(dt) {
    const levels = this.levels();
    let nearest = levels[0];
    let best = Infinity;
    levels.forEach((level) => {
      const d = Math.abs(Math.log(this.zoom / level));
      if (d < best) {
        best = d;
        nearest = level;
      }
    });
    const k = 1 - Math.exp(-7 * dt);
    this.zoom += (nearest - this.zoom) * k;
    if (Math.abs(this.zoom - nearest) < 0.004) this.zoom = nearest;
  }
}
