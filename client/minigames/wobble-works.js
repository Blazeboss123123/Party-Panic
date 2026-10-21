// Wobble Works — brass-and-teal tilting platforms on ball joints, with tilt warnings.
import * as THREE from 'three';
import { toon, cylGeo, sphereGeo, roundedBoxGeo, boxGeo, canvasTexture, basic } from '../game/materials.js';
import { CENTRES, HALF, THICK } from '../../shared/games/wobble-works.js';
import { arrowMesh, addAbyss, spinAbyss } from './common.js';
import { applyPose } from '../game/arenaMesh.js';
import { FLAG } from '../../shared/constants.js';

function topTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1fc8c1';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(43,27,90,0.35)';
    ctx.lineWidth = 6;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo((i * w) / 4, 0); ctx.lineTo((i * w) / 4, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (i * h) / 4); ctx.lineTo(w, (i * h) / 4); ctx.stroke();
    }
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 26, 0, Math.PI * 2); ctx.fill();
  });
}

export default {
  theme: 'factory',
  sky: { cloudY: -16, spread: 70 },

  setup(view) {
    const topTex = topTexture();
    view.plats = CENTRES.map(([cx, cz], i) => {
      const g = new THREE.Group();
      g.rotation.order = 'YXZ';
      const body = new THREE.Mesh(roundedBoxGeo(HALF * 2, THICK * 2, HALF * 2, 0.18), toon('#c8963e'));
      body.castShadow = true;
      body.receiveShadow = true;
      const top = new THREE.Mesh(boxGeo(HALF * 2 - 0.3, 0.05, HALF * 2 - 0.3), new THREE.MeshToonMaterial({ map: topTex }));
      top.position.y = THICK + 0.01;
      top.receiveShadow = true;
      const edgeMat = toon('#2b1b5a').clone();
      edgeMat.userData = {};
      const edges = new THREE.Group();
      for (const [x, z, w, d] of [[0, HALF - 0.08, HALF * 2, 0.16], [0, -HALF + 0.08, HALF * 2, 0.16], [HALF - 0.08, 0, 0.16, HALF * 2], [-HALF + 0.08, 0, 0.16, HALF * 2]]) {
        const e = new THREE.Mesh(boxGeo(w, 0.1, d), edgeMat);
        e.position.set(x, THICK + 0.04, z);
        edges.add(e);
      }
      g.add(body, top, edges);
      view.scene.add(g);
      // Ball joint and support column (decorative, does not tilt).
      const joint = new THREE.Mesh(sphereGeo(0.7, 16, 12), toon('#5b5f8a'));
      joint.position.set(cx, -THICK * 2 - 0.4, cz);
      const column = new THREE.Mesh(cylGeo(0.35, 0.5, 14, 10), toon('#3b3561'));
      column.position.set(cx, -THICK * 2 - 7.6, cz);
      view.scene.add(joint, column);
      // Warning arrows (hidden until a tilt event).
      const arrows = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const a = arrowMesh('#ff2d55', 1.6);
        a.position.set((k - 1) * 2.2, THICK + 0.08, 0);
        arrows.add(a);
      }
      arrows.visible = false;
      g.add(arrows);
      return { g, body, edgeMat, arrows, joint, column, centre: [cx, cz] };
    });
    addAbyss(view, -9.5, { color: '#46406e', glow: '#ff9f6b' });
  },

  update(view, dt, { tNow }) {
    const gs = view.gs;
    view.plats.forEach((p, i) => {
      const c = view.world.colliders[i];
      // The collider centre sits THICK below the pivot; place the mesh at the collider.
      applyPose(p.g, c);
      p.g.visible = c.enabled || c.y > -30;
      const falling = gs.fall[i] >= 0;
      p.joint.visible = p.column.visible = !falling;
      const fallSoon = view.fallWarn && view.fallWarn[i] && tNow < (view.fallWarn[i] + 2.2) && !falling;
      if (fallSoon) {
        p.g.position.x += (Math.random() - 0.5) * 0.12;
        p.g.position.z += (Math.random() - 0.5) * 0.12;
      }
      const ev = gs.ev && gs.ev[0] === i ? gs.ev : null;
      const warn = ev && tNow < ev[3];
      p.edgeMat.color.set(fallSoon || warn ? (Math.sin(view.time * 24) > 0 ? '#ff2d55' : '#ffd23f') : '#2b1b5a');
      p.arrows.visible = !!ev && tNow < ev[4];
      if (ev) {
        // Arrow points to the side that will go down.
        const [, axis, sign] = ev;
        p.arrows.rotation.y = axis === 0 ? (sign > 0 ? 0 : Math.PI) : (sign > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    });
    spinAbyss(view, dt);
  },

  onEvent(view, e) {
    if (e.k === 'tiltWarn') view.pushFeed('Big tilt incoming — watch the arrows', '#ff8a3d');
    if (e.k === 'fallWarn') {
      (view.fallWarn ||= {})[e.i] = view.tNow();
      view.pushFeed('A platform is about to collapse!', '#ff2d55');
    }
    if (e.k === 'fall') view.shakeCam(0.4);
  },

  hud(view) {
    return {
      lines: [{ label: 'Still standing', value: `${view.aliveCount()} / ${view.n}` }],
      board: view.chars.map((c) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: c.flags & FLAG.ALIVE ? 'In' : 'Out', out: !(c.flags & FLAG.ALIVE) })),
    };
  },
};

void basic;
