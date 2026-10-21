// Conveyor Chaos — factory dressing: smokestacks, warning lights, crusher shadows.
import * as THREE from 'three';
import { toon, cylGeo, basic, cachedGeo } from '../game/materials.js';
import { CRUSHERS, crusherHeight } from '../../shared/games/conveyor-chaos.js';
import { checkpointFlags, finishBanner, waveFlags, raceEvent, raceBoard, trackFinish, myCheckpointLine } from './raceClient.js';
import { glowSprite } from './common.js';

export default {
  theme: 'factory',
  sky: { cloudY: -18, spread: 100 },

  setup(view) {
    checkpointFlags(view, '#ff8a3d');
    finishBanner(view, 'Finish');
    // Smokestacks and gantries around the course.
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const z = -4 + i * 7.5;
      const stack = new THREE.Mesh(cylGeo(1.1, 1.5, 14 + (i % 3) * 4, 12), toon(i % 3 ? '#5b5f8a' : '#3b3561'));
      stack.position.set(side * (12 + (i % 3) * 2), -6 + (i % 3) * 2, z);
      view.scene.add(stack);
      const band = new THREE.Mesh(cylGeo(1.15, 1.15, 0.8, 12), toon('#ffd23f'));
      band.position.set(stack.position.x, stack.position.y + 4 + (i % 3) * 2, z);
      view.scene.add(band);
    }
    // Crusher shadows on the belt so players can read the danger zone.
    view.crusherMarks = CRUSHERS.map((cr) => {
      const m = new THREE.Mesh(cachedGeo('crusher-mark', () => new THREE.PlaneGeometry(9, 2.2)), basic('#ff2d55', { transparent: true, opacity: 0.3 }));
      m.material = m.material.clone();
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.03, cr.z);
      view.scene.add(m);
      return { m, cr };
    });
    view.lamps = [];
    for (let i = 0; i < 8; i++) {
      const g = glowSprite('#ff8a3d', 1.6);
      g.position.set((i % 2 ? 1 : -1) * 5.2, 2.6, 8 + i * 10);
      view.scene.add(g);
      view.lamps.push(g);
    }
  },

  update(view, dt, { tPred }) {
    for (const { m, cr } of view.crusherMarks) {
      const h = crusherHeight(tPred, cr.phase);
      m.material.opacity = 0.15 + (1 - (h - 0.75) / 3.45) * 0.5;
    }
    view.lamps.forEach((l, i) => { l.material.opacity = 0.4 + 0.6 * (Math.sin(view.time * 6 + i) > 0 ? 1 : 0); });
    waveFlags(view, dt);
  },

  onEvent(view, e) {
    trackFinish(view, e);
    raceEvent(view, e);
  },

  hud(view) {
    return {
      lines: [myCheckpointLine(view)].filter(Boolean),
      board: raceBoard(view),
      boardTitle: 'Race order',
    };
  },
};
