/**
 * 《千里江山 · 借笔还魂》四幕电影级“借笔点睛”神兽唤醒导演控制器
 * (Cinematic 4-Act Interactive Brush-Connect Awakening Director)
 *
 * 彻底升级：从“按 E 看转圈”升维为真正有身体参与感的“借希孟之笔 · 一笔点睛还魂”！
 * 第一幕（凝神, 0.0~0.75s）：开启宋锦宽银幕黑边，镜头丝滑俯冲至工笔神兽正前方仰角特写；
 * 第二幕（借笔点睛 · 互动连星）：
 *   - 展开透明宣纸狼毫画布，浮现 3 枚宣和泥金灵枢星点；
 *   - 玩家用鼠标或手指一笔划过（或依次点击）连接三星，拉出动态笔锋金墨轨迹并触发古琴宫商角轮指；
 * 第三幕（破封 · 天地异象, 1.8s）：
 *   - 三星贯通，85m 石青泥金冲击波席卷山河，神兽金光大盛，激活永久局部奇观；
 * 第四幕（落款成札）：
 *   - 展开嵌有高清工笔立绘的《山海经》画札，【希孟亲历】朱砂印重力砸落！
 */

import * as THREE from 'three';

export class BeastAwakeningDirector {
  constructor(world3d, uiManager, audioManager) {
    this.world = world3d;
    this.ui = uiManager;
    this.audio = audioManager;
    this.isPlaying = false;

    // 地面石青+泥金水墨冲击波
    const ringGeo = new THREE.RingGeometry(0.6, 2.5, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.shockwaveMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uProgress: { value: 0 },
        uColorInner: { value: new THREE.Color('#1B627E') },
        uColorOuter: { value: new THREE.Color('#F2CE68') }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uProgress;
        uniform vec3 uColorInner;
        uniform vec3 uColorOuter;
        varying vec2 vUv;
        void main() {
          float alpha = (1.0 - uProgress) * sin(vUv.y * 3.14159);
          vec3 col = mix(uColorInner, uColorOuter, vUv.y);
          gl_FragColor = vec4(col, alpha * 0.88);
        }
      `
    });
    this.shockwaveMesh = new THREE.Mesh(ringGeo, this.shockwaveMat);
    this.shockwaveMesh.visible = false;
    this.world.scene.add(this.shockwaveMesh);
  }

  /**
   * 触发四幕“借笔点睛”神兽唤醒演出
   */
  playAwakeningSequence(beastMesh, beastData, onShowSketch) {
    if (this.isPlaying) return;
    this.isPlaying = true;

    const cam = this.world.camera;
    const startCamPos = cam.position.clone();
    const startFov = cam.fov;
    const beastPos = beastMesh.position.clone();
    const baseBeastY = beastPos.y;

    // 计算神兽正前方的极佳仰角特写机位（取玩家当前朝向方向 9.2m 处，避免穿进山体）
    const toPlayer = new THREE.Vector3(
      startCamPos.x - beastPos.x,
      0,
      startCamPos.z - beastPos.z
    );
    if (toPlayer.lengthSq() < 0.1) toPlayer.set(0, 0, 1);
    toPlayer.normalize();

    const focusCamPos = new THREE.Vector3(
      beastPos.x + toPlayer.x * 8.6,
      Math.max(baseBeastY + 2.5, this.world._calculateTerrainHeight(beastPos.x + toPlayer.x * 8.6, beastPos.z + toPlayer.z * 8.6) + 1.8),
      beastPos.z + toPlayer.z * 8.6
    );
    const focusLookTarget = new THREE.Vector3(beastPos.x, baseBeastY + 2.8, beastPos.z);

    // 开启电影宽银幕黑边
    document.body.classList.add('cinematic-letterbox-active');
    if (this.audio?.playGuqinPluck) {
      this.audio.playGuqinPluck(261.63, 4.0);
    }

    let phase = 'approach'; // 'approach' -> 'brush' -> 'climax'
    let elapsed = 0;
    const approachDuration = 0.78;
    const climaxDuration = 1.85;
    let brushOverlayStarted = false;

    this.world.customCameraController = (dt) => {
      const safeDt = Math.min(dt, 0.05);

      if (phase === 'approach') {
        elapsed += safeDt;
        const t = Math.min(elapsed / approachDuration, 1.0);
        const ease = 1 - Math.pow(1 - t, 3);

        cam.position.lerpVectors(startCamPos, focusCamPos, ease);
        cam.fov = THREE.MathUtils.lerp(startFov, 54, ease);
        cam.updateProjectionMatrix();
        cam.lookAt(focusLookTarget);

        if (t >= 1.0) {
          phase = 'brush';
          elapsed = 0;
        }
      } else if (phase === 'brush') {
        // 极其轻缓的呼吸环绕，等待玩家完成“一笔连星点睛”
        elapsed += safeDt;
        const swayAngle = Math.sin(elapsed * 0.75) * 0.10;
        const orbitDir = toPlayer.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), swayAngle);
        cam.position.set(
          beastPos.x + orbitDir.x * 8.6,
          focusCamPos.y + Math.sin(elapsed * 1.1) * 0.15,
          beastPos.z + orbitDir.z * 8.6
        );
        cam.lookAt(focusLookTarget);

        if (!brushOverlayStarted) {
          brushOverlayStarted = true;
          this._launchBrushConnectCanvas(beastData, () => {
            // 玩家完成一笔连星！立即转入第三幕：破封 · 天地异象
            phase = 'climax';
            elapsed = 0;
            this._startClimaxEffects(beastMesh, beastData, baseBeastY);
          });
        }
      } else if (phase === 'climax') {
        elapsed += safeDt;
        const t = Math.min(elapsed / climaxDuration, 1.0);
        const ease = 1 - Math.pow(1 - t, 3);

        // 镜头螺旋推升展开，气势磅礴
        const orbitAngle = ease * Math.PI * 0.35;
        const radius = THREE.MathUtils.lerp(8.6, 11.2, ease);
        const dir = toPlayer.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitAngle);

        // 破封瞬间轻度天地共鸣微震
        const shake = (t < 0.38) ? Math.sin(t * 160.0) * 0.08 * (1 - t / 0.38) : 0;

        cam.position.set(
          beastPos.x + dir.x * radius + shake,
          focusCamPos.y + Math.sin(t * Math.PI) * 1.6 + shake,
          beastPos.z + dir.z * radius
        );
        cam.fov = THREE.MathUtils.lerp(54, startFov + 4, ease);
        cam.updateProjectionMatrix();
        cam.lookAt(beastPos.x, baseBeastY + 3.0 + Math.sin(t * Math.PI) * 0.8, beastPos.z);

        // 泥金水墨冲击环扩散至百米山河
        const scale = 1.0 + Math.pow(t, 0.55) * 85.0;
        this.shockwaveMesh.scale.setScalar(scale);
        this.shockwaveMat.uniforms.uProgress.value = t;

        if (t >= 1.0) {
          this.shockwaveMesh.visible = false;
          cam.fov = startFov;
          cam.updateProjectionMatrix();
          this.world.customCameraController = null;
          document.body.classList.remove('cinematic-letterbox-active');
          this.isPlaying = false;

          if (onShowSketch) onShowSketch(beastData);
        }
      }
    };
  }

  /**
   * 第二幕核心交互：全屏透明宣纸狼毫画布 · 一笔连星点睛
   */
  _launchBrushConnectCanvas(beastData, onComplete) {
    const existing = document.getElementById('brush-awakening-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'brush-awakening-overlay';
    overlay.className = 'brush-awakening-overlay';
    overlay.innerHTML = `
      <div class="brush-guide-banner">
        <span class="brush-kicker">借希孟之笔 · 点睛还魂</span>
        <h3 class="brush-title">一笔划过三枚灵枢星点，唤醒「${beastData.name}」</h3>
        <p class="brush-sub">按住鼠标或手指连线（亦可依次轻触星点）</p>
      </div>
      <canvas id="brush-ink-canvas"></canvas>
      <button type="button" class="brush-skip-btn" id="brushQuickBtn">落笔直唤 ↗</button>
    `;
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector('#brush-ink-canvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.scale(dpr, dpr);

    // 在屏幕中央神兽周身分布 3 枚黄金三角灵枢星点（各神兽构图略有韵致变化）
    const cx = W * 0.5;
    const cy = H * 0.5;
    const spread = Math.min(W, H) * 0.17;
    const stars = [
      { x: cx - spread * 0.95, y: cy + spread * 0.45, label: '壹', lit: false, pulse: 0 },
      { x: cx,                 y: cy - spread * 0.85, label: '贰', lit: false, pulse: 0 },
      { x: cx + spread * 0.95, y: cy + spread * 0.35, label: '叁', lit: false, pulse: 0 }
    ];

    const strokes = []; // { x, y, life, size }
    const sparks = [];  // 金粉微粒
    let isDrawing = false;
    let litCount = 0;
    let finished = false;
    let rafId = null;

    const completeNow = () => {
      if (finished) return;
      finished = true;
      stars.forEach(s => { s.lit = true; });
      overlay.classList.add('brush-completed');
      setTimeout(() => {
        if (rafId) cancelAnimationFrame(rafId);
        overlay.remove();
        onComplete();
      }, 420);
    };

    const spawnSparks = (x, y, count = 18) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 4.5;
        sparks.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 1.2,
          life: 1.0,
          r: 1.8 + Math.random() * 2.8
        });
      }
    };

    const checkPoint = (x, y) => {
      if (finished) return;
      strokes.push({ x, y, life: 1.0, size: 7 + Math.random() * 4 });
      if (Math.random() < 0.45) spawnSparks(x, y, 2);

      // 检测是否触碰任意未点亮的灵枢星点（宽松 52px 容错半径，手柄/触控极易命中）
      stars.forEach((star) => {
        if (!star.lit && Math.hypot(x - star.x, y - star.y) < 56) {
          star.lit = true;
          star.pulse = 1.0;
          litCount += 1;
          spawnSparks(star.x, star.y, 26);
          if (this.audio?.playBrushStarNote) {
            this.audio.playBrushStarNote(litCount - 1);
          }
          if (litCount >= stars.length) {
            completeNow();
          }
        }
      });
    };

    const getPos = (e) => {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    };

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      isDrawing = true;
      const p = getPos(e);
      checkPoint(p.x, p.y);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      const p = getPos(e);
      checkPoint(p.x, p.y);
    });
    window.addEventListener('pointerup', () => { isDrawing = false; });

    overlay.querySelector('#brushQuickBtn').addEventListener('click', () => {
      if (this.audio?.playBrushStarNote) this.audio.playBrushStarNote(2);
      completeNow();
    });

    // 绘制宣和泥金狼毫轨迹与灵枢星点
    let t = 0;
    const renderCanvas = () => {
      t += 0.032;
      ctx.clearRect(0, 0, W, H);

      // 1. 淡淡的虚线引导轨迹（连接三枚灵枢星点）
      ctx.save();
      ctx.setLineDash([7, 9]);
      ctx.lineDashOffset = -t * 18;
      ctx.strokeStyle = 'rgba(244, 208, 104, 0.36)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(stars[0].x, stars[0].y);
      ctx.quadraticCurveTo(cx - spread * 0.55, cy - spread * 0.45, stars[1].x, stars[1].y);
      ctx.quadraticCurveTo(cx + spread * 0.55, cy - spread * 0.45, stars[2].x, stars[2].y);
      ctx.stroke();
      ctx.restore();

      // 2. 狼毫金色墨迹笔触
      if (strokes.length > 1) {
        for (let i = 1; i < strokes.length; i++) {
          const p0 = strokes[i - 1];
          const p1 = strokes[i];
          if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 90) continue;
          ctx.strokeStyle = `rgba(248, 214, 112, ${p1.life * 0.9})`;
          ctx.lineWidth = p1.size * p1.life;
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(244, 198, 72, 0.85)';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      for (let i = strokes.length - 1; i >= 0; i--) {
        strokes[i].life -= 0.016;
        if (strokes[i].life <= 0) strokes.splice(i, 1);
      }

      // 3. 绘制三枚宣和泥金灵枢星点
      stars.forEach((s, idx) => {
        const breathe = 1.0 + Math.sin(t * 2.8 + idx * 1.4) * 0.14;
        const outerR = (s.lit ? 32 : 24) * breathe;

        // 外光环
        const grad = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, outerR * 1.6);
        grad.addColorStop(0, s.lit ? 'rgba(255, 240, 175, 0.95)' : 'rgba(244, 208, 104, 0.65)');
        grad.addColorStop(0.5, s.lit ? 'rgba(235, 175, 58, 0.48)' : 'rgba(28, 128, 128, 0.28)');
        grad.addColorStop(1, 'rgba(244, 208, 104, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, outerR * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // 泥金圆环
        ctx.strokeStyle = s.lit ? '#FFF5CC' : '#F4D068';
        ctx.lineWidth = s.lit ? 3 : 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, outerR * 0.72, 0, Math.PI * 2);
        ctx.stroke();

        // 篆字序号
        ctx.fillStyle = s.lit ? '#2B1D0E' : '#FFF8E4';
        ctx.font = 'bold 16px "Noto Serif SC", "STKaiti", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.lit ? '灵' : s.label, s.x, s.y);
      });

      // 4. 飞溅金粉微粒
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.06;
        sp.life -= 0.024;
        if (sp.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(255, 224, 130, ${sp.life})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r * sp.life, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(renderCanvas);
    };
    renderCanvas();
  }

  _startClimaxEffects(beastMesh, beastData, baseBeastY) {
    // 古琴轮指与编钟天籁齐鸣
    if (this.audio?.playGuqinHarmonicChord) {
      this.audio.playGuqinHarmonicChord(beastData.id);
    }

    // 触发神兽本体蜕变与永久局部奇观
    if (this.world.beastManager) {
      this.world.beastManager.triggerAwaken(beastData.id);
    }

    // 激活 85m 石青泥金冲击波
    this.shockwaveMesh.position.set(beastMesh.position.x, baseBeastY + 0.3, beastMesh.position.z);
    this.shockwaveMesh.scale.setScalar(1);
    this.shockwaveMesh.visible = true;
    this.shockwaveMat.uniforms.uProgress.value = 0;

    // 触发六兽专属气候/气象共振
    this._triggerCelestialPhenomenon(beastData.id);
  }

  _triggerCelestialPhenomenon(beastId) {
    switch (beastId) {
      case 'lushu':
        this.world.setSeason?.('spring');
        break;
      case 'fuzhu':
        this.world.setWeather?.('rain');
        if (this.world.waterfallObj?.userData?.shaderMat) {
          this.world.waterfallObj.userData.shaderMat.uniforms.uGoldBoost.value = 0.85;
        }
        break;
      case 'dangkang':
        this.world.setSeason?.('autumn');
        break;
      case 'bo':
        this.world.setNight?.(true);
        break;
      case 'qingniao':
        this.world.setWeather?.('clear');
        this.world.setSeason?.('summer');
        break;
      case 'baize':
        this.world.setSeason?.('winter');
        break;
    }
  }
}
