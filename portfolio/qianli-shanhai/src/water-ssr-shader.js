// src/water-ssr-shader.js
/**
 * 《千里江山 · 借笔还魂》北宋澄碧大泽真倒影水体着色器 (Song Dynasty Planar Soft-Reflection Water)
 * 借鉴并融合自开源项目《入画 · WITHIN》(fatasia/within, MIT License)
 * 
 * 核心特性：
 * 1. 【真实平面投影 + 5-Tap 墨韵软倒影 (Planar Soft Reflection)】：
 *    - 接收 SongRiverReflector 实时捕获的青绿山峰、千步虹桥、水心高阁与夜灯纹理，
 *      经五点高斯级联采样，在江面上洇化出如宣纸水墨般的柔美真倒影。
 * 2. 【厘米级毛细微波与宋代马远《水图》网巾金线】：
 *    - 微澜扰动倒影，配合时雨同心圆涟漪与航船尾迹光感。
 * 3. 【朝晖夕阴泥金耀斑 + 昼夜四季无缝雾效同步】：
 *    - 实时同步 uFogColor、uNightMix 与 uSeasonTint，彻底杜绝水面与山峦割裂。
 */
import * as THREE from 'three';

export function createSongWaterSSRMaterial(reflectionRenderTargetTexture = null, textureMatrix = null) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uNightMix: { value: 0.0 },
      uRainIntensity: { value: 0.0 },
      tReflection: { value: reflectionRenderTargetTexture },
      uTextureMatrix: { value: textureMatrix || new THREE.Matrix4() },
      uHasReflectionTex: { value: reflectionRenderTargetTexture ? 1.0 : 0.0 },
      uWaterJade: { value: new THREE.Color('#2E564B') },
      uWaterSilk: { value: new THREE.Color('#7C9174') },
      uGoldRipple: { value: new THREE.Color('#E3BB62') },
      uFogColor: { value: new THREE.Color('#8E7D5B') },
      uSeasonTint: { value: new THREE.Color(1.0, 1.0, 1.0) },
      uBoatPos: { value: new THREE.Vector3(0, -100, 0) }, // 用于绘制航船柔美水纹尾迹
      uTexel: { value: new THREE.Vector2(1.0 / 512.0, 1.0 / 512.0) }
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform mat4 uTextureMatrix;
      varying vec4 vReflCoord;
      varying vec4 vScreenPos;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 pos = position;
        // 极其轻柔的江面呼吸，不破坏平面倒影精度
        pos.y += sin(pos.x * 0.25 + uTime * 0.9) * 0.02 + cos(pos.z * 0.3 + uTime * 0.7) * 0.018;
        vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPosition.xyz;
        vReflCoord = uTextureMatrix * worldPosition;
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
      uniform vec3 uSeasonTint;
      uniform vec3 uBoatPos;
      uniform vec2 uTexel;

      varying vec4 vReflCoord;
      varying vec4 vScreenPos;
      varying vec3 vWorldPos;
      varying vec2 vUv;

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

      // 5-Tap 宣纸墨韵软倒影核 (Soft Reflection Blur)
      vec3 sampleSoftReflection(sampler2D tex, vec2 uv, float spread) {
        vec2 o = uTexel * spread;
        vec3 col = texture2D(tex, clamp(uv, 0.005, 0.995)).rgb * 0.40;
        col += texture2D(tex, clamp(uv + vec2( o.x,  o.y), 0.005, 0.995)).rgb * 0.15;
        col += texture2D(tex, clamp(uv + vec2(-o.x,  o.y), 0.005, 0.995)).rgb * 0.15;
        col += texture2D(tex, clamp(uv + vec2( o.x, -o.y), 0.005, 0.995)).rgb * 0.15;
        col += texture2D(tex, clamp(uv + vec2(-o.x, -o.y), 0.005, 0.995)).rgb * 0.15;
        return col;
      }

      // 宋代马远《水图》网巾水纹
      float songWavePattern(vec2 p, float t) {
        float w1 = sin(p.x * 2.8 + sin(p.y * 2.0 + t * 1.1));
        float w2 = cos(p.y * 2.5 - cos(p.x * 1.8 - t * 0.8));
        float net = abs(w1 + w2) * 0.5;
        return smoothstep(0.85, 0.96, net);
      }

      // 时雨同心圆涟漪
      float rainRings(vec2 p, float t) {
        vec2 cell = floor(p);
        vec2 fracP = fract(p) - 0.5;
        float seed = fract(sin(dot(cell, vec2(41.2, 89.5))) * 14921.3);
        float life = fract(t * 0.85 + seed);
        float dist = length(fracP);
        return (1.0 - smoothstep(0.0, 0.045, abs(dist - life * 0.45))) * (1.0 - life);
      }

      void main() {
        vec2 worldXZ = vWorldPos.xz;

        // 1. 厘米级毛细微波法线
        float n = riverNoise(worldXZ * vec2(0.14, 0.24) + vec2(uTime * 0.025, -uTime * 0.018));
        float ripple = sin(worldXZ.x * 0.72 + worldXZ.y * 1.12 + n * 5.0 + uTime * 0.4);
        float crossRipple = sin(worldXZ.x * -0.45 + worldXZ.y * 0.88 - uTime * 0.25 + n * 3.0);
        vec3 normal = normalize(vec3(ripple * 0.016, 1.0, crossRipple * 0.013));

        // 2. 真实平面镜像投影 UV + 水波微扰
        vec2 projUV = vReflCoord.xy / max(vReflCoord.w, 0.0001);
        vec2 reflUV = projUV + vec2(normal.x * 0.032, normal.z * 0.024);

        vec3 reflColor;
        if (uHasReflectionTex > 0.5 && vReflCoord.w > 0.0) {
          reflColor = sampleSoftReflection(tReflection, reflUV, 2.4);
        } else {
          // 安全兜底程序化青绿山影
          float mSil = sin(vWorldPos.x * 0.035) * 0.5 + cos(vWorldPos.x * 0.08) * 0.35;
          vec3 dayR = mix(uWaterSilk, vec3(0.10, 0.32, 0.38), smoothstep(-0.3, 0.5, mSil));
          vec3 nightR = mix(vec3(0.03, 0.07, 0.12), vec3(0.09, 0.20, 0.30), smoothstep(-0.2, 0.6, mSil));
          reflColor = mix(dayR, nightR, uNightMix);
        }

        // 3. Fresnel 菲涅尔混合：远处倒影如镜，近处透见翡翠江底
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(viewDir.y, 0.0), 2.3);
        vec3 baseWater = mix(uWaterJade * uSeasonTint, vec3(0.03, 0.08, 0.14), uNightMix);
        vec3 col = mix(baseWater, reflColor * 0.92, clamp(fresnel * 0.78 + 0.22, 0.0, 0.92));

        // 4. 朝晖夕阴泥金耀斑
        vec3 sunDir = normalize(vec3(0.45, 0.72, -0.45));
        vec3 halfVec = normalize(sunDir + viewDir);
        float spec = pow(max(0.0, dot(normal, halfVec)), 36.0);
        vec3 sheenCol = mix(uGoldRipple * 1.2, vec3(0.55, 0.76, 0.92), uNightMix * 0.72);
        col += sheenCol * spec * (0.32 + 0.18 * sin(uTime * 1.3 + worldXZ.x * 0.1));

        // 5. 画舫轻舟水波涟漪光晕 (Boat Wake Shimmer)
        float boatDist = length(worldXZ - uBoatPos.xz);
        float boatWake = (1.0 - smoothstep(1.2, 7.5, boatDist)) * smoothstep(0.6, 2.2, boatDist)
          * (0.5 + 0.5 * sin(boatDist * 3.8 - uTime * 4.5));
        col += mix(vec3(0.82, 0.80, 0.68), uGoldRipple, 0.4) * boatWake * 0.24;

        // 6. 宋代网巾水纹金线与时雨同心圆
        float inkLine = songWavePattern(worldXZ * 0.32, uTime);
        float rainRipple = rainRings(worldXZ * 0.55, uTime) * uRainIntensity;
        float totalLine = clamp(inkLine * 0.65 + rainRipple * 1.35, 0.0, 1.0);
        vec3 lineCol = mix(vec3(0.84, 0.80, 0.66), uGoldRipple, uNightMix * 0.85 + 0.15);
        col = mix(col, lineCol, totalLine * (0.20 + 0.35 * uNightMix));

        // 7. 宣和远水融雾（100% 同步 uFogColor）
        float dist = length(cameraPosition - vWorldPos);
        float fog = smoothstep(38.0, 210.0, dist);
        col = mix(col, uFogColor, fog * 0.90);

        gl_FragColor = vec4(col, 0.94);
      }
    `
  });
}
