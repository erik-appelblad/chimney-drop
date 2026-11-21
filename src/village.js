import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, range } from './rng.js';

const ROOF_SCALE = 0.86;
const ROOF_HALF = ROOF_SCALE * Math.SQRT1_2;

// Chimney catch radius. Touch steering is less precise, so phones get a
// noticeably more forgiving hitbox (the aim marker uses the same value).
const CHIMNEY_RADIUS = 2.8;
const CHIMNEY_RADIUS_TOUCH = 4.2;

function box(parent, w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addWindow(parent, geometry, material, x, y, z, rotY) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.userData.noShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeGlowSprite(shared, color, opacity, scale, blending = THREE.AdditiveBlending) {
  const mat = new THREE.SpriteMaterial({
    map: shared.glow,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

// A snow-covered gable roof: a triangular prism with the ridge along local X.
function makeGableRoofGeometry() {
  const geo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    // eaves
    -1, 0, -1,
    1, 0, -1,
    1, 0, 1,
    -1, 0, 1,
    // ridge
    -1, 1, 0,
    1, 1, 0,
  ]);
  const indices = [
    0, 5, 1, 0, 4, 5, // back slope
    3, 2, 5, 3, 5, 4, // front slope
    0, 3, 4, // left gable end
    1, 5, 2, // right gable end
  ];
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildHouse(parent, opts, mats, shared, isMobile) {
  const {
    x, z, rot, w, d, h, roofH, rng, tall,
    roofType = 'pyramid', ridgeAlongZ = false, v,
  } = opts;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  parent.add(group);

  const bodyMat = mats.house[Math.floor(rng() * mats.house.length)];
  box(group, w, h, d, bodyMat, 0, h / 2, 0);
  box(group, w + 0.55, 0.42, d + 0.55, mats.stone, 0, 0.21, 0);

  // Half-timber detail on the front of some houses.
  if (rng() > 0.45) {
    const beam = mats.darkWood;
    box(group, w * 0.92, 0.16, 0.12, beam, 0, h * 0.72, d / 2 + 0.03);
    box(group, w * 0.92, 0.14, 0.12, beam, 0, h * 0.28, d / 2 + 0.03);
    box(group, 0.14, h * 0.74, 0.12, beam, -w * 0.34, h * 0.48, d / 2 + 0.03);
    box(group, 0.14, h * 0.74, 0.12, beam, w * 0.34, h * 0.48, d / 2 + 0.03);
  }

  // Snowy roof with a dark eave beneath it.
  const roofMat = mats.roof[Math.floor(rng() * mats.roof.length)];
  const halfX = w * ROOF_HALF;
  const halfZ = d * ROOF_HALF;
  box(group, w * (ROOF_SCALE * 2), 0.16, d * (ROOF_SCALE * 2), mats.darkWood, 0, h + 0.06, 0);
  let roof;
  if (roofType === 'gable') {
    roof = new THREE.Mesh(mats.gableRoofGeo, roofMat);
    roof.position.set(0, h + 0.08, 0);
    roof.scale.set(halfX, roofH, halfZ);
  } else {
    roof = new THREE.Mesh(mats.roofGeo, roofMat);
    roof.position.set(0, h + roofH / 2 + 0.08, 0);
    roof.scale.set(w * ROOF_SCALE, roofH, d * ROOF_SCALE);
  }
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Snow gathered at the apex and along the ridge.
  const ridge = new THREE.Mesh(mats.snowPuffGeo, mats.snow);
  ridge.position.set(0, h + roofH + 0.02, 0);
  if (roofType === 'gable') {
    ridge.scale.set(
      ridgeAlongZ ? 0.75 : Math.min(2.6, w * 0.3),
      0.26,
      ridgeAlongZ ? Math.min(2.6, d * 0.24) : 0.75,
    );
  } else {
    ridge.scale.set(0.75, 0.3, 0.75);
  }
  group.add(ridge);

  const roofSlope = (lx, lz) => {
    if (roofType === 'gable') {
      return ridgeAlongZ
        ? Math.max(0, 1 - Math.abs(lx) / halfX)
        : Math.max(0, 1 - Math.abs(lz) / halfZ);
    }
    return Math.max(0.18, 1 - Math.max(Math.abs(lx) / halfX, Math.abs(lz) / halfZ));
  };

  // Chimney: placed on the front-right slope, with a snow cap and a warm beacon.
  const ox = w * 0.23;
  const oz = d * 0.16;
  const surface = h + roofH * roofSlope(ox, oz);
  const chimH = tall ? 2.65 : 2.35;
  const chimneyBody = box(group, 0.95, chimH, 0.95, mats.brick, ox, surface + chimH / 2 - 0.2, oz);
  const capMat = mats.brickDark.clone();
  const cap = box(group, 1.24, 0.22, 1.24, capMat, ox, surface + chimH - 0.12, oz);
  box(group, 1.3, 0.1, 1.3, mats.snow, ox, surface + chimH + 0.02, oz);
  const hole = box(group, 0.5, 0.06, 0.5, mats.hole, ox, surface + chimH + 0.08, oz);
  hole.userData.noShadow = true;

  // A second, purely decorative chimney makes the larger houses read differently.
  if (v.extras.secondChimney && rng() > 0.35) {
    const ox2 = -w * 0.26;
    const oz2 = -d * 0.2;
    const s2 = h + roofH * roofSlope(ox2, oz2);
    box(group, 0.82, 2.15, 0.82, mats.brick, ox2, s2 + 0.86, oz2);
    box(group, 1.08, 0.2, 1.08, mats.brickDark, ox2, s2 + 1.95, oz2);
    box(group, 1.14, 0.1, 1.14, mats.snow, ox2, s2 + 2.08, oz2);
  }

  // Windows on all four sides.
  const windowGeo = mats.windowGeo;
  const y = h * 0.58;
  const winOffsets = [w * 0.26, d * 0.23];
  const litChance = v.litChance ?? 0.8;
  const addPair = (side) => {
    for (const s of [-1, 1]) {
      if (isMobile && side !== 'front' && s === 1) continue;
      const lit = rng() < litChance;
      const mat = lit ? mats.windowLit : mats.windowDark;
      if (side === 'front') addWindow(group, windowGeo, mat, s * winOffsets[0], y, d / 2 + 0.035, 0);
      else if (side === 'back') addWindow(group, windowGeo, mat, s * winOffsets[0], y, -d / 2 - 0.035, Math.PI);
      else if (side === 'left') addWindow(group, windowGeo, mat, -w / 2 - 0.035, y, s * winOffsets[1], -Math.PI / 2);
      else addWindow(group, windowGeo, mat, w / 2 + 0.035, y, s * winOffsets[1], Math.PI / 2);
    }
  };
  addPair('front');
  addPair('back');
  addPair('left');
  addPair('right');

  // A small attic light in the triangular gable end.
  if (roofType === 'gable' && ridgeAlongZ) {
    const atticLit = rng() < litChance;
    const attic = addWindow(
      group,
      windowGeo,
      atticLit ? mats.windowLit : mats.windowDark,
      0,
      h + roofH * 0.42,
      halfZ + 0.03,
      0,
    );
    attic.scale.set(0.62, 0.55, 1);
  }

  // Dormers on the front slope of gable roofs.
  if (v.extras.dormers && roofType === 'gable' && !ridgeAlongZ) {
    const count = rng() > 0.55 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const dx = count === 1 ? range(rng, -0.12, 0.12) * w : (i === 0 ? -0.24 : 0.24) * w;
      const dz = d * 0.24;
      const dy = h + roofH * roofSlope(dx, dz);
      box(group, 1.25, 0.9, 1.0, bodyMat, dx, dy - 0.12, dz);
      const dormerRoof = new THREE.Mesh(mats.gableRoofGeo, roofMat);
      dormerRoof.position.set(dx, dy + 0.33, dz);
      dormerRoof.scale.set(0.8, 0.55, 0.62);
      dormerRoof.castShadow = true;
      group.add(dormerRoof);
      const lit = rng() < litChance;
      const win = addWindow(group, windowGeo, lit ? mats.windowLit : mats.windowDark, dx, dy - 0.12, dz + 0.52, 0);
      win.scale.set(0.55, 0.48, 1);
    }
  }

  // Icicles along the eaves, merged into a single mesh per house.
  if (v.extras.icicles) {
    const parts = [];
    const count = 8;
    const eaveY = h + 0.09;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      let ix;
      let iz;
      if (ridgeAlongZ) {
        ix = (i % 2 ? 1 : -1) * halfX;
        iz = -halfZ + t * 2 * halfZ;
      } else {
        ix = -halfX + t * 2 * halfX;
        iz = (i % 2 ? 1 : -1) * halfZ;
      }
      const len = range(rng, 0.32, 0.95);
      const cone = new THREE.ConeGeometry(range(rng, 0.05, 0.11), len, 5);
      cone.rotateX(Math.PI);
      cone.translate(ix, eaveY - len / 2, iz);
      parts.push(cone);
    }
    if (parts.length) {
      const ice = new THREE.Mesh(mergeGeometries(parts), mats.ice);
      group.add(ice);
    }
  }

  // Door, step, handle, wreath.
  box(group, 1.18, 2.15, 0.16, mats.door, 0, 1.08, d / 2 + 0.055);
  box(group, 1.5, 0.18, 0.6, mats.stone, 0, 0.09, d / 2 + 0.28);
  box(group, 0.09, 0.09, 0.06, mats.gold, 0.34, 1.06, d / 2 + 0.15);
  const wreath = new THREE.Mesh(mats.wreathGeo, mats.wreath);
  wreath.position.set(0, 1.62, d / 2 + 0.16);
  group.add(wreath);
  const bow = new THREE.Mesh(mats.bowGeo, mats.bow);
  bow.position.set(0, 1.9, d / 2 + 0.17);
  group.add(bow);

  // Fenced front yards for the frost level.
  if (v.extras.fences && rng() > 0.5) {
    const fz = d / 2 + 2.5;
    const span = w * 0.72;
    for (let i = 0; i < 5; i++) {
      box(group, 0.1, 1.0, 0.1, mats.fence, -span + (i / 4) * span * 2, 0.5, fz);
    }
    box(group, span * 2, 0.09, 0.09, mats.fence, 0, 0.72, fz);
    box(group, span * 2, 0.09, 0.09, mats.fence, 0, 0.36, fz);
  }

  // A warm halo from the windows, plus a lantern by the door.
  const windowGlow = makeGlowSprite(shared, v.windowGlow ?? 0xffb45e, v.windowGlowOpacity ?? 0.17, Math.max(w, d) * 1.5);
  windowGlow.position.set(0, h * 0.56, d / 2 + 0.7);
  group.add(windowGlow);

  if (rng() > 0.4) {
    const lampGlow = makeGlowSprite(shared, v.lampGlow ?? 0xffc071, 0.5, 2.6);
    lampGlow.position.set(0.86, 2.45, d / 2 + 0.22);
    group.add(lampGlow);
    box(group, 0.16, 0.26, 0.16, mats.gold, 0.86, 2.45, d / 2 + 0.14);
  }

  const chimneyGlow = makeGlowSprite(shared, 0xffc46a, 0.16, 2.6);
  chimneyGlow.position.set(ox, surface + chimH + 0.3, oz);
  group.add(chimneyGlow);

  group.updateMatrixWorld(true);
  const topLocal = new THREE.Vector3(ox, surface + chimH + 0.1, oz);
  const topWorld = topLocal.clone().applyMatrix4(group.matrixWorld);

  // Fairy lights strung along the front eave.
  const fairyPoints = [];
  if (v.extras.fairyLights) {
    const count = 11;
    const addEave = (axis, side) => {
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const run = (axis === 'x' ? w : d) * 0.46;
        const across = -run + t * run * 2;
        const ly = h + 0.05 - Math.sin(t * Math.PI) * 0.2;
        const local = axis === 'x'
          ? new THREE.Vector3(across, ly, side * (halfZ + 0.04))
          : new THREE.Vector3(side * (halfX + 0.04), ly, across);
        group.localToWorld(local);
        fairyPoints.push(local.x, local.y, local.z);
      }
    };
    addEave('x', 1);
    addEave('x', -1);
    addEave('z', 1);
    addEave('z', -1);
  }

  const house = {
    group, x, z, rot, w, d, h, roofH, topWorld, windowGlow,
    roofHalfX: halfX, roofHalfZ: halfZ, roofType, ridgeAlongZ,
  };
  const chimney = {
    house,
    topWorld,
    topY: topWorld.y,
    active: true,
    delivered: false,
    radius: isMobile ? CHIMNEY_RADIUS_TOUCH : CHIMNEY_RADIUS,
    capMat,
    cap,
    glow: chimneyGlow,
    smoke: [],
    star: null,
  };
  house.chimney = chimney;

  group.traverse((obj) => {
    if (obj.isMesh && !obj.userData.noShadow) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  chimneyBody.castShadow = true;
  cap.castShadow = true;

  return { house, chimney, fairyPoints };
}

function makeTreeGeometry() {
  const tier = (radius, height, y) => {
    const geo = new THREE.ConeGeometry(radius, height, 7, 1);
    geo.translate(0, y + height / 2, 0);
    return geo;
  };
  const foliage = mergeGeometries([
    tier(1.0, 2.25, 0.0),
    tier(0.78, 2.05, 0.95),
    tier(0.56, 1.8, 1.9),
  ]);
  const snow = mergeGeometries([
    tier(1.02, 0.46, 1.95),
    tier(0.8, 0.42, 2.82),
    tier(0.58, 0.38, 3.52),
  ]);
  const trunk = new THREE.CylinderGeometry(0.1, 0.17, 1.25, 5);
  trunk.translate(0, 0.62, 0);
  return { foliage, snow, trunk };
}

function makeBirchGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.1, 0.2, 4.6, 6);
  trunk.translate(0, 2.3, 0);
  parts.push(trunk);
  const branch = (x, y, z, rx, rz, len, radius) => {
    const geo = new THREE.CylinderGeometry(radius * 0.45, radius, len, 5);
    geo.translate(0, len / 2, 0);
    geo.rotateX(rx);
    geo.rotateZ(rz);
    geo.translate(x, y, z);
    parts.push(geo);
  };
  branch(0.05, 2.2, 0, 0.5, 0.6, 2.0, 0.07);
  branch(-0.05, 2.8, 0.05, -0.45, -0.8, 1.7, 0.06);
  branch(0.02, 3.4, -0.04, 0.35, 0.35, 1.5, 0.05);
  branch(-0.03, 3.9, 0.03, -0.5, -0.3, 1.2, 0.045);
  branch(0.04, 4.3, 0, 0.18, 0.12, 0.9, 0.04);
  return mergeGeometries(parts);
}

function makeMountainGeometry(segments) {
  const geo = new THREE.ConeGeometry(1, 1, segments, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.49) {
      const wobble = 0.82 + Math.random() * 0.32;
      pos.setX(i, pos.getX(i) * wobble);
      pos.setZ(i, pos.getZ(i) * wobble);
      pos.setY(i, y + (Math.random() - 0.5) * 0.08);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function addMountains(parent, rng, mats) {
  const nearGeo = makeMountainGeometry(6);
  const farGeo = makeMountainGeometry(7);
  const capGeo = new THREE.ConeGeometry(1, 1, 6, 1);

  const addRange = (count, minR, maxR, minH, maxH, geo) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + range(rng, -0.12, 0.12);
      const radius = range(rng, minR, maxR);
      const height = range(rng, minH, maxH);
      const width = range(rng, 48, 130);
      const mountain = new THREE.Mesh(geo, mats.mountain);
      mountain.position.set(Math.cos(angle) * radius, height / 2 - 5, Math.sin(angle) * radius);
      mountain.scale.set(width, height, width * range(rng, 0.55, 0.95));
      mountain.rotation.y = rng() * Math.PI;
      parent.add(mountain);

      const cap = new THREE.Mesh(capGeo, mats.mountainSnow);
      cap.position.set(mountain.position.x, height * 0.8 - 5, mountain.position.z);
      cap.scale.set(width * 0.42, height * 0.3, width * 0.3);
      cap.rotation.y = mountain.rotation.y;
      parent.add(cap);
    }
  };

  addRange(16, 360, 540, 85, 175, farGeo);
  addRange(12, 255, 340, 42, 92, nearGeo);
}

function makeStall(parent, mats, shared, angle, radius, withLight) {
  const stall = new THREE.Group();
  stall.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  stall.rotation.y = -angle + Math.PI / 2;
  parent.add(stall);

  const wood = mats.stallWood;
  const counter = box(stall, 3.4, 0.9, 1.5, wood, 0, 0.45, 0);
  counter.castShadow = true;
  for (const s of [-1, 1]) {
    box(stall, 0.12, 2.6, 0.12, wood, s * 1.5, 1.3, -0.55);
    box(stall, 0.12, 2.6, 0.12, wood, s * 1.5, 1.3, 0.55);
  }
  // Striped canopy.
  for (let i = 0; i < 4; i++) {
    box(stall, 0.92, 0.16, 2.2, i % 2 ? mats.canopyB : mats.canopyA, -1.38 + i * 0.92, 2.72, 0);
  }
  // Crates and gifts on the counter.
  for (let i = 0; i < 3; i++) {
    const gift = box(stall, 0.55, 0.5, 0.55, mats.gift[i % mats.gift.length], -1.05 + i * 1.05, 1.15, 0.1);
    gift.rotation.y = (i - 1) * 0.22;
    box(stall, 0.58, 0.08, 0.58, mats.gold, -1.05 + i * 1.05, 1.15, 0.1).rotation.y = gift.rotation.y;
  }
  const glow = makeGlowSprite(shared, mats.stallGlow, 0.45, 6);
  glow.position.set(0, 2.35, 0);
  stall.add(glow);
  let light = null;
  if (withLight) {
    light = new THREE.PointLight(mats.stallLight, 8, 18, 1.9);
    light.position.set(0, 2.4, 0);
    stall.add(light);
  }
  return { stall, light, glow };
}

function makeSnowman(parent, mats, x, z, rot) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  parent.add(group);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 9), mats.snowman);
  bottom.position.y = 0.62;
  bottom.scale.y = 0.9;
  group.add(bottom);
  const middle = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 9), mats.snowman);
  middle.position.y = 1.5;
  group.add(middle);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 9), mats.snowman);
  head.position.y = 2.2;
  group.add(head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 6), mats.carrot);
  nose.position.set(0, 2.2, -0.42);
  nose.rotation.x = Math.PI / 2;
  group.add(nose);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mats.coal);
    eye.position.set(s * 0.13, 2.3, -0.31);
    group.add(eye);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.9, 5), mats.wood);
    arm.position.set(s * 0.68, 1.62, 0);
    arm.rotation.z = s * -1.15;
    arm.rotation.x = 0.18;
    group.add(arm);
  }
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.36, 8), mats.hat);
  hat.position.y = 2.54;
  group.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 10), mats.hat);
  brim.position.y = 2.35;
  group.add(brim);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.08, 5, 12), mats.scarf);
  scarf.position.y = 1.95;
  scarf.rotation.x = Math.PI / 2;
  group.add(scarf);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

function makeFairyLights(parent, shared, positions, color, size) {
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: shared.star,
    color,
    size,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  parent.add(points);
  return mat;
}

function addIceSpires(parent, rng, mats, shared, houses, pond) {
  for (let i = 0; i < 9; i++) {
    let cx = 0;
    let cz = 0;
    let ok = false;
    for (let tries = 0; tries < 50 && !ok; tries++) {
      const angle = rng() * Math.PI * 2;
      const radius = range(rng, 52, 236);
      cx = Math.cos(angle) * radius;
      cz = Math.sin(angle) * radius;
      if (Math.hypot(cx, cz) < 48) continue;
      if (pond && Math.hypot(cx - pond.x, cz - pond.z) < pond.r + 4) continue;
      if (houses.some((hh) => Math.hypot(cx - hh.x, cz - hh.z) < 15)) continue;
      ok = true;
    }
    if (!ok) continue;

    const parts = [];
    const count = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < count; j++) {
      const height = range(rng, 2.5, 13);
      const radius = range(rng, 0.5, 2.1);
      const cone = new THREE.ConeGeometry(radius, height, 5);
      cone.rotateZ(range(rng, -0.16, 0.16));
      cone.rotateX(range(rng, -0.16, 0.16));
      cone.translate(range(rng, -3.2, 3.2), height / 2, range(rng, -3.2, 3.2));
      parts.push(cone);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), mats.ice);
    mesh.position.set(cx, 0, cz);
    parent.add(mesh);

    const glow = makeGlowSprite(shared, 0x9fe8ff, 0.2, 8);
    glow.position.set(cx, 2.4, cz);
    parent.add(glow);
  }
}

function addIceArches(parent, mats, shared) {
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.42, 6, 28, Math.PI), mats.ice);
    arch.position.set(Math.sin(angle) * 58, 0, Math.cos(angle) * 58);
    arch.rotation.y = angle;
    parent.add(arch);
    const glow = makeGlowSprite(shared, 0x9fe8ff, 0.16, 6);
    glow.position.set(arch.position.x, 4.8, arch.position.z);
    parent.add(glow);
  }
}

function makeBonfire(parent, mats, shared, x, z) {
  const base = new THREE.Group();
  base.position.set(x, 0, z);
  parent.add(base);

  const stoneGeo = new THREE.SphereGeometry(0.5, 7, 5);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const stone = new THREE.Mesh(stoneGeo, mats.stone);
    stone.position.set(Math.cos(a) * 2.25, 0.26, Math.sin(a) * 2.25);
    stone.scale.set(1, 0.7 + (i % 3) * 0.15, 1);
    stone.rotation.y = a;
    stone.castShadow = true;
    stone.receiveShadow = true;
    base.add(stone);
  }

  const logGeo = new THREE.CylinderGeometry(0.17, 0.22, 3.2, 6);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(logGeo, mats.wood);
    log.position.set(0, 0.36 + i * 0.15, 0);
    log.rotation.set(0, (i / 5) * Math.PI, Math.PI / 2);
    log.castShadow = true;
    base.add(log);
  }

  const flames = [];
  const flameSpecs = [
    { color: 0xff5a1e, opacity: 0.72, w: 6.2, h: 3.6, y: 1.15, speed: 1.3 },
    { color: 0xffa53a, opacity: 0.66, w: 4.4, h: 2.9, y: 1.65, speed: 1.7 },
    { color: 0xffe6a8, opacity: 0.62, w: 2.4, h: 1.7, y: 1.9, speed: 2.1 },
  ];
  for (const spec of flameSpecs) {
    const flame = makeGlowSprite(shared, spec.color, spec.opacity, 1);
    flame.position.set((Math.random() - 0.5) * 0.4, spec.y, (Math.random() - 0.5) * 0.4);
    flame.userData.baseW = spec.w;
    flame.userData.baseH = spec.h;
    flame.userData.baseOpacity = spec.opacity;
    flame.userData.speed = spec.speed;
    flame.userData.phase = Math.random() * 10;
    base.add(flame);
    flames.push(flame);
  }

  const halo = makeGlowSprite(shared, 0xff7a30, 0.32, 16);
  halo.position.y = 1.4;
  base.add(halo);

  const light = new THREE.PointLight(0xff7a30, 55, 58, 1.8);
  light.position.set(0, 2.2, 0);
  base.add(light);

  const emberCount = 56;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberSpeeds = new Float32Array(emberCount);
  const emberPhases = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) {
    emberPositions[i * 3] = (Math.random() - 0.5) * 1.6;
    emberPositions[i * 3 + 1] = 0.9 + Math.random() * 3.4;
    emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
    emberSpeeds[i] = 0.5 + Math.random() * 1.4;
    emberPhases[i] = Math.random() * Math.PI * 2;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const emberMat = new THREE.PointsMaterial({
    map: shared.star,
    color: 0xffa04a,
    size: 0.5,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  base.add(embers);

  function update(dt, elapsed) {
    for (const flame of flames) {
      const u = flame.userData;
      const flicker = 0.82 + Math.sin(elapsed * u.speed * 3.1 + u.phase) * 0.12
        + Math.sin(elapsed * u.speed * 8.3 + u.phase) * 0.06;
      flame.scale.set(u.baseW * flicker, u.baseH * flicker, 1);
      flame.material.opacity = u.baseOpacity * (0.86 + Math.sin(elapsed * 9 + u.phase) * 0.14);
    }
    halo.material.opacity = 0.3 + Math.sin(elapsed * 3.4) * 0.04;
    light.intensity = 52 + Math.sin(elapsed * 8.1) * 5 + Math.sin(elapsed * 3.7) * 3;

    const p = emberGeo.attributes.position;
    for (let i = 0; i < emberCount; i++) {
      const i3 = i * 3;
      emberPositions[i3] += Math.sin(elapsed * 1.7 + emberPhases[i]) * 0.25 * dt;
      emberPositions[i3 + 1] += emberSpeeds[i] * dt;
      emberPositions[i3 + 2] += Math.cos(elapsed * 1.4 + emberPhases[i]) * 0.22 * dt;
      if (emberPositions[i3 + 1] > 4.6) {
        emberPositions[i3] = (Math.random() - 0.5) * 1.5;
        emberPositions[i3 + 1] = 0.9 + Math.random() * 0.6;
        emberPositions[i3 + 2] = (Math.random() - 0.5) * 1.5;
      }
    }
    p.needsUpdate = true;
  }

  return { update };
}

function addLuminaries(parent, mats, shared) {
  const glows = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = Math.cos(a) * 23.2;
    const z = Math.sin(a) * 23.2;
    const bag = box(parent, 0.52, 0.62, 0.52, mats.luminary, x, 0.31, z);
    bag.rotation.y = -a;
    const glow = makeGlowSprite(shared, 0xffb060, 0.26, 1.8);
    glow.position.set(x, 0.44, z);
    parent.add(glow);
    glows.push(glow);
  }
  return glows;
}

export function buildVillage(parent, level, seed, shared, isMobile) {
  const rng = mulberry32(seed);
  const v = level.theme.village;
  const extras = v.extras;
  const group = new THREE.Group();
  group.name = 'village-build';
  parent.add(group);

  const houseMats = v.wall.map((color) => {
    const c = new THREE.Color(color);
    return new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.88,
      metalness: 0.02,
      emissive: c.clone().multiplyScalar(0.075),
      emissiveIntensity: 1,
    });
  });
  const roofMats = v.roof.map((color) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.93,
    metalness: 0.01,
    emissive: v.roofEmissive,
    emissiveIntensity: v.roofEmissiveIntensity,
  }));

  const roofGeo = new THREE.ConeGeometry(1, 1, 4);
  roofGeo.rotateY(Math.PI / 4);
  const gableRoofGeo = makeGableRoofGeometry();

  const mats = {
    house: houseMats,
    roof: roofMats,
    roofGeo,
    gableRoofGeo,
    snow: new THREE.MeshStandardMaterial({ color: v.snow, roughness: 0.95, metalness: 0, emissive: v.snowEmissive, emissiveIntensity: 0.22 }),
    snowman: new THREE.MeshStandardMaterial({ color: v.snow, roughness: 0.92, metalness: 0, emissive: v.snowEmissive, emissiveIntensity: 0.2 }),
    stone: new THREE.MeshStandardMaterial({ color: v.stone, roughness: 0.96, metalness: 0.03 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x33241d, roughness: 0.9, metalness: 0.02 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3b28, roughness: 0.9, metalness: 0.02 }),
    door: new THREE.MeshStandardMaterial({ color: 0x4a2a1c, roughness: 0.86, metalness: 0.03 }),
    brick: new THREE.MeshStandardMaterial({ color: 0x7a443a, roughness: 0.95, metalness: 0.01 }),
    brickDark: new THREE.MeshStandardMaterial({ color: 0x512e29, roughness: 0.9, metalness: 0.02 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x05070d }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0b25a, roughness: 0.32, metalness: 0.72, emissive: 0x3a2404, emissiveIntensity: 0.5 }),
    wreath: new THREE.MeshStandardMaterial({ color: 0x1f5a43, roughness: 0.82, metalness: 0.02 }),
    bow: new THREE.MeshStandardMaterial({ color: 0xb52a3a, roughness: 0.62, metalness: 0.05 }),
    carrot: new THREE.MeshStandardMaterial({ color: 0xe8792f, roughness: 0.7, metalness: 0 }),
    coal: new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.7, metalness: 0.1 }),
    hat: new THREE.MeshStandardMaterial({ color: 0x1b1d2a, roughness: 0.85, metalness: 0.05 }),
    scarf: new THREE.MeshStandardMaterial({ color: 0xa52c38, roughness: 0.8, metalness: 0.02 }),
    windowGeo: new THREE.PlaneGeometry(1.16, 1.48),
    windowLit: new THREE.MeshBasicMaterial({ map: shared.windowLit, color: v.windowTint, toneMapped: false }),
    windowDark: new THREE.MeshBasicMaterial({ map: shared.windowDark, toneMapped: false }),
    wreathGeo: new THREE.TorusGeometry(0.3, 0.075, 5, 11),
    bowGeo: new THREE.BoxGeometry(0.24, 0.17, 0.08),
    snowPuffGeo: new THREE.SphereGeometry(1, 9, 6),
    pine: new THREE.MeshStandardMaterial({ color: v.pine, roughness: 0.94, metalness: 0, flatShading: true }),
    pineSnow: new THREE.MeshStandardMaterial({ color: v.pineSnow, roughness: 0.95, metalness: 0, emissive: 0x1a2942, emissiveIntensity: 0.2 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x3f2a1e, roughness: 0.95, metalness: 0 }),
    birch: new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.86, metalness: 0, emissive: 0x2a2520, emissiveIntensity: 0.16 }),
    mountain: new THREE.MeshStandardMaterial({ color: v.mountain, roughness: 1, metalness: 0, flatShading: true, emissive: 0x0a1526, emissiveIntensity: 0.55 }),
    mountainSnow: new THREE.MeshStandardMaterial({ color: v.mountainSnow, roughness: 1, metalness: 0, flatShading: true, emissive: 0x1c2e4a, emissiveIntensity: 0.4 }),
    plaza: new THREE.MeshStandardMaterial({ color: v.plaza, roughness: 0.92, metalness: 0.02 }),
    road: new THREE.MeshStandardMaterial({ color: v.road, roughness: 0.94, metalness: 0.01 }),
    ice: new THREE.MeshStandardMaterial({
      color: 0xa8e6ff,
      roughness: 0.12,
      metalness: 0.35,
      emissive: 0x0a3344,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    }),
    frozen: new THREE.MeshStandardMaterial({ color: v.ice, roughness: 0.14, metalness: 0.62 }),
    lampPost: new THREE.MeshStandardMaterial({ color: 0x2a3344, roughness: 0.78, metalness: 0.32 }),
    stallWood: new THREE.MeshStandardMaterial({ color: 0x5c3a26, roughness: 0.88, metalness: 0.02 }),
    canopyA: new THREE.MeshStandardMaterial({ color: v.canopyA, roughness: 0.8, metalness: 0.02 }),
    canopyB: new THREE.MeshStandardMaterial({ color: v.canopyB, roughness: 0.85, metalness: 0.02 }),
    fence: new THREE.MeshStandardMaterial({ color: 0x4a3327, roughness: 0.92, metalness: 0.01 }),
    luminary: new THREE.MeshStandardMaterial({ color: 0xf0d9a8, roughness: 0.9, metalness: 0, emissive: 0xffa050, emissiveIntensity: 1.2 }),
    stallGlow: v.lampGlow ?? 0xffb45e,
    stallLight: v.lampLight ?? 0xffb45e,
    gift: [
      new THREE.MeshStandardMaterial({ color: 0xcf4640, roughness: 0.5, metalness: 0.08 }),
      new THREE.MeshStandardMaterial({ color: 0x2f8b6e, roughness: 0.5, metalness: 0.08 }),
      new THREE.MeshStandardMaterial({ color: 0x4a74b8, roughness: 0.5, metalness: 0.08 }),
    ],
  };

  const groundMat = new THREE.MeshStandardMaterial({
    color: v.ground,
    map: shared.ground,
    roughness: 0.97,
    metalness: 0.01,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Plaza, ring road, and the four radial streets.
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(27, 64), mats.plaza);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.035;
  plaza.receiveShadow = true;
  group.add(plaza);
  const plazaRim = new THREE.Mesh(new THREE.RingGeometry(27, 28.3, 64), mats.stone);
  plazaRim.rotation.x = -Math.PI / 2;
  plazaRim.position.y = 0.04;
  group.add(plazaRim);

  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(30, 35, 64), mats.road);
  ringRoad.rotation.x = -Math.PI / 2;
  ringRoad.position.y = 0.025;
  ringRoad.receiveShadow = true;
  group.add(ringRoad);

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 150), mats.road);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -angle;
    road.position.set(Math.sin(angle) * 102, 0.02, Math.cos(angle) * 102);
    road.receiveShadow = true;
    group.add(road);
  }

  // Frozen pond with a few bright cracks.
  const pond = v.pond ? { ...v.pond } : null;
  if (pond) {
    const pondMesh = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 48), mats.frozen);
    pondMesh.rotation.x = -Math.PI / 2;
    pondMesh.position.set(pond.x, 0.045, pond.z);
    group.add(pondMesh);
    const pondRim = new THREE.Mesh(new THREE.RingGeometry(pond.r, pond.r + 2.6, 48), mats.snow);
    pondRim.rotation.x = -Math.PI / 2;
    pondRim.position.set(pond.x, 0.05, pond.z);
    group.add(pondRim);
    const crackPositions = [];
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * pond.r * 0.8;
      const x = pond.x + Math.cos(a) * r;
      const z = pond.z + Math.sin(a) * r;
      const len = range(rng, 1.4, 5.5);
      const ang = rng() * Math.PI;
      crackPositions.push(
        x, 0.06, z,
        x + Math.cos(ang) * len, 0.06, z + Math.sin(ang) * len,
      );
    }
    const crackGeo = new THREE.BufferGeometry();
    crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(crackPositions, 3));
    const cracks = new THREE.LineSegments(crackGeo, new THREE.LineBasicMaterial({
      color: 0xa8d4ff,
      transparent: true,
      opacity: 0.5,
    }));
    group.add(cracks);
  }

  // Central Christmas tree.
  const treeGroup = new THREE.Group();
  group.add(treeGroup);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.05, 5.4, 7), mats.trunk);
  trunk.position.y = 2.7;
  trunk.castShadow = true;
  treeGroup.add(trunk);
  for (let i = 0; i < 6; i++) {
    const radius = 7.0 - i * 0.98;
    const height = 3.8;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 9), mats.pine);
    cone.position.y = 4.6 + i * 2.65;
    cone.castShadow = true;
    cone.receiveShadow = true;
    treeGroup.add(cone);
    const snowCone = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.94, 0.6, 9), mats.pineSnow);
    snowCone.position.y = 4.6 + i * 2.65 + height / 2 - 0.2;
    treeGroup.add(snowCone);
  }
  const garlandGeo = new THREE.BufferGeometry();
  const garlandPositions = [];
  const garlandColors = [];
  const palette = (v.treePalette ?? [0xffcf6e]).map((color) => new THREE.Color(color));
  for (let i = 0; i < 300; i++) {
    const t = i / 300;
    const angle = t * Math.PI * 17;
    const radius = 6.7 * (1 - t * 0.86);
    garlandPositions.push(Math.cos(angle) * radius, 3.5 + t * 16.3, Math.sin(angle) * radius);
    const c = palette[Math.floor(rng() * palette.length)];
    garlandColors.push(c.r, c.g, c.b);
  }
  garlandGeo.setAttribute('position', new THREE.Float32BufferAttribute(garlandPositions, 3));
  garlandGeo.setAttribute('color', new THREE.Float32BufferAttribute(garlandColors, 3));
  const garlandMat = new THREE.PointsMaterial({
    size: 0.38,
    map: shared.star,
    transparent: true,
    opacity: 0.95,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const garland = new THREE.Points(garlandGeo, garlandMat);
  treeGroup.add(garland);

  const treeStarColor = v.treeStar ?? 0xffd67a;
  const treeStarMat = new THREE.MeshBasicMaterial({ color: treeStarColor, toneMapped: false });
  const treeStar = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), treeStarMat);
  treeStar.position.y = 21.1;
  treeGroup.add(treeStar);
  const treeGlow = makeGlowSprite(shared, treeStarColor, 0.8, 10);
  treeGlow.position.y = 21.1;
  treeGroup.add(treeGlow);
  const treeLight = new THREE.PointLight(v.treeLight ?? 0xffc46a, 30, 64, 1.8);
  treeLight.position.y = 19.5;
  treeGroup.add(treeLight);

  // Gift piles around the tree.
  const giftGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const r = range(rng, 4.5, 8.5);
    const size = range(rng, 0.7, 1.4);
    const gift = new THREE.Mesh(giftGeo, mats.gift[i % mats.gift.length]);
    gift.scale.set(size, size * range(rng, 0.7, 1.1), size);
    gift.position.set(Math.cos(a) * r, gift.scale.y / 2, Math.sin(a) * r);
    gift.rotation.y = rng() * Math.PI;
    gift.castShadow = true;
    gift.receiveShadow = true;
    treeGroup.add(gift);
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 0.16), mats.gold);
    ribbon.scale.copy(gift.scale);
    ribbon.position.copy(gift.position);
    ribbon.rotation.copy(gift.rotation);
    ribbon.castShadow = true;
    treeGroup.add(ribbon);
  }

  // Market stalls around the plaza.
  const stalls = [];
  if (extras.stalls) {
    for (let i = 0; i < extras.stallCount; i++) {
      stalls.push(makeStall(group, mats, shared, Math.PI / 4 + (i / extras.stallCount) * Math.PI * 2, 22, !isMobile));
    }
  }

  // Benches facing the tree.
  if (extras.benches !== false) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bench = new THREE.Group();
      bench.position.set(Math.cos(a) * 25.5, 0, Math.sin(a) * 25.5);
      bench.rotation.y = -a;
      group.add(bench);
      box(bench, 2.8, 0.16, 0.8, mats.wood, 0, 0.52, 0);
      box(bench, 2.8, 0.7, 0.14, mats.wood, 0, 0.9, 0.34);
      box(bench, 0.16, 0.5, 0.7, mats.darkWood, -1.15, 0.26, 0);
      box(bench, 0.16, 0.5, 0.7, mats.darkWood, 1.15, 0.26, 0);
    }
  }

  // Snowmen near the plaza.
  const snowmen = [];
  for (let i = 0; i < extras.snowmen; i++) {
    const a = (i / Math.max(1, extras.snowmen)) * Math.PI * 2 + 0.3;
    const r = 20 + (i % 2) * 3.4;
    snowmen.push(makeSnowman(group, mats, Math.cos(a) * r, Math.sin(a) * r, -a + Math.PI));
  }

  // Lamp posts.
  const lamps = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + (i % 2) * 0.1;
    const radius = i < 8 ? 32.5 : 48;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const lamp = new THREE.Group();
    lamp.position.set(x, 0, z);
    group.add(lamp);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 4.4, 6), mats.lampPost);
    post.position.y = 2.2;
    post.castShadow = true;
    lamp.add(post);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.52), mats.gold);
    cage.position.y = 4.55;
    lamp.add(cage);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshBasicMaterial({ color: v.lampGlow, toneMapped: false }));
    bulb.position.y = 4.55;
    lamp.add(bulb);
    const glow = makeGlowSprite(shared, v.lampGlow, 0.55, 4.6);
    glow.position.y = 4.55;
    lamp.add(glow);
    let light = null;
    if (i < (isMobile ? 3 : 6)) {
      light = new THREE.PointLight(v.lampLight, 15, 30, 1.9);
      light.position.y = 4.4;
      lamp.add(light);
    }
    lamps.push({ light, glow, phase: rng() * 10 });
  }

  // Bonfire and luminaries for the still, sleeping village.
  let bonfire = null;
  let luminaryGlows = [];
  if (extras.bonfire) {
    bonfire = makeBonfire(group, mats, shared, 16, -6);
  }
  if (extras.luminaries) {
    luminaryGlows = addLuminaries(group, mats, shared);
  }
  if (extras.iceArches) addIceArches(group, mats, shared);

  // Houses: choose a layout that suits the level's mood.
  const spots = [];
  const start = { x: 0, z: 150 };
  const nearStreet = (x, z) => {
    const radius = Math.hypot(x, z);
    if (radius > 170) return false;
    const angle = Math.atan2(z, x);
    return [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].some((a) => {
      const diff = Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a)));
      return diff < 0.075;
    });
  };
  const blocked = (x, z, list, minGap) => {
    if (Math.hypot(x, z) < 38) return true;
    if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 12) return true;
    if (Math.hypot(x - start.x, z - start.z) < 24) return true;
    return list.some((s) => Math.hypot(x - s.x, z - s.z) < minGap);
  };

  if (v.layout === 'rings') {
    const ringDefs = [
      { r: 44, n: 5 },
      { r: 61, n: 7 },
      { r: 80, n: 9 },
      { r: 101, n: 11 },
      { r: 124, n: 13 },
      { r: 146, n: 15 },
    ];
    const candidates = [];
    for (let ri = 0; ri < ringDefs.length; ri++) {
      const ring = ringDefs[ri];
      for (let i = 0; i < ring.n; i++) {
        const angle = ((i + (ri % 2) * 0.5) / ring.n) * Math.PI * 2 + range(rng, -0.05, 0.05);
        const radius = ring.r + range(rng, -2.5, 2.5);
        candidates.push({ angle, radius });
      }
    }
    for (const c of candidates) {
      if (spots.length >= level.houses) break;
      const x = Math.cos(c.angle) * c.radius;
      const z = Math.sin(c.angle) * c.radius;
      if (nearStreet(x, z)) continue;
      if (blocked(x, z, spots, 21)) continue;
      spots.push({ x, z, rot: Math.atan2(-x, -z) + range(rng, -0.15, 0.15) });
    }
  } else if (v.layout === 'hamlets') {
    const centers = [0.55, 2.12, 3.69, 5.26].map((a) => ({
      x: Math.cos(a) * 102,
      z: Math.sin(a) * 102,
    }));
    let attempts = 0;
    let hamletIndex = 0;
    while (spots.length < level.houses && attempts < level.houses * 260) {
      attempts++;
      const center = centers[hamletIndex % centers.length];
      hamletIndex++;
      const angle = rng() * Math.PI * 2;
      const r = 7 + Math.sqrt(rng()) * 40;
      const x = center.x + Math.cos(angle) * r;
      const z = center.z + Math.sin(angle) * r;
      if (Math.hypot(x, z) < 46) continue;
      if (nearStreet(x, z)) continue;
      if (blocked(x, z, spots, 26)) continue;
      spots.push({
        x,
        z,
        rot: Math.atan2(center.x - x, center.z - z) + range(rng, -0.18, 0.18),
      });
    }
    // Safety net: fill any remaining houses in a loose outer ring.
    for (let i = 0; spots.length < level.houses && i < 3000; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = 56 + Math.sqrt(rng()) * 92;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (nearStreet(x, z) || blocked(x, z, spots, 24)) continue;
      spots.push({ x, z, rot: Math.atan2(-x, -z) + range(rng, -0.2, 0.2) });
    }
  } else {
    const maxRadius = isMobile ? 138 : 150;
    let attempts = 0;
    while (spots.length < level.houses && attempts < 9000) {
      attempts++;
      const angle = rng() * Math.PI * 2;
      const radius = 40 + Math.sqrt(rng()) * (maxRadius - 40);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (blocked(x, z, spots, 19)) continue;
      if (nearStreet(x, z)) continue;
      spots.push({ x, z, rot: Math.atan2(-x, -z) + range(rng, -0.28, 0.28) });
    }
  }

  const houses = [];
  const chimneys = [];
  const smoke = [];
  const fairyPositions = [];
  const sizes = v.sizes;
  for (const spot of spots) {
    const w = range(rng, sizes.w[0], sizes.w[1]);
    const d = range(rng, sizes.d[0], sizes.d[1]);
    const h = range(rng, sizes.h[0], sizes.h[1]);
    const roofH = range(rng, sizes.roofH[0], sizes.roofH[1]);
    const roofType = v.roofStyle === 'gable' ? 'gable' : 'pyramid';
    const ridgeAlongZ = roofType === 'gable' && rng() > 0.5;
    const { house, chimney, fairyPoints } = buildHouse(group, {
      ...spot,
      w, d, h, roofH, rng,
      tall: rng() > 0.55,
      roofType,
      ridgeAlongZ,
      v,
    }, mats, shared, isMobile);
    houses.push(house);
    chimneys.push(chimney);
    if (fairyPoints.length) fairyPositions.push(...fairyPoints);

    for (let s = 0; s < 2; s++) {
      const smokeMat = new THREE.SpriteMaterial({
        map: shared.smoke,
        color: v.smokeColor ?? 0x9fb6d8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending,
        fog: true,
      });
      const puff = new THREE.Sprite(smokeMat);
      puff.position.copy(chimney.topWorld);
      puff.scale.set(1.6, 1.6, 1);
      group.add(puff);
      const entry = {
        sprite: puff,
        base: chimney.topWorld.clone(),
        age: rng() * 5 + s * 2.1,
        life: 4.2 + rng() * 3,
        speed: 0.65 + rng() * 0.5,
        phase: rng() * 10,
        chimney,
        drift: (rng() - 0.5) * 0.9,
      };
      smoke.push(entry);
      chimney.smoke.push(entry);
    }
  }

  if (extras.iceSpires) addIceSpires(group, rng, mats, shared, houses, pond);

  // Pines: three instanced layers (foliage, snow, trunk).
  const treeSpots = [];
  const treeCount = level.trees + (isMobile ? 0 : 60);
  for (let i = 0; i < treeCount * 5 && treeSpots.length < treeCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 33 + Math.sqrt(rng()) * (330 - 33);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.hypot(x, z) < 35) continue;
    if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 4) continue;
    if (Math.hypot(x - start.x, z - start.z) < 14) continue;
    if (Math.abs(x) < 9 || Math.abs(z) < 9) continue;
    if (houses.some((hh) => Math.hypot(x - hh.x, z - hh.z) < 13)) continue;
    if (treeSpots.some((t) => Math.hypot(x - t.x, z - t.z) < 4.5)) continue;
    treeSpots.push({ x, z, scale: range(rng, 0.7, 1.95), rot: rng() * Math.PI * 2 });
  }

  const treeGeo = makeTreeGeometry();
  const dummy = new THREE.Object3D();
  const foliageMesh = new THREE.InstancedMesh(treeGeo.foliage, mats.pine, treeSpots.length);
  const capMesh = new THREE.InstancedMesh(treeGeo.snow, mats.pineSnow, treeSpots.length);
  const trunkMesh = new THREE.InstancedMesh(treeGeo.trunk, mats.trunk, treeSpots.length);
  foliageMesh.castShadow = true;
  foliageMesh.receiveShadow = true;
  capMesh.castShadow = true;
  trunkMesh.castShadow = true;
  for (let i = 0; i < treeSpots.length; i++) {
    const t = treeSpots[i];
    dummy.position.set(t.x, 0, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    foliageMesh.setMatrixAt(i, dummy.matrix);
    capMesh.setMatrixAt(i, dummy.matrix);
    trunkMesh.setMatrixAt(i, dummy.matrix);
  }
  for (const mesh of [foliageMesh, capMesh, trunkMesh]) {
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Bare birches wrapped in fairy lights, for the last quiet level.
  if (extras.birch > 0) {
    const birchSpots = [];
    for (let i = 0; i < extras.birch * 9 && birchSpots.length < extras.birch; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = 36 + Math.sqrt(rng()) * 250;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x, z) < 34) continue;
      if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 3) continue;
      if (Math.hypot(x - start.x, z - start.z) < 14) continue;
      if (Math.abs(x) < 9 || Math.abs(z) < 9) continue;
      if (houses.some((hh) => Math.hypot(x - hh.x, z - hh.z) < 14)) continue;
      if (treeSpots.some((t) => Math.hypot(x - t.x, z - t.z) < 6)) continue;
      if (birchSpots.some((b) => Math.hypot(x - b.x, z - b.z) < 7)) continue;
      birchSpots.push({ x, z, scale: range(rng, 0.8, 1.55), rot: rng() * Math.PI * 2 });
    }
    const birchGeo = makeBirchGeometry();
    const birchMesh = new THREE.InstancedMesh(birchGeo, mats.birch, birchSpots.length);
    birchMesh.castShadow = true;
    birchMesh.frustumCulled = false;
    for (let i = 0; i < birchSpots.length; i++) {
      const b = birchSpots[i];
      dummy.position.set(b.x, 0, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      birchMesh.setMatrixAt(i, dummy.matrix);
      const lights = 16;
      for (let j = 0; j < lights; j++) {
        const t = j / lights;
        const a = t * Math.PI * 9 + b.rot;
        const radius = 1.05 * b.scale * (0.55 + 0.45 * Math.sin(t * Math.PI * 2));
        fairyPositions.push(
          b.x + Math.cos(a) * radius,
          (1.1 + t * 4.1) * b.scale,
          b.z + Math.sin(a) * radius,
        );
      }
    }
    birchMesh.instanceMatrix.needsUpdate = true;
    group.add(birchMesh);
  }

  const fairyMat = makeFairyLights(group, shared, fairyPositions, 0xffd9a6, 0.48);

  addMountains(group, rng, mats);

  // Soft snow drifts.
  const driftGeo = new THREE.SphereGeometry(1, 9, 6);
  const driftCount = isMobile ? 30 : 56;
  const driftMesh = new THREE.InstancedMesh(driftGeo, mats.snow, driftCount);
  for (let i = 0; i < driftCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = range(rng, 36, 240);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    dummy.position.set(x, 0.02, z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(range(rng, 2, 7), range(rng, 0.22, 0.75), range(rng, 2, 7));
    dummy.updateMatrix();
    driftMesh.setMatrixAt(i, dummy.matrix);
  }
  driftMesh.receiveShadow = true;
  driftMesh.frustumCulled = false;
  driftMesh.instanceMatrix.needsUpdate = true;
  group.add(driftMesh);

  const delivered = [];
  function deliver(chimney) {
    if (!chimney.active) return;
    chimney.active = false;
    chimney.delivered = true;
    chimney.capMat.color.set(0xffd37d);
    chimney.capMat.emissive.set(0x9a6200);
    chimney.capMat.emissiveIntensity = 1.8;
    chimney.glow.material.color.set(0xffdf9a);
    chimney.glow.material.opacity = 0.5;
    chimney.glow.scale.set(4.4, 4.4, 1);
    if (chimney.house.windowGlow) {
      chimney.house.windowGlow.material.color.set(0xffd08a);
      chimney.house.windowGlow.material.opacity = 0.36;
    }
    for (const s of chimney.smoke) {
      s.sprite.material.color.set(0xffd08a);
    }

    const starMat = new THREE.SpriteMaterial({
      map: shared.star,
      color: 0xffdc91,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const star = new THREE.Sprite(starMat);
    star.position.copy(chimney.topWorld);
    star.position.y += 3.4;
    star.scale.set(2.8, 2.8, 1);
    group.add(star);
    chimney.star = star;
    delivered.push({ sprite: star, baseY: star.position.y, phase: rng() * 7 });
  }

  function update(dt, elapsed) {
    for (const s of smoke) {
      s.age += dt * s.speed;
      if (s.age > s.life) {
        s.age = 0;
        s.sprite.position.copy(s.base);
      }
      const t = s.age / s.life;
      s.sprite.position.x = s.base.x + Math.sin(t * 3.2 + s.phase) * 0.6 + t * s.drift * 2.2;
      s.sprite.position.y = s.base.y + t * 6.2;
      s.sprite.position.z = s.base.z + Math.cos(t * 2.5 + s.phase) * 0.5 + t * s.drift * 1.4;
      const scale = 1.5 + t * 3.4;
      s.sprite.scale.set(scale, scale, 1);
      s.sprite.material.opacity = Math.sin(t * Math.PI) * 0.2;
    }
    for (const d of delivered) {
      d.sprite.position.y = d.baseY + Math.sin(elapsed * 1.9 + d.phase) * 0.3;
      const pulse = 2.4 + Math.sin(elapsed * 2.6 + d.phase) * 0.25;
      d.sprite.scale.set(pulse, pulse, 1);
      d.sprite.material.opacity = 0.72 + Math.sin(elapsed * 3.1 + d.phase) * 0.2;
    }
    for (const lamp of lamps) {
      if (lamp.light) {
        lamp.light.intensity = 14 + Math.sin(elapsed * 8.3 + lamp.phase) * 2.2 + Math.sin(elapsed * 3.1 + lamp.phase) * 1.1;
      }
      lamp.glow.material.opacity = 0.5 + Math.sin(elapsed * 6.2 + lamp.phase) * 0.08;
    }
    for (const s of stalls) {
      if (s.light) s.light.intensity = 8 + Math.sin(elapsed * 5.7 + s.glow.position.x) * 1.4;
      s.glow.material.opacity = 0.4 + Math.sin(elapsed * 4.3 + s.glow.position.z) * 0.08;
    }
    for (const glow of luminaryGlows) {
      glow.material.opacity = 0.24 + Math.sin(elapsed * 4.6 + glow.position.x) * 0.05;
    }
    treeStar.rotation.y += dt * 0.9;
    treeStar.rotation.z = Math.sin(elapsed * 1.4) * 0.12;
    const starPulse = 1 + Math.sin(elapsed * 2.4) * 0.08;
    treeStar.scale.setScalar(starPulse);
    treeGlow.material.opacity = 0.72 + Math.sin(elapsed * 2.2) * 0.16;
    treeLight.intensity = 28 + Math.sin(elapsed * 5.1) * 5;
    garland.rotation.y += dt * 0.04;
    if (fairyMat) fairyMat.opacity = 0.9 + Math.sin(elapsed * 2.7) * 0.1;
    if (bonfire) bonfire.update(dt, elapsed);
  }

  function dispose() {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((obj) => {
      if (obj.geometry) geometries.add(obj.geometry);
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => materials.add(m));
        else materials.add(obj.material);
      }
    });
    for (const geo of geometries) geo.dispose();
    for (const mat of materials) mat.dispose();
    parent.remove(group);
    group.clear();
  }

  return { group, houses, chimneys, deliver, update, dispose };
}
