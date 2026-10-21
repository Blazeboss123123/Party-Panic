// Server load test: several full rooms of eight bot clients play real rounds at the same
// time. The server runs in its own process so its timing is not affected by the bots.
// Reports server tick cost, snapshot rate/jitter and bandwidth per client.
//
// Usage: node tests/perf/load.mjs [rooms=4] [seconds=60]
import { spawn } from 'node:child_process';
import { NetClient, sleep } from '../bots/netClient.mjs';

const ROOMS = Number(process.argv[2] || 4);
const SECONDS = Number(process.argv[3] || 60);
const PORT = 41000 + Math.floor(Math.random() * 2000);

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PP_FAST: '1', PP_LOG: 'silent', PP_PHASE_SCALE: '0.3' },
  stdio: 'inherit',
});
const stopServer = () => { try { server.kill(); } catch { /* ignore */ } };
process.on('exit', stopServer);

async function health() {
  const r = await fetch(`http://127.0.0.1:${PORT}/health`);
  return r.json();
}
for (let i = 0; i < 50; i++) {
  try { await health(); break; } catch { await sleep(100); }
}

const url = `ws://127.0.0.1:${PORT}/ws`;
const bots = [];

function instrument(b) {
  b.bytes = 0;
  b.snapGaps = [];
  b.lastSnapAt = 0;
  b.ws.on('message', (data) => {
    b.bytes += data.length;
  });
  b.on('snap', () => {
    const t = performance.now();
    if (b.lastSnapAt && t - b.lastSnapAt < 500) b.snapGaps.push(t - b.lastSnapAt);
    b.lastSnapAt = t;
  });
}

for (let r = 0; r < ROOMS; r++) {
  const room = [];
  for (let i = 0; i < 8; i++) {
    const b = await new NetClient(url, `R${r}P${i}`).connect();
    instrument(b);
    room.push(b);
  }
  await room[0].create();
  for (const b of room.slice(1)) {
    await b.join(room[0].code);
    await b.request('ready', { ready: true });
  }
  await room[0].request('settings', { settings: { rounds: 15, repeats: true } });
  await room[0].request('start');
  bots.push(...room);
}
console.log(`${ROOMS} rooms × 8 players connected (${bots.length} sockets). Running for ${SECONDS}s…`);

// Bots: vote, report loaded, and wander with random movement, jumps and dashes.
const state = new Map(bots.map((b) => [b, { seq: 0, voted: -1, loaded: -1, mx: 0, mz: 0, until: 0 }]));
const drive = setInterval(() => {
  const t = performance.now();
  for (const b of bots) {
    const st = state.get(b);
    const ph = b.phase?.phase;
    if (ph === 'voting' && st.voted !== b.phase.round && b.phase.data.options?.length) {
      st.voted = b.phase.round;
      b.send({ type: 'vote', game: b.phase.data.options[Math.floor(Math.random() * b.phase.data.options.length)] });
    } else if (ph === 'intro' && st.loaded !== b.phase.data.roundId) {
      st.loaded = b.phase.data.roundId;
      b.send({ type: 'loaded', roundId: b.phase.data.roundId });
    } else if (ph === 'playing') {
      if (t > st.until) {
        const a = Math.random() * Math.PI * 2;
        st.mx = Math.sin(a); st.mz = Math.cos(a); st.until = t + 300 + Math.random() * 900;
      }
      let btn = 0;
      if (Math.random() < 0.02) btn |= 1 | 2; // jump
      if (Math.random() < 0.01) btn |= 4 | 8; // sprint / dash
      if (Math.random() < 0.02) btn |= 16 | 32; // act
      b.sendInputs([[++st.seq, st.mx, st.mz, btn, Math.random() - 0.5, Math.random() * 0.4]]);
    }
  }
}, 1000 / 60);

const t0 = performance.now();
let lastPrint = 0;
const ticks = [];
while ((performance.now() - t0) / 1000 < SECONDS) {
  await sleep(1000);
  const h = await health();
  ticks.push(h.tick.avgMs);
  const el = (performance.now() - t0) / 1000;
  if (el - lastPrint >= 10) {
    lastPrint = el;
    const phases = bots.filter((_, i) => i % 8 === 0).map((b) => b.phase?.phase).join(',');
    console.log(`  t=${el.toFixed(0)}s  tick avg ${h.tick.avgMs.toFixed(3)}ms (max ${h.tick.maxMs.toFixed(2)}ms)  rooms: ${phases}`);
  }
}
clearInterval(drive);

const elapsed = (performance.now() - t0) / 1000;
const h = await health();
const kbps = bots.map((b) => (b.bytes * 8) / 1000 / elapsed);
const gaps = bots.flatMap((b) => b.snapGaps).sort((a, b) => a - b);
const pct = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] || 0;
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log('\nResults');
console.log(`  server step (all ${ROOMS} rooms together): avg ${mean(ticks).toFixed(3)} ms, worst ${h.tick.maxMs.toFixed(2)} ms (budget 16.7 ms)`);
console.log(`  downstream per client: avg ${mean(kbps).toFixed(0)} kbit/s, max ${Math.max(...kbps).toFixed(0)} kbit/s (includes lobby/voting time)`);
console.log(`  snapshot interval: median ${pct(0.5).toFixed(1)} ms, p95 ${pct(0.95).toFixed(1)} ms, p99 ${pct(0.99).toFixed(1)} ms (target 33.3 ms)`);
for (const b of bots) b.close();
stopServer();
process.exit(0);
