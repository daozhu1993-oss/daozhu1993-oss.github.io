/**
 * DAOZHU POCKET (岛主口袋掌机) - 8-Bit Web Audio Synthesizer 2.0
 * 工业级拟真声学合成引擎：机械物理按键反馈、卡带轨道卡扣、DMG 开机电压声、
 * 掌机环境音效与生成式 8-Bit 海岛氛围音乐 (Chiptune Synthesizer)
 * 100% 原生纯 Web Audio API 动态合成，零外部资源依赖，零延迟
 */

class RetroAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.volume = 0.8;
    this.muted = false;
    this.initialized = false;
    this.bgmPlaying = false;
    this.bgmTimer = null;
    this.bgmStep = 0;

    try {
      this.muted = localStorage.getItem('daozhu_pocket_muted') === 'true';
      const savedVol = localStorage.getItem('daozhu_pocket_vol');
      if (savedVol !== null) this.volume = parseFloat(savedVol);
    } catch (e) {}
  }

  init() {
    if (this.initialized && this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // 主音量与分路增益节点
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    try {
      localStorage.setItem('daozhu_pocket_vol', this.volume);
    } catch (e) {}
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    }
    return this.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('daozhu_pocket_muted', this.muted);
    } catch (e) {}
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
    if (!this.muted) {
      this.mechanicalClick(0.04);
    }
    return this.muted;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. 物理机械按键反馈 (Tactile Mechanical Acoustics)
  // ─────────────────────────────────────────────────────────────

  // 通用塑料按键物理敲击音 (微下潜与微弹片阻尼)
  mechanicalClick(intensity = 0.05, pitch = 1.0) {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 1. 瞬态白噪脉冲 (微机械敲击瞬间)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.008);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400 * pitch, t);
    filter.Q.setValueAtTime(3.0, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(intensity * 1.2, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.015);

    // 2. 壳体低频微共振 (Body Thump)
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(140 * pitch, t);
    bodyOsc.frequency.exponentialRampToValueAtTime(50, t + 0.025);

    bodyGain.gain.setValueAtTime(intensity * 0.8, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.sfxGain);

    bodyOsc.start(t);
    bodyOsc.stop(t + 0.035);
  }

  // 十字键 (D-Pad) 金属簧片轴心微转动
  dpad() {
    this.mechanicalClick(0.04, 1.25);
    this.cursor();
  }

  // A 键按下：清脆回弹微声 + 芯片确认音
  actionA() {
    this.mechanicalClick(0.07, 1.05);
    this.confirm();
  }

  // B 键按下：稳重沉降 + 芯片取消音
  actionB() {
    this.mechanicalClick(0.06, 0.85);
    this.cancel();
  }

  // 导电橡胶垫功能键 (SELECT / START) 沉闷手感声
  pillButton() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.03);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  // 侧边旋钮阻尼微步进音
  dialTick() {
    this.mechanicalClick(0.03, 1.6);
  }

  // 物理电源滑块开关 (POWER Switch) 滑动与锁止声
  powerSwitch(isOn) {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 机械滑块塑料摩擦卡扣
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(isOn ? 180 : 360, t);
    osc.frequency.exponentialRampToValueAtTime(isOn ? 480 : 90, t + 0.06);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.09);

    if (isOn) {
      setTimeout(() => this.boot(), 180);
    }
  }

  // 实体卡带插槽物理卡扣 (Cartridge Spring Latch)
  cartridge() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 1. 轨道滑入摩擦声 (Rail Friction)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(420, t);
    osc1.frequency.exponentialRampToValueAtTime(140, t + 0.07);

    gain1.gain.setValueAtTime(0.12, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc1.connect(gain1);
    gain1.connect(this.sfxGain);

    osc1.start(t);
    osc1.stop(t + 0.09);

    // 2. 金属金手指咬合与弹簧锁死 "喀嗒！" (Mechanical Snap)
    setTimeout(() => {
      if (!this.ctx || this.muted) return;
      const t2 = this.ctx.currentTime;
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(740, t2);
      osc2.frequency.exponentialRampToValueAtTime(260, t2 + 0.04);

      gain2.gain.setValueAtTime(0.15, t2);
      gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.05);

      osc2.connect(gain2);
      gain2.connect(this.sfxGain);

      osc2.start(t2);
      osc2.stop(t2 + 0.06);
    }, 70);

    setTimeout(() => this.confirm(), 220);
  }

  // 拔出卡带声 (Eject)
  cartridgeEject() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(560, t + 0.07);

    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. 经典 8-Bit 芯片级原声音效 (Authentic DMG Chimes)
  // ─────────────────────────────────────────────────────────────

  // 任天堂 DMG-01 封神开机音 (Iconic Boot Chime)
  boot() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 低沉滑落起调 C5
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(523.25, t);
    gain1.gain.setValueAtTime(0.09, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc1.connect(gain1);
    gain1.connect(this.sfxGain);
    osc1.start(t);
    osc1.stop(t + 0.15);

    // 0.22s 后纯净清脆、穿透心扉的双音泛音长鸣 "叮~~~~"
    const t2 = t + 0.22;
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1046.5, t2); // C6

    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(2093.0, t2); // C7

    gain2.gain.setValueAtTime(0.2, t2);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 1.4);

    osc2.connect(gain2);
    osc3.connect(gain2);
    gain2.connect(this.sfxGain);

    osc2.start(t2);
    osc3.start(t2);
    osc2.stop(t2 + 1.45);
    osc3.stop(t2 + 1.45);
  }

  // 光标移动短促高频嘀声 (Blip)
  cursor() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.exponentialRampToValueAtTime(1975.53, t + 0.035);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.045);
  }

  // A 确认键：经典跳跃二段上扬音 (Confirm Arpeggio)
  confirm() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [659.25, 987.77, 1318.51]; // E5 -> B5 -> E6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const noteTime = t + idx * 0.045;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.09, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.07);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.075);
    });
  }

  // B 返回键：温润二段下沉音 (Cancel/Back)
  cancel() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [783.99, 523.25]; // G5 -> C5
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const noteTime = t + idx * 0.045;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.08, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.065);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.07);
    });
  }

  // 小游戏跳跃 (Jump)
  jump() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.12);

    gain.gain.setValueAtTime(0.14, t);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  // 获得金币/得分 (Coin Pickup)
  score() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.setValueAtTime(1318.51, t + 0.065); // E6

    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.4);
  }

  // 碰撞/失败 (Hit/Crash)
  hit() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.22);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  // 秘技解锁！(Konami Code Fanfare)
  secretUnlock() {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // 经典的宝箱大吉琶音 (C5, G5, C6, E6, G6, C7)
    const arpeggio = [523.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0];
    arpeggio.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const nt = t + i * 0.065;

      osc.type = 'square';
      osc.frequency.setValueAtTime(f, nt);

      gain.gain.setValueAtTime(i === arpeggio.length - 1 ? 0.22 : 0.12, nt);
      gain.gain.exponentialRampToValueAtTime(0.001, nt + (i === arpeggio.length - 1 ? 0.8 : 0.12));

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(nt);
      osc.stop(nt + (i === arpeggio.length - 1 ? 0.85 : 0.15));
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. 原创 8-Bit 海岛阳光 Chiptune 氛围背景音乐生成器
  // ─────────────────────────────────────────────────────────────

  toggleBgm() {
    if (this.bgmPlaying) {
      this.stopBgm();
      return false;
    } else {
      this.startBgm();
      return true;
    }
  }

  startBgm() {
    this.resume();
    if (!this.ctx || this.bgmPlaying) return;
    this.bgmPlaying = true;
    this.bgmStep = 0;
    this.playBgmStep();
  }

  stopBgm() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  playBgmStep() {
    if (!this.bgmPlaying || !this.ctx || this.muted) {
      if (this.bgmPlaying) {
        this.bgmTimer = setTimeout(() => this.playBgmStep(), 150);
      }
      return;
    }

    const t = this.ctx.currentTime;
    // 16 步轻快温暖的海岛和弦小调序列 (C大调旋律 + 温暖低音)
    const melody = [
      523.25, 0, 659.25, 783.99, 0, 659.25, 880.00, 0,
      783.99, 659.25, 0, 523.25, 587.33, 659.25, 523.25, 0
    ];
    const bass = [
      130.81, 130.81, 164.81, 164.81, 174.61, 174.61, 196.00, 196.00,
      130.81, 130.81, 164.81, 164.81, 146.83, 146.83, 196.00, 196.00
    ];

    const idx = this.bgmStep % 16;
    const freq = melody[idx];
    const bassFreq = bass[idx];

    // 主旋律脉冲波
    if (freq > 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(t);
      osc.stop(t + 0.13);
    }

    // 三角波贝斯温暖垫底
    if (idx % 2 === 0) {
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(bassFreq, t);

      bassGain.gain.setValueAtTime(0.12, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      bassOsc.connect(bassGain);
      bassGain.connect(this.bgmGain);

      bassOsc.start(t);
      bassOsc.stop(t + 0.24);
    }

    // 拍子鼓点 (每第 4 步一次极短白噪军鼓)
    if (idx % 4 === 2) {
      const bSize = Math.floor(this.ctx.sampleRate * 0.02);
      const bBuf = this.ctx.createBuffer(1, bSize, this.ctx.sampleRate);
      const data = bBuf.getChannelData(0);
      for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bSize * 0.2));

      const sn = this.ctx.createBufferSource();
      sn.buffer = bBuf;
      const snGain = this.ctx.createGain();
      snGain.gain.setValueAtTime(0.04, t);
      snGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);

      sn.connect(snGain);
      snGain.connect(this.bgmGain);
      sn.start(t);
      sn.stop(t + 0.04);
    }

    this.bgmStep++;
    // 每拍 140ms (~107 BPM)
    this.bgmTimer = setTimeout(() => this.playBgmStep(), 140);
  }
}

window.retroAudio = new RetroAudio();
