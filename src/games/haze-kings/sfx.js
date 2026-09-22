// Haze Kings 420 sound design. Each entry is a synth fallback; drop a real
// file at public/assets/haze-kings/sfx/<name>.mp3 to replace it.
import { Sound, midi } from '../../shared/sound.js';
import { startMusic } from '../../shared/music.js';

// D minor pentatonic-ish, laid-back reggae/lofi colour
const SCALE = [62, 65, 67, 69, 70, 74, 77, 79, 81, 82, 86, 89];

const R = {
  spin: (s) => {
    s.noiseHit({ dur: 0.3, vol: 0.2, type: 'bandpass', freq: 500, to: 2000, q: 0.8 });
    s.tone({ type: 'triangle', freq: 80, to: 55, dur: 0.2, vol: 0.18, wet: 0 });
  },
  land: (s, o) => {
    const p = o.rate ?? 1;
    s.tone({ type: 'sine', freq: 220 * p, to: 140 * p, dur: 0.08, vol: 0.12, wet: 0.1 });
    s.noiseHit({ dur: 0.05, vol: 0.08, type: 'bandpass', freq: 1800 * p, q: 3, wet: 0.1 });
  },
  puff: (s) => {
    s.noiseHit({ dur: 0.5, vol: 0.22, type: 'lowpass', freq: 1200, to: 300, wet: 0.5 });
  },
  scatterLand: (s, o) => {
    const n = o.step ?? 0;
    s.bell(midi(74 + n * 4), { vol: 0.26, dur: 1.8 });
  },
  anticipation: (s) => {
    const a = s.tone({ type: 'sine', freq: 300, to: 900, dur: 2.2, vol: 0.06, attack: 1.2, wet: 0.5 });
    const b = s.noiseHit({ dur: 2.2, vol: 0.1, type: 'bandpass', freq: 300, to: 2600, q: 4, attack: 1.5, wet: 0.5 });
    return { stop: () => { try { a.stop(); b.stop(0.1); } catch { /* ended */ } } };
  },
  win: (s, o) => {
    const lvl = Math.min(o.level ?? 0, 8);
    for (let i = 0; i < 4 + lvl; i++) s.bell(midi(SCALE[(i * 2 + lvl) % SCALE.length]), { at: i * 0.05, vol: 0.13 });
    s.tone({ type: 'triangle', freq: midi(48 + lvl), dur: 0.7, vol: 0.18 });
  },
  explode: (s) => {
    s.noiseHit({ dur: 0.3, vol: 0.22, freq: 4500, to: 500, wet: 0.35 });
    s.bell(midi(90), { vol: 0.08, dur: 0.5 });
  },
  grind: (s) => {
    for (let i = 0; i < 6; i++) s.noiseHit({ dur: 0.09, vol: 0.3, type: 'highpass', freq: 900 + Math.random() * 1600, at: i * 0.045, wet: 0.15 });
    s.tone({ freq: 130, to: 80, dur: 0.4, vol: 0.25, wet: 0.1 });
  },
  lighter: (s) => {
    s.noiseHit({ dur: 0.08, vol: 0.3, type: 'highpass', freq: 4000, wet: 0.2 });
    s.tone({ type: 'sawtooth', freq: 900, to: 300, dur: 0.15, vol: 0.15, at: 0.08, wet: 0.3 });
  },
  blaze: (s) => {
    s.noiseHit({ dur: 0.8, vol: 0.3, type: 'bandpass', freq: 400, to: 3500, q: 2, wet: 0.5 });
    s.tone({ freq: 90, to: 45, dur: 0.9, vol: 0.3, wet: 0.2 });
  },
  bigsmoke: (s) => {
    s.noiseHit({ dur: 1.8, vol: 0.25, type: 'lowpass', freq: 1500, to: 200, attack: 0.3, wet: 0.6 });
  },
  multUp: (s, o) => { const n = Math.min(o.mult ?? 2, 20); s.tone({ type: 'triangle', freq: midi(60 + n), to: midi(72 + n), dur: 0.35, vol: 0.2 }); s.bell(midi(84 + (n % 5)), { vol: 0.15 }); },
  bong: (s) => {
    s.noiseHit({ dur: 0.5, vol: 0.2, type: 'bandpass', freq: 300, to: 900, q: 2, wet: 0.5 });
    s.tone({ freq: 200, to: 260, dur: 0.3, vol: 0.15, wet: 0.3 });
  },
  coin: (s) => s.bell(1700 + Math.random() * 900, { vol: 0.07, dur: 0.45 }),
  tick: (s) => s.tone({ type: 'square', freq: 1300 + Math.random() * 200, dur: 0.03, vol: 0.04, wet: 0 }),
  bigWin: (s) => {
    [0, 0.18, 0.36, 0.72].forEach((at, i) => [62, 65, 69, 74].forEach((n) =>
      s.tone({ type: 'sawtooth', freq: midi(n + [0, 0, 3, 5][i] + (i === 3 ? 12 : 0)), dur: i === 3 ? 2.2 : 0.3, vol: 0.06, at, attack: 0.02, wet: 0.5 })));
    s.tone({ freq: 68, to: 34, dur: 1, vol: 0.5, at: 0.72, wet: 0.2 });
  },
  tierUp: (s) => { s.noiseHit({ dur: 0.6, vol: 0.3, type: 'bandpass', freq: 500, to: 5000, q: 2, wet: 0.5 }); s.bell(midi(84), { vol: 0.25 }); },
  fsStart: (s) => {
    s.tone({ freq: 55, to: 28, dur: 2.5, vol: 0.5, wet: 0.7 });
    [62, 65, 69, 74, 77].forEach((n, i) => s.bell(midi(n), { at: 0.6 + i * 0.12, vol: 0.2 }));
  },
  cloud9: (s) => {
    s.tone({ freq: 50, to: 25, dur: 3, vol: 0.5, wet: 0.8 });
    [62, 66, 69, 73, 78, 81].forEach((n, i) => s.bell(midi(n), { at: 0.6 + i * 0.1, vol: 0.22 }));
  },
  coinLoop: () => null, // file only: sfx/coinLoop.mp3
  click: (s) => s.tone({ type: 'triangle', freq: 900, to: 600, dur: 0.05, vol: 0.12, wet: 0 }),
  error: (s) => s.tone({ type: 'square', freq: 140, dur: 0.25, vol: 0.12, wet: 0 }),
  // procedural soundtrack (replaced automatically by sfx/music.mp3 / musicBonus.mp3 if present)
  music: (s) => startMusic(s, 'reggae', { vol: 0.45 }),
  musicBonus: (s) => startMusic(s, 'trap', { vol: 0.5 }),
};

export const sfx = new Sound('/assets/haze-kings/sfx', Object.keys(R));
export const play = (name, opts) => sfx.play(name, R[name], opts);
export const loop = (name, opts) => sfx.loop(name, R[name], opts);
export const stopLoop = (name, fade) => sfx.stopLoop(name, fade);
export const SFX_NAMES = Object.keys(R);
