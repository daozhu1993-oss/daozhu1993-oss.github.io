// 58-audio.js — Vincent's Cats: the whole WebAudio engine (a shell module, built at boot before any
// painting; moved out of 60-ui.js). The UI module drives it through SN.audio (= SN.modules.audio):
// unlock, click, meow, farMeow, near, found, chirp (= pet), hint, chime, miss, fanfare, bellStroke, hushBell,
// rollCall(k, n) (the win's roll call where there is no bell), footstep, step, land, muffle, setMuted, muted,
// update, selfTest, stats, state, ctx; for painting modules: play(name, opts) (any sample of the bundle),
// caw(opts) (a crow, e.g. from a flock taking off). Each cat keeps one voice for the whole play (the engine
// listens to the cats module's events to know which cat a sound is for, and places it where the cat is).
// Painting-specific sound (ambience bed + events, music, the bell) follows SN.level.audio once a painting
// loads ('levelLoading'); in the gallery (no painting) only the UI clicks sound. Scenes (SCENES below):
// village-night, cafe-night, river-night, room-day, wheat-wind, cafe-inside (the Night Café), table-day
// (Sunflowers), garden-day (Irises), field-evening (The Sower); music night, day, evening (the Sower's day).
let SN = null;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: settings just don't persist */ } },
};
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- audio
// Synthesised plus sampled; nothing is created before the first user gesture. Graph: buses
// (ambience, music) → muffle (lowpass while paused) → glue compressor → limiter (fast attack, 20:1)
// → ceiling gain → master out (mute) → speakers; sfx skip the muffle; a shared convolver reverb
// (procedural impulse) feeds the muffle. Levels (SN.test.ui('audio'), per painting with parts 'all'):
// ambience + music bed ≈ -24 dB RMS, events ≈ -16 dB, peaks < 0.9.
//
// Samples (assets/audio-bundle.js: window.SN_AUDIO = {name: data URI}, SN_AUDIO_META = {name: {kind,
// dur, gain, loop, pad, loopDur}}): decoded lazily after unlock, one at a time, into mono AudioBuffers at
// a modest rate (32 kHz; 24 kHz on a phone): the cat voices (meow-hello/ask/call, mew, trill, purr) at
// unlock, the painting's bed (amb-<name>, a seamless loop: body = [pad, pad + loopDur]) and its events
// when it loads; other paintings' beds are never decoded (and released if a test decoded them). Every
// sampled sound has a synthesised stand-in: a name that is missing, still decoding or failed plays that.
//
// Built to keep playing for as long as anyone plays, and to stay light on an iPad:
// - Recurring synthesised sounds (celesta notes, pad chords, piano, bell tolls, owl, crickets, footsteps,
//   purr) are baked once after unlock, by the synthesis recipes below, into mono AudioBuffers (the "bank":
//   one small OfflineAudioContext group at a time, rendered off the main thread; only what the painting
//   uses: its music, its footstep surfaces as they come up). A baked voice is two nodes (buffer source +
//   gain) into a shared, reused pan/reverb-send bus; until its template is ready a sound plays from the
//   live recipe. Synthesised meows, clicks and the whoosh stay live, with k-rate filter automation.
// - Every voice is claimed from a registry: per-kind and total caps, and a horizon (nothing starts
//   more than 30 s ahead). The scheduler sweeps finished voices out of the graph on the next tick
//   instead of leaving them for the garbage collector; idle buses are dropped too. Sampled voices and
//   painting events go through the same registry; the bed is part of the mixer (rebuilt with it).
// - Every AudioParam write and source start goes through P.* / begin() / end(): finite values, no
//   negative times, never a throw. Each scheduled event runs in its own try/catch. The scheduler
//   runs every 200 ms against the audio clock and looks 1.2 s ahead (survives main-thread jank);
//   ambience that is late anyway is dropped rather than bunched. A decode error never throws.
// - Lifecycle: the context runs exactly while the page is visible: resumed on gestures, visibility,
//   pageshow and statechange ('suspended', and 'interrupted' on iOS), never while hidden; a context the
//   browser closed comes back when visible, a device error reopens it. A watchdog (every tick): an
//   AnalyserNode after the limiter rebuilds the mixer on any NaN/Inf, or on > 2 s of silence while it
//   should be audible (a painting's bed or wind is running: they never stop); when the audio clock
//   stalls it nudges the context (suspend + resume: iOS can freeze currentTime while 'running') and then
//   rebuilds it. When the render thread cannot keep up (the clock under 0.9x, or Chrome's playbackStats:
//   > 2% dropouts) the mix steps down in place (LITE: a shorter room, fewer voices), and back up after 3
//   quiet minutes. Every rebuild draws on one repair budget (3 a minute, then 10, 20, 40, 60 s apart), so
//   nothing can loop. It warns once per kind in the console.
// Test: SN.test.ui('audio', {sec, parts}) renders the mix offline (selfTest) and reports levels (parts may
// add 'scene=<ambience>' (alone: that scene's amb,music,events), 'nosmp' (synthesised only), 'samples' (each
// cat voice), 'sceneev' (each painting event, and each sample its modules play, with its contrast over the bed),
// 'steps' (every footstep surface), 'bells' / 'rollcall' (the two roll calls), 'hush' / 'ring' (a midnight stroke
// hushed, or not), or be 'all': every painting's bed / events / peaks; o.out: out of the room, where a scene has a
// way out); a render that comes out silent says so (silent: true, and a warning); audio.stats is a live
// snapshot; audio._test.{poison, silence, stall, overload, scene, nosmp, flock, cats, place, stepKind} exercise
// the watchdog and the paintings.
const audio = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const LOOKAHEAD = 1.2;   // s the scheduler looks ahead of the audio clock
  const HORIZON = 30;      // s: a voice further ahead than this is refused (a bad start time can never park)
  const LEAD = 0.025;      // s from now to "right now" for one-shots (the render thread works in blocks)
  const IR_SEC = 2.0;      // the reverb: the original 3.4 s impulse, its first 2 s (faded over the last quarter)
  // (moment: the game's own moments — the found chime, the fanfare, the midnight strokes, the roll call: never
  // thinned by a lighter mix, since a device that struggles must still ring twelve and answer every cat)
  const CAPS = { cricket: 6, step: 6, cel: 24, pad: 3, piano: 3, owl: 2, bell: 10, purr: 2, meow: 10, fx: 8, evt: 6, moment: 24 };
  const MAX_VOICES = 64;   // sounding at once, all kinds (events may exceed it up to their own cap)
  // the mix (level 0) and two lighter ones for a device that cannot keep up: a shorter room, fewer voices
  const LITE = [{ ir: IR_SEC, k: 1 }, { ir: 1.2, k: 0.5 }, { ir: 0.6, k: 0.35 }];
  const zero = () => ({ nodes: 0, voices: 0, capped: 0, far: 0, late: 0, errs: 0 });
  const S = {
    ctx: null, g: null, rng: null, muted: store.get('sn.muted') === '1', muffled: false, started: false, testing: false,
    lite: 0, irSec: null, live: false, defer: null, chordI: -1, nextChord: 0, crickets: [], nextGust: 0, nextOwl: 0, nextBell: 0, foot: 0,
    stepK: 0, timer: 0, lastTick: 0, bornAt: 0, resumeAt: 0, reopen: false, revive: false,
    primed: null, stats: zero(), heals: 0,
    // the painting: sc = {amb, def, music, bell, night} or null (the gallery); mus = its music; ev = its
    // event channels; windK = the wind's level; hum = context time from which the output must not be
    // silent (a bed or the wind runs; 0 = nothing continuous); nosmp = synthesised only (tests)
    sc: null, mus: null, ev: [], windK: 1, crickK: 1, wetK: 1, hum: 0, nextBreath: 0, nosmp: false, pend: undefined, out: 0,
  };
  const r = () => S.rng();
  const skip = n => { for (let i = 0; i < n; i++) r(); }; // keeps the random sequence of the live recipe it replaces
  const rr = ab => ab[0] + r() * (ab[1] - ab[0]);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const now = () => S.ctx.currentTime;
  const soon = () => S.ctx.currentTime + LEAD;
  // a sound may be made: a graph, not muted, and a context that runs (or has just been created and
  // is starting up); a suspended/interrupted context would bank one-shots up and play them all at once
  const ready = () => !!S.g && (S.testing || (!S.muted && (S.ctx.state === 'running' || performance.now() - S.bornAt < 3000)));

  // ---- never throw, never let a non-finite value in
  const warned = new Set();
  function warnOnce(key, msg, e) { if (warned.has(key)) return; warned.add(key); console.warn('[ui] audio: ' + msg, e ?? ''); }
  function oops(where, e) { S.stats.errs++; warnOnce('err:' + where, `${where} failed; the rest of the mix carries on`, e); }
  function safe(where, fn) { try { return fn(); } catch (e) { oops(where, e); } }
  const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);
  const when = t => Math.max(0, finite(t, S.ctx.currentTime));
  const P = {
    val(p, v) { try { p.value = finite(v, p.defaultValue); } catch (e) { oops('param', e); } },
    set(p, v, t) { try { p.setValueAtTime(finite(v, p.value), when(t)); } catch (e) { oops('param', e); } },
    lin(p, v, t) { try { p.linearRampToValueAtTime(finite(v, p.value), when(t)); } catch (e) { oops('param', e); } },
    exp(p, v, t) { try { p.exponentialRampToValueAtTime(Math.max(1e-6, finite(v, 1e-6)), when(t)); } catch (e) { oops('param', e); } },
    tgt(p, v, t, tc) { try { p.setTargetAtTime(finite(v, p.value), when(t), Math.max(0.001, finite(tc, 0.1))); } catch (e) { oops('param', e); } },
    hold(p, t) { try { p.cancelScheduledValues(when(t)); p.setValueAtTime(finite(p.value, 0), when(t)); } catch (e) { oops('param', e); } },
    curve(p, c, t, d) { try { p.setValueCurveAtTime(c, when(t), Math.max(0.01, finite(d, 1))); } catch (e) { oops('param', e); } },
    // k-rate: filter coefficients once per 128-frame block instead of every sample (older engines ignore it)
    kr(p) { try { p.automationRate = 'k-rate'; } catch { /* stays a-rate */ } return p; },
  };
  function begin(s, t, off, dur) {
    try {
      if (dur != null) s.start(when(t), Math.max(0, finite(off)), Math.max(0.001, finite(dur, 0.1)));
      else if (off) s.start(when(t), Math.max(0, finite(off)));
      else s.start(when(t));
    } catch (e) { oops('start', e); }
  }
  function end(s, t) { try { s.stop(when(t)); } catch (e) { oops('stop', e); } }

  // ---- nodes
  const made = n => (S.stats.nodes++, n);
  function gain(v = 1) { const g = made(S.ctx.createGain()); P.val(g.gain, v); return g; }
  function filter(type, f, q = 0.7) { const b = made(S.ctx.createBiquadFilter()); b.type = type; P.val(b.frequency, f); P.val(b.Q, q); return b; }
  function pan(v = 0) {
    if (!S.ctx.createStereoPanner) return gain(1);
    const p = made(S.ctx.createStereoPanner()); P.val(p.pan, SN.clamp(finite(v), -1, 1)); return p;
  }
  function osc(type, f) { const o = made(S.ctx.createOscillator()); o.type = type; P.val(o.frequency, f); return o; }
  function source(buf, rate = 1) { const s = made(S.ctx.createBufferSource()); s.buffer = buf; if (rate !== 1) P.val(s.playbackRate, rate); return s; }
  function compressor(th, knee, ratio, att, rel) {
    const c = made(S.ctx.createDynamicsCompressor());
    P.val(c.threshold, th); P.val(c.knee, knee); P.val(c.ratio, ratio); P.val(c.attack, att); P.val(c.release, rel);
    return c;
  }
  // the noise buffers and the reverb impulse: drawn in the original engine's order from its seed (the
  // impulse's two channels, then 2 s of white noise, then 4 s of brown), so the room and the wind are
  // the very same noise as before at every sample rate (a noise impulse colours pure tones, the bell
  // and the pad, by its exact realisation). Cached for the last two sample rates (the context's and
  // the self-test's); only the room's cut is kept, not the full 3.4 s impulse it is cut from.
  const BUFS = new Map();
  // the original impulse, 3.4 s stereo: noise that darkens as it decays, under (1 - t)^2.6 with a
  // 15 ms fade-in (pow every 32 samples, linear in between: < 1e-6 off; this runs inside the first tap)
  function drawIR(rate, rb) {
    const full = Math.floor(rate * 3.4), ch = [new Float32Array(full), new Float32Array(full)];
    const env = new Float32Array(full), fin = rate * 0.015;
    for (let i = 0; i < full; i += 32) {
      const a = Math.pow(1 - i / full, 2.6), b = Math.pow(Math.max(0, 1 - (i + 32) / full), 2.6);
      for (let j = i, e = Math.min(full, i + 32); j < e; j++) env[j] = (a + (b - a) * (j - i) / 32) * (j < fin ? j / fin : 1) * 0.9;
    }
    let pow = 0;
    for (const d of ch) {
      let lp = 0;
      for (let i = 0; i < full; i++) {
        lp += (rb() * 2 - 1 - lp) * (0.9 - 0.75 * (i / full));
        const x = lp * env[i];
        d[i] = x; pow += x * x;
      }
    }
    return { ch, full, pow };
  }
  // an impulse cut to `sec` (of the original's `full` samples) and faded over its last quarter, times `scale`
  function cutIR(src, full, scale, rate, sec) {
    const len = Math.min(full, Math.floor(rate * sec)), f0 = Math.floor(len * 0.75), buf = S.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const s = src[ch], d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = s[i] * scale * (len < full && i > f0 ? 0.5 + 0.5 * Math.cos(Math.PI * (i - f0) / (len - f0)) : 1);
    }
    return buf;
  }
  function bufs(rate) {
    let B = BUFS.get(rate);
    if (B) return B;
    const c = S.ctx, rb = SN.rng('ui-audio'), { ch, full, pow } = drawIR(rate, rb);
    const noise = (kind, sec) => {
      const len = Math.floor(rate * sec), N = Math.floor(rate * 0.05), x = new Float32Array(len + N);
      let last = 0;
      for (let i = 0; i < x.length; i++) {
        const w = rb() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; x[i] = last * 3.5; } else x[i] = w;
      }
      const b = c.createBuffer(1, len, rate), d = b.getChannelData(0);
      d.set(x.subarray(0, len));
      for (let i = 0; i < N; i++) d[i] = x[i] * (i / N) + x[len + i] * (1 - i / N); // seamless loop
      return b;
    };
    // the browser's own normalisation of that full impulse (Chrome and WebKit: 10^(-58/20) · 44100/rate / RMS)
    const scale = Math.pow(10, -58 / 20) * (44100 / rate) / Math.max(0.000125, Math.sqrt(pow / (2 * full)));
    B = { rate, full, scale, irs: new Map([[IR_SEC, cutIR(ch, full, scale, rate, IR_SEC)]]), white: noise('white', 2), brown: noise('brown', 4) };
    if (BUFS.size >= 2) BUFS.delete(BUFS.keys().next().value); // (the oldest rate: a context of another rate is gone)
    BUFS.set(rate, B);
    return B;
  }
  // a template may be baked at a rate of its own: any cached noise will do (a buffer plays in any context)
  function noiseBuf(kind) { const B = BUFS.get(S.ctx.sampleRate) || BUFS.values().next().value || bufs(S.ctx.sampleRate); return B[kind]; }
  // the room: that impulse cut to `sec` and faded over its last quarter (a convolver's cost grows with
  // its length; what is cut was below -15 dB, ~1.5% of the energy), scaled as the full one would be
  // normalised and set with normalize = false: normalising the shorter impulse itself would lower the
  // reverb by ~2 dB. A lighter room (≤ 1.5 s) is cut from the kept cut, whose first 1.5 s are the
  // original's own samples; a longer one (self-test only) is drawn again from the seed.
  function impulse(sec) {
    const B = bufs(S.ctx.sampleRate);
    let buf = B.irs.get(sec);
    if (buf) return buf;
    if (sec <= IR_SEC * 0.75) {
      const k = B.irs.get(IR_SEC);
      buf = cutIR([k.getChannelData(0), k.getChannelData(1)], B.full, 1, B.rate, sec);
      B.irs.set(sec, buf);
      return buf;
    }
    return cutIR(drawIR(B.rate, SN.rng('ui-audio')).ch, B.full, B.scale, B.rate, sec);
  }

  // ---- the graph (one object, so the watchdog can replace all of it and the self-test can swap it)
  // (node creation order out, ceiling, lim, comp, muffler, verb, vret, amb, music, sfx is kept from
  // the original engine: .dev/audio-soak/instrument.js taps the first ten nodes by that order)
  function buildGraph(offline = false) {
    const c = S.ctx, G = { offline, born: c.currentTime, voices: [], pans: new Map(), sweepAt: 0, wind: null, bed: null, finale: null, finaleWet: null };
    G.out = gain(offline || !S.muted ? 1 : 0); G.out.connect(c.destination);
    G.ceiling = gain(0.8); G.ceiling.connect(G.out);
    // a true limiter: brick-wall-ish compressor (its automatic make-up gain is ~+1.7 dB) and a fixed
    // ceiling after it, so even a pile-up of fanfare + meows + bell stays under -1.5 dBFS
    G.lim = compressor(-4, 0, 20, 0.001, 0.12); G.lim.connect(G.ceiling);
    G.comp = compressor(-18, 10, 3, 0.008, 0.3); G.comp.connect(G.lim);
    G.muffler = filter('lowpass', !offline && S.muffled ? 700 : openF(), 0.5); P.kr(G.muffler.frequency); G.muffler.connect(G.comp);
    G.verb = made(c.createConvolver()); G.verb.normalize = false;
    const ir = S.irSec ?? LITE[S.lite].ir; if (ir > 0) G.verb.buffer = impulse(ir);
    G.vret = gain(0.55); G.verb.connect(G.vret); G.vret.connect(G.muffler);
    G.amb = gain(0.62); G.amb.connect(G.muffler);
    G.music = gain(0.6); G.music.connect(G.muffler);
    G.sfx = gain(1.35); G.sfx.connect(G.comp);
    G.vin = gain(1); G.vin.connect(G.verb); // the room's input: every send goes here, so the room can be swapped in place
    const B = bufs(c.sampleRate); G.white = B.white; G.brown = B.brown;
    if (!offline && c.createAnalyser) { // the watchdog's ear: after the limiter, before mute
      G.an = c.createAnalyser(); G.an.fftSize = 256; G.ceiling.connect(G.an);
      G.anBuf = typeof G.an.getFloatTimeDomainData === 'function' ? new Float32Array(256) : null;
    }
    return G;
  }
  // the muffler wide open: 20 kHz, or just under Nyquist on a low-rate device (a 16 kHz headset)
  const openF = () => Math.min(20000, S.ctx.sampleRate * 0.45);
  // a lighter (or the full) room, swapped in place: the new convolver takes the sends at once and the
  // old one rings out its tail before it is let go
  function swapVerb(sec) {
    const G = S.g;
    if (!G || G.offline) return;
    const old = G.verb, nv = made(S.ctx.createConvolver());
    nv.normalize = false; if (sec > 0) nv.buffer = impulse(sec);
    nv.connect(G.vret);
    try { G.vin.disconnect(old); } catch { try { G.vin.disconnect(); } catch { /* */ } } // (an engine without disconnect(node))
    G.vin.connect(nv); G.verb = nv;
    setTimeout(() => { try { old.disconnect(); } catch { /* gone */ } }, (IR_SEC + 0.5) * 1000);
  }
  // the continuous layers of a mixer (the wind, the painting's bed): stopped and let go (`fade`: over
  // ~1 s, for a mixer that stays; its gusts' pending targets are cancelled first)
  function stopLayers(G, fade = false) {
    if (!G) return;
    const t = fade ? now() : 0, T = fade ? t + 1.5 : 0, W = G.wind, B = G.bed, nodes = [];
    if (W) { if (fade) for (const g of [W.g1, W.g2]) { P.hold(g.gain, t); P.tgt(g.gain, 0, t, 0.25); } for (const s of W.src) end(s, T); nodes.push(W.g1, W.p2); }
    if (B) { if (fade) { P.hold(B.g.gain, t); P.tgt(B.g.gain, 0, t, 0.25); } for (const x of B.srcs) end(x.s, T); nodes.push(B.g, B.send); if (B.lp) nodes.push(B.lp); }
    const cut = () => { for (const n of nodes) try { n.disconnect(); } catch { /* gone */ } };
    if (fade) setTimeout(cut, 1700); else cut();
    G.wind = null; G.bed = null;
  }
  // let an old mixer go (a new one replaces it in the same context): nothing of it may stay connected,
  // since an analyser with an input is processed for as long as the context lives, and with it everything
  // upstream of it
  function retire(G) {
    if (!G) return;
    stopLayers(G);
    for (const v of G.voices) unhook(v);
    for (const m of G.pans.values()) for (const b of m.values()) try { b.in.disconnect(); if (b.send) b.send.disconnect(); } catch { /* gone */ }
    for (const n of [G.out, G.ceiling, G.an, G.lim, G.comp, G.muffler, G.verb, G.vret, G.amb, G.music, G.sfx, G.vin, G.finale, G.finaleWet]) if (n) try { n.disconnect(); } catch { /* gone */ }
    G.voices.length = 0; G.pans.clear(); G.finale = null; G.finaleWet = null;
  }
  // a shared stereo position + reverb send on `dest` (pan in 0.05 steps, null = unpanned): voices at
  // about the same place and wetness share one StereoPanner and one send gain for as long as they play
  // (the painting's room scales every send: a bedroom is drier than a starry valley)
  function bus(dest, p, wet, until) {
    const G = S.g, q = p == null ? 'c' : Math.round(SN.clamp(finite(p), -1, 1) * 20), w = Math.round(SN.clamp(finite(wet) * S.wetK, 0, 3) * 20);
    let m = G.pans.get(dest);
    if (!m) G.pans.set(dest, (m = new Map()));
    const k = q + '|' + w;
    let b = m.get(k);
    if (!b) {
      const inp = q === 'c' ? gain(1) : pan(q / 20);
      inp.connect(dest);
      let send = null;
      if (w) { send = gain(w / 20); inp.connect(send); send.connect(dest._wet || G.vin); } // (a bus with a room of its own, the finale's: hush fades that too)
      m.set(k, (b = { in: inp, send, until: 0 }));
    }
    b.until = Math.max(b.until, finite(until, now() + 5));
    return b.in;
  }
  // claim a voice slot: refuses a non-finite or far-future start and enforces the caps (voices sounding
  // at t, of this kind and in total; `hi` = an event, allowed past the total). The entry's .head is the
  // node feeding its bus: sweep() disconnects it as soon as the voice is over.
  function claim(kind, t, dur, hi = false) {
    const G = S.g;
    if (!Number.isFinite(t) || !Number.isFinite(dur)) { S.stats.far++; return null; }
    if (!S.defer && t > now() + HORIZON) { S.stats.far++; warnOnce('far', `refused a ${kind} ${Math.round(t - now())} s ahead`); return null; }
    const k = LITE[S.lite].k, cap = kind === 'moment' ? CAPS.moment : Math.max(1, Math.round((CAPS[kind] || 8) * k)), max = Math.round(MAX_VOICES * k);
    let nk = 0, n = 0;
    for (const v of G.voices) if (v.t <= t && v.end > t) { n++; if (v.kind === kind) nk++; }
    if (nk >= cap || (n >= max && !hi)) { S.stats.capped++; return null; }
    const v = { kind, t, end: t + dur, head: null };
    G.voices.push(v); S.stats.voices++;
    return v;
  }
  // build a claimed voice now, or (offline self-test) queue it until its render chunk comes up
  function emit(v, build) { if (S.defer) S.defer.push({ t: v.t, v, build }); else safe(v.kind, () => build(v)); }
  // a finished voice leaves the graph: its head, and any node of its own beyond it (v.extra: the private
  // reverb send of a sound whose pan moves)
  function unhook(v) {
    if (v.head) try { v.head.disconnect(); } catch { /* gone */ }
    if (v.extra) for (const n of v.extra) try { n.disconnect(); } catch { /* gone */ }
  }
  function sweep(c) {
    const G = S.g, L = G.voices;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const v = L[i];
      if (v.end + 0.15 < c) unhook(v); else L[j++] = v;
    }
    L.length = j;
    if (c < G.sweepAt) return;
    G.sweepAt = c + 2;
    for (const m of G.pans.values()) for (const [k, b] of m) {
      if (b.until + 0.5 > c) continue;
      try { b.in.disconnect(); if (b.send) b.send.disconnect(); } catch { /* gone */ }
      m.delete(k);
    }
  }
  // a baked template as a voice: buffer source → gain → the shared bus
  function playBuf(v, buf, t, vol, into, rate = 1) {
    const s = source(buf, rate), g = gain(vol);
    s.connect(g); g.connect(into); begin(s, t);
    v.head = g;
  }
  function liveInto(v, into) { const g = gain(1); g.connect(into); v.head = g; return g; }

  // ---- samples: decoded lazily, one at a time, never throwing (see the header)
  const SMP = { e: new Map(), st: new Map(), queue: [], busy: false, bytes: 0, fails: 0, ms: 0, n: 0, last: new Map(), groups: new Map(), waiters: [], dec: new Map() };
  const CAT_SMP = ['meow-hello', 'meow-ask', 'meow-call', 'mew', 'trill', 'purr'];
  const bundle = () => (window.SN_AUDIO && typeof window.SN_AUDIO === 'object' ? window.SN_AUDIO : null);
  const metaOf = n => { try { const M = window.SN_AUDIO_META; return (M && typeof M[n] === 'object' && M[n]) || {}; } catch { return {}; } };
  // the bundle's names for a group ('meow-hello' → meow-hello-1, -2, …) or an exact name ('amb-cafe-night')
  function smpNames(prefix) {
    const A = bundle();
    if (!A || typeof prefix !== 'string' || !prefix) return [];
    let g = SMP.groups.get(prefix);
    if (!g) {
      const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d+$');
      g = Object.keys(A).filter(k => typeof A[k] === 'string' && (k === prefix || re.test(k))).sort();
      SMP.groups.set(prefix, g);
    }
    return g;
  }
  // queue names (or groups) for decoding, in order; a name already known is left as it is
  function want(list) {
    if (!bundle()) return;
    for (const p of list) if (p) for (const n of smpNames(p)) if (!SMP.st.has(n)) { SMP.st.set(n, 'queued'); SMP.queue.push(n); }
    pump();
  }
  const SMP_REF = 0.079; // (-22 dB: the bundle's meows' loudest 0.4 s)
  // a bed's highpass [Hz, order] (default [45, 2]): the room's take is birdsong over a low hum; the Night Café's has
  // nearly half its energy under 60 Hz (a rumble no phone plays, that only pumps the compressor); the garden's a little
  const BED_HP = { 'amb-room-day': [120, 2], 'amb-cafe-inside': [90, 4], 'amb-garden-day': [70, 2] };
  const lightDevice = () => !!(SN.device && (SN.device.constrained || SN.device.phone || SN.device.lowMemory));
  const smpRate = () => (lightDevice() ? 24000 : 32000);
  function pump() {
    if (SMP.busy) return;
    const n = SMP.queue.shift();
    if (n === undefined) { SMP.waiters.splice(0).forEach(f => f()); return; }
    if (SMP.st.get(n) !== 'queued') { pump(); return; }
    SMP.busy = true; SMP.st.set(n, 'decoding');
    const t0 = performance.now();
    let p;
    try { p = decodeSmp(n); } catch (e) { p = Promise.reject(e); }
    p.then(e => {
      if (SMP.st.get(n) !== 'decoding') return; // released meanwhile
      SMP.e.set(n, e); SMP.st.set(n, 'ok'); SMP.bytes += e.bytes; SMP.n++;
      safe('sample', () => onSample(n, true));
    }, err => {
      if (SMP.st.get(n) !== 'decoding') return;
      SMP.fails++; SMP.st.set(n, 'fail');
      warnOnce('smp:' + n, `could not decode the sample "${n}"; its synthesised stand-in plays`, err);
      safe('sample', () => onSample(n, false));
    }).then(() => { SMP.ms += performance.now() - t0; SMP.busy = false; setTimeout(pump, 0); });
  }
  // wait until these names are decoded (or failed), at most `ms` (the self-test)
  function smpReady(list, ms = 8000) {
    list = list.filter(Boolean); want(list);
    const names = list.flatMap(p => smpNames(p));
    const pending = () => names.some(n => { const s = SMP.st.get(n); return s === 'queued' || s === 'decoding'; });
    if (!pending()) return Promise.resolve();
    return new Promise(res => {
      const t = setTimeout(res, ms);
      const check = () => { if (!pending()) { clearTimeout(t); res(); } else SMP.waiters.push(check); };
      SMP.waiters.push(check);
    });
  }
  function release(n) {
    const e = SMP.e.get(n);
    if (e) { SMP.bytes -= e.bytes; SMP.n--; SMP.e.delete(n); }
    const st = SMP.st.get(n);
    if (st) SMP.st.delete(n); // (a decode in flight is dropped when it lands)
    if (st === 'queued') SMP.queue = SMP.queue.filter(x => x !== n);
  }
  // keep only what this painting (and the cats) can use: other paintings' beds and events go
  function releaseExcept(sc) {
    const keep = new Set([...CAT_SMP, ...(sc ? sceneSamples(sc) : [])].flatMap(p => smpNames(p)));
    for (const n of [...SMP.st.keys()]) if (!keep.has(n)) release(n);
  }
  function bytesOf(uri) {
    const i = uri.indexOf(','), s = atob(uri.slice(i + 1)), n = s.length, u = new Uint8Array(n);
    for (let k = 0; k < n; k++) u[k] = s.charCodeAt(k);
    return u.buffer;
  }
  // decodeAudioData, both calling conventions (older WebKit: callbacks only), settled once, with a timeout
  function decodeIn(c, ab) {
    return new Promise((res, rej) => {
      let done = false, to = 0;
      const ok = b => { if (done) return; done = true; clearTimeout(to); if (b && b.length > 0 && b.numberOfChannels > 0) res(b); else rej(new Error('empty decode')); };
      const no = e => { if (done) return; done = true; clearTimeout(to); rej(e || new Error('decode failed')); };
      to = setTimeout(() => no(new Error('decode timed out')), 15000);
      try { const p = c.decodeAudioData(ab, ok, no); if (p && typeof p.then === 'function') p.then(ok, no); } catch (e) { no(e); }
    });
  }
  // into an offline context at the rate we want (the browser resamples as it decodes: a 28 s bed at
  // 32 kHz ≈ 3.6 MB, at 24 kHz ≈ 2.7 MB); else at 44.1 kHz; else in the live context
  async function decodeSmp(n) {
    const A = bundle(), uri = A && A[n];
    if (typeof uri !== 'string' || !uri) throw new Error('missing');
    const dec = rate => { let c = SMP.dec.get(rate); if (!c && OAC) { c = new OAC(1, 1, rate); SMP.dec.set(rate, c); } return c; }; // (one decoder per rate, reused)
    const mk = [() => dec(smpRate()), () => dec(44100), () => S.ctx];
    let err = null;
    for (const f of mk) {
      let c = null;
      try { c = f(); } catch { c = null; }
      if (!c || c.state === 'closed' || typeof c.decodeAudioData !== 'function') continue;
      try {
        const ab = uri.startsWith('data:') ? bytesOf(uri) : await fetch(uri).then(r0 => r0.arrayBuffer());
        return shape(n, await decodeIn(c, ab), c);
      } catch (e) { err = e; }
    }
    throw err || new Error('no decoder');
  }
  // mono, finite, and where its loop lies: [pad, pad + loopDur] (tools/audio.py wraps `pad` s of the loop
  // around the body so an MP3 decoder's start delay, ≤ pad, leaves the seam continuous)
  function shape(n, b, c) {
    const M = metaOf(n);
    let buf = b;
    if (b.numberOfChannels > 1) {
      let m = null;
      try { m = c.createBuffer(1, b.length, b.sampleRate); } catch { m = new AudioBuffer({ length: b.length, sampleRate: b.sampleRate, numberOfChannels: 1 }); }
      const d = m.getChannelData(0), k = 1 / b.numberOfChannels;
      for (let ch = 0; ch < b.numberOfChannels; ch++) { const x = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] += x[i] * k; }
      buf = m;
    }
    const d = buf.getChannelData(0), rate = buf.sampleRate, dur = buf.duration, bed = M.kind === 'amb' || n.startsWith('amb-');
    let pk = 0, s2 = 0, bad = 0;
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (v - v !== 0) { d[i] = 0; bad++; } }
    // a bed: no rumble under the audible (a far street's sub-bass only fills the compressor; a phone
    // cannot play it): a highpass baked in (BED_HP; its start-up is over long before the loop's pad ends)
    if (bed) {
      const [hz, order] = BED_HP[n] || [45, 2], w = 2 * Math.PI * SN.clamp(finite(hz, 45), 20, 400) / rate, cs = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
      const b0 = (1 + cs) / 2 / a0, b1 = -(1 + cs) / a0, a1 = -2 * cs / a0, a2 = (1 - al) / a0;
      for (let pass = 0; pass < (order >= 4 ? 2 : 1); pass++) {
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < d.length; i++) { const x = d[i], y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y; }
      }
    }
    for (let i = 0; i < d.length; i++) { const v = d[i]; s2 += v * v; if (v > pk) pk = v; else if (-v > pk) pk = -v; }
    // a one-shot's loudest 0.4 s: variants of a group are brought within reach of each other (±6 dB at most:
    // the bundle is already loudness-matched; this only evens out the odd one)
    let act = Math.sqrt(s2 / Math.max(1, d.length));
    if (!bed) {
      const W = Math.min(d.length, Math.round(0.4 * rate)), H = Math.max(1, Math.round(0.05 * rate));
      let best = 0;
      for (let i = 0; i + W <= d.length; i += H) { let e = 0; for (let j = i; j < i + W; j++) e += d[j] * d[j]; if (e > best) best = e; }
      act = Math.sqrt(best / Math.max(1, W));
    }
    const norm = bed ? 1 : SN.clamp(SMP_REF / Math.max(1e-5, act), 0.5, 2);
    const loop = !!M.loop;
    let s0 = 0, s1 = dur, seam = null;
    if (loop) {
      const pad = Math.max(0, finite(+M.pad, 0)), L = finite(+M.loopDur, dur - 2 * pad);
      if (L > 0.25 && pad + L <= dur + 0.002) { s0 = pad; s1 = Math.min(dur, pad + L); }
      // how continuous the seam is (the RMS of the jump across it, relative to the signal): if a decoder
      // shifted the audio by more than the pad, look for the offset that joins it up again
      const err = off => {
        const i0 = Math.round((s0 + off) * rate), i1 = Math.round((s1 + off) * rate), W = 256;
        if (i0 - W < 0 || i1 + W > d.length) return 9;
        let e2 = 0, x2 = 0;
        for (let k = -W; k < W; k++) { const a = d[i0 + k], z = d[i1 + k]; e2 += (a - z) * (a - z); x2 += a * a + z * z; }
        return Math.sqrt(e2 / Math.max(1e-12, x2 / 2));
      };
      seam = err(0);
      if (seam > 0.6 && s1 - s0 > 1) {
        let best = 0, be = seam;
        for (let off = -0.045; off <= 0.045; off += 0.0005) { const e = err(off); if (e < be) { be = e; best = off; } }
        if (be < seam * 0.5) { s0 += best; s1 += best; seam = be; }
      }
      seam = +seam.toFixed(3);
    }
    return { name: n, buf, dur, loop, s0, s1, gain: SN.clamp(finite(+M.gain, 1), 0, 4) * norm, norm: +norm.toFixed(2), peak: +pk.toFixed(3),
      rms: +Math.sqrt(s2 / Math.max(1, d.length)).toFixed(4), act: +act.toFixed(4), bad, seam, rate, bytes: d.length * 4 };
  }
  const smp = n => (S.nosmp ? null : SMP.e.get(n) || null);
  // one decoded sample of a group, never the same one twice running when there is a choice
  function pick(prefix) {
    if (S.nosmp) return null;
    const ok = smpNames(prefix).filter(n => SMP.e.has(n));
    if (!ok.length) return null;
    let i = Math.floor(r() * ok.length) % ok.length;
    if (ok.length > 1 && ok[i] === SMP.last.get(prefix)) i = (i + 1) % ok.length;
    SMP.last.set(prefix, ok[i]);
    return SMP.e.get(ok[i]);
  }
  // a sample as a voice: buffer source → gain (→ lowpass) → a shared bus (or `o.into`). o: {t, vol, rate,
  // pan, wet, lp, dest, kind, hi, off (s into the buffer), dur (s of buffer: an excerpt, looped for a
  // loop), fade: [in, out] s}
  function smpVoice(e, o) {
    const rate = SN.clamp(finite(o.rate, 1), 0.5, 2), off = Math.max(0, finite(o.off));
    const len = o.dur != null ? Math.max(0.05, finite(o.dur, 1)) : Math.max(0.05, e.dur - off), span = len / rate, t = o.t;
    const v = claim(o.kind || 'meow', t, span + 0.05, o.hi ?? true);
    if (!v) return null;
    const vol = Math.max(0, finite(o.vol, 0.3));
    emit(v, v => {
      const s = source(e.buf, rate), g = gain(o.fade ? 0 : vol);
      if (o.dur != null && e.loop) { s.loop = true; try { s.loopStart = e.s0; s.loopEnd = e.s1; } catch { /* the whole buffer */ } }
      s.connect(g);
      let head = g;
      const lp = finite(o.lp, 0);
      if (lp > 0 && lp < Math.min(16000, openF())) { const f = filter('lowpass', lp, 0.5); g.connect(f); head = f; }
      head.connect(o.into || bus(o.dest || S.g.sfx, o.pan == null ? null : finite(o.pan), o.wet ?? 0.3, v.end));
      v.head = head;
      if (o.fade) {
        const fi = Math.min(o.fade[0], span / 2), fo = Math.min(o.fade[1], span / 2);
        P.set(g.gain, 0, t); P.lin(g.gain, vol, t + fi); P.set(g.gain, vol, t + span - fo); P.lin(g.gain, 0, t + span);
      }
      begin(s, t, off); end(s, t + span + 0.02);
    });
    return v;
  }
  // a decode landed (or failed): a painting's bed that was waiting starts now, or its stand-in does
  function onSample(n, ok) {
    if (S.testing || !S.started || !S.g || !S.sc || n !== S.sc.def.bed) return;
    if (ok) { if (!S.g.bed) startBed(now()); }
    else standIn(now());
  }

  // ---- lifecycle
  function create() {
    if (!AC) return false;
    // iOS: say what this is once, before the context exists (never changed later): polite sound that
    // mixes with the player's music — the same as WebKit's 'auto' for Web Audio, but explicit
    try { const as = navigator.audioSession; if (as && as.type === 'auto') as.type = 'ambient'; } catch { /* */ }
    let c = null;
    // 'balanced': a bigger device buffer than 'interactive' (Chrome; WebKit ignores the hint), so a
    // render spike does not become a dropout. No sampleRate: the hardware's own, nothing to resample.
    try { c = new AC({ latencyHint: 'balanced' }); } catch { try { c = new AC(); } catch (e) { warnOnce('ctx', 'unavailable', e); return false; } }
    S.ctx = c; S.bornAt = performance.now(); S.revive = false; S.hum = 0;
    S.rng ||= SN.rng('ui-audio');
    c.onstatechange = () => { if (S.ctx === c) safe('statechange', onState); };
    // a device error: reopen on the next visible tick, through the repair budget (a device that keeps
    // failing is retried ever more rarely, never in a loop)
    if ('onerror' in c) c.onerror = () => { if (S.ctx === c) { warnOnce('device', 'the output device failed; reopening it'); S.reopen = true; } };
    S.g = buildGraph();
    WD.base = null; WD.quietAt = 0; WD.pb = [];
    return true;
  }
  function drop() {
    const c = S.ctx;
    clearInterval(S.timer); S.timer = 0;
    S.ctx = null; S.g = null; S.started = false; S.reopen = false;
    if (c) { c.onstatechange = null; if ('onerror' in c) c.onerror = null; }
    return c;
  }
  function start() {
    S.started = true;
    // the samples: the painting's bed first (it is heard at once), then the cats, then its events
    if (S.sc) want([S.sc.def.bed]);
    want(CAT_SMP);
    if (S.sc) want(sceneSamples(S.sc));
    safe('ambience', startAmbience); S.nextChord = now() + 1.2;
    clearInterval(S.timer); S.timer = setInterval(tick, 200); S.lastTick = performance.now();
    if (S.sc) bankStart(S.ctx.sampleRate);
  }
  // the context should run exactly while the page is visible: never resumed while hidden. `force`: ask
  // even if it reads 'running' (WebKit flips the state a few ms after suspend(): a hide + show inside
  // that window would otherwise be left suspended; resume() on a running context is harmless)
  function resume(force = false) {
    const c = S.ctx;
    if (!c || c.state === 'closed' || document.hidden || (c.state === 'running' && !force)) return;
    S.resumeAt = performance.now();
    try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* the next gesture asks again */ }
  }
  function suspend() {
    const c = S.ctx;
    WD.base = null; WD.pb = [];
    if (c && c.state !== 'closed') try { const p = c.suspend(); if (p && p.catch) p.catch(() => {}); } catch { /* */ }
  }
  // older iOS lets a context sound only once something was started inside a gesture: a silent sample
  function prime() {
    const c = S.ctx;
    if (S.primed === c) return;
    S.primed = c;
    try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0); } catch { /* */ }
  }
  // a touch press (and Esc) is not a user activation, its touchend is: a context made on it may not
  // start ("The AudioContext was not allowed to start"), so a new one waits for that touchend
  const noActivation = e => !!e && ((e.type === 'pointerdown' && !!e.pointerType && e.pointerType !== 'mouse') || (e.type === 'keydown' && e.key === 'Escape'));
  function unlock(e) {
    if (S.testing) return;
    try {
      if (S.ctx && S.ctx.state === 'closed') drop();
      if (!S.ctx && (noActivation(e) || !create())) return;
      if (S.ctx.state !== 'running' && !document.hidden) { resume(); prime(); }
      if (!S.started) start();
    } catch (err) { oops('unlock', err); }
  }
  function onState() {
    const c = S.ctx, st = c.state;
    WD.base = null; WD.pb = [];
    if (st === 'running' || S.testing) return;
    if (st === 'closed') { const was = S.started; drop(); S.revive = was; return; } // not by us: a new one when visible (wake)
    // 'suspended' by the system (device change, OS, a late suspend() of ours) or 'interrupted' (iOS: a
    // call, Siri, another app): ask to resume while visible (WebKit parks the promise until the
    // interruption ends); the scheduler and the next gesture ask again
    resume();
  }
  // the page is visible (again): run, or bring back a context the browser closed (at most as often as
  // the repair budget allows; the frame hook asks every frame until it does)
  function wake() {
    try {
      if (S.testing || document.hidden) return;
      if (S.ctx && S.ctx.state === 'closed') { const was = S.started; drop(); S.revive = was; }
      if (!S.ctx) { if (S.revive && slot()) { S.revive = false; if (create()) { start(); resume(); } } return; }
      if (S.started) resume(true);
      WD.base = null;
    } catch (e) { oops('wake', e); }
  }
  document.addEventListener('visibilitychange', () => {
    if (S.testing) return;
    if (document.hidden) suspend(); else wake();
  });
  addEventListener('pageshow', () => { if (!document.hidden) wake(); });
  function rebuildGraph() {
    retire(S.g);
    S.g = buildGraph();
    if (S.started) safe('layers', () => startLayers(now()));
    S.nextGust = Math.min(S.nextGust, now() + 0.5);
  }
  function rebuildContext(lite) {
    const old = drop();
    try { if (old && old.state !== 'closed') old.close().catch(() => {}); } catch { /* */ }
    if (lite && !S.lite) { S.lite = 1; WD.liteAt = performance.now(); }
    if (create()) { start(); if (document.hidden) suspend(); else resume(); }
  }

  // ---- the watchdog (every tick while the context runs and the page is visible)
  const WD = { base: null, slow: 0, rate: 1, pk: 0, quietAt: 0, kickAt: -1e9, grace: 0, heals: [], lastHeal: -1e9, holdUntil: 0, backoff: 0,
    lastGraph: -1e9, pb: [], und: 0, liteAt: -1e9, liteHold: 180000, revertAt: -1e9 };
  function watchdog(c) {
    if (document.hidden) { WD.base = null; WD.pb = []; return; }
    const wall = performance.now() / 1000, ct = c.currentTime;
    // 1) the audio clock must keep up with the wall clock, judged over 2 s windows (not for 1.5 s after
    // a nudge: the device takes a moment to restart): under half speed it has stalled (nudge, then
    // rebuild); under 0.9x for three windows the render thread cannot keep up (a lighter mix)
    if (wall < WD.grace) WD.base = null;
    else if (!WD.base) WD.base = { wall, ct };
    else {
      const dw = wall - WD.base.wall;
      if (dw > 6) { WD.base = { wall, ct }; WD.pb = []; } // this page's timers slept (system sleep, a long stall): judge nothing
      else if (dw >= 2) {
        WD.rate = (ct - WD.base.ct) / dw; WD.base = { wall, ct };
        if (WD.rate < 0.5) { WD.slow = 0; stalled(c); return; }
        if (WD.rate < 0.9) { if (++WD.slow >= 3) { WD.slow = 0; overload(`the audio clock runs at ${WD.rate.toFixed(2)}x real time`); } } else WD.slow = 0;
        dropouts(c, wall);
        relax();
      }
    }
    // 2) the signal: one NaN poisons a biquad for good; silence while a bed or the wind runs means the
    // chain is dead (the gallery, and a painting whose bed is still decoding, may be silent)
    const G = S.g;
    if (!G || !G.an || !G.anBuf) return;
    G.an.getFloatTimeDomainData(G.anBuf);
    const b = G.anBuf;
    let pk = 0;
    for (let i = 0; i < b.length; i++) { const v = b[i]; if (v - v !== 0) { WD.pk = NaN; return heal('nan'); } if (v > pk) pk = v; else if (-v > pk) pk = -v; }
    WD.pk = pk;
    if (S.muted || ct - G.born < 3 || !S.hum || ct < S.hum) { WD.quietAt = 0; return; } // (fading in, or nothing continuous)
    if (pk >= 1e-5) WD.quietAt = 0;
    else if (!WD.quietAt) WD.quietAt = wall;
    else if (wall - WD.quietAt > 2) heal('silence');
  }
  // dropouts while the clock keeps time (Chrome: AudioContext.playbackStats): more than 2% of the
  // output lost to underruns over 10 s means the mix is too heavy for this machine right now
  function dropouts(c, wall) {
    let p = null;
    try { p = c.playbackStats; } catch { /* */ }
    if (!p) return;
    const und = +p.underrunDuration, tot = +p.totalDuration;
    if (!Number.isFinite(und) || !Number.isFinite(tot)) return;
    const H = WD.pb;
    H.push({ wall, und, tot });
    while (H.length > 2 && wall - H[1].wall >= 10) H.shift();
    const a = H[0], played = tot - a.tot;
    if (wall - a.wall < 10 || played < 5) return;
    WD.und = Math.max(0, (und - a.und) / played);
    if (WD.und > 0.02) { WD.pb = []; overload(`${(WD.und * 100).toFixed(1)}% of the output lost to dropouts`); }
  }
  // one step lighter (in place: a shorter room, fewer voices), at most every 10 s
  function overload(why) {
    const t = performance.now();
    if (t - WD.liteAt < 10000) return; // a lighter mix was just set up: give it time to show
    if (S.lite >= LITE.length - 1) { warnOnce('heavy', `still too heavy at the lightest mix (${why})`); return; }
    if (t - WD.revertAt < 120000) WD.liteHold = Math.min(1440000, WD.liteHold * 2); // back to full too soon: stay lighter longer
    S.lite++; WD.liteAt = t; WD.pb = [];
    warnOnce('lite' + S.lite, `the mix is too heavy for this device (${why}); switching to a lighter mix`);
    swapVerb(LITE[S.lite].ir);
  }
  // and one step back after 3 minutes without trouble (a brief stall, a route change, a busy moment)
  function relax() {
    const t = performance.now();
    if (!S.lite || t - WD.liteAt < WD.liteHold) return;
    S.lite--; WD.liteAt = t; WD.revertAt = t;
    swapVerb(LITE[S.lite].ir);
  }
  function stalled(c) {
    const t = performance.now();
    if (t - WD.kickAt > 15000) { // first a nudge: iOS can report 'running' while currentTime stands still
      WD.kickAt = t; WD.base = null; WD.grace = t / 1000 + 1.5;
      warnOnce('stall', `the audio clock fell behind (${WD.rate.toFixed(2)}x real time); restarting it`);
      try { c.suspend().then(() => { if (S.ctx === c) resume(); }, () => {}); } catch { resume(); } // (resume() waits while hidden)
      return;
    }
    heal('stall'); // still stalled one window after the nudge: a new context
  }
  // the repair budget, shared by every rebuild (mixer, context, device reopen, revive): at most 3 in any
  // minute; past that one attempt 10 s later, then 20, 40, 60 s apart for as long as the fault persists;
  // two quiet minutes restore it
  function slot() {
    const t = performance.now();
    if (t < WD.holdUntil) return false;
    if (t - WD.lastHeal > 120000) WD.backoff = 0;
    WD.lastHeal = t;
    WD.heals = WD.heals.filter(x => t - x < 60000); WD.heals.push(t); S.heals++;
    if (WD.backoff || WD.heals.length >= 3) {
      WD.backoff = Math.min(60000, WD.backoff ? WD.backoff * 2 : 10000);
      warnOnce('backoff', 'the audio keeps failing; repairing it less often (10 s apart, then 20, 40, 60 s)');
    }
    WD.holdUntil = t + WD.backoff;
    return true;
  }
  // a NaN or silence: the mixer is rebuilt in place (cheap); if the same trouble is back within 20 s,
  // the whole context. A stall: the context, one step lighter.
  function heal(why) {
    WD.quietAt = 0; WD.base = null;
    if (!slot()) return; // the watchdog asks again while the fault lasts
    const t = performance.now(), graph = why !== 'stall' && t - WD.lastGraph > 20000;
    warnOnce('heal:' + why, (why === 'nan' ? 'a NaN reached the output' : why === 'silence' ? 'the output went silent' : 'the audio clock stalled')
      + (graph ? '; rebuilt the mixer' : why === 'stall' ? '; rebuilt the audio context (lighter mix)' : '; rebuilt the audio context'));
    if (graph) { WD.lastGraph = t; rebuildGraph(); } else { WD.lastGraph = -1e9; rebuildContext(why === 'stall'); }
  }

  // ---- the scheduler
  function tick() {
    S.lastTick = performance.now();
    if (S.testing) return;
    const c = S.ctx;
    if (!c) return;
    if (S.reopen && !document.hidden && slot()) { S.reopen = false; safe('reopen', () => rebuildContext(false)); return; }
    if (c.state !== 'running') { // visible and not running: keep asking (a device change, an iOS interruption)
      if (!document.hidden && performance.now() - S.resumeAt > 3000) resume();
      WD.base = null;
      return;
    }
    safe('sweep', () => sweep(c.currentTime));
    safe('watchdog', () => watchdog(c));
    if (!S.ctx || S.ctx.state !== 'running' || !S.g) return; // the watchdog may have replaced it
    const t = S.ctx.currentTime;
    if (S.muted) { // make nothing while muted, just keep the clocks moving
      S.nextGust = Math.max(S.nextGust, t); S.nextChord = Math.max(S.nextChord, t + 0.5);
      S.nextOwl = Math.max(S.nextOwl, t + 10); S.nextBell = Math.max(S.nextBell, t + 20);
      for (const k of S.crickets) k.next = Math.max(k.next, t + 1);
      for (const k of S.ev) k.next = Math.max(k.next, t + 2);
      return;
    }
    safe('schedule', () => schedule(t));
  }
  function schedule(t, look = LOOKAHEAD) {
    const ahead = t + look;
    if (!Number.isFinite(S.nextGust)) S.nextGust = t + 1;
    if (S.nextGust < ahead) { try { gust(t); } catch (e) { S.nextGust = t + 5; oops('wind', e); } }
    for (const k of S.crickets) {
      if (!Number.isFinite(k.next)) k.next = t + 1;
      for (let n = 0; k.next < ahead && n < 32; n++) {
        const late = k.next < t - 0.05, at = Math.max(k.next, t + 0.01);
        if (k.bout > 0) {
          if (late) S.stats.late++; else if (!k.out || S.out) safe('cricket', () => cricket(at, k.f, k.pan)); // (the square's crickets: only out there)
          k.bout--; k.next = at + 0.5 + r() * 0.35;
        } else { k.bout = 4 + Math.floor(r() * 9); k.next = at + 2 + r() * 8; }
      }
    }
    if (!(S.nextOwl >= ahead)) { const at = Math.max(finite(S.nextOwl, t), t); safe('owl', () => owl(at)); S.nextOwl = t + 50 + r() * 70; }
    if (!(S.nextBell >= ahead)) { const at = Math.max(finite(S.nextBell, t), t); safe('bell', () => bell(at)); S.nextBell = t + 80 + r() * 100; }
    if (S.sc && S.sc.def.outside && !S.testing) safe('zone', () => zoneTick(t));
    if (S.ev.length) sceneTick(t, ahead);
    if (S.g.bed && !(S.nextBreath >= t)) { // the bed breathes a little (a loop heard at one level is a loop)
      const B = S.g.bed; P.tgt(B.g.gain, B.lvl * zoneBed() * (0.84 + r() * 0.28), t + 0.05, 2.5); S.nextBreath = t + 5 + r() * 7;
    }
    if (S.g.bed && !(S.g.bed.seekAt >= t)) safe('bed', () => bedSeek(Math.max(t + 0.05, S.g.bed.seekAt))); // (and moves on)
    // music: in a painting, not while it is still being built (the main thread is busy then)
    if (S.sc && (S.testing || SN.game?.state !== 'loading')) musicTick(t, ahead);
    else S.nextChord = Math.max(finite(S.nextChord, t), t + 1.2);
  }

  // ---- the paintings: what each sounds like (SN.level.audio.ambience). A sampled bed (a seamless loop)
  // and sampled events (each with a synthesised stand-in), over the synthesised layers: the wind
  // (`wind`, or `windAlt` while the bed is missing), crickets [freq, pan, first], the owl, the bell.
  // ev: {name: sample group, every: [s, s], floor (s, a flock's shortest gap), first, gain, pan (±), wet, lp, rate,
  // sweep (a pass-by; fade: [in, out] s over its take), flock, src (a place the painting may name: layout.sounds[src], see placeOf), alt (only while
  // the bed is missing: a stand-in for part of it), synth (the stand-in when the sample is missing)}; creak: the
  // chance a footstep on wood creaks (floor-creak); steps: the footstep surfaces baked up front (any other is baked
  // the first time it is walked on); stepAs: surfaces played as others here; cricketsAlt: crickets while the bed is
  // missing; preload: samples the painting's modules play (SN.audio.play), decoded with the bed; musicAs: the scene's
  // own variant of a music ('day' → 'evening'); wetK: the room (scales every reverb send); outside: a way out of the
  // room (the Night Café's square: see zoneTick)
  const SUNFLOWERS_WINDOW = { x: -15, y: 9, z: 56 }; // (levels/sunflowers/10-table.js: the window at RZ1, WX0…WX1, wy0…wy1)
  const SCENES = {
    // Saint-Rémy, June: the mistral in the cypress, crickets, a scops owl, a nightingale far off in the
    // olives, and now and then a cart on the road down in the village (sampled where the bundle has them)
    'village-night': { night: true, music: 'night', wind: 1, crickets: [[4400, -0.55, 1.5], [4950, 0.6, 3.4], [3900, 0.15, 7]], owl: true, steps: ['stone', 'grass'], ev: [
      { name: 'bird', every: [28, 70], first: [14, 30], gain: 0.55, pan: 0.85, wet: 0.95, lp: 5500, rate: [0.9, 0.98], synth: 'bird' },
      { name: 'hoof', every: [100, 200], first: [45, 90], gain: 0.6, sweep: 0.5, wet: 1.0, lp: 2200, rate: [0.94, 1.02], synth: 'hoof' },
    ] },
    'cafe-night': { night: true, music: 'night', bed: 'amb-cafe-night', wind: 0, windAlt: 0.6, crickets: [[4950, 0.7, 6]], crickK: 0.45, creak: 0.05, steps: ['stone', 'wood'], ev: [
      { name: 'clink', every: [5, 15], first: [2, 6], gain: 0.7, pan: 0.75, wet: 0.35, lp: 9000, synth: 'clink' },
      { name: 'hoof', every: [55, 110], first: [16, 34], gain: 0.9, sweep: 0.85, wet: 0.5, lp: 5200, synth: 'hoof' },
    ] },
    'river-night': { night: true, music: 'night', bed: 'amb-river-night', bedGain: 1.2, wind: 0, windAlt: 0.55, crickets: [[4400, -0.6, 2], [3900, 0.5, 5]], crickK: 0.8, creak: 0.07, steps: ['stone', 'earth', 'wood'], ev: [
      { name: 'water-lap', every: [3.5, 9], first: [1.5, 4], gain: 0.48, pan: 0.6, wet: 0.45, lp: 5000, synth: 'lap' },
      { name: 'boat-creak', every: [20, 45], first: [8, 18], gain: 0.7, pan: 0.7, wet: 0.6, lp: 4200, synth: 'creak' },
    ] },
    'room-day': { night: false, music: 'day', bed: 'amb-room-day', bedGain: 1.0, wind: 0, windAlt: 0.25, wetK: 0.55, creak: 0.13, steps: ['stone', 'wood'], ev: [
      { name: 'bird', every: [7, 18], first: [3, 8], gain: 0.9, pan: 0.8, wet: 0.4, lp: 6500, synth: 'bird' },
    ] },
    'wheat-wind': { night: false, music: 'day', bed: 'amb-wheat-wind', bedGain: 0.95, wind: 0.5, windAlt: 1, steps: ['wheat', 'grass', 'earth'], ev: [
      { name: 'crow', every: [6, 16], floor: 4.5, first: [2, 5], gain: 1.1, pan: 0.8, wet: 0.6, lp: 7000, synth: 'crow', flock: true },
      { name: 'thunder-far', every: [60, 140], first: [22, 45], gain: 1.3, pan: 0.5, wet: 1.3, lp: 900, rate: [0.88, 1.02], synth: 'thunder' },
    ] },
    // VI. The Night Café, 3 a.m.: the clock ticking over the bar, a murmur at the tables, the gas lamps hissing
    // (the bed); the balls clacking on the billiard table (from the table, where the painting says it stands:
    // layout.sounds.billiard or layout.billiard), a glass set down at the bar or a table, a board or a chair
    // creaking somewhere in the room, and the old
    // boards creak underfoot. Out on the Place Lamartine (layout.street, beyond layout.room) the room is heard
    // through the door and the glass, the night air and the crickets outside. Without its bed: a low room tone
    // (the wind, faint) and the clock itself.
    'cafe-inside': { night: true, music: 'night', bed: 'amb-cafe-inside', bedGain: 1.12, wind: 0, windAlt: 0.3, wetK: 0.75, creak: 0.1, steps: ['wood', 'stone'],
      outside: { in: 'street', not: 'room', bed: 0.4, lp: 900, ev: 0.45, wind: 0.35, crickets: [[4950, 0.7, 2], [4400, -0.6, 4.5]] }, ev: [
      { name: 'billiard', every: [9, 22], first: [4, 9], gain: 1.2, pan: 0.6, wet: 0.5, lp: 8500, rate: [0.94, 1.05], synth: 'billiard', src: 'billiard' },
      { name: 'clink', every: [14, 34], first: [7, 14], gain: 0.8, pan: 0.8, wet: 0.45, lp: 8000, synth: 'clink', src: ['bar', 'the left-hand tables', 'the right-hand tables'] },
      { name: 'floor-creak', every: [28, 64], first: [15, 30], gain: 0.4, pan: 0.85, wet: 0.55, lp: 3200, rate: [0.88, 1.04], synth: 'creak' },
      { name: null, alt: true, every: [4, 4], first: [0.4, 0.8], gain: 1, pan: 0.3, wet: 0.45, synth: 'clock', src: 'clock' },
    ] },
    // VII. Sunflowers: an August afternoon in the Yellow House, seen from the tabletop. A cat-sized visitor is far
    // from the one window (behind the painter's left shoulder: layout.sounds.window, else where 10-table.js puts
    // it), so the house's own room tone (the Bedroom's take) comes muffled and low (bedLp); out there the cicadas
    // sing in the heat, a bird calls now and then and a cart goes by in the street, all from the window. Near at
    // hand a bee finds the flowers and passes by (round the vase: layout.vase). Footsteps are small ones on the
    // table's wood ('wood' plays as 'table' here).
    'table-day': { night: false, music: 'day', bed: 'amb-room-day', bedGain: 1.1, bedLp: 1500, wind: 0, windAlt: 0.25, wetK: 0.5, steps: ['table', 'carpet'], stepAs: { wood: 'table' }, ev: [
      { name: 'bee', every: [12, 28], first: [5, 10], gain: 0.8, sweep: 0.7, fade: [0.35, 0.7], wet: 0.3, lp: 7000, rate: [0.94, 1.06], synth: 'bee', src: 'vase', ref: 12 },
      { name: null, every: [6, 13], first: [0.5, 2], gain: 1, pan: 0.3, wet: 0.6, synth: 'cicada', src: 'window', at: SUNFLOWERS_WINDOW, ref: 30 },
      { name: 'bird', every: [14, 32], first: [7, 15], gain: 0.7, pan: 0.85, wet: 0.5, lp: 5500, lpMin: 3600, rate: [0.95, 1.03], synth: 'bird', src: 'window', at: SUNFLOWERS_WINDOW, ref: 30 },
      { name: 'hoof', every: [90, 170], first: [40, 75], gain: 0.6, sweep: 0.3, wet: 0.7, lp: 1500, rate: [0.94, 1.02], synth: 'hoof', src: 'window', at: SUNFLOWERS_WINDOW, ref: 30 },
    ] },
    // VIII. Irises: the asylum garden at Saint-Rémy in May: bees at work, birds, the pines (the bed); bees passing
    // among the flower beds (layout.beds), a bird in the pines, the olives or the lilacs (layout.pines, …). The gravel walk along the asylum crunches (its 'stone' plays as
    // 'gravel' here; 'path' / 'gravel' anywhere); the paths of pale earth are earth, the dug beds soft soil.
    'garden-day': { night: false, music: 'day', bed: 'amb-garden-day', bedGain: 1.15, wind: 0, windAlt: 0.55, wetK: 0.8, steps: ['earth', 'grass', 'gravel', 'soil'], stepAs: { stone: 'gravel' }, ev: [
      { name: 'bee', every: [7, 18], first: [3, 7], gain: 0.62, sweep: 0.8, fade: [0.35, 0.7], wet: 0.35, lp: 8000, rate: [0.92, 1.08], synth: 'bee', src: 'beds', ref: 8 },
      { name: 'bird', every: [10, 26], first: [5, 12], gain: 0.85, pan: 0.85, wet: 0.6, lp: 6500, rate: [0.94, 1.04], synth: 'bird', src: ['pines', 'olives', 'lilacs'], ref: 12 },
    ] },
    // IX. The Sower: a ploughed field at sunset: skylarks, a warm breeze, the first crickets (the bed); a bird
    // across the field, the crows that follow the sower for his seed (a flock, if the painting has one:
    // SN.modules.crows or sky.crows), and the seed itself when the painting throws it (SN.audio.play('seeds-1'),
    // decoded with the bed; playGain: what the self-test plays it at, as the Sower's cast is heard from the
    // painting view: 0.8 at 7 m from ~5 m off). Its day music is the evening one: warmer and slower. The furrows
    // are soft soil ('soil', and 'earth' plays as 'soil' here); the packed path and farmyard say 'dirt' (earth).
    // Without its bed: the wind and two crickets.
    'field-evening': { night: false, music: 'day', musicAs: { day: 'evening' }, bed: 'amb-field-evening', bedGain: 1.3, wind: 0, windAlt: 0.7, wetK: 0.9,
      cricketsAlt: [[4400, -0.5, 3], [3900, 0.55, 6.5]], crickK: 0.6, preload: ['seeds'], playGain: { seeds: 0.9 }, steps: ['soil', 'wheat', 'grass', 'earth'], stepAs: { earth: 'soil' }, ev: [
        { name: 'bird', every: [22, 50], first: [8, 18], gain: 0.75, pan: 0.85, wet: 0.8, lp: 5000, rate: [0.9, 1.0], synth: 'bird' },
        { name: 'crow', every: [30, 70], floor: 9, first: [14, 30], gain: 0.7, pan: 0.8, wet: 0.8, lp: 5200, synth: 'crow', flock: true },
      ] },
  };
  const BED_V = 1, BED_SEND = 0.22; // the bed's level (the files are at -26 LUFS) and its reverb send (stereo width)
  // SN.level → {amb, def, music, bell, night} (null: the gallery). An unknown ambience sounds like the
  // village without its bell and owl.
  function sceneOf(L) {
    if (!L) return null;
    const A = (L.audio && typeof L.audio === 'object') ? L.audio : {}, known = !!SCENES[A.ambience];
    const amb = known ? A.ambience : 'village-night', night = L.night !== false && (known ? SCENES[amb].night : true);
    const def = known ? SCENES[amb] : { ...SCENES['village-night'], owl: night, crickets: night ? SCENES['village-night'].crickets : [] };
    // the music asked for ('night' | 'day' | 'evening'), else the scene's; a scene may play its own variant of it
    // (the field at sunset: its 'day' is the evening music)
    let music = isMusic(A.music) ? A.music : def.music || (night ? 'night' : 'day');
    if (def.musicAs && isMusic(def.musicAs[music])) music = def.musicAs[music];
    return { amb, def, music, bell: A.bell != null ? !!A.bell : known && amb === 'village-night', night, key: `${amb}|${music}|${A.bell}|${night}` };
  }
  const isMusic = m => typeof m === 'string' && Object.prototype.hasOwnProperty.call(MUSIC, m);
  const sceneByName = amb => sceneOf({ audio: { ambience: amb }, night: SCENES[amb] ? SCENES[amb].night : true });
  const creakGroup = () => ['floor-creak', 'creak', 'boat-creak'].find(g => smpNames(g).length) || null; // (the first the bundle has)
  // what a painting decodes as it loads: its bed, its events, the creak (old boards) and what its modules play (preload)
  const sceneSamples = sc => [sc.def.bed, ...(sc.def.ev || []).map(e => e.name), ...(sc.def.preload || []), sc.def.creak ? creakGroup() : null].filter(Boolean);
  // a painting loads (or the gallery shows): its sound from now on
  function setScene(L) {
    if (S.testing) { S.pend = L; return; } // (the self-test restores its state when it ends: apply this after it)
    const sc = sceneOf(L);
    if ((sc ? sc.key : '') === (S.sc ? S.sc.key : '')) return;
    S.sc = sc; S.mus = MUSIC[sc ? sc.music : 'night'] || MUSIC.night; S.chordI = -1; S.out = 0;
    safe('release', () => releaseExcept(sc));
    if (!S.started || !S.ctx || !S.g) return; // start() takes it from here
    safe('scene', () => {
      stopLayers(S.g, true); hushMusic();
      startAmbience();
      if (sc) { want([sc.def.bed]); want(sceneSamples(sc)); bankStart(S.ctx.sampleRate); bankMusic(); bankScene(sc); }
    });
  }
  // another painting's (or no) music from now on: the old one's chords fade out quickly and let go
  function hushMusic() {
    const G = S.g, t = now(), K = new Set(['pad', 'piano', 'cel']);
    const old = G.voices.filter(v => K.has(v.kind));
    P.hold(G.music.gain, t); P.tgt(G.music.gain, 0, t, 0.12);
    setTimeout(() => {
      if (S.g !== G || !S.ctx) return;
      for (const v of old) { unhook(v); v.end = -1; } // (swept on the next tick)
      P.hold(G.music.gain, now()); P.tgt(G.music.gain, 0.6, now(), 0.05);
    }, 700);
  }
  // the continuous layers: the painting's bed (when decoded) and the wind at its level (a stand-in for a
  // bed that is missing or failed)
  function bedState(sc) {
    const n = sc && sc.def.bed;
    if (!n || S.nosmp || !smpNames(n).length) return 'none';
    const st = SMP.st.get(n);
    return st === 'ok' ? 'ok' : st === 'fail' ? 'none' : 'wait';
  }
  function startLayers(t) {
    const sc = S.sc;
    if (!sc) return;
    const d = sc.def, bs = bedState(sc);
    S.windK = bs === 'none' && d.bed ? finite(d.windAlt, 0) : finite(d.wind, 0);
    if (S.windK > 0) startWind(t);
    if (bs === 'ok') startBed(t);
  }
  // a room with a way out (the Night Café's square): def.outside = {in: layout rect the player may step out into,
  // not: the room's rect, bed (its level out there), lp (Hz: the bed through the door), ev (the room's events),
  // wind (the night air), crickets}. Out there the bed is muffled and lower, the wind comes up, the crickets sing.
  const zoneBed = () => (S.out && S.sc && S.sc.def.outside ? finite(S.sc.def.outside.bed, 0.4) : 1);
  const windNow = () => Math.max(S.windK, S.out && S.sc && S.sc.def.outside ? finite(S.sc.def.outside.wind, 0) : 0);
  function outsideNow(Z) {
    const L = SN.world && SN.world.layout, p = SN.player && SN.player.pos;
    if (!L || !p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
    const inR = (R, m) => !!R && typeof R === 'object' && p.x >= R.x0 - m && p.x <= R.x1 + m && p.z >= R.z0 - m && p.z <= R.z1 + m;
    return inR(L[Z.in], 0) && !inR(L[Z.not], 0.35);
  }
  function zoneTick(t) {
    const Z = S.sc.def.outside, G = S.g, o = outsideNow(Z) ? 1 : 0;
    if (o && windNow() > 0 && !G.wind) { startWind(t); S.nextGust = Math.min(S.nextGust, t + 0.3); }
    if (o === S.out) return;
    S.out = o;
    const B = G.bed;
    if (B) { if (B.lp) { P.hold(B.lp.frequency, t); P.tgt(B.lp.frequency, o ? Math.min(finite(Z.lp, 1000), bedOpen()) : bedOpen(), t, 0.35); } P.hold(B.g.gain, t); P.tgt(B.g.gain, B.lvl * zoneBed(), t, 0.45); }
    S.nextGust = Math.min(S.nextGust, t + 0.3); // (the wind comes up, or dies down, from the next gust)
  }
  function standIn(t) { // the bed failed after all: its stand-in (more wind, and its crickets) from the next gust on
    const d = S.sc && S.sc.def;
    if (!d || !d.bed) return;
    S.windK = finite(d.windAlt, 0);
    if (S.windK > 0 && !S.g.wind) { startWind(t); S.nextGust = Math.min(S.nextGust, t + 0.5); }
    if (d.cricketsAlt && !S.crickets.some(k => k.alt)) S.crickets.push(...crickets(d.cricketsAlt, t, true));
  }
  const crickets = (list, t, alt = false) => (Array.isArray(list) ? list : []).map(([f, p, dt]) => ({ f, pan: p, next: t + dt, bout: 0, alt }));
  // the bed: its loop through a crossfade stage (x) → the level that breathes (g) → the ambience and a send.
  // Every 22-38 s it moves on to somewhere else in the loop (a 2.5 s equal-power crossfade between two
  // sources of the one buffer), so a 28 s take is not heard as a 28 s loop over ten minutes.
  function bedSource(B, e, t, off) {
    const s = source(e.buf); s.loop = true;
    try { s.loopStart = e.s0; s.loopEnd = e.s1; } catch { /* the whole buffer */ }
    const x = gain(1); s.connect(x); x.connect(B.g);
    begin(s, t, off);
    const src = { s, x, t, off };
    B.srcs.push(src);
    return src;
  }
  const BED_XF = 2.5, XF_IN = new Float32Array(33).map((_, i) => Math.sin(i / 32 * Math.PI / 2)), XF_OUT = XF_IN.slice().reverse();
  // the bed's lowpass while in the room: wide open, or the scene's bedLp (a room heard from far off its window: the
  // Sunflowers' tabletop hears the Bedroom's take muffled, a house away from its birds)
  const bedOpen = () => Math.min(openF(), finite(S.sc && +S.sc.def.bedLp, 1e9));
  function startBed(t) {
    const G = S.g, e = S.sc && smp(S.sc.def.bed);
    if (!G || !e || G.bed) return;
    // (a painting with a way out of the room, or a bedLp: a lowpass after the level, wide open (Butterworth: flat) while inside)
    const Zd = S.sc.def.outside, g = gain(0), lp = Zd || S.sc.def.bedLp ? filter('lowpass', S.out && Zd ? Math.min(finite(Zd.lp, 1000), bedOpen()) : bedOpen(), Math.SQRT1_2) : null;
    const send = gain(BED_SEND * S.wetK), lvl = BED_V * e.gain * finite(S.sc.def.bedGain, 1), o = lp || g;
    if (lp) { P.kr(lp.frequency); g.connect(lp); }
    o.connect(G.amb); o.connect(send); send.connect(G.vin);
    P.set(g.gain, 0, t); P.tgt(g.gain, lvl * zoneBed(), t + 0.05, 1.3); // a gentle fade-in (~4 s)
    const B = G.bed = { g, lp, send, lvl, name: e.name, e, srcs: [], seekAt: t + 22 + r() * 16, seeks: 0 };
    bedSource(B, e, t, e.s0 + (S.testing ? 0 : r() * 0.9 * (e.s1 - e.s0))); // (each visit starts somewhere else in the loop)
    S.nextBreath = t + 6;
    S.hum = S.hum ? Math.min(S.hum, t + 4) : t + 4;
  }
  function bedSeek(t) {
    const B = S.g.bed, e = B.e, L = e.s1 - e.s0;
    B.seekAt = t + 22 + r() * 16;
    if (!(L > 12) || B.srcs.length !== 1) return;
    const cur = B.srcs[0], pos = (cur.off - e.s0 + (t - cur.t)) % L; // where the old one is at t (s into the loop)
    const to = e.s0 + (pos + 6 + r() * (L - 12)) % L; // at least 6 s away from it, either side
    const nx = bedSource(B, e, t, to); B.seeks++;
    P.curve(nx.x.gain, XF_IN, t, BED_XF); // (its gain is 1 until t, but it starts at t: the curve begins at 0)
    P.curve(cur.x.gain, XF_OUT, t, BED_XF); end(cur.s, t + BED_XF + 0.05);
    // the old one leaves when the fade has run in audio time (a context suspended mid-fade, hidden or iOS
    // 'interrupted', must not lose it early: that is a jump in the bed when it resumes)
    const done = t + BED_XF + 0.05, drop = () => {
      if (S.g && S.g.bed === B && S.ctx && S.ctx.state !== 'closed' && S.ctx.currentTime < done) { setTimeout(drop, 500); return; }
      try { cur.x.disconnect(); } catch { /* gone */ } const i = B.srcs.indexOf(cur); if (i >= 0) B.srcs.splice(i, 1);
    };
    setTimeout(drop, (done - now() + 0.25) * 1000);
  }
  function sceneTick(t, ahead) {
    if (!S.testing) for (const k of S.ev) if (k.e.flock) crowWatch(t, k.e);
    let alt = null; // (an 'alt' event stands in for part of the bed: it plays only while the bed is missing or failed)
    for (const k of S.ev) {
      if (!Number.isFinite(k.next)) k.next = t + 5;
      if (k.next >= ahead) continue;
      const at = Math.max(k.next, t + 0.01), late = k.next < t - 0.3, fl = k.e.flock ? flock() : null;
      if (k.e.alt && (alt ??= bedState(S.sc) === 'none') === false) { k.next = at + rr(k.e.every); continue; }
      if (late) S.stats.late++; else safe('event', () => sceneEvent(k.e, at, fl));
      // (the crows call more when the flock is near, but never a constant chorus: ≥ `floor` s apart)
      k.next = at + (fl ? Math.max(finite(k.e.floor, 4), rr(k.e.every) / (1 + 1.2 * fl.k)) : rr(k.e.every));
    }
  }
  // one painting event: its sample (random pan, rate, level) or its synthesised stand-in
  function sceneEvent(e, t, fl, dest = S.g.amb) {
    const x = pick(e.name), pl = !fl && (e.src || e.at) ? placeOf(e.src, e.ref, e.at) : null;
    let side = fl && fl.pan != null ? SN.clamp(fl.pan + (r() - 0.5) * 0.3, -0.9, 0.9) : (r() * 2 - 1) * finite(e.pan, 0);
    // a flock: louder, brighter and drier the nearer it is (a far crow is a dull call across the field)
    let vol = e.gain * (0.8 + r() * 0.35) * (fl ? 0.5 + 0.6 * fl.k : 1), lp = fl ? Math.min(finite(e.lp, 7000), 2600 + 4400 * fl.k) : e.lp, wet = fl ? e.wet * (1.3 - 0.5 * fl.k) : e.wet;
    const rate = e.rate ? rr(e.rate) : 1 + (r() - 0.5) * 0.08;
    // a sound with a place in the painting (the billiard table): from there, by its bearing and distance
    if (pl) { side = SN.clamp(pl.pan + side * 0.1, -0.85, 0.85); vol *= pl.k; lp = Math.min(finite(lp, 9000), Math.max(pl.lp, finite(e.lpMin, 0))); wet *= pl.wet; } // (lpMin: never duller than that, e.g. a bird at a far window behind you)
    const Z = S.out && S.sc && S.sc.def.outside; // (out in the square: the room's sounds through the door and the glass)
    if (Z && e.inside !== false) { vol *= finite(Z.ev, 0.5); lp = Math.min(finite(lp, 9000), finite(Z.lp, 1000) * 2); }
    if (x) {
      if (e.sweep) return passBy(x, t, vol * x.gain, rate, e, dest, pl);
      return smpVoice(x, { t, vol: vol * x.gain, rate, pan: side, wet, lp, dest, kind: 'evt', hi: false });
    }
    const fn = SYN[e.synth];
    return fn ? fn(t, side, vol, dest) : null;
  }
  // a sample that passes by (the horse and cart, a bee): its own panner, swept from one side to the other (with a
  // place, `pl`: across a narrower arc around where it is, e.g. the bees round the vase)
  function passBy(x, t, vol, rate, e, dest, pl = null) {
    const span = x.dur / rate, dir = r() < 0.5 ? 1 : -1, v = claim('evt', t, span + 0.05);
    if (!v) return null;
    const c = pl ? pl.pan : 0, w = pl ? e.sweep * 0.6 : e.sweep, p0 = SN.clamp(c - dir * w, -0.9, 0.9), p1 = SN.clamp(c + dir * w, -0.9, 0.9);
    emit(v, v => {
      const s = source(x.buf, rate), g = gain(e.fade ? 0 : vol), f = filter('lowpass', e.lp || 6000, 0.5), pn = pan(p0);
      s.connect(g).connect(f).connect(pn).connect(dest);
      if (e.fade) { // (a take that starts or stops mid-buzz: it arrives and leaves)
        const fi = Math.min(e.fade[0], span / 3), fo = Math.min(e.fade[1], span / 2);
        P.set(g.gain, 0, t); P.lin(g.gain, vol, t + fi); P.set(g.gain, vol, t + span - fo); P.lin(g.gain, 0, t + span);
      }
      if (pn.pan) { P.set(pn.pan, p0, t); P.lin(pn.pan, p1, t + span); }
      const sg = gain(e.wet * S.wetK); pn.connect(sg); sg.connect(S.g.vin); // (its pan moves: a send of its own)
      v.head = pn; v.extra = [sg];
      begin(s, t); end(s, t + span + 0.02);
    });
    return v;
  }
  // where a painting says a sound comes from (optional, read defensively): SN.world.layout.sounds[name], else
  // layout[name], else the layout.places entries of that name ('the clock'), else `at` (the scene's own idea of where
  // it is, for a painting that names no such place): {x, y, z}, [x, y, z], a rectangle {x0, x1,
  // z0, z1, h} or a list of them (the nearer of two at random); `name` may be a list of names (one at random) → from the camera:
  // {pan (− = left), k (level by distance: 1 at `ref` m (6), up to 1.4 close by, down to 0.35 far), lp (duller when
  // far or behind you), wet (wetter far off), d}, or null (no place: a random side, as before)
  function placeOf(name, ref = 6, at = null) {
    try {
      const L = SN.world && SN.world.layout, c = SN.camera && SN.camera.position;
      if (Array.isArray(name)) name = name.length ? name[Math.floor(r() * name.length) % name.length] : null; // (one of several places)
      if (!L || !c || typeof name !== 'string') return at ? placeAt(at, ref) : null;
      let p = (L.sounds && typeof L.sounds === 'object' && L.sounds[name]) || L[name];
      // (or a named place: layout.places [{name: 'the clock', x, z}]; every place of that name, e.g. the café's
      // three 'left-hand tables': a list, so the sound comes from any of them)
      if (!p && Array.isArray(L.places)) {
        const all = L.places.filter(q => q && typeof q === 'object' && (q.name === name || q.name === 'the ' + name));
        p = all.length > 1 ? all : all[0] || null;
      }
      p ||= at;
      if (Array.isArray(p) && p.length && typeof p[0] === 'object') { // (a list: two at random, the nearer one: near sounds are the ones you notice)
        const a = placeAt(p[Math.floor(r() * p.length) % p.length], ref), b = placeAt(p[Math.floor(r() * p.length) % p.length], ref);
        return a && b ? (a.d <= b.d ? a : b) : a || b;
      }
      return placeAt(p, ref);
    } catch { return null; }
  }
  // a point ({x, y, z} or [x, y, z]; y missing: its h, else ear height), or a rectangle {x0, x1, z0, z1} (its point
  // nearest the camera: the bar), as heard from the camera (see placeOf)
  function placeAt(p, ref = 6) {
    try {
      const c = SN.camera && SN.camera.position;
      if (!c || !p || typeof p !== 'object') return null;
      const rect = !Array.isArray(p) && !Number.isFinite(+p.x) && [p.x0, p.x1, p.z0, p.z1].every(v => Number.isFinite(+v));
      const x = rect ? SN.clamp(c.x, Math.min(p.x0, p.x1), Math.max(p.x0, p.x1)) : +(Array.isArray(p) ? p[0] : p.x), y = +(Array.isArray(p) ? p[1] : p.y ?? p.h);
      const z = rect ? SN.clamp(c.z, Math.min(p.z0, p.z1), Math.max(p.z0, p.z1)) : +(Array.isArray(p) ? p[2] : p.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      const d = Math.hypot(x - c.x, z - c.z, finite(y, c.y) - c.y), b = finite(wrapAngle(Math.atan2(-(x - c.x), -(z - c.z)) - finite(SN.player?.yaw, 0)));
      const behind = Math.abs(b) > Math.PI * 0.6, R = Math.max(1, finite(ref, 6));
      return { pan: SN.clamp(-Math.sin(b) * 0.8, -0.8, 0.8), k: SN.clamp(2 / (1 + d / R), 0.35, 1.4), lp: (behind ? 3200 : 12000) - Math.min(2500, d * 60), wet: SN.clamp(0.7 + d / 20, 0.7, 1.6), d };
    } catch { return null; }
  }
  // the crow flock of a painting, read defensively (every shape is optional): SN.modules.crows or
  // SN.modules.sky.crows, with nearness(), a centre / position, or a list of crows [{pos, alarm}]
  // (the wheatfield). → {k: 0..1 how near, pan} or null
  function crowsOf() { const m = SN.modules || {}; return m.crows || (m.sky && m.sky.crows) || null; }
  const bearingPan = (x, z) => { const c = SN.camera.position, b = finite(wrapAngle(Math.atan2(-(x - c.x), -(z - c.z)) - finite(SN.player?.yaw, 0))); return SN.clamp(-Math.sin(b) * 0.85, -0.85, 0.85); };
  // how near the crows are: only the few nearest count (a flock of 48 must not read as "right here"
  // from everywhere): the mean of the 4 nearest weights 1 / (1 + (d / 14)²), scaled so the painting
  // view (the nearest crows at 11-18 m) reads ≈ 0.65, the walk ≈ 0.35 on average, 60 m off ≈ 0.1; the pan
  // is their weighted bearing. A module's own nearness() (0..1) wins for k when it has one.
  const FLOCK_N = 4, FLOCK_D = 14, FLOCK_REF = 0.72, FLOCK_VIEW = 0.65; // (FLOCK_VIEW: k at the painting view, for the self-test)
  function flock() {
    try {
      const m = crowsOf(), c = SN.camera && SN.camera.position;
      if (!m || !c) return null;
      let k = null, pan = null;
      if (typeof m.nearness === 'function') { const v = +m.nearness(); if (Number.isFinite(v)) k = SN.clamp(v, 0, 1); }
      if (Array.isArray(m.list) && m.list.length) {
        const near = []; // [weight, x, z] of the FLOCK_N nearest, heaviest first
        for (const q of m.list) {
          const p = q && q.pos;
          if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
          const d = Math.hypot(p.x - c.x, p.z - c.z, finite(p.y, c.y) - c.y), w = 1 / (1 + (d / FLOCK_D) * (d / FLOCK_D));
          if (near.length < FLOCK_N) near.push([w, p.x, p.z]);
          else if (w > near[FLOCK_N - 1][0]) near[FLOCK_N - 1] = [w, p.x, p.z];
          else continue;
          near.sort((a, b) => b[0] - a[0]);
        }
        if (near.length) {
          let w = 0, x = 0, z = 0;
          for (const [wi, xi, zi] of near) { w += wi; x += xi * wi; z += zi * wi; }
          if (k == null) k = SN.clamp(w / FLOCK_N / FLOCK_REF, 0, 1);
          pan = bearingPan(x / w, z / w);
        }
      } else if (k == null) {
        let p = m.flock && (m.flock.position || m.flock.centre || m.flock.center);
        p ||= m.centre || m.center || m.position;
        if (!p && typeof m.centre === 'function') p = m.centre();
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
        const d = Math.hypot(p.x - c.x, p.z - c.z, finite(p.y, c.y) - c.y);
        k = SN.clamp(1 / (1 + d / 30), 0, 1); pan = bearingPan(p.x, p.z);
      }
      return k == null ? null : { k, pan };
    } catch { return null; }
  }
  // a crow that takes fright (its alarm rises) caws from where it is, a few at most, spaced out
  const CROW = { seen: new WeakMap(), at: 0, n: 0 };
  // (the queue's end, in this context's time: a context rebuilt by the watchdog starts its clock at 0 again, and
  // the old end would then hold every caw back for as long as the old one had run)
  const crowAt = () => { if (!(CROW.at <= now() + 3)) CROW.at = 0; return CROW.at; };
  function crowWatch(t, e) {
    let L = null;
    try { const m = crowsOf(); L = m && Array.isArray(m.list) ? m.list : null; } catch { /* */ }
    if (!L || !SN.camera) return;
    const c = SN.camera.position;
    crowAt();
    for (const q of L) {
      if (!q || typeof q !== 'object' || !q.pos) continue;
      const a = finite(+q.alarm, 0) > 0, was = CROW.seen.get(q);
      CROW.seen.set(q, a);
      if (!a || was !== false || CROW.at > t + 1.6) continue; // (the first look only notes it; a burst queues ≤ 1.6 s)
      const p = q.pos, d = Math.hypot(p.x - c.x, p.z - c.z, finite(p.y, c.y) - c.y);
      if (!(d < 80)) continue;
      const at = Math.max(t + 0.05, CROW.at);
      CROW.at = at + 0.3 + r() * 0.45; CROW.n++;
      safe('crow', () => sceneEvent({ ...e, lp: SN.clamp(7500 - d * 60, 2200, 7500) }, at, { k: SN.clamp(1.2 / (1 + d / 20), 0.15, 1), pan: bearingPan(p.x, p.z) }));
    }
  }
  // stand-ins for the painting events when a sample is missing (live, a handful of nodes each; every
  // random draw before the build, so the offline test builds them in any order)
  const SYN = {
    clink(t, p, vol, dest) { // two glasses touching: three inharmonic partials, twice
      const f0 = 2300 + r() * 900, dt = 0.06 + r() * 0.07, v = claim('evt', t, dt + 0.45);
      if (!v) return null;
      emit(v, v => {
        const into = liveInto(v, bus(dest, p, 0.35, v.end));
        for (const [k, a] of [[0, 1], [dt, 0.55]]) for (const [m, amp, dec] of [[1, 0.5, 0.4], [1.51, 0.3, 0.25], [2.24, 0.2, 0.16]]) {
          const o = osc('sine', f0 * m), g = gain(0), s = t + k;
          P.set(g.gain, 0, s); P.lin(g.gain, amp * a * vol * 0.9, s + 0.002); P.exp(g.gain, 0.0001, s + dec);
          o.connect(g).connect(into); begin(o, s); end(o, s + dec + 0.02);
        }
      });
      return v;
    },
    hoof(t, p, vol, dest) { // clip-clop on the cobbles, passing by: one noise through a knocking envelope, swept across
      const dur = 5 + r() * 2, dir = r() < 0.5 ? 1 : -1, hits = [], off = r();
      for (let x = 0.25, k = 0; x < dur - 0.25; k++) { hits.push([x, 0.8 + r() * 0.4]); x += k % 2 ? 0.34 + r() * 0.05 : 0.15 + r() * 0.03; }
      const v = claim('evt', t, dur + 0.1);
      if (!v) return null;
      emit(v, v => {
        const s = source(S.g.white); s.loop = true;
        const bp = filter('bandpass', 1100, 1.6), g = gain(0), lp = filter('lowpass', 3200, 0.5), pn = pan(-dir * 0.8);
        s.connect(bp).connect(g).connect(lp).connect(pn).connect(dest);
        const sg = gain(0.5 * S.wetK); pn.connect(sg); sg.connect(S.g.vin); v.extra = [sg];
        if (pn.pan) { P.set(pn.pan, -dir * 0.8, t); P.lin(pn.pan, dir * 0.8, t + dur); }
        P.set(g.gain, 0, t);
        for (const [h, a] of hits) { const k = Math.sin(Math.PI * h / dur) * a * vol * 4; P.set(g.gain, 0, t + h); P.lin(g.gain, k, t + h + 0.004); P.exp(g.gain, 0.0005, t + h + 0.07); }
        v.head = pn;
        begin(s, t, off, dur + 0.05);
      });
      return v;
    },
    lap(t, p, vol, dest) { // water against the quay: a swell of low noise that brightens and falls
      const d = 0.7 + r() * 0.5, off = r() * 1.5, v = claim('evt', t, d + 0.1);
      if (!v) return null;
      emit(v, v => {
        const s = source(S.g.brown), lp = filter('lowpass', 300, 0.9), g = gain(0);
        P.kr(lp.frequency);
        P.set(lp.frequency, 300, t); P.exp(lp.frequency, 1400, t + d * 0.35); P.exp(lp.frequency, 250, t + d);
        P.set(g.gain, 0, t); P.lin(g.gain, vol * 0.7, t + d * 0.3); P.lin(g.gain, 0, t + d);
        s.connect(lp).connect(g).connect(bus(dest, p, 0.5, v.end)); v.head = g;
        begin(s, t, off, d + 0.05);
      });
      return v;
    },
    creak(t, p, vol, dest) { // wood under strain: an uneven stick-slip through two resonances
      const d = 0.35 + r() * 0.5, f = 38 + r() * 30, w = [r(), r(), r()], v = claim('evt', t, d + 0.1);
      if (!v) return null;
      emit(v, v => {
        const o = osc('sawtooth', f), b1 = filter('bandpass', 700 + w[0] * 300, 6), b2 = filter('bandpass', 1500 + w[1] * 500, 5), g = gain(0);
        P.set(o.frequency, f, t); P.lin(o.frequency, f * (1.4 + w[2] * 0.8), t + d * 0.6); P.lin(o.frequency, f * 0.8, t + d);
        o.connect(b1).connect(g); o.connect(b2).connect(g);
        P.set(g.gain, 0, t); P.lin(g.gain, vol, t + 0.05); P.set(g.gain, vol, t + d * 0.7); P.lin(g.gain, 0, t + d);
        g.connect(bus(dest, p, 0.4, v.end)); v.head = g;
        begin(o, t); end(o, t + d + 0.02);
      });
      return v;
    },
    bird(t, p, vol, dest) { // a songbird outside: a few quick chirps
      const n = 3 + Math.floor(r() * 5), f = 2800 + r() * 1600, notes = [];
      let x = 0;
      for (let k = 0; k < n; k++) { const d = 0.05 + r() * 0.07; notes.push([x, d, f * (0.85 + r() * 0.4), r() < 0.5 ? 1.3 : 0.75]); x += d + 0.04 + r() * 0.09; }
      const v = claim('evt', t, x + 0.1);
      if (!v) return null;
      emit(v, v => {
        const o = osc('sine', f), g = gain(0);
        P.set(g.gain, 0, t);
        for (const [s, d, ff, sw] of notes) { P.set(o.frequency, ff, t + s); P.exp(o.frequency, ff * sw, t + s + d); P.set(g.gain, 0, t + s); P.lin(g.gain, vol * 0.19, t + s + 0.008); P.lin(g.gain, 0, t + s + d); }
        o.connect(g).connect(bus(dest, p, 0.3, v.end)); v.head = g;
        begin(o, t); end(o, t + x + 0.05);
      });
      return v;
    },
    crow(t, p, vol, dest) { // one to three caws: a buzzy voice through two formants
      const n = 1 + Math.floor(r() * 3), f = 480 + r() * 160, caws = [], off = r();
      let x = 0;
      for (let k = 0; k < n; k++) { const d = 0.22 + r() * 0.12; caws.push([x, d]); x += d + 0.12 + r() * 0.2; }
      const v = claim('evt', t, x + 0.1);
      if (!v) return null;
      emit(v, v => {
        const o = osc('sawtooth', f), b1 = filter('bandpass', 1200, 2.5), b2 = filter('bandpass', 2300, 3), g = gain(0);
        const nz = source(S.g.white), nb = filter('bandpass', 1800, 1), ng = gain(0.4);
        o.connect(b1).connect(g); o.connect(b2).connect(g); nz.connect(nb).connect(ng).connect(g);
        P.set(g.gain, 0, t);
        for (const [s, d] of caws) {
          P.set(o.frequency, f * 1.08, t + s); P.exp(o.frequency, f * 0.86, t + s + d);
          P.set(g.gain, 0, t + s); P.lin(g.gain, vol * 0.48, t + s + 0.025); P.lin(g.gain, vol * 0.32, t + s + d * 0.7); P.exp(g.gain, 0.0005, t + s + d);
        }
        g.connect(bus(dest, p, 0.6, v.end)); v.head = g;
        begin(o, t); end(o, t + x + 0.05); begin(nz, t, off, x + 0.05);
      });
      return v;
    },
    thunder(t, p, vol, dest) { // far off: a low roll that swells and grumbles away
      const d = 4 + r() * 2.5, rolls = [r(), r(), r(), r()], off = r() * 0.5, v = claim('evt', t, d + 0.1);
      if (!v) return null;
      emit(v, v => {
        const s = source(S.g.brown); s.loop = true;
        const lp = filter('lowpass', 160, 0.7), g = gain(0);
        P.set(g.gain, 0, t); P.lin(g.gain, vol * 0.27, t + 0.4 + rolls[0] * 0.3);
        let x = 0.8;
        for (const k of rolls) { x += 0.6 + k * 0.8; P.lin(g.gain, vol * (0.1 + k * 0.18), t + Math.min(d - 0.5, x)); }
        P.lin(g.gain, 0, t + d);
        s.connect(lp).connect(g).connect(bus(dest, p, 1.3, v.end)); v.head = g;
        begin(s, t, off, d + 0.05);
      });
      return v;
    },
    billiard(t, p, vol, dest) { // the cue strikes, the balls clack: two or three hard knocks (a click through a
      // resonant band, the ball's short ring and the table's thud under it), the later ones softer as the balls roll apart
      const n = 2 + (r() < 0.45 ? 1 : 0), f0 = 1900 + r() * 700, off = r(), hits = [];
      let x = 0;
      for (let k = 0; k < n; k++) { hits.push([x, k ? 0.45 + r() * 0.4 : 0.75, f0 * (0.92 + r() * 0.16)]); x += 0.1 + r() * 0.4; }
      const v = claim('evt', t, x + 0.2);
      if (!v) return null;
      emit(v, v => {
        const into = liveInto(v, bus(dest, p, 0.45, v.end)), s = source(S.g.white), bp = filter('bandpass', f0, 2.5), g = gain(0);
        s.connect(bp).connect(g).connect(into);
        P.set(g.gain, 0, t);
        for (const [h, a] of hits) { P.set(g.gain, 0, t + h); P.lin(g.gain, a * vol * 3.2, t + h + 0.0012); P.exp(g.gain, 0.0005, t + h + 0.03); }
        begin(s, t, off, x + 0.1);
        for (const [h, a, f] of hits) {
          const o = osc('sine', f * 1.12), og = gain(0);
          P.set(og.gain, 0, t + h); P.lin(og.gain, a * vol * 0.32, t + h + 0.001); P.exp(og.gain, 0.0003, t + h + 0.07);
          o.connect(og).connect(into); begin(o, t + h); end(o, t + h + 0.09);
        }
        const th = osc('sine', 170), tg = gain(0); // (the slate bed of the table, felt more than heard)
        P.set(th.frequency, 170, t); P.exp(th.frequency, 90, t + 0.06); P.set(tg.gain, 0, t); P.lin(tg.gain, vol * 0.35, t + 0.003); P.exp(tg.gain, 0.0005, t + 0.08);
        th.connect(tg).connect(into); begin(th, t); end(th, t + 0.1);
      });
      return v;
    },
    bee(t, p, vol, dest) { // a bee flies past: a buzzing saw (its wingbeat, wavering) that swells and fades, a little
      // lower as it goes (Doppler), swept from one side to the other
      const d = 1.8 + r() * 1.4, f = 175 + r() * 70, dir = r() < 0.5 ? 1 : -1, wob = 5 + r() * 5, sw = 0.5 + r() * 0.3, v = claim('evt', t, d + 0.1);
      if (!v) return null;
      const c = SN.clamp(finite(p), -0.6, 0.6), p0 = SN.clamp(c - dir * sw, -0.9, 0.9), p1 = SN.clamp(c + dir * sw, -0.9, 0.9); // (round its place, if it has one)
      emit(v, v => {
        const o = osc('sawtooth', f * 1.03), lfo = osc('sine', wob), lg = gain(f * 0.025), bp = filter('bandpass', f * 3.2, 0.9), lp = filter('lowpass', 5000, 0.5), g = gain(0), pn = pan(p0);
        lfo.connect(lg).connect(o.frequency);
        P.set(o.frequency, f * 1.03, t); P.lin(o.frequency, f * 0.96, t + d);
        o.connect(bp).connect(lp).connect(g).connect(pn).connect(dest);
        if (pn.pan) { P.set(pn.pan, p0, t); P.lin(pn.pan, p1, t + d); }
        const sg = gain(0.3 * S.wetK); pn.connect(sg); sg.connect(S.g.vin); v.extra = [sg]; // (its pan moves: a send of its own)
        P.set(g.gain, 0, t); P.lin(g.gain, vol * 0.28, t + d * 0.45); P.lin(g.gain, vol * 0.2, t + d * 0.62); P.lin(g.gain, 0, t + d);
        v.head = pn;
        begin(o, t); end(o, t + d + 0.02); begin(lfo, t); end(lfo, t + d + 0.02);
      });
      return v;
    },
    seeds(t, p, vol, dest) { // a handful of seed on the soil: a patter of tiny ticks, thick at first, thinning out
      const n = 16 + Math.floor(r() * 12), off = r(), hits = [];
      let x = 0.02;
      for (let k = 0; k < n; k++) { hits.push([x, 0.35 + r() * 0.65]); x += 0.01 + r() * 0.04 * (1 + k / 7); }
      const v = claim('evt', t, x + 0.1);
      if (!v) return null;
      emit(v, v => {
        const s = source(S.g.white); s.loop = true;
        const hp = filter('highpass', 1500, 0.7), bp = filter('bandpass', 3400, 0.8), g = gain(0);
        s.connect(hp).connect(bp).connect(g).connect(bus(dest, p, 0.35, v.end)); v.head = g;
        P.set(g.gain, 0, t);
        for (const [h, a] of hits) { P.set(g.gain, 0, t + h); P.lin(g.gain, a * vol * 1.6, t + h + 0.0015); P.exp(g.gain, 0.0005, t + h + 0.012); }
        begin(s, t, off, x + 0.05);
      });
      return v;
    },
    cicada(t, p, vol, dest) { // the cicadas out in the August heat, heard through a far window: a high buzzing hiss, rough
      // with the tymbals' pulse and throbbing a few times a second, that swells, holds and dies away (4-9 s a phrase)
      const d = 4 + r() * 5, fc = 4300 + r() * 1100, am = 85 + r() * 50, pr = 3 + r() * 2.5, sh = 0.75 + r() * 0.25, off = r() * 1.5, v = claim('evt', t, d + 0.1);
      if (!v) return null;
      emit(v, v => {
        const s = source(S.g.white); s.loop = true;
        const bp = filter('bandpass', fc, 3.5), bp2 = filter('bandpass', fc * 1.02, 3.5), a = gain(0.5), b = gain(0.6), env = gain(0), lp = filter('lowpass', 7500, 0.5); // (two in a row: a whine, not a hiss)
        const o1 = osc('sine', am), g1 = gain(0.42), o2 = osc('sine', pr), g2 = gain(0.35);
        o1.connect(g1).connect(a.gain); o2.connect(g2).connect(b.gain); // (0.08..0.92 at the pulse, 0.25..0.95 at the throb)
        s.connect(bp).connect(bp2).connect(a).connect(b).connect(env).connect(lp).connect(bus(dest, p, 0.6, v.end)); v.head = lp;
        P.set(env.gain, 0, t); P.lin(env.gain, vol * 0.8 * sh, t + d * 0.3); P.lin(env.gain, vol * 0.8, t + d * 0.62); P.lin(env.gain, 0, t + d);
        begin(s, t, off, d + 0.05); for (const o of [o1, o2]) { begin(o, t); end(o, t + d + 0.05); }
      });
      return v;
    },
    clock(t, p, vol, dest) { // the café clock over the bar (while the bed that has it is missing): four beats, tick and tock
      const off = r(), f = 2300 + r() * 200, v = claim('evt', t, 3.15);
      if (!v) return null;
      emit(v, v => {
        const s = source(S.g.white); s.loop = true;
        const bp = filter('bandpass', f, 4), g = gain(0);
        P.kr(bp.frequency);
        s.connect(bp).connect(g).connect(bus(dest, p, 0.45, v.end)); v.head = g;
        P.set(g.gain, 0, t);
        for (let k = 0; k < 4; k++) {
          const h = t + k;
          P.set(bp.frequency, k % 2 ? f * 0.8 : f, h); P.set(g.gain, 0, h); P.lin(g.gain, vol * (k % 2 ? 2.2 : 2.8), h + 0.001); P.exp(g.gain, 0.0004, h + 0.03);
        }
        begin(s, t, off, 3.1);
      });
      return v;
    },
  };
  // wooden boards creak now and then underfoot: a creak sample (floor-creak, creak, or the boat's, higher and
  // shorter), else the synthesised one
  function floorCreak(t, p) {
    const x = pick('floor-creak') || pick('creak') || pick('boat-creak');
    const vol = 0.3 * (0.8 + r() * 0.4);
    if (x) {
      const boat = x.name.startsWith('boat'), len = boat ? Math.min(x.dur, 0.5 + r() * 0.4) : x.dur, off = boat ? r() * Math.max(0, x.dur - len) : 0;
      return smpVoice(x, { t, vol: vol * x.gain * (boat ? 0.7 : 1), rate: boat ? 1.25 + r() * 0.2 : 1 + (r() - 0.5) * 0.1, pan: p, wet: 0.3, lp: 3500,
        dest: S.g.sfx, kind: 'evt', hi: false, off, dur: boat ? len : undefined, fade: boat ? [0.03, 0.12] : undefined });
    }
    return SYN.creak(t, p, vol * 0.6, S.g.sfx);
  }

  // ---- ambience: the painting's bed and events; the wind, crickets, an owl, a distant bell
  function startAmbience() {
    const t = now(), sc = S.sc, d = sc ? sc.def : null;
    S.ev = []; S.crickets = []; S.hum = 0;
    S.crickK = d ? finite(d.crickK, 1) : 1; S.wetK = d ? finite(d.wetK, 1) : 1;
    S.nextGust = t + 0.5;
    if (!sc) { S.nextOwl = S.nextBell = 1e9; return; } // the gallery: silence (UI clicks only)
    startLayers(t);
    S.crickets = crickets(d.crickets, t);
    if (d.bed && bedState(sc) === 'none') S.crickets.push(...crickets(d.cricketsAlt, t, true)); // (the bed's own crickets, synthesised)
    if (d.outside && d.outside.crickets) S.crickets.push(...crickets(d.outside.crickets, t).map(k => ({ ...k, out: true })));
    S.nextOwl = d.owl ? t + 24 + r() * 20 : 1e9; S.nextBell = sc.bell ? t + 50 + r() * 40 : 1e9;
    S.ev = (d.ev || []).map(e => ({ e, next: t + rr(e.first || e.every) }));
  }
  function startWind(t) { // two looping noises for the life of the graph (the gusts only retarget them)
    const G = S.g, k = windNow();
    const w1 = source(G.brown); w1.loop = true;
    const lp = filter('lowpass', 420, 0.5), g1 = gain(0);
    w1.connect(lp).connect(g1).connect(G.amb);
    P.tgt(g1.gain, 0.26 * k, t + 0.2, 2.5);
    const w2 = source(G.white); w2.loop = true;
    const bp = filter('bandpass', 700, 1.6), g2 = gain(0), p2 = pan(0);
    P.kr(bp.frequency); if (p2.pan) P.kr(p2.pan);
    w2.connect(bp).connect(g2).connect(p2).connect(G.amb);
    begin(w1, t); begin(w2, t, r() * 1.5);
    G.wind = { g1, bp, g2, p2, src: [w1, w2] };
    S.hum = S.hum ? Math.min(S.hum, t + 3) : t + 3;
  }
  function gust(t) {
    const w = S.g.wind, k = windNow();
    if (!w) { S.nextGust = t + 5; return; }
    const at = Math.max(S.nextGust, t), tc = 1.2 + r() * 2;
    P.tgt(w.bp.frequency, 380 + r() * 900, at, tc);
    P.tgt(w.g2.gain, (0.012 + r() * 0.05) * k, at, tc);
    if (w.p2.pan) P.tgt(w.p2.pan, r() * 1.2 - 0.6, at, tc * 1.5);
    P.tgt(w.g1.gain, (0.16 + r() * 0.18) * k, at, 3);
    S.nextGust = at + 2.5 + r() * 4.5;
  }
  function cricket(t, f, p) {
    const jit = 1 + (r() - 0.5) * 0.01, n = 3 + (r() < 0.35 ? 1 : 0), vol = (0.011 + r() * 0.006) * S.crickK;
    const tpl = tpls().cricket[f + ':' + n];
    const v = claim('cricket', t, tpl ? tpl.duration / jit : n * 0.032 + 0.05);
    if (!v) return;
    emit(v, v => {
      const into = bus(S.g.amb, p, 0.25, v.end);
      if (tpl) playBuf(v, tpl, t, vol, into, jit); else cricketDry(t, f * jit, n, vol, liveInto(v, into));
    });
  }
  function owl(t0) {
    const f = 330 + r() * 60, p = r() * 1.4 - 0.7, pi = r() < 0.5 ? 0 : 1, ci = f < 360 ? 0 : 1;
    const tpl = tpls().owl[pi * 2 + ci], rate = tpl ? f / OWL_F[ci] : 1;
    const v = claim('owl', t0, tpl ? tpl.duration / rate : 2.5);
    if (!v) return;
    emit(v, v => {
      const into = bus(S.g.amb, p, 0.9, v.end);
      if (tpl) playBuf(v, tpl, t0, 1, into, rate); else owlDry(t0, f, OWL[pi], liveInto(v, into));
    });
  }
  // the church bell rings from the church: panned by the tower's bearing from the camera (+ = left),
  // quieter and duller with distance, muffled when the tower is behind you
  function churchVoice() {
    const ch = SN.world?.layout?.church, c = SN.camera?.position;
    if (!ch || !c) return { pan: 0.35, k: 0.7, lp: 1500 };
    const dx = ch.x - c.x, dz = ch.z - c.z, d = finite(Math.hypot(dx, dz, 14 - c.y), 60); // the bells hang ~14 m up
    const b = finite(wrapAngle(Math.atan2(-dx, -dz) - (SN.player?.yaw ?? 0))), behind = Math.abs(b) > Math.PI * 0.6;
    return { pan: SN.clamp(-Math.sin(b) * 0.8, -0.8, 0.8), k: 1 / (1 + d / 120), lp: (behind ? 1000 : 1600) - Math.min(500, d * 2) };
  }
  function bell(t0, vol = 0.045, tolls = 1 + Math.floor(r() * 3), spacing = 2.6, dest = S.g.amb, fall = 1, kind = 'bell') {
    const cv = churchVoice(), lvl = vol >= 0.1 ? 'mid' : 'amb', set = tpls().bell[lvl];
    vol *= Math.pow(cv.k, fall); // fall < 1: an event, heard wherever you stand
    // per toll a rate within ±0.1%: the live recipe's detune (every partial of the one template, baked
    // in tune, lands where the recipe's own detune would put it), so no two tolls ring in phase with
    // each other; the same 9 draws per toll as the recipe (a spare, the rate, 7 more)
    const rates = [];
    for (let k = 0; k < tolls; k++) { r(); rates.push(1 + (r() - 0.5) * 0.002); skip(BELL.length - 2); }
    const v = claim(kind, t0, (tolls - 1) * spacing + 6.2, true);
    if (!v) return;
    emit(v, v => {
      const lp = filter('lowpass', cv.lp, 0.4);
      lp.connect(bus(dest, cv.pan, 1.1, v.end)); v.head = lp;
      for (let k = 0; k < tolls; k++) {
        const t = t0 + k * spacing, tpl = set[0];
        if (tpl) { const s = source(tpl, rates[k]), g = gain(vol / BELL_V[lvl]); s.connect(g).connect(lp); begin(s, t); } else bellDry(t, vol, lp, BANK.rng ||= SN.rng('ui-audio-bank'));
      }
    });
  }
  // the midnight roll call: one stroke now + `delay`, through a bus of its own (dry and room) so "hush"
  // can fade all of it, the stroke in the air and its reverb
  function finaleBus() {
    const G = S.g;
    if (!G.finale) { G.finale = gain(1); G.finale.connect(G.amb); G.finaleWet = gain(1); G.finaleWet.connect(G.vin); G.finale._wet = G.finaleWet; }
    return G.finale;
  }
  function bellStroke(delay = 0) {
    if (!ready() || S.ctx.state !== 'running' || document.hidden) return;
    bell(Math.max(soon(), now() + finite(delay)), 0.22, 1, 0, finaleBus(), 0.5, 'moment');
    S.nextBell = Math.max(S.nextBell, now() + 90); // no ambient toll on top of midnight
  }
  function hushBell(at) {
    const G = S.g, g = G && G.finale, w = G && G.finaleWet;
    if (!g) return;
    G.finale = null; G.finaleWet = null;
    const t = at != null && S.testing ? finite(at, now()) : now(), buses = G.pans.get(g);
    G.pans.delete(g); // (sweep() no longer sees them: they are let go here)
    for (const n of [g, w]) if (n) { P.hold(n.gain, t); P.lin(n.gain, 0, t + 0.9); }
    if (S.testing) return; // (the offline graph is let go as a whole)
    setTimeout(() => {
      for (const n of [g, w]) if (n) try { n.disconnect(); } catch { /* gone */ }
      if (buses) for (const b of buses.values()) try { b.in.disconnect(); if (b.send) b.send.disconnect(); } catch { /* gone */ }
    }, 1300);
  }
  // stepping into the painting: a soft brush-over-canvas whoosh, left to right, and the first chord
  // of the night blooms as you land
  function step() {
    if (!ready()) return;
    const t = soon(), off = r() * 1.5, v = claim('fx', t, 2.05, true);
    if (!v) return;
    emit(v, v => {
      const s = source(S.g.white); s.loop = true;
      const bp = filter('bandpass', 380, 0.8), lp = filter('lowpass', 2400, 0.5), g = gain(0), pn = pan(-0.35);
      P.kr(bp.frequency);
      P.set(bp.frequency, 380, t); P.exp(bp.frequency, 1400, t + 0.95); P.exp(bp.frequency, 650, t + 1.8);
      if (pn.pan) P.lin(pn.pan, 0.35, t + 1.8);
      P.set(g.gain, 0, t); P.lin(g.gain, 0.1, t + 0.8); P.lin(g.gain, 0, t + 1.9);
      s.connect(bp).connect(lp).connect(g).connect(pn).connect(S.g.sfx);
      const sg = gain(0.5); pn.connect(sg); sg.connect(S.g.vin); // (its pan moves: a send of its own)
      v.head = pn; v.extra = [sg];
      begin(s, t, off, 2);
    });
    if (S.nextChord < now() + 3) S.nextChord = t + 1.35;
  }

  // ---- music: slow harmony, a soft pad and sparse celesta arpeggios. 'night': Lydian, as it always was;
  // 'day' (the sunlit paintings): brighter — major with a Mixolydian ♭VII, a little faster, a lighter celesta
  const NIGHT = [
    { bass: 41, pad: [53, 60, 64], arp: [65, 69, 72, 76, 79, 81] }, // Fmaj9
    { bass: 41, pad: [50, 55, 59], arp: [67, 71, 74, 79, 81, 83] }, // G/F — the Lydian glow
    { bass: 40, pad: [52, 55, 59], arp: [64, 67, 71, 74, 76, 79] }, // Em7
    { bass: 45, pad: [52, 57, 60], arp: [69, 72, 76, 79, 81, 84] }, // Am7(9)
    { bass: 38, pad: [53, 57, 60], arp: [62, 65, 69, 72, 76, 77] }, // Dm9
    { bass: 43, pad: [50, 55, 59], arp: [67, 71, 74, 76, 79, 83] }, // G6
    { bass: 36, pad: [52, 55, 59], arp: [64, 67, 71, 72, 76, 79] }, // Cmaj7
    { bass: 41, pad: [55, 60, 64], arp: [69, 72, 76, 79, 84, 88] }, // Fmaj9, open
  ];
  const DAY = [
    { bass: 36, pad: [52, 55, 62], arp: [64, 67, 72, 74, 76, 79] }, // Cadd9
    { bass: 36, pad: [50, 53, 58], arp: [62, 65, 70, 74, 77, 82] }, // B♭/C — the Mixolydian ♭VII over C
    { bass: 41, pad: [53, 57, 60], arp: [65, 69, 72, 76, 77, 81] }, // Fmaj7
    { bass: 40, pad: [52, 55, 60], arp: [64, 67, 72, 76, 79, 84] }, // C/E
    { bass: 45, pad: [55, 60, 64], arp: [64, 67, 69, 72, 76, 79] }, // Am7
    { bass: 43, pad: [50, 55, 60], arp: [62, 67, 71, 74, 79, 83] }, // Gsus4 → G
    { bass: 46, pad: [50, 53, 58], arp: [65, 70, 74, 77, 82, 86] }, // B♭
    { bass: 36, pad: [55, 60, 64], arp: [67, 72, 76, 79, 84, 88] }, // C, open
  ];
  // 'evening' (the field at sunset): the day's brightness gone warm and slow: D major, plagal (I – IV over a
  // pedal – vi – V), long chords, fewer and slower celesta phrases, the arpeggios lower
  const EVENING = [
    { bass: 38, pad: [54, 57, 61], arp: [62, 66, 69, 73, 76, 78] }, // Dmaj9
    { bass: 38, pad: [55, 59, 62], arp: [62, 67, 71, 74, 78, 79] }, // G/D — the IV over the pedal
    { bass: 47, pad: [54, 57, 62], arp: [62, 66, 69, 71, 74, 78] }, // Bm7
    { bass: 45, pad: [52, 57, 61], arp: [61, 64, 66, 69, 73, 76] }, // A6
    { bass: 40, pad: [55, 59, 62], arp: [62, 66, 67, 71, 74, 78] }, // Em9
    { bass: 43, pad: [54, 59, 62], arp: [66, 67, 71, 74, 78, 83] }, // Gmaj7
    { bass: 45, pad: [52, 55, 62], arp: [62, 64, 67, 69, 74, 76] }, // A7sus4
    { bass: 38, pad: [57, 62, 66], arp: [66, 69, 74, 78, 81, 86] }, // D, open
  ];
  const MUSIC = {
    night: { id: 'night', chords: NIGHT, len: 9.6, step: [0.3, 0.22], cel: 1, phrase: [0.8, 0.4], second: 5, fanfare: [65, 69, 72, 76, 79, 81, 84, 88] },
    day: { id: 'day', chords: DAY, len: 8.4, step: [0.24, 0.16], cel: 0.8, phrase: [0.85, 0.5], second: 4.4, fanfare: [60, 64, 67, 72, 76, 79, 84, 88] },
    evening: { id: 'evening', chords: EVENING, len: 10.8, step: [0.34, 0.24], cel: 0.8, phrase: [0.7, 0.3], second: 5.6, fanfare: [62, 66, 69, 74, 78, 81, 86, 90] },
  };
  S.mus = MUSIC.night;
  const chimeTones = ch => ch.arp.slice(-4).map(m => (m < 76 ? m + 12 : m)).sort((a, b) => a - b).slice(0, 3);
  function musicTick(t, ahead) {
    if (!Number.isFinite(S.nextChord)) S.nextChord = t + 1;
    if (S.nextChord >= ahead) return;
    const M = S.mus, at = Math.max(S.nextChord, t + 0.02);
    S.chordI = (S.chordI + 1) % M.chords.length;
    const ch = M.chords[S.chordI];
    safe('pad', () => padChord(at, ch, M.len));
    if (r() < 0.55) safe('piano', () => softPiano(at, ch.bass + 12, 0.32));
    if (r() < M.phrase[0]) { const pt = at + 0.8 + r() * 1.6; safe('phrase', () => phrase(pt, ch)); }
    if (r() < M.phrase[1]) { const pt = at + M.second + r() * 2.2; safe('phrase', () => phrase(pt, ch)); }
    S.nextChord = at + M.len;
  }
  function phrase(t, ch) {
    const M = S.mus, notes = ch.arp, n = 3 + Math.floor(r() * 4), style = r();
    let i = style < 0.4 ? Math.floor(r() * 2) : style < 0.7 ? notes.length - 1 : Math.floor(r() * notes.length);
    const step = M.step[0] + r() * M.step[1];
    for (let k = 0; k < n; k++) {
      celesta(t, notes[i], (0.5 - k * 0.045) * (0.8 + r() * 0.4) * M.cel, (r() - 0.5) * 0.6);
      t += step * (r() < 0.25 ? 1.5 : 1);
      if (style < 0.4) i = Math.min(notes.length - 1, i + 1 + (r() < 0.3 ? 1 : 0));
      else if (style < 0.7) i = Math.max(0, i - 1 - (r() < 0.3 ? 1 : 0));
      else i = SN.clamp(i + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)), 0, notes.length - 1);
    }
  }
  function celesta(t, midi, vol, p = 0, dest = S.g.music, hi = false, kind = 'cel') {
    const tpl = tpls().cel[midi], v = claim(kind, t, tpl ? tpl.duration : 2.7, hi);
    if (!v) return;
    emit(v, v => {
      const into = bus(dest, p, 0.55, v.end);
      if (tpl) playBuf(v, tpl, t, vol / CEL_V, into); else celestaDry(t, midi, vol, liveInto(v, into));
    });
  }
  function softPiano(t, midi, vol) {
    const ref = vol > 0.45 ? 0.6 : 0.32, tpl = tpls().piano[midi + '@' + ref], v = claim('piano', t, 4.65);
    if (!v) return;
    emit(v, v => {
      const into = bus(S.g.music, null, 0.45, v.end);
      if (tpl) playBuf(v, tpl, t, vol / ref, into); else pianoDry(t, midi, vol, liveInto(v, into));
    });
  }
  function padChord(t, ch, len) {
    const M = S.mus, i = M.chords.indexOf(ch), tpl = len === M.len && i >= 0 ? (tpls().pad[M.id] || [])[i] : null, v = claim('pad', t, len + 4.7);
    if (!v) return;
    emit(v, v => {
      const into = bus(S.g.music, null, 0.6, v.end);
      if (tpl) playBuf(v, tpl, t, 1, into); else padDry(t, ch, len, liveInto(v, into));
    });
  }

  // ---- the cats: real meows (sampled) where the bundle has them, the synthesised meow otherwise.
  // Situations: hint = a questioning meow (a far cat: the long call, duller and wetter), found = a happy
  // trill or hello, near = a tiny mew (a sleeper purrs), pet (chirp) = a trill, sometimes a purr; each
  // sample with a little rate and gain jitter, through the same pan / distance / caps as before.
  // SMP_K: a sample's gain for one unit of the synthesised meow's gain (so the callers keep their units)
  const VOX = { hello: 'meow-hello', ask: 'meow-ask', call: 'meow-call', mew: 'mew', trill: 'trill', purr: 'purr' };
  // (measured: selfTest 'samples' vs 'samples,nosmp'; the purr ~2 dB under its RMS match: the take's energy, through
  // the bass exciter, is where the ear and a phone hear it, the synthesised purr's mostly under 100 Hz)
  const SMP_K = { hello: 3, ask: 3.1, call: 2.9, mew: 5, trill: 3.6, purr: 2.7 };
  const pitchRate = p => SN.clamp(1 + (finite(p, 1.1) - 1.1) * 0.4, 0.88, 1.14);
  // a cat's voice is as loud in a dry room as in a big one: what a smaller room (wetK < 1) takes from its reverb
  // send comes back on its level (the dry path through sfx (1.35²) against the send's energy through the room's
  // return (0.55²): +0.75 dB for a far call (send 1.3) in the Sunflowers' room, ~0 for a meow (0.3))
  const roomK = w => { w = SN.clamp(finite(w, 0.3), 0, 3); const k = SN.clamp(finite(S.wetK, 1), 0, 3); return Math.sqrt((1.82 + 0.3 * w * w) / (1.82 + 0.3 * w * w * k * k)); };
  // Each cat has a voice of its own for the whole play: a base rate (±6% by its name, a little lower for a
  // bigger cat) and a favourite take in every group; the voice then varies by ±3% only. The cats module's
  // events (catNear, catFound, spotFound, hint, a far spotMiss) name the cat just before the UI asks for
  // its sound, so the engine notes it (CATV.cur, for 300 ms) and also places the voice where the cat is.
  const CATV = { cur: null, at: -1e9, found: [], memo: new Map() };
  const hashStr = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function voiceOf(cat) {
    if (!cat || typeof cat !== 'object') return null;
    const key = `${cat.name ?? ''}|${cat.index ?? ''}`;
    let v = CATV.memo.get(key);
    if (!v) {
      const h = hashStr(key), u = (h & 0xffff) / 0xffff, size = SN.clamp(finite(+cat.scale, 1), 0.6, 1.6);
      v = { rate: SN.clamp((1 + (u - 0.5) * 0.12) * (1 - (size - 1) * 0.15), 0.9, 1.12), take: h >>> 16 };
      if (CATV.memo.size > 64) CATV.memo.clear();
      CATV.memo.set(key, v);
    }
    return v;
  }
  function noteCat(d) {
    try {
      let c = d && d.cat;
      if (!c && d && Number.isFinite(d.index)) c = SN.modules?.cats?.cats?.[d.index] || null;
      const p = (d && d.position) || (c && c.centre) || null;
      CATV.cur = c || p ? { cat: c || null, pos: p && Number.isFinite(p.x) && Number.isFinite(p.z) ? p : null } : null;
      CATV.at = performance.now();
    } catch { CATV.cur = null; }
  }
  const catNow = () => (performance.now() - CATV.at < 300 ? CATV.cur : null);
  // a take of a group for this voice: its favourite two times in three, else any other (never the same twice running)
  function pickFor(prefix, voice) {
    if (!voice || S.nosmp) return pick(prefix);
    const ok = smpNames(prefix).filter(n => SMP.e.has(n));
    if (ok.length < 2 || r() < 0.34) return pick(prefix);
    const n = ok[voice.take % ok.length];
    SMP.last.set(prefix, n);
    return SMP.e.get(n);
  }
  // o: {t (context time, as given), gain, pan, lp, wet, rate, voice (a cat's), kind}; alt: groups to try if `kind` has none
  function vox(kind, o, alt = []) {
    if (S.nosmp) return null;
    const cv = o.voice || null;
    for (const k of [kind, ...alt]) {
      const e = pickFor(VOX[k], cv);
      if (!e) continue;
      const jit = cv ? 0.06 : 0.14, rate = finite(o.rate, 1) * (cv ? cv.rate : 1) * (1 + (r() - 0.5) * jit), vol = Math.max(1e-4, finite(o.gain, 0.4)) * SMP_K[k] * e.gain * (0.9 + r() * 0.2) * roomK(o.wet ?? 0.3);
      return smpVoice(e, { t: o.t, vol, rate, pan: o.pan == null ? 0 : o.pan, lp: o.lp, wet: o.wet ?? 0.3, kind: o.kind || 'meow' }) || 'capped'; // (no synthesised one on top)
    }
    return null;
  }
  const at0 = o => (o.t != null ? finite(o.t, now()) + 0.01 : soon());
  // the public meow: a sample by its mood (question → ask, trill → trill, else hello; pitch → rate), or synthesised
  function meow(o = {}) {
    if (!ready()) return;
    if (o.synth || !vox(o.question ? 'ask' : o.trill ? 'trill' : 'hello', { ...o, t: at0(o), rate: pitchRate(o.pitch) }, ['hello', 'trill'])) meowSynth(o);
  }
  // ---- the synthesised meow: sawtooth voice through moving formants (i → a → u) with a pitch arc (always live)
  const FORMANTS = [[[380, 960, 560], 7, 1], [[2200, 1500, 950], 9, 0.55], [[3100, 2700, 2500], 12, 0.22]];
  function meowSynth(o = {}) {
    if (!ready()) return;
    const t = at0(o), dur = SN.clamp(finite(o.dur, 0.62), 0.05, 4);
    const p = SN.clamp(finite(o.pitch, 1), 0.05, 40), vol = Math.max(1e-4, finite(o.gain, 0.5)) * roomK(o.wet ?? 0.3), vibF = 5.5 + r() * 1.5, off = r() * 1.5;
    const v = claim(o.kind || 'meow', t, dur + 0.12, true);
    if (!v) return;
    emit(v, v => {
      const G = S.g, f0 = 520 * p, src = osc('sawtooth', f0 * 0.82), fr = src.frequency;
      P.set(fr, f0 * 0.82, t);
      P.lin(fr, f0 * 1.2, t + dur * 0.32);
      P.lin(fr, f0 * 1.08, t + dur * 0.64);
      P.exp(fr, f0 * (o.question ? 1.28 : 0.72), t + dur);
      const vib = osc('sine', vibF), vg = gain(f0 * 0.016);
      vib.connect(vg).connect(fr);
      const env = gain(0), lp = filter('lowpass', finite(o.lp, 7000), 0.5);
      for (const [fs, q, amp] of FORMANTS) {
        const bp = filter('bandpass', fs[0], q);
        P.kr(bp.frequency);
        P.set(bp.frequency, fs[0], t);
        P.lin(bp.frequency, fs[1], t + dur * 0.42);
        P.lin(bp.frequency, fs[2], t + dur);
        const g = gain(amp * 1.6); src.connect(bp).connect(g).connect(env);
      }
      const br = source(G.white); br.loop = true; // (a late offset must not run off the buffer)
      const bbp = filter('bandpass', 2800, 0.8), bg = gain(0.07);
      br.connect(bbp).connect(bg).connect(env);
      P.set(env.gain, 0.0001, t);
      if (o.trill) { // a little "mrr-" before the "-eow"
        for (let k = 0; k < 3; k++) { P.lin(env.gain, vol * 0.75, t + 0.02 + k * 0.035); P.lin(env.gain, vol * 0.3, t + 0.037 + k * 0.035); }
        P.lin(env.gain, vol, t + 0.14);
      } else P.exp(env.gain, vol, t + 0.05);
      P.set(env.gain, vol, t + dur * 0.72);
      P.exp(env.gain, 0.0001, t + dur + 0.07);
      env.connect(lp).connect(bus(G.sfx, finite(o.pan), o.wet ?? 0.3, v.end));
      v.head = lp;
      begin(src, t); end(src, t + dur + 0.1); begin(vib, t); end(vib, t + dur + 0.1);
      begin(br, t, off, dur + 0.1);
    });
  }
  function chime(at, dest, vol = 1) {
    if (!ready()) return;
    const C = S.mus.chords, t = at != null ? finite(at, now()) + 0.02 : soon(), ch = C[Math.max(0, S.chordI) % C.length], out = dest || S.g.sfx;
    const tones = chimeTones(ch);
    tones.forEach((m, i) => celesta(t + i * 0.085, m, 0.4 * vol, (i - 1) * 0.3, out, true, 'moment'));
    celesta(t + 0.3, tones[2] + 12, 0.24 * vol, 0, out, true, 'moment');
  }
  // the far call: the long 'call' take, but while the bundle has fewer than three of those, one call in three
  // is a slowed, duller 'ask' instead (the far voice is the one heard most while hunting)
  function farCall(o) {
    S.farN = (finite(S.farN) + 1) % 3;
    const calls = smpNames(VOX.call).filter(n => SMP.e.has(n)).length;
    if (calls && (calls >= 3 || S.farN !== 2)) return vox('call', o, ['ask']);
    return vox('ask', { ...o, rate: finite(o.rate, 1) * 0.9, lp: Math.min(finite(o.lp, 2400), 1900), wet: finite(o.wet, 0.8) + 0.3, gain: finite(o.gain, 0.2) * 1.1 }, ['call']);
  }
  // a visible cat out of range: a small, distant call from its side of the screen (from where it is when the
  // cat is known); a click again within 0.9 s of the last call is not answered twice (no chorus of one take)
  function farMeow(ndcX = 0, dist = 60) {
    if (!ready()) return;
    const t = now();
    if (t - finite(S.farAt, -1e9) < 0.9 && t >= finite(S.farAt, -1e9)) return;
    S.farAt = t;
    const c = catNow(), cv = c && voiceOf(c.cat);
    const pan = c && c.pos ? bearingPan(c.pos.x, c.pos.z) : SN.clamp(finite(ndcX) * 0.7, -0.8, 0.8);
    const o = { t: soon(), gain: SN.clamp(0.9 / (1 + finite(dist, 60) / 25), 0.12, 0.26), pan };
    if (farCall({ ...o, lp: 2200, wet: 1.05, rate: 1.04, voice: cv })) return;
    meowSynth({ pitch: (1.05 + r() * 0.08) * (cv ? cv.rate : 1), dur: 0.36, gain: o.gain, question: true, pan: o.pan, lp: 2600, wet: 0.85 });
  }
  // an old friend, clicked again (petted): a short bright trill (sometimes a purr under it) and a tinkle
  function mrrp(panX = 0, at) {
    if (!ready()) return;
    const c = catNow(), cv = c && voiceOf(c.cat);
    const t = at ?? soon() - 0.01, pn = c && c.pos ? bearingPan(c.pos.x, c.pos.z) : SN.clamp(finite(panX) * 0.7, -0.8, 0.8);
    if (vox('trill', { t: t + 0.01, gain: 0.26, pan: pn, lp: 7000, wet: 0.35, rate: 1.08, voice: cv }, ['hello'])) { if (r() < 0.3) purrSmp(t + 0.15, pn, 0.2, 1.3); }
    else meowSynth({ t, pitch: (1.34 + r() * 0.1) * (cv ? cv.rate : 1), dur: 0.24, gain: 0.24, pan: pn, trill: true, lp: 6500, wet: 0.35, question: r() < 0.5 });
    celesta(t + 0.12, 88 + (r() < 0.5 ? 0 : 3), 0.16, pn, S.g.sfx, true);
  }
  // a purr: the sampled loop, a stretch of it from anywhere with soft ends; else the synthesised one
  // (a ~26 Hz pulse train and breathy brown noise pulsing with it, through a throat-ish band)
  function purrSmp(t, p, vol, len = 1.8) {
    const e = pick('purr');
    if (!e) return null;
    const off = e.loop ? e.s0 + r() * (e.s1 - e.s0) : r() * Math.max(0, e.dur - len);
    return smpVoice(e, { t, vol: vol * SMP_K.purr * e.gain, rate: 1 + (r() - 0.5) * 0.06, pan: p, wet: 0.35, kind: 'purr', off, dur: Math.min(len, e.loop ? 30 : e.dur - off), fade: [0.25, 0.5] });
  }
  function purr(t, p, vol) {
    if (purrSmp(t, p, vol)) return;
    const f = 24 + r() * 5, off = r() * 2, k = Math.min(2, Math.floor((f - 24) / 5 * 3)), tpl = tpls().purr[k];
    const v = claim('purr', t, 1.85, true);
    if (!v) return;
    emit(v, v => {
      const into = bus(S.g.sfx, p, 0.35, v.end);
      if (tpl) playBuf(v, tpl, t, vol / PURR_V, into, f / PURR_F[k]); else purrDry(t, f, vol, off, liveInto(v, into)); // (its pulse rate exactly: ±3%)
    });
  }
  // walking up to a hidden cat: quiet, from its side (muffled when it is behind you)
  function near(bearing = 0, dist = 3, sleepy = false, at) {
    if (!ready()) return;
    bearing = finite(bearing); dist = finite(dist, 3);
    const t = at ?? soon() - 0.01, p = SN.clamp(-Math.sin(bearing) * 0.85, -0.85, 0.85), behind = Math.abs(bearing) > Math.PI * 0.6;
    const k = SN.clamp(1 / (1 + Math.max(0, dist - 1.5) / 3), 0.4, 1);
    if (sleepy) { purr(t + 0.02, p, 0.22 * k); return; }
    const c = catNow(), cv = c && voiceOf(c.cat);
    const o = { t: t + 0.01, gain: 0.13 * k, pan: p, lp: behind ? 1800 : 4200, wet: 0.45, voice: cv };
    if (vox('mew', o, ['hello'])) return;
    meowSynth({ t, pitch: (1.18 + r() * 0.14) * (cv ? cv.rate : 1), dur: 0.3 + r() * 0.08, gain: 0.13 * k, pan: p, question: r() < 0.6, lp: o.lp, wet: 0.45 });
  }
  function found(panX = 0) {
    if (!ready()) return;
    const c = catNow(), cv = c && voiceOf(c.cat);
    const t = soon() - 0.01, pn = c && c.pos ? bearingPan(c.pos.x, c.pos.z) : SN.clamp(finite(panX) * 0.7, -0.8, 0.8);
    if (!vox(r() < 0.6 ? 'trill' : 'hello', { t: t + 0.01, gain: 0.45, pan: pn, voice: cv }, ['hello', 'trill'])) meowSynth({ t, pitch: (1.1 + r() * 0.15) * (cv ? cv.rate : 1), dur: 0.5, gain: 0.45, pan: pn, trill: r() < 0.6 });
    chime(t + 0.33);
  }
  function hint(bearing = 0, dist = 50, at) {
    if (!ready()) return;
    bearing = finite(bearing); dist = finite(dist, 50);
    const t = at ?? soon() - 0.01, behind = Math.abs(bearing) > Math.PI * 0.6;
    const g = SN.clamp(0.95 / (1 + dist / 18), 0.1, 0.6), pn = SN.clamp(-Math.sin(bearing) * 0.9, -0.9, 0.9);
    const lp = behind ? 1500 : 5200 + 2000 / (1 + dist / 20), wet = SN.clamp(0.25 + dist / 90, 0.25, 1.1);
    const c = catNow(), cv = c && voiceOf(c.cat);
    if (dist > 38) { // far away: the long call, duller and wetter
      if (farCall({ t: t + 0.01, gain: g * 1.15, pan: pn, lp: Math.min(lp, 2400 + 60000 / (dist + 20)), wet: wet + 0.35, voice: cv })) return;
    } else if (vox('ask', { t: t + 0.01, gain: g, pan: pn, lp, wet, voice: cv }, ['hello'])) {
      if (r() < 0.5) vox(r() < 0.5 ? 'ask' : 'hello', { t: t + 0.96, gain: g * 0.8, pan: pn, lp, wet, rate: 1.06, voice: cv }, ['ask']);
      return;
    }
    const opts = { t, pitch: (0.95 + r() * 0.1) * (cv ? cv.rate : 1), dur: 0.74, gain: g, pan: pn, lp, wet, question: r() < 0.4 };
    meowSynth(opts);
    if (r() < 0.5) meowSynth({ ...opts, t: t + 0.95, pitch: opts.pitch * 1.08, dur: 0.42, gain: g * 0.8 });
  }
  function fanfare(delay = 0, at) {
    if (!ready()) return;
    const M = S.mus, t = finite(at ?? now(), now()) + finite(delay) + 0.05;
    M.fanfare.forEach((m, i) => celesta(t + i * 0.1, m, 0.38, (i / 7 - 0.5) * 0.8, S.g.sfx, true, 'moment'));
    for (const [dt, p, pitch] of [[0.95, -0.6, 1.2], [1.35, 0.55, 1.0], [1.7, -0.15, 1.35], [2.1, 0.7, 0.9]]) {
      if (!vox(pitch > 1.1 ? 'trill' : 'hello', { t: t + dt + 0.01, gain: 0.3, pan: p, rate: pitchRate(pitch), kind: 'moment' }, ['hello', 'trill'])) meowSynth({ t: t + dt, pitch, dur: 0.5, gain: 0.3, pan: p, trill: pitch > 1.1, kind: 'moment' });
    }
    softPiano(t + 0.8, M.chords[0].bass + 12, 0.6);
  }
  // the roll call without a bell (a painting with no church): the k-th cat found (of n) answers as its
  // portrait lights: a soft note on a ladder rising through the painting's music, and its own little trill,
  // panned along the row. 'moment' voices: a lighter mix never drops one.
  const LADDER = { night: [65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91], day: [64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91],
    evening: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 90] };
  function rollCall(k = 0, n = 12, at) {
    if (!ready() || (!S.testing && document.hidden)) return;
    n = SN.clamp(Math.round(finite(n, 12)), 1, 64); k = SN.clamp(Math.round(finite(k)), 0, n - 1);
    const L = LADDER[S.mus.id] || LADDER.night, i = n > 1 ? Math.round(k * (L.length - 1) / (n - 1)) : L.length - 1;
    const t = at != null ? finite(at, now()) + 0.02 : soon(), pn = n > 1 ? (k / (n - 1)) * 1.2 - 0.6 : 0;
    const cv = voiceOf(CATV.found[k] || { name: 'roll', index: k });
    celesta(t, L[i], 0.3, pn * 0.6, S.g.sfx, true, 'moment');
    if (!vox(k % 3 === 2 ? 'hello' : 'trill', { t: t + 0.14, gain: 0.15, pan: pn, lp: 6500, wet: 0.4, rate: 1.04, voice: cv, kind: 'moment' }, ['trill', 'hello']))
      meowSynth({ t: t + 0.13, pitch: 1.3 * cv.rate, dur: 0.26, gain: 0.14, pan: pn, trill: true, lp: 6000, wet: 0.4, kind: 'moment' });
  }
  // the cats module's events, heard before the UI's (the audio module builds first): which cat is meant
  function wire() {
    for (const ev of ['catNear', 'catFound', 'spotFound', 'hint']) SN.on(ev, noteCat);
    SN.on('spotMiss', d => { if (d && d.far) noteCat(d); });
    SN.on('catFound', d => { const c = d && d.cat; if (c && !CATV.found.includes(c)) CATV.found.push(c); });
    SN.on('catsRestored', d => { // (a play resumed after a reload: its finds, in the order they were made)
      try { const all = SN.modules?.cats?.cats || [], ids = (d && Array.isArray(d.found)) ? d.found : []; CATV.found = ids.map(id => all.find(c => c.spotId === id)).filter(Boolean); } catch { CATV.found = []; }
    });
    for (const ev of ['replay', 'levelLoading', 'gallery']) SN.on(ev, () => { CATV.found = []; CATV.cur = null; });
  }
  // footsteps by surface (SN.world.surfaceAt): stone, grass, wood, wheat, earth, water, carpet, and gravel (a garden
  // path), soil (ploughed furrows), table (a tabletop, for a cat-sized visitor); other names by their nearest
  // (SURF: boards → wood, furrow → soil, path → gravel, tiles → stone, …; anything unknown → grass); a painting's
  // scene may play one of the names a painting gives as another (stepAs: the Sower's 'earth' is soft soil (its hard
  // paths can say 'dirt'), the Sunflowers' 'wood' a tabletop, the Irises' 'stone' its gravel walk)
  const SURF = { boards: 'wood', board: 'wood', floorboards: 'wood', floor: 'wood', planks: 'wood', plank: 'wood', jetty: 'wood', deck: 'wood', stairs: 'wood',
    tabletop: 'table', 'table-top': 'table', furrow: 'soil', furrows: 'soil', ploughed: 'soil', plowed: 'soil', tilled: 'soil', mud: 'soil', dirt: 'earth', clay: 'earth',
    path: 'gravel', paths: 'gravel', pebbles: 'gravel', sand: 'gravel', tile: 'stone', tiles: 'stone', cobbles: 'stone', paving: 'stone', flagstones: 'stone', marble: 'stone',
    rug: 'carpet', cloth: 'carpet', tablecloth: 'carpet', linen: 'carpet', lawn: 'grass', meadow: 'grass', moss: 'grass', leaves: 'grass', flowers: 'grass',
    stubble: 'wheat', straw: 'wheat', hay: 'wheat', stream: 'water', puddle: 'water', shallows: 'water' };
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  function stepKind(surface) { // (stepAs maps the name the painting gave; the aliases then resolve it)
    let k = typeof surface === 'string' ? surface.toLowerCase() : 'grass';
    const as = S.sc && S.sc.def.stepAs;
    if (own(as, k) && typeof as[k] === 'string') k = as[k];
    return own(STEPS, k) ? k : own(SURF, k) ? SURF[k] : 'grass';
  }
  function footstep(surface, speed, at) {
    if (!ready()) return;
    const kind = stepKind(surface), R = STEPS[kind];
    const t = at != null ? finite(at, now()) + 0.005 : soon();
    const vol = (finite(speed) > 6 ? 0.1 : 0.07) * (0.85 + r() * 0.3) * R.v, bpR = r(), off = r() * 1.6;
    const set = tpls().step[kind] || [], v = claim('step', t, R.sec);
    if (!set.length && !S.live) bankSteps(kind);
    if (!v) return;
    const p = (S.foot ^= 1) ? 0.12 : -0.12;
    emit(v, v => {
      const into = bus(S.g.sfx, p, 0, v.end);
      if (set.length) playBuf(v, set[Math.min(set.length - 1, Math.floor(bpR * set.length))], t, vol / STEP_V, into, 1 + (off / 1.6 - 0.5) * 0.06); // (±3% per step)
      else stepDry(t, kind, vol, R.f[0] + bpR * (R.f[1] - R.f[0]), off, liveInto(v, into));
    });
    // old boards (the bedroom's stairs and landing, the café's terrace, the jetty): a creak now and then
    if (kind === 'wood' && S.sc && S.sc.def.creak && r() < finite(+S.sc.def.creak, 0)) safe('creak', () => floorCreak(t + 0.04, p * 2));
  }
  const surfaceHere = () => { try { const p = SN.player.pos; return SN.world.surfaceAt ? SN.world.surfaceAt(p.x, p.z) : 'grass'; } catch { return 'grass'; } }; // (footstep() resolves it)
  function land() { if (ready()) { const s = surfaceHere(); footstep(s, 7); setTimeout(() => footstep(s, 7), 40); } }
  function click() {
    if (!ready()) return;
    const t = soon(), v = claim('fx', t, 0.14, true);
    if (!v) return;
    emit(v, v => {
      const o = osc('sine', 1180), g = gain(0);
      P.set(o.frequency, 1180, t); P.exp(o.frequency, 780, t + 0.06);
      o.connect(g).connect(S.g.sfx); v.head = g;
      P.set(g.gain, 0, t); P.lin(g.gain, 0.05, t + 0.004); P.exp(g.gain, 0.0001, t + 0.11);
      begin(o, t); end(o, t + 0.13);
    });
  }
  function miss() {
    if (!ready()) return;
    const t = soon(), off = r(), v = claim('fx', t, 0.16, true);
    if (!v) return;
    emit(v, v => {
      const s = source(S.g.white), bp = filter('bandpass', 520, 1.1), g = gain(0);
      s.connect(bp).connect(g).connect(S.g.sfx); v.head = g;
      P.set(g.gain, 0, t); P.lin(g.gain, 0.05, t + 0.01); P.exp(g.gain, 0.0001, t + 0.12);
      begin(s, t, off, 0.15);
    });
  }
  // for painting modules: any sample of the bundle by name (or group), placed like the events
  // (o: {pan, gain, wet, lp, rate, at (s from now), dest: 'amb' | 'sfx', pos: {x, y, z} | [x, y, z] (where it
  // happens: then pan, level, dullness and room come from there, `ref` m being where its gain is as given)}). A sample that is missing, failed or
  // still decoding plays its synthesised stand-in where there is one (seeds, bee, billiard, clink, bird, crow,
  // water-lap, the creaks, hoof, thunder-far); false if nothing could play
  const PLAY_SYN = { seeds: 'seeds', bee: 'bee', billiard: 'billiard', clink: 'clink', bird: 'bird', crow: 'crow', 'water-lap': 'lap',
    'boat-creak': 'creak', 'floor-creak': 'creak', creak: 'creak', hoof: 'hoof', 'thunder-far': 'thunder' };
  function play(name, o = {}) {
    if (!ready() || !S.sc || typeof name !== 'string') return false;
    const e = SMP.e.get(name) ? smp(name) : pick(name), t = soon() + Math.min(HORIZON - 1, Math.max(0, finite(o.at))), dest = o.dest === 'sfx' ? S.g.sfx : S.g.amb;
    const pl = o.pos ? placeAt(o.pos, o.ref) : null;
    const pn = pl ? pl.pan : o.pan == null ? 0 : SN.clamp(finite(o.pan), -1, 1), vol = Math.max(0, finite(o.gain, 0.5)) * (pl ? pl.k : 1);
    if (!e) {
      want([name]);
      const fn = SYN[PLAY_SYN[name.replace(/-\d+$/, '')]];
      return fn ? !!safe('play', () => fn(t, pn, vol, dest)) : false;
    }
    const lp = pl ? Math.min(finite(o.lp, 16000), pl.lp) : o.lp, wet = finite(o.wet, 0.4) * (pl ? pl.wet : 1);
    return !!smpVoice(e, { t, vol: vol * e.gain, rate: finite(o.rate, 1), pan: pn, wet, lp, dest, kind: 'evt', hi: false });
  }
  // a crow calls (a crows module can call this when its flock takes off): o = {pan, gain, at, pos (where it is:
  // then its side and nearness come from there)}. Without a pos or a pan: from the painting's flock (its nearest
  // birds' bearing and nearness), else a random side. It joins the queue of the alarm caws (crowWatch), so a
  // take-off is one burst of spaced caws, never a caw doubled on top of the engine's own; true when it plays or a
  // burst already queued covers it
  function caw(o = {}) {
    if (!ready() || !S.sc) return false;
    const t0 = soon() + Math.min(HORIZON - 1, Math.max(0, finite(o.at)));
    if (crowAt() > t0 + 1.6) return true; // (a burst of alarm caws is already on its way)
    const own = (S.sc.def.ev || []).find(k => k && k.flock) || {}; // (the scene's crows: their room and brightness)
    const e = { name: 'crow', gain: finite(o.gain, 0.6), pan: 0, wet: finite(own.wet, 0.6), lp: finite(own.lp, 7000), rate: own.rate, synth: 'crow' };
    const pl = o.pos ? placeAt(o.pos, 20) : null, fk = !pl && o.pan == null ? flock() : null;
    const fl = pl ? { k: SN.clamp(pl.k / 1.4, 0.15, 1), pan: pl.pan } : fk && fk.pan != null ? fk
      : { k: fk ? fk.k : 1, pan: o.pan == null ? (r() - 0.5) * 1.4 : SN.clamp(finite(o.pan), -0.9, 0.9) };
    const at = Math.max(t0, CROW.at), v = sceneEvent(e, at, fl);
    if (v) { CROW.at = at + 0.3 + r() * 0.45; CROW.n++; }
    return !!v;
  }
  // footsteps follow the head bob (two steps per bob cycle) while walking on the ground
  function update() {
    if (S.testing) return;
    if (!S.ctx) { if (S.revive && !document.hidden) wake(); return; } // closed by the browser: a new one (budgeted)
    // the frame loop backs up the scheduler's timer: if it has not run for 1.5 s, start it again
    if (S.started && !document.hidden && performance.now() - S.lastTick > 1500) {
      clearInterval(S.timer); S.timer = setInterval(tick, 200); tick();
      if (!S.ctx) return;
    }
    if (S.ctx.state !== 'running') return;
    const p = SN.player, k = Math.floor((p.bob || 0) / Math.PI);
    if (SN.game.state === 'playing' && p.grounded && (p.speed || 0) > 0.5 && !p.fly && k !== S.stepK) footstep(surfaceHere(), p.speed);
    S.stepK = k;
  }
  function setMuted(m) {
    S.muted = !!m; store.set('sn.muted', S.muted ? '1' : '0');
    if (S.g && !S.testing) P.tgt(S.g.out.gain, S.muted ? 0 : 1, now(), 0.06);
  }
  function muffle(on) {
    S.muffled = !!on;
    if (S.g && !S.testing) P.tgt(S.g.muffler.frequency, on ? 700 : openF(), now(), on ? 0.12 : 0.25);
  }

  // ---- recipes: the synthesis itself, dry and mono (no pan, no reverb send), into `dest`. The bank
  // renders them once into templates; until a template is ready they play live.
  function celestaDry(t, midi, v, dest) {
    const f = mtof(midi), hi = midi > 80 ? 0.4 : 1;
    const partial = (type, mult, amp, dec, att = 0.003) => {
      const o = osc(type, f * mult), g = gain(0);
      P.set(g.gain, 0, t); P.lin(g.gain, amp * v, t + att); P.exp(g.gain, 0.0001, t + dec);
      o.connect(g).connect(dest); begin(o, t); end(o, t + dec + 0.05);
    };
    partial('sine', 1, 0.32, 2.6);
    partial('sine', 2, 0.06, 1.1);
    partial('sine', 4.01, 0.045 * hi, 0.28, 0.002);
    partial('triangle', 1, 0.05, 0.9);
  }
  function pianoDry(t, midi, v, dest) {
    const f = mtof(midi), lp = filter('lowpass', Math.min(2400, f * 5), 0.6), g = gain(0);
    lp.connect(g).connect(dest);
    for (const [type, mult] of [['triangle', 1], ['sine', 2], ['sine', 3]]) { const o = osc(type, f * mult); o.connect(lp); begin(o, t); end(o, t + 4.6); }
    P.set(g.gain, 0, t); P.lin(g.gain, 0.1 * v, t + 0.015); P.exp(g.gain, 0.0001, t + 4.4);
  }
  function padDry(t, ch, len, dest) {
    const g = gain(0), lp = filter('lowpass', 560, 0.6);
    g.connect(lp).connect(dest);
    for (const m of [ch.bass, ...ch.pad]) for (const det of [-5, 5]) {
      const o = osc('sine', mtof(m)); P.val(o.detune, det);
      const og = gain(m === ch.bass ? 0.45 : 0.22);
      o.connect(og).connect(g); begin(o, t); end(o, t + len + 4.6);
    }
    P.set(g.gain, 0, t); P.lin(g.gain, 0.05, t + 3);
    P.set(g.gain, 0.05, t + len - 0.4); P.lin(g.gain, 0, t + len + 4.4);
  }
  const BELL = [[0.5, 0.35, 6], [1, 0.8, 4.5], [1.2, 0.45, 3.2], [1.5, 0.28, 2.6], [2, 0.55, 2.2], [2.5, 0.2, 1.4], [2.67, 0.16, 1.2], [3, 0.12, 1], [4.07, 0.07, 0.7]];
  function bellDry(t, vol, dest, rnd) { // one toll: nine partials, each with its own decay
    for (const [ratio, amp, dec] of BELL) {
      const o = osc('sine', 174.6 * ratio * (1 + (rnd() - 0.5) * 0.002)), g = gain(0);
      P.set(g.gain, 0, t); P.lin(g.gain, amp * vol, t + 0.004); P.exp(g.gain, 0.00005, t + dec);
      o.connect(g).connect(dest); begin(o, t); end(o, t + dec + 0.05);
    }
  }
  const OWL = [[[0, 0.32], [0.62, 0.18], [0.9, 0.6]], [[0, 0.5], [0.95, 0.2], [1.28, 0.2], [1.6, 0.65]]];
  function owlDry(t0, f, pattern, dest) {
    const lp = filter('lowpass', 1100, 0.5); lp.connect(dest);
    for (const [dt, dur] of pattern) {
      const t = t0 + dt, ff = f * (dt ? 0.97 : 1);
      for (const [mult, amp] of [[1, 0.05], [2, 0.006]]) {
        const o = osc('sine', ff * mult * 1.04), g = gain(0);
        P.set(o.frequency, ff * mult * 1.04, t); P.exp(o.frequency, ff * mult * 0.93, t + dur);
        P.set(g.gain, 0, t); P.lin(g.gain, amp, t + 0.07);
        P.lin(g.gain, amp * 0.8, t + dur * 0.75); P.lin(g.gain, 0, t + dur + 0.14);
        o.connect(g).connect(lp); begin(o, t); end(o, t + dur + 0.2);
      }
    }
  }
  function cricketDry(t, f, n, v, dest) {
    const o = osc('sine', f), g = gain(0);
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.032;
      P.set(g.gain, 0, s); P.lin(g.gain, v, s + 0.005); P.lin(g.gain, v * 0.5, s + 0.013); P.lin(g.gain, 0, s + 0.02);
    }
    o.connect(g).connect(dest); begin(o, t); end(o, t + n * 0.032 + 0.04);
  }
  // a footstep: a noise scuff through the surface's band and a low thump (stone and grass exactly as they
  // always were); wood adds a hollow board resonance, wheat a dry crackle, water a splash
  const STEPS = {
    stone: { hp: 260, q: 1.2, f: [1500, 2200], att: 0.004, dec: 0.09, th: 0.9, thF: [120, 55], v: 1, sec: 0.26 },
    grass: { hp: 260, q: 0.7, f: [700, 1200], att: 0.018, dec: 0.16, th: 0.6, thF: [120, 55], v: 1, sec: 0.26 },
    wood: { hp: 150, q: 1.8, f: [480, 760], att: 0.003, dec: 0.075, th: 1.1, thF: [165, 90], v: 1, sec: 0.26, knock: [230, 5] },
    earth: { hp: 180, q: 0.9, f: [420, 700], att: 0.01, dec: 0.12, th: 1.0, thF: [110, 50], v: 0.95, sec: 0.26 },
    wheat: { hp: 1200, q: 0.55, f: [2600, 4200], att: 0.03, dec: 0.2, th: 0.35, thF: [120, 55], v: 0.9, sec: 0.34, crackle: true },
    water: { hp: 300, q: 0.8, f: [900, 1500], att: 0.012, dec: 0.2, th: 0.45, thF: [140, 60], v: 0.9, sec: 0.42, splash: true },
    carpet: { hp: 120, q: 0.6, f: [280, 440], att: 0.014, dec: 0.1, th: 0.55, thF: [100, 50], v: 0.55, sec: 0.26 },
    // (grains: [n, Hz, Q, span s, level] — little stones shifting, or clods crumbling, just after the step)
    gravel: { hp: 700, q: 0.8, f: [1500, 2600], att: 0.01, dec: 0.1, th: 0.5, thF: [120, 55], v: 1.3, sec: 0.3, grains: [5, 3800, 1.2, 0.12, 0.9] },
    soil: { hp: 140, q: 0.8, f: [300, 520], att: 0.02, dec: 0.13, th: 0.95, thF: [95, 45], v: 0.9, sec: 0.3, grains: [3, 1100, 1.4, 0.1, 0.35] },
    // (the table: a light tap, the player's only sound on the Sunflowers' tabletop: its short click reads ~9 dB under a
    // wood step at the same level, so it plays at twice that, just under wood and over carpet)
    table: { hp: 380, q: 2, f: [1100, 1500], att: 0.002, dec: 0.035, th: 0.3, thF: [300, 170], v: 2, sec: 0.2, knock: [640, 7] },
  };
  function stepDry(t, kind, vol, bpF, off, dest) {
    const R = STEPS[kind] || STEPS.grass, s = source(noiseBuf('white'));
    const hp = filter('highpass', R.hp, 0.5), bp = filter('bandpass', bpF, R.q), g = gain(0);
    s.connect(hp).connect(bp).connect(g).connect(dest);
    const att = R.att, dec = R.dec;
    P.set(g.gain, 0, t); P.lin(g.gain, vol, t + att); P.exp(g.gain, 0.0008, t + att + dec);
    begin(s, t, off, att + dec + 0.05);
    const o = osc('sine', R.thF[0]), og = gain(0);
    P.set(o.frequency, R.thF[0], t); P.exp(o.frequency, R.thF[1], t + 0.07);
    o.connect(og).connect(dest);
    P.set(og.gain, 0, t); P.lin(og.gain, vol * R.th, t + 0.005); P.exp(og.gain, 0.0008, t + 0.09);
    begin(o, t); end(o, t + 0.12);
    if (R.knock) { // the board rings a little
      const kb = filter('bandpass', R.knock[0], R.knock[1]), kg = gain(0);
      hp.connect(kb).connect(kg).connect(dest);
      P.set(kg.gain, 0, t); P.lin(kg.gain, vol * 2.2, t + 0.003); P.exp(kg.gain, 0.0008, t + 0.13);
    }
    if (R.crackle || R.splash) { // a second, brighter noise: dry stalks snapping, or water thrown up
      const s2 = source(noiseBuf('white')), f2 = filter(R.splash ? 'bandpass' : 'highpass', R.splash ? 700 : 4200, R.splash ? 1 : 0.7), g2 = gain(0), t2 = t + (R.splash ? 0.035 : 0.02);
      s2.connect(f2).connect(g2).connect(dest);
      if (R.splash) { P.set(f2.frequency, 700, t2); P.exp(f2.frequency, 2200, t2 + 0.12); P.set(g2.gain, 0, t2); P.lin(g2.gain, vol * 0.8, t2 + 0.02); P.exp(g2.gain, 0.0008, t2 + 0.2); }
      else for (const [dt, a] of [[0, 0.6], [0.045, 0.4], [0.1, 0.3]]) { P.set(g2.gain, 0, t2 + dt); P.lin(g2.gain, vol * a, t2 + dt + 0.003); P.exp(g2.gain, 0.0008, t2 + dt + 0.03); }
      begin(s2, t2, (off + 0.6) % 1.6, R.splash ? 0.25 : 0.16);
    }
    if (R.grains) { // (their spacing and levels from `off`: the same take whether baked or live; ≥ 12 ms apart)
      const [n, f, q, span, a] = R.grains, s3 = source(noiseBuf('white')), f3 = filter('bandpass', f, q), g3 = gain(0);
      s3.connect(f3).connect(g3).connect(dest);
      P.set(g3.gain, 0, t);
      for (let i = 0; i < n; i++) {
        const u = (off * 7.31 + i * 0.618) % 1, dt = att + 0.006 + span * (i + u) / n, ga = a * (0.5 + 0.5 * ((off * 13.7 + i * 0.37) % 1));
        P.set(g3.gain, 0, t + dt); P.lin(g3.gain, vol * ga, t + dt + 0.002); P.exp(g3.gain, 0.0008, t + dt + 0.012);
      }
      begin(s3, t, (off + 1.1) % 1.6, att + span + 0.08);
    }
  }
  function purrDry(t, f, vol, off, dest) {
    const dur = 1.7;
    const saw = osc('sawtooth', f), lp = filter('lowpass', 520, 0.6), bp = filter('bandpass', 210, 0.8);
    const nz = source(noiseBuf('brown'));
    const nbp = filter('bandpass', 320, 0.9), ng = gain(0.5), am = gain(0.55), lfo = osc('sine', f), lg = gain(0.45);
    lfo.connect(lg).connect(am.gain);
    const env = gain(0);
    saw.connect(lp).connect(bp).connect(env);
    nz.connect(nbp).connect(ng).connect(am).connect(env);
    env.connect(dest);
    P.set(env.gain, 0, t);
    P.lin(env.gain, vol * 0.55, t + 0.18); P.lin(env.gain, vol * 0.3, t + 0.72);
    P.lin(env.gain, vol, t + 0.95); P.lin(env.gain, vol * 0.7, t + 1.35);
    P.lin(env.gain, 0, t + dur);
    P.set(saw.frequency, f * 1.06, t); P.lin(saw.frequency, f * 0.94, t + dur);
    for (const o of [saw, lfo]) { begin(o, t); end(o, t + dur + 0.05); }
    begin(nz, t, off, dur + 0.05);
  }

  // ---- the bank: templates baked from the recipes, a small group at a time, in the order they are
  // first needed, and only what this painting uses (its music; the bell and owl where they ring; other
  // footstep surfaces the first time they are walked on; the purr only if there is no purr sample).
  // Mono; full rate where there are highs (crickets, footsteps), lower rates for dark, low sounds (pad,
  // bell, owl ≤ 11 kHz, piano, purr 16 kHz, celesta 32 kHz; on a phone the pad 8 kHz, piano 11 kHz, celesta 16 / 24
  // kHz). ~14–16 MB in all (~9 on a phone).
  const CEL_V = 0.35, STEP_V = 0.08, PURR_V = 0.2, BELL_V = { amb: 0.03, mid: 0.18 }, OWL_F = [345, 375], PURR_F = [0, 1, 2].map(k => 24 + (k + 0.5) / 3 * 5);
  const celNotes = M => {
    const s = new Set([...M.fanfare, 88, 91, ...(LADDER[M.id] || [])]); // fanfare, mrrp, the roll call
    for (const ch of M.chords) { ch.arp.forEach(m => s.add(m)); const tn = chimeTones(ch); tn.forEach(m => s.add(m)); s.add(tn[2] + 12); }
    return [...s];
  };
  const pianoNotes = M => [...new Set(M.chords.map(c => c.bass + 12))].map(m => [m, 0.32]).concat([[M.chords[0].bass + 12, 0.6]]);
  const bankSet = () => ({ cel: {}, pad: {}, piano: {}, bell: { amb: [], mid: [] }, owl: [], cricket: {}, step: {}, purr: [] });
  const BANK = { ...bankSet(), none: bankSet(), rng: null, queue: null, rate: 44100, musics: new Set(), steps: new Set(), keys: new Set(), busy: 0, done: false, hurry: false, waiters: [], ms: 0, bytes: 0, groups: 0, fails: 0, bad: 0 };
  const J = (sec, fn, put, fade = 0) => ({ sec, fn, put, fade });
  // a painting's own synthesised sounds that are not baked (or queued) yet: its crickets, its owl, its bell
  // (the bank begins with the first painting played; another one later adds what it has that that one had not)
  function sceneJobs(sc) {
    const d = sc ? sc.def : SCENES['village-night'], cr = [], rest = [], mark = k => !BANK.keys.has(k) && !!BANK.keys.add(k);
    const freqs = new Set([...(d.crickets || []), ...(d.cricketsAlt || []), ...((d.outside && d.outside.crickets) || [])].map(c => c[0]));
    for (const f of [4400, 4950, 3900]) if (freqs.has(f)) for (const n of [3, 4]) if (mark(`cricket:${f}:${n}`)) cr.push(J(n * 0.032 + 0.05, (t, dd) => cricketDry(t, f, n, 1, dd), b => (BANK.cricket[f + ':' + n] = b)));
    if (d.owl && mark('owl')) for (let pi = 0; pi < 2; pi++) for (let ci = 0; ci < 2; ci++) rest.push(J(pi ? 2.46 : 1.72, (t, dd) => owlDry(t, OWL_F[ci], OWL[pi], dd), b => (BANK.owl[pi * 2 + ci] = b)));
    const inTune = () => 0.5; // (the detune comes from the playback rate of each toll)
    if ((!sc || sc.bell) && mark('bell')) for (const lvl of ['amb', 'mid']) rest.push(J(6.06, (t, dd) => bellDry(t, BELL_V[lvl], dd, inTune), b => (BANK.bell[lvl][0] = b))); // (no church, no bell)
    return { cr, rest };
  }
  function bankGroups(rate) {
    const br = BANK.rng = SN.rng('ui-audio-bank'), G = [], sc = S.sc, d = sc ? sc.def : SCENES['village-night'];
    const { cr, rest } = sceneJobs(sc), first = cr; // (only this painting's crickets, and its own ground)
    for (const surf of ['stone', 'grass']) {
      const R = STEPS[surf], use = !d.steps || d.steps.includes(surf);
      for (let k = 0; k < 6; k++) { // (the draws are made either way: the other surfaces' variants stay as they were)
        const bpF = R.f[0] + (k + 0.5) / 6 * (R.f[1] - R.f[0]), off = br() * 1.6;
        if (use) first.push(J(R.sec, (t, dd) => stepDry(t, surf, STEP_V, bpF, off, dd), b => (BANK.step[surf] ||= []).push(b)));
      }
      if (use) BANK.steps.add(surf);
    }
    if (first.length) G.push({ rate, jobs: first });
    G.push(...musicGroups(S.mus));
    if (rest.length) G.push({ rate: 11025, jobs: rest });
    if (!smpNames('purr').length) G.push({ rate: 16000, jobs: [0, 1, 2].map(k => { const f = PURR_F[k], off = br() * 2; return J(1.76, (t, dd) => purrDry(t, f, PURR_V, off, dd), b => (BANK.purr[k] = b)); }) });
    return G;
  }
  // another painting after the bank began with the first: its crickets, owl, bell and grounds (its music: bankMusic)
  function bankScene(sc) {
    if (!OAC || !BANK.queue || !sc) return;
    const { cr, rest } = sceneJobs(sc);
    bankAdd([{ rate: BANK.rate, jobs: cr }, { rate: 11025, jobs: rest }].filter(g => g.jobs.length));
    for (const k of sc.def.steps || []) bankSteps(k);
  }
  // a music's templates: its first pad, its celesta notes, its piano, the rest of its pads
  function musicGroups(M) {
    if (BANK.musics.has(M.id)) return [];
    BANK.musics.add(M.id);
    const pads = BANK.pad[M.id] ||= [];
    const pad = i => J(M.len + 4.65, (t, dd) => padDry(t, M.chords[i], M.len, dd), b => (pads[i] = b));
    // the celesta: its top partial is 4 × the note (≈ 8.4 kHz at MIDI 91): 32 kHz; on a phone 24 kHz, and
    // 16 kHz below MIDI 84 (partials < 4.2 kHz: the playback resampler's images fall under -55 dB)
    const cel = celNotes(M).filter(m => !BANK.cel[m]), celJob = m => J(2.3, (t, dd) => celestaDry(t, m, CEL_V, dd), b => (BANK.cel[m] = b), 0.06);
    // on a phone the pad (a 560 Hz lowpass) is baked at 8 kHz and the piano (≤ 2.4 kHz) at 11 kHz
    const lite = lightDevice(), padRate = lite ? 8000 : 11025;
    const cels = lite ? [{ rate: 16000, jobs: cel.filter(m => m < 84).map(celJob) }, { rate: 24000, jobs: cel.filter(m => m >= 84).map(celJob) }] : [{ rate: 32000, jobs: cel.map(celJob) }];
    return [
      { rate: padRate, jobs: [pad(0)] },
      ...cels,
      { rate: lite ? 11025 : 16000, jobs: pianoNotes(M).filter(([m, v]) => !BANK.piano[m + '@' + v]).map(([m, v]) => J(4.62, (t, dd) => pianoDry(t, m, v, dd), b => (BANK.piano[m + '@' + v] = b))) },
      { rate: padRate, jobs: M.chords.slice(1).map((_, i) => pad(i + 1)) },
    ].filter(g => g.jobs.length);
  }
  function bankAdd(groups) {
    if (!BANK.queue || !groups.length) return;
    BANK.queue.push(...groups); BANK.done = false;
    if (!BANK.busy) setTimeout(bankNext, 0);
  }
  const bankMusic = () => bankAdd(musicGroups(S.mus)); // (a painting's music after the bank began with another)
  // a footstep surface the first time it is walked on: its six variants
  function bankSteps(kind) {
    if (!OAC || !BANK.queue || BANK.steps.has(kind) || !STEPS[kind]) return;
    BANK.steps.add(kind);
    const R = STEPS[kind], br = SN.rng('ui-audio-step-' + kind), jobs = [];
    for (let k = 0; k < 6; k++) {
      const bpF = R.f[0] + (k + 0.5) / 6 * (R.f[1] - R.f[0]), off = br() * 1.6;
      jobs.push(J(R.sec, (t, dd) => stepDry(t, kind, STEP_V, bpF, off, dd), b => (BANK.step[kind] ||= []).push(b)));
    }
    bankAdd([{ rate: BANK.rate, jobs }]);
  }
  const tpls = () => (S.live ? BANK.none : BANK); // (self-test {live: true}: the recipes, to check the templates against)
  function bankStart(rate) {
    if (BANK.queue || !OAC) return;
    BANK.rate = rate;
    BANK.queue = bankGroups(rate);
    for (const k of (S.sc && S.sc.def.steps) || []) bankSteps(k); // (this painting's other grounds, after its music)
    setTimeout(bankNext, 0);
  }
  function bankNext() {
    if (BANK.busy || !BANK.queue) return;
    const grp = BANK.queue.shift();
    if (!grp) { BANK.done = true; BANK.waiters.splice(0).forEach(f => f()); return; }
    const t0 = performance.now(), id = (BANK.busy = ++BANK.groups);
    const next = () => { if (BANK.busy !== id) return; BANK.busy = 0; BANK.ms += performance.now() - t0; if (BANK.hurry) bankNext(); else setTimeout(bankNext, 40); };
    setTimeout(() => { if (BANK.busy === id) { BANK.fails++; next(); } }, 15000); // a render that never finishes: move on
    bakeGroup(grp).catch(e => { BANK.fails++; warnOnce('bank', 'could not pre-render some sounds (they play live)', e); }).then(next);
  }
  function bankReady() { // (the self-test waits for the whole bank: it measures the lean mix)
    if (!OAC || (BANK.done && BANK.queue && !BANK.queue.length && !BANK.busy)) return Promise.resolve();
    BANK.hurry = true;
    if (!BANK.queue) bankStart(S.ctx ? S.ctx.sampleRate : 44100);
    return new Promise(res => { BANK.waiters.push(res); setTimeout(res, 20000); });
  }
  async function bakeGroup(grp) {
    let at = 0.01;
    for (const j of grp.jobs) { j.at = at; at += j.sec + 0.05; }
    let off = null, rate = 0;
    for (const r0 of [grp.rate, 22050, 44100]) { try { off = new OAC(1, Math.ceil((at + 0.05) * r0), r0); rate = r0; break; } catch { /* a rate this engine accepts */ } }
    if (!off) throw new Error('no OfflineAudioContext');
    const prev = S.ctx, prevStats = S.stats;
    S.ctx = off; S.stats = zero();
    try { for (const j of grp.jobs) { j.at = Math.round(j.at * rate) / rate; j.fn(j.at, off.destination); } } finally { S.ctx = prev; S.stats = prevStats; }
    const out = await render(off), d = out.getChannelData(0);
    for (const j of grp.jobs) {
      const a = Math.round(j.at * rate), n = Math.max(1, Math.min(d.length - a, Math.ceil(j.sec * rate)));
      const b = off.createBuffer(1, n, rate), x = b.getChannelData(0);
      x.set(d.subarray(a, a + n));
      for (let i = 0; i < n; i++) if (x[i] - x[i] !== 0) { x[i] = 0; BANK.bad++; }
      const nf = Math.min(n, Math.round(j.fade * rate));
      for (let i = 0; i < nf; i++) x[n - 1 - i] *= i / nf;
      j.put(b); BANK.bytes += n * 4;
    }
  }
  function render(off) {
    return new Promise((res, rej) => {
      off.oncomplete = e => res(e.renderedBuffer);
      try { const p = off.startRendering(); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
    });
  }

  // ---- offline self-test: render the mix with a few events, report levels (test API only). The
  // scheduler runs by hand in the original engine's steps (0.2 s, 0.45 s ahead), so the random
  // choices, and the level windows, match the original engine's test event for event (the village,
  // synthesised); voices are built chunk by chunk as the render reaches them and swept when they end,
  // as in real play. `parts`: amb, music, events, finale, bells, step, stress, samples (each cat voice),
  // sceneev (each painting event once), nosmp (synthesised only), scene=<ambience>; or 'all' (every
  // painting: bed, bed + music, events, painting events, peaks). o: {bank, ir, live, lite, chunk,
  // progressive, scene, music, samples: false, keep (the rendered AudioBuffer as .buffer)}.
  const TARGET = { bed: -24, events: -16, peak: 0.9 };
  async function selfTest(sec = 14, parts = 'amb,music,events', o = {}) {
    if (!OAC) return { error: 'no OfflineAudioContext' };
    parts = String(parts ?? '');
    if (/(^|,)all(,|$)/.test(parts) || o.scene === 'all') return allScenes(sec, o);
    // only modifiers (scene=<ambience>, nosmp) or nothing: that scene's own mix, as the default test renders it
    const CONTENT = ['amb', 'music', 'events', 'finale', 'bells', 'hush', 'ring', 'rollcall', 'step', 'stress', 'samples', 'sceneev', 'steps'];
    if (!parts.split(',').some(k => CONTENT.includes(k))) parts = ['amb', 'music', 'events', ...parts.split(',').filter(Boolean)].join(',');
    const has = k => parts.split(',').includes(k), sm = /scene=([\w-]+)/.exec(parts);
    const scName = o.scene || (sm && sm[1]) || null;
    const sc = scName ? sceneOf({ audio: { ambience: scName, music: o.music }, night: SCENES[scName] ? SCENES[scName].night : true })
      : S.sc || sceneByName('village-night');
    const nosmp = o.samples === false || has('nosmp');
    const rate = 44100, t0 = performance.now();
    if (o.bank !== false) await bankReady();
    if (!nosmp) await smpReady([sc.def.bed, ...CAT_SMP, ...sceneSamples(sc)], 10000);
    const bankWait = performance.now() - t0;
    const saved = { ctx: S.ctx, g: S.g, rng: S.rng, chordI: S.chordI, nextChord: S.nextChord, crickets: S.crickets,
      nextGust: S.nextGust, nextOwl: S.nextOwl, nextBell: S.nextBell, foot: S.foot, stats: S.stats, defer: S.defer, irSec: S.irSec, live: S.live, lite: S.lite,
      sc: S.sc, mus: S.mus, ev: S.ev, windK: S.windK, crickK: S.crickK, wetK: S.wetK, hum: S.hum, nextBreath: S.nextBreath, nosmp: S.nosmp, out: S.out };
    S.testing = true;
    // (which take of a group played last: from a clean slate, so a scene's test draws the same takes whatever ran before it)
    const lastTakes = new Map(SMP.last); SMP.last.clear();
    try {
      const off = new OAC(2, Math.floor(rate * sec), rate);
      S.ctx = off; S.rng = SN.rng('ui-audio'); S.stats = zero(); S.foot = 0; S.irSec = o.ir ?? null; S.live = !!o.live; S.lite = SN.clamp(Math.round(finite(o.lite)), 0, LITE.length - 1); // (the offline graph is never muted or muffled)
      S.sc = sc; S.mus = MUSIC[sc.music] || MUSIC.night; S.nosmp = nosmp; S.out = o.out && sc.def.outside ? 1 : 0; // (the painting view: inside; {out: true}: out of the room)
      S.g = buildGraph(true);
      const progressive = o.progressive !== false && typeof off.suspend === 'function';
      S.defer = [];
      startAmbience(); if (S.out && windNow() > 0 && !S.g.wind) startWind(0);
      S.nextChord = has('music') ? 0.3 : 1e9; S.chordI = -1; if (sc.def.owl) S.nextOwl = 5; if (sc.bell) S.nextBell = 7.5;
      if (!has('amb')) {
        const W = S.g.wind, B = S.g.bed;
        if (W) { try { W.g1.gain.cancelScheduledValues(0); } catch { /* */ } P.val(W.g1.gain, 0); }
        if (B) { try { B.g.gain.cancelScheduledValues(0); } catch { /* */ } P.val(B.g.gain, 0); B.lvl = 0; }
        S.nextGust = 1e9; S.crickets = []; S.nextOwl = S.nextBell = 1e9; S.ev = [];
      }
      if (has('sceneev')) S.ev = []; // (each painting event once, below, instead of at random)
      for (let t = 0; t < sec; t += 0.2) schedule(t, 0.45); // the original engine's steps
      const marks = {};
      if (has('events')) {
        Object.assign(marks, { meow: 2, hint: 3.2, chime: 4.4, owl: 5, purr: 5.9, mew: 6.9, bell: 7.5, chirp: 9.2, steps: 10.4, fanfare: 12 });
        if (!sc.def.owl) delete marks.owl;
        if (!sc.bell) delete marks.bell;
        // (the game's events draw from a stream of their own, so every scene's test plays the same takes at the same
        // levels: how many draws the painting's own events took before them would otherwise pick a different take, and
        // a scene would read ~2 dB quieter only because its meow drew a softer take)
        const R0 = S.rng; S.rng = SN.rng('ui-audio-events');
        meow({ t: marks.meow, pitch: 1.12, dur: 0.5, gain: 0.45, trill: true });
        hint(2.6, 60, marks.hint);
        chime(marks.chime);
        near(0.8, 3, true, marks.purr); near(-1.2, 3, false, marks.mew); mrrp(0.2, marks.chirp);
        for (let i = 0; i < 6; i++) footstep(i % 2 ? 'stone' : 'grass', 5, marks.steps + i * 0.4);
        fanfare(0, marks.fanfare);
        S.rng = R0;
      }
      if (has('samples')) { // each cat voice once, at a fixed level: how the groups sit against each other
        const L = [['hello', 1, 0.45], ['ask', 2.5, 0.45], ['call', 4, 0.3], ['mew', 6, 0.13], ['trill', 7.5, 0.45], ['purr', 9, 0.22]];
        for (const [k, t, g] of L) {
          marks['smp-' + k] = t;
          if (k === 'purr') purr(t, 0, g); else if (!vox(k, { t, gain: g, pan: 0 })) meowSynth({ t, gain: g, pitch: 1.1, dur: 0.5, question: k === 'ask' });
        }
        hint(0, 60, 11); marks['hint-far'] = 11;
      }
      if (has('sceneev')) { // (and what the painting's modules play, as they would: SN.audio.play(name), gain 0.5)
        const E = testEvents(sc, nosmp);
        E.forEach((e, i) => { const t = 1.5 + i * 3.5; marks['ev-' + (e.name || e.synth)] = t; sceneEvent(e, t, e.flock ? { k: FLOCK_VIEW, pan: 0.3 } : null); });
        (sc.def.preload || []).forEach((n, i) => { const t = 1.5 + (E.length + i) * 3.5; marks['ev-play-' + n] = t; play(n, { at: t - LEAD, gain: finite(+(sc.def.playGain || {})[n], 0.5) }); });
      }
      if (has('steps')) Object.keys(STEPS).forEach((k, i) => { const t = 1 + i * 1.2; marks['step-' + k] = t; for (let j = 0; j < 3; j++) footstep(k, 5, t + j * 0.35); });
      if (has('finale')) { // the win: fanfare, then twelve strokes of midnight from the church
        fanfare(0, 0.3);
        for (let k = 0; k < 12; k++) bell(3 + k * 1.2, 0.22, 1, 0, finaleBus(), 0.5, 'moment');
      }
      if (has('bells')) for (let k = 0; k < 12; k++) bell(1 + k * 1.2, 0.22, 1, 0, finaleBus(), 0.5, 'moment'); // (the strokes alone)
      if (has('hush') || has('ring')) { bell(1, 0.22, 1, 0, finaleBus(), 0.5, 'moment'); marks.stroke = 1; if (has('hush')) hushBell(2); } // (a stroke hushed 1 s in, or left to ring)
      if (has('rollcall')) for (let k = 0; k < 12; k++) { marks['roll-' + k] = 1 + k * 1.2; rollCall(k, 12, 1 + k * 1.2); } // (the roll call without a bell)
      if (has('step')) step(); // the whoosh of stepping into the painting
      if (has('stress')) { // a worst-case pile-up: the limiter must hold it under the ceiling
        const t = 6;
        fanfare(0, t); bell(t, 0.06); chime(t); hint(0, 5, t); hint(3, 5, t + 0.05);
        for (let i = 0; i < 5; i++) meow({ t: t + i * 0.06, pitch: 1 + i * 0.07, dur: 0.6, gain: 0.5, trill: true });
      }
      const queue = S.defer.sort((a, b) => a.t - b.t);
      S.defer = null;
      let qi = 0;
      const CH = o.chunk || 2; // s per render chunk (WebKit's offline suspend() gets slower the more there are)
      const due = (T, done) => { while (qi < queue.length && queue[qi].t < T + CH + 0.6) { const e = queue[qi++]; safe(e.v.kind, () => e.build(e.v)); } if (done) sweep(T); };
      if (progressive) {
        due(0, true);
        for (let T = CH; T < sec - 0.05; T += CH) off.suspend(T).then(() => { safe('selftest', () => due(off.currentTime, true)); off.resume(); }, () => {});
      } else due(1e9, false); // everything built up front, as the original engine's test did
      const r0 = performance.now();
      const buf = await render(off);
      const renderMs = performance.now() - r0;
      const L = buf.getChannelData(0), Rr = buf.getChannelData(1), win = rate / 2, windows = [], pw = [];
      let peak = 0, clipped = 0, nan = 0;
      for (let i = 0; i < L.length; i += win) {
        let s2 = 0, pk = 0;
        for (let j = i; j < Math.min(L.length, i + win); j++) {
          const a = L[j], b = Rr[j];
          if (a - a !== 0 || b - b !== 0) { nan++; continue; }
          const v = Math.max(Math.abs(a), Math.abs(b)); s2 += (a * a + b * b) / 2;
          if (v > pk) pk = v; if (v > 0.99) clipped++;
        }
        peak = Math.max(peak, pk); pw.push({ t: i / rate, p: s2 / win, pk });
        windows.push(`${(i / rate).toFixed(1)}s rms ${(10 * Math.log10(s2 / win + 1e-12)).toFixed(1)}dB peak ${pk.toFixed(3)}`);
      }
      const st = S.stats, loudest = pw.reduce((m, w) => Math.max(m, w.p), 0);
      // a render is never silent (a scene's bed or wind always runs; every other part makes sound): if it is, say so
      const silent = 10 * Math.log10(loudest + 1e-12) < -60;
      if (silent) warnOnce('silent:' + parts, `self-test '${parts}' rendered silence`);
      return { peak: +peak.toFixed(3), clipped, nan, silent, parts, marks, windows, levels: levels(pw, marks), scene: sc.amb, music: sc.music, samples: nosmp ? 'off' : smpInfo(), ...(o.keep ? { buffer: buf } : {}),
        stats: { renderMs: Math.round(renderMs), xRealtime: +(sec * 1000 / renderMs).toFixed(1), bankWaitMs: Math.round(bankWait), progressive,
          nodes: st.nodes, voices: st.voices, capped: st.capped, far: st.far, errs: st.errs, bank: bankInfo() } };
    } finally {
      Object.assign(S, saved); S.testing = false;
      SMP.last.clear(); for (const [k, v] of lastTakes) SMP.last.set(k, v);
      if (S.g) { setMuted(S.muted); muffle(S.muffled); } // anything toggled meanwhile reaches the real graph now
      if (S.pend !== undefined) { const L = S.pend; S.pend = undefined; setScene(L); } // a painting that loaded meanwhile
      else if (S.started && S.g && S.sc && !S.g.bed && bedState(S.sc) === 'ok') safe('bed', () => startBed(now())); // its bed landed meanwhile
    }
  }
  // a scene's events as the self-test plays them once each: its 'alt' ones only when the bed is missing too
  const testEvents = (sc, nosmp) => (sc.def.ev || []).filter(e => !e.alt || nosmp || !sc.def.bed || !smpNames(sc.def.bed).length);
  // the 0.5 s windows → bed (mean power of the windows from 3 s on that no mark touches), each mark's
  // loudest window within 1 s of it (a painting event, 'ev-*': within 3 s, or up to the next mark: a far
  // thunder swells for 2 s), the mean of those, and each painting event's contrast over the bed (dB)
  function levels(pw, marks) {
    const db = p => +(10 * Math.log10(p + 1e-12)).toFixed(1), M = Object.entries(marks);
    const span = (k, m) => (k.startsWith('ev-') ? Math.min(3, ...M.filter(([, n]) => n > m).map(([, n]) => n - m - 0.1)) : 1);
    const free = pw.filter(w => w.t >= 3 && !M.some(([k, m]) => w.t + 0.5 > m - 0.1 && w.t < m + Math.max(2.2, span(k, m) + 0.2)));
    const ev = {};
    for (const [k, m] of M) { const e = span(k, m), ws = pw.filter(w => w.t + 0.5 > m && w.t < m + e); if (ws.length) ev[k] = db(Math.max(...ws.map(w => w.p))); }
    const mean = vs => (vs.length ? db(vs.reduce((a, v) => a + Math.pow(10, v / 10), 0) / vs.length) : null);
    const bed = free.length ? db(free.reduce((a, w) => a + w.p, 0) / free.length) : null, contrast = {};
    if (bed != null && bed > -60) for (const [k, v] of Object.entries(ev)) if (k.startsWith('ev-')) contrast[k] = +(v - bed).toFixed(1);
    return { bed, events: ev, eventsMean: mean(Object.values(ev)), contrast,
      main: mean(['meow', 'hint', 'chime', 'fanfare'].filter(k => k in ev).map(k => ev[k])) }; // (the game's own events: the -16 dB ones)
  }
  // every painting: its bed alone, its bed + music, the game's events over it, each painting event once
  async function allScenes(sec, o) {
    const out = {};
    for (const amb of Object.keys(SCENES)) {
      const q = { ...o, scene: amb }, sub = {};
      const bed = await selfTest(Math.min(sec, 12), 'amb', q), mix = await selfTest(Math.min(sec, 12), 'amb,music', q);
      // the painting events: over the bed (for the peaks), and alone (their own level: a bed with bursts of its
      // own, the river's laps, would otherwise be read as the event), with their contrast over the bed alone
      const evSec = Math.max(6, 1.5 + (testEvents(sceneByName(amb), o.samples === false).length + (SCENES[amb].preload || []).length) * 3.5 + 2), evs = await selfTest(Math.max(sec, 14), 'amb,music,events', q);
      const pev = SCENES[amb].ev.length ? await selfTest(evSec, 'amb,sceneev', q) : null, solo = pev ? await selfTest(evSec, 'sceneev', q) : null;
      sub.bed = bed.levels.bed; sub.bedMusic = mix.levels.bed; sub.events = evs.levels.main; sub.eventsAll = evs.levels.eventsMean; sub.eventsBy = evs.levels.events;
      sub.sceneEvents = solo ? solo.levels.events : {}; sub.sceneContrast = {};
      if (sub.bed != null) for (const [k, v] of Object.entries(sub.sceneEvents)) sub.sceneContrast[k] = +(v - sub.bed).toFixed(1);
      sub.peak = Math.max(bed.peak, mix.peak, evs.peak, pev ? pev.peak : 0); sub.clipped = bed.clipped + mix.clipped + evs.clipped + (pev ? pev.clipped : 0);
      sub.nan = bed.nan + mix.nan + evs.nan + (pev ? pev.nan + solo.nan : 0); sub.errs = bed.stats.errs + mix.stats.errs + evs.stats.errs + (pev ? pev.stats.errs + solo.stats.errs : 0);
      sub.bedSample = SCENES[amb].bed ? (SMP.e.has(SCENES[amb].bed) && o.samples !== false ? SMP.e.get(SCENES[amb].bed).seam : 'synth') : 'synth';
      sub.silent = [bed, mix, evs, pev, solo].some(x => x && x.silent);
      sub.ok = sub.peak < TARGET.peak && !sub.nan && !sub.silent && Math.abs(sub.bedMusic - TARGET.bed) <= 3 && Math.abs(sub.events - TARGET.events) <= 3;
      out[amb] = sub;
      if (!S.testing) releaseExcept(S.sc); // (one bed at a time in memory)
    }
    return { target: TARGET, scenes: out, samples: smpInfo(), stats: { bank: bankInfo() } };
  }
  function bankInfo() { return { done: BANK.done, groups: BANK.groups, ms: Math.round(BANK.ms), mb: +(BANK.bytes / 1048576).toFixed(1), fails: BANK.fails, bad: BANK.bad }; }
  function smpInfo() {
    const st = {};
    for (const v of SMP.st.values()) st[v] = (st[v] || 0) + 1;
    const bed = S.sc && S.sc.def.bed;
    return { bundle: bundle() ? Object.keys(bundle()).length : 0, decoded: SMP.n, mb: +(SMP.bytes / 1048576).toFixed(2), ms: Math.round(SMP.ms), fails: SMP.fails, states: st,
      bed: bed ? (S.g && S.g.bed ? 'playing' : SMP.st.get(bed) || (smpNames(bed).length ? 'not asked' : 'none')) : null,
      seam: bed && SMP.e.get(bed) ? SMP.e.get(bed).seam : null };
  }

  // ---- test hooks: break the chain on purpose and let the watchdog mend it; switch paintings
  const _test = {
    poison() { // one NaN into the ambience bus: the muffler biquad stays NaN for ever
      const G = S.g; if (!G) return false;
      const b = S.ctx.createBuffer(1, 128, S.ctx.sampleRate); b.getChannelData(0)[5] = NaN;
      const s = S.ctx.createBufferSource(); s.buffer = b; s.connect(G.amb); s.start(); return true;
    },
    silence() { const G = S.g; if (!G) return false; try { G.comp.disconnect(); } catch { /* */ } return true; },
    stall() { WD.rate = 0.1; stalled(S.ctx); return true; }, // (as if a stalled window had just been measured)
    overload() { const a = WD.liteAt; WD.liteAt = -1e9; overload('test'); if (WD.liteAt === -1e9) WD.liteAt = a; return S.lite; }, // (as if dropouts had just been measured)
    relax(ms = 0) { WD.liteAt = performance.now() - WD.liteHold - ms; relax(); return S.lite; }, // (as if 3 quiet minutes had passed)
    // play another painting's sound here (ambience name, or null for the gallery's silence)
    scene(amb, music) { setScene(amb ? { audio: { ambience: amb, music }, night: SCENES[amb] ? SCENES[amb].night : true } : null); return S.sc ? S.sc.amb : null; },
    nosmp(on = true) {
      S.nosmp = !!on;
      if (S.g && S.started) { stopLayers(S.g, true); S.crickets = S.crickets.filter(k => !k.alt); startLayers(now()); if (bedState(S.sc) === 'none') standIn(now()); }
      return S.nosmp;
    },
    voices() { const n = {}; if (S.g) for (const v of S.g.voices) n[v.kind] = (n[v.kind] || 0) + 1; return n; }, // (claimed, not yet swept)
    flock: () => flock(), // the crows' nearness {k, pan} from the camera as it stands
    place: (name, ref, at) => placeOf(name, ref, at), // where a painting's named sound is heard from (layout.sounds[name], …, else `at`), or null
    stepKind: s => stepKind(s), // the footstep a surfaceAt() name plays in this painting
    cats: () => ({ found: CATV.found.map(c => c.name), voices: CATV.found.map(c => +voiceOf(c).rate.toFixed(3)), cur: !!catNow() }), // (the cats' voices, in the order found)
    sample(name) { const e = SMP.e.get(name); return e ? { ...e, buf: undefined, channels: e.buf.numberOfChannels, length: e.buf.length } : SMP.st.get(name) || null; },
    buffer(name) { const e = SMP.e.get(name); return e ? e.buf : null; },
    fail(name) { release(name); SMP.st.set(name, 'fail'); SMP.fails++; if (S.g && S.g.bed && S.g.bed.name === name) { stopLayers(S.g, true); startLayers(now()); } else safe('sample', () => onSample(name, false)); return true; },
  };

  return {
    unlock, update, setMuted, muffle, meow, chime, farMeow, found, hint, fanfare, footstep, land, click, miss, selfTest, chirp: mrrp, pet: mrrp, near,
    step, bellStroke, hushBell, rollCall, play, caw, setScene, _test, _wire: wire,
    get muted() { return S.muted; }, get state() { return S.ctx ? S.ctx.state : 'none'; }, get ctx() { return S.ctx; },
    get scene() { return S.sc ? { ambience: S.sc.amb, music: S.sc.music, bell: S.sc.bell } : null; },
    get stats() {
      const G = S.g, c = S.ctx;
      return { state: c ? c.state : 'none', rate: +WD.rate.toFixed(3), peak: +WD.pk.toFixed(4), live: G ? G.voices.filter(v => c && v.t <= c.currentTime).length : 0,
        pending: G ? G.voices.filter(v => c && v.t > c.currentTime).length : 0, buses: G ? [...G.pans.values()].reduce((n, m) => n + m.size, 0) : 0,
        ...S.stats, heals: S.heals, lite: S.lite, dropouts: +WD.und.toFixed(4), backoff: WD.backoff / 1000, reopen: S.reopen, revive: S.revive, bank: bankInfo(), sampleRate: c ? c.sampleRate : 0, baseLatency: c ? c.baseLatency : 0,
        tickAge: Math.round(performance.now() - S.lastTick), chordIn: c ? +(S.nextChord - c.currentTime).toFixed(2) : null,
        scene: S.sc ? S.sc.amb : null, music: S.mus.id, wind: G && G.wind ? windNow() : 0, out: !!S.out, bed: G && G.bed ? G.bed.name : null, bedSeeks: G && G.bed ? G.bed.seeks : 0, hum: +finite(S.hum).toFixed(1), crowCaws: CROW.n, samples: smpInfo() };
    },
  };
})();

(window.SN_MODULES ||= []).push({
  name: 'audio', order: 4, shell: true,
  build(sn) {
    SN = sn;
    SN.audio = audio;
    audio._wire(); // (which cat a mew, trill or call belongs to)
    // the painting's sound follows the painting: chosen as it loads, silent in the gallery
    SN.on('levelLoading', d => audio.setScene((d && d.level) || SN.level));
    SN.on('gallery', () => audio.setScene(null));
    if (SN.level) audio.setScene(SN.level);
    if (SN.test && typeof SN.test === 'object') SN.test.audioScenes = (sec = 12) => audio.selfTest(sec, 'all');
    return audio;
  },
});