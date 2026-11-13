import * as THREE from 'three';
import { damp } from '../core/MathUtils';
import type { BikePhysics } from './BikePhysics';
import type { World } from '../world/World';

export class CameraRig {
  private smoothPos = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private initialized = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  private desired(bike: BikePhysics, outPos: THREE.Vector3, outLook: THREE.Vector3): void {
    const fx = Math.sin(bike.yaw);
    const fz = Math.cos(bike.yaw);
    outPos.set(bike.pos.x - fx * 6.2, bike.pos.y + 2.55, bike.pos.z - fz * 6.2);
    outLook.set(bike.pos.x + fx * 4.2, bike.pos.y + 1.05, bike.pos.z + fz * 4.2);
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
    this.camera.rotation.z += bike.lean * 0.22;

    const targetFov = 62 + Math.min(Math.abs(bike.speed), 17) * 0.65;
    this.camera.fov = damp(this.camera.fov, targetFov, 3.5, dt);
    this.camera.updateProjectionMatrix();
  }
}
