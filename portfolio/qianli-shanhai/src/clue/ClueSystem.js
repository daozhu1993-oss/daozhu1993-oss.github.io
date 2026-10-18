/**
 * 闻 / 见 / 入。半径按当前视宽折算，和缩放档位无关地跟着卷面走。
 * 「入」只在入景层（zoom ≥ 1.85）生效。
 */
export class ClueSystem {
  constructor(beast) {
    this.beast = beast;
    this.tier = 0;
    this.mistClock = 0;
    this.chimeIn = 1.2;
  }

  update(dt, camera, muted) {
    const wx = this.beast.x * camera.worldW;
    const wy = this.beast.y;
    const dist = Math.hypot(wx - camera.x, wy - camera.y);
    const viewW = camera.visibleWidth();
    const hearR = 1.6 * viewW;
    const seeR = 0.9 * viewW;
    const enterR = 0.3 * viewW;
    const canSee = camera.zoom >= camera.roamZoom() * 0.85;
    const canEnterZoom = camera.zoom >= 1.85;

    if (dist < hearR) this.tier = Math.max(this.tier, 1);
    if (canSee && dist < seeR) this.tier = Math.max(this.tier, 2);
    if (canEnterZoom && dist < enterR) this.tier = Math.max(this.tier, 3);

    const on = 3.2;
    const off = muted ? 6.2 : 9.4;
    let mist = false;
    if (canSee && dist < seeR) {
      this.mistClock += dt;
      mist = (this.mistClock % (on + off)) < on;
    } else {
      this.mistClock = 0;
    }

    const hear = dist < hearR;
    const vol = hear ? 1 - dist / hearR : 0;
    const reach = Math.max(viewW * 2.4, camera.worldW * 0.48);
    const closeness = 1 - Math.max(0, Math.min(1, dist / reach));
    let chime = false;
    if (!muted) {
      this.chimeIn -= dt;
      if (this.chimeIn <= 0) {
        chime = true;
        this.chimeIn = 8 - closeness * 3.4;
      }
    }

    return {
      tier: this.tier,
      dist,
      vol,
      closeness,
      mist,
      chime,
      wx,
      wy,
      canEnter: canEnterZoom && dist < enterR,
    };
  }
}
