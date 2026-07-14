// Shared toon-shading gradient — one instance reused across terrain, decor,
// and (as of the organic-model pass) characters/monsters/NPCs, so the whole
// scene reads as one consistent stylized look instead of a mix of unlit
// toon-shaded terrain and flat-lit meshStandardMaterial characters.

import * as THREE from "three";

export const toonGradient = (() => {
  const steps = [50, 110, 175, 220, 255];
  const data = new Uint8Array(steps.length * 4);
  for (let i = 0; i < steps.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = steps[i];
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
