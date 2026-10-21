// Shared platformer character controller. The server runs it authoritatively for every
// player; the client runs the same code for its own character to predict movement and then
// reconciles with server snapshots.

import { BTN, CHAR_R } from './constants.js';
import { sphereVsCollider } from './physics.js';
import { approachAngle } from './math.js';

export const DEFAULT_MOVE = {
  speed: 7.2, // m/s
  accel: 55,
  airAccel: 22,
  jump: 11.2, // initial jump velocity
  gravity: 30,
  maxFall: 34,
  coyote: 0.11,
  jumpBuffer: 0.13,
  sprint: 'none', // 'none' | 'burst' | 'dash'
  sprintMult: 1.55,
  sprintDur: 1.2,
  sprintCd: 3.6, // cooldown starts when the burst ends
  dashSpeed: 15,
  dashDur: 0.2,
  dashCd: 1.6,
  slideNy: 0.94, // ground normal Y below which you start sliding (~20 degrees)
  slide: 0.9,
  turnRate: 14,
};

export function makeMove(overrides) {
  return Object.assign({}, DEFAULT_MOVE, overrides || {});
}

export function makeChar(x = 0, y = 0, z = 0, yaw = 0) {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw,
    grounded: false, gid: -1, gnx: 0, gny: 1, gnz: 0,
    coyote: 0, jbuf: 0,
    kbT: 0, sprT: 0, sprCd: 0, dashT: 0, dashCd: 0, stunT: 0,
    svx: 0, svz: 0, // slope-slide velocity (separate so player control cannot cancel it)
    lock: 0, // 0 free, 1 frozen in place (no physics), 2 no control (physics only)
    speedMul: 1, jumpMul: 1, accelMul: 1, noSprint: 0,
    // per-step outputs (not networked)
    jumped: false, landed: false, dashed: false, hits: [],
    cvx: 0, cvz: 0, // carry velocity from the ground
  };
}

// Fields carried in snapshots so the client can reconcile its predicted character exactly.
export const CHAR_NET_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'kbT', 'sprT', 'sprCd', 'dashT', 'dashCd', 'stunT', 'coyote', 'gid', 'svx', 'svz'];

export function copyChar(dst, src) {
  for (const k of CHAR_NET_FIELDS) dst[k] = src[k];
  dst.grounded = src.grounded;
  dst.gnx = src.gnx; dst.gny = src.gny; dst.gnz = src.gnz;
  dst.lock = src.lock;
  dst.speedMul = src.speedMul;
  dst.jumpMul = src.jumpMul;
  dst.accelMul = src.accelMul;
  dst.noSprint = src.noSprint;
  dst.jbuf = src.jbuf;
  return dst;
}

const _res = { nx: 0, ny: 0, nz: 0, d: 0 };
const _p = { x: 0, y: 0, z: 0 };

// Apply an external knockback (used by server rules; deterministic so prediction replays it).
export function applyKnock(ch, dx, dz, speed, up, time = 0.35) {
  const l = Math.hypot(dx, dz) || 1;
  ch.vx = (dx / l) * speed;
  ch.vz = (dz / l) * speed;
  ch.vy = Math.max(ch.vy, up);
  ch.kbT = Math.max(ch.kbT, time);
  ch.grounded = false;
  ch.gid = -1;
}

function resolve(ch, world, P) {
  const cols = world.colliders;
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    const cy = ch.y + CHAR_R;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c.enabled || !c.solid) continue;
      if (!sphereVsCollider(c, ch.x, ch.y + CHAR_R, ch.z, CHAR_R, _res)) continue;
      any = true;
      ch.x += _res.nx * _res.d;
      ch.y += _res.ny * _res.d;
      ch.z += _res.nz * _res.d;
      const vn = ch.vx * _res.nx + ch.vy * _res.ny + ch.vz * _res.nz;
      if (vn < 0) {
        ch.vx -= _res.nx * vn;
        ch.vy -= _res.ny * vn;
        ch.vz -= _res.nz * vn;
      }
      if (_res.ny > 0.55) {
        ch.grounded = true;
        ch.gid = c.id;
        ch.gnx = _res.nx; ch.gny = _res.ny; ch.gnz = _res.nz;
        if (c.bounce > 0 && ch.vy <= 0.5) {
          ch.vy = c.bounce;
          ch.grounded = false;
          ch.gid = -1;
          ch.jumped = true;
        }
      }
      if (c.knock > 0 && ch.kbT < 0.2) {
        // Knock away from the collider surface (or from its centre for top contacts).
        let hx = _res.nx, hz = _res.nz;
        if (Math.abs(hx) + Math.abs(hz) < 0.2) { hx = ch.x - c.x; hz = ch.z - c.z; }
        applyKnock(ch, hx, hz, c.knock, c.knockUp, 0.4);
      }
      if (ch.hits.indexOf(c.id) < 0) ch.hits.push(c.id);
    }
    if (!any) break;
    void cy;
  }
}

// Advance one character by one fixed step.
// inp: { mx, mz, b, ay, ap } with (mx, mz) a world-space direction of length <= 1.
export function stepChar(ch, inp, world, P, dt) {
  ch.jumped = false;
  ch.landed = false;
  ch.dashed = false;
  ch.hits.length = 0;
  if (ch.lock === 1) {
    ch.vx = ch.vy = ch.vz = 0;
    return ch;
  }
  ch.kbT = Math.max(0, ch.kbT - dt);
  ch.sprT = Math.max(0, ch.sprT - dt);
  ch.sprCd = Math.max(0, ch.sprCd - dt);
  ch.dashT = Math.max(0, ch.dashT - dt);
  ch.dashCd = Math.max(0, ch.dashCd - dt);
  ch.stunT = Math.max(0, ch.stunT - dt);
  ch.coyote = Math.max(0, ch.coyote - dt);

  let mx = inp ? inp.mx : 0, mz = inp ? inp.mz : 0, b = inp ? inp.b : 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const canControl = ch.stunT <= 0 && ch.lock === 0;
  if (!canControl) { mx = 0; mz = 0; b = 0; }

  // Sprint burst / dash.
  if (P.sprint === 'burst' && (b & BTN.SPRINT_P) && ch.sprCd <= 0 && ch.sprT <= 0 && !ch.noSprint) {
    ch.sprT = P.sprintDur;
    ch.sprCd = P.sprintDur + P.sprintCd;
  } else if (P.sprint === 'dash' && (b & BTN.SPRINT_P) && ch.dashCd <= 0 && !ch.noSprint) {
    let dx = mx, dz = mz;
    if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(ch.yaw); dz = Math.cos(ch.yaw); }
    const dl = Math.hypot(dx, dz) || 1;
    ch.dashT = P.dashDur;
    ch.dashCd = P.dashCd;
    ch.vx = (dx / dl) * P.dashSpeed;
    ch.vz = (dz / dl) * P.dashSpeed;
    if (ch.vy < 1) ch.vy = Math.max(ch.vy, ch.grounded ? 2.5 : 1.5);
    ch.dashed = true;
  }

  const speed = P.speed * ch.speedMul * (ch.sprT > 0 ? P.sprintMult : 1);
  if (ch.dashT <= 0) {
    const tx = mx * speed, tz = mz * speed;
    const accel = (ch.grounded ? P.accel : P.airAccel) * ch.accelMul * (ch.kbT > 0 ? 0.1 : 1);
    let dvx = tx - ch.vx, dvz = tz - ch.vz;
    const dl = Math.hypot(dvx, dvz);
    const maxd = accel * dt;
    if (dl > maxd) { dvx *= maxd / dl; dvz *= maxd / dl; }
    ch.vx += dvx;
    ch.vz += dvz;
  }
  if (ml > 0.1 && canControl) {
    ch.yaw = approachAngle(ch.yaw, Math.atan2(mx, mz), P.turnRate * dt);
  }

  // Jump with buffering and coyote time.
  if (b & BTN.JUMP_P) ch.jbuf = P.jumpBuffer;
  else ch.jbuf = Math.max(0, ch.jbuf - dt);
  if (ch.jbuf > 0 && (ch.grounded || ch.coyote > 0) && canControl && P.jump > 0) {
    ch.vy = P.jump * ch.jumpMul;
    ch.vx += ch.cvx;
    ch.vz += ch.cvz;
    ch.grounded = false;
    ch.gid = -1;
    ch.coyote = 0;
    ch.jbuf = 0;
    ch.jumped = true;
  }

  // Gravity.
  ch.vy -= P.gravity * dt;
  if (ch.vy < -P.maxFall) ch.vy = -P.maxFall;

  // Slope sliding on tilted ground.
  let cdx = 0, cdy = 0, cdz = 0;
  if (ch.grounded && ch.gid >= 0) {
    const g = world.colliders[ch.gid];
    if (g && g.enabled) {
      if (ch.gny < P.slideNy) {
        const k = P.gravity * P.slide * g.slip * dt;
        ch.svx += ch.gnx * ch.gny * k;
        ch.svz += ch.gnz * ch.gny * k;
        const damp = Math.max(0, 1 - 2.5 * dt);
        ch.svx *= damp;
        ch.svz *= damp;
      } else {
        const damp = Math.max(0, 1 - 8 * dt);
        ch.svx *= damp;
        ch.svz *= damp;
      }
      if (g.kinematic) {
        g.carryPoint(ch.x, ch.y + CHAR_R, ch.z, _p);
        cdx = _p.x - ch.x;
        cdy = _p.y - (ch.y + CHAR_R);
        cdz = _p.z - ch.z;
        ch.yaw += g.yaw - g.pyaw;
      }
      if (g.conveyor) {
        const w = g.dirToWorld(g.conveyor.x, 0, g.conveyor.z, _p);
        cdx += w.x * dt;
        cdz += w.z * dt;
      }
    }
  }
  if (!ch.grounded && (ch.svx !== 0 || ch.svz !== 0)) {
    // Airborne: slide momentum becomes ordinary velocity.
    ch.vx += ch.svx; ch.vz += ch.svz; ch.svx = 0; ch.svz = 0;
  }
  cdx += ch.svx * dt;
  cdz += ch.svz * dt;
  ch.cvx = cdx / dt;
  ch.cvz = cdz / dt;

  const wasGrounded = ch.grounded;
  const dx = ch.vx * dt + cdx, dy = ch.vy * dt + cdy, dz = ch.vz * dt + cdz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const n = Math.max(1, Math.ceil(len / (CHAR_R * 0.45)));
  ch.grounded = false;
  ch.gid = -1;
  for (let s = 0; s < n; s++) {
    ch.x += dx / n;
    ch.y += dy / n;
    ch.z += dz / n;
    resolve(ch, world, P);
  }

  // Snap down onto ground when walking off small steps or down ramps.
  if (!ch.grounded && wasGrounded && !ch.jumped && ch.vy <= 0.5 && ch.kbT <= 0) {
    const oy = ch.y;
    ch.y -= 0.3;
    const ovy = ch.vy;
    resolve(ch, world, P);
    if (!ch.grounded) { ch.y = oy; ch.vy = ovy; }
  }

  if (ch.grounded) {
    ch.coyote = P.coyote;
    if (!wasGrounded) ch.landed = true;
    if (ch.vy < 0) ch.vy = 0;
  } else if (wasGrounded && !ch.jumped) {
    // Walked off a moving surface: keep its momentum.
    ch.vx += ch.cvx;
    ch.vz += ch.cvz;
  }
  return ch;
}

// Push overlapping characters apart (server only). chars: array of character states.
export function separateChars(chars) {
  const minD = CHAR_R * 1.8;
  for (let i = 0; i < chars.length; i++) {
    const a = chars[i];
    if (!a || a.lock === 1 || a.noCollide) continue;
    for (let j = i + 1; j < chars.length; j++) {
      const b = chars[j];
      if (!b || b.lock === 1 || b.noCollide) continue;
      if (Math.abs(a.y - b.y) > 1.2) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = d2 > 1e-8 ? dx / d : 1, nz = d2 > 1e-8 ? dz / d : 0;
      const push = (minD - d) * 0.5;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
      // Exchange a little momentum along the contact normal.
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        const k = rel * 0.5;
        a.vx += nx * k; a.vz += nz * k;
        b.vx -= nx * k; b.vz -= nz * k;
      }
    }
  }
}

// Does any part of the character's body (three stacked spheres) overlap collider c?
export function charOverlaps(ch, c, pad = 0) {
  const r = 0.38 + pad;
  return (
    sphereVsCollider(c, ch.x, ch.y + 0.35, ch.z, r, _res) ||
    sphereVsCollider(c, ch.x, ch.y + 0.8, ch.z, r, _res) ||
    sphereVsCollider(c, ch.x, ch.y + 1.25, ch.z, r, _res)
  );
}
