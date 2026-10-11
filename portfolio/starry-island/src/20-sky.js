// 20-sky.js — Vincent's Cats: the sky of The Starry Night.
// Owns: the camera-centred sky dome — swirling currents, the great double swirl, the eleven stars
// in their concentric halos, Venus, the crescent moon in its blazing halo, and (for the rest of the
// dome) a Milky-Way band, a second smaller swirl behind the painter and many little haloed stars —
// plus the moon seat, a frame locked to the moon where one cat sleeps on the crescent.
//
// How it is made
//   1. PAINT (build, JS): ~34k brush strokes. Rows of dashes follow a flow field on the sphere:
//      broad horizontal currents, the great swirl (an Euler-spiral "S" that rolls up into two eyes),
//      circular currents round every star and the moon. Features add their own strokes on top —
//      swirl lanes, concentric halo rings, the crescent. Colours are sRGB, mixed like on a canvas.
//   2. BAKE (build, GPU): every stroke becomes a curved ribbon with soft bristled edges, a dry-brush
//      tail and a little impasto light; a CubeCamera rasterises them back-to-front into a cube map
//      (no seams, no pinching at the zenith). The strokes are kept as a compact log, so the cube is
//      re-baked identically after a WebGL context loss.
//   3. DOME (every frame): a sphere centred on the camera samples the cube map. Cheap life on top,
//      on every quality: the swirls breathe, halo rings turn gently back and forth, stars pulse
//      (eased to stillness under reduced motion). Star cores and the crescent write alpha 0.5 (the
//      post module's glow mask); everything else writes alpha 1.
//   4. MOON SEAT: an Object3D kept MOON_D metres out along moonDir, facing the viewer. Its XY plane
//      is the moon's gnomonic plane, so a child placed at the seat sits on the painted crescent.
//   5. SHOOTING STARS: a rare painted streak in the upper sky, and a guiding one that falls toward
//      the hinted cat on 'hint' (one small mesh, drawn only while a star falls).
import * as THREE from 'three';

(window.SN_MODULES ||= []).push({
  name: 'sky', level: 'starry-night', order: 20,
  async build(SN) {
    const { palette: PAL, deg, clamp, lerp, smoothstep } = SN;
    const layout = SN.world.layout;
    const QS = new URLSearchParams(location.search);
    const rnd = SN.rng('sky');
    const timing = {};
    let tLap = performance.now();
    const lap = name => { const n = performance.now(); timing[name] = Math.round(n - tLap); tLap = n; };

    // ------------------------------------------------------------ vectors, frames, painting view
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);
    const pitchOf = d => Math.asin(clamp(d.y, -1, 1));
    const yawOf = d => Math.atan2(-d.x, -d.z);
    // painting position (x from left, y from top, 0..1) -> direction: the exact ray through that
    // point of the start camera (yaw 0, pitch 16°, vfov 65°, 16:9). The yaw/pitch shorthand in the
    // brief drifts by up to ~10° in the upper corners because the camera is pitched up.
    const TAN_V = Math.tan(32.5 * deg), TAN_H = TAN_V * 16 / 9, P0 = layout.start.pitch;
    const CAM_F = V(0, Math.sin(P0), -Math.cos(P0)), CAM_U = V(0, Math.cos(P0), Math.sin(P0));
    const paintDir = (x, y) => CAM_F.clone().addScaledVector(V(1, 0, 0), (x - 0.5) * 2 * TAN_H).addScaledVector(CAM_U, (0.5 - y) * 2 * TAN_V).normalize();
    // local tangent frame at direction c: r = right, u = up, as seen when looking straight at c
    function frameAt(c) {
      const r = V().crossVectors(c, UP);
      if (r.lengthSq() < 1e-8) r.set(1, 0, 0);
      r.normalize();
      return { c: c.clone().normalize(), r, u: V().crossVectors(r, c).normalize() };
    }
    // gnomonic (tangent-plane) coordinates around a frame, in tan-angle units
    const fromLocal = (f, x, y, out = V()) => out.copy(f.c).addScaledVector(f.r, x).addScaledVector(f.u, y).normalize();
    const chord = (a, b) => Math.sqrt(Math.max(0, 2 - 2 * a.dot(b)));

    // ------------------------------------------------------------ colours (sRGB 0..1, like paint on a canvas)
    const C = hex => SN.color.hexToRgb(hex).map(v => v / 255);
    const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    function vary(c, r, amt = 0.08, hue = 0.03) {
      const k = 1 + (r() * 2 - 1) * amt, h = (r() * 2 - 1) * hue;
      return [clamp(c[0] * k * (1 + h), 0, 1), clamp(c[1] * k, 0, 1), clamp(c[2] * k * (1 - h), 0, 1)];
    }
    const pickW = (list, r) => { let t = r() * list.reduce((s, x) => s + x[1], 0); for (const [c, w] of list) if ((t -= w) <= 0) return c; return list[0][0]; };
    function ramp(stops, t) { // stops: [[t, colour], ...] ascending
      if (t <= stops[0][0]) return stops[0][1];
      for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        return mixC(c0, c1, (t - t0) / (t1 - t0));
      }
      return stops[stops.length - 1][1];
    }
    const K = {
      fog: C(PAL.fog), deep: C(PAL.skyDeep), night: C(PAL.skyNight), ultra: C(PAL.ultramarine), cobalt: C(PAL.cobalt),
      cer: C(PAL.cerulean), swirl: C(PAL.swirl), pale: C(PAL.swirlPale), mint: C(PAL.mint),
      white: C(PAL.starWhite), yellow: C(PAL.starYellow), chrome: C(PAL.chrome), orange: C(PAL.moonOrange), ochre: C(PAL.ochre),
      mid: C('#2349a0'), azure: C('#3b72c0'), ice: C('#e2eff0'), lime: C('#dfe697'), cream: C('#fbeaa6'),
      prussian: C('#163a78'), teal: C('#3f8fa8'), pearl: C('#f3f6e4'),
    };

    // ------------------------------------------------------------ the features and where they sit
    // Eleven stars roughly where Van Gogh put them, in painting coordinates of the start view: two
    // upper left (clear of the cypress), three along the top, a cluster right of and under the swirl,
    // one low on the right just above the Alpilles ridge. [x, y, core°, halo°]
    const MAIN = [
      [0.070, 0.115, 0.62, 3.3], [0.098, 0.345, 0.52, 2.8],                              // upper left
      [0.345, 0.075, 0.56, 3.0], [0.525, 0.058, 0.50, 2.8], [0.675, 0.100, 0.58, 3.1],   // along the top
      [0.705, 0.305, 0.64, 3.4], [0.640, 0.458, 0.50, 2.7], [0.790, 0.415, 0.60, 3.1],   // right of the swirl
      [0.875, 0.262, 0.50, 2.7], [0.555, 0.468, 0.44, 2.4],
      [0.955, 0.372, 0.54, 2.9],                                                         // low right, above the hills
    ];
    const stars = MAIN.map(([x, y, core, halo], i) => ({ dir: paintDir(x, y), core: core * deg, halo: halo * deg, kind: 'star', i }));
    const venus = { dir: SN.dirFromYawPitch(layout.venus.yaw, layout.venus.pitch), core: 1.0 * deg, halo: 5.6 * deg, kind: 'venus' };
    const moonDir = SN.world.moonDir.clone().normalize();
    const moonF = frameAt(moonDir);
    const MOON = { halo: 5.0 * deg, R: Math.tan(2.45 * deg), off: Math.tan(1.18 * deg), phi: 150 * deg, Ri: Math.tan(2.02 * deg) };
    MOON.ci = [MOON.off * Math.cos(MOON.phi), MOON.off * Math.sin(MOON.phi)];
    const swirlDir = SN.dirFromYawPitch(layout.swirl.yaw, layout.swirl.pitch);
    const behindDir = SN.dirFromYawPitch(198 * deg, 31 * deg);
    const zenithDir = SN.dirFromYawPitch(150 * deg, 83 * deg);
    // the Milky Way: a softly meandering band round a great circle arching behind the painter
    const MW = { n: SN.dirFromYawPitch(8 * deg, 27 * deg).multiplyScalar(-1), half: 9 * deg };
    MW.b1 = V().crossVectors(MW.n, UP).normalize(); MW.b2 = V().crossVectors(MW.n, MW.b1).normalize();
    // signed distance from the band's wavy centre line, in units of sin(angle)
    const mwOffset = d => { const ph = Math.atan2(d.dot(MW.b2), d.dot(MW.b1)); return d.dot(MW.n) - 0.07 * Math.sin(ph * 2 + 0.7) - 0.035 * Math.sin(ph * 5 + 2.1); };

    // the painting frame (start view): extra stars and dust keep out of it so the view stays Van Gogh's
    const frameDist = d => { const y = Math.abs(yawOf(d)) / deg, p = pitchOf(d) / deg; return Math.max(y - 54, p - 54); };

    // minor stars for the rest of the dome (Poisson-ish), plus a lovely one near the zenith
    const minor = [{ dir: zenithDir.clone(), core: 0.42 * deg, halo: 2.6 * deg, kind: 'minor' }];
    const avoid = [...stars, venus, { dir: moonDir, halo: 5 * deg }, { dir: behindDir, halo: 9 * deg }];
    for (let tries = 0; tries < 3000 && minor.length < 40; tries++) {
      const y = rnd() * Math.PI * 2, p = Math.asin(lerp(Math.sin(9 * deg), 0.985, rnd()));
      const d = SN.dirFromYawPitch(y, p);
      if (frameDist(d) < 3) continue;
      const halo = lerp(1.2, 2.7, rnd() ** 1.4) * deg;
      let ok = true;
      for (const s of minor) if (chord(d, s.dir) < s.halo + halo + 6 * deg) { ok = false; break; }
      if (ok) for (const s of avoid) if (chord(d, s.dir) < s.halo + halo + 5 * deg) { ok = false; break; }
      if (ok) minor.push({ dir: d, core: halo * lerp(0.17, 0.24, rnd()), halo, kind: 'minor' });
    }

    // ------------------------------------------------------------ the great swirl: an Euler-spiral spine
    // heading = s²/2, so curvature grows with arc length and both ends roll up into eyes: the S-shaped
    // breaking wave. The field (flow direction + weight) is precomputed on a grid in spine units by
    // kernel-summing spine tangents, and shared by both swirls.
    function makeSpine(S = 3.8, n = 200, kL = 1.04, kR = 0.9) {
      const arm = [[0, 0, 1, 0, 0]], ds = S / n;
      let x = 0, y = 0;
      for (let i = 1; i <= n; i++) {
        const sm = (i - 0.5) * ds; x += Math.cos(sm * sm / 2) * ds; y += Math.sin(sm * sm / 2) * ds;
        const s = i * ds; arm.push([x, y, Math.cos(s * s / 2), Math.sin(s * s / 2), s]);
      }
      const pts = [];
      for (let i = n; i >= 1; i--) { const a = arm[i]; pts.push([-a[0] * kL, -a[1] * kL, a[2], a[3], -a[4], kL]); }
      for (let i = 0; i <= n; i++) { const a = arm[i]; pts.push([a[0] * kR, a[1] * kR, a[2], a[3], a[4], kR]); }
      return { pts, S, kL, kR, eyeL: [-0.886 * kL, -0.886 * kL], eyeR: [0.886 * kR, 0.886 * kR] };
    }
    function makeSwirlField(spine, nx = 132, ny = 108, x0 = -2.2, x1 = 2.2, y0 = -1.8, y1 = 1.8, sigma = 0.17) {
      const N = nx * ny, F = { nx, ny, x0, x1, y0, y1, fx: new Float32Array(N), fy: new Float32Array(N), w: new Float32Array(N) };
      const inv = 1 / (sigma * sigma), cut = 9 * sigma * sigma, pts = spine.pts;
      const spacing = (spine.S / 200) * 0.99, ref = (Math.sqrt(Math.PI) * sigma) / spacing;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const qx = x0 + ((x1 - x0) * i) / (nx - 1), qy = y0 + ((y1 - y0) * j) / (ny - 1);
        let sx = 0, sy = 0, sw = 0;
        for (let k = 0; k < pts.length; k++) {
          const p = pts[k], dx = qx - p[0], dy = qy - p[1], d2 = dx * dx + dy * dy;
          if (d2 < cut) { const w = Math.exp(-d2 * inv) / p[5]; sx += p[2] * w; sy += p[3] * w; sw += w; }
        }
        const id = j * nx + i, l = Math.hypot(sx, sy) || 1;
        F.fx[id] = sx / l; F.fy[id] = sy / l; F.w[id] = Math.min(1, sw / ref);
      }
      return F;
    }
    function sampleField(F, ux, uy, out) {
      const gx = ((ux - F.x0) / (F.x1 - F.x0)) * (F.nx - 1), gy = ((uy - F.y0) / (F.y1 - F.y0)) * (F.ny - 1);
      if (!(gx >= 0 && gy >= 0 && gx < F.nx - 1 && gy < F.ny - 1)) { out.w = 0; return out; }
      const i = gx | 0, j = gy | 0, tx = gx - i, ty = gy - j, a = j * F.nx + i, b = a + 1, c = a + F.nx, d = c + 1;
      const bl = arr => lerp(lerp(arr[a], arr[b], tx), lerp(arr[c], arr[d], tx), ty);
      out.fx = bl(F.fx); out.fy = bl(F.fy); out.w = bl(F.w);
      return out;
    }
    const spine = makeSpine();
    const field = makeSwirlField(spine);
    lap('swirlField');
    // two swirls share the field: frame, scale (tan units per spine unit), rotation, mirror
    const swirls = [
      { f: frameAt(swirlDir), a: 0.25, rot: -31 * deg, mirror: 1, str: 3.2, main: true },
      { f: frameAt(behindDir), a: 0.15, rot: -36 * deg, mirror: -1, str: 2.6, main: false },
    ];
    // the midpoint between the eyes sits on the feature's direction
    const mid = [(spine.eyeL[0] + spine.eyeR[0]) / 2, (spine.eyeL[1] + spine.eyeR[1]) / 2];
    for (const sw of swirls) { sw.cos = Math.cos(sw.rot); sw.sin = Math.sin(sw.rot); sw.ox = mid[0]; sw.oy = mid[1]; }
    // spine units -> direction on the sky
    function swirlToDir(sw, ux, uy, out = V()) {
      ux -= sw.ox; uy -= sw.oy;
      const x = (sw.cos * ux - sw.sin * uy) * sw.a * sw.mirror, y = (sw.sin * ux + sw.cos * uy) * sw.a;
      return fromLocal(sw.f, x, y, out);
    }
    // direction -> field sample (+ world tangent). Returns weight 0..1
    const _fs = { fx: 0, fy: 0, w: 0 };
    function swirlSample(sw, d, outT) {
      const k = d.dot(sw.f.c);
      if (k < 0.5) return 0;
      const x = (d.dot(sw.f.r) / k) * sw.mirror, y = d.dot(sw.f.u) / k;
      const ux = (sw.cos * x + sw.sin * y) / sw.a + sw.ox, uy = (-sw.sin * x + sw.cos * y) / sw.a + sw.oy;
      sampleField(field, ux, uy, _fs);
      if (_fs.w <= 0.001) return 0;
      if (outT) {
        const tx = (sw.cos * _fs.fx - sw.sin * _fs.fy) * sw.mirror, ty = sw.sin * _fs.fx + sw.cos * _fs.fy;
        outT.copy(sw.f.r).multiplyScalar(tx).addScaledVector(sw.f.u, ty);
        outT.addScaledVector(d, -outT.dot(d)).normalize();
      }
      return _fs.w;
    }

    // ------------------------------------------------------------ the flow field
    // Circular currents: every star, Venus, the moon, the zenith. Packed flat for speed.
    const vortices = [];
    const addVortex = (dir, range, str, spin, spiral) => vortices.push({ x: dir.x, y: dir.y, z: dir.z, range, cosR: Math.cos(range), str, spin, ca: Math.cos(spiral), sa: Math.sin(spiral) });
    for (const s of stars) addVortex(s.dir, s.halo * 1.75, 4, rnd.sign(), 0.08);
    addVortex(venus.dir, venus.halo * 1.6, 4, 1, 0.06);
    addVortex(moonDir, MOON.halo * 1.55, 4.5, -1, 0.04);
    for (const s of minor) addVortex(s.dir, s.halo * 1.9, 3, rnd.sign(), 0.12);
    addVortex(V(0, 1, 0), 22 * deg, 1.2, 1, 0.3);
    const _sT = V(), _mwT = V();
    // flowAt(d, out): unit tangent at unit direction d. Sign is arbitrary; callers keep continuity.
    function flowAt(d, out, noSwirl = false) {
      const py = d.y, cp = Math.sqrt(Math.max(1e-9, d.x * d.x + d.z * d.z)), pd = Math.asin(clamp(py, -1, 1)) / deg;
      const ex = d.z / cp, ez = -d.x / cp;                        // east: circles round the zenith
      const nx = (-d.x * py) / cp, ny = cp, nz = (-d.z * py) / cp; // north: toward the zenith
      const yaw = Math.atan2(-d.x, -d.z);
      const wav = 0.68 * smoothstep(5, 28, pd) * (0.62 * Math.sin(3 * yaw + pd * 0.09 + 1.1) + 0.5 * SN.noise2(d.x * 1.7 + d.y * 0.8 + 11, d.z * 1.7 - d.y * 1.1));
      const wb = 0.45 + 3.2 * (1 - smoothstep(3, 15, pd));
      const cw = Math.cos(wav) * wb, sn = Math.sin(wav) * wb;
      let fx = ex * cw + nx * sn, fy = ny * sn, fz = ez * cw + nz * sn;
      for (let i = 0; i < vortices.length; i++) {
        const v = vortices[i], c = d.x * v.x + d.y * v.y + d.z * v.z;
        if (c <= v.cosR) continue;
        const x2 = (2 - 2 * c) / (v.range * v.range);
        if (x2 >= 1) continue;
        const w = v.str * (1 - x2) * (1 - x2);
        let tx = v.y * d.z - v.z * d.y, ty = v.z * d.x - v.x * d.z, tz = v.x * d.y - v.y * d.x;
        const tl = Math.hypot(tx, ty, tz); if (tl < 1e-7) continue;
        let ix = v.x - d.x * c, iy = v.y - d.y * c, iz = v.z - d.z * c;
        const il = Math.hypot(ix, iy, iz) || 1;
        const a = (v.spin * v.ca * w) / tl, b = (v.sa * w) / il;
        fx += tx * a + ix * b; fy += ty * a + iy * b; fz += tz * a + iz * b;
      }
      if (!noSwirl) for (const sw of swirls) {
        const w = swirlSample(sw, d, _sT);
        if (w > 0) {
          // align with the running sum so opposite tangents don't cancel
          const s = (_sT.x * fx + _sT.y * fy + _sT.z * fz) < 0 ? -1 : 1, k = sw.str * w * s;
          fx += _sT.x * k; fy += _sT.y * k; fz += _sT.z * k;
        }
      }
      const e = mwOffset(d);
      if (Math.abs(e) < 0.3) {
        _mwT.crossVectors(MW.n, d).normalize();
        const s = (_mwT.x * fx + _mwT.y * fy + _mwT.z * fz) < 0 ? -1.2 : 1.2, k = s * Math.exp(-((e / 0.13) ** 2));
        fx += _mwT.x * k; fy += _mwT.y * k; fz += _mwT.z * k;
      }
      out.set(fx, fy, fz);
      out.addScaledVector(d, -out.dot(d));
      if (out.lengthSq() < 1e-10) out.set(ex, 0, ez);
      return out.normalize();
    }
    // RK2 step along the flow on the sphere; keeps the direction continuous with `prev`
    const _k1 = V(), _k2 = V(), _m = V();
    function advance(p, h, prev, flow = flowAt) {
      flow(p, _k1); if (prev && _k1.dot(prev) < 0) _k1.negate();
      _m.copy(p).addScaledVector(_k1, h * 0.5).normalize();
      flow(_m, _k2); if (_k2.dot(_k1) < 0) _k2.negate();
      p.addScaledVector(_k2, h).normalize();
      if (prev) prev.copy(_k2);
      return p;
    }

    // ------------------------------------------------------------ the colour of the sky itself
    // baseColour(d): the ground tone under the strokes — prussian/ultramarine high up, cobalt lower,
    // a luminous band over the hills, fog colour below the horizon (distant hills melt into it).
    const BASE_STOPS = [[-90, K.fog], [-0.5, K.fog], [1.5, mixC(K.fog, K.azure, 0.55)], [5, mixC(K.cobalt, K.cer, 0.35)], [12, K.cobalt], [22, mixC(K.cobalt, K.ultra, 0.6)], [36, K.ultra], [55, mixC(K.ultra, K.night, 0.6)], [75, K.night], [90, mixC(K.night, K.deep, 0.5)]];
    const mainSwirl = swirls[0];
    function baseColour(d) {
      const pd = pitchOf(d) / deg;
      let c = ramp(BASE_STOPS, pd);
      const n = SN.noise2(d.x * 2.6 + d.y * 1.3 + 3, d.z * 2.6 - d.y * 1.9) * 0.5 + SN.noise2(d.x * 7 - 5, d.z * 7 + d.y * 5) * 0.25;
      c = c.map(v => v * (1 + n * 0.16));
      const sw = swirlSample(mainSwirl, d, null);
      if (sw > 0) c = mixC(c, K.azure, 0.3 * sw);
      return c;
    }
    // general stroke colours by height in the sky
    const PAL_HIGH = [[K.deep, 1.5], [K.night, 3], [K.ultra, 3], [K.mid, 1.5], [K.cobalt, 1], [K.azure, 0.4], [K.prussian, 1]];
    const PAL_MID = [[K.night, 1.2], [K.ultra, 3], [K.mid, 2], [K.cobalt, 3], [K.azure, 1.4], [K.cer, 0.7], [K.swirl, 0.15], [K.prussian, 0.6]];
    const PAL_LOW = [[K.ultra, 1], [K.cobalt, 3], [K.azure, 2], [K.cer, 1.6], [K.swirl, 0.6], [K.mint, 0.25]];
    const haloed = [...stars, venus];
    function currentColour(d, r) {
      const pd = pitchOf(d) / deg;
      const pal = pd > 42 ? PAL_HIGH : pd > 13 ? PAL_MID : PAL_LOW;
      let c = mixC(pickW(pal, r), baseColour(d), 0.45);
      // near a star the sky is paler (the halos leak into the currents)
      for (const s of haloed) {
        const x = chord(d, s.dir) / (s.halo * 1.8);
        if (x < 1) c = mixC(c, r() < 0.5 ? K.swirl : K.cer, 0.45 * (1 - x) * (1 - x));
      }
      const mx = chord(d, moonDir) / (MOON.halo * 1.6);
      if (mx < 1) c = mixC(c, r() < 0.6 ? K.teal : K.swirl, 0.4 * (1 - mx));
      c = mixC(c, K.fog, 1 - smoothstep(-1, 2.5, pd));   // melt into the fog below the horizon
      return vary(c, r, 0.08);
    }

    // ------------------------------------------------------------ stroke log
    // Painting only records strokes: each one's centreline (K points) and look, in double precision,
    // ~7 MB for the whole sky. ribbons() turns the log into GPU ribbons for a bake and the ribbons are
    // dropped again afterwards, so the cube map can be re-baked bit for bit whenever the WebGL context
    // is lost (a lost context empties every render target) at a third of the memory of keeping them.
    // Record: n, width, r, g, b, alpha, flip, seed, then n × (x, y, z).
    const slog = {
      a: new Float64Array(1 << 20), n: 0, strokes: 0, nv: 0, ni: 0,
      grow(k) {
        if (this.n + k <= this.a.length) return;
        const a = new Float64Array(Math.max(this.a.length * 2, this.n + k)); a.set(this.a.subarray(0, this.n)); this.a = a;
      },
    };
    function stroke(pts, width, col, alpha = 1, flip = false, seed = rnd()) {
      const n = pts.length; if (n < 2) return;
      let S = 0;
      for (let k = 1; k < n; k++) S += pts[k].distanceTo(pts[k - 1]);
      if (S < 1e-6) return;
      slog.grow(8 + 3 * n);
      const L = slog.a; let o = slog.n;
      L[o++] = n; L[o++] = width; L[o++] = col[0]; L[o++] = col[1]; L[o++] = col[2]; L[o++] = alpha; L[o++] = flip ? 1 : 0; L[o++] = seed;
      for (let k = 0; k < n; k++) { const P = pts[k]; L[o++] = P.x; L[o++] = P.y; L[o++] = P.z; }
      slog.n = o; slog.strokes++; slog.nv += 2 * n; slog.ni += 6 * (n - 1);
    }
    // Each stroke becomes a ribbon along its centreline. Vertex data:
    //   uv    = (along 0..1 from the loaded head to the dry tail, across -1..1)
    //   aCol  = sRGB colour + opacity
    //   aInfo = (half-length in half-widths, seed, light·along, light·across)
    const LIGHT = V(-0.35, 1, 0.3).normalize(); // impasto light from over the painter's left shoulder
    const _T = V(), _B = V(), _P = V(), _A = V(), _Bp = V(), _acc = new Float32Array(64);
    function ribbons() {
      const NV = slog.nv, L = slog.a;
      const pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), col = new Float32Array(NV * 4), info = new Float32Array(NV * 4);
      const idx = new Uint32Array(slog.ni);
      let nv = 0, ni = 0;
      for (let o = 0; o < slog.n;) {
        const n = L[o], width = L[o + 1], c0 = L[o + 2], c1 = L[o + 3], c2 = L[o + 4], alpha = L[o + 5], flip = L[o + 6] > 0.5, seed = L[o + 7], p0 = o + 8;
        o = p0 + 3 * n;
        let S = 0; _acc[0] = 0;
        for (let k = 1; k < n; k++) {
          const q = p0 + 3 * k, dx = L[q] - L[q - 3], dy = L[q + 1] - L[q - 2], dz = L[q + 2] - L[q - 1];
          S += Math.sqrt(dx * dx + dy * dy + dz * dz); _acc[k] = S;
        }
        const hw = width / 2, v0 = nv, hl = S / width;
        for (let k = 0; k < n; k++) {
          _P.fromArray(L, p0 + 3 * k); _A.fromArray(L, p0 + 3 * Math.max(0, k - 1)); _Bp.fromArray(L, p0 + 3 * Math.min(n - 1, k + 1));
          _T.subVectors(_Bp, _A); _T.addScaledVector(_P, -_T.dot(_P)).normalize();
          _B.crossVectors(_P, _T).normalize();
          const la = LIGHT.dot(_T) * (flip ? -1 : 1), lb = LIGHT.dot(_B), u = flip ? 1 - _acc[k] / S : _acc[k] / S;
          for (let side = 1; side >= -1; side -= 2) {
            const v = nv++;
            pos[v * 3] = _P.x + _B.x * hw * side; pos[v * 3 + 1] = _P.y + _B.y * hw * side; pos[v * 3 + 2] = _P.z + _B.z * hw * side;
            uv[v * 2] = u; uv[v * 2 + 1] = side;
            col[v * 4] = c0; col[v * 4 + 1] = c1; col[v * 4 + 2] = c2; col[v * 4 + 3] = alpha;
            info[v * 4] = hl; info[v * 4 + 1] = seed; info[v * 4 + 2] = la; info[v * 4 + 3] = lb;
          }
        }
        for (let k = 0; k < n - 1; k++) {
          const a = v0 + 2 * k;
          idx[ni++] = a; idx[ni++] = a + 1; idx[ni++] = a + 2;
          idx[ni++] = a + 1; idx[ni++] = a + 3; idx[ni++] = a + 2;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
      g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      return g;
    }
    // a row of dashes along the flow from `seed` (not mutated); colour may be fn(dir, rng)
    function row(seed, { dashes, len, width, gap, colour, alpha = 1, flow = flowAt, steps = 5, toward }) {
      const p = seed.clone(), T = V();
      flow(p, T);
      if (toward && T.dot(toward) < 0) T.negate();
      const flip = rnd() < 0.5, nd = rnd.int(dashes[0], dashes[1]);
      const W = rnd.range(width[0], width[1]) * deg;
      const base = typeof colour === 'function' ? colour(seed, rnd) : colour;
      for (let k = 0; k < nd; k++) {
        const Ld = rnd.range(len[0], len[1]) * deg, pts = [p.clone()];
        for (let s = 0; s < steps; s++) { advance(p, Ld / steps, T, flow); pts.push(p.clone()); }
        stroke(pts, W * rnd.range(0.85, 1.1), vary(base, rnd, 0.05, 0.015), alpha, flip);
        advance(p, rnd.range(gap[0], gap[1]) * deg, T, flow);
      }
    }
    // a single dash along an explicit arc (circle round centre frame f, radius rr, angles a0..a1)
    function arc(f, rr, a0, a1, width, col, alpha = 1, wobble = 0, n = 6) {
      width = Math.min(width, rr * 1.3);            // a ribbon tighter than its half-width folds over
      const pts = [], t = Math.tan(rr);
      for (let i = 0; i <= n; i++) {
        const a = lerp(a0, a1, i / n), w = 1 + wobble * Math.sin(a * 3 + rr * 50);
        pts.push(fromLocal(f, Math.cos(a) * t * w, Math.sin(a) * t * w));
      }
      stroke(pts, width, col, alpha, rnd() < 0.5);
    }
    // fibonacci lattice point i of n on the sphere
    const fib = (i, n) => { const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653; return V(Math.cos(th) * r, y, Math.sin(th) * r); };
    const jitterDir = (d, amt) => d.clone().add(V(rnd.gauss(), rnd.gauss(), rnd.gauss()).multiplyScalar(amt)).normalize();

    // ------------------------------------------------------------ PAINT: layer 1 — underpainting
    // broad, soft strokes in the ground tone so the gaps between later strokes stay varied
    {
      const N = 5200;
      for (let i = 0; i < N; i++) {
        const d = jitterDir(fib(i, N), 0.02);
        if (pitchOf(d) < -4 * deg) continue;
        row(d, { dashes: [1, 1], len: [4.5, 7.5], width: [1.6, 2.4], gap: [0, 0], alpha: 0.85, colour: (q, r) => vary(mixC(baseColour(q), K.deep, 0.18), r, 0.12) });
      }
    }
    lap('underpaint');

    // ------------------------------------------------------------ PAINT: layer 2 — the currents
    // rows of rhythmic dashes following the flow, coloured by height; finer near stars and the swirl
    {
      const N = 11000;
      for (let i = 0; i < N; i++) {
        const d = jitterDir(fib(i, N), 0.012);
        const pd = pitchOf(d) / deg;
        if (pd < -3) continue;
        const high = smoothstep(40, 75, pd), k = rnd.range(0.78, 1.25);
        row(d, {
          dashes: [2, 4], len: [lerp(1.9, 2.5, high) * k, lerp(3.4, 4.4, high) * k], width: [lerp(0.6, 0.78, high) * k, lerp(0.86, 1.08, high) * k],
          gap: [0.25, 0.7], colour: currentColour,
        });
      }
    }
    lap('currents');

    // ------------------------------------------------------------ PAINT: layer 2b — streams
    // long lighter currents: a streamline traced far across the sky, painted as parallel lanes,
    // tapering at both ends — the rivers of light between the stars.
    function stream(start, toward, { length = 60, lanes = 4, spacing = 0.72, colours, width = [0.55, 0.75], len = [2.2, 3.6], density = 0.6 }) {
      const p = start.clone(), T = V();
      flowAt(p, T); if (T.dot(toward) < 0) T.negate();
      const step = 1.4;
      for (let L = 0; L < length; L += step) {
        const B = V().crossVectors(p, T).normalize(), fade = Math.sqrt(Math.sin((Math.PI * L) / length));
        for (let k = 0; k < lanes; k++) {
          if (rnd() > density * fade) continue;
          const c = (lanes - 1) / 2, u = c ? Math.abs(k - c) / c : 0;
          const q = p.clone().addScaledVector(B, ((k - c) * spacing + rnd.range(-0.2, 0.2)) * deg).normalize();
          row(q, { dashes: [1, 2], len, width, gap: [0.2, 0.5], colour: vary(ramp(colours, clamp(u + rnd.range(-0.15, 0.15), 0, 1)), rnd, 0.06), toward: T });
        }
        advance(p, step * deg, T);
      }
    }
    const LIGHT_STREAM = [[0, mixC(K.swirl, K.pale, 0.4)], [0.35, K.swirl], [0.7, K.cer], [1, K.azure]];
    const SOFT_STREAM = [[0, mixC(K.cer, K.swirl, 0.3)], [0.5, K.azure], [1, K.cobalt]];
    // in the painting: a pale current low across the sky under the stars, a softer one along the top
    stream(paintDir(0.34, 0.49), V(1, 0, 0), { length: 62, lanes: 5, colours: LIGHT_STREAM, density: 0.55 });
    stream(paintDir(0.0, 0.2), V(1, 0, 0), { length: 50, lanes: 3, colours: SOFT_STREAM, density: 0.5 });
    // two lighter currents that curl into the whirl at the zenith
    stream(SN.dirFromYawPitch(120 * deg, 58 * deg), V(0, 1, 0), { length: 75, lanes: 4, colours: SOFT_STREAM, density: 0.7 });
    stream(SN.dirFromYawPitch(-60 * deg, 62 * deg), V(0, 1, 0), { length: 65, lanes: 3, colours: LIGHT_STREAM, density: 0.6 });
    // round the rest of the dome
    for (let i = 0, tries = 0; i < 9 && tries < 200; tries++) {
      const d = SN.dirFromYawPitch(rnd() * 6.283, rnd.range(12, 70) * deg);
      if (frameDist(d) < 6) continue;
      i++;
      stream(d, V(rnd.gauss(), 0, rnd.gauss()), { length: rnd.range(35, 70), lanes: rnd.int(4, 6), colours: rnd() < 0.3 ? LIGHT_STREAM : SOFT_STREAM, density: 0.7 });
    }
    lap('streams');

    // ------------------------------------------------------------ PAINT: layer 3 — the luminous band over the hills
    {
      const N = 24000; // lattice over the whole sphere; only the thin band above the horizon survives
      for (let i = 0; i < N; i++) {
        const d = jitterDir(fib(i, N), 0.01);
        const pd = pitchOf(d) / deg;
        if (pd < 0.2 || pd > 24) continue;
        const front = 0.5 + 0.5 * Math.max(0, Math.cos(yawOf(d) + 20 * deg));
        const lvl = Math.exp(-(((pd - 10) / 6.5) ** 2)) * front * smoothstep(0.3, 4, pd);
        if (rnd() > 0.15 + lvl * 0.7) continue;
        const c = ramp([[0, K.cobalt], [0.3, K.azure], [0.55, K.cer], [0.8, K.swirl], [1, K.pale]], clamp(lvl * rnd.range(0.6, 1.1), 0, 1));
        row(d, { dashes: [2, 3], len: [3.2, 5.2], width: [0.55, 0.8], gap: [0.2, 0.5], colour: rnd() < 0.12 ? mixC(c, K.mint, 0.5) : c });
      }
    }
    lap('horizon');

    // ------------------------------------------------------------ PAINT: layer 4 — the Milky Way behind the painter
    {
      const N = 20000;
      const mwCol = (q, r) => {
        const e = Math.abs(mwOffset(q)) / Math.sin(MW.half);
        const c = ramp([[0, K.swirl], [0.3, mixC(K.swirl, K.cer, 0.5)], [0.6, K.cer], [0.85, K.azure], [1, K.cobalt]], clamp(e + r.range(-0.25, 0.25), 0, 1));
        return vary(r() < 0.1 ? mixC(c, K.pale, 0.6) : r() < 0.08 ? mixC(c, K.mint, 0.5) : c, r, 0.08);
      };
      for (let i = 0; i < N; i++) {
        const d = fib(i, N);
        const e = Math.abs(mwOffset(d)) / Math.sin(MW.half);
        if (e > 1 || pitchOf(d) < 2 * deg) continue;
        const fd = frameDist(d);
        if (rnd() > (0.75 - e * 0.45) * smoothstep(-2, 10, fd)) continue;
        row(jitterDir(d, 0.01), { dashes: [2, 3], len: [1.8, 3.2], width: [0.5, 0.75], gap: [0.25, 0.6], colour: mwCol, alpha: 0.9 });
      }
    }
    lap('milkyway');

    // ------------------------------------------------------------ PAINT: layer 5 — the swirls
    // lanes seeded across the ribbon at stations along the spine, flowing with the swirl field only;
    // a lane keeps the colour of its seed offset, so the pale bands follow the flow into the eyes.
    const swirlFlows = swirls.map(sw => (d, out) => { const w = swirlSample(sw, d, out); if (w <= 0.02) flowAt(d, out, true); return out; });
    function laneColour(o, s, sw, r) {
      const band = Math.abs(o), into = smoothstep(1.4, 3.6, Math.abs(s));
      const stripe = 0.5 + 0.5 * Math.cos(band * Math.PI * 2.7);
      let b = stripe * (1 - 0.5 * band) * (1 - 0.35 * into) + r.range(-0.12, 0.12);
      if (!sw.main) b *= 0.8;
      let c = ramp([[0, K.cobalt], [0.2, K.azure], [0.4, K.cer], [0.6, K.swirl], [0.8, K.pale], [1, K.ice]], clamp(b, 0, 1));
      if (r() < 0.1) c = mixC(c, K.mint, 0.6);
      if (r() < 0.04 && b > 0.6) c = mixC(c, K.lime, 0.4);
      return c;
    }
    for (let si = 0; si < swirls.length; si++) {
      const sw = swirls[si], flow = swirlFlows[si], pts = spine.pts;
      const lane = (sw.main ? 0.58 : 0.72) * deg / sw.a;            // lane spacing in spine units
      for (let k = 0; k < pts.length; k += 4) {
        const [px, py, tx, ty, s] = pts[k];
        const W = 0.27 * (1 - 0.5 * smoothstep(2.0, 3.8, Math.abs(s)));
        for (let o = -W; o <= W + 1e-6; o += lane) {
          if (rnd() < 0.35) continue;
          const oo = o + rnd.range(-0.3, 0.3) * lane;
          const d = swirlToDir(sw, px - ty * oo, py + tx * oo);
          const c = laneColour(oo / W, s, sw, rnd);
          row(d, { dashes: [1, 2], len: sw.main ? [1.7, 2.8] : [1.4, 2.2], width: sw.main ? [0.5, 0.66] : [0.45, 0.6], gap: [0.2, 0.45], colour: c, flow });
        }
      }
      // the eyes: short curls following the field round each centre, deep blue with a little light
      for (const eye of [spine.eyeL, spine.eyeR]) {
        const er = 0.3 * (eye === spine.eyeL ? spine.kL : spine.kR);
        for (let i = 0; i < 26; i++) {
          const a = rnd() * 6.283, rr = er * Math.sqrt(rnd());
          const d = swirlToDir(sw, eye[0] + Math.cos(a) * rr, eye[1] + Math.sin(a) * rr);
          const col = pickW([[K.mid, 2], [K.cobalt, 2], [K.azure, 1.5], [K.cer, 1], [K.pale, 0.5]], rnd);
          row(d, { dashes: [1, 1], len: [1.2, 2.0], width: [0.45, 0.6], gap: [0, 0], colour: col, flow });
        }
      }
    }
    lap('swirls');

    // ------------------------------------------------------------ PAINT: layer 6 — halos
    // concentric rings of short curved strokes: yellow-white core, chrome yellow, pale lime,
    // blue-white, then pale blue into the sky; outer rings first so the inner ones sit on top.
    const RINGS_YELLOW = [[0, K.white], [0.14, C('#fff3b4')], [0.26, K.yellow], [0.38, K.chrome], [0.5, K.yellow], [0.6, K.lime], [0.7, K.ice], [0.8, K.pale], [0.9, K.swirl], [1, K.cer]];
    const RINGS_WHITE = [[0, K.white], [0.14, C('#fff3b4')], [0.28, K.yellow], [0.4, K.ice], [0.52, K.pale], [0.6, K.lime], [0.7, K.ice], [0.8, K.pale], [0.9, K.swirl], [1, K.cer]];
    const RINGS_VENUS = [[0, K.pearl], [0.16, C('#fdf6d2')], [0.28, K.ice], [0.4, K.pale], [0.5, C('#e9efc4')], [0.6, K.ice], [0.72, K.pale], [0.84, K.swirl], [0.93, K.cer], [1, K.azure]];
    function paintHalo(s, { rings, width = 0.44 * deg, spacing = 0.42 * deg, dash = 1.25 * deg, darkGaps = 0.2, alpha = 1 } = {}) {
      const f = frameAt(s.dir), r = SN.rng('sky-halo-' + s.dir.x.toFixed(5) + s.dir.y.toFixed(5));
      rings ||= r() < 0.55 ? RINGS_YELLOW : RINGS_WHITE;
      const shift = r.range(-0.06, 0.06);
      // glow underlayer: broad soft rings so the gaps between strokes glow instead of going dark
      for (let rr = s.halo * 0.9; rr > s.core * 0.8; rr -= spacing * 2) {
        const u = rr / s.halo, col = mixC(ramp(rings, u), K.cobalt, 0.25 * u);
        const n = Math.max(3, Math.round((2 * Math.PI * rr) / (dash * 1.6))), a0 = r() * 6.283;
        for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.283; arc(f, rr, a, a + (6.283 / n) * 1.1, spacing * 2.8, col, 0.95 * alpha, 0.02); }
      }
      // rings of curved strokes, outermost first
      for (let rr = s.halo; rr > s.core * 1.05; rr -= spacing * r.range(0.92, 1.08)) {
        const u = rr / s.halo, dark = u > 0.45 && u < 0.9 && r() < darkGaps;
        const circ = 2 * Math.PI * rr, n = Math.max(3, Math.round(circ / (dash * r.range(0.8, 1.2))));
        const a0 = r() * 6.283;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / n) * 6.283;
          let col = ramp(rings, clamp(u + shift * (1 - u) + r.range(-0.07, 0.07), 0, 1));
          if (dark) col = mixC(col, K.mid, 0.5);                           // a darker ring between bright ones
          arc(f, rr * r.range(0.985, 1.015), a, a + (6.283 / n) * r.range(0.98, 1.14), width * r.range(0.9, 1.15) * (0.75 + 0.25 * u), vary(col, r, 0.05), alpha * (0.85 + 0.15 * (1 - u)), 0.025);
        }
      }
      // the core: a blazing white-yellow dab wrapped in tiny curls
      const cw = s.core;
      stroke([fromLocal(f, -Math.tan(cw * 0.5), 0), fromLocal(f, 0, 0), fromLocal(f, Math.tan(cw * 0.5), 0)], cw * 1.9, mixC(K.yellow, K.white, 0.5), 1, false);
      for (let rr = cw * 0.85; rr > cw * 0.5; rr -= cw * 0.3) {
        const n = 3, a0 = r() * 6.283;
        for (let i = 0; i < n; i++) arc(f, rr, a0 + (i / n) * 6.283, a0 + ((i + 1.05) / n) * 6.283, cw * 0.45, vary(mixC(K.white, K.yellow, 0.2 + r() * 0.4), r, 0.04), 1, 0, 5);
      }
      for (let k = 0; k < 2; k++) {
        const a = r() * 3.14, e = Math.tan(cw * 0.32);
        stroke([fromLocal(f, -Math.cos(a) * e, -Math.sin(a) * e), fromLocal(f, 0, 0), fromLocal(f, Math.cos(a) * e, Math.sin(a) * e)], cw * 0.95, mixC(K.white, K.pearl, 0.4 + 0.3 * k), 1, false);
      }
    }
    for (const s of minor) paintHalo(s, { width: 0.33 * deg, spacing: 0.32 * deg, dash: 0.95 * deg, darkGaps: 0.1, alpha: 0.95 });
    // dust: tiny dabs of light scattered outside the painting frame (denser in the Milky Way)
    for (let i = 0; i < 700; i++) {
      const d = fib(i * 7 + 3, 700 * 7);
      if (pitchOf(d) < 6 * deg) continue;
      const fd = frameDist(d); if (fd < 2 || rnd() > smoothstep(2, 14, fd)) continue;
      const e = Math.abs(mwOffset(d)) / Math.sin(MW.half);
      if (e > 1.3 && rnd() < 0.6) continue;
      const q = jitterDir(d, 0.02), f = frameAt(q), w = rnd.range(0.22, 0.42) * deg, a = rnd() * 6.28;
      stroke([fromLocal(f, -Math.cos(a) * w * 0.5, -Math.sin(a) * w * 0.5), q, fromLocal(f, Math.cos(a) * w * 0.5, Math.sin(a) * w * 0.5)], w, vary(pickW([[K.white, 3], [K.yellow, 2], [K.ice, 2], [K.lime, 0.5]], rnd), rnd, 0.05), 0.95);
    }
    for (const s of stars) paintHalo(s);
    paintHalo(venus, { rings: RINGS_VENUS, width: 0.5 * deg, spacing: 0.46 * deg, dash: 1.4 * deg, darkGaps: 0.15 });
    lap('halos');

    // ------------------------------------------------------------ PAINT: layer 7 — the moon
    // a luminous yellow halo disk of concentric rings, a pale disc behind, then the orange-yellow
    // crescent painted along its own curve (lit limb low right, horns up-left).
    const inCrescent = (x, y) => Math.hypot(x, y) < MOON.R && Math.hypot(x - MOON.ci[0], y - MOON.ci[1]) > MOON.Ri;
    {
      const f = moonF, r = SN.rng('sky-moon');
      const RINGS_MOON = [[0.42, C('#fdf0b8')], [0.5, C('#fbe38a')], [0.6, K.yellow], [0.68, K.chrome], [0.76, K.yellow], [0.84, K.lime], [0.91, C('#c9dcae')], [0.97, K.mint], [1, K.teal]];
      // glow underlayer so the disk blazes between strokes
      for (let rr = MOON.halo * 0.94; rr > 0.3 * deg; rr -= 0.6 * deg) {
        const u = rr / MOON.halo, col = u < 0.5 ? C('#fbe7a0') : ramp(RINGS_MOON, u);
        const n = Math.max(3, Math.round((2 * Math.PI * rr) / (1.8 * deg))), a0 = r() * 6.283;
        for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.283; arc(f, rr, a, a + (6.283 / n) * 1.1, 1.15 * deg, col, 1, 0.02); }
      }
      stroke([fromLocal(f, -0.004, 0), fromLocal(f, 0, 0.0005), fromLocal(f, 0.004, 0)], 1.2 * deg, C('#fbe7a0'), 1);
      for (let rr = MOON.halo; rr > Math.atan(MOON.R) * 0.98; rr -= 0.36 * deg) {
        const u = rr / MOON.halo, col = ramp(RINGS_MOON, u);
        const n = Math.max(4, Math.round((2 * Math.PI * rr) / (1.15 * deg))), a0 = r() * 6.283;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / n) * 6.283;
          arc(f, rr * r.range(0.985, 1.015), a, a + (6.283 / n) * r.range(0.98, 1.12), 0.4 * deg, vary(ramp(RINGS_MOON, clamp(u + r.range(-0.05, 0.05), 0, 1)), r, 0.05), 1, 0.02);
        }
      }
      // the disc: arcs concentric with the moon, split into runs — inside the crescent they are
      // orange-yellow (strokes follow the crescent's curve), in the hollow a soft lemon light
      const R = MOON.R, HOLLOW = [[C('#f6e9a2'), 3], [C('#efe8a8'), 2], [K.lime, 1], [C('#fbefc0'), 1.5]];
      const runs = (rho, pred) => {
        const N = 240, ins = [];
        for (let i = 0; i < N; i++) { const a = (i / N) * 6.283; ins.push(pred(Math.cos(a) * rho, Math.sin(a) * rho)); }
        const start = ins.indexOf(false); if (start < 0) return [[0, 6.283]];
        const out = []; let rs = -1;
        for (let j = 1; j <= N; j++) {
          const i = (start + j) % N;
          if (ins[i] && rs < 0) rs = start + j;
          if ((!ins[i] || j === N) && rs >= 0) { out.push([(rs / N) * 6.283, ((start + j) / N) * 6.283]); rs = -1; }
        }
        return out;
      };
      const paintRuns = (rho, list, width, colour) => {
        for (const [a0, a1] of list) {
          const span = a1 - a0, pieces = Math.max(1, Math.round((span * rho) / Math.tan(1.1 * deg)));
          for (let p = 0; p < pieces; p++) {
            const b0 = a0 + (span * p) / pieces, b1 = a0 + (span * (p + r.range(1.0, 1.15))) / pieces;
            arc(f, Math.atan(rho), b0, Math.min(a1 + 0.02, b1), width, colour(), 1, 0, 6);
          }
        }
      };
      stroke([fromLocal(f, -0.006, 0), fromLocal(f, 0, 0.001), fromLocal(f, 0.006, 0)], 0.9 * deg, C('#f6e9a2'), 1);
      for (let rho = R * 0.985; rho > Math.tan(0.3 * deg); rho -= Math.tan(0.2 * deg)) {
        const edge = rho / R;
        const col = ramp([[0.25, C('#e5861a')], [0.55, C('#ef9420')], [0.8, K.orange], [0.93, C('#f6b634')], [1, K.chrome]], edge);
        paintRuns(rho, runs(rho, (x, y) => !inCrescent(x, y)), 0.3 * deg, () => vary(pickW(HOLLOW, r), r, 0.04));
        paintRuns(rho, runs(rho, inCrescent), 0.28 * deg, () => vary(col, r, 0.06));
      }
      // a dark-orange line along the inner curve gives the crescent its bite
      for (let a = -3.1; a < 3.1; a += 0.1) {
        const x0 = MOON.ci[0] + Math.cos(a) * MOON.Ri, y0 = MOON.ci[1] + Math.sin(a) * MOON.Ri;
        const x1 = MOON.ci[0] + Math.cos(a + 0.12) * MOON.Ri, y1 = MOON.ci[1] + Math.sin(a + 0.12) * MOON.Ri;
        if (Math.hypot(x0, y0) > R * 0.96 || Math.hypot(x1, y1) > R * 0.96) continue;
        stroke([fromLocal(f, x0, y0), fromLocal(f, (x0 + x1) / 2, (y0 + y1) / 2), fromLocal(f, x1, y1)], 0.2 * deg, vary(C('#e08a22'), r, 0.05), 0.85);
      }
    }
    lap('moon');

    // ------------------------------------------------------------ BAKE: rasterise the strokes into a cube map
    // 1280² per face ≈ 14 px/deg, about 1:1 at 1080p; 1536 looked identical through the post filter
    // and costs 23 MB more (RGBA8 + mips: 1280 ≈ 50 MB, 1024 ≈ 32 MB). No depth buffer: the bake
    // draws with depthTest off, and six 4-byte depth faces would cost as much again. Phones and other
    // constrained devices (and safe mode, after a GPU crash) get a smaller cube without mips: their
    // screens always magnify it (≥ 9 px/deg against 8.5 at 768), so the mips were never sampled —
    // 768 ≈ 13.5 MB, safe mode's 640 ≈ 9.4 MB. WebGL1 cannot mipmap a cube that is not a power of two,
    // so its desktops get 1024. ?skyres=N overrides.
    const SAFE = !!SN.params.safe, LEAN = SAFE || !!SN.device.constrained;
    const RES = +QS.get('skyres') || (SAFE ? 640 : LEAN ? 768 : SN.quality === 'low' || SN.device.webgl2 === false ? 1024 : 1280);
    const cubeRT = new THREE.WebGLCubeRenderTarget(RES, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
      generateMipmaps: !LEAN, minFilter: LEAN ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    slog.a = slog.a.slice(0, slog.n);   // trim the log to what was painted
    let bakeSky;
    {
      const bake = new THREE.Scene();
      // ground tone: a vertex-coloured sphere
      const sg = new THREE.SphereGeometry(5, 160, 80), sp = sg.attributes.position, sc = new Float32Array(sp.count * 3), dd = V();
      for (let i = 0; i < sp.count; i++) {
        dd.set(sp.getX(i), sp.getY(i), sp.getZ(i)).normalize();
        const c = mixC(baseColour(dd), K.deep, 0.25);
        sc[i * 3] = c[0]; sc[i * 3 + 1] = c[1]; sc[i * 3 + 2] = c[2];
      }
      sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
      const groundMat = new THREE.ShaderMaterial({
        vertexShader: 'varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }',
        vertexColors: true, side: THREE.BackSide, depthTest: false, depthWrite: false,
      });
      const ground = new THREE.Mesh(sg, groundMat); ground.renderOrder = 0; ground.frustumCulled = false;
      // the strokes
      const strokeMat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */`
          attribute vec4 aCol; attribute vec4 aInfo;
          varying vec2 vUv; varying vec4 vCol; varying vec4 vInfo;
          void main() { vUv = uv; vCol = aCol; vInfo = aInfo; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */`
          varying vec2 vUv; varying vec4 vCol; varying vec4 vInfo;
          float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vn(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          void main() {
            float hl = max(vInfo.x, 1.0), seed = vInfo.y * 91.0;
            float a = vUv.x, c = vUv.y;
            float xa = (a * 2.0 - 1.0) * hl;                          // along, in half-widths, centred
            float wob = (vn(vec2(xa * 0.8, seed)) - 0.5) * 0.3;       // wobbly edges
            float ex = max(abs(xa) - (hl - 1.0), 0.0);                // inside the round caps
            float dd = length(vec2(ex * 1.08, c + wob));
            float cov = 1.0 - smoothstep(0.7, 1.0, dd);
            // bristle streaks running along the stroke
            float b1 = vn(vec2(c * 5.0 + seed, xa * 0.16));
            float b2 = vn(vec2(c * 12.0 - seed, xa * 0.3 + 3.0));
            float br = b1 * 0.6 + b2 * 0.4;
            // the brush runs dry toward the tail
            float tail = smoothstep(0.5, 1.0, a);
            cov *= 1.0 - tail * smoothstep(0.58, 0.28, br) * 0.9;
            // impasto: the rounded body of the stroke + its bristle ridges, lit from one side
            float db = (vn(vec2((c + 0.06) * 5.0 + seed, xa * 0.16)) - b1) / 0.06;
            float slope = -1.1 * c + 0.12 * db;
            float head = exp(-a * 7.0);                                // paint piles up where the brush lands
            float shade = slope * vInfo.w * 0.24 - head * vInfo.z * 0.25 + head * 0.05;
            float rim = mix(1.0, 0.84, smoothstep(0.5, 0.95, dd));
            vec3 col = vCol.rgb * (0.84 + 0.3 * br) * (1.03 - 0.07 * a) * (1.0 + shade) * rim;
            gl_FragColor = vec4(clamp(col, 0.0, 1.0), cov * vCol.a);
          }`,
        transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      });
      const strokesMesh = new THREE.Mesh(new THREE.BufferGeometry(), strokeMat); strokesMesh.renderOrder = 1; strokesMesh.frustumCulled = false;
      bake.add(ground, strokesMesh);
      const cubeCam = new THREE.CubeCamera(0.05, 20, cubeRT);
      bake.add(cubeCam);
      const prevClear = new THREE.Color();
      // bake (or re-bake) the cube map. Only the log and the little ground sphere stay in memory
      // between bakes: the ribbons are rebuilt from the log and every GPU copy is released after.
      bakeSky = () => {
        const R = SN.renderer, prevAlpha = R.getClearAlpha(), prevTarget = R.getRenderTarget();
        R.getClearColor(prevClear);
        strokesMesh.geometry = ribbons();
        R.setClearColor(0x000000, 1);
        try { cubeCam.update(R, bake); } finally {
          R.setClearColor(prevClear, prevAlpha);
          R.setRenderTarget(prevTarget);
          strokesMesh.geometry.dispose(); strokesMesh.geometry = new THREE.BufferGeometry();
          sg.dispose(); strokeMat.dispose(); groundMat.dispose();
        }
      };
      bakeSky();
    }
    lap('bake');
    const strokeCount = slog.strokes, vertCount = slog.nv;

    // A lost WebGL context takes the cube map with it; three.js rebuilds its own state on restore,
    // then the next frame re-bakes the sky before it is drawn (core emits 'contextRestored'; the
    // canvas event is a fallback, and the flag makes the two one bake).
    let rebake = false;
    const requestBake = () => { rebake = true; };
    SN.on('contextRestored', requestBake);
    SN.renderer.domElement.addEventListener('webglcontextrestored', requestBake);
    function rebakeIfNeeded() {
      if (!rebake || SN.renderer.getContext().isContextLost()) return;
      rebake = false;
      const t0 = performance.now();
      try { bakeSky(); console.log(`[sky] re-baked the cube map after a context restore (${Math.round(performance.now() - t0)} ms)`); }
      catch (e) { console.error('[sky] re-bake failed', e); }
    }

    // ------------------------------------------------------------ DOME: the camera-centred sky
    // Per-feature uniforms (painting stars, Venus, moon): dir + halo radius; core, phase, pulse, turn.
    const animated = [...stars, venus, { dir: moonDir, core: 0, halo: MOON.halo, kind: 'moon' }];
    const NS = animated.length;
    const uStar = animated.map(s => new THREE.Vector4(s.dir.x, s.dir.y, s.dir.z, s.halo));
    const uStarB = animated.map((s, i) => new THREE.Vector4(s.core, rnd() * 6.283, s.kind === 'moon' ? 0.05 : s.kind === 'venus' ? 0.1 : 0.14, s.kind === 'moon' ? 0.35 : rnd.range(0.7, 1.2) * (i % 2 ? 1 : -1)));
    const uSwirl = swirls.map(sw => new THREE.Vector4(sw.f.c.x, sw.f.c.y, sw.f.c.z, sw.a * 1.6));
    const domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uSky: { value: cubeRT.texture }, uTime: { value: 0 }, uAnim: { value: 1 },
        uStar: { value: uStar }, uStarB: { value: uStarB }, uSwirl: { value: uSwirl },
        uMoonDir: { value: moonF.c }, uMoonRight: { value: moonF.r }, uMoonUp: { value: moonF.u },
        uCres: { value: new THREE.Vector4(MOON.R, MOON.ci[0], MOON.ci[1], MOON.Ri) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        #define NS ${NS}
        uniform samplerCube uSky;
        uniform float uTime, uAnim;
        uniform vec4 uStar[NS], uStarB[NS], uSwirl[2], uCres;
        uniform vec3 uMoonDir, uMoonRight, uMoonUp;
        varying vec3 vDir;
        vec3 turn(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
        vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
        void main() {
          vec3 d = normalize(vDir), q = d;
          float bright = 1.0, glow = 0.0;
          // uAnim scales every motion (1 = alive, 0 = the still painting; reduced motion eases to 0)
          if (uAnim > 0.001) {
            // the swirls breathe: a slow differential turn about their centres
            for (int i = 0; i < 2; i++) {
              float r = length(d - uSwirl[i].xyz) / uSwirl[i].w;
              if (r < 1.0) { float w = 1.0 - r * r; w *= w; q = turn(q, uSwirl[i].xyz, uAnim * w * 0.035 * sin(uTime * 0.29 + r * 4.5 + float(i) * 2.1)); }
            }
          }
          for (int i = 0; i < NS; i++) {
            vec3 s = uStar[i].xyz;
            float r = length(d - s);
            if (r < uStar[i].w) {
              float x = r / uStar[i].w, win = 1.0 - smoothstep(0.6, 1.0, x);
              if (uAnim > 0.001) {
                // rings turn gently back and forth, and a soft pulse ripples outward
                q = turn(q, s, uAnim * win * 0.09 * uStarB[i].w * sin(uTime * 0.5 + x * 6.0 + uStarB[i].y));
                bright *= 1.0 + uAnim * uStarB[i].z * win * (0.55 + 0.45 * sin(uTime * 1.4 - x * 9.0 + uStarB[i].y));
              }
              if (r < uStarB[i].x) glow = 1.0;
            }
          }
          float mk = dot(d, uMoonDir);
          if (mk > 0.99) {
            vec2 p = vec2(dot(d, uMoonRight), dot(d, uMoonUp)) / mk;
            if (length(p) < uCres.x && length(p - uCres.yz) > uCres.w) glow = 1.0;
          }
          vec3 col = srgbToLinear(textureCube(uSky, q).rgb) * bright;
          gl_FragColor = vec4(col, glow > 0.5 ? 0.5 : 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    const R_SKY = layout.skyRadius || 900;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R_SKY, 64, 32), domeMat);
    dome.name = 'sky-dome'; dome.renderOrder = -1; dome.frustumCulled = false;
    SN.scene.add(dome);
    // The sky stays alive on every quality (the motion costs ~0.03 ms a frame). Reduced motion —
    // core's live SN.reducedMotion, else the media query — eases it to the still painting, and
    // back when it is switched off again. ?skyanim=0 freezes it (dev).
    const mqReduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduced = () => (typeof SN.reducedMotion === 'boolean' ? SN.reducedMotion : !!mqReduce?.matches);
    const animOff = QS.get('skyanim') === '0';
    domeMat.uniforms.uAnim.value = animOff || reduced() ? 0 : 1;
    function stepAnim(dt) {
      const U = domeMat.uniforms.uAnim, want = animOff || reduced() ? 0 : 1;
      if (U.value !== want) U.value = want > U.value ? Math.min(want, U.value + dt / 1.5) : Math.max(want, U.value - dt / 1.5);
    }

    // ------------------------------------------------------------ MOON SEAT
    // A frame MOON_D metres out along moonDir, re-centred on the camera every frame: +X right,
    // +Y up the sky, +Z toward the viewer. Local XY = moon gnomonic coords × MOON_D, so the seat
    // (on the crescent's lower inner curve) lands exactly on the painted crescent. At 50 m the fog
    // is ~5 % and nothing tall enough to cover a 36°-high moon stands farther away, so a child here
    // depth-tests correctly against the town and hills while drawing over the dome.
    const MOON_D = 50;
    const moonObj = new THREE.Group(); moonObj.name = 'sky-moon';
    moonObj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(moonF.r, moonF.u, moonDir.clone().negate()));
    SN.scene.add(moonObj);
    const seatA = -80 * deg; // angle round the inner circle: just right of its lowest point
    const seatX = MOON.ci[0] + Math.cos(seatA) * MOON.Ri, seatY = MOON.ci[1] + Math.sin(seatA) * MOON.Ri;
    let ymin = 1, ymax = -1;
    for (let i = 0; i < 400; i++) for (let j = 0; j < 400; j++) {
      const x = lerp(-MOON.R, MOON.R, i / 399), y = lerp(-MOON.R, MOON.R, j / 399);
      if (inCrescent(x, y)) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    }
    const crescentH = (ymax - ymin) * MOON_D; // metres in the seat frame
    const moonSeat = {
      object: moonObj,
      position: V(seatX * MOON_D, seatY * MOON_D, 0.02 * MOON_D),
      scale: crescentH / 3 / 0.5,
      up: V(-Math.cos(seatA), -Math.sin(seatA), 0).normalize(),
      distance: MOON_D, crescentHeight: crescentH,
    };
    if (SN.params.debug.includes('moonseat')) {
      // a small dark curled "cat" (0.5 units tall before scale) to prove the seat
      const body = new THREE.SphereGeometry(0.5, 16, 10); body.scale(0.9, 0.5, 0.6); body.translate(0, 0.25, 0);
      const head = new THREE.SphereGeometry(0.2, 12, 8); head.translate(0.4, 0.34, 0.1);
      const ear = new THREE.ConeGeometry(0.07, 0.16, 6); ear.translate(0.45, 0.56, 0.1);
      const probe = new THREE.Mesh(SN.geo.merge([body, head, ear]), SN.mat.paint({ color: PAL.ink }));
      probe.position.copy(moonSeat.position); probe.scale.setScalar(moonSeat.scale);
      probe.quaternion.setFromUnitVectors(UP, moonSeat.up);
      probe.name = 'moonseat-probe';
      moonObj.add(probe);
    }

    // ------------------------------------------------------------ per frame
    // placeOnSky(obj, dir, distance): keep a scene-level object `distance` m out along `dir` from the
    // camera every frame (so it sits "on the sky" with no parallax), turned to face the viewer.
    const followers = [];
    function placeOnSky(obj, dir, distance = 400) {
      const d = dir.clone().normalize(), f = frameAt(d);
      obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.r, f.u, d.clone().negate()));
      const entry = { obj, dir: d, distance };
      followers.push(entry);
      if (!obj.parent) SN.scene.add(obj);
      obj.position.copy(SN.camera.position).addScaledVector(d, distance);
      return obj;
    }
    function follow() {
      const cp = SN.camera.position;
      dome.position.copy(cp);
      moonObj.position.copy(cp).addScaledVector(moonDir, MOON_D);
      moonObj.updateMatrixWorld(true);
      for (const e of followers) { e.obj.position.copy(cp).addScaledVector(e.dir, e.distance); e.obj.updateMatrixWorld(true); }
    }
    // ------------------------------------------------------------ SHOOTING STARS
    // One mesh, drawn only while a star is falling (0 draw calls otherwise, 1 while it lasts): a
    // streak of NDASH painted dashes along a great-circle arc on the sky, a cream loaded head, star
    // yellow body, pale lime and blue-white toward a thinning dry tail. It is revealed head first
    // (dashes appear as the head passes) and fades by erosion, tail dashes first. Geometry does
    // the dash shapes (no discard), so the scene target's MSAA smooths their edges; they write the
    // post's glow mask (alpha 0.5, no blending), which keeps them crisp and gives them a halo.
    //   ambient — every 40–90 s of play, in the sky (pitch 18–60°, ending above 10°) near where the
    //             player looks, slanting down, never over the moon or the great swirl, and only on
    //             a path that mostly shows (on screen, off the HUD, not behind the cypress or roofs)
    //   guiding — on 'hint': from ~25° above the view centre toward 8° above the hinted cat (a cat
    //             behind you gets an overhead streak pointing the way); for the moon cat it falls
    //             toward the moon and dies at its halo. It lands above the local skyline (roofs
    //             too) and inside the frame: a cat above the frame gets a star rising to its top
    // Reduced motion: no ambient stars; the guiding star does not travel but glows in place and
    // fades. Emits 'shootingStar' {kind, from, to} (for a chime). Test: SN.modules.sky.shootingStar().
    const SS = { D: 800, NDASH: 12, SEG: 6, TRAIL: 24 };
    const srnd = SN.rng('sky-shooting-' + Math.random());   // runtime events: a new sequence each visit
    const shootGeo = new THREE.BufferGeometry();
    {
      // position carries (dash, along 0..1, side ±1); the vertex shader builds the streak. Dash -1
      // is a thin continuous trail drawn first, under the dashes (one draw call keeps index order)
      const pos = [], idx = [];
      for (let k = -1; k < SS.NDASH; k++) {
        const b = pos.length / 3, n = k === -1 ? SS.TRAIL : SS.SEG;
        for (let i = 0; i <= n; i++) for (const sd of [1, -1]) pos.push(k, i / n, sd);
        for (let i = 0; i < n; i++) { const a = b + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      shootGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      shootGeo.setIndex(idx);
    }
    const linC = hex => new THREE.Color(hex);   // three converts sRGB hex to linear working colours
    const shootMat = new THREE.ShaderMaterial({
      uniforms: {
        uA: { value: V(0, 0, -1) }, uN: { value: V(1, 0, 0) }, uHead: { value: 0 }, uTail: { value: 0.28 }, uWidth: { value: 0.0052 },
        uErode: { value: 0 }, uGlow: { value: 1 }, uSeed: { value: 0 }, uBend: { value: 0 }, uD: { value: SS.D },
        uC0: { value: linC('#fffbe6') }, uC1: { value: linC(PAL.starYellow) }, uC2: { value: linC('#e4ecb4') }, uC3: { value: linC(PAL.swirl) },
      },
      vertexShader: /* glsl */`
        #define NDASH ${SS.NDASH}.0
        uniform vec3 uA, uN, uC0, uC1, uC2, uC3;
        uniform float uHead, uTail, uWidth, uErode, uSeed, uBend, uD;
        varying vec3 vCol; varying vec2 vQ;
        float h1(float p) { return fract(sin(p * 91.345 + uSeed * 17.13) * 43758.5453); }
        void main() {
          float k = position.x, x = position.y, side = position.z;
          float u, w, off = 0.0;
          if (k < -0.5) {
            // the trail: a thin dry-brush line the dashes sit on, thinning away and fading first
            u = x * 1.05;
            w = uWidth * 0.34 * pow(max(1.0 - u, 0.0), 0.7) * max(1.0 - uErode * 2.5, 0.0);
          } else {
            // the dash's slot along the streak (0 = the head, 1 = the tail end): packed and
            // overlapping near the head, sparser and shorter toward the tail, a little irregular
            float s0 = pow(k / NDASH, 1.3), ds = pow((k + 1.0) / NDASH, 1.3) - s0;
            float fill = mix(1.2, 0.55, k / NDASH) * (0.85 + 0.3 * h1(k + 3.0));
            u = max(0.0, s0 + (h1(k) - 0.5) * 0.3 * ds) + x * ds * fill;
            // blunt brush dabs, loaded at the end toward the head: a fat head, thinning toward the
            // tail, each laid a little off the line and at its own slight angle, like a hand's dabs
            w = uWidth * mix(1.0, 0.3, u) * pow(sin(3.14159 * mix(0.1, 0.9, x)), 0.55) * mix(1.15, 0.7, x) * (k < 0.5 ? 1.45 : 0.85 + 0.3 * h1(k + 5.0));
            off = uWidth * ((h1(k + 11.0) - 0.5) * 0.7 + (x - 0.5) * (h1(k + 13.0) - 0.5) * 0.9) * min(k, 1.0);
            if (h1(k + 7.0) < uErode * 1.4 - (1.0 - u) * 0.4) w = 0.0;  // fading: tail dashes go first
          }
          float th = uHead - u * uTail;
          if (th < 0.0) w = 0.0;                                     // the head has not got that far yet
          vec3 dir = uA * cos(th) + cross(uN, uA) * sin(th);
          vec3 p = normalize(dir + uN * (side * w + off + uBend * u * u));   // the tail flicks round a little
          vCol = u < 0.12 ? mix(uC0, uC1, u / 0.12) : u < 0.45 ? mix(uC1, uC2, (u - 0.12) / 0.33) : mix(uC2, uC3, min((u - 0.45) / 0.45, 1.0));
          if (k < -0.5) vCol = mix(uC3, uC1, 0.3 * (1.0 - u)) * 0.85;
          vQ = vec2(u, side);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p * uD, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uGlow, uSeed;
        varying vec3 vCol; varying vec2 vQ;
        void main() {
          // a lighter ridge down each dash and a few bristle streaks along it
          float s = vQ.y, br = sin(s * 8.5 + uSeed * 6.0) * 0.5 + 0.5;
          vec3 c = vCol * (0.84 + 0.2 * (1.0 - s * s) + 0.08 * br);
          gl_FragColor = vec4(c * uGlow, 0.5);
          #include <colorspace_fragment>
        }`,
      blending: THREE.NoBlending, depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide,
    });
    const shootMesh = new THREE.Mesh(shootGeo, shootMat);
    shootMesh.name = 'sky-shooting-star'; shootMesh.frustumCulled = false; shootMesh.visible = false;
    shootMesh.raycast = () => {};   // its positions are data, not places: never block a spotting ray
    SN.scene.add(shootMesh);
    const ANG = a => Math.acos(clamp(a, -1, 1));
    let shot = null, ambientIn = srnd.range(25, 60);   // the first one comes a little sooner
    // start a streak from direction a toward b (unit vectors); opts: kind, travel (radians the head
    // moves, default the whole arc), tail, draw/fade seconds, still (reduced motion), hold (dev)
    function shootingStar(a, b, opts = {}) {
      a = a.clone().normalize(); b = b.clone().normalize();
      const arc = ANG(a.dot(b));
      if (arc < 2 * deg) return null;
      const n = V().crossVectors(a, b).normalize(), U = shootMat.uniforms;
      const travel = Math.min(opts.travel ?? arc, arc), tail = Math.min(opts.tail ?? 15 * deg, travel);
      U.uA.value.copy(a); U.uN.value.copy(n); U.uTail.value = tail; U.uSeed.value = srnd() * 10;
      U.uBend.value = (opts.bend ?? srnd.range(-1, 1)) * 0.012; U.uWidth.value = (opts.width ?? 0.4) * deg;
      shot = { kind: opts.kind || 'ambient', travel, t: 0, draw: opts.draw ?? 0.9, fade: opts.fade ?? 0.6, still: !!opts.still, hold: opts.hold };
      if (shot.still) { shot.draw = 0.35; shot.stay = 0.9; shot.fade = 0.7; }
      stepShoot(0);
      shootMesh.visible = true;
      SN.emit('shootingStar', { kind: shot.kind, from: a.clone(), to: fromArc(a, n, travel) });
      return shot;
    }
    const fromArc = (a, n, th) => a.clone().multiplyScalar(Math.cos(th)).addScaledVector(V().crossVectors(n, a), Math.sin(th));
    function stepShoot(dt) {
      if (!shot) return;
      const U = shootMat.uniforms;
      shot.t = shot.hold != null ? shot.hold : shot.t + dt;
      const t = shot.t;
      if (shot.still) {   // reduced motion: the whole streak glows in place, then dims away
        U.uHead.value = shot.travel; U.uErode.value = 0;
        U.uGlow.value = t < shot.draw ? t / shot.draw : t < shot.draw + shot.stay ? 1 : 1 - (t - shot.draw - shot.stay) / shot.fade;
        if (t > shot.draw + shot.stay + shot.fade) { shot = null; shootMesh.visible = false; }
        return;
      }
      const p = Math.min(t / shot.draw, 1);
      U.uHead.value = shot.travel * (1 - (1 - p) * (1 - p)) + U.uTail.value * 0.02;   // eases in to land
      U.uGlow.value = 1;
      U.uErode.value = t > shot.draw ? (t - shot.draw) / shot.fade : 0;
      if (t > shot.draw + shot.fade) { shot = null; shootMesh.visible = false; }
    }
    const _camF = V(), _toCat = V();
    // Will the player see a path? Only while choosing one (an ambient star, a hint), never per
    // frame: k samples along the arc a → travel (about n), each on screen, off the HUD panels and
    // toasts, and not behind scenery (the cats module's sight line: the terrain plus a grid of the
    // world's solid triangles, ~0.1 ms a sample). Returns how many samples pass; stops early once
    // `need` is out of reach.
    const HUD_SEL = '.sn-hud-tl > *, .sn-hud-tr > *, .sn-toast, .sn-tbtn, .sn-joy-base';
    function hudRects() {
      const out = [];
      try { for (const el of document.querySelectorAll(HUD_SEL)) { const r = el.getBoundingClientRect(); if (r.width > 1 && r.height > 1) out.push(r); } } catch {}
      return out;
    }
    const _se = V(), _sp = V(), _sq = V();
    function pathScore(a, n, travel, k, rects, need = 0) {
      const cam = SN.camera, cv = SN.renderer.domElement.getBoundingClientRect(), sight = SN.modules.cats?.clearSight;
      cam.updateMatrixWorld(); cam.getWorldPosition(_se);
      let good = 0;
      for (let i = 0; i < k && good + (k - i) >= need; i++) {
        const d = fromArc(a, n, (travel * i) / (k - 1));
        _sp.copy(_se).add(d).project(cam);
        if (!(_sp.z < 1 && Math.abs(_sp.x) < 0.96 && Math.abs(_sp.y) < 0.96)) continue;
        const x = cv.left + ((_sp.x + 1) / 2) * cv.width, y = cv.top + ((1 - _sp.y) / 2) * cv.height;
        if (rects.some(r => x > r.left - 6 && x < r.right + 6 && y > r.top - 6 && y < r.bottom + 6)) continue;
        if (sight && !sight(_se, _sq.copy(_se).addScaledVector(d, 300))) continue;
        good++;
      }
      return good;
    }
    // a random ambient streak in the sky near where the player is looking, on a path that shows
    function ambientStar() {
      SN.camera.getWorldDirection(_camF);
      const cy = yawOf(_camF), cpit = pitchOf(_camF), rects = hudRects();
      for (let tries = 0; tries < 40; tries++) {
        const p0 = clamp(cpit + srnd.range(4, 30) * deg, 18 * deg, 60 * deg), y0 = cy + srnd.range(-38, 38) * deg * (tries < 20 ? 1 : 1.6);
        const a = SN.dirFromYawPitch(y0, p0), side = srnd.sign();
        const b = SN.dirFromYawPitch(y0 + side * srnd.range(12, 20) * deg, p0 - srnd.range(7, 13) * deg);
        const tail = srnd.range(12, 16) * deg, n = V().crossVectors(a, b).normalize(), arc = ANG(a.dot(b));
        let ok = pitchOf(b) > 10 * deg;
        for (let i = 0; ok && i <= 4; i++) {
          const d = fromArc(a, n, (arc * i) / 4);
          if (ANG(d.dot(moonDir)) < (i === 0 ? 20 : 14) * deg || ANG(d.dot(swirlDir)) < (i === 0 ? 20 : 16) * deg) ok = false;
          for (const st of haloed) if (ANG(d.dot(st.dir)) < st.core + 1.2 * deg) ok = false;   // nor across a star
        }
        // and mostly where it can be seen: not above the frame, under the HUD or behind the cypress / roofs
        if (ok && pathScore(a, n, arc, 5, rects, 4) < 4) ok = false;
        if (ok) return shootingStar(a, b, { kind: 'ambient', tail, travel: arc });
      }
      return null;
    }
    // the guiding star: toward the hinted cat's direction (or the moon, for the moon cat).
    //   in front (within ~38° of the view centre): it falls from high above toward the cat and
    //     lands 8° above it — or just above the skyline behind it, so hills and roofs never hide
    //     the end — but inside the frame: for a cat above the frame it rises to the top edge
    //   to the side or behind: it sweeps across the upper screen toward that side and leaves by
    //     the edge, its fading tail pointing the way to turn (lifted over the roofs in a lane)
    const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
    // the skyline seen from cam along a yaw: the terrain (heightAt), the village's roofs, walls and
    // church (the town's surface grid, topAt) and the Alpilles ranges (their vertices within 1.5°
    // of the yaw; ~11k, cached in world space on first use). Well under a millisecond a call.
    let rangePts = null;
    function skylinePitch(cam, yaw) {
      const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      let best = -90 * deg;
      for (let r = 20; r <= 520; r += 25) best = Math.max(best, Math.atan2(SN.world.heightAt(cam.x + dx * r, cam.z + dz * r) - cam.y, r));
      const topAt = SN.modules.town?.topAt;
      if (typeof topAt === 'function') for (let r = 1.5; r <= 90; r += r < 45 ? 1 : 3) {
        const y = topAt(cam.x + dx * r, cam.z + dz * r);
        if (y != null) best = Math.max(best, Math.atan2(y - cam.y, r));
      }
      if (!rangePts) {
        const R = SN.modules.landscape?.ranges, pa = R?.geometry?.attributes?.position, v = V();
        rangePts = new Float32Array(pa ? pa.count * 3 : 0);
        if (pa) { R.updateMatrixWorld(); for (let i = 0; i < pa.count; i++) v.fromBufferAttribute(pa, i).applyMatrix4(R.matrixWorld).toArray(rangePts, i * 3); }
      }
      for (let i = 0; i < rangePts.length; i += 3) {
        const vx = rangePts[i] - cam.x, vz = rangePts[i + 2] - cam.z;
        if (Math.abs(wrapA(Math.atan2(-vx, -vz) - yaw)) > 1.5 * deg) continue;
        best = Math.max(best, Math.atan2(rangePts[i + 1] - cam.y, Math.hypot(vx, vz)));
      }
      return best;
    }
    function clearOfMoon(a, b, travel) {
      const n = V().crossVectors(a, b).normalize();
      for (let i = 0; i <= 8; i++) if (ANG(fromArc(a, n, (travel * i) / 8).dot(moonDir)) < MOON.halo + 2.5 * deg) return false;
      return true;
    }
    function guidingStar(d) {
      const P = d?.position; if (!P) return null;
      const cam = SN.camera.getWorldPosition(V());
      _toCat.set(P.x - cam.x, P.y - cam.y, P.z - cam.z);
      if (_toCat.lengthSq() < 1e-6) return null;
      _toCat.normalize();
      SN.camera.getWorldDirection(_camF);
      const moon = d.sky || ANG(_toCat.dot(moonDir)) < 6 * deg;
      const T = moon ? moonDir : _toCat, cy = yawOf(_camF), cp = pitchOf(_camF);
      const ty = yawOf(T), tp = pitchOf(T), bear = wrapA(ty - cy), sgn = bear >= 0 ? 1 : -1;
      const still = reduced(), front = Math.abs(bear) < 38 * deg;
      // the frame: its top edge less a margin, and its horizontal half-width
      const vh = (SN.camera.fov * deg) / 2, top = cp + vh - 6 * deg, hh = Math.atan(Math.tan(vh) * SN.camera.aspect);
      // Candidates in order of preference; the first that mostly shows (4 of 7 samples on screen,
      // off the HUD, not behind roofs or hills) wins, else the one that shows best.
      const rects = hudRects();
      let pick = null;
      const consider = (a, b, travel, seen = travel) => {
        const s = pathScore(a, V().crossVectors(a, b).normalize(), seen, 7, rects);
        if (!pick || s > pick.s) pick = { a, b, travel, s };
        return s >= 4;
      };
      if (front) {
        // it lands 8° above the cat or 3° above the skyline behind it (hills, roofs), inside the
        // frame; a cat above the frame gets a star that rises toward the top edge instead. When
        // roofs hide the sky above the cat, the end moves sideways to where the lane opens.
        const shifts = moon && tp <= top ? [0] : [0, -10, 10, -20, 20].map(s => s * sgn * deg).filter(s => !s || Math.abs(wrapA(ty + s - cy)) < hh - 6 * deg);
        for (const sh of shifts) {
          const ye = ty + sh, be = wrapA(ye - cy);
          const want = moon ? tp : Math.max(tp + 8 * deg, skylinePitch(cam, ye) + 3 * deg), rise = want > top;
          const endP = clamp(Math.min(want, top), -5 * deg, 80 * deg), halo = moon && !rise ? MOON.halo + 3 * deg : 0;   // for the moon: dies at its halo
          const b = SN.dirFromYawPitch(ye, endP);
          let a, travel;
          for (const dy of [0, 14, -14, 28, -28]) {   // a start whose path keeps clear of the moon
            if (rise) a = SN.dirFromYawPitch(ye - sgn * 9 * deg + dy * 0.5 * deg, endP - 17 * deg);
            else {
              a = SN.dirFromYawPitch(cy + be * 0.35 + dy * deg, clamp(Math.max(cp, endP) + 20 * deg, 12 * deg, 76 * deg));
              if (ANG(a.dot(b)) < 14 * deg) a = SN.dirFromYawPitch(ye - sgn * 10 * deg + dy * deg, Math.min(endP + 14 * deg, 80 * deg));
            }
            travel = ANG(a.dot(b)) - halo;
            if (travel < 6 * deg) { a = SN.dirFromYawPitch(ye - sgn * 16 * deg, endP + (rise ? -12 : 12) * deg); travel = ANG(a.dot(b)) - halo; }
            if (clearOfMoon(a, b, travel)) break;
          }
          if (consider(a, b, travel)) break;
        }
      } else {
        // it sweeps across the upper screen toward the cat's side and leaves by the edge (judged
        // on the part before the edge). When roofs hide that, a second sweep runs just above the
        // local skyline at its start and at the frame's edge (inside the top), if it shows better
        const ya = cy - sgn * 18 * deg;
        let a, b;
        for (const dp of [0, -10, 10, -18]) {
          a = SN.dirFromYawPitch(ya, clamp(cp + (16 + dp) * deg, 10 * deg, 70 * deg));
          b = SN.dirFromYawPitch(cy + sgn * 85 * deg, clamp(lerp(cp + 8 * deg, tp, 0.3) + dp * deg, 8 * deg, 70 * deg));
          if (clearOfMoon(a, b, 70 * deg)) break;
        }
        if (!consider(a, b, 70 * deg, 42 * deg)) {
          const ye = cy + sgn * (hh - 6 * deg);
          const pa = Math.min(Math.max(cp + 16 * deg, skylinePitch(cam, ya) + 3 * deg), top), pe = Math.min(Math.max(cp + 10 * deg, skylinePitch(cam, ye) + 3 * deg), top);
          const la = SN.dirFromYawPitch(ya, pa), le = SN.dirFromYawPitch(ye, pe), lb = fromArc(la, V().crossVectors(la, le).normalize(), 70 * deg);
          if (clearOfMoon(la, lb, 70 * deg)) consider(la, lb, 70 * deg, 42 * deg);
        }
      }
      const { a, b, travel } = pick;
      if (still) {   // reduced motion: a short streak laid in place, pointing where to look
        const n = V().crossVectors(a, b).normalize(), t1 = front ? travel : 42 * deg, t0 = Math.max(0, t1 - 13 * deg);
        return shootingStar(fromArc(a, n, t0), fromArc(a, n, t1), { kind: 'guide', still: true, tail: 12 * deg, bend: 0, width: 0.44 });
      }
      return shootingStar(a, b, { kind: 'guide', travel, tail: 17 * deg, draw: 0.9 * clamp(travel / (25 * deg), 1, 2.2), fade: 0.9, width: 0.44, bend: 0 });
    }
    SN.on('hint', d => { try { guidingStar(d); } catch (e) { console.warn('[sky] guiding star', e); } });
    function stepAmbient(dt) {
      if (SN.game.state !== 'playing' || reduced() || animOff) return;
      if ((ambientIn -= dt) > 0) return;
      ambientIn = shot ? 5 : ambientStar() ? srnd.range(40, 90) : 4;   // nowhere clear right now: try again soon
    }
    function followShoot() { if (shootMesh.visible) { shootMesh.position.copy(SN.camera.position); shootMesh.updateMatrixWorld(true); } }

    follow();
    SN.onUpdate((dt, t) => {
      rebakeIfNeeded(); follow(); stepAnim(dt); domeMat.uniforms.uTime.value = t;
      if (SN.game.state !== 'paused') { stepAmbient(dt); stepShoot(dt); }
      followShoot();
    }, -100);

    // an anchor so the cats module can find the moon. It follows the camera, so parent the cat to
    // data.moonSeat.object; pos is only where the seat is when seen from the start view.
    const st = layout.start, eye = V(st.x, SN.world.heightAt(st.x, st.z) + SN.player.eye, st.z);
    const seatWorld = eye.addScaledVector(moonDir, MOON_D).addScaledVector(moonF.r, moonSeat.position.x).addScaledVector(moonF.u, moonSeat.position.y).addScaledVector(moonDir, -moonSeat.position.z);
    SN.world.addAnchor({
      id: 'sky-moon', kind: 'sky-moon', pos: seatWorld, facing: yawOf(moonDir) + Math.PI, surface: 'moon', space: 3, module: 'sky',
      note: 'curled up asleep on the crescent moon', maxDist: Infinity, tags: ['sky', 'moon', 'follows-camera'],
      data: { moonSeat },
    });
    lap('dome');

    console.log(`[sky] ${strokeCount} strokes, ${vertCount} verts, cube ${RES}, ${JSON.stringify(timing)}`);
    return {
      dome, moonDir: moonDir.clone(), moonSeat, placeOnSky,
      starDirs: stars.map(s => s.dir.clone()), venusDir: venus.dir.clone(),
      stars: [...stars, venus].map(s => ({ dir: s.dir.clone(), core: s.core, halo: s.halo, kind: s.kind })),
      minorStarDirs: minor.map(s => s.dir.clone()),
      swirlDir: swirlDir.clone(), cube: cubeRT.texture, timing, strokeCount,
      rebake: () => bakeSky(),   // dev/test: bake the cube map again from the stroke log
      // a shooting star now: shootingStar() = an ambient one, shootingStar({hint: {position}}) = a
      // guiding one; {hold: seconds} freezes it at that age (screenshots). Returns false if none fit.
      shootingStar(opts = {}) {
        const s = opts.hint ? guidingStar(opts.hint) : opts.from && opts.to ? shootingStar(opts.from, opts.to, opts) : ambientStar();
        if (s && opts.hold != null) { s.hold = opts.hold; stepShoot(0); }
        return !!s;
      },
      get shooting() { return shot ? { kind: shot.kind, t: +shot.t.toFixed(2), still: shot.still } : null; },
      get nextAmbient() { return +ambientIn.toFixed(1); },   // dev: seconds of play until the next ambient star
    };
  },
});