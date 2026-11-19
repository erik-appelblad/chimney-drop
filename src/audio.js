export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this.windGain = null;
    this.bellTimer = 5;
  }

  start() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      this.makeWind();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.started = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.04);
    }
  }

  makeWind() {
    const ctx = this.ctx;
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    this.windGain = gain;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  update(dt) {
    if (!this.started || this.muted || !this.ctx) return;
    this.bellTimer -= dt;
    if (this.bellTimer <= 0) {
      this.bellTimer = 9 + Math.random() * 11;
      this.jingle(0.035);
    }
  }

  tone({ freq = 440, dur = 0.4, gain = 0.1, type = 'sine', slide = 0, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise({ dur = 0.3, gain = 0.08, freq = 900, q = 0.8, delay = 0, type = 'bandpass' }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.35), t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter).connect(g).connect(this.master);
    source.start(t);
  }

  drop() {
    this.noise({ dur: 0.28, gain: 0.055, freq: 1300, q: 0.7 });
    this.tone({ freq: 520, slide: -260, dur: 0.22, gain: 0.045, type: 'triangle' });
  }

  hit(multiplier = 1) {
    const base = 880 + (multiplier - 1) * 140;
    const notes = [base, base * 1.25, base * 1.5, base * 2];
    notes.forEach((freq, i) => {
      this.tone({ freq, dur: 0.55 - i * 0.06, gain: 0.08, type: i === 0 ? 'triangle' : 'sine', delay: i * 0.045 });
    });
    this.noise({ dur: 0.16, gain: 0.035, freq: 5200, q: 1.4 });
  }

  miss() {
    this.tone({ freq: 110, slide: -55, dur: 0.28, gain: 0.075, type: 'sine' });
    this.noise({ dur: 0.18, gain: 0.045, freq: 420, q: 0.6 });
  }

  levelComplete() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      this.tone({ freq, dur: 0.8, gain: 0.075, type: i % 2 ? 'sine' : 'triangle', delay: i * 0.11 });
    });
  }

  gameOver() {
    const notes = [392, 329.63, 261.63, 196];
    notes.forEach((freq, i) => {
      this.tone({ freq, dur: 0.65, gain: 0.07, type: 'triangle', delay: i * 0.14 });
    });
  }

  victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093];
    notes.forEach((freq, i) => {
      this.tone({ freq, dur: 0.9, gain: 0.07, type: i % 2 ? 'sine' : 'triangle', delay: i * 0.09 });
    });
  }

  jingle(gain = 0.05) {
    const scale = [1046.5, 1174.66, 1318.51, 1567.98, 2093];
    for (let i = 0; i < 4; i++) {
      this.tone({
        freq: scale[Math.floor(Math.random() * scale.length)],
        dur: 0.5,
        gain,
        type: 'sine',
        delay: i * 0.12 + Math.random() * 0.03,
      });
    }
  }

  click() {
    this.tone({ freq: 740, dur: 0.08, gain: 0.035, type: 'sine' });
  }
}
