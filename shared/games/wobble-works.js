// Wobble Works — five tilting platforms over the abyss. They lean towards the players'
// weight, take scheduled big tilts, and two outer platforms eventually fall.
import { box, ringSpawns } from './kit.js';
import { eulerMatrix, clamp } from '../math.js';

export const HALF = 3.7;
export const THICK = 0.4;
export const MAX_TILT = 0.42;
// Tilts get steeper late in the round (24 degrees up to 32 degrees).
export function maxTilt(t) {
  return MAX_TILT + 0.14 * clamp((t - 45) / 25, 0, 1);
}
export const CENTRES = [[0, 0], [8.6, 0], [-8.6, 0], [0, 8.6], [0, -8.6]];
const m = new Float64Array(9);

// Platform tilt at time t: last authoritative angles extrapolated with angular velocity.
export function tiltAt(gs, i, t) {
  const p = gs.p[i];
  const dt = Math.max(0, Math.min(0.25, t - p[4]));
  const mt = maxTilt(t);
  return [clamp(p[0] + p[2] * dt, -mt, mt), clamp(p[1] + p[3] * dt, -mt, mt)];
}

export function fallOffset(gs, i, t) {
  const f = gs.fall[i];
  if (f < 0 || t < f) return 0;
  const k = t - f;
  return -0.5 * 18 * k * k;
}

export default {
  id: 'wobble-works',
  move: {},
  build({ n }) {
    const colliders = [];
    CENTRES.forEach(([cx, cz], i) => {
      colliders.push(box(cx, -THICK, cz, HALF, THICK, HALF, {
        tag: 'plat',
        data: { plat: i },
        look: { hidden: true },
        motion: (t, gs, c) => {
          const [pitch, roll] = tiltAt(gs, i, t);
          eulerMatrix(0, pitch, roll, m);
          const drop = fallOffset(gs, i, t);
          // Rotate about the centre of the top surface.
          c.x = cx - THICK * m[1];
          c.y = -THICK * m[4] + drop;
          c.z = cz - THICK * m[7];
          c.pitch = pitch;
          c.roll = roll;
          c.enabled = drop > -8;
        },
      }));
    });
    colliders.push(box(0, 0.55, 0, 3.3, 0.28, 0.28, {
      tag: 'sweeper', knock: 10, knockUp: 5,
      look: { stripes: ['#ffd23f', '#2b1b5a'], round: 0.12 },
      motion: (t, gs, c) => {
        const [pitch, roll] = tiltAt(gs, 0, t);
        eulerMatrix(0, pitch, roll, m);
        c.x = 0.55 * m[1];
        c.y = 0.55 * m[4];
        c.z = 0.55 * m[7];
        c.pitch = pitch;
        c.roll = roll;
        c.yaw = t > 8 ? (t - 8) * 1.15 : 0;
        c.enabled = t > 8;
      },
    }));
    const spawns = [];
    for (let i = 0; i < n; i++) {
      const [cx, cz] = CENTRES[1 + (i % 4)];
      const off = i < 4 ? -1 : 1;
      spawns.push({ x: cx + (cz !== 0 ? off * 1.4 : 0), y: 0.05, z: cz + (cx !== 0 ? off * 1.4 : 0), yaw: Math.atan2(-cx, -cz) });
    }
    return {
      colliders,
      spawns,
      killY: -10,
      gs: { p: CENTRES.map(() => [0, 0, 0, 0, 0]), ev: null, fall: CENTRES.map(() => -1) },
      data: {},
      camera: { mode: 'arena', center: [0, 0, 0.5], dist: 23, height: 24, follow: 0.2, shadow: 16 },
    };
  },
};
void ringSpawns;
