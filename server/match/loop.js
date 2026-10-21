// One fixed-timestep loop for the whole server. Every active round is stepped at 60 Hz;
// the loop catches up after short stalls but never runs more than a few steps at once.
import { DT } from '../../shared/constants.js';

const tickers = new Set();
let running = false;
let last = 0;
let acc = 0;
let timer = null;

export const now = () => performance.now() / 1000;

export const loopStats = { ticks: 0, maxStepMs: 0, avgStepMs: 0 };

function frame() {
  const n = now();
  acc += n - last;
  last = n;
  let steps = 0;
  while (acc >= DT && steps < 5) {
    const t0 = performance.now();
    for (const fn of tickers) {
      try {
        fn(DT);
      } catch (err) {
        // Tickers handle their own errors; this is a last line of defence.
        console.error('tick error', err);
        tickers.delete(fn);
      }
    }
    const ms = performance.now() - t0;
    loopStats.ticks++;
    loopStats.maxStepMs = Math.max(loopStats.maxStepMs, ms);
    loopStats.avgStepMs = loopStats.avgStepMs * 0.99 + ms * 0.01;
    acc -= DT;
    steps++;
  }
  if (steps >= 5) acc = 0;
  if (!tickers.size) {
    running = false;
    timer = null;
    return;
  }
  const wait = Math.max(0, (DT - acc) * 1000 - 0.5);
  timer = setTimeout(frame, wait);
}

export function addTicker(fn) {
  tickers.add(fn);
  if (!running) {
    running = true;
    last = now();
    acc = 0;
    timer = setTimeout(frame, 0);
  }
}

export function removeTicker(fn) {
  tickers.delete(fn);
}

export function stopLoop() {
  tickers.clear();
  if (timer) clearTimeout(timer);
  running = false;
}
