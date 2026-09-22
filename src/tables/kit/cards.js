// Code-rendered playing cards: crisp at any resolution (Canvas -> Pixi Texture, 2x resolution).
// Court cards (J/Q/K) frame the "Haze Kings Lounge" art; back uses card_back.webp.
import { Texture, Sprite, Container } from 'pixi.js';

const CARD_W = 240, CARD_H = 336; // logical size (points); rendered at RES x for crispness
const RES = 1.6; // texture density: sharper than any phone/PC shows a card, but ~35 % less GPU memory than 2x
const RED = '#c8283c';
const BLACK = '#111318';
const GOLD = '#d9b45c';

function suitColor(suit) { return suit === 'H' || suit === 'D' ? RED : BLACK; }

// Draws a suit pip at (x,y) with given size. Spades are a stylized leaf-spade per the lounge look,
// but stay unmistakably spade-shaped (red/black correctness preserved via suitColor).
function drawPip(ctx, suit, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = suitColor(suit);
  ctx.beginPath();
  const s = size;
  if (suit === 'H') {
    ctx.moveTo(0, s * 0.32);
    ctx.bezierCurveTo(s * 0.5, -s * 0.35, s * 1.05, s * 0.15, 0, s * 0.95);
    ctx.bezierCurveTo(-s * 1.05, s * 0.15, -s * 0.5, -s * 0.35, 0, s * 0.32);
  } else if (suit === 'D') {
    ctx.moveTo(0, -s * 0.65);
    ctx.lineTo(s * 0.5, 0);
    ctx.lineTo(0, s * 0.65);
    ctx.lineTo(-s * 0.5, 0);
  } else if (suit === 'C') {
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      ctx.moveTo(Math.cos(a) * s * 0.05 + s * 0.32 * Math.cos(a), Math.sin(a) * s * 0.05 + s * 0.32 * Math.sin(a));
      ctx.arc(Math.cos(a) * s * 0.32, Math.sin(a) * s * 0.32, s * 0.34, 0, Math.PI * 2);
    }
    ctx.rect(-s * 0.09, s * 0.1, s * 0.18, s * 0.55);
  } else {
    // leaf-spade: classic spade silhouette with a slightly serrated leaf edge (lounge motif)
    ctx.moveTo(0, -s * 0.7);
    ctx.bezierCurveTo(s * 0.75, -s * 0.05, s * 0.65, s * 0.5, s * 0.05, s * 0.45);
    ctx.bezierCurveTo(s * 0.1, s * 0.75, s * 0.05, s * 0.85, -s * 0.02, s * 0.95);
    ctx.lineTo(0.02 * s, s * 0.95);
    ctx.bezierCurveTo(-s * 0.05, s * 0.85, -s * 0.1, s * 0.75, -s * 0.05, s * 0.45);
    ctx.bezierCurveTo(-s * 0.65, s * 0.5, -s * 0.75, -s * 0.05, 0, -s * 0.7);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const PIP_LAYOUTS = {
  A: [[0.5, 0.5, 1.6]],
  2: [[0.5, 0.22], [0.5, 0.78]],
  3: [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8]],
  4: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.78], [0.72, 0.78]],
  5: [[0.28, 0.22], [0.72, 0.22], [0.5, 0.5], [0.28, 0.78], [0.72, 0.78]],
  6: [[0.28, 0.2], [0.72, 0.2], [0.28, 0.5], [0.72, 0.5], [0.28, 0.8], [0.72, 0.8]],
  7: [[0.28, 0.2], [0.72, 0.2], [0.5, 0.36], [0.28, 0.5], [0.72, 0.5], [0.28, 0.8], [0.72, 0.8]],
  8: [[0.28, 0.18], [0.72, 0.18], [0.28, 0.4], [0.72, 0.4], [0.28, 0.6], [0.72, 0.6], [0.28, 0.82], [0.72, 0.82]],
  9: [[0.28, 0.16], [0.72, 0.16], [0.28, 0.38], [0.72, 0.38], [0.5, 0.5], [0.28, 0.62], [0.72, 0.62], [0.28, 0.84], [0.72, 0.84]],
  10: [[0.28, 0.14], [0.72, 0.14], [0.5, 0.27], [0.28, 0.4], [0.72, 0.4], [0.28, 0.6], [0.72, 0.6], [0.5, 0.73], [0.28, 0.86], [0.72, 0.86]],
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Large, bold corner indices: readable at a glance even when cards are small on phones.
function drawCorner(ctx, rank, suit, x, y, flip) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.rotate(Math.PI);
  ctx.fillStyle = suitColor(suit);
  ctx.font = `800 ${rank === '10' ? 40 : 46}px "Cinzel", "Playfair Display", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(rank, 0, 12);
  drawPip(ctx, suit, 0, 40, 22);
  ctx.restore();
}

/** Renders one card face to an offscreen canvas. courtImg: HTMLImageElement|Canvas for J/Q/K, or null. */
function renderFaceCanvas(rank, suit, courtImg) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * RES;
  canvas.height = CARD_H * RES;
  const ctx = canvas.getContext('2d');
  ctx.scale(RES, RES);
  // base
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 16);
  ctx.fillStyle = '#faf6ec';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();

  // subtle paper gradient + inner gold hairline for a premium finish
  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(210,196,160,.18)');
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 16);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(217,180,92,.55)';
  ctx.lineWidth = 1;
  roundRect(ctx, 7, 7, CARD_W - 14, CARD_H - 14, 11);
  ctx.stroke();

  drawCorner(ctx, rank, suit, 30, 44, false);
  drawCorner(ctx, rank, suit, CARD_W - 30, CARD_H - 44, true);

  if (['J', 'Q', 'K'].includes(rank) && courtImg) {
    const pad = 56;
    const fx = pad, fy = pad, fw = CARD_W - pad * 2, fh = CARD_H - pad * 2;
    ctx.save();
    roundRect(ctx, fx, fy, fw, fh, 10);
    ctx.clip();
    // cover-fit the court art into the frame
    const ir = courtImg.width / courtImg.height, fr = fw / fh;
    let dw, dh;
    if (ir > fr) { dh = fh; dw = dh * ir; } else { dw = fw; dh = dw / ir; }
    ctx.drawImage(courtImg, fx + (fw - dw) / 2, fy + (fh - dh) / 2, dw, dh);
    ctx.restore();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    roundRect(ctx, fx, fy, fw, fh, 10);
    ctx.stroke();
  } else if (rank === 'A') {
    drawPip(ctx, suit, CARD_W / 2, CARD_H / 2, CARD_H * 0.22);
  } else {
    // pips inside the central field (clear of the big corner indices)
    const layout = PIP_LAYOUTS[rank] || [];
    const size = 24;
    const fx = 40, fy = 40, fw = CARD_W - 80, fh = CARD_H - 80;
    for (const [px, py] of layout) drawPip(ctx, suit, fx + px * fw, fy + py * fh, size);
  }
  return canvas;
}

/** Renders the card back using card_back.webp texture (drawn into a canvas so it composes the same way). */
function renderBackCanvas(backImg) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * RES;
  canvas.height = CARD_H * RES;
  const ctx = canvas.getContext('2d');
  ctx.scale(RES, RES);
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 16);
  ctx.fillStyle = '#0c3d2c';
  ctx.fill();
  ctx.save();
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 16);
  ctx.clip();
  if (backImg) {
    const ir = backImg.width / backImg.height, fr = CARD_W / CARD_H;
    let dw, dh;
    if (ir > fr) { dh = CARD_H; dw = dh * ir; } else { dw = CARD_W; dh = dw / ir; }
    ctx.drawImage(backImg, (CARD_W - dw) / 2, (CARD_H - dh) / 2, dw, dh);
  }
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 16);
  ctx.stroke();
  return canvas;
}

/**
 * Builds a texture atlas { faces: Map('AS'->Texture,...), back: Texture, w, h } for use by table games.
 * @param {Record<string, HTMLImageElement>} images keys: court_J, court_Q, court_K, card_back — Pixi Texture.source resources
 */
export function buildCardTextures(images = {}) {
  const courtSrc = { J: images.court_J, Q: images.court_Q, K: images.court_K };
  // faces are drawn lazily the first time a card is shown: fast start-up and far less memory on phones
  const cache = new Map();
  const faces = {
    get(key) {
      let tex = cache.get(key);
      if (!tex) {
        const rank = key.slice(0, -1), suit = key.slice(-1);
        tex = Texture.from(renderFaceCanvas(rank, suit, courtSrc[rank]));
        cache.set(key, tex);
      }
      return tex;
    },
  };
  const back = Texture.from(renderBackCanvas(images.card_back));
  return { faces, back, width: CARD_W, height: CARD_H };
}

/** A Pixi Container representing one physical card sprite with flip/deal helpers. */
export class CardView extends Container {
  constructor(card, atlas) {
    super();
    this.card = card;
    this.atlas = atlas;
    this.faceUp = false;
    this.sprite = new Sprite(atlas.back);
    this.sprite.anchor.set(0.5);
    // Textures are rendered at 2x pixel density (crisp on retina) but must display at the logical
    // card size, so pin the sprite's on-screen size to the atlas's logical width/height.
    this.sprite.width = atlas.width;
    this.sprite.height = atlas.height;
    this.addChild(this.sprite);
  }

  setFaceUp(up) {
    this.faceUp = up;
    this.sprite.texture = up ? this.atlas.faces.get(this.card.rank + this.card.suit) : this.atlas.back;
  }

  /** 3D-style flip: scale x to 0 then back to 1, swapping the texture at the midpoint. */
  async flip(motion, duration = 260) {
    const x0 = this.scale.x;
    await motion.tween(this.scale, { x: 0 }, duration / 2);
    this.setFaceUp(!this.faceUp);
    await motion.tween(this.scale, { x: x0 }, duration / 2);
  }
}
