// Cue colours for warnings and good/bad feedback. With "Colour-accessible cues" on, the
// red/green pairs switch to an orange/blue pair that stays distinct for the common forms of
// colour blindness, and minigames add symbols where colour would otherwise carry meaning.
import { settings } from '../settings.js';

export const colourAssist = () => !!settings.get().colourAssist;

export function cue(kind) {
  const a = colourAssist();
  switch (kind) {
    case 'danger': return a ? '#e66100' : '#ff2d55';
    case 'dangerSoft': return a ? '#ffc08a' : '#ffb3c6';
    case 'good': return a ? '#5ab4ff' : '#3ddc97';
    default: return '#ffffff';
  }
}
