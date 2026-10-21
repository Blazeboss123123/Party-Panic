// Server configuration from environment variables.
import { PHASE_TIME } from '../shared/constants.js';

const fast = process.env.PP_FAST === '1';
const phaseScale = Number(process.env.PP_PHASE_SCALE || (fast ? 0.2 : 1));

export const CONFIG = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  phaseScale,
  durationScale: Number(process.env.PP_DURATION_SCALE || 1),
  countdown: Math.max(0.5, PHASE_TIME.countdown * (fast ? 0.34 : 1)),
  // Comma-separated game ids to force as the first voting options (testing only).
  forceGames: (process.env.PP_FORCE_GAMES || '').split(',').map((s) => s.trim()).filter(Boolean),
  reconnectGrace: Number(process.env.PP_RECONNECT_GRACE || 60),
  emptyRoomTtl: Number(process.env.PP_EMPTY_ROOM_TTL || 120),
  maxRooms: Number(process.env.PP_MAX_ROOMS || 500),
  logLevel: process.env.PP_LOG || 'info',
};

export function phaseSeconds(key) {
  return PHASE_TIME[key] * CONFIG.phaseScale;
}

export function log(...args) {
  if (CONFIG.logLevel !== 'silent') console.log(new Date().toISOString().slice(11, 19), ...args);
}
