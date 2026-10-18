/** 游观里只留幽灵字：札、声、必要时一行谶语、挑战四字标题。 */
export class Chrome {
  constructor(root) {
    root.innerHTML = `
      <div id="veil" role="status">
        <p class="era">北宋政和三年</p>
        <h1>千里江山</h1>
        <p class="sub">借笔还魂</p>
        <i id="inkline"></i>
      </div>
      <p id="intro-line"></p>
      <p id="oracle"></p>
      <p id="challenge-title">悬瀑引泉</p>
      <p id="turn-hint">横屏更佳</p>
      <button id="btn-album" class="ghost" type="button">札</button>
      <p id="sound-hint">轻触启声</p>
      <button id="btn-sound" class="ghost" type="button" aria-pressed="false">声</button>
      <button id="btn-ghost" class="ghost" type="button" hidden>请希孟代笔</button>
      <div id="brush" hidden>
        <i id="brush-glow"></i>
        <i id="brush-drop"></i>
        <svg viewBox="0 0 16 28" width="16" height="28" aria-hidden="true">
          <path d="M8 1c2 6 3 10 3 14 0 3-1.2 5-3 7-1.8-2-3-4-3-7 0-4 1-8 3-14z" fill="#272315"/>
        </svg>
      </div>
    `;
    this.veil = root.querySelector('#veil');
    this.inkline = root.querySelector('#inkline');
    this.intro = root.querySelector('#intro-line');
    this.oracle = root.querySelector('#oracle');
    this.title = root.querySelector('#challenge-title');
    this.turn = root.querySelector('#turn-hint');
    this.albumBtn = root.querySelector('#btn-album');
    this.soundBtn = root.querySelector('#btn-sound');
    this.soundHint = root.querySelector('#sound-hint');
    this.ghostBtn = root.querySelector('#btn-ghost');
    this.brush = root.querySelector('#brush');
    this.glow = root.querySelector('#brush-glow');
    this.drop = root.querySelector('#brush-drop');
    this.titleTimer = 0;
  }

  setLoad(progress) {
    this.inkline.style.transform = `scaleX(${Math.max(0.04, progress)})`;
  }

  hideVeil() {
    this.veil.classList.add('gone');
    setTimeout(() => { this.veil.hidden = true; }, 700);
  }

  setIntro(text, opacity = 1) {
    this.intro.textContent = text || '';
    this.intro.classList.toggle('show', Boolean(text));
    this.intro.style.opacity = text ? String(opacity) : '0';
  }

  setSoundHint(on) {
    this.soundHint.classList.toggle('show', Boolean(on));
  }

  setOracle(text, alpha) {
    this.oracle.textContent = text || '';
    this.oracle.style.opacity = text ? String(alpha) : '0';
  }

  showTitle() {
    this.title.classList.add('show');
    this.titleTimer = 3;
  }

  showTurn(on) {
    this.turn.classList.toggle('show', on);
  }

  tick(dt) {
    if (this.titleTimer > 0) {
      this.titleTimer -= dt;
      if (this.titleTimer <= 0) this.title.classList.remove('show');
    }
  }

  setGhost(on) {
    this.ghostBtn.hidden = !on;
  }

  setMuted(muted) {
    this.soundBtn.classList.toggle('is-quiet', muted);
    this.soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  setBrush({ x, y, visible, warmth, angle, near }) {
    this.brush.hidden = !visible;
    if (!visible) return;
    this.brush.style.transform = `translate(${x}px, ${y}px)`;
    const glow = warmth ? 10 + near * 26 : 0;
    this.glow.style.opacity = warmth ? '1' : '0';
    this.glow.style.width = `${glow * 2}px`;
    this.glow.style.height = `${glow * 2}px`;
    this.drop.style.opacity = warmth ? '0.85' : '0';
    this.drop.style.transform = `translate(${Math.cos(angle) * 16}px, ${Math.sin(angle) * 16}px)`;
  }
}
