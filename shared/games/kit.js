// Arena building helpers shared by the server and the client renderer.

import { World, Collider } from '../physics.js';

export function box(x, y, z, hx, hy, hz, o = {}) {
  return { type: 'box', x, y, z, hx, hy, hz, ...o };
}

export function cyl(x, y, z, r, hh, o = {}) {
  return { type: 'cyl', x, y, z, r, hh, ...o };
}

// Flat platform whose top surface sits at topY.
export function slab(x, topY, z, hx, hz, thick = 0.5, o = {}) {
  return box(x, topY - thick, z, hx, thick, hz, o);
}

// Round platform whose top surface sits at topY.
export function disc(x, topY, z, r, thick = 0.5, o = {}) {
  return cyl(x, topY - thick, z, r, thick, o);
}

// Ramp along +z from (z0, y0) to (z1, y1), centred on xc with half width hw.
export function ramp(xc, z0, y0, z1, y1, hw, thick = 0.4, o = {}) {
  const dz = z1 - z0, dy = y1 - y0;
  const L = Math.hypot(dz, dy);
  const a = Math.atan2(dy, dz);
  const my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
  return box(xc, my - Math.cos(a) * thick, mz + Math.sin(a) * thick, hw, thick, L / 2, { pitch: -a, ...o });
}

// Ramp in any horizontal direction from (x0, y0, z0) to (x1, y1, z1).
export function rampTo(x0, y0, z0, x1, y1, z1, hw, thick = 0.4, o = {}) {
  const dx = x1 - x0, dz = z1 - z0, dy = y1 - y0;
  const h = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const a = Math.atan2(dy, h);
  const L = Math.hypot(h, dy);
  const nx = -Math.sin(a) * Math.sin(yaw), ny = Math.cos(a), nz = -Math.sin(a) * Math.cos(yaw);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
  return box(mx - nx * thick, my - ny * thick, mz - nz * thick, hw, thick, L / 2, { yaw, pitch: -a, ...o });
}

export function createWorld(layout) {
  const w = new World();
  w.gs = layout.gs || {};
  for (const o of layout.colliders) w.add(new Collider(o));
  return w;
}

// Spawn points in a ring.
export function ringSpawns(n, radius, y = 0, cx = 0, cz = 0, faceCentre = true) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const x = cx + Math.sin(a) * radius, z = cz + Math.cos(a) * radius;
    out.push({ x, y, z, yaw: faceCentre ? Math.atan2(cx - x, cz - z) : 0 });
  }
  return out;
}

// Spawn points in a row along x (for races facing +z).
export function rowSpawns(n, z, y = 0, spacing = 1.6, cx = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * spacing;
    out.push({ x, y, z, yaw: 0 });
  }
  return out;
}

// Standard looks. The client maps `mat` names to materials.
export const LOOK = {
  hidden: null,
};

// Progress along a polyline of waypoints (x, z) for race ranking: returns distance travelled
// along the path to the closest point.
export function pathProgress(path, x, z) {
  let best = Infinity, bestS = 0, acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz;
    const L = Math.sqrt(L2);
    let t = L2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best) { best = d2; bestS = acc + t * L; }
    acc += L;
  }
  return bestS;
}
