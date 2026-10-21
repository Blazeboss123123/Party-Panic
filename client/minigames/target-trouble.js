// Target Trouble — carnival launchers, moving targets, predicted paint balls and an aim arc.
import * as THREE from 'three';
import { toon, cylGeo, sphereGeo, cachedGeo, canvasTexture, basic, roundedBoxGeo } from '../game/materials.js';
import { TARGETS, targetPos, goldActive, launcherX, muzzle, SHOT, AIM, POINTS } from '../../shared/games/target-trouble.js';
import { BTN } from '../../shared/constants.js';
import { isDown } from '../game/input.js';
import { settings } from '../settings.js';
import { clamp } from '../../shared/math.js';
import { glowSprite, textSprite } from './common.js';

function bullseye() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const cols = ['#e8364f', '#ffffff'];
    for (let i = 6; i > 0; i--) {
      ctx.fillStyle = cols[i % 2];
      ctx.beginPath(); ctx.arc(w / 2, h / 2, (i / 6) * (w / 2), 0, Math.PI * 2); ctx.fill();
    }
  });
}

function makeTarget(kind) {
  const g = new THREE.Group();
  if (kind === 0) {
    const ring = new THREE.Mesh(cachedGeo('tt-ring', () => new THREE.TorusGeometry(0.75, 0.2, 10, 28)), toon('#ff5da2'));
    const inner = new THREE.Mesh(cachedGeo('tt-ring2', () => new THREE.TorusGeometry(0.75, 0.08, 8, 28)), toon('#ffffff'));
    inner.position.z = -0.12;
    g.add(ring, inner);
  } else if (kind === 1) {
    const disc = new THREE.Mesh(cachedGeo('tt-disc', () => { const c = new THREE.CylinderGeometry(1.05, 1.05, 0.14, 32); c.rotateX(Math.PI / 2); return c; }), [toon('#2b1b5a'), new THREE.MeshToonMaterial({ map: bullseye() }), new THREE.MeshToonMaterial({ map: bullseye() })]);
    const post = new THREE.Mesh(cylGeo(0.06, 0.06, 1.6, 6), toon('#2b1b5a'));
    post.position.y = -1.3;
    g.add(disc, post);
    g.userData.spin = disc;
  } else if (kind === 2) {
    const b = new THREE.Mesh(cachedGeo('tt-balloon', () => { const s = new THREE.SphereGeometry(0.8, 18, 14); s.scale(1, 1.2, 1); return s; }), toon('#4da3ff'));
    const str = new THREE.Mesh(cylGeo(0.015, 0.015, 1.8, 4), toon('#ffffff'));
    str.position.y = -1.9;
    g.add(b, str);
  } else {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.45 : 1.0;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 }), toon('#ffc93c', { emissive: '#ff9f1c', emissiveIntensity: 0.6 }));
    star.userData.ownGeometry = true;
    const glow = glowSprite('#ffd23f', 4);
    g.add(star, glow);
  }
  return g;
}

function launcher(color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(cylGeo(0.75, 0.9, 0.5, 20), toon('#2b1b5a'));
  base.position.y = 0.25;
  const turret = new THREE.Group();
  turret.position.y = 0.95;
  const body = new THREE.Mesh(sphereGeo(0.45, 16, 12), toon(color));
  const barrel = new THREE.Group();
  const tube = new THREE.Mesh(cylGeo(0.2, 0.26, 1.3, 14), toon(color));
  tube.rotation.x = Math.PI / 2;
  tube.position.z = 0.6;
  const rim = new THREE.Mesh(cachedGeo('tt-rim', () => new THREE.TorusGeometry(0.22, 0.06, 8, 16)), toon('#ffffff'));
  rim.position.z = 1.25;
  barrel.add(tube, rim);
  turret.add(body, barrel);
  g.add(base, turret);
  return { g, turret, barrel };
}

export default {
  theme: 'day',
  sky: { cloudY: -10, spread: 100 },

  setup(view) {
    const n = view.n;
    view.aim = { yaw: 0, pitch: 0.38 };
    view.localShots = [];
    view.lastFire = -9;
    view.launchers = view.chars.map((ch) => {
      const l = launcher(ch.color);
      l.g.position.set(launcherX(ch.slot, n), 0, 0.3);
      view.scene.add(l.g);
      return l;
    });
    view.targetMeshes = TARGETS.map((tg) => {
      const m = makeTarget(tg.kind);
      view.scene.add(m);
      return m;
    });
    view.shotMeshes = new Map();
    // Striped tent backdrop and a moat in front of the targets.
    const tent = new THREE.Mesh(new THREE.PlaneGeometry(70, 26), new THREE.MeshToonMaterial({ map: (() => { const t = canvasTexture(256, 64, (ctx, w, h) => { for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#e8364f' : '#ffffff'; ctx.fillRect((i * w) / 16, 0, w / 16 + 1, h); } }); t.wrapS = THREE.RepeatWrapping; return t; })(), side: THREE.DoubleSide }));
    tent.position.set(0, 8, 46);
    tent.rotation.y = Math.PI;
    tent.userData.ownGeometry = true;
    view.scene.add(tent);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(70, 44), toon('#4da3ff'));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -1.5, 25);
    water.userData.ownGeometry = true;
    view.scene.add(water);
    for (const [x, label, color] of [[-12, '1', '#ff5da2'], [-6, '2', '#ffffff'], [0, '3', '#4da3ff'], [6, '10', '#ffd23f']]) {
      void x; void label; void color;
    }
    // Aim arc (local player only)
    const pts = new Float32Array(48 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    view.arc = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, transparent: true, opacity: 0.85, depthWrite: false }));
    view.arc.frustumCulled = false;
    view.arc.visible = view.mySlot >= 0;
    view.scene.add(view.arc);
  },

  input(view, inp, dt) {
    const sens = settings.get().aimSensitivity || 1;
    const fine = isDown('sprint') ? 0.32 : 1;
    const rate = 1.25 * sens * fine;
    const h = inp.held;
    view.aim.yaw = clamp(view.aim.yaw + (h.left - h.right) * rate * dt, -AIM.yawMax, AIM.yawMax);
    view.aim.pitch = clamp(view.aim.pitch + (h.up - h.down) * rate * 0.8 * dt, AIM.pitchMin, AIM.pitchMax);
    inp.mx = 0;
    inp.mz = 0;
    inp.ay = view.aim.yaw;
    inp.ap = view.aim.pitch;
    const t = view.tNow();
    if ((inp.b & BTN.JUMP_P) && t >= 0 && t - view.lastFire >= SHOT.cooldown && view.mySlot >= 0) {
      view.lastFire = t;
      const m = muzzle(view.mySlot, view.n, view.aim.yaw, view.aim.pitch);
      const mesh = new THREE.Mesh(sphereGeo(SHOT.radius * 1.6, 10, 8), toon(view.chars[view.mySlot].color));
      mesh.position.set(m.x, m.y, m.z);
      view.scene.add(mesh);
      view.localShots.push({ ...m, mesh, age: 0 });
      view.fx.puff(m.x, m.y, m.z, 4, '#ffffff', 0.25, 2);
    }
  },

  camera(view, zoom) {
    if (view.mySlot < 0) {
      return { pos: new THREE.Vector3(0, 9 * zoom, -12 * zoom), look: new THREE.Vector3(0, 3, 22) };
    }
    const lx = launcherX(view.mySlot, view.n);
    const { yaw, pitch } = view.aim;
    const pos = new THREE.Vector3(lx - Math.sin(yaw) * 5.6 * zoom, 4.4 * zoom, 0.3 - Math.cos(yaw) * 5.6 * zoom);
    const look = new THREE.Vector3(lx + Math.sin(yaw) * 20, 2.5 + Math.tan(pitch * 0.55) * 12, 0.3 + Math.cos(yaw) * 20);
    return { pos, look };
  },

  update(view, dt, { tNow, tRem }) {
    const g = view.latestG();
    const dead = new Set((g.dead || []).filter(([, until]) => until < 0 || until > tNow).map(([id]) => id));
    const tmp = {};
    TARGETS.forEach((tg, i) => {
      const m = view.targetMeshes[i];
      const visible = !dead.has(tg.id) && (tg.kind !== 3 || goldActive(tNow));
      m.visible = visible;
      if (!visible) return;
      targetPos(tg, tNow, tmp);
      m.position.set(tmp.x, tmp.y, tmp.z);
      if (m.userData.spin) m.userData.spin.rotation.y = tmp.spin;
      if (tg.kind === 3) m.rotation.z = view.time * 2;
    });
    // Launchers aim
    view.chars.forEach((ch) => {
      const l = view.launchers[ch.slot];
      const a = ch.slot === view.mySlot ? [view.aim.yaw, view.aim.pitch] : (g.aim && g.aim[ch.slot]) || [0, 0.35];
      l.turret.rotation.y = a[0];
      l.barrel.rotation.x = -a[1];
    });
    // Remote shots
    const list = view.interpList('shots', tRem);
    for (const [id, s] of list) {
      if (s.raw[4] === view.mySlot) continue;
      let m = view.shotMeshes.get(id);
      if (!m) {
        m = new THREE.Mesh(sphereGeo(SHOT.radius * 1.6, 10, 8), toon(view.chars[s.raw[4]]?.color || '#ffffff'));
        view.scene.add(m);
        view.shotMeshes.set(id, m);
      }
      m.position.set(s.x, s.y, s.z);
    }
    for (const [id, m] of view.shotMeshes) if (!list.has(id)) { view.scene.remove(m); view.shotMeshes.delete(id); }
    // Local predicted shots
    for (let k = view.localShots.length - 1; k >= 0; k--) {
      const s = view.localShots[k];
      s.age += dt;
      s.vy -= SHOT.gravity * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.mesh.position.set(s.x, s.y, s.z);
      if (s.age > SHOT.life || s.y < -1.5 || s.dead) {
        view.scene.remove(s.mesh);
        view.localShots.splice(k, 1);
      }
    }
    // Aim arc
    if (view.arc.visible) {
      const m = muzzle(view.mySlot, view.n, view.aim.yaw, view.aim.pitch);
      const pos = view.arc.geometry.attributes.position;
      for (let i = 0; i < 48; i++) {
        const t = i * 0.045;
        pos.setXYZ(i, m.x + m.vx * t, m.y + m.vy * t - 0.5 * SHOT.gravity * t * t, m.z + m.vz * t);
      }
      pos.needsUpdate = true;
    }
  },

  onEvent(view, e) {
    if (e.k === 'hit') {
      const who = view.chars[e.s];
      view.fx.sparkle(e.x, e.y, e.z, who.color, 18, 6);
      view.fx.puff(e.x, e.y, e.z, 6, who.color, 0.35, 4);
      if (e.s === view.mySlot || e.pts >= 10) view.fx.floatText(`+${e.pts}`, e.x, e.y + 1.2, e.z, e.pts >= 10 ? '#ffd23f' : '#ffffff', e.pts >= 10 ? 1.4 : 1);
      if (e.s === view.mySlot) {
        // Retire the closest predicted shot so it does not fly through the broken target.
        let best = null, bd = 9;
        for (const s of view.localShots) { const d = Math.hypot(s.x - e.x, s.y - e.y, s.z - e.z); if (d < bd) { bd = d; best = s; } }
        if (best) best.dead = true;
        if (e.pts >= 10) view.showBanner('Golden hit!', 'win', 1.2);
      }
    } else if (e.k === 'block') {
      view.fx.puff(e.x, e.y, e.z, 5, '#ffffff', 0.3, 2);
      for (const s of view.localShots) if (Math.abs(s.z - e.z) < 1.5 && Math.abs(s.x - e.x) < 2) s.dead = true;
    } else if (e.k === 'fire' && e.s !== view.mySlot) {
      const lx = launcherX(e.s, view.n);
      view.fx.puff(lx, 1.6, 1.2, 1, '#ffffff', 0.15, 1);
    }
  },

  hud(view) {
    const me = view.chars[view.mySlot];
    const ex = (c) => (Array.isArray(c.extra) ? c.extra : [0, 0, 0]);
    const rows = view.chars.map((c) => ({ c, x: ex(c) })).sort((a, b) => b.x[0] - a.x[0]);
    const goldSoon = !goldActive(view.tNow()) ? null : 'The golden star is out!';
    return {
      lines: [
        me ? { label: 'Your score', value: ex(me)[0] } : null,
        me ? { label: 'Hits / shots', value: `${ex(me)[1]} / ${ex(me)[2]}` } : null,
        { label: 'Ring · disc · balloon · gold', value: '1 · 2 · 3 · 10' },
        goldSoon ? { label: 'Gold', value: 'Now!' } : null,
      ].filter(Boolean),
      board: rows.map(({ c, x }) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: x[0] })),
      boardTitle: 'Scores',
    };
  },
};

void roundedBoxGeo; void basic; void POINTS;
