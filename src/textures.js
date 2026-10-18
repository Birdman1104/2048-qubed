import * as THREE from 'three';
import { CONFIG } from './config.js';

const B = CONFIG.box;

export function valueColor(value) {
  if (B.colors[value]) return B.colors[value];
  const exp = Math.round(Math.log2(value));
  return B.fallbackColors[exp % B.fallbackColors.length];
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  if (amount >= 0) c.lerp(new THREE.Color('#ffffff'), amount);
  else c.lerp(new THREE.Color('#000000'), -amount);
  return '#' + c.getHexString();
}

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = B.textureSize;
  return c;
}

function fillFace(ctx, fill) {
  const s = B.textureSize;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, s, s);
}

function drawBorder(ctx, color) {
  const s = B.textureSize;
  const w = s * 0.045;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.strokeRect(w * 1.5, w * 1.5, s - w * 3, s - w * 3);
}

function drawLabel(ctx, text, color = B.textColor) {
  const s = B.textureSize;
  const len = String(text).length;
  const fontSize = s * (len <= 1 ? 0.62 : len === 2 ? 0.56 : len === 3 ? 0.44 : len === 4 ? 0.34 : 0.27);
  ctx.font = `bold ${fontSize}px ${B.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = B.textShadow;
  ctx.fillText(text, s / 2 + s * 0.015, s / 2 + s * 0.035);
  ctx.fillStyle = color;
  ctx.fillText(text, s / 2, s / 2 + s * 0.02);
}

export function drawValueFace(value) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  const col = valueColor(value);
  fillFace(ctx, col);
  drawBorder(ctx, shade(col, B.borderLighten));
  drawLabel(ctx, String(value));
  return c;
}

export function drawWildFace(value) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  const s = B.textureSize;
  const g = ctx.createLinearGradient(0, 0, s, s);
  const stops = CONFIG.boosters.wild.gradient;
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  fillFace(ctx, g);
  drawBorder(ctx, 'rgba(255,255,255,0.7)');
  drawLabel(ctx, String(value));
  return c;
}

export function drawBombFace() {
  const W = CONFIG.boosters.bomb;
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  const s = B.textureSize;
  fillFace(ctx, W.color);
  // dynamite sticks
  ctx.fillStyle = W.bandColor;
  for (let i = 1; i < 4; i++) ctx.fillRect((s / 4) * i - s * 0.012, 0, s * 0.024, s);
  ctx.fillRect(0, 0, s, s * 0.12);
  ctx.fillRect(0, s * 0.88, s, s * 0.12);
  // label band
  ctx.fillStyle = W.labelColor;
  ctx.fillRect(0, s * 0.32, s, s * 0.36);
  ctx.font = `900 ${s * 0.3}px Impact, "Arial Black", ${B.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = W.textColor;
  ctx.fillText(W.text, s / 2, s / 2 + s * 0.015);
  return c;
}

export function drawGloveFace(img) {
  const G = CONFIG.boosters.glove;
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  const s = B.textureSize;
  fillFace(ctx, G.background);
  drawBorder(ctx, 'rgba(200,30,30,0.6)');
  const d = s * G.imageScale;
  ctx.drawImage(img, (s - d) / 2, (s - d) / 2, d, d);
  return c;
}

export function drawMysteryFace() {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  fillFace(ctx, '#c42020');
  drawBorder(ctx, '#ff6b6b');
  drawLabel(ctx, '?');
  return c;
}

/** Caches canvas textures and materials per box type so nothing is created twice. */
export class TextureBank {
  constructor(renderer, gloveImage) {
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.gloveImage = gloveImage;
    this.textures = new Map();
    this.materials = new Map();
  }

  _texture(key, draw) {
    let t = this.textures.get(key);
    if (!t) {
      t = new THREE.CanvasTexture(draw());
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = this.anisotropy;
      this.textures.set(key, t);
    }
    return t;
  }

  _material(key, map) {
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map, roughness: B.roughness, metalness: B.metalness });
      this.materials.set(key, m);
    }
    return m;
  }

  valueTexture(v) { return this._texture('v' + v, () => drawValueFace(v)); }
  wildTexture(v) { return this._texture('w' + v, () => drawWildFace(v)); }
  bombTexture() { return this._texture('bomb', drawBombFace); }
  gloveTexture() { return this._texture('glove', () => drawGloveFace(this.gloveImage)); }

  valueMaterial(v) { return this._material('v' + v, this.valueTexture(v)); }
  bombMaterial() { return this._material('bomb', this.bombTexture()); }
  gloveMaterial() { return this._material('glove', this.gloveTexture()); }

  /** One shared material for all wild boxes; its map is swapped every cycle tick. */
  wildMaterial() {
    let m = this.materials.get('wild');
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: this.wildTexture(2),
        roughness: B.roughness,
        metalness: B.metalness,
        emissive: new THREE.Color('#ff00ff'),
        emissiveIntensity: CONFIG.boosters.wild.emissiveIntensity,
      });
      this.materials.set('wild', m);
    }
    return m;
  }

  /** Canvas used to draw the item in the UI. */
  faceCanvas(item) {
    switch (item.kind) {
      case 'bomb': return this.bombTexture().image;
      case 'glove': return this.gloveTexture().image;
      case 'wild': return this.wildTexture(item.displayValue ?? 2).image;
      default: return this.valueTexture(item.value).image;
    }
  }
}
