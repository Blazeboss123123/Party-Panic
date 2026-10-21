// Shared materials and geometry caches. Everything is toon-shaded for a toy-like look.
import * as THREE from 'three';

export const INK = new THREE.Color('#2b1b5a');

let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const matCache = new Map();
export function toon(color, opts = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive || ''}|${opts.emissiveIntensity || 0}|${opts.transparent ? opts.opacity : ''}|${opts.side || ''}|${opts.map ? opts.map.uuid : ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: toonGradient(),
      emissive: opts.emissive || '#000000',
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      map: opts.map || null,
    });
    if (opts.transparent) m.depthWrite = false;
    matCache.set(key, m);
  }
  return m;
}

// Unique (uncached) toon material for objects whose colour animates.
export function toonUnique(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: opts.emissive || '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    map: opts.map || null,
  });
}

const basicCache = new Map();
export function basic(color, opts = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.transparent ? opts.opacity : ''}|${opts.side || ''}|${opts.additive ? 1 : 0}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: !!opts.transparent || !!opts.additive,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !(opts.transparent || opts.additive),
    });
    basicCache.set(key, m);
  }
  return m;
}

export const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

const geoCache = new Map();
export function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function boxGeo(w, h, d) {
  return cachedGeo(`box${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`, () => new THREE.BoxGeometry(w, h, d));
}

export function cylGeo(rt, rb, h, seg = 32) {
  return cachedGeo(`cyl${rt.toFixed(3)}|${rb.toFixed(3)}|${h.toFixed(3)}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}

export function sphereGeo(r, w = 24, h = 16) {
  return cachedGeo(`sph${r.toFixed(3)}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
}

// Rounded box geometry (bevelled) for chunky toy blocks.
export function roundedBoxGeo(w, h, d, radius = 0.12, seg = 3) {
  return cachedGeo(`rbox${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${radius}|${seg}`, () => {
    const r0 = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const bs = r0 * 0.6; // bevel grows the outline outward, so draw the shape smaller
    w -= bs * 2;
    d -= bs * 2;
    const r = Math.min(r0, w / 2 - 0.001, d / 2 - 0.001);
    const shape = new THREE.Shape();
    const x = -w / 2, y = -d / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + d - r);
    shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    shape.lineTo(x + r, y + d);
    shape.quadraticCurveTo(x, y + d, x, y + d - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    const bevel = Math.min(r0, h / 2 - 0.001);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, h - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bs,
      bevelSegments: seg,
      curveSegments: seg * 2,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -(h - bevel * 2) / 2, 0);
    geo.computeVertexNormals();
    return geo;
  });
}

// Canvas texture helpers.
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function stripeTexture(a, b, stripes = 8, angle = true) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    const step = w / stripes;
    for (let i = -stripes; i < stripes * 2; i += 2) {
      ctx.beginPath();
      if (angle) {
        ctx.moveTo(i * step, 0);
        ctx.lineTo((i + 1) * step, 0);
        ctx.lineTo((i + 1) * step - h, h);
        ctx.lineTo(i * step - h, h);
      } else {
        ctx.rect(i * step, 0, step, h);
      }
      ctx.fill();
    }
  });
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  if (amt > 0) c.lerp(new THREE.Color('#ffffff'), amt);
  else c.lerp(new THREE.Color('#1a1033'), -amt);
  return '#' + c.getHexString();
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.cached && o.userData.ownGeometry) o.geometry.dispose();
    if (o.material && o.userData.ownMaterial) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m.map && o.userData.ownTexture) m.map.dispose();
        m.dispose();
      }
    }
  });
}
