// Lobby stage: eight pedestals in an arc. Also used behind voting, results and
// intermission screens, where characters react to their placements.
import * as THREE from 'three';
import { BaseView } from './baseView.js';
import { Character } from '../characters/character.js';
import { toon, cylGeo, roundedBoxGeo, canvasTexture, basic, cachedGeo, sphereGeo } from '../game/materials.js';
import { BODY_COLORS } from '../../shared/cosmetics.js';
import { MAX_PLAYERS } from '../../shared/constants.js';
import { settings } from '../settings.js';

function numberTexture(n) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2b1b5a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '400 92px "Bagel Fat One", Gabarito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), w / 2, h / 2 + 6);
  });
}

export class LobbyView extends BaseView {
  constructor(engine) {
    super(engine, 'stage', { cloudY: -10, spread: 70 });
    this.setShadowBounds(14, new THREE.Vector3(0, 0, -2));
    // Stage floor
    const stage = new THREE.Mesh(cylGeo(13, 13.4, 1, 64), toon('#ffd23f'));
    stage.position.set(0, -0.5, -2);
    stage.receiveShadow = true;
    this.scene.add(stage);
    const rim = new THREE.Mesh(cachedGeo('stage-rim', () => new THREE.TorusGeometry(13.2, 0.25, 10, 80)), toon('#ff5da2'));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0, -2);
    this.scene.add(rim);
    const inner = new THREE.Mesh(cylGeo(9, 9, 1.02, 64), toon('#fff3d6'));
    inner.position.set(0, -0.5, -2);
    inner.receiveShadow = true;
    this.scene.add(inner);
    const under = new THREE.Mesh(cachedGeo('stage-under', () => new THREE.ConeGeometry(13, 14, 48)), toon('#8b5cf6'));
    under.rotation.x = Math.PI;
    under.position.set(0, -8, -2);
    this.scene.add(under);

    // Backdrop arch with bulbs
    this.bulbs = [];
    const arch = new THREE.Group();
    arch.position.set(0, 0, -9.5);
    const archMat = toon('#ff5da2');
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(roundedBoxGeo(1.2, 9, 1.2, 0.2), archMat);
      post.position.set(s * 10.5, 4.5, 0);
      post.castShadow = true;
      arch.add(post);
    }
    const beam = new THREE.Mesh(roundedBoxGeo(22.2, 1.4, 1.2, 0.2), archMat);
    beam.position.y = 9.2;
    arch.add(beam);
    for (let i = 0; i < 26; i++) {
      const b = new THREE.Mesh(sphereGeo(0.16, 10, 8), basic('#fff6b0'));
      const t = i / 25;
      if (t < 0.33) b.position.set(-10.5, 0.8 + (t / 0.33) * 8, 0.65);
      else if (t < 0.67) b.position.set(-10.5 + ((t - 0.33) / 0.34) * 21, 9.2, 0.75);
      else b.position.set(10.5, 9 - ((t - 0.67) / 0.33) * 8, 0.65);
      arch.add(b);
      this.bulbs.push(b);
    }
    this.scene.add(arch);

    // Pedestals
    this.slots = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const x = (i - (MAX_PLAYERS - 1) / 2) * 2.05;
      const z = -3.2 + (x / 7.2) * (x / 7.2) * 2.4;
      const ped = new THREE.Group();
      ped.position.set(x, 0, z);
      ped.rotation.y = Math.atan2(-x * 0.5, 16 - z);
      const base = new THREE.Mesh(cylGeo(1.05, 1.15, 0.7, 32), toon('#2b1b5a'));
      base.position.y = 0.35;
      base.castShadow = true;
      base.receiveShadow = true;
      const top = new THREE.Mesh(cylGeo(1.0, 1.0, 0.12, 32), toon('#ffffff'));
      top.position.y = 0.76;
      top.receiveShadow = true;
      const plate = new THREE.Mesh(cachedGeo('ped-plate', () => new THREE.PlaneGeometry(0.62, 0.62)), new THREE.MeshBasicMaterial({ map: numberTexture(i + 1) }));
      plate.position.set(0, 0.36, 1.13);
      ped.add(base, top, plate);
      // Ghost marker for an empty seat
      const ghost = new THREE.Mesh(cachedGeo('ped-ghost', () => new THREE.CapsuleGeometry(0.42, 0.45, 6, 16)), basic('#ffffff', { transparent: true, opacity: 0.18 }));
      ghost.position.y = 1.55;
      ped.add(ghost);
      // Ready lamp
      const lamp = new THREE.Mesh(sphereGeo(0.16, 12, 10), toon('#5b5f8a'));
      lamp.position.set(0.72, 0.85, 0.55);
      ped.add(lamp);
      this.scene.add(ped);
      this.slots.push({ ped, top: 0.82, ghost, lamp, char: null, pid: null, base, topMesh: top });
    }

    this.presets = {
      lobby: { pos: new THREE.Vector3(-3.6, 6.4, 15.5), look: new THREE.Vector3(-3.6, 1.7, -1) },
      center: { pos: new THREE.Vector3(0, 6.8, 16.5), look: new THREE.Vector3(0, 1.8, -1) },
      results: { pos: new THREE.Vector3(4.6, 6.0, 14.5), look: new THREE.Vector3(4.6, 1.6, -1.5) },
    };
    this.preset = 'lobby';
    this.camPos = this.presets.lobby.pos.clone();
    this.camLook = this.presets.lobby.look.clone();
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.moods = new Map();
    this.emoteQueue = [];
  }

  // players: room public player list
  setPlayers(players, myId) {
    const bySeat = new Map(players.map((p) => [p.seat, p]));
    this.slots.forEach((slot, i) => {
      const p = bySeat.get(i + 1);
      if (!p) {
        if (slot.char) {
          this.fx.puff(slot.ped.position.x, 1.5, slot.ped.position.z, 10);
          slot.ped.remove(slot.char.root);
          slot.char.dispose();
          slot.char = null;
          slot.pid = null;
        }
        slot.ghost.visible = true;
        slot.lamp.material = toon('#5b5f8a');
        return;
      }
      slot.ghost.visible = false;
      if (!slot.char || slot.pid !== p.id) {
        if (slot.char) { slot.ped.remove(slot.char.root); slot.char.dispose(); }
        slot.char = new Character(p.cosmetic);
        slot.char.root.position.y = slot.top;
        slot.ped.add(slot.char.root);
        slot.pid = p.id;
        slot.key = '';
        if (!settings.get().reducedMotion) this.fx.burstConfetti(slot.ped.position.x, 1.5, slot.ped.position.z, 30, [BODY_COLORS[p.cosmetic.color].hex, '#ffffff', '#ffd23f'], 5);
      }
      const key = JSON.stringify([p.cosmetic, p.name, p.connected]);
      if (slot.key !== key) {
        slot.char.setCosmetic(p.cosmetic);
        slot.char.setNameTag(p.name + (p.id === myId ? ' (you)' : ''), p.seat);
        slot.key = key;
      }
      slot.char.root.visible = true;
      slot.connected = p.connected;
      slot.lamp.material = toon(p.connected ? (p.ready ? '#3ddc97' : '#ffd23f') : '#e8364f', { emissive: p.ready ? '#1f8a5c' : '#000000', emissiveIntensity: 0.6 });
    });
  }

  setPreset(name) {
    this.preset = name;
  }

  setMoods(map) {
    this.moods = map || new Map();
  }

  emote(pid, id) {
    const slot = this.slots.find((s) => s.pid === pid);
    if (slot && slot.char) slot.char.emote(id);
  }

  update(dt) {
    super.update(dt);
    for (let i = 0; i < this.bulbs.length; i++) {
      const on = Math.sin(this.time * 4 + i * 0.9) > 0;
      this.bulbs[i].material = basic(on ? '#fff6b0' : '#ff9fc9');
    }
    for (const slot of this.slots) {
      if (!slot.char) continue;
      const mood = this.moods.get(slot.pid);
      slot.char.update(dt, { speed: 0, grounded: true, mood: slot.connected === false ? 'sad' : mood });
      slot.char.root.rotation.y = Math.sin(this.time * 0.6 + slot.ped.position.x) * 0.15;
      slot.char.root.position.y = slot.top;
      slot.char.root.scale.setScalar(slot.connected === false ? 0.9 : 1);
    }
    const pr = this.presets[this.preset] || this.presets.lobby;
    const k = 1 - Math.exp(-dt * 2.2);
    this.camPos.lerp(pr.pos, k);
    this.camLook.lerp(pr.look, k);
    const sway = settings.get().reducedMotion ? 0 : Math.sin(this.time * 0.25) * 0.6;
    this.camera.position.set(this.camPos.x + sway, this.camPos.y, this.camPos.z);
    this.camera.lookAt(this.camLook);
  }

  celebrate(pids) {
    for (const slot of this.slots) {
      if (slot.char && pids.includes(slot.pid)) {
        this.fx.burstConfetti(slot.ped.position.x, 2.5, slot.ped.position.z, 60);
      }
    }
  }

  dispose() {
    super.dispose();
    for (const s of this.slots) if (s.char) s.char.dispose();
  }
}
