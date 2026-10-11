// 50-post.js — the painterly post-processing pipeline: turns the rendered 3D scene into a
// living Van Gogh oil painting. Owns rendering via SN.setPipeline (unless ?nopost).
//
// Chain (high / medium), all fullscreen triangles:
//   scene     SN.renderScene -> rtScene (full res, sRGB-encoded RGBA8 exactly as on the canvas +
//             DepthTexture; alpha = mask)
//   prep      4-tap downsample to the "work" res (<= 480 px tall), keeps the mask
//   tensor    per-channel Sobel structure tensor + a "geometric detail" weight    [half float]
//   blurX/Y   separable Gaussian; the Y pass solves the eigen-system into the flow field:
//             xy = anisotropy * (cos 2phi, sin 2phi) (filterable), z = edge strength, w = detail
//   kuwahara  anisotropic Kuwahara, polynomial sector weights (Kyprianidis et al. 2009/2010),
//             vectorised; flat oil patches elongated along the flow; cats & lights untouched
//   glowX/Y   glow sources (mask 0.5 and bright) blurred at half the work res; alpha carries a
//             wide blur of the detail weight (finer brushes on the village)
//   cells     tiny: one record per brush dash (direction, size, centre, depth, loaded colour)
//   composite full res: every pixel finds the top dash of its own depth layer covering it on a
//             view-anchored jittered grid (4x4 cells) and paints it with bristle streaks and
//             impasto relief; dashes refuse to cross colour edges (judged relative to
//             brightness); thin things at a depth step (gate rails, spokes: slits and bars)
//             get light outlines instead of lead-glass frames; cats stay
//             crisp; small things and near surfaces keep more of the scene; the sky (already
//             painted by its module) keeps its own dashes and only gains impasto relief; painted
//             halos; ultramarine contours (inverse-depth Laplacian + colour edges); a gentle
//             grade toward the painting; canvas weave; vignette
// low: rtScene at 0.6x (>= 1 Mpx) -> cells -> composite. No Kuwahara, no bloom; dashes take
// their colour from the scene and their direction from per-cell gradients.
//
// Anti-aliasing: the canvas has no MSAA (core creates it without, unless ?nopost), so rtScene is
// multisampled itself (4x on high/medium, 2x on low; three resolves colour and depth into the
// textures after each scene render). The resolved mask alpha is fractional along edges: a cat edge
// over paint lands near 0.5 and reads as "glow", which only keeps that pixel crisp. Depth resolves
// to one sample, so the contour pass filters it bilinearly by hand (DEPTH_AA) and the ink lines are
// smooth too; dash acceptance and the sky mask use it as it is.
// Disabled (no float colour buffers, or setEnabled(false)): the scene is drawn straight to the
// canvas with SN.renderSceneToScreen.
//
// Mask (scene alpha, see ARCHITECTURE.md): 1 paint, 0 keep crisp (cats), 0.5 glow source.
// Dev: ?postview=scene|kuwa|flow|strokes|lines|glow|mask|texture|accept   ?poststrength=0..2
//      ?postcfg=radius:3,sigma:2,msaa:0,depthAA:0 (override preset fields)
//      SN.modules.post.bench(60) / benchPasses(40) -> GPU-synchronised ms (each synced on the target it drew)
import * as THREE from 'three';

(window.SN_MODULES ||= []).push({
  name: 'post', order: 50,
  build(SN) {
    const renderer = SN.renderer, camera = SN.camera, P = SN.palette;
    const URL_Q = new URLSearchParams(location.search);

    // ------------------------------------------------------------ quality presets
    // scene: rtScene scale vs the drawing buffer. work: prep/tensor/Kuwahara scale (capped
    // at workMaxH px tall so cost stays flat on big screens). radius: Kuwahara radius in
    // work px at a 360 px-tall work buffer (scaled with it). spc: strokes per cell. msaa: samples
    // of the scene target (clamped to the GPU's maximum).
    const PRESETS = {
      high:   { low: false, scene: 1.0, work: 0.5, workMaxH: 480, radius: 4.0, strideAbove: 4.6, sigma: 2.0, spc: 2, glow: true, msaa: 4 },
      medium: { low: false, scene: 1.0, work: 0.5, workMaxH: 400, radius: 3.2, strideAbove: 3.4, sigma: 1.6, spc: 1, glow: true, msaa: 4 },
      low:    { low: true,  scene: 0.6, sceneMpx: 1.0, spc: 1, glow: false, msaa: 2 },   // scene: at most 0.6x, but >= 1 Mpx (phones stay sharp)
    };
    const DEBUG_VIEWS = { final: 0, scene: 1, kuwa: 2, flow: 3, strokes: 4, lines: 5, glow: 6, mask: 7, texture: 8, accept: 9 };

    // ------------------------------------------------------------ GLSL: shared chunks
    const VERT = /* glsl */`
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

    const COMMON = /* glsl */`
      varying vec2 vUv;
      float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
      float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec4 hash42(vec2 p) {
        vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
        p4 += dot(p4, p4.wzxy + 33.33);
        return fract((p4.xxyz + p4.yzzw) * p4.zywx);
      }
      float vnoise1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), f) * 2.0 - 1.0; }`;

    // prep: downsample the scene to the work resolution (4 bilinear taps = ~4x4 texels; the
    // scene is stored sRGB-encoded, so the filters work perceptually), carry the mask in alpha.
    const PREP_FRAG = /* glsl */`
      uniform sampler2D tScene; uniform vec2 uTexel;
      ${COMMON}
      void main() {
        vec2 o = uTexel * 0.25;
        vec4 s = texture2D(tScene, vUv + vec2(-o.x, -o.y)) + texture2D(tScene, vUv + vec2(o.x, -o.y))
               + texture2D(tScene, vUv + vec2(-o.x, o.y)) + texture2D(tScene, vUv + vec2(o.x, o.y));
        s *= 0.25;
        gl_FragColor = s;
      }`;

    // tensor: per-channel Sobel -> structure tensor (sum over RGB) (Kyprianidis 2009).
    // w = geometric detail: depth discontinuities (houses, roofs, trees — not textured ground or
    // sky) at mid distance, where objects are small on screen. Blurred with the tensor it becomes
    // a density that makes brushes finer on the village.
    const TENSOR_FRAG = /* glsl */`
      uniform sampler2D tSrc, tDepth; uniform vec2 uTexel; uniform float uNear, uFar;
      ${COMMON}
      vec3 at(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
      float invZ(vec2 o) { return (uFar - texture2D(tDepth, vUv + o).r * (uFar - uNear)) / (uNear * uFar); }
      void main() {
        vec3 tl = at(-1.0, 1.0), t = at(0.0, 1.0), tr = at(1.0, 1.0);
        vec3 l = at(-1.0, 0.0), r = at(1.0, 0.0);
        vec3 bl = at(-1.0, -1.0), b = at(0.0, -1.0), br = at(1.0, -1.0);
        vec3 gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
        vec3 gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
        float w0 = invZ(vec2(0.0));
        float lap = abs(invZ(vec2(uTexel.x, 0.0)) + invZ(vec2(-uTexel.x, 0.0)) + invZ(vec2(0.0, uTexel.y)) + invZ(vec2(0.0, -uTexel.y)) - 4.0 * w0) / w0;
        float mid = smoothstep(12.0, 40.0, 1.0 / w0) * (1.0 - smoothstep(600.0, 850.0, 1.0 / w0));
        gl_FragColor = vec4(dot(gx, gx), dot(gx, gy), dot(gy, gy), smoothstep(0.02, 0.12, lap) * mid);
      }`;

    // separable Gaussian, shared by the tensor and glow chains.
    //   FLOW:    after the blur, solve the tensor -> xy = A * (cos 2phi, sin 2phi) (doubled tangent
    //            angle times anisotropy: filterable, unlike a sign-ambiguous vector),
    //            z = edge strength, w = geometric detail (blurred depth creases at mid distance)
    //   EXTRACT: weight each tap by "is glow source" from the prep alpha; alpha carries the flow's
    //            detail channel so the glow chain doubles as a wide "detail density" blur
    const BLUR_FRAG = /* glsl */`
      uniform sampler2D tSrc, tAux; uniform vec2 uStep; uniform float uSigma;
      ${COMMON}
      void main() {
        vec4 acc = vec4(0.0); float ws = 0.0;
        float k = -0.5 / (uSigma * uSigma);
        for (int i = -9; i <= 9; i++) {
          float fi = float(i);
          if (abs(fi) > uSigma * 2.6 + 0.5) continue;
          float w = exp(fi * fi * k);
          vec4 s = texture2D(tSrc, vUv + uStep * fi);
          #ifdef EXTRACT
            s.rgb *= (1.0 - smoothstep(0.1, 0.3, abs(s.a - 0.5))) * smoothstep(0.25, 0.5, luma(s.rgb));
            s.a = texture2D(tAux, vUv + uStep * fi).w;
          #endif
          acc += s * w; ws += w;
        }
        acc /= ws;
        #ifdef FLOW
          float E = acc.x, F = acc.y, G = acc.z;
          float disc = sqrt(max((E - G) * (E - G) + 4.0 * F * F, 0.0));
          float l1 = 0.5 * (E + G + disc), l2 = 0.5 * (E + G - disc);
          float th = 0.5 * atan(2.0 * F, E - G) + 1.5707963;   // tangent = gradient + 90 deg
          float A = (l1 + l2) > 1e-7 ? (l1 - l2) / (l1 + l2) : 0.0;
          float strength = sqrt(max(l1, 0.0));
          gl_FragColor = vec4(A * cos(2.0 * th), A * sin(2.0 * th), strength, smoothstep(0.06, 0.3, acc.w));
        #else
          gl_FragColor = acc;
        #endif
      }`;

    // anisotropic Kuwahara with polynomial weighting (Kyprianidis, Semmo, Kang, Döllner 2010),
    // vectorised: sectors 0,2,4,6 and 1,3,5,7 each live in vec4 lanes; per sector we only keep
    // sum(w*r), sum(w*g), sum(w*b), sum(w), sum(w*|c|^2) since var.r+var.g+var.b = E|c|^2 - |mean|^2
    const KUWA_FRAG = /* glsl */`
      uniform sampler2D tSrc, tFlow; uniform vec2 uTexel; uniform float uRadius, uStride;
      ${COMMON}
      const float ALPHA = 1.0, HARD = 8.0, ZC = 0.58;   // q = 8 -> weight exponent q/2 = 4
      void main() {
        vec4 c0 = texture2D(tSrc, vUv);
        if (c0.a < 0.7) { gl_FragColor = c0; return; }     // cats & lights stay as they are
        vec4 f = texture2D(tFlow, vUv);
        float A = min(length(f.xy), 1.0), phi = 0.5 * atan(f.y, f.x);
        float radius = uRadius * (1.0 - 0.45 * f.w);            // finer patches on the village
        float a = radius * clamp((ALPHA + A) / ALPHA, 0.1, 2.0);
        float b = radius * clamp(ALPHA / (ALPHA + A), 0.1, 2.0);
        float cp = cos(phi), sp = sin(phi);
        mat2 SR = mat2(0.5 / a, 0.0, 0.0, 0.5 / b) * mat2(cp, -sp, sp, cp);
        // stride 2 (bilinear taps between texels = 2x2 averages) keeps big radii affordable
        int mx = int(sqrt(a * a * cp * cp + b * b * sp * sp) / uStride);
        int my = int(sqrt(a * a * sp * sp + b * b * cp * cp) / uStride);
        vec2 off = uStride > 1.5 ? vec2(0.5) : vec2(0.0);
        float zeta = 1.0 / radius, szc = sin(ZC);
        float eta = (zeta + cos(ZC)) / (szc * szc);
        vec4 r0 = vec4(0.0), g0 = r0, b0 = r0, w0 = r0, q0 = r0, r1 = r0, g1 = r0, b1 = r0, w1 = r0, q1 = r0;
        for (int y = -my; y <= my; y++) {
          for (int x = -mx; x <= mx; x++) {
            vec2 xy = vec2(float(x), float(y)) * uStride + off;
            vec2 v = SR * xy;
            float vv = dot(v, v);
            if (vv > 0.25) continue;
            vec3 c = texture2D(tSrc, vUv + xy * uTexel).rgb;
            float vxx = zeta - eta * v.x * v.x, vyy = zeta - eta * v.y * v.y;
            vec4 z0 = max(vec4(0.0), vec4(v.y, -v.x, -v.y, v.x) + vec4(vxx, vyy, vxx, vyy));
            vec2 u = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
            float uxx = zeta - eta * u.x * u.x, uyy = zeta - eta * u.y * u.y;
            vec4 z1 = max(vec4(0.0), vec4(u.y, -u.x, -u.y, u.x) + vec4(uxx, uyy, uxx, uyy));
            z0 *= z0; z1 *= z1;
            float g = exp(-3.125 * vv) / max(dot(z0 + z1, vec4(1.0)), 1e-6);
            z0 *= g; z1 *= g;
            float cc = dot(c, c);
            r0 += c.r * z0; g0 += c.g * z0; b0 += c.b * z0; w0 += z0; q0 += cc * z0;
            r1 += c.r * z1; g1 += c.g * z1; b1 += c.b * z1; w1 += z1; q1 += cc * z1;
          }
        }
        w0 = max(w0, vec4(1e-8)); w1 = max(w1, vec4(1e-8));
        r0 /= w0; g0 /= w0; b0 /= w0; q0 /= w0; r1 /= w1; g1 /= w1; b1 /= w1; q1 /= w1;
        vec4 s0 = HARD * 1000.0 * abs(q0 - (r0 * r0 + g0 * g0 + b0 * b0));
        vec4 s1 = HARD * 1000.0 * abs(q1 - (r1 * r1 + g1 * g1 + b1 * b1));
        // weights 1 / (1 + s^4), normalised by the calmest sector so they never all underflow
        // (all-high-variance regions such as star halos would otherwise turn black)
        vec4 sm = min(s0, s1); float smin = min(min(sm.x, sm.y), min(sm.z, sm.w));
        float pm = smin * smin; pm *= pm;
        vec4 p0 = s0 * s0, p1 = s1 * s1;
        vec4 k0 = (1.0 + pm) / (1.0 + p0 * p0), k1 = (1.0 + pm) / (1.0 + p1 * p1);
        vec3 o = vec3(dot(k0, r0) + dot(k1, r1), dot(k0, g0) + dot(k1, g1), dot(k0, b0) + dot(k1, b1));
        gl_FragColor = vec4(o / dot(k0 + k1, vec4(1.0)), c0.a);
      }`;

    // ---- shared by the cells and composite passes: painted image, stroke field, dash layout
    const PAINT_COMMON = /* glsl */`
      uniform sampler2D tScene, tDepth, tKuwa, tFlow, tGlow, tPrep, tCells;
      uniform vec2 uRes, uView, uCellBase, uSceneRes;
      uniform float uCell, uScale, uStrength, uNear, uFar, uGlowGain, uKuwaMix;
      ${COMMON}
      float linDepth(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
      float depthAt(vec2 uv) { return linDepth(texture2D(tDepth, uv).r); }
      // inverse depth with bilinear filtering by hand (WebGL2 depth textures only filter NEAREST);
      // inverse depth is linear in the stored value, so filtering the raw depths is exact
      float invDepthF(vec2 uv) {
        vec2 t = uv * uSceneRes - 0.5, f = fract(t);
        ivec2 mx = ivec2(uSceneRes) - 1, i0 = clamp(ivec2(floor(t)), ivec2(0), mx), i1 = min(i0 + 1, mx);
        float a = texelFetch(tDepth, i0, 0).r, b = texelFetch(tDepth, ivec2(i1.x, i0.y), 0).r;
        float c = texelFetch(tDepth, ivec2(i0.x, i1.y), 0).r, d = texelFetch(tDepth, i1, 0).r;
        return (uFar - mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * (uFar - uNear)) / (uNear * uFar);
      }
      // the painted image (sRGB): Kuwahara patches, or the plain scene on 'low'
      vec3 paintAt(vec2 uv) {
        #if LOW
          return texture2D(tScene, uv).rgb;
        #else
          return texture2D(tKuwa, uv).rgb;
        #endif
      }
      // the unflattened image (keeps the world's own texture variation) for loading a brush
      vec3 sourceAt(vec2 uv) {
        #if LOW
          return texture2D(tScene, uv).rgb;
        #else
          return texture2D(tPrep, uv).rgb;
        #endif
      }
      // local detail density (0..1): finer brushes on the village
      float detailAt(vec2 uv) {
        #if LOW
          return 0.0;
        #elif GLOW
          return smoothstep(0.012, 0.1, texture2D(tGlow, uv).a);
        #else
          return texture2D(tFlow, uv).w;
        #endif
      }
      // (anisotropy, "already painted"): how coherent the flow is, and how much stroke texture
      // the source already has (the sky module paints its own dashes: don't repaint them)
      vec2 flowInfo(vec2 uv) {
        #if LOW
          return vec2(0.0);
        #else
          vec4 f = texture2D(tFlow, uv);
          return vec2(min(length(f.xy), 1.0), smoothstep(0.3, 0.9, f.z));
        #endif
      }
      vec4 dashHash(vec2 cell, int k) { return hash42(cell * vec2(1.0, 1.31) + float(k) * 37.77 + 11.0); }
      // perceptual colour difference: the night is dark, so compare relative to brightness
      // (a blue-grey wall and its slate roof differ by little in absolute terms)
      float pdiff(vec3 a, vec3 b) { return length(a - b) / (0.1 + max(luma(a), luma(b))); }`;

    // cells: everything about each dash, computed once per dash instead of once per pixel.
    // Three texels per dash at x = (cell * SPC + k) * 3 + {0,1,2}, y = cell row (cells are
    // counted from uCellBase, which follows the view):
    //   [0] direction / half-length (flow + jitter, pre-divided), aspect L/W, priority
    //   [1] centre (cell units, relative to the cell corner), bend, scene depth at the centre
    //   [2] the loaded brush: painted colour at the centre + some raw texture + a per-dash
    //       shift of value / saturation / hue (Van Gogh's juxtaposed blues); w = bristle seed
    const CELLS_FRAG = /* glsl */`
      ${PAINT_COMMON}
      vec3 hueShift(vec3 c, float a) {       // YIQ rotation: blue <-> blue-green <-> violet
        float y = dot(c, vec3(0.299, 0.587, 0.114));
        float i = dot(c, vec3(0.596, -0.274, -0.322)), q = dot(c, vec3(0.211, -0.523, 0.312));
        float ca = cos(a), sa = sin(a), i2 = i * ca - q * sa, q2 = i * sa + q * ca;
        return vec3(y + 0.956 * i2 + 0.621 * q2, y - 0.272 * i2 - 0.647 * q2, y - 1.106 * i2 + 1.703 * q2);
      }
      // stroke direction: image tangent where the image has structure, a slow procedural drift
      // (anchored to the view) where it is flat
      vec2 fieldDir(vec2 uv) {
        vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) + uView / uRes.y;
        float a = 0.3 * sin(p.x * 4.1 + 1.3 * sin(p.y * 3.3)) + 0.22 * sin(p.y * 6.3 + p.x * 2.1);
        vec2 fb = vec2(cos(a), sin(a));
        #if LOW
          vec2 g = vec2(uCell * 0.6) / uRes;
          float c = luma(texture2D(tScene, uv).rgb);
          vec2 grad = vec2(luma(texture2D(tScene, uv + vec2(g.x, 0.0)).rgb) - c, luma(texture2D(tScene, uv + vec2(0.0, g.y)).rgb) - c);
          vec2 t = length(grad) > 1e-6 ? normalize(vec2(-grad.y, grad.x)) : fb;
          float w = smoothstep(0.004, 0.03, length(grad));
        #else
          vec4 f = texture2D(tFlow, uv);
          float A = length(f.xy), phi = 0.5 * atan(f.y, f.x);
          vec2 t = vec2(cos(phi), sin(phi));
          float w = smoothstep(0.04, 0.35, A) * smoothstep(0.01, 0.08, f.z);
        #endif
        t = dot(t, fb) < 0.0 ? -t : t;
        return normalize(mix(fb, t, w) + 1e-5);
      }
      void main() {
        ivec2 ip = ivec2(gl_FragCoord.xy);
        int si = ip.x / 3, kind = ip.x - si * 3, k = si - (si / SPC) * SPC;
        vec2 cell = uCellBase + vec2(float(si / SPC), float(ip.y));
        vec2 ccuv = clamp(((cell + 0.5) * uCell - uView) / uRes, 0.0, 1.0);
        float det = detailAt(ccuv), shrink = 1.0 - 0.5 * det;        // finer dashes where detailed
        vec2 fi = flowInfo(ccuv);
        vec4 h = dashHash(cell, k);
        // centre jitter in the dash's own frame: little along it (long dashes must stay inside
        // the composite's 4x4 window), a lot across it, so parallel dashes never line up into
        // brick-like courses at the cell pitch. Reach + jitter <= 2 cells on every axis.
        vec2 dir = fieldDir(ccuv);
        vec2 centre = 0.5 + dir * ((h.x - 0.5) * 0.6 * shrink * (1.0 - 0.4 * fi.x))
                          + vec2(-dir.y, dir.x) * ((h.y - 0.5) * 1.1 * shrink);
        vec2 cuv = clamp(((cell + centre) * uCell - uView) / uRes, 0.0, 1.0);
        if (kind == 0) {
          float ang = (h.z - 0.5) * 0.45, ca = cos(ang), sa = sin(ang);
          dir = vec2(dir.x * ca - dir.y * sa, dir.x * sa + dir.y * ca);
          // long slim dashes where the flow is coherent (the swirl), stubbier where it is not;
          // half-length + centre jitter stays <= 1.5 cells (the composite's 4x4 window)
          float L = min((0.72 + 0.3 * h.w) * (1.0 + 0.35 * fi.x), 1.25) * shrink;
          float W = (0.24 + 0.1 * fract(h.w * 9.73)) * mix(1.0, shrink, 0.6) * (1.0 - 0.15 * fi.x);
          gl_FragColor = vec4(dir / L, L / W, fract(h.w * 17.13 + h.x * 3.7 + h.y * 1.9));
        } else if (kind == 1) {
          gl_FragColor = vec4(centre, (h.z - 0.5) * 0.7, depthAt(cuv));
        } else {
          vec3 sc = mix(paintAt(cuv), sourceAt(cuv), 0.35);
          float jv = (1.0 - 0.6 * fi.y) * (1.0 - 0.45 * det);       // already painted / detailed: vary less
          float jl = (h.w - 0.5) * 0.22 * jv, js = (fract(h.z * 7.1) - 0.5) * 0.28 * jv, jh = (fract(h.x * 5.3 + h.y) - 0.5) * 0.42 * jv;
          sc = hueShift(mix(vec3(luma(sc)), sc, 1.0 + js), jh) * (1.0 + jl);
          // dark paint still shows its dashes: an additive nudge toward blue-green / brown
          float dark = 1.0 - smoothstep(0.08, 0.35, luma(sc));
          sc += dark * (h.w - 0.5) * vec3(0.05, 0.06, 0.07) + dark * (fract(h.x * 3.3) - 0.5) * vec3(0.03, 0.02, -0.02);
          gl_FragColor = vec4(sc, h.z);
        }
      }`;

    // composite: strokes + detail + halos + contours + grade + canvas
    const FINAL_FRAG = /* glsl */`
      ${PAINT_COMMON}
      uniform int uDebug;
      uniform vec3 uInk, uShadow, uVig;
      uniform float uWarm;

      // ---- brush strokes: gather over the jittered cell grid (4x4 neighbourhood so dashes may
      //      reach 1.5 cells from their cell); the highest-priority dash covering the pixel wins
      struct Stroke { float hit; vec2 lc; vec2 dir; float seed; vec2 size; float r; vec2 cuv; vec3 col; float z; vec2 cell; };
      // z = this pixel's depth: a dash loaded on another depth layer (a rail of the gate while this
      // pixel sees the field through the gap) would be refused anyway, so it does not count as
      // covering the pixel and the dash of its own layer beneath it paints it instead
      Stroke findStroke(vec2 px, float z) {
        float best = -1.0; vec2 bestLc = vec2(0.0), bestCell = vec2(0.0); ivec2 bestTp = ivec2(0); float bestR = 1.0;
        vec2 q = (px + uView) / uCell;
        vec2 b0 = floor(q - 1.5);
        ivec2 t0 = ivec2(b0 - uCellBase + 0.5);
        for (int j = 0; j < 4; j++) {
          for (int i = 0; i < 4; i++) {
            vec2 cell = b0 + vec2(float(i), float(j));
            for (int k = 0; k < SPC; k++) {
              ivec2 tp = ivec2(((t0.x + i) * SPC + k) * 3, t0.y + j);
              vec4 A = texelFetch(tCells, tp, 0);                   // dir/L, L/W, priority
              vec4 B = texelFetch(tCells, tp + ivec2(1, 0), 0);     // centre, bend, depth
              vec2 rel = q - cell - B.xy;
              vec2 lc = vec2(dot(rel, A.xy), dot(rel, vec2(-A.y, A.x)) * A.z);
              lc.y -= B.z * lc.x * lc.x;                                // a slight bend
              lc.y *= 1.0 + 0.28 * lc.x;                                // loaded head, thinner tail
              float ax = abs(lc.x), r = ax * ax * ax + lc.y * lc.y;
              if (r < 1.0 && A.w > best && abs(B.w - z) < 0.12 * min(B.w, z)) { best = A.w; bestLc = lc; bestTp = tp; bestCell = cell; bestR = r; }
            }
          }
        }
        Stroke s;
        s.hit = best >= 0.0 ? 1.0 : 0.0; s.lc = bestLc; s.r = bestR; s.cell = bestCell;
        vec4 A = texelFetch(tCells, bestTp, 0), B = texelFetch(tCells, bestTp + ivec2(1, 0), 0), C = texelFetch(tCells, bestTp + ivec2(2, 0), 0);
        float L = 1.0 / max(length(A.xy), 1e-4);
        s.dir = A.xy * L; s.size = vec2(L, L / max(A.z, 1e-3));
        s.col = C.rgb; s.seed = C.w; s.z = B.w;
        s.cuv = s.hit > 0.5 ? ((bestCell + B.xy) * uCell - uView) / uRes : px / uRes;
        return s;
      }
      // bristle streaks running along the dash
      float bristle(vec2 lc, float seed) { return vnoise1(lc.y * 3.6 + seed * 17.0 + lc.x * 0.4); }
      // impasto: the dash's height field lit from the upper left (screen space)
      float relief(Stroke s) {
        vec2 lc = s.lc;
        float ax = abs(lc.x);
        float across = 1.0 - lc.y * lc.y, along = 1.0 - ax * ax * ax * ax;
        float dhy = -2.0 * lc.y * along + 1.1 * (bristle(lc + vec2(0.0, 0.08), s.seed) - bristle(lc, s.seed));
        float dhx = -4.0 * sign(lc.x) * ax * ax * ax * across;
        vec2 n = vec2(-s.dir.y, s.dir.x);
        vec2 grad = s.dir * (dhx / s.size.x) + n * (dhy / s.size.y);
        return -dot(grad, vec2(-0.55, 0.83)) * s.size.y;
      }

      // ---- contours: silhouettes/creases from the Laplacian of inverse depth (flat planes
      //      give zero even at grazing angles), plus strong colour edges of the painted image
      // returns (line strength, |laplacian|)
      vec2 contour(vec2 uv, float z) {
        vec2 o = max(1.0, 1.9 * uScale) / uRes, od = o * 0.7071;
        // the stencil sits half a scene texel off the pixel centre, so every tap (the centre too)
        // blends 2x2 depth texels: the ink lines come out anti-aliased like the MSAA colour
        // instead of stepping with the single-sample depth
        #if DEPTH_AA
          vec2 c = uv + 0.5 / uSceneRes;
          #define INVZ(p) invDepthF(p)
        #else
          vec2 c = uv;
          #define INVZ(p) (1.0 / depthAt(p))
        #endif
        float w0 = INVZ(c);
        float n0 = INVZ(c + vec2(o.x, 0.0)), n1 = INVZ(c - vec2(o.x, 0.0)), n2 = INVZ(c + vec2(0.0, o.y)), n3 = INVZ(c - vec2(0.0, o.y));
        float n4 = INVZ(c + od), n5 = INVZ(c - od), n6 = INVZ(c + vec2(od.x, -od.y)), n7 = INVZ(c + vec2(-od.x, od.y));
        float lap = (n0 + n1 + n2 + n3 + n4 + n5 + n6 + n7 - 8.0 * w0) / (w0 * 2.0);
        float sil = smoothstep(0.05, 0.22, -lap);
        float crease = smoothstep(0.04, 0.2, abs(lap)) * 0.6;
        // Thin things at a depth step. The far side of a silhouette also has |lap| > 0 and gets a
        // line: outside a big shape that only thickens the outline, but in a slit between two near
        // things (the gaps of the five-bar gate, between cart-wheel spokes) the two far-side lines
        // frame the background like leaded glass. And a near thin bar inked at full strength on
        // both edges becomes two lead lines with a sliver of wood between. So, walking across the
        // step (along the inverse-depth gradient, pointing at the nearer side):
        //   far side:  a nearer surface again within ~6 line widths the other way -> this is
        //              background seen through a slit: no crease / colour-edge ink here
        //   near side: the background again within ~4.5 line widths -> a thin bar close by: a
        //              lighter outline (far thin things — the spire, the village trees — keep theirs)
        float slit = 0.0;
        float nMax = max(max(max(n0, n1), max(n2, n3)), max(max(n4, n5), max(n6, n7)));
        float nMin = min(min(min(n0, n1), min(n2, n3)), min(min(n4, n5), min(n6, n7)));
        if ((lap > 0.0 && nMax > w0 * 1.15) || (lap < -0.05 && z < 45.0 && nMin * 1.15 < w0)) {
          float dd = 0.7071 * (n4 - n5), de = 0.7071 * (n6 - n7);
          vec2 g = vec2(n0 - n1 + dd + de, n2 - n3 + dd - de);
          g = g / max(length(g), 1e-9);                                   // toward the nearer side
          if (lap > 0.0) {
            vec2 st = -g * o * 2.2;
            for (int i = 1; i <= 5; i++) {
              if (1.0 / depthAt(uv + st * float(i)) > w0 * 1.15) { slit = 1.0 - 0.12 * float(i - 1); break; }
            }
            crease *= 1.0 - slit;
          } else {
            vec2 st = g * o * 1.5;
            float bar = 0.0;
            for (int i = 1; i <= 3; i++) {
              if (1.0 / depthAt(uv + st * float(i)) * 1.15 < w0) { bar = 1.0; break; }
            }
            float thin = 1.0 - 0.5 * bar * (1.0 - smoothstep(25.0, 45.0, z));
            sil *= thin; crease *= thin;
          }
        }
        float cedge = 0.0;
        #if !LOW
          vec2 o1 = max(1.0, uScale) / uRes;
          float ce = length(paintAt(uv + vec2(o1.x, 0.0)) - paintAt(uv - vec2(o1.x, 0.0))) + length(paintAt(uv + vec2(0.0, o1.y)) - paintAt(uv - vec2(0.0, o1.y)));
          cedge = smoothstep(0.2, 0.45, ce) * 0.5 * (1.0 - smoothstep(450.0, 700.0, z)) * (1.0 - slit);   // never in the sky
        #endif
        float fade = 1.0 - 0.5 * smoothstep(50.0, 420.0, z);
        return vec2(max(max(sil, crease), cedge) * fade, abs(lap));
      }

      // ---- grade toward the painting, gently (the world modules already chose its colours):
      //      the deepest darks become ultramarine rather than black, dull colours gain a little
      //      richness, yellow lights glow toward chrome, a slight S-curve for paint contrast
      vec3 grade(vec3 c) {
        float l = luma(c);
        c += uShadow * (1.0 - smoothstep(0.0, 0.09, l));
        l = luma(c);
        float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
        c = mix(vec3(l), c, 1.0 + 0.12 * (1.0 - smoothstep(0.04, 0.2, sat)));
        float warm = smoothstep(0.02, 0.25, c.r - c.b) * smoothstep(0.35, 0.8, l);
        c += vec3(0.05, 0.025, -0.06) * warm * uWarm;
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.12);
        return clamp(c, 0.0, 1.0);
      }

      void main() {
        vec2 uv = vUv, px = gl_FragCoord.xy;
        float k = uStrength;
        vec4 raw = texture2D(tScene, uv);
        vec3 crisp = raw.rgb;
        float isDetail = 1.0 - smoothstep(0.15, 0.35, raw.a);
        // glow sources are lights: a dark translucent overlay drawn over a cat (alpha 0) also
        // lands near 0.5, so require brightness too
        float isGlow = (1.0 - smoothstep(0.1, 0.28, abs(raw.a - 0.5))) * smoothstep(0.25, 0.5, luma(crisp));
        float z = depthAt(uv);
        // the sky dome writes no depth: everything at the far plane is sky, which the sky module
        // has already painted stroke by stroke — keep its colour, only add paint thickness
        float sky = smoothstep(600.0, 850.0, z);
        vec3 kuwa = paintAt(uv);
        vec3 base = mix(crisp, kuwa, min(k, 1.0) * uKuwaMix);         // strength 0 = the plain scene
        float detail = detailAt(uv);
        vec2 fi = flowInfo(uv);
        // keep more of the source where it is detailed (village), already painted, or the sky
        base = mix(base, crisp, max(max(detail * 0.7, max(fi.y * 0.45, sky)), (1.0 - smoothstep(3.0, 18.0, z)) * 0.35));
        vec2 ct = contour(uv, z);
        // small far objects (olive trees, distant houses): Kuwahara and dashes would erase them.
        // Caught two ways: depth creases at mid distance, and "the source differs strongly from
        // the Kuwahara patch" (a feature smaller than the kernel was voted away)
        float smallObj = smoothstep(0.06, 0.25, ct.y) * smoothstep(25.0, 70.0, z);
        smallObj = max(smallObj, smoothstep(0.22, 0.45, pdiff(crisp, kuwa)) * smoothstep(3.0, 12.0, z));
        smallObj *= 1.0 - sky;

        // brush strokes
        Stroke s = findStroke(px, z);
        vec3 col = base;
        float br = 0.0, rel = 0.0, dbgA = 0.0, dbgC = 0.0;
        if (s.hit > 0.5) {
          vec3 sc = s.col;                                              // the loaded brush
          float dz = abs(s.z - z) / min(s.z, z);
          // a dash may not cross an edge (colour or depth) nor paint over what the source shows;
          // finer judgement where the scene is detailed (the village's walls vs roofs)
          float cdiff = max(pdiff(sc, base), 0.75 * pdiff(sc, crisp)) * (1.0 + 0.6 * detail);
          float accept = (1.0 - smoothstep(0.2, 0.45, cdiff)) * (1.0 - smoothstep(0.04, 0.12, dz)) * (1.0 - 0.55 * fi.y) * (1.0 - 0.8 * sky);
          col = mix(base, sc, accept * k);
          dbgA = accept; dbgC = cdiff;
          br = bristle(s.lc, s.seed);
          rel = relief(s);
          // impasto: bristle streaks, the dash's relief, a faint rim; weaker where the dash was
          // refused (it crossed an edge), so no dash-shaped marks run across small things
          float rim = smoothstep(0.72, 1.0, s.r), paintK = k * mix(0.45, 1.0, accept) * (1.0 - 0.8 * sky);
          col *= 1.0 + (br * 0.055 + rel * 0.095 - rim * 0.05) * paintK;
          float darkPaint = 1.0 - smoothstep(0.08, 0.4, luma(col));
          col += vec3(0.55, 0.62, 0.8) * (max(rel, 0.0) * (0.014 + 0.014 * darkPaint) + br * (0.006 + 0.006 * darkPaint)) * paintK;   // ridges catch the light even on dark paint
        }
        // the sky's own dashes get the thickness: an emboss of its brightness (lighter paint
        // stands proud), lit from the upper left like the post's own dashes
        if (sky > 0.0) {
          vec2 e = max(1.0, 1.25 * uScale) / uRes;
          float gx = luma(texture2D(tScene, uv + vec2(e.x, 0.0)).rgb) - luma(texture2D(tScene, uv - vec2(e.x, 0.0)).rgb);
          float gy = luma(texture2D(tScene, uv + vec2(0.0, e.y)).rgb) - luma(texture2D(tScene, uv - vec2(0.0, e.y)).rgb);
          float emb = clamp(-dot(vec2(gx, gy), vec2(-0.55, 0.83)), -0.25, 0.25);
          col *= 1.0 + emb * 0.45 * sky * k;
          col += vec3(0.55, 0.62, 0.8) * max(emb, 0.0) * 0.05 * sky * k;
        }
        // cats stay crisp (a whisper of texture), lights stay bright, tiny far things survive
        col = mix(col, crisp * (1.0 + (br * 0.04 + rel * 0.05) * k), smallObj * 0.85);
        col = mix(col, crisp * (1.0 + br * 0.02 * k), isDetail);
        col = mix(col, crisp, isGlow * 0.7);

        // painted halos around lights (sampled partly at the dash centre -> halos made of dashes)
        vec3 glow = vec3(0.0);
        #if GLOW
          // no halo on the light itself (keeps the moon's crescent) and little in the sky, whose
          // module paints its own star halos
          glow = mix(texture2D(tGlow, uv).rgb, texture2D(tGlow, s.cuv).rgb, 0.6 * s.hit) * uGlowGain * k;
          glow *= (1.0 - isGlow) * (1.0 - 0.72 * sky) * (1.0 - 0.6 * isDetail);   // cats keep their coats
          glow *= 1.0 + br * 0.25;
          // close up a window fills much of the screen, and a fixed-size halo would wash out the
          // shutters and sills round it: nearer lights get a tighter, lighter halo
          glow *= mix(0.3, 1.0, smoothstep(6.0, 40.0, z));
          // half light (the halo lights the paint, keeping its darks) and half painted veil
          col *= 1.0 + 1.6 * glow;
          col = 1.0 - (1.0 - col) * (1.0 - clamp(glow * 0.55, 0.0, 1.0));
        #endif

        // contour lines in dark ultramarine, always darker than the paint beneath
        // (small things are dabs, not outlined shapes: an outline would swallow them whole)
        // the village already outlines its own walls and roofs: lighter lines where it is detailed
        float line = clamp(ct.x * (0.75 + 0.35 * br), 0.0, 1.0) * k * (1.0 - isGlow * 0.6) * (1.0 - 0.8 * smallObj) * (1.0 - 0.45 * detail) * (1.0 - 0.6 * isDetail);
        col = mix(col, min(uInk, col * 0.42), line * 0.9);

        col = mix(col, grade(col), k * (1.0 - 0.6 * isDetail));

        // canvas weave (fixed to the screen = the canvas) and a gentle blue vignette
        vec2 cp = px / max(uScale, 0.5);
        float weave = sin(cp.x * 1.85 + hash11(floor(cp.y / 3.4)) * 6.28) * sin(cp.y * 1.85 + hash11(floor(cp.x / 3.4) + 7.0) * 6.28);
        col *= 1.0 + (weave * 0.022 + (hash12(floor(cp)) - 0.5) * 0.02) * k;
        vec2 vv = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        float vig = smoothstep(1.2, 0.45, length(vv));
        col *= mix(vec3(1.0), mix(uVig, vec3(1.0), vig), k);

        if (uDebug == 1) col = crisp;
        else if (uDebug == 2) col = base;
        else if (uDebug == 3) col = vec3(s.dir * 0.5 + 0.5, detail);
        else if (uDebug == 4) col = s.hit > 0.5 ? hash42(s.cell * 1.7 + s.seed * 9.0).xyz * (0.7 + 0.3 * rel) : vec3(0.0);
        else if (uDebug == 5) col = vec3(1.0 - line);
        else if (uDebug == 6) col = glow;
        else if (uDebug == 7) col = vec3(raw.a, isDetail, isGlow);
        else if (uDebug == 8) col = vec3(fi.y, fi.x, smallObj);
        else if (uDebug == 9) col = vec3(dbgA, dbgC * 2.0, detail);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`;

    // ------------------------------------------------------------ materials & render targets
    const inkRGB = SN.color.hexToRgb(P.outline).map(v => v / 255);
    const shadowRGB = SN.color.hexToRgb(SN.color.mix(P.skyDeep, P.ink, 0.35)).map(v => (v / 255) * 0.35);
    function passMat(frag, uniforms, defines = {}) {
      return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
    }
    const U = v => ({ value: v });
    // the cells and composite passes share one uniform set (same PAINT_COMMON declarations)
    const paintUniforms = {
      tScene: U(null), tDepth: U(null), tKuwa: U(null), tFlow: U(null), tGlow: U(null), tPrep: U(null), tCells: U(null),
      uRes: U(new THREE.Vector2(1, 1)), uView: U(new THREE.Vector2()), uCellBase: U(new THREE.Vector2()), uSceneRes: U(new THREE.Vector2(4, 4)),
      uCell: U(10), uScale: U(1), uStrength: U(1), uNear: U(0.1), uFar: U(2500), uGlowGain: U(1.6), uKuwaMix: U(1),
      uDebug: U(DEBUG_VIEWS[URL_Q.get('postview')] || 0),
      uInk: U(new THREE.Vector3(...inkRGB)), uShadow: U(new THREE.Vector3(...shadowRGB)),
      // per painting (SN.level.post): vignette tint (edge multiplier, default a gentle blue) and how much
      // warm lights are pushed toward chrome (1 = The Starry Night)
      uVig: U(new THREE.Vector3(...(SN.level?.post?.vignette || [0.82, 0.86, 0.95]))), uWarm: U(SN.level?.post?.warm ?? 1),
    };
    const paintDefines = () => ({ LOW: 0, GLOW: 1, SPC: 2, DEPTH_AA: 1 });
    const mats = {
      prep: passMat(PREP_FRAG, { tScene: U(null), uTexel: U(new THREE.Vector2()) }),
      tensor: passMat(TENSOR_FRAG, { tSrc: U(null), tDepth: U(null), uTexel: U(new THREE.Vector2()), uNear: U(0.1), uFar: U(2500) }),
      blur: passMat(BLUR_FRAG, { tSrc: U(null), uStep: U(new THREE.Vector2()), uSigma: U(2) }),
      flow: passMat(BLUR_FRAG, { tSrc: U(null), uStep: U(new THREE.Vector2()), uSigma: U(2) }, { FLOW: 1 }),
      glowX: passMat(BLUR_FRAG, { tSrc: U(null), tAux: U(null), uStep: U(new THREE.Vector2()), uSigma: U(2.6) }, { EXTRACT: 1 }),
      glowY: passMat(BLUR_FRAG, { tSrc: U(null), uStep: U(new THREE.Vector2()), uSigma: U(2.6) }),
      kuwa: passMat(KUWA_FRAG, { tSrc: U(null), tFlow: U(null), uTexel: U(new THREE.Vector2()), uRadius: U(4), uStride: U(1) }),
      cells: passMat(CELLS_FRAG, paintUniforms, paintDefines()),
      final: passMat(FINAL_FRAG, paintUniforms, paintDefines()),
    };

    const rtOpts = (type, cs, filter = THREE.LinearFilter) => ({ type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, colorSpace: cs });
    const HALF = THREE.HalfFloatType, BYTE = THREE.UnsignedByteType, RAW = THREE.NoColorSpace;
    // The scene target must behave exactly like the canvas the world modules were tuned on:
    // materials encode sRGB in the shader and blending (additive light pools, glazes) happens on
    // sRGB values. three r160 does that only for XR targets, so the target is flagged as one and
    // stored as plain RGBA8 holding sRGB-encoded values (the same precision as SRGB8_ALPHA8).
    // The two "unlit" colours three converts only for the canvas — fog and clear colour — are
    // pre-encoded around the scene render (renderSceneEncoded below).
    const rtScene = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts(BYTE, THREE.SRGBColorSpace), depthBuffer: true });
    rtScene.texture.colorSpace = THREE.SRGBColorSpace;
    rtScene.texture.internalFormat = 'RGBA8';
    rtScene.isXRRenderTarget = true;
    rtScene.depthTexture = new THREE.DepthTexture(4, 4);
    rtScene.depthTexture.type = THREE.UnsignedIntType;
    const rtPrep = new THREE.WebGLRenderTarget(4, 4, rtOpts(BYTE, RAW));
    const rtT1 = new THREE.WebGLRenderTarget(4, 4, rtOpts(HALF, RAW));
    const rtT2 = new THREE.WebGLRenderTarget(4, 4, rtOpts(HALF, RAW));
    const rtKuwa = new THREE.WebGLRenderTarget(4, 4, rtOpts(BYTE, RAW));
    const rtG1 = new THREE.WebGLRenderTarget(4, 4, rtOpts(BYTE, RAW));
    const rtG2 = new THREE.WebGLRenderTarget(4, 4, rtOpts(BYTE, RAW));
    const rtCells = new THREE.WebGLRenderTarget(4, 4, rtOpts(HALF, RAW, THREE.NearestFilter));

    // one full-screen triangle, drawn with whichever pass material is current
    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const quad = new THREE.Mesh(triGeo, mats.final); quad.frustumCulled = false;
    const quadScene = new THREE.Scene(); quadScene.add(quad);
    const quadCam = new THREE.Camera();
    function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

    // ------------------------------------------------------------ configuration & resize
    let cfg = null, cfgName = '', enabled = true, strength = +(URL_Q.get('poststrength') ?? SN.level?.post?.strength ?? 1);
    // dev: ?postcfg=radius:3,sigma:2.4 overrides preset fields (for tuning sessions)
    const devCfg = Object.fromEntries((URL_Q.get('postcfg') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split(':'); return [k, +v]; }));
    const size = { bw: 1, bh: 1, sw: 1, sh: 1, ww: 1, wh: 1, gw: 1, gh: 1, cx: 1, cy: 1 };
    const _v2 = new THREE.Vector2();
    let passes = [];

    function configure(q) {
      const name = PRESETS[q] ? q : 'high';
      if (name === cfgName) return false;
      cfgName = name; cfg = { ...PRESETS[name], ...devCfg };
      for (const m of [mats.cells, mats.final]) {
        m.defines.LOW = cfg.low ? 1 : 0; m.defines.GLOW = cfg.glow ? 1 : 0; m.defines.SPC = cfg.spc; m.defines.DEPTH_AA = (cfg.depthAA ?? 1) ? 1 : 0;
        m.needsUpdate = true;
      }
      setSamples(cfg.msaa);
      passes = cfg.low ? ['scene', 'cells', 'composite']
        : ['scene', 'prep', 'tensor', 'tensorBlurX', 'tensorBlurY+flow', 'kuwahara', ...(cfg.glow ? ['glowX', 'glowY'] : []), 'cells', 'composite'];
      return true;
    }
    // MSAA on the scene target; a change of sample count needs fresh GL buffers (three re-creates
    // them, and the depth texture, on the next render into it)
    const maxSamples = renderer.capabilities.isWebGL2 ? renderer.capabilities.maxSamples || 0 : 0;
    function setSamples(n) {
      n = Math.max(0, Math.min(Math.round(+n || 0), maxSamples));
      if (rtScene.samples === n) return;
      rtScene.samples = n;
      rtScene.dispose();
    }
    function resize() {
      configure(SN.quality);
      renderer.getDrawingBufferSize(_v2);
      // s: resolution scale (1 at 1280x720), from the area so portrait phones get sensible dashes
      const bw = Math.max(1, _v2.x), bh = Math.max(1, _v2.y), s = Math.sqrt((bw * bh) / (1280 * 720));
      Object.assign(size, { bw, bh });
      const sceneScale = cfg.sceneMpx ? SN.clamp(Math.sqrt((cfg.sceneMpx * 1e6) / (bw * bh)), cfg.scene, 1) : cfg.scene;
      size.sw = Math.max(1, Math.round(bw * sceneScale)); size.sh = Math.max(1, Math.round(bh * sceneScale));
      rtScene.setSize(size.sw, size.sh);
      paintUniforms.uSceneRes.value.set(size.sw, size.sh);
      if (!cfg.low) {
        size.wh = Math.max(8, Math.min(Math.round(bh * cfg.work), cfg.workMaxH));
        size.ww = Math.max(8, Math.round((size.wh * bw) / bh));
        size.gw = Math.max(4, size.ww >> 1); size.gh = Math.max(4, size.wh >> 1);
        rtPrep.setSize(size.ww, size.wh); rtT1.setSize(size.ww, size.wh); rtT2.setSize(size.ww, size.wh);
        rtKuwa.setSize(size.ww, size.wh); rtG1.setSize(size.gw, size.gh); rtG2.setSize(size.gw, size.gh);
        const wt = 1 / size.ww, ht = 1 / size.wh;
        mats.prep.uniforms.uTexel.value.set(wt, ht);
        mats.tensor.uniforms.uTexel.value.set(wt, ht);
        mats.kuwa.uniforms.uTexel.value.set(wt, ht);
        const radius = Math.max(2, Math.min(7, (cfg.radius * size.wh) / 360));
        mats.kuwa.uniforms.uRadius.value = radius;
        mats.kuwa.uniforms.uStride.value = radius > cfg.strideAbove ? 2 : 1;
        mats.blur.uniforms.uSigma.value = mats.flow.uniforms.uSigma.value = cfg.sigma;
      }
      // stroke cells: ~1.3% of the screen height, whatever the resolution
      const cell = 9.5 * s;
      size.cx = Math.ceil(bw / cell) + 6; size.cy = Math.ceil(bh / cell) + 6;
      rtCells.setSize(size.cx * cfg.spc * 3, size.cy);
      paintUniforms.uRes.value.set(bw, bh); paintUniforms.uScale.value = s; paintUniforms.uCell.value = cell;
      paintUniforms.uKuwaMix.value = cfg.kuwaMix ?? 1;
    }

    // ------------------------------------------------------------ per-frame render
    // scene -> rtScene with fog and clear colours pre-encoded to sRGB (see rtScene above), so the
    // result matches a direct canvas render pixel for pixel
    const _fogSave = new THREE.Color(), _clearSave = new THREE.Color(), _enc = new THREE.Color();
    function renderSceneEncoded() {
      const fog = SN.scene.fog, clearA = renderer.getClearAlpha();
      renderer.getClearColor(_clearSave);
      _clearSave.getRGB(_enc, THREE.SRGBColorSpace); renderer.setClearColor(_enc.setRGB(_enc.r, _enc.g, _enc.b, THREE.LinearSRGBColorSpace), clearA);
      if (fog) { _fogSave.copy(fog.color); fog.color.getRGB(_enc, THREE.SRGBColorSpace); fog.color.setRGB(_enc.r, _enc.g, _enc.b, THREE.LinearSRGBColorSpace); }
      try { SN.renderScene(rtScene); } finally {
        if (fog) fog.color.copy(_fogSave);
        renderer.setClearColor(_clearSave, clearA);
      }
    }
    function render() {
      if (!enabled) { SN.renderSceneToScreen(); return; }
      renderSceneEncoded();
      const F = paintUniforms;
      if (!cfg.low) {
        mats.prep.uniforms.tScene.value = rtScene.texture; pass(mats.prep, rtPrep);
        const TU = mats.tensor.uniforms;
        TU.tSrc.value = rtPrep.texture; TU.tDepth.value = rtScene.depthTexture; TU.uNear.value = camera.near; TU.uFar.value = camera.far;
        pass(mats.tensor, rtT1);
        mats.blur.uniforms.tSrc.value = rtT1.texture; mats.blur.uniforms.uStep.value.set(1 / size.ww, 0); pass(mats.blur, rtT2);
        mats.flow.uniforms.tSrc.value = rtT2.texture; mats.flow.uniforms.uStep.value.set(0, 1 / size.wh); pass(mats.flow, rtT1);
        mats.kuwa.uniforms.tSrc.value = rtPrep.texture; mats.kuwa.uniforms.tFlow.value = rtT1.texture; pass(mats.kuwa, rtKuwa);
        if (cfg.glow) {
          const GX = mats.glowX.uniforms;
          GX.tSrc.value = rtPrep.texture; GX.tAux.value = rtT1.texture; GX.uStep.value.set(2 / size.ww, 0); pass(mats.glowX, rtG1);
          mats.glowY.uniforms.tSrc.value = rtG1.texture; mats.glowY.uniforms.uStep.value.set(0, 1 / size.gh); pass(mats.glowY, rtG2);
        }
        F.tKuwa.value = rtKuwa.texture; F.tFlow.value = rtT1.texture; F.tGlow.value = rtG2.texture; F.tPrep.value = rtPrep.texture;
      } else {
        F.tKuwa.value = F.tFlow.value = F.tGlow.value = F.tPrep.value = rtScene.texture;
      }
      F.tScene.value = rtScene.texture; F.tDepth.value = rtScene.depthTexture;
      F.uNear.value = camera.near; F.uFar.value = camera.far; F.uStrength.value = strength;
      // anchor the stroke field to the view: turning the head drags the dashes with the world
      const fpx = (size.bh * 0.5) / Math.tan((camera.fov * Math.PI) / 360), cell = F.uCell.value;
      F.uView.value.set(-camera.rotation.y * fpx, camera.rotation.x * fpx);
      F.uCellBase.value.set(Math.floor(F.uView.value.x / cell) - 2, Math.floor(F.uView.value.y / cell) - 2);
      F.tCells.value = null; pass(mats.cells, rtCells);
      F.tCells.value = rtCells.texture; pass(mats.final, null);
    }

    // ------------------------------------------------------------ install
    // GPU sync for the benches: read one pixel back from the target that was just drawn. Reading
    // the canvas does not wait for work on a render target (a scene render into rtScene measured
    // 0.15 ms that way at 1440p with 4x MSAA). rtScene is multisampled, so it is read through
    // readRenderTargetPixels (its resolved framebuffer); the half-float targets as RGBA/FLOAT.
    const _px = new Uint8Array(4), _pf = new Float32Array(4);
    function sync(target = null) {
      if (target && target.texture.type === THREE.UnsignedByteType) { renderer.readRenderTargetPixels(target, 0, 0, 1, 1, _px); return; }
      const gl = renderer.getContext(), prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      if (target) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, _pf); else gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
      renderer.setRenderTarget(prev);
    }
    const api = {
      setEnabled(b) { enabled = !!b; },
      setStrength(x) { strength = SN.clamp(+x || 0, 0, 2); },
      get passes() { return enabled ? passes.slice() : ['scene']; },
      get samples() { return enabled ? rtScene.samples : 0; },
      get enabled() { return enabled; },
      get strength() { return strength; },
      get quality() { return cfgName; },
      get size() { return { ...size }; },
      setDebug(name) { paintUniforms.uDebug.value = DEBUG_VIEWS[name] || 0; },
      // GPU-synchronised timing of n frames (ms/frame), each synced on the target it drew: the scene
      // straight to the canvas (no MSAA), the scene into rtScene (its size + MSAA + resolve), and
      // the whole pipeline; postMs = the passes after the scene (fullMs - sceneRtMs)
      bench(n = 60) {
        const time = (fn, target) => { fn(); sync(target); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); sync(target); return (performance.now() - t0) / n; };
        const sceneMs = time(() => SN.renderScene(null), null);
        const sceneRtMs = enabled ? time(renderSceneEncoded, rtScene) : sceneMs;
        const fullMs = time(render, null);
        return { quality: cfgName, buffer: [size.bw, size.bh], scene: [size.sw, size.sh], samples: enabled ? rtScene.samples : 0, work: [size.ww, size.wh], sceneMs: +sceneMs.toFixed(2), sceneRtMs: +sceneRtMs.toFixed(2), fullMs: +fullMs.toFixed(2), postMs: +Math.max(0, fullMs - sceneRtMs).toFixed(2) };
      },
      // per-pass timing (dev): each pass re-run n times on the current frame's inputs
      benchPasses(n = 40) {
        if (!enabled) return {};
        render(); sync();
        const out = {};
        const t0s = performance.now(); for (let i = 0; i < n; i++) renderSceneEncoded(); sync(rtScene);
        out.scene = +((performance.now() - t0s) / n).toFixed(2);
        const list = cfg.low ? [] : [['prep', mats.prep, rtPrep], ['kuwahara', mats.kuwa, rtKuwa], ['glowX', mats.glowX, rtG1]];
        list.push(['cells', mats.cells, rtCells], ['composite', mats.final, null]);
        for (const [name, m, t] of list) {
          paintUniforms.tCells.value = m === mats.cells ? null : rtCells.texture;
          pass(m, t); sync(t);
          const t0 = performance.now(); for (let i = 0; i < n; i++) pass(m, t); sync(t);
          out[name] = +((performance.now() - t0) / n).toFixed(2);
        }
        render(); sync();
        return out;
      },
    };
    // the tensor, flow and dash data live in half-float targets; without float colour buffers
    // (very old mobile GPUs) keep the plain path rather than render garbage
    const ext = renderer.extensions;
    const canPaint = renderer.capabilities.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    if (!canPaint) console.warn('[post] no float colour buffers: painterly pipeline disabled');
    if (SN.params.nopost) { api.setEnabled(false); return api; }
    api.setEnabled(canPaint);
    configure(SN.quality);
    SN.on('quality', q => { if (configure(q)) resize(); });
    SN.setPipeline({ render, resize });
    // compile every pass program now, so the first painted frame does not hitch
    for (const m of Object.values(mats)) { quad.material = m; renderer.compile(quadScene, quadCam); }
    return api;
  },
});