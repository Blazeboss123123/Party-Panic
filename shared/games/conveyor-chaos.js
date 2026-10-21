// Conveyor Chaos — a factory race: belt lanes, sideways belts with spinning sweepers,
// pistons over a pit (or a narrow catwalk), switching belts and crushers.
import { slab, box, cyl, rampTo } from './kit.js';
import { startArea, finishArea } from './raceKit.js';

const METAL = { color: '#5b5f8a', top: '#8a8fb8', edge: '#2b1b5a' };
const BELT = '#3b3561';
export const SWITCH_PERIOD = 3.2;
export const PISTONS = [
  { z: 42.5, side: -1, phase: 0 }, { z: 45.5, side: 1, phase: 0.8 }, { z: 48.5, side: -1, phase: 1.6 },
  { z: 51.5, side: 1, phase: 0.4 },
];
export const SIDE_PISTONS = [{ z: 11, phase: 0 }, { z: 16, phase: 1.1 }, { z: 21, phase: 2.0 }];
export const CRUSHERS = [{ z: 74.5, phase: 0 }, { z: 78.5, phase: 1.0 }, { z: 82.5, phase: 2.0 }];
export const SWEEPERS = [{ z: 29.5, dir: 1 }];

// 0 retracted .. 1 extended; a punchy trapezoid cycle.
export function pistonExtend(t, phase, period = 2.4) {
  const u = (((t + phase) % period) + period) % period;
  if (u < 0.25) return u / 0.25;
  if (u < 0.7) return 1;
  if (u < 1.3) return 1 - (u - 0.7) / 0.6;
  return 0;
}

export function crusherHeight(t, phase) {
  const period = 3;
  const u = (((t + phase) % period) + period) % period;
  if (u < 0.9) return 4.2; // up, waiting
  if (u < 1.05) return 4.2 - ((u - 0.9) / 0.15) * 3.45; // slam
  if (u < 1.6) return 0.75; // down
  return 0.75 + ((u - 1.6) / 1.4) * 3.45; // rise
}

export function switchDir(t, i) {
  const k = Math.floor((t + i * 0.8) / SWITCH_PERIOD);
  return (k + i) % 2 === 0 ? 1 : -1;
}

export default {
  id: 'conveyor-chaos',
  move: { sprint: 'dash', dashSpeed: 13, dashDur: 0.18, dashCd: 1.4 },
  build({ n }) {
    const start = startArea(n, { topY: 0, look: { color: '#ffffff', top: '#ff8a3d', edge: '#2b1b5a' } });
    const colliders = [...start.colliders];
    // 1. Three lanes: fast forward belt, reverse belt, floor with side pistons.
    colliders.push(slab(2.95, 0, 15, 1.45, 8, 0.6, { conveyor: { x: 0, z: 4.5 }, look: { conveyor: true, color: BELT, arrow: '#3ddc97' } }));
    colliders.push(slab(0, 0, 15, 1.45, 8, 0.6, { conveyor: { x: 0, z: -3 }, look: { conveyor: true, color: BELT, arrow: '#ff2d55' } }));
    colliders.push(slab(-2.95, 0, 15, 1.45, 8, 0.6, { look: METAL }));
    for (const x of [-1.5, 1.5]) colliders.push(box(x, 0.18, 15, 0.08, 0.18, 8, { look: { color: '#ffd23f', round: 0.04 } }));
    for (const z of [10, 14, 18]) colliders.push(box(2.95, 0.45, z + 1.5, 0.55, 0.45, 0.55, { look: { color: '#c08457', top: '#e0a878', round: 0.08 }, tag: 'crate' }));
    colliders.push(box(-4.75, 1, 15, 0.3, 1, 8, { look: { stripes: ['#ffd23f', '#2b1b5a'] } }));
    for (const sp of SIDE_PISTONS) {
      colliders.push(box(-5.5, 0.6, sp.z, 1.1, 0.55, 0.9, {
        knock: 9, knockUp: 4, tag: 'piston', look: { color: '#ff8a3d', top: '#ffd9b8', round: 0.12 },
        motion: (t, gs, c) => { c.x = -5.5 + pistonExtend(t, sp.phase, 2.6) * 2.6; c.y = 0.6; c.z = sp.z; },
      }));
    }
    // 2. Sideways belt with low spinning sweepers, wall on the left, open edge on the right.
    colliders.push(slab(0, 0, 29.5, 4.5, 6.5, 0.6, { conveyor: { x: 2.2, z: 0 }, look: { conveyor: true, color: BELT, arrow: '#ffd23f' } }));
    colliders.push(box(-4.8, 0.8, 29.5, 0.3, 0.8, 6.5, { look: { stripes: ['#ffd23f', '#2b1b5a'] } }));
    for (const [x, z] of [[3.6, 25.2], [3.6, 34]]) colliders.push(cyl(x, 0.7, z, 0.45, 0.7, { look: { color: '#ffd23f', top: '#2b1b5a' } }));
    for (const sw of SWEEPERS) {
      colliders.push(cyl(0, 0.5, sw.z, 0.45, 0.5, { look: { color: '#2b1b5a' } }));
      colliders.push(box(0, 0.42, sw.z, 4.4, 0.22, 0.22, {
        knock: 9, knockUp: 5, tag: 'sweeper', look: { stripes: ['#ff2d55', '#ffffff'], round: 0.1 },
        motion: (t, gs, c) => { c.x = 0; c.y = 0.42; c.z = sw.z; c.yaw = sw.dir * t * 1.5; },
      }));
    }
    // 3. Pit: forward-belt walkway with pistons, or a narrow catwalk above.
    colliders.push(slab(0, 0, 47, 1.5, 8, 0.6, { conveyor: { x: 0, z: 2 }, look: { conveyor: true, color: BELT, arrow: '#3ddc97' } }));
    for (const pp of PISTONS) {
      colliders.push(box(pp.side * 3.6, 0.65, pp.z, 1.3, 0.6, 0.85, {
        knock: 10, knockUp: 4, tag: 'piston', look: { color: '#ff8a3d', top: '#ffd9b8', round: 0.12 },
        motion: (t, gs, c) => { c.x = pp.side * (3.6 - pistonExtend(t, pp.phase) * 2.55); c.y = 0.65; c.z = pp.z; },
      }));
      colliders.push(box(pp.side * 5.3, 0.65, pp.z, 0.4, 0.8, 1.0, { look: METAL }));
    }
    colliders.push(rampTo(3.9, 0, 37.2, 3.9, 2.6, 41, 0.65, 0.3, { look: { color: '#ffd23f', top: '#fff1a8' } }));
    colliders.push(slab(3.9, 2.6, 47, 0.62, 6, 0.3, { look: { color: '#ffd23f', top: '#fff1a8' }, tag: 'catwalk' }));
    colliders.push(rampTo(3.9, 2.6, 53, 3.9, 0, 56.8, 0.65, 0.3, { look: { color: '#ffd23f', top: '#fff1a8' } }));
    colliders.push(slab(0, 0, 37.5, 4.5, 1.5, 0.6, { look: METAL }));
    // 4. Switching belts
    for (let i = 0; i < 4; i++) {
      const z = 58 + i * 3.6;
      colliders.push(slab(0, 0, z, 4.5, 1.8, 0.6, {
        conveyor: { x: 2.6, z: 0 }, tag: 'switch',
        look: { conveyor: true, color: BELT, arrow: '#ff8a3d', dynamic: true },
        data: { i },
        motion: (t, gs, c) => { c.x = 0; c.y = -0.6; c.z = z; c.conveyor = { x: 2.6 * switchDir(t, i), z: 0 }; },
      }));
    }
    colliders.push(slab(0, 0, 55.6, 4.5, 0.6, 0.6, { look: METAL }));
    // 5. Crushers over a forward belt
    colliders.push(slab(0, 0, 77.4, 4.5, 6.6, 0.6, { conveyor: { x: 0, z: 2.2 }, look: { conveyor: true, color: BELT, arrow: '#3ddc97' } }));
    for (const cr of CRUSHERS) {
      colliders.push(box(0, 4.2, cr.z, 4.5, 0.6, 1.1, {
        knock: 9, knockUp: 2, tag: 'crusher', look: { stripes: ['#ffd23f', '#2b1b5a'], round: 0.15 },
        motion: (t, gs, c) => { c.x = 0; c.y = crusherHeight(t, cr.phase); c.z = cr.z; },
      }));
      for (const s of [-1, 1]) colliders.push(box(s * 4.9, 3, cr.z, 0.35, 3, 0.35, { look: METAL }));
    }
    const fin = finishArea({ z0: 84, z1: 95, topY: 0, hw: 5.5, archZ: 86.5, look: { color: '#ffffff', checker: ['#2b1b5a', '#ff8a3d'] } });
    colliders.push(...fin.colliders);
    const course = {
      path: [{ x: 0, z: -2 }, { x: 0, z: 23 }, { x: 0, z: 39 }, { x: 0, z: 55 }, { x: 0, z: 71 }, { x: 0, z: 88 }],
      checkpoints: [
        { x: 0, y: 0, z: -2 },
        { x: -2, y: 0, z: 23.6, spread: 0.6 },
        { x: 0, y: 0, z: 37.6, spread: 0.6 },
        { x: 0, y: 0, z: 55.6, spread: 0.9 },
        { x: 0, y: 0, z: 71.2, spread: 0.9 },
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
      camera: { mode: 'follow', yaw: 0, dist: 10, height: 7, ahead: 3.5, center: [0, 0, 45], introLook: [0, 0, 45], introDist: 60, introHeight: 38, shadow: 60, shadowCenter: [0, 0, 45] },
    };
  },
};
