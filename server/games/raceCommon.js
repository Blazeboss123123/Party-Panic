// Shared server logic for course races: checkpoints, respawns, finish detection,
// progress tracking and a finish window after the first player crosses the line.
import { pathProgress } from '../../shared/games/kit.js';
import { inBox } from '../../shared/games/raceKit.js';
import { raceRank, raceOver, asc } from './common.js';

export function raceInit(R, { finishWindow = 20 } = {}) {
  for (const p of R.players) {
    p.cp = 0;
    p.progress = 0;
    p.coins = 0;
    p.cpT = 0;
  }
  R.data.finishWindow = finishWindow;
  R.data.cutoff = null;
}

export function checkpointSpawn(R, p) {
  const course = R.layout.course;
  const cp = course.checkpoints[p.cp];
  const off = ((p.slot % 4) - 1.5) * 1.1;
  return { x: cp.x + off * (cp.spread ?? 1), y: cp.y + 0.1, z: cp.z - Math.floor(p.slot / 4) * 1.1, yaw: 0 };
}

export function raceTick(R, onCheckpoint) {
  const course = R.layout.course;
  for (const p of R.players) {
    if (!p.alive || p.finishT !== Infinity) continue;
    const ch = p.ch;
    while (p.cp + 1 < course.checkpoints.length && ch.z >= course.checkpoints[p.cp + 1].z && ch.y > course.checkpoints[p.cp + 1].y - 3) {
      p.cp++;
      p.cpT = R.t;
      R.emit('cp', { s: p.slot, n: p.cp });
      if (onCheckpoint) onCheckpoint(p);
    }
    p.progress = Math.max(p.progress, pathProgress(course.path, ch.x, ch.z));
    if (inBox(course.finish, ch.x, ch.y + 0.5, ch.z)) {
      R.finishPlayer(p);
      if (R.data.cutoff === null) {
        R.data.cutoff = Math.min(R.duration, R.t + R.data.finishWindow);
        R.emit('cutoff', { t: R.data.cutoff });
      }
    }
  }
}

export function raceFall(R, p, penalty = 0.8) {
  R.respawn(p, checkpointSpawn(R, p), penalty);
}

export function raceIsOver(R) {
  if (raceOver(R)) return true;
  return R.data.cutoff !== null && R.t >= R.data.cutoff;
}

// Finishers by time; others by checkpoint, then furthest progress, then who reached that
// checkpoint first; extra keys (coins etc.) break any remaining ties.
export function raceRanking(R, extraKeys = []) {
  return raceRank(
    R,
    [(p) => p.cp, (p) => Math.round(p.progress * 10) / 10, (p) => -p.cpT],
    extraKeys,
  );
}

export function raceNet(R) {
  return R.data.cutoff !== null ? { cut: R.data.cutoff } : undefined;
}

export { asc };
