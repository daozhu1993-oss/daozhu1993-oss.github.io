/**
 * 《千里江山 · 借笔还魂》真 3D 北宋院体青绿山水与乘舟巡游引擎 (Route A)
 * (True 3D Song Painting Landscape + Planar River Reflection + Boat Cruising + Gongbi Ink-Spirit Beasts)
 *
 * 架构全面重构亮点：
 * 1. 【真 3D 宋画峻峰 (songTerrain.js)】：彻底移除 2D 截图立牌弧幕，以多脊棱峰喀斯特地形 + 三矾九染斧劈皴着色器重塑北宋千峰万壑。
 * 2. 【真平面水面倒影 (planarReflector.js + water-ssr-shader.js)】：1/2 分辨率实时平面镜像捕获青绿群峰、千步虹桥与万家渔火，经 5-Tap 宣纸墨韵柔和倒映。
 * 3. 【乘舟入画 · 乌篷画舫巡游】：一键登舟或沿江穿行，从桃溪渡口启航，穿过千步编木拱虹桥桥洞，环游水心高阁！
 * 4. 【工笔金线通灵墨影神兽 (beast3d.js) + 借笔点睛连星唤醒 (awakening-director.js)】：六方高清北宋工笔泥金神兽立体悬浮，一笔划星还魂，留下永久天地奇观。
 * 5. 【1.8s 四时昼夜丝滑过渡】：背景、雾色、山体、水面、瀑布、神兽与灯火完全同步平滑渐变，绝无色彩割裂。
 */

import * as THREE from 'three';
import { BEASTS } from './beasts.js';
import { Beast3DManager } from './beast3d.js';
import { audio } from './audio.js';
import { InkPostPipeline } from './inkPostProcess.js';
import { createSongWaterSSRMaterial } from './water-ssr-shader.js';
import { BeastAwakeningDirector } from './awakening-director.js';
import {
  WATER_LEVEL,
  calculateSongTerrainHeight,
  createRiverCruiseCurve,
  buildSongTerrainMesh
} from './songTerrain.js';
import { SongRiverReflector } from './planarReflector.js';
import {
  createSongPavilion,
  createSongGrandWaterPavilion,
  createSongBoat,
  createSongCottage,
  createSongPineTree,
  createSongPeachTree,
  createSongRiverbankDetails,
  createContactShadow,
  createAnimatedWaterfall,
  createVillageSmokePlume,
  createCruiseBoat,
  pineCrownGeometry
} from './songProps.js';

// 四时与幽夜统一色彩主题配置（彻底同步天空/雾效/山峦/水体/光影）
const ATMOSPHERE_PRESETS = {
  spring: {
    bg: new THREE.Color(0x969174),
    fog: new THREE.Color(0xA69F80),
    ambient: new THREE.Color(0xFFF7EC),
    ambientInt: 1.48,
    sun: new THREE.Color(0xFFF2D6),
    sunInt: 2.25,
    seasonTint: new THREE.Color(1.03, 1.07, 0.96),
    snow: 0.0,
    nightMix: 0.0
  },
  summer: {
    bg: new THREE.Color(0x8E7D5B),
    fog: new THREE.Color(0x9E8D68),
    ambient: new THREE.Color(0xFFF0D5),
    ambientInt: 1.45,
    sun: new THREE.Color(0xFFE8C2),
    sunInt: 2.38,
    seasonTint: new THREE.Color(1.0, 1.0, 1.0),
    snow: 0.0,
    nightMix: 0.0
  },
  autumn: {
    bg: new THREE.Color(0x99794A),
    fog: new THREE.Color(0xA98856),
    ambient: new THREE.Color(0xFFE5C8),
    ambientInt: 1.40,
    sun: new THREE.Color(0xFFB464),
    sunInt: 2.25,
    seasonTint: new THREE.Color(1.12, 0.95, 0.80),
    snow: 0.0,
    nightMix: 0.0
  },
  winter: {
    bg: new THREE.Color(0x6C7784),
    fog: new THREE.Color(0x8894A0),
    ambient: new THREE.Color(0xDCE8F4),
    ambientInt: 1.38,
    sun: new THREE.Color(0xCBE0F5),
    sunInt: 1.98,
    seasonTint: new THREE.Color(0.92, 0.96, 1.05),
    snow: 1.0,
    nightMix: 0.0
  },
  night: {
    bg: new THREE.Color(0x131D29),
    fog: new THREE.Color(0x182534),
    ambient: new THREE.Color(0x273D54),
    ambientInt: 1.08,
    sun: new THREE.Color(0x5A84A8),
    sunInt: 0.85,
    seasonTint: new THREE.Color(0.84, 0.92, 1.06),
    snow: 0.0,
    nightMix: 1.0
  }
};

export class World3D {
  constructor(container, options = {}) {
    this.container = container;
    this.onAwakenBeast = options.onAwakenBeast || (() => {});
    this.onExitToScroll = options.onExitToScroll || (() => {});
    this.onNearBeastChange = options.onNearBeastChange || (() => {});
    this.onCompassUpdate = options.onCompassUpdate || (() => {});
    this.onBoatStateChange = options.onBoatStateChange || (() => {});

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.beastManager = null;
    this.postPipeline = null;
    this.riverReflector = null;
    this.awakeningDirector = null;
    this.customCameraController = null;

    // 舒啸临风矶出生点
    const spawnGround = calculateSongTerrainHeight(-20.5, 34.5);
    this.spawnPos = new THREE.Vector3(-20.5, spawnGround + 2.2, 34.5);
    this.spawnYaw = -0.32;
    this.spawnPitch = -0.09;

    this.player = {
      pos: this.spawnPos.clone(),
      vel: new THREE.Vector3(),
      yaw: this.spawnYaw,
      pitch: this.spawnPitch,
      speed: 14.5,
      sprintMultiplier: 1.85,
      height: 2.2,
      isGrounded: true,
      jumpVelocity: 0,
      walkCycle: 0
    };

    // 开屏俯冲穿云入画运镜
    this.cinematic = {
      active: false,
      startTime: 0,
      duration: 3.4,
      startPos: new THREE.Vector3(-56, 46, 86),
      startLook: new THREE.Vector3(20, 14, -22),
      endPos: this.spawnPos.clone(),
      endLook: new THREE.Vector3(
        this.spawnPos.x - Math.sin(this.spawnYaw) * 14,
        this.spawnPos.y + Math.sin(this.spawnPitch) * 14,
        this.spawnPos.z - Math.cos(this.spawnYaw) * 14
      )
    };

    // 乘舟巡游状态机 (Boat Cruising)
    this.boatCruise = {
      active: false,
      curve: createRiverCruiseCurve(),
      t: 0.02,
      baseSpeed: 0.0115, // 约 86 秒悠闲环游全江，穿千步虹桥、绕水心高阁
      speedMult: 1.0,
      mesh: null,
      lastOarTime: 0
    };
    this.ambientBoats = [];

    // 操控与多指触控隔离
    this.keys = {};
    this.isDragging = false;
    this._lookTouchId = null;
    this.lastMouse = { x: 0, y: 0 };
    this.clock = new THREE.Clock();

    // 场景对象缓存
    this.nearestBeast = null;
    this.nearestDistance = Infinity;
    this.terrain = null;
    this.terrainMat = null;
    this.waterMesh = null;
    this.waterMat = null;
    this.skyMat = null;
    this.waterfallObj = null;
    this.smokePlumes = [];
    this.skyBeams = {};
    this.goldDustPoints = null;
    this.cranes = [];
    this.lanternLights = [];
    this.valleyMistPlanes = [];
    this.awakenedZones = new Set();
    this.masterPaintingTex = null;

    // 气候与平滑过渡态
    this.currentSeason = 'summer';
    this.isNight = false;
    this.currentWeather = 'clear';
    this.seasonParticles = null;
    this.rainMesh = null;
    this._atmoCurrent = {
      bg: ATMOSPHERE_PRESETS.summer.bg.clone(),
      fog: ATMOSPHERE_PRESETS.summer.fog.clone(),
      ambient: ATMOSPHERE_PRESETS.summer.ambient.clone(),
      ambientInt: ATMOSPHERE_PRESETS.summer.ambientInt,
      sun: ATMOSPHERE_PRESETS.summer.sun.clone(),
      sunInt: ATMOSPHERE_PRESETS.summer.sunInt,
      seasonTint: ATMOSPHERE_PRESETS.summer.seasonTint.clone(),
      snow: 0.0,
      nightMix: 0.0,
      fogDensity: 0.0032
    };
    this._atmoTarget = {
      bg: ATMOSPHERE_PRESETS.summer.bg.clone(),
      fog: ATMOSPHERE_PRESETS.summer.fog.clone(),
      ambient: ATMOSPHERE_PRESETS.summer.ambient.clone(),
      ambientInt: ATMOSPHERE_PRESETS.summer.ambientInt,
      sun: ATMOSPHERE_PRESETS.summer.sun.clone(),
      sunInt: ATMOSPHERE_PRESETS.summer.sunInt,
      seasonTint: ATMOSPHERE_PRESETS.summer.seasonTint.clone(),
      snow: 0.0,
      nightMix: 0.0,
      fogDensity: 0.0032
    };

    this._initScene();
    this._initMasterPaintingTexture();
    this._buildAtmosphereAndSky();
    this._buildTexturedTerrain();
    this._buildStylizedWater();
    this._buildSpawnOverlookPlatform();
    this._buildStoneRoadAndLanterns();
    this._buildScenicLandmarks();
    this._buildCruiseAndAmbientBoats();
    this._buildValleyMist();
    this._buildFlyingCranes();
    this._buildGoldDustParticles();
    this._buildSeasonAndWeatherSystems();
    this._initBeasts();
    this.awakeningDirector = new BeastAwakeningDirector(this, null, audio);
    this._initControls();
    this._animate();
  }

  _calculateTerrainHeight(x, z) {
    return calculateSongTerrainHeight(x, z);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = this._atmoCurrent.bg.clone();
    this.scene.fog = new THREE.FogExp2(this._atmoCurrent.fog.getHex(), this._atmoCurrent.fogDensity);

    const w = (this.container && this.container.clientWidth > 0)
      ? this.container.clientWidth
      : (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const h = (this.container && this.container.clientHeight > 0)
      ? this.container.clientHeight
      : (typeof window !== 'undefined' ? window.innerHeight : 720);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.2, 1200);
    this.camera.position.copy(this.spawnPos);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xFFF0D5, 1.45);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight;

    const hemiLight = new THREE.HemisphereLight(0xFFF8EB, 0x453B27, 1.35);
    this.scene.add(hemiLight);
    this.hemiLight = hemiLight;

    const sunLight = new THREE.DirectionalLight(0xFFE8C2, 2.38);
    sunLight.position.set(65, 115, 80);
    this.scene.add(sunLight);
    this.sunLight = sunLight;

    try {
      this.postPipeline = new InkPostPipeline(this.renderer, this.scene, this.camera, w, h);
    } catch (err) {
      console.warn('[PostPipeline Init Warning]', err);
      this.postPipeline = null;
    }

    window.addEventListener('resize', () => this.handleResize());
  }

  handleResize() {
    if (!this.renderer || !this.camera) return;
    const w = (this.container && this.container.clientWidth > 0)
      ? this.container.clientWidth
      : (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const h = (this.container && this.container.clientHeight > 0)
      ? this.container.clientHeight
      : (typeof window !== 'undefined' ? window.innerHeight : 720);
    if (w <= 0 || h <= 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.postPipeline) this.postPipeline.resize(w, h);
  }

  _initMasterPaintingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, '#1B5374');
    grad.addColorStop(0.32, '#247D9E');
    grad.addColorStop(0.55, '#279875');
    grad.addColorStop(0.75, '#9E743F');
    grad.addColorStop(1.00, '#E8DDB8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2048, 512);

    this.masterPaintingTex = new THREE.CanvasTexture(canvas);
    this.masterPaintingTex.colorSpace = THREE.SRGBColorSpace;
    this.masterPaintingTex.wrapS = THREE.ClampToEdgeWrapping;
    this.masterPaintingTex.wrapT = THREE.ClampToEdgeWrapping;

    const sections = [1, 2, 3, 4, 5];
    sections.forEach((id, idx) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, img.width, img.height, idx * 410, 0, 410, 512);
        this.masterPaintingTex.needsUpdate = true;
      };
      img.src = `assets/painting/section_${id}.jpg`;
    });
  }

  // 宣和古绢穹顶天幕（动态跟随昼夜与四季渐变）
  _buildAtmosphereAndSky() {
    const skyGeo = new THREE.SphereGeometry(520, 36, 24);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHorizonColor: { value: new THREE.Color(0x9E8D68) },
        uZenithColor: { value: new THREE.Color(0x52452E) },
        uNightMix: { value: 0.0 },
        uSunDir: { value: new THREE.Vector3(65, 115, 80).normalize() }
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uHorizonColor;
        uniform vec3 uZenithColor;
        uniform float uNightMix;
        uniform vec3 uSunDir;
        varying vec3 vWorldDir;

        void main() {
          float h = clamp(vWorldDir.y, 0.0, 1.0);
          vec3 sky = mix(uHorizonColor, uZenithColor, pow(h, 0.62));

          // 暖金晨曦日晕 / 幽夜清月微光
          float sunDot = max(0.0, dot(normalize(vWorldDir), uSunDir));
          vec3 haloCol = mix(vec3(1.0, 0.90, 0.68), vec3(0.75, 0.88, 1.0), uNightMix);
          sky += haloCol * pow(sunDot, 22.0) * (0.28 - uNightMix * 0.08);
          sky += haloCol * pow(sunDot, 260.0) * 0.55;

          gl_FragColor = vec4(sky, 1.0);
        }
      `
    });
    const skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(skyMesh);
  }

  // 真 3D 北宋院体青绿山峦地形
  _buildTexturedTerrain() {
    const { mesh, material } = buildSongTerrainMesh(this.masterPaintingTex);
    this.terrain = mesh;
    this.terrainMat = material;
    this.scene.add(this.terrain);
  }

  // 真平面倒影 + 5-Tap 墨韵水体
  _buildStylizedWater() {
    this.riverReflector = new SongRiverReflector(WATER_LEVEL, 512);

    const waterGeo = new THREE.PlaneGeometry(580, 580, 96, 96);
    waterGeo.rotateX(-Math.PI / 2);

    this.waterMat = createSongWaterSSRMaterial(
      this.riverReflector.texture,
      this.riverReflector.textureMatrix
    );
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh.position.y = WATER_LEVEL;
    this.scene.add(this.waterMesh);
  }

  // 初登高台 · 舒啸临风矶与王希孟作画石案
  _buildSpawnOverlookPlatform() {
    const group = new THREE.Group();
    const gy = this._calculateTerrainHeight(-20.5, 34.5);
    group.position.set(-20.5, gy, 34.5);

    const matStone = new THREE.MeshStandardMaterial({ color: 0x6E685E, roughness: 0.88 });
    const matWood = new THREE.MeshStandardMaterial({ color: 0x463022, roughness: 0.75 });

    const framingPine = this._buildScholarPineTree();
    framingPine.position.set(-4.2, -0.05, -0.8);
    framingPine.rotation.y = 0.22;
    framingPine.add(createContactShadow(2.2, 2.2, 0.55));
    group.add(framingPine);

    const deskGroup = new THREE.Group();
    deskGroup.position.set(-2.5, 0.0, -1.8);
    deskGroup.rotation.y = -0.45;
    deskGroup.add(createContactShadow(1.4, 0.9, 0.5));

    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.10, 0.85), matWood);
    tableTop.position.y = 0.72;
    deskGroup.add(tableTop);

    for (const lx of [-0.80, 0.80]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.68), matWood);
      leg.position.set(lx, 0.36, 0);
      deskGroup.add(leg);
    }

    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.44, 12), matStone);
    stool.position.set(0, 0.22, 0.85);
    deskGroup.add(stool);

    const scrollMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xEADBBD, roughness: 0.55, map: this.masterPaintingTex })
    );
    scrollMesh.rotation.x = -Math.PI / 2;
    scrollMesh.position.set(-0.12, 0.78, 0);
    deskGroup.add(scrollMesh);

    const inkstone = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x181716, roughness: 0.35 })
    );
    inkstone.position.set(0.62, 0.80, -0.12);
    deskGroup.add(inkstone);

    const brush = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.015, 0.44, 6),
      new THREE.MeshStandardMaterial({ color: 0x8C5A28, roughness: 0.7 })
    );
    brush.rotation.z = Math.PI / 2.15;
    brush.position.set(0.60, 0.83, 0.12);
    deskGroup.add(brush);

    group.add(deskGroup);

    const lantern = this._buildSongStoneLantern(3.4, 0.0, -0.2);
    group.add(lantern);

    this.scene.add(group);
  }

  _buildScholarPineTree() {
    const pine = new THREE.Group();
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x3E2818, roughness: 0.90 });
    const matNeedles = new THREE.MeshStandardMaterial({
      color: 0x1E6545,
      emissive: 0x0A3022,
      emissiveIntensity: 0.18,
      roughness: 0.72,
      side: THREE.DoubleSide
    });

    const tCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.3, 1.6, -0.2),
      new THREE.Vector3(-0.1, 3.2, -0.4),
      new THREE.Vector3(0.6, 4.4, -0.6)
    ]);
    pine.add(new THREE.Mesh(new THREE.TubeGeometry(tCurve, 20, 0.14, 8, false), matTrunk));

    const branchConfigs = [
      { pos: [-0.1, 3.2, -0.4], arm: [0.65, 0.25, -0.2], radius: 0.48 },
      { pos: [0.6,  4.4, -0.6], arm: [0.75, 0.18, -0.1], radius: 0.54 },
      { pos: [0.3,  4.2, -0.5], arm: [-0.45, 0.35, 0.2], radius: 0.38 }
    ];

    const crownGeo = pineCrownGeometry();
    branchConfigs.forEach(bc => {
      const bArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.85, 6), matTrunk);
      bArm.position.set(bc.pos[0] + bc.arm[0] * 0.5, bc.pos[1] + bc.arm[1] * 0.5, bc.pos[2] + bc.arm[2] * 0.5);
      bArm.rotation.z = Math.PI / 3.4;
      pine.add(bArm);

      const spray = new THREE.Mesh(crownGeo, matNeedles);
      spray.position.set(bc.pos[0] + bc.arm[0], bc.pos[1] + bc.arm[1], bc.pos[2] + bc.arm[2]);
      const s = bc.radius * 2.2;
      spray.scale.set(s, s * 0.7, s);
      spray.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
      pine.add(spray);
    });

    return pine;
  }

  _buildStoneRoadAndLanterns() {
    const matSlab = new THREE.MeshStandardMaterial({ color: 0x706A60, roughness: 0.88 });
    const trails = [
      [{ x: -23, z: 36 }, { x: -30, z: 34 }, { x: -38, z: 31 }, { x: -45, z: 28 }],
      [{ x: -45, z: 28 }, { x: -34, z: 24 }, { x: -16, z: 24 }, { x: 2, z: 28 }, { x: 12, z: 42 }],
      [{ x: 4, z: -20 }, { x: 14, z: -18 }, { x: 21, z: -15 }],
      [{ x: 50, z: -15 }, { x: 58, z: -18 }, { x: 64, z: -25 }]
    ];

    trails.forEach(points => {
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const steps = Math.ceil(dist / 2.8);

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = p1.x + (p2.x - p1.x) * t;
          const z = p1.z + (p2.z - p1.z) * t;
          const groundY = this._calculateTerrainHeight(x, z);
          const slopeTest = Math.abs(this._calculateTerrainHeight(x + 1.2, z) - groundY) +
                            Math.abs(this._calculateTerrainHeight(x, z + 1.2) - groundY);

          if (groundY > WATER_LEVEL + 0.25 && groundY < 28.0 && slopeTest < 1.3) {
            const slab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 1.4), matSlab);
            slab.position.set(x, groundY + 0.04, z);
            slab.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z) + (Math.random() - 0.5) * 0.12;
            this.scene.add(slab);
          }
        }
      }
    });

    const lanternNodes = [
      { x: -45, z: 25 },
      { x: 12,  z: 39 },
      { x: 21.5, z: -12 },
      { x: 49.5, z: -12 },
      { x: 64,  z: -21.5 },
      { x: 84,  z: -6 },
      { x: 9,   z: -18.5 }
    ];

    lanternNodes.forEach((pos, idx) => {
      const gy = this._calculateTerrainHeight(pos.x, pos.z);
      const l = this._buildSongStoneLantern(pos.x, gy, pos.z, idx * 0.18);
      this.scene.add(l);
    });
  }

  _buildSongStoneLantern(x, y, z, staggerDelay = 0) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const matStone = new THREE.MeshStandardMaterial({ color: 0x6E685E, roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.32, 6), matStone);
    base.position.y = 0.16;
    group.add(base);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.72, 6), matStone);
    pillar.position.y = 0.68;
    group.add(pillar);

    const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.48), matStone);
    chamber.position.y = 1.22;
    group.add(chamber);

    const glowCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFE394 })
    );
    glowCore.position.y = 1.22;
    group.add(glowCore);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.32, 6), matStone);
    roof.position.y = 1.6;
    group.add(roof);

    const candleLight = new THREE.PointLight(0xFAD478, 1.35, 16, 1.2);
    candleLight.position.set(0, 1.22, 0);
    candleLight.userData = { stagger: staggerDelay };
    group.add(candleLight);
    this.lanternLights.push(candleLight);

    group.add(createContactShadow(0.75, 0.75, 0.45));
    return group;
  }

  // =========================================================================
  // 打造六大名胜（100% 贴合真 3D 地形高程 + 柔和接触阴影 + 动态瀑布与炊烟）
  // =========================================================================
  _buildScenicLandmarks() {
    const matWood = new THREE.MeshStandardMaterial({ color: 0x543A24, roughness: 0.78 });
    const matPillars = new THREE.MeshStandardMaterial({ color: 0x8C2E24, roughness: 0.55 });

    // 1. 【胜境一 · 桃溪浅滩】(x: -45, z: 28)
    for (let i = 0; i < 8; i++) {
      const tx = -45 + (Math.random() - 0.5) * 22;
      const tz = 28 + (Math.random() - 0.5) * 16;
      const ty = this._calculateTerrainHeight(tx, tz);
      if (ty > WATER_LEVEL + 0.15) {
        const tree = createSongPeachTree({ seed: 200 + i * 37, scale: 0.95 + Math.random() * 0.35 });
        tree.position.set(tx, ty - 0.06, tz);
        tree.add(createContactShadow(1.6, 1.6, 0.45));
        this.scene.add(tree);
      }
    }
    const peachBoat = createSongBoat({ scale: 1.2, hasSail: true });
    peachBoat.position.set(-39, WATER_LEVEL, 18.5);
    peachBoat.rotation.y = 0.42;
    this.scene.add(peachBoat);

    this.scene.add(createSongRiverbankDetails({
      rockCount: 28,
      reedCount: 48,
      seed: 512,
      terrainHeightFn: (x, z) => this._calculateTerrainHeight(x, z),
      areaCenter: { x: -45, z: 24 },
      areaRadius: 20
    }));

    // 2. 【胜境二 · 悬瀑幽涧】(x: -18, z: -36) - 嵌于真 3D 绝壁的丝绸流动瀑布
    this.waterfallObj = createAnimatedWaterfall(5.8, 25.0);
    this.waterfallObj.position.set(-18, WATER_LEVEL, -40.5);
    this.waterfallObj.rotation.y = 0.08;
    this.scene.add(this.waterfallObj);

    this.scene.add(createSongRiverbankDetails({
      rockCount: 18,
      reedCount: 20,
      seed: 618,
      terrainHeightFn: (x, z) => this._calculateTerrainHeight(x, z),
      areaCenter: { x: -18, z: -34 },
      areaRadius: 12
    }));

    // 3. 【胜境三 · 麦陇晚烟】(x: 12, z: 42)
    {
      const cx = 15.5, cz = 40.5;
      const cy = this._calculateTerrainHeight(cx, cz);
      const cottage = createSongCottage({ scale: 1.25 });
      cottage.position.set(cx, cy - 0.08, cz);
      cottage.rotation.y = -0.35;
      cottage.add(createContactShadow(3.6, 2.8, 0.65));
      this.scene.add(cottage);

      const smoke = createVillageSmokePlume(20);
      smoke.position.set(cx, cy + 4.2, cz);
      this.scene.add(smoke);
      this.smokePlumes.push(smoke);
    }

    // 4. 【胜境四 · 关隘长桥】(x: 36, z: -15) - 跨江编木拱虹桥（画舫可直接穿行桥洞！）
    const bridge = this._buildSongRainbowBridge(matWood, matPillars);
    this.scene.add(bridge);

    const kioskY = this._calculateTerrainHeight(21.5, -15);
    const bridgeKiosk = createSongPavilion({ scale: 0.78, open: true });
    bridgeKiosk.position.set(21.5, kioskY - 0.08, -15);
    bridgeKiosk.rotation.y = Math.PI / 2;
    bridgeKiosk.add(createContactShadow(3.2, 2.6, 0.62));
    this.scene.add(bridgeKiosk);

    // 5. 【胜境五 · 孤刹悬云】(x: 64, z: -25) - 严丝合缝坐落于真 3D 高峰岩台之上！
    {
      const tx = 64, tz = -25;
      const ty = this._calculateTerrainHeight(tx, tz);
      const temple = createSongPavilion({ scale: 1.35, open: false, roofColor: '#284239' });
      temple.position.set(tx, ty - 0.1, tz);
      temple.add(createContactShadow(4.5, 3.8, 0.68));
      this.scene.add(temple);
    }

    // 6. 【胜境六 · 水心高阁】(x: 88, z: -8) - 四面环水的双层重檐大殿
    {
      const gx = 88, gz = -8;
      const gy = this._calculateTerrainHeight(gx, gz);
      const grandPavilion = createSongGrandWaterPavilion({ scale: 1.25, roofColor: '#2b443c' });
      grandPavilion.position.set(gx, gy - 0.08, gz);
      grandPavilion.add(createContactShadow(5.5, 4.6, 0.72));
      this.scene.add(grandPavilion);

      // 延伸至水面的宋式木栈道码头
      const dock = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 3.8), matWood);
      dock.position.set(gx - 12, WATER_LEVEL + 0.35, gz);
      this.scene.add(dock);
    }

    // 7. 【山脚江村茅舍与炊烟渔舟】(x ≈ 11, z ≈ -20)
    for (let c = 0; c < 3; c++) {
      const cx = 5.0 + c * 5.8;
      const cz = -20.5 + (c % 2) * 2.0;
      const cy = this._calculateTerrainHeight(cx, cz);
      const vCottage = createSongCottage({ scale: 1.05 + c * 0.08 });
      vCottage.position.set(cx, cy - 0.08, cz);
      vCottage.rotation.y = (c - 1) * 0.25;
      vCottage.add(createContactShadow(3.0, 2.4, 0.62));
      this.scene.add(vCottage);

      if (c === 1) {
        const smoke = createVillageSmokePlume(24);
        smoke.position.set(cx, cy + 4.0, cz);
        this.scene.add(smoke);
        this.smokePlumes.push(smoke);
      }
    }

    this.scene.add(createSongRiverbankDetails({
      rockCount: 24,
      reedCount: 40,
      seed: 733,
      terrainHeightFn: (x, z) => this._calculateTerrainHeight(x, z),
      areaCenter: { x: 10, z: -16 },
      areaRadius: 16
    }));

    // 8. 苍松林带（依真实 3D 山体坡面自然矗立，配接触阴影）
    const grovePositions = [
      { x: -14, z: -22 }, { x: -8, z: -26 }, { x: 4, z: -25 }, { x: 12, z: -25 },
      { x: 19, z: -22 }, { x: -26, z: -32 }, { x: -22, z: -38 }, { x: 52, z: -20 },
      { x: 59, z: -27 }, { x: 69, z: -28 }, { x: -4, z: 22 }, { x: 8, z: 32 },
      { x: -32, z: 26 }, { x: -55, z: 20 }, { x: 26, z: 36 }
    ];
    grovePositions.forEach((gp, idx) => {
      const gy = this._calculateTerrainHeight(gp.x, gp.z);
      if (gy > WATER_LEVEL + 0.4) {
        const p = createSongPineTree({ seed: 1000 + idx * 71, crownCount: 4, scale: 0.95 + (idx % 3) * 0.16 });
        p.position.set(gp.x, gy - 0.12, gp.z);
        p.rotation.y = (idx * 1.7) % (Math.PI * 2);
        p.add(createContactShadow(2.0, 2.0, 0.48));
        this.scene.add(p);
      }
    });

    // 遍布真 3D 峰峦腰间的古雅苍松
    for (let i = 0; i < 42; i++) {
      const px = (Math.random() - 0.5) * 280;
      const pz = (Math.random() - 0.5) * 210;
      if (Math.hypot(px - (-20.5), pz - 34.5) < 18) continue;
      const py = this._calculateTerrainHeight(px, pz);
      if (py > 2.8 && py < 36.0) {
        const p = createSongPineTree({ seed: 2000 + i * 43, crownCount: 3, scale: 0.85 + Math.random() * 0.55 });
        p.position.set(px, py - 0.15, pz);
        this.scene.add(p);
      }
    }
  }

  // 构建玩家可乘乌篷画舫 + 远江往来行舟（让江山真正“活”起来）
  _buildCruiseAndAmbientBoats() {
    // 1. 玩家专属巡游乌篷画舫
    const playerBoat = createCruiseBoat();
    const startPt = this.boatCruise.curve.getPointAt(this.boatCruise.t);
    playerBoat.position.copy(startPt);
    this.scene.add(playerBoat);
    this.boatCruise.mesh = playerBoat;

    // 2. 两条沿江缓缓巡航的写意商船/渔舟
    [0.36, 0.72].forEach((phase, idx) => {
      const b = createSongBoat({ scale: 1.05 + idx * 0.18, hasSail: idx === 0 });
      this.scene.add(b);
      this.ambientBoats.push({ mesh: b, t: phase, speed: 0.0052 + idx * 0.0012 });
    });
  }

  /**
   * 切换【乘舟巡游】与【靠岸漫步】模式
   */
  toggleBoatCruise(forceState = null) {
    const next = forceState !== null ? Boolean(forceState) : !this.boatCruise.active;
    if (next === this.boatCruise.active) return this.boatCruise.active;

    this.boatCruise.active = next;
    this.cinematic.active = false;
    this.customCameraController = null;

    if (next) {
      // 将画舫瞬移/对齐到离玩家最近的水路节点，立刻开启丝滑乘舟之旅！
      let bestT = this.boatCruise.t;
      let bestD = Infinity;
      for (let i = 0; i < 64; i++) {
        const candT = i / 64;
        const p = this.boatCruise.curve.getPointAt(candT);
        const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
        if (d < bestD) {
          bestD = d;
          bestT = candT;
        }
      }
      this.boatCruise.t = bestT;
      this.boatCruise.speedMult = 1.0;

      // 朝向船首前方
      const p0 = this.boatCruise.curve.getPointAt(bestT);
      const p1 = this.boatCruise.curve.getPointAt((bestT + 0.01) % 1);
      const tangent = p1.clone().sub(p0).normalize();
      this.player.yaw = Math.atan2(-tangent.x, -tangent.z);
      this.player.pitch = -0.05;

      audio.ensureContext();
      audio.playBoatOar();
      audio.playGuqinPluck(293.66, 3.8);
    } else {
      // 靠岸漫步：寻就近干地落脚，绝不掉入水底
      const boatPos = this.boatCruise.mesh.position;
      let landed = false;
      for (let r = 6; r <= 34 && !landed; r += 3.5) {
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          const lx = boatPos.x + Math.cos(ang) * r;
          const lz = boatPos.z + Math.sin(ang) * r;
          const ly = this._calculateTerrainHeight(lx, lz);
          if (ly > WATER_LEVEL + 0.35 && ly < 16.0) {
            this.player.pos.set(lx, ly + this.player.height, lz);
            landed = true;
            break;
          }
        }
      }
      if (!landed) {
        this.player.pos.copy(this.spawnPos);
      }
      audio.playFootstep();
    }

    this.onBoatStateChange(this.boatCruise.active);
    return this.boatCruise.active;
  }

  _buildSongRainbowBridge(matWood, matPillars) {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'song_rainbow_bridge';
    bridgeGroup.position.set(36, 0, -15);

    const span = 27.0;
    const archH = 4.2;
    const bridgeBaseY = 5.2;

    const cedarMat = new THREE.MeshStandardMaterial({ color: 0x483220, roughness: 0.85 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x822E26, roughness: 0.75 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x625D54, roughness: 0.90 });

    // 两端扎入山石的桥台石墩（防悬空）
    for (const endX of [-span * 0.5, span * 0.5]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6.5, 4.8), stoneMat);
      pier.position.set(endX, bridgeBaseY - 3.2, 0);
      bridgeGroup.add(pier);
    }

    for (let rib = -2; rib <= 2; rib++) {
      const zOffset = rib * 0.72;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-span * 0.5, bridgeBaseY, zOffset),
        new THREE.Vector3(-span * 0.25, bridgeBaseY + archH * 0.78, zOffset),
        new THREE.Vector3(0, bridgeBaseY + archH, zOffset),
        new THREE.Vector3(span * 0.25, bridgeBaseY + archH * 0.78, zOffset),
        new THREE.Vector3(span * 0.5, bridgeBaseY, zOffset)
      ]);
      bridgeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.22, 8, false), cedarMat));
    }

    for (let b = -10; b <= 10; b++) {
      const frac = b / 10.0;
      const bx = frac * (span * 0.48);
      const by = bridgeBaseY + (1.0 - frac * frac) * archH;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.8, 8), cedarMat);
      beam.rotation.x = Math.PI / 2;
      beam.position.set(bx, by - 0.25, 0);
      bridgeGroup.add(beam);
    }

    const deckSegments = 32;
    for (let d = 0; d < deckSegments; d++) {
      const t1 = (d - deckSegments * 0.5) / (deckSegments * 0.5);
      const x = t1 * (span * 0.48);
      const y = bridgeBaseY + (1.0 - t1 * t1) * archH;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.18, 3.4), cedarMat);
      plank.position.set(x, y + 0.1, 0);
      plank.rotation.z = -Math.atan2(-2.0 * t1 * archH, span * 0.5);
      bridgeGroup.add(plank);
    }

    for (const sideZ of [-1.75, 1.75]) {
      const railCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-span * 0.5, bridgeBaseY + 0.95, sideZ),
        new THREE.Vector3(0, bridgeBaseY + archH + 0.95, sideZ),
        new THREE.Vector3(span * 0.5, bridgeBaseY + 0.95, sideZ)
      ]);
      bridgeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 24, 0.07, 6, false), railMat));

      for (let p = -6; p <= 6; p++) {
        const pt = p / 6.0;
        const px = pt * (span * 0.46);
        const py = bridgeBaseY + (1.0 - pt * pt) * archH;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6), railMat);
        post.position.set(px, py + 0.5, sideZ);
        bridgeGroup.add(post);

        // 桥顶夜灯（夜晚千桥灯火倒映江水！）
        if (Math.abs(p) === 2 || p === 0) {
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xFFDA7A })
          );
          glow.position.set(px, py + 1.15, sideZ);
          bridgeGroup.add(glow);
        } else {
          const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), railMat);
          finial.position.set(px, py + 1.05, sideZ);
          bridgeGroup.add(finial);
        }
      }
    }

    return bridgeGroup;
  }

  // 三远法流动山腰云雾带
  _buildValleyMist() {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(128, 64, 10, 128, 64, 124);
    grad.addColorStop(0.0, 'rgba(246, 238, 219, 0.52)');
    grad.addColorStop(0.55, 'rgba(235, 224, 198, 0.20)');
    grad.addColorStop(1.0, 'rgba(235, 224, 198, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    const mistTex = new THREE.CanvasTexture(cv);
    const mistMat = new THREE.MeshBasicMaterial({
      map: mistTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.valleyMistMat = mistMat;

    const mistConfigs = [
      { x: -35, y: 12, z: -48, sx: 64, sy: 22 },
      { x: 15,  y: 15, z: -56, sx: 78, sy: 26 },
      { x: 68,  y: 18, z: -42, sx: 68, sy: 24 },
      { x: -62, y: 16, z: -18, sx: 58, sy: 20 },
      { x: 96,  y: 11, z: -34, sx: 72, sy: 22 },
      { x: 0,   y: 26, z: -102, sx: 140, sy: 38 }
    ];

    mistConfigs.forEach((mc, i) => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(mc.sx, mc.sy), mistMat);
      plane.position.set(mc.x, mc.y, mc.z);
      plane.rotation.x = -Math.PI * 0.14;
      plane.userData = { baseX: mc.x, baseZ: mc.z, phase: i * 1.15 };
      this.scene.add(plane);
      this.valleyMistPlanes.push(plane);
    });
  }

  _buildFlyingCranes() {
    const craneGroup = new THREE.Group();
    const matWhite = new THREE.MeshBasicMaterial({ color: 0xFAF6EC, side: THREE.DoubleSide });
    const matDark = new THREE.MeshBasicMaterial({ color: 0x22262A, side: THREE.DoubleSide });

    for (let i = 0; i < 9; i++) {
      const crane = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.15, 6), matWhite);
      body.rotation.x = Math.PI / 2;
      crane.add(body);

      const wingGeo = new THREE.PlaneGeometry(1.45, 0.55);
      const wingL = new THREE.Mesh(wingGeo, matWhite);
      wingL.position.set(-0.72, 0, 0);
      wingL.rotation.x = -Math.PI / 2;
      crane.add(wingL);

      const wingR = new THREE.Mesh(wingGeo, matWhite);
      wingR.position.set(0.72, 0, 0);
      wingR.rotation.x = -Math.PI / 2;
      crane.add(wingR);

      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.35), matDark);
      tail.position.set(0, 0, -0.58);
      tail.rotation.x = -Math.PI / 2;
      crane.add(tail);

      crane.userData = { wingL, wingR, phase: i * 0.82 };
      craneGroup.add(crane);
      this.cranes.push(crane);
    }
    this.scene.add(craneGroup);
  }

  _buildGoldDustParticles() {
    const count = 240;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 260;
      pos[i * 3 + 1] = 2 + Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xF3D47C,
      size: 0.45,
      transparent: true,
      opacity: 0.52,
      depthWrite: false
    });
    this.goldDustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.goldDustPoints);
  }

  _buildSeasonAndWeatherSystems() {
    const count = 420;
    const sGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(count * 3);
    const sColor = new Float32Array(count * 3);
    this.seasonVel = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      sPos[i3] = (Math.random() - 0.5) * 260;
      sPos[i3 + 1] = 2 + Math.random() * 38;
      sPos[i3 + 2] = (Math.random() - 0.5) * 220;
      this.seasonVel[i3] = (Math.random() - 0.5) * 0.4 + 0.15;
      this.seasonVel[i3 + 1] = -(0.08 + Math.random() * 0.12);
      this.seasonVel[i3 + 2] = (Math.random() - 0.5) * 0.3;
      sColor[i3] = 0.96; sColor[i3 + 1] = 0.84; sColor[i3 + 2] = 0.45;
    }
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('color', new THREE.BufferAttribute(sColor, 3));
    this.seasonParticles = new THREE.Points(sGeo, new THREE.PointsMaterial({
      size: 1.25, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false
    }));
    this.scene.add(this.seasonParticles);

    const rainCount = 1200;
    const rGeo = new THREE.BufferGeometry();
    const rPos = new Float32Array(rainCount * 3);
    this.rainVelY = new Float32Array(rainCount);
    for (let i = 0; i < rainCount; i++) {
      rPos[i * 3] = (Math.random() - 0.5) * 220;
      rPos[i * 3 + 1] = 2 + Math.random() * 48;
      rPos[i * 3 + 2] = (Math.random() - 0.5) * 180;
      this.rainVelY[i] = -(32 + Math.random() * 20);
    }
    rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
    this.rainMesh = new THREE.Points(rGeo, new THREE.PointsMaterial({
      color: 0xC8DDE8, size: 0.82, transparent: true, opacity: 0.55, depthWrite: false
    }));
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);
  }

  _applyAtmosphereTarget(presetKey) {
    const p = ATMOSPHERE_PRESETS[presetKey] || ATMOSPHERE_PRESETS.summer;
    this._atmoTarget.bg.copy(p.bg);
    this._atmoTarget.fog.copy(p.fog);
    this._atmoTarget.ambient.copy(p.ambient);
    this._atmoTarget.ambientInt = p.ambientInt;
    this._atmoTarget.sun.copy(p.sun);
    this._atmoTarget.sunInt = p.sunInt;
    this._atmoTarget.seasonTint.copy(p.seasonTint);
    this._atmoTarget.snow = p.snow;
    this._atmoTarget.nightMix = p.nightMix;
  }

  setSeason(seasonName) {
    this.currentSeason = seasonName;
    if (!this.isNight) {
      this._applyAtmosphereTarget(seasonName);
    }

    const sColors = this.seasonParticles.geometry.attributes.color.array;
    const count = this.seasonParticles.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      if (seasonName === 'spring') {
        if (i % 2 === 0) { sColors[i3] = 1.0; sColors[i3 + 1] = 0.72; sColors[i3 + 2] = 0.76; }
        else { sColors[i3] = 0.58; sColors[i3 + 1] = 0.85; sColors[i3 + 2] = 0.62; }
      } else if (seasonName === 'autumn') {
        if (i % 2 === 0) { sColors[i3] = 0.88; sColors[i3 + 1] = 0.38; sColors[i3 + 2] = 0.22; }
        else { sColors[i3] = 0.95; sColors[i3 + 1] = 0.72; sColors[i3 + 2] = 0.26; }
      } else if (seasonName === 'winter') {
        sColors[i3] = 0.96; sColors[i3 + 1] = 0.98; sColors[i3 + 2] = 1.0;
      } else {
        sColors[i3] = 0.96; sColors[i3 + 1] = 0.84; sColors[i3 + 2] = 0.45;
      }
    }
    this.seasonParticles.geometry.attributes.color.needsUpdate = true;
  }

  setWeather(weatherName) {
    this.currentWeather = weatherName;
    if (weatherName === 'rain') {
      this.rainMesh.visible = true;
      this._atmoTarget.fogDensity = 0.0052;
      audio.playWaterRipples();
    } else {
      this.rainMesh.visible = false;
      this._atmoTarget.fogDensity = 0.0032;
    }
  }

  setNight(isNight) {
    this.isNight = isNight;
    this._applyAtmosphereTarget(isNight ? 'night' : this.currentSeason);
    Object.values(this.skyBeams).forEach(b => {
      b.material.opacity = isNight ? 0.30 : 0.11;
    });
  }

  /**
   * 1.8s 平滑昼夜与四季渐变：彻底同步天空、雾色、山体、水体、瀑布、神兽与逐盏点亮的万家渔火
   */
  _updateAtmosphereTransition(dt) {
    const rate = Math.min(1.0, dt * 1.85);
    const c = this._atmoCurrent;
    const t = this._atmoTarget;

    c.bg.lerp(t.bg, rate);
    c.fog.lerp(t.fog, rate);
    c.ambient.lerp(t.ambient, rate);
    c.ambientInt = THREE.MathUtils.lerp(c.ambientInt, t.ambientInt, rate);
    c.sun.lerp(t.sun, rate);
    c.sunInt = THREE.MathUtils.lerp(c.sunInt, t.sunInt, rate);
    c.seasonTint.lerp(t.seasonTint, rate);
    c.snow = THREE.MathUtils.lerp(c.snow, t.snow, rate);
    c.nightMix = THREE.MathUtils.lerp(c.nightMix, t.nightMix, rate);
    c.fogDensity = THREE.MathUtils.lerp(c.fogDensity, t.fogDensity, rate);

    this.scene.background.copy(c.bg);
    this.scene.fog.color.copy(c.fog);
    this.scene.fog.density = c.fogDensity;

    if (this.ambientLight) {
      this.ambientLight.color.copy(c.ambient);
      this.ambientLight.intensity = c.ambientInt;
    }
    if (this.sunLight) {
      this.sunLight.color.copy(c.sun);
      this.sunLight.intensity = c.sunInt;
    }
    if (this.skyMat) {
      this.skyMat.uniforms.uHorizonColor.value.copy(c.fog);
      this.skyMat.uniforms.uZenithColor.value.copy(c.bg).multiplyScalar(0.62);
      this.skyMat.uniforms.uNightMix.value = c.nightMix;
    }
    if (this.terrainMat) {
      this.terrainMat.uniforms.uFogColor.value.copy(c.fog);
      this.terrainMat.uniforms.uSunColor.value.copy(c.sun);
      this.terrainMat.uniforms.uNightMix.value = c.nightMix;
      this.terrainMat.uniforms.uSeasonTint.value.copy(c.seasonTint);
      this.terrainMat.uniforms.uSnowAmount.value = c.snow;
    }
    if (this.waterMat) {
      this.waterMat.uniforms.uFogColor.value.copy(c.fog);
      this.waterMat.uniforms.uNightMix.value = c.nightMix;
      this.waterMat.uniforms.uSeasonTint.value.copy(c.seasonTint);
    }
    if (this.waterfallObj?.userData?.shaderMat) {
      this.waterfallObj.userData.shaderMat.uniforms.uNightMix.value = c.nightMix;
    }
    if (this.valleyMistMat) {
      this.valleyMistMat.color.copy(c.fog).lerp(new THREE.Color(0xFFFFFF), 0.35 * (1 - c.nightMix));
      this.valleyMistMat.opacity = 0.42 * (1.0 - c.nightMix * 0.55);
    }
    if (this.beastManager) {
      this.beastManager.syncEnvironment(c.fog, c.nightMix);
    }
    // 夜景万家灯火渐次点亮
    if (this.lanternLights) {
      this.lanternLights.forEach(l => {
        const targetInt = 1.2 + c.nightMix * 2.8;
        l.intensity = THREE.MathUtils.lerp(l.intensity, targetInt, rate);
      });
    }
  }

  _initBeasts() {
    this.beastManager = new Beast3DManager(this.scene);
    BEASTS.forEach(b => {
      const groundY = this._calculateTerrainHeight(b.coordinates.x, b.coordinates.z);
      const safeGround = Math.max(WATER_LEVEL + 0.1, groundY);
      this.beastManager.createBeastMesh(b, safeGround);
      this._createSkyBeam(b);
    });
  }

  _createSkyBeam(beast) {
    const beamGeo = new THREE.CylinderGeometry(0.22, 0.78, 86, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xF5CF68,
      transparent: true,
      opacity: 0.11,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(beast.coordinates.x, beast.coordinates.y + 42, beast.coordinates.z);
    this.scene.add(beam);
    this.skyBeams[beast.id] = beam;
  }

  startCinematicIntro() {
    this.customCameraController = null;
    this.boatCruise.active = false;
    this.onBoatStateChange(false);
    this.cinematic.active = true;
    this.cinematic.startTime = this.clock.getElapsedTime();
    this.camera.position.copy(this.cinematic.startPos);
    this.camera.lookAt(this.cinematic.startLook);
    audio.ensureContext();
    audio.playGuqinPluck(196.00, 4.5);
  }

  _updateCinematic(time) {
    const elapsed = time - this.cinematic.startTime;
    const t = Math.min(1.0, elapsed / this.cinematic.duration);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.camera.position.lerpVectors(this.cinematic.startPos, this.cinematic.endPos, ease);
    const currentLook = new THREE.Vector3().lerpVectors(
      this.cinematic.startLook,
      this.cinematic.endLook,
      ease
    );
    this.camera.lookAt(currentLook);

    if (t >= 1.0) {
      this.cinematic.active = false;
      this.player.pos.copy(this.spawnPos);
      this.player.yaw = this.spawnYaw;
      this.player.pitch = this.spawnPitch;
      this.camera.position.copy(this.player.pos);
    }
  }

  _initControls() {
    window.addEventListener('keydown', (e) => {
      if (document.getElementById('brush-awakening-overlay')) return;
      if (this.cinematic.active) {
        this.cinematic.active = false;
        this.player.pos.copy(this.spawnPos);
        return;
      }

      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        this.tryAwakenNearBeast();
      } else if (e.code === 'KeyB') {
        this.toggleBoatCruise();
      } else if (e.code === 'KeyM' || e.code === 'Escape') {
        this.onExitToScroll();
      } else if (e.code === 'Space' && this.player.isGrounded && !this.boatCruise.active) {
        this.player.jumpVelocity = 8.5;
        this.player.isGrounded = false;
        audio.playFootstep();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.container.addEventListener('mousedown', (e) => {
      if (document.getElementById('brush-awakening-overlay')) return;
      if (this.cinematic.active) {
        this.cinematic.active = false;
        this.player.pos.copy(this.spawnPos);
        return;
      }
      audio.ensureContext();
      this.isDragging = true;
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || this.cinematic.active) return;
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

    // 独立 touch.identifier 跟踪：绝不与左下角移动端摇杆互相抢夺触控！
    this.container.addEventListener('touchstart', (e) => {
      if (document.getElementById('brush-awakening-overlay')) return;
      if (this.cinematic.active) {
        this.cinematic.active = false;
        this.player.pos.copy(this.spawnPos);
        return;
      }
      audio.ensureContext();
      if (this._lookTouchId === null && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        this._lookTouchId = touch.identifier;
        this.isDragging = true;
        this.lastMouse.x = touch.clientX;
        this.lastMouse.y = touch.clientY;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || this._lookTouchId === null || this.cinematic.active) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this._lookTouchId) {
          const dx = touch.clientX - this.lastMouse.x;
          const dy = touch.clientY - this.lastMouse.y;
          this.lastMouse.x = touch.clientX;
          this.lastMouse.y = touch.clientY;
          this.player.yaw -= dx * 0.0042;
          this.player.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.player.pitch - dy * 0.0036));
          break;
        }
      }
    }, { passive: true });

    const releaseLookTouch = (e) => {
      if (this._lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._lookTouchId) {
          this._lookTouchId = null;
          this.isDragging = false;
          break;
        }
      }
    };
    window.addEventListener('touchend', releaseLookTouch);
    window.addEventListener('touchcancel', releaseLookTouch);
  }

  tryAwakenNearBeast() {
    if (!this.nearestBeast || this.nearestDistance > 17.5) return null;
    if (this.awakeningDirector && this.awakeningDirector.isPlaying) return null;
    const beast = this.nearestBeast;

    if (!this.awakenedZones.has(beast.id)) {
      this.awakenedZones.add(beast.id);

      if (this.skyBeams[beast.id]) {
        this.skyBeams[beast.id].material.opacity = 0.03;
      }

      const beastMesh = this.beastManager?.beastObjects?.[beast.id] || null;
      if (this.awakeningDirector && beastMesh) {
        this.awakeningDirector.playAwakeningSequence(beastMesh, beast, (b) => {
          this.onAwakenBeast(b);
        });
      } else {
        this.beastManager?.triggerAwaken(beast.id);
        this.onAwakenBeast(beast);
      }
      return beast;
    } else {
      // 已唤醒的神兽再次按 E 可重温其高清工笔画札
      this.onAwakenBeast(beast, true);
      return beast;
    }
  }

  teleportToBeast(beastId) {
    const beast = BEASTS.find(b => b.id === beastId);
    if (!beast) return;

    this.cinematic.active = false;
    this.customCameraController = null;
    if (this.boatCruise.active) {
      this.boatCruise.active = false;
      this.onBoatStateChange(false);
    }

    let offsetX = 7.5;
    let offsetZ = 7.5;
    if (beastId === 'fuzhu') { offsetX = 5.5; offsetZ = 8.5; }
    else if (beastId === 'qingniao') { offsetX = -4.2; offsetZ = 5.2; }
    else if (beastId === 'baize') { offsetX = -7.5; offsetZ = 6.2; }
    else if (beastId === 'bo') { offsetX = -5.5; offsetZ = 4.2; }

    const targetX = beast.coordinates.x + offsetX;
    const targetZ = beast.coordinates.z + offsetZ;
    const groundY = Math.max(WATER_LEVEL + 0.15, this._calculateTerrainHeight(targetX, targetZ));
    const targetY = groundY + this.player.height;

    this.player.pos.set(targetX, targetY, targetZ);

    const dir = new THREE.Vector3(beast.coordinates.x, beast.coordinates.y + 2.4, beast.coordinates.z)
      .sub(this.player.pos).normalize();
    this.player.yaw = Math.atan2(-dir.x, -dir.z);
    this.player.pitch = -0.04;

    this.camera.position.copy(this.player.pos);
    const targetLook = new THREE.Vector3(
      this.camera.position.x - Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
      this.camera.position.y + Math.sin(this.player.pitch),
      this.camera.position.z - Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
    );
    this.camera.lookAt(targetLook);

    audio.playEnterPaintingSound();
  }

  _updateBoats(dt, time) {
    // 1. 玩家巡游乌篷画舫
    if (this.boatCruise.mesh) {
      if (this.boatCruise.active) {
        // W 加速摇橹，S 放缓停驻赏景
        let targetMult = 1.0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) targetMult = 2.0;
        else if (this.keys['KeyS'] || this.keys['ArrowDown']) targetMult = 0.08;
        this.boatCruise.speedMult = THREE.MathUtils.lerp(this.boatCruise.speedMult, targetMult, dt * 3.0);

        // 偶尔轻响一声柔和摇橹声
        if (this.boatCruise.speedMult > 0.35 && time - this.boatCruise.lastOarTime > 3.6) {
          this.boatCruise.lastOarTime = time;
          audio.playBoatOar();
        }
      } else {
        this.boatCruise.speedMult = 0.45;
      }

      this.boatCruise.t = (this.boatCruise.t + this.boatCruise.baseSpeed * this.boatCruise.speedMult * dt) % 1.0;
      const pos = this.boatCruise.curve.getPointAt(this.boatCruise.t);
      const nextPos = this.boatCruise.curve.getPointAt((this.boatCruise.t + 0.006) % 1.0);
      const dir = nextPos.clone().sub(pos).normalize();

      const bobY = Math.sin(time * 2.0) * 0.06;
      this.boatCruise.mesh.position.set(pos.x, WATER_LEVEL + bobY, pos.z);
      // 船身局部 -X 为船首，对准前进方向
      this.boatCruise.mesh.rotation.y = Math.atan2(dir.z, -dir.x);
      this.boatCruise.mesh.rotation.z = Math.sin(time * 1.6) * 0.028;

      if (this.waterMat?.uniforms?.uBoatPos) {
        this.waterMat.uniforms.uBoatPos.value.copy(this.boatCruise.mesh.position);
      }

      // 如果玩家正乘舟，同步第一人称船首观景机位
      if (this.boatCruise.active) {
        const seatOffset = dir.clone().multiplyScalar(1.2);
        this.player.pos.set(pos.x + seatOffset.x, WATER_LEVEL + 2.35 + bobY, pos.z + seatOffset.z);

        this.camera.position.lerp(this.player.pos, 0.22);
        const targetLook = new THREE.Vector3(
          this.camera.position.x - Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
          this.camera.position.y + Math.sin(this.player.pitch),
          this.camera.position.z - Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
        );
        this.camera.lookAt(targetLook);
      }
    }

    // 2. 两条装饰性江面行舟
    this.ambientBoats.forEach((item, idx) => {
      item.t = (item.t + item.speed * dt) % 1.0;
      const p = this.boatCruise.curve.getPointAt(item.t);
      const p2 = this.boatCruise.curve.getPointAt((item.t + 0.008) % 1.0);
      const d = p2.clone().sub(p).normalize();
      item.mesh.position.set(p.x, WATER_LEVEL + Math.sin(time * 1.8 + idx * 2.0) * 0.05, p.z);
      item.mesh.rotation.y = Math.atan2(d.z, -d.x);
    });
  }

  _updatePlayer(dt) {
    if (this.boatCruise.active) return;

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

      const nextX = THREE.MathUtils.clamp(this.player.pos.x + move.x * currentSpeed * dt, -115, 130);
      const nextZ = THREE.MathUtils.clamp(this.player.pos.z + move.z * currentSpeed * dt, -82, 88);

      this.player.pos.x = nextX;
      this.player.pos.z = nextZ;
      this.player.walkCycle += dt * 8.2;

      audio.playFootstep();
    }

    if (!this.player.isGrounded) {
      this.player.pos.y += this.player.jumpVelocity * dt;
      this.player.jumpVelocity -= 22.0 * dt;
    }

    // 涉水保护：走到江边时停在清浅水面之上（或穿行虹桥桥面高度）
    let groundY = this._calculateTerrainHeight(this.player.pos.x, this.player.pos.z);

    // 千步虹桥桥面可行走支撑检测 (x ∈ [22.5, 49.5], z ∈ [-17.2, -12.8])
    if (this.player.pos.x >= 22.5 && this.player.pos.x <= 49.5 && Math.abs(this.player.pos.z - (-15)) <= 2.3) {
      const frac = (this.player.pos.x - 36.0) / 13.5;
      const bridgeY = 5.3 + (1.0 - Math.min(1, frac * frac)) * 4.2;
      groundY = Math.max(groundY, bridgeY);
    }

    const safeFloor = Math.max(groundY, WATER_LEVEL + 0.12);
    if (this.player.pos.y <= safeFloor + this.player.height) {
      this.player.pos.y = safeFloor + this.player.height;
      this.player.isGrounded = true;
      this.player.jumpVelocity = 0;
    }

    const headBob = Math.sin(this.player.walkCycle) * 0.04;
    const targetCamY = this.player.pos.y + headBob;

    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, this.player.pos.x, 0.20);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, 0.20);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, this.player.pos.z, 0.20);

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
    this.onNearBeastChange(minDistance <= 17.5 ? closestBeast : null, minDistance);
    this.onCompassUpdate(compassList, this.player.yaw);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.08);
    const time = this.clock.getElapsedTime();

    this._updateAtmosphereTransition(dt);
    this._updateBoats(dt, time);

    if (this.customCameraController) {
      this.customCameraController(dt);
    } else if (this.cinematic.active) {
      this._updateCinematic(time);
    } else {
      this._updatePlayer(dt);
      this._checkBeastProximity();
    }

    // 3D 距离感应空间声景实时混音
    audio.updateSpatialAmbience(this.player.pos, {
      isRain: this.currentWeather === 'rain',
      isOnBoat: this.boatCruise.active,
      isNight: this.isNight
    });

    // 更新工笔金线神兽（面向相机 + 呼吸飘动 + 粒子流）
    if (this.beastManager) {
      this.beastManager.update(dt, time, this.camera);
    }

    if (this.terrainMat?.uniforms?.uTime) {
      this.terrainMat.uniforms.uTime.value = time;
    }

    if (this.waterMat?.uniforms) {
      this.waterMat.uniforms.uTime.value = time;
      this.waterMat.uniforms.uRainIntensity.value = (this.currentWeather === 'rain') ? 1.0 : 0.0;
    }

    // 流动瀑布与水潭烟雾
    if (this.waterfallObj?.userData) {
      this.waterfallObj.userData.shaderMat.uniforms.uTime.value = time;
      const mp = this.waterfallObj.userData.mistPoints.geometry.attributes.position;
      for (let i = 0; i < mp.count; i++) {
        let py = mp.getY(i) + dt * 1.1;
        if (py > 4.6) py = 0.2;
        mp.setY(i, py);
      }
      mp.needsUpdate = true;
    }

    // 江村袅袅炊烟
    this.smokePlumes.forEach((smoke, sIdx) => {
      const pos = smoke.geometry.attributes.position;
      const phases = smoke.userData.phases;
      for (let i = 0; i < pos.count; i++) {
        const p = (phases[i] + time * 0.09) % 1.0;
        pos.setXYZ(
          i,
          Math.sin(p * 5.0 + time + sIdx) * p * 2.2,
          p * 12.0,
          Math.cos(p * 4.0 + time * 0.7) * p * 1.5
        );
      }
      pos.needsUpdate = true;
    });

    // 谷雾飘动
    this.valleyMistPlanes.forEach(plane => {
      const u = plane.userData;
      plane.position.x = u.baseX + Math.sin(time * 0.16 + u.phase) * 9.0;
      plane.position.z = u.baseZ + Math.cos(time * 0.13 + u.phase) * 5.0;
    });

    // 九羽瑞鹤列队巡天
    if (this.cranes.length > 0) {
      const leaderAngle = time * 0.085;
      const cx = 12.0 + Math.sin(leaderAngle) * 46.0;
      const cz = -34.0 + Math.cos(leaderAngle) * 26.0;
      const cy = 34.0 + Math.sin(time * 0.35) * 2.4;
      const heading = leaderAngle + Math.PI / 2;
      const cosH = Math.cos(heading);
      const sinH = Math.sin(heading);

      this.cranes.forEach((crane, i) => {
        const u = crane.userData;
        const wingRot = Math.sin(time * 6.4 + u.phase) * 0.44;
        u.wingL.rotation.z = wingRot;
        u.wingR.rotation.z = -wingRot;

        const rank = Math.floor((i + 1) / 2);
        const side = (i % 2 === 0) ? 1.0 : -1.0;
        const fx = i === 0 ? 0 : side * rank * 3.4;
        const fz = i === 0 ? 0 : rank * 3.8;
        crane.position.set(
          cx + fx * cosH - fz * sinH,
          cy + Math.sin(u.phase + time * 0.8) * 0.7,
          cz + fx * sinH + fz * cosH
        );
        crane.rotation.y = heading;
      });
    }

    // 宣和金粉浮尘
    if (this.goldDustPoints) {
      const pos = this.goldDustPoints.geometry.attributes.position;
      for (let i = 1; i < pos.count; i += 3) {
        let py = pos.getY(i) - 0.03;
        if (py < 1.5) py = 38.0;
        pos.setY(i, py);
      }
      pos.needsUpdate = true;
    }

    // 四时粒子与时雨
    if (this.seasonParticles) {
      const pos = this.seasonParticles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let px = pos.getX(i) + this.seasonVel[i * 3] * dt * 24;
        let py = pos.getY(i) + this.seasonVel[i * 3 + 1] * dt * 24;
        let pz = pos.getZ(i) + this.seasonVel[i * 3 + 2] * dt * 24;
        if (py < 1.0) py = 38.0;
        if (px > 130) px = -130;
        if (px < -130) px = 130;
        if (pz > 110) pz = -110;
        if (pz < -110) pz = 110;
        pos.setXYZ(i, px, py, pz);
      }
      pos.needsUpdate = true;
    }

    if (this.rainMesh && this.rainMesh.visible) {
      const pos = this.rainMesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let py = pos.getY(i) + this.rainVelY[i] * dt;
        if (py < 1.0) py = 46.0;
        pos.setY(i, py);
      }
      pos.needsUpdate = true;
    }

    Object.entries(this.skyBeams).forEach(([id, beam]) => {
      if (!this.awakenedZones.has(id)) {
        beam.rotation.y += 0.008;
        beam.scale.x = 1.0 + Math.sin(time * 2.0) * 0.10;
        beam.scale.z = beam.scale.x;
      }
    });

    // ★ 捕获真实平面水面倒影（供水体 5-Tap 墨韵软倒影实时采样）
    if (this.riverReflector && this.waterMesh) {
      this.riverReflector.render(this.renderer, this.scene, this.camera, this.waterMesh);
    }

    // 执行工笔铁线描 + 双丝古绢后处理管线
    if (this.postPipeline) {
      try {
        this.postPipeline.render(time, this._atmoCurrent.nightMix > 0.5);
      } catch (e) {
        this.renderer.render(this.scene, this.camera);
      }
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
