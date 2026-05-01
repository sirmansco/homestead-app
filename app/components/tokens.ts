export const G = {
  bg:        'var(--bg)',
  paper:     'var(--paper)',
  ink:       'var(--ink)',
  ink2:      'var(--ink2)',
  muted:     'var(--muted)',
  hairline:  'var(--hairline)',
  hairline2: 'var(--hairline2)',
  green:     'var(--green)',
  greenSoft: 'var(--green-soft)',
  clay:      'var(--clay)',
  claySoft:  'var(--clay-soft)',
  mustard:   'var(--mustard)',
  cream:     'var(--cream)',
  display: '"Libre Caslon Text", Georgia, serif',
  serif:   '"Libre Caslon Text", Georgia, serif',
  sans:    '"Inter", -apple-system, system-ui, sans-serif',
} as const;

export const RED      = 'var(--red)';
export const RED_DARK = 'var(--red-dark)';
export const BELL_BG  = 'var(--bell-bg)';

const TONES = ['#A03B2A','#4A5340','#D9A441','#7A6A4F','#5A7040','#C48A5B','#8A9A7B'];
export function avatarColor(name: string): string {
  const seed = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return TONES[seed % TONES.length];
}
