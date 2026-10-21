// Target Trouble — server rules: launchers fire real ballistic projectiles; only actual
// collisions between a projectile and a target score.
import { BTN } from '../../shared/constants.js';
import { SHOT, AIM, TARGETS, POINTS, RADIUS, RESPAWN, goldActive, targetPos, muzzle, BLOCKERS, blockerX } from '../../shared/games/target-trouble.js';
import { groupBy } from '../scoring/scoring.js';
import { clamp, round2 } from '../../shared/math.js';

const MAX_TURN = 0.14; // radians per input step: rejects impossible aim jumps
const tmp = {};

function hitSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  // Segment a->b against sphere c, r.
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const fx = ax - cx, fy = ay - cy, fz = az - cz;
  const L2 = dx * dx + dy * dy + dz * dz;
  let t = L2 > 0 ? -(fx * dx + fy * dy + fz * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = fx + dx * t, py = fy + dy * t, pz = fz + dz * t;
  return px * px + py * py + pz * pz <= r * r;
}

export default {
  init(R) {
    R.data.shots = [];
    R.data.nextShot = 1;
    R.data.deadUntil = new Map();
    for (const p of R.players) {
      p.score = 0; p.hits = 0; p.shotsFired = 0; p.cd = 0;
      p.aimYaw = 0; p.aimPitch = 0.35;
      p.ch.lock = 1;
    }
  },

  start(R) {
    for (const p of R.players) p.ch.lock = 1;
  },

  onStep(R, p, inp, dt) {
    p.cd = Math.max(0, p.cd - dt);
    // Aim comes from the client but is clamped to the launcher's range and turn speed.
    const ty = clamp(inp.ay, -AIM.yawMax, AIM.yawMax);
    const tp = clamp(inp.ap, AIM.pitchMin, AIM.pitchMax);
    p.aimYaw += clamp(ty - p.aimYaw, -MAX_TURN, MAX_TURN);
    p.aimPitch += clamp(tp - p.aimPitch, -MAX_TURN, MAX_TURN);
    p.ch.yaw = p.aimYaw;
    if ((inp.b & BTN.JUMP_P) && p.cd <= 0) {
      p.cd = SHOT.cooldown;
      const m = muzzle(p.slot, R.players.length, p.aimYaw, p.aimPitch);
      R.data.shots.push({ id: R.data.nextShot++, owner: p.slot, ...m, born: R.t });
      p.shotsFired++;
      R.emit('fire', { s: p.slot });
    }
  },

  tick(R, dt) {
    const t = R.t;
    // Respawn broken targets.
    for (const [id, until] of R.data.deadUntil) if (t >= until) R.data.deadUntil.delete(id);
    const keep = [];
    for (const s of R.data.shots) {
      const ax = s.x, ay = s.y, az = s.z;
      s.vy -= SHOT.gravity * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      let gone = false;
      for (const b of BLOCKERS) {
        const bx = blockerX(b, t);
        if (Math.abs(s.x - bx) < 1.6 + SHOT.radius && Math.abs(s.y - 2.4) < 1.8 + SHOT.radius && ((az - b.z) * (s.z - b.z) <= 0)) {
          gone = true;
          R.emit('block', { x: round2(s.x), y: round2(s.y), z: round2(b.z) });
          break;
        }
      }
      if (!gone) {
        for (const tg of TARGETS) {
          if (R.data.deadUntil.has(tg.id)) continue;
          if (tg.kind === 3 && !goldActive(t)) continue;
          const pos = targetPos(tg, t, tmp);
          let r = RADIUS[tg.kind] + SHOT.radius;
          if (tg.kind === 1) {
            // Spinning discs are only hittable while their face is turned towards the deck.
            const face = Math.abs(Math.cos(pos.spin));
            if (face < 0.35) continue;
            r *= face;
          }
          if (hitSphere(ax, ay, az, s.x, s.y, s.z, pos.x, pos.y, pos.z, r)) {
            const p = R.players[s.owner];
            const pts = POINTS[tg.kind];
            p.score += pts;
            p.hits++;
            p.scoreT = t;
            R.data.deadUntil.set(tg.id, tg.kind === 3 ? Infinity : t + RESPAWN[tg.kind]);
            R.emit('hit', { s: s.owner, tg: tg.id, pts, x: round2(pos.x), y: round2(pos.y), z: round2(pos.z) });
            gone = true;
            break;
          }
        }
      }
      if (!gone && (s.y < -2 || s.z > 70 || t - s.born > SHOT.life)) gone = true;
      if (!gone) keep.push(s);
    }
    R.data.shots = keep;
  },

  net(R) {
    const dead = [];
    for (const [id, until] of R.data.deadUntil) dead.push([id, until === Infinity ? -1 : round2(until)]);
    return {
      dead,
      shots: R.data.shots.map((s) => [s.id, round2(s.x), round2(s.y), round2(s.z), s.owner]),
      aim: R.players.map((p) => [round2(p.aimYaw), round2(p.aimPitch)]),
    };
  },

  pextra: (R, p) => [p.score, p.hits, p.shotsFired],
  isOver: () => false,
  // Score, then more hits, then accuracy; anything still equal is a shared place.
  rank: (R) => groupBy(R.players, [(p) => p.score, (p) => p.hits, (p) => (p.shotsFired ? Math.round((p.hits / p.shotsFired) * 1000) : 0)], (p) => p.pid),
  stat: (R, p) => `${p.score} points · ${p.hits} hits from ${p.shotsFired} shots`,
};
