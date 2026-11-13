import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from '../core/MathUtils';

function tubeGeo(a: THREE.Vector3, b: THREE.Vector3, r: number, radial = 6): THREE.BufferGeometry {
  return taperGeo(a, b, r, r, radial);
}

function taperGeo(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, radial = 8): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, len, radial, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  geo.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

function ringAt(a: THREE.Vector3, b: THREE.Vector3, t: number, r: number): THREE.BufferGeometry {
  const p = new THREE.Vector3().lerpVectors(a, b, t);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  return tubeGeo(p.clone().addScaledVector(dir, -0.035), p.clone().addScaledVector(dir, 0.035), r, 8);
}

function wheelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tire = new THREE.TorusGeometry(0.36, 0.035, 6, 22);
  tire.rotateY(Math.PI / 2);
  parts.push(tire);
  const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    parts.push(
      tubeGeo(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, Math.cos(ang) * 0.33, Math.sin(ang) * 0.33), 0.008, 4),
    );
  }
  return mergeGeometries(parts)!;
}

function featherGeometry(len: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(len * 0.45, width, len, width * 0.14);
  shape.quadraticCurveTo(len * 0.55, -width * 0.55, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 10);
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
  for (let k = 0; k < 5; k++) {
    const len = 1.78 - k * 0.14;
    const width = 0.26 - k * 0.025;
    const feather = featherGeometry(len, width);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, -0.05 * k),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.12 * k, 0.22 - k * 0.16)),
      new THREE.Vector3(1, 1, 1),
    );
    feather.applyMatrix4(matrix);
    parts.push(feather);
  }
  return mergeGeometries(parts)!;
}

function ribbonGeometry(width: number, length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width * 0.32, -length);
  shape.lineTo(0, -length * 0.92);
  shape.lineTo(-width * 0.38, -length);
  shape.lineTo(-width / 2, 0);
  return new THREE.ShapeGeometry(shape, 6);
}

export class BikeModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private frontWheel: THREE.Mesh;
  private rearWheel: THREE.Mesh;
  private handlebar: THREE.Group;
  private basketGlow: THREE.Mesh;
  private wingGroup!: THREE.Group;
  private leftWing!: THREE.Mesh;
  private rightWing!: THREE.Mesh;
  private cloakPivot!: THREE.Group;
  private scarfPivot!: THREE.Group;
  private sashPivot!: THREE.Group;
  private wheelSpin = 0;
  private time = 0;

  constructor() {
    this.root.name = 'bike';
    this.root.add(this.body);

    const bambooMat = new THREE.MeshStandardMaterial({ color: 0xb69a4e, roughness: 0.7, metalness: 0.03 });
    const nodeMat = new THREE.MeshStandardMaterial({ color: 0x7d6630, roughness: 0.8 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.42, metalness: 0.65 });
    const saddleMat = new THREE.MeshStandardMaterial({ color: 0x3c2f26, roughness: 0.95 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2f2a24, roughness: 0.85 });

    const rearHub = new THREE.Vector3(0, 0.36, -0.55);
    const frontHub = new THREE.Vector3(0, 0.36, 0.62);
    const seatTop = new THREE.Vector3(0, 0.95, -0.18);
    const headTop = new THREE.Vector3(0, 0.9, 0.34);
    const crank = new THREE.Vector3(0, 0.42, 0.02);

    const frameParts = [
      tubeGeo(rearHub, seatTop, 0.032),
      tubeGeo(seatTop, headTop, 0.032),
      tubeGeo(headTop, frontHub, 0.03),
      tubeGeo(rearHub, crank, 0.026),
      tubeGeo(crank, seatTop, 0.026),
      tubeGeo(crank, headTop, 0.03),
      tubeGeo(headTop, new THREE.Vector3(0, 1.03, 0.4), 0.025),
    ];
    this.body.add(new THREE.Mesh(mergeGeometries(frameParts)!, bambooMat));

    const ringParts = [
      ringAt(seatTop, headTop, 0.28, 0.043),
      ringAt(seatTop, headTop, 0.62, 0.043),
      ringAt(crank, headTop, 0.3, 0.041),
      ringAt(crank, headTop, 0.68, 0.041),
      ringAt(rearHub, seatTop, 0.45, 0.043),
    ];
    this.body.add(new THREE.Mesh(mergeGeometries(ringParts)!, nodeMat));

    const lugParts: THREE.BufferGeometry[] = [];
    for (const joint of [rearHub, frontHub, seatTop, headTop, crank]) {
      const lug = new THREE.SphereGeometry(0.048, 8, 6);
      lug.translate(joint.x, joint.y, joint.z);
      lugParts.push(lug);
    }
    this.body.add(new THREE.Mesh(mergeGeometries(lugParts)!, bronzeMat));

    this.handlebar = new THREE.Group();
    const barGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.66, 8);
    barGeo.rotateZ(Math.PI / 2);
    const bar = new THREE.Mesh(barGeo, bronzeMat);
    bar.position.set(0, 1.05, 0.42);
    this.handlebar.add(bar);
    for (const side of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 8), saddleMat);
      grip.rotation.z = Math.PI / 2;
      grip.position.set(side * 0.27, 1.05, 0.42);
      this.handlebar.add(grip);
    }
    this.body.add(this.handlebar);

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.3), saddleMat);
    saddle.position.set(0, 0.99, -0.18);
    this.body.add(saddle);

    const wg = wheelGeometry();
    this.rearWheel = new THREE.Mesh(wg, wheelMat);
    this.rearWheel.position.copy(rearHub);
    this.frontWheel = new THREE.Mesh(wg, wheelMat);
    this.frontWheel.position.copy(frontHub);
    this.body.add(this.rearWheel, this.frontWheel);

    this.buildRider();
    this.buildWings();

    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.26, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x6e5426, roughness: 0.9 }),
    );
    basket.position.set(0, 0.82, 0.68);
    this.body.add(basket);

    this.basketGlow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.14, 1),
      new THREE.MeshBasicMaterial({ color: 0x3f6ea6, transparent: true, opacity: 0.9 }),
    );
    this.basketGlow.position.set(0, 0.9, 0.68);
    this.basketGlow.scale.setScalar(0.001);
    this.body.add(this.basketGlow);
  }

  private buildRider(): void {
    const robeMat = new THREE.MeshStandardMaterial({ color: 0xd6ccb2, roughness: 0.95 });
    const robeShadeMat = new THREE.MeshStandardMaterial({
      color: 0xbcb196,
      roughness: 0.96,
      side: THREE.DoubleSide,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x3d4a48, roughness: 0.9 });
    const sashMat = new THREE.MeshStandardMaterial({ color: 0xa88645, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xcfad86, roughness: 0.85 });
    const hatMat = new THREE.MeshStandardMaterial({
      color: 0xb1975d,
      roughness: 0.9,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x272725, roughness: 0.9 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x312e28, roughness: 0.95 });

    const hips = new THREE.Vector3(0, 1.03, -0.12);
    const chest = new THREE.Vector3(0, 1.38, 0.04);
    const neck = new THREE.Vector3(0, 1.47, 0.1);
    const head = new THREE.Vector3(0, 1.575, 0.145);

    const robeParts: THREE.BufferGeometry[] = [];
    robeParts.push(taperGeo(hips.clone().add(new THREE.Vector3(0, 0.03, 0)), chest, 0.2, 0.165, 12));
    const shoulders = new THREE.SphereGeometry(0.19, 12, 8);
    shoulders.scale(1.25, 0.62, 0.95);
    shoulders.translate(chest.x, chest.y - 0.01, chest.z - 0.01);
    robeParts.push(shoulders);

    const skirt = new THREE.ConeGeometry(0.34, 0.54, 14, 1, true);
    skirt.translate(hips.x, hips.y - 0.2, hips.z);
    robeParts.push(skirt);

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.15, 1.38, 0.06);
      const elbow = new THREE.Vector3(side * 0.23, 1.17, 0.24);
      const wrist = new THREE.Vector3(side * 0.26, 1.04, 0.4);
      robeParts.push(tubeGeo(shoulder, elbow, 0.075, 9));
      robeParts.push(taperGeo(elbow, wrist, 0.06, 0.1, 9));
    }

    this.body.add(new THREE.Mesh(mergeGeometries(robeParts)!, robeMat));

    const trimParts: THREE.BufferGeometry[] = [];
    const collar = new THREE.TorusGeometry(0.115, 0.02, 6, 16);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 1.45, 0.09);
    trimParts.push(collar);
    for (const side of [-1, 1]) {
      trimParts.push(
        tubeGeo(
          new THREE.Vector3(side * 0.1, 1.45, 0.11),
          new THREE.Vector3(0, 1.3, 0.17),
          0.014,
          6,
        ),
      );
    }
    const belt = new THREE.TorusGeometry(0.205, 0.028, 6, 18);
    belt.rotateX(Math.PI / 2);
    belt.translate(0, 1.05, -0.1);
    trimParts.push(belt);
    const hem = new THREE.TorusGeometry(0.33, 0.014, 5, 24);
    hem.rotateX(Math.PI / 2);
    hem.translate(0, 0.78, -0.2);
    trimParts.push(hem);
    this.body.add(new THREE.Mesh(mergeGeometries(trimParts)!, trimMat));

    const skinParts: THREE.BufferGeometry[] = [];
    const neckGeo = taperGeo(neck.clone().add(new THREE.Vector3(0, -0.05, 0)), neck.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.045, 0.04, 8);
    skinParts.push(neckGeo);
    const headGeo = new THREE.SphereGeometry(0.1, 14, 10);
    headGeo.scale(1, 1.08, 1.02);
    headGeo.translate(head.x, head.y, head.z);
    skinParts.push(headGeo);
    for (const side of [-1, 1]) {
      const hand = new THREE.SphereGeometry(0.038, 8, 6);
      hand.translate(side * 0.26, 1.04, 0.4);
      skinParts.push(hand);
    }
    this.body.add(new THREE.Mesh(mergeGeometries(skinParts)!, skinMat));

    const hairParts: THREE.BufferGeometry[] = [];
    const backHair = new THREE.SphereGeometry(0.105, 12, 8);
    backHair.scale(1, 0.9, 1);
    backHair.translate(0, head.y + 0.005, head.z - 0.03);
    hairParts.push(backHair);
    const bun = new THREE.SphereGeometry(0.05, 8, 6);
    bun.translate(0, head.y + 0.1, head.z - 0.07);
    hairParts.push(bun);
    this.body.add(new THREE.Mesh(mergeGeometries(hairParts)!, hairMat));

    const hatParts: THREE.BufferGeometry[] = [];
    const brim = new THREE.ConeGeometry(0.36, 0.13, 14, 1, true);
    brim.translate(0, head.y + 0.17, head.z);
    hatParts.push(brim);
    const crown = new THREE.ConeGeometry(0.13, 0.17, 12);
    crown.translate(0, head.y + 0.24, head.z);
    hatParts.push(crown);
    const brimEdge = new THREE.TorusGeometry(0.36, 0.012, 5, 20);
    brimEdge.rotateX(Math.PI / 2);
    brimEdge.translate(0, head.y + 0.11, head.z);
    hatParts.push(brimEdge);
    this.body.add(new THREE.Mesh(mergeGeometries(hatParts)!, hatMat));

    const hairpin = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 5), sashMat);
    hairpin.rotation.z = Math.PI / 2;
    hairpin.position.set(0, head.y + 0.11, head.z - 0.07);
    this.body.add(hairpin);

    const legParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Vector3(side * 0.09, 1.0, -0.05);
      const knee = new THREE.Vector3(side * 0.15, 0.64, 0.13);
      const ankle = new THREE.Vector3(side * 0.17, 0.4, 0.08);
      legParts.push(tubeGeo(hip, knee, 0.055, 8));
      legParts.push(tubeGeo(knee, ankle, 0.045, 8));
      const kneeBall = new THREE.SphereGeometry(0.055, 8, 6);
      kneeBall.translate(knee.x, knee.y, knee.z);
      legParts.push(kneeBall);
    }
    this.body.add(new THREE.Mesh(mergeGeometries(legParts)!, trimMat));

    const shoeParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const shoe = new THREE.BoxGeometry(0.09, 0.06, 0.2);
      shoe.translate(side * 0.17, 0.37, 0.12);
      shoeParts.push(shoe);
    }
    this.body.add(new THREE.Mesh(mergeGeometries(shoeParts)!, shoeMat));

    // cloak
    this.cloakPivot = new THREE.Group();
    this.cloakPivot.position.set(0, 1.39, -0.06);
    const cloakShape = new THREE.Shape();
    cloakShape.moveTo(-0.26, 0);
    cloakShape.lineTo(0.26, 0);
    cloakShape.quadraticCurveTo(0.34, -0.55, 0.3, -0.8);
    cloakShape.quadraticCurveTo(0, -0.68, -0.3, -0.8);
    cloakShape.quadraticCurveTo(-0.34, -0.55, -0.26, 0);
    const cloak = new THREE.Mesh(new THREE.ShapeGeometry(cloakShape, 8), robeShadeMat);
    cloak.position.z = -0.02;
    this.cloakPivot.add(cloak);
    this.body.add(this.cloakPivot);

    // scarf
    this.scarfPivot = new THREE.Group();
    this.scarfPivot.position.set(0, 1.46, 0.03);
    const scarfMat = new THREE.MeshStandardMaterial({
      color: 0xe4dcc6,
      roughness: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    for (const [dx, rz] of [
      [-0.035, 0.18],
      [0.035, -0.12],
    ]) {
      const ribbon = new THREE.Mesh(ribbonGeometry(0.075, 0.5), scarfMat);
      ribbon.position.x = dx;
      ribbon.rotation.z = rz;
      this.scarfPivot.add(ribbon);
    }
    this.body.add(this.scarfPivot);

    // sash
    this.sashPivot = new THREE.Group();
    this.sashPivot.position.set(0, 1.03, -0.16);
    for (const [dx, rz] of [
      [-0.05, 0.14],
      [0.05, -0.1],
    ]) {
      const ribbon = new THREE.Mesh(ribbonGeometry(0.1, 0.62), sashMat);
      ribbon.position.x = dx;
      ribbon.rotation.z = rz;
      this.sashPivot.add(ribbon);
    }
    this.body.add(this.sashPivot);
  }

  private buildWings(): void {
    this.wingGroup = new THREE.Group();
    this.wingGroup.position.set(0, 1.36, 0.0);
    const wingMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wingGeo = buildWingGeometry();
    this.rightWing = new THREE.Mesh(wingGeo, wingMat);
    this.rightWing.position.x = 0.06;
    this.rightWing.rotation.y = 0.55;
    this.leftWing = new THREE.Mesh(wingGeo, wingMat);
    this.leftWing.position.x = -0.06;
    this.leftWing.scale.x = -1;
    this.leftWing.rotation.y = -0.55;
    this.wingGroup.add(this.rightWing, this.leftWing);
    this.wingGroup.visible = false;
    this.wingGroup.renderOrder = 3;
    this.body.add(this.wingGroup);
  }

  setTransform(x: number, y: number, z: number, yaw: number, lean: number, pitch: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    this.body.rotation.z = lean;
    this.body.rotation.x = pitch * 0.55;
  }

  update(dt: number, speed: number, steer: number): void {
    this.time += dt;
    this.wheelSpin += (speed / 0.36) * dt;
    this.rearWheel.rotation.x = this.wheelSpin;
    this.frontWheel.rotation.x = this.wheelSpin * 0.98;
    this.handlebar.rotation.y = -steer * 0.22;

    const flutter = clamp(Math.abs(speed) / 13, 0, 1);
    this.cloakPivot.rotation.x = 0.08 + flutter * 0.55 + Math.sin(this.time * 6.5) * 0.05 * flutter;
    this.scarfPivot.rotation.x = flutter * 0.9 + Math.sin(this.time * 9 + 1) * 0.12 * flutter;
    this.scarfPivot.rotation.z = Math.sin(this.time * 5.2) * 0.12 * flutter;
    this.sashPivot.rotation.x = 0.1 + flutter * 0.7 + Math.sin(this.time * 7.3) * 0.06 * flutter;
  }

  setCarried(level: number, color: number): void {
    const s = level > 0 ? 0.7 + Math.min(level, 6) * 0.06 : 0.001;
    this.basketGlow.scale.setScalar(s);
    (this.basketGlow.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  setWings(active: boolean, flapPhase: number): void {
    this.wingGroup.visible = active;
    if (!active) return;
    const flap = Math.sin(flapPhase) * 0.34;
    this.rightWing.rotation.z = -0.16 - flap;
    this.leftWing.rotation.z = 0.16 + flap;
    this.rightWing.rotation.y = 0.55 + Math.sin(flapPhase * 0.5) * 0.08;
    this.leftWing.rotation.y = -0.55 - Math.sin(flapPhase * 0.5) * 0.08;
  }
}
