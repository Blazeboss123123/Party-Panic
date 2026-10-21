// Main menu scene: a floating party island with the player's character and friends.
import * as THREE from 'three';
import { BaseView } from './baseView.js';
import { Character } from '../characters/character.js';
import { toon, sphereGeo, cylGeo, cachedGeo, roundedBoxGeo, stripeTexture } from '../game/materials.js';
import { defaultCosmetic } from '../../shared/cosmetics.js';
import { EMOTES } from '../../shared/constants.js';
import { settings } from '../settings.js';

export function buildIsland(radius = 9, top = '#8bdb3c', side = '#c08457') {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(cylGeo(radius, radius * 0.96, 1.2, 48), toon(top));
  grass.position.y = -0.6;
  grass.receiveShadow = true;
  g.add(grass);
  const dirt = new THREE.Mesh(cachedGeo(`island-cone${radius}`, () => new THREE.ConeGeometry(radius * 0.96, radius * 1.3, 40, 3)), toon(side));
  dirt.position.y = -1.2 - radius * 0.65;
  dirt.rotation.x = Math.PI;
  g.add(dirt);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39;
    const r = radius * (0.35 + (i % 4) * 0.15);
    const rock = new THREE.Mesh(cachedGeo('rock', () => new THREE.DodecahedronGeometry(0.8, 0)), toon('#9b7bd6'));
    rock.position.set(Math.cos(a) * r, -2 - (i % 3) * 1.4, Math.sin(a) * r);
    rock.scale.setScalar(0.6 + (i % 3) * 0.4);
    g.add(rock);
  }
  return g;
}

function balloon(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(cachedGeo('balloon', () => { const s = new THREE.SphereGeometry(0.6, 20, 16); s.scale(1, 1.18, 1); return s; }), toon(color));
  b.position.y = 2.4;
  const knot = new THREE.Mesh(cachedGeo('balloon-knot', () => new THREE.ConeGeometry(0.1, 0.16, 8)), toon(color));
  knot.position.y = 1.68;
  const string = new THREE.Mesh(cylGeo(0.012, 0.012, 1.7, 4), toon('#ffffff'));
  string.position.y = 0.85;
  g.add(b, knot, string);
  return g;
}

function giftBox(color, ribbon, s = 1) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(roundedBoxGeo(1.1 * s, 1 * s, 1.1 * s, 0.08), toon(color));
  box.position.y = 0.5 * s;
  box.castShadow = true;
  const r1 = new THREE.Mesh(roundedBoxGeo(1.14 * s, 1.02 * s, 0.22 * s, 0.03), toon(ribbon));
  r1.position.y = 0.5 * s;
  const r2 = r1.clone();
  r2.rotation.y = Math.PI / 2;
  const bow = new THREE.Mesh(cachedGeo('bow', () => new THREE.TorusKnotGeometry(0.18, 0.06, 40, 8, 2, 3)), toon(ribbon));
  bow.position.y = 1.08 * s;
  bow.scale.setScalar(s);
  g.add(box, r1, r2, bow);
  return g;
}

export class MenuView extends BaseView {
  constructor(engine) {
    super(engine, 'sunset', { cloudY: -6, spread: 70, count: 18 });
    this.setShadowBounds(12);
    const island = buildIsland(9.5);
    this.scene.add(island);

    // Ring of bunting flags
    const flagColors = ['#ff5da2', '#ffd23f', '#1fc8c1', '#8b5cf6', '#ff8a3d'];
    const poleMat = toon('#fff3d6');
    for (let i = 0; i < 2; i++) {
      const pole = new THREE.Mesh(cylGeo(0.08, 0.1, 4.5, 8), poleMat);
      pole.position.set(i ? 6.5 : -6.5, 2.25, -5.5);
      pole.castShadow = true;
      this.scene.add(pole);
    }
    for (let i = 0; i < 13; i++) {
      const t = i / 12;
      const x = -6.5 + t * 13;
      const y = 4.3 - Math.sin(t * Math.PI) * 1.1;
      const f = new THREE.Mesh(cachedGeo('flag', () => { const gg = new THREE.ConeGeometry(0.3, 0.6, 3); gg.rotateZ(Math.PI); return gg; }), toon(flagColors[i % flagColors.length]));
      f.position.set(x, y - 0.3, -5.5);
      this.scene.add(f);
    }

    // Gifts and balloons
    const gifts = [[-5.5, 0, -1.5, '#ff5da2', '#ffd23f', 1.2], [-4.2, 0, -3.2, '#1fc8c1', '#ffffff', 0.8], [5.2, 0, -2.4, '#8b5cf6', '#ffd23f', 1.1], [6.4, 0, 0.6, '#ffd23f', '#e8364f', 0.7]];
    for (const [x, y, z, c, r, s] of gifts) {
      const g = giftBox(c, r, s);
      g.position.set(x, y, z);
      g.rotation.y = x * 0.3;
      this.scene.add(g);
    }
    this.balloons = [];
    const bcol = ['#ff5da2', '#ffd23f', '#1fc8c1', '#8b5cf6', '#e8364f', '#4da3ff'];
    for (let i = 0; i < 6; i++) {
      const b = balloon(bcol[i]);
      const a = -0.6 + i * 0.25;
      b.position.set(Math.sin(a) * 7.5 + (i % 2) * 0.6, 0, -Math.cos(a) * 5.5 - 1);
      this.scene.add(b);
      this.balloons.push(b);
    }

    // Characters
    this.player = new Character(settings.get().profile?.cosmetic || defaultCosmetic(0));
    this.player.root.position.set(0, 0, 1.2);
    this.scene.add(this.player.root);
    this.friends = [];
    const spots = [[-3.1, -0.6, 0.5], [3.2, -0.4, -0.4], [-1.7, -3.3, 0.2], [1.9, -3.1, -0.3]];
    spots.forEach(([x, z, yaw], i) => {
      const c = new Character(defaultCosmetic(i + 2 + (i > 1 ? 3 : 0)));
      c.root.position.set(x, 0, z);
      c.root.rotation.y = yaw;
      this.scene.add(c.root);
      this.friends.push({ c, base: new THREE.Vector3(x, 0, z), next: 1 + i * 1.3, hop: 0 });
    });

    this.focus = 'menu';
    this.camPos = new THREE.Vector3(0, 4.5, 14);
    this.camLook = new THREE.Vector3(0, 1.6, 0);
    this.camera.position.copy(this.camPos);
    this.orbit = 0;
    this.confettiTimer = 3;
  }

  setPlayerCosmetic(c) {
    this.player.setCosmetic(c);
  }

  setFocus(f) {
    this.focus = f;
    if (f === 'customise') this.player.emote('wave');
  }

  update(dt) {
    super.update(dt);
    const reduced = settings.get().reducedMotion;
    this.player.update(dt, { speed: 0, grounded: true });
    for (const f of this.friends) {
      f.next -= dt;
      if (f.next <= 0) {
        f.c.emote(EMOTES[Math.floor(Math.random() * EMOTES.length)].id);
        f.next = 3 + Math.random() * 4;
      }
      f.c.update(dt, { speed: 0, grounded: true });
    }
    for (let i = 0; i < this.balloons.length; i++) {
      const b = this.balloons[i];
      b.position.y = Math.sin(this.time * 1.3 + i) * 0.25;
      b.rotation.z = Math.sin(this.time * 0.9 + i * 2) * 0.08;
    }
    // Camera: slow orbit on the menu, close-up when customising.
    if (!reduced) this.orbit += dt * 0.08;
    let target, look;
    if (this.focus === 'customise') {
      target = new THREE.Vector3(-1.9, 1.9, 6.6);
      look = new THREE.Vector3(-2.0, 1.05, 1.2);
      this.player.root.rotation.y += dt * 0.5;
    } else {
      const r = 17;
      const a = Math.sin(this.orbit) * 0.3;
      target = new THREE.Vector3(Math.sin(a) * r - 3.4, 6.2, Math.cos(a) * r);
      look = new THREE.Vector3(-3.2, 1.0, -0.6);
      this.player.root.rotation.y += (0 - this.player.root.rotation.y) * Math.min(1, dt * 3);
    }
    const k = Math.min(1, dt * 2.5);
    this.camPos.lerp(target, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.confettiTimer -= dt;
    if (this.confettiTimer <= 0 && !reduced) {
      this.confettiTimer = 5 + Math.random() * 4;
      this.fx.burstConfetti((Math.random() - 0.5) * 8, 0.5, (Math.random() - 0.5) * 4, 40, undefined, 6);
    }
  }

  dispose() {
    super.dispose();
    this.player.dispose();
    for (const f of this.friends) f.c.dispose();
  }
}
