// Colour Rush — colour pads with symbols, a floating announcer and dropping pads.
import * as THREE from 'three';
import { toon, cylGeo, canvasTexture, roundedBoxGeo, basic } from '../game/materials.js';
import { SWATCHES, PAD_R, RINGS, padAngle } from '../../shared/games/colour-rush.js';
import { drawSymbol, SYMBOL_GLYPH, addAbyss, spinAbyss } from './common.js';
import { FLAG } from '../../shared/constants.js';

const topTextures = SWATCHES.map((sw) => null);
function padTop(i) {
  if (!topTextures[i]) {
    const sw = SWATCHES[i];
    topTextures[i] = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = sw.hex;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      drawSymbol(ctx, sw.symbol, w / 2, h / 2, 72);
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#2b1b5a';
      ctx.stroke();
    });
  }
  return topTextures[i];
}

export default {
  theme: 'night',
  sky: { cloudY: -16, spread: 70 },

  setup(view) {
    view.pads = view.layout.data.pads.map((pad) => {
      const g = new THREE.Group();
      const side = new THREE.Mesh(cylGeo(PAD_R, PAD_R * 0.92, 1, 40), toon('#2b1b5a'));
      side.position.y = -0.5;
      side.castShadow = true;
      side.receiveShadow = true;
      const top = new THREE.Mesh(cylGeo(PAD_R - 0.05, PAD_R - 0.05, 0.08, 40), new THREE.MeshToonMaterial({ map: padTop(0) }));
      top.position.y = 0.0;
      top.receiveShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(PAD_R - 0.02, 0.07, 6, 40), toon('#ffffff'));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.02;
      g.add(side, top, rim);
      view.scene.add(g);
      return { g, top, rim, side, pad, drop: 0, col: -1 };
    });
    // Announcer: a floating cube showing the called colour and symbol on every side.
    view.announcer = new THREE.Mesh(roundedBoxGeo(2.6, 2.6, 2.6, 0.3), new THREE.MeshToonMaterial({ color: '#ffffff' }));
    view.announcer.position.set(0, 4.5, 0);
    view.scene.add(view.announcer);
    view.announceMats = SWATCHES.map((_, i) => new THREE.MeshToonMaterial({ map: padTop(i) }));
    view.blankMat = new THREE.MeshToonMaterial({ color: '#5b5f8a' });
    const base = new THREE.Mesh(cylGeo(1.2, 0.2, 2.4, 6), toon('#5b5f8a'));
    base.position.set(0, 2, 0);
    view.scene.add(base);
    addAbyss(view, -9.5, { color: '#3b1f78', glow: '#ff5da2' });
  },

  update(view, dt, { tPred, tNow }) {
    const gs = view.gs;
    const dropping = gs.drop >= 0 && tNow >= gs.drop && tNow < gs.rest;
    for (const p of view.pads) {
      const c = view.world.colliders[p.pad.index];
      p.g.position.set(c.x, 0, c.z);
      p.g.rotation.y = c.yaw;
      const col = Number(gs.cols[p.pad.index]);
      if (col !== p.col) {
        p.col = col;
        p.top.material.map = padTop(col);
        p.top.material.needsUpdate = true;
        p.side.material = toon(SWATCHES[col].hex);
      }
      const removed = gs.rm && gs.rm[p.pad.index] === '1';
      const wrong = col !== gs.tg;
      const target = removed ? 1 : dropping && wrong ? 1 : 0;
      p.drop += (target - p.drop) * Math.min(1, dt * (target ? 5 : 3));
      p.g.position.y = -p.drop * 14;
      p.g.visible = p.drop < 0.98;
      // Pulse wrong pads during the last second of the call.
      const warn = !dropping && gs.drop > 0 && tNow > gs.drop - 1.0 && tNow < gs.drop && wrong;
      p.rim.material = toon(warn && Math.sin(view.time * 30) > 0 ? '#ff2d55' : '#ffffff');
    }
    const a = view.announcer;
    a.rotation.y += dt * 0.8;
    a.position.y = 4.5 + Math.sin(view.time * 2) * 0.2;
    const show = gs.tg >= 0 && tNow < gs.rest + 0.2;
    a.material = show ? view.announceMats[gs.tg] : view.blankMat;
    spinAbyss(view, dt);
  },

  onEvent(view, e) {
    if (e.k === 'call') {
      const sw = SWATCHES[e.tg];
      view.pushFeed(`Stage ${e.st}: ${sw.name} ${sw.symbol}`, sw.hex);
      if (e.st === 4) view.showBanner('The outer ring is spinning!', 'info', 1.5);
      if (e.st === 6) view.showBanner('Both rings are spinning!', 'info', 1.5);
    }
    if (e.k === 'drop') view.shakeCam(0.2);
  },

  hud(view) {
    const gs = view.gs;
    const tNow = view.tNow();
    let prompt = null;
    if (gs.tg >= 0 && tNow < gs.rest) {
      const sw = SWATCHES[gs.tg];
      const left = Math.max(0, gs.drop - tNow);
      prompt = {
        symbol: SYMBOL_GLYPH[sw.symbol],
        color: sw.hex,
        label: tNow < gs.drop ? `${sw.name} ${sw.symbol} · ${left.toFixed(1)}s` : `${sw.name} ${sw.symbol} is safe`,
      };
    }
    return {
      lines: [
        { label: 'Stage', value: gs.st },
        { label: 'Still standing', value: `${view.aliveCount()} / ${view.n}` },
      ],
      prompt,
      board: view.chars.map((c) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: c.flags & FLAG.ALIVE ? 'In' : 'Out', out: !(c.flags & FLAG.ALIVE) })),
    };
  },
};
