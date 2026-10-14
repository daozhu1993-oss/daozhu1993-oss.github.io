/**
 * 《千里江山 · 借笔还魂》3D 穿越入画仪式 (The 3D Crossing Ceremony)
 * 对标 https://xianxie6.github.io/qingming-riverside/ 的【穿越】仪式
 * 
 * 核心特性：
 * 1. 纯 Three.js 矿物粒子汇聚千峰万壑 (石青、石绿、金屑、暖赭四大矿物色相)
 * 2. 【打散 · 重聚】(Burst & Reassemble) 交互式物理爆破与回弹汇聚
 * 3. 运镜推进轨道：天地大化 -> 千峰拔地 -> 虹桥合拢 -> 希孟相逢
 * 4. 十八岁少年画师【王希孟】相逢对话与【问问江山】交互问答
 * 5. 【随他入画 ↗】 / 【自行入画】无缝切入三维青绿山河
 */

import * as THREE from 'three';
import { audio } from './audio.js';

export class CrossingCeremony {
  constructor(options = {}) {
    this.onEnterWorld = options.onEnterWorld || (() => {});
    this.onCancel = options.onCancel || (() => {});

    this.dialog = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.particleMesh = null;
    this.animFrameId = null;

    this.progress = 0;
    this.targetProgress = 0;
    this.isPlaying = true;
    this.isBursting = false;
    this.welcoming = false;
    this.targetPlace = null;

    // 粒子系统数据
    this.particleCount = 12000;
    this.posArray = null;
    this.origPosArray = null;
    this.velArray = null;
    this.colorArray = null;
  }

  start(targetPlace = null) {
    this.targetPlace = targetPlace;
    this.progress = 0;
    this.targetProgress = 0;
    this.isPlaying = true;
    this.welcoming = false;

    // 1. 构建 Dialog DOM
    this._buildDialog();

    // 2. 初始化 3D 粒子汇聚场景
    this._initThreeScene();

    // 3. 开启声景
    audio.ensureContext();
    audio.playGuqinPluck(220.0, 5.0);

    // 4. 启动渲染主循环
    this.clock = new THREE.Clock();
    this._renderLoop();
  }

  _buildDialog() {
    // 移除已存在的 dialog
    const existing = document.getElementById('crossingDialog');
    if (existing) existing.remove();

    this.dialog = document.createElement('dialog');
    this.dialog.id = 'crossingDialog';
    this.dialog.className = 'crossing-dialog';
    this.dialog.setAttribute('aria-labelledby', 'crossingTitle');

    this.dialog.innerHTML = `
      <div class="crossing-caption">
        <small id="crossingSub">北宋政和三年 · 借笔还魂</small>
        <h2 id="crossingTitle">青绿初成 · 天地大化</h2>
        <p id="crossingStatusDesc">万千石青石绿矿物粒子，正从虚空汇聚为千峰万壑…</p>
      </div>

      <div class="crossing-top-actions">
        <button id="crossingCancel" autofocus>← 返回长卷</button>
        <button id="crossingSound" type="button" aria-pressed="true">关闭声音</button>
        <button id="crossingSkip">直接入画 ↗</button>
      </div>

      <div class="crossing-navigation">
        <p id="crossingStatus" role="status" aria-live="polite">正在凝炼石青石绿，汇聚千峰万壑…</p>
        <div class="crossing-nav-buttons">
          <button id="crossingAuto" class="crossing-btn-round" aria-pressed="true">暂停</button>
          <button id="crossingBurst" type="button" class="crossing-btn-burst">打散 · 重聚</button>
        </div>
        <div class="crossing-track">
          <span>天地大化</span>
          <input id="crossingSeek" type="range" min="0" max="1000" value="0" aria-label="穿越进度">
          <span>希孟相逢</span>
        </div>
      </div>

      <!-- 与十八岁少年王希孟相逢对话 -->
      <section class="crossing-welcome" id="crossingWelcome" hidden aria-label="与十八岁少年王希孟相逢">
        <div class="crossing-welcome-name">
          <span>王希孟</span>
          <small>相逢 · 舒啸石台</small>
        </div>
        <p id="crossingDialogue" role="status" aria-live="polite">
          知音初临千里江山？随我入画，唤醒山海神兽。
        </p>
        <div class="crossing-welcome-actions">
          <button id="crossingGuide" class="crossing-btn-primary">随他入画 ↗</button>
          <button id="crossingAsk" class="crossing-btn-sub" aria-expanded="false">问问江山</button>
          <button id="crossingAlone" class="crossing-btn-sub">自行入画</button>
        </div>
        <div id="crossingQuestions" class="crossing-questions-list" hidden>
          <button data-q="scroll">此卷何以近十二米？</button>
          <button data-q="beasts">山海神兽封印于何处？</button>
          <button data-q="youth">十八岁那年，你参透了什么？</button>
        </div>
      </section>

      <div id="crossingProgress" class="crossing-progress-bar" aria-hidden="true"></div>
    `;

    document.body.appendChild(this.dialog);
    this.dialog.showModal();

    this._bindDialogEvents();
  }

  _bindDialogEvents() {
    const cancelBtn = this.dialog.querySelector('#crossingCancel');
    const soundBtn = this.dialog.querySelector('#crossingSound');
    const skipBtn = this.dialog.querySelector('#crossingSkip');
    const autoBtn = this.dialog.querySelector('#crossingAuto');
    const burstBtn = this.dialog.querySelector('#crossingBurst');
    const seekInput = this.dialog.querySelector('#crossingSeek');

    cancelBtn.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });

    soundBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      soundBtn.textContent = muted ? '开启声音' : '关闭声音';
      soundBtn.setAttribute('aria-pressed', String(!muted));
    });

    skipBtn.addEventListener('click', () => {
      this.finishAndEnterWorld();
    });

    autoBtn.addEventListener('click', () => {
      this.isPlaying = !this.isPlaying;
      autoBtn.textContent = this.isPlaying ? '暂停' : '启程';
      autoBtn.setAttribute('aria-pressed', String(this.isPlaying));
    });

    burstBtn.addEventListener('click', () => {
      this.burstAndReassemble();
    });

    seekInput.addEventListener('input', () => {
      this.isPlaying = false;
      autoBtn.textContent = '启程';
      autoBtn.setAttribute('aria-pressed', 'false');
      this.progress = parseFloat(seekInput.value) / 1000;
      this.targetProgress = this.progress;
      this._updateStage(this.progress);
    });

    // 希孟对话交互
    const welcome = this.dialog.querySelector('#crossingWelcome');
    const dialogue = this.dialog.querySelector('#crossingDialogue');
    const guideBtn = this.dialog.querySelector('#crossingGuide');
    const askBtn = this.dialog.querySelector('#crossingAsk');
    const aloneBtn = this.dialog.querySelector('#crossingAlone');
    const qList = this.dialog.querySelector('#crossingQuestions');

    guideBtn.addEventListener('click', () => {
      dialogue.textContent = '这边请。看这满目青绿，六方山海神兽正待知音唤醒！';
      audio.playGuqinPluck(329.63, 4.0);
      guideBtn.disabled = true;
      setTimeout(() => {
        this.finishAndEnterWorld();
      }, 900);
    });

    aloneBtn.addEventListener('click', () => {
      this.finishAndEnterWorld();
    });

    askBtn.addEventListener('click', () => {
      const isHidden = qList.hidden;
      qList.hidden = !isHidden;
      askBtn.setAttribute('aria-expanded', String(!isHidden));
    });

    const answers = {
      scroll: '此卷近十二米，乃我十八岁奉徽宗之诏所绘。世人皆见其石青石绿金碧辉煌，却不知我将《山海经》六方山魂水魄封印其间，待君提笔唤醒！',
      beasts: '鹿蜀隐于桃溪，夫诸踏浪于飞瀑，驳兽镇守险隘，当康卧于陇亩，青鸟掠于孤刹，白泽居于水心大阁。君循金光司南即可寻访。',
      youth: '我落笔之时，便知肉身将归尘埃，但借笔还魂，与你在此卷中跨越九百年相逢。天地不老，青绿永存。'
    };

    qList.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const qKey = btn.dataset.q;
        dialogue.textContent = answers[qKey] || '';
        audio.playGuqinPluck(261.63, 3.5);
      });
    });
  }

  _initThreeScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7A6946); // 宣和古绢暖黄
    this.scene.fog = new THREE.FogExp2(0x7A6946, 0.008);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(54, aspect, 0.1, 1000);
    this.camera.position.set(0, 18, 55);
    this.camera.lookAt(0, 8, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.dialog.insertBefore(this.renderer.domElement, this.dialog.firstChild);

    // 光照
    const ambient = new THREE.AmbientLight(0xFFF3DE, 1.5);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xFFE5B5, 2.2);
    dirLight.position.set(25, 40, 30);
    this.scene.add(dirLight);

    // 构建千峰粒子系统与希孟仙姿
    this.particleCount = 16000;
    this._createMountainParticles();
    this._createXimengScholarFigure();

    // 窗口自适应
    this._onResize = () => {
      if (!this.renderer || !this.camera) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  _createMountainParticles() {
    const count = this.particleCount;
    this.posArray = new Float32Array(count * 3);
    this.origPosArray = new Float32Array(count * 3);
    this.velArray = new Float32Array(count * 3);
    this.colorArray = new Float32Array(count * 3);

    // 四大北宋矿物色标 (石青、石绿、金屑、暖赭)
    const mineralColors = [
      new THREE.Color(0x2B66CC), // 鲜亮石青 (Luminous Azurite)
      new THREE.Color(0x2FB37E), // 翠微石绿 (Emerald Malachite)
      new THREE.Color(0xFFDC73), // 闪耀泥金 (Gilded Gold)
      new THREE.Color(0xC27A45)  // 暖阳赭石 (Warm Ochre)
    ];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 1. 生成山峦与虹桥目标轮廓点 (Target Points)
      let tx, ty, tz;

      if (i < count * 0.72) {
        // 千峰万壑：崇山叠嶂三维函数
        const u = (Math.random() - 0.5) * 85;
        const v = (Math.random() - 0.5) * 48;
        // 峰峦高度函数：主峰、副峰与远岫
        const peak1 = Math.exp(-((u + 16) ** 2 + (v + 5) ** 2) / 130) * 26;
        const peak2 = Math.exp(-((u - 22) ** 2 + (v + 12) ** 2) / 180) * 30;
        const peak3 = Math.exp(-((u - 2) ** 2 + (v - 8) ** 2) / 90) * 20;
        const ridge = Math.cos(u * 0.16) * Math.sin(v * 0.22) * 6;

        tx = u;
        ty = Math.max(0.6, peak1 + peak2 + peak3 + ridge + Math.random() * 2.5);
        tz = v;
      } else if (i < count * 0.88) {
        // 编木虹桥拱形飞梁与水榭
        const t = (Math.random() - 0.5) * 30;
        tx = t;
        ty = 4.2 + (1 - (t / 15) ** 2) * 6.5 + (Math.random() - 0.5) * 0.8;
        tz = 12 + (Math.random() - 0.5) * 3.5;
      } else {
        // 舒啸临风石台与观景矶头
        tx = -12 + (Math.random() - 0.5) * 12;
        ty = 8 + (Math.random() - 0.5) * 2.2;
        tz = 24 + (Math.random() - 0.5) * 9;
      }

      this.origPosArray[i3] = tx;
      this.origPosArray[i3 + 1] = ty;
      this.origPosArray[i3 + 2] = tz;

      // 初始分散于峰峦周遭，形成气势磅礴的矿物星云漩涡
      const spreadR = 18 + Math.random() * 42;
      const angle = Math.random() * Math.PI * 2;
      this.posArray[i3] = tx + Math.cos(angle) * spreadR;
      this.posArray[i3 + 1] = ty + (Math.random() - 0.5) * 24 + 10;
      this.posArray[i3 + 2] = tz + Math.sin(angle) * spreadR;

      this.velArray[i3] = 0;
      this.velArray[i3 + 1] = 0;
      this.velArray[i3 + 2] = 0;

      // 配色：峰巅石青石绿，山脚泥金赭石
      let col;
      if (ty > 18) {
        col = mineralColors[0]; // 石青峰尖
      } else if (ty > 8) {
        col = Math.random() > 0.35 ? mineralColors[1] : mineralColors[0]; // 石绿翠微
      } else if (ty > 3) {
        col = mineralColors[3]; // 赭石石骨
      } else {
        col = mineralColors[2]; // 泥金渚岸
      }

      // 20% 金屑杂色微光
      if (Math.random() < 0.20) {
        col = mineralColors[2];
      }

      this.colorArray[i3] = col.r;
      this.colorArray[i3 + 1] = col.g;
      this.colorArray[i3 + 2] = col.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArray, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colorArray, 3));

    // 圆润古墨水彩光斑纹理
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const sparkTex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      size: 4.8,
      map: sparkTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.particleMesh = new THREE.Points(geo, mat);
    this.scene.add(this.particleMesh);
  }

  // 构建十八岁少年画师王希孟三维写意人像 (Standing on Terrace with Glowing Brush)
  _createXimengScholarFigure() {
    this.ximengGroup = new THREE.Group();
    this.ximengGroup.position.set(-12, 7.8, 24);
    this.ximengGroup.rotation.y = 0.45;
    this.ximengGroup.visible = false; // 稍后在第三阶段显现

    // 石矶台基
    const rockGeo = new THREE.CylinderGeometry(2.4, 3.2, 1.4, 7);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5C4D38, roughness: 0.95 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.y = -0.7;
    this.ximengGroup.add(rock);

    // 青绿文人长袍
    const robeMat = new THREE.MeshStandardMaterial({
      color: 0x2A5852, // 沉稳石绿宋儒长袍
      roughness: 0.75
    });
    const robeGeo = new THREE.CylinderGeometry(0.32, 0.65, 2.2, 8);
    const robe = new THREE.Mesh(robeGeo, robeMat);
    robe.position.y = 1.1;
    this.ximengGroup.add(robe);

    // 广袖飘带
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x36756C, roughness: 0.7 });
    const sleeveL = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.1, 6), sleeveMat);
    sleeveL.rotation.z = -0.6;
    sleeveL.position.set(-0.45, 1.4, 0);
    this.ximengGroup.add(sleeveL);

    const sleeveR = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.1, 6), sleeveMat);
    sleeveR.rotation.z = 0.7;
    sleeveR.rotation.x = -0.3;
    sleeveR.position.set(0.48, 1.5, 0.15);
    this.ximengGroup.add(sleeveR);

    // 朱砂腰带
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x9E2B25, roughness: 0.5 });
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 8), beltMat);
    belt.position.y = 1.35;
    this.ximengGroup.add(belt);

    // 少年面容与头巾
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xF7D8BA, roughness: 0.6 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), skinMat);
    head.position.y = 2.45;
    this.ximengGroup.add(head);

    // 东坡巾 / 儒士幞头
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1A1816, roughness: 0.8 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.35, 6), capMat);
    cap.position.y = 2.7;
    this.ximengGroup.add(cap);

    // 借笔神毫：发光金毫神笔 (The Legendary Borrowed Brush)
    const brushShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x8C5E28, roughness: 0.5 })
    );
    brushShaft.rotation.x = -0.85;
    brushShaft.rotation.z = -0.4;
    brushShaft.position.set(0.65, 1.6, 0.5);
    this.ximengGroup.add(brushShaft);

    // 笔尖金光神辉 (Glowing Golden Brush Tip)
    const brushTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFEA80 })
    );
    brushTip.position.set(0.92, 1.95, 0.95);
    this.ximengGroup.add(brushTip);

    // 笔尖金色引力光环
    const tipGlow = new THREE.PointLight(0xFFD700, 2.8, 12);
    tipGlow.position.set(0.92, 1.95, 0.95);
    this.ximengGroup.add(tipGlow);

    this.scene.add(this.ximengGroup);
  }

  // 物理爆破与弹性重聚 (Burst & Reassemble)
  burstAndReassemble() {
    this.isBursting = true;
    audio.playWaterRipples();
    audio.playGuqinPluck(392.0, 3.5);

    const count = this.particleCount;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const force = 18 + Math.random() * 32;
      this.velArray[i3] += Math.cos(angle) * force;
      this.velArray[i3 + 1] += (Math.random() - 0.2) * force * 0.8;
      this.velArray[i3 + 2] += Math.sin(angle) * force;
    }

    const burstBtn = this.dialog.querySelector('#crossingBurst');
    if (burstBtn) {
      burstBtn.textContent = '重聚中…';
      setTimeout(() => {
        burstBtn.textContent = '打散 · 重聚';
        this.isBursting = false;
      }, 1800);
    }
  }

  _updateStage(progress) {
    const title = this.dialog.querySelector('#crossingTitle');
    const status = this.dialog.querySelector('#crossingStatus');
    const desc = this.dialog.querySelector('#crossingStatusDesc');
    const welcome = this.dialog.querySelector('#crossingWelcome');
    const progressBar = this.dialog.querySelector('#crossingProgress');
    const seekInput = this.dialog.querySelector('#crossingSeek');

    if (seekInput && Math.abs(parseFloat(seekInput.value) - progress * 1000) > 10) {
      seekInput.value = Math.round(progress * 1000);
    }

    if (progressBar) {
      progressBar.style.transform = `scaleX(${progress})`;
    }

    if (progress < 0.35) {
      title.textContent = '青绿初成 · 天地大化';
      status.textContent = '石青石绿矿物重彩正从太虚之中汇聚…';
      desc.textContent = '天地大化，元气淋漓。矿物重彩随少年意气喷薄而出。';
      this._setWelcome(false);
    } else if (progress < 0.70) {
      title.textContent = '崇山叠嶂 · 虹桥飞架';
      status.textContent = '千步虹桥贯木飞梁合拢，百里江山渐现峥嵘…';
      desc.textContent = '峰峦绝壁、长桥水榭与渔舟松涛逐一凝结于绢帛之间。';
      this._setWelcome(false);
    } else {
      title.textContent = '舒啸石台 · 希孟相逢';
      status.textContent = '十八岁少年王希孟立于绝壁石矶，正待知音…';
      desc.textContent = '跨越九百载岁月，少年画师停笔回眸，邀君入画共参天地。';
      this._setWelcome(true);
      if (this.ximengGroup) this.ximengGroup.visible = true;
    }

    // 相机轨迹推进
    if (this.camera) {
      const camY = 18 - progress * 8;
      const camZ = 55 - progress * 32;
      const camX = Math.sin(progress * Math.PI) * 12;
      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(0, 8 - progress * 2, 0);
    }
  }

  _setWelcome(show) {
    if (this.welcoming === show) return;
    this.welcoming = show;
    const welcome = this.dialog.querySelector('#crossingWelcome');
    if (welcome) welcome.hidden = !show;
  }

  _renderLoop() {
    this.animFrameId = requestAnimationFrame(() => this._renderLoop());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock ? this.clock.getElapsedTime() : 0;

    // 自动播放进度演进
    if (this.isPlaying && this.progress < 0.95) {
      this.progress += dt * 0.12;
      this._updateStage(this.progress);
    }

    // 希孟仙姿微风拂动呼吸
    if (this.ximengGroup && this.ximengGroup.visible) {
      this.ximengGroup.position.y = 7.8 + Math.sin(time * 2.2) * 0.08;
      this.ximengGroup.rotation.y = 0.45 + Math.sin(time * 0.8) * 0.04;
    }

    // 粒子弹簧物理与重聚运算
    if (this.particleMesh) {
      const pos = this.posArray;
      const orig = this.origPosArray;
      const vel = this.velArray;
      const count = this.particleCount;
      const blend = THREE.MathUtils.clamp(0.28 + this.progress * 0.72, 0, 1);

      const springK = 6.8;
      const damp = 0.88;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // 目标基准点
        const tx = orig[i3];
        const ty = orig[i3 + 1];
        const tz = orig[i3 + 2];

        // 汇聚吸引力
        const dx = tx - pos[i3];
        const dy = ty - pos[i3 + 1];
        const dz = tz - pos[i3 + 2];

        vel[i3] = (vel[i3] + dx * springK * blend * dt) * damp;
        vel[i3 + 1] = (vel[i3 + 1] + dy * springK * blend * dt) * damp;
        vel[i3 + 2] = (vel[i3 + 2] + dz * springK * blend * dt) * damp;

        pos[i3] += vel[i3] * dt * 10;
        pos[i3 + 1] += vel[i3 + 1] * dt * 10;
        pos[i3 + 2] += vel[i3 + 2] * dt * 10;
      }

      this.particleMesh.geometry.attributes.position.needsUpdate = true;
      this.particleMesh.rotation.y += dt * 0.035;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  finishAndEnterWorld() {
    audio.playGuqinPluck(440.0, 4.0);
    this.dialog.classList.add('crossing-leaving');
    setTimeout(() => {
      this.close();
      this.onEnterWorld(this.targetPlace);
    }, 600);
  }

  close() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
    if (this.dialog) {
      this.dialog.close();
      this.dialog.remove();
      this.dialog = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
