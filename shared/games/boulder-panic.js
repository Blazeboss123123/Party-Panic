// Boulder Panic — a square stone arena; boulders roll across marked lanes.
import { slab, box, cyl, ringSpawns } from './kit.js';

export const HALF = 12;
export const LANES = [-9, -6, -3, 0, 3, 6, 9];
export const COVER = [[-5, -5], [5, 5], [-5, 5], [5, -5]];

// side 0: from -x towards +x, 1: from +x towards -x, 2: from -z towards +z, 3: from +z towards -z.
export function laneStart(side, lane, r) {
  const e = HALF + r + 0.5;
  switch (side) {
    case 0: return { x: -e, z: lane, vx: 1, vz: 0 };
    case 1: return { x: e, z: lane, vx: -1, vz: 0 };
    case 2: return { x: lane, z: -e, vx: 0, vz: 1 };
    default: return { x: lane, z: e, vx: 0, vz: -1 };
  }
}

export default {
  id: 'boulder-panic',
  move: {},
  build({ n }) {
    const colliders = [
      slab(0, 0, 0, HALF, HALF, 1.2, { look: { color: '#c08457', checker: ['#e9c79a', '#dcb27c'] }, tag: 'floor' }),
    ];
    // Launch ramps outside the arena so boulders roll in smoothly.
    for (const [x, z, hx, hz] of [[-HALF - 2, 0, 2, HALF], [HALF + 2, 0, 2, HALF], [0, -HALF - 2, HALF, 2], [0, HALF + 2, HALF, 2]]) {
      colliders.push(slab(x, 0, z, hx, hz, 0.6, { look: { color: '#8a5a3c', top: '#a8754f' }, tag: 'launch' }));
    }
    for (const [x, z] of COVER) {
      colliders.push(box(x, 1.1, z, 1.3, 1.1, 1.3, { look: { color: '#9aa3b8', top: '#c9d0de', round: 0.3 }, tag: 'cover' }));
    }
    colliders.push(cyl(0, 0.3, 0, 1.4, 0.3, { look: { color: '#ffd23f', top: '#fff1a8' }, tag: 'centre' }));
    return {
      colliders,
      spawns: ringSpawns(n, 3.2, 0.05),
      killY: -12,
      gs: { warn: [] },
      data: {},
      camera: { mode: 'arena', center: [0, 0, 0.5], dist: 25, height: 24, follow: 0.18, shadow: 20 },
    };
  },
};
