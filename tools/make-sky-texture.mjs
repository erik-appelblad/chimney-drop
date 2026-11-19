// Generates the moon + cloud sky texture and a cloud sprite sheet with no
// external dependencies. Run with: npm run sky
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/textures');
mkdirSync(outDir, { recursive: true });

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const fract = (x) => x - Math.floor(x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => smooth(clamp01((x - a) / (b - a)));

function hash2(x, y) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  return lerp(
    lerp(hash2(xi, yi), hash2(xi + 1, yi), u),
    lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u),
    v,
  );
}

function fbm(x, y, octaves = 5) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * noise2(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

function makeMoon() {
  const W = 1024;
  const H = 1024;
  const data = new Uint8ClampedArray(W * H * 4);
  const cx = 0.5;
  const cy = 0.455;
  const radius = 0.145;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const v = (y + 0.5) / H;
      const dx = u - cx;
      const dy = v - cy;
      const dist = Math.hypot(dx, dy);
      const d = dist / radius;
      const edge = smoothstep(0, 0.11, Math.min(u, 1 - u, v, 1 - v));
      const vignette = 1 - 0.35 * smoothstep(0.3, 0.72, dist);

      // Moon disc: limb-darkened, mottled with maria and craters.
      const limb = Math.sqrt(Math.max(0, 1 - Math.min(1, d * d)));
      const maria = fbm(u * 7.5 + 3.1, v * 7.5 - 1.7, 4);
      const grain = fbm(u * 46, v * 46, 4);
      let surface = 0.86 + 0.2 * grain - 0.22 * smoothstep(0.5, 0.8, maria);
      surface *= 0.62 + 0.38 * limb;
      const craterMask = smoothstep(0.58, 0.8, fbm(u * 26 + 8, v * 26 + 2, 4));
      surface -= craterMask * 0.16 * (0.4 + 0.6 * limb);
      const moonAlpha = smoothstep(1.03, 0.975, d);
      const moonR = 1.0 * surface;
      const moonG = 0.95 * surface;
      const moonB = 0.83 * surface;

      // Broad halo + tight rim glow.
      const halo = Math.pow(Math.max(0, 1 - dist / 0.55), 3.2) * 0.55;
      const rim = Math.exp(-Math.pow((d - 1.0) / 0.09, 2)) * 0.7;
      const glow = (halo + rim) * edge * vignette;

      // Wispy silver clouds, stretched horizontally.
      const warp = fbm(u * 3.0 + 11, v * 5.0 - 4, 3);
      const cloud = fbm(u * 3.4 + warp * 0.9, v * 8.2 - 2.0, 5);
      const band = smoothstep(0.44, 0.7, cloud) * smoothstep(0.05, 0.28, dist);
      const cloudAlpha = band * 0.62 * edge * vignette;

      const cloudR = 0.62;
      const cloudG = 0.72;
      const cloudB = 0.92;

      let r = moonR * moonAlpha + glow * 1.0;
      let g = moonG * moonAlpha + glow * 0.94;
      let b = moonB * moonAlpha + glow * 0.82;
      // Clouds in front dim the moon and add cool silver light.
      r = r * (1 - cloudAlpha * 0.5) + cloudR * cloudAlpha;
      g = g * (1 - cloudAlpha * 0.5) + cloudG * cloudAlpha;
      b = b * (1 - cloudAlpha * 0.5) + cloudB * cloudAlpha;

      const i = (y * W + x) * 4;
      data[i] = clamp01(r) * 255;
      data[i + 1] = clamp01(g) * 255;
      data[i + 2] = clamp01(b) * 255;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

function makeClouds() {
  const W = 1024;
  const H = 512;
  const data = new Uint8ClampedArray(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const v = (y + 0.5) / H;
      const edge = smoothstep(0, 0.16, Math.min(u, 1 - u, v, 1 - v));
      const warp = fbm(u * 3.2 + 20, v * 6.5 - 3, 3);
      const n = fbm(u * 4.6 + warp * 1.2, v * 10.0 + 5, 6);
      const density = smoothstep(0.4, 0.72, n) * edge;
      const lit = 0.55 + 0.45 * smoothstep(0.2, 0.8, fbm(u * 2.5, v * 3.0, 3));
      const i = (y * W + x) * 4;
      data[i] = 150 * lit;
      data[i + 1] = 172 * lit;
      data[i + 2] = 214 * lit;
      data[i + 3] = density * 190;
    }
  }
  return { width: W, height: H, data };
}

const moon = makeMoon();
writeFileSync(resolve(outDir, 'moon-clouds.png'), encodePng(moon.width, moon.height, moon.data));
const clouds = makeClouds();
writeFileSync(resolve(outDir, 'clouds.png'), encodePng(clouds.width, clouds.height, clouds.data));
console.log('Wrote public/textures/moon-clouds.png and public/textures/clouds.png');
