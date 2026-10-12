/**
 * 《千里江山 · 山海入画》3D 沉浸式青绿大境漫步引擎 (Immersive Blue-and-Green 3D Roaming Engine)
 * 纯 WebGL / Three.js 打造，对标梵高星空 3D 沉浸漫步顶级水准
 * 融合王希孟北宋《千里江山图》真迹故宫高清矿物贴图、宣和古绢环幕、千步虹桥、水榭飞檐、苍松渔舟与山海神兽借笔还魂
 */

import * as THREE from 'three';
import { BEASTS } from './beasts.js';
import { Beast3DManager } from './beast3d.js';
import { audio } from './audio.js';

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

    // 玩家漫步物理状态 (第一人称游人/提笔知音视角)
    this.player = {
      pos: new THREE.Vector3(-45, 3.2, 28), // 初始降落在卷一 · 桃溪浅滩
      vel: new THREE.Vector3(),
      yaw: -0.65,
      pitch: 0.05,
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
    this.textureLoader = new THREE.TextureLoader();

    this._initScene();
    this._buildAtmosphereAndSky();
    this._buildTexturedTerrain();
    this._buildWaterways();
    this._buildScenicLandmarks();
    this._buildGoldDustParticles();
    this._initBeasts();
    this._initControls();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();

    // 北宋宣和古绢暖黄色温与苍茫烟岚 (#EADDC1)
    this.scene.background = new THREE.Color(0xEADDC1);
    this.scene.fog = new THREE.FogExp2(0xEADDC1, 0.0065);

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
    this.renderer.toneMappingExposure = 1.32;
    this.container.appendChild(this.renderer.domElement);

    // 东方古典漫射光照：晨曦金光与青绿岩石折射
    const hemiLight = new THREE.HemisphereLight(0xFFF9EE, 0x1A473E, 1.25);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xFFE8B2, 1.75);
    sunLight.position.set(90, 130, 55);
    this.scene.add(sunLight);
    this.sunLight = sunLight;

    window.addEventListener('resize', () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  // 建造 360 度多重视差古绢全景远山环幕
  _buildAtmosphereAndSky() {
    // 1. 最外层远天穹幕 (Radius 360)
    const bgGeo = new THREE.CylinderGeometry(360, 360, 180, 48, 1, true);
    const bgTex = this.textureLoader.load('assets/painting/section_2.jpg');
    bgTex.colorSpace = THREE.SRGBColorSpace;
    bgTex.wrapS = THREE.RepeatWrapping;
    bgTex.repeat.set(2, 1);

    const bgMat = new THREE.MeshBasicMaterial({
      map: bgTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.92,
      color: 0xFDF5E4
    });

    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.position.y = 56;
    this.scene.add(bgMesh);

    // 2. 次层重彩主峰屏障（北侧石青重彩群峦，Radius 250）
    const midGeo = new THREE.CylinderGeometry(250, 250, 130, 36, 1, true, Math.PI * 0.65, Math.PI * 0.7);
    const midTex = this.textureLoader.load('assets/painting/section_4.jpg');
    midTex.colorSpace = THREE.SRGBColorSpace;
    const midMat = new THREE.MeshBasicMaterial({
      map: midTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.88
    });
    const midMesh = new THREE.Mesh(midGeo, midMat);
    midMesh.position.set(0, 42, -15);
    this.scene.add(midMesh);

    // 3. 东侧大泽归海远岫屏障 (Radius 270)
    const seaGeo = new THREE.CylinderGeometry(270, 270, 110, 36, 1, true, 0, Math.PI * 0.6);
    const seaTex = this.textureLoader.load('assets/painting/section_5.jpg');
    seaTex.colorSpace = THREE.SRGBColorSpace;
    const seaMat = new THREE.MeshBasicMaterial({
      map: seaTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.82
    });
    const seaMesh = new THREE.Mesh(seaGeo, seaMat);
    seaMesh.position.set(0, 36, 10);
    this.scene.add(seaMesh);
  }

  // 建造真实覆盖《千里江山图》真迹矿物贴图与高精度青绿山河地貌
  _buildTexturedTerrain() {
    // 提升顶点密度 (160x120) 实现有机自然的北宋山川起伏
    const geo = new THREE.PlaneGeometry(380, 260, 160, 120);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      let y = this._calculateTerrainHeight(x, z);
      pos.setY(i, y);

      // 王希孟工笔三矾九染设色：渚岸泥金、山脚赭石、山腰石绿、绝壁石青、峰巅积翠
      const c = new THREE.Color();
      if (y < 2.0) {
        c.setHex(0xD4B886); // 渚岸泥金
      } else if (y < 6.5) {
        c.setHex(0x9E7848); // 山脚赭石
      } else if (y < 16.0) {
        c.setHex(0x1F7661); // 矿物孔雀石绿
      } else if (y < 28.0) {
        c.setHex(0x17516B); // 蓝铜矿石青
      } else {
        c.setHex(0x0E394E); // 绝巅玄青
      }
      colors.push(c.r, c.g, c.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // 加载王希孟真迹矿物画作高清贴图
    const paintingTex = this.textureLoader.load('assets/painting/section_1.jpg');
    paintingTex.colorSpace = THREE.SRGBColorSpace;
    paintingTex.wrapS = THREE.RepeatWrapping;
    paintingTex.wrapT = THREE.RepeatWrapping;
    paintingTex.repeat.set(5, 4);

    const mat = new THREE.MeshStandardMaterial({
      map: paintingTex,
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.12,
      flatShading: false
    });

    this.terrain = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrain);
  }

  // 精确计算北宋六大胜境地貌与山川起伏
  _calculateTerrainHeight(x, z) {
    let y = 0;

    // 1. 北侧绵延主峰山脉 (Z < -8)
    if (z < -8) {
      const mainWave = Math.sin(x * 0.026) * Math.cos(z * 0.035) * 25;
      const subWave = Math.sin(x * 0.07 + 1.2) * 8.0;
      const cliff = Math.pow(Math.abs(z + 8) / 120, 2.1) * 45;
      y = Math.max(0, mainWave + subWave + cliff);

      // 卷二 · 悬瀑深涧落差区 (x ≈ -18, z ≈ -35)
      const distWaterfall = Math.hypot(x - (-18), z - (-35));
      if (distWaterfall < 26) {
        y = Math.max(2.8, y * 0.5 + (distWaterfall / 26) * 12);
      }

      // 卷四 · 关隘石桥深峡 (x ≈ 38, z ≈ -15)
      const distChasm = Math.hypot(x - 38, z - (-15));
      if (distChasm < 24) {
        y = Math.max(2.0, y * 0.42 + (distChasm / 24) * 11);
      }
    } else {
      // 2. 南侧澄碧长河与缓坡丘陵、梯田浅渚 (Z >= -8)
      const riverWave = Math.sin(x * 0.03) * 2.6;
      const hills = Math.sin(x * 0.048 + 0.8) * Math.cos(z * 0.038) * 5.0;
      const slope = (z / 95) * 13;
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

    return y;
  }

  // 建造澄碧水系与微澜江波
  _buildWaterways() {
    const waterGeo = new THREE.PlaneGeometry(380, 260, 64, 48);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2A7367, // 澄碧江波 (矿物石绿微澜)
      roughness: 0.12,
      metalness: 0.55,
      transparent: true,
      opacity: 0.88
    });

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = 1.05;
    this.scene.add(this.waterMesh);
  }

  // 打造六大胜境 3D 建筑、飞瀑、长桥与植物
  _buildScenicLandmarks() {
    const matWood = new THREE.MeshStandardMaterial({ color: 0x543E2C, roughness: 0.75 });
    const matPillars = new THREE.MeshStandardMaterial({ color: 0x8C271E, roughness: 0.5 }); // 宋红立柱
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x6E3E2E, roughness: 0.45 });
    const matStone = new THREE.MeshStandardMaterial({ color: 0x485854, roughness: 0.85 });
    const matPineTrunk = new THREE.MeshStandardMaterial({ color: 0x362719, roughness: 0.92 });
    const matPineNeedles = new THREE.MeshStandardMaterial({ color: 0x144A3A, roughness: 0.55 });
    const matPeachFoliage = new THREE.MeshStandardMaterial({
      color: 0xE88192,
      roughness: 0.6,
      emissive: 0x942B3E,
      emissiveIntensity: 0.2
    });

    // 1. 【胜境一 · 桃溪浅滩】(x: -45, z: 28)
    const peachGroup = new THREE.Group();
    peachGroup.position.set(-45, 1.2, 28);
    for (let i = 0; i < 9; i++) {
      const tree = new THREE.Group();
      tree.position.set((Math.random() - 0.5) * 24, 0, (Math.random() - 0.5) * 20);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 3.2, 6), matPineTrunk);
      trunk.position.y = 1.6;
      trunk.rotation.z = (Math.random() - 0.5) * 0.35;
      tree.add(trunk);
      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 1), matPeachFoliage);
      canopy.position.y = 3.5;
      canopy.scale.set(1.4, 0.9, 1.2);
      tree.add(canopy);
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
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2 + Math.random() * 2.8, 1), matStone);
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

    // 飞跨深涧的朱红木拱
    const bridgeArch = new THREE.Mesh(
      new THREE.TorusGeometry(13.0, 1.1, 8, 28, Math.PI * 0.65),
      new THREE.MeshStandardMaterial({ color: 0x8A2A20, roughness: 0.55 })
    );
    bridgeArch.rotation.z = Math.PI * 0.175;
    bridgeArch.position.y = -2.2;
    bridgeGroup.add(bridgeArch);

    // 桥面与桥栏
    const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 0.45, 3.6), matWood);
    deck.position.set(0, 4.3, 0);
    deck.rotation.z = 0.04;
    bridgeGroup.add(deck);

    // 桥头守桥古松
    const pine = this._buildSongPineTree(matPineTrunk, matPineNeedles);
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

    // 漫山遍野散布北宋经典苍松虬枝 (45 棵古松遍布千岩万壑)
    for (let i = 0; i < 45; i++) {
      const px = (Math.random() - 0.5) * 320;
      const pz = (Math.random() - 0.5) * 220;
      const py = this._calculateTerrainHeight(px, pz);
      if (py > 2.2 && py < 30.0) {
        const p = this._buildSongPineTree(matPineTrunk, matPineNeedles);
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
      new THREE.MeshStandardMaterial({ color: 0x6E563B, roughness: 0.85 })
    );
    canopy.rotation.z = Math.PI / 2;
    canopy.position.set(0, 0.45, 0);
    boat.add(canopy);

    // 船头夜钓暖灯
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFE082 })
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

  // 打造北宋名画同款苍松虬枝 (Layered Fan-Shaped Needle Discs)
  _buildSongPineTree(matTrunk, matNeedles) {
    const pine = new THREE.Group();
    // 弯曲苍劲的树干
    const trunk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.8, 6), matTrunk);
    trunk1.position.y = 1.4;
    trunk1.rotation.z = (Math.random() - 0.5) * 0.25;
    pine.add(trunk1);

    const trunk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6), matTrunk);
    trunk2.position.set(0.25, 3.6, 0);
    trunk2.rotation.z = -0.3 + (Math.random() - 0.5) * 0.2;
    pine.add(trunk2);

    // 三层宋画扁平扇形松针簇
    const layers = [
      { y: 3.2, r: 2.2 },
      { y: 4.4, r: 1.8 },
      { y: 5.4, r: 1.3 }
    ];
    layers.forEach(l => {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(l.r * 0.6, l.r, 0.45, 8), matNeedles);
      disc.position.set(0.3 + (Math.random() - 0.5) * 0.3, l.y, (Math.random() - 0.5) * 0.3);
      disc.scale.set(1.1, 0.8, 1.0);
      pine.add(disc);
    });
    return pine;
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
    // 翘角飞檐大顶
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.2, 6), matRoof);
    roof.position.y = 4.6;
    pav.add(roof);

    // 顶端金宝珠
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
    const particleCount = 320;
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
      blending: THREE.AdditiveBlending
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

  // 建造冲天金光信标柱 (Sky Beacons)
  _createSkyBeam(beast) {
    const beamGeo = new THREE.CylinderGeometry(0.35, 1.4, 95, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(beast.goldColor),
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(beast.coordinates.x, beast.coordinates.y + 47.5, beast.coordinates.z);
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
        this.skyBeams[beast.id].material.opacity = 0.08;
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
      this.waterMesh.material.color.setHex(0x3B8F80);
      this.waterMesh.material.emissive = new THREE.Color(beast.goldColor);
      this.waterMesh.material.emissiveIntensity = 0.35;
    }

    this.scene.fog.color.setHex(0xF6ECD9);
    this.sunLight.intensity = 2.2;

    setTimeout(() => {
      if (this.waterMesh) {
        this.waterMesh.material.emissiveIntensity = 0.05;
      }
      this.sunLight.intensity = 1.75;
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
        beam.rotation.y += 0.012;
        beam.scale.x = 1.0 + Math.sin(time * 2.5) * 0.15;
        beam.scale.z = beam.scale.x;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }
}
