// Small deterministic math helpers used on both server and client.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function approachAngle(a, target, maxStep) {
  const d = wrapAngle(target - a);
  if (Math.abs(d) <= maxStep) return target;
  return a + Math.sign(d) * maxStep;
}

export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function round3(v) {
  return Math.round(v * 1000) / 1000;
}
export function round2(v) {
  return Math.round(v * 100) / 100;
}

// Mulberry32 seeded random generator.
export function makeRng(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + rng() * (b - a);
  rng.int = (a, b) => Math.floor(a + rng() * (b - a + 1)); // inclusive
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  };
  return rng;
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Rotation matrix (row-major, 9 numbers) for Euler order YXZ: R = Ry(yaw) * Rx(pitch) * Rz(roll).
// This matches three.js Euler(pitch, yaw, roll, 'YXZ').
export function eulerMatrix(yaw, pitch, roll, out) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  // Ry * Rx
  // Ry = [cy 0 sy; 0 1 0; -sy 0 cy], Rx = [1 0 0; 0 cx -sx; 0 sx cx]
  const a00 = cy, a01 = sy * sx, a02 = sy * cx;
  const a10 = 0, a11 = cx, a12 = -sx;
  const a20 = -sy, a21 = cy * sx, a22 = cy * cx;
  // (Ry*Rx) * Rz, Rz = [cz -sz 0; sz cz 0; 0 0 1]
  out[0] = a00 * cz + a01 * sz;
  out[1] = -a00 * sz + a01 * cz;
  out[2] = a02;
  out[3] = a10 * cz + a11 * sz;
  out[4] = -a10 * sz + a11 * cz;
  out[5] = a12;
  out[6] = a20 * cz + a21 * sz;
  out[7] = -a20 * sz + a21 * cz;
  out[8] = a22;
  return out;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
