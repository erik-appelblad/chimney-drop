const MUSIC_TEMPO = 88;
const BEAT_SECONDS = 60 / MUSIC_TEMPO;
const BAR_SECONDS = BEAT_SECONDS * 4;
const MUSIC_CHORDS = [
  [196, 246.94, 293.66, 392],
  [146.83, 185, 220, 293.66],
  [164.81, 196, 246.94, 329.63],
  [130.81, 164.81, 196, 261.63],
];
const BELL_MELODIES = [
  [783.99, 987.77, 1174.66, 987.77, 880],
  [739.99, 880, 1108.73, 880, 739.99],
  [659.25, 783.99, 987.77, 1174.66, 987.77],
  [783.99, 987.77, 1174.66, 1567.98, 1174.66],
];
const BELL_BEATS = [0, 0.75, 1.5, 2.25, 3];

export class AudioEngine {
  constructor(levelMusicUrls) {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.started = false;
    this.levelMusicUrls = Array.isArray(levelMusicUrls) ? levelMusicUrls : [levelMusicUrls];
    this.levelMusicUrl = this.levelMusicUrls[0] ?? null;
    this.levelMusic = null;
    this.musicScene = 'title';
    this.musicStarted = false;
    this.musicNextBar = 0;
    this.musicBar = 0;
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
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.42;
      this.musicGain.connect(this.master);
      this.makeWind();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.started = true;
    this.startMusic();
    if (this.musicScene === 'level') this.playLevelMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.04);
    }
    if (this.levelMusic) this.levelMusic.muted = muted;
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
    if (!this.started || !this.ctx) return;
    if (this.musicScene === 'level' && !this.muted) {
      this.bellTimer -= dt;
      if (this.bellTimer <= 0) {
        this.bellTimer = 9 + Math.random() * 11;
        this.jingle(0.035);
      }
    }
    if (this.musicScene === 'title') this.scheduleMusic();
  }

  setMusicScene(scene) {
    if (scene !== 'title' && scene !== 'level') return;
    if (this.musicScene === scene) {
      if (scene === 'level' && this.started) this.playLevelMusic();
      return;
    }

    this.musicScene = scene;
    if (scene === 'title') {
      if (this.levelMusic) {
        this.levelMusic.pause();
        this.levelMusic.currentTime = 0;
      }
      if (this.ctx && this.musicGain) {
        this.musicGain.gain.setTargetAtTime(0.42, this.ctx.currentTime, 0.35);
        this.musicNextBar = this.ctx.currentTime + 0.12;
        this.musicBar = 0;
      }
      this.startMusic();
      return;
    }

    if (this.ctx && this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
    if (this.started) this.playLevelMusic();
  }

  setLevelMusic(index) {
    const url = this.levelMusicUrls[index] ?? this.levelMusicUrls[0];
    if (!url || url === this.levelMusicUrl) return;
    this.levelMusicUrl = url;
    if (this.levelMusic) {
      this.levelMusic.pause();
      this.levelMusic.removeAttribute('src');
      this.levelMusic.load();
      this.levelMusic = null;
    }
    if (this.started && this.musicScene === 'level') this.playLevelMusic();
  }

  playLevelMusic() {
    if (!this.levelMusic && this.levelMusicUrl) {
      const url = this.levelMusicUrl;
      this.levelMusic = new Audio(url);
      this.levelMusic.loop = true;
      this.levelMusic.preload = 'auto';
      this.levelMusic.volume = 0.48;
      this.levelMusic.addEventListener('error', () => {
        console.error(`Could not load level music: ${url}`);
      });
    }
    if (!this.levelMusic) return;
    this.levelMusic.muted = this.muted;
    this.levelMusic.play().catch((error) => {
      if (error.name === 'AbortError') return; // interrupted by a track switch
      console.warn('Could not start level music.', error);
    });
  }

  startMusic() {
    if (!this.ctx || this.musicStarted) return;
    this.musicStarted = true;
    this.musicNextBar = this.ctx.currentTime + 0.12;
    this.musicBar = 0;
  }

  scheduleMusic() {
    if (!this.ctx || !this.musicStarted || this.musicScene !== 'title') return;
    const now = this.ctx.currentTime;
    if (this.musicNextBar < now - BAR_SECONDS) this.musicNextBar = now + 0.08;
    while (this.musicNextBar < now + 0.45) {
      this.scheduleMusicBar(this.musicNextBar, this.musicBar);
      this.musicNextBar += BAR_SECONDS;
      this.musicBar = (this.musicBar + 1) % MUSIC_CHORDS.length;
    }
  }

  scheduleMusicBar(start, bar) {
    const chord = MUSIC_CHORDS[bar];
    const melody = BELL_MELODIES[bar];

    chord.forEach((freq, index) => {
      this.musicVoice(freq, start, BAR_SECONDS - 0.08, 0.018, 'triangle', 1150, 0.42, 0.48);
      this.musicVoice(freq * 2, start, BAR_SECONDS - 0.08, 0.0045, 'sawtooth', 1800, 0.52, 0.42, index % 2 ? -4 : 4);
    });

    for (const beat of [0, 2]) {
      for (const index of [0, 2]) {
        this.musicVoice(
          chord[index],
          start + beat * BEAT_SECONDS,
          0.78,
          0.018,
          'sawtooth',
          1050,
          0.09,
          0.24,
          index === 0 ? -5 : 5,
        );
      }
    }

    melody.forEach((freq, index) => {
      this.musicBell(freq, start + BELL_BEATS[index] * BEAT_SECONDS);
    });
  }

  musicVoice(freq, start, duration, gain, type, cutoff, attack, release, detune = 0) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const envelope = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.detune.setValueAtTime(detune, start);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    filter.Q.setValueAtTime(0.7, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + attack);
    envelope.gain.setValueAtTime(gain, start + duration - release);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter).connect(envelope).connect(this.musicGain);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  musicBell(freq, start) {
    if (!this.ctx || !this.musicGain) return;
    for (const [ratio, gain, decay] of [[1, 0.027, 1.15], [2.76, 0.009, 0.68], [5.4, 0.0035, 0.38]]) {
      const osc = this.ctx.createOscillator();
      const envelope = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * ratio, start);
      envelope.gain.setValueAtTime(gain, start);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + decay);
      osc.connect(envelope).connect(this.musicGain);
      osc.start(start);
      osc.stop(start + decay + 0.03);
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
