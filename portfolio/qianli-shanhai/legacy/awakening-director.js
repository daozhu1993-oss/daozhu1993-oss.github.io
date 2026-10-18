// src/awakening-director.js
import * as THREE from 'three';

export class BeastAwakeningDirector {
  constructor(world3d, uiManager, audioManager) {
    this.world = world3d;
    this.ui = uiManager;
    this.audio = audioManager;
    this.isPlaying = false;

    // 预创建“借笔还魂”天地共鸣泥金水墨扩散光环 (Shockwave Mesh)
    const ringGeo = new THREE.RingGeometry(0.5, 2.2, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.shockwaveMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uProgress: { value: 0 },
        uColorInner: { value: new THREE.Color('#1B5E7B') }, // 石青
        uColorOuter: { value: new THREE.Color('#E6C15A') }  // 泥金
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        uniform vec3 uColorInner;
        uniform vec3 uColorOuter;
        varying vec2 vUv;
        void main() {
          float alpha = (1.0 - uProgress) * sin(vUv.y * 3.14159);
          vec3 col = mix(uColorInner, uColorOuter, vUv.y);
          gl_FragColor = vec4(col, alpha * 0.85);
        }
      `
    });
    this.shockwaveMesh = new THREE.Mesh(ringGeo, this.shockwaveMat);
    this.shockwaveMesh.visible = false;
    this.world.scene.add(this.shockwaveMesh);
  }

  /**
   * 触发神兽唤醒电影级演出
   * @param {THREE.Object3D} beastMesh 神兽 3D 节点
   * @param {Object} beastData src/beasts.js 中的神兽配置
   * @param {Function} onShowSketch 演出高潮结束、弹出画札并盖印的回调
   */
  playAwakeningSequence(beastMesh, beastData, onShowSketch) {
    if (this.isPlaying) return;
    this.isPlaying = true;

    const cam = this.world.camera;
    const startCamPos = cam.position.clone();
    const startFov = cam.fov;
    const beastPos = beastMesh.position.clone();
    const baseBeastY = beastPos.y;

    // 1. 开启上下电影宽银幕黑边（可通过 CSS class 控制）
    document.body.classList.add('cinematic-letterbox-active');

    // 2. 触发古琴泛音蓄力音阶
    if (this.audio?.playGuqinHarmonicChord) {
      this.audio.playGuqinHarmonicChord(beastData.id);
    }

    // 3. 激活地面泥金石青共鸣扩散波
    this.shockwaveMesh.position.set(beastPos.x, baseBeastY + 0.15, beastPos.z);
    this.shockwaveMesh.scale.setScalar(1);
    this.shockwaveMesh.visible = true;

    // 4. 根据神兽属性触发专属【天地异象】
    this._triggerCelestialPhenomenon(beastData.id);

    let elapsed = 0;
    const totalDuration = 2.8; // 2.8 秒高潮运镜

    // 接管 World3D 相机更新钩子
    this.world.customCameraController = (dt) => {
      elapsed += Math.min(dt, 0.05);
      const t = Math.min(elapsed / totalDuration, 1.0);

      // 分段缓动：前 35% 急速推近蓄力，中间 45% 慢镜头环绕仰视神兽腾空，最后 20% 定格成画
      let camEase = t < 0.35
        ? (t / 0.35) * (t / 0.35) * 0.4
        : 0.4 + (1 - Math.pow(1 - (t - 0.35) / 0.65, 3)) * 0.6;

      // 对数螺旋环绕轨道：从玩家当前视角丝滑切入神兽斜前方仰视机位
      const orbitAngle = camEase * Math.PI * 0.55;
      const radius = THREE.MathUtils.lerp(9.5, 4.2, camEase);
      const idealPos = new THREE.Vector3(
        beastPos.x + Math.sin(orbitAngle) * radius,
        baseBeastY + THREE.MathUtils.lerp(2.6, 1.1, Math.sin(t * Math.PI)), // 先俯后仰，凸显神兽威仪
        beastPos.z + Math.cos(orbitAngle) * radius
      );

      cam.position.lerpVectors(startCamPos, idealPos, Math.min(t * 2.5, 1.0));

      // 镜头微震（1.1s 破封瞬间产生天地共鸣震感）
      const shake = (t > 0.35 && t < 0.55) ? Math.sin(t * 180.0) * 0.06 : 0;
      const lookTarget = new THREE.Vector3(
        beastPos.x + shake,
        beastMesh.position.y + 1.0 + shake,
        beastPos.z
      );
      cam.lookAt(lookTarget);

      // 希区柯克变焦感 (Dolly Zoom)：拉近同时微调 FOV
      cam.fov = startFov + Math.sin(t * Math.PI) * -8.0;
      cam.updateProjectionMatrix();

      // 神兽本体腾跃、舒展与灵光迸发
      const leapCurve = Math.sin(Math.pow(t, 0.7) * Math.PI);
      beastMesh.position.y = baseBeastY + leapCurve * 2.2;
      beastMesh.rotation.y += dt * (1.5 + leapCurve * 4.5);

      // 泥金冲击波扩散至百米山河
      const waveT = Math.max(0, (t - 0.25) / 0.75);
      if (waveT > 0) {
        const scale = 1.0 + Math.pow(waveT, 0.6) * 85.0;
        this.shockwaveMesh.scale.setScalar(scale);
        this.shockwaveMat.uniforms.uProgress.value = waveT;
      }

      // 演出完成：解除相机接管，展开《山海经》画札并执行朱砂落印
      if (t >= 1.0) {
        this.shockwaveMesh.visible = false;
        beastMesh.position.y = baseBeastY;
        cam.fov = startFov;
        cam.updateProjectionMatrix();
        this.world.customCameraController = null;
        document.body.classList.remove('cinematic-letterbox-active');
        this.isPlaying = false;

        if (onShowSketch) onShowSketch(beastData);
      }
    };
  }

  // 六方神兽专属天地异象联动
  _triggerCelestialPhenomenon(beastId) {
    switch (beastId) {
      case 'lushu':    // 01 桃溪浅滩 · 鹿蜀 -> 漫山春桃飞舞
        this.world.setSeason?.('spring');
        break;
      case 'fuzhu':    // 02 飞瀑幽涧 · 夫诸 -> 水漫清溪，天降甘霖时雨
        this.world.setWeather?.('rain');
        break;
      case 'dangkang': // 03 麦陇晚烟 · 当康 -> 岁稔丰年，秋色镀金
        this.world.setSeason?.('autumn');
        break;
      case 'bo':       // 04 关隘长桥 · 驳   -> 幽夜惊雷，千桥万户渔火齐明
        this.world.setNight?.(true);
        break;
      case 'qingniao': // 05 孤刹悬云 · 青鸟 -> 盛夏叠翠，云开见日
        this.world.setWeather?.('clear');
        this.world.setSeason?.('summer');
        break;
      case 'baize':    // 06 水心高阁 · 白泽 -> 瑞雪千峰，乾坤澄明
        this.world.setSeason?.('winter');
        break;
    }
  }
}