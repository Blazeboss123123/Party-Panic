// Colour Rush — two rings of colour pads around a central void. A colour and its symbol are
// called; every other pad drops when the countdown ends.
import { disc, ringSpawns } from './kit.js';

export const SWATCHES = [
  { name: 'Red', hex: '#e8364f', symbol: 'circle' },
  { name: 'Blue', hex: '#4da3ff', symbol: 'triangle' },
  { name: 'Yellow', hex: '#ffd23f', symbol: 'star' },
  { name: 'Green', hex: '#3ddc97', symbol: 'square' },
  { name: 'Purple', hex: '#8b5cf6', symbol: 'diamond' },
  { name: 'Orange', hex: '#ff8a3d', symbol: 'cross' },
];
export const PAD_R = 2.35;
export const RINGS = [
  { count: 6, radius: 6.2, offset: 0, dir: -1, speed: 0.22 },
  { count: 12, radius: 12.4, offset: Math.PI / 12, dir: 1, speed: 0.12 },
];

export function padAngle(pad, t, gs) {
  const ring = RINGS[pad.ring];
  const start = pad.ring === 0 ? gs.rot0 : gs.rot1;
  const spin = start >= 0 && t > start ? (t - start) * ring.speed * ring.dir : 0;
  return pad.a + spin;
}

export default {
  id: 'colour-rush',
  move: {},
  build({ n }) {
    const colliders = [];
    const pads = [];
    RINGS.forEach((ring, ri) => {
      for (let i = 0; i < ring.count; i++) {
        const a = ring.offset + (i / ring.count) * Math.PI * 2;
        const pad = { ring: ri, a, index: pads.length };
        pads.push(pad);
        colliders.push(disc(Math.sin(a) * ring.radius, 0, Math.cos(a) * ring.radius, PAD_R, 0.5, {
          tag: 'pad',
          look: { kind: 'pad', hidden: true },
          data: { pad: pad.index },
          motion: (t, gs, c) => {
            const ang = padAngle(pad, t, gs);
            c.x = Math.sin(ang) * ring.radius;
            c.z = Math.cos(ang) * ring.radius;
            c.y = -0.5;
            c.yaw = ang;
            c.enabled = padSolid(pad.index, t, gs);
          },
        }));
      }
    });
    // Spawn players on the outer ring pads.
    const spawns = [];
    const outer = pads.filter((p) => p.ring === 1);
    for (let i = 0; i < n; i++) {
      const p = outer[Math.floor((i * outer.length) / n)];
      spawns.push({ x: Math.sin(p.a) * RINGS[1].radius, y: 0.05, z: Math.cos(p.a) * RINGS[1].radius, yaw: p.a + Math.PI });
    }
    return {
      colliders,
      spawns,
      killY: -10,
      gs: { st: 0, tg: -1, cols: '012345012345012345', drop: -1, rest: -1, rm: '0'.repeat(pads.length), rot0: -1, rot1: -1 },
      data: { pads },
      camera: { mode: 'arena', center: [0, 0, 1], dist: 23, height: 25, follow: 0.18, shadow: 18 },
    };
  },
};

// A pad is solid unless it was removed, or it is dropping because it is not the called colour.
export function padSolid(index, t, gs) {
  if (gs.rm.charCodeAt(index) === 49) return false;
  const dropping = gs.drop >= 0 && t >= gs.drop && t < gs.rest;
  return !(dropping && Number(gs.cols[index]) !== gs.tg);
}
