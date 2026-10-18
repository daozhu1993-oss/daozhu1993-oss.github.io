import * as THREE from 'three';
import { SCROLL_SILK_GLSL } from '../postprocessing-silk.js';
import { Restoration } from './Restoration.js';
import { asset } from '../util.js';

const VERT = /* glsl */`
varying vec2 vUv;
varying float vWorldX;
uniform float uOrigin;
uniform float uSpan;
void main() {
  vUv = uv;
  vWorldX = uOrigin + uv.x * uSpan;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uRestore;
uniform float uWorldW;
uniform float uBaseSat;
uniform float uDim;
uniform float uFlash;
uniform float uTime;
uniform float uLayer;
uniform float uCover;
uniform float uRevealEdge;
varying vec2 vUv;
varying float vWorldX;
${SCROLL_SILK_GLSL}
void main() {
  if (uRevealEdge > 0.001 && (vWorldX / uWorldW) < uRevealEdge) discard;
  vec4 texel = texture2D(uMap, vUv);
  vec3 col = texel.rgb;
  float restore = texture2D(uRestore, vec2(clamp(vWorldX / uWorldW, 0.0, 1.0), 0.5)).r;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float sat = mix(uBaseSat, 1.0, restore);
  col = mix(vec3(luma), col, sat);
  vec3 paper = vec3(0.914, 0.875, 0.784);
  float fog = (1.0 - restore) * (1.0 - uBaseSat) * 0.38;
  col = mix(col, paper, fog);
  float blue = smoothstep(0.02, 0.18, col.b - col.r);
  float shimmer = sin(vUv.y * 90.0 + vUv.x * 28.0 + uTime * 0.7) * 0.012 * blue;
  col += shimmer;
  col = qSilk(col, gl_FragCoord.xy, vUv, uTime);
  col = mix(col, vec3(luma), clamp(uFlash, 0.0, 1.0));
  col *= mix(1.0, 0.90, clamp(uDim, 0.0, 1.0));
  float a = 1.0;
  if (uLayer < 0.5) {
    a = smoothstep(0.46, 0.68, vUv.y) * uCover;
  } else if (uLayer > 1.5) {
    a = (1.0 - smoothstep(0.30, 0.52, vUv.y)) * uCover;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
}
`;

function makeTexture(img) {
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export class ScrollWorld {
  constructor(viewport) {
    this.viewport = viewport;
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    this.camera.position.set(0, 0, 5);
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: true,
    });
    this.renderer.setPixelRatio(pr);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    viewport.appendChild(this.renderer.domElement);

    this.restoration = new Restoration(2048);
    this.shared = {
      uRestore: { value: this.restoration.tex },
      uWorldW: { value: 1 },
      uBaseSat: { value: 1 },
      uDim: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
      uRevealEdge: { value: 0 },
    };
    this.worldW = 1;
    this.worldH = 1;
    this.tiles = [];
    this.loaded = [];
    this.overview = null;
    this.ready = false;
    this.time = 0;
  }

  async load() {
    const manifest = await fetch(asset('tiles/manifest.json')).then((r) => r.json());
    this.worldH = 1;
    this.worldW = manifest.width / manifest.height;
    this.shared.uWorldW.value = this.worldW;
    const overviewImg = await loadImage(asset(manifest.overview));
    const overviewTex = makeTexture(overviewImg);
    const geo = new THREE.PlaneGeometry(this.worldW, 1);
    const mat = this._material(overviewTex, 0, this.worldW, 1);
    this.overview = new THREE.Mesh(geo, mat);
    this.overview.position.set(this.worldW / 2, 0.5, -0.04);
    this.scene.add(this.overview);

    this.tiles = manifest.lod1.map((tile) => ({
      x0: tile.x / manifest.height,
      x1: (tile.x + tile.w) / manifest.height,
      w: tile.w / manifest.height,
      file: tile.file,
      tex: null,
      meshes: [],
      lastSeen: 0,
      loading: false,
    }));
    this.ready = true;
    return { worldW: this.worldW, worldH: this.worldH };
  }

  _material(tex, origin, span, layer) {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...this.shared,
        uMap: { value: tex },
        uOrigin: { value: origin },
        uSpan: { value: span },
        uLayer: { value: layer },
        uCover: { value: layer === 1 ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: layer !== 1,
      depthWrite: layer === 1,
      toneMapped: false,
    });
  }

  setBaseSat(v) { this.shared.uBaseSat.value = v; }
  setDim(v) { this.shared.uDim.value = v; }
  setFlash(v) { this.shared.uFlash.value = v; }
  setRevealEdge(nx) { this.shared.uRevealEdge.value = nx; }

  resize(pxW, pxH) {
    this.renderer.setSize(pxW, pxH, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
  }

  update(dt, cam) {
    this.time += dt;
    this.shared.uTime.value = this.time;
    if (this.shared.uFlash.value > 0) {
      this.shared.uFlash.value = Math.max(0, this.shared.uFlash.value - dt / 0.3);
    }
    this.restoration.update(dt);
    this._placeCamera(cam);
    this._updateTiles(cam);
    this.renderer.render(this.scene, this.camera);
  }

  _placeCamera(cam) {
    const vh = cam.visibleHeight();
    const vw = cam.visibleWidth();
    this.camera.left = cam.x - vw / 2;
    this.camera.right = cam.x + vw / 2;
    this.camera.top = cam.y + vh / 2;
    this.camera.bottom = cam.y - vh / 2;
    this.camera.updateProjectionMatrix();
  }

  _parallaxK(cam) {
    const overview = cam.overviewZoom();
    const roam = cam.roamZoom();
    if (cam.zoom <= overview * 1.25) return 0;
    const t = Math.min(1, (cam.zoom - overview * 1.25) / Math.max(0.001, roam - overview * 1.25));
    return t;
  }

  _updateTiles(cam) {
    const kBlend = this._parallaxK(cam);
    const showTiles = cam.zoom > cam.overviewZoom() * 2.05;
    const margin = cam.visibleWidth();
    const left = cam.x - cam.visibleWidth() / 2 - margin;
    const right = cam.x + cam.visibleWidth() / 2 + margin;
    let visibleLoaded = 0;
    let visibleNeed = 0;
    this.tiles.forEach((tile) => {
      const vis = showTiles && tile.x1 > left && tile.x0 < right;
      if (!vis) {
        tile.meshes.forEach((mesh) => { mesh.visible = false; });
        return;
      }
      visibleNeed += 1;
      tile.lastSeen = this.time;
      if (!tile.tex && !tile.loading) this._requestTile(tile);
      if (!tile.tex) return;
      visibleLoaded += 1;
      this._placeTile(tile, cam, kBlend);
    });
    this.overview.visible = !showTiles || visibleLoaded < visibleNeed;
    this._evict(left, right);
  }

  _requestTile(tile) {
    tile.loading = true;
    const img = new Image();
    img.onload = () => {
      tile.tex = makeTexture(img);
      const center = (tile.x0 + tile.x1) / 2;
      const geo = new THREE.PlaneGeometry(tile.w, 1);
      [0, 1, 2].forEach((layer) => {
        const mat = this._material(tile.tex, tile.x0, tile.w, layer);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(center, 0.5, layer === 1 ? 0 : 0.02 + layer * 0.01);
        mesh.userData.layer = layer;
        mesh.userData.baseX = center;
        this.scene.add(mesh);
        tile.meshes.push(mesh);
      });
      tile.loading = false;
      this.loaded.push(tile);
    };
    img.onerror = () => { tile.loading = false; };
    img.src = asset(`tiles/${tile.file}`);
  }

  _placeTile(tile, cam, kBlend) {
    // k = ±0.08 keeps the edge shift under 6% of the view width: (viewW/2)*0.12 = 0.06*viewW.
    const ks = [-0.08 * kBlend, 0, 0.07 * kBlend];
    tile.meshes.forEach((mesh) => {
      const layer = mesh.userData.layer;
      const k = ks[layer];
      const s = 1 + k;
      mesh.visible = true;
      mesh.scale.set(s, 1, 1);
      mesh.position.x = cam.x + (mesh.userData.baseX - cam.x) * s;
      mesh.position.y = 0.5;
      mesh.material.uniforms.uCover.value = layer === 1 ? 1 : Math.min(1, Math.abs(k) / 0.02);
    });
  }

  _evict(left, right) {
    const MAX = 8;
    if (this.loaded.length <= MAX) return;
    const ranked = this.loaded.slice().sort((a, b) => a.lastSeen - b.lastSeen);
    while (this.loaded.length > MAX && ranked.length) {
      const tile = ranked.shift();
      const onScreen = tile.x1 > left && tile.x0 < right;
      if (onScreen) continue;
      const geometry = tile.meshes[0]?.geometry;
      tile.meshes.forEach((mesh) => {
        this.scene.remove(mesh);
        mesh.material.dispose();
      });
      geometry?.dispose();
      tile.meshes = [];
      tile.tex?.dispose();
      tile.tex = null;
      this.loaded = this.loaded.filter((t) => t !== tile);
    }
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${url}`));
    img.src = url;
  });
}
