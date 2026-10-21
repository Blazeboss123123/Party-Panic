// The Last Platform — server rules: plan each shuffle (moves, sinks, risers), announce it with
// a warning window that shrinks every cycle, then commit it.
import { COUNT, SLIDE, SINK, RISE } from '../../shared/games/last-platform.js';
import { survivalRank, survivalOver, survivalStat } from './common.js';
import { round2 } from '../../shared/math.js';

function neighbours(s) {
  const i = s % 4, j = Math.floor(s / 4);
  const out = [];
  if (i > 0) out.push(s - 1);
  if (i < 3) out.push(s + 1);
  if (j > 0) out.push(s - 4);
  if (j < 3) out.push(s + 4);
  return out;
}

function plan(R, at) {
  const gs = R.gs;
  const c = (R.data.cycle = (R.data.cycle || 0) + 1);
  const warn = Math.max(1.9, 4.3 - 0.27 * (c - 1));
  const active = [];
  for (let pid = 0; pid < COUNT; pid++) if (gs.slot[pid] >= 0) active.push(pid);
  const occupied = new Set(active.map((pid) => gs.slot[pid]));
  // Moves into empty neighbouring slots (no two platforms target the same slot).
  const mv = [];
  const targeted = new Set();
  const want = Math.min(2 + Math.floor(c / 2), 6);
  for (const pid of R.rng.shuffle(active.slice())) {
    if (mv.length >= want) break;
    const opts = neighbours(gs.slot[pid]).filter((s) => !occupied.has(s) && !targeted.has(s));
    if (!opts.length) continue;
    const to = R.rng.pick(opts);
    targeted.add(to);
    mv.push([pid, to]);
  }
  // Doomed platforms sink after the slide. The floor keeps shrinking until only one is left:
  // three platforms minimum early on, two from cycle 7 and the last platform from cycle 10.
  const minLeft = c >= 10 ? 1 : c >= 7 ? 2 : 3;
  const doomCount = Math.min(1 + Math.floor(c / 2), 4, Math.max(0, active.length - minLeft));
  // Later on, crowded platforms are more likely to be doomed.
  const crowd = new Map(active.map((pid) => [pid, 0]));
  for (const p of R.players) {
    const col = p.alive && p.ch.grounded ? R.world.colliders[p.ch.gid] : null;
    if (col && col.tag === 'plat') crowd.set(col.data.pid, (crowd.get(col.data.pid) || 0) + 1);
  }
  const ordered = R.rng.shuffle(active.slice()).sort((a, b) => (c >= 5 ? crowd.get(b) - crowd.get(a) : 0));
  const dm = ordered.slice(0, doomCount);
  // Risers refill empty slots, so the count drops by about one per cycle.
  const after = new Set(active.filter((pid) => !dm.includes(pid)).map((pid) => {
    const m = mv.find((x) => x[0] === pid);
    return m ? m[1] : gs.slot[pid];
  }));
  const free = [];
  for (let s = 0; s < 16; s++) if (!after.has(s) && !targeted.has(s) && !occupied.has(s)) free.push(s);
  const pool = [];
  for (let pid = 0; pid < COUNT; pid++) if (gs.slot[pid] < 0) pool.push(pid);
  const riseCount = c >= 7 ? 0 : Math.min(Math.max(0, doomCount - 1), free.length, pool.length);
  const rs = [];
  R.rng.shuffle(free);
  for (let k = 0; k < riseCount; k++) rs.push([pool[k], free[k]]);
  const tS = at + warn;
  const tD = tS + SLIDE;
  const tE = tD + Math.max(SINK, RISE) + 0.5;
  gs.cyc = { c, tW: round2(at), tS: round2(tS), tD: round2(tD), tE: round2(tE), mv, dm, rs };
  R.emit('cycle', { c, warn: round2(warn) });
}

function commit(R) {
  const gs = R.gs;
  const cyc = gs.cyc;
  for (const [pid, to] of cyc.mv) gs.slot[pid] = to;
  for (const pid of cyc.dm) gs.slot[pid] = -1;
  for (const [pid, s] of cyc.rs) gs.slot[pid] = s;
  gs.cyc = null;
}

export default {
  init(R) {
    R.gs.slot = (() => {
      const arr = new Array(COUNT).fill(-1);
      R.layout.gs.slot.forEach((s, i) => { arr[i] = s; });
      return arr;
    })();
    R.gs.cyc = null;
  },

  start(R) {
    plan(R, 1.0);
  },

  tick(R) {
    const gs = R.gs;
    if (gs.cyc && R.t >= gs.cyc.tE) {
      commit(R);
      plan(R, R.t);
    }
  },

  net(R) {
    return { slot: R.gs.slot, cyc: R.gs.cyc };
  },

  pextra: (R, p) => (p.alive ? 1 : 0),
  isOver: survivalOver,
  rank: (R) => survivalRank(R),
  stat: (R, p) => `${survivalStat(R, p)} · ${R.data.cycle || 0} shuffles`,
};
