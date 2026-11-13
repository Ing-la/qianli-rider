import * as THREE from 'three';
import { centerX, WORLD_LENGTH } from './Path';
import { PLAYABLE_LATERAL, World, WORLD_HALF_WIDTH } from './World';
import { smoothstep } from '../core/MathUtils';

const Z_STEP = 4;
const X_STEP = 4;

export function buildTerrain(world: World): THREE.Mesh {
  const halfWidth = WORLD_HALF_WIDTH;
  const rows = Math.floor(WORLD_LENGTH / Z_STEP) + 1;
  const cols = Math.floor((halfWidth * 2) / X_STEP) + 1;
  const count = rows * cols;

  const positions = new Float32Array(count * 3);
  const regions = new Float32Array(count);
  const valleys = new Float32Array(count);
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    const z = r * Z_STEP;
    const cx = centerX(z);
    for (let c = 0; c < cols; c++) {
      const lat = -halfWidth + c * X_STEP;
      const x = cx + lat;
      const i = r * cols + c;
      positions[i * 3] = x;
      positions[i * 3 + 1] = world.heightAt(x, z);
      positions[i * 3 + 2] = z;

      let best = 0;
      let bestD = Infinity;
      for (const p of world.pavilions) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < bestD) {
          bestD = d;
          best = p.index;
        }
      }
      regions[i] = best;
      valleys[i] = 1 - smoothstep(20, PLAYABLE_LATERAL, Math.abs(lat));
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + cols;
      const cc = a + 1;
      const d = b + 1;
      indices.push(a, b, cc, cc, b, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aRegion', new THREE.BufferAttribute(regions, 1));
  geo.setAttribute('aValley', new THREE.BufferAttribute(valleys, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xe9e2ce,
    roughness: 0.98,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = false;
  return mesh;
}

/** Copy of a geometry inflated along its normals, for inverted-hull ink outlines. */
export function makeOutlineGeometry(source: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
  const geo = source.clone();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nrm.getX(i) * thickness,
      pos.getY(i) + nrm.getY(i) * thickness,
      pos.getZ(i) + nrm.getZ(i) * thickness,
    );
  }
  pos.needsUpdate = true;
  return geo;
}
