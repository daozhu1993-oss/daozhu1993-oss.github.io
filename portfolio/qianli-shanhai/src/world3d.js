/**
 * 《千里江山 · 山海入画》3D 画中世界引擎 (3D In-Painting World Engine)
 * 纯 WebGL / Three.js 实时渲染王希孟青绿山水三维大境，支持第一人称漫步、金碧着色与推门/出画运镜
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

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.beastManager = null;

    // 玩家漫步状态
    this.player = {
      pos: new THREE.Vector3(0, 3, 0),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      speed: 12.0,
      height: 2.2
    };

    this.keys = {};
    this.isLocked = false;
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.currentBeast = null;
    this.activeBeastData = null;

    this.waterMesh = null;
    this.goldAuraMesh = null;
    this.paintingBackdrop = null;
    this.textureLoader = new THREE.TextureLoader();
    this.cachedTextures = {};
    this.clock = new THREE.Clock();

    this._initScene();
    this._buildPaintingBackdrop();
    this._buildTerrain();
    this._buildArchitecture();
    this._buildPinesAndNature();
    this._initBeasts();
    this._initControls();
    this._animate();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    // 宋代古绢微黄色温雾障
    this.scene.background = new THREE.Color(0xEADEC5);
    this.scene.fog = new THREE.FogExp2(0xEADEC5, 0.0075);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1200
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    // 光照系统：晨曦金光与青绿漫射
    const hemiLight = new THREE.HemisphereLight(0xFDF8EB, 0x1F473E, 0.95);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xFFE5A3, 1.5);
    sunLight.position.set(60, 100, 40);
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

  // 建造基于北宋《千里江山图》真迹的宏伟环形青绿画屏与远山大境
  _buildPaintingBackdrop() {
    const backdropGeo = new THREE.CylinderGeometry(220, 220, 130, 48, 1, true, Math.PI * 0.75, Math.PI * 0.5);
    
    // 默认加载卷二（悬泉主峰真迹段落）
    const tex = this.textureLoader.load('assets/painting/section_2.jpg');
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cachedTextures[2] = tex;

    const backdropMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.96
    });

    this.paintingBackdrop = new THREE.Mesh(backdropGeo, backdropMat);
    this.paintingBackdrop.position.set(0, 45, 0);
    this.scene.add(this.paintingBackdrop);

    // 辅助次景画屏（中景层叠山势）
    const midGeo = new THREE.PlaneGeometry(160, 65);
    const midTex = this.textureLoader.load('assets/painting/section_4.jpg');
    midTex.colorSpace = THREE.SRGBColorSpace;
    const midMat = new THREE.MeshBasicMaterial({
      map: midTex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    this.midMountainMesh = new THREE.Mesh(midGeo, midMat);
    this.midMountainMesh.position.set(-20, 25, -45);
    this.scene.add(this.midMountainMesh);
  }

  // 生成层峦叠嶂的宋代青绿山石地形
  _buildTerrain() {
    const geo = new THREE.PlaneGeometry(360, 260, 90, 70);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];

    // 高度差算法模拟王希孟《千里江山图》主峰壁立千仞
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // 主河道低洼、北侧主峰高耸
      let y = 0;
      if (z < 0) {
        // 北侧崇山峻岭
        const n1 = Math.sin(x * 0.035) * Math.cos(z * 0.04) * 22;
        const n2 = Math.sin(x * 0.08 + 1.2) * 8;
        const cliff = Math.pow(Math.abs(z) / 130, 2.0) * 38;
        y = Math.max(0, n1 + n2 + cliff);
      } else {
        // 南侧平缓丘陵与河岸浅滩
        const riverBed = Math.sin(x * 0.03) * 3.5;
        y = Math.max(0.4, (z / 80) * 12 + riverBed);
      }
      pos.setY(i, y);

      // 青绿三彩顶点着色：山脚赭石、山腰石绿、山巅石青
      const c = new THREE.Color();
      if (y < 4.0) {
        c.setHex(0xC2A478); // 赭石温土
      } else if (y < 16.0) {
        c.setHex(0x237563); // 石绿苍翠
      } else {
        c.setHex(0x184B60); // 绝顶石青
      }
      colors.push(c.r, c.g, c.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.15
    });

    this.terrain = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrain);

    // 水面 (琉璃澄澈，泥金微波)
    const waterGeo = new THREE.PlaneGeometry(360, 260, 32, 32);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x4E8A85,
      roughness: 0.1,
      metalness: 0.5,
      transparent: true,
      opacity: 0.82
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = 1.0;
    this.scene.add(this.waterMesh);
  }

  // 建造宋代亭台、飞檐长廊与长桥
  _buildArchitecture() {
    // 1. 水榭六角凉亭
    const pavGroup = new THREE.Group();
    pavGroup.position.set(0, 1.2, 8);

    const matWood = new THREE.MeshStandardMaterial({ color: 0x543D2B, roughness: 0.7 });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x8C4A32, roughness: 0.4 });

    // 六根廊柱
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), matWood);
      col.position.set(Math.cos(angle) * 2.2, 1.6, Math.sin(angle) * 2.2);
      pavGroup.add(col);
    }
    // 飞檐攒尖顶
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 6), matRoof);
    roof.position.y = 3.9;
    pavGroup.add(roof);

    this.scene.add(pavGroup);

    // 2. 虹桥（宋代木拱长桥）
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(-25, 1.0, 15);
    const bridgeArch = new THREE.Mesh(
      new THREE.TorusGeometry(8.0, 0.8, 8, 16, Math.PI * 0.7),
      matWood
    );
    bridgeArch.rotation.z = Math.PI * 0.15;
    bridgeGroup.add(bridgeArch);
    this.scene.add(bridgeGroup);
  }

  // 种植苍松、奇石与芦苇
  _buildPinesAndNature() {
    const pineMatTrunk = new THREE.MeshStandardMaterial({ color: 0x3E2D1D, roughness: 0.9 });
    const pineMatNeedles = new THREE.MeshStandardMaterial({ color: 0x1B4D3E, roughness: 0.6 });

    // 沿山脚与水畔分布古松
    for (let i = 0; i < 35; i++) {
      const pine = new THREE.Group();
      const px = (Math.random() - 0.5) * 240;
      const pz = (Math.random() - 0.5) * 160;
      const py = this._getTerrainHeight(px, pz);

      if (py > 0.8) {
        pine.position.set(px, py, pz);
        // 虬曲树干
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 4.5, 5), pineMatTrunk);
        trunk.position.y = 2.25;
        trunk.rotation.z = (Math.random() - 0.5) * 0.35;
        pine.add(trunk);

        // 层层叠叠如伞盖的松针
        for (let j = 0; j < 3; j++) {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2 - j * 0.4, 1.2, 6), pineMatNeedles);
          cap.position.y = 3.2 + j * 0.9;
          pine.add(cap);
        }
        this.scene.add(pine);
      }
    }
  }

  _initBeasts() {
    this.beastManager = new Beast3DManager(this.scene);
    BEASTS.forEach(b => {
      this.beastManager.createBeastMesh(b);
    });
  }

  _getTerrainHeight(x, z) {
    if (z < 0) {
      const n1 = Math.sin(x * 0.035) * Math.cos(z * 0.04) * 22;
      const n2 = Math.sin(x * 0.08 + 1.2) * 8;
      const cliff = Math.pow(Math.abs(z) / 130, 2.0) * 38;
      return Math.max(0, n1 + n2 + cliff);
    } else {
      const riverBed = Math.sin(x * 0.03) * 3.5;
      return Math.max(0.4, (z / 80) * 12 + riverBed);
    }
  }

  // 镜头入画俯冲
  enterBeastWorld(beastId) {
    const beast = BEASTS.find(b => b.id === beastId);
    if (!beast) return;

    this.activeBeastData = beast;
    this.currentBeast = this.beastManager.beastObjects[beastId];

    // 动态切换对应真迹画作段落作为环形大景画屏
    if (this.paintingBackdrop && beast.sectionIndex !== undefined) {
      const secId = Math.min(5, Math.max(0, beast.sectionIndex));
      if (!this.cachedTextures[secId]) {
        const tex = this.textureLoader.load(`assets/painting/section_${secId}.jpg`);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.cachedTextures[secId] = tex;
      }
      this.paintingBackdrop.material.map = this.cachedTextures[secId];
      this.paintingBackdrop.material.needsUpdate = true;
    }

    // 玩家传送到神兽前方的合适位置
    const targetPos = new THREE.Vector3(
      beast.coordinates.x + 8,
      beast.coordinates.y + this.player.height,
      beast.coordinates.z + 8
    );

    // 初始高空入画俯冲动画
    this.camera.position.set(beast.coordinates.x + 25, beast.coordinates.y + 40, beast.coordinates.z + 45);
    this.player.pos.copy(targetPos);

    // 朝向神兽
    const dir = new THREE.Vector3(beast.coordinates.x, beast.coordinates.y + 1, beast.coordinates.z)
      .sub(targetPos).normalize();
    this.player.yaw = Math.atan2(-dir.x, -dir.z);
    this.player.pitch = 0.05;
  }

  // 尝试唤醒当前身边的神兽
  tryAwakenNearBeast() {
    if (!this.activeBeastData) return null;
    const beastPos = new THREE.Vector3(
      this.activeBeastData.coordinates.x,
      this.activeBeastData.coordinates.y,
      this.activeBeastData.coordinates.z
    );
    const dist = this.player.pos.distanceTo(beastPos);

    if (dist < 12.0) {
      this.beastManager.triggerAwaken(this.activeBeastData.id);
      this._triggerWorldMutation(this.activeBeastData);
      this.onAwakenBeast(this.activeBeastData);
      return this.activeBeastData;
    }
    return null;
  }

  // 唤醒时的世界异动大效
  _triggerWorldMutation(beastData) {
    audio.playAwakeningChoral(beastData.sectionIndex);

    // 水面染金波
    if (this.waterMesh) {
      this.waterMesh.material.color.setHex(0xCDB26A);
      this.waterMesh.material.opacity = 0.92;
    }
    // 天空金霞泛起
    this.scene.fog.color.setHex(0xF4E7CB);
    this.sunLight.intensity = 2.0;

    // 3秒后水面逐渐回归温润青碧与泥金交融
    setTimeout(() => {
      if (this.waterMesh) {
        this.waterMesh.material.color.setHex(0x569C94);
        this.waterMesh.material.opacity = 0.85;
      }
    }, 3500);
  }

  _initControls() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        this.tryAwakenNearBeast();
      }
      if (e.code === 'Escape') {
        this.onExitToScroll();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // 视口鼠标旋转拖拽
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

      this.player.yaw -= dx * 0.0035;
      this.player.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.player.pitch - dy * 0.003));
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // 移动端触控摇杆视角
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

      this.player.yaw -= dx * 0.0045;
      this.player.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.player.pitch - dy * 0.004));
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  _updatePlayer(dt) {
    const move = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) move.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) move.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) move.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) move.x += 1;

    if (move.lengthSq() > 0) {
      move.normalize();
      move.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
      this.player.pos.addScaledVector(move, this.player.speed * dt);
    }

    // 贴合山峦地面高度
    const groundY = this._getTerrainHeight(this.player.pos.x, this.player.pos.z);
    this.player.pos.y = groundY + this.player.height;

    // 平滑同步相机
    this.camera.position.lerp(this.player.pos, 0.12);

    const targetLook = new THREE.Vector3(
      this.camera.position.x - Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
      this.camera.position.y + Math.sin(this.player.pitch),
      this.camera.position.z - Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
    );
    this.camera.lookAt(targetLook);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    this._updatePlayer(dt);

    if (this.beastManager) {
      this.beastManager.update(dt, time);
    }

    // 水面微波荡漾
    if (this.waterMesh) {
      this.waterMesh.position.y = 1.0 + Math.sin(time * 1.5) * 0.08;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
