// src/water-ssr-shader.js
/**
 * 《千里江山 · 借笔还魂》北宋澄碧大泽水体着色器 (Song Dynasty Soft-Reflection River Water)
 * 借鉴并融合自开源项目《入画 · WITHIN》(fatasia/within, MIT License)
 * 
 * 核心技术与艺术亮点：
 * 1. 【5-Tap 墨韵软倒影 (Soft Reflection)】：
 *    - 五点高斯级联采样，化解硬切倒影边缘，完美复刻水墨在宣和绢帛上的洇化与漫射。
 * 2. 【宋代马远《水图》网巾水纹 (Song Wave Net Pattern)】：
 *    - 细密交织的程序化工笔勾线，配合时雨同心圆涟漪，重现北宋院体水法。
 * 3. 【微澜毛细水波与法线微扰 (Capillary Wavefield)】：
 *    - 厘米级非几何形变微波，计算视线菲涅尔与水面微透光。
 * 4. 【朝晖夕阴泥金耀斑 (Directional Sheen)】：
 *    - 依据北宋画卷顺光与侧光方向，在江面荡漾出微碎泥金波光。
 */
import * as THREE from 'three';

export function createSongWaterSSRMaterial(reflectionRenderTargetTexture = null) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uNightMix: { value: 0.0 },
      uRainIntensity: { value: 0.0 }, // 时雨模式激起涟漪圆环
      tReflection: { value: reflectionRenderTargetTexture }, // 平面镜像 RT 或场景抓屏纹理
      uHasReflectionTex: { value: reflectionRenderTargetTexture ? 1.0 : 0.0 },
      uWaterJade: { value: new THREE.Color('#34584C') },     // 苍绿江水底色
      uWaterSilk: { value: new THREE.Color('#8A9B7E') },     // 近岸浅滩古绢色
      uGoldRipple: { value: new THREE.Color('#DFB65B') },    // 泥金波光/夜间渔火倒影
      uFogColor: { value: new THREE.Color('#CDBF9C') },
      uTexel: { value: new THREE.Vector2(1.0 / 1024.0, 1.0 / 1024.0) }
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec4 vScreenPos;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 pos = position;
        // 柔和的江波呼吸 (Gentle breathing wave)
        pos.y += sin(pos.x * 0.35 + uTime * 1.1) * 0.04 + cos(pos.z * 0.4 + uTime * 0.85) * 0.035;
        vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPosition.xyz;
        vScreenPos = projectionMatrix * viewMatrix * worldPosition;
        gl_Position = vScreenPos;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uNightMix;
      uniform float uRainIntensity;
      uniform sampler2D tReflection;
      uniform float uHasReflectionTex;
      uniform vec3 uWaterJade;
      uniform vec3 uWaterSilk;
      uniform vec3 uGoldRipple;
      uniform vec3 uFogColor;
      uniform vec2 uTexel;

      varying vec4 vScreenPos;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      // 连续柏林平滑噪声 (Continuous smooth river noise)
      float riverNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        vec4 corners = fract(sin(vec4(
          dot(cell, vec2(127.1, 311.7)),
          dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7)),
          dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7)),
          dot(cell + vec2(1.0, 1.0), vec2(127.1, 311.7))
        )) * 43758.5453);
        return mix(mix(corners.x, corners.y, f.x), mix(corners.z, corners.w, f.x), f.y);
      }

      // 五点墨韵软倒影采样 (5-Tap Soft Reflection Kernel)
      vec3 sampleSoftReflection(sampler2D tex, vec2 uv, float spread) {
        vec2 offset = uTexel * spread;
        vec3 col = texture2D(tex, uv).rgb * 0.40;
        col += texture2D(tex, uv + vec2(offset.x, offset.y)).rgb * 0.15;
        col += texture2D(tex, uv + vec2(-offset.x, offset.y)).rgb * 0.15;
        col += texture2D(tex, uv + vec2(offset.x, -offset.y)).rgb * 0.15;
        col += texture2D(tex, uv - offset).rgb * 0.15;
        return col;
      }

      // 宋代《水图》网巾纹（交织水波）函数
      float songWavePattern(vec2 p, float t) {
        float w1 = sin(p.x * 3.2 + sin(p.y * 2.1 + t * 1.3));
        float w2 = cos(p.y * 2.8 - cos(p.x * 1.9 - t * 0.9));
        float net = abs(w1 + w2) * 0.5;
        return smoothstep(0.84, 0.96, net); // 提取纤细的勾水线条
      }

      // 时雨涟漪（同心圆水圈）
      float rainRings(vec2 p, float t) {
        vec2 cell = floor(p);
        vec2 fracP = fract(p) - 0.5;
        float seed = fract(sin(dot(cell, vec2(41.2, 89.5))) * 14921.3);
        float life = fract(t * 0.85 + seed);
        float dist = length(fracP);
        float ring = (1.0 - smoothstep(0.0, 0.04, abs(dist - life * 0.45))) * (1.0 - life);
        return ring;
      }

      void main() {
        // 1. 计算屏幕空间归一化坐标 (NDC -> UV)
        vec2 screenUV = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;

        // 2. 厘米级微澜毛细水波与法线微扰 (Capillary Ripple Perturbation)
        vec2 worldXZ = vWorldPos.xz;
        float n = riverNoise(worldXZ * vec2(0.12, 0.22) + vec2(uTime * 0.02, -uTime * 0.015));
        float ripple = sin(worldXZ.x * 0.72 + worldXZ.y * 1.15 + n * 5.2 + uTime * 0.35);
        float crossRipple = sin(worldXZ.x * -0.45 + worldXZ.y * 0.88 - uTime * 0.22 + n * 3.1);
        vec3 normal = normalize(vec3(ripple * 0.018, 1.0, crossRipple * 0.014));

        // 水波扰动横向拉伸倒影
        float waveDistortX = normal.x * 0.035 + sin(worldXZ.y * 0.25 + uTime * 1.8) * 0.008;
        float waveDistortY = normal.z * 0.025;

        // 镜像翻转 Y 轴采样远山与画幕倒影
        vec2 reflUV = vec2(
          clamp(screenUV.x + waveDistortX, 0.01, 0.99),
          clamp(1.0 - screenUV.y + waveDistortY, 0.01, 0.99)
        );

        // 3. 获取软倒影颜色 (Soft Inky Reflection)
        vec3 reflColor;
        if (uHasReflectionTex > 0.5) {
          reflColor = sampleSoftReflection(tReflection, reflUV, 3.2);
        } else {
          // 免额外 RT 开销的屏幕空间伪山影：多频正弦叠加北宋重彩千峰
          float mSilhouette1 = sin(vWorldPos.x * 0.032 + waveDistortX * 8.0);
          float mSilhouette2 = cos(vWorldPos.x * 0.078 - waveDistortX * 12.0) * 0.6;
          float mSilhouette3 = sin(vWorldPos.x * 0.16 + uTime * 0.1) * 0.25;
          float mSilhouette = (mSilhouette1 + mSilhouette2 + mSilhouette3) * 0.55;
          
          float depthFade = clamp((vWorldPos.z + 40.0) / 85.0, 0.0, 1.0);
          vec3 peakBlueGreen = mix(vec3(0.08, 0.24, 0.35), vec3(0.12, 0.42, 0.38), smoothstep(-0.2, 0.6, mSilhouette));
          vec3 dayRefl = mix(uWaterSilk, peakBlueGreen, smoothstep(-0.35, 0.45, mSilhouette + depthFade * 0.35));
          vec3 nightRefl = mix(vec3(0.03, 0.07, 0.12), vec3(0.10, 0.22, 0.32), smoothstep(-0.2, 0.6, mSilhouette));
          reflColor = mix(dayRefl, nightRefl, uNightMix);
        }

        // 4. Fresnel 菲涅尔效应（远处看倒影清澈，低头近看显露苍绿水底）
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(viewDir.y, 0.0), 2.5);

        vec3 baseWater = mix(uWaterJade, vec3(0.04, 0.09, 0.15), uNightMix);
        vec3 col = mix(baseWater, reflColor * 0.88, clamp(fresnel * 0.85 + 0.18, 0.0, 1.0));

        // 5. 朝晖夕阴泥金耀斑 (Directional Sun/Moon Sheen)
        vec3 sunDir = normalize(vec3(0.45, 0.75, -0.48));
        vec3 halfVec = normalize(sunDir + viewDir);
        float spec = pow(max(0.0, dot(normal, halfVec)), 28.0);
        vec3 sheenCol = mix(uGoldRipple * 1.25, vec3(0.65, 0.85, 0.95), uNightMix * 0.7);
        col += sheenCol * spec * (0.35 + 0.25 * sin(uTime * 1.4 + worldXZ.x * 0.1));

        // 6. 叠加宋画网巾水纹金线与时雨涟漪
        float inkLine = songWavePattern(worldXZ * 0.35, uTime);
        float rainRipple = rainRings(worldXZ * 0.6, uTime) * uRainIntensity;
        float totalLine = clamp(inkLine + rainRipple * 1.4, 0.0, 1.0);

        vec3 lineCol = mix(vec3(0.86, 0.82, 0.68), uGoldRipple, uNightMix * 0.85 + 0.15);
        col = mix(col, lineCol, totalLine * (0.24 + 0.42 * uNightMix));

        // 7. 宣和古绢云雾远景消隐
        float dist = length(cameraPosition - vWorldPos);
        float fog = smoothstep(30.0, 150.0, dist);
        col = mix(col, uFogColor, fog);

        gl_FragColor = vec4(col, 0.94);
      }
    `
  });
}
