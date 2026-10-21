// Target Trouble — a carnival shooting gallery. Launch paint balls at moving targets.
import { slab, box } from './kit.js';

export const SHOT = { speed: 27, gravity: 12, radius: 0.18, life: 4, cooldown: 0.42 };
export const AIM = { yawMax: 0.8, pitchMin: 0.02, pitchMax: 0.95 };
export const DECK_Z = 0;
export const LAUNCH_H = 1.45;

export function launcherX(slot, n) {
  return (slot - (n - 1) / 2) * 2.9;
}

export function muzzle(slot, n, yaw, pitch) {
  const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
  return { x: launcherX(slot, n) + dx * 0.9, y: LAUNCH_H + dy * 0.9, z: DECK_Z + 0.5 + dz * 0.9, vx: dx * SHOT.speed, vy: dy * SHOT.speed, vz: dz * SHOT.speed };
}

// Targets: kind 0 ring (1 pt), 1 spinning disc (2), 2 balloon (3), 3 golden (10).
export const TARGETS = [
  { id: 0, kind: 0, x: -8, y: 3.2, z: 13, a: 3, w: 0.8, ph: 0 },
  { id: 1, kind: 0, x: 0, y: 2.6, z: 15, a: 4, w: 0.6, ph: 1 },
  { id: 2, kind: 0, x: 8, y: 3.6, z: 13, a: 3, w: 0.9, ph: 2 },
  { id: 3, kind: 0, x: -4, y: 5.2, z: 18, a: 5, w: 0.5, ph: 3 },
  { id: 4, kind: 0, x: 4, y: 5.8, z: 18, a: 5, w: 0.7, ph: 4 },
  { id: 5, kind: 0, x: 0, y: 7.5, z: 20, a: 6, w: 0.45, ph: 5 },
  { id: 6, kind: 1, x: -7, y: 4, z: 25, a: 1.5, w: 0.5, ph: 0, spin: 1.8 },
  { id: 7, kind: 1, x: 0, y: 6.5, z: 27, a: 2, w: 0.4, ph: 2, spin: 2.3 },
  { id: 8, kind: 1, x: 7, y: 4, z: 25, a: 1.5, w: 0.6, ph: 4, spin: 1.5 },
  { id: 9, kind: 2, x: -9, y: 0, z: 32, a: 1, w: 0.7, ph: 0, rise: 1.6 },
  { id: 10, kind: 2, x: -3, y: 0, z: 34, a: 1, w: 0.9, ph: 3, rise: 1.3 },
  { id: 11, kind: 2, x: 3, y: 0, z: 33, a: 1, w: 0.6, ph: 6, rise: 1.8 },
  { id: 12, kind: 2, x: 9, y: 0, z: 31, a: 1, w: 0.8, ph: 9, rise: 1.5 },
  { id: 13, kind: 3, x: 0, y: 9, z: 40, a: 10, w: 1.7, ph: 0 },
];
export const POINTS = [1, 2, 3, 10];
export const RADIUS = [0.95, 1.05, 0.85, 0.95];
export const RESPAWN = [2.2, 2.8, 2.2, 0];
export const GOLD_WINDOWS = [[10, 14.5], [24, 28.5], [36, 40.5]];

export function goldActive(t) {
  return GOLD_WINDOWS.some(([a, b]) => t >= a && t < b);
}

// Target centre at time t (pure function of time, shared by server and client).
export function targetPos(tg, t, out = {}) {
  out.x = tg.x + Math.sin(t * tg.w + tg.ph) * tg.a;
  out.y = tg.y + Math.sin(t * 1.3 + tg.ph) * 0.25;
  out.z = tg.z;
  out.spin = 0;
  if (tg.kind === 1) out.spin = t * tg.spin + tg.ph;
  if (tg.kind === 2) {
    const cycle = 15 / tg.rise;
    const u = (((t + tg.ph) % cycle) + cycle) % cycle;
    out.y = -1 + u * tg.rise;
    out.x = tg.x + Math.sin(t * 0.8 + tg.ph) * 0.8;
  }
  return out;
}

export const BLOCKERS = [{ z: 17, x: -5, a: 5, w: 0.9 }, { z: 22, x: 5, a: 6, w: 0.7 }];
export function blockerX(b, t) {
  return b.x + Math.sin(t * b.w) * b.a;
}

export default {
  id: 'target-trouble',
  move: { speed: 0, jump: 0, sprint: 'none' },
  build({ n }) {
    const colliders = [
      slab(0, 0, 0, 14, 3.2, 1, { look: { color: '#ffffff', checker: ['#e8364f', '#ffffff'] }, tag: 'deck' }),
      box(0, 1.6, -3.6, 14, 1.6, 0.4, { look: { color: '#e8364f', top: '#ffd23f', round: 0.2 } }),
    ];
    const spawns = [];
    for (let s = 0; s < n; s++) spawns.push({ x: launcherX(s, n), y: 0.05, z: DECK_Z - 1.1, yaw: 0 });
    // Moving blockers are solid only for paint balls; they are visual colliders for players.
    for (const b of BLOCKERS) {
      colliders.push(box(b.x, 2.4, b.z, 1.6, 1.8, 0.25, {
        solid: false, tag: 'blocker', look: { stripes: ['#ffffff', '#2b1b5a'], round: 0.1 },
        motion: (t, gs, c) => { c.x = blockerX(b, t); c.y = 2.4; c.z = b.z; },
      }));
    }
    return {
      colliders,
      spawns,
      killY: -10,
      gs: { dead: [] },
      data: {},
      camera: { mode: 'aim', center: [0, 3, 18], dist: 18, height: 10 },
    };
  },
};
