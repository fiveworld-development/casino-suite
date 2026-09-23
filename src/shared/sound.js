// Sound engine: plays real audio files when present (public/assets/<game>/sfx/<name>.mp3),
// otherwise falls back to layered WebAudio synthesis so the game is never silent.

export class Sound {
  // files: names that exist as <base>/<name>.mp3 – only those are requested (no 404s for synth-only sounds)
  constructor(base, names, files = names) {
    this.base = base;
    this.names = names;
    this.available = new Set(files);
    this.files = new Map();
    this.pending = new Map(); // name -> promise, for big files still downloading
    this.muted = localStorage.getItem('arcade.muted') === '1';
    // the background music has its own switch: turning it off keeps every sound effect
    // AND the bonus music playing (they do not run through the music bus)
    this.musicMuted = localStorage.getItem('arcade.musicMuted') === '1';
    // background music sits well under the game by default; the player can set it 0..1
    const v = Number(localStorage.getItem('arcade.musicVolume'));
    this.musicVolume = Number.isFinite(v) && localStorage.getItem('arcade.musicVolume') !== null ? Math.min(1, Math.max(0, v)) : 0.35;
    // sound effects volume 0..1 (everything except the background music), default full
    const fx = Number(localStorage.getItem('arcade.sfxVolume'));
    this.sfxVolume = Number.isFinite(fx) && localStorage.getItem('arcade.sfxVolume') !== null ? Math.min(1, Math.max(0, fx)) : 1;
    this.ctx = null;
    this.loops = new Map();
  }

  // Must be called from a user gesture (browser autoplay rules).
  async unlock() {
    if (this.ctx) return this.ctx.resume();
    const ctx = (this.ctx = new AudioContext());
    this.main = ctx.createGain(); // global sound switch
    this.main.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.main.connect(comp).connect(ctx.destination);
    this.master = ctx.createGain(); // every sound effect (and the bonus music) runs through here
    this.master.gain.value = this.sfxVolume;
    this.master.connect(this.main);
    this.musicBus = ctx.createGain(); // only the background music runs through here
    this.musicBus.gain.value = this.musicMuted ? 0 : this.musicVolume;
    this.musicBus.connect(this.main);
    this.reverb = this.makeReverb();
    this.reverb.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const load = async (n) => {
      try {
        const r = await fetch(`${this.base}/${n}.mp3`);
        if (!r.ok || !r.headers.get('content-type')?.includes('audio')) return;
        this.files.set(n, await ctx.decodeAudioData(await r.arrayBuffer()));
      } catch { /* synth fallback */ }
    };
    const wanted = this.names.filter((n) => this.available.has(n));
    // music tracks are minutes long – load them in the background so the game starts instantly
    const music = wanted.filter((n) => n.startsWith('music'));
    for (const n of music) this.pending.set(n, load(n));
    await Promise.all(wanted.filter((n) => !n.startsWith('music')).map(load));
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('arcade.muted', m ? '1' : '0');
    if (this.main) this.main.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Sound effects volume 0..1 (saved, shared by all games). */
  setSfxVolume(v) {
    this.sfxVolume = Math.min(1, Math.max(0, v));
    localStorage.setItem('arcade.sfxVolume', String(this.sfxVolume));
    if (this.master) this.master.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
  }

  /** Background music on/off – independent of the global sound switch. */
  setMusicMuted(m) {
    this.musicMuted = m;
    localStorage.setItem('arcade.musicMuted', m ? '1' : '0');
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(m ? 0 : this.musicVolume, this.ctx.currentTime, 0.2);
  }

  /** Background music volume 0..1 (saved, shared by all games). */
  setMusicVolume(v) {
    this.musicVolume = Math.min(1, Math.max(0, v));
    localStorage.setItem('arcade.musicVolume', String(this.musicVolume));
    if (this.musicBus && !this.musicMuted) this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
  }

  makeReverb() {
    const ctx = this.ctx, len = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const g = ctx.createGain();
    g.gain.value = 0.28;
    conv.connect(g);
    return Object.assign(conv, { out: g, connect: (n) => g.connect(n) });
  }

  /** Play a named sound. opts: { vol, rate, loop, music } – music routes through the music bus. */
  play(name, synth, opts = {}) {
    if (!this.ctx || this.muted) return null;
    const buf = this.files.get(name);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = !!opts.loop;
      src.playbackRate.value = opts.rate ?? 1;
      const g = this.ctx.createGain();
      g.gain.value = opts.vol ?? 1;
      src.connect(g).connect(opts.music ? this.musicBus : this.master);
      src.start();
      return { stop: (fade = 0.3) => { g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); src.stop(this.ctx.currentTime + fade); } };
    }
    return synth?.(this, opts) ?? null;
  }

  loop(name, synth, opts = {}) {
    if (this.loops.has(name)) return;
    // a music track may still be downloading – start it as soon as it arrives, unless it was stopped meanwhile
    const waiting = this.pending.get(name);
    if (waiting && !this.files.has(name)) {
      const token = {};
      this.loops.set(name, { token, stop: () => this.loops.delete(name) });
      waiting.then(() => {
        if (this.loops.get(name)?.token !== token) return; // stopped while loading
        this.loops.delete(name);
        this.loop(name, synth, opts);
      });
      return;
    }
    const h = this.play(name, synth, { ...opts, loop: true });
    if (h) this.loops.set(name, h);
  }

  stopLoop(name, fade = 0.8) {
    this.loops.get(name)?.stop(fade);
    this.loops.delete(name);
  }

  // ---------- synthesis helpers ----------
  out(vol = 1, wet = 0.3) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.master);
    if (wet) { const w = this.ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.reverb); }
    return g;
  }

  tone({ type = 'sine', freq = 440, to, dur = 0.3, vol = 0.3, attack = 0.005, at = 0, wet = 0.3, dest }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.out(1, wet));
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noiseHit({ dur = 0.3, vol = 0.4, type = 'lowpass', freq = 1200, to, q = 1, at = 0, attack = 0.002, wet = 0.2, loop = false }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    if (!loop) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(1, wet));
    src.start(t, Math.random());
    if (!loop) src.stop(t + dur + 0.05);
    return { src, f, g, stop: (fade = 0.5) => { g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); src.stop(ctx.currentTime + fade); } };
  }

  /**
   * Tape-style delay send (dub echo). Connect voices to the returned node.
   * Kept per instance and reused: time in seconds, fb = feedback, mix = wet level.
   */
  echo({ time = 0.28, fb = 0.32, mix = 0.28, tone = 2600 } = {}) {
    const key = `${time}|${fb}|${mix}|${tone}`;
    if (this.echoes?.has(key)) return this.echoes.get(key);
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const d = ctx.createDelay(1);
    d.delayTime.value = time;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = tone;
    const g = ctx.createGain();
    g.gain.value = fb;
    const wet = ctx.createGain();
    wet.gain.value = mix;
    inp.connect(d).connect(f).connect(g).connect(d);
    f.connect(wet).connect(this.master);
    inp.connect(this.master);
    (this.echoes ??= new Map()).set(key, inp);
    return inp;
  }

  /** Drum voice: pitch-dropping body + optional click. Taiko (low, woody) through 808 (long sub). */
  drum({ freq = 120, to = 45, dur = 0.5, vol = 0.5, at = 0, click = 0, type = 'sine', wet = 0.2, dest }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.out(1, wet));
    o.start(t);
    o.stop(t + dur + 0.05);
    if (click) this.noiseHit({ dur: 0.03, vol: click, type: 'bandpass', freq: 2000, q: 1.5, at, wet: 0.1 });
    return o;
  }

  bell(freq, { at = 0, vol = 0.18, dur = 1.2 } = {}) {
    // inharmonic partials → metallic bell / coin shimmer
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([m, v]) =>
      this.tone({ freq: freq * m, dur: dur / Math.sqrt(m), vol: vol * v, at, wet: 0.5 }));
  }
}

export const midi = (n) => 440 * 2 ** ((n - 69) / 12);
