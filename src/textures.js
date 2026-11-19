import * as THREE from 'three';

function canvasTexture(width, height, draw, { srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makeGlowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,246,220,1)');
    g.addColorStop(0.22, 'rgba(255,224,164,0.7)');
    g.addColorStop(0.55, 'rgba(255,190,110,0.18)');
    g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function makeFlakeTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(238,247,255,0.85)');
    g.addColorStop(0.7, 'rgba(210,232,255,0.18)');
    g.addColorStop(1, 'rgba(200,225,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function makeStarTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.16, 'rgba(255,244,206,0.95)');
    g.addColorStop(0.48, 'rgba(255,210,120,0.2)');
    g.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 4);
    ctx.lineTo(w / 2, h - 4);
    ctx.moveTo(4, h / 2);
    ctx.lineTo(w - 4, h / 2);
    ctx.stroke();
  });
}

export function makeSmokeTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const x = w / 2 + (Math.random() - 0.5) * 42;
      const y = h / 2 + (Math.random() - 0.5) * 38;
      const r = 20 + Math.random() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(210,226,250,0.10)');
      g.addColorStop(0.55, 'rgba(170,195,235,0.045)');
      g.addColorStop(1, 'rgba(150,180,230,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  });
}

export function makeGroundTexture() {
  const texture = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e5edfb';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 12 + Math.random() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const blue = Math.random() > 0.45;
      g.addColorStop(0, blue ? 'rgba(150,177,219,0.09)' : 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 5000; i++) {
      const a = Math.random() * 0.18;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(126,155,201,${a * 0.55})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(70, 70);
  return texture;
}

export function makeWindowTexture(lit = true) {
  return canvasTexture(64, 80, (ctx, w, h) => {
    ctx.fillStyle = lit ? '#2a1c14' : '#121a28';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = lit ? '#3c2a1c' : '#1a2434';
    ctx.fillRect(5, 5, w - 10, h - 10);
    if (lit) {
      const g = ctx.createLinearGradient(0, 8, 0, h - 8);
      g.addColorStop(0, '#ffe6a8');
      g.addColorStop(0.55, '#ffc66f');
      g.addColorStop(1, '#e89a45');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = '#26344c';
    }
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = lit ? '#5b3b20' : '#0d1522';
    ctx.fillRect(w / 2 - 2, 8, 4, h - 16);
    ctx.fillRect(8, h / 2 - 2, w - 16, 4);
    ctx.fillStyle = lit ? 'rgba(255,255,255,0.55)' : 'rgba(150,180,225,0.12)';
    ctx.fillRect(9, 9, 13, 8);
    ctx.fillStyle = 'rgba(240,248,255,0.9)';
    ctx.fillRect(3, h - 6, w - 6, 4);
  });
}

export function makeFallbackMoonTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.46;
    const r = w * 0.145;
    const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 3.8);
    halo.addColorStop(0, 'rgba(255,232,180,0.42)');
    halo.addColorStop(0.4, 'rgba(180,200,255,0.10)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#fffdf2');
    g.addColorStop(0.7, '#f3e6c8');
    g.addColorStop(1, '#b9a98a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.8;
      const cr = 2 + Math.random() * r * 0.13;
      ctx.fillStyle = '#6e6250';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cr, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function makeFallbackCloudTexture() {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = w * 0.5 + (Math.random() - 0.5) * w * 0.8;
      const y = h * 0.5 + (Math.random() - 0.5) * h * 0.5;
      const r = 16 + Math.random() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(185,205,240,0.10)');
      g.addColorStop(1, 'rgba(185,205,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}
