// Gradient sky dome and drifting puffy clouds.
import * as THREE from 'three';
import { toon, sphereGeo } from './materials.js';

export const THEMES = {
  day: { top: '#5ec8ff', horizon: '#ffe3f1', bottom: '#b9a7ff', fog: '#ffe3f1', fogNear: 60, fogFar: 220, sun: '#fff4e0', hemiSky: '#cfe9ff', hemiGround: '#b59cf0' },
  sunset: { top: '#7b5cff', horizon: '#ffb17a', bottom: '#ff7aa8', fog: '#ffc4a3', fogNear: 60, fogFar: 230, sun: '#ffe2c4', hemiSky: '#ffd9c2', hemiGround: '#9b6cf0' },
  candy: { top: '#ff8fc4', horizon: '#fff1c9', bottom: '#ffd0e6', fog: '#fff1c9', fogNear: 60, fogFar: 230, sun: '#fff8ea', hemiSky: '#fff0f7', hemiGround: '#d6a6ff' },
  mint: { top: '#46d9c6', horizon: '#e9fff7', bottom: '#9ff0e0', fog: '#e9fff7', fogNear: 60, fogFar: 230, sun: '#ffffff', hemiSky: '#e0fff8', hemiGround: '#7fb8c8' },
  factory: { top: '#2f3a68', horizon: '#ff9f6b', bottom: '#4b3c74', fog: '#c98a7a', fogNear: 50, fogFar: 200, sun: '#ffe0c0', hemiSky: '#ffd9b8', hemiGround: '#46406e' },
  night: { top: '#0b0730', horizon: '#3b1f78', bottom: '#120a3a', fog: '#1b1050', fogNear: 40, fogFar: 160, sun: '#b9b2ff', hemiSky: '#6a5acd', hemiGround: '#1a0f40' },
  stage: { top: '#3b2a80', horizon: '#ff6fae', bottom: '#2b1b5a', fog: '#6b3f9a', fogNear: 40, fogFar: 160, sun: '#fff0f6', hemiSky: '#ffd6ea', hemiGround: '#4b3290' },
};

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h*1.6), 0.8)) : mix(horizon, bottom, pow(min(1.0, -h*2.2), 0.7)); gl_FragColor = vec4(c,1.0); }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.clouds = new THREE.Group();
    scene.add(this.clouds);
    this.cloudList = [];
  }

  setTheme(name, { clouds = true, cloudY = -14, spread = 90, count = 16 } = {}) {
    const th = THEMES[name] || THEMES.day;
    this.uniforms.top.value.set(th.top);
    this.uniforms.horizon.value.set(th.horizon);
    this.uniforms.bottom.value.set(th.bottom);
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    this.theme = th;
    this.clouds.clear();
    this.cloudList = [];
    if (clouds) {
      const night = name === 'night' || name === 'factory';
      const mat = toon(night ? '#4a3b8c' : '#ffffff');
      for (let i = 0; i < count; i++) {
        const c = new THREE.Group();
        const puffs = 3 + (i % 4);
        for (let k = 0; k < puffs; k++) {
          const m = new THREE.Mesh(sphereGeo(1, 16, 12), mat);
          const s = 2.2 + ((i * 7 + k * 3) % 5) * 0.7;
          m.scale.set(s, s * 0.7, s);
          m.position.set((k - puffs / 2) * 2.4, ((k * 13) % 3) * 0.5, ((k * 7) % 3) - 1);
          c.add(m);
        }
        const a = (i / count) * Math.PI * 2 + i;
        const r = spread * (0.45 + ((i * 37) % 100) / 180);
        c.position.set(Math.cos(a) * r, cloudY - ((i * 11) % 12), Math.sin(a) * r);
        c.rotation.y = a;
        this.clouds.add(c);
        this.cloudList.push({ c, speed: 0.4 + ((i * 17) % 10) / 15 });
      }
    }
    return th;
  }

  update(dt) {
    for (const k of this.cloudList) {
      k.c.position.x += k.speed * dt;
      if (k.c.position.x > 140) k.c.position.x = -140;
    }
  }

  follow(camera) {
    this.dome.position.copy(camera.position);
  }
}
