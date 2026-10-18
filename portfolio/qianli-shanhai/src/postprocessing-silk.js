// src/postprocessing-silk.js
import * as THREE from 'three';

export const QianliSilkPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },       // 需传入 WebGLRenderTarget 的 depthTexture
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uTime: { value: 0 },
    uNightMix: { value: 0.0 },     // 0: 白昼宣和暖绢, 1: 幽夜石青冷绢
    uCameraNear: { value: 0.5 },
    uCameraFar: { value: 300.0 },
    uInkStrength: { value: 0.65 }, // 工笔勾线强度
    uSilkGrain: { value: 0.14 }    // 古绢经纬织物颗粒度
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uNightMix;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uInkStrength;
    uniform float uSilkGrain;
    varying vec2 vUv;

    // 线性深度转换
    float getLinearDepth(vec2 coord) {
      float fragCoordZ = texture2D(tDepth, coord).x;
      float viewZ = perspectiveDepthToViewZ(fragCoordZ, uCameraNear, uCameraFar);
      return viewZToOrthographicDepth(viewZ, uCameraNear, uCameraFar);
    }

    // 伪随机与纸张纤维噪声
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }

    void main() {
      vec2 texel = 1.0 / uResolution;

      // 1. 宣和古绢微幅水波呼吸畸变（极轻微手卷气韵）
      vec2 paperWave = vec2(
        noise(vUv * 12.0 + uTime * 0.08) - 0.5,
        noise(vUv * 12.0 - uTime * 0.08) - 0.5
      ) * 0.0008;
      vec2 uv = clamp(vUv + paperWave, 0.001, 0.999);

      vec4 rawColor = texture2D(tDiffuse, uv);

      // 2. 基于深度与亮度的双通道 Sobel 工笔铁线描边缘检测
      // 加入毛笔粗细顿挫调制 (Brush Thickness Modulation)
      float brushMod = 0.7 + 0.6 * noise(uv * 45.0);
      vec2 offset = texel * brushMod * 1.15;

      float d00 = getLinearDepth(uv + vec2(-offset.x, -offset.y));
      float d10 = getLinearDepth(uv + vec2( 0.0,      -offset.y));
      float d20 = getLinearDepth(uv + vec2( offset.x, -offset.y));
      float d01 = getLinearDepth(uv + vec2(-offset.x,  0.0));
      float d21 = getLinearDepth(uv + vec2( offset.x,  0.0));
      float d02 = getLinearDepth(uv + vec2(-offset.x,  offset.y));
      float d12 = getLinearDepth(uv + vec2( 0.0,       offset.y));
      float d22 = getLinearDepth(uv + vec2( offset.x,  offset.y));

      float gx = -d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22;
      float gy = -d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22;
      float depthEdge = sqrt(gx * gx + gy * gy);

      // 远景边缘自动淡出（符合宋画远山无皴无廓的“平远”法则）
      float centerDepth = getLinearDepth(uv);
      float distanceFade = 1.0 - smoothstep(0.15, 0.75, centerDepth);
      float inkOutline = smoothstep(0.004, 0.018, depthEdge) * distanceFade * uInkStrength;

      // 3. 双丝古绢经纬织物机理 (Silk Weave Cross-hatch)
      vec2 pixelPos = uv * uResolution;
      float warp = sin(pixelPos.x * 1.6) * 0.5 + 0.5; // 经线
      float weft = sin(pixelPos.y * 1.6) * 0.5 + 0.5; // 纬线
      float silkWeave = (warp * weft) - 0.25;
      float ageStain = noise(uv * 6.5) * 0.06; // 千年古卷局部包浆

      // 4. 宋画矿物色阶重映射（压制数码高饱和，转向古雅石色）
      vec3 col = rawColor.rgb;
      vec3 inkColor = mix(vec3(0.14, 0.11, 0.09), vec3(0.04, 0.07, 0.12), uNightMix); // 焦墨线条色
      col = mix(col, inkColor, inkOutline);

      // 叠加绢本纹理与包浆
      col += silkWeave * uSilkGrain * (1.0 - 0.5 * uNightMix);
      col -= ageStain * (1.0 - uNightMix);

      // 5. 手卷上下天头地脚与四周宣和暗角 (Scroll Vignette)
      float vig = smoothstep(0.95, 0.28, length((uv - 0.5) * vec2(1.15, 1.35)));
      vec3 borderTint = mix(vec3(0.42, 0.35, 0.23), vec3(0.05, 0.09, 0.14), uNightMix);
      col = mix(borderTint * col, col, vig);

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

// Grain shared with the scroll shader. The depth-edge pass above stays
// available, but the painted scroll does not use it: a flat painting has no
// useful depth, and a reversed smoothstep is intentionally not copied.
export const SCROLL_SILK_GLSL = /* glsl */`
float qHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float qNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(qHash(i), qHash(i + vec2(1.0, 0.0)), f.x),
             mix(qHash(i + vec2(0.0, 1.0)), qHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 qSilk(vec3 col, vec2 fragCoord, vec2 uv, float time) {
  float warp = sin(fragCoord.x * 1.6) * 0.5 + 0.5;
  float weft = sin(fragCoord.y * 1.6) * 0.5 + 0.5;
  float silkWeave = (warp * weft) - 0.25;
  float ageStain = qNoise(uv * 6.5 + time * 0.01) * 0.045;
  col += silkWeave * 0.11;
  col -= ageStain;
  return col;
}
`;