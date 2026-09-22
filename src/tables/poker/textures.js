// Canvas-rendered gradient "gold text" for premium hand-name / win callouts.
// Adapted from src/games/krakens-hoard/textures.js's GoldText for the poker table.
import { Container, Sprite, Texture } from 'pixi.js';

const PALETTES = {
  gold: [['0', '#fffbe0'], ['0.35', '#ffe27a'], ['0.55', '#f5b82e'], ['1', '#9c5a10']],
  green: [['0', '#eafff4'], ['0.4', '#7dffbf'], ['1', '#0b7a55']],
  white: [['0', '#ffffff'], ['1', '#d9e4ff']],
};

export class GoldText extends Container {
  constructor(w, h, size, {
    palette = 'gold', stroke = '#2b1403', glow = 'rgba(255,170,40,.75)',
    font = '"Cinzel Decorative", "Cinzel", serif', weight = 900,
  } = {}) {
    super();
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    this.canvas = c;
    this.cfg = {
      w, h, size, palette, stroke, glow, font, weight,
    };
    this.sprite = new Sprite(Texture.from(c));
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(0.5);
    this.addChild(this.sprite);
    this.value = null;
  }

  set text(v) {
    if (v === this.value) return;
    this.value = v;
    const {
      w, h, size, palette, stroke, glow, font, weight,
    } = this.cfg;
    const g = this.canvas.getContext('2d');
    const W = w * 2, H = h * 2;
    g.clearRect(0, 0, W, H);
    let fs = size * 2;
    g.font = `${weight} ${fs}px ${font}`;
    const maxW = W - 40;
    const mw = g.measureText(v).width;
    if (mw > maxW) { fs *= maxW / mw; g.font = `${weight} ${fs}px ${font}`; }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const y = H / 2 + fs * 0.05;
    const lg = g.createLinearGradient(0, y - fs / 2, 0, y + fs / 2);
    PALETTES[palette].forEach(([o, col]) => lg.addColorStop(Number(o), col));
    g.lineJoin = 'round';
    g.shadowColor = glow;
    g.shadowBlur = fs * 0.35;
    g.lineWidth = fs * 0.16;
    g.strokeStyle = stroke;
    g.strokeText(v, W / 2, y);
    g.shadowBlur = 0;
    g.fillStyle = lg;
    g.fillText(v, W / 2, y);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(0, y - fs / 2, W, fs * 0.28);
    g.globalCompositeOperation = 'source-over';
    this.sprite.texture.source.update();
  }

  get text() { return this.value; }
}
