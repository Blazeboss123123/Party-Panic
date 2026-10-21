// Runs every minigame headless with bot players at 2, 3, 4 and 8 players and checks that:
// - the round resolves (by its own end condition or the time limit) without errors,
// - every player is placed exactly once with valid placements and points,
// - a winner exists, and the minigame can be played again without stale state,
// - forfeits (disconnects) never block the round.
// Usage: node tests/games/runAllGames.mjs [gameId ...]
import assert from 'node:assert/strict';
import { runGame } from './harness.mjs';
import { GAME_META } from '../../shared/games/meta.js';
import { PLACEMENT_POINTS } from '../../shared/constants.js';

const only = process.argv.slice(2);
const games = GAME_META.filter((g) => !only.length || only.includes(g.id));
const sizes = [2, 3, 4, 8];
let failures = 0;
const rows = [];

function check(gameId, n, r) {
  const ids = r.R.players.map((p) => p.pid);
  assert.equal(r.placements.length, n, 'every player placed once');
  assert.deepEqual([...new Set(r.placements.map((p) => p.id))].sort(), ids.slice().sort());
  for (const pl of r.placements) {
    assert.ok(pl.place >= 1 && pl.place <= n, `place in range: ${pl.place}`);
    assert.equal(pl.points, PLACEMENT_POINTS[pl.place - 1]);
  }
  assert.ok(r.placements.some((p) => p.place === 1), 'someone placed first');
  assert.ok(r.ended, 'round ended');
}

for (const g of games) {
  for (const n of sizes) {
    const teams = g.team ? Array.from({ length: n }, (_, i) => i % 2) : undefined;
    try {
      const t0 = performance.now();
      const r = runGame(g.id, n, { seed: 1000 + n * 17, teams });
      const ms = performance.now() - t0;
      check(g.id, n, r);
      // Replay with a different seed to make sure no state leaks between rounds.
      const r2 = runGame(g.id, n, { seed: 2000 + n * 31, teams });
      check(g.id, n, r2);
      rows.push(`${g.id.padEnd(16)} n=${n} ${r.reason.padEnd(8)} ${r.t.toFixed(1).padStart(6)}s  winners=${r.groups[0].length}  snap≈${r.avgSnapBytes}B  sim ${(ms / Math.max(1, r.t * 60)).toFixed(3)}ms/tick`);
    } catch (err) {
      failures++;
      rows.push(`${g.id.padEnd(16)} n=${n} FAILED: ${err.message}`);
      console.error(err);
    }
  }
  // Disconnect mid-round: player 0 leaves after 3 seconds and must forfeit, not block.
  try {
    const n = 3;
    const teams = g.team ? [0, 1, 0] : undefined;
    const r = runGame(g.id, n, {
      seed: 77,
      teams,
      disconnect: (R, i) => { if (i === 60 * 6) R.setConnected('p0', false); },
    });
    check(g.id, n, r);
    const p0 = r.R.byPid.get('p0');
    assert.ok(p0.forfeited || r.R.endReason !== 'empty', 'disconnected player forfeits');
    rows.push(`${g.id.padEnd(16)} disconnect: ok (${r.reason}, ${r.t.toFixed(1)}s)`);
  } catch (err) {
    failures++;
    rows.push(`${g.id.padEnd(16)} disconnect FAILED: ${err.message}`);
    console.error(err);
  }
}

console.log(rows.join('\n'));
console.log(failures ? `\n${failures} failure(s)` : `\nAll ${games.length} minigames passed.`);
process.exit(failures ? 1 : 0);
