// Dash for Cash — coins, checkpoint flags, finish banner and decorative scenery.
import * as THREE from 'three';
import { toon, cylGeo, sphereGeo, cachedGeo } from '../game/materials.js';
import { coinMesh, floatingRock } from './common.js';
import { checkpointFlags, finishBanner, waveFlags, raceEvent, raceBoard, trackFinish, myCheckpointLine } from './raceClient.js';

function tree(color) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(cylGeo(0.18, 0.25, 1.6, 8), toon('#a86b4c'));
  trunk.position.y = 0.8;
  const top = new THREE.Mesh(sphereGeo(1.1, 14, 10), toon(color));
  top.position.y = 2.2;
  top.scale.set(1, 1.15, 1);
  g.add(trunk, top);
  return g;
}

export default {
  theme: 'day',
  sky: { cloudY: -14, spread: 120, count: 22 },

  setup(view) {
    view.coinMeshes = new Map();
    for (const c of view.layout.data.coins) {
      const m = coinMesh();
      m.position.set(c.x, c.y, c.z);
      view.scene.add(m);
      view.coinMeshes.set(c.id, m);
    }
    checkpointFlags(view, '#ff5da2');
    finishBanner(view, 'Finish');
    // Scenery: floating islands with trees either side of the course.
    const greens = ['#3ddc97', '#8bdb3c', '#1fc8c1'];
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      const z = -4 + i * 8;
      const isl = new THREE.Group();
      const base = new THREE.Mesh(cylGeo(2.4, 1.8, 1, 10), toon('#8bdb3c'));
      const rock = floatingRock('#c08457', 1.8);
      rock.position.y = -1.6;
      rock.scale.set(1.3, 1.4, 1.3);
      isl.add(base, rock);
      const t = tree(greens[i % 3]);
      t.position.y = 0.5;
      isl.add(t);
      isl.position.set(side * (13 + (i % 3) * 3), -3 - (i % 4), z);
      view.scene.add(isl);
    }
  },

  update(view, dt) {
    const spin = view.time * 3;
    for (const m of view.coinMeshes.values()) {
      m.rotation.y = spin;
      m.position.y += Math.sin(view.time * 3 + m.position.z) * 0.003;
    }
    waveFlags(view, dt);
  },

  onEvent(view, e) {
    trackFinish(view, e);
    if (raceEvent(view, e)) return;
    if (e.k === 'coin') {
      const c = view.layout.data.coins[e.id];
      if (e.s === view.mySlot) {
        const m = view.coinMeshes.get(e.id);
        if (m) m.visible = false;
        view.fx.sparkle(c.x, c.y, c.z, '#ffd23f', 12, 3);
        view.fx.floatText('+1', c.x, c.y + 0.8, c.z, '#ffd23f', 0.6);
      }
    }
  },

  hud(view) {
    const me = view.chars[view.mySlot];
    const coins = me && Array.isArray(me.extra) ? me.extra[1] : 0;
    return {
      lines: [myCheckpointLine(view), me ? { label: 'Coins (tie-breaker)', value: coins } : null].filter(Boolean),
      board: raceBoard(view),
      boardTitle: 'Race order',
    };
  },
};
