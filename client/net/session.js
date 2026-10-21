// Session: owns the connection, keeps UI state in sync with the server and decides which
// 3D view the engine shows.
import { Connection } from './connection.js';
import { app, toast, hud } from '../state/store.js';
import { settings } from '../settings.js';
import { PHASE } from '../../shared/constants.js';
import { defaultCosmetic } from '../../shared/cosmetics.js';
import { MenuView } from '../scenes/menuView.js';
import { LobbyView } from '../scenes/lobbyView.js';
import { PodiumView } from '../scenes/podiumView.js';
import { RoundView } from '../game/roundView.js';
import { clearInput } from '../game/input.js';

const STORE_KEY = 'pp-session';

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export function profile() {
  const p = settings.get().profile;
  if (p && p.cosmetic) return p;
  const seed = Math.floor(Math.random() * 12);
  const fresh = { name: '', cosmetic: defaultCosmetic(seed) };
  settings.set({ profile: fresh });
  return fresh;
}

export class Session {
  constructor(engine) {
    this.engine = engine;
    this.conn = new Connection(wsUrl());
    this.view = null;
    this.viewKind = null;
    this.roundView = null;
    this.roundKey = null;
    this.saved = this.loadSaved();

    this.conn.on('state', (s) => app.set({ connection: s }));
    this.conn.on('open', () => this.onOpen());
    this.conn.on('room', (m) => this.onRoom(m.room));
    this.conn.on('phase', (m) => this.onPhase(m));
    this.conn.on('snap', (m) => { if (this.roundView) this.roundView.onSnap(m); });
    this.conn.on('toast', (m) => toast(m.text));
    this.conn.on('emote', (m) => this.onEmote(m));
    this.conn.on('replaced', (m) => { this.forget(); this.toMenu(m.message); });
    this.conn.on('roomClosed', (m) => { this.forget(); this.toMenu(m.message); });
    this.conn.connect();

    app.subscribe(() => this.syncView());
    this.syncView();
  }

  loadSaved() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
  }

  save(code, token) {
    this.saved = { code, token };
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(this.saved)); } catch { /* ignore */ }
  }

  forget() {
    this.saved = null;
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }

  async onOpen() {
    if (this.saved) {
      const r = await this.conn.request('rejoin', this.saved);
      if (r.ok) this.adopt(r.data, true);
      else {
        this.forget();
        if (app.get().screen === 'room') this.toMenu(r.message || 'Your seat could not be restored.');
      }
    }
  }

  adopt(d, rejoined = false) {
    this.save(d.code, d.token);
    // The server may have adjusted our name (duplicates) or colour (already taken).
    const mine = d.room.players.find((p) => p.id === d.playerId);
    if (mine) settings.set({ profile: { name: mine.name, cosmetic: mine.cosmetic } });
    app.set({ room: d.room, playerId: d.playerId, code: d.code, screen: 'room', error: null, busy: null });
    if (d.phase) this.onPhase(d.phase);
    if (rejoined) toast('Reconnected to your room.');
  }

  toMenu(message) {
    this.disposeRound();
    app.set({ screen: 'menu', room: null, phase: null, code: null, playerId: null, overlay: null });
    if (message) toast(message, 'warn');
  }

  // ---------------------------------------------------------------- actions

  async createRoom() {
    const p = profile();
    app.set({ busy: 'Creating room…', error: null });
    const r = await this.conn.request('create', { name: p.name, cosmetic: p.cosmetic });
    if (!r.ok) { app.set({ busy: null, error: r.message || 'Could not create a room.' }); return false; }
    this.adopt(r.data);
    return true;
  }

  async joinRoom(code) {
    const p = profile();
    app.set({ busy: 'Joining room…', error: null });
    const r = await this.conn.request('join', { code, name: p.name, cosmetic: p.cosmetic });
    if (!r.ok) { app.set({ busy: null, error: r.message || 'Could not join that room.' }); return false; }
    this.adopt(r.data);
    return true;
  }

  async leaveRoom() {
    await this.conn.request('leave');
    this.forget();
    this.toMenu();
  }

  async request(type, payload) {
    const r = await this.conn.request(type, payload);
    if (!r.ok && r.message) toast(r.message, 'warn');
    return r;
  }

  setReady(ready) { return this.request('ready', { ready }); }
  setSettings(s) { return this.request('settings', { settings: s }); }
  start() { return this.request('start'); }
  vote(game) { return this.request('vote', { game }); }
  rematch() { return this.request('rematch'); }
  toLobby() { return this.request('toLobby'); }
  emote(id) { return this.conn.request('emote', { id }); }

  async saveProfile(p) {
    settings.set({ profile: p });
    if (this.view && this.viewKind === 'menu') this.view.setPlayerCosmetic(p.cosmetic);
    if (app.get().screen === 'room') {
      const r = await this.conn.request('profile', { name: p.name, cosmetic: p.cosmetic });
      if (r.ok && r.data.name && r.data.name !== p.name) settings.set({ profile: { ...p, name: r.data.name } });
    }
  }

  // ---------------------------------------------------------------- server events

  onRoom(room) {
    app.set({ room });
    if (this.view && this.viewKind === 'lobby') this.view.setPlayers(room.players, app.get().playerId);
  }

  lobbyPreset() {
    const ph = app.get().phase?.phase;
    if (ph === PHASE.RESULTS || ph === PHASE.INTERMISSION) return 'results';
    if (ph === PHASE.VOTING || ph === PHASE.REVEAL || ph === PHASE.PREMATCH) return 'center';
    return 'lobby';
  }

  onPhase(m) {
    const prev = app.get().phase;
    m.receivedAt = performance.now() / 1000;
    app.set({ phase: m });
    if (m.phase === PHASE.PLAYING && this.roundView && this.roundKey === m.data.roundId) {
      this.roundView.setPlaying(m.data.t0);
    }
    if (prev?.phase !== m.phase) clearInput();
    if (m.phase === PHASE.RESULTS && this.view && this.viewKind === 'lobby') this.applyResultMoods(m.data.results);
    if (this.view && this.viewKind === 'lobby') {
      this.view.setPreset(this.lobbyPreset());
      if (m.phase === PHASE.LOBBY || m.phase === PHASE.PREMATCH) this.view.setMoods(new Map());
    }
  }

  onEmote(m) {
    if (this.view && this.view.emote) this.view.emote(m.pid, m.id);
    app.set((s) => ({ emotes: [...s.emotes.slice(-6), { pid: m.pid, id: m.id, at: Date.now() }] }));
  }

  applyResultMoods(results) {
    if (!results) return;
    const moods = new Map();
    const n = results.rows.length;
    for (const r of results.rows) {
      moods.set(r.pid, r.place === 1 ? 'celebrate' : r.place <= Math.max(2, Math.ceil(n / 2)) ? 'happy' : 'sad');
    }
    this.view.setMoods(moods);
    this.view.celebrate(results.rows.filter((r) => r.place === 1).map((r) => r.pid));
  }

  // ---------------------------------------------------------------- view director

  desiredView() {
    const s = app.get();
    if (s.screen !== 'room' || !s.room) return { kind: 'menu' };
    const ph = s.phase?.phase || PHASE.LOBBY;
    if (ph === PHASE.INTRO || ph === PHASE.PLAYING || ph === PHASE.RESOLVE) {
      const roundId = s.phase.data.roundId;
      return { kind: 'round', key: roundId };
    }
    if (ph === PHASE.FINAL) return { kind: 'podium', key: s.phase.matchId };
    return { kind: 'lobby' };
  }

  syncView() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      this.syncViewInner();
    } finally {
      this.syncing = false;
    }
  }

  syncViewInner() {
    const want = this.desiredView();
    const s = app.get();
    if (want.kind === this.viewKind && (want.key === undefined || want.key === this.viewKey)) {
      if (this.viewKind === 'menu' && this.view) this.view.setFocus(s.screen === 'customise' ? 'customise' : 'menu');
      return;
    }
    let view = null;
    if (want.kind === 'menu') {
      view = new MenuView(this.engine);
      view.setFocus(s.screen === 'customise' ? 'customise' : 'menu');
      this.disposeRound(false);
    } else if (want.kind === 'lobby') {
      view = new LobbyView(this.engine);
      view.setPlayers(s.room.players, s.playerId);
      view.setPreset(this.lobbyPreset());
      view.camPos.copy(view.presets[view.preset].pos);
      view.camLook.copy(view.presets[view.preset].look);
      this.disposeRound(false);
      if (s.phase?.phase === PHASE.RESULTS) setTimeout(() => this.applyResultMoods(s.phase.data.results), 0);
    } else if (want.kind === 'podium') {
      view = new PodiumView(this.engine);
      view.setStandings(s.phase.data.standings);
      this.disposeRound(false);
    } else if (want.kind === 'round') {
      const start = s.phase.data.start;
      const players = new Map(s.room.players.map((p) => [p.id, p]));
      view = new RoundView(this.engine, { conn: this.conn, start, myId: s.playerId, players, phase: s.phase.phase === PHASE.INTRO ? 'intro' : 'playing' });
      if (s.phase.phase !== PHASE.INTRO) view.setPlaying(s.phase.data.t0);
      this.roundView = view;
      this.roundKey = want.key;
      const roundId = want.key;
      // Tell the server we have built the arena once a frame has actually rendered.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        app.set({ loadingRound: false });
        this.conn.send({ type: 'loaded', roundId });
      }));
    }
    this.viewKind = want.kind;
    this.viewKey = want.key;
    this.view = view;
    this.engine.setView(view);
    if (want.kind === 'round') app.set({ loadingRound: true });
  }

  disposeRound(clearHud = true) {
    if (this.roundView && this.view !== this.roundView) this.roundView.dispose?.();
    this.roundView = null;
    this.roundKey = null;
    if (clearHud) hud.set({ active: false });
  }
}
