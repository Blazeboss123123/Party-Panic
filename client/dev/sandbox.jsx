// Developer sandbox (not part of the game UI): runs a minigame's authoritative server round
// in the page and feeds serialized snapshots to the normal client RoundView, so each
// minigame can be inspected and screenshotted without a multiplayer session.
// Open /sandbox.html?game=dash-cash&n=4
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/styles.css';
import { Engine } from '../game/engine.js';
import { RoundView } from '../game/roundView.js';
import { initInput } from '../game/input.js';
import { Round } from '../../server/match/round.js';
import { DT } from '../../shared/constants.js';
import { defaultCosmetic } from '../../shared/cosmetics.js';
import { Hud } from '../ui/Hud.jsx';
import { ctx } from '../ui/components.jsx';
import { BRAINS } from '../../tests/bots/brains.mjs';

const q = new URLSearchParams(location.search);
const gameId = q.get('game') || 'floor-gone';
const n = Math.max(1, Math.min(8, Number(q.get('n') || 4)));
const seed = Number(q.get('seed') || 1234);
const bots = q.get('bots') !== '0';

class LocalConn {
  constructor() { this.rtt = 0.05; this.round = null; }
  serverNow() { return performance.now() / 1000; }
  send(m) { if (m.type === 'in' && this.round) this.round.pushInputs('me', m.i); }
}

async function boot() {
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  initInput();
  const engine = new Engine(document.getElementById('scene'));
  ctx.engine = engine;
  const conn = new LocalConn();
  ctx.session = { conn };
  const roster = Array.from({ length: n }, (_, i) => ({ pid: i === 0 ? 'me' : 'bot' + i, name: i === 0 ? 'You' : `Bot ${i}`, team: i % 2 }));
  const R = new Round({ gameId, seed, roster, countdown: 1 });
  conn.round = R;
  const players = new Map(roster.map((r, i) => [r.pid, { id: r.pid, seat: i + 1, cosmetic: defaultCosmetic(i * 3 + 1) }]));
  const view = new RoundView(engine, { conn, start: R.startInfo(), myId: 'me', players, phase: 'playing' });
  view.setPlaying(conn.serverNow() + 1);
  engine.setView(view);
  window.__sandbox = { R, view, engine };
  const brain = BRAINS[gameId] || BRAINS.idle;
  const mem = roster.map(() => ({}));
  const seqs = roster.map(() => 0);
  let acc = 0, last = performance.now();
  setInterval(() => {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= DT) {
      acc -= DT;
      if (bots) {
        for (const p of R.players) {
          if (p.pid === 'me') continue;
          const inp = brain(R, p, mem[p.slot], R.tickN) || { mx: 0, mz: 0, b: 0 };
          seqs[p.slot]++;
          R.pushInputs(p.pid, [[seqs[p.slot], inp.mx || 0, inp.mz || 0, inp.b || 0, inp.ay || 0, inp.ap || 0]]);
        }
      }
      R.step(DT);
      if (R.tickN % 2 === 0 || R.ended) {
        const s = R.snapshot();
        const me = R.byPid.get('me');
        view.onSnap(JSON.parse(`${s.head},"me":${JSON.stringify(s.me(me))}}`));
      }
    }
  }, 1000 / 120);
  createRoot(document.getElementById('ui')).render(<Hud />);
  document.getElementById('boot')?.remove();
}
boot();
