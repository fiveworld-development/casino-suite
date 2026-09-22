// Kraken's Hoard sound design. Each entry is a synth fallback; drop a real
// file at public/assets/krakens-hoard/sfx/<name>.mp3 to replace it (see docs/06-asset-guide.md).
import { Sound, midi } from '../../shared/sound.js';

// D minor / D harmonic minor → "pirate" colour
const SCALE = [62, 64, 65, 67, 69, 70, 73, 74, 76, 77, 79, 81, 82, 85, 86];

const R = {
  spin: (s) => {
    s.noiseHit({ dur: 0.35, vol: 0.25, type: 'bandpass', freq: 400, to: 2400, q: 0.8 });
    s.tone({ type: 'triangle', freq: 90, to: 60, dur: 0.2, vol: 0.2, wet: 0 });
  },
  land: (s, o) => {
    // short wooden knock instead of a bass thump
    const p = o.rate ?? 1;
    s.tone({ type: 'triangle', freq: 320 * p, to: 180 * p, dur: 0.07, vol: 0.12, wet: 0.05 });
    s.noiseHit({ dur: 0.05, vol: 0.12, type: 'bandpass', freq: 2200 * p, q: 3, wet: 0.1 });
  },
  scatterLand: (s, o) => {
    const n = o.step ?? 0;
    s.bell(midi(74 + n * 5), { vol: 0.28, dur: 2 });
    s.tone({ freq: midi(50 + n * 5), dur: 1.4, vol: 0.2, type: 'triangle' });
  },
  anticipation: (s) => {
    const a = s.tone({ type: 'sine', freq: 330, to: 990, dur: 2.2, vol: 0.06, attack: 1.2, wet: 0.5 });
    const b = s.noiseHit({ dur: 2.2, vol: 0.12, type: 'bandpass', freq: 300, to: 3000, q: 4, attack: 1.5, wet: 0.5 });
    return { stop: () => { try { a.stop(); b.stop(0.1); } catch { /* ended */ } } };
  },
  win: (s, o) => {
    const lvl = Math.min(o.level ?? 0, 8);
    for (let i = 0; i < 4 + lvl; i++) s.bell(midi(SCALE[(i * 2 + lvl) % SCALE.length]), { at: i * 0.055, vol: 0.13 });
    s.tone({ type: 'triangle', freq: midi(50 + lvl), dur: 0.8, vol: 0.2 });
  },
  explode: (s) => {
    s.noiseHit({ dur: 0.35, vol: 0.25, freq: 5000, to: 600, wet: 0.3 });
    s.bell(midi(93), { vol: 0.08, dur: 0.6 });
  },
  plank: (s) => {
    // wood crack: sharp transients + low body thud
    for (let i = 0; i < 5; i++) s.noiseHit({ dur: 0.06, vol: 0.5, type: 'highpass', freq: 1500 + Math.random() * 2500, at: i * 0.025 + Math.random() * 0.02, wet: 0.2 });
    s.tone({ freq: 80, to: 40, dur: 0.5, vol: 0.55, wet: 0.2 });
    s.noiseHit({ dur: 0.9, vol: 0.2, freq: 900, to: 150, at: 0.05, wet: 0.6 });
  },
  kraken: (s) => {
    s.tone({ freq: 70, to: 40, dur: 1.2, vol: 0.3, attack: 0.1, wet: 0.5 });
    s.noiseHit({ dur: 1.4, vol: 0.35, type: 'bandpass', freq: 250, to: 90, q: 3, attack: 0.1, wet: 0.6 });
    s.noiseHit({ dur: 1.2, vol: 0.25, freq: 1400, to: 300, at: 0.35, wet: 0.5 }); // water splash
  },
  wildFlip: (s) => { s.bell(midi(81), { vol: 0.15, dur: 0.8 }); s.noiseHit({ dur: 0.25, vol: 0.2, type: 'highpass', freq: 4000, wet: 0.4 }); },
  coin: (s) => s.bell(1800 + Math.random() * 900, { vol: 0.07, dur: 0.5 }),
  tick: (s) => s.tone({ type: 'square', freq: 1400 + Math.random() * 200, dur: 0.03, vol: 0.04, wet: 0 }),
  bigWin: (s) => {
    [0, 0.18, 0.36, 0.72].forEach((at, i) => [62, 65, 69, 74].forEach((n) =>
      s.tone({ type: 'sawtooth', freq: midi(n + [0, 0, 3, 5][i] + (i === 3 ? 12 : 0)), dur: i === 3 ? 2.2 : 0.3, vol: 0.06, at, attack: 0.02, wet: 0.5 })));
    s.tone({ freq: 73, to: 36, dur: 1, vol: 0.5, at: 0.72, wet: 0.2 });
  },
  tierUp: (s) => { s.noiseHit({ dur: 0.6, vol: 0.3, type: 'bandpass', freq: 500, to: 5000, q: 2, wet: 0.5 }); s.bell(midi(86), { vol: 0.25 }); },
  fsStart: (s) => {
    s.tone({ freq: 60, to: 30, dur: 2.5, vol: 0.5, wet: 0.7 });
    s.noiseHit({ dur: 3, vol: 0.4, freq: 600, to: 80, wet: 0.8 });
    [62, 65, 69, 74, 77].forEach((n, i) => s.bell(midi(n), { at: 0.6 + i * 0.12, vol: 0.2 }));
  },
  thunder: (s) => {
    s.noiseHit({ dur: 0.15, vol: 0.5, type: 'highpass', freq: 2000, wet: 0.4 });
    s.noiseHit({ dur: 3.5, vol: 0.55, freq: 300, to: 60, attack: 0.08, at: 0.05, wet: 0.8 });
  },
  multUp: (s, o) => { const n = Math.min(o.mult ?? 2, 20); s.tone({ type: 'triangle', freq: midi(62 + n), to: midi(74 + n), dur: 0.35, vol: 0.2 }); s.bell(midi(86 + (n % 5)), { vol: 0.15 }); },
  coinLoop: () => null, // file only: sfx/coinLoop.mp3
  click: (s) => s.tone({ type: 'triangle', freq: 900, to: 600, dur: 0.05, vol: 0.12, wet: 0 }),
  error: (s) => s.tone({ type: 'square', freq: 140, dur: 0.25, vol: 0.12, wet: 0 }),
  // ---- loops ----
  ocean: (s) => {
    // soft surf: band-limited noise swelling slowly, kept well in the background
    const n = s.noiseHit({ dur: 1, vol: 0.035, type: 'bandpass', freq: 700, q: 0.6, loop: true, attack: 3, wet: 0.4 });
    const lfo = s.ctx.createOscillator(), lg = s.ctx.createGain();
    lfo.frequency.value = 0.09; lg.gain.value = 300;
    lfo.connect(lg).connect(n.f.frequency); lfo.start();
    return { stop: (f) => { n.stop(f); lfo.stop(s.ctx.currentTime + f); } };
  },
  storm: (s) => {
    const rain = s.noiseHit({ dur: 1, vol: 0.045, type: 'highpass', freq: 3000, loop: true, attack: 1.5, wet: 0.3 });
    const wind = s.noiseHit({ dur: 1, vol: 0.05, type: 'bandpass', freq: 500, q: 3, loop: true, attack: 2, wet: 0.5 });
    const lfo = s.ctx.createOscillator(), lg = s.ctx.createGain();
    lfo.frequency.value = 0.2; lg.gain.value = 250;
    lfo.connect(lg).connect(wind.f.frequency); lfo.start();
    return { stop: (f) => { rain.stop(f); wind.stop(f); lfo.stop(s.ctx.currentTime + f); } };
  },
  // Music only plays from a real file (sfx/music.mp3) – a synthesized drone just drones.
  music: () => null,
};

export const sfx = new Sound(`${import.meta.env.BASE_URL}assets/krakens-hoard/sfx`, Object.keys(R), ['bigWin', 'coinLoop']); // real recordings in public/assets (see THIRD_PARTY.md)
export const play = (name, opts) => sfx.play(name, R[name], opts);
export const loop = (name, opts) => sfx.loop(name, R[name], opts);
export const stopLoop = (name, fade) => sfx.stopLoop(name, fade);
export const SFX_NAMES = Object.keys(R);
