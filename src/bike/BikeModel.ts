import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp } from '../core/MathUtils';
import { mulberry32 } from '../core/PRNG';
import {
  bambooTexture,
  brassTexture,
  fabricTexture,
  leatherTexture,
  paperTexture,
  radialGlowTexture,
  strawTexture,
  wickerTexture,
} from './ProceduralTextures';

const UP = new THREE.Vector3(0, 1, 0);
const WHEEL_R = 0.35;
const CRANK_R = 0.155;
const GEAR = 3.3;

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts);
  if (!geo) throw new Error('BikeModel: incompatible geometries');
  return geo;
}

function colorize(
  geo: THREE.BufferGeometry,
  hex: number,
  variation = 0.05,
  seed = 1,
  override?: { test: (x: number, y: number, z: number) => boolean; color: number },
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(hex);
  const alt = override ? new THREE.Color(override.color) : null;
  const rng = mulberry32(seed + pos.count * 17);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const c = alt && override!.test(x, y, z) ? alt : base;
    const k = 1 + (rng() * 2 - 1) * variation;
    colors[i * 3] = c.r * k;
    colors[i * 3 + 1] = c.g * k;
    colors[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function displaceRadial(geo: THREE.BufferGeometry, amount: number, freqA = 9, freqY = 6, seed = 0): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const ang = Math.atan2(z, x);
    const f = 1 + amount * Math.sin(ang * freqA + y * freqY + seed);
    pos.setXYZ(i, x * f, y, z * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function cylinderGeo(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, radial = 10): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, len, radial, 2);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  geo.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

function bambooTube(a: THREE.Vector3, b: THREE.Vector3, radius: number): { geo: THREE.BufferGeometry; curve: THREE.CatmullRomCurve3 } {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const bow = new THREE.Vector3(-dir.z, 0.5, dir.x).normalize().multiplyScalar(0.012);
  const curve = new THREE.CatmullRomCurve3([a, mid.clone().add(bow), b]);
  return { geo: new THREE.TubeGeometry(curve, 12, radius, 10, false), curve };
}

function ringAtPoint(point: THREE.Vector3, dir: THREE.Vector3, radius: number, tube: number): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(radius, tube, 5, 12);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  geo.applyMatrix4(new THREE.Matrix4().compose(point, q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

function featherGeometry(len: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(len * 0.45, width, len, width * 0.14);
  shape.quadraticCurveTo(len * 0.55, -width * 0.55, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 12);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const root = new THREE.Color(0.95, 0.96, 0.91);
  const tip = new THREE.Color(0.13, 0.2, 0.2);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getX(i) / len, 0, 1);
    tmp.copy(root).lerp(tip, t * t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function buildWingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const len = 1.85 - k * 0.13;
    const width = 0.27 - k * 0.022;
    const feather = featherGeometry(len, width);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, -0.045 * k),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.1 * k, 0.26 - k * 0.15)),
      new THREE.Vector3(1, 1, 1),
    );
    feather.applyMatrix4(matrix);
    parts.push(feather);
  }
  return merge(parts);
}

function helixGeo(center: THREE.Vector3, radius: number, height: number, turns: number, tube: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 2 * turns;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, t * height, Math.sin(a) * radius).add(center));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, tube, 6, false);
}

class Bone {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material) {
    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);
  }
  place(a: THREE.Vector3, b: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = Math.max(0.001, dir.length());
    this.group.position.copy(a);
    this.group.quaternion.setFromUnitVectors(UP, dir.normalize());
    this.mesh.scale.y = len;
  }
}

function limbGeometry(
  rStart: number,
  rEnd: number,
  hex: number,
  cuffHex?: number,
  fold = 0.008,
  radial = 12,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rEnd, rStart, 1, radial, 5);
  geo.translate(0, 0.5, 0);
  displaceRadial(geo, fold, 8, 5, 2);
  return colorize(geo, hex, 0.035, 7, cuffHex ? { test: (_x, y) => y > 0.84, color: cuffHex } : undefined);
}

interface ClothSet {
  mesh: THREE.Mesh;
  base: Float32Array;
  length: number;
  amp: number;
  trail: number;
  phase: number;
}

function buildClothGrid(
  cols: number,
  rows: number,
  width: number,
  length: number,
  hex: number,
  edgeHex: number,
  flare = 0.05,
): ClothSet {
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  const colors = new Float32Array((cols + 1) * (rows + 1) * 3);
  const base = new THREE.Color(hex);
  const edge = new THREE.Color(edgeHex);
  let p = 0;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const w = width * (1 + flare * t);
      positions[p * 3] = (u - 0.5) * w;
      positions[p * 3 + 1] = -t * length + (1 - t) * 0.018 * Math.sin(u * Math.PI);
      positions[p * 3 + 2] =
        -0.03 -
        0.12 * t * t +
        0.02 * Math.sin(u * Math.PI * 7) * (0.3 + 0.7 * t) +
        0.01 * Math.cos(u * Math.PI * 3) * (0.5 + 0.5 * t);
      uvs[p * 2] = u;
      uvs[p * 2 + 1] = t;
      const isEdge = c === 0 || c === cols || r === rows;
      const col = isEdge ? edge : base;
      const shade = 0.94 + 0.06 * Math.sin(u * 9 + r * 0.7);
      colors[p * 3] = col.r * shade;
      colors[p * 3 + 1] = col.g * shade;
      colors[p * 3 + 2] = col.b * shade;
      p++;
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = a + cols + 1;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo);
  return { mesh, base: positions.slice(), length, amp: 0.02, trail: 0.1, phase: 0 };
}

export class BikeModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();

  private mats!: Record<string, THREE.MeshStandardMaterial>;
  private frontWheel!: THREE.Group;
  private rearWheel!: THREE.Group;
  private steering!: THREE.Group;
  private crank!: THREE.Group;
  private pedalL!: THREE.Group;
  private pedalR!: THREE.Group;
  private basketGlow!: THREE.Mesh;
  private lanternPivot!: THREE.Group;
  private wingGroup!: THREE.Group;
  private leftWing!: THREE.Mesh;
  private rightWing!: THREE.Mesh;

  private riderRoot!: THREE.Group;
  private torso!: THREE.Group;
  private head!: THREE.Group;
  private cloak!: ClothSet;
  private mantle!: ClothSet;
  private scarf!: ClothSet;
  private sash!: ClothSet;
  private skirtMesh!: THREE.Mesh;
  private skirtBase!: Float32Array;
  private skirtLength = 0.55;

  private armUpperL!: Bone;
  private armLowerL!: Bone;
  private armUpperR!: Bone;
  private armLowerR!: Bone;
  private legUpperL!: Bone;
  private legLowerL!: Bone;
  private legUpperR!: Bone;
  private legLowerR!: Bone;
  private joints!: THREE.InstancedMesh;
  private hands!: THREE.InstancedMesh;
  private boots!: THREE.InstancedMesh;

  private crankCenter = new THREE.Vector3(0, 0.42, 0.02);
  private hipL = new THREE.Vector3(-0.095, 1.03, -0.13);
  private hipR = new THREE.Vector3(0.095, 1.03, -0.13);
  private shoulderL = new THREE.Vector3(-0.16, 0.36, 0.02);
  private shoulderR = new THREE.Vector3(0.16, 0.36, 0.02);
  private gripLocalL = new THREE.Vector3(-0.3, 0.24, 0.1);
  private gripLocalR = new THREE.Vector3(0.3, 0.24, 0.1);
  private steerPivot = new THREE.Vector3(0, 0.86, 0.36);

  private wheelSpin = 0;
  private crankAngle = 0;
  private time = 0;
  private steerSmooth = 0;

  constructor() {
    this.root.name = 'bike';
    this.root.add(this.body);
    this.buildMaterials();
    this.buildBike();
    this.buildRider();
    this.buildWings();
    this.update(0, 0, 0);
  }

  private buildMaterials(): void {
    const fabricTex = fabricTexture();
    const bambooTex = bambooTexture();
    const brassTex = brassTexture();
    const leatherTex = leatherTexture();
    const wickerTex = wickerTexture();
    const paperTex = paperTexture();
    const strawTex = strawTexture();

    const fabric = new THREE.MeshStandardMaterial({
      map: fabricTex,
      bumpMap: fabricTex,
      bumpScale: 0.0016,
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const wood = new THREE.MeshStandardMaterial({
      map: bambooTex,
      bumpMap: bambooTex,
      bumpScale: 0.0035,
      vertexColors: true,
      roughness: 0.56,
      metalness: 0.03,
    });
    const metal = new THREE.MeshStandardMaterial({
      map: brassTex,
      bumpMap: brassTex,
      bumpScale: 0.0015,
      vertexColors: true,
      metalness: 0.72,
      roughness: 0.34,
    });
    const leather = new THREE.MeshStandardMaterial({
      map: leatherTex,
      bumpMap: leatherTex,
      bumpScale: 0.0025,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.02,
    });
    const wheel = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.16,
    });
    const wicker = new THREE.MeshStandardMaterial({
      map: wickerTex,
      bumpMap: wickerTex,
      bumpScale: 0.0025,
      vertexColors: true,
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    const paper = new THREE.MeshStandardMaterial({
      map: paperTex,
      bumpMap: paperTex,
      bumpScale: 0.001,
      vertexColors: true,
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    const straw = new THREE.MeshStandardMaterial({
      map: strawTex,
      bumpMap: strawTex,
      bumpScale: 0.0022,
      vertexColors: true,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd3ae88, roughness: 0.62 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 0.55 });
    const jade = new THREE.MeshStandardMaterial({ color: 0x6f9a7c, roughness: 0.3, metalness: 0.08 });
    const joints = new THREE.MeshStandardMaterial({
      map: fabricTex,
      bumpMap: fabricTex,
      bumpScale: 0.0016,
      roughness: 0.95,
    });
    const lamp = new THREE.MeshStandardMaterial({
      map: paperTex,
      color: 0xffd6a0,
      emissive: 0xff9a42,
      emissiveIntensity: 0.45,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    this.mats = { fabric, wood, metal, leather, wheel, wicker, paper, straw, skin, hair, jade, joints, lamp };
  }

  private buildBike(): void {
    const wood: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    const leather: THREE.BufferGeometry[] = [];
    const paper: THREE.BufferGeometry[] = [];

    const rearHub = new THREE.Vector3(0, 0.36, -0.55);
    const seatTop = new THREE.Vector3(0, 0.96, -0.18);
    const headTop = new THREE.Vector3(0, 0.92, 0.36);
    const crank = new THREE.Vector3(0, 0.42, 0.02);

    const addTube = (a: THREE.Vector3, b: THREE.Vector3, radius: number, nodeCount = 2): void => {
      const { geo, curve } = bambooTube(a, b, radius);
      wood.push(colorize(geo, 0xa89a58, 0.07, wood.length + 3));
      for (let i = 1; i <= nodeCount; i++) {
        const t = i / (nodeCount + 1);
        const p = curve.getPoint(t);
        const tan = curve.getTangent(t);
        wood.push(colorize(ringAtPoint(p, tan, radius + 0.004, 0.006), 0x4e3f1e, 0.03, i));
        metal.push(colorize(ringAtPoint(p.clone().addScaledVector(tan, 0.012), tan, radius + 0.007, 0.009), 0x8f6d2d, 0.05, i + 8));
      }
    };

    addTube(rearHub, seatTop, 0.03, 2);
    addTube(seatTop, headTop, 0.034, 3);
    addTube(headTop, crank, 0.034, 3);
    addTube(seatTop, crank, 0.03, 2);
    addTube(new THREE.Vector3(0.035, 0.36, -0.55), new THREE.Vector3(0.035, 0.42, 0.02), 0.024, 1);
    addTube(new THREE.Vector3(-0.035, 0.36, -0.55), new THREE.Vector3(-0.035, 0.42, 0.02), 0.024, 1);
    addTube(new THREE.Vector3(0.035, 0.36, -0.55), new THREE.Vector3(0, 0.96, -0.18), 0.022, 1);
    addTube(new THREE.Vector3(-0.035, 0.36, -0.55), new THREE.Vector3(0, 0.96, -0.18), 0.022, 1);
    addTube(new THREE.Vector3(0, 0.93, 0.35), new THREE.Vector3(0, 0.99, 0.32), 0.036, 0);

    // lugs and wrappings at the main joints
    for (const joint of [rearHub, seatTop, headTop, crank]) {
      metal.push(colorize(new THREE.SphereGeometry(0.048, 12, 8), 0xb08c45, 0.06, 12));
      const lug = new THREE.SphereGeometry(0.05, 12, 8);
      lug.scale(1, 0.7, 1);
      lug.translate(joint.x, joint.y, joint.z);
      metal.push(colorize(lug, 0xc29b4d, 0.08, 21));
    }
    for (const [a, b] of [
      [rearHub, seatTop],
      [seatTop, headTop],
      [headTop, crank],
    ] as Array<[THREE.Vector3, THREE.Vector3]>) {
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const p = a.clone().addScaledVector(dir, 0.04);
      for (let i = 0; i < 3; i++) {
        leather.push(colorize(ringAtPoint(p.clone().addScaledVector(dir, i * 0.012), dir, 0.038, 0.006), 0x6b4b2d, 0.05, i));
      }
    }

    // wooden fenders
    const fender = (center: THREE.Vector3, start: number, end: number): THREE.BufferGeometry => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 20; i++) {
        const a = start + (end - start) * (i / 20);
        pts.push(new THREE.Vector3(0, Math.cos(a) * 0.43, Math.sin(a) * 0.43).add(center));
      }
      return colorize(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.018, 8, false), 0x8a7a42, 0.05, 4);
    };
    wood.push(fender(rearHub, -2.2, 0.5));
    for (const a of [-1.9, 0.2]) {
      const p = new THREE.Vector3(0, rearHub.y + Math.cos(a) * 0.43, rearHub.z + Math.sin(a) * 0.43);
      metal.push(colorize(cylinderGeo(p, rearHub, 0.005, 0.005, 5), 0xa6813a, 0.04, 60 + a));
    }

    // frame pump
    metal.push(
      colorize(
        cylinderGeo(new THREE.Vector3(0.05, 0.87, -0.06), new THREE.Vector3(0.05, 0.87, 0.1), 0.012, 0.012, 8),
        0xc2a056,
        0.04,
        70,
      ),
    );
    leather.push(
      colorize(
        cylinderGeo(new THREE.Vector3(0.05, 0.87, -0.06), new THREE.Vector3(0.05, 0.87, -0.11), 0.016, 0.016, 8),
        0x5e3d24,
        0.04,
        71,
      ),
    );

    // saddlebag on the rack
    const bag = new THREE.SphereGeometry(0.09, 12, 8);
    bag.scale(0.8, 0.8, 1.05);
    bag.translate(0.16, 0.7, -0.48);
    leather.push(colorize(bag, 0x6b4729, 0.04, 72));
    const buckle = new THREE.SphereGeometry(0.017, 8, 6);
    buckle.translate(0.16, 0.74, -0.39);
    metal.push(colorize(buckle, 0xc7a24e, 0.03, 73));

    // rear rack
    const rackY = 0.78;
    addTube(new THREE.Vector3(-0.11, rackY, -0.34), new THREE.Vector3(-0.11, rackY, -0.82), 0.015, 0);
    addTube(new THREE.Vector3(0.11, rackY, -0.34), new THREE.Vector3(0.11, rackY, -0.82), 0.015, 0);
    for (let i = 0; i < 4; i++) {
      const z = -0.4 - i * 0.12;
      const slat = new THREE.BoxGeometry(0.26, 0.018, 0.07);
      slat.translate(0, rackY, z);
      wood.push(colorize(slat, 0xa2955a, 0.05, i));
    }
    for (const side of [-1, 1]) {
      const leg = cylinderGeo(new THREE.Vector3(side * 0.11, rackY, -0.72), new THREE.Vector3(side * 0.11, 0.38, -0.58), 0.012, 0.012, 8);
      metal.push(colorize(leg, 0xa6813a, 0.05, 30 + side));
    }

    // leather saddle + springs + rails
    const seat = new THREE.SphereGeometry(0.13, 16, 10);
    seat.scale(1.02, 0.32, 1.65);
    seat.translate(0, 1.01, -0.21);
    const nose = new THREE.SphereGeometry(0.07, 12, 8);
    nose.scale(0.7, 0.32, 1.5);
    nose.translate(0, 0.995, -0.03);
    leather.push(colorize(seat, 0x6f4a2b, 0.04, 1));
    leather.push(colorize(nose, 0x6f4a2b, 0.04, 2));
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const rivet = new THREE.SphereGeometry(0.007, 6, 4);
      rivet.translate(Math.cos(a) * 0.12, 1.035, -0.21 + Math.sin(a) * 0.19);
      metal.push(colorize(rivet, 0xd0b266, 0.05, i));
    }
    metal.push(colorize(helixGeo(new THREE.Vector3(-0.07, 0.9, -0.32), 0.022, 0.075, 4, 0.005), 0xa78238, 0.04, 1));
    metal.push(colorize(helixGeo(new THREE.Vector3(0.07, 0.9, -0.32), 0.022, 0.075, 4, 0.005), 0xa78238, 0.04, 2));
    for (const side of [-1, 1]) {
      metal.push(colorize(cylinderGeo(new THREE.Vector3(side * 0.06, 0.98, -0.34), new THREE.Vector3(side * 0.05, 0.9, -0.1), 0.008, 0.008, 6), 0xa78238, 0.03, 3));
    }

    // rolled scroll behind the saddle
    const scroll = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 16);
    scroll.rotateZ(Math.PI / 2);
    scroll.translate(0, 1.02, -0.4);
    paper.push(colorize(scroll, 0xe6d4ad, 0.03, 1));
    for (const side of [-1, 1]) {
      const cap = new THREE.CylinderGeometry(0.055, 0.055, 0.035, 14);
      cap.rotateZ(Math.PI / 2);
      cap.translate(side * 0.26, 1.02, -0.4);
      metal.push(colorize(cap, 0xc7a14a, 0.05, 2));
    }
    for (const x of [-0.12, 0.12]) {
      const strap = new THREE.TorusGeometry(0.068, 0.008, 5, 16);
      strap.rotateY(Math.PI / 2);
      strap.translate(x, 1.02, -0.4);
      leather.push(colorize(strap, 0x5e3f26, 0.03, 4));
    }

    // chain
    const chainPts = [
      new THREE.Vector3(0.085, 0.42 + 0.08, 0.02),
      new THREE.Vector3(0.085, 0.36, -0.3),
      new THREE.Vector3(0.085, 0.33, -0.55),
      new THREE.Vector3(0.085, 0.36, -0.42),
      new THREE.Vector3(0.085, 0.42 - 0.08, 0.02),
    ];
    const chain = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts, true), 40, 0.006, 5, true);
    metal.push(colorize(chain, 0x6e654f, 0.03, 6));

    this.body.add(new THREE.Mesh(merge(wood), this.mats.wood));
    this.body.add(new THREE.Mesh(merge(metal), this.mats.metal));
    this.body.add(new THREE.Mesh(merge(leather), this.mats.leather));
    this.body.add(new THREE.Mesh(merge(paper), this.mats.paper));

    this.rearWheel = this.buildWheel();
    this.rearWheel.position.copy(rearHub);
    this.body.add(this.rearWheel);

    this.buildSteering();
    this.buildDrivetrain();
  }

  private buildWheel(): THREE.Group {
    const group = new THREE.Group();
    const body: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];

    const tire = new THREE.TorusGeometry(WHEEL_R, 0.043, 10, 44);
    tire.rotateY(Math.PI / 2);
    body.push(colorize(tire, 0x2b2724, 0.02, 1));

    const rim = new THREE.TorusGeometry(WHEEL_R - 0.038, 0.017, 8, 44);
    rim.rotateY(Math.PI / 2);
    body.push(colorize(rim, 0xb18c44, 0.04, 2));

    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const side = i % 2 === 0 ? 0.028 : -0.028;
      const outward = WHEEL_R - 0.06;
      metal.push(
        colorize(
          cylinderGeo(
            new THREE.Vector3(side, Math.cos(a) * 0.035, Math.sin(a) * 0.035),
            new THREE.Vector3(0, Math.cos(a) * outward, Math.sin(a) * outward),
            0.0035,
            0.0025,
            5,
          ),
          0xc1a255,
          0.04,
          i,
        ),
      );
    }

    const hub = new THREE.CylinderGeometry(0.035, 0.035, 0.13, 14);
    hub.rotateZ(Math.PI / 2);
    metal.push(colorize(hub, 0xc9a85b, 0.04, 3));
    for (const side of [-1, 1]) {
      const flange = new THREE.CylinderGeometry(0.055, 0.055, 0.012, 16);
      flange.rotateZ(Math.PI / 2);
      flange.translate(side * 0.05, 0, 0);
      metal.push(colorize(flange, 0xa9873f, 0.03, 4));
    }
    const axle = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8);
    axle.rotateZ(Math.PI / 2);
    metal.push(colorize(axle, 0x8c7642, 0.03, 5));

    group.add(new THREE.Mesh(merge(body), this.mats.wheel));
    group.add(new THREE.Mesh(merge(metal), this.mats.metal));
    return group;
  }

  private buildSteering(): void {
    this.steering = new THREE.Group();
    this.steering.position.copy(this.steerPivot);
    const hp = this.steerPivot;

    const rel = (v: THREE.Vector3): THREE.Vector3 => v.clone().sub(hp);
    const wood: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    const leather: THREE.BufferGeometry[] = [];

    const frontHub = new THREE.Vector3(0, 0.36, 0.62);
    for (const side of [-0.04, 0.04]) {
      const { geo } = bambooTube(rel(new THREE.Vector3(side, 0.8, 0.38)), rel(new THREE.Vector3(side, 0.36, 0.62)), 0.024);
      wood.push(colorize(geo, 0xbaa05c, 0.06, 3));
    }
    metal.push(colorize(new THREE.SphereGeometry(0.05, 12, 8), 0xb38e46, 0.05, 5));

    const stem = bambooTube(rel(new THREE.Vector3(0, 0.9, 0.36)), rel(new THREE.Vector3(0, 1.08, 0.4)), 0.026);
    wood.push(colorize(stem.geo, 0xc1a55e, 0.05, 4));

    const barPts = [
      new THREE.Vector3(-0.31, 1.1, 0.45),
      new THREE.Vector3(-0.16, 1.08, 0.41),
      new THREE.Vector3(0, 1.07, 0.39),
      new THREE.Vector3(0.16, 1.08, 0.41),
      new THREE.Vector3(0.31, 1.1, 0.45),
    ].map(rel);
    const bar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPts), 24, 0.018, 10, false);
    wood.push(colorize(bar, 0xb99d55, 0.05, 6));

    for (const side of [-1, 1]) {
      const grip = new THREE.CylinderGeometry(0.028, 0.024, 0.13, 10);
      grip.rotateZ(Math.PI / 2);
      grip.translate(side * 0.29, 0.245, 0.09);
      leather.push(colorize(grip, 0x5e3d24, 0.04, side + 8));
      const lever = cylinderGeo(new THREE.Vector3(side * 0.22, 0.24, 0.12), new THREE.Vector3(side * 0.2, 0.19, 0.2), 0.007, 0.005, 6);
      metal.push(colorize(lever, 0xc3a052, 0.04, 9));
      const cable = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.2, 0.19, 0.2),
          new THREE.Vector3(side * 0.16, 0.0, 0.28),
          new THREE.Vector3(side * 0.06, -0.44, 0.26),
        ]),
        18,
        0.003,
        5,
        false,
      );
      metal.push(colorize(cable, 0x6e6043, 0.03, 10));
    }

    // bell
    const bell = new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    bell.translate(-0.22, 0.27, 0.11);
    metal.push(colorize(bell, 0xd4b05e, 0.04, 11));
    metal.push(colorize(cylinderGeo(new THREE.Vector3(-0.22, 0.27, 0.11), new THREE.Vector3(-0.22, 0.31, 0.11), 0.006, 0.004, 6), 0xa58137, 0.03, 12));

    // front fender
    const fenderPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = -1.2 + 2.9 * (i / 20);
      fenderPts.push(rel(new THREE.Vector3(0, 0.36 + Math.cos(a) * 0.43, 0.62 + Math.sin(a) * 0.43)));
    }
    wood.push(
      colorize(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fenderPts), 30, 0.018, 8, false), 0x8a7a42, 0.05, 7),
    );
    const hubLocal = rel(frontHub);
    for (const a of [-1.2, 0.35]) {
      const p = hubLocal.clone().add(new THREE.Vector3(0, Math.cos(a) * 0.43, Math.sin(a) * 0.43));
      metal.push(colorize(cylinderGeo(p, hubLocal, 0.005, 0.005, 5), 0xa6813a, 0.04, 80 + a));
    }

    // basket
    const basketCenter = rel(new THREE.Vector3(0, 0.96, 0.76));
    const basket = new THREE.BoxGeometry(0.36, 0.24, 0.28);
    basket.translate(basketCenter.x, basketCenter.y, basketCenter.z);
    const wickerMat = this.mats.wicker;
    const basketMesh = new THREE.Mesh(colorize(basket, 0xc2a066, 0.05, 5), wickerMat);
    this.steering.add(basketMesh);

    const rimGeo: THREE.BufferGeometry[] = [];
    for (const [x, z, len, rot] of [
      [0, -0.14, 0.36, 0],
      [0, 0.14, 0.36, 0],
      [-0.18, 0, 0.28, 1],
      [0.18, 0, 0.28, 1],
    ]) {
      const g = new THREE.CylinderGeometry(0.014, 0.014, len, 8);
      if (rot) g.rotateX(Math.PI / 2);
      else g.rotateZ(Math.PI / 2);
      g.translate(basketCenter.x + x, basketCenter.y + 0.12, basketCenter.z + z);
      rimGeo.push(colorize(g, 0xa88443, 0.04, 6));
    }
    for (let i = -3; i <= 3; i++) {
      const x = basketCenter.x + i * 0.05;
      const strip = new THREE.CylinderGeometry(0.005, 0.005, 0.24, 5);
      strip.translate(x, basketCenter.y, basketCenter.z + 0.142);
      rimGeo.push(colorize(strip, 0x9a8148, 0.05, i + 20));
    }
    for (const yOff of [-0.07, 0, 0.07]) {
      const horiz = new THREE.CylinderGeometry(0.005, 0.005, 0.36, 5);
      horiz.rotateZ(Math.PI / 2);
      horiz.translate(basketCenter.x, basketCenter.y + yOff, basketCenter.z + 0.145);
      rimGeo.push(colorize(horiz, 0x9a8148, 0.05, 30 + yOff * 100));
      for (const side of [-1, 1]) {
        const sideStrip = new THREE.CylinderGeometry(0.005, 0.005, 0.28, 5);
        sideStrip.rotateX(Math.PI / 2);
        sideStrip.translate(basketCenter.x + side * 0.182, basketCenter.y + yOff, basketCenter.z);
        rimGeo.push(colorize(sideStrip, 0x9a8148, 0.05, 40 + side * 3));
      }
    }
    for (const side of [-1, 1]) {
      leather.push(
        colorize(
          cylinderGeo(
            new THREE.Vector3(side * 0.12, basketCenter.y + 0.1, basketCenter.z - 0.11),
            new THREE.Vector3(side * 0.1, 0.3, 0.12),
            0.008,
            0.008,
            5,
          ),
          0x5e3d24,
          0.04,
          50 + side,
        ),
      );
    }
    this.steering.add(new THREE.Mesh(merge(rimGeo), this.mats.wood));

    const basketGlow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.13, 1),
      new THREE.MeshBasicMaterial({ color: 0x3f6ea6, transparent: true, opacity: 0.9 }),
    );
    basketGlow.position.copy(basketCenter).add(new THREE.Vector3(0, 0.04, 0));
    basketGlow.scale.setScalar(0.001);
    this.steering.add(basketGlow);
    this.basketGlow = basketGlow;

    this.steering.add(new THREE.Mesh(merge(wood), this.mats.wood));
    this.steering.add(new THREE.Mesh(merge(metal), this.mats.metal));
    this.steering.add(new THREE.Mesh(merge(leather), this.mats.leather));

    this.frontWheel = this.buildWheel();
    this.frontWheel.position.copy(rel(frontHub));
    this.steering.add(this.frontWheel);

    this.buildLantern();
    this.body.add(this.steering);
  }

  private buildLantern(): void {
    this.lanternPivot = new THREE.Group();
    this.lanternPivot.position.set(0.3, 0.2, 0.12);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.12, 5),
      new THREE.MeshStandardMaterial({ color: 0x3c3328, roughness: 0.9 }),
    );
    cord.position.y = -0.06;
    this.lanternPivot.add(cord);

    const profile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.055, -0.015),
      new THREE.Vector2(0.075, -0.06),
      new THREE.Vector2(0.07, -0.11),
      new THREE.Vector2(0.05, -0.15),
      new THREE.Vector2(0.0, -0.16),
    ];
    const shade = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), this.mats.lamp);
    shade.position.y = -0.12;
    this.lanternPivot.add(shade);

    for (const y of [-0.105, -0.275]) {
      const capGeo = colorize(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 12), 0xc9a75a, 0.04, 3);
      const cap = new THREE.Mesh(capGeo, this.mats.metal);
      cap.position.y = y;
      this.lanternPivot.add(cap);
    }

    const haloMat = new THREE.SpriteMaterial({
      map: radialGlowTexture(),
      color: 0xffc06a,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(0.55);
    halo.position.set(0, -0.19, 0);
    this.lanternPivot.add(halo);

    this.steering.add(this.lanternPivot);
  }

  private buildDrivetrain(): void {
    this.crank = new THREE.Group();
    this.crank.position.copy(this.crankCenter);
    const metal: THREE.BufferGeometry[] = [];

    const ring = new THREE.TorusGeometry(0.095, 0.012, 6, 30);
    ring.rotateY(Math.PI / 2);
    ring.translate(0.075, 0, 0);
    metal.push(colorize(ring, 0xc5a355, 0.04, 1));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const tooth = new THREE.BoxGeometry(0.01, 0.016, 0.025);
      tooth.translate(0.075, Math.cos(a) * 0.108, Math.sin(a) * 0.108);
      tooth.rotateX(a);
      metal.push(colorize(tooth, 0xb08e43, 0.03, i));
    }
    for (const side of [-1, 1]) {
      metal.push(
        colorize(
          cylinderGeo(new THREE.Vector3(side * 0.1, 0, 0), new THREE.Vector3(side * 0.1, side * CRANK_R, 0), 0.012, 0.01, 8),
          0xb9964b,
          0.04,
          side + 4,
        ),
      );
    }
    this.crank.add(new THREE.Mesh(merge(metal), this.mats.metal));

    this.pedalR = this.buildPedal(0.11, CRANK_R);
    this.pedalL = this.buildPedal(-0.11, -CRANK_R);
    this.crank.add(this.pedalR, this.pedalL);
    this.body.add(this.crank);
  }

  private buildPedal(x: number, y: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    const pedal = new THREE.BoxGeometry(0.075, 0.018, 0.11);
    const mesh = new THREE.Mesh(colorize(pedal, 0x49423b, 0.04, 3), this.mats.leather);
    group.add(mesh);
    return group;
  }

  private buildRider(): void {
    this.riderRoot = new THREE.Group();
    this.body.add(this.riderRoot);

    const hip = new THREE.Vector3(0, 1.04, -0.14);
    this.torso = new THREE.Group();
    this.torso.position.copy(hip);
    this.riderRoot.add(this.torso);

    const torsoProfile = [
      new THREE.Vector2(0.185, -0.1),
      new THREE.Vector2(0.2, -0.02),
      new THREE.Vector2(0.195, 0.1),
      new THREE.Vector2(0.175, 0.22),
      new THREE.Vector2(0.178, 0.32),
      new THREE.Vector2(0.155, 0.4),
      new THREE.Vector2(0.095, 0.455),
    ];
    const torsoGeo = new THREE.LatheGeometry(torsoProfile, 24);
    displaceRadial(torsoGeo, 0.03, 9, 4, 1);
    const torso = new THREE.Mesh(colorize(torsoGeo, 0xe4dac2, 0.035, 2), this.mats.fabric);

    const collar: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const band = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.12, 0.41, 0.07),
          new THREE.Vector3(side * 0.08, 0.34, 0.13),
          new THREE.Vector3(0, 0.27, 0.165),
        ]),
        10,
        0.017,
        6,
        false,
      );
      collar.push(colorize(band, 0x3d4a46, 0.04, side + 3));
    }
    const belt = new THREE.TorusGeometry(0.2, 0.026, 8, 26);
    belt.rotateX(Math.PI / 2);
    belt.translate(0, 0.02, 0);
    collar.push(colorize(belt, 0x8f6f3b, 0.04, 5));
    const pendantCord = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.42, 0.1),
        new THREE.Vector3(0.01, 0.28, 0.17),
        new THREE.Vector3(0, 0.19, 0.185),
      ]),
      10,
      0.004,
      5,
      false,
    );
    collar.push(colorize(pendantCord, 0x3d4a46, 0.03, 6));
    const collarMesh = new THREE.Mesh(merge(collar), this.mats.fabric);
    const jade = new THREE.Mesh(colorize(new THREE.SphereGeometry(0.022, 10, 8), 0x6f9a7c, 0.03, 4), this.mats.jade);
    jade.position.set(0, 0.17, 0.19);
    this.torso.add(torso, collarMesh, jade);

    this.buildHead();
    this.buildClothes(hip);
    this.buildLimbs();

    // neck
    const neck = new THREE.Mesh(
      colorize(new THREE.CylinderGeometry(0.045, 0.052, 0.1, 10), 0xd3ae88, 0.01, 2),
      this.mats.skin,
    );
    neck.position.set(0, 0.44, 0.035);
    this.torso.add(neck);
  }

  private buildHead(): void {
    this.head = new THREE.Group();
    this.head.position.set(0, 0.49, 0.04);
    this.torso.add(this.head);

    const skinParts: THREE.BufferGeometry[] = [];
    const skull = new THREE.SphereGeometry(0.105, 20, 16);
    skull.scale(0.94, 1.05, 0.98);
    skull.translate(0, 0.08, 0.01);
    skinParts.push(colorize(skull, 0xd3ae88, 0.012, 1));
    const jaw = new THREE.SphereGeometry(0.075, 14, 10);
    jaw.scale(0.86, 0.72, 0.92);
    jaw.translate(0, 0.008, 0.035);
    skinParts.push(colorize(jaw, 0xd0aa84, 0.012, 2));
    const nose = new THREE.SphereGeometry(0.022, 8, 6);
    nose.scale(0.7, 1.4, 0.8);
    nose.translate(0, 0.065, 0.105);
    skinParts.push(colorize(nose, 0xcaa27d, 0.01, 3));
    for (const side of [-1, 1]) {
      const ear = new THREE.SphereGeometry(0.024, 8, 6);
      ear.scale(0.45, 1, 0.8);
      ear.translate(side * 0.093, 0.065, 0);
      skinParts.push(colorize(ear, 0xcaa27d, 0.01, side + 4));
    }
    this.head.add(new THREE.Mesh(merge(skinParts), this.mats.skin));

    const hairParts: THREE.BufferGeometry[] = [];
    const hairCap = new THREE.SphereGeometry(0.108, 18, 14);
    hairCap.scale(1, 1.02, 0.98);
    hairCap.translate(0, 0.09, -0.028);
    hairParts.push(colorize(hairCap, 0x24211d, 0.02, 1));
    const bun = new THREE.SphereGeometry(0.05, 10, 8);
    bun.translate(0, 0.17, -0.075);
    hairParts.push(colorize(bun, 0x201d1a, 0.02, 2));
    this.head.add(new THREE.Mesh(merge(hairParts), this.mats.hair));

    const pin = new THREE.Mesh(
      colorize(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), 0xc7a24e, 0.03, 1),
      this.mats.metal,
    );
    pin.rotation.z = Math.PI / 2;
    pin.position.set(0, 0.17, -0.075);
    this.head.add(pin);

    const faceParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.SphereGeometry(0.011, 6, 4);
      eye.scale(1, 0.55, 0.35);
      eye.translate(side * 0.038, 0.085, 0.099);
      faceParts.push(colorize(eye, 0x24221f, 0.02, side + 3));
      const brow = new THREE.BoxGeometry(0.032, 0.006, 0.008);
      brow.rotateZ(side * 0.16);
      brow.translate(side * 0.038, 0.11, 0.098);
      faceParts.push(colorize(brow, 0x2a2622, 0.01, side + 5));
    }
    const mouth = new THREE.BoxGeometry(0.028, 0.004, 0.005);
    mouth.translate(0, 0.03, 0.104);
    faceParts.push(colorize(mouth, 0x7d4f44, 0.01, 7));
    this.head.add(new THREE.Mesh(merge(faceParts), this.mats.hair));

    const hatProfile = [
      new THREE.Vector2(0.0, 0.2),
      new THREE.Vector2(0.07, 0.18),
      new THREE.Vector2(0.15, 0.13),
      new THREE.Vector2(0.23, 0.07),
      new THREE.Vector2(0.32, 0.03),
      new THREE.Vector2(0.39, 0.004),
      new THREE.Vector2(0.41, -0.008),
    ];
    const hatParts: THREE.BufferGeometry[] = [
      colorize(new THREE.LatheGeometry(hatProfile, 30), 0xc9ad6c, 0.03, 1),
    ];
    const ribProfile = [
      [0, 0.198],
      [0.07, 0.18],
      [0.15, 0.13],
      [0.23, 0.07],
      [0.32, 0.03],
      [0.39, 0.004],
    ];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const pts = ribProfile.map(([r, y]) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      const rib = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0035, 4, false);
      hatParts.push(colorize(rib, 0x8a6d35, 0.03, i + 2));
    }
    const hat = new THREE.Mesh(merge(hatParts), this.mats.straw);
    hat.position.y = 0.1;
    this.head.add(hat);

    const hatBand = new THREE.Mesh(
      colorize(new THREE.TorusGeometry(0.17, 0.018, 6, 22), 0x4a3b2b, 0.03, 2),
      this.mats.leather,
    );
    hatBand.rotation.x = Math.PI / 2;
    hatBand.position.y = 0.19;
    this.head.add(hatBand);

    const knob = new THREE.Mesh(
      colorize(new THREE.SphereGeometry(0.025, 10, 8), 0xb08c45, 0.03, 3),
      this.mats.metal,
    );
    knob.position.y = 0.305;
    this.head.add(knob);

    const cordParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      cordParts.push(
        colorize(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(side * 0.37, 0.05, 0.0),
              new THREE.Vector3(side * 0.2, -0.15, 0.06),
              new THREE.Vector3(side * 0.07, -0.23, 0.07),
            ]),
            14,
            0.004,
            5,
            false,
          ),
          0x55442f,
          0.03,
          side + 1,
        ),
      );
    }
    const chinMat = new THREE.Mesh(merge(cordParts), this.mats.leather);
    this.head.add(chinMat);
  }

  private buildClothes(hip: THREE.Vector3): void {
    const skirtProfile = [
      new THREE.Vector2(0.2, 0),
      new THREE.Vector2(0.23, -0.08),
      new THREE.Vector2(0.27, -0.18),
      new THREE.Vector2(0.32, -0.29),
      new THREE.Vector2(0.36, -0.4),
    ];
    const skirtGeo = new THREE.LatheGeometry(skirtProfile, 30);
    displaceRadial(skirtGeo, 0.05, 11, 5, 3);
    const pos = skirtGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -0.35) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, y + 0.018 * Math.sin(Math.atan2(z, x) * 6));
      }
    }
    pos.needsUpdate = true;
    skirtGeo.computeVertexNormals();
    this.skirtLength = 0.4;
    this.skirtBase = new Float32Array(pos.array);
    this.skirtMesh = new THREE.Mesh(
      colorize(skirtGeo, 0xe6dcc3, 0.035, 5, { test: (_x, y) => y < -0.365, color: 0x4b5751 }),
      this.mats.fabric,
    );
    this.skirtMesh.position.copy(hip).add(new THREE.Vector3(0, -0.02, 0));
    this.riderRoot.add(this.skirtMesh);

    this.mantle = buildClothGrid(12, 4, 0.5, 0.24, 0xd1c5aa, 0x46524c, 0.08);
    this.mantle.mesh.material = this.mats.fabric;
    this.mantle.mesh.position.set(0, 0.42, -0.1);
    this.mantle.amp = 0.02;
    this.mantle.trail = 0.05;
    this.torso.add(this.mantle.mesh);

    this.cloak = buildClothGrid(10, 12, 0.4, 0.72, 0xd8cdb3, 0x46524c, 0.14);
    this.cloak.mesh.material = this.mats.fabric;
    this.cloak.mesh.position.set(0, 0.38, -0.115);
    this.cloak.amp = 0.06;
    this.cloak.trail = 0.3;
    this.torso.add(this.cloak.mesh);

    const cloakCollar = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.23, 0.39, -0.08),
        new THREE.Vector3(0, 0.42, -0.12),
        new THREE.Vector3(0.23, 0.39, -0.08),
      ]),
      16,
      0.019,
      7,
      false,
    );
    this.torso.add(new THREE.Mesh(colorize(cloakCollar, 0x46524c, 0.03, 4), this.mats.fabric));

    this.scarf = buildClothGrid(4, 6, 0.11, 0.44, 0xefe7d3, 0x7f8d84, 0.05);
    this.scarf.mesh.material = this.mats.fabric;
    this.scarf.mesh.position.set(0.1, 0.42, 0.07);
    this.scarf.mesh.rotation.y = -0.45;
    this.scarf.amp = 0.06;
    this.scarf.trail = 0.32;
    this.torso.add(this.scarf.mesh);

    const scarfKnot = new THREE.TorusGeometry(0.1, 0.022, 8, 22);
    scarfKnot.rotateX(Math.PI / 2);
    scarfKnot.translate(0, 0.425, 0.035);
    this.torso.add(new THREE.Mesh(colorize(scarfKnot, 0xe9dfc9, 0.03, 6), this.mats.fabric));

    this.sash = buildClothGrid(4, 6, 0.09, 0.5, 0xae8a4b, 0x6f5526, 0.06);
    this.sash.mesh.material = this.mats.fabric;
    this.sash.mesh.position.set(0.11, 1.01, -0.17);
    this.sash.mesh.rotation.y = -0.5;
    this.sash.amp = 0.05;
    this.sash.trail = 0.28;
    this.riderRoot.add(this.sash.mesh);

    const sashKnot = new THREE.SphereGeometry(0.035, 10, 8);
    sashKnot.scale(1, 0.8, 0.8);
    sashKnot.translate(0.1, 1.02, -0.15);
    this.riderRoot.add(new THREE.Mesh(colorize(sashKnot, 0x9a7a3f, 0.03, 7), this.mats.fabric));
  }

  private buildWings(): void {
    this.wingGroup = new THREE.Group();
    this.wingGroup.position.set(0, 0.35, -0.07);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const geo = buildWingGeometry();
    this.rightWing = new THREE.Mesh(geo, mat);
    this.rightWing.position.x = 0.05;
    this.rightWing.rotation.y = 0.52;
    this.leftWing = new THREE.Mesh(geo, mat);
    this.leftWing.position.x = -0.05;
    this.leftWing.scale.x = -1;
    this.leftWing.rotation.y = -0.52;
    this.wingGroup.add(this.rightWing, this.leftWing);
    this.wingGroup.visible = false;
    this.torso.add(this.wingGroup);
  }

  setWings(active: boolean, flapPhase: number): void {
    this.wingGroup.visible = active;
    if (!active) return;
    const flap = Math.sin(flapPhase) * 0.34;
    this.rightWing.rotation.z = -0.16 - flap;
    this.leftWing.rotation.z = 0.16 + flap;
    this.rightWing.rotation.y = 0.52 + Math.sin(flapPhase * 0.5) * 0.08;
    this.leftWing.rotation.y = -0.52 - Math.sin(flapPhase * 0.5) * 0.08;
  }

  private buildLimbs(): void {
    const robe = 0xe4dac2;
    const robeCuff = 0x46524c;
    const trouser = 0x3d4848;
    const trouserCuff = 0x2d3535;

    this.armUpperL = new Bone(limbGeometry(0.068, 0.058, robe, robeCuff, 0.01), this.mats.fabric);
    this.armUpperR = new Bone(limbGeometry(0.068, 0.058, robe, robeCuff, 0.01), this.mats.fabric);
    this.armLowerL = new Bone(limbGeometry(0.055, 0.09, robe, robeCuff, 0.012), this.mats.fabric);
    this.armLowerR = new Bone(limbGeometry(0.055, 0.09, robe, robeCuff, 0.012), this.mats.fabric);
    this.legUpperL = new Bone(limbGeometry(0.082, 0.06, trouser, trouserCuff, 0.008), this.mats.fabric);
    this.legUpperR = new Bone(limbGeometry(0.082, 0.06, trouser, trouserCuff, 0.008), this.mats.fabric);
    this.legLowerL = new Bone(limbGeometry(0.055, 0.035, trouser, trouserCuff, 0.006), this.mats.fabric);
    this.legLowerR = new Bone(limbGeometry(0.055, 0.035, trouser, trouserCuff, 0.006), this.mats.fabric);

    this.riderRoot.add(
      this.armUpperL.group,
      this.armUpperR.group,
      this.armLowerL.group,
      this.armLowerR.group,
      this.legUpperL.group,
      this.legUpperR.group,
      this.legLowerL.group,
      this.legLowerR.group,
    );

    const jointGeo = new THREE.SphereGeometry(0.052, 10, 8);
    this.joints = new THREE.InstancedMesh(jointGeo, this.mats.joints, 4);
    const robeColor = new THREE.Color(robe);
    const trouserColor = new THREE.Color(trouser);
    for (let i = 0; i < 4; i++) this.joints.setColorAt(i, i < 2 ? trouserColor : robeColor);
    if (this.joints.instanceColor) this.joints.instanceColor.needsUpdate = true;
    this.joints.frustumCulled = false;
    this.riderRoot.add(this.joints);

    const handParts: THREE.BufferGeometry[] = [];
    const palm = new THREE.SphereGeometry(0.035, 10, 8);
    palm.scale(0.72, 1, 0.9);
    palm.translate(0, 0.035, 0);
    handParts.push(colorize(palm, 0xd3ae88, 0.01, 1));
    const thumb = new THREE.SphereGeometry(0.016, 8, 6);
    thumb.scale(0.7, 1, 0.7);
    thumb.translate(0.025, 0.045, 0.015);
    handParts.push(colorize(thumb, 0xd0aa84, 0.01, 2));
    const handGeo = merge(handParts);
    this.hands = new THREE.InstancedMesh(handGeo, this.mats.skin, 2);
    this.hands.frustumCulled = false;
    this.riderRoot.add(this.hands);

    const bootParts: THREE.BufferGeometry[] = [];
    const boot = new THREE.CapsuleGeometry(0.045, 0.12, 5, 10);
    boot.rotateX(Math.PI / 2);
    boot.scale(0.85, 1, 1);
    boot.translate(0, 0.045, 0.03);
    bootParts.push(colorize(boot, 0x2c2924, 0.02, 1));
    const toe = new THREE.SphereGeometry(0.052, 10, 8);
    toe.scale(0.78, 0.7, 1.05);
    toe.translate(0, 0.045, 0.1);
    bootParts.push(colorize(toe, 0x26231f, 0.02, 2));
    const bootGeo = merge(bootParts);
    this.boots = new THREE.InstancedMesh(bootGeo, this.mats.leather, 2);
    this.boots.frustumCulled = false;
    this.riderRoot.add(this.boots);
  }

  private solveIK(
    root: THREE.Vector3,
    target: THREE.Vector3,
    l1: number,
    l2: number,
    pole: THREE.Vector3,
  ): { mid: THREE.Vector3; end: THREE.Vector3 } {
    const dir = new THREE.Vector3().subVectors(target, root);
    let d = dir.length();
    d = clamp(d, Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
    const dirN = dir.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const poleN = pole.clone().sub(dirN.clone().multiplyScalar(pole.dot(dirN)));
    if (poleN.lengthSq() < 1e-6) poleN.set(0, 0, 1);
    poleN.normalize();
    const mid = root.clone().add(dirN.clone().multiplyScalar(a)).add(poleN.clone().multiplyScalar(h));
    const end = root.clone().add(dirN.clone().multiplyScalar(d));
    return { mid, end };
  }

  setTransform(x: number, y: number, z: number, yaw: number, lean: number, pitch: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    this.body.rotation.z = lean;
    this.body.rotation.x = pitch * 0.55;
  }

  update(dt: number, speed: number, steer: number): void {
    this.time += dt;
    const speedN = clamp(Math.abs(speed) / 14, 0, 1);
    this.wheelSpin += (speed / WHEEL_R) * dt;
    this.crankAngle += (speed / (WHEEL_R * GEAR)) * dt;

    this.steerSmooth = damp(this.steerSmooth, steer, 8, dt);
    this.steering.rotation.y = -this.steerSmooth * 0.34;
    this.rearWheel.rotation.x = this.wheelSpin;
    this.frontWheel.rotation.x = this.wheelSpin;
    this.crank.rotation.x = this.crankAngle;
    this.pedalR.rotation.x = -this.crankAngle;
    this.pedalL.rotation.x = -this.crankAngle;
    this.lanternPivot.rotation.z = Math.sin(this.time * 2.1) * 0.08 * (0.4 + speedN);
    this.lanternPivot.rotation.x = Math.sin(this.time * 1.7 + 1) * 0.06 * (0.4 + speedN) + this.steerSmooth * 0.1;

    this.torso.rotation.x = damp(this.torso.rotation.x, 0.1 + speedN * 0.24, 5, dt);
    this.torso.rotation.z = damp(this.torso.rotation.z, this.steerSmooth * 0.07, 5, dt);
    this.torso.rotation.y = damp(this.torso.rotation.y, this.steerSmooth * 0.06, 5, dt);
    this.head.rotation.x = -this.torso.rotation.x * 0.5;
    this.head.rotation.y = this.steerSmooth * 0.18;
    this.torso.updateMatrix();

    const pedalTheta = this.crankAngle;
    const pedalR = this.crankCenter.clone().add(
      new THREE.Vector3(0.11, Math.cos(pedalTheta) * CRANK_R, Math.sin(pedalTheta) * CRANK_R),
    );
    const pedalL = this.crankCenter.clone().add(
      new THREE.Vector3(-0.11, Math.cos(pedalTheta + Math.PI) * CRANK_R, Math.sin(pedalTheta + Math.PI) * CRANK_R),
    );
    const footR = pedalR.clone().add(new THREE.Vector3(0, 0.035, 0));
    const footL = pedalL.clone().add(new THREE.Vector3(0, 0.035, 0));

    const hipR = this.hipR.clone();
    const hipL = this.hipL.clone();
    const legR = this.solveIK(hipR, footR, 0.43, 0.43, new THREE.Vector3(0.12, 0.05, 1));
    const legL = this.solveIK(hipL, footL, 0.43, 0.43, new THREE.Vector3(-0.12, 0.05, 1));
    this.legUpperR.place(hipR, legR.mid);
    this.legLowerR.place(legR.mid, legR.end);
    this.legUpperL.place(hipL, legL.mid);
    this.legLowerL.place(legL.mid, legL.end);

    const steerAngle = -this.steerSmooth * 0.34;
    const gripR = this.gripLocalR.clone().applyAxisAngle(UP, steerAngle).add(this.steerPivot);
    const gripL = this.gripLocalL.clone().applyAxisAngle(UP, steerAngle).add(this.steerPivot);
    const shoulderR = this.shoulderR.clone().applyMatrix4(this.torso.matrix);
    const shoulderL = this.shoulderL.clone().applyMatrix4(this.torso.matrix);
    const armR = this.solveIK(shoulderR, gripR, 0.3, 0.3, new THREE.Vector3(0.7, -0.5, -0.2));
    const armL = this.solveIK(shoulderL, gripL, 0.3, 0.3, new THREE.Vector3(-0.7, -0.5, -0.2));
    this.armUpperR.place(shoulderR, armR.mid);
    this.armLowerR.place(armR.mid, armR.end);
    this.armUpperL.place(shoulderL, armL.mid);
    this.armLowerL.place(armL.mid, armL.end);

    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const jointPos = [legR.mid, legL.mid, armR.mid, armL.mid];
    jointPos.forEach((p, i) => {
      mat4.compose(p, quat.identity(), scale);
      this.joints.setMatrixAt(i, mat4);
    });
    this.joints.instanceMatrix.needsUpdate = true;

    const handQuatR = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3().subVectors(gripR, armR.mid).normalize());
    const handQuatL = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3().subVectors(gripL, armL.mid).normalize());
    mat4.compose(gripR, handQuatR, scale);
    this.hands.setMatrixAt(0, mat4);
    mat4.compose(gripL, handQuatL, scale);
    this.hands.setMatrixAt(1, mat4);
    this.hands.instanceMatrix.needsUpdate = true;

    mat4.compose(footR, quat.identity(), scale);
    this.boots.setMatrixAt(0, mat4);
    mat4.compose(footL, quat.identity(), scale);
    this.boots.setMatrixAt(1, mat4);
    this.boots.instanceMatrix.needsUpdate = true;

    this.animateCloth(this.mantle, dt, speedN, this.steerSmooth);
    this.animateCloth(this.cloak, dt, speedN, this.steerSmooth);
    this.animateCloth(this.scarf, dt, speedN, this.steerSmooth);
    this.animateCloth(this.sash, dt, speedN, this.steerSmooth);
    this.animateSkirt(speedN, this.steerSmooth);
  }

  private animateCloth(cloth: ClothSet, dt: number, speedN: number, steer: number): void {
    cloth.phase += dt;
    const geo = cloth.mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const base = cloth.base;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      const t = clamp(-by / cloth.length, 0, 1);
      const wave = Math.sin(cloth.phase * 6 + by * 7 + bx * 9);
      const amp = cloth.amp * (0.25 + speedN * 1.8) * Math.pow(t, 1.2);
      pos.setXYZ(
        i,
        bx + wave * amp * 0.45 + steer * 0.05 * t * t,
        by + Math.abs(wave) * amp * 0.16,
        bz - cloth.trail * speedN * t + wave * amp,
      );
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  private animateSkirt(speedN: number, steer: number): void {
    const geo = this.skirtMesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const base = this.skirtBase;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      const t = clamp(-by / this.skirtLength, 0, 1);
      const wave = Math.sin(this.time * 5 + by * 8 + bx * 7);
      const amp = (0.018 + speedN * 0.035) * t;
      pos.setXYZ(
        i,
        bx + wave * amp * 0.5 + steer * 0.04 * t,
        by + Math.abs(wave) * amp * 0.2,
        bz + wave * amp,
      );
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  setCarried(level: number, color: number): void {
    const s = level > 0 ? 0.7 + Math.min(level, 6) * 0.06 : 0.001;
    this.basketGlow.scale.setScalar(s);
    (this.basketGlow.material as THREE.MeshBasicMaterial).color.setHex(color);
  }
}
