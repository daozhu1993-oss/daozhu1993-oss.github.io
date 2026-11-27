/**
 * 《千里江山 · 借笔还魂》真 3D 北宋院体青绿山峦与江河地形引擎 (True 3D Song Painting Landscape)
 * 路线 A 核心架构：彻底告别 2D 截图立牌！
 * 
 * 融合《入画 · WITHIN》(MIT) 的中国画峻峰脊线算法与王希孟“三矾九染”青绿重彩着色：
 * 1. 【多脊棱峰喀斯特山势 (Ridged Song Karst Peaks)】：
 *    - 尖耸峰峦 + 宋画平顶矾头台地 + 陡峭绝壁断崖，环抱澄碧大江与六大胜境。
 * 2. 【精准水系河道与虹桥水巷】：
 *    - 蜿蜒大江自西向东贯穿桃溪、观景崖、江村，并分流穿过千步虹桥拱底汇入归海大泽，
 *      确保乌篷画舫可全程水上巡游、从千步虹桥桥洞下穿行！
 * 3. 【六大胜境贴地台基】：
 *    - 孤刹悬云 (64, -25) 建于真实 26.5m 高崖绝顶，绝无悬空；
 *    - 悬瀑幽涧 (-18, -36) 嵌于双峰绝壁深潭之间；
 *    - 水心高阁 (88, -8) 坐落于烟波大泽浅洲之上。
 * 4. 【三矾九染矿物山体着色器 (Song Mineral Mountain Shader)】：
 *    - 实时响应四时色温 (春/夏/秋/冬) 与昼夜平滑插值 (uNightMix / uFogColor)，彻底杜绝割裂。
 */

import * as THREE from 'three';

export const WATER_LEVEL = 1.05;

function smoothstepJS(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// 快速确定性二维值噪声（用于构造真 3D 宋画群峰）
function hash2(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uz = fz * fz * (3.0 - 2.0 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz * (1.0 - ux) + (d - b) * ux * uz;
}

// 宋画脊状峻峰噪声 (Ridged Multifractal - 呈现王希孟峰峦耸翠、主峰刺天之骨法)
function ridgedPeakFbm(x, z, octaves = 4) {
  let sum = 0;
  let amp = 0.55;
  let freq = 1.0;
  let weight = 1.0;
  for (let i = 0; i < octaves; i++) {
    const n = noise2D(x * freq, z * freq);
    let signal = 1.0 - Math.abs(2.0 * n - 1.0);
    signal = signal * signal * weight;
    weight = Math.max(0.15, Math.min(1.0, signal * 1.65));
    sum += signal * amp;
    freq *= 2.08;
    amp *= 0.48;
  }
  return sum;
}

/**
 * 大江主河道中心线 Z(x)
 * 桃溪浅滩 (-45) -> 观景台前 (-20) -> 江村前 (10) -> 虹桥水巷 (36) -> 水心大泽 (88)
 */
export function getRiverCenterZ(x) {
  return 2.5 + Math.sin(x * 0.024) * 9.5 + Math.cos(x * 0.013 + 0.6) * 4.0;
}

/**
 * 预定义真 3D 宋画名山主峰谱（环绕画境，远近层叠，构成“高远/深远/平远”三远空间）
 */
const HERO_PEAKS = [
  // 北岸中景核心主峰群（直面舒啸石台与虹桥，气势恢宏）
  { x: -34, z: -56, h: 46, rx: 24, rz: 19, ridge: 1.25 },
  { x: -18, z: -52, h: 38, rx: 17, rz: 14, ridge: 1.35 }, // 悬瀑幽涧绝壁主崖
  { x: 4,   z: -62, h: 58, rx: 28, rz: 22, ridge: 1.30 }, // 画卷第一主峰·崇山耸翠
  { x: 32,  z: -66, h: 52, rx: 26, rz: 20, ridge: 1.25 },
  { x: 64,  z: -25, h: 28, rx: 16, rz: 15, ridge: 0.90, flatTop: 26.2 }, // 卷五·孤刹悬云真实岩峰！
  { x: 76,  z: -56, h: 54, rx: 25, rz: 22, ridge: 1.30 },
  { x: 112, z: -64, h: 64, rx: 32, rz: 26, ridge: 1.28 },

  // 西翼群峰（桃溪西侧屏障）
  { x: -88, z: -32, h: 52, rx: 28, rz: 26, ridge: 1.20 },
  { x: -96, z: 22,  h: 40, rx: 26, rz: 24, ridge: 1.15 },
  { x: -78, z: 72,  h: 36, rx: 26, rz: 24, ridge: 1.10 },

  // 东翼群峰（大泽远岸屏风）
  { x: 138, z: -18, h: 48, rx: 28, rz: 26, ridge: 1.20 },
  { x: 132, z: 42,  h: 42, rx: 26, rz: 26, ridge: 1.15 },

  // 深远北天际千峰叠嶂（取代旧 2D 弧幕的真 3D 远山连峰）
  { x: -120, z: -118, h: 78, rx: 46, rz: 36, ridge: 1.35 },
  { x: -55,  z: -126, h: 92, rx: 52, rz: 38, ridge: 1.40 },
  { x: 18,   z: -134, h: 98, rx: 56, rz: 40, ridge: 1.42 },
  { x: 92,   z: -124, h: 86, rx: 50, rz: 36, ridge: 1.38 },
  { x: 158,  z: -108, h: 76, rx: 45, rz: 36, ridge: 1.30 },

  // 南侧远丘（闭合画境后景，避免回头看空虚）
  { x: -24, z: 108, h: 42, rx: 38, rz: 28, ridge: 1.10 },
  { x: 52,  z: 102, h: 46, rx: 40, rz: 28, ridge: 1.15 },
  { x: 112, z: 96,  h: 38, rx: 34, rz: 26, ridge: 1.10 }
];

/**
 * 精确计算北宋青绿山水真 3D 高程
 */
export function calculateSongTerrainHeight(x, z) {
  // 1. 基础缓坡丘陵起伏
  let y = 1.6 + (noise2D(x * 0.025, z * 0.025) - 0.5) * 2.2;

  // 2. 叠加真 3D 宋画峻峰群（带斧劈脊线与宋画矾头阶梯）
  let peakAdd = 0;
  for (let i = 0; i < HERO_PEAKS.length; i++) {
    const pk = HERO_PEAKS[i];
    const dx = (x - pk.x) / pk.rx;
    const dz = (z - pk.z) / pk.rz;
    const d2 = dx * dx + dz * dz;
    if (d2 < 3.6) {
      const falloff = Math.exp(-d2 * 1.12);
      const ridgeDetail = ridgedPeakFbm(x * 0.042 + i * 3.1, z * 0.042 - i * 2.7, 3);
      let h = pk.h * falloff * (0.68 + ridgeDetail * 0.52 * pk.ridge);
      // 孤刹悬云顶面整平为古寺青石崖台
      if (pk.flatTop && d2 < 0.42) {
        const platT = smoothstepJS(0.42, 0.14, d2);
        h = h * (1 - platT) + pk.flatTop * platT;
      }
      if (h > peakAdd) {
        peakAdd = peakAdd + (h - peakAdd) * 0.85;
      } else {
        peakAdd += h * 0.18;
      }
    }
  }
  y += peakAdd;

  // 3. 卷五孤刹悬云东侧缓坡山径 (方便漫步登临孤刹，也可直接传送)
  // 从 (49, -15) 桥东岸婉转攀升至 (64, -25) 崖顶
  {
    const dTemple = Math.hypot(x - 64, z - (-25));
    if (dTemple < 7.5) {
      const flat = smoothstepJS(7.5, 4.2, dTemple);
      y = y * (1 - flat) + 26.2 * flat;
    }
  }

  // 4. 出生高台：舒啸临风矶 (x ≈ -22, z ≈ 35)
  {
    const distOverlook = Math.hypot(x - (-22), z - 35);
    if (distOverlook < 16) {
      const flat = smoothstepJS(16, 6.2, distOverlook);
      let targetH = 11.2;
      if (z < 31.8) {
        const drop = Math.max(0.15, (z - 24.5) / 7.3);
        targetH *= drop;
      }
      y = y * (1 - flat) + Math.max(y, targetH) * flat;
    }
  }

  // 5. 胜境一 · 桃溪浅滩温润渚岸 (x: -45, z: 28)
  {
    const dPeach = Math.hypot(x - (-45), z - 28);
    if (dPeach < 18) {
      const t = smoothstepJS(18, 6, dPeach);
      y = y * (1 - t) + 1.85 * t;
    }
  }

  // 6. 胜境二 · 悬瀑幽涧深潭 (x: -18, z: -36)
  {
    const dFallPool = Math.hypot(x - (-18), z - (-34));
    if (dFallPool < 12) {
      const t = smoothstepJS(12, 5, dFallPool);
      // 潭北(z < -39)保持绝壁高崖让瀑布倾泻，潭心与潭南(z > -38)平滑压低为清潭浅滩
      if (z > -38.5) {
        y = y * (1 - t) + 1.15 * t;
      }
    }
  }

  // 7. 胜境三 · 麦陇晚烟梯田缓坡 (x: 12, z: 42)
  {
    const dPaddy = Math.hypot(x - 12, z - 42);
    if (dPaddy < 20) {
      const t = smoothstepJS(20, 8, dPaddy);
      y = y * (1 - t) + 2.6 * t;
    }
  }

  // 8. 山脚江村平缓台地 (x ≈ 11, z ≈ -20)
  {
    const dVillage = Math.hypot((x - 11) / 14, (z - (-20.5)) / 7);
    if (dVillage < 1.4) {
      const t = smoothstepJS(1.4, 0.55, dVillage);
      y = y * (1 - t) + 2.35 * t;
    }
  }

  // 9. 千步虹桥西/东桥头矶台 (x=22 & x=49, z=-15)
  {
    const dW = Math.hypot(x - 21.5, z - (-15));
    if (dW < 10.5) {
      const t = smoothstepJS(10.5, 4.5, dW);
      y = y * (1 - t) + 5.2 * t;
    }
    const dE = Math.hypot(x - 49.5, z - (-15));
    if (dE < 10.5) {
      const t = smoothstepJS(10.5, 4.5, dE);
      y = y * (1 - t) + 5.2 * t;
    }
  }

  // 10. 澄碧大江主河道雕刻 (深切至水下 -1.4m，保证河水真实深度与通航)
  {
    const riverZ = getRiverCenterZ(x);
    const rDist = Math.abs(z - riverZ);
    // 东侧大泽 (x > 64) 河面骤然开阔成浩渺烟波湖面
    const lakeWiden = smoothstepJS(56, 86, x) * 26.0;
    const halfWidth = 14.5 + lakeWiden;

    if (rDist < halfWidth + 7.0) {
      const carve = smoothstepJS(halfWidth + 7.0, halfWidth * 0.48, rDist);
      // 保留江村与观景台一侧的岸坡自然感
      y = y * (1 - carve) + (-1.35) * carve;
    }
  }

  // 11. 虹桥穿拱水道（自大江向北穿过 x=36, z=-15 虹桥拱底，连通东侧大泽！）
  {
    const dUnderBridgeX = Math.abs(x - 36.0);
    if (dUnderBridgeX < 10.5 && z < 8.0 && z > -32.0) {
      const chanCarve = smoothstepJS(10.5, 4.8, dUnderBridgeX)
        * smoothstepJS(-32.0, -24.0, z)
        * smoothstepJS(8.0, 2.0, z);
      y = y * (1 - chanCarve) + (-1.45) * chanCarve;
    }
  }

  // 12. 卷六 · 水心高阁江心孤洲 (x: 88, z: -8) - 四面环水的青石平洲
  {
    const dIslet = Math.hypot((x - 88) / 14, (z - (-8)) / 11);
    if (dIslet < 1.3) {
      const t = smoothstepJS(1.3, 0.55, dIslet);
      y = y * (1 - t) + 1.48 * t;
    }
  }

  return Math.max(-2.2, y);
}

/**
 * 生成可漫游的乌篷船巡游闭环/往返水路样条线 (Cruise River Spline)
 * 路线：桃溪渡口 -> 掠过舒啸石台下 -> 仰望悬瀑湾 -> 经过江村渔火 -> 穿过千步虹桥拱底！ -> 烟波绕水心高阁 -> 折返
 */
export function createRiverCruiseCurve() {
  const pts = [
    new THREE.Vector3(-42, WATER_LEVEL, 12.5),  // 0. 桃溪浅滩渡口
    new THREE.Vector3(-26, WATER_LEVEL, 11.0),  // 1. 舒啸绝壁之下
    new THREE.Vector3(-12, WATER_LEVEL, 3.0),   // 2. 远眺悬瀑幽涧
    new THREE.Vector3(6,   WATER_LEVEL, -2.5),  // 3. 山脚江村岸边
    new THREE.Vector3(24,  WATER_LEVEL, -4.0),  // 4. 渐近千步虹桥
    new THREE.Vector3(36,  WATER_LEVEL, -6.5),  // 5. 对准虹桥中拱
    new THREE.Vector3(36,  WATER_LEVEL, -15.0), // 6. 穿行千步虹桥拱底（高光时刻！）
    new THREE.Vector3(39,  WATER_LEVEL, -23.0), // 7. 穿过桥北回望危桥
    new THREE.Vector3(56,  WATER_LEVEL, -12.0), // 8. 仰望孤刹悬云奇峰
    new THREE.Vector3(73,  WATER_LEVEL, -6.5),  // 9. 步入万壑归海大泽
    new THREE.Vector3(82,  WATER_LEVEL, 6.0),   // 10. 绕行水心高阁南侧
    new THREE.Vector3(102, WATER_LEVEL, -8.0),  // 11. 水心高阁东望烟波
    new THREE.Vector3(86,  WATER_LEVEL, -22.0), // 12. 绕过水心高阁北侧
    new THREE.Vector3(62,  WATER_LEVEL, 8.0),   // 13. 南岸大泽返航
    new THREE.Vector3(20,  WATER_LEVEL, 15.0),  // 14. 麦陇北岸烟波
    new THREE.Vector3(-18, WATER_LEVEL, 17.0)   // 15. 回归桃溪清流
  ];
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.45);
}

/**
 * 构建真 3D 北宋院体青绿山峦网格与三矾九染着色器
 */
export function buildSongTerrainMesh(masterPaintingTex) {
  const width = 440;
  const depth = 360;
  const segX = 220;
  const segZ = 180;

  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, calculateSongTerrainHeight(x, z));
  }
  geo.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMasterTex: { value: masterPaintingTex },
      uSunDir: { value: new THREE.Vector3(65, 115, 80).normalize() },
      uSunColor: { value: new THREE.Color(0xFFF2D6) },
      uFogColor: { value: new THREE.Color(0x8E7D5B) },
      uNightMix: { value: 0.0 },
      uSeasonTint: { value: new THREE.Color(1.0, 1.0, 1.0) },
      uSnowAmount: { value: 0.0 },
      uTime: { value: 0.0 }
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
        vNormal = normalize(mat3(modelMatrix) * normal);
        vSlope = clamp(1.0 - vNormal.y, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMasterTex;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uFogColor;
      uniform float uNightMix;
      uniform vec3 uSeasonTint;
      uniform float uSnowAmount;
      uniform float uTime;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElevation;
      varying float vSlope;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        float h = vElevation;
        float slope = vSlope;

        // 1. 【王希孟三矾九染 · 北宋矿物重彩阶梯】
        vec3 cWetBed = vec3(0.32, 0.34, 0.25); // 河底浸水暗石
        vec3 cSand   = vec3(0.82, 0.72, 0.50); // 宣和古绢泥金渚岸
        vec3 cOchre  = vec3(0.66, 0.46, 0.26); // 山麓温润赭石
        vec3 cGreen1 = vec3(0.14, 0.44, 0.31); // 头绿深孔雀石
        vec3 cGreen2 = vec3(0.12, 0.58, 0.40); // 二绿明润石绿
        vec3 cBlue1  = vec3(0.11, 0.38, 0.58); // 蓝铜矿石青
        vec3 cBlue2  = vec3(0.13, 0.50, 0.70); // 峰巅霁青
        vec3 cSummit = vec3(0.18, 0.62, 0.76); // 极顶天青

        vec3 mineral = cWetBed;
        if (h < 1.15) {
          mineral = mix(cWetBed, cSand, smoothstep(0.2, 1.15, h));
        } else if (h < 3.2) {
          mineral = mix(cSand, cOchre, smoothstep(1.15, 3.2, h));
        } else if (h < 10.0) {
          mineral = mix(cOchre, cGreen1, smoothstep(3.2, 10.0, h));
        } else if (h < 22.0) {
          mineral = mix(cGreen1, cGreen2, smoothstep(10.0, 22.0, h));
        } else if (h < 38.0) {
          mineral = mix(cGreen2, cBlue1, smoothstep(22.0, 38.0, h));
        } else if (h < 58.0) {
          mineral = mix(cBlue1, cBlue2, smoothstep(38.0, 58.0, h));
        } else {
          mineral = mix(cBlue2, cSummit, smoothstep(58.0, 82.0, h));
        }

        // 2. 【斧劈皴与披麻皴岩骨纹理】(Song Axe-Cut Cun)
        float nLarge = vnoise(vWorldPos.xz * 0.09);
        float cunV = sin(vWorldPos.y * 2.6 + nLarge * 5.2 + vWorldPos.x * 0.45);
        float cunFine = vnoise(vec2(vWorldPos.x * 0.32 + vWorldPos.z * 0.32, vWorldPos.y * 1.4));
        float cunMask = clamp(cunV * 0.4 + cunFine * 0.6, 0.0, 1.0);

        vec3 cliffOchre = mix(vec3(0.46, 0.34, 0.21), vec3(0.14, 0.28, 0.26), smoothstep(10.0, 36.0, h));
        vec3 cliffInk   = vec3(0.11, 0.14, 0.13);
        vec3 cliffCol   = mix(cliffOchre, cliffInk, smoothstep(0.55, 0.92, slope) * 0.65);
        cliffCol        = mix(cliffCol, mineral * 0.85, cunMask * 0.38);

        float cliffBlend = smoothstep(0.22, 0.62, slope);
        vec3 surface = mix(mineral, cliffCol, cliffBlend * 0.72);

        // 3. 融合故宫真迹笔触明暗韵律（轻柔叠加，保留真 3D 体积感）
        vec2 paintUv = vec2(
          clamp((vWorldPos.x + 190.0) / 380.0, 0.02, 0.98),
          clamp(1.0 - (h / 78.0), 0.05, 0.95)
        );
        vec3 paintCol = texture2D(uMasterTex, paintUv).rgb;
        float paintLuma = dot(paintCol, vec3(0.299, 0.587, 0.114));
        surface *= (0.86 + paintLuma * 0.28);
        surface = mix(surface, paintCol, 0.14);

        // 4. 四季色相润色 & 寒冬峰顶积雪 (uSeasonTint & uSnowAmount)
        surface *= uSeasonTint;
        if (uSnowAmount > 0.01) {
          float snowMask = smoothstep(8.0, 26.0, h) * (1.0 - smoothstep(0.35, 0.68, slope));
          surface = mix(surface, vec3(0.92, 0.95, 0.98), snowMask * uSnowAmount * 0.82);
        }

        // 5. 泥金勾边与云母矿物微晶折光 (Gilded Ridges & Mineral Sparkle)
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float NdotL = max(0.0, dot(vNormal, uSunDir));
        float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
        float ridgeGlint = pow(rim, 3.0) * (NdotL * 0.5 + 0.5);
        vec3 goldEdge = vec3(0.98, 0.84, 0.45) * ridgeGlint * smoothstep(10.0, 52.0, h) * 0.52 * (1.0 - uNightMix * 0.7);

        // 细碎矿物微晶闪光（极克制，仅在迎光峰面微微闪耀）
        float sparkle = step(0.965, hash(floor(vWorldPos.xz * 2.4 + floor(vWorldPos.y * 2.0)))) * NdotL;
        surface += goldEdge + vec3(0.95, 0.86, 0.55) * sparkle * 0.16 * (1.0 - uNightMix * 0.8);

        // 6. 采光（平滑昼夜过渡）
        vec3 dayLight = uSunColor * (NdotL * 0.62 + 0.38);
        vec3 nightLight = vec3(0.22, 0.34, 0.48) * (NdotL * 0.5 + 0.42);
        vec3 lighting = mix(dayLight, nightLight, uNightMix);
        vec3 finalColor = surface * lighting;

        // 7. 三远法宣和留白云雾（谷底留白烟岚 + 远峰深远渐变，100% 同步 uFogColor）
        float dist = length(cameraPosition - vWorldPos);
        float summitClarity = smoothstep(18.0, 58.0, h);
        float distFog = (1.0 - exp(-dist * 0.0042)) * (1.0 - summitClarity * 0.48);
        // 宋画经典“山腰云带”：在海拔 4m~15m 的远山脚自然飘荡一缕空濛留白
        float cloudBand = smoothstep(2.0, 9.0, h) * (1.0 - smoothstep(12.0, 24.0, h)) * smoothstep(42.0, 120.0, dist);
        float fogFactor = clamp(distFog + cloudBand * 0.38, 0.0, 0.90);

        finalColor = mix(finalColor, uFogColor, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'song_true_3d_terrain';
  return { mesh, material };
}
