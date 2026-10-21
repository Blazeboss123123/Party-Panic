// Cosmetic options. Cosmetics never change gameplay: every character shares the same
// collision size, speed and jump values regardless of what they wear.

export const BODY_COLORS = [
  { id: 'bubblegum', name: 'Bubblegum', hex: '#ff5da2' },
  { id: 'lagoon', name: 'Lagoon', hex: '#1fc8c1' },
  { id: 'lemon', name: 'Lemon', hex: '#ffd23f' },
  { id: 'tangerine', name: 'Tangerine', hex: '#ff8a3d' },
  { id: 'grape', name: 'Grape', hex: '#8b5cf6' },
  { id: 'lime', name: 'Lime', hex: '#8bdb3c' },
  { id: 'sky', name: 'Sky', hex: '#4da3ff' },
  { id: 'cherry', name: 'Cherry', hex: '#e8364f' },
  { id: 'mint', name: 'Mint', hex: '#7ef0c3' },
  { id: 'cocoa', name: 'Cocoa', hex: '#a86b4c' },
  { id: 'snow', name: 'Snow', hex: '#f2f2f7' },
  { id: 'storm', name: 'Storm', hex: '#5b5f8a' },
];

export const HATS = [
  { id: 'none', name: 'No hat' },
  { id: 'party', name: 'Party cone' },
  { id: 'tophat', name: 'Top hat' },
  { id: 'crown', name: 'Crown' },
  { id: 'propeller', name: 'Propeller cap' },
  { id: 'viking', name: 'Horned helmet' },
  { id: 'chef', name: 'Chef toque' },
  { id: 'flower', name: 'Daisy' },
  { id: 'bunny', name: 'Bunny ears' },
  { id: 'cone', name: 'Traffic cone' },
  { id: 'beanie', name: 'Bobble beanie' },
];

export const GLASSES = [
  { id: 'none', name: 'No glasses' },
  { id: 'round', name: 'Round specs' },
  { id: 'shades', name: 'Shades' },
  { id: 'star', name: 'Star frames' },
  { id: 'visor', name: 'Visor' },
  { id: 'monocle', name: 'Monocle' },
];

export const FACES = [
  { id: 'smile', name: 'Smile' },
  { id: 'grin', name: 'Big grin' },
  { id: 'cat', name: 'Cat mouth' },
  { id: 'wow', name: 'Wow' },
];

export function defaultCosmetic(index) {
  return {
    color: index % BODY_COLORS.length,
    hat: (index * 3 + 1) % HATS.length,
    glasses: index % 3 === 0 ? 0 : (index % GLASSES.length),
    face: index % FACES.length,
  };
}

export function sanitizeCosmetic(c, fallbackIndex = 0) {
  const d = defaultCosmetic(fallbackIndex);
  if (!c || typeof c !== 'object') return d;
  const pick = (v, len, def) => (Number.isInteger(v) && v >= 0 && v < len ? v : def);
  return {
    color: pick(c.color, BODY_COLORS.length, d.color),
    hat: pick(c.hat, HATS.length, d.hat),
    glasses: pick(c.glasses, GLASSES.length, d.glasses),
    face: pick(c.face, FACES.length, d.face),
  };
}

// Team colours used by team minigames (distinct from body colours by pattern as well as hue).
export const TEAMS = [
  { id: 0, name: 'Team Sunburst', short: 'Sunburst', hex: '#ff9f1c', symbol: '☀' },
  { id: 1, name: 'Team Tidal', short: 'Tidal', hex: '#2ec4f1', symbol: '≈' },
];
