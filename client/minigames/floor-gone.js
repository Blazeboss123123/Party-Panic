// The Floor Is Gone — candy-tile visuals with warning flashes and falling tiles.
import * as THREE from 'three';
import { roundedBoxGeo, toon } from '../game/materials.js';
import { TILE_HALF, LAYERS, WARN_TIME } from '../../shared/games/floor-gone.js';
import { addAbyss, spinAbyss, lollipop } from './common.js';

const COLORS = [
  ['#ffe066', '#fff4c2'], // top layer checker
  ['#ff9fd0', '#e3c6ff'], // bottom layer checker
];
const WARN = new THREE.Color('#ff7a1a');
const WARN2 = new THREE.Color('#ffffff');
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const sc = new THREE.Vector3(1, 1, 1);
const p = new THREE.Vector3();
const col = new THREE.Color();

export default {
  theme: 'candy',
  sky: { cloudY: -24, spread: 80, count: 18 },
  skipGeneric: (c) => c.tag === 'tile',

  setup(view) {
    const tiles = view.layout.data.tiles;
    const geo = roundedBoxGeo(TILE_HALF * 2, 0.9, TILE_HALF * 2, 0.16, 2);
    view.tileMesh = new THREE.InstancedMesh(geo, toon('#ffffff'), tiles.length);
    view.tileMesh.castShadow = true;
    view.tileMesh.receiveShadow = true;
    view.tileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    view.tileState = tiles.map(() => ({ s: 48, changedAt: 0 }));
    view.tileBase = tiles.map((t) => new THREE.Color(COLORS[t.layer][(t.i + t.j) % 2]));
    for (let k = 0; k < tiles.length; k++) view.tileMesh.setColorAt(k, view.tileBase[k]);
    view.scene.add(view.tileMesh);
    addAbyss(view, -17.5, { color: '#ff5da2', glow: '#ffe0f0' });
    // Decorative lollipops on floating rocks around the arena.
    const cols = ['#ff5da2', '#1fc8c1', '#8b5cf6', '#ffd23f'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const l = lollipop(cols[i % 4], 3 + (i % 3));
      l.position.set(Math.cos(a) * 21, -5 - (i % 3) * 2, Math.sin(a) * 21);
      l.rotation.y = -a;
      view.scene.add(l);
    }
    view.layerLabelY = LAYERS;
  },

  update(view, dt) {
    const tiles = view.layout.data.tiles;
    const s = view.gs.s;
    const now = view.localNow();
    for (let k = 0; k < tiles.length; k++) {
      const t = tiles[k];
      const st = view.tileState[k];
      const code = s.charCodeAt(k);
      if (code !== st.s) {
        st.s = code;
        st.changedAt = now;
        if (code === 50) view.fx.puff(t.x, LAYERS[t.layer] - 0.4, t.z, 3, view.tileBase[k].getStyle(), 0.4, 1.5);
      }
      let y = LAYERS[t.layer] - 0.45;
      let ox = 0, oz = 0, rx = 0, rz = 0, scale = 1;
      col.copy(view.tileBase[k]);
      if (code === 49) {
        const age = now - st.changedAt;
        const f = Math.min(1, age / WARN_TIME);
        const flash = Math.sin(age * (14 + f * 30)) > 0 ? 1 : 0;
        col.lerp(flash ? WARN : WARN2, 0.35 + f * 0.6);
        ox = Math.sin(age * 60) * 0.05 * f;
        oz = Math.cos(age * 53) * 0.05 * f;
        y -= f * 0.12;
      } else if (code === 50) {
        const age = now - st.changedAt;
        y -= 0.5 * 28 * age * age;
        rx = age * 1.7 * ((k % 2) ? 1 : -1);
        rz = age * 1.1;
        scale = Math.max(0.001, 1 - age * 0.6);
        col.lerp(WARN, 0.6);
        if (age > 1.8) scale = 0.0001;
      }
      p.set(t.x + ox, y, t.z + oz);
      q.setFromEuler(e.set(rx, 0, rz));
      sc.set(scale, scale, scale);
      m4.compose(p, q, sc);
      view.tileMesh.setMatrixAt(k, m4);
      view.tileMesh.setColorAt(k, col);
    }
    view.tileMesh.instanceMatrix.needsUpdate = true;
    view.tileMesh.instanceColor.needsUpdate = true;
    spinAbyss(view, dt);
  },

  onEvent(view, ev) {
    if (ev.k === 'wave') view.pushFeed('The outer ring is crumbling!', '#ffb347');
  },

  hud(view) {
    const layer = view.chars[view.mySlot]?.extra;
    return {
      lines: [
        { label: 'Still standing', value: `${view.aliveCount()} / ${view.n}` },
        view.mySlot >= 0 && view.chars[view.mySlot].flags & 2 ? { label: 'Your layer', value: layer ? 'Top' : 'Bottom' } : null,
      ].filter(Boolean),
    };
  },

  dispose(view) {
    view.tileMesh?.geometry && view.tileMesh.dispose();
  },
};
