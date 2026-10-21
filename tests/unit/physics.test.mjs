import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Collider, makeBody, stepBody } from '../../shared/physics.js';
import { makeChar, stepChar, makeMove, separateChars } from '../../shared/controller.js';
import { BTN, DT } from '../../shared/constants.js';

const P = makeMove();
const idle = { mx: 0, mz: 0, b: 0 };

function floorWorld() {
  const w = new World();
  w.add(new Collider({ type: 'box', x: 0, y: -0.5, z: 0, hx: 20, hy: 0.5, hz: 20 }));
  return w;
}

test('character falls and rests on the floor', () => {
  const w = floorWorld();
  const ch = makeChar(0, 3, 0);
  for (let i = 0; i < 120; i++) { w.setTime(i * DT, DT); stepChar(ch, idle, w, P, DT); }
  assert.ok(ch.grounded, 'grounded');
  assert.ok(Math.abs(ch.y) < 0.02, `feet at floor, got ${ch.y}`);
});

test('character walks at configured speed', () => {
  const w = floorWorld();
  const ch = makeChar(0, 0, 0);
  for (let i = 0; i < 120; i++) stepChar(ch, { mx: 0, mz: 1, b: 0 }, w, P, DT);
  assert.ok(Math.abs(ch.vz - P.speed) < 0.01, `vz ${ch.vz}`);
  assert.ok(ch.z > 12 && ch.z < 15, `z ${ch.z}`);
});

test('jump reaches expected apex and lands', () => {
  const w = floorWorld();
  const ch = makeChar(0, 0, 0);
  for (let i = 0; i < 5; i++) stepChar(ch, idle, w, P, DT);
  stepChar(ch, { mx: 0, mz: 0, b: BTN.JUMP | BTN.JUMP_P }, w, P, DT);
  let maxY = 0;
  for (let i = 0; i < 120; i++) { stepChar(ch, idle, w, P, DT); maxY = Math.max(maxY, ch.y); }
  const apex = (P.jump * P.jump) / (2 * P.gravity);
  assert.ok(Math.abs(maxY - apex) < 0.3, `apex ${maxY} vs ${apex}`);
  assert.ok(ch.grounded);
});

test('wall blocks movement', () => {
  const w = floorWorld();
  w.add(new Collider({ type: 'box', x: 0, y: 1, z: 5, hx: 5, hy: 2, hz: 0.5 }));
  const ch = makeChar(0, 0, 0);
  for (let i = 0; i < 180; i++) stepChar(ch, { mx: 0, mz: 1, b: 0 }, w, P, DT);
  assert.ok(ch.z < 4.5 - 0.49 + 0.02, `stopped before wall, z=${ch.z}`);
});

test('moving platform carries a standing character', () => {
  const w = new World();
  const plat = w.add(new Collider({
    type: 'box', hx: 2, hy: 0.25, hz: 2,
    motion: (t, gs, c) => { c.x = t * 2; c.y = -0.25; c.z = 0; },
  }));
  const ch = makeChar(0, 0.1, 0);
  let off = 0;
  for (let i = 1; i <= 120; i++) {
    w.setTime(i * DT, DT); stepChar(ch, idle, w, P, DT);
    if (i === 30) off = plat.x - ch.x;
  }
  assert.ok(ch.grounded && ch.gid === plat.id, 'on platform');
  assert.ok(Math.abs((plat.x - ch.x) - off) < 0.01, `carried rigidly: offset ${off} -> ${plat.x - ch.x}`);
});

test('rotating platform rotates rider around its centre', () => {
  const w = new World();
  w.add(new Collider({
    type: 'cyl', r: 6, hh: 0.25,
    motion: (t, gs, c) => { c.x = 0; c.y = -0.25; c.z = 0; c.yaw = t; },
  }));
  const ch = makeChar(4, 0.05, 0);
  for (let i = 1; i <= Math.round(Math.PI / 2 / DT); i++) { w.setTime(i * DT, DT); stepChar(ch, idle, w, P, DT); }
  const r = Math.hypot(ch.x, ch.z);
  assert.ok(Math.abs(r - 4) < 0.15, `radius kept ${r}`);
  assert.ok(Math.abs(ch.z + 4) < 0.4 || Math.abs(ch.z - 4) < 0.4, `rotated a quarter turn: ${ch.x.toFixed(2)},${ch.z.toFixed(2)}`);
});

test('conveyor moves character', () => {
  const w = new World();
  w.add(new Collider({ type: 'box', x: 0, y: -0.5, z: 0, hx: 3, hy: 0.5, hz: 30, conveyor: { x: 0, z: 4 } }));
  const ch = makeChar(0, 0, 0);
  for (let i = 0; i < 60; i++) stepChar(ch, idle, w, P, DT);
  assert.ok(ch.z > 3.5 && ch.z < 4.5, `z=${ch.z}`);
});

test('steep tilt makes a character slide downhill', () => {
  const w = new World();
  w.add(new Collider({ type: 'box', x: 0, y: -0.5, z: 0, hx: 10, hy: 0.5, hz: 10, roll: 0.45 }));
  const ch = makeChar(0, 0.4, 0);
  const x0 = ch.x;
  for (let i = 0; i < 90; i++) stepChar(ch, idle, w, P, DT);
  // roll positive tilts so that +x side rises; the character should slide towards -x
  assert.ok(Math.abs(ch.x - x0) > 1, `slid ${ch.x - x0}`);
});

test('dynamic sphere rolls to rest on the floor', () => {
  const w = floorWorld();
  const b = makeBody({ x: 0, y: 3, z: 0, r: 1, vx: 3 });
  for (let i = 0; i < 400; i++) stepBody(b, w, DT, 30);
  assert.ok(Math.abs(b.y - 1) < 0.05, `y=${b.y}`);
  assert.ok(Math.abs(b.vx) < 0.5, `vx=${b.vx}`);
});

test('characters are separated', () => {
  const a = makeChar(0, 0, 0), b = makeChar(0.2, 0, 0);
  separateChars([a, b]);
  assert.ok(Math.abs(b.x - a.x) >= 0.89);
});

test('identical inputs give identical results (determinism)', () => {
  const run = () => {
    const w = floorWorld();
    w.add(new Collider({ type: 'box', x: 2, y: 0.5, z: 6, hx: 1, hy: 0.5, hz: 1, yaw: 0.6 }));
    const ch = makeChar(0, 0, 0);
    for (let i = 0; i < 300; i++) {
      const b = i % 50 === 0 ? BTN.JUMP | BTN.JUMP_P : 0;
      stepChar(ch, { mx: Math.sin(i * 0.05), mz: 1, b }, w, P, DT);
    }
    return [ch.x, ch.y, ch.z, ch.vx, ch.vy, ch.vz];
  };
  assert.deepEqual(run(), run());
});
