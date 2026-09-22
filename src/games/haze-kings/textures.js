// Procedural textures (glows, sparks, leaves…) drawn with Canvas2D,
// plus GoldText: gradient/stroke/glow text rendered to a canvas for a premium look.
import { Container, Sprite, Texture } from 'pixi.js';

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
    g.fillStyle = radial(g, 16, 16, 0, 16, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(190,255,210,.85)'], [1, 'rgba(60,255,140,0)']]);
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
    g.fillStyle = radial(g, 256, 256, 150, 370, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.92)']]);
    g.fillRect(0, 0, 512, 512);
  });
  T.coin = canvasTex(128, 128, (g) => {
    g.fillStyle = radial(g, 46, 42, 4, 64, [[0, '#fffbd6'], [0.4, '#f7c948'], [0.82, '#b7791f'], [1, '#5c360a']]);
    g.beginPath(); g.arc(64, 64, 61, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = 'rgba(110,62,8,.9)';
    g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(100,55,5,.9)'; g.font = 'bold 50px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('420', 64, 68);
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.ellipse(44, 36, 22, 10, -0.6, 0, Math.PI * 2); g.fill();
  });
  T.leafTint = canvasTex(64, 64, (g) => {
    g.fillStyle = radial(g, 32, 32, 0, 32, [[0, 'rgba(180,255,190,1)'], [0.5, 'rgba(90,220,110,.8)'], [1, 'rgba(40,160,70,0)']]);
    g.fillRect(0, 0, 64, 64);
  });
  T.smoke = canvasTex(256, 256, (g) => {
    g.fillStyle = radial(g, 128, 128, 10, 128, [[0, 'rgba(255,255,255,.55)'], [0.5, 'rgba(220,220,230,.28)'], [1, 'rgba(220,220,230,0)']]);
    g.fillRect(0, 0, 256, 256);
  });
  T.beam = canvasTex(64, 512, (g) => {
    const lg = g.createLinearGradient(0, 0, 64, 0);
    lg.addColorStop(0, 'rgba(120,255,170,0)'); lg.addColorStop(0.5, 'rgba(170,255,200,.9)'); lg.addColorStop(1, 'rgba(120,255,170,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 512);
  });
  T.ring = canvasTex(256, 256, (g) => {
    g.strokeStyle = radial(g, 128, 128, 60, 128, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
    g.lineWidth = 22;
    g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke();
  });
  T.white = Texture.WHITE;
  return T;
}

const PALETTES = {
  gold: [['0', '#fffdf0'], ['0.35', '#e4ff9a'], ['0.6', '#7cf59a'], ['1', '#2fc46e']], // bright bottom: stays legible
  purple: [['0', '#f7e0ff'], ['0.4', '#d47aff'], ['1', '#7a10a0']],
  white: [['0', '#ffffff'], ['1', '#d9ffe4']],
  rainbow: [['0', '#fff3b0'], ['0.3', '#7affa0'], ['0.6', '#7ad2ff'], ['1', '#d07aff']],
};

/** Canvas-rendered gradient text. Tween the container's scale/alpha freely. */
export class GoldText extends Container {
  constructor(w, h, size, { palette = 'gold', stroke = '#031a0c', glow = 'rgba(120,255,150,.75)', font = 'Montserrat, "Baloo 2", sans-serif', weight = 900 } = {}) {
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
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const y = H / 2 + fs * 0.05;
    const lg = g.createLinearGradient(0, y - fs / 2, 0, y + fs / 2);
    PALETTES[palette].forEach(([o, col]) => lg.addColorStop(Number(o), col));
    g.lineJoin = 'round';
    // 1) dark drop shadow for contrast on any background, 2) neon glow + crisp outline
    g.shadowColor = 'rgba(0,0,0,.9)';
    g.shadowBlur = fs * 0.22;
    g.shadowOffsetY = fs * 0.07;
    g.lineWidth = fs * 0.2;
    g.strokeStyle = stroke;
    g.strokeText(v, W / 2, y);
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
