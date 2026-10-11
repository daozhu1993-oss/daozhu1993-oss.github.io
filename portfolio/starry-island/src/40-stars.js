// 40-stars.js — 《星月孤岛：梵高的11次凝望》核心星核搜寻与世界联动系统
// 替换原版的找猫模块。在小镇与田野中寻找散落的 11 颗星辰余烬。
// 每找到并点燃一颗星核：
// 1. 星核爆发出璀璨光柱直冲云霄；
// 2. 唤醒对应梵高书信与岛主哲思的箴言诗笺；
// 3. 天空中对应的旋转星涡被彻底点亮并加速流转；
// 4. 小镇的一扇农舍小窗透出温暖的铬黄色灯火；
// 5. 11 颗星辰全部点亮时，触发终局星海狂澜与典藏藏书票生成。

import * as THREE from 'three';

let SN = null;

// 11 颗星核的专属文化设定、藏匿点及对应的哲思箴言
export const STAR_LORE = [
  {
    id: 0,
    numeral: 'Ⅰ',
    name: '根系之火',
    place: '圣雷米高耸柏树之基',
    anchor: 'ls-cypress-base',
    quote: '在这个世界上，唯有爱与艺术能穿透重重黑夜。',
    author: '—— 文森特·梵高 致提奥，1889',
    skyStarIndex: 0
  },
  {
    id: 1,
    numeral: 'Ⅱ',
    name: '启程之路',
    place: '画家山坡古老盘石之上',
    anchor: 'ls-rock-road',
    quote: '我宁愿死于激情，也不愿死于平庸与无聊。',
    author: '—— 文森特·梵高 致提奥，1884',
    skyStarIndex: 1
  },
  {
    id: 2,
    numeral: 'Ⅲ',
    name: '静默之泉',
    place: '广场古老水井石沿',
    anchor: 'town-well-rim',
    quote: '水井很深，但每一滴舀上来的水，都映着整个苍穹。',
    author: '—— 岛主手记 · 圣雷米夜泉',
    skyStarIndex: 2
  },
  {
    id: 3,
    numeral: 'Ⅳ',
    name: '尘世微光',
    place: '村心广场木椅之角',
    anchor: 'town-bench-square',
    quote: '每个人心里都有一团火，路过的人只看到烟。',
    author: '—— 文森特·梵高 致提奥，1880',
    skyStarIndex: 3
  },
  {
    id: 4,
    numeral: 'Ⅴ',
    name: '丰饶之种',
    place: '东侧金黄麦田草垛之上',
    anchor: 'ls-haystack-east',
    quote: '纵使生活布满荆棘与尘埃，我也要在泥泞里开出向日葵。',
    author: '—— 文森特·梵高 致提奥，1888',
    skyStarIndex: 4
  },
  {
    id: 5,
    numeral: 'Ⅵ',
    name: '苦修之枝',
    place: '东山橄榄树桠之巅',
    anchor: 'ls-olive-east',
    quote: '我的画从不追求迎合世界，它只求向着真实的灵魂狂奔。',
    author: '—— 文森特·梵高 致提奥，1889',
    skyStarIndex: 5
  },
  {
    id: 6,
    numeral: 'Ⅶ',
    name: '凡尘余温',
    place: '村舍屋脊红砖烟囱旁',
    anchor: 'town-chimney-5',
    quote: '别害怕黑暗，最明亮的星星，往往在最深沉的夜里苏醒。',
    author: '—— 岛主手记 · 圣雷米屋脊',
    skyStarIndex: 6
  },
  {
    id: 7,
    numeral: 'Ⅷ',
    name: '祈愿之阶',
    place: '古老圣雷米教堂台阶',
    anchor: 'town-church-steps',
    quote: '在所有漂泊的归宿里，教堂的尖顶最接近神明的叹息。',
    author: '—— 文森特·梵高 致提奥，1889',
    skyStarIndex: 7
  },
  {
    id: 8,
    numeral: 'Ⅸ',
    name: '守望之烛',
    place: '进村转角铁艺街灯之侧',
    anchor: 'town-lamp-road',
    quote: '只要街角还有一盏孤灯亮着，夜游的人就永不迷失。',
    author: '—— 岛主手记 · 守望之烛',
    skyStarIndex: 8
  },
  {
    id: 9,
    numeral: 'Ⅹ',
    name: '回响之廊',
    place: '幽深南巷拐角石阶处',
    anchor: 'town-landing-18',
    quote: '哪怕我们是一座座孤岛，眼中的星光也让彼此在此刻相连。',
    author: '—— 岛主手记 · 孤岛回响',
    skyStarIndex: 9
  },
  {
    id: 10,
    numeral: 'Ⅺ',
    name: '觉醒之眼',
    place: '面朝广场的轩窗前',
    anchor: 'town-sill-0-3',
    quote: '看着星空总让我做梦——终有一天，我们会乘着光芒抵达永恒。',
    author: '—— 文森特·梵高 致提奥，1889',
    skyStarIndex: 10
  }
];

(window.SN_MODULES ||= []).push({
  name: 'stars',
  level: 'starry-night',
  order: 40,
  async build(sn) {
    SN = sn;
    const { scene, camera } = SN;

    const starsGroup = new THREE.Group();
    starsGroup.name = 'star-cores';
    scene.add(starsGroup);

    // 点燃时的升腾光束群组与小镇新增暖光群组
    const fxGroup = new THREE.Group();
    fxGroup.name = 'star-fx';
    scene.add(fxGroup);

    const starInstances = [];
    const foundSet = new Set();
    let audioCtx = null;

    // ------------------------------------------------------------ WebAudio 纯程序化星音合成器
    function getAudioCtx() {
      if (!audioCtx) {
        audioCtx = SN.audio?.ctx || new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    }

    // 靠近星核时的空灵风铃共鸣（根据距离和方位调制）
    let lastChimeTime = 0;
    function playProximityChime(distance) {
      const now = performance.now();
      if (now - lastChimeTime < 2400) return;
      lastChimeTime = now;

      const ctx = getAudioCtx();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // 五度/纯八度和音
      const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[Math.floor(Math.random() * freqs.length)], t0);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2400, t0);

      const vol = Math.max(0.04, Math.min(0.22, (15 - distance) / 15 * 0.22));
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t0);
      osc.stop(t0 + 1.9);
    }

    // 点燃星核时的壮丽 Lydian 圣咏五度和弦 + 升腾音
    function playIgniteChord() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const t0 = ctx.currentTime;

      // 宏大的水晶和弦 [C5, G5, D6, E6, B6]
      const chord = [523.25, 783.99, 1174.66, 1318.51, 1975.53];
      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0 + idx * 0.08);

        const v = 0.15 / (idx + 1);
        gain.gain.setValueAtTime(0, t0 + idx * 0.08);
        gain.gain.linearRampToValueAtTime(v, t0 + idx * 0.08 + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + idx * 0.08 + 3.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0 + idx * 0.08);
        osc.stop(t0 + idx * 0.08 + 3.3);
      });

      // 深沉的大地低音共鸣
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(130.81, t0); // C3
      sub.frequency.exponentialRampToValueAtTime(65.41, t0 + 2.5); // C2

      subGain.gain.setValueAtTime(0, t0);
      subGain.gain.linearRampToValueAtTime(0.25, t0 + 0.15);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.0);

      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(t0);
      sub.stop(t0 + 3.1);
    }

    // ------------------------------------------------------------ 3D 星核程序化模型建造器
    function createStarCoreMesh(lore, index) {
      const root = new THREE.Group();
      root.name = `star-core-${index}`;

      // 1. 核心发光球体（Alpha=0.5 触发油画后处理着色器的辉光遮罩）
      const coreGeo = new THREE.SphereGeometry(0.24, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xfff6c2),
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      // 写入 mask = 0.5 (alpha=0.5) 供给 50-post.js 后处理
      coreMat.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace(
          'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
          'gl_FragColor = vec4( outgoingLight, 0.5 );'
        );
      };
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      root.add(coreMesh);

      // 2. 双天体旋转轨道光环 (Celestial Orbital Rings)
      const ring1Geo = new THREE.TorusGeometry(0.42, 0.016, 10, 48);
      const ring1Mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xf6d354),
        wireframe: false,
        transparent: true,
        opacity: 0.8
      });
      const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
      ring1.rotation.x = Math.PI / 4;
      root.add(ring1);

      const ring2Geo = new THREE.TorusGeometry(0.56, 0.012, 10, 48);
      const ring2Mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x9ae6f7),
        wireframe: false,
        transparent: true,
        opacity: 0.65
      });
      const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
      ring2.rotation.y = Math.PI / 3;
      ring2.rotation.x = -Math.PI / 6;
      root.add(ring2);

      // 3. 星核外围微粒光团
      const haloGeo = new THREE.SphereGeometry(0.72, 12, 12);
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xfadb5f),
        wireframe: true,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      root.add(haloMesh);

      // 4. 拾取检测碰撞球 (Hit sphere)
      const hitGeo = new THREE.SphereGeometry(1.2, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.userData = { starIndex: index, lore };
      root.add(hitMesh);

      // 局部点光源
      const light = new THREE.PointLight(0xffdf6d, 1.2, 12);
      root.add(light);

      return {
        root,
        coreMesh,
        ring1,
        ring2,
        haloMesh,
        hitMesh,
        light,
        lore,
        index,
        ignited: false,
        basePos: new THREE.Vector3(),
        phase: Math.random() * Math.PI * 2
      };
    }

    // ------------------------------------------------------------ 放置 11 颗星核到场景
    function placeStars() {
      const anchors = SN.world.anchors || [];

      STAR_LORE.forEach((lore, i) => {
        const star = createStarCoreMesh(lore, i);
        const anchor = anchors.find(a => a.id === lore.anchor);

        if (anchor && anchor.pos) {
          // 悬浮在锚点上方约 0.45 米处
          star.basePos.copy(anchor.pos).add(new THREE.Vector3(0, 0.45, 0));
        } else {
          // 如果未找到特定锚点，放置于安全备选点位
          console.warn(`[stars] anchor "${lore.anchor}" not found, using fallback spot`);
          const fallbackAngles = (i / 11) * Math.PI * 2;
          star.basePos.set(Math.cos(fallbackAngles) * 16, 2.5, Math.sin(fallbackAngles) * 16);
        }

        star.root.position.copy(star.basePos);
        starsGroup.add(star.root);
        starInstances.push(star);
      });

      console.info(`[stars] 11 celestial star cores placed across Saint-Rémy.`);
    }

    placeStars();

    // ------------------------------------------------------------ 点燃星核时的全场景联动
    function igniteStar(star) {
      if (star.ignited) return;
      star.ignited = true;
      foundSet.add(star.index);

      // 1. 播放宏伟和弦
      playIgniteChord();

      // 2. 升腾光柱特效
      const beamGeo = new THREE.CylinderGeometry(0.08, 0.6, 90, 16);
      const beamMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xfff7c2),
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.copy(star.root.position).add(new THREE.Vector3(0, 45, 0));
      fxGroup.add(beam);

      // 光柱升腾消散动画
      let beamAge = 0, beamDone = false;
      SN.onUpdate((dt) => {
        if (beamDone) return;
        beamAge += dt;
        beam.scale.x = 1.0 + beamAge * 2.5;
        beam.scale.z = 1.0 + beamAge * 2.5;
        beamMat.opacity = Math.max(0, 0.9 - beamAge * 0.45);
        if (beamAge >= 2.0) {
          beamDone = true;
          fxGroup.remove(beam);
          beamGeo.dispose();
          beamMat.dispose();
        }
      });

      // 3. 隐藏该地面星核或变为常驻微弱光芒
      star.coreMesh.material.opacity = 0.25;
      star.haloMesh.visible = false;
      star.light.intensity = 0.4;

      // 4. 小镇对应位置点亮一扇金黄暖窗光
      const windowGlow = new THREE.PointLight(0xf2a926, 3.5, 20);
      windowGlow.position.copy(star.root.position).add(new THREE.Vector3(0, 1.2, 0));
      fxGroup.add(windowGlow);

      // 5. 天空模块联动（点亮天空中对应的星辰）
      try {
        const skyMod = SN.modules.sky;
        if (skyMod && skyMod.stars) {
          // 放大并激化天空中对应星辰的光芒与旋转速度
          const targetSkyStar = skyMod.stars[star.lore.skyStarIndex];
          if (targetSkyStar) {
            targetSkyStar.halo = (targetSkyStar.halo || 0.05) * 1.6;
            targetSkyStar.ignited = true;
          }
        }
      } catch (e) {
        console.warn('[stars] sky coupling error:', e);
      }

      // 6. 广播事件给 UI 展示专属箴言与进度
      SN.emit('starFound', {
        star,
        lore: star.lore,
        foundCount: foundSet.size,
        total: STAR_LORE.length,
        allFound: foundSet.size >= STAR_LORE.length
      });

      // 7. 若 11 颗全部找到，触发终局全场景星海沸腾
      if (foundSet.size >= STAR_LORE.length) {
        console.info('[stars] All 11 stars ignited! The Starry Night is reborn.');
        triggerGrandFinale();
      }
    }

    // 终局庆典：全天空星涡加速流转，华丽钟鸣
    function triggerGrandFinale() {
      SN.emit('allStarsFound', {
        quotes: STAR_LORE,
        elapsed: SN.game?.elapsed || 0
      });

      // 加速天空旋转动画
      let celebrationTime = 0;
      SN.onUpdate((dt) => {
        celebrationTime += dt;
        if (SN.modules.sky?.dome?.material?.uniforms?.uAnim) {
          SN.modules.sky.dome.material.uniforms.uAnim.value = 1.0 + Math.sin(celebrationTime * 2) * 0.8;
        }
      });
    }

    // ------------------------------------------------------------ 准星瞄准与交互光线检测
    SN.on('spot', ({ ray }) => {
      if (!ray) return;
      const hitCandidates = starInstances.filter(s => !s.ignited).map(s => s.hitMesh);
      const intersects = ray.intersectObjects(hitCandidates, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const starIdx = hit.object.userData?.starIndex;
        if (starIdx != null) {
          const star = starInstances[starIdx];
          if (star && !star.ignited) {
            igniteStar(star);
          }
        }
      }
    });

    // ------------------------------------------------------------ 每帧渲染：浮动、自转与距离感知
    let nearestStarDist = Infinity;

    SN.onUpdate((dt, time) => {
      const camPos = camera.position;
      nearestStarDist = Infinity;
      let closestStar = null;

      starInstances.forEach(star => {
        if (star.ignited) return;

        // 浮动悬浮动画
        const bob = Math.sin(time * 2.4 + star.phase) * 0.12;
        star.root.position.y = star.basePos.y + bob;

        // 双轨道环自转
        star.ring1.rotation.x += dt * 1.6;
        star.ring1.rotation.y += dt * 1.2;

        star.ring2.rotation.y += dt * 1.4;
        star.ring2.rotation.z += dt * 1.8;

        // 核心呼吸缩放
        const pulse = 1.0 + 0.14 * Math.sin(time * 3.8 + star.phase);
        star.coreMesh.scale.setScalar(pulse);

        // 计算与玩家距离
        const d = star.root.position.distanceTo(camPos);
        if (d < nearestStarDist) {
          nearestStarDist = d;
          closestStar = star;
        }
      });

      // 靠近未点燃星核时，触发柔和空灵共鸣
      if (nearestStarDist < 14) {
        playProximityChime(nearestStarDist);
      }

      // 更新 crosshair 瞄准状态
      if (SN.aim) {
        if (closestStar && nearestStarDist < 20) {
          // 射线检测当前准星是否正对着最近星核
          const ray = SN.rayFromNdc ? SN.rayFromNdc(0, 0) : null;
          if (ray) {
            const hits = ray.intersectObject(closestStar.hitMesh, false);
            if (hits.length > 0) {
              SN.aim.star = closestStar;
            } else {
              SN.aim.star = null;
            }
          }
        } else {
          SN.aim.star = null;
        }
      }
    });

    const api = {
      stars: starInstances,
      lore: STAR_LORE,
      get foundCount() { return foundSet.size; },
      get total() { return STAR_LORE.length; },
      foundIds: () => Array.from(foundSet),
      igniteStar
    };
    SN.modules.cats = api;
    return api;
  }
});
