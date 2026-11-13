import * as THREE from 'three';
import { BikeModel } from './bike/BikeModel';
import { BikePhysics } from './bike/BikePhysics';
import { CameraRig } from './bike/CameraRig';
import { ViewController } from './bike/ViewController';
import { DebugPanel } from './core/Debug';
import { Input } from './core/Input';
import { wrapAngle } from './core/MathUtils';
import { seedFromUrl } from './core/PRNG';
import { Sfx } from './core/Sfx';
import { bestScore, saveBest, type BestEntry } from './game/Leaderboard';
import { Motes } from './game/Motes';
import { DELIVERIES_PER_REGION, PIGMENTS } from './game/Pigments';
import { completedRegions, updateRegions } from './game/Regions';
import { Scoring } from './game/Scoring';
import { Backdrop } from './render/Backdrop';
import { ShanshuiMaterial } from './render/materials/ShanshuiMaterial';
import { RenderSystem } from './render/Renderer';
import { SkyDome } from './render/SkyDome';
import { Hud } from './ui/Hud';
import { Minimap } from './ui/Minimap';
import { TouchControls } from './ui/TouchControls';
import { buildProps, type PropsResult } from './world/Props';
import { buildTerrain, makeOutlineGeometry } from './world/TerrainBuilder';
import { World } from './world/World';

type State = 'title' | 'playing' | 'finished';

const FIXED_STEP = 1 / 120;
const RUN_LIMIT = 480;
const DELIVER_RADIUS = 7.2;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

function formatTime(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class App {
  private readonly render: RenderSystem;
  private readonly world: World;
  private readonly props: PropsResult;
  private readonly bike: BikePhysics;
  private readonly bikeModel: BikeModel;
  private readonly view: ViewController;
  private readonly rig: CameraRig;
  private readonly input = new Input();
  private readonly debug: DebugPanel;
  private readonly clock = new THREE.Clock();
  private readonly shanshui: ShanshuiMaterial;
  private readonly backdrop = new Backdrop();
  private readonly sky = new SkyDome();
  private readonly hud = new Hud();
  private readonly sfx = new Sfx();
  private readonly minimap: Minimap;
  private readonly motes: Motes;
  private readonly scoring = new Scoring();
  private readonly targetBeam: THREE.Mesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly touch: boolean;
  private readonly touchControls: TouchControls | null;

  private state: State = 'title';
  private accumulator = 0;
  private rideTime = 0;
  private waterCooldown = 0;
  private waterHintShown = false;
  private jumpTimes: number[] = [];
  private readonly forceReveal: boolean;
  private readonly autoPilot: boolean;
  private readonly modelMode: boolean;
  private readonly modelWings: boolean;

  constructor(canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(location.search);
    this.forceReveal = params.has('reveal') || params.has('colored');
    this.autoPilot = params.has('auto');
    this.modelMode = params.has('model');
    this.modelWings = params.has('wings');
    this.touch = TouchControls.isTouchCapable() || params.has('touch');
    document.body.classList.toggle('touch', this.touch);

    this.render = new RenderSystem(canvas, this.touch ? 1.5 : 2);
    this.shanshui = new ShanshuiMaterial(this.touch);
    this.world = new World(seedFromUrl(1113));

    const terrain = buildTerrain(this.world);
    terrain.material = this.shanshui;
    this.render.scene.add(terrain);

    if (params.get('outline') !== '0') {
      const outline = new THREE.Mesh(
        makeOutlineGeometry(terrain.geometry, 1.1),
        new THREE.MeshBasicMaterial({
          color: 0x233230,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      outline.renderOrder = 1;
      this.render.scene.add(outline);
    }

    this.render.scene.add(this.sky.mesh);
    if (params.get('backdrop') !== '0') {
      this.render.scene.add(this.backdrop.group);
    }

    this.props = buildProps(this.world);
    this.render.scene.add(this.props.root);

    this.motes = new Motes(this.world, this.world.seed);
    this.render.scene.add(this.motes.group);

    this.bike = new BikePhysics(this.world);
    this.bikeModel = new BikeModel();
    this.render.scene.add(this.bikeModel.root);

    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe0a0,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.targetBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.0, 100, 16, 1, true), this.beamMat);
    this.targetBeam.frustumCulled = false;
    this.targetBeam.renderOrder = 3;
    this.targetBeam.visible = false;
    this.render.scene.add(this.targetBeam);

    this.view = new ViewController(canvas);
    this.rig = new CameraRig(this.render.camera, this.view);
    this.rig.snap(this.bike);

    this.minimap = new Minimap(el<HTMLCanvasElement>('minimap'));
    this.debug = new DebugPanel(
      this.render.renderer,
      () =>
        `${this.bike.speed.toFixed(1)} m/s · pos (${this.bike.pos.x.toFixed(0)}, ${this.bike.pos
          .y.toFixed(1)}, ${this.bike.pos.z.toFixed(0)}) · yaw ${((this.bike.yaw * 180) / Math.PI).toFixed(
          0,
        )}° · ${this.bike.flying ? 'flying · ' : ''}${this.scoring.score} pts`,
    );

    this.bindUi();
    this.touchControls = this.touch ? new TouchControls(this.input, this.view) : null;
    this.applyBikeTransform(0);
    this.updateTitleBest();

    if (this.forceReveal) {
      for (const p of this.world.pavilions) {
        p.reveal = 1;
        p.revealR = 240;
      }
    }

    if (params.has('debug')) {
      (window as unknown as Record<string, unknown>).__qianli = {
        bike: this.bike,
        world: this.world,
        scoring: this.scoring,
        motes: this.motes,
        input: this.input,
        view: this.view,
      };
    }

    if (this.modelMode) {
      this.startRun();
      this.hud.hide();
      el('title').classList.add('hidden');
      el('finish').classList.add('hidden');
    } else if (params.has('autostart')) {
      this.startRun();
    }

    requestAnimationFrame(this.frame);
    setTimeout(() => el('loading').classList.add('gone'), 250);
    setTimeout(() => {
      el('loading').style.display = 'none';
    }, 1400);
  }

  private bindUi(): void {
    el<HTMLButtonElement>('enter-btn').addEventListener('click', () => this.startRun());
    el<HTMLButtonElement>('again-btn').addEventListener('click', () => this.startRun());
    el<HTMLButtonElement>('title-btn').addEventListener('click', () => this.backToTitle());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state !== 'title') this.backToTitle();
      if (e.code === 'KeyM') this.sfx.toggle();
    });
  }

  private updateTitleBest(): void {
    const best = bestScore();
    el('title-best').textContent = best > 0 ? `画中最佳 · ${best.toLocaleString()} 分` : '';
  }

  private startRun(): void {
    this.sfx.unlock();
    this.world.resetRegions();
    if (this.forceReveal) {
      for (const p of this.world.pavilions) {
        p.reveal = 1;
        p.revealR = 240;
      }
    }
    this.scoring.reset();
    this.motes.reset();
    this.view.reset();
    this.bike.reset(this.world.spawnX, this.world.spawnZ, 0);
    this.rig.snap(this.bike);
    this.rideTime = 0;
    this.accumulator = 0;
    this.waterCooldown = 0;
    this.waterHintShown = false;
    this.jumpTimes = [];
    this.state = 'playing';
    this.syncBasket();

    el('title').classList.add('hidden');
    el('finish').classList.add('hidden');
    this.hud.show();
    this.applyBikeTransform(0);
    if (this.touch) {
      try {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      } catch {
        /* fullscreen is optional */
      }
      this.hud.toast('左摇杆骑行 · 「跃」连点三次起飞 · 飞时按「降」', 5);
    } else {
      this.hud.toast('拾三色颜料 · 送到亭台设色 · 连按三次 Space 起飞', 5);
    }
  }

  private backToTitle(): void {
    this.state = 'title';
    this.world.resetRegions();
    this.scoring.reset();
    this.motes.reset();
    this.syncBasket();
    this.jumpTimes = [];
    this.waterCooldown = 0;
    this.targetBeam.visible = false;
    this.view.reset();
    this.touchControls?.releaseAll();
    this.input.resetTouch();
    this.hud.hide();
    el('finish').classList.add('hidden');
    el('title').classList.remove('hidden');
    this.bike.reset(this.world.spawnX, this.world.spawnZ, 0);
    this.rig.snap(this.bike);
    this.applyBikeTransform(0);
    this.updateTitleBest();
  }

  private finishRun(): void {
    if (this.state !== 'playing') return;
    this.state = 'finished';
    this.bike.speed = 0;
    this.bike.flying = false;
    this.bikeModel.setWings(false, 0);
    this.touchControls?.releaseAll();
    this.input.resetTouch();

    const completed = completedRegions(this.world);
    const entry: BestEntry = {
      score: this.scoring.score,
      time: this.rideTime,
      date: new Date().toISOString(),
    };
    const bests = saveBest(entry);

    el('finish-title').textContent = completed >= 5 ? '山河已设色' : '墨尚未干';
    el('finish-score').textContent = this.scoring.score.toLocaleString();
    el('finish-regions').textContent = `${completed} / 5`;
    el('finish-time').textContent = formatTime(this.rideTime);
    el('finish-best').textContent =
      bests.length > 0 ? `画中最佳 · ${bests[0].score.toLocaleString()} 分` : '';
    this.renderBestList(bests);

    this.sfx.finish();
    this.hud.hide();
    el('finish').classList.remove('hidden');
    this.updateTitleBest();
  }

  private renderBestList(list: BestEntry[]): void {
    const ol = el<HTMLOListElement>('best-list');
    ol.innerHTML = '';
    list.forEach((e, i) => {
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = `${i + 1}. ${formatTime(e.time)}`;
      const right = document.createElement('span');
      right.textContent = `${e.score.toLocaleString()} 分`;
      li.append(left, right);
      ol.append(li);
    });
  }

  private syncBasket(): void {
    const c = this.scoring.carried;
    let index = 0;
    let max = -1;
    for (let i = 0; i < 3; i++) {
      if (c[i] > max) {
        max = c[i];
        index = i;
      }
    }
    this.bikeModel.setCarried(this.scoring.total, PIGMENTS[index].color);
  }

  private tryDeliver(): void {
    if (this.scoring.total === 0) return;
    for (const p of this.world.pavilions) {
      if (p.deliveries >= DELIVERIES_PER_REGION) continue;
      const d = Math.hypot(this.bike.pos.x - p.x, this.bike.pos.z - p.z);
      if (d > DELIVER_RADIUS) continue;
      const result = this.scoring.bank(p);
      if (!result) return;
      p.deliveries++;
      this.sfx.deliver();
      const bonus = result.requested ? '（合色 +50%）' : '';
      this.hud.toast(`设色 · ${p.name}  +${result.points.toLocaleString()}${bonus}`, 3.2);
      if (p.deliveries >= DELIVERIES_PER_REGION) {
        this.hud.toast(`「${p.name}」山河已成色`, 3.6);
      }
      this.syncBasket();
      return;
    }
  }

  private applyBikeTransform(dt: number): void {
    this.bikeModel.setTransform(
      this.bike.pos.x,
      this.bike.pos.y,
      this.bike.pos.z,
      this.bike.yaw,
      this.bike.lean,
      this.bike.pitch,
    );
    this.bikeModel.update(dt, this.bike.speed, this.bike.steer);
  }

  private animateBeacons(time: number): void {
    const matrix = new THREE.Matrix4();
    this.world.pavilions.forEach((p, i) => {
      const base = this.props.beaconBaseY[i];
      const y = base + Math.sin(time * 1.6 + i * 1.7) * 0.22;
      matrix.makeTranslation(p.x, y, p.z);
      this.props.beacons.setMatrixAt(i, matrix);
    });
    this.props.beacons.instanceMatrix.needsUpdate = true;
  }

  private update(dt: number): void {
    if (this.modelMode) {
      this.updateModelMode(dt);
      return;
    }

    const input = this.input.sample();

    if (this.autoPilot && this.state === 'playing' && !this.input.anyPressed()) {
      const pavilion = this.nearestInfo();
      const mote = this.scoring.total < 3 ? this.motes.nearestActive(this.bike.pos.x, this.bike.pos.z) : null;
      let targetX: number | null = null;
      let targetZ = 0;
      let dist = 0;
      if (mote && (!pavilion || mote.dist < pavilion.dist + 25)) {
        targetX = mote.x;
        targetZ = mote.z;
        dist = mote.dist;
      } else if (pavilion) {
        const p = this.world.nearestPavilion(this.bike.pos.x, this.bike.pos.z, true).pavilion;
        targetX = p.x;
        targetZ = p.z;
        dist = pavilion.dist;
      }
      input.throttle = dist < 12 ? 0.2 : 1;
      input.boost = false;
      input.jump = false;
      input.steer =
        targetX === null
          ? 0
          : Math.max(
              -1,
              Math.min(1, -wrapAngle(Math.atan2(targetX - this.bike.pos.x, targetZ - this.bike.pos.z) - this.bike.yaw) * 1.6),
            );
    }

    if (this.state === 'playing') {
      this.rideTime += dt;
      this.waterCooldown = Math.max(0, this.waterCooldown - dt);
      this.accumulator += dt;

      if (input.jump) {
        const now = performance.now();
        this.jumpTimes.push(now);
        this.jumpTimes = this.jumpTimes.filter((t) => now - t <= 1200);
        if (this.jumpTimes.length >= 3) {
          this.jumpTimes = [];
          if (this.bike.flying) {
            this.bike.stopFlying();
            this.sfx.wings();
            this.hud.toast(this.touch ? '收翼 · 三连「跃」可再次展开' : '收翼 · 三连 Space 可再次展开', 3);
          } else {
            this.bike.startFlying();
            this.sfx.wings();
            this.hud.toast(
              this.touch ? '风起 · 「跃」上升 · 「降」俯冲 · 三连「跃」收翼' : '风起 · Space 上升 · S 下降 · 三连 Space 收翼',
              4.5,
            );
          }
        }
      }

      let first = true;
      while (this.accumulator >= FIXED_STEP) {
        const stepInput = first ? input : { ...input, jump: false };
        const ev = this.bike.update(FIXED_STEP, stepInput);
        first = false;
        this.accumulator -= FIXED_STEP;
        if (ev.water && this.waterCooldown <= 0) {
          this.waterCooldown = 5;
          this.sfx.splash();
          if (!this.waterHintShown) {
            this.waterHintShown = true;
            this.hud.toast('浅水会拖慢脚步,沿石桥过河更快', 3.6);
          }
        }
      }

      this.scoring.update(dt);
      updateRegions(this.world, dt);

      const picks = this.motes.update(
        dt,
        this.rideTime,
        this.bike.pos.x,
        this.bike.pos.y,
        this.bike.pos.z,
        this.scoring.free,
        this.render.camera.quaternion,
      );
      for (const type of picks) {
        this.scoring.add(type);
        this.sfx.pickup(type);
        this.hud.pickup(type);
      }
      if (picks.length > 0) this.syncBasket();

      this.tryDeliver();

      if (this.world.allRegionsComplete() || this.rideTime >= RUN_LIMIT) {
        this.finishRun();
      }

      if (this.state === 'playing') {
        const nearest = this.nearestInfo();
        const target = this.world.allRegionsComplete()
          ? null
          : this.world.nearestPavilion(this.bike.pos.x, this.bike.pos.z, true).pavilion;
        this.hud.update(dt, {
          carried: this.scoring.carried,
          combo: this.scoring.combo,
          score: this.scoring.score,
          time: this.rideTime,
          flying: this.bike.flying,
          nearest,
        });
        this.minimap.draw(
          dt,
          this.world,
          this.bike.pos.x,
          this.bike.pos.z,
          this.bike.yaw,
          target ? { x: target.x, z: target.z, color: PIGMENTS[target.pigment].color } : null,
        );
      }
    } else {
      updateRegions(this.world, dt);
    }

    this.applyBikeTransform(dt);
    this.bikeModel.setWings(this.bike.flying, this.rideTime * 10);
    this.rig.update(dt, this.bike, this.world);
    this.shanshui.sync(this.world, this.rideTime);
    this.backdrop.update(this.render.camera);
    this.sky.update(this.render.camera, this.rideTime);
    this.animateBeacons(this.rideTime);
    this.updateTargetBeam();
  }

  private updateModelMode(dt: number): void {
    this.rideTime += dt;
    this.bike.speed = 5.5;
    this.bike.steer = Math.sin(this.rideTime * 0.5) * 0.55;
    this.bike.lean = this.bike.steer * 0.1;
    this.bike.pitch = 0;
    this.applyBikeTransform(dt);
    this.bikeModel.setWings(this.modelWings, this.rideTime * 9);

    const angle = this.rideTime * 0.4 + 0.9;
    const radius = 3.15;
    const camera = this.render.camera;
    camera.position.set(
      this.bike.pos.x + Math.sin(angle) * radius,
      this.bike.pos.y + 1.5,
      this.bike.pos.z + Math.cos(angle) * radius,
    );
    camera.lookAt(this.bike.pos.x, this.bike.pos.y + 1.0, this.bike.pos.z);
    camera.fov = 40;
    camera.updateProjectionMatrix();

    this.shanshui.sync(this.world, this.rideTime);
    this.backdrop.update(camera);
    this.sky.update(camera, this.rideTime);
    this.targetBeam.visible = false;
    this.animateBeacons(this.rideTime);
  }

  private nearestInfo(): {
    name: string;
    dist: number;
    angle: number;
    short: string;
    color: number;
    deliverable: boolean;
  } | null {
    if (this.world.allRegionsComplete()) return null;
    const { pavilion, dist } = this.world.nearestPavilion(this.bike.pos.x, this.bike.pos.z, true);
    const dx = pavilion.x - this.bike.pos.x;
    const dz = pavilion.z - this.bike.pos.z;
    const pigment = PIGMENTS[pavilion.pigment];
    return {
      name: pavilion.name,
      dist,
      angle: wrapAngle(Math.atan2(dx, dz) - this.bike.yaw),
      short: pigment.short,
      color: pigment.color,
      deliverable: this.scoring.total > 0,
    };
  }

  private updateTargetBeam(): void {
    if (this.state !== 'playing' || this.world.allRegionsComplete()) {
      this.targetBeam.visible = false;
      return;
    }
    const { pavilion } = this.world.nearestPavilion(this.bike.pos.x, this.bike.pos.z, true);
    this.targetBeam.visible = true;
    this.targetBeam.position.set(pavilion.x, pavilion.padY + 50, pavilion.z);
    this.beamMat.opacity = 0.24 + 0.08 * (0.5 + 0.5 * Math.sin(this.rideTime * 2.2));
  }

  private frame = (): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.render.render();
    this.debug.update(dt);
  };
}
