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
  display: '"Fraunces", "Spectral", Georgia, serif',
  serif:   '"Spectral", Georgia, serif',
  sans:    '"Inter Tight", -apple-system, system-ui, sans-serif',
} as const;

export const RED      = 'var(--red)';
export const RED_DARK = 'var(--red-dark)';
export const BELL_BG  = 'var(--bell-bg)';

const TONES = ['#B05A3A','#2F4A2A','#B8893B','#7A4A38','#5D6E54','#C48A5B','#8A9A7B'];
export function avatarColor(name: string): string {
  const seed = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return TONES[seed % TONES.length];
}
