// Memory Mayhem — a 3x3 grid of symbol pads. Watch the sequence light up, then step on the
// pads in the same order.
import { slab, box, ringSpawns } from './kit.js';

export const PAD_SYMBOLS = [
  { symbol: 'star', hex: '#ffd23f' },
  { symbol: 'circle', hex: '#e8364f' },
  { symbol: 'triangle', hex: '#4da3ff' },
  { symbol: 'square', hex: '#3ddc97' },
  { symbol: 'heart', hex: '#ff5da2' },
  { symbol: 'diamond', hex: '#8b5cf6' },
  { symbol: 'cross', hex: '#ff8a3d' },
  { symbol: 'moon', hex: '#1fc8c1' },
  { symbol: 'bolt', hex: '#c9d3ff' },
];
export const SPACING = 4.6;
export const PAD_HALF = 1.7;
export const PAD_TOP = 1.0;
export const LANES = [-6.9, -2.3, 2.3, 6.9];

export default {
  id: 'memory-mayhem',
  move: {},
  build({ n }) {
    const colliders = [
      slab(0, 0, 0, 9.5, 9.5, 1, { look: { color: '#5b5f8a', top: '#3b3561' }, tag: 'floor' }),
    ];
    for (const [x, z, hx, hz] of [[0, -9.8, 9.8, 0.3], [0, 9.8, 9.8, 0.3], [-9.8, 0, 0.3, 9.5], [9.8, 0, 0.3, 9.5]]) {
      colliders.push(box(x, 0.8, z, hx, 0.8, hz, { look: { color: '#2b1b5a', top: '#8b5cf6', round: 0.15 } }));
    }
    const pads = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = (i - 1) * SPACING, z = (j - 1) * SPACING;
        pads.push({ index: pads.length, x, z, c: colliders.length });
        colliders.push(slab(x, PAD_TOP, z, PAD_HALF, PAD_HALF, PAD_TOP / 2, { tag: 'pad', look: { hidden: true }, data: { pad: pads.length - 1 } }));
      }
    }
    return {
      colliders,
      spawns: ringSpawns(n, 7.6, 0.05),
      killY: -10,
      gs: { st: 0, L: 0, ph: 'idle', lit: -1 },
      data: { pads },
      camera: { mode: 'iso', center: [0, 0, 0], dist: 9, height: 18, follow: 0.3, yaw: 0, shadow: 14 },
    };
  },
};
