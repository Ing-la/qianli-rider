import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, fbm2 } from '../core/MathUtils';
import { mulberry32, range, type Rng } from '../core/PRNG';
import { PIGMENTS } from '../game/Pigments';
import { WORLD_HALF, World } from './World';

export interface PropsResult {
  root: THREE.Group;
  beacons: THREE.InstancedMesh;
  beaconBaseY: number[];
  windTime: { value: number };
  updateNearGrass: (x: number, z: number) => void;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const geo = mergeGeometries(normalized);
  if (!geo) throw new Error('Props: incompatible geometries');
  return geo;
}

function paint(geo: THREE.BufferGeometry, hex: number, variation = 0.06, seed = 1): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(hex);
  const rng = mulberry32(seed + pos.count * 11);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (rng() * 2 - 1) * variation;
    colors[i * 3] = base.r * k;
    colors[i * 3 + 1] = base.g * k;
    colors[i * 3 + 2] = base.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function addWind(material: THREE.MeshStandardMaterial, windTime: { value: number }, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 instanceOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 instanceOrigin = vec4(0.0);
        #endif
        float windPhase = uWindTime * 1.15 + instanceOrigin.x * 0.17 + instanceOrigin.z * 0.11;
        float windSway = sin(windPhase) * ${strength.toFixed(3)} * max(position.y, 0.0);
        transformed.x += windSway;
        transformed.z += windSway * 0.65;`,
      );
  };
  material.customProgramCacheKey = () => `wind-${strength.toFixed(3)}`;
}

function pineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.26, 2.2, 6);
  trunk.translate(0, 1.1, 0);
  parts.push(paint(trunk, 0x4b3b2a, 0.05, 1));
  const layers = [0x223a32, 0x2b4a3c, 0x335845, 0x3b604a, 0x416a52];
  for (let i = 0; i < 5; i++) {
    const cone = new THREE.ConeGeometry(1.7 - i * 0.22, 1.8 - i * 0.06, 8, 1);
    cone.translate((i % 2 ? 0.1 : -0.1) * (1 - i * 0.12), 1.5 + i * 0.92, (i % 3 ? -0.08 : 0.08));
    parts.push(paint(cone, layers[i], 0.05, i + 2));
  }
  return merge(parts);
}

function broadleafGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.32, 2.8, 7);
  trunk.translate(0, 1.4, 0);
  parts.push(paint(trunk, 0x4c3c2c, 0.05, 1));
  const crowns = [
    [0, 3.5, 0, 1.25, 0x2f4a3a],
    [-0.8, 3.7, 0.25, 0.95, 0x3a5742],
    [0.75, 3.8, -0.2, 1.0, 0x46644a],
    [0.1, 4.4, 0.55, 0.9, 0x55705a],
    [-0.35, 4.5, -0.5, 0.85, 0x4a6851],
  ];
  for (const [x, y, z, r, c] of crowns) {
    const ico = new THREE.IcosahedronGeometry(r as number, 0);
    ico.scale(1, 0.82, 1);
    ico.translate(x as number, y as number, z as number);
    parts.push(paint(ico, c as number, 0.06, r as number * 10));
  }
  return merge(parts);
}

function bambooGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rng = mulberry32(31);
  for (let s = 0; s < 6; s++) {
    const a = (s / 6) * Math.PI * 2 + rng() * 0.6;
    const rad = 0.18 + rng() * 0.35;
    const h = 3.4 + rng() * 2.6;
    const base = new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    const stalk = new THREE.CylinderGeometry(0.035, 0.055, h, 5);
    const dir = new THREE.Vector3(Math.cos(a) * 0.08, 1, Math.sin(a) * 0.08).normalize();
    stalk.applyMatrix4(
      new THREE.Matrix4().compose(
        base.clone().addScaledVector(new THREE.Vector3(0, 1, 0), h / 2),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    parts.push(paint(stalk, 0x8a8a45, 0.08, s + 3));
    for (let l = 0; l < 3; l++) {
      const leaf = new THREE.PlaneGeometry(0.7, 0.16);
      const la = rng() * Math.PI * 2;
      leaf.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(base.x + Math.cos(a) * 0.1, h * (0.7 + l * 0.09), base.z + Math.sin(a) * 0.1),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.5, la, rng() * 0.6)),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      parts.push(paint(leaf, l % 2 ? 0x5d7a46 : 0x47653c, 0.06, s * 3 + l));
    }
  }
  return merge(parts);
}

function shrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rng = mulberry32(57);
  for (let i = 0; i < 4; i++) {
    const ico = new THREE.IcosahedronGeometry(0.45 + rng() * 0.3, 0);
    ico.scale(1, 0.7, 1);
    ico.translate((rng() - 0.5) * 0.7, 0.35 + rng() * 0.25, (rng() - 0.5) * 0.7);
    parts.push(paint(ico, 0x3d5a44, 0.07, i + 7));
  }
  return merge(parts);
}

function grassTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(83);
  const palette = ['#364a35', '#475e3f', '#59704a', '#6b8154', '#7d8f5f', '#948a58', '#a89a66'];
  for (let i = 0; i < 46; i++) {
    const x0 = 6 + rng() * (size - 12);
    const lean = (rng() - 0.5) * 44;
    const h = 44 + rng() * 58;
    ctx.strokeStyle = palette[Math.floor(rng() * palette.length)];
    ctx.globalAlpha = 0.7 + rng() * 0.3;
    ctx.lineWidth = 1.0 + rng() * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, size);
    ctx.quadraticCurveTo(x0 + lean * 0.3, size - h * 0.55, x0 + lean, size - h);
    ctx.stroke();
  }
  const blooms = ['#f2ecda', '#e4c873', '#7f9dc0', '#c68b58'];
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = blooms[Math.floor(rng() * blooms.length)];
    ctx.globalAlpha = 0.8;
    const x = 14 + rng() * (size - 28);
    const y = 12 + rng() * (size * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, 1.1 + rng() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function grassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const a of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    const plane = new THREE.PlaneGeometry(1, 0.7);
    plane.translate(0, 0.35, 0);
    plane.rotateY(a);
    parts.push(plane);
  }
  return merge(parts);
}

function rockGeometry(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const stone = new THREE.Color(0x6f6d61);
  const moss = new THREE.Color(0x566b4a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * (0.8 + rng() * 0.4);
    const y = pos.getY(i) * (0.8 + rng() * 0.5);
    const z = pos.getZ(i) * (0.8 + rng() * 0.4);
    pos.setXYZ(i, x, y, z);
    const t = clamp((y + 1) / 2, 0, 1);
    tmp.copy(stone).lerp(moss, t * 0.55);
    const k = 0.9 + rng() * 0.2;
    colors[i * 3] = tmp.r * k;
    colors[i * 3 + 1] = tmp.g * k;
    colors[i * 3 + 2] = tmp.b * k;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function buildInstances(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  spots: { x: number; z: number; y: number; s: number; rot: number; tint?: THREE.Color }[],
  root: THREE.Group,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, spots.length));
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  spots.forEach((t, i) => {
    pos.set(t.x, t.y, t.z);
    euler.set(0, t.rot, 0);
    quat.setFromEuler(euler);
    scale.setScalar(t.s);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(i, matrix);
    if (t.tint) mesh.setColorAt(i, t.tint);
  });
  mesh.count = spots.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  return mesh;
}

export function buildProps(world: World, detail = 1): PropsResult {
  const root = new THREE.Group();
  root.name = 'props';
  const rng = mulberry32(world.seed ^ 0x9e3779b9);
  const windTime = { value: 0 };

  // ---- placement helpers -------------------------------------------------
  const nearPavilion = (x: number, z: number, r: number): boolean =>
    world.pavilions.some((p) => Math.hypot(x - p.x, z - p.z) < r);

  const pickGround = (minR: number, maxR: number, maxSlope: number): { x: number; z: number; y: number; slope: number } | null => {
    for (let tries = 0; tries < 8; tries++) {
      const x = range(rng, -WORLD_HALF + 40, WORLD_HALF - 40);
      const z = range(rng, -WORLD_HALF + 40, WORLD_HALF - 40);
      const r = Math.hypot(x, z);
      if (r < minR || r > maxR) continue;
      const grad = world.gradient(x, z);
      const slope = Math.hypot(grad.x, grad.z);
      if (slope > maxSlope) continue;
      return { x, z, y: world.heightAt(x, z), slope };
    }
    return null;
  };

  // ---- trees -------------------------------------------------------------
  type TreeKind = 0 | 1 | 2 | 3;
  const treeSpots: Record<TreeKind, { x: number; z: number; y: number; s: number; rot: number; tint: THREE.Color }[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
  };
  const treeTarget = Math.round(1350 * detail);
  for (let attempt = 0; attempt < treeTarget * 6; attempt++) {
    let total = 0;
    for (const k of [0, 1, 2, 3] as TreeKind[]) total += treeSpots[k].length;
    if (total >= treeTarget) break;
    const spot = pickGround(20, 515, 0.5);
    if (!spot) continue;
    if (nearPavilion(spot.x, spot.z, 15)) continue;
    const density = fbm2(spot.x * 0.014 + 4.2, spot.z * 0.014 + 8.1, 3, world.seed + 17);
    if (rng() > 0.12 + density * 0.78) continue;
    const p = rng();
    let kind: TreeKind;
    if (spot.y > 24 && p < 0.5) kind = 0;
    else if (spot.y < 11 && p < 0.45) kind = 1;
    else if (p < 0.16) kind = 2;
    else if (p < 0.3) kind = 3;
    else kind = p < 0.62 ? 0 : 1;
    const tint = new THREE.Color();
    if (kind === 0) tint.setRGB(0.82 + rng() * 0.25, 0.9 + rng() * 0.2, 0.86 + rng() * 0.2);
    else if (kind === 1) tint.setRGB(0.9 + rng() * 0.25, 0.9 + rng() * 0.2, 0.72 + rng() * 0.25);
    else if (kind === 2) tint.setRGB(1.0, 0.96 + rng() * 0.1, 0.7 + rng() * 0.2);
    else tint.setRGB(0.8 + rng() * 0.2, 0.9 + rng() * 0.15, 0.8 + rng() * 0.2);
    treeSpots[kind].push({
      x: spot.x,
      z: spot.z,
      y: spot.y - 0.08,
      s: range(rng, kind === 3 ? 0.55 : 0.7, kind === 3 ? 1.0 : 1.45),
      rot: range(rng, 0, Math.PI * 2),
      tint,
    });
  }

  const treeMat = (strength: number, doubleSide = false): THREE.MeshStandardMaterial => {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.96,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    addWind(mat, windTime, strength);
    return mat;
  };
  buildInstances(pineGeometry(), treeMat(0.008), treeSpots[0], root);
  buildInstances(broadleafGeometry(), treeMat(0.007), treeSpots[1], root);
  buildInstances(bambooGeometry(), treeMat(0.014, true), treeSpots[2], root);
  buildInstances(shrubGeometry(), treeMat(0.012), treeSpots[3], root);

  // ---- grass tufts -------------------------------------------------------
  const grassTarget = Math.round(4500 * detail);
  const grassSpots: { x: number; z: number; y: number; s: number; rot: number; tint?: THREE.Color }[] = [];
  for (let attempt = 0; attempt < grassTarget * 2 && grassSpots.length < grassTarget; attempt++) {
    const spot = pickGround(6, 510, 0.45);
    if (!spot) continue;
    if (nearPavilion(spot.x, spot.z, 9)) continue;
    const density = fbm2(spot.x * 0.04 + 2.2, spot.z * 0.04 + 5.8, 3, world.seed + 29);
    if (rng() > 0.3 + density * 0.6) continue;
    const tint = new THREE.Color().setRGB(0.75 + rng() * 0.25, 0.85 + rng() * 0.2, 0.7 + rng() * 0.2);
    grassSpots.push({
      x: spot.x,
      z: spot.z,
      y: spot.y - 0.02,
      s: range(rng, 0.55, 1.0),
      rot: range(rng, 0, Math.PI * 2),
      tint,
    });
  }
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassTexture(),
    alphaTest: 0.3,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  addWind(grassMat, windTime, 0.06);
  const grassGeo = grassGeometry();
  buildInstances(grassGeo, grassMat, grassSpots, root);

  // dense grass carpet that follows the rider, anchored to a 10 m world grid
  const nearCount = Math.round(6000 * detail);
  const nearGrass = new THREE.InstancedMesh(grassGeo, grassMat, nearCount);
  const nearData: { ox: number; oz: number; jx: number; jz: number; s: number; rot: number }[] = [];
  const nearColor = new THREE.Color();
  for (let i = 0; i < nearCount; i++) {
    nearData.push({
      ox: Math.floor(range(rng, -3, 3.999)),
      oz: Math.floor(range(rng, -3, 3.999)),
      jx: range(rng, 0, 10),
      jz: range(rng, 0, 10),
      s: range(rng, 0.7, 1.1),
      rot: range(rng, 0, Math.PI * 2),
    });
    nearColor.setRGB(0.75 + rng() * 0.25, 0.85 + rng() * 0.2, 0.7 + rng() * 0.2);
    nearGrass.setColorAt(i, nearColor);
  }
  if (nearGrass.instanceColor) nearGrass.instanceColor.needsUpdate = true;
  nearGrass.frustumCulled = false;
  nearGrass.count = nearCount;
  root.add(nearGrass);

  const nearMatrix = new THREE.Matrix4();
  const nearQuat = new THREE.Quaternion();
  const nearEuler = new THREE.Euler();
  const nearPos = new THREE.Vector3();
  const nearScale = new THREE.Vector3();
  let lastCellX = Number.NaN;
  let lastCellZ = Number.NaN;
  const updateNearGrass = (px: number, pz: number): void => {
    const cell = 10;
    const cx = Math.floor(px / cell);
    const cz = Math.floor(pz / cell);
    if (cx === lastCellX && cz === lastCellZ) return;
    lastCellX = cx;
    lastCellZ = cz;
    nearData.forEach((t, i) => {
      const x = (cx + t.ox) * cell + t.jx;
      const z = (cz + t.oz) * cell + t.jz;
      nearPos.set(x, world.heightAt(x, z) - 0.03, z);
      nearEuler.set(0, t.rot, 0);
      nearQuat.setFromEuler(nearEuler);
      nearScale.setScalar(t.s);
      nearMatrix.compose(nearPos, nearQuat, nearScale);
      nearGrass.setMatrixAt(i, nearMatrix);
    });
    nearGrass.instanceMatrix.needsUpdate = true;
  };
  updateNearGrass(0, 0);

  // ---- wildflowers -------------------------------------------------------
  const flowerTarget = Math.round(1200 * detail);
  const flowerSpots: { x: number; z: number; y: number; s: number; rot: number; tint?: THREE.Color }[] = [];
  const flowerPalette = [0xefe8d2, 0xd9b25a, 0x6f8fbf, 0xb07a4a].map((h) => new THREE.Color(h));
  for (let attempt = 0; attempt < flowerTarget * 3 && flowerSpots.length < flowerTarget; attempt++) {
    const spot = pickGround(6, 510, 0.35);
    if (!spot) continue;
    if (nearPavilion(spot.x, spot.z, 8)) continue;
    flowerSpots.push({
      x: spot.x,
      z: spot.z,
      y: spot.y + 0.08,
      s: range(rng, 0.5, 1.25),
      rot: range(rng, 0, Math.PI * 2),
      tint: flowerPalette[Math.floor(rng() * flowerPalette.length)].clone().multiplyScalar(0.9 + rng() * 0.2),
    });
  }
  const flowerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  buildInstances(new THREE.IcosahedronGeometry(0.09, 0), flowerMat, flowerSpots, root);

  // ---- rocks -------------------------------------------------------------
  const rockTarget = Math.round(620 * detail);
  const rockSpots: Record<number, { x: number; z: number; y: number; s: number; rot: number }[]> = { 0: [], 1: [] };
  for (let cluster = 0; cluster < 55; cluster++) {
    if (rockSpots[0].length + rockSpots[1].length >= rockTarget) break;
    const spot = pickGround(18, 510, 0.9);
    if (!spot) continue;
    if (nearPavilion(spot.x, spot.z, 12)) continue;
    const variant = rng() < 0.5 ? 0 : 1;
    const count = 4 + Math.floor(rng() * 11);
    for (let i = 0; i < count; i++) {
      const x = spot.x + range(rng, -8, 8);
      const z = spot.z + range(rng, -8, 8);
      if (Math.hypot(x, z) > 515 || Math.hypot(x, z) < 8) continue;
      rockSpots[variant].push({
        x,
        z,
        y: world.heightAt(x, z),
        s: range(rng, 0.4, 2.2),
        rot: range(rng, 0, Math.PI * 2),
      });
    }
  }
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  buildInstances(rockGeometry(101), rockMat, rockSpots[0], root);
  buildInstances(rockGeometry(202), rockMat, rockSpots[1], root);

  // ---- pavilions on the five hilltops ------------------------------------
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
  const xf = (x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, y, z);
  const bake = (geo: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry => {
    const g = geo.clone();
    g.applyMatrix4(m);
    return g;
  };

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
    roofGeos.push(
      bake(
        roofGeo,
        new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, y0 + 4.9, p.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
          new THREE.Vector3(1, 1, 1),
        ),
      ),
    );
    roofGeos.push(
      bake(
        roof2Geo,
        new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, y0 + 5.95, p.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
          new THREE.Vector3(1, 1, 1),
        ),
      ),
    );
    goldGeos.push(bake(finialGeo, xf(p.x, y0 + 6.75, p.z)));
    goldGeos.push(bake(spireGeo, xf(p.x, y0 + 7.2, p.z)));
    beaconBaseY.push(y0 + 8.1);
  }

  const pavilionMat = new THREE.MeshStandardMaterial({ color: 0x8b8574, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c4750, roughness: 0.85, flatShading: true });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.6, roughness: 0.35 });
  root.add(new THREE.Mesh(merge(stoneGeos), pavilionMat));
  root.add(new THREE.Mesh(merge(woodGeos), woodMat));
  root.add(new THREE.Mesh(merge(roofGeos), roofMat));
  root.add(new THREE.Mesh(merge(goldGeos), goldMat));

  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const beacons = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.34, 1), beaconMat, world.pavilions.length);
  const matrix = new THREE.Matrix4();
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

  // ---- summit pennants ---------------------------------------------------
  const summitHills = world.hills.slice(5);
  const poleGeo = new THREE.CylinderGeometry(0.035, 0.05, 2.3, 6);
  poleGeo.translate(0, 1.15, 0);
  const poles = new THREE.InstancedMesh(
    poleGeo,
    new THREE.MeshStandardMaterial({ color: 0x5c4a30, roughness: 0.9 }),
    summitHills.length,
  );
  const flagGeo = new THREE.PlaneGeometry(0.9, 0.42);
  flagGeo.translate(0.48, 0, 0);
  const flags = new THREE.InstancedMesh(
    flagGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    summitHills.length,
  );
  const flagColors = [0xb08c46, 0x4f8a63, 0x3f6ea6];
  const flagColor = new THREE.Color();
  summitHills.forEach((hill, i) => {
    const y = world.heightAt(hill.x, hill.z);
    const rot = rng() * Math.PI * 2;
    matrix.compose(
      new THREE.Vector3(hill.x, y, hill.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    poles.setMatrixAt(i, matrix);
    matrix.compose(
      new THREE.Vector3(hill.x, y + 2.05, hill.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot + 0.6, 0.05)),
      new THREE.Vector3(1, 1, 1),
    );
    flags.setMatrixAt(i, matrix);
    flags.setColorAt(i, flagColor.setHex(flagColors[i % flagColors.length]));
  });
  poles.instanceMatrix.needsUpdate = true;
  flags.instanceMatrix.needsUpdate = true;
  if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  poles.frustumCulled = false;
  flags.frustumCulled = false;
  root.add(poles, flags);

  return { root, beacons, beaconBaseY, windTime, updateNearGrass };
}
