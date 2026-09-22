// Procedural background music on the WebAudio clock (look-ahead scheduler).
// Styles: 'reggae'  – laid-back lo-fi one-drop with offbeat skank chords, walking bass, vinyl crackle;
//         'trap'    – half-time bonus beat with 808 bass, rolling hats, dreamy pad;
//         'shanty'  – slow 6/8 sea shanty: strings, accordion chords, hand drum, no hiss (Kraken's Hoard);
//         'tempest' – the storm version of the shanty: driving drums and brass (Kraken free spins).
// Returns { stop(fade) } so it plugs into Sound.loop() as a synth "file".
import { midi } from './sound.js';

const PROGRESSIONS = {
  reggae: [[50, 53, 57, 60], [55, 58, 62, 65], [57, 60, 64, 67], [50, 53, 57, 60]], // Dm7 Gm7 Am7 Dm7
  trap: [[50, 53, 57, 62], [46, 50, 53, 58], [48, 52, 55, 60], [45, 49, 52, 57]], // Dm Bb C A
  shanty: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], // Dm Bb Gm A – classic shanty turn
  tempest: [[50, 53, 57], [48, 51, 55], [46, 50, 53], [45, 49, 52]], // Dm Cm Bb A
};

export function startMusic(s, style = 'reggae', { vol = 0.5, music = true } = {}) {
  const ctx = s.ctx;
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2);
  const lp = ctx.createBiquadFilter(); // warm "tape" top end
  lp.type = 'lowpass';
  lp.frequency.value = style === 'reggae' ? 5200 : style === 'shanty' ? 3800 : style === 'tempest' ? 5000 : 9000;
  bus.connect(lp).connect(music && s.musicBus ? s.musicBus : s.master);
  const verb = ctx.createGain();
  verb.gain.value = 0.25;
  bus.connect(verb).connect(s.reverb);

  const bpm = style === 'reggae' ? 76 : style === 'shanty' ? 58 : style === 'tempest' ? 92 : 70; // trap feels double-time on the hats
  const beat = 60 / bpm, sixteenth = beat / 4;
  const prog = PROGRESSIONS[style];
  let step = 0, next = ctx.currentTime + 0.1, stopped = false;

  // ---- instruments -------------------------------------------------------
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const kick = (t, deep = false) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(deep ? 120 : 140, t);
    o.frequency.exponentialRampToValueAtTime(deep ? 38 : 48, t + (deep ? 0.5 : 0.18));
    env(g, t, 0.002, deep ? 0.9 : 0.75, deep ? 0.9 : 0.28);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 1.2);
  };
  const noise = (t, { type = 'highpass', freq = 7000, q = 0.7, peak = 0.2, d = 0.05, wet = false }) => {
    const src = ctx.createBufferSource(); src.buffer = s.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, 0.001, peak, d);
    src.connect(f).connect(g).connect(bus);
    if (wet) g.connect(s.reverb);
    src.start(t, Math.random()); src.stop(t + d + 0.1);
  };
  const rim = (t) => { noise(t, { type: 'bandpass', freq: 1800, q: 6, peak: 0.45, d: 0.07, wet: true }); tone(t, 'triangle', 820, 0.18, 0.04); };
  const snare = (t) => { noise(t, { type: 'bandpass', freq: 2200, q: 0.8, peak: 0.35, d: 0.18, wet: true }); tone(t, 'triangle', 190, 0.25, 0.1); };
  const hat = (t, open = false, peak = 0.07) => noise(t, { freq: 8000, peak, d: open ? 0.22 : 0.035 });
  function tone(t, type, f, peak, d, dest = bus, a = 0.004) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    env(g, t, a, peak, d);
    o.connect(g).connect(dest); o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  const keys = (t, notes, d = 0.16, peak = 0.07) => { // Rhodes-ish skank: sine + soft triangle
    for (const n of notes) { tone(t, 'sine', midi(n + 12), peak, d); tone(t, 'triangle', midi(n + 12) * 1.001, peak * 0.4, d * 0.8); }
  };
  const pad = (t, notes, d) => { for (const n of notes) { tone(t, 'sine', midi(n), 0.03, d, bus, 0.6); tone(t, 'triangle', midi(n + 12) * 1.003, 0.015, d, bus, 0.8); } };
  // sea-shanty voices: bowed strings, accordion and a hand drum – no noise, so nothing hisses
  const strings = (t, notes, d) => {
    for (const n of notes) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + d * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + d + 0.1);
    }
  };
  const accordion = (t, notes, d = 0.5, peak = 0.05) => {
    for (const n of notes) { tone(t, 'square', midi(n + 12), peak * 0.5, d, bus, 0.03); tone(t, 'triangle', midi(n + 12) * 1.004, peak, d, bus, 0.03); }
  };
  const handDrum = (t, peak = 0.5, f0 = 150) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.3);
    env(g, t, 0.002, peak, 0.35);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.6);
  };
  const bass = (t, n, d, slide = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = style === 'trap' ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(midi(n), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(midi(n + slide), t + d * 0.6);
    f.type = 'lowpass'; f.frequency.value = style === 'trap' ? 900 : 420;
    env(g, t, 0.01, style === 'trap' ? 0.55 : 0.42, d);
    o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + d + 0.1);
  };
  // vinyl crackle bed (reggae)
  let crackle = null;
  if (style === 'reggae') {
    crackle = ctx.createBufferSource();
    crackle.buffer = s.noise; crackle.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
    const g = ctx.createGain(); g.gain.value = 0.012;
    crackle.connect(f).connect(g).connect(bus);
    crackle.start();
  }

  // ---- patterns (16 steps per bar) ----------------------------------------
  function schedule(i, t) {
    const bar = Math.floor(i / 16) % prog.length, pos = i % 16;
    const chord = prog[bar];
    if (style === 'shanty' || style === 'tempest') {
      // 6/8 feel over the 16-step grid: pulse on 0 and 6, answer on 10
      const heavy = style === 'tempest';
      if (pos === 0) { handDrum(t, heavy ? 0.6 : 0.45); strings(t, chord, beat * (heavy ? 2.6 : 3.4)); }
      if (pos === 6) handDrum(t, heavy ? 0.4 : 0.28, 130);
      if (heavy && pos === 10) handDrum(t, 0.35, 120);
      if (pos === 4 || pos === 12) accordion(t, chord, heavy ? 0.35 : 0.55, heavy ? 0.055 : 0.042);
      if (pos === 0 || pos === 8) bass(t, chord[0] - 12, beat * 1.4);
      if (heavy && pos === 14) bass(t, chord[0] - 12 + 7, beat * 0.5, -7);
      if (pos === 8 && Math.random() < (heavy ? 0.8 : 0.45)) accordion(t, [chord[0] + 12, chord[2] + 12], 0.4, 0.035); // melody answer
    } else if (style === 'reggae') {
      if (pos === 8) { kick(t); rim(t); } // one-drop: kick + rim on beat 3
      if (pos % 2 === 0) hat(t, false, pos % 4 === 2 ? 0.08 : 0.04);
      if (pos === 14 && Math.random() < 0.4) hat(t, true, 0.05);
      if (pos === 4 || pos === 12) keys(t, chord); // skank on the offbeats
      if (pos === 6 && Math.random() < 0.35) keys(t, chord, 0.1, 0.04);
      const walk = [0, 0, 7, 0, 5, 0, 3, 0, 0, 0, 7, 0, 10, 0, 7, 0];
      if ([0, 3, 6, 10, 12].includes(pos)) bass(t, chord[0] - 12 + walk[pos], sixteenth * 2.2);
      if (pos === 0) pad(t, chord, beat * 4);
    } else {
      if (pos === 0 || (pos === 10 && bar % 2 === 1)) kick(t, true);
      if (pos === 8) snare(t);
      const roll = pos >= 12 && bar % 2 === 1;
      if (roll) { hat(t, false, 0.07); hat(t + sixteenth / 2, false, 0.05); } else if (pos % 2 === 0) hat(t, false, 0.07);
      if (pos === 0) { bass(t, chord[0] - 24, beat * 1.6); pad(t, chord, beat * 4); }
      if (pos === 11) bass(t, chord[0] - 24 + 7, beat * 0.6, -7);
      if (pos === 4 || pos === 12) keys(t, [chord[1] + 12, chord[3] + 12], 0.35, 0.03);
    }
  }

  const timer = setInterval(() => {
    if (stopped) return;
    while (next < ctx.currentTime + 0.25) { schedule(step, next); next += sixteenth; step++; }
  }, 50);

  return {
    stop(fade = 1) {
      stopped = true;
      clearInterval(timer);
      bus.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      crackle?.stop(ctx.currentTime + fade);
      setTimeout(() => bus.disconnect(), fade * 1000 + 200);
    },
  };
}
