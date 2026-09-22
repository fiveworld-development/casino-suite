// Kraken's Hoard – sound identity: ORCHESTRAL / MARITIME.
// Brass horns, taiko drums, a low choir, creaking wood and a layered ocean.
// Deliberately shares nothing with Haze Kings (dub/trap) – each machine has its own voice.
// Each entry is a synth fallback; a real file at public/assets/krakens-hoard/sfx/<name>.mp3 wins.
import { Sound, midi } from '../../shared/sound.js';
import { startMusic } from '../../shared/music.js';

// D minor / D harmonic minor → "pirate" colour
const SCALE = [62, 64, 65, 67, 69, 70, 73, 74, 76, 77, 79, 81, 82, 85, 86];

/** Warm brass section: detuned saws through a closing low-pass. The signature voice of this machine. */
function horn(s, notes, { at = 0, dur = 1.6, vol = 0.07, cutoff = 1400 } = {}) {
  const ctx = s.ctx, t = ctx.currentTime + at;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff * 0.35, t);
  f.frequency.linearRampToValueAtTime(cutoff, t + 0.25);
  f.frequency.exponentialRampToValueAtTime(cutoff * 0.3, t + dur);
  f.Q.value = 0.7;
  f.connect(s.out(1, 0.45));
  for (const n of notes) for (const det of [-7, 7]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = midi(n);
    o.detune.value = det;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.12);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** Dark "men's choir" pad: sine stack with slow vibrato – under the big Kraken moments. */
function choir(s, notes, { at = 0, dur = 2.4, vol = 0.05 } = {}) {
  const ctx = s.ctx, t = ctx.currentTime + at;
  const dest = s.out(1, 0.6);
  for (const n of notes) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = midi(n);
    lfo.frequency.value = 4.5 + Math.random();
    lg.gain.value = 3.5;
    lfo.connect(lg).connect(o.detune);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    lfo.start(t); o.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
}

/** Taiko: woody low drum with a stick attack. */
const taiko = (s, { at = 0, vol = 0.5, freq = 150 } = {}) => {
  s.drum({ freq, to: 52, dur: 0.55, vol, at, click: 0.18, wet: 0.35 });
  s.drum({ freq: freq * 2.1, to: 90, dur: 0.18, vol: vol * 0.35, at, type: 'triangle', wet: 0.2 });
};

const R = {
  spin: (s) => {
    // rope and winch: a short wooden creak instead of a hiss
    s.tone({ type: 'triangle', freq: 240, to: 150, dur: 0.18, vol: 0.1, wet: 0.15 });
    s.drum({ freq: 110, to: 60, dur: 0.22, vol: 0.18, wet: 0.2 });
  },
  land: (s, o) => {
    const p = o.rate ?? 1;
    s.tone({ type: 'triangle', freq: 330 * p, to: 185 * p, dur: 0.07, vol: 0.12, wet: 0.05 });
    s.drum({ freq: 150 * p, to: 80, dur: 0.12, vol: 0.14, wet: 0.1 });
  },
  scatterLand: (s, o) => {
    // ship's bell – every further scatter one step higher
    const n = o.step ?? 0;
    s.bell(midi(74 + n * 5), { vol: 0.3, dur: 2.2 });
    taiko(s, { vol: 0.3, freq: 130 + n * 20 });
  },
  anticipation: (s) => {
    // rising strings over a slow drum roll: something is coming
    const a = s.tone({ type: 'sawtooth', freq: 147, to: 294, dur: 2.4, vol: 0.05, attack: 1.4, wet: 0.6 });
    const b = s.tone({ type: 'sine', freq: 294, to: 588, dur: 2.4, vol: 0.04, attack: 1.6, wet: 0.6 });
    for (let i = 0; i < 14; i++) taiko(s, { at: i * 0.16, vol: 0.06 + i * 0.012, freq: 120 });
    return { stop: () => { try { a.stop(); b.stop(); } catch { /* ended */ } } };
  },
  win: (s, o) => {
    // harp run up the D-minor scale, fuller the bigger the win
    const lvl = Math.min(o.level ?? 0, 8);
    for (let i = 0; i < 4 + lvl; i++) s.bell(midi(SCALE[(i * 2 + lvl) % SCALE.length]), { at: i * 0.055, vol: 0.13 });
    horn(s, [50 + lvl, 57 + lvl], { dur: 0.7, vol: 0.03, cutoff: 1800 });
  },
  explode: (s) => {
    // a barrel bursting: wood splinters, no white-noise blast
    s.drum({ freq: 220, to: 70, dur: 0.3, vol: 0.3, click: 0.12, wet: 0.25 });
    s.bell(midi(93), { vol: 0.07, dur: 0.5 });
  },
  plank: (s) => {
    // plank cracking: sharp wood transients over a hollow body
    for (let i = 0; i < 3; i++) s.noiseHit({ dur: 0.05, vol: 0.2, type: 'bandpass', freq: 1700 + Math.random() * 1200, q: 2.5, at: i * 0.03, wet: 0.2 });
    s.drum({ freq: 190, to: 55, dur: 0.5, vol: 0.45, click: 0.2, wet: 0.3 });
    taiko(s, { at: 0.02, vol: 0.22, freq: 120 });
  },
  kraken: (s) => {
    // the beast surfaces: choir, brass and a taiko hit – the signature moment of this machine
    choir(s, [38, 45, 50], { dur: 2.2, vol: 0.05 });
    horn(s, [38, 45, 50], { dur: 1.8, vol: 0.06, cutoff: 900 });
    taiko(s, { vol: 0.55, freq: 170 });
    s.tone({ freq: 72, to: 42, dur: 1.2, vol: 0.3, attack: 0.02, wet: 0.35 });
    s.noiseHit({ dur: 0.6, vol: 0.05, freq: 800, to: 220, at: 0.35, wet: 0.45 }); // a little water
  },
  wildFlip: (s) => { s.bell(midi(81), { vol: 0.15, dur: 0.8 }); s.bell(midi(86), { at: 0.06, vol: 0.08, dur: 0.6 }); },
  coin: (s) => s.bell(1800 + Math.random() * 900, { vol: 0.07, dur: 0.5 }),
  tick: (s) => s.tone({ type: 'triangle', freq: 1200 + Math.random() * 150, dur: 0.03, vol: 0.05, wet: 0 }),
  bigWin: (s) => {
    // fanfare: brass chords climbing, timpani underneath
    horn(s, [50, 57, 62], { dur: 0.5, vol: 0.06, cutoff: 1800 });
    horn(s, [53, 60, 65], { at: 0.4, dur: 0.5, vol: 0.06, cutoff: 2000 });
    horn(s, [57, 62, 69, 74], { at: 0.8, dur: 2.4, vol: 0.06, cutoff: 2400 });
    [0, 0.4, 0.8].forEach((at, i) => taiko(s, { at, vol: 0.4 + i * 0.08, freq: 150 }));
    [74, 77, 81, 86].forEach((n, i) => s.bell(midi(n), { at: 0.9 + i * 0.1, vol: 0.18 }));
  },
  tierUp: (s) => { [74, 78, 81, 86].forEach((n, i) => s.bell(midi(n), { at: i * 0.07, vol: 0.16 })); horn(s, [50, 57, 62], { at: 0.05, dur: 0.9, vol: 0.04, cutoff: 2200 }); },
  fsStart: (s) => {
    // setting sail: horn call, the section answers, drums
    horn(s, [50, 57], { dur: 0.7, vol: 0.06, cutoff: 1600 });
    horn(s, [50, 53, 57, 62], { at: 0.55, dur: 2.4, vol: 0.05, cutoff: 2000 });
    choir(s, [38, 50, 57], { at: 0.55, dur: 2.6, vol: 0.04 });
    [0.55, 0.9, 1.25].forEach((at) => taiko(s, { at, vol: 0.4 }));
    [62, 65, 69, 74, 77].forEach((n, i) => s.bell(midi(n), { at: 0.6 + i * 0.12, vol: 0.16 }));
  },
  thunder: (s) => {
    s.noiseHit({ dur: 2.8, vol: 0.16, freq: 150, to: 45, attack: 0.15, wet: 0.7 });
    s.tone({ freq: 55, to: 33, dur: 2.2, vol: 0.22, attack: 0.1, wet: 0.6 });
    taiko(s, { vol: 0.3, freq: 90 });
  },
  multUp: (s, o) => { const n = Math.min(o.mult ?? 2, 20); s.bell(midi(74 + n), { vol: 0.16 }); horn(s, [50 + (n % 7), 57], { dur: 0.5, vol: 0.035, cutoff: 2400 }); },
  // ---- the voyage ----
  voyageMile: (s) => s.bell(midi(86 + Math.floor(Math.random() * 4)), { vol: 0.05, dur: 0.35 }),
  island: (s) => {
    // land ho: full fanfare with bells
    horn(s, [50, 57, 62], { dur: 0.45, vol: 0.07, cutoff: 2000 });
    horn(s, [55, 62, 67, 74], { at: 0.35, dur: 2.2, vol: 0.06, cutoff: 2600 });
    [0, 0.35].forEach((at) => taiko(s, { at, vol: 0.45 }));
    [74, 81, 86, 89].forEach((n, i) => s.bell(midi(n), { at: 0.45 + i * 0.09, vol: 0.2 }));
  },
  chestOpen: (s) => {
    s.tone({ type: 'triangle', freq: 300, to: 520, dur: 0.18, vol: 0.12, wet: 0.2 }); // hinge
    for (let i = 0; i < 6; i++) s.bell(1500 + Math.random() * 1500, { at: 0.12 + i * 0.04, vol: 0.07, dur: 0.5 });
  },
  chestBig: (s) => {
    horn(s, [57, 62, 69], { dur: 1.4, vol: 0.06, cutoff: 2600 });
    taiko(s, { vol: 0.45, freq: 160 });
    for (let i = 0; i < 12; i++) s.bell(1600 + Math.random() * 1800, { at: i * 0.05, vol: 0.09, dur: 0.6 });
  },
  coinLoop: () => null, // file only: sfx/coinLoop.mp3
  click: (s) => s.tone({ type: 'triangle', freq: 760, to: 520, dur: 0.06, vol: 0.12, wet: 0.05 }),
  error: (s) => s.tone({ type: 'triangle', freq: 150, to: 110, dur: 0.3, vol: 0.14, wet: 0.1 }),
  // ---- loops ----
  ocean: (s) => {
    // premium surf: deep swell + fine spray + slowly breathing waves, always behind the game
    const ctx = s.ctx;
    const swell = s.noiseHit({ dur: 1, vol: 0.03, type: 'lowpass', freq: 340, q: 0.4, loop: true, attack: 4, wet: 0.5 });
    const spray = s.noiseHit({ dur: 1, vol: 0.008, type: 'bandpass', freq: 2200, q: 0.5, loop: true, attack: 5, wet: 0.6 });
    // three slow LFOs at unrelated rates: the waves never fall into an obvious pattern
    const mk = (rate, depth, target) => {
      const lfo = ctx.createOscillator(), g = ctx.createGain();
      lfo.frequency.value = rate; g.gain.value = depth;
      lfo.connect(g).connect(target); lfo.start();
      return lfo;
    };
    const l1 = mk(0.055, 200, swell.f.frequency);
    const l2 = mk(0.031, 0.012, spray.g.gain);
    const l3 = mk(0.017, 0.02, swell.g.gain);
    return { stop: (f) => { swell.stop(f); spray.stop(f); [l1, l2, l3].forEach((l) => l.stop(ctx.currentTime + f)); } };
  },
  storm: (s) => {
    // rain on the deck plus wind, kept dark so it never hisses
    const rain = s.noiseHit({ dur: 1, vol: 0.03, type: 'bandpass', freq: 1800, q: 0.7, loop: true, attack: 2, wet: 0.35 });
    const wind = s.noiseHit({ dur: 1, vol: 0.05, type: 'lowpass', freq: 420, q: 1.2, loop: true, attack: 2.5, wet: 0.5 });
    const lfo = s.ctx.createOscillator(), lg = s.ctx.createGain();
    lfo.frequency.value = 0.14; lg.gain.value = 180;
    lfo.connect(lg).connect(wind.f.frequency); lfo.start();
    return { stop: (f) => { rain.stop(f); wind.stop(f); lfo.stop(s.ctx.currentTime + f); } };
  },
  // procedural soundtrack: a slow sea shanty on deck, the storm version in the free spins
  music: (s) => startMusic(s, 'shanty', { vol: 0.42 }),
  musicStorm: (s) => startMusic(s, 'tempest', { vol: 0.48 }),
};

export const sfx = new Sound(`${import.meta.env.BASE_URL}assets/krakens-hoard/sfx`, Object.keys(R), ['bigWin', 'coinLoop']); // real recordings in public/assets (see THIRD_PARTY.md)
export const play = (name, opts) => sfx.play(name, R[name], opts);
export const loop = (name, opts) => sfx.loop(name, R[name], opts);
export const stopLoop = (name, fade) => sfx.stopLoop(name, fade);
export const SFX_NAMES = Object.keys(R);
