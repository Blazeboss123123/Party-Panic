import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placementsFromGroups, groupBy, asc, finalStandings, pointsForPlace } from '../../server/scoring/scoring.js';
import { chooseOptions, resolveVotes } from '../../server/match/voting.js';
import { makeRng } from '../../shared/math.js';

test('points table for eight players', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(pointsForPlace), [10, 8, 7, 6, 5, 4, 3, 2]);
});

test('ties share placement using competition ranking', () => {
  const r = placementsFromGroups([['a'], ['b', 'c'], ['d']]);
  assert.deepEqual(r, [
    { id: 'a', place: 1, points: 10 },
    { id: 'b', place: 2, points: 8 },
    { id: 'c', place: 2, points: 8 },
    { id: 'd', place: 4, points: 6 },
  ]);
});

test('fewer players award the occupied positions', () => {
  const r = placementsFromGroups([['x'], ['y'], ['z']]);
  assert.deepEqual(r.map((e) => e.points), [10, 8, 7]);
});

test('team result: winners share 1st, losers share next place', () => {
  const r = placementsFromGroups([['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']]);
  assert.equal(r.find((e) => e.id === 'a').points, 10);
  assert.equal(r.find((e) => e.id === 'e').place, 5);
  assert.equal(r.find((e) => e.id === 'e').points, 5);
});

test('duplicate ids are only placed once', () => {
  const r = placementsFromGroups([['a'], ['a', 'b']]);
  assert.equal(r.length, 2);
  assert.equal(r[1].place, 2);
});

test('groupBy sorts by keys and groups exact ties', () => {
  const items = [
    { id: 'slow', fin: 30 }, { id: 'fast', fin: 20 }, { id: 'same', fin: 20 }, { id: 'dnf', fin: Infinity },
  ];
  const g = groupBy(items, [asc((x) => x.fin)]);
  assert.deepEqual(g, [['fast', 'same'], ['slow'], ['dnf']]);
});

test('final standings tiebreak on wins then shared', () => {
  const s = finalStandings([
    { id: 'a', total: 30, wins: 1 },
    { id: 'b', total: 30, wins: 2 },
    { id: 'c', total: 20, wins: 0 },
    { id: 'd', total: 20, wins: 0 },
  ]);
  assert.deepEqual(s.map((p) => [p.id, p.place]), [['b', 1], ['a', 2], ['c', 3], ['d', 3]]);
});

const games = Array.from({ length: 15 }, (_, i) => ({ id: 'g' + i, team: i === 13, minPlayers: 2 }));

test('options exclude played games and team games when disabled', () => {
  const rng = makeRng(1);
  for (let k = 0; k < 50; k++) {
    const o = chooseOptions({ games, played: ['g0', 'g1'], allowRepeats: false, teamGames: false, playerCount: 4, rng });
    assert.equal(o.length, 3);
    assert.equal(new Set(o).size, 3);
    assert.ok(!o.includes('g0') && !o.includes('g1') && !o.includes('g13'));
  }
});

test('options fall back to least recently played when pool is exhausted', () => {
  const rng = makeRng(2);
  const played = games.filter((g) => !g.team).map((g) => g.id); // all 14 non-team games played
  const o = chooseOptions({ games, played, allowRepeats: false, teamGames: false, playerCount: 4, rng });
  assert.deepEqual(o.sort(), ['g0', 'g1', 'g2']);
});

test('fifteen rounds without repeats never gets stuck', () => {
  const rng = makeRng(3);
  const played = [];
  for (let r = 0; r < 15; r++) {
    const o = chooseOptions({ games, played, allowRepeats: false, teamGames: false, playerCount: 2, rng });
    assert.equal(o.length, 3);
    played.push(o[0]);
  }
  assert.equal(new Set(played.slice(0, 14)).size, 14);
});

test('vote ties are resolved randomly among tied options only', () => {
  const seen = new Set();
  for (let s = 0; s < 40; s++) {
    const rng = makeRng(s);
    const votes = new Map([['p1', 'a'], ['p2', 'b']]);
    const r = resolveVotes(['a', 'b', 'c'], votes, rng);
    assert.ok(r.winner === 'a' || r.winner === 'b');
    assert.equal(r.tied, true);
    seen.add(r.winner);
  }
  assert.equal(seen.size, 2);
});

test('missing votes do not block a result', () => {
  const r = resolveVotes(['a', 'b', 'c'], new Map(), makeRng(9));
  assert.ok(['a', 'b', 'c'].includes(r.winner));
});

test('majority wins', () => {
  const votes = new Map([['p1', 'c'], ['p2', 'c'], ['p3', 'a']]);
  assert.equal(resolveVotes(['a', 'b', 'c'], votes, makeRng(5)).winner, 'c');
});
