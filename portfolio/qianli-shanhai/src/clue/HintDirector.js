/**
 * 无进展计时。25 秒崖上淡墨，60 秒笔温，150 秒谶语，240 秒全卷墨晕。
 * 线索每升一级，计时归零。越级不扣分。
 */
export class HintDirector {
  constructor(oracleText) {
    this.oracleText = oracleText;
    this.idle = 0;
    this.level = 0;
    this.clueTier = 0;
    this.oracleT = 0;
    this.boostT = 0;
    this.hold = 0;
  }

  noteTier(tier) {
    if (tier > this.clueTier) {
      this.clueTier = tier;
      this.idle = 0;
      this.level = 0;
      this.oracleT = 0;
      this.boostT = 0;
    }
  }

  poke() {
    this.level = Math.max(this.level, 1);
  }

  noteHold(holding, dt) {
    if (holding) this.hold += dt;
    else this.hold = 0;
    if (this.hold >= 1.2) {
      this.level = Math.max(this.level, 1);
      this.hold = 0;
    }
  }

  update(dt) {
    this.idle += dt;
    if (this.idle >= 60) this.level = Math.max(this.level, 1);
    if (this.idle >= 150 && this.level < 2) {
      this.level = 2;
      this.oracleT = 6;
      this.boostT = 6;
    }
    if (this.idle >= 240) this.level = Math.max(this.level, 3);
    if (this.oracleT > 0) this.oracleT = Math.max(0, this.oracleT - dt);
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);

    let oracleAlpha = 0;
    if (this.oracleT > 0) {
      const age = 6 - this.oracleT;
      oracleAlpha = Math.min(1, age / 0.4, this.oracleT / 1.1);
    }
    return {
      level: this.level,
      mark: this.idle >= 25 && this.clueTier < 3,
      warmth: this.level >= 1 ? 1 : 0,
      oracle: this.oracleT > 0 ? this.oracleText : '',
      oracleAlpha,
      ink: this.level >= 3,
      soundBoost: this.boostT > 0 ? 1.5 : 1,
    };
  }
}
