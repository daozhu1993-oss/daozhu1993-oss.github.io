/**
 * 《千里江山 · 借笔还魂》纯代码 WebAudio 中国传统五声与空间声景引擎
 * 包含：古琴散音/泛音合成、编钟石磬、脚步轻响、涟漪水波、提笔落墨轮指、摇橹行舟、
 *       以及基于玩家位置的 3D 距离感应空间声景（飞瀑轰鸣、江水微澜、山风松涛、细雨沙沙）
 */

class ChineseAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;
    this.masterGain = null;
    this.ambientGain = null;

    // 空间声景独立音轨增益节点
    this.windGain = null;
    this.waterGain = null;
    this.waterfallGain = null;
    this.rainGain = null;
    this.noiseBuffer = null;
    this._lastStepTime = 0;

    // 中国古乐五声音阶（以宫为C，商D，角E，徵G，羽A）
    this.pentatonicFrequencies = {
      'GONG_2': 130.81, 'SHANG_2': 146.83, 'JUE_2': 164.81, 'ZHI_2': 196.00, 'YU_2': 220.00,
      'GONG_3': 261.63, 'SHANG_3': 293.66, 'JUE_3': 329.63, 'ZHI_3': 392.00, 'YU_3': 440.00,
      'GONG_4': 523.25, 'SHANG_4': 587.33, 'JUE_4': 659.25, 'ZHI_4': 783.99, 'YU_4': 880.00,
      'GONG_5': 1046.50, 'SHANG_5': 1174.66, 'JUE_5': 1318.51, 'ZHI_5': 1567.98, 'YU_5': 1760.00
    };

    this.notesList = [
      130.81, 146.83, 164.81, 196.00, 220.00,
      261.63, 293.66, 329.63, 392.00, 440.00,
      523.25, 587.33, 659.25, 783.99, 880.00
    ];
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.72, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.32, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);

      this._initAmbientNoise();
      this.isInitialized = true;
    } catch (e) {
      console.warn('[Audio] WebAudio context init delayed:', e);
    }
  }

  ensureContext() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.72, this.ctx.currentTime, 0.08);
    }
    return this.isMuted;
  }

  _initAmbientNoise() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    // 柔化粉红噪声近似
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      output[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.18) * 1.4));
    }
    this.noiseBuffer = noiseBuffer;

    // 1. 松涛山风 (Wind)
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(340, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(2.4, this.ctx.currentTime);

    const windLFO = this.ctx.createOscillator();
    windLFO.frequency.setValueAtTime(0.11, this.ctx.currentTime);
    const windLFOGain = this.ctx.createGain();
    windLFOGain.gain.setValueAtTime(135, this.ctx.currentTime);
    windLFO.connect(windLFOGain);
    windLFOGain.connect(windFilter.frequency);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.14, this.ctx.currentTime);

    windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.ambientGain);
    windSource.start();
    windLFO.start();

    // 2. 江水潺潺 (River / Stream)
    const waterSource = this.ctx.createBufferSource();
    waterSource.buffer = noiseBuffer;
    waterSource.loop = true;

    const waterFilter = this.ctx.createBiquadFilter();
    waterFilter.type = 'lowpass';
    waterFilter.frequency.setValueAtTime(720, this.ctx.currentTime);

    this.waterGain = this.ctx.createGain();
    this.waterGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    waterSource.connect(waterFilter);
    waterFilter.connect(this.waterGain);
    this.waterGain.connect(this.ambientGain);
    waterSource.start();

    // 3. 悬瀑轰鸣 (Waterfall - 近距空间增强)
    const fallSource = this.ctx.createBufferSource();
    fallSource.buffer = noiseBuffer;
    fallSource.loop = true;

    const fallFilter = this.ctx.createBiquadFilter();
    fallFilter.type = 'bandpass';
    fallFilter.frequency.setValueAtTime(520, this.ctx.currentTime);
    fallFilter.Q.setValueAtTime(0.65, this.ctx.currentTime);

    this.waterfallGain = this.ctx.createGain();
    this.waterfallGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    fallSource.connect(fallFilter);
    fallFilter.connect(this.waterfallGain);
    this.waterfallGain.connect(this.ambientGain);
    fallSource.start();

    // 4. 山间时雨沙沙声 (Rain)
    const rainSource = this.ctx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.setValueAtTime(1600, this.ctx.currentTime);

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    rainSource.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.ambientGain);
    rainSource.start();
  }

  /**
   * 3D 距离感应空间声景实时混音
   */
  updateSpatialAmbience(playerPos, { isRain = false, isOnBoat = false, isNight = false } = {}) {
    if (!this.isInitialized || !this.ctx || !playerPos) return;
    const t = this.ctx.currentTime;

    // 距悬瀑幽涧 (-18, -36) 的距离 -> 瀑声轰鸣
    const dFall = Math.hypot(playerPos.x - (-18), playerPos.z - (-36));
    const fallTarget = Math.max(0, 1.0 - dFall / 46.0) * 0.42;

    // 高处松涛风声（高度越高或靠近孤刹悬云风越清越）
    const elevFactor = Math.max(0, Math.min(1, (playerPos.y - 3.0) / 26.0));
    const windTarget = (0.10 + elevFactor * 0.24) * (isNight ? 0.85 : 1.0);

    // 亲水或乘舟时水声增强
    const waterTarget = isOnBoat ? 0.26 : (playerPos.y < 3.5 ? 0.16 : 0.06);

    // 时雨声
    const rainTarget = isRain ? 0.24 : 0.0;

    if (this.waterfallGain) this.waterfallGain.gain.setTargetAtTime(fallTarget, t, 0.25);
    if (this.windGain) this.windGain.gain.setTargetAtTime(windTarget, t, 0.25);
    if (this.waterGain) this.waterGain.gain.setTargetAtTime(waterTarget, t, 0.25);
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(rainTarget, t, 0.35);
  }

  /**
   * 漫步脚步轻响（山道石阶/草径）
   */
  playFootstep() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    if (now - this._lastStepTime < 0.26) return;
    this._lastStepTime = now;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(260 + Math.random() * 140, now);
    filter.Q.setValueAtTime(1.6, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    const offset = Math.random() * 1.2;
    src.start(now, offset, 0.12);
  }

  /**
   * 水波涟漪与清泉击石声（用于时雨、粒子破卷与入水）
   */
  playWaterRipples() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const dropFreqs = [659.25, 783.99, 1046.50, 880.00];
    dropFreqs.forEach((f, idx) => {
      const start = t + idx * 0.09 + Math.random() * 0.03;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * 0.85, start);
      osc.frequency.exponentialRampToValueAtTime(f * 1.35, start + 0.14);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  }

  /**
   * 乌篷船摇橹拨水声
   */
  playBoatOar() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(240, t);
    filter.frequency.exponentialRampToValueAtTime(620, t + 0.28);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.65);
    filter.Q.setValueAtTime(1.4, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.11, t + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.68);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t, Math.random() * 0.8, 0.72);
  }

  /**
   * 借笔点睛 · 狼毫划星五音泛音 (宫商角徵羽)
   */
  playBrushStarNote(starIndex = 0) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.00];
    const freq = pentatonic[starIndex % pentatonic.length];
    this.playGuqinPluck(freq, 3.2);
    this.playChime(freq * 1.5, 2.2);
  }

  /**
   * 拨动古琴散音
   */
  playGuqinPluck(freq = 261.63, duration = 3.5) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, t);
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.992, t + duration * 0.7);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.01, t);

    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3.02, t);

    const gain1 = this.ctx.createGain();
    const gain2 = this.ctx.createGain();
    const gain3 = this.ctx.createGain();

    gain1.gain.setValueAtTime(0.001, t);
    gain1.gain.linearRampToValueAtTime(0.45, t + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    gain2.gain.setValueAtTime(0.001, t);
    gain2.gain.linearRampToValueAtTime(0.20, t + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.65);

    gain3.gain.setValueAtTime(0.001, t);
    gain3.gain.linearRampToValueAtTime(0.07, t + 0.01);
    gain3.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.4);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 5.2, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, t + duration);

    osc1.connect(gain1);
    osc2.connect(gain2);
    osc3.connect(gain3);

    gain1.connect(filter);
    gain2.connect(filter);
    gain3.connect(filter);

    filter.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc3.start(t);

    osc1.stop(t + duration);
    osc2.stop(t + duration);
    osc3.stop(t + duration);
  }

  /**
   * 编钟/石磬长鸣
   */
  playChime(baseFreq = 587.33, duration = 4.0) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const partials = [1, 2.76, 5.4, 8.93];
    const amplitudes = [0.36, 0.22, 0.11, 0.045];

    partials.forEach((mult, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * mult, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(amplitudes[idx], t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration / (idx + 1));

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + duration);
    });
  }

  playScrollWhoosh() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.25);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  playEnterPaintingSound() {
    if (this.isMuted) return;
    this.ensureContext();
    const arpeggio = [261.63, 329.63, 392.00, 523.25, 659.25];
    arpeggio.forEach((freq, idx) => {
      setTimeout(() => {
        this.playGuqinPluck(freq, 2.5);
      }, idx * 110);
    });
  }

  playReturnToScrollSound() {
    if (this.isMuted) return;
    this.ensureContext();
    const arpeggio = [659.25, 523.25, 392.00, 261.63];
    arpeggio.forEach((freq, idx) => {
      setTimeout(() => {
        this.playGuqinPluck(freq, 2.2);
      }, idx * 90);
    });
  }

  playAwakeningChoral(index = 0) {
    if (this.isMuted) return;
    this.ensureContext();

    const bases = [392.00, 440.00, 523.25, 587.33, 659.25, 783.99];
    const chosen = bases[index % bases.length];

    this.playChime(chosen, 4.5);
    setTimeout(() => {
      this.playChime(chosen * 1.5, 4.0);
    }, 220);

    setTimeout(() => {
      this.playGuqinPluck(chosen * 0.5, 5.0);
    }, 450);
  }

  playRandomStrum() {
    if (this.isMuted || !this.ctx) return;
    const idx = Math.floor(Math.random() * this.notesList.length);
    this.playGuqinPluck(this.notesList[idx], 3.2);
  }

  playGuqinHarmonicChord(beastId = '') {
    if (this.isMuted) return;
    this.ensureContext();
    const chord = [220.00, 261.63, 329.63, 392.00, 523.25, 659.25];
    chord.forEach((freq, idx) => {
      setTimeout(() => {
        this.playGuqinPluck(freq, 4.0);
      }, idx * 130);
    });
    setTimeout(() => {
      this.playChime(587.33, 4.5);
    }, 780);
  }

  /**
   * 朱砂御印重力砸落与印泥洇散音效 (80Hz 低频木印击纸声)
   */
  playSealStampThud() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.28);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.45, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }
}

export const audio = new ChineseAudioEngine();
