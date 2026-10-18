import { CONFIG } from './config.js';
import { drawMysteryFace } from './textures.js';

const U = CONFIG.ui;

/** Draws a small isometric cube using a face canvas for all three visible sides. */
function drawIsoCube(canvas, face) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const s = W * 0.36; // edge length in px
  const cx = W / 2, cy = H / 2 + s * 0.1;
  const fs = face.width;
  const faces = [
    // top
    { m: [s / fs * 0.866, s / fs * 0.5, -s / fs * 0.866, s / fs * 0.5, cx, cy - s], shade: 0.12 },
    // left
    { m: [s / fs * 0.866, s / fs * 0.5, 0, s / fs, cx - s * 0.866, cy - s * 0.5], shade: 0 },
    // right
    { m: [s / fs * 0.866, -s / fs * 0.5, 0, s / fs, cx, cy], shade: -0.22 },
  ];
  for (const f of faces) {
    ctx.save();
    ctx.setTransform(...f.m);
    ctx.drawImage(face, 0, 0);
    ctx.fillStyle = f.shade > 0 ? `rgba(255,255,255,${f.shade})` : `rgba(0,0,0,${-f.shade})`;
    if (f.shade !== 0) ctx.fillRect(0, 0, fs, fs);
    ctx.restore();
  }
}

export class UI {
  constructor(root, onRestart) {
    const st = document.documentElement.style;
    st.setProperty('--accent', U.accent);
    st.setProperty('--progress', U.progressColor);
    st.setProperty('--progress-bg', U.progressBg);
    st.setProperty('--panel', U.panelBg);
    st.setProperty('--text', U.textColor);
    st.setProperty('--popup-duration', U.popupDuration + 's');

    root.insertAdjacentHTML('beforeend', `
      <div class="hud">
        <div class="hud-bar">
          <div class="next"><canvas width="128" height="128"></canvas><span>NEXT</span></div>
          <div class="score"><div class="score-label">SCORE</div><div class="score-value">0</div><div class="score-best">BEST 0</div></div>
          <div class="spacer"></div>
        </div>
        <div class="booster">
          <canvas class="booster-icon" width="96" height="96"></canvas>
          <div class="booster-track"><div class="booster-fill"></div></div>
        </div>
        <div class="popups"></div>
        <div class="toast"></div>
      </div>
      <div class="overlay hidden">
        <div class="panel">
          <h1>GAME OVER</h1>
          <div class="final-label">SCORE</div>
          <div class="final-score">0</div>
          <div class="final-best">BEST 0</div>
          <button class="restart">PLAY AGAIN</button>
        </div>
      </div>
    `);
    this.nextCanvas = root.querySelector('.next canvas');
    this.scoreEl = root.querySelector('.score-value');
    this.bestEl = root.querySelector('.score-best');
    this.fillEl = root.querySelector('.booster-fill');
    this.popups = root.querySelector('.popups');
    this.toastEl = root.querySelector('.toast');
    this.overlay = root.querySelector('.overlay');
    this.finalScore = root.querySelector('.final-score');
    this.finalBest = root.querySelector('.final-best');
    root.querySelector('.restart').addEventListener('click', onRestart);
    drawIsoCube(root.querySelector('.booster-icon'), drawMysteryFace());
  }

  setNext(faceCanvas) { drawIsoCube(this.nextCanvas, faceCanvas); }

  setScore(score, best) {
    this.scoreEl.textContent = score;
    this.bestEl.textContent = 'BEST ' + best;
    this.scoreEl.classList.remove('bump');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('bump');
  }

  setProgress(t) { this.fillEl.style.height = Math.min(100, Math.max(0, t * 100)) + '%'; }

  popup(text, x, y, color) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (color) el.style.color = color;
    this.popups.appendChild(el);
    setTimeout(() => el.remove(), U.popupDuration * 1000);
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  showGameOver(score, best) {
    this.finalScore.textContent = score;
    this.finalBest.textContent = 'BEST ' + best;
    this.overlay.classList.remove('hidden');
  }

  hideGameOver() { this.overlay.classList.add('hidden'); }
}
