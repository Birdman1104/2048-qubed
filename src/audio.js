import shootUrl from './assets/shoot.wav';
import mergeUrl from './assets/merge.wav';
import boosterUrl from './assets/booster.wav';
import bounceBoxUrl from './assets/bounce-box.wav';
import bounceWallUrl from './assets/bounce-wall.wav';
import highScoreUrl from './assets/high-score.wav';
import wallWarningUrl from './assets/wall-warning.wav';
import themeUrl from './assets/theme-song.mp3';
import { CONFIG } from './config.js';

const URLS = {
  shoot: shootUrl,
  merge: mergeUrl,
  booster: boosterUrl,
  bounceBox: bounceBoxUrl,
  bounceWall: bounceWallUrl,
  highScore: highScoreUrl,
  wallWarning: wallWarningUrl,
};

export class AudioBank {
  constructor() {
    const A = CONFIG.audio;
    this.volume = A.sfxVolume;
    this.samples = {};
    for (const [name, url] of Object.entries(URLS)) {
      const el = new Audio(url);
      el.preload = 'auto';
      this.samples[name] = el;
    }
    this.theme = new Audio(themeUrl);
    this.theme.loop = true;
    this.theme.preload = 'auto';
    this.theme.volume = A.themeVolume;
    this._last = Object.create(null);
    this.userMuted = false;
    this.suspended = false; // browser tab hidden
    this._themeWanted = false;
  }

  get muted() {
    return this.userMuted || this.suspended;
  }

  setUserMuted(muted) {
    this.userMuted = !!muted;
    this._applyOutput();
  }

  setSuspended(suspended) {
    this.suspended = !!suspended;
    this._applyOutput();
  }

  play(name, { volume = 1, minInterval = 0 } = {}) {
    if (this.muted) return;
    const base = this.samples[name];
    if (!base) return;
    const now = performance.now();
    if (minInterval && now - (this._last[name] || 0) < minInterval) return;
    this._last[name] = now;
    const a = base.cloneNode();
    a.volume = Math.min(1, this.volume * volume);
    a.play().catch(() => {});
  }

  playTheme() {
    this._themeWanted = true;
    this.theme.currentTime = 0;
    this._applyOutput();
  }

  stopTheme() {
    this._themeWanted = false;
    this.theme.pause();
    this.theme.currentTime = 0;
  }

  _applyOutput() {
    if (this.muted || !this._themeWanted) {
      this.theme.pause();
      return;
    }
    this.theme.volume = CONFIG.audio.themeVolume;
    this.theme.play().catch(() => {});
  }
}
