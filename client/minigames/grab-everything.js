// Grab Everything — spinning gems on every level, lightning boosts and a live scoreboard.
import * as THREE from 'three';
import { toon, cachedGeo, basic } from '../game/materials.js';
import { GEM_TYPES } from '../../shared/games/grab-everything.js';
import { gemMesh, lollipop, glowSprite, textSprite } from './common.js';
import { colourAssist } from '../game/palette.js';

function boltGeo() {
  return cachedGeo('bolt', () => {
    const s = new THREE.Shape();
    s.moveTo(0.1, 0.6); s.lineTo(-0.35, -0.05); s.lineTo(-0.02, -0.05); s.lineTo(-0.15, -0.6);
    s.lineTo(0.35, 0.08); s.lineTo(0.02, 0.08); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  });
}

export default {
  theme: 'mint',
  sky: { cloudY: -12, spread: 80 },

  setup(view) {
    // Colour-accessible: each gem also shows its value (shared sprite materials per type).
    view.gemLabels = colourAssist() ? GEM_TYPES.map((t) => textSprite(String(t.v), { color: '#ffffff', size: 1.4, w: 128, h: 128 }).material) : null;
    view.gemMeshes = new Map();
    view.boostMeshes = view.layout.data.boostPoints.map((b) => {
      const g = new THREE.Group();
      const bolt = new THREE.Mesh(boltGeo(), toon('#ffd23f', { emissive: '#ff9f1c', emissiveIntensity: 0.5 }));
      bolt.position.z = -0.07;
      const ring = new THREE.Mesh(cachedGeo('boost-ring', () => new THREE.TorusGeometry(0.7, 0.06, 8, 24)), basic('#ffffff', { transparent: true, opacity: 0.7 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.6;
      g.add(bolt, ring);
      g.position.set(b.x, b.y, b.z);
      view.scene.add(g);
      return g;
    });
    const cols = ['#ff5da2', '#8b5cf6', '#ffd23f', '#1fc8c1'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const l = lollipop(cols[i % 4], 3 + (i % 3));
      l.position.set(Math.cos(a) * 22, -2, Math.sin(a) * 22);
      view.scene.add(l);
    }
  },

  update(view, dt) {
    const g = view.latestG();
    const live = new Set();
    for (const [id, x, y, z, type] of g.gems || []) {
      live.add(id);
      let m = view.gemMeshes.get(id);
      if (!m) {
        m = new THREE.Group();
        m.add(gemMesh(GEM_TYPES[type].color, 1));
        const glow = glowSprite(GEM_TYPES[type].color, 3.2);
        glow.scale.multiplyScalar(1);
        m.add(glow);
        m.userData.glow = glow;
        if (view.gemLabels) {
          const label = new THREE.Sprite(view.gemLabels[type]);
          label.scale.set(1.6, 1.6, 1);
          label.position.y = 2.2;
          m.add(label);
        }
        m.position.set(x, y, z);
        view.scene.add(m);
        view.gemMeshes.set(id, m);
        m.scale.multiplyScalar(0.01);
        m.userData.grow = 0;
      }
      m.userData.grow = Math.min(1, m.userData.grow + dt * 4);
      const s = [0.45, 0.55, 0.7][type] * m.userData.grow;
      m.scale.set(s, s, s);
      m.userData.glow.material.opacity = 0.55 + Math.sin(view.time * 5 + id) * 0.25;
      m.rotation.y += dt * 2;
      m.position.y = y + Math.sin(view.time * 3 + id) * 0.12;
    }
    for (const [id, m] of view.gemMeshes) if (!live.has(id)) { view.scene.remove(m); m.userData.glow.material.dispose(); view.gemMeshes.delete(id); }
    const ready = new Set(g.boosts || []);
    view.boostMeshes.forEach((b, i) => {
      b.visible = ready.has(i);
      b.rotation.y += dt * 2.5;
      b.position.y = view.layout.data.boostPoints[i].y + Math.sin(view.time * 4 + i) * 0.1;
    });
  },

  onEvent(view, e) {
    if (e.k === 'gem') {
      const m = view.gemMeshes.get(e.id);
      const who = view.chars[e.s];
      const p = m ? m.position : who.pos;
      view.fx.sparkle(p.x, p.y, p.z, GEM_TYPES[e.ty].color, 16, 4);
      view.fx.floatText(`+${e.v}`, p.x, p.y + 0.6, p.z, GEM_TYPES[e.ty].color, e.v >= 5 ? 1 : 0.7);
      if (m) { view.scene.remove(m); m.userData.glow.material.dispose(); view.gemMeshes.delete(e.id); }
    } else if (e.k === 'boost') {
      const who = view.chars[e.s];
      view.fx.sparkle(who.pos.x, who.pos.y + 1, who.pos.z, '#ffd23f', 20, 5);
      if (e.s === view.mySlot) view.showBanner('Speed boost!', 'info', 1);
    }
  },

  charState(view, ch, s) {
    if (Array.isArray(ch.extra) && ch.extra[1] && Math.random() < 0.3) view.fx.puff(ch.pos.x, ch.pos.y + 0.2, ch.pos.z, 1, '#ffd23f', 0.15, 0.5);
  },

  hud(view) {
    const me = view.chars[view.mySlot];
    const rows = view.chars.map((c) => ({ c, v: Array.isArray(c.extra) ? c.extra[0] : 0 })).sort((a, b) => b.v - a.v);
    return {
      lines: [
        me ? { label: 'Your score', value: Array.isArray(me.extra) ? me.extra[0] : 0 } : null,
        { label: 'Gems', value: '1 · 3 · 5' },
        me && Array.isArray(me.extra) && me.extra[1] ? { label: 'Speed boost', value: 'Active' } : null,
      ].filter(Boolean),
      board: rows.map(({ c, v }) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: v })),
      boardTitle: 'Scores',
    };
  },
};
