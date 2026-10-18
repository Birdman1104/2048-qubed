import './style.css';
import gloveUrl from './assets/glove.png';
import { Game } from './Game.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

loadImage(gloveUrl).then((glove) => {
  window.game = new Game(document.getElementById('app'), { glove });
});
