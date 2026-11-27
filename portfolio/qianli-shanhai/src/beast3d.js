/**
 * 《千里江山 · 借笔还魂》工笔金线通灵墨影 3D 立体神兽系统
 * (Northern Song Gongbi Gold-Line Ethereal Ink-Spirit 3D System)
 *
 * 彻底告别粗糙低模拼接！采用高清故宫院体风格工笔重彩泥金透明立绘，
 * 结合多层次 3D 视差平面、古绢微风呼吸着色器、泥金流光描边、太极法阵与永久天地奇观，
 * 让六方《山海经》神兽宛如“从九百年宣和古绢中踏墨走出的通灵神明”。
 */

import * as THREE from 'three';
import { createContactShadow } from './songProps.js';

export class Beast3DManager {
  constructor(scene) {
    this.scene = scene;
    this.beastObjects = {};
    this.particles = [];
    this.miracles = [];
    this.time = 0;
    this.texLoader = new THREE.TextureLoader();
  }

  /**
   * 为指定神兽创建工笔金线通灵墨影 3D 实体
   * @param {Object} beastData beasts.js 配置
   * @param {number} groundY 经 songTerrain 精确计算的真实地表高程（彻底防悬空）
   */
  createBeastMesh(beastData, groundY = null) {
    const root = new THREE.Group();
    root.name = `beast_${beastData.id}`;

    const baseGroundY = groundY !== null ? groundY : beastData.coordinates.y;
    const isFlying = beastData.id === 'qingniao' || beastData.id === 'baize';
    const spawnY = isFlying ? baseGroundY + 2.4 : baseGroundY + 0.15;

    // 同步回写准确 3D 坐标，确保导航司南、传送与唤醒镜头 100% 严丝合缝
    beastData.coordinates.y = spawnY;
    root.position.set(beastData.coordinates.x, spawnY, beastData.coordinates.z);

    // 1. 加载透明底高清北宋工笔泥金神兽立绘
    const texture = this.texLoader.load(`assets/beasts/${beastData.id}.webp`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // 2. 神兽立体化容器 (平滑面向观者，永不扁平穿帮)
    const spiritGroup = new THREE.Group();
    spiritGroup.name = 'beast_gongbi_spirit';

    const spriteSize = beastData.id === 'baize' ? 7.2
      : beastData.id === 'qingniao' ? 6.6
      : beastData.id === 'bo' ? 6.2
      : 5.6;

    const planeGeo = new THREE.PlaneGeometry(spriteSize, spriteSize, 16, 16);

    // 2.1 主体工笔金线通灵着色器 (含古绢呼吸律动 + 泥金描边辉光 + 远景融雾)
    const spiritMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: texture },
        uTime: { value: 0 },
        uAwakenMix: { value: 0.0 },
        uNightMix: { value: 0.0 },
        uGoldColor: { value: new THREE.Color(beastData.goldColor || '#F4D068') },
        uThemeColor: { value: new THREE.Color(beastData.themeColor || '#3CA888') },
        uFogColor: { value: new THREE.Color('#8E7D5B') }
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uAwakenMix;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vUv = uv;
          vec3 pos = position;
          // 活画呼吸微动：上部鬃毛/羽翼/飘带随风轻盈舒展，脚下稳如磐石
          float topWeight = smoothstep(0.08, 0.92, uv.y);
          float amp = 0.08 + uAwakenMix * 0.08;
          pos.x += sin(uTime * 1.8 + uv.y * 4.2) * amp * topWeight;
          pos.z += cos(uTime * 1.5 + uv.x * 3.8 + uv.y * 2.5) * amp * 1.4 * topWeight;

          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        uniform float uTime;
        uniform float uAwakenMix;
        uniform float uNightMix;
        uniform vec3 uGoldColor;
        uniform vec3 uThemeColor;
        uniform vec3 uFogColor;

        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vec4 tex = texture2D(uMap, vUv);
          if (tex.a < 0.03) discard;

          vec3 col = tex.rgb;

          // 检测画中泥金线与高光区域，赋予细腻矿物金箔闪烁
          float isGold = smoothstep(0.45, 0.85, col.r * 0.65 + col.g * 0.45 - col.b * 0.45);
          float shimmer = 0.5 + 0.5 * sin(uTime * 2.8 + vUv.x * 10.0 + vUv.y * 8.0);

          // 沉眠时略带宣纸墨影通透感；唤醒后金碧大盛、神采灼灼
          float dormantFade = mix(0.84, 1.0, uAwakenMix);
          col = mix(col * vec3(0.92, 0.95, 0.94), col * 1.15, uAwakenMix);

          // 泥金流光提亮（夜间更加熠熠生辉）
          col += uGoldColor * isGold * (0.22 + uAwakenMix * 0.48 + uNightMix * 0.35) * (0.65 + 0.35 * shimmer);

          // 边缘外轮廓微弱灵韵辉光
          float edgeAlpha = smoothstep(0.05, 0.55, tex.a) * (1.0 - smoothstep(0.60, 0.95, tex.a));
          col += mix(uThemeColor, uGoldColor, 0.65) * edgeAlpha * (0.55 + uAwakenMix * 0.85);

          // 柔和融入远山云雾
          float dist = length(cameraPosition - vWorldPos);
          float fog = smoothstep(55.0, 210.0, dist);
          col = mix(col, uFogColor, fog * 0.72);

          gl_FragColor = vec4(col, tex.a * dormantFade);
        }
      `
    });

    const mainMesh = new THREE.Mesh(planeGeo, spiritMat);
    mainMesh.position.y = spriteSize * 0.46;
    spiritGroup.add(mainMesh);

    // 2.2 立体墨韵重影层 (3D Depth Echo Layer：错位 0.42m，制造立体通灵层次)
    const echoMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: texture },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(beastData.goldColor || '#F4D068') },
        uOpacity: { value: 0.24 }
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float topWeight = smoothstep(0.08, 0.95, uv.y);
          pos.x += sin(uTime * 1.8 - 0.5 + uv.y * 4.2) * 0.14 * topWeight;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float a = texture2D(uMap, vUv).a;
          if (a < 0.05) discard;
          gl_FragColor = vec4(uColor, a * uOpacity);
        }
      `
    });

    const echoBack = new THREE.Mesh(planeGeo, echoMat);
    echoBack.position.set(0, spriteSize * 0.46, -0.45);
    echoBack.scale.setScalar(1.06);
    spiritGroup.add(echoBack);

    root.add(spiritGroup);

    // 3. 脚下双层逆旋宣和泥金灵阵 (Celestial Mandala)
    const auraGroup = this._createCelestialMandala(beastData.goldColor);
    auraGroup.position.y = isFlying ? -2.2 : 0.05;
    root.add(auraGroup);

    // 4. 贴地柔和墨韵接触阴影 (Grounded Ink Contact Shadow)
    const shadow = createContactShadow(2.8, 2.8, 0.65);
    shadow.position.y = isFlying ? -2.22 : 0.02;
    root.add(shadow);

    // 5. 环绕上升的矿物金粉粒子流
    const auraParticles = this._createSpiritParticles(beastData.goldColor, beastData.themeColor);
    root.add(auraParticles);

    // 6. 神兽灵明点光源
    const light = new THREE.PointLight(new THREE.Color(beastData.goldColor), 2.2, 22, 1.25);
    light.position.set(0, spriteSize * 0.5, 0.5);
    root.add(light);

    root.userData = {
      data: beastData,
      model: spiritGroup,
      spiritMat,
      echoMat,
      aura: auraGroup,
      auraParticles,
      light,
      isAwakened: false,
      awakenMix: 0,
      baseY: spawnY,
      baseGroundY,
      isFlying,
      pulsePhase: Math.random() * Math.PI * 2
    };

    this.scene.add(root);
    this.beastObjects[beastData.id] = root;
    return root;
  }

  _createCelestialMandala(goldHex) {
    const group = new THREE.Group();
    const matOuter = new THREE.MeshBasicMaterial({
      color: new THREE.Color(goldHex || '#F4D068'),
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.55, 48), matOuter);
    outerRing.rotation.x = -Math.PI / 2;
    group.add(outerRing);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(1.55, 1.66, 36),
      matOuter.clone()
    );
    innerRing.material.opacity = 0.28;
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.02;
    group.add(innerRing);

    // 四方泥金篆点
    const dotGeo = new THREE.CircleGeometry(0.14, 12);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dot = new THREE.Mesh(dotGeo, matOuter);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(Math.cos(a) * 2.0, 0.03, Math.sin(a) * 2.0);
      group.add(dot);
    }

    group.userData = { outerRing, innerRing };
    return group;
  }

  _createSpiritParticles(goldHex, themeHex) {
    const count = 42;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const cGold = new THREE.Color(goldHex || '#F4D068');
    const cTheme = new THREE.Color(themeHex || '#3CA888');

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.1 + Math.random() * 2.2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 5.8;
      pos[i * 3 + 2] = Math.sin(a) * r;

      const c = i % 2 === 0 ? cGold : cTheme;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    });
    return new THREE.Points(geo, mat);
  }

  /**
   * 唤醒神兽：触发粒子爆散 + 永久性局部天地奇观
   */
  triggerAwaken(beastId) {
    const root = this.beastObjects[beastId];
    if (!root) return;

    const u = root.userData;
    u.isAwakened = true;
    u.light.intensity = 4.5;
    if (u.echoMat) u.echoMat.uniforms.uOpacity.value = 0.45;

    // 爆发一圈上升的泥金还魂粒子
    this._spawnBurstParticles(root.position, u.data.goldColor);

    // 留下永久性神兽专属局部奇观 (Permanent World Miracle)
    this._spawnPermanentMiracle(root, u.data);
  }

  _spawnBurstParticles(origin, goldHex) {
    const count = 80;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = origin.x + (Math.random() - 0.5) * 1.5;
      pos[i * 3 + 1] = origin.y + 1.5 + Math.random() * 2.5;
      pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 1.5;
      const a = Math.random() * Math.PI * 2;
      const spd = 2.0 + Math.random() * 5.0;
      vel.push(new THREE.Vector3(Math.cos(a) * spd, 2.5 + Math.random() * 5.5, Math.sin(a) * spd));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(goldHex || '#FFE588'),
      size: 0.42,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.particles.push({ mesh: pts, vel, life: 0, maxLife: 3.2 });
  }

  _spawnPermanentMiracle(root, beastData) {
    // 永久悬浮的金色祥云环带 / 专属粒子结界，铭记玩家的“借笔还魂”
    const count = 90;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    const palette = {
      lushu: [0xFF9EB5, 0xFFE28A],     // 桃溪落英纷飞
      fuzhu: [0x74D8E0, 0xFFE57A],     // 飞瀑流金水雾
      dangkang: [0xF5C84C, 0xFFEFA8],  // 麦陇金穗灵尘
      bo: [0x5BA3E0, 0xF2C94C],        // 关隘玄金瑞光
      qingniao: [0x38D4A8, 0xFFF28A],  // 孤刹五色金霞
      baize: [0xFFFFFF, 0xF4D068]      // 水心万象圣辉
    }[beastData.id] || [0xF4D068, 0xFFFFFF];

    const c1 = new THREE.Color(palette[0]);
    const c2 = new THREE.Color(palette[1]);

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3.5 + Math.random() * 11.0;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 9.5;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = i % 2 === 0 ? c1 : c2;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const cloud = new THREE.Points(geo, mat);
    root.add(cloud);
    this.miracles.push({ mesh: cloud, speed: 0.25 + Math.random() * 0.2 });
  }

  /**
   * 同步场景雾色与昼夜混合系数
   */
  syncEnvironment(fogColor, nightMix) {
    Object.values(this.beastObjects).forEach(root => {
      const u = root.userData;
      if (u.spiritMat) {
        u.spiritMat.uniforms.uFogColor.value.copy(fogColor);
        u.spiritMat.uniforms.uNightMix.value = nightMix;
      }
    });
  }

  /**
   * 每帧更新：工笔神兽面向观者平滑转向、悬浮呼吸、法阵旋转与粒子流
   */
  update(dt, time, camera = null) {
    this.time = time;

    Object.values(this.beastObjects).forEach(root => {
      const u = root.userData;

      // 平滑推进唤醒光效权重
      if (u.isAwakened && u.awakenMix < 1.0) {
        u.awakenMix = Math.min(1.0, u.awakenMix + dt * 0.8);
      }

      if (u.spiritMat) {
        u.spiritMat.uniforms.uTime.value = time + u.pulsePhase;
        u.spiritMat.uniforms.uAwakenMix.value = u.awakenMix;
      }
      if (u.echoMat) {
        u.echoMat.uniforms.uTime.value = time + u.pulsePhase;
      }

      // 柱面柔和朝向相机 (仅绕 Y 轴转向，保持工笔立绘端庄挺拔不倾倒)
      if (camera && u.model) {
        const dx = camera.position.x - root.position.x;
        const dz = camera.position.z - root.position.z;
        const targetYaw = Math.atan2(dx, dz);
        u.model.rotation.y = targetYaw;
      }

      // 轻盈神兽浮游呼吸
      const hoverAmp = u.isFlying ? 0.55 : 0.16;
      const hoverSpeed = u.isAwakened ? 2.1 : 1.3;
      if (u.model) {
        u.model.position.y = Math.sin(time * hoverSpeed + u.pulsePhase) * hoverAmp;
      }

      // 脚下泥金法阵逆向缓转
      if (u.aura) {
        u.aura.rotation.y = time * (u.isAwakened ? 0.65 : 0.28);
        if (u.aura.userData.innerRing) {
          u.aura.userData.innerRing.rotation.z = -time * 0.5;
        }
      }

      // 环绕灵尘徐徐上升
      if (u.auraParticles) {
        const pAttr = u.auraParticles.geometry.attributes.position;
        for (let i = 0; i < pAttr.count; i++) {
          let py = pAttr.getY(i) + dt * (u.isAwakened ? 1.4 : 0.65);
          if (py > 6.5) py = 0.2;
          pAttr.setY(i, py);
        }
        pAttr.needsUpdate = true;
        u.auraParticles.rotation.y = time * 0.35;
      }
    });

    // 更新一次性还魂爆发粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const pos = p.mesh.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.setXYZ(
          j,
          pos.getX(j) + p.vel[j].x * dt,
          pos.getY(j) + p.vel[j].y * dt,
          pos.getZ(j) + p.vel[j].z * dt
        );
        p.vel[j].y -= 2.2 * dt;
      }
      pos.needsUpdate = true;
      p.mesh.material.opacity = Math.max(0, 1.0 - p.life / p.maxLife);
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    // 更新唤醒后永久奇观
    this.miracles.forEach(m => {
      m.mesh.rotation.y += dt * m.speed;
    });
  }
}
