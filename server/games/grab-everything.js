// Grab Everything — server rules. Every gem is claimed exactly once; simultaneous touches
// go to the closest player (lower seat number on an exact tie).
import { GEM_TYPES } from '../../shared/games/grab-everything.js';
import { scoreRank, asc } from './common.js';
import { round2 } from '../../shared/math.js';

const PICK_R = 1.05;
const BOOST_TIME = 4;
const BOOST_MUL = 1.45;

function spawnGem(R) {
  const pts = R.layout.data.points;
  const used = new Set(R.data.gems.map((g) => g.p));
  const free = pts.map((_, i) => i).filter((i) => !used.has(i) && R.t - (R.data.lastUsed[i] ?? -99) > 2.5);
  if (!free.length) return;
  // Weighted choice: ground points are most common, tower tops rare.
  const weight = (i) => [1, 0.8, 0.5][pts[i].cls];
  let total = 0;
  for (const i of free) total += weight(i);
  let r = R.rng() * total, pick = free[0];
  for (const i of free) { r -= weight(i); if (r <= 0) { pick = i; break; } }
  const cls = pts[pick].cls;
  const type = cls === 2 ? 2 : cls === 1 ? (R.rng() < 0.75 ? 1 : 2) : R.rng() < 0.82 ? 0 : 1;
  R.data.gems.push({ id: R.data.nextId++, p: pick, type });
}

export default {
  init(R) {
    R.data.gems = [];
    R.data.nextId = 1;
    R.data.lastUsed = {};
    R.data.pending = [];
    R.data.target = 10 + R.players.length;
    R.data.boosts = R.layout.data.boostPoints.map((p, i) => ({ id: i, ...p, readyAt: i < 2 ? 4 : 10 }));
    for (const p of R.players) { p.score = 0; p.scoreT = 0; p.boostT = 0; p.gems = [0, 0, 0]; }
    for (let i = 0; i < R.data.target; i++) spawnGem(R);
  },

  tick(R, dt) {
    const pts = R.layout.data.points;
    // Respawn collected gems after a short delay.
    R.data.pending = R.data.pending.filter((at) => {
      if (R.t >= at) { spawnGem(R); return false; }
      return true;
    });
    // Claims
    const taken = [];
    for (const g of R.data.gems) {
      const pt = pts[g.p];
      let best = null, bestD = Infinity;
      for (const p of R.players) {
        if (!p.alive) continue;
        const dx = p.ch.x - pt.x, dy = p.ch.y + 0.6 - pt.y, dz = p.ch.z - pt.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < PICK_R * PICK_R && (d < bestD || (d === bestD && best && p.slot < best.slot))) { best = p; bestD = d; }
      }
      if (best) {
        const v = GEM_TYPES[g.type].v;
        best.score += v;
        best.scoreT = R.t;
        best.gems[g.type]++;
        taken.push(g);
        R.data.lastUsed[g.p] = R.t;
        R.data.pending.push(R.t + 1.2);
        R.emit('gem', { s: best.slot, id: g.id, v, ty: g.type });
      }
    }
    if (taken.length) R.data.gems = R.data.gems.filter((g) => !taken.includes(g));
    // Speed boosts
    for (const b of R.data.boosts) {
      if (R.t < b.readyAt) continue;
      for (const p of R.players) {
        if (!p.alive) continue;
        const dx = p.ch.x - b.x, dy = p.ch.y + 0.6 - b.y, dz = p.ch.z - b.z;
        if (dx * dx + dy * dy + dz * dz < 1.2 * 1.2) {
          p.boostT = BOOST_TIME;
          b.readyAt = R.t + 8;
          R.emit('boost', { s: p.slot, id: b.id });
          break;
        }
      }
    }
    for (const p of R.players) {
      p.boostT = Math.max(0, p.boostT - dt);
      p.ch.speedMul = p.boostT > 0 ? BOOST_MUL : 1;
    }
  },

  onFall(R, p) {
    R.respawn(p, { x: 0, y: 3, z: 0, yaw: 0 }, 1);
  },

  net(R) {
    const pts = R.layout.data.points;
    return {
      gems: R.data.gems.map((g) => [g.id, round2(pts[g.p].x), round2(pts[g.p].y), round2(pts[g.p].z), g.type]),
      boosts: R.data.boosts.filter((b) => R.t >= b.readyAt).map((b) => b.id),
    };
  },

  pextra: (R, p) => [p.score, p.boostT > 0 ? 1 : 0],
  isOver: () => false,
  // Highest score wins; on equal scores whoever reached it first ranks higher.
  rank: (R) => scoreRank(R, [asc((p) => (p.score > 0 ? p.scoreT : 1e9))]),
  stat: (R, p) => `${p.score} points · ${p.gems[2]} purple, ${p.gems[1]} blue, ${p.gems[0]} green`,
};
