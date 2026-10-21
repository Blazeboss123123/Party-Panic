// Client-side prediction for the local character with server reconciliation.
//
// Every input tick the client steps its own character with the shared controller against
// its copy of the world (kinematic colliders evaluated at the predicted server time). When a
// snapshot arrives, the character is reset to the server's authoritative state for the last
// acknowledged input, and the inputs the server has not processed yet are replayed.
// The visual position eases out any remaining correction so it never visibly snaps.

import { makeChar, stepChar } from '../../shared/controller.js';
import { DT } from '../../shared/constants.js';

export class Predictor {
  constructor(world, P, spawn) {
    this.world = world;
    this.P = P;
    this.ch = makeChar(spawn.x, spawn.y, spawn.z, spawn.yaw || 0);
    this.ch.lock = 1;
    this.pending = [];
    this.seq = 0;
    this.err = { x: 0, y: 0, z: 0 };
    this.lastAck = 0;
    this.corrections = 0;
    this.lastErr = 0;
  }

  // Returns the input record to send.
  step(inp, tPred) {
    this.seq++;
    const rec = { seq: this.seq, mx: inp.mx, mz: inp.mz, b: inp.b, ay: inp.ay || 0, ap: inp.ap || 0, t: tPred };
    this.pending.push(rec);
    if (this.pending.length > 240) this.pending.shift();
    this.world.setTime(tPred, DT);
    stepChar(this.ch, rec, this.world, this.P, DT);
    return rec;
  }

  reconcile(me, tPredNow) {
    const ack = me[0];
    if (ack < this.lastAck) return;
    this.lastAck = ack;
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();
    const ch = this.ch;
    const ox = ch.x, oy = ch.y, oz = ch.z;
    ch.kbT = me[1]; ch.sprT = me[2]; ch.sprCd = me[3]; ch.dashT = me[4]; ch.dashCd = me[5]; ch.stunT = me[6];
    ch.coyote = me[7]; ch.gid = me[8]; ch.svx = me[9]; ch.svz = me[10];
    ch.speedMul = me[11]; ch.jumpMul = me[12]; ch.accelMul = me[13]; ch.jbuf = me[14]; ch.lock = me[15];
    ch.grounded = me[16] === 1; ch.gnx = me[17]; ch.gny = me[18]; ch.gnz = me[19];
    ch.x = me[20]; ch.y = me[21]; ch.z = me[22]; ch.vx = me[23]; ch.vy = me[24]; ch.vz = me[25]; ch.yaw = me[26];
    ch.noSprint = me[27] || 0;
    for (const rec of this.pending) {
      this.world.setTime(rec.t, DT);
      stepChar(ch, rec, this.world, this.P, DT);
    }
    this.world.setTime(tPredNow, DT);
    const dx = ox - ch.x, dy = oy - ch.y, dz = oz - ch.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    this.lastErr = Math.sqrt(d2);
    if (d2 > 0.0004) this.corrections++;
    if (d2 > 9) {
      // Teleports (respawns, big knockbacks): snap.
      this.err.x = this.err.y = this.err.z = 0;
    } else {
      this.err.x += dx; this.err.y += dy; this.err.z += dz;
    }
  }

  // Visual position = simulated position + decaying correction offset.
  visual(dt, out) {
    const k = Math.exp(-dt * 14);
    this.err.x *= k; this.err.y *= k; this.err.z *= k;
    out.x = this.ch.x + this.err.x;
    out.y = this.ch.y + this.err.y;
    out.z = this.ch.z + this.err.z;
    return out;
  }
}
