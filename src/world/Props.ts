import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, range } from '../core/PRNG';
import { PIGMENTS } from '../game/Pigments';
import { BRIDGE_DECK_Y, BRIDGE_HALF_Z, BRIDGE_RAMP, WATER_LEVEL, WORLD_HALF_WIDTH, World } from './World';
import { BRIDGE_Z, centerX, riverZ } from './Path';

export interface PropsResult {
  root: THREE.Group;
  beacons: THREE.InstancedMesh;
  beaconBaseY: number[];
}

function bake(geo: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.clone();
  g.applyMatrix4(matrix);
  return g;
}

export function buildProps(world: World): PropsResult {
  const root = new THREE.Group();
  root.name = 'props';

  const rng = mulberry32(world.seed ^ 0x9e3779b9);
  const xf = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

  // ---- pines -------------------------------------------------------------
  const treeSpots: { x: number; z: number; y: number; s: number; rot: number }[] = [];
  for (let z = 16; z < 792; z += 9) {
    const cx = centerX(z);
    for (let lat = -118; lat <= 118; lat += 9) {
      const jitterX = range(rng, -3, 3);
      const jitterZ = range(rng, -3, 3);
      const x = cx + lat + jitterX;
      const zz = z + jitterZ;
      const absLat = Math.abs(x - centerX(zz));
      if (absLat < 7) continue;
      if (Math.abs(zz - riverZ(x)) < 17) continue;
      if (Math.abs(x - world.bridgeX) < 13 && Math.abs(zz - BRIDGE_Z) < 16) continue;
      let nearPad = false;
      for (const p of world.pavilions) {
        if (Math.hypot(x - p.x, zz - p.z) < 17) nearPad = true;
      }
      if (nearPad) continue;
      const mountain = absLat > 55;
      const chance = mountain ? 0.44 : absLat > 20 ? 0.3 : 0.14;
      if (rng() > chance) continue;
      const y = world.heightAt(x, zz);
      if (y < WATER_LEVEL + 1.2) continue;
      treeSpots.push({
        x,
        z: zz,
        y,
        s: range(rng, mountain ? 0.8 : 0.65, mountain ? 1.5 : 1.15),
        rot: range(rng, 0, Math.PI * 2),
      });
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const crownParts: THREE.BufferGeometry[] = [];
  for (const [r, h, y] of [
    [1.35, 3.2, 2.5],
    [1.02, 2.6, 4.0],
    [0.66, 2.0, 5.4],
  ]) {
    const cone = new THREE.ConeGeometry(r, h, 7);
    cone.translate(0, y, 0);
    crownParts.push(cone);
  }
  const crownGeo = mergeGeometries(crownParts)!;

  const trunkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const crownMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length);
  const treeColor = new THREE.Color();
  const trunkColor = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  treeSpots.forEach((t, i) => {
    pos.set(t.x, t.y - 0.1, t.z);
    euler.set(0, t.rot, 0);
    q.setFromEuler(euler);
    scale.setScalar(t.s);
    matrix.compose(pos, q, scale);
    trunks.setMatrixAt(i, matrix);
    crowns.setMatrixAt(i, matrix);
    const shade = 0.55 + rng() * 0.45;
    treeColor.setRGB(0.16 * shade, 0.27 * shade, 0.23 * shade);
    crowns.setColorAt(i, treeColor);
    trunkColor.setRGB(0.15, 0.13, 0.11);
    trunks.setColorAt(i, trunkColor);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
  trunks.frustumCulled = false;
  crowns.frustumCulled = false;
  root.add(trunks, crowns);

  // ---- rocks -------------------------------------------------------------
  const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d7a6c, roughness: 1, flatShading: true });
  const rockCount = 160;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  for (let i = 0; i < rockCount; i++) {
    const z = range(rng, 20, 780);
    const x = centerX(z) + range(rng, -115, 115);
    const y = world.heightAt(x, z);
    pos.set(x, y + 0.05, z);
    euler.set(range(rng, 0, 0.5), range(rng, 0, Math.PI * 2), range(rng, 0, 0.5));
    q.setFromEuler(euler);
    scale.set(range(rng, 0.6, 1.9), range(rng, 0.5, 1.2), range(rng, 0.6, 1.9));
    matrix.compose(pos, q, scale);
    rocks.setMatrixAt(i, matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.frustumCulled = false;
  root.add(rocks);

  // ---- pavilions ---------------------------------------------------------
  const stoneGeos: THREE.BufferGeometry[] = [];
  const woodGeos: THREE.BufferGeometry[] = [];
  const roofGeos: THREE.BufferGeometry[] = [];
  const goldGeos: THREE.BufferGeometry[] = [];
  const beaconBaseY: number[] = [];

  const stoneGeo = new THREE.CylinderGeometry(4, 4.4, 0.5, 8);
  const pillarGeo = new THREE.CylinderGeometry(0.16, 0.18, 3.2, 6);
  const deckGeo = new THREE.BoxGeometry(4.8, 0.28, 4.8);
  const roofGeo = new THREE.ConeGeometry(4.9, 1.9, 4);
  const roof2Geo = new THREE.ConeGeometry(2.5, 1.25, 4);
  const finialGeo = new THREE.SphereGeometry(0.24, 8, 6);
  const spireGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.9, 5);

  for (const p of world.pavilions) {
    const y0 = p.padY;
    stoneGeos.push(bake(stoneGeo, xf(p.x, y0 + 0.25, p.z)));
    for (const [dx, dz] of [
      [-1.75, -1.75],
      [1.75, -1.75],
      [-1.75, 1.75],
      [1.75, 1.75],
    ]) {
      woodGeos.push(bake(pillarGeo, xf(p.x + dx, y0 + 2.05, p.z + dz)));
    }
    woodGeos.push(bake(deckGeo, xf(p.x, y0 + 3.8, p.z)));
    const roofM = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, y0 + 4.9, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    roofGeos.push(bake(roofGeo, roofM));
    const roof2M = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, y0 + 5.95, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    roofGeos.push(bake(roof2Geo, roof2M));
    goldGeos.push(bake(finialGeo, xf(p.x, y0 + 6.75, p.z)));
    goldGeos.push(bake(spireGeo, xf(p.x, y0 + 7.2, p.z)));
    beaconBaseY.push(y0 + 8.1);
  }

  const pavilionMat = new THREE.MeshStandardMaterial({ color: 0x8b8574, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c4750, roughness: 0.85, flatShading: true });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.6, roughness: 0.35 });

  root.add(new THREE.Mesh(mergeGeometries(stoneGeos)!, pavilionMat));
  root.add(new THREE.Mesh(mergeGeometries(woodGeos)!, woodMat));
  root.add(new THREE.Mesh(mergeGeometries(roofGeos)!, roofMat));
  root.add(new THREE.Mesh(mergeGeometries(goldGeos)!, goldMat));

  // floating pigment beacons above each pavilion
  const beaconGeo = new THREE.IcosahedronGeometry(0.34, 1);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, world.pavilions.length);
  const color = new THREE.Color();
  world.pavilions.forEach((p, i) => {
    matrix.makeTranslation(p.x, beaconBaseY[i], p.z);
    beacons.setMatrixAt(i, matrix);
    beacons.setColorAt(i, color.setHex(PIGMENTS[p.pigment].color));
  });
  beacons.instanceMatrix.needsUpdate = true;
  if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;
  beacons.frustumCulled = false;
  root.add(beacons);

  // ---- bridge (deck + ramps follow World.bridgeYAt) ----------------------
  const deckPositions: number[] = [];
  const deckIndices: number[] = [];
  const zStart = BRIDGE_Z - BRIDGE_RAMP - 6;
  const zEnd = BRIDGE_Z + BRIDGE_RAMP + 6;
  const zStep = 2;
  const rows = Math.floor((zEnd - zStart) / zStep) + 1;
  for (let i = 0; i < rows; i++) {
    const z = zStart + i * zStep;
    const y = world.bridgeYAt(world.bridgeX, z) ?? world.heightAt(world.bridgeX, z);
    deckPositions.push(world.bridgeX - 5, y, z, world.bridgeX + 5, y, z);
    if (i < rows - 1) {
      const a = i * 2;
      deckIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const bridgeDeckGeo = new THREE.BufferGeometry();
  bridgeDeckGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(deckPositions), 3));
  bridgeDeckGeo.setIndex(deckIndices);
  bridgeDeckGeo.computeVertexNormals();
  root.add(new THREE.Mesh(bridgeDeckGeo, pavilionMat));

  const bridgeGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.16, 0.9, BRIDGE_HALF_Z * 1.7);
    bridgeGeos.push(bake(rail, xf(world.bridgeX + side * 4.7, BRIDGE_DECK_Y + 0.45, BRIDGE_Z)));
  }
  root.add(new THREE.Mesh(mergeGeometries(bridgeGeos)!, pavilionMat));

  // ---- water ribbon ------------------------------------------------------
  const water = buildWaterRibbon();
  root.add(water);

  // ---- scroll ends -------------------------------------------------------
  root.add(buildScrollEnd(-14, 1));
  root.add(buildScrollEnd(814, -1));

  return { root, beacons, beaconBaseY };
}

function buildWaterRibbon(): THREE.Mesh {
  const x0 = -WORLD_HALF_WIDTH;
  const x1 = WORLD_HALF_WIDTH;
  const step = 4;
  const cols = Math.floor((x1 - x0) / step) + 1;
  const positions = new Float32Array(cols * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i < cols; i++) {
    const x = x0 + i * step;
    const z = riverZ(x);
    positions[i * 6] = x;
    positions[i * 6 + 1] = WATER_LEVEL;
    positions[i * 6 + 2] = z - 9.5;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = WATER_LEVEL;
    positions[i * 6 + 5] = z + 9.5;
    if (i < cols - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6f8f9c,
    transparent: true,
    opacity: 0.78,
    roughness: 0.25,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  return mesh;
}

function buildScrollEnd(z: number, facing: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const silkMat = new THREE.MeshStandardMaterial({
    color: 0xd8cfb6,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF_WIDTH * 2, 64), silkMat);
  panel.position.set(0, 20, z);
  if (facing === -1) panel.rotation.y = Math.PI;
  group.add(panel);

  const goldMat = new THREE.MeshStandardMaterial({ color: 0xb18f43, metalness: 0.55, roughness: 0.4 });
  for (const x of [-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 64, 10), goldMat);
    roller.position.set(x, 20, z);
    group.add(roller);
  }
  return group;
}
