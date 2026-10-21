// Treasure Tug — server rules: rope slots, arrow prompts validated on the server, team sync
// bonuses, interruptions, and a balanced pull strength for uneven teams.
import { BTN, FLAG } from '../../shared/constants.js';
import { applyKnock } from '../../shared/controller.js';
import { slotPos, inZone, teamDir, SLOTS } from '../../shared/games/treasure-tug.js';
import { round3 } from '../../shared/math.js';

const PULL = 0.0165;
const SYNC_WINDOW = 0.4;
const SYNC_BONUS = 1.35;
const FUMBLE = 0.6;
const INTERRUPT_CD = 4;
const PROMPT_BITS = [BTN.UP_P, BTN.RIGHT_P, BTN.DOWN_P, BTN.LEFT_P];

function newPrompt(R, p) {
  let d;
  do { d = R.rng.int(0, 3); } while (d === p.prompt);
  p.prompt = d;
}

function release(R, p) {
  if (!p.grabbing) return;
  p.grabbing = false;
  R.data.slots[p.team][p.slotIdx] = null;
  p.slotIdx = -1;
  p.ch.lock = 0;
}

export default {
  init(R) {
    R.gs.pos = 0;
    R.data.slots = [new Array(SLOTS).fill(null), new Array(SLOTS).fill(null)];
    R.data.lastPull = [-9, -9];
    R.data.winner = null;
    const sizes = [0, 0];
    for (const p of R.players) {
      if (p.team !== 0 && p.team !== 1) p.team = p.slot % 2;
      sizes[p.team]++;
      p.grabbing = false; p.slotIdx = -1; p.prompt = -1; p.fumble = 0; p.pulls = 0; p.force = 0; p.intCd = 0; p.interrupts = 0;
    }
    const big = Math.max(sizes[0], sizes[1], 1);
    R.data.factor = [big / Math.max(1, sizes[0]), big / Math.max(1, sizes[1])];
    R.data.sizes = sizes;
  },

  onStep(R, p, inp, dt) {
    p.fumble = Math.max(0, p.fumble - dt);
    p.intCd = Math.max(0, p.intCd - dt);
    const b = inp.b;
    if (b & BTN.ACT_P) {
      if (p.grabbing) {
        release(R, p);
        R.emit('let', { s: p.slot });
      } else if (inZone(p.team, p.ch.x, p.ch.z) && p.ch.stunT <= 0) {
        const slots = R.data.slots[p.team];
        // Nearest free rope slot.
        let best = -1, bd = Infinity;
        for (let k = 0; k < SLOTS; k++) {
          if (slots[k]) continue;
          const sp = slotPos(p.team, k);
          const d = Math.hypot(sp.x - p.ch.x, sp.z - p.ch.z);
          if (d < bd) { bd = d; best = k; }
        }
        if (best >= 0) {
          slots[best] = p.slot;
          p.grabbing = true;
          p.slotIdx = best;
          p.ch.lock = 2;
          newPrompt(R, p);
          R.emit('grab', { s: p.slot });
        } else R.emit('full', { s: p.slot });
      } else if (p.intCd <= 0) {
        // Interrupt a rival on their rope.
        let target = null, bd = 2.4;
        for (const q of R.players) {
          if (q.team === p.team || !q.grabbing) continue;
          const d = Math.hypot(q.ch.x - p.ch.x, q.ch.z - p.ch.z);
          if (d < bd) { bd = d; target = q; }
        }
        if (target) {
          release(R, target);
          target.ch.stunT = 1.2;
          applyKnock(target.ch, target.ch.x - p.ch.x, target.ch.z - p.ch.z, 5, 4, 0.25);
          p.intCd = INTERRUPT_CD;
          p.interrupts++;
          R.emit('interrupt', { s: p.slot, t: target.slot });
        }
      }
    }
    if (!p.grabbing || p.fumble > 0 || R.data.winner !== null) return;
    const pressed = PROMPT_BITS.findIndex((bit) => b & bit);
    if (pressed < 0) return;
    if (pressed === p.prompt) {
      const synced = R.t - R.data.lastPull[p.team] < SYNC_WINDOW;
      const amount = PULL * R.data.factor[p.team] * (synced ? SYNC_BONUS : 1);
      R.gs.pos += teamDir(p.team) * amount;
      R.data.lastPull[p.team] = R.t;
      p.pulls++;
      p.force += amount;
      newPrompt(R, p);
      R.emit('pull', { s: p.slot, sy: synced ? 1 : 0 });
    } else {
      p.fumble = FUMBLE;
      R.emit('fumble', { s: p.slot });
    }
  },

  tick(R) {
    // Keep rope holders on their slot, facing the chest.
    for (const p of R.players) {
      if (!p.grabbing) continue;
      const sp = slotPos(p.team, p.slotIdx);
      p.ch.x = sp.x; p.ch.z = sp.z; p.ch.yaw = sp.yaw;
      p.ch.vx = 0; p.ch.vz = 0;
      if (!p.connected) release(R, p);
    }
    if (R.data.winner === null && Math.abs(R.gs.pos) >= 1) {
      R.data.winner = R.gs.pos < 0 ? 0 : 1;
      R.gs.pos = Math.sign(R.gs.pos);
      R.emit('treasure', { team: R.data.winner });
    }
    for (const p of R.players) p.flags = p.grabbing ? FLAG.SPECIAL : 0;
  },

  net(R) {
    return { pos: round3(R.gs.pos) };
  },

  // [team, grabbing, prompt (-1 while fumbling), pulls]
  pextra: (R, p) => [p.team, p.grabbing ? 1 : 0, p.grabbing ? (p.fumble > 0 ? -1 : p.prompt) : -2, p.pulls],

  isOver: (R) => R.data.winner !== null,

  teamResult(R) {
    if (R.data.winner !== null) return { winner: R.data.winner, draw: false, pos: R.gs.pos };
    const pos = R.gs.pos;
    if (Math.abs(pos) >= 0.02) return { winner: pos < 0 ? 0 : 1, draw: false, pos };
    // Tiebreak: total pulling force per team member.
    const f = [0, 0];
    for (const p of R.players) f[p.team] += p.force;
    const a = f[0] / Math.max(1, R.data.sizes[0]), b = f[1] / Math.max(1, R.data.sizes[1]);
    if (Math.abs(a - b) < 1e-9) return { winner: null, draw: true, pos };
    return { winner: a > b ? 0 : 1, draw: false, pos };
  },

  rank(R) {
    const res = this.teamResult(R);
    if (res.draw) return [R.players.map((p) => p.pid)];
    const win = R.players.filter((p) => p.team === res.winner).map((p) => p.pid);
    const lose = R.players.filter((p) => p.team !== res.winner).map((p) => p.pid);
    return [win, lose].filter((g) => g.length);
  },

  stat: (R, p) => `${p.pulls} pulls${p.interrupts ? ` · ${p.interrupts} interrupts` : ''}`,
};
