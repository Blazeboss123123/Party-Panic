// Don't Drop It — layered cakes in each player's colour and personal delivery pads.
import * as THREE from 'three';
import { toon, cylGeo, sphereGeo, cachedGeo, basic } from '../game/materials.js';
import { padX } from '../../shared/games/dont-drop-it.js';
import { checkpointFlags, waveFlags, raceEvent, raceBoard, trackFinish, myCheckpointLine } from './raceClient.js';
import { textSprite, glowSprite, lollipop } from './common.js';
import { FLAG } from '../../shared/constants.js';

function cake(color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(cylGeo(0.42, 0.44, 0.32, 24), toon('#fff3d6'));
  base.position.y = -0.12;
  const frost = new THREE.Mesh(cylGeo(0.45, 0.45, 0.1, 24), toon(color));
  frost.position.y = 0.06;
  const top = new THREE.Mesh(cylGeo(0.3, 0.32, 0.24, 20), toon('#fff3d6'));
  top.position.y = 0.22;
  const frost2 = new THREE.Mesh(cylGeo(0.33, 0.33, 0.08, 20), toon(color));
  frost2.position.y = 0.36;
  const cherry = new THREE.Mesh(sphereGeo(0.09, 10, 8), toon('#e8364f'));
  cherry.position.y = 0.48;
  for (const m of [base, frost, top, frost2, cherry]) m.castShadow = true;
  g.add(base, frost, top, frost2, cherry);
  return g;
}

export default {
  theme: 'candy',
  sky: { cloudY: -14, spread: 100 },

  setup(view) {
    view.cakes = view.chars.map((ch) => {
      const m = cake(ch.color);
      view.scene.add(m);
      return m;
    });
    // Delivery pads in each player's colour with their seat number.
    view.padRings = [];
    view.chars.forEach((ch) => {
      const pd = view.layout.data.pads[ch.slot];
      const disc = new THREE.Mesh(cylGeo(pd.r, pd.r, 0.4, 32), toon(ch.color));
      disc.position.set(pd.x, pd.y - 0.2, pd.z);
      disc.receiveShadow = true;
      view.scene.add(disc);
      const ring = new THREE.Mesh(cachedGeo('dd-ring', () => new THREE.TorusGeometry(0.9, 0.08, 8, 32)), toon(ch.color, { emissive: ch.color, emissiveIntensity: 0.4 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pd.x, 2.6, pd.z);
      view.scene.add(ring);
      view.padRings.push(ring);
      const label = textSprite(String(ch.seat), { color: ch.color, size: 0.9, w: 128, h: 128 });
      label.position.set(pd.x, 3.6, pd.z);
      view.scene.add(label);
      if (ch.slot === view.mySlot) {
        const glow = glowSprite(ch.color, 4);
        glow.position.set(pd.x, 1, pd.z);
        view.scene.add(glow);
        const beam = new THREE.Mesh(cylGeo(0.12, 0.12, 30, 8), basic(ch.color, { transparent: true, opacity: 0.35 }));
        beam.position.set(pd.x, 15, pd.z);
        view.scene.add(beam);
      }
    });
    checkpointFlags(view, '#8b5cf6');
    const cols = ['#ff5da2', '#1fc8c1', '#8b5cf6', '#ffd23f'];
    for (let i = 0; i < 12; i++) {
      const l = lollipop(cols[i % 4], 3 + (i % 3) * 1.5);
      l.position.set((i % 2 ? 1 : -1) * (14 + (i % 3) * 3), -4, i * 8);
      view.scene.add(l);
    }
  },

  update(view, dt, { tRem }) {
    const list = view.interpList('cakes', tRem);
    for (const ch of view.chars) {
      const m = view.cakes[ch.slot];
      const e = list.get(ch.slot);
      if (!e) continue;
      const state = e.raw[4];
      if (state >= 1 && !(ch.flags & FLAG.HIDDEN)) {
        // Carried (or delivered): sits in the carrier's hands, wobbling.
        m.position.set(ch.pos.x, ch.pos.y + 1.72 + Math.sin(view.time * 9) * 0.03, ch.pos.z);
        m.rotation.set(Math.sin(view.time * 6) * 0.08, ch.yaw, Math.cos(view.time * 7) * 0.08);
      } else {
        m.position.set(e.x, e.y - 0.2, e.z);
        m.rotation.set(e.raw[5] * 0.2, 0, e.raw[6] * 0.2);
      }
    }
    view.padRings.forEach((r, i) => { r.position.y = 2.6 + Math.sin(view.time * 2 + i) * 0.15; r.rotation.z += dt; });
    waveFlags(view, dt);
  },

  charState(view, ch, s) {
    s.carrying = !!(ch.flags & FLAG.CARRYING);
  },

  onEvent(view, e) {
    trackFinish(view, e);
    if (raceEvent(view, e)) return;
    const who = e.s !== undefined ? view.chars[e.s] : null;
    if (e.k === 'cakeDrop' && who) {
      if (e.r !== 'put') view.fx.puff(who.pos.x, who.pos.y + 1.8, who.pos.z, 8, '#fff3d6', 0.3, 3);
      if (e.s === view.mySlot && e.r !== 'put') view.showBanner('Dropped it!', 'out', 1.2);
    } else if (e.k === 'cakeGrab' && who && e.s === view.mySlot) {
      view.pushFeed('Got your cake — carry it to your pad', who.color);
    } else if (e.k === 'cakeHome' && who && e.s === view.mySlot) {
      view.showBanner('Cake back at your checkpoint', 'info', 1.4);
    } else if (e.k === 'bump' && e.t === view.mySlot) {
      view.shakeCam(0.3);
    }
  },

  hud(view) {
    const me = view.chars[view.mySlot];
    const carrying = me && Array.isArray(me.extra) && me.extra[1];
    return {
      lines: [
        myCheckpointLine(view),
        me ? { label: 'Your cake', value: me.flags & FLAG.FINISHED ? 'Delivered' : carrying ? 'In your hands' : 'On the ground' } : null,
      ].filter(Boolean),
      board: raceBoard(view, (r) => (Array.isArray(r.ch.extra) && r.ch.extra[1] ? 'Carrying' : 'No cake')),
      boardTitle: 'Deliveries',
    };
  },
};
