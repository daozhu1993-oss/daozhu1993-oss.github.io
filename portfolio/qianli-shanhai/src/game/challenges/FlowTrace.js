import { clamp, worldToScreen } from '../../util.js';
import { gradeFlow } from '../grade.js';

/**
 * 悬瀑引泉。三条水道，只有中间那条是对的。
 * 真迹水线平时 8% 透明；同段失败 3 次后放到 20%，走廊和流速一并放宽。
 * 失败是墨晕，1.5 秒内回到本段起点。第 5 次失败才请希孟代笔。
 */

/**
 * 悬瀑在真迹上的水道。nx 是全卷，ny 向上。
 * 白练在 nx ≈ 0.690，从上岩落到潭边。水道以落下为主，只在岩唇和潭岸横过一次。
 * 中段、下段各有两条干岩缝，走到一半就断。
 */
const WORLD = {
  a: [
    [0.690, 0.630], [0.688, 0.568], [0.691, 0.508], [0.689, 0.458],
  ],
  mid: [
    [0.689, 0.458], [0.691, 0.446], [0.693, 0.424], [0.691, 0.386], [0.689, 0.346], [0.690, 0.308],
  ],
  left: [
    [0.689, 0.458], [0.683, 0.436], [0.679, 0.412], [0.678, 0.392],
  ],
  right: [
    [0.689, 0.458], [0.696, 0.438], [0.701, 0.416], [0.702, 0.396],
  ],
  c: [
    [0.690, 0.308], [0.688, 0.258], [0.691, 0.228], [0.697, 0.216], [0.701, 0.228],
  ],
  cLeft: [
    [0.690, 0.308], [0.684, 0.292], [0.679, 0.274], [0.678, 0.258],
  ],
  cRight: [
    [0.690, 0.308], [0.696, 0.292], [0.701, 0.276], [0.702, 0.260],
  ],
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
    this.camera = null;
    this.board = { x: 0, y: 0, w: 10, h: 10, portrait: false };
    this.paths = { a: [], mid: [], left: [], right: [], c: [] };
    this._layoutW = 0;
    this._layoutH = 0;
  }

  resize(w, h) {
    this._layoutW = w;
    this._layoutH = h;
    this._project();
  }

  _project() {
    const w = this._layoutW;
    const h = this._layoutH;
    const cam = this.camera;
    if (!w || !h || !cam) return;
    const map = (pts) => pts.map(([nx, ny]) => {
      const p = worldToScreen(nx * cam.worldW, ny, cam, w, h);
      return [p.x, p.y];
    });
    const shape = (pts) => wobble(smooth(map(pts)), 5);
    this.paths = {
      a: shape(WORLD.a),
      mid: shape(WORLD.mid),
      left: shape(WORLD.left),
      right: shape(WORLD.right),
      c: shape(WORLD.c),
      cLeft: shape(WORLD.cLeft),
      cRight: shape(WORLD.cRight),
    };
    const opening = polyLength(this.paths.a);
    this._demoLen = Math.min(opening, 980);
    this.demoDur = this.reduced ? 1.4 : clamp(this._demoLen / DEMO_SPEED, 3.2, 5.6);
    const all = this.paths.a.concat(this.paths.mid, this.paths.c);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    all.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    this.board = {
      x: minX,
      y: minY,
      w: Math.max(10, maxX - minX),
      h: Math.max(10, maxY - minY),
      portrait: h > w * 1.05,
    };
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

  _choice() {
    if (this.seg === 1) return { correct: 'mid', left: 'left', right: 'right' };
    if (this.seg === 2) return { correct: 'c', left: 'cLeft', right: 'cRight' };
    return null;
  }

  activePaths() {
    const choice = this._choice();
    if (!choice) return [['a', this.paths.a]];
    return [choice.left, choice.correct, choice.right].map((name) => [name, this.paths[name]]);
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
    const choice = this._choice();
    if (choice && this.branch !== choice.correct) {
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
    const choice = this._choice();
    if (choice && code === 'ArrowLeft') this.branch = choice.left;
    if (choice && code === 'ArrowRight') this.branch = choice.right;
    if (code === 'ArrowDown' || code === 'ArrowUp') this.branch = choice ? choice.correct : 'a';
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
    this.branch = 'c';
    this.headS = remain - lengths[1];
  }

  _setDemoHead(u) {
    // The demonstration only walks the opening channel, at a legal pace.
    this.seg = 0;
    this.branch = 'mid';
    this.headS = u * (this._demoLen || polyLength(this.paths.a));
  }

  _advanceKeyboard(dt) {
    const choice = this._choice();
    if (choice) {
      if (this.keys.has('ArrowLeft')) this.branch = choice.left;
      else if (this.keys.has('ArrowRight')) this.branch = choice.right;
      else this.branch = choice.correct;
    }
    if (choice && this.branch !== choice.correct) {
      const wrong = this.paths[this.branch];
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
    const choice = this._choice();
    if (choice && chosen.name !== choice.correct && chosen.hit.s > polyLength(chosen.pts) * 0.16) {
      this._fail(chosen.hit.x, chosen.hit.y);
      return;
    }
    const path = choice ? this.paths[chosen.name] : this.correctPath();
    if (choice) this.branch = chosen.name;
    const target = !choice || chosen.name === choice.correct ? project(path, this.pointer.x, this.pointer.y).s : chosen.hit.s;
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
    const onCorrect = !choice || this.branch === choice.correct;
    if (this.headS >= polyLength(path) - 8 && onCorrect) this._completeSeg();
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
    this.branch = this.seg === 2 ? 'c' : 'mid';
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
    this._grooves(ctx);
    this._pools(ctx);
    this._water(ctx);
    this._deer(ctx);
    if (this.phase === 'demo') this._caption(ctx, b, '沿石缝引水，不快不慢');
    if (this.phase === 'fail') this._bloom(ctx);
    ctx.restore();
  }

  _grooves(ctx) {
    const alpha = this.ghostAlpha();
    const show = [];
    const done = this.phase === 'success' || this.phase === 'ghost';
    if (this.seg === 0 || this.phase === 'demo' || done) show.push([this.paths.a, alpha]);
    if (this.seg === 1 || done) {
      show.push([this.paths.left, alpha * 0.85]);
      show.push([this.paths.right, alpha * 0.85]);
      show.push([this.paths.mid, alpha]);
    }
    if (this.seg === 2 || done) {
      show.push([this.paths.cLeft, alpha * 0.85]);
      show.push([this.paths.cRight, alpha * 0.85]);
      show.push([this.paths.c, alpha]);
    }
    show.forEach(([pts, a]) => gully(ctx, pts, a));
  }

  _pools(ctx) {
    const upper = this.paths.a.at(-1);
    const lower = this.paths.c.at(-1);
    if (upper) paintPool(ctx, upper[0], upper[1], 22, 11);
    if (lower) paintPool(ctx, lower[0], lower[1], 46, 18);
  }

  _water(ctx) {
    const drawn = [];
    const choice = this._choice();
    const onWrong = choice && this.branch !== choice.correct && (this.phase === 'play' || this.phase === 'ghost');
    if (this.phase === 'success') {
      drawn.push(this.paths.a, this.paths.mid, this.paths.c);
    } else {
      if (this.seg > 0) drawn.push(this.paths.a);
      if (this.seg > 1) drawn.push(this.paths.mid);
      const current = onWrong ? this.paths[this.branch] : this.correctPath();
      const hideSlice = this.phase === 'fail' && onWrong;
      if (!hideSlice && this.headS > 2) drawn.push(sliceTo(current, this.headS));
    }
    drawn.forEach((pts, index) => {
      const tip = index === drawn.length - 1 && this.phase !== 'success';
      inkWater(ctx, pts, tip);
    });
  }

  _deer(ctx) {
    const p = this.paths.c.at(-1);
    if (!p || !this.deer) return;
    const alpha = this.phase === 'success' ? clamp(this.winT / 0.8, 0, 1) : 0.34;
    const cam = this.camera;
    const dh = cam
      ? Math.max(28, Math.abs(worldToScreen(0, 0.046, cam, this._layoutW, this._layoutH).y
        - worldToScreen(0, 0, cam, this._layoutW, this._layoutH).y))
      : Math.min(this._layoutH * 0.09, 96);
    const dw = dh * ((this.deer.width || 460) / (this.deer.height || 320));
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha * 0.9);
    ctx.fillStyle = 'rgba(39, 35, 21, 0.4)';
    ctx.beginPath();
    ctx.ellipse(p[0] - dw * 0.02, p[1] + dh * 0.015, dw * 0.4, Math.max(2.2, dh * 0.05), -0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.deer, p[0] - dw * 0.62, p[1] - dh * 0.98, dw, dh);
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

function smooth(pts) {
  let cur = pts;
  for (let pass = 0; pass < 2; pass += 1) {
    if (cur.length < 3) return cur;
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i += 1) {
      const a = cur[i];
      const b = cur[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

function wobble(pts, amp) {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const prev = pts[i - 1];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const n = Math.sin(i * 1.3) * amp;
    return [p[0] - (dy / len) * n, p[1] + (dx / len) * n];
  });
}

function brush(ctx, pts, color, width, alpha, taper, breaks = false) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 1; i < pts.length; i += 1) {
    if (breaks && i % 3 === 0) continue;
    const t = i / (pts.length - 1);
    const body = 0.42 + 0.58 * Math.sin(Math.PI * Math.min(t * 1.15, 1));
    const grain = 0.72 + 0.28 * Math.sin(i * 1.7);
    const end = taper && t > 0.78 ? (1 - t) / 0.22 : 1;
    const prev = pts[i - 1];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * Math.sin(i * 0.8) * width * 0.08;
    const oy = (dx / len) * Math.sin(i * 0.8) * width * 0.08;
    ctx.beginPath();
    ctx.lineWidth = Math.max(0.6, width * body * grain * end);
    ctx.moveTo(pts[i - 1][0] + ox, pts[i - 1][1] + oy);
    ctx.quadraticCurveTo(
      pts[i - 1][0] + ox,
      pts[i - 1][1] + oy,
      (pts[i - 1][0] + pts[i][0]) / 2 + ox,
      (pts[i - 1][1] + pts[i][1]) / 2 + oy,
    );
    ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    ctx.stroke();
  }
  ctx.restore();
}

function gully(ctx, pts, alpha) {
  // 岩缝：宽、淡、边不齐。alpha 本身只有 0.08，失败三次后才到 0.2。
  brush(ctx, pts, 'rgba(39, 35, 21, 1)', 24, alpha, false);
  brush(ctx, pts, 'rgba(61, 90, 74, 1)', 7, alpha * 0.5, false);
}

function inkWater(ctx, pts, taper) {
  // 石青罩染，墨边，蛤粉只断断续续留在笔腹。
  brush(ctx, pts, 'rgba(36, 78, 112, 1)', 20, 0.22, taper);
  brush(ctx, pts, 'rgba(46, 97, 132, 1)', 9, 0.55, taper);
  brush(ctx, pts, 'rgba(91, 141, 176, 1)', 3.6, 0.78, taper);
  brush(ctx, pts, 'rgba(39, 35, 21, 1)', 1.15, 0.22, taper);
  brush(ctx, pts, 'rgba(241, 234, 219, 1)', 1.05, 0.28, taper, true);
}

function paintPool(ctx, x, y, rx, ry) {
  ctx.save();
  ctx.translate(x, y);
  const blobs = [
    { x: -rx * 0.18, y: ry * 0.05, rx: rx * 0.92, ry: ry * 0.86, rot: -0.35 },
    { x: rx * 0.28, y: ry * 0.12, rx: rx * 0.62, ry: ry * 0.7, rot: 0.4 },
    { x: rx * 0.02, y: -ry * 0.2, rx: rx * 0.48, ry: ry * 0.55, rot: 0.1 },
  ];
  blobs.forEach((blob) => {
    ctx.save();
    ctx.translate(blob.x, blob.y);
    ctx.rotate(blob.rot);
    const g = ctx.createRadialGradient(-blob.rx * 0.2, -blob.ry * 0.3, blob.ry * 0.1, 0, 0, blob.rx);
    g.addColorStop(0, 'rgba(232, 236, 226, 0.55)');
    g.addColorStop(0.45, 'rgba(46, 97, 132, 0.40)');
    g.addColorStop(1, 'rgba(46, 97, 132, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, blob.rx, blob.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.strokeStyle = 'rgba(39, 35, 21, 0.28)';
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.05, ry * 0.08, rx * 0.9, ry * 0.72, -0.2, 0.4, Math.PI * 1.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(rx * 0.16, 0, rx * 0.55, ry * 0.5, 0.5, 2.2, Math.PI * 2.5);
  ctx.stroke();
  ctx.restore();
}
