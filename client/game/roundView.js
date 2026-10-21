// The gameplay view shared by all fifteen minigames.
//
// - Builds the arena from the same shared layout the server simulates.
// - Predicts the local character, reconciles with snapshots and interpolates everyone else.
// - Drives camera rigs, input sampling, effects and HUD data.
// - Delegates game-specific visuals and HUD lines to client/minigames/<id>.js.
import * as THREE from 'three';
import { BaseView } from '../scenes/baseView.js';
import { Character } from '../characters/character.js';
import { SHARED_GAMES } from '../../shared/games/index.js';
import { META_BY_ID } from '../../shared/games/meta.js';
import { createWorld } from '../../shared/games/kit.js';
import { makeMove } from '../../shared/controller.js';
import { Collider } from '../../shared/physics.js';
import { BTN, DT, FLAG } from '../../shared/constants.js';
import { defaultCosmetic, BODY_COLORS } from '../../shared/cosmetics.js';
import { clamp, lerp, lerpAngle, round3 } from '../../shared/math.js';
import { buildColliderMesh, applyPose } from './arenaMesh.js';
import { Predictor } from './prediction.js';
import { isDown, consumePressed, advanceInputTo } from './input.js';
import { hud } from '../state/store.js';
import { settings } from '../settings.js';
import { CLIENT_GAMES } from '../minigames/index.js';

const INTERP = 0.1;
const tmpV = { x: 0, y: 0, z: 0 };
const v3 = new THREE.Vector3();

export class RoundView extends BaseView {
  constructor(engine, { conn, start, myId, players, phase, preview = false }) {
    const mod = CLIENT_GAMES[start.gameId] || {};
    super(engine, mod.theme || 'day', mod.sky || {});
    this.conn = conn;
    this.preview = preview;
    this.start = start;
    this.gameId = start.gameId;
    this.meta = META_BY_ID[start.gameId];
    this.def = SHARED_GAMES[start.gameId];
    this.mod = mod;
    this.myId = myId;
    this.roster = start.roster;
    this.n = this.roster.length;
    this.layout = this.def.build({ seed: start.seed, n: this.n, teams: this.roster.map((r) => r.team ?? -1) });
    this.world = createWorld(this.layout);
    this.gs = this.world.gs;
    this.P = makeMove(this.def.move);
    this.duration = start.duration;
    this.mySlot = this.roster.findIndex((r) => r.pid === myId);
    this.players = players; // Map pid -> public player
    this.camCfg = Object.assign({ mode: this.meta.camera, center: [0, 0, 0], dist: 26, height: 22, yaw: 0, follow: 0.3 }, this.layout.camera || {});
    this.camYaw = this.camCfg.yaw;
    if (start.g) this.applyNet(start.g);

    // Arena meshes
    this.kinMeshes = [];
    this.colliderMeshes = new Map();
    for (const c of this.world.colliders) {
      if (mod.skipGeneric && mod.skipGeneric(c)) continue;
      const m = buildColliderMesh(c);
      if (!m) continue;
      this.scene.add(m);
      this.colliderMeshes.set(c.id, m);
      if (c.kinematic || c.look?.dynamic) this.kinMeshes.push({ m, c });
      if (m.userData.scroll) this.kinMeshes.push({ m, c, scrollOnly: !c.kinematic });
    }
    this.scrollers = [...this.colliderMeshes.values()].filter((m) => m.userData.scroll);

    // Characters
    this.chars = this.roster.map((r, slot) => {
      const info = players.get(r.pid);
      const cos = info?.cosmetic || defaultCosmetic(slot);
      const c = new Character(cos);
      c.setNameTag(r.name + (r.pid === myId ? ' (you)' : ''), info?.seat || slot + 1, true);
      const sp = this.layout.spawns[slot];
      c.root.position.set(sp.x, sp.y, sp.z);
      c.root.rotation.y = sp.yaw || 0;
      this.scene.add(c.root);
      return {
        c, slot, pid: r.pid, name: r.name, team: r.team, seat: info?.seat || slot + 1,
        color: BODY_COLORS[cos.color].hex,
        pos: new THREE.Vector3(sp.x, sp.y, sp.z), yaw: sp.yaw || 0, vel: new THREE.Vector3(),
        flags: FLAG.ALIVE | FLAG.CONNECTED | FLAG.GROUNDED, extra: 0, gid: -1, visible: true, wasAlive: true,
      };
    });
    this.predictor = this.mySlot >= 0 ? new Predictor(this.world, this.P, this.layout.spawns[this.mySlot]) : null;

    // Timing
    this.snaps = [];
    this.off = null;
    this.t0 = null;
    this.phase = phase;
    this.inputAcc = 0;
    this.outbox = [];
    this.feed = [];
    this.banner = null;
    this.hudTimer = 0;
    this.shake = 0;
    this.spectate = this.mySlot >= 0 ? this.mySlot : 0;
    this.ended = false;
    this.goShown = false;
    this.introOrbit = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camInit = false;
    this.focus = new THREE.Vector3();
    this.lastMe = null;
    this.scratch = new Collider({ type: 'box' });

    const half = this.camCfg.shadow || 24;
    this.setShadowBounds(half, new THREE.Vector3(...(this.camCfg.shadowCenter || this.camCfg.center)));
    if (mod.setup) mod.setup(this);
    this.resetCamera();
  }

  // ---------------------------------------------------------------- timing

  localNow() {
    return performance.now() / 1000;
  }

  get rtt() {
    return clamp(this.conn.rtt || 0.08, 0.01, 0.6);
  }

  // Round time of the most recently received server state.
  tLatest() {
    if (this.off !== null) return this.localNow() + this.off;
    if (this.t0 !== null) return this.conn.serverNow() - this.t0 - this.rtt / 2;
    return -10;
  }

  tNow() {
    return this.tLatest() + this.rtt / 2;
  }

  tPred() {
    return this.tLatest() + this.rtt + DT;
  }

  tRemote() {
    return this.tLatest() - INTERP;
  }

  setPlaying(t0) {
    this.t0 = t0;
    this.phase = 'playing';
  }

  // ---------------------------------------------------------------- network

  applyNet(g) {
    if (this.mod.onNet) this.mod.onNet(this, g);
    else Object.assign(this.gs, g);
    if (this.def.sync) this.def.sync(this.world, this.gs, this.layout);
  }

  onSnap(m) {
    const ln = this.localNow();
    const target = m.t - ln;
    if (this.off === null) this.off = target;
    else if (target > this.off) this.off = target;
    else this.off += (target - this.off) * 0.04;
    this.snaps.push(m);
    if (this.snaps.length > 40) this.snaps.shift();
    if (m.g) this.applyNet(m.g);
    if (m.e) for (const e of m.e) this.onEvent(e);
    if (m.me && this.predictor) {
      this.lastMe = m.me;
      this.predictor.reconcile(m.me, this.tPred());
    }
    const mine = this.mySlot >= 0 ? m.p[this.mySlot] : null;
    if (mine) this.myFlags = mine[8];
  }

  onEvent(e) {
    const who = e.s !== undefined ? this.chars[e.s] : null;
    switch (e.k) {
      case 'go':
        this.showBanner('Go!', 'go', 0.9);
        break;
      case 'elim': {
        if (!who) break;
        const p = who.pos;
        this.fx.puff(p.x, p.y + 0.6, p.z, 16, who.color, 0.45, 3.5);
        this.fx.floatText('Out!', p.x, p.y + 2.2, p.z, '#ff5da2', 1);
        this.pushFeed(e.s === this.mySlot ? 'You are out' : `${who.name} is out`, who.color);
        if (e.s === this.mySlot) {
          this.showBanner(e.r === 'left' ? 'Disconnected' : 'You’re out!', 'out', 2.2);
          this.shakeCam(0.5);
          this.spectate = this.nextAlive(this.mySlot, 1);
        }
        break;
      }
      case 'finish':
        if (!who) break;
        this.fx.burstConfetti(who.pos.x, who.pos.y + 1, who.pos.z, 50);
        this.pushFeed(`${who.name} finished ${ordinal(e.n)} · ${e.t.toFixed(1)}s`, who.color);
        if (e.s === this.mySlot) this.showBanner(`Finished ${ordinal(e.n)}!`, 'win', 2.5);
        break;
      case 'respawn':
        if (who) this.fx.puff(who.pos.x, who.pos.y + 0.5, who.pos.z, 10, '#ffffff', 0.35, 2.5);
        if (e.s === this.mySlot) this.shakeCam(0.25);
        break;
      case 'end':
        this.ended = true;
        this.showBanner(e.r === 'time' ? 'Time!' : 'Finish!', 'end', 3);
        break;
      default:
        break;
    }
    if (this.mod.onEvent) this.mod.onEvent(this, e);
  }

  pushFeed(text, color = '#ffffff') {
    this.feed.push({ id: Math.random(), text, color, at: this.localNow() });
    if (this.feed.length > 5) this.feed.shift();
  }

  showBanner(text, kind = 'info', dur = 1.5) {
    this.banner = { text, kind, until: this.localNow() + dur, id: Math.random() };
  }

  shakeCam(amount) {
    if (!settings.get().reducedMotion) this.shake = Math.max(this.shake, amount);
  }

  nextAlive(from, dir) {
    for (let k = 1; k <= this.n; k++) {
      const s = (from + dir * k + this.n * 4) % this.n;
      if (this.chars[s].flags & FLAG.ALIVE && !(this.chars[s].flags & FLAG.HIDDEN)) return s;
    }
    return from;
  }

  // ---------------------------------------------------------------- interpolation

  sample(slot, t) {
    const snaps = this.snaps;
    if (!snaps.length) return null;
    let a = null, b = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].t <= t) { a = snaps[i]; b = snaps[i + 1] || null; break; }
    }
    if (!a) return { e: snaps[0].p[slot], k: 0, b: null };
    if (!b) return { e: a.p[slot], k: 0, b: null, extra: Math.min(0.12, t - a.t) };
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    return { e: a.p[slot], b: b.p[slot], k };
  }

  // Interpolate an array of entities in snapshot game state. key: g[key] is an array of
  // arrays [id, x, y, z, ...]. Returns Map id -> {x, y, z, raw}.
  interpList(key, t) {
    const out = new Map();
    const snaps = this.snaps;
    if (!snaps.length) return out;
    let ai = -1;
    for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].t <= t && snaps[i].g && snaps[i].g[key]) { ai = i; break; }
    if (ai < 0) {
      for (const s of snaps) if (s.g && s.g[key]) { ai = snaps.indexOf(s); break; }
      if (ai < 0) return out;
    }
    const a = snaps[ai];
    let b = null;
    for (let i = ai + 1; i < snaps.length; i++) if (snaps[i].g && snaps[i].g[key]) { b = snaps[i]; break; }
    const k = b ? clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1) : 0;
    const bmap = new Map();
    if (b) for (const e of b.g[key]) bmap.set(e[0], e);
    for (const e of a.g[key]) {
      const f = bmap.get(e[0]);
      if (f) out.set(e[0], { x: lerp(e[1], f[1], k), y: lerp(e[2], f[2], k), z: lerp(e[3], f[3], k), raw: e, next: f, k });
      else out.set(e[0], { x: e[1], y: e[2], z: e[3], raw: e, next: null, k });
    }
    return out;
  }

  latestG() {
    for (let i = this.snaps.length - 1; i >= 0; i--) if (this.snaps[i].g) return this.snaps[i].g;
    return this.start.g || {};
  }

  // Move a point that was riding kinematic collider c at time tFrom to where it is at tTo.
  remap(c, x, y, z, tFrom, tTo, out) {
    const s = this.scratch;
    s.type = c.type; s.hx = c.hx; s.hy = c.hy; s.hz = c.hz; s.r = c.r; s.hh = c.hh;
    c.motion(tFrom, this.gs, s);
    s.updateMatrix();
    s.savePrev();
    c.motion(tTo, this.gs, s);
    s.updateMatrix();
    return s.carryPoint(x, y, z, out);
  }

  // ---------------------------------------------------------------- input

  sampleInput() {
    const pressed = consumePressed();
    const up = isDown('up') ? 1 : 0, down = isDown('down') ? 1 : 0;
    const left = isDown('left') ? 1 : 0, right = isDown('right') ? 1 : 0;
    let b = 0;
    if (isDown('jump')) b |= BTN.JUMP;
    if (pressed.has('jump')) b |= BTN.JUMP_P;
    if (isDown('sprint')) b |= BTN.SPRINT;
    if (pressed.has('sprint')) b |= BTN.SPRINT_P;
    if (isDown('act')) b |= BTN.ACT;
    if (pressed.has('act')) b |= BTN.ACT_P;
    if (pressed.has('up')) b |= BTN.UP_P;
    if (pressed.has('down')) b |= BTN.DOWN_P;
    if (pressed.has('left')) b |= BTN.LEFT_P;
    if (pressed.has('right')) b |= BTN.RIGHT_P;
    const fz = up - down, fx = right - left;
    const yaw = this.camYaw;
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    const rgtX = -Math.cos(yaw), rgtZ = Math.sin(yaw);
    let mx = fwdX * fz + rgtX * fx, mz = fwdZ * fz + rgtZ * fx;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const inp = { mx, mz, b, ay: 0, ap: 0, pressed, held: { up, down, left, right } };
    if (this.mod.input) this.mod.input(this, inp, DT);
    return inp;
  }

  tickInput() {
    const inp = this.sampleInput();
    const me = this.chars[this.mySlot];
    const alive = me && me.flags & FLAG.ALIVE;
    if (!alive) {
      // Spectating: left/right cycles through remaining players.
      if (inp.pressed.has('left')) this.spectate = this.nextAlive(this.spectate, -1);
      if (inp.pressed.has('right') || inp.pressed.has('jump')) this.spectate = this.nextAlive(this.spectate, 1);
    }
    const rec = this.predictor.step(inp, this.tPred());
    this.outbox.push([rec.seq, round3(rec.mx), round3(rec.mz), rec.b, round3(rec.ay), round3(rec.ap)]);
  }

  flushInputs() {
    if (!this.outbox.length) return;
    // Resend the last few inputs too: cheap insurance against a dropped frame of input.
    this.conn.send({ type: 'in', i: this.outbox });
    this.outbox = [];
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    super.update(dt);
    const playing = this.phase === 'playing';
    const tPred = this.tPred();
    const tRem = this.tRemote();

    // Input ticks follow real time, not the render rate, so a slow frame rate never slows
    // a player down: a 10 fps device still sends 60 inputs per second.
    const clock = performance.now() / 1000;
    const elapsed = this.inputClock === undefined ? 0 : Math.min(0.25, clock - this.inputClock);
    this.inputClock = clock;
    if (playing && this.predictor && !this.ended) {
      this.inputAcc += elapsed;
      // Each tick sees the keys as they were at that tick's moment in time.
      let tTick = clock - this.inputAcc;
      advanceInputTo(tTick);
      let n = 0;
      while (this.inputAcc >= DT && n < 16) {
        tTick += DT;
        advanceInputTo(tTick);
        this.tickInput();
        this.inputAcc -= DT;
        n++;
      }
      if (n >= 16) { this.inputAcc = 0; advanceInputTo(clock); }
      this.flushInputs();
    } else {
      advanceInputTo(clock);
      consumePressed();
    }

    // Kinematic arena pieces render at the predicted time so the local player stays glued
    // to moving platforms.
    const tRenderKin = playing ? tPred : 0;
    this.world.evalPose(tRenderKin);
    for (const { m, c, scrollOnly } of this.kinMeshes) {
      if (!scrollOnly) applyPose(m, c);
      m.visible = c.enabled || !!c.look?.showDisabled;
    }
    // Conveyor textures: arrows point along the belt's current direction and scroll with it.
    // Box top faces map u to +x and v to -z; texture rotation turns the arrow (drawn along +v).
    for (const m of this.scrollers) {
      const s = m.userData.scroll;
      const c = m.userData.collider;
      const conv = c.conveyor;
      if (!conv) continue;
      const th = Math.atan2(-conv.x, -conv.z);
      const rotated = Math.abs(Math.sin(th)) > 0.5;
      const T = 2.4;
      s.tex.rotation = th;
      s.tex.repeat.set(rotated ? (2 * c.hz) / T : (2 * c.hx) / T, rotated ? (2 * c.hx) / T : (2 * c.hz) / T);
      s.tex.offset.y -= (Math.hypot(conv.x, conv.z) / T) * dt;
    }

    // Characters
    for (const ch of this.chars) {
      let speed = 0, vy = 0, grounded = true, knocked = false, stunned = false, dashing = false;
      if (ch.slot === this.mySlot && this.predictor && playing) {
        const pc = this.predictor.ch;
        this.predictor.visual(dt, tmpV);
        ch.pos.set(tmpV.x, tmpV.y, tmpV.z);
        ch.yaw = pc.yaw;
        speed = Math.hypot(pc.vx, pc.vz);
        vy = pc.vy;
        grounded = pc.grounded;
        knocked = pc.kbT > 0.05;
        stunned = pc.stunT > 0;
        dashing = pc.dashT > 0;
        if (this.myFlags !== undefined) ch.flags = this.myFlags;
        const latest = this.snaps[this.snaps.length - 1];
        if (latest) ch.extra = latest.p[ch.slot][9];
      } else {
        const s = this.sample(ch.slot, tRem);
        if (s && s.e) {
          const e = s.e, f = s.b;
          let x = e[1], y = e[2], z = e[3], yaw = e[4];
          if (f) {
            x = lerp(e[1], f[1], s.k); y = lerp(e[2], f[2], s.k); z = lerp(e[3], f[3], s.k);
            yaw = lerpAngle(e[4], f[4], s.k);
          } else if (s.extra > 0) {
            x += e[5] * s.extra; y += Math.max(-2, e[6] * s.extra); z += e[7] * s.extra;
          }
          const gid = (f || e)[10];
          if (playing && gid >= 0 && (e[8] & FLAG.GROUNDED)) {
            const c = this.world.colliders[gid];
            if (c && c.kinematic) {
              this.remap(c, x, y + 0.5, z, tRem, tRenderKin, tmpV);
              x = tmpV.x; y = tmpV.y - 0.5; z = tmpV.z;
            }
          }
          ch.pos.set(x, y, z);
          ch.yaw = yaw;
          ch.flags = (f || e)[8];
          ch.extra = (f || e)[9];
          ch.gid = gid;
          speed = Math.hypot(e[5], e[7]);
          vy = e[6];
          grounded = !!(ch.flags & FLAG.GROUNDED);
          knocked = !!(ch.flags & FLAG.KNOCKED);
          stunned = !!(ch.flags & FLAG.STUNNED);
          dashing = !!(ch.flags & FLAG.DASHING);
        }
      }
      const hidden = !!(ch.flags & FLAG.HIDDEN);
      ch.c.root.visible = !hidden;
      ch.c.root.position.copy(ch.pos);
      ch.c.root.rotation.y = ch.yaw;
      const finished = !!(ch.flags & FLAG.FINISHED);
      const animState = {
        speed, vy, grounded, knocked, stunned, dashing,
        carrying: !!(ch.flags & FLAG.CARRYING),
        mood: finished ? 'celebrate' : null,
      };
      if (this.mod.charState) this.mod.charState(this, ch, animState);
      ch.c.update(dt, animState);
      if (!(ch.flags & FLAG.CONNECTED)) ch.c.root.scale.setScalar(0.92);
      else ch.c.root.scale.setScalar(1);
      if (ch.landPuffCheck !== grounded) {
        if (grounded && !hidden && speed > 1) this.fx.dust(ch.pos.x, ch.pos.y, ch.pos.z);
        ch.landPuffCheck = grounded;
      }
    }

    if (this.mod.update) this.mod.update(this, dt, { tPred, tRem, tNow: this.tNow(), playing });
    this.updateCamera(dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0 && !this.preview) {
      this.hudTimer = 0.1;
      this.publishHud();
    }
  }

  // ---------------------------------------------------------------- camera

  focusSlot() {
    const me = this.chars[this.mySlot];
    if (me && me.flags & FLAG.ALIVE && !(me.flags & FLAG.HIDDEN)) return this.mySlot;
    const s = this.chars[this.spectate];
    if (s && s.flags & FLAG.ALIVE && !(s.flags & FLAG.HIDDEN)) return this.spectate;
    this.spectate = this.nextAlive(this.spectate, 1);
    return this.spectate;
  }

  resetCamera() {
    const { pos, look } = this.cameraTarget();
    this.camPos.copy(pos);
    this.camLook.copy(look);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }

  cameraTarget() {
    const cfg = this.camCfg;
    const zoom = settings.get().cameraDistance || 1;
    const fs = this.focusSlot();
    const f = this.chars[fs] ? this.chars[fs].pos : new THREE.Vector3(...cfg.center);
    this.focus.copy(f);
    if (this.mod.camera) {
      const r = this.mod.camera(this, zoom);
      if (r) return r;
    }
    const yaw = this.camYaw;
    const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    let look, pos;
    if (cfg.mode === 'follow') {
      look = new THREE.Vector3(f.x * 0.85 + (cfg.center[0] || 0) * 0.15, f.y + 1.3, f.z).addScaledVector(back, -(cfg.ahead ?? 4));
      if (cfg.minY !== undefined) look.y = Math.max(look.y, cfg.minY);
      pos = look.clone().addScaledVector(back, (cfg.dist ?? 10) * zoom);
      pos.y += (cfg.height ?? 6) * zoom;
    } else if (cfg.mode === 'iso') {
      const c = new THREE.Vector3(...cfg.center);
      look = c.clone().lerp(new THREE.Vector3(f.x, Math.max(c.y, f.y * 0.5), f.z), cfg.follow ?? 0.7);
      pos = look.clone().addScaledVector(back, (cfg.dist ?? 16) * zoom);
      pos.y += (cfg.height ?? 15) * zoom;
    } else {
      const c = new THREE.Vector3(...cfg.center);
      look = c.clone().lerp(new THREE.Vector3(f.x, c.y, f.z), cfg.follow ?? 0.25);
      pos = look.clone().addScaledVector(back, (cfg.dist ?? 26) * zoom);
      pos.y += (cfg.height ?? 22) * zoom;
    }
    return { pos, look };
  }

  updateCamera(dt) {
    let { pos, look } = this.cameraTarget();
    const intro = this.phase !== 'playing';
    if (intro) {
      // Slow fly-around while the minigame is introduced.
      this.introOrbit += dt * (settings.get().reducedMotion ? 0.05 : 0.18);
      const c = new THREE.Vector3(...this.camCfg.center);
      const r = (this.camCfg.introDist ?? Math.max(22, (this.camCfg.dist ?? 20) * 1.3));
      const a = this.introOrbit + Math.PI;
      look = this.camCfg.introLook ? new THREE.Vector3(...this.camCfg.introLook) : c;
      pos = new THREE.Vector3(look.x + Math.sin(a) * r, look.y + (this.camCfg.introHeight ?? 16), look.z + Math.cos(a) * r);
    }
    const smooth = settings.get().cameraSmoothing ?? 0.5;
    const k = 1 - Math.exp(-dt * (intro ? 2 : lerp(14, 3.5, smooth)));
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camLook);
  }

  // ---------------------------------------------------------------- HUD

  aliveCount() {
    let n = 0;
    for (const c of this.chars) if (c.flags & FLAG.ALIVE) n++;
    return n;
  }

  publishHud() {
    const tNow = this.tNow();
    const playing = this.phase === 'playing';
    const timeLeft = playing ? Math.max(0, this.duration - Math.max(0, tNow)) : this.duration;
    const countdown = playing && tNow < 0 ? Math.ceil(-tNow) : 0;
    const me = this.chars[this.mySlot];
    const pc = this.predictor?.ch;
    const cooldowns = [];
    if (pc && this.P.sprint === 'burst') {
      cooldowns.push({ label: 'Sprint', key: 'sprint', ready: pc.sprCd <= 0, frac: pc.sprT > 0 ? 1 : 1 - pc.sprCd / (this.P.sprintCd + this.P.sprintDur), active: pc.sprT > 0 });
    } else if (pc && this.P.sprint === 'dash') {
      cooldowns.push({ label: 'Dash', key: 'sprint', ready: pc.dashCd <= 0, frac: 1 - pc.dashCd / this.P.dashCd, active: pc.dashT > 0 });
    }
    const base = {
      active: true,
      gameId: this.gameId,
      title: this.meta.title,
      objective: this.meta.objective,
      timeLeft,
      countdown,
      started: playing && tNow >= 0,
      ended: this.ended,
      alive: me ? !!(me.flags & FLAG.ALIVE) : false,
      inRound: this.mySlot >= 0,
      finished: me ? !!(me.flags & FLAG.FINISHED) : false,
      spectating: me && !(me.flags & FLAG.ALIVE) || this.mySlot < 0 ? this.chars[this.focusSlot()]?.name : null,
      cooldowns,
      feed: this.feed.filter((f) => this.localNow() - f.at < 5),
      banner: this.banner && this.localNow() < this.banner.until ? this.banner : null,
      lines: [],
      board: [],
      prompt: null,
      bar: null,
      net: { rtt: Math.round(this.rtt * 1000), corrections: this.predictor?.corrections || 0, err: this.predictor ? +this.predictor.lastErr.toFixed(3) : 0 },
    };
    if (this.mod.hud) Object.assign(base, this.mod.hud(this, base) || {});
    hud.set(base);
  }

  dispose() {
    super.dispose();
    for (const ch of this.chars) ch.c.dispose();
    if (this.mod.dispose) this.mod.dispose(this);
    if (!this.preview) hud.set({ active: false });
  }
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
