import * as THREE from 'three';

const M = {
  red: new THREE.MeshStandardMaterial({ color: 0xb12e42, roughness: 0.5, metalness: 0.08, emissive: 0x26040a, emissiveIntensity: 0.35 }),
  redDark: new THREE.MeshStandardMaterial({ color: 0x7a2030, roughness: 0.6, metalness: 0.05, emissive: 0x1a0308, emissiveIntensity: 0.3 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xe6b756, roughness: 0.26, metalness: 0.82, emissive: 0x3a2404, emissiveIntensity: 0.5 }),
  green: new THREE.MeshStandardMaterial({ color: 0x245a48, roughness: 0.72, metalness: 0.04 }),
  fur: new THREE.MeshStandardMaterial({ color: 0x7a5138, roughness: 0.9, metalness: 0, emissive: 0x160b05, emissiveIntensity: 0.25 }),
  furLight: new THREE.MeshStandardMaterial({ color: 0xa07657, roughness: 0.9, metalness: 0, emissive: 0x1a0e07, emissiveIntensity: 0.2 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xf2e8d6, roughness: 0.85, metalness: 0 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x241b1c, roughness: 0.7, metalness: 0.1 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xe0a986, roughness: 0.8, metalness: 0 }),
  sack: new THREE.MeshStandardMaterial({ color: 0x8a5f3a, roughness: 0.92, metalness: 0, emissive: 0x1c1006, emissiveIntensity: 0.35 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffc46b, toneMapped: false }),
  nose: new THREE.MeshBasicMaterial({ color: 0xff4a38, toneMapped: false }),
  antler: new THREE.MeshStandardMaterial({ color: 0xa08a63, roughness: 0.82, metalness: 0.02 }),
};

function box(parent, w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function cyl(parent, rTop, rBottom, h, material, x = 0, y = 0, z = 0, segments = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function sphere(parent, r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function buildReindeer(x, phase) {
  const root = new THREE.Group();
  root.position.set(x, 0, -5.5);
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.05, 4, 9), M.fur);
  torso.rotation.x = Math.PI / 2;
  torso.position.set(0, 1.5, 0);
  body.add(torso);

  // Chest and haunches.
  sphere(body, 0.36, M.fur, 0, 1.5, -0.55, 1, 1.05, 1);
  sphere(body, 0.38, M.fur, 0, 1.5, 0.5, 1, 1.05, 1);

  const neck = cyl(body, 0.14, 0.18, 0.78, M.fur, 0, 1.95, -0.55, 7);
  neck.rotation.x = -0.42;

  const head = new THREE.Group();
  head.position.set(0, 2.27, -0.92);
  body.add(head);
  sphere(head, 0.25, M.furLight, 0, 0, 0, 1, 0.95, 1.15);
  box(head, 0.22, 0.2, 0.38, M.furLight, 0, -0.08, -0.26);
  sphere(head, 0.09, M.nose, 0, -0.08, -0.47);

  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), M.fur);
  earL.position.set(-0.19, 0.2, 0.02);
  earL.rotation.z = 0.5;
  head.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.19;
  earR.rotation.z = -0.5;
  head.add(earR);

  for (const side of [-1, 1]) {
    const beam = cyl(head, 0.025, 0.035, 0.62, M.antler, side * 0.13, 0.42, 0.02, 5);
    beam.rotation.z = side * -0.28;
    beam.rotation.x = -0.22;
    for (let i = 0; i < 3; i++) {
      const branch = cyl(head, 0.015, 0.022, 0.24, M.antler, side * (0.18 + i * 0.03), 0.5 + i * 0.1, 0.02, 4);
      branch.rotation.z = side * (0.8 - i * 0.1);
      branch.rotation.x = -0.4 + i * 0.28;
    }
  }

  // Harness and little bells.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 14), M.gold);
  collar.position.set(0, 1.55, -0.16);
  body.add(collar);
  sphere(body, 0.065, M.gold, 0, 1.55, -0.6);

  const tail = sphere(body, 0.14, M.cream, 0, 1.55, 0.95, 1, 0.9, 1.2);

  const legs = [];
  const legPositions = [
    [-0.26, -0.55, 0],
    [0.26, -0.55, Math.PI],
    [-0.26, 0.52, Math.PI],
    [0.26, 0.52, 0],
  ];
  for (const [lx, lz, legPhase] of legPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 1.22, lz);
    body.add(pivot);
    const leg = cyl(pivot, 0.07, 0.055, 0.92, M.fur, 0, -0.46, 0, 6);
    box(pivot, 0.16, 0.11, 0.24, M.dark, 0, -0.94, -0.03);
    legs.push({ pivot, phase: legPhase });
  }

  root.userData = { body, head, legs, tail, phase };
  return root;
}

export function createSleigh() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Hull.
  box(body, 1.95, 0.78, 4.05, M.red, 0, 0.05, 0);
  box(body, 1.5, 0.32, 4.55, M.redDark, 0, -0.47, 0);
  box(body, 2.08, 0.2, 4.12, M.gold, 0, 0.48, 0);
  box(body, 2.02, 0.1, 3.7, M.gold, 0, 0.6, 0.08);

  // Curved front and back trim.
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.1, 7, 18, Math.PI * 0.92), M.gold);
  curl.rotation.y = Math.PI / 2;
  curl.position.set(0, 0.68, -2.03);
  body.add(curl);
  const curlTip = sphere(body, 0.11, M.gold, 0, 1.38, -2.03);

  // Runners.
  for (const side of [-1, 1]) {
    box(body, 0.12, 0.12, 5.15, M.gold, side * 0.95, -0.78, 0.05);
    const tip = box(body, 0.12, 0.12, 1.15, M.gold, side * 0.95, -0.55, -2.92);
    tip.rotation.x = 0.52;
    const tailTip = box(body, 0.12, 0.12, 0.75, M.gold, side * 0.95, -0.62, 2.72);
    tailTip.rotation.x = -0.38;
    // Supports.
    box(body, 0.09, 0.5, 0.09, M.dark, side * 0.95, -0.5, -1.4);
    box(body, 0.09, 0.5, 0.09, M.dark, side * 0.95, -0.5, 1.4);
  }

  // Seat and backrest.
  box(body, 1.45, 0.62, 1.7, M.green, 0, 0.78, 0.65);
  box(body, 1.5, 1.12, 0.18, M.red, 0, 1.35, 1.55);
  box(body, 1.55, 0.1, 0.22, M.gold, 0, 1.9, 1.55);
  box(body, 0.1, 1.12, 0.2, M.gold, -0.72, 1.35, 1.55);
  box(body, 0.1, 1.12, 0.2, M.gold, 0.72, 1.35, 1.55);

  // Gift sack.
  const sack = sphere(body, 0.72, M.sack, 0.28, 1.3, 1.72, 0.9, 1.0, 0.8);
  const sackTie = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 5, 10), M.gold);
  sackTie.position.set(0.28, 1.92, 1.72);
  sackTie.rotation.x = Math.PI / 2;
  body.add(sackTie);
  box(body, 0.5, 0.45, 0.5, M.red, -0.58, 1.2, 1.8);
  box(body, 0.52, 0.07, 0.52, M.gold, -0.58, 1.2, 1.8);

  // Santa.
  const santa = new THREE.Group();
  santa.position.set(0, 1.02, 0.62);
  body.add(santa);
  sphere(santa, 0.48, M.red, 0, 0.42, 0, 1, 1.05, 0.9);
  box(santa, 0.92, 0.13, 0.86, M.dark, 0, 0.15, 0);
  box(santa, 0.2, 0.16, 0.06, M.gold, 0, 0.15, 0.44);
  const head = sphere(santa, 0.26, M.skin, 0, 0.98, 0.01);
  sphere(santa, 0.28, M.cream, 0, 0.9, -0.17, 1.25, 1.05, 0.78);
  sphere(santa, 0.075, M.cream, 0, 0.99, -0.32);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.62, 8), M.red);
  hat.position.set(0.05, 1.43, 0.02);
  hat.rotation.z = -0.12;
  santa.add(hat);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 6, 14), M.cream);
  brim.position.set(0, 1.15, 0.01);
  brim.rotation.x = Math.PI / 2;
  santa.add(brim);
  sphere(santa, 0.09, M.cream, 0.2, 1.72, 0.02);
  // Eyes.
  sphere(santa, 0.025, M.dark, -0.085, 1.03, -0.23);
  sphere(santa, 0.025, M.dark, 0.085, 1.03, -0.23);
  // Arms.
  const armL = cyl(santa, 0.08, 0.1, 0.62, M.red, -0.46, 0.5, -0.02, 6);
  armL.rotation.z = 0.5;
  armL.rotation.x = -0.2;
  const armR = cyl(santa, 0.08, 0.1, 0.62, M.red, 0.46, 0.5, -0.02, 6);
  armR.rotation.z = -0.5;
  armR.rotation.x = -0.2;
  sphere(santa, 0.1, M.cream, -0.62, 0.26, -0.12);
  sphere(santa, 0.1, M.cream, 0.62, 0.26, -0.12);

  // Lantern.
  const lantern = new THREE.Group();
  lantern.position.set(0, 1.38, 2.18);
  body.add(lantern);
  cyl(lantern, 0.11, 0.13, 0.18, M.gold, 0, 0.19, 0, 6);
  cyl(lantern, 0.15, 0.11, 0.08, M.gold, 0, 0.33, 0, 6);
  sphere(lantern, 0.14, M.glow, 0, 0.02, 0);
  const light = new THREE.PointLight(0xffb45e, 11, 24, 1.8);
  light.position.set(0, 0.05, 0);
  lantern.add(light);

  // A cool rim light keeps the sleigh readable against the night sky.
  const rim = new THREE.PointLight(0xc2d8ff, 6.5, 16, 1.9);
  rim.position.set(0, 4.2, 3.4);
  group.add(rim);

  // Reindeer.
  const reindeer = [buildReindeer(-0.98, 0), buildReindeer(0.98, 0.6)];
  for (const deer of reindeer) body.add(deer);

  // Reins.
  for (const side of [-1, 1]) {
    const points = [
      new THREE.Vector3(side * 0.42, 0.66, -2.15),
      new THREE.Vector3(side * 0.5, 1.3, -3.4),
      new THREE.Vector3(side * 0.95, 1.66, -5.0),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd8a646, transparent: true, opacity: 0.72 }));
    body.add(line);
  }

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const state = { t: 0, reindeer, lantern, light, santa, body, curl, curlTip, sack };
  return {
    group,
    state,
    update(dt, speedFactor = 1) {
      state.t += dt * (0.75 + speedFactor * 0.35);
      const t = state.t;
      body.position.y = Math.sin(t * 2.1) * 0.045;
      body.rotation.z = Math.sin(t * 1.4) * 0.008;
      for (const deer of reindeer) {
        const d = deer.userData;
        d.body.position.y = Math.sin(t * 15 + d.phase) * 0.045;
        d.head.rotation.x = Math.sin(t * 7.5 + d.phase) * 0.08;
        d.head.rotation.z = Math.sin(t * 3.2 + d.phase) * 0.035;
        d.tail.rotation.x = Math.sin(t * 6 + d.phase) * 0.25;
        for (const leg of d.legs) {
          leg.pivot.rotation.x = Math.sin(t * 9.5 + d.phase + leg.phase) * 0.58;
        }
      }
      light.intensity = 10.5 + Math.sin(t * 11.3) * 1.3 + Math.sin(t * 5.7) * 0.9;
      santa.rotation.z = Math.sin(t * 1.8) * 0.02;
    },
  };
}
