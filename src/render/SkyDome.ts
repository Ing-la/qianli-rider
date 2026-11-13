import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;
  uniform vec3 uGlow;

  varying vec3 vDir;

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

  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * noise(p);
      p = p * 2.03 + vec2(17.1, 9.7);
      a *= 0.5;
    }
    return s;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));

    float glow = pow(max(dot(dir, uSunDir), 0.0), 7.0);
    col = mix(col, uGlow, glow * 0.42);

    float ang = atan(dir.x, dir.z);
    float cloud = fbm(vec2(ang * 1.6 + uTime * 0.008, h * 6.0));
    float band = smoothstep(0.52, 0.78, cloud) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.55, 0.9, h));
    col = mix(col, vec3(0.96, 0.94, 0.87), band * 0.35);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHorizon: { value: new THREE.Vector3(0.93, 0.91, 0.83) },
        uZenith: { value: new THREE.Vector3(0.72, 0.81, 0.83) },
        uSunDir: { value: new THREE.Vector3(-0.5, 0.8, -0.32).normalize() },
        uGlow: { value: new THREE.Vector3(1.0, 0.94, 0.76) },
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 40, 20), this.material);
    this.mesh.renderOrder = -30;
    this.mesh.frustumCulled = false;
  }

  update(camera: THREE.Camera, time: number): void {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.uTime.value = time;
  }
}
