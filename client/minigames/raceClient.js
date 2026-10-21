// Client helpers shared by the course races.
import * as THREE from 'three';
import { toon, cylGeo, cachedGeo, canvasTexture } from '../game/materials.js';
import { FLAG } from '../../shared/constants.js';
import { textSprite } from './common.js';
import { ordinal } from '../game/roundView.js';

export function checkpointFlags(view, color = '#ff5da2') {
  const cps = view.layout.course.checkpoints;
  for (let i = 1; i < cps.length; i++) {
    const cp = cps[i];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(cylGeo(0.07, 0.07, 3, 8), toon('#ffffff'));
      pole.position.y = 1.5;
      const flag = new THREE.Mesh(cachedGeo('cp-flag', () => { const gg = new THREE.PlaneGeometry(1.1, 0.7); gg.translate(0.55, 0, 0); return gg; }), new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide }));
      flag.position.y = 2.6;
      flag.rotation.y = s > 0 ? Math.PI : 0;
      g.add(pole, flag);
      g.position.set(cp.x + s * (cp.flagX ?? 4.8), cp.y, cp.z);
      g.userData.flag = flag;
      view.scene.add(g);
      (view.cpFlags ||= []).push(g);
    }
  }
}

export function finishBanner(view, label = 'Finish') {
  const f = view.layout.course.finish;
  const sp = textSprite(label, { color: '#ffd23f', size: 1.4 });
  sp.position.set(0, f.y + 5.6, f.z - f.hz + 0.1);
  view.scene.add(sp);
}

export function waveFlags(view, dt) {
  if (!view.cpFlags) return;
  const t = view.time;
  for (const g of view.cpFlags) g.userData.flag.rotation.x = Math.sin(t * 5 + g.position.z) * 0.15;
}

export function raceEvent(view, e) {
  if (e.k === 'cp') {
    if (e.s === view.mySlot) {
      view.showBanner('Checkpoint!', 'info', 1.2);
      const me = view.chars[e.s];
      view.fx.burstConfetti(me.pos.x, me.pos.y + 1.5, me.pos.z, 25);
    }
    return true;
  }
  if (e.k === 'cutoff') {
    const left = Math.max(0, Math.round(e.t - view.tNow()));
    view.pushFeed(`First finisher! ${left} seconds left for everyone else`, '#ffd23f');
    return true;
  }
  return false;
}

// Race order: finished players by finish order, then by checkpoint and distance.
export function raceBoard(view, valueOf) {
  const finishOrder = view.finishOrder || (view.finishOrder = []);
  const rows = view.chars.map((ch) => ({ ch, cp: Array.isArray(ch.extra) ? ch.extra[0] : 0 }));
  rows.sort((a, b) => {
    const fa = finishOrder.indexOf(a.ch.slot), fb = finishOrder.indexOf(b.ch.slot);
    if (fa >= 0 || fb >= 0) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb);
    return b.cp - a.cp || b.ch.pos.z - a.ch.pos.z;
  });
  return rows.map((r, i) => ({
    seat: r.ch.seat, name: r.ch.name, color: r.ch.color, me: r.ch.slot === view.mySlot,
    value: finishOrder.includes(r.ch.slot) ? `${ordinal(finishOrder.indexOf(r.ch.slot) + 1)} ✓` : valueOf ? valueOf(r, i) : ordinal(i + 1),
    out: !(r.ch.flags & FLAG.ALIVE),
  }));
}

export function trackFinish(view, e) {
  if (e.k === 'finish') (view.finishOrder ||= []).push(e.s);
}

export function myCheckpointLine(view) {
  const me = view.chars[view.mySlot];
  if (!me) return null;
  const n = view.layout.course.checkpoints.length - 1;
  const cp = Array.isArray(me.extra) ? me.extra[0] : 0;
  return { label: 'Checkpoint', value: `${cp} / ${n}` };
}

export { canvasTexture };
