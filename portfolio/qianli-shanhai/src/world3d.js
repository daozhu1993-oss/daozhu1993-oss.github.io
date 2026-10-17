/**
 * 《千里江山 · 借笔还魂》3D 沉浸式青绿大境漫步引擎 (Immersive Blue-and-Green 3D Roaming Engine)
 * 纯 WebGL / Three.js 打造，北宋院体青绿重彩与山海经通灵画境
 * 对标 Awwwards SOTD / Webby Awards / FWA 殿堂级数字艺术品质
 * 
 * 核心技术与艺术亮点：
 * 1. 【三矾九染 · 矿物重彩山峦着色器 (Mineral Mountain Shader)】：
 *    - 坡度自适应斧劈皴 (Axe-Cut Cun)：陡壁绝崖天然展现苍墨赭石岩理，绝无拉伸条形码。
 *    - 五重矿物色阶：泥金渚岸 -> 暖赭山麓 -> 孔雀石绿 -> 蓝铜矿宝石蓝 -> 峰巅天青。
 *    - 泥金勾边 (Gilded Ridges) 与云母微晶闪光 (Mineral Sparkle)。
 *    - 融合故宫真迹千亿像素长卷通卷纹理，三远法古绢云雾自然空濛。
 * 2. 【北宋院体澄碧鱼鳞微澜水体 (Song Stylized Water Shader)】：
 *    - 600m 无边大泽，双重鱼鳞交织回澜，翡翠与孔雀绿矿物深浅分染，晨曦耀金镜面高光，远天无缝融雾。
 * 3. 【北宋编木拱千步虹桥 (Song Timber Rainbow Bridge)】：
 *    - 严格复原《千里江山图》与《清明上河图》经典编木拱贯木飞梁，朱红望柱、古木横梁与青石桥引。
 * 4. 【舒啸临风矶 · 希孟笔墨石台 (Scholar's Promontory & Wang Ximeng's Cliff Desk)】：
 *    - 悬崖古石矶，生有数百年苍劲古松横出云岫，置有王希孟作画之石案、未干之长卷、端砚狼毫与石经幢灯。
 * 5. 【层岚叠岫流动谷雾 (Floating Valley Mist)】：
 *    - 多层半透谷雾平移流转于峡谷水际，营造“留白、含蓄、深远”的宋画意境。
 * 6. 【宋徽宗《瑞鹤图》祥鹤列队翱翔 (Flock of Soaring Cranes)】：
 *    - 九羽仙鹤展翼巡天，振翅轻灵，环绕崇山碧水。
 * 7. 【开屏导览运镜 (Cinematic Opening Fly-in Glide)】：
 *    - 俯冲穿云入画，掠过千步虹桥与澄碧大泽，平稳降落于高崖石台。
 * 8. 【接地暗墨 (Contact Ink)】：茅舍、桥台、石矶与神兽足下贴地柔影，物体不再悬空。
 * 9. 【画幕足下水墨雾带】：真迹弧幕底部 y∈[0,5] 平移噪声雾，山石从雾中长出。
 */

import * as THREE from 'three';
import { BEASTS } from './beasts.js';
import { Beast3DManager } from './beast3d.js';
import { audio } from './audio.js';
import { InkPostPipeline } from './inkPostProcess.js';
import { createSongWaterSSRMaterial } from './water-ssr-shader.js';
import { BeastAwakeningDirector } from './awakening-director.js';

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
    this.awakeningDirector = null;
    this.customCameraController = null;

    // 玩家目标落点（舒啸绝壁观景石矶前沿）
    this.spawnPos = new THREE.Vector3(-20.5, 12.4, 34.5);
    this.spawnYaw = -0.34;
    this.spawnPitch = -0.10;

    // 玩家物理与漫步状态
    this.player = {
      pos: this.spawnPos.clone(),
      vel: new THREE.Vector3(),
      yaw: this.spawnYaw,
      pitch: this.spawnPitch,
      speed: 13.5,
      sprintMultiplier: 1.85,
      height: 2.2,
      isGrounded: true,
      jumpVelocity: 0,
      walkCycle: 0
    };

    // 运镜状态机 (Cinematic Fly-in State)
    this.cinematic = {
      active: false,
      startTime: 0,
      duration: 3.6,
      startPos: new THREE.Vector3(-55, 48, 90),
      startLook: new THREE.Vector3(25, 12, -20),
      endPos: this.spawnPos.clone(),
      endLook: new THREE.Vector3(
        this.spawnPos.x - Math.sin(this.spawnYaw) * 12,
        this.spawnPos.y + Math.sin(this.spawnPitch) * 12,
        this.spawnPos.z - Math.cos(this.spawnYaw) * 12
      )
    };

    this.keys = {};
    this.virtualMove = { x: 0, y: 0 };
    this.virtualLook = { x: 0, y: 0 };
    this.userFov = 62;
    this.isDragging = false;
    this.lookTouchId = null;
    this.lastMouse = { x: 0, y: 0 };
    this.clock = new THREE.Clock();

    // 场景对象缓存
    this.nearestBeast = null;
    this.nearestDistance = Infinity;
    this.terrain = null;
    this.terrainMat = null;
    this.waterMesh = null;
    this.skyBeams = {};
    this.goldDustPoints = null;
    this.cranes = [];
    this.lanternLights = [];
    this.valleyMistPlanes = [];
    this.inkMistMaterials = [];
    this.scrollBackdrops = [];
    this.reedMat = null;
    this.bridgeLift = 0;
    this._texCache = {};
    this.awakenedZones = new Set();
    this.masterPaintingTex = null;
    this.cutoutMaterials = [];

    // 四时与气象系统
    this.currentSeason = 'summer';
    this.isNight = false;
    this.currentWeather = 'clear';
    this.seasonParticles = null;
    this.rainMesh = null;

    this._initScene();
    this._initMasterPaintingTexture();
    this._buildAtmosphereAndSky();
    this._buildLayeredMasterpieceParallax();
    this._buildTexturedTerrain();
    this._buildStylizedWater();
    this._buildSpawnOverlookPlatform();
    this._buildStoneRoadAndLanterns();
    this._buildScenicLandmarks();
    this._buildValleyMist();
    this._buildScrollInkMist();
    this._buildRiversideReeds();
    this._buildFlyingCranes();
    this._buildGoldDustParticles();
    this._buildSeasonAndWeatherSystems();
    this._initBeasts();
    this._groundBeasts();
    this.awakeningDirector = new BeastAwakeningDirector(this, null, audio);
    this._initControls();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();

    // 北宋宣和古绢温润古雅底色 (#7A6946)
    this.scene.background = new THREE.Color(0x7A6946);
    this.scene.fog = new THREE.FogExp2(0x7A6946, 0.0035);

    const w = (this.container && this.container.clientWidth > 0)
      ? this.container.clientWidth
      : (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const h = (this.container && this.container.clientHeight > 0)
      ? this.container.clientHeight
      : (typeof window !== 'undefined' ? window.innerHeight : 720);

    this.camera = new THREE.PerspectiveCamera(
      this.userFov,
      w / h,
      0.1,
      1400
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.38;
    this.container.appendChild(this.renderer.domElement);

    // 东方晨曦金碧采光系统
    const ambientLight = new THREE.AmbientLight(0xFFF0D5, 1.45);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight;

    const hemiLight = new THREE.HemisphereLight(0xFFFAF2, 0x483C25, 1.6);
    this.scene.add(hemiLight);
    this.hemiLight = hemiLight;

    const sunLight = new THREE.DirectionalLight(0xFFE8C2, 2.35);
    sunLight.position.set(65, 120, 80);
    this.scene.add(sunLight);
    this.sunLight = sunLight;

    try {
      this.postPipeline = new InkPostPipeline(
        this.renderer,
        this.scene,
        this.camera,
        w,
        h
      );
    } catch (err) {
      console.warn('[PostPipeline Init Warning]', err);
      this.postPipeline = null;
    }

    window.addEventListener('resize', () => {
      this.handleResize();
    });
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
    if (this.postPipeline) {
      this.postPipeline.resize(w, h);
    }
  }

  // =========================================================================
  // 【核心画卷】生成王希孟《千里江山图》故宫真迹高清长卷纹理
  // =========================================================================
  _initMasterPaintingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 4096;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // 预填宣和绢本矿物色阶底色
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
        if (this.terrainMat && this.terrainMat.uniforms.uMasterTex) {
          this.terrainMat.uniforms.uMasterTex.value = this.masterPaintingTex;
        }
      };
      img.src = `assets/painting/section_${sec.id}.jpg`;
    });
  }

  _buildAtmosphereAndSky() {
    const skyGeo = new THREE.SphereGeometry(420, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.54);
    const skyCv = document.createElement('canvas');
    skyCv.width = 128;
    skyCv.height = 512;
    const skyCtx = skyCv.getContext('2d');
    const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0.0, '#3E321E'); // 天顶沉敛古绢深色
    skyGrad.addColorStop(0.40, '#655436');
    skyGrad.addColorStop(0.78, '#8E7B54'); // 天际暖金古绢晨岚
    skyGrad.addColorStop(1.0, '#7A6946');
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
    skyMesh.position.y = -6;
    this.scene.add(skyMesh);
  }

  // =========================================================================
  // 【故宫 3.0 同款 · 殿堂级真迹分层立体视差置景系统】
  // (Palace Museum 3.0 Layered Masterpiece Parallax 3D Engine)
  // 告别纯前端数学假山！100% 故宫王希孟十二米绝世真迹笔触立体化置景
  // =========================================================================
  _buildLayeredMasterpieceParallax() {
    const texLoader = new THREE.TextureLoader();

    // 1. 【宏伟全景古卷天际穹幕弧屏】(Layer 0: Panoramic Celestial Silk Horizon)
    const panoTex = texLoader.load('assets/painting/cutouts/sky_panorama_scroll.webp');
    panoTex.colorSpace = THREE.SRGBColorSpace;
    panoTex.wrapS = THREE.ClampToEdgeWrapping;
    panoTex.wrapT = THREE.ClampToEdgeWrapping;

    const panoGeo = new THREE.CylinderGeometry(
      360, 360, 160, 48, 1, true, -Math.PI * 0.72, Math.PI * 1.44
    );
    const panoMat = new THREE.MeshBasicMaterial({
      map: panoTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.90,
      fog: true
    });
    const panoMesh = new THREE.Mesh(panoGeo, panoMat);
    panoMesh.position.set(0, 40, -60);
    this.scene.add(panoMesh);

    // 2. 【故宫真迹通景画轴材质着色器】
    // 上下自然羽化融入天穹与长河，矿物重彩提纯，深度视差融雾
    const createScrollMaterial = (secId, options = {}) => {
      const tex = texLoader.load(`assets/painting/section_${secId}.jpg`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;

      return new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: tex },
          uSunDir: { value: this.sunLight ? this.sunLight.position.clone().normalize() : new THREE.Vector3(0.5, 0.8, 0.4).normalize() },
          uSunColor: { value: new THREE.Color(0xFFE8C2) },
          uFogColor: { value: new THREE.Color(0x7A6946) },
          uFogNear: { value: options.fogNear || 50.0 },
          uFogFar: { value: options.fogFar || 320.0 },
          uVibrance: { value: options.vibrance || 1.30 },
          uFadeTop: { value: options.fadeTop || 0.22 },
          uFadeBottom: { value: options.fadeBottom || 0.82 },
          uCropMinX: { value: options.cropMinX || 0.0 },
          uCropMaxX: { value: options.cropMaxX || 1.0 },
          uTime: { value: 0 },
          uGlow: { value: 0.0 }
        },
        vertexShader: /* glsl */`
          varying vec2 vUv;
          varying vec3 vWorldPos;
          uniform float uTime;

          void main() {
            vUv = uv;
            vec3 pos = position;
            // 峰巅微风拂动 (Subtle mountain breath)
            if (pos.y > 0.0) {
              float sway = sin(uTime * 0.9 + pos.x * 0.03) * 0.12 * (pos.y / 50.0);
              pos.x += sway;
            }
            vec4 wp = modelMatrix * vec4(pos, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */`
          uniform sampler2D uMap;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform vec3 uFogColor;
          uniform float uFogNear;
          uniform float uFogFar;
          uniform float uVibrance;
          uniform float uFadeTop;
          uniform float uFadeBottom;
          uniform float uCropMinX;
          uniform float uCropMaxX;
          uniform float uTime;
          uniform float uGlow;

          varying vec2 vUv;
          varying vec3 vWorldPos;

          void main() {
            vec2 sampleUv = vec2(
              mix(uCropMinX, uCropMaxX, vUv.x),
              vUv.y
            );
            vec4 tex = texture2D(uMap, sampleUv);
            vec3 col = tex.rgb;

            // 1. 北宋矿物重彩宝石提纯 (石青蓝铜矿与石绿孔雀石)
            float isGreen = smoothstep(0.10, 0.32, col.g - col.r * 0.82);
            float isBlue  = smoothstep(0.06, 0.28, col.b - col.r * 0.62);
            vec3 mineralBoost = col * vec3(1.02, 1.25, 1.30);
            col = mix(col, mineralBoost, clamp(isGreen + isBlue, 0.0, 1.0) * 0.55 * uVibrance);

            // 2. 纵向羽化与透明度过渡 (上下无缝融入天水)
            float topFade = smoothstep(0.0, uFadeTop, vUv.y);
            float bottomFade = 1.0 - smoothstep(uFadeBottom, 1.0, vUv.y);
            float alpha = topFade * bottomFade;

            // 3. 神兽唤醒金碧霞光
            col += vec3(0.22, 0.18, 0.06) * uGlow;

            // 4. 真实距离与三远法古绢深远融雾
            float dist = length(cameraPosition - vWorldPos);
            float fogFactor = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 0.88);
            vec3 finalColor = mix(col, uFogColor, fogFactor);

            gl_FragColor = vec4(finalColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
    };

    // 辅助函数：创建自然包络弧度的全景画轴网格
    const createCurvedScrollMesh = (mat, width, height, curveAngle = 0.18) => {
      const geo = new THREE.PlaneGeometry(width, height, 24, 6);
      const pos = geo.attributes.position;
      const r = width / (curveAngle || 0.001);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const bendZ = (1.0 - Math.cos(x / r)) * r * 0.5;
        pos.setZ(i, -bendZ);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      this.scrollBackdrops.push(mesh);
      return mesh;
    };

    // 3. 【核心中景景深弧幕：卷二 · 主峰耸翠与千步飞虹】 (Main Centerpiece Vista, Z = -85m)
    const matSec2 = createScrollMaterial(2, {
      fogNear: 35, fogFar: 280, vibrance: 1.30,
      fadeTop: 0.26, fadeBottom: 0.82
    });
    this.cutoutMaterials.push(matSec2);
    const meshSec2 = createCurvedScrollMesh(matSec2, 230, 82, 0.22);
    meshSec2.position.set(12, 32, -85);
    meshSec2.rotation.y = -0.05;
    this.scene.add(meshSec2);

    // 4. 【西翼景深弧幕：卷一 · 翠微千叠重峦与近滩水榭】 (Western Karst Vista, Z = -95m)
    const matSec1 = createScrollMaterial(1, {
      fogNear: 35, fogFar: 280, vibrance: 1.25,
      fadeTop: 0.26, fadeBottom: 0.82
    });
    this.cutoutMaterials.push(matSec1);
    const meshSec1 = createCurvedScrollMesh(matSec1, 210, 76, 0.22);
    meshSec1.position.set(-135, 28, -95);
    meshSec1.rotation.y = 0.26;
    this.scene.add(meshSec1);

    // 5. 【东翼景深弧幕：卷四 · 幽谷飞泉与千叠断崖】 (Eastern Waterfall Ravine Vista, Z = -95m)
    const matSec4 = createScrollMaterial(4, {
      fogNear: 35, fogFar: 280, vibrance: 1.25,
      fadeTop: 0.26, fadeBottom: 0.82
    });
    this.cutoutMaterials.push(matSec4);
    const meshSec4 = createCurvedScrollMesh(matSec4, 210, 76, 0.22);
    meshSec4.position.set(145, 28, -95);
    meshSec4.rotation.y = -0.24;
    this.scene.add(meshSec4);

    // 6. 【深远景弧幕：卷三 · 苍茫烟波与远岫屏风】 (Deep Far Distance Vista, Z = -165m)
    const matSec3 = createScrollMaterial(3, {
      fogNear: 70, fogFar: 320, vibrance: 1.15,
      fadeTop: 0.22, fadeBottom: 0.85
    });
    this.cutoutMaterials.push(matSec3);
    const meshSec3 = createCurvedScrollMesh(matSec3, 240, 88, 0.26);
    meshSec3.position.set(-70, 36, -165);
    meshSec3.rotation.y = 0.15;
    this.scene.add(meshSec3);

    // 7. 【深远景弧幕：卷五 · 天际平远与归海落霞】 (Deep Horizon Vista, Z = -195m)
    const matSec5 = createScrollMaterial(5, {
      fogNear: 80, fogFar: 340, vibrance: 1.15,
      fadeTop: 0.22, fadeBottom: 0.85
    });
    this.cutoutMaterials.push(matSec5);
    const meshSec5 = createCurvedScrollMesh(matSec5, 250, 92, 0.28);
    meshSec5.position.set(80, 38, -195);
    meshSec5.rotation.y = -0.12;
    this.scene.add(meshSec5);
  }

  // =========================================================================
  // 精确计算北宋崇峦峻岭自然起伏地貌 (Song Karst Landscape Height Function)
  // 主峰巍峨拔地、层峦叠嶂、绝壁奇峰、深峡飞泉、大泽舒展
  // =========================================================================
  _calculateTerrainHeight(x, z) {
    // 1. 南侧观景绝壁矶台 (出生点所在: x ≈ -20.5, z ≈ 34.5)
    const dxOverlook = x - (-22);
    const dzOverlook = z - 35;
    const distOverlook = Math.hypot(dxOverlook, dzOverlook);
    let overlook = 0;
    if (distOverlook < 16) {
      const t = distOverlook / 16;
      const flat = smoothstep(1.0, 0.35, t);
      overlook = flat * 11.2;
      // 绝壁前沿 (z < 32) 陡削断崖跌落
      if (z < 32.5) {
        const cliffDrop = Math.max(0.12, (z - 25.0) / 7.5);
        overlook *= cliffDrop;
      }
    }

    // 2. 澄碧长河水域与汀洲渚岸 (River Basin & Organic Sandbar Shoals)
    let riverDip = 0;
    if (z > -18 && z < 26) {
      const riverCenter = 4.0 + Math.sin(x * 0.025) * 8.0;
      const rDist = Math.abs(z - riverCenter);
      if (rDist < 18.0) {
        const rt = 1.0 - rDist / 18.0;
        riverDip = Math.pow(rt, 1.5) * 4.2;
        // 渚岸微澜沙汀
        const shoalWave = Math.sin(x * 0.08 + z * 0.12) * 0.30 * (1.0 - rt);
        riverDip -= shoalWave;
      }
    }

    // 3. 南侧丘陵与渚岸起伏 (z > 20)
    let southHills = 0;
    if (z > 16) {
      const dPeach = Math.hypot(x - (-45), z - 28);
      let peachBank = 0;
      if (dPeach < 18) {
        peachBank = (1.0 - dPeach / 18) * 1.6;
      }

      const dPaddy = Math.hypot(x - 12, z - 42);
      let paddyBank = 0;
      if (dPaddy < 20) {
        paddyBank = (1.0 - dPaddy / 20) * 2.2;
      }

      const roll = (Math.sin(x * 0.045) + Math.cos(z * 0.038)) * 1.8;
      southHills = roll + peachBank + paddyBank;
    }

    // 4. 北岸渚石与山麓台地 (为故宫真迹千叠立轴山峦提供自然生根地基)
    let mountain = 0;
    if (z < -14) {
      const depth = Math.min(1.0, (-14 - z) / 70.0);
      const bankRoll = (Math.sin(x * 0.06) + Math.cos(z * 0.05)) * 1.6;
      mountain = depth * 4.5 + bankRoll;

      // 桥头基石与渡口台地
      const dBridgeWest = Math.hypot(x - 22, z - (-15));
      const dBridgeEast = Math.hypot(x - 49, z - (-15));
      if (dBridgeWest < 14) {
        mountain = Math.max(mountain, 5.2 + (1.0 - dBridgeWest / 14) * 2.2);
      }
      if (dBridgeEast < 14) {
        mountain = Math.max(mountain, 5.2 + (1.0 - dBridgeEast / 14) * 2.2);
      }

      // 关隘石台 (x ≈ 38, z ≈ -15)
      const dPass = Math.hypot(x - 38, z - (-15));
      if (dPass < 16) {
        mountain = Math.max(mountain, 6.5 + (1.0 - dPass / 16) * 2.0);
      }
    }

    let y = 1.4 - riverDip + southHills + mountain + overlook;

    // 【卷六 · 水心高阁大泽浅洲】 (x ≈ 88, z ≈ -8)
    const dPavilion = Math.hypot(x - 88, z - (-8));
    if (dPavilion < 20) {
      y = Math.min(y, 1.6);
    }

    return Math.max(0.55, y);
  }

  // =========================================================================
  // 【三矾九染 · 矿物重彩山峦着色器】(Mineral Mountain Shader)
  // 告别绝壁拉伸！坡度自适应斧劈皴 (Axe-Cut Cun)、五重矿物色阶、泥金勾边与真迹融合
  // =========================================================================
  _buildTexturedTerrain() {
    const width = 420;
    const depth = 320;
    const segX = 200;
    const segZ = 160;

    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this._calculateTerrainHeight(x, z));
    }
    geo.computeVertexNormals();

    this.terrainMat = new THREE.ShaderMaterial({
      uniforms: {
        uMasterTex: { value: this.masterPaintingTex },
        uSunDir: { value: new THREE.Vector3(65, 120, 80).normalize() },
        uSunColor: { value: new THREE.Color(0xFFF2D6) },
        uFogColor: { value: new THREE.Color(0xF5ECD8) }
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vElevation;
        varying float vSlope;

        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vElevation = worldPos.y;

          // 法线转世界坐标
          vNormal = normalize(mat3(modelMatrix) * normal);

          // 坡度：0 为平展地表，1 为垂直绝壁
          vSlope = clamp(1.0 - vNormal.y, 0.0, 1.0);

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMasterTex;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uFogColor;

        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vElevation;
        varying float vSlope;

        void main() {
          float h = vElevation;
          float slope = vSlope;

          // 1. 【三矾九染 · 宝石级矿物重彩】 (Vibrant Jewel-Tone Mineral Palette)
          vec3 cSand   = vec3(0.85, 0.74, 0.52); // 泥金渚岸暖沙
          vec3 cOchre  = vec3(0.66, 0.42, 0.22); // 山麓温润赭石
          vec3 cGreen1 = vec3(0.08, 0.48, 0.30); // 深沉头绿孔雀石
          vec3 cGreen2 = vec3(0.06, 0.68, 0.42); // 明润二绿翡翠碧
          vec3 cBlue1  = vec3(0.08, 0.44, 0.72); // 蓝铜矿宝石蓝
          vec3 cBlue2  = vec3(0.10, 0.62, 0.90); // 石青霁色
          vec3 cSummit = vec3(0.22, 0.82, 0.96); // 绝巅天青琉璃

          vec3 mineralColor = cSand;
          if (h < 2.0) {
            mineralColor = mix(cSand, cOchre, smoothstep(0.8, 2.0, h));
          } else if (h < 7.0) {
            mineralColor = mix(cOchre, cGreen1, smoothstep(2.0, 7.0, h));
          } else if (h < 18.0) {
            mineralColor = mix(cGreen1, cGreen2, smoothstep(7.0, 18.0, h));
          } else if (h < 30.0) {
            mineralColor = mix(cGreen2, cBlue1, smoothstep(18.0, 30.0, h));
          } else if (h < 44.0) {
            mineralColor = mix(cBlue1, cBlue2, smoothstep(30.0, 44.0, h));
          } else {
            mineralColor = mix(cBlue2, cSummit, smoothstep(44.0, 64.0, h));
          }

          // 2. 【坡度自适应斧劈皴 (Axe-Cut Cun)】
          // 悬崖绝壁显现苍古斧劈皴理与深沉青绿矿物墨染
          float cun1 = sin(vWorldPos.y * 3.2 + sin(vWorldPos.x * 1.8 + vWorldPos.z * 1.4) * 2.5);
          float cun2 = cos(vWorldPos.y * 7.5 + cos(vWorldPos.x * 3.6 - vWorldPos.z * 2.8) * 1.8);
          float cunPattern = clamp((cun1 * 0.6 + cun2 * 0.4) * 0.5 + 0.5, 0.0, 1.0);

          // 崖壁岩骨深染：依海拔浸润孔雀石绿与宝石石青
          vec3 cliffMineral = mix(
            vec3(0.08, 0.34, 0.24), // 下层峭壁孔雀绿墨
            vec3(0.07, 0.28, 0.52), // 上层峭壁蓝铜矿石青墨
            smoothstep(12.0, 38.0, h)
          );
          vec3 cliffRock = mix(cliffMineral, vec3(0.50, 0.36, 0.20), cunPattern * 0.35);
          cliffRock = mix(cliffRock, vec3(0.10, 0.12, 0.10), smoothstep(0.60, 0.95, slope));

          float cliffBlend = smoothstep(0.25, 0.70, slope);
          vec3 surfaceColor = mix(mineralColor, cliffRock, cliffBlend * 0.60);

          // 3. 【故宫高清真迹画意浓淡调和】
          vec2 paintUv = vec2(
            clamp((vWorldPos.x + 190.0) / 380.0, 0.0, 1.0),
            clamp(1.0 - (h / 62.0), 0.05, 0.95)
          );
          vec4 paintTex = texture2D(uMasterTex, paintUv);
          float paintLuma = dot(paintTex.rgb, vec3(0.299, 0.587, 0.114));
          surfaceColor *= (0.80 + paintLuma * 0.40);
          surfaceColor = mix(surfaceColor, paintTex.rgb, 0.24);

          // 4. 【金碧山水泥金勾边 (Gilded Ridge Rim Highlighting)】
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
          float ridgeGlint = pow(rim, 3.0) * max(0.0, dot(vNormal, uSunDir) * 0.4 + 0.6);
          vec3 goldEdge = vec3(0.98, 0.86, 0.46) * ridgeGlint * smoothstep(10.0, 56.0, h) * 0.75;
          surfaceColor += goldEdge;

          // 5. 【采光与三远法留白云雾】
          float NdotL = max(0.0, dot(vNormal, uSunDir));
          vec3 diffuse = uSunColor * (NdotL * 0.60 + 0.40);
          vec3 finalColor = surfaceColor * diffuse;

          float dist = length(cameraPosition - vWorldPos);
          // 峰峦刺破流云：山巅高处极度通透澄明，绝不被灰雾洗白！
          float summitClarity = smoothstep(14.0, 46.0, h);
          float distFog = (1.0 - exp(-dist * 0.0022)) * (1.0 - summitClarity * 0.75);
          // 谷壑与江渚处漫漫山岚
          float valleyMist = (1.0 - smoothstep(1.8, 16.0, h)) * 0.26;
          float fogFactor = clamp(distFog + valleyMist, 0.0, 0.85);

          finalColor = mix(finalColor, uFogColor, fogFactor);

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    });

    this.terrain = new THREE.Mesh(geo, this.terrainMat);
    this.scene.add(this.terrain);
  }

  // =========================================================================
  // 【北宋王希孟千里江山 · 屏幕空间远山倒影与宋代网巾水体】(Song Water SSR Shader)
  // 600m 无边大泽、屏幕空间远山倒影、马远《水图》网巾纹金线、时雨同心圆涟漪
  // =========================================================================
  _buildStylizedWater() {
    const waterGeo = new THREE.PlaneGeometry(640, 640, 100, 100);
    waterGeo.rotateX(-Math.PI / 2);

    this.waterMat = createSongWaterSSRMaterial(null);
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh.position.y = 1.05;
    this.scene.add(this.waterMesh);
  }

  // =========================================================================
  // 打造初登高台 · 舒啸临风矶与王希孟作画石案 (Scholar's Cliffside Promontory)
  // 【十八岁少年借笔还魂的核心叙事物证】：迎客古松、石案、长卷、端砚与狼毫
  // =========================================================================
  _buildSpawnOverlookPlatform() {
    const group = new THREE.Group();
    // 位于绝壁石矶上，紧扣玩家出生点与前沿悬崖
    group.position.set(-20.5, 11.2, 34.5);

    const matStone = new THREE.MeshStandardMaterial({ color: 0x6E685E, roughness: 0.88 });
    const matWood = new THREE.MeshStandardMaterial({ color: 0x463022, roughness: 0.75 });
    const matMarble = new THREE.MeshStandardMaterial({ color: 0xDCD5C6, roughness: 0.70 });

    // 1. 探出云岫的临风写意古松 (Scholar's Framing Pine) - 依左侧崖石苍劲拔起，松针层层如盖，优雅掩映天际
    const framingPine = this._buildScholarPineTree();
    framingPine.position.set(-4.2, 0.05, -0.8);
    framingPine.rotation.y = 0.22;
    group.add(framingPine);

    // 2. 王希孟作画之青石条案 (位于左侧石坪，长卷墨迹历历在目，但绝不遮挡江山大泽全景)
    const deskGroup = new THREE.Group();
    deskGroup.position.set(-2.5, 0.05, -1.8);
    deskGroup.rotation.y = -0.45;

    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.10, 0.85), matWood);
    tableTop.position.y = 0.72;
    deskGroup.add(tableTop);

    for (const lx of [-0.80, 0.80]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.68), matWood);
      leg.position.set(lx, 0.36, 0);
      deskGroup.add(leg);
    }

    // 案旁石鼓绣墩
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.44, 12), matStone);
    stool.position.set(0, 0.22, 0.85);
    deskGroup.add(stool);

    // 案上未干之绢帛古卷 (Unrolled Silk Scroll)
    const scrollMat = new THREE.MeshStandardMaterial({
      color: 0xEADBBD,
      roughness: 0.55,
      map: this.masterPaintingTex
    });
    const scrollMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.62), scrollMat);
    scrollMesh.rotation.x = -Math.PI / 2;
    scrollMesh.position.set(-0.12, 0.78, 0);
    deskGroup.add(scrollMesh);

    // 案上歙州老坑端砚 (Inkstone)
    const inkstone = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x181716, roughness: 0.35 })
    );
    inkstone.position.set(0.62, 0.80, -0.12);
    deskGroup.add(inkstone);

    // 案上青瓷笔搁与狼毫画笔
    const brushRest = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.08, 4),
      new THREE.MeshStandardMaterial({ color: 0x76A092, roughness: 0.25 })
    );
    brushRest.position.set(0.62, 0.81, 0.12);
    deskGroup.add(brushRest);

    const brush = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.015, 0.44, 6),
      new THREE.MeshStandardMaterial({ color: 0x8C5A28, roughness: 0.7 })
    );
    brush.rotation.z = Math.PI / 2.15;
    brush.position.set(0.60, 0.83, 0.12);
    deskGroup.add(brush);

    // 案头汝窑天青水丞 (Celadon Water Cup)
    const waterCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.05, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x8CB8AE, roughness: 0.2, metalness: 0.1 })
    );
    waterCup.position.set(0.62, 0.80, -0.28);
    deskGroup.add(waterCup);

    group.add(deskGroup);

    // 3. 右侧崖边温润古雅的宋式石经幢庭院石灯
    const lantern = this._buildSongStoneLantern(3.4, 0.1, -0.2);
    group.add(lantern);

    this.scene.add(group);
  }

  // 打造迎客舒展写意古松 (Scholar's Promontory Bonsai Pine)
  _buildScholarPineTree() {
    const pine = new THREE.Group();
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x3E2818, roughness: 0.90 });
    const matNeedles = new THREE.MeshStandardMaterial({
      color: 0x146E4A, // 雅致深沉孔雀石绿
      emissive: 0x0A3626,
      emissiveIntensity: 0.22,
      roughness: 0.65
    });

    // 蜿蜒苍古主干（从左侧拔起并向右上方倾斜舒展，枝顶升入高空左上天幕）
    const tCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.3, 1.6, -0.2),
      new THREE.Vector3(-0.1, 3.2, -0.4),
      new THREE.Vector3(0.6, 4.4, -0.6)
    ]);
    const trunkMesh = new THREE.Mesh(
      new THREE.TubeGeometry(tCurve, 20, 0.14, 8, false),
      matTrunk
    );
    pine.add(trunkMesh);

    // 枝桠横跨舒展（在高空天幕轻拂，如飞羽探云，绝不遮挡山峦河川）
    const branchConfigs = [
      { pos: [-0.1, 3.2, -0.4], arm: [0.65, 0.25, -0.2], radius: 0.48 },
      { pos: [0.6,  4.4, -0.6], arm: [0.75, 0.18, -0.1], radius: 0.54 },
      { pos: [0.3,  4.2, -0.5], arm: [-0.45, 0.35, 0.2], radius: 0.38 }
    ];

    branchConfigs.forEach(bc => {
      const bArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.08, 0.85, 6),
        matTrunk
      );
      bArm.position.set(bc.pos[0] + bc.arm[0] * 0.5, bc.pos[1] + bc.arm[1] * 0.5, bc.pos[2] + bc.arm[2] * 0.5);
      bArm.rotation.z = Math.PI / 3.4;
      pine.add(bArm);

      // 双层如伞如盖之写意宋代松针圆盘
      const canopyGroup = new THREE.Group();
      canopyGroup.position.set(bc.pos[0] + bc.arm[0], bc.pos[1] + bc.arm[1], bc.pos[2] + bc.arm[2]);

      const disk1 = new THREE.Mesh(new THREE.CylinderGeometry(bc.radius * 0.55, bc.radius, 0.05, 14), matNeedles);
      canopyGroup.add(disk1);

      const disk2 = new THREE.Mesh(new THREE.CylinderGeometry(bc.radius * 0.20, bc.radius * 0.65, 0.04, 12), matNeedles);
      disk2.position.y = 0.04;
      canopyGroup.add(disk2);

      pine.add(canopyGroup);
    });

    return pine;
  }

  // =========================================================================
  // 打造青石磴道与宋代石雕经幢灯 (Natural Mountain Flagstone Trails)
  // 严禁悬空与陡崖浮石！依地表平缓处嵌砌
  // =========================================================================
  _buildStoneRoadAndLanterns() {
    const matSlab = new THREE.MeshStandardMaterial({
      color: 0x706A60,
      roughness: 0.88
    });

    // 登临古道路径点
    const trails = [
      // 望江石矶后侧下行至桃溪浅滩
      [
        { x: -23, z: 36 }, { x: -29, z: 35 }, { x: -35, z: 33 },
        { x: -41, z: 30 }, { x: -45, z: 28 }
      ],
      // 沿长河渚岸漫步向东
      [
        { x: -45, z: 28 }, { x: -34, z: 24 }, { x: -22, z: 22 },
        { x: -8, z: 20 }, { x: 4, z: 22 }, { x: 12, z: 35 }, { x: 12, z: 42 }
      ],
      // 通往关隘长桥山径 (沿山麓平缓铺设)
      [
        { x: 4, z: 22 }, { x: 14, z: 12 }, { x: 19, z: 0 }, { x: 22, z: -14 }
      ],
      // 长桥东首通往水心高阁
      [
        { x: 50, z: -14 }, { x: 58, z: -8 }, { x: 72, z: -6 }, { x: 88, z: -8 }
      ]
    ];

    trails.forEach(points => {
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const steps = Math.ceil(dist / 2.6);

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = p1.x + (p2.x - p1.x) * t;
          const z = p1.z + (p2.z - p1.z) * t;
          const groundY = this._calculateTerrainHeight(x, z);

          // 坡度检测：过滤峭壁断崖，杜绝跳水板悬空
          const slopeTest = Math.abs(this._calculateTerrainHeight(x + 1.2, z) - groundY) +
                            Math.abs(this._calculateTerrainHeight(x, z + 1.2) - groundY);

          if (groundY > 1.0 && groundY < 16.0 && slopeTest < 1.1) {
            const slab = new THREE.Mesh(
              new THREE.BoxGeometry(2.0, 0.14, 1.4),
              matSlab
            );
            slab.position.set(x, groundY + 0.05, z);
            slab.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z) + (Math.random() - 0.5) * 0.12;
            this.scene.add(slab);
          }
        }
      }
    });

    // 关键名胜节点布置温润古雅的宋式石雕经幢灯
    const lanternNodes = [
      { x: -45, z: 26 }, // 桃溪浅滩
      { x: 12,  z: 40 }, // 麦陇晚烟
      { x: 21,  z: -14 }, // 关隘西首
      { x: 50,  z: -14 }, // 关隘东首
      { x: 86,  z: -6 }  // 水心高阁
    ];

    lanternNodes.forEach(pos => {
      const gy = this._calculateTerrainHeight(pos.x, pos.z);
      const l = this._buildSongStoneLantern(pos.x, gy, pos.z);
      this.scene.add(l);
    });
  }

  // 打造北宋雕花石经幢庭院石灯 (Song Stone Pagoda Lantern)
  _buildSongStoneLantern(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const matStone = new THREE.MeshStandardMaterial({
      color: 0x6E685E,
      roughness: 0.92,
      map: this._detailTexture('stone')
    });

    // 1. 六角须弥石座
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.32, 6), matStone);
    base.position.y = 0.16;
    group.add(base);

    // 2. 束腰中柱
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.72, 6), matStone);
    pillar.position.y = 0.68;
    group.add(pillar);

    // 3. 镂空火舍石室
    const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.48), matStone);
    chamber.position.y = 1.22;
    group.add(chamber);

    // 4. 坡式六角屋顶与宝顶
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.32, 6), matStone);
    roof.position.y = 1.6;
    group.add(roof);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), matStone);
    finial.position.y = 1.82;
    group.add(finial);

    // 5. 石灯内温润透光的暖金烛火
    const candleLight = new THREE.PointLight(0xFAD478, 1.45, 12, 1.2);
    candleLight.position.set(0, 1.22, 0);
    group.add(candleLight);
    this.lanternLights.push(candleLight);

    this._placeContactShadow(group, 0, 0.05, 0, 1.8, 1.8, false);

    return group;
  }

  // =========================================================================
  // 打造六大名胜：飞瀑幽涧、北宋千步编木拱虹桥、水心高阁与苍松古柏
  // =========================================================================
  _buildScenicLandmarks() {
    const matWood = new THREE.MeshStandardMaterial({
      color: 0x543A24,
      roughness: 0.86,
      map: this._detailTexture('wood')
    });
    const matPillars = new THREE.MeshStandardMaterial({
      color: 0x8C2E24,
      roughness: 0.72,
      map: this._detailTexture('lacquer')
    });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x3E4246, roughness: 0.62 });
    const matStone = new THREE.MeshStandardMaterial({
      color: 0x5C6D68,
      roughness: 0.92,
      map: this._detailTexture('stone')
    });

    // 1. 【胜境一 · 桃溪浅滩】(x: -45, z: 28)
    const peachGroup = new THREE.Group();
    peachGroup.position.set(-45, 1.2, 28);
    for (let i = 0; i < 7; i++) {
      const tree = this._buildPeachBlossomTree();
      tree.position.set((Math.random() - 0.5) * 24, 0, (Math.random() - 0.5) * 20);
      peachGroup.add(tree);
    }
    const boat = this._buildFishingBoat(matWood);
    boat.position.set(5.5, 0.2, -4);
    boat.rotation.y = 0.45;
    peachGroup.add(boat);
    this.scene.add(peachGroup);

    // 2. 【胜境二 · 悬泉幽涧】(x: -18, z: -36) - 嵌于深峡绝壁之中的写意飞瀑
    const fallsGroup = new THREE.Group();
    fallsGroup.position.set(-18, 1.0, -36);
    const fallGeo = new THREE.PlaneGeometry(4.2, 16, 1, 10);
    const fallMat = new THREE.MeshStandardMaterial({
      color: 0x62B2A6,
      emissive: 0x1E5850,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      roughness: 0.22
    });
    const fallMesh = new THREE.Mesh(fallGeo, fallMat);
    fallMesh.position.set(0, 8.0, 0);
    fallMesh.rotation.y = 0.18;
    fallsGroup.add(fallMesh);
    this.waterfallMesh = fallMesh;

    // 潭底清泉与自然水边微石（绝无悬浮巨卵）
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4.0) * Math.PI * 2;
      const rx = Math.cos(angle) * (4.2 + Math.random() * 1.8);
      const rz = Math.sin(angle) * (3.5 + Math.random() * 1.8);
      const flatRock = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7 + Math.random() * 0.3, 1.1 + Math.random() * 0.4, 0.28, 7),
        matStone
      );
      flatRock.position.set(rx, 0.12, rz);
      flatRock.rotation.y = Math.random() * Math.PI;
      fallsGroup.add(flatRock);
      const rockR = 1.5 + Math.random() * 0.6;
      this._placeContactShadow(fallsGroup, rx, 0.05, rz, rockR * 2.1, rockR * 1.45, false);
    }
    this.scene.add(fallsGroup);

    // 3. 【胜境三 · 麦陇晚烟】(x: 12, z: 42)
    const paddyGroup = new THREE.Group();
    paddyGroup.position.set(12, 1.8, 42);
    const cottage = this._buildCottage(matWood, matRoof);
    const paddyX = 12 + 3.5;
    const paddyZ = 42 - 2;
    cottage.position.set(3.5, this._calculateTerrainHeight(paddyX, paddyZ) - 1.8, -2);
    paddyGroup.add(cottage);
    this.scene.add(paddyGroup);

    // 4. 【胜境四 · 关隘长桥】(x: 36, z: -15) - 北宋千步编木拱贯木虹桥
    const bridge = this._buildSongRainbowBridge(matWood, matPillars);
    this.scene.add(bridge);

    // 5. 【胜境五 · 孤刹悬云】(x: 64, z: -25) - 绝壁飞檐八角重楼
    const templeGroup = new THREE.Group();
    templeGroup.position.set(64, 32.5, -25);
    const temple = this._buildEavedPavilion(matWood, matPillars, matRoof);
    temple.scale.set(1.4, 1.4, 1.4);
    templeGroup.add(temple);
    this.scene.add(templeGroup);

    // 6. 【胜境六 · 水心高阁】(x: 88, z: -8) - 大泽水榭双层重檐高阁
    const grandGroup = new THREE.Group();
    grandGroup.position.set(88, 1.2, -8);
    const grandPavilion = this._buildTwoStoryPavilion(matWood, matPillars, matRoof);
    grandGroup.add(grandPavilion);
    const dock = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 4.5), matWood);
    dock.position.set(-11, 0.2, 0);
    grandGroup.add(dock);
    const pavilionGround = this._calculateTerrainHeight(88, -8) - 1.2;
    this._placeContactShadow(grandGroup, 0, pavilionGround + 0.1, 0, 8.5, 8.5, false);
    this._placeContactShadow(grandGroup, -11, pavilionGround + 0.1, 0, 16.5, 5.4, false);
    this.scene.add(grandGroup);

    // 7. 【山脚水村茅舍与渔舟唱晚】(x ≈ 11, z ≈ -20) - 依山傍水之北宋江村 (掩映于主峰山麓与长桥之间)
    const villageGroup = new THREE.Group();
    for (let c = 0; c < 3; c++) {
      const cx = 5.0 + c * 5.8;
      const cz = -20.5 + (c % 2) * 2.0;
      const cy = this._calculateTerrainHeight(cx, cz);
      const vCottage = this._buildCottage(matWood, matRoof);
      vCottage.position.set(cx, cy, cz);
      vCottage.rotation.y = (c - 1) * 0.25;
      villageGroup.add(vCottage);
    }
    const villageBoat = this._buildFishingBoat(matWood);
    villageBoat.position.set(18.5, 1.05, -16.0);
    villageBoat.rotation.y = -0.48;
    villageGroup.add(villageBoat);

    const villageBoat2 = this._buildFishingBoat(matWood);
    villageBoat2.position.set(2.5, 1.05, -16.8);
    villageBoat2.rotation.y = 0.32;
    villageGroup.add(villageBoat2);

    this.scene.add(villageGroup);

    // 文人画定点苍松林带 (Art-directed Foothill & Gorge Pine Groves)
    const grovePositions = [
      { x: -14, z: -17 }, { x: -8, z: -19 }, { x: 4, z: -18 }, { x: 12, z: -17 },
      { x: 18, z: -16 }, { x: -26, z: -28 }, { x: -21, z: -32 }, { x: 28, z: -16 },
      { x: -2, z: 14 }, { x: 6, z: 24 }, { x: -30, z: 22 }
    ];
    grovePositions.forEach(gp => {
      const gy = this._calculateTerrainHeight(gp.x, gp.z);
      if (gy > 1.2) {
        const p = this._buildSongPineTree();
        p.position.set(gp.x, gy, gp.z);
        p.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(p);
      }
    });

    // 遍布远山名胜的古雅苍松 (依山依水自然矗立)
    for (let i = 0; i < 32; i++) {
      const px = (Math.random() - 0.5) * 320;
      const pz = (Math.random() - 0.5) * 220;
      if (Math.hypot(px - (-20.5), pz - 34.5) < 24) continue;
      const py = this._calculateTerrainHeight(px, pz);
      if (py > 2.0 && py < 34.0) {
        const p = this._buildSongPineTree();
        p.position.set(px, py, pz);
        this.scene.add(p);
      }
    }
  }

  // =========================================================================
  // 【北宋编木拱贯木虹桥】(Authentic Song Timber Arch Rainbow Bridge)
  // 严格复原《千里江山图》与《清明上河图》跨江长拱飞桥，绝无塑料圆环
  // =========================================================================
  _buildSongRainbowBridge(matWood, matPillars) {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'song_rainbow_bridge';

    // 桥梁跨度：西首 x=23 到 东首 x=49，总跨径 26m，中心位于 (36, -15)
    const span = 26.0;
    const archH = 3.6;
    const bridgeBaseY = 5.2;
    // 桥台落在关隘地表上。高度函数在桥面设计高程之外还叠了 1.4m 基面，
    // 不抬升的话整座虹桥会埋进山体。
    const westH = this._calculateTerrainHeight(36 - span * 0.5, -15);
    const eastH = this._calculateTerrainHeight(36 + span * 0.5, -15);
    const lift = Math.max(westH, eastH) - bridgeBaseY;
    bridgeGroup.position.set(36, lift, -15);
    this.bridgeLift = lift;
    const bo = BEASTS.find((b) => b.id === 'bo');
    if (bo && !bo._seatedOnBridge) {
      bo.coordinates.y += lift;
      bo._seatedOnBridge = true;
    }

    const cedarMat = new THREE.MeshStandardMaterial({
      color: 0x483220, // 沉水香柏老木
      roughness: 0.9,
      map: this._detailTexture('wood')
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x822E26, // 朱红风化木色
      roughness: 0.78,
      map: this._detailTexture('lacquer')
    });
    const abutmentMat = new THREE.MeshStandardMaterial({
      color: 0x6A655C,
      roughness: 0.94,
      map: this._detailTexture('stone')
    });

    // 1. 五道平行的纵向贯木拱骨 (Longitudinal Timber Ribs)
    for (let rib = -2; rib <= 2; rib++) {
      const zOffset = rib * 0.72;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-span * 0.5, bridgeBaseY, zOffset),
        new THREE.Vector3(-span * 0.25, bridgeBaseY + archH * 0.75, zOffset),
        new THREE.Vector3(0, bridgeBaseY + archH, zOffset),
        new THREE.Vector3(span * 0.25, bridgeBaseY + archH * 0.75, zOffset),
        new THREE.Vector3(span * 0.5, bridgeBaseY, zOffset)
      ]);
      const ribMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, 0.22, 8, false),
        cedarMat
      );
      bridgeGroup.add(ribMesh);
    }

    // 2. 横向贯木与排架梁 (Transverse Interlocking Beams)
    for (let b = -10; b <= 10; b++) {
      const frac = b / 10.0;
      const bx = frac * (span * 0.48);
      const by = bridgeBaseY + (1.0 - frac * frac) * archH;

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 3.8, 8),
        cedarMat
      );
      beam.rotation.x = Math.PI / 2;
      beam.position.set(bx, by - 0.25, 0);
      bridgeGroup.add(beam);
    }

    // 3. 编木拱桥面木板与防滑踏跺 (Segmented Timber Deck)
    const deckSegments = 32;
    for (let d = 0; d < deckSegments; d++) {
      const t1 = (d - deckSegments * 0.5) / (deckSegments * 0.5);
      const x = t1 * (span * 0.48);
      const y = bridgeBaseY + (1.0 - t1 * t1) * archH;

      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.18, 3.4),
        cedarMat
      );
      plank.position.set(x, y + 0.1, 0);
      plank.rotation.z = -Math.atan2(-2.0 * t1 * archH, span * 0.5);
      bridgeGroup.add(plank);
    }

    // 4. 两侧朱红雕花寻杖与望柱 (Timber Balustrades with Lotus Finials)
    for (const sideZ of [-1.75, 1.75]) {
      // 贯通曲形扶手寻杖
      const railCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-span * 0.5, bridgeBaseY + 0.95, sideZ),
        new THREE.Vector3(0, bridgeBaseY + archH + 0.95, sideZ),
        new THREE.Vector3(span * 0.5, bridgeBaseY + 0.95, sideZ)
      ]);
      const handrail = new THREE.Mesh(
        new THREE.TubeGeometry(railCurve, 24, 0.07, 6, false),
        railMat
      );
      bridgeGroup.add(handrail);

      // 14 根垂立望柱与莲花宝顶
      for (let p = -6; p <= 6; p++) {
        const pt = p / 6.0;
        const px = pt * (span * 0.46);
        const py = bridgeBaseY + (1.0 - pt * pt) * archH;

        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6),
          railMat
        );
        post.position.set(px, py + 0.5, sideZ);
        bridgeGroup.add(post);

        const finial = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 6, 6),
          railMat
        );
        finial.position.set(px, py + 1.05, sideZ);
        bridgeGroup.add(finial);
      }
    }

    // 5. 桥头掩映苍松（落在抬升后的真实地表上）
    const pine = this._buildSongPineTree();
    const pineWorldX = 36 - 14;
    const pineWorldZ = -15 + 4;
    pine.position.set(
      -14,
      this._calculateTerrainHeight(pineWorldX, pineWorldZ) - lift,
      4.0
    );
    bridgeGroup.add(pine);

    // 6. 两端石桥台与拱腹接地暗墨。编木拱不设中流桥墩，重量落在两岸驳岸上。
    for (const xSign of [-1, 1]) {
      const x = xSign * (span * 0.5 - 0.55);
      const worldX = 36 + x;
      const ground = this._calculateTerrainHeight(worldX, -15) - lift;
      const padH = Math.max(0.62, bridgeBaseY - ground + 0.22);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(4.6, padH, 4.0), abutmentMat);
      pad.position.set(x, ground + padH * 0.5 - 0.08, 0);
      bridgeGroup.add(pad);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.26, 3.05), abutmentMat);
      cap.position.set(x + xSign * 0.08, ground + padH + 0.05, 0.06);
      cap.rotation.y = xSign * 0.04;
      bridgeGroup.add(cap);

      this._placeContactShadow(bridgeGroup, x, ground + 0.1, 0, 7.4, 5.6, false);
    }
    const midGround = this._calculateTerrainHeight(36, -15) - lift;
    this._placeContactShadow(bridgeGroup, 0, midGround + 0.1, 0, 18, 5.2, false);

    return bridgeGroup;
  }

  // =========================================================================
  // 【层岚叠岫流动谷雾】(Layered Flowing Valley Mist)
  // 漫漫山岚流转于峡谷水际，打造中国画留白之美
  // =========================================================================
  _buildValleyMist() {
    const mistGeo = new THREE.PlaneGeometry(160, 48);
    mistGeo.rotateX(-Math.PI / 2);

    const mistCv = document.createElement('canvas');
    mistCv.width = 256;
    mistCv.height = 256;
    const ctx = mistCv.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0.0, 'rgba(248, 238, 220, 0.48)');
    grad.addColorStop(0.5, 'rgba(245, 235, 215, 0.22)');
    grad.addColorStop(1.0, 'rgba(245, 235, 215, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const mistTex = new THREE.CanvasTexture(mistCv);

    const mistMat = new THREE.MeshBasicMaterial({
      map: mistTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const mistNodes = [
      { x: -28, y: 5.5,  z: -25, scale: 1.2 },
      { x: 12,  y: 7.2,  z: -18, scale: 1.5 },
      { x: 45,  y: 9.0,  z: -32, scale: 1.4 },
      { x: -50, y: 4.8,  z: 10,  scale: 1.1 },
      { x: 75,  y: 6.5,  z: 8,   scale: 1.6 }
    ];

    mistNodes.forEach((node, i) => {
      const plane = new THREE.Mesh(mistGeo, mistMat);
      plane.position.set(node.x, node.y, node.z);
      plane.scale.set(node.scale, 1.0, node.scale);
      plane.userData = {
        baseX: node.x,
        baseZ: node.z,
        speed: 0.6 + i * 0.15,
        phase: i * 1.2
      };
      this.scene.add(plane);
      this.valleyMistPlanes.push(plane);
    });
  }

  // =========================================================================
  // 【宋徽宗《瑞鹤图》意境】白鹤祥云翱翔天际 (Flock of Soaring Cranes)
  // =========================================================================
  _buildFlyingCranes() {
    const craneGroup = new THREE.Group();
    craneGroup.name = 'crane_flock';

    const matFeather = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.4 });
    const matTail = new THREE.MeshStandardMaterial({ color: 0x1A1816, roughness: 0.6 });
    const matBeak = new THREE.MeshStandardMaterial({ color: 0xF5C24E, roughness: 0.3 });
    const matCrown = new THREE.MeshStandardMaterial({ color: 0xD62828, roughness: 0.5 }); // 丹顶

    // 创造 9 羽翱翔仙鹤 (雁字横空)
    for (let i = 0; i < 9; i++) {
      const crane = new THREE.Group();

      const body = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 6), matFeather);
      body.rotation.x = Math.PI / 2;
      crane.add(body);

      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 5), matTail);
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = 0.8;
      crane.add(tail);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.10, 0.9, 6), matFeather);
      neck.rotation.x = -0.4;
      neck.position.set(0, 0.28, -0.85);
      crane.add(neck);

      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), matCrown);
      crown.position.set(0, 0.72, -1.2);
      crane.add(crown);

      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 4), matBeak);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.68, -1.45);
      crane.add(beak);

      const wingGeo = new THREE.BoxGeometry(1.6, 0.04, 0.6);
      wingGeo.translate(-0.8, 0, 0);

      const wingL = new THREE.Mesh(wingGeo, matFeather);
      wingL.position.set(-0.2, 0.05, -0.2);
      crane.add(wingL);

      const wingR = new THREE.Mesh(wingGeo, matFeather);
      wingR.rotation.y = Math.PI;
      wingR.position.set(0.2, 0.05, -0.2);
      crane.add(wingR);

      const offsetX = (i - 4) * 6.0 - Math.abs(i - 4) * 2.2;
      const offsetZ = Math.abs(i - 4) * 4.8;
      const offsetY = 32 + Math.sin(i * 0.8) * 2.5;

      crane.position.set(offsetX, offsetY, offsetZ);
      crane.userData = {
        baseX: offsetX,
        baseZ: offsetZ,
        baseY: offsetY,
        wingL,
        wingR,
        phase: i * 0.82
      };

      craneGroup.add(crane);
      this.cranes.push(crane);
    }

    this.scene.add(craneGroup);
  }

  // 打造写意北宋苍松古柏 (Song Gnarled Pine - 3D 舒展如盖)
  _buildSongPineTree() {
    const pine = new THREE.Group();
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x3E2818, roughness: 0.92 });
    const matNeedles = new THREE.MeshStandardMaterial({
      color: 0x146B48, // 深沉孔雀石绿
      emissive: 0x0A3626,
      emissiveIntensity: 0.22,
      roughness: 0.65
    });

    const trunk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.35, 2.8, 8), matTrunk);
    trunk1.position.y = 1.4;
    trunk1.rotation.z = (Math.random() - 0.5) * 0.16;
    pine.add(trunk1);

    const trunk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.20, 2.4, 7), matTrunk);
    trunk2.position.set(0.18, 3.4, 0);
    trunk2.rotation.z = -0.22 + (Math.random() - 0.5) * 0.12;
    pine.add(trunk2);

    const branches = [
      { y: 2.6, azimuth: 0.2,            pitch: 0.45, len: 1.8, r: 1.20 },
      { y: 3.4, azimuth: Math.PI * 0.7,  pitch: 0.40, len: 1.6, r: 1.10 },
      { y: 4.1, azimuth: Math.PI * 1.35, pitch: 0.38, len: 1.4, r: 1.00 },
      { y: 4.8, azimuth: Math.PI * 1.9,  pitch: 0.30, len: 1.2, r: 0.85 }
    ];

    branches.forEach(b => {
      const bGroup = new THREE.Group();
      bGroup.position.set(0.18, b.y, 0);
      bGroup.rotation.y = b.azimuth;
      bGroup.rotation.z = b.pitch;

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.10, b.len, 5), matTrunk);
      arm.position.y = b.len * 0.5;
      bGroup.add(arm);

      // 三层如伞如盖之苍翠松针圆盘 (水平如盖铺展，苍翠欲滴)
      const canopyGroup = new THREE.Group();
      canopyGroup.position.y = b.len;
      canopyGroup.rotation.z = -b.pitch * 0.85; // 扶平松针圆盘，如古画平展如伞

      const disk1 = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.55, b.r, 0.14, 14), matNeedles);
      canopyGroup.add(disk1);

      const disk2 = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.28, b.r * 0.75, 0.12, 12), matNeedles);
      disk2.position.y = 0.09;
      canopyGroup.add(disk2);

      const disk3 = new THREE.Mesh(new THREE.ConeGeometry(b.r * 0.45, 0.16, 10), matNeedles);
      disk3.position.y = 0.18;
      canopyGroup.add(disk3);

      bGroup.add(canopyGroup);
      pine.add(bGroup);
    });

    // 树冠绝顶郁郁葱葱之顶盖 (Crowning Apex Canopy)
    const apexCanopy = new THREE.Group();
    apexCanopy.position.set(0.18, 5.0, 0);
    const apexDisk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 1.35, 0.16, 14), matNeedles);
    apexCanopy.add(apexDisk1);
    const apexDisk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.90, 0.14, 12), matNeedles);
    apexDisk2.position.y = 0.11;
    apexCanopy.add(apexDisk2);
    const apexDisk3 = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.25, 10), matNeedles);
    apexDisk3.position.y = 0.22;
    apexCanopy.add(apexDisk3);
    pine.add(apexCanopy);

    return pine;
  }

  _buildPeachBlossomTree() {
    const tree = new THREE.Group();
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x4A2E1A, roughness: 0.88 });
    const matPeachFoliage = new THREE.MeshStandardMaterial({
      color: 0xEE8FA2,
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

  // 打造北宋水村茅舍 (Song Thatched Water Village Cottage)
  _buildCottage(matWood, matRoof) {
    const cottage = new THREE.Group();
    const matStraw = new THREE.MeshStandardMaterial({
      color: 0x8E764E, // 古朴风化杉木茅茨暖赭色 (更加沉稳古雅，融于山峦)
      roughness: 0.96,
      map: this._detailTexture('straw')
    });
    const matBambooWall = new THREE.MeshStandardMaterial({
      color: 0xB8A276, // 编竹为篱温润米黄
      roughness: 0.9,
      map: this._detailTexture('weave')
    });

    // 1. 架空木柱与木地坪 (防江水潮湿)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 3.4), matWood);
    floor.position.y = 0.65;
    cottage.add(floor);

    for (const px of [-1.8, 1.8]) {
      for (const pz of [-1.4, 1.4]) {
        const pStilt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.65, 6), matWood);
        pStilt.position.set(px, 0.32, pz);
        cottage.add(pStilt);
      }
    }

    // 2. 编竹篱墙与柴扉门窗
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.9, 3.0), matBambooWall);
    walls.position.y = 1.68;
    cottage.add(walls);

    // 3. 北宋双坡歇山茅草顶 (Gabled Thatched Roof with Curved Eaves)
    const roofBase = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.25, 3.8), matStraw);
    roofBase.position.y = 2.68;
    cottage.add(roofBase);

    const roofRidge = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.65, 4), matStraw);
    roofRidge.position.y = 3.45;
    roofRidge.rotation.y = Math.PI / 4;
    roofRidge.scale.set(1.25, 1.0, 0.92);
    cottage.add(roofRidge);

    // 檐口茅茎披下，打断方盒屋顶的塑料切边
    const fringeMat = this._strawFringeMaterial();
    const hangFringe = (w, x, z, rotY) => {
      const skirt = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.78), fringeMat);
      skirt.position.set(x, 2.18, z);
      skirt.rotation.y = rotY;
      cottage.add(skirt);
    };
    hangFringe(4.7, 0, 1.93, 0);
    hangFringe(4.7, 0, -1.93, 0);
    hangFringe(3.65, 2.44, 0, Math.PI / 2);
    hangFringe(3.65, -2.44, 0, Math.PI / 2);

    this._placeContactShadow(cottage, 0, 0.1, 0, 6.4, 5.0, false);

    return cottage;
  }

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

  _buildTwoStoryPavilion(matWood, matPillars, matRoof) {
    const building = new THREE.Group();
    const p1 = this._buildEavedPavilion(matWood, matPillars, matRoof);
    building.add(p1);

    const p2 = this._buildEavedPavilion(matWood, matPillars, matRoof);
    p2.scale.set(0.72, 0.72, 0.72);
    p2.position.y = 4.2;
    building.add(p2);
    return building;
  }

  // 打造柔和宣和泥金浮尘微粒 (Gold Silk Dust)
  _buildGoldDustParticles() {
    const particleCount = 420;
    const geo = new THREE.BufferGeometry();
    const pos = [];

    for (let i = 0; i < particleCount; i++) {
      pos.push(
        (Math.random() - 0.5) * 320,
        2 + Math.random() * 42,
        (Math.random() - 0.5) * 240
      );
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xF6D672,
      size: 0.65,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.goldDustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.goldDustPoints);
  }

  // 【四时与气象系统】春樱夏雨秋枫冬雪，昼夜明晦流转
  _buildSeasonAndWeatherSystems() {
    // 1. 季节微粒系统 (Season Floating Flakes)
    const count = 550;
    const sGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(count * 3);
    const sColor = new Float32Array(count * 3);
    this.seasonVel = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      sPos[i3] = (Math.random() - 0.5) * 280;
      sPos[i3 + 1] = 2 + Math.random() * 38;
      sPos[i3 + 2] = (Math.random() - 0.5) * 240;

      this.seasonVel[i3] = (Math.random() - 0.5) * 0.4 + 0.15;
      this.seasonVel[i3 + 1] = -(0.08 + Math.random() * 0.12);
      this.seasonVel[i3 + 2] = (Math.random() - 0.5) * 0.3;

      // 默认夏季金碧光斑
      sColor[i3] = 0.96;
      sColor[i3 + 1] = 0.84;
      sColor[i3 + 2] = 0.45;
    }

    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('color', new THREE.BufferAttribute(sColor, 3));

    const sMat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.seasonParticles = new THREE.Points(sGeo, sMat);
    this.scene.add(this.seasonParticles);

    // 2. 细雨绵绵系统 (Rain Streaks)
    const rainCount = 1200;
    const rGeo = new THREE.BufferGeometry();
    const rPos = new Float32Array(rainCount * 3);
    this.rainVelY = new Float32Array(rainCount);

    for (let i = 0; i < rainCount; i++) {
      const i3 = i * 3;
      rPos[i3] = (Math.random() - 0.5) * 240;
      rPos[i3 + 1] = 2 + Math.random() * 50;
      rPos[i3 + 2] = (Math.random() - 0.5) * 200;
      this.rainVelY[i] = -(32 + Math.random() * 22);
    }

    rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
    const rMat = new THREE.PointsMaterial({
      color: 0xC8DDE8,
      size: 0.85,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    });

    this.rainMesh = new THREE.Points(rGeo, rMat);
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);
  }

  // 四时切换 (春·夏·秋·冬)
  setSeason(seasonName) {
    this.currentSeason = seasonName;
    if (this.isNight) return; // 夜景模式保持夜色

    const sColors = this.seasonParticles.geometry.attributes.color.array;
    const count = this.seasonParticles.geometry.attributes.position.count;

    if (seasonName === 'spring') {
      // 春：嫩绿初萌，春和景明，桃花飞瓣
      this.scene.background.setHex(0x82775C);
      this.scene.fog.color.setHex(0x82775C);
      if (this.ambientLight) this.ambientLight.color.setHex(0xFFF7EC);
      if (this.sunLight) {
        this.sunLight.color.setHex(0xFFF2D8);
        this.sunLight.intensity = 2.25;
      }
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        if (i % 2 === 0) {
          // 绯红桃花瓣
          sColors[i3] = 1.0; sColors[i3 + 1] = 0.72; sColors[i3 + 2] = 0.76;
        } else {
          // 嫩芽浅绿
          sColors[i3] = 0.58; sColors[i3 + 1] = 0.85; sColors[i3 + 2] = 0.62;
        }
      }
    } else if (seasonName === 'summer') {
      // 夏：石青石绿最盛，金碧万顷
      this.scene.background.setHex(0x7A6946);
      this.scene.fog.color.setHex(0x7A6946);
      if (this.ambientLight) this.ambientLight.color.setHex(0xFFF0D5);
      if (this.sunLight) {
        this.sunLight.color.setHex(0xFFE8C2);
        this.sunLight.intensity = 2.35;
      }
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        sColors[i3] = 0.96; sColors[i3 + 1] = 0.84; sColors[i3 + 2] = 0.45;
      }
    } else if (seasonName === 'autumn') {
      // 秋：麦陇金波，晚烟霜枫
      this.scene.background.setHex(0x8D6F40);
      this.scene.fog.color.setHex(0x8D6F40);
      if (this.ambientLight) this.ambientLight.color.setHex(0xFFE5C8);
      if (this.sunLight) {
        this.sunLight.color.setHex(0xFFAA55);
        this.sunLight.intensity = 2.2;
      }
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        if (i % 2 === 0) {
          // 丹枫红叶
          sColors[i3] = 0.88; sColors[i3 + 1] = 0.38; sColors[i3 + 2] = 0.22;
        } else {
          // 澄黄秋麦
          sColors[i3] = 0.95; sColors[i3 + 1] = 0.72; sColors[i3 + 2] = 0.26;
        }
      }
    } else if (seasonName === 'winter') {
      // 冬：千山暮雪，素裹清寒
      this.scene.background.setHex(0x5A636E);
      this.scene.fog.color.setHex(0x5A636E);
      if (this.ambientLight) this.ambientLight.color.setHex(0xD8E5F0);
      if (this.sunLight) {
        this.sunLight.color.setHex(0xC5D9EB);
        this.sunLight.intensity = 1.95;
      }
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        sColors[i3] = 0.96; sColors[i3 + 1] = 0.98; sColors[i3 + 2] = 1.0;
      }
    }

    this.seasonParticles.geometry.attributes.color.needsUpdate = true;
  }

  // 气象系统 (晴 / 时雨)
  setWeather(weatherName) {
    this.currentWeather = weatherName;
    if (weatherName === 'rain') {
      this.rainMesh.visible = true;
      this.scene.fog.density = 0.0055;
      audio.playWaterRipples();
    } else {
      this.rainMesh.visible = false;
      this.scene.fog.density = 0.0035;
    }
  }

  // 昼夜切换 (昼 / 万家灯火夜景)
  setNight(isNight) {
    this.isNight = isNight;
    if (isNight) {
      // 宣和幽夜石青墨色
      this.scene.background.setHex(0x141E28);
      this.scene.fog.color.setHex(0x141E28);
      if (this.ambientLight) {
        this.ambientLight.color.setHex(0x223547);
        this.ambientLight.intensity = 1.15;
      }
      if (this.sunLight) {
        this.sunLight.color.setHex(0x527694);
        this.sunLight.intensity = 0.85;
      }
      // 提升神兽琥珀光柱与夜灯辉度
      Object.values(this.skyBeams).forEach(b => {
        b.material.opacity = 0.35;
      });
      if (this.lanternLights) {
        this.lanternLights.forEach(l => { l.intensity = 3.5; });
      }
    } else {
      // 恢复当前季节的日光设置
      this.setSeason(this.currentSeason);
      Object.values(this.skyBeams).forEach(b => {
        b.material.opacity = 0.11;
      });
      if (this.lanternLights) {
        this.lanternLights.forEach(l => { l.intensity = 1.2; });
      }
    }
  }

  _initBeasts() {
    this.beastManager = new Beast3DManager(this.scene);
    BEASTS.forEach(b => {
      this.beastManager.createBeastMesh(b);
      this._createSkyBeam(b);
    });
  }

  _createSkyBeam(beast) {
    const beamGeo = new THREE.CylinderGeometry(0.25, 0.85, 90, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xF5CF68,
      transparent: true,
      opacity: 0.11,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(beast.coordinates.x, beast.coordinates.y + 45, beast.coordinates.z);
    this.scene.add(beam);
    this.skyBeams[beast.id] = beam;
  }

  // =========================================================================
  // 【Awwwards 级导览运镜】开屏入画云海俯冲穿梭运镜 (Cinematic Opening Fly-in)
  // =========================================================================
  startCinematicIntro() {
    this.customCameraController = null;
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

    // 三次贝塞尔缓动 (Cubic Bezier Easing)
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
      if (this.cinematic.active) {
        this.cinematic.active = false;
        this.player.pos.copy(this.spawnPos);
        return;
      }

      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        this.tryAwakenNearBeast();
      }
      if (e.code === 'KeyM' || e.code === 'Escape') {
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

    this.container.addEventListener('mousedown', (e) => {
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

    const viewTouchCount = (touchList) => {
      let count = 0;
      for (let i = 0; i < touchList.length; i++) {
        const target = touchList[i].target;
        if (target && this.container.contains(target)) count += 1;
      }
      return count;
    };

    this.container.addEventListener('touchstart', (e) => {
      if (this.cinematic.active) {
        this.cinematic.active = false;
        this.player.pos.copy(this.spawnPos);
        return;
      }
      audio.ensureContext();
      if (viewTouchCount(e.touches) >= 2) {
        this.lookTouchId = null;
        return;
      }
      if (this.lookTouchId !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      this.lookTouchId = touch.identifier;
      this.lastMouse.x = touch.clientX;
      this.lastMouse.y = touch.clientY;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this.cinematic.active) return;
      if (viewTouchCount(e.touches) >= 2) {
        this.lookTouchId = null;
        return;
      }
      if (this.lookTouchId === null) return;
      let touch = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this.lookTouchId) {
          touch = e.touches[i];
          break;
        }
      }
      if (!touch) return;
      const dx = touch.clientX - this.lastMouse.x;
      const dy = touch.clientY - this.lastMouse.y;
      this.lastMouse.x = touch.clientX;
      this.lastMouse.y = touch.clientY;

      this.player.yaw -= dx * 0.0042;
      this.player.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.player.pitch - dy * 0.0036));
    }, { passive: true });

    const endLookTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };
    window.addEventListener('touchend', endLookTouch);
    window.addEventListener('touchcancel', endLookTouch);
  }

  _clampAxis(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-1, Math.min(1, n));
  }

  _interruptCinematic() {
    if (!this.cinematic.active) return;
    this.cinematic.active = false;
    this.player.pos.copy(this.spawnPos);
    this.player.yaw = this.spawnYaw;
    this.player.pitch = this.spawnPitch;
  }

  setVirtualMove(vec) {
    const x = this._clampAxis(vec && vec.x);
    const y = this._clampAxis(vec && vec.y);
    if (Math.hypot(x, y) > 0.2) this._interruptCinematic();
    this.virtualMove.x = x;
    this.virtualMove.y = y;
  }

  setVirtualLook(vec) {
    const x = this._clampAxis(vec && vec.x);
    const y = this._clampAxis(vec && vec.y);
    if (Math.hypot(x, y) > 0.2) this._interruptCinematic();
    this.virtualLook.x = x;
    this.virtualLook.y = y;
  }

  applyPinchZoom(scale) {
    if (!Number.isFinite(scale) || scale <= 0.2 || scale >= 5) return;
    if (this.cinematic.active || this.customCameraController) return;
    const next = THREE.MathUtils.clamp(this.userFov / scale, 40, 86);
    this.userFov = next;
    this.camera.fov = next;
    this.camera.updateProjectionMatrix();
  }

  tryAwakenNearBeast() {
    if (!this.nearestBeast || this.nearestDistance > 15.0) return null;
    const beast = this.nearestBeast;

    if (!this.awakenedZones.has(beast.id)) {
      this.awakenedZones.add(beast.id);

      if (this.skyBeams[beast.id]) {
        this.skyBeams[beast.id].material.opacity = 0.03;
      }

      this.beastManager.triggerAwaken(beast.id);
      this._triggerWorldMutation(beast);

      const beastMesh = (this.beastManager && this.beastManager.beastObjects)
        ? this.beastManager.beastObjects[beast.id]
        : null;

      if (this.awakeningDirector && beastMesh) {
        this.awakeningDirector.playAwakeningSequence(beastMesh, beast, (b) => {
          this.onAwakenBeast(b);
        });
      } else {
        this.onAwakenBeast(beast);
      }
      return beast;
    }
    return null;
  }

  _triggerWorldMutation(beast) {
    audio.playAwakeningChoral(beast.sectionIndex);

    this.scene.fog.color.setHex(0xF8EEDC);
    this.sunLight.intensity = 2.45;

    if (this.cutoutMaterials) {
      this.cutoutMaterials.forEach(m => {
        if (m.uniforms && m.uniforms.uGlow) {
          m.uniforms.uGlow.value = 0.38;
          setTimeout(() => {
            m.uniforms.uGlow.value = 0.06;
          }, 3500);
        }
      });
    }

    setTimeout(() => {
      this.sunLight.intensity = 2.35;
    }, 4000);
  }

  teleportToBeast(beastId) {
    const beast = BEASTS.find(b => b.id === beastId);
    if (!beast) return;

    // 终止可能正在运行的其它运镜或控制器
    this.cinematic.active = false;
    this.customCameraController = null;

    // 依胜景特性设计优美的摄影机机位（绝不被山体或地面掩埋）
    let offsetX = 7.5;
    let offsetZ = 7.5;
    let eyeElevation = 2.4;

    if (beastId === 'fuzhu') {
      offsetX = 6.0;
      offsetZ = 8.0;
      eyeElevation = 2.2;
    } else if (beastId === 'baize') {
      offsetX = 8.5;
      offsetZ = 6.5;
    }

    const targetX = beast.coordinates.x + offsetX;
    const targetZ = beast.coordinates.z + offsetZ;
    const groundY = this._calculateTerrainHeight(targetX, targetZ);
    const targetY = Math.max(beast.coordinates.y + eyeElevation, groundY + this.player.height);

    this.player.pos.set(targetX, targetY, targetZ);

    const dir = new THREE.Vector3(beast.coordinates.x, beast.coordinates.y + 1.2, beast.coordinates.z)
      .sub(this.player.pos).normalize();
    this.player.yaw = Math.atan2(-dir.x, -dir.z);
    this.player.pitch = -0.06;

    // 立即同步摄影机变换矩阵，保证进入第 0 帧即可呈现完整青绿盛景
    this.camera.position.copy(this.player.pos);
    const targetLook = new THREE.Vector3(
      this.camera.position.x - Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
      this.camera.position.y + Math.sin(this.player.pitch),
      this.camera.position.z - Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
    );
    this.camera.lookAt(targetLook);

    audio.playEnterPaintingSound();
  }

  _updatePlayer(dt) {
    const lookX = this.virtualLook.x;
    const lookY = this.virtualLook.y;
    if (lookX !== 0 || lookY !== 0) {
      this.player.yaw -= lookX * 2.6 * dt;
      this.player.pitch = Math.max(
        -Math.PI / 3,
        Math.min(Math.PI / 3, this.player.pitch - lookY * 1.8 * dt)
      );
    }

    const move = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) move.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) move.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) move.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) move.x += 1;

    let throttle = 1;
    if (move.lengthSq() === 0) {
      const vx = this.virtualMove.x;
      const vy = this.virtualMove.y;
      const mag = Math.hypot(vx, vy);
      if (mag > 0.0001) {
        move.x = vx;
        move.z = vy;
        throttle = Math.min(1, mag);
      }
    }

    const isSprinting = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const currentSpeed = this.player.speed * (isSprinting ? this.player.sprintMultiplier : 1.0);

    if (move.lengthSq() > 0) {
      move.normalize();
      move.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
      this.player.pos.addScaledVector(move, currentSpeed * throttle * dt);
      this.player.walkCycle += dt * 8.0;

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

    // 漫步微幅呼吸俯仰 (Subtle Head Bob)
    const headBob = Math.sin(this.player.walkCycle) * 0.04;
    const targetCamY = this.player.pos.y + headBob;

    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, this.player.pos.x, 0.18);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, 0.18);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, this.player.pos.z, 0.18);

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

    this.onNearBeastChange(minDistance <= 15.0 ? closestBeast : null, minDistance);
    this.onCompassUpdate(compassList, this.player.yaw);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.08);
    const time = this.clock.getElapsedTime();

    if (this.customCameraController) {
      this.customCameraController(dt);
    } else if (this.cinematic.active) {
      this._updateCinematic(time);
    } else {
      this._updatePlayer(dt);
      this._checkBeastProximity();
    }

    if (this.beastManager) {
      this.beastManager.update(dt, time);
    }

    // 更新水体着色器 Uniforms
    if (this.waterMesh && this.waterMesh.material && this.waterMesh.material.uniforms) {
      const u = this.waterMesh.material.uniforms;
      if (u.uTime) u.uTime.value = time;
      if (u.uNightMix) u.uNightMix.value = this.isNight ? 1.0 : 0.0;
      if (u.uRainIntensity) u.uRainIntensity.value = (this.currentWeather === 'rain') ? 1.0 : 0.0;
    }

    // 更新故宫真迹分层立体切片材质 Uniform (微风拂动与古绢呼吸)
    if (this.cutoutMaterials && this.cutoutMaterials.length > 0) {
      for (let i = 0; i < this.cutoutMaterials.length; i++) {
        const mat = this.cutoutMaterials[i];
        if (mat.uniforms && mat.uniforms.uTime) {
          mat.uniforms.uTime.value = time;
        }
      }
    }

    if (this.waterfallMesh) {
      this.waterfallMesh.material.opacity = 0.55 + Math.sin(time * 6.0) * 0.10;
    }

    // 谷雾徐徐飘动
    if (this.valleyMistPlanes && this.valleyMistPlanes.length > 0) {
      this.valleyMistPlanes.forEach(plane => {
        const u = plane.userData;
        plane.position.x = u.baseX + Math.sin(time * 0.18 + u.phase) * 8.0;
        plane.position.z = u.baseZ + Math.cos(time * 0.15 + u.phase) * 5.0;
      });
    }

    const nightMix = this.isNight ? 1.0 : 0.0;
    if (this.inkMistMaterials.length > 0) {
      for (let i = 0; i < this.inkMistMaterials.length; i++) {
        const uniforms = this.inkMistMaterials[i].uniforms;
        uniforms.uTime.value = time;
        uniforms.uNight.value = nightMix;
      }
    }
    if (this.reedMat) {
      this.reedMat.uniforms.uTime.value = time;
      this.reedMat.uniforms.uNight.value = nightMix;
      if (this.scene.fog) {
        this.reedMat.uniforms.uFogColor.value.copy(this.scene.fog.color);
        this.reedMat.uniforms.uFogDensity.value = this.scene.fog.density;
      }
    }

    // 仙鹤列队振翅与巡天翱翔 (9羽白鹤仙禽雁行穿云，掠过江心绝壁)
    if (this.cranes && this.cranes.length > 0) {
      const flightSpeed = 0.085;
      const leaderAngle = time * flightSpeed;
      // 航线横跨江山大泽谷地，翱翔于主峰与长桥之间 (center: x=8, z=-38)
      const cx = 8.0 + Math.sin(leaderAngle) * 44.0;
      const cz = -38.0 + Math.cos(leaderAngle) * 26.0;
      const cy = 32.0 + Math.sin(time * 0.35) * 2.2;
      const heading = leaderAngle + Math.PI / 2;

      const cosH = Math.cos(heading);
      const sinH = Math.sin(heading);

      this.cranes.forEach((crane, i) => {
        const u = crane.userData;
        const wingRot = Math.sin(time * 6.4 + u.phase) * 0.44;
        u.wingL.rotation.z = wingRot;
        u.wingR.rotation.z = -wingRot;

        // 雁行编队：领鹤居前，左右两翼各四羽梯次展开
        const rank = Math.floor((i + 1) / 2);
        const side = (i % 2 === 0) ? 1.0 : -1.0;
        const formOffsetX = i === 0 ? 0 : side * rank * 3.4;
        const formOffsetZ = i === 0 ? 0 : rank * 3.8;

        const wx = formOffsetX * cosH - formOffsetZ * sinH;
        const wz = formOffsetX * sinH + formOffsetZ * cosH;

        crane.position.set(cx + wx, cy + Math.sin(u.phase + time * 0.8) * 0.7, cz + wz);
        crane.rotation.y = heading;
      });
    }

    // 金粉悬浮微粒循环
    if (this.goldDustPoints) {
      const pos = this.goldDustPoints.geometry.attributes.position;
      for (let i = 1; i < pos.count; i += 3) {
        let py = pos.getY(i) - 0.035;
        if (py < 1.5) py = 38.0;
        pos.setY(i, py);
      }
      this.goldDustPoints.geometry.attributes.position.needsUpdate = true;
    }

    // 四时落花/飘雪/红枫循环
    if (this.seasonParticles) {
      const pos = this.seasonParticles.geometry.attributes.position;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        let px = pos.getX(i) + this.seasonVel[i * 3] * dt * 25;
        let py = pos.getY(i) + this.seasonVel[i * 3 + 1] * dt * 25;
        let pz = pos.getZ(i) + this.seasonVel[i * 3 + 2] * dt * 25;

        if (py < 1.0) py = 38.0;
        if (px > 140) px = -140;
        if (px < -140) px = 140;
        if (pz > 120) pz = -120;
        if (pz < -120) pz = 120;

        pos.setXYZ(i, px, py, pz);
      }
      pos.needsUpdate = true;
    }

    // 细雨下落动画
    if (this.rainMesh && this.rainMesh.visible) {
      const pos = this.rainMesh.geometry.attributes.position;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        let py = pos.getY(i) + this.rainVelY[i] * dt;
        if (py < 1.0) py = 48.0;
        pos.setY(i, py);
      }
      pos.needsUpdate = true;
    }

    // 琥珀信标光柱舒缓呼吸
    Object.entries(this.skyBeams).forEach(([id, beam]) => {
      if (!this.awakenedZones.has(id)) {
        beam.rotation.y += 0.008;
        beam.scale.x = 1.0 + Math.sin(time * 2.0) * 0.10;
        beam.scale.z = beam.scale.x;
      }
    });

    // 运行北宋工笔青绿水墨后处理管线 (带安全容错降级)
    if (this.postPipeline) {
      try {
        this.postPipeline.render(time, this.isNight);
      } catch (err) {
        console.error('[PostPipeline Runtime Error - Fallback to Direct Render]', err);
        this.postPipeline = null;
        this.renderer.render(this.scene, this.camera);
      }
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // =========================================================================
  // 表面肌理：乘色贴图，保留原有矿物色相，只补木纹 / 茅茎 / 石理
  // =========================================================================
  _detailTexture(kind) {
    if (this._texCache[kind]) return this._texCache[kind];
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);

    if (kind === 'straw') {
      for (let i = 0; i < 170; i++) {
        const x = (i * 1.63) % 256;
        const lean = Math.sin(i * 12.7) * 7;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(42, 30, 16, 0.42)' : 'rgba(70, 52, 28, 0.22)';
        ctx.lineWidth = i % 5 === 0 ? 1.7 : 0.8;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + lean, 256);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(36, 24, 12, 0.5)';
      ctx.lineWidth = 2;
      for (const y of [48, 128, 196]) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 256; x += 12) {
          ctx.lineTo(x, y + Math.sin(x * 0.08 + y) * 2.2);
        }
        ctx.stroke();
      }
    } else if (kind === 'wood') {
      for (let i = 0; i < 42; i++) {
        const y = (i + 0.35) * (256 / 42);
        ctx.strokeStyle = i % 6 === 0 ? 'rgba(36, 24, 14, 0.5)' : 'rgba(80, 58, 36, 0.26)';
        ctx.lineWidth = i % 7 === 0 ? 2.2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 256; x += 18) {
          const wiggle = Math.sin(x * 0.045 + i * 0.65) * 3.2 + Math.sin(x * 0.02 + i) * 1.6;
          ctx.lineTo(x, y + wiggle);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(28, 18, 10, 0.32)';
      ctx.beginPath();
      ctx.ellipse(176, 78, 16, 9, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(64, 188, 11, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'stone') {
      for (let i = 0; i < 70; i++) {
        const x = (i * 97) % 256;
        const y = (i * 53) % 256;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(24, 20, 16, 0.18)' : 'rgba(255, 248, 236, 0.16)';
        ctx.beginPath();
        ctx.ellipse(x, y, 16 + (i % 5) * 5, 9 + (i % 4) * 3, i * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(22, 16, 12, 0.48)';
      ctx.lineWidth = 1.15;
      for (let c = 0; c < 6; c++) {
        let x = (c * 43) % 220;
        let y = 8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 8; s++) {
          x += Math.sin(c * 2.2 + s * 1.3) * 16;
          y += 30;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (kind === 'lacquer') {
      for (let i = 0; i < 36; i++) {
        const x = (i * 7.4) % 256;
        ctx.strokeStyle = i % 4 === 0 ? 'rgba(20, 8, 6, 0.38)' : 'rgba(255, 220, 190, 0.08)';
        ctx.lineWidth = i % 5 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + Math.sin(i * 1.4) * 5, 256);
        ctx.stroke();
      }
    } else {
      // 编竹篱墙
      for (let y = 0; y < 256; y += 10) {
        ctx.fillStyle = (y / 10) % 2 === 0 ? 'rgba(80, 58, 32, 0.24)' : 'rgba(255, 246, 226, 0.02)';
        ctx.fillRect(0, y, 256, 5);
      }
      for (let x = 0; x < 256; x += 14) {
        ctx.fillStyle = 'rgba(48, 34, 18, 0.2)';
        ctx.fillRect(x, 0, 2, 256);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this._texCache[kind] = tex;
    return tex;
  }

  _strawFringeMaterial() {
    if (this._texCache.fringeMat) return this._texCache.fringeMat;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 64);
    for (let i = 0; i < 72; i++) {
      const x = (i * 1.85) % 128;
      const len = 26 + (i % 6) * 6;
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(92, 64, 32, 0.9)' : 'rgba(176, 138, 74, 0.78)';
      ctx.lineWidth = i % 3 === 0 ? 1.7 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + Math.sin(i * 1.7) * 3.2, len);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending
    });
    this._texCache.fringeMat = mat;
    return mat;
  }

  _contactShadowMaterial(faint) {
    const key = faint ? 'shadowMatFaint' : 'shadowMat';
    if (this._texCache[key]) return this._texCache[key];
    if (!this._texCache.shadowTex) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0.0, 'rgba(36, 26, 18, 0.52)');
      grad.addColorStop(0.42, 'rgba(36, 26, 18, 0.26)');
      grad.addColorStop(0.74, 'rgba(36, 26, 18, 0.08)');
      grad.addColorStop(1.0, 'rgba(36, 26, 18, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      // 不规则墨渍，避免正圆贴图感
      ctx.fillStyle = 'rgba(22, 16, 12, 0.18)';
      for (const blot of [[48, 58, 22], [78, 70, 16], [60, 40, 14]]) {
        ctx.beginPath();
        ctx.ellipse(blot[0], blot[1], blot[2], blot[2] * 0.72, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      this._texCache.shadowTex = tex;
    }
    if (!this._texCache.shadowGeo) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      this._texCache.shadowGeo = geo;
    }
    this._texCache[key] = new THREE.MeshBasicMaterial({
      map: this._texCache.shadowTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      opacity: faint ? 0.5 : 1,
      blending: THREE.NormalBlending
    });
    return this._texCache[key];
  }

  _placeContactShadow(parent, x, y, z, sx, sz, faint) {
    const material = this._contactShadowMaterial(Boolean(faint));
    const mesh = new THREE.Mesh(this._texCache.shadowGeo, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, 1, sz);
    mesh.renderOrder = 2;
    mesh.name = 'contact_shadow';
    parent.add(mesh);
    return mesh;
  }

  _groundBeasts() {
    BEASTS.forEach((b) => {
      const gy = this._calculateTerrainHeight(b.coordinates.x, b.coordinates.z);
      const foot = Math.max(gy, 1.18);
      const clearance = b.coordinates.y - foot;
      const airborne = clearance > 4.5;
      const reach = airborne ? 7.2 : (b.id === 'baize' || b.id === 'bo' ? 5.2 : 3.8);
      this._placeContactShadow(
        this.scene,
        b.coordinates.x,
        foot + 0.08,
        b.coordinates.z,
        reach * (airborne ? 1.25 : 1.12),
        reach * 0.72,
        airborne
      );
    });
  }

  _createInkMistMaterial(kind, strength) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uStrength: { value: strength },
        uKind: { value: kind }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uNight;
        uniform float uStrength;
        uniform float uKind;
        varying vec2 vUv;
        varying vec3 vWorld;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.55;
          for (int i = 0; i < 3; i++) {
            v += a * noise(p);
            p = p * 2.03 + vec2(1.7, 9.2);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 drift = vWorld.xz * 0.045 + vUv * vec2(1.4, 0.6);
          drift.x += uTime * 0.035;
          drift.y += uTime * 0.012;
          float n = fbm(drift);
          float n2 = fbm(drift * 1.85 - vec2(uTime * 0.028, 0.4));
          float wisp = clamp(n * 0.62 + n2 * 0.38, 0.0, 1.0);

          float side = smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x));
          float vert = smoothstep(0.0, 0.16, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
          if (uKind > 0.5) {
            vert = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.38, 0.92, vUv.y));
          }

          float alpha = (0.22 + 0.78 * smoothstep(0.3, 0.74, wisp)) * side * vert * uStrength;
          alpha *= mix(0.42, 1.0, smoothstep(0.18, 0.55, n2));

          // 浓雾守在山脚约 y∈[0, 6]，再向上羽化穿过画幕原有的底边淡出，
          // 避免不透明画边在雾带上方又切出一条硬线。
          float band = smoothstep(-0.6, 1.3, vWorld.y) * (1.0 - smoothstep(6.2, 13.5, vWorld.y));
          alpha *= band;

          float dist = length(cameraPosition.xz - vWorld.xz);
          alpha *= smoothstep(5.0, 18.0, dist);

          vec3 inkDeep = mix(vec3(0.42, 0.36, 0.28), vec3(0.10, 0.14, 0.18), uNight);
          vec3 silk = mix(vec3(0.93, 0.86, 0.72), vec3(0.55, 0.62, 0.68), uNight);
          vec3 col = mix(inkDeep, silk, smoothstep(0.22, 0.7, wisp));

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.46));
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.FrontSide,
      fog: false
    });
    this.inkMistMaterials.push(mat);
    return mat;
  }

  _buildScrollInkMist() {
    const curtainMat = this._createInkMistMaterial(1, 0.72);
    const farCurtainMat = this._createInkMistMaterial(1, 0.4);

    this.scrollBackdrops.forEach((mesh) => {
      const h = mesh.geometry.parameters.height;
      const w = mesh.geometry.parameters.width;
      const fadeTop = mesh.material.uniforms.uFadeTop.value;
      const curtainH = h * Math.min(0.36, fadeTop + 0.1);
      const fadeLine = -h / 2 + fadeTop * h;
      const curtain = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.98, curtainH, 1, 1),
        mesh.position.z < -140 ? farCurtainMat : curtainMat
      );
      curtain.position.set(0, fadeLine - curtainH * 0.22, 3.4);
      curtain.renderOrder = 3;
      curtain.name = 'scroll_ink_mist';
      mesh.add(curtain);
    });

    const groundMat = this._createInkMistMaterial(0, 0.5);
    const upperMat = this._createInkMistMaterial(0, 0.32);
    const originX = 8;
    const originZ = -62;
    const width = 380;
    const depth = 112;

    [0.45, 1.7].forEach((lift, index) => {
      const geo = new THREE.PlaneGeometry(width, depth, 56, 22);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + originX;
        const z = pos.getZ(i) + originZ;
        const ground = this._calculateTerrainHeight(x, z);
        pos.setY(i, Math.min(ground + lift, 5.05));
      }
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const sheet = new THREE.Mesh(geo, index === 0 ? groundMat : upperMat);
      sheet.position.set(originX, 0, originZ);
      sheet.renderOrder = 2;
      sheet.name = 'foothill_ink_mist';
      this.scene.add(sheet);
    });
  }

  _buildRiversideReeds() {
    let seed = 20261017;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const positions = [];
    const colors = [];
    const tips = [];
    const phases = [];
    const indices = [];
    let vertex = 0;

    const addBlade = (x, y, z, height, yaw, width, phase, ochre) => {
      const ca = Math.cos(yaw);
      const sa = Math.sin(yaw);
      const hw = width * 0.5;
      const rx = -sa * hw;
      const rz = ca * hw;
      const lean = height * 0.22;
      const pts = [
        [x - rx, y, z - rz, 0],
        [x + rx, y, z + rz, 0],
        [x + ca * lean - rx * 0.2, y + height, z + sa * lean - rz * 0.2, 1],
        [x + ca * lean + rx * 0.2, y + height, z + sa * lean + rz * 0.2, 1]
      ];
      const root = [0.10, 0.28, 0.16];
      const tip = ochre ? [0.72, 0.62, 0.32] : [0.62, 0.74, 0.42];
      pts.forEach((p) => {
        positions.push(p[0], p[1], p[2]);
        tips.push(p[3]);
        phases.push(phase);
        const c = p[3] > 0.5 ? tip : root;
        colors.push(c[0], c[1], c[2]);
      });
      indices.push(vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3);
      vertex += 4;
    };

    const tryClump = (x, z, count, scale) => {
      const ground = this._calculateTerrainHeight(x, z);
      if (ground < 1.12 || ground > 4.3) return;
      if (Math.hypot(x + 20.5, z - 34.5) < 16) return;
      for (let i = 0; i < count; i++) {
        const jx = (rand() - 0.5) * 0.9;
        const jz = (rand() - 0.5) * 0.7;
        const gy = this._calculateTerrainHeight(x + jx, z + jz);
        if (gy < 1.08) continue;
        addBlade(
          x + jx,
          gy,
          z + jz,
          (1.25 + rand() * 1.45) * scale,
          rand() * Math.PI * 2,
          0.07 + rand() * 0.07,
          rand() * Math.PI * 2,
          rand() > 0.72
        );
      }
    };

    // 河槽宽约 18m，芦苇只长在水深褪尽的外缘滩涂上
    for (let x = -82; x <= 116; x += 2.4) {
      const riverCenter = 4.0 + Math.sin(x * 0.025) * 8.0;
      for (const side of [-1, 1]) {
        for (const off of [14.8, 16.6]) {
          if (rand() < 0.12) continue;
          const z = riverCenter + side * off;
          tryClump(x, z, 6, 1);
        }
      }
    }

    if (vertex < 4) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('aTip', new THREE.Float32BufferAttribute(tips, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    this.reedMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uFogColor: { value: this.scene.fog.color.clone() },
        uFogDensity: { value: this.scene.fog.density }
      },
      vertexShader: /* glsl */`
        attribute float aTip;
        attribute float aPhase;
        uniform float uTime;
        varying vec3 vColor;
        varying float vTip;
        varying vec3 vWorld;
        void main() {
          vColor = color;
          vTip = aTip;
          vec3 pos = position;
          float sway = sin(uTime * 1.15 + aPhase) * aTip * aTip;
          pos.x += sway * 0.28;
          pos.z += cos(uTime * 0.95 + aPhase * 1.3) * aTip * aTip * 0.16;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uNight;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec3 vColor;
        varying float vTip;
        varying vec3 vWorld;
        void main() {
          vec3 col = mix(vColor, vColor * vec3(0.55, 0.7, 0.85), uNight * 0.45);
          col *= mix(0.85, 1.05, vTip);
          float dist = length(cameraPosition - vWorld);
          float fogFactor = clamp(1.0 - exp(-dist * uFogDensity), 0.0, 0.82);
          col = mix(col, uFogColor, fogFactor);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      vertexColors: true,
      side: THREE.DoubleSide,
      fog: false
    });

    const reeds = new THREE.Mesh(geo, this.reedMat);
    reeds.name = 'riverside_reeds';
    reeds.frustumCulled = true;
    this.scene.add(reeds);
  }
}

// 辅助数学缓动
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}
