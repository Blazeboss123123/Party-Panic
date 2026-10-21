// Memory Mayhem — server rules. The sequence is only revealed while it is being shown;
// every step is judged on the server from which pad the player actually landed on.
import { survivalRank, asc } from './common.js';
import { groupBy } from '../scoring/scoring.js';
import { round2 } from '../../shared/math.js';

const HEARTS = 3;
const MAX_STAGES = 10;

function startStage(R, at) {
  const gs = R.gs;
  gs.st++;
  gs.L = 2 + gs.st;
  const seq = [];
  for (let k = 0; k < gs.L; k++) {
    let p;
    do { p = R.rng.int(0, 8); } while (k > 0 && p === seq[k - 1]);
    seq.push(p);
  }
  R.data.seq = seq;
  gs.sh = round2(Math.max(0.55, 0.95 - 0.05 * gs.st));
  gs.t0 = round2(at);
  gs.ti = round2(at + gs.L * gs.sh + 0.5);
  gs.te = round2(gs.ti + 3.0 + gs.L * 1.6);
  gs.ph = 'show';
  R.emit('stage', { st: gs.st, L: gs.L });
}

// A step counts when a player lands on a pad from a jump. Walking the floor lanes between
// pads never registers anything.
function padLanded(R, p) {
  if (!p.landedPad) return null;
  const pad = p.landedPad;
  p.landedPad = null;
  return pad;
}

function fail(R, p, why) {
  p.status = 2;
  p.hearts--;
  p.mistakes++;
  R.emit(why, { s: p.slot, h: p.hearts });
  if (p.hearts <= 0) R.eliminate(p, 'memory');
}

export default {
  init(R) {
    for (const p of R.players) {
      p.hearts = HEARTS;
      p.completed = 0;
      p.mistakes = 0;
      p.time = 0;
      p.progress = 0;
      p.status = 1;
      p.lastReg = -1;
    }
    R.data.seq = [];
  },

  start(R) {
    startStage(R, 1.5);
  },

  onStep(R, p) {
    if (p.ch.landed && p.ch.grounded) {
      const c = R.world.colliders[p.ch.gid];
      if (c && c.tag === 'pad') p.landedPad = c.data.pad;
    }
  },

  tick(R) {
    const gs = R.gs;
    const t = R.t;
    if (gs.ph === 'show') {
      const k = Math.floor((t - gs.t0) / gs.sh);
      const within = (t - gs.t0) - k * gs.sh < gs.sh * 0.78;
      gs.lit = k >= 0 && k < gs.L && within ? R.data.seq[k] : -1;
      if (t >= gs.ti) {
        gs.ph = 'input';
        gs.lit = -1;
        for (const p of R.players) {
          if (!p.alive) continue;
          p.progress = 0;
          p.status = 0;
          p.lastReg = -1;
          p.landedPad = null;
        }
        R.emit('go2', {});
      }
    } else if (gs.ph === 'input') {
      for (const p of R.players) {
        if (!p.alive || p.status !== 0) continue;
        const pad = padLanded(R, p);
        if (pad === null || pad === p.lastReg) continue;
        p.lastReg = pad;
        if (pad === R.data.seq[p.progress]) {
          p.progress++;
          R.emit('step', { s: p.slot, pad, n: p.progress });
          if (p.progress === gs.L) {
            p.status = 1;
            p.completed++;
            p.time += t - gs.ti;
            R.emit('done', { s: p.slot, st: gs.st, t: round2(t - gs.ti) });
          }
        } else {
          R.emit('miss', { s: p.slot, pad });
          fail(R, p, 'wrong');
        }
      }
      const everyoneDone = R.players.every((p) => !p.alive || p.status !== 0);
      if (t >= gs.te || everyoneDone) {
        for (const p of R.players) if (p.alive && p.status === 0) fail(R, p, 'timeout');
        gs.ph = 'rest';
        gs.te = round2(t);
        R.data.restUntil = t + 2.0;
        R.emit('reveal', { seq: R.data.seq });
      }
    } else if (gs.ph === 'rest' && t >= R.data.restUntil) {
      if (!this.isOver(R)) startStage(R, t);
    }
  },

  net(R) {
    const gs = R.gs;
    return { st: gs.st, L: gs.L, ph: gs.ph, lit: gs.lit, t0: gs.t0, ti: gs.ti, te: gs.te, sh: gs.sh };
  },

  pextra: (R, p) => [p.completed, p.hearts, p.progress, p.status],

  isOver(R) {
    const gs = R.gs;
    const alive = R.players.filter((p) => p.alive);
    if (!alive.length) return true;
    if (gs.ph === 'rest' && gs.st >= MAX_STAGES) return true;
    if (gs.ph === 'rest' && alive.length === 1 && R.players.length > 1) {
      // A lone survivor ends the game once they are guaranteed first place.
      const best = Math.max(0, ...R.players.filter((p) => !p.alive).map((p) => p.completed));
      return alive[0].completed > best;
    }
    return false;
  },

  // Stages completed, then fewer mistakes, then less total time spent on completed stages.
  rank: (R) => groupBy(R.players, [(p) => p.completed, asc((p) => p.mistakes), asc((p) => Math.round(p.time * 100))], (p) => p.pid),

  stat: (R, p) => `${p.completed} ${p.completed === 1 ? 'sequence' : 'sequences'} · ${p.mistakes} ${p.mistakes === 1 ? 'mistake' : 'mistakes'}`,
};
void survivalRank;
