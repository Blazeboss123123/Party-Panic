// The Last Platform — a 4x4 grid of slots with 12 floating platforms. Each cycle some slide
// to a neighbouring slot, some sink after sliding, and new ones rise. Ghost outlines warn first.
import { box } from './kit.js';
import { smoothstep, makeRng } from '../math.js';

export const S = 5;
export const PHALF = 2;
export const COUNT = 12;
export const SLIDE = 1.2;
export const SINK = 1.6;
export const RISE = 1.4;

export function slotPos(s) {
  const i = s % 4, j = Math.floor(s / 4);
  return { x: (i - 1.5) * S, z: (j - 1.5) * S };
}

// Pose of platform pid at time t given the shared plan.
export function platformPose(pid, t, gs, out) {
  const cyc = gs.cyc;
  const s0 = gs.slot[pid];
  out.y = 0;
  out.enabled = true;
  let s = s0;
  const mv = cyc && cyc.mv.find((m) => m[0] === pid);
  const rs = cyc && cyc.rs.find((m) => m[0] === pid);
  if (s0 < 0 && !rs) {
    const p = slotPos(0);
    out.x = p.x; out.z = p.z; out.y = -40; out.enabled = false;
    return out;
  }
  if (rs) {
    s = rs[1];
    const k = smoothstep(cyc.tD, cyc.tD + RISE, t);
    out.y = -14 * (1 - k);
    out.enabled = out.y > -0.6;
    const p = slotPos(s);
    out.x = p.x; out.z = p.z;
    return out;
  }
  const a = slotPos(s0);
  out.x = a.x; out.z = a.z;
  if (mv) {
    const b = slotPos(mv[1]);
    const k = smoothstep(cyc.tS, cyc.tS + SLIDE, t);
    out.x = a.x + (b.x - a.x) * k;
    out.z = a.z + (b.z - a.z) * k;
  }
  if (cyc && cyc.dm.includes(pid) && t > cyc.tD) {
    const u = (t - cyc.tD) / SINK;
    out.y = -14 * u * u;
    out.enabled = out.y > -7;
  }
  return out;
}

const tmp = {};

export default {
  id: 'last-platform',
  move: {},
  build({ n, seed }) {
    const colliders = [];
    for (let pid = 0; pid < COUNT; pid++) {
      colliders.push(box(0, -0.3, 0, PHALF, 0.3, PHALF, {
        tag: 'plat', data: { pid }, look: { hidden: true },
        motion: (t, gs, c) => {
          platformPose(pid, t, gs, tmp);
          c.x = tmp.x; c.y = tmp.y - 0.3; c.z = tmp.z;
          c.enabled = tmp.enabled;
        },
      }));
    }
    // Initial layout: leave four slots empty (deterministic from the seed).
    const rng = makeRng(seed ^ 0x2c1b3c6d);
    const empty = new Set(rng.shuffle([...Array(16).keys()]).slice(0, 4));
    const slot = [];
    for (let s = 0; s < 16; s++) if (!empty.has(s)) slot.push(s);
    const spawns = [];
    for (let i = 0; i < n; i++) {
      const p = slotPos(slot[(i * 5 + 1) % slot.length]);
      const off = i >= slot.length ? 0.9 : 0;
      spawns.push({ x: p.x + off, y: 0.05, z: p.z, yaw: Math.atan2(-p.x, -p.z) });
    }
    return {
      colliders,
      spawns,
      killY: -12,
      gs: { slot, cyc: null },
      data: {},
      camera: { mode: 'arena', center: [0, 0, 0.5], dist: 22, height: 24, follow: 0.18, shadow: 16 },
    };
  },
};
