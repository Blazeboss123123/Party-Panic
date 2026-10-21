// Don't Drop It — carry your wobbly cake through bumpers, a sweeper and moving platforms to
// your own delivery pad.
import { slab, box, cyl, ramp, disc } from './kit.js';
import { startArea } from './raceKit.js';

const PATH_LOOK = { color: '#ff8a3d', top: '#ffe2c9', edge: '#2b1b5a' };
const DARK = { color: '#8b5cf6', top: '#d9c8ff', edge: '#2b1b5a' };
export const BUMPERS = [[-3, 18], [0, 20.5], [3, 18], [-4.5, 23], [1.5, 23.4], [4.5, 21.2], [-2.2, 74], [2.6, 76]];
export const SWEEP = { x: 0, z: 35, len: 6.0, speed: 1.05 };
export const MOVERS = [{ x: -2.6, phase: 0 }, { x: 2.6, phase: Math.PI }];
export const PAD_Z = 81;
export const CARRY = { speed: 0.74, jump: 0.86, accel: 0.55 };

export function moverZ(t, phase) {
  return 51 + 4 * Math.sin(t * 0.85 + phase);
}

export function padX(slot, n) {
  return (slot - (n - 1) / 2) * 2.35;
}

export default {
  id: 'dont-drop-it',
  move: { sprint: 'dash', dashSpeed: 14, dashDur: 0.2, dashCd: 1.8 },
  build({ n }) {
    const start = startArea(n, { topY: 0 });
    const colliders = [...start.colliders];
    // Low cake mats (low enough to walk over) in front of each spawn.
    const pedestals = start.spawns.map((sp) => ({ x: sp.x, y: 0.12, z: 1.6 }));
    for (const pd of pedestals) colliders.push(cyl(pd.x, 0.06, pd.z, 0.62, 0.06, { look: { color: '#ffffff', top: '#ff5da2' }, tag: 'pedestal' }));
    // A: ramp up and bumper field
    colliders.push(slab(0, 0, 8, 6, 1, 1, { look: PATH_LOOK }));
    colliders.push(ramp(0, 9, 0, 15, 2, 6, 0.5, { look: PATH_LOOK }));
    colliders.push(slab(0, 2, 20, 6, 5, 1, { look: PATH_LOOK }));
    for (const [x, z] of BUMPERS.slice(0, 6)) {
      colliders.push(cyl(x, 2.7, z, 0.6, 0.7, { knock: 9, knockUp: 4, look: { color: '#1fc8c1', top: '#ffffff' }, tag: 'bumper' }));
    }
    // B: sweeper platform plus a narrow safe ledge
    colliders.push(slab(0, 2, 35, 6, 10, 1, { look: DARK }));
    colliders.push(slab(7.25, 2, 35, 0.65, 10, 0.6, { look: { color: '#ff5da2', top: '#ffc2dc' }, tag: 'ledge' }));
    colliders.push(cyl(SWEEP.x, 2.6, SWEEP.z, 0.7, 0.6, { look: { color: '#2b1b5a' } }));
    colliders.push(box(SWEEP.x, 2.55, SWEEP.z, SWEEP.len, 0.3, 0.3, {
      knock: 11, knockUp: 6, tag: 'sweeper',
      look: { stripes: ['#ffd23f', '#2b1b5a'], round: 0.12 },
      motion: (t, gs, c) => { c.x = SWEEP.x; c.y = 2.55; c.z = SWEEP.z; c.yaw = t * SWEEP.speed; },
    }));
    // C: moving platforms over a gap, or a thin beam
    for (const m of MOVERS) {
      colliders.push(box(m.x, 1.5, 51, 2.2, 0.5, 2, {
        look: { color: '#ffd23f', top: '#fff1a8', edge: '#2b1b5a' }, tag: 'mover',
        motion: (t, gs, c) => { c.x = m.x; c.y = 1.5; c.z = moverZ(t, m.phase); },
      }));
    }
    colliders.push(slab(6.2, 2, 51, 0.45, 6, 0.5, { look: { color: '#ff5da2', top: '#ffc2dc' }, tag: 'beam' }));
    // D: landing, ramp down, delivery yard
    colliders.push(slab(0, 2, 59.5, 6.6, 2.5, 1, { look: PATH_LOOK }));
    colliders.push(ramp(0, 62, 2, 68, 0, 6, 0.5, { look: PATH_LOOK }));
    colliders.push(slab(0, 0, 77, 9.6, 9, 1, { look: { color: '#3ddc97', top: '#c9f7e2', edge: '#2b1b5a' }, tag: 'yard' }));
    for (const [x, z] of BUMPERS.slice(6)) {
      colliders.push(cyl(x, 0.7, z, 0.6, 0.7, { knock: 9, knockUp: 4, look: { color: '#1fc8c1', top: '#ffffff' }, tag: 'bumper' }));
    }
    colliders.push(box(0, 1.2, 86.4, 9.6, 1.2, 0.4, { look: { color: '#2b1b5a', round: 0.2 } }));
    const pads = [];
    for (let s = 0; s < n; s++) {
      const x = padX(s, n);
      pads.push({ x, y: 0.2, z: PAD_Z, r: 1.05 });
      colliders.push(disc(x, 0.2, PAD_Z, 1.05, 0.2, { look: { hidden: true }, tag: 'pad' }));
    }
    const course = {
      path: [{ x: 0, z: -2 }, { x: 0, z: 15 }, { x: 0, z: 25 }, { x: 0, z: 45 }, { x: 0, z: 57 }, { x: 0, z: 68 }, { x: 0, z: PAD_Z }],
      checkpoints: [
        { x: 0, y: 0, z: -2 },
        { x: 0, y: 2, z: 16 },
        { x: 0, y: 2, z: 26.2 },
        { x: 0, y: 2, z: 58.4 },
        { x: 0, y: 0, z: 69.5 },
      ],
      finish: null,
    };
    return {
      colliders,
      spawns: start.spawns,
      killY: -10,
      gs: {},
      course,
      data: { pedestals, pads },
      camera: { mode: 'follow', yaw: 0, dist: 10.5, height: 7, ahead: 3.5, center: [0, 0, 40], introLook: [0, 0, 40], introDist: 60, introHeight: 36, shadow: 60, shadowCenter: [0, 0, 42] },
    };
  },
};
