// Final results: a podium with the top three (ties share a block), everyone else cheering
// from the floor, confetti cannons and a spotlight sweep.
import * as THREE from 'three';
import { BaseView } from './baseView.js';
import { Character } from '../characters/character.js';
import { toon, roundedBoxGeo, canvasTexture, cylGeo, cachedGeo } from '../game/materials.js';
import { settings } from '../settings.js';

function placeTex(label, color) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b1b5a';
    ctx.font = '400 150px "Bagel Fat One", Gabarito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2 + 10);
  });
}

export class PodiumView extends BaseView {
  constructor(engine) {
    super(engine, 'stage', { cloudY: -10 });
    this.setShadowBounds(12);
    const floor = new THREE.Mesh(cylGeo(16, 16.5, 1, 64), toon('#8b5cf6'));
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const blocks = [
      { place: 1, x: 0, h: 3, color: '#ffd23f' },
      { place: 2, x: -3.2, h: 2.1, color: '#c9d3ff' },
      { place: 3, x: 3.2, h: 1.4, color: '#ff9f6b' },
    ];
    this.blocks = {};
    for (const b of blocks) {
      const mats = [toon(b.color), toon(b.color), toon(b.color), toon(b.color), new THREE.MeshToonMaterial({ map: placeTex(String(b.place), b.color) }), toon(b.color)];
      const m = new THREE.Mesh(roundedBoxGeo(3, b.h, 2.6, 0.18), toon(b.color));
      m.position.set(b.x, b.h / 2, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      const face = new THREE.Mesh(cachedGeo('pod-face', () => new THREE.PlaneGeometry(1.3, 1.3)), mats[4]);
      face.position.set(b.x, Math.min(b.h - 0.75, 1.1), 1.32);
      this.scene.add(face);
      this.blocks[b.place] = b;
    }
    this.chars = [];
    this.camera.position.set(0, 5.5, 13);
    this.look = new THREE.Vector3(0, 2.6, 0);
    this.camera.lookAt(this.look);
    this.cannonT = 0.5;
  }

  setStandings(standings) {
    for (const c of this.chars) { this.scene.remove(c.root); c.dispose(); }
    this.chars = [];
    const byPlace = new Map();
    for (const s of standings) {
      if (!byPlace.has(s.place)) byPlace.set(s.place, []);
      byPlace.get(s.place).push(s);
    }
    const others = [];
    for (const s of standings) {
      const b = this.blocks[s.place];
      const group = byPlace.get(s.place);
      const c = new Character(s.cosmetic);
      c.setNameTag(s.name, s.seat);
      if (b && group.length <= 3) {
        const k = group.indexOf(s);
        const spread = group.length > 1 ? (k - (group.length - 1) / 2) * 0.95 : 0;
        c.root.position.set(b.x + spread, b.h, 0);
        c.mood = s.place === 1 ? 'celebrate' : 'happy';
      } else {
        others.push(c);
        c.mood = 'happy';
      }
      this.scene.add(c.root);
      this.chars.push(c);
    }
    others.forEach((c, i) => {
      const x = (i - (others.length - 1) / 2) * 1.5;
      c.root.position.set(x, 0, 3.4);
      c.root.scale.setScalar(0.85);
    });
  }

  update(dt) {
    super.update(dt);
    for (const c of this.chars) c.update(dt, { speed: 0, grounded: true, mood: c.mood });
    const reduced = settings.get().reducedMotion;
    this.cannonT -= dt;
    if (this.cannonT <= 0) {
      this.cannonT = reduced ? 4 : 1.4;
      for (const s of [-1, 1]) this.fx.burstConfetti(s * 6, 0.5, -1, 50, undefined, 9);
    }
    const sway = reduced ? 0 : Math.sin(this.time * 0.3) * 1.5;
    this.camera.position.set(sway, 5.5, 13);
    this.camera.lookAt(this.look);
  }

  dispose() {
    super.dispose();
    for (const c of this.chars) c.dispose();
  }
}
