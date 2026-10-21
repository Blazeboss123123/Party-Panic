// WebSocket hub: connection handling, a small Socket.IO-style event protocol with
// request/acknowledgement ids, clock sync, heartbeats, payload validation and rate limits.
//
// Client -> server messages are JSON objects { type, rid?, ...payload }. When a request
// carries rid, the server answers with { type: 'ack', rid, ok, error?, message?, data? }.

import { WebSocketServer } from 'ws';
import { now } from '../match/loop.js';
import { PHASE } from '../../shared/constants.js';
import { log } from '../config.js';

const PROTOCOL_VERSION = 1;
let nextClientId = 1;

class Client {
  constructor(ws, ip) {
    this.id = nextClientId++;
    this.ws = ws;
    this.ip = ip;
    this.roomCode = null;
    this.playerId = null;
    this.alive = true;
    this.tokens = 240;
    this.lastRefill = now();
  }
  sendRaw(str) {
    if (this.ws.readyState === 1) this.ws.send(str);
  }
  send(obj) {
    this.sendRaw(JSON.stringify(obj));
  }
  allow() {
    // Token bucket: 120 messages per second sustained, bursts of 240.
    const t = now();
    this.tokens = Math.min(240, this.tokens + (t - this.lastRefill) * 120);
    this.lastRefill = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export function attachHub(server, manager) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const c = ws.client;
      if (!c) continue;
      if (!c.alive) { ws.terminate(); continue; }
      c.alive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 10_000);
  heartbeat.unref?.();

  wss.on('connection', (ws, req) => {
    const client = new Client(ws, req.socket.remoteAddress);
    ws.client = client;
    ws.on('pong', () => { client.alive = true; });
    ws.on('message', (data, isBinary) => {
      client.alive = true;
      if (isBinary) return;
      if (!client.allow()) return;
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      try {
        handle(client, msg, manager);
      } catch (err) {
        console.error('handler error', msg.type, err);
        if (msg.rid) client.send({ type: 'ack', rid: msg.rid, ok: false, error: 'server_error', message: 'Something went wrong on the server.' });
      }
    });
    ws.on('close', () => {
      const room = manager.get(client.roomCode);
      if (room) room.onDisconnect(client);
    });
    ws.on('error', () => {});
    client.send({ type: 'welcome', v: PROTOCOL_VERSION, serverNow: now() });
  });

  return { wss, close: () => { clearInterval(heartbeat); wss.close(); } };
}

function reply(client, msg, result) {
  if (!msg.rid) return;
  if (result && result.error) client.send({ type: 'ack', rid: msg.rid, ok: false, error: result.error, message: result.message || '' });
  else client.send({ type: 'ack', rid: msg.rid, ok: true, data: result || {} });
}

function joinedPayload(room, player) {
  return {
    code: room.code,
    playerId: player.id,
    token: player.token,
    room: room.publicState(),
    phase: room.tournament.phaseMessage(),
  };
}

function handle(client, msg, manager) {
  const type = msg.type;

  if (type === 'ping') {
    client.send({ type: 'pong', c: msg.c, s: now() });
    return;
  }

  const room = manager.get(client.roomCode);
  const player = room ? room.players.get(client.playerId) : null;

  if (type === 'in') {
    if (room && player && Array.isArray(msg.i)) room.tournament.input(player, msg.i);
    return;
  }

  switch (type) {
    case 'create': {
      if (room) room.removePlayer(client.playerId, 'left');
      const r = manager.createRoom();
      if (!r) return reply(client, msg, { error: 'server_full', message: 'The server cannot host more rooms right now. Try again soon.' });
      const res = r.addPlayer(client, msg.name, msg.cosmetic);
      if (res.error) { manager.closeRoom(r.code); return reply(client, msg, res); }
      return reply(client, msg, joinedPayload(r, res.player));
    }
    case 'join': {
      const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
      if (!/^[A-Z]{4}$/.test(code)) return reply(client, msg, { error: 'bad_code', message: 'Room codes are four letters.' });
      const target = manager.get(code);
      if (!target) return reply(client, msg, { error: 'no_room', message: `No room with code ${code} exists. Check the code with your host.` });
      if (room && room !== target) room.removePlayer(client.playerId, 'left');
      if (room === target && player) return reply(client, msg, joinedPayload(target, player));
      const res = target.addPlayer(client, msg.name, msg.cosmetic);
      if (res.error) return reply(client, msg, res);
      return reply(client, msg, joinedPayload(target, res.player));
    }
    case 'rejoin': {
      const target = manager.get(msg.code);
      if (!target) return reply(client, msg, { error: 'no_room', message: 'That room has closed.' });
      if (typeof msg.token !== 'string' || msg.token.length > 64) return reply(client, msg, { error: 'bad_token', message: 'Your seat could not be restored.' });
      const res = target.rejoin(client, msg.token);
      if (res.error) return reply(client, msg, res);
      return reply(client, msg, joinedPayload(target, res.player));
    }
  }

  if (!room || !player) {
    if (msg.rid) reply(client, msg, { error: 'no_room', message: 'You are not in a room.' });
    return;
  }

  switch (type) {
    case 'leave':
      room.removePlayer(player.id, 'left');
      return reply(client, msg, { ok: true });
    case 'ready':
      return reply(client, msg, room.setReady(player, !!msg.ready));
    case 'profile':
      return reply(client, msg, room.setProfile(player, { name: msg.name, cosmetic: msg.cosmetic }));
    case 'settings':
      return reply(client, msg, room.setSettings(player, msg.settings || {}));
    case 'start':
      return reply(client, msg, room.start(player));
    case 'vote':
      return reply(client, msg, room.tournament.vote(player, msg.game));
    case 'emote':
      return reply(client, msg, room.emote(player, msg.id));
    case 'loaded':
      room.tournament.markLoaded(player, msg.roundId);
      return;
    case 'rematch':
      return reply(client, msg, room.tournament.rematch(player));
    case 'toLobby':
      return reply(client, msg, room.tournament.toLobby(player));
    case 'sync':
      // Client asks for a fresh copy of room + phase state (e.g. after waking a hidden tab).
      client.send({ type: 'room', room: room.publicState() });
      client.send(room.tournament.phaseMessage());
      return;
    default:
      if (msg.rid) reply(client, msg, { error: 'unknown', message: 'Unknown request.' });
  }
}

export { PHASE, log };
