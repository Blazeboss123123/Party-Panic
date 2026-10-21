// Boulder Panic — rolling stone boulders, glowing lane warnings, hearts.
import * as THREE from 'three';
import { toon, basic, cachedGeo, cylGeo, sphereGeo } from '../game/materials.js';
import { HALF } from '../../shared/games/boulder-panic.js';
import { arrowMesh, floatingRock } from './common.js';
import { FLAG } from '../../shared/constants.js';

const stoneGeo = () => cachedGeo('boulder', () => {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + Math.sin(pos.getX(i) * 5.1) * 0.05 + Math.cos(pos.getZ(i) * 4.3) * 0.05;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
});

function cactus() {
  const g = new THREE.Group();
  const m = toon('#3ddc97');
  const trunk = new THREE.Mesh(cylGeo(0.45, 0.5, 3.2, 10), m);
  trunk.position.y = 1.6;
  g.add(trunk);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(cylGeo(0.28, 0.3, 1.2, 8), m);
    arm.position.set(s * 0.8, 1.8 + s * 0.3, 0);
    const elbow = new THREE.Mesh(cylGeo(0.28, 0.28, 0.7, 8), m);
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(s * 0.5, 1.25 + s * 0.3, 0);
    g.add(arm, elbow);
  }
  return g;
}

export default {
  theme: 'sunset',
  sky: { cloudY: -18, spread: 90 },

  setup(view) {
    view.boulders = new Map();
    view.warnMeshes = new Map();
    view.stoneMat = toon('#8d7a6a');
    // Mesas and cacti around the arena
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const r = 30 + (i % 3) * 6;
      const mesa = new THREE.Mesh(cylGeo(4 + (i % 3), 5 + (i % 3), 6 + (i % 4) * 2, 9), toon(i % 2 ? '#d9825b' : '#c4673f'));
      mesa.position.set(Math.cos(a) * r, -6 + (i % 4), Math.sin(a) * r);
      view.scene.add(mesa);
      const c = cactus();
      c.position.set(Math.cos(a) * r, mesa.position.y + mesa.geometry.parameters.height / 2, Math.sin(a) * r);
      view.scene.add(c);
    }
    for (let i = 0; i < 6; i++) {
      const rk = floatingRock('#b07a55', 2 + (i % 3));
      const a = i * 1.1;
      rk.position.set(Math.cos(a) * 20, -9 - (i % 3) * 2, Math.sin(a) * 20);
      view.scene.add(rk);
    }
  },

  update(view, dt, { tRem, tNow }) {
    const list = view.interpList('b', tRem);
    for (const [id, b] of list) {
      let m = view.boulders.get(id);
      if (!m) {
        m = new THREE.Mesh(stoneGeo(), view.stoneMat);
        m.castShadow = true;
        view.scene.add(m);
        view.boulders.set(id, m);
        view.fx.puff(b.x, b.y - b.raw[4] * 0.8, b.z, 6, '#e9c79a', 0.5, 2);
      }
      const r = b.raw[4];
      m.scale.setScalar(r);
      m.position.set(b.x, b.y, b.z);
      m.rotation.set(b.raw[5], 0, b.raw[6]);
      m.userData.seen = view.time;
    }
    for (const [id, m] of view.boulders) {
      if (!list.has(id)) {
        view.scene.remove(m);
        view.boulders.delete(id);
      }
    }
    // Lane warnings: a pulsing strip with direction arrows until the boulder launches.
    const warn = view.gs.warn || [];
    const live = new Set();
    for (const w of warn) {
      const [id, side, lane, at, r] = w;
      live.add(id);
      let g = view.warnMeshes.get(id);
      if (!g) {
        g = new THREE.Group();
        const along = side < 2;
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(along ? HALF * 2 : r * 2, along ? r * 2 : HALF * 2), basic('#ff2d55', { transparent: true, opacity: 0.35 }));
        strip.material = strip.material.clone();
        strip.userData.ownMaterial = true;
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(along ? 0 : lane, 0.03, along ? lane : 0);
        g.add(strip);
        g.userData.strip = strip;
        const dir = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][side];
        for (let k = 0; k < 3; k++) {
          const ar = arrowMesh('#ffffff', 1.2);
          const o = -HALF + 3 + k * 2.2;
          const pos = [[o, lane], [-o, lane], [lane, o], [lane, -o]][side];
          ar.position.set(pos[0], 0.05, pos[1]);
          ar.rotation.y = dir;
          g.add(ar);
        }
        view.scene.add(g);
        view.warnMeshes.set(id, g);
      }
      const left = Math.max(0, at - tNow);
      g.userData.strip.material.opacity = 0.25 + 0.3 * (Math.sin(view.time * (10 + (1.5 - left) * 14)) * 0.5 + 0.5);
    }
    for (const [id, g] of view.warnMeshes) {
      if (!live.has(id)) {
        view.scene.remove(g);
        g.userData.strip.material.dispose();
        view.warnMeshes.delete(id);
      }
    }
  },

  onEvent(view, e) {
    if (e.k === 'hit') {
      const who = view.chars[e.s];
      view.fx.puff(who.pos.x, who.pos.y + 0.8, who.pos.z, 10, '#e9c79a', 0.45, 3);
      view.fx.floatText(e.h > 0 ? `${e.h} left` : 'Crushed!', who.pos.x, who.pos.y + 2.3, who.pos.z, '#ff5da2', 0.8);
      if (e.s === view.mySlot) view.shakeCam(0.6);
    }
  },

  hud(view) {
    const me = view.chars[view.mySlot];
    const hearts = (h) => (h > 0 ? '♥'.repeat(h) : '—');
    return {
      lines: [
        { label: 'Still standing', value: `${view.aliveCount()} / ${view.n}` },
        me ? { label: 'Your hearts', value: me.flags & FLAG.ALIVE ? hearts(me.extra) : 'Out' } : null,
      ].filter(Boolean),
      board: view.chars.map((c) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: c.flags & FLAG.ALIVE ? hearts(c.extra) : 'Out', out: !(c.flags & FLAG.ALIVE) })),
      boardTitle: 'Hearts',
    };
  },
};
