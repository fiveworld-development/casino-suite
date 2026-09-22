// Poker lounge sounds: synth fallback for every effect; drop public/assets/poker/sfx/<name>.mp3 to replace.
import { Sound } from '../../shared/sound.js';
import { startMusic } from '../../shared/music.js';

const R = {
  card: (s) => s.noiseHit({ dur: 0.09, vol: 0.22, type: 'highpass', freq: 1800, to: 3400, wet: 0.15 }),
  chip: (s) => { s.tone({ type: 'triangle', freq: 1250, to: 950, dur: 0.06, vol: 0.12, wet: 0.1 }); s.noiseHit({ dur: 0.05, vol: 0.14, type: 'bandpass', freq: 3300, q: 4, wet: 0.1 }); },
  fold: (s) => s.noiseHit({ dur: 0.18, vol: 0.14, type: 'lowpass', freq: 1400, to: 400, wet: 0.2 }),
  check: (s) => { s.tone({ type: 'sine', freq: 180, to: 120, dur: 0.07, vol: 0.2, wet: 0 }); s.tone({ type: 'sine', freq: 180, to: 120, dur: 0.07, vol: 0.2, at: 0.12, wet: 0 }); },
  turn: (s) => { s.bell(880, { vol: 0.12, dur: 0.7 }); s.bell(1320, { vol: 0.08, at: 0.1, dur: 0.6 }); },
  win: (s) => [0, 4, 7, 12].forEach((n, i) => s.bell(440 * 2 ** (n / 12), { at: i * 0.06, vol: 0.16 })),
  big: (s) => { [0, 4, 7, 12, 16, 19].forEach((n, i) => s.bell(392 * 2 ** (n / 12), { at: i * 0.07, vol: 0.2 })); s.tone({ type: 'triangle', freq: 98, dur: 0.9, vol: 0.2 }); },
  lose: (s) => s.tone({ type: 'sine', freq: 300, to: 180, dur: 0.35, vol: 0.12, wet: 0.2 }),
  collect: (s) => { for (let i = 0; i < 4; i++) s.noiseHit({ dur: 0.05, vol: 0.12, type: 'bandpass', freq: 3000, q: 4, at: i * 0.04, wet: 0.1 }); },
  allin: (s) => { for (let i = 0; i < 8; i++) s.noiseHit({ dur: 0.05, vol: 0.14, type: 'bandpass', freq: 2800, q: 4, at: i * 0.035, wet: 0.1 }); },
  vpcard: (s) => s.noiseHit({ dur: 0.08, vol: 0.2, type: 'highpass', freq: 2200, to: 3800, wet: 0.1 }),
  flip: (s) => s.noiseHit({ dur: 0.06, vol: 0.18, type: 'bandpass', freq: 2600, q: 2, wet: 0.1 }),
  click: (s) => s.tone({ type: 'triangle', freq: 900, to: 650, dur: 0.05, vol: 0.1, wet: 0 }),
  error: (s) => s.tone({ type: 'sine', freq: 180, dur: 0.2, vol: 0.12, wet: 0 }),
  music: (s) => startMusic(s, 'reggae', { vol: 0.26 }),
};

export const sfx = new Sound(`${import.meta.env.BASE_URL}assets/poker/sfx`, Object.keys(R), ['allin', 'big', 'card', 'chip', 'collect', 'flip', 'vpcard', 'win']); // real recordings in public/assets (see THIRD_PARTY.md)
export const play = (name, opts) => sfx.play(name, R[name], opts);
export const loop = (name, opts) => sfx.loop(name, R[name], opts);
