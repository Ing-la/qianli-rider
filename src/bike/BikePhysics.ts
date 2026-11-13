import * as THREE from 'three';
import type { InputState } from '../core/Input';
import { clamp, damp, wrapAngle } from '../core/MathUtils';
import { centerX } from '../world/Path';
import { WATER_LEVEL, World } from '../world/World';

export interface BikeEvent {
  jumped: boolean;
  landed: boolean;
  hardLanding: boolean;
  water: boolean;
}

const GRAVITY = 22;
const JUMP_VELOCITY = 6.4;
const WHEEL_RADIUS = 0.36;
const MAX_ALTITUDE = 100;

export class BikePhysics {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  steer = 0;
  vy = 0;
  grounded = true;
  flying = false;
  lean = 0;
  pitch = 0;
  airTime = 0;

  constructor(private world: World) {
    this.reset(world.spawnX, world.spawnZ, 0);
  }

  reset(x: number, z: number, yaw = 0): void {
    this.pos.set(x, this.world.heightAt(x, z), z);
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.vy = 0;
    this.grounded = true;
    this.flying = false;
    this.lean = 0;
    this.pitch = 0;
    this.airTime = 0;
  }

  startFlying(): void {
    this.flying = true;
    this.grounded = false;
    this.vy = 6.2;
    this.pos.y += 0.3;
    this.airTime = 0;
  }

  stopFlying(): void {
    this.flying = false;
    this.vy = Math.min(this.vy, -1.5);
  }

  private forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  update(dt: number, input: InputState): BikeEvent {
    const ev: BikeEvent = { jumped: false, landed: false, hardLanding: false, water: false };
    const forward = this.forward();

    this.steer = damp(this.steer, input.steer, 9, dt);

    const boosting = input.boost && input.throttle > 0;
    const maxSpeed = boosting ? 17.5 : this.flying ? 15 : 14;

    if (input.throttle > 0) {
      this.speed += (boosting ? 9.5 : 6.4) * input.throttle * dt;
    } else if (input.throttle < 0) {
      if (this.speed > 0.4) this.speed -= 13 * dt;
      else this.speed = Math.max(-2.5, this.speed - 2.2 * dt);
    } else {
      const roll = Math.sign(this.speed) * 0.9 * dt;
      this.speed = Math.abs(this.speed) <= Math.abs(roll) ? 0 : this.speed - roll;
    }

    this.speed -= this.speed * Math.abs(this.speed) * 0.012 * dt + this.speed * 0.14 * dt;
    this.speed = clamp(this.speed, -2.5, maxSpeed);

    if (!this.flying) {
      const grad = this.world.gradient(this.pos.x, this.pos.z);
      const slopeAlong = grad.x * forward.x + grad.z * forward.z;
      if (this.grounded) {
        this.speed -= slopeAlong * 7.5 * dt;
        // steep cliff faces act as walls: bleed speed hard when climbing them
        if (slopeAlong > 0.5) {
          this.speed *= clamp(1 - (slopeAlong - 0.5) * 1.6 * dt, 0.75, 1);
        }
        if (slopeAlong > 1.1) this.speed = Math.min(this.speed, 1.5);
      }
    }

    const speedFactor = clamp(Math.abs(this.speed) / 5, this.flying ? 0.4 : 0, 1);
    const reverse = this.speed < -0.05 ? -1 : 1;
    // screen-right is world -x: positive steer (D) must decrease yaw
    this.yaw = wrapAngle(this.yaw - this.steer * 1.8 * speedFactor * reverse * dt);

    forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.x += forward.x * this.speed * dt;
    this.pos.z += forward.z * this.speed * dt;

    const maxLat = this.flying ? 112 : 60;
    const lat = this.world.lateralAt(this.pos.x, this.pos.z);
    if (Math.abs(lat) > maxLat) {
      const cx = centerX(this.pos.z);
      this.pos.x = cx + Math.sign(lat) * maxLat;
      this.speed *= 0.78;
    }
    if (this.pos.z < 9 || this.pos.z > 791) {
      this.world.clampToWorld(this.pos);
      this.speed *= 0.6;
    }

    this.world.resolveCollisions(this.pos, 0.45);

    const groundY = this.world.heightAt(this.pos.x, this.pos.z);

    if (this.flying) {
      // Space climbs, S (throttle back) dives, otherwise a gentle glide
      const diving = input.throttle < 0;
      const targetVy = input.ascend ? 7 : diving ? -9 : -2.4;
      this.vy = damp(this.vy, targetVy, input.ascend ? 3.4 : diving ? 5 : 1.5, dt);
      this.pos.y = Math.min(this.pos.y + this.vy * dt, MAX_ALTITUDE);
      this.grounded = false;
      this.airTime += dt;
      if (this.pos.y <= groundY + 0.08) {
        this.pos.y = groundY;
        this.vy = 0;
        this.flying = false;
        this.grounded = true;
        this.airTime = 0;
        ev.landed = true;
      }
    } else if (this.grounded) {
      this.pos.y = groundY;
      if (input.jump) {
        this.vy = JUMP_VELOCITY;
        this.grounded = false;
        this.pos.y += 0.06;
        this.airTime = 0;
        ev.jumped = true;
      }
    } else {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      this.airTime += dt;
      if (this.pos.y <= groundY) {
        ev.landed = true;
        ev.hardLanding = this.vy < -9;
        this.pos.y = groundY;
        this.vy = 0;
        this.grounded = true;
        this.airTime = 0;
      }
    }

    if (this.grounded && this.world.heightAt(this.pos.x, this.pos.z) < WATER_LEVEL - 0.06) {
      ev.water = true;
      this.speed *= Math.max(0, 1 - 3.4 * dt);
    }

    const speedNorm = clamp(Math.abs(this.speed) / 10, 0, 1);
    const targetLean = this.steer * speedNorm * (this.flying ? 0.42 : 0.62);
    this.lean = damp(this.lean, targetLean, 8, dt);

    if (this.flying) {
      this.pitch = damp(this.pitch, clamp(-this.vy * 0.04, -0.25, 0.25), 5, dt);
    } else {
      const aheadX = this.pos.x + Math.sin(this.yaw) * 1.5;
      const aheadZ = this.pos.z + Math.cos(this.yaw) * 1.5;
      const behindX = this.pos.x - Math.sin(this.yaw) * 1.5;
      const behindZ = this.pos.z - Math.cos(this.yaw) * 1.5;
      const targetPitch = Math.atan2(
        this.world.heightAt(aheadX, aheadZ) - this.world.heightAt(behindX, behindZ),
        3,
      );
      this.pitch = damp(this.pitch, targetPitch, 9, dt);
    }

    return ev;
  }

  get wheelRadius(): number {
    return WHEEL_RADIUS;
  }
}
