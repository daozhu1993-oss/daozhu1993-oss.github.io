/**
 * 《千里江山 · 借笔还魂》北宋工笔青绿水墨非真实感渲染管线 (NPR Post-Processing Pipeline)
 * Awwwards / Webby / FWA 殿堂级艺术品质标准
 * 
 * 核心技术原理：
 * 1. 【反深度归一化拉普拉斯铁线描 (Inverse-Depth Laplacian Iron-Wire Inking)】：
 *    - 8 邻域高精度深度检测，精准捕捉山体绝壁、亭台飞檐与神兽轮廓。
 *    - 狼毫笔锋微观微扰（Wolf-hair Brush Jitter），赋予墨线手绘书画的顿挫与呼吸感。
 *    - 天空与极远景智能屏蔽，杜绝天幕黑斑与塑料边缘。
 * 2. 【三矾九染矿物阶梯分染 (Song Dynasty Mineral Grading)】：
 *    - 阴影区沉降为蓝铜矿与孔雀石绿（石青、石绿）通透冷调，受光面升华至宣和温润泥金与暖赭。
 *    - Gamma 曲线微调，山体肌理细腻分明，永不沉底死黑。
 * 3. 【宣和九百年古绢经纬织纹 (Imperial Silk Weave & Wash Grain)】：
 *    - 屏幕空间渲染微观绢帛经纬交织纸理，使 3D 世界如同在故宫真迹古绢上流动。
 * 4. 【三远法远山烟岚 (Atmospheric Silk Mist)】：
 *    - 深度渐变融入宣和绢黄晨岚（#F6EEDB），呈现“远山如黛、平远空濛”的东方意境。
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

    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene = new THREE.Scene();

    const quadGeo = new THREE.PlaneGeometry(2, 2);

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

        float luma(vec3 c) {
          return dot(c, vec3(0.299, 0.587, 0.114));
        }

        float invZ(vec2 uv) {
          float d = texture2D(tDepth, uv).r;
          return (uFar - d * (uFar - uNear)) / (uNear * uFar);
        }

        void main() {
          vec2 uv = vUv;
          vec2 o = 1.0 / uResolution;

          float w0 = invZ(uv);

          // 1. 天空背景识别 (w0 极小，对应 d 接近 1.0，绝不给天空画黑边)
          float isSky = step(w0, 0.0016);

          // 8 邻域反深度采样
          float n0 = invZ(uv + vec2(o.x, 0.0));
          float n1 = invZ(uv - vec2(o.x, 0.0));
          float n2 = invZ(uv + vec2(0.0, o.y));
          float n3 = invZ(uv - vec2(0.0, o.y));
          float n4 = invZ(uv + vec2(o.x, o.y));
          float n5 = invZ(uv - vec2(o.x, o.y));
          float n6 = invZ(uv + vec2(o.x, -o.y));
          float n7 = invZ(uv - vec2(o.x, -o.y));

          // 归一化拉普拉斯边缘算子
          float lap = (n0 + n1 + n2 + n3 + n4 + n5 + n6 + n7 - 8.0 * w0) / (max(w0, 0.0025) * 2.0);
          float depthEdge = smoothstep(0.12, 0.38, abs(lap)) * (1.0 - isSky);

          // 2. 颜色差异算子
          vec3 cCenter = texture2D(tScene, uv).rgb;
          vec3 cRight  = texture2D(tScene, uv + vec2(o.x, 0.0)).rgb;
          vec3 cTop    = texture2D(tScene, uv + vec2(o.y, 0.0)).rgb;
          float colorDiff = length(cCenter - cRight) + length(cCenter - cTop);
          float colorEdge = smoothstep(0.28, 0.65, colorDiff);

          // 3. 狼毫笔锋手绘微扰（消除机械直线感，带来手工工笔顿挫韵味）
          float brushJitter = 1.0 + 0.12 * sin(uv.x * 240.0 + uv.y * 180.0 + sin(uv.x * 80.0));

          // 4. 工笔纤秀铁线描（近景平滑柔化防生硬，远景虚化融入空濛）
          float dist = 1.0 / max(w0, 1e-4);
          float nearFade = smoothstep(2.5, 6.0, dist);
          float farFade  = 1.0 - smoothstep(70.0, 420.0, dist);
          float edgeFade = nearFade * farFade;
          float inkLine = clamp(depthEdge * 0.85 + colorEdge * 0.35, 0.0, 1.0) * uInkStrength * edgeFade * brushJitter;

          // 北宋温润松烟古墨色（微暖古墨，绝非冷硬纯黑）
          vec3 inkColor = vec3(0.14, 0.12, 0.09);

          // 5. 三矾九染矿物调色
          float lum = luma(cCenter);
          vec3 graded = cCenter;

          // 暗部翡翠与石青保底微光：保留物体固有深木深石色彩，柔和浸润矿物冷辉
          vec3 shadowMineral = vec3(0.06, 0.14, 0.15);
          float darkFactor = 1.0 - smoothstep(0.01, 0.32, lum);
          graded += shadowMineral * darkFactor * 0.40;

          // 柔和暗部 Gamma 曲线，凸显山石肌理
          graded = pow(max(graded, vec3(0.0)), vec3(0.90));

          // 提纯北宋青绿重彩的矿物鲜活度 (Malachite & Azurite Mineral Vibrancy)
          graded = mix(vec3(luma(graded)), graded, 1.25);

          // 高光泛出温润泥金光泽
          float lightMask = smoothstep(0.66, 0.98, lum);
          graded = mix(graded, graded * vec3(1.14, 1.07, 0.90), lightMask * 0.32);

          // 6. 宣和九百年古绢有机柔和纤维微理 (Organic Handscroll Silk Fiber - 彻底杜绝像素方格)
          vec2 silkUv = uv * vec2(12.0, 6.75);
          float fiber1 = sin(silkUv.x * 18.0 + sin(silkUv.y * 14.0) * 1.5);
          float fiber2 = cos(silkUv.y * 24.0 + cos(silkUv.x * 10.0) * 1.2);
          float silkGrain = (fiber1 * 0.6 + fiber2 * 0.4) * 0.5 + 0.5;
          graded *= (1.0 - uPaperGrain * 0.03 + silkGrain * uPaperGrain * 0.06);

          // 7. 融合工笔墨线
          vec3 finalColor = mix(graded, inkColor, inkLine * 0.58);

          // 8. 远岫融入宣和绢黄晨岚 (#F6EEDB)
          vec3 silkHaze = vec3(0.96, 0.93, 0.85);
          float hazeFactor = smoothstep(140.0, 600.0, dist);
          finalColor = mix(finalColor, silkHaze, hazeFactor * 0.65);

          // 9. 雅致古典暗角聚焦
          vec2 centerCoord = uv - vec2(0.5);
          float vignette = 1.0 - dot(centerCoord, centerCoord) * 0.22;
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
        uInkStrength: { value: 0.72 },
        uPaperGrain: { value: 0.16 }
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
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);

    this.renderer.setRenderTarget(null);
    this.inkMaterial.uniforms.uTime.value = time;
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    if (this.renderTarget) this.renderTarget.dispose();
    if (this.inkMaterial) this.inkMaterial.dispose();
  }
}
