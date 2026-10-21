// Shadow Sprint — a dark neon course: laser gates, sweeping beams, a laser rotor, timed doors
// and a laser floor. Touching an active laser sends you back to your checkpoint.
import { slab, box, cyl } from './kit.js';
import { startArea, finishArea } from './raceKit.js';

const FLOOR = { color: '#1a1033', top: '#2b1b5a', edge: '#00f5d4' };
export const GATES = [{ z: 10, ph: 0 }, { z: 14, ph: 0.6 }, { z: 18, ph: 1.2 }, { z: 22, ph: 1.8 }];
export const BEAMS = [{ ph: 0 }, { ph: Math.PI }];
export const ROTOR = { x: 0, z: 49, len: 4.2, speed: 1.55 };
export const DOORS = [
  { x: -2.25, z: 61, period: 3.0, ph: 0 }, { x: -2.25, z: 68, period: 3.0, ph: 1.5 },
  { x: 2.25, z: 61, period: 2.2, ph: 0.4 }, { x: 2.25, z: 68, period: 2.2, ph: 1.5 },
];
export const TILES = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) TILES.push({ i, j, x: (i - 1) * 2.7, z: 75.4 + j * 2.7 });
export const BOOSTS = [{ x: 3.6, z: 33 }, { x: -3.6, z: 45 }, { x: 0, z: 82.2 }];
export const WARN = 0.45;
const GATE_PERIOD = 2.4;

// Laser gate i is lethal while on; the second return value is "about to turn on".
export function gateState(g, t) {
  const u = (((t + g.ph) % GATE_PERIOD) + GATE_PERIOD) % GATE_PERIOD;
  return { on: u < 1.2, warn: u >= GATE_PERIOD - WARN };
}
export function beamZ(b, t) {
  return 33 + Math.sin(t * 0.85 + b.ph) * 6;
}
export function rotorAngle(t) {
  return t * ROTOR.speed;
}
export function doorOpen(d, t) {
  const u = (((t + d.ph) % d.period) + d.period) % d.period;
  return u < d.period * 0.45; // open part of the cycle
}
export function doorHeight(d, t) {
  const u = (((t + d.ph) % d.period) + d.period) % d.period;
  const open = d.period * 0.45;
  if (u < open) return 3.2;
  if (u < open + 0.25) return 3.2 - ((u - open) / 0.25) * 2.0;
  if (u > d.period - 0.25) return 1.2 + ((u - (d.period - 0.25)) / 0.25) * 2.0;
  return 1.2;
}
// A two-row band of hot tiles sweeps towards the finish, then there is a short gap.
// Run in behind it, but don't catch it up.
export function tileHot(tile, t) {
  const k = Math.floor(t / 0.55);
  const row = ((k % 9) + 9) % 9;
  return tile.j === row || tile.j === row - 1;
}
export function tileWarn(tile, t) {
  const next = t + WARN;
  return !tileHot(tile, t) && tileHot(tile, next);
}

export default {
  id: 'shadow-sprint',
  move: {},
  build({ n }) {
    const start = startArea(n, { topY: 0, look: { color: '#1a1033', top: '#2b1b5a', edge: '#f15bb5' } });
    const colliders = [...start.colliders];
    colliders.push(slab(0, 0, 16, 4.2, 9, 1, { look: FLOOR }));
    for (const g of GATES) {
      for (const s of [-1, 1]) colliders.push(box(s * 4.4, 1.4, g.z, 0.25, 1.4, 0.25, { look: { color: '#2b1b5a', top: '#00f5d4' } }));
    }
    colliders.push(slab(0, 0, 33, 4.2, 8, 1, { look: FLOOR }));
    colliders.push(slab(0, 0, 49, 4.2, 8, 1, { look: FLOOR }));
    colliders.push(cyl(ROTOR.x, 1.2, ROTOR.z, 0.6, 1.2, { look: { color: '#2b1b5a', top: '#f15bb5' } }));
    colliders.push(slab(0, 0, 65, 4.6, 8, 1, { look: FLOOR }));
    colliders.push(box(0, 1.6, 65, 0.3, 1.6, 6.4, { look: { color: '#2b1b5a', top: '#f15bb5', round: 0.1 } }));
    for (const d of DOORS) {
      colliders.push(box(d.x, 1.2, d.z, 2.0, 1.2, 0.3, {
        tag: 'door', look: { color: '#f15bb5', top: '#ffffff', emissive: '#f15bb5', emissiveIntensity: 0.5, round: 0.08 },
        motion: (t, gs, c) => { c.x = d.x; c.y = doorHeight(d, t); c.z = d.z; },
      }));
    }
    for (const d of DOORS) for (const s of [-1, 1]) colliders.push(box(d.x + s * 2.15, 1.6, d.z, 0.15, 1.6, 0.35, { look: { color: '#2b1b5a', top: '#00f5d4' } }));
    colliders.push(slab(0, 0, 81, 4.2, 8, 1, { look: { color: '#1a1033', top: '#1a1033', edge: '#00f5d4' } }));
    const fin = finishArea({ z0: 89, z1: 100, topY: 0, hw: 5.5, archZ: 91.5, look: { color: '#1a1033', checker: ['#00f5d4', '#1a1033'] } });
    colliders.push(...fin.colliders);
    // Side guard posts so the course reads in the dark
    const course = {
      path: [{ x: 0, z: -2 }, { x: 0, z: 25 }, { x: 0, z: 41 }, { x: 0, z: 57 }, { x: 0, z: 73 }, { x: 0, z: 93 }],
      checkpoints: [
        { x: 0, y: 0, z: -2 },
        { x: 0, y: 0, z: 25.4, spread: 0.9 },
        { x: 0, y: 0, z: 41.2, spread: 0.9 },
        { x: 0, y: 0, z: 56.6, spread: 0.9 },
        { x: 0, y: 0, z: 72.4, spread: 0.9 },
      ],
      finish: fin.finish,
    };
    return {
      colliders,
      spawns: start.spawns,
      killY: -10,
      gs: {},
      course,
      data: {},
      camera: { mode: 'follow', yaw: 0, dist: 10, height: 7, ahead: 3.5, center: [0, 0, 45], introLook: [0, 0, 45], introDist: 58, introHeight: 36, shadow: 60, shadowCenter: [0, 0, 45] },
    };
  },
};
