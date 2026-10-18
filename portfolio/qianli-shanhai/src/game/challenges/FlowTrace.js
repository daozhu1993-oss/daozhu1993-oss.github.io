import { clamp } from '../../util.js';
import { gradeFlow } from '../grade.js';

/**
 * 悬瀑引泉。三条水道，只有中间那条是对的。
 * 真迹水线平时 8% 透明；同段失败 3 次后放到 20%，走廊和流速一并放宽。
 * 失败是墨晕，1.5 秒内回到本段起点。第 5 次失败才请希孟代笔。
 */

function wave(y0, y1, amp, turns, xMid = 0.5) {
  const pts = [];
  const steps = Math.max(8, turns * 12);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = xMid + Math.sin(t * turns * Math.PI * 2) * amp;
    pts.push([Math.min(0.66, Math.max(0.34, x)), y0 + (y1 - y0) * t]);
  }
  return pts;
}

const NORM = {
  a: wave(0.07, 0.30, 0.14, 3),
  mid: wave(0.30, 0.64, 0.14, 5),
  left: [[0.5, 0.30], [0.26, 0.36], [0.12, 0.52], [0.08, 0.78]],
  right: [[0.5, 0.30], [0.74, 0.36], [0.88, 0.52], [0.92, 0.78]],
  c: wave(0.64, 0.96, 0.13, 3),
};

const SPEED_MIN = 120;
const SPEED_MAX = 520;
const DEMO_SPEED = 220;
const KEY_SPEED = 230;

function project(pts, x, y) {
  let best = { dist: Infinity, s: 0, x: pts[0][0], y: pts[0][1] };
  let walked = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const ax = pts[i - 1][0];
    const ay = pts[i - 1][1];
    const bx = pts[i][0];
    const by = pts[i][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const len = Math.sqrt(len2);
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
    const px = ax + dx * t;
    const py = ay + dy * t;
    const dist = Math.hypot(x - px, y - py);
    if (dist < best.dist) best = { dist, s: walked + len * t, x: px, y: py };
    walked += len;
  }
  best.length = walked;
  return best;
}

function pointAt(pts, s) {
  let walked = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const ax = pts[i - 1][0];
    const ay = pts[i - 1][1];
    const dx = pts[i][0] - ax;
    const dy = pts[i][1] - ay;
    const len = Math.hypot(dx, dy) || 1;
    if (walked + len >= s) {
      const t = (s - walked) / len;
      return { x: ax + dx * t, y: ay + dy * t };
    }
    walked += len;
  }
  const last = pts[pts.length - 1];
  return { x: last[0], y: last[1] };
}

function sliceTo(pts, s) {
  const out = [pts[0]];
  let walked = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const ax = pts[i - 1][0];
    const ay = pts[i - 1][1];
    const dx = pts[i][0] - ax;
    const dy = pts[i][1] - ay;
    const len = Math.hypot(dx, dy) || 1;
    if (walked + len >= s) {
      const t = Math.max(0, (s - walked) / len);
      out.push([ax + dx * t, ay + dy * t]);
      return out;
    }
    out.push(pts[i]);
    walked += len;
  }
  return out;
}

function polyLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i += 1) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return n;
}

export class FlowTrace {
  constructor({ audio, coarse, reduced, deer, onWin, onFail, onAssist }) {
    this.audio = audio;
    this.coarse = coarse;
    this.reduced = reduced;
    this.deer = deer;
    this.onWin = onWin;
    this.onFail = onFail;
    this.onAssist = onAssist;
    this.phase = 'demo';
    this.seg = 0;
    this.headS = 0;
    this.segFails = [0, 0, 0];
    this.totalFails = 0;
    this.playMs = 0;
    this.pointer = null;
    this.keys = new Set();
    this.branch = 'mid';
    this.failT = 0;
    this.failAt = { x: 0, y: 0 };
    this.demoT = 0;
    this.demoDur = 5;
    this.winT = 0;
    this.slowT = 0;
    this.fastT = 0;
    this.offT = 0;
    this.speedMarks = [];
    this.ghostOffered = false;
    this.finished = false;
    this.board = { x: 0, y: 0, w: 10, h: 10, portrait: false };
    this.paths = { a: [], mid: [], left: [], right: [], c: [] };
    this._layoutW = 0;
    this._layoutH = 0;
  }

  resize(w, h) {
    if (w === this._layoutW && h === this._layoutH) return;
    this._layoutW = w;
    this._layoutH = h;
    const portrait = h > w * 1.05;
    const bw = portrait ? Math.min(w * 0.9, 520) : Math.min(w * 0.42, 500);
    const bh = portrait ? h * 0.74 : h * 0.88;
    this.board = {
      x: (w - bw) / 2,
      y: portrait ? h * 0.14 : (h - bh) / 2,
      w: bw,
      h: bh,
      portrait,
    };
    const map = (pts) => pts.map(([nx, ny]) => [this.board.x + nx * bw, this.board.y + ny * bh]);
    this.paths = {
      a: map(NORM.a),
      mid: map(NORM.mid),
      left: map(NORM.left),
      right: map(NORM.right),
      c: map(NORM.c),
    };
    const opening = polyLength(this.paths.a);
    this.demoDur = this.reduced ? 1.4 : clamp(opening / DEMO_SPEED, 3.2, 5.6);
  }

  radius() {
    const base = this.coarse ? 26 : 18;
    return this.wide() ? base * 1.45 : base;
  }

  wide() {
    return this.segFails[this.seg] >= 3;
  }

  speedBand() {
    if (!this.wide()) return { min: SPEED_MIN, max: SPEED_MAX };
    return { min: SPEED_MIN * 0.62, max: SPEED_MAX * 1.4 };
  }

  ghostAlpha() {
    return this.wide() ? 0.2 : 0.08;
  }

  activePaths() {
    if (this.seg === 0) return [['a', this.paths.a]];
    if (this.seg === 1) return [['left', this.paths.left], ['mid', this.paths.mid], ['right', this.paths.right]];
    return [['c', this.paths.c]];
  }

  correctPath() {
    if (this.seg === 0) return this.paths.a;
    if (this.seg === 1) return this.paths.mid;
    return this.paths.c;
  }

  pointerDown(x, y) {
    if (this.phase !== 'play') return;
    this.pointer = { x, y };
    this.speedMarks = [{ t: performance.now(), s: this.headS }];
    this.slowT = 0;
    this.fastT = 0;
    this.offT = 0;
  }

  pointerMove(x, y) {
    if (this.phase !== 'play' || !this.pointer) return;
    this.pointer.x = x;
    this.pointer.y = y;
  }

  pointerUp() {
    if (this.phase !== 'play' || !this.pointer) {
      this.pointer = null;
      return;
    }
    const path = this.correctPath();
    const length = polyLength(path);
    if (this.seg === 1 && this.branch !== 'mid') {
      this.pointer = null;
      return;
    }
    if (this.headS >= length - 16) this._completeSeg();
    else if (this.headS > 22) this._fail(this.pointer.x, this.pointer.y);
    this.pointer = null;
    this.audio?.setFlow(0, 0.4);
  }

  key(code, down) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    if (!down || this.phase !== 'play') return;
    if (code === 'ArrowLeft') this.branch = 'left';
    if (code === 'ArrowRight') this.branch = 'right';
    if (code === 'ArrowDown' || code === 'ArrowUp') this.branch = this.branch || 'mid';
  }

  update(dt) {
    if (this._layoutW) this.resize(this._layoutW, this._layoutH);
    if (this.phase === 'demo') {
      this.demoT += dt;
      const u = clamp(this.demoT / this.demoDur, 0, 1);
      this._setDemoHead(u);
      this.audio?.setFlow(0.35 + u * 0.4, 0.45);
      if (u >= 1) {
        this.phase = 'play';
        this.seg = 0;
        this.headS = 0;
        this.branch = 'mid';
        this.audio?.setFlow(0, 0.4);
      }
      return;
    }
    if (this.phase === 'ghost') {
      this.demoT += dt;
      const u = clamp(this.demoT / (this.reduced ? 1.2 : 2.8), 0, 1);
      this._setFullHead(u);
      this.audio?.setFlow(0.5, 0.5);
      if (u >= 1) this._succeed(true);
      return;
    }
    if (this.phase === 'fail') {
      this.failT += dt;
      this.playMs += dt * 1000;
      if (this.failT > 0.55) {
        const back = clamp((this.failT - 0.55) / 0.55, 0, 1);
        const path = this.correctPath();
        const length = polyLength(path);
        this.headS = length * (1 - back) * (this._failHead || 0);
      }
      if (this.failT >= 1.35) {
        this.phase = 'play';
        this.headS = 0;
        this.branch = 'mid';
        this.slowT = 0;
        this.fastT = 0;
        this.offT = 0;
      }
      return;
    }
    if (this.phase === 'success') {
      this.winT += dt;
      this.audio?.setFlow(0.15, 0.35);
      if (this.winT > (this.reduced ? 0.8 : 2.4) && !this.finished) {
        this.finished = true;
        const ghost = this._ghostWin;
        const fails = this.totalFails;
        this.onWin?.({
          grade: gradeFlow({ fails, ms: this.playMs, ghost }),
          ms: this.playMs,
          tries: fails + 1,
          ghost: Boolean(ghost),
        });
      }
      return;
    }
    if (this.phase !== 'play') return;
    this.playMs += dt * 1000;
    if (this.pointer) this._followPointer(dt);
    else if (this.keys.has('ArrowDown') || this.keys.has('ArrowUp')) this._advanceKeyboard(dt);
    this._syncAssist();
  }

  requestGhost() {
    if (this.segFails[this.seg] < 5) return;
    if (this.phase !== 'play' && this.phase !== 'fail') return;
    this.phase = 'ghost';
    this.demoT = 0;
    this.seg = 0;
    this.headS = 0;
    this.pointer = null;
  }

  _setFullHead(u) {
    const lengths = [polyLength(this.paths.a), polyLength(this.paths.mid), polyLength(this.paths.c)];
    const total = lengths[0] + lengths[1] + lengths[2] || 1;
    let remain = u * total;
    if (remain <= lengths[0]) {
      this.seg = 0;
      this.headS = remain;
      return;
    }
    remain -= lengths[0];
    if (remain <= lengths[1]) {
      this.seg = 1;
      this.branch = 'mid';
      this.headS = remain;
      return;
    }
    this.seg = 2;
    this.branch = 'mid';
    this.headS = remain - lengths[1];
  }

  _setDemoHead(u) {
    // The demonstration only walks the opening channel, at a legal pace.
    this.seg = 0;
    this.branch = 'mid';
    this.headS = u * polyLength(this.paths.a);
  }

  _advanceKeyboard(dt) {
    if (this.seg === 1) {
      if (this.keys.has('ArrowLeft')) this.branch = 'left';
      else if (this.keys.has('ArrowRight')) this.branch = 'right';
      else this.branch = 'mid';
    }
    if (this.seg === 1 && (this.branch === 'left' || this.branch === 'right')) {
      const wrong = this.branch === 'left' ? this.paths.left : this.paths.right;
      this.headS += KEY_SPEED * dt;
      if (this.headS > polyLength(wrong) * 0.22) {
        const p = pointAt(wrong, this.headS);
        this._fail(p.x, p.y);
      }
      return;
    }
    const path = this.correctPath();
    this.headS += KEY_SPEED * dt;
    this.audio?.setFlow(0.55, 0.48);
    if (this.headS >= polyLength(path) - 1) this._completeSeg();
  }

  _followPointer(dt) {
    const radius = this.radius();
    const options = this.activePaths().map(([name, pts]) => ({ name, pts, hit: project(pts, this.pointer.x, this.pointer.y) }));
    const inside = options.filter((o) => o.hit.dist <= radius);
    if (!inside.length) {
      this.offT += dt;
      if (this.offT > 0.09 && this.headS > 8) this._fail(this.pointer.x, this.pointer.y);
      this.audio?.setFlow(0.12, 0.7);
      return;
    }
    this.offT = 0;
    inside.sort((a, b) => b.hit.s - a.hit.s);
    const chosen = inside[0];
    if (this.seg === 1 && chosen.name !== 'mid' && chosen.hit.s > polyLength(chosen.pts) * 0.16) {
      this._fail(chosen.hit.x, chosen.hit.y);
      return;
    }
    const path = this.seg === 1 ? this.paths[chosen.name] : this.correctPath();
    if (this.seg === 1) this.branch = chosen.name;
    const target = chosen.name === 'mid' || this.seg !== 1 ? project(path, this.pointer.x, this.pointer.y).s : chosen.hit.s;
    if (target > this.headS) this.headS = target;
    const now = performance.now();
    this.speedMarks.push({ t: now, s: this.headS });
    const horizon = now - 420;
    this.speedMarks = this.speedMarks.filter((m) => m.t >= horizon);
    const band = this.speedBand();
    const recent = this.speedMarks.filter((m) => m.t >= now - 160);
    if (recent.length >= 2 && now - recent[0].t > 80) {
      const speed = (recent[recent.length - 1].s - recent[0].s) / ((now - recent[0].t) / 1000);
      const bright = clamp((speed - band.min) / (band.max - band.min), 0, 1);
      this.audio?.setFlow(0.25 + clamp(this.headS / polyLength(path), 0, 1) * 0.6, bright);
      if (speed > band.max) this.fastT += dt;
      else this.fastT = 0;
      if (this.fastT > 0.1) {
        this._fail(this.pointer.x, this.pointer.y);
        return;
      }
    }
    const oldest = this.speedMarks[0];
    if (oldest && now - oldest.t > 300 && this.headS > 24) {
      const slow = (this.headS - oldest.s) / ((now - oldest.t) / 1000);
      if (slow < band.min) this.slowT += dt;
      else this.slowT = 0;
      if (this.slowT > 0.42) {
        this._fail(this.pointer.x, this.pointer.y);
        return;
      }
    }
    if (this.headS >= polyLength(path) - 8 && (this.seg !== 1 || this.branch === 'mid')) this._completeSeg();
  }

  _completeSeg() {
    if (this.phase !== 'play' && this.phase !== 'demo') return;
    this.audio?.playQing(0, 0.1);
    if (this.seg >= 2) {
      this.headS = polyLength(this.paths.c);
      this._succeed(false);
      return;
    }
    this.seg += 1;
    this.headS = 0;
    this.branch = 'mid';
    this.slowT = 0;
    this.fastT = 0;
    this.speedMarks = [{ t: performance.now(), s: 0 }];
    this._syncAssist();
  }

  _fail(x, y) {
    if (this.phase !== 'play') return;
    this.phase = 'fail';
    this.failT = 0;
    this.failAt = { x, y };
    this._failHead = this.headS / Math.max(1, polyLength(this.correctPath()));
    this.segFails[this.seg] += 1;
    this.totalFails += 1;
    this.pointer = null;
    this.audio?.setFlow(0, 0.2);
    this.audio?.playDissonance();
    this.onFail?.();
    this._syncAssist();
  }

  _succeed(ghost) {
    if (this.phase === 'success') return;
    this.phase = 'success';
    this._ghostWin = ghost;
    this.winT = 0;
    this.pointer = null;
    this.audio?.playZhi();
  }

  _syncAssist() {
    const offer = this.segFails[this.seg] >= 5 && (this.phase === 'play' || this.phase === 'fail');
    if (offer !== this.ghostOffered) {
      this.ghostOffered = offer;
      this.onAssist?.(offer);
    }
  }

  render(ctx, w, h) {
    this.resize(w, h);
    const b = this.board;
    ctx.save();
    this._wash(ctx, b);
    this._grooves(ctx);
    this._ghostLine(ctx);
    this._pools(ctx);
    this._water(ctx);
    this._deer(ctx, b);
    if (this.phase === 'demo') this._caption(ctx, b, '沿石缝引水，不快不慢');
    if (this.phase === 'fail') this._bloom(ctx);
    ctx.restore();
  }

  _wash(ctx, b) {
    const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(141, 111, 55, 0.05)');
    g.addColorStop(0.45, 'rgba(62, 52, 34, 0.16)');
    g.addColorStop(1, 'rgba(46, 97, 132, 0.10)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w * 0.18, b.y);
    ctx.bezierCurveTo(b.x + b.w * 0.05, b.y + b.h * 0.3, b.x + b.w * 0.08, b.y + b.h * 0.7, b.x + b.w * 0.2, b.y + b.h);
    ctx.lineTo(b.x + b.w * 0.82, b.y + b.h);
    ctx.bezierCurveTo(b.x + b.w * 0.95, b.y + b.h * 0.6, b.x + b.w * 0.9, b.y + b.h * 0.2, b.x + b.w * 0.78, b.y);
    ctx.closePath();
    ctx.fill();
  }

  _grooves(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(39, 35, 21, 0.55)';
    ctx.lineWidth = 2.2;
    [this.paths.a, this.paths.left, this.paths.mid, this.paths.right, this.paths.c].forEach((pts) => {
      stroke(ctx, pts);
    });
  }

  _ghostLine(ctx) {
    ctx.save();
    ctx.strokeStyle = `rgba(241, 234, 219, ${this.ghostAlpha()})`;
    ctx.lineWidth = this.wide() ? 7 : 5;
    ctx.lineCap = 'round';
    stroke(ctx, this.paths.a);
    stroke(ctx, this.paths.mid);
    stroke(ctx, this.paths.c);
    ctx.restore();
  }

  _pools(ctx) {
    const spots = [this.paths.a.at(-1), this.paths.mid.at(-1), this.paths.c.at(-1)];
    spots.forEach((p, i) => {
      const r = i === 2 ? 28 : 16;
      ctx.beginPath();
      ctx.fillStyle = i === 2 ? 'rgba(46, 97, 132, 0.28)' : 'rgba(91, 141, 176, 0.22)';
      ctx.ellipse(p[0], p[1], r * 1.4, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(39, 35, 21, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  _water(ctx) {
    const drawn = [];
    if (this.seg > 0) drawn.push(this.paths.a);
    if (this.seg > 1) drawn.push(this.paths.mid);
    const onWrong = this.seg === 1 && this.branch !== 'mid' && (this.phase === 'play' || this.phase === 'ghost');
    const current = onWrong ? this.paths[this.branch] : this.correctPath();
    if (this.phase === 'fail' && this.branch !== 'mid' && this.seg === 1) {
      // The failed wrong branch is not kept.
    } else if (this.headS > 2) {
      drawn.push(sliceTo(current, this.headS));
    }
    if (this.phase === 'success') {
      drawn.length = 0;
      drawn.push(this.paths.a, this.paths.mid, this.paths.c);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawn.forEach((pts) => {
      ctx.strokeStyle = 'rgba(46, 97, 132, 0.35)';
      ctx.lineWidth = 16;
      stroke(ctx, pts);
      ctx.strokeStyle = 'rgba(91, 141, 176, 0.9)';
      ctx.lineWidth = 8;
      stroke(ctx, pts);
      ctx.strokeStyle = 'rgba(241, 234, 219, 0.55)';
      ctx.lineWidth = 2.2;
      stroke(ctx, pts);
    });
    if (this.phase !== 'success' && this.headS > 2) {
      const tip = pointAt(current, this.headS);
      const lift = this.coarse && this.pointer ? -40 : 0;
      ctx.beginPath();
      ctx.fillStyle = '#5B8DB0';
      ctx.arc(tip.x, tip.y + lift, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _deer(ctx, b) {
    const p = this.paths.c.at(-1);
    const alpha = this.phase === 'success'
      ? clamp(this.winT / 0.8, 0, 1)
      : 0.22;
    if (!this.deer) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#272315';
      ctx.strokeRect(p[0] - 18, p[1] - 36, 36, 28);
      ctx.restore();
      return;
    }
    const dw = b.w * 0.28;
    const dh = dw * (this.deer.height / this.deer.width);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.deer, p[0] - dw * 0.35, p[1] - dh * 0.82, dw, dh);
    ctx.restore();
  }

  _caption(ctx, b) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - Math.max(0, this.demoT - (this.demoDur - 0.8)) / 0.8, 0, 0.85);
    ctx.fillStyle = '#272315';
    ctx.font = '500 15px "Source Han Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('沿石缝引水，不快不慢', b.x + b.w / 2, b.y + b.h * 0.035);
    ctx.restore();
  }

  _bloom(ctx) {
    const t = clamp(this.failT / 0.7, 0, 1);
    const fade = this.failT > 0.85 ? clamp(1 - (this.failT - 0.85) / 0.45, 0, 1) : 1;
    const r = 18 + t * 168;
    for (let i = 0; i < 4; i += 1) {
      const ox = Math.sin(i * 2.2) * r * 0.18;
      const oy = Math.cos(i * 1.7) * r * 0.14;
      const g = ctx.createRadialGradient(this.failAt.x + ox, this.failAt.y + oy, r * 0.1, this.failAt.x + ox, this.failAt.y + oy, r);
      g.addColorStop(0, `rgba(39, 35, 21, ${0.55 * fade})`);
      g.addColorStop(1, 'rgba(39, 35, 21, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.failAt.x + ox, this.failAt.y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function stroke(ctx, pts) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
