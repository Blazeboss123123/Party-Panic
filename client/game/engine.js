// Renderer, main loop and view switching.
import * as THREE from 'three';
import { settings } from '../settings.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.view = null;
    this.timer = new THREE.Timer();
    this.fps = 60;
    this.frameMs = 16;
    this.listeners = new Set();
    this.applySettings();
    settings.subscribe(() => this.applySettings());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  applySettings() {
    const s = settings.get();
    const low = s.graphics === 'low';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75));
    const shadows = !low;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      if (this.view) this.view.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.view) this.view.resize(w, h);
  }

  setView(view) {
    const old = this.view;
    this.view = view;
    if (view) view.resize(window.innerWidth, window.innerHeight);
    if (old && old !== view) old.dispose();
  }

  onFrame(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  frame(time) {
    this.timer.update(time);
    const raw = this.timer.getDelta();
    const dt = Math.min(0.1, Math.max(0, raw));
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    const t0 = performance.now();
    for (const fn of this.listeners) fn(dt);
    if (this.view) {
      this.view.update(dt);
      this.renderer.render(this.view.scene, this.view.camera);
    }
    this.frameMs = this.frameMs * 0.95 + (performance.now() - t0) * 0.05;
  }
}
