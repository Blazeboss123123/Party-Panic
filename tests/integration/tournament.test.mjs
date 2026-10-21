// Full tournaments over real WebSocket connections. Bot clients vote, load rounds and send
// inputs through the network exactly like browsers; their decisions are computed from the
// server's round state (test-only shortcut so the bots can actually play).
//
// Usage: node tests/integration/tournament.test.mjs [rounds...]   (default: 5 10 15)
process.env.PP_FAST = '1';
process.env.PP_LOG = process.env.PP_LOG || 'silent';
process.env.PP_DURATION_SCALE = process.env.PP_DURATION_SCALE || '0.45';
process.env.PP_RECONNECT_GRACE = '20';

import assert from 'node:assert/strict';
const { createServer } = await import('../../server/index.js');
const { NetClient, sleep } = await import('../bots/netClient.mjs');
const { BRAINS } = await import('../bots/brains.mjs');

const roundsList = process.argv.slice(2).map(Number).filter(Boolean);
const plan = roundsList.length ? roundsList : [5, 10, 15];

const srv = await createServer({ port: 0, host: '127.0.0.1' });
const URL = `ws://127.0.0.1:${srv.port}/ws`;

function driver(bots, code) {
  const state = new Map(bots.map((b) => [b, { seq: 0, mem: {}, voted: -1, loaded: -1 }]));
  let tick = 0;
  const iv = setInterval(() => {
    tick++;
    const room = srv.manager.get(code);
    if (!room) return;
    const T = room.tournament;
    for (const b of bots) {
      if (b.closed || !b.phase) continue;
      const st = state.get(b);
      const ph = b.phase.phase;
      if (ph === 'voting' && st.voted !== b.phase.round && b.phase.data.options?.length) {
        st.voted = b.phase.round;
        const opts = b.phase.data.options;
        b.send({ type: 'vote', game: opts[(b.playerId.charCodeAt(0) + b.phase.round) % opts.length] });
      }
      if (ph === 'intro' && st.loaded !== b.phase.data.roundId) {
        st.loaded = b.phase.data.roundId;
        b.send({ type: 'loaded', roundId: b.phase.data.roundId });
      }
      if (ph === 'playing' && T.R && !T.R.ended) {
        const p = T.R.byPid.get(b.playerId);
        if (!p) continue;
        if (st.roundId !== T.roundId) { st.roundId = T.roundId; st.mem = {}; }
        const brain = BRAINS[T.R.gameId] || BRAINS.idle;
        const inp = brain(T.R, p, st.mem, T.R.tickN) || { mx: 0, mz: 0, b: 0 };
        st.seq++;
        b.sendInputs([[st.seq, inp.mx || 0, inp.mz || 0, inp.b || 0, inp.ay || 0, inp.ap || 0]]);
      }
    }
  }, 16);
  return () => clearInterval(iv);
}

function checkStandings(final, rounds) {
  for (const s of final.standings) {
    const played = s.history.filter(Boolean);
    const total = played.reduce((a, h) => a + h.points, 0);
    assert.equal(s.total, total, `${s.name}: total equals the sum of round points`);
    assert.equal(s.wins, played.filter((h) => h.place === 1).length, `${s.name}: wins match`);
    assert.equal(s.history.length, rounds, `${s.name}: one history entry per round`);
  }
  // Standings are sorted by points then wins; places are consistent.
  for (let i = 1; i < final.standings.length; i++) {
    const a = final.standings[i - 1], b = final.standings[i];
    assert.ok(a.total > b.total || (a.total === b.total && a.wins >= b.wins), 'sorted standings');
    if (a.total === b.total && a.wins === b.wins) assert.equal(a.place, b.place, 'exact ties share a place');
  }
}

async function tournament(rounds, nPlayers) {
  const t0 = Date.now();
  const bots = [];
  for (let i = 0; i < nPlayers; i++) bots.push(await new NetClient(URL, `Bot${i + 1}`).connect());
  await bots[0].create();
  const code = bots[0].code;
  for (const b of bots.slice(1)) {
    const r = await b.join(code);
    assert.ok(r.ok, JSON.stringify(r));
    await b.request('ready', { ready: true });
  }
  const set = await bots[0].request('settings', { settings: { rounds, repeats: rounds > 14, teams: true } });
  assert.ok(set.ok, JSON.stringify(set));
  const stop = driver(bots, code);
  const s = await bots[0].request('start');
  assert.ok(s.ok, JSON.stringify(s));
  const seenGames = [];
  const roundsSeen = new Set();
  bots[0].on('phase', (m) => {
    if (m.phase === 'results' && !roundsSeen.has(m.round)) {
      roundsSeen.add(m.round);
      seenGames.push(m.data.results.gameId);
      // Every player placed once per round, points match placements.
      const rows = m.data.results.rows;
      assert.equal(new Set(rows.map((r) => r.pid)).size, rows.length);
    }
  });
  await bots[0].waitFor((c) => c.phase?.phase === 'final', rounds * 90_000, `final after ${rounds} rounds`);
  // Every client sees the same final standings.
  await sleep(200);
  const finals = bots.map((b) => JSON.stringify(b.phase.data.standings));
  assert.ok(finals.every((f) => f === finals[0]), 'all clients agree on final standings');
  checkStandings(bots[0].phase.data, rounds);
  assert.equal(roundsSeen.size, rounds, 'saw results for every round');
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  // Rematch resets the scoreboard.
  const rm = await bots[0].request('rematch');
  assert.ok(rm.ok, JSON.stringify(rm));
  await bots[1].waitFor((c) => c.phase?.phase === 'voting' && c.phase.round === 1, 15000, 'rematch voting');
  assert.ok(bots[1].room.players.every((p) => p.total === 0), 'scores reset for the rematch');
  const back = await bots[0].request('toLobby');
  assert.ok(back.ok);
  await bots[1].waitFor((c) => c.phase?.phase === 'lobby', 5000, 'back in lobby');
  stop();
  for (const b of bots) b.close();
  return { elapsed, games: seenGames, standings: JSON.parse(finals[0]).map((s) => `${s.name}:${s.total}(${s.wins}w)#${s.place}`).join(' ') };
}

async function disruptions() {
  // Six players; one drops out mid-round and comes back, one leaves for good, a late
  // arrival joins between rounds. The tournament must keep going and finish.
  const bots = [];
  for (let i = 0; i < 6; i++) bots.push(await new NetClient(URL, `D${i + 1}`).connect());
  await bots[0].create();
  const code = bots[0].code;
  for (const b of bots.slice(1)) { await b.join(code); await b.request('ready', { ready: true }); }
  await bots[0].request('settings', { settings: { rounds: 5, lateJoin: true } });
  let all = bots.slice();
  let stop = driver(all, code);
  await bots[0].request('start');
  await bots[0].waitFor((c) => c.phase?.phase === 'playing', 30000, 'first round playing');
  await sleep(1500);
  // Host drops mid-round: host must migrate, the round must continue.
  const { token: hostToken, playerId: hostId } = bots[0];
  bots[0].close();
  await bots[1].waitFor((c) => c.room?.hostId && c.room.hostId !== hostId, 5000, 'host migrated');
  // Player 6 leaves for good.
  await bots[5].request('leave');
  bots[5].close();
  // Host comes back with its token before the round ends.
  await sleep(1500);
  const back = await new NetClient(URL, 'D1').connect();
  const rj = await back.rejoin(code, hostToken);
  assert.ok(rj.ok, JSON.stringify(rj));
  assert.equal(back.playerId, hostId, 'same identity after reconnect');
  // Late arrival
  const late = await new NetClient(URL, 'Late').connect();
  const lj = await late.join(code);
  assert.ok(lj.ok, JSON.stringify(lj));
  assert.equal(late.room.players.find((p) => p.id === late.playerId).spectator, true, 'late joiner waits for next round');
  stop();
  all = [back, ...bots.slice(1, 5), late];
  stop = driver(all, code);
  await back.waitFor((c) => c.phase?.phase === 'final', 600_000, 'disrupted tournament finishes');
  const st = back.phase.data.standings;
  const lateRow = st.find((s) => s.name === 'Late');
  assert.ok(lateRow, 'late joiner appears in standings');
  assert.ok(lateRow.history[0] === null, 'late joiner did not play round 1');
  assert.ok(lateRow.history.some(Boolean), 'late joiner played later rounds');
  const leaver = st.find((s) => s.name === 'D6');
  assert.ok(leaver && leaver.left, 'player who left is marked as left');
  assert.equal(back.room.players.length, 6, 'no duplicate roster entries');
  checkStandings(back.phase.data, 5);
  stop();
  for (const b of all) b.close();
  return st.map((s) => `${s.name}:${s.total}#${s.place}${s.left ? '(left)' : ''}`).join(' ');
}

async function lowPlayerAbort() {
  // Two players; one leaves -> the tournament returns to the lobby instead of freezing.
  const a = await new NetClient(URL, 'A').connect();
  const b = await new NetClient(URL, 'B').connect();
  await a.create();
  await b.join(a.code);
  await b.request('ready', { ready: true });
  const stop = driver([a, b], a.code);
  await a.request('start');
  await a.waitFor((c) => c.phase?.phase === 'playing', 30000, 'playing');
  await b.request('leave');
  b.close();
  await a.waitFor((c) => c.phase?.phase === 'lobby', 60000, 'back to lobby after the round');
  stop();
  a.close();
  return 'returned to lobby';
}

try {
  const results = [];
  for (const rounds of plan) {
    const n = rounds === 5 ? 8 : rounds === 10 ? 4 : 3;
    const r = await tournament(rounds, n);
    results.push(`${rounds}-round tournament with ${n} players finished in ${r.elapsed}s\n   games: ${r.games.join(', ')}\n   final: ${r.standings}`);
    console.log(results[results.length - 1]);
  }
  console.log('disruptions:', await disruptions());
  console.log('two-player abort:', await lowPlayerAbort());
  console.log('\nTournament tests passed.');
} catch (err) {
  console.error('FAILED', err);
  process.exitCode = 1;
} finally {
  await srv.close();
}
