// Procedural textures (glows, coins, tentacle, rain…) drawn with Canvas2D,
// plus GoldText: gradient/stroke/glow text rendered to a canvas for a premium look.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return Texture.from(c);
}

const radial = (g, x, y, r0, r1, stops) => {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
};

export function makeTextures() {
  const T = {};
  T.glow = canvasTex(128, 128, (g) => {
    g.fillStyle = radial(g, 64, 64, 0, 64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(0, 0, 128, 128);
  });
  T.spark = canvasTex(32, 32, (g) => {
    g.fillStyle = radial(g, 16, 16, 0, 16, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,240,200,.8)'], [1, 'rgba(255,200,80,0)']]);
    g.fillRect(0, 0, 32, 32);
  });
  T.star = canvasTex(64, 64, (g) => {
    g.fillStyle = radial(g, 32, 32, 0, 32, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,230,160,.35)'], [1, 'rgba(255,200,80,0)']]);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,250,220,.95)';
    g.fillRect(31, 2, 2, 60);
    g.fillRect(2, 31, 60, 2);
  });
  T.vignette = canvasTex(512, 512, (g) => {
    g.fillStyle = radial(g, 256, 256, 150, 370, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.9)']]);
    g.fillRect(0, 0, 512, 512);
  });
  T.coin = canvasTex(128, 128, (g) => {
    g.fillStyle = radial(g, 46, 42, 4, 64, [[0, '#fffbd6'], [0.4, '#f7c948'], [0.82, '#b7791f'], [1, '#5c360a']]);
    g.beginPath(); g.arc(64, 64, 61, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = 'rgba(110,62,8,.9)';
    g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,240,180,.6)';
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(100,55,5,.9)'; g.font = 'bold 58px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('☠', 64, 68);
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.ellipse(44, 36, 22, 10, -0.6, 0, Math.PI * 2); g.fill();
  });
  T.orb = canvasTex(256, 256, (g) => {
    g.fillStyle = radial(g, 128, 128, 0, 128, [[0, 'rgba(230,255,240,1)'], [0.25, 'rgba(60,240,170,.95)'], [0.55, 'rgba(10,140,110,.8)'], [0.8, 'rgba(5,60,60,.5)'], [1, 'rgba(0,40,40,0)']]);
    g.fillRect(0, 0, 256, 256);
  });
  T.rain = canvasTex(3, 90, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 90);
    lg.addColorStop(0, 'rgba(190,210,255,0)'); lg.addColorStop(1, 'rgba(200,220,255,.55)');
    g.fillStyle = lg; g.fillRect(0, 0, 3, 90);
  });
  T.chip = canvasTex(28, 10, (g) => {
    g.fillStyle = '#6b4424'; g.fillRect(0, 0, 28, 10);
    g.fillStyle = '#9a6a3c'; g.fillRect(0, 0, 28, 3);
    g.fillStyle = '#3a2210'; g.fillRect(0, 8, 28, 2);
  });
  T.drop = canvasTex(24, 24, (g) => {
    g.fillStyle = radial(g, 12, 12, 0, 12, [[0, 'rgba(230,245,255,1)'], [0.5, 'rgba(120,190,255,.6)'], [1, 'rgba(80,150,255,0)']]);
    g.fillRect(0, 0, 24, 24);
  });
  T.beam = canvasTex(64, 512, (g) => {
    const lg = g.createLinearGradient(0, 0, 64, 0);
    lg.addColorStop(0, 'rgba(255,200,80,0)'); lg.addColorStop(0.5, 'rgba(255,220,120,.9)'); lg.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 512);
  });
  T.white = Texture.WHITE;
  return T;
}

const PALETTES = {
  gold: [['0', '#fffdf0'], ['0.35', '#ffe58a'], ['0.6', '#f7bf3a'], ['1', '#d08a1c']], // bright bottom: stays legible
  green: [['0', '#eafff4'], ['0.4', '#7dffbf'], ['1', '#0b7a55']],
  white: [['0', '#ffffff'], ['1', '#d9e4ff']],
};

/**
 * Dark glass plaque behind a GoldText (and optional subtitle) so result messages stay readable on
 * busy tables. Returns a Container: [plaque, title, subtitle?].
 */
export function plaqueText(title, sub = null, gap = 0) {
  const box = new Container();
  const w = Math.max(title.textW ?? 200, sub?.textW ?? 0) + 70;
  const h = (title.textH ?? 60) * 1.35 + (sub ? (sub.textH ?? 30) * 1.3 + gap : 0) + 30;
  const top = -(title.textH ?? 60) * 0.85 - 15;
  const g = new Graphics()
    .roundRect(-w / 2, top, w, h, 26).fill({ color: 0x04070a, alpha: 0.78 })
    .roundRect(-w / 2, top, w, h, 26).stroke({ width: 2, color: 0xf2c350, alpha: 0.55 });
  box.addChild(g, title);
  if (sub) box.addChild(sub);
  return box;
}

/** Canvas-rendered gradient text. Tween the container's scale/alpha freely. */
export class GoldText extends Container {
  // Montserrat Black by default: display serifs looked great in logos but were hard to read in-game
  constructor(w, h, size, { palette = 'gold', stroke = '#2b1403', glow = 'rgba(255,170,40,.75)', font = 'Montserrat, "Inter", sans-serif', weight = 900 } = {}) {
    super();
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    this.canvas = c;
    this.cfg = { w, h, size, palette, stroke, glow, font, weight };
    this.sprite = new Sprite(Texture.from(c));
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(0.5);
    this.addChild(this.sprite);
    this.value = null;
  }

  set text(v) {
    if (v === this.value) return;
    this.value = v;
    const { w, h, size, palette, stroke, glow, font, weight } = this.cfg;
    const g = this.canvas.getContext('2d');
    const W = w * 2, H = h * 2;
    g.clearRect(0, 0, W, H);
    let fs = size * 2;
    g.font = `${weight} ${fs}px ${font}`;
    const maxW = W - 40;
    const mw = g.measureText(v).width;
    if (mw > maxW) { fs *= maxW / mw; g.font = `${weight} ${fs}px ${font}`; }
    this.textW = g.measureText(v).width / 2; // on-screen size of the glyphs (canvas is 2x)
    this.textH = fs / 2;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const y = H / 2 + fs * 0.05;
    const lg = g.createLinearGradient(0, y - fs / 2, 0, y + fs / 2);
    PALETTES[palette].forEach(([o, col]) => lg.addColorStop(Number(o), col));
    g.lineJoin = 'round';
    // 1) dark drop shadow: guarantees contrast on any background (felt, reels, particles)
    g.shadowColor = 'rgba(0,0,0,.9)';
    g.shadowBlur = fs * 0.22;
    g.shadowOffsetY = fs * 0.07;
    g.lineWidth = fs * 0.2;
    g.strokeStyle = stroke;
    g.strokeText(v, W / 2, y);
    // 2) coloured glow + crisp outline
    g.shadowOffsetY = 0;
    g.shadowColor = glow;
    g.shadowBlur = fs * 0.3;
    g.lineWidth = fs * 0.14;
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
