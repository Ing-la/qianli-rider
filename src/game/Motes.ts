import * as THREE from 'three';
import { mulberry32, range } from '../core/PRNG';
import { WORLD_HALF, World, type PigmentIndex } from '../world/World';
import { PIGMENTS } from './Pigments';

interface MoteData {
  type: PigmentIndex;
  x: number;
  z: number;
  spawnX: number;
  spawnZ: number;
  baseY: number;
  phase: number;
  active: boolean;
  timer: number;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.16, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.4, 'rgba(255,255,255,0.32)');
  glow.addColorStop(0.72, 'rgba(255,255,255,0.08)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = 'lighter';
  const ray = ctx.createLinearGradient(64, 64, 64, 4);
  ray.addColorStop(0, 'rgba(255,255,255,0.85)');
  ray.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  ray.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = ray;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(64, 10);
  ctx.lineTo(64, 118);
  ctx.moveTo(10, 64);
  ctx.lineTo(118, 64);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export class Motes {
  readonly group = new THREE.Group();
  private readonly data: MoteData[] = [];
  private readonly cores: THREE.InstancedMesh;
  private readonly glows: THREE.InstancedMesh;
  private readonly cameraQuat = new THREE.Quaternion();

  constructor(world: World, seed: number) {
    const rng = mulberry32(seed ^ 0x51a7c3);

    const push = (x: number, z: number, type: PigmentIndex): void => {
      if (Math.abs(x) > WORLD_HALF - 40 || Math.abs(z) > WORLD_HALF - 40) return;
      const ground = world.heightAt(x, z);
      this.data.push({
        type,
        x,
        z,
        spawnX: x,
        spawnZ: z,
        baseY: ground + 1.25 + rng() * 0.55,
        phase: rng() * Math.PI * 2,
        active: true,
        timer: 0,
      });
    };

    for (const p of world.pavilions) {
      for (let c = 0; c < 5; c++) {
        const angle = rng() * Math.PI * 2;
        const radius = range(rng, 14, 46);
        const cx = p.x + Math.cos(angle) * radius;
        const cz = p.z + Math.sin(angle) * radius;
        for (let k = 0; k < 5; k++) {
          const type = (rng() < 0.62 ? p.pigment : Math.floor(rng() * 3)) as PigmentIndex;
          push(cx + range(rng, -7, 7), cz + range(rng, -7, 7), type);
        }
      }
    }

    for (let i = 0; i < 40; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = range(rng, 30, 440);
      push(Math.cos(angle) * radius, Math.sin(angle) * radius, (i % 3) as PigmentIndex);
    }

    const count = this.data.length;
    const color = new THREE.Color();
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.26,
      metalness: 0.22,
      flatShading: true,
    });
    this.cores = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), coreMat, count);
    const glowMat = new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: 0xffffff,
    });
    this.glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMat, count);

    this.data.forEach((m, i) => {
      color.setHex(PIGMENTS[m.type].color);
      this.cores.setColorAt(i, color);
      this.glows.setColorAt(i, color);
    });
    if (this.cores.instanceColor) this.cores.instanceColor.needsUpdate = true;
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
    this.cores.frustumCulled = false;
    this.glows.frustumCulled = false;
    this.cores.renderOrder = 4;
    this.glows.renderOrder = 5;

    this.group.add(this.cores, this.glows);
    this.syncVisuals(0);
  }

  private syncVisuals(time: number): void {
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    this.data.forEach((m, i) => {
      if (!m.active) {
        matrix.compose(pos.set(0, -500, 0), quat.identity(), scale.setScalar(0.0001));
        this.cores.setMatrixAt(i, matrix);
        this.glows.setMatrixAt(i, matrix);
        return;
      }
      const bob = m.baseY + Math.sin(time * 1.8 + m.phase) * 0.18;
      quat.setFromEuler(euler.set(m.phase + time * 0.6, time * 0.9 + m.phase, 0));
      scale.setScalar(0.9 + 0.12 * Math.sin(time * 3 + m.phase));
      matrix.compose(pos.set(m.x, bob, m.z), quat, scale);
      this.cores.setMatrixAt(i, matrix);

      const glowScale = 2.5 + Math.sin(time * 2.4 + m.phase) * 0.22;
      matrix.compose(pos.set(m.x, bob, m.z), this.cameraQuat, scale.setScalar(glowScale));
      this.glows.setMatrixAt(i, matrix);
    });

    this.cores.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
  }

  nearestActive(x: number, z: number): { x: number; z: number; dist: number } | null {
    let best: { x: number; z: number; dist: number } | null = null;
    for (const m of this.data) {
      if (!m.active) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (!best || d < best.dist) best = { x: m.x, z: m.z, dist: d };
    }
    return best;
  }

  reset(): void {
    this.data.forEach((m) => {
      m.active = true;
      m.timer = 0;
      m.x = m.spawnX;
      m.z = m.spawnZ;
    });
    this.syncVisuals(0);
  }

  update(
    dt: number,
    time: number,
    px: number,
    py: number,
    pz: number,
    freeSlots: number,
    cameraQuat: THREE.Quaternion,
  ): PigmentIndex[] {
    this.cameraQuat.copy(cameraQuat);
    const picked: PigmentIndex[] = [];
    let allowed = Math.max(0, freeSlots);

    for (const m of this.data) {
      if (!m.active) {
        m.timer -= dt;
        if (m.timer <= 0) {
          m.active = true;
          m.x = m.spawnX;
          m.z = m.spawnZ;
        }
        continue;
      }

      const dx = px - m.x;
      const dz = pz - m.z;
      const d = Math.hypot(dx, dz);
      // gentle magnet: easy to scoop up, but only when there is room in the basket
      if (allowed > 0 && d > 0.001 && d < 11) {
        const pull = (1 - d / 11) * 10 * dt;
        m.x += (dx / d) * pull;
        m.z += (dz / d) * pull;
      }

      const bob = m.baseY + Math.sin(time * 1.8 + m.phase) * 0.18;
      if (allowed > 0 && dx * dx + dz * dz < 20.25 && Math.abs(bob - py) < 4.6) {
        m.active = false;
        m.timer = 8;
        allowed--;
        picked.push(m.type);
      }
    }

    this.syncVisuals(time);
    return picked;
  }
}
