import * as THREE from 'three';
import { buildVillage } from './village.js';
import { mulberry32 } from './rng.js';
import {
  makeFallbackCloudTexture,
  makeFallbackMoonTexture,
  makeFlakeTexture,
  makeGlowTexture,
  makeGroundTexture,
  makeSmokeTexture,
  makeStarTexture,
  makeWindowTexture,
} from './textures.js';

const MOON_DIR = new THREE.Vector3(-0.22, 0.46, -0.86).normalize();

function starField(count, radius) {
  const rng = mulberry32(918273);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const y = 0.04 + Math.pow(rng(), 0.68) * 0.96;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = rng() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(angle) * r * radius;

    if (rng() < 0.12) color.setHSL(0.1, 0.55, 0.76 + rng() * 0.15);
    else color.setHSL(0.56 + rng() * 0.1, 0.3, 0.72 + rng() * 0.24);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    sizes[i] = 2.4 + Math.pow(rng(), 2.4) * 7.5;
    phases[i] = rng() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geo;
}

export class World {
  constructor(scene, renderer, textures = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.isMobile = window.matchMedia('(pointer: coarse)').matches;
    this.moonDir = MOON_DIR.clone();
    this.chimneys = [];
    this.houses = [];
    this.villageState = null;

    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);

    this.skyGroup = new THREE.Group();
    this.skyGroup.name = 'sky';
    this.root.add(this.skyGroup);

    this.villageRoot = new THREE.Group();
    this.villageRoot.name = 'village';
    this.root.add(this.villageRoot);

    this.shared = {
      flake: makeFlakeTexture(),
      glow: makeGlowTexture(),
      star: makeStarTexture(),
      smoke: makeSmokeTexture(),
      ground: makeGroundTexture(),
      windowLit: makeWindowTexture(true),
      windowDark: makeWindowTexture(false),
    };

    this.moonTexture = textures.moon || makeFallbackMoonTexture();
    this.cloudTexture = textures.clouds || makeFallbackCloudTexture();
    for (const tex of [this.moonTexture, this.cloudTexture]) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }

    scene.fog = new THREE.FogExp2(0x0c1a33, 0.004);
    scene.background = new THREE.Color(0x050a16);

    this.createLights();
    this.createSky();
    this.createSnow();
  }

  createLights() {
    this.hemi = new THREE.HemisphereLight(0x9cc0ff, 0x0a1222, 1.02);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x22345a, 0.68);
    this.scene.add(this.ambient);

    this.moonLight = new THREE.DirectionalLight(0xd2e2ff, 2.6);
    this.moonLight.position.copy(this.moonDir).multiplyScalar(180);
    this.moonLight.target.position.set(0, 0, 0);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(this.isMobile ? 1024 : 2048, this.isMobile ? 1024 : 2048);
    const cam = this.moonLight.shadow.camera;
    cam.left = -82;
    cam.right = 82;
    cam.top = 82;
    cam.bottom = -82;
    cam.near = 1;
    cam.far = 420;
    cam.updateProjectionMatrix();
    this.moonLight.shadow.bias = -0.0004;
    this.moonLight.shadow.normalBias = 0.6;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);

    // A faint warm bounce from the village lights.
    this.fill = new THREE.DirectionalLight(0xffb46a, 0.24);
    this.fill.position.set(60, 30, 40);
    this.scene.add(this.fill);
  }

  createSky() {
    const skyGeo = new THREE.SphereGeometry(950, 40, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x03060f) },
        uMid: { value: new THREE.Color(0x08142b) },
        uHorizon: { value: new THREE.Color(0x142743) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        void main() {
          vec3 dir = normalize(vWorld);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
          col = mix(col, uTop, smoothstep(0.28, 1.0, h));
          // A faint cold aurora band low on the northern sky.
          float band = smoothstep(0.04, 0.14, h) * smoothstep(0.34, 0.12, h);
          float wave = 0.5 + 0.5 * sin(dir.x * 7.0 + dir.z * 4.0);
          col += vec3(0.02, 0.06, 0.07) * band * wave;
          // Dither to stop banding.
          col += (hash(gl_FragCoord.xy) - 0.5) * 0.004;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    this.skyGroup.add(sky);

    const starGeo = starField(this.isMobile ? 900 : 1600, 690);
    this.starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vColor = aColor;
          vTwinkle = 0.62 + 0.38 * sin(uTime * 1.7 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (420.0 / max(1.0, -mv.z)) * (0.82 + 0.34 * vTwinkle);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float core = smoothstep(0.5, 0.0, d);
          float glow = smoothstep(0.5, 0.05, d) * 0.24;
          float a = (pow(core, 2.0) + glow) * vTwinkle;
          if (a < 0.012) discard;
          gl_FragColor = vec4(vColor * (1.3 + vTwinkle * 0.9), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    this.skyGroup.add(this.stars);

    const moonPos = this.moonDir.clone().multiplyScalar(720);
    const glowMat = new THREE.SpriteMaterial({
      map: this.shared.glow,
      color: 0xffe0a3,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    this.moonGlow = new THREE.Sprite(glowMat);
    this.moonGlow.position.copy(moonPos);
    this.moonGlow.scale.set(720, 720, 1);
    this.skyGroup.add(this.moonGlow);

    const moonMat = new THREE.SpriteMaterial({
      map: this.moonTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    this.moon = new THREE.Sprite(moonMat);
    this.moon.position.copy(moonPos);
    this.moon.scale.set(390, 390, 1);
    this.skyGroup.add(this.moon);

    this.cloudGroup = new THREE.Group();
    this.skyGroup.add(this.cloudGroup);
    const rng = mulberry32(4451);
    for (let i = 0; i < (this.isMobile ? 5 : 9); i++) {
      const angle = (i / 9) * Math.PI * 2 + rng() * 0.6;
      const radius = 430 + rng() * 160;
      const mat = new THREE.SpriteMaterial({
        map: this.cloudTexture,
        color: 0xc2d4f5,
        transparent: true,
        opacity: 0.16 + rng() * 0.16,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
        fog: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        Math.cos(angle) * radius,
        120 + rng() * 170,
        Math.sin(angle) * radius,
      );
      const s = 260 + rng() * 260;
      sprite.scale.set(s, s * (0.38 + rng() * 0.22), 1);
      this.cloudGroup.add(sprite);
    }

    // A rare shooting star adds a little life to the sky.
    const shootGeo = new THREE.BufferGeometry();
    shootGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.shoot = new THREE.Line(
      shootGeo,
      new THREE.LineBasicMaterial({
        color: 0xe4efff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    );
    this.shoot.frustumCulled = false;
    this.skyGroup.add(this.shoot);
    this.shootTimer = 7;
    this.shootActive = 0;
    this.shootDir = new THREE.Vector3();
  }

  createSnow() {
    this.snowCount = this.isMobile ? 700 : 1400;
    const positions = new Float32Array(this.snowCount * 3);
    this.snowSpeed = new Float32Array(this.snowCount);
    this.snowDrift = new Float32Array(this.snowCount);
    const rng = mulberry32(7331);
    for (let i = 0; i < this.snowCount; i++) {
      positions[i * 3] = (rng() - 0.5) * 150;
      positions[i * 3 + 1] = rng() * 70 + 4;
      positions[i * 3 + 2] = 150 + (rng() - 0.5) * 150;
      this.snowSpeed[i] = 1.2 + rng() * 3.2;
      this.snowDrift[i] = (rng() - 0.5) * 1.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      map: this.shared.flake,
      color: 0xdce9ff,
      size: this.isMobile ? 0.5 : 0.62,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      sizeAttenuation: true,
      alphaTest: 0.01,
      fog: true,
    });
    this.snow = new THREE.Points(geo, mat);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 3;
    this.root.add(this.snow);
    this.snowPositions = positions;
  }

  build(level, seed) {
    this.level = level;
    if (this.scene.fog) this.scene.fog.density = level.fog;
    this.disposeVillage();
    this.villageState = buildVillage(this.villageRoot, level, seed, this.shared, this.isMobile);
    this.chimneys = this.villageState.chimneys;
    this.houses = this.villageState.houses;
  }

  disposeVillage() {
    if (this.villageState) {
      this.villageState.dispose();
      this.villageState = null;
    }
    this.chimneys = [];
    this.houses = [];
  }

  setPixelRatio(ratio) {
    this.starMat.uniforms.uPixelRatio.value = ratio;
  }

  update(dt, elapsed, camera, sleighPos) {
    this.skyGroup.position.copy(camera.position);
    this.starMat.uniforms.uTime.value = elapsed;
    this.cloudGroup.rotation.y += dt * 0.0032;
    this.moonGlow.material.opacity = 0.24 + Math.sin(elapsed * 0.45) * 0.02;
    this.updateShootingStar(dt);

    // Follow the sleigh with the moonlight so shadows stay near the action.
    this.moonLight.position.copy(sleighPos).addScaledVector(this.moonDir, 190);
    this.moonLight.target.position.copy(sleighPos);
    this.moonLight.target.updateMatrixWorld();
    this.fill.position.set(sleighPos.x + 60, 30, sleighPos.z + 40);

    this.updateSnow(dt, camera, elapsed);
    if (this.villageState) this.villageState.update(dt, elapsed);
  }

  updateShootingStar(dt) {
    const pos = this.shoot.geometry.attributes.position;
    if (this.shootActive > 0) {
      this.shootActive -= dt;
      const t = 1 - Math.max(0, this.shootActive) / 1.4;
      const head = this.shootStart.clone().addScaledVector(this.shootDir, t * 300);
      const tail = head.clone().addScaledVector(this.shootDir, -62);
      pos.setXYZ(0, head.x, head.y, head.z);
      pos.setXYZ(1, tail.x, tail.y, tail.z);
      pos.needsUpdate = true;
      this.shoot.material.opacity = Math.sin(t * Math.PI) * 0.9;
      if (this.shootActive <= 0) this.shoot.material.opacity = 0;
      return;
    }
    this.shootTimer -= dt;
    if (this.shootTimer > 0) return;
    this.shootTimer = 16 + Math.random() * 22;
    const angle = Math.random() * Math.PI * 2;
    const height = 260 + Math.random() * 300;
    this.shootStart = new THREE.Vector3(
      Math.cos(angle) * 520,
      height,
      Math.sin(angle) * 520,
    );
    const tangent = new THREE.Vector3(-Math.sin(angle), -0.32, Math.cos(angle)).normalize();
    this.shootDir = tangent;
    this.shootActive = 1.4;
  }

  updateSnow(dt, camera, elapsed) {
    const p = this.snowPositions;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const wind = Math.sin(elapsed * 0.22) * 0.35;
    for (let i = 0; i < this.snowCount; i++) {
      const i3 = i * 3;
      p[i3] += (this.snowDrift[i] + wind) * dt;
      p[i3 + 1] -= this.snowSpeed[i] * dt;
      p[i3 + 2] += this.snowDrift[i] * 0.35 * dt;

      let dx = p[i3] - cx;
      if (dx > 75) p[i3] -= 150;
      else if (dx < -75) p[i3] += 150;
      let dz = p[i3 + 2] - cz;
      if (dz > 75) p[i3 + 2] -= 150;
      else if (dz < -75) p[i3 + 2] += 150;
      if (p[i3 + 1] < cy - 32) p[i3 + 1] += 76;
      else if (p[i3 + 1] > cy + 44) p[i3 + 1] -= 76;
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
  }
}
