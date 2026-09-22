// Sound engine: plays real audio files when present (public/assets/<game>/sfx/<name>.mp3),
// otherwise falls back to layered WebAudio synthesis so the game is never silent.

export class Sound {
  // files: names that exist as <base>/<name>.mp3 – only those are requested (no 404s for synth-only sounds)
  constructor(base, names, files = names) {
    this.base = base;
    this.names = names;
    this.available = new Set(files);
    this.files = new Map();
    this.muted = localStorage.getItem('arcade.muted') === '1';
    this.ctx = null;
    this.loops = new Map();
  }

  // Must be called from a user gesture (browser autoplay rules).
  async unlock() {
    if (this.ctx) return this.ctx.resume();
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = this.makeReverb();
    this.reverb.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    await Promise.all(this.names.filter((n) => this.available.has(n)).map(async (n) => {
      try {
        const r = await fetch(`${this.base}/${n}.mp3`);
        if (!r.ok || !r.headers.get('content-type')?.includes('audio')) return;
        this.files.set(n, await ctx.decodeAudioData(await r.arrayBuffer()));
      } catch { /* synth fallback */ }
    }));
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('arcade.muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
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

  /** Play a named sound. opts: { vol, rate, loop } */
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
      src.connect(g).connect(this.master);
      src.start();
      return { stop: (fade = 0.3) => { g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); src.stop(this.ctx.currentTime + fade); } };
    }
    return synth?.(this, opts) ?? null;
  }

  loop(name, synth, opts) {
    if (this.loops.has(name)) return;
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

  bell(freq, { at = 0, vol = 0.18, dur = 1.2 } = {}) {
    // inharmonic partials → metallic bell / coin shimmer
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([m, v]) =>
      this.tone({ freq: freq * m, dur: dur / Math.sqrt(m), vol: vol * v, at, wet: 0.5 }));
  }
}

export const midi = (n) => 440 * 2 ** ((n - 69) / 12);
