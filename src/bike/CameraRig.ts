import * as THREE from 'three';
import { clamp, damp } from '../core/MathUtils';
import type { BikePhysics } from './BikePhysics';
import type { ViewController } from './ViewController';
import type { World } from '../world/World';

export class CameraRig {
  private smoothPos = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private initialized = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly view: ViewController,
  ) {}

  private desired(bike: BikePhysics, outPos: THREE.Vector3, outLook: THREE.Vector3): void {
    const yaw = bike.yaw + this.view.yaw;
    const phi = clamp(0.18 + this.view.pitch, -0.05, 1.0);
    const dist = 5.4;
    const pivotX = bike.pos.x;
    const pivotY = bike.pos.y + 1.12;
    const pivotZ = bike.pos.z;
    const horiz = Math.cos(phi) * dist;
    const vert = Math.sin(phi) * dist + 0.2;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    outPos.set(pivotX - fx * horiz, pivotY + vert, pivotZ - fz * horiz);
    outLook.set(pivotX + fx * 3.2, pivotY - 0.05, pivotZ + fz * 3.2);
  }

  snap(bike: BikePhysics): void {
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    this.desired(bike, pos, look);
    this.smoothPos.copy(pos);
    this.lookAt.copy(look);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.initialized = true;
  }

  update(dt: number, bike: BikePhysics, world: World): void {
    this.view.update(dt, bike.speed);
    if (!this.initialized) this.snap(bike);
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    this.desired(bike, pos, look);

    const k = 1 - Math.exp(-6.5 * dt);
    this.smoothPos.lerp(pos, k);
    const floor = world.heightAt(this.smoothPos.x, this.smoothPos.z) + 1.5;
    if (this.smoothPos.y < floor) this.smoothPos.y = floor;

    this.lookAt.lerp(look, 1 - Math.exp(-9 * dt));
    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.lookAt);
    this.camera.rotation.z += bike.lean * 0.22 * Math.cos(this.view.yaw);

    const targetFov = 62 + Math.min(Math.abs(bike.speed), 17) * 0.65;
    this.camera.fov = damp(this.camera.fov, targetFov, 3.5, dt);
    this.camera.updateProjectionMatrix();
  }
}
