import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class RenderSystem {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly maxPixelRatio: number;

  constructor(canvas: HTMLCanvasElement, maxPixelRatio = 2) {
    this.maxPixelRatio = maxPixelRatio;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.scene.background = new THREE.Color(0xe9e5d6);
    this.scene.fog = new THREE.Fog(0xe3e4d5, 170, 620);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      1800,
    );

    const hemi = new THREE.HemisphereLight(0xc9dde2, 0x8d7d5d, 1.35);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1cf, 2.1);
    sun.position.set(-70, 110, -40);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xa8c6cf, 0.55);
    fill.position.set(60, 40, 80);
    this.scene.add(fill);

    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
