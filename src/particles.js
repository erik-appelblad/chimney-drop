import * as THREE from 'three';

function makeSparkTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,246,214,0.95)');
  g.addColorStop(0.45, 'rgba(255,214,140,0.35)');
  g.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(size / 2, 6);
  ctx.lineTo(size / 2, size - 6);
  ctx.moveTo(6, size / 2);
  ctx.lineTo(size - 6, size / 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const _color = new THREE.Color();

export class Sparkles {
  constructor(scene, renderer, count = 460) {
    this.count = count;
    this.renderer = renderer;
    this.cursor = 0;
    this.particles = Array.from({ length: count }, () => ({
      life: 0,
      maxLife: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      color: new THREE.Color(),
      size: 1,
      drag: 0.99,
      gravity: 0,
    }));

    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, count);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: makeSparkTexture() },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (220.0 / max(1.0, -mv.z));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float a = tex.a * vAlpha;
          if (a < 0.008) discard;
          gl_FragColor = vec4(vColor * tex.rgb * 1.35, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.geometry = geometry;
  }

  setPixelRatio(ratio) {
    this.material.uniforms.uPixelRatio.value = ratio;
  }

  spawn(position, velocity, color, size, life, gravity = 0, drag = 0.99) {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.count;
    p.pos.copy(position);
    p.vel.copy(velocity);
    p.color.set(color);
    p.size = size;
    p.maxLife = life;
    p.life = life;
    p.gravity = gravity;
    p.drag = drag;
  }

  trail(position, forward, speed = 1) {
    const side = (Math.random() - 0.5) * 2.4;
    const pos = position.clone();
    pos.x += side * 0.6;
    pos.y += (Math.random() - 0.5) * 0.6;
    pos.z += 1.6;
    pos.addScaledVector(forward, -1.8 - Math.random() * 1.2);
    const vel = forward.clone().multiplyScalar(-1.4 - Math.random() * 1.5);
    vel.x += (Math.random() - 0.5) * 1.2;
    vel.y += Math.random() * 1.0 + 0.3;
    vel.z += (Math.random() - 0.5) * 1.2;
    const warm = Math.random() > 0.35;
    this.spawn(
      pos,
      vel,
      warm ? 0xffd489 : 0xbfe0ff,
      (0.16 + Math.random() * 0.25) * speed,
      0.7 + Math.random() * 0.7,
      -0.4,
      0.97,
    );
  }

  burst(position, count, palette, power = 3, spread = 1) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 1.3 + 0.15,
        Math.random() * 2 - 1,
      ).normalize();
      const speed = power * (0.35 + Math.random() * 0.9);
      const vel = dir.multiplyScalar(speed);
      vel.x *= spread;
      vel.z *= spread;
      _color.set(palette[Math.floor(Math.random() * palette.length)]);
      this.spawn(
        position,
        vel,
        _color,
        0.24 + Math.random() * 0.42,
        0.55 + Math.random() * 0.8,
        3.2,
        0.965,
      );
    }
  }

  puff(position, count = 14, color = 0xd9e8ff, power = 1.4) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 0.9 + 0.1,
        Math.random() * 2 - 1,
      ).normalize();
      _color.set(color);
      this.spawn(
        position,
        dir.multiplyScalar(power * (0.3 + Math.random())),
        _color,
        0.35 + Math.random() * 0.55,
        0.5 + Math.random() * 0.55,
        -0.6,
        0.94,
      );
    }
  }

  clear() {
    for (const p of this.particles) p.life = 0;
    this.positions.fill(0);
    this.colors.fill(0);
    this.sizes.fill(0);
    this.alphas.fill(0);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      const i3 = i * 3;
      if (p.life <= 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.pos.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      this.positions[i3] = p.pos.x;
      this.positions[i3 + 1] = p.pos.y;
      this.positions[i3 + 2] = p.pos.z;
      this.colors[i3] = p.color.r;
      this.colors[i3 + 1] = p.color.g;
      this.colors[i3 + 2] = p.color.b;
      this.sizes[i] = p.size * (0.55 + 0.45 * t);
      this.alphas[i] = Math.min(1, t * 2.2) * 0.95;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
