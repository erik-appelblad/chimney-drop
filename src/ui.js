import { LEVELS } from './levels.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');

function levelChips(current, completed) {
  return LEVELS.map((level, i) => {
    const cls = i === current ? 'active' : i < completed ? 'done' : '';
    return `<span class="level-chip ${cls}"><b>${i + 1}</b> ${level.name}</span>`;
  }).join('');
}

export class UI {
  constructor(audio) {
    this.audio = audio;
    this.onAction = null;
    this.toastTimer = null;
    this.hintTimer = null;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    document.body.classList.toggle('touch', this.isTouch);

    this.el = {
      screen: document.getElementById('screen'),
      card: document.getElementById('screenCard'),
      levelNum: document.getElementById('levelNum'),
      levelName: document.getElementById('levelName'),
      score: document.getElementById('score'),
      target: document.getElementById('target'),
      scoreBar: document.getElementById('scoreBar'),
      mult: document.getElementById('mult'),
      pips: document.getElementById('pips'),
      hits: document.getElementById('hits'),
      toast: document.getElementById('toast'),
      popups: document.getElementById('popups'),
      hint: document.getElementById('hint'),
      boot: document.getElementById('boot'),
      muteBtn: document.getElementById('muteBtn'),
      restartBtn: document.getElementById('restartBtn'),
      menuBtn: document.getElementById('menuBtn'),
      dropBtn: document.getElementById('dropBtn'),
      stick: document.getElementById('stick'),
      knob: document.getElementById('stickKnob'),
      aimPrompt: document.getElementById('aimPrompt'),
    };

    this.el.screen.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      this.audio.click();
      this.onAction?.(button.dataset.action);
    });
    this.el.muteBtn.addEventListener('click', () => this.onAction?.('mute'));
    this.el.restartBtn.addEventListener('click', () => this.onAction?.('restart'));
    this.el.menuBtn.addEventListener('click', () => this.onAction?.('pause'));
    this.el.dropBtn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onAction?.('drop');
    });
  }

  setMode(mode) {
    document.body.dataset.mode = mode;
  }

  hideBoot() {
    this.el.boot.classList.add('hidden');
    window.setTimeout(() => this.el.boot.remove(), 700);
  }

  showScreen(html) {
    this.el.card.innerHTML = html;
    this.el.screen.classList.remove('hidden');
    this.el.card.scrollTop = 0;
  }

  hideScreen() {
    this.el.screen.classList.add('hidden');
  }

  setLevel(level, index) {
    this.el.levelNum.textContent = String(index + 1);
    this.el.levelName.textContent = level.name;
    this.el.target.textContent = fmt(level.target);
  }

  setScore(score, target) {
    this.el.score.textContent = fmt(score);
    this.el.scoreBar.style.width = `${Math.min(100, (score / Math.max(1, target)) * 100)}%`;
  }

  setPresents(remaining, total) {
    if (this.el.pips.children.length !== total) {
      this.el.pips.innerHTML = Array.from({ length: total }, () => '<span class="pip"></span>').join('');
    }
    const pips = this.el.pips.children;
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle('used', i >= remaining);
    }
  }

  setStreak(streak) {
    const mult = Math.max(1, Math.min(3, streak));
    this.el.mult.textContent = `×${mult}`;
    this.el.mult.classList.toggle('hot', streak >= 2);
  }

  setHits(hits) {
    this.el.hits.textContent = String(hits);
  }

  setMuted(muted) {
    this.el.muteBtn.classList.toggle('muted', muted);
    this.el.muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  toast(text, bad = false) {
    const el = this.el.toast;
    el.textContent = text;
    el.classList.toggle('bad', bad);
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2100);
  }

  popup(text, x, y, miss = false, sub = 'delivered') {
    const el = document.createElement('div');
    el.className = `score-pop${miss ? ' miss' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `${text}${miss ? '' : `<small>${sub}</small>`}`;
    this.el.popups.appendChild(el);
    window.setTimeout(() => el.remove(), 1200);
  }

  showHint(text) {
    this.el.hint.textContent = text;
    this.el.hint.classList.remove('fade');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.el.hint.classList.add('fade'), 9000);
  }

  showStart() {
    const controls = this.isTouch
      ? `<div class="controls">
          <div class="control"><span class="keys"><kbd>STICK</kbd></span><span>Steer the sleigh</span></div>
          <div class="control"><span class="keys"><kbd>DROP</kbd></span><span>Release a present</span></div>
          <div class="control"><span class="keys"><kbd>II</kbd></span><span>Pause the run</span></div>
          <div class="control"><span class="keys"><kbd>↻</kbd></span><span>Restart the level</span></div>
        </div>`
      : `<div class="controls">
          <div class="control"><span class="keys"><kbd>MOUSE</kbd></span><span>Steer left / right</span></div>
          <div class="control"><span class="keys"><kbd>W</kbd><kbd>S</kbd></span><span>Climb / descend</span></div>
          <div class="control"><span class="keys"><kbd>CLICK</kbd><kbd>SPACE</kbd></span><span>Drop a present</span></div>
          <div class="control"><span class="keys"><kbd>A</kbd><kbd>D</kbd></span><span>Fine steering</span></div>
          <div class="control"><span class="keys"><kbd>R</kbd></span><span>Restart level</span></div>
          <div class="control"><span class="keys"><kbd>M</kbd><kbd>ESC</kbd></span><span>Mute / pause</span></div>
        </div>`;

    this.showScreen(`
      <div class="stars">✦ ✦ ✦</div>
      <span class="eyebrow">A Christmas Eve flight</span>
      <h1>Sleigh Bells</h1>
      <p class="lede">Santa's sack is full and the village is asleep. Fly low over the rooftops, line up the golden marker, and drop presents straight down the chimneys. Every hit lights up a house — and builds your streak.</p>
      <div class="level-strip">${levelChips(0, 0)}</div>
      <button class="btn primary" data-action="start">Begin the run</button>
      ${controls}
      <p class="tiny">Reach each level's score target before the sack runs out. A miss breaks your streak.</p>
    `);
  }

  showPaused(level, index) {
    this.showScreen(`
      <span class="eyebrow">Level ${index + 1} · ${level.name}</span>
      <h2>Paused</h2>
      <p class="lede">The reindeer are circling. Take your time.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="resume">Resume flight</button>
        <button class="btn ghost" data-action="restart">Restart level</button>
        <button class="btn ghost" data-action="menu">Title screen</button>
      </div>
    `);
  }

  showLevelComplete({ level, index, score, hits, used, remaining, bestStreak, isLast }) {
    const accuracy = Math.round((hits / Math.max(1, used)) * 100);
    this.showScreen(`
      <span class="eyebrow">Level ${index + 1} complete</span>
      <h2>${isLast ? 'The last rooftop is lit' : 'Rooftops alight'}</h2>
      <p class="lede">${isLast ? 'Every chimney in the village is glowing. Christmas is ready.' : level.subtitle}</p>
      <div class="result-grid">
        <div class="result gold"><span>Score</span><b>${fmt(score)}</b></div>
        <div class="result"><span>Chimneys</span><b>${hits}</b></div>
        <div class="result green"><span>Accuracy</span><b>${accuracy}%</b></div>
      </div>
      <div class="level-strip" style="margin-top:16px">${levelChips(index, index + 1)}</div>
      <div class="btn-row">
        <button class="btn primary" data-action="${isLast ? 'victory' : 'next'}">${isLast ? 'See the finale' : `Next: ${LEVELS[index + 1]?.name ?? ''}`}</button>
        <button class="btn ghost" data-action="menu">Title screen</button>
      </div>
      <p class="tiny">Best streak ×${Math.max(1, Math.min(3, bestStreak))} · ${remaining} presents left in the sack</p>
    `);
  }

  showGameOver({ level, index, score, target, hits, presents }) {
    this.showScreen(`
      <span class="eyebrow">Level ${index + 1} · ${level.name}</span>
      <h2>The sack is empty</h2>
      <p class="lede">You lit <b>${hits}</b> chimney${hits === 1 ? '' : 's'} and scored <b>${fmt(score)}</b> of the <b>${fmt(target)}</b> needed. The village is still waiting.</p>
      <div class="result-grid">
        <div class="result gold"><span>Score</span><b>${fmt(score)}</b></div>
        <div class="result"><span>Target</span><b>${fmt(target)}</b></div>
        <div class="result green"><span>Presents</span><b>${presents}</b></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-action="retry">Try again</button>
        <button class="btn ghost" data-action="menu">Title screen</button>
      </div>
      <p class="tiny">Tip: the golden ring means the present will land in a chimney. Drop when it glows.</p>
    `);
  }

  showVictory({ totalScore, totalHits, totalPresents }) {
    const accuracy = Math.round((totalHits / Math.max(1, totalPresents)) * 100);
    this.showScreen(`
      <div class="stars">✦ ✦ ✦ ✦ ✦</div>
      <span class="eyebrow">The village is glowing</span>
      <h1>Christmas is saved</h1>
      <p class="lede">Every chimney is lit, every stocking is full, and the reindeer have earned their oats. Santa's work here is done.</p>
      <div class="result-grid">
        <div class="result gold"><span>Total score</span><b>${fmt(totalScore)}</b></div>
        <div class="result"><span>Chimneys</span><b>${totalHits}</b></div>
        <div class="result green"><span>Accuracy</span><b>${accuracy}%</b></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-action="start">Fly again</button>
        <button class="btn ghost" data-action="menu">Title screen</button>
      </div>
      <p class="tiny">Merry Christmas.</p>
    `);
  }

  setStick(x, y, active) {
    this.el.knob.style.transform = `translate(${x * 36}px, ${y * 36}px)`;
    this.el.stick.style.borderColor = active ? 'rgba(255, 226, 170, 0.7)' : '';
  }

  setAimPrompt(x, y, show) {
    const el = this.el.aimPrompt;
    if (!el) return;
    el.classList.toggle('show', show);
    if (show) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }
}
