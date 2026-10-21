// Memory Mayhem — raised symbol pads that light up in sequence, with step feedback.
import * as THREE from 'three';
import { toon, canvasTexture, roundedBoxGeo, boxGeo } from '../game/materials.js';
import { PAD_SYMBOLS, PAD_HALF, PAD_TOP } from '../../shared/games/memory-mayhem.js';
import { drawSymbol, glowSprite, textSprite } from './common.js';
import { FLAG } from '../../shared/constants.js';
import { cue, colourAssist } from '../game/palette.js';

function padTexture(i, lit) {
  const s = PAD_SYMBOLS[i];
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = lit ? s.hex : '#3b3561';
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 14;
    ctx.strokeStyle = s.hex;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    drawSymbol(ctx, s.symbol, w / 2, h / 2, 74);
    ctx.fillStyle = lit ? '#ffffff' : s.hex;
    ctx.fill();
  });
  // Box top faces map v towards -z; flip so symbols read upright from the camera.
  tex.center.set(0.5, 0.5);
  tex.rotation = Math.PI;
  return tex;
}

export default {
  theme: 'night',
  sky: { cloudY: -14, spread: 60 },

  setup(view) {
    view.memPads = view.layout.data.pads.map((pd, i) => {
      const g = new THREE.Group();
      const side = new THREE.Mesh(roundedBoxGeo(PAD_HALF * 2, PAD_TOP, PAD_HALF * 2, 0.12), toon(PAD_SYMBOLS[i].hex));
      side.position.y = PAD_TOP / 2 - 0.02;
      side.castShadow = true;
      side.receiveShadow = true;
      const dim = new THREE.MeshToonMaterial({ map: padTexture(i, false) });
      const lit = new THREE.MeshBasicMaterial({ map: padTexture(i, true) });
      const top = new THREE.Mesh(boxGeo(PAD_HALF * 2 - 0.1, 0.04, PAD_HALF * 2 - 0.1), dim);
      top.position.y = PAD_TOP + 0.01;
      top.receiveShadow = true;
      const glow = glowSprite(PAD_SYMBOLS[i].hex, 7);
      glow.position.y = PAD_TOP + 0.8;
      glow.visible = false;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(PAD_HALF * 0.9, PAD_HALF * 0.9, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: PAD_SYMBOLS[i].hex, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = PAD_TOP + 4.5;
      beam.visible = false;
      g.add(side, top, glow, beam);
      g.position.set(pd.x, 0, pd.z);
      view.scene.add(g);
      return { g, top, dim, lit, glow, beam, flash: 0, flashColor: null };
    });
    view.orderLabels = [];
  },

  update(view, dt, { tNow }) {
    const gs = view.gs;
    view.memPads.forEach((p, i) => {
      const isLit = gs.ph === 'show' && gs.lit === i;
      p.top.material = isLit ? p.lit : p.dim;
      p.glow.visible = isLit || p.flash > 0;
      if (p.flash > 0) {
        p.flash -= dt;
        p.glow.material.color.set(p.flashColor);
      } else {
        p.glow.material.color.set(PAD_SYMBOLS[i].hex);
      }
      p.g.position.y = isLit ? 0.3 + Math.sin(view.time * 12) * 0.04 : 0;
      p.beam.visible = isLit;
    });
    for (let k = view.orderLabels.length - 1; k >= 0; k--) {
      const l = view.orderLabels[k];
      l.t -= dt;
      l.sp.position.y += dt * 0.3;
      if (l.t <= 0) { view.scene.remove(l.sp); l.sp.material.map.dispose(); l.sp.material.dispose(); view.orderLabels.splice(k, 1); }
    }
  },

  onEvent(view, e) {
    const pads = view.layout.data.pads;
    if (e.k === 'stage') view.pushFeed(`Stage ${e.st}: remember ${e.L} pads`, '#7ef0c3');
    if (e.k === 'go2') view.showBanner('Your turn!', 'go', 1);
    if (e.s === view.mySlot) {
      if (e.k === 'step') {
        const p = view.memPads[e.pad];
        p.flash = 0.5;
        p.flashColor = cue('good');
        view.fx.floatText(colourAssist() ? `✓ ${e.n}` : `${e.n}`, pads[e.pad].x, PAD_TOP + 1.6, pads[e.pad].z, cue('good'), 1);
      } else if (e.k === 'miss') {
        const p = view.memPads[e.pad];
        p.flash = 0.8;
        p.flashColor = cue('danger');
        if (colourAssist()) view.fx.floatText('✗', pads[e.pad].x, PAD_TOP + 1.6, pads[e.pad].z, cue('danger'), 1);
        view.shakeCam(0.3);
      } else if (e.k === 'wrong' || e.k === 'timeout') {
        view.showBanner(e.k === 'wrong' ? 'Wrong pad!' : 'Out of time!', 'out', 1.3);
      } else if (e.k === 'done') {
        view.showBanner('Sequence complete!', 'win', 1.4);
        const me = view.chars[e.s];
        view.fx.burstConfetti(me.pos.x, me.pos.y + 1.5, me.pos.z, 40);
      }
    }
    if (e.k === 'reveal') {
      // Show the correct order above the pads after each stage.
      const seen = {};
      e.seq.forEach((pad, k) => {
        seen[pad] = (seen[pad] ? seen[pad] + ' ' : '') + (k + 1);
      });
      for (const [pad, label] of Object.entries(seen)) {
        const sp = textSprite(label, { color: '#ffffff', size: 0.9, w: 384, h: 128 });
        sp.position.set(pads[pad].x, PAD_TOP + 1.8, pads[pad].z);
        view.scene.add(sp);
        view.orderLabels.push({ sp, t: 2 });
      }
    }
  },

  hud(view) {
    const gs = view.gs;
    const me = view.chars[view.mySlot];
    const ex = me && Array.isArray(me.extra) ? me.extra : [0, 3, 0, 1];
    const tNow = view.tNow();
    let prompt = null;
    if (gs.ph === 'show') {
      const k = Math.min(gs.L, Math.floor((tNow - gs.t0) / gs.sh) + 1);
      prompt = { symbol: '?', label: `Watch closely · ${Math.max(0, k)} of ${gs.L}`, color: '#c9d3ff' };
    } else if (gs.ph === 'input' && me && me.flags & FLAG.ALIVE) {
      const left = Math.max(0, gs.te - tNow);
      prompt = ex[3] === 0
        ? { symbol: String(ex[2] + 1), label: `Jump onto pad ${ex[2] + 1} of ${gs.L} · ${left.toFixed(0)}s`, color: '#7ef0c3' }
        : ex[3] === 1 ? { symbol: '✓', label: 'Done! Waiting for the others', color: '#3ddc97' } : { symbol: '✗', label: 'Missed this one', color: '#ff5da2' };
    }
    const hearts = (h) => (h > 0 ? '♥'.repeat(h) : 'Out');
    return {
      lines: [
        { label: 'Stage', value: `${gs.st} · ${gs.L} pads` },
        me ? { label: 'Your hearts', value: hearts(ex[1]) } : null,
        me ? { label: 'Sequences done', value: ex[0] } : null,
      ].filter(Boolean),
      prompt,
      board: view.chars
        .map((c) => ({ c, ex: Array.isArray(c.extra) ? c.extra : [0, 3, 0, 1] }))
        .sort((a, b) => b.ex[0] - a.ex[0])
        .map(({ c, ex: x }) => ({ seat: c.seat, name: c.name, color: c.color, me: c.slot === view.mySlot, value: c.flags & FLAG.ALIVE ? `${x[0]} · ${'♥'.repeat(Math.max(0, x[1]))}` : `${x[0]} · out`, out: !(c.flags & FLAG.ALIVE) })),
      boardTitle: 'Sequences',
    };
  },
};
