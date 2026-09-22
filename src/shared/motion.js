// Tiny promise-based tween + particle system driven by a Pixi ticker.
import { Sprite } from 'pixi.js';

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t, s = 1.7) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

// 'scale' is uniform scale; everything else is a plain numeric property.
const get = (o, k) => (k === 'scale' ? o.scale.x : o[k]);
const set = (o, k, v) => (k === 'scale' ? o.scale.set(v) : (o[k] = v));

export class Motion {
  constructor(ticker) {
    this.speed = 1;
    this.tweens = new Set();
    this.particles = new Set();
    ticker.add((tk) => this.update(tk.deltaMS));
  }

  tween(obj, props, ms, fn = ease.outCubic, delay = 0) {
    return new Promise((resolve) => {
      this.tweens.add({ obj, props, ms: Math.max(ms, 1), fn, delay, t: 0, from: null, resolve });
    });
  }

  wait(ms) {
    return this.tween({}, {}, ms, ease.linear);
  }

  kill(obj) {
    for (const tw of this.tweens) if (tw.obj === obj) { this.tweens.delete(tw); tw.resolve(); }
  }

  /** opts: texture, parent, x, y, vx, vy, gravity, life(ms), scale, endScale, spin, alpha, tint, blend, drag */
  emit(o) {
    const s = new Sprite(o.texture);
    s.anchor.set(0.5);
    s.position.set(o.x, o.y);
    s.scale.set(o.scale ?? 1);
    s.rotation = o.rotation ?? Math.random() * Math.PI * 2;
    s.alpha = o.alpha ?? 1;
    if (o.tint != null) s.tint = o.tint;
    if (o.blend) s.blendMode = o.blend;
    o.parent.addChild(s);
    this.particles.add({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.gravity ?? 0, life: o.life ?? 1000, t: 0,
      s0: o.scale ?? 1, s1: o.endScale ?? o.scale ?? 1, a0: s.alpha, spin: o.spin ?? 0, drag: o.drag ?? 1 });
    return s;
  }

  update(dmsRaw) {
    const dms = dmsRaw * this.speed;
    for (const tw of this.tweens) {
      // target destroyed mid-animation → drop the tween instead of throwing every frame
      if (tw.obj.destroyed) { this.tweens.delete(tw); tw.resolve(); continue; }
      tw.t += dms;
      if (tw.t < tw.delay) continue;
      if (!tw.from) tw.from = Object.fromEntries(Object.keys(tw.props).map((k) => [k, get(tw.obj, k)]));
      const p = Math.min(1, (tw.t - tw.delay) / tw.ms);
      const e = tw.fn(p);
      for (const k in tw.props) set(tw.obj, k, tw.from[k] + (tw.props[k] - tw.from[k]) * e);
      if (p >= 1) { this.tweens.delete(tw); tw.resolve(); }
    }
    const dt = dms / 1000;
    for (const p of this.particles) {
      p.t += dms;
      const k = p.t / p.life;
      if (k >= 1 || p.s.destroyed) { p.s.destroy(); this.particles.delete(p); continue; }
      p.vy += p.g * dt;
      p.vx *= p.drag ** (dt * 60);
      p.vy *= p.drag ** (dt * 60);
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      p.s.alpha = p.a0 * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
  }
}
