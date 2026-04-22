/**
 * Format a stored user "name" value for display.
 *
 * The DB may hold:
 * - A real full name ("Matt Sirmans") — return "Matt S."
 * - An email address ("matt.sirmans@gmail.com") — return "Matt Sirmans"
 * - A slug / username ("mjsirmans" or "matt.sirmans") — title-case it
 * - A single lowercase token ("matt") — capitalize
 *
 * The same logic runs server-side in API normalisation and client-side for
 * display consistency. Keep them in sync.
 */
export function shortName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return '';

  // Email — take local part, split on . or _, title-case each segment
  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0];
    return local.split(/[._]/).filter(Boolean)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }

  // Slug with dots/underscores ("matt.sirmans" or "matt_sirmans")
  if (!trimmed.includes(' ') && /[._]/.test(trimmed)) {
    return trimmed.split(/[._]/).filter(Boolean)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    // Single token — title-case if lowercase, otherwise leave alone
    if (trimmed === trimmed.toLowerCase()) {
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
    return trimmed;
  }

  // Multi-word name — "First L."
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase();
  return lastInitial ? `${first} ${lastInitial}.` : first;
}
