// levels/starry-night/level.js — I. The Starry Night (1889): the level definition.
// The painting's metadata (gallery, title, win screen), how many cats hide and where they may hide
// (spots), and world(SN): palette, layout, terrain, lights and fog, applied by core before the world
// modules (landscape, sky, town) build. See ARCHITECTURE.md › Levels.
(window.SN_LEVELS ||= []).push({
  id: 'starry-night', order: 1, free: true,
  numeral: 'I', title: 'The Starry Night', year: 1889,
  place: 'Saint-Rémy-de-Provence', date: 'June 1889', medium: 'oil on canvas', collection: 'Museum of Modern Art, New York',
  aspect: 92.1 / 73.7,                     // canvas width / height (the gallery frame and the title canvas)
  blurb: 'The village of Saint-Rémy asleep under a swirling sky',
  premise: 'into Vincent’s starry night',  // "Twelve cats have slipped <premise>. Can you find them all?"
  winTitle: 'The starry night is yours!',
  night: true,
  audio: { ambience: 'village-night', bell: true, music: 'night' },
  // for the gallery's sketch card and the loading screen, before the painting loads (the same
  // colours as the core palette, which is this painting's)
  palette: {
    skyDeep: '#0b1a45', skyNight: '#10286b', ultramarine: '#1c3c8f', cobalt: '#2a5bb0', cerulean: '#4d86c4',
    swirl: '#8bbbe0', swirlPale: '#c9e3ee', mint: '#a9d7c9', starWhite: '#fff7cf', starYellow: '#f6e27a',
    chrome: '#f2c230', moonOrange: '#f0a42b', windowGlow: '#f7c948', lamp: '#ffd36b',
    hillMid: '#264a7a', hillNear: '#1d3a63', cypress: '#26361f', roofDark: '#2c3450', outline: '#0a1433',
  },
  // the loading screen's line while each world module builds
  loading: { landscape: 'Laying in the hills, the olive groves and the cypress…', sky: 'Swirling the sky and lighting the eleven stars…', town: 'Lighting the village windows…' },
  // how many cats hide each play (medium = total − easy − hard − special) and how far apart (m)
  cats: { total: 12, easy: 3, hard: 3, special: 1, apart: 10 },
  // the curated pool of hiding spots (ARCHITECTURE.md › Spots; owner: the cats module). Each names
  // an anchor from the landscape / town / sky modules; every play draws 3 easy, 5 medium, 3 hard and
  // Lune from it. off = [x right, y up, z toward the player] metres in the anchor's frame; yaw =
  // extra turn (rad, + = left); head = {yaw, pitch, roll} set; moon* = Lune's seat on the crescent.
  // Every spot is checked with SN.test.auditSpots() and looked at with SN.test.viewSpot(id).
  spots: [
    // ---- easy: the painter's road down the hill, the square, the windows and lamps on the way in
    { id: 'ls-wall-road', tier: 'easy', coat: ['ginger', 'patches'], pose: 'stand', scale: 1.15, note: 'strolling along the wall by the road' },
    { id: 'town-well-rim', tier: 'easy', coat: ['calico', 'patches'], pose: 'peek', scale: 1.15, note: 'peeking over the rim of the village well' },
    { id: 'town-sill-0-3', tier: 'easy', coat: ['tuxedo', 'siamese'], pose: 'sit', scale: 1.15, note: 'watching from a lit window on the square' },
    { id: 'town-bench-square', tier: 'easy', coat: ['patches', 'cream'], pose: 'loaf', scale: 1.15, note: 'loafing on the bench by the well' },
    { id: 'town-bench-square-2', tier: 'easy', coat: ['ginger', 'calico'], pose: 'curl', scale: 1.15, note: 'dozing on a bench beside the road' },
    { id: 'town-cart', tier: 'easy', coat: ['cream', 'ginger'], pose: 'loaf', scale: 1.15, note: 'tucked up in the hand cart' },
    { id: 'town-church-steps', tier: 'easy', coat: ['ginger', 'cream'], pose: 'sit', scale: 1.15, note: 'sitting on the church steps' },
    { id: 'town-lamp-road', tier: 'easy', coat: ['siamese', 'tuxedo'], pose: 'sit', scale: 1.15, note: 'on the lantern where the road comes in' },
    { id: 'town-sill-39-0', tier: 'easy', coat: ['siamese', 'tuxedo'], pose: 'sit', scale: 1.15, note: 'in a lit window by the road into town' },
    { id: 'ls-fence-post', tier: 'easy', coat: ['patches', 'ginger'], pose: 'sit', scale: 1.15, note: 'sitting on a fence post by the road' },
    { id: 'ls-rock-road', tier: 'easy', coat: ['cream', 'siamese'], pose: 'gaze', scale: 1.15, note: 'on a boulder beside the road' },
    { id: 'ls-bush', tier: 'easy', coat: ['patches', 'cream'], pose: 'curl', scale: 1.15, note: 'under a dark bush by the village edge' },
    { id: 'ls-cypress-base', tier: 'easy', coat: ['ginger', 'calico'], pose: 'sit', scale: 1.15, note: 'at the foot of the great cypress' },
    { id: 'town-branch-0', tier: 'easy', coat: ['browntabby', 'ginger'], pose: 'drape', scale: 1.15, note: 'draped over a branch by the well' },
    // ---- medium: rewards exploring the lanes, the roofs, the olive terraces and the wheat fields
    { id: 'town-chimney-5', tier: 'medium', coat: 'chartreux', pose: 'sit', scale: 1.3, note: 'warming his paws on a chimney pot' },
    { id: 'town-landing-18', tier: 'medium', coat: ['patches', 'calico'], pose: 'loaf', scale: 1.1, note: 'loafing on the steps in the south-east lane' },
    { id: 'town-door-15', tier: 'medium', coat: ['siamese', 'cream'], pose: 'sit', scale: 1.1, note: 'waiting on a doorstep in the west lane' },
    { id: 'ls-olive-east', tier: 'medium', coat: ['browntabby', 'greytabby'], pose: 'sit', off: [0, 0.03, 0], scale: 1.15, note: 'sitting in the fork of an olive tree' },
    { id: 'ls-haystack-east', tier: 'medium', coat: ['sunflower', 'ginger'], pose: 'loaf', scale: 1.3, range: 50, note: 'tucked up on a haystack in the golden wheat' },
    { id: 'town-door-8', tier: 'medium', coat: ['cream', 'ginger'], pose: 'sit', scale: 1.1, note: 'waiting on a doorstep in the east lane' },
    { id: 'town-door-33', tier: 'medium', coat: ['greytabby', 'calico'], pose: 'sit', scale: 1.1, note: 'on a doorstep in the church lane' },
    { id: 'town-sill-10-0', tier: 'medium', coat: ['tuxedo', 'siamese'], pose: 'sit', scale: 1.1, note: 'in a lit window in the east lane' },
    { id: 'town-sill-12-0', tier: 'medium', coat: ['siamese', 'cream'], pose: 'sit', scale: 1.1, note: 'in a lit window in the west lane' },
    { id: 'town-sill-22-0', tier: 'medium', coat: ['cream', 'tuxedo'], pose: 'sit', scale: 1.1, note: 'in a lit window in the south-west lane' },
    { id: 'town-sill-24-0', tier: 'medium', coat: ['tuxedo', 'cream'], pose: 'loaf', scale: 1.1, note: 'in a lit window in the north-west lane' },
    { id: 'town-sill-35-1', tier: 'medium', coat: ['siamese', 'patches'], pose: 'sit', scale: 1.1, note: 'in a lit window behind the church' },
    { id: 'town-pot-13', tier: 'medium', coat: ['calico', 'ginger'], pose: 'curl', scale: 1.1, note: 'dozing by a flower pot in the west lane' },
    { id: 'town-wall-0', tier: 'medium', coat: ['greytabby', 'browntabby'], pose: 'lie', scale: 1.1, note: 'along the garden wall by the road' },
    { id: 'town-wall-12', tier: 'medium', coat: ['greytabby', 'cream'], pose: 'stand', scale: 1.1, note: 'on a garden wall behind the church' },
    { id: 'town-branch-15', tier: 'medium', coat: ['browntabby', 'greytabby'], pose: 'drape', scale: 1.1, note: 'over a branch in the south-west lane' },
    { id: 'town-treebase-2', tier: 'medium', coat: ['browntabby', 'calico'], pose: 'sit', scale: 1.1, note: 'under the tall tree in the church lane' },
    { id: 'town-lamp-east', tier: 'medium', coat: ['black', 'chartreux'], pose: 'sit', scale: 1.15, note: 'on top of the lantern in the east lane' },
    { id: 'town-ridge-0', tier: 'medium', coat: ['chartreux', 'greytabby'], pose: 'sit', scale: 1.3, note: 'on a roof ridge above the square' },
    { id: 'town-pot-10', tier: 'medium', coat: ['calico', 'cream'], pose: 'curl', scale: 1.1, note: 'dozing by a flower pot in the east lane' },
    { id: 'ls-cypress-low', tier: 'medium', coat: ['browntabby', 'black'], pose: 'lie', yaw: -Math.PI / 2, scale: 1.2, note: 'on a low curl of the great cypress' },
    { id: 'ls-wall-terrace', tier: 'medium', coat: ['greytabby', 'cream'], pose: 'lie', scale: 1.15, note: 'on a terrace wall among the olive trees' },
    { id: 'ls-olive-road', tier: 'medium', coat: ['browntabby', 'greytabby'], pose: 'sit', scale: 1.15, note: 'in an olive fork above the road' },
    { id: 'ls-small-cypress', tier: 'medium', coat: ['browntabby', 'ginger'], pose: 'sit', scale: 1.15, note: 'at the foot of a little cypress' },
    { id: 'ls-haystack-west', tier: 'medium', coat: ['sunflower', 'ginger'], pose: 'sit', scale: 1.3, range: 50, note: 'on the haystack in the west wheat field' },
    { id: 'ls-gate-pier', tier: 'medium', coat: ['greytabby', 'calico'], pose: 'sit', scale: 1.15, note: 'on a pier of the field gate' },
    { id: 'ls-wayside-cross', tier: 'medium', coat: ['cream', 'greytabby'], pose: 'loaf', off: [0, 0, 0.18], scale: 1.15, note: 'on the step of the wayside cross' },
    { id: 'ls-sheaf-west', tier: 'medium', coat: ['sunflower', 'ginger'], pose: 'curl', scale: 1.15, note: 'curled up between the sheaves' },
    { id: 'town-ridge-2', tier: 'medium', coat: ['chartreux', 'greytabby'], pose: 'sit', scale: 1.3, note: 'on a roof ridge by the road into town' },
    { id: 'town-ridge-35', tier: 'medium', coat: ['greytabby', 'chartreux'], pose: 'sit', scale: 1.3, note: 'on a roof ridge behind the church' },
    // ---- hard: sneaky but fair — the eyes glint, and each is visible from somewhere walkable
    // (curled up asleep, tucked back into the curl: from the painting view — the title screen — it is
    // only a dark lump on the cypress's right edge, 18.5 m off and out of range; from 15 m in it counts)
    { id: 'ls-cypress-high', tier: 'hard', coat: ['black', 'starry'], pose: 'curl', off: [-0.1, -0.02, -0.4], range: 15, scale: 1.2, note: 'asleep in a high curl of the great cypress' },
    { id: 'town-belfry-south', tier: 'hard', coat: ['cream', 'chartreux'], pose: 'lie', off: [-3.35, 0, 0.09], yaw: -0.78, scale: 1.5, head: { pitch: -0.35 }, note: 'on the belfry corner, tail dangling' },
    { id: 'ls-rock-stargazer', tier: 'hard', coat: ['greytabby', 'chartreux'], pose: 'gaze', scale: 1.2, note: 'on a far boulder, gazing at the stars' },
    { id: 'town-church-ridge', tier: 'hard', coat: ['black', 'chartreux'], pose: 'sit', scale: 1.4, note: 'on the ridge of the church roof' },
    { id: 'town-chimney-41', tier: 'hard', coat: ['chartreux', 'black'], pose: 'sit', scale: 1.3, note: 'on a chimney pot in the north-west' },
    { id: 'town-chimney-38', tier: 'hard', coat: ['black', 'chartreux'], pose: 'sit', scale: 1.3, note: 'on a chimney behind the south-east lane' },
    { id: 'town-chimney-35', tier: 'hard', coat: ['chartreux', 'starry'], pose: 'sit', scale: 1.3, note: 'on a chimney pot behind the church' },
    { id: 'town-ridge-29', tier: 'hard', coat: ['starry', 'black', 'chartreux'], pose: 'sit', scale: 1.3, note: 'on a roof ridge in the north-west lane' },
    { id: 'ls-olive-west', tier: 'hard', coat: ['browntabby', 'black'], pose: 'sit', scale: 1.2, note: 'in an olive fork across the west valley' },
    { id: 'ls-olive-roots', tier: 'hard', coat: ['browntabby', 'black'], pose: 'curl', scale: 1.2, note: 'between the roots of an olive, behind town' },
    { id: 'ls-rock-hilltop', tier: 'hard', coat: ['greytabby', 'chartreux'], pose: 'gaze', scale: 1.2, note: "on the rocks atop the painter's hill" },
    { id: 'town-slope-21', tier: 'hard', coat: ['chartreux', 'black', 'starry'], pose: 'loaf', scale: 1.2, note: 'on a roof in the south-west lane' },
    { id: 'town-slope-19', tier: 'hard', coat: ['chartreux', 'black', 'starry'], pose: 'loaf', scale: 1.2, note: 'on a roof above the south-east lane' },
    // (sitting up among the ears, a pale coat in the golden wheat: a face and two glinting eyes
    // between the stalks — a loafing sunflower cat there was all but invisible)
    { id: 'ls-wheat-east', tier: 'hard', coat: ['cream', 'greytabby'], pose: 'gaze', scale: 1.25, yaw: 1.9, note: 'peering out of the wheat in the east field' },
    { id: 'town-landing-11', tier: 'hard', coat: ['black', 'chartreux'], pose: 'loaf', scale: 1.15, note: 'on the landing of the steps in the west lane' },
    { id: 'ls-wall-back', tier: 'hard', coat: ['greytabby', 'browntabby'], pose: 'lie', off: [-1.5, 0, 0], scale: 1.2, note: 'on the stone wall on the back hill' },
    // ---- special: Lune, every play — the curl turned away from the painter and leant back, so from
    // the start view it reads as a ball of cat with both ears up and the tail wrapped round (side-on
    // the curl is a flat dark "submarine"); a lighter night-blue coat with a moonlit rim keeps it
    // from being a blot on the moon. Always seen from the same angle (the seat follows the camera).
    // Sized and seated inside the crescent's pale hollow, so the orange sickle stays whole below and
    // to the right of the cat (at 1.4, on the lower horn, the curl covered most of it).
    { id: 'sky-moon', tier: 'special', always: true, moon: true, coat: ['starry', 'black'], pose: 'curl', name: 'Lune',
      moonScale: 1.15, moonLevel: 1, moonTilt: 0.55, moonYaw: Math.PI + 0.45, moonOff: [-0.04, 0.24], glow: 0.5, rim: '#b8c8f0',
      note: 'curled up asleep on the crescent moon' },
  ],

  world(SN) {
    const { fbm2, smoothstep, lerp, deg } = SN;
    const layout = {
      village: { x: 0, z: 0, r: 42 },             // plateau the houses sit on (terrain flattened, y ~ 0)
      square: { x: -4, z: 4, r: 8 },              // village square (well, benches)
      church: { x: 7, z: -8, rot: 0.12 },         // church tower base; spire is the tallest thing in the village
      // the painter's viewpoint on the hillside. An upright phone shows ~51° across, too narrow for
      // both the cypress (+18°..+42°) and the moon (−36°): it turns 7° left to keep the painting's
      // signature foreground — the cypress flame at the left edge, Venus, the double swirl and the
      // village with its spire — and looks 6° lower (the moon and Lune are a glance to the right).
      // step: the title screen stands 3.8 m back and 2 m right of the painter ("step into the
      // painting" walks forward onto this spot), which keeps the cypress in the frame's left edge.
      start: { x: -16, z: 76, yaw: 0, pitch: 16 * deg, portrait: { yaw: 7, pitch: -6 }, step: { back: 3.8, side: 2 } },
      cypress: { x: -24, z: 62, height: 30 },     // the hero cypress, left of the start view
      road: [[-14, 74], [-10, 62], [-5, 49], [-1, 36], [-2, 24], [-4, 13], [-4, 4]], // hill road into the square
      walkRadius: 125,                            // player is clamped inside this circle
      walk: { x: 0, z: 0, r: 125 },
      // the boundary: a dry-stone wall all the way round (too high to hop) at this radius (m) for
      // the angle a = atan2(z, x); the landscape builds it, walkable() keeps viewpoints inside it
      rimR: a => 122.6 + 0.55 * SN.noise2(Math.cos(a) * 2.2, Math.sin(a) * 2.2) + 0.25 * Math.sin(a * 7),
      worldRadius: 520,                           // distant mountains live out to here
      skyRadius: 900,                             // sky dome radius (camera-centred)
      // Sky directions (relative to the start view). The sky module must put these features here.
      moon: { yaw: -36 * deg, pitch: 36 * deg },   // crescent moon, upper right of the painting view
      swirl: { yaw: 4 * deg, pitch: 30 * deg },    // the great double swirl, centre of the sky
      venus: { yaw: 27 * deg, pitch: 17 * deg },   // the big morning star just right of the cypress top
      // named places for hint phrases ("near the church")
      places: [
        { name: 'the village square', x: -4, z: 4, r: 8 },
        { name: 'the church', x: 7, z: -8, r: 6 },
        { name: 'the great cypress', x: -24, z: 62, r: 5 },
        { name: 'the village', x: 0, z: 0, r: 42 },
      ],
    };
    function heightAt(x, z) {
      // gentle rolling base
      let h = fbm2(x * 0.011, z * 0.011, 4) * 4.5 + fbm2(x * 0.045 + 7.1, z * 0.045 - 3.3, 2) * 0.8;
      // foreground hill: the painter's viewpoint, rising toward +Z
      h += smoothstep(22, 88, z) * (15.5 + 3 * Math.sin(x * 0.037 + 0.6));
      // the hills behind the village, rising toward -Z
      h += smoothstep(-42, -118, z) * (24 + 9 * Math.sin(x * 0.023 + 1.3) + 5 * Math.sin(x * 0.061 + 0.2));
      // side slopes that close the valley
      h += smoothstep(72, 135, Math.abs(x)) * (16 + 6 * Math.sin(z * 0.03));
      // outer rim beyond the walkable circle
      const rr = Math.hypot(x, z);
      h += smoothstep(120, 210, rr) * 30;
      // flatten the village plateau
      const d = Math.hypot(x - layout.village.x, (z - layout.village.z) * 1.08);
      const flat = 1 - smoothstep(layout.village.r - 4, layout.village.r + 16, d);
      h = lerp(h, fbm2(x * 0.05, z * 0.05, 2) * 0.35, flat);
      return h;
    }
    // walkable(x, z): where a player can ever stand (the cats module's audit and viewpoints use it).
    // Inside the boundary wall, and — once the world is built — on ground reachable from the
    // painter's spot: a flood fill over a 0.5 m grid (baked on first use) that walks where the
    // player fits between the colliders, climbs no slope steeper than the controller allows, and
    // hops the colliders a jump clears (walls under ~0.85 m above the ground). So the walled
    // gardens behind the houses (1.3 m walls) and the strip outside the boundary are not viewpoints;
    // the low field walls (the back hill's included) are hopped. ~140 ms on a laptop, once.
    let reach = null;
    function bakeReach() {
      const W = SN.world, WK = layout.walk, G = 0.5, N = Math.ceil((2 * WK.r) / G), x0 = WK.x - WK.r, z0 = WK.z - WK.r;
      const R = SN.player.radius || 0.35, v = new SN.THREE.Vector3(), H = new Float32Array(N * N), cls = new Uint8Array(N * N); // 0 blocked · 1 hop · 2 stand
      const t0 = performance.now();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = x0 + (i + 0.5) * G, z = z0 + (j + 0.5) * G, k = j * N + i;
        if (Math.hypot(x - WK.x, z - WK.z) > WK.r - 0.4 || Math.hypot(x, z) > layout.rimR(Math.atan2(z, x)) - 0.45) continue;
        const g = (H[k] = heightAt(x, z));
        v.set(x, 0, z); W.collide(v, R, g + 0.3);
        if (Math.abs(v.x - x) + Math.abs(v.z - z) < 0.02) { cls[k] = 2; continue; }
        v.set(x, 0, z); W.collide(v, R, g + 0.85);
        if (Math.abs(v.x - x) + Math.abs(v.z - z) < 0.02) cls[k] = 1;
      }
      const mask = new Uint8Array(N * N), q = new Int32Array(N * N);
      const si = Math.floor((layout.start.x - x0) / G), sj = Math.floor((layout.start.z - z0) / G);
      let qh = 0, qt = 0, n = 0;
      if (cls[sj * N + si]) { mask[sj * N + si] = 1; q[qt++] = sj * N + si; }
      while (qh < qt) {
        const k = q[qh++], i = k % N, j = (k / N) | 0;
        if (cls[k] === 2) n++;
        for (let d = 0; d < 4; d++) {
          const ii = i + (d === 0 ? 1 : d === 1 ? -1 : 0), jj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const u = jj * N + ii;
          if (mask[u] || !cls[u] || (H[u] - H[k]) / G > 1.1) continue; // (downhill is always fine)
          mask[u] = 1; q[qt++] = u;
        }
      }
      for (let k = 0; k < N * N; k++) if (mask[k] && cls[k] !== 2) mask[k] = 0; // hops connect, but are not places to stand
      if (SN.params.test) console.log(`[level] walkable: ${Math.round(n * G * G)} m² reachable from the painter's spot (${Math.round(performance.now() - t0)} ms)`);
      return { N, G, x0, z0, mask, cls };
    }
    function walkable(x, z) {
      if (Math.hypot(x, z) > layout.rimR(Math.atan2(z, x)) - 0.45) return false;
      const st = SN.game?.state;
      if (!reach) { if (!SN.world?.collide || st === 'boot' || st === 'loading' || st === 'gallery') return true; reach = bakeReach(); }
      const { N, G, x0, z0, mask } = reach, i = Math.floor((x - x0) / G), j = Math.floor((z - z0) / G);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < N && jj < N && mask[jj * N + ii]) return true;
      }
      return false;
    }
    walkable.reach = () => reach; // (dev: the baked mask)
    // footsteps: cobbles in the village and on the road, grass elsewhere
    function surfaceAt(x, z) {
      const V = layout.village;
      return Math.hypot(x - V.x, z - V.z) < V.r - 2 || SN.world.distToPolyline(x, z, layout.road) < 2.2 ? 'stone' : 'grass';
    }
    return {
      layout, heightAt, surfaceAt, walkable,
      // the core palette defaults are this painting's colours
      palette: {},
      clear: '#10286b',
      fog: { type: 'exp2', color: '#16306e', density: 0.0045 },
      lights: {
        hemi: { sky: '#7f9fe6', ground: '#1a2544', intensity: 1.35 },
        ambient: { color: '#2b3f86', intensity: 0.55 },
        key: { color: '#ffe6a3', intensity: 1.5, yaw: layout.moon.yaw, pitch: layout.moon.pitch }, // moonlight
      },
      camera: { fov: 65, near: 0.1, far: 2500 },
    };
  },
});