// Grab Everything — a multi-level playground with gems on every level.
import { slab, box, cyl, rampTo, ringSpawns } from './kit.js';

export const GEM_TYPES = [
  { v: 1, color: '#3ddc97', name: 'green' },
  { v: 3, color: '#4da3ff', name: 'blue' },
  { v: 5, color: '#b14dff', name: 'purple' },
];
const HALF = 16;
const TOWERS = [[-11, -11], [11, -11], [-11, 11], [11, 11]];
const TOWER_TOP = 4.5;

export default {
  id: 'grab-everything',
  move: {},
  build({ n }) {
    const colliders = [
      slab(0, 0, 0, HALF, HALF, 1, { look: { color: '#5fbf3a', top: '#a8e063' }, tag: 'ground' }),
    ];
    // Fence
    for (const [x, z, hx, hz] of [[0, -HALF - 0.3, HALF + 0.6, 0.3], [0, HALF + 0.3, HALF + 0.6, 0.3], [-HALF - 0.3, 0, 0.3, HALF], [HALF + 0.3, 0, 0.3, HALF]]) {
      colliders.push(box(x, 0.7, z, hx, 0.7, hz, { look: { color: '#ffffff', top: '#ff5da2', round: 0.15 } }));
    }
    // Central platform with ramps on two sides and a bounce pad
    colliders.push(slab(0, 2.4, 0, 4, 4, 1.2, { look: { color: '#8b5cf6', top: '#d9c8ff', edge: '#2b1b5a' }, tag: 'centre' }));
    colliders.push(rampTo(4, 2.4, 0, 9, 0, 0, 1.8, 0.4, { look: { color: '#8b5cf6', top: '#d9c8ff' } }));
    colliders.push(rampTo(-4, 2.4, 0, -9, 0, 0, 1.8, 0.4, { look: { color: '#8b5cf6', top: '#d9c8ff' } }));
    // Corner towers with stair blocks and bounce pads
    for (const [tx, tz] of TOWERS) {
      colliders.push(box(tx, TOWER_TOP / 2, tz, 2.2, TOWER_TOP / 2, 2.2, { look: { color: '#ff8a3d', top: '#ffd9b8', round: 0.2 }, tag: 'tower' }));
      const sx = -Math.sign(tx), sz = -Math.sign(tz);
      colliders.push(box(tx + sx * 3.4, 0.75, tz, 1.2, 0.75, 1.4, { look: { color: '#ffd23f', top: '#fff1a8', round: 0.15 }, tag: 'step' }));
      colliders.push(box(tx + sx * 3.4, 1.5 + 0.75, tz + sz * 2.6, 1.2, 0.75, 1.2, { look: { color: '#ffd23f', top: '#fff1a8', round: 0.15 }, tag: 'step' }));
      colliders.push(cyl(tx, 0.15, tz + sz * 4.2, 1.0, 0.15, { bounce: 17, look: { color: '#ff5da2', top: '#ffffff' }, tag: 'bounce' }));
    }
    // Crates
    const crates = [[-6, 6], [6, -6], [-2, -9], [2, 9], [9, 4], [-9, -4], [-13, 2], [13, -2]];
    for (const [x, z] of crates) colliders.push(box(x, 0.6, z, 0.6, 0.6, 0.6, { look: { color: '#c08457', top: '#e0a878', round: 0.08 }, tag: 'crate' }));

    // Gem spawn points with their class (0 ground, 1 centre, 2 tower)
    const points = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = 6.5 + (i % 4) * 2.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (crates.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 1.5)) continue;
      if (TOWERS.some(([cx, cz]) => Math.abs(cx - x) < 3.2 && Math.abs(cz - z) < 3.2)) continue;
      if (Math.abs(z) < 2.2 && Math.abs(x) < 9.5) continue; // ramps
      points.push({ x, y: 0.7, z, cls: 0 });
    }
    for (const [x, z] of [[0, 0], [-2.5, -2.5], [2.5, 2.5], [-2.5, 2.5], [2.5, -2.5]]) points.push({ x, y: 3.1, z, cls: 1 });
    for (const [tx, tz] of TOWERS) points.push({ x: tx, y: TOWER_TOP + 0.7, z: tz, cls: 2 });
    const boostPoints = [[0, 12], [0, -12], [12, 0], [-12, 0]].map(([x, z]) => ({ x, y: 0.8, z }));
    return {
      colliders,
      spawns: ringSpawns(n, 7.2, 0.05),
      killY: -15,
      gs: {},
      data: { points, boostPoints },
      camera: { mode: 'iso', center: [0, 0, 0], dist: 7.5, height: 21, follow: 0.6, yaw: 0, shadow: 22 },
    };
  },
};
