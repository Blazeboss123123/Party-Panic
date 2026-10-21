// Bomb Relay — server rules. The server owns every bomb: who holds it, when it detonates,
// and whether a pass is legal (range, cooldown, no instant pass-backs).
import { BTN, FLAG } from '../../shared/constants.js';
import { applyKnock } from '../../shared/controller.js';
import { survivalRank, survivalOver, survivalStat } from './common.js';
import { round2 } from '../../shared/math.js';

const PASS_RANGE = 2.4;
const PASS_CD = 0.6;
const NO_PASSBACK = 1.5;
const BREAK = 2.6;

function startPhase(R) {
  const alive = R.players.filter((p) => p.alive);
  if (alive.length < 2) return;
  R.data.phase++;
  const count = alive.length >= 5 ? 2 : 1;
  const holders = R.rng.shuffle(alive.slice()).slice(0, count);
  const late = R.data.phase > 3;
  R.data.bombs = holders.map((h, i) => ({
    id: R.data.nextBomb++,
    holder: h.slot,
    from: -1,
    gotAt: R.t,
    det: R.t + (late ? 8 : 10) + R.rng() * 4 + i * 0.8,
  }));
  R.gs.next = -1;
  R.emit('bombs', { n: count, ph: R.data.phase });
}

function holdingBomb(R, slot) {
  return R.data.bombs.find((b) => b.holder === slot);
}

export default {
  init(R) {
    R.data.bombs = [];
    R.data.nextBomb = 1;
    R.data.phase = 0;
    for (const p of R.players) { p.passCd = 0; p.held = 0; p.passes = 0; }
  },

  start(R) {
    R.gs.next = 1.2;
  },

  onStep(R, p, inp, dt) {
    p.passCd = Math.max(0, p.passCd - dt);
    if (!(inp.b & BTN.ACT_P) || p.passCd > 0) return;
    const bomb = holdingBomb(R, p.slot);
    if (!bomb) return;
    let target = null, bd = PASS_RANGE;
    for (const q of R.players) {
      if (q === p || !q.alive || holdingBomb(R, q.slot)) continue;
      if (q.slot === bomb.from && R.t - bomb.gotAt < NO_PASSBACK) continue;
      if (Math.abs(q.ch.y - p.ch.y) > 1.8) continue;
      const d = Math.hypot(q.ch.x - p.ch.x, q.ch.z - p.ch.z);
      if (d < bd) { bd = d; target = q; }
    }
    p.passCd = PASS_CD;
    if (!target) { R.emit('whiff', { s: p.slot }); return; }
    bomb.from = p.slot;
    bomb.holder = target.slot;
    bomb.gotAt = R.t;
    target.passCd = 0.25;
    p.passes++;
    R.emit('pass', { s: p.slot, t: target.slot });
  },

  tick(R) {
    if (R.gs.next >= 0 && R.t >= R.gs.next) startPhase(R);
    // Holders who left the round hand the bomb to the nearest player.
    for (const b of R.data.bombs) {
      const h = R.players[b.holder];
      if (!h.alive) {
        let best = null, bd = Infinity;
        for (const q of R.players) {
          if (!q.alive || holdingBomb(R, q.slot)) continue;
          const d = Math.hypot(q.ch.x - h.ch.x, q.ch.z - h.ch.z);
          if (d < bd) { bd = d; best = q; }
        }
        if (best) { b.holder = best.slot; b.from = -1; b.gotAt = R.t; R.emit('pass', { s: h.slot, t: best.slot }); }
      }
    }
    // Detonations
    const remaining = [];
    for (const b of R.data.bombs) {
      if (R.t < b.det) { remaining.push(b); continue; }
      const h = R.players[b.holder];
      if (!h.alive) continue;
      R.emit('boom', { s: h.slot, x: round2(h.ch.x), y: round2(h.ch.y), z: round2(h.ch.z) });
      for (const q of R.players) {
        if (q === h || !q.alive) continue;
        const dx = q.ch.x - h.ch.x, dz = q.ch.z - h.ch.z;
        const d = Math.hypot(dx, dz);
        if (d < 4) applyKnock(q.ch, dx, dz, 10 * (1 - d / 4) + 4, 6, 0.35);
      }
      R.eliminate(h, 'boom');
    }
    R.data.bombs = remaining;
    if (!R.data.bombs.length && R.gs.next < 0 && R.data.phase > 0) R.gs.next = R.t + BREAK;
    // Holder perks and flags
    for (const p of R.players) {
      const holding = !!holdingBomb(R, p.slot);
      p.ch.speedMul = holding ? 1.12 : 1;
      p.flags = holding ? FLAG.SPECIAL : 0;
      if (holding) p.held += 1 / 60;
    }
  },

  net(R) {
    return { bombs: R.data.bombs.map((b) => [b.id, b.holder, round2(b.det), round2(b.gotAt)]), next: R.gs.next };
  },

  pextra: (R, p) => (holdingBomb(R, p.slot) ? 1 : 0),
  isOver: survivalOver,
  rank: (R) => survivalRank(R),
  stat: (R, p) => `${survivalStat(R, p)} · ${p.passes} passes`,
};
