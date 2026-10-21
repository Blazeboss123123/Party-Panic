// Bomb Relay — cartoon bombs with burning fuses, holder rings and big explosions.
import * as THREE from 'three';
import { toon, cylGeo, sphereGeo, cachedGeo, basic } from '../game/materials.js';
import { ringMarker, glowSprite } from './common.js';
import { FLAG } from '../../shared/constants.js';
import { settings } from '../settings.js';
import { keyLabel } from '../settings.js';

function bombMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(sphereGeo(0.42, 20, 16), toon('#2b1b5a'));
  body.castShadow = true;
  const cap = new THREE.Mesh(cylGeo(0.13, 0.15, 0.14, 10), toon('#9aa3b8'));
  cap.position.y = 0.42;
  const fuse = new THREE.Mesh(cylGeo(0.035, 0.035, 1, 6), toon('#c08457'));
  fuse.geometry = cachedGeo('bomb-fuse', () => { const c = new THREE.CylinderGeometry(0.035, 0.035, 1, 6); c.translate(0, 0.5, 0); return c; });
  fuse.position.y = 0.48;
  fuse.rotation.z = -0.4;
  const spark = glowSprite('#ffb000', 0.9);
  const shine = new THREE.Mesh(sphereGeo(0.09, 8, 6), basic('#ffffff'));
  shine.position.set(-0.15, 0.18, 0.33);
  g.add(body, cap, fuse, spark, shine);
  g.userData = { body, fuse, spark };
  return g;
}

export default {
  theme: 'sunset',
  sky: { cloudY: -12, spread: 70 },

  setup(view) {
    view.bombMeshes = new Map();
    view.rings = view.chars.map(() => {
      const r = ringMarker('#ff2d55', 0.85);
      r.material = r.material.clone();
      r.visible = false;
      view.scene.add(r);
      return r;
    });
    view.flights = [];
  },

  update(view, dt, { tNow }) {
    const g = view.latestG();
    const bombs = g.bombs || [];
    const live = new Set();
    for (const [id, holder, det, gotAt] of bombs) {
      live.add(id);
      let m = view.bombMeshes.get(id);
      if (!m) { m = bombMesh(); view.scene.add(m); view.bombMeshes.set(id, m); }
      const h = view.chars[holder];
      let x = h.pos.x, y = h.pos.y + 2.05, z = h.pos.z;
      // Short throw animation after a pass.
      const fl = view.flights.find((f) => f.id === id);
      if (fl) {
        const k = Math.min(1, (view.localNow() - fl.at) / 0.22);
        const a = view.chars[fl.from].pos;
        x = a.x + (x - a.x) * k; z = a.z + (z - a.z) * k;
        y = a.y + 2.05 + (y - a.y - 2.05) * k + Math.sin(k * Math.PI) * 1.2;
        if (k >= 1) view.flights.splice(view.flights.indexOf(fl), 1);
      }
      m.position.set(x, y, z);
      const left = Math.max(0, det - tNow);
      const urgent = left < 3;
      const pulse = 1 + (urgent ? Math.abs(Math.sin(view.time * (8 + (3 - left) * 6))) * 0.25 : Math.sin(view.time * 4) * 0.04);
      m.scale.setScalar(pulse);
      m.userData.body.material = toon(urgent && Math.sin(view.time * 20) > 0 ? '#e8364f' : '#2b1b5a');
      const fuseLen = Math.max(0.08, Math.min(1, left / 12));
      m.userData.fuse.scale.y = fuseLen * 0.7;
      const tip = new THREE.Vector3(Math.sin(0.4) * fuseLen * 0.7, 0.48 + Math.cos(0.4) * fuseLen * 0.7, 0);
      m.userData.spark.position.copy(tip);
      m.userData.spark.scale.setScalar(0.7 + Math.random() * 0.6);
      if (Math.random() < (urgent ? 0.6 : 0.2) && !settings.get().reducedMotion) view.fx.sparkle(x + tip.x, y + tip.y, z, '#ffd23f', 1, 1.5);
    }
    for (const [id, m] of view.bombMeshes) if (!live.has(id)) { view.scene.remove(m); view.bombMeshes.delete(id); }
    const holders = new Set(bombs.map((b) => b[1]));
    view.chars.forEach((ch, i) => {
      const r = view.rings[i];
      r.visible = holders.has(i) && !(ch.flags & FLAG.HIDDEN);
      r.position.set(ch.pos.x, ch.pos.y + 0.05, ch.pos.z);
      r.material.opacity = 0.5 + Math.abs(Math.sin(view.time * 6)) * 0.5;
    });
  },

  charState(view, ch, s) {
    if (ch.flags & FLAG.SPECIAL) s.carrying = true;
  },

  onEvent(view, e) {
    if (e.k === 'pass') {
      const g = view.latestG();
      const b = (g.bombs || []).find((x) => x[1] === e.t);
      if (b) view.flights.push({ id: b[0], from: e.s, at: view.localNow() });
      const t = view.chars[e.t];
      view.fx.floatText('Pass!', t.pos.x, t.pos.y + 2.8, t.pos.z, '#ffd23f', 0.8);
      if (e.t === view.mySlot) view.showBanner('You have the bomb!', 'out', 1.2);
    } else if (e.k === 'boom') {
      view.fx.explosion(e.x, e.y + 1.2, e.z);
      view.shakeCam(0.9);
    } else if (e.k === 'bombs') {
      view.pushFeed(e.n > 1 ? `Round ${e.ph}: two bombs are live!` : `Round ${e.ph}: a bomb is live!`, '#ff8a3d');
    } else if (e.k === 'whiff' && e.s === view.mySlot) {
      view.pushFeed('Nobody in reach — get closer to pass', '#ffffff');
    }
  },

  hud(view) {
    const g = view.latestG();
    const bombs = g.bombs || [];
    const mine = bombs.find((b) => b[1] === view.mySlot);
    const t = view.tNow();
    const actKey = keyLabel(settings.get().bindings.act?.[0]);
    const prompt = mine ? { symbol: '!', label: `You have the bomb · press ${actKey} near someone`, color: '#ff5da2' } : null;
    const holders = new Set(bombs.map((b) => b[1]));
    return {
      lines: [
        { label: 'Still standing', value: `${view.aliveCount()} / ${view.n}` },
        { label: 'Bombs live', value: bombs.length },
        g.next >= 0 && !bombs.length ? { label: 'Next bomb in', value: `${Math.max(0, Math.ceil(g.next - t))}s` } : null,
      ].filter(Boolean),
      prompt,
      board: view.chars.map((c) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: !(c.flags & FLAG.ALIVE) ? 'Out' : holders.has(c.slot) ? 'Holding!' : 'Safe', out: !(c.flags & FLAG.ALIVE) })),
    };
  },
};
