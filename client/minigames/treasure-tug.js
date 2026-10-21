// Treasure Tug — a treasure chest on a rail, team bases, ropes to the pullers and arrow prompts.
import * as THREE from 'three';
import { toon, cylGeo, roundedBoxGeo, boxGeo, basic, cachedGeo, sphereGeo } from '../game/materials.js';
import { RAIL, ZONE, teamDir } from '../../shared/games/treasure-tug.js';
import { TEAMS } from '../../shared/cosmetics.js';
import { ringMarker, textSprite, glowSprite } from './common.js';
import { settings, keyLabel } from '../settings.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { colourAssist } from '../game/palette.js';

function dashedRing(r0, r1, segments) {
  const parts = [];
  for (let i = 0; i < segments; i++) {
    const g = new THREE.RingGeometry(r0, r1, 6, 1, (i / segments) * Math.PI * 2, (Math.PI * 2) / segments * 0.6);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

const ARROWS = ['↑', '→', '↓', '←'];
const ACTIONS = ['up', 'right', 'down', 'left'];
const up = new THREE.Vector3(0, 1, 0);

function chestMesh() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(roundedBoxGeo(1.6, 0.8, 1.3, 0.08), toon('#a86b4c'));
  base.position.y = 0.4;
  const lid = new THREE.Mesh(cachedGeo('chest-lid', () => { const c = new THREE.CylinderGeometry(0.65, 0.65, 1.6, 20, 1, false, 0, Math.PI); c.rotateZ(Math.PI / 2); return c; }), toon('#c08457'));
  lid.position.y = 0.8;
  lid.rotation.x = -Math.PI / 2;
  const band1 = new THREE.Mesh(boxGeo(0.14, 0.86, 1.34), toon('#ffc93c'));
  band1.position.set(-0.5, 0.42, 0);
  const band2 = band1.clone();
  band2.position.x = 0.5;
  const lock = new THREE.Mesh(boxGeo(0.25, 0.3, 0.1), toon('#ffc93c'));
  lock.position.set(0, 0.7, 0.68);
  const glow = glowSprite('#ffd23f', 3);
  glow.position.y = 1.4;
  for (const m of [base, lid, band1, band2]) m.castShadow = true;
  g.add(base, lid, band1, band2, lock, glow);
  return g;
}

function ropeSeg() {
  const m = new THREE.Mesh(cachedGeo('rope', () => { const c = new THREE.CylinderGeometry(0.06, 0.06, 1, 6); c.translate(0, 0.5, 0); return c; }), toon('#d9b26f'));
  m.castShadow = true;
  return m;
}

export default {
  theme: 'mint',
  sky: { cloudY: -12, spread: 80 },

  setup(view) {
    view.chest = chestMesh();
    view.scene.add(view.chest);
    view.chestX = 0;
    // Rail with sleepers
    const rail = new THREE.Mesh(boxGeo(RAIL * 2 + 1.6, 0.06, 0.18), toon('#9aa3b8'));
    rail.position.set(0, 0.03, 0.45);
    const rail2 = rail.clone();
    rail2.position.z = -0.45;
    view.scene.add(rail, rail2);
    for (let x = -RAIL; x <= RAIL; x += 1.5) {
      const s = new THREE.Mesh(boxGeo(0.3, 0.05, 1.3), toon('#a86b4c'));
      s.position.set(x, 0.02, 0);
      view.scene.add(s);
    }
    // Bases, goal lines and rope zones
    for (const team of [0, 1]) {
      const d = teamDir(team);
      const col = TEAMS[team].hex;
      const goal = new THREE.Mesh(boxGeo(0.4, 0.04, 7), basic(col));
      goal.position.set(d * (RAIL + 0.6), 0.03, 0);
      view.scene.add(goal);
      const zone = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.x1 - ZONE.x0, ZONE.hz * 2), basic(col, { transparent: true, opacity: 0.22 }));
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(d * (ZONE.x0 + ZONE.x1) / 2, 0.02, 0);
      zone.userData.ownGeometry = true;
      view.scene.add(zone);
      const pole = new THREE.Mesh(cylGeo(0.12, 0.12, 6, 8), toon('#ffffff'));
      pole.position.set(d * 19.4, 3, -5);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshToonMaterial({ color: col, side: THREE.DoubleSide }));
      flag.position.set(d * 19.4 - d * 1.2, 5.2, -5);
      flag.userData.ownGeometry = true;
      view.scene.add(pole, flag);
      (view.flags ||= []).push(flag);
      for (let k = 0; k < 9; k++) {
        const coin = new THREE.Mesh(cylGeo(0.35, 0.35, 0.12, 14), toon('#ffc93c', { emissive: '#7a5200', emissiveIntensity: 0.3 }));
        coin.position.set(d * (18.6 + (k % 3) * 0.7), 0.06 + Math.floor(k / 3) * 0.13, 2 + (k % 2) * 0.5);
        view.scene.add(coin);
      }
      const label = textSprite(TEAMS[team].short, { color: col, size: 1.2, w: 640, h: 128 });
      label.position.set(d * 18.6, 3.2, 3.5);
      view.scene.add(label);
      const anchor = new THREE.Mesh(cylGeo(0.35, 0.45, 1.6, 10), toon('#5b5f8a'));
      anchor.position.set(d * 16.4, 0.8, 0);
      view.scene.add(anchor);
    }
    view.teamRings = view.chars.map((ch) => {
      const team = ch.team >= 0 ? ch.team : ch.slot % 2;
      const r = ringMarker(TEAMS[team].hex, 0.8);
      // Colour-accessible: the second team's rings are dashed, so teams differ by shape too.
      if (team === 1 && colourAssist()) r.geometry = cachedGeo('ring-dashed', () => dashedRing(0.8 * 0.72, 0.8, 10));
      view.scene.add(r);
      return r;
    });
    view.ropes = [[], []];
    view.pullAnim = view.chars.map(() => 0);
  },

  update(view, dt) {
    const target = Math.max(-1, Math.min(1, view.gs.pos || 0)) * RAIL;
    view.chestX += (target - view.chestX) * Math.min(1, dt * 10);
    view.chest.position.set(view.chestX, 0, 0);
    view.chest.rotation.y = Math.sin(view.time * 3) * 0.03;
    view.chars.forEach((ch, i) => {
      view.teamRings[i].position.set(ch.pos.x, ch.pos.y + 0.04, ch.pos.z);
      view.teamRings[i].visible = ch.c.root.visible;
      view.pullAnim[i] = Math.max(0, view.pullAnim[i] - dt * 4);
    });
    (view.flags || []).forEach((f, i) => { f.rotation.y = Math.sin(view.time * 2 + i) * 0.2; });
    // Ropes: chest -> each holder (sorted outwards) -> anchor.
    for (const team of [0, 1]) {
      const d = teamDir(team);
      const holders = view.chars.filter((ch) => Array.isArray(ch.extra) && ch.extra[0] === team && ch.extra[1] === 1)
        .sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x));
      const pts = [new THREE.Vector3(view.chestX + d * 0.8, 0.6, 0)];
      for (const h of holders) pts.push(new THREE.Vector3(h.pos.x - d * 0.1, h.pos.y + 0.85, h.pos.z * 0.6));
      pts.push(new THREE.Vector3(d * 16.4, 1.3, 0));
      const segs = view.ropes[team];
      while (segs.length < pts.length - 1) { const s = ropeSeg(); view.scene.add(s); segs.push(s); }
      segs.forEach((s, k) => {
        s.visible = k < pts.length - 1 && holders.length > 0;
        if (!s.visible) return;
        const a = pts[k], b = pts[k + 1];
        const dir = b.clone().sub(a);
        s.position.copy(a);
        s.scale.set(1, dir.length(), 1);
        s.quaternion.setFromUnitVectors(up, dir.normalize());
      });
    }
  },

  charState(view, ch, s) {
    if (Array.isArray(ch.extra) && ch.extra[1] === 1) {
      s.carrying = false;
      s.mood = null;
      s.speed = 0;
      // Lean back while pulling.
      ch.c.pivot.rotation.x = -0.35 - view.pullAnim[ch.slot] * 0.3;
    }
  },

  onEvent(view, e) {
    const who = e.s !== undefined ? view.chars[e.s] : null;
    if (e.k === 'pull' && who) {
      view.pullAnim[e.s] = 1;
      if (e.s === view.mySlot) view.fx.floatText(e.sy ? 'Sync!' : 'Pull!', who.pos.x, who.pos.y + 2.4, who.pos.z, e.sy ? '#ffd23f' : '#ffffff', 0.7);
      if (e.sy) view.fx.sparkle(who.pos.x, who.pos.y + 1.2, who.pos.z, '#ffd23f', 6, 2);
    } else if (e.k === 'fumble' && who && e.s === view.mySlot) {
      view.fx.floatText('Fumble!', who.pos.x, who.pos.y + 2.4, who.pos.z, '#ff5da2', 0.7);
    } else if (e.k === 'interrupt' && who) {
      const t = view.chars[e.t];
      view.fx.puff(t.pos.x, t.pos.y + 1, t.pos.z, 8, '#ffffff', 0.35, 3);
      view.pushFeed(`${who.name} knocked ${t.name} off the rope`, who.color);
      if (e.t === view.mySlot) view.shakeCam(0.3);
    } else if (e.k === 'treasure') {
      view.fx.burstConfetti(view.chestX, 2, 0, 120, [TEAMS[e.team].hex, '#ffd23f', '#ffffff']);
      view.showBanner(`${TEAMS[e.team].name} scores!`, 'win', 2.5);
    } else if (e.k === 'full' && e.s === view.mySlot) {
      view.pushFeed('Every rope slot is taken', '#ffffff');
    }
  },

  hud(view) {
    const me = view.chars[view.mySlot];
    const ex = me && Array.isArray(me.extra) ? me.extra : null;
    const myTeam = ex ? ex[0] : -1;
    let prompt = null;
    const b = settings.get().bindings;
    if (ex && ex[1] === 1) {
      prompt = ex[2] >= 0
        ? { symbol: ARROWS[ex[2]], label: `Press ${keyLabel(b[ACTIONS[ex[2]]]?.[0])} to pull`, color: TEAMS[myTeam].hex }
        : { symbol: '…', label: 'Fumbled! Steady…', color: '#c9d3ff' };
    } else if (ex) {
      prompt = { symbol: keyLabel(b.act?.[0]), label: 'In your zone: grab the rope. Near a rival: knock them off.', color: '#ffffff' };
    }
    const pos = view.gs.pos || 0;
    const rows = view.chars.map((c) => ({ c, x: Array.isArray(c.extra) ? c.extra : [c.slot % 2, 0, -2, 0] }));
    return {
      lines: [
        myTeam >= 0 ? { label: 'Your team', value: TEAMS[myTeam].short } : null,
        ex ? { label: 'Your pulls', value: ex[3] } : null,
      ].filter(Boolean),
      prompt,
      bar: { label: 'Chest position', left: TEAMS[0].hex, right: TEAMS[1].hex, leftLabel: TEAMS[0].name, rightLabel: TEAMS[1].name, value: pos },
      board: rows.sort((a, b2) => a.x[0] - b2.x[0] || b2.x[3] - a.x[3]).map(({ c, x }) => ({ seat: c.seat, name: c.name, color: TEAMS[x[0]].hex, me: c.slot === view.mySlot, value: `${x[1] ? 'Rope · ' : ''}${x[3]}` })),
      boardTitle: 'Pulls by team',
    };
  },
};

void sphereGeo;
