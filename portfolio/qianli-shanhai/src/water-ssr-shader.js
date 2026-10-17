// src/water-ssr-shader.js
/**
 * 北宋王希孟千里江山 · 屏幕空间远山倒影 (Screen-Space Water Reflection)
 * 融合宋代马远《水图》网巾水纹与时雨同心圆涟漪
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
      uFogColor: { value: new THREE.Color('#CDBF9C') }
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec4 vScreenPos;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 pos = position;
        // 柔和的江波呼吸
        pos.y += sin(pos.x * 0.35 + uTime * 1.1) * 0.05 + cos(pos.z * 0.4 + uTime * 0.85) * 0.04;
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

      varying vec4 vScreenPos;
      varying vec3 vWorldPos;
      varying vec2 vUv;

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

        // 2. 水波法线横向推演扰动（模拟江水横向拉伸倒影）
        vec2 worldXZ = vWorldPos.xz * 0.35;
        float waveDistortX = sin(worldXZ.y * 6.0 + uTime * 2.2) * 0.018
                           + cos(worldXZ.x * 4.0 - uTime * 1.5) * 0.008;
        float waveDistortY = cos(worldXZ.y * 8.0 + uTime * 1.8) * 0.006;

        // 镜像翻转 Y 轴采样远山与画幕倒影
        vec2 reflUV = vec2(
          clamp(screenUV.x + waveDistortX, 0.01, 0.99),
          clamp(1.0 - screenUV.y + waveDistortY, 0.01, 0.99)
        );

        // 3. 获取倒影颜色（若传入了 Planar Reflection RT 则直接采样，否则用程序化青绿山影兜底）
        vec3 reflColor;
        if (uHasReflectionTex > 0.5) {
          reflColor = texture2D(tReflection, reflUV).rgb;
        } else {
          // 免额外 RT 开销的屏幕空间伪山影：模拟连绵石青石绿群峰倒影
          float mSilhouette = sin(vWorldPos.x * 0.035 + waveDistortX * 8.0) * 0.5
                            + cos(vWorldPos.x * 0.09 - waveDistortX * 12.0) * 0.5;
          float depthFade = clamp((vWorldPos.z + 40.0) / 80.0, 0.0, 1.0);
          vec3 dayRefl = mix(uWaterSilk, vec3(0.11, 0.29, 0.38), smoothstep(-0.3, 0.5, mSilhouette + depthFade * 0.3));
          vec3 nightRefl = mix(vec3(0.04, 0.09, 0.15), vec3(0.12, 0.25, 0.36), smoothstep(-0.2, 0.6, mSilhouette));
          reflColor = mix(dayRefl, nightRefl, uNightMix);
        }

        // 4. Fresnel 菲涅尔效应（远处看倒影清澈，低头近看显露苍绿水底）
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(viewDir.y, 0.0), 2.6);

        vec3 baseWater = mix(uWaterJade, vec3(0.05, 0.11, 0.18), uNightMix);
        vec3 col = mix(baseWater, reflColor * 0.88, clamp(fresnel * 0.85 + 0.15, 0.0, 1.0));

        // 5. 叠加宋画网巾水纹金线与时雨涟漪
        float inkLine = songWavePattern(worldXZ, uTime);
        float rainRipple = rainRings(vWorldPos.xz * 0.6, uTime) * uRainIntensity;
        float totalLine = clamp(inkLine + rainRipple * 1.4, 0.0, 1.0);

        vec3 lineCol = mix(vec3(0.86, 0.82, 0.68), uGoldRipple, uNightMix * 0.85 + 0.15);
        col = mix(col, lineCol, totalLine * (0.26 + 0.45 * uNightMix));

        // 6. 宣和云雾远景消隐
        float dist = length(cameraPosition - vWorldPos);
        float fog = smoothstep(28.0, 140.0, dist);
        col = mix(col, uFogColor, fog);

        gl_FragColor = vec4(col, 0.93);
      }
    `
  });
}
