/**
 * 《千里江山 · 借笔还魂》北宋院体程序化景物生成引擎 (Song Dynasty Procedural Architecture & Nature)
 * 借鉴并融合自开源项目《入画 · WITHIN》(fatasia/within, MIT License)
 * 
 * 核心技术与艺术亮点：
 * 1. 【北宋歇山与庑殿飞檐生成器 (chineseRoof)】：
 *    - 纯数学 5 次多项式精准刻画宋代屋角起翘与舒缓微陷瓦垄，绝无塑料几何体块。
 * 2. 【临流轩榭与水心重楼 (pavilion & grandWaterPavilion)】：
 *    - 严格依照《千里江山图》画中制式，包含青石台基、实木柱网、斗栱梁架、筒瓦脊兽与暖黄夜灯。
 * 3. 【江南写意江舟与乌篷 (boat)】：
 *    - 包含深色曲面船身、透气竹席乌篷、吃风微曲布帆、船橹与立桅。
 * 4. 【折枝苍松与五出松针 (pineCrownGeometry)】：
 *    - 五出破边松针簇，曲折苍劲柏干，杜绝粗糙面片贴图。
 * 5. 【汀洲苇草与贴地矶石 (riverbankDetails)】：
 *    - 地形防悬空半埋嵌入算法，生成近岸碎石与风中微澜芦苇。
 */

import * as THREE from 'three';

// =========================================================================
// 1. 数学与伪随机基础工具
// =========================================================================

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export function noise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v * (1 - u) + (d - b) * u * v;
}

export function fbm(x, y, seed) {
  let n = 0;
  let weight = 0.56;
  for (let i = 0; i < 5; i++) {
    n += noise(x, y, seed + i * 7) * weight;
    x *= 2.07;
    y *= 2.07;
    weight *= 0.48;
  }
  return n;
}

// =========================================================================
// 2. 几何建模基础算子 (Procedural Geometry Primitives)
// =========================================================================

export function rod(group, start, end, radius, material, taper = 1, sides = 6) {
  const direction = end.clone().sub(start);
  const len = direction.length();
  if (len < 0.001) return null;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * taper, radius, len, sides),
    material
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(mesh);
  return mesh;
}

export function curveRod(group, points, radius, material, segments = 12) {
  if (!points || points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segments, radius, 5, false),
    material
  );
  group.add(mesh);
  return mesh;
}

function box(group, size, at, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...at);
  group.add(mesh);
  return mesh;
}

/**
 * 宋画五出松针簇网格 (Five-notched Needle Spray Geometry)
 * 5 个独立展开的松针伞面，边缘带 4 簇细尖破边，告别纸片树
 */
export function pineCrownGeometry() {
  const vertices = [];
  const indices = [];
  const sprays = [
    [-0.57, -0.04, -0.17, 0.39, 0.28],
    [-0.18, 0.08, 0.43, 0.34, 0.27],
    [0.4, -0.02, 0.35, 0.35, 0.25],
    [0.57, 0.06, -0.26, 0.36, 0.29],
    [-0.02, -0.06, -0.31, 0.31, 0.28],
  ];

  sprays.forEach(([x, y, z, width, depth], spray) => {
    const base = vertices.length / 3;
    vertices.push(x, y + 0.15, z, x + 0.03, y - 0.13, z - 0.02);
    for (let ring = 0; ring < 2; ring++) {
      for (let side = 0; side < 7; side++) {
        const angle = (side / 7) * Math.PI * 2 + spray * 1.31;
        const radius = (side % 2 ? 0.69 : 1.06) * (ring ? 0.91 : 1);
        vertices.push(
          x + Math.cos(angle) * width * radius,
          y + (ring ? -0.045 : 0.045) + Math.sin(angle * 3 + spray) * 0.035,
          z + Math.sin(angle) * depth * radius
        );
      }
    }
    for (let side = 0; side < 7; side++) {
      const a = base + 2 + side;
      const b = base + 2 + ((side + 1) % 7);
      indices.push(base, b, a, base + 1, a + 7, b + 7, a, b, a + 7, b, b + 7, a + 7);
    }
    // 针叶尖端微齿
    for (let tuft = 0; tuft < 4; tuft++) {
      const angle = tuft * 1.71 + spray;
      const tip = vertices.length / 3;
      const cx = x + Math.cos(angle) * width * 0.73;
      const cz = z + Math.sin(angle) * depth * 0.73;
      vertices.push(
        cx - Math.sin(angle) * 0.035,
        y,
        cz + Math.cos(angle) * 0.035,
        cx + Math.sin(angle) * 0.035,
        y + 0.02,
        cz - Math.cos(angle) * 0.035,
        x + Math.cos(angle) * width * 1.22,
        y + 0.09,
        z + Math.sin(angle) * depth * 1.22
      );
      indices.push(tip, tip + 1, tip + 2);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// =========================================================================
// 3. 宋画建筑构件：真·宋式凹面飞檐 (chineseRoof)
// =========================================================================

export function createSongRoof(width, depth, height, color = '#314b43') {
  const vertices = [];
  const indices = [];

  for (let s = 0; s < 2; s++) {
    for (let i = 0; i <= 12; i++) {
      for (let j = 0; j <= 8; j++) {
        const x = (i / 12 - 0.5) * width;
        const t = j / 8;
        const z = t * depth * 0.5 * (s === 0 ? 1 : -1);
        // 北宋《营造法式》反宇向阳举折公式：中段微落、翼角五次幂舒展上翘
        const y =
          height * (1 - t) +
          Math.pow(t, 4) * height * 0.37 +
          Math.pow(Math.abs(x) / (width * 0.5), 5) * height * 0.17;
        vertices.push(x, y, z);
        if (i < 12 && j < 8) {
          const a = s * 13 * 9 + i * 9 + j;
          indices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.85,
      side: THREE.DoubleSide
    })
  );
}

// =========================================================================
// 4. 北宋写意临水阁楼亭榭 (Song Architectural Pavilions)
// =========================================================================

export function createSongPavilion({
  scale = 1.0,
  open = true,
  roofColor = '#314b43',
  hasLantern = true,
  woodColor = '#554936',
  stoneColor = '#b9ad92'
} = {}) {
  const group = new THREE.Group();
  group.name = 'song_pavilion';

  const wood = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.82 });
  const stone = new THREE.MeshStandardMaterial({ color: stoneColor, roughness: 0.90 });
  const tileMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.80 });
  const plaster = new THREE.MeshStandardMaterial({ color: '#d4c8ac', roughness: 0.75 });

  // 1. 青石阶基与踏跺 (Plinth and stairs)
  box(group, [5.0, 0.35, 4.0], [0, 0.20, 0], stone);
  box(group, [4.6, 0.17, 3.7], [0, 0.46, 0], stone);
  for (let i = 0; i < 3; i++) {
    box(group, [1.65, 0.12, 0.32], [0, 0.10 + i * 0.12, 2.7 - i * 0.28], stone);
  }

  // 2. 实墙闭合或开敞美人靠
  if (!open) {
    box(group, [3.9, 2.55, 2.9], [0, 1.78, 0], plaster);
  }

  // 3. 檐柱与柱头仿木枋额
  for (const dx of [-1.8, 1.8]) {
    for (const dz of [-1.3, 1.3]) {
      rod(group, new THREE.Vector3(dx, 0.48, dz), new THREE.Vector3(dx, 3.97, dz), 0.11, wood);
      box(group, [0.38, 0.16, 0.38], [dx, 0.58, dz], stone);
      box(group, [0.65, 0.13, 0.30], [dx, 3.70, dz], wood);
      box(group, [0.35, 0.14, 0.56], [dx, 3.84, dz], wood);
    }
  }

  // 4. 阑额与寻杖栏杆
  for (const sign of [-1, 1]) {
    box(group, [3.8, 0.16, 0.16], [0, 3.7, sign * 1.3], wood);
    box(group, [0.16, 0.16, 2.7], [sign * 1.8, 3.7, 0], wood);
    if (open) {
      box(group, [0.12, 0.10, 2.7], [sign * 1.8, 1.20, 0], wood);
      for (let j = -2; j <= 2; j++) {
        box(group, [0.075, 0.60, 0.075], [sign * 1.8, 0.90, j * 0.5], wood);
      }
    }
  }

  // 5. 歇山歇架木撑
  for (const xx of [-1.8, 1.8]) {
    for (const sign of [-1, 1]) {
      rod(
        group,
        new THREE.Vector3(xx, 3.85, sign * 1.3),
        new THREE.Vector3(xx, 4.70, 0),
        0.065,
        wood
      );
    }
  }

  // 6. 飞檐屋顶
  const roof = createSongRoof(5.7, 4.7, 1.6, roofColor);
  roof.position.y = 3.2;
  group.add(roof);

  // 7. 瓦垄微弧曲线
  for (let i = 0; i <= 22; i++) {
    const xx = -2.8 + (i * 5.6) / 22;
    for (const sign of [-1, 1]) {
      const points = Array.from({ length: 7 }, (_, j) => {
        const t = j / 6;
        return new THREE.Vector3(
          xx,
          3.24 + 1.6 * (1 - t) + Math.pow(t, 4) * 0.592 + Math.pow(Math.abs(xx) / 2.85, 5) * 0.272,
          sign * t * 2.35
        );
      });
      curveRod(group, points, 0.045, tileMat, 8);
    }
  }

  // 8. 脊兽与瓦当正脊
  curveRod(
    group,
    [
      new THREE.Vector3(-2.9, 5.06, 0),
      new THREE.Vector3(0, 4.87, 0),
      new THREE.Vector3(2.9, 5.06, 0)
    ],
    0.09,
    tileMat
  );

  // 9. 暖黄宣和夜灯
  if (hasLantern) {
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xDDBF79,
        emissive: 0xFFB754,
        emissiveIntensity: 2.2
      })
    );
    lantern.scale.y = 1.35;
    lantern.position.set(1.8, 2.65, 1.4);
    group.add(lantern);
    rod(group, new THREE.Vector3(1.8, 2.9, 1.4), new THREE.Vector3(1.8, 3.2, 1.4), 0.025, wood);
  }

  group.scale.setScalar(scale);
  return group;
}

/**
 * 水心重檐二层大阁 (Grand Double-Story Water Pavilion)
 * 用于胜境六 · 水心高阁（白泽所在），包含下层水殿与上层揽胜重阁
 */
export function createSongGrandWaterPavilion({
  scale = 1.0,
  roofColor = '#2d453e'
} = {}) {
  const group = new THREE.Group();
  group.name = 'grand_water_pavilion';

  // 下层大殿
  const lower = createSongPavilion({
    scale: 1.35,
    open: false,
    roofColor,
    hasLantern: true
  });
  group.add(lower);

  // 上层重檐观景阁
  const upper = createSongPavilion({
    scale: 0.95,
    open: true,
    roofColor,
    hasLantern: true
  });
  upper.position.y = 4.8 * 1.35 * 0.85;
  group.add(upper);

  // 阁顶宝刹灵珠
  const spire = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xF3C93E,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x886212,
      emissiveIntensity: 0.3
    })
  );
  spire.position.y = upper.position.y + 5.2;
  group.add(spire);

  group.scale.setScalar(scale);
  return group;
}

// =========================================================================
// 5. 江南写意乌篷江舟与布帆 (Song River Boat with Woven Awning & Sail)
// =========================================================================

export function createSongBoat({
  scale = 1.0,
  hasSail = true,
  timberColor = '#685137',
  darkColor = '#473e2d'
} = {}) {
  const group = new THREE.Group();
  group.name = 'song_boat';

  const wood = new THREE.MeshStandardMaterial({ color: timberColor, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.90 });

  // 1. 双曲拱底船身 (Curved Boat Hull)
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    wood
  );
  hull.scale.set(3.4, 0.65, 0.75);
  group.add(hull);

  // 2. 船底甲板铺板
  for (let i = 0; i < 5; i++) {
    box(group, [5.5, 0.08, 0.22], [0, 0.05, (i - 2) * 0.24], i % 2 ? wood : dark);
  }

  // 3. 两侧弧线船弦
  for (const sign of [-1, 1]) {
    curveRod(
      group,
      [
        new THREE.Vector3(-3.3, 0.2, 0),
        new THREE.Vector3(-2.0, 0.12, sign * 0.63),
        new THREE.Vector3(1.7, 0.14, sign * 0.66),
        new THREE.Vector3(3.3, 0.3, 0)
      ],
      0.065,
      dark,
      20
    );
  }

  // 4. 桅杆与受风微鼓织锦布帆 (Wind-billowed Sail)
  if (hasSail) {
    rod(group, new THREE.Vector3(0.2, 0, 0), new THREE.Vector3(0.2, 5.9, 0), 0.065, dark, 0.65);

    const sailGeo = new THREE.PlaneGeometry(2.2, 3.7, 10, 12);
    const pos = sailGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const xx = pos.getX(i);
      const yy = pos.getY(i);
      pos.setXYZ(
        i,
        xx * (0.9 + (yy + 1.85) * 0.035),
        yy,
        0.35 * Math.sin(((xx + 1.1) / 2.2) * Math.PI) * Math.sin(((yy + 1.85) / 3.7) * Math.PI)
      );
    }
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(
      sailGeo,
      new THREE.MeshStandardMaterial({
        color: 0xD5C7A0,
        side: THREE.DoubleSide,
        roughness: 0.95
      })
    );
    sail.position.set(-0.75, 3.4, 0);
    group.add(sail);

    // 帆面竹制撑条 (Bamboo battens)
    for (let i = 0; i < 6; i++) {
      const yy = 1.55 + i * 0.74;
      curveRod(
        group,
        [
          new THREE.Vector3(-1.8, yy, 0.03),
          new THREE.Vector3(-0.75, yy, 0.3 * Math.sin((i / 5) * Math.PI)),
          new THREE.Vector3(0.3, yy, 0.03)
        ],
        0.025,
        wood,
        8
      );
    }
  }

  // 5. 编竹拱弧艉蓬 (Woven Arched Bamboo Awning)
  const shelter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 1.45, 14, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xA49469, roughness: 0.95, side: THREE.DoubleSide })
  );
  shelter.rotation.z = Math.PI / 2;
  shelter.scale.x = 1.4;
  shelter.position.set(1.46, 0.12, 0);
  group.add(shelter);

  // 艉蓬编竹骨架
  for (let i = 0; i < 7; i++) {
    const xx = 0.8 + i * 0.22;
    const points = Array.from({ length: 9 }, (_, j) =>
      new THREE.Vector3(
        xx,
        0.12 + Math.sin((j / 8) * Math.PI) * 0.9,
        Math.cos((j / 8) * Math.PI) * 0.63
      )
    );
    curveRod(group, points, 0.045, i % 2 ? wood : dark, 8);
  }

  // 6. 船艄斜撑木橹 (Sculling Oar)
  rod(group, new THREE.Vector3(2.4, 0.4, 0.3), new THREE.Vector3(4.2, -0.15, 1.4), 0.045, wood);

  // 7. 暖黄渔火小灯笼
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0xFFD56B,
      emissive: 0xFFAA33,
      emissiveIntensity: 1.8
    })
  );
  lantern.position.set(-2.2, 0.6, 0);
  group.add(lantern);

  group.scale.setScalar(scale);
  return group;
}

// =========================================================================
// 6. 北宋水村茅茨木屋 (Song Thatched Water Village Cottage)
// =========================================================================

export function createSongCottage({
  scale = 1.0,
  roofColor = '#776c54',
  wallColor = '#a89c7d',
  timberColor = '#4a3d2e'
} = {}) {
  const cottage = new THREE.Group();
  cottage.name = 'song_cottage';

  const wood = new THREE.MeshStandardMaterial({ color: timberColor, roughness: 0.85 });
  const straw = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.95 });
  const bambooWall = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.88 });

  // 1. 架空地坪与防潮桩柱
  box(cottage, [4.4, 0.20, 3.4], [0, 0.40, 0], wood);
  for (const px of [-1.9, 1.9]) {
    for (const pz of [-1.4, 1.4]) {
      const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.80, 6), wood);
      stilt.position.set(px, 0.20, pz);
      cottage.add(stilt);
    }
  }

  // 2. 编竹为篱主墙
  const walls = new THREE.Mesh(new THREE.BoxGeometry(3.9, 2.1, 2.9), bambooWall);
  walls.position.y = 1.55;
  cottage.add(walls);

  // 3. 柴扉格栅与小窗
  const windowFrame = box(cottage, [0.85, 0.85, 0.06], [0, 1.65, 1.48], wood);
  box(cottage, [0.05, 0.80, 0.08], [0, 1.65, 1.48], wood);
  box(cottage, [0.80, 0.05, 0.08], [0, 1.65, 1.48], wood);

  // 4. 北宋双坡歇山飞檐草顶 (微凹曲线茅草屋面)
  const roof = createSongRoof(5.2, 4.2, 1.45, roofColor);
  roof.position.y = 2.45;
  cottage.add(roof);

  cottage.scale.setScalar(scale);
  return cottage;
}

// =========================================================================
// 7. 折枝苍松与五出松针系统 (Song Dynasty Scholar Pines)
// =========================================================================

export function createSongPineTree({
  scale = 1.0,
  seed = 42,
  crownCount = 4,
  barkColor = '#514a35',
  leafColor = '#315e43'
} = {}) {
  const tree = new THREE.Group();
  tree.name = 'song_pine_tree';

  const random = seededRandom(seed);
  const bark = new THREE.MeshStandardMaterial({ color: barkColor, roughness: 0.95 });
  const needleMat = new THREE.MeshStandardMaterial({
    color: leafColor,
    roughness: 0.88,
    side: THREE.DoubleSide
  });

  // 1. 曲折苍劲柏干 (Bent Trunk)
  const height = 4.2 * (0.85 + random() * 0.3);
  const trunkPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3((random() - 0.5) * 0.4, height * 0.33, (random() - 0.5) * 0.4),
    new THREE.Vector3((random() - 0.5) * 0.8 + 0.3, height * 0.68, (random() - 0.5) * 0.6),
    new THREE.Vector3((random() - 0.5) * 0.5 + 0.4, height, (random() - 0.5) * 0.5)
  ];
  const trunk = curveRod(tree, trunkPoints, 0.16, bark, 16);

  // 2. 枝丫与五出松针簇
  const crownGeo = pineCrownGeometry();
  for (let c = 0; c < crownCount; c++) {
    const level = (c + 0.3) / crownCount;
    const tY = height * (0.45 + level * 0.52);
    const angle = (c * 2.1) + random() * 0.8;
    const spread = (1.4 + random() * 1.2) * (1.1 - level * 0.4);

    const bStart = new THREE.Vector3(
      trunkPoints[1].x * (1 - level) + trunkPoints[3].x * level,
      tY,
      trunkPoints[1].z * (1 - level) + trunkPoints[3].z * level
    );
    const bEnd = new THREE.Vector3(
      bStart.x + Math.cos(angle) * spread,
      bStart.y + (random() - 0.3) * 0.5,
      bStart.z + Math.sin(angle) * spread
    );

    // 弯曲侧枝
    rod(tree, bStart, bEnd, 0.055, bark, 0.6);

    // 五出松针伞
    const spray = new THREE.Mesh(crownGeo, needleMat);
    spray.position.copy(bEnd);
    spray.rotation.set((random() - 0.5) * 0.3, angle, (random() - 0.5) * 0.3);
    const sSize = 1.3 * (1.0 - level * 0.25) * (0.8 + random() * 0.4);
    spray.scale.set(sSize, sSize * 0.8, sSize);
    tree.add(spray);
  }

  tree.scale.setScalar(scale);
  return tree;
}

/**
 * 盛唐北宋写意碧桃 (Peach Blossom Tree)
 * 用于胜境一 · 桃溪浅滩（鹿蜀所在）
 */
export function createSongPeachTree({
  scale = 1.0,
  seed = 101
} = {}) {
  const tree = new THREE.Group();
  tree.name = 'song_peach_tree';

  const random = seededRandom(seed);
  const bark = new THREE.MeshStandardMaterial({ color: 0x4A2E1A, roughness: 0.90 });
  const blossom = new THREE.MeshStandardMaterial({
    color: 0xF28CA0,
    emissive: 0x8C2038,
    emissiveIntensity: 0.28,
    roughness: 0.65,
    side: THREE.DoubleSide
  });

  const trunk = curveRod(
    tree,
    [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1, 1.2, 0.1),
      new THREE.Vector3((random() - 0.5) * 0.5, 2.5, (random() - 0.5) * 0.5)
    ],
    0.13,
    bark,
    10
  );

  const crownGeo = pineCrownGeometry();
  for (let i = 0; i < 4; i++) {
    const spray = new THREE.Mesh(crownGeo, blossom);
    const angle = i * 1.57 + random() * 0.5;
    const r = 1.2 + random() * 0.6;
    spray.position.set(Math.cos(angle) * r, 2.3 + (i % 2) * 0.6, Math.sin(angle) * r);
    spray.scale.set(1.1, 0.8, 1.1);
    tree.add(spray);
  }

  tree.scale.setScalar(scale);
  return tree;
}

// =========================================================================
// 8. 汀洲苇草与防浮空碎石 (Grounded Shoreline Rocks & Reeds)
// =========================================================================

export function createSongRiverbankDetails({
  rockCount = 28,
  reedCount = 55,
  seed = 881,
  terrainHeightFn = () => 1.0,
  areaCenter = { x: -45, z: 28 },
  areaRadius = 18
} = {}) {
  const group = new THREE.Group();
  group.name = 'song_shore_details';

  const random = seededRandom(seed);
  const matStone = new THREE.MeshStandardMaterial({ color: 0x6E6C5C, roughness: 0.92 });
  const matReed = new THREE.MeshStandardMaterial({
    color: 0x7E8C5A,
    roughness: 0.85,
    side: THREE.DoubleSide
  });

  // 1. 贴地半埋汀洲矶石 (避免悬空)
  for (let i = 0; i < rockCount; i++) {
    const angle = random() * Math.PI * 2;
    const dist = Math.pow(random(), 0.6) * areaRadius;
    const x = areaCenter.x + Math.cos(angle) * dist;
    const z = areaCenter.z + Math.sin(angle) * dist;
    const y = terrainHeightFn(x, z);

    if (y >= 0.7 && y <= 3.8) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.35 + random() * 0.45, 1),
        matStone
      );
      // 埋入地表 25% 避免悬浮
      rock.position.set(x, y + 0.05, z);
      rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      rock.scale.set(1.2 + random() * 0.6, 0.6 + random() * 0.4, 1.0 + random() * 0.5);
      group.add(rock);
    }
  }

  // 2. 水际丛生芦苇 (Shore Reeds)
  const reedGeo = new THREE.CylinderGeometry(0.015, 0.03, 1.6, 5);
  for (let i = 0; i < reedCount; i++) {
    const angle = random() * Math.PI * 2;
    const dist = Math.pow(random(), 0.7) * areaRadius;
    const x = areaCenter.x + Math.cos(angle) * dist;
    const z = areaCenter.z + Math.sin(angle) * dist;
    const y = terrainHeightFn(x, z);

    if (y >= 0.8 && y <= 2.2) {
      const reedCluster = new THREE.Group();
      reedCluster.position.set(x, y + 0.7, z);
      const stalks = 3 + Math.floor(random() * 4);
      for (let s = 0; s < stalks; s++) {
        const stalk = new THREE.Mesh(reedGeo, matReed);
        stalk.position.set((random() - 0.5) * 0.25, 0, (random() - 0.5) * 0.25);
        stalk.rotation.z = (random() - 0.5) * 0.25;
        stalk.rotation.x = (random() - 0.5) * 0.25;
        reedCluster.add(stalk);
      }
      group.add(reedCluster);
    }
  }

  return group;
}
