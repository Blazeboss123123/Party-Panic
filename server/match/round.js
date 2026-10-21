// Authoritative simulation of one minigame round.
//
// Clients only send inputs (movement direction, buttons, aim). The round steps every
// character with the shared controller, applies the minigame's server rules, and produces
// snapshots. Rankings come exclusively from server state.

import { DT, BTN, EDGE_MASK, FLAG, ROUND_DISCONNECT_FORFEIT, PHASE_TIME } from '../../shared/constants.js';
import { makeChar, stepChar, separateChars, makeMove } from '../../shared/controller.js';
import { createWorld } from '../../shared/games/kit.js';
import { SHARED_GAMES } from '../../shared/games/index.js';
import { META_BY_ID } from '../../shared/games/meta.js';
import { makeRng, round3, round2, clamp } from '../../shared/math.js';
import { SERVER_RULES } from '../games/index.js';

const MAX_QUEUE = 20;
const MAX_STEPS_PER_TICK = 3;
const STARVE_TICKS = 5;

export class Round {
  constructor({ gameId, seed, roster, countdown = PHASE_TIME.countdown, durationScale = 1 }) {
    this.gameId = gameId;
    this.meta = META_BY_ID[gameId];
    this.def = SHARED_GAMES[gameId];
    this.rules = SERVER_RULES[gameId];
    if (!this.def || !this.rules) throw new Error(`Unknown game ${gameId}`);
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed ^ 0x5bd1e995);
    this.roster = roster;
    this.layout = this.def.build({ seed: this.seed, n: roster.length, teams: roster.map((r) => r.team ?? -1) });
    this.world = createWorld(this.layout);
    this.gs = this.world.gs;
    this.P = makeMove(this.def.move);
    this.duration = this.meta.duration * durationScale;
    this.durationScale = durationScale;
    this.t = -countdown;
    this.tickN = 0;
    this.ended = false;
    this.endReason = null;
    this.events = [];
    this.players = roster.map((r, slot) => {
      const sp = this.layout.spawns[slot] || this.layout.spawns[0];
      const ch = makeChar(sp.x, sp.y, sp.z, sp.yaw || 0);
      ch.lock = 1;
      return {
        slot,
        pid: r.pid,
        name: r.name,
        team: r.team ?? -1,
        ch,
        alive: true,
        elimT: Infinity,
        finishT: Infinity,
        score: 0,
        connected: r.connected !== false,
        discAt: r.connected === false ? 0 : null,
        forfeited: false,
        q: [],
        ack: 0,
        lastSeq: 0,
        tokens: 2,
        starve: 0,
        held: 0,
        lastInput: { mx: 0, mz: 0, b: 0, ay: 0, ap: 0 },
        flags: 0,
        hidden: false,
        data: {},
      };
    });
    this.bySlot = this.players;
    this.byPid = new Map(this.players.map((p) => [p.pid, p]));
    this.world.setTime(this.t, DT);
    this.data = {};
    this.rules.init(this);
  }

  // ------------------------------------------------------------------ inputs

  pushInputs(pid, list) {
    const p = this.byPid.get(pid);
    if (!p || this.ended || !Array.isArray(list)) return;
    for (const raw of list.slice(0, 16)) {
      if (!Array.isArray(raw) || raw.length < 4) continue;
      const seq = raw[0] | 0;
      if (seq <= p.lastSeq) continue;
      let mx = Number(raw[1]), mz = Number(raw[2]);
      const b = (raw[3] | 0) & 0x3ff;
      let ay = Number(raw[4] ?? 0), ap = Number(raw[5] ?? 0);
      if (!Number.isFinite(mx)) mx = 0;
      if (!Number.isFinite(mz)) mz = 0;
      if (!Number.isFinite(ay)) ay = 0;
      if (!Number.isFinite(ap)) ap = 0;
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
      p.lastSeq = seq;
      p.q.push({ seq, mx, mz, b, ay: clamp(ay, -Math.PI, Math.PI), ap: clamp(ap, -1.5, 1.5) });
    }
    while (p.q.length > MAX_QUEUE) {
      // Drop the oldest input but keep its button presses so actions are not lost.
      const dropped = p.q.shift();
      p.q[0].b |= dropped.b & EDGE_MASK;
    }
  }

  setConnected(pid, connected) {
    const p = this.byPid.get(pid);
    if (!p) return;
    p.connected = connected;
    p.discAt = connected ? null : Math.max(this.t, 0);
    if (!connected) p.q.length = 0;
  }

  // ------------------------------------------------------------------ helpers for rules

  emit(k, data = {}) {
    this.events.push({ k, ...data });
  }

  get playing() {
    return this.t >= 0 && !this.ended;
  }

  alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  aliveCount() {
    let n = 0;
    for (const p of this.players) if (p.alive) n++;
    return n;
  }

  eliminate(p, reason = 'out') {
    if (!p.alive) return;
    p.alive = false;
    p.elimT = Math.max(0, this.t);
    p.ch.lock = 1;
    p.hidden = true;
    this.emit('elim', { s: p.slot, r: reason });
    if (this.rules.onEliminate) this.rules.onEliminate(this, p, reason);
  }

  finishPlayer(p) {
    if (p.finishT !== Infinity) return;
    p.finishT = this.t;
    p.ch.lock = 2;
    const place = this.players.filter((q) => q.finishT !== Infinity).length;
    this.emit('finish', { s: p.slot, t: round2(this.t), n: place });
  }

  respawn(p, sp, penalty = 0) {
    const ch = p.ch;
    ch.x = sp.x; ch.y = sp.y; ch.z = sp.z; ch.yaw = sp.yaw || 0;
    ch.vx = ch.vy = ch.vz = 0;
    ch.svx = ch.svz = 0;
    ch.kbT = 0; ch.dashT = 0; ch.sprT = 0;
    ch.grounded = false; ch.gid = -1;
    ch.stunT = penalty;
    this.emit('respawn', { s: p.slot });
  }

  // ------------------------------------------------------------------ simulation

  step(dt = DT) {
    if (this.ended) return;
    const wasCountdown = this.t < 0;
    this.t += dt;
    this.tickN++;
    if (wasCountdown && this.t >= 0) {
      for (const p of this.players) if (p.alive && p.ch.lock === 1 && !p.hidden) p.ch.lock = 0;
      if (this.rules.start) this.rules.start(this);
      this.emit('go');
    }
    this.world.setTime(this.t, dt);
    if (this.rules.preTick) this.rules.preTick(this, dt);

    for (const p of this.players) this.processInputs(p, dt);

    const active = [];
    for (const p of this.players) if (p.alive && p.ch.lock !== 1 && !p.noCollide) active.push(p.ch);
    separateChars(active);

    if (this.playing) {
      const killY = this.layout.killY ?? -30;
      for (const p of this.players) {
        if (!p.alive || p.ch.lock === 1) continue;
        if (p.ch.y < killY) {
          if (this.rules.onFall) this.rules.onFall(this, p);
          else this.eliminate(p, 'fell');
        }
      }
      this.rules.tick(this, dt);
      // Players who stay disconnected forfeit the rest of the round so they never block it.
      for (const p of this.players) {
        if (!p.connected && !p.forfeited && p.discAt !== null && this.t - p.discAt >= ROUND_DISCONNECT_FORFEIT) {
          p.forfeited = true;
          if (this.rules.onForfeit) this.rules.onForfeit(this, p);
          else if (p.alive && p.finishT === Infinity) this.eliminate(p, 'left');
        }
      }
      if (this.rules.isOver(this)) this.end('complete');
      else if (this.t >= this.duration) this.end('time');
      else if (!this.players.some((p) => p.connected)) this.end('empty');
    }
  }

  processInputs(p, dt) {
    p.tokens = Math.min(p.tokens + 1, MAX_STEPS_PER_TICK);
    let processed = 0;
    while (p.q.length && p.tokens >= 1 && processed < MAX_STEPS_PER_TICK) {
      const inp = p.q.shift();
      p.tokens -= 1;
      processed++;
      p.starve = 0;
      p.ack = inp.seq;
      p.held = inp.b;
      p.lastInput = inp;
      this.stepPlayer(p, inp, dt);
    }
    if (processed === 0) {
      p.starve++;
      if (p.starve > STARVE_TICKS && p.tokens >= 1) {
        // No input arriving (tab hidden, lag, disconnect): keep simulating with an idle input
        // so the shared world never freezes waiting for one browser.
        p.tokens -= 1;
        const idle = { seq: p.ack, mx: 0, mz: 0, b: 0, ay: p.lastInput.ay, ap: p.lastInput.ap };
        p.held = 0;
        this.stepPlayer(p, idle, dt);
      }
    }
  }

  stepPlayer(p, inp, dt) {
    if (!p.alive) return;
    const playing = this.playing;
    const effective = playing ? inp : { mx: 0, mz: 0, b: 0, ay: inp.ay, ap: inp.ap };
    if (this.rules.beforeStep) this.rules.beforeStep(this, p, effective, dt);
    stepChar(p.ch, effective, this.world, this.P, dt);
    if (playing && this.rules.onStep) this.rules.onStep(this, p, effective, dt);
  }

  end(reason) {
    if (this.ended) return;
    this.ended = true;
    this.endReason = reason;
    if (this.rules.onEnd) this.rules.onEnd(this);
    this.emit('end', { r: reason });
  }

  ranking() {
    return this.rules.rank(this);
  }

  // ------------------------------------------------------------------ networking

  flagsOf(p) {
    const ch = p.ch;
    let f = 0;
    if (ch.grounded) f |= FLAG.GROUNDED;
    if (p.alive) f |= FLAG.ALIVE;
    if (p.finishT !== Infinity) f |= FLAG.FINISHED;
    if (p.connected) f |= FLAG.CONNECTED;
    if (ch.sprT > 0) f |= FLAG.SPRINTING;
    if (ch.stunT > 0) f |= FLAG.STUNNED;
    if (ch.kbT > 0) f |= FLAG.KNOCKED;
    if (ch.dashT > 0) f |= FLAG.DASHING;
    if (ch.lock === 1) f |= FLAG.FROZEN;
    if (p.hidden) f |= FLAG.HIDDEN;
    return f | p.flags;
  }

  // Returns { head, me(p) } where head is a JSON string missing its closing brace, so each
  // recipient's private reconciliation data can be appended without re-serialising.
  snapshot() {
    const ps = this.players.map((p) => {
      const ch = p.ch;
      const extra = this.rules.pextra ? this.rules.pextra(this, p) : 0;
      return [p.slot, round3(ch.x), round3(ch.y), round3(ch.z), round3(ch.yaw), round2(ch.vx), round2(ch.vy), round2(ch.vz), this.flagsOf(p), extra, ch.grounded ? ch.gid : -1];
    });
    const body = { type: 'snap', t: round3(this.t), p: ps };
    if (this.rules.net) body.g = this.rules.net(this);
    if (this.events.length) body.e = this.events.splice(0);
    const head = JSON.stringify(body).slice(0, -1);
    return { head, me: (p) => Round.meData(p) };
  }

  static meData(p) {
    const c = p.ch;
    return [
      p.ack, round3(c.kbT), round3(c.sprT), round3(c.sprCd), round3(c.dashT), round3(c.dashCd), round3(c.stunT),
      round3(c.coyote), c.gid, round3(c.svx), round3(c.svz), c.speedMul, c.jumpMul, c.accelMul, round3(c.jbuf), c.lock,
      c.grounded ? 1 : 0, round3(c.gnx), round3(c.gny), round3(c.gnz), round3(c.x), round3(c.y), round3(c.z), round3(c.vx), round3(c.vy), round3(c.vz), round3(c.yaw),
      c.noSprint ? 1 : 0,
    ];
  }

  // Static information every client needs to build the same arena.
  startInfo() {
    return {
      gameId: this.gameId,
      seed: this.seed,
      duration: this.duration,
      durationScale: this.durationScale,
      roster: this.players.map((p) => ({ slot: p.slot, pid: p.pid, name: p.name, team: p.team })),
      t: round3(this.t),
      g: this.rules.net ? this.rules.net(this) : null,
    };
  }
}
