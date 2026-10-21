// Tournament state machine. The server is the only source of truth for the phase, its
// deadline, the chosen minigame, round results and cumulative scores.
//
// lobby -> prematch -> voting -> reveal -> intro -> playing (countdown + gameplay)
//       -> resolve -> results -> intermission -> voting ... -> final -> (rematch | lobby)

import { PHASE, SNAPSHOT_EVERY, MIN_PLAYERS } from '../../shared/constants.js';
import { GAME_META, META_BY_ID } from '../../shared/games/meta.js';
import { makeRng } from '../../shared/math.js';
import { Round } from './round.js';
import { addTicker, removeTicker, now } from './loop.js';
import { chooseOptions, resolveVotes } from './voting.js';
import { placementsFromGroups, finalStandings } from '../scoring/scoring.js';
import { CONFIG, phaseSeconds, log } from '../config.js';
import { SERVER_RULES } from '../games/index.js';
import { SHARED_GAMES } from '../../shared/games/index.js';

// Only minigames with both shared and server implementations can be offered.
const PLAYABLE = GAME_META.filter((g) => SERVER_RULES[g.id] && SHARED_GAMES[g.id]);

export class Tournament {
  constructor(room) {
    this.room = room;
    this.phase = PHASE.LOBBY;
    this.phaseUntil = null;
    this.phaseData = {};
    this.scores = new Map();
    this.total = 5;
    this.round = 0;
    this.played = [];
    this.options = [];
    this.votes = new Map();
    this.chosen = null;
    this.timer = null;
    this.token = 0;
    this.R = null;
    this.ticker = null;
    this.loaded = new Set();
    this.rng = makeRng((Math.random() * 2 ** 32) >>> 0);
    this.matchId = 0;
    this.roundId = 0;
    this.resolvedRoundId = -1;
    this.introStart = 0;
  }

  // ------------------------------------------------------------------ phase plumbing

  setPhase(phase, seconds, data = {}) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.token++;
    this.phase = phase;
    this.phaseUntil = seconds != null ? now() + seconds : null;
    this.phaseData = data;
    this.broadcastPhase();
    this.room.broadcastState();
  }

  after(seconds, fn) {
    if (this.timer) clearTimeout(this.timer);
    const tok = this.token;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (tok !== this.token || this.room.closed) return;
      try {
        fn();
      } catch (err) {
        console.error(`room ${this.room.code}: phase error`, err);
        this.abortToLobby('Something went wrong on the server, so the tournament returned to the lobby.');
      }
    }, Math.max(0, seconds * 1000));
  }

  phaseMessage() {
    return {
      type: 'phase',
      phase: this.phase,
      until: this.phaseUntil,
      serverNow: now(),
      round: this.round,
      total: this.total,
      matchId: this.matchId,
      data: this.phaseData,
    };
  }

  broadcastPhase() {
    this.room.broadcast(this.phaseMessage());
  }

  sendPhaseTo(player) {
    if (player.client) player.client.send(this.phaseMessage());
  }

  participants() {
    return [...this.room.players.values()].filter((p) => !p.spectator);
  }

  eligible() {
    return this.participants().filter((p) => p.connected);
  }

  scoreEntry(player) {
    let e = this.scores.get(player.id);
    if (!e) {
      e = { id: player.id, name: player.name, cosmetic: player.cosmetic, seat: player.seat, total: 0, wins: 0, history: [], left: false, joinedRound: this.round + 1 };
      // Rounds missed before joining are recorded as not played.
      for (let i = 0; i < this.round; i++) e.history.push(null);
      this.scores.set(player.id, e);
    }
    e.name = player.name;
    e.cosmetic = player.cosmetic;
    e.seat = player.seat;
    return e;
  }

  // ------------------------------------------------------------------ flow

  start() {
    this.matchId++;
    this.total = this.room.settings.rounds;
    this.round = 0;
    this.played = [];
    this.scores = new Map();
    this.resolvedRoundId = -1;
    for (const p of this.room.players.values()) {
      p.spectator = false;
      p.ready = false;
      this.scoreEntry(p);
    }
    log(`room ${this.room.code}: tournament ${this.matchId} started (${this.total} rounds)`);
    this.setPhase(PHASE.PREMATCH, phaseSeconds('prematch'), { rounds: this.total });
    this.after(phaseSeconds('prematch'), () => this.beginVoting());
  }

  beginVoting() {
    // Late arrivals become participants between rounds.
    for (const p of this.room.players.values()) {
      if (p.spectator && p.connected && this.room.settings.lateJoin) {
        p.spectator = false;
        this.scoreEntry(p);
      }
    }
    if (this.eligible().length < MIN_PLAYERS) {
      this.abortToLobby('Not enough players are connected to continue, so the tournament ended.');
      return;
    }
    this.round++;
    let options = chooseOptions({
      games: PLAYABLE,
      played: this.played,
      allowRepeats: this.room.settings.repeats,
      teamGames: this.room.settings.teams,
      playerCount: this.eligible().length,
      rng: this.rng,
    });
    if (CONFIG.forceGames.length) {
      // Test hook: put forced games first, cycling through the list by round.
      const forced = CONFIG.forceGames[(this.round - 1) % CONFIG.forceGames.length];
      if (META_BY_ID[forced]) options = [forced, ...options.filter((g) => g !== forced)].slice(0, 3);
    }
    this.options = options;
    this.votes = new Map();
    this.setPhase(PHASE.VOTING, phaseSeconds('voting'), { options, counts: {}, voted: [], votes: {} });
    this.after(phaseSeconds('voting'), () => this.endVoting());
  }

  vote(player, gameId) {
    if (this.phase !== PHASE.VOTING) return { error: 'not_voting', message: 'Voting has closed.' };
    if (player.spectator) return { error: 'spectator', message: 'You can vote from the next round.' };
    if (!this.options.includes(gameId)) return { error: 'bad_option', message: 'That minigame is not one of the options.' };
    if (this.votes.has(player.id)) return { error: 'already_voted', message: 'Your vote is already locked in.' };
    this.votes.set(player.id, gameId);
    const counts = {};
    for (const v of this.votes.values()) counts[v] = (counts[v] || 0) + 1;
    this.phaseData = { ...this.phaseData, counts, voted: [...this.votes.keys()], votes: Object.fromEntries(this.votes) };
    this.broadcastPhase();
    this.checkAllVoted();
    return { ok: true };
  }

  checkAllVoted() {
    if (this.phase !== PHASE.VOTING) return;
    const eligible = this.eligible();
    if (eligible.length && eligible.every((p) => this.votes.has(p.id))) {
      const remaining = this.phaseUntil - now();
      if (remaining > 1) {
        this.phaseUntil = now() + 1;
        this.broadcastPhase();
        this.after(1, () => this.endVoting());
      }
    }
  }

  endVoting() {
    const r = resolveVotes(this.options, this.votes, this.rng);
    this.chosen = r.winner;
    this.setPhase(PHASE.REVEAL, phaseSeconds('reveal'), { options: this.options, counts: r.counts, chosen: r.winner, tied: r.tied, votes: Object.fromEntries(this.votes) });
    this.after(phaseSeconds('reveal'), () => this.beginIntro());
  }

  beginIntro() {
    const roster = this.participants()
      .filter((p) => p.connected || p.disconnectedAt !== null)
      .sort((a, b) => a.seat - b.seat);
    if (roster.filter((p) => p.connected).length < MIN_PLAYERS) {
      this.abortToLobby('Not enough players are connected to continue, so the tournament ended.');
      return;
    }
    const meta = META_BY_ID[this.chosen];
    let teams = roster.map(() => -1);
    if (meta.team) {
      // Balanced random split. With an odd count the extra player joins the team that
      // would otherwise be smaller, so sizes never differ by more than one.
      const order = this.rng.shuffle(roster.map((_, i) => i));
      teams = roster.map(() => 0);
      order.forEach((idx, k) => { teams[idx] = k % 2; });
    }
    const seed = (this.rng() * 2 ** 32) >>> 0;
    this.R = new Round({
      gameId: this.chosen,
      seed,
      roster: roster.map((p, i) => ({ pid: p.id, name: p.name, team: teams[i], connected: p.connected })),
      countdown: CONFIG.countdown,
      durationScale: CONFIG.durationScale,
    });
    this.roundId++;
    this.loaded = new Set();
    this.introStart = now();
    this.setPhase(PHASE.INTRO, phaseSeconds('introMax'), { gameId: this.chosen, roundId: this.roundId, start: this.R.startInfo() });
    this.after(phaseSeconds('introMax'), () => this.beginPlaying());
  }

  markLoaded(player, roundId) {
    if (this.phase !== PHASE.INTRO || roundId !== this.roundId) return;
    this.loaded.add(player.id);
    this.maybeStartAfterLoad();
  }

  maybeStartAfterLoad() {
    if (this.phase !== PHASE.INTRO || !this.R) return;
    const waiting = this.R.players.filter((p) => p.connected && !this.loaded.has(p.pid));
    if (waiting.length) return;
    const remaining = phaseSeconds('introMin') - (now() - this.introStart);
    this.after(Math.max(0, remaining), () => this.beginPlaying());
  }

  beginPlaying() {
    if (!this.R) return;
    const t0 = now() + -this.R.t; // server time at which round time reaches 0
    this.setPhase(PHASE.PLAYING, null, {
      gameId: this.chosen,
      roundId: this.roundId,
      t0,
      duration: this.R.duration,
      start: this.R.startInfo(),
    });
    const R = this.R;
    this.ticker = (dt) => this.tickRound(R, dt);
    addTicker(this.ticker);
  }

  tickRound(R, dt) {
    if (R !== this.R) { removeTicker(this.ticker); return; }
    try {
      R.step(dt);
    } catch (err) {
      console.error(`room ${this.room.code}: round error in ${R.gameId}`, err);
      this.abortToLobby('Something went wrong in that minigame, so the tournament returned to the lobby.');
      return;
    }
    if (R.tickN % SNAPSHOT_EVERY === 0 || R.ended) this.sendSnapshot(R);
    if (R.ended) {
      removeTicker(this.ticker);
      this.ticker = null;
      this.beginResolve();
    }
  }

  sendSnapshot(R) {
    const snap = R.snapshot();
    const plain = snap.head + '}';
    for (const p of this.room.players.values()) {
      if (!p.connected || !p.client) continue;
      const rp = R.byPid.get(p.id);
      if (rp) p.client.sendRaw(`${snap.head},"me":${JSON.stringify(snap.me(rp))}}`);
      else p.client.sendRaw(plain);
    }
  }

  input(player, list) {
    if (this.phase === PHASE.PLAYING && this.R && !this.R.ended) this.R.pushInputs(player.id, list);
  }

  beginResolve() {
    const R = this.R;
    if (!R || this.resolvedRoundId === this.roundId) return;
    this.resolvedRoundId = this.roundId;
    const placements = placementsFromGroups(R.ranking());
    const byPid = new Map(placements.map((pl) => [pl.id, pl]));
    const rows = [];
    for (const e of this.scores.values()) {
      const pl = byPid.get(e.id);
      if (pl) {
        e.total += pl.points;
        if (pl.place === 1) e.wins++;
        e.history.push({ round: this.round, gameId: R.gameId, place: pl.place, points: pl.points });
        const rp = R.byPid.get(e.id);
        rows.push({
          pid: e.id, name: e.name, cosmetic: e.cosmetic, seat: e.seat, place: pl.place, points: pl.points,
          total: e.total, team: rp.team, stat: R.rules.stat ? R.rules.stat(R, rp) : '',
        });
      } else {
        e.history.push(null);
      }
    }
    rows.sort((a, b) => a.place - b.place || a.seat - b.seat);
    this.played.push(R.gameId);
    const results = {
      round: this.round,
      total: this.total,
      gameId: R.gameId,
      endReason: R.endReason,
      rows,
      teamResult: R.rules.teamResult ? R.rules.teamResult(R) : null,
      standings: this.standings(),
    };
    this.lastResults = results;
    log(`room ${this.room.code}: round ${this.round} ${R.gameId} -> ${rows.map((r) => `${r.name}#${r.place}`).join(', ')}`);
    this.setPhase(PHASE.RESOLVE, phaseSeconds('resolve'), { results });
    this.after(phaseSeconds('resolve'), () => this.beginResults());
  }

  standings() {
    const list = [...this.scores.values()].map((e) => ({ ...e, history: e.history.slice() }));
    return finalStandings(list);
  }

  beginResults() {
    this.setPhase(PHASE.RESULTS, phaseSeconds('results'), { results: this.lastResults });
    this.after(phaseSeconds('results'), () => {
      if (this.round < this.total) this.beginIntermission();
      else this.beginFinal();
    });
  }

  beginIntermission() {
    this.R = null;
    this.setPhase(PHASE.INTERMISSION, phaseSeconds('intermission'), { standings: this.standings(), nextRound: this.round + 1 });
    this.after(phaseSeconds('intermission'), () => this.beginVoting());
  }

  beginFinal() {
    this.R = null;
    const standings = this.standings();
    const top = standings.filter((s) => s.place === 1);
    log(`room ${this.room.code}: tournament ${this.matchId} finished, winner(s): ${top.map((s) => s.name).join(', ')}`);
    this.setPhase(PHASE.FINAL, null, {
      standings,
      games: this.played.slice(),
      tiedForFirst: top.length > 1,
    });
  }

  rematch(player) {
    if (player.id !== this.room.hostId) return { error: 'not_host', message: 'Only the host can start a rematch.' };
    if (this.phase !== PHASE.FINAL) return { error: 'not_final', message: 'Rematches start from the final results.' };
    if (!this.room.settings.rematch) return { error: 'rematch_off', message: 'Rematches are turned off for this room.' };
    if (this.room.connectedPlayers().length < MIN_PLAYERS) return { error: 'need_players', message: 'You need at least two connected players for a rematch.' };
    this.start();
    return { ok: true };
  }

  toLobby(player) {
    if (player.id !== this.room.hostId) return { error: 'not_host', message: 'Only the host can end the tournament.' };
    if (this.phase === PHASE.LOBBY) return { ok: true };
    this.abortToLobby(this.phase === PHASE.FINAL ? null : `${player.name} ended the tournament.`);
    return { ok: true };
  }

  abortToLobby(message) {
    if (this.ticker) removeTicker(this.ticker);
    this.ticker = null;
    this.R = null;
    for (const p of this.room.players.values()) {
      p.ready = false;
      p.spectator = false;
    }
    this.setPhase(PHASE.LOBBY, null, { message: message || null });
    if (message) this.room.toast(message);
  }

  // ------------------------------------------------------------------ membership events

  onPlayerJoined(player) {
    if (this.phase !== PHASE.LOBBY) this.sendPhaseTo(player);
  }

  onPlayerReconnected(player) {
    if (this.R) this.R.setConnected(player.id, true);
    this.sendPhaseTo(player);
  }

  onPlayerDisconnected(player) {
    if (this.R) this.R.setConnected(player.id, false);
    if (this.phase === PHASE.VOTING) this.checkAllVoted();
    if (this.phase === PHASE.INTRO) this.maybeStartAfterLoad();
  }

  onPlayerLeft(player) {
    const e = this.scores.get(player.id);
    if (e) e.left = true;
    if (this.R) this.R.setConnected(player.id, false);
    if (this.phase === PHASE.VOTING) this.checkAllVoted();
    if (this.phase === PHASE.INTRO) this.maybeStartAfterLoad();
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.ticker) removeTicker(this.ticker);
    this.timer = null;
    this.ticker = null;
    this.R = null;
    this.token++;
  }
}
