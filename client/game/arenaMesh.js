// Builds meshes for layout colliders from their `look` description, so visuals always
// match the collision shapes the server simulates.
import * as THREE from 'three';
import { toon, roundedBoxGeo, cylGeo, boxGeo, canvasTexture, shade, basic, cachedGeo } from './materials.js';

const conveyorTextures = new Map();
export function conveyorTexture(color = '#3b3561', arrow = '#ffd23f') {
  const key = color + arrow;
  if (conveyorTextures.has(key)) return conveyorTextures.get(key);
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 16, w, 3);
    ctx.fillStyle = arrow;
    ctx.beginPath();
    ctx.moveTo(w / 2, 22);
    ctx.lineTo(w / 2 + 34, 70);
    ctx.lineTo(w / 2 + 14, 70);
    ctx.lineTo(w / 2 + 14, 106);
    ctx.lineTo(w / 2 - 14, 106);
    ctx.lineTo(w / 2 - 14, 70);
    ctx.lineTo(w / 2 - 34, 70);
    ctx.closePath();
    ctx.fill();
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  conveyorTextures.set(key, tex);
  return tex;
}

const hazardTex = new Map();
export function hazardStripeTexture(a = '#ffd23f', b = '#2b1b5a') {
  const key = a + b;
  if (hazardTex.has(key)) return hazardTex.get(key);
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    for (let i = -4; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32 + 16, 0);
      ctx.lineTo(i * 32 + 16 + h, h);
      ctx.lineTo(i * 32 + h, h);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  hazardTex.set(key, tex);
  return tex;
}

const checkerTex = new Map();
export function checkerTexture(a, b, n = 4) {
  const key = a + b + n;
  if (checkerTex.has(key)) return checkerTex.get(key);
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? a : b;
      ctx.fillRect(i * s, j * s, s, s);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  checkerTex.set(key, tex);
  return tex;
}

export function applyPose(obj, c) {
  obj.position.set(c.x, c.y, c.z);
  obj.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ');
}

// Build a mesh group for a collider. Returns null for invisible colliders.
export function buildColliderMesh(c) {
  const look = c.look;
  if (!look || look.hidden) return null;
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const color = look.color || '#c9b8ff';
  let mat;
  if (look.conveyor) {
    // Orientation and scrolling are updated every frame from the belt's current direction.
    const tex = conveyorTexture(look.color || '#3b3561', look.arrow || '#ffd23f').clone();
    tex.needsUpdate = true;
    tex.center.set(0.5, 0.5);
    mat = new THREE.MeshToonMaterial({ map: tex, color: '#ffffff' });
    g.userData.scroll = { tex };
  } else if (look.stripes) {
    const tex = hazardStripeTexture(look.stripes[0], look.stripes[1]).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, (c.type === 'box' ? c.hx : c.r) / 0.8), Math.max(1, (c.type === 'box' ? Math.max(c.hy, c.hz) : c.hh) / 0.8));
    mat = new THREE.MeshToonMaterial({ map: tex });
  } else if (look.checker) {
    const tex = checkerTexture(look.checker[0], look.checker[1], 2).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(c.hx / 1.2)), Math.max(1, Math.round(c.hz / 1.2)));
    mat = new THREE.MeshToonMaterial({ map: tex });
  } else if (look.glow) {
    mat = basic(color, { transparent: look.opacity !== undefined, opacity: look.opacity ?? 1 });
  } else {
    mat = toon(color, { emissive: look.emissive, emissiveIntensity: look.emissiveIntensity ?? 0.6, transparent: look.opacity !== undefined, opacity: look.opacity });
  }
  let body;
  if (c.type === 'box') {
    const w = c.hx * 2, h = c.hy * 2, d = c.hz * 2;
    const round = look.round !== undefined ? look.round : Math.min(0.14, Math.min(w, h, d) * 0.22);
    const geo = round > 0.01 && !mat.map ? roundedBoxGeo(w, h, d, round, 2) : boxGeo(w, h, d);
    body = new THREE.Mesh(geo, mat);
  } else {
    body = new THREE.Mesh(cylGeo(c.r, c.r, c.hh * 2, look.segments || Math.max(16, Math.min(56, Math.round(c.r * 8)))), mat);
  }
  body.castShadow = look.shadow !== false;
  body.receiveShadow = true;
  g.add(body);
  g.userData.body = body;
  // Contrasting top surface.
  if (look.top) {
    const topH = 0.12;
    let top;
    if (c.type === 'box') {
      top = new THREE.Mesh(roundedBoxGeo(c.hx * 2 + 0.02, topH, c.hz * 2 + 0.02, 0.05, 2), toon(look.top));
      top.position.y = c.hy - topH / 2 + 0.03;
    } else {
      top = new THREE.Mesh(cylGeo(c.r + 0.01, c.r + 0.01, topH, look.segments || 40), toon(look.top));
      top.position.y = c.hh - topH / 2 + 0.03;
    }
    top.receiveShadow = true;
    g.add(top);
    g.userData.top = top;
  }
  if (look.edge) {
    // Thin outline frame around top edges for readability.
    const e = new THREE.Mesh(
      c.type === 'box' ? boxGeo(c.hx * 2 + 0.08, 0.06, c.hz * 2 + 0.08) : cylGeo(c.r + 0.06, c.r + 0.06, 0.06, 40),
      toon(look.edge),
    );
    e.position.y = (c.type === 'box' ? c.hy : c.hh) - 0.02;
    g.add(e);
  }
  if (look.under) {
    // Drippy underside for floating platforms.
    const r = c.type === 'box' ? Math.min(c.hx, c.hz) : c.r;
    const cone = new THREE.Mesh(cachedGeo(`under${r.toFixed(2)}`, () => new THREE.ConeGeometry(r * 0.85, r * 1.1, 7)), toon(look.under));
    cone.rotation.x = Math.PI;
    cone.position.y = -(c.type === 'box' ? c.hy : c.hh) - r * 0.55;
    g.add(cone);
  }
  applyPose(g, c);
  g.userData.collider = c;
  return g;
}

export { shade };
