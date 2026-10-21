// Personal Space — server rules: shoves, dash bumps, growing knockback and a shrinking arena.
import { BTN } from '../../shared/constants.js';
import { applyKnock } from '../../shared/controller.js';
import { survivalRank, survivalOver, survivalStat, asc } from './common.js';

const RANGE = 2.4;
const CONE = Math.cos((75 * Math.PI) / 180);
const COOLDOWN = 1.1;

// Knockback grows with every hit you have taken, so long fights end decisively.
function knockPower(q, base) {
  return Math.min(17, base + q.hits * 1.5);
}

export default {
  init(R) {
    for (const p of R.players) { p.hits = 0; p.shoves = 0; p.cd = 0; p.immune = 0; }
  },

  onStep(R, p, inp, dt) {
    p.cd = Math.max(0, p.cd - dt);
    p.immune = Math.max(0, p.immune - dt);
    if (!(inp.b & BTN.ACT_P) || p.cd > 0 || p.ch.stunT > 0) return;
    p.cd = COOLDOWN;
    const fx = Math.sin(p.ch.yaw), fz = Math.cos(p.ch.yaw);
    let hit = -1;
    for (const q of R.players) {
      if (q === p || !q.alive || q.immune > 0) continue;
      const dx = q.ch.x - p.ch.x, dz = q.ch.z - p.ch.z;
      if (Math.abs(q.ch.y - p.ch.y) > 1.6) continue;
      const d = Math.hypot(dx, dz);
      if (d > RANGE || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d < CONE) continue;
      applyKnock(q.ch, dx, dz, knockPower(q, 5.5), 4, 0.3);
      q.hits++;
      q.immune = 0.35;
      p.shoves++;
      hit = q.slot;
      R.emit('shove', { s: p.slot, t: q.slot });
    }
    if (hit < 0) R.emit('shove', { s: p.slot, t: -1 });
  },

  tick(R) {
    // Dashing into someone bumps them.
    for (const p of R.players) {
      if (!p.alive || p.ch.dashT <= 0) continue;
      for (const q of R.players) {
        if (q === p || !q.alive || q.immune > 0) continue;
        const dx = q.ch.x - p.ch.x, dz = q.ch.z - p.ch.z;
        if (Math.abs(q.ch.y - p.ch.y) > 1.2 || Math.hypot(dx, dz) > 1.15) continue;
        applyKnock(q.ch, dx, dz, knockPower(q, 5), 3.5, 0.28);
        q.hits++;
        q.immune = 0.35;
        p.ch.dashT = 0;
        R.emit('bump', { s: p.slot, t: q.slot });
      }
    }
  },

  pextra: (R, p) => p.hits,
  isOver: survivalOver,
  // Survivors at the time limit: whoever was shoved less ranks higher.
  rank: (R) => survivalRank(R, [asc((p) => (p.alive ? p.hits : 0))]),
  stat(R, p) {
    return `${survivalStat(R, p)} · ${p.shoves} shoves landed`;
  },
};
