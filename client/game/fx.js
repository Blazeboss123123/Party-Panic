// Lightweight particle effects (confetti, puffs, sparks) using instanced meshes, plus
// floating text sprites. Particle counts drop in low graphics / reduced motion modes.
import * as THREE from 'three';
import { canvasTexture } from './materials.js';
import { settings } from '../settings.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

class Pool {
  constructor(geo, mat, cap) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.cap = cap;
    this.items = [];
    const colors = new Float32Array(cap * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  }
  spawn(p) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push(p);
  }
  update(dt) {
    const items = this.items;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx *= 1 - p.drag * dt;
      p.vy = p.vy * (1 - p.drag * dt) - p.g * dt;
      p.vz *= 1 - p.drag * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.rx += p.sx * dt; p.ry += p.sy * dt;
      const k = 1 - p.age / p.life;
      const sc = p.size * (p.shrink ? Math.max(0.01, k) : 1) * (p.grow ? 1 + (1 - k) * p.grow : 1);
      tmpP.set(p.x, p.y, p.z);
      tmpQ.setFromEuler(tmpE.set(p.rx, p.ry, 0));
      tmpS.set(sc * (p.ax || 1), sc * (p.ay || 1), sc * (p.az || 1));
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(n, tmpM);
      tmpC.set(p.color);
      this.mesh.setColorAt(n, tmpC);
      items[n] = p;
      n++;
    }
    items.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.confetti = new Pool(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 700);
    this.puffs = new Pool(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshToonMaterial({ color: '#ffffff' }), 500);
    this.sparks = new Pool(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), 500);
    this.group.add(this.confetti.mesh, this.puffs.mesh, this.sparks.mesh);
    this.texts = [];
  }

  get scale() {
    const s = settings.get();
    return (s.graphics === 'low' ? 0.45 : 1) * (s.reducedMotion ? 0.5 : 1);
  }

  burstConfetti(x, y, z, count = 60, colors = ['#ff5da2', '#ffd23f', '#1fc8c1', '#8b5cf6', '#ff8a3d', '#ffffff'], power = 7) {
    const n = Math.round(count * this.scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      this.confetti.spawn({
        x, y, z,
        vx: Math.cos(a) * power * u, vy: power * (0.8 + Math.random() * 0.8), vz: Math.sin(a) * power * u,
        g: 9, drag: 1.4, age: 0, life: 2.2 + Math.random() * 1.2, size: 1 + Math.random() * 0.6,
        rx: Math.random() * 6, ry: Math.random() * 6, sx: (Math.random() - 0.5) * 18, sy: (Math.random() - 0.5) * 18,
        color: colors[i % colors.length], shrink: true,
      });
    }
  }

  puff(x, y, z, count = 10, color = '#ffffff', size = 0.35, power = 2.5) {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.puffs.spawn({
        x: x + Math.cos(a) * 0.2, y: y + Math.random() * 0.3, z: z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * power * (0.5 + Math.random()), vy: power * 0.5 * Math.random() + 0.5, vz: Math.sin(a) * power * (0.5 + Math.random()),
        g: -1, drag: 3, age: 0, life: 0.6 + Math.random() * 0.4, size: size * (0.7 + Math.random() * 0.6),
        rx: 0, ry: 0, sx: 0, sy: 0, color, shrink: true,
      });
    }
  }

  dust(x, y, z) {
    this.puff(x, y + 0.05, z, 4, '#f3f0ff', 0.18, 1.6);
  }

  sparkle(x, y, z, color = '#ffd23f', count = 14, power = 4) {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      this.sparks.spawn({
        x, y, z,
        vx: Math.cos(a) * Math.cos(b) * power, vy: Math.sin(b) * power + power * 0.4, vz: Math.sin(a) * Math.cos(b) * power,
        g: 6, drag: 2, age: 0, life: 0.5 + Math.random() * 0.4, size: 0.8 + Math.random() * 0.8,
        rx: Math.random() * 6, ry: Math.random() * 6, sx: 8, sy: 8, color, shrink: true,
      });
    }
  }

  explosion(x, y, z) {
    this.puff(x, y, z, 26, '#ffb347', 0.7, 6);
    this.puff(x, y, z, 14, '#5b5f8a', 0.6, 4);
    this.sparkle(x, y, z, '#ffd23f', 30, 9);
  }

  floatText(text, x, y, z, color = '#ffffff', size = 1) {
    const tex = canvasTexture(256, 96, (ctx, w, h) => {
      ctx.font = '400 64px "Bagel Fat One", Gabarito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#2b1b5a';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, w / 2, h / 2 + 4);
      ctx.fillStyle = color;
      ctx.fillText(text, w / 2, h / 2 + 4);
    });
    // Constant on-screen size so labels stay readable from far arena cameras.
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 20;
    sp.position.set(x, y, z);
    sp.scale.set(0.16 * size, 0.06 * size, 1);
    this.group.add(sp);
    this.texts.push({ sp, age: 0, life: 1.2, size });
  }

  update(dt) {
    this.confetti.update(dt);
    this.puffs.update(dt);
    this.sparks.update(dt);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      t.sp.position.y += dt * 1.2;
      const k = t.age / t.life;
      t.sp.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const pop = Math.min(1, t.age * 8);
      t.sp.scale.set(0.16 * t.size * pop, 0.06 * t.size * pop, 1);
      if (t.age >= t.life) {
        this.group.remove(t.sp);
        t.sp.material.map.dispose();
        t.sp.material.dispose();
        this.texts.splice(i, 1);
      }
    }
  }

  clear() {
    this.confetti.clear();
    this.puffs.clear();
    this.sparks.clear();
    for (const t of this.texts) {
      this.group.remove(t.sp);
      t.sp.material.map.dispose();
      t.sp.material.dispose();
    }
    this.texts.length = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
