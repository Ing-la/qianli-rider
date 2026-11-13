import * as THREE from 'three';
import { WORLD_HALF, World } from './World';

export function buildTerrain(world: World, step = 6): THREE.Mesh {
  const perAxis = Math.floor((WORLD_HALF * 2) / step) + 1;
  const count = perAxis * perAxis;

  const positions = new Float32Array(count * 3);
  const regions = new Float32Array(count);
  const valleys = new Float32Array(count);
  const indices: number[] = [];

  for (let iz = 0; iz < perAxis; iz++) {
    const z = -WORLD_HALF + iz * step;
    for (let ix = 0; ix < perAxis; ix++) {
      const x = -WORLD_HALF + ix * step;
      const i = iz * perAxis + ix;
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
      valleys[i] = 1;
    }
  }

  for (let iz = 0; iz < perAxis - 1; iz++) {
    for (let ix = 0; ix < perAxis - 1; ix++) {
      const a = iz * perAxis + ix;
      const b = a + perAxis;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, c, b, d);
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
