// Haze Kings 420 – sound identity: DUB / TRAP.
// 808 sub bass, tape echo on everything, dub sirens, offbeat skank stabs, vinyl crackle and an
// airhorn for the features. Deliberately shares nothing with Kraken's Hoard (orchestral/maritime).
// Each entry is a synth fallback; a real file at public/assets/haze-kings/sfx/<name>.mp3 wins.
import { Sound, midi } from '../../shared/sound.js';
import { startMusic } from '../../shared/music.js';

// D minor pentatonic – laid-back reggae colour
const SCALE = [62, 65, 67, 69, 70, 74, 77, 79, 81, 82, 86, 89];

/** 808: long sub with a pitch drop – the backbone of this machine. */
const sub808 = (s, { note = 38, at = 0, dur = 1.1, vol = 0.5, drop = 1.6 } = {}) =>
  s.drum({ freq: midi(note) * drop, to: midi(note), dur, vol, at, click: 0.1, wet: 0.15 });

/** Offbeat skank: short organ-ish chord stab through the tape echo. */
function skank(s, notes, { at = 0, vol = 0.07, dur = 0.16 } = {}) {
  const ctx = s.ctx, t = ctx.currentTime + at;
  const dest = s.echo({ time: 0.26, fb: 0.3, mix: 0.3 });
  for (const n of notes) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = midi(n);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

/** Dub siren: square wave wobbling up and down, drenched in echo. */
function siren(s, { at = 0, dur = 1.2, vol = 0.05, base = 620, depth = 260, rate = 6 } = {}) {
  const ctx = s.ctx, t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'square';
  o.frequency.value = base;
  lfo.type = 'sine';
  lfo.frequency.value = rate;
  lg.gain.value = depth;
  lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(s.echo({ time: 0.22, fb: 0.42, mix: 0.36 }));
  o.start(t); lfo.start(t);
  o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
}

/** Airhorn – the reggae/dancehall signal that something big just happened. */
function airhorn(s, { at = 0, dur = 1.1, vol = 0.05 } = {}) {
  const ctx = s.ctx, t = ctx.currentTime + at;
  const dest = s.echo({ time: 0.3, fb: 0.28, mix: 0.25 });
  for (const [mult, v] of [[1, 1], [2, 0.6], [3, 0.35], [4, 0.2], [5, 0.12]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(midi(69) * mult * 0.6, t);
    o.frequency.exponentialRampToValueAtTime(midi(69) * mult, t + 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * v, t + 0.05);
    g.gain.setValueAtTime(vol * v, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

const R = {
  spin: (s) => {
    // tape-stop flick plus a soft kick, no hiss
    s.tone({ type: 'triangle', freq: 420, to: 180, dur: 0.14, vol: 0.08, wet: 0.1 });
    s.drum({ freq: 120, to: 55, dur: 0.22, vol: 0.22, wet: 0.1 });
  },
  land: (s, o) => {
    const p = o.rate ?? 1;
    s.tone({ type: 'sine', freq: 230 * p, to: 150 * p, dur: 0.08, vol: 0.12, wet: 0.1 });
    s.drum({ freq: 160 * p, to: 90, dur: 0.1, vol: 0.12, type: 'triangle', wet: 0.1 });
  },
  puff: (s) => s.noiseHit({ dur: 0.45, vol: 0.14, type: 'lowpass', freq: 900, to: 260, wet: 0.5 }),
  scatterLand: (s, o) => {
    // rimshot + echo, one step up the scale per scatter
    const n = o.step ?? 0;
    s.bell(midi(74 + n * 4), { vol: 0.22, dur: 1.6 });
    skank(s, [62 + n * 2, 69 + n * 2], { vol: 0.06 });
  },
  anticipation: (s) => {
    // trap riser: filtered saw climbing with a hi-hat roll
    const a = s.tone({ type: 'sawtooth', freq: 180, to: 720, dur: 2.4, vol: 0.05, attack: 1.3, wet: 0.5 });
    for (let i = 0; i < 16; i++) s.noiseHit({ dur: 0.03, vol: 0.05 + i * 0.004, type: 'highpass', freq: 7000, at: i * 0.14, wet: 0.1 });
    return { stop: () => { try { a.stop(); } catch { /* ended */ } } };
  },
  win: (s, o) => {
    // dub chords through the echo, fuller the bigger the win
    const lvl = Math.min(o.level ?? 0, 8);
    for (let i = 0; i < 3 + Math.ceil(lvl / 2); i++) skank(s, [SCALE[(i + lvl) % SCALE.length], SCALE[(i + lvl + 2) % SCALE.length]], { at: i * 0.18, vol: 0.07 });
    sub808(s, { note: 38 + (lvl % 5), vol: 0.32, dur: 0.8 });
  },
  explode: (s) => {
    s.drum({ freq: 320, to: 90, dur: 0.22, vol: 0.22, click: 0.1, wet: 0.25 });
    s.bell(midi(90), { vol: 0.07, dur: 0.45 });
  },
  grind: (s) => {
    // grinder: short rattling clicks with a low motor hum
    for (let i = 0; i < 6; i++) s.noiseHit({ dur: 0.05, vol: 0.14, type: 'bandpass', freq: 1200 + Math.random() * 900, q: 3, at: i * 0.045, wet: 0.15 });
    s.tone({ type: 'sawtooth', freq: 90, to: 70, dur: 0.4, vol: 0.12, wet: 0.1 });
  },
  lighter: (s) => {
    s.noiseHit({ dur: 0.05, vol: 0.14, type: 'highpass', freq: 5000, wet: 0.2 }); // flint
    s.tone({ type: 'triangle', freq: 700, to: 320, dur: 0.16, vol: 0.1, at: 0.06, wet: 0.3 });
  },
  blaze: (s) => {
    // dub siren + 808 drop
    siren(s, { dur: 1.1, vol: 0.055 });
    sub808(s, { note: 33, vol: 0.45, dur: 1.2 });
  },
  bigsmoke: (s) => {
    siren(s, { dur: 1.8, vol: 0.05, base: 480, rate: 3.2 });
    s.noiseHit({ dur: 1.4, vol: 0.1, type: 'lowpass', freq: 1100, to: 220, attack: 0.3, wet: 0.6 });
  },
  multUp: (s, o) => {
    const n = Math.min(o.mult ?? 2, 20);
    skank(s, [62 + n, 69 + n], { vol: 0.08 });
    s.bell(midi(84 + (n % 5)), { vol: 0.12 });
  },
  bong: (s) => {
    // bubbling water: random blips through a low-pass, then the pull
    for (let i = 0; i < 7; i++) s.tone({ type: 'sine', freq: 180 + Math.random() * 220, to: 90, dur: 0.09, vol: 0.09, at: i * 0.06, wet: 0.4 });
    s.noiseHit({ dur: 0.5, vol: 0.1, type: 'lowpass', freq: 700, to: 260, at: 0.35, wet: 0.5 });
  },
  coin: (s) => s.bell(1500 + Math.random() * 700, { vol: 0.07, dur: 0.45 }),
  tick: (s) => s.noiseHit({ dur: 0.02, vol: 0.05, type: 'highpass', freq: 8000, wet: 0 }), // hi-hat
  bigWin: (s) => {
    // dancehall drop: airhorn, 808 and skank chords on the offbeat
    airhorn(s, { dur: 1.2, vol: 0.055 });
    sub808(s, { note: 38, vol: 0.5, dur: 1.4, at: 0.15 });
    [0.5, 0.75, 1, 1.25, 1.5].forEach((at, i) => skank(s, [62, 65 + (i % 3), 69], { at, vol: 0.07 }));
  },
  tierUp: (s) => { siren(s, { dur: 0.7, vol: 0.05, rate: 9 }); s.bell(midi(84), { vol: 0.2 }); },
  fsStart: (s) => {
    airhorn(s, { dur: 1.4, vol: 0.06 });
    sub808(s, { note: 33, vol: 0.5, dur: 2, at: 0.2 });
    [0.6, 0.85, 1.1, 1.35].forEach((at, i) => skank(s, [62 + i, 69, 74], { at, vol: 0.07 }));
  },
  cloud9: (s) => {
    siren(s, { dur: 2.2, vol: 0.055, base: 700, rate: 5 });
    airhorn(s, { at: 0.5, dur: 1.6, vol: 0.06 });
    sub808(s, { note: 31, vol: 0.5, dur: 2.6, at: 0.5 });
    [62, 66, 69, 73, 78, 81].forEach((n, i) => s.bell(midi(n), { at: 0.8 + i * 0.1, vol: 0.18 }));
  },
  // ---- the grow ----
  growStep: (s) => { skank(s, [67, 74], { vol: 0.06 }); s.bell(midi(81), { vol: 0.08, dur: 0.5 }); },
  harvest: (s) => {
    airhorn(s, { dur: 1.3, vol: 0.06 });
    sub808(s, { note: 36, vol: 0.5, dur: 1.6, at: 0.1 });
    for (let i = 0; i < 10; i++) s.bell(midi(SCALE[i % SCALE.length] + 12), { at: 0.3 + i * 0.07, vol: 0.12 });
  },
  coinLoop: () => null, // file only: sfx/coinLoop.mp3
  click: (s) => s.noiseHit({ dur: 0.03, vol: 0.09, type: 'bandpass', freq: 2500, q: 2, wet: 0 }),
  error: (s) => s.tone({ type: 'sawtooth', freq: 120, to: 90, dur: 0.28, vol: 0.12, wet: 0.1 }),
  // ---- loops ----
  vinyl: (s) => {
    // vinyl crackle + room tone under the reggae: the lounge never feels silent
    const crackle = s.noiseHit({ dur: 1, vol: 0.012, type: 'highpass', freq: 5200, loop: true, attack: 2, wet: 0.2 });
    const room = s.noiseHit({ dur: 1, vol: 0.02, type: 'lowpass', freq: 320, loop: true, attack: 3, wet: 0.4 });
    return { stop: (f) => { crackle.stop(f); room.stop(f); } };
  },
  // procedural soundtrack (replaced automatically by sfx/music.mp3 / musicBonus.mp3 if present)
  music: (s) => startMusic(s, 'reggae', { vol: 0.45 }),
  musicBonus: (s) => startMusic(s, 'trap', { vol: 0.5 }),
};

export const sfx = new Sound(`${import.meta.env.BASE_URL}assets/haze-kings/sfx`, Object.keys(R), ['bigWin', 'coinLoop']); // real recordings in public/assets (see THIRD_PARTY.md)
export const play = (name, opts) => sfx.play(name, R[name], opts);
export const loop = (name, opts) => sfx.loop(name, R[name], opts);
export const stopLoop = (name, fade) => sfx.stopLoop(name, fade);
export const SFX_NAMES = Object.keys(R);
