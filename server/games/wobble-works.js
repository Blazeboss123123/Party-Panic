// Wobble Works — server rules: weight-reactive tilt, scheduled tilt events with warnings,
// and outer platforms that collapse late in the round.
import { CENTRES, maxTilt, tiltAt } from '../../shared/games/wobble-works.js';
import { survivalRank, survivalOver, survivalStat } from './common.js';
import { clamp, round3 } from '../../shared/math.js';

const WEIGHT = 0.018; // radians per metre of offset per player
const MAX_RATE = 0.65; // radians per second

export default {
  init(R) {
    R.data.nextEvent = 6;
    R.data.falls = [];
    // Two random outer platforms collapse at 45s and 60s.
    const outer = R.rng.shuffle([1, 2, 3, 4]);
    R.data.falls = [{ i: outer[0], at: 45 }, { i: outer[1], at: 60 }];
  },

  preTick(R) {
    // Keep the shared tilt state's timestamp current so motion() evaluates at this tick.
    for (const p of R.gs.p) {
      const t = R.t;
      const dt = t - p[4];
      if (dt > 0) {
        const mt = maxTilt(t);
        p[0] = clamp(p[0] + p[2] * dt, -mt, mt);
        p[1] = clamp(p[1] + p[3] * dt, -mt, mt);
        p[4] = t;
      }
    }
  },

  tick(R) {
    const gs = R.gs;
    const t = R.t;
    // Scheduled tilt events.
    if (!gs.ev && t >= R.data.nextEvent) {
      // Later events target the busiest standing platform.
      let i = R.rng.int(0, 4);
      if (t > 40) {
        const counts = CENTRES.map(() => 0);
        for (const p of R.players) {
          const c = p.alive && p.ch.grounded ? R.world.colliders[p.ch.gid] : null;
          if (c && c.tag === 'plat') counts[c.data.plat]++;
        }
        i = counts.indexOf(Math.max(...counts));
      }
      const axis = R.rng.int(0, 1);
      const sign = R.rng() < 0.5 ? -1 : 1;
      gs.ev = [i, axis, sign, round3(t + 1.6), round3(t + 4.1)];
      R.emit('tiltWarn', { i, axis, sign });
      R.data.nextEvent = t + Math.max(2.8, 7 - t / 12);
    }
    if (gs.ev && t >= gs.ev[4]) gs.ev = null;
    // Collapses
    for (const f of R.data.falls) {
      if (gs.fall[f.i] < 0 && t >= f.at - 2 && !f.warned) { f.warned = true; R.emit('fallWarn', { i: f.i }); }
      if (gs.fall[f.i] < 0 && t >= f.at) { gs.fall[f.i] = round3(t); R.emit('fall', { i: f.i }); }
    }
    // Weight distribution -> target tilt for each platform.
    const load = CENTRES.map(() => [0, 0]);
    for (const p of R.players) {
      if (!p.alive || !p.ch.grounded) continue;
      const c = R.world.colliders[p.ch.gid];
      if (!c || c.tag !== 'plat') continue;
      const [cx, cz] = CENTRES[c.data.plat];
      load[c.data.plat][0] += p.ch.x - cx;
      load[c.data.plat][1] += p.ch.z - cz;
    }
    const amp = 1 + Math.min(1, t / 60) * 1.1;
    CENTRES.forEach((_, i) => {
      const mt = maxTilt(t);
      let tp = clamp(load[i][1] * WEIGHT * amp, -mt, mt);
      let tr = clamp(-load[i][0] * WEIGHT * amp, -mt, mt);
      // Gentle idle wobble so empty platforms are never perfectly still.
      tp += Math.sin(t * 0.7 + i * 1.3) * 0.05;
      tr += Math.cos(t * 0.6 + i * 2.1) * 0.05;
      if (gs.ev && gs.ev[0] === i && t >= gs.ev[3]) {
        const big = maxTilt(t) * 0.95;
        if (gs.ev[1] === 0) tp = gs.ev[2] * big; else tr = gs.ev[2] * big;
      }
      const [cp, cr] = tiltAt(gs, i, t);
      const vp = clamp((tp - cp) * 2.4, -MAX_RATE, MAX_RATE);
      const vr = clamp((tr - cr) * 2.4, -MAX_RATE, MAX_RATE);
      gs.p[i] = [round3(cp), round3(cr), round3(vp), round3(vr), round3(t)];
    });
  },

  net(R) {
    return { p: R.gs.p, ev: R.gs.ev, fall: R.gs.fall };
  },

  pextra: (R, p) => (p.alive ? 1 : 0),
  isOver: survivalOver,
  rank: (R) => survivalRank(R),
  stat: (R, p) => survivalStat(R, p),
};
