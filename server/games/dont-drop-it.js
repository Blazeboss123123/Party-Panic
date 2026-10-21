// Don't Drop It — server rules. Cakes are dynamic bodies; carrying changes handling; hazards,
// falls and dashing opponents make you drop; lost cakes return to your last checkpoint.
import { BTN, FLAG } from '../../shared/constants.js';
import { makeBody, stepBody } from '../../shared/physics.js';
import { applyKnock } from '../../shared/controller.js';
import { pathProgress } from '../../shared/games/kit.js';
import { CARRY } from '../../shared/games/dont-drop-it.js';
import { raceRank, raceStat } from './common.js';
import { round2 } from '../../shared/math.js';

const PICK_R = 1.8;

function cakeHome(R, p) {
  const cp = R.layout.course.checkpoints[p.cp];
  if (p.cp === 0) return R.layout.data.pedestals[p.slot];
  const off = ((p.slot % 4) - 1.5) * 1.2;
  return { x: cp.x + off, y: cp.y + 0.1, z: cp.z + 1.5 };
}

function resetCake(R, p) {
  const h = cakeHome(R, p);
  Object.assign(p.cake, { x: h.x, y: h.y + 0.45, z: h.z, vx: 0, vy: 0, vz: 0 });
  p.carrying = false;
  R.emit('cakeHome', { s: p.slot });
}

function drop(R, p, kx = 0, kz = 0, reason = 'drop') {
  if (!p.carrying) return;
  p.carrying = false;
  p.grabCd = 0.45;
  const c = p.cake, ch = p.ch;
  const l = Math.hypot(kx, kz);
  c.x = ch.x; c.y = ch.y + 1.7; c.z = ch.z;
  c.vx = ch.vx * 0.6 + (l ? (kx / l) * 3.5 : 0);
  c.vz = ch.vz * 0.6 + (l ? (kz / l) * 3.5 : 0);
  c.vy = 4;
  p.drops++;
  R.emit('cakeDrop', { s: p.slot, r: reason });
}

export default {
  init(R) {
    for (const p of R.players) {
      const pd = R.layout.data.pedestals[p.slot];
      p.cake = makeBody({ x: pd.x, y: pd.y + 0.45, z: pd.z, r: 0.42, restitution: 0.2, friction: 3.5 });
      p.carrying = false;
      p.grabCd = 0;
      p.cp = 0;
      p.cpT = 0;
      p.cakeProg = 0;
      p.drops = 0;
      p.immune = 0;
    }
    R.data.cutoff = null;
  },

  onStep(R, p, inp, dt) {
    p.grabCd = Math.max(0, p.grabCd - dt);
    if (!(inp.b & BTN.ACT_P) || p.finishT !== Infinity) return;
    const ch = p.ch;
    if (p.carrying) {
      // Put the cake down gently in front of you.
      p.carrying = false;
      p.grabCd = 0.3;
      Object.assign(p.cake, { x: ch.x + Math.sin(ch.yaw) * 0.9, y: ch.y + 0.9, z: ch.z + Math.cos(ch.yaw) * 0.9, vx: 0, vy: 0, vz: 0 });
      R.emit('cakeDrop', { s: p.slot, r: 'put' });
      return;
    }
    if (p.grabCd > 0) return;
    const c = p.cake;
    const dx = c.x - ch.x, dy = c.y - (ch.y + 0.6), dz = c.z - ch.z;
    if (dx * dx + dz * dz < PICK_R * PICK_R && Math.abs(dy) < 1.8) {
      p.carrying = true;
      R.emit('cakeGrab', { s: p.slot });
    }
  },

  tick(R, dt) {
    const course = R.layout.course;
    const pads = R.layout.data.pads;
    for (const p of R.players) {
      p.immune = Math.max(0, p.immune - dt);
      const ch = p.ch;
      if (!p.alive) continue;
      // Checkpoints follow the player.
      while (p.cp + 1 < course.checkpoints.length && ch.z >= course.checkpoints[p.cp + 1].z && ch.y > course.checkpoints[p.cp + 1].y - 3) {
        p.cp++;
        p.cpT = R.t;
        R.emit('cp', { s: p.slot, n: p.cp });
      }
      if (p.finishT !== Infinity) {
        p.flags = FLAG.CARRYING;
        continue;
      }
      if (p.carrying && ch.kbT > 0.05) drop(R, p, ch.vx, ch.vz, 'knock');
      if (p.carrying) {
        const c = p.cake;
        c.x = ch.x; c.y = ch.y + 1.7; c.z = ch.z; c.vx = ch.vx; c.vy = ch.vy; c.vz = ch.vz;
        const pad = pads[p.slot];
        if (Math.hypot(ch.x - pad.x, ch.z - pad.z) < pad.r + 0.15 && Math.abs(ch.y - pad.y) < 1.2) {
          R.finishPlayer(p);
          if (R.data.cutoff === null) R.data.cutoff = Math.min(R.duration, R.t + 25);
          continue;
        }
      } else {
        stepBody(p.cake, R.world, dt, 30);
        if (p.cake.y < R.layout.killY) resetCake(R, p);
      }
      p.cakeProg = Math.max(p.cakeProg, pathProgress(course.path, p.cake.x, p.cake.z));
      ch.speedMul = p.carrying ? CARRY.speed : 1;
      ch.jumpMul = p.carrying ? CARRY.jump : 1;
      ch.accelMul = p.carrying ? CARRY.accel : 1;
      ch.noSprint = p.carrying ? 1 : 0;
      p.flags = p.carrying ? FLAG.CARRYING : 0;
    }
    // Dashing into a carrier knocks their cake loose.
    for (const p of R.players) {
      if (!p.alive || p.ch.dashT <= 0) continue;
      for (const q of R.players) {
        if (q === p || !q.alive || q.immune > 0 || q.finishT !== Infinity) continue;
        const dx = q.ch.x - p.ch.x, dz = q.ch.z - p.ch.z;
        if (Math.abs(q.ch.y - p.ch.y) > 1.2 || Math.hypot(dx, dz) > 1.2) continue;
        applyKnock(q.ch, dx, dz, 6, 3.5, 0.3);
        q.immune = 0.5;
        if (q.carrying) drop(R, q, dx, dz, 'bump');
        p.ch.dashT = 0;
        R.emit('bump', { s: p.slot, t: q.slot });
      }
    }
  },

  onFall(R, p) {
    if (p.carrying || p.cake.y < R.layout.killY + 2) resetCake(R, p);
    const cp = R.layout.course.checkpoints[p.cp];
    const off = ((p.slot % 4) - 1.5) * 1.1;
    R.respawn(p, { x: cp.x + off, y: cp.y + 0.1, z: cp.z, yaw: 0 }, 0.6);
  },

  net(R) {
    return {
      cakes: R.players.map((p) => [p.slot, round2(p.cake.x), round2(p.cake.y), round2(p.cake.z), p.finishT !== Infinity ? 2 : p.carrying ? 1 : 0, round2(p.cake.rx), round2(p.cake.rz)]),
    };
  },

  pextra: (R, p) => [p.cp, p.carrying ? 1 : 0],
  isOver(R) {
    if (R.players.every((p) => p.finishT !== Infinity || !p.alive || p.forfeited)) return true;
    return R.data.cutoff !== null && R.t >= R.data.cutoff;
  },
  // Delivered by time; otherwise by how far the cake has travelled, then the player's
  // checkpoint, then fewer drops.
  rank: (R) => raceRank(R, [(p) => Math.round(p.cakeProg * 10) / 10, (p) => p.cp, (p) => -p.drops]),
  stat: (R, p) => raceStat(R, p, ` · dropped ${p.drops} ${p.drops === 1 ? 'time' : 'times'}`).replace('Finished in', 'Delivered in'),
};
