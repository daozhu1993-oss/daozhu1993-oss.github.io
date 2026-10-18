import * as THREE from 'three';
import { clamp, smoothstep } from '../util.js';

/**
 * 沿卷面 x 的一维复原度。0 是褪色，1 是真迹原色。
 * 喂给画卷着色器，不另做贴图资产。
 */
export class Restoration {
  constructor(width = 2048) {
    this.width = width;
    this.data = new Uint8Array(width * 4);
    this.tex = new THREE.DataTexture(this.data, width, 1);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    this.bumps = [];
    this._write();
  }

  sample(nx) {
    const i = clamp(Math.floor(nx * (this.width - 1)), 0, this.width - 1);
    return this.data[i * 4] / 255;
  }

  setBump(id, cx, half, fade, amount) {
    let bump = this.bumps.find((b) => b.id === id);
    if (!bump) {
      bump = { id, cx, half, fade, amount: 0, target: amount };
      this.bumps.push(bump);
    }
    bump.cx = cx;
    bump.half = half;
    bump.fade = fade;
    bump.target = amount;
    if (amount >= 1 && bump.amount === 0) {
      // Immediate restore (a reload) should not replay the bloom.
      bump.amount = 1;
    }
    this._write();
  }

  /** 色归：约 3 秒从藏处向两侧晕开。 */
  animateBump(id, cx, half, fade) {
    let bump = this.bumps.find((b) => b.id === id);
    if (!bump) {
      bump = { id, cx, half, fade, amount: 0, target: 1 };
      this.bumps.push(bump);
    }
    bump.cx = cx;
    bump.half = half;
    bump.fade = fade;
    bump.amount = 0;
    bump.target = 1;
    this._write();
  }

  update(dt) {
    let dirty = false;
    const step = dt / 3;
    this.bumps.forEach((bump) => {
      if (Math.abs(bump.amount - bump.target) < 0.001) return;
      if (bump.amount < bump.target) bump.amount = Math.min(bump.target, bump.amount + step);
      else bump.amount = Math.max(bump.target, bump.amount - step);
      dirty = true;
    });
    if (dirty) this._write();
  }

  _write() {
    const w = this.width;
    for (let i = 0; i < w; i += 1) {
      const x = i / (w - 1);
      let v = 0;
      this.bumps.forEach((bump) => {
        const d = Math.abs(x - bump.cx);
        let t = 1;
        if (d > bump.half) {
          t = 1 - smoothstep(bump.half, bump.half + bump.fade, d);
        }
        v = Math.max(v, t * bump.amount);
      });
      const b = Math.round(clamp(v, 0, 1) * 255);
      const o = i * 4;
      this.data[o] = b;
      this.data[o + 1] = b;
      this.data[o + 2] = b;
      this.data[o + 3] = 255;
    }
    this.tex.needsUpdate = true;
  }
}
