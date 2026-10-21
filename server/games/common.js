// Ranking helpers shared by the server minigame rules.
import { groupBy, asc } from '../scoring/scoring.js';

// Survival: still-alive players first (sharing a place unless extra keys separate them),
// then eliminated players by how long they lasted. Players eliminated in the same tick tie.
export function survivalRank(R, extraKeys = []) {
  return groupBy(R.players, [(p) => (p.alive ? Infinity : p.elimT), ...extraKeys], (p) => p.pid);
}

// Race: finishers by time, then everyone else by progress keys (higher is better).
export function raceRank(R, progressKeys, finishTieKeys = []) {
  return groupBy(
    R.players,
    [
      (p) => (p.finishT !== Infinity ? 1 : 0),
      asc((p) => (p.finishT !== Infinity ? p.finishT : 0)),
      ...progressKeys.map((f) => (p) => (p.finishT !== Infinity ? 0 : f(p))),
      ...finishTieKeys,
    ],
    (p) => p.pid,
  );
}

export function scoreRank(R, tieKeys = []) {
  return groupBy(R.players, [(p) => p.score, ...tieKeys], (p) => p.pid);
}

export function survivalOver(R) {
  return R.players.length >= 2 ? R.aliveCount() <= 1 : R.aliveCount() === 0;
}

export function raceOver(R) {
  return R.players.every((p) => p.finishT !== Infinity || !p.alive || p.forfeited);
}

export { asc };

export function survivalStat(R, p) {
  if (p.alive) return R.aliveCount() === 1 ? 'Last one standing' : 'Survived to the end';
  if (p.forfeited) return 'Left the round';
  return `Lasted ${p.elimT.toFixed(1)}s`;
}

export function raceStat(R, p, extra = '') {
  if (p.finishT !== Infinity) return `Finished in ${p.finishT.toFixed(2)}s${extra}`;
  if (p.forfeited) return 'Left the round';
  return `Did not finish${extra}`;
}
