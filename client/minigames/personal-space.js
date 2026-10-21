// Personal Space — a shrinking target-board platform, shove effects and knockback meters.
import * as THREE from 'three';
import { toon, cylGeo, canvasTexture, cachedGeo, basic } from '../game/materials.js';
import { R_START } from '../../shared/games/personal-space.js';
import { addAbyss, spinAbyss } from './common.js';
import { FLAG } from '../../shared/constants.js';

function boardTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const cols = ['#4da3ff', '#ffffff', '#ff5da2', '#ffffff'];
    for (let i = 12; i > 0; i--) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, (i / 12) * (w / 2), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

const pct = (hits) => `${Math.round(100 + (hits * 1.5 / 5.5) * 100)}%`;

export default {
  theme: 'sunset',
  sky: { cloudY: -12, spread: 70 },

  setup(view) {
    const plat = new THREE.Group();
    const top = new THREE.Mesh(cylGeo(1, 1, 0.2, 64), new THREE.MeshToonMaterial({ map: boardTexture() }));
    top.position.y = -0.1;
    top.receiveShadow = true;
    const side = new THREE.Mesh(cylGeo(1, 0.94, 1.0, 64), toon('#2b1b5a'));
    side.position.y = -0.7;
    const under = new THREE.Mesh(cachedGeo('ps-under', () => new THREE.ConeGeometry(1, 1.4, 32)), toon('#8b5cf6'));
    under.rotation.x = Math.PI;
    under.position.y = -1.9;
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 80), basic('#ffd23f'));
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.02;
    plat.add(top, side, under, edge);
    view.scene.add(plat);
    view.plat = plat;
    view.platEdge = edge;
    addAbyss(view, -5.8, { color: '#ff5da2', glow: '#ffd23f' });
  },

  update(view, dt, { tPred }) {
    const c = view.world.colliders[0];
    const r = c.r;
    view.plat.scale.set(r, 1, r);
    view.platEdge.material = basic(Math.sin(view.time * 6) > 0 ? '#ffd23f' : '#ff5da2');
    spinAbyss(view, dt);
  },

  onEvent(view, e) {
    if (e.k === 'shove' || e.k === 'bump') {
      const a = view.chars[e.s];
      a.c.emote(e.k === 'shove' ? 'taunt' : 'cheer');
      if (e.t >= 0) {
        const b = view.chars[e.t];
        view.fx.puff(b.pos.x, b.pos.y + 0.9, b.pos.z, 8, '#ffffff', 0.35, 4);
        view.fx.floatText(e.k === 'shove' ? 'Shove!' : 'Bump!', b.pos.x, b.pos.y + 2.2, b.pos.z, '#ffd23f', 0.7);
        if (e.t === view.mySlot) view.shakeCam(0.35);
      } else {
        view.fx.puff(a.pos.x + Math.sin(a.yaw) * 1.2, a.pos.y + 0.9, a.pos.z + Math.cos(a.yaw) * 1.2, 4, '#ffffff', 0.25, 2);
      }
    }
  },

  hud(view) {
    const me = view.chars[view.mySlot];
    const shrinking = view.world.colliders[0].r < R_START - 0.05;
    return {
      lines: [
        { label: 'Still standing', value: `${view.aliveCount()} / ${view.n}` },
        me ? { label: 'Your knockback', value: pct(me.extra || 0) } : null,
        { label: 'Platform', value: shrinking ? 'Shrinking' : 'Full size' },
      ].filter(Boolean),
      board: view.chars.map((c) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: c.flags & FLAG.ALIVE ? pct(c.extra || 0) : 'Out', out: !(c.flags & FLAG.ALIVE) })),
      boardTitle: 'Knockback taken',
    };
  },
};
