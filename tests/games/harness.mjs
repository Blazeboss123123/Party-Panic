// Headless minigame harness: runs a server Round in-process with bot inputs, faster than
// real time, and reports the outcome. Used to verify that each minigame is playable,
// resolves in every expected way and ranks players from server state only.
import { Round } from '../../server/match/round.js';
import { DT } from '../../shared/constants.js';
import { placementsFromGroups } from '../../server/scoring/scoring.js';
import { BRAINS } from '../bots/brains.mjs';

export function runGame(gameId, n, { seed = 1234, maxSeconds = 400, brain, roster, disconnect, onTick, teams } = {}) {
  const r = roster || Array.from({ length: n }, (_, i) => ({ pid: 'p' + i, name: 'Bot ' + (i + 1), team: teams ? teams[i] : -1 }));
  const R = new Round({ gameId, seed, roster: r });
  const brainFn = brain || BRAINS[gameId] || BRAINS.idle;
  const mem = r.map(() => ({}));
  const seqs = r.map(() => 0);
  const ticks = Math.round(maxSeconds / DT);
  let snapBytes = 0, snaps = 0;
  for (let i = 0; i < ticks && !R.ended; i++) {
    for (const p of R.players) {
      if (!p.connected) continue;
      const inp = brainFn(R, p, mem[p.slot], i) || { mx: 0, mz: 0, b: 0 };
      seqs[p.slot]++;
      R.pushInputs(p.pid, [[seqs[p.slot], inp.mx || 0, inp.mz || 0, inp.b || 0, inp.ay || 0, inp.ap || 0]]);
    }
    if (disconnect) disconnect(R, i);
    R.step(DT);
    if (onTick) onTick(R, i);
    if (i % 2 === 0) {
      const s = R.snapshot();
      snapBytes += s.head.length + 120;
      snaps++;
    }
  }
  const groups = R.ranking();
  const placements = placementsFromGroups(groups);
  return {
    R,
    ended: R.ended,
    reason: R.endReason,
    t: R.t,
    groups,
    placements,
    avgSnapBytes: snaps ? Math.round(snapBytes / snaps) : 0,
  };
}
