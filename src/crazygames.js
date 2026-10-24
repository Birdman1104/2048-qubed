// Thin wrapper around the CrazyGames HTML5 SDK v3 (https://docs.crazygames.com/sdk/intro/).
// Every call is a safe no-op when the SDK script is missing or the environment is "disabled"
// (any domain other than crazygames.com / localhost), so the same build runs everywhere.

import { CONFIG } from './config.js';

const sdk = () => window.CrazyGames?.SDK;

async function encryptScore(score, encryptionKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const algorithm = { name: 'AES-GCM', iv };
  const keyBytes = Uint8Array.from(atob(encryptionKey), (c) => c.charCodeAt(0));
  const cryptoKey = await window.crypto.subtle.importKey('raw', keyBytes, algorithm, false, ['encrypt']);
  const encrypted = await window.crypto.subtle.encrypt(algorithm, cryptoKey, new TextEncoder().encode(score.toString()));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export const crazy = {
  enabled: false,
  inGameplay: false,

  async init() {
    const s = sdk();
    if (!s) return;
    try {
      await s.init();
      this.enabled = s.environment !== 'disabled';
    } catch (e) {
      console.warn('CrazyGames SDK init failed', e);
    }
  },

  _call(fn) {
    if (!this.enabled) return;
    try { fn(sdk()); } catch (e) { console.warn('CrazyGames SDK call failed', e); }
  },

  loadingStart() { this._call((s) => s.game.loadingStart()); },
  loadingStop() { this._call((s) => s.game.loadingStop()); },
  happytime() { this._call((s) => s.game.happytime()); },

  gameplayStart() {
    if (this.inGameplay) return;
    this.inGameplay = true;
    this._call((s) => s.game.gameplayStart());
  },

  gameplayStop() {
    if (!this.inGameplay) return;
    this.inGameplay = false;
    this._call((s) => s.game.gameplayStop());
  },

  // Data module (cloud-synced for logged in users, localStorage for guests), localStorage off-platform.
  storage: {
    getItem(key) {
      if (crazy.enabled) {
        try { return sdk().data.getItem(key); } catch (e) { console.warn('CrazyGames data read failed', e); }
      }
      try { return localStorage.getItem(key); } catch { return null; }
    },
    setItem(key, value) {
      if (crazy.enabled) {
        try { sdk().data.setItem(key, value); return; } catch (e) { console.warn('CrazyGames data write failed', e); }
      }
      try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
    },
  },

  get canLogin() {
    return this.enabled && Boolean(sdk().user?.isUserAccountAvailable);
  },

  /** Logged in CrazyGames user ({ username, profilePictureUrl, __dangerousUserId }) or null for guests. */
  async getUser() {
    if (!this.canLogin) return null;
    try { return await sdk().user.getUser(); } catch (e) { console.warn('CrazyGames getUser failed', e); return null; }
  },

  async showAuthPrompt() {
    if (!this.canLogin) return null;
    try { return await sdk().user.showAuthPrompt(); } catch (e) { console.warn('CrazyGames auth prompt', e); return null; }
  },

  onAuthChange(listener) {
    this._call((s) => s.user.addAuthListener(listener));
  },

  /** Official CrazyGames leaderboard. Only active once an encryption key is configured. */
  async submitScore(score) {
    const key = CONFIG.crazygames.leaderboardEncryptionKey;
    if (!this.enabled || !key) return;
    try {
      const encryptedScore = await encryptScore(score, key);
      sdk().user.submitScore({ encryptedScore, score });
    } catch (e) {
      console.warn('CrazyGames submitScore failed', e);
    }
  },
};
