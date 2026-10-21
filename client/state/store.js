// Minimal global store for UI state (React subscribes with useStore). High-frequency game
// state (positions, snapshots) never goes through here; only coarse UI state does.
import { useSyncExternalStore } from 'react';

export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const l of listeners) l();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useStore(store, selector = (s) => s) {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

// Application UI state.
export const app = createStore({
  screen: 'menu', // menu | create | join | customise | howto | settings | room
  connection: 'connecting', // connecting | online | offline | reconnecting
  busy: null, // label of an action in progress
  error: null,
  room: null, // public room state
  playerId: null,
  code: null,
  phase: null, // last phase message
  toasts: [],
  overlay: null, // 'pause' | null
  emotes: [], // recent emote events {pid, id, at}
  loadingRound: false,
});

// HUD state for the active round, updated ~10x per second by the round view.
export const hud = createStore({
  active: false,
  gameId: null,
  timeLeft: 0,
  countdown: 0,
  lines: [],
  me: null,
  banner: null,
  feed: [],
  board: [],
  prompt: null,
  cooldowns: [],
  spectating: null,
});

let toastId = 1;
export function toast(text, kind = 'info') {
  const id = toastId++;
  app.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  setTimeout(() => app.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
}
