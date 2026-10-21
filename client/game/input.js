// Keyboard input with remappable bindings and edge detection.
//
// Key events are timestamped and replayed at each fixed input tick, so the simulation sees
// when a key went down or up even when several ticks are processed in one slow frame.
// Without this, at a low frame rate a short tap could be lost or stretched to a whole frame.
import { settings } from '../settings.js';

const live = new Set(); // keys physically held right now
const down = new Set(); // key state as of the current input tick
const log = []; // [time, code, isDown] events not yet replayed
const pressedQueue = new Set(); // codes pressed since the last consumePressed()
let enabled = true;
let typingTarget = false;

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function eventTime(e) {
  const now = performance.now();
  const ts = e.timeStamp;
  // timeStamp shares performance.now()'s origin in current browsers; fall back if it looks off.
  return (ts > now - 1000 && ts <= now + 1 ? ts : now) / 1000;
}

function record(t, code, isDown) {
  log.push([t, code, isDown]);
  if (log.length > 256) advanceInputTo(Infinity); // nobody is replaying (menus): keep it bounded
}

// Applies key events up to time t (seconds, performance.now() clock) to the tick state.
export function advanceInputTo(t) {
  let i = 0;
  for (; i < log.length && log[i][0] <= t; i++) {
    const [, code, isDown] = log[i];
    if (isDown) {
      if (!down.has(code)) pressedQueue.add(code);
      down.add(code);
    } else {
      down.delete(code);
    }
  }
  if (i) log.splice(0, i);
}

function resetAll() {
  live.clear();
  down.clear();
  log.length = 0;
  pressedQueue.clear();
}

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) { typingTarget = true; return; }
    typingTarget = false;
    if (!live.has(e.code)) record(eventTime(e), e.code, true);
    live.add(e.code);
    // Stop the page scrolling with game keys while playing.
    if (enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (live.has(e.code)) record(eventTime(e), e.code, false);
    live.delete(e.code);
  });
  window.addEventListener('blur', resetAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetAll();
  });
}

export function setInputEnabled(v) {
  enabled = v;
  if (!v) resetAll();
}

function bound(action) {
  return settings.get().bindings[action] || [];
}

export function isDown(action) {
  if (!enabled) return false;
  for (const code of bound(action)) if (down.has(code)) return true;
  return false;
}

// Returns which actions were pressed since the last call and clears the queue.
export function consumePressed() {
  const out = new Set();
  if (!enabled) { pressedQueue.clear(); return out; }
  const b = settings.get().bindings;
  for (const code of pressedQueue) {
    for (const action in b) if (b[action].includes(code)) out.add(action);
  }
  pressedQueue.clear();
  return out;
}

// Drops pending presses (phase changes) so a press from the previous screen cannot leak
// into the next one. Keys still held stay held.
export function clearInput() {
  log.length = 0;
  pressedQueue.clear();
  down.clear();
  for (const code of live) down.add(code);
}

export function anyTyping() {
  return typingTarget;
}
