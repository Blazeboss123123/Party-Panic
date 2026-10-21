// Deterministic 3D physics shared by the authoritative server and client-side prediction.
//
// The world is made of colliders (oriented boxes and vertical cylinders). Colliders can be
// static or kinematic: a kinematic collider has a motion(t, gameState, collider) function that
// is a pure function of round time plus shared game state, so the server and every client
// evaluate the same pose for the same time. Characters are spheres with a platformer
// controller (see controller.js). Dynamic bodies (boulders, dropped objects, projectiles)
// are spheres with gravity, restitution and friction.

import { eulerMatrix } from './math.js';

let nextColliderUid = 1;

export class Collider {
  constructor(o = {}) {
    this.uid = nextColliderUid++;
    this.id = -1; // index inside its world
    this.type = o.type || 'box'; // 'box' | 'cyl'
    this.x = o.x || 0;
    this.y = o.y || 0;
    this.z = o.z || 0;
    this.hx = o.hx ?? 1;
    this.hy = o.hy ?? 1;
    this.hz = o.hz ?? 1;
    this.r = o.r ?? 1;
    this.hh = o.hh ?? 0.5;
    this.yaw = o.yaw || 0;
    this.pitch = o.pitch || 0;
    this.roll = o.roll || 0;
    this.m = new Float64Array(9);
    this.pm = new Float64Array(9);
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
    this.pyaw = this.yaw;
    this.solid = o.solid !== false;
    this.enabled = o.enabled !== false;
    this.conveyor = o.conveyor || null; // {x, z} surface velocity in collider-local frame
    this.knock = o.knock || 0; // horizontal knockback speed applied to characters on contact
    this.knockUp = o.knockUp ?? 5;
    this.bounce = o.bounce || 0; // upward launch speed for bounce pads
    this.slip = o.slip ?? 1; // multiplier on slope sliding
    this.hazard = o.hazard || null; // game-specific hazard descriptor for non-solid volumes
    this.tag = o.tag || '';
    this.look = o.look || null; // visual description used by the client renderer
    this.data = o.data || {};
    this.motion = o.motion || null; // (t, gs, collider) => void
    this.kinematic = !!o.motion;
    this.updateMatrix();
    this.savePrev();
    this.computeBound();
  }

  updateMatrix() {
    eulerMatrix(this.yaw, this.pitch, this.roll, this.m);
  }

  savePrev() {
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
    this.pyaw = this.yaw;
    this.pm.set(this.m);
  }

  computeBound() {
    this.bound = this.type === 'box'
      ? Math.sqrt(this.hx * this.hx + this.hy * this.hy + this.hz * this.hz)
      : Math.sqrt(this.r * this.r + this.hh * this.hh);
  }

  // World -> local (current pose).
  toLocal(x, y, z, out) {
    const m = this.m;
    const dx = x - this.x, dy = y - this.y, dz = z - this.z;
    out.x = m[0] * dx + m[3] * dy + m[6] * dz;
    out.y = m[1] * dx + m[4] * dy + m[7] * dz;
    out.z = m[2] * dx + m[5] * dy + m[8] * dz;
    return out;
  }

  // Local direction -> world direction.
  dirToWorld(x, y, z, out) {
    const m = this.m;
    out.x = m[0] * x + m[1] * y + m[2] * z;
    out.y = m[3] * x + m[4] * y + m[5] * z;
    out.z = m[6] * x + m[7] * y + m[8] * z;
    return out;
  }

  // Where a point that was rigidly attached to this collider at the previous pose is now.
  carryPoint(x, y, z, out) {
    const pm = this.pm, m = this.m;
    const dx = x - this.px, dy = y - this.py, dz = z - this.pz;
    const lx = pm[0] * dx + pm[3] * dy + pm[6] * dz;
    const ly = pm[1] * dx + pm[4] * dy + pm[7] * dz;
    const lz = pm[2] * dx + pm[5] * dy + pm[8] * dz;
    out.x = m[0] * lx + m[1] * ly + m[2] * lz + this.x;
    out.y = m[3] * lx + m[4] * ly + m[5] * lz + this.y;
    out.z = m[6] * lx + m[7] * ly + m[8] * lz + this.z;
    return out;
  }

  // Is a world point inside this collider's volume (with optional padding)?
  containsPoint(x, y, z, pad = 0) {
    const l = this.toLocal(x, y, z, _tmpA);
    if (this.type === 'box') {
      return Math.abs(l.x) <= this.hx + pad && Math.abs(l.y) <= this.hy + pad && Math.abs(l.z) <= this.hz + pad;
    }
    return Math.abs(l.y) <= this.hh + pad && l.x * l.x + l.z * l.z <= (this.r + pad) * (this.r + pad);
  }
}

const _tmpA = { x: 0, y: 0, z: 0 };
const _tmpB = { x: 0, y: 0, z: 0 };

// Sphere vs collider. Returns true and fills res {nx, ny, nz, d} (world normal pointing out of
// the collider towards the sphere, and penetration depth) when overlapping.
export function sphereVsCollider(c, x, y, z, r, res) {
  const dx = x - c.x, dy = y - c.y, dz = z - c.z;
  const reach = c.bound + r;
  if (dx * dx + dy * dy + dz * dz > reach * reach) return false;
  const l = c.toLocal(x, y, z, _tmpA);
  let nx, ny, nz, d;
  if (c.type === 'box') {
    const qx = l.x < -c.hx ? -c.hx : l.x > c.hx ? c.hx : l.x;
    const qy = l.y < -c.hy ? -c.hy : l.y > c.hy ? c.hy : l.y;
    const qz = l.z < -c.hz ? -c.hz : l.z > c.hz ? c.hz : l.z;
    const ex = l.x - qx, ey = l.y - qy, ez = l.z - qz;
    const e2 = ex * ex + ey * ey + ez * ez;
    if (e2 > 1e-12) {
      if (e2 >= r * r) return false;
      const e = Math.sqrt(e2);
      nx = ex / e; ny = ey / e; nz = ez / e;
      d = r - e;
    } else {
      // Centre inside the box: push out along the axis of least penetration.
      const px = c.hx - Math.abs(l.x), py = c.hy - Math.abs(l.y), pz = c.hz - Math.abs(l.z);
      if (py <= px && py <= pz) { nx = 0; ny = l.y >= 0 ? 1 : -1; nz = 0; d = py + r; }
      else if (px <= pz) { nx = l.x >= 0 ? 1 : -1; ny = 0; nz = 0; d = px + r; }
      else { nx = 0; ny = 0; nz = l.z >= 0 ? 1 : -1; d = pz + r; }
    }
  } else {
    const rl2 = l.x * l.x + l.z * l.z;
    const rl = Math.sqrt(rl2);
    let qx = l.x, qz = l.z;
    if (rl > c.r) { qx = (l.x / rl) * c.r; qz = (l.z / rl) * c.r; }
    const qy = l.y < -c.hh ? -c.hh : l.y > c.hh ? c.hh : l.y;
    const ex = l.x - qx, ey = l.y - qy, ez = l.z - qz;
    const e2 = ex * ex + ey * ey + ez * ez;
    if (e2 > 1e-12) {
      if (e2 >= r * r) return false;
      const e = Math.sqrt(e2);
      nx = ex / e; ny = ey / e; nz = ez / e;
      d = r - e;
    } else {
      const side = c.r - rl, top = c.hh - l.y, bot = c.hh + l.y;
      if (top <= side && top <= bot) { nx = 0; ny = 1; nz = 0; d = top + r; }
      else if (bot <= side) { nx = 0; ny = -1; nz = 0; d = bot + r; }
      else if (rl > 1e-6) { nx = l.x / rl; ny = 0; nz = l.z / rl; d = side + r; }
      else { nx = 1; ny = 0; nz = 0; d = side + r; }
    }
  }
  c.dirToWorld(nx, ny, nz, _tmpB);
  res.nx = _tmpB.x;
  res.ny = _tmpB.y;
  res.nz = _tmpB.z;
  res.d = d;
  return true;
}

export class World {
  constructor() {
    this.colliders = [];
    this.kinematics = [];
    this.gs = {}; // shared game state read by kinematic motion functions
    this.t = 0;
  }

  add(c) {
    if (!(c instanceof Collider)) c = new Collider(c);
    c.id = this.colliders.length;
    this.colliders.push(c);
    if (c.kinematic) this.kinematics.push(c);
    return c;
  }

  addAll(list) {
    for (const c of list) this.add(c);
  }

  // Evaluate kinematic colliders at time t, remembering their pose at t - dt for carrying.
  setTime(t, dt) {
    this.t = t;
    const gs = this.gs;
    for (let i = 0; i < this.kinematics.length; i++) {
      const c = this.kinematics[i];
      c.motion(t - dt, gs, c);
      c.updateMatrix();
      c.savePrev();
      c.motion(t, gs, c);
      c.updateMatrix();
      c.computeBound();
    }
  }

  // Pose-only evaluation for rendering (no prev bookkeeping needed).
  evalPose(t) {
    const gs = this.gs;
    for (let i = 0; i < this.kinematics.length; i++) {
      const c = this.kinematics[i];
      c.motion(t, gs, c);
      c.updateMatrix();
      c.computeBound();
    }
  }

  byTag(tag) {
    return this.colliders.filter((c) => c.tag === tag);
  }
}

// ---------------------------------------------------------------------------------------
// Dynamic sphere bodies.

export function makeBody(o) {
  return {
    x: o.x || 0, y: o.y || 0, z: o.z || 0,
    vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
    r: o.r ?? 0.5,
    restitution: o.restitution ?? 0.25,
    friction: o.friction ?? 1.5,
    gscale: o.gscale ?? 1,
    grounded: false,
    alive: true,
    rx: 0, rz: 0, // accumulated roll angles for visuals
    data: o.data || {},
  };
}

const _res = { nx: 0, ny: 0, nz: 0, d: 0 };

export function stepBody(b, world, dt, gravity, onHit) {
  b.vy -= gravity * b.gscale * dt;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  const n = Math.max(1, Math.ceil((sp * dt) / (b.r * 0.5)));
  const sdt = dt / n;
  b.grounded = false;
  const cols = world.colliders;
  for (let s = 0; s < n; s++) {
    b.x += b.vx * sdt;
    b.y += b.vy * sdt;
    b.z += b.vz * sdt;
    for (let iter = 0; iter < 2; iter++) {
      let any = false;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!c.enabled || !c.solid) continue;
        if (!sphereVsCollider(c, b.x, b.y, b.z, b.r, _res)) continue;
        any = true;
        b.x += _res.nx * _res.d;
        b.y += _res.ny * _res.d;
        b.z += _res.nz * _res.d;
        const vn = b.vx * _res.nx + b.vy * _res.ny + b.vz * _res.nz;
        if (vn < 0) {
          const k = (1 + b.restitution) * vn;
          b.vx -= _res.nx * k;
          b.vy -= _res.ny * k;
          b.vz -= _res.nz * k;
          if (onHit && -vn > 2) onHit(b, c, -vn);
        }
        if (_res.ny > 0.5) {
          b.grounded = true;
          if (c.conveyor) {
            const w = c.dirToWorld(c.conveyor.x, 0, c.conveyor.z, _tmpA);
            b.vx += (w.x - b.vx) * Math.min(1, 6 * sdt);
            b.vz += (w.z - b.vz) * Math.min(1, 6 * sdt);
          }
        }
      }
      if (!any) break;
    }
  }
  if (b.grounded) {
    const f = Math.max(0, 1 - b.friction * dt);
    b.vx *= f;
    b.vz *= f;
  }
  b.rx += (b.vz * dt) / b.r;
  b.rz -= (b.vx * dt) / b.r;
}
