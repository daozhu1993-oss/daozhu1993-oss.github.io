/**
 * 《千里江山 · 山海入画》3D 沉浸式青绿大境漫步引擎 (Immersive Blue-and-Green 3D Roaming Engine)
 * 纯 WebGL / Three.js 打造，北宋院体青绿重彩与山海经通灵画境
 * 
 * 核心创新：
 * 1. 【故宫真迹通卷织锦贴图 (Stitched Master Painting Texture)】：
 *    将王希孟近十二米真迹五大段高清画卷无缝拼合为 4096 极清画布纹理，精准映射至 3D 崇山峻岭与平远江渚。
 *    每一处山石断崖皆流淌着九百年前矿物石青、孔雀石绿与温润赭石的原作笔触，彻底告别单调秃山几何体！
 * 2. 【宝石自发光与东方晨曦采光 (Radiant Mineral Shading)】：
 *    材质附带真迹自发光（Emissive），阴影处泛出通透孔雀绿与石青明度，杜绝任何死黑与塑料积木感。
 * 3. 【三远法叠翠画屏与玉带祥云 (Layered Mountain Screens & Drifting Mist)】：
 *    远景布置多重北宋崇峦画屏与动态飘逸的半透明腰缠玉带祥云，立体呈现“高远、深远、平远”。
 * 4. 【初登大观 · 临江画榭全景视口 (Panoramic Scenic Spawn Overlook)】：
 *    玩家初始登临高崖飞檐画阁，眼前豁然开朗：澄碧长河、千步虹桥、临渊飞瀑、桃林苍松与首尊神兽【鹿蜀】一览无余。
 * 5. 【写意工笔花木 (Gongbi Pines & Peach Groves)】：
 *    柔和法线苍松虬枝与粉融桃林，配合暖木明灯与青石步道，构筑真正的传世国风游戏世界。
 */

import * as THREE from 'three';
import { BEASTS } from './beasts.js';
import { Beast3DManager } from './beast3d.js';
import { audio } from './audio.js';
import { InkPostPipeline } from './inkPostProcess.js';

export class World3D {
  constructor(container, options = {}) {
    this.container = container;
    this.onAwakenBeast = options.onAwakenBeast || (() => {});
    this.onExitToScroll = options.onExitToScroll || (() => {});
    this.onNearBeastChange = options.onNearBeastChange || (() => {});
    this.onCompassUpdate = options.onCompassUpdate || (() => {});

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.beastManager = null;
    this.postPipeline = null;

    // 玩家漫步物理状态 (初始登临：临江高崖飞檐观景台，俯瞰千里江山全景大观)
    this.player = {
      pos: new THREE.Vector3(-32, 11.5, 48),
      vel: new THREE.Vector3(),
      yaw: -0.22, // 朝向东北，一览澄碧大泽、千步长桥与远山层峦
      pitch: -0.06,
      speed: 13.5,
      sprintMultiplier: 1.85,
      height: 2.2,
      isGrounded: true,
      jumpVelocity: 0
    };

    this.keys = {};
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.clock = new THREE.Clock();

    // 交互与近邻神兽检测
    this.nearestBeast = null;
    this.nearestDistance = Infinity;

    // 场景动态对象缓存
    this.waterMesh = null;
    this.skyBeams = {};
    this.goldDustPoints = null;
    this.waterfallMesh = null;
    this.cloudRibbons = [];
    this.awakenedZones = new Set();
    this.textureLoader = new THREE.TextureLoader();
    this.masterPaintingTex = null;

    this._initScene();
    this._initMasterPaintingTexture();
    this._buildAtmosphereAndSky();
    this._buildTexturedTerrain();
    this._buildWaterways();
    this._buildStoneRoadAndLanterns();
    this._buildSpawnOverlookPavilion();
    this._buildScenicLandmarks();
    this._buildGoldDustParticles();
    this._initBeasts();
    this._initControls();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();

    // 北宋宣和古绢明润米黄底色与晨岚 (#F5ECD8)
    this.scene.background = new THREE.Color(0xF5ECD8);
    this.scene.fog = new THREE.FogExp2(0xF5ECD8, 0.0050);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1400
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.38;
    this.container.appendChild(this.renderer.domElement);

    // 东方晨曦金碧采光系统：彻底消除阴暗死黑
    // 1. 全局环境光 (高照度暖绢色，补足一切暗部阴影)
    const ambientLight = new THREE.AmbientLight(0xFFF4DF, 1.55);
    this.scene.add(ambientLight);

    // 2. 半球光 (天空金辉 + 地面孔雀石反射)
    const hemiLight = new THREE.HemisphereLight(0xFFFAF2, 0x247565, 1.7);
    this.scene.add(hemiLight);

    // 3. 晨曦主直射阳光 (从东南方向斜照群山，山体立体生动金碧辉映)
    const sunLight = new THREE.DirectionalLight(0xFFF6DE, 2.3);
    sunLight.position.set(65, 120, 80);
    this.scene.add(sunLight);
    this.sunLight = sunLight;

    // 初始化北宋工笔青绿水墨非真实感渲染管线
    try {
      this.postPipeline = new InkPostPipeline(
        this.renderer,
        this.scene,
        this.camera,
        this.container.clientWidth,
        this.container.clientHeight
      );
    } catch (err) {
      console.warn('[PostPipeline Init Warning]', err);
      this.postPipeline = null;
    }

    window.addEventListener('resize', () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.postPipeline) {
        this.postPipeline.resize(w, h);
      }
    });
  }

  // =========================================================================
  // 【核心创新】生成王希孟《千里江山图》高清真迹无缝长卷拼合画境纹理
  // =========================================================================
  _initMasterPaintingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 4096;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // 1. 预填北宋宫廷宣和绢本矿物色阶底色（防止网络异步加载期间出现空白）
    const grad = ctx.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0.00, '#1B5374'); // 远山石青宝石蓝
    grad.addColorStop(0.28, '#247D9E'); // 奇峰霁青
    grad.addColorStop(0.48, '#279875'); // 崇山孔雀石绿
    grad.addColorStop(0.72, '#9E743F'); // 山脚温润赭石
    grad.addColorStop(0.88, '#CDB078'); // 渚岸泥金
    grad.addColorStop(1.00, '#E8DDB8'); // 宣和古绢暖米黄
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4096, 1024);

    // 水平轻微墨彩晕染
    for (let i = 0; i < 20; i++) {
      const rx = Math.random() * 4096;
      const ry = 200 + Math.random() * 600;
      const rw = 200 + Math.random() * 400;
      const rh = 80 + Math.random() * 200;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(39, 152, 117, 0.22)' : 'rgba(27, 83, 116, 0.22)';
      ctx.fillRect(rx, ry, rw, rh);
    }

    this.masterPaintingTex = new THREE.CanvasTexture(canvas);
    this.masterPaintingTex.colorSpace = THREE.SRGBColorSpace;
    this.masterPaintingTex.wrapS = THREE.ClampToEdgeWrapping;
    this.masterPaintingTex.wrapT = THREE.ClampToEdgeWrapping;
    this.masterPaintingTex.generateMipmaps = true;
    this.masterPaintingTex.minFilter = THREE.LinearMipmapLinearFilter;

    // 2. 异步将五大段《千里江山图》故宫高清原卷绘制拼接进画布
    const sections = [
      { id: 1, sx: 0,    sw: 820 },
      { id: 2, sx: 820,  sw: 820 },
      { id: 3, sx: 1640, sw: 820 },
      { id: 4, sx: 2460, sw: 820 },
      { id: 5, sx: 3280, sw: 816 }
    ];

    sections.forEach(sec => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, sec.sx, 0, sec.sw, 1024);
        this.masterPaintingTex.needsUpdate = true;
      };
      img.src = `assets/painting/section_${sec.id}.jpg`;
    });
  }

  // 建造 360 度多重视差古绢全景远天与三远法崇峦画屏
  _buildAtmosphereAndSky() {
    // 1. 最外层无缝天穹顶 (Silk Sky Dome)
    const skyGeo = new THREE.SphereGeometry(380, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.52);
    // 天空渐变 Canvas
    const skyCv = document.createElement('canvas');
    skyCv.width = 128;
    skyCv.height = 512;
    const skyCtx = skyCv.getContext('2d');
    const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0.0, '#EFE4CE'); // 天顶温润绢白
    skyGrad.addColorStop(0.4, '#F7EDD9');
    skyGrad.addColorStop(0.75, '#FFF6E6'); // 天际暖金晨曦
    skyGrad.addColorStop(1.0, '#F5ECD8');
    skyCtx.fillStyle = skyGrad;
    skyCtx.fillRect(0, 0, 128, 512);

    const skyTex = new THREE.CanvasTexture(skyCv);
    skyTex.colorSpace = THREE.SRGBColorSpace;

    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.y = -10;
    this.scene.add(skyMesh);

    // 2. 北侧三远法崇峦叠翠画屏（高远大观，真实引用王希孟原卷主峰）
    // 画屏 1: 北侧中远景主峦 (Z = -95, 卷二瀑布幽壑)
    const scr1Geo = new THREE.PlaneGeometry(280, 68);
    const scr1Tex = this.textureLoader.load('assets/painting/section_2.jpg');
    scr1Tex.colorSpace = THREE.SRGBColorSpace;
    const scr1Mat = new THREE.MeshBasicMaterial({
      map: scr1Tex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    });
    const scr1Mesh = new THREE.Mesh(scr1Geo, scr1Mat);
    scr1Mesh.position.set(-20, 32, -92);
    this.scene.add(scr1Mesh);

    // 画屏 2: 东北侧绝顶绝壁奇峰 (Z = -135, 卷四险拔群峦)
    const scr2Geo = new THREE.PlaneGeometry(320, 88);
    const scr2Tex = this.textureLoader.load('assets/painting/section_4.jpg');
    scr2Tex.colorSpace = THREE.SRGBColorSpace;
    const scr2Mat = new THREE.MeshBasicMaterial({
      map: scr2Tex,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide
    });
    const scr2Mesh = new THREE.Mesh(scr2Geo, scr2Mat);
    scr2Mesh.position.set(45, 42, -135);
    this.scene.add(scr2Mesh);

    // 画屏 3: 东侧万象大泽远天 (X = 175, 卷五归海浩渺)
    const scr3Geo = new THREE.PlaneGeometry(240, 60);
    const scr3Tex = this.textureLoader.load('assets/painting/section_5.jpg');
    scr3Tex.colorSpace = THREE.SRGBColorSpace;
    const scr3Mat = new THREE.MeshBasicMaterial({
      map: scr3Tex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const scr3Mesh = new THREE.Mesh(scr3Geo, scr3Mat);
    scr3Mesh.position.set(165, 26, -15);
    scr3Mesh.rotation.y = -Math.PI * 0.42;
    this.scene.add(scr3Mesh);

    // 3. 动态玉带祥云 (Drifting Cloud Ribbons)
    this._buildCloudRibbons();
  }

  // 打造仙山缥缈的半透明玉带祥云
  _buildCloudRibbons() {
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xFFFBF2,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const cloudConfigs = [
      { x: -50, y: 19, z: -45, w: 90, h: 7.5, rot: 0.08 },
      { x: 15,  y: 24, z: -65, w: 110, h: 9.0, rot: -0.06 },
      { x: 75,  y: 28, z: -55, w: 95, h: 8.0, rot: 0.05 },
      { x: -10, y: 16, z: 15,  w: 70, h: 6.0, rot: -0.04 }
    ];

    cloudConfigs.forEach((cfg, idx) => {
      const geo = new THREE.PlaneGeometry(cfg.w, cfg.h, 12, 1);
      const mesh = new THREE.Mesh(geo, cloudMat);
      mesh.position.set(cfg.x, cfg.y, cfg.z);
      mesh.rotation.z = cfg.rot;
      mesh.userData = { baseX: cfg.x, speed: 0.6 + idx * 0.25 };
      this.scene.add(mesh);
      this.cloudRibbons.push(mesh);
    });
  }

  // =========================================================================
  // 建造覆盖《千里江山图》高清真迹贴图的三维矿物重彩山河
  // =========================================================================
  _buildTexturedTerrain() {
    const width = 380;
    const depth = 260;
    const segX = 160;
    const segZ = 120;

    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const uvs = geo.attributes.uv;
    const colors = [];

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      let y = this._calculateTerrainHeight(x, z);
      pos.setY(i, y);

      // 【核心 UV 算法】将真迹长卷精准投影映射至三维地形
      // U 轴映射长卷横向 (X 轴从 -190 到 +190 对应卷首至卷末)
      const u = (x + 190.0) / 380.0;
      // V 轴映射长卷纵向 (Z 轴 -130 为北侧崇山绝顶对应画卷上方，+130 为南侧大江渚岸对应画卷下方)
      const v = (130.0 - z) / 260.0;
      uvs.setXY(i, Math.max(0.0, Math.min(1.0, u)), Math.max(0.0, Math.min(1.0, v)));

      // 顶点颜色辅助增强矿物色泽
      const c = new THREE.Color();
      if (y < 2.5) {
        c.setHex(0xE2BF7D); // 澄碧渚岸暖金赭石
      } else if (y < 7.0) {
        c.setHex(0xB58245); // 山脚温润赭石
      } else if (y < 16.0) {
        c.setHex(0x289C7C); // 矿物孔雀石绿
      } else if (y < 28.0) {
        c.setHex(0x2382B8); // 蓝铜矿天青宝石蓝
      } else {
        c.setHex(0x1B5A85); // 绝巅群青
      }
      colors.push(c.r, c.g, c.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // 采用带真迹自发光的青绿山水材质（阴影处通透润泽，永不死黑）
    const mat = new THREE.MeshStandardMaterial({
      map: this.masterPaintingTex,
      emissive: 0x2A4D42,
      emissiveMap: this.masterPaintingTex,
      emissiveIntensity: 0.35,
      roughness: 0.82,
      metalness: 0.04,
      flatShading: false
    });

    this.terrain = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrain);
  }

  // 精确计算北宋六大胜境地貌与峥嵘峰峦
  _calculateTerrainHeight(x, z) {
    let y = 0;

    // 1. 北侧绵延主峰山脉 (Z < -8)
    if (z < -8) {
      // 斧劈与卷云峰脊 (Sharp Chinese mountain ridges)
      const ridge1 = Math.abs(Math.sin(x * 0.032 + 0.45)) * 26.0;
      const ridge2 = (1.0 - Math.abs(Math.cos(z * 0.042 + x * 0.015))) * 16.0;
      const cliff = Math.pow(Math.abs(z + 8) / 120, 2.1) * 44;
      const raw = ridge1 + ridge2 + cliff;
      // 斧劈石阶台地层级 (Ax-cut stepped terraces)
      y = Math.floor(raw / 3.8) * 3.8 + (raw % 3.8) * 0.35;

      // 卷二 · 悬瀑深涧落差区 (x ≈ -18, z ≈ -35)
      const distWaterfall = Math.hypot(x - (-18), z - (-35));
      if (distWaterfall < 26) {
        y = Math.max(2.8, y * 0.48 + (distWaterfall / 26) * 12);
      }

      // 卷四 · 关隘石桥深峡 (x ≈ 38, z ≈ -15)
      const distChasm = Math.hypot(x - 38, z - (-15));
      if (distChasm < 24) {
        y = Math.max(2.0, y * 0.42 + (distChasm / 24) * 11);
      }
    } else {
      // 2. 南侧澄碧长河与缓坡丘陵、梯田浅渚 (Z >= -8)
      const riverWave = Math.sin(x * 0.03) * 2.2;
      const hills = Math.sin(x * 0.048 + 0.8) * Math.cos(z * 0.038) * 4.6;
      const slope = (z / 95) * 12;
      y = Math.max(0.6, hills + slope + riverWave);

      // 卷一 · 桃溪浅滩 (x ≈ -45, z ≈ 28)
      const distPeach = Math.hypot(x - (-45), z - 28);
      if (distPeach < 24) {
        y = Math.min(y, 1.2 + (distPeach / 24) * 2.0);
      }

      // 卷三 · 麦陇梯田台地 (x ≈ 12, z ≈ 42)
      const distPaddy = Math.hypot(x - 12, z - 42);
      if (distPaddy < 26) {
        const step = Math.floor(y * 1.5) / 1.5;
        y = step + 1.2;
      }
    }

    // 卷五 · 孤峰凌霄险拔绝顶 (x ≈ 62, z ≈ 10)
    const distPeak = Math.hypot(x - 62, z - 10);
    if (distPeak < 20) {
      const spike = (1 - distPeak / 20) * 36;
      y = Math.max(y, 10 + spike);
    }

    // 卷六 · 大泽水心浅洲 (x ≈ 88, z ≈ -8)
    const distPavilion = Math.hypot(x - 88, z - (-8));
    if (distPavilion < 22) {
      y = Math.min(y, 1.4);
    }

    // 玩家初始高崖观景台平坦台地 (x ≈ -32, z ≈ 48)
    const distOverlook = Math.hypot(x - (-32), z - 48);
    if (distOverlook < 16) {
      y = Math.max(y, 9.8);
    }

    return y;
  }

  // 建造澄碧水系与微澜江波
  _buildWaterways() {
    const waterGeo = new THREE.PlaneGeometry(380, 260, 64, 48);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2A8C7D, // 澄碧江波 (明艳孔雀石绿微澜)
      emissive: 0x0F4A3E,
      emissiveIntensity: 0.18,
      roughness: 0.12,
      metalness: 0.55,
      transparent: true,
      opacity: 0.90
    });

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = 1.05;
    this.scene.add(this.waterMesh);
  }

  // =========================================================================
  // 打造初登高台 · 临江飞檐画榭 (Panoramic Overlook Pavilion at Spawn)
  // =========================================================================
  _buildSpawnOverlookPavilion() {
    const group = new THREE.Group();
    group.position.set(-32, 9.8, 48);

    const matWood = new THREE.MeshStandardMaterial({ color: 0x5C3E24, roughness: 0.75 });
    const matRedPillars = new THREE.MeshStandardMaterial({ color: 0xA62E24, roughness: 0.5 });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x8C4232, roughness: 0.45 });
    const matStone = new THREE.MeshStandardMaterial({ color: 0xCFBE9D, roughness: 0.85 });

    // 1. 八角观景石基台
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.2, 0.4, 8), matStone);
    platform.position.y = 0.2;
    group.add(platform);

    // 2. 凭栏朱漆围栏
    for (let i = 0; i < 8; i++) {
      if (i === 1) continue; // 留出下山石阶出口
      const angle = (i / 8) * Math.PI * 2;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.9, 0.22), matWood);
      rail.position.set(Math.cos(angle + 0.39) * 8.0, 0.75, Math.sin(angle + 0.39) * 8.0);
      rail.rotation.y = angle + 0.39 + Math.PI / 2;
      group.add(rail);
    }

    // 3. 画榭立柱与飞檐
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.6, 6), matRedPillars);
      col.position.set(Math.cos(angle) * 4.2, 2.4, Math.sin(angle) * 4.2);
      group.add(col);

      // 檐角悬挂暖光灯笼
      const lantern = this._buildTrailLantern(col.position.x * 1.15, 3.8, col.position.z * 1.15);
      group.add(lantern);
    }

    // 4. 双层飞檐攒尖顶
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(6.6, 1.8, 6), matRoof);
    roof1.position.y = 5.2;
    group.add(roof1);

    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(4.8, 1.6, 6), matRoof);
    roof2.position.y = 6.4;
    group.add(roof2);

    const finial = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xF5CF4E, metalness: 0.9, roughness: 0.2 })
    );
    finial.position.y = 7.4;
    group.add(finial);

    // 5. 观景台两侧掩映两株繁盛粉桃
    const peach1 = this._buildPeachBlossomTree();
    peach1.position.set(-9.5, 0, -2);
    group.add(peach1);

    const peach2 = this._buildPeachBlossomTree();
    peach2.position.set(9.0, 0, 3);
    group.add(peach2);

    this.scene.add(group);
  }

  // 建造青石古道与引路明灯 (Walkable Scenic Pathway with Lanterns)
  _buildStoneRoadAndLanterns() {
    const roadPoints = [
      new THREE.Vector3(-32, 9.8, 48),  // 起点高崖画阁
      new THREE.Vector3(-36, 6.4, 40),  // 盘山步道
      new THREE.Vector3(-42, 3.4, 34),  // 临溪桃林
      new THREE.Vector3(-45, 1.8, 28),  // 桃溪浅滩 (鹿蜀)
      new THREE.Vector3(-30, 2.0, 20),  // 沿岸碎石径
      new THREE.Vector3(-18, 3.4, 8),   // 通往深涧小径
      new THREE.Vector3(0, 2.5, 16),    // 中洲渚岸
      new THREE.Vector3(12, 2.6, 42),   // 麦陇农庄 (当康)
      new THREE.Vector3(26, 4.2, 10),   // 关隘石桥引桥
      new THREE.Vector3(38, 8.8, -15),  // 千步虹桥 (驳)
      new THREE.Vector3(55, 6.2, 2),    // 盘山石阶
      new THREE.Vector3(72, 3.5, -4),   // 大泽栈桥
      new THREE.Vector3(88, 5.0, -8)    // 水心画阁 (白泽)
    ];

    const matStonePath = new THREE.MeshStandardMaterial({
      color: 0xDAC8A6,
      roughness: 0.85
    });

    // 沿途铺设古道石板
    for (let i = 0; i < roadPoints.length - 1; i++) {
      const p1 = roadPoints[i];
      const p2 = roadPoints[i + 1];
      const dist = p1.distanceTo(p2);
      const steps = Math.ceil(dist / 2.2);

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const pos = new THREE.Vector3().lerpVectors(p1, p2, t);
        const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.6), matStonePath);
        slab.position.copy(pos);
        slab.position.y += 0.08;
        slab.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z);
        this.scene.add(slab);

        // 每隔两步立一盏木质温暖引路明灯
        if (s % 3 === 0 && (i % 2 === 0)) {
          const l = this._buildTrailLantern(pos.x + 1.6, pos.y, pos.z);
          this.scene.add(l);
        }
      }
    }
  }

  // 打造写意引路木灯笼
  _buildTrailLantern(x, y, z) {
    const post = new THREE.Group();
    post.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4A3319, roughness: 0.8 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), woodMat);
    pole.position.y = 1.1;
    post.add(pole);

    // 暖黄纸质灯笼
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xFFE082,
      emissive: 0xFFA000,
      emissiveIntensity: 0.65,
      roughness: 0.3
    });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), lanternMat);
    lantern.scale.set(1.0, 1.3, 1.0);
    lantern.position.set(0.3, 2.0, 0);
    post.add(lantern);

    const light = new THREE.PointLight(0xFFD56B, 1.3, 9);
    light.position.set(0.3, 2.0, 0);
    post.add(light);

    return post;
  }

  // 打造六大胜境 3D 建筑、飞瀑、长桥与生机草木
  _buildScenicLandmarks() {
    const matWood = new THREE.MeshStandardMaterial({ color: 0x6E4A28, roughness: 0.75 });
    const matPillars = new THREE.MeshStandardMaterial({ color: 0xA62B20, roughness: 0.5 }); // 宋红立柱
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x8C4A34, roughness: 0.45 });
    const matStone = new THREE.MeshStandardMaterial({ color: 0x5C6D68, roughness: 0.85 });

    // 1. 【胜境一 · 桃溪浅滩】(x: -45, z: 28)
    const peachGroup = new THREE.Group();
    peachGroup.position.set(-45, 1.2, 28);
    for (let i = 0; i < 10; i++) {
      const tree = this._buildPeachBlossomTree();
      tree.position.set((Math.random() - 0.5) * 26, 0, (Math.random() - 0.5) * 22);
      peachGroup.add(tree);
    }
    const boat = this._buildFishingBoat(matWood);
    boat.position.set(6, 0.2, -5);
    boat.rotation.y = 0.5;
    peachGroup.add(boat);
    this.scene.add(peachGroup);

    // 2. 【胜境二 · 悬泉幽涧】(x: -18, z: -35)
    const fallsGroup = new THREE.Group();
    fallsGroup.position.set(-18, 0, -35);
    const fallGeo = new THREE.PlaneGeometry(8.5, 38, 1, 16);
    const fallMat = new THREE.MeshStandardMaterial({
      color: 0xEDF7F6,
      emissive: 0xBBE3E3,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.9,
      roughness: 0.1
    });
    const fallMesh = new THREE.Mesh(fallGeo, fallMat);
    fallMesh.position.set(0, 20, -4);
    fallMesh.rotation.y = 0.15;
    fallsGroup.add(fallMesh);
    this.waterfallMesh = fallMesh;

    for (let i = 0; i < 6; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4 + Math.random() * 2.8, 1), matStone);
      rock.position.set((Math.random() - 0.5) * 18, 2.2, (Math.random() - 0.5) * 12);
      fallsGroup.add(rock);
    }
    this.scene.add(fallsGroup);

    // 3. 【胜境三 · 麦陇晚烟】(x: 12, z: 42)
    const paddyGroup = new THREE.Group();
    paddyGroup.position.set(12, 1.5, 42);
    const cottage = this._buildCottage(matWood, matRoof);
    cottage.position.set(4, 1.0, -3);
    paddyGroup.add(cottage);
    this.scene.add(paddyGroup);

    // 4. 【胜境四 · 关隘长桥】(x: 38, z: -15) - 经典宋代千步木拱虹桥
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(38, 2.5, -15);

    const bridgeArch = new THREE.Mesh(
      new THREE.TorusGeometry(13.0, 1.1, 8, 28, Math.PI * 0.65),
      new THREE.MeshStandardMaterial({ color: 0x9B2C22, roughness: 0.55 })
    );
    bridgeArch.rotation.z = Math.PI * 0.175;
    bridgeArch.position.y = -2.2;
    bridgeGroup.add(bridgeArch);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 0.45, 3.6), matWood);
    deck.position.set(0, 4.3, 0);
    deck.rotation.z = 0.04;
    bridgeGroup.add(deck);

    const pine = this._buildSongPineTree();
    pine.position.set(-12, 3.2, 3.5);
    bridgeGroup.add(pine);
    this.scene.add(bridgeGroup);

    // 5. 【胜境五 · 孤刹悬云】(x: 62, z: 10) - 绝顶飞檐八角重楼
    const templeGroup = new THREE.Group();
    templeGroup.position.set(62, 36.0, 10);
    const temple = this._buildEavedPavilion(matWood, matPillars, matRoof);
    temple.scale.set(1.4, 1.4, 1.4);
    templeGroup.add(temple);
    this.scene.add(templeGroup);

    // 6. 【胜境六 · 水心高阁】(x: 88, z: -8) - 万壑归海双层画阁水榭
    const grandGroup = new THREE.Group();
    grandGroup.position.set(88, 1.2, -8);
    const grandPavilion = this._buildTwoStoryPavilion(matWood, matPillars, matRoof);
    grandGroup.add(grandPavilion);
    const dock = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 4.5), matWood);
    dock.position.set(-11, 0.2, 0);
    grandGroup.add(dock);
    this.scene.add(grandGroup);

    // 漫山遍野散布北宋经典苍松 (50 棵古松遍布千岩万壑)
    for (let i = 0; i < 50; i++) {
      const px = (Math.random() - 0.5) * 320;
      const pz = (Math.random() - 0.5) * 220;
      const py = this._calculateTerrainHeight(px, pz);
      if (py > 2.2 && py < 30.0) {
        const p = this._buildSongPineTree();
        p.position.set(px, py, pz);
        this.scene.add(p);
      }
    }
  }

  // 打造写意宋式渔舟 (篷舟晚唱)
  _buildFishingBoat(matWood) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.ConeGeometry(1.2, 5.2, 6), matWood);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(0.65, 1.0, 0.42);
    boat.add(hull);

    const canopy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 2.1, 10, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x8A6C4A, roughness: 0.85 })
    );
    canopy.rotation.z = Math.PI / 2;
    canopy.position.set(0, 0.45, 0);
    boat.add(canopy);

    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFD56B })
    );
    lantern.position.set(2.4, 0.5, 0);
    boat.add(lantern);
    return boat;
  }

  // 打造写意茅舍农庄
  _buildCottage(matWood, matRoof) {
    const cottage = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 3.8), matWood);
    walls.position.y = 1.3;
    cottage.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.0, 4), matRoof);
    roof.position.y = 3.2;
    roof.rotation.y = Math.PI / 4;
    cottage.add(roof);
    return cottage;
  }

  // 打造写意工笔苍松虬枝 (北宋画谱经典造型 · 柔和法线绝无黑斑)
  _buildSongPineTree() {
    const pine = new THREE.Group();
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x4E351F, roughness: 0.92 });
    const matNeedles = new THREE.MeshStandardMaterial({
      color: 0x2CB588, // 鲜活孔雀石绿
      emissive: 0x145A3E,
      emissiveIntensity: 0.28,
      roughness: 0.52
    });

    // 虬曲苍劲主干
    const trunk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 2.8, 8), matTrunk);
    trunk1.position.y = 1.4;
    trunk1.rotation.z = (Math.random() - 0.5) * 0.22;
    pine.add(trunk1);

    const trunk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 8), matTrunk);
    trunk2.position.set(0.25, 3.6, 0);
    trunk2.rotation.z = -0.3 + (Math.random() - 0.5) * 0.2;
    pine.add(trunk2);

    // 采用平滑半球冠盖层叠（圆润柔和，NPR 墨线仅勾勒外轮廓）
    const layers = [
      { y: 3.2, r: 2.1, scale: [1.3, 0.48, 1.2] },
      { y: 4.4, r: 1.7, scale: [1.2, 0.45, 1.1] },
      { y: 5.4, r: 1.3, scale: [1.1, 0.42, 1.0] }
    ];

    layers.forEach(l => {
      const cluster = new THREE.Mesh(new THREE.SphereGeometry(l.r, 10, 8), matNeedles);
      cluster.scale.set(l.scale[0], l.scale[1], l.scale[2]);
      cluster.position.set(0.3 + (Math.random() - 0.5) * 0.3, l.y, (Math.random() - 0.5) * 0.3);
      pine.add(cluster);
    });

    return pine;
  }

  // 打造十里繁花写意桃树
  _buildPeachBlossomTree() {
    const tree = new THREE.Group();
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x583A24, roughness: 0.88 });
    const matPeachFoliage = new THREE.MeshStandardMaterial({
      color: 0xFFA5B8, // 娇嫩花青粉桃
      emissive: 0xDB4D6D,
      emissiveIntensity: 0.32,
      roughness: 0.45
    });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 3.2, 8), matTrunk);
    trunk.position.y = 1.6;
    trunk.rotation.z = (Math.random() - 0.5) * 0.32;
    tree.add(trunk);

    // 4 团柔软云朵状桃花冠盖
    for (let c = 0; c < 4; c++) {
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.2 + Math.random() * 0.4, 8, 8), matPeachFoliage);
      canopy.position.set(
        (Math.random() - 0.5) * 1.5,
        3.2 + Math.random() * 0.8,
        (Math.random() - 0.5) * 1.5
      );
      canopy.scale.set(1.2, 0.8, 1.1);
      tree.add(canopy);
    }

    return tree;
  }

  // 打造飞檐六角亭
  _buildEavedPavilion(matWood, matPillars, matRoof) {
    const pav = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.8, 6), matPillars);
      col.position.set(Math.cos(angle) * 2.5, 1.9, Math.sin(angle) * 2.5);
      pav.add(col);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.2, 6), matRoof);
    roof.position.y = 4.6;
    pav.add(roof);

    const finial = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xF3C93E, metalness: 0.9 })
    );
    finial.position.y = 5.9;
    pav.add(finial);
    return pav;
  }

  // 打造双层水榭高阁
  _buildTwoStoryPavilion(matWood, matPillars, matRoof) {
    const building = new THREE.Group();
    const f1 = this._buildEavedPavilion(matWood, matPillars, matRoof);
    building.add(f1);
    const f2 = this._buildEavedPavilion(matWood, matPillars, matRoof);
    f2.scale.set(0.72, 0.72, 0.72);
    f2.position.y = 4.0;
    building.add(f2);
    return building;
  }

  // 生成空气中漂浮的石青石绿矿物金粉微粒
  _buildGoldDustParticles() {
    const particleCount = 360;
    const geo = new THREE.BufferGeometry();
    const pos = [];

    for (let i = 0; i < particleCount; i++) {
      pos.push(
        (Math.random() - 0.5) * 320,
        2 + Math.random() * 40,
        (Math.random() - 0.5) * 220
      );
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xF4D068,
      size: 0.75,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.goldDustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.goldDustPoints);
  }

  _initBeasts() {
    this.beastManager = new Beast3DManager(this.scene);
    BEASTS.forEach(b => {
      this.beastManager.createBeastMesh(b);
      this._createSkyBeam(b);
    });
  }

  // 建造空灵冲天金光信标柱 (Soft Ethereal Sky Beacons)
  _createSkyBeam(beast) {
    const beamGeo = new THREE.CylinderGeometry(0.8, 3.2, 140, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(beast.goldColor),
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false, // 绝不写入深度，防止墨线边缘产生黑框
      depthTest: true
    });

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(beast.coordinates.x, beast.coordinates.y + 70, beast.coordinates.z);
    this.scene.add(beam);
    this.skyBeams[beast.id] = beam;
  }

  _initControls() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        this.tryAwakenNearBeast();
      }
      if (e.code === 'KeyM') {
        this.onExitToScroll();
      }
      if (e.code === 'Space' && this.player.isGrounded) {
        this.player.jumpVelocity = 8.5;
        this.player.isGrounded = false;
        audio.playFootstep();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // 鼠标拖拽平滑环视
    this.container.addEventListener('mousedown', (e) => {
      audio.ensureContext();
      this.isDragging = true;
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;

      this.player.yaw -= dx * 0.0032;
      this.player.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.player.pitch - dy * 0.0028));
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // 移动端单指滑动视角
    this.container.addEventListener('touchstart', (e) => {
      audio.ensureContext();
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastMouse.x = e.touches[0].clientX;
        this.lastMouse.y = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length === 0) return;
      const dx = e.touches[0].clientX - this.lastMouse.x;
      const dy = e.touches[0].clientY - this.lastMouse.y;
      this.lastMouse.x = e.touches[0].clientX;
      this.lastMouse.y = e.touches[0].clientY;

      this.player.yaw -= dx * 0.0042;
      this.player.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.player.pitch - dy * 0.0036));
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  tryAwakenNearBeast() {
    if (!this.nearestBeast || this.nearestDistance > 11.0) return null;
    const beast = this.nearestBeast;

    if (!this.awakenedZones.has(beast.id)) {
      this.awakenedZones.add(beast.id);

      if (this.skyBeams[beast.id]) {
        this.skyBeams[beast.id].material.opacity = 0.05;
      }

      this.beastManager.triggerAwaken(beast.id);
      this._triggerWorldMutation(beast);
      this.onAwakenBeast(beast);
      return beast;
    }
    return null;
  }

  _triggerWorldMutation(beast) {
    audio.playAwakeningChoral(beast.sectionIndex);

    if (this.waterMesh) {
      this.waterMesh.material.color.setHex(0x3B9E8C);
      this.waterMesh.material.emissive = new THREE.Color(beast.goldColor);
      this.waterMesh.material.emissiveIntensity = 0.35;
    }

    this.scene.fog.color.setHex(0xF8EEDC);
    this.sunLight.intensity = 2.4;

    setTimeout(() => {
      if (this.waterMesh) {
        this.waterMesh.material.emissiveIntensity = 0.05;
      }
      this.sunLight.intensity = 2.2;
    }, 4000);
  }

  teleportToBeast(beastId) {
    const beast = BEASTS.find(b => b.id === beastId);
    if (!beast) return;

    this.player.pos.set(
      beast.coordinates.x + 8.5,
      beast.coordinates.y + this.player.height,
      beast.coordinates.z + 8.5
    );

    const dir = new THREE.Vector3(beast.coordinates.x, beast.coordinates.y + 1, beast.coordinates.z)
      .sub(this.player.pos).normalize();
    this.player.yaw = Math.atan2(-dir.x, -dir.z);
    this.player.pitch = 0.05;

    audio.playEnterPaintingSound();
  }

  _updatePlayer(dt) {
    const move = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) move.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) move.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) move.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) move.x += 1;

    const isSprinting = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const currentSpeed = this.player.speed * (isSprinting ? this.player.sprintMultiplier : 1.0);

    if (move.lengthSq() > 0) {
      move.normalize();
      move.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
      this.player.pos.addScaledVector(move, currentSpeed * dt);
      if (Math.random() < 0.04) {
        audio.playFootstep();
      }
    }

    if (!this.player.isGrounded) {
      this.player.pos.y += this.player.jumpVelocity * dt;
      this.player.jumpVelocity -= 22.0 * dt;
    }

    const groundY = this._calculateTerrainHeight(this.player.pos.x, this.player.pos.z);
    if (this.player.pos.y <= groundY + this.player.height) {
      this.player.pos.y = groundY + this.player.height;
      this.player.isGrounded = true;
      this.player.jumpVelocity = 0;
    }

    this.camera.position.lerp(this.player.pos, 0.16);

    const targetLook = new THREE.Vector3(
      this.camera.position.x - Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
      this.camera.position.y + Math.sin(this.player.pitch),
      this.camera.position.z - Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
    );
    this.camera.lookAt(targetLook);
  }

  _checkBeastProximity() {
    let closestBeast = null;
    let minDistance = Infinity;
    const compassList = [];

    BEASTS.forEach(b => {
      const bPos = new THREE.Vector3(b.coordinates.x, b.coordinates.y, b.coordinates.z);
      const dist = this.player.pos.distanceTo(bPos);

      if (dist < minDistance) {
        minDistance = dist;
        closestBeast = b;
      }

      const dx = b.coordinates.x - this.player.pos.x;
      const dz = b.coordinates.z - this.player.pos.z;
      let angle = Math.atan2(dx, dz) - this.player.yaw;
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;

      compassList.push({
        id: b.id,
        name: b.name,
        dist: Math.round(dist),
        relativeAngle: angle,
        isAwakened: this.awakenedZones.has(b.id)
      });
    });

    this.nearestBeast = closestBeast;
    this.nearestDistance = minDistance;

    this.onNearBeastChange(minDistance <= 11.0 ? closestBeast : null, minDistance);
    this.onCompassUpdate(compassList, this.player.yaw);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.08);
    const time = this.clock.getElapsedTime();

    this._updatePlayer(dt);
    this._checkBeastProximity();

    if (this.beastManager) {
      this.beastManager.update(dt, time);
    }

    if (this.waterMesh) {
      this.waterMesh.position.y = 1.05 + Math.sin(time * 1.8) * 0.06;
    }

    if (this.waterfallMesh) {
      this.waterfallMesh.material.opacity = 0.82 + Math.sin(time * 8.0) * 0.14;
    }

    // 动态玉带祥云漂移
    if (this.cloudRibbons && this.cloudRibbons.length > 0) {
      this.cloudRibbons.forEach((cloud, idx) => {
        cloud.position.x += cloud.userData.speed * dt;
        if (cloud.position.x > 180) {
          cloud.position.x = -180;
        }
        cloud.position.y += Math.sin(time * 0.8 + idx) * 0.005;
      });
    }

    if (this.goldDustPoints) {
      const pos = this.goldDustPoints.geometry.attributes.position;
      for (let i = 1; i < pos.count; i += 3) {
        let py = pos.getY(i) - 0.035;
        if (py < 1.5) py = 38.0;
        pos.setY(i, py);
      }
      this.goldDustPoints.geometry.attributes.position.needsUpdate = true;
    }

    Object.entries(this.skyBeams).forEach(([id, beam]) => {
      if (!this.awakenedZones.has(id)) {
        beam.rotation.y += 0.008;
        beam.scale.x = 1.0 + Math.sin(time * 2.0) * 0.12;
        beam.scale.z = beam.scale.x;
      }
    });

    // 运行北宋工笔青绿水墨后处理管线
    if (this.postPipeline) {
      this.postPipeline.render(time);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
