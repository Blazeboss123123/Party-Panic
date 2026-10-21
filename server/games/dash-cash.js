// Dash for Cash — server rules: race with checkpoints; per-player coins break ties.
import { raceInit, raceTick, raceFall, raceIsOver, raceRanking, raceNet } from './raceCommon.js';
import { raceStat } from './common.js';

const COIN_R2 = 1.15 * 1.15;

export default {
  init(R) {
    raceInit(R, { finishWindow: 20 });
    for (const p of R.players) p.got = new Set();
  },

  tick(R) {
    raceTick(R);
    const coins = R.layout.data.coins;
    for (const p of R.players) {
      if (!p.alive || p.finishT !== Infinity) continue;
      const cx = p.ch.x, cy = p.ch.y + 0.7, cz = p.ch.z;
      for (const c of coins) {
        if (p.got.has(c.id)) continue;
        const dx = c.x - cx, dy = c.y - cy, dz = c.z - cz;
        if (dx * dx + dy * dy + dz * dz < COIN_R2) {
          p.got.add(c.id);
          p.coins++;
          R.emit('coin', { s: p.slot, id: c.id });
        }
      }
    }
  },

  onFall: (R, p) => raceFall(R, p, 0.6),
  isOver: raceIsOver,
  rank: (R) => raceRanking(R, [(p) => p.coins]),
  pextra: (R, p) => [p.cp, p.coins],
  net: raceNet,
  stat: (R, p) => raceStat(R, p, ` · ${p.coins} coins`),
};
