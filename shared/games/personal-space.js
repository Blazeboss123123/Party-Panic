// Personal Space — one round floating platform that shrinks; shove everyone else off.
import { cyl, box, ringSpawns } from './kit.js';

export const R_START = 12;
export const R_END = 3.8;
export const SHRINK_FROM = 8;
export const SHRINK_TO = 68;
export const BAR_FROM = 28;

export function platformRadius(t) {
  if (t <= SHRINK_FROM) return R_START;
  const k = Math.min(1, (t - SHRINK_FROM) / (SHRINK_TO - SHRINK_FROM));
  return R_START + (R_END - R_START) * k;
}

export default {
  id: 'personal-space',
  move: { sprint: 'dash', dashSpeed: 15, dashDur: 0.2, dashCd: 1.6 },
  build({ n }) {
    const colliders = [
      cyl(0, -0.6, 0, R_START, 0.6, {
        tag: 'platform',
        look: { hidden: true },
        motion: (t, gs, c) => { c.x = 0; c.y = -0.6; c.z = 0; c.r = platformRadius(Math.max(0, t)); },
      }),
      box(0, 0.38, 0, 3.0, 0.32, 0.28, {
        tag: 'bar', knock: 13, knockUp: 6,
        look: { stripes: ['#ffd23f', '#2b1b5a'], round: 0.15 },
        motion: (t, gs, c) => {
          c.x = 0; c.y = 0.38; c.z = 0;
          c.yaw = t > BAR_FROM ? (t - BAR_FROM) * 1.35 : 0;
          c.enabled = t > BAR_FROM;
        },
      }),
    ];
    return {
      colliders,
      spawns: ringSpawns(n, 6.5, 0.05),
      killY: -6,
      gs: {},
      data: {},
      camera: { mode: 'arena', center: [0, 0, 0.5], dist: 21, height: 22, follow: 0.15, shadow: 15 },
    };
  },
};
