// src/crossing-curl-physics.js
// 嵌入 CrossingCeremony 类，替代原有的线性弹簧更新与 burstAndReassemble()

export class MineralParticleChoreographer {
  constructor(particleCount, basePositions, baseColors) {
    this.count = particleCount;
    this.homePos = new Float32Array(basePositions); // 原始山脉坐标 (x,y,z)
    this.currPos = new Float32Array(basePositions);
    this.vel = new Float32Array(particleCount * 3);
    this.seed = new Float32Array(particleCount);    // 每颗粒子的独立相位

    for (let i = 0; i < particleCount; i++) {
      this.seed[i] = Math.random();
    }

    this.state = 'IDLE'; // 'IDLE' | 'BURSTING' | 'VORTEX' | 'REASSEMBLING'
    this.timer = 0;
  }

  // 快速 3D 伪旋度场 (Fast 3D Curl-like Flow Field) - 保证 16,000 粒子在 CPU/GPU 60fps 丝滑运行
  _sampleCurlField(x, y, z, time, outVec) {
    const scale = 0.065;
    const px = x * scale, py = y * scale, pz = z * scale;
    const t = time * 1.4;

    // 三个正交相位的涡流分量，模拟北宋长卷中的“卷云皴”气场
    outVec.x = Math.sin(py * 2.1 + t) * Math.cos(pz * 1.7 - t * 0.8)
             - Math.cos(px * 1.5 - py * 1.9);
    outVec.y = Math.sin(pz * 2.3 - t * 0.6) * Math.sin(px * 1.8 + t)
             + 0.35 * Math.cos(px * 2.0 + pz * 2.0);
    outVec.z = Math.cos(px * 1.9 + t * 1.1) * Math.sin(py * 1.6 - t)
             - Math.sin(pz * 1.4 + px * 1.7);
  }

  // 触发好莱坞级【打散 · 丹青化龙 · 落笔重聚】
  triggerBurstAndReassemble(center = { x: 0, y: 4, z: 0 }) {
    this.state = 'BURSTING';
    this.timer = 0;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const dx = this.currPos[i3] - center.x;
      const dy = this.currPos[i3 + 1] - center.y;
      const dz = this.currPos[i3 + 2] - center.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;

      // 径向爆破 + 环绕切向角动量（形成盘旋上升的青绿风暴，而非呆板的球体炸开）
      const radialForce = (18.0 + this.seed[i] * 26.0) / (1.0 + dist * 0.04);
      const swirlForce = 22.0 + (i % 5) * 4.5;

      this.vel[i3]     = (dx / dist) * radialForce - (dz / dist) * swirlForce;
      this.vel[i3 + 1] = Math.abs(dy / dist) * radialForce * 1.35 + 8.0 + this.seed[i] * 12.0;
      this.vel[i3 + 2] = (dz / dist) * radialForce + (dx / dist) * swirlForce;
    }
  }

  update(dt, elapsedTime, positionAttr, colorAttr, camera) {
    const safeDt = Math.min(dt, 0.033);
    this.timer += safeDt;
    const curl = { x: 0, y: 0, z: 0 };

    // 状态机自动推进：0~0.7s 爆破 -> 0.7~2.2s 气旋游龙 -> 2.2~4.5s 挥毫归山
    if (this.state === 'BURSTING' && this.timer > 0.7) {
      this.state = 'VORTEX';
    } else if (this.state === 'VORTEX' && this.timer > 2.2) {
      this.state = 'REASSEMBLING';
    } else if (this.state === 'REASSEMBLING' && this.timer > 4.6) {
      this.state = 'IDLE';
    }

    const posArr = positionAttr.array;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      let px = this.currPos[i3];
      let py = this.currPos[i3 + 1];
      let pz = this.currPos[i3 + 2];

      const hx = this.homePos[i3];
      const hy = this.homePos[i3 + 1];
      const hz = this.homePos[i3 + 2];

      if (this.state === 'BURSTING' || this.state === 'VORTEX') {
        // 采样 Curl Noise 流体场，让石青石绿粒子像画龙一样在空中盘旋
        this._sampleCurlField(px, py, pz, elapsedTime + this.seed[i] * 2.0, curl);
        const curlStrength = this.state === 'VORTEX' ? 42.0 : 18.0;

        // 中心向心引力带（围绕舒啸台王希孟旋转）
        const toCenterX = -px * 0.45;
        const toCenterZ = -pz * 0.45;

        this.vel[i3]     += (curl.x * curlStrength + toCenterX - pz * 0.8) * safeDt;
        this.vel[i3 + 1] += (curl.y * curlStrength * 0.7 + (10.0 - py) * 1.2) * safeDt;
        this.vel[i3 + 2] += (curl.z * curlStrength + toCenterZ + px * 0.8) * safeDt;

        // 空气阻尼
        this.vel[i3]     *= 0.94;
        this.vel[i3 + 1] *= 0.94;
        this.vel[i3 + 2] *= 0.94;

      } else if (this.state === 'REASSEMBLING') {
        // 按横坐标与高度计算【泼墨归位相位延迟】：自左向右、自山脚向峰巅依次落笔凝聚
        const normalizedX = (hx + 60.0) / 120.0; // 假设山体跨度 [-60, 60]
        const waveDelay = Math.max(0, Math.min(1.2, normalizedX * 0.9 + this.seed[i] * 0.3));
        const localT = Math.max(0, this.timer - 2.2 - waveDelay);

        // 非线性高阶吸附刚度 + 旋转收敛
        const stiffness = 6.5 + localT * localT * 28.0;
        const damping = 0.82;

        this.vel[i3]     = (this.vel[i3]     + (hx - px) * stiffness * safeDt) * damping;
        this.vel[i3 + 1] = (this.vel[i3 + 1] + (hy - py) * stiffness * safeDt) * damping;
        this.vel[i3 + 2] = (this.vel[i3 + 2] + (hz - pz) * stiffness * safeDt) * damping;

      } else {
        // IDLE 态：山脉呼吸微动（王希孟笔下江山的灵气脉动）
        const breath = Math.sin(elapsedTime * 1.5 + hx * 0.15 + this.seed[i] * 6.28) * 0.08;
        this.vel[i3]     = (hx - px) * 4.0 * safeDt;
        this.vel[i3 + 1] = ((hy + breath) - py) * 4.0 * safeDt;
        this.vel[i3 + 2] = (hz - pz) * 4.0 * safeDt;
      }

      px += this.vel[i3] * safeDt;
      py += this.vel[i3 + 1] * safeDt;
      pz += this.vel[i3 + 2] * safeDt;

      this.currPos[i3]     = posArr[i3]     = px;
      this.currPos[i3 + 1] = posArr[i3 + 1] = py;
      this.currPos[i3 + 2] = posArr[i3 + 2] = pz;
    }

    positionAttr.needsUpdate = true;

    // 同步相机动态 FOV 呼吸冲击力
    if (camera) {
      let targetFov = 50;
      if (this.state === 'BURSTING') targetFov = 66;
      else if (this.state === 'VORTEX') targetFov = 60;
      camera.fov += (targetFov - camera.fov) * safeDt * 5.0;
      camera.updateProjectionMatrix();
    }
  }
}