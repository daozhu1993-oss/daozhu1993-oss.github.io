/**
 * 别洒了，鹈鹕！- PelicanAudio
 * 纯 Web Audio API 合成声音引擎，无需加载任何外链音频文件，零延迟且支持静音切换
 */
class PelicanAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isGbMode = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.bgmPlaying = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setGbMode(isGb) {
    this.isGbMode = isGb;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBgm();
    } else {
      this.startBgm();
    }
    return this.isMuted;
  }

  // 自行车清脆铃铛 (叮铃铃)
  ringBell() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const playChime = (freq, offset) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = this.isGbMode ? 'square' : 'sine';
      osc.frequency.setValueAtTime(freq, t + offset);

      gain.gain.setValueAtTime(0.08, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.35);
    };

    playChime(2093, 0);
    playChime(2637, 0.08);
  }

  // 接到飞鱼 (咕咚 / 啵~)
  catchFish() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (this.isGbMode) {
      osc.type = 'square';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.setValueAtTime(480, t + 0.04);
      osc.frequency.setValueAtTime(640, t + 0.08);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.start(t);
      osc.stop(t + 0.16);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, t);
      osc.frequency.exponentialRampToValueAtTime(720, t + 0.09);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    }

    osc.connect(gain);
    gain.connect(this.ctx.destination);
  }

  // 鱼颠飞洒出 (滑稽弹跳声)
  spillFish() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = this.isGbMode ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.22);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  // 颠簸磕碰石子 (沉闷减震顿挫)
  bump() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = this.isGbMode ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // 抵达码头胜利号角
  reachDock() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const t = this.ctx.currentTime + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = this.isGbMode ? 'square' : 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  // 治愈系海风与轻音乐琶音 (Lofi / Chiptune arpeggio)
  startBgm() {
    if (this.isMuted || this.bgmPlaying) return;
    this.init();
    if (!this.ctx) return;

    this.bgmPlaying = true;
    const chords = [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00], // Am7
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [196.00, 246.94, 293.66, 349.23]  // G7
    ];

    const playNote = (freq, duration, volume) => {
      if (!this.ctx || !this.bgmPlaying || this.isMuted) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = this.isGbMode ? 'square' : 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
    };

    let beat = 0;
    this.bgmTimer = setInterval(() => {
      if (!this.bgmPlaying || this.isMuted) return;
      const chordIdx = Math.floor(beat / 4) % chords.length;
      const noteIdx = beat % 4;
      const currentChord = chords[chordIdx];
      const freq = currentChord[noteIdx];

      playNote(freq, 0.35, this.isGbMode ? 0.03 : 0.04);
      beat++;
    }, 280);
  }

  stopBgm() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

window.PelicanAudio = PelicanAudio;
