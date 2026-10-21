// Shared pieces for course-style minigames (races along +z).
import { slab, box, cyl, rowSpawns } from './kit.js';

// Start pad with spawn row and a back wall so nobody walks off the start.
export function startArea(n, { topY = 0, hw = 7.5, z0 = -7, z1 = 7, look } = {}) {
  const colliders = [
    slab(0, topY, (z0 + z1) / 2, hw, (z1 - z0) / 2, 1, { look: look || { color: '#ffffff', top: '#ffd23f', edge: '#2b1b5a' }, tag: 'start' }),
    box(0, topY + 1.2, z0 - 0.4, hw, 1.2, 0.4, { look: { color: '#2b1b5a', round: 0.2 } }),
    box(-hw - 0.4, topY + 0.6, (z0 + z1) / 2, 0.4, 0.6, (z1 - z0) / 2, { look: { color: '#2b1b5a', round: 0.2 } }),
    box(hw + 0.4, topY + 0.6, (z0 + z1) / 2, 0.4, 0.6, (z1 - z0) / 2, { look: { color: '#2b1b5a', round: 0.2 } }),
  ];
  return { colliders, spawns: rowSpawns(n, -2, topY + 0.05, 1.7) };
}

// Finish pad with an arch; returns colliders and the finish trigger box.
export function finishArea({ z0, z1, topY = 0, hw = 6, archZ, look } = {}) {
  const az = archZ ?? z0 + 2.5;
  const colliders = [
    slab(0, topY, (z0 + z1) / 2, hw, (z1 - z0) / 2, 1, { look: look || { color: '#ffffff', checker: ['#2b1b5a', '#ffffff'] }, tag: 'finishpad' }),
    cyl(-hw + 0.5, topY + 2.6, az, 0.45, 2.6, { look: { color: '#ff5da2' } }),
    cyl(hw - 0.5, topY + 2.6, az, 0.45, 2.6, { look: { color: '#ff5da2' } }),
    box(0, topY + 5.6, az, hw, 0.5, 0.5, { solid: false, look: { color: '#ffd23f', round: 0.2 }, tag: 'arch' }),
    box(0, topY + 1.2, z1 + 0.4, hw, 1.2, 0.4, { look: { color: '#2b1b5a', round: 0.2 } }),
  ];
  const finish = { x: 0, y: topY + 1.5, z: (az + z1) / 2, hx: hw, hy: 3, hz: (z1 - az) / 2 };
  return { colliders, finish };
}

export function inBox(b, x, y, z) {
  return Math.abs(x - b.x) <= b.hx && Math.abs(y - b.y) <= b.hy && Math.abs(z - b.z) <= b.hz;
}
