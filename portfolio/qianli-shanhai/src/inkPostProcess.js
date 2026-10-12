/**
 * 《千里江山 · 借笔还魂》北宋工笔青绿水墨非真实感渲染管线
 * (Northern Song Blue-and-Green Ink Wash & Gongbi NPR Post-Processing Pipeline)
 * 
 * 核心技术原理（参考 GitHub 顶级开源 NPR 水墨项目与 OmarShehata WebGL Outlines）：
 * 1. 【工笔铁线淡墨勾勒 (Laplacian & Sobel Edge Detection)】：
 *    - 实时读取高精度深度缓冲（Depth Texture）与场景色彩缓冲（Color Texture）。
 *    - 基于反深度（Inverse Depth）计算 8 邻域拉普拉斯算子，精准提取山体绝壁、水榭飞檐、木拱虹桥与神兽轮廓。
 *    - 赋予中国画特有的“淡墨 / 焦墨铁线描”边缘，彻底消灭计算机 3D 粗糙几何体的塑料积木感。
 * 2. 【三矾九染阶梯矿物分染 (Cel / Toon Shading & Mineral Banding)】：
 *    - 剔除西方连续 PBR 光照的塑料高光，色调离散化为北宋名画原迹的阶梯色阶。
 *    - 阴影区沉降为蓝铜矿【深石青与绝顶玄青】，受光面转化为孔雀石【石绿与青碧】，高光区呈现矿物【泥金与温润赭石】。
 * 3. 【宣和古绢经纬织纹与微观纸理 (Imperial Silk Weave & Wash Grain)】：
 *    - 在屏幕空间渲染微观交错经纬织物肌理，使全屏 3D 犹如直接在真迹九百年古绢上流动呼吸。
 * 4. 【宋画三远法烟岚深远沉降 (Atmospheric Silk Mist)】：
 *    - 随深度梯度自然融入暖黄宣和绢底色（#EADDC1），实现“远山如黛、平远空濛”的东方意境。
 */

import * as THREE from 'three';

export class InkPostPipeline {
  constructor(renderer, scene, camera, width, height) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.width = width;
    this.height = height;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 1. 创建全分辨率场景离屏渲染靶 (带 DepthTexture)
    const targetW = Math.floor(this.width * this.dpr);
    const targetH = Math.floor(this.height * this.dpr);

    this.renderTarget = new THREE.WebGLRenderTarget(targetW, targetH, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false
    });

    this.renderTarget.depthTexture = new THREE.DepthTexture(targetW, targetH);
    this.renderTarget.depthTexture.format = THREE.DepthFormat;
    this.renderTarget.depthTexture.type = THREE.UnsignedIntType;

    // 2. 正交相机与全屏渲染 Quad
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene = new THREE.Scene();

    const quadGeo = new THREE.PlaneGeometry(2, 2);

    // 3. 北宋工笔青绿水墨主着色器
    this.inkMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tScene;
        uniform sampler2D tDepth;
        uniform vec2 uResolution;
        uniform float uNear;
        uniform float uFar;
        uniform float uTime;
        uniform float uInkStrength;
        uniform float uPaperGrain;

        varying vec2 vUv;

        // 灰度计算
        float luma(vec3 c) {
          return dot(c, vec3(0.299, 0.587, 0.114));
        }

        // 线性反深度（越近越大，便于边缘拉普拉斯计算）
        float invZ(vec2 uv) {
          float d = texture2D(tDepth, uv).r;
          return (uFar - d * (uFar - uNear)) / (uNear * uFar);
        }

        void main() {
          vec2 uv = vUv;
          vec2 o = 1.35 / uResolution;

          // 1. 采样中心与邻域深度，执行 8 邻域拉普拉斯边缘检测 (Laplacian Edge Detection)
          float w0 = invZ(uv);
          float n0 = invZ(uv + vec2(o.x, 0.0));
          float n1 = invZ(uv - vec2(o.x, 0.0));
          float n2 = invZ(uv + vec2(0.0, o.y));
          float n3 = invZ(uv - vec2(0.0, o.y));
          float n4 = invZ(uv + vec2(o.x, o.y));
          float n5 = invZ(uv - vec2(o.x, o.y));
          float n6 = invZ(uv + vec2(o.x, -o.y));
          float n7 = invZ(uv - vec2(o.x, -o.y));

          float lap = (n0 + n1 + n2 + n3 + n4 + n5 + n6 + n7 - 8.0 * w0) / (w0 * 2.0);
          float depthEdge = smoothstep(0.035, 0.18, abs(lap));

          // 2. 采样颜色邻域，计算色彩色差边缘 (Color Sobel Edges)
          vec3 cCenter = texture2D(tScene, uv).rgb;
          vec3 cRight  = texture2D(tScene, uv + vec2(o.x, 0.0)).rgb;
          vec3 cTop    = texture2D(tScene, uv + vec2(0.0, o.y)).rgb;
          float colorDiff = length(cCenter - cRight) + length(cCenter - cTop);
          float colorEdge = smoothstep(0.16, 0.42, colorDiff);

          // 3. 综合工笔墨线强度并随远景烟岚平滑淡化
          float dist = 1.0 / max(w0, 1e-4);
          float edgeFade = 1.0 - smoothstep(100.0, 520.0, dist);
          float inkLine = clamp(depthEdge * 1.25 + colorEdge * 0.75, 0.0, 1.0) * uInkStrength * edgeFade;

          // 中国画传统【焦墨/深黛】色值 (#1C1814)
          vec3 inkColor = vec3(0.11, 0.09, 0.08);

          // 4. 三矾九染阶梯色阶 (Cel-Shading & Mineral Palette Grading)
          float lum = luma(cCenter);
          vec3 graded = cCenter;

          // 暗部沉淀：蓝铜矿【深石青与绝顶玄青】(#0F3348)
          float shadowMask = 1.0 - smoothstep(0.08, 0.38, lum);
          graded = mix(graded, graded * vec3(0.72, 0.88, 1.18), shadowMask * 0.52);

          // 中间调生发：孔雀石【重彩石绿与青碧微澜】(#1E735D)
          float midMask = smoothstep(0.25, 0.65, lum) * (1.0 - smoothstep(0.65, 0.88, lum));
          graded = mix(graded, graded * vec3(0.88, 1.15, 0.94), midMask * 0.32);

          // 受光与高光：赭石与泥金【金碧辉映】(#DDB258)
          float lightMask = smoothstep(0.68, 0.96, lum);
          graded = mix(graded, graded * vec3(1.18, 1.06, 0.82), lightMask * 0.42);

          // 5. 北宋宣和古绢经纬织纹与微观纸理 (Imperial Silk Weave Texture)
          vec2 screenPos = gl_FragCoord.xy;
          float weaveX = sin(screenPos.x * 1.57) * 0.5 + 0.5;
          float weaveY = sin(screenPos.y * 1.57) * 0.5 + 0.5;
          float silkGrain = (weaveX * 0.5 + weaveY * 0.5 - 0.5) * uPaperGrain;
          graded += silkGrain * vec3(0.92, 0.86, 0.75);

          // 6. 融合工笔淡墨线 (墨破色，色凝墨)
          vec3 finalColor = mix(graded, inkColor, inkLine * 0.88);

          // 7. 远景融入北宋古绢烟岚雾气 (#EADDC1)
          vec3 silkHaze = vec3(0.92, 0.87, 0.76);
          float hazeFactor = smoothstep(140.0, 680.0, dist);
          finalColor = mix(finalColor, silkHaze, hazeFactor * 0.78);

          // 8. 轻度古典暗角微晕 (Vignette)
          vec2 centerCoord = uv - vec2(0.5);
          float vignette = 1.0 - dot(centerCoord, centerCoord) * 0.38;
          finalColor *= clamp(vignette, 0.0, 1.0);

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      uniforms: {
        tScene: { value: this.renderTarget.texture },
        tDepth: { value: this.renderTarget.depthTexture },
        uResolution: { value: new THREE.Vector2(targetW, targetH) },
        uNear: { value: this.camera.near },
        uFar: { value: this.camera.far },
        uTime: { value: 0.0 },
        uInkStrength: { value: 1.15 },
        uPaperGrain: { value: 0.045 }
      },
      depthTest: false,
      depthWrite: false
    });

    const quad = new THREE.Mesh(quadGeo, this.inkMaterial);
    this.postScene.add(quad);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const targetW = Math.floor(this.width * this.dpr);
    const targetH = Math.floor(this.height * this.dpr);

    this.renderTarget.setSize(targetW, targetH);
    this.inkMaterial.uniforms.uResolution.value.set(targetW, targetH);
  }

  render(time) {
    // 1. 将三维场景以全精度渲染进离屏靶 (Color + Depth)
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);

    // 2. 切回屏幕，运行北宋工笔青绿水墨后处理着色器
    this.renderer.setRenderTarget(null);
    this.inkMaterial.uniforms.uTime.value = time;
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    this.renderTarget.dispose();
    this.inkMaterial.dispose();
  }
}
