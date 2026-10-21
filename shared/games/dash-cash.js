// Dash for Cash — a sunny obstacle course with ramps, gaps, sweeping arms, pendulums,
// a split route and a turntable. Coins (per player) only break ties.
import { slab, box, cyl, ramp, disc } from './kit.js';
import { startArea, finishArea } from './raceKit.js';

const MINT = { color: '#3ddc97', top: '#b8f5d9', edge: '#2b1b5a' };
const LEMON = { color: '#ffb000', top: '#ffe58a', edge: '#2b1b5a' };
const BEAM = { color: '#ff5da2', top: '#ffc2dc' };
const STONE = { color: '#8b5cf6', top: '#d9c8ff' };

export const ARM_PIVOTS = [{ x: 0, z: 45, dir: 1, phase: 0 }, { x: 0, z: 53.4, dir: -1, phase: 1.3 }];
export const PENDULUMS = [{ z: 67, phase: 0 }, { z: 70.5, phase: 1.6 }, { z: 74, phase: 3.2 }];
export const PIVOT_Y = 7.2;
export const ARM_LEN = 5.6;

export function pendulumAngle(t, phase) {
  return 1.15 * Math.sin(t * 1.9 + phase);
}

export default {
  id: 'dash-cash',
  move: { sprint: 'burst' },
  build({ n }) {
    const start = startArea(n, { topY: 0 });
    const colliders = [...start.colliders];
    // Approach and ramp up
    colliders.push(slab(0, 0, 8, 4.5, 1, 1, { look: MINT }));
    colliders.push(ramp(0, 9, 0, 17, 2.5, 4.5, 0.5, { look: MINT }));
    colliders.push(slab(0, 2.5, 19.5, 4.5, 2.5, 0.8, { look: MINT }));
    // Gap jumps on the left, a narrow coin beam on the right
    colliders.push(slab(-1.2, 2.5, 26.75, 3.3, 2.25, 0.8, { look: LEMON }));
    colliders.push(slab(-1.2, 2.5, 33.75, 3.3, 2.25, 0.8, { look: LEMON }));
    colliders.push(slab(4.0, 2.5, 30.25, 0.42, 8.25, 0.5, { look: BEAM, tag: 'beam' }));
    // Arm zone
    colliders.push(slab(0, 2.5, 48.25, 5.1, 9.75, 0.8, { look: MINT }));
    for (const a of ARM_PIVOTS) {
      colliders.push(cyl(a.x, 3.3, a.z, 0.55, 0.8, { look: { color: '#2b1b5a' } }));
      colliders.push(box(0, 3.15, a.z, 4.7, 0.3, 0.32, {
        knock: 12, knockUp: 6, tag: 'arm',
        look: { stripes: ['#ff5da2', '#2b1b5a'], round: 0.12 },
        motion: (t, gs, c) => { c.x = a.x; c.y = 3.15; c.z = a.z; c.yaw = a.dir * (t * 1.25 + a.phase); },
      }));
    }
    // Down ramp and pendulums
    colliders.push(ramp(0, 58, 2.5, 64, 0, 4.5, 0.5, { look: MINT }));
    colliders.push(slab(0, 0, 71, 4.5, 7, 1, { look: LEMON }));
    for (const pd of PENDULUMS) {
      colliders.push(box(0, PIVOT_Y + 0.4, pd.z, 5, 0.25, 0.25, { solid: false, look: { color: '#2b1b5a', round: 0.1 } }));
      colliders.push(box(0, PIVOT_Y - ARM_LEN, pd.z, 1.1, 0.85, 0.65, {
        knock: 13, knockUp: 7, tag: 'hammer',
        look: { color: '#e8364f', top: '#ffffff', round: 0.25 },
        motion: (t, gs, c) => {
          const th = pendulumAngle(t, pd.phase);
          c.x = Math.sin(th) * ARM_LEN;
          c.y = PIVOT_Y - Math.cos(th) * ARM_LEN;
          c.z = pd.z;
          c.roll = th;
        },
      }));
      colliders.push(box(0, PIVOT_Y - ARM_LEN / 2, pd.z, 0.08, ARM_LEN / 2, 0.08, {
        solid: false, look: { color: '#5b5f8a', round: 0 },
        motion: (t, gs, c) => {
          const th = pendulumAngle(t, pd.phase);
          c.x = Math.sin(th) * ARM_LEN / 2;
          c.y = PIVOT_Y - Math.cos(th) * ARM_LEN / 2;
          c.z = pd.z;
          c.roll = th;
        },
      }));
    }
    // Split: safe hill on the left, stepping stones on the right
    colliders.push(ramp(-3.6, 78, 0, 84, 2, 2, 0.5, { look: MINT }));
    colliders.push(slab(-3.6, 2, 87, 2, 3, 0.8, { look: MINT }));
    colliders.push(ramp(-3.6, 90, 2, 96, 0, 2, 0.5, { look: MINT }));
    const stones = [[3.2, 80.2], [4.3, 83.2], [3.0, 86.2], [4.2, 89.2], [3.1, 92.2], [3.8, 95.0]];
    for (const [x, z] of stones) colliders.push(disc(x, 0, z, 0.95, 0.6, { look: STONE, tag: 'stone' }));
    // Turntable
    colliders.push(slab(0, 0, 96.6, 5.5, 1.6, 1, { look: MINT }));
    colliders.push(disc(0, 0, 104.4, 6.2, 0.6, {
      look: { color: '#ff8a3d', top: '#ffd9b8', segments: 48 },
      tag: 'turntable',
      motion: (t, gs, c) => { c.x = 0; c.y = -0.6; c.z = 104.4; c.yaw = t * 0.55; },
    }));
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2;
      colliders.push(box(0, 0.55, 104.4, 1.6, 0.55, 0.3, {
        look: { color: '#2b1b5a', round: 0.12 },
        motion: (t, gs, c) => {
          const a = t * 0.55 + a0;
          c.x = Math.sin(a) * 3.6;
          c.z = 104.4 + Math.cos(a) * 3.6;
          c.y = 0.55;
          c.yaw = a + Math.PI / 2;
        },
      }));
    }
    const fin = finishArea({ z0: 110.6, z1: 121, topY: 0, hw: 6.5, archZ: 113.5 });
    colliders.push(...fin.colliders);

    // Coins: [x, y, z]. Riskier lines carry more.
    const coins = [];
    const add = (x, y, z) => coins.push({ id: coins.length, x, y: y + 0.9, z });
    for (let z = 10; z <= 16; z += 3) add(0, (z - 9) * (2.5 / 8), z);
    for (let z = 23; z <= 37.5; z += 2.4) add(4.0, 2.5, z); // beam
    for (let z = 40; z <= 57; z += 2.8) add(z % 2 ? 4.7 : -4.7, 2.5, z); // arm-zone edges
    for (const [x, z] of stones) add(x, 0, z);
    add(-3.6, 2, 85); add(-3.6, 2, 89);
    for (let k = 0; k < 4; k++) add(Math.sin(k * 1.6) * 3, 0, 101 + k * 2.2);

    const course = {
      path: [{ x: 0, z: -2 }, { x: 0, z: 17 }, { x: -1.2, z: 22 }, { x: -1.2, z: 38.5 }, { x: 0, z: 58 }, { x: 0, z: 78 }, { x: 0, z: 96 }, { x: 0, z: 104 }, { x: 0, z: 115 }],
      checkpoints: [
        { x: 0, y: 0, z: -2 },
        { x: -1, y: 2.5, z: 18.5 },
        { x: 0, y: 2.5, z: 39.6 },
        { x: 0, y: 0, z: 65.2, spread: 1 },
        { x: 0, y: 0, z: 77.2 },
        { x: 0, y: 0, z: 97 },
      ],
      finish: fin.finish,
    };
    return {
      colliders,
      spawns: start.spawns,
      killY: -12,
      gs: {},
      course,
      data: { coins, stones },
      camera: { mode: 'follow', yaw: 0, dist: 10.5, height: 6.5, ahead: 4, center: [0, 0, 50], introLook: [0, 0, 55], introDist: 70, introHeight: 40, shadow: 70, shadowCenter: [0, 0, 55] },
    };
  },
};
