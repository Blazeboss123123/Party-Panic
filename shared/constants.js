// Constants shared by the server, the client and the tests.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // 30 snapshots per second
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const ROUND_OPTIONS = [5, 10, 15];

// Placement points: index 0 is 1st place.
export const PLACEMENT_POINTS = [10, 8, 7, 6, 5, 4, 3, 2];

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export const NAME_MAX = 16;

// Character collision sphere radius (metres). Feet are at ch.y, sphere centre at ch.y + CHAR_R.
export const CHAR_R = 0.5;
export const CHAR_HEIGHT = 1.5;

// Input button bit flags. "_P" flags are edge-triggered (pressed this input tick).
export const BTN = {
  JUMP: 1,
  JUMP_P: 2,
  SPRINT: 4,
  SPRINT_P: 8,
  ACT: 16,
  ACT_P: 32,
  UP_P: 64,
  DOWN_P: 128,
  LEFT_P: 256,
  RIGHT_P: 512,
};
export const EDGE_MASK = BTN.JUMP_P | BTN.SPRINT_P | BTN.ACT_P | BTN.UP_P | BTN.DOWN_P | BTN.LEFT_P | BTN.RIGHT_P;

// Server tournament phases.
export const PHASE = {
  LOBBY: 'lobby',
  PREMATCH: 'prematch',
  VOTING: 'voting',
  REVEAL: 'reveal',
  INTRO: 'intro',
  PLAYING: 'playing', // includes the synchronised 3-second countdown (round time < 0)
  RESOLVE: 'resolve',
  RESULTS: 'results',
  INTERMISSION: 'intermission',
  FINAL: 'final',
};

// Phase durations in seconds. The server may scale these in test mode.
export const PHASE_TIME = {
  prematch: 3.5,
  voting: 13,
  reveal: 3,
  introMin: 6,
  introMax: 16,
  countdown: 3,
  resolve: 2.2,
  results: 9,
  intermission: 6,
};

export const RECONNECT_GRACE = 60; // seconds a disconnected player keeps their seat
export const ROUND_DISCONNECT_FORFEIT = 10; // seconds disconnected mid-round before forfeiting the round
export const EMPTY_ROOM_TTL = 120; // seconds an empty room is kept

// Character flags in snapshots.
export const FLAG = {
  GROUNDED: 1,
  ALIVE: 2,
  FINISHED: 4,
  CONNECTED: 8,
  SPRINTING: 16,
  CARRYING: 32,
  STUNNED: 64,
  SPECIAL: 128, // game specific (bomb holder, rope grip, ...)
  KNOCKED: 256,
  DASHING: 512,
  FROZEN: 1024,
  HIDDEN: 2048,
};

// Emotes available in the lobby and between rounds.
export const EMOTES = [
  { id: 'wave', label: 'Wave' },
  { id: 'dance', label: 'Dance' },
  { id: 'laugh', label: 'Laugh' },
  { id: 'cheer', label: 'Cheer' },
  { id: 'sad', label: 'Sulk' },
  { id: 'taunt', label: 'Taunt' },
];
