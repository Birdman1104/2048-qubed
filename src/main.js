import './style.css';
import gloveUrl from './assets/glove.png';
import { Game } from './Game.js';
import { CONFIG } from './config.js';
import { crazy } from './crazygames.js';
import { loadPlayer } from './player.js';
import { submitScore } from './leaderboard.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const readBest = () => Number(crazy.storage.getItem(CONFIG.score.storageKey)) || 0;

async function boot() {
  await crazy.init();
  crazy.loadingStart();
  const [glove, initialPlayer] = await Promise.all([loadImage(gloveUrl), loadPlayer()]);
  let player = initialPlayer;
  let submission = 0;

  const game = new Game(document.getElementById('app'), { glove }, {
    best: readBest(),
    onStart: () => crazy.gameplayStart(),
    onBest: (best) => crazy.storage.setItem(CONFIG.score.storageKey, String(best)),
    onLogin: () => crazy.showAuthPrompt(),
    onGameOver: async ({ score, best, newBest }) => {
      crazy.gameplayStop();
      if (newBest && game.bestAtStart > 0) crazy.happytime();
      crazy.submitScore(score);

      const id = ++submission;
      game.ui.setLeaderboardLoading();
      try {
        // the server keeps the max, so sending the saved best also backfills scores made before logging in
        const result = await submitScore(player, best);
        if (id === submission) game.ui.setLeaderboard(result);
      } catch (e) {
        console.warn('Leaderboard submit failed', e);
        if (id === submission) game.ui.setLeaderboardError();
      }
    },
  });
  window.game = game;

  const applyPlayer = (p) => {
    player = p;
    game.ui.setPlayer(p.name, p.guest && crazy.canLogin);
  };
  applyPlayer(player);

  // guest logged in (or switched account) from the CrazyGames page: progress data is swapped by the SDK
  crazy.onAuthChange(async () => {
    applyPlayer(await loadPlayer());
    game.setBest(readBest());
  });

  crazy.loadingStop();
}

boot();
