// Colour Rush — server rules: stages of call / drop / restore with shrinking decision time,
// rotating rings from stage 4 and pads removed for good from stage 5.
import { SWATCHES } from '../../shared/games/colour-rush.js';
import { survivalRank, survivalOver, survivalStat } from './common.js';
import { round2 } from '../../shared/math.js';

const DROP_TIME = 2.0;
const REST_GAP = 0.7;

function newColours(R) {
  const pads = R.layout.data.pads;
  const cols = [];
  for (let i = 0; i < pads.length; i++) cols.push(i % SWATCHES.length);
  R.rng.shuffle(cols);
  return cols.join('');
}

function startStage(R, at) {
  const gs = R.gs;
  gs.st++;
  const pads = R.layout.data.pads;
  // Pick a target colour that still has at least two pads standing.
  let cols = newColours(R);
  let target = R.rng.int(0, SWATCHES.length - 1);
  for (let tries = 0; tries < 20; tries++) {
    const standing = pads.filter((p) => gs.rm[p.index] !== '1' && Number(cols[p.index]) === target).length;
    if (standing >= 2) break;
    cols = newColours(R);
    target = R.rng.int(0, SWATCHES.length - 1);
  }
  gs.cols = cols;
  gs.tg = target;
  const decide = Math.max(1.8, 4.8 - 0.4 * (gs.st - 1));
  gs.call = round2(at);
  gs.drop = round2(at + decide);
  gs.rest = round2(at + decide + DROP_TIME);
  if (gs.st === 4 && gs.rot1 < 0) gs.rot1 = round2(at);
  if (gs.st === 6 && gs.rot0 < 0) gs.rot0 = round2(at);
  R.emit('call', { st: gs.st, tg: target, d: round2(decide) });
}

export default {
  init(R) {
    R.gs.st = 0;
    R.gs.tg = -1;
    R.gs.drop = -1;
    R.gs.rest = -1;
    R.gs.cols = newColours(R);
  },

  start(R) {
    startStage(R, 1.0);
  },

  tick(R) {
    const gs = R.gs;
    if (gs.st > 0 && R.t >= gs.rest + REST_GAP) {
      // Permanently remove pads in later stages (never all of one colour).
      if (gs.st >= 5) {
        const pads = R.layout.data.pads.filter((p) => gs.rm[p.index] !== '1');
        const remove = Math.min(2, Math.max(0, pads.length - 7));
        const rm = gs.rm.split('');
        for (let k = 0; k < remove; k++) {
          const p = R.rng.pick(pads.filter((q) => rm[q.index] !== '1'));
          if (p) rm[p.index] = '1';
        }
        gs.rm = rm.join('');
      }
      startStage(R, R.t);
    }
    if (gs.drop >= 0 && R.t >= gs.drop && !R.data.dropAnnounced) {
      R.data.dropAnnounced = true;
      R.emit('drop', { st: gs.st });
    }
    if (R.t >= gs.rest) R.data.dropAnnounced = false;
  },

  net(R) {
    const gs = R.gs;
    return { st: gs.st, tg: gs.tg, cols: gs.cols, call: gs.call, drop: gs.drop, rest: gs.rest, rm: gs.rm, rot0: gs.rot0, rot1: gs.rot1 };
  },

  pextra: (R, p) => (p.alive ? 1 : 0),
  isOver: survivalOver,
  rank: (R) => survivalRank(R),
  stat(R, p) {
    return p.alive ? `${survivalStat(R, p)} · ${R.gs.st} stages` : survivalStat(R, p);
  },
};
