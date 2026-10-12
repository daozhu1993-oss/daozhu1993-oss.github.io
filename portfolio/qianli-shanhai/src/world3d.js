/**
 * 《千里江山 · 山海入画》3D 沉浸式青绿大境漫步引擎 (Immersive Blue-and-Green 3D Roaming Engine)
 * 纯 WebGL / Three.js 打造，北宋院体青绿重彩与山海经通灵画境
 * 
 * 核心设计规范：
 * 1. 【真迹通景画境 (Master Stitched Texture)】：
 *    将王希孟近十二米真迹五大段高清画卷按自然长宽比绘制进 4096 宽屏画布纹理。
 * 2. 【海拔高度自适应 UV 投影 (Elevation-Aware UV Mapping)】：
 *    采用海拔高度 Y 轴主导的 V 轴投影，彻底消灭绝壁垂直条纹拉伸，山川苍翠如真迹。
 * 3. 【舒啸望江矶 · 纯净无遮挡初登全景 (Open Scenic Overlook)】：
 *    开阔石矶台地，无栏无障，视野纯净开阔，澄碧大江、千步虹桥、临渊飞流与首尊神兽【鹿蜀】一览无余。
 * 4. 【空灵柔和信标光柱与写意飞瀑 (Soft Beacons & Embedded Waterfall)】：
 *    细巧微透暖金光柱，依山势深峡而流的幽涧清泉，绝无刺眼白斑或硬塑料板。
 * 5. 【宋画写意苍松与繁花 (Painterly Song Pines & Blossoms)】：
 *    苍劲虬枝与精巧孔雀石松团、春江桃林，搭配青石古道与暖木明灯，构筑意境深远的国风艺术世界。
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

    // 玩家漫步物理状态 (初始登临：高台舒啸望江矶，视线开阔无挡)
    this.player = {
      pos: new THREE.Vector3(-24, 12.5, 38),
      vel: new THREE.Vector3(),
      yaw: -0.42, // 朝向东北，一览澄碧江心、千步虹桥与远峦
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
    this.awakenedZones = new Set();
    this.masterPaintingTex = null;

    this._initScene();
    this._initMasterPaintingTexture();
    this._buildAtmosphereAndSky();
    this._buildTexturedTerrain();
    this._buildWaterways();
    this._buildStoneRoadAndLanterns();
    this._buildSpawnOverlookPlatform();
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
    this.scene.fog = new THREE.FogExp2(0xF5ECD8, 0.0044);

    this.camera = new THREE.PerspectiveCamera(
      62,
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
    this.renderer.toneMappingExposure = 1.36;
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

    // 1. 预填北宋宫廷宣和绢本矿物色阶底色
    const grad = ctx.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0.00, '#1B5374'); // 远山石青宝石蓝
    grad.addColorStop(0.28, '#247D9E'); // 奇峰霁青
    grad.addColorStop(0.50, '#279875'); // 崇山孔雀石绿
    grad.addColorStop(0.72, '#9E743F'); // 山脚温润赭石
    grad.addColorStop(0.88, '#CDB078'); // 渚岸泥金
    grad.addColorStop(1.00, '#E8DDB8'); // 宣和古绢暖米黄
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4096, 1024);

    this.masterPaintingTex = new THREE.CanvasTexture(canvas);
    this.masterPaintingTex.colorSpace = THREE.SRGBColorSpace;
    this.masterPaintingTex.wrapS = THREE.ClampToEdgeWrapping;
    this.masterPaintingTex.wrapT = THREE.ClampToEdgeWrapping;
    this.masterPaintingTex.generateMipmaps = true;
    this.masterPaintingTex.minFilter = THREE.LinearMipmapLinearFilter;

    // 2. 异步将五大段《千里江山图》故宫高清原卷平滑裁切拼接进画布（保持青绿山水优美自然比例）
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
        const cropW = Math.min(img.width, 2400);
        const cropH = img.height;
        const cropX = Math.max(0, (img.width - cropW) * 0.5);
        ctx.drawImage(img, cropX, 0, cropW, cropH, sec.sx, 0, sec.sw, 1024);
        this.masterPaintingTex.needsUpdate = true;
      };
      img.src = `assets/painting/section_${sec.id}.jpg`;
    });
  }

  // 建造 360 度无缝古绢穹顶与天际金辉
  _buildAtmosphereAndSky() {
    const skyGeo = new THREE.SphereGeometry(380, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const skyCv = document.createElement('canvas');
    skyCv.width = 128;
    skyCv.height = 512;
    const skyCtx = skyCv.getContext('2d');
    const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0.0, '#ECE0C8'); // 天顶温润古绢素色
    skyGrad.addColorStop(0.4, '#F5EBDA');
    skyGrad.addColorStop(0.8, '#FFF7E6'); // 天际暖金晨曦
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
    skyMesh.position.y = -8;
    this.scene.add(skyMesh);
  }

  // =========================================================================
  // 建造覆盖《千里江山图》高清真迹贴图的三维矿物重彩山河
  // 【海拔自适应 UV 投影】：V 轴由海拔 Y 驱动，彻底消灭绝壁拉伸！
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

      // 【核心突破】：U 沿画卷横向行进，V 沿山体海拔高度平滑上升
      const u = (x + 190.0) / 380.0;
      const v = Math.max(0.05, Math.min(0.96, (y * 0.82 + Math.max(0, -z) * 0.20) / 32.0));
      uvs.setXY(i, Math.max(0.0, Math.min(1.0, u)), v);

      // 顶点颜色辅助增强底色厚重感
      const c = new THREE.Color();
      if (y < 2.5) {
        c.setHex(0xE2BF7D); // 澄碧渚岸暖金赭石
      } else if (y < 7.0) {
        c.setHex(0xB58245); // 山脚温润赭石
      } else if (y < 16.0) {
        c.setHex(0x289C7C); // 矿物孔雀石绿
      } else if (y < 24.0) {
        c.setHex(0x2382B8); // 蓝铜矿天青宝石蓝
      } else {
        c.setHex(0x1B5A85); // 绝巅群青
      }
      colors.push(c.r, c.g, c.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: this.masterPaintingTex,
      emissive: 0x24483C,
      emissiveMap: this.masterPaintingTex,
      emissiveIntensity: 0.32,
      roughness: 0.82,
      metalness: 0.04,
      flatShading: false
    });

    this.terrain = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrain);
  }

  // 精确计算北宋胜境起伏自然地貌（平滑连续，自然舒展）
  _calculateTerrainHeight(x, z) {
    // 1. 南侧观景开阔高台 (出生地附近: x ≈ -24, z ≈ 38)
    const distOverlook = Math.hypot(x - (-24), z - 38);
    let overlook = 0;
    if (distOverlook < 24) {
      overlook = (1.0 - distOverlook / 24) * 11.2;
    }

    // 2. 澄碧长河与舒缓渚岸波浪 (z in [-10, 45])
    const shoreHills = Math.sin(x * 0.038 + 0.4) * Math.cos(z * 0.032) * 2.8;

    // 3. 北侧青绿崇峦主峰脉络 (z < -8，平缓隆起层叠成峰)
    let mountain = 0;
    if (z < -8) {
      const depth = Math.min(1.0, (-8 - z) / 85.0);
      const ridgeA = Math.sin(x * 0.032 + 0.8) * 10.0;
      const ridgeB = Math.cos(x * 0.065 - 1.2) * 5.5;
      const ridgeC = Math.sin(x * 0.016) * 12.0;
      mountain = depth * (14.0 + ridgeA + ridgeB + ridgeC);

      // 卷二 · 瀑布深涧 (x ≈ -18, z ≈ -35)
      const dWaterfall = Math.hypot(x - (-18), z - (-35));
      if (dWaterfall < 20) {
        mountain = Math.max(3.2, mountain * 0.5 + (dWaterfall / 20) * 9.0);
      }

      // 卷四 · 关隘长桥山峡 (x ≈ 38, z ≈ -15)
      const dBridgeChasm = Math.hypot(x - 38, z - (-15));
      if (dBridgeChasm < 18) {
        mountain = Math.max(2.4, mountain * 0.45 + (dBridgeChasm / 18) * 7.5);
      }

      // 卷五 · 孤峰凌霄 (x ≈ 65, z ≈ -25)
      const dPeak = Math.hypot(x - 65, z - (-25));
      if (dPeak < 22) {
        mountain = Math.max(mountain, 16.0 + (1.0 - dPeak / 22) * 18.0);
      }
    }

    let y = 1.2 + shoreHills + mountain + overlook;

    // 卷六 · 大泽水心浅洲 (x ≈ 88, z ≈ -8)
    const dPavilion = Math.hypot(x - 88, z - (-8));
    if (dPavilion < 18) {
      y = Math.min(y, 2.0);
    }

    return Math.max(0.6, y);
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
  // 打造初登高台 · 舒啸望江台 (Open Scenic Lookout Overlook at Spawn)
  // 【无栏无障纯净全景视口】：广阔石矶，视野彻底开阔！
  // =========================================================================
  _buildSpawnOverlookPlatform() {
    const group = new THREE.Group();
    group.position.set(-24, 10.8, 38);

    const matStone = new THREE.MeshStandardMaterial({ color: 0xD6C6A8, roughness: 0.82 });

    // 宽阔平展的圆形观景石矶台（高出地表 0.18m，前方毫无遮挡）
    const stonePlatform = new THREE.Mesh(new THREE.CylinderGeometry(7.0, 7.6, 0.35, 24), matStone);
    stonePlatform.position.y = 0.18;
    group.add(stonePlatform);

    // 望江台两侧点缀两盏古雅立灯
    const l1 = this._buildTrailLantern(5.6, 0.2, 2.0);
    const l2 = this._buildTrailLantern(-5.6, 0.2, 2.0);
    group.add(l1);
    group.add(l2);

    // 台侧后方掩映写意苍松与春桃
    const sidePine = this._buildSongPineTree();
    sidePine.position.set(-9.0, 0, 5.5);
    group.add(sidePine);

    const sidePeach = this._buildPeachBlossomTree();
    sidePeach.position.set(8.8, 0, 6.5);
    group.add(sidePeach);

    this.scene.add(group);
  }

  // 建造青石古道与引路明灯 (Walkable Scenic Pathway with Lanterns)
  _buildStoneRoadAndLanterns() {
    const roadPoints = [
      new THREE.Vector3(-24, 10.8, 38), // 起点望江石矶
      new THREE.Vector3(-32, 7.2, 34),  // 下坡步道
      new THREE.Vector3(-40, 4.0, 30),  // 临溪桃林
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
      color: 0xC8B490,
      roughness: 0.90
    });

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

        if (s % 3 === 0 && (i % 2 === 0)) {
          const l = this._buildTrailLantern(pos.x + 1.8, pos.y, pos.z);
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
    for (let i = 0; i < 8; i++) {
      const tree = this._buildPeachBlossomTree();
      tree.position.set((Math.random() - 0.5) * 26, 0, (Math.random() - 0.5) * 22);
      peachGroup.add(tree);
    }
    const boat = this._buildFishingBoat(matWood);
    boat.position.set(6, 0.2, -5);
    boat.rotation.y = 0.5;
    peachGroup.add(boat);
    this.scene.add(peachGroup);

    // 2. 【胜境二 · 悬泉幽涧】(x: -18, z: -35) - 依附于岩壑绝壁内的写意飞瀑
    const fallsGroup = new THREE.Group();
    fallsGroup.position.set(-18, 1.0, -36);
    const fallGeo = new THREE.PlaneGeometry(3.5, 11, 1, 8);
    const fallMat = new THREE.MeshStandardMaterial({
      color: 0x529E94,
      emissive: 0x1E5850,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      roughness: 0.25
    });
    const fallMesh = new THREE.Mesh(fallGeo, fallMat);
    fallMesh.position.set(0, 5.5, 0);
    fallMesh.rotation.y = 0.22;
    fallsGroup.add(fallMesh);
    this.waterfallMesh = fallMesh;

    for (let i = 0; i < 5; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.0 + Math.random() * 2.2, 1), matStone);
      rock.position.set((Math.random() - 0.5) * 14, 1.5, (Math.random() - 0.5) * 10);
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
    templeGroup.position.set(62, 32.0, 10);
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

    // 漫山遍野散布北宋经典苍松 (35 棵古松自然依山势而立)
    for (let i = 0; i < 35; i++) {
      const px = (Math.random() - 0.5) * 320;
      const pz = (Math.random() - 0.5) * 200;
      if (Math.hypot(px - (-24), pz - 38) < 18) continue;
      const py = this._calculateTerrainHeight(px, pz);
      if (py > 2.0 && py < 26.0) {
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

  // =========================================================================
  // 打造写意工笔苍松虬枝 (北宋画谱经典造型 · 枝叶舒展雅致)
  // =========================================================================
  _buildSongPineTree() {
    const pine = new THREE.Group();
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x3E2818, roughness: 0.90 });
    const matNeedles = new THREE.MeshStandardMaterial({
      color: 0x1E7A5A, // 雅致深沉孔雀石绿
      emissive: 0x0E4230,
      emissiveIntensity: 0.22,
      roughness: 0.65
    });

    // 虬曲苍劲主干
    const trunk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 2.6, 7), matTrunk);
    trunk1.position.y = 1.3;
    trunk1.rotation.z = (Math.random() - 0.5) * 0.18;
    pine.add(trunk1);

    const trunk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.2, 7), matTrunk);
    trunk2.position.set(0.18, 3.2, 0);
    trunk2.rotation.z = -0.25 + (Math.random() - 0.5) * 0.15;
    pine.add(trunk2);

    // 优雅侧出小枝与平展松针团
    const branches = [
      { y: 2.8, angle: 0.4,  len: 1.6, scale: [1.2, 0.35, 1.0] },
      { y: 3.7, angle: -0.5, len: 1.4, scale: [1.1, 0.32, 0.9] },
      { y: 4.5, angle: 0.2,  len: 1.1, scale: [0.9, 0.28, 0.8] }
    ];

    branches.forEach(b => {
      const bGroup = new THREE.Group();
      bGroup.position.set(0.2, b.y, 0);
      bGroup.rotation.z = b.angle;

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.10, b.len, 5), matTrunk);
      arm.position.y = b.len * 0.5;
      bGroup.add(arm);

      const cluster = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), matNeedles);
      cluster.scale.set(b.scale[0], b.scale[1], b.scale[2]);
      cluster.position.y = b.len;
      bGroup.add(cluster);

      pine.add(bGroup);
    });

    return pine;
  }

  // 打造十里繁花写意桃树
  _buildPeachBlossomTree() {
    const tree = new THREE.Group();
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x4A2E1A, roughness: 0.88 });
    const matPeachFoliage = new THREE.MeshStandardMaterial({
      color: 0xEE8FA2, // 娇嫩花青粉桃
      emissive: 0xB53250,
      emissiveIntensity: 0.25,
      roughness: 0.55
    });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 2.8, 7), matTrunk);
    trunk.position.y = 1.4;
    trunk.rotation.z = (Math.random() - 0.5) * 0.25;
    tree.add(trunk);

    for (let c = 0; c < 3; c++) {
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), matPeachFoliage);
      canopy.position.set(
        (Math.random() - 0.5) * 1.4,
        2.8 + c * 0.6,
        (Math.random() - 0.5) * 1.4
      );
      canopy.scale.set(1.2, 0.6, 1.1);
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

  // 建造空灵冲天暖金信标柱 (Soft Ethereal Amber Beacons)
  _createSkyBeam(beast) {
    const beamGeo = new THREE.CylinderGeometry(0.25, 0.85, 90, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xF5CF68, // 柔和暖金琥珀色，绝无刺眼白斑
      transparent: true,
      opacity: 0.12,
      side: THREE.FrontSide, // 单面渲染，防止重叠双倍过亮
      blending: THREE.AdditiveBlending,
      depthWrite: false, // 绝不写入深度，防止墨线边缘产生黑框
      depthTest: true
    });

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(beast.coordinates.x, beast.coordinates.y + 45, beast.coordinates.z);
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
        this.skyBeams[beast.id].material.opacity = 0.03;
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
      this.waterfallMesh.material.opacity = 0.55 + Math.sin(time * 6.0) * 0.10;
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
        beam.scale.x = 1.0 + Math.sin(time * 2.0) * 0.10;
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
