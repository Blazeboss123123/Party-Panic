// The Last Platform — hover platforms with ghost previews of where they will slide, red
// warnings on doomed platforms and green outlines where new ones will rise.
import * as THREE from 'three';
import { toon, roundedBoxGeo, cachedGeo, basic, boxGeo } from '../game/materials.js';
import { COUNT, PHALF, slotPos } from '../../shared/games/last-platform.js';
import { arrowMesh, addAbyss, spinAbyss, glowSprite } from './common.js';
import { FLAG } from '../../shared/constants.js';
import { cue, colourAssist } from '../game/palette.js';
import { textSprite } from './common.js';

function ghost(color) {
  const g = new THREE.Group();
  const fill = new THREE.Mesh(boxGeo(PHALF * 2, 0.6, PHALF * 2), basic(color, { transparent: true, opacity: 0.18 }));
  fill.position.y = -0.3;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(PHALF * 2, 0.6, PHALF * 2)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  edges.position.y = -0.3;
  g.add(fill, edges);
  return g;
}

export default {
  theme: 'night',
  sky: { cloudY: -14, spread: 60 },

  setup(view) {
    view.plats = [];
    for (let pid = 0; pid < COUNT; pid++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(roundedBoxGeo(PHALF * 2, 0.6, PHALF * 2, 0.14), toon('#8b5cf6'));
      body.position.y = -0.3;
      body.castShadow = true;
      body.receiveShadow = true;
      const topMat = toon('#d9c8ff').clone();
      const top = new THREE.Mesh(boxGeo(PHALF * 2 - 0.25, 0.04, PHALF * 2 - 0.25), topMat);
      top.position.y = 0.01;
      top.receiveShadow = true;
      const thruster = new THREE.Mesh(cachedGeo('lp-thruster', () => new THREE.ConeGeometry(0.7, 1.2, 12)), toon('#2b1b5a'));
      thruster.rotation.x = Math.PI;
      thruster.position.y = -1.2;
      const flame = glowSprite('#7ef0c3', 2.2);
      flame.position.y = -1.9;
      const doomArrow = arrowMesh(cue('danger'), 2.4);
      doomArrow.rotation.x = Math.PI / 2;
      doomArrow.rotation.z = Math.PI;
      doomArrow.position.y = 3.2;
      doomArrow.material = doomArrow.material.clone();
      doomArrow.visible = false;
      g.add(body, top, thruster, flame, doomArrow);
      // Colour-accessible: a cross over doomed platforms as well as the colour change.
      const doomMark = colourAssist() ? textSprite('✕', { color: cue('danger'), size: 1.6, w: 128, h: 128 }) : null;
      if (doomMark) { doomMark.position.y = 1.2; doomMark.visible = false; g.add(doomMark); }
      view.scene.add(g);
      // Ghost of where this platform will be after its slide, and a slide arrow.
      const gh = ghost('#ffffff');
      gh.visible = false;
      view.scene.add(gh);
      const slideArrow = arrowMesh('#ffffff', 1.6);
      slideArrow.visible = false;
      view.scene.add(slideArrow);
      view.plats.push({ g, topMat, doomArrow, doomMark, gh, slideArrow, flame });
    }
    view.riseGhosts = [];
    for (let k = 0; k < 4; k++) {
      const gh = ghost(cue('good'));
      if (colourAssist()) { const plus = textSprite('+', { color: cue('good'), size: 1.8, w: 128, h: 128 }); plus.position.y = 1; gh.add(plus); }
      gh.visible = false;
      view.scene.add(gh);
      view.riseGhosts.push(gh);
    }
    addAbyss(view, -11.5, { color: '#2b1b5a', glow: '#8b5cf6' });
  },

  update(view, dt, { tNow }) {
    const gs = view.gs;
    const cyc = gs.cyc;
    const warning = cyc && tNow < cyc.tS;
    view.plats.forEach((p, pid) => {
      const c = view.world.colliders[pid];
      const active = gs.slot[pid] >= 0 || (cyc && cyc.rs.some((r) => r[0] === pid));
      p.g.visible = active && c.y > -30;
      p.g.position.set(c.x, c.y + 0.3, c.z);
      p.g.position.y += Math.sin(view.time * 2 + pid) * 0.02;
      const doomed = cyc && cyc.dm.includes(pid) && tNow < cyc.tD + 1.6;
      const blink = Math.sin(view.time * (warning ? 10 : 22)) > 0;
      p.topMat.color.set(doomed ? (blink ? cue('danger') : cue('dangerSoft')) : '#d9c8ff');
      p.doomArrow.visible = !!doomed;
      if (p.doomMark) p.doomMark.visible = !!doomed;
      p.doomArrow.position.y = 3.2 + Math.sin(view.time * 6) * 0.25;
      p.flame.visible = !(doomed && tNow > cyc.tD);
      const mv = cyc && cyc.mv.find((m) => m[0] === pid);
      const showMove = mv && tNow < cyc.tS + 1.2;
      p.gh.visible = !!showMove;
      p.slideArrow.visible = !!showMove && tNow < cyc.tS;
      if (showMove) {
        const to = slotPos(mv[1]);
        const from = slotPos(gs.slot[pid]);
        p.gh.position.set(to.x, 0.02, to.z);
        p.slideArrow.position.set((from.x + to.x) / 2, 0.25, (from.z + to.z) / 2);
        p.slideArrow.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      }
    });
    view.riseGhosts.forEach((gh, k) => {
      const r = cyc && cyc.rs[k];
      gh.visible = !!r && tNow < cyc.tD;
      if (r) {
        const s = slotPos(r[1]);
        gh.position.set(s.x, 0.02, s.z);
      }
    });
    spinAbyss(view, dt);
  },

  onEvent(view, e) {
    if (e.k === 'cycle') view.pushFeed(`Shuffle ${e.c}: ${e.warn.toFixed(1)}s to choose`, '#c9d3ff');
  },

  hud(view) {
    const gs = view.gs;
    const cyc = gs.cyc;
    const t = view.tNow();
    const standing = gs.slot.filter((s) => s >= 0).length;
    let prompt = null;
    if (cyc && t < cyc.tS) prompt = { symbol: Math.ceil(cyc.tS - t).toString(), label: 'Pick a safe platform', color: '#c9d3ff' };
    return {
      lines: [
        { label: 'Still standing', value: `${view.aliveCount()} / ${view.n}` },
        { label: 'Platforms left', value: standing },
      ],
      prompt,
      board: view.chars.map((c) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: c.flags & FLAG.ALIVE ? 'In' : 'Out', out: !(c.flags & FLAG.ALIVE) })),
    };
  },
};
