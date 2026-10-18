/**
 * 《千里江山 · 山海入画》纯代码 WebAudio 中国传统五声声景引擎
 * 包含：古琴散音/泛音合成、编钟石磬、松涛风声、溪流泉鸣、神兽长吟
 */

class ChineseAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;
    this.ambientGain = null;
    this.windNode = null;
    this.waterNode = null;

    // 中国古乐五声音阶（以宫为C，商D，角E，徵G，羽A）
    // 覆盖低音至高音三组八度
    this.pentatonicFrequencies = {
      // 低八度
      'GONG_2': 130.81, 'SHANG_2': 146.83, 'JUE_2': 164.81, 'ZHI_2': 196.00, 'YU_2': 220.00,
      // 中八度
      'GONG_3': 261.63, 'SHANG_3': 293.66, 'JUE_3': 329.63, 'ZHI_3': 392.00, 'YU_3': 440.00,
      // 高八度
      'GONG_4': 523.25, 'SHANG_4': 587.33, 'JUE_4': 659.25, 'ZHI_4': 783.99, 'YU_4': 880.00,
      // 超高八度（泛音用）
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

      // 主音量与环境音线
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
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
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  // 生成松涛与山涧水声
  _initAmbientNoise() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    this.noiseBuffer = noiseBuffer;
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    // 1. 松涛风声 (带缓慢低频管状调制的粉红噪声)
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(2.5, this.ctx.currentTime);

    // 缓慢风涌 LFO
    const windLFO = this.ctx.createOscillator();
    windLFO.frequency.setValueAtTime(0.12, this.ctx.currentTime);
    const windLFOGain = this.ctx.createGain();
    windLFOGain.gain.setValueAtTime(140, this.ctx.currentTime);
    windLFO.connect(windLFOGain);
    windLFOGain.connect(windFilter.frequency);

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    this.windGain = windGain;

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.ambientGain);

    windSource.start();
    windLFO.start();

    // 2. 溪水流动声 (高频低通柔化)
    const waterSource = this.ctx.createBufferSource();
    waterSource.buffer = noiseBuffer;
    waterSource.loop = true;

    const waterFilter = this.ctx.createBiquadFilter();
    waterFilter.type = 'lowpass';
    waterFilter.frequency.setValueAtTime(800, this.ctx.currentTime);

    const waterGain = this.ctx.createGain();
    waterGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    this.waterGain = waterGain;

    waterSource.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(this.ambientGain);

    waterSource.start();
  }

  /**
   * 拨动古琴散音
   * @param {number} freq 频率
   * @param {number} duration 衰减持续时间
   */
  playGuqinPluck(freq = 261.63, duration = 3.5, gainScale = 1) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 复合谐波：基音 + 二次泛音 + 微弱摩擦感
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, t);
    // 古琴独特的微微滑音（吟猱余韵）
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.992, t + duration * 0.7);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.01, t);

    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3.02, t);

    const gain1 = this.ctx.createGain();
    const gain2 = this.ctx.createGain();
    const gain3 = this.ctx.createGain();

    // 强烈的指甲触弦击发包络
    gain1.gain.setValueAtTime(0.001, t);
    gain1.gain.linearRampToValueAtTime(0.5 * gainScale, t + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    gain2.gain.setValueAtTime(0.001, t);
    gain2.gain.linearRampToValueAtTime(0.22 * gainScale, t + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.65);

    gain3.gain.setValueAtTime(0.001, t);
    gain3.gain.linearRampToValueAtTime(0.08 * gainScale, t + 0.01);
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
   * 编钟/石磬长鸣（用于神兽唤醒与印章加盖）
   */
  playChime(baseFreq = 587.33, duration = 4.0) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const partials = [1, 2.76, 5.4, 8.93];
    const amplitudes = [0.4, 0.25, 0.12, 0.05];

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

  /**
   * 游目滚卷风息微响
   */
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

  /**
   * 推门入画镜头俯冲音效（空灵五声和弦琶音）
   */
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

  /**
   * 出画还卷升华音效
   */
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

  /**
   * 神兽苏醒宏大天籁：五声编钟齐奏 + 金石长鸣
   */
  playAwakeningChoral(index = 0) {
    if (this.isMuted) return;
    this.ensureContext();

    const bases = [392.00, 440.00, 523.25, 587.33, 659.25, 783.99];
    const chosen = bases[index % bases.length];

    // 石磬双音
    this.playChime(chosen, 4.5);
    setTimeout(() => {
      this.playChime(chosen * 1.5, 4.0);
    }, 220);

    // 古琴悠扬散音随之泛起
    setTimeout(() => {
      this.playGuqinPluck(chosen * 0.5, 5.0);
    }, 450);
  }

  /**
   * 随机拨弄一下空山古琴（用于长卷浏览时的背景点缀）
   */
  playRandomStrum() {
    if (this.isMuted || !this.ctx) return;
    const idx = Math.floor(Math.random() * this.notesList.length);
    this.playGuqinPluck(this.notesList[idx], 3.2);
  }

  /**
   * 电影级神兽唤醒古琴轮指五音琶音蓄力
   */
  playGuqinHarmonicChord(beastId = '') {
    if (this.isMuted) return;
    this.ensureContext();
    const chord = [220.00, 261.63, 329.63, 392.00, 523.25, 659.25];
    chord.forEach((freq, idx) => {
      setTimeout(() => {
        this.playGuqinPluck(freq, 4.0);
      }, idx * 140);
    });
    setTimeout(() => {
      this.playChime(587.33, 4.5);
    }, 850);
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

  /**
   * 小二度散音。失败不用警报。
   */
  playDissonance() {
    this.playGuqinPluck(392.0, 1.15, 0.34);
    this.playGuqinPluck(415.3, 1.35, 0.22);
  }

  /**
   * 清磬，可按屏幕左右声像。
   */
  playQing(pan = 0, gainAmt = 0.16) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
    const partials = [1, 2.76, 5.4];
    const amps = [gainAmt, gainAmt * 0.45, gainAmt * 0.18];
    partials.forEach((mult, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(784 * mult, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(amps[idx], t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6 / (idx + 1));
      osc.connect(gain);
      gain.connect(panner);
      osc.start(t);
      osc.stop(t + 1.8);
    });
    panner.connect(this.masterGain);
  }

  /** 徵。唤醒夫诸时的那一音。 */
  playZhi() {
    this.playGuqinPluck(392.0, 3.4, 0.8);
    this.playQing(0, 0.12);
  }

  _ensureFlow() {
    if (this.flowGain || !this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.65;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();
    this.flowFilter = filter;
    this.flowGain = gain;
  }

  /**
   * 引流的水声。amount 0–1，brightness 0 闷、1 尖，用来预告太慢或太快。
   */
  setFlow(amount, brightness) {
    if (!this.isInitialized) return;
    if (this.isMuted) amount = 0;
    this._ensureFlow();
    if (!this.flowGain) return;
    const t = this.ctx.currentTime;
    const g = Math.max(0, Math.min(1, amount)) * 0.2;
    this.flowGain.gain.setTargetAtTime(g, t, 0.06);
    const freq = 380 + Math.max(0, Math.min(1, brightness)) * 2400;
    this.flowFilter.frequency.setTargetAtTime(freq, t, 0.08);
  }

  /** 色归之后，靠近悬瀑时把环境水声抬起来。 */
  setRegionWater(amount) {
    if (!this.waterGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = 0.04 + Math.max(0, Math.min(1, amount)) * 0.16;
    this.waterGain.gain.setTargetAtTime(this.isMuted ? 0 : g, t, 0.2);
  }
}

export const audio = new ChineseAudioEngine();
