// 30-town.js — the village of Saint-Rémy as Vincent painted it (module 'town', order 30).
//
// Owns: ~44 houses in crooked clusters along lanes that radiate from the square, the church
// with its needle spire, the square (well, benches, cart, lanterns, a plane tree), garden
// walls, dark round trees, outside stone stairs, lane ribbons, flower boxes, pots, barrels,
// shop signs, a washing line — plus their colliders and ~49 cat hiding spots (anchors).
//
// How it is built
// - Layout: lanes are hand-drawn polylines (Chaikin-smoothed) radiating from the square;
//   houses are dropped around the square, along both sides of each lane (front facing the
//   lane, often in terraced rows) and into the gaps behind, each footprint validated against
//   lanes, the square, the church and the other houses. Every random choice comes from
//   SN.rng('town...'), so the village is identical on every load.
// - Geometry is emitted face by face into Builders (one per material), each becoming ONE
//   merged mesh: walls, roofs, trim (doors, shutters, sills, props), glow (lit windows,
//   lantern glass), trees, ground (lane / square ribbons) and spill (warm light pools):
//   7 draw calls in all.
// - A shader patch on the lit materials (onBeforeCompile on SN.mat.paint materials):
//     ink  — every face carries per-vertex distances to its own edges (exact inside a
//            convex planar polygon), so the fragment shader draws a wobbling ultramarine
//            outline of roughly constant screen width, with a lighter band inside it;
//     lamp — warm light from up to 14 lanterns (uniform array, gently flickering) plus a
//            faint blue night fill so shadowed walls stay mid-value blue, as in the painting;
//     rim  — trees: strokes mapped triplanar in world space, a faint self-light (dimmer far away)
//            so the shaded side stays blue-green, and a thin dark silhouette rim with a paler
//            contour band instead of edge ink.
// - Trees are clumps of noise-displaced lobes with curling tufts; their colliders are sized from
//   the foliage the eye can actually reach (standing or jumping), so the camera never enters it.
// - The spire height adapts to the landscape: its tip is raised until, seen from the
//   painter's viewpoint, it pierces the skyline of the hills behind it (clamped 28–42 m).
// - Every upward-facing triangle is also bucketed in a coarse XZ grid, so anchors are
//   snapped exactly onto the surface they sit on (exported as topAt / surfaceNormal).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

(window.SN_MODULES ||= []).push({
  name: 'town', level: 'starry-night',
  order: 30,
  async build(SN) {
    const T0 = performance.now();
    const { palette: P, world: W } = SN;
    const LAY = W.layout, SQ = LAY.square, CH = LAY.church, VIL = LAY.village;
    const hAt = (x, z) => W.heightAt(x, z);
    const V3 = THREE.Vector3, UP = new V3(0, 1, 0), TAU = Math.PI * 2;
    const { clamp, lerp, smoothstep } = SN;
    const { shade } = SN.color;
    const R = SN.rng('town');
    const colCache = new Map();
    const lin = hex => { // sRGB hex -> cached linear THREE.Color (never mutate the result)
      if (hex && hex.isColor) return hex;
      let c = colCache.get(hex);
      if (!c) colCache.set(hex, (c = new THREE.Color(hex)));
      return c;
    };
    const yawOf = (fx, fz) => Math.atan2(-fx, -fz); // SN yaw that looks along (fx, fz)
    const START = { x: LAY.start.x, z: LAY.start.z };
    const SQ_R = 8.8;                                // cobbled radius of the square

    // village colours (sRGB hex; palette first, a few night-shaded extras)
    const C = {
      stone: '#9ea6b2', stoneDark: '#6e7688', stoneLight: '#b9c0c8', iron: '#1c2238',
      wood: '#5a4a3c', woodBlue: '#3f5a7a', terracotta: '#9a5a3e', sack: '#9c8a62',
      darkGlass: '#1a2957', water: '#0d1836', trunk: '#2e2a36',
      church: '#5a6b8c', churchLight: '#7788a6', spire: '#2a3558',
    };

    // ============================================================ surface grid (anchor snapping)
    // Every upward-facing triangle is bucketed on a 3 m XZ grid; topAt(x, z, maxY) returns the
    // highest town surface at (x, z) at or below maxY (or null when there is none).
    const SG_CELL = 3, sgMap = new Map(), sgTri = [];
    function sgInsert(a, b, c) {
      const i = sgTri.length;
      sgTri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / SG_CELL), x1 = Math.floor(Math.max(a.x, b.x, c.x) / SG_CELL);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / SG_CELL), z1 = Math.floor(Math.max(a.z, b.z, c.z) / SG_CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = ix + ',' + iz;
        let l = sgMap.get(k); if (!l) sgMap.set(k, (l = [])); l.push(i);
      }
    }
    let topTri = -1; // triangle offset of the last topAt() hit (for surfaceNormal)
    function topAt(x, z, maxY = Infinity, minY = -Infinity) {
      const l = sgMap.get(Math.floor(x / SG_CELL) + ',' + Math.floor(z / SG_CELL));
      topTri = -1;
      if (!l) return null;
      let best = null;
      const t = sgTri;
      for (const i of l) {
        const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-10) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-5 || l2 < -1e-5 || l3 < -1e-5) continue;
        const y = l1 * ay + l2 * by + l3 * cy;
        if (y <= maxY + 1e-4 && y >= minY && (best === null || y > best)) { best = y; topTri = i; }
      }
      return best;
    }
    // surfaceNormal(x, z, maxY): unit normal [x, y, z] of the surface topAt() finds there
    function surfaceNormal(x, z, maxY = Infinity) {
      if (topAt(x, z, maxY) == null) return null;
      const t = sgTri, i = topTri;
      const e1 = new V3(t[i + 3] - t[i], t[i + 4] - t[i + 1], t[i + 5] - t[i + 2]), e2 = new V3(t[i + 6] - t[i], t[i + 7] - t[i + 1], t[i + 8] - t[i + 2]);
      const n = e1.cross(e2).normalize(); if (n.y < 0) n.negate();
      return n.toArray().map(v => +v.toFixed(4));
    }

    // ============================================================ mesh builder
    // Accumulates non-indexed triangles with position / normal / uv / color plus the ink
    // attributes: edge (vec4 distances to up to four inked face edges) and inkp (line
    // strength, light-band strength).
    const _n = new V3(), _u = new V3(), _v = new V3(), _e = new V3(), _d = new V3();
    class Builder {
      constructor(surf = true) { this.surf = surf; this.pos = []; this.nor = []; this.uv = []; this.col = []; this.edge = []; this.inkp = []; }
      get triangles() { return this.idx ? this.idx.length / 3 : this.pos.length / 9; }
      // face(pts, color, o): convex planar polygon, CCW seen from outside, fan-triangulated.
      //   o.uvScale texture repeats per metre (planar; u runs horizontally along the face)
      //   o.uAxis   u direction for horizontal faces     o.uvOff [du, dv] (default random)
      //   o.uvs     explicit per-vertex [u, v] (atlas cells)
      //   o.edges   indices of the polygon edges to ink (max 4; default all when <= 4)
      //   o.ink     ink line strength (0 = none)          o.band lighter band inside the line
      //   o.colors  per-vertex colours (override color)
      face(pts, color, o = {}) {
        if (this.idx) throw new Error('town Builder: face() on an indexed (canopy) builder');
        const k = pts.length;
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < k; i++) { // Newell normal (robust for slightly non-planar quads)
          const p = pts[i], q = pts[(i + 1) % k];
          nx += (p.y - q.y) * (p.z + q.z); ny += (p.z - q.z) * (p.x + q.x); nz += (p.x - q.x) * (p.y + q.y);
        }
        const n = _n.set(nx, ny, nz);
        if (n.lengthSq() < 1e-14) return;
        n.normalize();
        const u = _u;
        if (o.uAxis) u.copy(o.uAxis); else if (Math.abs(n.y) > 0.96) u.set(1, 0, 0); else u.crossVectors(UP, n);
        u.addScaledVector(n, -u.dot(n));
        if (u.lengthSq() < 1e-8) u.set(0, 0, 1).addScaledVector(n, -n.z);
        u.normalize();
        const v = _v.crossVectors(n, u);
        const s = o.uvScale ?? 0.3, off = o.uvOff || [R() * 7, R() * 7];
        const ink = o.ink ?? 1, band = o.band ?? 0.28;
        const E = ink ? (o.edges || (k <= 4 ? [0, 1, 2, 3].slice(0, k) : [0, 1, 2, 3])) : [];
        const D = [];
        for (let i = 0; i < k; i++) { // distance of every vertex to every inked edge line
          const p = pts[i], d = [99, 99, 99, 99];
          for (let j = 0; j < E.length && j < 4; j++) {
            const a = pts[E[j]], b = pts[(E[j] + 1) % k];
            _e.subVectors(b, a); const len = _e.length(); if (len < 1e-6) continue; _e.multiplyScalar(1 / len);
            _d.subVectors(p, a); _d.addScaledVector(_e, -_d.dot(_e)); d[j] = _d.length();
          }
          D.push(d);
        }
        const c1 = o.colors ? null : lin(color);
        const nxv = n.x, nyv = n.y, nzv = n.z, ux = u.x, uy = u.y, uz = u.z, vx = v.x, vy = v.y, vz = v.z;
        for (let i = 1; i < k - 1; i++) {
          for (let m = 0; m < 3; m++) {
            const j = m === 0 ? 0 : m === 1 ? i : i + 1, p = pts[j];
            this.pos.push(p.x, p.y, p.z); this.nor.push(nxv, nyv, nzv);
            if (o.uvs) this.uv.push(o.uvs[j][0], o.uvs[j][1]);
            else this.uv.push((p.x * ux + p.y * uy + p.z * uz) * s + off[0], (p.x * vx + p.y * vy + p.z * vz) * s + off[1]);
            const cc = c1 || lin(o.colors[j]); this.col.push(cc.r, cc.g, cc.b);
            const d = D[j]; this.edge.push(d[0], d[1], d[2], d[3]); this.inkp.push(ink, band);
          }
          if (this.surf && nyv > 0.08) sgInsert(pts[0], pts[i], pts[i + 1]);
        }
      }
      // mesh(geo, colorAt, o): append an arbitrary geometry already in world space (trees, blobs)
      mesh(geo, colorAt, o = {}) {
        if (this.idx) throw new Error('town Builder: mesh() on an indexed (canopy) builder');
        const g = geo.index ? geo.toNonIndexed() : geo;
        const p = g.attributes.position, nn = g.attributes.normal;
        const s = o.uvScale ?? 0.4, off = o.uvOff || [R() * 7, R() * 7], tmp = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = nn.getX(i), ny = nn.getY(i), nz = nn.getZ(i);
          this.pos.push(x, y, z); this.nor.push(nx, ny, nz);
          const hu = Math.abs(nx) > Math.abs(nz) ? z * Math.sign(nx || 1) : -x * Math.sign(nz || 1);
          this.uv.push(hu * s + off[0], y * s + off[1]);
          const c = colorAt(x, y, z, nx, ny, nz, tmp); this.col.push(c.r, c.g, c.b);
          this.edge.push(99, 99, 99, 99); this.inkp.push(o.ink ?? 0, o.band ?? 0);
        }
        if (this.surf) {
          const a = new V3(), b = new V3(), c = new V3(), e1 = new V3(), e2 = new V3();
          for (let i = 0; i + 2 < p.count; i += 3) {
            a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
            e1.subVectors(b, a).cross(e2.subVectors(c, a));
            if (e1.y > 0.3 * e1.length()) sgInsert(a, b, c);
          }
        }
      }
      // meshIdx(geo, cols): an indexed world-space geometry plus a linear colour per vertex
      // (canopies: no uv or ink needed; the tree shader maps its strokes triplanar). Kept indexed —
      // a builder fed only this way (the canopies) makes an indexed geometry: each smooth lobe
      // vertex is shared by ~6 triangles, so this is ~1/6 of the vertex buffers of a triangle soup
      // (the same vertices, drawn identically).
      meshIdx(geo, cols) {
        const p = geo.attributes.position.array, n = geo.attributes.normal.array, ix = geo.index.array;
        const { pos, nor, uv, col, edge, inkp } = this, idx = this.idx || (this.idx = []);
        if (idx.length === 0 && pos.length) throw new Error('town Builder: meshIdx after non-indexed faces');
        const remap = new Int32Array(p.length / 3).fill(-1); // only the vertices the kept triangles use
        for (let k = 0; k < ix.length; k++) {
          const v = ix[k];
          if (remap[v] < 0) {
            const i = v * 3; remap[v] = pos.length / 3;
            pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); uv.push(0, 0);
            col.push(cols[i], cols[i + 1], cols[i + 2]); edge.push(99, 99, 99, 99); inkp.push(0, 0);
          }
          idx.push(remap[v]);
        }
      }
      geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        g.setAttribute('edge', new THREE.Float32BufferAttribute(this.edge, 4));
        g.setAttribute('inkp', new THREE.Float32BufferAttribute(this.inkp, 2));
        if (this.idx) g.setIndex(this.idx);
        g.computeBoundingSphere(); g.computeBoundingBox();
        return g;
      }
    }
    const B = { wall: new Builder(), roof: new Builder(), trim: new Builder(), glow: new Builder(false), tree: new Builder(false) }; // canopies never carry anchors

    // ------------------------------------------------------------ primitive helpers
    // A frame F(x, y, z) -> world V3 must be right-handed (x right, y up, z out/front).
    const frame = (ox, oy, oz, rot) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      return (x, y, z) => new V3(ox + x * c + z * s, oy + y, oz - x * s + z * c);
    };
    const BOX_FACES = {
      front: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
      back: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
      right: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
      left: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
      top: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
      bottom: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    };
    // boxF: a box spanning [x0,x1] x [y0,y1] x [z0,z1] in frame F. o.skip lists faces to omit
    // (default: bottom); o.foot darkens the bottom vertices of the side faces (contact shade).
    function boxF(F, x0, x1, y0, y1, z0, z1, color, Bd, o = {}) {
      const skip = o.skip || ['bottom'], X = [x0, x1], Y = [y0, y1], Z = [z0, z1], cn = {};
      const corner = (i, j, k) => (cn[i + 2 * j + 4 * k] ||= F(X[i], Y[j], Z[k]));
      const uTop = F(x1, y1, z0).sub(F(x0, y1, z0));
      const cc = lin(color), dk = o.foot != null ? cc.clone().multiplyScalar(o.foot) : null;
      for (const name in BOX_FACES) {
        if (skip.includes(name)) continue;
        const idx = BOX_FACES[name], pts = idx.map(([i, j, k]) => corner(i, j, k));
        const side = name !== 'top' && name !== 'bottom';
        const colors = dk && side ? idx.map(([, j]) => (j ? cc : dk)) : null;
        Bd.face(pts, cc, { ...o, colors, uAxis: side ? o.uAxis : uTop });
      }
    }
    // beam: a box between world points a and b (w = horizontal width, h = height)
    function beam(Bd, a, b, w, h, color, o = {}) {
      const dir = new V3().subVectors(b, a), L = dir.length(); if (L < 1e-4) return;
      dir.multiplyScalar(1 / L);
      let side = new V3().crossVectors(dir, UP); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      const up2 = new V3().crossVectors(side, dir);
      const F = (x, y, z) => a.clone().addScaledVector(dir, x).addScaledVector(up2, y).addScaledVector(side, z);
      boxF(F, 0, L, -h / 2, h / 2, -w / 2, w / 2, color, Bd, { skip: [], ...o });
    }
    // ring: cylinder side around the frame's y axis (inked top & bottom); r1 = top radius
    function ring(Bd, F, rad, y0, y1, seg, color, o = {}) {
      const r1 = o.r1 ?? rad, a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU;
      const p = (t, rr, y) => F(rr * Math.cos(t), y, -rr * Math.sin(t));
      for (let i = 0; i < seg; i++) {
        const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
        let q = [p(t0, rad, y0), p(t1, rad, y0), p(t1, r1, y1), p(t0, r1, y1)];
        if (o.inward) q = [q[1], q[0], q[3], q[2]];
        Bd.face(q, color, { ...o, edges: o.edges || [0, 2] });
      }
    }
    function disc(Bd, F, rad, y, seg, color, o = {}) {
      const c = F(0, y, 0);
      for (let i = 0; i < seg; i++) {
        const t0 = (TAU * i) / seg, t1 = (TAU * (i + 1)) / seg;
        const a = F(rad * Math.cos(t0), y, -rad * Math.sin(t0)), b = F(rad * Math.cos(t1), y, -rad * Math.sin(t1));
        Bd.face(o.down ? [c, b, a] : [c, a, b], color, { ...o, edges: [1] });
      }
    }
    function annulus(Bd, F, r0, r1, y, seg, color, o = {}) {
      const p = (t, rr) => F(rr * Math.cos(t), y, -rr * Math.sin(t));
      for (let i = 0; i < seg; i++) {
        const t0 = (TAU * i) / seg, t1 = (TAU * (i + 1)) / seg;
        const q = [p(t0, r1), p(t1, r1), p(t1, r0), p(t0, r0)];
        Bd.face(o.down ? q.reverse() : q, color, { ...o, edges: [0, 2] });
      }
    }
    // unit lumpy blob (indexed, so displaced copies get smooth normals)
    const BLOBS = [0, 1, 2, 3, 4].map(d => mergeVertices(new THREE.IcosahedronGeometry(1, d).deleteAttribute('normal').deleteAttribute('uv')));
    function blob(Bd, cx, cy, cz, rx, ry, rz, seed, colorAt, lump = 0.16, detail = 1) {
      const g = BLOBS[detail].clone(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + lump * SN.noise2(x * 1.6 + seed, z * 1.6 + y * 1.1 - seed) + lump * 0.5 * SN.noise2(y * 3.1 - seed, x * 2.7 + z);
        p.setXYZ(i, cx + x * rx * k, cy + y * ry * k, cz + z * rz * k);
      }
      g.computeVertexNormals();
      Bd.mesh(g, colorAt, { uvScale: 0.45 });
    }

    // ============================================================ materials: ink + lantern light
    const NL = 14; // lantern lights evaluated per fragment
    const TREE_SELF = 0.24, TREE_UV = 0.42; // tree self-light; stroke texture repeats per metre
    const U = {
      uInk: { value: lin(P.outline) },
      uLamp: { value: Array.from({ length: NL }, () => new THREE.Vector4(0, -1e4, 0, 0.001)) },
      uLampCol: { value: new THREE.Color('#ffb85a').multiplyScalar(0.85) },
      uTime: { value: 0 },
      uFill: { value: new THREE.Color('#5a78c8').multiplyScalar(0.16) },
    };
    const VERT_PARS = `
attribute vec4 edge;
attribute vec2 inkp;
varying vec4 vEdge;
varying vec2 vInkp;
varying vec2 vFuv;
varying vec3 vTw;
varying vec3 vTn;`;
    const VERT_MAIN = `
vEdge = edge; vInkp = inkp; vFuv = uv;
vTw = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTn = normalize(mat3(modelMatrix) * objectNormal);`;
    const FRAG_PARS = `
uniform vec3 uInk;
uniform vec4 uLamp[${NL}];
uniform vec3 uLampCol;
uniform float uTime;
uniform vec3 uFill;
varying vec4 vEdge;
varying vec2 vInkp;
varying vec2 vFuv;
varying vec3 vTw;
varying vec3 vTn;`;
    const FRAG_MAIN = `
{
  // warm lantern light (inverse-square-ish falloff, soft wrap, gentle flicker)
  vec3 tn = normalize(vTn);
  float lampSum = 0.0;
  for (int i = 0; i < ${NL}; i++) {
    vec4 lp = uLamp[i];
    vec3 dv = lp.xyz - vTw;
    float dd = length(dv);
    float f = clamp(1.0 - dd / lp.w, 0.0, 1.0);
    float ndl = clamp(dot(tn, dv / max(dd, 1e-3)), 0.0, 1.0) * 0.8 + 0.2;
    lampSum += f * f * ndl * (1.0 + 0.06 * sin(uTime * 8.3 + float(i) * 2.1) + 0.04 * sin(uTime * 19.0 + float(i)));
  }
  outgoingLight += diffuseColor.rgb * (uLampCol * lampSum + uFill);
#ifdef TOWN_INK
  // painted outline: distance to the nearest inked face edge vs a wobbling, distance-scaled width
  float dE = min(min(vEdge.x, vEdge.y), min(vEdge.z, vEdge.w));
  float wob = 0.8 + 0.22 * sin(vFuv.x * 9.0 + 2.0 * sin(vFuv.y * 5.3)) + 0.18 * sin(vFuv.y * 11.0 + 1.7 * sin(vFuv.x * 4.1));
  float wInk = (0.045 + 0.0026 * length(vViewPosition)) * vInkp.x * wob;
  float aa = fwidth(dE) + 1e-4;
  float inkA = (1.0 - smoothstep(wInk - aa, wInk + aa, dE)) * step(0.001, vInkp.x);
  float band = smoothstep(wInk, wInk + aa, dE) * (1.0 - smoothstep(wInk * 1.6, wInk * 3.2, dE));
  outgoingLight *= 1.0 + vInkp.y * band;
  outgoingLight = mix(outgoingLight, uInk, inkA);
#endif
#ifdef TOWN_RIM
  // trees glow faintly from within (like the landscape's bushes and cypress) so the shaded side and
  // the underside stay a dark blue-green built of strokes, never a black hole
  // (a little less far away, so from the painter's hill they still read as dark masses)
  outgoingLight += diffuseColor.rgb * ${TREE_SELF.toFixed(3)} * (1.0 - 0.5 * smoothstep(20.0, 70.0, length(vViewPosition)));
  // a thin wobbling ultramarine silhouette (and around each clump) with a paler contour band inside
  float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
  float rimW = 0.12 + 0.05 * sin(vTw.x * 2.3 + vTw.y * 1.7) * sin(vTw.z * 2.1 - vTw.y * 1.3);
  float rimA = 1.0 - smoothstep(rimW * 0.5, rimW, facing);
  float rimBand = smoothstep(rimW * 0.5, rimW, facing) * (1.0 - smoothstep(rimW, rimW * 2.4, facing));
  outgoingLight *= 1.0 + 0.3 * rimBand;
  outgoingLight = mix(outgoingLight, uInk, rimA * 0.85);
#endif
}`;
    // tree strokes: triplanar in world space, so the curls keep one size on every lobe and tuft
    // (no stretched bands on the tops of the canopies, no seams)
    const MAP_TRI = `
#ifdef TOWN_RIM
{
  vec3 tpw = pow(abs(normalize(vTn)), vec3(4.0)); tpw /= (tpw.x + tpw.y + tpw.z);
  vec3 tpp = vTw * ${TREE_UV.toFixed(3)};
  vec4 tpc = texture2D(map, tpp.zy + vec2(0.37, 0.11)) * tpw.x + texture2D(map, tpp.xz + vec2(0.71, 0.53)) * tpw.y + texture2D(map, tpp.xy) * tpw.z;
  diffuseColor *= tpc;
}
#else
#include <map_fragment>
#endif`;
    function townMat(kind, o = {}) {
      const m = SN.mat.paint({ vertexColors: true, ...o });
      m.defines = { ...(m.defines || {}), ['TOWN_' + kind.toUpperCase()]: '' };
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>' + VERT_PARS)
          .replace('#include <fog_vertex>', '#include <fog_vertex>' + VERT_MAIN);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>' + FRAG_PARS)
          .replace('#include <map_fragment>', MAP_TRI)
          .replace('#include <opaque_fragment>', FRAG_MAIN + '\n#include <opaque_fragment>');
      };
      m.customProgramCacheKey = () => 'town-' + kind;
      m.name = 'town-' + kind;
      return m;
    }

    // ------------------------------------------------------------ textures (painted once, cached)
    // at this device's texture size (SN.texSize: half on phones and other constrained devices, safe
    // mode held at half too — see the landscape's texScale; ≤ 256 px kept), stroke lengths, widths
    // and counts scaled with it so the brushwork keeps its look
    const tex = (key, o) => {
      const size = o.size || 256, s = size > 256 ? Math.min(1, Math.max(0.5, SN.texSize(size) / size)) : 1;
      const sc = v => v && [v[0] * s, v[1] * s];
      const q = s < 1 ? { ...o, size: Math.round(size * s), len: sc(o.len), width: sc(o.width), count: o.count && Math.round(o.count * s * s) } : o;
      return SN.paint.texture({ seed: SN.hashStr('town-' + key) % 99991, ...q }, { key: 'town-' + key });
    };
    const TX = {
      wall: tex('wall', { size: 512, base: '#c6ccd4', colors: [['#dfe4ea', 3], ['#c0cad8', 3], ['#d8d3c0', 1.5], ['#bccfc8', 1.5], ['#aab6c8', 2], ['#efebe1', 1]], count: 2100, len: [50, 135], width: [9, 16], alpha: [0.7, 0.95], angle: 0, jitter: 0.1, curve: 0.16, light: 0.04 }),
      roof: tex('roof', { size: 512, base: '#a6aec0', colors: [['#c3cad6', 2], ['#98a3b9', 3], ['#b8b3a6', 0.8], ['#8792ab', 2], ['#d2d6de', 1]], count: 2100, len: [50, 130], width: [10, 18], alpha: [0.7, 0.95], angle: 0, jitter: 0.2, curve: 0.18, light: 0.04 }),
      trim: tex('trim', { size: 256, base: '#b6bcc8', colors: [['#e4e8ee', 2], ['#98a2b6', 2], ['#cfd4dc', 2], ['#7f8aa0', 1]], count: 900, len: [20, 56], width: [5, 10], angle: Math.PI / 2, jitter: 0.18 }),
      // the canopies' hue lives here (vertex colours only carry the light): deep teal ground,
      // curling commas of ultramarine, teal, moonlit green and a few pale highlights
      tree: tex('tree', {
        size: 512, base: '#274650', count: 2700, len: [34, 84], width: [9, 17], alpha: [0.78, 1], jitter: 0.35, curve: 0.6, light: 0.05,
        colors: [['#1c3566', 2], ['#294d8a', 1.3], ['#2b5956', 2.4], ['#3b6c60', 2], ['#578a72', 1.3], ['#83ab8c', 0.6], ['#b7d0b0', 0.15], ['#15283a', 1.9]],
        angle: (u, v) => 1.2 * Math.sin(TAU * (2 * u + 0.35 * Math.sin(TAU * v))) + 0.9 * Math.cos(TAU * (2 * v - 0.3 * Math.sin(TAU * 2 * u))),
      }),
      ground: tex('ground', { size: 512, base: '#908f88', colors: [['#a4a295', 2], ['#86888c', 2.5], ['#9a9a94', 2], ['#7e8288', 1.5], ['#aaa392', 1]], count: 2000, len: [22, 56], width: [8, 15], alpha: [0.6, 0.9], angle: 0, jitter: 0.35, curve: 0.3 }),
    };
    // lit-window atlas: 2x2 cells of warm dabs — cross mullion, six panes, curtains, lantern glass
    function paintGlow() {
      const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S * 2;
      const g = cv.getContext('2d'), r = SN.rng('town-glow');
      for (let cell = 0; cell < 4; cell++) {
        g.save(); g.translate((cell & 1) * S, (cell >> 1) * S);
        g.beginPath(); g.rect(0, 0, S, S); g.clip(); // keep every dab inside its own cell
        const gr = g.createRadialGradient(S * 0.5, S * 0.6, 6, S * 0.5, S * 0.5, S * 0.75);
        gr.addColorStop(0, cell === 3 ? '#fffbe2' : '#fff0a4'); gr.addColorStop(0.5, '#ffd052'); gr.addColorStop(1, '#e48a28');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        g.lineCap = 'round';
        for (let i = 0; i < 90; i++) {
          const x = r() * S, y = r() * S, a = (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.5, L = 8 + r() * 18;
          g.strokeStyle = r.pick(['#fff4b8', '#ffe07a', '#f7c948', '#f0a42b', '#ffcf5c']);
          g.globalAlpha = 0.5 + r() * 0.45; g.lineWidth = 3 + r() * 5;
          g.beginPath(); g.moveTo(x - (Math.cos(a) * L) / 2, y - (Math.sin(a) * L) / 2); g.lineTo(x + (Math.cos(a) * L) / 2, y + (Math.sin(a) * L) / 2); g.stroke();
        }
        g.globalAlpha = 1;
        const bar = (x0, y0, x1, y1, w) => {
          g.lineWidth = w; g.beginPath(); g.moveTo(x0 + (r() - 0.5) * 3, y0 + (r() - 0.5) * 3);
          g.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * 5, (y0 + y1) / 2 + (r() - 0.5) * 5, x1 + (r() - 0.5) * 3, y1 + (r() - 0.5) * 3); g.stroke();
        };
        g.strokeStyle = '#2a3468';
        if (cell === 0) { bar(S / 2, 6, S / 2, S - 6, 8); bar(6, S / 2, S - 6, S / 2, 8); }
        if (cell === 1) { bar(S / 3, 6, S / 3, S - 6, 7); bar((2 * S) / 3, 6, (2 * S) / 3, S - 6, 7); bar(6, S / 2, S - 6, S / 2, 7); }
        if (cell === 2) {
          g.fillStyle = '#b8601e'; g.globalAlpha = 0.8;
          g.beginPath(); g.moveTo(8, 8); g.lineTo(S * 0.42, 8); g.quadraticCurveTo(S * 0.22, S * 0.45, S * 0.3, S - 8); g.lineTo(8, S - 8); g.fill();
          g.beginPath(); g.moveTo(S - 8, 8); g.lineTo(S * 0.58, 8); g.quadraticCurveTo(S * 0.78, S * 0.45, S * 0.7, S - 8); g.lineTo(S - 8, S - 8); g.fill();
          g.globalAlpha = 1;
        }
        g.strokeStyle = P.outline; g.lineWidth = cell === 3 ? 6 : 12; g.strokeRect(cell === 3 ? 3 : 6, cell === 3 ? 3 : 6, S - (cell === 3 ? 6 : 12), S - (cell === 3 ? 6 : 12));
        g.restore();
      }
      return cv;
    }
    const glowTex = SN.paint.texture(paintGlow(), { key: 'town-glow', wrap: false });
    const glowUV = (cell, e = 0.012) => {
      const u0 = (cell & 1) * 0.5 + e, u1 = (cell & 1) * 0.5 + 0.5 - e, v1 = 1 - (cell >> 1) * 0.5 - e, v0 = v1 - 0.5 + 2 * e;
      return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    };

    const MAT = {
      wall: townMat('ink', { map: TX.wall }),
      roof: townMat('ink', { map: TX.roof }),
      trim: townMat('ink', { map: TX.trim }),
      tree: townMat('rim', { map: TX.tree }),
      ground: townMat('lamp', { map: TX.ground, transparent: true }),
      glow: SN.mat.markGlow(SN.mat.unlit({ map: glowTex, vertexColors: true })),
    };
    MAT.glow.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGw;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vGw;')
        .replace('#include <opaque_fragment>', 'outgoingLight *= 1.0 + 0.05 * sin(uTime * 7.0 + vGw.x * 1.7 + vGw.z * 2.3) * sin(uTime * 2.9 + vGw.z * 0.9 - vGw.x);\n#include <opaque_fragment>');
    };
    MAT.glow.customProgramCacheKey = () => 'town-glow';
    MAT.ground.depthWrite = false;
    MAT.ground.polygonOffset = true; MAT.ground.polygonOffsetFactor = -2; MAT.ground.polygonOffsetUnits = -4;

    // ============================================================ lanes
    // Crooked lanes radiating from the square (world XZ polylines, smoothed). hw = half width.
    const chaikin = (pts, n = 2) => {
      for (let k = 0; k < n; k++) {
        const o = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
          o.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
        }
        o.push(pts[pts.length - 1]); pts = o;
      }
      return pts;
    };
    const roadIn = LAY.road.filter(([x, z]) => Math.hypot(x, z) < 52);
    const LANES = [
      { id: 'road', name: 'the road into the village', hw: 2.2, fadeIn: 9, pts: roadIn },
      { id: 'east', name: 'the east lane', hw: 2.0, pts: [[3.5, 2], [11, 0.8], [19, 2.2], [28, -0.5], [38, -3]] },
      { id: 'west', name: 'the west lane', hw: 1.9, pts: [[-11.5, 6], [-19, 8.5], [-27, 5.5], [-37.5, 7.5]] },
      { id: 'northwest', name: 'the north-west lane', hw: 1.8, pts: [[-9.5, -1.5], [-13.5, -10], [-18, -19], [-22, -29.5]] },
      { id: 'church', name: 'the church lane', hw: 1.8, pts: [[-2.5, -3.5], [-0.8, -12], [-1.8, -21], [0.5, -34]] },
      { id: 'southeast', name: 'the south-east lane', hw: 1.8, pts: [[1.5, 10], [8, 14.5], [16, 18], [24, 23], [30, 27.5]] },
      { id: 'southwest', name: 'the south-west lane', hw: 1.7, pts: [[-10, 10.5], [-15.5, 17], [-21.5, 23], [-27, 28.5]] },
      { id: 'behind', name: 'the lane behind the church', hw: 1.6, pts: [[-1.2, -19], [8, -18.5], [18, -19.6], [29.5, -18]] },
      { id: 'far-east', name: 'the far east lane', hw: 1.6, pts: [[28.5, -0.6], [31, -9], [29.5, -18], [29, -25]] },
      { id: 'alley-e', name: 'the little alley', hw: 1.3, pts: [[16, 18], [18.5, 10], [19, 2.2]] },
    ];
    function laneAt(ln, s) {
      s = clamp(s, 0, ln.len);
      let sg = ln.seg[ln.seg.length - 1];
      for (const q of ln.seg) if (s <= q.s0 + q.len) { sg = q; break; }
      const t = sg.len ? (s - sg.s0) / sg.len : 0, L = sg.len || 1;
      return { x: sg.ax + (sg.bx - sg.ax) * t, z: sg.az + (sg.bz - sg.az) * t, tx: (sg.bx - sg.ax) / L, tz: (sg.bz - sg.az) / L, s };
    }
    for (const ln of LANES) {
      ln.pts = chaikin(ln.pts, 2);
      ln.seg = []; let acc = 0;
      for (let i = 0; i < ln.pts.length - 1; i++) {
        const [ax, az] = ln.pts[i], [bx, bz] = ln.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
        ln.seg.push({ ax, az, bx, bz, len, s0: acc }); acc += len;
      }
      ln.len = acc;
      const [ex, ez] = ln.pts[ln.pts.length - 1];
      if (ln.id !== 'road' && Math.hypot(ex, ez) > 30) ln.fadeOut = 6;
      ln.samples = [];
      for (let s = 0; s <= acc + 1e-6; s += 0.5) ln.samples.push(laneAt(ln, s));
    }
    function laneClear(x, z, ln) { // distance from (x, z) to the lane's edge (negative = on the lane)
      let best = Infinity;
      for (const q of ln.samples) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < best) best = d; }
      return Math.sqrt(best) - ln.hw;
    }
    function nearestLane(x, z) {
      let best = Infinity, lane = null;
      for (const ln of LANES) { const d = laneClear(x, z, ln); if (d < best) { best = d; lane = ln; } }
      return { clear: best, lane };
    }
    function nearestLanePoint(ln, x, z) {
      let best = Infinity, bq = ln.samples[0];
      for (const q of ln.samples) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < best) { best = d; bq = q; } }
      return bq;
    }

    // ============================================================ footprints
    const mkRect = (x, z, hw, hd, rot) => ({ x, z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot) });
    const rectLocal = (r, px, pz) => { const dx = px - r.x, dz = pz - r.z; return [r.c * dx - r.s * dz, r.s * dx + r.c * dz]; };
    const rectDist = (r, px, pz) => { const [lx, lz] = rectLocal(r, px, pz); return Math.hypot(Math.max(Math.abs(lx) - r.hw, 0), Math.max(Math.abs(lz) - r.hd, 0)); };
    const rectCorners = r => [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => [r.x + a * r.hw * r.c + b * r.hd * r.s, r.z - a * r.hw * r.s + b * r.hd * r.c]);
    function rectsOverlap(a, b, m = 0) { // separating-axis test on two oriented rectangles
      const dx = b.x - a.x, dz = b.z - a.z;
      for (const [ax, az] of [[a.c, -a.s], [a.s, a.c], [b.c, -b.s], [b.s, b.c]]) {
        const ra = a.hw * Math.abs(a.c * ax - a.s * az) + a.hd * Math.abs(a.s * ax + a.c * az);
        const rb = b.hw * Math.abs(b.c * ax - b.s * az) + b.hd * Math.abs(b.s * ax + b.c * az);
        if (Math.abs(dx * ax + dz * az) > ra + rb + m) return false;
      }
      return true;
    }
    const inVillage = (x, z, lim = 39.5) => Math.hypot(x - VIL.x, (z - VIL.z) * 1.08) <= lim;
    const occ = []; // occupied footprints: houses, church, garden walls, big props
    function footprintOK(rect, { margin = 0.7, laneGap = 0.25, sqGap = 0.9, lim = 39.5 } = {}) {
      for (const [x, z] of rectCorners(rect)) if (!inVillage(x, z, lim)) return false;
      for (const ln of LANES) { const m = ln.hw + laneGap; for (const q of ln.samples) if (rectDist(rect, q.x, q.z) < m) return false; }
      if (rectDist(rect, SQ.x, SQ.z) < SQ_R + sqGap) return false;
      for (const o of occ) if (rectsOverlap(rect, o, Math.max(margin, o.margin ?? 0))) return false;
      return true;
    }

    // ============================================================ the church footprint
    const CHURCH = (() => {
      const rot = CH.rot, c = Math.cos(rot), s = Math.sin(rot);
      const toW = (lx, lz) => [CH.x + lx * c + lz * s, CH.z - lx * s + lz * c];
      const T = 2.6, N0 = T, NL_ = 14.5, NW = 4.1, AP = 3.2;
      const [nx, nz] = toW(N0 + NL_ / 2, 0), [ax, az] = toW(N0 + NL_ + AP / 2, 0);
      const rects = [mkRect(CH.x, CH.z, T + 1.2, T + 1.2, rot), mkRect(nx, nz, NL_ / 2 + 0.9, NW + 0.9, rot), mkRect(ax, az, AP / 2 + 0.6, AP + 0.4, rot)];
      for (const r of rects) { r.kind = 'church'; r.margin = 1.6; occ.push(r); }
      return { rot, c, s, toW, T, N0, NL: NL_, NW, AP };
    })();
    // the forecourt west of the tower (between the church lane and the door)
    { const [fx, fz] = CHURCH.toW(-4.4, 0); const r = mkRect(fx, fz, 1.8, 3.2, CH.rot); r.kind = 'forecourt'; r.margin = 0.5; occ.push(r); }
    // a little open yard kept clear for the standard tour's moon shot (snap.mjs '08-moon' stands at -10, 20)
    { const r = mkRect(-10, 20, 3.2, 3.2, 0.4); r.kind = 'yard'; r.margin = 0.4; occ.push(r); }

    // ============================================================ house layout
    const HR = SN.rng('town-layout');
    const houses = [];
    function tryHouse(x, z, rot, w, d, meta, opts) {
      const rect = mkRect(x, z, w / 2, d / 2, rot);
      if (!footprintOK(rect, opts)) return null;
      rect.kind = 'house'; occ.push(rect);
      const H = { id: houses.length, x, z, rot, w, d, rect, lane: null, ...meta };
      houses.push(H);
      return H;
    }
    // 1. frontage around the square, facing the well
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU + HR.range(-0.06, 0.06);
      const w = HR.range(5, 8.2), d = HR.range(5, 7), rr = SQ_R + 1.0 + d / 2 + HR.range(0, 0.5);
      const x = SQ.x + Math.cos(a) * rr, z = SQ.z + Math.sin(a) * rr;
      tryHouse(x, z, Math.atan2(SQ.x - x, SQ.z - z) + HR.range(-0.05, 0.05), w, d, { onSquare: true }, { margin: 0.05 });
    }
    // 2. both sides of every lane, front to the lane
    const LANE_ORDER = ['road', 'east', 'west', 'southeast', 'southwest', 'northwest', 'church', 'behind', 'far-east', 'alley-e'];
    for (const id of LANE_ORDER) {
      const ln = LANES.find(l => l.id === id);
      for (const side of [1, -1]) {
        let s = HR.range(0.3, 2);
        while (s < ln.len - 2) {
          // try a full-size house, then smaller ones, before moving on along the lane
          let H = null, w = 0;
          for (let k = 0; k < 3 && !H; k++) {
            w = HR.range(4.4, 8.8) * (1 - k * 0.2); const d = HR.range(5, 8.2) * (1 - k * 0.15), set = HR.range(0.15, 1.1);
            const p = laneAt(ln, Math.min(s + w / 2, ln.len));
            const nx = -p.tz * side, nz = p.tx * side, off = ln.hw + set + d / 2;
            H = tryHouse(p.x + nx * off, p.z + nz * off, Math.atan2(-nx, -nz) + HR.range(-0.06, 0.06), w, d, { lane: ln, side }, { margin: 0.03 });
          }
          const g = HR();
          s += H ? w + (g < 0.16 ? HR.range(3.5, 6.5) : g < 0.55 ? HR.range(0.05, 0.3) : HR.range(0.6, 1.8)) : 0.9;
        }
      }
    }
    // 3. a second row in the gaps, facing the nearest lane
    for (let tries = 0; tries < 1600 && houses.length < 46; tries++) {
      const a = HR() * TAU, rr = Math.sqrt(HR()) * 37.5;
      const x = VIL.x + Math.cos(a) * rr, z = VIL.z + (Math.sin(a) * rr) / 1.08;
      const { clear, lane } = nearestLane(x, z);
      if (clear < 2.8) continue;
      const q = nearestLanePoint(lane, x, z), big = tries < 800;
      tryHouse(x, z, Math.atan2(q.x - x, q.z - z) + HR.range(-0.1, 0.1), HR.range(4.2, big ? 7.4 : 5.6), HR.range(4.6, big ? 7 : 5.6), { lane, back: true }, { margin: 0.25 });
    }

    // ------------------------------------------------------------ house plans (shape, colour, windows)
    const WALLS = [[P.wallBlue, 'blue', 3], [P.wallPale, 'pale', 3], [P.wallGrey, 'grey', 2], ['#b0a67a', 'ochre', 1.5], ['#6f9a9c', 'blue-green', 1], ['#b4ae96', 'cream', 0.8], ['#8ea4c6', 'sky-blue', 1.2]];
    const ROOFS = [[P.roofDark, 3], [P.roofSlate, 3], [shade(P.roofRust, -0.06, -0.16), 0.9], ['#35406a', 1.4], ['#4f4650', 0.6]];
    const SHUTTERS = ['#3f6f73', '#4a6a9a', '#6b7f55', '#2f4f73', '#7a8fa8', '#5e4a3a'];
    const DOORS = ['#3a2f2a', '#2f4a52', '#4a3a2c', '#34466e', '#5a3f33'];
    const wpick = (r, list) => {
      const tot = list.reduce((s, e) => s + e[e.length - 1], 0);
      let t = r() * tot;
      for (const e of list) if ((t -= e[e.length - 1]) <= 0) return e;
      return list[0];
    };
    const houseFaces = H => {
      const hw = H.w / 2, hd = H.d / 2;
      return [
        { i: 0, A: [-hw, hd], B: [hw, hd], n: [0, 1] },
        { i: 1, A: [hw, hd], B: [hw, -hd], n: [1, 0] },
        { i: 2, A: [hw, -hd], B: [-hw, -hd], n: [0, -1] },
        { i: 3, A: [-hw, -hd], B: [-hw, hd], n: [-1, 0] },
      ].map(f => ({ ...f, len: Math.hypot(f.B[0] - f.A[0], f.B[1] - f.A[1]) }));
    };
    const localToWorldDir = (H, lx, lz) => [lx * Math.cos(H.rot) + lz * Math.sin(H.rot), -lx * Math.sin(H.rot) + lz * Math.cos(H.rot)];
    function eaveAt(H, lx, lz) { // bilinear wall-top height from the four (jittered) corners
      const tx = (lx + H.w / 2) / H.w, tz = (H.d / 2 - lz) / H.d, E = H.e;
      return lerp(lerp(E[0], E[1], tx), lerp(E[3], E[2], tx), tz);
    }
    function planHouse(H) {
      const r = SN.rng('town-house-' + H.id);
      H.storeys = H.w > 6.5 ? (r() < 0.75 ? 2 : 1) : r() < 0.45 ? 2 : 1;
      H.eave = H.storeys === 2 ? r.range(5.3, 6.5) : r.range(3.0, 3.8);
      const rt = r();
      H.roof = H.storeys === 1 && H.w < 5.8 && rt < 0.3 ? 'mono' : rt < 0.5 ? 'gable-x' : rt < 0.74 ? 'hip' : 'gable-z';
      H.pitch = H.roof === 'mono' ? r.range(0.22, 0.34) : H.roof === 'hip' ? r.range(0.45, 0.72) : r.range(0.36, 0.85);
      H.ov = r.range(0.28, 0.5);
      H.leanX = r.range(-0.03, 0.03); H.leanZ = r.range(-0.022, 0.022);
      const wl = wpick(r, WALLS);
      H.wallHex = shade(wl[0], r.range(-0.04, 0.04), r.range(-0.05, 0.03)); H.colorName = wl[1];
      H.roofHex = shade(wpick(r, ROOFS)[0], r.range(-0.03, 0.03));
      H.shutterHex = r.pick(SHUTTERS); H.doorHex = r.pick(DOORS);
      H.lintels = r() < 0.4; H.course = H.storeys === 2 && r() < 0.35;
      H.e = [0, 1, 2, 3].map(() => H.eave + r.range(-0.14, 0.14));
      if (H.roof === 'mono') { H.e[2] += H.pitch * H.d; H.e[3] += H.pitch * H.d; }
      H.alongX = H.roof === 'gable-x' || H.roof === 'mono' || (H.roof === 'hip' && H.w >= H.d);
      const hb = H.alongX ? H.d / 2 : H.w / 2;
      H.ridge = Math.max(...H.e) + (H.roof === 'mono' ? 0 : H.pitch * hb);
      H.ridgeEnds = [H.ridge + r.range(-0.1, 0.1), H.ridge + r.range(-0.1, 0.1)];
      const cs = rectCorners(H.rect).map(([x, z]) => hAt(x, z));
      H.gy = hAt(H.x, H.z); H.base = Math.min(...cs) - H.gy - 0.35;
      H.front = [Math.sin(H.rot), Math.cos(H.rot)];
      // windows & doors, slot by slot on every face
      H.windows = []; H.doors = [];
      const floor2 = H.eave * 0.5 - 0.15, sillY = [1.0, floor2 + 0.78];
      for (const f of houseFaces(H)) {
        const [wx, wz] = localToWorldDir(H, f.n[0], f.n[1]);
        const fcx = H.x + wx * (f.i % 2 ? H.w : H.d) * 0.5, fcz = H.z + wz * (f.i % 2 ? H.w : H.d) * 0.5;
        const tl = Math.hypot(START.x - fcx, START.z - fcz), view = clamp((wx * (START.x - fcx) + wz * (START.z - fcz)) / tl, 0, 1);
        const n = clamp(Math.floor(f.len / 1.95), 1, 5), slotW = f.len / n;
        const topMin = Math.min(eaveAt(H, ...f.A), eaveAt(H, ...f.B));
        const doorSlot = f.i === 0 ? (n === 1 ? 0 : r.int(0, n - 1)) : f.i === 2 && r() < 0.2 ? r.int(0, n - 1) : -1;
        const pWin = f.i === 0 ? 0.92 : f.i === 2 ? 0.62 + 0.25 * view : 0.3 + 0.45 * view;
        for (let st = 0; st < H.storeys; st++) for (let k = 0; k < n; k++) {
          const u = slotW * (k + 0.5) + r.range(-0.12, 0.12);
          if (st === 0 && k === doorSlot) {
            H.doors.push({ f: f.i, u, w: r.range(1.0, 1.25), h: Math.min(r.range(2.05, 2.3), H.eave - 0.55), dbl: r() < 0.3 });
            continue;
          }
          if (r() > pWin) continue;
          const ww = Math.min(r.range(0.85, 1.1), slotW - 0.55), wh = ww * r.range(0.95, 1.22), ys = sillY[st];
          if (ww < 0.5 || ys + wh > topMin - 0.35) continue;
          const lit = r() < 0.36 + 0.45 * view + (H.onSquare ? 0.12 : 0);
          const shutterRoom = slotW >= 2 * ww + 0.35;
          const shut = !shutterRoom ? null : lit ? (r() < 0.6 ? 'open' : null) : r() < 0.4 ? 'closed' : r() < 0.4 ? 'open' : null;
          H.windows.push({ f: f.i, u, y: ys, w: ww, h: wh, lit, st, view, shut, cell: r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2, warm: r() });
        }
        // a little attic window high in a gable
        const gable = (H.roof === 'gable-x' && f.i % 2 === 1) || (H.roof === 'gable-z' && f.i % 2 === 0);
        if (gable && H.ridge - Math.max(...H.e) > 1.5 && r() < 0.5)
          H.windows.push({ f: f.i, u: f.len / 2, y: Math.max(...H.e) + 0.2, w: 0.55, h: 0.55, lit: r() < 0.35 + 0.3 * view, attic: true, view, cell: 0, warm: r() });
      }
    }
    houses.forEach(planHouse);

    // ------------------------------------------------------------ naming (for anchor notes)
    const WELL = { x: SQ.x, z: SQ.z };
    function whereOf(x, z, lane, back) {
      const dW = Math.hypot(x - WELL.x, z - WELL.z), dC = Math.hypot(x - CH.x, z - CH.z);
      if (dW < 13.5) return 'by the well';
      if (dC < 13) return 'by the church';
      if (lane) return (back ? 'behind ' : 'on ') + lane.name;
      return 'in the village';
    }
    const houseDesc = H => `${H.colorName} house ${H.onSquare ? 'on the square' : whereOf(H.x, H.z, H.lane, H.back)}`;

    // ------------------------------------------------------------ choose the cat sills
    // lit front windows, spread over the village (farthest-point), mixing floors
    function spreadPick(cands, n, first) {
      const out = [];
      if (!cands.length) return out;
      let cur = cands.reduce((b, c) => (Math.hypot(c.x - first.x, c.z - first.z) < Math.hypot(b.x - first.x, b.z - first.z) ? c : b));
      while (out.length < n && cur) {
        out.push(cur);
        let best = null, bd = -1;
        for (const c of cands) {
          if (out.includes(c)) continue;
          const d = Math.min(...out.map(o => Math.hypot(o.x - c.x, o.z - c.z))) * (c.bias ?? 1);
          if (d > bd) { bd = d; best = c; }
        }
        cur = best;
      }
      return out;
    }
    {
      const cands = [];
      for (const H of houses) for (const wd of H.windows) if (wd.lit && wd.f === 0 && !wd.attic && wd.w >= 0.8) {
        const [fx, fz] = localToWorldDir(H, (wd.u - H.w / 2), H.d / 2);
        cands.push({ H, wd, x: H.x + fx, z: H.z + fz, bias: wd.st ? 1 : 1.15 });
      }
      for (const c of spreadPick(cands, 9, WELL)) { c.wd.catSill = true; c.wd.shut = c.wd.shut === 'closed' ? 'open' : c.wd.shut; }
    }

    // ============================================================ building a house
    const lamps = [], anchors = [], ANCH = [], propSpots = []; // propSpots: [x, z, radius] of square furniture
    const chimneys = []; // every chimney pot: { H, top } (smoke candidates)
    const cand = { ridge: [], slope: [], chimney: [], sill: [], door: [], pot: [] }; // anchor candidates
    const stoneOf = H => (H.colorName === 'ochre' || H.colorName === 'cream' ? '#b8ae94' : C.stone);
    function buildHouse(H) {
      const r = SN.rng('town-build-' + H.id);
      const hw = H.w / 2, hd = H.d / 2, c = Math.cos(H.rot), s = Math.sin(H.rot);
      const X = (lx, ly, lz) => { const sx = lx + ly * H.leanX, sz = lz + ly * H.leanZ; return new V3(H.x + sx * c + sz * s, H.gy + ly, H.z - sx * s + sz * c); };
      const wc = lin(H.wallHex), foot = wc.clone().multiplyScalar(0.5).lerp(lin(P.ultramarine), 0.2), eaveC = wc.clone().multiplyScalar(0.82);
      const stone = stoneOf(H), BAND = 0.75;
      // --- walls: a darker plinth band, then the wall (gable walls carry the peak)
      const E = H.e, CR = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = CR[i], [bx, bz] = CR[(i + 1) % 4];
        B.wall.face([X(ax, H.base, az), X(bx, H.base, bz), X(bx, BAND, bz), X(ax, BAND, az)], null, { colors: [foot, foot, wc, wc], edges: [0, 1, 3] });
        const gable = (H.roof === 'gable-x' && i % 2 === 1) || (H.roof === 'gable-z' && i % 2 === 0);
        const top = [X(ax, BAND, az), X(bx, BAND, bz), X(bx, E[(i + 1) % 4], bz)];
        if (gable) { // peak height = the ridge end on this side
          const aSide = H.roof === 'gable-x' ? (i === 1 ? 1 : 0) : i === 0 ? 0 : 1;
          top.push(X((ax + bx) / 2, H.ridgeEnds[aSide], (az + bz) / 2));
        }
        top.push(X(ax, E[i], az));
        B.wall.face(top, null, { colors: top.map((_, j) => (j < 2 ? wc : eaveC)), edges: gable ? [1, 4, 2, 3] : [1, 2, 3] });
      }
      // --- roof, in ridge coordinates (a along the ridge, b across; +b = the front slope)
      const ha = H.alongX ? hw : hd, hb = H.alongX ? hd : hw;
      const M = H.alongX ? (a, y, b) => X(a, y, b) : (a, y, b) => X(b, y, -a);
      const eAB = (a, b) => (H.alongX ? eaveAt(H, a, b) : eaveAt(H, b, -a));
      const tk = 0.2, ov = H.ov, rc = H.roofHex, soff = lin(H.roofHex).clone().multiplyScalar(0.55);
      const slab = (pts, skip) => {
        const T = pts.map(([a, y, b]) => M(a, y + tk, b)), Bo = pts.map(([a, y, b]) => M(a, y, b));
        B.roof.face(T, rc, { uvScale: 0.32, band: 0.55 });
        B.roof.face(Bo.slice().reverse(), soff, { ink: 0.5 });
        for (let i = 0; i < pts.length; i++) if (!skip.includes(i)) { const j = (i + 1) % pts.length; B.roof.face([Bo[i], Bo[j], T[j], T[i]], rc, { band: 0 }); }
      };
      let ridgeY = a => H.ridge; // top-of-bottom-surface height of the ridge at a (for anchors)
      if (H.roof === 'gable-x' || H.roof === 'gable-z') {
        const [rN, rP] = H.ridgeEnds, av = ha + ov * 0.8;
        const eFN = eAB(-ha, hb), eFP = eAB(ha, hb), eBN = eAB(-ha, -hb), eBP = eAB(ha, -hb);
        const k = (rr, e) => (rr - e) / hb;
        slab([[-av, eFN - k(rN, eFN) * ov, hb + ov], [av, eFP - k(rP, eFP) * ov, hb + ov], [av, rP, 0], [-av, rN, 0]], [2]);
        slab([[-av, rN, 0], [av, rP, 0], [av, eBP - k(rP, eBP) * ov, -hb - ov], [-av, eBN - k(rN, eBN) * ov, -hb - ov]], [0]);
        ridgeY = a => lerp(rN, rP, (a + av) / (2 * av));
        beam(B.roof, M(-av - 0.02, rN + tk, 0), M(av + 0.02, rP + tk, 0), 0.24, 0.14, lin(H.roofHex).clone().multiplyScalar(0.7), { band: 0.4 }); // ridge tiles
      } else if (H.roof === 'hip') {
        const hipIn = Math.min(hb * r.range(0.75, 1.0), ha - 0.05), ra = Math.max(ha - hipIn, 0), rY = H.ridge;
        const e = (sa, sb) => { const y0 = eAB(sa * ha, sb * hb); return [sa * (ha + ov), y0 - ((rY - y0) / hb) * ov, sb * (hb + ov)]; };
        const FN = e(-1, 1), FP = e(1, 1), BP = e(1, -1), BN = e(-1, -1), RN = [-ra, rY, 0], RP = [ra, rY, 0];
        slab([FN, FP, RP, RN], [1, 2, 3]); slab([BP, BN, RN, RP], [1, 2, 3]);
        slab([FP, BP, RP], [1, 2]); slab([BN, FN, RN], [1, 2]);
        if (ra > 0.2) beam(B.roof, M(-ra, rY + tk, 0), M(ra, rY + tk, 0), 0.22, 0.13, lin(H.roofHex).clone().multiplyScalar(0.7), { band: 0.4 });
        H.ridgeHalf = ra;
      } else { // mono: one slope, high at the back
        const av = ha + ov * 0.8, k = H.pitch;
        slab([[-av, eAB(-ha, hb) - k * ov, hb + ov], [av, eAB(ha, hb) - k * ov, hb + ov], [av, eAB(ha, -hb) + k * ov, -hb - ov], [-av, eAB(-ha, -hb) + k * ov, -hb - ov]], []);
      }
      const roofTop = (a, b, above = 1.2) => { const p = M(a, H.ridge + tk + above, b); const y = topAt(p.x, p.z, p.y); return y == null ? null : new V3(p.x, y, p.z); };
      // --- chimneys (sit on the roof surface we just built)
      const nCh = H.roof === 'mono' ? (r() < 0.5 ? 1 : 0) : r() < 0.88 ? (H.w > 7 && r() < 0.35 ? 2 : 1) : 0;
      const chimA = [];
      for (let k = 0; k < nCh; k++) {
        const sg = k ? -chimA[0].sg : r.sign(), a = sg * (ha - 0.6 - r.range(0, 0.3) * ha);
        const b = H.roof === 'mono' ? -hb * 0.45 : r.range(-0.35, 0.35) * hb;
        const cw = r.range(0.55, 0.85) / 2, cd = r.range(0.45, 0.7) / 2;
        const ys = [[a - cw, b - cd], [a + cw, b - cd], [a + cw, b + cd], [a - cw, b + cd]].map(([pa, pb]) => roofTop(pa, pb)?.y ?? H.gy + H.ridge);
        const yLo = Math.min(...ys) - 0.5 - H.gy, yHi = Math.max(...ys) + r.range(0.8, 1.4) - H.gy;
        const chimC = shade(H.colorName === 'ochre' ? H.wallHex : C.stone, r.range(-0.1, 0.02));
        boxF(M, a - cw, a + cw, yLo, yHi, b - cd, b + cd, chimC, B.wall, { skip: ['bottom', 'top'] });
        boxF(M, a - cw - 0.08, a + cw + 0.08, yHi, yHi + 0.13, b - cd - 0.08, b + cd + 0.08, P.roofDark, B.roof);
        chimA.push({ sg, a, b, top: M(a, yHi + 0.13, b) });
        chimneys.push({ H, top: M(a, yHi + 0.13, b), w: Math.max(cw, cd) });
      }
      // --- anchor candidates on the roof
      if (H.roof !== 'mono') {
        const lim = H.roof === 'hip' ? H.ridgeHalf ?? 0 : ha - 0.9;
        // gable-end houses: sit near the front gable so the cat shows against the sky from the lane
        let a = H.roof === 'gable-z' ? -ha + r.range(0.5, 1.0) : r.range(-lim, lim);
        for (const ch of chimA) if (Math.abs(a - ch.a) < 1.1) a = clamp(ch.a - Math.sign(ch.a || 1) * 1.4, -lim, lim);
        const p = M(a, ridgeY(a) + tk, 0), y = topAt(p.x, p.z, p.y + 0.15);
        if (y != null && Math.abs(y - p.y) < 0.25) cand.ridge.push({ H, x: p.x, z: p.z, pos: new V3(p.x, y, p.z), facing: yawOf(...H.front), space: 0.45 });
        const slopeHalf = H.roof === 'hip' ? Math.max(0.3, (H.ridgeHalf ?? 0) + 0.3) : ha - 1; // stay clear of hips / verges
        const sb = hb * 0.5, sp = roofTop(r.range(-0.4, 0.4) * slopeHalf, sb);
        if (sp) {
          const [fx, fz] = H.alongX ? H.front : localToWorldDir(H, 1, 0);
          cand.slope.push({ H, x: sp.x, z: sp.z, pos: sp, facing: yawOf(fx, fz), space: 0.5, normal: surfaceNormal(sp.x, sp.z, sp.y + 0.01) });
        }
      }
      for (const ch of chimA) {
        const y = topAt(ch.top.x, ch.top.z, ch.top.y + 0.05);
        if (y != null) cand.chimney.push({ H, x: ch.top.x, z: ch.top.z, pos: new V3(ch.top.x, y, ch.top.z), facing: yawOf(...H.front), space: 0.35 });
      }
      // --- face furniture: windows, sills, shutters, flower boxes, doors, steps
      const faces = houseFaces(H);
      const FR = faces.map(f => {
        const [ax, az] = f.A, tx = (f.B[0] - ax) / f.len, tz = (f.B[1] - az) / f.len, [nx, nz] = f.n;
        return (u, y, o) => X(ax + tx * u + nx * o, y, az + tz * u + nz * o);
      });
      const faceN = faces.map(f => localToWorldDir(H, f.n[0], f.n[1]));
      const shutter = (F, u0, u1, y0, y1, o0, o1) => { // three inked panels = louvred shutter
        boxF(F, u0, u1, y0, y1, o0, o1, H.shutterHex, B.trim, { skip: ['bottom', 'back', 'front'] });
        for (let k = 0; k < 3; k++) { const a = lerp(y0, y1, k / 3), b = lerp(y0, y1, (k + 1) / 3); B.trim.face([F(u0, a, o1), F(u1, a, o1), F(u1, b, o1), F(u0, b, o1)], H.shutterHex, { band: 0.15 }); }
      };
      for (const wd of H.windows) {
        const F = FR[wd.f], u0 = wd.u - wd.w / 2, u1 = wd.u + wd.w / 2, y0 = wd.y, y1 = wd.y + wd.h;
        if (wd.shut !== 'closed') {
          if (wd.lit) {
            const warm = lin(wd.warm < 0.4 ? '#ffffff' : wd.warm < 0.75 ? '#ffe2b0' : '#ffc890');
            B.glow.face([F(u0, y0, 0.035), F(u1, y0, 0.035), F(u1, y1, 0.035), F(u0, y1, 0.035)], warm, { uvs: glowUV(wd.attic ? 0 : wd.cell), ink: 0 });
          } else {
            const um = wd.u, ym = (y0 + y1) / 2, dc = shade(C.darkGlass, r.range(-0.03, 0.04));
            for (const [a0, a1, b0, b1] of [[u0, um, y0, ym], [um, u1, y0, ym], [um, u1, ym, y1], [u0, um, ym, y1]])
              B.trim.face([F(a0, b0, 0.035), F(a1, b0, 0.035), F(a1, b1, 0.035), F(a0, b1, 0.035)], dc, { band: 0.12 });
          }
        }
        // sill (cat sills are deep, wide ledges)
        const sw = wd.catSill ? 1.25 : wd.w + 0.24, sd = wd.catSill ? 0.3 : 0.13, st = wd.catSill ? 0.1 : 0.08;
        if (!wd.attic) boxF(F, wd.u - sw / 2, wd.u + sw / 2, y0 - st, y0, 0, sd, stone, B.trim, { skip: ['bottom', 'back'] });
        if (H.lintels && !wd.attic) boxF(F, u0 - 0.1, u1 + 0.1, y1, y1 + 0.13, 0, 0.05, stone, B.trim, { skip: ['bottom', 'back'] });
        if (wd.shut === 'open') for (const sg of [-1, 1]) {
          const sw2 = wd.w / 2 + 0.03, uc = wd.u + sg * (wd.w / 2 + 0.06 + sw2 / 2);
          shutter(F, uc - sw2 / 2, uc + sw2 / 2, y0 - 0.02, y1 + 0.02, 0.01, 0.06);
        } else if (wd.shut === 'closed') {
          shutter(F, u0 - 0.03, wd.u - 0.01, y0 - 0.02, y1 + 0.02, 0.02, 0.08);
          shutter(F, wd.u + 0.01, u1 + 0.03, y0 - 0.02, y1 + 0.02, 0.02, 0.08);
        }
        if (wd.catSill) {
          const p = F(wd.u, y0, sd * 0.55), y = topAt(p.x, p.z, p.y + 0.05);
          if (y != null) cand.sill.push({ H, wd, x: p.x, z: p.z, pos: new V3(p.x, y, p.z), facing: yawOf(...faceN[wd.f]), space: 0.5 });
        } else if (wd.st === 1 && !wd.attic && wd.shut !== 'closed' && r() < 0.28) { // flower box on the sill
          boxF(F, u0 + 0.02, u1 - 0.02, y0, y0 + 0.17, 0.02, 0.22, C.terracotta, B.trim, { skip: ['bottom', 'back'] });
          const nF = Math.max(3, Math.round(wd.w / 0.2));
          for (let k = 0; k < nF; k++) {
            const p = F(lerp(u0 + 0.1, u1 - 0.1, k / (nF - 1)), y0 + 0.22 + r.range(0, 0.06), 0.12 + r.range(-0.04, 0.04));
            const fc = lin(r.pick(['#b04a62', '#d8d2c2', '#c9783e', '#7a3a6a', '#e0b050'])), leaf = lin('#2f5a48');
            blob(B.trim, p.x, p.y, p.z, 0.1, 0.09, 0.1, H.id * 7 + k, (x, y) => (y > p.y ? fc : leaf), 0.3, 0);
          }
        }
      }
      for (const dr of H.doors) {
        const F = FR[dr.f], mid = F(dr.u, 0, 0.6), g0 = dr.upper ? dr.y0 : hAt(mid.x, mid.z) - H.gy;
        const u0 = dr.u - dr.w / 2, u1 = dr.u + dr.w / 2, y0 = g0 - 0.02, y1 = g0 + dr.h;
        const dc = shade(H.doorHex, r.range(-0.03, 0.03));
        if (dr.dbl) {
          B.trim.face([F(u0, y0, 0.04), F(dr.u, y0, 0.04), F(dr.u, y1, 0.04), F(u0, y1, 0.04)], dc, { band: 0.18 });
          B.trim.face([F(dr.u, y0, 0.04), F(u1, y0, 0.04), F(u1, y1, 0.04), F(dr.u, y1, 0.04)], dc, { band: 0.18 });
        } else B.trim.face([F(u0, y0, 0.04), F(u1, y0, 0.04), F(u1, y1, 0.04), F(u0, y1, 0.04)], dc, { band: 0.18 });
        boxF(F, u0 - 0.16, u0, y0, y1, 0, 0.07, stone, B.trim, { skip: ['bottom', 'back'] });
        boxF(F, u1, u1 + 0.16, y0, y1, 0, 0.07, stone, B.trim, { skip: ['bottom', 'back'] });
        boxF(F, u0 - 0.2, u1 + 0.2, y1, y1 + 0.18, 0, 0.09, stone, B.trim, { skip: ['bottom', 'back'] });
        if (dr.upper) { dr.F = F; dr.g0 = g0; dr.fn = faceN[dr.f]; continue; }
        boxF(F, u0 - 0.25, u1 + 0.25, g0 - 0.3, g0 + 0.15, 0, 0.42, C.stoneDark, B.trim, { skip: ['bottom', 'back'] });
        const p = F(dr.u, g0 + 0.15, 0.24), y = topAt(p.x, p.z, p.y + 0.05);
        if (y != null && dr.f === 0) cand.door.push({ H, dr, x: p.x, z: p.z, pos: new V3(p.x, y, p.z), facing: yawOf(...faceN[dr.f]), space: 0.55, F, g0 });
        dr.F = F; dr.g0 = g0; dr.fn = faceN[dr.f];
      }
      if (H.course) boxF(FR[0], -0.04, faces[0].len + 0.04, H.eave * 0.5 - 0.25, H.eave * 0.5 - 0.12, 0, 0.07, stone, B.wall, { skip: ['bottom', 'back'] });
      if (H.stairs) { // outside stone stairs up the side wall to an upstairs door
        const S = H.stairs, F = FR[S.fi], at = k => S.uS + S.dirU * k;
        // explicit faces so only treads and nosings are inked (no "piano key" lines on the side)
        const sc = lin(stone), sd = sc.clone().multiplyScalar(0.65), W1 = 1.0;
        for (let k = 0; k < S.n; k++) {
          const a = at(k * S.tread), b = at((k + 1) * S.tread), u0 = Math.min(a, b), u1 = Math.max(a, b);
          const y1 = ((k + 1) * S.landY) / S.n, yPrev = (k * S.landY) / S.n;
          B.wall.face([F(u0, H.base, W1), F(u1, H.base, W1), F(u1, y1, W1), F(u0, y1, W1)], null, { colors: [sd, sd, sc, sc], edges: [2], band: 0.3 });
          B.wall.face([F(u0, y1, W1), F(u1, y1, W1), F(u1, y1, 0), F(u0, y1, 0)], sc, { band: 0.35 });
          const riser = S.dirU > 0 ? [F(u0, yPrev, 0), F(u0, yPrev, W1), F(u0, y1, W1), F(u0, y1, 0)] : [F(u1, yPrev, W1), F(u1, yPrev, 0), F(u1, y1, 0), F(u1, y1, W1)];
          B.wall.face(riser, sd, { edges: [2], band: 0 });
        }
        const a = at(S.run), b = at(S.run + S.land);
        boxF(F, Math.min(a, b), Math.max(a, b), H.base, S.landY, 0, 1.1, stone, B.wall, { skip: ['bottom', 'back'], foot: 0.65, band: 0.35 });
        // iron hand rail with a few posts
        const rail = (k, o) => F(at(k), (k / S.run) * S.landY + 0.95, o);
        beam(B.trim, rail(0, 0.93), rail(S.run, 0.93), 0.035, 0.035, C.iron, { ink: 0.4 });
        for (const k of [0, S.run / 2, S.run]) beam(B.trim, F(at(k), (k / S.run) * S.landY, 0.93), rail(k, 0.93), 0.03, 0.03, C.iron, { ink: 0.3 });
        beam(B.trim, F(b, S.landY + 0.95, 1.05), F(a, S.landY + 0.95, 1.05), 0.035, 0.035, C.iron, { ink: 0.4 });
        beam(B.trim, F(b, S.landY, 1.05), F(b, S.landY + 0.95, 1.05), 0.03, 0.03, C.iron, { ink: 0.3 });
        const fn = faceN[S.fi], mid = at(S.run * 0.55), land = at(S.run + S.land * 0.62);
        for (const [u, y, o, id, note] of [[land, S.landY, 0.55, 'landing', 'on the landing of the stone steps up to the '], [mid, Math.ceil(0.55 * S.n) * S.landY / S.n, 0.5, 'steps', 'halfway up the stone steps of the ']]) {
          const p = F(u, y, o), yy = topAt(p.x, p.z, p.y + 0.05);
          if (yy != null) ANCH.push({ id: `town-${id}-${H.id}`, kind: 'ledge', pos: new V3(p.x, yy, p.z), facing: yawOf(...fn), space: 0.4, note: note + houseDesc(H), tags: ['steps', id === 'landing' ? 'high' : 'low'], data: { house: H.id } });
        }
        const [cx, cz] = [S.rect.x, S.rect.z];
        W.addBox({ x: cx, z: cz, hx: S.rect.hw, hz: S.rect.hd, rot: S.rect.rot, tag: 'town-stairs' });
      }
      H.X = X; H.FR = FR; H.faceN = faceN;
    }
    // ------------------------------------------------------------ outside stone stairs (two houses)
    function planStairs() {
      const r = SN.rng('town-stairs');
      const order = houses.filter(H => H.storeys === 2 && !H.onSquare).map(H => ({ H, k: r() })).sort((a, b) => a.k - b.k).map(o => o.H);
      let made = 0;
      for (const H of order) {
        if (made >= 2) break;
        const faces = houseFaces(H);
        for (const fi of r() < 0.5 ? [1, 3] : [3, 1]) {
          const f = faces[fi], landY = H.eave * 0.5 - 0.15, n = Math.ceil(landY / 0.21), tread = 0.27, run = n * tread, land = 1.15;
          if (run + land > f.len - 0.4) continue;
          const dirU = fi === 1 ? 1 : -1, uS = fi === 1 ? 0.3 : f.len - 0.3, uMid = uS + (dirU * (run + land)) / 2;
          const [ax, az] = f.A, tx = (f.B[0] - ax) / f.len, tz = (f.B[1] - az) / f.len, [nx, nz] = f.n;
          const lx = ax + tx * uMid + nx * 0.58, lz = az + tz * uMid + nz * 0.58;
          const [wx, wz] = localToWorldDir(H, lx, lz), [twx, twz] = localToWorldDir(H, tx, tz);
          const rect = mkRect(H.x + wx, H.z + wz, (run + land) / 2 + 0.05, 0.6, Math.atan2(-twz, twx));
          let ok = rectCorners(rect).every(([x, z]) => inVillage(x, z));
          for (const ln of LANES) { if (!ok) break; for (const q of ln.samples) if (rectDist(rect, q.x, q.z) < ln.hw + 0.3) { ok = false; break; } }
          if (ok) for (const o of occ) if (o !== H.rect && rectsOverlap(rect, o, 0.45)) { ok = false; break; }
          if (!ok) continue;
          rect.kind = 'stairs'; rect.margin = 0.3; occ.push(rect);
          const lo = Math.min(uS, uS + dirU * (run + land)) - 0.7, hi = Math.max(uS, uS + dirU * (run + land)) + 0.7;
          const landU = uS + dirU * (run + land / 2);
          H.windows = H.windows.filter(w => w.f !== fi || (w.st === 0 ? w.u < lo || w.u > hi : Math.abs(w.u - landU) > 1.2) || w.attic);
          H.doors = H.doors.filter(d => d.f !== fi);
          H.doors.push({ f: fi, u: landU, w: 0.92, h: Math.min(2.05, H.eave - landY - 0.45), upper: true, y0: landY });
          H.stairs = { fi, uS, dirU, n, tread, run, land, landY, rect };
          made++;
          break;
        }
      }
    }
    planStairs();
    houses.forEach(buildHouse);

    // ============================================================ the church
    // Spire height: in the painting the needle pierces the line of the hills behind the village.
    // Find the skyline elevation at the spire's azimuth from the painter's eye (core terrain +
    // the landscape's ranges, whatever height they ended up) and make the tip clear it.
    let spireWanted = 0; // unclamped tip height the skyline asked for (reported in info)
    function spireTip() {
      const eye = new V3(LAY.start.x, hAt(LAY.start.x, LAY.start.z) + SN.player.eye, LAY.start.z);
      const dx = CH.x - eye.x, dz = CH.z - eye.z, dist = Math.hypot(dx, dz), ux = dx / dist, uz = dz / dist;
      let sky = -Infinity; // skyline elevation (tan) from the terrain behind the church
      for (let d = dist + 20; d < 520; d += 4) sky = Math.max(sky, (hAt(eye.x + ux * d, eye.z + uz * d) - eye.y) / d);
      const L = SN.modules.landscape, targets = [L?.ranges, L?.ground].filter(m => m && m.isMesh);
      if (targets.length) {
        const rc = new THREE.Raycaster(), dir = new V3();
        let lo = Math.atan(Math.max(sky, 0)), hi = 0.45;
        const hits = e => { dir.set(ux * Math.cos(e), Math.sin(e), uz * Math.cos(e)); rc.set(eye, dir); rc.near = dist + 10; rc.far = 1500; return rc.intersectObjects(targets, false).length > 0; };
        if (hits(lo)) { for (let k = 0; k < 11; k++) { const m = (lo + hi) / 2; if (hits(m)) lo = m; else hi = m; } }
        sky = Math.max(sky, Math.tan(lo));
      }
      const tip = eye.y + dist * Math.tan(Math.atan(sky) + 1.4 * SN.deg) - hAt(CH.x, CH.z);
      spireWanted = +tip.toFixed(1);
      return clamp(tip, 28.4, 42);
    }
    function buildChurch() {
      const { rot, T, N0, NL: NLEN, NW, AP } = CHURCH;
      const gy = hAt(CH.x, CH.z), F = frame(CH.x, gy, CH.z, rot);
      const st = C.church, stL = C.churchLight, band = 0.4;
      const ch = { x: CH.x, z: CH.z, rot, gy };
      // --- tower: shaft, belfry ledge (cornice), belfry stage with openings, upper cornice
      const TIP = spireTip(), grow = TIP - 28.4;           // a taller needle also lifts the belfry a little
      const H1 = 13.2 + grow * 0.2, H2 = 16.3 + grow * 0.2, T2 = 2.3;
      boxF(F, -T, T, -0.6, H1, -T, T, st, B.wall, { skip: ['bottom', 'top'], foot: 0.6, band });
      boxF(F, -T - 0.45, T + 0.45, H1, H1 + 0.3, -T - 0.45, T + 0.45, stL, B.wall, { band });
      boxF(F, -T2, T2, H1 + 0.3, H2, -T2, T2, st, B.wall, { skip: ['bottom', 'top'], band });
      boxF(F, -T2 - 0.25, T2 + 0.25, H2, H2 + 0.25, -T2 - 0.25, T2 + 0.25, stL, B.wall, { band });
      // belfry openings (tall, pointed) and slit windows on all four sides
      const sideFrames = [
        (u, y, o) => F(u, y, T2 + o), (u, y, o) => F(T2 + o, y, -u), (u, y, o) => F(-u, y, -T2 - o), (u, y, o) => F(-T2 - o, y, u),
      ];
      const lowFrames = [
        (u, y, o) => F(u, y, T + o), (u, y, o) => F(T + o, y, -u), (u, y, o) => F(-u, y, -T - o), (u, y, o) => F(-T - o, y, u),
      ];
      for (const Fs of sideFrames) for (const u of [-0.75, 0.75]) {
        const y0 = H1 + 0.75, y1 = H2 - 0.75;
        B.trim.face([Fs(u - 0.36, y0, 0.03), Fs(u + 0.36, y0, 0.03), Fs(u + 0.36, y1, 0.03), Fs(u, y1 + 0.42, 0.03), Fs(u - 0.36, y1, 0.03)], '#0b1333', { edges: [0, 1, 4, 2], band: 0.3 });
      }
      for (const Fs of lowFrames) {
        const y0 = 8.4 + grow * 0.12;
        B.trim.face([Fs(-0.22, y0, 0.03), Fs(0.22, y0, 0.03), Fs(0.22, y0 + 1.8, 0.03), Fs(0, y0 + 2.1, 0.03), Fs(-0.22, y0 + 1.8, 0.03)], '#0f1a3f', { edges: [0, 1, 4] });
      }
      // --- the needle spire: octagonal, slightly concave, tip ~28 m
      const S0 = H2 + 0.25, SM = S0 + 4.6 + grow * 0.15, R0 = 1.8, RM = 0.92, seg = 8, off = Math.PI / 8;
      const sp = (t, rr, y) => F(rr * Math.cos(t + off), y, -rr * Math.sin(t + off));
      for (let i = 0; i < seg; i++) {
        const t0 = (TAU * i) / seg, t1 = (TAU * (i + 1)) / seg;
        const sc = shade(C.spire, (i % 2 ? -0.02 : 0.03));
        B.roof.face([sp(t0, R0, S0), sp(t1, R0, S0), sp(t1, RM, SM), sp(t0, RM, SM)], sc, { edges: [0, 1, 3], band: 0.55, uvScale: 0.5 });
        B.roof.face([sp(t0, RM, SM), sp(t1, RM, SM), F(0, TIP, 0)], sc, { edges: [1, 2], band: 0.55, uvScale: 0.5 });
      }
      // corner pinnacles
      for (const [px, pz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
        const cx = px * (T2 + 0.02), cz = pz * (T2 + 0.02), q = 0.2, y0 = H2 + 0.25, y1 = y0 + 1.5;
        const Pf = (x, y, z) => F(cx + x, y, cz + z);
        boxF(Pf, -q, q, y0, y0 + 0.35, -q, q, stL, B.wall, { skip: ['bottom', 'top'] });
        const a = Pf(-q, y0 + 0.35, q), b = Pf(q, y0 + 0.35, q), c = Pf(q, y0 + 0.35, -q), d = Pf(-q, y0 + 0.35, -q), tp = Pf(0, y1, 0);
        for (const [p0, p1] of [[a, b], [b, c], [c, d], [d, a]]) B.roof.face([p0, p1, tp], C.spire, { band: 0.5 });
      }
      ch.tip = F(0, TIP, 0); ch.tipHeight = TIP;
      // --- nave: long body east of the tower, gable roof, stepped buttresses, tall windows
      const NH = 8.0, x0 = N0 - 0.2, x1 = N0 + NLEN, pitch = 0.62, ridge = NH + NW * pitch, ov = 0.4, tk = 0.24;
      const nf = (x, y, z) => F(x, y, z);
      const foot = lin(st).clone().multiplyScalar(0.55);
      const wallQ = (pts) => B.wall.face(pts, null, { colors: pts.map(p => (p.y - gy < 1 ? foot : lin(st))), band });
      wallQ([nf(x0, -0.6, NW), nf(x1, -0.6, NW), nf(x1, NH, NW), nf(x0, NH, NW)]);        // south wall
      wallQ([nf(x1, -0.6, -NW), nf(x0, -0.6, -NW), nf(x0, NH, -NW), nf(x1, NH, -NW)]);    // north wall
      B.wall.face([nf(x1, -0.6, NW), nf(x1, -0.6, -NW), nf(x1, NH, -NW), nf(x1, ridge, 0), nf(x1, NH, NW)], st, { edges: [0, 1, 4], band }); // east gable
      B.wall.face([nf(x0, -0.6, -NW), nf(x0, -0.6, NW), nf(x0, NH, NW), nf(x0, ridge, 0), nf(x0, NH, -NW)], st, { edges: [0, 1, 4], band }); // west gable
      const M = (a, y, b) => F(a, y, b), rs = (pts, skip) => {
        const Tp = pts.map(([a, y, b]) => M(a, y + tk, b)), Bo = pts.map(([a, y, b]) => M(a, y, b));
        B.roof.face(Tp, P.roofDark, { band: 0.4 });
        B.roof.face(Bo.slice().reverse(), '#1a2038', { ink: 0.5 });
        for (let i = 0; i < pts.length; i++) if (!skip.includes(i)) { const j = (i + 1) % pts.length; B.roof.face([Bo[i], Bo[j], Tp[j], Tp[i]], P.roofDark, { band: 0 }); }
      };
      const ea = x1 + ov, eb = x0 - 0.1, edrop = NH - pitch * ov;
      rs([[eb, edrop, NW + ov], [ea, edrop, NW + ov], [ea, ridge, 0], [eb, ridge, 0]], [2]);
      rs([[eb, ridge, 0], [ea, ridge, 0], [ea, edrop, -NW - ov], [eb, edrop, -NW - ov]], [0]);
      for (const sgn of [1, -1]) {
        for (let k = 0; k < 5; k++) {
          const bx = lerp(x0 + 1.6, x1 - 0.6, k / 4);
          const Bf = sgn > 0 ? (u, y, o) => F(bx + u, y, NW + o) : (u, y, o) => F(bx - u, y, -NW - o);
          boxF(Bf, -0.35, 0.35, -0.5, 3.4, 0, 0.8, stL, B.wall, { skip: ['bottom', 'back'], foot: 0.6 });
          boxF(Bf, -0.3, 0.3, 3.4, 6.3, 0, 0.45, stL, B.wall, { skip: ['bottom', 'back'] });
          if (k < 4) { // tall pointed window between buttresses
            const wxL = lerp(x0 + 1.6, x1 - 0.6, (k + 0.5) / 4), wu = sgn > 0 ? wxL - bx : bx - wxL, y0 = 3.0, y1 = 6.0;
            const lit = sgn > 0 && (k === 1 || k === 2);
            const pts = [Bf(wu - 0.45, y0, 0.03), Bf(wu + 0.45, y0, 0.03), Bf(wu + 0.45, y1, 0.03), Bf(wu, y1 + 0.6, 0.03), Bf(wu - 0.45, y1, 0.03)];
            if (lit) {
              B.glow.face(pts.slice(0, 3).concat([pts[4]]), lin('#e0924e'), { uvs: glowUV(1), ink: 0 });
              B.glow.face([pts[4], pts[2], pts[3]], lin('#e0924e'), { uvs: [[0.05, 0.95], [0.45, 0.95], [0.25, 0.99]], ink: 0 });
            } else B.trim.face(pts, '#15214a', { edges: [0, 1, 4, 2], band: 0.3 });
            boxF(Bf, wu - 0.6, wu + 0.6, y0 - 0.12, y0, 0, 0.18, stL, B.trim, { skip: ['bottom', 'back'] });
          }
        }
      }
      // --- apse: half-round east end with a conical roof
      const AF = (x, y, z) => F(x1 + x, y, z), AH = 6.4;
      ring(B.wall, AF, AP, -0.6, AH, 9, st, { a0: -Math.PI / 2, a1: Math.PI / 2, band });
      for (let i = 0; i < 9; i++) {
        const t0 = -Math.PI / 2 + (Math.PI * i) / 9, t1 = -Math.PI / 2 + (Math.PI * (i + 1)) / 9, ro = AP + 0.35;
        const a = AF(ro * Math.cos(t0), AH - 0.2, -ro * Math.sin(t0)), b = AF(ro * Math.cos(t1), AH - 0.2, -ro * Math.sin(t1)), tp = AF(0, AH + 2.6, 0);
        B.roof.face([a, b, tp], P.roofDark, { edges: [0], band: 0.3 });
        B.roof.face([b, a, AF(0, AH - 0.2, 0)], '#1a2038', { ink: 0 });
      }
      for (const t of [-0.9, 0, 0.9]) {
        const Af = (u, y, o) => AF((AP + o) * Math.cos(t) - u * Math.sin(t), y, -(AP + o) * Math.sin(t) - u * Math.cos(t));
        B.trim.face([Af(-0.25, 2.6, 0.04), Af(0.25, 2.6, 0.04), Af(0.25, 4.6, 0.04), Af(0, 4.95, 0.04), Af(-0.25, 4.6, 0.04)], '#15214a', { edges: [0, 1, 4] });
      }
      // --- west door with a stone surround and three steps
      const DF = (u, y, o) => F(-T - o, y, u);
      B.trim.face([DF(-0.8, -0.05, 0.04), DF(0.8, -0.05, 0.04), DF(0.8, 2.6, 0.04), DF(0, 3.35, 0.04), DF(-0.8, 2.6, 0.04)], '#3a2c26', { edges: [0, 1, 4, 2], band: 0.25 });
      B.trim.face([DF(-0.02, -0.05, 0.05), DF(0.02, -0.05, 0.05), DF(0.02, 2.9, 0.05), DF(-0.02, 2.9, 0.05)], P.outline, { ink: 0 });
      boxF(DF, -1.1, -0.8, -0.1, 2.7, 0, 0.14, stL, B.trim, { skip: ['bottom', 'back'] });
      boxF(DF, 0.8, 1.1, -0.1, 2.7, 0, 0.14, stL, B.trim, { skip: ['bottom', 'back'] });
      for (let k = 0; k < 3; k++) boxF(DF, -1.5 + k * 0.05, 1.5 - k * 0.05, -0.3, 0.16 * (k + 1), 0, 1.25 - k * 0.4, C.stone, B.trim, { skip: ['bottom', 'back'] });
      ch.door = DF(0, 0, 1.6);
      // --- colliders
      W.addBox({ x: CH.x, z: CH.z, hx: T, hz: T, rot, tag: 'town-church' });
      const [ncx, ncz] = CHURCH.toW((x0 + x1) / 2, 0);
      W.addBox({ x: ncx, z: ncz, hx: (x1 - x0) / 2, hz: NW + 0.8, rot, tag: 'town-church' });
      const [acx, acz] = CHURCH.toW(x1, 0);
      W.addCircle({ x: acx, z: acz, r: AP, tag: 'town-church' });
      { const [sx, sz] = CHURCH.toW(-T - 0.65, 0); W.addBox({ x: sx, z: sz, hx: 0.65, hz: 1.5, rot, top: gy + 0.5, tag: 'town-steps' }); }
      // --- anchors: belfry ledge (south + west), nave ridge, steps
      const ledgeS = F(0.6, H1 + 0.3, T2 + 0.36), ledgeW = F(-T2 - 0.36, H1 + 0.3, -0.9);
      const ridgeP = F(N0 + NLEN * 0.62, ridge + tk, 0), stepP = F(-T - 0.2, 0.48, 1.05);
      const fS = [Math.sin(rot), Math.cos(rot)], fW = [-Math.cos(rot), Math.sin(rot)];
      const snap = (p, up = 0.05) => { const y = topAt(p.x, p.z, p.y + up); return y == null ? p : new V3(p.x, y, p.z); };
      ANCH.push(
        { id: 'town-belfry-south', kind: 'steeple', pos: snap(ledgeS), facing: yawOf(...fS), space: 0.35, note: 'on the belfry ledge of the church tower', tags: ['church', 'high'] },
        { id: 'town-belfry-west', kind: 'steeple', pos: snap(ledgeW), facing: yawOf(...fW), space: 0.35, note: 'on the west side of the belfry ledge, facing the church lane', tags: ['church', 'high'] },
        { id: 'town-church-ridge', kind: 'roof-ridge', pos: snap(ridgeP, 0.1), facing: yawOf(...fS), space: 0.45, note: 'on the ridge of the church roof', tags: ['church', 'high'] },
        { id: 'town-church-steps', kind: 'ledge', pos: snap(stepP), facing: yawOf(...fW), space: 0.6, note: 'on the stone steps of the church door', tags: ['church', 'low'] },
      );
      // lantern by the church door
      wallLantern(DF, 1.5, 2.3, 0);
      return ch;
    }

    // ============================================================ lanterns
    function lanternHead(F, y, s = 0.17, h = 0.46) {
      const gl = glowUV(3);
      for (const name of ['front', 'right', 'back', 'left']) {
        const pts = BOX_FACES[name].map(([i, j, k]) => F(i ? s : -s, y + (j ? h : 0), k ? s : -s));
        B.glow.face(pts, lin('#ffffff'), { uvs: gl, ink: 0 });
      }
      for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) boxF(F, px * s - 0.025, px * s + 0.025, y, y + h, pz * s - 0.025, pz * s + 0.025, C.iron, B.trim, { skip: ['bottom', 'top'], ink: 0.5 });
      boxF(F, -s - 0.03, s + 0.03, y - 0.06, y, -s - 0.03, s + 0.03, C.iron, B.trim);
      boxF(F, -s - 0.07, s + 0.07, y + h, y + h + 0.07, -s - 0.07, s + 0.07, C.iron, B.trim, { skip: [] });
      return F(0, y + h * 0.5, 0);
    }
    function addLamp(p, radius = 9) { if (lamps.length < NL) lamps.push({ x: p.x, y: p.y, z: p.z, r: radius }); }
    function streetLamp(x, z, rot, note, id) {
      const gy = hAt(x, z), F = frame(x, gy, z, rot);
      boxF(F, -0.2, 0.2, -0.3, 0.28, -0.2, 0.2, C.stoneDark, B.trim);
      boxF(F, -0.06, 0.06, 0.28, 2.72, -0.06, 0.06, C.iron, B.trim, { skip: ['bottom', 'top'], ink: 0.6 });
      const c = lanternHead(F, 2.78);
      addLamp(c, 8.5);
      W.addCircle({ x, z, r: 0.28, tag: 'town-lamp' }); propSpots.push([x, z, 0.4]);
      const top = F(0, 2.78 + 0.46 + 0.07, 0), y = topAt(top.x, top.z, top.y + 0.05);
      if (note) ANCH.push({ id, kind: 'ledge', pos: new V3(top.x, y ?? top.y, top.z), facing: yawOf(Math.sin(rot), Math.cos(rot)), space: 0.28, note, tags: ['lamp', 'high'] });
      return c;
    }
    function wallLantern(Fw, u, y, o0 = 0) {
      boxF(Fw, u - 0.03, u + 0.03, y + 0.52, y + 0.58, o0, o0 + 0.46, C.iron, B.trim, { ink: 0.5 });
      const Fl = (x, yy, z) => Fw(u + x, yy, o0 + 0.36 + z);
      boxF(Fl, -0.012, 0.012, y + 0.36, y + 0.54, -0.012, 0.012, C.iron, B.trim, { ink: 0 });
      const c = lanternHead(Fl, y, 0.12, 0.34);
      addLamp(c, 6);
    }

    // ============================================================ the square
    function buildSquare() {
      // --- the well: stone drum, coping ring, dark water, iron arch with a pulley and bucket
      const wx = WELL.x, wz = WELL.z, gy = hAt(wx, wz), F = frame(wx, gy, wz, 0.3);
      const rO = 0.95, rI = 0.7, h = 0.8;
      ring(B.wall, F, rO, -0.35, h, 16, C.stone, { band: 0.35 });
      ring(B.wall, F, rI, 0.25, h, 16, C.stoneDark, { inward: true, ink: 0.5 });
      annulus(B.wall, F, rI - 0.05, rO + 0.06, h + 0.13, 16, C.stoneLight, { band: 0.3 });
      ring(B.wall, F, rO + 0.06, h, h + 0.13, 16, C.stoneLight, { band: 0 });
      ring(B.wall, F, rI - 0.05, h, h + 0.13, 16, C.stoneLight, { inward: true, band: 0 });
      disc(B.trim, F, rI, 0.3, 12, C.water, { ink: 0 });
      const archH = h + 1.55, archTop = h + 2.05;
      for (const sx of [-1, 1]) beam(B.trim, F(sx * 0.84, h + 0.1, 0), F(sx * 0.84, archH, 0), 0.07, 0.07, C.iron);
      let prev = F(-0.84, archH, 0);
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, x = lerp(-0.84, 0.84, t), y = archH + (archTop - archH) * Math.sin(Math.PI * t);
        const p = F(x, y, 0); beam(B.trim, prev, p, 0.06, 0.06, C.iron); prev = p;
      }
      const PF = (a, b, c) => F(a, archTop - 0.22 - c, b); // pulley wheel (axis along z)
      ring(B.trim, PF, 0.16, -0.035, 0.035, 10, C.iron, { ink: 0.6 });
      beam(B.trim, F(0.0, archTop - 0.36, 0.1), F(0, h + 0.55, 0.12), 0.02, 0.02, '#8a7a5a', { ink: 0 });
      const BF = (x, y, z) => F(0.56 + x, y, 0.55 + z); // bucket resting on the coping
      ring(B.trim, BF, 0.15, h + 0.13, h + 0.43, 9, C.wood, { r1: 0.18 });
      ring(B.trim, BF, 0.185, h + 0.37, h + 0.41, 9, C.iron, { ink: 0 });
      W.addCircle({ x: wx, z: wz, r: rO + 0.1, tag: 'town-well' });
      { // anchor on the coping, on the side facing the painter's hill
        const dx = START.x - wx, dz = START.z - wz, dl = Math.hypot(dx, dz), rr = (rO + rI) / 2 + 0.005;
        const px = wx + (dx / dl) * rr, pz = wz + (dz / dl) * rr, y = topAt(px, pz, gy + h + 0.2);
        ANCH.push({ id: 'town-well-rim', kind: 'well', pos: new V3(px, y ?? gy + h + 0.13, pz), facing: yawOf(dx, dz), space: 0.3, note: 'on the rim of the well in the square', tags: ['square', 'low'] });
      }
      // --- benches facing the well, a hand cart, lanterns, a barrel stack
      const polar = (deg, rr) => { const a = (deg * Math.PI) / 180; return [SQ.x + Math.cos(a) * rr, SQ.z + Math.sin(a) * rr]; };
      const faceWell = (x, z) => Math.atan2(WELL.x - x, WELL.z - z);
      const b1 = polar(22, 6.6), b2 = polar(112, 6.4), b3 = polar(300, 6.6);
      bench(b1[0], b1[1], faceWell(...b1), 'town-bench-square', 'on the bench by the well');
      bench(b2[0], b2[1], faceWell(...b2), 'town-bench-square-2', 'on the bench on the square, beside the road');
      bench(b3[0], b3[1], faceWell(...b3), null);
      const cp = polar(203, 6.9);
      cart(cp[0], cp[1], faceWell(...cp) + Math.PI / 2 + 0.35);
      const l1 = polar(68, 7.6), l2 = polar(258, 7.4);
      streetLamp(l1[0], l1[1], faceWell(...l1), 'on top of the lantern at the square', 'town-lamp-square');
      streetLamp(l2[0], l2[1], faceWell(...l2), null);
    }
    function bench(x, z, rot, id, note) {
      const gy = hAt(x, z), F = frame(x, gy, z, rot);
      for (const lx of [-0.62, 0.62]) boxF(F, lx - 0.09, lx + 0.09, -0.2, 0.42, -0.2, 0.2, C.stone, B.trim, { foot: 0.7 });
      boxF(F, -0.86, 0.86, 0.42, 0.5, -0.23, 0.23, C.woodBlue, B.trim);
      for (const lx of [-0.72, 0.72]) boxF(F, lx - 0.04, lx + 0.04, 0.5, 0.96, -0.25, -0.18, C.woodBlue, B.trim);
      boxF(F, -0.86, 0.86, 0.72, 0.93, -0.26, -0.19, C.woodBlue, B.trim);
      W.addBox({ x, z, hx: 0.9, hz: 0.3, rot, top: gy + 0.5, tag: 'town-bench' }); propSpots.push([x, z, 1.0]);
      if (id) {
        const p = F(0.38, 0.5, 0.04), y = topAt(p.x, p.z, p.y + 0.05);
        ANCH.push({ id, kind: 'bench', pos: new V3(p.x, y ?? p.y, p.z), facing: yawOf(Math.sin(rot), Math.cos(rot)), space: 0.4, note, tags: ['square', 'low'] });
      }
    }
    function cart(x, z, rot) {
      const gy = hAt(x, z), F = frame(x, gy, z, rot), bedY = 0.8;
      boxF(F, -1.1, 1.1, bedY - 0.1, bedY, -0.66, 0.66, C.wood, B.trim);
      for (const sz of [-1, 1]) boxF(F, -1.1, 1.1, bedY, bedY + 0.34, sz > 0 ? 0.6 : -0.66, sz > 0 ? 0.66 : -0.6, C.wood, B.trim);
      boxF(F, 1.04, 1.1, bedY, bedY + 0.3, -0.6, 0.6, C.wood, B.trim);
      boxF(F, -1.1, -1.04, bedY, bedY + 0.44, -0.6, 0.6, C.wood, B.trim);
      for (const sz of [-1, 1]) { // wheels (axis along local z): rim, spokes, hub
        const zc = sz * 0.8, cy = 0.64, WF = (a, b, c) => F(a, cy - c, zc + b);
        ring(B.trim, WF, 0.64, -0.06, 0.06, 14, C.wood, { ink: 0.8 });
        annulus(B.trim, WF, 0.5, 0.64, 0.06, 14, C.wood, { band: 0.2 });
        annulus(B.trim, WF, 0.5, 0.64, -0.06, 14, C.wood, { band: 0.2, down: true });
        for (let k = 0; k < 4; k++) { const t = (k * Math.PI) / 4; beam(B.trim, WF(Math.cos(t) * 0.52, 0, Math.sin(t) * 0.52), WF(-Math.cos(t) * 0.52, 0, -Math.sin(t) * 0.52), 0.06, 0.06, C.wood); }
        boxF(WF, -0.1, 0.1, -0.1, 0.1, -0.1, 0.1, C.iron, B.trim, { skip: [] });
      }
      beam(B.trim, F(0, 0.64, -0.9), F(0, 0.64, 0.9), 0.08, 0.08, C.iron);
      for (const sz of [-0.45, 0.45]) beam(B.trim, F(-1.05, bedY - 0.1, sz), F(-2.85, 0.1, sz * 0.8), 0.08, 0.1, C.wood);
      beam(B.trim, F(-2.3, 0.28, 0), F(-2.3, -0.1, 0.12), 0.06, 0.06, C.wood);
      // two sacks at the front of the bed
      boxF(F, -1.0, -0.35, bedY, bedY + 0.42, -0.55, -0.02, C.sack, B.trim);
      boxF(F, -0.95, -0.4, bedY, bedY + 0.36, 0.04, 0.56, shade(C.sack, -0.05), B.trim);
      W.addBox({ x: F(-0.85, 0, 0).x, z: F(-0.85, 0, 0).z, hx: 2.05, hz: 0.9, rot, tag: 'town-cart' }); propSpots.push([x, z, 2.2]);
      const p = F(0.55, bedY, 0.1), y = topAt(p.x, p.z, p.y + 0.05);
      ANCH.push({ id: 'town-cart', kind: 'cart', pos: new V3(p.x, y ?? p.y, p.z), facing: yawOf(...[Math.cos(rot), -Math.sin(rot)]), space: 0.5, note: 'in the hand cart at the edge of the square', tags: ['square', 'low'] });
    }
    function barrel(F, y, rad = 0.3, h = 0.82, col = C.wood) {
      ring(B.trim, F, rad, y, y + h / 2, 10, col, { r1: rad * 1.1, edges: [0], band: 0.15 });
      ring(B.trim, F, rad * 1.1, y + h / 2, y + h, 10, col, { r1: rad, edges: [2], band: 0.15 });
      for (const t of [0.14, 0.86]) { const rr = rad * (1 + 0.1 * Math.sin(Math.PI * t)) + 0.012; ring(B.trim, F, rr, y + h * t - 0.03, y + h * t + 0.03, 10, C.iron, { ink: 0 }); }
      disc(B.trim, F, rad, y + h, 10, shade(col, 0.06), { band: 0.3 });
    }

    // ============================================================ trees
    const trees = [];
    function treeOK(x, z, rad, trunkClear) {
      if (!inVillage(x, z, 41)) return false;
      if (nearestLane(x, z).clear < trunkClear) return false;
      if (Math.hypot(x - SQ.x, z - SQ.z) < SQ_R + 0.6) return false;
      for (const o of occ) if (rectDist(o, x, z) < rad * 0.85 + 0.2) return false;
      for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < (t.rad + rad) * 0.78) return false;
      return true;
    }
    // Vincent's village trees are dark blue-green masses built of curling strokes. A canopy is a
    // cluster of overlapping lobes (noise-displaced icospheres) around an egg-shaped envelope, with
    // pointed, upward-curling tufts pushed out of the silhouette so its edge breaks like brushwork.
    // Vertex colours carry the light only (moon side / shaded side / sky-facing, clump-to-clump
    // value shifts, darker crevices between the lobes); the stroke texture carries the hue.
    const TV = { // linear multipliers of the stroke texture
      deep: new THREE.Color().setRGB(0.3, 0.36, 0.58),  // crevices between clumps
      shade: new THREE.Color().setRGB(0.52, 0.6, 0.86), // turned from the moon: bluer
      mid: new THREE.Color().setRGB(0.78, 0.86, 0.86),
      lit: new THREE.Color().setRGB(1.25, 1.3, 1.0),    // moonlit: a paler, warmer green
    };
    // the canopies' big lobes: icosphere detail 4 (2562 vertices) on desktops, 3 (642) on phones and
    // other constrained devices, where they are ~10 MB of vertex buffers otherwise
    const LOBE_DETAIL = SN.device.constrained || SN.params.safe ? 3 : 4;
    const EYE_TOP = SN.player.eye + 1.0; // highest eye above the ground (a jump peaks ~0.9 m up)
    // lobe(L, t, env): one displaced icosphere. L = {x,y,z, rx,ry,rz, detail, lump, seed, tone, tufts}
    // where a tuft = {d: unit dir, w: cos(half-width), amp (m), curl}. env(x,y,z) -> ~1 on the
    // canopy's outer surface, less in the crevices. Tracks the canopy's reach for the colliders.
    // Triangles buried inside a neighbouring lobe (shrunk by its deepest possible lump, so no hole
    // can open) are dropped: roughly a third of every canopy is never visible.
    const _ld = new V3(), _lt = new V3(), _lc = new THREE.Color();
    function lobe(L, t, env, all) {
      const g = BLOBS[L.detail].clone(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const d = _ld.fromBufferAttribute(p, i), x = d.x, y = d.y, z = d.z;
        const k = 1 + L.lump * SN.noise2(x * 1.7 + L.seed, z * 1.7 + y * 1.2 - L.seed) + L.lump * 0.55 * SN.noise2(y * 3.3 - L.seed, x * 2.9 + z * 1.3);
        let px = L.x + x * L.rx * k, py = L.y + y * L.ry * k, pz = L.z + z * L.rz * k;
        for (const tf of L.tufts) { // a pointed lick: pushed out, lifted, its tip hooked sideways
          const s = (x * tf.d.x + y * tf.d.y + z * tf.d.z - tf.w) / (1 - tf.w);
          if (s <= 0) continue;
          const f = tf.amp * Math.pow(s, 1.6), h = f * s * s * tf.curl; // round base, hooked tip
          _lt.set(-tf.d.z, 0, tf.d.x); if (_lt.lengthSq() < 1e-6) _lt.set(1, 0, 0); _lt.normalize();
          px += tf.d.x * f + _lt.x * h; py += tf.d.y * f + f * 0.5; pz += tf.d.z * f + _lt.z * h;
        }
        p.setXYZ(i, px, py, pz);
        const dy = py - t.gy, rr = Math.hypot(px - t.x, pz - t.z);
        if (dy < EYE_TOP + 0.3) t.reachEye = Math.max(t.reachEye, rr); // band the camera can reach
        if (dy < 0.9) t.reachLow = Math.max(t.reachLow, rr);            // where a cat would sit
        t.bottom = Math.min(t.bottom, dy);
      }
      g.computeVertexNormals();
      const occl = all.filter(o => o !== L).map(o => { const S = 1 - o.lump * 1.6; return [o.x, o.y, o.z, 1 / (o.rx * S), 1 / (o.ry * S), 1 / (o.rz * S)]; });
      const buried = i => {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        for (const [ox, oy, oz, ix, iy, iz] of occl) if (((x - ox) * ix) ** 2 + ((y - oy) * iy) ** 2 + ((z - oz) * iz) ** 2 < 1) return true;
        return false;
      };
      const bur = Array.from({ length: p.count }, (_, i) => buried(i)), src = g.index.array, keep = [];
      for (let i = 0; i < src.length; i += 3) if (!(bur[src[i]] && bur[src[i + 1]] && bur[src[i + 2]])) keep.push(src[i], src[i + 1], src[i + 2]);
      g.setIndex(keep);
      const md = W.moonDir, nn = g.attributes.normal, cols = new Float32Array(p.count * 3), out = _lc;
      for (let i = 0; i < p.count; i++) {
        if (!keep.length) break;
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = nn.getX(i), ny = nn.getY(i), nz = nn.getZ(i);
        const lit = clamp(0.5 + 0.5 * (nx * md.x + ny * md.y + nz * md.z), 0, 1), sky = clamp(0.5 + 0.5 * ny, 0, 1);
        const hgt = clamp((y - t.gy) / t.h, 0, 1), patch = SN.noise2(x * 0.8 + t.id, z * 0.8 + y * 0.9) * 0.12;
        const v = clamp(lit * 0.72 + sky * 0.22 + hgt * 0.12 - 0.18 + L.tone + patch, 0, 1);
        out.copy(TV.shade).lerp(TV.mid, v);
        if (v > 0.62) out.lerp(TV.lit, (v - 0.62) * 1.9);
        out.lerp(TV.deep, 1 - smoothstep(0.7, 1.0, env(x, y, z)));
        cols[i * 3] = out.r; cols[i * 3 + 1] = out.g; cols[i * 3 + 2] = out.b;
      }
      B.tree.meshIdx(g, cols);
    }
    // tuft(dir, r, rl): an upward-curling lick on a lobe of radius rl, leaning out along dir
    const tuft = (dir, r, rl, lift = 0.7) => ({
      d: new V3(dir.x + r.range(-0.25, 0.25), dir.y + lift, dir.z + r.range(-0.25, 0.25)).normalize(),
      w: Math.cos(r.range(0.62, 0.8)), amp: rl * r.range(0.24, 0.4), curl: r.sign() * r.range(0.6, 1.0),
    });
    function buildTree(t) {
      const r = SN.rng('town-tree-' + t.id), gy = (t.gy = hAt(t.x, t.z));
      t.reachEye = 0; t.reachLow = 0; t.bottom = Infinity;
      const L = [];
      if (t.kind === 'tall') {
        // a dark flame: lobes stacked up a slightly S-bent axis, widest a quarter of the way up
        const n = 6, base = gy + t.trunkH, span = t.h - t.trunkH, ph = r() * TAU, lean = r.range(0.25, 0.45);
        const ax = f => [t.x + Math.sin(f * 3.4 + ph) * lean * f, t.z + Math.cos(f * 2.9 + ph) * lean * f];
        const prof = f => t.rad * (f < 0.25 ? lerp(0.82, 1, f / 0.25) : lerp(1, 0.34, Math.pow((f - 0.25) / 0.75, 1.1)));
        for (let k = 0; k < n; k++) {
          const f = k / (n - 1), [cx, cz] = ax(f), rl = prof(f) * r.range(0.92, 1.05);
          const ry = (span / n) * r.range(0.95, 1.12), dir = new V3(r.range(-1, 1), 0, r.range(-1, 1)).normalize();
          const tufts = k === n - 1 ? [tuft(new V3(0, 1, 0), r, rl * 1.4, 1.6)] : r() < 0.75 ? [tuft(dir, r, rl, 1.1)] : [];
          L.push({ x: cx, y: base + ry * 0.75 + f * (span - ry * 1.55), z: cz, rx: rl, ry, rz: rl * r.range(0.88, 1.05), detail: LOBE_DETAIL, lump: 0.13, seed: t.id * 13 + k * 3.7, tone: r.range(-0.07, 0.07), tufts });
        }
        const env = (x, y, z) => { const f = clamp((y - base) / span, 0, 1), [cx, cz] = ax(f); return Math.hypot(x - cx, z - cz) / (prof(f) * 0.95) + 0.12; };
        for (const l of L) lobe(l, t, env, L);
      } else if (t.kind === 'bush') {
        const env = (x, y, z) => Math.hypot((x - t.x) / t.rad, (y - gy - t.rad * 0.55) / (t.rad * 0.8), (z - t.z) / t.rad);
        for (let k = 0; k < 2; k++) {
          const a = r() * TAU, d = k ? t.rad * 0.4 : 0, rl = t.rad * (k ? 0.68 : 0.85);
          L.push({ x: t.x + Math.cos(a) * d, y: gy + rl * 0.62 + (k ? 0.12 : 0), z: t.z + Math.sin(a) * d, rx: rl, ry: rl * 0.82, rz: rl * r.range(0.85, 1.05), detail: 2, lump: 0.16, seed: t.id * 13 + k * 3.7, tone: r.range(-0.05, 0.05), tufts: k ? [tuft(new V3(Math.cos(a), 0, Math.sin(a)), r, rl * 0.8)] : [] });
        }
        for (const l of L) lobe(l, t, env, L);
      } else {
        // round: a core plus 6-8 clumps on an egg; the plane tree spreads wider and flatter
        const RX = t.rad * (t.plane ? 1.08 : 1), RY = t.rad * (t.plane ? 0.92 : r.range(1.02, 1.18)), RZ = t.rad * r.range(0.92, 1.05);
        const ey = gy + t.trunkH + RY * 0.84, n = t.plane ? 8 : r.int(6, 7), off = r() * TAU;
        const env = (x, y, z) => Math.hypot((x - t.x) / RX, (y - ey) / RY, (z - t.z) / RZ) * 1.02;
        L.push({ x: t.x, y: ey, z: t.z, rx: RX * 0.7, ry: RY * 0.7, rz: RZ * 0.7, detail: 2, lump: 0.1, seed: t.id * 13, tone: -0.04, tufts: [] });
        for (let k = 0; k < n; k++) {
          const yy = clamp(lerp(0.88, -0.62, k / (n - 1)) + r.range(-0.08, 0.08), -0.7, 0.95), a = off + k * 2.39996 + r.range(-0.3, 0.3), s = Math.sqrt(1 - yy * yy);
          const dir = new V3(Math.cos(a) * s, yy, Math.sin(a) * s), rl = t.rad * r.range(0.47, 0.57);
          const tufts = [], nt = yy > -0.3 ? (r() < 0.25 ? 2 : r() < 0.75 ? 1 : 0) : 0;
          for (let j = 0; j < nt; j++) tufts.push(tuft(new V3(dir.x + r.range(-0.5, 0.5), dir.y, dir.z + r.range(-0.5, 0.5)), r, rl, r.range(0.4, 0.9)));
          L.push({ x: t.x + dir.x * RX * 0.57, y: ey + dir.y * RY * 0.54, z: t.z + dir.z * RZ * 0.57, rx: rl, ry: rl * r.range(0.86, 1.0), rz: rl * r.range(0.9, 1.05), detail: LOBE_DETAIL, lump: 0.14, seed: t.id * 13 + k * 3.7 + 1, tone: r.range(-0.08, 0.08), tufts });
        }
        for (const l of L) lobe(l, t, env, L);
      }
      // trunk (tapered heptagon, running up into the canopy), in the trim material
      const TF = frame(t.x, gy, t.z, r() * TAU), tTop = Math.max(t.trunkH, t.bottom + 0.6);
      ring(B.trim, TF, t.trunkR, -0.3, tTop, 7, C.trunk, { r1: t.trunkR * 0.6, ink: 0.6 });
      if (t.branch) { // a thick low limb a cat can sit on
        const a = t.branchYaw, y0 = t.branchY, BL = 1.35;
        const p0 = new V3(t.x, gy + y0 - 0.25, t.z), p1 = new V3(t.x - Math.sin(a) * BL, gy + y0 + 0.12, t.z - Math.cos(a) * BL);
        beam(B.trim, p0, p1, 0.2, 0.2, C.trunk, { ink: 0.7 });
        t.branchTip = p1;
      }
      // collider: the foliage the eye can reach (standing or at the top of a jump) must stay a
      // near-plane's breadth away; high canopies (plane tree, branch trees) only need the trunk
      const eyeR = t.reachEye > 0 ? t.reachEye + 0.22 - SN.player.radius : 0;
      t.colR = Math.max(t.trunkR + 0.25, eyeR);
      W.addCircle({ x: t.x, z: t.z, r: t.colR, tag: 'town-tree' });
    }
    function placeTrees() {
      const r = SN.rng('town-trees');
      const want = { round: 15, tall: 5, bush: 9 };
      let id = 0;
      // a plane tree on the square: tall trunk, high canopy spreading over the cobbles
      for (const deg of [318, 32, 10, 122, 264, 212]) {
        const a = deg * SN.deg, rr = 7.3, x = SQ.x + Math.cos(a) * rr, z = SQ.z + Math.sin(a) * rr, rad = 2.3;
        if (nearestLane(x, z).clear < 0.6 || occ.some(o => rectDist(o, x, z) < rad * 0.95) || propSpots.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + 0.7)) continue;
        trees.push({ id: id++, kind: 'round', x, z, rad, h: 8.5, trunkR: 0.27, trunkH: 3.4, plane: true });
        break;
      }
      for (const kind of ['tall', 'round', 'bush']) {
        let n = 0;
        for (let tries = 0; tries < 900 && n < want[kind]; tries++) {
          const a = r() * TAU, rr = Math.sqrt(r()) * 40, x = Math.cos(a) * rr, z = (Math.sin(a) * rr) / 1.08;
          const rad = kind === 'tall' ? r.range(1.3, 1.8) : kind === 'round' ? r.range(2.0, 3.1) : r.range(0.8, 1.3);
          const trunkClear = kind === 'round' ? rad * 0.75 + 0.25 : kind === 'bush' ? rad + 0.2 : 1.1;
          if (!treeOK(x, z, rad, trunkClear)) continue;
          const t = { id: id++, kind, x, z, rad, h: kind === 'tall' ? r.range(9, 11.5) : kind === 'round' ? r.range(5.5, 8) : rad * 1.6, trunkR: kind === 'bush' ? 0.1 : r.range(0.2, 0.3) };
          t.trunkH = kind === 'tall' ? 1.2 : kind === 'round' ? r.range(1.2, 1.8) : 0.2;
          trees.push(t); n++;
        }
      }
      // give three round trees a sturdy low branch that points at the nearest lane
      const rounds = trees.filter(t => t.kind === 'round');
      for (const t of spreadPick(rounds.map(t => ({ ...t, t })), 3, WELL).map(c => c.t)) {
        const { lane } = nearestLane(t.x, t.z), q = nearestLanePoint(lane, t.x, t.z);
        t.branch = true; t.branchYaw = yawOf(q.x - t.x, q.z - t.z); t.branchY = 1.9; t.trunkH = Math.max(t.trunkH, 3.2);
      }
      trees.forEach(buildTree);
    }

    // ============================================================ garden walls
    const walls = [];
    function wallOK(ax, az, bx, bz, host) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.5);
      for (let i = 0; i <= n; i++) {
        const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n);
        if (!inVillage(x, z, 44)) return false;
        if (nearestLane(x, z).clear < 0.45) return false;
        if (Math.hypot(x - SQ.x, z - SQ.z) < SQ_R + 0.5) return false;
        for (const o of occ) if (o !== host && rectDist(o, x, z) < 0.35) return false;
        for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < (t.kind === 'bush' ? t.rad + 0.2 : 0.8)) return false;
      }
      return true;
    }
    function buildWall(ax, az, bx, bz, h, r) {
      const L = Math.hypot(bx - ax, bz - az), rot = Math.atan2(-(bz - az), bx - ax), gy = hAt((ax + bx) / 2, (az + bz) / 2);
      const F = frame(ax, 0, az, rot), th = 0.2, col = r.pick(['#9aa0aa', '#a69c84', '#8e98a6']);
      const nS = Math.max(1, Math.round(L / 2.2));
      for (let k = 0; k < nS; k++) { // segments of slightly different height, each with a coping
        const x0 = (L * k) / nS, x1 = (L * (k + 1)) / nS, hh = h + r.range(-0.08, 0.08);
        const g0 = Math.min(hAt(F(x0, 0, 0).x, F(x0, 0, 0).z), hAt(F(x1, 0, 0).x, F(x1, 0, 0).z));
        const Fk = (x, y, z) => F(x, y + g0, z);
        boxF(Fk, x0, x1 + 0.01, -0.3, hh, -th, th, col, B.wall, { skip: ['bottom', 'top'], foot: 0.6, uvScale: 0.4 });
        boxF(Fk, x0 - 0.02, x1 + 0.03, hh, hh + 0.1, -th - 0.05, th + 0.05, shade(col, -0.12), B.wall, { skip: ['bottom'], band: 0.35 });
      }
      const rect = mkRect((ax + bx) / 2, (az + bz) / 2, L / 2, th, rot); rect.kind = 'wall'; rect.margin = 0.3; occ.push(rect);
      W.addBox({ x: rect.x, z: rect.z, hx: L / 2 + 0.05, hz: th + 0.05, rot, top: gy + h + 0.1, tag: 'town-wall' });
      const w = { ax, az, bx, bz, h, rot, L, F };
      walls.push(w);
      return w;
    }
    function placeWalls() {
      const r = SN.rng('town-walls');
      for (const H of houses) {
        if (r() > 0.62) continue;
        const depth = r.range(3.2, 6), hgt = r.range(0.95, 1.35);
        // the garden lies behind the house: back corners, pushed back along -front
        const bx = -H.front[0], bz = -H.front[1], cs = rectCorners(H.rect); // FL, FR, BR, BL
        const [brx, brz] = cs[2], [blx, blz] = cs[3];
        const pBR = [brx + bx * depth, brz + bz * depth], pBL = [blx + bx * depth, blz + bz * depth];
        const segs = [[brx + bx * 0.1, brz + bz * 0.1, ...pBR], [...pBR, ...pBL], [...pBL, blx + bx * 0.1, blz + bz * 0.1]];
        let made = 0;
        for (const [ax, az, cx, cz] of segs) {
          if (made && r() < 0.15) continue; // an open side = a gate
          if (wallOK(ax, az, cx, cz, H.rect)) { const w = buildWall(ax, az, cx, cz, hgt, r); w.H = H; made++; }
        }
      }
    }

    // ============================================================ ground: lanes + square
    function buildGround() {
      const pos = [], nor = [], uv = [], col = [], edge = [], inkp = [], idx = [];
      const tmp = new THREE.Color(), nrm = new V3(), gr = SN.rng('town-ground');
      const earth = lin('#8e8a7a'), earthDark = lin('#6f7482'), cobble = lin('#8f939e');
      const add = (x, z, a, u, v, base) => {
        const y = hAt(x, z) + 0.05; W.normalAt(x, z, nrm);
        pos.push(x, y, z); nor.push(nrm.x, nrm.y, nrm.z); uv.push(u, v);
        const k = 0.5 + 0.5 * SN.noise2(x * 0.21 + 3.1, z * 0.21 - 1.7);
        tmp.copy(base).lerp(earthDark, k * 0.45);
        col.push(tmp.r, tmp.g, tmp.b, a); edge.push(99, 99, 99, 99); inkp.push(0, 0);
        return pos.length / 3 - 1;
      };
      const ACROSS = [-1.32, -1.0, -0.55, 0, 0.55, 1.0, 1.32], ALPHA = [0, 0.88, 1, 1, 1, 0.88, 0];
      for (const ln of LANES) {
        const rows = [];
        for (let s = 0; s <= ln.len + 1e-6; s += 0.8) {
          const p = laneAt(ln, s), q0 = laneAt(ln, s - 1.2), q1 = laneAt(ln, s + 1.2);
          let tx = q1.x - q0.x, tz = q1.z - q0.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          const nx = -tz, nz = tx;
          // the road fades in from the landscape's road; lanes that leave the village fade into the fields
          const fade = (ln.fadeIn ? smoothstep(0, ln.fadeIn, s) : 1) * (ln.fadeOut ? 1 - smoothstep(ln.len - ln.fadeOut, ln.len, s) : 1);
          rows.push(ACROSS.map((a, j) => {
            const wob = 1 + 0.12 * SN.noise2(s * 0.3 + j, ln.hw * 7);
            const w = ln.hw * a * wob;
            return add(p.x + nx * w, p.z + nz * w, ALPHA[j] * fade, s * 0.26, w * 0.3, earth);
          }));
        }
        for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < ACROSS.length - 1; j++) {
          const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
          idx.push(a, b, d, b, c, d);
        }
      }
      // the cobbled square (rings, soft edge)
      const RINGS = [0, 2.2, 4.4, 6.4, 7.8, SQ_R, SQ_R + 1.1], RA = [1, 1, 1, 1, 1, 0.9, 0], SEG = 56, base = pos.length / 3;
      for (let k = 0; k < RINGS.length; k++) for (let i = 0; i <= SEG; i++) {
        const t = (TAU * i) / SEG, rr = RINGS[k] * (1 + (k > 3 ? 0.04 * SN.noise2(Math.cos(t) * 2, Math.sin(t) * 2) : 0));
        const x = SQ.x + Math.cos(t) * rr, z = SQ.z + Math.sin(t) * rr;
        add(x, z, RA[k], (t / TAU) * Math.round(TAU * Math.max(rr, 1.5) * 0.3), rr * 0.33, cobble);
      }
      for (let k = 0; k < RINGS.length - 1; k++) for (let i = 0; i < SEG; i++) {
        const a = base + k * (SEG + 1) + i, b = a + 1, d = a + SEG + 1, c = d + 1;
        idx.push(a, b, d, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 4));
      g.setAttribute('inkp', new THREE.Float32BufferAttribute(inkp, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    }

    // ============================================================ village life: clutter
    function placeClutter() {
      const r = SN.rng('town-clutter');
      // wall lanterns beside a few doors (lamp budget permitting), pots by others
      const doorList = houses.flatMap(H => H.doors.filter(d => d.f === 0).map(d => ({ H, d, x: H.x, z: H.z })));
      const lampDoors = spreadPick(doorList, 5, { x: 12, z: 18 });
      for (const { H, d } of lampDoors) {
        let u = d.u + d.w / 2 + 0.45; if (u > H.w - 0.35) u = d.u - d.w / 2 - 0.45;
        wallLantern(d.F, u, d.g0 + Math.min(2.45, H.eave - 0.8), 0);
        d.lamp = true;
      }
      let pots = 0;
      for (const { H, d } of doorList) {
        if (d.lamp || r() > 0.45) continue;
        const side = r.sign(), u = d.u + side * (d.w / 2 + 0.55);
        if (u < 0.4 || u > H.w - 0.4) continue;
        const p = d.F(u, d.g0, 0.35), gy = hAt(p.x, p.z), PF = frame(p.x, gy, p.z, 0), pr = r.range(0.16, 0.24), ph = r.range(0.28, 0.42);
        ring(B.trim, PF, pr * 0.75, -0.05, ph, 8, C.terracotta, { r1: pr, band: 0.2 });
        disc(B.trim, PF, pr, ph, 8, '#2a2220', { ink: 0 });
        const fc = lin(r.pick(['#b04a62', '#d8d2c2', '#c9783e', '#e0b050'])), leaf = lin(r.pick(['#2f5a48', '#3d6a4f']));
        const top = gy + ph + pr * 0.9;
        blob(B.trim, p.x, top, p.z, pr * 1.3, pr * 1.2, pr * 1.3, pots * 5.3, (x, y, z) => (SN.noise2(x * 9, z * 9 + y * 7) > 0.35 ? fc : leaf), 0.35);
        const q = d.F(u + side * 0.48, d.g0, 0.32);
        if (pots < 4) cand.pot.push({ H, x: q.x, z: q.z, pos: new V3(q.x, hAt(q.x, q.z), q.z), facing: yawOf(...d.fn), d });
        pots++;
      }
      // a stack of barrels beside a door near the square
      const bd = doorList.filter(({ H }) => H.onSquare || Math.hypot(H.x - WELL.x, H.z - WELL.z) < 20).sort((a, b) => Math.hypot(a.H.x - 2, a.H.z - 12) - Math.hypot(b.H.x - 2, b.H.z - 12));
      for (const { H, d } of bd) {
        const u = d.u + (d.u > H.w / 2 ? -1 : 1) * (d.w / 2 + 1.0);
        if (u < 0.8 || u > H.w - 0.8 || d.lamp) continue;
        if (H.windows.some(wd => wd.f === 0 && wd.st === 0 && Math.abs(wd.u - u) < 1.3)) continue;
        const base = d.F(u, 0, 0.45), gy = hAt(base.x, base.z), rot = Math.atan2(d.fn[0], d.fn[1]);
        const BF = frame(base.x, gy, base.z, rot);
        barrel((x, y, z) => BF(x - 0.34, y, z), -0.02); barrel((x, y, z) => BF(x + 0.34, y, z), -0.02, 0.3, 0.82, shade(C.wood, 0.05));
        barrel(BF, 0.8, 0.29, 0.78, shade(C.wood, -0.04));
        W.addBox({ x: base.x, z: base.z, hx: 0.72, hz: 0.38, rot, top: gy + 1.0, tag: 'town-barrels' });
        const p = BF(0.05, 1.58, 0.02), y = topAt(p.x, p.z, p.y + 0.05);
        ANCH.push({ id: 'town-barrels', kind: 'ledge', pos: new V3(p.x, y ?? p.y, p.z), facing: yawOf(...d.fn), space: 0.3, note: `on the stack of barrels by the ${houseDesc(H)}`, tags: ['low', 'barrels'] });
        break;
      }
      // lanterns along the lanes
      const laneLamps = [['east', 12, -1], ['southeast', 13, 1], ['west', 12, -1], ['church', 10, 1], ['road', 20, 1]];
      for (const [id, s0, side] of laneLamps) {
        const ln = LANES.find(l => l.id === id);
        for (let s = s0; s < ln.len - 1; s += 1.5) {
          const p = laneAt(ln, s), nx = -p.tz * side, nz = p.tx * side, off = ln.hw + 0.35;
          const x = p.x + nx * off, z = p.z + nz * off;
          if (occ.some(o => rectDist(o, x, z) < 0.5) || trees.some(t => Math.hypot(t.x - x, t.z - z) < t.rad * 0.7 + 0.4)) continue;
          const note = id === 'east' ? 'on top of the lantern on the east lane' : id === 'road' ? 'on top of the lantern where the road comes into the village' : null;
          streetLamp(x, z, Math.atan2(-nx, -nz), note, note ? 'town-lamp-' + id : null);
          break;
        }
      }
      buildWashingLine(r);
      // hanging shop signs on two houses of the square (a loaf for the baker, a bunch of grapes for the cafe)
      const signDoors = doorList.filter(({ H, d }) => H.onSquare && !d.lamp && H.eave > 4).slice(0, 2);
      signDoors.forEach(({ H, d }, k) => {
        const u = d.u + (d.u + d.w / 2 + 0.6 < H.w - 0.3 ? 1 : -1) * (d.w / 2 + 0.38), y = d.g0 + 2.8, F = d.F;
        beam(B.trim, F(u, y, 0), F(u, y, 1.05), 0.04, 0.05, C.iron, { ink: 0.5 });
        for (const o of [0.35, 0.85]) beam(B.trim, F(u, y, o), F(u, y - 0.18, o), 0.015, 0.015, C.iron, { ink: 0 });
        const SF = (x, yy, z) => F(u + z, yy, 0.6 + x); // board plane perpendicular to the wall
        boxF(SF, -0.3, 0.3, y - 0.62, y - 0.18, -0.025, 0.025, k ? '#4a5a3a' : '#8a5a36', B.trim, { skip: [], band: 0.35 });
        for (const side of [1, -1]) {
          const DF2 = (x, yy, z) => SF(x, yy, side * (0.026 + z));
          if (!k) boxF(DF2, -0.16, 0.16, y - 0.47, y - 0.33, 0, 0.012, '#d8b060', B.trim, { skip: ['back'], band: 0.4 }); // the loaf
          else for (const [gx, gy] of [[0, -0.34], [-0.07, -0.4], [0.07, -0.4], [0, -0.46], [-0.04, -0.52], [0.04, -0.52]])
            boxF(DF2, gx - 0.04, gx + 0.04, y + gy - 0.04, y + gy + 0.04, 0, 0.012, '#6a3a6a', B.trim, { skip: ['back'], ink: 0.3 }); // grapes
        }
      });
    }
    // a washing line strung across a lane between two facing upper floors
    let washLine = null;
    function buildWashingLine(r) {
      let best = null;
      for (const ln of LANES) {
        const L = houses.filter(H => H.lane === ln && !H.back && H.storeys === 2);
        for (const a of L) for (const b of L) {
          if (a.side !== 1 || b.side !== -1) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z), gap = d - a.d / 2 - b.d / 2;
          if (gap < 3.5 || gap > 7.5) continue;
          const pa = a.X(0, 0, a.d / 2), pb = b.X(0, 0, b.d / 2), along = Math.abs((pa.x - pb.x) * a.front[1] - (pa.z - pb.z) * a.front[0]);
          const score = along + Math.hypot(a.x - 6, a.z - 16) * 0.05;
          if (along < 3 && (!best || score < best.score)) best = { a, b, score };
        }
      }
      if (!best) return;
      const { a, b } = best, yLine = Math.min(a.eave, b.eave) - 1.1;
      const pa = a.X(0, yLine, a.d / 2 + 0.05), pb = b.X(0, yLine, b.d / 2 + 0.05);
      pa.y = a.gy + yLine; pb.y = b.gy + yLine;
      const N = 10, pts = [];
      for (let k = 0; k <= N; k++) { const t = k / N; const p = pa.clone().lerp(pb, t); p.y -= Math.sin(Math.PI * t) * 0.45; pts.push(p); }
      for (let k = 0; k < N; k++) beam(B.trim, pts[k], pts[k + 1], 0.025, 0.025, '#c8c0a8', { ink: 0 });
      washLine = { a: pa.toArray(), b: pb.toArray(), lane: a.lane.id };
      for (const p of [pa, pb]) boxF(frame(p.x, p.y, p.z, 0), -0.05, 0.05, -0.05, 0.05, -0.05, 0.05, C.iron, B.trim, { skip: [] });
      const dir = new V3().subVectors(pb, pa); const rot = Math.atan2(-dir.z, dir.x);
      const cloth = ['#dfe3e6', '#a9c2dd', '#d6c08a', '#c9d4db', '#d9a58f', '#8fb0c8', '#e8e0cc'];
      for (let k = 0; k < 6; k++) {
        const t = 0.14 + k * 0.145 + r.range(-0.02, 0.02), p = pa.clone().lerp(pb, t); p.y -= Math.sin(Math.PI * t) * 0.45;
        const w = r.range(0.35, 0.6), h = r.range(0.45, 0.9), F = frame(p.x, p.y, p.z, rot + r.range(-0.08, 0.08));
        boxF(F, -w / 2, w / 2, -h, 0, -0.015, 0.015, r.pick(cloth), B.trim, { skip: [], band: 0.2 });
      }
    }

    // ============================================================ warm light spilling onto the ground
    // Warm pools in front of lit windows and under lanterns: one additive mesh whose blending leaves
    // the target's alpha (the post-process mask) untouched. A window's pool is a feathered trapezoid
    // whose near edge touches the facade and which widens away from it (ground floor: brightest just
    // off the wall; upstairs: a fainter pool that lands a little farther out). On the lane / square
    // ribbons the light is a smooth warm glow; where it falls on grass it is halved, turned a warm
    // yellow-green (it lifts the grass instead of painting a beige disc) and broken into dashes by
    // a stroke texture, so it never reads as an object lying on the lawn.
    function buildSpill() {
      const pos = [], col = [], uv = [], brk = [], idx = [];
      const warm = new THREE.Color('#ffae55'), grass = new THREE.Color('#d9cf6a'), tmp = new THREE.Color();
      // 1 on paved / trodden ground, 0 on grass: the cobbles and lane ribbons plus the strip of
      // bare earth up to the house fronts, and the village's earthen heart (the landscape paints
      // the plateau as earth inside a wandering radius of ~35-45 m and grass beyond it)
      const EARTH_IN = 31, EARTH_OUT = 38;
      const pavedAt = (x, z, lanes) => {
        let d = Math.hypot(x - SQ.x, z - SQ.z) - (SQ_R + 1.7);
        for (const ln of lanes) d = Math.min(d, laneClear(x, z, ln) - 1.2);
        const r0 = Math.hypot(x - VIL.x, z - VIL.z), re = r0 + 6 * SN.fbm2(x * 0.035 - 11, z * 0.035 + 4, 2);
        return Math.max(1 - smoothstep(-0.2, 0.5, d), 1 - smoothstep(EARTH_IN, EARTH_OUT, re));
      };
      const lanesNear = (x, z, rad) => LANES.filter(ln => laneClear(x, z, ln) < rad + 2.4);
      const vert = (x, z, k, lanes, u, v) => {
        const pv = pavedAt(x, z, lanes);
        const kk = k * lerp(0.48, 1, pv);
        tmp.copy(grass).lerp(warm, pv);
        pos.push(x, hAt(x, z) + 0.07, z); col.push(tmp.r * kk, tmp.g * kk, tmp.b * kk); uv.push(u, v); brk.push(1 - pv);
        return pos.length / 3 - 1;
      };
      // pool(cx, cz, fx, fz, ...): a feathered grid from the wall point (cx, cz) out along (fx, fz)
      //   a0..a1 distance from the wall, w0 / w1 half-widths at the wall / far end, FA intensity
      //   profile along (at AT), k overall strength
      const AT = [0, 0.16, 0.42, 0.72, 1], BT = [-1, -0.52, 0, 0.52, 1], FB = [0, 0.66, 1, 0.66, 0];
      const pool = (cx, cz, fx, fz, a0, a1, w0, w1, FA, k, seed) => {
        const sx = -fz, sz = fx, rows = [], mid = (a0 + a1) / 2;
        const lanes = lanesNear(cx + fx * mid, cz + fz * mid, (a1 - a0) / 2 + w1 + 0.5);
        for (let i = 0; i < AT.length; i++) {
          const t = AT[i], a = lerp(a0, a1, t), hw = lerp(w0, w1, t);
          rows.push(BT.map((bt, j) => {
            const wob = 1 + 0.16 * SN.noise2(seed + i * 0.7, j * 0.9) * Math.abs(bt), b = bt * hw * wob;
            const aa = a + (i ? 0.18 * SN.noise2(seed - j * 0.8, i * 1.3) * (t * (1 - t) * 4 + (i === AT.length - 1 ? 1 : 0)) : 0);
            const x = cx + fx * aa + sx * b, z = cz + fz * aa + sz * b;
            return vert(x, z, k * FA[i] * FB[j], lanes, b * 0.55, aa * 0.55);
          }));
        }
        for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < BT.length - 1; j++) {
          const p = rows[i][j], q = rows[i][j + 1], r2 = rows[i + 1][j + 1], s2 = rows[i + 1][j];
          idx.push(p, q, s2, q, r2, s2); // counter-clockwise seen from above
        }
      };
      const FA_GROUND = [0.6, 1, 0.74, 0.3, 0], FA_UP = [0, 0.62, 1, 0.45, 0];
      for (const H of houses) for (const wd of H.windows) {
        if (!wd.lit || wd.attic || wd.shut === 'closed') continue;
        const p = H.FR[wd.f](wd.u, 0, 0.03), [fx, fz] = H.faceN[wd.f], seed = H.id * 3.1 + wd.u;
        if (wd.st === 0) pool(p.x, p.z, fx, fz, 0, 2.8, wd.w * 0.62, wd.w * 1.25, FA_GROUND, 0.18, seed);
        else pool(p.x, p.z, fx, fz, 0.35, 3.6, wd.w * 0.8, wd.w * 1.45, FA_UP, 0.075, seed);
      }
      // lantern pools: feathered discs (rings falling off to 0)
      const RING = [[0, 1], [0.3, 0.8], [0.58, 0.42], [0.8, 0.14], [1, 0]], SEG = 14;
      for (const l of lamps) {
        const k = l.r > 7 ? 0.13 : 0.09, R2 = 2.9, lanes = lanesNear(l.x, l.z, R2), base = [];
        for (const [rf, kf] of RING) {
          const ring = [];
          for (let i = 0; i < (rf ? SEG : 1); i++) {
            const t = (TAU * i) / SEG, wob = 1 + 0.12 * Math.sin(t * 3 + l.x) * rf, x = l.x + Math.cos(t) * R2 * rf * wob, z = l.z + Math.sin(t) * R2 * rf * wob;
            ring.push(vert(x, z, k * kf, lanes, x * 0.55, z * 0.55));
          }
          base.push(ring);
        }
        for (let i = 0; i < SEG; i++) idx.push(base[0][0], base[1][(i + 1) % SEG], base[1][i]);
        for (let k2 = 1; k2 < RING.length - 1; k2++) for (let i = 0; i < SEG; i++) {
          const a = base[k2][i], b = base[k2][(i + 1) % SEG], c = base[k2 + 1][(i + 1) % SEG], d = base[k2 + 1][i];
          idx.push(a, b, d, b, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('brk', new THREE.Float32BufferAttribute(brk, 1));
      g.setIndex(idx); g.computeBoundingSphere();
      // dashes for the grass: pale strokes on black, running parallel to the wall (u), ~55% cover
      const dash = SN.paint.texture({ size: 256, base: '#000000', colors: [['#ffffff', 2], ['#d8d8d8', 2], ['#9a9a9a', 1]], count: 75, len: [34, 80], width: [11, 19], alpha: [0.75, 1], angle: 0, jitter: 0.28, curve: 0.25, light: 0, seed: 4127 }, { key: 'town-spill-dash' });
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, map: dash, transparent: true, depthWrite: false, fog: false });
      m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
      m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -6; m.name = 'town-spill';
      m.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float brk;\nvarying float vBrk;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\nvBrk = brk;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBrk;')
          .replace('#include <map_fragment>', 'diffuseColor.rgb *= mix(vec3(1.0), texture2D(map, vMapUv).rgb * 1.55, vBrk);');
      };
      m.customProgramCacheKey = () => 'town-spill';
      return [g, m];
    }

    // ============================================================ chimney smoke
    // A few chimneys breathe: each sends up a slow ribbon of painted dashes that leans with the
    // breeze and curls over at the top like the sky's swirls (an Euler-spiral hook), dark
    // blue-grey dabs with pale bristle edges. The dashes flow up the ribbon, dissolve bristle by
    // bristle as they age and are reborn at the pot; the ribbon itself sways slowly. One draw
    // call: an instanced camera-facing quad per dash, oriented along the ribbon in view space,
    // opaque alpha-tested paint (mask 1, so the post brushes it in like everything else).
    // Chosen chimneys are visible from the painter's hill, keep clear of the spire and never
    // belong to a house with a cat chimney anchor; once the cats are placed, any column that
    // could cover a cat (in 3D or from the usual vantage points) is dropped for a spare.
    // Reduced motion eases the flow to a stop: one still, painted curl per chimney.
    function paintSmoke() {
      const Wd = 256, Hc = 64, cv = document.createElement('canvas'); cv.width = Wd; cv.height = Hc * 4;
      const g = cv.getContext('2d'), r = SN.rng('town-smoke-tex');
      g.lineCap = 'round';
      for (let cell = 0; cell < 4; cell++) {
        const yc = cell * Hc + Hc / 2, NB = 9, bow = (cell & 1 ? 1 : -1) * r.range(3, 7);
        for (let j = 0; j < NB; j++) {
          const t = (j / (NB - 1)) * 2 - 1, edge = Math.abs(t);
          const half = (Wd / 2 - 16) * Math.sqrt(1 - t * t * 0.75) * r.range(0.8, 1), xc = Wd / 2 + r.range(-8, 8);
          // the upper rim bristle catches the moon (pale), the lower one a little; the body stays dark
          const yy = yc + t * (Hc / 2 - 10) + r.range(-1.5, 1.5), v = j === 0 ? r.range(225, 255) : j === 1 ? r.range(40, 75) : j === NB - 1 ? r.range(30, 60) : r.range(0, 18);
          g.strokeStyle = `rgb(${v | 0},${v | 0},${v | 0})`; // red = how much of the pale rim colour this bristle carries
          g.globalAlpha = r.range(0.62, 1); g.lineWidth = r.range(5, 8);
          g.beginPath(); g.moveTo(xc - half, yy - bow * 0.3); g.quadraticCurveTo(xc, yy + bow, xc + half, yy - bow * 0.3 + r.range(-3, 3)); g.stroke();
        }
      }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = true; // a linear mask, premultiplied so the mips average it correctly
      t.anisotropy = Math.min(4, SN.renderer.capabilities.getMaxAnisotropy());
      return t;
    }
    function buildSmoke() {
      const r = SN.rng('town-smoke'), eyeY = hAt(START.x, START.z) + SN.player.eye;
      const E = new V3(START.x, eyeY, START.z), WIND = new V3(1, 0, -0.35).normalize(), WP = new V3(-WIND.z, 0, WIND.x);
      const cypress = LAY.cypress, TOWER_TOP = church.tipHeight + hAt(CH.x, CH.z);
      const noCat = new Set(ANCH.filter(a => a.kind === 'chimney').map(a => a.data?.house));
      // --- does the segment E -> Q pass through a house, the church, a tree canopy, the cypress or the hill?
      const clipBox = (rect, y0, y1, Q) => {
        const [ex, ez] = rectLocal(rect, E.x, E.z), [qx, qz] = rectLocal(rect, Q.x, Q.z);
        let t0 = 0, t1 = 1;
        for (const [p, d, lo, hi] of [[ex, qx - ex, -rect.hw, rect.hw], [ez, qz - ez, -rect.hd, rect.hd], [E.y, Q.y - E.y, y0, y1]]) {
          if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
          let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
        }
        return t1 < 0.995; // touching the target itself does not count
      };
      const segSphere = (Q, cx, cy, cz, rad) => {
        const dx = Q.x - E.x, dy = Q.y - E.y, dz = Q.z - E.z, L2 = dx * dx + dy * dy + dz * dz;
        const t = clamp(((cx - E.x) * dx + (cy - E.y) * dy + (cz - E.z) * dz) / L2, 0, 0.98);
        return (E.x + dx * t - cx) ** 2 + (E.y + dy * t - cy) ** 2 + (E.z + dz * t - cz) ** 2 < rad * rad;
      };
      const churchH = [TOWER_TOP - hAt(CH.x, CH.z), 10.6, 9];
      const churchRects = occ.filter(o => o.kind === 'church');
      function blocked(Q, own) {
        for (const H of houses) if (H !== own && clipBox(H.rect, H.gy + H.base, H.gy + lerp(H.eave, H.ridge, 0.6), Q)) return true;
        for (let i = 0; i < churchRects.length; i++) if (clipBox(churchRects[i], hAt(CH.x, CH.z) - 1, hAt(CH.x, CH.z) + churchH[i], Q)) return true;
        for (const t of trees) {
          if (t.kind === 'bush') continue;
          const cy = t.gy + t.trunkH + (t.h - t.trunkH) * 0.5;
          if (t.kind === 'tall' ? segSphere(Q, t.x, cy - t.h * 0.2, t.z, t.rad) || segSphere(Q, t.x, cy + t.h * 0.15, t.z, t.rad * 0.8) : segSphere(Q, t.x, cy, t.z, t.rad * 0.9)) return true;
        }
        const dx = Q.x - E.x, dz = Q.z - E.z, L = Math.hypot(dx, dz);
        { const t = clamp(((cypress.x - E.x) * dx + (cypress.z - E.z) * dz) / (L * L), 0, 1); if (Math.hypot(E.x + dx * t - cypress.x, E.z + dz * t - cypress.z) < 3.2 && lerp(E.y, Q.y, t) < hAt(cypress.x, cypress.z) + cypress.height) return true; }
        for (let d = 3; d < L - 3; d += 2.5) { const t = d / L; if (lerp(E.y, Q.y, t) < hAt(E.x + dx * t, E.z + dz * t) + 0.3) return true; }
        return false;
      }
      // --- the ribbon: an arc-length polyline from the pot, leaning downwind and curling over
      const NS = 20;
      const pathOf = (c, clock, out) => {
        const L = c.len, ds = L / NS, lean = 0.1 + 0.06 * Math.sin(clock * 0.19 + c.ph), curl = c.curl + 0.35 * Math.sin(clock * 0.13 + c.ph * 1.7);
        let x = c.top.x, y = c.top.y + 0.12, z = c.top.z;
        for (let k = 0; k <= NS; k++) {
          const s = k / NS, phi = lean + curl * Math.pow(s, 2.8), wob = 0.4 * s * Math.sin(s * 4.2 + clock * 0.37 + c.ph);
          const o = out[k] || (out[k] = { x: 0, y: 0, z: 0, phi: 0 });
          o.x = x + WP.x * wob; o.y = y; o.z = z + WP.z * wob; o.phi = phi;
          const sp = Math.sin(phi), cp = Math.cos(phi);
          x += WIND.x * sp * ds; y += cp * ds; z += WIND.z * sp * ds;
        }
        return out;
      };
      // --- candidates: visible from the hill, clear of the spire and of the cat chimneys
      const azOf = (x, z) => Math.atan2(-(x - E.x), -(z - E.z));
      const elOf = (x, y, z) => Math.atan2(y - E.y, Math.hypot(x - E.x, z - E.z));
      const spireAz = azOf(CH.x, CH.z), spireHalf = Math.atan2(3.2, Math.hypot(CH.x - E.x, CH.z - E.z));
      const cands = [];
      for (const ch of chimneys) {
        if (noCat.has(ch.H.id)) continue;
        const dist = Math.hypot(ch.top.x - E.x, ch.top.z - E.z);
        if (dist < 45 || dist > 125 || Math.hypot(ch.top.x - CH.x, ch.top.z - CH.z) < 11) continue;
        const c = { H: ch.H, top: ch.top, x: ch.top.x, z: ch.top.z, len: r.range(8, 9.6), curl: r.range(2.6, 3.2), ph: r() * TAU, scale: r.range(0.9, 1.1) };
        const pts = pathOf(c, 0, []);
        let clear = 0;
        for (const k of [4, 10, 16]) if (!blocked(new V3(pts[k].x, pts[k].y, pts[k].z), ch.H)) clear++;
        if (clear < 2) continue;
        const azMin = Math.min(...pts.map(p => Math.abs(azOf(p.x, p.z) - spireAz))) - spireHalf;
        if (azMin < 3 * SN.deg) continue;
        cands.push({ ...c, sx: azOf(c.x, c.z) * 400, sz: elOf(c.x, c.top.y, c.z) * 400, clear });
      }
      // spread across the view (farthest-point in view angles), starting right of the square
      const picks = spreadPick(cands.map(c => ({ ...c, c, x: c.sx, z: c.sz })), 8, { x: azOf(4, 16) * 400, z: elOf(4, 8, 16) * 400 }).map(p => p.c);
      const MAXC = 4, PER = { high: 18, medium: 15, low: 9 };
      // --- instanced dashes
      const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
      const NMAX = MAXC * PER.high;
      const aPos = new THREE.InstancedBufferAttribute(new Float32Array(NMAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
      const aDir = new THREE.InstancedBufferAttribute(new Float32Array(NMAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
      const aSize = new THREE.InstancedBufferAttribute(new Float32Array(NMAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
      const aTint = new THREE.InstancedBufferAttribute(new Float32Array(NMAX * 4), 4);
      geo.setAttribute('iPos', aPos); geo.setAttribute('iDir', aDir); geo.setAttribute('iSize', aSize); geo.setAttribute('iTint', aTint);
      const TINTS = [['#2b395c', 3], ['#334266', 3], ['#3c4c72', 2], ['#4a5c84', 1]], tc = new THREE.Color();
      const dabs = Array.from({ length: PER.high }, (_, i) => ({ sc: r.range(0.85, 1.15), off: r.range(-0.3, 0.3), cell: r.int(0, 3), tint: wpick(r, TINTS)[0], j: r.range(-0.02, 0.02) }));
      for (let n = 0; n < NMAX; n++) {
        const d = dabs[n % PER.high]; tc.set(d.tint).multiplyScalar(r.range(0.93, 1.07));
        aTint.setXYZW(n, tc.r, tc.g, tc.b, d.cell);
      }
      const mat = new THREE.MeshBasicMaterial({ map: paintSmoke(), fog: true }), uPale = { value: new THREE.Color('#95a6c6') };
      mat.name = 'town-smoke';
      mat.onBeforeCompile = sh => {
        sh.uniforms.uPale = uPale;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 iPos;\nattribute vec3 iDir;\nattribute vec3 iSize;\nattribute vec4 iTint;\nvarying float vCut;\nvarying vec3 vTint;\nvarying vec2 vSUv;')
          .replace('#include <project_vertex>', `
vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
vec2 al = (mat3(modelViewMatrix) * iDir).xy; float alL = length(al);
al = alL > 1e-4 ? al / alL : vec2(0.0, 1.0);
vec2 pe = vec2(-al.y, al.x);
mvPosition.xy += al * position.x * iSize.x + pe * position.y * iSize.y;
gl_Position = projectionMatrix * mvPosition;
vCut = iSize.z; vTint = iTint.rgb; vSUv = vec2(uv.x, (uv.y + iTint.w) * 0.25);`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uPale;\nvarying float vCut;\nvarying vec3 vTint;\nvarying vec2 vSUv;')
          .replace('#include <map_fragment>', `
vec4 st = texture2D(map, vSUv);
if (st.a < vCut) discard;
diffuseColor.rgb *= mix(vTint, uPale, clamp(st.r / max(st.a, 1e-3), 0.0, 1.0)); // dark blue-grey dash, pale bristle rims
diffuseColor.a = 1.0;`);
      };
      mat.customProgramCacheKey = () => 'town-smoke';
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'town-smoke'; mesh.matrixAutoUpdate = false; mesh.visible = false;
      mesh.userData.noOcclude = true; mesh.raycast = () => {}; // never an occluder or a spot target
      geo.instanceCount = 0;
      const S = { cols: [], picks, clock: null, speed: SN.reducedMotion ? 0 : 1, mesh, checked: false, dropped: [] };
      const paths = [];
      // envelope of a column over a while (for the cat checks)
      const envelope = c => { const pts = []; for (const ck of [0, 9, 17, 26, 35]) for (const p of pathOf(c, ck, [])) pts.push(new V3(p.x, p.y, p.z)); return pts; };
      const VANTAGE = [E, new V3(SQ.x, 1.65, SQ.z), new V3(-6, hAt(-6, 48) + 1.65, 48), new V3(0, 1.65, -12), new V3(-3, 1.65, 30)];
      function coversCat(c, catPts) {
        const env = envelope(c);
        for (const C of catPts) {
          if (Math.hypot(C.x - c.top.x, C.z - c.top.z) < 6.5) return true; // don't draw the eye to a cat's house
          for (const P of env) if (P.distanceTo(C) < 2.4) return true;
          for (const V of VANTAGE) {
            const dc = C.distanceTo(V), vc = new V3().subVectors(C, V).normalize();
            for (const P of env) {
              const dp = P.distanceTo(V); if (dp > dc) continue;
              const ang = Math.acos(clamp(vc.dot(new V3().subVectors(P, V).normalize()), -1, 1));
              if (ang < Math.atan2(0.9, dp) + 0.8 * SN.deg) return true;
            }
          }
        }
        return false;
      }
      S.choose = () => { // runs once the cats are placed (first frame after 'ready', and after each 'catsHidden')
        let catPts = [];
        S.dropped = [];
        try { catPts = (SN.modules.cats?.list?.() || []).filter(k => !/^sky/.test(k.anchorId || '') && Math.abs(k.pos[1]) < 150).map(k => new V3(...k.pos)); } catch { catPts = []; }
        S.cols = [];
        for (const c of S.picks) {
          if (S.cols.length >= MAXC) break;
          if (catPts.length && coversCat(c, catPts)) { S.dropped.push(c.H.id); continue; }
          S.cols.push(c);
        }
        if (S.cols.length) {
          const ctr = new V3(); S.cols.forEach(c => ctr.add(c.top)); ctr.multiplyScalar(1 / S.cols.length);
          geo.boundingSphere = new THREE.Sphere(ctr, Math.max(...S.cols.map(c => c.top.distanceTo(ctr))) + 9);
        }
        S.checked = true; mesh.visible = S.cols.length > 0;
      };
      S.update = (dt, t) => {
        if (!S.checked || !S.cols.length) return;
        if (S.clock === null) S.clock = t;
        S.speed += ((SN.reducedMotion ? 0 : 1) - S.speed) * Math.min(1, dt * 0.9);
        if (S.speed < 0.002 && SN.reducedMotion) S.speed = 0;
        S.clock += dt * S.speed;
        const per = PER[SN.quality] || PER.high, n = S.cols.length;
        let k = 0;
        for (let ci = 0; ci < n; ci++) {
          const c = S.cols[ci], P = pathOf(c, S.clock, paths[ci] || (paths[ci] = [])), T = 14 * c.scale;
          for (let i = 0; i < per; i++, k++) {
            const d = dabs[i], age = (((S.clock / T + i / per + c.ph * 0.1 + d.j) % 1) + 1) % 1;
            const u = (1 - Math.pow(1 - age, 1.4)) * NS, i0 = Math.min(NS - 1, Math.floor(u)), f = u - i0, p0 = P[i0], p1 = P[i0 + 1];
            const phi = lerp(p0.phi, p1.phi, f), sp = Math.sin(phi), cp = Math.cos(phi), s = u / NS;
            // perpendicular offset in the ribbon plane (two loose strands, widening with height)
            const off = (i % 2 ? 1 : -1) * (0.04 + 0.24 * s) * c.scale + d.off * 0.12 * s;
            const nx = WIND.x * cp, ny = -sp, nz = WIND.z * cp;
            aPos.setXYZ(k, lerp(p0.x, p1.x, f) + nx * off, lerp(p0.y, p1.y, f) + ny * off, lerp(p0.z, p1.z, f) + nz * off);
            aDir.setXYZ(k, WIND.x * sp, cp, WIND.z * sp);
            const len = (0.62 + 0.95 * s) * d.sc * c.scale * (per < 12 ? 1.35 : 1);
            const cut = 0.3 + 0.78 * smoothstep(0.64, 1, age) + 0.75 * (1 - smoothstep(0, 0.07, age));
            aSize.setXYZ(k, len, len * (0.27 + 0.08 * s), cut);
          }
        }
        geo.instanceCount = k;
        aPos.needsUpdate = aDir.needsUpdate = aSize.needsUpdate = true;
      };
      return S;
    }

    // ============================================================ build everything
    const church = buildChurch();
    buildSquare();
    const T1 = performance.now();
    placeTrees();
    const treeMs = Math.round(performance.now() - T1);
    placeWalls();
    placeClutter();
    // colliders for every house
    for (const H of houses) W.addBox({ x: H.x, z: H.z, hx: H.w / 2, hz: H.d / 2, rot: H.rot, tag: 'town-house' });

    // ------------------------------------------------------------ anchors: pick a varied spread
    const pickN = (list, n, first = WELL) => spreadPick(list, n, first);
    for (const c of pickN(cand.ridge, 5)) ANCH.push({ id: `town-ridge-${c.H.id}`, kind: 'roof-ridge', pos: c.pos, facing: c.facing, space: c.space, note: `on the roof ridge of the ${houseDesc(c.H)}`, tags: ['roof', 'high'], data: { house: c.H.id } });
    for (const c of pickN(cand.slope, 3, { x: 20, z: 20 })) ANCH.push({ id: `town-slope-${c.H.id}`, kind: 'roof-slope', pos: c.pos, facing: c.facing, space: c.space, surface: 'slope', note: `on the roof of the ${houseDesc(c.H)}`, tags: ['roof', 'high'], data: { house: c.H.id, normal: c.normal } });
    for (const c of pickN(cand.chimney, 4, { x: -20, z: -10 })) ANCH.push({ id: `town-chimney-${c.H.id}`, kind: 'chimney', pos: c.pos, facing: c.facing, space: c.space, note: `on the chimney of the ${houseDesc(c.H)}`, tags: ['roof', 'high'], data: { house: c.H.id } });
    for (const c of cand.sill) ANCH.push({ id: `town-sill-${c.H.id}-${c.H.windows.indexOf(c.wd)}`, kind: 'window', pos: c.pos, facing: c.facing, space: c.space, note: `on the sill of a lit ${c.wd.st ? 'upstairs' : 'ground-floor'} window of the ${houseDesc(c.H)}`, tags: ['window', c.wd.st ? 'high' : 'low', 'glow'], data: { house: c.H.id } });
    for (const c of pickN(cand.door, 3, { x: 25, z: -5 })) ANCH.push({ id: `town-door-${c.H.id}`, kind: 'doorway', pos: c.pos, facing: c.facing, space: c.space, note: `on the doorstep of the ${houseDesc(c.H)}`, tags: ['low'], data: { house: c.H.id } });
    for (const c of pickN(cand.pot, 2, { x: -25, z: 15 })) ANCH.push({ id: `town-pot-${c.H.id}`, kind: 'garden', pos: c.pos, facing: c.facing, space: 0.4, note: `beside the flower pot at the door of the ${houseDesc(c.H)}`, tags: ['low', 'flowers'], data: { house: c.H.id } });
    {
      const wc = walls.map(w => {
        const t = 0.5, x = lerp(w.ax, w.bx, t), z = lerp(w.az, w.bz, t), y = topAt(x, z, hAt(x, z) + w.h + 0.5);
        const { lane } = nearestLane(x, z), q = nearestLanePoint(lane, x, z);
        const nx = Math.sin(w.rot), nz = Math.cos(w.rot), sgn = (q.x - x) * nx + (q.z - z) * nz > 0 ? 1 : -1;
        return { w, x, z, pos: y == null ? null : new V3(x, y, z), facing: yawOf(nx * sgn, nz * sgn) };
      }).filter(c => c.pos);
      for (const c of pickN(wc, 3, { x: 0, z: 30 })) ANCH.push({ id: `town-wall-${walls.indexOf(c.w)}`, kind: 'wall-top', pos: c.pos, facing: c.facing, space: 0.35, note: `on the garden wall behind the ${c.w.H ? houseDesc(c.w.H) : 'houses'}`, tags: ['wall', 'low'] });
    }
    for (const t of trees.filter(t => t.branch)) {
      const p = t.branchTip.clone().lerp(new V3(t.x, t.branchTip.y, t.z), 0.3), y = topAt(p.x, p.z, p.y + 0.3);
      ANCH.push({ id: `town-branch-${t.id}`, kind: 'tree-branch', pos: new V3(p.x, y ?? p.y + 0.1, p.z), facing: t.branchYaw, space: 0.4, note: `on a low branch of the dark tree ${whereOf(t.x, t.z, nearestLane(t.x, t.z).lane)}`, tags: ['tree'] });
    }
    {
      const tall = trees.filter(t => t.kind === 'tall');
      for (const t of spreadPick(tall.map(t => ({ ...t, t })), 1, { x: 0, z: 0 }).map(c => c.t)) {
        const { lane } = nearestLane(t.x, t.z), q = nearestLanePoint(lane, t.x, t.z), dx = q.x - t.x, dz = q.z - t.z, dl = Math.hypot(dx, dz) || 1;
        const d = Math.max(t.rad + 0.25, t.reachLow + 0.3, t.colR + 0.15); // clear of the foliage and the collider
        const x = t.x + (dx / dl) * d, z = t.z + (dz / dl) * d;
        ANCH.push({ id: `town-treebase-${t.id}`, kind: 'tree-base', pos: new V3(x, hAt(x, z), z), facing: yawOf(dx, dz), space: 0.5, note: `at the foot of the tall dark tree ${whereOf(t.x, t.z, lane)}`, tags: ['tree', 'low'] });
      }
    }
    for (const a of ANCH) anchors.push(W.addAnchor({ ...a, module: 'town' }));
    const T2 = performance.now(), smoke = buildSmoke(), smokeMs = Math.round(performance.now() - T2);

    // ------------------------------------------------------------ meshes
    const group = new THREE.Group(); group.name = 'town';
    const meshes = {};
    const mk = (name, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.name = 'town-' + name; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); meshes[name] = m; return m; };
    mk('walls', B.wall.geometry(), MAT.wall);
    mk('roofs', B.roof.geometry(), MAT.roof);
    mk('trim', B.trim.geometry(), MAT.trim);
    mk('glow', B.glow.geometry(), MAT.glow);
    mk('trees', B.tree.geometry(), MAT.tree);
    const ground = mk('ground', buildGround(), MAT.ground); ground.renderOrder = -1;
    const [spG, spM] = buildSpill(); mk('spill', spG, spM).renderOrder = 1;
    SN.scene.add(group);
    lamps.forEach((l, i) => U.uLamp.value[i].set(l.x, l.y, l.z, l.r));
    group.add(smoke.mesh);
    // the smoke columns steer clear of the cats: chosen once the cats are placed, and again after every
    // hiding ('catsHidden': the first play and each Play again put the cats somewhere new)
    let smokeReady = false;
    SN.on('ready', () => { smokeReady = true; });
    SN.on('catsHidden', () => { smoke.checked = false; });
    SN.onUpdate((dt, t) => {
      U.uTime.value = t;
      if (smokeReady && !smoke.checked) {
        smoke.choose();
        if (SN.params.test) console.log('[town-smoke]', JSON.stringify({ columns: smoke.cols.map(c => c.H.id), dropped: smoke.dropped, spares: smoke.picks.length }));
      }
      smoke.update(dt, t);
    }, 30);

    const tris = Object.values(meshes).reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
    const info = { houses: houses.length, trees: trees.length, walls: walls.length, lamps: lamps.length, anchors: anchors.length, triangles: Math.round(tris), drawCalls: group.children.length, spireTip: +church.tipHeight.toFixed(1), spireWanted, treeMs, smokeCandidates: smoke.picks.length, smokeMs, ms: Math.round(performance.now() - T0) };
    if (SN.params.test) console.log('[town]', JSON.stringify(info));
    if (SN.params.test && SN.params.debug?.includes?.('trees')) console.log('[town-trees]', JSON.stringify(trees.map(t => {
      const { lane } = nearestLane(t.x, t.z), q = nearestLanePoint(lane, t.x, t.z), dc = Math.hypot(q.x - t.x, q.z - t.z);
      return { id: t.id, k: t.kind, x: +t.x.toFixed(1), z: +t.z.toFixed(1), rad: +t.rad.toFixed(2), reach: +t.reachEye.toFixed(2), low: +t.reachLow.toFixed(2), bot: +t.bottom.toFixed(2), col: +t.colR.toFixed(2), lane: lane.id, gap: +(lane.hw + 0.25 + Math.min(lane.hw, dc - t.colR)).toFixed(2) };
    })));

    return {
      houses: houses.map(H => ({ x: H.x, z: H.z, w: H.w, d: H.d, h: H.eave, rot: H.rot, ridge: H.gy + H.ridge + 0.2, roof: H.roof, color: H.colorName, lane: H.lane?.id ?? null, litWindows: H.windows.filter(w => w.lit).length })),
      church: { x: CH.x, z: CH.z, rot: CH.rot, tower: CHURCH.T * 2, spireTip: church.tip.toArray(), door: church.door.toArray(), nave: { length: CHURCH.NL, width: CHURCH.NW * 2 } },
      lanes: LANES.map(l => ({ id: l.id, name: l.name, halfWidth: l.hw, points: l.pts })),
      lamps: lamps.map(l => [l.x, l.y, l.z]), washLine,
      trees: trees.map(t => ({ x: t.x, z: t.z, r: t.rad, h: t.h, kind: t.kind })),
      smoke: { mesh: smoke.mesh, get chimneys() { return smoke.cols.map(c => ({ house: c.H.id, top: c.top.toArray() })); } },
      anchors, meshes, group, topAt, surfaceNormal, info,
    };
  },
});