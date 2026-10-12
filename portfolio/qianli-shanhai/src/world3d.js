/**
 * 《千里江山 · 山海入画》3D 沉浸式青绿大境漫步引擎 (Immersive Blue-and-Green 3D Roaming Engine)
 * 纯 WebGL / Three.js 打造，对标梵高星空 3D 沉浸漫步体验
 * 融合王希孟北宋石青石绿重彩、层峦叠嶂、宋代水榭木桥、六大胜境地貌与山海神兽借笔还魂
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
      pos: new THREE.Vector3(-45, 3.5, 38), // 初始降落在卷一 · 桃溪浅滩
      vel: new THREE.Vector3(),
      yaw: -0.6,
      pitch: 0.05,
      speed: 13.5,
      sprintMultiplier: 1.8,
      height: 2.1,
      isGrounded: true,
      jumpVelocity: 0
    };

    this.keys = {};
    this.isDragging = false;
    this.isPointerLocked = false;
    this.lastMouse = { x: 0, y: 0 };
    this.clock = new THREE.Clock();

    // 交互与近邻神兽检测
    this.nearestBeast = null;
    this.nearestDistance = Infinity;
    this.activeBeastData = null;

    // 场景动态对象缓存
    this.waterMesh = null;
    this.skyBeams = {};
    this.goldDustPoints = null;
    this.waterfallMesh = null;
    this.waterfallParticles = null;
    this.awakenedZones = new Set();
    this.scenicGroups = [];

    this._initScene();
    this._buildAtmosphere();
    this._buildTerrain();
    this._buildWaterways();
    this._buildScenicLandmarks();
    this._buildGoldDustParticles();
    this._initBeasts();
    this._initControls();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();

    // 北宋古绢发黄的温润天光与苍茫烟岚
    this.scene.background = new THREE.Color(0xEADEC7);
    this.scene.fog = new THREE.FogExp2(0xEADEC7, 0.0072);

    this.camera = new THREE.PerspectiveCamera(
      62,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1200
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.appendChild(this.renderer.domElement);

    // 东方古典漫射光照：晨曦金光与青绿岩石折射
    const hemiLight = new THREE.HemisphereLight(0xFFF9EC, 0x1A473E, 1.05);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xFFE8AB, 1.55);
    sunLight.position.set(70, 110, 45);
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

  _buildAtmosphere() {
    // 远方环幕：北宋绢本真迹层叠远峦背景
    const bgGeo = new THREE.CylinderGeometry(280, 280, 140, 48, 1, true);
    const textureLoader = new THREE.TextureLoader();
    const bgTex = textureLoader.load('assets/painting/section_2.jpg');
    bgTex.colorSpace = THREE.SRGBColorSpace;
    bgTex.wrapS = THREE.RepeatWrapping;
    bgTex.repeat.set(2, 1);

    const bgMat = new THREE.MeshBasicMaterial({
      map: bgTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.88,
      color: 0xF5ECD7
    });

    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.position.y = 45;
    this.scene.add(bgMesh);
  }

  // 建造起伏壮丽的王希孟石青石绿地形（长横卷式 3D 纵深大千世界）
  _buildTerrain() {
    // 宽幅大地：横跨 380 丈，深 260 丈
    const geo = new THREE.PlaneGeometry(380, 260, 110, 80);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      let y = this._calculateTerrainHeight(x, z);
      pos.setY(i, y);

      // 王希孟三矾九染青绿着色：
      // 水畔平沙为泥金与赭石，半山为石绿孔雀翠，主峰绝巅为幽深石青，峰脊泛出金碧泥金
      const c = new THREE.Color();
      if (y < 2.0) {
        c.setHex(0xCDB380); // 渚岸泥金与沙洲赭黄
      } else if (y < 6.5) {
        c.setHex(0x9E7D4C); // 山脚温润赭石
      } else if (y < 16.0) {
        // 山腰苍翠石绿 (矿物孔雀石绿)
        c.setHex(0x1F6B58);
      } else if (y < 28.0) {
        // 中峰深邃石青 (蓝铜矿石青)
        c.setHex(0x164C63);
      } else {
        // 绝顶傲云玄青带微金
        c.setHex(0x0E384D);
      }

      colors.push(c.r, c.g, c.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.18,
      flatShading: true
    });

    this.terrain = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrain);
  }

  // 地形高度计算逻辑（融入六大胜境地貌）
  _calculateTerrainHeight(x, z) {
    let y = 0;

    // 1. 北侧绵延主峰山脉 (Z < -10)
    if (z < -8) {
      const mainWave = Math.sin(x * 0.028) * Math.cos(z * 0.038) * 24;
      const subWave = Math.sin(x * 0.075 + 1.2) * 8.5;
      const cliff = Math.pow(Math.abs(z + 8) / 120, 2.1) * 44;
      y = Math.max(0, mainWave + subWave + cliff);

      // 卷二 · 悬瀑深涧凹陷处 (x ≈ -18, z ≈ -35)
      const distWaterfall = Math.hypot(x - (-18), z - (-35));
      if (distWaterfall < 26) {
        y = Math.max(2.5, y * 0.45 + (distWaterfall / 26) * 14);
      }

      // 卷四 · 关隘石峡深谷 (x ≈ 38, z ≈ -15)
      const distChasm = Math.hypot(x - 38, z - (-15));
      if (distChasm < 22) {
        y = Math.max(1.8, y * 0.4 + (distChasm / 22) * 12);
      }
    } else {
      // 2. 南侧澄碧长河与缓坡丘陵、梯田浅渚 (Z >= -8)
      const riverWave = Math.sin(x * 0.032) * 2.8;
      const hills = Math.sin(x * 0.05 + 0.8) * Math.cos(z * 0.04) * 5.2;
      const slope = (z / 95) * 14;
      y = Math.max(0.6, hills + slope + riverWave);

      // 卷一 · 桃溪浅滩低洼区 (x ≈ -45, z ≈ 28)
      const distPeach = Math.hypot(x - (-45), z - 28);
      if (distPeach < 24) {
        y = Math.min(y, 1.2 + (distPeach / 24) * 2.2);
      }

      // 卷三 · 麦陇梯田台地 (x ≈ 12, z ≈ 42)
      const distPaddy = Math.hypot(x - 12, z - 42);
      if (distPaddy < 28) {
        const step = Math.floor(y * 1.5) / 1.5;
        y = step + 1.2;
      }
    }

    // 卷五 · 孤峰凌霄险拔主峰 (x ≈ 62, z ≈ 10)
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

  // 建造澄碧水系与流动江波
  _buildWaterways() {
    const waterGeo = new THREE.PlaneGeometry(380, 260, 48, 36);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3E8079, // 澄碧江水，透着宋绢温润
      roughness: 0.12,
      metalness: 0.45,
      transparent: true,
      opacity: 0.84
    });

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = 1.05;
    this.scene.add(this.waterMesh);
  }

  // 打造王希孟名画六大胜境 3D 建筑与地貌
  _buildScenicLandmarks() {
    // 材质复用库
    const matWood = new THREE.MeshStandardMaterial({ color: 0x58402D, roughness: 0.8 });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x8C4931, roughness: 0.5 });
    const matPineTrunk = new THREE.MeshStandardMaterial({ color: 0x38291A, roughness: 0.9 });
    const matPineNeedles = new THREE.MeshStandardMaterial({ color: 0x1B4E40, roughness: 0.6 });
    const matPeachFoliage = new THREE.MeshStandardMaterial({ color: 0xE88B97, roughness: 0.6, emissive: 0x8C3240, emissiveIntensity: 0.15 });
    const matStone = new THREE.MeshStandardMaterial({ color: 0x485854, roughness: 0.85 });

    // -------------------------------------------------------------
    // 【胜境一 · 卷一 桃溪浅滩】(x: -45, z: 28) - 桃花树、钓舟、草舍
    // -------------------------------------------------------------
    const peachGroup = new THREE.Group();
    peachGroup.position.set(-45, 1.2, 28);

    // 种植桃林
    for (let i = 0; i < 9; i++) {
      const tree = new THREE.Group();
      const ox = (Math.random() - 0.5) * 22;
      const oz = (Math.random() - 0.5) * 18;
      tree.position.set(ox, 0, oz);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 3.2, 5), matPineTrunk);
      trunk.position.y = 1.6;
      trunk.rotation.z = (Math.random() - 0.5) * 0.3;
      tree.add(trunk);

      // 粉白桃花冠
      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 1), matPeachFoliage);
      canopy.position.y = 3.4;
      canopy.scale.set(1.4, 0.9, 1.2);
      tree.add(canopy);
      peachGroup.add(tree);
    }

    // 停泊江畔的宋代乌篷钓舟
    const boat = this._buildFishingBoat(matWood);
    boat.position.set(6, 0.2, -5);
    boat.rotation.y = 0.5;
    peachGroup.add(boat);
    this.scene.add(peachGroup);

    // -------------------------------------------------------------
    // 【胜境二 · 卷二 悬泉幽涧】(x: -18, z: -35) - 百丈双叠飞瀑与深潭
    // -------------------------------------------------------------
    const fallsGroup = new THREE.Group();
    fallsGroup.position.set(-18, 0, -35);

    // 垂落千尺的白练飞瀑平面
    const fallGeo = new THREE.PlaneGeometry(7.5, 34, 1, 12);
    const fallMat = new THREE.MeshStandardMaterial({
      color: 0xEDF7F6,
      emissive: 0xCAEAEA,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.88,
      roughness: 0.1
    });
    const fallMesh = new THREE.Mesh(fallGeo, fallMat);
    fallMesh.position.set(0, 18, -4);
    fallMesh.rotation.y = 0.2;
    fallsGroup.add(fallMesh);
    this.waterfallMesh = fallMesh;

    // 潭边嶙峋巨石
    for (let i = 0; i < 6; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.0 + Math.random() * 2.5, 1), matStone);
      rock.position.set((Math.random() - 0.5) * 16, 2.0, (Math.random() - 0.5) * 10);
      fallsGroup.add(rock);
    }
    this.scene.add(fallsGroup);

    // -------------------------------------------------------------
    // 【胜境三 · 卷三 麦陇晚烟】(x: 12, z: 42) - 层叠梯田、竹篱草舍茅亭
    // -------------------------------------------------------------
    const paddyGroup = new THREE.Group();
    paddyGroup.position.set(12, 1.5, 42);

    // 茅亭水榭
    const cottage = this._buildCottage(matWood, matRoof);
    cottage.position.set(4, 1.0, -3);
    paddyGroup.add(cottage);

    // 几只金麦草垛
    const matWheat = new THREE.MeshStandardMaterial({ color: 0xD6A84F, roughness: 0.7 });
    for (let i = 0; i < 5; i++) {
      const hay = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 6), matWheat);
      hay.position.set((Math.random() - 0.5) * 14 - 4, 1.0, (Math.random() - 0.5) * 12);
      paddyGroup.add(hay);
    }
    this.scene.add(paddyGroup);

    // -------------------------------------------------------------
    // 【胜境四 · 卷四 关隘长桥】(x: 38, z: -15) - 宋代朱木拱桥飞渡深涧天堑
    // -------------------------------------------------------------
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(38, 2.5, -15);

    // 跨越 24 丈长涧的木拱长桥
    const bridgeArch = new THREE.Mesh(
      new THREE.TorusGeometry(12.0, 1.2, 8, 24, Math.PI * 0.65),
      new THREE.MeshStandardMaterial({ color: 0x7A3626, roughness: 0.6 })
    );
    bridgeArch.rotation.z = Math.PI * 0.17;
    bridgeArch.position.y = -2;
    bridgeGroup.add(bridgeArch);

    // 桥面桥板与两侧栏杆
    const deck = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 3.2), matWood);
    deck.position.set(0, 4.2, 0);
    deck.rotation.z = 0.05;
    bridgeGroup.add(deck);

    // 桥头关隘古松
    const pine = this._buildPineTree(matPineTrunk, matPineNeedles);
    pine.position.set(-11, 3.0, 3);
    bridgeGroup.add(pine);
    this.scene.add(bridgeGroup);

    // -------------------------------------------------------------
    // 【胜境五 · 卷五 孤刹悬云】(x: 62, z: 10) - 绝壁孤峰古刹道观
    // -------------------------------------------------------------
    const templeGroup = new THREE.Group();
    templeGroup.position.set(62, 36.0, 10);

    // 悬空山顶仙亭飞檐
    const temple = this._buildSixCornerPavilion(matWood, matRoof);
    temple.scale.set(1.3, 1.3, 1.3);
    templeGroup.add(temple);

    // 环绕峰顶的苍翠云松
    const peakPine = this._buildPineTree(matPineTrunk, matPineNeedles);
    peakPine.position.set(4, 0, -2);
    templeGroup.add(peakPine);
    this.scene.add(templeGroup);

    // -------------------------------------------------------------
    // 【胜境六 · 卷六 水心高阁】(x: 88, z: -8) - 湖心两层重楼水榭
    // -------------------------------------------------------------
    const grandGroup = new THREE.Group();
    grandGroup.position.set(88, 1.2, -8);

    const grandPavilion = this._buildTwoStoryPavilion(matWood, matRoof);
    grandGroup.add(grandPavilion);

    // 水榭引桥木栈道
    const dock = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 4.0), matWood);
    dock.position.set(-10, 0.2, 0);
    grandGroup.add(dock);
    this.scene.add(grandGroup);

    // 漫山遍野散布百棵宋代苍松与顽石
    this._scatterWildPines(matPineTrunk, matPineNeedles);
  }

  // 散布山野古松
  _scatterWildPines(matTrunk, matNeedles) {
    for (let i = 0; i < 45; i++) {
      const px = (Math.random() - 0.5) * 320;
      const pz = (Math.random() - 0.5) * 220;
      const py = this._calculateTerrainHeight(px, pz);

      if (py > 2.2 && py < 30.0) {
        const pine = this._buildPineTree(matTrunk, matNeedles);
        pine.position.set(px, py, pz);
        this.scene.add(pine);
      }
    }
  }

  _buildFishingBoat(matWood) {
    const boat = new THREE.Group();
    // 船体
    const hull = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4.8, 5), matWood);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(0.6, 1.0, 0.4);
    boat.add(hull);

    // 芦席半圆乌篷
    const canopy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 1.8, 8, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x6E563B, roughness: 0.9 })
    );
    canopy.rotation.z = Math.PI / 2;
    canopy.position.set(0, 0.4, 0);
    boat.add(canopy);
    return boat;
  }

  _buildCottage(matWood, matRoof) {
    const cottage = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.6), matWood);
    walls.position.y = 1.2;
    cottage.add(walls);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.0, 1.8, 4), matRoof);
    roof.position.y = 3.0;
    roof.rotation.y = Math.PI / 4;
    cottage.add(roof);
    return cottage;
  }

  _buildPineTree(matTrunk, matNeedles) {
    const pine = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, 4.8, 5), matTrunk);
    trunk.position.y = 2.4;
    trunk.rotation.z = (Math.random() - 0.5) * 0.3;
    pine.add(trunk);

    for (let j = 0; j < 3; j++) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4 - j * 0.45, 1.4, 6), matNeedles);
      cap.position.y = 3.2 + j * 1.0;
      pine.add(cap);
    }
    return pine;
  }

  _buildSixCornerPavilion(matWood, matRoof) {
    const pav = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 6), matWood);
      col.position.set(Math.cos(angle) * 2.4, 1.8, Math.sin(angle) * 2.4);
      pav.add(col);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 2.0, 6), matRoof);
    roof.position.y = 4.4;
    pav.add(roof);
    return pav;
  }

  _buildTwoStoryPavilion(matWood, matRoof) {
    const building = new THREE.Group();
    // 底层
    const f1 = this._buildSixCornerPavilion(matWood, matRoof);
    building.add(f1);

    // 二层飞檐
    const f2 = this._buildSixCornerPavilion(matWood, matRoof);
    f2.scale.set(0.72, 0.72, 0.72);
    f2.position.y = 3.8;
    building.add(f2);
    return building;
  }

  // 生成空气中漂浮的矿物金粉微粒 (Gold Mineral Dust Particles)
  _buildGoldDustParticles() {
    const particleCount = 280;
    const geo = new THREE.BufferGeometry();
    const pos = [];

    for (let i = 0; i < particleCount; i++) {
      pos.push(
        (Math.random() - 0.5) * 320,
        2 + Math.random() * 38,
        (Math.random() - 0.5) * 220
      );
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xF4D068,
      size: 0.65,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    this.goldDustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.goldDustPoints);
  }

  _initBeasts() {
    this.beastManager = new Beast3DManager(this.scene);

    BEASTS.forEach(b => {
      this.beastManager.createBeastMesh(b);
      // 为每座未唤醒神兽建立通天金光信标柱 (Sky Beam)
      this._createSkyBeam(b);
    });
  }

  _createSkyBeam(beast) {
    const beamGeo = new THREE.CylinderGeometry(0.35, 1.2, 90, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(beast.goldColor),
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
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

  // 尝试唤醒近旁神兽
  tryAwakenNearBeast() {
    if (!this.nearestBeast || this.nearestDistance > 11.0) return null;
    const beast = this.nearestBeast;

    // 若尚未唤醒
    if (!this.awakenedZones.has(beast.id)) {
      this.awakenedZones.add(beast.id);

      // 解除通天信标光束，转化为扩散金环
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

  // 神兽唤醒时的山川还魂异象大动效
  _triggerWorldMutation(beast) {
    audio.playAwakeningChoral(beast.sectionIndex);

    // 水面泛起融金琉璃光
    if (this.waterMesh) {
      this.waterMesh.material.color.setHex(0x52998F);
      this.waterMesh.material.emissive = new THREE.Color(beast.goldColor);
      this.waterMesh.material.emissiveIntensity = 0.35;
    }

    // 天光破晓金辉
    this.scene.fog.color.setHex(0xF6ECD9);
    this.sunLight.intensity = 2.2;

    setTimeout(() => {
      if (this.waterMesh) {
        this.waterMesh.material.emissiveIntensity = 0.05;
      }
      this.sunLight.intensity = 1.55;
    }, 4000);
  }

  // 飞身入画（传送前往特定神兽景观）
  teleportToBeast(beastId) {
    const beast = BEASTS.find(b => b.id === beastId);
    if (!beast) return;

    this.player.pos.set(
      beast.coordinates.x + 8.5,
      beast.coordinates.y + this.player.height,
      beast.coordinates.z + 8.5
    );

    // 镜头正对神兽
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

    // 跳跃与重力模拟
    if (!this.player.isGrounded) {
      this.player.pos.y += this.player.jumpVelocity * dt;
      this.player.jumpVelocity -= 22.0 * dt; // 重力加速度
    }

    // 贴合地形与地表高度
    const groundY = this._calculateTerrainHeight(this.player.pos.x, this.player.pos.z);
    if (this.player.pos.y <= groundY + this.player.height) {
      this.player.pos.y = groundY + this.player.height;
      this.player.isGrounded = true;
      this.player.jumpVelocity = 0;
    }

    // 平滑同步相机
    this.camera.position.lerp(this.player.pos, 0.16);

    const targetLook = new THREE.Vector3(
      this.camera.position.x - Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
      this.camera.position.y + Math.sin(this.player.pitch),
      this.camera.position.z - Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
    );
    this.camera.lookAt(targetLook);
  }

  // 侦测与六大山海神兽的距离并向 UI 发出罗盘信息
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

      // 计算相对于玩家面向视角的方位角
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

    // 回传 UI 刷新罗盘与准星提示
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

    // 江波微澜浮动
    if (this.waterMesh) {
      this.waterMesh.position.y = 1.05 + Math.sin(time * 1.8) * 0.06;
    }

    // 飞瀑流动微光
    if (this.waterfallMesh) {
      this.waterfallMesh.material.opacity = 0.8 + Math.sin(time * 8.0) * 0.12;
    }

    // 空中矿物金粉微粒悠缓漂移
    if (this.goldDustPoints) {
      const pos = this.goldDustPoints.geometry.attributes.position;
      for (let i = 1; i < pos.count; i += 3) {
        let py = pos.getY(i) - 0.03;
        if (py < 1.5) py = 35.0;
        pos.setY(i, py);
      }
      this.goldDustPoints.geometry.attributes.position.needsUpdate = true;
    }

    // 通天光柱呼吸律动
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
