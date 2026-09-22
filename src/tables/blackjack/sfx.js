// Blackjack sound design: synth fallback for every effect; drop a real file at
// public/assets/blackjack/sfx/<name>.mp3 to replace it (see docs/06-asset-guide.md).
import { Sound } from '../../shared/sound.js';
import { startMusic } from '../../shared/music.js';

const R = {
  card: (s) => s.noiseHit({ dur: 0.1, vol: 0.22, type: 'highpass', freq: 1800, to: 3200, wet: 0.15 }),
  chip: (s) => { s.tone({ type: 'triangle', freq: 1200, to: 900, dur: 0.06, vol: 0.12, wet: 0.1 }); s.noiseHit({ dur: 0.05, vol: 0.15, type: 'bandpass', freq: 3200, q: 4, wet: 0.1 }); },
  shuffle: (s) => { for (let i = 0; i < 6; i++) s.noiseHit({ dur: 0.15, vol: 0.18, type: 'highpass', freq: 1500, at: i * 0.08, wet: 0.2 }); },
  win: (s) => { [0, 4, 7, 12].forEach((n, i) => s.bell(440 * 2 ** (n / 12), { at: i * 0.05, vol: 0.16 })); },
  blackjack: (s) => { [0, 4, 7, 12, 16].forEach((n, i) => s.bell(440 * 2 ** (n / 12), { at: i * 0.06, vol: 0.2 })); s.tone({ type: 'triangle', freq: 110, dur: 0.6, vol: 0.15 }); },
  bust: (s) => s.tone({ type: 'sawtooth', freq: 220, to: 80, dur: 0.4, vol: 0.18, wet: 0.1 }),
  push: (s) => s.tone({ type: 'sine', freq: 330, dur: 0.3, vol: 0.14, wet: 0.1 }),
  click: (s) => s.tone({ type: 'triangle', freq: 900, to: 650, dur: 0.05, vol: 0.1, wet: 0 }),
  error: (s) => s.tone({ type: 'sine', freq: 180, dur: 0.2, vol: 0.12, wet: 0 }),
  music: (s) => startMusic(s, 'reggae', { vol: 0.28 }), // lounge background, replaced by sfx/music.mp3 if present
};

export const sfx = new Sound('/assets/blackjack/sfx', Object.keys(R));
export const play = (name, opts) => sfx.play(name, R[name], opts);
export const loop = (name, opts) => sfx.loop(name, R[name], opts);
