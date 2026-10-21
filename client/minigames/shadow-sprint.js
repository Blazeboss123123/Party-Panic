// Shadow Sprint — neon lasers in the dark: gates, sweeping beams, a rotor and a laser floor.
import * as THREE from 'three';
import { boxGeo, cylGeo, basic, toon, cachedGeo } from '../game/materials.js';
import { GATES, BEAMS, ROTOR, TILES, BOOSTS, gateState, beamZ, rotorAngle, tileHot, tileWarn } from '../../shared/games/shadow-sprint.js';
import { checkpointFlags, finishBanner, waveFlags, raceEvent, raceBoard, trackFinish, myCheckpointLine } from './raceClient.js';
import { arrowMesh, glowSprite } from './common.js';

const CYAN = '#00f5d4';
const PINK = '#f15bb5';
const RED = '#ff2d55';

function laserMat(color, opacity = 0.9) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

export default {
  theme: 'night',
  sky: { clouds: false },

  setup(view) {
    // Stars
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 0.9;
      pos[i * 3] = Math.cos(a) * Math.cos(b) * 300;
      pos[i * 3 + 1] = Math.sin(b) * 300 - 20;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * 300;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    view.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false })));
    view.scene.fog = new THREE.Fog('#120a3a', 30, 140);
    view.hemi.intensity = 1.0;
    view.sun.intensity = 1.2;

    view.gates = GATES.map((g) => {
      const grp = new THREE.Group();
      const mat = laserMat(CYAN);
      for (const y of [0.3, 0.75, 1.2, 1.65, 2.1]) {
        const beam = new THREE.Mesh(cachedGeo('laser-x', () => { const c = new THREE.CylinderGeometry(0.035, 0.035, 8.4, 6); c.rotateZ(Math.PI / 2); return c; }), mat);
        beam.position.y = y;
        grp.add(beam);
      }
      grp.position.set(0, 0, g.z);
      view.scene.add(grp);
      return { grp, mat, g };
    });
    view.beams = BEAMS.map((b) => {
      const mat = laserMat(RED);
      const m = new THREE.Mesh(cachedGeo('beam-x', () => { const c = new THREE.CylinderGeometry(0.09, 0.09, 8.4, 8); c.rotateZ(Math.PI / 2); return c; }), mat);
      const glow = glowSprite(RED, 1.6);
      m.add(glow);
      view.scene.add(m);
      return { m, b };
    });
    view.rotor = new THREE.Mesh(cachedGeo('rotor', () => { const c = new THREE.CylinderGeometry(0.09, 0.09, ROTOR.len, 8); c.rotateX(Math.PI / 2); c.translate(0, 0, ROTOR.len / 2); return c; }), laserMat(RED));
    view.rotor.position.set(ROTOR.x, 0.45, ROTOR.z);
    view.scene.add(view.rotor);
    view.tiles = TILES.map((tile) => {
      const mat = new THREE.MeshBasicMaterial({ color: '#1a1033' });
      const m = new THREE.Mesh(boxGeo(2.55, 0.06, 2.55), mat);
      m.position.set(tile.x, 0.03, tile.z);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.55, 0.06, 2.55)), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5 }));
      edge.position.copy(m.position);
      view.scene.add(m, edge);
      return { m, mat, tile };
    });
    for (const b of BOOSTS) {
      for (let k = 0; k < 2; k++) {
        const a = arrowMesh('#ffd23f', 0.9, { opacity: 0.95 });
        a.position.set(b.x, 0.04, b.z - 0.3 + k * 0.6);
        view.scene.add(a);
      }
      const g = glowSprite('#ffd23f', 2);
      g.position.set(b.x, 0.3, b.z);
      view.scene.add(g);
    }
    // Neon edge posts along the course
    for (let z = 2; z < 92; z += 4) {
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(cylGeo(0.05, 0.05, 0.9, 6), basic(z % 8 === 2 ? CYAN : PINK));
        post.position.set(s * 4.5, 0.45, z);
        view.scene.add(post);
      }
    }
    checkpointFlags(view, CYAN);
    finishBanner(view, 'Finish');
  },

  update(view, dt, { tPred }) {
    const t = tPred;
    for (const { grp, mat, g } of view.gates) {
      const st = gateState(g, t);
      grp.visible = st.on || st.warn || true;
      if (st.on) { mat.color.set(CYAN); mat.opacity = 0.95; }
      else if (st.warn) { mat.color.set(PINK); mat.opacity = Math.sin(view.time * 40) > 0 ? 0.6 : 0.1; }
      else { mat.color.set(CYAN); mat.opacity = 0.06; }
    }
    for (const { m, b } of view.beams) m.position.set(0, 0.45, beamZ(b, t));
    view.rotor.rotation.y = rotorAngle(t);
    for (const { mat, tile } of view.tiles) {
      if (tileHot(tile, t)) mat.color.set(Math.sin(view.time * 30) > -0.3 ? PINK : RED);
      else if (tileWarn(tile, t)) mat.color.set(Math.sin(view.time * 40) > 0 ? '#5a2050' : '#1a1033');
      else mat.color.set('#1a1033');
    }
    waveFlags(view, dt);
  },

  onEvent(view, e) {
    trackFinish(view, e);
    if (raceEvent(view, e)) return;
    if (e.k === 'zap') {
      const who = view.chars[e.s];
      view.fx.sparkle(who.pos.x, who.pos.y + 0.8, who.pos.z, CYAN, 26, 6);
      view.fx.floatText('Zapped!', who.pos.x, who.pos.y + 2.2, who.pos.z, CYAN, 0.8);
      if (e.s === view.mySlot) { view.shakeCam(0.5); view.showBanner('Zapped!', 'out', 1); }
    } else if (e.k === 'boost' && e.s === view.mySlot) {
      view.showBanner('Speed boost!', 'info', 0.8);
    }
  },

  hud(view) {
    const me = view.chars[view.mySlot];
    return {
      lines: [myCheckpointLine(view), me && Array.isArray(me.extra) ? { label: 'Zapped', value: me.extra[1] } : null].filter(Boolean),
      board: raceBoard(view),
      boardTitle: 'Race order',
    };
  },
};

void toon;
