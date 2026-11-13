import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uNear;
  uniform vec3 uFar;
  uniform vec3 uMist;
  uniform float uSeed;
  uniform float uBase;
  uniform float uAmp;

  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float ridged(vec2 p) {
    float n = noise(p);
    return 1.0 - abs(n * 2.0 - 1.0);
  }

  void main() {
    float a = vUv.x * 6.2831853;
    float ridge =
      uBase +
      (ridged(vec2(a * 6.0 + uSeed, 0.5)) - 0.45) * uAmp * 2.0 +
      (ridged(vec2(a * 16.0 + uSeed * 2.0, 1.7)) - 0.45) * uAmp * 0.9 +
      (noise(vec2(a * 38.0 + uSeed * 3.0, 3.2)) - 0.5) * uAmp * 0.45;

    float y = vUv.y;
    if (y > ridge) discard;

    float t = smoothstep(0.0, 1.0, y / max(ridge, 0.001));
    vec3 col = mix(uFar, uNear, t);

    float edge = smoothstep(ridge - 0.012, ridge, y);
    col = mix(col, vec3(0.10, 0.14, 0.15), edge * 0.75);

    float strata = (noise(vec2(a * 30.0, y * 18.0 + uSeed)) - 0.5) * 0.14;
    col *= 0.94 + strata;

    col = mix(col, uMist, smoothstep(0.35, 0.0, y) * 0.55);

    gl_FragColor = vec4(col, 1.0);
  }
`;

interface LayerConfig {
  radius: number;
  height: number;
  y: number;
  base: number;
  amp: number;
  seed: number;
  near: number;
  far: number;
}

const LAYERS: LayerConfig[] = [
  { radius: 2000, height: 900, y: 300, base: 0.38, amp: 0.20, seed: 11.3, near: 0x93a89d, far: 0xc4d1c6 },
  { radius: 1500, height: 750, y: 260, base: 0.42, amp: 0.20, seed: 27.7, near: 0x7f998e, far: 0xb5c8bb },
  { radius: 1050, height: 600, y: 220, base: 0.46, amp: 0.18, seed: 43.1, near: 0x64837a, far: 0x9cb3a6 },
];

const v3 = (hex: number): THREE.Vector3 => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};

export class Backdrop {
  readonly group = new THREE.Group();

  constructor() {
    const mist = new THREE.Vector3(0.90, 0.90, 0.85);
    LAYERS.forEach((cfg, i) => {
      const geo = new THREE.CylinderGeometry(cfg.radius, cfg.radius, cfg.height, 96, 1, true);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uNear: { value: v3(cfg.near) },
          uFar: { value: v3(cfg.far) },
          uMist: { value: mist },
          uSeed: { value: cfg.seed },
          uBase: { value: cfg.base },
          uAmp: { value: cfg.amp },
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = cfg.y;
      mesh.renderOrder = -10 + i;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    });
  }

  update(camera: THREE.Camera): void {
    this.group.position.set(camera.position.x, 0, camera.position.z);
  }
}
