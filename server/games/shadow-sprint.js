// Shadow Sprint — server rules: laser hazards checked against the character's body every tick.
import { raceInit, raceTick, raceFall, raceIsOver, raceRanking, raceNet, checkpointSpawn } from './raceCommon.js';
import { raceStat } from './common.js';
import { GATES, BEAMS, ROTOR, TILES, BOOSTS, gateState, beamZ, rotorAngle, tileHot } from '../../shared/games/shadow-sprint.js';

function zap(R, p, why) {
  p.zaps++;
  R.emit('zap', { s: p.slot, r: why });
  R.respawn(p, checkpointSpawn(R, p), 0.8);
}

// Character body: feet at y, top at y + 1.45, radius ~0.42.
function hits(p, t) {
  const ch = p.ch;
  const x = ch.x, y = ch.y, z = ch.z;
  const r = 0.42;
  for (const g of GATES) {
    if (gateState(g, t).on && Math.abs(z - g.z) < r + 0.05 && Math.abs(x) < 4.2 && y < 2.2) return 'gate';
  }
  for (const b of BEAMS) {
    const bz = beamZ(b, t);
    if (Math.abs(z - bz) < r + 0.05 && Math.abs(x) < 4.2 && y < 0.55 && y + 1.45 > 0.35) return 'beam';
  }
  // Rotor: a beam from the pillar at height 0.45, length ROTOR.len.
  const a = rotorAngle(t);
  const dx = x - ROTOR.x, dz = z - ROTOR.z;
  const along = dx * Math.sin(a) + dz * Math.cos(a);
  const across = Math.abs(dx * Math.cos(a) - dz * Math.sin(a));
  if (along > 0 && along < ROTOR.len + r && across < r + 0.05 && y < 0.55) return 'rotor';
  // Laser floor: only while touching the floor.
  if (ch.grounded && z > 74 && z < 90) {
    for (const tile of TILES) {
      if (Math.abs(x - tile.x) < 1.35 && Math.abs(z - tile.z) < 1.35 && tileHot(tile, t)) return 'floor';
    }
  }
  return null;
}

export default {
  init(R) {
    raceInit(R, { finishWindow: 20 });
    for (const p of R.players) { p.zaps = 0; p.boostT = 0; }
  },

  tick(R, dt) {
    raceTick(R);
    for (const p of R.players) {
      if (!p.alive || p.finishT !== Infinity || p.ch.stunT > 0) continue;
      const why = hits(p, R.t);
      if (why) { zap(R, p, why); continue; }
      for (const b of BOOSTS) {
        if (Math.abs(p.ch.x - b.x) < 0.9 && Math.abs(p.ch.z - b.z) < 0.9 && p.ch.grounded && p.boostT <= 0) {
          p.boostT = 1.6;
          R.emit('boost', { s: p.slot });
        }
      }
      p.boostT = Math.max(0, p.boostT - dt);
      p.ch.speedMul = p.boostT > 0 ? 1.5 : 1;
    }
  },

  onFall: (R, p) => raceFall(R, p, 0.8),
  isOver: raceIsOver,
  rank: (R) => raceRanking(R, [(p) => -p.zaps]),
  pextra: (R, p) => [p.cp, p.zaps],
  net: raceNet,
  stat: (R, p) => raceStat(R, p, ` · zapped ${p.zaps} ${p.zaps === 1 ? 'time' : 'times'}`),
};
