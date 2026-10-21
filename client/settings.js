// Local, per-browser settings persisted in localStorage.
import { createStore } from './state/store.js';

export const ACTIONS = [
  { id: 'up', label: 'Move forward / aim up' },
  { id: 'down', label: 'Move back / aim down' },
  { id: 'left', label: 'Move left / aim left' },
  { id: 'right', label: 'Move right / aim right' },
  { id: 'jump', label: 'Jump / fire' },
  { id: 'sprint', label: 'Sprint / dash / fine aim' },
  { id: 'act', label: 'Action (grab, shove, pass)' },
  { id: 'emote', label: 'Emote wheel' },
];

export const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  act: ['KeyE'],
  emote: ['KeyT'],
};

const DEFAULTS = {
  graphics: 'high', // high | low
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  uiScale: 1,
  highContrast: false,
  colourAssist: false,
  cameraDistance: 1, // multiplier
  cameraSmoothing: 0.5, // 0 snappy .. 1 floaty
  aimSensitivity: 1,
  showFps: false,
  bindings: DEFAULT_BINDINGS,
  profile: null, // { name, cosmetic }
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem('pp-settings') || '{}');
    const merged = { ...DEFAULTS, ...raw };
    merged.bindings = { ...DEFAULT_BINDINGS, ...(raw.bindings || {}) };
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = createStore(load());

settings.subscribe(() => {
  try {
    localStorage.setItem('pp-settings', JSON.stringify(settings.get()));
  } catch {
    /* storage may be unavailable */
  }
});

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', Enter: 'Enter', Tab: 'Tab',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };
  return map[code] || code;
}
