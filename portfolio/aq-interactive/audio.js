/**
 * 未庄 · 绍兴水乡动态环境声景系统 (Web Audio API Procedural Soundscape)
 * 采用原生 Web Audio API 程序化合成，无需庞大外部音频资源，提供水乡晚风、酒肆人声、土谷残香、深宅更鼓等沉浸声景。
 */

export class WeizhuangAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.currentScene = 'shrine';
    this.masterGain = null;
    this.sceneGain = null;
    this.sfxGain = null;
    this.ambientGenerators = new Map();
    this.isInitialized = false;
    this.periodicTimers = [];
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.enabled ? 0.8 : 0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sceneGain = this.ctx.createGain();
      this.sceneGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.sceneGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.isInitialized = true;
      this._setupSceneAmbience(this.currentScene);
    } catch (e) {
      console.warn('Web Audio initialization skipped:', e);
    }
  }

  ensureContext() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.ensureContext();
    this.enabled = !this.enabled;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(this.enabled ? 0.8 : 0, now + 0.3);
    }
    return this.enabled;
  }

  setScene(sceneName) {
    if (this.currentScene === sceneName && this.ambientGenerators.size > 0) return;
    this.currentScene = sceneName;
    if (!this.isInitialized) return;
    this._crossfadeScene(sceneName);
  }

  _crossfadeScene(sceneName) {
    if (!this.ctx || !this.sceneGain) return;
    const now = this.ctx.currentTime;
    
    this.sceneGain.gain.cancelScheduledValues(now);
    this.sceneGain.gain.linearRampToValueAtTime(0.01, now + 0.4);

    setTimeout(() => {
      this._stopAllAmbience();
      this._setupSceneAmbience(sceneName);
      if (this.ctx && this.sceneGain) {
        const nextNow = this.ctx.currentTime;
        this.sceneGain.gain.cancelScheduledValues(nextNow);
        this.sceneGain.gain.linearRampToValueAtTime(1.0, nextNow + 0.6);
      }
    }, 450);
  }

  _stopAllAmbience() {
    this.periodicTimers.forEach(t => clearInterval(t));
    this.periodicTimers = [];

    this.ambientGenerators.forEach((gen) => {
      try {
        if (gen.gainNode) {
          gen.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
          gen.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        if (gen.nodes) {
          gen.nodes.forEach(n => {
            if (n.stop) n.stop();
            n.disconnect();
          });
        }
      } catch (e) {}
    });
    this.ambientGenerators.clear();
  }

  _createNoiseBuffer(type = 'pink') {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else if (type === 'brown') {
        b0 = (b0 + (0.02 * white)) / 1.02;
        data[i] = b0 * 3.5;
      } else {
        data[i] = white * 0.2;
      }
    }
    return buffer;
  }

  _setupSceneAmbience(scene) {
    if (!this.ctx || !this.isInitialized) return;

    if (scene === 'shrine') {
      this._createWindAmbience(180, 0.22, 0.08);
      this._createEmberCrackles(0.04);
    } else if (scene === 'tavern') {
      this._createTavernCrowdMurmur(0.35);
      this._createSteamHiss(0.07);
      const timer = setInterval(() => {
        if (Math.random() < 0.65) this.playTavernClink();
      }, 4800);
      this.periodicTimers.push(timer);
    } else if (scene === 'lane') {
      this._createWindAmbience(320, 0.28, 0.12);
      this._createLeavesDrift(0.05);
      const timer = setInterval(() => {
        if (Math.random() < 0.35) this.playFarDogBark();
      }, 9500);
      this.periodicTimers.push(timer);
    } else if (scene === 'zhao') {
      this._createFeudalDrone(65, 0.26);
      const timer = setInterval(() => {
        if (Math.random() < 0.5) this.playNightGong();
      }, 7000);
      this.periodicTimers.push(timer);
    }
  }

  _createWindAmbience(cutoff = 220, resonance = 0.2, volume = 0.1) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer('brown');
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.18, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(cutoff * 0.45, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sceneGain);

    noise.start();
    lfo.start();

    this.ambientGenerators.set('wind', { nodes: [noise, lfo, filter, lfoGain, gain], gainNode: gain });
  }

  _createEmberCrackles(volume = 0.05) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer('pink');
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, this.ctx.currentTime);
    filter.Q.setValueAtTime(6.0, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sceneGain);
    noise.start();

    this.ambientGenerators.set('ember', { nodes: [noise, filter, gain], gainNode: gain });
  }

  _createTavernCrowdMurmur(volume = 0.25) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer('pink');
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.32, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(120, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sceneGain);

    noise.start();
    lfo.start();

    this.ambientGenerators.set('tavern_murmur', { nodes: [noise, filter, lfo, lfoGain, gain], gainNode: gain });
  }

  _createSteamHiss(volume = 0.06) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer('pink');
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(4800, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sceneGain);
    noise.start();

    this.ambientGenerators.set('steam', { nodes: [noise, filter, gain], gainNode: gain });
  }

  _createLeavesDrift(volume = 0.05) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer('pink');
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.2, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sceneGain);
    noise.start();

    this.ambientGenerators.set('leaves', { nodes: [noise, filter, gain], gainNode: gain });
  }

  _createFeudalDrone(freq = 65, volume = 0.22) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 1.5, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.sceneGain);

    osc.start();
    osc2.start();

    this.ambientGenerators.set('zhao_drone', { nodes: [osc, osc2, filter, gain], gainNode: gain });
  }

  // --- Dynamic SFX ---
  playTavernClink() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const pitch = 2100 + (Math.random() * 400 - 200);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.95, now + 0.35);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  playNightGong() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(82, now + 1.8);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(165, now);
    osc2.frequency.exponentialRampToValueAtTime(120, now + 1.4);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 1.9);
    osc2.stop(now + 1.9);
  }

  playFarDogBark() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.12);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, now);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  playSealStamp() {
    this.ensureContext();
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.14);

    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playBrushStroke() {
    this.ensureContext();
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer('pink');

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.linearRampToValueAtTime(2400, now + 0.28);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.32);
  }

  playPsycheVictory() {
    this.ensureContext();
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const notes = [392.00, 440.00, 523.25, 659.25, 783.99];

    notes.forEach((freq, i) => {
      const noteTime = now + i * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.15, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.28);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.3);
    });
  }

  playConflictHit() {
    this.ensureContext();
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, now);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }
}

export const audioManager = new WeizhuangAudio();
