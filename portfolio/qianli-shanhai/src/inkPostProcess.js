/**
 * 《千里江山 · 借笔还魂》北宋工笔青绿水墨非真实感渲染管线
 * (Northern Song Blue-and-Green Ink Wash & Gongbi NPR Post-Processing Pipeline)
 * 
 * 核心设计准则：
 * 1. 彻底根除死黑：注入温润石青与孔雀石绿阴影辉光，保证背光面通透如玉。
 * 2. 纤巧淡墨铁线描：基于反深度拉普拉斯算子，自动屏蔽天空背景，勾勒精致山脊飞檐轮廓。
 * 3. 宣和古绢神韵：高光处展现泥金温润光泽，微量绢帛经纬经纬交织纸理，远景自然融入宣和晨岚。
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

          // 天空背景识别 (w0 极小，对应 d 接近 1.0，绝不给天空画黑边)
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
          float depthEdge = smoothstep(0.08, 0.32, abs(lap)) * (1.0 - isSky);

          // 颜色差异算子
          vec3 cCenter = texture2D(tScene, uv).rgb;
          vec3 cRight  = texture2D(tScene, uv + vec2(o.x, 0.0)).rgb;
          vec3 cTop    = texture2D(tScene, uv + vec2(0.0, o.y)).rgb;
          float colorDiff = length(cCenter - cRight) + length(cCenter - cTop);
          float colorEdge = smoothstep(0.25, 0.60, colorDiff);

          // 工笔纤秀铁线描（随距离平滑衰减，远景虚化融入空濛）
          float dist = 1.0 / max(w0, 1e-4);
          float edgeFade = 1.0 - smoothstep(80.0, 450.0, dist);
          float inkLine = clamp(depthEdge * 0.85 + colorEdge * 0.45, 0.0, 1.0) * uInkStrength * edgeFade;

          // 北宋温润松烟墨色（微暖古墨，绝非死冷黑）
          vec3 inkColor = vec3(0.18, 0.15, 0.12);

          // 三矾九染矿物调色
          float lum = luma(cCenter);
          vec3 graded = cCenter;

          // 暗部翡翠与石青保底辉光：杜绝任何死黑与泥泞
          vec3 shadowGlow = vec3(0.08, 0.18, 0.20);
          graded = max(graded, shadowGlow * (1.0 - smoothstep(0.02, 0.35, lum)));

          // 适度提亮暗部 Gamma 曲线，凸显山石肌理
          graded = pow(max(graded, vec3(0.0)), vec3(0.88));

          // 提纯北宋青绿重彩的矿物鲜活度
          graded = mix(vec3(luma(graded)), graded, 1.15);

          // 高光泛出温润泥金光泽
          float lightMask = smoothstep(0.68, 0.98, lum);
          graded = mix(graded, graded * vec3(1.12, 1.06, 0.90), lightMask * 0.28);

          // 微量宣和九百年古绢经纬织物肌理
          vec2 screenPos = gl_FragCoord.xy;
          float weave = (sin(screenPos.x * 1.57) * 0.5 + 0.5) * (sin(screenPos.y * 1.57) * 0.5 + 0.5);
          graded += (weave - 0.5) * uPaperGrain * vec3(0.9, 0.85, 0.75);

          // 融合工笔墨线
          vec3 finalColor = mix(graded, inkColor, inkLine * 0.60);

          // 远岫融入宣和绢黄晨岚 (#F6EEDB)
          vec3 silkHaze = vec3(0.96, 0.93, 0.85);
          float hazeFactor = smoothstep(140.0, 620.0, dist);
          finalColor = mix(finalColor, silkHaze, hazeFactor * 0.70);

          // 微妙镜头暗角聚焦
          vec2 centerCoord = uv - vec2(0.5);
          float vignette = 1.0 - dot(centerCoord, centerCoord) * 0.18;
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
        uInkStrength: { value: 0.80 },
        uPaperGrain: { value: 0.022 }
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
