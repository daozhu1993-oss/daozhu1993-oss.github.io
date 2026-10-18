import { clamp, worldToScreen } from '../util.js';

/** 画卷上的占位：干瀑、雾、夫诸线稿、远鸟。挑战进行时不画，免得和笔迹叠在一起。 */
export class Overlay {
  constructor() {
    this.time = 0;
    this.birds = [
      { nx: 0.18, y: 0.78, v: 0.012, wing: 0.2 },
      { nx: 0.41, y: 0.84, v: 0.009, wing: 1.4 },
      { nx: 0.63, y: 0.74, v: 0.014, wing: 2.2 },
      { nx: 0.88, y: 0.8, v: 0.01, wing: 0.8 },
    ];
  }

  update(dt) {
    this.time += dt;
    this.birds.forEach((bird) => {
      bird.nx -= bird.v * dt;
      if (bird.nx < -0.02) bird.nx += 1.04;
    });
  }

  draw(ctx, w, h, scene) {
    ctx.clearRect(0, 0, w, h);
    if (!scene || scene.challenge) {
      scene?.challenge?.render(ctx, w, h);
      return;
    }
    const { camera, beast, art, restore, mist, canEnter, woke } = scene;
    if (camera.zoom >= camera.roamZoom() * 0.75) {
      this.birds.forEach((bird) => this._bird(ctx, camera, w, h, bird));
    }
    const fall = this._fallBox(camera, w, h, beast);
    if (mist && !woke) this._mist(ctx, fall);
    const deer = art.residentFrame(this.time);
    if (woke && deer) this._deerAt(ctx, camera, w, h, deer, 0.702, 0.255, 0.92, false);
    else if (canEnter && (art.fenben || art.svg)) {
      const a = 0.42 + Math.sin(this.time * 1.6) * 0.05;
      this._deerAt(ctx, camera, w, h, art.fenben || art.svg, 0.690, 0.575, a, false);
    }
    if (canEnter && !woke) this._glint(ctx, fall);
    if (scene.ink && camera.zoom < camera.roamZoom() * 0.55) this._ink(ctx, camera, w, h, beast);
  }

  hotspot(camera, w, h, beast) {
    const fall = this._fallBox(camera, w, h, beast);
    return { x: fall.cx, y: fall.top + fall.h * 0.18, r: Math.max(48, fall.w * 0.45) };
  }

  _fallBox(camera, w, h, beast) {
    const top = worldToScreen(beast.x * camera.worldW, beast.y + 0.16, camera, w, h);
    const bottom = worldToScreen(beast.x * camera.worldW, beast.y - 0.16, camera, w, h);
    const side = worldToScreen(beast.x * camera.worldW + 0.22, beast.y, camera, w, h);
    const width = Math.abs(side.x - top.x) * 2;
    return {
      cx: top.x,
      top: top.y,
      h: Math.max(24, bottom.y - top.y),
      w: Math.max(18, width),
    };
  }

  _image(ctx, img, fall, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, fall.cx - fall.w / 2, fall.top, fall.w, fall.h);
    ctx.restore();
  }

  _rock(ctx, fall, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(fall.cx, fall.top + fall.h * 0.5);
    const g = ctx.createLinearGradient(0, -fall.h / 2, 0, fall.h / 2);
    g.addColorStop(0, 'rgba(141, 111, 55, 0.02)');
    g.addColorStop(0.4, 'rgba(90, 68, 40, 0.34)');
    g.addColorStop(1, 'rgba(46, 97, 132, 0.08)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, fall.w * 0.42, fall.h * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(39, 35, 21, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -fall.h * 0.42);
    ctx.bezierCurveTo(fall.w * 0.08, -fall.h * 0.1, -fall.w * 0.06, fall.h * 0.1, 0, fall.h * 0.4);
    ctx.moveTo(-fall.w * 0.12, -fall.h * 0.2);
    ctx.lineTo(fall.w * 0.02, fall.h * 0.05);
    ctx.moveTo(fall.w * 0.1, -fall.h * 0.15);
    ctx.lineTo(-fall.w * 0.02, fall.h * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  _falls(ctx, fall, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = '#5B8DB0';
    ctx.lineWidth = Math.max(2, fall.w * 0.06);
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i += 1) {
      const x = fall.cx + i * fall.w * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, fall.top + fall.h * 0.12);
      const wobble = Math.sin(this.time * 2 + i) * fall.w * 0.03;
      ctx.bezierCurveTo(x + wobble, fall.top + fall.h * 0.4, x - wobble, fall.top + fall.h * 0.7, x, fall.top + fall.h * 0.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  _mist(ctx, fall) {
    const y = fall.top + fall.h * 0.82;
    for (let i = 0; i < 3; i += 1) {
      const phase = (this.time * 0.35 + i * 0.33) % 1;
      const alpha = (1 - phase) * 0.45;
      ctx.beginPath();
      ctx.fillStyle = `rgba(241, 234, 219, ${alpha})`;
      ctx.ellipse(fall.cx + (i - 1) * fall.w * 0.12, y - phase * fall.h * 0.35, fall.w * 0.16, fall.h * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 鹿高约占画高 0.05，和卷里的人物同一量级。脚底接在 footY，下面一摊淡墨，不悬空。
   */
  _deerAt(ctx, camera, w, h, img, nx, footY, alpha, bob) {
    if (!img) return;
    const foot = worldToScreen(nx * camera.worldW, footY, camera, w, h);
    const crown = worldToScreen(nx * camera.worldW, footY + 0.046, camera, w, h);
    const dh = Math.max(12, Math.abs(foot.y - crown.y));
    const dw = dh * ((img.width || 420) / (img.height || 320));
    const y = Math.min(foot.y, crown.y) + (bob ? Math.sin(this.time * 1.2) * 1.2 : 0);
    const x = foot.x - dw * 0.55;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha * 0.9);
    ctx.fillStyle = 'rgba(39, 35, 21, 0.38)';
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y + Math.max(1, dh * 0.012), dw * 0.42, Math.max(2.2, dh * 0.045), -0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x, y, dw, dh);
    ctx.restore();
  }

  _glint(ctx, fall) {
    const a = 0.35 + Math.sin(this.time * 4) * 0.35;
    ctx.beginPath();
    ctx.fillStyle = `rgba(241, 234, 219, ${a})`;
    ctx.arc(fall.cx, fall.top + fall.h * 0.16, Math.max(3, fall.w * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }

  _bird(ctx, camera, w, h, bird) {
    const p = worldToScreen(bird.nx * camera.worldW, bird.y, camera, w, h);
    if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) return;
    const flap = Math.sin(this.time * 3 + bird.wing) * 4;
    ctx.strokeStyle = 'rgba(39, 35, 21, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y + flap);
    ctx.quadraticCurveTo(p.x, p.y - 3, p.x + 7, p.y + flap);
    ctx.stroke();
  }

  _ink(ctx, camera, w, h, beast) {
    const p = worldToScreen(beast.x * camera.worldW, beast.y, camera, w, h);
    const breathe = 0.18 + Math.sin(this.time * 1.3) * 0.08;
    const r = Math.min(w, h) * 0.08;
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
    g.addColorStop(0, `rgba(39, 35, 21, ${breathe})`);
    g.addColorStop(1, 'rgba(39, 35, 21, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
