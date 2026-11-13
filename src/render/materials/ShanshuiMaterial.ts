import * as THREE from 'three';
import type { World } from '../../world/World';

const vertexShader = /* glsl */ `
  attribute float aRegion;
  attribute float aValley;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vDist;
  varying float vRegion;
  varying float vValley;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * world;
    vViewDir = normalize(cameraPosition - world.xyz);
    vDist = -mv.z;
    vRegion = aRegion;
    vValley = aValley;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  #ifndef FBM_OCTAVES
  #define FBM_OCTAVES 4
  #endif

  uniform float uTime;
  uniform vec3 uSilk;
  uniform vec3 uInk;
  uniform vec3 uAzurite;
  uniform vec3 uMalachite;
  uniform vec3 uOchre;
  uniform vec3 uGold;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uRegionCenter[5];
  uniform float uReveal[5];
  uniform float uRevealR[5];

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vDist;
  varying float vRegion;
  varying float vValley;

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
    for (int i = 0; i < FBM_OCTAVES; i++) {
      s += a * noise(p);
      p = p * 2.03 + vec2(17.1, 9.7);
      a *= 0.5;
    }
    return s;
  }

  void main() {
    float slope = clamp(1.0 - vNormalW.y, 0.0, 1.0);
    float alt = smoothstep(2.0, 70.0, vWorld.y);
    vec2 wp = vWorld.xz;

    float mottle = fbm(wp * 0.025 + 3.7);
    float veins = fbm(wp * 0.09 + vWorld.y * 0.03);

    vec3 pigment = mix(uMalachite, uOchre, smoothstep(0.50, 0.88, mottle) * 0.45);
    pigment = mix(pigment, uAzurite, smoothstep(0.22, 0.70, slope) * 0.92);
    pigment = mix(pigment, uAzurite, smoothstep(30.0, 90.0, vWorld.y) * 0.72);
    pigment *= 0.84 + 0.28 * mottle;
    float speck = fbm(wp * 0.6);
    pigment *= 0.94 + 0.12 * speck;
    pigment = mix(pigment, uInk, smoothstep(0.55, 0.95, slope) * 0.22);

    float stroke = sin(wp.x * 0.55 + fbm(wp * 0.15 + 4.0) * 5.0);
    float strokeMask = 1.0 - smoothstep(0.2, 0.55, slope);
    pigment *= 1.0 + stroke * 0.035 * strokeMask;

    vec3 inkBase = mix(uSilk, uInk, clamp(0.26 + slope * 0.55 + alt * 0.22, 0.0, 0.88));
    inkBase = mix(inkBase, uInk, smoothstep(0.58, 0.92, veins) * 0.5);

    float wash = fbm(wp * 0.011 + 11.0);
    inkBase *= 0.8 + 0.34 * wash;
    inkBase *= 0.94 + 0.1 * stroke * strokeMask;

    float streak = fbm(vec2(wp.x * 0.05, vWorld.y * 0.14));
    inkBase = mix(inkBase, uInk, smoothstep(0.58, 0.9, streak) * slope * 0.6);

    float contourA = abs(fract(vWorld.y * 0.16 + fbm(wp * 0.03) * 1.4) - 0.5);
    float line = smoothstep(0.05, 0.0, contourA) * 0.62;
    #ifndef LOW_QUALITY
    float contourB = abs(fract(vWorld.y * 0.55 + fbm(wp * 0.09) * 2.2) - 0.5);
    line += smoothstep(0.03, 0.0, contourB) * 0.22;
    #endif
    line *= 1.0 - smoothstep(120.0, 320.0, vDist);
    inkBase = mix(inkBase, uInk, line * 0.8);
    pigment = mix(pigment, uInk, line * 0.45);

    float reveal = 0.0;
    for (int i = 0; i < 5; i++) {
      float d = distance(wp, uRegionCenter[i].xz);
      float warp = (fbm(wp * 0.03 + float(i) * 9.1) - 0.5) * 26.0;
      float radius = max(uRevealR[i], 1.0);
      float m = 1.0 - smoothstep(radius * 0.5, radius, d + warp);
      reveal = max(reveal, m * uReveal[i]);
    }

    vec3 col = mix(inkBase, pigment, reveal);

    vec3 lightDir = normalize(vec3(-0.55, 0.72, -0.35));
    float lam = 0.72 + 0.28 * max(dot(vNormalW, lightDir), 0.0);
    col *= lam;

    float rim = pow(1.0 - clamp(dot(vViewDir, vNormalW), 0.0, 1.0), 3.0) * smoothstep(20.0, 90.0, vWorld.y);
    col = mix(col, uGold, rim * 0.28);

    float mist = (1.0 - smoothstep(0.0, 7.0, vWorld.y)) * 0.18;
    col = mix(col, uSilk, mist);

    float fog = smoothstep(uFogNear, uFogFar, vDist);
    col = mix(col, uFogColor, fog);

    float grain = (hash21(wp * 220.0 + vWorld.y * 120.0) - 0.5) * 0.035;
    col += grain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class ShanshuiMaterial extends THREE.ShaderMaterial {
  constructor(lowQuality = false) {
    super({
      defines: lowQuality ? { FBM_OCTAVES: 2, LOW_QUALITY: 1 } : { FBM_OCTAVES: 4 },
      uniforms: {
        uTime: { value: 0 },
        uSilk: { value: new THREE.Vector3(0.91, 0.87, 0.78) },
        uInk: { value: new THREE.Vector3(0.10, 0.14, 0.15) },
        uAzurite: { value: new THREE.Vector3(0.22, 0.40, 0.62) },
        uMalachite: { value: new THREE.Vector3(0.31, 0.55, 0.41) },
        uOchre: { value: new THREE.Vector3(0.63, 0.38, 0.23) },
        uGold: { value: new THREE.Vector3(0.80, 0.64, 0.34) },
        uFogColor: { value: new THREE.Vector3(0.89, 0.90, 0.85) },
        uFogNear: { value: 160 },
        uFogFar: { value: 640 },
        uRegionCenter: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
        uReveal: { value: new Array(5).fill(0) as number[] },
        uRevealR: { value: new Array(5).fill(1) as number[] },
      },
      vertexShader,
      fragmentShader,
    });
  }

  sync(world: World, time: number): void {
    this.uniforms.uTime.value = time;
    const centers = this.uniforms.uRegionCenter.value as THREE.Vector3[];
    const reveal = this.uniforms.uReveal.value as number[];
    const radius = this.uniforms.uRevealR.value as number[];
    world.pavilions.forEach((p, i) => {
      centers[i].set(p.x, p.padY, p.z);
      reveal[i] = p.reveal;
      radius[i] = Math.max(p.revealR, 1);
    });
  }
}
