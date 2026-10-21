// Lobby and networking tests over real WebSocket connections.
// Run with: PP_FAST=1 PP_LOG=silent node tests/integration/network.test.mjs
process.env.PP_FAST = process.env.PP_FAST || '1';
process.env.PP_LOG = process.env.PP_LOG || 'silent';
process.env.PP_RECONNECT_GRACE = process.env.PP_RECONNECT_GRACE || '3';

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
const { createServer } = await import('../../server/index.js');
const { NetClient, sleep } = await import('../bots/netClient.mjs');

const srv = await createServer({ port: 0, host: '127.0.0.1' });
const URL = `ws://127.0.0.1:${srv.port}/ws`;
const clients = [];
async function client(name) {
  const c = await new NetClient(URL, name).connect();
  clients.push(c);
  return c;
}
after(async () => {
  for (const c of clients) c.close();
  await srv.close();
});

test('create a room and join it from other connections', async () => {
  const host = await client('Host');
  const r = await host.create();
  assert.ok(r.ok, JSON.stringify(r));
  assert.match(host.code, /^[A-Z]{4}$/);
  const guest = await client('Guest');
  const j = await guest.join(host.code.toLowerCase());
  assert.ok(j.ok, JSON.stringify(j));
  await host.waitFor((c) => c.room.players.length === 2, 2000, 'host sees guest');
  assert.equal(host.room.hostId, host.playerId);
  assert.deepEqual(host.room.players.map((p) => p.name).sort(), ['Guest', 'Host']);
  assert.notEqual(host.playerId, guest.playerId);
});

test('invalid, malformed and missing room codes give useful errors', async () => {
  const c = await client('Lost');
  const bad = await c.join('ab1');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'bad_code');
  const missing = await c.join('QQQQ');
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'no_room');
  assert.match(missing.message, /No room with code QQQQ/);
});

test('eight players fit, the ninth is rejected', async () => {
  const host = await client('P1');
  await host.create();
  const others = [];
  for (let i = 2; i <= 8; i++) {
    const c = await client('P' + i);
    const r = await c.join(host.code);
    assert.ok(r.ok, `player ${i} joins`);
    others.push(c);
  }
  await host.waitFor((c) => c.room.players.length === 8, 2000, '8 players');
  const ninth = await client('P9');
  const r = await ninth.join(host.code);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'room_full');
  const seats = host.room.players.map((p) => p.seat).sort((a, b) => a - b);
  assert.deepEqual(seats, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('ready status syncs and start needs everyone ready and two players', async () => {
  const host = await client('Hosty');
  await host.create();
  let s = await host.request('start');
  assert.equal(s.ok, false);
  assert.equal(s.error, 'need_players');
  const g = await client('Gus');
  await g.join(host.code);
  s = await host.request('start');
  assert.equal(s.error, 'not_ready');
  const notHost = await g.request('start');
  assert.equal(notHost.error, 'not_host');
  await g.request('ready', { ready: true });
  await host.waitFor((c) => c.room.players.find((p) => p.name === 'Gus')?.ready === true, 2000, 'ready sync');
  const set = await g.request('settings', { settings: { rounds: 10 } });
  assert.equal(set.error, 'not_host');
  const set2 = await host.request('settings', { settings: { rounds: 7 } });
  assert.equal(set2.error, 'bad_rounds');
  const set3 = await host.request('settings', { settings: { rounds: 10, teams: false } });
  assert.ok(set3.ok);
  await g.waitFor((c) => c.room.settings.rounds === 10 && c.room.settings.teams === false, 2000, 'settings sync');
  s = await host.request('start');
  assert.ok(s.ok, JSON.stringify(s));
  await g.waitFor((c) => c.phase?.phase === 'prematch', 2000, 'prematch');
  await g.waitFor((c) => c.phase?.phase === 'voting', 3000, 'voting');
  assert.equal(g.phase.data.options.length, 3);
  host.close();
  g.close();
});

test('host disconnect transfers host; reconnect restores identity without duplicates', async () => {
  const host = await client('Alpha');
  await host.create();
  const b = await client('Bravo');
  await b.join(host.code);
  const c = await client('Charlie');
  await c.join(host.code);
  const code = host.code, token = host.token, alphaId = host.playerId;
  host.close();
  await b.waitFor((x) => x.room.hostId === x.playerId, 2000, 'host migrates to Bravo');
  assert.equal(b.room.players.find((p) => p.id === alphaId).connected, false);
  // Alpha comes back with its token.
  const back = await client('Alpha again');
  const r = await back.rejoin(code, token);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(back.playerId, alphaId);
  await b.waitFor((x) => x.room.players.find((p) => p.id === alphaId)?.connected === true, 2000, 'alpha reconnected');
  assert.equal(b.room.players.length, 3, 'no duplicate roster entry');
  assert.equal(b.room.hostId, b.playerId, 'host stays with Bravo');
  // Same token from a second tab replaces the first connection instead of duplicating.
  const tab2 = await client('Alpha tab 2');
  const r2 = await tab2.rejoin(code, token);
  assert.ok(r2.ok);
  await back.waitFor((x) => x.closedByServer === 'replaced', 2000, 'old tab replaced');
  assert.equal(b.room.players.length, 3);
});

test('a player who stays away past the grace period loses their seat', async () => {
  const host = await client('Stay');
  await host.create();
  const leaver = await client('Leaver');
  await leaver.join(host.code);
  const { code, token } = leaver;
  leaver.close();
  await host.waitFor((x) => x.room.players.length === 1, 6000, 'seat released after grace');
  const again = await client('Leaver');
  const r = await again.rejoin(code, token);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'seat_expired');
});

test('clock sync ping returns server time', async () => {
  const c = await client('Pinger');
  const p = await new Promise((resolve) => { c.on('pong', resolve); c.send({ type: 'ping', c: 123 }); });
  assert.equal(p.c, 123);
  assert.ok(typeof p.s === 'number');
});

test('malformed messages are ignored and the connection survives', async () => {
  const c = await client('Fuzzer');
  c.ws.send('not json');
  c.ws.send(JSON.stringify({ type: 123 }));
  c.ws.send(JSON.stringify({ type: 'in', i: 'nope' }));
  c.ws.send(JSON.stringify({ type: 'vote', game: 'x' }));
  await sleep(50);
  const r = await c.create();
  assert.ok(r.ok);
});
