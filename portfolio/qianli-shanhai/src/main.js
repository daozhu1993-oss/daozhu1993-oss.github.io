import { audio } from './audio.js';
import { BEASTS, beastById } from './data/beasts.js';
import { SaveStore } from './save/SaveStore.js';
import { ScrollWorld } from './world/ScrollWorld.js';
import { FreeCamera } from './world/FreeCamera.js';
import { ClueSystem } from './clue/ClueSystem.js';
import { HintDirector } from './clue/HintDirector.js';
import { FlowTrace } from './game/challenges/FlowTrace.js';
import { Chrome } from './ui/Chrome.js';
import { Album } from './ui/Album.js';
import { Overlay } from './fx/Overlay.js';
import { asset, clamp, tryImage, worldToScreen } from './util.js';

const params = new URLSearchParams(location.search);
const save = new SaveStore();
if (params.has('fresh')) save.clear();

const fuzhu = beastById('fuzhu');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;

const viewport = document.getElementById('viewport-3d');
const fx = document.getElementById('fx-canvas');
const ui = document.getElementById('ui-layer');
const ctx = fx.getContext('2d');

const world = new ScrollWorld(viewport);
const camera = new FreeCamera();
const chrome = new Chrome(ui);
const overlay = new Overlay();
const clue = new ClueSystem(fuzhu);
const hint = new HintDirector(fuzhu.quote);

const art = {
  fenben: null,
  mist: null,
  resident: null,
  resident2: null,
  album: null,
  rock: null,
  fall: null,
  residentFrame(time) {
    if (this.resident2 && Math.floor(time * 1.4) % 2 === 1) return this.resident2;
    return this.resident || this.mist || this.fenben;
  },
};

let phase = 'loading';
let introT = 0;
let pointer = { x: -999, y: -999, on: false };
let flow = null;
let album = null;
let chimePan = 0;
let heardWelcome = false;
let chimeSilence = 0;
let lastClueDist = null;
let guidePanned = false;
const gotoFuzhu = params.get('goto') === 'fuzhu';

const row0 = save.beast('fuzhu');
clue.tier = row0.clue || 0;
hint.clueTier = clue.tier;
if (save.data.settings.sound === 0) {
  audio.toggleMute();
  chrome.setMuted(true);
}

function viewSize() {
  return { w: window.innerWidth, h: window.innerHeight };
}

function resize() {
  const { w, h } = viewSize();
  const pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
  world.resize(w, h);
  camera.resize(w, h);
  fx.width = Math.round(w * pr);
  fx.height = Math.round(h * pr);
  fx.style.width = `${w}px`;
  fx.style.height = `${h}px`;
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
  flow?.resize(w, h);
}

function screenOfBeast() {
  const { w, h } = viewSize();
  return worldToScreen(fuzhu.x * camera.worldW, fuzhu.y, camera, w, h);
}

function applySavedCamera() {
  const cam = save.data.cam || {};
  camera.zoom = clamp(cam.z || camera.roamZoom(), camera.overviewZoom(), camera.enterZoom());
  camera.x = clamp((cam.x ?? 0.9) * camera.worldW, 0, camera.worldW);
  camera.y = cam.y ?? 0.5;
  camera._clampHard();
}

function fadeWidth() {
  const screenFrac = (camera.aspect / camera.roamZoom()) / camera.worldW;
  // A roam frame centred on the beast should show grey silk on either side of the coloured stretch.
  return 0.22 * screenFrac;
}

function syncRestore(animate) {
  const half = (fuzhu.span[1] - fuzhu.span[0]) / 2;
  const fade = fadeWidth();
  if (animate) world.restoration.animateBump('fuzhu', fuzhu.x, half, fade);
  else if (save.beast('fuzhu').woke) world.restoration.setBump('fuzhu', fuzhu.x, half, fade, 1);
}

function setPhase(next) {
  phase = next;
  const playing = next === 'play';
  camera.enabled = playing;
  fx.classList.toggle('live', next === 'challenge');
  document.body.classList.toggle('playing', playing);
  document.body.classList.toggle('challenge', next === 'challenge' || next === 'entering');
  if (next !== 'challenge') chrome.setGhost(false);
}

function persistCamera() {
  save.data.cam = {
    x: camera.x / camera.worldW,
    y: camera.y,
    z: camera.zoom,
  };
  save.write();
}

function beginPlayFromSave() {
  world.setRevealEdge(0);
  world.setBaseSat(0.4);
  applySavedCamera();
  syncRestore(false);
  setPhase('play');
  chrome.setIntro('');
}

function skipIntro() {
  if (phase === 'loading' || phase === 'play' || phase === 'challenge' || phase === 'album') return;
  camera.focus = null;
  save.data.onboarded = true;
  world.setRevealEdge(0);
  world.setBaseSat(0.4);
  camera.zoom = camera.roamZoom();
  camera.x = camera.worldW * 0.9;
  camera._clampHard();
  save.write();
  setPhase('play');
  chrome.setIntro('');
}

function releaseGuide() {
  if (phase !== 'guide') return;
  camera.focus = null;
  save.data.onboarded = true;
  save.write();
  chrome.setIntro('');
  setPhase('play');
}

function arriveAtFuzhu() {
  camera.focus = null;
  save.data.onboarded = true;
  world.setRevealEdge(0);
  world.setBaseSat(0.4);
  clue.tier = Math.max(clue.tier, 2);
  const row = save.beast('fuzhu');
  row.found = true;
  row.clue = Math.max(row.clue || 0, 2);
  save.write();
  setPhase('play');
  chrome.setIntro('');
  camera.focusTo(0.680 * camera.worldW, 0.42, 2.2, reduced ? 0.25 : 1.3);
}

function startChallenge() {
  if (phase === 'challenge' || phase === 'entering' || album?.openNow) return;
  if (save.beast('fuzhu').woke && phase !== 'play') return;
  audio.ensureContext();
  const row = save.beast('fuzhu');
  row.found = true;
  row.clue = 3;
  clue.tier = 3;
  save.write();
  setPhase('entering');
  world.setDim(1);
  const dur = reduced ? 0.35 : 1.6;
  camera.focusTo(0.680 * camera.worldW, 0.37, 2.4, dur, () => {
    const { w, h } = viewSize();
    flow = new FlowTrace({
      audio,
      coarse,
      reduced,
      deer: art.mist || art.resident,
      onWin: (result) => finishChallenge(result),
      onFail: () => { world.setFlash(0.55); },
      onAssist: (on) => chrome.setGhost(on && (phase === 'challenge')),
    });
    flow.camera = camera;
    flow.resize(w, h);
    camera.enabled = false;
    setPhase('challenge');
    chrome.showTitle();
    chrome.showTurn(camera.portrait);
    chrome.setBrush({ visible: false });
  });
}

function finishChallenge(result) {
  save.commitClear('fuzhu', result);
  camera.enabled = true;
  world.setDim(0);
  syncRestore(true);
  audio.setFlow(0, 0);
  setPhase('play');
  chrome.showTurn(false);
  chrome.setGhost(false);
  flow = null;
  camera.focusTo(fuzhu.x * camera.worldW, 0.5, camera.roamZoom(), reduced ? 0.4 : 1.1, () => {
    openAlbum(2);
  });
}

function leaveChallenge() {
  if (phase !== 'challenge' && phase !== 'entering') return;
  const row = save.beast('fuzhu');
  row.found = true;
  row.clue = Math.max(row.clue, 3);
  save.write();
  world.setDim(0);
  camera.enabled = true;
  audio.setFlow(0, 0);
  flow = null;
  chrome.showTurn(false);
  chrome.setGhost(false);
  setPhase('play');
  camera.focusTo(fuzhu.x * camera.worldW, 0.5, camera.roamZoom(), 0.6);
}

function openAlbum(index) {
  if (!album) return;
  setPhase('album');
  chrome.setBrush({ visible: false });
  album.open(save, index);
}

function closeAlbum() {
  if (phase === 'album') setPhase('play');
}

album = new Album(ui, {
  art,
  onClose: closeAlbum,
  onRetry: () => {
    album.close();
    startChallenge();
  },
  onReset: () => {
    save.clear();
    location.reload();
  },
});

camera.onTap = ({ x, y }) => {
  if (phase !== 'play' || save.beast('fuzhu').woke) return;
  const { w, h } = viewSize();
  const hot = overlay.hotspot(camera, w, h, fuzhu);
  if (clueState?.canEnter && Math.hypot(x - hot.x, y - hot.y) <= hot.r) startChallenge();
};
camera.onHoldChange = () => {};

let clueState = null;

camera.attach(viewport);

window.addEventListener('pointerdown', (e) => {
  pointer.on = true;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  const onChrome = e.target === chrome.soundBtn || e.target === chrome.albumBtn;
  if (!onChrome) {
    audio.unlock().then((ok) => {
      if (ok && !heardWelcome && !audio.isMuted) {
        heardWelcome = true;
        chimeSilence = 0;
        audio.playQing(0, 0.16);
      }
      refreshSoundHint();
    });
  }
  // The tap that starts sound must not skip 展卷. Once the line can be read, a tap on the painting hands the scroll back.
  if (phase === 'guide' && introT > 2.2 && !onChrome) releaseGuide();
}, { capture: true });
window.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  if (phase === 'challenge' && flow && e.target === fx) flow.pointerMove(e.clientX, e.clientY);
});
window.addEventListener('pointerup', () => { pointer.on = false; });
fx.addEventListener('pointerdown', (e) => {
  if (phase !== 'challenge' || !flow) return;
  e.preventDefault();
  e.stopPropagation();
  flow.pointerDown(e.clientX, e.clientY);
});
fx.addEventListener('pointerup', (e) => {
  if (phase === 'challenge') flow?.pointerUp();
});

window.addEventListener('keydown', (e) => {
  audio.ensureContext();
  if (e.code === 'Escape') {
    if (album?.openNow) album.close();
    else leaveChallenge();
  }
  if (e.code === 'KeyB') {
    if (album?.openNow) album.close();
    else if (phase === 'play') openAlbum(save.beast('fuzhu').woke ? 2 : 0);
  }
  if (e.code === 'KeyH' && phase === 'play') hint.poke();
  if (e.code === 'Enter' && phase === 'play' && clueState?.canEnter && !save.beast('fuzhu').woke) startChallenge();
  if (phase === 'challenge') flow?.key(e.code, true);
  if (album?.openNow && e.code === 'ArrowLeft') album.turn(-1);
  if (album?.openNow && e.code === 'ArrowRight') album.turn(1);
  if (phase === 'guide' && (e.code === 'Space' || e.code === 'Enter')) releaseGuide();
  if (phase === 'unroll' || phase === 'desat' || phase === 'listen') {
    if (e.code === 'Space' || e.code === 'Enter') skipIntro();
  }
});
window.addEventListener('keyup', (e) => flow?.key(e.code, false));

chrome.albumBtn.addEventListener('click', () => {
  audio.ensureContext();
  if (album.openNow) album.close();
  else if (phase === 'play' || phase === 'album') openAlbum(save.beast('fuzhu').woke ? 2 : 0);
});
chrome.soundBtn.addEventListener('click', () => {
  audio.unlock().then((ok) => {
    if (!ok) {
      refreshSoundHint();
      return;
    }
    if (!heardWelcome) {
      audio.setMuted(false);
      heardWelcome = true;
      chimeSilence = 0;
      audio.playQing(0, 0.16);
      chrome.setMuted(false);
      save.data.settings.sound = 1;
      save.write();
      refreshSoundHint();
      return;
    }
    const muted = audio.toggleMute();
    chrome.setMuted(muted);
    save.data.settings.sound = muted ? 0 : 1;
    save.write();
    refreshSoundHint();
  });
});

function refreshSoundHint() {
  const quiet = !audio.running() || audio.isMuted;
  const show = quiet && phase !== 'loading' && phase !== 'unroll' && phase !== 'desat';
  chrome.setSoundHint(show);
}
chrome.ghostBtn.addEventListener('click', () => flow?.requestGhost());

window.addEventListener('pagehide', persistCamera);
window.addEventListener('resize', resize);

let last = performance.now();
let saveIn = 2;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const { w, h } = viewSize();

  if (phase === 'unroll' || phase === 'desat' || phase === 'guide' || phase === 'listen') stepIntro(dt);
  camera.update(dt);
  overlay.update(dt);
  chrome.tick(dt);

  const woke = save.beast('fuzhu').woke;
  if (phase === 'play' && !woke) {
    clueState = clue.update(dt, camera, audio.isMuted);
    if (clueState.tier !== save.beast('fuzhu').clue) {
      save.beast('fuzhu').clue = clueState.tier;
      save.write();
    }
    hint.noteTier(clueState.tier);
    const guide = hint.update(dt);
    chrome.setOracle(guide.oracle, guide.oracleAlpha);
    const spot = screenOfBeast();
    const dist = clueState.dist ?? Math.hypot(fuzhu.x * camera.worldW - camera.x, fuzhu.y - camera.y);
    const closing = lastClueDist == null ? 0 : (lastClueDist - dist) / Math.max(dt, 0.016);
    lastClueDist = dist;
    const approach = clamp(closing / 1.1, 0, 1);
    const nearBeast = clueState.closeness || 0;
    chimePan = clamp((spot.x / w * 2 - 1) * 1.35, -1, 1);
    const gain = (0.16 + nearBeast * 0.28 + approach * 0.14) * guide.soundBoost;
    if (heardWelcome && !audio.isMuted) {
      audio.setClue(0.35 + nearBeast * 0.65 + approach * 0.25, chimePan);
      if (clueState.chime) {
        audio.playQing(chimePan, gain);
        chimeSilence = 0;
      } else {
        chimeSilence += dt;
        if (chimeSilence >= 8) {
          audio.playQing(chimePan, gain);
          chimeSilence = 0;
        }
      }
    } else {
      audio.setClue(0, chimePan);
    }
    const near = 1 - clamp(Math.hypot(spot.x - pointer.x, spot.y - pointer.y) / (w * 0.75), 0, 1);
    const angle = Math.atan2(spot.y - pointer.y, spot.x - pointer.x);
    const brushX = pointer.x > 0 ? pointer.x : w * 0.62;
    const brushY = pointer.y > 0 ? pointer.y : h * 0.58;
    const showBrush = guide.warmth || (!coarse && pointer.x > 0);
    chrome.setBrush({
      x: brushX,
      y: brushY,
      visible: showBrush,
      warmth: guide.warmth,
      angle,
      near,
    });
    sceneInk = guide.ink;
    sceneMark = guide.mark && !clueState.canEnter;
  } else if (phase === 'play' && woke) {
    chrome.setOracle('', 0);
    chrome.setBrush({
      x: pointer.x,
      y: pointer.y,
      visible: !coarse && pointer.x > 0,
      warmth: 0,
      angle: 0,
      near: 0,
    });
    const spot = screenOfBeast();
    const onScreen = spot.x > -80 && spot.x < w + 80;
    const dist = Math.hypot(fuzhu.x * camera.worldW - camera.x, fuzhu.y - camera.y);
    audio.setRegionWater(onScreen ? clamp(1 - dist / (camera.visibleWidth() * 1.4), 0, 1) : 0);
    audio.setClue(0, 0);
    sceneInk = false;
    sceneMark = false;
    clueState = { canEnter: false };
  } else {
    clueState = clueState || { canEnter: false };
  }

  if (phase === 'challenge') flow?.update(dt);
  world.update(dt, camera);

  const restore = world.restoration.sample(fuzhu.x);
  overlay.draw(ctx, w, h, {
    camera,
    beast: fuzhu,
    art,
    restore,
    mist: Boolean(clueState?.mist) && phase === 'play' && !woke,
    mark: sceneMark && phase === 'play' && !woke,
    canEnter: Boolean(clueState?.canEnter) && phase === 'play' && !woke,
    woke: woke && phase !== 'challenge' && phase !== 'entering',
    ink: sceneInk && phase === 'play',
    challenge: phase === 'challenge' ? flow : null,
  });

  refreshSoundHint();
  saveIn -= dt;
  if (saveIn <= 0 && phase === 'play') {
    persistCamera();
    saveIn = 2.5;
  }
  requestAnimationFrame(frame);
}

let sceneInk = false;
let sceneMark = false;

function stepIntro(dt) {
  introT += dt;
  const line = '政和三年，希孟年十八岁。';
  if (phase === 'unroll') {
    const dur = reduced ? 0.45 : 2.4;
    const u = clamp(introT / dur, 0, 1);
    world.setRevealEdge(0.97 * (1 - u));
    const right = camera.worldW - camera.visibleWidth() / 2;
    camera.x = right - camera.visibleWidth() * 0.85 * u;
    camera.zoom = camera.roamZoom();
    chrome.setIntro(line.slice(0, Math.ceil(u * line.length)));
    if (u >= 1) {
      phase = 'desat';
      introT = 0;
    }
    return;
  }
  if (phase === 'desat') {
    const dur = reduced ? 0.35 : 1.6;
    const u = clamp(introT / dur, 0, 1);
    world.setBaseSat(1 - 0.6 * u);
    world.setRevealEdge(0);
    chrome.setIntro('');
    if (u >= 1) {
      phase = 'guide';
      introT = 0;
      guidePanned = false;
    }
    return;
  }
  if (phase === 'guide') {
    if (reduced) {
      const alpha = introT < 0.6 ? introT / 0.6 : introT < 2.8 ? 1 : Math.max(0, 1 - (introT - 2.8) / 1.1);
      chrome.setIntro(alpha > 0.04 ? '循声而往 · 悬瀑' : '', alpha);
      if (introT >= 4) releaseGuide();
      return;
    }
    if (!guidePanned) {
      guidePanned = true;
      const from = camera.x;
      const goal = fuzhu.x * camera.worldW;
      camera.focusTo(from + (goal - from) * 0.42, 0.5, camera.roamZoom(), 18, () => releaseGuide());
    }
    const alpha = introT < 1.1 ? introT / 1.1 : introT < 5.4 ? 1 : Math.max(0, 1 - (introT - 5.4) / 2.2);
    chrome.setIntro(alpha > 0.04 ? '循声而往 · 悬瀑' : '', alpha);
  }
}

async function boot() {
  resize();
  const paint = world.load();
  const images = (async () => {
    let slots = {};
    try {
      slots = await fetch(asset('beasts/fuzhu/slots.json')).then((r) => r.json());
    } catch { /* slots stay empty */ }
    const loadSlot = (key) => (slots[key] ? tryImage(asset(`beasts/fuzhu/${slots[key]}`)) : null);
    const [fenben, mist, resident, resident2, albumImg, rock, fall] = await Promise.all([
      loadSlot('fenben'), loadSlot('mist'), loadSlot('resident'), loadSlot('resident2'),
      loadSlot('album'), loadSlot('rock'), loadSlot('fall'),
    ]);
    return [fenben, mist, resident, resident2, albumImg, rock, fall];
  })();
  let shown = 0.15;
  const pulse = setInterval(() => {
    shown = Math.min(0.9, shown + 0.04);
    chrome.setLoad(shown);
  }, 80);
  try {
    const dims = await paint;
    camera.setWorld(dims.worldW, dims.worldH);
    resize();
    const [fenben, mist, resident, resident2, albumImg, rock, fall] = await images;
    Object.assign(art, { fenben, mist, resident, resident2, album: albumImg, rock, fall });
  } finally {
    clearInterval(pulse);
    chrome.setLoad(1);
  }
  chrome.hideVeil();
  if (gotoFuzhu) arriveAtFuzhu();
  else if (save.data.onboarded) beginPlayFromSave();
  else {
    phase = 'unroll';
    camera.enabled = false;
    introT = 0;
    world.setBaseSat(1);
    world.setRevealEdge(0.97);
    camera.zoom = camera.roamZoom();
    camera.x = camera.worldW - camera.visibleWidth() / 2;
    camera.y = 0.5;
  }
  requestAnimationFrame(frame);
}

window.qianli = {
  save,
  camera,
  world,
  clue,
  hint,
  audio,
  skipIntro,
  startChallenge,
  leaveChallenge,
  openAlbum: () => openAlbum(2),
  get phase() { return phase; },
  get flow() { return flow; },
  beastById,
  BEASTS,
};

boot().catch((err) => {
  console.error(err);
  chrome.setIntro('画卷没有展开');
});
