// Base class for 3D views: scene, camera, sky, lights and particles.
import * as THREE from 'three';
import { Sky } from '../game/sky.js';
import { FX } from '../game/fx.js';

export class BaseView {
  constructor(engine, theme = 'day', skyOpts = {}) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.sky = new Sky(this.scene);
    this.theme = this.sky.setTheme(theme, skyOpts);
    this.hemi = new THREE.HemisphereLight(this.theme.hemiSky, this.theme.hemiGround, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(this.theme.sun, 2.1);
    this.sun.position.set(18, 34, -14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.setShadowBounds(20);
    this.scene.add(this.sun, this.sun.target);
    this.fx = new FX(this.scene);
    this.time = 0;
    this.disposed = false;
  }

  setShadowBounds(half, center = new THREE.Vector3()) {
    const c = this.sun.shadow.camera;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half;
    c.near = 1; c.far = 140;
    c.updateProjectionMatrix();
    this.sun.target.position.copy(center);
    this.sun.position.set(center.x + 18, center.y + 40, center.z - 14);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    // Keep wide arenas visible on narrow windows.
    this.camera.fov = w / h < 1.2 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.time += dt;
    this.sky.update(dt);
    this.sky.follow(this.camera);
    this.fx.update(dt);
  }

  dispose() {
    this.disposed = true;
    this.fx.dispose();
    this.scene.traverse((o) => {
      if (o.isMesh && o.userData.ownGeometry && o.geometry) o.geometry.dispose();
    });
  }
}
