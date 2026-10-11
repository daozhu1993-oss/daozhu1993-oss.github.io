// 00-core.js — Vincent's Cats engine core.
// Owns: renderer, scene, camera, lights, fog, the level registry and loader, the world contract
// (terrain height, layout, colliders, anchors — filled in from the chosen painting's level
// definition), shared paint helpers, input, the player controller, game state (gallery → loading →
// title → playing …, replay), the frame loop, WebGL crash recovery and the test API. Every other
// module registers through SN_MODULES; painting definitions register through SN_LEVELS.
// Boot builds the shell modules (store, ui) at once; a painting's world modules and the shared
// gameplay modules (cats, post) are built when that painting is loaded. See ARCHITECTURE.md.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- params
const Q = new URLSearchParams(location.search);
const params = {
  test: Q.has('test'),
  autostart: Q.has('autostart') || Q.has('test'),
  nopost: Q.has('nopost'),
  hud: Q.get('hud') !== '0',
  fly: Q.has('fly'),
  debug: (Q.get('debug') || '').split(',').filter(Boolean),
  quality: Q.get('quality') || 'auto',
  seed: Q.has('seed') ? +Q.get('seed') : 1889, // world noise seed (the worlds are deterministic)
  cats: Q.has('cats') ? Q.get('cats') : null, // cat-hiding seed for this play (default: random, 1 in test mode)
  level: Q.get('level') || null,              // painting id to load straight away (none = the gallery)
  time: Q.has('t') ? +Q.get('t') : 0,
  view: Q.get('view'),        // "x,y,z,yawDeg,pitchDeg" (y = eye height, blank = ground)
  anchor: Q.get('anchor'),    // anchor id to look at
  w: +Q.get('w') || 0,
  h: +Q.get('h') || 0,
  gl1: Q.get('gl') === '1',   // force the WebGL1 path (testing)
  portrait: Q.get('portrait') === '0' ? false : null, // ?portrait=0: landscape framing on an upright screen (thumbnails)
  recover: Q.has('recover'),  // test mode: still run the WebGL crash recovery (auto safe-mode reload)
  safe: false, safeReason: null, // set below (see "device & crash memory")
};
// default to starry-night level
if (!params.level) params.level = 'starry-night';

// ---------------------------------------------------------------- device & crash memory (WebGL recovery)
// A phone that runs out of graphics memory loses its WebGL context; Chrome then blocks 3D for the whole
// site until Chrome restarts, so the next load can't create a context at all. Core therefore (1) boots
// phones / low-memory devices at quality 'low' with half-size textures (SN.texSize), (2) remembers a
// crash and reloads once in SAFE MODE (?quality=low&safe=1: no post, no MSAA, smallest textures —
// modules honour SN.params.safe), and (3) explains the block and how to recover when no context can
// be made. (Lessons from the Totoro game on a Pixel: keep phone GPU memory well under ~100 MB.)
const CRASH_KEY = 'sn-gl-crash', BOOT_KEY = 'sn-gl-boot';
const CRASH_V = 1; // bump after a memory fix to forget old crash records (they make later visits start safe)
const store = {
  get(k, local) { try { const v = (local ? localStorage : sessionStorage).getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v, local) { try { (local ? localStorage : sessionStorage).setItem(k, JSON.stringify(v)); } catch { /* private mode / blocked storage */ } },
  del(k, local) { try { (local ? localStorage : sessionStorage).removeItem(k); } catch { /* ignore */ } },
};
// the device, before any GPU is involved (SN.device; the GPU fields are filled in once the context exists)
const device = (() => {
  const nav = navigator, ua = nav.userAgent || '';
  const mq = q => { try { return matchMedia(q).matches; } catch { return false; } };
  const touch = (mq('(pointer: coarse)') && !mq('(hover: hover)'))
    || (nav.maxTouchPoints > 1 && /Macintosh|iPad/.test(ua) && 'ontouchend' in document);
  const sw = Math.min(screen.width || innerWidth, screen.height || innerHeight);
  const mobileUA = nav.userAgentData?.mobile === true || /Android.+Mobile|iPhone|iPod|Windows Phone/i.test(ua);
  const phone = mobileUA || (touch && sw > 0 && sw < 600);
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null; // GB (Chrome; capped at 8)
  const lowMemory = memory != null && memory <= (touch || phone ? 4 : 2);
  const app = !!window.Capacitor?.isNativePlatform?.();
  return { phone, touch, lowMemory, memory, app, screen: [screen.width, screen.height], dpr: devicePixelRatio || 1,
    webgl2: null, maxTextureSize: 0, lowGpu: false, constrained: phone || lowMemory, safe: false };
})();
const recoverOn = !params.test || params.recover;           // tests stay deterministic unless ?recover
const rememberLocal = () => device.touch || device.constrained; // desktops only remember a crash per tab session
function recordCrash(reason, extra = {}) {
  if (!recoverOn) return null;
  const rec = { v: CRASH_V, at: Date.now(), reason, quality: params.quality, safe: params.safe, ...extra };
  store.set(CRASH_KEY, rec);
  if (rememberLocal()) store.set(CRASH_KEY, rec, true);
  return rec;
}
function recentCrash() {
  const now = Date.now();
  const s = store.get(CRASH_KEY); if (s && s.v === CRASH_V && now - s.at < 30 * 60e3) return s;
  const l = store.get(CRASH_KEY, true); if (l && l.v === CRASH_V && now - l.at < 7 * 864e5) return l;
  return null;
}
const safeQ = Q.get('safe'); // '1' = safe mode, '0' = normal mode and forget remembered crashes
if (safeQ === '0') { store.del(CRASH_KEY); store.del(CRASH_KEY, true); }
// an earlier load in this tab that never reached "stable" and never closed cleanly (tab / GPU process
// killed: iOS Safari, Android "Aw, Snap!") counts as a crash on touch / constrained devices
{
  const prev = store.get(BOOT_KEY);
  store.del(BOOT_KEY);
  if (prev && recoverOn && safeQ !== '0' && rememberLocal() && Date.now() - prev.at < 10 * 60e3 && !recentCrash()) recordCrash('unclean', { quality: prev.q, safe: prev.safe });
}
const lastCrash = safeQ === '0' || !recoverOn ? null : recentCrash();
params.safe = safeQ === '1' || !!lastCrash;
params.safeReason = params.safe ? (lastCrash ? lastCrash.reason : 'url') : null;
device.safe = params.safe;
if (params.safe && params.quality === 'auto') params.quality = 'low';

// ---------------------------------------------------------------- logging
const LOG = [];
function fmt(a) {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
  return String(a);
}
function pushLog(level, args) {
  LOG.push({ level, msg: args.map(fmt).join(' '), t: Math.round(performance.now()) });
  if (LOG.length > 400) LOG.shift();
}
for (const level of ['error', 'warn']) {
  const orig = console[level].bind(console);
  console[level] = (...a) => { pushLog(level, a); orig(...a); };
}
addEventListener('error', e => {
  if (/ResizeObserver loop/.test(e.message)) return; // benign browser notice, not an error
  pushLog('error', [`${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`, e.error || '']);
});
addEventListener('unhandledrejection', e => pushLog('error', ['unhandled rejection:', e.reason]));

// ---------------------------------------------------------------- events
const listeners = {};
// on(name, fn, {first: true}) puts fn ahead of the listeners already there (e.g. the cats module re-hides on
// 'replay' before the UI, built earlier, reads the new cats)
function on(name, fn, { first = false } = {}) { const l = (listeners[name] ||= []); if (first) l.unshift(fn); else l.push(fn); return () => off(name, fn); }
function off(name, fn) { const l = listeners[name]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
function emit(name, data) {
  for (const fn of (listeners[name] || []).slice()) {
    try { fn(data); } catch (e) { console.error(`[event ${name}]`, e); }
  }
}

// ---------------------------------------------------------------- random & noise
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// rng(seed) -> () => [0,1) with helpers. Seed may be a number or a string.
function rng(seed = 1) {
  const r = mulberry32(typeof seed === 'string' ? hashStr(seed) : (seed * 2654435761) >>> 0);
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };
  return r;
}
function makeNoise2(seed) {
  const r = mulberry32(seed >>> 0);
  const p = new Uint8Array(256), perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = [1, -1, 1, -1, 1, -1, 0, 0], gy = [1, 1, -1, -1, 0, 0, 1, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, tt, g;
    tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { g = perm[ii + perm[jj]] & 7; tt *= tt; n += tt * tt * (gx[g] * x0 + gy[g] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { g = perm[ii + i1 + perm[jj + j1]] & 7; tt *= tt; n += tt * tt * (gx[g] * x1 + gy[g] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { g = perm[ii + 1 + perm[jj + 1]] & 7; tt *= tt; n += tt * tt * (gx[g] * x2 + gy[g] * y2); }
    return 70 * n;
  };
}
const noise2 = makeNoise2(params.seed);
function fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- colour (sRGB, for canvas painting)
function hexToRgb(hex) {
  if (typeof hex === 'number') return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb([h, s, l]) {
  if (!s) return [l * 255, l * 255, l * 255];
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}
// shade('#1a3a8f', +0.1) -> lighter hex; dl/ds in [-1,1], dh in turns
function shade(hex, dl = 0, ds = 0, dh = 0) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([(h + dh + 1) % 1, clamp(s + ds, 0, 1), clamp(l + dl, 0, 1)]));
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
const color = {
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb, shade, mix: mixHex,
  three: hex => new THREE.Color(hex), // sRGB hex -> linear THREE.Color (ColorManagement on)
};

// ---------------------------------------------------------------- palette
// The Starry Night's colours are the defaults; a level's `palette` is merged over them when it loads,
// so the shared keys the cats / post / UI modules read (outline, ink, skyDeep, fog, starWhite,
// starYellow, chrome, lamp, swirl, swirlPale, cerulean, ultramarine, …) always exist.
const palette = {
  // sky
  skyDeep: '#0b1a45', skyNight: '#10286b', ultramarine: '#1c3c8f', cobalt: '#2a5bb0',
  cerulean: '#4d86c4', swirl: '#8bbbe0', swirlPale: '#c9e3ee', mint: '#a9d7c9',
  // lights
  starWhite: '#fff7cf', starYellow: '#f6e27a', chrome: '#f2c230', moonOrange: '#f0a42b', ochre: '#d9962e',
  windowGlow: '#f7c948', lamp: '#ffd36b',
  // hills & land
  hillFar: '#2c4f8c', hillMid: '#264a7a', hillNear: '#1d3a63', hillEdge: '#6f9fcf',
  meadow: '#2e5a55', meadowDark: '#1b3a3d', olive: '#5d7a4f', oliveSilver: '#8fa890', earth: '#4a4a52', path: '#8a8a78',
  wheat: '#caa24a', wheatDark: '#9c7a35',
  // cypress
  cypressDark: '#141d14', cypress: '#26361f', cypressMid: '#3d5230', cypressBrown: '#4a3a22', cypressLight: '#6e7a3c',
  // village
  wallBlue: '#6a86a8', wallPale: '#a7b8c4', wallOchre: '#b39a63', wallGrey: '#7d8794', roofDark: '#2c3450', roofSlate: '#454e6e',
  roofRust: '#7a4f3a', door: '#3a2f2a', treeDark: '#16283a', treeGreen: '#23433f',
  // strokes
  outline: '#0a1433', ink: '#070d22',
  fog: '#16306e',
};

// ---------------------------------------------------------------- paint: canvas stroke textures
// strokes(opts) paints a (by default seamlessly tiling) canvas with Van Gogh style dashes.
//   size|w|h        canvas size (px)
//   base            background colour
//   colors          [hex, ...] or [[hex, weight], ...]
//   count           number of strokes
//   len, width      [min,max] stroke length / width in px
//   angle           radians, or fn(u, v, r) -> radians (u,v in [0,1])
//   jitter          +/- random angle (rad)
//   curve           bend as a fraction of length
//   alpha           [min,max]
//   light           random lightness jitter per stroke (+/-)
//   bristles        number of sub-lines per stroke (0/1 = solid)
//   tile            draw wrapped copies so the texture tiles
//   seed
//   pass(g, r, w, h) optional extra painting callback before strokes
function strokes(o = {}) {
  const size = o.size || 256, w = o.w || size, h = o.h || size;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const r = rng(o.seed ?? 1);
  g.fillStyle = o.base || palette.ultramarine; g.fillRect(0, 0, w, h);
  if (o.pass) o.pass(g, r, w, h);
  const cols = (o.colors || [palette.cobalt]).map(x => (Array.isArray(x) ? x : [x, 1]));
  const totalW = cols.reduce((s, x) => s + x[1], 0);
  const pickCol = () => { let t = r() * totalW; for (const [cc, wt] of cols) { if ((t -= wt) <= 0) return cc; } return cols[0][0]; };
  const count = o.count ?? Math.round((w * h) / 90);
  const len = o.len || [w * 0.04, w * 0.1], wid = o.width || [w * 0.012, w * 0.025];
  const jitter = o.jitter ?? 0.3, curve = o.curve ?? 0.25, alpha = o.alpha || [0.8, 1];
  const light = o.light ?? 0.07, bristles = o.bristles ?? 3, tile = o.tile ?? true;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h;
    const a = (typeof o.angle === 'function' ? o.angle(x / w, y / h, r) : (o.angle || 0)) + (r() * 2 - 1) * jitter;
    const L = lerp(len[0], len[1], r()), W = lerp(wid[0], wid[1], r());
    const col = shade(pickCol(), (r() * 2 - 1) * light, (r() * 2 - 1) * light * 0.5);
    const ca = Math.cos(a), sa = Math.sin(a), bend = (r() * 2 - 1) * curve * L;
    const alp = lerp(alpha[0], alpha[1], r());
    const offs = [[0, 0]];
    if (tile) {
      const m = L + W;
      const nx = x < m ? w : x > w - m ? -w : 0, ny = y < m ? h : y > h - m ? -h : 0;
      if (nx) offs.push([nx, 0]); if (ny) offs.push([0, ny]); if (nx && ny) offs.push([nx, ny]);
    }
    const sub = Math.max(1, bristles);
    for (const [ox, oy] of offs) {
      for (let k = 0; k < sub; k++) {
        const t = sub === 1 ? 0 : k / (sub - 1) - 0.5;
        const px = -sa * t * W * 0.85, py = ca * t * W * 0.85;
        g.globalAlpha = alp * (sub === 1 ? 1 : 0.9);
        g.strokeStyle = sub === 1 ? col : shade(col, (r() * 2 - 1) * 0.06);
        g.lineWidth = sub === 1 ? W : Math.max(1, (W / sub) * 1.7);
        const x0 = x + ox + px - (ca * L) / 2, y0 = y + oy + py - (sa * L) / 2;
        const x1 = x + ox + px + (ca * L) / 2, y1 = y + oy + py + (sa * L) / 2;
        g.beginPath(); g.moveTo(x0, y0);
        g.quadraticCurveTo(x + ox + px - sa * bend, y + oy + py + ca * bend, x1, y1);
        g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
  return c;
}
const texCache = new Map();
// texture(canvasOrOpts, {repeat, key, wrap}) -> THREE.CanvasTexture (sRGB, repeat-wrapped, mipmapped)
function texture(src, o = {}) {
  if (o.key && texCache.has(o.key)) return texCache.get(o.key);
  const canvas = src instanceof HTMLCanvasElement ? src : strokes(src);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.wrap === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = Math.min(params.safe ? 1 : device.constrained ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.needsUpdate = true;
  if (o.key) texCache.set(o.key, t);
  return t;
}
const paint = { strokes, texture, cache: texCache };

// ---------------------------------------------------------------- materials
// Every opaque surface should come from here so the whole world reads as one painting.
function paintMat(o = {}) {
  const m = new THREE.MeshLambertMaterial({
    color: o.color ?? 0xffffff,
    map: o.map || null,
    emissive: o.emissive ?? 0x000000,
    emissiveMap: o.emissiveMap || null,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    vertexColors: !!o.vertexColors,
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    alphaTest: o.alphaTest ?? 0,
    fog: o.fog ?? true,
  });
  if (o.name) m.name = o.name;
  m.extensions = { derivatives: true }; // WebGL1: modules' onBeforeCompile ink shaders use fwidth (ignored on WebGL2)
  return m;
}
function unlitMat(o = {}) {
  return new THREE.MeshBasicMaterial({
    color: o.color ?? 0xffffff, map: o.map || null, vertexColors: !!o.vertexColors,
    side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, alphaTest: o.alphaTest ?? 0,
    depthWrite: o.depthWrite ?? true, fog: o.fog ?? true, blending: o.blending ?? THREE.NormalBlending,
  });
}
// Post-process mask, written to the scene render target's alpha channel:
//   1.0 normal paint (default for every opaque material)
//   0.0 "preserve detail" — the painterly filter keeps this crisp (cats!)
//   0.5 "glow source" — optional halo/bloom hint (windows, stars, moon, lamps)
// Works because an opaque material with NoBlending outputs its opacity as alpha.
function markMask(material, value) {
  const list = Array.isArray(material) ? material : [material];
  for (const m of list) { m.blending = THREE.NoBlending; m.transparent = false; m.opacity = value; m.needsUpdate = true; }
  return material;
}
const mat = {
  paint: paintMat, unlit: unlitMat,
  markDetail: m => markMask(m, 0.0),
  markGlow: m => markMask(m, 0.5),
};

// ---------------------------------------------------------------- geometry helpers
// projectUV: planar UVs from world/object position along each vertex's dominant normal axis,
// so stroke textures keep a constant size on boxes of any dimension. scale = UV units per metre.
function projectUV(geo, scale = 0.25, ox = 0, oy = 0) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u * scale + ox; uv[i * 2 + 1] = v * scale + oy;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// colorize: give every vertex one colour (for merging many parts into one vertexColors mesh)
function colorize(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
// merge: tolerant mergeGeometries — normalises index/uv/color so mixed parts merge cleanly.
function merge(list, { keepGroups = false } = {}) {
  const geos = list.filter(Boolean).map(g => (g.index ? g.toNonIndexed() : g.clone()));
  if (!geos.length) return new THREE.BufferGeometry();
  const anyColor = geos.some(g => g.attributes.color);
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (anyColor && !g.attributes.color) colorize(g, 0xffffff);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!anyColor && g.attributes.color) g.deleteAttribute('color');
    g.morphAttributes = {};
  }
  return mergeGeometries(geos, keepGroups);
}
const geo = { projectUV, colorize, merge, mergeGeometries };

// ---------------------------------------------------------------- renderer / scene / camera
const app = document.getElementById('app') || document.body;
// showFatal: replace the static preload card with a message (build.py defines SN_FAIL)
function showFatal(msg) {
  if (window.SN_FAIL) window.SN_FAIL(msg);
  else document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:0;margin:0;display:grid;place-items:center;color:#f6e27a;background:#0b1a45;font:18px Georgia,serif;padding:2em;text-align:center">${msg}</p>`);
}
// the reload target of the recovery paths: same page and flags, quality low, safe mode
function safeUrl() {
  const kept = location.search.slice(1).split('&').filter(kv => kv && !/^(quality|safe)(=|$)/.test(kv));
  return location.href.split(/[?#]/)[0] + '?' + [...kept, 'quality=low', 'safe=1'].join('&') + location.hash;
}
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// the help card for "no 3D": kind 'create' (no context could be made) | 'lost' (lost and never restored)
let fatalKind = null;
function showGlHelp(kind, detail = '') {
  // Chrome says "Web page caused context loss and was blocked" when it has switched 3D off for the site
  const crashed = kind === 'lost' || !!lastCrash || glAttempts.some(a => /caused context loss|blocked/i.test(a.status || ''));
  const P = 'font-size:15px;line-height:1.55;text-align:left;margin:.7em 0;font-style:normal';
  const head = crashed ? 'The painting’s 3D graphics stopped.' : 'This painting needs WebGL (3D graphics), and the browser didn’t allow it.';
  const why = crashed
    ? 'It probably needed more graphics memory than this device could give it. After a graphics crash, Chrome switches 3D off for the site until Chrome is restarted.'
    : 'If the game crashed a moment ago, Chrome may have switched 3D off for this site until Chrome is restarted.';
  const steps = device.app
    ? '<li>Close the app completely (swipe it away in the recent-apps screen) and open it again: it will start in a lighter “safe” mode.</li>'
    : `<li>Close this tab and any other tab with the game.</li>
      <li>Close the browser completely — on a phone, swipe it away in the recent-apps screen — then open it again.</li>
      <li>Open the game again: it will start in a lighter “safe” mode.</li>`;
  showFatal(`<div style="text-align:center;max-width:32em">
    <div style="font-size:20px">${head}</div>
    <p style="${P}">${why}</p>
    <ol style="${P};padding-left:1.4em">${steps}</ol>
    ${device.app ? '' : '<p style="' + P + '">Still no 3D? Open <b>chrome://gpu</b> and check that “WebGL” says “Hardware accelerated”, make sure hardware acceleration is on and the browser is up to date — or try another browser.</p>'}
    <button id="sn-retry" type="button" style="font:inherit;font-size:17px;padding:.65em 1.3em;border:0;border-radius:999px;background:#f2c230;color:#0b1a45;cursor:pointer">Try again (safe mode)</button>
    ${detail ? `<p style="font-size:11px;line-height:1.4;opacity:.65;margin-top:1.2em;word-break:break-word;font-style:normal">${escHtml(detail)}</p>` : ''}
  </div>`);
  fatalKind = kind;
  const b = document.getElementById('sn-retry');
  if (b) b.onclick = () => location.replace(safeUrl());
}
function reloadSafe(reason) {
  console.warn(`[core] WebGL context lost (${reason}): reloading once in safe mode`);
  try { if (game.state === 'playing' || game.state === 'paused') saveResume(); } catch { /* early */ }
  showFatal('Restarting the painting in a lighter safe mode…');
  setTimeout(() => location.replace(safeUrl()), 400);
}

// WebGL context: probe each path on a fresh canvas (so a failure costs no three.js error), then hand
// the canvas to three, whose own getContext() call returns the context we made. Paths:
//   primary — WebGL2 with the tuned attributes (desktop behaviour);
//   minimal — WebGL2, default attributes (some Android drivers reject powerPreference/stencil hints);
//   webgl1  — WebGL1 (three r160 still supports it; the post module switches itself off there).
// ?gl=1 forces the WebGL1 path. The outcome is SN.stats.gl.
// The post module anti-aliases its own scene target, so the canvas only needs MSAA without it (never in safe mode).
const canvasAA = params.nopost && !params.safe;
if (params.safe) params.nopost = true; // safe mode: no post pipeline (the post module honours nopost)
const glAttempts = [];
function probeContext(path, names, attrs) {
  for (const name of names) {
    const canvas = document.createElement('canvas');
    let status = '';
    const onErr = e => { status = e.statusMessage || status; };
    canvas.addEventListener('webglcontextcreationerror', onErr);
    let gl = null;
    try { gl = canvas.getContext(name, attrs); } catch (e) { status = e.message; }
    canvas.removeEventListener('webglcontextcreationerror', onErr);
    if (gl && gl.isContextLost?.()) { status ||= 'lost at creation'; gl = null; }
    glAttempts.push({ path, context: name, ok: !!gl, ...(status ? { status } : {}) });
    if (gl) return { canvas, gl, name };
  }
  return null;
}
const GL_PATHS = [
  ['primary', ['webgl2'], { alpha: true, depth: true, stencil: false, antialias: canvasAA, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' },
    { antialias: canvasAA, alpha: false, powerPreference: 'high-performance', stencil: false }],
  ['minimal', ['webgl2'], { antialias: false }, { antialias: false, alpha: false }],
  ['webgl1', ['webgl', 'experimental-webgl'], { antialias: false }, { antialias: false, alpha: false }],
].filter(p => !params.gl1 || p[0] === 'webgl1');
let renderer = null, glPath = '', glName = '';
for (const [path, names, attrs, opts] of GL_PATHS) {
  const got = probeContext(path, names, attrs);
  if (!got) continue;
  try {
    // (WebGL1Renderer only differs in not asking for 'webgl2' first, which on a WebGL1 canvas raises an error event)
    renderer = new (path === 'webgl1' ? THREE.WebGL1Renderer : THREE.WebGLRenderer)({ canvas: got.canvas, ...opts });
    glPath = path; glName = got.name;
    break;
  } catch (e) {
    glAttempts.push({ path, context: got.name, ok: false, status: 'three.js: ' + e.message });
    renderer = null;
  }
}
function glAttemptText() { // "primary/webgl2, minimal/webgl2 failed (status) · webgl1/webgl ok"
  const groups = [];
  for (const a of glAttempts) {
    const tail = `${a.ok ? 'ok' : 'failed'}${a.status ? ' (' + a.status + ')' : ''}`, g = groups[groups.length - 1];
    if (g && g.tail === tail) g.names.push(`${a.path}/${a.context}`); else groups.push({ names: [`${a.path}/${a.context}`], tail });
  }
  return groups.map(g => `${g.names.join(', ')} ${g.tail}`).join(' · ');
}
if (!renderer) {
  recordCrash('create-failed', { attempts: glAttempts });
  showGlHelp('create', 'WebGL: ' + glAttemptText());
  console.warn('[core] no WebGL context:', glAttemptText());
  await new Promise(() => {}); // stop here without an error: the help card is the page now
}
// what we got (SN.stats.gl) — the numbers module owners need for low-end GPUs
function glInfo(gl) {
  const p = n => { try { return gl.getParameter(n); } catch { return null; } };
  let rend = p(gl.RENDERER), vendor = p(gl.VENDOR);
  if (/^WebKit WebGL$/.test(rend || '')) { // Chrome masks RENDERER; ask the (Chrome-supported) debug extension
    try { const dbg = gl.getExtension('WEBGL_debug_renderer_info'); if (dbg) { rend = p(dbg.UNMASKED_RENDERER_WEBGL) || rend; vendor = p(dbg.UNMASKED_VENDOR_WEBGL) || vendor; } } catch { /* ignore */ }
  }
  const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  return {
    version: gl2 ? 2 : 1, path: glPath, context: glName, glVersion: p(gl.VERSION), renderer: rend, vendor,
    maxTextureSize: p(gl.MAX_TEXTURE_SIZE), maxSamples: gl2 ? p(gl.MAX_SAMPLES) : 0,
    antialias: !!gl.getContextAttributes()?.antialias, attempts: glAttempts, stable: false,
  };
}
const GL_INFO = glInfo(renderer.getContext());
device.webgl2 = GL_INFO.version === 2;
device.maxTextureSize = GL_INFO.maxTextureSize || 0;
device.lowGpu = device.maxTextureSize > 0 && device.maxTextureSize <= 4096;
device.constrained = device.phone || device.lowMemory || device.lowGpu;
(glPath === 'primary' ? console.info : console.warn)(`[core] WebGL${GL_INFO.version} via the ${glPath} path · ${GL_INFO.renderer} · max texture ${GL_INFO.maxTextureSize}` +
  (params.safe ? ` · SAFE MODE (${params.safeReason})` : '') + (device.constrained ? ` · constrained device (${['phone', 'lowMemory', 'lowGpu'].filter(k => device[k]).join(', ')})` : ''));
// texture sizes for this device: SN.texSize(1024) → 1024 (desktop) · 512 (phone / low memory / small GPU) · 256 (safe mode)
const TEX_SCALE = params.safe ? 0.25 : device.constrained ? 0.5 : 1;
function texSize(px, min = 64) {
  const cap = Math.min(device.maxTextureSize || 4096, device.constrained ? 2048 : 16384);
  return Math.max(Math.min(min, px), Math.min(cap, Math.round(px * TEX_SCALE)));
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(palette.skyDeep, 1);
renderer.domElement.id = 'sn-canvas';
renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
renderer.domElement.tabIndex = 0;
app.appendChild(renderer.domElement);
let clearHex = palette.skyDeep; // the loaded level's clear colour
let contextLost = false; // while lost: the clock stands still and GPU timing is suspended
let isReady = false, readyAt = 0, stable = false, restoreWatch = 0;
const EARLY_MS = 20000;   // a loss while loading or this soon after 'ready' means "too heavy for this device"
const RESTORE_MS = 8000;  // otherwise wait this long (visible) for the browser to restore the context
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault(); contextLost = true; gpuTimer.reset(false); emit('contextLost');
  const phase = !levelLoaded && !loadingLevel ? 'gallery' : !isReady ? 'loading' : document.hidden ? 'late' : performance.now() - readyAt < EARLY_MS ? 'early' : 'late';
  if (!recoverOn || phase === 'gallery') return;
  if (phase !== 'late' && !params.safe) { recordCrash('lost-' + phase); reloadSafe(phase); return; }
  // wait for a restore (a background tab often gets its context back); if it never comes, say why
  clearInterval(restoreWatch);
  let visibleMs = 0, lastT = performance.now();
  restoreWatch = setInterval(() => {
    const now = performance.now(), dt = now - lastT; lastT = now;
    if (!contextLost) { clearInterval(restoreWatch); return; }
    if (!document.hidden) visibleMs += dt;
    if (visibleMs < RESTORE_MS) return;
    clearInterval(restoreWatch);
    recordCrash('lost-' + phase);
    showGlHelp('lost', `WebGL context lost (${phase}${params.safe ? ', safe mode' : ''}) and not restored · ${GL_INFO.renderer || ''}`);
  }, 500);
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false; clearInterval(restoreWatch); renderer.setClearColor(clearHex, 1); gpuTimer.reset(true);
  // browsers may wipe the 2D canvases the painted textures came from: a reload rebuilds everything
  if (recoverOn && levelLoaded) { console.warn('[core] WebGL context restored: reloading so painted textures are rebuilt (a play in progress resumes)'); if (game.state === 'playing' || game.state === 'paused') saveResume(); location.reload(); return; }
  emit('contextRestored');
});
// boot sentinel (touch / constrained devices): present until 20 s after 'ready'; cleared by a clean close
function setBootSentinel() { if (recoverOn && rememberLocal() && !stable && (levelLoaded || loadingLevel)) store.set(BOOT_KEY, { at: Date.now(), q: params.quality, safe: params.safe }); }
addEventListener('pagehide', () => store.del(BOOT_KEY));
document.addEventListener('visibilitychange', () => { if (document.hidden) store.del(BOOT_KEY); else setBootSentinel(); });
function markStable() {
  if (contextLost) { setTimeout(markStable, 5000); return; }
  stable = true; GL_INFO.stable = true; store.del(BOOT_KEY);
  // a safe session that runs counts toward trying normal 'low' again: after two, forget the crash
  const l = store.get(CRASH_KEY, true);
  if (params.safe && lastCrash && l) {
    l.safeOk = (l.safeOk || 0) + 1;
    if (l.safeOk >= 2) { store.del(CRASH_KEY, true); store.del(CRASH_KEY); } else store.set(CRASH_KEY, l, true);
  }
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(palette.fog, 0.0045);
const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 2500);
camera.rotation.order = 'YXZ';
scene.add(camera); // so modules can parent HUD-ish 3D bits to the camera

// ---------------------------------------------------------------- world contract
// yaw 0 looks toward -Z (the view of the painting); positive yaw turns LEFT (toward -X).
function dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
const deg = Math.PI / 180;
// The layout, terrain and surfaces belong to the loaded level (see "levels" below): applyLevel() fills
// this object in place (same identity, so modules may keep a reference) and swaps the functions.
const LAYOUT_DEFAULTS = { walkRadius: 125, worldRadius: 520, skyRadius: 900 };
const layout = { ...LAYOUT_DEFAULTS, start: { x: 0, z: 0, yaw: 0, pitch: 0 }, walk: { x: 0, z: 0, r: 125 }, places: [] };
const keyDir = new THREE.Vector3(0.3, 0.8, -0.5).normalize(); // toward the key light (the moon, the sun, the lamp)
let heightFn = () => 0, roadFn = null, surfaceFn = null;
function heightAt(x, z) { return heightFn(x, z); }
function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.5;
  return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}
// distance (m) from (x, z) to a polyline [[x, z], ...]
function distToPolyline(x, z, R) {
  let best = Infinity;
  if (!R || R.length < 2) return best;
  for (let i = 0; i < R.length - 1; i++) {
    const [ax, az] = R[i], [bx, bz] = R[i + 1];
    const vx = bx - ax, vz = bz - az, t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}
// the main path through the level (the level's own distToRoad, else its layout.road polyline)
function distToRoad(x, z) { return roadFn ? roadFn(x, z) : distToPolyline(x, z, layout.road); }
// what the ground is made of at (x, z): 'grass' | 'stone' | 'wood' | 'wheat' | 'earth' | 'water' | 'carpet'
// (footsteps; the level's surfaceAt decides, default 'grass')
function surfaceAt(x, z) { try { return (surfaceFn && surfaceFn(x, z)) || 'grass'; } catch { return 'grass'; } }
// the named place nearest (x, z) from layout.places [{name, x, z, r}] (hint phrases), or null
function placeAt(x, z, slack = 0) {
  let best = null, bd = Infinity;
  for (const p of layout.places || []) {
    const d = Math.hypot(x - p.x, z - p.z) - (p.r || 0);
    if (d < bd) { bd = d; best = p; }
  }
  return best && bd <= slack ? best : null;
}

// colliders: oriented boxes and circles on the XZ plane, bucketed in a grid
const CELL = 8, grid = new Map(), colliders = [];
const cellKey = (ix, iz) => ix + ',' + iz;
function insertCollider(c, minX, maxX, minZ, maxZ) {
  colliders.push(c);
  for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++)
    for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
      const k = cellKey(ix, iz); let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(c);
    }
  return c;
}
// addBox({x, z, hx, hz, rot, top, tag}) — hx/hz are half extents; rot is yaw (radians)
function addBox({ x, z, hx, hz, rot = 0, top = Infinity, tag = '' }) {
  const c = Math.cos(rot), s = Math.sin(rot), ex = Math.abs(c * hx) + Math.abs(s * hz), ez = Math.abs(s * hx) + Math.abs(c * hz);
  return insertCollider({ type: 'box', x, z, hx, hz, rot, cos: c, sin: s, top, tag }, x - ex, x + ex, z - ez, z + ez);
}
function addCircle({ x, z, r, top = Infinity, tag = '' }) {
  return insertCollider({ type: 'circle', x, z, r, top, tag }, x - r, x + r, z - r, z + r);
}
const _seen = new Set();
// Walls (colliders with an infinite top) are resolved after the jumpable furniture in every pass, and a
// last pass resolves only walls: a push out of a table, bench or stove can never leave the centre in a wall.
function pushOut(c, pos, radius) {
  if (c.type === 'circle') {
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + radius;
    if (d < m) { const k = d > 1e-6 ? (m - d) / d : 0; pos.x += dx * k; pos.z += dz * k + (d > 1e-6 ? 0 : m); }
    return;
  }
  // into box space (rotation by -rot)
  const dx = pos.x - c.x, dz = pos.z - c.z;
  const lx = c.cos * dx - c.sin * dz, lz = c.sin * dx + c.cos * dz;
  const cx = clamp(lx, -c.hx, c.hx), cz = clamp(lz, -c.hz, c.hz);
  let px = lx - cx, pz = lz - cz, d = Math.hypot(px, pz), nx, nz;
  if (d > 1e-6) {
    if (d >= radius) return;
    const k = (radius - d) / d; nx = lx + px * k; nz = lz + pz * k;
  } else { // centre inside the box: push out along the shallowest axis
    const ox = c.hx - Math.abs(lx), oz = c.hz - Math.abs(lz);
    if (ox < oz) { nx = Math.sign(lx || 1) * (c.hx + radius); nz = lz; } else { nx = lx; nz = Math.sign(lz || 1) * (c.hz + radius); }
  }
  pos.x = c.x + c.cos * nx + c.sin * nz; pos.z = c.z - c.sin * nx + c.cos * nz;
}
const _near = [];
function collide(pos, radius, feetY = -Infinity) {
  for (let pass = 0; pass < 3; pass++) {
    _seen.clear(); _near.length = 0;
    const ix0 = Math.floor((pos.x - radius) / CELL), ix1 = Math.floor((pos.x + radius) / CELL);
    const iz0 = Math.floor((pos.z - radius) / CELL), iz1 = Math.floor((pos.z + radius) / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const b = grid.get(cellKey(ix, iz)); if (!b) continue;
      for (const c of b) { if (!_seen.has(c)) { _seen.add(c); if (!(feetY > c.top)) _near.push(c); } }
    }
    const wallsOnly = pass === 2;
    if (!wallsOnly) for (const c of _near) if (c.top !== Infinity) pushOut(c, pos, radius);
    for (const c of _near) if (c.top === Infinity) pushOut(c, pos, radius);
  }
  return pos;
}

// sight tests: extra "is the view from→to blocked?" tests for things the cats module can't see as meshes
// (e.g. GPU-placed wheat). fn(from: Vector3, to: Vector3) → true/false or 0..1 (fraction of the view blocked).
const sightTests = [];
function addSightTest(fn) { if (typeof fn === 'function') sightTests.push(fn); return fn; }

// anchors: named hiding spots other modules offer to the cats module
const anchors = [];
function addAnchor(a) {
  const pos = a.pos && a.pos.isVector3 ? a.pos.clone() : new THREE.Vector3(...a.pos);
  const anc = {
    id: a.id || `${a.kind}-${anchors.length}`, kind: a.kind, pos,
    facing: a.facing ?? 0, surface: a.surface || 'flat', space: a.space ?? 0.6,
    note: a.note || '', maxDist: a.maxDist, tags: a.tags || [], module: a.module || '', data: a.data,
  };
  anchors.push(anc);
  return anc;
}

// ---------------------------------------------------------------- lighting
// (a level's `lights` sets colours and intensities; the key light shines from keyDir)
const hemi = new THREE.HemisphereLight(0x7f9fe6, 0x1a2544, 1.35);
const ambient = new THREE.AmbientLight(0x2b3f86, 0.55);
const keyLight = new THREE.DirectionalLight(0xffe6a3, 1.5);
keyLight.position.copy(keyDir).multiplyScalar(300);
scene.add(hemi, ambient, keyLight, keyLight.target);

// ---------------------------------------------------------------- input
const isTouch = matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches;
const input = {
  keys: new Set(),
  move: { x: 0, y: 0 },    // analog move (touch joystick): x = strafe right, y = forward, in [-1,1]
  look: { dx: 0, dy: 0 },  // pending look deltas in pixels (consumed each frame)
  run: false, jump: false,
  locked: false, dragLook: false, sensitivity: 0.0022,
};
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE']);
addEventListener('keydown', e => {
  if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  input.keys.add(e.code);
  if (game.state === 'playing' && MOVE_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'Space' && !e.repeat && game.state === 'playing') input.jump = true;
  if (!e.repeat) {
    if (e.code === 'KeyH' && game.state === 'playing') emit('hintRequest');
    if (e.code === 'KeyM') emit('toggleMute');
    if (e.code === 'Escape' && !input.locked) { if (game.state === 'playing') pause(); }
    emit('key', { code: e.code });
  }
});
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); });

let lockEverWorked = false, lockPending = false;
function requestLock() {
  if (isTouch || params.test || input.dragLook) return;
  const el = renderer.domElement;
  if (!el.requestPointerLock) { input.dragLook = true; return; }
  lockPending = true;
  try {
    const p = el.requestPointerLock();
    if (p && p.catch) p.catch(() => onLockError());
  } catch { onLockError(); }
}
function onLockError() {
  if (!lockPending) return; // the promise rejection and the 'pointerlockerror' event both report one failure
  lockPending = false;
  if (!lockEverWorked) input.dragLook = true; // e.g. sandboxed iframe: fall back to drag-to-look
  emit('lockError', { fallback: input.dragLook });
}
document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === renderer.domElement;
  lockPending = false;
  if (input.locked) lockEverWorked = true;
  emit('lock', input.locked);
  if (!input.locked && game.state === 'playing' && !input.dragLook && !isTouch) pause();
});
document.addEventListener('pointerlockerror', onLockError);

let drag = null;
const canvasEl = renderer.domElement;
canvasEl.addEventListener('mousedown', e => {
  if (game.state !== 'playing') return;
  if (input.locked) { if (e.button === 0) spotAt(0, 0); return; }
  if (input.dragLook || params.test) drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
addEventListener('mousemove', e => {
  if (input.locked) {
    input.look.dx += clamp(e.movementX, -250, 250); input.look.dy += clamp(e.movementY, -250, 250);
  } else if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
    input.look.dx += dx; input.look.dy += dy;
  }
});
addEventListener('mouseup', e => {
  if (drag && drag.moved < 6 && game.state === 'playing') {
    const r = canvasEl.getBoundingClientRect();
    spotAt(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  drag = null;
});
canvasEl.addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------- aim / spotting
const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
function rayFromNdc(x = 0, y = 0) { _ndc.set(x, y); raycaster.setFromCamera(_ndc, camera); return raycaster; }
// spotAt(ndcX, ndcY): the player tries to spot a cat through this screen point. The cats
// module listens to 'spot' and answers with 'catFound' or 'spotMiss'.
function spotAt(x = 0, y = 0) {
  if (game.state !== 'playing') return;
  emit('spot', { ndc: { x, y }, ray: rayFromNdc(x, y) });
}
const aim = { cat: null, dist: Infinity }; // cats module keeps this updated for the crosshair

// ---------------------------------------------------------------- player
// (a level's `player` may change eye height, radius, speeds and jump; resetPlayer() puts it at layout.start)
const PLAYER_DEFAULTS = { eye: 1.65, radius: 0.35, walk: 4.4, run: 8.5, jumpV: 5.4, gravity: 16, stepUp: 0.7 };
const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), vy: 0, grounded: true, yaw: 0, pitch: 0,
  ...PLAYER_DEFAULTS, bob: 0, camY: 0, frozen: false, fly: params.fly,
};
function resetPlayer() {
  const S = layout.start;
  player.pos.set(S.x, heightAt(S.x, S.z), S.z); player.vel.set(0, 0, 0); player.vy = 0; player.grounded = true;
  player.yaw = startYaw(); player.pitch = startPitch(); player.bob = 0; player.lastGround = null;
  player.camY = player.pos.y + player.eye;
}

function applyCamera(dt) {
  const target = player.pos.y + player.eye + (player.grounded && !reducedMotion ? Math.sin(player.bob) * 0.045 : 0);
  player.camY = player.frozen || !dt ? target : lerp(player.camY, target, 1 - Math.exp(-dt * 18));
  camera.position.set(player.pos.x, player.camY, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}
function consumeLook() {
  const s = input.sensitivity;
  if (input.look.dx || input.look.dy) {
    player.yaw -= input.look.dx * s; player.pitch -= input.look.dy * s;
    input.look.dx = input.look.dy = 0;
  }
  player.pitch = clamp(player.pitch, -1.45, 1.45);
}
const STEP_PROBE = 0.35; // m: the slope/ledge test looks this far ahead
const LEDGE_MAX = 0.4;   // m: the most a jump (or a step) can land you above your feet
function updatePlayer(dt) {
  consumeLook();
  if (player.frozen) { applyCamera(0); return; }
  const k = input.keys;
  let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + input.move.y;
  let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.move.x;
  const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
  const running = k.has('ShiftLeft') || k.has('ShiftRight') || input.run;
  let speed = (running ? player.run : player.walk) * (player.fly ? 2.5 : 1);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  let tx = (-sy * f + cy * s), tz = (-cy * f - sy * s);
  const p0 = player.pos;
  if (!player.fly && (tx || tz)) {
    // climbing is slower: up to -45% on the steepest walkable slopes
    const m = Math.hypot(tx, tz), ux = tx / m, uz = tz / m;
    const rise = heightAt(p0.x + ux * 0.8, p0.z + uz * 0.8) - heightAt(p0.x, p0.z);
    speed *= 1 - 0.45 * smoothstep(0.2, 0.8, rise / 0.8);
    // soft world edge: outward motion fades over the last 5 m before the walk radius
    const WK = layout.walk, ex0 = p0.x - WK.x, ez0 = p0.z - WK.z, rr0 = Math.hypot(ex0, ez0), edge = Math.min(5, WK.r * 0.2);
    if (rr0 > WK.r - edge && rr0 > 1e-6) {
      const nx0 = ex0 / rr0, nz0 = ez0 / rr0, out = ux * nx0 + uz * nz0;
      if (out > 0) {
        const keep = clamp((WK.r - rr0) / edge, 0, 1);
        tx -= nx0 * out * m * (1 - keep); tz -= nz0 * out * m * (1 - keep);
      }
    }
  }
  tx *= speed; tz *= speed;
  const acc = 1 - Math.exp(-dt * (player.grounded || player.fly ? 11 : 2.5));
  player.vel.x += (tx - player.vel.x) * acc; player.vel.z += (tz - player.vel.z) * acc;
  const p = player.pos, x0 = p.x, z0 = p.z;
  let nx = p.x + player.vel.x * dt, nz = p.z + player.vel.z * dt;
  if (!player.fly) {
    // too steep? judged over a fixed probe ahead (not this frame's step), so what you can climb doesn't
    // depend on the frame rate: a gradient over 1.1 blocks; a ledge up to ~0.38 m (1.1 × PROBE) walks up
    const step = Math.hypot(nx - p.x, nz - p.z);
    if (step > 1e-5 && player.grounded) {
      const ux = (nx - p.x) / step, uz = (nz - p.z) / step, h0 = heightAt(p.x, p.z);
      const reach = Math.max(step, STEP_PROBE);
      const rise = (heightAt(p.x + ux * reach, p.z + uz * reach) - h0) / reach;
      if (rise > 1.1) { nx = p.x; nz = p.z; player.vel.x *= 0.3; player.vel.z *= 0.3; }
    }
  }
  p.x = nx; p.z = nz;
  if (!player.fly) collide(p, player.radius, p.y + 0.3);
  const WK = layout.walk, rr = Math.hypot(p.x - WK.x, p.z - WK.z);
  if (rr > WK.r) { p.x = WK.x + (p.x - WK.x) * WK.r / rr; p.z = WK.z + (p.z - WK.z) * WK.r / rr; }
  // velocity is what actually happened (walls and clamps included): no phantom speed for bob or jumps —
  // but never more than was intended: a push out of a collider (landing inside a table) is not a launch
  if (!player.fly && dt > 0) {
    const wantV = Math.hypot(nx - x0, nz - z0) / dt;
    let vx = (p.x - x0) / dt, vz = (p.z - z0) / dt;
    const got = Math.hypot(vx, vz);
    if (got > wantV + 0.05) { const k = wantV / got; vx *= k; vz *= k; }
    player.vel.x = vx; player.vel.z = vz;
  }
  const ground = heightAt(p.x, p.z);
  const groundRate = dt > 0 && player.lastGround != null ? (ground - player.lastGround) / dt : 0;
  player.lastGround = ground;
  if (player.fly) {
    p.y += ((k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0)) * speed * dt;
    p.y = Math.max(p.y, ground);
  } else {
    if (input.jump && player.grounded) {
      // add the rate the ground under you is really rising, so uphill jumps aren't swallowed
      player.vy = player.jumpV + clamp(groundRate, 0, 1.5); player.grounded = false; player.airT = 0;
    }
    if (player.grounded) {
      if (p.y - ground > player.stepUp) player.grounded = false; else p.y = ground;
    }
    if (!player.grounded) {
      player.vy -= player.gravity * dt; p.y += player.vy * dt; player.airT = (player.airT || 0) + dt;
      // flying into ground much higher than your feet (a quay wall, a high step): a wall, not a lift
      let g = ground;
      if (g - p.y > LEDGE_MAX) {
        p.x = x0; p.z = z0; player.vel.x = 0; player.vel.z = 0;
        g = heightAt(p.x, p.z); player.lastGround = g;
      }
      if (p.y <= g && (player.vy <= 0 || player.airT > 0.12)) { p.y = g; player.vy = 0; player.grounded = true; emit('land'); }
      else if (p.y < g) p.y = g;
    }
  }
  input.jump = false;
  const hs = Math.hypot(player.vel.x, player.vel.z);
  if (player.grounded) player.bob += dt * hs * 1.7;
  player.speed = hs;
  applyCamera(dt);
}
// portrait screens: widen the vertical fov (horizontal half-fov ~27°, capped at 92° vertical) and
// drop the painting-view pitch so the village stays above the touch controls
// (a level's layout.start.portrait = {pitch, yaw} in degrees adds its own turn for portrait screens;
// the default drops the pitch 6°)
function isPortrait() { if (params.portrait === false) return false; const { w, h } = viewSize(); return w < h; }
function startPitch() { return (layout.start.pitch || 0) + (isPortrait() ? (layout.start.portrait?.pitch ?? -6) * deg : 0); }
function startYaw() { return (layout.start.yaw || 0) + (isPortrait() ? (layout.start.portrait?.yaw ?? 0) * deg : 0); }
let baseFov = 65;
function fitFov(aspect) { return aspect >= 1 ? baseFov : clamp((2 * Math.atan(Math.tan(baseFov * 0.415 * deg) / aspect)) / deg, baseFov, 92); }
// title-screen camera: the painting view, breathing gently
function updateIdleCamera(t) {
  const m = reducedMotion ? 0 : 1;
  player.yaw = startYaw() + Math.sin(t * 0.07) * 0.03 * m;
  player.pitch = startPitch() + Math.sin(t * 0.05) * 0.012 * m;
  applyCamera(0);
}

// ---------------------------------------------------------------- game state
// prefers-reduced-motion: no head bob here; modules may read SN.reducedMotion / listen for 'reducedMotion'
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionQuery.matches;
motionQuery.addEventListener?.('change', e => { reducedMotion = e.matches; emit('reducedMotion', reducedMotion); });

const game = {
  state: 'boot', // boot | gallery | loading | title | playing | paused | won
  level: null, found: 0, total: 0, elapsed: 0, hintsUsed: 0, completed: false, plays: 1,
};

// ---------------------------------------------------------------- levels (the paintings)
// Each painting registers a definition through SN_LEVELS (levels/<id>/level.js, see ARCHITECTURE.md):
// {id, order, free, title, …, palette, layout, heightAt, lights, fog, spots, cats, …}. Its world
// modules register in SN_MODULES with `level: '<id>'`. Only one painting is ever built per page load:
// choosing another one once a painting is built reloads the page with ?level=<id>.
const levels = [];
const soon = []; // coming-soon teasers: {id, order, numeral, title, year, place, aspect, blurb, night, palette}
let level = null, levelLoaded = false, loadingLevel = false;
function levelById(id) { return levels.find(l => l.id === id) || null; }
function isUnlocked(id) {
  const L = levelById(id);
  if (!L) return false;
  if (L.free) return true;
  try { return SN.store ? !!SN.store.isUnlocked(id) : true; } catch (e) { console.error('[core] store.isUnlocked', e); return false; }
}
// same page, same flags; level=<id> (or no level = the gallery)
function levelUrl(id) {
  const kept = location.search.slice(1).split('&').filter(kv => kv && !/^(level|view|anchor)(=|$)/.test(kv));
  if (id) kept.push('level=' + encodeURIComponent(id));
  return location.href.split(/[?#]/)[0] + (kept.length ? '?' + kept.join('&') : '');
}
// the cat-hiding seed for this play: random each play (so every visit hides them anew), fixed by ?cats=N,
// 1 in test mode
function randomSeed() { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return Math.floor(Math.random() * 2 ** 32); } }
let playSeed = params.cats != null ? (Number.isFinite(+params.cats) ? +params.cats >>> 0 : hashStr(params.cats)) : params.test ? 1 : randomSeed();
function newPlaySeed() { playSeed = params.test || params.cats != null ? (playSeed + 1) >>> 0 : randomSeed(); SN.playSeed = playSeed; return playSeed; }

// applyLevel: the level's world settings into core (before any of its modules build)
function applyLevel(L0) {
  // the definition's world(SN) factory returns {palette, layout, heightAt, distToRoad, surfaceAt, lights,
  // fog, clear, camera, player, …}; its fields are merged over the definition (SN.level)
  let Wd = {};
  try { Wd = (typeof L0.world === 'function' ? L0.world(SN) : L0.world) || {}; }
  catch (e) { console.error(`[level ${L0.id}] world() failed:`, e); }
  const L = Object.assign(L0, Wd);
  level = L; SN.level = L; game.level = L.id;
  Object.assign(palette, L.palette || {});
  for (const k of Object.keys(layout)) delete layout[k];
  Object.assign(layout, LAYOUT_DEFAULTS, { places: [] }, L.layout || {});
  layout.start = { x: 0, z: 0, yaw: 0, pitch: 0, ...(layout.start || {}) };
  layout.walk = { x: 0, z: 0, r: layout.walkRadius, ...(layout.walk || {}) };
  heightFn = typeof L.heightAt === 'function' ? L.heightAt : () => 0;
  roadFn = typeof L.distToRoad === 'function' ? L.distToRoad : null;
  surfaceFn = typeof L.surfaceAt === 'function' ? L.surfaceAt : null;
  // lights: {hemi: {sky, ground, intensity}, ambient: {color, intensity}, key: {color, intensity, yaw, pitch} | {dir: [x,y,z]}}
  const Lt = L.lights || {};
  if (Lt.hemi) { if (Lt.hemi.sky) hemi.color.set(Lt.hemi.sky); if (Lt.hemi.ground) hemi.groundColor.set(Lt.hemi.ground); if (Lt.hemi.intensity != null) hemi.intensity = Lt.hemi.intensity; }
  if (Lt.ambient) { if (Lt.ambient.color) ambient.color.set(Lt.ambient.color); if (Lt.ambient.intensity != null) ambient.intensity = Lt.ambient.intensity; }
  const K = Lt.key || {};
  if (K.color) keyLight.color.set(K.color);
  if (K.intensity != null) keyLight.intensity = K.intensity;
  if (Array.isArray(K.dir)) keyDir.set(K.dir[0], K.dir[1], K.dir[2]).normalize();
  else if (K.yaw != null || K.pitch != null) dirFromYawPitch(K.yaw || 0, K.pitch ?? 0.6, keyDir);
  else if (layout.moon) dirFromYawPitch(layout.moon.yaw, layout.moon.pitch, keyDir);
  keyLight.position.copy(keyDir).multiplyScalar(300);
  // fog: {type: 'exp2', color, density} | {type: 'linear', color, near, far} | null (none)
  const F = L.fog === undefined ? { type: 'exp2', color: palette.fog, density: 0.0045 } : L.fog;
  scene.fog = !F ? null : F.type === 'linear' ? new THREE.Fog(F.color || palette.fog, F.near ?? 20, F.far ?? 400) : new THREE.FogExp2(F.color || palette.fog, F.density ?? 0.0045);
  clearHex = L.clear || palette.skyNight || palette.skyDeep; renderer.setClearColor(clearHex, 1);
  // camera: {fov, near, far}
  const C = L.camera || {};
  baseFov = C.fov || 65; camera.near = C.near || 0.1; camera.far = C.far || 2500; camera.updateProjectionMatrix();
  Object.assign(player, PLAYER_DEFAULTS, L.player || {});
  resetPlayer();
}

// loadLevel(id): build that painting in this page. Returns false if it is locked (emits 'locked') or
// unknown; when a painting is already built, navigates to ?level=<id> instead (a fresh page per painting).
async function loadLevel(id) {
  const L = levelById(id);
  if (!L) { console.error(`[core] no such level: ${id}`); return false; }
  if (!isUnlocked(id)) { emit('locked', { id, level: L }); return false; }
  if (levelLoaded || loadingLevel) { if (L !== level) { saveResume(null, true); location.replace(levelUrl(id)); } return true; }
  if (contextLost) { location.assign(levelUrl(id)); return true; } // lost in the gallery: a fresh page gets a fresh context
  loadingLevel = true;
  // entered from the gallery: a history entry of its own, so Back returns to the gallery
  try { if (game.state === 'gallery') history.pushState({ sn: 'level', id }, '', levelUrl(id)); else history.replaceState(history.state, '', levelUrl(id)); } catch { /* file:// or sandboxed */ }
  applyLevel(L);
  const R = takeResume(id);
  if (R) {
    playSeed = R.seed >>> 0; SN.playSeed = playSeed;
    game.elapsed = +R.elapsed || 0; game.hintsUsed = R.hintsUsed | 0; game.plays = Math.max(1, R.plays | 0);
    SN.resumed = { found: Array.isArray(R.found) ? R.found.slice() : [], elapsed: game.elapsed, hintsUsed: game.hintsUsed, plays: game.plays };
    console.info(`[core] resuming the play in progress (${SN.resumed.found.length} found)`);
  }
  game.state = 'loading';
  emit('levelLoading', { id, level: L });
  // the split web build ships each painting's world modules as files (SN.build.split.levels[id] = [urls]):
  // fetch this painting's now (they register in SN_MODULES like inline ones); a file that fails is skipped
  const files = SN.build.split?.levels?.[id] || [];
  if (files.length) {
    const t0 = performance.now();
    emit('progress', { name: 'download', i: 0, n: files.length + 1 });
    const got = await Promise.allSettled(files.map(f => import(new URL(f, location.href).href)));
    got.forEach((g, i) => { if (g.status === 'rejected') console.error(`[core] could not load ${files[i]}:`, g.reason); });
    stats.buildTimes.download = Math.round(performance.now() - t0);
    if (got.every(g => g.status === 'rejected')) {
      showFatal('Couldn’t fetch this painting.<br>Check your internet connection and try again.');
      loadingLevel = false; return false;
    }
  }
  const mods = (window.SN_MODULES || []).filter(m => !m.shell && (!m.level || m.level === id)).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  const orphans = (window.SN_MODULES || []).filter(m => m.level && !levelById(m.level));
  if (orphans.length) console.warn('[core] modules for unknown levels:', orphans.map(m => `${m.level}/${m.name}`).join(', '));
  emit('boot', { modules: mods.map(m => m.name), level: id });
  setBootSentinel();
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i], t0 = performance.now();
    emit('progress', { name: m.name, i, n: mods.length });
    await new Promise(r => setTimeout(r, 0)); // let the loading screen paint
    try { const api = await m.build(SN); m.ok = true; if (api) SN.modules[m.name] = api; }
    catch (e) { m.ok = false; console.error(`[module ${m.level ? m.level + '/' : ''}${m.name}] build failed:`, e); }
    stats.buildTimes[m.name] = Math.round(performance.now() - t0);
  }
  buildDebug();
  onResize();
  resetPlayer();
  if (contextLost && recoverOn) { // lost while building (the handler reloads when it can; make sure)
    loadingLevel = false; levelLoaded = true;
    if (!params.safe) { recordCrash('lost-loading'); reloadSafe('loading'); } else showGlHelp('lost', 'WebGL context lost while loading (safe mode)');
    return false;
  }
  levelLoaded = true; loadingLevel = false;
  game.state = 'title';
  document.getElementById('sn-preload')?.remove(); // the UI module normally removes it sooner
  SN.ready = true; isReady = true; readyAt = performance.now();
  setTimeout(markStable, EARLY_MS);
  emit('ready', { id, level: L });
  emit('progress', { name: 'done', i: mods.length, n: mods.length });
  if (params.view) {
    const [x, y, z, yw, pt] = params.view.split(',').map(v => (v === '' ? null : +v));
    setView(x, y, z, yw || 0, pt || 0);
  }
  if (params.anchor) viewAnchor(params.anchor);
  if (params.autostart || SN.resumed) startGame({ lock: false });
  return true;
}
// ---------------------------------------------------------------- resume (a reload in the middle of a play)
// sessionStorage 'sn-resume' {level, seed, found: [spot ids], elapsed, hintsUsed, plays, at} is kept up to
// date while playing; after a reload in this tab (WebGL recovery, safe mode, a killed tab, or the player
// pressing reload) the same painting comes back with the same hiding places, the found cats found and
// the clock where it was. The cats module restores the found cats (SN.resumed.found) and emits 'catsRestored'.
const RESUME_KEY = 'sn-resume', RESUME_MS = 30 * 60e3;
let resumeSavedAt = 0, leaving = false;
// saveResume() saves the play in progress; saveResume(null) forgets it; saveResume(null, true) also stops
// saving for good (this page is leaving the painting on purpose: gallery, another painting)
function saveResume(data, leave = false) {
  if (leave) leaving = true;
  if (data === null) { store.del(RESUME_KEY); resumeSavedAt = 0; return; }
  if (leaving || !levelLoaded || !recoverOn || game.completed) return;
  let found = [];
  try { found = SN.modules.cats?.foundIds?.() || []; } catch { /* cats not built */ }
  store.set(RESUME_KEY, { level: game.level, seed: playSeed, found, elapsed: Math.round(game.elapsed * 10) / 10, hintsUsed: game.hintsUsed, plays: game.plays, at: Date.now() });
  resumeSavedAt = performance.now();
}
function takeResume(id) {
  if (!recoverOn || params.cats != null) return null;
  const r = store.get(RESUME_KEY);
  if (!r || r.level !== id || !(Date.now() - r.at < RESUME_MS) || !Number.isFinite(r.seed)) return null;
  return r;
}
on('start', () => saveResume());
on('resume', () => saveResume());
on('catFound', () => setTimeout(() => saveResume(), 0));
on('win', () => saveResume(null));
on('replay', () => saveResume(null));
addEventListener('pagehide', () => { if (game.state === 'playing' || game.state === 'paused') saveResume(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (game.state === 'playing' || game.state === 'paused')) saveResume(); });

// gotoLevel(id): what the gallery calls — build it here, or reload into it
function gotoLevel(id) { return loadLevel(id); }
// toGallery(): back to the paintings (a painting is built → reload without ?level)
function toGallery() {
  if (levelLoaded || loadingLevel) {
    saveResume(null, true);
    // came from the gallery in this page (our pushState): go back to it; else replace this entry
    if (history.state && history.state.sn === 'level' && !navigatedBack) { navigatedBack = true; history.back(); setTimeout(() => location.replace(levelUrl(null)), 400); }
    else location.replace(levelUrl(null));
    return;
  }
  game.state = 'gallery'; emit('gallery', { levels, soon });
}
// the browser's Back from a painting entered from the gallery: back to the gallery (a fresh page)
let navigatedBack = false;
addEventListener('popstate', () => {
  if (!(levelLoaded || loadingLevel)) return;
  const q = new URLSearchParams(location.search);
  if (q.get('level') !== game.level) { saveResume(null, true); location.replace(location.href); }
});
// replay({start}): same painting, the cats hide somewhere new — core resets the play and emits
// 'replay' {seed}; the cats module re-hides them, the UI resets its HUD. state → 'title' (or
// 'playing' with start: true)
function replay({ start = false, lock = true } = {}) {
  if (!levelLoaded) return;
  newPlaySeed();
  game.found = 0; game.elapsed = 0; game.hintsUsed = 0; game.completed = false; game.plays++;
  player.frozen = false; resetPlayer();
  if (document.pointerLockElement) document.exitPointerLock();
  game.state = 'title';
  emit('replay', { seed: playSeed, plays: game.plays });
  if (start) startGame({ lock });
}

function startGame({ lock = true } = {}) {
  if (!levelLoaded || game.state === 'loading' || game.state === 'gallery' || game.state === 'boot') return;
  game.state = 'playing'; input.jump = false;
  if (lock) requestLock();
  canvasEl.focus();
  emit('start');
}
function pause() { if (game.state !== 'playing') return; game.state = 'paused'; input.keys.clear(); emit('pause'); }
function resume() {
  if (game.state !== 'paused') return;
  game.state = 'playing'; input.jump = false; requestLock(); canvasEl.focus(); emit('resume');
}
function win() {
  if (game.completed) return;
  game.completed = true; game.state = 'won';
  if (document.pointerLockElement) document.exitPointerLock();
  emit('win', { elapsed: game.elapsed, found: game.found, total: game.total, hintsUsed: game.hintsUsed });
}
function continueFree() { game.state = 'playing'; input.jump = false; requestLock(); emit('resume'); }

// ---------------------------------------------------------------- quality
let quality = params.quality !== 'auto' ? params.quality : isTouch || device.constrained ? 'low' : 'high';
// The drawing-buffer pixel ratio comes from a pixel budget per quality (recomputed on resize):
// phones stay sharp, and huge screens on 'low' shed pixels instead of rendering at 1x.
const PX_BUDGET = { high: 3.7e6, medium: 2.4e6, low: 1.2e6 };
function pixelRatioFor(q) {
  const d = devicePixelRatio || 1, { w, h } = viewSize();
  const fit = Math.sqrt(PX_BUDGET[q] / Math.max(1, w * h));
  return clamp(Math.min(d, 1.5, fit), q === 'low' ? Math.min(0.66, d) : Math.min(1, d), 3);
}
// setQuality(q, {manual: true}) — the player's own choice: auto quality stops second-guessing it
function setQuality(q, { manual = false } = {}) {
  if (!['high', 'medium', 'low'].includes(q)) return;
  if (manual) { auto.manual = true; auto.trial = null; }
  quality = q; SN.quality = q;
  onResize();
  emit('quality', q);
}
// follow devicePixelRatio changes (window dragged to a Retina screen, browser zoom)
(function watchDpr() {
  const mq = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
  mq.addEventListener?.('change', () => { onResize(); watchDpr(); }, { once: true });
})();

// Auto quality judges the GPU work per frame, not the frame cadence: a 30 Hz cap (Low Power
// Mode, Energy Saver, 30 Hz displays) is not a slow GPU. With EXT_disjoint_timer_query_webgl2
// the frame's GPU time is measured directly (and quality can step back up); without it only an
// irregular, genuinely slow cadence triggers a downgrade.
const gpuTimer = (() => {
  const t = { ext: null, gl: null, avg: 0, pending: [], active: null };
  t.reset = (reacquire) => {
    t.pending.length = 0; t.active = null; t.avg = 0;
    t.gl = renderer.getContext();
    t.ext = reacquire !== false && typeof WebGL2RenderingContext !== 'undefined' && t.gl instanceof WebGL2RenderingContext
      ? t.gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  };
  t.begin = () => { if (!t.ext || contextLost || t.pending.length > 4) return; t.active = t.gl.createQuery(); t.gl.beginQuery(t.ext.TIME_ELAPSED_EXT, t.active); };
  t.end = () => { if (!t.active) return; t.gl.endQuery(t.ext.TIME_ELAPSED_EXT); t.pending.push(t.active); t.active = null; };
  t.poll = () => {
    const gl = t.gl;
    while (t.ext && t.pending.length) {
      const q = t.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT), disjoint = gl.getParameter(t.ext.GPU_DISJOINT_EXT);
      gl.deleteQuery(q); t.pending.shift();
      if (!disjoint) { const ms = ns / 1e6; t.avg = t.avg ? t.avg * 0.92 + ms * 0.08 : ms; }
    }
  };
  t.reset(true);
  return t;
})();
// Without a GPU timer (Safari, Firefox, iOS) a steady 30 fps could be a cadence cap or a
// GPU limit, so auto quality runs a short trial: step one level, watch 3 s, keep the step only
// if it helped (down) or held (up); otherwise revert and stop trying in that direction.
const QUALITIES = ['low', 'medium', 'high'];
const auto = { slowFor: 0, fastFor: 0, lowered: 0, locked: false, sum: 0, sq: 0, n: 0, trial: null, noDown: false, noUp: false, noDownAt: 0, failedBase: 0, manual: false, fpsHist: [] };
function autoQualityTick(fps) {
  const n = auto.n, mean = n ? auto.sum / n : 16.7, sd = n ? Math.sqrt(Math.max(0, auto.sq / n - mean * mean)) : 0;
  auto.sum = auto.sq = auto.n = 0;
  if (params.quality !== 'auto' || auto.manual || game.state !== 'playing' || params.test || document.hidden || contextLost) {
    auto.slowFor = auto.fastFor = 0; auto.fpsHist.length = 0;
    if (auto.trial) { setQuality(auto.trial.from); auto.trial = null; }
    return;
  }
  const i = QUALITIES.indexOf(quality);
  const step = (to, why) => { emit('qualityAuto', { from: quality, to, why }); setQuality(to); };
  if (gpuTimer.ext && gpuTimer.avg) {
    const slow = fps < 50 && gpuTimer.avg > 0.8 * mean;      // the GPU genuinely can't keep up
    const fast = gpuTimer.avg < 0.3 * Math.min(mean, 16.7);  // lots of headroom
    auto.slowFor = slow ? auto.slowFor + 1 : 0;
    auto.fastFor = fast ? auto.fastFor + 1 : 0;
    if (auto.slowFor >= 4 && i > 0) {
      auto.slowFor = 0; if (auto.lowered < 0) auto.locked = true; // we stepped up and it didn't hold
      auto.lowered++; step(QUALITIES[i - 1], 'gpu');
    } else if (auto.fastFor >= 8 && auto.lowered > 0 && !auto.locked && i < 2) {
      auto.fastFor = 0; auto.lowered = -1; step(QUALITIES[i + 1], 'gpu');
    }
    return;
  }
  // --- no timer: trial steps
  if (auto.trial) {
    const tr = auto.trial;
    if (++tr.t <= 1) return;                     // let the new quality settle
    tr.samples.push(fps);
    if (tr.samples.length < 3) return;
    const got = tr.samples.reduce((a, b) => a + b, 0) / tr.samples.length;
    const keep = tr.dir < 0 ? got >= Math.min(tr.base * 1.15, 57) || got >= tr.base + 8 : got >= 55;
    auto.trial = null;
    if (keep) { emit('qualityAuto', { from: tr.from, to: quality, why: 'trial' }); if (tr.dir < 0) auto.noUpUntil = SN.time + 120; }
    else {
      setQuality(tr.from);
      if (tr.dir < 0) { auto.noDown = true; auto.noDownAt = SN.time; auto.failedBase = tr.base; } else auto.noUp = true;
    }
    return;
  }
  // a failed down-trial (probably a cadence cap) may retry after a minute, or at once if things got much slower
  if (auto.noDown && (SN.time - auto.noDownAt > 60 || fps < auto.failedBase * 0.85)) auto.noDown = false;
  auto.fpsHist.push(fps); if (auto.fpsHist.length > 10) auto.fpsHist.shift();
  const h = auto.fpsHist, avg = h.reduce((a, b) => a + b, 0) / h.length;
  const slowRun = h.length >= 6 && h.slice(-6).every(f => f < 50);
  const slowBase = h.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, h.length);
  const fastRun = h.length >= 10 && h.every(f => f >= 58) && sd < 2.5;
  if (slowRun && i > 0 && !auto.noDown) {
    auto.trial = { dir: -1, from: quality, base: slowBase, t: 0, samples: [] }; auto.fpsHist.length = 0; setQuality(QUALITIES[i - 1]);
  } else if (fastRun && i < 2 && !auto.noUp && SN.time > (auto.noUpUntil || 0)) {
    auto.trial = { dir: 1, from: quality, base: avg, t: 0, samples: [] }; auto.fpsHist.length = 0; setQuality(QUALITIES[i + 1]);
  }
}

// ---------------------------------------------------------------- render pipeline
const stats = { fps: 60, frame: 0, scene: { calls: 0, triangles: 0 }, buildTimes: {}, errors: 0 };
function renderScene(target = null) {
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  stats.scene.calls = renderer.info.render.calls; stats.scene.triangles = renderer.info.render.triangles;
  renderer.setRenderTarget(null);
}
// three r160 always creates the canvas with an alpha channel, so a direct render would leak
// the post mask (cats write alpha 0) into page compositing. Straight-to-screen renders clear
// with alpha 1 and then write colour only.
function renderSceneToScreen() {
  const gl = renderer.getContext(), cb = renderer.state.buffers.color, autoClear = renderer.autoClear;
  renderer.setRenderTarget(null);
  renderer.clear();
  gl.colorMask(true, true, true, false); cb.setLocked(true);
  renderer.autoClear = false;
  try {
    renderer.render(scene, camera);
  } finally {
    renderer.autoClear = autoClear;
    cb.setLocked(false); cb.reset(); cb.setMask(true);
  }
  stats.scene.calls = renderer.info.render.calls; stats.scene.triangles = renderer.info.render.triangles;
}
let pipeline = { render: () => renderSceneToScreen(), resize: () => {} };
function setPipeline(p) { pipeline = p; const { w, h } = viewSize(); p.resize?.(w, h, renderer.getPixelRatio()); }
function viewSize() { return { w: params.w || innerWidth, h: params.h || innerHeight }; }
function onResize() {
  const { w, h } = viewSize();
  const pr = pixelRatioFor(quality);
  if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) renderer.setPixelRatio(pr);
  renderer.setSize(w, h, true);
  camera.aspect = w / h; camera.fov = fitFov(w / h); camera.updateProjectionMatrix();
  pipeline.resize?.(w, h, renderer.getPixelRatio());
  emit('resize', { w, h });
}
addEventListener('resize', onResize);

// ---------------------------------------------------------------- loop
const updates = [];
function onUpdate(fn, order = 0) { updates.push({ fn, order, errors: 0 }); updates.sort((a, b) => a.order - b.order); }
// a hook that threw 6 times is paused; a replay gives every paused hook another chance
on('replay', () => { for (const u of updates) if (u.errors > 5) { console.warn('[core] re-enabling a paused update hook'); u.errors = 3; } });
let time = params.time, last = 0, frameWaiters = [], fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
  time += dt; SN.time = time;
  const world = levelLoaded;
  if (!world) { /* gallery / boot / loading: no world to move or draw */ }
  else if (game.state === 'playing') {
    if (!game.completed && !contextLost) game.elapsed += dt;
    updatePlayer(dt);
    if (now - resumeSavedAt > 10000 && resumeSavedAt) saveResume();
  }
  else if (player.frozen || game.state === 'won' || game.state === 'paused') { consumeLook(); applyCamera(0); }
  else updateIdleCamera(time);
  for (const u of updates) {
    if (u.errors > 5) continue;
    try { u.fn(dt, time); } catch (e) { if (++u.errors <= 2) console.error('[update hook]', e); }
  }
  if (!world) { frame.prev = now; stats.frame++; resolveFrameWaiters(); return; }
  gpuTimer.begin();
  try { pipeline.render(dt, time); } catch (e) {
    if (++stats.errors <= 2) console.error('[render]', e);
    if (stats.errors > 3 && pipeline.render !== fallbackRender) { console.error('[render] falling back to plain render'); pipeline = { render: fallbackRender }; }
  }
  gpuTimer.end(); gpuTimer.poll();
  stats.frame++;
  const raw = Math.min(250, now - (frame.prev || now)); frame.prev = now; // real interval (ms), for fps
  fpsAcc += raw / 1000; fpsN++; auto.sum += raw; auto.sq += raw * raw; auto.n++;
  if (fpsAcc > 1) {
    stats.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
    stats.gpuMs = gpuTimer.avg ? +gpuTimer.avg.toFixed(2) : null;
    autoQualityTick(stats.fps);
  }
  resolveFrameWaiters();
}
function resolveFrameWaiters() {
  if (!frameWaiters.length) return;
  const ready = frameWaiters.filter(w => stats.frame >= w.at); frameWaiters = frameWaiters.filter(w => stats.frame < w.at);
  ready.forEach(w => w.resolve());
}
function fallbackRender() { renderSceneToScreen(); }

// ---------------------------------------------------------------- test API
function setView(x, y, z, yawDeg = 0, pitchDeg = 0) {
  player.frozen = true;
  player.pos.set(x, y == null ? heightAt(x, z) : y - player.eye, z);
  player.yaw = yawDeg * deg; player.pitch = pitchDeg * deg;
  applyCamera(0);
}
function lookAt(x, y, z) {
  const dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z;
  player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  applyCamera(0);
}
// viewAnchor(id|index, dist, height): stand in front of an anchor (along its facing) and look at it
function viewAnchor(idOrIndex, dist = 5, height = 1.2) {
  const a = typeof idOrIndex === 'number' ? anchors[idOrIndex] : anchors.find(a => a.id === idOrIndex);
  if (!a) return false;
  const d = dirFromYawPitch(a.facing, 0);
  const x = a.pos.x + d.x * dist, z = a.pos.z + d.z * dist;
  setView(x, Math.max(heightAt(x, z) + player.eye, a.pos.y + height), z);
  lookAt(a.pos.x, a.pos.y + 0.25, a.pos.z);
  return true;
}
const test = {
  setView, lookAt, viewAnchor,
  unfreeze() { player.frozen = false; },
  // setStart(): stand at the level's start (painting view), frozen, as on the title screen
  setStart() { const S = layout.start; setView(S.x, S.y ?? null, S.z, (startYaw()) / deg, (startPitch()) / deg); },
  frames(n = 2) { return new Promise(resolve => frameWaiters.push({ at: stats.frame + n, resolve })); },
  setTime(t) { time = t; },
  log: LOG,
  stats() {
    const i = renderer.info;
    return {
      fps: stats.fps, gpuMs: stats.gpuMs, quality, frame: stats.frame, sceneCalls: stats.scene.calls, sceneTriangles: stats.scene.triangles,
      geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length,
      buildTimes: stats.buildTimes, anchors: anchors.length, colliders: colliders.length,
      level: game.level, playSeed, cats: game.total, found: game.found, state: game.state, errors: LOG.filter(l => l.level === 'error').length,
      modules: (window.SN_MODULES || []).filter(m => m.shell || !m.level || m.level === game.level).map(m => ({ name: (m.level ? m.level + '/' : '') + m.name, ok: !!m.ok, ms: stats.buildTimes[m.name] })),
      gl: { ...GL_INFO, attempts: undefined }, device, safe: params.safe,
    };
  },
};

// ---------------------------------------------------------------- debug overlays
function buildDebug() {
  if (params.debug.includes('anchors')) {
    const g = new THREE.SphereGeometry(0.18, 10, 8);
    const kinds = [...new Set(anchors.map(a => a.kind))];
    for (const a of anchors) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(kinds.indexOf(a.kind) / kinds.length, 1, 0.55), fog: false, depthTest: false }));
      m.position.copy(a.pos); m.renderOrder = 999; scene.add(m);
    }
  }
  if (params.debug.includes('colliders')) {
    const m = new THREE.LineBasicMaterial({ color: 0xff3366, depthTest: false });
    for (const c of colliders) {
      let pts;
      if (c.type === 'circle') pts = Array.from({ length: 17 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return new THREE.Vector3(c.x + Math.cos(a) * c.r, 0, c.z + Math.sin(a) * c.r); });
      else pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([sx, sz]) => { const lx = sx * c.hx, lz = sz * c.hz; return new THREE.Vector3(c.x + c.cos * lx + c.sin * lz, 0, c.z - c.sin * lx + c.cos * lz); });
      pts.forEach(p => (p.y = heightAt(p.x, p.z) + 0.3));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m); l.renderOrder = 999; scene.add(l);
    }
  }
}

// ---------------------------------------------------------------- the SN namespace
const SN = {
  THREE, params, version: 1,
  // infrastructure
  renderer, scene, camera, lights: { hemi, ambient, key: keyLight, moon: keyLight },
  on, off, emit, onUpdate, setPipeline, renderScene, renderSceneToScreen, viewSize, stats, test, log: LOG,
  get quality() { return quality; }, set quality(q) { quality = q; }, setQuality, isTouch,
  get reducedMotion() { return reducedMotion; }, isPortrait, startPitch, startYaw,
  device, texSize, storage: store,
  // helpers
  rng, hashStr, noise2, fbm2, clamp, lerp, smoothstep, deg, dirFromYawPitch,
  palette, color, paint, mat, geo,
  // levels
  levels, soon, level: null, levelById, isUnlocked, loadLevel, gotoLevel, toGallery, replay, levelUrl,
  playSeed, newPlaySeed,
  // world contract
  world: {
    layout, heightAt, normalAt, distToRoad, distToPolyline, surfaceAt, placeAt, keyDir, moonDir: keyDir,
    colliders, addBox, addCircle, collide,
    anchors, addAnchor,
    sightTests, addSightTest,
  },
  resumed: null, // {found, elapsed, hintsUsed, plays} when this load resumes a play (see "resume"); SN.resume() is un-pause
  // play
  input, player, aim, game, raycaster, rayFromNdc, spotAt, resetPlayer,
  startGame, pause, resume, win, continueFree, requestLock,
  store: null, // set by the store module (src/05-store.js): purchases and the painting gate
  build: window.SN_BUILD || { target: 'web' }, // from build.py: {target, version, webGate, appLinks, levels, soon, split?: {levels: {id: [urls]}}}
  time: 0, ready: false, modules: {},
};
window.SN = SN;

// ---------------------------------------------------------------- boot
async function boot() {
  try { await bootModules(); }
  catch (e) { console.error('[boot]', e); showFatal('Something went wrong while mixing the paints.<br>Please reload the page.'); }
}
// Every module / level script must have registered before boot takes its lists. Module scripts can
// run after this one with event-loop turns in between (slow networks), so wait for all the
// <script data-module> / <script data-level> tags build.py emitted; a script whose imports fail never
// registers, so give up on stragglers after 20 s and boot with what arrived.
async function waitForModules() {
  const expM = document.querySelectorAll('script[type="module"][data-module]').length - 1; // minus core
  const expL = document.querySelectorAll('script[type="module"][data-level]').length;
  const t0 = performance.now();
  while (((window.SN_MODULES || []).length < expM || (window.SN_LEVELS || []).length < expL) && performance.now() - t0 < 20000) {
    await new Promise(r => setTimeout(r, 25));
  }
  const gotM = (window.SN_MODULES || []).length, gotL = (window.SN_LEVELS || []).length;
  if (gotM < expM) console.error(`[boot] only ${gotM} of ${expM} modules registered; starting without the rest`);
  if (gotL < expL) console.error(`[boot] only ${gotL} of ${expL} paintings registered; starting without the rest`);
}
async function bootModules() {
  if (!renderer.getContext()) { showFatal('WebGL is not available in this browser.'); return; }
  await waitForModules();
  levels.push(...(window.SN_LEVELS || []).filter(l => l && l.id && !l.soon).sort((a, b) => (a.order ?? 50) - (b.order ?? 50)));
  // coming-soon teasers (levels/coming-soon.js): shown in the gallery, never loadable; SN.build.soon === false hides them
  if (SN.build.soon !== false) soon.push(...(window.SN_SOON || []).filter(l => l && l.id && !levelById(l.id)).sort((a, b) => (a.order ?? 50) - (b.order ?? 50)));
  if (!levels.length) { showFatal('No paintings found in this build.'); return; }
  setQuality(quality);
  // shell modules (store, ui): built now, before any painting — they only touch the DOM and subscribe
  const shell = (window.SN_MODULES || []).filter(m => m.shell).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  for (const m of shell) {
    const t0 = performance.now();
    try { const api = await m.build(SN); m.ok = true; if (api) SN.modules[m.name] = api; }
    catch (e) { m.ok = false; console.error(`[module ${m.name}] build failed:`, e); }
    stats.buildTimes[m.name] = Math.round(performance.now() - t0);
  }
  requestAnimationFrame(frame);
  emit('shellReady', { levels, soon });
  // ?level=<id> (or a test run) goes straight into that painting — once the store has its first answer, so
  // a bought painting's link opens — otherwise the gallery at once (it updates its locks on 'store')
  const want = params.level && levelById(params.level) ? params.level : null;
  const soonWanted = params.level && !want ? soon.find(t => t.id === params.level) || null : null;
  if (params.level && !want) {
    if (!soonWanted) console.warn(`[core] unknown level "${params.level}": showing the gallery`);
    try { history.replaceState(history.state, '', levelUrl(null)); } catch { /* file:// or sandboxed */ }
  }
  if (want) {
    try { await SN.store?.ready; } catch (e) { console.error('[core] store', e); }
    if (isUnlocked(want)) { await loadLevel(want); return; }
  }
  document.getElementById('sn-preload')?.remove();
  game.state = 'gallery';
  emit('gallery', { levels, soon });
  if (want) emit('locked', { id: want, level: levelById(want) }); // a locked painting's link: offer it
  if (soonWanted) emit('soonLink', { id: soonWanted.id, teaser: soonWanted }); // a coming-soon painting's link: show its teaser
}
// Deferred module scripts run while readyState is already 'interactive', so readyState alone can't tell
// whether DOMContentLoaded (which waits for all of them) is still to come — ask navigation timing.
let booted = false;
const bootOnce = () => { if (!booted) { booted = true; boot(); } };
const navEntry = performance.getEntriesByType?.('navigation')?.[0];
if (document.readyState === 'complete' || navEntry?.domContentLoadedEventStart > 0) setTimeout(bootOnce, 0);
else { document.addEventListener('DOMContentLoaded', bootOnce, { once: true }); addEventListener('load', bootOnce, { once: true }); }