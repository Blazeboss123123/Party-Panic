// The Floor Is Gone — two layers of candy tiles that crumble after being touched.
import { slab, ringSpawns } from './kit.js';

export const GRID = 10;
export const PITCH = 2.4;
export const TILE_HALF = 1.12;
export const LAYERS = [0, -7];
export const WARN_TIME = 0.95;

export function tileIndex(layer, i, j) {
  return layer * GRID * GRID + i * GRID + j;
}

export default {
  id: 'floor-gone',
  move: { jump: 10.5 },
  build({ n }) {
    const colliders = [];
    const tiles = [];
    for (let layer = 0; layer < LAYERS.length; layer++) {
      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const x = (i - (GRID - 1) / 2) * PITCH;
          const z = (j - (GRID - 1) / 2) * PITCH;
          const ring = Math.floor(Math.max(Math.abs(i - (GRID - 1) / 2), Math.abs(j - (GRID - 1) / 2)));
          const idx = colliders.length;
          colliders.push(slab(x, LAYERS[layer], z, TILE_HALF, TILE_HALF, 0.45, {
            tag: 'tile',
            look: { kind: 'tile', layer, checker: (i + j) % 2 },
            data: { tile: tiles.length },
          }));
          tiles.push({ c: idx, layer, i, j, ring, x, z });
        }
      }
    }
    return {
      colliders,
      spawns: ringSpawns(n, 6.5, 0.05),
      killY: -18,
      gs: { s: '0'.repeat(tiles.length) },
      data: { tiles },
      camera: { mode: 'arena', center: [0, -2, 0], dist: 30, height: 25, follow: 0.3 },
    };
  },
  // Apply tile states (0 solid, 1 warning, 2 fallen) to the collision world.
  sync(world, gs, layout) {
    const s = gs.s;
    const tiles = layout.data.tiles;
    for (let k = 0; k < tiles.length; k++) {
      world.colliders[tiles[k].c].enabled = s.charCodeAt(k) !== 50; // '2'
    }
  },
};
