// Visual helpers shared by minigame modules.
import * as THREE from 'three';
import { toon, basic, canvasTexture, cachedGeo, sphereGeo, cylGeo } from '../game/materials.js';

// A clearly visible elimination zone far below an arena: a glowing goo sea with rings.
export function addAbyss(view, y, { color = '#ff5da2', glow = '#ffd0e6', radius = 120 } = {}) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, glow);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    for (let r = 12; r < w / 2; r += 18) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.userData.ownGeometry = true;
  view.scene.add(m);
  view.abyss = m;
  return m;
}

export function spinAbyss(view, dt) {
  if (view.abyss) view.abyss.rotation.z += dt * 0.05;
}

// Floating decorative lollipops / trees around arenas.
export function lollipop(color, h = 4) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(cylGeo(0.12, 0.12, h, 8), toon('#ffffff'));
  stick.position.y = h / 2;
  const candy = new THREE.Mesh(cachedGeo('lolli', () => new THREE.CylinderGeometry(1.1, 1.1, 0.35, 28)), toon(color));
  candy.rotation.x = Math.PI / 2;
  candy.position.y = h + 0.9;
  const swirl = new THREE.Mesh(cachedGeo('lolli-swirl', () => new THREE.TorusGeometry(0.6, 0.12, 8, 24)), toon('#ffffff'));
  swirl.position.set(0, h + 0.9, 0.19);
  g.add(stick, candy, swirl);
  return g;
}

export function floatingRock(color = '#9b7bd6', s = 1) {
  const m = new THREE.Mesh(cachedGeo('deco-rock', () => new THREE.DodecahedronGeometry(1, 0)), toon(color));
  m.scale.setScalar(s);
  return m;
}

// Ring marker under a character (teams, bomb holder, target).
export function ringMarker(color, r = 0.75) {
  const m = new THREE.Mesh(cachedGeo(`ring-${r}`, () => new THREE.RingGeometry(r * 0.72, r, 32)), basic(color, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.renderOrder = 2;
  return m;
}

export function arrowShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5);
  s.lineTo(0.42, 0);
  s.lineTo(0.16, 0);
  s.lineTo(0.16, -0.5);
  s.lineTo(-0.16, -0.5);
  s.lineTo(-0.16, 0);
  s.lineTo(-0.42, 0);
  s.closePath();
  return s;
}

export function arrowMesh(color, size = 1, opts = {}) {
  const geo = cachedGeo('arrow-flat', () => {
    const g = new THREE.ShapeGeometry(arrowShape());
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI);
    return g;
  });
  const m = new THREE.Mesh(geo, basic(color, { transparent: true, opacity: opts.opacity ?? 0.9, side: THREE.DoubleSide }));
  m.scale.setScalar(size);
  m.renderOrder = 3;
  return m;
}

export function gemMesh(color, size = 0.45) {
  const m = new THREE.Mesh(cachedGeo('gem', () => new THREE.OctahedronGeometry(1, 0)), toon(color, { emissive: color, emissiveIntensity: 0.35 }));
  m.scale.set(size, size * 1.3, size);
  m.castShadow = true;
  return m;
}

export function coinMesh() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(cachedGeo('coin', () => { const c = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24); c.rotateX(Math.PI / 2); return c; }), toon('#ffc93c', { emissive: '#7a5200', emissiveIntensity: 0.35 }));
  const inner = new THREE.Mesh(cachedGeo('coin-in', () => { const c = new THREE.CylinderGeometry(0.26, 0.26, 0.12, 20); c.rotateX(Math.PI / 2); return c; }), toon('#fff1a8'));
  g.add(m, inner);
  return g;
}

export function bulb(color, r = 0.2) {
  return new THREE.Mesh(sphereGeo(r, 10, 8), basic(color));
}

export function textSprite(text, { color = '#ffffff', size = 1, font = '"Bagel Fat One", Gabarito, sans-serif', bg = null, w = 512, h = 128 } = {}) {
  const tex = canvasTexture(w, h, (ctx) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, h / 2 - 4);
      ctx.fill();
    }
    ctx.font = `400 ${Math.round(h * 0.62)}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = h * 0.1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2b1b5a';
    ctx.strokeText(text, w / 2, h / 2 + h * 0.04);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + h * 0.04);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  sp.scale.set(size * (w / h), size, 1);
  return sp;
}

let glowTex = null;
export function glowSprite(color, size = 1.6) {
  if (!glowTex) {
    glowTex = canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.set(size, size, 1);
  sp.userData.ownMaterial = true;
  return sp;
}

// Draw a symbol shape with canvas paths (no font dependency).
export function drawSymbol(ctx, kind, cx, cy, r) {
  ctx.beginPath();
  switch (kind) {
    case 'circle':
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.95, cy + r * 0.75);
      ctx.lineTo(cx - r * 0.95, cy + r * 0.75);
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.45 : r;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    case 'square':
      ctx.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.8, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.8, cy);
      ctx.closePath();
      break;
    case 'cross': {
      const w = r * 0.38;
      ctx.moveTo(cx - w, cy - r); ctx.lineTo(cx + w, cy - r); ctx.lineTo(cx + w, cy - w); ctx.lineTo(cx + r, cy - w);
      ctx.lineTo(cx + r, cy + w); ctx.lineTo(cx + w, cy + w); ctx.lineTo(cx + w, cy + r); ctx.lineTo(cx - w, cy + r);
      ctx.lineTo(cx - w, cy + w); ctx.lineTo(cx - r, cy + w); ctx.lineTo(cx - r, cy - w); ctx.lineTo(cx - w, cy - w);
      ctx.closePath();
      break;
    }
    case 'heart':
      ctx.moveTo(cx, cy + r * 0.8);
      ctx.bezierCurveTo(cx - r * 1.4, cy - r * 0.2, cx - r * 0.6, cy - r * 1.2, cx, cy - r * 0.45);
      ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.2, cx + r * 1.4, cy - r * 0.2, cx, cy + r * 0.8);
      ctx.closePath();
      break;
    case 'moon':
      ctx.arc(cx, cy, r, Math.PI * 0.3, Math.PI * 1.7);
      ctx.arc(cx + r * 0.45, cy, r * 0.75, Math.PI * 1.65, Math.PI * 0.35, true);
      ctx.closePath();
      break;
    case 'bolt':
      ctx.moveTo(cx + r * 0.15, cy - r); ctx.lineTo(cx - r * 0.6, cy + r * 0.1); ctx.lineTo(cx - r * 0.05, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.25, cy + r); ctx.lineTo(cx + r * 0.6, cy - r * 0.15); ctx.lineTo(cx + r * 0.05, cy - r * 0.15);
      ctx.closePath();
      break;
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
}

export const SYMBOL_GLYPH = { circle: '●', triangle: '▲', star: '★', square: '■', diamond: '◆', cross: '✚', heart: '♥', moon: '☾', bolt: 'ϟ' };
