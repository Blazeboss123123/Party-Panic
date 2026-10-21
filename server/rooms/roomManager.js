// Creates, finds and cleans up rooms.
import crypto from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/constants.js';
import { Room } from './room.js';
import { CONFIG, log } from '../config.js';
import { now } from '../match/loop.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.sweeper = setInterval(() => this.sweep(), 10_000);
    this.sweeper.unref?.();
  }

  generateCode() {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  createRoom() {
    if (this.rooms.size >= CONFIG.maxRooms) return null;
    const code = this.generateCode();
    if (!code) return null;
    const room = new Room(code, this);
    this.rooms.set(code, room);
    log(`room ${code} created (${this.rooms.size} active)`);
    return room;
  }

  get(code) {
    if (typeof code !== 'string') return null;
    return this.rooms.get(code.trim().toUpperCase()) || null;
  }

  closeRoom(code, message) {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    room.close(message);
    log(`room ${code} closed (${this.rooms.size} active)`);
  }

  sweep() {
    const t = now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && t - room.emptySince > CONFIG.emptyRoomTtl) this.closeRoom(code);
    }
  }

  dispose(message) {
    clearInterval(this.sweeper);
    for (const code of [...this.rooms.keys()]) this.closeRoom(code, message);
  }
}
