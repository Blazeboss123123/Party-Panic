// A private room: roster, host, readiness, settings, cosmetics and emotes.
// Tournament progression lives in ../match/tournament.js.
import crypto from 'node:crypto';
import { MAX_PLAYERS, MIN_PLAYERS, ROUND_OPTIONS, NAME_MAX, PHASE, EMOTES } from '../../shared/constants.js';
import { sanitizeCosmetic, BODY_COLORS } from '../../shared/cosmetics.js';
import { Tournament } from '../match/tournament.js';
import { now } from '../match/loop.js';
import { CONFIG, log } from '../config.js';

// Control characters, zero-width characters and bidi overrides are stripped from names.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]', 'g');

export function sanitizeName(raw, fallback) {
  let s = typeof raw === 'string' ? raw : '';
  s = s.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX).trim();
  return s || fallback;
}

export class Room {
  constructor(code, manager) {
    this.code = code;
    this.manager = manager;
    this.players = new Map();
    this.hostId = null;
    this.settings = { rounds: 5, teams: true, repeats: false, lateJoin: true, rematch: true };
    this.joinCounter = 0;
    this.createdAt = now();
    this.emptySince = null;
    this.closed = false;
    this.tournament = new Tournament(this);
  }

  get phase() {
    return this.tournament.phase;
  }

  connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  freeSeat() {
    const used = new Set([...this.players.values()].map((p) => p.seat));
    for (let i = 1; i <= MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return -1;
  }

  uniqueName(name, exceptId) {
    const taken = new Set([...this.players.values()].filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 20; i++) {
      const candidate = `${name.slice(0, NAME_MAX - 2)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  // Newcomers keep their chosen look, but if their colour is already taken they get the
  // first free colour so everyone starts out easy to tell apart.
  distinctCosmetic(c) {
    const used = new Set([...this.players.values()].map((p) => p.cosmetic.color));
    if (!used.has(c.color)) return c;
    for (let i = 0; i < BODY_COLORS.length; i++) if (!used.has(i)) return { ...c, color: i };
    return c;
  }

  // ------------------------------------------------------------------ membership

  addPlayer(client, rawName, rawCosmetic) {
    if (this.players.size >= MAX_PLAYERS) return { error: 'room_full', message: 'This room already has eight players.' };
    const inMatch = this.phase !== PHASE.LOBBY;
    if (inMatch && !this.settings.lateJoin) {
      return { error: 'in_progress', message: 'This room is mid-tournament and the host has turned off late joining.' };
    }
    const seat = this.freeSeat();
    const id = crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(18).toString('base64url');
    const player = {
      id,
      token,
      seat,
      joinOrder: this.joinCounter++,
      name: this.uniqueName(sanitizeName(rawName, `Player ${seat}`)),
      cosmetic: this.distinctCosmetic(sanitizeCosmetic(rawCosmetic, seat - 1)),
      ready: false,
      connected: true,
      client,
      spectator: inMatch, // late arrivals wait for the next round
      disconnectedAt: null,
      lastEmoteAt: 0,
    };
    this.players.set(id, player);
    client.roomCode = this.code;
    client.playerId = id;
    this.emptySince = null;
    if (!this.hostId || !this.players.get(this.hostId)?.connected) this.setHost(id, false);
    this.toast(`${player.name} joined${inMatch ? ' and will play from the next round' : ''}.`, id);
    log(`room ${this.code}: ${player.name} joined (${this.players.size}/${MAX_PLAYERS})`);
    this.broadcastState();
    this.tournament.onPlayerJoined(player);
    return { player };
  }

  rejoin(client, token) {
    const player = [...this.players.values()].find((p) => p.token === token);
    if (!player) return { error: 'seat_expired', message: 'Your seat in this room has expired. Join again with the room code.' };
    if (player.client && player.client !== client) {
      // Same identity connecting again (refresh / new tab): replace the old connection.
      const old = player.client;
      old.roomCode = null;
      old.playerId = null;
      old.send({ type: 'replaced', message: 'You opened this room somewhere else.' });
    }
    player.client = client;
    player.connected = true;
    player.disconnectedAt = null;
    if (player.graceTimer) { clearTimeout(player.graceTimer); player.graceTimer = null; }
    client.roomCode = this.code;
    client.playerId = player.id;
    this.emptySince = null;
    if (!this.players.get(this.hostId)?.connected) this.setHost(player.id, true);
    this.toast(`${player.name} reconnected.`, player.id);
    this.broadcastState();
    this.tournament.onPlayerReconnected(player);
    return { player };
  }

  onDisconnect(client) {
    const player = this.players.get(client.playerId);
    if (!player || player.client !== client) return;
    player.connected = false;
    player.client = null;
    player.disconnectedAt = now();
    player.ready = false;
    this.toast(`${player.name} disconnected.`);
    log(`room ${this.code}: ${player.name} disconnected`);
    if (this.hostId === player.id) this.migrateHost();
    this.tournament.onPlayerDisconnected(player);
    player.graceTimer = setTimeout(() => {
      if (!player.connected && this.players.get(player.id) === player) this.removePlayer(player.id, 'timeout');
    }, CONFIG.reconnectGrace * 1000);
    if (!this.connectedPlayers().length) this.emptySince = now();
    this.broadcastState();
  }

  removePlayer(id, reason = 'left') {
    const player = this.players.get(id);
    if (!player) return;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    this.players.delete(id);
    if (player.client) {
      player.client.roomCode = null;
      player.client.playerId = null;
    }
    this.toast(reason === 'timeout' ? `${player.name} did not come back and left the room.` : `${player.name} left the room.`);
    log(`room ${this.code}: ${player.name} removed (${reason})`);
    if (this.hostId === id) this.migrateHost();
    this.tournament.onPlayerLeft(player);
    if (!this.players.size) {
      this.manager.closeRoom(this.code);
      return;
    }
    if (!this.connectedPlayers().length) this.emptySince = now();
    this.broadcastState();
  }

  setHost(id, announce = true) {
    this.hostId = id;
    const p = this.players.get(id);
    if (p && announce) this.toast(`${p.name} is now the host.`);
  }

  migrateHost() {
    const candidates = [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder);
    if (candidates.length) this.setHost(candidates[0].id, true);
    // If nobody is connected the host seat stays with the absent player; the first player
    // to reconnect takes it over (see rejoin).
  }

  // ------------------------------------------------------------------ lobby actions

  setReady(player, ready) {
    if (this.phase !== PHASE.LOBBY) return { error: 'not_lobby', message: 'You can only ready up in the lobby.' };
    player.ready = !!ready;
    this.broadcastState();
    return { ok: true };
  }

  setProfile(player, { name, cosmetic }) {
    if (name !== undefined) player.name = this.uniqueName(sanitizeName(name, player.name), player.id);
    if (cosmetic !== undefined) player.cosmetic = sanitizeCosmetic(cosmetic, player.seat - 1);
    this.broadcastState();
    return { ok: true, name: player.name, cosmetic: player.cosmetic };
  }

  setSettings(player, s) {
    if (player.id !== this.hostId) return { error: 'not_host', message: 'Only the host can change room settings.' };
    if (this.phase !== PHASE.LOBBY && this.phase !== PHASE.FINAL) {
      return { error: 'in_progress', message: 'Settings can be changed between tournaments.' };
    }
    if (s.rounds !== undefined) {
      if (!ROUND_OPTIONS.includes(s.rounds)) return { error: 'bad_rounds', message: 'Tournaments last 5, 10 or 15 rounds.' };
      this.settings.rounds = s.rounds;
    }
    for (const k of ['teams', 'repeats', 'lateJoin', 'rematch']) {
      if (s[k] !== undefined) this.settings[k] = !!s[k];
    }
    this.broadcastState();
    return { ok: true };
  }

  startCheck() {
    const connected = this.connectedPlayers();
    if (connected.length < MIN_PLAYERS) return { error: 'need_players', message: 'You need at least two connected players to start.' };
    const waiting = connected.filter((p) => p.id !== this.hostId && !p.ready);
    if (waiting.length) {
      return { error: 'not_ready', message: `Waiting for ${waiting.map((p) => p.name).join(', ')} to ready up.` };
    }
    return { ok: true };
  }

  start(player) {
    if (player.id !== this.hostId) return { error: 'not_host', message: 'Only the host can start the tournament.' };
    if (this.phase !== PHASE.LOBBY) return { error: 'in_progress', message: 'A tournament is already running.' };
    const check = this.startCheck();
    if (check.error) return check;
    this.tournament.start();
    return { ok: true };
  }

  emote(player, id) {
    if (!EMOTES.some((e) => e.id === id)) return { error: 'bad_emote' };
    const t = now();
    if (t - player.lastEmoteAt < 1.2) return { error: 'too_fast' };
    player.lastEmoteAt = t;
    this.broadcast({ type: 'emote', pid: player.id, id });
    return { ok: true };
  }

  // ------------------------------------------------------------------ messaging

  broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.connected && p.client) p.client.sendRaw(msg);
  }

  broadcastRaw(msg) {
    for (const p of this.players.values()) if (p.connected && p.client) p.client.sendRaw(msg);
  }

  toast(text, exceptId) {
    const msg = JSON.stringify({ type: 'toast', text });
    for (const p of this.players.values()) if (p.connected && p.client && p.id !== exceptId) p.client.sendRaw(msg);
  }

  publicState() {
    const t = this.tournament;
    return {
      code: this.code,
      hostId: this.hostId,
      settings: this.settings,
      phase: this.phase,
      players: [...this.players.values()]
        .sort((a, b) => a.seat - b.seat)
        .map((p) => ({
          id: p.id,
          seat: p.seat,
          name: p.name,
          cosmetic: p.cosmetic,
          ready: p.ready,
          connected: p.connected,
          spectator: p.spectator,
          total: t.scores.get(p.id)?.total ?? 0,
        })),
      canStart: this.phase === PHASE.LOBBY ? this.startCheck() : null,
    };
  }

  broadcastState() {
    if (this.closed) return;
    this.broadcast({ type: 'room', room: this.publicState() });
  }

  close(message = 'This room has closed.') {
    this.closed = true;
    this.tournament.dispose();
    for (const p of this.players.values()) {
      if (p.graceTimer) clearTimeout(p.graceTimer);
      if (p.client) {
        p.client.send({ type: 'roomClosed', message });
        p.client.roomCode = null;
        p.client.playerId = null;
      }
    }
    this.players.clear();
  }
}
