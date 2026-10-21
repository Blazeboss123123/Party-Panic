// Conveyor Chaos — server rules: a checkpoint race through the factory.
import { raceInit, raceTick, raceFall, raceIsOver, raceRanking, raceNet } from './raceCommon.js';
import { raceStat } from './common.js';

export default {
  init(R) {
    raceInit(R, { finishWindow: 20 });
  },
  tick(R) {
    raceTick(R);
  },
  onFall: (R, p) => raceFall(R, p, 0.6),
  isOver: raceIsOver,
  rank: (R) => raceRanking(R),
  pextra: (R, p) => [p.cp],
  net: raceNet,
  stat: (R, p) => raceStat(R, p),
};
