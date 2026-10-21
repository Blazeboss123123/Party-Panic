// Boulder Panic — server rules. Boulders are real dynamic spheres colliding with the arena
// and cover; touching one costs a heart and knocks you back.
import { makeBody, stepBody } from '../../shared/physics.js';
import { applyKnock } from '../../shared/controller.js';
import { LANES, laneStart, HALF } from '../../shared/games/boulder-panic.js';
import { survivalRank, survivalOver, survivalStat } from './common.js';
import { round2 } from '../../shared/math.js';

const HEARTS = 3;

export default {
  init(R) {
    R.data.boulders = [];
    R.data.nextId = 1;
    R.data.nextSpawn = 2.5;
    for (const p of R.players) { p.hearts = HEARTS; p.invuln = 0; }
    R.gs.warn = [];
  },

  tick(R, dt) {
    const t = R.t;
    const prog = Math.min(1, t / 60);
    // Schedule new boulders with a visible warning.
    if (t >= R.data.nextSpawn) {
      const count = 1 + (prog > 0.35 ? 1 : 0) + (prog > 0.75 ? 1 : 0);
      const used = new Set();
      for (let k = 0; k < count; k++) {
        const side = R.rng.int(0, 3);
        const lane = R.rng.pick(LANES);
        const key = `${side}:${lane}`;
        if (used.has(key)) continue;
        used.add(key);
        const r = 1.1 + R.rng() * (0.4 + prog * 0.5);
        const warnTime = 1.5 - prog * 0.6;
        R.gs.warn.push([R.data.nextId++, side, lane, round2(t + warnTime), round2(r), round2(7 + prog * 7 + R.rng() * 2)]);
      }
      R.data.nextSpawn = t + 2.1 - prog * 1.4;
    }
    // Launch boulders whose warning has finished.
    const keep = [];
    for (const w of R.gs.warn) {
      if (t >= w[3]) {
        const [id, side, lane, , r, speed] = w;
        const s = laneStart(side, lane, r);
        R.data.boulders.push(makeBody({ x: s.x, y: r + 0.1, z: s.z, vx: s.vx * speed, vz: s.vz * speed, r, restitution: 0.35, friction: 0.05, data: { id, born: t } }));
        R.emit('roll', { id });
      } else keep.push(w);
    }
    R.gs.warn = keep;
    // Physics
    for (const b of R.data.boulders) stepBody(b, R.world, dt, 30);
    R.data.boulders = R.data.boulders.filter((b) => b.y > -20 && Math.abs(b.x) < HALF + 25 && Math.abs(b.z) < HALF + 25 && t - b.data.born < 20);
    // Hits
    for (const p of R.players) {
      if (!p.alive) continue;
      p.invuln = Math.max(0, p.invuln - dt);
      if (p.invuln > 0) continue;
      const ch = p.ch;
      for (const b of R.data.boulders) {
        const dx = ch.x - b.x, dy = ch.y + 0.7 - b.y, dz = ch.z - b.z;
        const rr = b.r + 0.55;
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        const sp = Math.hypot(b.vx, b.vz);
        if (sp < 2) continue; // resting boulders are just obstacles
        p.hearts--;
        p.invuln = 1.2;
        const kx = dx * 0.6 + (b.vx / sp) * 0.8, kz = dz * 0.6 + (b.vz / sp) * 0.8;
        applyKnock(ch, kx, kz, 9 + sp * 0.5, 8, 0.55);
        R.emit('hit', { s: p.slot, h: p.hearts });
        if (p.hearts <= 0) R.eliminate(p, 'crushed');
        break;
      }
    }
  },

  net(R) {
    return {
      warn: R.gs.warn,
      b: R.data.boulders.map((b) => [b.data.id, round2(b.x), round2(b.y), round2(b.z), b.r, round2(b.rx), round2(b.rz)]),
    };
  },

  pextra: (R, p) => p.hearts,
  isOver: survivalOver,
  rank: (R) => survivalRank(R, [(p) => (p.alive ? p.hearts : 0)]),
  stat(R, p) {
    const base = survivalStat(R, p);
    return p.alive ? `${base} · ${p.hearts} ${p.hearts === 1 ? 'heart' : 'hearts'} left` : base;
  },
};
