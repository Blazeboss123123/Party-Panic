// Bomb Relay — a walled courtyard with pillars and a raised centre. Pass the ticking bomb.
import { slab, box, cyl, rampTo, ringSpawns } from './kit.js';

export const HALF = 11;

export default {
  id: 'bomb-relay',
  move: { sprint: 'burst', sprintMult: 1.45, sprintDur: 1.0, sprintCd: 3.2 },
  build({ n }) {
    const colliders = [
      slab(0, 0, 0, HALF, HALF, 1, { look: { color: '#3b3561', checker: ['#ffd9b8', '#ffc493'] }, tag: 'floor' }),
    ];
    for (const [x, z, hx, hz] of [[0, -HALF - 0.4, HALF + 0.8, 0.4], [0, HALF + 0.4, HALF + 0.8, 0.4], [-HALF - 0.4, 0, 0.4, HALF], [HALF + 0.4, 0, 0.4, HALF]]) {
      colliders.push(box(x, 1.5, z, hx, 1.5, hz, { look: { color: '#2b1b5a', top: '#ff8a3d', round: 0.15 } }));
    }
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      colliders.push(cyl(x, 1.6, z, 1.0, 1.6, { look: { color: '#ff8a3d', top: '#ffd9b8' }, tag: 'pillar' }));
    }
    colliders.push(slab(0, 1.2, 0, 3, 3, 1.2, { look: { color: '#8b5cf6', top: '#d9c8ff', edge: '#2b1b5a' }, tag: 'centre' }));
    colliders.push(rampTo(3, 1.2, 0, 6.5, 0, 0, 1.5, 0.35, { look: { color: '#8b5cf6', top: '#d9c8ff' } }));
    colliders.push(rampTo(-3, 1.2, 0, -6.5, 0, 0, 1.5, 0.35, { look: { color: '#8b5cf6', top: '#d9c8ff' } }));
    for (const [x, z] of [[0, 8], [0, -8], [8.5, 2.5], [-8.5, -2.5]]) {
      colliders.push(box(x, 0.55, z, 0.55, 0.55, 0.55, { look: { color: '#c08457', top: '#e0a878', round: 0.08 }, tag: 'crate' }));
    }
    return {
      colliders,
      spawns: ringSpawns(n, 7.5, 0.05),
      killY: -10,
      gs: { bombs: [], next: -1 },
      data: {},
      camera: { mode: 'arena', center: [0, 0, 0.5], dist: 20, height: 23, follow: 0.18, shadow: 15 },
    };
  },
};
