// Test-only bot "brains". They read server state directly (they are allowed to cheat) and
// produce the same inputs a keyboard player would send. Used to prove minigames are
// completable and resolve correctly; they are not part of the shipped game.
import { BTN, CHAR_R } from '../../shared/constants.js';
import { sphereVsCollider } from '../../shared/physics.js';
import { padAngle, RINGS } from '../../shared/games/colour-rush.js';
import { padX } from '../../shared/games/dont-drop-it.js';
import { slotPos, platformPose } from '../../shared/games/last-platform.js';
import { slotPos as ropeSlot, teamDir } from '../../shared/games/treasure-tug.js';
import { GATES, gateState, BEAMS, beamZ, TILES, tileHot, doorOpen, DOORS } from '../../shared/games/shadow-sprint.js';
import { TARGETS, targetPos, launcherX, SHOT, LAUNCH_H, goldActive } from '../../shared/games/target-trouble.js';

const _res = { nx: 0, ny: 0, nz: 0, d: 0 };

// Is there solid ground `dist` metres ahead of the character in direction (dx, dz)?
export function groundAhead(R, ch, dx, dz, dist = 1.3, depth = 1.2) {
  const l = Math.hypot(dx, dz) || 1;
  const x = ch.x + (dx / l) * dist, z = ch.z + (dz / l) * dist;
  for (const c of R.world.colliders) {
    if (!c.enabled || !c.solid) continue;
    for (let d = 0.2; d <= depth; d += 0.5) {
      if (sphereVsCollider(c, x, ch.y - d, z, 0.35, _res)) return true;
    }
  }
  return false;
}

// Generic course runner: follows waypoints, jumps over gaps and when stuck.
export function courseRunner(waypoints, opts = {}) {
  return (R, p, mem, tick) => {
    const ch = p.ch;
    if (mem.wp === undefined) mem.wp = 0;
    if (mem.lastCp !== p.cp) {
      // After a respawn, restart from the waypoint nearest ahead of the checkpoint.
      mem.lastCp = p.cp;
      let best = 0;
      for (let i = 0; i < waypoints.length; i++) if (waypoints[i][1] <= ch.z + 0.5) best = i;
      mem.wp = Math.min(best + (waypoints[best][1] < ch.z - 0.5 ? 1 : 0), waypoints.length - 1);
    }
    let w = waypoints[mem.wp];
    while (mem.wp < waypoints.length - 1 && (ch.z > w[1] + 0.3 || Math.hypot(ch.x - w[0], ch.z - w[1]) < 1.0)) {
      mem.wp++;
      w = waypoints[mem.wp];
    }
    const m = toward(ch, w[0], w[1]);
    let b = 0;
    mem.stuck = (mem.stuck || 0) + (Math.hypot(ch.vx, ch.vz) < 1.5 && ch.grounded ? 1 : -1);
    mem.stuck = Math.max(0, mem.stuck);
    const gap = ch.grounded && !groundAhead(R, ch, m.mx, m.mz, 1.0 + Math.hypot(ch.vx, ch.vz) * 0.08);
    if (gap || mem.stuck > 30 || (w[2] && Math.hypot(ch.x - w[0], ch.z - w[1]) < w[2])) {
      b |= jumpEdge(mem);
      if (mem.stuck > 30) mem.stuck = 0;
    }
    if (opts.sprint && tick % 90 === 0) b |= BTN.SPRINT | BTN.SPRINT_P;
    if (opts.extra) b |= opts.extra(R, p, mem, tick) || 0;
    return { mx: m.mx, mz: m.mz, b };
  };
}

export function toward(ch, x, z, speed = 1) {
  const dx = x - ch.x, dz = z - ch.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return { mx: 0, mz: 0, d };
  return { mx: (dx / d) * speed, mz: (dz / d) * speed, d };
}

export function jumpEdge(mem, key = 'j') {
  // Alternate pressed/released so each jump is a fresh edge.
  mem[key] = !mem[key];
  return mem[key] ? BTN.JUMP | BTN.JUMP_P : 0;
}

function boulderDanger(R, x, z) {
  let d = 99;
  for (const b of R.data.boulders) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp < 1) continue;
    // distance from point to the boulder's line of travel (ahead of it only)
    const ux = b.vx / sp, uz = b.vz / sp;
    const ahead = (x - b.x) * ux + (z - b.z) * uz;
    if (ahead < -2) continue;
    d = Math.min(d, Math.abs((x - b.x) * uz - (z - b.z) * ux) - b.r);
  }
  for (const w of R.gs.warn) {
    const side = w[1], lane = w[2];
    const off = side < 2 ? Math.abs(z - lane) : Math.abs(x - lane);
    d = Math.min(d, off - w[4]);
  }
  return d;
}

export const BRAINS = {
  'shadow-sprint'(R, p, mem, tick) {
    const ch = p.ch;
    if (!mem.run) mem.run = courseRunner([[0, 7], [0, 25], [2.5, 30], [2.5, 41], [3, 44], [3, 54], [-2.2, 57], [-2.2, 72.5], [0, 74], [0, 95]]);
    const inp = mem.run(R, p, mem.runMem || (mem.runMem = {}), tick);
    const t = R.t;
    // Wait for gates that are on (or about to switch on) just ahead.
    for (const g of GATES) {
      const ahead = g.z - ch.z;
      if (ahead > 0.4 && ahead < 1.6) {
        const st = gateState(g, t + 0.25);
        if (st.on || gateState(g, t).on) return { mx: 0, mz: 0, b: 0 };
      }
    }
    // Hop over sweeping beams when they come close.
    for (const b of BEAMS) if (Math.abs(beamZ(b, t + 0.15) - ch.z) < 0.9 && ch.grounded) inp.b |= jumpEdge(mem, 'bj');
    // Laser floor: wait while the tile ahead is (about to be) hot.
    if (ch.z > 72 && ch.z < 88) {
      for (const tile of TILES) {
        if (Math.abs(ch.x - tile.x) < 1.35 && Math.abs(ch.z + 1.4 - tile.z) < 1.35 && (tileHot(tile, t + 0.3) || tileHot(tile, t))) return { mx: 0, mz: 0, b: 0 };
      }
    }
    // Rotor: jump periodically while near it.
    if (Math.hypot(ch.x - 0, ch.z - 49) < 4.8 && tick % 24 === p.slot) inp.b |= jumpEdge(mem, 'rj');
    void doorOpen; void DOORS;
    return inp;
  },

  'treasure-tug'(R, p, mem, tick) {
    const ch = p.ch;
    const interrupter = p.slot % 4 === 3 && R.players.length >= 4;
    if (interrupter && !p.grabbing) {
      // Harass the nearest rival on the rope.
      let target = null, bd = Infinity;
      for (const q of R.players) {
        if (q.team === p.team || !q.grabbing) continue;
        const d = Math.hypot(q.ch.x - ch.x, q.ch.z - ch.z);
        if (d < bd) { bd = d; target = q; }
      }
      if (target) {
        const m = toward(ch, target.ch.x, target.ch.z + 1.4);
        return { mx: m.mx, mz: m.mz, b: bd < 2.2 && tick % 10 === 0 ? BTN.ACT | BTN.ACT_P : 0 };
      }
    }
    if (!p.grabbing) {
      const sp = ropeSlot(p.team, p.slot % 4);
      const m = toward(ch, sp.x, sp.z);
      return { mx: m.d > 0.6 ? m.mx : 0, mz: m.d > 0.6 ? m.mz : 0, b: m.d < 2 && tick % 12 === 0 ? BTN.ACT | BTN.ACT_P : 0 };
    }
    // Answer the prompt after a short reaction delay; sometimes press the wrong arrow.
    if (p.fumble > 0 || p.prompt < 0) return { mx: 0, mz: 0, b: 0 };
    if (mem.seen !== p.pulls) { mem.seen = p.pulls; mem.at = tick + 12 + ((p.slot * 7 + p.pulls * 3) % 16); }
    if (tick < mem.at) return { mx: 0, mz: 0, b: 0 };
    mem.at = tick + 24;
    const bits = [BTN.UP_P, BTN.RIGHT_P, BTN.DOWN_P, BTN.LEFT_P];
    mem.tries = (mem.tries || 0) + 1;
    const wrong = (mem.tries * 13 + p.slot) % 11 === 0;
    return { mx: 0, mz: 0, b: bits[wrong ? (p.prompt + 1) % 4 : p.prompt] };
  },

  'bomb-relay'(R, p, mem, tick) {
    const ch = p.ch;
    const mine = R.data.bombs.find((b) => b.holder === p.slot);
    if (mine) {
      let target = null, bd = Infinity;
      for (const q of R.players) {
        if (q === p || !q.alive || R.data.bombs.some((b) => b.holder === q.slot)) continue;
        if (q.slot === mine.from && R.t - mine.gotAt < 1.5) continue;
        const d = Math.hypot(q.ch.x - ch.x, q.ch.z - ch.z);
        if (d < bd) { bd = d; target = q; }
      }
      if (!target) return { mx: 0, mz: 0, b: 0 };
      const m = toward(ch, target.ch.x, target.ch.z);
      let b = 0;
      if (bd < 2.2 && tick % 8 === 0) b |= BTN.ACT | BTN.ACT_P;
      if (bd > 4 && tick % 120 === p.slot) b |= BTN.SPRINT | BTN.SPRINT_P;
      mem.stuck = (mem.stuck || 0) + (Math.hypot(ch.vx, ch.vz) < 1 ? 1 : -1);
      mem.stuck = Math.max(0, mem.stuck);
      if (mem.stuck > 25) { b |= jumpEdge(mem); mem.stuck = 0; }
      return { mx: m.mx, mz: m.mz, b };
    }
    // Flee from the nearest bomb holder, staying inside the walls.
    let hx = 0, hz = 0, close = Infinity;
    for (const b of R.data.bombs) {
      const h = R.players[b.holder];
      const d = Math.hypot(h.ch.x - ch.x, h.ch.z - ch.z);
      if (d < close) { close = d; hx = h.ch.x; hz = h.ch.z; }
    }
    if (close > 7) return { mx: 0, mz: 0, b: 0 };
    let dx = ch.x - hx, dz = ch.z - hz;
    dx -= ch.x * 0.08; dz -= ch.z * 0.08;
    const l = Math.hypot(dx, dz) || 1;
    mem.stuck = (mem.stuck || 0) + (Math.hypot(ch.vx, ch.vz) < 1 ? 1 : -1);
    mem.stuck = Math.max(0, mem.stuck);
    let b = 0;
    if (mem.stuck > 20) { b |= jumpEdge(mem); mem.stuck = 0; }
    if (close < 3 && tick % 90 === p.slot) b |= BTN.SPRINT | BTN.SPRINT_P;
    return { mx: dx / l, mz: dz / l, b };
  },

  'last-platform'(R, p, mem, tick) {
    const ch = p.ch, gs = R.gs;
    const cyc = gs.cyc;
    if (!cyc) return { mx: 0, mz: 0, b: 0 };
    // Safe platforms: active, not doomed. Head for the nearest one's current position.
    const react = 0.5 + (p.slot % 4) * 0.3;
    if (R.t < cyc.tW + react) return { mx: 0, mz: 0, b: 0 };
    let best = null, bd = Infinity;
    const tmp = {};
    for (let pid = 0; pid < gs.slot.length; pid++) {
      if (gs.slot[pid] < 0 || cyc.dm.includes(pid)) continue;
      platformPose(pid, R.t, gs, tmp);
      const d = Math.hypot(tmp.x - ch.x, tmp.z - ch.z) + ((pid + p.slot) % 3) * 0.3;
      if (d < bd) { bd = d; best = { x: tmp.x, z: tmp.z }; }
    }
    if (!best) return { mx: 0, mz: 0, b: 0 };
    const m = toward(ch, best.x, best.z);
    if (m.d < 0.5) return { mx: 0, mz: 0, b: 0 };
    const gap = ch.grounded && !groundAhead(R, ch, m.mx, m.mz, 0.9, 1.0);
    return { mx: m.mx, mz: m.mz, b: gap ? jumpEdge(mem) : 0 };
  },

  'target-trouble'(R, p, mem, tick) {
    const n = R.players.length;
    const lx = launcherX(p.slot, n);
    if (!mem.tg || tick % 25 === 0) {
      const alive = TARGETS.filter((tg) => !R.data.deadUntil.has(tg.id) && (tg.kind !== 3 || goldActive(R.t)));
      mem.tg = alive.length ? alive[(p.slot * 5 + Math.floor(tick / 25)) % alive.length] : null;
    }
    if (!mem.tg) return { mx: 0, mz: 0, b: 0, ay: 0, ap: 0.3 };
    // Iterate a lead estimate: flight time from horizontal distance.
    let t = 0.8, pos = targetPos(mem.tg, R.t + t);
    let yaw = 0, pitch = 0.3;
    for (let k = 0; k < 4; k++) {
      pos = targetPos(mem.tg, R.t + t);
      const dx = pos.x - lx, dz = pos.z - 0.5, dy = pos.y - LAUNCH_H;
      const d = Math.hypot(dx, dz);
      yaw = Math.atan2(dx, dz);
      const v = SHOT.speed, g = SHOT.gravity;
      const disc = v ** 4 - g * (g * d * d + 2 * dy * v * v);
      pitch = disc > 0 ? Math.atan((v * v - Math.sqrt(disc)) / (g * d)) : 0.6;
      t = d / (v * Math.cos(pitch));
    }
    const noise = ((p.slot * 13 + tick) % 7 - 3) * 0.006;
    return { mx: 0, mz: 0, b: tick % 26 === p.slot ? BTN.JUMP | BTN.JUMP_P : 0, ay: yaw + noise, ap: pitch };
  },

  'conveyor-chaos': courseRunner([
    [0, 6], [-2.9, 8], [-2.9, 22.5], [-2.5, 24], [-3.5, 26], [-3.5, 35.5], [0, 37.5], [0, 55.5], [-1.5, 57], [-1.5, 70.5], [0, 72], [0, 90],
  ], { extra: (R, p, mem, tick) => (tick % 70 === 0 ? BTN.SPRINT | BTN.SPRINT_P : 0) }),

  'wobble-works'(R, p, mem, tick) {
    const ch = p.ch, gs = R.gs;
    const centres = [[0, 0], [8.6, 0], [-8.6, 0], [0, 8.6], [0, -8.6]];
    // Pick the nearest standing platform; prefer the centre late in the round.
    let best = 0, bd = Infinity;
    centres.forEach(([x, z], i) => {
      if (gs.fall[i] >= 0 || (R.data.falls.some((f) => f.i === i && R.t > f.at - 3))) return;
      const d = Math.hypot(ch.x - x, ch.z - z) + (i === 0 ? -1 : 0) + ((p.slot + i) % 3) * 0.6;
      if (d < bd) { bd = d; best = i; }
    });
    const [cx, cz] = centres[best];
    // Lean uphill against the current tilt.
    const pp = gs.p[best];
    const tx = cx + pp[1] * 6 + ((p.slot % 3) - 1) * 1.2, tz = cz - pp[0] * 6 + ((p.slot % 2) - 0.5) * 1.6;
    const m = toward(ch, tx, tz);
    const gap = ch.grounded && !groundAhead(R, ch, m.mx, m.mz, 1.0, 1.4);
    return { mx: m.d > 0.3 ? m.mx : 0, mz: m.d > 0.3 ? m.mz : 0, b: gap ? jumpEdge(mem) : 0 };
  },

  'memory-mayhem'(R, p, mem, tick) {
    const ch = p.ch, gs = R.gs;
    const pads = R.layout.data.pads;
    if (gs.ph !== 'input' || p.status !== 0) return { mx: 0, mz: 0, b: 0 };
    // Bots occasionally misremember (deterministic per player and stage).
    const wrong = (p.slot * 7 + gs.st * 3) % 9 === 0 && p.progress === Math.min(2, gs.L - 1);
    const target = pads[wrong ? (R.data.seq[p.progress] + 4) % 9 : R.data.seq[p.progress]];
    const onPad = ch.grounded && R.world.colliders[ch.gid]?.tag === 'pad';
    const dTarget = Math.max(Math.abs(ch.x - target.x), Math.abs(ch.z - target.z));
    if (onPad && dTarget < 1.7) return { mx: 0, mz: 0, b: 0 }; // landed, wait for the next step
    if (onPad) {
      // Hop straight across to an orthogonally adjacent pad.
      const cur = pads[R.world.colliders[ch.gid].data.pad];
      const adj = Math.abs(cur.x - target.x) + Math.abs(cur.z - target.z) < 4.7;
      if (adj) {
        const m = toward(ch, target.x, target.z);
        return { mx: m.mx, mz: m.mz, b: Math.hypot(ch.x - cur.x, ch.z - cur.z) > 0.9 ? jumpEdge(mem) : 0 };
      }
    }
    // Close to the target pad: jump onto it.
    if (dTarget < 3.0 && Math.hypot(ch.x - target.x, ch.z - target.z) < 3.6) {
      const m = toward(ch, target.x, target.z);
      return { mx: m.mx, mz: m.mz, b: ch.grounded ? jumpEdge(mem) : 0 };
    }
    // Otherwise walk the floor lanes to the corner next to the target pad.
    const cx = target.x + (ch.x >= target.x ? 2.3 : -2.3);
    const cz = target.z + (ch.z >= target.z ? 2.3 : -2.3);
    const lanes = [-6.9, -2.3, 2.3, 6.9];
    const near = (v) => lanes.reduce((a, l) => (Math.abs(l - v) < Math.abs(a - v) ? l : a), lanes[0]);
    const onXLane = Math.abs(ch.x - near(ch.x)) < 0.45, onZLane = Math.abs(ch.z - near(ch.z)) < 0.45;
    let wx, wz;
    if (onPad) { wx = near(ch.x); wz = near(ch.z); }
    else if (onXLane && Math.abs(ch.z - cz) > 0.35) { wx = near(ch.x); wz = cz; }
    else if (onZLane && Math.abs(ch.x - cx) > 0.35) { wx = cx; wz = near(ch.z); }
    else if (!onXLane && !onZLane) { wx = near(ch.x); wz = ch.z; }
    else { wx = cx; wz = cz; }
    const m = toward(ch, wx, wz);
    return { mx: m.mx, mz: m.mz, b: 0 };
  },
  'dont-drop-it'(R, p, mem, tick) {
    const ch = p.ch;
    if (p.finishT !== Infinity) return { mx: 0, mz: 0, b: 0 };
    if (!p.carrying) {
      const c = p.cake;
      const m = toward(ch, c.x, c.z);
      let b = 0;
      if (m.d < 1.5 && tick % 6 === 0) b |= BTN.ACT | BTN.ACT_P;
      if (m.d < 0.4) return { mx: 0, mz: 0, b };
      const gap = ch.grounded && !groundAhead(R, ch, m.mx, m.mz, 1.0, 1.4);
      if (gap) b |= jumpEdge(mem);
      return { mx: m.mx, mz: m.mz, b };
    }
    if (!mem.run) {
      const px = padX(p.slot, R.players.length);
      mem.run = courseRunner([[0, 8], [0, 14.5], [5.4, 16.5], [5.4, 25.5], [7.25, 27], [7.25, 44], [6.2, 46], [6.2, 56.5], [0, 59], [0, 68], [px, 76], [px, 81]]);
    }
    return mem.run(R, p, mem.runMem || (mem.runMem = {}), tick);
  },

  'personal-space'(R, p, mem, tick) {
    const ch = p.ch;
    const r = Math.hypot(ch.x, ch.z);
    const rad = 12 - Math.max(0, Math.min(1, (R.t - 8) / 60)) * 8.2;
    if (r > rad - 1.6) {
      const m = toward(ch, 0, 0);
      return { mx: m.mx, mz: m.mz, b: 0 };
    }
    let target = null, bd = Infinity;
    for (const q of R.players) {
      if (q === p || !q.alive) continue;
      const d = Math.hypot(q.ch.x - ch.x, q.ch.z - ch.z);
      if (d < bd) { bd = d; target = q; }
    }
    if (!target) return { mx: 0, mz: 0, b: 0 };
    const m = toward(ch, target.ch.x, target.ch.z);
    let b = 0;
    if (bd < 2.1 && (tick + p.slot * 7) % 12 === 0) b |= BTN.ACT | BTN.ACT_P;
    if (bd < 4 && bd > 2.5 && (tick + p.slot * 11) % 97 === 0) b |= BTN.SPRINT | BTN.SPRINT_P;
    return { mx: m.mx, mz: m.mz, b };
  },

  'colour-rush'(R, p, mem, tick) {
    const ch = p.ch, gs = R.gs;
    if (gs.tg < 0) return { mx: 0, mz: 0, b: 0 };
    // Reaction delay so bots are not perfect.
    const react = 0.4 + (p.slot % 4) * 0.25;
    if (R.t < gs.call + react) return { mx: 0, mz: 0, b: 0 };
    let best = null, bd = Infinity;
    for (const pad of R.layout.data.pads) {
      if (gs.rm[pad.index] === '1' || Number(gs.cols[pad.index]) !== gs.tg) continue;
      const a = padAngle(pad, R.t + 0.4, gs);
      const r = RINGS[pad.ring].radius;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const d = Math.hypot(x - ch.x, z - ch.z) + ((pad.index * 13 + p.slot * 7) % 5) * 0.4;
      if (d < bd) { bd = d; best = { x, z }; }
    }
    if (!best) return { mx: 0, mz: 0, b: 0 };
    const m = toward(ch, best.x, best.z);
    if (m.d < 0.6) return { mx: 0, mz: 0, b: 0 };
    const gap = ch.grounded && !groundAhead(R, ch, m.mx, m.mz, 1.1, 1.0);
    return { mx: m.mx, mz: m.mz, b: gap ? jumpEdge(mem) : 0 };
  },

  'grab-everything'(R, p, mem, tick) {
    const ch = p.ch;
    const pts = R.layout.data.points;
    let best = null, bs = -1e9;
    for (const g of R.data.gems) {
      const pt = pts[g.p];
      const d = Math.hypot(pt.x - ch.x, pt.z - ch.z) + (pt.cls === 1 && ch.y < 2 ? 8 : 0) + (pt.cls === 2 && ch.y < 4 ? 10 : 0);
      const v = [1, 3, 5][g.type];
      const sc = v / (d + 2) + ((p.slot * 31 + g.id * 7) % 10) * 0.01;
      if (sc > bs) { bs = sc; best = pt; }
    }
    if (!best) return { mx: 0, mz: 0, b: 0 };
    let tx = best.x, tz = best.z;
    if (best.cls === 1 && ch.y < 2) {
      // Use the ramps onto the central platform.
      const sx = ch.x >= 0 ? 1 : -1;
      if (Math.abs(ch.z) > 0.8 || Math.abs(ch.x) < 9) { tx = sx * 9.8; tz = 0; } else { tx = 0; tz = 0; }
    } else if (best.cls === 2 && ch.y < 4) {
      // Use the tower's bounce pad, then steer onto the top.
      const sz = -Math.sign(best.z);
      const pad = { x: best.x, z: best.z + sz * 4.2 };
      if (ch.grounded) { tx = pad.x; tz = pad.z; }
    }
    const m = toward(ch, tx, tz);
    mem.stuck = (mem.stuck || 0) + (Math.hypot(ch.vx, ch.vz) < 1.2 ? 1 : -1);
    mem.stuck = Math.max(0, mem.stuck);
    let b = 0;
    if (mem.stuck > 20) { b = jumpEdge(mem); mem.stuck = 0; }
    return { mx: m.mx, mz: m.mz, b };
  },

  'boulder-panic'(R, p, mem, tick) {
    const ch = p.ch;
    if (tick % 6 === 0 || !mem.t) {
      let best = null, bs = -1e9;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const x = i * 2.6 + (p.slot % 3) * 0.4, z = j * 2.6;
        const sc = Math.min(4, boulderDanger(R, x, z)) - Math.hypot(x - ch.x, z - ch.z) * 0.08 - Math.hypot(x, z) * 0.05;
        if (sc > bs) { bs = sc; best = { x, z }; }
      }
      mem.t = best;
    }
    const m = toward(ch, mem.t.x, mem.t.z);
    return { mx: m.d > 0.4 ? m.mx : 0, mz: m.d > 0.4 ? m.mz : 0, b: boulderDanger(R, ch.x, ch.z) < 0.3 && tick % 20 === 0 ? BTN.JUMP | BTN.JUMP_P : 0 };
  },

  'dash-cash': courseRunner([
    [0, 8], [0, 17], [-1.2, 21.5], [-1.2, 37.5], [-1.5, 41], [-1.5, 57], [0, 63], [0, 77], [-3.6, 79], [-3.6, 95], [0, 97.5], [0, 104], [0, 116],
  ], { sprint: true }),

  idle: () => ({ mx: 0, mz: 0, b: 0 }),

  'floor-gone'(R, p, mem, tick) {
    const ch = p.ch;
    const tiles = R.layout.data.tiles;
    const s = R.gs.s;
    const layer = ch.y > -3.5 ? 0 : 1;
    const solid = (k) => s.charCodeAt(k) === 48 && tiles[k].layer === layer;
    if (mem.target === undefined || !solid(mem.target) || Math.hypot(tiles[mem.target].x - ch.x, tiles[mem.target].z - ch.z) < 0.6) {
      // Pick the nearest solid tile at least 2 m away, preferring the centre.
      let best = -1, bestScore = Infinity;
      for (let k = 0; k < tiles.length; k++) {
        if (!solid(k)) continue;
        const d = Math.hypot(tiles[k].x - ch.x, tiles[k].z - ch.z);
        if (d < 2) continue;
        const score = d + Math.hypot(tiles[k].x, tiles[k].z) * 0.4 + ((k * 7 + p.slot * 13) % 5) * 0.3;
        if (score < bestScore) { bestScore = score; best = k; }
      }
      mem.target = best >= 0 ? best : undefined;
    }
    if (mem.target === undefined) return { mx: 0, mz: 0, b: 0 };
    const t = tiles[mem.target];
    const m = toward(ch, t.x, t.z);
    return { mx: m.mx, mz: m.mz, b: tick % 40 === p.slot * 3 ? BTN.JUMP | BTN.JUMP_P : 0 };
  },
};
