// The Floor Is Gone — server rules.
import { WARN_TIME, GRID } from '../../shared/games/floor-gone.js';
import { survivalRank, survivalOver, survivalStat } from './common.js';

const WAVE_START = 18;
const GRACE = 2; // seconds before tiles react to footsteps
const WAVE_EVERY = 7;

function setState(R, k, ch) {
  const s = R.gs.s;
  R.gs.s = s.slice(0, k) + ch + s.slice(k + 1);
}

function warnTile(R, k) {
  if (R.gs.s.charCodeAt(k) !== 48) return; // only solid tiles
  setState(R, k, '1');
  R.data.warnAt[k] = R.t;
}

export default {
  init(R) {
    R.data = { warnAt: new Float64Array(R.layout.data.tiles.length).fill(-1), wave: 0, nextWave: WAVE_START };
    R.data.tileOfCollider = new Map(R.layout.data.tiles.map((t, k) => [t.c, k]));
  },

  tick(R) {
    const tiles = R.layout.data.tiles;
    // Tiles under players start crumbling.
    for (const p of R.players) {
      if (R.t < GRACE) break;
      if (!p.alive || !p.ch.grounded) continue;
      const k = R.data.tileOfCollider.get(p.ch.gid);
      if (k !== undefined) warnTile(R, k);
    }
    // Outer rings collapse in waves.
    if (R.t >= R.data.nextWave) {
      const ring = Math.floor(GRID / 2) - 1 - R.data.wave;
      if (ring >= 1) {
        tiles.forEach((t, k) => { if (t.ring === ring) warnTile(R, k); });
        R.emit('wave', { ring });
      }
      R.data.wave++;
      R.data.nextWave += WAVE_EVERY;
    }
    // Warned tiles fall after the warning time.
    const s = R.gs.s;
    for (let k = 0; k < tiles.length; k++) {
      if (s.charCodeAt(k) === 49 && R.t - R.data.warnAt[k] >= WARN_TIME) {
        setState(R, k, '2');
        R.world.colliders[tiles[k].c].enabled = false;
      }
    }
  },

  net(R) {
    return { s: R.gs.s };
  },

  pextra(R, p) {
    return p.alive && p.ch.y > -3.5 ? 1 : 0; // which layer the player is on (1 = top)
  },

  isOver: survivalOver,

  stat(R, p) {
    const base = survivalStat(R, p);
    return p.alive && R.aliveCount() > 1 ? `${base} on the ${p.ch.y > -3.5 ? 'top' : 'bottom'} layer` : base;
  },

  // Survivors at the time limit: players still on the top layer beat those on the bottom.
  rank(R) {
    return survivalRank(R, [(p) => (p.alive && p.ch.y > -3.5 ? 1 : 0)]);
  },
};
