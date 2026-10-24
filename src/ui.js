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
  constructor(root, { onPlay, onLogin, onMuteToggle }) {
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
          <button class="mute" type="button" aria-label="Mute" title="Mute">
            <svg class="mute-on" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.8-1-3.3-2.5-4v8c1.5-.7 2.5-2.2 2.5-4zM14 3.2v2.1c2.9.9 5 3.5 5 6.7s-2.1 5.8-5 6.7v2.1c4-.9 7-4.5 7-8.8s-3-7.9-7-8.8z"/>
            </svg>
            <svg class="mute-off" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16.5 12c0-1.8-1-3.3-2.5-4v2.2l2.5 2.5V12zm2.5 0c0 .9-.2 1.8-.5 2.6l1.5 1.5c.6-1.3.9-2.7.9-4.1 0-4.3-3-7.9-7-8.8v2.1c2.9.9 5 3.5 5 6.7zM4.3 3L3 4.3 7.7 9H3v6h4l5 5v-6.7l4.7 4.7c-.7.5-1.5.9-2.4 1.2v2.1c1.4-.3 2.6-1 3.7-1.8L19.7 21 21 19.7 4.3 3zM12 4L9.9 6.1 12 8.2V4z"/>
            </svg>
          </button>
        </div>
        <div class="booster">
          <canvas class="booster-icon" width="96" height="96"></canvas>
          <div class="booster-track"><div class="booster-fill"></div></div>
        </div>
        <div class="popups"></div>
        <div class="toast"></div>
      </div>
      <div class="overlay menu">
        <button class="login hidden">LOG IN</button>
        <div class="panel">
          <div class="title">2048 <span>QUBED</span></div>
          <div class="hello">Hello <span class="player-name"></span></div>
          <div class="menu-best">BEST 0</div>
          <button class="btn play">PLAY</button>
        </div>
      </div>
      <div class="overlay gameover hidden">
        <div class="panel gameover-panel">
          <h1>GAME OVER</h1>
          <div class="final-label">SCORE</div>
          <div class="final-score">0</div>
          <div class="final-best">BEST 0</div>
          <div class="board">
            <div class="board-head">TOP ${CONFIG.leaderboard.size}</div>
            <div class="board-status"></div>
            <ol class="board-list"></ol>
            <div class="board-me hidden"></div>
          </div>
          <button class="btn restart">PLAY AGAIN</button>
        </div>
      </div>
    `);
    this.nextCanvas = root.querySelector('.next canvas');
    this.scoreEl = root.querySelector('.score-value');
    this.bestEl = root.querySelector('.score-best');
    this.fillEl = root.querySelector('.booster-fill');
    this.muteBtn = root.querySelector('.mute');
    this.popups = root.querySelector('.popups');
    this.toastEl = root.querySelector('.toast');
    this.menu = root.querySelector('.overlay.menu');
    this.playerNameEl = root.querySelector('.player-name');
    this.menuBestEl = root.querySelector('.menu-best');
    this.loginBtn = root.querySelector('.login');
    this.overlay = root.querySelector('.overlay.gameover');
    this.finalScore = root.querySelector('.final-score');
    this.finalBest = root.querySelector('.final-best');
    this.boardStatus = root.querySelector('.board-status');
    this.boardList = root.querySelector('.board-list');
    this.boardMe = root.querySelector('.board-me');
    const click = (sel, fn) => root.querySelector(sel).addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
    click('.play', onPlay);
    click('.restart', onPlay);
    click('.login', onLogin);
    click('.mute', onMuteToggle);
    drawIsoCube(root.querySelector('.booster-icon'), drawMysteryFace());
  }

  setMuted(muted) {
    this.muteBtn.classList.toggle('is-muted', muted);
    this.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.muteBtn.title = muted ? 'Unmute' : 'Mute';
  }

  setPlayer(name, canLogin) {
    this.playerNameEl.textContent = name;
    this.loginBtn.classList.toggle('hidden', !canLogin);
  }

  setBest(best) {
    this.bestEl.textContent = 'BEST ' + best;
    this.menuBestEl.textContent = 'BEST ' + best;
  }

  hideMenu() { this.menu.classList.add('hidden'); }

  setNext(faceCanvas) { drawIsoCube(this.nextCanvas, faceCanvas); }

  setScore(score, best) {
    this.scoreEl.textContent = score;
    this.setBest(best);
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
    this._scrollToMe();
  }

  hideGameOver() { this.overlay.classList.add('hidden'); }

  // ---------------------------------------------------------------- leaderboard

  setLeaderboardLoading() {
    this.boardStatus.textContent = 'Loading scores…';
    this.boardList.replaceChildren();
    this.boardMe.classList.add('hidden');
  }

  setLeaderboardError() {
    this.boardStatus.textContent = 'Leaderboard is unavailable right now';
    this.boardList.replaceChildren();
    this.boardMe.classList.add('hidden');
  }

  /** result: { rank, best, name, top: [{ name, score, me }] } */
  setLeaderboard({ rank, best, name, top }) {
    this.boardList.replaceChildren(...top.map((r, i) => this._row(i + 1, r.name, r.score, r.me)));
    const inTop = top.some((r) => r.me);
    this.boardStatus.textContent = inTop ? `You're #${rank}!` : `You're not in the top ${CONFIG.leaderboard.size} yet`;
    this.boardMe.classList.toggle('hidden', inTop);
    if (!inTop) this.boardMe.replaceChildren(this._row(rank, name, best, true));
    this._scrollToMe();
  }

  _row(rank, name, score, me) {
    const row = document.createElement('li');
    row.className = 'board-row' + (me ? ' me' : '');
    for (const [cls, text] of [['rank', '#' + rank], ['name', name], ['pts', score]]) {
      const cell = document.createElement('span');
      cell.className = cls;
      cell.textContent = text;
      row.appendChild(cell);
    }
    return row;
  }

  _scrollToMe() {
    const row = this.boardList.querySelector('.me');
    const list = this.boardList;
    list.scrollTop = row ? row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2 : 0;
  }
}
