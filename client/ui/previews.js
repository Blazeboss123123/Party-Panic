// Preview images for minigame cards: each arena is built from its real shared layout and
// rendered once offscreen, then cached as an image.
import * as THREE from 'three';
import { useEffect, useState } from 'react';
import { RoundView } from '../game/roundView.js';
import { ctx } from './components.jsx';
import { defaultCosmetic } from '../../shared/cosmetics.js';

const cache = new Map();
const listeners = new Map();
const queue = [];
let busy = false;

const fakeConn = { rtt: 0.08, serverNow: () => 0, send() {} };

function renderPreview(gameId) {
  const engine = ctx.engine;
  if (!engine) return null;
  const n = 4;
  const roster = Array.from({ length: n }, (_, i) => ({ slot: i, pid: 'preview' + i, name: '', team: i % 2 }));
  const players = new Map(roster.map((r, i) => [r.pid, { id: r.pid, seat: i + 1, cosmetic: defaultCosmetic(i * 2 + 1) }]));
  let view;
  try {
    view = new RoundView(engine, { conn: fakeConn, start: { gameId, seed: 4242, duration: 60, roster, g: null }, myId: null, players, phase: 'intro', preview: true });
  } catch (err) {
    console.warn('preview failed', gameId, err);
    return null;
  }
  view.preview = true;
  for (const ch of view.chars) ch.c.setNameTag('', 0, false);
  const w = 480, h = 270;
  view.resize(w, h);
  view.camera.aspect = w / h;
  view.camera.fov = 50;
  view.camera.updateProjectionMatrix();
  view.introOrbit = 0.75;
  for (let i = 0; i < 3; i++) view.update(1 / 60);
  // Jump the camera straight to its orbit position.
  view.camPos.copy(view.camera.position);
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const r = engine.renderer;
  const prev = r.getRenderTarget();
  r.setRenderTarget(rt);
  r.render(view.scene, view.camera);
  const px = new Uint8Array(w * h * 4);
  r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  r.setRenderTarget(prev);
  rt.dispose();
  view.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c2 = canvas.getContext('2d');
  const img = c2.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  }
  c2.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.86);
}

function pump() {
  if (busy || !queue.length) return;
  busy = true;
  requestAnimationFrame(() => {
    const id = queue.shift();
    if (!cache.has(id)) {
      const url = renderPreview(id);
      cache.set(id, url);
      for (const fn of listeners.get(id) || []) fn(url);
    }
    busy = false;
    pump();
  });
}

export function requestPreview(id) {
  if (cache.has(id) || queue.includes(id)) return;
  queue.push(id);
  pump();
}

export function usePreview(id) {
  const [url, setUrl] = useState(() => cache.get(id) || null);
  useEffect(() => {
    if (cache.has(id)) { setUrl(cache.get(id)); return undefined; }
    if (!listeners.has(id)) listeners.set(id, new Set());
    const fn = (u) => setUrl(u);
    listeners.get(id).add(fn);
    requestPreview(id);
    return () => listeners.get(id).delete(fn);
  }, [id]);
  return url;
}
