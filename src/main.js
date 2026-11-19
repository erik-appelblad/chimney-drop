import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { createSleigh } from './sleigh.js';
import { Sparkles } from './particles.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { LEVELS } from './levels.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const GRAVITY = 26;

const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.5, 2400);
let lastFrameTime = performance.now();

const audio = new AudioEngine(
  `${import.meta.env.BASE_URL}audio/bfcmusic-christmas-background-music-631630.mp3`,
);
const ui = new UI(audio);
let sparkles = null;
let world = null;
let sleigh = null;
let composer = null;
let bloomPass = null;
let elapsed = 0;
let shake = 0;

const state = {
  mode: 'menu',
  levelIndex: 0,
  level: LEVELS[0],
  attempt: 0,
  score: 0,
  target: LEVELS[0].target,
  presents: LEVELS[0].presents,
  hits: 0,
  streak: 0,
  bestStreak: 0,
  dropCooldown: 0,
  endTimer: 0,
  pendingResult: null,
  runScore: 0,
  runHits: 0,
  runPresents: 0,
  activePresents: [],
};

const flight = {
  pos: new THREE.Vector3(0, 34, 150),
  yaw: 0,
  pitch: 0,
  roll: 0,
  yawRate: 0,
  speed: 17,
  velocity: new THREE.Vector3(0, 0, -17),
};
const forward = new THREE.Vector3(0, 0, -1);

const input = {
  keys: Object.create(null),
  pointerX: 0,
  pointerY: 0,
  pointerSeen: false,
  touchX: 0,
  touchY: 0,
  touchActive: false,
  gamepadX: 0,
  gamepadY: 0,
  gamepadConnected: false,
  gamepadPrevious: Object.create(null),
};

const tmp = {
  forward: new THREE.Vector3(),
  origin: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  prev: new THREE.Vector3(),
  pos: new THREE.Vector3(),
  prevLocal: new THREE.Vector3(),
  curLocal: new THREE.Vector3(),
  point: new THREE.Vector3(),
  promptPoint: new THREE.Vector3(),
  presentSparkVel: new THREE.Vector3(),
  cameraDesired: new THREE.Vector3(),
  cameraLook: new THREE.Vector3(),
  start: new THREE.Vector3(),
};

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------
function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    isTouch ? 0.42 : 0.55,
    0.72,
    0.82,
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// ---------------------------------------------------------------------------
// Aim marker
// ---------------------------------------------------------------------------
const marker = new THREE.Group();
marker.visible = false;
marker.renderOrder = 5;
const markerMat = new THREE.MeshBasicMaterial({
  color: 0x9fd8ff,
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
  depthWrite: false,
  toneMapped: false,
});
const markerRing = new THREE.Mesh(new THREE.RingGeometry(2.5, 3.05, 56), markerMat);
markerRing.rotation.x = -Math.PI / 2;
marker.add(markerRing);
const markerInner = new THREE.Mesh(new THREE.RingGeometry(0.72, 1.02, 40), markerMat);
markerInner.rotation.x = -Math.PI / 2;
markerInner.position.y = 0.01;
marker.add(markerInner);
const markerPulseMat = markerMat.clone();
markerPulseMat.opacity = 0.5;
const markerPulse = new THREE.Mesh(new THREE.RingGeometry(3.15, 3.32, 56), markerPulseMat);
markerPulse.rotation.x = -Math.PI / 2;
markerPulse.position.y = 0.005;
marker.add(markerPulse);
const markerDot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 18), markerMat);
markerDot.rotation.x = -Math.PI / 2;
markerDot.position.y = 0.02;
marker.add(markerDot);
const markerPin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), markerMat);
markerPin.position.y = 0.9;
marker.add(markerPin);
const markerGlowMat = new THREE.SpriteMaterial({
  map: null,
  color: 0x9fd8ff,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});
const markerGlow = new THREE.Sprite(markerGlowMat);
markerGlow.scale.set(11, 11, 1);
marker.add(markerGlow);
const markerBeamMat = new THREE.MeshBasicMaterial({
  color: 0x9fd8ff,
  transparent: true,
  opacity: 0.05,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});
const markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.5, 26, 10, 1, true), markerBeamMat);
markerBeam.position.y = 13;
marker.add(markerBeam);
scene.add(marker);

const linePositions = new Float32Array(6);
const aimLineGeo = new THREE.BufferGeometry();
aimLineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
const aimLineMat = new THREE.LineDashedMaterial({
  color: 0x9fd8ff,
  transparent: true,
  opacity: 0.2,
  dashSize: 1.1,
  gapSize: 1.2,
  depthWrite: false,
});
const aimLine = new THREE.Line(aimLineGeo, aimLineMat);
aimLine.visible = false;
aimLine.frustumCulled = false;
scene.add(aimLine);

// ---------------------------------------------------------------------------
// Presents
// ---------------------------------------------------------------------------
const presentBoxGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
const ribbonGeoA = new THREE.BoxGeometry(1.02, 1.02, 0.16);
const ribbonGeoB = new THREE.BoxGeometry(0.16, 1.02, 1.02);
const bowGeo = new THREE.SphereGeometry(0.11, 8, 6);
const presentMats = [
  new THREE.MeshStandardMaterial({ color: 0xe0504a, roughness: 0.48, metalness: 0.08, emissive: 0x2a0504, emissiveIntensity: 0.35 }),
  new THREE.MeshStandardMaterial({ color: 0x35a07f, roughness: 0.48, metalness: 0.08, emissive: 0x031d14, emissiveIntensity: 0.35 }),
  new THREE.MeshStandardMaterial({ color: 0x4c7fc9, roughness: 0.48, metalness: 0.08, emissive: 0x041226, emissiveIntensity: 0.35 }),
  new THREE.MeshStandardMaterial({ color: 0xe0b055, roughness: 0.4, metalness: 0.25, emissive: 0x2a1a03, emissiveIntensity: 0.4 }),
];
const ribbonMat = new THREE.MeshStandardMaterial({
  color: 0xffd37d,
  roughness: 0.3,
  metalness: 0.65,
  emissive: 0x3a2400,
  emissiveIntensity: 0.35,
});

function makePresent() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(presentBoxGeo, presentMats[Math.floor(Math.random() * presentMats.length)]);
  group.add(box);
  const a = new THREE.Mesh(ribbonGeoA, ribbonMat);
  a.position.y = 0.01;
  group.add(a);
  const b = new THREE.Mesh(ribbonGeoB, ribbonMat);
  b.position.y = 0.01;
  group.add(b);
  const bow = new THREE.Mesh(bowGeo, ribbonMat);
  bow.position.y = 0.52;
  group.add(bow);
  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  if (world?.shared?.glow) {
    const glowMat = new THREE.SpriteMaterial({
      map: world.shared.glow,
      color: 0xffd27a,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(3.1, 3.1, 1);
    group.add(glow);
  }
  return {
    group,
    pos: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    life: 9,
  };
}

function clearPresents() {
  for (const p of state.activePresents) scene.remove(p.group);
  state.activePresents.length = 0;
}

function getDropOrigin(out) {
  out.copy(flight.pos).addScaledVector(forward, 1.2);
  out.y -= 1.2;
  return out;
}

function getDropVelocity(out) {
  out.copy(forward).multiplyScalar(flight.speed * 0.55);
  out.y -= 2.2;
  return out;
}

function dropPresent() {
  if (state.mode !== 'playing' || state.presents <= 0 || state.dropCooldown > 0) return;
  state.dropCooldown = 0.19;
  state.presents--;
  ui.setPresents(state.presents, state.level.presents);

  const present = makePresent();
  const origin = getDropOrigin(tmp.origin);
  const vel = getDropVelocity(tmp.velocity);
  vel.x += (Math.random() - 0.5) * 0.24;
  vel.z += (Math.random() - 0.5) * 0.24;
  present.pos.copy(origin);
  present.prev.copy(origin);
  present.vel.copy(vel);
  present.group.position.copy(origin);
  present.spin.set(
    (Math.random() - 0.5) * 5,
    (Math.random() - 0.5) * 4,
    (Math.random() - 0.5) * 5,
  );
  scene.add(present.group);
  state.activePresents.push(present);

  sparkles.burst(origin, 6, [0xffd37d, 0xfff0c0, 0xbfe0ff], 1.2, 0.7);
  audio.drop();
  shake = Math.max(shake, 0.045);
}

function removePresent(index) {
  const p = state.activePresents[index];
  p.group.traverse((obj) => {
    if (obj.isSprite) obj.material.dispose();
  });
  scene.remove(p.group);
  state.activePresents.splice(index, 1);
}

function screenPosition(point) {
  camera.updateMatrixWorld();
  const v = point.clone().project(camera);
  if (v.z > 1 || v.z < -1) return null;
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function collisionAt(prev, pos, includeGround = true) {
  if (!world || !world.villageState) return null;
  for (const chimney of world.chimneys) {
    if (!chimney.active) continue;
    if (prev.y > chimney.topY && pos.y <= chimney.topY) {
      const t = (prev.y - chimney.topY) / Math.max(0.0001, prev.y - pos.y);
      const x = prev.x + (pos.x - prev.x) * t;
      const z = prev.z + (pos.z - prev.z) * t;
      if (Math.hypot(x - chimney.topWorld.x, z - chimney.topWorld.z) <= chimney.radius) {
        return { type: 'chimney', chimney, point: new THREE.Vector3(x, chimney.topY, z) };
      }
    }
  }

  for (const house of world.houses) {
    const rough = Math.max(house.w, house.d) * 0.8 + 5;
    if (Math.hypot(pos.x - house.x, pos.z - house.z) > rough) continue;
    const prevLocal = house.group.worldToLocal(tmp.prevLocal.copy(prev));
    const curLocal = house.group.worldToLocal(tmp.curLocal.copy(pos));
    const halfX = house.roofHalfX ?? house.w * 0.608;
    const halfZ = house.roofHalfZ ?? house.d * 0.608;

    if (
      Math.abs(curLocal.x) < halfX &&
      Math.abs(curLocal.z) < halfZ
    ) {
      const surface = house.h + house.roofH * Math.max(
        0,
        1 - Math.max(Math.abs(curLocal.x) / halfX, Math.abs(curLocal.z) / halfZ),
      );
      if (prevLocal.y > surface && curLocal.y <= surface) {
        const point = tmp.point.set(curLocal.x, surface, curLocal.z);
        house.group.localToWorld(point);
        return { type: 'roof', house, point: point.clone() };
      }
    }
    if (
      Math.abs(curLocal.x) < house.w / 2 &&
      Math.abs(curLocal.z) < house.d / 2 &&
      prevLocal.y > house.h &&
      curLocal.y <= house.h
    ) {
      const point = tmp.point.set(curLocal.x, house.h, curLocal.z);
      house.group.localToWorld(point);
      return { type: 'roof', house, point: point.clone() };
    }
  }

  if (includeGround && pos.y <= 0.14) {
    return { type: 'ground', point: new THREE.Vector3(pos.x, 0.1, pos.z) };
  }
  return null;
}

function resolveHit(hit, present) {
  if (hit.type === 'chimney') {
    if (state.mode !== 'playing') {
      sparkles.puff(hit.point, 14, 0xffe2a8, 1.4);
      return;
    }
    const chimney = hit.chimney;
    if (!chimney.active) {
      sparkles.puff(hit.point, 12, 0xd9e8ff, 1.3);
      return;
    }
    const previousMult = Math.max(1, Math.min(3, state.streak));
    state.streak++;
    const mult = Math.max(1, Math.min(3, state.streak));
    const points = 100 * mult;
    state.score += points;
    state.hits++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    world.villageState.deliver(chimney);
    sparkles.burst(hit.point, 48, [0xffd37d, 0xfff1c0, 0xff9b6b, 0x8fe3b8, 0xbfe0ff], 4.4, 1.2);
    audio.hit(mult);
    ui.setScore(state.score, state.target);
    ui.setHits(state.hits);
    ui.setStreak(state.streak);
    const sp = screenPosition(hit.point);
    if (sp) ui.popup(`+${points}`, sp.x, sp.y, false, mult > 1 ? `×${mult} streak` : 'delivered');
    if (mult > previousMult) {
      ui.toast(mult >= 3 ? 'Streak ×3 — chimney after chimney!' : 'Streak ×2 — beautiful line-up');
    }
    shake = Math.max(shake, 0.32);
    if (state.score >= state.target) finishLevel();
  } else {
    if (state.mode !== 'playing') {
      sparkles.puff(hit.point, 10, 0xd9e8ff, 1.2);
      return;
    }
    state.streak = 0;
    ui.setStreak(0);
    sparkles.puff(hit.point, hit.type === 'roof' ? 12 : 18, 0xd9e8ff, 1.7);
    audio.miss();
    const sp = screenPosition(hit.point);
    if (sp) ui.popup('miss', sp.x, sp.y, true);
    shake = Math.max(shake, 0.11);
  }
}

function updatePresents(dt) {
  for (let i = state.activePresents.length - 1; i >= 0; i--) {
    const p = state.activePresents[i];
    p.prev.copy(p.pos);
    p.vel.y -= GRAVITY * dt;
    p.pos.addScaledVector(p.vel, dt);
    p.life -= dt;
    p.group.position.copy(p.pos);
    p.group.rotation.x += p.spin.x * dt;
    p.group.rotation.y += p.spin.y * dt;
    p.group.rotation.z += p.spin.z * dt;

    if (p.pos.y > 1) {
      tmp.presentSparkVel.set(
        (Math.random() - 0.5) * 0.9,
        0.15 + Math.random() * 0.35,
        (Math.random() - 0.5) * 0.9,
      );
      sparkles.spawn(p.pos, tmp.presentSparkVel, Math.random() > 0.4 ? 0xffd27a : 0xbfe0ff, 0.26, 0.42, -0.5, 0.97);
    }

    const hit = collisionAt(p.prev, p.pos, true);
    if (hit) {
      resolveHit(hit, p);
      removePresent(i);
      continue;
    }
    if (p.life <= 0 || p.pos.y < -6) removePresent(i);
  }

  if (
    state.mode === 'playing' &&
    state.presents <= 0 &&
    state.activePresents.length === 0 &&
    state.score < state.target
  ) {
    triggerGameOver();
  }
}

function predictDrop() {
  if (!world || !world.villageState) return null;
  const start = getDropOrigin(tmp.start).clone();
  const vel = getDropVelocity(tmp.velocity).clone();
  const pos = start.clone();
  const prev = start.clone();
  const step = 0.045;
  for (let i = 0; i < 130; i++) {
    prev.copy(pos);
    vel.y -= GRAVITY * step;
    pos.addScaledVector(vel, step);
    const hit = collisionAt(prev, pos, true);
    if (hit) return { ...hit, start };
    if (pos.y < -3) break;
  }
  return { type: 'ground', point: new THREE.Vector3(pos.x, 0.1, pos.z), start };
}

function updateMarker() {
  if (state.mode !== 'playing' || state.presents <= 0 || !world?.villageState) {
    marker.visible = false;
    aimLine.visible = false;
    ui.setAimPrompt(0, 0, false);
    return;
  }
  const prediction = predictDrop();
  if (!prediction) {
    marker.visible = false;
    aimLine.visible = false;
    ui.setAimPrompt(0, 0, false);
    return;
  }
  marker.visible = true;
  aimLine.visible = true;
  marker.position.copy(prediction.point);
  marker.position.y += 0.16;
  const aligned = prediction.type === 'chimney';
  const color = aligned ? 0xffd37d : prediction.type === 'roof' ? 0xff8a7a : 0x9fd8ff;
  markerMat.color.setHex(color);
  markerGlowMat.color.setHex(color);
  markerPulseMat.color.setHex(color);
  markerBeamMat.color.setHex(color);
  markerMat.opacity = aligned ? 1 : 0.72;
  markerGlowMat.opacity = aligned ? 0.34 : 0.16;
  markerBeamMat.opacity = aligned ? 0.1 : 0.04;
  const pulse = 1 + Math.sin(elapsed * 4.6) * 0.06;
  marker.scale.setScalar(pulse);

  const phase = (elapsed * 0.75) % 1;
  markerPulse.scale.setScalar(1 + phase * 0.6);
  markerPulseMat.opacity = (1 - phase) * (aligned ? 0.7 : 0.35);

  const start = getDropOrigin(tmp.start);
  linePositions[0] = start.x;
  linePositions[1] = start.y;
  linePositions[2] = start.z;
  linePositions[3] = prediction.point.x;
  linePositions[4] = prediction.point.y;
  linePositions[5] = prediction.point.z;
  aimLineGeo.attributes.position.needsUpdate = true;
  aimLine.computeLineDistances();
  aimLineMat.color.setHex(color);
  aimLineMat.opacity = aligned ? 0.4 : 0.16;

  if (aligned) {
    tmp.promptPoint.copy(marker.position);
    tmp.promptPoint.y += 3.4;
    const sp = screenPosition(tmp.promptPoint);
    if (sp) ui.setAimPrompt(sp.x, sp.y, true);
    else ui.setAimPrompt(0, 0, false);
  } else {
    ui.setAimPrompt(0, 0, false);
  }
}

// ---------------------------------------------------------------------------
// Flight + camera
// ---------------------------------------------------------------------------
function getSteerX() {
  let x = 0;
  if (input.keys.KeyA || input.keys.ArrowLeft) x -= 1;
  if (input.keys.KeyD || input.keys.ArrowRight) x += 1;
  x += input.gamepadX;
  if (input.touchActive) x += input.touchX;
  else if (!ui.isTouch || input.pointerSeen) x += input.pointerX;
  return clamp(x, -1, 1);
}

function getSteerY() {
  let y = 0;
  if (input.keys.KeyW || input.keys.ArrowUp) y += 1;
  if (input.keys.KeyS || input.keys.ArrowDown) y -= 1;
  y += input.gamepadY;
  if (input.touchActive) y += input.touchY;
  else if (!ui.isTouch || input.pointerSeen) y += input.pointerY;
  return clamp(y, -1, 1);
}

function applySleighTransform() {
  if (!sleigh) return;
  sleigh.group.position.copy(flight.pos);
  sleigh.group.rotation.set(flight.pitch, flight.yaw, flight.roll, 'YXZ');
}

function resetFlight(level) {
  flight.pos.set(0, 32, 142);
  flight.yaw = 0;
  flight.pitch = 0;
  flight.roll = 0;
  flight.yawRate = 0;
  flight.speed = level.speed;
  flight.velocity.set(0, 0, -level.speed);
  forward.set(0, 0, -1);
  input.pointerX = 0;
  input.pointerY = 0;
  input.touchX = 0;
  input.touchY = 0;
  input.touchActive = false;
  input.pointerSeen = false;
  ui.setStick(0, 0, false);
  applySleighTransform();
}

function snapCamera() {
  const bx = Math.sin(flight.yaw) * 19;
  const bz = Math.cos(flight.yaw) * 19;
  camera.position.set(flight.pos.x + bx, flight.pos.y + 9.2, flight.pos.z + bz);
  camera.up.set(0, 1, 0);
  camera.lookAt(
    flight.pos.x - Math.sin(flight.yaw) * 13,
    flight.pos.y + 1.4,
    flight.pos.z - Math.cos(flight.yaw) * 13,
  );
}

function updateFlight(dt, neutral = false) {
  const steerX = neutral ? 0 : getSteerX();
  const steerY = neutral ? 0 : getSteerY();
  const targetYawRate = -steerX * 0.95;
  flight.yawRate += (targetYawRate - flight.yawRate) * Math.min(1, dt * 5.2);
  flight.yaw += flight.yawRate * dt;

  let pitchTarget = steerY * 0.45;
  if (!neutral) {
    if (input.keys.KeyW || input.keys.ArrowUp) pitchTarget += 0.28;
    if (input.keys.KeyS || input.keys.ArrowDown) pitchTarget -= 0.28;
  }
  flight.pitch += (clamp(pitchTarget, -0.58, 0.58) - flight.pitch) * Math.min(1, dt * 4.4);
  flight.pitch = clamp(flight.pitch, -0.58, 0.58);

  const horizontal = Math.hypot(flight.pos.x, flight.pos.z);
  if (horizontal > 245) {
    const desired = Math.atan2(flight.pos.x, flight.pos.z);
    const diff = wrapAngle(desired - flight.yaw);
    flight.yaw += diff * Math.min(1, dt * (0.55 + (horizontal - 245) / 45));
  }

  const cp = Math.cos(flight.pitch);
  const sp = Math.sin(flight.pitch);
  forward.set(-Math.sin(flight.yaw) * cp, sp, -Math.cos(flight.yaw) * cp);
  flight.velocity.copy(forward).multiplyScalar(flight.speed);
  flight.pos.addScaledVector(forward, flight.speed * dt);

  if (flight.pos.y < 20) {
    flight.pos.y = 20;
    if (flight.pitch < 0) flight.pitch = 0;
  } else if (flight.pos.y > 55) {
    flight.pos.y = 55;
    if (flight.pitch > 0) flight.pitch = 0;
  }
  const radius = Math.hypot(flight.pos.x, flight.pos.z);
  if (radius > 300) {
    const scale = 300 / radius;
    flight.pos.x *= scale;
    flight.pos.z *= scale;
  }

  flight.roll += (flight.yawRate * 0.55 - flight.roll) * Math.min(1, dt * 5);
  applySleighTransform();
  sleigh.update(dt, flight.speed / 17);
}

function updateCamera(dt) {
  const bx = Math.sin(flight.yaw) * 19;
  const bz = Math.cos(flight.yaw) * 19;
  tmp.cameraDesired.set(
    flight.pos.x + bx,
    flight.pos.y + 9.2 + flight.pitch * 2.2,
    flight.pos.z + bz,
  );
  const t = 1 - Math.exp(-dt * 4.5);
  camera.position.lerp(tmp.cameraDesired, t);
  tmp.cameraLook.copy(flight.pos).addScaledVector(forward, 13);
  tmp.cameraLook.y += 1.4;
  camera.up.set(Math.sin(-flight.roll * 0.3), 1, 0).normalize();
  camera.lookAt(tmp.cameraLook);

  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.position.z += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2.4);
  }
}

function updateMenuCamera() {
  const a = Math.sin(elapsed * 0.07) * 0.3;
  const radius = 118;
  camera.up.set(0, 1, 0);
  camera.position.set(
    Math.sin(a) * radius,
    34 + Math.sin(elapsed * 0.4) * 2,
    Math.cos(a) * radius,
  );
  camera.lookAt(0, 17, 0);
}

// ---------------------------------------------------------------------------
// Level flow
// ---------------------------------------------------------------------------
function startRun() {
  audio.start();
  state.runScore = 0;
  state.runHits = 0;
  state.runPresents = 0;
  startLevel(0);
}

function startLevel(index) {
  state.levelIndex = index;
  state.level = LEVELS[index];
  state.attempt++;
  state.score = 0;
  state.target = state.level.target;
  state.presents = state.level.presents;
  state.hits = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.dropCooldown = 0;
  state.endTimer = 0;
  state.pendingResult = null;
  clearPresents();
  world.build(state.level, state.level.seed + state.attempt * 104729);
  resetFlight(state.level);
  snapCamera();
  sparkles.clear();
  marker.visible = false;
  aimLine.visible = false;
  ui.setAimPrompt(0, 0, false);

  state.mode = 'playing';
  ui.setMode('playing');
  ui.hideScreen();
  ui.setLevel(state.level, index);
  ui.setScore(0, state.target);
  ui.setPresents(state.presents, state.level.presents);
  ui.setStreak(0);
  ui.setHits(0);
  ui.toast(`Level ${index + 1} · ${state.level.name}`);
  ui.showHint(ui.isTouch
    ? 'Left stick to fly · DROP to deliver · aim the golden ring at a chimney'
    : 'Mouse or gamepad to steer · Click/Space or gamepad to drop · W/S altitude · R restart');
  audio.setMusicScene('level');
  audio.start();
  audio.jingle(0.025);
}

function prepareMenu() {
  audio.setMusicScene('title');
  state.mode = 'menu';
  state.levelIndex = 0;
  state.level = LEVELS[0];
  state.runScore = 0;
  state.runHits = 0;
  state.runPresents = 0;
  clearPresents();
  world.build(LEVELS[0], LEVELS[0].seed);
  resetFlight(LEVELS[0]);
  flight.pos.set(36, 24, 74);
  flight.yaw = -0.28;
  flight.pitch = 0.05;
  flight.speed = 15;
  forward.set(-Math.sin(flight.yaw), 0, -Math.cos(flight.yaw));
  applySleighTransform();
  camera.position.set(0, 34, 118);
  camera.lookAt(0, 17, 0);
  marker.visible = false;
  aimLine.visible = false;
  ui.setAimPrompt(0, 0, false);
  ui.setMode('menu');
  ui.showStart();
}

function finishLevel() {
  if (state.mode !== 'playing') return;
  state.mode = 'ending';
  state.endTimer = 1.05;
  state.pendingResult = 'levelComplete';
  const used = state.level.presents - state.presents;
  state.runScore += state.score;
  state.runHits += state.hits;
  state.runPresents += used;
  ui.setMode('ending');
  ui.toast('Level complete!');
  audio.levelComplete();
  sparkles.burst(flight.pos.clone().add(new THREE.Vector3(0, 2, 0)), 70, [0xffd37d, 0xfff1c0, 0x8fe3b8, 0xbfe0ff], 4.2, 1.5);
  shake = Math.max(shake, 0.25);
  marker.visible = false;
  aimLine.visible = false;
  ui.setAimPrompt(0, 0, false);
}

function triggerGameOver() {
  if (state.mode !== 'playing') return;
  state.mode = 'ending';
  state.endTimer = 1.15;
  state.pendingResult = 'gameover';
  ui.setMode('ending');
  ui.toast('The sack is empty', true);
  audio.gameOver();
  marker.visible = false;
  aimLine.visible = false;
  ui.setAimPrompt(0, 0, false);
}

function showPendingResult() {
  const result = state.pendingResult;
  state.pendingResult = null;
  if (result === 'levelComplete') {
    const isLast = state.levelIndex >= LEVELS.length - 1;
    if (isLast) {
      state.mode = 'victory';
      ui.setMode('victory');
      ui.showVictory({
        totalScore: state.runScore,
        totalHits: state.runHits,
        totalPresents: state.runPresents,
      });
      audio.victory();
    } else {
      state.mode = 'levelComplete';
      ui.setMode('levelComplete');
      ui.showLevelComplete({
        level: state.level,
        index: state.levelIndex,
        score: state.score,
        hits: state.hits,
        used: state.level.presents - state.presents,
        remaining: state.presents,
        bestStreak: state.bestStreak,
        isLast: false,
      });
    }
  } else if (result === 'gameover') {
    state.mode = 'gameover';
    ui.setMode('gameover');
    ui.showGameOver({
      level: state.level,
      index: state.levelIndex,
      score: state.score,
      target: state.target,
      hits: state.hits,
      presents: state.presents,
    });
  }
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  ui.setMode('paused');
  ui.showPaused(state.level, state.levelIndex);
  marker.visible = false;
  aimLine.visible = false;
  ui.setAimPrompt(0, 0, false);
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  ui.setMode('playing');
  ui.hideScreen();
  audio.start();
}

function toggleMute() {
  const muted = !audio.muted;
  audio.setMuted(muted);
  ui.setMuted(muted);
  try { localStorage.setItem('sleigh-bells-muted', muted ? '1' : '0'); } catch { /* ignore */ }
}

function handleAction(action) {
  switch (action) {
    case 'start':
      startRun();
      break;
    case 'drop':
      dropPresent();
      break;
    case 'next':
      if (state.levelIndex + 1 < LEVELS.length) startLevel(state.levelIndex + 1);
      break;
    case 'retry':
      startLevel(state.levelIndex);
      break;
    case 'restart':
      if (state.mode === 'ending') break;
      if (state.mode === 'menu' || state.mode === 'levelComplete' || state.mode === 'victory') startRun();
      else startLevel(state.levelIndex);
      break;
    case 'resume':
      resumeGame();
      break;
    case 'pause':
      pauseGame();
      break;
    case 'menu':
      prepareMenu();
      break;
    case 'mute':
      toggleMute();
      break;
    case 'victory':
      state.mode = 'victory';
      ui.setMode('victory');
      ui.showVictory({
        totalScore: state.runScore,
        totalHits: state.runHits,
        totalPresents: state.runPresents,
      });
      audio.victory();
      break;
    default:
      break;
  }
}

ui.onAction = handleAction;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function unlockAudio() {
  if (!audio.started) {
    audio.start();
    if (state.mode === 'menu') audio.setMusicScene('title');
  }
}

window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

const GAMEPAD_DEADZONE = 0.14;

function gamepadPressed(gamepad, index) {
  const button = gamepad.buttons[index];
  if (!button) return false;
  if (typeof button === 'number') return button > 0.5;
  return button.pressed || button.value > 0.5;
}

function updateGamepad() {
  if (!navigator.getGamepads) return;

  const pads = navigator.getGamepads();
  let gamepad = null;
  for (const pad of pads) {
    if (pad?.connected) {
      gamepad = pad;
      break;
    }
  }

  if (!gamepad) {
    input.gamepadConnected = false;
    input.gamepadX = 0;
    input.gamepadY = 0;
    input.gamepadPrevious = Object.create(null);
    return;
  }

  if (!input.gamepadConnected) {
    input.gamepadConnected = true;
    ui.toast('Gamepad connected');
  }

  let axisX = gamepad.axes[0] || 0;
  let axisY = gamepad.axes[1] || 0;
  if (gamepad.axes.length < 2) {
    axisX = gamepad.axes[2] || 0;
    axisY = gamepad.axes[3] || 0;
  }
  const deadzoneAxis = (value) => {
    if (Math.abs(value) <= GAMEPAD_DEADZONE) return 0;
    const direction = Math.sign(value);
    return direction * Math.min(1, (Math.abs(value) - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE));
  };
  axisX = deadzoneAxis(axisX);
  axisY = deadzoneAxis(axisY);

  if (gamepadPressed(gamepad, 14)) axisX = -1;
  if (gamepadPressed(gamepad, 15)) axisX = 1;
  if (gamepadPressed(gamepad, 12)) axisY = -1;
  if (gamepadPressed(gamepad, 13)) axisY = 1;
  input.gamepadX = axisX;
  input.gamepadY = -axisY;

  const key = (index) => `${gamepad.index}:${index}`;
  const edgePressed = (index) => {
    const id = key(index);
    const pressed = gamepadPressed(gamepad, index);
    const edge = pressed && !input.gamepadPrevious[id];
    input.gamepadPrevious[id] = pressed;
    return edge;
  };

  let dropPressed = false;
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
    dropPressed = edgePressed(index) || dropPressed;
  }
  if (dropPressed) {
    if (state.mode === 'playing') dropPresent();
    else if (state.mode === 'menu') startRun();
    else if (state.mode === 'paused') resumeGame();
    else if (state.mode === 'levelComplete') handleAction(state.levelIndex + 1 < LEVELS.length ? 'next' : 'menu');
    else if (state.mode === 'gameover') handleAction('retry');
    else if (state.mode === 'victory') handleAction('menu');
  }

  const pausePressed = edgePressed(9);
  const backPressed = edgePressed(8);
  if (pausePressed || backPressed) {
    if (state.mode === 'playing') pauseGame();
    else if (state.mode === 'paused') resumeGame();
  }
  if (edgePressed(10) && state.mode !== 'ending') handleAction('restart');
  if (edgePressed(11)) toggleMute();
}

function updatePointer(event) {
  input.pointerSeen = true;
  const nx = (event.clientX / window.innerWidth) * 2 - 1;
  const ny = -((event.clientY / window.innerHeight) * 2 - 1);
  const dead = 0.06;
  input.pointerX = Math.sign(nx) * Math.max(0, (Math.abs(nx) - dead) / (1 - dead));
  input.pointerY = Math.sign(ny) * Math.max(0, (Math.abs(ny) - dead) / (1 - dead));
}

window.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  updatePointer(event);
});
window.addEventListener('mouseleave', () => {
  input.pointerX = 0;
  input.pointerY = 0;
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') return;
  if (state.mode === 'playing') dropPresent();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

const stick = ui.el.stick;
let stickPointer = null;
function updateStick(event) {
  const rect = stick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const max = rect.width * 0.35;
  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > max) {
    dx = (dx / len) * max;
    dy = (dy / len) * max;
  }
  const x = dx / max;
  const y = -dy / max;
  input.touchX = clamp(x, -1, 1);
  input.touchY = clamp(y, -1, 1);
  ui.setStick(input.touchX, input.touchY, true);
}
stick.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  stickPointer = event.pointerId;
  input.touchActive = true;
  stick.setPointerCapture(event.pointerId);
  updateStick(event);
});
stick.addEventListener('pointermove', (event) => {
  if (event.pointerId !== stickPointer) return;
  event.preventDefault();
  updateStick(event);
});
function endStick(event) {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null;
  input.touchActive = false;
  input.touchX = 0;
  input.touchY = 0;
  ui.setStick(0, 0, false);
}
stick.addEventListener('pointerup', endStick);
stick.addEventListener('pointercancel', endStick);

window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
  }
  input.keys[event.code] = true;
  if (event.repeat) return;
  if (event.code === 'Space') dropPresent();
  else if (event.code === 'KeyR') handleAction('restart');
  else if (event.code === 'KeyM') toggleMute();
  else if (event.code === 'Escape') {
    if (state.mode === 'playing') pauseGame();
    else if (state.mode === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (event) => {
  input.keys[event.code] = false;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') pauseGame();
});

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const ratio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2);
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h);
  if (composer) {
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
  }
  if (world) world.setPixelRatio(ratio);
  if (sparkles) sparkles.setPixelRatio(ratio);
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  elapsed += dt;
  state.dropCooldown = Math.max(0, state.dropCooldown - dt);
  updateGamepad();

  if (state.mode === 'menu') {
    updateMenuCamera();
    sleigh.update(dt, 1);
    audio.update(dt);
  } else if (state.mode === 'playing') {
    updateFlight(dt);
    updateCamera(dt);
    updatePresents(dt);
    updateMarker();
    const trailCount = Math.min(3, Math.ceil(dt * 90));
    for (let i = 0; i < trailCount; i++) sparkles.trail(flight.pos, forward, flight.speed / 17);
    audio.update(dt);
  } else if (state.mode === 'ending') {
    updateFlight(dt, true);
    updateCamera(dt);
    updatePresents(dt);
    const trailCount = Math.min(2, Math.ceil(dt * 60));
    for (let i = 0; i < trailCount; i++) sparkles.trail(flight.pos, forward, flight.speed / 17);
    state.endTimer -= dt;
    if (state.endTimer <= 0) showPendingResult();
    audio.update(dt);
  } else {
    sleigh.update(dt, 1);
  }

  if (world) world.update(dt, elapsed, camera, flight.pos);
  sparkles.update(dt);
  composer.render();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function loadTexture(path) {
  const loader = new THREE.TextureLoader();
  try {
    return await loader.loadAsync(`${import.meta.env.BASE_URL}${path}`);
  } catch (error) {
    console.warn(`Could not load ${path}; using procedural fallback.`, error);
    return null;
  }
}

async function boot() {
  setupComposer();
  const [moon, clouds] = await Promise.all([
    loadTexture('textures/moon-clouds.png'),
    loadTexture('textures/clouds.png'),
  ]);
  world = new World(scene, renderer, { moon, clouds });
  sleigh = createSleigh();
  scene.add(sleigh.group);
  sparkles = new Sparkles(scene, renderer);
  markerGlowMat.map = world.shared.glow;
  markerGlowMat.needsUpdate = true;
  prepareMenu();
  ui.setMuted(audio.muted);
  try {
    const muted = localStorage.getItem('sleigh-bells-muted') === '1';
    if (muted) {
      audio.setMuted(true);
      ui.setMuted(true);
    }
  } catch { /* ignore */ }
  ui.hideBoot();
  lastFrameTime = performance.now();
  renderer.setAnimationLoop(frame);

  const params = new URLSearchParams(window.location.search);
  if (import.meta.env.DEV && params.has('autostart')) {
    startRun();
  }
  if (import.meta.env.DEV) {
    window.__game = { state, flight, startRun, startLevel, dropPresent, handleAction, world, marker, aimLine, ui, audio };
  }
}

boot().catch((error) => {
  console.error(error);
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.textContent = 'The sleigh could not take off. Check the console.';
});
