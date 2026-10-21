// Procedural cartoon characters ("Panics"): a rounded bean body with big eyes, stubby arms
// and feet, plus cosmetic hats, glasses and faces. Animation is procedural.
import * as THREE from 'three';
import { BODY_COLORS, HATS, GLASSES, FACES } from '../../shared/cosmetics.js';
import { toon, toonUnique, outlineMat, sphereGeo, cylGeo, cachedGeo, shade, canvasTexture, basic } from '../game/materials.js';
import { clamp, lerp } from '../../shared/math.js';

const BODY_R = 0.46;
const BODY_LEN = 0.46;
const BODY_Y = 0.78;
const HEAD_TOP = BODY_Y + BODY_LEN / 2 + BODY_R; // 1.47

const bodyGeo = () => cachedGeo('char-body', () => new THREE.CapsuleGeometry(BODY_R, BODY_LEN, 10, 28));
const bellyGeo = () => cachedGeo('char-belly', () => {
  const g = new THREE.SphereGeometry(0.33, 24, 16);
  g.scale(1, 1.15, 0.45);
  return g;
});
const armGeo = () => cachedGeo('char-arm', () => new THREE.CapsuleGeometry(0.095, 0.26, 6, 12));
const footGeo = () => cachedGeo('char-foot', () => {
  const g = new THREE.SphereGeometry(0.17, 16, 12);
  g.scale(1, 0.62, 1.35);
  return g;
});

function starShape(outer, inner, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

// ------------------------------------------------------------------ hats

function buildHat(id, bodyHex) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (id) {
    case 'party': {
      const tex = cachedGeo('tex-party', () => {
        const t = canvasTexture(128, 128, (ctx, w, h) => {
          ctx.fillStyle = '#ff5da2'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#ffd23f';
          for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 24, w, 10);
          ctx.fillStyle = '#1fc8c1';
          for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc((i * 37) % w, (i * 53) % h, 5, 0, 7); ctx.fill(); }
        });
        return t;
      });
      const cone = add(cachedGeo('hat-party', () => new THREE.ConeGeometry(0.22, 0.52, 24)), toon('#ffffff', { map: tex }), 0, 0.24, 0);
      cone.rotation.z = -0.12;
      add(sphereGeo(0.075), toon('#ffd23f'), -0.06, 0.52, 0);
      break;
    }
    case 'tophat': {
      add(cylGeo(0.36, 0.36, 0.04), toon('#2b1b5a'), 0, 0.01, 0);
      add(cylGeo(0.23, 0.24, 0.42), toon('#2b1b5a'), 0, 0.23, 0);
      add(cylGeo(0.245, 0.245, 0.08), toon('#ff5da2'), 0, 0.08, 0);
      break;
    }
    case 'crown': {
      const gold = toon('#ffc93c', { emissive: '#5a3a00', emissiveIntensity: 0.25 });
      add(cachedGeo('hat-crownband', () => new THREE.CylinderGeometry(0.27, 0.25, 0.14, 24, 1, true)), gold, 0, 0.06, 0).material = toon('#ffc93c', { side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(cachedGeo('hat-crownspike', () => new THREE.ConeGeometry(0.07, 0.17, 8)), gold, Math.sin(a) * 0.25, 0.2, Math.cos(a) * 0.25);
        add(sphereGeo(0.035, 10, 8), toon(i % 2 ? '#e8364f' : '#4da3ff'), Math.sin(a) * 0.265, 0.07, Math.cos(a) * 0.265);
      }
      break;
    }
    case 'propeller': {
      const cap = add(cachedGeo('hat-capdome', () => new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), toon('#4da3ff'), 0, -0.02, 0);
      cap.scale.set(1, 0.7, 1);
      add(cachedGeo('hat-capbrim', () => { const gg = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20, 1, false, -0.9, 1.8); return gg; }), toon('#ffd23f'), 0, 0.0, 0.2);
      add(cylGeo(0.025, 0.025, 0.14, 8), toon('#2b1b5a'), 0, 0.25, 0);
      const prop = new THREE.Group();
      prop.position.y = 0.33;
      for (const s of [-1, 1]) {
        const blade = new THREE.Mesh(cachedGeo('hat-blade', () => new THREE.BoxGeometry(0.28, 0.02, 0.07)), toon(s > 0 ? '#e8364f' : '#ffd23f'));
        blade.position.x = s * 0.14;
        prop.add(blade);
      }
      g.add(prop);
      g.userData.spin = prop;
      break;
    }
    case 'viking': {
      const helm = add(cachedGeo('hat-helm', () => new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), toon('#9aa3b8'), 0, -0.1, 0);
      helm.scale.set(1, 0.8, 1);
      add(cachedGeo('hat-helmband', () => new THREE.TorusGeometry(0.33, 0.035, 8, 28)), toon('#c08457'), 0, -0.08, 0).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const horn = add(cachedGeo('hat-horn', () => {
          const gg = new THREE.ConeGeometry(0.07, 0.34, 12);
          gg.translate(0, 0.17, 0);
          return gg;
        }), toon('#fff3d6'), s * 0.3, 0.02, 0);
        horn.rotation.z = -s * 0.9;
      }
      break;
    }
    case 'chef': {
      add(cylGeo(0.24, 0.24, 0.16), toon('#ffffff'), 0, 0.06, 0);
      for (const [x, z] of [[-0.12, 0], [0.12, 0], [0, 0.1], [0, -0.1], [0, 0]]) add(sphereGeo(0.16, 16, 12), toon('#ffffff'), x, 0.24, z);
      break;
    }
    case 'flower': {
      const f = new THREE.Group();
      f.position.set(0.12, 0.05, 0.08);
      f.rotation.set(-0.3, 0, -0.35);
      const stem = new THREE.Mesh(cylGeo(0.02, 0.02, 0.2, 6), toon('#3ddc97'));
      stem.position.y = 0.08;
      f.add(stem);
      const center = new THREE.Mesh(sphereGeo(0.06, 12, 10), toon('#ffd23f'));
      center.position.y = 0.2;
      f.add(center);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const pet = new THREE.Mesh(cachedGeo('hat-petal', () => { const gg = new THREE.SphereGeometry(0.06, 10, 8); gg.scale(1.6, 0.35, 0.8); return gg; }), toon('#ffffff'));
        pet.position.set(Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1);
        pet.rotation.y = -a;
        f.add(pet);
      }
      g.add(f);
      break;
    }
    case 'bunny': {
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(s * 0.15, -0.04, -0.02);
        ear.rotation.z = -s * 0.22;
        const outer = new THREE.Mesh(cachedGeo('hat-ear', () => { const gg = new THREE.CapsuleGeometry(0.075, 0.32, 6, 12); gg.scale(1, 1, 0.55); return gg; }), toon('#ffffff'));
        outer.position.y = 0.24;
        const inner = new THREE.Mesh(cachedGeo('hat-earin', () => { const gg = new THREE.CapsuleGeometry(0.04, 0.24, 6, 10); gg.scale(1, 1, 0.4); return gg; }), toon('#ffb3d1'));
        inner.position.set(0, 0.24, 0.035);
        ear.add(outer, inner);
        g.add(ear);
      }
      break;
    }
    case 'cone': {
      add(cachedGeo('hat-tcbase', () => new THREE.BoxGeometry(0.42, 0.05, 0.42)), toon('#ff6a1a'), 0, 0.0, 0);
      add(cachedGeo('hat-tc', () => new THREE.CylinderGeometry(0.04, 0.2, 0.48, 20)), toon('#ff6a1a'), 0, 0.26, 0);
      add(cachedGeo('hat-tcband', () => new THREE.CylinderGeometry(0.11, 0.135, 0.09, 20)), toon('#ffffff'), 0, 0.3, 0);
      break;
    }
    case 'beanie': {
      const dome = add(cachedGeo('hat-beanie', () => new THREE.SphereGeometry(0.33, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), toon(shade(bodyHex, -0.35)), 0, -0.1, 0);
      dome.scale.set(1, 0.95, 1);
      add(cachedGeo('hat-beaniefold', () => new THREE.TorusGeometry(0.32, 0.06, 10, 28)), toon('#fff3d6'), 0, -0.08, 0).rotation.x = Math.PI / 2;
      add(sphereGeo(0.1, 14, 10), toon('#fff3d6'), 0, 0.24, 0);
      break;
    }
    default:
      break;
  }
  return g;
}

// ------------------------------------------------------------------ glasses

function buildGlasses(id) {
  const g = new THREE.Group();
  const ring = (r, t, color, x) => {
    const m = new THREE.Mesh(cachedGeo(`gl-ring${r}${t}`, () => new THREE.TorusGeometry(r, t, 8, 24)), toon(color));
    m.position.x = x;
    g.add(m);
    return m;
  };
  switch (id) {
    case 'round':
      ring(0.12, 0.022, '#2b1b5a', -0.15);
      ring(0.12, 0.022, '#2b1b5a', 0.15);
      {
        const bridge = new THREE.Mesh(cylGeo(0.015, 0.015, 0.08, 6), toon('#2b1b5a'));
        bridge.rotation.z = Math.PI / 2;
        g.add(bridge);
      }
      break;
    case 'shades': {
      for (const s of [-1, 1]) {
        const lens = new THREE.Mesh(cachedGeo('gl-shade', () => { const gg = new THREE.CylinderGeometry(0.13, 0.11, 0.04, 20); gg.rotateX(Math.PI / 2); gg.scale(1.15, 0.8, 1); return gg; }), toon('#1a1033'));
        lens.position.x = s * 0.155;
        g.add(lens);
      }
      const bar = new THREE.Mesh(cachedGeo('gl-bar', () => new THREE.BoxGeometry(0.62, 0.035, 0.03)), toon('#1a1033'));
      bar.position.y = 0.07;
      g.add(bar);
      break;
    }
    case 'star':
      for (const s of [-1, 1]) {
        const st = new THREE.Mesh(cachedGeo('gl-star', () => {
          const gg = new THREE.ExtrudeGeometry(starShape(0.15, 0.07), { depth: 0.03, bevelEnabled: false });
          gg.translate(0, 0, -0.015);
          return gg;
        }), toon('#ff5da2'));
        st.position.x = s * 0.16;
        g.add(st);
        const lens = new THREE.Mesh(cachedGeo('gl-starlens', () => new THREE.CircleGeometry(0.075, 16)), basic('#bdf4ff', { transparent: true, opacity: 0.55 }));
        lens.position.set(s * 0.16, 0, 0.02);
        g.add(lens);
      }
      break;
    case 'visor': {
      const v = new THREE.Mesh(cachedGeo('gl-visor', () => new THREE.CylinderGeometry(0.5, 0.5, 0.13, 32, 1, true, -0.85, 1.7)), basic('#3ee7ff', { transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      v.position.z = -0.42;
      g.add(v);
      break;
    }
    case 'monocle': {
      ring(0.11, 0.02, '#ffc93c', 0.15);
      const lens = new THREE.Mesh(cachedGeo('gl-monolens', () => new THREE.CircleGeometry(0.1, 20)), basic('#dff8ff', { transparent: true, opacity: 0.4 }));
      lens.position.set(0.15, 0, 0.01);
      g.add(lens);
      const chain = new THREE.Mesh(cylGeo(0.008, 0.008, 0.36, 4), toon('#ffc93c'));
      chain.position.set(0.24, -0.2, -0.02);
      chain.rotation.z = 0.35;
      g.add(chain);
      break;
    }
    default:
      break;
  }
  return g;
}

// ------------------------------------------------------------------ mouths

function buildMouth(id) {
  const g = new THREE.Group();
  const ink = toon('#2b1b5a');
  switch (id) {
    case 'grin': {
      const m = new THREE.Mesh(cachedGeo('mouth-grin', () => new THREE.CircleGeometry(0.11, 20, Math.PI, Math.PI)), toon('#2b1b5a', { side: THREE.DoubleSide }));
      g.add(m);
      const tongue = new THREE.Mesh(cachedGeo('mouth-tongue', () => new THREE.CircleGeometry(0.055, 14, Math.PI, Math.PI)), toon('#ff7aa8', { side: THREE.DoubleSide }));
      tongue.position.set(0, -0.045, 0.002);
      g.add(tongue);
      break;
    }
    case 'cat':
      for (const s of [-1, 1]) {
        const arc = new THREE.Mesh(cachedGeo('mouth-cat', () => new THREE.TorusGeometry(0.045, 0.014, 6, 14, Math.PI)), ink);
        arc.rotation.z = Math.PI;
        arc.position.x = s * 0.045;
        g.add(arc);
      }
      break;
    case 'wow': {
      const o = new THREE.Mesh(cachedGeo('mouth-wow', () => new THREE.TorusGeometry(0.045, 0.02, 8, 18)), ink);
      o.scale.set(1, 1.3, 1);
      g.add(o);
      break;
    }
    default: {
      const arc = new THREE.Mesh(cachedGeo('mouth-smile', () => new THREE.TorusGeometry(0.09, 0.017, 6, 18, Math.PI * 0.8)), ink);
      arc.rotation.z = Math.PI + Math.PI * 0.1;
      g.add(arc);
    }
  }
  return g;
}

// ------------------------------------------------------------------ name tag

export function makeNameTag(name, seat, colorHex) {
  const tex = canvasTexture(512, 112, (ctx, w, h) => {
    ctx.font = '700 46px Gabarito, "Trebuchet MS", sans-serif';
    const tw = Math.min(380, ctx.measureText(name).width);
    const bw = tw + 120;
    const x0 = (w - bw) / 2;
    ctx.fillStyle = 'rgba(43,27,90,0.88)';
    roundRect(ctx, x0, 18, bw, 76, 38);
    ctx.fill();
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(x0 + 40, 56, 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b1b5a';
    ctx.font = '400 36px "Bagel Fat One", Gabarito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(seat), x0 + 40, 58);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 46px Gabarito, "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(name, x0 + 82, 58, 380);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.2, 0.2 * (112 / 512), 1);
  sprite.renderOrder = 10;
  sprite.userData.ownMaterial = true;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ------------------------------------------------------------------ rig

export class Character {
  constructor(cosmetic, { outline = true, shadow = true } = {}) {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group(); // squash / lean / tumble
    this.root.add(this.pivot);
    this.bodyMat = toonUnique('#ffffff');
    this.bellyMat = toonUnique('#ffffff');
    this.footMat = toonUnique('#ffffff');

    this.body = new THREE.Mesh(bodyGeo(), this.bodyMat);
    this.body.position.y = BODY_Y;
    this.body.castShadow = shadow;
    this.pivot.add(this.body);
    if (outline) {
      this.outline = new THREE.Mesh(bodyGeo(), outlineMat);
      this.outline.position.y = BODY_Y;
      this.outline.scale.setScalar(1.075);
      this.pivot.add(this.outline);
    }
    this.belly = new THREE.Mesh(bellyGeo(), this.bellyMat);
    this.belly.position.set(0, BODY_Y - 0.16, BODY_R - 0.12);
    this.pivot.add(this.belly);

    // Face
    this.face = new THREE.Group();
    this.face.position.set(0, 0, 0);
    this.pivot.add(this.face);
    this.eyes = new THREE.Group();
    this.eyes.position.set(0, 1.0, 0);
    this.face.add(this.eyes);
    for (const s of [-1, 1]) {
      const white = new THREE.Mesh(sphereGeo(0.115, 18, 14), toon('#ffffff'));
      white.position.set(s * 0.155, 0, 0.39);
      white.scale.set(1, 1.15, 0.7);
      const pupil = new THREE.Mesh(sphereGeo(0.062, 14, 10), toon('#1a1033'));
      pupil.position.set(s * 0.15, -0.01, 0.465);
      pupil.scale.set(1, 1.2, 0.6);
      const glint = new THREE.Mesh(sphereGeo(0.022, 8, 6), basic('#ffffff'));
      glint.position.set(s * 0.15 + 0.025, 0.035, 0.5);
      this.eyes.add(white, pupil, glint);
    }
    this.cheeks = [];
    for (const s of [-1, 1]) {
      const ch = new THREE.Mesh(cachedGeo('cheek', () => new THREE.CircleGeometry(0.06, 16)), basic('#ff8fb8', { transparent: true, opacity: 0.6 }));
      ch.position.set(s * 0.27, 0.86, 0.405);
      ch.rotation.y = s * 0.55;
      this.face.add(ch);
    }
    this.mouthAnchor = new THREE.Group();
    this.mouthAnchor.position.set(0, 0.84, 0.455);
    this.mouthAnchor.rotation.x = -0.1;
    this.face.add(this.mouthAnchor);
    this.glassesAnchor = new THREE.Group();
    this.glassesAnchor.position.set(0, 1.0, 0.49);
    this.face.add(this.glassesAnchor);
    this.hatAnchor = new THREE.Group();
    this.hatAnchor.position.set(0, HEAD_TOP - 0.06, 0);
    this.pivot.add(this.hatAnchor);

    // Limbs
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * (BODY_R - 0.02), BODY_Y + 0.02, 0);
      const arm = new THREE.Mesh(armGeo(), this.bodyMat);
      arm.position.set(s * 0.08, -0.17, 0);
      arm.rotation.z = s * 0.35;
      arm.castShadow = shadow;
      shoulder.add(arm);
      this.pivot.add(shoulder);
      this.arms.push(shoulder);
    }
    this.feet = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.19, 0.2, 0);
      const foot = new THREE.Mesh(footGeo(), this.footMat);
      foot.position.set(0, -0.12, 0.05);
      foot.castShadow = shadow;
      hip.add(foot);
      this.root.add(hip);
      this.feet.push(hip);
    }

    // Stun stars
    this.stars = new THREE.Group();
    this.stars.position.y = HEAD_TOP + 0.25;
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(cachedGeo('stun-star', () => new THREE.ExtrudeGeometry(starShape(0.09, 0.04), { depth: 0.02, bevelEnabled: false })), toon('#ffd23f', { emissive: '#ffb000', emissiveIntensity: 0.4 }));
      const a = (i / 3) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
      this.stars.add(st);
    }
    this.stars.visible = false;
    this.root.add(this.stars);

    this.hat = null;
    this.glasses = null;
    this.mouth = null;
    this.tag = null;
    this.carry = new THREE.Group(); // objects held above the head
    this.carry.position.set(0, HEAD_TOP + 0.05, 0.25);
    this.pivot.add(this.carry);

    this.anim = {
      phase: 0, time: Math.random() * 10, blink: 2 + Math.random() * 3, land: 0, tumble: 0,
      emote: null, emoteT: 0, mood: null, lastGrounded: true, armsUp: 0,
    };
    this.setCosmetic(cosmetic);
  }

  setCosmetic(c) {
    const color = BODY_COLORS[c.color] || BODY_COLORS[0];
    this.cosmetic = c;
    this.colorHex = color.hex;
    this.bodyMat.color.set(color.hex);
    this.bellyMat.color.set(shade(color.hex, 0.45));
    this.footMat.color.set(shade(color.hex, -0.45));
    if (this.hat) this.hatAnchor.remove(this.hat);
    this.hat = buildHat(HATS[c.hat]?.id || 'none', color.hex);
    this.hatAnchor.add(this.hat);
    if (this.glasses) this.glassesAnchor.remove(this.glasses);
    this.glasses = buildGlasses(GLASSES[c.glasses]?.id || 'none');
    this.glassesAnchor.add(this.glasses);
    if (this.mouth) this.mouthAnchor.remove(this.mouth);
    this.mouth = buildMouth(FACES[c.face]?.id || 'smile');
    this.mouthAnchor.add(this.mouth);
  }

  setNameTag(name, seat, show = true) {
    if (this.tag) { this.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    this.tag = null;
    if (!show) return;
    this.tag = makeNameTag(name, seat, this.colorHex);
    this.tag.position.y = HEAD_TOP + 0.75;
    this.root.add(this.tag);
  }

  emote(id) {
    this.anim.emote = id;
    this.anim.emoteT = 0;
  }

  // s: { speed, vy, grounded, knocked, stunned, celebrate, sad, carrying, dashing, frozen }
  update(dt, s = {}) {
    const a = this.anim;
    a.time += dt;
    const speed = s.speed || 0;
    const run = clamp(speed / 6.5, 0, 1.4);
    const grounded = s.grounded !== false;
    a.phase += dt * (4 + speed * 1.6) * (grounded ? 1 : 0.3);

    // Landing squash
    if (grounded && !a.lastGrounded) a.land = 1;
    a.lastGrounded = grounded;
    a.land = Math.max(0, a.land - dt * 5);

    let sy = 1, sxz = 1, bob = 0, lean = 0;
    let armL = 0, armR = 0, armZ = 0, footL = 0, footR = 0;
    let tumble = 0, yawWiggle = 0, hop = 0;

    if (grounded) {
      bob = Math.abs(Math.sin(a.phase)) * 0.09 * Math.min(run, 1);
      lean = 0.16 * Math.min(run, 1.2);
      footL = Math.sin(a.phase) * 0.75 * Math.min(run, 1);
      footR = -footL;
      armL = -footL * 1.1;
      armR = footL * 1.1;
      if (run < 0.05) {
        // idle breathing
        sy = 1 + Math.sin(a.time * 2.2) * 0.025;
        sxz = 1 - Math.sin(a.time * 2.2) * 0.012;
      }
    } else {
      const up = (s.vy || 0) > 0;
      sy = up ? 1.1 : 0.98;
      sxz = up ? 0.94 : 1.01;
      armZ = up ? 1.2 : 1.9 + Math.sin(a.time * 22) * 0.35;
      footL = 0.5; footR = -0.3;
    }
    if (a.land > 0) {
      sy *= 1 - a.land * 0.22;
      sxz *= 1 + a.land * 0.16;
    }
    if (s.knocked) {
      a.tumble += dt * 14;
      tumble = a.tumble;
      armZ = 2.2;
    } else {
      a.tumble = 0;
    }
    if (s.dashing) { lean = 0.55; sxz *= 0.95; sy *= 0.95; }
    if (s.carrying) { armZ = Math.max(armZ, 2.7); armL = armR = 0; }

    // Moods override when standing still (results, celebrations, eliminations).
    const mood = s.mood || (s.celebrate ? 'celebrate' : null);
    if (mood === 'celebrate') {
      hop = Math.abs(Math.sin(a.time * 7)) * 0.45;
      armZ = 2.6 + Math.sin(a.time * 14) * 0.2;
      sy = 1 + Math.sin(a.time * 14) * 0.05;
    } else if (mood === 'happy') {
      hop = Math.abs(Math.sin(a.time * 5)) * 0.15;
      armZ = 1.2 + Math.sin(a.time * 10) * 0.3;
    } else if (mood === 'sad') {
      lean = 0.35;
      sy = 0.94;
      armZ = -0.2;
    }

    // Emotes
    if (a.emote) {
      a.emoteT += dt;
      const t = a.emoteT;
      switch (a.emote) {
        case 'wave':
          armR = 0; armZ = 0;
          this.arms[1].rotation.set(0, 0, 2.5 + Math.sin(t * 14) * 0.45);
          break;
        case 'dance':
          hop = Math.abs(Math.sin(t * 9)) * 0.25;
          yawWiggle = Math.sin(t * 4.5) * 0.6;
          armZ = 1.4 + Math.sin(t * 9) * 0.8;
          break;
        case 'laugh':
          sy = 1 + Math.sin(t * 30) * 0.05;
          lean = -0.25 + Math.sin(t * 15) * 0.05;
          armZ = 0.6;
          break;
        case 'cheer':
          hop = Math.abs(Math.sin(t * 8)) * 0.4;
          armZ = 2.8;
          break;
        case 'sad':
          lean = 0.4; sy = 0.92; armZ = -0.25;
          break;
        case 'taunt':
          yawWiggle = Math.sin(t * 10) * 0.25;
          lean = -0.2;
          armL = -1.6; armZ = 0.3;
          break;
        default:
          break;
      }
      if (t > 2.2) a.emote = null;
    }

    this.pivot.position.y = bob + hop;
    this.pivot.rotation.set(lean + tumble, yawWiggle, 0);
    this.pivot.scale.set(sxz, sy, sxz);
    if (!(a.emote === 'wave')) {
      this.arms[0].rotation.set(armL, 0, -armZ);
      this.arms[1].rotation.set(armR, 0, armZ);
    } else {
      this.arms[0].rotation.set(armL, 0, -armZ);
    }
    this.feet[0].rotation.x = footL;
    this.feet[1].rotation.x = footR;
    this.feet[0].position.y = 0.2 + hop;
    this.feet[1].position.y = 0.2 + hop;

    // Blink
    a.blink -= dt;
    let eyeY = 1;
    if (a.blink < 0) {
      eyeY = 0.1;
      if (a.blink < -0.12) a.blink = 2 + Math.random() * 4;
    }
    if (s.knocked || s.stunned) eyeY = 0.35;
    this.eyes.scale.y = lerp(this.eyes.scale.y, eyeY, Math.min(1, dt * 30));

    this.stars.visible = !!s.stunned;
    if (s.stunned) this.stars.rotation.y += dt * 5;
    if (this.hat && this.hat.userData.spin) this.hat.userData.spin.rotation.y += dt * (8 + speed * 3);
  }

  dispose() {
    this.bodyMat.dispose();
    this.bellyMat.dispose();
    this.footMat.dispose();
    if (this.tag) { this.tag.material.map.dispose(); this.tag.material.dispose(); }
  }
}
