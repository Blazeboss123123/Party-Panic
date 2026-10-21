// Treasure Tug — two teams pull a treasure chest along a rail towards their own base.
import { slab, box } from './kit.js';
import { clamp } from '../math.js';

export const RAIL = 15; // chest x = pos * RAIL; |pos| >= 1 scores
export const ZONE = { x0: 6, x1: 14.5, hz: 3.6 };
export const SLOTS = 4;

// Team 0 (Sunburst) pulls towards -x, team 1 (Tidal) towards +x.
export function teamDir(team) {
  return team === 0 ? -1 : 1;
}

export function slotPos(team, k) {
  const d = teamDir(team);
  return { x: d * (7.4 + k * 1.75), z: k % 2 ? 1.05 : -1.05, yaw: d < 0 ? Math.PI / 2 : -Math.PI / 2 };
}

export function inZone(team, x, z) {
  const d = teamDir(team);
  return x * d >= ZONE.x0 && x * d <= ZONE.x1 && Math.abs(z) <= ZONE.hz;
}

export default {
  id: 'treasure-tug',
  move: {},
  build({ n, teams }) {
    const colliders = [
      slab(0, 0, 0, 21, 8.5, 1, { look: { color: '#5b5f8a', top: '#e9e2ff' }, tag: 'floor' }),
    ];
    for (const [x, z, hx, hz] of [[0, -8.9, 21.4, 0.4], [0, 8.9, 21.4, 0.4], [-21.4, 0, 0.4, 8.5], [21.4, 0, 0.4, 8.5]]) {
      colliders.push(box(x, 1.5, z, hx, 1.5, hz, { look: { color: '#2b1b5a', top: '#8b5cf6', round: 0.15 } }));
    }
    colliders.push(box(0, 0.6, 0, 0.8, 0.6, 0.65, {
      tag: 'chest', look: { hidden: true },
      motion: (t, gs, c) => { c.x = clamp(gs.pos, -1, 1) * RAIL; c.y = 0.6; c.z = 0; },
    }));
    // Spawns: each team near its own rope zone.
    const spawns = [];
    const counts = [0, 0];
    for (let i = 0; i < n; i++) {
      const team = teams && teams[i] >= 0 ? teams[i] : i % 2;
      const k = counts[team]++;
      const d = teamDir(team);
      spawns.push({ x: d * (10 + (k % 2) * 1.6), y: 0.05, z: (Math.floor(k / 2) - 0.5) * 3.2 + (k % 2) * 0.6, yaw: d < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    return {
      colliders,
      spawns,
      killY: -10,
      gs: { pos: 0 },
      data: {},
      camera: { mode: 'iso', center: [0, 0, 0], dist: 13, height: 19, follow: 0.35, yaw: Math.PI, shadow: 24 },
    };
  },
};
