// 10-landscape.js — everything natural outside the village plateau: the painted terrain, the
// road down from the painter's hill, dry-stone walls and fences, THE cypress and its smaller
// cousins in rows and pairs, the Saint-Rémy olive groves, the painting's dark round trees,
// hedgerows between the fields, wheat fields with haystacks, bushes, rocks, footpaths, grass and
// irises; the boundary wall with its field gate and wayside cross, the terraced rim beyond it,
// and the Alpilles ranges that close every horizon. Leaf masses (round trees, bushes, hedgerows,
// olive crowns) share the village's tree look — clumped crowns, curling world-space strokes, blue
// shadows, a thin ink silhouette — in four levels of detail per tree (far / lo / hi / near, see
// leafMaterial), fringed with brush-dab splats; small solid things merge into per-sector meshes.
// See ARCHITECTURE.md.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

let SN, P, W, L, rgb;

(window.SN_MODULES ||= []).push({
  name: 'landscape', level: 'starry-night', order: 10,
  async build(sn) {
    SN = sn; P = SN.palette; W = SN.world; L = W.layout; rgb = SN.color.hexToRgb;
    // the macro canvas at this device's texture size (2048 desktop · 1024 phones and safe mode; see
    // texScale): its strokes are laid down in metres × pixels-per-metre, so they scale with it
    TER.TEX = Math.max(1024, SN.texSize(2048));
    const T = {}; let t0 = performance.now();
    const lap = k => { const t = performance.now(); T[k] = Math.round(t - t0); t0 = t; };

    const fields = buildFields(); lap('fields');
    const grids = fieldGrids(fields); lap('grids');
    const road = buildRoad(); lap('road');
    const cypress = buildCypresses(); lap('cypress');
    const ranges = buildAlpilles(); lap('alpilles');
    const props = buildProps(fields, cypress); lap('props');
    const rows = buildCypressRows(cypress, props); lap('rows');
    const terrain = buildTerrain(fields, grids, shadowList(cypress, props, rows)); lap('terrain');
    const splats = buildSplats(); lap('splats');
    const cover = buildGroundCover(fields, props); lap('cover');
    const anchors = buildAnchors(cypress, props, cover); lap('anchors');
    if (W.addSightTest) W.addSightTest(wheatSight(fields));

    // wind in the cypresses and grass; held still when the viewer prefers reduced motion
    SN.onUpdate((dt, t) => { if (!SN.reducedMotion) SHARED.uTime.value += dt; }, -5);
    if (SN.params.test) console.log('[landscape] ms', JSON.stringify(T), 'terrain', JSON.stringify(TER.ms), 'crest lines', TER.lines || 0, 'tris', JSON.stringify(Object.fromEntries(Object.entries(TRI).filter(([k]) => k !== 'kind').map(([k, v]) => [k, Math.round(v)]))), 'counts', JSON.stringify({ olives: props.trees.length, rim: props.rimTrees.length, rounds: props.rounds.length, hedges: props.hedges.length, splats: splats.count, rows: rows.list.length }), 'dabs', JSON.stringify(SPLN));
    return { ground: terrain.mesh, road: road.mesh, cypress: cypress.hero, cypresses: cypress, cypressRows: rows, ranges: ranges.mesh, props: props.mesh, walls: props.wallMesh, leaves: props.leafMesh, leafCells: props.leafCells, lod: LOD, splats, cover: cover.mesh, trees: props.trees, rounds: props.rounds, anchors, timings: T, roadPath: ROAD, fields };
  },
});

// ---------------------------------------------------------------- small helpers
const TAU = Math.PI * 2;
// painted textures at this device's size (SN.texSize: the same on desktops, half on phones and
// other constrained devices; textures of 256 px or less are left alone). Safe mode is held at half
// too, not a quarter: it already drops the paint filter's targets and shrinks the sky cube (the
// whole painting is ~55 MB there), and these are the ground and walls the player looks at all the
// time — at a quarter the road and fields turn to mud.
// strokeTex(opts, key): SN.paint's stroke painter at the scaled size, stroke lengths, widths and
// counts scaled with it so the brushwork keeps its look; fitCanvas(cv): a hand-painted canvas with
// a fixed pixel layout, filtered down (its full-size backing store is released).
const texScale = (w, h) => { const m = Math.max(w, h); return m > 256 ? Math.min(1, Math.max(0.5, SN.texSize(m) / m)) : 1; };
function strokeTex(o, key) {
  const w = o.w || o.size || 256, h = o.h || o.size || 256, s = texScale(w, h);
  if (s >= 1) return SN.paint.texture(o, { key });
  const sc = v => v && [v[0] * s, v[1] * s];
  return SN.paint.texture({ ...o, size: undefined, w: Math.round(w * s), h: Math.round(h * s), len: sc(o.len), width: sc(o.width), count: Math.round((o.count ?? (w * h) / 90) * s * s) }, { key });
}
function fitCanvas(cv) {
  const s = texScale(cv.width, cv.height);
  if (s >= 1) return cv;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(cv.width * s)); c.height = Math.max(1, Math.round(cv.height * s));
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(cv, 0, 0, c.width, c.height);
  cv.width = cv.height = 0;
  return c;
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lit = (c, k) => (k >= 0 ? mixc(c, [255, 255, 255], k) : mixc(c, [0, 0, 0], -k));
const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const sat = t => (t < 0 ? 0 : t > 1 ? 1 : t);
// yaw (core convention: 0 = -Z, + = left) that looks from (ax,az) toward (bx,bz)
const yawTo = (ax, az, bx, bz) => Math.atan2(-(bx - ax), -(bz - az));

// ---------------------------------------------------------------- the road (extended over the hill)
// layout.road runs from the painter's viewpoint down into the square; the landscape continues it
// uphill behind the start so it comes from somewhere, and stops painting it at the village edge.
const ROAD = [];
function roadPath() {
  if (ROAD.length) return ROAD;
  const pts = [[-34, 152], [-29, 132], [-24, 112], [-19, 92], ...L.road].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = Math.round(curve.getLength() / 0.8);
  let s = 0, prev = null;
  for (const p of curve.getSpacedPoints(n)) {
    if (prev) s += Math.hypot(p.x - prev.x, p.z - prev.z);
    ROAD.push({ x: p.x, z: p.z, s }); prev = p;
  }
  for (let i = 0; i < ROAD.length; i++) { // unit tangent, pointing downhill toward the village
    const a = ROAD[Math.max(0, i - 1)], b = ROAD[Math.min(ROAD.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, m = Math.hypot(dx, dz) || 1;
    ROAD[i].tx = dx / m; ROAD[i].tz = dz / m;
  }
  return ROAD;
}
// fast road / footpath distances from the 2 m grids stamped in fieldGrids (accurate to ~0.2 m
// out to ~7 m; 99 beyond): for clearance tests, where the exact roadDist below is overkill
const DIST = {};
function gridDist(arr, x, z) {
  if (!DIST.N) return 99;
  const { N, D, EXT } = DIST, fi = SN.clamp((x + EXT) / D, 0, N - 1.001), fj = SN.clamp((z + EXT) / D, 0, N - 1.001), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * N + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + N] * (1 - u) + arr[k + N + 1] * u) * v;
}
const roadNear = (x, z) => gridDist(DIST.DR, x, z), pathNear = (x, z) => gridDist(DIST.DP, x, z);
// distance from (x,z) to the extended road polyline (coarse early-out; exact near the road)
function roadDist(x, z) {
  const R = roadPath();
  let best = Infinity;
  for (let i = 0; i < R.length - 1; i += 1) {
    const a = R[i], b = R[i + 1];
    const qx = x - a.x, qz = z - a.z;
    if (qx * qx + qz * qz > (best + 2) * (best + 2) && best < 50) continue;
    const vx = b.x - a.x, vz = b.z - a.z, t = sat((qx * vx + qz * vz) / (vx * vx + vz * vz));
    const d = Math.hypot(qx - vx * t, qz - vz * t);
    if (d < best) best = d;
  }
  return best;
}
// point on the road at arc length s, offset sideways by `off` (+ = right when walking downhill)
function roadAt(s, off = 0) {
  const R = roadPath();
  let i = 0; while (i < R.length - 2 && R[i + 1].s < s) i++;
  const a = R[i], b = R[i + 1], t = sat((s - a.s) / (b.s - a.s || 1));
  const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, tx = a.tx, tz = a.tz;
  return { x: x - tz * off, z: z + tx * off, tx, tz };
}

// ---------------------------------------------------------------- site plan: fields, groves, paths, terraces
// Wheat fields are ragged polygons (x,z) with rounded corners; olive groves are ellipses planted in
// rows along the contours; footpaths leave the village lanes for the fields, groves and crests; and
// the rim beyond the walk radius is stepped into terraces (painted far off, built in stone near).
const chaikin = (pts, n = 1, closed = true) => {
  let p = pts;
  for (let k = 0; k < n; k++) {
    const out = [], m = p.length;
    for (let i = 0; i < (closed ? m : m - 1); i++) {
      const a = p[i], b = p[(i + 1) % m];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = closed ? out : [p[0], ...out, p[m - 1]];
  }
  return p;
};
// every edge split into ~3.5 m steps, each point pushed along the edge's outward normal by smooth
// noise (+-amp), corners pulled in; `fixed` edges (a wall runs along them) only ever move inward
function ragged(poly, amp, seed, fixed = [], only = null) {
  const n = poly.length; let area = 0;
  for (let i = 0; i < n; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n]; area += x0 * z1 - x1 * z0; }
  const sg = Math.sign(area) || 1, out = [];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0), m = Math.max(2, Math.round(L / 3.5));
    const nx = (sg * (z1 - z0)) / L, nz = (-sg * (x1 - x0)) / L;
    for (let k = 0; k < m; k++) {
      const t = k / m, px = SN.lerp(x0, x1, t), pz = SN.lerp(z0, z1, t);
      if (only && !only.includes(i)) { out.push([px, pz]); continue; }
      let d = amp * (SN.noise2(px * 0.085 + seed, pz * 0.085 - seed) * 0.75 + SN.noise2(px * 0.3 - seed, pz * 0.3 + seed * 0.5) * 0.25);
      d -= amp * 0.9 * (1 - SN.smoothstep(0, 9, Math.min(t, 1 - t) * L)); // round the corners
      if (fixed.includes(i)) d = -Math.abs(d) * 0.3 - 0.35;
      out.push([px + nx * d, pz + nz * d]);
    }
  }
  return chaikin(out, 2);
}
// walk a contour both ways from (sx,sz) in `step` m steps; stop(x,z) ends a side
function traceContour(sx, sz, n, step, stop) {
  const H = W.heightAt, h0 = H(sx, sz), e = 0.6, line = [[sx, sz]];
  const grad = (x, z) => [(H(x + e, z) - H(x - e, z)) / (2 * e), (H(x, z + e) - H(x, z - e)) / (2 * e)];
  for (const dir of [1, -1]) {
    let x = sx, z = sz;
    for (let i = 0; i < n; i++) {
      const [gx, gz] = grad(x, z), gm = Math.hypot(gx, gz);
      if (gm < 0.03) break;
      x += (-gz / gm) * step * dir; z += (gx / gm) * step * dir;
      for (let k = 0; k < 2; k++) { const [gx2, gz2] = grad(x, z), g2 = gx2 * gx2 + gz2 * gz2 || 1, dh = H(x, z) - h0; x -= (dh * gx2) / g2; z -= (dh * gz2) / g2; }
      if (stop && stop(x, z, i)) break;
      dir > 0 ? line.push([x, z]) : line.unshift([x, z]);
    }
  }
  return line;
}
// a smoothed open polyline, resampled every `step` m
function smoothPath(pts, step = 1) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  return c.getSpacedPoints(Math.max(2, Math.round(c.getLength() / step))).map(p => [p.x, p.z]);
}
// distances to the road and the footpaths on the 2 m grid, stamped segment by segment (only the
// near band matters): cheap clearance tests for the site plan, the props and the ground cover
function stampDistances(fields) {
  const { EXT } = TER, D = 2, N = Math.round((2 * EXT) / D) + 1;
  const DR = new Float32Array(N * N).fill(99), DP = new Float32Array(N * N).fill(99);
  const stamp = (arr, P2, reach, w = 0) => {
    for (let s = 0; s < P2.length - 1; s++) {
      const [ax, az] = P2[s], [bx, bz] = P2[s + 1], vx = bx - ax, vz = bz - az, vv = vx * vx + vz * vz || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + EXT) / D)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach + EXT) / D));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + EXT) / D)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach + EXT) / D));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const qx = -EXT + i * D - ax, qz = -EXT + j * D - az, t = sat((qx * vx + qz * vz) / vv), d = Math.hypot(qx - vx * t, qz - vz * t) - w;
        const k = j * N + i; if (d < arr[k]) arr[k] = d;
      }
    }
  };
  stamp(DR, roadPath().map(p => [p.x, p.z]), 8);
  for (const pth of fields.paths) stamp(DP, pth.pts, 7, pth.w * 0.5);
  Object.assign(DIST, { N, D, EXT, DR, DP });
}
function buildFields() {
  const east = [[74, -14], [104, -24], [113, 20], [81, 31]], west = [[-57, 44], [-86, 36], [-97, 70], [-63, 82]];
  const F = {
    // edge 3 of each field runs along its dry-stone wall (see buildProps)
    wheat: [ragged(east, 2.6, 3.1, [3]), ragged(west, 2.6, 7.7, [3])],
    // stubble is where a field AND its stubble polygon overlap; only the dividing edge is wavy
    stubble: [ragged([[70, 14.5], [112, 4], [125, 30], [70, 40]], 1.3, 5.2, [], [0]), ragged([[-50, 40], [-95, 30], [-95, 53], [-50, 61]], 1.3, 9.4, [], [2])],
    furrow: [Math.atan2(-10, 30), Math.atan2(-8, -29)],    // stroke direction inside each field
    groves: [
      { x: 30, z: 80, rx: 20, rz: 15, rot: 0.2 },      // 0 east shoulder of the painter's hill
      { x: -86, z: -6, rx: 16, rz: 24, rot: -0.1 },    // 1 west slope across the valley
      { x: 50, z: -74, rx: 21, rz: 12, rot: 0.35 },    // 2 back hills, right of the village
      { x: -50, z: -82, rx: 17, rz: 10, rot: -0.3 },   // 3 back hills, left of the village
      { x: -96, z: -58, rx: 12, rz: 15, rot: 0.5 },    // 4 north-west slope
      { x: 96, z: -48, rx: 11, rz: 16, rot: -0.4 },    // 5 north-east slope
      { x: -52, z: 104, rx: 14, rz: 9, rot: 0.6 },     // 6 behind the painter's hill, west
      { x: 62, z: 90, rx: 12, rz: 9, rot: -0.5 },      // 7 behind the painter's hill, east
    ],
    // footpaths out of the village lanes (the town paints the lanes up to the village edge)
    paths: [
      { w: 1.3, pts: [[0.5, -34], [1, -48], [-3, -64], [-11, -82], [-19, -98], [-24, -106]] },  // church lane up to the crest rocks
      { w: 1.3, pts: [[-22, -29.5], [-32, -42], [-50, -54], [-72, -60], [-90, -66]] },          // north-west lane to the west groves
      { w: 1.3, pts: [[29, -25], [37, -38], [44, -52], [52, -63]] },                             // far-east lane up to the back-right grove
      { w: 1.5, pts: [[38, -3], [52, -5], [64, -8], [72, -11]] },                                 // east lane to the east field
      { w: 1.4, pts: [[-37.5, 7.5], [-50, 6], [-62, 1], [-72, -4]] },                             // west lane to the west grove
      { w: 1.2, pts: [[30, 27.5], [42, 35], [55, 40], [69, 37]] },                                // south-east lane to the little cypress
      { w: 1.2, pts: [[-27, 28.5], [-38, 35], [-48, 40], [-55, 44]] },                            // south-west lane to the west field
    ].map(p => ({ ...p, pts: smoothPath(p.pts, 1.2) })),
  };
  stampDistances(F);
  F.terraces = planTerraces(F);
  F.hedgerows = planHedgerows(F);
  return F;
}
// the bocage: hedgerows along the contours between the fields, broken by gaps (field gates), with
// a hedge running down the slope from one end now and then (a field's corner). Painted into the
// terrain as dark bands and built as hedges (buildProps), each run checked against the view.
function planHedgerows(F) {
  const r = SN.rng('landscape-hedgerows'), H = W.heightAt, out = [];
  const bad = (x, z) => { const q = Math.hypot(x, z); return q < 53 || q > 117 || roadNear(x, z) < 5.5 || pathNear(x, z) < 2.6 || inWheat(F, x, z) || F.groves.some(g => inGrove(g, x, z, 3) < 1) || Math.hypot(x - L.cypress.x, z - L.cypress.z) < 10; };
  const fall = (x, z, n) => { const line = [[x, z]], e = 0.6; for (let i = 0; i < n; i++) { const gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e), gm = Math.hypot(gx, gz); if (gm < 0.04) break; x -= (gx / gm) * 2; z -= (gz / gm) * 2; if (bad(x, z)) break; line.push([x, z]); } return line; };
  for (let gz = -118; gz <= 118; gz += 30) for (let gx = -118; gx <= 118; gx += 30) {
    const x = gx + r.range(-11, 11), z = gz + r.range(-11, 11);
    if (r() < 0.22 || bad(x, z)) continue;
    const line = traceContour(x, z, r.int(7, 14), 2, (px, pz) => bad(px, pz));
    if (line.length < 5) continue;
    for (let i = r.int(0, 2); i < line.length - 3;) { const n = r.int(6, 13), run = line.slice(i, i + n); if (run.length >= 4) out.push(run); i += n + r.int(2, 3); }
    if (r() < 0.55) { const [ex, ez] = line[r() < 0.5 ? 0 : line.length - 1], dn = fall(ex, ez, r.int(6, 12)); if (dn.length >= 5) out.push(dn.slice(1)); }
  }
  return out;
}
function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const inWheat = (F, x, z) => F.wheat.some(p => inPoly(p, x, z));
const inStubble = (F, x, z) => F.stubble.some((sp, i) => inPoly(sp, x, z) && inPoly(F.wheat[i], x, z));
// the share of the ground cover (wheat, grass, flowers) each quality draws (buildGroundCover)
const COVER_SHARE = q => (q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1);
// A sight test for the standing wheat (GPU-drawn cards the cats module's sight lines cannot see):
// the line's last metres, walked back from its end (the cat), count where they run through a wheat
// field (not its stubble) below the ears (~0.9 m); about a metre of that hides a cat. A line
// that drops steeply onto the cat (a viewer close by, above the ears) is hardly in the wheat at all.
// K is matched to the rendered wheat: at high quality the cards hide a cat sitting up (head ~0.5 m)
// behind ~1–1.3 m of stalks, so ls-wheat-east counts as seen from ~3 m in and not from the field's
// edge or the east hill (1.2 let the aim ring light on it, invisible, from 4.5 m and from 39 m up
// the hill). Lower qualities draw only a share of the cover (COVER_SHARE: 40% on phones, where the
// same cat sits in plain sight from 8 m), so the wheat thins, and hides, in step with what is drawn.
function wheatSight(fields) {
  const boxes = fields.wheat.map(p => [Math.min(...p.map(q => q[0])) - 1, Math.max(...p.map(q => q[0])) + 1, Math.min(...p.map(q => q[1])) - 1, Math.max(...p.map(q => q[1])) + 1]);
  const inWheat = (x, z) => boxes.some((b, i) => x > b[0] && x < b[1] && z > b[2] && z < b[3] && inPoly(fields.wheat[i], x, z)) && !inStubble(fields, x, z);
  const TOP = 0.9, STEP = 0.25, MAX = 8, K0 = 0.6;
  return (from, to) => {
    const K = K0 / COVER_SHARE(SN.quality);
    if (!boxes.some(b => to.x > b[0] && to.x < b[1] && to.z > b[2] && to.z < b[3])) return 0;
    const dx = from.x - to.x, dy = from.y - to.y, dz = from.z - to.z, L = Math.hypot(dx, dy, dz);
    if (L < 0.5) return 0;
    let len = 0;
    for (let s = STEP * 0.5, end = Math.min(L, MAX); s < end; s += STEP) {
      const t = s / L, x = to.x + dx * t, z = to.z + dz * t;
      if (to.y + dy * t - W.heightAt(x, z) < TOP && inWheat(x, z)) len += STEP;
    }
    return 1 - Math.exp(-len / K);
  };
}
// Terraces on the rim beyond the walk radius: groups of stacked contour lines, the lowest few built
// as dry-stone walls with olive rows (buildRim), the rest painted into the terrain. Each group sits
// in its own sector of the rim and steps up the slope at irregular heights.
function planTerraces(F) {
  const r = SN.rng('landscape-terraces'), H = W.heightAt, out = [];
  const groups = [[-8, 34], [30, 28], [62, 30], [100, 26], [140, 34], [178, 22], [214, 30], [250, 30], [292, 26], [328, 24]];
  for (const [azDeg, span] of groups) {
    const az = azDeg * SN.deg, cx = Math.sin(az), cz = -Math.cos(az); // compass: 0 = north (-Z), clockwise
    let rr = r.range(126.5, 129), lines = r.int(4, 7);
    for (let k = 0; k < lines && rr < 232; k++) {
      const sx = cx * rr, sz = cz * rr, half = (span * SN.deg * rr) / 2 * r.range(0.7, 1.1);
      const line = traceContour(sx, sz, Math.round(half / 1.8), 1.8, (x, z) => { const q = Math.hypot(x, z); return q < 125.5 || q > 250 || Math.abs(Math.atan2(Math.sin(Math.atan2(x, -z) - az), Math.cos(Math.atan2(x, -z) - az))) > span * SN.deg * 0.62; });
      if (line.length > 8) out.push({ pts: line, h: H(sx, sz), r: rr, group: azDeg, k });
      // the next terrace: 1.8-2.8 m higher up the slope
      const h1 = H(sx, sz) + r.range(1.8, 2.8);
      let q = rr; while (q < 260 && H(cx * q, cz * q) < h1) q += 0.8;
      rr = q + r.range(0, 2);
    }
  }
  return out;
}
function inGrove(g, x, z, pad = 0) {
  const c = Math.cos(g.rot), s = Math.sin(g.rot), dx = x - g.x, dz = z - g.z;
  const u = (c * dx + s * dz) / (g.rx + pad), v = (-s * dx + c * dz) / (g.rz + pad);
  return u * u + v * v;
}

// ---------------------------------------------------------------- terrain
// One indexed mesh: a square grid (1.6 m) inside radius 136 that matches heightAt, radially warped
// beyond so the spacing grows to ~16 m at the 290 m rim where the Alpilles take over.
// Its look is a large baked canvas of contour-following strokes (world-space UVs) multiplied by a
// close-range tiling detail stroke layer whose direction is blended from 6 orientations by a
// per-vertex flow attribute, so it stays brushy under your feet.
const TER = { S: 1.6, Q: 170, R1: 136, ROUT: 290, TEX: 2048, EXT: 290 };
TER.K = ((TER.ROUT - TER.R1) / (TER.Q - TER.R1) - 1) / (TER.Q - TER.R1);

// field grids on a 2 m lattice covering +-EXT: height, gradient, curvature, flow, colour
function fieldGrids(fields) {
  const { EXT } = TER, D = 2, N = Math.round((2 * EXT) / D) + 1;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = W.heightAt(-EXT + i * D, -EXT + j * D);
  const at = (i, j) => H[SN.clamp(j, 0, N - 1) * N + SN.clamp(i, 0, N - 1)];
  const FX = new Float32Array(N * N), FZ = new Float32Array(N * N), COL = new Float32Array(N * N * 3);
  const md = W.moonDir;
  const cMeadow = rgb(P.meadow), cDark = rgb(P.meadowDark), cBlue = rgb('#28506e'), cCrest = rgb('#5c8c7e');
  const cOliveG = mixc(rgb(P.olive), rgb(P.earth), 0.5), cEarth = rgb('#4b5352'), cNear = rgb(P.hillNear), cMid = rgb(P.hillMid);
  const cShoulder = mixc(rgb(P.path), rgb(P.olive), 0.55), cGrove = mixc(rgb('#7c8468'), rgb('#50605a'), 0.35);
  const cPathC = mixc(rgb(P.path), rgb(P.meadow), 0.35), cBack = mixc(cNear, cDark, 0.45);
  const PATCH = [rgb('#3f6f5c'), rgb('#1f4658'), rgb('#6a7a58'), rgb('#2c5a5a'), rgb('#284a4e')]; // meadow, blue, hay/fallow, blue-green, dark
  const { DR, DP } = DIST;
  const gBox = fields.groves.map(g => Math.max(g.rx, g.rz) + 10);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = -EXT + i * D, z = -EXT + j * D, r = Math.hypot(x, z);
    const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * D), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * D);
    const lapl = (at(i + 3, j) + at(i - 3, j) + at(i, j + 3) + at(i, j - 3) - 4 * at(i, j)) / 36;
    // flow: contour direction (perpendicular to the gradient) as a doubled angle, noise swirl where flat
    const gm = Math.hypot(gx, gz), wc = SN.smoothstep(0.02, 0.12, gm);
    const tc = Math.atan2(gz, gx) + Math.PI / 2, tn = SN.noise2(x * 0.013 + 40, z * 0.013) * Math.PI * 1.4;
    const fx = wc * Math.cos(2 * tc) + (1 - wc) * Math.cos(2 * tn), fz = wc * Math.sin(2 * tc) + (1 - wc) * Math.sin(2 * tn);
    const fm = Math.hypot(fx, fz) || 1; FX[k] = fx / fm; FZ[k] = fz / fm;
    // region colour
    const nx = -gx, nz = -gz, nm = Math.hypot(nx, 1, nz), moon = (nx * md.x + md.y + nz * md.z) / nm;
    const crest = sat(-lapl * 6), hollow = sat(lapl * 6);
    const patch = SN.fbm2(x * 0.012 + 3, z * 0.012 - 5, 3);
    // the village edge is not a ruled circle: its radius wanders +-6 m
    const re = r < 84 ? r + 6 * SN.fbm2(x * 0.035 - 11, z * 0.035 + 4, 2) : r;
    let c = mixc(cMeadow, cBlue, SN.smoothstep(-0.25, 0.45, patch));
    if (r > 48 && r < 200) { // the field patchwork: each ~30 m cell gets its own tint
      const wn = 0.55 * SN.noise2(x * 0.02, z * 0.02), cx = Math.floor(x / 30 + wn), cz = Math.floor(z / 30 - wn), hsh = (((cx * 73856093) ^ (cz * 19349663)) >>> 0) % 5;
      c = mixc(c, PATCH[hsh], 0.26 * SN.smoothstep(48, 62, r));
    }
    c = mixc(c, cDark, hollow * 0.85);
    // the hills behind the village sit darker and bluer than the far Alpilles (crests stay lit)
    c = mixc(c, cBack, SN.smoothstep(-46, -92, z) * (1 - SN.smoothstep(95, 150, Math.abs(x))) * (1 - SN.smoothstep(150, 230, r)) * 0.42);
    c = mixc(c, cCrest, sat(crest * 0.8 + (moon - 0.62) * 2.2) * 0.65);
    c = mixc(c, cOliveG, SN.smoothstep(34, 44, re) * (1 - SN.smoothstep(50, 74, re)) * 0.7);
    fields.groves.forEach((g, gi) => { if (Math.abs(x - g.x) < gBox[gi] && Math.abs(z - g.z) < gBox[gi]) c = mixc(c, cGrove, (1 - SN.smoothstep(0.55, 1.2, inGrove(g, x, z, 4))) * 0.55); });
    c = mixc(c, mixc(cNear, cMid, sat(moon * 1.4 - 0.5)), SN.smoothstep(120, 230, r));
    if (r > 30 && r < 170) c = mixc(c, cShoulder, (1 - SN.smoothstep(1.5, 5, DR[k])) * 0.75);
    if (DP[k] < 4) c = mixc(c, cPathC, (1 - SN.smoothstep(0, 3.2, DP[k])) * 0.5);
    c = mixc(c, cEarth, 1 - SN.smoothstep(35, 45, re));
    COL[k * 3] = c[0]; COL[k * 3 + 1] = c[1]; COL[k * 3 + 2] = c[2];
  }
  const idx = (x, z) => {
    const i = SN.clamp(Math.round((x + EXT) / D), 0, N - 1), j = SN.clamp(Math.round((z + EXT) / D), 0, N - 1);
    return j * N + i;
  };
  // bilinear flow sample (doubled-angle vector)
  const flowAt = (x, z) => {
    const fi = SN.clamp((x + EXT) / D, 0, N - 1.001), fj = SN.clamp((z + EXT) / D, 0, N - 1.001);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const k = j * N + i;
    const bx = (FX[k] * (1 - u) + FX[k + 1] * u) * (1 - v) + (FX[k + N] * (1 - u) + FX[k + N + 1] * u) * v;
    const bz = (FZ[k] * (1 - u) + FZ[k + 1] * u) * (1 - v) + (FZ[k + N] * (1 - u) + FZ[k + N + 1] * u) * v;
    return [bx, bz];
  };
  return { N, D, H, FX, FZ, COL, DR, DP, idx, flowAt };
}

// the large macro canvas: underpainting + contour-following flow strokes + fields + shoulder
function paintMacro(G, fields, shadows = []) {
  const { TEX, EXT } = TER, pxm = TEX / (2 * EXT); // pixels per metre
  const cv = document.createElement('canvas'); cv.width = cv.height = TEX;
  const g = cv.getContext('2d');
  // moon shadows: every crown, cypress and hedge darkens the colour grid in a soft pool thrown away
  // from the moon, so the underpainting and every stroke laid over it pick the shadow up
  const md = W.moonDir, hl = Math.hypot(md.x, md.z), shx = -md.x / hl, shz = -md.z / hl, cot = hl / md.y, cSh = [9, 18, 44];
  for (const [x, z, rx, rz, h, k, tall] of shadows) {
    const n = tall ? 5 : 1;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0, d = tall ? t * tall * cot * 0.8 : h * cot * 0.85, rr = (tall ? 1 - 0.65 * t : 1) * Math.max(rx, rz) * 1.15 + 0.6;
      const cx = x + shx * d, cz = z + shz * d, i0 = Math.floor((cx - rr + EXT) / G.D), i1 = Math.ceil((cx + rr + EXT) / G.D), j0 = Math.floor((cz - rr + EXT) / G.D), j1 = Math.ceil((cz + rr + EXT) / G.D);
      for (let j = Math.max(0, j0); j <= Math.min(G.N - 1, j1); j++) for (let ii = Math.max(0, i0); ii <= Math.min(G.N - 1, i1); ii++) {
        const q = Math.hypot(-EXT + ii * G.D - cx, -EXT + j * G.D - cz) / rr; if (q >= 1) continue;
        const w = k * (1 - SN.smoothstep(0.3, 1, q)) * 0.95, kk = (j * G.N + ii) * 3;
        for (let c = 0; c < 3; c++) G.COL[kk + c] += (cSh[c] - G.COL[kk + c]) * w;
      }
    }
  }
  // underpainting from the colour grid
  const small = document.createElement('canvas'); small.width = small.height = G.N;
  const sg = small.getContext('2d'), img = sg.createImageData(G.N, G.N);
  for (let k = 0; k < G.N * G.N; k++) { img.data[k * 4] = G.COL[k * 3]; img.data[k * 4 + 1] = G.COL[k * 3 + 1]; img.data[k * 4 + 2] = G.COL[k * 3 + 2]; img.data[k * 4 + 3] = 255; }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(small, 0, 0, TEX, TEX);
  const toPx = (x, z) => [(x + EXT) * pxm, (z + EXT) * pxm];
  // wheat fields: an ochre underpainting cooled by the moonlight (yellow is kept for the lights)
  const cWheat = mixc(rgb(P.wheat), rgb('#6f8a6a'), 0.22), cWheatD = mixc(rgb(P.wheatDark), rgb('#3a5a70'), 0.2);
  const cMoonG = rgb('#6f8a6a'), cMoonB = rgb('#3a5a70');
  const stubC = a => lit(mixc(mixc(cWheatD, cMoonG, 0.35), cMoonB, a * 0.3), -0.3);
  const inStubPoly = (x, z) => fields.stubble.some(sp => inPoly(sp, x, z));
  for (const poly of fields.wheat) {
    g.beginPath();
    poly.forEach(([x, z], i) => { const [px, py] = toPx(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.closePath(); g.fillStyle = css(mixc(cWheatD, [62, 84, 108], 0.3)); g.fill();
  }
  // flow strokes
  const r = SN.rng('landscape-macro');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const accentB = rgb(P.cerulean), accentG = rgb('#7f9a5a');
  const pts = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
  const stroke = (x, z, far, fi) => {
    const k = G.idx(x, z), field = fi >= 0;
    let c = [G.COL[k * 3], G.COL[k * 3 + 1], G.COL[k * 3 + 2]];
    // (stubble: cut straw cooled by the moon, never paler than the standing wheat; yellow is for light)
    const stub = field && inStubble(fields, x, z);
    if (field) c = stub ? stubC(r()) : mixc(cWheat, cWheatD, r() * 0.8);
    const q = r();
    if (field) { if (q < 0.18) c = mixc(c, cMoonB, 0.42); else if (q < 0.34) c = mixc(c, cMoonG, 0.45); else if (q < 0.44) c = stub ? mixc(c, [150, 158, 140], 0.16) : mixc(c, [226, 206, 138], 0.3); else c = lit(c, (r() - 0.5) * 0.16); }
    else if (q < 0.36) c = lit(c, (r() - 0.5) * 0.18);                            // the local colour
    else if (q < 0.6) c = mixc(lit(c, -0.2), [18, 34, 92], 0.32);                  // dark ultramarine
    else if (q < 0.8) c = mixc(lit(c, 0.14), [110, 170, 150], 0.2);                // moonlit green
    else if (q < 0.9) c = mixc(c, accentB, far ? 0.36 : 0.22);                      // cerulean
    else c = mixc(c, accentG, 0.4);                                                 // olive-yellow accent
    const len = (far ? SN.lerp(6, 12, r()) : SN.lerp(2.6, 5.5, r())) * pxm * (field ? 0.8 : 1);
    const wid = (far ? SN.lerp(1.1, 2.0, r()) : SN.lerp(0.55, 1.05, r())) * pxm * (field ? 0.75 : 1);
    // trace a short streamline both ways along the flow (inside a field: along its furrows)
    const step = len / 4 / pxm; // metres per streamline step
    pts[2][0] = x; pts[2][1] = z;
    const fur = field ? fields.furrow[fi] + 0.18 * Math.sin((x * Math.sin(fields.furrow[fi]) - z * Math.cos(fields.furrow[fi])) * 0.21) : 0;
    const [f0x, f0z] = G.flowAt(x, z), th0 = (field ? fur : Math.atan2(f0z, f0x) / 2) + (r() - 0.5) * 0.25;
    for (const dir of [1, -1]) {
      let px = x, pz = z, lx = Math.cos(th0) * dir, lz = Math.sin(th0) * dir;
      for (let s = 1; s <= 2; s++) {
        if (s > 1 && !field) { // follow the field, keeping the direction of travel
          const [fx, fz] = G.flowAt(px, pz), th = Math.atan2(fz, fx) / 2;
          let dx = Math.cos(th), dz = Math.sin(th);
          if (dx * lx + dz * lz < 0) { dx = -dx; dz = -dz; }
          lx = dx; lz = dz;
        }
        px += lx * step; pz += lz * step;
        const p = pts[2 + dir * s]; p[0] = px; p[1] = pz;
      }
    }
    g.strokeStyle = css(c); g.lineWidth = wid; g.globalAlpha = 0.85 + r() * 0.15;
    g.beginPath();
    for (let i = 0; i < 5; i++) { const [px, py] = toPx(pts[i][0], pts[i][1]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
    // a thinner bristle highlight along the same path (only where the eye comes close)
    if (far || x * x + z * z > 135 * 135) return;
    g.strokeStyle = css(lit(c, r() < 0.5 ? 0.1 : -0.1)); g.lineWidth = Math.max(1, wid * 0.35); g.globalAlpha = 0.7;
    g.beginPath();
    const o = (r() - 0.5) * wid * 0.5;
    for (let i = 1; i < 4; i++) { const [px, py] = toPx(pts[i][0], pts[i][1]); i > 1 ? g.lineTo(px + o, py + o) : g.moveTo(px + o, py + o); }
    g.stroke();
  };
  // stroke centres: a jittered lattice, finer where the player walks (and on the rim they face)
  const boxes = fields.wheat.map(p => [Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[1]))]);
  const fieldAt = (x, z) => boxes.findIndex((b, i) => x > b[0] && x < b[1] && z > b[2] && z < b[3] && inPoly(fields.wheat[i], x, z));
  for (const [spacing, rMin, rMax, far] of [[1.9, 0, 186, false], [4.6, 176, EXT + 4, true]]) {
    for (let z = -EXT; z < EXT; z += spacing) for (let x = -EXT; x < EXT; x += spacing) {
      const jx = x + r() * spacing, jz = z + r() * spacing, rr = Math.hypot(jx, jz);
      if (rr < rMin || rr > rMax) continue;
      if (rr < 36 && r() < 0.55) continue; // plateau: sparser, calmer strokes
      const fi = rr > 60 && rr < 130 ? fieldAt(jx, jz) : -1;
      stroke(jx, jz, far, fi);
      if (fi >= 0 && r() < 0.55) stroke(jx + (r() - 0.5) * spacing, jz + (r() - 0.5) * spacing, far, fi); // denser furrows
    }
  }
  // field edges feathered: short dashes across the boundary, wheat reaching out, meadow reaching in
  for (const [fi, poly] of fields.wheat.entries()) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length], L = Math.hypot(x1 - x0, z1 - z0);
      for (let t = 0; t < L; t += 0.8) {
        const x = SN.lerp(x0, x1, t / L), z = SN.lerp(z0, z1, t / L), inward = r() < 0.5, a = Math.atan2(z1 - z0, x1 - x0) + Math.PI / 2 + (r() - 0.5) * 1.1;
        const k = G.idx(x, z), cm = [G.COL[k * 3], G.COL[k * 3 + 1], G.COL[k * 3 + 2]];
        const c = inward ? mixc(lit(cm, (r() - 0.5) * 0.2), [18, 34, 92], r() * 0.25) : inStubPoly(x, z) ? mixc(stubC(r()), cMoonG, r() * 0.3) : mixc(cWheat, r() < 0.4 ? cMoonG : cWheatD, r() * 0.6);
        const len = SN.lerp(1.2, 3.2, r()), o = (r() - 0.5) * 1.6;
        const [ax, ay] = toPx(x + Math.cos(a) * (o - len / 2), z + Math.sin(a) * (o - len / 2)), [bx, by] = toPx(x + Math.cos(a) * (o + len / 2), z + Math.sin(a) * (o + len / 2));
        g.strokeStyle = css(c); g.globalAlpha = 0.8 + r() * 0.2; g.lineWidth = SN.lerp(0.35, 0.7, r()) * pxm;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    }
  }
  // footpaths: pale trodden earth in the middle, grass creeping in, a darker rut or two
  const cPath = rgb(P.path), cRut = rgb('#5f5b4e');
  for (const pth of fields.paths) {
    const Q = pth.pts;
    for (let i = 0; i < Q.length - 1; i++) {
      const [x0, z0] = Q[i], [x1, z1] = Q[i + 1], a = Math.atan2(z1 - z0, x1 - x0), nx = -Math.sin(a), nz = Math.cos(a);
      for (let k = 0; k < 3; k++) {
        const o = (r() - 0.5) * pth.w * 0.9, rut = k === 2 && r() < 0.5;
        const c = rut ? mixc(cRut, cPath, r() * 0.4) : mixc(cPath, rgb(P.meadow), SN.lerp(0.1, 0.45, r()));
        const len = SN.lerp(1.4, 2.8, r()), cx = SN.lerp(x0, x1, r()) + nx * o, cz = SN.lerp(z0, z1, r()) + nz * o;
        const [ax, ay] = toPx(cx - Math.cos(a) * len / 2, cz - Math.sin(a) * len / 2), [bx, by] = toPx(cx + Math.cos(a) * len / 2, cz + Math.sin(a) * len / 2);
        g.strokeStyle = css(lit(c, (r() - 0.5) * 0.12)); g.globalAlpha = 0.75 + r() * 0.25; g.lineWidth = SN.lerp(0.3, 0.6, r()) * pxm * (rut ? 0.7 : 1);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    }
  }
  // hedgerows: a dark ultramarine-green band under each run, its moonlit side picked out
  const cHedgeP = rgb('#10202e'), cHedgeT = rgb('#2f5454');
  for (const run of fields.hedgerows) for (let i = 0; i < run.length - 1; i++) {
    const [x0, z0] = run[i], [x1, z1] = run[i + 1];
    for (const [c, w, o, a] of [[cHedgeP, 2.2, 0, 0.8], [cHedgeT, 0.7, 0.8, 0.6]]) {
      const ang = Math.atan2(z1 - z0, x1 - x0), nx = -Math.sin(ang) * o, nz = Math.cos(ang) * o;
      const [ax, ay] = toPx(x0 + nx, z0 + nz), [bx, by] = toPx(x1 + nx, z1 + nz);
      g.strokeStyle = css(lit(c, (r() - 0.5) * 0.2)); g.globalAlpha = a; g.lineWidth = w * SN.lerp(0.8, 1.2, r()) * pxm;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
  // terraces on the rim: a dark riser under each step, a broken line of pale coping stones, and
  // round olive crowns painted flat along the step (the nearest steps also get real walls and trees)
  const cRiser = rgb('#142c44'), cStone = rgb('#8792a4'), cOlv = [rgb('#4f6e6a'), rgb('#5b7a72'), rgb('#44606a')], cOlvS = rgb('#16304e'); // (far crowns: dark blue-green, no pale puffs)
  for (const tr of fields.terraces) {
    const Q = tr.pts;
    for (let i = 0; i < Q.length - 1; i++) {
      if (r() < 0.12) continue; // broken, not ruled
      const [x0, z0] = Q[i], [x1, z1] = Q[i + 1], rr = Math.hypot(x0, z0), ox = x0 / rr, oz = z0 / rr; // outward = uphill
      const w = SN.lerp(0.8, 1.5, r()) * pxm;
      let [ax, ay] = toPx(x0 - ox * 0.5, z0 - oz * 0.5), [bx, by] = toPx(x1 - ox * 0.5, z1 - oz * 0.5);
      g.strokeStyle = css(mixc(cRiser, [G.COL[G.idx(x0, z0) * 3], G.COL[G.idx(x0, z0) * 3 + 1], G.COL[G.idx(x0, z0) * 3 + 2]], r() * 0.35)); g.globalAlpha = 0.85; g.lineWidth = w;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      if (r() < 0.8) { [ax, ay] = toPx(x0, z0); [bx, by] = toPx(x1, z1); g.strokeStyle = css(lit(cStone, (r() - 0.5) * 0.2)); g.globalAlpha = 0.8; g.lineWidth = SN.lerp(0.3, 0.5, r()) * pxm; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
    }
    if (tr.r < 146) continue; // near steps carry real olive trees instead
    for (let i = 2; i < Q.length - 2; i += 3 + (r() < 0.4 ? 1 : 0)) {
      const [x, z] = Q[i], rr = Math.hypot(x, z), ox = x / rr, oz = z / rr, cr = SN.lerp(1.3, 1.9, r());
      const [sx, sy] = toPx(x + ox * (cr * 0.9 + 0.6) - oz * 0.4, z + oz * (cr * 0.9 + 0.6) + ox * 0.4);
      g.globalAlpha = 0.9; g.fillStyle = css(cOlvS); g.beginPath(); g.ellipse(sx, sy, cr * pxm * 1.05, cr * pxm * 0.8, 0, 0, TAU); g.fill();
      const [px, py] = toPx(x + ox * (cr + 0.9), z + oz * (cr + 0.9));
      for (let k = 0; k < 7; k++) { // the crown in short dabs
        const a = r() * TAU, d = r() * cr * 0.7;
        g.fillStyle = css(lit(r.pick(cOlv), (r() - 0.5) * 0.2)); g.globalAlpha = 0.85;
        g.beginPath(); g.ellipse(px + Math.cos(a) * d * pxm, py + Math.sin(a) * d * pxm, cr * pxm * 0.5, cr * pxm * 0.28, r() * Math.PI, 0, TAU); g.fill();
      }
    }
  }
  // pale brushed lines along the hill crests: the painting's lighter blue outlines. Seeds are the
  // convex shoulders found along radial rays (where the slope rolls over into a crest), never
  // fixed height levels: level contours on an evenly rising slope seen face-on read as ruled
  // paper. Each line follows its contour both ways and is laid down as broken dashes of varying
  // width, into a separate mask that becomes the texture's alpha (the shader shows it far off).
  const lc = document.createElement('canvas'); lc.width = lc.height = TEX;
  const lg = lc.getContext('2d'); lg.fillStyle = '#000'; lg.fillRect(0, 0, TEX, TEX); lg.lineCap = 'round'; lg.lineJoin = 'round';
  const occ = new Set(), cellOf = (x, z) => Math.floor(x / 12) + ',' + Math.floor(z / 12);
  const gradAt = (x, z) => { const e = 0.8; return [(W.heightAt(x + e, z) - W.heightAt(x - e, z)) / (2 * e), (W.heightAt(x, z + e) - W.heightAt(x, z - e)) / (2 * e)]; };
  const contourLine = (sx, sz) => {
    const h0 = W.heightAt(sx, sz), line = [[sx, sz]];
    for (const dir of [1, -1]) {
      let x = sx, z = sz;
      for (let i = 0; i < 60; i++) {
        const [gx, gz] = gradAt(x, z), gm = Math.hypot(gx, gz);
        if (gm < 0.09) break;
        x += (-gz / gm) * 1.6 * dir; z += (gx / gm) * 1.6 * dir;
        const [gx2, gz2] = gradAt(x, z), g2 = gx2 * gx2 + gz2 * gz2 || 1, dh = W.heightAt(x, z) - h0;
        x -= (dh * gx2) / g2; z -= (dh * gz2) / g2;
        const rr = Math.hypot(x, z);
        if (rr < 50 || rr > EXT - 6 || (occ.has(cellOf(x, z)) && i > 3) || fieldAt(x, z) >= 0) break;
        dir > 0 ? line.push([x, z]) : line.unshift([x, z]);
      }
    }
    if (line.length < 16) return;
    TER.lines = (TER.lines || 0) + 1;
    for (const [x, z] of line) occ.add(cellOf(x, z));
    let i = 0;
    while (i < line.length - 2) { // broken dashes
      const far = SN.smoothstep(80, 200, Math.hypot(line[i][0], line[i][1]));
      const n = Math.round(SN.lerp(6, 16, r())), w0 = SN.lerp(1.0, 1.9, r()) * (1 + far * 0.7), v = Math.round(SN.lerp(150, 255, r()));
      lg.strokeStyle = `rgb(${v},${v},${v})`; lg.lineWidth = w0 * pxm;
      lg.beginPath();
      for (let k = i; k < Math.min(line.length, i + n); k++) { const [px, py] = toPx(line[k][0] + (r() - 0.5) * 0.4, line[k][1] + (r() - 0.5) * 0.4); k > i ? lg.lineTo(px, py) : lg.moveTo(px, py); }
      lg.stroke();
      i += n + Math.round(SN.lerp(0, 3, r()));
    }
  };
  const hG = (x, z) => { // bilinear height from the 2 m grid
    const fi = SN.clamp((x + EXT) / G.D, 0, G.N - 1.001), fj = SN.clamp((z + EXT) / G.D, 0, G.N - 1.001), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * G.N + i;
    return (G.H[k] * (1 - u) + G.H[k + 1] * u) * (1 - v) + (G.H[k + G.N] * (1 - u) + G.H[k + G.N + 1] * u) * v;
  };
  const convex = (x, z) => -(hG(x + 7, z) + hG(x - 7, z) + hG(x, z + 7) + hG(x, z - 7) - 4 * hG(x, z)) / 49;
  const seeds = [];
  for (let a = 0; a < TAU; a += TAU / 48) {
    const ca = Math.cos(a), sa = Math.sin(a);
    let c0 = convex(ca * 70, sa * 70), c1 = convex(ca * 71, sa * 71);
    for (let d = 72; d < EXT - 8; d += 1) {
      const c2 = convex(ca * d, sa * d);
      if (c1 > 0.012 && c1 >= c0 && c1 > c2) seeds.push([ca * (d - 1), sa * (d - 1), c1 * (0.6 + 0.4 * SN.smoothstep(80, 200, d))]);
      c0 = c1; c1 = c2;
    }
  }
  // the strongest crests first; a handful of long lines in all, never two running side by side
  seeds.sort((p, q) => q[2] - p[2]);
  for (const [x, z] of seeds) { if ((TER.lines || 0) >= 18) break; if (!occ.has(cellOf(x, z))) contourLine(x, z); }
  // fold the line mask into alpha: a = 1 - 0.5 * mask (kept >= 0.5 so the colour survives intact)
  g.globalAlpha = 1;
  const id = g.getImageData(0, 0, TEX, TEX), lm = lg.getImageData(0, 0, TEX, TEX).data, d = id.data;
  for (let k = 3; k < d.length; k += 4) d[k] = 255 - (lm[k - 3] >> 1);
  g.putImageData(id, 0, 0);
  cv.under = small; // (the underpainting alone: the near ground's local colour, moon shadows and all)
  return cv;
}

// moon shadows for the macro canvas: every crown, cypress and hedge casts a soft dark pool on the
// ground, thrown away from the moon (so trees sit on the land, and groves read from the hills)
function shadowList(cyp, props, rows) {
  const out = [];
  for (const T of [...props.trees, ...props.rounds, ...props.rimTrees]) for (const lb of T.shadow || T.lobes) out.push([lb.x, lb.z, lb.rx * 1.2, lb.rz * 1.2, lb.y - W.heightAt(lb.x, lb.z), 0.62]);
  for (const c of [cyp.heroInfo, ...cyp.smalls, ...rows.list]) out.push([c.x, c.z, c.R0 * 1.5, c.R0 * 1.5, c.H * 0.35, 0.62, c.H]);
  for (const hd of props.hedges) if (hd) for (let i = 0; i < hd.pts.length; i += 2) out.push([hd.pts[i][0], hd.pts[i][1], hd.w, hd.w, hd.h * 0.5, 0.55]);
  return out;
}
function buildTerrain(fields, G, shadows = []) {
  const { S, Q, R1, K, ROUT } = TER;
  let tt = performance.now(); const tlap = k => { const n = performance.now(); TER.ms[k] = Math.round(n - tt); tt = n; };
  TER.ms = {};
  const n = Math.round((2 * Q) / S) + 1;
  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), flow = new Float32Array(n * n * 2);
  const clamped = new Uint8Array(n * n), tmp = new THREE.Vector3();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, qx = -Q + i * S, qz = -Q + j * S, rho = Math.hypot(qx, qz);
    let f = rho;
    if (rho > R1) { const d = rho - R1; f = R1 + d * (1 + K * d); if (f >= ROUT) { f = ROUT; clamped[k] = 1; } }
    const x = rho > 0 ? (qx * f) / rho : 0, z = rho > 0 ? (qz * f) / rho : 0;
    pos[k * 3] = x; pos[k * 3 + 1] = W.heightAt(x, z); pos[k * 3 + 2] = z;
    uv[k * 2] = (x + TER.EXT) / (2 * TER.EXT); uv[k * 2 + 1] = 1 - (z + TER.EXT) / (2 * TER.EXT);
    const [fx, fz] = G.flowAt(x, z); flow[k * 2] = fx; flow[k * 2 + 1] = fz;
  }
  // normals from the grid's own neighbours (a central difference, warped cells included); the
  // clamped rim and the border fall back to the analytic slope
  const ax = new THREE.Vector3(), az = new THREE.Vector3();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if (i > 0 && j > 0 && i < n - 1 && j < n - 1 && !clamped[k] && !clamped[k - 1] && !clamped[k + 1] && !clamped[k - n] && !clamped[k + n]) {
      ax.set(pos[(k + 1) * 3] - pos[(k - 1) * 3], pos[(k + 1) * 3 + 1] - pos[(k - 1) * 3 + 1], pos[(k + 1) * 3 + 2] - pos[(k - 1) * 3 + 2]);
      az.set(pos[(k + n) * 3] - pos[(k - n) * 3], pos[(k + n) * 3 + 1] - pos[(k - n) * 3 + 1], pos[(k + n) * 3 + 2] - pos[(k - n) * 3 + 2]);
      tmp.crossVectors(az, ax).normalize(); if (tmp.y < 0) tmp.negate();
    } else {
      const x = pos[k * 3], z = pos[k * 3 + 2], e = 6;
      tmp.set(W.heightAt(x - e, z) - W.heightAt(x + e, z), 2 * e, W.heightAt(x, z - e) - W.heightAt(x, z + e)).normalize();
    }
    nor[k * 3] = tmp.x; nor[k * 3 + 1] = tmp.y; nor[k * 3 + 2] = tmp.z;
  }
  const index = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (clamped[a] && clamped[b] && clamped[c] && clamped[d]) continue;
    if ((i + j) & 1) index.push(a, c, b, b, c, d); else index.push(a, c, d, a, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('flow', new THREE.BufferAttribute(flow, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();

  tlap('mesh');
  const mc = paintMacro(G, fields, shadows), macro = SN.paint.texture(mc, { key: 'landscape-macro' }); tlap('macro');
  macro.wrapS = macro.wrapT = THREE.ClampToEdgeWrapping;
  // the underpainting (2 m texels, no strokes): the local colour the near ground's dark strokes are
  // judged against, so a tree's moon shadow is never mistaken for a smudge and lifted away
  const under = new THREE.CanvasTexture(mc.under || document.createElement('canvas'));
  Object.assign(under, { colorSpace: THREE.SRGBColorSpace, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, generateMipmaps: false, minFilter: THREE.LinearFilter });
  const detail = strokeTex({
    size: 512, base: '#b4b4b4', seed: 'landscape-detail', count: 1500,
    colors: [['#9a9a9a', 3], ['#cfcfcf', 3], ['#eeeeee', 1.2], ['#8e96a8', 1], ['#b8c8b0', 1]],
    len: [36, 84], width: [7, 13], angle: 0, jitter: 0.16, curve: 0.18, alpha: [0.75, 1], light: 0.05, bristles: 3,
  }, 'landscape-detail');
  detail.colorSpace = THREE.NoColorSpace;
  const mat = SN.mat.paint({ map: macro, name: 'landscape-terrain' });
  const uniforms = { uDetail: { value: detail }, uDetailScale: { value: 1 / 3.2 }, uDetailAmt: { value: 0.85 }, uLineCol: { value: new THREE.Color('#5f92cf') }, uNearFade: { value: new THREE.Vector2(10, 40) }, uDashScale: { value: 1 / 8.5 }, uDashK: { value: new THREE.Vector4(0.62, 0.585, 1.2, 0) }, uUltra: { value: new THREE.Vector3(0.4, 0.45, 0.78) }, uUnder: { value: under }, ...FOG_UNIFORMS };
  // (uDashK: the near dashes' thresholds on the coarse stroke layer and their strength; uUltra: their colour x the local colour)
  TER.uniforms = uniforms;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 flow;\nvarying vec2 vFlow;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = flow;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uDetail; uniform float uDetailScale; uniform float uDetailAmt; uniform vec3 uLineCol; uniform vec2 uNearFade; uniform float uDashScale; uniform vec4 uDashK; uniform vec3 uUltra; uniform sampler2D uUnder; ${FOG_DECL}
varying vec2 vFlow; varying vec3 vWPos;
#if __VERSION__ >= 300
#define LS_LOD(t, u, l) textureLod(t, u, l)
#else
#define LS_LOD(t, u, l) texture2D(t, u, l + 3.0)
#endif
float lsDetail(vec2 p, float a, float o) {
  float c = cos(a), s = sin(a);
  return texture2D(uDetail, mat2(c, -s, s, c) * p + vec2(o * 0.37, o * 0.61)).g;
}`)
      .replace('#include <fog_fragment>', FOG_GLSL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.22;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float vd = length(vViewPosition);
  float lineM = clamp((1.0 - diffuseColor.a) * 2.0, 0.0, 1.0) * smoothstep(38.0, 120.0, vd);
  diffuseColor.a = 1.0;                                    // the alpha was only a mask; stay opaque for post
  diffuseColor.rgb = mix(diffuseColor.rgb, uLineCol * (0.85 + 0.3 * fract(sin(dot(floor(vWPos.xz * 0.05), vec2(7.1, 3.7))) * 917.0)), lineM * 0.7);
  float th = atan(vFlow.y, vFlow.x) * 0.5;                        // contour direction (mod pi)
  th = th < 0.0 ? th + 3.14159265 : th;                           // -> [0, pi)
  float k = th / 0.5235988;                                         // six orientations, 30 deg apart
  vec2 cell = floor(vWPos.xz * 0.9);
  float dith = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  float i0 = floor(k); float f = smoothstep(0.25, 0.75, k - i0 + dith * 0.5);
  vec2 p = vWPos.xz * uDetailScale;
  float d = mix(lsDetail(p, i0 * 0.5235988, i0), lsDetail(p, (i0 + 1.0) * 0.5235988, i0 + 1.0), f);
  float fade = 1.0 - 0.75 * smoothstep(20.0, 110.0, vd);
  // Close to the eye the macro is magnified ~3.5 texels a metre, and its dark flow strokes (2-4
  // texels wide) turn into soft smudges. There its darkness is lifted back toward the local colour
  // (a low mip: the strokes averaged away) and handed to crisp dashes instead: a coarser sample of
  // the same stroke layer, along the same flow, whose darker strokes go ultramarine where the macro
  // had its dark stroke (a smudge becomes a cluster of dashes); the fine layer's darker strokes get
  // a touch of ultramarine and its lighter ones a touch of moonlit green. Paths and field edges
  // (lighter than their surroundings) and the far view are untouched. The local colour is the
  // darker of that low mip and the underpainting itself: the mip alone would blur a tree's moon
  // shadow into the lighter grass around it and lift the shadow too.
  float nearK = 1.0 - smoothstep(uNearFade.x, uNearFade.y, vd);
  if (nearK > 0.001) {
    const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
    vec3 loc = LS_LOD(map, vMapUv, ${(2.8 - Math.log2(2048 / TER.TEX)).toFixed(2)}).rgb, und = texture2D(uUnder, vMapUv).rgb;
    loc = mix(loc, und, smoothstep(-0.012, 0.012, dot(loc, LUM) - dot(und, LUM)));
    float ll = dot(loc, LUM), dk = clamp(1.0 - dot(diffuseColor.rgb, LUM) / max(ll, 1e-4), 0.0, 1.0);
    float lift = smoothstep(0.08, 0.38, dk) * nearK;
    diffuseColor.rgb = mix(diffuseColor.rgb, loc, lift * 0.85);
    vec2 p2 = vWPos.xz * uDashScale;
    float d2 = mix(lsDetail(p2, i0 * 0.5235988, i0 + 3.0), lsDetail(p2, (i0 + 1.0) * 0.5235988, i0 + 4.0), f);
    float dash = smoothstep(uDashK.x, uDashK.y, d2), dD = smoothstep(0.68, 0.61, d), dL = smoothstep(0.78, 0.9, d);
    vec3 ultra = loc * uUltra;
    diffuseColor.rgb = mix(diffuseColor.rgb, ultra, clamp(dash * lift * uDashK.z + dD * nearK * 0.24, 0.0, 0.92));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 1.12, 1.02) + vec3(0.004, 0.012, 0.008), dL * nearK * 0.55);
  }
  diffuseColor.rgb *= mix(1.0, 0.25 + d * 1.05, uDetailAmt * fade);
}`);
  };
  mat.customProgramCacheKey = () => 'landscape-terrain-v6';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'landscape-terrain';
  SN.scene.add(mesh);
  return { mesh, grids: G };
}

// ---------------------------------------------------------------- road ribbon
// A 3.4 m ribbon that hugs heightAt, textured with pale earth strokes running along it and two
// darker cart ruts; alpha-tested ragged edges sit on the worn olive shoulder painted into the terrain.
function roadTexture() {
  const w = 256, h = 1024, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), r = SN.rng('landscape-road-tex');
  g.lineCap = 'round';
  const cols = [[P.path, 5], ['#9d9983', 3], ['#8f8566', 1.5], ['#7a7e88', 2], ['#aba78f', 1.2]];
  const tot = cols.reduce((s, c) => s + c[1], 0);
  const pick = () => { let t = r() * tot; for (const [c, k] of cols) if ((t -= k) <= 0) return c; return cols[0][0]; };
  const dash = (x, y, len, wid, col, a) => {
    for (const oy of [0, -h, h]) {
      g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = wid;
      g.beginPath(); g.moveTo(x, y + oy); g.quadraticCurveTo(x + (r() - 0.5) * wid * 2, y + oy + len / 2, x + (r() - 0.5) * wid, y + oy + len); g.stroke();
    }
  };
  g.fillStyle = P.path; g.fillRect(34, 0, w - 68, h);
  for (let i = 0; i < 3400; i++) {
    const edge = r() < 0.16;
    const x = edge ? (r() < 0.5 ? SN.lerp(12, 40, r()) : SN.lerp(216, 244, r())) : SN.lerp(30, 226, r());
    dash(x, r() * h, SN.lerp(70, 170, r()), SN.lerp(6, 13, r()), SN.color.shade(pick(), (r() - 0.5) * 0.1), 0.8 + r() * 0.2);
  }
  for (const rx of [86, 170]) for (let i = 0; i < 140; i++) // cart ruts
    dash(rx + (r() - 0.5) * 14, r() * h, SN.lerp(60, 140, r()), SN.lerp(6, 12, r()), SN.color.shade('#5f5b4e', (r() - 0.5) * 0.1), 0.75);
  for (let i = 0; i < 200; i++) // tufts of grass creeping in from the edges and the crown
    dash(r() < 0.85 ? (r() < 0.5 ? SN.lerp(10, 42, r()) : SN.lerp(214, 246, r())) : SN.lerp(120, 136, r()), r() * h, SN.lerp(24, 60, r()), SN.lerp(4, 8, r()), SN.color.shade(r() < 0.5 ? '#3f5f58' : '#56704f', (r() - 0.5) * 0.12), 0.9);
  g.globalAlpha = 1;
  return cv;
}
function buildRoad() {
  const R = roadPath(), half = 1.75, across = 5;
  const endS = R.find(p => Math.hypot(p.x, p.z) < 39)?.s ?? R[R.length - 1].s;
  const rows = R.filter(p => p.s <= endS);
  const pos = [], uv = [], fade = [], index = [];
  rows.forEach((p, i) => {
    // full width to the end, but over the last 8 m (where the town's lane fades in underneath)
    // the brushwork is eaten away stroke by stroke (see the shader below)
    const f = SN.smoothstep(0, 8, endS - p.s);
    for (let k = 0; k < across; k++) {
      const u = k / (across - 1), off = (u - 0.5) * 2 * half;
      const x = p.x - p.tz * off, z = p.z + p.tx * off;
      pos.push(x, W.heightAt(x, z) + 0.07, z); uv.push(u, p.s / 14); fade.push(f * (k === 0 || k === across - 1 ? 0.8 : 1));
    }
    if (i) for (let k = 0; k < across - 1; k++) {
      const a = (i - 1) * across + k, b = a + 1, c = a + across, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  geo.setIndex(index); geo.computeVertexNormals();
  const tex = SN.paint.texture(fitCanvas(roadTexture()), { key: 'landscape-road' });
  const mat = SN.mat.paint({ map: tex, alphaTest: 0.5, name: 'landscape-road' });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  { float n = texture2D(map, vMapUv * vec2(1.7, 2.3) + 0.37).g;           // stroke-shaped noise
    diffuseColor.a *= smoothstep(n - 0.08, n + 0.08, vFade * 1.25 - 0.12); }`);
  };
  mat.customProgramCacheKey = () => 'landscape-road-fade';
  mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'landscape-road';
  SN.scene.add(mesh);
  return { mesh };
}

// ---------------------------------------------------------------- shared shader patches
// Landscape fog: the core FogExp2 would wash the hills flat, so everything the landscape owns
// uses ~0.6 of its density and fades toward a painted hill blue rather than the flat fog colour.
const FOG_UNIFORMS = { uFogScale: { value: 0.62 }, uFogTint: { value: new THREE.Color('#1b3470') } };
const FOG_GLSL = `#ifdef USE_FOG
  { float fd = fogDensity * uFogScale;
    float fogFactor = 1.0 - exp(-fd * fd * vFogDepth * vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, uFogTint, 0.55), fogFactor); }
#endif`;
const FOG_DECL = 'uniform float uFogScale; uniform vec3 uFogTint;';
// sway: vertex displacement from a baked aSway attribute (x = metres of sway, y = phase), so many
// merged trees can move independently. rim: darken toward dark ultramarine where the surface turns
// away from the eye — every lobe and clump gets a painted outline. hull: inverted-hull outline pass.
const SHARED = { uTime: { value: 0 } };
const SWAY_GLSL = `
  { float w = aSway.x, ph = aSway.y;
    transformed.x += w * (sin(uTime * 0.71 + ph) * 0.8 + sin(uTime * 1.73 + ph * 2.1 + position.y * 0.23) * 0.3);
    transformed.z += w * (sin(uTime * 0.53 + ph * 1.37 + 1.1) * 0.55); }`;
function patchMaterial(mat, { sway = false, rim = 0, rimColor = P.outline, rimEdge = [0.55, 0.08], hull = 0, selfLit = 0, key }) {
  const rc = new THREE.Color(rimColor);
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = SHARED.uTime; sh.uniforms.uRimColor = { value: rc };
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    Object.assign(sh.uniforms, FOG_UNIFORMS);
    fs = fs.replace('#include <common>', '#include <common>\n' + FOG_DECL).replace('#include <fog_fragment>', FOG_GLSL);
    vs = vs.replace('#include <common>', `#include <common>\nuniform float uTime;\n${sway ? 'attribute vec2 aSway;' : ''}`);
    if (sway) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>' + SWAY_GLSL);
    if (hull) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 mvq = modelViewMatrix * vec4(transformed, 1.0);
    transformed += normalize(normal) * (${hull.toFixed(3)} + 0.0045 * -mvq.z); }`);
    if (selfLit) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * ${selfLit.toFixed(3)};`);
    if (rim) fs = fs.replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;')
      .replace('#include <opaque_fragment>', `{ float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
  outgoingLight = mix(outgoingLight, uRimColor, smoothstep(${rimEdge[0].toFixed(2)}, ${rimEdge[1].toFixed(2)}, ndv) * ${rim.toFixed(2)}); }
#include <opaque_fragment>`);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// ---------------------------------------------------------------- leaf masses: the village's tree look, two levels of detail
// Round trees, bushes, hedgerows and olive crowns share one leaf shader modelled on the village's
// trees (30-town), so village and countryside read as one painting: strokes mapped triplanar in
// world space (the curls keep one size on every clump, no seams), vertex colours that carry the
// light (a moonlit side, a bluer shaded side, darker crevices between clumps) over a texture that
// carries the hue, a faint inner glow (less of it far off) so shadows stay blue and never black,
// and a thin wobbling ultramarine silhouette with a paler band just inside it.
// Four levels of detail, one shape: every level tessellates the same clumps. Beyond LOD.F1 a tree
// is drawn from its coarsest clumps merged per sector (far: what the painter's hill and the high
// views see); within it, from coarse clumps in 20 m cells switched on near the camera (lo: the
// 15-40 m look); closer, from finer clumps in 10 m cells (hi); and the few trees within LOD.N1 of
// the eye get their finest crowns built on demand, one mesh each (near: no facets where the player
// walks). Every vertex carries its tree's centre (aLod), so the levels hand over per tree through
// dithered bands (N0..N1, R0..R1, F0..F1); hi yields to near only for trees listed in uNear.
// Parts whose aLod.y is NEVER always draw far (hedges, the rim).
const LOD = { N0: 6.5, N1: 9, R0: 17, R1: 24, F0: 52, F1: 64, CELL: 10, LCELL: 20, NMAX: 8 }, NEVER = -1e4;
const LEAF_U = { uLod: { value: new THREE.Vector2(LOD.R0, LOD.R1) }, uLodN: { value: new THREE.Vector2(LOD.N0, LOD.N1) }, uLodF: { value: new THREE.Vector2(LOD.F0, LOD.F1) }, uNear: { value: Array.from({ length: LOD.NMAX }, () => new THREE.Vector3(0, NEVER, 0)) } };
// (far: [d0, d1, k] — the crown darkens by k between d0 and d1 metres, so from the painter's hill
// the trees stay the painting's dark round masses and distant groves dark blue-green, not puffs)
function leafMaterial({ map, level = 'far', uv = 0.42, self = 0.24, selfFar = 0.5, rim = [0.12, 0.05, 0.85, 0.3], fill = 0.16, far = [35, 110, 0.45], name }) {
  const m = SN.mat.paint({ vertexColors: true, name });
  const U = {
    uLeafMap: { value: map }, uLeafUV: { value: uv }, uLeafSelf: { value: new THREE.Vector2(self, selfFar) },
    uLeafRim: { value: new THREE.Vector4(...rim) }, uLeafFar: { value: new THREE.Vector3(...far) }, uLeafInk: { value: new THREE.Color(P.outline) }, uLeafFill: { value: new THREE.Color('#5a78c8').multiplyScalar(fill) },
  };
  m.defines = { ['LEAF_' + level.toUpperCase()]: '', LEAF_NMAX: LOD.NMAX };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, FOG_UNIFORMS, LEAF_U, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aLod; uniform vec2 uLod; uniform vec2 uLodN; uniform vec2 uLodF; uniform vec3 uNear[LEAF_NMAX];
varying vec3 vLw; varying vec3 vLn; varying float vLodF; varying float vLodN;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  vLw = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vLn = normalize(mat3(modelMatrix) * objectNormal);
  // cumulative shares of this tree: near (vLodN) <= + hi (vLodF) <= + lo (vLodL); far takes the rest
  { float ld = distance(cameraPosition, aLod), never = step(aLod.y, -9000.0);
    vLodN = (1.0 - smoothstep(uLodN.x, uLodN.y, ld)) * (1.0 - never);
    vLodF = (1.0 - smoothstep(uLod.x, uLod.y, ld)) * (1.0 - never);
    float vLodL = (1.0 - smoothstep(uLodF.x, uLodF.y, ld)) * (1.0 - never);
    float lo = 0.0, hi = 1.0;
#if defined(LEAF_NEAR)
    hi = vLodN;
#elif defined(LEAF_HI)
    float on = 0.0; for (int i = 0; i < LEAF_NMAX; i++) on = max(on, step(distance(aLod, uNear[i]), 0.05));
    vLodN *= on; lo = vLodN; hi = vLodF;
#elif defined(LEAF_LO)
    lo = vLodF; hi = vLodL;
#else
    lo = vLodL;
#endif
    vLodN = lo; vLodF = hi; // this level's window of the dither: [lo, hi)
    if (hi <= lo) gl_Position = vec4(0.0, 0.0, 2.0, 1.0); // nothing to draw: past the far plane, clipped
  }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uLeafMap; uniform float uLeafUV; uniform vec2 uLeafSelf; uniform vec4 uLeafRim; uniform vec3 uLeafFar; uniform vec3 uLeafInk; uniform vec3 uLeafFill; ${FOG_DECL}
varying vec3 vLw; varying vec3 vLn; varying float vLodF; varying float vLodN;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  { float lh = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); // the levels take complementary pixels
    if (lh < vLodN || lh >= vLodF) discard; }`)
      .replace('#include <map_fragment>', `{
  vec3 tw = pow(abs(normalize(vLn)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
  vec3 tp = vLw * uLeafUV;
  diffuseColor.rgb *= (texture2D(uLeafMap, tp.zy + vec2(0.37, 0.11)) * tw.x + texture2D(uLeafMap, tp.xz + vec2(0.71, 0.53)) * tw.y + texture2D(uLeafMap, tp.xy) * tw.z).rgb;
  diffuseColor.rgb *= 1.0 - uLeafFar.z * smoothstep(uLeafFar.x, uLeafFar.y, length(vViewPosition));
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * (uLeafSelf.x * (1.0 - uLeafSelf.y * smoothstep(20.0, 70.0, length(vViewPosition))) + uLeafFill);`)
      .replace('#include <fog_fragment>', FOG_GLSL)
      .replace('#include <opaque_fragment>', `{ // a thin wobbling ultramarine silhouette around every clump, a paler contour band inside it
  float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
  float rimW = uLeafRim.x + uLeafRim.y * sin(vLw.x * 2.3 + vLw.y * 1.7) * sin(vLw.z * 2.1 - vLw.y * 1.3);
  float rimA = 1.0 - smoothstep(rimW * 0.5, rimW, facing);
  float rimBand = smoothstep(rimW * 0.5, rimW, facing) * (1.0 - smoothstep(rimW, rimW * 2.4, facing));
  outgoingLight *= 1.0 + uLeafRim.w * rimBand * (1.0 - smoothstep(25.0, 70.0, length(vViewPosition))); // (the pale band would grey a far crown)
  outgoingLight = mix(outgoingLight, uLeafInk, rimA * uLeafRim.z);
}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'landscape-leaf-' + level;
  return m;
}
// unit icospheres (indexed, so displaced copies get smooth normals)
const ICO = [];
const icoBase = d => ICO[d] || (ICO[d] = mergeVertices(new THREE.IcosahedronGeometry(1, d).deleteAttribute('normal').deleteAttribute('uv')));
// a clump: a noise-displaced icosphere. The lumps are a function of the unit sphere, so every
// tessellation of one clump has the same shape (hi and lo match through the hand-over).
// (detail: an icosphere level, or 'WxH' for a UV sphere; the coarsest level is cheapest that way)
// A coarse tessellation sits inside its sphere (flat faces), so it is pushed out to the sphere's
// mean radius: far crowns keep their size and stay solid instead of turning into loose blobs.
const INFLATE = { 0: 1.14, 1: 1.05, '6x4': 1.08, '7x5': 1.06 };
function clumpGeo(L, detail) {
  const g = (typeof detail === 'string' ? blobBase(...detail.split('x').map(Number)) : icoBase(detail)).clone(), p = g.attributes.position, inf = INFLATE[detail] || 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = inf * (1 + L.lump * SN.noise2(x * 1.7 + L.seed, z * 1.7 + y * 1.2 - L.seed) + L.lump * 0.55 * SN.noise2(y * 3.3 - L.seed, x * 2.9 + z * 1.3));
    p.setXYZ(i, L.x + x * L.rx * k, L.y + y * L.ry * k, L.z + z * L.rz * k);
  }
  g.computeVertexNormals();
  return g;
}
// drop the triangles buried inside the other clumps of a crown (each shrunk by its deepest lump,
// so no hole can open): a third of a clumped crown is never visible
function cullBuried(g, self, all) {
  const occl = all.filter(o => o !== self).map(o => { const S = 1 - (o.lump ?? 0.3) * 1.6, rot = o.rot || 0; return [o.x, o.y, o.z, 1 / (o.rx * S), 1 / (o.ry * S), 1 / (o.rz * S), Math.cos(rot), Math.sin(rot)]; });
  if (!occl.length || !g.index) return g;
  const p = g.attributes.position, bur = new Uint8Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    for (const [ox, oy, oz, ix, iy, iz, c, s] of occl) {
      const dx = x - ox, dz = z - oz, lx = c * dx - s * dz, lz = s * dx + c * dz;
      if ((lx * ix) ** 2 + ((y - oy) * iy) ** 2 + (lz * iz) ** 2 < 1) { bur[i] = 1; break; }
    }
  }
  const src = g.index.array, keep = [];
  for (let i = 0; i < src.length; i += 3) if (!(bur[src[i]] && bur[src[i + 1]] && bur[src[i + 2]])) keep.push(src[i], src[i + 1], src[i + 2]);
  g.setIndex(keep);
  return g;
}
// strip a leaf part down to what the leaf shader reads: position, normal, colour, its tree's centre
function leafPart(g, cols, cx, cy, cz) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = cx; a[i * 3 + 1] = cy; a[i * 3 + 2] = cz; }
  g.setAttribute('aLod', new THREE.BufferAttribute(a, 3));
  return g;
}
// the village's light multipliers over the leaf texture: moon side paler and warmer, the turned-away
// side bluer, crevices between clumps deep ultramarine (env < ~0.85 = inside the crown's envelope)
const TV = { deep: [0.3, 0.36, 0.58], shade: [0.52, 0.6, 0.86], mid: [0.78, 0.86, 0.86], lit: [1.25, 1.3, 1.0] };
function leafLight(nx, ny, nz, v0, env) {
  const md = W.moonDir, lt = sat(0.5 + 0.5 * (nx * md.x + ny * md.y + nz * md.z)), sky = sat(0.5 + 0.5 * ny);
  const v = sat(lt * 0.72 + sky * 0.22 + v0 - 0.18);
  let c = linMix(TV.shade, TV.mid, v);
  if (v > 0.62) c = linMix(c, TV.lit, (v - 0.62) * 1.9);
  return linMix(c, TV.deep, 1 - SN.smoothstep(0.7, 1.0, env));
}
// colour a placed leaf part: light from its world normals, plus a per-vertex value offset (height
// in the crown, the clump's own tone, a soft patchiness) and envelope depth from `aux(i, x, y, z)`
function lightPart(g, aux, tint = [1, 1, 1]) {
  const p = g.attributes.position, n = g.attributes.normal, cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), [v0, env] = aux(i, x, y, z);
    const c = leafLight(n.getX(i), n.getY(i), n.getZ(i), v0 + SN.noise2(x * 0.8 + 3.1, z * 0.8 + y * 0.9) * 0.12, env);
    cols[i * 3] = c[0] * tint[0]; cols[i * 3 + 1] = c[1] * tint[1]; cols[i * 3 + 2] = c[2] * tint[2];
  }
  return cols;
}
// a tongue: an upward-curling lick out of a clump, rooted inside it, bellying out past its surface
// and ending in a hooked tip, so the crown's edge breaks like the village trees' (a flattened horn,
// not a blade: seen edge-on a blade would be all outline)
function tongueGeo(T, K, M) {
  const { c, ux, uy, uz, len, w, up, hook } = T, sx = -uz, sz = ux, sm = Math.hypot(sx, sz) || 1, spine = [];
  const bx = c.x + ux * c.rx * 0.72, by = c.y + uy * c.ry * 0.72, bz = c.z + uz * c.rz * 0.72;
  for (let k = 0; k < K; k++) {
    const t = k / (K - 1), o = len * 0.62 * Math.sin(t * Math.PI * 0.5), h = len * up * Math.pow(t, 1.5), sd = hook * len * t * t * t;
    const shape = t < 0.2 ? SN.lerp(0.7, 1, t / 0.2) : Math.pow(Math.max(0, 1 - (t - 0.2) / 0.8), 0.8);
    spine.push({ p: [bx + ux * o + (sx / sm) * sd, by + uy * o + h, bz + uz * o + (sz / sm) * sd], a: Math.max(0.004, w * 0.72 * shape), b: Math.max(0.004, w * shape), out: [ux, uz], ref: [ux, uy * 0.5, uz] });
  }
  const g = sweep(spine, M, {});
  g.deleteAttribute('uv');
  return g;
}

// ---------------------------------------------------------------- sweep: tubes along a spine
// spine: [{p:[x,y,z], a, b, out:[x,z], ref?:[x,y,z], wob?:[]}] — a = half-thickness along `out` (or
// along `ref` made perpendicular to the spine), b = across; wob = per-segment radius bumps.
// Returns non-indexed-friendly arrays; normals are analytic (ellipse), UV u around, v along.
function sweep(spine, M, { vScale = 0.45, uRep = 2, col, sway } = {}) {
  const K = spine.length, pos = [], nor = [], uv = [], colr = [], sw = [], index = [];
  const T = new THREE.Vector3(), Rd = new THREE.Vector3(), B = new THREE.Vector3(), n = new THREE.Vector3();
  let s = 0;
  for (let k = 0; k < K; k++) {
    const q = spine[k], pa = spine[Math.max(0, k - 1)].p, pb = spine[Math.min(K - 1, k + 1)].p;
    T.set(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).normalize();
    if (q.ref) Rd.set(q.ref[0], q.ref[1], q.ref[2]); else Rd.set(q.out[0], 0, q.out[1]);
    Rd.addScaledVector(T, -Rd.dot(T));
    if (Rd.lengthSq() < 1e-6) Rd.set(1, 0, 0).addScaledVector(T, -T.x);
    Rd.normalize(); B.crossVectors(T, Rd).normalize();
    if (k) { const p0 = spine[k - 1].p; s += Math.hypot(q.p[0] - p0[0], q.p[1] - p0[1], q.p[2] - p0[2]); }
    const da = k ? (q.a - spine[k - 1].a) / Math.max(1e-3, Math.hypot(q.p[0] - spine[k - 1].p[0], q.p[1] - spine[k - 1].p[1], q.p[2] - spine[k - 1].p[2])) : 0;
    for (let m = 0; m <= M; m++) {
      const th = (m / M) * TAU, c = Math.cos(th), sn = Math.sin(th);
      const wob = q.wob ? 1 + q.wob[m % M] : 1;
      const a = Math.max(1e-3, q.a * wob), b = Math.max(1e-3, q.b * wob);
      pos.push(q.p[0] + Rd.x * a * c + B.x * b * sn, q.p[1] + Rd.y * a * c + B.y * b * sn, q.p[2] + Rd.z * a * c + B.z * b * sn);
      n.set(0, 0, 0).addScaledVector(Rd, c / a).addScaledVector(B, sn / b).normalize().addScaledVector(T, -SN.clamp(da, -2, 2) * 0.5).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push((m / M) * uRep, s * vScale);
      const cc = typeof col === 'function' ? col(k / (K - 1), c, sn, n) : col;
      if (cc) colr.push(cc[0], cc[1], cc[2]);
      if (sway) { const w = sway(q.p); sw.push(w[0], w[1]); }
    }
    if (k) for (let m = 0; m < M; m++) {
      const a0 = (k - 1) * (M + 1) + m, a1 = a0 + 1, b0 = a0 + M + 1, b1 = b0 + 1;
      index.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colr.length) g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  if (sw.length) g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 2));
  g.setIndex(index);
  return g;
}
// merge indexed geometries that share the same attribute set (keeps the index; no normalising)
function mergeSame(list) {
  const geos = list.filter(Boolean);
  const names = Object.keys(geos[0].attributes);
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry(), idx = new Uint32Array(ni);
  for (const k of names) {
    const it = geos[0].attributes[k].itemSize, arr = new Float32Array(nv * it);
    let o = 0; for (const g of geos) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, it));
  }
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
    else for (let i = 0; i < n; i++) idx[io++] = i + vo;
    vo += n;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // sRGB hex -> linear rgb
const linMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- the cypresses
// A cypress is a flame. A dark core is wrapped in separate licking tongues: each is a flattened,
// slightly twisting blade that rises out of the body, bellies out past the envelope and ends in a
// sharp upturned tip, so dark sky shows in the notch between one tip and the next tongue's flank.
// Tongues sit on a helix (a turn of `cols` per row, rows twisted against each other) and the
// envelope breathes in a helical wave, so from any side both edges undulate out of phase. The top
// splits into separate flames of unequal height; the foot flares and follows the slope.
// "Knees" are broad tongues whose belly juts out almost level before the tip turns up beside it:
// a curl a cat can lie in. The hero is kept clear of Venus's halo as seen from the painter's view.
function cypressParts(o) {
  const { x, z, H, R0, seed, lean = [0, 0], M = 12, K = 16, knees = [], swayAmp = 0.5, cols = 6, rowStep = 0.12, bodyTop = 0.6, flames = [], flare = 0.28, coreK = 22, coreM = Math.max(8, M - 2) } = o;
  const r = SN.rng(seed), yG = W.heightAt(x, z), y0 = yG - 0.45;
  const ph0 = r() * TAU;
  // base radius: flared foot, a slight belly in the lower third, tapering to the top
  const e0 = t => { const u = SN.clamp(t, 0, 1); return R0 * (1 + flare * Math.pow(1 - SN.smoothstep(0, 0.09, u), 2)) * Math.pow(Math.max(0.03, 1 - u), 0.74) * (1 + 0.1 * Math.sin(Math.PI * Math.min(1, u / 0.62))); };
  // the envelope breathes in a helical wave: at any height the two sides are out of phase
  const env = (t, phi) => e0(t) * (1 + 0.12 * Math.sin(TAU * 3.4 * t + phi + ph0));
  const bow = t => Math.sin(Math.PI * Math.pow(SN.clamp(t, 0, 1), 0.85));
  const axis = t => [x + lean[0] * bow(t) + 0.12 * R0 * Math.sin(t * 6.1 + ph0), y0 + t * H, z + lean[1] * bow(t) + 0.1 * R0 * Math.cos(t * 5.3 + ph0)];
  const phase = r() * TAU;
  const sway = p => { const t = SN.clamp((p[1] - y0) / H, 0, 1.2); return [swayAmp * t * t, phase + t * 0.9]; };
  // vertex colours are tints over the painted stroke texture (which carries the real colours)
  const cGap = [0.2, 0.25, 0.46], cDark = [0.3, 0.33, 0.4], cBody = [0.5, 0.52, 0.48], cMid = [0.74, 0.76, 0.62], cBrown = [0.82, 0.6, 0.42], cLight = [1.15, 1.08, 0.72];
  const tones = [[cDark, 0.22], [cBody, 0.38], [cMid, 0.26], [cBrown, 0.14]];
  const pickTone = () => { let q = r(); for (const [c, w] of tones) if ((q -= w) <= 0) return c; return cBody; };
  const parts = [], info = { x, z, y0, yG, H, R0, e0, env, axis, knees: [] };
  // tongue colour: dark ultramarine where it tucks under its neighbours (root, inner face), its
  // own tone along the belly, an occasional pale highlight licking up toward the tip
  const tongueCol = (tone, tipLight) => (u, c) => {
    const face = 0.5 + 0.5 * c, rise = SN.smoothstep(0, 0.35, u);
    let cc = linMix(cGap, tone, SN.clamp(0.18 + 0.82 * face * rise, 0, 1));
    if (tipLight) cc = linMix(cc, cLight, 0.32 * SN.smoothstep(0.45, 1, u) * face);
    return cc;
  };
  const blade = T => {
    const spine = [], emid = e0(T.t0 + T.len * 0.4);
    for (let k = 0; k < K; k++) {
      const tip = SN.smoothstep(0.4, 1, k / (K - 1)), tau = k / (K - 1), t = T.t0 + T.len * tau, ax = axis(t), ph = T.phi + T.tw * tau + T.flick * tip * tip * tip, e = env(t, ph);
      const rs = e * (T.rin + (T.reach - T.rin) * SN.smoothstep(0, 0.5, tau)) + emid * (T.curl * tip * tip - T.back * SN.smoothstep(0.8, 1, tau));
      const shape = tau < 0.26 ? SN.lerp(0.7, 1, tau / 0.26) : Math.pow(Math.max(0, 1 - (tau - 0.26) / 0.74), 0.78);
      const a = Math.max(0.004, emid * T.fat * shape), ox = Math.cos(ph), oz = Math.sin(ph);
      spine.push({ p: [ax[0] + ox * rs, ax[1], ax[2] + oz * rs], a, b: a * T.wide, out: [ox, oz] });
    }
    return sweep(spine, M, { sway, vScale: 0.2, col: tongueCol(T.tone, T.tipLight) });
  };
  // core spindle: dark, fills between the tongues, ends inside the flames
  const core = [];
  for (let k = 0; k <= coreK; k++) { const t = -0.03 + (k / coreK) * (bodyTop + 0.16), e = e0(t) * 0.58 * (1 - 0.8 * SN.smoothstep(bodyTop, bodyTop + 0.16, t)); core.push({ p: axis(t), a: e, b: e, out: [1, 0] }); }
  parts.push(sweep(core, coreM, { col: () => linMix(cGap, cDark, 0.4), sway, vScale: 0.3 }));
  // body tongues on a twisted helix; none where a knee's seat needs headroom
  const angd = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const rows = Math.ceil((bodyTop + 0.06) / rowStep);
  for (let j = 0; j < rows; j++) for (let c = 0; c < cols; c++) {
    const t0 = -0.06 + (j + c / cols) * rowStep + r.range(-0.1, 0.1) * rowStep;
    if (t0 > bodyTop - 0.02) continue;
    const low = 1 - SN.smoothstep(0.0, 0.08, t0); // the lowest row hugs the flared foot
    const T = { t0, len: rowStep * r.range(1.35, 1.6) * (1 + 0.25 * low), phi: (c / cols) * TAU + j * 0.47 + r.range(-0.16, 0.16), tw: r.range(-0.25, 0.25), flick: r.sign() * r.range(0.15, 0.4),
      fat: r.range(0.27, 0.34), wide: r.range(1.2, 1.5), rin: 0.46, reach: r.range(0.88, 1.0), curl: r.range(0.26, 0.46) * (1 - 0.6 * low), back: 0, tone: pickTone(), tipLight: r() < 0.32 };
    if (knees.some(kn => angd(T.phi + T.tw * 0.5, kn.phi) < 0.62 && T.t0 + T.len * 0.25 < kn.t + 0.075 && T.t0 + T.len > kn.t - 0.005)) continue;
    parts.push(blade(T));
  }
  // flames at the top: separate tapering tongues of unequal height, sky between their tips
  for (const F of flames) {
    const spine = [], e1 = e0(F.t0), n = K + 4;
    for (let k = 0; k < n; k++) {
      const tau = k / (n - 1), t = SN.lerp(F.t0, F.t1, tau), ax = axis(Math.min(t, 1));
      const off = e1 * (F.off0 + (F.off1 - F.off0) * Math.sin(Math.PI * 0.5 * Math.min(1, tau / 0.75)) - F.back * SN.smoothstep(0.7, 1, tau));
      const side = F.s * e1 * Math.sin(Math.PI * tau * 1.3);
      const shape = tau < 0.18 ? SN.lerp(0.8, 1, tau / 0.18) : Math.pow(Math.max(0, 1 - (tau - 0.18) / 0.82), 0.85);
      const a = Math.max(0.004, e1 * F.fat * shape * (1 + 0.16 * Math.sin(tau * TAU * 2.6 + F.t0 * 40)));
      spine.push({ p: [ax[0] + F.dir[0] * off - F.dir[1] * side, ax[1], ax[2] + F.dir[1] * off + F.dir[0] * side], a, b: a * F.wide, out: F.dir });
    }
    parts.push(sweep(spine, M, { sway, vScale: 0.2, col: tongueCol(F.tone || cBody, true) }));
  }
  // knees: an upturned tongue fused into the body — it juts out almost level (the seat), then its
  // tip twists sideways and licks up past the seat
  for (const kn of knees) {
    const e = env(kn.t, kn.phi), sz = kn.size || 0.45, spine = [], rf0 = kn.out || 1;
    // [radial reach (x envelope), height offset (x H), turn toward the cat's tail (rad), thickness]
    const pts = [[0.35, -0.045, 0, 0.85], [0.66, -0.02, 0, 1], [0.95, -0.006, 0, 1.05], [1.16, 0, 0, 1], [1.3, 0.002, 0.08, 0.9], [1.38, 0.012, 0.24, 0.74], [1.37, 0.032, 0.36, 0.57], [1.31, 0.056, 0.45, 0.4], [1.22, 0.08, 0.51, 0.22], [1.13, 0.104, 0.54, 0.01]];
    for (const [rf, dt, dph, th] of pts) {
      const t = kn.t + dt, ax = axis(t), ph = kn.phi - dph * (kn.twist ?? 1), ox = Math.cos(ph), oz = Math.sin(ph), rs = e * rf * rf0;
      // `a` stays vertical along the jutting part, then turns radial as the tip climbs the body
      spine.push({ p: [ax[0] + ox * rs, ax[1], ax[2] + oz * rs], a: sz * th, b: sz * th * 1.7, out: [ox, oz], ref: [ox * 0.4, 1, oz * 0.4] });
    }
    const kg = sweep(spine, M, { sway, vScale: 0.2, col: (u, c) => tongueCol(cBody, false)(0.3 + u * 0.7, c) });
    parts.push(kg);
    const ax = axis(kn.t), ox = Math.cos(kn.phi), oz = Math.sin(kn.phi);
    info.knees.push({ ...kn, geo: kg, ox, oz, x: ax[0] + ox * e * 1.2 * rf0, z: ax[2] + oz * e * 1.2 * rf0, y: ax[1] });
  }
  // the foot follows the slope: the lowest few metres are dropped (or lifted) by the local ground's
  // offset from the centre, so the downhill side meets the ground instead of hovering over it
  for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), w = 1 - SN.smoothstep(0, 3.2, y - y0);
      if (w > 0) p.setY(i, y + (W.heightAt(p.getX(i), p.getZ(i)) - yG) * w);
    }
  }
  info.parts = parts;
  return info;
}

// keep Venus's halo (plus a dark gap and the sway) clear of the hero as seen from the painter's
// viewpoint. In that band of pitch, the flame's right-hand side is squeezed toward its own axis
// (about the eye's vertical axis), just enough that its right edge clears the halo disc; the
// squeeze varies smoothly with pitch, so its tongues keep their licks, only narrower.
const VENUS_CLEAR = 7.4; // degrees: halo 5.6 + dark gap 0.9 + sway/outline 0.9
function clearVenus(geos, info) {
  const E = L.start, ex = E.x, ez = E.z, ey = W.heightAt(ex, ez) + (SN.player?.eye ?? 1.65);
  const vy = L.venus.yaw, vp = L.venus.pitch, cp = Math.cos(vp), TH = VENUS_CLEAR * SN.deg, deg = SN.deg;
  const B0 = -TH - 3 * deg, BS = 0.25 * deg, NB = Math.ceil((2 * TH + 6 * deg) / BS);
  const ang = (x, y, z) => { const dx = x - ex, dz = z - ez, hd = Math.hypot(dx, dz); return [(Math.atan2(-dx, -dz) - vy) * cp, Math.atan2(y - ey, hd) - vp, hd]; };
  const pivot = y => { const a = info.axis(SN.clamp((y - info.y0) / info.H, 0, 1)); return ang(a[0], y, a[2])[0]; };
  const need = b => (Math.abs(b) < TH ? Math.sqrt(TH * TH - b * b) : 0);
  // pass 1: per pitch bin, the squeeze each vertex right of the axis needs
  const sq = new Float32Array(NB).fill(1);
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [a, b] = ang(p.getX(i), p.getY(i), p.getZ(i)), k = Math.floor((b - B0) / BS);
      if (k < 0 || k >= NB) continue;
      const ap = pivot(p.getY(i)), am = need(b);
      if (a < am && ap > a) sq[k] = Math.min(sq[k], SN.clamp((ap - am) / (ap - a), 0.05, 1));
    }
  }
  // spread each bin's squeeze to its neighbours (min over +-1 deg, then a smooth blur)
  const w = Math.round(1 * deg / BS), m1 = sq.map((_, k) => { let v = 1; for (let j = -w; j <= w; j++) v = Math.min(v, sq[SN.clamp(k + j, 0, NB - 1)]); return v; });
  const sm = m1.map((_, k) => { let s = 0, n = 0; for (let j = -w; j <= w; j++) { s += m1[SN.clamp(k + j, 0, NB - 1)]; n++; } return Math.min(s / n, m1[k] + 0.04); });
  const sAt = b => { const f = (b - B0) / BS - 0.5, k = Math.floor(f), u = f - k; if (k < 0 || k >= NB - 1) return 1; return Math.min(sq[k], sq[k + 1], SN.lerp(sm[k], sm[k + 1], u) ); };
  // pass 2: squeeze
  let moved = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), [a, b, hd] = ang(x, y, z), s = sAt(b);
      if (s >= 1) continue;
      const ap = pivot(y);
      if (a >= ap) continue;
      const a2 = ap - (ap - a) * s, ny = vy + a2 / cp;
      p.setX(i, ex - Math.sin(ny) * hd); p.setZ(i, ez - Math.cos(ny) * hd); moved++;
    }
    p.needsUpdate = true;
  }
  return moved;
}

// colliders sized from the geometry: the XZ reach of everything between the ankles and a jumping
// eye, per sector around its centroid, as a ring of circles through the centroid
function fitColliders(geos, sectors, tag) {
  const pts = [];
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = y - W.heightAt(x, z); if (h > 0.15 && h < 2.7) pts.push(x, z); }
  }
  if (!pts.length) return null;
  let cx = 0, cz = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; } cx /= pts.length / 2; cz /= pts.length / 2;
  const reach = new Float32Array(sectors);
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i] - cx, dz = pts[i + 1] - cz, s = Math.floor(((Math.atan2(dz, dx) + TAU) % TAU) / TAU * sectors) % sectors;
    reach[s] = Math.max(reach[s], Math.hypot(dx, dz));
  }
  // the eye (player radius 0.35) stays >= ~0.23 m outside the surface (near plane 0.1, outline hull)
  const out = [];
  for (let s = 0; s < sectors; s++) {
    const rr = Math.max(reach[s], reach[(s + 1) % sectors] * 0.9, reach[(s + sectors - 1) % sectors] * 0.9) - 0.12;
    if (rr <= 0.1) continue;
    const a = ((s + 0.5) / sectors) * TAU;
    out.push(W.addCircle({ x: cx + Math.cos(a) * rr * 0.5, z: cz + Math.sin(a) * rr * 0.5, r: rr * 0.5, tag }));
  }
  return { cx, cz, reach: Array.from(reach, v => +v.toFixed(2)), circles: out.length };
}

function buildCypresses() {
  const cyp = L.cypress;
  // the hero: 30 m, its middle bowed left (from the painter's view) so Venus shines clear of it;
  // knees toward the road (low) and the valley road below the village (high)
  const hero = cypressParts({
    x: cyp.x, z: cyp.z, H: cyp.height, R0: 2.5, seed: 'landscape-cypress-hero', lean: [-1.9, 0.55], swayAmp: 0.55, cols: 6, rowStep: 0.1, bodyTop: 0.7, M: 12, K: 16,
    flames: [
      { t0: 0.48, t1: 1.0, dir: [0.5, -0.87], off0: 0.1, off1: 0.15, back: 0.1, s: 0.18, fat: 0.7, wide: 1.2 },     // the tall main flame
      { t0: 0.5, t1: 0.82, dir: [-0.87, 0.5], off0: 0.35, off1: 1.5, back: 0.3, s: -0.15, fat: 0.5, wide: 1.3 },    // the shorter one on its left
      { t0: 0.5, t1: 0.72, dir: [0.2, -0.98], off0: 0.4, off1: 1.25, back: 0.25, s: 0.25, fat: 0.4, wide: 1.4 },    // a small one at the back
    ],
    knees: [
      { id: 'low', t: 0.095, phi: Math.atan2(0.52, 0.85), size: 0.44 },
      { id: 'high', t: 0.235, phi: Math.atan2(-0.97, 0.24), size: 0.4 },
    ],
  });
  hero.venusMoved = clearVenus(hero.parts, hero);
  const smallSpots = [[78, 37, 14], [115, -4, 12], [-71, 88, 13], [38, 107, 11], [-113, -38, 15]];
  const smalls = smallSpots.map(([x, z, h], i) => cypressParts({
    x, z, H: h, R0: h * 0.085, seed: 'landscape-cypress-' + i, lean: [Math.sin(i * 2.1) * 0.5, Math.cos(i * 1.3) * 0.4], M: 8, K: 11, swayAmp: 0.22, cols: 5, rowStep: 0.16, bodyTop: 0.58, flare: 0.2,
    flames: [
      { t0: 0.5, t1: 1.0, dir: [Math.cos(i * 2.3), Math.sin(i * 2.3)], off0: 0.1, off1: 0.12, back: 0.1, s: 0.15, fat: 0.6, wide: 1.25 },
      { t0: 0.52, t1: 0.78, dir: [Math.cos(i * 2.3 + 2.4), Math.sin(i * 2.3 + 2.4)], off0: 0.3, off1: 0.9, back: 0.25, s: -0.1, fat: 0.44, wide: 1.4 },
    ],
  }));
  const geo = mergeSame([...hero.parts, ...smalls.flatMap(s => s.parts)]);
  geo.computeBoundingSphere();
  const tex = strokeTex({
    w: 256, h: 512, base: '#101810', seed: 'landscape-cypress-tex', count: 900,
    colors: [['#1d2b1a', 3], ['#2f4526', 4], ['#476236', 3], ['#5a4a2c', 2], ['#7c8a45', 0.8], ['#1f3355', 1.8], ['#a39a4e', 0.2]],
    len: [70, 170], width: [9, 18], angle: (u, v) => Math.PI / 2 + 0.3 * Math.sin(v * TAU * 2 + u * TAU), jitter: 0.2, curve: 0.5, alpha: [0.8, 1], light: 0.08, bristles: 3,
  }, 'landscape-cypress');
  const mat = patchMaterial(SN.mat.paint({ map: tex, vertexColors: true, name: 'landscape-cypress' }), { sway: true, rim: 0.8, rimColor: '#0c1a3c', rimEdge: [0.34, 0.04], selfLit: 0.45, key: 'landscape-cypress' });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'landscape-cypresses';
  const hullMat = patchMaterial(SN.mat.unlit({ color: P.outline, side: THREE.BackSide, name: 'landscape-cypress-hull' }), { sway: true, hull: 0.04, key: 'landscape-cypress-hull' });
  const hull = new THREE.Mesh(geo, hullMat); hull.name = 'landscape-cypress-hull';
  SN.scene.add(mesh, hull);
  // colliders fitted to the flame's reach at eye height (the camera never ends up inside a tongue)
  hero.collider = fitColliders(hero.parts, 16, 'cypress');
  for (const s of smalls) s.collider = fitColliders(s.parts, 8, 'cypress');
  return { hero: mesh, hull, heroInfo: hero, smalls, mesh, mat };
}
// rows and pairs of lesser cypresses: windbreaks along the field edges, pairs by the road and the
// gate, clusters at the village edge and on the crests, and rows up on the rim. Cheaper tongues
// than the hero's, no outline hull; the ones the player can reach get fitted colliders.
function buildCypressRows(cyp, props) {
  const r = SN.rng('landscape-cypress-rows'), H = W.heightAt, OCC = props.OCC, guard = props.guard, gate = props.spots.gate;
  const nx = gate ? -roadAt(gate.s).tz : 0, nz = gate ? roadAt(gate.s).tx : 0, gq = gate ? Math.hypot(gate.x, gate.z) : 1;
  const walk = [
    [-44, -57, 11.5], [-40, -61.5, 13], [-48.5, -62, 10],             // behind the village, left of the church (seen over the roofs)
    [48, -54, 12], [52.5, -50, 10],                                   // behind the village, right
    [77, -20, 10], [85, -23.5, 11], [93, -27, 10.5], [101, -30, 11.5], // windbreak along the east field's upper edge
    [-61, -106, 11], [-56.5, -109.5, 9.5],                            // on the back crest, west
    [-104, -18, 11], [-100, -24, 9],                                  // above the west grove
    [66, 60, 10], [-66, 62, 10.5],                                    // flanks of the painter's hill
  ];
  const rp = [roadAt(50, 5.6), roadAt(50, -5.6), roadAt(72, -6.2)];
  for (const p of rp) walk.push([p.x, p.z, r.range(9.5, 11.5)]);
  const rim = [];
  if (gate) for (const sd of [-1, 1]) rim.push([gate.x + nx * 4.4 * sd + (gate.x / gq) * 3.2, gate.z + nz * 4.4 * sd + (gate.z / gq) * 3.2, r.range(11, 13)]);
  for (const [az, rr, n] of [[76, 134, 6], [196, 138, 5], [292, 136, 6]]) { // rows on the rim (compass degrees)
    const a0 = az * SN.deg;
    for (let k = 0; k < n; k++) { const a = a0 + (k * 5.2) / rr + r.range(-0.004, 0.004), q = rr + r.range(-0.8, 0.8); rim.push([Math.sin(a) * q, -Math.cos(a) * q, r.range(9, 12.5)]); }
  }
  const made = [], parts = [];
  const make = ([x, z, h], lite, i) => {
    if (!OCC.free(x, z, h * 0.12 + 0.6) || roadNear(x, z) < 3.2 || inWheat(props.fields, x, z)) return;
    if (!guard.ok(x, z, H(x, z) + h)) return;
    const c = cypressParts({ x, z, H: h, R0: h * 0.085, seed: 'landscape-cypress-row-' + i, lean: [r.range(-0.4, 0.4), r.range(-0.35, 0.35)], M: lite ? 4 : 5, K: lite ? 6 : 7, coreK: lite ? 8 : 10, coreM: lite ? 5 : 6,
      swayAmp: 0.2, cols: lite ? 3 : 4, rowStep: lite ? 0.26 : 0.21, bodyTop: 0.57, flare: 0.18,
      flames: [{ t0: 0.5, t1: 1.0, dir: [Math.cos(i * 2.3), Math.sin(i * 2.3)], off0: 0.1, off1: 0.12, back: 0.1, s: 0.15, fat: 0.62, wide: 1.25 },
        ...(lite ? [] : [{ t0: 0.53, t1: 0.8, dir: [Math.cos(i * 2.3 + 2.4), Math.sin(i * 2.3 + 2.4)], off0: 0.3, off1: 0.9, back: 0.25, s: -0.1, fat: 0.44, wide: 1.4 }])] });
    OCC.add(x, z, h * 0.12 + 0.4); parts.push(...c.parts); c.rim = lite; made.push(c);
  };
  walk.forEach((p, i) => make(p, false, i));
  rim.forEach((p, i) => make(p, true, 100 + i));
  const geo = mergeSame(parts); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, cyp.mat); mesh.name = 'landscape-cypress-rows';
  SN.scene.add(mesh);
  for (const c of made) if (!c.rim) c.collider = fitColliders(c.parts, 8, 'cypress');
  return { mesh, list: made };
}

// ---------------------------------------------------------------- the Alpilles
// Layered ranges beyond the terrain rim, built as sloping bands around the origin: each band is a
// crest profile of rolling waves with a lighter blue brushed contour line along its top edge and a
// body that darkens downward. Unlit and fog-free: their colour is painted per band (near = darker,
// far = a little lighter and bluer), as in the painting. Azimuth uses the core yaw convention.
function buildAlpilles() {
  const r = SN.rng('landscape-alpilles');
  const dirOf = psi => [-Math.sin(psi), -Math.cos(psi)];
  const edgeH = psi => { const [dx, dz] = dirOf(psi); let m = -1e9; for (const rr of [250, 270, 290]) m = Math.max(m, W.heightAt(dx * rr, dz * rr)); return m; };
  const wave = (psi, seed, amp) => amp * (Math.sin(psi * 3 + seed) * 0.45 + Math.sin(psi * 7.3 + seed * 2.1) * 0.3 + Math.sin(psi * 13.1 + seed * 0.7) * 0.15 + SN.noise2(psi * 2.2, seed) * 0.35);
  const deg = SN.deg;
  // painting-view shaping: the big rounded Alpille to the right of the village (seen from the start)
  const hump = (psi, c, w, h) => h * Math.exp(-((psi - c) * (psi - c)) / (2 * w * w));
  const bands = [
    { // A: hugging the terrain rim, all the way round
      R: psi => 292 + 10 * Math.sin(psi * 4 + 1), depth: 34, psi0: -Math.PI, psi1: Math.PI,
      crest: psi => edgeH(psi) + 9 + Math.abs(wave(psi, 1.3, 14)) + hump(psi, -30 * deg, 14 * deg, 10),
      base: psi => edgeH(psi) - 30, top: '#1c3a6c', low: '#0f2450', line: '#4f86cf',
    },
    { // B: the main range, all round, higher behind the village
      R: psi => 385 + 20 * Math.sin(psi * 3 + 2), depth: 60, psi0: -Math.PI, psi1: Math.PI,
      crest: psi => 92 + wave(psi, 4.1, 26) + 18 * Math.cos(psi) + hump(psi, -38 * deg, 16 * deg, 26),
      base: () => 20, top: '#22457e', low: '#142e62', line: '#5b93d8',
    },
    { // C: the far Alpilles behind the village
      R: psi => 505 + 25 * Math.sin(psi * 2.3), depth: 80, psi0: -115 * deg, psi1: 115 * deg,
      crest: psi => 128 + wave(psi, 7.7, 34) + hump(psi, -40 * deg, 20 * deg, 38) + hump(psi, 12 * deg, 12 * deg, 16) - 30 * SN.smoothstep(60 * deg, 115 * deg, Math.abs(psi)),
      base: () => 30, top: '#2a5190', low: '#1b3a74', line: '#6ca2de',
    },
  ];
  const pos = [], col = [], uv = [], index = [];
  const cols = b => ({ top: lin(b.top), low: lin(b.low), line: lin(b.line) });
  for (const b of bands) {
    const C = cols(b), step = 0.6 * deg, n = Math.ceil((b.psi1 - b.psi0) / step);
    const rows = [0, 1, 0.08, 0.2, 0.42, 0.7, 1.0]; // row 0 = crest, 1 = bottom of the contour line, then body fractions
    const start = pos.length / 3; let arc = 0;
    for (let i = 0; i <= n; i++) {
      const psi = b.psi0 + (i / n) * (b.psi1 - b.psi0), [dx, dz] = dirOf(psi), R = b.R(psi), cy = b.crest(psi), by = b.base(psi);
      const lw = R * (0.0022 + 0.0042 * Math.max(0, 0.35 + SN.noise2(psi * 7, R * 0.01))); // brushed contour line: thick and thin
      if (i) arc += R * step;
      for (let k = 0; k < rows.length; k++) {
        let rr, y, c;
        if (k === 0) { rr = R; y = cy; c = C.line; }
        else if (k === 1) { rr = R - 0.4; y = cy - lw; c = linMix(C.line, C.top, 0.25); }
        else { const f = rows[k]; rr = R - b.depth * f; y = SN.lerp(cy - lw * 1.2, by, Math.pow(f, 0.85)); c = linMix(C.top, C.low, Math.pow(f, 0.6)); }
        const jit = 0.92 + 0.16 * r();
        pos.push(dx * rr, y, dz * rr); col.push(c[0] * jit, c[1] * jit, c[2] * jit); uv.push(arc / 55, (cy - y) / 26);
      }
      if (i) for (let k = 0; k < rows.length - 1; k++) {
        const a = start + (i - 1) * rows.length + k, bb = a + 1, c = a + rows.length, d = c + 1;
        index.push(a, c, bb, bb, c, d);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index); geo.computeBoundingSphere();
  const tex = strokeTex({
    w: 512, h: 256, base: '#d0d0d0', seed: 'landscape-alpilles-tex', count: 1400,
    colors: [['#b8bcc8', 3], ['#eceef4', 2], ['#98a0b4', 2], ['#ffffff', 0.8], ['#b8c8c0', 0.8]],
    len: [40, 110], width: [5, 11], angle: 0, jitter: 0.22, curve: 0.3, alpha: [0.8, 1], light: 0.05, bristles: 3,
  }, 'landscape-alpilles');
  tex.colorSpace = THREE.NoColorSpace;
  const mat = SN.mat.unlit({ map: tex, vertexColors: true, fog: false, side: THREE.DoubleSide });
  mat.name = 'landscape-alpilles';
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'landscape-alpilles';
  SN.scene.add(mesh);
  return { mesh, bands };
}

// ---------------------------------------------------------------- blobs (canopy clumps, rocks, bushes)
const BLOB_BASE = {};
function blobBase(ws, hs) {
  const k = ws + 'x' + hs;
  if (!BLOB_BASE[k]) { const g = new THREE.SphereGeometry(1, ws, hs); g.deleteAttribute('normal'); g.deleteAttribute('uv'); BLOB_BASE[k] = mergeVertices(g); }
  return BLOB_BASE[k];
}
// a jittered ellipsoid in world space with smooth normals, planar stroke UVs and per-vertex colour
// (ico: an icosphere of that detail instead of the ws x hs UV sphere: even triangles, no poles;
// soft: a finely tessellated copy of a coarse blob — the jitter is low-passed over `soft` radians,
// so only the big bumps a coarse sphere can show remain, rounded, plus small leafy scallops)
const blobJit = (ux, uy, uz, jitter, freq, seed) => 1 + jitter * (SN.noise2(ux * freq + seed, uy * freq - seed * 0.7) * 0.6 + SN.noise2(uz * freq - seed * 1.3, ux * freq + uy * 0.8) * 0.4);
function blob({ x, y, z, rx, ry, rz, rot = 0, jitter = 0.2, freq = 1.7, seed = 0, ws = 9, hs = 7, ico = null, soft = 0, col, flat = 0, uvScale = 0.55 }) {
  const g = (ico != null ? icoBase(ico) : blobBase(ws, hs)).clone(), p = g.attributes.position, c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
    let d = blobJit(ux, uy, uz, jitter, freq, seed);
    if (soft) { // average over a ring of 6 around the point, then add the scallops
      let t1x = -uz, t1z = ux; const tm = Math.hypot(t1x, t1z); if (tm < 1e-3) { t1x = 1; t1z = 0; } else { t1x /= tm; t1z /= tm; }
      const t2x = uy * t1z, t2y = uz * t1x - ux * t1z, t2z = -uy * t1x; let acc = d;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, ca = Math.cos(a) * soft, sa = Math.sin(a) * soft, qx = ux + t1x * ca + t2x * sa, qy = uy + t2y * sa, qz = uz + t1z * ca + t2z * sa, qm = Math.hypot(qx, qy, qz); acc += blobJit(qx / qm, qy / qm, qz / qm, jitter, freq, seed); }
      d = acc / 7 + jitter * 0.16 * SN.noise2(ux * 5.5 + seed, uz * 5.5 + uy * 4.1 - seed);
    }
    const lx = ux * rx * d, lz = uz * rz * d; let ly = uy * ry * d;
    if (flat && ly < -ry * flat) ly = -ry * flat + (ly + ry * flat) * 0.2;
    p.setXYZ(i, x + c * lx + s * lz, y + ly, z - s * lx + c * lz);
  }
  g.computeVertexNormals();
  SN.geo.projectUV(g, uvScale, seed * 0.13, seed * 0.29);
  const n = g.attributes.normal, cols = new Float32Array(p.count * 3), nv = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    nv.set(n.getX(i), n.getY(i), n.getZ(i));
    const cc = col(nv, p.getY(i) - y, i, p.getX(i), p.getY(i), p.getZ(i));
    cols[i * 3] = cc[0]; cols[i * 3 + 1] = cc[1]; cols[i * 3 + 2] = cc[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
// box piece (fences), world space, yaw rot, slight lean
function piece({ x, y, z, sx, sy, sz, rot = 0, lean = 0, col }) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(0, sy / 2, 0); g.rotateZ(lean); g.rotateY(rot); g.translate(x, y, z);
  SN.geo.projectUV(g, 0.9);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = 0.85 + 0.3 * ((i * 7919) % 13) / 13; a[i * 3] = col[0] * k; a[i * 3 + 1] = col[1] * k; a[i * 3 + 2] = col[2] * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// ---------------------------------------------------------------- splats: brush-dab foliage
// Leaf masses (olives, round trees, hedgerows) are clad in dabs: one instanced quad per dab that
// always faces the eye, turned along a world-space stroke direction projected on screen, textured
// with a bristly stroke and coloured per dab from where it sits on the crown (silver tops,
// blue-green flanks, ultramarine undersides), then lit with its own normal like the lobes under
// it. A dab keeps a floor of ~2 px (a brush of fixed size, so crowns stay painted, not speckled)
// that relaxes to ~1 px far off, where the pale and silver dabs also melt into their crown's own
// colour (`base`), so distant groves read as dark masses; within a few metres dabs shrink and take
// the crown's colour too (clustered dashes, not paper leaves), and right at the eye they fold away.
// Record: x y z | nx ny nz | dx dy dz | len wid | r g b (linear) | atlas cell | sway (m) | base r g b | keep
// (keep = 1: drawn at every quality — dabs that form a dark tree's or a hedge's silhouette)
const SREC = 20, SPLATS = [], SPL_U = { uPx: { value: 0.006 } };
function splatAtlas() {
  // each cell is one dab, stretched over the quad (len x wid): a tapered lens filling the cell's
  // height, bristles running along it and out past its ends
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S * 2;
  const g = cv.getContext('2d'), r = SN.rng('landscape-splat-atlas');
  g.lineCap = 'round';
  for (let c = 0; c < 4; c++) {
    const ox = (c & 1) * S, oy = (c >> 1) * S, cx = ox + S / 2, cy = oy + S / 2;
    const L = S * r.range(0.8, 0.9), half = S * [0.42, 0.36, 0.45, 0.34][c], bend = r.range(-0.12, 0.12) * S;
    g.fillStyle = '#d0d0d0';
    g.beginPath(); g.moveTo(cx - L / 2, cy + bend * 0.2);
    g.quadraticCurveTo(cx - L * 0.1, cy - half * 2 + bend, cx + L / 2, cy - bend * 0.2);
    g.quadraticCurveTo(cx + L * 0.1, cy + half * 2 + bend, cx - L / 2, cy + bend * 0.2);
    g.fill();
    for (let k = 0; k < 11; k++) { // bristles, lighter and darker, some running out past the ends
      const t = (k / 10 - 0.5) * 1.6, y = cy + t * half * 0.85 + bend * 0.5 * (1 - t * t);
      const x0 = cx - (L / 2) * r.range(0.55, 1.08) * (1 - 0.45 * t * t), x1 = cx + (L / 2) * r.range(0.55, 1.1) * (1 - 0.4 * t * t);
      const v = Math.round(r.range(140, 255));
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = r.range(5, 11);
      g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo(cx, y + bend * 0.4, x1, y + r.range(-5, 5)); g.stroke();
    }
  }
  return cv;
}
function buildSplats() {
  const n = SPLATS.length / SREC, binsS = Array.from({ length: NSEC + 4 }, () => []);
  for (let i = 0; i < n; i++) { const o = i * SREC, x = SPLATS[o], z = SPLATS[o + 2]; binsS[Math.hypot(x, z) > 124.5 ? NSEC + sectorOf(x, z, 4) : sectorOf(x, z)].push(o); }
  const quadPos = new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3), quadUv = new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2);
  const tex = SN.paint.texture(splatAtlas(), { key: 'landscape-splats' });
  tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = SN.mat.paint({ map: tex, vertexColors: true, alphaTest: 0.42, name: 'landscape-splats' });
  const rc = new THREE.Color('#0c1a3c');
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, FOG_UNIFORMS, SPL_U, { uTime: SHARED.uTime, uRimColor: { value: rc } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aCenter; attribute vec3 aNormal; attribute vec3 aDir; attribute vec4 aSize; attribute vec3 aBase;
uniform float uTime; uniform float uPx;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
  { float dq = max(0.05, -(modelViewMatrix * vec4(aCenter, 1.0)).z);
    vColor.rgb = mix(vColor.rgb, aBase, max(0.4 * (1.0 - smoothstep(3.0, 9.0, dq)), 0.85 * smoothstep(60.0, 140.0, dq))); }`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  vMapUv = uv * 0.5 + vec2(mod(aSize.w, 2.0), floor(aSize.w * 0.5 + 0.01)) * 0.5;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = aNormal;')
      .replace('#include <project_vertex>', `
  vec3 cc = aCenter;
  cc.x += aSize.z * (sin(uTime * 0.83 + cc.x * 0.37 + cc.z * 0.21) + 0.4 * sin(uTime * 2.1 + cc.y * 1.7));
  cc.z += aSize.z * 0.7 * sin(uTime * 0.61 + cc.z * 0.33 + 1.3);
  vec4 mvPosition = modelViewMatrix * vec4(cc, 1.0);
  vec2 sd = (mat3(modelViewMatrix) * aDir).xy; float sl = length(sd);
  sd = sl > 1e-4 ? sd / sl : vec2(1.0, 0.0);
  float depth = max(0.05, -mvPosition.z);
  float grow = clamp(uPx * mix(1.0, 0.55, smoothstep(60.0, 110.0, depth)) * depth / (projectionMatrix[1][1] * aSize.y), 1.0, 1.7);
  vec2 q = position.xy * aSize.xy * grow * mix(0.42, 1.0, smoothstep(1.2, 5.0, depth)) * smoothstep(0.3, 0.85, depth);
  mvPosition.xy += sd * q.x + vec2(-sd.y, sd.x) * q.y;
  gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\n' + FOG_DECL)
      .replace('#include <fog_fragment>', FOG_GLSL)
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n  diffuseColor.a = 1.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.35;')
      .replace('#include <opaque_fragment>', `{ float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
  outgoingLight = mix(outgoingLight, uRimColor, smoothstep(0.3, 0.02, ndv) * 0.55 * smoothstep(2.5, 9.0, length(vViewPosition))); } // (no ink cards under the eye)
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'landscape-splats-v2';
  const upd = () => { const v = new THREE.Vector2(); SN.renderer.getDrawingBufferSize(v); SPL_U.uPx.value = (2 * 1.8) / Math.max(200, v.y); };
  upd(); SN.on('resize', upd);
  const meshes = [], so = SN.rng('landscape-splat-order');
  binsS.forEach((list, b) => {
    if (!list.length) return;
    // shuffled, so a lower quality can draw a prefix and thin every crown evenly (the silhouette
    // dabs of the dark trees and hedges first: those are always drawn)
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(so() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    list.sort((a, b) => SPLATS[b + 19] - SPLATS[a + 19]);
    const m = list.length, C = new Float32Array(m * 3), N = new Float32Array(m * 3), D = new Float32Array(m * 3), Z = new Float32Array(m * 4), K = new Float32Array(m * 3), KB = new Float32Array(m * 3);
    let nKeep = 0;
    const bs = new THREE.Box3();
    list.forEach((o, i) => {
      const S = SPLATS;
      C.set([S[o], S[o + 1], S[o + 2]], i * 3); N.set([S[o + 3], S[o + 4], S[o + 5]], i * 3); D.set([S[o + 6], S[o + 7], S[o + 8]], i * 3);
      Z.set([S[o + 9], S[o + 10], S[o + 15], S[o + 14]], i * 4); K.set([S[o + 11], S[o + 12], S[o + 13]], i * 3); KB.set([S[o + 16], S[o + 17], S[o + 18]], i * 3);
      if (S[o + 19] > 0) nKeep++;
      bs.expandByPoint(new THREE.Vector3(S[o], S[o + 1], S[o + 2]));
    });
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', quadPos); geo.setAttribute('uv', quadUv); geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(C, 3)); geo.setAttribute('aNormal', new THREE.InstancedBufferAttribute(N, 3));
    geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(D, 3)); geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(Z, 4));
    geo.setAttribute('color', new THREE.InstancedBufferAttribute(K, 3)); geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(KB, 3));
    geo.instanceCount = m;
    geo.boundingSphere = bs.expandByScalar(3).getBoundingSphere(new THREE.Sphere());
    geo.boundingBox = bs.clone();
    const mesh = new THREE.Mesh(geo, mat); mesh.name = `landscape-splats-${b < NSEC ? 'inner-' + b : 'rim-' + (b - NSEC)}`; mesh.userData.noOcclude = true;
    mesh.raycast = () => {}; // camera-facing dabs: nothing to pick (and the base quad would lie at the origin)
    mesh.userData.nKeep = nKeep;
    meshes.push(mesh);
  });
  SN.scene.add(...meshes);
  const setQ = q => { for (const m of meshes) { const k = m.userData.nKeep; m.geometry.instanceCount = k + Math.round((m.userData.n - k) * (q === 'low' ? 0.55 : q === 'medium' ? 0.8 : 1)); } };
  for (const m of meshes) m.userData.n = m.geometry.instanceCount;
  setQ(SN.quality); SN.on('quality', setQ);
  return { meshes, count: n };
}

// ---------------------------------------------------------------- props: olives, trees, hedges, rocks, hay, walls
// Everything solid and small is merged into vertex-coloured meshes with a shared luminance stroke
// texture, the painted rim outline and a little self-light: one mesh per 45-degree sector of the
// map, so the sectors behind the camera are culled. The rim beyond the walk radius has sectors of
// its own, flagged noOcclude (nothing out there can come between the player and a cat). Leaf
// masses are clad in brush-dab splats (buildSplats). `spots` collects exact positions (cat seats).
const NSEC = 8, TRI = { kind: '' }, SPLN = {}; // TRI / SPLN: triangle and dab tallies per kind of prop (test builds only)
const tallyDabs = (n0, rim) => { if (SN.params.test) { const k = TRI.kind + (rim ? '-rim' : ''); SPLN[k] = (SPLN[k] || 0) + (SPLATS.length / SREC - n0); } };
const sectorOf = (x, z, n = NSEC) => Math.floor(((Math.atan2(z, x) / TAU + 1) % 1) * n) % n;
function bins(nIn = NSEC, nRim = 4) { // sectors for the walkable ring and for the rim beyond it
  const b = { inner: Array.from({ length: nIn }, () => []), rim: Array.from({ length: nRim }, () => []) };
  b.put = (g, rim, at) => { // at: [x, z] when the caller knows where the part stands
    let cx, cz; if (at) [cx, cz] = at; else { g.computeBoundingSphere(); ({ x: cx, z: cz } = g.boundingSphere.center); }
    const isRim = rim ?? Math.hypot(cx, cz) > 124.5;
    if (SN.params.test) { const k = TRI.kind + (isRim ? '-rim' : ''); TRI[k] = (TRI[k] || 0) + (g.index ? g.index.count : g.attributes.position.count) / 3; }
    const list = isRim ? b.rim : b.inner; list[sectorOf(cx, cz, list.length)].push(g);
    return g;
  };
  b.meshes = (mat, name) => {
    const out = [];
    for (const ring of ['inner', 'rim']) b[ring].forEach((list, s) => {
      if (!list.length) return;
      const geo = mergeSame(list); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.name = `${name}-${ring}-${s}`;
      if (ring === 'rim') m.userData.noOcclude = true;
      out.push(m);
    });
    return out;
  };
  return b;
}
// the painter's view: tall things must stay under the skyline of the hills (so the Alpilles'
// crest lines and the lowest stars stay clear), dark masses keep out of the spire's column, and
// nothing tall stands in the foreground between the painter and the village
function startGuard() {
  const E = L.start, H = W.heightAt, ey = H(E.x, E.z) + 1.65, sky = [];
  for (let a = -70; a <= 70; a += 1) {
    const yaw = a * SN.deg, dx = -Math.sin(yaw), dz = -Math.cos(yaw); let m = -1;
    for (let d = 30; d < 290; d += 3) m = Math.max(m, (H(E.x + dx * d, E.z + dz * d) - ey) / d);
    sky.push(Math.atan(m));
  }
  const ch = L.church, spireAz = Math.atan2(-(ch.x - E.x), -(ch.z - E.z)), spireD = Math.hypot(ch.x - E.x, ch.z - E.z);
  return {
    // true if a thing of height `top` (world y) at (x,z) keeps the painting view intact
    ok(x, z, top, dark = true) {
      const dx = x - E.x, dz = z - E.z, d = Math.hypot(dx, dz), az = Math.atan2(-dx, -dz), ad = az / SN.deg;
      if (Math.abs(ad) > 58) return true;
      if (top - H(x, z) > 1.6 && (d < 60 || (d < 92 && ad < 17))) return false; // the foreground in front of the village stays open
      const k = SN.clamp(Math.round(ad) + 70, 0, sky.length - 1);
      if (Math.atan2(top - ey, d) > sky[k] - 0.7 * SN.deg) return false;       // under the skyline
      if (dark && d > spireD - 12 && Math.abs(az - spireAz) < 3.4 * SN.deg) return false; // the spire's column
      return true;
    },
    sky, spireAz,
  };
}
// a coarse occupancy grid of circles, so new plantings keep clear of each other and of the props
function occupancy() {
  const C = 6, g = new Map(), key = (i, j) => i + ',' + j;
  return {
    free(x, z, r) {
      for (let i = Math.floor((x - r - 4) / C); i <= Math.floor((x + r + 4) / C); i++) for (let j = Math.floor((z - r - 4) / C); j <= Math.floor((z + r + 4) / C); j++)
        for (const c of g.get(key(i, j)) || []) if (Math.hypot(c[0] - x, c[1] - z) < c[2] + r) return false;
      return true;
    },
    add(x, z, r) { const c = [x, z, r]; for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) { const k = key(i, j); if (!g.has(k)) g.set(k, []); g.get(k).push(c); } },
  };
}

function buildProps(fields, cyp) {
  const r = SN.rng('landscape-props'), B = bins(), WB = bins(4, 1), spots = {}, trees = [], put = g => B.put(g);
  const H = W.heightAt, OCC = occupancy(), guard = startGuard();
  OCC.add(L.cypress.x, L.cypress.z, 5); for (const c of cyp.smalls) OCC.add(c.x, c.z, c.R0 * 1.3 + 0.6);
  const wheatAt = (x, z) => inWheat(fields, x, z);
  const clear = (x, z, o = {}) => {
    const rr = Math.hypot(x, z);
    if (rr < (o.rmin ?? 46) || rr > (o.rmax ?? 119)) return false;
    if (roadNear(x, z) < (o.road ?? 4.5)) return false;
    if (o.path !== false && pathNear(x, z) < (o.pathR ?? 2.2)) return false;
    if (o.field !== false && wheatAt(x, z)) return false;
    if (o.grove !== false && fields.groves.some(g => inGrove(g, x, z, 3) < 1)) return false;
    if (Math.hypot(x - L.cypress.x, z - L.cypress.z) < (o.cyp ?? 6)) return false;
    if (o.r && !OCC.free(x, z, o.r)) return false;
    return true;
  };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();

  // ---- leaf masses (olives, round trees): clumps + splats, built once as prototypes in local space
  // (trunk base at the origin); a tree is a rotated, scaled copy of one. Leaf parts go to the leaf
  // materials: far into sector bins (LB), lo and hi into their LOD cells (LC, HC), near on demand;
  // `hue` parts (dark trees, bushes, hedges) are lit per placed tree with the village's light
  // multipliers, `lum` parts (olive crowns) carry their own colour over a luminance stroke texture.
  const LB = { hue: bins(), lum: bins() }, LC = new Map(), HC = new Map();
  const cellPut = (map, size, level, kind, g, x, z) => {
    const i = Math.floor((x + 200) / size), j = Math.floor((z + 200) / size), k = i * 1000 + j;
    let c = map.get(k); if (!c) map.set(k, (c = { x0: i * size - 200, z0: j * size - 200, size, hue: [], lum: [] }));
    c[kind].push(g);
    if (SN.params.test) { const tk = TRI.kind + '-' + level; TRI[tk] = (TRI[tk] || 0) + g.index.count / 3; }
  };
  const hiPut = (kind, g, x, z) => cellPut(HC, LOD.CELL, 'hi', kind, g, x, z), loPut = (kind, g, x, z) => cellPut(LC, LOD.LCELL, 'lo', kind, g, x, z);
  // trees that can get a near crown: a build() for their finest level, run on demand (the near pool at the end)
  const NEARS = [];
  const tinted = (a, t) => { const c = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { c[i] = a[i] * t[0]; c[i + 1] = a[i + 1] * t[1]; c[i + 2] = a[i + 2] * t[2]; } return c; };
  // merge a prototype's leaf parts (same attributes) with their per-vertex light data
  const protoPart = parts => {
    const g = mergeSame(parts.map(q => q.g)), cat = k => { if (!parts[0][k]) return null; const a = new Float32Array(parts.reduce((n, q) => n + q[k].length, 0)); let o = 0; for (const q of parts) { a.set(q[k], o); o += q[k].length; } return a; };
    return { g, v0: cat('v0'), env: cat('env') };
  };
  // splats on the lobes' outer surface (none buried inside a neighbour); record: see SREC. `colour`
  // returns [r, g, b, base r, g, b]; o.under adds that fraction of extra dabs cladding the undersides
  // (drawn from their own rng, so the upper dabs stay exactly where they were)
  function lobeSplats(pr, P, perArea, size, colour, dirOf, swayK = 1, o = {}) {
    const { hosts = P.lobes, kk = [0.98, 1.16], keep = 0, under = 0, underRng = null } = o;
    const one = (rr, lb, dy, c, s) => {
      const ph = rr() * TAU, rho = Math.sqrt(Math.max(0, 1 - dy * dy));
      // (on a jittered blob, relative to its real surface there, so no dab hides inside a bulge)
      const ux = rho * Math.cos(ph), uz = rho * Math.sin(ph), kq = rr.range(kk[0], kk[1]) * (lb.seed != null ? 0.92 * blobJit(ux, dy, uz, 0.36, 2.4, lb.seed) : 1);
      const lx = ux * lb.rx * kq, ly = dy * lb.ry * kq, lz = uz * lb.rz * kq;
      const x = lb.x + c * lx + s * lz, y = lb.y + ly, z = lb.z - s * lx + c * lz;
      if (P.lobes.some(q => q !== lb && ((x - q.x) / q.rx) ** 2 + ((y - q.y) / q.ry) ** 2 + ((z - q.z) / q.rz) ** 2 < 0.72)) return false;
      let nx = ux / lb.rx, ny = dy / lb.ry, nz = uz / lb.rz; const nm = Math.hypot(nx, ny, nz); nx /= nm; ny /= nm; nz /= nm;
      const wx = c * nx + s * nz, wz = -s * nx + c * nz;
      const [dx, ddy, dz] = dirOf(wx, ny, wz, rr), col = colour(ny, rr, y);
      P.splats.push(x, y, z, wx, ny, wz, dx, ddy, dz, rr.range(size[0], size[1]), rr.range(size[2], size[3]), col[0], col[1], col[2], rr.int(0, 3), (0.025 + 0.012 * y) * swayK, col[3], col[4], col[5], keep);
      return true;
    };
    for (const lb of hosts) {
      const n = Math.round(perArea * lb.rx * lb.rz), c = Math.cos(lb.rot || 0), s = Math.sin(lb.rot || 0);
      for (let k = 0, tries = 0; k < n && tries < n * 3; tries++) if (one(pr, lb, SN.lerp(-0.55, 1, Math.pow(pr(), 0.75)), c, s)) k++;
    }
    if (under && underRng) for (const lb of hosts) {
      const n = Math.round(perArea * lb.rx * lb.rz * under), c = Math.cos(lb.rot || 0), s = Math.sin(lb.rot || 0);
      for (let k = 0, tries = 0; k < n && tries < n * 3; tries++) if (one(underRng, lb, underRng.range(-0.95, -0.5), c, s)) k++;
    }
  }
  // stroke direction helpers: along the crown's surface, turned by a random angle about the normal
  const tangentDir = (spread, lift = 0) => (nx, ny, nz, pr) => {
    let tx = -nz, tz = nx; const tm = Math.hypot(tx, tz) || 1; tx /= tm; tz /= tm;               // horizontal tangent
    const bx = ny * tz, by = nz * tx - nx * tz, bz = -ny * tx;                                        // n x t (up the surface)
    const a = lift + pr.range(-spread, spread), ca = Math.cos(a), sa = Math.sin(a);
    return [tx * ca + bx * sa, by * sa, tz * ca + bz * sa];
  };
  function placeProto(P, x, z, s, o = {}) {
    const y0 = H(x, z) + (o.dy || 0), yaw = o.yaw ?? r() * TAU, cy = Math.cos(yaw), sy = Math.sin(yaw);
    m4.compose(v4.set(x, y0, z), q4.setFromAxisAngle(UP, yaw), s4.set(s, s, s));
    const T = { x, z, y0, s, lobes: [], wood: [] }, tint = o.tint || [1, 1, 1];
    const at = [x, z];
    for (const g of P.wood) { const c = B.put(g.clone().applyMatrix4(m4), undefined, at); T.wood.push(c); if (g === P.forkGeo) T.forkGeo = c; }
    // leaf parts: both levels know the tree's centre (a proto without a hi level never switches)
    const lod = P.hi.length > 0, lcy = lod ? y0 + P.mid * s : NEVER, ht = P.ht * s, mt = m4.clone();
    const place = part => {
      const g = part.g.clone().applyMatrix4(mt);
      const cols = P.kind === 'hue' ? lightPart(g, (i, px, py) => [part.v0[i] + 0.12 * sat((py - y0) / ht), part.env[i]], tint) : tinted(part.g.attributes.color.array, tint);
      return leafPart(g, cols, x, lcy, z);
    };
    if (lod && P.near) NEARS.push({ x, z, c: [x, lcy, z], kind: P.kind, build: () => place(P.near()) });
    let reachG = null;
    for (const part of P.far) { const g = place(part); LB[P.kind].put(g, undefined, at); reachG = g; }
    if (lod) { for (const part of P.lo) loPut(P.kind, place(part), x, z); for (const part of P.hi) { const g = place(part); hiPut(P.kind, g, x, z); reachG = g; } }
    if (o.reach && reachG) { // the crown's reach in the band a standing or jumping eye can touch (slope-corrected)
      const p = reachG.attributes.position, gx = (H(x + 1, z) - H(x - 1, z)) / 2, gz = (H(x, z + 1) - H(x, z - 1)) / 2, top = SN.player.eye + 1.3;
      let m = 0; for (let i = 0; i < p.count; i++) { const dx = p.getX(i) - x, dz = p.getZ(i) - z; if (p.getY(i) - (y0 + gx * dx + gz * dz) < top) m = Math.max(m, Math.hypot(dx, dz)); }
      T.reach = m;
    }
    const tr = (lx, lz) => [x + (cy * lx + sy * lz) * s, z + (-sy * lx + cy * lz) * s];
    const S = P.splats, n0 = SPLATS.length / SREC;
    for (let i = 0; i < S.length; i += SREC) {
      const [px, pz] = tr(S[i], S[i + 2]), nx = cy * S[i + 3] + sy * S[i + 5], nz = -sy * S[i + 3] + cy * S[i + 5], dx = cy * S[i + 6] + sy * S[i + 8], dz = -sy * S[i + 6] + cy * S[i + 8];
      SPLATS.push(px, y0 + S[i + 1] * s, pz, nx, S[i + 4], nz, dx, S[i + 7], dz, S[i + 9] * s, S[i + 10] * s, S[i + 11] * tint[0], S[i + 12] * tint[1], S[i + 13] * tint[2], S[i + 14], S[i + 15], S[i + 16] * tint[0], S[i + 17] * tint[1], S[i + 18] * tint[2], S[i + 19]);
    }
    tallyDabs(n0, Math.hypot(x, z) > 124.5);
    const xf = lb => { const [lx, lz] = tr(lb.x, lb.z); return { x: lx, z: lz, y: y0 + lb.y * s, rx: lb.rx * s, ry: lb.ry * s, rz: lb.rz * s }; };
    T.lobes = P.lobes.map(xf);
    if (P.shadow) T.shadow = P.shadow.map(xf);
    if (P.fork) { const [fx, fz] = tr(P.fork[0], P.fork[2]); T.fork = [fx, y0 + P.fork[1] * s, fz]; }
    T.top = Math.max(...T.lobes.map(l => l.y + l.ry * 0.9));
    return T;
  }
  // colliders from the leaf masses: a circle for each lobe that hangs low enough for a standing eye
  // (plus the splats' droop) to reach it, sized to its widest cross-section at eye height
  function leafColliders(T, tag, eyeTop = 2.05) {
    for (const lb of T.lobes) {
      const e = Math.max(lb.rx, lb.rz) * 0.7, g = Math.max(H(lb.x, lb.z), H(lb.x + e, lb.z), H(lb.x - e, lb.z), H(lb.x, lb.z + e), H(lb.x, lb.z - e)), lo = lb.y - lb.ry - 0.32 - g;
      if (lo > eyeTop) continue;
      const yb = SN.clamp(lb.y - g, 0.2, eyeTop + 0.35), f = Math.sqrt(Math.max(0, 1 - ((yb - (lb.y - g)) / (lb.ry + 0.3)) ** 2));
      W.addCircle({ x: lb.x, z: lb.z, r: Math.max(lb.rx, lb.rz) * 1.08 * f + 0.12, tag });
    }
  }

  // ---- olive trees (Saint-Remy: short twisted trunks splitting into leaning limbs that lift wide,
  // ragged crowns of silver-green, blue-green and ultramarine dabs)
  const cBark = lin('#5e5d66'), cBarkD = lin('#34323a'), cLeafTop = lin('#7f9c92'), cLeaf = lin('#3a5a58'), cLeafLow = lin('#16304f'), cSilver = lin('#b4cabd');
  const leafTints = [[1, 1, 1], [0.92, 0.98, 1.08], [1.04, 1.04, 0.94], [0.95, 1.02, 1], [1.06, 1.06, 1.06]];
  const cUltra = lin('#1e3a66'), cOliveG = lin('#6f8a64');
  const oliveLeaf = (ny, pr) => { // splat colours: silver tops, blue-green flanks, ultramarine undersides (+ the crown's own colour there)
    const t = ny * 0.5 + 0.5, base = t > 0.55 ? linMix(cLeaf, cLeafTop, (t - 0.55) / 0.45) : linMix(cLeafLow, cLeaf, t / 0.55); let c = base;
    const q = pr(); if (q < 0.16 && t > 0.5) c = linMix(c, cSilver, q < 0.1 ? 0.62 : 0.38); else if (q < 0.3) c = linMix(c, cUltra, 0.6); else if (q < 0.38) c = linMix(c, cOliveG, 0.4);
    const k = pr.range(0.88, 1.12); return [c[0] * k, c[1] * k, c[2] * k, base[0], base[1], base[2]];
  };
  function oliveProto(pr, lite, id) {
    const P = { kind: 'lum', wood: [], hi: [], lo: [], far: [], lobes: [], splats: [] };
    const lean = pr() * TAU, la = pr.range(0.15, 0.42), hf = pr.range(1.0, 1.3), F = [Math.cos(lean) * la, hf, Math.sin(lean) * la];
    P.fork = F;
    const barkCol = (u, c) => linMix(cBarkD, cBark, SN.clamp(0.45 + 0.4 * c + 0.2 * Math.sin(u * 17), 0, 1));
    const M = lite ? 4 : 6, ns = lite ? 3 : 6, tr = [];
    for (let k = 0; k <= ns; k++) {
      const u = k / ns, w = Math.sin(u * Math.PI) * 0.14, fl = 1 + 0.5 * Math.pow(1 - u, 4);
      tr.push({ p: [F[0] * u + Math.cos(lean + 1.6) * w, SN.lerp(-0.35, F[1], u), F[2] * u + Math.sin(lean + 1.6) * w], a: (0.33 - 0.1 * u) * fl, b: (0.3 - 0.09 * u) * fl,
        out: [Math.cos(lean + u * 2), Math.sin(lean + u * 2)], wob: lite ? null : Array.from({ length: M }, () => pr.range(-0.22, 0.22)) });
    }
    P.wood.push(sweep(tr, M, { col: barkCol, vScale: 0.9, uRep: 1 }));
    if (!lite) { P.forkGeo = blob({ x: F[0], y: F[1] - 0.02, z: F[2], rx: 0.3, ry: 0.17, rz: 0.3, jitter: 0.12, seed: pr() * 50, ws: 7, hs: 4, col: () => linMix(cBarkD, cBark, 0.6) }); P.wood.push(P.forkGeo); }
    const lobe = (x, y, z, rr) => P.lobes.push({ x, y, z, rx: rr * pr.range(1.08, 1.24), ry: rr * pr.range(0.8, 0.95), rz: rr * pr.range(1.0, 1.16), rot: pr() * TAU, tint: pr.pick(leafTints) });
    const nl = lite ? 2 : pr() < 0.65 ? 3 : 2;
    for (let i = 0; i < nl; i++) {
      const az = lean + (i / nl) * TAU + pr.range(-0.45, 0.45), el = pr.range(0.62, 0.9), len = pr.range(1.6, 2.1), K = lite ? 3 : 5, sp = [];
      const d = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      for (let k = 0; k <= K; k++) { const u = k / K, tw = Math.sin(u * 3 + i) * 0.12; sp.push({ p: [F[0] + d[0] * len * u + Math.cos(az + 1.57) * tw, F[1] + d[1] * len * u + u * u * 0.35, F[2] + d[2] * len * u + Math.sin(az + 1.57) * tw], a: 0.17 * (1 - u * 0.6), b: 0.15 * (1 - u * 0.6), out: [Math.cos(az), Math.sin(az)] }); }
      P.wood.push(sweep(sp, lite ? 4 : 5, { col: barkCol, vScale: 0.9, uRep: 1 }));
      const E = sp[K].p; lobe(E[0], E[1] + 0.15 + pr.range(-0.15, 0.25), E[2], pr.range(0.98, 1.15));
      if (!lite) { // a side limb with a smaller crown of its own
        const sb = sp[Math.round(K * 0.6)].p, az2 = az + pr.sign() * pr.range(0.8, 1.2), l2 = pr.range(0.8, 1.1), sp2 = [];
        for (let k = 0; k <= 3; k++) { const u = k / 3; sp2.push({ p: [sb[0] + Math.cos(az2) * l2 * u, sb[1] + u * 0.6, sb[2] + Math.sin(az2) * l2 * u], a: 0.08 * (1 - u * 0.6), b: 0.08 * (1 - u * 0.6), out: [1, 0] }); }
        P.wood.push(sweep(sp2, 4, { col: barkCol, vScale: 0.9, uRep: 1 }));
        const E2 = sp2[3].p; lobe(E2[0], E2[1] + 0.3, E2[2], pr.range(0.7, 0.82));
      }
    }
    lobe(F[0] + pr.range(-0.3, 0.3), F[1] + 2.35, F[2] + pr.range(-0.3, 0.3), lite ? 1.25 : 1.12); // the crown's top
    // crowns: the 6x5 lobes that look right from ~15 m out (lo), and the same lobes as fine
    // icospheres for close by (hi: no facets on the underside you see standing under the tree)
    const occ = P.lobes.map(lb => ({ ...lb, rx: lb.rx * 0.92, ry: lb.ry * 0.92, rz: lb.rz * 0.92, lump: 0.23 })), lo = [], hi = [], far = [], nearO = [];
    P.lobes.forEach((lb, i) => {
      const o = { x: lb.x, y: lb.y, z: lb.z, rx: lb.rx * 0.92, ry: lb.ry * 0.92, rz: lb.rz * 0.92, rot: lb.rot, jitter: 0.36, freq: 2.4, seed: (lb.seed = pr() * 100), uvScale: 0.95,
        // (plus soft clusters of silver and blue-green leaves, so a crown seen close is not one smooth mass)
        col: (nn, dy, i, px, py, pz) => {
          const t = nn.y * 0.5 + 0.5, q = SN.noise2(px * 1.9 + lb.x * 3.1, pz * 1.9 + py * 1.4), q2 = SN.noise2(pz * 3.7 - py, px * 3.3 + 7.7);
          let c = t > 0.5 ? linMix(cLeaf, cLeafTop, (t - 0.5) * 1.6) : linMix(cLeafLow, cLeaf, t * 2);
          c = q > 0.25 ? linMix(c, t > 0.45 ? cSilver : cLeaf, (q - 0.25) * 0.42) : linMix(c, cUltra, (0.25 - q) * 0.34);
          const k = 1 + 0.08 * q2; return [c[0] * lb.tint[0] * k, c[1] * lb.tint[1] * k, c[2] * lb.tint[2] * k];
        } };
      lo.push({ g: cullBuried(blob({ ...o, ws: 6, hs: lite ? 4 : 5 }).deleteAttribute('uv'), occ[i], occ) });
      if (!lite) { far.push({ g: cullBuried(blob({ ...o, ws: 5, hs: 4 }).deleteAttribute('uv'), occ[i], occ) }); hi.push({ g: cullBuried(blob({ ...o, ws: 10, hs: 7, soft: 0.18 }).deleteAttribute('uv'), occ[i], occ) }); nearO.push(o); }
    });
    if (lite) P.far.push(protoPart(lo)); else { P.far.push(protoPart(far)); P.lo.push(protoPart(lo)); P.hi.push(protoPart(hi)); }
    if (!lite) { let cache = null; P.near = () => cache || (cache = protoPart(nearO.map((o, i) => ({ g: cullBuried(blob({ ...o, ico: 6, soft: 0.18 }).deleteAttribute('uv'), occ[i], occ) })))); }
    P.mid = P.lobes.reduce((a, lb) => a + lb.y, 0) / P.lobes.length; P.ht = P.mid + 1.2;
    lobeSplats(pr, P, lite ? 7.5 : 13, lite ? [0.7, 1.0, 0.28, 0.38] : [0.6, 0.9, 0.24, 0.34], lite ? (ny, pr2) => oliveLeaf(ny * 0.6 - 0.25, pr2) : oliveLeaf, tangentDir(1.1, -0.35), 1,
      { kk: [0.96, 1.1], ...(lite ? {} : { under: 0.16, underRng: SN.rng('landscape-olive-under-' + id) }) });
    return P;
  }
  const OLIVES = Array.from({ length: 8 }, (_, i) => oliveProto(SN.rng('landscape-olive-' + i), false, i));
  const OLIVES_LITE = Array.from({ length: 4 }, (_, i) => oliveProto(SN.rng('landscape-olive-lite-' + i), true, 'lite' + i));
  function oliveTree(x, z, s = 1, o = {}) {
    TRI.kind = 'olive';
    const P = o.lite ? r.pick(OLIVES_LITE) : r.pick(OLIVES), tn = r.pick(leafTints), T = placeProto(P, x, z, s, { tint: o.lite ? tn.map(v => v * 0.8) : tn });
    OCC.add(x, z, 2.2 * s);
    if (!o.rim) { W.addCircle({ x, z, r: 0.42 * s, tag: 'olive' }); leafColliders(T, 'olive'); trees.push(T); }
    return T;
  }
  // groves: rows along the contours (terraced Provence), ~7 m apart, trees ~6.5 m along a row
  for (const [gi, g] of fields.groves.entries()) {
    const e = 1.5, gx = (H(g.x + e, g.z) - H(g.x - e, g.z)) / (2 * e), gz = (H(g.x, g.z + e) - H(g.x, g.z - e)) / (2 * e);
    const rot = Math.hypot(gx, gz) > 0.03 ? Math.atan2(gx, -gz) : g.rot, c = Math.cos(rot), sn = Math.sin(rot);
    for (let v = -g.rz - g.rx; v <= g.rz + g.rx; v += 8.2) for (let u = -g.rx - g.rz; u <= g.rx + g.rz; u += 7.8) {
      const ju = u + r.range(-0.9, 0.9) + (Math.round(v / 8.2) & 1) * 3.9, jv = v + r.range(-0.6, 0.6);
      const x = g.x + c * ju - sn * jv, z = g.z + sn * ju + c * jv;
      if (inGrove(g, x, z) > 1) continue;
      if (!clear(x, z, { grove: false, road: 5.5, pathR: 3.6, r: 2.6 })) continue;
      const s = r.range(0.85, 1.12);
      if (!guard.ok(x, z, H(x, z) + 4.6 * s, false)) continue;
      oliveTree(x, z, s).grove = gi;
    }
  }
  // two lone olives beside the road above the painter's viewpoint (out of the painting's frame)
  spots.oliveRoad = oliveTree(roadAt(58, 4.6).x, roadAt(58, 4.6).z, 1.05);
  spots.oliveRoad2 = oliveTree(roadAt(40, -4.8).x, roadAt(40, -4.8).z, 0.95);

  // ---- the painting's dark round trees, built the way the village builds its own (30-town): a core
  // and 6-8 clumps on a tall egg, darker in the crevices between them, a few upward-curling tongues
  // licking out of the silhouette and dark dabs breaking its edge. Seen from the painter's hill they
  // are still dark round masses (the inner glow and the moonlit side both fade with distance).
  const cDab = [['#294d8a', 1.2], ['#2b5956', 2.4], ['#3b6c60', 2.2], ['#578a72', 1.1]].map(([h, w]) => [lin(h), w]), cDabW = cDab.reduce((a, c) => a + c[1], 0);
  const cDabBase = lin('#2c5456');
  // dab colour: a stroke from the leaf texture's palette under the village's light multipliers (the
  // base is the crown's mean colour there, which near and far dabs melt into)
  const treeLeaf = (ny, pr) => {
    let q = pr() * cDabW, c = cDab[0][0]; for (const [cc, w] of cDab) if ((q -= w) <= 0) { c = cc; break; }
    const t = sat(ny * 0.5 + 0.5), m = t > 0.6 ? linMix(TV.mid, TV.lit, (t - 0.6) * 1.4) : linMix(TV.shade, TV.mid, t / 0.6), k = pr.range(0.85, 1.15) * 1.25;
    return [c[0] * m[0] * k, c[1] * m[1] * k, c[2] * m[2] * k, cDabBase[0] * m[0] * 1.25, cDabBase[1] * m[1] * 1.25, cDabBase[2] * m[2] * 1.25];
  };
  function roundProto(pr, lite) {
    const P = { kind: 'hue', wood: [], hi: [], lo: [], far: [], lobes: [], splats: [] }, Ht = pr.range(5.8, 8.2), R = pr.range(2.3, 3.1);
    const tr = [0, 1, 2].map(k => ({ p: [0, SN.lerp(-0.3, 1.6, k / 2), 0], a: 0.24 - k * 0.04, b: 0.22 - k * 0.04, out: [1, 0] }));
    const cTrunk = lin('#2c2a30'); P.wood.push(sweep(tr, lite ? 4 : 5, { col: () => cTrunk, vScale: 0.9, uRep: 1 }));
    const RX = R, RZ = R * pr.range(0.9, 1.0), RY = Ht * 0.46, ey = Ht * 0.5, rm = (RX + RZ) / 2;
    Object.assign(P, { R, mid: ey, ht: Ht });
    const env = (x, y, z) => Math.hypot(x / RX, (y - ey) / RY, z / RZ) * 1.02;
    const n = lite ? 5 : pr.int(6, 7), off = pr() * TAU;
    const C = [{ x: 0, y: ey - Ht * 0.06, z: 0, rx: RX * 0.72, ry: RY * 0.74, rz: RZ * 0.72, rot: 0, lump: 0.1, seed: pr() * 60, tone: -0.04, core: true }];
    for (let k = 0; k < n; k++) { // clumps spiralling down the egg (golden angle), the lowest overhanging a short trunk
      const yy = SN.clamp(SN.lerp(0.86, -0.8, k / (n - 1)) + pr.range(-0.08, 0.08), -0.86, 0.95), a = off + k * 2.39996 + pr.range(-0.3, 0.3), sq = Math.sqrt(1 - yy * yy);
      const rl = rm * pr.range(0.5, 0.6) * (lite ? 1.1 : 1);
      C.push({ x: Math.cos(a) * sq * RX * 0.57, y: ey + yy * RY * 0.6, z: Math.sin(a) * sq * RZ * 0.57, rx: rl, ry: rl * Math.sqrt(RY / rm) * pr.range(0.88, 1.0), rz: rl * pr.range(0.9, 1.05), rot: 0, lump: 0.14, seed: pr() * 60, tone: pr.range(-0.08, 0.08), dir: [Math.cos(a) * sq, yy, Math.sin(a) * sq] });
    }
    const tongues = [];
    for (const c of C) if (!c.core && c.dir[1] > -0.2 && pr() < (lite ? 0.35 : 0.6)) {
      const uy = SN.clamp(c.dir[1], -0.1, 0.72), hk = Math.sqrt(1 - uy * uy); let ux = c.dir[0] + pr.range(-0.3, 0.3), uz = c.dir[2] + pr.range(-0.3, 0.3); const hm = Math.hypot(ux, uz) || 1;
      tongues.push({ c, ux: (ux / hm) * hk, uy, uz: (uz / hm) * hk, len: c.rx * pr.range(0.75, 1.05), w: c.rx * pr.range(0.24, 0.34), up: pr.range(0.75, 1.1), hook: pr.sign() * pr.range(0.2, 0.45) });
    }
    const aux = (g, tone, fix) => { const p = g.attributes.position, v0 = new Float32Array(p.count).fill(tone), e = new Float32Array(p.count); for (let i = 0; i < p.count; i++) e[i] = fix ?? env(p.getX(i), p.getY(i), p.getZ(i)); return { g, v0, env: e }; };
    // (lo keeps only the two highest tongues: at a distance the rest are a few pixels, and a third of the cost)
    const top2 = tongues.slice().sort((t1, t2) => t2.c.y - t1.c.y).slice(0, 2);
    const level = (det, core, tk, tm, T = tongues) => protoPart([...C.map(c => aux(cullBuried(clumpGeo(c, c.core ? core : det), c, C), c.tone)), ...T.map(t => aux(tongueGeo(t, tk, tm), t.c.tone + 0.05, 1.1))]);
    if (lite) P.far.push(protoPart(C.map(c => aux(cullBuried(clumpGeo(c, c.core ? 0 : '6x4'), c, C), c.tone))));
    else {
      P.far.push(level(0, 0, 0, 0, [])); P.lo.push(level('7x5', 0, 4, 4, top2)); P.hi.push(level(2, 1, 6, 5));
      let cache = null; P.near = () => cache || (cache = level(5, 3, 9, 7));
    }
    P.lobes = C;
    // moon shadows: the egg and its three widest clumps (as dark as the old four-lobe crowns threw)
    P.shadow = [{ x: 0, y: ey, z: 0, rx: RX, ry: RY, rz: RZ }, ...C.slice(1).sort((p1, p2) => Math.hypot(p2.x, p2.z) - Math.hypot(p1.x, p1.z)).slice(0, 3)];
    lobeSplats(pr, P, lite ? 2.5 : 3.2, lite ? [0.9, 1.25, 0.32, 0.44] : [0.55, 0.85, 0.22, 0.32], treeLeaf, tangentDir(0.45, 0.55), 0.6, { hosts: C.slice(1), kk: [1.02, 1.16], keep: 1 });
    return P;
  }
  const ROUNDS = Array.from({ length: 6 }, (_, i) => roundProto(SN.rng('landscape-round-' + i), false));
  const ROUNDS_LITE = Array.from({ length: 3 }, (_, i) => roundProto(SN.rng('landscape-round-lite-' + i), true));
  const rounds = [];
  function roundTree(x, z, s = 1, o = {}) {
    TRI.kind = 'round';
    const P = o.lite ? r.pick(ROUNDS_LITE) : r.pick(ROUNDS), T = placeProto(P, x, z, s, { tint: [r.range(0.9, 1.08), r.range(0.94, 1.08), r.range(0.95, 1.1)], reach: !o.rim });
    OCC.add(x, z, P.R * s * 0.7);
    if (!o.rim) { W.addCircle({ x, z, r: Math.max(0.6, T.reach + 0.22 - SN.player.radius), tag: 'tree' }); rounds.push(T); }
    return T;
  }
  // a cluster of 2-4 round trees, each checked against the painting view
  function roundCluster(cx, cz, n, o = {}) {
    let made = 0;
    for (let k = 0, tries = 0; k < n && tries < n * 5; tries++) {
      const a = r() * TAU, d = k ? r.range(3.2, 5.2) : 0, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, s = r.range(0.8, 1.12) * (o.scale || 1);
      if (!clear(x, z, { rmin: o.rmin ?? 46, rmax: o.rmax ?? 119, road: 6, pathR: 4.2 * s, r: 1.6 * s, grove: o.grove })) continue;
      if (!guard.ok(x, z, H(x, z) + 8.2 * s)) continue;
      if (x > -12 && x < 16 && z > -78 && z < -36) continue; // the church lane's way out onto the back hills stays open
      roundTree(x, z, s, o); k++; made++;
    }
    return made;
  }
  // around the village edge (gaps where the lanes and footpaths leave it)
  for (let a = 0; a < TAU; a += r.range(0.13, 0.24)) {
    if (r() < 0.2) continue;
    const rr = r.range(47, 60), x = Math.cos(a) * rr, z = Math.sin(a) * rr * 1.04;
    roundCluster(x, z, r.int(2, 4), { rmin: 45, scale: 1.32 }); // the painting's big dark trees at the village edge
  }
  // dark masses on the slope just behind the village (from the painter's hill they stand right
  // above the rooftops, under the hills), each checked against the spire and the skyline
  for (const [x, z, n] of [[-64, -60, 4], [-48, -67, 5], [-31, -63, 4], [-22, -74, 3], [30, -66, 4], [42, -60, 4], [62, -58, 4], [76, -66, 3], [-80, -72, 3], [-8, -93, 4], [-30, -92, 3], [48, -98, 3]])
    roundCluster(x, z, n, { scale: 1.25 });
  // belts along the contours of the back hills and the side slopes, with hedgerows between
  const belts = [[-6, -62, 44], [30, -60, 26], [-62, -64, 28], [4, -86, 60], [-40, -98, 30], [58, -92, 30], [-98, -36, 30], [104, -22, 26], [-100, 28, 22], [102, 52, 24], [48, 110, 22], [-78, 104, 22]];
  const hedgeRuns = [];
  for (const [bx, bz, len] of belts) {
    const line = traceContour(bx, bz, Math.round(len / 2), 2, (x, z) => Math.hypot(x, z) > 118 || Math.hypot(x, z) < 50);
    let i = r.int(0, 4);
    while (i < line.length) {
      if (r() < 0.55) { const [x, z] = line[i]; roundCluster(x, z, r.int(1, 3)); i += r.int(4, 7); }
      else { const j = Math.min(line.length - 1, i + r.int(4, 9)); if (j - i >= 3) hedgeRuns.push(line.slice(i, j + 1)); i = j + r.int(2, 4); }
    }
  }

  // ---- hedgerows: lumpy dark tubes that hug the ground, in the leaf look of the trees, fringed with
  // dabs that overhang the top and the flanks so the edge is brushwork, not a polygon
  const hr = SN.rng('landscape-hedges'), hr2 = SN.rng('landscape-hedges-leaf');
  function hedge(path, o = {}) {
    TRI.kind = 'hedge';
    const h = o.h ?? hr.range(1.5, 2.1), w = o.w ?? hr.range(1.3, 1.8), step = o.step ?? 1.3, rim = !!o.rim;
    const pts = smoothPath(path, step);
    if (pts.length < 3) return null;
    // (draw what the old build drew from hr, so the thicket and the rim keep their places)
    for (let k = 0, nb = pts.length * ((rim ? 5 : 7) + (rim ? 2 : 7) * 8); k < nb; k++) hr();
    const M = rim ? 5 : 10, gys = pts.map(([x, z]) => H(x, z)), spine = pts.map(([x, z], i) => {
      const end = Math.min(1, Math.min(i, pts.length - 1 - i) / 1.6), k = (0.45 + 0.55 * end) * (1 + 0.3 * SN.noise2(x * 0.35, z * 0.35) + 0.22 * SN.noise2(x * 1.1, z * 1.1));
      return { p: [x, gys[i] + h * 0.4 * k, z], a: h * 0.55 * k, b: w * 0.5 * k, out: [1, 0], ref: [0, 1, 0], wob: Array.from({ length: M }, () => hr2.range(-0.26, 0.26)) };
    });
    const g = sweep(spine, M, {});
    // the underside follows the ground, so a hedge running across a slope never floats
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const gy = H(p.getX(i), p.getZ(i)); if (p.getY(i) < gy + 0.15) p.setY(i, Math.min(p.getY(i), gy - 0.12)); }
    g.computeVertexNormals();
    // lit like a crown: deep blue at the foot, the moonlit top paler (ring i/(M+1) = spine point)
    const cols = lightPart(g, (i, px, py) => { const t = sat((py - gys[Math.floor(i / (M + 1))]) / h); return [0.12 * t + 0.04, 0.72 + 0.4 * t]; });
    LB.hue.put(leafPart(g, cols, 0, NEVER, 0), rim);
    const n0 = SPLATS.length / SREC;
    for (let i = 0; i < pts.length; i++) for (let k = 0; k < (rim ? 2 : 8); k++) {
      const sp = spine[i], a = hr2.range(-1.5, 1.5), ny = Math.cos(a), side = Math.sin(a), tx = (pts[Math.min(i + 1, pts.length - 1)][0] - pts[Math.max(i - 1, 0)][0]), tz = (pts[Math.min(i + 1, pts.length - 1)][1] - pts[Math.max(i - 1, 0)][1]), tm = Math.hypot(tx, tz) || 1;
      const kq = hr2.range(1.02, 1.16), nx = (-tz / tm) * side, nz = (tx / tm) * side, x = sp.p[0] + nx * sp.b * kq + (tx / tm) * hr2.range(-0.6, 0.6), y = sp.p[1] + ny * sp.a * kq, z = sp.p[2] + nz * sp.b * kq;
      const col = treeLeaf(ny, hr2), cm = Math.hypot(nx, ny, nz) || 1;
      SPLATS.push(x, y, z, nx / cm, ny / cm, nz / cm, tx / tm, hr2.range(-0.3, 0.5), tz / tm, (rim ? 1.4 : 0.95) * hr2.range(0.8, 1.2), (rim ? 0.48 : 0.36) * hr2.range(0.85, 1.15), col[0], col[1], col[2], hr2.int(0, 3), 0.02, col[3], col[4], col[5], 1);
    }
    tallyDabs(n0, rim);
    if (o.collide !== false) for (let i = 0; i < pts.length - 1; i += 2) {
      const j = Math.min(pts.length - 1, i + 2), [ax, az] = pts[i], [bx, bz] = pts[j], len = Math.hypot(bx - ax, bz - az);
      W.addBox({ x: (ax + bx) / 2, z: (az + bz) / 2, hx: len / 2 + 0.1, hz: w * 0.42, rot: -Math.atan2(bz - az, bx - ax), top: Math.max(H(ax, az), H(bx, bz)) + h * 0.95, tag: 'hedge' });
    }
    for (const [x, z] of pts) OCC.add(x, z, w * 0.6);
    return { pts, h, w };
  }
  const hedges = [];
  for (const run of fields.hedgerows) {
    const [x, z] = run[Math.floor(run.length / 2)];
    if (run.some(([px, pz]) => !OCC.free(px, pz, 1.0))) continue;
    if (!run.every(([px, pz]) => guard.ok(px, pz, H(px, pz) + 2.1))) continue;
    hedges.push(hedge(run));
    if (r() < 0.4) { const [ex, ez] = run[r() < 0.5 ? 0 : run.length - 1]; roundCluster(ex + r.range(-2, 2), ez + r.range(-2, 2), r.int(1, 2)); }
  }
  for (const run of hedgeRuns) {
    const [x, z] = run[Math.floor(run.length / 2)];
    if (run.some(([px, pz]) => roadNear(px, pz) < 4 || pathNear(px, pz) < 1.8 || wheatAt(px, pz) || !OCC.free(px, pz, 1.2))) continue;
    if (!guard.ok(x, z, H(x, z) + 2.2)) continue;
    hedges.push(hedge(run));
  }

  // ---- rocks and boulders: crest outcrops (cats watch the stars from these), road boulders, scatter
  const cRockTop = lin('#8e98ac'), cRock = lin('#5a6580'), cRockLow = lin('#26304a'), cOchre = lin('#a39570');
  const rocks = [];
  function rock(x, z, size, o = {}) {
    TRI.kind = 'rock';
    const y0 = H(x, z), ry = size * (o.flat ?? r.range(0.5, 0.75)), warm = r() < 0.25;
    const g = blob({
      x, y: y0 + ry * 0.55, z, rx: size * r.range(0.95, 1.3), ry, rz: size * r.range(0.8, 1.1), rot: r() * TAU, jitter: 0.3, freq: 1.4, seed: r() * 100, ws: 9, hs: 6, flat: 0.45,
      col: (n) => { const t = n.y * 0.5 + 0.5; let c = t > 0.55 ? linMix(cRock, cRockTop, (t - 0.55) / 0.45) : linMix(cRockLow, cRock, t / 0.55); if (warm) c = linMix(c, cOchre, 0.25); return c; },
    });
    B.put(g, o.rim);
    const rk = { x, z, y0, size, top: y0 + ry * 1.5, geo: g };
    OCC.add(x, z, size * 1.3);
    if (!o.rim) { rocks.push(rk); W.addCircle({ x, z, r: size * 1.05, top: rk.top - 0.05, tag: 'rock' }); }
    return rk;
  }
  const outcrop = (cx, cz, n, big, o = {}) => {
    const out = [rock(cx, cz, big, { flat: 0.62, ...o })];
    for (let i = 1; i < n; i++) { const a = r() * TAU, d = big * r.range(1.4, 2.4); out.push(rock(cx + Math.cos(a) * d, cz + Math.sin(a) * d, big * r.range(0.35, 0.7), o)); }
    return out;
  };
  spots.crestBack = outcrop(-26, -111, 6, 1.5)[0];   // back hill crest, over the village
  spots.crestEast = outcrop(15, 113, 5, 1.35)[0];    // top of the painter's hill, east
  outcrop(-104, 49, 4, 1.2);                          // west crest
  outcrop(92, -62, 4, 1.1);                           // east hills
  outcrop(-68, -104, 4, 1.0); outcrop(70, -104, 3, 1.1); outcrop(112, 22, 3, 0.9); outcrop(-84, 80, 3, 0.9); // more crests
  spots.rockRoad = rock(roadAt(66, 3.9).x, roadAt(66, 3.9).z, 0.8, { flat: 0.7 });
  rock(roadAt(106, -3.8).x, roadAt(106, -3.8).z, 0.55);
  for (let i = 0, tries = 0; i < 44 && tries < 500; tries++) {
    const a = r() * TAU, d = r.range(50, 118), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!clear(x, z, { r: 1 })) continue;
    rock(x, z, r.range(0.25, 0.7)); i++;
  }

  // ---- dark rounded bushes: the round trees' recipe in miniature (2-4 clumps, a tongue, dabs)
  const br = SN.rng('landscape-bushes');
  function bush(x, z, s) {
    TRI.kind = 'bush';
    const y0 = H(x, z), n = r.int(2, 4), C = [];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = i ? s * r.range(0.4, 0.8) : 0, rr = s * (i ? r.range(0.6, 0.85) : 1);
      const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d, by = H(bx, bz) + rr * 0.55;
      C.push({ x: bx, y: by, z: bz, rx: rr * 0.95, ry: rr * 0.78, rz: rr * 0.95, rot: 0, lump: 0.16, seed: r() * 100, tone: br.range(-0.06, 0.06), rr });
      for (let k = 0, nb = Math.round(rr * rr * 6) * 8; k < nb; k++) r(); // (the old dabs' draws: every later placement stays put)
    }
    const env = (px, py, pz) => Math.hypot((px - x) / (s * 1.2), (py - y0 - s * 0.5) / (s * 0.95), (pz - z) / (s * 1.2)) * 1.05;
    // (the tuft licks out sideways and up from a side clump, as on the village's bushes)
    const top = C[1], ta = Math.atan2(top.z - z, top.x - x) + br.range(-0.4, 0.4), tg = { c: top, ux: Math.cos(ta) * 0.89, uy: 0.45, uz: Math.sin(ta) * 0.89, len: top.rx * br.range(0.45, 0.6), w: top.rx * 0.3, up: br.range(0.5, 0.75), hook: br.sign() * 0.3 };
    const lcy = y0 + s * 0.6;
    const level = (det, tk, tm) => {
      const parts = C.map(c => { const g = cullBuried(clumpGeo(c, det), c, C); return leafPart(g, lightPart(g, (i, px, py, pz) => [c.tone + 0.12 * sat((py - y0) / (s * 1.6)), env(px, py, pz)]), x, lcy, z); });
      const tgG = tongueGeo(tg, tk, tm); parts.push(leafPart(tgG, lightPart(tgG, () => [top.tone + 0.08, 1.1]), x, lcy, z));
      return mergeSame(parts);
    };
    hiPut('hue', level(2, 6, 5), x, z); loPut('hue', level('6x4', 3, 3), x, z);
    LB.hue.put(mergeSame(C.map(c => { const g = cullBuried(clumpGeo(c, 0), c, C); return leafPart(g, lightPart(g, (i, px, py, pz) => [c.tone + 0.12 * sat((py - y0) / (s * 1.6)), env(px, py, pz)]), x, lcy, z); })), undefined, [x, z]);
    NEARS.push({ x, z, c: [x, lcy, z], kind: 'hue', build: () => level(5, 8, 6) });
    const n0 = SPLATS.length / SREC;
    for (const c of C) for (let k = 0, n2 = Math.round(c.rr * c.rr * 9), tries = 0; k < n2 && tries < n2 * 3; tries++) { // dabs over the top and flanks
      const dy = br.range(-0.3, 1), ph = br() * TAU, rho = Math.sqrt(1 - dy * dy), nx = rho * Math.cos(ph), nz = rho * Math.sin(ph), kq = br.range(1.0, 1.12);
      const px = c.x + nx * c.rx * kq, py = c.y + dy * c.ry * kq, pz = c.z + nz * c.rz * kq;
      if (C.some(q => q !== c && ((px - q.x) / q.rx) ** 2 + ((py - q.y) / q.ry) ** 2 + ((pz - q.z) / q.rz) ** 2 < 0.72)) continue;
      const col = treeLeaf(dy, br);
      SPLATS.push(px, py, pz, nx, dy, nz, -nz, br.range(-0.2, 0.5), nx, br.range(0.5, 0.75) * c.rr, br.range(0.2, 0.27) * c.rr, col[0], col[1], col[2], br.int(0, 3), 0.015, col[3], col[4], col[5], 1);
      k++;
    }
    tallyDabs(n0, false);
    W.addCircle({ x, z, r: s * 0.9, top: y0 + s * 1.2, tag: 'bush' });
    OCC.add(x, z, s * 1.4);
    return { x, z, y0, s };
  }
  const bushes = [];
  for (let i = 0, tries = 0; i < 52 && tries < 900; tries++) {
    const a = r() * TAU, d = r.range(46, 118), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!clear(x, z, { road: 4, r: 1.6 }) || !guard.ok(x, z, H(x, z) + 2)) continue; // (nothing big in the painter's foreground)
    bushes.push(bush(x, z, r.range(0.8, 1.5))); i++;
  }
  spots.bush = bush(roadAt(113, 5.2).x, roadAt(113, 5.2).z, 1.3);

  // ---- haystacks and sheaves in the wheat
  const cStraw = lin('#c9a85e'), cStrawD = lin('#7c6434'), cStrawTop = lin('#dcc890');
  function haystack(x, z, s) {
    TRI.kind = 'hay';
    const y0 = H(x, z), prof = [[2.25, -0.4], [2.4, 0.45], [2.35, 1.25], [2.05, 2.05], [1.55, 2.8], [0.95, 3.3], [0.35, 3.58], [0.001, 3.64]];
    const seg = 40, pos = [], uv = [], col = [], index = [], streak = Array.from({ length: seg + 1 }, () => r.range(0.72, 1.18));
    streak[seg] = streak[0];
    for (let j = 0; j < prof.length; j++) for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU, [pr, py] = prof[j], jit = 1 + 0.06 * SN.noise2(Math.cos(a) * 2 + x, py * 1.3 + Math.sin(a) * 2);
      pos.push(x + Math.cos(a) * pr * s * jit, y0 + py * s, z + Math.sin(a) * pr * s * jit);
      uv.push(j * 0.55, (i / seg) * 4);
      const t = j / (prof.length - 1), k = streak[(i + j) % seg] * (j === 0 ? 0.6 : 1);
      const c = linMix(linMix(cStrawD, cStraw, Math.min(1, t * 2.2)), cStrawTop, Math.max(0, t - 0.6) * 1.8);
      col.push(c[0] * k, c[1] * k, c[2] * k);
    }
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; index.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(index); g.computeVertexNormals(); put(g);
    W.addCircle({ x, z, r: 2.3 * s, tag: 'haystack' });
    OCC.add(x, z, 2.6 * s);
    return { x, z, y0, top: y0 + 3.64 * s, s, geo: g };
  }
  // a stook: 8-10 sheaves stood up in a tent, two rows leaning together along a ridge and one
  // closing each end. Each sheaf tapers from its cut butt to the twisted tie, swells a little above
  // it and ends in a ragged crown; the ears splay out of that crown as a fan of bristly stalks
  // (ground-cover cards, see buildGroundCover), so the top is brushwork and not a solid head.
  const cStkButt = lin('#5e5236'), cStk = lin('#a88e52'), cStkTop = lin('#c4b07a'), cStkTie = lin('#4f4430');
  const sheafProf = [[0.12, -0.12], [0.135, 0.02], [0.118, 0.26], [0.095, 0.47], [0.078, 0.6], [0.09, 0.67], [0.106, 0.77], [0.1, 0.86]], TIE = 4;
  const mat4 = new THREE.Matrix4(), q5 = new THREE.Quaternion(), q6 = new THREE.Quaternion(), ax4 = new THREE.Vector3(), sr = SN.rng('landscape-stooks');
  const stooks = [];
  function sheaf(x, z) {
    TRI.kind = 'hay';
    // (draw what the old five-bundle build drew from r, so the walls' coping stones and the rim
    // after it keep their places)
    const turn = r() * TAU; for (let k = 0; k < 15; k++) r();
    const y0 = H(x, z), m = sr() < 0.55 ? 3 : 4, ct = Math.cos(turn), st = Math.sin(turn), ears = [];
    const place = [];
    for (const sd of [-1, 1]) for (let k = 0; k < m; k++) place.push([(k - (m - 1) / 2) * 0.27 + sr.range(-0.04, 0.04), sd * 0.27, 0, -sd]);
    const ex = ((m - 1) / 2) * 0.27 + 0.2;
    for (const sd of [-1, 1]) place.push([sd * ex, sr.range(-0.05, 0.05), -sd, 0]);
    const seg = 7, P8 = sheafProf.length;
    for (const [lx, lz, dx, dz] of place) {
      const h = sr.range(1.02, 1.22), lean = sr.range(0.2, 0.3), pos = [], uv = [], col = [], index = [], rag = Array.from({ length: seg }, () => sr.range(-0.07, 0.06));
      rag.push(rag[0]);
      for (let j = 0; j < P8; j++) for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, [pr, py] = sheafProf[j], top = j === P8 - 1, kr = top ? 1 + rag[i] * 1.6 : 1 + 0.06 * Math.sin(a * 3 + j);
        pos.push(Math.cos(a) * pr * kr, (py + (top ? rag[i] : 0)) * h, Math.sin(a) * pr * kr); uv.push(j * 0.32, (i / seg) * 1.2);
        const c = j === TIE ? cStkTie : j < TIE ? linMix(cStkButt, cStk, Math.min(1, j / 2.5)) : linMix(cStk, cStkTop, (j - TIE - 1) / (P8 - TIE - 2));
        const k = 0.9 + 0.2 * ((i * 7 + j * 3) % 5) / 4; col.push(c[0] * k, c[1] * k, c[2] * k);
      }
      for (let j = 0; j < P8 - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, bb = a + 1, c = a + seg + 1, d = c + 1; index.push(a, c, bb, bb, c, d); }
      const cap = pos.length / 3; pos.push(0, 0.78 * h, 0); uv.push(P8 * 0.32, 0.6); col.push(...cStkTie);
      for (let i = 0; i < seg; i++) { const a = (P8 - 1) * (seg + 1) + i; index.push(a, a + 1, cap); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(index);
      // lean toward the ridge (local dx, dz), twisted a little, then into the stook's frame
      const wx = ct * dx - st * dz, wz = st * dx + ct * dz, bx = x + ct * lx - st * lz, bz = z + st * lx + ct * lz;
      ax4.set(wz, 0, -wx); q5.setFromAxisAngle(ax4, lean); q6.setFromAxisAngle(UP, sr() * TAU); q5.multiply(q6);
      mat4.compose(v4.set(bx, H(bx, bz) - 0.02, bz), q5, s4.set(1, 1, 1));
      g.applyMatrix4(mat4); g.computeVertexNormals(); put(g);
      const tie = 0.6 * h; ears.push({ x: bx + wx * Math.sin(lean) * tie, z: bz + wz * Math.sin(lean) * tie, y: H(bx, bz) + Math.cos(lean) * tie - 0.04, s: h });
    }
    W.addBox({ x, z, hx: ex + 0.16, hz: 0.42, rot: -turn, top: y0 + 1.0, tag: 'sheaf' });
    OCC.add(x, z, 0.8);
    const sk = { x, z, y0, top: y0 + 1.05, ears }; stooks.push(sk);
    return sk;
  }
  spots.hayEast = haystack(96, 2, 1.0); haystack(103, -14, 0.85); haystack(88, -8, 0.8);
  spots.hayWest = haystack(-80, 60, 0.95); haystack(-88, 71, 0.8);
  spots.sheaves = [];
  for (let i = 0; i < 6; i++) spots.sheaves.push(sheaf(-69 - i * 3.1, 48 + i * 1.3)); // a row across the west field
  for (let i = 0; i < 5; i++) sheaf(86 + i * 3.0, 20 - i * 0.7);
  for (let i = 0; i < 4; i++) sheaf(92 + i * 3.2, 25 - i * 1.4);

  // ---- dry-stone walls and wooden fences
  const walls = [];
  function wall(path, { h = 0.85, w = 0.7, caps = 1.3, step = 0.5, solid = false, rim = false, collide = true, pinch = [true, true], uvk = 1 } = {}) {
    TRI.kind = 'wall';
    const pts = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1], d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(d / step));
      for (let k = 0; k < n; k++) pts.push([SN.lerp(ax, bx, k / n), SN.lerp(az, bz, k / n)]);
    }
    pts.push(path[path.length - 1]);
    // a stile wherever a footpath meets the wall: a gap a metre either side of the trodden earth,
    // the stones pinched down to it as at the wall's ends (the gap still draws what it would have
    // drawn from r, so nothing after it moves)
    // (a stub left shorter than 2.5 m between a gap and an end goes too: it would read as a stray pile)
    const N = pts.length, gap = pts.map(([x, z]) => !solid && !rim && pathNear(x, z) < 1.0), gapped = gap.some(Boolean);
    if (gapped) for (let i = 0; i < N;) { let j = i; while (j < N && gap[j] === gap[i]) j++; if (!gap[i] && (j - i - 1) * step < 2.5) gap.fill(true, i, j); i = j; }
    const endD = new Float32Array(N);
    { let e = pinch[0] ? 0 : -1e9; for (let i = 0; i < N; i++) { if (i && gap[i - 1] && !gap[i]) e = i; endD[i] = i - e; }
      e = pinch[1] ? N - 1 : 1e9; for (let i = N - 1; i >= 0; i--) { if (i < N - 1 && gap[i + 1] && !gap[i]) e = i; endD[i] = Math.min(endD[i], e - i); } }
    if (gapped && SN.params.test) TRI.stiles = (TRI.stiles || 0) + 1;
    const prof = [[-0.5, -0.35], [-0.47, 0.45], [-0.36, 1], [0.36, 1], [0.47, 0.45], [0.5, -0.35]];
    const pos = [], uv = [], col = [], index = [], P6 = prof.length, wgeos = [], tops = [];
    let s = 0;
    const capEvery = caps ? Math.max(1, Math.round(caps / step)) : 0;
    pts.forEach(([x, z], i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], tm = Math.hypot(tx, tz) || 1, nx = -tz / tm, nz = tx / tm;
      if (i) s += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const end = Math.min(1, (endD[i] * step) / 1.25), hh = h * (0.35 + 0.65 * end) * (1 + 0.08 * SN.noise2(s * 0.7, 3.3)), y0 = H(x, z);
      tops.push(y0 + hh);
      prof.forEach(([px, py], k) => {
        const jw = w * (1 + 0.1 * SN.noise2(s * 2.1, k * 1.7)) * Math.min(1, 0.15 + end); // ends pinch shut
        pos.push(x + nx * px * jw, y0 + py * hh, z + nz * px * jw);
        uv.push((s / 2.6 + (k > 2 ? 0.37 : 0)) * uvk, k === 2 ? 0.93 : k === 3 ? 0.99 : ((py * hh + 0.35) / 1.2) * uvk);
        const ao = (k === 0 || k === P6 - 1) ? 0.55 : 1;
        col.push(ao, ao, ao);
      });
      if (i && !gap[i - 1] && !gap[i]) for (let k = 0; k < P6 - 1; k++) { const a0 = (i - 1) * P6 + k, a1 = a0 + 1, b0 = a0 + P6, b1 = b0 + 1; index.push(a0, b0, a1, a1, b0, b1); }
      if (capEvery && i && i < pts.length - 1 && i % capEvery === 0) { // upright coping stones break the line
        const cs = blob({ x: x + nx * r.range(-0.08, 0.08), y: y0 + hh + 0.05, z: z + nz * r.range(-0.08, 0.08), rx: r.range(0.2, 0.3), ry: r.range(0.1, 0.16), rz: r.range(0.16, 0.24), rot: Math.atan2(nx, nz) + r.range(-0.3, 0.3), jitter: 0.3, seed: r() * 90, ws: step > 0.6 ? 5 : 6, hs: step > 0.6 ? 3 : 4, uvScale: 1.1, col: () => { const k = r.range(0.75, 1.05); return [k, k, k]; } });
        if (!gap[i] && endD[i] > 0) wgeos.push(cs);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(index); g.computeVertexNormals(); wgeos.push(g);
    // long walls are cut into ~12 m pieces so each lands in its own sector
    for (const wg of wgeos) WB.put(wg, rim);
    // colliders: short pieces (~1.5 m) that each stop at their own stones' height, so a low wall
    // running downhill is as hoppable as a level one; a `solid` wall cannot be hopped at all. A
    // piece is also capped relative to the lower ground where the player meets it (its contact
    // line, hz + the player's radius out, on either side): across a steep slope the stones stand
    // 1.3-1.6 m above the downhill contact, out of a jump's reach, though the wall reads knee-high
    // (steeper pieces a little lower still, as uphill walking is slower and the jump's arc flatter)
    // (a low wall's box hugs its stones, so a hop has less to clear; the ring wall's stays generous)
    const every = Math.max(1, Math.round(1.5 / step)), hz = w / 2 + (solid ? 0.05 : -0.02), dc = w / 2 + 0.05 + SN.player.radius;
    if (collide) for (let i = 0, j; i < N - 1; i = j) {
      if (gap[i]) { j = i + 1; continue; }
      j = Math.min(N - 1, i + every); for (let k = i + 1; k <= j; k++) if (gap[k]) { j = k - 1; break; }
      if (j <= i) { j = i + 1; continue; }
      const [ax, az] = pts[i], [bx, bz] = pts[j], len = Math.hypot(bx - ax, bz - az);
      let top = -Infinity; for (let k = i; k <= j; k++) top = Math.max(top, tops[k]);
      top += 0.05;
      if (!solid) {
        const nx = -(bz - az) / (len || 1), nz = (bx - ax) / (len || 1);
        let lo = Infinity; for (let k = i; k <= j; k++) { const [x, z] = pts[k]; lo = Math.min(lo, H(x + nx * dc, z + nz * dc), H(x - nx * dc, z - nz * dc)); }
        const cx = (ax + bx) / 2, cz = (az + bz) / 2, sl = Math.abs(H(cx + nx * dc, cz + nz * dc) - H(cx - nx * dc, cz - nz * dc)) / (2 * dc);
        top = Math.min(top, lo + 1.05 - 0.15 * SN.smoothstep(0.3, 0.7, sl));
      }
      W.addBox({ x: (ax + bx) / 2, z: (az + bz) / 2, hx: len / 2 + 0.05, hz, rot: -Math.atan2(bz - az, bx - ax), top: solid ? Infinity : top, tag: 'wall' });
    }
    pts.forEach(([x, z], i) => { if (!gap[i]) OCC.add(x, z, w * 0.7); });
    const wl = { path, h, w, pts, gap: gapped ? gap : null, geos: wgeos }; walls.push(wl); return wl;
  }
  // split a long path into pieces of about `len` metres (so a ring wall spreads over the sectors)
  const pieces = (path, len) => { const out = []; let cur = [path[0]], acc = 0; for (let i = 1; i < path.length; i++) { acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); cur.push(path[i]); if (acc > len && i < path.length - 2) { out.push(cur); cur = [path[i]]; acc = 0; } } out.push(cur); return out; };
  const cWood = lin('#7d705c'), cWoodD = lin('#4f463a');
  function fence(path) {
    TRI.kind = 'fence';
    const posts = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1], d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(d / 2.3)), rot = -Math.atan2(bz - az, bx - ax);
      for (let k = 0; k <= n; k++) {
        if (i && !k) continue;
        const x = SN.lerp(ax, bx, k / n), z = SN.lerp(az, bz, k / n), y0 = H(x, z) - 0.2, ph = r.range(1.05, 1.25);
        const pg = piece({ x, y: y0, z, sx: 0.13, sy: ph, sz: 0.13, rot: rot + r.range(-0.2, 0.2), lean: r.range(-0.06, 0.06), col: r() < 0.5 ? cWood : cWoodD });
        put(pg); posts.push({ x, z, top: y0 + ph, geo: pg });
      }
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i], b = posts[i + 1], d = Math.hypot(b.x - a.x, b.z - a.z), rot = -Math.atan2(b.z - a.z, b.x - a.x);
      // colliders along the span in short pieces, each as high as the rails above it (hoppable
      // like the walls, even where the fence runs down a slope)
      const np = Math.max(1, Math.ceil(d / 0.6));
      for (let k = 0; k < np; k++) {
        const u0 = k / np, u1 = (k + 1) / np, x0 = SN.lerp(a.x, b.x, u0), z0 = SN.lerp(a.z, b.z, u0), x1 = SN.lerp(a.x, b.x, u1), z1 = SN.lerp(a.z, b.z, u1);
        W.addBox({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: d / np / 2 + 0.03, hz: 0.12, rot, top: Math.max(H(x0, z0), H(x1, z1)) + 0.95, tag: 'fence' });
      }
      for (const hgt of [0.45, 0.86]) {
        const ya = H(a.x, a.z) + hgt, yb = H(b.x, b.z) + hgt, g = new THREE.BoxGeometry(d + 0.1, 0.08, 0.07);
        g.rotateZ(Math.atan2(yb - ya, d) + r.range(-0.03, 0.03)); g.rotateY(rot); g.translate((a.x + b.x) / 2, (ya + yb) / 2 - 0.02, (a.z + b.z) / 2);
        SN.geo.projectUV(g, 0.9);
        const n = g.attributes.position.count, c = new Float32Array(n * 3), cc = r() < 0.5 ? cWood : cWoodD;
        for (let k = 0; k < n; k++) { c[k * 3] = cc[0]; c[k * 3 + 1] = cc[1]; c[k * 3 + 2] = cc[2]; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3)); put(g);
      }
    }
    return posts;
  }
  const along = (s0, s1, off, step = 3) => { const out = []; for (let s = s0; s <= s1 + 1e-6; s += step) { const p = roadAt(s, off); out.push([p.x, p.z]); } return out; };
  spots.wallRoad = wall(along(83, 91, -3.2));        // road wall below the painter's viewpoint
  wall(along(96, 104, -3.2));                          // (a gap to reach the cypress)
  spots.fencePosts = fence(along(96, 114, 3.3));      // fence on the valley side
  // terrace walls following the contours of the east olive grove, and field walls
  const contour = (x, z, len, dir = 1) => {
    const h0 = H(x, z), out = [[x, z]];
    for (let s = 0; s < len; s += 2) {
      const e = 0.5, gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e), gm = Math.hypot(gx, gz) || 1;
      x += (-gz / gm) * 2 * dir; z += (gx / gm) * 2 * dir;
      for (let k = 0; k < 3; k++) { const hh = H(x, z) - h0, gx2 = (H(x + e, z) - H(x - e, z)) / (2 * e), gz2 = (H(x, z + e) - H(x, z - e)) / (2 * e), g2 = gx2 * gx2 + gz2 * gz2 || 1; x -= (hh * gx2) / g2; z -= (hh * gz2) / g2; }
      out.push([x, z]);
    }
    return out;
  };
  spots.wallTerrace = wall(contour(14, 72, 32, -1), { h: 0.8 }); // terrace below the east olive grove
  wall(contour(40, -60, 30, 1), { h: 0.8 });                       // terrace below the back-right grove
  wall([[74, -14], [77, 8], [81, 31]], { h: 0.9 });          // lower edge of the east field
  wall([[-57, 44], [-60, 63], [-63, 82]], { h: 0.8 });       // lower edge of the west field
  spots.wallBack = wall(contour(-40, -66, 34, 1), { h: 0.85 }); // across the back hill, seen from the village
  // more field walls with pale coping along the contours of the back hills (seen over the roofs)
  for (const [x, z, len, dir] of [[-62, -86, 30, 1], [18, -80, 26, 1], [-30, -44, 20, -1], [62, -72, 22, 1], [-92, -40, 20, 1], [96, -30, 18, -1]]) wall(contour(x, z, len, dir), { h: 0.8, step: 0.7, caps: 2.1 });

  // ---- the boundary: a dry-stone wall all the way round, too high to hop, with a thicket behind it
  // and the terraced rim rising beyond; the road leaves through a closed field gate by a wayside cross
  const ringR = L.rimR || (a => 122.6 + 0.55 * SN.noise2(Math.cos(a) * 2.2, Math.sin(a) * 2.2) + 0.25 * Math.sin(a * 7)); // (level.js: layout.rimR)
  const R0 = roadPath(); let gs = R0[R0.length - 1].s;
  for (const p of R0) if (Math.hypot(p.x, p.z) < ringR(Math.atan2(p.z, p.x))) { gs = p.s; break; }
  const gate = roadAt(gs), gAz = Math.atan2(gate.z, gate.x), gHalf = 2.55;
  const ring = [], dA = 1.25 / 122.6, gapA = (gHalf + 0.1) / 122.6;
  for (let a = gAz + gapA; a < gAz + TAU - gapA; a += dA) { const q = ringR(a); ring.push([Math.cos(a) * q, Math.sin(a) * q]); }
  const ringWall = wall(ring, { h: 1.3, w: 0.85, caps: 0, step: 1.2, solid: true, uvk: 1.6 });
  // the thicket: hedgerows just outside the wall, broken by gaps, cypresses and brambles
  const thicket = [];
  for (let a = gAz + 0.07, k = 0; a < gAz + TAU - 0.07; k++) {
    const span = hr.range(8, 22) / 124.6, pts = [];
    if (hr() < 0.5) { const off = hr.range(5, 8.5); for (let b = a; b < Math.min(a + span, gAz + TAU - 0.07); b += 1.4 / 125) { const q = ringR(b) + off + 1.2 * Math.sin(b * 13); pts.push([Math.cos(b) * q, Math.sin(b) * q]); } if (pts.length > 3 && pts.every(([x, z]) => roadDist(x, z) > 4)) thicket.push(hedge(pts, { h: hr.range(1.3, 1.9), w: hr.range(1.4, 1.9), rim: true, collide: false })); }
    a += span + hr.range(4, 12) / 124.6;
  }
  // the gate: two stone piers, a closed five-bar gate between them, a wayside cross just inside
  {
    const nx = -gate.tz, nz = gate.tx, y0 = H(gate.x, gate.z), rot = -Math.atan2(nz, nx), cStoneP = lin('#8a93a4');
    for (const sd of [-1, 1]) {
      const px = gate.x + nx * gHalf * sd, pz = gate.z + nz * gHalf * sd, py = H(px, pz) - 0.3;
      const pier = piece({ x: px, y: py, z: pz, sx: 0.62, sy: 2.05, sz: 0.62, rot, col: cStoneP });
      WB.put(pier); WB.put(blob({ x: px, y: py + 2.12, z: pz, rx: 0.42, ry: 0.2, rz: 0.42, jitter: 0.15, seed: sd * 7, ws: 6, hs: 4, col: () => [1, 1, 1] }));
      W.addBox({ x: px, z: pz, hx: 0.36, hz: 0.36, rot, tag: 'gate' });
    }
    const gw = gHalf * 2 - 0.62, ang = rot;
    for (const [hy, sy] of [[0.25, 0.09], [0.52, 0.09], [0.79, 0.09], [1.06, 0.09], [1.33, 0.1]]) put(piece({ x: gate.x, y: y0 + hy, z: gate.z, sx: 0.06, sy, sz: gw, rot: ang + Math.PI / 2, col: cWood }));
    for (const f of [-0.48, 0.48, -0.1]) put(piece({ x: gate.x + nx * gw * f, y: y0 + 0.12, z: gate.z + nz * gw * f, sx: 0.08, sy: 1.34, sz: 0.1, rot: ang + Math.PI / 2, col: cWoodD }));
    { const g = new THREE.BoxGeometry(0.06, 0.1, Math.hypot(gw * 0.9, 1.0)); g.rotateX(Math.atan2(1.0, gw * 0.9)); g.rotateY(ang + Math.PI / 2); g.translate(gate.x, y0 + 0.78, gate.z); SN.geo.projectUV(g, 0.9);
      const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let k = 0; k < n * 3; k += 3) { c[k] = cWoodD[0]; c[k + 1] = cWoodD[1]; c[k + 2] = cWoodD[2]; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); put(g); }
    W.addBox({ x: gate.x, z: gate.z, hx: 0.2, hz: gHalf, rot: -Math.atan2(gate.tz, gate.tx), tag: 'gate' });
    // the wayside cross: a stepped stone plinth, a shaft and a small iron cross against the sky
    const cp = roadAt(gs + 3.6, -3.7), cy0 = H(cp.x, cp.z), crot = -Math.atan2(cp.tz, cp.tx);
    WB.put(piece({ x: cp.x, y: cy0 - 0.3, z: cp.z, sx: 1.1, sy: 0.62, sz: 1.1, rot: crot, col: [0.85, 0.85, 0.85] }));
    WB.put(piece({ x: cp.x, y: cy0 + 0.3, z: cp.z, sx: 0.7, sy: 0.35, sz: 0.7, rot: crot, col: [0.95, 0.95, 0.95] }));
    WB.put(piece({ x: cp.x, y: cy0 + 0.62, z: cp.z, sx: 0.26, sy: 1.9, sz: 0.26, rot: crot, col: [0.9, 0.9, 0.9] }));
    const cIron = lin('#2a2c38');
    put(piece({ x: cp.x, y: cy0 + 2.5, z: cp.z, sx: 0.07, sy: 0.9, sz: 0.07, rot: crot, col: cIron }));
    put(piece({ x: cp.x, y: cy0 + 2.95, z: cp.z, sx: 0.6, sy: 0.07, sz: 0.07, rot: crot + Math.PI / 2, col: cIron }));
    W.addCircle({ x: cp.x, z: cp.z, r: 0.75, top: cy0 + 0.6, tag: 'cross' }); // the plinth: hoppable
    W.addCircle({ x: cp.x, z: cp.z, r: 0.32, tag: 'cross' });                 // the shaft and its iron cross: never
    OCC.add(cp.x, cp.z, 1.2);
    spots.gate = { x: gate.x, z: gate.z, y0, s: gs, cross: { x: cp.x, z: cp.z, y: cy0 + 0.65 } };
  }

  // ---- the rim beyond the wall: terraces of olives (the near steps built in stone), hedgerows,
  // round trees and rows of cypresses, thinning out up the slope into the painted terraces
  const rimTrees = [];
  const rimClear = (x, z, rr) => { const q = Math.hypot(x, z); return q > 126 && q < 205 && roadNear(x, z) > 5 && OCC.free(x, z, rr); };
  for (const tr of fields.terraces) {
    if (tr.r > 141) continue;
    for (const pc of pieces(tr.pts, 16)) if (pc.length > 2 && !pc.some(([x, z]) => roadDist(x, z) < 4)) wall(pc, { h: 0.75, w: 0.62, caps: 0, step: 1.5, rim: true, collide: false });
    const Q = tr.pts;
    for (let i = 1; i < Q.length - 1; i += r.int(4, 6)) {
      const [x0, z0] = Q[i], q = Math.hypot(x0, z0), x = x0 + (x0 / q) * 2.6, z = z0 + (z0 / q) * 2.6, s = r.range(0.85, 1.1);
      if (r() < 0.25 || !rimClear(x, z, 2.1 * s) || !guard.ok(x, z, H(x, z) + 4.6 * s, false)) continue;
      rimTrees.push(oliveTree(x, z, s, { rim: true, lite: q > 131 }));
    }
  }
  // hedgerows and round-tree clusters on the open stretches of rim
  for (let a = 0; a < TAU; a += hr.range(0.12, 0.26)) {
    const q = hr.range(129, 178), x = Math.cos(a) * q, z = Math.sin(a) * q;
    if (hr() < 0.45) {
      const line = traceContour(x, z, hr.int(6, 12), 2, (px, pz) => Math.hypot(px, pz) < 127);
      if (line.length > 4 && line.every(([px, pz]) => rimClear(px, pz, 1.3)) && guard.ok(x, z, H(x, z) + 2.4)) hedge(line, { rim: true, collide: false, h: hr.range(1.6, 2.2) });
    } else {
      for (let k = 0, n = hr.int(1, 3); k < n; k++) {
        const bx = x + hr.range(-5, 5), bz = z + hr.range(-5, 5), s = hr.range(0.8, 1.15);
        if (!rimClear(bx, bz, 3 * s) || !guard.ok(bx, bz, H(bx, bz) + 8.2 * s)) continue;
        rimTrees.push(roundTree(bx, bz, s, { rim: true, lite: Math.hypot(bx, bz) > 145 }));
      }
    }
  }

  // ---- merge + materials
  const tex = SN.paint.texture({
    size: 256, base: '#c8c8c8', seed: 'landscape-props-tex', count: 1000,
    colors: [['#9c9c9c', 3], ['#f4f4f4', 3], ['#727272', 1.4], ['#b4c0dc', 1.2], ['#e6e2c0', 0.8]],
    len: [20, 46], width: [6, 11], angle: 0, jitter: 0.5, curve: 0.5, alpha: [0.85, 1], light: 0.04, bristles: 2,
  }, { key: 'landscape-props' });
  tex.colorSpace = THREE.NoColorSpace;
  const mat = patchMaterial(SN.mat.paint({ map: tex, vertexColors: true, name: 'landscape-props' }), { rim: 0.7, rimColor: '#0c1a3c', rimEdge: [0.36, 0.04], selfLit: 0.35, key: 'landscape-props' });
  const meshes = B.meshes(mat, 'landscape-props');
  // walls get their own painted dry-stone texture (courses of rounded stones, moonlit tops)
  const wmat = patchMaterial(SN.mat.paint({ map: SN.paint.texture(fitCanvas(stoneTexture()), { key: 'landscape-stones' }), vertexColors: true, name: 'landscape-walls' }), { rim: 0.55, rimColor: '#0c1a3c', rimEdge: [0.3, 0.03], selfLit: 0.4, key: 'landscape-walls' });
  const wallMeshes = WB.meshes(wmat, 'landscape-walls');
  // leaf masses: the village's leaf texture (its palette and curling strokes) for the dark trees,
  // bushes and hedges; the props' luminance strokes for the olive crowns (their colour is their own)
  const leafTex = strokeTex({
    size: 512, base: '#274650', seed: 'landscape-leaf', count: 2700, len: [34, 84], width: [9, 17], alpha: [0.78, 1], jitter: 0.35, curve: 0.6, light: 0.05,
    colors: [['#1c3566', 2], ['#294d8a', 1.3], ['#2b5956', 2.4], ['#3b6c60', 2], ['#578a72', 1.3], ['#83ab8c', 0.45], ['#b7d0b0', 0.06], ['#15283a', 1.9]],
    angle: (u, v) => 1.2 * Math.sin(TAU * (2 * u + 0.35 * Math.sin(TAU * v))) + 0.9 * Math.cos(TAU * (2 * v - 0.3 * Math.sin(TAU * 2 * u))),
  }, 'landscape-leaf');
  const crownO = { map: tex, uv: 0.95, self: 0.35, selfFar: 0, fill: 0, rim: [0.3, 0.04, 0.62, 0.1], far: [60, 160, 0.3] };
  const LEVELS = ['far', 'lo', 'hi', 'near'], NAME = { hue: 'landscape-leaf', lum: 'landscape-crowns' };
  const LM = { hue: {}, lum: {} };
  for (const level of LEVELS) { LM.hue[level] = leafMaterial({ map: leafTex, level, name: NAME.hue + '-' + level }); LM.lum[level] = leafMaterial({ ...crownO, level, name: NAME.lum + '-' + level }); }
  const leafMeshes = [...LB.hue.meshes(LM.hue.far, NAME.hue), ...LB.lum.meshes(LM.lum.far, NAME.lum)];
  // lo and hi cells: switched on only while the camera is within reach of one of their trees (their
  // crowns match the far ones, which are what the cats' sight lines test against)
  const cellMeshes = [];
  for (const [map, level] of [[LC, 'lo'], [HC, 'hi']]) for (const c of map.values()) for (const kind of ['hue', 'lum']) if (c[kind].length) {
    const g = mergeSame(c[kind]); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, LM[kind][level]); m.name = `${NAME[kind]}-${level}`;
    Object.assign(m.userData, { noOcclude: true, x0: c.x0, z0: c.z0, size: c.size, level }); m.visible = false; cellMeshes.push(m);
  }
  // near crowns: the few trees within reach of the eye get their finest level, built the first time
  // they come near (one a frame) and kept in a small cache; a pool of meshes shows them
  const NG = new Map(), cellKey = (i, j) => i * 4096 + j;
  for (const n of NEARS) { const k = cellKey(Math.floor(n.x / LOD.CELL), Math.floor(n.z / LOD.CELL)); if (!NG.has(k)) NG.set(k, []); NG.get(k).push(n); }
  const pool = Array.from({ length: LOD.NMAX }, (_, i) => { const m = new THREE.Mesh(undefined, LM.hue.near); m.name = 'landscape-leaf-near'; m.visible = false; m.userData.noOcclude = true; m.frustumCulled = true; return m; });
  const active = new Map(), cache = new Map(), NEAR_CACHE = 16;
  const nearOn = () => LEAF_U.uLodN.value.y > 0;
  const lodQ = q => {
    LEAF_U.uLod.value.set(...(q === 'low' ? [12, 18] : q === 'medium' ? [15, 22] : [LOD.R0, LOD.R1]));
    LEAF_U.uLodF.value.set(...(q === 'low' ? [40, 50] : [LOD.F0, LOD.F1]));
    LEAF_U.uLodN.value.set(...(q === 'low' ? [-2, -1] : q === 'medium' ? [5, 8] : [LOD.N0, LOD.N1])); // (no near level on low: phones)
  };
  lodQ(SN.quality); SN.on('quality', lodQ);
  const cand = [];
  SN.onUpdate(() => {
    const cp = SN.camera.position, C = LOD.CELL, RH = LEAF_U.uLod.value.y + 0.5, RL = LEAF_U.uLodF.value.y + 0.5;
    for (const m of cellMeshes) { const { x0, z0, size, level } = m.userData, R = level === 'hi' ? RH : RL, dx = Math.max(x0 - cp.x, 0, cp.x - x0 - size), dz = Math.max(z0 - cp.z, 0, cp.z - z0 - size); m.visible = dx * dx + dz * dz < R * R; }
    // near: the closest trees within N1 + 1 m (they only start to show inside N1, so a tree is
    // always handed over before it can be seen, and released only once it has handed back)
    cand.length = 0;
    const lim = LEAF_U.uLodN.value.y + 1, ci = Math.floor(cp.x / C), cj = Math.floor(cp.z / C), rc = Math.ceil(lim / C);
    if (nearOn()) for (let i = ci - rc; i <= ci + rc; i++) for (let j = cj - rc; j <= cj + rc; j++) for (const n of NG.get(cellKey(i, j)) || []) {
      const d = Math.hypot(n.c[0] - cp.x, n.c[1] - cp.y, n.c[2] - cp.z); if (d < lim) cand.push([d, n]);
    }
    cand.sort((a, b) => a[0] - b[0]); if (cand.length > LOD.NMAX) cand.length = LOD.NMAX;
    const want = new Set(cand.map(c => c[1]));
    for (const [n, m] of active) if (!want.has(n)) { m.visible = false; active.delete(n); }
    let built = 0;
    for (const [, n] of cand) {
      if (active.has(n)) continue;
      let g = cache.get(n);
      if (!g) {
        if (built++) continue; // at most one new crown a frame
        g = n.build(); g.computeBoundingSphere(); cache.set(n, g);
        if (cache.size > NEAR_CACHE) for (const [k, v] of cache) { if (!active.has(k) && k !== n) { v.dispose(); cache.delete(k); break; } }
      } else { cache.delete(n); cache.set(n, g); } // (most recently used last)
      const m = pool.find(q => !q.visible); if (!m) break;
      m.geometry = g; m.material = LM[n.kind].near; m.visible = true; active.set(n, m);
    }
    const U = LEAF_U.uNear.value; let k = 0;
    for (const n of active.keys()) U[k++].set(n.c[0], n.c[1], n.c[2]);
    for (; k < LOD.NMAX; k++) U[k].set(0, NEVER, 0);
  }, 50);
  SN.scene.add(...meshes, ...wallMeshes, ...leafMeshes, ...cellMeshes, ...pool);
  return { mesh: meshes, wallMesh: wallMeshes, leafMesh: leafMeshes, leafCells: cellMeshes, spots, trees, rounds, rocks, bushes, walls, hedges, thicket, rimTrees, stooks, OCC, guard, fields };
}

// dry-stone wall texture: rows of rounded stones in blue-greys and pale ochres, dark ultramarine
// joints, a light moonlit stroke along each stone's top. 512 x 256 = 2.6 m x 1.2 m, tiles along u.
function stoneTexture() {
  const w = 512, h = 256, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), r = SN.rng('landscape-stones');
  g.fillStyle = '#243052'; g.fillRect(0, 0, w, h);
  const cols = ['#5f6a7e', '#6c7688', '#7a8292', '#58627a', '#66707f', '#827c6c', '#505b70'];
  g.lineJoin = 'round'; g.lineCap = 'round';
  let y = h;
  while (y > 0) {
    const rh = SN.lerp(62, 92, r()), y0 = Math.max(-10, y - rh);
    let x = r() * -80;
    while (x < w) {
      const sw = SN.lerp(80, 180, r()), col = r.pick(cols), cx = x + sw / 2, cy = (y + y0) / 2;
      const poly = Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * TAU + r.range(-0.2, 0.2); return [Math.cos(a) * (sw / 2 - 2) * r.range(0.86, 1.04), Math.sin(a) * (rh / 2 - 2) * r.range(0.8, 1.02)]; });
      for (const ox of [0, -w, w]) {
        if (cx + ox + sw < 0 || cx + ox - sw > w) continue;
        g.beginPath(); poly.forEach(([px, py], k) => (k ? g.lineTo(cx + ox + px, cy + py) : g.moveTo(cx + ox + px, cy + py)));
        g.closePath(); g.fillStyle = col; g.fill();
        g.save(); g.clip();
        for (let k = 0; k < 7; k++) { // brushwork on the stone: light across the top, cool shadow low
          const top = k < 3, yy = cy + (top ? -rh * r.range(0.22, 0.4) : rh * r.range(-0.1, 0.35));
          g.strokeStyle = SN.color.shade(col, top ? r.range(0.08, 0.16) : r.range(-0.14, -0.04), 0, top ? 0 : 0.02);
          g.lineWidth = SN.lerp(6, 13, r()); g.globalAlpha = 0.75;
          g.beginPath(); g.moveTo(cx + ox - sw * r.range(0.25, 0.5), yy); g.quadraticCurveTo(cx + ox, yy + r.range(-6, 6), cx + ox + sw * r.range(0.25, 0.5), yy + r.range(-5, 5)); g.stroke();
        }
        g.restore(); g.globalAlpha = 1;
      }
      x += sw + SN.lerp(3, 7, r());
    }
    y = y0 - SN.lerp(3, 6, r());
  }
  return cv;
}

// ---------------------------------------------------------------- ground cover (instanced)
// One InstancedMesh of three crossed quads; a per-instance atlas cell picks wheat, grass, iris or
// wildflower sprites painted as strokes. Tops sway in the wind. Instances are shuffled so a lower
// quality can simply draw fewer of them.
function coverAtlas() {
  // 4 x 2 cells of 256 px: wheat, grass, iris, flower / field fringe, cornflower, bramble, (spare)
  const S = 256, cv = document.createElement('canvas'); cv.width = S * 4; cv.height = S * 2;
  const g = cv.getContext('2d'), r = SN.rng('landscape-cover-atlas');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const blade = (ox, oy, x, h, lean, w, col, alpha = 1) => { // tapered curved blade from the bottom of a cell
    const bx = ox + x, by = oy + S - 4, tx = bx + lean, ty = by - h;
    g.globalAlpha = alpha; g.fillStyle = col;
    g.beginPath(); g.moveTo(bx - w / 2, by); g.quadraticCurveTo(bx - w / 2 + lean * 0.3, by - h * 0.55, tx, ty);
    g.quadraticCurveTo(bx + w / 2 + lean * 0.3, by - h * 0.55, bx + w / 2, by); g.closePath(); g.fill();
  };
  const dab = (x, y, rx, ry, rot, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); };
  // an ear of wheat: a slim spindle of grains with bristly awns
  const ear = (x, y, ang, len, col) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let k = 0; k < 6; k++) { const t = k / 5, px = x + sa * len * t, py = y - ca * len * t; dab(px + ca * 2.2 * (k & 1 ? 1 : -1), py + sa * 2.2, 2.6, 5.2 - t * 1.6, ang, col); }
    g.strokeStyle = col; g.lineWidth = 1.1; g.globalAlpha = 0.85;
    for (let k = 0; k < 5; k++) { const t = 0.2 + k * 0.18, px = x + sa * len * t, py = y - ca * len * t, d = k & 1 ? 1 : -1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (sa * 10 + ca * 7 * d), py - (ca * 10 - sa * 7 * d)); g.stroke(); }
    g.globalAlpha = 1;
  };
  const wheatStalks = (ox, oy, n, hMin, hMax, earP) => {
    for (let i = 0; i < n; i++) {
      const x = SN.lerp(12, S - 12, r()), h = SN.lerp(hMin, hMax, r()), lean = SN.lerp(-22, 22, r());
      blade(ox, oy, x, h, lean, SN.lerp(2.5, 4.5, r()), r.pick(['#8a7038', '#a0823e', '#b89a4c', '#6f6440', '#7a8a60']));
      if (r() < earP) ear(ox + x + lean, oy + S - 4 - h + 2, Math.atan2(lean, h), SN.lerp(20, 30, r()), r.pick(['#d6b764', '#c9a650', '#e2c67c', '#b39a58', '#a8a878']));
    }
  };
  // wheat (0,0): many thin stalks with bristly ears, cooler at the foot
  wheatStalks(0, 0, 90, 150, 236, 0.8);
  for (let i = 0; i < 18; i++) blade(0, 0, SN.lerp(10, S - 10, r()), SN.lerp(40, 90, r()), SN.lerp(-10, 10, r()), 5, r.pick(['#4d6a4a', '#5b7446', '#3f5a5a']), 0.95);
  // grass (1,0): blue-green blades
  for (let i = 0; i < 46; i++)
    blade(S, 0, SN.lerp(14, S - 14, r()), SN.lerp(90, 235, r()), SN.lerp(-70, 70, r()), SN.lerp(9, 16, r()), r.pick(['#2f5a50', '#3f6f5c', '#56805f', '#2b4c5c', '#6f8c5c', '#24465a']));
  // iris (2,0): sword leaves and violet-blue flowers
  for (let i = 0; i < 16; i++) blade(S * 2, 0, SN.lerp(40, S - 40, r()), SN.lerp(120, 200, r()), SN.lerp(-40, 40, r()), SN.lerp(9, 14, r()), r.pick(['#3b6a5f', '#4d7f68', '#2e5a58', '#5c8a6a']));
  for (let i = 0; i < 4; i++) {
    const x = S * 2 + SN.lerp(60, S - 60, r()), y = SN.lerp(40, 100, r());
    g.globalAlpha = 1;
    blade(S * 2, 0, x - S * 2, S - y - 10, 0, 5, '#3f6a55');
    for (let k = 0; k < 4; k++) dab(x + Math.cos(k * 1.7) * 13, y + Math.sin(k * 1.7) * 9, 15, 9, k * 1.7, r.pick(['#3f45a8', '#5359c4', '#4a4fb0', '#6b70d4']));
    dab(x, y - 12, 9, 15, 0.2, '#7c82e2'); dab(x + 2, y + 2, 3.5, 3.5, 0, '#f0d060');
  }
  // wildflowers (3,0): thin stems, small pale blossoms
  for (let i = 0; i < 22; i++) {
    const x = SN.lerp(20, S - 20, r()), h = SN.lerp(70, 190, r()), lean = SN.lerp(-30, 30, r());
    blade(S * 3, 0, x, h, lean, 4, r.pick(['#3f6a55', '#4d7a5a']));
    const col = r.pick(['#e8ecf2', '#f0e08a', '#a9c4e8', '#e8ecf2', '#d8c8f0']);
    for (let k = 0; k < 5; k++) dab(S * 3 + x + lean + Math.cos(k * 1.7) * 7, S - 4 - h + Math.sin(k * 1.26) * 7, 5.5, 4, k * 1.26, col);
    dab(S * 3 + x + lean, S - 4 - h, 3, 3, 0, '#e8b840');
  }
  // field fringe (0,1): a few straggling stalks among blue-green grass
  for (let i = 0; i < 20; i++) blade(0, S, SN.lerp(14, S - 14, r()), SN.lerp(60, 170, r()), SN.lerp(-60, 60, r()), SN.lerp(8, 13, r()), r.pick(['#2f5a50', '#3f6f5c', '#56805f', '#2b4c5c']));
  wheatStalks(0, S, 26, 110, 200, 0.7);
  // cornflowers (1,1): wiry stems with blue star heads
  for (let i = 0; i < 16; i++) blade(S, S, SN.lerp(20, S - 20, r()), SN.lerp(60, 150, r()), SN.lerp(-30, 30, r()), SN.lerp(7, 11, r()), r.pick(['#3f6a55', '#2f5a50', '#4d7a5a']));
  for (let i = 0; i < 12; i++) {
    const x = S + SN.lerp(24, S - 24, r()), h = SN.lerp(90, 200, r()), lean = SN.lerp(-26, 26, r());
    blade(S, S, x - S, h, lean, 3.5, '#3f6a55');
    const cx = x + lean, cy = S * 2 - 4 - h, col = r.pick(['#3f5cc8', '#4a6ad8', '#3450b8', '#5a78e0']);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; dab(cx + Math.cos(a) * 8, cy + Math.sin(a) * 6, 6.5, 3, a, col); }
    dab(cx, cy, 3.5, 3.5, 0, '#2a3a8a');
  }
  // stook ears (3,1): a fan of straw stalks splaying up and out of a sheaf's tie, each ending in a
  // bristly ear; the lower third sits inside the sheaf, so only the spray shows above its crown
  { const ox = S * 3, oy = S, er = SN.rng('landscape-cover-ears');
    for (let i = 0; i < 30; i++) {
      const t = er.range(-1, 1), a = t * 0.62 + er.range(-0.08, 0.08), L = SN.lerp(150, 236, er()) * (1 - 0.18 * Math.abs(t)), bx = ox + 128 + t * 10, by = oy + S - 4;
      const tx = bx + Math.sin(a) * L, ty = by - Math.cos(a) * L, col = er.pick(['#8a7038', '#9c7e40', '#7a6a42', '#6f6a4c', '#a08a4c']);
      g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = er.range(2.2, 3.6);
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + Math.sin(a) * L * 0.45, by - Math.cos(a) * L * 0.6, tx, ty); g.stroke();
      if (er() < 0.85) ear(tx, ty + 4, a, er.range(20, 30), er.pick(['#c9ac62', '#b89c58', '#d2b872', '#a89a6a', '#9c9a78']));
    }
    g.globalAlpha = 1; }
  // bramble (2,1): dark rounded leaves on arching canes, for the feet of walls and hedges
  for (let i = 0; i < 10; i++) {
    const x0 = S * 2 + SN.lerp(20, S - 20, r()), h = SN.lerp(80, 180, r()), lean = SN.lerp(-60, 60, r());
    g.strokeStyle = '#2a3a3a'; g.lineWidth = 5; g.globalAlpha = 1;
    g.beginPath(); g.moveTo(x0, S * 2 - 4); g.quadraticCurveTo(x0 + lean * 0.3, S * 2 - 4 - h, x0 + lean, S * 2 - 4 - h * 0.6); g.stroke();
    for (let k = 0; k < 7; k++) { const t = k / 6, px = SN.lerp(x0, x0 + lean, t) + (r() - 0.5) * 20, py = S * 2 - 4 - h * (0.3 + 0.6 * Math.sin(t * Math.PI)); dab(px, py, SN.lerp(9, 15, r()), SN.lerp(6, 10, r()), r() * Math.PI, r.pick(['#1c3440', '#23433f', '#2f5454', '#16283a'])); }
  }
  g.globalAlpha = 1;
  return cv;
}
function buildGroundCover(fields, props) {
  const r = SN.rng('landscape-cover'), items = [], H = W.heightAt;
  // atlas offsets (4 x 2 cells; v is flipped)
  const CELL = { wheat: [0, 0.5], grass: [0.25, 0.5], iris: [0.5, 0.5], flower: [0.75, 0.5], fringe: [0, 0], cornflower: [0.25, 0], bramble: [0.5, 0], ears: [0.75, 0] };
  const add = (kind, x, z, w, h, tint = 1) => items.push({ kind, x, z, y: H(x, z) - 0.04, w, h, rot: r() * Math.PI, tint });
  const walkable = (x, z, road = 1.9) => { const rr = Math.hypot(x, z); return rr > 43 && rr < 121.6 && roadNear(x, z) > road; };
  const edgeDist = (poly, x, z) => { let best = Infinity; for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], vx = bx - ax, vz = bz - az, t = sat(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)); best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t)); } return best; };
  // wheat fills the fields, thinning over the last 3 m of a ragged edge; tufts straggle out past it
  for (const [fi, poly] of fields.wheat.entries()) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    for (let z = Math.min(...zs) - 3; z < Math.max(...zs) + 3; z += 0.95) for (let x = Math.min(...xs) - 3; x < Math.max(...xs) + 3; x += 0.95) {
      const jx = x + r.range(-0.4, 0.4), jz = z + r.range(-0.4, 0.4), inside = inPoly(poly, jx, jz), ed = edgeDist(poly, jx, jz);
      if (props.trees.some(t => Math.hypot(t.x - jx, t.z - jz) < 1.2)) continue;
      if (inside) {
        if (inStubble(fields, jx, jz)) { if (r() < 0.06) add('fringe', jx, jz, r.range(0.6, 0.9), r.range(0.4, 0.6), r.range(0.55, 0.75)); continue; }
        if (ed < 3 && r() > 0.35 + 0.65 * ed / 3) { if (r() < 0.5) add(r() < 0.2 ? 'cornflower' : 'fringe', jx, jz, r.range(0.7, 1.0), r.range(0.65, 0.95), r.range(0.65, 0.9)); continue; }
        add('wheat', jx, jz, r.range(0.9, 1.3), r.range(0.85, 1.2), r.range(0.58, 0.8));
        if (r() < 0.035) add('cornflower', jx + r.range(-0.3, 0.3), jz + r.range(-0.3, 0.3), r.range(0.6, 0.8), r.range(0.7, 0.95));
      } else if (ed < 2.6 && r() < 0.5 * (1 - ed / 2.6) && walkable(jx, jz, 2)) {
        const q = r(); add(q < 0.5 ? 'fringe' : q < 0.72 ? 'grass' : 'cornflower', jx, jz, r.range(0.6, 0.95), r.range(0.45, 0.8), r.range(0.7, 1.0));
      }
    }
  }
  // grass and flowers hugging the road, irises in clumps along it
  const R = roadPath();
  for (const p of R) {
    if (Math.hypot(p.x, p.z) < 41) continue;
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      const off = side * r.range(1.8, 6.5), x = p.x - p.tz * off + r.range(-0.4, 0.4), z = p.z + p.tx * off + r.range(-0.4, 0.4);
      if (!walkable(x, z)) continue;
      const q = r();
      if (q < 0.7) add('grass', x, z, r.range(0.5, 0.9), r.range(0.32, 0.6), r.range(0.8, 1.15));
      else if (q < 0.86) add('flower', x, z, r.range(0.4, 0.6), r.range(0.3, 0.5));
    }
  }
  for (let s = 6; s < R[R.length - 1].s; s += r.range(3.5, 9)) {
    const side = r.sign(), p = roadAt(s, side * r.range(2.2, 3.6));
    if (!walkable(p.x, p.z, 2)) continue;
    for (let k = 0; k < r.int(2, 4); k++) add('iris', p.x + r.range(-0.7, 0.7), p.z + r.range(-0.7, 0.7), r.range(0.7, 1.0), r.range(0.65, 0.95));
  }
  // meadows: scattered tufts, thicker around rocks, walls and bushes; none on the footpaths
  for (let i = 0; i < 1250; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 122, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!walkable(x, z, 2.2) || inWheat(fields, x, z) || pathNear(x, z) < 0.2) continue;
    add(r() < 0.88 ? 'grass' : 'flower', x, z, r.range(0.5, 0.95), r.range(0.3, 0.6), r.range(0.75, 1.1));
  }
  for (const rk of props.rocks) for (let k = 0; k < 5; k++) { const a = r() * TAU, d = rk.size * r.range(1.0, 1.6); add('grass', rk.x + Math.cos(a) * d, rk.z + Math.sin(a) * d, r.range(0.5, 0.8), r.range(0.3, 0.55)); }
  for (const wl of props.walls) {
    const q0 = Math.hypot(...wl.pts[0]), ringish = q0 > 121 && q0 < 125;
    if (q0 > 140) continue;
    wl.pts.forEach(([x, z], i) => { if (r() < (ringish ? 0.6 : 0.35)) {
      const q = Math.hypot(x, z), o = r.sign() * r.range(0.5, 0.9), k = r();
      const ox = ringish ? (x / q) * o : o * r.range(-1, 1), oz = ringish ? (z / q) * o : o * r.range(-1, 1);
      add(k < 0.6 ? 'grass' : k < 0.8 ? 'bramble' : 'iris', x + ox, z + oz, r.range(0.55, 0.9), r.range(0.35, 0.65));
      if (wl.gap && wl.gap[i]) items[items.length - 1].drop = true; // (none in a stile: dropped after the shuffle, so every draw and the order stay the same)
    } });
  }
  for (const hd of props.hedges) if (hd) for (const [x, z] of hd.pts) if (r() < 0.5) add(r() < 0.6 ? 'bramble' : 'grass', x + r.range(-1, 1), z + r.range(-1, 1), r.range(0.7, 1.1), r.range(0.5, 0.8));
  // beyond the boundary wall: rough grass and brambles, seen over the wall
  for (let i = 0; i < 420; i++) {
    const a = r() * TAU, q = r.range(123.6, 130), x = Math.cos(a) * q, z = Math.sin(a) * q;
    if (roadNear(x, z) < 2.2) continue;
    add(r() < 0.7 ? 'grass' : 'bramble', x, z, r.range(0.6, 1.0), r.range(0.4, 0.75), r.range(0.75, 1.0));
  }
  // shuffle so lower quality can draw a prefix
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  for (let i = items.length - 1; i >= 0; i--) if (items[i].drop) items.splice(i, 1);
  // the stooks' ears go in front (drawn at every quality; no draws from r, so the rest keep their order)
  const er = SN.rng('landscape-cover-stooks'), ears = [];
  for (const sk of props.stooks || []) for (const e of sk.ears) ears.push({ kind: 'ears', x: e.x, z: e.z, y: e.y, w: 0.46 * e.s * er.range(0.9, 1.1), h: 0.62 * e.s * er.range(0.9, 1.08), rot: er() * Math.PI, tint: er.range(0.92, 1.08), flat: true });
  items.unshift(...ears);

  // geometry: three crossed quads (bottom at y=0), normals up for ground-like lighting
  const pos = [], nor = [], uv = [], index = [];
  for (let q = 0; q < 3; q++) {
    const a = (q / 3) * Math.PI, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = q * 4;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  const cell = new Float32Array(items.length * 2);
  items.forEach((it, i) => { cell[i * 2] = CELL[it.kind][0]; cell[i * 2 + 1] = CELL[it.kind][1]; });
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  // the ground's slope under each card (dH/dx, dH/dz): the card is sheared onto that plane so its
  // foot follows the hillside instead of hanging in the air on its downhill side
  const grad = new Float32Array(items.length * 2);
  items.forEach((it, i) => { if (it.flat) return; const e = 0.35; grad[i * 2] = (H(it.x + e, it.z) - H(it.x - e, it.z)) / (2 * e); grad[i * 2 + 1] = (H(it.x, it.z + e) - H(it.x, it.z - e)) / (2 * e); });
  geo.setAttribute('aGrad', new THREE.InstancedBufferAttribute(grad, 2));
  const tex = SN.paint.texture(fitCanvas(coverAtlas()), { key: 'landscape-cover' });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = SN.mat.paint({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, name: 'landscape-cover' });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = SHARED.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;\nattribute vec2 aGrad;\nuniform float uTime;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * vec2(0.25, 0.5) + aCell;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    vec3 off = mat3(instanceMatrix) * vec3(transformed.x, 0.0, transformed.z);
    transformed.y += dot(aGrad, off.xz) / max(1e-3, length(instanceMatrix[1].xyz));
    float w = uv.y * uv.y;
    transformed.x += w * 0.14 * sin(uTime * 1.3 + ip.x * 0.31 + ip.z * 0.23);
    transformed.z += w * 0.08 * sin(uTime * 1.7 + ip.z * 0.29); }`);
    Object.assign(sh.uniforms, FOG_UNIFORMS);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FOG_DECL).replace('#include <fog_fragment>', FOG_GLSL)
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n  diffuseColor.a = 1.0; // the texture alpha was only a cut-out: paint, not a post mask')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.3;');
  };
  mat.customProgramCacheKey = () => 'landscape-cover-v3';
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rot);
    m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.w, it.h, it.w));
    mesh.setMatrixAt(i, m4);
    if (it.kind === 'wheat' || it.kind === 'fringe' || it.kind === 'ears') { // wheat under the moon: warm straw cooled by drifts of blue-green
      const q = 0.8 * SN.smoothstep(-0.25, 0.5, SN.noise2(it.x * 0.13 + 5, it.z * 0.13 - 2)), t = it.tint;
      mesh.setColorAt(i, c.setRGB(t * SN.lerp(0.9, 0.56, q), t * SN.lerp(0.87, 0.8, q), t * SN.lerp(0.76, 0.95, q)));
    } else mesh.setColorAt(i, c.setRGB(it.tint, it.tint, it.tint));
  });
  mesh.computeBoundingSphere();
  mesh.name = 'landscape-cover';
  const setQ = qq => { mesh.count = Math.round(items.length * COVER_SHARE(qq)); };
  setQ(SN.quality); SN.on('quality', setQ);
  SN.scene.add(mesh);
  return { mesh, items };
}

// ---------------------------------------------------------------- anchors: hiding spots for the cats
// Every seat is found by dropping a ray onto the real geometry it sits on (knee lobes, fork
// swellings, boulders, haystacks, wall tops, posts), so paws land exactly on the surface.
function buildAnchors(cyp, props, cover) {
  const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), probe = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const dropOn = (geos, x, z, fallback) => {
    let best = null;
    for (const g of [].concat(geos)) {
      probe.geometry = g; rc.set(new THREE.Vector3(x, 400, z), down);
      const hit = rc.intersectObject(probe, false)[0];
      if (hit && (!best || hit.point.y > best.y)) best = hit.point.clone();
    }
    return best || new THREE.Vector3(x, fallback ?? W.heightAt(x, z), z);
  };
  const ground = (x, z) => new THREE.Vector3(x, W.heightAt(x, z), z);
  const S = props.spots, out = [];
  const road = (x, z) => { let best = null, bd = Infinity; for (const p of roadPath()) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return best; };
  const add = (id, kind, pos, lookFrom, note, o = {}) => {
    const a = W.addAnchor({ id, kind, pos, facing: yawTo(pos.x, pos.z, lookFrom[0], lookFrom[1]), note, module: 'landscape', space: o.space ?? 0.5, surface: o.surface || 'flat', tags: o.tags, data: o.data, maxDist: o.maxDist });
    out.push(a); return a;
  };
  const H = cyp.heroInfo;
  // the hero cypress: at its foot, on the low knee (~2 m), on the high knee (~7 m)
  {
    // at the foot, on the side facing the painter's viewpoint, just outside the flared tongues
    // (a ray skimming 0.3 m over the slope, from 6 m out toward the trunk, finds the foot)
    const d = [0.496, 0.868], ox = H.x + d[0] * 6, oz = H.z + d[1] * 6, o = new THREE.Vector3(ox, W.heightAt(ox, oz) + 0.3, oz);
    const dir = new THREE.Vector3(H.x, H.yG + 0.3, H.z).sub(o), len = dir.length(); dir.normalize();
    let hitD = len;
    for (const g of H.parts) { probe.geometry = g; rc.set(o, dir); rc.far = len; const h = rc.intersectObject(probe, false)[0]; if (h && h.distance < hitD) hitD = h.distance; }
    rc.far = Infinity;
    const rr = Math.max(0, 6 - (hitD - 0.35) * Math.hypot(dir.x, dir.z));
    const bx = H.x + d[0] * rr, bz = H.z + d[1] * rr, foot = new THREE.Vector3(bx, W.heightAt(bx, bz), bz);
    add('ls-cypress-base', 'tree-base', foot, [L.start.x, L.start.z], 'at the foot of the great cypress', { tags: ['cypress'] });
    for (const kn of H.knees) {
      const p = dropOn(kn.geo, kn.x, kn.z);
      add('ls-cypress-' + kn.id, 'cypress', p, [kn.x + kn.ox * 10, kn.z + kn.oz * 10],
        kn.id === 'low' ? 'on a curling lobe of the great cypress' : 'high in a curl of the great cypress',
        { space: 0.4, surface: 'ledge', tags: ['cypress', kn.id === 'high' ? 'high' : 'low'] });
    }
  }
  // olive forks and roots
  const fork = (t, id, note, from) => add(id, 'tree-branch', dropOn(t.forkGeo, t.fork[0], t.fork[2]), from, note, { space: 0.35, surface: 'branch', tags: ['olive'] });
  const nearest = (list, x, z) => list.reduce((b, t) => (Math.hypot(t.x - x, t.z - z) < Math.hypot(b.x - x, b.z - z) ? t : b));
  { const t = S.oliveRoad, rp = road(t.x, t.z); fork(t, 'ls-olive-road', 'in the fork of an olive tree above the road', [rp.x, rp.z]); }
  { const t = nearest(props.trees.filter(t => t.grove === 0), -4, 62); fork(t, 'ls-olive-east', 'in an olive fork on the east terraces', [-6, 58]); }
  { const t = nearest(props.trees.filter(t => t.grove === 1), 0, 0); fork(t, 'ls-olive-west', 'in an olive fork across the west valley', [0, 0]); }
  { const t = nearest(props.trees.filter(t => t.grove === 2), 0, 0), dx = -t.x, dz = -t.z, m = Math.hypot(dx, dz), x = t.x + (dx / m) * 0.78 * t.s, z = t.z + (dz / m) * 0.78 * t.s;
    add('ls-olive-roots', 'tree-base', ground(x, z), [0, 0], 'between the roots of an olive, behind town', { tags: ['olive'] }); }
  // haystacks, wheat and sheaves
  // (the stack's apex is a degenerate point a centred ray slips through: use its known top)
  const hayTop = h => new THREE.Vector3(h.x, h.top - 0.02, h.z);
  add('ls-haystack-east', 'haystack', hayTop(S.hayEast), [60, 8], 'on top of a haystack in the east wheat field', { space: 0.6, tags: ['wheat'] });
  add('ls-haystack-west', 'haystack', hayTop(S.hayWest), [-52, 56], 'on the haystack in the west wheat field', { space: 0.6, tags: ['wheat'] });
  add('ls-wheat-east', 'field', ground(84.5, 6), [66, 6], 'half hidden in the east field\'s wheat', { space: 0.6, tags: ['wheat', 'hidden'] });
  { const a = S.sheaves[2], b = S.sheaves[3], x = (a.x + b.x) / 2 + 0.2, z = (a.z + b.z) / 2 + 0.9;
    add('ls-sheaf-west', 'field', ground(x, z), [-52, 60], 'between the sheaves in the west wheat field', { space: 0.5, tags: ['wheat'] }); }
  // rocks
  add('ls-rock-stargazer', 'rock', dropOn(S.crestBack.geo, S.crestBack.x, S.crestBack.z), [0, 0], 'on a crest boulder, gazing at the stars', { space: 0.5, tags: ['crest', 'stargazer'], data: { gaze: 'sky' } });
  add('ls-rock-hilltop', 'rock', dropOn(S.crestEast.geo, S.crestEast.x, S.crestEast.z), [0, 92], 'on the rocks atop the painter\'s hill', { space: 0.5, tags: ['crest'] });
  { const rk = S.rockRoad, rp = road(rk.x, rk.z); add('ls-rock-road', 'rock', dropOn(rk.geo, rk.x, rk.z), [rp.x, rp.z], 'on a boulder beside the road', { space: 0.45 }); }
  // wall tops and a fence post
  const wallTop = (wl, f, id, note, from) => { const [x, z] = wl.pts[Math.round((wl.pts.length - 1) * f)]; return add(id, 'wall-top', dropOn(wl.geos, x, z), from, note, { space: 0.35, surface: 'wall' }); };
  { const [x, z] = S.wallRoad.pts[Math.round(S.wallRoad.pts.length / 2)], rp = road(x, z); wallTop(S.wallRoad, 0.5, 'ls-wall-road', 'on the dry-stone wall along the road', [rp.x, rp.z]); }
  wallTop(S.wallTerrace, 0.62, 'ls-wall-terrace', 'on a terrace wall among the olive trees', [28, 52]);
  wallTop(S.wallBack, 0.45, 'ls-wall-back', 'on the stone wall on the back hill', [-18, -40]);
  { const post = S.fencePosts[3], rp = road(post.x, post.z); add('ls-fence-post', 'ledge', dropOn(post.geo, post.x, post.z), [rp.x, rp.z], 'on a fence post by the road', { space: 0.25, surface: 'post' }); }
  // by the road: among the irises, beside a bush; at the foot of a small cypress
  { const iris = cover.items.filter(it => it.kind === 'iris').map(it => ({ it, rp: road(it.x, it.z) })).filter(o => o.rp.s > 60 && o.rp.s < 100)[0];
    if (iris) { const { it, rp } = iris, dx = rp.x - it.x, dz = rp.z - it.z, m = Math.hypot(dx, dz) || 1; add('ls-road-irises', 'ground', ground(it.x + (dx / m) * 0.45, it.z + (dz / m) * 0.45), [rp.x, rp.z], 'among the irises at the roadside', { space: 0.5, tags: ['flowers'] }); } }
  // (tucked in under the rim of the bush's main clump, on the road side: 0.78 of its radius out the
  // clump's underside is ~0.5 m over the grass, so the curled cat lies in its shadow, not in the open)
  { const b = S.bush, rp = road(b.x, b.z), dx = rp.x - b.x, dz = rp.z - b.z, m = Math.hypot(dx, dz) || 1, k = b.s * 0.78; add('ls-bush', 'garden', ground(b.x + (dx / m) * k, b.z + (dz / m) * k), [rp.x, rp.z], 'under a dark bush by the village edge', { space: 0.5 }); }
  { const c = cyp.smalls[0], dx = 40 - c.x, dz = 20 - c.z, m = Math.hypot(dx, dz), rr = c.H * 0.105 * 1.05 + 0.3;
    add('ls-small-cypress', 'tree-base', ground(c.x + (dx / m) * rr, c.z + (dz / m) * rr), [40, 20], 'at the foot of a little cypress', { tags: ['cypress'] }); }
  // the boundary: on top of a gate pier, on the step of the wayside cross
  if (S.gate) {
    const g = S.gate, nx = -roadAt(g.s).tz, nz = roadAt(g.s).tx, px = g.x + nx * 2.55, pz = g.z + nz * 2.55, look = roadAt(g.s + 8);
    add('ls-gate-pier', 'wall-top', new THREE.Vector3(px, W.heightAt(px, pz) - 0.3 + 2.32, pz), [look.x, look.z], 'on a pier of the field gate', { space: 0.3, surface: 'post', tags: ['edge'] });
    const c = g.cross, q = roadAt(g.s + 3.6), dx = q.x - c.x, dz = q.z - c.z, m = Math.hypot(dx, dz) || 1;
    add('ls-wayside-cross', 'ledge', new THREE.Vector3(c.x + (dx / m) * 0.2, c.y, c.z + (dz / m) * 0.2), [c.x + (dx / m) * 6, c.z + (dz / m) * 6], 'on the step of the wayside cross', { space: 0.35, tags: ['edge'] });
  }
  return out;
}